import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  transcript: z.string().trim().min(1),
  transcriptId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Schema Validation Failed" }, { status: 400 });
  }

  const source = parsed.data.source || "transcript-payload";
  return NextResponse.json({
    transcript_id: parsed.data.transcriptId || "generated-1",
    source,
    title: "Draft Two",
    summary: parsed.data.transcript,
    key_points: ["First point"],
    quoted_evidence: ["\"Quoted evidence\""],
  });
}