import { BadRequest, ownerRoute } from "../../_util";
import { discardVersion } from "@/lib/version-flow";

export const runtime = "nodejs";

// Throw away a draft version so the meetings can be used again for a fresh one.
export const POST = ownerRoute("versions/discard", async (_req: Request, { params }: { params: Promise<{ code: string }> }) => {
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) throw new BadRequest("Invalid proposal code.");
  return discardVersion(code);
});
