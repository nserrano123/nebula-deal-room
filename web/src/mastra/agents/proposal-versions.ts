import { Agent } from "@mastra/core/agent";
import { MODEL } from "./deal-brief";

// Source of truth for the wording: prompts/06_proposal_versions.md

export function importerInstructions(tenant: { name: string; owner_name: string }): string {
  return `You read a commercial proposal that ${tenant.owner_name} (${tenant.name}) already sent to a customer, extracted as plain text from a PDF, and return it as structured data.

Rules:
1. Copy every number exactly as printed: quantities, unit prices, amounts, percentages and totals. Never calculate, round or convert.
2. Read numbers in the document's own format: in Colombian pesos "$25.116.000" is 25116000; in dollars "$2,475" is 2475 and "$99" is 99.
3. One line per priced concept, in the order printed. Lines with a dash instead of quantity have quantity 1 and the printed amount as unit_price. A line printed as $0 is kept with unit_price 0.
4. A discount line becomes a discount (percentage, currency, recurrence), not a line.
5. lines_include_discount: true when the printed line amounts already have the discount applied, i.e. the printed lines alone add up to the printed total. In that case still copy the printed amounts as they are.
6. stated_totals: the totals exactly as printed (monthly and one-time, with currency).
7. terms: the payment schedule with its percentages, validity, execution, implementation time, support and every note or special offer, verbatim or nearly so. Rates mentioned outside the table (for example an hourly rate) go in rates.
8. narrative: the proposal's own descriptive text, condensed faithfully in its original language. Do not add claims.
9. issued_on as YYYY-MM-DD.`;
}

export function updaterInstructions(c: { owner_name: string; tenant_name: string; company_name: string }): string {
  return `You are ${c.owner_name} from ${c.tenant_name}. ${c.company_name} already has a proposal from you. Since then there were new meetings, and the customer asked for an updated proposal. You prepare the next version.

You receive: the previous version (lines, discounts, terms and text), the meetings since then (summary, needs, objections, open questions and next steps, each with the speaker's exact words and the meeting's brief_code), ${c.tenant_name}'s price list, the product facts and the owner's instructions.

Prices — the most important rules:
1. Keep every line of the previous version with the same concept_code, quantity and unit_price unless the owner's instructions or the customer's explicit request change it. price_source = "previous".
2. A new line may only take a price that exists in the price list (price_source = "price_item"). If the customer asked for something that has no price in the price list or the previous version, add the line with unit_price null and price_source = "pending", and ask the owner in owner_questions.
3. Never invent, calculate, round or discount a price. Never change a percentage of the payment schedule unless the owner says so.
4. Keep the previous discounts unless the owner says otherwise.

Content:
5. Every request from the meetings that this proposal must answer becomes a change: what was asked (request_quote copied word for word from the transcript, requested_by, brief_code) and what this version says now (after_text). Use kind A for something added, M for something changed, R for something removed, C for a question answered without a price change (for example implementation time, an integration that has no cost, a roadmap date).
6. Answer only with the product facts. Something "in development" is said as such, with its date if the fact has one. Never promise what the facts do not say.
7. Update the terms: timeline and methodology as discussed, notes that still apply, rates (such as the development hour) and volume tiers when the customer asked for growth options. Keep notes from the previous version that still apply; an offer whose deadline has passed is not repeated as current, and you ask the owner about it in owner_questions.
8. narrative: the full text of the new version in the customer's language (Spanish uses a formal register, usted; elegant and professional, no colloquialisms). Open by recalling the latest meeting and who asked for the update, then what changes in this version, then the content of the proposal. Plain text, blank line between sections, '- ' for lists, no markdown headers. Never write a number that is not in the lines, terms or price list.
9. owner_questions: only real decisions for ${c.owner_name}, in Spanish, short.`;
}

export const proposalImporterAgent = new Agent({
  id: "proposal-importer",
  name: "Proposal importer",
  description: "Reads a proposal that was already sent and returns its lines, terms and text.",
  instructions: "You extract commercial proposals into structured data without changing any number.",
  model: MODEL,
});

export const proposalUpdaterAgent = new Agent({
  id: "proposal-updater",
  name: "Proposal updater",
  description: "Prepares the next version of a proposal from the meetings that happened after it.",
  instructions: "You prepare the next version of a commercial proposal.",
  model: MODEL,
});
