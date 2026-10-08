import { z } from "zod";

// Mirrors prompts/01_deal_brief.md. Postgres (fn_save_brief) is still the final validator.
export const roleCategory = z.enum(["EX", "FI", "OP", "IT", "OT"]);

export const ROLE_LABELS: Record<z.infer<typeof roleCategory>, string> = {
  EX: "Executive",
  FI: "Finance",
  OP: "Operations",
  IT: "IT",
  OT: "Other",
};

export const COMPLEXITY_LABELS = { L: "Low", M: "Medium", H: "High" } as const;

const quoted = {
  quote: z.string().describe("Verbatim words from the transcript"),
  speaker: z.string().describe("Name of the customer-side person who said it"),
};

export const briefSchema = z.object({
  summary: z.string().describe("2 to 3 sentences about the company and its situation"),
  participants: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      role_category: roleCategory,
      email: z.string().nullable(),
    }),
  ),
  needs: z.array(z.object({ need: z.string(), ...quoted })),
  objections: z.array(z.object({ objection: z.string(), ...quoted, handled: z.boolean() })),
  wow_moments: z.array(
    z.object({
      moment: z.string(),
      trigger: z.string().describe("The part of the demo that caused the reaction"),
      ...quoted,
    }),
  ),
  buying_signals: z.array(z.string()),
  open_questions: z.array(z.string()),
  users_count: z.number().int().nullable(),
  module_codes: z.array(z.string()),
  legal_entities_count: z.number().int().nullable(),
  employees_count: z.number().int().nullable(),
  vehicles_count: z.number().int().nullable(),
  complexity: z.enum(["L", "M", "H"]),
});

export type Brief = z.infer<typeof briefSchema>;

export const briefRequestSchema = z.object({
  company: z.string().trim().min(1, "Enter the prospect company name."),
  plan_code: z.string().trim().min(1, "Choose a price plan."),
  transcript: z.string().trim().min(200, "Paste the full meeting transcript (at least 200 characters)."),
});

export type SavedBrief = {
  brief_code: string;
  opportunity_code: string;
  company_name: string;
  plan_code: string;
  plan_name: string;
  stakeholders: {
    stakeholder_code: string;
    name: string;
    role_category_code: string;
    role_category_label: string;
  }[];
};
