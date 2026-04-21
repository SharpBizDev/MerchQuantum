'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PROVIDER_OPTIONS, type ProviderChoiceId } from "../../lib/providers/client-options";

const APP_TAGLINE = "Bulk product creation, simplified";
const BOOT_TAGLINE = "EFFORTLESS PRODUCT CREATION.";
const ACTIVE_BATCH_FILES = 50;
const CONNECTED_TOTAL_BATCH_FILES = 50;
const FIXED_TAG_COUNT = 13;
const BOOT_SWEEP_START_MS = 1200;
const BOOT_OVERLAY_FADE_MS = 1520;
const BOOT_OVERLAY_UNMOUNT_MS = 220;
export const QUANTUM_TITLE_AWAITING_TEXT = "Awaiting Quantum AI title...";
export const QUANTUM_DESCRIPTION_AWAITING_TEXT = "Awaiting Quantum AI description...";

type ProviderId =
  | "printify"
  | "printful"
  | "gooten"
  | "apliiq"
  | "spod"
  | "spreadconnect";

type ProductFamily =
  | "t-shirt"
  | "hoodie"
  | "sweatshirt"
  | "tank top"
  | "hat"
  | "drinkware"
  | "candle"
  | "bath-body"
  | "home-kitchen"
  | "wall-art"
  | "sticker"
  | "bag"
  | "accessory"
  | "footwear"
  | "product";

type ArtworkBounds = {
  canvasWidth: number;
  canvasHeight: number;
  visibleLeft: number;
  visibleTop: number;
  visibleWidth: number;
  visibleHeight: number;
};

type PlacementGuide = {
  position: string;
  width: number;
  height: number;
  source: "live" | "fallback";
  decorationMethod?: string;
};

type ItemStatus = "pending" | "ready" | "error";
type AiFieldKey = "title" | "description" | "tags";
type AiFieldStatus = "idle" | "loading" | "ready" | "error";
type AiFieldStates = Record<AiFieldKey, AiFieldStatus>;

type AiListingDraft = {
  title: string;
  leadParagraphs: string[];
  model: string;
  confidence: number;
  templateReference: string;
  reasonFlags: string[];
  source: "gemini" | "fallback";
  grade: "green" | "red";
  qcApproved?: boolean;
  publishReady?: boolean;
};

type ImportedArtwork = {
  assetId?: string;
  fileName: string;
  url: string;
  previewUrl?: string;
  contentType?: string;
  width?: number;
  height?: number;
};

type Img = {
  id: string;
  name: string;
  file: File;
  preview: string;
  previewBackground: string;
  cleaned: string;
  final: string;
  finalDescription: string;
  tags: string[];
  status: ItemStatus;
  statusReason: string;
  aiProcessing?: boolean;
  aiFieldStates: AiFieldStates;
  processedTemplateKey?: string;
  artworkBounds?: ArtworkBounds;
  aiDraft?: AiListingDraft;
  sourceType?: "upload" | "imported";
  providerId?: ProviderId;
  providerStoreId?: string;
  providerProductId?: string;
  templateDescriptionOverride?: string;
  templateReferenceOverride?: string;
  productFamilyOverride?: ProductFamily;
  importedArtwork?: ImportedArtwork | null;
  originalListingTitle?: string;
  originalListingDescription?: string;
  syncState?: "idle" | "syncing" | "synced" | "error";
  syncMessage?: string;
};

type InlineEditableField = "title" | "description" | null;
type InlineSaveTone = "idle" | "saving" | "saved" | "error";

type InlineSaveFeedback = {
  field: Exclude<InlineEditableField, null>;
  tone: InlineSaveTone;
  message: string;
};

type MetadataSectionKey = "title" | "description" | "tags";
type WorkspaceMode = "" | "create" | "edit";
type ThumbnailHoverPreview = {
  key: string;
  title: string;
  snippet: string;
  imageUrl?: string;
  background?: string;
};

type Template = {
  reference: string;
  nickname: string;
  source: "product" | "manual";
  shopId: string;
  description: string;
  placementGuide?: PlacementGuide;
};

type Shop = { id: string; title: string };

type Product = {
  id: string;
  title: string;
  type: string;
  shopId: string;
  description?: string;
  previewUrl?: string;
};

type ApiShop = { id: number | string; title: string; sales_channel?: string };
type ApiProduct = {
  id: string;
  title: string;
  description?: string;
  shop_id?: number | string;
  preview_url?: string;
  blueprint_id?: number;
  print_provider_id?: number;
};

type ApiTemplateResponse = {
  product?: ApiProduct & { description?: string };
  placementGuide?: PlacementGuide;
};

type BatchResult = {
  fileName: string;
  title: string;
  productId?: string;
  message: string;
};

type ImportedListingRecord = {
  id: string;
  storeId: string;
  title: string;
  description: string;
  tags: string[];
  templateDescription: string;
  artwork: ImportedArtwork | null;
};

const PROVIDERS = PROVIDER_OPTIONS;

const LISTING_LIMITS: {
  titleMin: number;
  titleMax: number;
  descriptionMin: number;
  descriptionMax: number;
  descriptionTargetWords: number;
  tagCount: number;
} = {
  titleMin: 45,
  titleMax: 120,
  descriptionMin: 220,
  descriptionMax: 1200,
  descriptionTargetWords: 150,
  tagCount: 13,
};

const DEFAULT_PLACEMENT_GUIDE: PlacementGuide = {
  position: "front",
  width: 3153,
  height: 3995,
  source: "fallback",
};

const AI_MODEL_LABEL = "Quantum AI";
const AI_TITLE_MIN_CHARS = LISTING_LIMITS.titleMin;
const AI_TITLE_MAX_CHARS = LISTING_LIMITS.titleMax;
const AI_LEAD_MIN_CHARS = LISTING_LIMITS.descriptionMin;
const AI_LEAD_MAX_CHARS = 380;
const IMPORT_QUEUE_LIMIT = 50;
const DISPLAY_PREVIEW_SAMPLE_DIMENSION = 256;
const DISPLAY_PREVIEW_MAX_DIMENSION = 960;
const DISPLAY_ALPHA_THRESHOLD = 12;
const DISPLAY_TRANSPARENCY_RATIO_THRESHOLD = 0.04;
const DISPLAY_DARK_BACKGROUND = "#000000";
const DISPLAY_LIGHT_BACKGROUND = "#FFFFFF";
const DISPLAY_NEUTRAL_BACKGROUND = "#020616";
const ARTWORK_SAFE_ZONE_PCT = 0.08;
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "of",
  "to",
  "in",
  "on",
  "graphic",
  "unisex",
  "shirt",
  "t",
  "tee",
  "this",
  "it",
  "product",
  "features",
  "care",
  "instructions",
  "size",
  "chart",
  "details",
  "made",
  "from",
  "your",
  "our",
  "that",
  "will",
  "into",
  "front",
  "print",
  "design",
  "style",
]);

const FAMILY_RULES: Array<{
  family: ProductFamily;
  patterns: RegExp[];
}> = [
  {
    family: "t-shirt",
    patterns: [
      /\b(t[- ]?shirt|tee|graphic tee|short sleeve tee|heavyweight tee|softstyle tee|cotton tee)\b/i,
    ],
  },
  {
    family: "hoodie",
    patterns: [/\b(hoodie|pullover hoodie|zip hoodie|hooded sweatshirt)\b/i],
  },
  {
    family: "sweatshirt",
    patterns: [/\b(sweatshirt|crewneck|crew neck|fleece pullover)\b/i],
  },
  {
    family: "tank top",
    patterns: [/\b(tank top|tank|sleeveless tee|muscle tank|racerback)\b/i],
  },
  {
    family: "hat",
    patterns: [/\b(hat|cap|beanie|snapback|dad hat|trucker hat|bucket hat)\b/i],
  },
  {
    family: "drinkware",
    patterns: [/\b(mug|tumbler|cup|glassware|glass|bottle|drinkware|travel mug)\b/i],
  },
  {
    family: "candle",
    patterns: [/\b(candle|soy candle|scented candle|jar candle|wax melt)\b/i],
  },
  {
    family: "bath-body",
    patterns: [
      /\b(soap|body bar|bath bomb|toothpaste|body wash|lotion|scrub|personal care|bath and body)\b/i,
    ],
  },
  {
    family: "home-kitchen",
    patterns: [
      /\b(cutting board|serving board|kitchen|home decor|blanket|pillow|towel|ornament|coaster|journal|notebook|kitchen accessory|home good|mat|rug)\b/i,
    ],
  },
  {
    family: "wall-art",
    patterns: [/\b(poster|canvas|art print|wall art|framed print|print)\b/i],
  },
  {
    family: "sticker",
    patterns: [/\b(sticker|decal|kiss cut)\b/i],
  },
  {
    family: "bag",
    patterns: [/\b(bag|tote|pouch|backpack|duffel|fanny pack)\b/i],
  },
  {
    family: "footwear",
    patterns: [/\b(shoe|shoes|sneaker|slides|slippers|boots)\b/i],
  },
  {
    family: "accessory",
    patterns: [/\b(phone case|mouse pad|accessory|jewelry|keychain|lanyard|pet accessory)\b/i],
  },
];

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  sup2: "²",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
};

const TEMPLATE_SPEC_SECTION_HEADERS = new Set([
  "Product features",
  "Care instructions",
  "Size chart",
  "Product details",
  "Materials",
  "Sizing",
  "Dimensions",
]);

const TEMPLATE_SPEC_SIGNAL =
  /\b(unisex|tee|t-shirt|hoodie|sweatshirt|tank top|hat|beanie|mug|candle|canvas|poster|sticker|bag|accessory|footwear|cotton|polyester|ring-spun|garment-dyed|relaxed fit|classic fit|double-needle|twill tape|stitched|ribbed|neck tape|fleece|ceramic|soy|wax|jar|burn time|stainless|microwave|dishwasher|capacity|oz\b|ml\b|inches?\b|inch\b|cm\b|dimensions?\b|material|care instructions|machine wash|tumble dry|wash cold|dry low|paper|matte|gloss|frame|lining|preshrunk)\b/i;

const TEMPLATE_THEME_FLUFF_SIGNAL =
  /\b(gift(?:able|ing)?|perfect for|great for|ideal for|buyers?|shoppers?|boutique|message-led|statement|conversation-starting|style|vibe|mood|weekend|casual wear|daily wear|everyday wear|show your|share your|uplifting|encouraging|inspiring)\b/i;

