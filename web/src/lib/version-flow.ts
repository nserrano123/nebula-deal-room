// A proposal already sent + new meetings → the next version.
// The model reads and writes; prices come from the previous version or the owner's price list,
// and Postgres does every sum. Code checks quotes and numbers before the owner sees the draft.
import { proposalImporterAgent, proposalUpdaterAgent, importerInstructions, updaterInstructions } from "@/mastra/agents/proposal-versions";
import { extractBrief, normalize, findUnverifiedQuotes } from "./deal-brief-flow";
import { NebulaError, TENANT_CODE, callFn, getCatalog, query } from "./db";
import { findUnverifiedNumbers } from "./proposal-flow";
import { productFacts } from "./room-db";
import { importSchema, versionSchema, type ImportedProposal, type VersionDraft } from "./version-schema";

type QuoteLine = { line_no: number; kind_code: "L" | "D"; concept_code: string; concept_name: string; description: string | null;
  quantity: number; unit_price: number | null; subtotal: number | null; currency: string; recurrence_code: "M" | "O";
  price_pending: boolean; discount_pct?: number };
export type ManualQuote = { lines: QuoteLine[]; totals: { total: number; currency: string; recurrence_code: string }[];
  terms: Record<string, unknown>; pending_prices: number };

// ---------------------------------------------------------------------
// 1. Import a proposal that was already sent (PDF)
// ---------------------------------------------------------------------
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text).replace(/[ \t]+\n/g, "\n").trim();
}

/** Lines and discounts in the shape fn_manual_quote takes. When the printed lines already include
 *  the discount, the list price is recovered (net ÷ (1 − %)) and checked against the printed total. */
export function toQuoteInput(p: Pick<ImportedProposal, "lines" | "discounts" | "lines_include_discount">) {
  const lines = p.lines.map((l) => {
    const d = p.discounts.find((x) => x.currency === l.currency && x.recurrence_code === l.recurrence_code);
    const price = p.lines_include_discount && d && l.unit_price != null
      ? Math.round((l.unit_price / (1 - d.discount_pct / 100)) * 100) / 100
      : l.unit_price;
    return { ...l, unit_price: price };
  });
  return [...lines, ...p.discounts.map((d) => ({ kind: "D", ...d }))];
}

export async function readProposalPdf(bytes: Uint8Array) {
  const text = await pdfToText(bytes);
  if (text.length < 300) throw new NebulaError("The PDF has almost no text (it may be a scanned image). Export it again as text.");
  const [tenant] = await query<{ name: string; owner_name: string }>(`select name, owner_name from nebula.tenant where code = $1`, [TENANT_CODE]);
  const result = await proposalImporterAgent.generate([{ role: "user", content: text }], {
    instructions: importerInstructions(tenant),
    // The schema is too large for strict (grammar-constrained) output: JSON by prompt, still validated with zod.
    structuredOutput: { schema: importSchema, jsonPromptInjection: true },
    modelSettings: { maxOutputTokens: 16000 },
  });
  if (!result.object) throw new Error("The model did not return the proposal. Try again.");
  const proposal = importSchema.parse(result.object);

  // Postgres computes the totals from what was read; they must match what the document prints.
  const quote = await callFn<ManualQuote>("fn_manual_quote", [JSON.stringify(toQuoteInput(proposal)), JSON.stringify(proposal.terms)]);
  const mismatches = proposal.stated_totals.flatMap((s) => {
    const c = quote.totals.find((t) => t.currency === s.currency && t.recurrence_code === s.recurrence_code);
    return c && Math.abs(Number(c.total) - s.total) < 1 ? [] : [`${s.currency} ${s.recurrence_code === "M" ? "monthly" : "one-time"}: the document says ${s.total}, the lines add up to ${c?.total ?? 0}`];
  });
  // Every price and percentage that was read must be printed in the document.
  const printed = numbersIn(text);
  const read = [
    ...proposal.lines.map((l) => [l.concept_name, l.unit_price] as const),
    ...proposal.discounts.map((d) => [d.concept_name, d.discount_pct] as const),
    ...proposal.terms.payment_schedule.map((s) => [s.label, s.pct] as const),
  ];
  const missing_numbers = read.filter(([, v]) => v != null && v !== 0 && !printed.has(Number(v))).map(([k, v]) => `${k}: ${v}`);
  return { proposal, quote, mismatches, missing_numbers, text_chars: text.length };
}

