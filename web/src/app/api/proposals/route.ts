import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { NebulaError } from "@/lib/db";
import { draftProposal } from "@/lib/proposal-flow";

export const runtime = "nodejs";
export const maxDuration = 120;

const count = z.number().int().min(0).max(1_000_000).nullable().optional();
const body = z.object({
  brief_code: z.string().regex(/^BRF-\d{4,}$/, "Invalid brief code."),
  users: count, employees: count, legal_entities: count, vehicles: count,
});

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const { brief_code, ...counts } = parsed.data;
  try {
    return NextResponse.json(await draftProposal(brief_code, counts));
  } catch (e) {
    if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[proposals]", e);
    return NextResponse.json({ error: "The proposal could not be drafted. Try again in a moment." }, { status: 500 });
  }
}
