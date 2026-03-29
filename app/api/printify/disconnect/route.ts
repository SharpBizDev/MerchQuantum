import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set("printify_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return NextResponse.json({ ok: true, message: "Disconnected." });
}

