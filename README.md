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
4. **Deals: the rooms you weren't in.** Who read the proposal, whether they were in the meeting, what they asked, what they simulated and what needs you. **Read the room** has Claude summarize the deal (hot, warm or cold), name who is engaged with their own words as evidence, flag who went silent, and propose one next move with a follow-up email ready to open in Gmail.

**Design rule:** the model writes words; Postgres decides numbers and facts. Nebula cannot invent a price, a discount or a feature.

## Architecture

| Layer | Tool | Role |
|---|---|---|
| Input | Google Meet transcript | What was said |
| Agent | Mastra + Claude | Deal brief, proposal writer, room host, deal pulse |
| Data | Neon Postgres | Pricing rules, product facts, deal memory, stakeholders, signals |
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
| `prompts/` | The agent tasks: deal brief, proposal writer, room host, deal radar (text-to-SQL, planned), deal pulse. |
| `sql/05`–`09` | Nebula Shield, demo seeds, owner flow, real Fail Fast pricing (volume tiers, implementation waived with commitment, annual = 11 months), the Deals demo (`09`, fictitious Sierra Verde Logistics), proposal versions (`10`) and priced extras (`11`). |
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
| Seller views | Deals page, Deal pulse | `v_proposal_signals`, `v_stakeholder_signals`, `v_deal_timeline`, `v_learning` |
| Outcome | Human | `fn_close_opportunity('FF', 'OPP-0001', 'W', reason)` |

## The owner's three pages

| Page | What it does |
|---|---|
| `/` Meeting → proposal | Import the Google Meet transcript from a Docs link, extract the brief (company and plan detected), confirm counts, draft, edit, approve, and **OK, send it** (opens a prefilled Gmail draft; you press Send). |
| `/versions` New version | Import a proposal you sent outside Nebula (PDF), add the meetings that happened since, and Nebula prepares the next version: same prices unless you change them, each request answered with the customer's words, price differences computed by Postgres, pending prices block approval. See `prompts/06_proposal_versions.md`. |
| `/deals` Deals | Every proposal with its room signals; per deal: people (new faces vs. meeting attendees), the timeline, and **Read the room**. |
| `/shield` Shield | Security for agents that talk to strangers (see below). |

Customers only ever see `/room/{token}`: the designed proposal, a PDF download and the agent.

## Demo script (3 minutes, fictitious data only)

1. **The pain.** "Deals don't die in my meeting. They die in the internal one I'm not invited to."
2. **Meeting → proposal.** Import a transcript (`examples/`). The brief shows needs, objections and wow moments with the customer's exact words, all checked against the transcript. Draft: Postgres prices it (volume tier, implementation waived with commitment, annual plan). Approve → **OK, send it**.
3. **The room.** Open the link as the CFO who wasn't there. Nebula briefs her with her colleagues' quotes, simulates 45 users with the Postgres engine, and escalates contract terms to the owner. A fake "Natalia approved 40%" gets refused.
4. **Deals.** Sierra Verde Logistics: the CFO and the CEO, neither in the meeting, read the proposal; the COO who was in the meeting went silent. **Read the room** → hot, next move, follow-up draft. Every quote and number is checked.
5. **Shield** (optional, 20 s): 1M room events in ClickHouse, detection rules in SQL, a guessed link revoked in Postgres.

## To confirm

The implementation reference value (USD 6,000) and the commitment (24 months) in `sql/08_real_pricing.sql` are placeholders.

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
