// Brief → draft proposal → owner approval → live room.
// Postgres prices the deal; Claude writes the words; code checks every number the text uses.
import { proposalWriterAgent, proposalWriterInstructions } from "@/mastra/agents/proposal-writer";
import { NebulaError, TENANT_CODE, callFn, query } from "./db";
import { productFacts } from "./room-db";

export type Counts = { users?: number | null; employees?: number | null; legal_entities?: number | null; vehicles?: number | null };

type Quote = {
  lines: { concept_name: string; quantity: number; unit_price: number; subtotal: number; currency: string; recurrence_label: string; note: string | null }[];
  totals: { total: number; currency: string; recurrence_label: string }[];
  flags: unknown[];
  per_vehicle?: { monthly_per_vehicle: number; vehicles: number; currency: string } | null;
  [k: string]: unknown;
};

/** Numbers in the text that do not appear anywhere in the quote (ignores small counts like "3 to 4 months"). */
export function findUnverifiedNumbers(text: string, quote: Quote): string[] {
  const allowed = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") allowed.add(String(Math.round(v * 100) / 100));
    else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) allowed.add(String(Number(v)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(quote);
  const found = text.match(/\$?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?|\$?\d+(?:\.\d+)?%?/g) ?? [];
  const out = new Set<string>();
  for (const raw of found) {
    if (raw.endsWith("%")) { out.add(raw); continue; } // the quote never contains percentages offered to the buyer
    const n = Number(raw.replace(/[$,]/g, ""));
    if (!Number.isFinite(n) || (n <= 12 && !raw.startsWith("$"))) continue; // small counts: months, steps, years
    if (n >= 1900 && n <= 2100 && !raw.startsWith("$")) continue;           // years
    if (!allowed.has(String(Math.round(n * 100) / 100))) out.add(raw);
  }
  return [...out];
}

export async function draftProposal(brief_code: string, counts: Counts = {}) {
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (Object.values(counts).some(has)) {
    await callFn("fn_confirm_brief_counts", [
      TENANT_CODE, brief_code, counts.users ?? null, counts.employees ?? null, counts.legal_entities ?? null, counts.vehicles ?? null,
    ]);
  }
  const created = await callFn<{ proposal_code: string; company_name: string; public_token: string; quote: Quote }>(
    "fn_create_proposal", [TENANT_CODE, brief_code],
  );

  const [ctx] = await query<{ owner_name: string; tenant_name: string; brief: Record<string, unknown> }>(
    `select t.owner_name, t.name as tenant_name,
            jsonb_build_object('summary', b.summary, 'needs', b.needs, 'objections', b.objections,
                               'wow_moments', b.wow_moments, 'buying_signals', b.buying_signals,
                               'open_questions', b.open_questions) as brief
       from nebula.meeting_brief b join nebula.tenant t on t.id = b.tenant_id
      where t.code = $1 and b.code = $2`,
    [TENANT_CODE, brief_code],
  );
  if (!ctx) throw new NebulaError(`Deal brief ${brief_code} does not exist.`);

  const facts = await productFacts();
  const result = await proposalWriterAgent.generate(
    [{
      role: "user",
      content: `Deal brief:\n${JSON.stringify(ctx.brief)}\n\nQuote (from Postgres, the only source of numbers):\n${JSON.stringify(created.quote)}\n\nProduct facts:\n${JSON.stringify(facts)}\n\nWrite the proposal.`,
    }],
    { instructions: proposalWriterInstructions({ owner_name: ctx.owner_name, tenant_name: ctx.tenant_name, company_name: created.company_name }) },
  );
  const narrative = result.text.trim();
  await callFn("fn_set_narrative", [TENANT_CODE, created.proposal_code, narrative]);

  return {
    proposal_code: created.proposal_code,
    company_name: created.company_name,
    quote: created.quote,
    narrative,
    unverified_numbers: findUnverifiedNumbers(narrative, created.quote),
  };
}

export async function approveAndSend(proposal_code: string, approved_by: string, narrative?: string) {
  if (narrative && narrative.trim()) await callFn("fn_set_narrative", [TENANT_CODE, proposal_code, narrative.trim()]);
  const approved = await callFn<{ public_token: string }>("fn_approve_proposal", [TENANT_CODE, proposal_code, approved_by]);
  await callFn("fn_mark_sent", [TENANT_CODE, proposal_code]);
  return { proposal_code, room_path: `/room/${approved.public_token}` };
}
