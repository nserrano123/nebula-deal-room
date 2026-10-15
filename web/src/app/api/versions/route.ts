import { ownerRoute } from "./_util";
import { dealMeetings, updatableDeals } from "@/lib/version-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/versions                  → deals with a sent proposal
// GET /api/versions?deal=OPP-0007    → that deal's meetings
export const GET = ownerRoute("versions", async (req: Request) => {
  const deal = new URL(req.url).searchParams.get("deal");
  if (deal) return { meetings: await dealMeetings(deal) };
  return { deals: await updatableDeals() };
});
