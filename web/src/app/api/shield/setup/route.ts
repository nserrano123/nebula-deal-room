import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { clickhouseConfigured, ensureSchema } from "@/lib/clickhouse";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!clickhouseConfigured()) return NextResponse.json({ error: "ClickHouse is not configured." }, { status: 400 });
  try {
    await ensureSchema();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[setup]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
