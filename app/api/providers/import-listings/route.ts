import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/providers/errors";
import { runWithProviderGovernor } from "../../../../lib/providers/governor";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";
import type { NormalizedImportedListingDetail, NormalizedRecoveredArtwork } from "../../../../lib/providers/types";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

const MAX_IMPORT_ITEMS = 100;

function buildArtworkProxyUrl(
  req: NextRequest,
  providerId: string,
  sourceId: string,
  artwork: NormalizedRecoveredArtwork
) {
  const assetKey = encodeURIComponent(String(artwork.assetId || sourceId || "rescued-artwork"));
  const proxyUrl = new URL(`/api/providers/artwork/${assetKey}`, req.nextUrl.origin);
  proxyUrl.searchParams.set("provider", providerId);
  proxyUrl.searchParams.set("source", artwork.url);
  if (artwork.fileName) proxyUrl.searchParams.set("fileName", artwork.fileName);
  if (artwork.contentType) proxyUrl.searchParams.set("contentType", artwork.contentType);
  return proxyUrl.toString();
}

function normalizeImportedListingForClient(
  req: NextRequest,
  providerId: string,
  detail: NormalizedImportedListingDetail
) {
  if (!detail.artwork?.url) {
    return detail;
  }

  const proxiedUrl = buildArtworkProxyUrl(req, providerId, detail.id, detail.artwork);

  return {
    ...detail,
    artwork: {
      ...detail.artwork,
      url: proxiedUrl,
      previewUrl: proxiedUrl,
    },
  } satisfies NormalizedImportedListingDetail;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();
    const requestedProvider = String(body?.provider || "").trim().toLowerCase();
    const sourceIds = Array.isArray(body?.sourceIds)
      ? body.sourceIds
        .filter((value: unknown): value is string => typeof value === "string")
        .map((value: string) => value.trim())
        .filter(Boolean)
      : [];

    if (!shopId || sourceIds.length === 0) {
      return NextResponse.json({ error: "Missing shopId or sourceIds." }, { status: 400 });
    }

    if (sourceIds.length > MAX_IMPORT_ITEMS) {
      return NextResponse.json({ error: `Import queue is capped at ${MAX_IMPORT_ITEMS} products per run.` }, { status: 400 });
    }

    const cookieStore = await cookies();
    const providerId =
      requestedProvider && isProviderId(requestedProvider)
        ? requestedProvider
        : readActiveProviderId(cookieStore);

    if (!providerId) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json(
        { error: getUserFacingErrorMessage("connection") },
        { status: 401 }
      );
    }

    const adapter = getProviderAdapter(providerId);
    if (!adapter.getImportedListingDetail) {
      throw new ProviderError({
        providerId,
        code: "unsupported_operation",
        status: 501,
        message: `${getProviderEntry(providerId)?.displayName || providerId} reverse ingestion is not supported in this pass yet.`,
      });
    }

    const items = [];
    for (const sourceId of sourceIds) {
      const detail = await runWithProviderGovernor(providerId, "read", () =>
        adapter.getImportedListingDetail!({
          credentials,
          storeId: shopId,
          sourceId,
        })
      );

      items.push(normalizeImportedListingForClient(req, providerId, detail));
    }

    return NextResponse.json({
      providerId,
      items,
    });
  } catch (error) {
    logErrorToConsole("[api/providers/import-listings] import failed", error);
    const payload = buildSanitizedErrorPayload("listingImport", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
