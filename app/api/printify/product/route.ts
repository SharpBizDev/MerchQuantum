import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 45000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    const errorValue = payload?.error || payload?.message;
    if (typeof errorValue === "string" && errorValue.trim()) {
      return errorValue.trim();
    }
  }

  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get("shopId")?.trim();
    const productId = req.nextUrl.searchParams.get("productId")?.trim();

    if (!shopId || !productId) {
      return NextResponse.json({ error: "Missing shopId or productId." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("printify_token")?.value?.trim();

    if (!token) {
      return NextResponse.json({ error: "No Printify token found. Connect again." }, { status: 401 });
    }

    const response = await fetchWithTimeout(
      `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}.json`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const text = await readErrorMessage(
        response,
        `Product request failed with status ${response.status}.`
      );
      return NextResponse.json({ error: text }, { status: response.status });
    }

    const product = await response.json();
    return NextResponse.json({ product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load product.";
    const status = error instanceof DOMException && error.name === "AbortError" ? 504 : 500;
    return NextResponse.json(
      {
        error:
          status === 504
            ? "Printify took too long to return the template product. Please try again."
            : message,
      },
      { status }
    );
  }
}
