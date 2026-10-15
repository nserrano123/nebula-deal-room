import { z } from "zod";
import { BadRequest, ownerRoute } from "../_util";
import { importFromGoogleDocs } from "@/lib/transcript-source";
import { addMeeting, meetingDateFromTitle } from "@/lib/version-flow";

export const runtime = "nodejs";
export const maxDuration = 120;

// A new meeting for a deal that already has a proposal: from a Google Docs link or pasted text.
export const POST = ownerRoute("versions/meeting", async (req: Request) => {
  const parsed = z.object({
    opportunity_code: z.string().regex(/^OPP-\d{4,}$/, "Invalid deal code."),
    url: z.string().url().max(2000).optional(),
    transcript: z.string().min(200).optional(),
    meeting_at: z.string().optional(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  const { opportunity_code, url } = parsed.data;
  let transcript = parsed.data.transcript ?? "";
  let meeting_at = parsed.data.meeting_at ?? null;
  if (url) {
    const doc = await importFromGoogleDocs(url);
    transcript = doc.transcript;
    meeting_at ??= doc.meeting_at ?? meetingDateFromTitle(doc.title);
  }
  if (transcript.length < 200) throw new BadRequest("Paste the meeting transcript or a Google Docs link.");
  return addMeeting(opportunity_code, transcript, meeting_at);
});
