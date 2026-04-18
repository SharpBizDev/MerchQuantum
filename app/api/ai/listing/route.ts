import { NextRequest, NextResponse } from "next/server";

import {
  generateListingResponse,
  ListingInputGuardError,
  type ListingRequest,
} from "../../../../lib/ai/listing-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function detectImageMimeType(imageDataUrl?: string) {
  if (typeof imageDataUrl !== "string") return null;
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `mq-ai-${Date.now()}`;

  try {
    const body = (await request.json()) as ListingRequest;
    const imageMimeType = detectImageMimeType(body?.imageDataUrl);
    const geminiApiKeyPresent = Boolean(process.env.GEMINI_API_KEY);
    const googleGenerativeApiKeyPresent = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    const googleApiKeyPresent = Boolean(process.env.GOOGLE_API_KEY);
    const resolvedApiKeyPresent = geminiApiKeyPresent || googleGenerativeApiKeyPresent || googleApiKeyPresent;

    console.log(
      "[api/ai/listing] request",
      JSON.stringify({
        requestId,
        imageMimeType,
        fileNamePresent: Boolean(body?.fileName),
        productFamily: body?.productFamily || null,
        resolvedApiKeyPresent,
        geminiApiKeyPresent,
        googleGenerativeApiKeyPresent,
        googleApiKeyPresent,
      })
    );

    if (!body?.imageDataUrl) {
      return NextResponse.json({ error: "Image data is required." }, { status: 400 });
    }

    const result = await generateListingResponse(body);
    if (
      result.source === "fallback" &&
      result.reasonFlags.some((flag) => /bounded gemini attempt|gemini output was unavailable or unparseable/i.test(flag))
    ) {
      console.warn(
        "[api/ai/listing] returning fallback after Gemini failure",
        JSON.stringify({
          requestId,
          title: result.title,
          qcApproved: result.qcApproved,
          publishReady: result.publishReady,
          reasonFlags: result.reasonFlags,
        })
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ListingInputGuardError) {
      console.error(
        "[api/ai/listing] input guard error",
        JSON.stringify({
          requestId,
          status: error.status,
          message: error.message,
        })
      );
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[api/ai/listing] unhandled error", {
      requestId,
      error,
    });
    const message = error instanceof Error ? error.message : "Unable to generate listing copy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
