import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { NebulaError } from "@/lib/db";
import { approveProposal } from "@/lib/proposal-flow";

export const runtime = "nodejs";

const body = z.object({ approved_by: z.string().trim().min(2).max(80), narrative: z.string().max(20_000).optional() });

// Human approval: nothing reaches the customer until the owner approves and sends.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { code } = await params;
  if (!/^PRP-\d{4,}$/.test(code)) return NextResponse.json({ error: "Invalid proposal code." }, { status: 400 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter who approves the proposal." }, { status: 400 });
  try {
    return NextResponse.json(await approveProposal(code, parsed.data.approved_by, parsed.data.narrative));
  } catch (e) {
    if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[approve]", e);
    return NextResponse.json({ error: "The proposal could not be approved. Try again in a moment." }, { status: 500 });
  }
}
