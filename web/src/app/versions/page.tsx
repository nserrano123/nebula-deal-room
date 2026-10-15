"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerGate } from "@/components/owner-session";
import { OwnerNav } from "@/components/owner-nav";
import { ProposalDocument, detectLang, money, type Change, type ProposalDoc, type Quote } from "@/components/proposal-document";
import type { ImportedProposal } from "@/lib/version-schema";

type Deal = { opportunity_code: string; company_name: string; proposal_code: string; version: number; external_ref: string | null;
  sent_at: string | null; status_label: string; draft_code: string | null };
type Meeting = { brief_code: string; meeting_at: string; summary: string | null; used: boolean };
type Detail = { proposal_code: string; version: number; status_code: string; status_label: string; company_name: string; opportunity_code: string;
  narrative: string; quote: Quote; prepared_for: ProposalDoc["prepared_for"]; parent_proposal_code: string | null; parent_external_ref: string | null;
  parent_sent_at: string | null; changes: Change[]; public_token: string; tenant_name: string; owner_name: string; emails: string[] };
type DraftInfo = { owner_questions: string[]; price_fixes: string[]; unverified_quotes: string[]; unverified_numbers: string[] };

async function api<T>(url: string, body?: unknown, form?: FormData): Promise<T> {
  const r = await fetch(url, form ? { method: "POST", body: form }
    : body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Request failed.");
  return d as T;
}

const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" }) : "—";

export default function Versions() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <OwnerNav current="versions" />
      <header className="mb-8 border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Nebula · Proposal versions</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">A new meeting, a new version</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Pick a deal that already has a proposal, add the meetings that happened since, and Nebula prepares the next version:
          same prices unless you change them, every request answered with the customer&apos;s own words, and a clear list of what changed.
        </p>
      </header>
      <OwnerGate><Board /></OwnerGate>
    </main>
  );
}

