import { z } from "zod";
import { BadRequest, ownerRoute } from "../_util";
import { draftVersion } from "@/lib/version-flow";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = ownerRoute("versions/draft", async (req: Request) => {
  const parsed = z.object({
    opportunity_code: z.string().regex(/^OPP-\d{4,}$/, "Invalid deal code."),
    brief_codes: z.array(z.string().regex(/^BRF-\d{4,}$/)).min(1, "Choose at least one new meeting."),
    owner_notes: z.string().max(4000).default(""),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  const { opportunity_code, brief_codes, owner_notes } = parsed.data;
  return draftVersion(opportunity_code, brief_codes, owner_notes);
});
