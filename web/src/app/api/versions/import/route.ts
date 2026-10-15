import { BadRequest, ownerRoute } from "../_util";
import { readProposalPdf } from "@/lib/version-flow";

export const runtime = "nodejs";
export const maxDuration = 120;

// Reads a proposal PDF that was already sent. Nothing is saved until the owner confirms.
export const POST = ownerRoute("versions/import", async (req: Request) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new BadRequest("Attach the proposal PDF.");
  if (file.size > 15 * 1024 * 1024) throw new BadRequest("The PDF is larger than 15 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new BadRequest("The file is not a PDF.");
  return readProposalPdf(bytes);
});
