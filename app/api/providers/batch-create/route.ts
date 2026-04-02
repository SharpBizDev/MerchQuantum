import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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
};

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
    const templateDetail = await adapter.getTemplateDetail({
      credentials,
      storeId: shopId,
      sourceId: templateProductId,
    });

    const results = [];
    for (const item of items) {
      try {
        const created = await adapter.createDraftProduct({
          credentials,
          storeId: shopId,
          templateId: templateProductId,
          templateDetail,
          item,
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
