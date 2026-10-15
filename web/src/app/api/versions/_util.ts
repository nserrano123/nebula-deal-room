import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { NebulaError } from "@/lib/db";

/** Owner-only handler: user-facing errors (NebulaError) go back as 422, the rest as a generic 500. */
export function ownerRoute<T>(label: string, run: (req: Request, ctx: T) => Promise<unknown>) {
  return async (req: Request, ctx: T) => {
    const denied = requireAdmin(req);
    if (denied) return denied;
    try {
      return NextResponse.json(await run(req, ctx));
    } catch (e) {
      if (e instanceof NebulaError) return NextResponse.json({ error: e.message }, { status: 422 });
      if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
      console.error(`[${label}]`, e);
      // Owner-only routes: the owner sees the technical reason, trimmed.
      const detail = e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400);
      return NextResponse.json({ error: `Something failed on our side: ${detail}` }, { status: 500 });
    }
  };
}

export class BadRequest extends Error {}
