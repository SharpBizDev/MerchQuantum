import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { publishHostedArtwork } from "../../../../lib/providers/artwork";
import { ProviderError } from "../../../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";

type ArtworkBounds = {
  canvasWidth?: number;
  canvasHeight?: number;
  visibleLeft?: number;
  visibleTop?: number;
  visibleWidth?: number;
  visibleHeight?: number;
};

type IncomingItem = {
  fileName: string;
  title: string;
  description: string;
  tags: string[];
  imageDataUrl: string;
  artworkBounds?: ArtworkBounds;
  publishReady?: boolean;
  qcApproved?: boolean;
};

function containsRawAiArtifacts(value: string) {
  return /```|^\s*json\b|seo_(title|paragraph_1|paragraph_2|tags)\b|qc_status\b|^\s*[\[{]/i.test(value);
}

function stripHtmlForValidation(value: string) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ");
}

function hasStructuredMarketingDescription(description: string) {
  const paragraphs = stripHtmlForValidation(description)
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length >= 2 && paragraphs[0].length >= 24 && paragraphs[1].length >= 24;
}

export function validateReadyDraftItem(item: IncomingItem) {
  const title = String(item?.title || "").trim();
  const description = String(item?.description || "").trim();
  const tags = Array.isArray(item?.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string" && !!tag.trim()) : [];

  if (item?.publishReady !== true) {
    return "Only Good items can be published. Re-run or remove failed artwork before uploading drafts.";
  }

  if (item?.qcApproved !== true) {
    return "QC-rejected artwork cannot be published.";
  }

  if (!title || !description || tags.length === 0) {
    return "Only fully generated Good items with title, description, and tags can be published.";
  }

  if (containsRawAiArtifacts(title) || containsRawAiArtifacts(description) || tags.some((tag) => containsRawAiArtifacts(tag))) {
    return "Only sanitized Good items can be published. Re-run artwork that still contains raw AI output.";
  }

  if (!hasStructuredMarketingDescription(description)) {
    return "Only fully assembled Good items with buyer-facing marketing paragraphs can be published.";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shopId = String(body?.shopId || "").trim();
    const templateProductId = String(body?.templateProductId || "").trim();
    const items = Array.isArray(body?.items)
      ? (body.items as IncomingItem[])
      : body?.item
        ? [body.item as IncomingItem]
        : [];
    const requestedProvider = String(body?.provider || "").trim().toLowerCase();

    if (!shopId || !templateProductId || !items.length) {
      return NextResponse.json({ error: "Missing shopId, templateProductId, or item payload." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const providerId =
      requestedProvider && isProviderId(requestedProvider)
        ? requestedProvider
        : readActiveProviderId(cookieStore);

    if (!providerId) {
      return NextResponse.json({ error: "No active provider found. Connect again." }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: `No ${getProviderEntry(providerId)?.displayName || providerId} token found. Connect again.` }, { status: 401 });
    }

    const adapter = getProviderAdapter(providerId);
    if (!adapter.capabilities.supportsStoreTemplateDraftFlow) {
      throw new ProviderError({
        providerId,
        code: "unsupported_operation",
        status: 501,
        message: `${getProviderEntry(providerId)?.displayName || providerId} is not available through the current store/template draft workflow yet.`,
      });
    }

    const templateDetail = await adapter.getTemplateDetail({
      credentials,
      storeId: shopId,
      sourceId: templateProductId,
    });

    const results = [];
    for (const item of items) {
      try {
        const validationMessage = validateReadyDraftItem(item);
        if (validationMessage) {
          throw new ProviderError({
            providerId,
            code: "validation_error",
            status: 400,
            message: validationMessage,
          });
        }

        const hostedArtwork = adapter.capabilities.requiresHostedArtwork
          ? await publishHostedArtwork({
              providerId,
              fileName: item.fileName,
              imageDataUrl: item.imageDataUrl,
              publicBaseUrl: req.nextUrl.origin,
            })
          : undefined;

        const created = await adapter.createDraftProduct({
          credentials,
          storeId: shopId,
          templateId: templateProductId,
          templateDetail,
          item,
          hostedArtwork,
        });

        results.push({
          fileName: created.fileName,
          title: created.title,
          productId: created.productId,
          message: created.message,
        });
      } catch (error) {
        const normalizedError =
          error instanceof ProviderError
            ? error
            : new ProviderError({
                providerId,
                code: "upstream_error",
                status: 500,
                message: error instanceof Error ? error.message : "Batch item failed.",
              });

        results.push({
          fileName: item.fileName,
          title: item.title,
          message: normalizedError.message,
        });
      }
    }

    const createdCount = results.filter((result) => !!result.productId).length;

    return NextResponse.json({
      providerId,
      message: `Processed ${results.length} item(s). Saved ${createdCount} draft product${createdCount === 1 ? "" : "s"}.`,
      results,
      placementGuide: templateDetail.placementGuide,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const status = error instanceof DOMException && error.name === "AbortError" ? 504 : 500;
    return NextResponse.json(
      {
        error:
          status === 504
            ? "The provider took too long to respond during draft creation. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to run batch create.",
      },
      { status }
    );
  }
}
