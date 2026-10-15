import { z } from "zod";
import { BadRequest, ownerRoute } from "../../_util";
import { repriceVersion } from "@/lib/version-flow";

export const runtime = "nodejs";

// The owner sets a pending price or edits a line of a draft version. Postgres recomputes everything.
export const POST = ownerRoute("versions/pricing", async (req: Request, { params }: { params: Promise<{ code: string }> }) => {
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) throw new BadRequest("Invalid proposal code.");
  const parsed = z.object({ lines: z.array(z.record(z.string(), z.unknown())).min(1), terms: z.record(z.string(), z.unknown()).nullable().optional() })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new BadRequest("Invalid lines.");
  return repriceVersion(code, parsed.data.lines, parsed.data.terms ?? null);
});
