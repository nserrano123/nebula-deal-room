import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { runRedTeam } from "@/lib/red-team";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await runRedTeam());
  } catch (e) {
    console.error("[attack]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
