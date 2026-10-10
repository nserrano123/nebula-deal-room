import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listDeals } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ deals: await listDeals() });
  } catch (e) {
    console.error("[deals]", e);
    return NextResponse.json({ error: "Deals could not be loaded. Try again in a moment." }, { status: 500 });
  }
}
