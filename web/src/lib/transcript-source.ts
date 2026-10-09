// Import a meeting transcript from a Google Docs link (e.g. Google Meet's "Notas de Gemini").
// Only docs.google.com document IDs are accepted, and the request URL is built here, never taken
// from the user as-is (no open fetch / SSRF).

const DOC_ID = /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{20,})/;
const TAB_ID = /[?&#]tab=(t\.[a-zA-Z0-9_-]+)/;
const TRANSCRIPT_MARKERS = [/^#*\s*\**\s*📖?\s*Transcripci[oó]n\**\s*$/im, /^#*\s*\**\s*📖?\s*Transcript\**\s*$/im];

export class TranscriptImportError extends Error {}

export function parseDocLink(url: string): { id: string; tab: string | null } {
  const id = url.match(DOC_ID)?.[1];
  if (!id) throw new TranscriptImportError("Paste a Google Docs link (https://docs.google.com/document/d/…).");
  return { id, tab: url.match(TAB_ID)?.[1] ?? null };
}

async function exportDoc(id: string, tab: string | null): Promise<string | null> {
  const url = `https://docs.google.com/document/d/${id}/export?format=txt${tab ? `&tab=${tab}` : ""}`;
  let r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  // A shared doc redirects once to Google's download host; a private one redirects to the sign-in page.
  if (r.status >= 300 && r.status < 400) {
    const next = r.headers.get("location");
    if (!next) return null;
    const host = new URL(next, url).hostname;
    if (!host.endsWith(".googleusercontent.com")) return null;
    r = await fetch(new URL(next, url), { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  }
  if (r.status !== 200) return null;
  const type = r.headers.get("content-type") ?? "";
  if (!type.includes("text/plain")) return null;
  return (await r.text()).replace(/^﻿/, "");
}

/** Keeps only the transcript when the document also holds Gemini's notes. */
export function extractTranscript(text: string): string {
  for (const m of TRANSCRIPT_MARKERS) {
    const hit = text.search(m);
    if (hit >= 0) return text.slice(hit).trim();
  }
  return text.trim();
}

export async function importFromGoogleDocs(url: string): Promise<{ transcript: string; title: string | null; chars: number }> {
  const { id, tab } = parseDocLink(url);
  // Whole document first (Gemini puts notes and transcript in one doc); then the tab in the link.
  let text = await exportDoc(id, null);
  if (text && tab && !TRANSCRIPT_MARKERS.some((m) => m.test(text!))) text = (await exportDoc(id, tab)) ?? text;
  if (!text) {
    throw new TranscriptImportError(
      "Nebula cannot open this document. In Google Docs, use Share → General access → Anyone with the link (Viewer), or paste the text instead.",
    );
  }
  const title = text.match(/^\s*#*\s*\**([^\n*]+?)\s*-\s*Transcripci[oó]n/im)?.[1]?.trim() ?? null;
  const transcript = extractTranscript(text);
  if (transcript.length < 200) throw new TranscriptImportError("The document has no transcript long enough to analyze.");
  return { transcript, title, chars: transcript.length };
}
