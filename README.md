# Nebula

**Your agent in the meeting you're not invited to.**

For founders selling complex B2B products: scale your sales process without being in every room.

## The problem

In B2B, the person who signs is rarely the person you met. After a great call, your contact forwards a PDF to the CFO and the CEO. They see a price without the pain, the context or the moment that made their colleague say "wow." They have questions, and nobody is there to answer. Deals don't die in your meeting. They die in the second meeting: the internal one you're not invited to.

## The insight

The most persuasive thing in any deal is what the buyer's own team said. If your proposal carries their words into the room you can't enter, it sells the way you would.

## The solution

Nebula turns your meeting into a living proposal.

1. **Deal brief.** Minutes after the call, the agent reads the transcript and extracts needs, objections and wow moments, each with the customer's own words and who said them.
2. **Exact proposal.** Pricing comes from your rules in Postgres, never from the model. You approve before anything goes out.
3. **Proposal room.** Anyone at the buyer's company can open the link and talk to your agent. It briefs people who weren't in the meeting, frames the deal for their role (cost for the CFO, rollout for the COO, outcomes for the CEO), quotes what their colleagues said, simulates "what if we're 40 users?", and escalates what it doesn't know.
4. **Deal radar.** It tells you who read the proposal, whether they were in the meeting, what they asked and what's worrying them. Ask in plain English; it answers from your data.

**Design rule:** the model writes words; Postgres decides numbers and facts. Nebula cannot invent a price, a discount or a feature.

## Architecture

| Layer | Tool | Role |
|---|---|---|
| Input | Google Meet transcript | What was said |
| Agent | Mastra + Claude | Deal brief, proposal writer, room host, deal radar |
| Data | Neon Postgres | Pricing rules, product facts, deal memory, stakeholders, signals |
| Customer | assistant-ui | Proposal room chat |
| App | Next.js (`web/`) | Owner console and API routes; Mastra runs in-process |
| Database driver | `@neondatabase/serverless` | One HTTPS request per query, fits Vercel functions |
| Deploy | Vercel | Hosting, with the Neon integration for `DATABASE_URL` |

## Repository

| Path | Contents |
|---|---|
| `sql/01_schema.sql` | Schema `nebula`: tenants, plans, modules, product facts, role focus, opportunities, stakeholders, briefs, proposals, events. Multi-tenant from day one. |
| `sql/02_functions.sql` | Deterministic `fn_quote`, the deal flow functions, the proposal room (`fn_join_room`, `fn_simulate`, `fn_log_event`) and the views for Deal radar. |
| `sql/03_seed_fail_fast.sql` | Customer zero: Fail Fast pricing, modules, role focus and product facts. |
| `sql/04_test_demo_flow.sql` | End-to-end test of the demo script. |
| `prompts/` | The four agent tasks: deal brief, proposal writer, room host, deal radar. |
| `examples/` | Two fictitious meeting transcripts. |
| `web/` | The Nebula app (Next.js + Mastra + Claude). `src/lib/deal-brief-flow.ts` turns a transcript into a saved brief; `src/mastra/` holds the agents. |

## Run the app

```bash
cd web
cp .env.example .env.local   # set DATABASE_URL (pooled, Neon branch) and ANTHROPIC_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

The deal brief flow: Claude extracts the brief with a typed schema, code checks every quote word for word against the transcript (unmatched quotes are flagged in the UI), and one SQL statement creates the opportunity and saves the brief through `fn_save_brief`. If Postgres rejects the brief (for example, an unknown module), the error goes back to the model for one retry; nothing is left half-saved.

## Load into Neon

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/01_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/02_functions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/03_seed_fail_fast.sql
# optional check (leaves test data; re-run 01–03 to reset)
psql "$DATABASE_URL" -f sql/04_test_demo_flow.sql
```

## API surface (what the app calls)

