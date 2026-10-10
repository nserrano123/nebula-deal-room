import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { NebulaError } from "@/lib/db";
import { dealDetail } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) return NextResponse.json({ error: "Invalid proposal code." }, { status: 400 });
  try {
    return NextResponse.json(await dealDetail(code));
  } catch (e) {
    if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("[deal]", e);
    return NextResponse.json({ error: "The deal could not be loaded. Try again in a moment." }, { status: 500 });
  }
}
