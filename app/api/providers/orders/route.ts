import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../lib/providers/session";

function resolveProviderId(cookieStore: Awaited<ReturnType<typeof cookies>>, requestedProvider: string | null) {
  const normalized = requestedProvider?.trim().toLowerCase();
  return normalized && isProviderId(normalized) ? normalized : readActiveProviderId(cookieStore);
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const providerId = resolveProviderId(cookieStore, req.nextUrl.searchParams.get("provider"));

    if (!providerId) {
      return NextResponse.json({ error: "No active provider found. Connect again." }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: `No ${getProviderEntry(providerId)?.displayName || providerId} token found. Connect again.` }, { status: 401 });
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
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const status = error instanceof DOMException && error.name === "AbortError" ? 504 : 500;
    return NextResponse.json(
      {
        error:
          status === 504
            ? "The provider took too long to return order information. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to list orders.",
      },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookieStore = await cookies();
    const providerId = resolveProviderId(cookieStore, String(body?.provider || ""));

    if (!providerId) {
      return NextResponse.json({ error: "No active provider found. Connect again." }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: `No ${getProviderEntry(providerId)?.displayName || providerId} token found. Connect again.` }, { status: 401 });
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
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const status = error instanceof DOMException && error.name === "AbortError" ? 504 : 500;
    return NextResponse.json(
      {
        error:
          status === 504
            ? "The provider took too long to submit the order. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to submit order.",
      },
      { status }
    );
  }
}
