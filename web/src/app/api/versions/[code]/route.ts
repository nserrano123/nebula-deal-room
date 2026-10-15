import { BadRequest, ownerRoute } from "../_util";
import { versionDetail } from "@/lib/version-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = ownerRoute("versions/detail", async (_req: Request, { params }: { params: Promise<{ code: string }> }) => {
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) throw new BadRequest("Invalid proposal code.");
  return versionDetail(code);
});
