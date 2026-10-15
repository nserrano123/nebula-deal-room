// The proposal as the customer sees it: one designed page, in the customer's language.
// Every number comes from the Postgres quote; the text comes from the approved narrative.

export type QuoteTerms = {
  validity?: string | null; execution?: string | null; timeline?: string | null;
  payment_schedule?: { label: string; pct: number; amount?: number; currency?: string }[];
  support?: string[]; notes?: string[];
  rates?: { code: string; name: string; unit_label: string; price: number; currency: string }[];
  volume_tiers?: { name: string; price: number | null; currency: string; unit_label: string }[];
};

export type Change = { change_no: number; origin_code: "P" | "R"; kind_code: "A" | "M" | "R" | "C"; topic: string;
  before_text: string | null; after_text: string | null; request_quote: string | null; requested_by: string | null; meeting_at: string | null };

export type Quote = {
  pricing_mode_code?: "M" | "C";
  terms?: QuoteTerms;
  pending_prices?: number;
  lines: { line_no: number; kind_code?: "L" | "D"; concept_code: string; concept_name: string; description?: string | null; quantity: number; unit_price: number | null; subtotal: number | null; currency: string; recurrence_code: string; note: string | null; price_pending?: boolean; discount_pct?: number }[];
  totals: { total: number; currency: string; recurrence_code: string }[];
  tier?: { min_users: number; max_users: number | null; discount_pct: number; list_price: number; unit_price: number; currency: string } | null;
  list_monthly?: { total: number; currency: string } | null;
  payment_options?: { currency: string; monthly: number; twelve_months_monthly: number; annual_months_charged: number; annual_prepaid: number; annual_saving: number } | null;
  benefits?: { code: string; list_price: number; currency: string; discount_pct: number }[];
  commitment_months?: number | null;
  per_vehicle?: { monthly_per_vehicle: number; vehicles: number; currency: string } | null;
  inputs?: { users: number };
};

export type ProposalDoc = {
  proposal_code: string;
  company_name: string;
  tenant_name: string;
  owner_name: string;
  narrative: string;
  quote: Quote;
  issued_at?: string | null;
  version?: number;
  prepared_for?: { name: string; title: string | null }[];
  previous_version?: { proposal_code: string; version: number; external_ref: string | null; sent_at: string | null } | null;
  changes?: Change[];
};

type Lang = "es" | "en";

/** The narrative is written in the customer's language; the page follows it. */
export function detectLang(text: string): Lang {
  const es = (text.match(/\b(el|la|los|las|de|que|para|con|una|por|usted|ustedes|nuestra|propuesta)\b/gi) ?? []).length;
  const en = (text.match(/\b(the|and|for|with|your|our|this|that|you|proposal)\b/gi) ?? []).length;
  return es > en ? "es" : "en";
}

