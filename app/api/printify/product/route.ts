import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get("shopId")?.trim();
    const productId = req.nextUrl.searchParams.get("productId")?.trim();

    if (!shopId || !productId) {
      return NextResponse.json(
        { error: "Missing shopId or productId." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("printify_token")?.value?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "No Printify token found. Connect again." },
        { status: 401 }
      );
    }

    const response = await fetch(
      `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(
        shopId
      )}/products/${encodeURIComponent(productId)}.json`,
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
      const text = await response.text();
      return NextResponse.json(
        { error: text || `Product request failed with status ${response.status}.` },
        { status: response.status }
      );
    }

    const product = await response.json();
    return NextResponse.json({ product });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load product.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
