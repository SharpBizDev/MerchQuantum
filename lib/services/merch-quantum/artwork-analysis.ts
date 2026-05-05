import type { ArtworkBounds } from "../../providers/types";

export const DISPLAY_PREVIEW_SAMPLE_DIMENSION = 256;
export const DISPLAY_ALPHA_THRESHOLD = 12;
export const DISPLAY_TRANSPARENCY_RATIO_THRESHOLD = 0.04;
export const DISPLAY_DARK_BACKGROUND = "#000000";
export const DISPLAY_LIGHT_BACKGROUND = "#FFFFFF";
const ARTWORK_SAFE_ZONE_PCT = 0.08;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function choosePreviewBackground(averageBrightness: number | null) {
  if (averageBrightness === null) return DISPLAY_DARK_BACKGROUND;
  return averageBrightness > 128 ? DISPLAY_DARK_BACKGROUND : DISPLAY_LIGHT_BACKGROUND;
}

export function ensureContrastPreviewBackground(background: string | null | undefined) {
  return background === DISPLAY_LIGHT_BACKGROUND ? DISPLAY_LIGHT_BACKGROUND : DISPLAY_DARK_BACKGROUND;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function buildSmartThumbnailSource(src: string | null | undefined) {
  const normalizedSrc = String(src || "").trim();
  if (
    !normalizedSrc
    || normalizedSrc.startsWith("blob:")
    || normalizedSrc.startsWith("data:")
    || normalizedSrc.startsWith("/")
  ) {
    return normalizedSrc;
  }

  try {
    const sourceUrl = new URL(normalizedSrc);
    if (sourceUrl.protocol !== "https:" || sourceUrl.pathname.startsWith("/api/providers/artwork/")) {
      return normalizedSrc;
    }

    const proxyUrl = new URL(`/api/providers/artwork/thumb-${hashString(normalizedSrc)}`, "https://merch-quantum.local");
    proxyUrl.searchParams.set("source", normalizedSrc);
    const fileName = sourceUrl.pathname.split("/").pop()?.trim();
    if (fileName) proxyUrl.searchParams.set("fileName", fileName);
    return `${proxyUrl.pathname}${proxyUrl.search}`;
  } catch {
    return normalizedSrc;
  }
}

export function normalizeArtworkBounds(bounds: ArtworkBounds | undefined, width: number, height: number): ArtworkBounds {
  const canvasWidth = Number.isFinite(bounds?.canvasWidth) && (bounds?.canvasWidth || 0) > 0 ? Number(bounds!.canvasWidth) : width;
  const canvasHeight = Number.isFinite(bounds?.canvasHeight) && (bounds?.canvasHeight || 0) > 0 ? Number(bounds!.canvasHeight) : height;
  const visibleLeft = Number.isFinite(bounds?.visibleLeft) ? clamp(Number(bounds!.visibleLeft), 0, canvasWidth) : 0;
  const visibleTop = Number.isFinite(bounds?.visibleTop) ? clamp(Number(bounds!.visibleTop), 0, canvasHeight) : 0;
  const maxVisibleWidth = Math.max(1, canvasWidth - visibleLeft);
  const maxVisibleHeight = Math.max(1, canvasHeight - visibleTop);
  const visibleWidth = Number.isFinite(bounds?.visibleWidth) && (bounds?.visibleWidth || 0) > 0
    ? clamp(Number(bounds!.visibleWidth), 1, maxVisibleWidth)
    : canvasWidth;
  const visibleHeight = Number.isFinite(bounds?.visibleHeight) && (bounds?.visibleHeight || 0) > 0
    ? clamp(Number(bounds!.visibleHeight), 1, maxVisibleHeight)
    : canvasHeight;
  const safeInsetX = Math.max(0, Math.round(visibleWidth * ARTWORK_SAFE_ZONE_PCT));
  const safeInsetY = Math.max(0, Math.round(visibleHeight * ARTWORK_SAFE_ZONE_PCT));
  const adjustedLeft = clamp(visibleLeft - safeInsetX, 0, canvasWidth);
  const adjustedTop = clamp(visibleTop - safeInsetY, 0, canvasHeight);
  const adjustedWidth = clamp(visibleWidth + safeInsetX * 2, 1, canvasWidth - adjustedLeft);
  const adjustedHeight = clamp(visibleHeight + safeInsetY * 2, 1, canvasHeight - adjustedTop);

  return {
    canvasWidth,
    canvasHeight,
    visibleLeft: adjustedLeft,
    visibleTop: adjustedTop,
    visibleWidth: adjustedWidth,
    visibleHeight: adjustedHeight,
  };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to read image preview."));
    img.src = src;
  });
}

