import { z } from "zod";
import { BadRequest, ownerRoute } from "../../_util";
import { importSchema } from "@/lib/version-schema";
import { saveImported } from "@/lib/version-flow";

export const runtime = "nodejs";

export const POST = ownerRoute("versions/import/save", async (req: Request) => {
  const parsed = z.object({ proposal: importSchema, opportunity_code: z.string().regex(/^OPP-\d{4,}$/).nullable().optional() })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? "Invalid proposal.");
  return saveImported(parsed.data.proposal, parsed.data.opportunity_code);
});