| Step | Who | Function |
|---|---|---|
| Create opportunity | App | `fn_create_opportunity('FF', company)` |
| Save deal brief | Agent → DB | `fn_save_brief('FF', 'OPP-0001', 'TR', transcript, brief_json)` |
| Draft proposal | DB | `fn_create_proposal('FF', 'BRF-0001')` |
| Write text | Agent → DB | `fn_set_narrative('FF', 'PRP-0001', text)` |
| Approve | Human | `fn_approve_proposal('FF', 'PRP-0001', 'Natalia Serrano')` |
| Send | App → DB | `fn_mark_sent('FF', 'PRP-0001')` |
| Open the room | App | `fn_public_proposal(token)`, `fn_product_facts('FF')` |
| Someone enters | App → DB | `fn_join_room(token, name, email, title, role)` |
| Question / escalation | Agent → DB | `fn_log_event(token, 'QU' or 'ES', stakeholder_code, payload)` |
| "What if we're 40?" | Agent → DB | `fn_simulate(token, stakeholder_code, 40)` |
| Seller views | App / Deal radar | `v_proposal_signals`, `v_stakeholder_signals`, `v_deal_timeline`, `v_learning` |
| Outcome | Human | `fn_close_opportunity('FF', 'OPP-0001', 'W', reason)` |

## Scope for October 4

**Must have**
1. Transcript → deal brief, saved in Neon.
2. Proposal with exact pricing → human approval.
3. Proposal room: visitor enters name and role; agent briefs absent stakeholders with colleagues' quotes, answers from facts, simulates, escalates.
4. Per-stakeholder signals.

**Stretch**
5. Deal radar (plain-English questions over the views).
6. AgentMail send and replies.
7. Exa company research.

**Not today** (roadmap): Tavus video avatar in the room, Google Meet bot, CRM sync, learning from won and lost deals.

## Demo script (2 minutes)

1. "I just finished a call with Pacific Freight." Paste the transcript. The brief appears: the wow (AI bank reconciliation), the objection (rollout), and the CEO who wasn't there.
2. The proposal comes out with exact pricing and a warning: 12 users requested, the 15-user minimum applies. Approve.
3. A judge opens the link as **Sarah, the CEO**. Nebula: "Sarah, Mark told us his team spends days every month on reconciliation…"
4. She asks "Do you have projected cash flow?" and Nebula says honestly that it's not available today. "What if we're 40 users?" and Nebula simulates.
5. Ask Deal radar: "What is the CEO worried about?" It answers with what the judge just asked.

## To confirm before the demo

Placeholders marked `[CONFIRM]` in `sql/03_seed_fail_fast.sql`: implementation hourly rate (USD 50), training hours per user (2), base hours per module, complexity multipliers, and the Construction plan minimum and rate.

## Plan for the day (submission 4:30 PM)

| Time | What |
|---|---|
| 9:00–10:00 | Team, load SQL into Neon, repository |
| 10:00–12:00 | Deal brief agent (Mastra + Claude) and proposal generation |
| 12:00–13:00 | Approval console |
| 13:00–14:45 | Proposal room: join form + assistant-ui chat with simulate, escalate, log_question |
| 14:45–15:30 | Stakeholder signals view; Deal radar if time allows |
| 15:30–16:15 | Record backup video, README, description |
| 16:15–16:30 | Submit |

## Nebula Shield (Cyberdefense Hackathon · SF Tech Week, Oct 9 2026)

The proposal room is an AI agent that anyone at the buyer's company can talk to: an attack surface. Nebula Shield defends it in layers and watches it in ClickHouse.

| Layer | Where | What it stops |
|---|---|---|
| Least privilege | Postgres role `nebula_room` (`sql/05_shield.sql`) | The room can only EXECUTE five room functions. No table reads, no other customer, no raw SQL. |
| Token from the URL, never from the model | `web/src/lib/room-db.ts` | The agent cannot switch to another customer's room. |
| Signed session | `web/src/lib/room-turn.ts` | A visitor cannot edit their own context to inject instructions. |
| Hardened instructions | `web/src/mastra/agents/room-host.ts` | Prompt injection, fake owner approval, discount pressure. |
| Output guard | `web/src/lib/guard.ts` | Another customer's name or a secret never leaves the room. |
| Detection | ClickHouse SQL over every room event (`web/src/lib/clickhouse.ts`) | Link guessing, injection bursts, discount squeezes, cross-customer probing, output leaks. |
| Remediation | `fn_revoke_token` in Postgres | A detected attack revokes the proposal link everywhere. |

Dashboard: `/shield`. Demo flow: simulate 1M room events inside ClickHouse → run the live red team (9 real attacks against the real agent + 12 guessed links) → detect and remediate (the attacked link is revoked in Postgres and the room refuses it).

Setup: run `sql/05_shield.sql` and `sql/06_shield_demo_seed.sql`, then set `CLICKHOUSE_URL` (`https://<host>:8443`), `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD`.
