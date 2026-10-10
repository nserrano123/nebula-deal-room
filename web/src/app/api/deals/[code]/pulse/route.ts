import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { NebulaError } from "@/lib/db";
import { dealPulse } from "@/lib/deals";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) return NextResponse.json({ error: "Invalid proposal code." }, { status: 400 });
  try {
    return NextResponse.json(await dealPulse(code));
  } catch (e) {
    if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("[pulse]", e);
    return NextResponse.json({ error: "Nebula could not read this room. Try again in a moment." }, { status: 500 });
  }
}
