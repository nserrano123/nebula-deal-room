import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// The Shield dashboard and its actions are for the owner only.
// Set SHIELD_ADMIN_KEY in Vercel and open /shield?key=<that value>.
export function requireAdmin(req: Request): NextResponse | null {
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, "").trim();
  const expected = process.env.SHIELD_ADMIN_KEY ? clean(process.env.SHIELD_ADMIN_KEY) : "";
  if (!expected) {
    return NextResponse.json({ error: "Set SHIELD_ADMIN_KEY in the environment to use the Shield dashboard." }, { status: 503 });
  }
  const given = clean(req.headers.get("x-shield-key") ?? "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return null;
}
