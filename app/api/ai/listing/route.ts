import { NextRequest, NextResponse } from "next/server";

import {
  generateListingResponse,
  ListingInputGuardError,
  type ListingRequest,
} from "../../../../lib/ai/listing-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ListingRequest;
    if (!body?.imageDataUrl) {
      return NextResponse.json({ error: "Image data is required." }, { status: 400 });
    }

    const result = await generateListingResponse(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ListingInputGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unable to generate listing copy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
