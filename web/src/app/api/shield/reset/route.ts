import { NextResponse } from "next/server";
import { clickhouseConfigured, resetData } from "@/lib/clickhouse";
import { restoreAll } from "@/lib/room-db";

export const runtime = "nodejs";

// Demo reset: re-enable revoked links and clear the event store.
export async function POST(req: Request) {
  const { events } = (await req.json().catch(() => ({}))) as { events?: boolean };
  try {
    await restoreAll();
    if (events && clickhouseConfigured()) await resetData();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reset]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