/** All numbers printed in a document, read both as 1.234.567,89 (es-CO) and 1,234,567.89 (en-US). */
export function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const raw of text.match(/\d[\d.,]*/g) ?? []) {
    const t = raw.replace(/[.,]$/, "");
    const es = Number(t.replace(/\./g, "").replace(",", "."));
    const en = Number(t.replace(/,/g, ""));
    if (Number.isFinite(es)) out.add(es);
    if (Number.isFinite(en)) out.add(en);
  }
  return out;
}

export async function saveImported(p: ImportedProposal, opportunity_code?: string | null) {
  return callFn<{ proposal_code: string; opportunity_code: string; company_name: string }>("fn_import_proposal", [
    TENANT_CODE, p.company_name, p.external_ref, p.issued_on,
    JSON.stringify(toQuoteInput(p)), JSON.stringify(p.terms), p.narrative,
    JSON.stringify(p.prepared_for), opportunity_code ?? null,
  ]);
}

// ---------------------------------------------------------------------
// 2. Add a new meeting to an existing deal
// ---------------------------------------------------------------------
export function meetingDateFromTitle(title: string | null): string | null {
  const m = title?.match(/(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "12"}:${m[5] ?? "00"}:00-05:00`;
}

export async function addMeeting(opportunity_code: string, transcript: string, meeting_at: string | null) {
  const catalog = await getCatalog();
  const brief = await extractBrief(catalog, transcript);
  const plan = catalog.plans.some((p) => p.plan_code === brief.plan_code) ? brief.plan_code : catalog.plans[0]?.plan_code;
  const saved = await callFn<{ brief_code: string; company_name: string }>("fn_save_brief", [
    TENANT_CODE, opportunity_code, plan, transcript, JSON.stringify(brief),
  ]);
  if (meeting_at) await callFn("fn_set_brief_meeting_at", [TENANT_CODE, saved.brief_code, meeting_at]);
  return { brief_code: saved.brief_code, meeting_at, summary: brief.summary, unverified_quotes: findUnverifiedQuotes(brief, transcript) };
}

// ---------------------------------------------------------------------
// 3. Draft the next version
// ---------------------------------------------------------------------
type Parent = { proposal_code: string; version: number; opportunity_code: string; company_name: string; external_ref: string | null;
  narrative: string; quote: ManualQuote; prepared_for: unknown; sent_at: string | null; status_code: string };

export async function latestVersion(opportunity_code: string): Promise<Parent> {
  const [p] = await query<Parent>(
    `select p.code as proposal_code, p.version, o.code as opportunity_code, o.company_name, p.external_ref,
            p.narrative, p.quote, p.prepared_for, p.sent_at, p.status as status_code
       from nebula.proposal p join nebula.opportunity o on o.id = p.opportunity_id join nebula.tenant t on t.id = p.tenant_id
      where t.code = $1 and o.code = $2 and p.audit_status = 'A' and p.status in ('S','V','A','R')
      order by p.version desc limit 1`,
    [TENANT_CODE, opportunity_code],
  );
  if (!p) throw new NebulaError(`Deal ${opportunity_code} has no sent proposal to update.`);
  return p;
}

/** Prices the model may use: the previous version's and the owner's price list. Anything else becomes pending. */
export function enforcePrices(draft: VersionDraft, parent: ManualQuote, priceItems: { code: string; price: number; currency: string }[]) {
  const previous = new Map(parent.lines.filter((l) => l.kind_code === "L").map((l) => [l.concept_code, l]));
  const fixes: string[] = [];
  const lines = draft.lines.map((l) => {
    if (l.unit_price == null) return { ...l, price_source: "pending" as const };
    const prev = previous.get(l.concept_code);
    const okPrev = prev && Number(prev.unit_price) === l.unit_price && prev.currency === l.currency;
    const okItem = priceItems.some((i) => Number(i.price) === l.unit_price && i.currency === l.currency);
    if (okPrev || okItem) return l;
    fixes.push(`${l.concept_name}: ${l.currency} ${l.unit_price} is not in the previous version or the price list; left pending.`);
    return { ...l, unit_price: null, price_source: "pending" as const };
  });
  const prevSchedule = JSON.stringify((parent.terms.payment_schedule as { pct: number }[] | undefined)?.map((s) => s.pct) ?? []);
  const newSchedule = JSON.stringify(draft.terms.payment_schedule.map((s) => s.pct));
  const terms = prevSchedule !== "[]" && prevSchedule !== newSchedule
    ? { ...draft.terms, payment_schedule: (parent.terms.payment_schedule as { label: string; pct: number }[]) }
    : draft.terms;
  if (terms !== draft.terms) fixes.push("The payment schedule was kept as in the previous version.");
  return { lines, terms, fixes };
}

export async function draftVersion(opportunity_code: string, brief_codes: string[], owner_notes: string) {
  const parent = await latestVersion(opportunity_code);
  const [tenant] = await query<{ name: string; owner_name: string }>(`select name, owner_name from nebula.tenant where code = $1`, [TENANT_CODE]);
  const meetings = await query<{ brief_code: string; meeting_at: string; transcript: string; brief: Record<string, unknown> }>(
    `select b.code as brief_code, b.meeting_at, b.transcript,
            jsonb_build_object('summary', b.summary, 'needs', b.needs, 'objections', b.objections,
                               'wow_moments', b.wow_moments, 'buying_signals', b.buying_signals, 'open_questions', b.open_questions) as brief
       from nebula.meeting_brief b join nebula.tenant t on t.id = b.tenant_id join nebula.opportunity o on o.id = b.opportunity_id
      where t.code = $1 and o.code = $2 and b.code = any($3::text[]) order by b.meeting_at`,
    [TENANT_CODE, opportunity_code, brief_codes],
  );
  if (meetings.length !== brief_codes.length) throw new NebulaError(`Some meetings do not belong to ${parent.company_name}.`);
  const [{ items }] = await query<{ items: { code: string; name: string; price: number; currency: string; confirmed: boolean }[] }>(
    `select nebula.fn_price_items($1) as items`, [TENANT_CODE]);
  const facts = await productFacts();

  const input = {
    previous_version: { proposal_code: parent.proposal_code, version: parent.version, external_ref: parent.external_ref, sent_at: parent.sent_at,
      lines: parent.quote.lines, terms: parent.quote.terms, totals: parent.quote.totals, text: parent.narrative, prepared_for: parent.prepared_for },
    meetings_since: meetings.map((m) => ({ brief_code: m.brief_code, meeting_at: m.meeting_at, brief: m.brief, transcript: m.transcript })),
    price_list: items, product_facts: facts, today: new Date().toISOString().slice(0, 10),
    owner_instructions: owner_notes || "Keep the commercial conditions of the previous version.",
  };
  const result = await proposalUpdaterAgent.generate(
    [{ role: "user", content: `${JSON.stringify(input)}\n\nPrepare version ${parent.version + 1}.` }],
    { instructions: updaterInstructions({ owner_name: tenant.owner_name, tenant_name: tenant.name, company_name: parent.company_name }),
      structuredOutput: { schema: versionSchema, jsonPromptInjection: true },
      modelSettings: { maxOutputTokens: 20000 } },
  );
  if (!result.object) throw new Error("The model did not return the new version. Try again.");
  const draft = versionSchema.parse(result.object);

  const { lines, terms, fixes } = enforcePrices(draft, parent.quote, items);
  const quoteInput = [...lines.map((l) => { const { price_source, ...rest } = l; void price_source; return rest; }), ...draft.discounts.map((d) => ({ kind: "D", ...d }))];
  const created = await callFn<{ proposal_code: string; version: number; quote: ManualQuote; changes: unknown[] }>("fn_create_version", [
    TENANT_CODE, parent.proposal_code, brief_codes, JSON.stringify(quoteInput), JSON.stringify(terms),
    JSON.stringify(draft.changes), draft.narrative, draft.prepared_for.length ? JSON.stringify(draft.prepared_for) : null,
  ]);

  const haystack = normalize(meetings.map((m) => m.transcript).join("\n"));
  const unverified_quotes = draft.changes.filter((c) => c.request_quote && !haystack.includes(normalize(c.request_quote))).map((c) => c.request_quote!);
  const allowed = { quote: created.quote, items, parent: parent.quote };
  return {
    proposal_code: created.proposal_code, version: created.version, parent_proposal_code: parent.proposal_code,
    company_name: parent.company_name, quote: created.quote, changes: created.changes, narrative: draft.narrative,
    owner_questions: draft.owner_questions, price_fixes: fixes, unverified_quotes,
    unverified_numbers: findUnverifiedNumbers(`${draft.narrative}\n${draft.changes.map((c) => c.after_text).join("\n")}`, allowed as never),
  };
}

export async function repriceVersion(proposal_code: string, lines: unknown[], terms: unknown | null) {
  return callFn<{ quote: ManualQuote; changes: unknown[] }>("fn_set_version_pricing", [
    TENANT_CODE, proposal_code, JSON.stringify(lines), terms == null ? null : JSON.stringify(terms),
  ]);
}

/** Deals with a sent proposal that can get a new version, plus their meetings without a version yet. */
export async function updatableDeals() {
  return query<{ opportunity_code: string; company_name: string; proposal_code: string; version: number; external_ref: string | null;
    sent_at: string | null; status_label: string; draft_code: string | null }>(
    `select distinct on (o.id) o.code as opportunity_code, o.company_name, p.code as proposal_code, p.version, p.external_ref,
            p.sent_at, nebula.fn_label('proposal_status', p.status) as status_label,
            (select d.code from nebula.proposal d where d.parent_proposal_id = p.id and d.status in ('D','P') and d.audit_status = 'A' limit 1) as draft_code
       from nebula.proposal p join nebula.opportunity o on o.id = p.opportunity_id join nebula.tenant t on t.id = p.tenant_id
      where t.code = $1 and p.audit_status = 'A' and p.status in ('S','V','A','R')
      order by o.id, p.version desc`,
    [TENANT_CODE],
  );
}

export async function versionDetail(proposal_code: string) {
  const [r] = await query<{ proposal_code: string; version: number; status_code: string; status_label: string; company_name: string;
    opportunity_code: string; narrative: string; quote: ManualQuote; prepared_for: unknown; parent_proposal_code: string | null;
    parent_external_ref: string | null; parent_sent_at: string | null; changes: unknown[]; public_token: string; tenant_name: string; owner_name: string; emails: string[] }>(
    `select p.code as proposal_code, p.version, p.status as status_code, nebula.fn_label('proposal_status', p.status) as status_label,
            o.company_name, o.code as opportunity_code, p.narrative, p.quote, p.prepared_for,
            par.code as parent_proposal_code, par.external_ref as parent_external_ref, par.sent_at as parent_sent_at,
            nebula.fn_proposal_changes(p.id) as changes, p.public_token, t.name as tenant_name, t.owner_name,
            coalesce((select array_agg(distinct s.email) from nebula.stakeholder s where s.opportunity_id = o.id and s.email is not null and s.audit_status = 'A'), '{}') as emails
       from nebula.proposal p join nebula.opportunity o on o.id = p.opportunity_id join nebula.tenant t on t.id = p.tenant_id
       left join nebula.proposal par on par.id = p.parent_proposal_id
      where t.code = $1 and p.code = $2 and p.audit_status = 'A'`,
    [TENANT_CODE, proposal_code],
  );
  if (!r) throw new NebulaError(`Proposal ${proposal_code} does not exist.`);
  return r;
}

/** Meetings of a deal, marking those that no version has answered yet. */
export async function dealMeetings(opportunity_code: string) {
  return query<{ brief_code: string; meeting_at: string; summary: string | null; used: boolean }>(
    `select b.code as brief_code, b.meeting_at, b.summary,
            exists (select 1 from nebula.proposal_brief pb where pb.brief_id = b.id)
            or exists (select 1 from nebula.proposal p where p.brief_id = b.id) as used
       from nebula.meeting_brief b join nebula.opportunity o on o.id = b.opportunity_id join nebula.tenant t on t.id = b.tenant_id
      where t.code = $1 and o.code = $2 and b.audit_status = 'A'
      order by b.meeting_at`,
    [TENANT_CODE, opportunity_code],
  );
}
