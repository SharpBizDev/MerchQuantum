import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateListingResponse } from "../../../../lib/ai/listing-engine";

const requestSchema = z.object({
  imageDataUrl: z.string().min(1),
  fileName: z.string().min(1),
  title: z.string().optional(),
  productFamily: z.string().optional(),
  templateContext: z.string().optional(),
  userHints: z.union([z.array(z.string()), z.string()]).optional(),
  legacyContext: z.string().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const payload = requestSchema.parse(await request.json());
    const listing = await generateListingResponse(payload);
    return NextResponse.json(listing);
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred. Please try again." }, { status: 502 });
  }
}