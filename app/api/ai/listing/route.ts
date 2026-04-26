import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildDeterministicFallbackListingResponse,
  generateListingResponse,
  type VisionDiagnosticEvent,
  ListingInputGuardError,
  type ListingRequest,
  type ListingUiResponse,
} from "../../../../lib/ai/listing-engine";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORCE_BLACKLISTED_FILLER_PATTERNS = [
  { label: "stunning", pattern: /\bstunning\b/i },
  { label: "must-have", pattern: /\bmust[- ]have\b/i },
  { label: "perfect for", pattern: /\bperfect for\b/i },
  { label: "casual", pattern: /\bcasual\b/i },
  { label: "weekend plans", pattern: /\bweekend plans\b/i },
  { label: "everyday wear", pattern: /\beveryday wear\b/i },
  { label: "gift-friendly", pattern: /\bgift-friendly\b/i },
  { label: "fits naturally", pattern: /\bfits naturally\b/i },
  { label: "keeps the message clear", pattern: /\bkeeps the message clear\b/i },
  { label: "shopping for", pattern: /\bshopping for\b/i },
] as const;

const channelDraftSchema = z.object({
  title: z.string(),
  leadParagraphs: z.array(z.string()),
  discoveryTerms: z.array(z.string()),
}).strict();

const semanticRecordSchema = z.object({
  productNoun: z.string(),
  titleCore: z.string(),
  benefitCore: z.string(),
  likelyAudience: z.string(),
  styleOccasion: z.string(),
  visibleKeywords: z.array(z.string()),
  inferredKeywords: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
}).strict();

const listingUiResponseSchema = z.object({
  qcApproved: z.boolean(),
  publishReady: z.boolean(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  leadParagraphs: z.array(z.string()),
  leadParagraph1: z.string(),
  leadParagraph2: z.string(),
  model: z.string(),
  confidence: z.number().finite(),
  reasonFlags: z.array(z.string()),
  source: z.enum(["gemini", "fallback"]),
  grade: z.enum(["green", "red"]),
  marketplaceDrafts: z.object({
    etsy: channelDraftSchema,
    amazon: channelDraftSchema,
    ebay: channelDraftSchema,
    tiktokShop: channelDraftSchema,
  }).strict(),
  semanticRecord: semanticRecordSchema,
}).strict().superRefine((payload, ctx) => {
  if (payload.source !== "gemini") return;

  const exactTitle = normalizeForceText(payload.title);
  const normalizedDescription = normalizeForceText(payload.description);

  if (exactTitle && normalizedDescription.includes(exactTitle)) {
    ctx.addIssue({
      code: "custom",
      message: "description contains the exact title string",
      path: ["description"],
    });
  }

  for (const filler of FORCE_BLACKLISTED_FILLER_PATTERNS) {
    if (filler.pattern.test(payload.description)) {
      ctx.addIssue({
        code: "custom",
        message: `description contains blacklisted filler phrase \"${filler.label}\"`,
        path: ["description"],
      });
    }
  }
});

class ForceValidationError extends Error {
  rejectionReason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "ForceValidationError";
    this.rejectionReason = reason;
  }
}

function normalizeForceText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatForceIssue(issue: z.ZodIssue) {
  const reason = normalizeForceText(issue.message || "");
  if (reason) return reason;

  const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
  return `schema validation failed at ${path}`;
}

function validateForcePayload(payload: ListingUiResponse) {
  const parsed = listingUiResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ForceValidationError(formatForceIssue(parsed.error.issues[0]));
  }

  return parsed.data;
}

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
    const body = await request.json()
      .then((payload) => payload as ListingRequest)
      .catch((error: unknown) => {
        logErrorToConsole("[api/ai/listing] invalid request json", {
          requestId,
          error,
        });
        throw new Error("Invalid JSON request body.");
      });
    const debugRequested =
      request.nextUrl.searchParams.get("debug") === "1" ||
      request.headers.get("x-quantum-debug") === "1";
    const diagnostics: VisionDiagnosticEvent[] = [];
    const imageMimeType = detectImageMimeType(body?.imageDataUrl);
    const xaiApiKeyPresent = Boolean(process.env.XAI_API_KEY);
    const resolvedApiKeyPresent = xaiApiKeyPresent;

    console.log(
      "[api/ai/listing] request",
      JSON.stringify({
        requestId,
        imageMimeType,
        fileNamePresent: Boolean(body?.fileName),
        productFamily: body?.productFamily || null,
        resolvedApiKeyPresent,
        xaiApiKeyPresent,
      })
    );

    if (!body?.imageDataUrl) {
      return NextResponse.json({ error: getUserFacingErrorMessage("imageProcessing") }, { status: 400 });
    }

    const candidate = await generateListingResponse(body, {
      onDiagnosticEvent: debugRequested
        ? (event) => {
            diagnostics.push(event);
          }
        : undefined,
      strictFailureMode: true,
    });

    const result = (() => {
      try {
        return validateForcePayload(candidate);
      } catch (error) {
        if (!(error instanceof ForceValidationError)) {
          throw error;
        }

        console.warn(
          "[api/ai/listing] F.O.R.C.E. validation rejected Grok payload; returning deterministic fallback",
          JSON.stringify({
            requestId,
            reason: error.rejectionReason,
          })
        );

        return buildDeterministicFallbackListingResponse(body, {
          model: candidate.model,
          retryCount: 1,
        });
      }
    })();

    if (
      result.source === "fallback" &&
      result.reasonFlags.some((flag) => /bounded grok attempt|grok output was unavailable or unparseable/i.test(flag))
    ) {
      console.warn(
        "[api/ai/listing] returning fallback after Grok failure",
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
    if (error instanceof Error && error.message === "Invalid JSON request body.") {
      return NextResponse.json({ error: "Schema Validation Failed" }, { status: 400 });
    }

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
