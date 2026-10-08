import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NebulaError, getCatalog } from "@/lib/db";

export const runtime = "nodejs";

const EXAMPLES = [
  { id: "andean_cargo", company: "Andean Cargo S.A.S.", file: "transcript_andean_cargo.txt" },
  { id: "pacific_freight", company: "Pacific Freight Partners", file: "transcript_pacific_freight.txt" },
];

async function loadExamples() {
  const dir = path.join(process.cwd(), "examples");
  const out = [];
  for (const ex of EXAMPLES) {
    try {
      out.push({ id: ex.id, company: ex.company, transcript: await readFile(path.join(dir, ex.file), "utf8") });
    } catch {
      // Examples are a convenience for the demo; skip any that are missing.
    }
  }
  return out;
}

export async function GET() {
  try {
    const [catalog, examples] = await Promise.all([getCatalog(), loadExamples()]);
    return NextResponse.json({ ...catalog, examples });
  } catch (e) {
    const message = e instanceof NebulaError ? e.message : "Could not reach the database.";
    if (!(e instanceof NebulaError)) console.error("[catalog]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