const STERILE_PRODUCT_TYPE_RULES: Array<{ pattern: RegExp }> = [
  { pattern: /\b(unisex(?: [a-z0-9&/+'-]+){0,5} (?:tee|t-shirt|t shirt))\b/i },
  { pattern: /\b((?:heavy cotton|garment-dyed|ring-spun cotton|classic|premium|softstyle|oversized|women's|youth)(?: [a-z0-9&/+'-]+){0,4} (?:tee|t-shirt|t shirt))\b/i },
  { pattern: /\b((?:unisex|pullover|zip|heavy blend|midweight|premium)(?: [a-z0-9&/+'-]+){0,4} hoodie)\b/i },
  { pattern: /\b((?:unisex|crewneck|heavy blend|fleece|classic)(?: [a-z0-9&/+'-]+){0,4} sweatshirt)\b/i },
  { pattern: /\b((?:racerback|muscle|women's|unisex)(?: [a-z0-9&/+'-]+){0,4} tank top)\b/i },
  { pattern: /\b((?:ceramic|accent|travel|camping|latte)(?: [a-z0-9&/+'-]+){0,3} mug)\b/i },
  { pattern: /\b((?:dad|trucker|snapback|bucket|beanie)(?: [a-z0-9&/+'-]+){0,3} hat)\b/i },
  { pattern: /\b((?:vinyl|kiss-cut|die-cut|transparent)(?: [a-z0-9&/+'-]+){0,3} sticker)\b/i },
  { pattern: /\b((?:tote|duffel|drawstring|crossbody)(?: [a-z0-9&/+'-]+){0,3} bag)\b/i },
  { pattern: /\b((?:soy|scented|jar)(?: [a-z0-9&/+'-]+){0,3} candle)\b/i },
  { pattern: /\b((?:cutting board|serving board|throw pillow|area rug|tea towel|journal|notebook)(?: [a-z0-9&/+'-]+){0,2})\b/i },
  { pattern: /\b((?:canvas print|art print|poster|wall art)(?: [a-z0-9&/+'-]+){0,2})\b/i },
];

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanTitle(filename: string) {
  const raw = filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/&/g, " & ")
    .replace(/[^A-Za-z0-9&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "Untitled Product";

  return raw
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word === "&") return word;
      if (/^\d+$/.test(word)) return word;
      const upper = word.toUpperCase();
      if (["AI", "USA", "POD", "DTG", "DTF", "SVG", "PNG", "JPG", "PDF", "XL", "XXL", "2XL", "3XL"].includes(upper)) {
        return upper;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeRef(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.findIndex((segment) => segment.toLowerCase() === "products");
    return idx >= 0 && segments[idx + 1]
      ? segments[idx + 1]
      : segments[segments.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}

function maskToken(value: string) {
  const s = value.trim();
  if (!s) return "";
  const visible = s.slice(-10);
  return `••••••••••${visible}`;
}

function maskTokenCompact(value: string) {
  const s = value.trim();
  if (!s) return "";
  return `••••${s.slice(-4)}`;
}

const PROTECTED_TITLE_SUFFIXES = ["Tank Top", "T-Shirt", "Sweatshirt", "Hoodie", "Shirt", "Tee"] as const;

function getProtectedTitleSuffix(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return PROTECTED_TITLE_SUFFIXES.find((suffix) => clean.toLowerCase().endsWith(suffix.toLowerCase())) || null;
}

function trimTitleAtWordBoundary(value: string, maxChars: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= maxChars) return clean;

  const clipped = clean.slice(0, maxChars + 1).trim();
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxChars * 0.55)) {
    return clipped.slice(0, lastSpace).trim();
  }

  return clean.slice(0, maxChars).trim();
}

function repairTitleEnding(value: string, fallback: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const fallbackSuffix = getProtectedTitleSuffix(fallback);
  if (!fallbackSuffix) return clean;
  if (getProtectedTitleSuffix(clean)) return clean;

  const incompleteEnding = clean.match(/\b(T|Tank|Hood|Sweat)\b$/i);
  if (!incompleteEnding) return clean;

  return `${clean.slice(0, incompleteEnding.index).trim()} ${fallbackSuffix}`.replace(/\s+/g, " ").trim();
}

function safeTitle(value: string, fallback: string) {
  const fallbackTitle = fallback.replace(/\s+/g, " ").trim();
  const base = value.replace(/\s+/g, " ").trim() || fallbackTitle;
  const repaired = repairTitleEnding(base, fallbackTitle);
  const trimmed = trimTitleAtWordBoundary(repaired, AI_TITLE_MAX_CHARS);
  return repaired.length > AI_TITLE_MAX_CHARS ? trimmed || fallbackTitle : repaired;
}

function trimToSentence(value: string, maxChars: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= maxChars) return clean;

  const clipped = clean.slice(0, maxChars).trim();
  const sentenceBreak = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? ")
  );

  if (sentenceBreak >= Math.floor(maxChars * 0.6)) {
    return clipped.slice(0, sentenceBreak + 1).trim();
  }

  const spaceBreak = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, Math.max(spaceBreak, 1)).trim()}...`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number) {
  return Number(value.toFixed(4));
}

function toLinearRgbChannel(channel: number) {
  const normalized = clamp(channel / 255, 0, 1);
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(red: number, green: number, blue: number) {
  return (
    0.2126 * toLinearRgbChannel(red) +
    0.7152 * toLinearRgbChannel(green) +
    0.0722 * toLinearRgbChannel(blue)
  );
}

function getContrastRatio(firstLuminance: number, secondLuminance: number) {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexColor(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/^#/, "");
  if (!normalized) return null;

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized.length >= 6
        ? normalized.slice(0, 6)
        : "";

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;

  return {
    red: Number.parseInt(expanded.slice(0, 2), 16),
    green: Number.parseInt(expanded.slice(2, 4), 16),
    blue: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function shouldUseLightPreviewText(background: string | null | undefined) {
  const rgb = parseHexColor(background);
  if (!rgb) return true;
  return getRelativeLuminance(rgb.red, rgb.green, rgb.blue) < 0.44;
}

function choosePreviewBackground(artworkLuminance: number | null) {
  if (artworkLuminance === null) return DISPLAY_DARK_BACKGROUND;

  const contrastOnDark = getContrastRatio(artworkLuminance, getRelativeLuminance(0, 0, 0));
  const contrastOnLight = getContrastRatio(artworkLuminance, getRelativeLuminance(255, 255, 255));

  return contrastOnDark >= contrastOnLight ? DISPLAY_DARK_BACKGROUND : DISPLAY_LIGHT_BACKGROUND;
}

function normalizeArtworkBounds(bounds: ArtworkBounds | undefined, width: number, height: number): ArtworkBounds {
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
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to read image preview."));
    img.src = src;
  });
}

async function analyzeArtworkBounds(file: File): Promise<ArtworkBounds> {
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

async function createContrastSafePreview(file: File): Promise<{ src: string; background: string }> {
  let keepObjectUrl = false;
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageElement(objectUrl);
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
      keepObjectUrl = true;
      return { src: objectUrl, background: DISPLAY_NEUTRAL_BACKGROUND };
    }

    sampleCtx.clearRect(0, 0, sampleWidth, sampleHeight);
    sampleCtx.drawImage(img, 0, 0, sampleWidth, sampleHeight);

    const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const totalPixels = sampleWidth * sampleHeight;
    let visiblePixelCount = 0;
    let transparentPixelCount = 0;
    let weightedLuminance = 0;
    let totalAlpha = 0;

    for (let index = 0; index < imageData.length; index += 4) {
      const alpha = imageData[index + 3];
      if (alpha < 250) transparentPixelCount += 1;
      if (alpha <= DISPLAY_ALPHA_THRESHOLD) continue;

      const weight = alpha / 255;
      visiblePixelCount += 1;
      weightedLuminance += getRelativeLuminance(imageData[index], imageData[index + 1], imageData[index + 2]) * weight;
      totalAlpha += weight;
    }

    const transparencyRatio = totalPixels > 0 ? transparentPixelCount / totalPixels : 0;
    if (!visiblePixelCount || transparencyRatio < DISPLAY_TRANSPARENCY_RATIO_THRESHOLD) {
      keepObjectUrl = true;
      return { src: objectUrl, background: DISPLAY_NEUTRAL_BACKGROUND };
    }

    const renderScale = Math.min(1, DISPLAY_PREVIEW_MAX_DIMENSION / longestEdge);
    const renderWidth = Math.max(1, Math.round(sourceWidth * renderScale));
    const renderHeight = Math.max(1, Math.round(sourceHeight * renderScale));
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = renderWidth;
    renderCanvas.height = renderHeight;
    const renderCtx = renderCanvas.getContext("2d");

    if (!renderCtx) {
      keepObjectUrl = true;
      return { src: objectUrl, background: DISPLAY_NEUTRAL_BACKGROUND };
    }

    const previewBackground = choosePreviewBackground(totalAlpha > 0 ? weightedLuminance / totalAlpha : null);
    renderCtx.fillStyle = previewBackground;
    renderCtx.fillRect(0, 0, renderWidth, renderHeight);
    renderCtx.drawImage(img, 0, 0, renderWidth, renderHeight);

    return { src: renderCanvas.toDataURL("image/png"), background: previewBackground };
  } catch {
    keepObjectUrl = true;
    return { src: objectUrl, background: DISPLAY_NEUTRAL_BACKGROUND };
  } finally {
    if (!keepObjectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function decodeHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, entity) => HTML_ENTITY_MAP[entity.toLowerCase()] ?? match);
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTemplateDescription(templateDescription: string) {
  const normalized = decodeHtmlEntities(templateDescription)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ");

  const rawLines = normalized.split("\n");
  const out: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    const cleaned = trimmed.startsWith("-")
      ? "- " + trimmed.replace(/^[-–—]\s*/, "")
      : trimmed.replace(/\s+/g, " ");
    const header = cleaned.replace(/:$/, "");

    if (TEMPLATE_SPEC_SECTION_HEADERS.has(header) && out.length && out[out.length - 1] !== "") out.push("");
    out.push(cleaned);
  }

  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function detectProductFamilyFromText(value: string) {
  const text = stripHtml(value).trim();
  if (!text) return null;

  for (const rule of FAMILY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.family;
    }
  }

  return null;
}

function normalizeAiLeadParagraphs(paragraphs: string[]) {
  const cleaned = paragraphs
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((paragraph) => trimToSentence(paragraph, 220));

  if (cleaned.length === 0) return [];

  let total = cleaned.join(" ").length;
  if (total <= AI_LEAD_MAX_CHARS) return cleaned;

  const next = [...cleaned];
  while (next.length > 1 && total > AI_LEAD_MAX_CHARS) {
    const last = next[next.length - 1];
    const shortened = trimToSentence(last, Math.max(70, last.length - (total - AI_LEAD_MAX_CHARS)));
    next[next.length - 1] = shortened;
    total = next.join(" ").length;
    if (total > AI_LEAD_MAX_CHARS && next.length > 1 && shortened.length < 90) {
      next.pop();
      total = next.join(" ").length;
    }
  }

  if (next.join(" ").length > AI_LEAD_MAX_CHARS) {
    next[0] = trimToSentence(next[0], AI_LEAD_MAX_CHARS);
  }

  return next.filter(Boolean);
}

function resolveProductFamily(title: string, templateDescription: string): ProductFamily {
  const titleFamily = detectProductFamilyFromText(title);
  const templateFamily = detectProductFamilyFromText(templateDescription);

  if (titleFamily) return titleFamily;
  if (templateFamily) return templateFamily;
  return "product";
}

function detectThemePhrase(title: string) {
  const lower = title.toLowerCase();
  if (/(christian|jesus|faith|saved|forgiven|church|bible|gospel|cross)\b/.test(lower)) return "faith-forward";
  if (/(retro|vintage|distressed)\b/.test(lower)) return "retro-inspired";
  if (/(funny|humor|sarcastic|joke)\b/.test(lower)) return "conversation-starting";
  if (/(dog|cat|pet|puppy)\b/.test(lower)) return "pet-lover";
  if (/(floral|rose|flower|botanical)\b/.test(lower)) return "bold graphic";
  if (/(usa|american|patriotic|flag)\b/.test(lower)) return "patriotic";
  if (/(halloween|fall|thanksgiving|christmas|holiday)\b/.test(lower)) return "seasonal gift-ready";
  return "clean graphic";
}

type TemplateSection = {
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

function parseTemplateDescription(formattedDescription: string) {
  const introParagraphs: string[] = [];
  const sections: TemplateSection[] = [];
  let currentSection: TemplateSection | null = null;

  const lines = formattedDescription
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalizedHeader = line.replace(/:$/, "");

    if (TEMPLATE_SPEC_SECTION_HEADERS.has(normalizedHeader)) {
      currentSection = {
        heading: normalizedHeader,
        paragraphs: [],
        bullets: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith("- ")) {
      const bullet = line.replace(/^[-–—]\s*/, "").trim();
      if (currentSection) {
        currentSection.bullets.push(bullet);
      } else {
        introParagraphs.push(bullet);
      }
      continue;
    }

    if (currentSection) {
      currentSection.paragraphs.push(line);
    } else {
      introParagraphs.push(line);
    }
  }

  return { introParagraphs, sections };
}

function normalizeTemplateComparableValue(value: string) {
  return stripHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isStaticTemplateSpecLine(line: string, templateTitle = "") {
  const cleaned = decodeHtmlEntities(String(line || ""))
    .replace(/^[-–—]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return false;

  const normalizedHeader = cleaned.replace(/:$/, "");
  if (TEMPLATE_SPEC_SECTION_HEADERS.has(normalizedHeader)) return true;

  const normalizedLine = normalizeTemplateComparableValue(cleaned);
  const normalizedTitle = normalizeTemplateComparableValue(templateTitle);
  if (normalizedTitle && normalizedLine === normalizedTitle) return false;

  if (!TEMPLATE_SPEC_SIGNAL.test(cleaned)) return false;

  if (TEMPLATE_THEME_FLUFF_SIGNAL.test(cleaned) && !TEMPLATE_SPEC_SECTION_HEADERS.has(normalizedHeader)) {
    return false;
  }

  return true;
}

function joinTemplateSpecLines(lines: string[]) {
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

export function sanitizeTemplateDescriptionForPrebuffer(templateDescription: string, templateTitle = "") {
  const formatted = formatTemplateDescription(templateDescription);
  if (!formatted.trim()) return "";

  const parsed = parseTemplateDescription(formatted);
  if (parsed.sections.length > 0) {
    const anchoredSectionLines: string[] = [];
    for (const section of parsed.sections) {
      anchoredSectionLines.push(section.heading);
      for (const paragraph of section.paragraphs) {
        anchoredSectionLines.push(paragraph);
      }
      for (const bullet of section.bullets) {
        anchoredSectionLines.push(`- ${bullet}`);
      }
      anchoredSectionLines.push("");
    }

    const sanitizedFromSections = joinTemplateSpecLines(anchoredSectionLines);
    if (sanitizedFromSections) return sanitizedFromSections;
  }

  const introLines = parsed.introParagraphs.filter((paragraph) => isStaticTemplateSpecLine(paragraph, templateTitle));
  const sanitizedIntro = joinTemplateSpecLines(introLines);
  if (sanitizedIntro) return sanitizedIntro;

  const looseLines = formatted
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => isStaticTemplateSpecLine(line, templateTitle));

  return joinTemplateSpecLines(looseLines);
}

function normalizeSterileProductTypeLabel(value: string) {
  return value
    .replace(/\bt[- ]shirt\b/gi, "T-Shirt")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^t-shirt$/i.test(word)) return "T-Shirt";
      if (/^tee$/i.test(word)) return "Tee";
      if (/^(DTG|DTF|POD|UV)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function getFallbackSterileProductType(family: ProductFamily) {
  switch (family) {
    case "t-shirt":
      return "Unisex Heavy Cotton Tee";
    case "hoodie":
      return "Unisex Hoodie";
    case "sweatshirt":
      return "Crewneck Sweatshirt";
    case "tank top":
      return "Tank Top";
    case "hat":
      return "Hat";
    case "drinkware":
      return "Ceramic Mug";
    case "candle":
      return "Scented Candle";
    case "bath-body":
      return "Bath and Body Product";
    case "home-kitchen":
      return "Home and Kitchen Product";
    case "wall-art":
      return "Wall Art Print";
    case "sticker":
      return "Sticker";
    case "bag":
      return "Tote Bag";
    case "accessory":
      return "Accessory";
    case "footwear":
      return "Footwear";
    default:
      return "Product";
  }
}

function buildTemplateContext(templateDescription: string, productFamily?: ProductFamily) {
  const formatted = formatTemplateDescription(templateDescription);
  const normalized = stripHtml(formatted).replace(/[•:]+/g, " ").replace(/\s+/g, " ").trim();

  for (const rule of STERILE_PRODUCT_TYPE_RULES) {
    const match = normalized.match(rule.pattern);
    if (match?.[1] || match?.[0]) {
      return normalizeSterileProductTypeLabel((match[1] || match[0]).trim());
    }
  }

  const detectedFamily = productFamily || detectProductFamilyFromText(normalized) || "product";
  return getFallbackSterileProductType(detectedFamily);
}

function dedupeParagraphs(paragraphs: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const paragraph of paragraphs) {
    const cleaned = paragraph.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }

  return unique;
}

function getFamilyLabel(family: ProductFamily) {
  switch (family) {
    case "t-shirt":
      return "graphic tee";
    case "hoodie":
      return "hoodie";
    case "sweatshirt":
      return "sweatshirt";
    case "tank top":
      return "tank top";
    case "hat":
      return "hat";
    case "drinkware":
      return "drinkware piece";
    case "candle":
      return "candle";
    case "bath-body":
      return "bath and body item";
    case "home-kitchen":
      return "home and kitchen piece";
    case "wall-art":
      return "wall art piece";
    case "sticker":
      return "sticker";
    case "bag":
      return "bag";
    case "accessory":
      return "accessory";
    case "footwear":
      return "footwear item";
    default:
      return "product";
  }
}

function buildLeadParagraphs(title: string, templateDescription: string) {
  const family = resolveProductFamily(title, templateDescription);
  const theme = detectThemePhrase(title);
  const productName = safeTitle(title, "This product");

  switch (family) {
    case "t-shirt":
      return [
        `${productName} brings a ${theme} look to an easygoing everyday tee made for casual wear, simple layering, and standout gift appeal.`,
        `It is a strong fit for daily rotation, niche apparel drops, and laid-back outfits that benefit from comfortable wear and a design with real personality.`,
      ];
    case "hoodie":
      return [
        `${productName} brings a ${theme} look to a comfortable hoodie made for cooler weather, easy layering, and everyday wear.`,
        `It works well for casual wardrobes, giftable apparel drops, and design-led collections that need warmth, comfort, and a strong visual point of view.`,
      ];
    case "sweatshirt":
      return [
        `${productName} brings a ${theme} look to a classic sweatshirt built for comfort, relaxed styling, and easy everyday use.`,
        `It fits naturally into seasonal drops, weekend wardrobes, and gift-ready apparel collections that need familiar comfort with a stronger design presence.`,
      ];
    case "tank top":
      return [
        `${productName} brings a ${theme} look to a lightweight tank made for warm-weather wear, casual comfort, and easy daily styling.`,
        `It suits gym-to-weekend outfits, summer assortments, and giftable apparel collections that need a cleaner balance of comfort, versatility, and visual appeal.`,
      ];
    case "hat":
      return [
        `${productName} adds a ${theme} finish to casual outfits, daily errands, and easy giftable accessory collections.`,
        `It is built for grab-and-go wear, everyday rotation, and simple styling that gives the design room to stand out without overcomplicating the look.`,
      ];
    case "drinkware":
      return [
        `${productName} brings a ${theme} touch to daily routines, desk setups, coffee breaks, and easy gift giving.`,
        `It works well for personal use, practical gifting, and lifestyle collections that need something functional, cleanly presented, and easy to enjoy every day.`,
      ];
    case "candle":
      return [
        `${productName} brings a ${theme} feel to cozy spaces, thoughtful gifting, and décor-driven everyday use.`,
        `It fits naturally into seasonal collections, self-care moments, and home-focused assortments that benefit from a polished mood and gift-ready presentation.`,
      ];
    case "bath-body":
      return [
        `${productName} brings a ${theme} touch to routine self-care, simple gifting, and practical daily use.`,
        `It works well for boutique-style assortments, wellness gifting, and personal care collections that need a cleaner product story and approachable presentation.`,
      ];
    case "home-kitchen":
      return [
        `${productName} adds a ${theme} element to everyday spaces, practical routines, and home-focused gifting moments.`,
        `It fits naturally into décor-minded collections, everyday household use, and giftable assortments that benefit from a useful item with stronger personality.`,
      ];
    case "wall-art":
      return [
        `${productName} brings a ${theme} statement to walls, shelves, and styled spaces that need visual interest.`,
        `It works well for home refreshes, giftable décor collections, and design-led assortments that benefit from a stronger focal point and easy presentation.`,
      ];
    case "sticker":
      return [
        `${productName} brings a ${theme} look to laptops, water bottles, journals, and other everyday surfaces.`,
        `It is a strong fit for impulse-friendly gifting, low-commitment add-ons, and accessory collections that benefit from flexible use and quick visual appeal.`,
      ];
    case "bag":
      return [
        `${productName} adds a ${theme} touch to daily carry, errands, travel, and practical gift giving.`,
        `It works for everyday utility, easy outfitting, and giftable accessory collections that need simple function with a more distinctive visual edge.`,
      ];
    case "footwear":
      return [
        `${productName} brings a ${theme} look to casual footwear designed for everyday wear and easy outfit pairing.`,
        `It fits best in comfort-focused collections, giftable lifestyle assortments, and design-led drops that benefit from familiar use with stronger personality.`,
      ];
    case "accessory":
      return [
        `${productName} adds a ${theme} touch to daily essentials, practical gifting, and easy add-on purchases.`,
        `It works well for lifestyle collections, impulse-friendly accessories, and design-led assortments that need utility without losing visual identity.`,
      ];
    default:
      return [
        `${productName} brings a ${theme} look to an everyday product designed for practical use, giftability, and clean presentation.`,
        `It fits naturally into niche collections, casual gifting moments, and design-led assortments that benefit from simple utility and a stronger point of view.`,
      ];
  }
}

function titleCaseTag(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function deriveTags(title: string, templateDescription: string) {
  const combined = `${title} ${stripHtml(templateDescription)}`.toLowerCase();
  const words = combined.match(/[a-z0-9]+/g) || [];
  const singles = Array.from(new Set(words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word))));

  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i];
    const b = words[i + 1];
    if (a.length < 3 || b.length < 3 || STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
    phrases.push(`${a} ${b}`);
  }

  return Array.from(new Set([...phrases, ...singles]))
    .slice(0, FIXED_TAG_COUNT)
    .map(titleCaseTag);
}

function leadToHtml(paragraphs: string[]) {
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function htmlToEditableText(value: string) {
  return stripHtml(value)
    .split("\n")
    .map((line) => line.trimStart().replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitDetailDescriptionForDisplay(
  templateDescription: string,
  leadParagraphs: string[] = [],
  fallbackDescription = ""
) {
  const buyerFacingParagraphs = dedupeParagraphs(normalizeAiLeadParagraphs(leadParagraphs));

  return {
    buyerFacingDescription: buyerFacingParagraphs.length > 0
      ? buyerFacingParagraphs.join("\n\n")
      : htmlToEditableText(fallbackDescription),
    templateSpecBlock: formatTemplateDescription(templateDescription).trim(),
  };
}

function extractBuyerFacingDescriptionFromListing(listingDescription: string, templateDescription: string) {
  const formattedListing = formatTemplateDescription(listingDescription);
  if (!formattedListing.trim()) return "";

  const parsedListing = parseTemplateDescription(formattedListing);
  const intro = dedupeParagraphs(parsedListing.introParagraphs).join("\n\n").trim();
  if (intro) return intro;

  const formattedTemplate = formatTemplateDescription(templateDescription).trim();
  if (!formattedTemplate) return htmlToEditableText(listingDescription);

  const normalizedTemplate = normalizeTemplateComparableValue(formattedTemplate);
  if (normalizeTemplateComparableValue(formattedListing) === normalizedTemplate) {
    return "";
  }

  const templateLineKeys = new Set(
    formattedTemplate
      .split("\n")
      .map((line) => normalizeTemplateComparableValue(line))
      .filter(Boolean)
  );

  const filteredLines = formattedListing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const normalizedLine = normalizeTemplateComparableValue(line);
      if (!normalizedLine) return false;
      if (templateLineKeys.has(normalizedLine)) return false;
      return !TEMPLATE_SPEC_SECTION_HEADERS.has(line.replace(/:$/, ""));
    });

  const filtered = joinTemplateSpecLines(filteredLines);
  if (filtered && normalizeTemplateComparableValue(filtered) !== normalizedTemplate) {
    return filtered;
  }

  return htmlToEditableText(listingDescription);
}

function formatProductDescriptionWithSections(leadParagraphs: string[], templateDescription: string) {
  const paragraphs = dedupeParagraphs(normalizeAiLeadParagraphs(leadParagraphs));
  const leadHtml = leadToHtml(paragraphs);

  const formattedTemplate = formatTemplateDescription(templateDescription);
  const parsed = parseTemplateDescription(formattedTemplate);
  const detailPieces: string[] = [];

  for (const paragraph of parsed.introParagraphs) {
    detailPieces.push(`<p>${escapeHtml(paragraph)}</p>`);
  }

  for (const section of parsed.sections) {
    detailPieces.push(`<h3>${escapeHtml(section.heading)}</h3>`);
    for (const paragraph of section.paragraphs) {
      detailPieces.push(`<p>${escapeHtml(paragraph)}</p>`);
    }
    if (section.bullets.length > 0) {
      const items = section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
      detailPieces.push(`<ul>${items}</ul>`);
    }
  }

  if (detailPieces.length === 0) {
    return leadHtml;
  }

  return `${leadHtml}${detailPieces.join("")}`;
}

function buildLeadOnlyDescription(leadParagraphs: string[]) {
  return leadToHtml(dedupeParagraphs(normalizeAiLeadParagraphs(leadParagraphs)));
}

function buildDescription(title: string, templateDescription: string, leadOverride?: string[]) {
  return formatProductDescriptionWithSections(
    leadOverride || buildLeadParagraphs(title, templateDescription),
    templateDescription
  );
}

function buildTags(title: string, description: string, count: number) {
  return deriveTags(title, description).slice(0, count);
}

export function canManualOverrideListingCopy(title: string, description: string) {
  const normalizedTitle = clampTitleForListing(title).trim();
  const normalizedDescription = clampDescriptionForListing(description).trim();
  const paragraphs = descriptionTextToParagraphs(normalizedDescription);

  return (
    normalizedTitle.length >= LISTING_LIMITS.titleMin &&
    normalizedDescription.length >= LISTING_LIMITS.descriptionMin &&
    paragraphs.length >= 2 &&
    paragraphs[0].trim().length >= 24 &&
    paragraphs[1].trim().length >= 24
  );
}

function buildManualOverrideTags(title: string, description: string, count: number) {
  return deriveTags(title, description)
    .filter((tag) => !/^keyword\s+\d+$/i.test(tag.trim()))
    .slice(0, count);
}

function canManualOverrideFlaggedImage(image: Img | null) {
  return !!image && image.aiDraft?.qcApproved !== false;
}

function createAiFieldStates(status: AiFieldStatus = "idle"): AiFieldStates {
  return {
    title: status,
    description: status,
    tags: status,
  };
}

function stripMarkdownFences(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/^```[a-z0-9_-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeTagsFromPayload(input: unknown) {
  const values = Array.isArray(input)
    ? input.map((value) => String(value || ""))
    : typeof input === "string"
      ? input.split(/[,\n;|]/g)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of values) {
    const cleaned = stripMarkdownFences(rawTag)
      .replace(/^tags?\s*:\s*/i, "")
      .replace(/^[-*•]+\s*/, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result.slice(0, FIXED_TAG_COUNT);
}

function normalizeDescriptionText(value: unknown) {
  return stripMarkdownFences(String(value || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*description\s*:\s*/i, "")
    .replace(/^\s*final[_ ]description\s*:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function descriptionTextToParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/\n/))
    .map((paragraph) => paragraph.replace(/^[-*•]+\s*/, "").trim())
    .filter(Boolean);
}

function isImage(file: File) {
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

function readDataUrl(file: File) {
  return fileToDataUrl(file);
}

async function urlToFile(url: string, fileName: string, fallbackType = "image/png") {
  const response = await fetchWithTimeout(url, undefined, 60000);
  if (!response.ok) {
    throw new Error(`Unable to retrieve rescued artwork (${response.status}).`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
  });
}

function clampTitleForListing(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= LISTING_LIMITS.titleMax) return normalized;
  return trimTitleAtWordBoundary(normalized, LISTING_LIMITS.titleMax);
}

function clampDescriptionForListing(value: string) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";
  if (normalized.length <= LISTING_LIMITS.descriptionMax) return normalized;
  return normalized.slice(0, LISTING_LIMITS.descriptionMax).trimEnd();
}

function getProductPreviewSnippet(product: Product) {
  const templateDescription = sanitizeTemplateDescriptionForPrebuffer(product.description || "", product.title);
  const buyerSnippet = clampDescriptionForListing(
    extractBuyerFacingDescriptionFromListing(product.description || "", templateDescription)
  );

  return trimToSentence(
    buyerSnippet
      || templateDescription
      || product.type
      || "Preview details available after selection.",
    120
  );
}

function getImagePreviewSnippet(image: Img) {
  return trimToSentence(
    clampDescriptionForListing(
      image.finalDescription
      || image.originalListingDescription
      || image.statusReason
      || "Preview details available after selection."
    ),
    120
  );
}

function autosizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${Math.max(element.scrollHeight, 124)}px`;
}

const REQUEST_TIMEOUT_MS = 45000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
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

function formatApiError(message: string) {
  const raw = message.trim();
  if (!raw) return "Live provider connection is not available in this environment.";
  if (raw.includes("UnsupportedHttpVerb")) {
    return "Live provider connection is not available in this environment. The backend API route is not installed yet.";
  }
  if (raw.startsWith("<?xml")) {
    return "Live provider connection is not available in this environment. The request reached a static host instead of the backend API route.";
  }
  if (raw.toLowerCase().includes("abort") || raw.toLowerCase().includes("timed out")) {
    return "The request timed out before the provider responded. Please try again.";
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

async function parseResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { error: text || `Request failed with status ${response.status}.` };
}

async function requestAiListingDraft({
  image,
  templateDescription,
  provider,
}: {
  image: Img;
  templateDescription: string;
  provider: ProviderId;
}): Promise<AiListingDraft | null> {
  try {
    const imageDataUrl = await fileToDataUrl(image.file);
    const productFamily = resolveProductFamily(image.final, templateDescription);
    const sterileTemplateContext = buildTemplateContext(templateDescription, productFamily);

    const response = await fetch("/api/ai/listing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageDataUrl,
        fileName: image.name,
        provider,
        productFamily,
        templateContext: sterileTemplateContext,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (payload?.qcApproved === false) {
      return null;
    }
    const title = safeTitle(payload?.title || "", image.final);
    const leadParagraphs = normalizeAiLeadParagraphs(Array.isArray(payload?.leadParagraphs) ? payload.leadParagraphs : []);
    const reasonFlags = Array.isArray(payload?.reasonFlags)
      ? payload.reasonFlags.filter((value: unknown): value is string => typeof value === "string")
      : [];

    return {
      title,
      leadParagraphs,
      model: typeof payload?.model === "string" ? payload.model : AI_MODEL_LABEL,
      confidence: typeof payload?.confidence === "number" ? payload.confidence : 0,
      templateReference: typeof payload?.templateReference === "string" ? payload.templateReference : "",
      reasonFlags,
      source: payload?.source === "gemini" || payload?.source === "fallback" ? payload.source : "fallback",
      grade: payload?.grade === "green" || payload?.grade === "red" ? payload.grade : payload?.publishReady === true ? "green" : "red",
      qcApproved: payload?.qcApproved !== false,
      publishReady: payload?.publishReady === true,
    };
  } catch {
    return null;
  }
}

function compareByStatus(a: Img, b: Img) {
  const order: Record<ItemStatus, number> = {
    ready: 0,
    error: 1,
    pending: 2,
  };

  return order[a.status] - order[b.status];
}

function fillActiveBatch(active: Img[], queued: Img[], limit: number) {
  const room = Math.max(0, limit - active.length);
  if (room === 0 || queued.length === 0) {
    return { active, queued };
  }

  return {
    active: [...active, ...queued.slice(0, room)],
    queued: queued.slice(room),
  };
}

function appendToActiveBatch(active: Img[], queued: Img[], incoming: Img[], limit: number) {
  const room = queued.length > 0 ? 0 : Math.max(0, limit - active.length);
  return {
    active: [...active, ...incoming.slice(0, room)],
    queued: [...queued, ...incoming.slice(room)],
  };
}

function normalizeSelectionIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean))).slice(0, IMPORT_QUEUE_LIMIT);
}

function selectionsMatch(a: string[], b: string[]) {
  const left = normalizeSelectionIds(a).slice().sort();
  const right = normalizeSelectionIds(b).slice().sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getFileSignature(file: Pick<File, "name" | "size">) {
  return `${String(file.name || "").trim().toLowerCase()}::${Number(file.size || 0)}`;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "ghost";
};

function Button({ className = "", tone = "default", type = "button", ...props }: ButtonProps) {
  const base =
    "inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
  const tones =
    tone === "ghost"
      ? "border border-slate-700 bg-[#020616] text-white/85 hover:bg-[#0b1024]"
      : "bg-[#7F22FE] text-white hover:bg-[#6d1ee0]";

  return <button type={type} className={`${base} ${tones} ${className}`} {...props} />;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-[#020616] px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-500 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function Select({ className = "", children, ...props }: SelectProps) {
  return (
    <div className={`relative min-w-0 w-full ${props.disabled ? "cursor-not-allowed" : ""}`}>
      <select
        className={`h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-700 bg-[#020616] px-3 pr-9 text-sm text-white outline-none transition focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-500 disabled:opacity-60 ${className}`}
        {...props}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

type FieldProps = {
  label: React.ReactNode;
  children: React.ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="flex min-h-[20px] items-center text-sm font-medium leading-5 tracking-tight text-slate-200">{label}</span>
      {children}
    </label>
  );
}

type BoxProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
};

function Box({ title, children, className = "", headerClassName = "" }: BoxProps) {
  return (
    <section className={`rounded-[28px] border border-slate-800 bg-[#020616] p-4 text-white shadow-[0_18px_60px_-38px_rgba(2,6,22,0.9)] backdrop-blur-sm ${className}`}>
      {title ? <div className={`mb-4 text-base font-semibold tracking-tight ${headerClassName}`}>{title}</div> : null}
      {children}
    </section>
  );
}

function MerchQuantumInlineHeading({ className = "" }: { className?: string }) {
  return (
    <span className={`min-w-0 text-sm font-semibold leading-tight tracking-tight text-white ${className}`}>
      <span className="text-[#7F22FE]">Merch</span>{" "}
      <span className="text-white">Quantum AI bulk auto listings</span>
    </span>
  );
}

function CreativeWellspringBootOverlay({
  visible,
  primed,
  sweepActive,
  onDismiss,
}: {
  visible: boolean;
  primed: boolean;
  sweepActive: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      onClick={onDismiss}
      className={`fixed inset-0 z-[140] overflow-hidden bg-[#03050d] transition-opacity duration-300 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(127,34,254,0.2),rgba(3,5,13,0.96)_40%,rgba(0,0,0,1)_78%)]" />

      <div className={`pointer-events-none absolute -left-[8vw] top-[4svh] h-[42svh] w-[42svh] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(196,181,253,0.92),rgba(127,34,254,0.78)_24%,rgba(53,32,164,0.36)_56%,transparent_78%)] blur-[72px] transition-all duration-500 ${sweepActive ? "opacity-0 scale-110" : "opacity-100"}`} style={{ animation: "creativeWellspringDriftA 16s ease-in-out infinite alternate" }} />
      <div className={`pointer-events-none absolute right-[12vw] top-[12svh] h-[34svh] w-[34svh] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(244,114,182,0.46),rgba(129,140,248,0.3)_34%,rgba(37,99,235,0.18)_60%,transparent_78%)] blur-[88px] transition-all duration-500 ${sweepActive ? "opacity-0 scale-105" : "opacity-100"}`} style={{ animation: "creativeWellspringDriftB 18s ease-in-out infinite alternate" }} />
      <div className={`pointer-events-none absolute left-[28vw] top-[30svh] h-[30svh] w-[30svh] rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(96,165,250,0.26),rgba(29,78,216,0.2)_40%,rgba(236,72,153,0.12)_68%,transparent_82%)] blur-[80px] transition-all duration-500 ${sweepActive ? "opacity-0 scale-110" : "opacity-100"}`} style={{ animation: "creativeWellspringDriftC 14s ease-in-out infinite alternate" }} />
      <div
        className="pointer-events-none absolute left-0 top-0 h-96 w-96 rounded-full bg-[#7F22FE]/30 blur-[100px]"
        style={{
          transform: sweepActive
            ? "translate3d(44vw,-26svh,0) scale(1.08)"
            : primed
              ? "translate3d(10vw,2svh,0) scale(1)"
              : "translate3d(-100%,100%,0) scale(0.92)",
          opacity: sweepActive ? 0 : primed ? 0.78 : 0,
          transition: "transform 1180ms cubic-bezier(0.22,1,0.36,1), opacity 920ms ease-out",
          willChange: "transform, opacity",
        }}
      />

      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${sweepActive ? "opacity-0" : "opacity-100"}`} style={{ mixBlendMode: "screen" }}>
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[0.08]" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <pattern id="creative-wellspring-grid" width="96" height="96" patternUnits="userSpaceOnUse">
              <path d="M96 0H0V96" fill="none" stroke="rgba(226,232,240,0.22)" strokeWidth="1" />
            </pattern>
            <pattern id="creative-wellspring-files" width="240" height="220" patternUnits="userSpaceOnUse">
              <path d="M48 40h78l22 22v98H48z" fill="none" stroke="rgba(192,132,252,0.24)" strokeWidth="1.15" />
              <path d="M126 40v22h22" fill="none" stroke="rgba(192,132,252,0.24)" strokeWidth="1.15" />
              <path d="M72 112h48M72 136h60M72 160h36" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" strokeLinecap="round" />
            </pattern>
          </defs>
          <rect width="1440" height="900" fill="url(#creative-wellspring-grid)" />
          <rect width="1440" height="900" fill="url(#creative-wellspring-files)" />
        </svg>
      </div>

      <div className={`pointer-events-none absolute inset-x-[-10%] top-[-36svh] h-[70svh] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(244,244,255,0.12)_28%,rgba(192,132,252,0.24)_54%,rgba(10,14,30,0)_100%)] blur-2xl transition-all duration-[520ms] ease-out ${sweepActive ? "translate-y-[140svh] opacity-100" : "translate-y-0 opacity-0"}`} />

      <div className="relative flex min-h-screen w-full items-start justify-start px-[8vw] pt-[8svh]">
        <div className="relative z-10 flex max-w-xl flex-col items-start gap-2 text-left">
          <div className={`flex flex-wrap items-baseline gap-x-2 text-4xl tracking-tight transition-all duration-[600ms] ease-out sm:text-5xl ${primed ? "translate-y-0 scale-100 blur-0 opacity-100" : "translate-y-1 scale-[1.05] blur-[10px] opacity-0"}`}>
            <span className="font-bold text-[#7F22FE]">Merch</span>
            <span className="font-medium text-white">Quantum</span>
          </div>
          <p
            className={`text-[11px] font-light uppercase tracking-[0.38em] text-slate-300/90 transition-all duration-[400ms] ease-out sm:text-xs ${primed ? "translate-y-0 opacity-100" : "translate-y-[10px] opacity-0"}`}
            style={{ transitionDelay: primed ? "120ms" : "0ms" }}
          >
            {BOOT_TAGLINE}
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes creativeWellspringDriftA {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            transform: translate3d(4vw, 3svh, 0) scale(1.08);
          }
        }
        @keyframes creativeWellspringDriftB {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            transform: translate3d(-5vw, 2svh, 0) scale(1.05);
          }
        }
        @keyframes creativeWellspringDriftC {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            transform: translate3d(2vw, -3svh, 0) scale(1.07);
          }
        }
      `}</style>
    </div>
  );
}

function getStatusTone(status: ItemStatus) {
  switch (status) {
    case "ready":
      return "bg-[#00BC7D] ring-[#00BC7D]/35";
    case "error":
      return "bg-[#FF2056] ring-[#FF2056]/35";
    default:
      return "bg-slate-500 ring-slate-500/35";
  }
}

function QuantOrbLoader({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}>
      <span className="absolute inset-0 rounded-full bg-[#7F22FE]/22 blur-[4px]" />
      <span className="absolute inset-0 inline-flex items-center justify-center animate-[spin_2.4s_linear_infinite]">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 text-[#C084FC]">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.25" fill="none" />
          <path d="M8 1.75a6.25 6.25 0 0 1 4.68 2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </span>
      <span className="absolute inset-[4px] rounded-full bg-[#7F22FE] shadow-[0_0_12px_rgba(127,34,254,0.9)]" />
    </span>
  );
}

function StatusThumbIcon({ tone, direction }: { tone: "ready" | "error"; direction: "up" | "down" }) {
  const colorClass = tone === "ready" ? "text-[#00BC7D]" : "text-[#FF2056]";

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 ${colorClass}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.35"
    >
      {direction === "up" ? (
        <path d="M6.25 7 8.4 3.35c.22-.38.62-.6 1.06-.6h.16c.6 0 1.09.49 1.09 1.1v2.1h1.92c.77 0 1.35.7 1.23 1.46l-.63 3.86c-.1.58-.6 1.01-1.19 1.01H6.25m0-5.28H4.18c-.49 0-.88.39-.88.88v3.68c0 .49.39.88.88.88h2.07V7Z" />
      ) : (
        <path d="M9.75 9 7.6 12.65c-.22.38-.62.6-1.06.6h-.16c-.6 0-1.09-.49-1.09-1.1v-2.1H3.37c-.77 0-1.35-.7-1.23-1.46l.63-3.86c.1-.58.6-1.01 1.19-1.01h5.79m0 5.28h2.07c.49 0 .88-.39.88-.88V4.44c0-.49-.39-.88-.88-.88H9.75V9Z" />
      )}
    </svg>
  );
}

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.2"
    >
      <path d="M3.2 10.95 10.55 3.6a1.45 1.45 0 0 1 2.05 0l.8.8a1.45 1.45 0 0 1 0 2.05l-7.35 7.35-2.6.55.55-2.6Z" />
      <path d="m9.95 4.2 1.85 1.85" />
    </svg>
  );
}

function ReRollIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.2"
    >
      <path d="M12.75 5.25V2.8m0 0h-2.45m2.45 0L9.9 5.65" />
      <path d="M12.1 8a4.7 4.7 0 1 1-1.38-3.32" />
    </svg>
  );
}

function ChevronIcon({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`${className} transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    >
      <path d="M4.75 6.25 8 9.5l3.25-3.25" />
    </svg>
  );
}

function BareChevronButton({
  open,
  onClick,
  label,
  className = "",
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center text-gray-400 transition-colors duration-200 hover:text-[#C084FC] focus-visible:outline-none ${className}`}
    >
      <ChevronIcon open={open} className="h-5 w-5" />
    </button>
  );
}

function getStatusSortValue(status: ItemStatus) {
  switch (status) {
    case "ready":
      return 0;
    case "error":
      return 1;
    default:
      return 2;
  }
}

function getResolvedItemStatus(image: Img): ItemStatus {
  if (image.aiProcessing || image.status === "pending") {
    return "pending";
  }

  if (!image.aiDraft) {
    return image.status;
  }

  const hasCompleteVisibleOutput =
    !!image.final.trim() &&
    !!image.finalDescription.trim() &&
    image.tags.some((tag) => !!String(tag || "").trim());

  if (image.aiDraft.qcApproved === false) {
    return "error";
  }

  return image.aiDraft.publishReady === true && hasCompleteVisibleOutput ? "ready" : "error";
}

export default function MerchQuantumApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewUrlsRef = useRef<string[]>([]);
  const aiLoopBusyRef = useRef<symbol | null>(null);
  const activeTemplateKeyRef = useRef("");
  const inlineFeedbackTimeoutRef = useRef<number | null>(null);

  const [provider, setProvider] = useState<ProviderChoiceId | "">("");
    const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [pulseConnected, setPulseConnected] = useState(false);
  const [apiShops, setApiShops] = useState<Shop[]>([]);
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingTemplateDetails, setLoadingTemplateDetails] = useState(false);
  const [shopId, setShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [bulkEditGridPage, setBulkEditGridPage] = useState(0);
  const [createTemplateGridPage, setCreateTemplateGridPage] = useState(0);
  const [isCreateThumbExpandedView, setIsCreateThumbExpandedView] = useState(false);
  const [createThumbGridPage, setCreateThumbGridPage] = useState(0);
  const [templateDescription, setTemplateDescription] = useState("");
  const [importedListingTitle, setImportedListingTitle] = useState("");
  const [importedListingDescription, setImportedListingDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [pendingTemplateSelectionIds, setPendingTemplateSelectionIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isDisconnectArmed, setIsDisconnectArmed] = useState(false);
  const [isTokenInputFocused, setIsTokenInputFocused] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("");
  const [isRoutingGridExpanded, setIsRoutingGridExpanded] = useState(true);
  const [isImportingListings, setIsImportingListings] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [isSyncingImportedListings, setIsSyncingImportedListings] = useState(false);
  const [isPublishingImportedListings, setIsPublishingImportedListings] = useState(false);
  const [images, setImages] = useState<Img[]>([]);
  const [completedImportedImages, setCompletedImportedImages] = useState<Img[]>([]);
  const [queuedImages, setQueuedImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [attentionTarget, setAttentionTarget] = useState<"provider" | "token" | "import" | "shop" | "template" | "mode" | null>(null);
  const [editingField, setEditingField] = useState<InlineEditableField>(null);
  const [editableTitleDraft, setEditableTitleDraft] = useState("");
  const [editableDescriptionDraft, setEditableDescriptionDraft] = useState("");
  const [inlineSaveFeedback, setInlineSaveFeedback] = useState<InlineSaveFeedback | null>(null);
  const [aiAssistStatus, setAiAssistStatus] = useState("");
  const [manualPrebufferOverride, setManualPrebufferOverride] = useState(false);
  const [isBootOverlayMounted, setIsBootOverlayMounted] = useState(true);
  const [isBootOverlayVisible, setIsBootOverlayVisible] = useState(true);
  const [isBootOverlayPrimed, setIsBootOverlayPrimed] = useState(false);
  const [isBootOverlaySweepActive, setIsBootOverlaySweepActive] = useState(false);
  const [metadataSectionState, setMetadataSectionState] = useState<Record<MetadataSectionKey, boolean>>({
    title: false,
    description: false,
    tags: false,
  });
  const [thumbnailHoverPreview, setThumbnailHoverPreview] = useState<ThumbnailHoverPreview | null>(null);

  const resolvedProviderId = provider === "spreadconnect" ? "spod" : provider;
  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || null;
  const isLiveProvider = selectedProvider?.isLive || false;
  const isCreateMode = workspaceMode === "create";
  const isBulkEditMode = workspaceMode === "edit";
  const supportsProviderMetadataSync = resolvedProviderId === "printify";
  const supportsImportedListingSync = resolvedProviderId === "printify" || resolvedProviderId === "printful";
  const supportsImportedPublish = resolvedProviderId === "printify";
  const totalBatchLimit = CONNECTED_TOTAL_BATCH_FILES;
  const activeBatchLimit = ACTIVE_BATCH_FILES;
  const allImages = useMemo(() => [...completedImportedImages, ...images], [completedImportedImages, images]);
  const queuedImportedImages = useMemo(
    () => queuedImages.filter((img) => img.sourceType === "imported"),
    [queuedImages]
  );
  const availableShops = connected && isLiveProvider ? apiShops : [];
  const selectedShop = availableShops.find((shop) => shop.id === shopId) || null;
  const hasTokenValue = token.trim().length > 0;
  const showCompactDisconnectedToken = !connected && hasTokenValue && !isTokenInputFocused;
  const tokenFieldValue = connected || showCompactDisconnectedToken ? maskTokenCompact(token) : token;
  const shopTriggerLabel = loadingApi
    ? "Loading..."
    : selectedShop?.title || (connected && availableShops.length === 0 ? "No Shops" : "Select Shop");
  const productSource = connected && isLiveProvider ? apiProducts : [];
  const templateKey = useMemo(() => `${template?.reference || "no-template"}::${templateDescription.trim()}`, [template?.reference, templateDescription]);
  const templateReadyForAi = !!template && !loadingTemplateDetails;
  const hasWorkspaceRoute = connected && !!shopId && !!workspaceMode;

  const visibleProducts = useMemo(() => {
    return productSource.filter((p) => p.shopId === shopId);
  }, [shopId, productSource]);
  const importedQueueCount = useMemo(
    () => allImages.filter((img) => img.sourceType === "imported").length + queuedImportedImages.length,
    [allImages, queuedImportedImages]
  );

  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => {
      const statusDelta = getStatusSortValue(getResolvedItemStatus(a)) - getStatusSortValue(getResolvedItemStatus(b));
      if (statusDelta !== 0) return statusDelta;
      const aLabel = (a.final || a.originalListingTitle || a.cleaned || a.name).trim().toLowerCase();
      const bLabel = (b.final || b.originalListingTitle || b.cleaned || b.name).trim().toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [images]);

  const selectedImage = useMemo(() => {
    return images.find((img) => img.id === selectedId) || sortedImages[0] || null;
  }, [images, selectedId, sortedImages]);
  const selectedProduct = useMemo(
    () => productSource.find((product) => product.id === productId && product.shopId === shopId) || productSource.find((product) => product.id === productId) || null,
    [productId, productSource, shopId]
  );
  const readyCount = images.filter((img) => getResolvedItemStatus(img) === "ready").length;
  const errorCount = images.filter((img) => getResolvedItemStatus(img) === "error").length;
  const processingCount = images.filter((img) => getResolvedItemStatus(img) === "pending").length;
  const draftReadyCount = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready").length;
  const hasAnyLoadedImages = allImages.length > 0 || queuedImages.length > 0;
  const completedGenerationCount = readyCount + errorCount;
  const generationProgressPct = images.length > 0 ? Math.round((completedGenerationCount / images.length) * 100) : 0;
  const isWorkspaceConfigured = isCreateMode ? connected && !!shopId && !!template : hasWorkspaceRoute;
  const canSubmitProviderConnection = Boolean(provider && isLiveProvider && token.trim() && !loadingApi && !connected);
  const uploadDisabled = !isCreateMode || !isWorkspaceConfigured || draftReadyCount === 0 || isRunningBatch || processingCount > 0;
  const canShowDetailWorkspace = hasWorkspaceRoute;
  const canShowWorkspacePreview = isCreateMode
    ? canShowDetailWorkspace && templateReadyForAi
    : canShowDetailWorkspace && (hasAnyLoadedImages || !!selectedImage);
  const canShowDetailPanel = canShowWorkspacePreview && hasAnyLoadedImages && !!selectedImage;
  const canShowLoadedQueueGrid = canShowWorkspacePreview && sortedImages.length > 0;
  const showPreviewStats = hasAnyLoadedImages;
  const selectedImageFieldStates = selectedImage?.aiFieldStates ?? createAiFieldStates("idle");
  const detailTemplateDescription = selectedImage?.templateDescriptionOverride ?? templateDescription;
  const selectedImageTemplateKey = selectedImage
    ? `${selectedImage.templateReferenceOverride || template?.reference || "no-template"}::${detailTemplateDescription.trim()}`
    : templateKey;
  const isImageAwaitingStructuredOutput =
    !!(selectedImage && selectedImage.processedTemplateKey !== selectedImageTemplateKey);
  const hasVisibleSelectedImageTitle = !!selectedImage && selectedImageFieldStates.title === "ready" && !!selectedImage.final.trim();
  const hasVisibleSelectedImageDescription = !!selectedImage && selectedImageFieldStates.description === "ready" && !!selectedImage.finalDescription.trim();
  const isDetailTitleLoading =
    selectedImageFieldStates.title === "loading"
    || !!selectedImage?.aiProcessing
    || (isImageAwaitingStructuredOutput && !hasVisibleSelectedImageTitle);
  const isDetailDescriptionLoading =
    selectedImageFieldStates.description === "loading"
    || !!selectedImage?.aiProcessing
    || (isImageAwaitingStructuredOutput && !hasVisibleSelectedImageDescription);
  const isDetailTagsLoading =
    selectedImageFieldStates.tags === "loading"
    || !!selectedImage?.aiProcessing
    || isImageAwaitingStructuredOutput;
  const isTemplatePrebufferState = templateReadyForAi && !selectedImage && !hasAnyLoadedImages && !manualPrebufferOverride;
  const shouldAwaitQuantumTitle = isTemplatePrebufferState || isDetailTitleLoading;
  const shouldAwaitQuantumDescription = isTemplatePrebufferState || isDetailDescriptionLoading;
  const detailTitle = selectedImage
    ? selectedImageFieldStates.title === "ready"
      ? selectedImage.final
      : ""
    : !hasWorkspaceRoute
      ? ""
      : !templateReadyForAi
      ? template?.nickname
      || selectedProduct?.title
      || ""
      : importedListingTitle;
  const detailDescription = selectedImage
    ? selectedImageFieldStates.description === "ready"
      ? selectedImage.finalDescription
      : ""
    : (!hasWorkspaceRoute
      ? ""
      : !templateReadyForAi
      ? (templateDescription
      ? templateDescription
      : canShowDetailWorkspace
        ? "Select or add artwork to generate image-based listing copy."
        : selectedImage
          ? "Add a shop and product template when you're ready. Quantum AI will build the final listing copy here."
          : "")
      : importedListingDescription);
  const detailDescriptionSections = splitDetailDescriptionForDisplay(
    detailTemplateDescription,
    selectedImage?.aiDraft?.leadParagraphs || [],
    detailDescription
  );
  const detailBuyerDescription = detailDescriptionSections.buyerFacingDescription;
  const detailTemplateSpecBlock = detailDescriptionSections.templateSpecBlock;
  const canEditImportedListing = !selectedImage && templateReadyForAi && !!template?.reference;
  const canEditSelectedImageCopy =
    !!selectedImage
    && !selectedImage.aiProcessing
    && canManualOverrideFlaggedImage(selectedImage)
    && getResolvedItemStatus(selectedImage) !== "pending";
  const canEditDetailTitle = canEditImportedListing || canEditSelectedImageCopy;
  const canEditDetailDescription = canEditImportedListing || canEditSelectedImageCopy;
  const titleFeedback = inlineSaveFeedback?.field === "title" ? inlineSaveFeedback : null;
  const descriptionFeedback = inlineSaveFeedback?.field === "description" ? inlineSaveFeedback : null;
  const selectedImageStatus = selectedImage ? getResolvedItemStatus(selectedImage) : null;
  const canManualRescueSelectedImage =
    !!selectedImage
    && selectedImageStatus === "error"
    && canManualOverrideFlaggedImage(selectedImage);
  const canRerollSelectedImage =
    !!selectedImage
    && !selectedImage.aiProcessing
    && !isImageAwaitingStructuredOutput;
  const detailTags = selectedImage && selectedImageFieldStates.tags === "ready"
    ? selectedImage.tags
    : [];
  const approvedImportedItems = allImages.filter((img) => img.sourceType === "imported" && getResolvedItemStatus(img) === "ready");
  const flaggedImportedItems = allImages.filter((img) => img.sourceType === "imported" && getResolvedItemStatus(img) === "error");
  const syncedApprovedImportedItems = approvedImportedItems.filter((img) => img.syncState === "synced");
  const importedProductIds = useMemo(
    () => new Set([...allImages, ...queuedImages].map((img) => img.providerProductId).filter((value): value is string => !!value)),
    [allImages, queuedImages]
  );
  const queuedStatCount = queuedImages.length;
  const bulkEditSelectionCountLabel = pendingTemplateSelectionIds.length > 0
    ? `${pendingTemplateSelectionIds.length} listing${pendingTemplateSelectionIds.length === 1 ? "" : "s"} staged`
    : "No listings staged yet";
  const selectionPageSize = 25;
  const createTemplatePageSize = selectionPageSize;
  const createTemplateTotalPages = Math.max(1, Math.ceil(visibleProducts.length / createTemplatePageSize));
  const safeCreateTemplatePage = Math.min(createTemplateGridPage, createTemplateTotalPages - 1);
  const createTemplateVisibleProducts = visibleProducts.slice(
    safeCreateTemplatePage * createTemplatePageSize,
    safeCreateTemplatePage * createTemplatePageSize + createTemplatePageSize
  );
  const createTemplateVisibleRangeLabel = visibleProducts.length > 0
    ? `${safeCreateTemplatePage * createTemplatePageSize + 1}-${Math.min(visibleProducts.length, safeCreateTemplatePage * createTemplatePageSize + createTemplateVisibleProducts.length)} of ${visibleProducts.length}`
    : "0 of 0";
  const bulkEditPageSize = selectionPageSize;
  const bulkEditTotalPages = Math.max(1, Math.ceil(visibleProducts.length / bulkEditPageSize));
  const safeBulkEditPage = Math.min(bulkEditGridPage, bulkEditTotalPages - 1);
  const bulkEditVisibleProducts = visibleProducts.slice(
    safeBulkEditPage * bulkEditPageSize,
    safeBulkEditPage * bulkEditPageSize + bulkEditPageSize
  );
  const bulkEditVisibleRangeLabel = visibleProducts.length > 0
    ? `${safeBulkEditPage * bulkEditPageSize + 1}-${Math.min(visibleProducts.length, safeBulkEditPage * bulkEditPageSize + bulkEditVisibleProducts.length)} of ${visibleProducts.length}`
    : "0 of 0";
  const createThumbCompactVisibleCount = 5;
  const createThumbExpandedPageSize = 25;
  const createThumbPageSize = isCreateThumbExpandedView ? createThumbExpandedPageSize : createThumbCompactVisibleCount;
  const createThumbTotalPages = Math.max(1, Math.ceil(sortedImages.length / createThumbPageSize));
  const safeCreateThumbPage = Math.min(createThumbGridPage, createThumbTotalPages - 1);
  const visibleCreateThumbnails = sortedImages.slice(
    safeCreateThumbPage * createThumbPageSize,
    safeCreateThumbPage * createThumbPageSize + createThumbPageSize
  );
  const createThumbVisibleRangeLabel = sortedImages.length > 0
    ? `${safeCreateThumbPage * createThumbPageSize + 1}-${Math.min(sortedImages.length, safeCreateThumbPage * createThumbPageSize + visibleCreateThumbnails.length)} of ${sortedImages.length}`
    : "0 of 0";
  const selectorShellClassName = `rounded-xl border border-slate-800 bg-[#020616] p-4 ${attentionTarget === "template" ? "ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}`;
  const workspaceModePickerLabel = isCreateMode ? "Bulk Create" : isBulkEditMode ? "Bulk Edit" : "Edit mode";
  const previewOverlayUsesLightText = selectedImage?.preview
    ? shouldUseLightPreviewText(selectedImage.previewBackground || DISPLAY_NEUTRAL_BACKGROUND)
    : true;
  const previewOverlayTextClass = selectedImage?.preview
    ? previewOverlayUsesLightText
      ? "text-white/90"
      : "text-slate-950/85"
    : "text-slate-300";
  const bulkEditPublishDisabled =
    !isBulkEditMode
    || approvedImportedItems.length === 0
    || isSyncingImportedListings
    || isPublishingImportedListings
    || (!supportsImportedListingSync && !supportsImportedPublish);
  const descriptionActionLabel = isCreateMode
    ? (isRunningBatch ? "Uploading..." : "Upload")
    : isSyncingImportedListings
      ? "Syncing..."
      : isPublishingImportedListings
        ? "Publishing..."
        : "Publish";
  const routingGuidanceTarget =
    !provider
      ? "provider"
      : !connected
        ? "token"
        : !shopId
          ? "shop"
          : !workspaceMode
            ? "mode"
            : null;
  const guidanceStep = !connected
    ? "connect"
    : !shopId
      ? "shop"
      : !workspaceMode
        ? "mode"
        : isCreateMode && !template && images.length === 0
        ? "template"
        : isCreateMode && images.length === 0
          ? "import"
          : isBulkEditMode && !hasAnyLoadedImages
            ? "template"
        : "settled";
  function getProviderRoute(path: "connect" | "disconnect" | "products" | "product" | "batch-create") {
    return `/api/providers/${path}`;
  }

  function toggleMetadataSection(section: MetadataSectionKey) {
    setMetadataSectionState((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function triggerAttentionCue(target: "provider" | "token" | "import" | "shop" | "template" | "mode") {
    setAttentionTarget(target);
    window.clearTimeout((triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId);
    (triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId = window.setTimeout(() => {
      setAttentionTarget((current) => (current === target ? null : current));
    }, 1200);
  }

  function getMissingWorkflowTarget(includeImportStep: boolean) {
    if (!provider) return "provider" as const;
    if (!connected) return "token" as const;
    if (!shopId) return "shop" as const;
    if (!workspaceMode) return "mode" as const;
    if (isCreateMode && !template) return "template" as const;
    if (isBulkEditMode && !selectedImportIds.length && !hasAnyLoadedImages) return "template" as const;
    if (includeImportStep && isCreateMode && images.length === 0) return "import" as const;
    return null;
  }

  function canSubmitProviderConnectionWithToken(tokenCandidate?: string) {
    const submittedToken = String(tokenCandidate ?? token).trim();
    return Boolean(provider && isLiveProvider && submittedToken && !loadingApi && !connected);
  }

  function nudgeWorkflow(includeImportStep: boolean) {
    const target = getMissingWorkflowTarget(includeImportStep);
    if (target) triggerAttentionCue(target);
  }

  function nudgeProviderSelectionFromTokenArea() {
    if (!provider) {
      triggerAttentionCue("provider");
    }
  }

  function getRoutingFieldGlowClass(target: "provider" | "token" | "shop" | "mode") {
    return attentionTarget === target || routingGuidanceTarget === target
      ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_18px_45px_-28px_rgba(127,34,254,0.6)] animate-pulse"
      : "";
  }

  function clearInlineFeedbackTimer() {
    if (inlineFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(inlineFeedbackTimeoutRef.current);
      inlineFeedbackTimeoutRef.current = null;
    }
  }

  function setInlineFeedbackState(
    field: Exclude<InlineEditableField, null>,
    tone: InlineSaveTone,
    message: string,
    autoClearMs = tone === "saved" ? 2200 : 0
  ) {
    clearInlineFeedbackTimer();
    setInlineSaveFeedback({ field, tone, message });
    if (autoClearMs > 0) {
      inlineFeedbackTimeoutRef.current = window.setTimeout(() => {
        setInlineSaveFeedback((current) => (
          current?.field === field && current.tone === tone ? null : current
        ));
        inlineFeedbackTimeoutRef.current = null;
      }, autoClearMs);
    }
  }

  function buildEditableDescriptionHtml(value: string) {
    const paragraphs = descriptionTextToParagraphs(value);
    return detailTemplateDescription.trim()
      ? formatProductDescriptionWithSections(paragraphs, detailTemplateDescription)
      : buildLeadOnlyDescription(paragraphs);
  }

  function buildImageDescriptionHtmlForEdit(value: string, image?: Img | null) {
    const imageTemplateDescription = image?.templateDescriptionOverride ?? detailTemplateDescription;
    const paragraphs = descriptionTextToParagraphs(value);
    return imageTemplateDescription.trim()
      ? formatProductDescriptionWithSections(paragraphs, imageTemplateDescription)
      : buildLeadOnlyDescription(paragraphs);
  }

  function buildUserHintsForImage(image: Img) {
    const activeTitleHint = clampTitleForListing(
      editingField === "title"
        ? editableTitleDraft
        : detailTitle || image.final || image.originalListingTitle || image.cleaned
    );
    const fallbackBuyerDescription = splitDetailDescriptionForDisplay(
      image.templateDescriptionOverride ?? detailTemplateDescription,
      image.aiDraft?.leadParagraphs || [],
      image.finalDescription
    ).buyerFacingDescription;
    const activeDescriptionHint = clampDescriptionForListing(
      editingField === "description"
        ? editableDescriptionDraft
        : detailBuyerDescription || fallbackBuyerDescription
    );
    const descriptionParagraphs = descriptionTextToParagraphs(activeDescriptionHint).slice(0, 2);
    const seen = new Set<string>();

    return [
      activeTitleHint,
      ...image.tags.map((tag) => String(tag || "").trim()),
      ...descriptionParagraphs,
    ]
      .map((hint) => hint.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((hint) => {
        const key = hint.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  function buildLegacyContextForImage(image: Img) {
    if (image.sourceType !== "imported") return undefined;

    const legacyParts = [
      image.originalListingTitle?.trim()
        ? `Legacy title: ${image.originalListingTitle.trim()}`
        : "",
      image.originalListingDescription?.trim()
        ? `Legacy description: ${image.originalListingDescription.trim()}`
        : "",
    ].filter(Boolean);

    return legacyParts.length > 0 ? legacyParts.join("\n") : undefined;
  }

  async function runAiListingForImage(
    nextImage: Img,
    options: {
      userHints?: string[];
      legacyContext?: string;
      titleSeed?: string;
      pendingReason?: string;
      preserveVisibleCopyOnFailure?: boolean;
      successMessage?: string;
      targetField?: "title" | "description" | "full";
    } = {}
  ) {
    const requestTemplateDescription = nextImage.templateDescriptionOverride ?? templateDescription;
    const requestTemplateReference = nextImage.templateReferenceOverride ?? (template?.reference || "");
    const requestTemplateKey = `${requestTemplateReference || "no-template"}::${requestTemplateDescription.trim()}`;
    const requestUsesGlobalTemplate = !nextImage.templateDescriptionOverride;
    const requestOwner = Symbol(nextImage.id);

    aiLoopBusyRef.current = requestOwner;
    setImages((current) =>
      current.map((img) =>
        img.id === nextImage.id
          ? {
              ...img,
              aiProcessing: true,
              aiFieldStates: createAiFieldStates("loading"),
              status: "pending",
              statusReason: options.pendingReason || "Quantum AI is analyzing artwork.",
            }
          : img
      )
    );

    try {
      const imageDataUrl = await readDataUrl(nextImage.file);
      const requestProductFamily = nextImage.productFamilyOverride || resolveProductFamily(nextImage.cleaned, requestTemplateDescription);
      const sterileTemplateContext = buildTemplateContext(requestTemplateDescription, requestProductFamily);
      const legacyContext = options.legacyContext || buildLegacyContextForImage(nextImage);
      const response = await fetchWithTimeout(
        "/api/ai/listing",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl,
            title: options.titleSeed || nextImage.originalListingTitle || undefined,
            fileName: nextImage.name,
            templateContext: sterileTemplateContext,
            productFamily: requestProductFamily,
            userHints: options.userHints?.length ? options.userHints : undefined,
            legacyContext,
          }),
        },
        60000
      );

      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `AI request failed with status ${response.status}.`);
      if (requestUsesGlobalTemplate && activeTemplateKeyRef.current !== requestTemplateKey) return;

      const qcApproved = data?.qcApproved !== false;
      if (!qcApproved) {
        const qcFlags = Array.isArray(data?.reasonFlags)
          ? data.reasonFlags.filter((flag: unknown): flag is string => typeof flag === "string")
          : [];
        const message = qcFlags.length
          ? qcFlags.join(" • ")
          : "Quantum AI rejected this artwork because the design appears blank, illegible, or too distorted for safe listing generation.";

        setImages((current) =>
          current.map((img) => {
            if (img.id !== nextImage.id) return img;

            if (!options.preserveVisibleCopyOnFailure) {
              return {
                ...img,
                final: "",
                finalDescription: "",
                tags: [],
                aiProcessing: false,
                aiFieldStates: {
                  title: "error",
                  description: "error",
                  tags: "error",
                },
                status: "error",
                statusReason: message,
                processedTemplateKey: requestTemplateKey,
                aiDraft: undefined,
              };
            }

            const preservedBuyerDescription = splitDetailDescriptionForDisplay(
              img.templateDescriptionOverride ?? templateDescription,
              img.aiDraft?.leadParagraphs || [],
              img.finalDescription
            ).buyerFacingDescription;

            return {
              ...img,
              aiProcessing: false,
              aiFieldStates: {
                title: cleanTitle(String(img.final || img.aiDraft?.title || "")).trim() ? "ready" : "error",
                description: preservedBuyerDescription.trim() ? "ready" : "error",
                tags: img.tags.some((tag) => String(tag || "").trim()) ? "ready" : "error",
              },
              status: "error",
              statusReason: message,
              processedTemplateKey: requestTemplateKey,
            };
          })
        );
        setAiAssistStatus(message);
        return;
      }

      const fallbackTitle = clampTitleForListing(safeTitle(nextImage.final, nextImage.cleaned));
      const titleFromApi = typeof data?.title === "string" ? data.title : "";
      const finalTitle = clampTitleForListing(safeTitle(titleFromApi, fallbackTitle));
      const descriptionText = clampDescriptionForListing(normalizeDescriptionText(data?.description));
      const descriptionParagraphs = normalizeAiLeadParagraphs(
        Array.isArray(data?.leadParagraphs)
          ? data.leadParagraphs
          : descriptionTextToParagraphs(descriptionText)
      );
      const finalDescription = descriptionParagraphs.length
        ? (
          requestTemplateDescription.trim()
            ? formatProductDescriptionWithSections(descriptionParagraphs, requestTemplateDescription)
            : buildLeadOnlyDescription(descriptionParagraphs)
        )
        : "";
      const tags = normalizeTagsFromPayload(data?.tags).slice(0, LISTING_LIMITS.tagCount);
      const finalLead = descriptionParagraphs;
      const confidence = Number.isFinite(data?.confidence) ? clamp(Number(data.confidence), 0, 1) : 0;
      const reasonFlags = Array.isArray(data?.reasonFlags)
        ? data.reasonFlags.filter((flag: unknown) => typeof flag === "string")
        : [];
      const grade = data?.grade === "green" || data?.grade === "red"
        ? data.grade
        : data?.publishReady === true
          ? "green"
          : "red";
      const source = data?.source === "gemini" || data?.source === "fallback"
        ? data.source
        : "fallback";
      const publishReady =
        typeof data?.publishReady === "boolean"
          ? data.publishReady
          : qcApproved && grade === "green";
      const hasCompleteStructuredOutput = !!finalTitle && !!finalDescription && tags.length > 0;
      if (!hasCompleteStructuredOutput) {
        throw new Error("Quantum AI returned incomplete structured output.");
      }
      const nextFieldStates: AiFieldStates = publishReady
        ? {
            title: "ready",
            description: "ready",
            tags: "ready",
          }
        : {
            title: "error",
            description: "error",
            tags: "error",
          };
      const status: ItemStatus =
        publishReady
          ? "ready"
          : "error";
      const statusReason = reasonFlags.length
        ? reasonFlags.join(" • ")
        : status === "ready"
          ? source === "fallback"
            ? "Quantum AI produced a publish-ready fallback draft."
            : "AI draft passed publish checks."
          : source === "fallback"
            ? "Quantum AI completed a fallback draft, but it did not pass publish checks."
            : "Quantum AI could not generate a publish-ready draft for this image.";
      const targetField = options.targetField || "full";
      const currentVisibleTitle = safeTitle(nextImage.final, nextImage.originalListingTitle || nextImage.cleaned);
      const currentBuyerDescription = splitDetailDescriptionForDisplay(
        requestTemplateDescription,
        nextImage.aiDraft?.leadParagraphs || [],
        nextImage.finalDescription
      ).buyerFacingDescription;
      const currentVisibleDescription = currentBuyerDescription
        ? buildImageDescriptionHtmlForEdit(currentBuyerDescription, nextImage)
        : "";
      const currentVisibleTags = normalizeTagsFromPayload(nextImage.tags).slice(0, LISTING_LIMITS.tagCount);
      const targetedPublishReady =
        targetField === "full"
          ? publishReady
          : qcApproved
            && !!(targetField === "title" ? finalTitle : currentVisibleTitle)
            && !!(targetField === "description" ? finalDescription : currentVisibleDescription)
            && currentVisibleTags.length > 0;
      const nextStatus: ItemStatus = targetedPublishReady ? "ready" : "error";
      const nextStatusReason =
        targetField === "full"
          ? statusReason
          : targetedPublishReady
            ? targetField === "title"
              ? "Quantum AI refreshed the title."
              : "Quantum AI refreshed the description."
            : reasonFlags.length > 0
              ? reasonFlags.join(" • ")
              : `Quantum AI refreshed the ${targetField}, but this draft still needs the remaining listing fields.`;
      const visibleTitle =
        targetField === "description"
          ? currentVisibleTitle
          : safeTitle(finalTitle, currentVisibleTitle);
      const visibleDescription =
        targetField === "title"
          ? currentVisibleDescription
          : finalDescription || currentVisibleDescription;
      const visibleTags =
        targetField === "full"
          ? (publishReady ? tags : [])
          : currentVisibleTags;

      setImages((current) =>
        current.map((img) =>
          img.id === nextImage.id
            ? {
                ...img,
                final: visibleTitle,
                finalDescription: visibleDescription,
                tags: visibleTags,
                aiProcessing: false,
                aiFieldStates:
                  targetField === "title"
                    ? {
                        ...img.aiFieldStates,
                        title: visibleTitle ? "ready" : "error",
                      }
                    : targetField === "description"
                      ? {
                          ...img.aiFieldStates,
                          description: visibleDescription ? "ready" : "error",
                        }
                      : nextFieldStates,
                status: targetField === "full" ? status : nextStatus,
                statusReason: nextStatusReason,
                processedTemplateKey: requestTemplateKey,
                aiDraft: {
                  title: targetField === "description" ? (img.aiDraft?.title || currentVisibleTitle) : finalTitle,
                  leadParagraphs: targetField === "title" ? (img.aiDraft?.leadParagraphs || finalLead) : finalLead,
                  model: typeof data?.model === "string" ? data.model : AI_MODEL_LABEL,
                  confidence,
                  templateReference: requestTemplateReference,
                  reasonFlags,
                  source,
                  grade,
                  qcApproved,
                  publishReady: targetField === "full" ? publishReady : targetedPublishReady,
                },
              }
            : img
        )
      );
      setAiAssistStatus(options.successMessage || "");
    } catch (error) {
      if (requestUsesGlobalTemplate && activeTemplateKeyRef.current !== requestTemplateKey) return;
      const message = formatApiError(error instanceof Error ? error.message : "Quantum AI could not process this item.");
      setImages((current) =>
        current.map((img) => {
          if (img.id !== nextImage.id) return img;

          if (!options.preserveVisibleCopyOnFailure) {
            return {
              ...img,
              aiProcessing: false,
              aiFieldStates: {
                title: "error",
                description: "error",
                tags: "error",
              },
              status: "error",
              statusReason: message,
              processedTemplateKey: requestTemplateKey,
              aiDraft: undefined,
            };
          }

          const preservedBuyerDescription = splitDetailDescriptionForDisplay(
            img.templateDescriptionOverride ?? templateDescription,
            img.aiDraft?.leadParagraphs || [],
            img.finalDescription
          ).buyerFacingDescription;
          const preservedFieldStates: AiFieldStates = {
            title: cleanTitle(String(img.final || img.aiDraft?.title || "")).trim() ? "ready" : "error",
            description: preservedBuyerDescription.trim() ? "ready" : "error",
            tags: img.tags.some((tag) => String(tag || "").trim()) ? "ready" : "error",
          };

          return {
            ...img,
            aiProcessing: false,
            aiFieldStates: preservedFieldStates,
            status: "error",
            statusReason: message,
            processedTemplateKey: requestTemplateKey,
          };
        })
      );
      setAiAssistStatus(message);
    } finally {
      if (aiLoopBusyRef.current === requestOwner) {
        aiLoopBusyRef.current = null;
      }
    }
  }

  function beginInlineEdit(field: Exclude<InlineEditableField, null>) {
    if (field === "title") {
      if (!canEditDetailTitle) return;
      setEditableTitleDraft(shouldAwaitQuantumTitle ? "" : detailTitle || "");
    } else {
      if (!canEditDetailDescription) return;
      setEditableDescriptionDraft(shouldAwaitQuantumDescription ? "" : detailBuyerDescription || "");
    }

    setInlineSaveFeedback(null);
    setAiAssistStatus("");
    setEditingField(field);
  }

  async function commitInlineEdit(field: Exclude<InlineEditableField, null>, rawValue: string) {
    const nextValue = (
      field === "title"
        ? clampTitleForListing(rawValue)
        : clampDescriptionForListing(rawValue)
    ).replace(/\r\n?/g, "\n").trim();
    const previousValue = (field === "title" ? detailTitle : detailBuyerDescription).trim();

    if (!nextValue) {
      setEditingField(null);
      setInlineFeedbackState(field, "error", `${field === "title" ? "Title" : "Description"} cannot be blank.`);
      return;
    }

    if (nextValue === previousValue) {
      setEditingField(null);
      setInlineSaveFeedback(null);
      return;
    }

    if (selectedImage && canEditSelectedImageCopy) {
      setImages((current) =>
        current.map((img) => {
          if (img.id !== selectedImage.id) return img;

          const currentBuyerDescription = splitDetailDescriptionForDisplay(
            img.templateDescriptionOverride ?? templateDescription,
            img.aiDraft?.leadParagraphs || [],
            img.finalDescription
          ).buyerFacingDescription;
          const nextTitle = field === "title"
            ? nextValue
            : clampTitleForListing(
              safeTitle(img.final, img.aiDraft?.title || img.originalListingTitle || img.cleaned)
            );
          const nextBuyerDescription = field === "description"
            ? nextValue
            : currentBuyerDescription;
          const nextLeadParagraphs = descriptionTextToParagraphs(nextBuyerDescription);
          const nextDescriptionHtml = buildImageDescriptionHtmlForEdit(nextBuyerDescription, img);
          const preservedTags = normalizeTagsFromPayload(img.tags).slice(0, LISTING_LIMITS.tagCount);
          const derivedTags = preservedTags.length > 0
            ? preservedTags
            : buildManualOverrideTags(nextTitle, nextBuyerDescription, LISTING_LIMITS.tagCount);
          const readyAfterManualOverride =
            canManualOverrideFlaggedImage(img)
            && canManualOverrideListingCopy(nextTitle, nextBuyerDescription)
            && derivedTags.length > 0;

          return {
            ...img,
            final: nextTitle,
            finalDescription: nextDescriptionHtml,
            tags: readyAfterManualOverride ? derivedTags : preservedTags,
            aiFieldStates: readyAfterManualOverride
              ? {
                  title: "ready",
                  description: "ready",
                  tags: derivedTags.length > 0 ? "ready" : "error",
                }
              : {
                  ...img.aiFieldStates,
                  [field]: "ready",
                },
            status: readyAfterManualOverride ? "ready" : "error",
            statusReason: readyAfterManualOverride
              ? "Manual override approved this draft for upload."
              : img.statusReason,
            aiDraft: {
              title: nextTitle,
              leadParagraphs: nextLeadParagraphs,
              model: img.aiDraft?.model || AI_MODEL_LABEL,
              confidence: Math.max(img.aiDraft?.confidence || 0, readyAfterManualOverride ? 0.74 : 0.52),
              templateReference:
                img.aiDraft?.templateReference
                || img.templateReferenceOverride
                || template?.reference
                || "",
              reasonFlags: readyAfterManualOverride
                ? ["Manual override completed the missing listing fields."]
                : img.aiDraft?.reasonFlags || [],
              source: img.aiDraft?.source || "fallback",
              grade: readyAfterManualOverride ? "green" : (img.aiDraft?.grade || "red"),
              qcApproved: img.aiDraft?.qcApproved !== false,
              publishReady: readyAfterManualOverride,
            },
          };
        })
      );

      setEditingField(null);
      setInlineFeedbackState(
        field,
        "saved",
        canManualRescueSelectedImage
          ? "Saved and marked Good."
          : "Saved to this draft."
      );
      return;
    }

    if (!template || !shopId || !canEditImportedListing) {
      setEditingField(null);
      setInlineFeedbackState(field, "error", "Select a provider listing before editing metadata.");
      return;
    }

    if (field === "title") {
      setImportedListingTitle(nextValue);
      setTemplate((current) => (current ? { ...current, nickname: nextValue } : current));
    } else {
      setImportedListingDescription(nextValue);
    }

    setManualPrebufferOverride(true);

    if (!supportsProviderMetadataSync || !resolvedProviderId || !hasAnyLoadedImages) {
      setEditingField(null);
      const providerName = selectedProvider?.label || "This provider";
      setInlineFeedbackState(
        field,
        "saved",
        hasAnyLoadedImages
          ? `${providerName} metadata sync is not live yet, so this change is saved locally.`
          : "Saved locally for this draft."
      );
      return;
    }

    setInlineFeedbackState(field, "saving", field === "title" ? "Saving title..." : "Saving description...", 0);

    try {
      const body =
        field === "title"
          ? {
              provider: resolvedProviderId,
              shopId,
              productId: template.reference,
              title: nextValue,
            }
          : {
              provider: resolvedProviderId,
              shopId,
              productId: template.reference,
              description: buildEditableDescriptionHtml(nextValue),
            };

      const response = await fetchWithTimeout(
        "/api/update-listing-metadata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        30000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Metadata save failed with status ${response.status}.`);
      }

      setEditingField(null);
      setInlineFeedbackState(field, "saved", "Saved to provider.");
    } catch (error) {
      setEditingField(null);
      setInlineFeedbackState(field, "error", formatApiError(error instanceof Error ? error.message : "Unable to save listing metadata."));
    }
  }

  async function rerollSelectedImageField(field: "title" | "description") {
    if (!selectedImage || !canRerollSelectedImage) return;

    const userHints = buildUserHintsForImage(selectedImage);
    const titleSeed = clampTitleForListing(
      editingField === "title"
        ? editableTitleDraft
        : detailTitle || selectedImage.originalListingTitle || selectedImage.final || selectedImage.cleaned
    );

    setInlineSaveFeedback(null);
    setAiAssistStatus(
      field === "title"
        ? "Quantum AI is refreshing the title."
        : "Quantum AI is refreshing the description."
    );

    await runAiListingForImage(selectedImage, {
      targetField: field,
      userHints,
      legacyContext: buildLegacyContextForImage(selectedImage),
      titleSeed: titleSeed || undefined,
      pendingReason:
        field === "title"
          ? "Quantum AI is refreshing the title."
          : "Quantum AI is refreshing the description.",
      preserveVisibleCopyOnFailure: true,
      successMessage:
        field === "title"
          ? "Quantum AI refreshed the title using the current listing hints."
          : "Quantum AI refreshed the description using the current listing hints.",
    });
  }

  useEffect(() => {
    const previous = previousPreviewUrlsRef.current;
    const current = [...images, ...queuedImages].map((img) => img.preview);

    for (const url of previous) {
      if (url.startsWith("blob:") && !current.includes(url)) {
        URL.revokeObjectURL(url);
      }
    }

    previousPreviewUrlsRef.current = current;
  }, [images, queuedImages]);

  useEffect(() => {
    return () => {
      for (const url of previousPreviewUrlsRef.current) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      window.clearTimeout((triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId);
      clearInlineFeedbackTimer();
    };
  }, []);

  useEffect(() => {
    if (!isBootOverlayMounted) return;

    setIsBootOverlayPrimed(false);
    setIsBootOverlaySweepActive(false);

    const primeTimer = window.setTimeout(() => {
      setIsBootOverlayPrimed(true);
    }, 24);

    const sweepTimer = window.setTimeout(() => {
      setIsBootOverlaySweepActive(true);
    }, BOOT_SWEEP_START_MS);

    const timer = window.setTimeout(() => {
      setIsBootOverlayVisible(false);
    }, BOOT_OVERLAY_FADE_MS);

    return () => {
      window.clearTimeout(primeTimer);
      window.clearTimeout(sweepTimer);
      window.clearTimeout(timer);
    };
  }, [isBootOverlayMounted]);

  useEffect(() => {
    if (isBootOverlayVisible || !isBootOverlayMounted) return;

    const timer = window.setTimeout(() => {
      setIsBootOverlayMounted(false);
      setIsBootOverlayPrimed(false);
      setIsBootOverlaySweepActive(false);
    }, BOOT_OVERLAY_UNMOUNT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isBootOverlayMounted, isBootOverlayVisible]);

  useEffect(() => {
    activeTemplateKeyRef.current = templateKey;
    aiLoopBusyRef.current = null;
    setImages((current) =>
      current.map((img) =>
        img.sourceType === "imported" || img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              processedTemplateKey: undefined,
              aiDraft: undefined,
              aiProcessing: false,
              aiFieldStates: createAiFieldStates("idle"),
              status: "pending",
              statusReason: "Quantum AI is preparing listing copy.",
            }
      )
    );
    setQueuedImages((current) =>
      current.map((img) =>
        img.sourceType === "imported" || img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              processedTemplateKey: undefined,
              aiDraft: undefined,
              aiProcessing: false,
              aiFieldStates: createAiFieldStates("idle"),
              status: "pending",
              statusReason: "Quantum AI is preparing listing copy.",
            }
      )
    );
  }, [templateKey]);

  useEffect(() => {
    if (!shopId) {
      setApiProducts([]);
      setProductId("");
      setTemplate(null);
      setTemplateDescription("");
      setImportedListingTitle("");
      setImportedListingDescription("");
      setWorkspaceMode("");
      setIsRoutingGridExpanded(true);
      setSelectedImportIds([]);
      setPendingTemplateSelectionIds([]);
      setBulkEditGridPage(0);
      setCreateTemplateGridPage(0);
      setLastSelectedIndex(null);
      setImportStatus("");
      setEditingField(null);
      setInlineSaveFeedback(null);
      return;
    }

    if (productId && !visibleProducts.some((product) => product.id === productId)) {
      setProductId("");
    }
  }, [shopId, visibleProducts, productId]);

  useEffect(() => {
    if (bulkEditGridPage > bulkEditTotalPages - 1) {
      setBulkEditGridPage(Math.max(0, bulkEditTotalPages - 1));
    }
  }, [bulkEditGridPage, bulkEditTotalPages, isBulkEditMode]);

  useEffect(() => {
    if (createTemplateGridPage > createTemplateTotalPages - 1) {
      setCreateTemplateGridPage(Math.max(0, createTemplateTotalPages - 1));
    }
  }, [createTemplateGridPage, createTemplateTotalPages, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      setIsCreateThumbExpandedView(false);
      setCreateThumbGridPage(0);
      return;
    }

    if (createThumbGridPage > createThumbTotalPages - 1) {
      setCreateThumbGridPage(Math.max(0, createThumbTotalPages - 1));
    }
  }, [createThumbGridPage, createThumbTotalPages, isCreateMode]);

  useEffect(() => {
    setBulkEditGridPage(0);
    setCreateTemplateGridPage(0);
    setLastSelectedIndex(null);
  }, [shopId, workspaceMode]);

  useEffect(() => {
    if (!connected || !shopId || !workspaceMode || loadingProducts || apiProducts.length > 0 || !!apiStatus) return;
    void loadProductsForShop(shopId);
  }, [apiProducts.length, apiStatus, connected, loadingProducts, shopId, workspaceMode]);

  useEffect(() => {
    if (!shopId || !productId) {
      setTemplate(null);
      setTemplateDescription("");
      setImportedListingTitle("");
      setImportedListingDescription("");
      setManualPrebufferOverride(false);
      setEditingField(null);
      setInlineSaveFeedback(null);
      return;
    }

    void loadProductTemplate(productId);
  }, [shopId, productId]);

  useEffect(() => {
    setEditingField(null);
    setInlineSaveFeedback(null);
    setAiAssistStatus("");
  }, [selectedId, template?.reference]);

  useEffect(() => {
    if (!canShowDetailPanel) return;

    setMetadataSectionState({
      title: false,
      description: false,
      tags: false,
    });
  }, [
    canShowDetailPanel,
    productId,
    selectedId,
    selectedImage?.aiProcessing,
    selectedImage?.statusReason,
    template?.reference,
    detailTags.length,
  ]);

  useEffect(() => {
    if (!templateReadyForAi && !images.some((img) => img.sourceType === "imported")) return;
    if (aiLoopBusyRef.current) return;
    const nextImage = images.find((img) => {
      if (img.aiProcessing) return false;
      const nextTemplateDescription = img.templateDescriptionOverride ?? templateDescription;
      const nextReference = img.templateReferenceOverride ?? template?.reference ?? "no-template";
      const nextProcessingKey = `${nextReference}::${nextTemplateDescription.trim()}`;
      return img.processedTemplateKey !== nextProcessingKey;
    });
    if (!nextImage) return;
    void runAiListingForImage(nextImage);
  }, [LISTING_LIMITS.tagCount, images, template, templateDescription, templateKey, templateReadyForAi]);

  useEffect(() => {
    if (queuedImportedImages.length === 0) return;

    const settledApprovedImported = images.filter(
      (img) =>
        img.sourceType === "imported"
        && !img.aiProcessing
        && getResolvedItemStatus(img) === "ready"
    );

    if (settledApprovedImported.length === 0) return;

    const archivedIds = new Set(settledApprovedImported.map((img) => img.id));
    const remainingActive = images.filter((img) => !archivedIds.has(img.id));
    const { active: nextActive, queued: nextQueued } = fillActiveBatch(remainingActive, queuedImages, activeBatchLimit);

    setCompletedImportedImages((current) => [...current, ...settledApprovedImported]);
    setImages(nextActive);
    setQueuedImages(nextQueued);
    if (!selectedId || archivedIds.has(selectedId)) {
      setSelectedId(nextActive[0]?.id || "");
    }
  }, [activeBatchLimit, images, queuedImages, queuedImportedImages, selectedId]);

  function resetProviderState(clearStatus = true) {
    setConnected(false);
    setLoadingApi(false);
    setPulseConnected(false);
    setIsDisconnectArmed(false);
    setIsTokenInputFocused(false);
    if (clearStatus) setApiStatus("");
    setApiShops([]);
    setApiProducts([]);
    setLoadingProducts(false);
    setShopId("");
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");
    setWorkspaceMode("");
    setIsRoutingGridExpanded(true);
    setManualPrebufferOverride(false);
    setBatchResults([]);
    setRunStatus("");
    setEditingField(null);
    setInlineSaveFeedback(null);
    setAiAssistStatus("");
    setSelectedImportIds([]);
    setImportStatus("");
    setIsImportingListings(false);
    setIsSyncingImportedListings(false);
    setIsPublishingImportedListings(false);
    setImages([]);
    setCompletedImportedImages([]);
    setQueuedImages([]);
    setSelectedId("");
  }

function dismissBootOverlay() {
  setIsBootOverlaySweepActive(true);
  setIsBootOverlayVisible(false);
  setIsBootOverlayPrimed(false);
}

  function clearPreviewWorkspace() {
    setImages([]);
    setCompletedImportedImages([]);
    setQueuedImages([]);
    setSelectedId("");
    setIsCreateThumbExpandedView(false);
    setCreateThumbGridPage(0);
    setMessage("");
    setBatchResults([]);
    setRunStatus("");
    setImportStatus("");
    setAiAssistStatus("");
    setManualPrebufferOverride(false);
  }

  function handleWorkspaceModeChange(nextMode: WorkspaceMode) {
    setWorkspaceMode(nextMode);
    setIsRoutingGridExpanded(!nextMode);
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");
    setSelectedImportIds([]);
    setPendingTemplateSelectionIds([]);
    setLastSelectedIndex(null);
    setEditingField(null);
    setInlineSaveFeedback(null);
    clearPreviewWorkspace();

    if (nextMode === "edit") {
      setImportStatus("");
    }
  }

  function handleShopSelection(nextShopId: string) {
    setShopId(nextShopId);
    setApiProducts([]);
    setWorkspaceMode("");
    setIsRoutingGridExpanded(true);
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");
    setSelectedImportIds([]);
    setPendingTemplateSelectionIds([]);
    setBulkEditGridPage(0);
    setCreateTemplateGridPage(0);
    setLastSelectedIndex(null);
    clearPreviewWorkspace();
    setEditingField(null);
    setInlineSaveFeedback(null);
  }

  function openArtworkPicker() {
    if (!isCreateMode || !connected || !isWorkspaceConfigured) {
      nudgeWorkflow(true);
      return;
    }

    fileRef.current?.click();
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    if (!connected) return;
    setMessage("");
    const incoming = Array.from(list);
    const imageFiles = incoming.filter(isImage);
    const ignoredByType = incoming.length - imageFiles.length;
    const existingSignatures = new Set(
      [...images, ...completedImportedImages, ...queuedImages]
        .map((entry) => getFileSignature(entry.file))
        .filter(Boolean)
    );
    const uniqueImageFiles = imageFiles.filter((file) => {
      const signature = getFileSignature(file);
      if (existingSignatures.has(signature)) return false;
      existingSignatures.add(signature);
      return true;
    });
    const currentTotal = images.length + queuedImages.length;
    const room = Math.max(0, totalBatchLimit - currentTotal);
    const accepted = uniqueImageFiles.slice(0, room);
    const ignoredByLimit = Math.max(0, uniqueImageFiles.length - accepted.length);

    const good = await Promise.all(accepted.map(async (file) => {
      const cleaned = cleanTitle(file.name);
      const preview = await createContrastSafePreview(file);
      return {
        id: makeId(),
        name: file.name,
        file,
        preview: preview.src,
        previewBackground: preview.background,
        cleaned,
        final: cleaned,
        finalDescription: "",
        tags: [],
        status: "pending" as ItemStatus,
        statusReason: "Quantum AI is preparing listing copy.",
        aiFieldStates: createAiFieldStates("idle"),
      } satisfies Img;
    }));

    const { active: mergedActive, queued: mergedQueued } = appendToActiveBatch(images, queuedImages, good, activeBatchLimit);
    setImages(mergedActive);
    setQueuedImages(mergedQueued);
    if (!selectedId && mergedActive[0]) setSelectedId(mergedActive[0].id);

    const parts: string[] = [];
    if (mergedActive.length !== images.length || mergedQueued.length) {
      parts.push(`Loaded ${good.length} image${good.length === 1 ? "" : "s"}.`);
    }
    if (mergedQueued.length) {
      parts.push(`Queued ${mergedQueued.length} for later batches.`);
    }
    if (ignoredByType) parts.push(`Ignored ${ignoredByType} non-image file${ignoredByType === 1 ? "" : "s"}.`);
    if (ignoredByLimit) {
      parts.push(`Ignored ${ignoredByLimit} image${ignoredByLimit === 1 ? "" : "s"} above the ${CONNECTED_TOTAL_BATCH_FILES}-image total cap.`);
    }
    setMessage(parts.join(" "));
  }

  async function loadProductsForShop(nextShopId: string) {
    if (!connected || !isLiveProvider || !nextShopId || !resolvedProviderId) {
      setApiProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    try {
      const response = await fetchWithTimeout(
        `${getProviderRoute("products")}?provider=${encodeURIComponent(resolvedProviderId)}&shopId=${encodeURIComponent(nextShopId)}`
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `Products request failed with status ${response.status}.`);

      const mapped: Product[] = Array.isArray(data?.products)
        ? data.products.map((product: ApiProduct) => ({
            id: product.id,
            title: product.title || product.id,
            type: "Template",
            shopId: String(product.shop_id ?? nextShopId),
            description: product.description || "",
            previewUrl: product.preview_url || "",
          }))
        : [];

      setApiProducts(mapped);
      setApiStatus(mapped.length === 0 ? "No products were found for this shop." : "");
    } catch (error) {
      setApiProducts([]);
      const msg = error instanceof Error ? error.message : "Unable to load products.";
      setApiStatus(formatApiError(msg));
    } finally {
      setLoadingProducts(false);
    }
  }

  async function connectProvider(tokenOverride?: string) {
    const submittedToken = String(tokenOverride ?? token).trim();
    if (!provider || !resolvedProviderId || !submittedToken || !isLiveProvider) return;
    setLoadingApi(true);
    setApiStatus("");

    try {
      const response = await fetchWithTimeout(getProviderRoute("connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: resolvedProviderId, token: submittedToken }),
      });

      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `${selectedProvider?.label || "Provider"} connect failed with status ${response.status}.`);

      const shopsFromApi: Shop[] = Array.isArray(data?.shops)
        ? data.shops.map((shop: ApiShop) => ({ id: String(shop.id), title: shop.title || `Shop ${shop.id}` }))
        : [];

      setToken(submittedToken);
      setApiShops(shopsFromApi);
      setConnected(true);
      setIsDisconnectArmed(false);
      setIsTokenInputFocused(false);
      setShopId("");
      setWorkspaceMode("");
      setIsRoutingGridExpanded(true);
      setProductId("");
      setTemplate(null);
      setTemplateDescription("");
      setApiProducts([]);
      setPulseConnected(true);
      setTimeout(() => setPulseConnected(false), 1200);
      if (shopsFromApi.length === 0) {
        setApiStatus("No shops were returned for this provider connection.");
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : `Unable to connect to ${selectedProvider?.label || "provider"}.`;
      resetProviderState(false);
      setApiStatus(formatApiError(msg));
    } finally {
      setLoadingApi(false);
    }
  }

  async function disconnectProvider() {
    try {
      await fetchWithTimeout(getProviderRoute("disconnect"), { method: "POST" });
    } catch {
      // local reset only
    } finally {
      setIsDisconnectArmed(false);
      setIsTokenInputFocused(false);
      setToken("");
      resetProviderState(true);
      setApiStatus("");
    }
  }

  async function loadProductTemplate(nextProductId = productId) {
    const fallback = productSource.find((p) => p.id === nextProductId);
    if (!fallback || !shopId || !resolvedProviderId) return;

    setLoadingTemplateDetails(true);
    try {
      const response = await fetchWithTimeout(
        `${getProviderRoute("product")}?provider=${encodeURIComponent(resolvedProviderId)}&shopId=${encodeURIComponent(shopId)}&productId=${encodeURIComponent(nextProductId)}`
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `Product request failed with status ${response.status}.`);

      const responseData = (data || {}) as ApiTemplateResponse;
      const chosen = responseData.product || fallback;
      const title = chosen?.title || fallback.title;
      const usingFallbackDescription = !chosen?.description?.trim();
      const rawTemplateDescription =
        chosen?.description?.trim() ||
          fallback.description?.trim() ||
          "";
      const base = sanitizeTemplateDescriptionForPrebuffer(rawTemplateDescription, title);
      const importedBuyerDescription = extractBuyerFacingDescriptionFromListing(rawTemplateDescription, base);
      const nextPlacementGuide = responseData.placementGuide || template?.placementGuide || DEFAULT_PLACEMENT_GUIDE;

      setTemplate({
        reference: chosen?.id || fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
        placementGuide: nextPlacementGuide,
      });
      setTemplateDescription(base);
      setImportedListingTitle(title);
      setImportedListingDescription(importedBuyerDescription);
      setManualPrebufferOverride(false);
      setApiStatus(
        !base
          ? "Static provider product specs were not available in this template response."
          : usingFallbackDescription
            ? "Live template specs are unavailable here, so MerchQuantum is preserving the saved provider spec block from this response."
            : ""
      );
    } catch (error) {
      const title = fallback.title;
      const base = sanitizeTemplateDescriptionForPrebuffer(fallback.description?.trim() || "", title);
      const importedBuyerDescription = extractBuyerFacingDescriptionFromListing(fallback.description?.trim() || "", base);

      setTemplate({
        reference: fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
        placementGuide: template?.placementGuide || DEFAULT_PLACEMENT_GUIDE,
      });
      setTemplateDescription(base);
      setImportedListingTitle(title);
      setImportedListingDescription(importedBuyerDescription);
      setManualPrebufferOverride(false);
      const baseStatus = formatApiError(error instanceof Error ? error.message : "Unable to load template product.");
      setApiStatus(base ? baseStatus : `${baseStatus} Static provider product specs were not available in this template response.`);
    } finally {
      setLoadingTemplateDetails(false);
    }
  }

  function getSelectionRangeIds(startIndex: number, endIndex: number) {
    const rangeStart = Math.min(startIndex, endIndex);
    const rangeEnd = Math.max(startIndex, endIndex);
    return visibleProducts.slice(rangeStart, rangeEnd + 1).map((product) => product.id);
  }

  function handleBulkEditThumbnailSelection(
    sourceId: string,
    index: number,
    options?: { shiftKey?: boolean }
  ) {
    const nextSelections = options?.shiftKey && lastSelectedIndex !== null
      ? normalizeSelectionIds([...pendingTemplateSelectionIds, ...getSelectionRangeIds(lastSelectedIndex, index)])
      : pendingTemplateSelectionIds.includes(sourceId)
        ? pendingTemplateSelectionIds.filter((entry) => entry !== sourceId)
        : normalizeSelectionIds([...pendingTemplateSelectionIds, sourceId]);

    setPendingTemplateSelectionIds(nextSelections);
    setLastSelectedIndex(index);
  }

  async function handleCreateTemplateSelection(sourceId: string, index: number) {
    setLastSelectedIndex(index);
    await commitTemplateSelections(selectedImportIds.includes(sourceId) ? [] : [sourceId]);
  }

  async function commitTemplateSelections(sourceIds: string[]) {
    const normalizedSelections = normalizeSelectionIds(sourceIds);
    const nextSelections = isCreateMode ? normalizedSelections.slice(0, 1) : normalizedSelections;
    const selectionChanged = !selectionsMatch(nextSelections, selectedImportIds);

    setSelectedImportIds(nextSelections);
    setPendingTemplateSelectionIds(nextSelections);
    if (nextSelections.length === 0) {
      setLastSelectedIndex(null);
    }
    setEditingField(null);
    setInlineSaveFeedback(null);

    if (!selectionChanged) {
      if (isBulkEditMode && nextSelections.length > 0) {
        setImportStatus("");
      }
      return;
    }

    clearPreviewWorkspace();
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");

    if (nextSelections.length === 0) {
      setImportStatus("");
      return;
    }

    if (isCreateMode) {
      setImportStatus("");
      setProductId(nextSelections[0]);
      return;
    }

    setImportStatus(`Loading ${nextSelections.length} provider listing${nextSelections.length === 1 ? "" : "s"} for SEO tuning...`);
    await importSelectedListings(nextSelections, { replaceExisting: true });
  }

  function buildImportedImageSeed(record: ImportedListingRecord, file: File, preview: { src: string; background: string }, artworkBounds: ArtworkBounds): Img {
    const titleSeed = clampTitleForListing(record.title || record.artwork?.fileName || "Recovered Artwork");
    const cleaned = cleanTitle(titleSeed || record.artwork?.fileName || record.id);
    const staticSpecBlock = sanitizeTemplateDescriptionForPrebuffer(record.templateDescription || record.description || "", record.title);
    const buyerDescription = clampDescriptionForListing(
      extractBuyerFacingDescriptionFromListing(record.description || "", staticSpecBlock)
    );

    return {
      id: makeId(),
      name: titleSeed || cleaned,
      file,
      preview: preview.src,
      previewBackground: preview.background,
      cleaned,
      final: titleSeed || cleaned,
      finalDescription: "",
      tags: [],
      status: "pending",
      statusReason: "Quantum AI is preparing listing copy.",
      aiFieldStates: createAiFieldStates("idle"),
      artworkBounds,
      sourceType: "imported",
      providerId: resolvedProviderId as ProviderId,
      providerStoreId: record.storeId,
      providerProductId: record.id,
      templateDescriptionOverride: staticSpecBlock,
      templateReferenceOverride: normalizeRef(record.id) || record.id,
      productFamilyOverride: resolveProductFamily(titleSeed || cleaned, staticSpecBlock),
      importedArtwork: record.artwork,
      originalListingTitle: titleSeed || cleaned,
      originalListingDescription: buyerDescription,
      syncState: "idle",
      syncMessage: "Awaiting Quantum AI rewrite.",
    };
  }

  async function importSelectedListings(
    sourceIdsOverride = selectedImportIds,
    options: { replaceExisting?: boolean } = {}
  ) {
    const sourceIds = normalizeSelectionIds(sourceIdsOverride);
    if (!resolvedProviderId || !shopId || sourceIds.length === 0) {
      return;
    }

    const existingImportedCount = options.replaceExisting ? 0 : importedQueueCount;
    const existingImportedIds = options.replaceExisting ? new Set<string>() : importedProductIds;
    const remainingCapacity = Math.max(0, IMPORT_QUEUE_LIMIT - existingImportedCount);
    if (remainingCapacity === 0) {
      setImportStatus(`The workspace is capped at ${IMPORT_QUEUE_LIMIT} listings in this pass.`);
      return;
    }

    const uniqueIds = Array.from(new Set(sourceIds));
    const duplicateIds = uniqueIds.filter((id) => existingImportedIds.has(id));
    const idsToImport = uniqueIds
      .filter((id) => !existingImportedIds.has(id))
      .slice(0, remainingCapacity);
    const skippedByLimit = Math.max(0, uniqueIds.length - duplicateIds.length - idsToImport.length);

    if (idsToImport.length === 0) {
      setImportStatus(duplicateIds.length > 0 ? "Those provider listings are already loaded in the review queue." : "Select at least one provider listing to import.");
      return;
    }

    setIsImportingListings(true);
    setImportStatus(`Rescuing ${idsToImport.length} provider listing${idsToImport.length === 1 ? "" : "s"}...`);

    try {
      const response = await fetchWithTimeout(
        "/api/providers/import-listings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: resolvedProviderId,
            shopId,
            sourceIds: idsToImport,
          }),
        },
        60000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Import request failed with status ${response.status}.`);
      }

      const importedRecords: ImportedListingRecord[] = Array.isArray(data?.items)
        ? data.items.map((item: ImportedListingRecord) => ({
            id: String(item.id || ""),
            storeId: String(item.storeId || shopId),
            title: String(item.title || ""),
            description: String(item.description || ""),
            tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || "")) : [],
            templateDescription: String(item.templateDescription || ""),
            artwork: item.artwork || null,
          }))
        : [];

      const rescued: Img[] = [];
      let skippedMissingArtwork = 0;
      let skippedFailedRescue = 0;

      for (const record of importedRecords) {
        if (!record.artwork?.url) {
          skippedMissingArtwork += 1;
          continue;
        }

        try {
          const fallbackFileName = `${cleanTitle(record.title || record.artwork.fileName || "Recovered Artwork") || "Recovered Artwork"}.png`;
          const file = await urlToFile(record.artwork.url, record.artwork.fileName || fallbackFileName, record.artwork.contentType || "image/png");
          const preview = await createContrastSafePreview(file);
          const artworkBounds = await analyzeArtworkBounds(file);
          rescued.push(buildImportedImageSeed(record, file, preview, artworkBounds));
        } catch {
          skippedFailedRescue += 1;
        }
      }

      let queuedImportedAfterImport = queuedImportedImages.length;
      if (rescued.length > 0) {
        const baseActive = options.replaceExisting ? [] : images;
        const baseQueued = options.replaceExisting ? [] : queuedImages;
        const { active: mergedActive, queued: mergedQueued } = appendToActiveBatch(baseActive, baseQueued, rescued, activeBatchLimit);
        if (options.replaceExisting) {
          setCompletedImportedImages([]);
        }
        setImages(mergedActive);
        setQueuedImages(mergedQueued);
        setSelectedId(mergedActive[0]?.id || "");
        queuedImportedAfterImport = mergedQueued.filter((img) => img.sourceType === "imported").length;
      }

      const summary: string[] = [];
      if (rescued.length > 0) {
        summary.push(`Loaded ${rescued.length} provider listing${rescued.length === 1 ? "" : "s"} into Bulk Edit Mode.`);
      }
      if (rescued.length > 0 && queuedImportedAfterImport > 0) {
        summary.push(`${queuedImportedAfterImport} listing${queuedImportedAfterImport === 1 ? "" : "s"} are waiting behind the active review set.`);
      }
      if (duplicateIds.length > 0) {
        summary.push(`Skipped ${duplicateIds.length} duplicate${duplicateIds.length === 1 ? "" : "s"}.`);
      }
      if (skippedByLimit > 0) {
        summary.push(`Skipped ${skippedByLimit} above the ${IMPORT_QUEUE_LIMIT}-item import cap.`);
      }
      if (skippedMissingArtwork > 0) {
        summary.push(`${skippedMissingArtwork} listing${skippedMissingArtwork === 1 ? "" : "s"} did not expose recoverable artwork.`);
      }
      if (skippedFailedRescue > 0) {
        summary.push(`${skippedFailedRescue} artwork rescue${skippedFailedRescue === 1 ? "" : "s"} failed during download.`);
      }

      setImportStatus(summary.join(" ") || "No provider listings were imported.");
    } catch (error) {
      setImportStatus(formatApiError(error instanceof Error ? error.message : "Unable to import provider listings."));
    } finally {
      setIsImportingListings(false);
    }
  }

  async function syncImportedItems(items: Img[], options: { announce?: boolean } = {}) {
    const announce = options.announce !== false;

    if (!resolvedProviderId || !shopId || items.length === 0) {
      return { syncedItems: [] as Img[], failedCount: 0 };
    }

    if (!supportsImportedListingSync) {
      if (announce) {
        setImportStatus(`${selectedProvider?.label || "This provider"} metadata sync is not available in this pass yet.`);
      }
      return { syncedItems: [] as Img[], failedCount: items.length };
    }

    setIsSyncingImportedListings(true);
    if (announce) {
      setImportStatus(`Syncing ${items.length} approved listing${items.length === 1 ? "" : "s"} back to ${selectedProvider?.label || "the provider"}...`);
    }

    let syncedCount = 0;
    let failedCount = 0;
    const syncedItems: Img[] = [];

    for (const item of items) {
      if (!item.providerProductId) {
        failedCount += 1;
        continue;
      }

      setImages((current) =>
        current.map((img) =>
          img.id === item.id
            ? {
                ...img,
                syncState: "syncing",
                syncMessage: "Syncing SEO rewrite to provider...",
              }
            : img
        )
      );

      try {
        const requestBody: Record<string, unknown> = {
          provider: resolvedProviderId,
          shopId,
          productId: item.providerProductId,
          title: item.final,
        };

        if (resolvedProviderId === "printify") {
          requestBody.description = item.finalDescription;
          requestBody.tags = item.tags;
        }

        const response = await fetchWithTimeout(
          "/api/update-listing-metadata",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          },
          60000
        );
        const data = await parseResponsePayload(response);
        if (!response.ok) {
          throw new Error(data?.error || `Metadata sync failed with status ${response.status}.`);
        }

        syncedCount += 1;
        syncedItems.push(item);
        setImages((current) =>
          current.map((img) =>
            img.id === item.id
              ? {
                  ...img,
                  syncState: "synced",
                  syncMessage: "Provider metadata is synced.",
                }
              : img
          )
        );
      } catch (error) {
        failedCount += 1;
        const message = formatApiError(error instanceof Error ? error.message : "Unable to sync provider metadata.");
        setImages((current) =>
          current.map((img) =>
            img.id === item.id
              ? {
                  ...img,
                  syncState: "error",
                  syncMessage: message,
                }
              : img
          )
        );
      }
    }

    if (announce) {
      setImportStatus(
        failedCount > 0
          ? `Synced ${syncedCount} approved listing${syncedCount === 1 ? "" : "s"} and flagged ${failedCount} for manual review.`
          : `Synced ${syncedCount} approved listing${syncedCount === 1 ? "" : "s"} back to ${selectedProvider?.label || "the provider"}.`
      );
    }
    setIsSyncingImportedListings(false);
    return { syncedItems, failedCount };
  }

  async function syncApprovedImportedListings() {
    await syncImportedItems(approvedImportedItems);
  }

  async function publishImportedItems(items: Img[]) {
    if (!resolvedProviderId || !shopId || items.length === 0) {
      setImportStatus("Sync approved listings before sending them to the provider publish step.");
      return;
    }

    if (!supportsImportedPublish) {
      setImportStatus(`${selectedProvider?.label || "This provider"} direct publishing is not available in this pass yet.`);
      return;
    }

    const publishableProductIds = new Set(
      items.map((item) => item.providerProductId).filter((value): value is string => !!value)
    );
    if (publishableProductIds.size === 0) {
      setImportStatus("Sync approved listings before sending them to the provider publish step.");
      return;
    }

    setIsPublishingImportedListings(true);
    setImportStatus(`Publishing ${publishableProductIds.size} synced approved listing${publishableProductIds.size === 1 ? "" : "s"}...`);

    try {
      const response = await fetchWithTimeout(
        "/api/providers/publish-listings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: resolvedProviderId,
            shopId,
            items: items.map((item) => ({
              productId: item.providerProductId,
              title: item.final,
              description: item.finalDescription,
              tags: item.tags,
              publishReady: item.aiDraft?.publishReady === true,
              qcApproved: item.aiDraft?.qcApproved !== false,
            })),
          }),
        },
        60000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Publish request failed with status ${response.status}.`);
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const publishedIds = new Set<string>();
      const errorMessages = new Map<string, string>();

      for (const entry of results) {
        const productId = String(entry?.productId || "").trim();
        const message = String(entry?.message || "").trim();
        if (!productId) continue;
        if (/accepted/i.test(message)) {
          publishedIds.add(productId);
        } else if (message) {
          errorMessages.set(productId, message);
        }
      }

      setImages((current) =>
        current.map((img) => {
          if (!img.providerProductId || !publishableProductIds.has(img.providerProductId)) {
            return img;
          }

          if (publishedIds.has(img.providerProductId)) {
            return {
              ...img,
              syncMessage: "Provider publish request accepted.",
            };
          }

          if (errorMessages.has(img.providerProductId)) {
            return {
              ...img,
              syncState: "error",
              syncMessage: formatApiError(errorMessages.get(img.providerProductId) || "Unable to publish this listing."),
            };
          }

          return img;
        })
      );

      const failedCount = errorMessages.size;
      setImportStatus(
        failedCount > 0
          ? `Published ${publishedIds.size} listing${publishedIds.size === 1 ? "" : "s"} and left ${failedCount} flagged for follow-up.`
          : `Published ${publishedIds.size} approved listing${publishedIds.size === 1 ? "" : "s"} to ${selectedProvider?.label || "the provider"}.`
      );
    } catch (error) {
      setImportStatus(formatApiError(error instanceof Error ? error.message : "Unable to publish approved listings."));
    } finally {
      setIsPublishingImportedListings(false);
    }
  }

  async function publishApprovedImportedListings() {
    await publishImportedItems(syncedApprovedImportedItems);
  }

  async function runBulkEditPublishAction() {
    if (approvedImportedItems.length === 0) {
      setImportStatus("Approve at least one rescued listing before publishing.");
      return;
    }

    if (supportsImportedPublish) {
      setImportStatus(`Preparing ${approvedImportedItems.length} approved listing${approvedImportedItems.length === 1 ? "" : "s"} for publish...`);
      const { syncedItems } = await syncImportedItems(approvedImportedItems, { announce: false });
      if (syncedItems.length === 0) {
        setImportStatus("No approved rescued listings were ready to publish after provider sync.");
        return;
      }
      await publishImportedItems(syncedItems);
      return;
    }

    if (supportsImportedListingSync) {
      await syncImportedItems(approvedImportedItems);
      return;
    }

    setImportStatus(`${selectedProvider?.label || "This provider"} publishing is not available in this pass yet.`);
  }

  async function runDraftBatch() {
    if (!template || !shopId || readyCount === 0 || !isLiveProvider || !resolvedProviderId) return;

      const activeImages = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready");
    setIsRunningBatch(true);
    setRunStatus("");
    setBatchResults([]);
    const nextResults: BatchResult[] = [];

    try {
      for (let index = 0; index < activeImages.length; index += 1) {
        const img = activeImages[index];
        const titleForUpload = String(img.final || "").trim();
        const description = String(img.finalDescription || "").trim();
        const tags = img.tags
          .map((tag) => String(tag || "").trim())
          .filter(Boolean);

        setRunStatus(`Uploading draft ${index + 1} of ${activeImages.length}...`);

        try {
          if (!titleForUpload || !description || tags.length === 0 || img.aiDraft?.publishReady !== true || img.aiDraft?.qcApproved === false) {
            throw new Error("Only Good items with complete Quantum AI output can be uploaded.");
          }

          const imageDataUrl = await readDataUrl(img.file);
          const artworkBounds = img.artworkBounds || (await analyzeArtworkBounds(img.file));
          if (!img.artworkBounds) {
            setImages((current) => current.map((entry) => (entry.id === img.id ? { ...entry, artworkBounds } : entry)));
          }

          const response = await fetchWithTimeout(getProviderRoute("batch-create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: resolvedProviderId,
              shopId,
              templateProductId: template.reference,
              item: {
                fileName: img.name,
                title: titleForUpload,
                description,
                tags,
                imageDataUrl,
                artworkBounds,
                publishReady: img.aiDraft?.publishReady === true,
                qcApproved: true,
              },
            }),
          });

          const data = await parseResponsePayload(response);
          if (!response.ok) throw new Error(data?.error || `Draft request failed with status ${response.status}.`);

          const result = Array.isArray(data?.results) && data.results[0]
            ? (data.results[0] as BatchResult)
            : { fileName: img.name, title: titleForUpload, message: data?.message || "Created draft product." };

          nextResults.push(result);
          setBatchResults([...nextResults]);
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : "Draft create failed.";
          const errorMessage = formatApiError(rawMessage);
          nextResults.push({ fileName: img.name, title: titleForUpload, message: errorMessage });
          setBatchResults([...nextResults]);
        }
      }

      const createdCount = nextResults.filter((result) => !!result.productId).length;
      const batchSucceeded = createdCount === activeImages.length && activeImages.length > 0;

      if (batchSucceeded && queuedImages.length > 0) {
        const nextBatch = queuedImages.slice(0, ACTIVE_BATCH_FILES);
        const remainingQueue = queuedImages.slice(ACTIVE_BATCH_FILES);
        setImages(nextBatch);
        setQueuedImages(remainingQueue);
        setSelectedId(nextBatch[0]?.id || "");
        setRunStatus(
          `Uploaded ${createdCount} draft product${createdCount === 1 ? "" : "s"}. Loaded ${nextBatch.length} queued image${nextBatch.length === 1 ? "" : "s"} next.`
        );
      } else {
        setRunStatus(`Uploaded ${createdCount} draft product${createdCount === 1 ? "" : "s"} out of ${activeImages.length}.`);
      }
    } finally {
      setIsRunningBatch(false);
    }
  }

  function removePreviewItem(targetId: string) {
    const remainingActive = images.filter((entry) => entry.id !== targetId);
    const { active: nextActive, queued: nextQueued } = fillActiveBatch(remainingActive, queuedImages, activeBatchLimit);
    setImages(nextActive);
    setQueuedImages(nextQueued);
    if (selectedId === targetId) setSelectedId(nextActive[0]?.id || "");
  }

  function openThumbnailHoverPreview(preview: ThumbnailHoverPreview) {
    setThumbnailHoverPreview(preview);
  }

  function closeThumbnailHoverPreview(key?: string) {
    setThumbnailHoverPreview((current) => {
      if (!current) return null;
      if (key && current.key !== key) return current;
      return null;
    });
  }

  const renderProductSelectionGrid = ({
    heading,
    items,
    selectedIds,
    rangeLabel,
    page,
    totalPages,
    onSelectAll,
    onClearSelection,
    onItemActivate,
    onPreviousPage,
    onNextPage,
    loading,
  }: {
    heading: string;
    items: Product[];
    selectedIds: string[];
    rangeLabel: string;
    page: number;
    totalPages: number;
    onSelectAll?: () => void;
    onClearSelection: () => void;
    onItemActivate: (
      product: Product,
      index: number,
      event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>
    ) => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
    loading: boolean;
  }) => (
    <>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium tracking-tight text-white">{heading}</span>
        <div className="flex items-center gap-3 text-[11px]">
          {onSelectAll ? (
            <button
              type="button"
              className="font-medium text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
              disabled={visibleProducts.length === 0}
              onClick={onSelectAll}
            >
              Select All
            </button>
          ) : null}
          <button
            type="button"
            className="font-medium text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
            disabled={selectedIds.length === 0}
            onClick={onClearSelection}
          >
            Clear Selection
          </button>
        </div>
      </div>

      <div className="mt-3">
        {items.length > 0 ? (
          <div className="grid grid-cols-5 gap-2.5 sm:gap-3">
            {items.map((product, index) => {
              const globalIndex = page * selectionPageSize + index;
              const isSelected = selectedIds.includes(product.id);
              const alreadyImported = importedProductIds.has(product.id);
              const cardTone = isSelected
                ? "border-[#7F22FE] ring-2 ring-[#7F22FE]/80 shadow-[0_0_10px_rgba(147,51,234,0.5)] opacity-100"
                : alreadyImported
                  ? "border-[#00BC7D]/45 opacity-60 hover:opacity-100"
                  : "border-slate-800/80 opacity-60 hover:opacity-100";

              return (
                <button
                  key={`${heading}-${product.id}`}
                  type="button"
                  onPointerEnter={() =>
                    openThumbnailHoverPreview({
                      key: product.id,
                      title: product.title,
                      snippet: getProductPreviewSnippet(product),
                      imageUrl: product.previewUrl,
                      background: DISPLAY_NEUTRAL_BACKGROUND,
                    })
                  }
                  onPointerLeave={() => closeThumbnailHoverPreview(product.id)}
                  onFocus={() =>
                    openThumbnailHoverPreview({
                      key: product.id,
                      title: product.title,
                      snippet: getProductPreviewSnippet(product),
                      imageUrl: product.previewUrl,
                      background: DISPLAY_NEUTRAL_BACKGROUND,
                    })
                  }
                  onBlur={() => closeThumbnailHoverPreview(product.id)}
                  onClick={(event) => onItemActivate(product, globalIndex, event)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onItemActivate(product, globalIndex, event);
                    }
                  }}
                  className={`group relative aspect-square w-full min-w-0 cursor-pointer overflow-hidden rounded-xl border bg-[#020616] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/40 hover:z-10 hover:shadow-2xl active:scale-[1.02] ${cardTone}`}
                  aria-label={product.title}
                >
                  <div className="absolute inset-0" style={{ backgroundColor: DISPLAY_NEUTRAL_BACKGROUND }} />
                  {product.previewUrl ? (
                    <img
                      src={product.previewUrl}
                      alt={product.title}
                      className="relative z-[1] h-full w-full object-cover"
                    />
                  ) : (
                    <div className="relative z-[1] flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(127,34,254,0.28),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,22,0.98))]" />
                  )}
                  <div className={`pointer-events-none absolute inset-0 transition ${
                    isSelected ? "bg-[#7F22FE]/14" : "bg-black/10"
                  }`} />
                  <div className="pointer-events-none absolute inset-0 flex items-end bg-black/80 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="line-clamp-3 text-[10px] font-medium leading-tight text-white">
                      {product.title}
                    </span>
                  </div>
                  {(isSelected || alreadyImported) ? (
                    <span
                      className={`absolute left-2 top-2 h-2.5 w-2.5 rounded-full ${
                        isSelected
                          ? "bg-[#C084FC] shadow-[0_0_10px_rgba(192,132,252,0.95)]"
                          : "bg-[#00BC7D] shadow-[0_0_8px_rgba(0,188,125,0.9)]"
                      }`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl px-3 py-6 text-sm text-slate-400">
            {loading ? "Loading provider listings..." : "Provider product thumbnails will appear here."}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 text-[11px]">
        {visibleProducts.length > 0 ? (
          <span className="text-xs text-slate-500">{rangeLabel}</span>
        ) : null}
        <button
          type="button"
          className="font-medium text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
          disabled={page <= 0}
          onClick={onPreviousPage}
        >
          Prev 25
        </button>
        <button
          type="button"
          className="font-medium text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
          disabled={totalPages <= 1 || page >= totalPages - 1}
          onClick={onNextPage}
        >
          Next 25
        </button>
      </div>
    </>
  );

  return (
    <div className="relative min-h-screen max-w-full overflow-x-hidden bg-[#000000] px-6 pb-6 pt-3 text-white transition-colors md:px-8 md:pb-8 md:pt-4">
      {isBootOverlayMounted ? (
        <CreativeWellspringBootOverlay
          visible={isBootOverlayVisible}
          primed={isBootOverlayPrimed}
          sweepActive={isBootOverlaySweepActive}
          onDismiss={dismissBootOverlay}
        />
      ) : null}

      <div className={`mx-auto max-w-6xl space-y-3 transition-all duration-300 ${isBootOverlayVisible ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}>
        {!workspaceMode || isRoutingGridExpanded ? (
        <div className="relative">
          <Box
            className={`relative overflow-visible border-slate-800 bg-[#0b0f19] text-white shadow-[0_28px_80px_-40px_rgba(2,6,22,0.95)] ${routingGuidanceTarget ? "ring-1 ring-[#7F22FE]/45 shadow-[0_28px_90px_-40px_rgba(127,34,254,0.45)]" : connected ? "ring-1 ring-[#00BC7D]/35 shadow-[0_28px_90px_-40px_rgba(0,188,125,0.32)]" : ""}`}
          >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" />
          <div className={`pointer-events-none absolute -right-10 top-0 h-36 w-36 blur-3xl transition-all duration-700 sm:-right-16 sm:h-40 sm:w-40 md:-right-20 md:h-48 md:w-48 ${connected ? "bg-[#00BC7D]/12" : "bg-[#7F22FE]/12"} ${routingGuidanceTarget ? "animate-pulse" : ""}`} />
          <div className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-white/5 blur-3xl sm:-left-8 sm:h-28 sm:w-28 md:-left-12 md:h-32 md:w-32" />
          <div
            className={`pointer-events-none absolute inset-x-5 bottom-0 h-px transition-all duration-700 ${connected ? "bg-gradient-to-r from-transparent via-[#00BC7D]/90 to-transparent" : "bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent"} ${pulseConnected || routingGuidanceTarget ? "scale-x-100 opacity-100" : "scale-x-75 opacity-60"}`}
          />
          <div className="mb-3 flex min-w-0 items-center">
            <MerchQuantumInlineHeading className="max-w-full" />
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <div className={`min-w-0 ${getRoutingFieldGlowClass("provider")}`}>
              <Select
                value={provider}
                className={provider ? "text-[13px] font-normal text-white" : "font-medium text-slate-400"}
                onChange={(e) => {
                  const nextProvider = e.target.value as ProviderChoiceId | "";
                  setProvider(nextProvider);
                  setToken("");
                  setIsDisconnectArmed(false);
                  setIsTokenInputFocused(false);
                  resetProviderState(false);
                  const nextMeta = PROVIDERS.find((entry) => entry.id === nextProvider);
                  setApiStatus(nextMeta && !nextMeta.isLive ? `${nextMeta.label} is coming soon.` : "");
                }}
              >
                <option value="">Choose Provider</option>
                {PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>

            <div
              onMouseEnter={() => {
                nudgeProviderSelectionFromTokenArea();
                if (connected) setIsDisconnectArmed(true);
              }}
              onMouseLeave={() => setIsDisconnectArmed(false)}
              onFocusCapture={() => {
                nudgeProviderSelectionFromTokenArea();
                if (connected) setIsDisconnectArmed(true);
              }}
              onBlurCapture={(event) => {
                const relatedTarget = event.relatedTarget as Node | null;
                if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                  setIsDisconnectArmed(false);
                }
              }}
              onPointerDownCapture={nudgeProviderSelectionFromTokenArea}
              className={`min-w-0 ${getRoutingFieldGlowClass("token")}`}
            >
              <div className="relative flex min-w-0 items-center">
                <Input
                  type={connected || showCompactDisconnectedToken ? "text" : "password"}
                  value={tokenFieldValue}
                  disabled={!provider}
                  readOnly={connected || showCompactDisconnectedToken}
                  placeholder="API Key"
                  onChange={(e) => setToken(e.target.value)}
                  onPaste={(event) => {
                    if (connected) return;
                    const pastedToken = event.clipboardData.getData("text").trim();
                    if (!pastedToken) return;
                    event.preventDefault();
                    setToken(pastedToken);
                    setIsTokenInputFocused(false);
                  }}
                  onFocus={() => {
                    if (!connected) {
                      setIsTokenInputFocused(true);
                    }
                  }}
                  onBlur={() => {
                    if (!connected) {
                      setIsTokenInputFocused(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmitProviderConnectionWithToken(e.currentTarget.value)) {
                      e.preventDefault();
                      void connectProvider(e.currentTarget.value);
                    }
                  }}
                  className="min-w-0 truncate pr-20 disabled:cursor-not-allowed sm:pr-24"
                />
                <div
                  className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center"
                  onMouseEnter={() => {
                    if (connected) setIsDisconnectArmed(true);
                  }}
                  onMouseLeave={() => setIsDisconnectArmed(false)}
                  onFocusCapture={() => {
                    if (connected) setIsDisconnectArmed(true);
                  }}
                  onBlurCapture={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null;
                    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                      setIsDisconnectArmed(false);
                    }
                  }}
                >
                  {loadingApi ? (
                    <span className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-slate-300">
                      <QuantOrbLoader />
                    </span>
                  ) : connected ? (
                    isDisconnectArmed ? (
                      <button
                        type="button"
                        onClick={() => { void disconnectProvider(); }}
                        className="inline-flex h-8 items-center rounded-lg border border-[#FF2056]/40 bg-[#FF2056]/12 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#FF8CA8] transition hover:bg-[#FF2056]/18"
                      >
                        Off
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="Provider connected. Hover or click to disconnect."
                        onClick={() => setIsDisconnectArmed(true)}
                        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#00BC7D]/35 bg-[#00BC7D]/10 transition hover:bg-[#00BC7D]/14"
                      >
                        <span className="absolute inset-[7px] rounded-full bg-[#00BC7D] shadow-[0_0_14px_rgba(0,188,125,0.95)]" />
                        <span className="absolute inset-[3px] rounded-full border border-[#00BC7D]/55 animate-pulse" />
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void connectProvider(); }}
                      disabled={!canSubmitProviderConnection}
                      className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/80 disabled:text-slate-500"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={`relative min-w-0 ${getRoutingFieldGlowClass("shop")}`}>
              <Select
                value={shopId}
                disabled={!connected || loadingApi}
                className={shopId ? "text-[13px] font-normal text-white" : "font-medium text-slate-400"}
                onChange={(event) => {
                  handleShopSelection(event.target.value);
                }}
              >
                <option value="">
                  {shopTriggerLabel}
                </option>
                {availableShops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.title}
                  </option>
                ))}
              </Select>
            </div>

            <div className={`relative min-w-0 ${getRoutingFieldGlowClass("mode")}`}>
              <Select
                value={workspaceMode}
                disabled={!connected || !shopId}
                className={workspaceMode ? "text-[13px] font-normal text-white" : "font-medium text-slate-400"}
                onChange={(event) => {
                  handleWorkspaceModeChange(event.target.value as WorkspaceMode);
                }}
              >
                <option value="">{workspaceModePickerLabel}</option>
                <option value="create">Bulk Create</option>
                <option value="edit">Bulk Edit</option>
              </Select>
            </div>
          </div>

          {apiStatus ? <p className="mt-3 text-sm text-[#FE9A00]">{apiStatus}</p> : null}
        </Box>
        </div>
        ) : null}

        {connected && shopId && workspaceMode ? (
          <Box className="border-slate-800 bg-[#020616] shadow-[0_24px_70px_-38px_rgba(2,6,22,0.95)]">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
              className="hidden"
              onChange={(e) => {
                if (isCreateMode && connected && isWorkspaceConfigured) {
                  void addFiles(e.target.files);
                } else {
                  nudgeWorkflow(true);
                }
                e.currentTarget.value = "";
              }}
            />

            <div className="space-y-1.5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <MerchQuantumInlineHeading className="max-w-full" />
                <BareChevronButton
                  open={isRoutingGridExpanded}
                  onClick={() => setIsRoutingGridExpanded((current) => !current)}
                  label={isRoutingGridExpanded ? "Hide setup" : "Show setup"}
                  className="mt-0.5"
                />
              </div>

              {isBulkEditMode ? (
                <div className={selectorShellClassName}>
                  <div className="flex items-center justify-end">
                    {loadingProducts || isImportingListings ? <QuantOrbLoader /> : null}
                  </div>
                  {renderProductSelectionGrid({
                    heading: "Choose Listings to Edit",
                    items: bulkEditVisibleProducts,
                    selectedIds: pendingTemplateSelectionIds,
                    rangeLabel: bulkEditVisibleRangeLabel,
                    page: safeBulkEditPage,
                    totalPages: bulkEditTotalPages,
                    loading: loadingProducts,
                    onSelectAll: () => {
                      setPendingTemplateSelectionIds(normalizeSelectionIds(visibleProducts.map((product) => product.id)));
                      setLastSelectedIndex(null);
                    },
                    onClearSelection: () => {
                      setPendingTemplateSelectionIds([]);
                      setLastSelectedIndex(null);
                    },
                    onItemActivate: (product, index, event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleBulkEditThumbnailSelection(product.id, index, { shiftKey: "shiftKey" in event ? event.shiftKey : false });
                    },
                    onPreviousPage: () => setBulkEditGridPage((current) => Math.max(0, current - 1)),
                    onNextPage: () => setBulkEditGridPage((current) => Math.min(bulkEditTotalPages - 1, current + 1)),
                  })}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-400">{bulkEditSelectionCountLabel}</span>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
                        <button
                          type="button"
                          className="font-medium text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
                        onClick={() => {
                          setPendingTemplateSelectionIds([]);
                          setLastSelectedIndex(null);
                        }}
                        disabled={pendingTemplateSelectionIds.length === 0}
                      >
                        Clear staged
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-[#C084FC] transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
                        disabled={pendingTemplateSelectionIds.length === 0 || isImportingListings}
                        onClick={() => { void commitTemplateSelections(pendingTemplateSelectionIds); }}
                      >
                        {isImportingListings ? "Loading..." : "Load Selected"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={selectorShellClassName}>
                  <div className="flex items-center justify-end">
                    {loadingProducts || loadingTemplateDetails ? <QuantOrbLoader /> : null}
                  </div>
                  {renderProductSelectionGrid({
                    heading: "Choose Product Template",
                    items: createTemplateVisibleProducts,
                    selectedIds: selectedImportIds,
                    rangeLabel: createTemplateVisibleRangeLabel,
                    page: safeCreateTemplatePage,
                    totalPages: createTemplateTotalPages,
                    loading: loadingProducts,
                    onClearSelection: () => { void commitTemplateSelections([]); },
                    onItemActivate: (product, index, event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleCreateTemplateSelection(product.id, index);
                    },
                    onPreviousPage: () => setCreateTemplateGridPage((current) => Math.max(0, current - 1)),
                    onNextPage: () => setCreateTemplateGridPage((current) => Math.min(createTemplateTotalPages - 1, current + 1)),
                  })}
                </div>
              )}
            </div>
            {importStatus ? (
              <p className="mt-3 text-sm text-slate-300">{importStatus}</p>
            ) : null}

            {shopId && canShowWorkspacePreview ? (
              <>
                <div className="mt-3">
                  <div className="space-y-3" onPointerDownCapture={() => nudgeWorkflow(true)}>
                      <div className="relative rounded-[24px] transition-all">
                      <div className="grid grid-cols-1 items-stretch gap-3">
                        <div className="flex min-w-0 h-full flex-col gap-3">
                          <div
                            className={`${isCreateMode ? "cursor-pointer" : ""}`}
                            onClick={isCreateMode ? openArtworkPicker : undefined}
                          >
                            <div
                              className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#020616] lg:h-[19rem]"
                              onDragOver={(e) => {
                                if (isCreateMode) {
                                  e.preventDefault();
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!isCreateMode || !connected || !isWorkspaceConfigured) {
                                  nudgeWorkflow(true);
                                  return;
                                }
                                void addFiles(e.dataTransfer.files);
                              }}
                            >
                              {selectedImage?.preview ? (
                                <div
                                  className="absolute inset-0 overflow-hidden rounded-[inherit]"
                                  style={{ backgroundColor: selectedImage.previewBackground || DISPLAY_NEUTRAL_BACKGROUND }}
                                >
                                  <div className="absolute" style={{ inset: `${ARTWORK_SAFE_ZONE_PCT * 100}%` }}>
                                    <img src={selectedImage.preview} alt={selectedImage.final} className="h-full w-full object-contain" />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex h-full w-full p-2.5">
                                  <div className="relative flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#020616]/92 px-5 pb-14 pt-5 text-center transition-colors hover:bg-[#0b1024]">
                                    <div className="flex max-w-[18rem] flex-col items-center gap-1">
                                      {isCreateMode ? (
                                        <>
                                          <p className="font-bold text-white">Drag images here or click to add images</p>
                                          <p className="text-sm text-slate-300">Max 50 images.</p>
                                          <p className="text-xs text-slate-400">System will queue additional listings.</p>
                                          <p className="text-xs text-slate-500">(API Rate Limit Safety Enforced)</p>
                                        </>
                                      ) : (
                                        <>
                                          <p className="font-bold text-white">Preview unavailable</p>
                                        </>
                                      )}
                                    </div>
                                    {showPreviewStats ? (
                                      <div className={`absolute bottom-4 left-4 z-10 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] font-medium sm:text-xs ${previewOverlayTextClass}`}>
                                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                          <span>{readyCount}</span>
                                          <StatusThumbIcon tone="ready" direction="up" />
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                          <span>{errorCount}</span>
                                          <StatusThumbIcon tone="error" direction="down" />
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                          <span>{completedGenerationCount} Done</span>
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                          <span>Queue {queuedStatCount}</span>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={!hasAnyLoadedImages}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            if (!hasAnyLoadedImages) return;
                                            clearPreviewWorkspace();
                                          }}
                                          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium leading-none transition sm:text-xs ${previewOverlayUsesLightText ? "hover:text-white" : "hover:text-slate-950"} disabled:cursor-default disabled:opacity-100`}
                                        >
                                          Clear
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )}

                              {selectedImage?.preview && showPreviewStats ? (
                                <div className={`absolute bottom-6 left-6 z-10 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] font-medium sm:text-xs ${previewOverlayTextClass}`}>
                                  <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <span>{readyCount}</span>
                                    <StatusThumbIcon tone="ready" direction="up" />
                                  </div>
                                  <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <span>{errorCount}</span>
                                    <StatusThumbIcon tone="error" direction="down" />
                                  </div>
                                  <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <span>{completedGenerationCount} Done</span>
                                  </div>
                                  <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <span>Queue {queuedStatCount}</span>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={!hasAnyLoadedImages}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!hasAnyLoadedImages) return;
                                      clearPreviewWorkspace();
                                    }}
                                    className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium leading-none transition sm:text-xs ${previewOverlayUsesLightText ? "hover:text-white" : "hover:text-slate-950"} disabled:cursor-default disabled:opacity-100`}
                                  >
                                    Clear
                                  </button>
                                </div>
                              ) : null}

                              {showPreviewStats ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] rounded-full bg-slate-800/90">
                                  <div
                                    className={`h-full transition-all duration-500 ${processingCount > 0 ? "bg-[#7F22FE]" : "bg-[#00A6F4]"}`}
                                    style={{ width: `${generationProgressPct}%` }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {canShowLoadedQueueGrid ? (
                            <div className="space-y-3 px-1">
                              <div className="grid grid-cols-5 gap-2">
                                {visibleCreateThumbnails.map((img, index) => {
                                  const isSelected = selectedImage?.id === img.id;
                                  const resolvedStatus = getResolvedItemStatus(img);
                                  const isProcessing = resolvedStatus === "pending";
                                  const previewFrameTone = isProcessing
                                    ? "border-[#7F22FE]/55"
                                    : resolvedStatus === "ready"
                                      ? "border-[#00BC7D]/55"
                                      : resolvedStatus === "error"
                                        ? "border-[#FF2056]/55"
                                        : "border-slate-700";
                                  const statusIndicator = resolvedStatus === "ready"
                                    ? { tone: "ready" as const, direction: "up" as const }
                                    : resolvedStatus === "error"
                                      ? { tone: "error" as const, direction: "down" as const }
                                      : null;

                                  return (
                                    <div
                                      key={img.id}
                                      onClick={() => setSelectedId(img.id)}
                                      className={`w-full rounded-lg transition-all duration-500 ${isProcessing ? "shadow-[0_12px_32px_-24px_rgba(124,58,237,0.45)]" : isSelected ? "shadow-[0_10px_24px_-20px_rgba(124,58,237,0.45)]" : ""}`}
                                    >
                                      <div className="relative">
                                        {isProcessing ? <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
                                        <div
                                          className={`group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-[#020616] transition-all duration-500 ${previewFrameTone}`}
                                          onPointerEnter={() =>
                                            openThumbnailHoverPreview({
                                              key: img.id,
                                              title: img.final || img.name,
                                              snippet: getImagePreviewSnippet(img),
                                              imageUrl: img.preview,
                                              background: img.previewBackground,
                                            })
                                          }
                                          onPointerLeave={() => closeThumbnailHoverPreview(img.id)}
                                          onFocus={() =>
                                            openThumbnailHoverPreview({
                                              key: img.id,
                                              title: img.final || img.name,
                                              snippet: getImagePreviewSnippet(img),
                                              imageUrl: img.preview,
                                              background: img.previewBackground,
                                            })
                                          }
                                          onBlur={() => closeThumbnailHoverPreview(img.id)}
                                        >
                                          {isProcessing ? <div className="pointer-events-none absolute inset-0 rounded-lg border border-[#7F22FE]/80 animate-pulse" /> : null}
                                          {statusIndicator ? (
                                            <div
                                              aria-label={statusIndicator.tone}
                                              className="absolute bottom-2 left-1/2 z-20 inline-flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-black"
                                            >
                                              <StatusThumbIcon tone={statusIndicator.tone} direction={statusIndicator.direction} />
                                            </div>
                                          ) : null}
                                          <button
                                            type="button"
                                            aria-label="remove"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removePreviewItem(img.id);
                                            }}
                                            className="absolute right-1 top-1 z-20 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#020616]/92 p-0 text-[8px] font-normal leading-none text-slate-300 shadow-sm transition-colors hover:text-[#FF2056]"
                                          >
                                            x
                                          </button>
                                          <div
                                            className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]"
                                            style={{ backgroundColor: img.previewBackground }}
                                          >
                                            {img.preview ? (
                                              <div className="absolute" style={{ inset: `${ARTWORK_SAFE_ZONE_PCT * 100}%` }}>
                                                <img src={img.preview} alt={img.final} className="h-full w-full object-contain" />
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-400">{sortedImages.length} image{sortedImages.length === 1 ? "" : "s"} loaded</span>
                                <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
                                  <span className="text-slate-500">{createThumbVisibleRangeLabel}</span>
                                  {createThumbTotalPages > 1 ? (
                                    <>
                                      <button
                                        type="button"
                                        aria-label="Previous image set"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-[#020616] text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                                        disabled={safeCreateThumbPage <= 0}
                                        onClick={() => setCreateThumbGridPage((current) => Math.max(0, current - 1))}
                                      >
                                        <ChevronIcon open={false} className="h-3.5 w-3.5 rotate-90" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Next image set"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-[#020616] text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                                        disabled={safeCreateThumbPage >= createThumbTotalPages - 1}
                                        onClick={() => setCreateThumbGridPage((current) => Math.min(createThumbTotalPages - 1, current + 1))}
                                      >
                                        <ChevronIcon open={false} className="h-3.5 w-3.5 -rotate-90" />
                                      </button>
                                    </>
                                  ) : null}
                                  {sortedImages.length > createThumbCompactVisibleCount ? (
                                    <button
                                      type="button"
                                      className="font-medium text-slate-400 transition hover:text-white"
                                      onClick={() => {
                                        setIsCreateThumbExpandedView((current) => !current);
                                        setCreateThumbGridPage(0);
                                      }}
                                    >
                                      {isCreateThumbExpandedView ? "Compact" : "View All"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {canShowDetailPanel ? (
                        <div className="flex min-w-0 flex-col space-y-3">
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleMetadataSection("title")}
                                  className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-5 tracking-tight text-slate-200"
                                  aria-expanded={metadataSectionState.title}
                                >
                                  <span className="inline-flex items-center text-sm font-semibold">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 text-white">AI Title</span>
                                  </span>
                                </button>
                                <BareChevronButton
                                  open={metadataSectionState.title}
                                  onClick={() => toggleMetadataSection("title")}
                                  label={metadataSectionState.title ? "Collapse Quantum AI Title" : "Expand Quantum AI Title"}
                                />
                              </div>
                              {metadataSectionState.title ? (
                                <div className="space-y-2">
                                  <div className="rounded-xl">
                                    {editingField === "title" ? (
                                      <div className="relative">
                                        <Input
                                          autoFocus
                                          value={editableTitleDraft}
                                          onChange={(e) => setEditableTitleDraft(e.target.value)}
                                          maxLength={LISTING_LIMITS.titleMax}
                                          onBlur={() => { void commitInlineEdit("title", editableTitleDraft); }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              e.currentTarget.blur();
                                            }
                                            if (e.key === "Escape") {
                                              e.preventDefault();
                                              setEditingField(null);
                                              setInlineSaveFeedback(null);
                                            }
                                          }}
                                          className="h-12 px-3 pr-20"
                                        />
                                        <div className="pointer-events-none absolute bottom-1.5 right-3 inline-flex items-center gap-2 text-[10px] font-medium text-slate-500">
                                          <span>{editableTitleDraft.trim().length}/{LISTING_LIMITS.titleMax}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => beginInlineEdit("title")}
                                        onKeyDown={(e) => {
                                          if (!canEditDetailTitle) return;
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            beginInlineEdit("title");
                                          }
                                        }}
                                        disabled={!canEditDetailTitle}
                                        className={`group relative flex min-h-[52px] w-full items-center rounded-xl border bg-[#020616] px-3 py-0 pr-24 text-left text-sm font-normal leading-5 text-white transition ${canEditDetailTitle ? "cursor-text border-slate-700 hover:border-slate-500 focus-visible:border-[#7F22FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30" : "cursor-default border-slate-700"}`}
                                      >
                                        {shouldAwaitQuantumTitle ? (
                                          <div className="flex w-full items-center justify-start gap-2 text-left text-sm font-medium text-slate-300">
                                            <QuantOrbLoader />
                                            <span>{QUANTUM_TITLE_AWAITING_TEXT}</span>
                                          </div>
                                        ) : (
                                          <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                            <span className="min-w-0 flex-1 truncate">
                                              {detailTitle || <span className="text-slate-400">Click to add a final title.</span>}
                                            </span>
                                            {canEditDetailTitle ? (
                                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                <PencilIcon className="h-3.5 w-3.5" />
                                                Edit
                                              </span>
                                            ) : null}
                                          </div>
                                        )}
                                        <div className="absolute bottom-1.5 right-3 inline-flex items-center gap-2 text-[10px] font-medium text-slate-500">
                                          <span>{(detailTitle || "").trim().length}/{LISTING_LIMITS.titleMax}</span>
                                          {canRerollSelectedImage ? (
                                            <button
                                              type="button"
                                              onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void rerollSelectedImageField("title");
                                              }}
                                              className="pointer-events-auto inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7F22FE]/25 text-slate-300 transition hover:border-[#7F22FE]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/35"
                                              aria-label="Re-roll title with Quantum AI"
                                              title="Re-Roll title"
                                            >
                                              <ReRollIcon className="h-3 w-3" />
                                            </button>
                                          ) : null}
                                        </div>
                                      </button>
                                    )}
                                  </div>
                                  {titleFeedback ? (
                                    <p className={`text-xs ${titleFeedback.tone === "error" ? "text-[#FF8AA5]" : titleFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-400"}`}>
                                      {titleFeedback.message}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleMetadataSection("description")}
                                  className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-5 tracking-tight text-slate-200"
                                  aria-expanded={metadataSectionState.description}
                                >
                                  <span className="inline-flex min-w-0 items-center text-sm font-semibold">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 truncate text-white">AI Description</span>
                                  </span>
                                </button>
                                <div className="flex shrink-0 items-center gap-2">
                                  {canRerollSelectedImage ? (
                                    <button
                                      type="button"
                                      onClick={() => { void rerollSelectedImageField("description"); }}
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#7F22FE]/25 text-slate-300 transition hover:border-[#7F22FE]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/35"
                                      aria-label="Re-roll description with Quantum AI"
                                      title="Re-Roll description"
                                    >
                                      <ReRollIcon className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                  <Button
                                    className="min-h-0 h-8 shrink-0 rounded-md px-3 py-1 text-sm font-medium tracking-tight !bg-[#7F22FE]/12 !text-[#F3E8FF] hover:!bg-[#7F22FE]/20 hover:!text-white"
                                    disabled={isCreateMode ? uploadDisabled : bulkEditPublishDisabled}
                                    onClick={() => {
                                      if (isCreateMode) {
                                        void runDraftBatch();
                                        return;
                                      }
                                      void runBulkEditPublishAction();
                                    }}
                                  >
                                    {descriptionActionLabel}
                                  </Button>
                                  <BareChevronButton
                                    open={metadataSectionState.description}
                                    onClick={() => toggleMetadataSection("description")}
                                    label={metadataSectionState.description ? "Collapse Quantum AI Description" : "Expand Quantum AI Description"}
                                  />
                                </div>
                              </div>
                              {metadataSectionState.description ? (
                                <div className="space-y-2">
                                  <div className="rounded-xl border border-slate-700 bg-[#020616] px-3 py-3 text-sm font-normal leading-6 text-white">
                                    <div className="flex min-h-full">
                                      {editingField === "description" ? (
                                        <div className="flex w-full flex-col gap-3">
                                          <div className="relative">
                                            <textarea
                                              autoFocus
                                              value={editableDescriptionDraft}
                                              onFocus={(e) => autosizeTextarea(e.currentTarget)}
                                              onChange={(e) => {
                                                setEditableDescriptionDraft(e.target.value);
                                                autosizeTextarea(e.currentTarget);
                                              }}
                                              maxLength={LISTING_LIMITS.descriptionMax}
                                              onBlur={() => { void commitInlineEdit("description", editableDescriptionDraft); }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                  e.preventDefault();
                                                  e.currentTarget.blur();
                                                }
                                                if (e.key === "Escape") {
                                                  e.preventDefault();
                                                  setEditingField(null);
                                                  setInlineSaveFeedback(null);
                                                }
                                              }}
                                              className="min-h-[132px] w-full resize-none overflow-hidden rounded-xl border border-slate-600 bg-[#020616] px-3 py-2 pb-8 text-left text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30"
                                            />
                                            <div className="pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-2 text-[10px] font-medium text-slate-500">
                                              <span>{editableDescriptionDraft.trim().length}/{LISTING_LIMITS.descriptionMax}</span>
                                            </div>
                                          </div>
                                          {detailTemplateSpecBlock ? (
                                            <>
                                              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                              <div className="max-h-[120px] w-full overflow-y-auto pr-2 whitespace-pre-wrap text-left text-sm leading-6 text-slate-300">
                                                {detailTemplateSpecBlock}
                                              </div>
                                            </>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div className="flex w-full flex-col gap-3">
                                          <button
                                            type="button"
                                            onClick={() => beginInlineEdit("description")}
                                            onKeyDown={(e) => {
                                              if (!canEditDetailDescription) return;
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                beginInlineEdit("description");
                                              }
                                            }}
                                            disabled={!canEditDetailDescription}
                                            className={`group relative flex min-h-[132px] w-full items-start rounded-xl border bg-[#020616] px-3 py-2 pb-8 text-left text-sm font-normal leading-6 text-white transition ${canEditDetailDescription ? "cursor-text border-slate-700 hover:border-slate-500 focus-visible:border-[#7F22FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30" : "cursor-default border-slate-700"}`}
                                          >
                                            {shouldAwaitQuantumDescription ? (
                                              <div className="flex w-full items-center justify-start gap-2 text-left text-sm font-medium text-slate-300">
                                                <QuantOrbLoader />
                                                <span>{QUANTUM_DESCRIPTION_AWAITING_TEXT}</span>
                                              </div>
                                            ) : (
                                              <div className="flex w-full min-w-0 items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1 whitespace-pre-wrap text-left">
                                                  {detailBuyerDescription || (
                                                    <span className="text-slate-400">Select or add artwork to generate image-based listing copy.</span>
                                                  )}
                                                </div>
                                                {canEditDetailDescription ? (
                                                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                    <PencilIcon className="h-3.5 w-3.5" />
                                                    Edit
                                                  </span>
                                                ) : null}
                                              </div>
                                            )}
                                            <div className="pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-2 text-[10px] font-medium text-slate-500">
                                              <span>{(detailBuyerDescription || "").trim().length}/{LISTING_LIMITS.descriptionMax}</span>
                                            </div>
                                          </button>
                                          {detailTemplateSpecBlock ? (
                                            <>
                                              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                              <div className="max-h-[120px] w-full overflow-y-auto pr-2 whitespace-pre-wrap text-left text-sm leading-6 text-slate-300">
                                                {detailTemplateSpecBlock}
                                              </div>
                                            </>
                                          ) : null}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {descriptionFeedback ? (
                                    <p className={`text-xs ${descriptionFeedback.tone === "error" ? "text-[#FF8AA5]" : descriptionFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-400"}`}>
                                      {descriptionFeedback.message}
                                    </p>
                                  ) : null}
                                  {aiAssistStatus && selectedImage ? (
                                    <p className={`text-xs ${canManualRescueSelectedImage ? "text-slate-400" : "text-slate-500"}`}>
                                      {aiAssistStatus}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="pt-0">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleMetadataSection("tags")}
                                  className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-5 tracking-tight text-slate-200"
                                  aria-expanded={metadataSectionState.tags}
                                >
                                  <span className="inline-flex items-center text-sm font-semibold">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 text-white">AI Tags</span>
                                  </span>
                                </button>
                                <BareChevronButton
                                  open={metadataSectionState.tags}
                                  onClick={() => toggleMetadataSection("tags")}
                                  label={metadataSectionState.tags ? "Collapse Quantum AI Tags" : "Expand Quantum AI Tags"}
                                />
                              </div>
                              {metadataSectionState.tags ? (
                                <div className="flex flex-wrap items-center justify-start gap-1.5">
                                  {isDetailTagsLoading ? (
                                    Array.from({ length: LISTING_LIMITS.tagCount }).map((_, index) => (
                                      <div
                                        key={`loading-tag-${index}`}
                                        className="flex min-h-[34px] items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#020616] px-2.5 py-1.5 text-center text-sm leading-5 text-slate-300"
                                      >
                                        <QuantOrbLoader />
                                      </div>
                                    ))
                                  ) : detailTags.length > 0 ? (
                                    detailTags.map((tag, index) => (
                                      <div
                                        key={`${selectedImage?.id || productId}-tag-${index}`}
                                        title={tag}
                                        className="flex min-h-[34px] items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#020616] px-2.5 py-1.5 text-center text-sm leading-5 text-white"
                                      >
                                        <span className="truncate">{tag}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex min-h-[34px] items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#020616] px-2.5 py-1.5 text-center text-sm leading-5 text-slate-400">
                                      Tags will appear after Quantum AI processing completes.
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        ) : null}
                    </div>
                    {runStatus ? <p className="mt-3 text-sm text-slate-300">{runStatus}</p> : null}
                    {batchResults.length > 0 ? (
                      <div className="mt-3 max-h-[14rem] overflow-auto rounded-xl border border-slate-800 bg-[#020616] p-3 text-sm">
                        <div className="space-y-1.5">
                          {batchResults.map((result) => (
                            <div key={`${result.fileName}-${result.title}`} className="rounded-lg border border-slate-800 p-2.5">
                              <div className="font-medium">{result.title}</div>
                              <div className="text-xs text-slate-400">{result.fileName}</div>
                              <div className="mt-1 text-sm">{result.message}</div>
                              {result.productId ? <div className="mt-1 text-xs text-slate-400">Product ID: {result.productId}</div> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    </div>
                </div>
              </div>
              </>
            ) : null}
          </Box>
        ) : null}
      </div>
      {thumbnailHoverPreview && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6">
              <div className="absolute inset-0 bg-transparent" />
              <div className="relative w-full max-w-[min(86vw,24rem)] overflow-hidden rounded-[28px] border border-white/10 bg-[#020616]/96 shadow-[0_28px_90px_-42px_rgba(0,0,0,0.92)] backdrop-blur-xl">
                <div className="absolute inset-0 opacity-90" style={{ backgroundColor: thumbnailHoverPreview.background || DISPLAY_NEUTRAL_BACKGROUND }} />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.22),transparent_55%),linear-gradient(180deg,rgba(2,6,22,0.08),rgba(2,6,22,0.8))]" />
                <div className="relative flex flex-col gap-4 p-4">
                  <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black/10">
                    {thumbnailHoverPreview.imageUrl ? (
                      <img
                        src={thumbnailHoverPreview.imageUrl}
                        alt={thumbnailHoverPreview.title}
                        className="h-auto max-h-[46vh] w-full object-contain"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(127,34,254,0.28),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,22,0.98))] text-xs text-slate-300">
                        Preview unavailable
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-white">
                      {thumbnailHoverPreview.title}
                    </p>
                    <p className="line-clamp-3 text-xs leading-5 text-slate-300">
                      {thumbnailHoverPreview.snippet}
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

