import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { TranscriptImportError, importFromGoogleDocs } from "@/lib/transcript-source";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Paste a Google Docs link." }, { status: 400 });
  try {
    return NextResponse.json(await importFromGoogleDocs(parsed.data.url));
  } catch (e) {
    if (e instanceof TranscriptImportError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[transcript]", e);
    return NextResponse.json({ error: "The document could not be read. Paste the text instead." }, { status: 500 });
  }
}