function Board() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [info, setInfo] = useState<DraftInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ deals: Deal[] }>("/api/versions").then((d) => setDeals(d.deals)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (version) return <VersionEditor code={version} info={info} onBack={() => { setVersion(null); setInfo(null); load(); }} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Deals with a proposal</p>
          <button onClick={() => { setImporting(true); setDeal(null); }} className="text-sm text-accent underline">Import a PDF</button>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        {!deals && <div className="h-40 animate-pulse rounded-xl bg-card" />}
        {deals?.map((d) => (
          <button key={d.opportunity_code} onClick={() => { setDeal(d); setImporting(false); }}
            className={`w-full rounded-xl border p-4 text-left ${deal?.opportunity_code === d.opportunity_code ? "border-accent bg-card" : "border-line bg-card/60 hover:bg-card"}`}>
            <p className="font-medium">{d.company_name}</p>
            <p className="text-xs text-muted">Version {d.version} · {d.external_ref ?? d.proposal_code} · {d.status_label} {day(d.sent_at)}</p>
            {d.draft_code && <p className="mt-1 text-xs text-warn">Version in progress: {d.draft_code}</p>}
          </button>
        ))}
      </aside>
      <section>
        {importing && <ImportPdf onSaved={(opp) => { setImporting(false); load(); setDeal({ opportunity_code: opp } as Deal); }} />}
        {deal && !importing && <DealUpdate key={deal.opportunity_code} deal={deal}
          onDraft={(code, i) => { setInfo(i); setVersion(code); }} onOpen={(code) => setVersion(code)} />}
        {!deal && !importing && <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">Choose a deal, or import a proposal you sent outside Nebula.</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
function ImportPdf({ onSaved }: { onSaved: (opportunity_code: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<{ proposal: ImportedProposal; quote: Quote; mismatches: string[]; missing_numbers: string[] } | null>(null);

  async function upload(file: File) {
    setBusy("read"); setError(null); setRead(null);
    const form = new FormData(); form.append("file", file);
    try { setRead(await api("/api/versions/import", undefined, form)); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function save() {
    if (!read) return;
    setBusy("save"); setError(null);
    try { const r = await api<{ opportunity_code: string }>("/api/versions/import/save", { proposal: read.proposal }); onSaved(r.opportunity_code); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const p = read?.proposal;
  const ok = read && !read.mismatches.length && !read.missing_numbers.length;
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-6">
      <h2 className="font-serif text-2xl">Import a proposal you already sent</h2>
      <p className="text-sm text-muted">Nebula reads the PDF, Postgres recomputes its totals, and they must match the document before it is saved as the version the customer has today.</p>
      <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="text-sm" />
      {busy === "read" && <p className="text-sm text-muted">Reading the proposal…</p>}
      {error && <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
      {p && read && (
        <div className="space-y-3">
          <p className="text-sm"><span className="font-medium">{p.company_name}</span> · {p.external_ref ?? "no reference"} · issued {p.issued_on}
            {p.prepared_for.length > 0 && <> · for {p.prepared_for.map((x) => x.name).join(", ")}</>}</p>
          <table className="w-full text-sm">
            <tbody>
              {read.quote.lines.map((l) => (
                <tr key={l.line_no} className="border-b border-line">
                  <td className="py-1.5">{l.concept_name}</td><td className="text-right font-mono">{l.kind_code === "D" ? `${l.discount_pct} %` : l.quantity}</td>
                  <td className="pl-4 text-right font-mono">{money(l.subtotal ?? 0, l.currency, "es")}</td>
                </tr>
              ))}
              {read.quote.totals.map((t) => (
                <tr key={t.currency + t.recurrence_code} className="font-semibold"><td className="pt-2">Total {t.recurrence_code === "M" ? "monthly" : "one-time"}</td><td />
                  <td className="pt-2 text-right font-mono">{money(t.total, t.currency, "es")}</td></tr>
              ))}
            </tbody>
          </table>
          {ok ? <p className="text-sm text-good">The totals match the document and every price was found in it.</p> : (
            <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              {read.mismatches.map((m) => <p key={m}>{m}</p>)}
              {read.missing_numbers.map((m) => <p key={m}>Not found in the PDF: {m}</p>)}
            </div>
          )}
          <button onClick={save} disabled={!!busy || !ok} className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white disabled:opacity-40">
            {busy === "save" ? "Saving…" : "Save as the version the customer has"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function DealUpdate({ deal, onDraft, onOpen }: { deal: Deal; onDraft: (code: string, info: DraftInfo) => void; onOpen: (code: string) => void }) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("Mantener las condiciones comerciales de la versión anterior.");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ meetings: Meeting[] }>(`/api/versions?deal=${deal.opportunity_code}`).then((d) => {
      setMeetings(d.meetings); setPicked(d.meetings.filter((m) => !m.used).map((m) => m.brief_code));
    }).catch((e) => setError(e.message));
  }, [deal.opportunity_code]);
  useEffect(load, [load]);

  async function addMeeting() {
    setBusy("meeting"); setError(null);
    try { await api("/api/versions/meeting", { opportunity_code: deal.opportunity_code, url }); setUrl(""); load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function draft() {
    setBusy("draft"); setError(null);
    try {
      const d = await api<DraftInfo & { proposal_code: string }>("/api/versions/draft", { opportunity_code: deal.opportunity_code, brief_codes: picked, owner_notes: notes });
      onDraft(d.proposal_code, d);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-card p-6">
      <div>
        <h2 className="font-serif text-2xl">{deal.company_name ?? deal.opportunity_code}</h2>
        {deal.proposal_code && <p className="text-sm text-muted">The customer has version {deal.version} ({deal.external_ref ?? deal.proposal_code}), sent {day(deal.sent_at)}.</p>}
      </div>
      {deal.draft_code && (
        <button onClick={() => onOpen(deal.draft_code!)} className="w-full rounded-lg border border-warn px-4 py-3 text-sm text-warn">Open the version in progress ({deal.draft_code})</button>
      )}

      <div>
        <p className="text-sm font-semibold">Meetings since then</p>
        {!meetings && <div className="mt-2 h-16 animate-pulse rounded-lg bg-paper" />}
        <ul className="mt-2 space-y-2">
          {meetings?.map((m) => (
            <li key={m.brief_code}>
              <label className={`flex gap-3 rounded-lg border p-3 text-sm ${m.used ? "border-line opacity-60" : "border-line"}`}>
                <input type="checkbox" disabled={m.used} checked={picked.includes(m.brief_code)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, m.brief_code] : picked.filter((x) => x !== m.brief_code))} />
                <span><span className="font-medium">{day(m.meeting_at)}</span> · <span className="font-mono text-xs">{m.brief_code}</span>{m.used && " · already answered"}
                  {m.summary && <span className="mt-0.5 block text-muted">{m.summary}</span>}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Google Docs link of the meeting notes (Gemini)"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
          <button onClick={addMeeting} disabled={!!busy || !url} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40">
            {busy === "meeting" ? "Reading…" : "Add meeting"}
          </button>
        </div>
      </div>

      <label className="block text-sm"><span className="font-semibold">Your instructions for this version</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
      </label>

      <button onClick={draft} disabled={!!busy || !picked.length || !!deal.draft_code} className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-40">
        {busy === "draft" ? "Reading the meetings and preparing the version… (about a minute)" : `Prepare version ${(deal.version ?? 0) + 1}`}
      </button>
      {error && <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
function VersionEditor({ code, info, onBack }: { code: string; info: DraftInfo | null; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [lines, setLines] = useState<Quote["lines"]>([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/versions/${code}`).then((x) => { setD(x); setLines(x.quote.lines); setText(x.narrative); setTo(x.emails.join(", ")); })
      .catch((e) => setError(e.message));
  }, [code]);
  useEffect(load, [load]);

  if (!d) return error ? <p className="text-bad">{error}</p> : <div className="h-96 animate-pulse rounded-2xl bg-card" />;
  const draft = d.status_code === "D";
  const approved = d.status_code === "P";
  const lang = detectLang(text);
  const link = `${window.location.origin}/room/${d.public_token}`;
  const first = d.prepared_for?.[0]?.name?.split(" ")[0] ?? "";
  const subject = `Propuesta comercial actualizada · ${d.tenant_name} · ${d.company_name} (versión ${d.version})`;
  const body = `Hola${first ? ` ${first}` : ""}:\n\nComo lo conversamos, le comparto la propuesta actualizada (versión ${d.version}). Al inicio encontrará qué cambió frente a la versión anterior y la respuesta a cada punto que se planteó en la reunión.\n\n${link}\n\nEn el mismo enlace usted y su equipo pueden hacer preguntas a nuestro agente sobre la propuesta. Quedo atenta a sus comentarios.\n\nCordialmente,\n${d.owner_name}\n${d.tenant_name}`;

  const post = (url: string, b: unknown) => api(url, b);
  async function reprice() {
    setBusy("price"); setError(null);
    try {
      const items = lines.filter((l) => l.kind_code !== "D").map((l) => ({ concept_code: l.concept_code, concept_name: l.concept_name, description: l.description,
        quantity: l.quantity, unit_price: l.unit_price, currency: l.currency, recurrence_code: l.recurrence_code }));
      const disc = lines.filter((l) => l.kind_code === "D").map((l) => ({ kind: "D", concept_code: l.concept_code, concept_name: l.concept_name,
        discount_pct: l.discount_pct, currency: l.currency, recurrence_code: l.recurrence_code }));
      await post(`/api/versions/${code}/pricing`, { lines: [...items, ...disc], terms: null });
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function approve() {
    setBusy("approve"); setError(null);
    try { await post(`/api/proposals/${code}/approve`, { approved_by: d!.owner_name, narrative: text }); setEditing(false); load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function send() {
    setBusy("send"); setError(null);
    try {
      await post(`/api/proposals/${code}/send`, {});
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
      setSent(true); load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const doc: ProposalDoc = {
    proposal_code: d.proposal_code, company_name: d.company_name, tenant_name: d.tenant_name, owner_name: d.owner_name, narrative: text,
    quote: d.quote, version: d.version, prepared_for: d.prepared_for, changes: d.changes,
    previous_version: d.parent_proposal_code ? { proposal_code: d.parent_proposal_code, version: d.version - 1, external_ref: d.parent_external_ref, sent_at: d.parent_sent_at } : null,
  };
  const priceChanges = d.changes.filter((c) => c.origin_code === "P");
  const pending = d.quote.pending_prices ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="text-sm text-muted underline">← Deals</button>
        <p className="text-sm text-muted"><span className="font-mono">{d.proposal_code}</span> · version {d.version} · {d.status_label}</p>
      </div>

      {info && (info.owner_questions.length > 0 || info.price_fixes.length > 0 || info.unverified_quotes.length > 0 || info.unverified_numbers.length > 0) && (
        <div className="space-y-2 rounded-2xl border-2 border-warn/40 bg-warn-soft p-5 text-sm">
          <p className="font-semibold text-warn">Before you send it</p>
          {info.owner_questions.map((q) => <p key={q}>• {q}</p>)}
          {info.price_fixes.map((q) => <p key={q}>• {q}</p>)}
          {info.unverified_quotes.map((q) => <p key={q}>• This quote was not found word for word in the transcripts: “{q}”</p>)}
          {info.unverified_numbers.length > 0 && <p>• Numbers in the text that are not in the prices: {info.unverified_numbers.join(", ")}</p>}
        </div>
      )}

      {draft && (
        <div className="rounded-2xl border border-line bg-card p-5">
          <p className="text-sm font-semibold">Prices of this version {pending > 0 && <span className="text-warn">· {pending} to define</span>}</p>
          <p className="text-xs text-muted">Edit a quantity or a price and recalculate; Postgres recomputes discounts, totals and the payment schedule.</p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.line_no} className="border-b border-line">
                  <td className="py-1.5 pr-2">{l.concept_name}<span className="ml-1 text-xs text-muted">{l.currency} · {l.recurrence_code === "M" ? "monthly" : "one-time"}</span></td>
                  {l.kind_code === "D" ? <td colSpan={2} className="text-right font-mono">{l.discount_pct} %</td> : (<>
                    <td className="w-20"><input type="number" min={0} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                      className="w-full rounded border border-line px-2 py-1 text-right font-mono" /></td>
                    <td className="w-36 pl-2"><input type="number" min={0} value={l.unit_price ?? ""} placeholder="price"
                      onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: e.target.value === "" ? null : Number(e.target.value) } : x))}
                      className={`w-full rounded border px-2 py-1 text-right font-mono ${l.unit_price == null ? "border-warn bg-warn-soft" : "border-line"}`} /></td>
                  </>)}
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={reprice} disabled={!!busy} className="mt-3 rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-40">{busy === "price" ? "Recalculating…" : "Recalculate"}</button>
          {priceChanges.length > 0 && (
            <div className="mt-4 text-xs text-muted">
              <p className="font-semibold uppercase tracking-wide">Price changes vs. version {d.version - 1} (computed)</p>
              {priceChanges.map((c) => <p key={c.change_no}>{c.kind_code === "A" ? "+" : c.kind_code === "R" ? "−" : "~"} {c.topic}: {c.before_text ?? "—"} → {c.after_text ?? "removed"}</p>)}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        {draft && <button onClick={() => setEditing(!editing)} className="rounded-lg border border-line px-3 py-1.5 text-sm">{editing ? "Done editing" : "Edit text"}</button>}
      </div>
      {editing && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed" />}

      <ProposalDocument doc={doc} lang={lang} />

      <div className="sticky bottom-4 rounded-2xl border border-line bg-card p-5 shadow-lg">
        {draft && (
          <button onClick={approve} disabled={!!busy || pending > 0 || !text.trim()} className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white disabled:opacity-40">
            {pending > 0 ? `Set the ${pending} pending price(s) to approve` : busy === "approve" ? "Approving…" : `Looks good · approve as ${d.owner_name}`}
          </button>
        )}
        {approved && !sent && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm"><span className="text-muted">To</span><input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm"><span className="text-muted">Cc</span><input value={cc} onChange={(e) => setCc(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
            </div>
            <p className="text-xs text-muted">Subject: {subject}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={send} disabled={!!busy || !to.trim()} className="flex-1 rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-40">{busy === "send" ? "Opening…" : "OK, send it"}</button>
              <a href={`/room/${d.public_token}`} target="_blank" className="rounded-lg border border-line px-4 py-3 text-sm">Preview room</a>
            </div>
            <p className="text-xs text-muted">Opens the email in your Gmail; you press Send there. The previous version&apos;s link then points the customer to this one.</p>
          </div>
        )}
        {(sent || ["S", "V"].includes(d.status_code)) && <p className="text-sm font-medium text-good">Sent. <a className="font-mono text-xs text-accent underline" href={`/room/${d.public_token}`} target="_blank">{link}</a></p>}
        {error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}