const T = {
  es: {
    eyebrow: "Propuesta comercial", preparedFor: "Preparada para", issued: "Fecha de emisión", validity: "Vigencia",
    validityValue: "30 días calendario", users: "Usuarios", implementation: "Implementación", free: "Sin costo",
    commitment: (m: number) => `con permanencia de ${m} meses`, figure: "La cifra", monthly: "suscripción mensual",
    perUser: "por usuario al mes", listWas: (v: string) => `frente a ${v} de lista`, annual: "pago anual anticipado",
    annualNote: (n: number) => `12 meses de servicio por el valor de ${n}`, oneTime: "inversión inicial",
    proposal: "La propuesta", investment: "Inversión", concept: "Concepto", qty: "Cantidad", unit: "Tarifa", subtotal: "Valor",
    totalMonthly: "Total mensual", totalOneTime: "Total única vez", vsList: (a: string, b: string) => `A tarifa de lista serían ${a} mensuales. Esta propuesta representa ${b} menos cada mes.`,
    included: "Incluido en esta propuesta", edocs: "Documentos electrónicos: facturas, notas, documento soporte, nómina electrónica y eventos de recepción",
    edocsValue: (p: string, d: number) => `${p} por documento · descuento del ${d} %`,
    implWaived: (m: number, v: string) => `Implementación sin costo (valor de referencia ${v}), asociada a una permanencia de ${m} meses.`,
    payment: "Modalidades de pago", modeA: "Mensual", modeB: "Anual anticipado", twelve: "Doce meses de servicio",
    saving: (v: string) => `La modalidad anual representa ${v} menos en el primer año.`,
    tierNote: (a: number, b: string, d: number) => `Tramo de ${a} a ${b} usuarios: ${d} % de descuento por volumen.`,
    perVehicle: (v: string, n: number) => `Equivale a ${v} por vehículo al mes (${n} vehículos).`,
    lic: "Usuarios Full · todos los módulos incluidos", ent: "Empresa adicional", impl: "Implementación y capacitación",
    implW: "Descuento por permanencia", emp: "por empleado", perMonth: "mes", M: "Mensual", O: "Única vez", from: "De", footer: "Propuesta válida por 30 días calendario desde su emisión.",
    version: (n: number) => `Versión ${n}`, updates: (ref: string, d: string) => `Actualiza la propuesta ${ref} del ${d}`,
    whatChanged: "Qué cambió en esta versión", kinds: { A: "Nuevo", M: "Ajustado", R: "Retirado", C: "Aclarado" } as Record<string, string>,
    asked: "Lo que se pidió", cloud: "Servicio en la nube · mensual", implTitle: "Implementación · pago único", pending: "Por definir",
    schedule: "Forma de pago de la implementación", rates: "Tarifas de referencia", tiers: "Opciones por volumen", conditions: "Condiciones",
    validityL: "Vigencia", executionL: "Ejecución", timelineL: "Tiempo de implementación", supportL: "Soporte", notesL: "Notas y condiciones comerciales",
    pendingNote: "Hay valores por definir: esta versión aún no puede enviarse.",
  },
  en: {
    eyebrow: "Commercial proposal", preparedFor: "Prepared for", issued: "Issued", validity: "Valid for",
    validityValue: "30 calendar days", users: "Users", implementation: "Implementation", free: "No cost",
    commitment: (m: number) => `with a ${m}-month commitment`, figure: "The numbers", monthly: "monthly subscription",
    perUser: "per user per month", listWas: (v: string) => `vs. ${v} list price`, annual: "annual prepaid",
    annualNote: (n: number) => `12 months of service for the price of ${n}`, oneTime: "one-time investment",
    proposal: "The proposal", investment: "Investment", concept: "Item", qty: "Qty", unit: "Rate", subtotal: "Amount",
    totalMonthly: "Monthly total", totalOneTime: "One-time total", vsList: (a: string, b: string) => `At list price this would be ${a} per month. This proposal is ${b} less every month.`,
    included: "Included in this proposal", edocs: "Electronic documents: invoices, notes, support documents, payroll and reception events",
    edocsValue: (p: string, d: number) => `${p} per document · ${d}% discount`,
    implWaived: (m: number, v: string) => `Implementation at no cost (reference value ${v}), with a ${m}-month commitment.`,
    payment: "Payment options", modeA: "Monthly", modeB: "Annual prepaid", twelve: "Twelve months of service",
    saving: (v: string) => `Paying annually saves ${v} in the first year.`,
    tierNote: (a: number, b: string, d: number) => `${a}–${b} user tier: ${d}% volume discount.`,
    perVehicle: (v: string, n: number) => `That is ${v} per vehicle per month (${n} vehicles).`,
    lic: "Full users · all modules included", ent: "Additional legal entity", impl: "Implementation and training",
    implW: "Commitment discount", emp: "per employee", perMonth: "month", M: "Monthly", O: "One-time", from: "From", footer: "This proposal is valid for 30 calendar days from issue.",
    version: (n: number) => `Version ${n}`, updates: (ref: string, d: string) => `Updates proposal ${ref} of ${d}`,
    whatChanged: "What changed in this version", kinds: { A: "New", M: "Adjusted", R: "Removed", C: "Clarified" } as Record<string, string>,
    asked: "What was asked", cloud: "Cloud service · monthly", implTitle: "Implementation · one-time", pending: "To be defined",
    schedule: "Implementation payment schedule", rates: "Reference rates", tiers: "Volume options", conditions: "Conditions",
    validityL: "Valid for", executionL: "Delivery", timelineL: "Implementation time", supportL: "Support", notesL: "Notes and commercial conditions",
    pendingNote: "Some values are still to be defined: this version cannot be sent yet.",
  },
};

export function money(n: number, cur: string, lang: Lang) {
  const v = Math.abs(Number(n)).toLocaleString(lang === "es" ? "es-CO" : "en-US", { maximumFractionDigits: 2 });
  return `${Number(n) < 0 ? "– " : ""}${cur} ${v}`;
}

