import { NextRequest, NextResponse } from "next/server";

import { readHostedArtwork } from "../../../../../lib/providers/artwork";

export const runtime = "nodejs";

type ArtworkRouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

export async function GET(req: NextRequest, context: ArtworkRouteContext) {
  const { assetId } = await context.params;
  const hostedArtwork = await readHostedArtwork(assetId, {
    publicBaseUrl: req.nextUrl.origin,
  });

  if (!hostedArtwork) {
    return NextResponse.json({ error: "Hosted artwork not found." }, { status: 404 });
  }

  const body = new Blob([Uint8Array.from(hostedArtwork.buffer)], {
    type: hostedArtwork.contentType,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${hostedArtwork.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(hostedArtwork.byteLength),
      "Content-Type": hostedArtwork.contentType,
      ETag: hostedArtwork.checksum,
    },
  });
}
