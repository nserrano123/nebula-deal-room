import { NextResponse } from "next/server";
import { briefRequestSchema } from "@/lib/brief-schema";
import { NebulaError } from "@/lib/db";
import { runDealBrief } from "@/lib/deal-brief-flow";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const parsed = briefRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  try {
    return NextResponse.json(await runDealBrief(parsed.data));
  } catch (e) {
    if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[briefs]", e);
    return NextResponse.json({ error: "The brief could not be generated. Try again in a moment." }, { status: 500 });
  }
}
