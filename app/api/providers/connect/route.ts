import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getProviderAdapter, isProviderId } from "../../../../lib/providers/registry";
import { createProviderCredentials, setProviderSession } from "../../../../lib/providers/session";
import { ProviderError } from "../../../../lib/providers/errors";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const providerId = String(body?.provider || "").trim().toLowerCase();
    const token = String(body?.token || "").trim();

    if (!isProviderId(providerId)) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 400 });
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
    logErrorToConsole("[api/providers/connect] connect failed", error);
    const payload = buildSanitizedErrorPayload("connection", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
