import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { runWithProviderGovernor } from "../../../../lib/providers/governor";
import { getProviderAdapter, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

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
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const adapter = getProviderAdapter(providerId);
    const detail = await runWithProviderGovernor(providerId, "read", () =>
      adapter.getTemplateDetail({
        credentials,
        storeId: shopId,
        sourceId: productId,
      })
    );

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
    logErrorToConsole("[api/providers/product] product detail failed", error);
    const payload = buildSanitizedErrorPayload("providerLoad", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
