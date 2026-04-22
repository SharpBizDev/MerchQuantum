import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 45000;

type PrintifyShop = {
  id: number | string;
  title: string;
  sales_channel?: string;
};

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 400 });
    }

    const response = await fetchWithTimeout(`${PRINTIFY_API_BASE}/shops.json`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      logErrorToConsole("[api/printify/connect] upstream connect failed", { status: response.status });
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: response.status });
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
    logErrorToConsole("[api/printify/connect] connect failed", error);
    const payload = buildSanitizedErrorPayload("connection", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
