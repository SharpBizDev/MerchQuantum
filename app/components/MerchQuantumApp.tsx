'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PROVIDER_OPTIONS, type ProviderChoiceId } from "../../lib/providers/client-options";

const APP_TAGLINE = "Bulk product creation, simplified";
const ACTIVE_BATCH_FILES = 50;
const CONNECTED_TOTAL_BATCH_FILES = 50;
const FIXED_TAG_COUNT = 13;
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
};

type ApiShop = { id: number | string; title: string; sales_channel?: string };
type ApiProduct = {
  id: string;
  title: string;
  description?: string;
  shop_id?: number | string;
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

  return {
    canvasWidth,
    canvasHeight,
    visibleLeft,
    visibleTop,
    visibleWidth,
    visibleHeight,
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
      className={`h-11 w-full rounded-xl border border-slate-700 bg-[#020616] px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-500 ${className}`}
      {...props}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function Select({ className = "", children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={`h-11 w-full appearance-none rounded-xl border border-slate-700 bg-[#020616] px-3 pr-9 text-sm text-white outline-none transition focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-500 ${className}`}
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

function BrandMark() {
  return (
    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7F22FE] text-lg font-semibold text-white shadow-lg shadow-[#7F22FE]/30">
      MQ
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
  const templatePickerRef = useRef<HTMLDivElement | null>(null);
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
  const [search, setSearch] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [importedListingTitle, setImportedListingTitle] = useState("");
  const [importedListingDescription, setImportedListingDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [pendingTemplateSelectionIds, setPendingTemplateSelectionIds] = useState<string[]>([]);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
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
  const [attentionTarget, setAttentionTarget] = useState<"provider" | "token" | "import" | "shop" | "template" | null>(null);
  const [editingField, setEditingField] = useState<InlineEditableField>(null);
  const [editableTitleDraft, setEditableTitleDraft] = useState("");
  const [editableDescriptionDraft, setEditableDescriptionDraft] = useState("");
  const [inlineSaveFeedback, setInlineSaveFeedback] = useState<InlineSaveFeedback | null>(null);
  const [aiAssistStatus, setAiAssistStatus] = useState("");
  const [manualPrebufferOverride, setManualPrebufferOverride] = useState(false);

  const resolvedProviderId = provider === "spreadconnect" ? "spod" : provider;
  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || null;
  const isLiveProvider = selectedProvider?.isLive || false;
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
  const productSource = connected && isLiveProvider ? apiProducts : [];
  const templateKey = useMemo(() => `${template?.reference || "no-template"}::${templateDescription.trim()}`, [template?.reference, templateDescription]);
  const templateReadyForAi = !!template && !loadingTemplateDetails;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productSource.filter(
      (p) =>
        p.shopId === shopId &&
        (!q || p.title.toLowerCase().includes(q) || p.type.toLowerCase().includes(q))
    );
  }, [shopId, search, productSource]);
  const selectedTemplateProducts = useMemo(
    () => productSource.filter((product) => selectedImportIds.includes(product.id)),
    [productSource, selectedImportIds]
  );
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
  const isWorkspaceConfigured = connected && !!shopId && !!template;
  const canSubmitProviderConnection = Boolean(provider && isLiveProvider && token.trim() && !loadingApi && !connected);
  const uploadDisabled = !isWorkspaceConfigured || draftReadyCount === 0 || isRunningBatch || processingCount > 0;
  const canShowDetailWorkspace = isWorkspaceConfigured;
  const canShowDetailPanel = canShowDetailWorkspace || !!selectedImage;
  const selectedImageFieldStates = selectedImage?.aiFieldStates ?? createAiFieldStates("idle");
  const previewOverlayUsesLightText = shouldUseLightPreviewText(selectedImage?.previewBackground || DISPLAY_NEUTRAL_BACKGROUND);
  const previewOverlayTextClass = previewOverlayUsesLightText ? "text-white" : "text-slate-950";
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
    : !templateReadyForAi
      ? template?.nickname
      || selectedProduct?.title
      || "Loading selected product..."
      : importedListingTitle;
  const detailDescription = selectedImage
    ? selectedImageFieldStates.description === "ready"
      ? selectedImage.finalDescription
      : ""
    : (!templateReadyForAi
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
  const templatePickerLabel = selectedTemplateProducts.length === 0
    ? "Choose Product Template"
    : selectedTemplateProducts.length === 1
      ? selectedTemplateProducts[0]?.title || "Choose Product Template"
      : `${selectedTemplateProducts.length} Templates Selected`;
  const templatePickerModeLabel = selectedImportIds.length === 1
    ? "Creation Mode"
    : selectedImportIds.length >= 2
      ? "Bulk Edit Mode"
      : "";
  const pendingTemplateModeLabel = pendingTemplateSelectionIds.length === 1
    ? "1 selection routes to Creation Mode"
    : pendingTemplateSelectionIds.length >= 2
      ? `${pendingTemplateSelectionIds.length} selections route to Bulk Edit Mode`
      : "Select 1 template for Creation Mode or 2+ for Bulk Edit Mode.";
  const guidanceStep = !connected
    ? "connect"
    : !shopId
      ? "template"
      : !template && images.length === 0
        ? "template"
      : images.length === 0
        ? "import"
        : "settled";
  const processingBanner = processingCount > 0
    ? `Quantum AI is generating listing copy for ${processingCount} image${processingCount === 1 ? "" : "s"} in this batch.`
    : "";

  function getProviderRoute(path: "connect" | "disconnect" | "products" | "product" | "batch-create") {
    return `/api/providers/${path}`;
  }

  function triggerAttentionCue(target: "provider" | "token" | "import" | "shop" | "template") {
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
    if (!template) return "template" as const;
    if (includeImportStep && images.length === 0) return "import" as const;
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
    if (!isTemplatePickerOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!templatePickerRef.current?.contains(event.target as Node)) {
        void commitTemplateSelections(pendingTemplateSelectionIds);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTemplatePicker();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTemplatePickerOpen, pendingTemplateSelectionIds, selectedImportIds]);

  useEffect(() => {
    if (!shopId) {
      setApiProducts([]);
      setProductId("");
      setTemplate(null);
      setTemplateDescription("");
      setImportedListingTitle("");
      setImportedListingDescription("");
      setSelectedImportIds([]);
      setPendingTemplateSelectionIds([]);
      setIsTemplatePickerOpen(false);
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

  function clearPreviewWorkspace() {
    setImages([]);
    setCompletedImportedImages([]);
    setQueuedImages([]);
    setSelectedId("");
    setMessage("");
    setBatchResults([]);
    setRunStatus("");
    setImportStatus("");
    setAiAssistStatus("");
    setManualPrebufferOverride(false);
  }

  function openArtworkPicker() {
    if (!connected || !isWorkspaceConfigured) {
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
    const currentTotal = images.length + queuedImages.length;
    const room = Math.max(0, totalBatchLimit - currentTotal);
    const accepted = imageFiles.slice(0, room);
    const ignoredByLimit = Math.max(0, imageFiles.length - accepted.length);

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
      setShopId("");
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

  function togglePendingTemplateSelection(sourceId: string) {
    setPendingTemplateSelectionIds((current) => (
      current.includes(sourceId)
        ? current.filter((entry) => entry !== sourceId)
        : normalizeSelectionIds([...current, sourceId])
    ));
  }

  function openTemplatePicker() {
    if (!shopId) {
      triggerAttentionCue("shop");
      return;
    }

    setPendingTemplateSelectionIds(selectedImportIds);
    setIsTemplatePickerOpen(true);
    setImportStatus("");

    if (!loadingProducts && apiProducts.length === 0) {
      void loadProductsForShop(shopId);
    }
  }

  async function commitTemplateSelections(sourceIds: string[]) {
    const nextSelections = normalizeSelectionIds(sourceIds);
    const selectionChanged = !selectionsMatch(nextSelections, selectedImportIds);

    setSelectedImportIds(nextSelections);
    setPendingTemplateSelectionIds(nextSelections);
    setIsTemplatePickerOpen(false);
    setEditingField(null);
    setInlineSaveFeedback(null);

    if (!selectionChanged) {
      if (nextSelections.length >= 2) {
        setImportStatus(`Bulk Edit Mode is staged for ${nextSelections.length} listing${nextSelections.length === 1 ? "" : "s"}.`);
      } else {
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

    if (nextSelections.length === 1) {
      setImportStatus("");
      setProductId(nextSelections[0]);
      return;
    }

    setImportStatus(`Loading ${nextSelections.length} provider listing${nextSelections.length === 1 ? "" : "s"} for SEO tuning...`);
    await importSelectedListings(nextSelections, { replaceExisting: true });
  }

  function cancelTemplatePicker() {
    setPendingTemplateSelectionIds(selectedImportIds);
    setIsTemplatePickerOpen(false);
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

  async function syncApprovedImportedListings() {
    if (!resolvedProviderId || !shopId || approvedImportedItems.length === 0) {
      return;
    }

    if (!supportsImportedListingSync) {
      setImportStatus(`${selectedProvider?.label || "This provider"} metadata sync is not available in this pass yet.`);
      return;
    }

    setIsSyncingImportedListings(true);
    setImportStatus(`Syncing ${approvedImportedItems.length} approved listing${approvedImportedItems.length === 1 ? "" : "s"} back to ${selectedProvider?.label || "the provider"}...`);

    let syncedCount = 0;
    let failedCount = 0;

    for (const item of approvedImportedItems) {
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

    setImportStatus(
      failedCount > 0
        ? `Synced ${syncedCount} approved listing${syncedCount === 1 ? "" : "s"} and flagged ${failedCount} for manual review.`
        : `Synced ${syncedCount} approved listing${syncedCount === 1 ? "" : "s"} back to ${selectedProvider?.label || "the provider"}.`
    );
    setIsSyncingImportedListings(false);
  }

  async function publishApprovedImportedListings() {
    if (!resolvedProviderId || !shopId || syncedApprovedImportedItems.length === 0) {
      setImportStatus("Sync approved listings before sending them to the provider publish step.");
      return;
    }

    if (!supportsImportedPublish) {
      setImportStatus(`${selectedProvider?.label || "This provider"} direct publishing is not available in this pass yet.`);
      return;
    }

    setIsPublishingImportedListings(true);
    setImportStatus(`Publishing ${syncedApprovedImportedItems.length} synced approved listing${syncedApprovedImportedItems.length === 1 ? "" : "s"}...`);

    try {
      const response = await fetchWithTimeout(
        "/api/providers/publish-listings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: resolvedProviderId,
            shopId,
            items: syncedApprovedImportedItems.map((item) => ({
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
          if (!img.providerProductId || !syncedApprovedImportedItems.some((item) => item.providerProductId === img.providerProductId)) {
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

  return (
    <div className="min-h-screen bg-[#000000] px-6 pb-6 pt-3 text-white transition-colors md:px-8 md:pb-8 md:pt-4">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="text-[#7F22FE]">Merch</span>
              <span className="text-white">Quantum</span>
            </h1>
            <p className="mt-1 text-sm text-slate-300">{APP_TAGLINE}</p>
          </div>
        </div>

        <Box
          className={`relative overflow-hidden border-slate-800 bg-[#0b0f19] text-white shadow-[0_28px_80px_-40px_rgba(2,6,22,0.95)] ${guidanceStep === "connect" ? "ring-1 ring-[#7F22FE]/45 shadow-[0_28px_90px_-40px_rgba(127,34,254,0.45)]" : connected ? "ring-1 ring-[#00BC7D]/35 shadow-[0_28px_90px_-40px_rgba(0,188,125,0.32)]" : ""}`}
          headerClassName="mb-4"
          title={
            <div className="flex items-end justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
                <span className="font-semibold text-[#7F22FE]">Quantum</span>
                <span className="ml-1 font-semibold text-white">AI</span>
                <span className={`ml-1 font-semibold ${connected ? `text-[#00BC7D] ${pulseConnected ? "animate-pulse" : ""}` : "text-white"}`}>
                  {connected ? "Connection" : "Connect"}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-200">
                Auto Listings
              </span>
            </div>
          }
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" />
          <div className={`pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full blur-3xl transition-all duration-700 ${connected ? "bg-[#00BC7D]/12" : "bg-[#7F22FE]/12"} ${guidanceStep === "connect" ? "animate-pulse" : ""}`} />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
          <div
            className={`pointer-events-none absolute inset-x-5 bottom-0 h-px transition-all duration-700 ${connected ? "bg-gradient-to-r from-transparent via-[#00BC7D]/90 to-transparent" : "bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent"} ${pulseConnected || guidanceStep === "connect" ? "scale-x-100 opacity-100" : "scale-x-75 opacity-60"}`}
          />
          <div className="flex w-full flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-center">
              <div className={`${attentionTarget === "provider" ? "rounded-2xl ring-1 ring-[#7F22FE]/35" : ""}`}>
                <Select
                  value={provider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as ProviderChoiceId | "";
                    setProvider(nextProvider);
                    setToken("");
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
                onMouseEnter={nudgeProviderSelectionFromTokenArea}
                onFocusCapture={nudgeProviderSelectionFromTokenArea}
                onPointerDownCapture={nudgeProviderSelectionFromTokenArea}
                className={`${attentionTarget === "token" ? "rounded-2xl ring-1 ring-[#7F22FE]/35" : ""}`}
              >
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <Input
                    type={connected ? "text" : "password"}
                    value={connected ? maskToken(token) : token}
                    disabled={!provider}
                    readOnly={connected}
                    placeholder="API unlocks shops"
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmitProviderConnectionWithToken(e.currentTarget.value)) {
                        e.preventDefault();
                        void connectProvider(e.currentTarget.value);
                      }
                    }}
                    className="min-w-0 flex-1 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => { void connectProvider(); }}
                    disabled={!canSubmitProviderConnection}
                    className={`min-h-[44px] shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${connected ? "bg-[#00BC7D] text-white disabled:cursor-default" : "bg-[#7F22FE] text-white hover:bg-[#6d1ee0] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"}`}
                  >
                    {loadingApi ? "Connecting..." : connected ? "Connected" : "Connect"}
                  </button>
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => { void disconnectProvider(); }}
                      className="min-h-[44px] shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-white"
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-center">
              <div className={attentionTarget === "shop" ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}>
                <Select
                  value={shopId}
                  className={shopId ? "text-[13px] font-normal text-white" : "font-medium text-slate-400"}
                  disabled={!availableShops.length}
                  onChange={(e) => {
                    const nextShopId = e.target.value;
                    setShopId(nextShopId);
                    setApiProducts([]);
                    setSearch("");
                    setProductId("");
                    setTemplate(null);
                    setTemplateDescription("");
                    setImportedListingTitle("");
                    setImportedListingDescription("");
                    setSelectedImportIds([]);
                    setPendingTemplateSelectionIds([]);
                    setIsTemplatePickerOpen(false);
                    clearPreviewWorkspace();
                    setEditingField(null);
                    setInlineSaveFeedback(null);
                  }}
                >
                  <option value="">
                    {loadingApi
                      ? "Loading shops..."
                      : !connected
                        ? "Locked until connection"
                        : connected && isLiveProvider && availableShops.length === 0
                          ? "No shops returned"
                          : "Select Shop"}
                  </option>
                  {availableShops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.title}
                    </option>
                  ))}
                </Select>
              </div>

              <div
                ref={templatePickerRef}
                className={`relative ${attentionTarget === "template" ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isTemplatePickerOpen) {
                      void commitTemplateSelections(pendingTemplateSelectionIds);
                      return;
                    }
                    openTemplatePicker();
                  }}
                  className="flex h-11 w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-slate-700 bg-[#020616] px-3 text-left text-sm text-white transition hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <span className={`min-w-0 flex-1 truncate ${selectedImportIds.length === 0 ? "font-medium text-slate-400" : "font-normal text-white"}`}>
                      {loadingProducts && isTemplatePickerOpen && productSource.length === 0 ? "Loading products..." : templatePickerLabel}
                    </span>
                    {templatePickerModeLabel ? (
                      <span className="flex-shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-200">
                        {templatePickerModeLabel}
                      </span>
                    ) : null}
                  </div>
                  <svg
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isTemplatePickerOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {isTemplatePickerOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-30 rounded-2xl border border-slate-800 bg-[#020616] p-3 shadow-[0_28px_80px_-40px_rgba(2,6,22,0.95)]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {pendingTemplateModeLabel}
                      </p>
                      {loadingProducts ? <QuantOrbLoader /> : null}
                    </div>
                    <div className="mt-2">
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search My Products"
                        autoFocus
                      />
                    </div>
                    <div className="mt-3 max-h-[18rem] overflow-auto pr-1">
                      {visibleProducts.length > 0 ? (
                        <div className="grid gap-2">
                          {visibleProducts.map((product) => {
                            const alreadyImported = importedProductIds.has(product.id);
                            const isPendingSelection = pendingTemplateSelectionIds.includes(product.id);
                            const isCreationSelection =
                              pendingTemplateSelectionIds.length === 1 && pendingTemplateSelectionIds[0] === product.id;

                            return (
                              <label
                                key={`template-${product.id}`}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 transition ${
                                  isPendingSelection
                                    ? "border-[#7F22FE]/70 bg-[#7F22FE]/10"
                                    : alreadyImported
                                      ? "border-[#00BC7D]/45 bg-[#00BC7D]/[0.04]"
                                      : "border-slate-800 bg-[#010512] hover:border-slate-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isPendingSelection}
                                  onChange={() => togglePendingTemplateSelection(product.id)}
                                  className="mt-1 h-4 w-4 rounded border-slate-600 bg-[#020616] text-[#7F22FE] focus:ring-[#7F22FE]/40"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-medium text-white">{product.title}</span>
                                    {alreadyImported && !isPendingSelection ? (
                                      <span className="rounded-full border border-[#00BC7D]/40 bg-[#00BC7D]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#7EF0C7]">
                                        Loaded
                                      </span>
                                    ) : null}
                                    {isCreationSelection ? (
                                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-200">
                                        Creation
                                      </span>
                                    ) : isPendingSelection ? (
                                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-200">
                                        Bulk Edit
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    {product.description?.trim()
                                      ? clampDescriptionForListing(
                                        extractBuyerFacingDescriptionFromListing(
                                          product.description,
                                          sanitizeTemplateDescriptionForPrebuffer(product.description, product.title)
                                        )
                                      ).slice(0, 160) || product.type
                                      : product.type}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800 bg-[#010512] px-3 py-4 text-sm text-slate-400">
                          {loadingProducts
                            ? "Loading provider listings..."
                            : search.trim()
                              ? "No products matched this search."
                              : "Open this picker to deliberately load product templates from the selected shop."}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {apiStatus ? <p className="mt-3 text-sm text-[#FE9A00]">{apiStatus}</p> : null}
        </Box>

        {connected && ((shopId && canShowDetailPanel) || importStatus || processingBanner || runStatus || batchResults.length > 0) ? (
          <Box className="border-slate-800 bg-[#020616] shadow-[0_24px_70px_-38px_rgba(2,6,22,0.95)]">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
              className="hidden"
              onChange={(e) => {
                if (connected && isWorkspaceConfigured) {
                  void addFiles(e.target.files);
                } else {
                  nudgeWorkflow(true);
                }
                e.currentTarget.value = "";
              }}
            />

            {importStatus ? (
              <p className="mt-3 text-sm text-slate-300">{importStatus}</p>
            ) : processingBanner ? (
              <p className="mt-3 text-sm text-slate-300">{processingBanner}</p>
            ) : null}

            {shopId && canShowDetailPanel ? (
              <>
                <div className="mt-3">
                  <div className="space-y-3" onPointerDownCapture={() => nudgeWorkflow(true)}>
                      <div className="grid items-stretch gap-3 lg:grid-cols-[296px_minmax(0,1fr)]">
                        <div className="flex h-full flex-col gap-3">
                          <div
                            className="space-y-1.5 cursor-pointer"
                            onClick={openArtworkPicker}
                          >
                            <div className="flex min-h-[20px] items-center justify-between gap-3 text-sm font-medium leading-5 tracking-tight text-slate-200">
                              <span>Upload Artwork</span>
                              <span className="text-[11px] font-normal tracking-normal text-slate-500">
                                Drop or click • Max {CONNECTED_TOTAL_BATCH_FILES} items
                              </span>
                            </div>
                            <div
                              className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#020616] lg:h-[19rem]"
                              onDragOver={(e) => {
                                e.preventDefault();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!connected || !isWorkspaceConfigured) {
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
                                  <img src={selectedImage.preview} alt={selectedImage.final} className="h-full w-full object-contain" />
                                </div>
                              ) : (
                                <div className="flex h-full w-full p-4">
                                  <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#020616]/92 px-6 text-center transition-colors hover:bg-[#0b1024]">
                                    <span className="text-sm font-medium text-white">Drag images here</span>
                                    <span className="mt-1 text-xs text-slate-400">or click Add Images</span>
                                  </div>
                                </div>
                              )}

                              <div
                                className="absolute bottom-3 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] -translate-x-1/2 px-3 py-2"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <div className={`flex min-w-0 flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 overflow-hidden px-0.5 pb-1.5 pt-0.5 text-[11px] font-medium sm:text-xs ${previewOverlayTextClass}`}>
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
                                  <span
                                    role="button"
                                    tabIndex={hasAnyLoadedImages ? 0 : -1}
                                    onClick={() => {
                                      if (!hasAnyLoadedImages) return;
                                      clearPreviewWorkspace();
                                    }}
                                    onKeyDown={(e) => {
                                      if (!hasAnyLoadedImages) return;
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        clearPreviewWorkspace();
                                      }
                                    }}
                                    className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium leading-none sm:text-xs ${previewOverlayTextClass} ${hasAnyLoadedImages ? "cursor-pointer opacity-100 hover:opacity-90 focus:opacity-90 active:opacity-90" : "cursor-default opacity-100"}`}
                                  >
                                    Clear
                                  </span>
                                </div>
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-slate-800">
                                  <div
                                    className={`h-full transition-all duration-500 ${processingCount > 0 ? "bg-[#7F22FE]" : "bg-[#00A6F4]"}`}
                                    style={{ width: `${generationProgressPct}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button
                            className="w-full !bg-[#7F22FE] !text-white hover:!bg-[#6d1ee0]"
                            disabled={uploadDisabled}
                            onClick={() => { void runDraftBatch(); }}
                          >
                            {isRunningBatch ? "Uploading Draft Products..." : "Upload Draft Products"}
                          </Button>
                          {sortedImages.length > 0 ? (
                            <div className="overflow-x-auto pb-1 [scrollbar-color:rgba(127,34,254,0.45)_transparent] [scrollbar-width:thin]">
                              <div className="flex min-w-max gap-2 pr-1">
                                {sortedImages.map((img, index) => {
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
                                  const previewAlignRight = index >= sortedImages.length - 2;
                                  const statusIndicator = resolvedStatus === "ready"
                                    ? { tone: "ready" as const, direction: "up" as const }
                                    : resolvedStatus === "error"
                                      ? { tone: "error" as const, direction: "down" as const }
                                      : null;

                                  return (
                                    <div
                                      key={img.id}
                                      onClick={() => setSelectedId(img.id)}
                                      className={`w-[88px] shrink-0 rounded-lg transition-all duration-500 ${isProcessing ? "shadow-[0_12px_32px_-24px_rgba(124,58,237,0.45)]" : isSelected ? "shadow-[0_10px_24px_-20px_rgba(124,58,237,0.45)]" : ""}`}
                                    >
                                      <div className="relative">
                                        {isProcessing ? <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
                                        <div className={`group relative flex aspect-square w-full items-center justify-center overflow-visible rounded-lg border bg-[#020616] transition-all duration-500 ${previewFrameTone}`}>
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
                                            {img.preview ? <img src={img.preview} alt={img.final} className="h-full w-full object-contain" /> : null}
                                          </div>
                                          {img.preview ? (
                                            <div className={`pointer-events-none absolute z-30 hidden w-40 rounded-2xl border border-slate-800 bg-[#020616] p-3 shadow-xl group-hover:block top-full mt-2 ${previewAlignRight ? "right-0" : "left-0"}`}>
                                              <img src={img.preview} alt={img.final} className="max-h-48 w-full object-contain" />
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          {(supportsImportedListingSync && approvedImportedItems.length > 0) || (supportsImportedPublish && syncedApprovedImportedItems.length > 0) ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                tone="ghost"
                                disabled={!supportsImportedListingSync || approvedImportedItems.length === 0 || isSyncingImportedListings}
                                onClick={() => { void syncApprovedImportedListings(); }}
                              >
                                {isSyncingImportedListings ? "Syncing..." : "Sync Approved SEO"}
                              </Button>
                              <Button
                                tone="ghost"
                                disabled={!supportsImportedPublish || syncedApprovedImportedItems.length === 0 || isPublishingImportedListings}
                                onClick={() => { void publishApprovedImportedListings(); }}
                              >
                                {isPublishingImportedListings ? "Publishing..." : "Publish Approved"}
                              </Button>
                            </div>
                          ) : null}
                          {runStatus ? <p className="text-sm text-slate-300">{runStatus}</p> : null}
                          {batchResults.length > 0 ? (
                            <div className="max-h-[14rem] overflow-auto rounded-xl border border-slate-800 bg-[#020616] p-3 text-sm">
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

                        <div className="flex h-full flex-col space-y-3">
                          <Field
                            label={(
                              <div className="flex min-w-0 items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span>Final Title</span>
                                  {(canEditDetailTitle || canRerollSelectedImage) ? (
                                    <span className="truncate text-[11px] font-normal tracking-normal text-slate-500">
                                      Click to edit • Press Enter to save • Re-roll for AI assist
                                    </span>
                                  ) : null}
                                </div>
                                {canRerollSelectedImage ? (
                                  <button
                                    type="button"
                                    onClick={() => { void rerollSelectedImageField("title"); }}
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#7F22FE]/25 text-slate-300 transition hover:border-[#7F22FE]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/35"
                                    aria-label="Re-roll title with Quantum AI"
                                    title="Re-Roll title"
                                  >
                                    <ReRollIcon className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            )}
                          >
                            <div className="space-y-2">
                              <div className="rounded-xl">
                                {editingField === "title" ? (
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
                                    className="px-3"
                                  />
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
                                    className={`group flex min-h-[44px] w-full items-center rounded-xl border bg-[#020616] px-3 py-0 text-left text-sm font-normal leading-5 text-white transition ${canEditDetailTitle ? "cursor-text border-slate-700 hover:border-slate-500 focus-visible:border-[#7F22FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30" : "cursor-default border-slate-700"}`}
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
                                  </button>
                                )}
                              </div>
                              {titleFeedback ? (
                                <p className={`text-xs ${titleFeedback.tone === "error" ? "text-[#FF8AA5]" : titleFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-400"}`}>
                                  {titleFeedback.message}
                                </p>
                              ) : canEditDetailTitle || canRerollSelectedImage ? (
                                <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
                                  <p>{(editingField === "title" ? editableTitleDraft : detailTitle || "").trim().length}/{LISTING_LIMITS.titleMax}</p>
                                </div>
                              ) : null}
                            </div>
                          </Field>

                          <Field
                            label={(
                              <div className="flex min-w-0 items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span>Final Description</span>
                                  {(canEditDetailDescription || canRerollSelectedImage) ? (
                                    <span className="truncate text-[11px] font-normal tracking-normal text-slate-500">
                                      Click to edit • Press Enter to save • Re-roll for AI assist
                                    </span>
                                  ) : null}
                                </div>
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
                              </div>
                            )}
                          >
                            <div className="space-y-2">
                              <div className="rounded-xl border border-slate-700 bg-[#020616] px-3 py-3 text-sm font-normal leading-6 text-white">
                                <div className="flex min-h-full">
                                  {editingField === "description" ? (
                                    <div className="flex w-full flex-col gap-3">
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
                                        className="min-h-[112px] w-full resize-none overflow-hidden rounded-xl border border-slate-600 bg-[#020616] px-3 py-2 text-left text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30"
                                      />
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
                                        className={`group flex min-h-[112px] w-full items-start rounded-xl border bg-[#020616] px-3 py-2 text-left text-sm font-normal leading-6 text-white transition ${canEditDetailDescription ? "cursor-text border-slate-700 hover:border-slate-500 focus-visible:border-[#7F22FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30" : "cursor-default border-slate-700"}`}
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
                                                <span className="text-slate-400">Click to add buyer-facing description copy.</span>
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
                              ) : canEditDetailDescription || canRerollSelectedImage ? (
                                <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
                                  <p>{(editingField === "description" ? editableDescriptionDraft : detailBuyerDescription || "").trim().length}/{LISTING_LIMITS.descriptionMax}</p>
                                </div>
                              ) : null}
                              {aiAssistStatus && selectedImage ? (
                                <p className={`text-xs ${canManualRescueSelectedImage ? "text-slate-400" : "text-slate-500"}`}>
                                  {aiAssistStatus}
                                </p>
                              ) : null}
                            </div>
                          </Field>
                        </div>
                      </div>
                      <div className="pt-0.5">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <div className="flex min-h-[34px] items-center justify-center rounded-xl border border-slate-800 bg-[#020616] px-2.5 py-1.5 text-center text-sm">
                            <span className="font-semibold text-[#7F22FE]">Quantum</span>
                            <span className="ml-1 font-semibold text-white">AI</span>
                            <span className="ml-1 font-semibold text-[#00BC7D]">Tags</span>
                          </div>
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
                      </div>
                    </div>
                </div>
              </>
            ) : null}
          </Box>
        ) : null}
      </div>
    </div>
  );
}
