# Agent task 5 · Deal pulse (reading the room for the owner)

After a proposal is sent, the customer's people visit the proposal room and talk to the room host (task 3). Every visit, question, price simulation and escalation is a row in `proposal_event`. Deal pulse reads those rows for one deal and tells the owner what happened in the room she was not in, and what to do next.

## Input

One JSON object built from the reporting views (`v_proposal_signals`, `v_stakeholder_signals`, `v_deal_timeline`) plus the meeting brief: the deal, the stakeholders with their activity, the full timeline and the needs, objections and wow moments from the meeting.

## Output (structured)

| Field | What it is |
|---|---|
| temperature | H hot · W warm · C cold |
| headline | One sentence: what is happening right now |
| engaged[] | name, role, what they care about, **evidence copied word for word** from the timeline |
| silent[] | Meeting participants who never opened the room |
| risks[] | risk + **verbatim evidence** |
| next_action | one step, one person, why |
| follow_up | email draft in the proposal's language (Spanish uses a formal register, usted) |

## Rules

The source of truth for the wording is `web/src/mastra/agents/deal-pulse.ts`. In short: only the data received, never invent people or numbers, every evidence is verbatim, security escalations are not buying signals, and the follow-up never mentions the agent's internal logs.

## Checks (app side)

- Every `evidence` is searched in the data the model received (normalized: case, accents, punctuation). Misses are shown to the owner.
- Every number in the prose is checked against the numbers in the data (`findUnverifiedNumbers`).
- Nothing is written to the database. The owner decides whether to send the follow-up; "Open in Gmail" only prefills a draft.
