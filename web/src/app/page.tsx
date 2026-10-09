"use client";

import { useEffect, useMemo, useState } from "react";
import { OwnerGate } from "@/components/owner-session";
import { ProposalDocument, detectLang, type Quote } from "@/components/proposal-document";
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
  const key = ""; // owner auth travels in an httpOnly cookie
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

      <OwnerGate>
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
            disabled={busy || !catalog || !transcript.trim()}
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
        </section>
      </div>
      {result && catalog && <ProposalStep result={result} ownerName={catalog.tenant.owner_name} tenantName={catalog.tenant.name} adminKey={key} />}
      </OwnerGate>
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
  quote: Quote;
};

function ProposalStep({ result, ownerName, tenantName, adminKey }: { result: Result; ownerName: string; tenantName: string; adminKey: string }) {
  const b = result.brief;
  const [counts, setCounts] = useState({
    users: b.users_count ?? "",
    employees: b.employees_count ?? "",
    legal_entities: b.legal_entities_count ?? "",
    vehicles: b.vehicles_count ?? "",
  } as Record<string, number | string>);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emails = b.participants.map((p) => p.email).filter(Boolean).join(", ");
  const [to, setTo] = useState(emails);
  const [cc, setCc] = useState("");

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

  async function approve() {
    if (!draft) return;
    setBusy("approve"); setError(null);
    try {
      const d = await post(`/api/proposals/${draft.proposal_code}/approve`, { approved_by: ownerName, narrative: text });
      setRoom(d.room_path); setEditing(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const lang = draft ? detectLang(text) : "en";
  const link = room ? `${typeof window !== "undefined" ? window.location.origin : ""}${room}` : "";
  const subject = draft ? (lang === "es" ? `Propuesta comercial ${tenantName} · ${draft.company_name}` : `${tenantName} proposal · ${draft.company_name}`) : "";
  const firstName = b.participants[0]?.name?.split(" ")[0] ?? "";
  const body = lang === "es"
    ? `Hola${firstName ? ` ${firstName}` : ""}:\n\nGracias por el tiempo en nuestra reunión. Aquí está la propuesta que conversamos:\n\n${link}\n\nEn el mismo enlace usted y su equipo pueden hacer preguntas sobre la propuesta a nuestro agente, y simular otros escenarios. Quedo atenta a sus comentarios.\n\nCordialmente,\n${ownerName}\n${tenantName}`
    : `Hi${firstName ? ` ${firstName}` : ""},\n\nThank you for your time. Here is the proposal we discussed:\n\n${link}\n\nYou and your team can ask our agent questions about it at the same link, and simulate other scenarios.\n\nBest regards,\n${ownerName}\n${tenantName}`;

  async function send() {
    if (!draft) return;
    setBusy("send"); setError(null);
    try {
      await post(`/api/proposals/${draft.proposal_code}/send`, {});
      const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(gmail, "_blank", "noopener");
      setSent(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const labels: [string, string][] = [["users", "Users"], ["legal_entities", "Legal entities"], ["employees", "Employees (payroll)"], ["vehicles", "Vehicles"]];

  if (!draft) {
    return (
      <article className="mt-6 space-y-5 rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Proposal</h2>
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
        {error && <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
      </article>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <span className="font-mono">{draft.proposal_code}</span> · {sent ? "Sent" : room ? "Approved" : "Draft"} · preview as the customer will see it
        </p>
        {!room && (
          <button onClick={() => setEditing(!editing)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
            {editing ? "Done editing" : "Edit text"}
          </button>
        )}
      </div>

      {draft.unverified_numbers.length > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          These numbers in the text are not in the Postgres quote: {draft.unverified_numbers.join(", ")}. Edit them before approving.
        </p>
      )}
      {editing && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14}
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed" />
      )}

      <ProposalDocument doc={{ proposal_code: draft.proposal_code, company_name: draft.company_name, tenant_name: tenantName, owner_name: ownerName, narrative: text, quote: draft.quote }} />

      <div className="sticky bottom-4 rounded-2xl border border-line bg-card p-5 shadow-lg">
        {!room && (
          <button onClick={approve} disabled={!!busy || !text.trim()} className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white disabled:opacity-40">
            {busy === "approve" ? "Approving…" : `Looks good · approve as ${ownerName}`}
          </button>
        )}
        {room && !sent && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Send to the customer</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm"><span className="text-muted">To</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm"><span className="text-muted">Cc</span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
            </div>
            <p className="text-xs text-muted">Subject: {subject}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={send} disabled={!!busy || !to.trim()} className="flex-1 rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-40">
                {busy === "send" ? "Opening…" : "OK, send it"}
              </button>
              <button onClick={() => navigator.clipboard.writeText(link)} className="rounded-lg border border-line px-4 py-3 text-sm">Copy link</button>
              <a href={room} target="_blank" className="rounded-lg border border-line px-4 py-3 text-sm">Preview room</a>
            </div>
            <p className="text-xs text-muted">Opens the email ready in your Gmail; you press Send there. The room opens for the customer at that moment.</p>
          </div>
        )}
        {sent && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-good">Sent. The customer&apos;s room is open.</p>
            <a className="break-all font-mono text-xs text-accent underline" href={room!} target="_blank">{link}</a>
          </div>
        )}
        {error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}