function concept(l: Quote["lines"][number], t: (typeof T)[Lang]) {
  if (l.concept_code.startsWith("LIC-")) return t.lic;
  if (l.concept_code === "ENT-ADD") return t.ent;
  if (l.concept_code === "IMPL") return t.impl;
  if (l.concept_code === "IMPL-WAIVED") return t.implW;
  if (l.concept_code.startsWith("EMP-")) return `${l.concept_name.replace(/ per employee$/, "")} ${t.emp}`;
  return l.concept_name;
}

function Narrative({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-[17px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((x) => /^\s*[-•]\s+/.test(x))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6 marker:text-accent">
              {lines.map((x, j) => <li key={j}>{x.replace(/^\s*[-•]\s+/, "")}</li>)}
            </ul>
          );
        }
        if (lines.length === 1 && b.length < 70 && !/[.:,]$/.test(b)) {
          return <h3 key={i} className="pt-2 font-serif text-xl text-ink">{b.replace(/^#+\s*/, "")}</h3>;
        }
        return <p key={i}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}

export function ProposalDocument({ doc, lang: forced }: { doc: ProposalDoc; lang?: Lang }) {
  if (doc.quote.pricing_mode_code === "M") return <NegotiatedProposal doc={doc} lang={forced ?? detectLang(doc.narrative)} />;
  const lang = forced ?? detectLang(doc.narrative);
  const t = T[lang];
  const q = doc.quote;
  const monthly = q.totals.find((x) => x.recurrence_code === "M");
  const oneTime = q.totals.find((x) => x.recurrence_code === "O");
  const cur = monthly?.currency ?? q.lines[0]?.currency ?? "USD";
  const fmt = (n: number, c = cur) => money(n, c, lang);
  const users = q.inputs?.users ?? q.lines.find((l) => l.concept_code.startsWith("LIC-"))?.quantity;
  const impl = q.lines.find((l) => l.concept_code === "IMPL");
  const waived = q.lines.some((l) => l.concept_code === "IMPL-WAIVED");
  const edoc = q.benefits?.find((b) => b.code === "EDOC");
  const issued = doc.issued_at ? new Date(doc.issued_at) : new Date();
  const dateText = issued.toLocaleDateString(lang === "es" ? "es-CO" : "en-US", { day: "numeric", month: "long", year: "numeric" });

  return (
    <article className="proposal mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-card shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      {/* Cover */}
      <header className="bg-ink px-8 py-10 text-white sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">{doc.tenant_name} · {t.eyebrow}</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">{doc.company_name}</h1>
        <p className="mt-2 font-mono text-xs text-white/50">{doc.proposal_code}</p>
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
          <div><dt className="text-white/50">{t.issued}</dt><dd className="mt-0.5">{dateText}</dd></div>
          <div><dt className="text-white/50">{t.validity}</dt><dd className="mt-0.5">{t.validityValue}</dd></div>
          {users != null && <div><dt className="text-white/50">{t.users}</dt><dd className="mt-0.5">{users}</dd></div>}
          {impl && (
            <div><dt className="text-white/50">{t.implementation}</dt>
              <dd className="mt-0.5">{waived ? t.free : fmt(impl.subtotal ?? 0, impl.currency)}{waived && q.commitment_months ? <span className="block text-white/50">{t.commitment(q.commitment_months)}</span> : null}</dd></div>
          )}
        </dl>
      </header>

      <div className="space-y-12 px-8 py-10 sm:px-12">
        {/* The numbers */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t.figure}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {monthly && (
              <div className="rounded-xl bg-paper p-5">
                <p className="font-serif text-3xl">{fmt(monthly.total)}</p>
                <p className="mt-1 text-sm text-muted">{t.monthly}</p>
              </div>
            )}
            {q.tier ? (
              <div className="rounded-xl bg-paper p-5">
                <p className="font-serif text-3xl">{fmt(q.tier.unit_price)}</p>
                <p className="mt-1 text-sm text-muted">{t.perUser} · <span className="line-through">{fmt(q.tier.list_price)}</span></p>
              </div>
            ) : oneTime ? (
              <div className="rounded-xl bg-paper p-5">
                <p className="font-serif text-3xl">{fmt(oneTime.total, oneTime.currency)}</p>
                <p className="mt-1 text-sm text-muted">{t.oneTime}</p>
              </div>
            ) : null}
            {q.payment_options && (
              <div className="rounded-xl bg-accent-soft p-5">
                <p className="font-serif text-3xl text-accent">{fmt(q.payment_options.annual_prepaid)}</p>
                <p className="mt-1 text-sm text-accent/80">{t.annual} · {t.annualNote(q.payment_options.annual_months_charged)}</p>
              </div>
            )}
          </div>
          {q.per_vehicle && <p className="mt-3 text-sm text-muted">{t.perVehicle(fmt(q.per_vehicle.monthly_per_vehicle, q.per_vehicle.currency), q.per_vehicle.vehicles)}</p>}
        </section>

        {/* Narrative */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t.proposal}</h2>
          <Narrative text={doc.narrative} />
          <p className="mt-6 text-sm text-muted">— {doc.owner_name}, {doc.tenant_name}</p>
        </section>

        {/* Investment */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t.investment}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b-2 border-ink text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t.concept}</th><th className="py-2 pl-6 text-right font-medium">{t.qty}</th>
                  <th className="py-2 pl-6 text-right font-medium">{t.unit}</th><th className="py-2 pl-6 text-right font-medium">{t.subtotal}</th>
                </tr>
              </thead>
              <tbody>
                {q.lines.map((l) => (
                  <tr key={l.line_no} className="border-b border-line align-top">
                    <td className="py-3 pr-4">
                      {concept(l, t)}
                      <span className="block text-xs text-muted">{t[l.recurrence_code as "M" | "O"] ?? ""}
                        {l.concept_code.startsWith("LIC-") && q.tier && q.tier.discount_pct > 0 ? ` · ${t.tierNote(q.tier.min_users, q.tier.max_users?.toString() ?? "+", Number(q.tier.discount_pct))}` : ""}
                        {l.concept_code === "IMPL-WAIVED" && q.commitment_months ? ` · ${t.commitment(q.commitment_months)}` : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-6 text-right font-mono">{l.quantity}</td>
                    <td className="whitespace-nowrap py-3 pl-6 text-right font-mono">{fmt(l.unit_price ?? 0, l.currency)}</td>
                    <td className="whitespace-nowrap py-3 pl-6 text-right font-mono">{fmt(l.subtotal ?? 0, l.currency)}</td>
                  </tr>
                ))}
                {monthly && (
                  <tr className="font-semibold"><td className="pt-4" colSpan={3}>{t.totalMonthly}</td><td className="pt-4 text-right font-mono">{fmt(monthly.total)}</td></tr>
                )}
                {oneTime && (
                  <tr className="font-semibold"><td className="pt-1" colSpan={3}>{t.totalOneTime}</td><td className="pt-1 text-right font-mono">{fmt(oneTime.total, oneTime.currency)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {q.list_monthly && monthly && q.list_monthly.total > monthly.total && (
            <p className="mt-4 text-sm text-muted">{t.vsList(fmt(q.list_monthly.total), fmt(q.list_monthly.total - monthly.total))}</p>
          )}
        </section>

        {/* Included */}
        {(edoc || (impl && waived)) && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t.included}</h2>
            <ul className="space-y-3">
              {impl && waived && q.commitment_months && (
                <li className="rounded-xl border border-line p-4 text-sm">{t.implWaived(q.commitment_months, fmt(impl.subtotal ?? 0, impl.currency))}</li>
              )}
              {edoc && (
                <li className="rounded-xl border border-line p-4 text-sm">
                  <p>{t.edocs}</p>
                  <p className="mt-1 text-muted">{t.edocsValue(money(edoc.list_price, edoc.currency, lang), Number(edoc.discount_pct))}</p>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Payment options */}
        {q.payment_options && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t.payment}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line p-5">
                <p className="text-sm font-semibold">{t.modeA}</p>
                <p className="mt-2 font-serif text-2xl">{fmt(q.payment_options.monthly)}<span className="text-sm text-muted"> / {t.perMonth}</span></p>
                <p className="mt-1 text-sm text-muted">{t.twelve}: {fmt(q.payment_options.twelve_months_monthly)}</p>
              </div>
              <div className="rounded-xl border-2 border-accent p-5">
                <p className="text-sm font-semibold text-accent">{t.modeB}</p>
                <p className="mt-2 font-serif text-2xl">{fmt(q.payment_options.annual_prepaid)}</p>
                <p className="mt-1 text-sm text-muted">{t.annualNote(q.payment_options.annual_months_charged)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">{t.saving(fmt(q.payment_options.annual_saving))}</p>
          </section>
        )}
      </div>

      <footer className="border-t border-line px-8 py-6 text-xs text-muted sm:px-12">
        {doc.tenant_name} · {doc.owner_name} · {t.footer}
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------
// Negotiated proposals (imported or updated versions): the owner's prices,
// Postgres's arithmetic, the customer's requests answered one by one.
// ---------------------------------------------------------------------
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{children}</h2>
);

function NegotiatedProposal({ doc, lang }: { doc: ProposalDoc; lang: Lang }) {
  const t = T[lang];
  const q = doc.quote;
  const terms = q.terms ?? {};
  const loc = lang === "es" ? "es-CO" : "en-US";
  const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }) : "";
  const fmt = (n: number, c: string) => money(n, c, lang);
  const monthly = q.totals.find((x) => x.recurrence_code === "M");
  const oneTime = q.totals.find((x) => x.recurrence_code === "O");
  const users = q.inputs?.users;
  const groups = (["M", "O"] as const).map((rec) => ({ rec, lines: q.lines.filter((l) => l.recurrence_code === rec), total: q.totals.find((x) => x.recurrence_code === rec) }))
    .filter((g) => g.lines.length);
  const requests = (doc.changes ?? []).filter((c) => c.origin_code === "R");
  const prev = doc.previous_version;

  return (
    <article className="proposal mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-card shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="bg-ink px-8 py-10 text-white sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">{doc.tenant_name} · {t.eyebrow}{doc.version ? ` · ${t.version(doc.version)}` : ""}</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">{doc.company_name}</h1>
        <p className="mt-2 font-mono text-xs text-white/50">{doc.proposal_code}</p>
        {prev && <p className="mt-3 text-sm text-white/70">{t.updates(prev.external_ref ?? prev.proposal_code, date(prev.sent_at))}</p>}
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
          {doc.prepared_for && doc.prepared_for.length > 0 && (
            <div className="col-span-2"><dt className="text-white/50">{t.preparedFor}</dt>
              <dd className="mt-0.5">{doc.prepared_for.map((p) => p.title ? `${p.name} · ${p.title}` : p.name).join(" — ")}</dd></div>
          )}
          <div><dt className="text-white/50">{t.issued}</dt><dd className="mt-0.5">{date(doc.issued_at ?? new Date().toISOString())}</dd></div>
          <div><dt className="text-white/50">{t.validity}</dt><dd className="mt-0.5">{terms.validity ?? t.validityValue}</dd></div>
        </dl>
      </header>

      <div className="space-y-12 px-8 py-10 sm:px-12">
        <section>
          <H2>{t.figure}</H2>
          <div className="grid gap-3 sm:grid-cols-3">
            {monthly && <div className="rounded-xl bg-paper p-5"><p className="font-serif text-3xl">{fmt(monthly.total, monthly.currency)}</p><p className="mt-1 text-sm text-muted">{t.monthly}</p></div>}
            {oneTime && <div className="rounded-xl bg-paper p-5"><p className="font-serif text-3xl">{fmt(oneTime.total, oneTime.currency)}</p><p className="mt-1 text-sm text-muted">{t.oneTime}</p></div>}
            {users != null && <div className="rounded-xl bg-accent-soft p-5"><p className="font-serif text-3xl text-accent">{users}</p><p className="mt-1 text-sm text-accent/80">{t.users}</p></div>}
          </div>
          {(q.pending_prices ?? 0) > 0 && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">{t.pendingNote}</p>}
        </section>

        {requests.length > 0 && (
          <section>
            <H2>{t.whatChanged}</H2>
            <ol className="space-y-4">
              {requests.map((c) => (
                <li key={c.change_no} className="rounded-xl border border-line p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">{t.kinds[c.kind_code]}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{c.topic}</p>
                      {c.after_text && <p className="mt-1 text-sm leading-relaxed">{c.after_text}</p>}
                      {c.request_quote && (
                        <p className="mt-2 border-l-2 border-accent/30 pl-3 text-sm italic text-muted">
                          “{c.request_quote}”{c.requested_by ? ` — ${c.requested_by}` : ""}{c.meeting_at ? `, ${date(c.meeting_at)}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <H2>{t.proposal}</H2>
          <Narrative text={doc.narrative} />
          <p className="mt-6 text-sm text-muted">— {doc.owner_name}, {doc.tenant_name}</p>
        </section>

        <section>
          <H2>{t.investment}</H2>
          <div className="space-y-8">
            {groups.map((g) => (
              <div key={g.rec} className="overflow-x-auto">
                <p className="mb-2 text-sm font-semibold">{g.rec === "M" ? t.cloud : t.implTitle}</p>
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-ink text-left text-xs uppercase tracking-wider text-muted">
                      <th className="py-2 font-medium">{t.concept}</th><th className="py-2 pl-6 text-right font-medium">{t.qty}</th>
                      <th className="py-2 pl-6 text-right font-medium">{t.unit}</th><th className="py-2 pl-6 text-right font-medium">{t.subtotal}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((l) => (
                      <tr key={l.line_no} className={`border-b border-line align-top ${l.kind_code === "D" ? "text-good" : ""}`}>
                        <td className="py-3 pr-4">{l.concept_name}{l.description && <span className="block text-xs text-muted">{l.description}</span>}</td>
                        <td className="whitespace-nowrap py-3 pl-6 text-right font-mono">{l.kind_code === "D" ? `${l.discount_pct} %` : l.quantity}</td>
                        <td className="whitespace-nowrap py-3 pl-6 text-right font-mono">{l.kind_code === "D" ? "" : l.price_pending ? <span className="text-warn">{t.pending}</span> : fmt(l.unit_price ?? 0, l.currency)}</td>
                        <td className="whitespace-nowrap py-3 pl-6 text-right font-mono">{l.price_pending ? <span className="text-warn">{t.pending}</span> : fmt(l.subtotal ?? 0, l.currency)}</td>
                      </tr>
                    ))}
                    {g.total && (
                      <tr className="font-semibold"><td className="pt-4" colSpan={3}>{g.rec === "M" ? t.totalMonthly : t.totalOneTime}</td>
                        <td className="whitespace-nowrap pt-4 text-right font-mono">{fmt(g.total.total, g.total.currency)}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        {terms.payment_schedule && terms.payment_schedule.length > 0 && (
          <section>
            <H2>{t.schedule}</H2>
            <div className="grid gap-3 sm:grid-cols-3">
              {terms.payment_schedule.map((s, i) => (
                <div key={i} className="rounded-xl border border-line p-4">
                  <p className="text-sm text-muted">{s.label} · {s.pct} %</p>
                  {s.amount != null && <p className="mt-1 font-serif text-xl">{fmt(s.amount, s.currency ?? oneTime?.currency ?? "")}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {((terms.rates?.length ?? 0) > 0 || (terms.volume_tiers?.length ?? 0) > 0) && (
          <section className="grid gap-6 sm:grid-cols-2">
            {(terms.volume_tiers?.length ?? 0) > 0 && (
              <div>
                <H2>{t.tiers}</H2>
                <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                  {terms.volume_tiers!.map((v, i) => (
                    <li key={i} className="flex justify-between gap-3 px-4 py-2.5"><span>{v.name}</span>
                      <span className="whitespace-nowrap font-mono">{v.price == null ? t.pending : `${fmt(v.price, v.currency)} / ${v.unit_label}`}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {(terms.rates?.length ?? 0) > 0 && (
              <div>
                <H2>{t.rates}</H2>
                <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                  {terms.rates!.map((r) => (
                    <li key={r.code} className="flex justify-between gap-3 px-4 py-2.5"><span>{r.name}</span>
                      <span className="whitespace-nowrap font-mono">{fmt(r.price, r.currency)} / {r.unit_label}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section>
          <H2>{t.conditions}</H2>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {terms.validity && <div><dt className="text-xs uppercase tracking-wider text-muted">{t.validityL}</dt><dd className="mt-1">{terms.validity}</dd></div>}
            {terms.execution && <div><dt className="text-xs uppercase tracking-wider text-muted">{t.executionL}</dt><dd className="mt-1">{terms.execution}</dd></div>}
            {terms.timeline && <div><dt className="text-xs uppercase tracking-wider text-muted">{t.timelineL}</dt><dd className="mt-1">{terms.timeline}</dd></div>}
          </dl>
          {(terms.support?.length ?? 0) > 0 && (
            <div className="mt-5"><p className="text-xs uppercase tracking-wider text-muted">{t.supportL}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm marker:text-accent">{terms.support!.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}
          {(terms.notes?.length ?? 0) > 0 && (
            <div className="mt-5"><p className="text-xs uppercase tracking-wider text-muted">{t.notesL}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm marker:text-accent">{terms.notes!.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}
        </section>
      </div>

      <footer className="border-t border-line px-8 py-6 text-xs text-muted sm:px-12">
        {doc.tenant_name} · {doc.owner_name}{terms.validity ? ` · ${t.validityL}: ${terms.validity}` : ""}
      </footer>
    </article>
  );
}
