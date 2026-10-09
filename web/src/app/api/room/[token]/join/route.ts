import { NextResponse } from "next/server";
import { z } from "zod";
import { NebulaError } from "@/lib/db";
import { joinRoom, visitorId } from "@/lib/room-turn";

export const runtime = "nodejs";

const body = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email.").max(120).optional().or(z.literal("")),
  title: z.string().trim().max(80).optional(),
  role: z.enum(["EX", "FI", "OP", "IT", "OT"]).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const out = await joinRoom({ token, visitor_id: visitorId(req), visitor_name: parsed.data.name, channel: "live" }, parsed.data);
    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof NebulaError ? e.message : "The room is not available right now.";
    if (!(e instanceof NebulaError)) console.error("[join]", e);
    return NextResponse.json({ error: message }, { status: e instanceof NebulaError ? 403 : 500 });
  }
}
