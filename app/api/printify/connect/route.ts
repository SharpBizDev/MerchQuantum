import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";

type PrintifyShop = {
  id: number | string;
  title: string;
  sales_channel?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing Printify token." }, { status: 400 });
    }

    const response = await fetch(`${PRINTIFY_API_BASE}/shops.json`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: text || `Printify connect failed with status ${response.status}.` },
        { status: response.status }
      );
    }

    const shops = (await response.json()) as PrintifyShop[];

    const cookieStore = await cookies();
    cookieStore.set("printify_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ shops });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to connect to Printify.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
