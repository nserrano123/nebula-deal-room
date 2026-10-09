import { NextResponse } from "next/server";
import { ensureSchema, generateTraffic } from "@/lib/clickhouse";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { n } = (await req.json().catch(() => ({}))) as { n?: number };
  try {
    await ensureSchema();
    return NextResponse.json(await generateTraffic(n ?? 1_000_000));
  } catch (e) {
    console.error("[traffic]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
