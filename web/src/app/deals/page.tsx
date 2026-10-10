"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerGate } from "@/components/owner-session";
import { OwnerNav } from "@/components/owner-nav";
import type { DealDetail, DealRow, PulseResult, TimelineEvent } from "@/lib/deals";

const money = (v: number | null, cur: string | null) =>
  v === null ? "–" : `${cur ?? ""} ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`.trim();

function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const STATUS_TONE: Record<string, string> = {
  D: "bg-paper text-muted", P: "bg-accent-soft text-accent", S: "bg-accent-soft text-accent",
  V: "bg-warn-soft text-warn", A: "bg-good/10 text-good", R: "bg-bad/10 text-bad",
};

const TEMP_TONE: Record<string, string> = { H: "bg-bad text-white", W: "bg-warn text-white", C: "bg-muted text-white" };

export default function Deals() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <OwnerNav current="deals" />
      <header className="mb-8 border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Nebula · Deals</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">The rooms you weren&apos;t in</h1>
        <p className="mt-2 max-w-2xl text-muted">
          After a proposal leaves, the customer&apos;s people read it and ask Nebula questions. Here is who showed up,
          what they asked, what they simulated and what needs you.
        </p>
      </header>
      <OwnerGate>
        <DealsBoard />
      </OwnerGate>
    </main>
  );
}

function DealsBoard() {
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/deals", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDeals(d.deals);
        const first = (d.deals as DealRow[]).find((x) => x.opens > 0) ?? d.deals[0];
        if (first) setSelected(first.proposal_code);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-bad">{error}</p>;
  if (!deals) return <div className="h-64 animate-pulse rounded-2xl bg-card" />;
  if (!deals.length) return <p className="text-muted">No proposals yet. Turn a meeting into one first.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <ul className="space-y-2">
        {deals.map((d) => (
          <li key={d.proposal_code}>
            <button onClick={() => setSelected(d.proposal_code)}
              className={`w-full rounded-xl border p-4 text-left transition ${selected === d.proposal_code ? "border-accent bg-card shadow-sm" : "border-line bg-card/60 hover:bg-card"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.company_name}</p>
                  <p className="text-xs text-muted">{d.proposal_code} · {money(d.monthly_total, d.currency)}/mo</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[d.status_code] ?? "bg-paper text-muted"}`}>
                  {d.status_label}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                {d.distinct_viewers} {d.distinct_viewers === 1 ? "person" : "people"} · {d.questions} questions · {d.simulations} simulations
                {d.escalations > 0 && <span className="text-warn"> · {d.escalations} for you</span>}
              </p>
              <p className="mt-1 text-[11px] text-muted">Last activity {ago(d.last_activity_at)}</p>
            </button>
          </li>
        ))}
      </ul>
      {selected && <DealView key={selected} code={selected} />}
    </div>
  );
}

