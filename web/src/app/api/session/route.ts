import { NextResponse } from "next/server";
import { OWNER_COOKIE, OWNER_COOKIE_MAX_AGE, isOwner, keyMatches, sessionToken } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: am I signed in? POST {key}: sign in. DELETE: sign out.
export async function GET(req: Request) {
  return NextResponse.json({ owner: isOwner(req) });
}

export async function POST(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  if (!key || !keyMatches(key)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ error: "That key is not correct." }, { status: 401 });
  }
  const res = NextResponse.json({ owner: true });
  res.cookies.set(OWNER_COOKIE, sessionToken(), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: OWNER_COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ owner: false });
  res.cookies.set(OWNER_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