function measureVisiblePixelBrightness(img: HTMLImageElement) {
  const sourceWidth = img.naturalWidth || img.width || 1;
  const sourceHeight = img.naturalHeight || img.height || 1;
  const longestEdge = Math.max(sourceWidth, sourceHeight, 1);
  const sampleScale = Math.min(1, DISPLAY_PREVIEW_SAMPLE_DIMENSION / longestEdge);
  const sampleWidth = Math.max(1, Math.round(sourceWidth * sampleScale));
  const sampleHeight = Math.max(1, Math.round(sourceHeight * sampleScale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

  if (!sampleCtx) {
    return null;
  }

  sampleCtx.clearRect(0, 0, sampleWidth, sampleHeight);
  sampleCtx.drawImage(img, 0, 0, sampleWidth, sampleHeight);

  const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const totalPixels = sampleWidth * sampleHeight;
  let visiblePixelCount = 0;
  let transparentPixelCount = 0;
  let weightedBrightness = 0;
  let totalAlpha = 0;

  for (let index = 0; index < imageData.length; index += 4) {
    const alpha = imageData[index + 3];
    if (alpha < 250) transparentPixelCount += 1;
    if (alpha <= DISPLAY_ALPHA_THRESHOLD) continue;

    const weight = alpha / 255;
    const luminance = (imageData[index] * 0.2126) + (imageData[index + 1] * 0.7152) + (imageData[index + 2] * 0.0722);
    visiblePixelCount += 1;
    weightedBrightness += luminance * weight;
    totalAlpha += weight;
  }

  const transparencyRatio = totalPixels > 0 ? transparentPixelCount / totalPixels : 0;
  if (!visiblePixelCount || transparencyRatio < DISPLAY_TRANSPARENCY_RATIO_THRESHOLD || totalAlpha <= 0) {
    return null;
  }

  return weightedBrightness / totalAlpha;
}

export function choosePreviewBackgroundFromImageElement(img: HTMLImageElement) {
  return choosePreviewBackground(measureVisiblePixelBrightness(img));
}

export async function resolvePreviewSurfaceBackground(src: string | null | undefined): Promise<string> {
  if (!src) return DISPLAY_DARK_BACKGROUND;

  try {
    const img = await loadImageElement(src);
    return choosePreviewBackgroundFromImageElement(img);
  } catch {
    return DISPLAY_DARK_BACKGROUND;
  }
}

export async function analyzeArtworkBounds(file: File): Promise<ArtworkBounds> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageElement(objectUrl);
    const canvasWidth = img.naturalWidth || img.width || 1;
    const canvasHeight = img.naturalHeight || img.height || 1;

    if (canvasWidth <= 0 || canvasHeight <= 0) {
      return normalizeArtworkBounds(undefined, 1, 1);
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      return normalizeArtworkBounds(undefined, canvasWidth, canvasHeight);
    }

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
    let minX = canvasWidth;
    let minY = canvasHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvasHeight; y += 1) {
      for (let x = 0; x < canvasWidth; x += 1) {
        const alpha = imageData[(y * canvasWidth + x) * 4 + 3];
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return normalizeArtworkBounds(undefined, canvasWidth, canvasHeight);
    }

    return normalizeArtworkBounds(
      {
        canvasWidth,
        canvasHeight,
        visibleLeft: minX,
        visibleTop: minY,
        visibleWidth: maxX - minX + 1,
        visibleHeight: maxY - minY + 1,
      },
      canvasWidth,
      canvasHeight
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function createPreviewObjectUrl(file: File) {
  return URL.createObjectURL(file);
}

export function isImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function readDataUrl(file: File) {
  return fileToDataUrl(file);
}

export async function urlToFile(url: string, fileName: string, fallbackType = "image/png") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to retrieve rescued artwork (${response.status}).`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
  });
}

export function getFileSignature(file: Pick<File, "name" | "size">) {
  return `${String(file.name || "").trim().toLowerCase()}::${Number(file.size || 0)}`;
}

export function autosizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${Math.max(element.scrollHeight, 124)}px`;
}