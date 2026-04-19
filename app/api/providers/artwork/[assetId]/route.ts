import { NextRequest, NextResponse } from "next/server";

import { readHostedArtwork } from "../../../../../lib/providers/artwork";

export const runtime = "nodejs";
export const maxDuration = 60;

type ArtworkRouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
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

function normalizeContentType(value: string | null | undefined) {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function inferImageContentType(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() || "";
  return IMAGE_MIME_BY_EXTENSION[extension] || "";
}

function buildErrorResponse(status: number, code: string, message: string, details?: Record<string, unknown>) {
  console.error(code, details || {});
  return NextResponse.json(
    {
      error: `${code}: ${message}`,
    },
    { status }
  );
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

  try {
    const hostedArtwork = await readHostedArtwork(assetId, {
      publicBaseUrl: req.nextUrl.origin,
    });

    if (hostedArtwork) {
      const hostedBytes = new Uint8Array(hostedArtwork.buffer.byteLength);
      hostedBytes.set(hostedArtwork.buffer);

      const hostedBody = new Blob([hostedBytes], {
        type: hostedArtwork.contentType,
      });

      return new NextResponse(hostedBody, {
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

    const sourceUrl = resolveProxySourceUrl(req);
    if (!sourceUrl) {
      return buildErrorResponse(404, "[IMAGE_FETCH_ERROR]", "Hosted artwork was not found and no valid rescue source URL was supplied.", {
        assetId,
      });
    }

    let upstream: Response;
    try {
      upstream = await fetch(sourceUrl, {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      return buildErrorResponse(502, "[IMAGE_FETCH_ERROR]", "Unable to download rescued artwork from the provider.", {
        assetId,
        sourceHost: sourceUrl.hostname,
        sourcePath: sourceUrl.pathname,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (!upstream.ok || !upstream.body) {
      return buildErrorResponse(upstream.ok ? 502 : upstream.status, "[IMAGE_FETCH_ERROR]", `Provider artwork download failed with status ${upstream.status}.`, {
        assetId,
        sourceHost: sourceUrl.hostname,
        sourcePath: sourceUrl.pathname,
        upstreamStatus: upstream.status,
      });
    }

    const fileName = req.nextUrl.searchParams.get("fileName")?.replace(/"/g, "").trim() || `${assetId}.png`;
    const requestedContentType = normalizeContentType(req.nextUrl.searchParams.get("contentType"));
    const upstreamContentType = normalizeContentType(upstream.headers.get("content-type"));
    const inferredContentType = inferImageContentType(fileName) || inferImageContentType(sourceUrl.pathname);
    const contentType = upstreamContentType || requestedContentType || inferredContentType;

    if (!contentType.startsWith("image/")) {
      return buildErrorResponse(502, "[IMAGE_FETCH_ERROR]", "Provider returned non-image content for rescued artwork.", {
        assetId,
        sourceHost: sourceUrl.hostname,
        sourcePath: sourceUrl.pathname,
        upstreamStatus: upstream.status,
        upstreamContentType,
        requestedContentType,
      });
    }

    const contentLength = upstream.headers.get("content-length");
    const eTag = upstream.headers.get("etag");

    if (contentLength && Number(contentLength) > 4_500_000) {
      console.warn("[IMAGE_FETCH_WARNING]", {
        assetId,
        sourceHost: sourceUrl.hostname,
        sourcePath: sourceUrl.pathname,
        byteLength: Number(contentLength),
        message: "Large rescued artwork is being streamed through the artwork proxy.",
      });
    }

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
  } catch (error) {
    return buildErrorResponse(500, "[IMAGE_FETCH_ERROR]", "Unexpected rescued artwork proxy failure.", {
      assetId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
