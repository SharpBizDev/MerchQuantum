import { NextRequest, NextResponse } from "next/server";

import {
  generateListingResponse,
  type GeminiDiagnosticEvent,
  ListingInputGuardError,
  type ListingRequest,
} from "../../../../lib/ai/listing-engine";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

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
    const debugRequested =
      request.nextUrl.searchParams.get("debug") === "1" ||
      request.headers.get("x-quantum-debug") === "1";
    const diagnostics: GeminiDiagnosticEvent[] = [];
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
      return NextResponse.json({ error: getUserFacingErrorMessage("imageProcessing") }, { status: 400 });
    }

    const result = await generateListingResponse(body, {
      onDiagnosticEvent: debugRequested
        ? (event) => {
            diagnostics.push(event);
          }
        : undefined,
    });
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
    return NextResponse.json(
      debugRequested
        ? {
            ...result,
            debug: {
              requestId,
              imageMimeType,
              resolvedApiKeyPresent,
              diagnostics,
            },
          }
        : result
    );
  } catch (error) {
    if (error instanceof ListingInputGuardError) {
      logErrorToConsole("[api/ai/listing] input guard error", error);
      const payload = buildSanitizedErrorPayload("imageProcessing", error);
      return NextResponse.json({ error: payload.message }, { status: payload.status });
    }

    logErrorToConsole("[api/ai/listing] unhandled error", {
      requestId,
      error,
    });
    const payload = buildSanitizedErrorPayload("listingGeneration", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
