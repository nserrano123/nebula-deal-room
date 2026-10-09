"use client";

import { use, useEffect, useRef, useState } from "react";

type Ctx = { proposal: Record<string, unknown>; person: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean; meta?: { attack_label: string; verdict: string; verdict_label: string } };

const ROLES = [
  ["EX", "Executive"],
  ["FI", "Finance"],
  ["OP", "Operations"],
  ["IT", "IT"],
  ["OT", "Other"],
] as const;

export default function Room({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ ctx: Ctx; sig: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", title: "", role: "EX" });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/room/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setProposal(d.proposal);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/room/${token}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setJoined({ ctx: { proposal: d.proposal, person: d.person }, sig: d.sig });
      await send("Hello", { ctx: { proposal: d.proposal, person: d.person }, sig: d.sig }, true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string, session = joined, hidden = false) {
    if (!session || !text.trim()) return;
    const next: Msg[] = [...msgs, { role: "user", content: text, hidden }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/room/${token}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...session, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsgs([...next, { role: "assistant", content: d.reply, meta: d }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8 sm:px-8">
      <header className="mb-6 border-b border-line pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Proposal room</p>
        <h1 className="mt-1 font-serif text-3xl">
          {proposal ? `${proposal.company_name} · ${proposal.proposal_code}` : "Nebula"}
        </h1>
        {proposal && (
          <p className="mt-1 text-sm text-muted">
            From {String(proposal.tenant_name)} · {String(proposal.owner_name)} · You are talking to an AI agent
          </p>
        )}
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-bad">{error}</p>
      )}

      {proposal && !joined && (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-6">
          <p className="leading-relaxed">{String(proposal.narrative ?? "")}</p>
          <p className="pt-2 text-sm text-muted">Tell us who you are so the agent can brief you for your role.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="rounded-lg border border-line px-3 py-2" placeholder="Your name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="rounded-lg border border-line px-3 py-2" placeholder="Email (optional)" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="rounded-lg border border-line px-3 py-2" placeholder="Title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className="rounded-lg border border-line px-3 py-2" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(([c, l]) => <option key={c} value={c}>{c} · {l}</option>)}
            </select>
          </div>
          <button onClick={join} disabled={busy || form.name.trim().length < 2}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-40">
            {busy ? "Opening…" : "Enter the room"}
          </button>
        </section>
      )}

      {joined && (
        <>
          <div className="flex-1 space-y-3">
            {msgs.map((m, i) => m.hidden ? null : (
              <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
                <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 leading-relaxed ${m.role === "user" ? "bg-accent text-white" : "border border-line bg-card"}`}>
                  {m.content}
                </div>
                {m.meta && m.meta.verdict !== "allowed" && (
                  <p className="mt-1 text-xs text-warn">Shield: {m.meta.attack_label || m.meta.verdict_label} · {m.meta.verdict_label}</p>
                )}
              </div>
            ))}
            {busy && <div className="h-12 w-40 animate-pulse rounded-2xl bg-card" />}
            <div ref={end} />
          </div>
          <form className="sticky bottom-4 mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the proposal…"
              className="flex-1 rounded-lg border border-line bg-card px-3 py-3 outline-none focus:border-accent" />
            <button disabled={busy || !input.trim()} className="rounded-lg bg-accent px-5 font-medium text-white disabled:opacity-40">Send</button>
          </form>
        </>
      )}
    </main>
  );
}
