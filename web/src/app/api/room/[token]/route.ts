import { NextResponse } from "next/server";
import { NebulaError } from "@/lib/db";
import { openRoom, visitorId } from "@/lib/room-turn";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { proposal } = await openRoom({ token, visitor_id: visitorId(req), visitor_name: "Visitor", channel: "live" });
    return NextResponse.json({ proposal });
  } catch (e) {
    const message = e instanceof NebulaError ? e.message : "The room is not available right now.";
    if (!(e instanceof NebulaError)) console.error("[room]", e);
    return NextResponse.json({ error: message }, { status: e instanceof NebulaError ? 404 : 500 });
  }
}
