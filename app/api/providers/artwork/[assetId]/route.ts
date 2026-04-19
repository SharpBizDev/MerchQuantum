import { NextRequest, NextResponse } from "next/server";

import { readHostedArtwork } from "../../../../../lib/providers/artwork";

export const runtime = "nodejs";

type ArtworkRouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

function isPrivateAddress(hostname: string) {
  const normalized = hostname.trim().toLowerCase();

  if (
    normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "0.0.0.0"
    || normalized.endsWith(".localhost")
  ) {
    return true;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const [first, second] = normalized.split(".").map((part) => Number(part));
    if (first === 10 || first === 127 || first === 0) return true;
    if (first === 169 && second === 254) return true;
    if (first === 192 && second === 168) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
  }

  return normalized.startsWith("fc") || normalized.startsWith("fd");
}

function resolveProxySourceUrl(req: NextRequest) {
  const rawSource = req.nextUrl.searchParams.get("source");
  if (!rawSource) return null;

  try {
    const sourceUrl = new URL(rawSource);
    if (sourceUrl.protocol !== "https:") return null;
    if (isPrivateAddress(sourceUrl.hostname)) return null;
    return sourceUrl;
  } catch {
    return null;
  }
}

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

  const sourceUrl = resolveProxySourceUrl(req);
  if (!sourceUrl) {
    return NextResponse.json({ error: "Hosted artwork not found." }, { status: 404 });
  }

  const upstream = await fetch(sourceUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        error: `Unable to proxy rescued artwork (${upstream.status || 502}).`,
      },
      { status: upstream.ok ? 502 : upstream.status }
    );
  }

  const fileName = req.nextUrl.searchParams.get("fileName")?.replace(/"/g, "").trim() || `${assetId}.png`;
  const contentType =
    upstream.headers.get("content-type") ||
    req.nextUrl.searchParams.get("contentType") ||
    "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");
  const eTag = upstream.headers.get("etag");

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${fileName}"`,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
      "Content-Type": contentType,
      ...(eTag ? { ETag: eTag } : {}),
    },
  });
}
