// What happened after the proposal left: the owner's view of every room.
// Reads the reporting views from sql/02_functions.sql; no writes.
import { detectLang } from "@/components/proposal-document";
import { TEMPERATURE_LABELS, dealPulseAgent, dealPulseInstructions, pulseSchema, type Pulse } from "@/mastra/agents/deal-pulse";
import { normalize } from "./deal-brief-flow";
import { NebulaError, TENANT_CODE, query } from "./db";
import { findUnverifiedNumbers } from "./proposal-flow";

export type DealRow = {
  proposal_code: string;
  opportunity_code: string;
  company_name: string;
  status_code: string;
  status_label: string;
  sent_at: string | null;
  opens: number;
  distinct_viewers: number;
  viewers_not_in_meeting: number;
  last_opened_at: string | null;
  questions: number;
  simulations: number;
  escalations: number;
  monthly_total: number | null;
  currency: string | null;
  last_activity_at: string | null;
};

export type Stakeholder = {
  stakeholder_code: string;
  stakeholder_name: string;
  title: string | null;
  role_category_code: string;
  role_category_label: string;
  attended_meeting: boolean;
  attended_meeting_label: string;
  opens: number;
  first_opened_at: string | null;
  last_activity_at: string | null;
  questions: number;
  simulations: number;
  escalations: number;
  questions_asked: string[];
  last_simulated_users: number | null;
};

export type TimelineEvent = {
  created_at: string;
  stakeholder_name: string | null;
  role_category_label: string | null;
  attended_meeting_label: string | null;
  event_type_code: "OP" | "QU" | "SI" | "ES" | "RE";
  event_type_label: string;
  payload: Record<string, unknown>;
};

