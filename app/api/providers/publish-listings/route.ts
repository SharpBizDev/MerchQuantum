import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/providers/errors";
import { runWithProviderGovernor } from "../../../../lib/providers/governor";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";

type IncomingPublishItem = {
  productId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  publishReady?: boolean;
  qcApproved?: boolean;
};

function validateApprovedItem(item: IncomingPublishItem) {
  if (!String(item?.productId || "").trim()) {
    return "Missing productId for publish operation.";
  }

  if (item?.publishReady !== true || item?.qcApproved !== true) {
    return "Only Approved items can be published.";
  }

  if (!String(item?.title || "").trim() || !String(item?.description || "").trim()) {
    return "Only fully rewritten Approved items can be published.";
  }

  if (!Array.isArray(item?.tags) || item.tags.filter((tag) => typeof tag === "string" && !!tag.trim()).length === 0) {
    return "Only Approved items with generated tags can be published.";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();
    const requestedProvider = String(body?.provider || "").trim().toLowerCase();
    const items = Array.isArray(body?.items)
      ? (body.items as IncomingPublishItem[])
      : [];

    if (!shopId || items.length === 0) {
      return NextResponse.json({ error: "Missing shopId or publish items." }, { status: 400 });
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
    if (!adapter.publishProduct || !adapter.capabilities.supportsPublishStep) {
      throw new ProviderError({
        providerId,
        code: "unsupported_operation",
        status: 501,
        message: `${getProviderEntry(providerId)?.displayName || providerId} direct publishing is not supported in this pass yet.`,
      });
    }

    const results = [];
    for (const item of items) {
      const validationMessage = validateApprovedItem(item);
      if (validationMessage) {
        results.push({
          productId: item.productId || "",
          message: validationMessage,
        });
        continue;
      }

      try {
        await runWithProviderGovernor(providerId, "write", () =>
          adapter.publishProduct!({
            credentials,
            storeId: shopId,
            productId: String(item.productId || "").trim(),
          })
        );

        results.push({
          productId: item.productId || "",
          message: "Publish request accepted.",
        });
      } catch (error) {
        const normalized =
          error instanceof ProviderError
            ? error
            : new ProviderError({
                providerId,
                code: "upstream_error",
                status: 500,
                message: error instanceof Error ? error.message : "Unable to publish the selected product.",
              });

        results.push({
          productId: item.productId || "",
          message: normalized.message,
        });
      }
    }

    return NextResponse.json({
      providerId,
      results,
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
            ? "The provider took too long to accept the publish request. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to publish approved listings.",
      },
      { status }
    );
  }
}
