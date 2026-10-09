import { NextResponse } from "next/server";
import { z } from "zod";
import { NebulaError } from "@/lib/db";
import { roomTurn, verify, visitorId } from "@/lib/room-turn";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  ctx: z.object({ proposal: z.record(z.string(), z.unknown()), person: z.record(z.string(), z.unknown()) }),
  sig: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(40),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!verify(parsed.data.ctx, parsed.data.sig)) {
    return NextResponse.json({ error: "Your session is not valid. Open the proposal link again." }, { status: 403 });
  }
  const name = String(parsed.data.ctx.person.name ?? "Visitor");
  try {
    const out = await roomTurn({ token, visitor_id: visitorId(req), visitor_name: name, channel: "live" }, parsed.data.ctx, parsed.data.messages);
    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof NebulaError ? e.message : "The agent could not answer right now. Try again in a moment.";
    if (!(e instanceof NebulaError)) console.error("[chat]", e);
    return NextResponse.json({ error: message }, { status: e instanceof NebulaError ? 403 : 500 });
  }
}
