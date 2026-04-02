import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { clearProviderSession } from "../../../../lib/providers/session";

export async function POST() {
  const cookieStore = await cookies();
  clearProviderSession(cookieStore);
  return NextResponse.json({ ok: true, message: "Disconnected." });
}
