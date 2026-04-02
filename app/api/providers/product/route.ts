import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get("shopId")?.trim();
    const productId = req.nextUrl.searchParams.get("productId")?.trim();

    if (!shopId || !productId) {
      return NextResponse.json({ error: "Missing shopId or productId." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const requestedProvider = req.nextUrl.searchParams.get("provider")?.trim().toLowerCase();
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
    const detail = await adapter.getTemplateDetail({
      credentials,
      storeId: shopId,
      sourceId: productId,
    });

    return NextResponse.json({
      providerId,
      product: {
        id: detail.id,
        title: detail.title,
        description: detail.description,
      },
      placementGuide: detail.placementGuide,
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
            ? "The provider took too long to return the template product. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to load product.",
      },
      { status }
    );
  }
}
