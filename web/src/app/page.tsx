"use client";

import { useEffect, useMemo, useState } from "react";
import { COMPLEXITY_LABELS, ROLE_LABELS, type Brief, type SavedBrief } from "@/lib/brief-schema";

type Catalog = {
  tenant: { code: string; name: string; owner_name: string };
  plans: { plan_code: string; plan_name: string }[];
  modules: { module_code: string; module_name: string }[];
  examples: { id: string; company: string; transcript: string }[];
};

type QuoteCheck = { section: string; index: number; quote: string };
type Result = { saved: SavedBrief; brief: Brief; unverified_quotes: QuoteCheck[]; attempts: number };

export default function Console() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [company, setCompany] = useState("");
  const [plan, setPlan] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [key, setKey] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string | null>(null);

  async function importDoc() {
    setImporting(true);
    setError(null);
    setImported(null);
    try {
      const r = await fetch("/api/transcript", {
        method: "POST",
        headers: { "content-type": "application/json", "x-shield-key": key },
        body: JSON.stringify({ url: docUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTranscript(d.transcript);
      if (d.title && !company) setCompany(String(d.title).split(/\s+-\s+/)[0]);
      setImported(`Imported ${Number(d.chars).toLocaleString("en-US")} characters of transcript.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    let k = new URLSearchParams(window.location.search).get("key") ?? "";
    try { k = k || sessionStorage.getItem("nebula-key") || ""; } catch {}
    setKey(k);
  }, []);

  useEffect(() => {
    fetch("/api/catalog")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setCatalog(data);
        setPlan("");
      })
      .catch((e) => setError(e.message));
  }, []);

  const moduleName = useMemo(() => {
    const m = new Map(catalog?.modules.map((x) => [x.module_code, x.module_name]));
    return (code: string) => m.get(code) ?? code;
  }, [catalog]);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/briefs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-shield-key": key },
        body: JSON.stringify({ company, plan_code: plan, transcript }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Nebula</p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">From meeting to live proposal</h1>
          <p className="mt-2 max-w-xl text-muted">
            Paste the transcript. Nebula extracts what the customer said, with their exact words, and Postgres
            validates it before anything is saved.
          </p>
        </div>
        {catalog && (
          <p className="text-sm text-muted">
            Selling for <span className="font-medium text-ink">{catalog.tenant.name}</span> · owner{" "}
            {catalog.tenant.owner_name}
          </p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Owner key</span>
        <input type="password" value={key} placeholder="SHIELD_ADMIN_KEY"
          onChange={(e) => { setKey(e.target.value); try { sessionStorage.setItem("nebula-key", e.target.value); } catch {} }}
          className="w-64 rounded-lg border border-line bg-card px-3 py-1.5 outline-none focus:border-accent" />
        {!key && <span className="text-warn">Required to import, extract and send.</span>}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="space-y-4">
          {catalog && catalog.examples.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Load an example:</span>
              {catalog.examples.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    setCompany(ex.company);
                    setTranscript(ex.transcript);
                  }}
                  className="rounded-full border border-line bg-card px-3 py-1 hover:border-accent hover:text-accent"
                >
                  {ex.company}
                </button>
              ))}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Prospect company <span className="font-normal text-muted">(optional: read from the meeting)</span></span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Detected from the transcript"
              className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Price plan <span className="font-normal text-muted">(optional)</span></span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-accent"
            >
              <option value="">Auto-detect from the meeting</option>
              {catalog?.plans.map((p) => (
                <option key={p.plan_code} value={p.plan_code}>
                  {p.plan_code} · {p.plan_name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm font-medium">Google Docs link (Gemini meeting notes)</span>
            <div className="mt-1 flex gap-2">
              <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent" />
              <button onClick={importDoc} disabled={importing || !docUrl.trim()}
                className="rounded-lg border border-accent px-3 py-2 text-sm text-accent disabled:opacity-40">
                {importing ? "Reading…" : "Import"}
              </button>
            </div>
            {imported && <p className="mt-1 text-xs text-good">{imported}</p>}
          </div>

          <label className="block">
            <span className="text-sm font-medium">Meeting transcript</span>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={16}
              placeholder="Paste the Google Meet transcript here…"
              className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-accent"
            />
          </label>

          <button
            onClick={submit}
            disabled={busy || !catalog || !key || !transcript.trim()}
            className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white transition disabled:opacity-40"
          >
            {busy ? "Reading the meeting…" : "Extract deal brief"}
          </button>

          {error && <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
        </section>

        <section>
          {!result && !busy && (
            <div className="flex h-full min-h-64 items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center text-muted">
              The brief appears here: needs, objections and wow moments, each with who said it.
            </div>
          )}
          {busy && <div className="h-64 animate-pulse rounded-2xl bg-card" />}
          {result && <BriefView result={result} moduleName={moduleName} />}
          {result && catalog && <ProposalStep result={result} ownerName={catalog.tenant.owner_name} adminKey={key} />}
        </section>
      </div>
    </main>
  );
}

function BriefView({ result, moduleName }: { result: Result; moduleName: (c: string) => string }) {
  const { saved, brief, unverified_quotes } = result;
  const unverified = new Set(unverified_quotes.map((q) => `${q.section}:${q.index}`));
  const facts: [string, number | null][] = [
    ["Users", brief.users_count],
    ["Legal entities", brief.legal_entities_count],
    ["Employees", brief.employees_count],
    ["Vehicles", brief.vehicles_count],
  ];

  return (
    <article className="space-y-6 rounded-2xl border border-line bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl">{saved.company_name}</h2>
        <p className="font-mono text-xs text-muted">
          {saved.brief_code} · {saved.opportunity_code} · {saved.plan_code} {saved.plan_name}
        </p>
      </div>
      <p className="leading-relaxed">{brief.summary}</p>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-paper px-3 py-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={value == null ? "text-warn" : "text-lg font-medium"}>{value ?? "Not stated"}</dd>
          </div>
        ))}
        <div className="rounded-lg bg-paper px-3 py-2">
          <dt className="text-xs text-muted">Complexity</dt>
          <dd className="text-lg font-medium">
            {brief.complexity} · {COMPLEXITY_LABELS[brief.complexity]}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {brief.module_codes.map((m) => (
          <span key={m} className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
            {m} · {moduleName(m)}
          </span>
        ))}
      </div>

      <Section title="People in the room">
        <ul className="flex flex-wrap gap-2">
          {saved.stakeholders.map((s) => (
            <li key={s.stakeholder_code} className="rounded-lg border border-line px-3 py-2 text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="text-muted">
                {" "}
                · {s.role_category_code} {s.role_category_label ?? ROLE_LABELS[s.role_category_code as keyof typeof ROLE_LABELS]}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Wow moments">
        {brief.wow_moments.map((w, i) => (
          <Quote key={i} head={w.moment} sub={`Triggered by: ${w.trigger}`} quote={w.quote} speaker={w.speaker}
            flagged={unverified.has(`wow_moments:${i}`)} tone="accent" />
        ))}
      </Section>

      <Section title="Needs">
        {brief.needs.map((n, i) => (
          <Quote key={i} head={n.need} quote={n.quote} speaker={n.speaker} flagged={unverified.has(`needs:${i}`)} />
        ))}
      </Section>

      <Section title="Objections">
        {brief.objections.map((o, i) => (
          <Quote key={i} head={o.objection} sub={o.handled ? "Handled in the meeting" : "Still open"} quote={o.quote}
            speaker={o.speaker} flagged={unverified.has(`objections:${i}`)} tone={o.handled ? undefined : "warn"} />
        ))}
      </Section>

      {brief.open_questions.length > 0 && (
        <Section title="Open questions">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {brief.open_questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </Section>
      )}

      {brief.buying_signals.length > 0 && (
        <Section title="Buying signals">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {brief.buying_signals.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Quote(props: { head: string; sub?: string; quote: string; speaker: string; flagged: boolean; tone?: "accent" | "warn" }) {
  const border = props.tone === "accent" ? "border-accent" : props.tone === "warn" ? "border-warn" : "border-line";
  return (
    <div className={`border-l-4 ${border} rounded-r-lg bg-paper px-4 py-3`}>
      <p className="font-medium">{props.head}</p>
      {props.sub && <p className="text-xs text-muted">{props.sub}</p>}
      <blockquote className="mt-1 font-serif italic">
        “{props.quote}” <span className="not-italic text-sm text-muted">— {props.speaker}</span>
      </blockquote>
      {props.flagged && (
        <p className="mt-1 inline-block rounded bg-warn-soft px-2 py-0.5 text-xs text-warn">
          Quote not found word for word in the transcript. Check before sending.
        </p>
      )}
    </div>
  );
}

type Draft = {
  proposal_code: string;
  company_name: string;
  narrative: string;
  unverified_numbers: string[];
  quote: {
    lines: { line_no: number; concept_name: string; quantity: number; unit_price: number; subtotal: number; currency: string; recurrence_label: string; note: string | null }[];
    totals: { total: number; currency: string; recurrence_label: string }[];
    flags: unknown[];
    per_vehicle?: { monthly_per_vehicle: number; vehicles: number; currency: string } | null;
  };
};

const money = (n: number, c: string) => `${c} ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function ProposalStep({ result, ownerName, adminKey }: { result: Result; ownerName: string; adminKey: string }) {
  const b = result.brief;
  const [counts, setCounts] = useState({
    users: b.users_count ?? "",
    employees: b.employees_count ?? "",
    legal_entities: b.legal_entities_count ?? "",
    vehicles: b.vehicles_count ?? "",
  } as Record<string, number | string>);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-shield-key": adminKey }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  };

  async function makeDraft() {
    setBusy("draft"); setError(null);
    try {
      const num = (v: number | string) => (v === "" || v === null ? null : Number(v));
      const d: Draft = await post("/api/proposals", {
        brief_code: result.saved.brief_code,
        users: num(counts.users), employees: num(counts.employees),
        legal_entities: num(counts.legal_entities), vehicles: num(counts.vehicles),
      });
      setDraft(d); setText(d.narrative);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function send() {
    if (!draft) return;
    setBusy("send"); setError(null);
    try {
      const d = await post(`/api/proposals/${draft.proposal_code}/send`, { approved_by: ownerName, narrative: text });
      setRoom(d.room_path);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const labels: [string, string][] = [["users", "Users"], ["legal_entities", "Legal entities"], ["employees", "Employees (payroll)"], ["vehicles", "Vehicles"]];

  return (
    <article className="mt-6 space-y-5 rounded-2xl border border-line bg-card p-6">
      <h2 className="font-serif text-2xl">Proposal</h2>

      {!draft && (
        <>
          <p className="text-sm text-muted">Confirm what the meeting left open. Postgres prices the deal from these numbers; the model never does.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {labels.map(([k, l]) => (
              <label key={k} className="text-sm">
                <span className={counts[k] === "" && k === "users" ? "text-warn" : "text-muted"}>{l}</span>
                <input type="number" min={0} value={counts[k]} onChange={(e) => setCounts({ ...counts, [k]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
              </label>
            ))}
          </div>
          <button onClick={makeDraft} disabled={!!busy || counts.users === ""}
            className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-40">
            {busy === "draft" ? "Pricing in Postgres and writing…" : "Draft proposal"}
          </button>
        </>
      )}

      {draft && (
        <>
          <p className="font-mono text-xs text-muted">{draft.proposal_code} · {draft.company_name} · Draft</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Concept</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Subtotal</th><th className="text-right">Billing</th></tr></thead>
            <tbody>
              {draft.quote.lines.map((l) => (
                <tr key={l.line_no} className="border-t border-line">
                  <td className="py-2">{l.concept_name}{l.note && <span className="block text-xs text-muted">{l.note}</span>}</td>
                  <td className="text-right font-mono">{l.quantity}</td>
                  <td className="text-right font-mono">{money(l.unit_price, l.currency)}</td>
                  <td className="text-right font-mono">{money(l.subtotal, l.currency)}</td>
                  <td className="text-right text-muted">{l.recurrence_label}</td>
                </tr>
              ))}
              {draft.quote.totals.map((t) => (
                <tr key={t.recurrence_label} className="border-t-2 border-ink font-medium">
                  <td className="py-2" colSpan={3}>Total · {t.recurrence_label}</td>
                  <td className="text-right font-mono">{money(t.total, t.currency)}</td><td />
                </tr>
              ))}
            </tbody>
          </table>
          {draft.quote.per_vehicle && (
            <p className="text-sm text-muted">Equivalent: {money(draft.quote.per_vehicle.monthly_per_vehicle, draft.quote.per_vehicle.currency)} per vehicle per month ({draft.quote.per_vehicle.vehicles} vehicles)</p>
          )}
          {draft.unverified_numbers.length > 0 && (
            <p className="rounded bg-warn-soft px-3 py-2 text-sm text-warn">
              These numbers in the text are not in the Postgres quote: {draft.unverified_numbers.join(", ")}. Check or edit them before sending.
            </p>
          )}
          <label className="block">
            <span className="text-sm font-medium">Text written by Claude (you can edit it)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} disabled={!!room}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed" />
          </label>
          {!room ? (
            <button onClick={send} disabled={!!busy || !text.trim()} className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white disabled:opacity-40">
              {busy === "send" ? "Approving…" : `Approve as ${ownerName} and open the room`}
            </button>
          ) : (
            <div className="rounded-lg bg-accent-soft px-4 py-3">
              <p className="text-sm text-accent">Approved and sent. Share this link with the customer:</p>
              <a className="break-all font-mono text-sm text-accent underline" href={room} target="_blank">{typeof window !== "undefined" ? window.location.origin : ""}{room}</a>
            </div>
          )}
        </>
      )}
      {error && <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
    </article>
  );
}
