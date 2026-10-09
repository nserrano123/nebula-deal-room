"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerGate } from "@/components/owner-session";

type Stats = {
  clickhouse: boolean;
  rooms: { proposal_code: string; company_name: string; revoked: boolean; path: string }[];
  totals?: { events: number; tenants: number; proposals: number; attacks: number; blocked: number; leaks: number };
  timeline?: { minute: string; legit: number; attacks: number }[];
  by_class?: { attack_class: string; attack_label: string; events: number; visitors: number }[];
  live?: { ts: string; visitor_name: string; proposal_code: string; attack_label: string; verdict: string; verdict_label: string; text: string }[];
  detections?: { ts: string; rule_label: string; severity: string; proposal_code: string; hits: number; action: string; detail: string }[];
  query_ms?: number;
  error?: string;
};

type AttackRun = {
  target: string;
  link_guesses: number;
  results: { id: string; goal: string; prompt: string; reply?: string; attack_label?: string; verdict?: string; verdict_label?: string; leaked?: string[]; error?: string; latency_ms?: number }[];
};

type DetectRun = {
  scanned: number;
  query_ms: number;
  detections: { rule_label: string; severity: string; proposal_code: string; visitor_name: string; hits: number; action: string; detail: string }[];
};

const fmt = (n: number) => n.toLocaleString("en-US");
const SEV = { critical: "bg-bad text-white", high: "bg-warn text-white", medium: "bg-warn-soft text-warn" } as Record<string, string>;

export default function Shield() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <OwnerGate>
        <ShieldDashboard />
      </OwnerGate>
    </main>
  );
}

function ShieldDashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [attack, setAttack] = useState<AttackRun | null>(null);
  const [det, setDet] = useState<DetectRun | null>(null);

  const [key] = useState(""); // owner auth travels in an httpOnly cookie

  const load = useCallback(async () => {
    const r = await fetch("/api/shield/stats", { cache: "no-store", headers: { "x-shield-key": key } });
    setS(await r.json());
  }, [key]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function act(name: string, url: string, body: unknown, done: (d: never) => void) {
    setBusy(name);
    setNote(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-shield-key": key }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      done(d as never);
      await load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const t = s?.totals;
  const peak = Math.max(1, ...(s?.timeline ?? []).map((m) => m.legit + m.attacks));

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Nebula Shield</p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Defending agents that talk to strangers</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Every visitor message, tool call and answer from the proposal rooms streams into ClickHouse. Detection
            rules run as SQL over the last 15 minutes; a hit revokes the proposal link in Postgres.
          </p>
        </div>
        <p className="text-sm text-muted">
          {s?.clickhouse ? `ClickHouse connected · dashboard queries ${s.query_ms ?? "–"} ms` : "ClickHouse not configured"}
        </p>
      </header>

      <section className="mb-6 flex flex-wrap gap-2">
        <Btn busy={busy} name="traffic" onClick={() => act("traffic", "/api/shield/traffic", { n: 1_000_000 }, (d: { inserted: number; ms: number }) => setNote(`${fmt(d.inserted)} events generated inside ClickHouse in ${fmt(d.ms)} ms`))}>
          1 · Simulate 1M room events
        </Btn>
        <Btn busy={busy} name="attack" onClick={() => act("attack", "/api/shield/attack", {}, (d: AttackRun) => setAttack(d))}>
          2 · Run live red team
        </Btn>
        <Btn busy={busy} name="detect" onClick={() => act("detect", "/api/shield/detect", {}, (d: DetectRun) => setDet(d))}>
          3 · Detect and remediate
        </Btn>
        <button disabled={!!busy} onClick={() => act("reset", "/api/shield/reset", { events: true }, () => { setAttack(null); setDet(null); setNote("Links restored and events cleared"); })}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink disabled:opacity-40">
          Reset demo
        </button>
      </section>
      {s?.error && <p className="mb-6 rounded-lg border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">{s.error}</p>}
      {note && <p className="mb-6 rounded-lg bg-accent-soft px-4 py-2 text-sm text-accent">{note}</p>}

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Events (24 h)" value={t ? fmt(t.events) : "–"} />
        <Tile label="Tenants" value={t ? fmt(t.tenants) : "–"} />
        <Tile label="Proposal rooms" value={t ? fmt(t.proposals) : "–"} />
        <Tile label="Attack events" value={t ? fmt(t.attacks) : "–"} tone="warn" />
        <Tile label="Flagged" value={t ? fmt(t.blocked) : "–"} />
        <Tile label="Leaks stopped at output" value={t ? fmt(t.leaks) : "–"} tone={t?.leaks ? "bad" : undefined} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Last 60 minutes · legitimate vs attack events">
          <div className="flex h-40 items-end gap-[2px]">
            {(s?.timeline ?? []).map((m) => (
              <div key={m.minute} className="flex flex-1 flex-col justify-end" title={`${m.minute}: ${m.legit} legit, ${m.attacks} attacks`}>
                <div className="bg-warn" style={{ height: `${(m.attacks / peak) * 100}%`, minHeight: m.attacks ? 2 : 0 }} />
                <div className="bg-accent/60" style={{ height: `${(m.legit / peak) * 100}%` }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted"><span className="text-accent">■</span> legitimate · <span className="text-warn">■</span> attack</p>
        </Card>

        <Card title="Attack types (24 h)">
          <table className="w-full text-sm">
            <tbody>
              {(s?.by_class ?? []).map((c) => (
                <tr key={c.attack_class} className="border-b border-line last:border-0">
                  <td className="py-2">{c.attack_label}</td>
                  <td className="py-2 text-right font-mono">{fmt(c.events)}</td>
                  <td className="py-2 text-right text-muted">{fmt(c.visitors)} visitors</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {det && (
        <Card title={`Detections · scanned ${fmt(det.scanned)} events in ${det.query_ms} ms`} className="mt-6">
          <div className="space-y-2">
            {det.detections.length === 0 && <p className="text-muted">No rule fired in the last 15 minutes.</p>}
            {det.detections.slice(0, 12).map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg bg-paper px-3 py-2 text-sm">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${SEV[d.severity]}`}>{d.severity}</span>
                <span className="font-medium">{d.rule_label}</span>
                <span className="text-muted">{d.proposal_code || d.visitor_name} · {fmt(d.hits)} hits</span>
                <span className={`ml-auto text-xs ${d.action === "revoked" ? "font-semibold text-bad" : "text-muted"}`}>{d.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {attack && (
        <Card title={`Live red team against ${attack.target} · plus ${attack.link_guesses} guessed links`} className="mt-6">
          <div className="space-y-3">
            {attack.results.map((a) => (
              <div key={a.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{a.id}</span>
                  <span className="font-medium">{a.goal}</span>
                  {a.attack_label && <span className="rounded bg-warn-soft px-2 py-0.5 text-xs text-warn">{a.attack_label}</span>}
                  <span className={`ml-auto text-xs ${a.verdict === "leak_blocked" ? "text-bad" : "text-muted"}`}>{a.verdict_label ?? a.error}</span>
                </div>
                <p className="mt-1 text-muted">“{a.prompt}”</p>
                {a.reply && <p className="mt-2 whitespace-pre-wrap border-l-2 border-accent pl-3">{a.reply}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Live room messages">
          <ul className="space-y-2 text-sm">
            {(s?.live ?? []).map((m, i) => (
              <li key={i} className="flex gap-2">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.verdict === "allowed" ? "bg-good" : "bg-warn"}`} />
                <span><span className="font-medium">{m.visitor_name}</span> <span className="text-muted">· {m.proposal_code}</span> — {m.text.slice(0, 120)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Proposal rooms (Postgres)">
          <ul className="space-y-2 text-sm">
            {(s?.rooms ?? []).map((r) => (
              <li key={r.proposal_code} className="flex items-center justify-between gap-2">
                <a className="text-accent underline" href={r.path} target="_blank">{r.proposal_code} · {r.company_name}</a>
                <span className={r.revoked ? "font-semibold text-bad" : "text-good"}>{r.revoked ? "Link revoked" : "Link active"}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Btn({ busy, name, onClick, children }: { busy: string | null; name: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={!!busy} onClick={onClick} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
      {busy === name ? "Working…" : children}
    </button>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl ${tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : ""}`}>{value}</p>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-5 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">{title}</h2>
      {children}
    </section>
  );
}
