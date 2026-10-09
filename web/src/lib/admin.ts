import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Owner-only actions (console, Shield dashboard). The owner signs in once with SHIELD_ADMIN_KEY
// and gets an httpOnly cookie for 30 days; the raw key never stays in the browser.
export const OWNER_COOKIE = "nebula_owner";
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const clean = (v: string) => v.trim().replace(/^["']|["']$/g, "").trim();

function ownerKey(): string {
  return process.env.SHIELD_ADMIN_KEY ? clean(process.env.SHIELD_ADMIN_KEY) : "";
}

const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** Session value derived from the key: changing SHIELD_ADMIN_KEY signs every browser out. */
export function sessionToken(): string {
  return createHmac("sha256", ownerKey()).update("nebula-owner-session-v1").digest("hex");
}

export function keyMatches(given: string): boolean {
  const expected = ownerKey();
  return Boolean(expected) && same(clean(given), expected);
}

function cookieValue(req: Request): string {
  const raw = req.headers.get("cookie") ?? "";
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(`${OWNER_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(OWNER_COOKIE.length + 1)) : "";
}

export function isOwner(req: Request): boolean {
  if (!ownerKey()) return false;
  const cookie = cookieValue(req);
  if (cookie && same(cookie, sessionToken())) return true;
  const header = req.headers.get("x-shield-key");
  return header ? keyMatches(header) : false;
}

export function requireAdmin(req: Request): NextResponse | null {
  if (!ownerKey()) {
    return NextResponse.json({ error: "Set SHIELD_ADMIN_KEY in the environment to use the owner tools." }, { status: 503 });
  }
  if (!isOwner(req)) return NextResponse.json({ error: "Sign in with your owner key." }, { status: 401 });
  return null;
}