function DealView({ code }: { code: string }) {
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState<PulseResult | null>(null);
  const [reading, setReading] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/deals/${code}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDetail(d);
      })
      .catch((e) => setError(e.message));
  }, [code]);
  useEffect(load, [load]);

  async function readRoom() {
    setReading(true);
    setError(null);
    try {
      const r = await fetch(`/api/deals/${code}/pulse`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPulse(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  if (error && !detail) return <p className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-bad">{error}</p>;
  if (!detail) return <div className="h-96 animate-pulse rounded-2xl bg-card" />;
  const { deal, stakeholders, timeline, room_path } = detail;
  const inMeeting = stakeholders.filter((s) => s.attended_meeting);
  const newFaces = stakeholders.filter((s) => !s.attended_meeting && s.opens > 0);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">{deal.company_name}</h2>
            <p className="text-sm text-muted">
              {deal.proposal_code} · {money(deal.monthly_total, deal.currency)} per month · {deal.status_label}
              {deal.sent_at && <> · sent {ago(deal.sent_at)}</>}
            </p>
          </div>
          <div className="flex gap-2">
            {room_path && (
              <a href={room_path} target="_blank" rel="noreferrer"
                className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">Open room ↗</a>
            )}
            <button onClick={readRoom} disabled={reading || timeline.length === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {reading ? "Reading the room…" : pulse ? "Read again" : "Read the room"}
            </button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile n={deal.distinct_viewers} label="people opened it" sub={`${deal.viewers_not_in_meeting} weren't in the meeting`} />
          <Tile n={deal.questions} label="questions" />
          <Tile n={deal.simulations} label="price simulations" />
          <Tile n={deal.escalations} label="need you" tone={deal.escalations > 0 ? "warn" : undefined} />
        </div>
        {timeline.length === 0 && (
          <p className="mt-4 text-sm text-muted">Nobody has opened this room yet. When they do, every question shows up here.</p>
        )}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </div>

      {pulse && <PulseCard p={pulse} />}

      {(newFaces.length > 0 || inMeeting.length > 0) && (
        <div className="rounded-2xl border border-line bg-card p-6">
          <h3 className="font-serif text-xl">People</h3>
          <div className="mt-3 divide-y divide-line">
            {stakeholders.map((s) => (
              <div key={s.stakeholder_code} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.stakeholder_name}
                    {!s.attended_meeting && s.opens > 0 && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">new face</span>}
                  </p>
                  <p className="text-xs text-muted">{[s.title, s.role_category_label, s.attended_meeting_label].filter(Boolean).join(" · ")}</p>
                </div>
                <p className="text-xs text-muted">
                  {s.opens > 0 ? `${s.opens} visits · ${s.questions} questions${s.simulations ? ` · simulated ${s.last_simulated_users ?? "?"} users` : ""} · ${ago(s.last_activity_at)}` : "hasn't opened it"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-6">
          <h3 className="font-serif text-xl">What happened in the room</h3>
          <ol className="mt-4 space-y-4 border-l border-line pl-5">
            {timeline.map((e, i) => <Event key={i} e={e} />)}
          </ol>
        </div>
      )}
    </section>
  );
}

function Tile({ n, label, sub, tone }: { n: number; label: string; sub?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${tone === "warn" ? "bg-warn-soft" : "bg-paper"}`}>
      <p className={`font-serif text-3xl ${tone === "warn" ? "text-warn" : ""}`}>{n}</p>
      <p className="text-xs text-muted">{label}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

const DOT: Record<string, string> = { OP: "bg-muted", QU: "bg-accent", SI: "bg-good", ES: "bg-warn", RE: "bg-ink" };

function Event({ e }: { e: TimelineEvent }) {
  const p = e.payload as Record<string, unknown>;
  const inputs = (p.inputs ?? {}) as Record<string, unknown>;
  let body: React.ReactNode = null;
  if (e.event_type_code === "QU") body = <p className="mt-1">“{String(p.question ?? "")}”</p>;
  if (e.event_type_code === "SI")
    body = <p className="mt-1">Tried {inputs.users ? `${inputs.users} users` : "another scenario"} → {money(Number(p.monthly_total), String(p.currency ?? ""))} per month</p>;
  if (e.event_type_code === "ES") body = <p className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-sm">{String(p.reason ?? "")}</p>;
  if (e.event_type_code === "OP") body = p.is_new_stakeholder ? <p className="mt-1 text-sm text-muted">First visit</p> : null;
  return (
    <li className="relative">
      <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${DOT[e.event_type_code] ?? "bg-muted"}`} />
      <p className="text-xs text-muted">
        {when(e.created_at)} · <span className="font-medium text-ink">{e.stakeholder_name ?? "Visitor"}</span>
        {e.role_category_label && <> · {e.role_category_label}</>}
        {e.attended_meeting_label && <> · {e.attended_meeting_label}</>} · {e.event_type_label}
      </p>
      {body}
    </li>
  );
}

function PulseCard({ p }: { p: PulseResult }) {
  const x = p.pulse;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(x.follow_up.subject)}&body=${encodeURIComponent(x.follow_up.body)}`;
  const flagged = p.unverified_evidence.length + p.unverified_numbers.length;
  return (
    <div className="rounded-2xl border-2 border-accent/30 bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${TEMP_TONE[x.temperature]}`}>{p.temperature_label}</span>
        <p className="font-serif text-xl">{x.headline}</p>
      </div>

      <div className="mt-5 rounded-xl bg-accent-soft p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your next move</p>
        <p className="mt-1 text-lg font-medium">{x.next_action.action}</p>
        <p className="mt-1 text-sm text-muted">With {x.next_action.who}. {x.next_action.why}</p>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {x.engaged.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Who is engaged</p>
            <ul className="mt-2 space-y-3">
              {x.engaged.map((e, i) => (
                <li key={i}>
                  <p className="font-medium">{e.name} <span className="font-normal text-muted">· {e.role}</span></p>
                  <p className="text-sm">{e.cares_about}</p>
                  <p className="mt-1 border-l-2 border-accent/40 pl-2 text-sm italic text-muted">“{e.evidence}”</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-5">
          {x.risks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Risks</p>
              <ul className="mt-2 space-y-3">
                {x.risks.map((r, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium">{r.risk}</p>
                    <p className="mt-1 border-l-2 border-warn/50 pl-2 text-sm italic text-muted">“{r.evidence}”</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {x.silent.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">In the meeting, silent since</p>
              <p className="mt-1 text-sm">{x.silent.join(", ")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Follow-up draft · {x.follow_up.subject}</p>
          <div className="flex gap-2">
            <button onClick={() => navigator.clipboard.writeText(x.follow_up.body)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink">Copy</button>
            <a href={gmail} target="_blank" rel="noreferrer" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white">Open in Gmail</a>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{x.follow_up.body}</p>
      </div>

      <p className={`mt-4 text-xs ${flagged ? "text-warn" : "text-good"}`}>
        {flagged
          ? `Check before using: ${[...p.unverified_evidence.map((q) => `“${q}” was not found in the room data`), ...p.unverified_numbers.map((n) => `${n} is not in the data`)].join(" · ")}`
          : "Every quote and number above was checked against the room data."}
      </p>
    </div>
  );
}
