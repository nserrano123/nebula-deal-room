import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { NebulaError } from "@/lib/db";
import { markSent } from "@/lib/proposal-flow";

export const runtime = "nodejs";

// The owner pressed "Send": the customer's room opens.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) return NextResponse.json({ error: "Invalid proposal code." }, { status: 400 });
  try {
    return NextResponse.json(await markSent(code));
  } catch (e) {
    if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[send]", e);
    return NextResponse.json({ error: "The proposal could not be marked as sent." }, { status: 500 });
  }
}
