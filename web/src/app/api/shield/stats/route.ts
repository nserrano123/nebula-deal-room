import { NextResponse } from "next/server";
import { clickhouseConfigured, ensureSchema, stats } from "@/lib/clickhouse";
import { liveTokens } from "@/lib/room-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rooms = (await liveTokens()).map(({ token, ...r }) => ({ ...r, path: `/room/${token}` }));
    if (!clickhouseConfigured()) return NextResponse.json({ clickhouse: false, rooms });
    await ensureSchema();
    return NextResponse.json({ clickhouse: true, rooms, ...(await stats()) });
  } catch (e) {
    console.error("[stats]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
