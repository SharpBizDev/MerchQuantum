import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { ProviderError } from "../../../../lib/providers/errors";
import { runWithProviderGovernor } from "../../../../lib/providers/governor";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get("shopId")?.trim();
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const requestedProvider = req.nextUrl.searchParams.get("provider")?.trim().toLowerCase();
    const providerId =
      requestedProvider && isProviderId(requestedProvider)
        ? requestedProvider
        : readActiveProviderId(cookieStore);

    if (!providerId) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const adapter = getProviderAdapter(providerId);
    const products = await runWithProviderGovernor(providerId, "read", () =>
      adapter.listTemplatesOrProducts({
        credentials,
        storeId: shopId,
      })
    );

    return NextResponse.json({
      providerId,
      products: products.map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description || "",
        shop_id: product.storeId,
        preview_url: product.previewUrl || "",
      })),
    });
  } catch (error) {
    logErrorToConsole("[api/providers/products] product list failed", error);
    const payload = buildSanitizedErrorPayload("providerLoad", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
