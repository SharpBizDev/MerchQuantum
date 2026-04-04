import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError } from "../../../../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId } from "../../../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../../../lib/providers/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
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
    if (!adapter.getOrder) {
      throw new ProviderError({
        providerId,
        code: "unsupported_operation",
        status: 501,
        message: `${getProviderEntry(providerId)?.displayName || providerId} does not support order detail lookup.`,
      });
    }

    const order = await adapter.getOrder({
      credentials,
      orderId: orderId?.trim(),
      storeId: req.nextUrl.searchParams.get("storeId")?.trim() || undefined,
    });

    return NextResponse.json({
      providerId,
      order,
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
            ? "The provider took too long to return the order. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to load order.",
      },
      { status }
    );
  }
}
