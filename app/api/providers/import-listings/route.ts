import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/providers/errors";
import { runWithProviderGovernor } from "../../../../lib/providers/governor";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";

const MAX_IMPORT_ITEMS = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();
    const requestedProvider = String(body?.provider || "").trim().toLowerCase();
    const sourceIds = Array.isArray(body?.sourceIds)
      ? body.sourceIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
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
      return NextResponse.json({ error: "No active provider found. Connect again." }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json(
        { error: `No ${getProviderEntry(providerId)?.displayName || providerId} token found. Connect again.` },
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

      items.push(detail);
    }

    return NextResponse.json({
      providerId,
      items,
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
            ? "The provider took too long to return legacy catalog data. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to import existing provider listings.",
      },
      { status }
    );
  }
}