export type DealDetail = {
  deal: DealRow;
  room_path: string | null;
  stakeholders: Stakeholder[];
  timeline: TimelineEvent[];
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

const DEAL_SELECT = `
  select s.proposal_code, s.opportunity_code, s.company_name, s.status_code, s.status_label, s.sent_at,
         s.opens, s.distinct_viewers, s.viewers_not_in_meeting, s.last_opened_at,
         s.questions, s.simulations, s.escalations,
         (select (x->>'total')::numeric from jsonb_array_elements(p.quote->'totals') x
           where x->>'recurrence_code' = 'M' or x->>'recurrence_label' ilike 'month%' limit 1) as monthly_total,
         (select x->>'currency' from jsonb_array_elements(p.quote->'totals') x
           where x->>'recurrence_code' = 'M' or x->>'recurrence_label' ilike 'month%' limit 1) as currency,
         (select max(e.created_at) from nebula.proposal_event e where e.proposal_id = p.id) as last_activity_at,
         p.public_token
    from nebula.v_proposal_signals s
    join nebula.tenant t   on t.code = s.tenant_code
    join nebula.proposal p on p.tenant_id = t.id and p.code = s.proposal_code
   where s.tenant_code = $1`;

function toDeal(r: Record<string, unknown>): DealRow {
  return {
    proposal_code: String(r.proposal_code),
    opportunity_code: String(r.opportunity_code),
    company_name: String(r.company_name),
    status_code: String(r.status_code),
    status_label: String(r.status_label),
    sent_at: (r.sent_at as string | null) ?? null,
    opens: n(r.opens),
    distinct_viewers: n(r.distinct_viewers),
    viewers_not_in_meeting: n(r.viewers_not_in_meeting),
    last_opened_at: (r.last_opened_at as string | null) ?? null,
    questions: n(r.questions),
    simulations: n(r.simulations),
    escalations: n(r.escalations),
    monthly_total: r.monthly_total === null || r.monthly_total === undefined ? null : Number(r.monthly_total),
    currency: (r.currency as string | null) ?? null,
    last_activity_at: (r.last_activity_at as string | null) ?? null,
  };
}

export async function listDeals(): Promise<DealRow[]> {
  const rows = await query<Record<string, unknown>>(
    `${DEAL_SELECT} order by coalesce((select max(e.created_at) from nebula.proposal_event e where e.proposal_id = p.id), p.sent_at, p.created_at) desc`,
    [TENANT_CODE],
  );
  return rows.map(toDeal);
}

export async function dealDetail(proposal_code: string): Promise<DealDetail> {
  const [row] = await query<Record<string, unknown>>(`${DEAL_SELECT} and s.proposal_code = $2`, [TENANT_CODE, proposal_code]);
  if (!row) throw new NebulaError(`Proposal ${proposal_code} does not exist.`);
  const deal = toDeal(row);

  const [stakeholders, timeline] = await Promise.all([
    query<Record<string, unknown>>(
      `select stakeholder_code, stakeholder_name, title, role_category_code, role_category_label,
              attended_meeting, attended_meeting_label, opens, first_opened_at, last_activity_at,
              questions, simulations, escalations, questions_asked, last_simulated_users
         from nebula.v_stakeholder_signals
        where tenant_code = $1 and opportunity_code = $2
        order by attended_meeting, last_activity_at desc nulls last, stakeholder_name`,
      [TENANT_CODE, deal.opportunity_code],
    ),
    query<TimelineEvent>(
      `select created_at, stakeholder_name, role_category_label, attended_meeting_label,
              event_type_code, event_type_label, payload
         from nebula.v_deal_timeline
        where tenant_code = $1 and proposal_code = $2
        order by created_at`,
      [TENANT_CODE, proposal_code],
    ),
  ]);

  const live = ["S", "V", "A"].includes(deal.status_code) || deal.status_code === "P";
  return {
    deal,
    room_path: live ? `/room/${row.public_token}` : null,
    stakeholders: stakeholders.map((s) => ({
      ...(s as unknown as Stakeholder),
      opens: n(s.opens), questions: n(s.questions), simulations: n(s.simulations), escalations: n(s.escalations),
      last_simulated_users: s.last_simulated_users === null ? null : Number(s.last_simulated_users),
      questions_asked: (s.questions_asked as string[] | null) ?? [],
    })),
    timeline,
  };
}

// ---------------------------------------------------------------------
// Deal pulse: Claude reads the room for the owner. Every quote it cites
// is checked against the data it was given, and so is every number.
// ---------------------------------------------------------------------
export type PulseResult = {
  pulse: Pulse;
  temperature_label: string;
  unverified_evidence: string[];
  unverified_numbers: string[];
  lang: "es" | "en";
};

export async function dealPulse(proposal_code: string): Promise<PulseResult> {
  const detail = await dealDetail(proposal_code);
  const [ctx] = await query<{ owner_name: string; tenant_name: string; narrative: string | null; brief: Record<string, unknown> }>(
    `select t.owner_name, t.name as tenant_name, p.narrative,
            jsonb_build_object('summary', b.summary, 'needs', b.needs, 'objections', b.objections,
                               'wow_moments', b.wow_moments, 'buying_signals', b.buying_signals,
                               'open_questions', b.open_questions) as brief
       from nebula.proposal p
       join nebula.tenant t        on t.id = p.tenant_id
       join nebula.meeting_brief b on b.id = p.brief_id
      where t.code = $1 and p.code = $2`,
    [TENANT_CODE, proposal_code],
  );
  if (!ctx) throw new NebulaError(`Proposal ${proposal_code} does not exist.`);
  const lang = detectLang(ctx.narrative ?? "");

  const data = { deal: detail.deal, stakeholders: detail.stakeholders, timeline: detail.timeline, meeting_brief: ctx.brief };
  const result = await dealPulseAgent.generate(
    [{ role: "user", content: `${JSON.stringify(data)}\n\nRead the room.` }],
    {
      instructions: dealPulseInstructions({ owner_name: ctx.owner_name, tenant_name: ctx.tenant_name, company_name: detail.deal.company_name, lang }),
      structuredOutput: { schema: pulseSchema },
    },
  );
  if (!result.object) throw new Error("The model did not return a reading. Try again.");
  const pulse: Pulse = pulseSchema.parse(result.object);

  const haystack = normalize(JSON.stringify(data));
  const evidence = [...pulse.engaged.map((e) => e.evidence), ...pulse.risks.map((r) => r.evidence)];
  const words = [pulse.headline, ...pulse.engaged.map((e) => e.cares_about), ...pulse.risks.map((r) => r.risk),
    pulse.next_action.action, pulse.next_action.why, pulse.follow_up.body].join("\n");
  return {
    pulse,
    temperature_label: TEMPERATURE_LABELS[pulse.temperature],
    unverified_evidence: evidence.filter((q) => q && !haystack.includes(normalize(q))),
    unverified_numbers: findUnverifiedNumbers(words, data as never),
    lang,
  };
}
