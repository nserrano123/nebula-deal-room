"use client";

import { use, useEffect, useRef, useState } from "react";
import { ProposalDocument, detectLang, type ProposalDoc } from "@/components/proposal-document";

type Ctx = { proposal: Record<string, unknown>; person: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean; meta?: { attack_label: string; verdict: string; verdict_label: string } };

const ROLES = {
  es: [["EX", "Dirección / Gerencia"], ["FI", "Finanzas"], ["OP", "Operaciones"], ["IT", "Tecnología"], ["OT", "Otro"]],
  en: [["EX", "Executive"], ["FI", "Finance"], ["OP", "Operations"], ["IT", "IT"], ["OT", "Other"]],
} as const;

const L = {
  es: {
    room: "Sala de propuesta", pdf: "Descargar PDF", ask: "¿Preguntas sobre la propuesta?",
    askSub: (o: string) => `Nuestro agente de IA le responde con la información de esta propuesta y le simula otros escenarios. Lo que no sepa, se lo consulta a ${o}.`,
    name: "Su nombre", email: "Correo (opcional)", title: "Cargo", enter: "Hablar con el agente", opening: "Abriendo…",
    placeholder: "Escriba su pregunta…", send: "Enviar", ai: "Está hablando con un agente de IA",
  },
  en: {
    room: "Proposal room", pdf: "Download PDF", ask: "Questions about this proposal?",
    askSub: (o: string) => `Our AI agent answers from this proposal and can simulate other scenarios. Anything it doesn't know goes to ${o}.`,
    name: "Your name", email: "Email (optional)", title: "Title", enter: "Talk to the agent", opening: "Opening…",
    placeholder: "Ask about the proposal…", send: "Send", ai: "You are talking to an AI agent",
  },
};

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

  // Block body on purpose: newer browsers return a Promise from scrollIntoView,
  // and React would try to call it as the effect's cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

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
      await send(lang === "es" ? "Hola" : "Hello", { ctx: { proposal: d.proposal, person: d.person }, sig: d.sig }, true);
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

  const lang = proposal ? detectLang(String(proposal.narrative ?? "")) : "en";
  const t = L[lang];
  const doc: ProposalDoc | null = proposal
    ? {
        proposal_code: String(proposal.proposal_code), company_name: String(proposal.company_name),
        tenant_name: String(proposal.tenant_name), owner_name: String(proposal.owner_name),
        narrative: String(proposal.narrative ?? ""), quote: proposal.quote as ProposalDoc["quote"],
        issued_at: (proposal.sent_at as string | null) ?? null,
      }
    : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-0 print:p-0">
      <div className="mb-4 flex items-center justify-between text-xs print:hidden">
        <p className="font-semibold uppercase tracking-[0.2em] text-accent">Nebula · {t.room}</p>
        {doc && <button onClick={() => window.print()} className="rounded-lg border border-line bg-card px-3 py-1.5 text-muted hover:text-ink">{t.pdf}</button>}
      </div>

      {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-bad">{error}</p>}
      {!doc && !error && <div className="h-96 animate-pulse rounded-2xl bg-card" />}
      {doc && <ProposalDocument doc={doc} lang={lang} />}

      {doc && (
        <section className="mt-8 rounded-2xl border border-line bg-card p-6 print:hidden">
          <h2 className="font-serif text-2xl">{t.ask}</h2>
          <p className="mt-1 text-sm text-muted">{t.askSub(doc.owner_name)}</p>

          {!joined && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-line px-3 py-2" placeholder={t.name} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="rounded-lg border border-line px-3 py-2" placeholder={t.email} value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <input className="rounded-lg border border-line px-3 py-2" placeholder={t.title} value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <select className="rounded-lg border border-line px-3 py-2" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES[lang].map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              </div>
              <button onClick={join} disabled={busy || form.name.trim().length < 2}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-40">
                {busy ? t.opening : t.enter}
              </button>
            </div>
          )}

          {joined && (
            <div className="mt-4">
              <p className="mb-3 text-xs text-muted">{t.ai}</p>
              <div className="space-y-3">
                {msgs.map((m, i) => m.hidden ? null : (
                  <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[90%]"}>
                    <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 leading-relaxed ${m.role === "user" ? "bg-accent text-white" : "bg-paper"}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && <div className="h-12 w-40 animate-pulse rounded-2xl bg-paper" />}
                <div ref={end} />
              </div>
              <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.placeholder}
                  className="flex-1 rounded-lg border border-line bg-card px-3 py-3 outline-none focus:border-accent" />
                <button disabled={busy || !input.trim()} className="rounded-lg bg-accent px-5 font-medium text-white disabled:opacity-40">{t.send}</button>
              </form>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
