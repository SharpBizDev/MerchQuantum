import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getProviderAdapter, isProviderId } from "../../../../lib/providers/registry";
import { createProviderCredentials, setProviderSession } from "../../../../lib/providers/session";
import { ProviderError } from "../../../../lib/providers/errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const providerId = String(body?.provider || "").trim().toLowerCase();
    const token = String(body?.token || "").trim();

    if (!isProviderId(providerId)) {
      return NextResponse.json({ error: "Missing or unsupported provider." }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: `Missing ${providerId} token.` }, { status: 400 });
    }

    const adapter = getProviderAdapter(providerId);
    const credentials = createProviderCredentials(token);
    const connection = await adapter.connect({ credentials });

    const cookieStore = await cookies();
    setProviderSession(cookieStore, providerId, credentials);

    return NextResponse.json({
      providerId,
      capabilities: connection.capabilities,
      shops: connection.stores.map((store) => ({
        id: store.id,
        title: store.name,
        sales_channel: store.salesChannel,
      })),
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
            ? "The provider took too long to respond. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to connect to provider.",
      },
      { status }
    );
  }
}
