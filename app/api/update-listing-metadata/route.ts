import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../lib/providers/errors";
import { runWithProviderGovernor } from "../../../lib/providers/governor";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../lib/providers/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();
    const productId = String(body?.productId || "").trim();
    const requestedProvider = String(body?.provider || "").trim().toLowerCase();
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;
    const description = typeof body?.description === "string" ? body.description.trim() : undefined;
    const tags = Array.isArray(body?.tags)
      ? body.tags
          .filter((tag: unknown): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    if (!shopId || !productId) {
      return NextResponse.json({ error: "Missing shopId or productId." }, { status: 400 });
    }

    if (!title && !description && tags.length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
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
    if (!adapter.updateListingMetadata) {
      return NextResponse.json(
        { error: `${getProviderEntry(providerId)?.displayName || providerId} metadata sync is not supported in this editing pass yet.` },
        { status: 501 }
      );
    }

    const updated = await runWithProviderGovernor(providerId, "write", () =>
      adapter.updateListingMetadata!({
        credentials,
        storeId: shopId,
        sourceId: productId,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(tags.length ? { tags } : {}),
      })
    );

    return NextResponse.json({
      providerId,
      product: {
        id: updated.id || productId,
        title: updated.title || title || "",
        description: updated.description ?? description ?? "",
        tags: updated.tags ?? tags,
      },
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update listing metadata.",
      },
      { status: 500 }
    );
  }
}
