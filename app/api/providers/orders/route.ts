import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

function resolveProviderId(cookieStore: Awaited<ReturnType<typeof cookies>>, requestedProvider: string | null) {
  const normalized = requestedProvider?.trim().toLowerCase();
  return normalized && isProviderId(normalized) ? normalized : readActiveProviderId(cookieStore);
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const providerId = resolveProviderId(cookieStore, req.nextUrl.searchParams.get("provider"));

    if (!providerId) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const adapter = getProviderAdapter(providerId);
    if (!adapter.listOrders) {
      throw new ProviderError({
        providerId,
        code: "unsupported_operation",
        status: 501,
        message: `${getProviderEntry(providerId)?.displayName || providerId} does not support order listing.`,
      });
    }

    const orders = await adapter.listOrders({
      credentials,
      storeId: req.nextUrl.searchParams.get("storeId")?.trim() || undefined,
    });

    return NextResponse.json({
      providerId,
      orders,
    });
  } catch (error) {
    logErrorToConsole("[api/providers/orders] list orders failed", error);
    const payload = buildSanitizedErrorPayload("order", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookieStore = await cookies();
    const providerId = resolveProviderId(cookieStore, String(body?.provider || ""));

    if (!providerId) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const orderInput = body?.orderInput;
    if (!orderInput || typeof orderInput !== "object") {
      return NextResponse.json({ error: "Missing orderInput." }, { status: 400 });
    }

    const adapter = getProviderAdapter(providerId);
    if (!adapter.submitOrder) {
      throw new ProviderError({
        providerId,
        code: "unsupported_operation",
        status: 501,
        message: `${getProviderEntry(providerId)?.displayName || providerId} does not support order submission.`,
      });
    }

    const result = await adapter.submitOrder({
      credentials,
      orderInput,
    });

    return NextResponse.json({
      providerId,
      result,
    });
  } catch (error) {
    logErrorToConsole("[api/providers/orders] submit order failed", error);
    const payload = buildSanitizedErrorPayload("order", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
