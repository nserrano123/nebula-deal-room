import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { detect, recordDetections, type Detection } from "@/lib/clickhouse";
import { liveTokens, revokeToken } from "@/lib/room-db";

export const runtime = "nodejs";

// Detect in ClickHouse, remediate in Postgres.
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { detections, ms, scanned } = await detect(15);
    const tokens = new Map((await liveTokens()).map((t) => [t.token_hash, t]));
    const actions: { d: Detection; action: string; detail: string }[] = [];
    for (const d of detections) {
      const live = d.token_hash ? tokens.get(d.token_hash) : undefined;
      if (live && (d.severity === "critical" || d.severity === "high")) {
        if (!live.revoked) await revokeToken(live.token, d.rule_label);
        actions.push({ d, action: "revoked", detail: `Link to ${live.proposal_code} (${live.company_name}) revoked in Postgres` });
      } else if (live) {
        actions.push({ d, action: "owner_alerted", detail: `Owner alerted about ${live.proposal_code} (${live.company_name})` });
      } else if (d.rule === "link_guessing") {
        actions.push({ d, action: "visitor_flagged", detail: `Visitor ${d.visitor_id} flagged after ${d.hits} invalid links` });
      } else {
        actions.push({ d, action: "simulated", detail: "Simulated tenant: revocation would apply here" });
      }
    }
    await recordDetections(actions);
    return NextResponse.json({
      scanned, query_ms: ms,
      detections: actions.map(({ d, action, detail }) => ({ ...d, action, detail })),
    });
  } catch (e) {
    console.error("[detect]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
