import { z } from "zod";

// A priced line as the owner (or an imported document) states it. Postgres does the math.
export const lineSchema = z.object({
  concept_code: z.string().describe("Short stable code in capitals, e.g. USERS, AGENT-SALES, EDOC, ERP-IMPL. Keep the previous version's code for the same concept."),
  concept_name: z.string(),
  description: z.string().nullable(),
  quantity: z.number().min(0),
  unit_price: z.number().min(0).nullable().describe("null when the price is not known"),
  currency: z.string().length(3),
  recurrence_code: z.enum(["M", "O"]).describe("M monthly, O one-time"),
});

export const discountSchema = z.object({
  concept_code: z.string(),
  concept_name: z.string(),
  discount_pct: z.number().gt(0).lt(100),
  currency: z.string().length(3),
  recurrence_code: z.enum(["M", "O"]),
});

export const termsSchema = z.object({
  validity: z.string().nullable(),
  execution: z.string().nullable(),
  timeline: z.string().nullable(),
  payment_schedule: z.array(z.object({ label: z.string(), pct: z.number() })).describe("Installments of the one-time total; percentages add up to 100"),
  support: z.array(z.string()),
  notes: z.array(z.string()).describe("Commercial notes and conditions, one per item"),
  rates: z.array(z.object({ code: z.string(), name: z.string(), unit_label: z.string(), price: z.number(), currency: z.string() }))
    .describe("Reference rates that are not lines of the quote, such as the development hour"),
  volume_tiers: z.array(z.object({ name: z.string(), price: z.number().nullable(), currency: z.string(), unit_label: z.string() }))
    .describe("Optional price tiers offered for growth, such as electronic document packages"),
});

// ---------------------------------------------------------------------
// Import: a proposal PDF that was already sent
// ---------------------------------------------------------------------
export const importSchema = z.object({
  company_name: z.string(),
  external_ref: z.string().nullable().describe("The reference printed on the document, e.g. FF-2026-0004"),
  issued_on: z.string().describe("YYYY-MM-DD"),
  prepared_for: z.array(z.object({ name: z.string(), title: z.string().nullable() })),
  lines: z.array(lineSchema),
  discounts: z.array(discountSchema),
  lines_include_discount: z.boolean().describe("true when the line amounts printed already have the discount applied (the printed lines add up to the printed total)"),
  stated_totals: z.array(z.object({ total: z.number(), currency: z.string(), recurrence_code: z.enum(["M", "O"]) })).describe("Totals exactly as printed"),
  terms: termsSchema,
  narrative: z.string().describe("The proposal's own text (about us, value, modules, methodology), faithfully condensed, in its original language. Plain text, blank line between sections, '- ' for lists."),
});
export type ImportedProposal = z.infer<typeof importSchema>;

// ---------------------------------------------------------------------
// Update: the next version after new meetings
// ---------------------------------------------------------------------
export const versionSchema = z.object({
  lines: z.array(lineSchema.extend({
    price_source: z.enum(["previous", "price_item", "pending"]).describe("previous: same price as the previous version; price_item: from the owner's price list; pending: no known price"),
  })),
  discounts: z.array(discountSchema),
  terms: termsSchema,
  changes: z.array(z.object({
    kind: z.enum(["A", "M", "R", "C"]).describe("A added, M changed, R removed, C clarified (answered without changing the price)"),
    topic: z.string(),
    request_quote: z.string().nullable().describe("The customer's words, copied verbatim from the transcript"),
    requested_by: z.string().nullable(),
    brief_code: z.string().nullable(),
    before_text: z.string().nullable(),
    after_text: z.string().describe("What this version says now, in the proposal's language"),
  })),
  narrative: z.string(),
  prepared_for: z.array(z.object({ name: z.string(), title: z.string().nullable() }))
    .describe("Who this version is addressed to: the person who asked for the update first, then the previous recipients who still apply"),
  owner_questions: z.array(z.string()).describe("Decisions only the owner can make before sending (missing prices, expired offers, contradictions), in the owner's language"),
});
export type VersionDraft = z.infer<typeof versionSchema>;
