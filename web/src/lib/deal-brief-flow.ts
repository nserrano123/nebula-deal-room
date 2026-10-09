// Transcript → deal brief → Neon.
// The model extracts; code checks every quote against the transcript; Postgres validates and saves.
import { dealBriefAgent, dealBriefInstructions } from "@/mastra/agents/deal-brief";
import { briefSchema, type Brief, type SavedBrief } from "./brief-schema";
import { NebulaError, TENANT_CODE, getCatalog, query, type Catalog } from "./db";

const MAX_ATTEMPTS = 2;

export type QuoteCheck = { section: "needs" | "objections" | "wow_moments"; index: number; quote: string };

export type BriefResult = {
  saved: SavedBrief;
  brief: Brief;
  unverified_quotes: QuoteCheck[];
  attempts: number;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"'‘’….,;:!?¿¡()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Quotes that do not appear in the transcript are flagged, never silently trusted. */
export function findUnverifiedQuotes(brief: Brief, transcript: string): QuoteCheck[] {
  const haystack = normalize(transcript);
  const out: QuoteCheck[] = [];
  for (const section of ["needs", "objections", "wow_moments"] as const) {
    brief[section].forEach((item, index) => {
      if (!haystack.includes(normalize(item.quote))) out.push({ section, index, quote: item.quote });
    });
  }
  return out;
}

export async function extractBrief(catalog: Catalog, transcript: string, feedback?: string): Promise<Brief> {
  const prompt = feedback
    ? `${transcript}\n\n---\nYour previous brief for this transcript was rejected by the database: "${feedback}". Fix it and return the full brief again.`
    : transcript;
  const result = await dealBriefAgent.generate([{ role: "user", content: prompt }], {
    instructions: dealBriefInstructions(catalog),
    structuredOutput: { schema: briefSchema },
  });
  if (!result.object) throw new Error("The model did not return a brief. Try again.");
  return briefSchema.parse(result.object);
}

export async function saveBrief(
  input: { company: string; plan_code: string; transcript: string },
  brief: Brief,
  tenantCode = TENANT_CODE,
): Promise<SavedBrief> {
  // One statement is one transaction: if the brief is rejected, no orphan opportunity is left behind.
  const [row] = await query<{ r: SavedBrief }>(
    `select nebula.fn_save_brief(
              $1,
              nebula.fn_create_opportunity($1, $2)->>'opportunity_code',
              $3, $4, $5::jsonb) as r`,
    [tenantCode, input.company, input.plan_code, input.transcript, JSON.stringify(brief)],
  );
  return row.r;
}

export async function runDealBrief(req: { company?: string; plan_code?: string; transcript: string }): Promise<BriefResult> {
  const catalog = await getCatalog();
  let feedback: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const brief = await extractBrief(catalog, req.transcript, feedback);
    // What the owner typed wins; otherwise the model's reading of the meeting. Postgres validates the plan.
    const input = {
      company: req.company?.trim() || brief.company_name.trim(),
      plan_code: req.plan_code?.trim() || brief.plan_code.trim(),
      transcript: req.transcript,
    };
    try {
      if (!input.company) throw new NebulaError("The company name was not found in the meeting. Type it and try again.");
      const saved = await saveBrief(input, brief);
      return { saved, brief, unverified_quotes: findUnverifiedQuotes(brief, req.transcript), attempts: attempt };
    } catch (e) {
      // Only content problems go back to the model; anything else (plan, connection) stops here.
      if (!(e instanceof NebulaError) || attempt === MAX_ATTEMPTS || /company name/i.test(e.message)) throw e;
      feedback = e.message;
    }
  }
  throw new Error("unreachable");
}
