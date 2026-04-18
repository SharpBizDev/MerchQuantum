import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ProviderError, providerErrorFromResponse, toProviderError } from "../../../lib/providers/errors";
import { getProviderEntry, isProviderId } from "../../../lib/providers/registry";
import { readActiveProviderId, readProviderCredentials } from "../../../lib/providers/session";
import type { ProviderCredentials, ProviderId } from "../../../lib/providers/types";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const REQUEST_TIMEOUT_MS = 30000;
const USER_AGENT = "MerchQuantum";

type PrintifyProductResponse = {
  id?: string;
  title?: string;
  description?: string;
};

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function updatePrintifyListingMetadata(
  credentials: ProviderCredentials,
  shopId: string,
  productId: string,
  input: { title?: string; description?: string }
) {
  const response = await fetchWithTimeout(
    `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}.json`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw await providerErrorFromResponse("printify", response, "Unable to update Printify listing metadata.");
  }

  return response.json() as Promise<PrintifyProductResponse>;
}

function resolveProviderId(cookieStore: Awaited<ReturnType<typeof cookies>>, requestedProvider: string): ProviderId | null {
  if (requestedProvider && isProviderId(requestedProvider)) {
    return requestedProvider;
  }

  return readActiveProviderId(cookieStore);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();
    const productId = String(body?.productId || "").trim();
    const requestedProvider = String(body?.provider || "").trim().toLowerCase();
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;
    const description = typeof body?.description === "string" ? body.description.trim() : undefined;

    if (!shopId || !productId) {
      return NextResponse.json({ error: "Missing shopId or productId." }, { status: 400 });
    }

    if (!title && !description) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const providerId = resolveProviderId(cookieStore, requestedProvider);
    if (!providerId) {
      return NextResponse.json({ error: "No active provider found. Connect again." }, { status: 401 });
    }

    const credentials = readProviderCredentials(cookieStore, providerId);
    if (!credentials) {
      return NextResponse.json({ error: `No ${getProviderEntry(providerId)?.displayName || providerId} token found. Connect again.` }, { status: 401 });
    }

    if (providerId !== "printify") {
      return NextResponse.json(
        { error: `${getProviderEntry(providerId)?.displayName || providerId} metadata sync is not supported in this editing pass yet.` },
        { status: 501 }
      );
    }

    const updated = await updatePrintifyListingMetadata(credentials, shopId, productId, {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    });

    return NextResponse.json({
      providerId,
      product: {
        id: updated.id || productId,
        title: updated.title || title || "",
        description: updated.description ?? description ?? "",
      },
    });
  } catch (error) {
    const providerId = "printify";
    const normalized = toProviderError(error, {
      providerId,
      code: "upstream_error",
      status: 500,
      message: "Unable to update listing metadata.",
    });

    if (normalized instanceof ProviderError) {
      return NextResponse.json({ error: normalized.message }, { status: normalized.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update listing metadata.",
      },
      { status: 500 }
    );
  }
}
