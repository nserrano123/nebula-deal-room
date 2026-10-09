import { NextResponse } from "next/server";
import { ping } from "@/lib/clickhouse";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Public, secret-free status: is each backing service reachable, and how fast.
export async function GET() {
  const t0 = performance.now();
  let postgres: { ok: boolean; ms: number; error?: string };
  try {
    await query("select 1");
    postgres = { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    postgres = { ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message.slice(0, 200) };
  }
  return NextResponse.json({
    postgres,
    clickhouse: await ping(),
    anthropic_key: Boolean(process.env.ANTHROPIC_API_KEY),
    shield_key: Boolean(process.env.SHIELD_ADMIN_KEY),
  });
}
