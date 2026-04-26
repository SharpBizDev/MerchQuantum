'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDER_OPTIONS, type ProviderChoiceId } from "../../lib/providers/client-options";
import { getUserFacingErrorMessage, logErrorToConsole, type UserFacingErrorKind } from "../../lib/user-facing-errors";
import {
  QuantumRouteError,
  createQuantumRouteTelemetry,
  requestAiListing,
  useQuantumRouteTelemetry,
} from "../../lib/client/quantum-routes";

const BOOT_TAGLINE = "EFFORTLESS PRODUCT CREATION.";
const ACTIVE_BATCH_FILES = 50;
const CONNECTED_TOTAL_BATCH_FILES = 50;
const FIXED_TAG_COUNT = 13;
const BRAND_WORDMARK_TEXT_CLASSES = "text-[3.5rem] sm:text-[4rem]";
const BRAND_TAGLINE_TEXT_CLASSES = "text-xs";
const DETAIL_DATA_TEXT_CLASSES = "font-sans text-sm font-normal leading-6 text-white";
const WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY = "mq-workspace-selection-condensed";
export const QUANTUM_TITLE_AWAITING_TEXT = "Awaiting Quantum AI title...";
export const QUANTUM_DESCRIPTION_AWAITING_TEXT = "Awaiting Quantum AI description...";

function getStoredWorkspaceSelectionCondensed() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY) !== "0";
}

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

type WorkspaceMode = "" | "create" | "edit";
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

type ProductGridProps = {
  heading: React.ReactNode;
  items: Product[];
  selectedIds: string[];
  activeId?: string;
  importedProductIds: Set<string>;
  highlighted?: boolean;
  collapsed?: boolean;
  rangeLabel: string;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  headerAccessory?: React.ReactNode;
  onToggleCollapsed?: () => void;
  onSelectAll?: () => void;
  selectAllLabel?: string;
  footerLabel?: React.ReactNode;
  onItemActivate: (
    product: Product,
    index: number,
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>
  ) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  footerActions?: React.ReactNode;
};

type SmartThumbnailProps = {
  src?: string | null;
  alt: string;
  className?: string;
  safeZoneClassName?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  children?: React.ReactNode;
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
const AI_TITLE_MAX_CHARS = LISTING_LIMITS.titleMax;
const AI_LEAD_MAX_CHARS = 380;
const IMPORT_QUEUE_LIMIT = 50;
const DISPLAY_PREVIEW_SAMPLE_DIMENSION = 256;
const DISPLAY_ALPHA_THRESHOLD = 12;
const DISPLAY_TRANSPARENCY_RATIO_THRESHOLD = 0.04;
const DISPLAY_DARK_BACKGROUND = "#000000";
const DISPLAY_LIGHT_BACKGROUND = "#FFFFFF";
const ARTWORK_SAFE_ZONE_PCT = 0.08;
const PROVIDER_TOKEN_STORAGE_PREFIX = "merchQuantumApiKey";
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

function choosePreviewBackground(averageBrightness: number | null) {
  if (averageBrightness === null) return DISPLAY_DARK_BACKGROUND;
  return averageBrightness > 128 ? DISPLAY_DARK_BACKGROUND : DISPLAY_LIGHT_BACKGROUND;
}

function ensureContrastPreviewBackground(background: string | null | undefined) {
  return background === DISPLAY_LIGHT_BACKGROUND ? DISPLAY_LIGHT_BACKGROUND : DISPLAY_DARK_BACKGROUND;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function buildSmartThumbnailSource(src: string | null | undefined) {
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

function getProviderTokenStorageKey(providerId: string | null | undefined) {
  if (!providerId) return null;
  return `${PROVIDER_TOKEN_STORAGE_PREFIX}:${providerId}`;
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
    const red = imageData[index];
    const green = imageData[index + 1];
    const blue = imageData[index + 2];
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    visiblePixelCount += 1;
    weightedBrightness += brightness * alpha;
    totalAlpha += alpha;
  }
  const transparencyRatio = transparentPixelCount / Math.max(totalPixels, 1);
  if (visiblePixelCount === 0) {
    return {
      averageBrightness: null,
      transparencyRatio,
    };
  }
  return {
    averageBrightness: totalAlpha > 0 ? weightedBrightness / totalAlpha : null,
    transparencyRatio,
  };
}

function choosePreviewBackgroundFromImageElement(img: HTMLImageElement) {
  try {
    const analysis = measureVisiblePixelBrightness(img);
    if (!analysis) return DISPLAY_DARK_BACKGROUND;
    if (analysis.transparencyRatio >= DISPLAY_TRANSPARENCY_RATIO_THRESHOLD) {
      return DISPLAY_DARK_BACKGROUND;
    }
    return choosePreviewBackground(analysis.averageBrightness);
  } catch {
    return DISPLAY_DARK_BACKGROUND;
  }
}

async function resolvePreviewSurfaceBackground(src: string) {
  try {
    const img = await loadImageElement(src);
    return choosePreviewBackgroundFromImageElement(img);
  } catch {
    return DISPLAY_DARK_BACKGROUND;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/<\/?(?:p|br|div|li|ul|ol|section|article|h[1-6])[^>]*>/gi, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized.startsWith("#x")) {
        const code = Number.parseInt(normalized.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (normalized.startsWith("#")) {
        const code = Number.parseInt(normalized.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return HTML_ENTITY_MAP[normalized] || match;
    });
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStorageKey(providerId: string | null | undefined) {
  if (!providerId) return null;
  return `merchQuantum:token:${providerId}`;
}

function getStoredProviderToken(providerId: string | null | undefined) {
  if (typeof window === "undefined") return "";
  const key = getStorageKey(providerId);
  if (!key) return "";
  return window.localStorage.getItem(key) || "";
}

function storeProviderToken(providerId: string | null | undefined, token: string) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(providerId);
  if (!key) return;
  if (token.trim()) {
    window.localStorage.setItem(key, token.trim());
  } else {
    window.localStorage.removeItem(key);
  }
}

function getPlacementGuide(product: ApiProduct | null | undefined) {
  const blueprintId = Number(product?.blueprint_id || 0);
  if (blueprintId > 0) {
    if ([6, 12, 49, 71, 145, 273].includes(blueprintId)) {
      return { position: "front", width: 3153, height: 3995, source: "fallback" as const };
    }
    if ([443, 515, 851].includes(blueprintId)) {
      return { position: "front", width: 2400, height: 3000, source: "fallback" as const };
    }
  }
  return DEFAULT_PLACEMENT_GUIDE;
}

function normalizeImportedArtwork(record: ImportedListingRecord | null | undefined): ImportedArtwork | null {
  if (!record?.artwork?.url) return null;
  const artwork = record.artwork;
  return {
    assetId: artwork.assetId,
    fileName: artwork.fileName,
    url: artwork.url,
    previewUrl: artwork.previewUrl || artwork.url,
    contentType: artwork.contentType,
    width: artwork.width,
    height: artwork.height,
  };
}

function normalizeTag(tag: string) {
  return tag.replace(/\s+/g, " ").trim();
}

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function inferProductFamily(text: string, fallback: ProductFamily = "product") {
  const normalized = text.toLowerCase();
  for (const rule of FAMILY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.family;
    }
  }
  return fallback;
}

function parseSterileTemplateDescription(description: string | null | undefined) {
  const clean = stripHtml(String(description || ""));
  if (!clean) return { buyerCopy: "", templateSpecBlock: "" };
  const lines = clean
    .split(/(?<=\.)\s+|\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { buyerCopy: "", templateSpecBlock: "" };

  let splitIndex = lines.findIndex((line) => TEMPLATE_SPEC_SECTION_HEADERS.has(line));
  if (splitIndex === -1) {
    splitIndex = lines.findIndex((line, index) => index > 0 && TEMPLATE_SPEC_SIGNAL.test(line) && !TEMPLATE_THEME_FLUFF_SIGNAL.test(line));
  }
  if (splitIndex === -1) {
    return { buyerCopy: clean, templateSpecBlock: "" };
  }

  const buyerCopy = lines.slice(0, splitIndex).join("\n\n").trim();
  const templateSpecBlock = lines.slice(splitIndex).join("\n").trim();
  return { buyerCopy, templateSpecBlock };
}

function collectTitleKeywords(title: string) {
  return title
    .split(/[^A-Za-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token.toLowerCase()));
}

function buildFallbackTags(title: string) {
  const keywords = collectTitleKeywords(title);
  const words = keywords.slice(0, FIXED_TAG_COUNT);
  while (words.length < FIXED_TAG_COUNT) {
    words.push(`Tag ${words.length + 1}`);
  }
  return words;
}

function clampTagList(tags: string[]) {
  const normalized = dedupeTags(tags).slice(0, FIXED_TAG_COUNT);
  if (normalized.length >= FIXED_TAG_COUNT) return normalized;
  const fallback = buildFallbackTags(normalized.join(" "));
  for (const tag of fallback) {
    if (normalized.length >= FIXED_TAG_COUNT) break;
    if (!normalized.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
      normalized.push(tag);
    }
  }
  return normalized.slice(0, FIXED_TAG_COUNT);
}

function normalizeLeadParagraphs(leads: string[]) {
  return leads
    .map((lead) => trimToSentence(lead, AI_LEAD_MAX_CHARS))
    .filter(Boolean)
    .slice(0, 2);
}

function buildListingDescription(draft: AiListingDraft, templateDescription: string) {
  const leadParagraphs = normalizeLeadParagraphs(draft.leadParagraphs);
  const leadText = leadParagraphs.join("\n\n").trim();
  const { templateSpecBlock } = parseSterileTemplateDescription(templateDescription);
  return [leadText, templateSpecBlock].filter(Boolean).join("\n\n").trim();
}

function buildListingTitle(draft: AiListingDraft, fallback: string) {
  return safeTitle(draft.title, fallback);
}

function buildListingTags(draft: AiListingDraft, fallbackTitle: string) {
  return clampTagList(draft.reasonFlags.length > 0 ? draft.reasonFlags : buildFallbackTags(fallbackTitle));
}

function createAiFieldStates(status: AiFieldStatus = "idle"): AiFieldStates {
  return {
    title: status,
    description: status,
    tags: status,
  };
}

function formatApiError(kind: UserFacingErrorKind, error: unknown, context: string) {
  logErrorToConsole(context, error);
  return getUserFacingErrorMessage(kind);
}

function createEmptyImage(file: File): Img {
  const cleaned = cleanTitle(file.name);
  return {
    id: makeId(),
    name: file.name,
    file,
    preview: URL.createObjectURL(file),
    cleaned,
    final: cleaned,
    finalDescription: "",
    tags: [],
    status: "pending",
    statusReason: "Quantum AI is preparing listing copy.",
    aiFieldStates: createAiFieldStates("loading"),
  };
}

function fillActiveBatch(activeImages: Img[], queuedImages: Img[], limit: number) {
  const nextActive = [...activeImages];
  const nextQueued = [...queuedImages];
  while (nextActive.length < limit && nextQueued.length > 0) {
    nextActive.push(nextQueued.shift()!);
  }
  return {
    active: nextActive,
    queued: nextQueued,
  };
}

function getResolvedItemStatus(image: Img): ItemStatus {
  if (image.aiProcessing || image.status === "pending") {
    return "pending";
  }
  return image.status;
}

function getStatusSortValue(status: ItemStatus) {
  switch (status) {
    case "pending":
      return 0;
    case "error":
      return 1;
    case "ready":
      return 2;
    default:
      return 0;
  }
}

function resolveImportedProductTitle(record: ImportedListingRecord) {
  return safeTitle(record.title, record.title || "Imported Listing");
}

function resolveImportedProductDescription(record: ImportedListingRecord) {
  const { buyerCopy, templateSpecBlock } = parseSterileTemplateDescription(record.description || record.templateDescription || "");
  return [buyerCopy, templateSpecBlock].filter(Boolean).join("\n\n").trim();
}

function resolveImportedProductTags(record: ImportedListingRecord) {
  return clampTagList(record.tags || []);
}

export default function MerchQuantumApp() {
  const [provider, setProvider] = useState<ProviderChoiceId | "">("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [shopId, setShopId] = useState("");
  const [availableShops, setAvailableShops] = useState<Shop[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateSourceMode, setTemplateSourceMode] = useState<"product" | "manual">("product");
  const [templateRef, setTemplateRef] = useState("");
  const [templateNickname, setTemplateNickname] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [queuedImages, setQueuedImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingApi, setLoadingApi] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [isWorkspaceConfigured, setIsWorkspaceConfigured] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [isDisconnectArmed, setIsDisconnectArmed] = useState(false);
  const [isTokenInputFocused, setIsTokenInputFocused] = useState(false);
  const [createThumbGridPage, setCreateThumbGridPage] = useState(0);
  const [isCreateThumbExpandedView, setIsCreateThumbExpandedView] = useState(false);
  const [isRoutingGridExpanded, setIsRoutingGridExpanded] = useState(false);
  const [isWorkspaceSelectionCondensed, setIsWorkspaceSelectionCondensed] = useState(getStoredWorkspaceSelectionCondensed);
  const [showWorkspaceModeLoader, setShowWorkspaceModeLoader] = useState(false);
  const [workspaceModeLoadingLabel, setWorkspaceModeLoadingLabel] = useState("Preparing workspace...");
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [isImportingListings, setIsImportingListings] = useState(false);
  const [isSyncingImportedListings, setIsSyncingImportedListings] = useState(false);
  const [isPublishingImportedListings, setIsPublishingImportedListings] = useState(false);
  const [manualPrebufferOverride, setManualPrebufferOverride] = useState(false);
  const [activeGridProductId, setActiveGridProductId] = useState("");
  const [editingField, setEditingField] = useState<InlineEditableField>(null);
  const [editableTitleDraft, setEditableTitleDraft] = useState("");
  const [editableDescriptionDraft, setEditableDescriptionDraft] = useState("");
  const [inlineSaveFeedback, setInlineSaveFeedback] = useState<InlineSaveFeedback | null>(null);
  const {
    setTelemetry: setAiAssistTelemetry,
    clearTelemetry: clearAiAssistTelemetry,
    activateTelemetry: activateAiAssistTelemetry,
  } = useQuantumRouteTelemetry();

  const [routingGuidanceTarget, setRoutingGuidanceTarget] = useState<"provider" | "token" | "shop" | "mode" | null>(null);
  const [pulseConnected, setPulseConnected] = useState(false);

  const connectedProviderMeta = useMemo(() => PROVIDERS.find((entry) => entry.id === provider) || null, [provider]);
  const loadedStatCount = images.length;
  const queuedStatCount = queuedImages.length;
  const allImages = useMemo(() => [...images, ...queuedImages], [images, queuedImages]);
  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => {
      const statusDelta = getStatusSortValue(getResolvedItemStatus(a)) - getStatusSortValue(getResolvedItemStatus(b));
      if (statusDelta !== 0) return statusDelta;
      return a.name.localeCompare(b.name);
    });
  }, [images]);
  const selectedImage = useMemo(() => allImages.find((entry) => entry.id === selectedId) || null, [allImages, selectedId]);
  const readyCount = images.filter((img) => getResolvedItemStatus(img) === "ready").length;
  const errorCount = images.filter((img) => getResolvedItemStatus(img) === "error").length;
  const processingCount = images.filter((img) => getResolvedItemStatus(img) === "pending").length;
  const draftReadyCount = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready").length;
  const activeBatchLimit = ACTIVE_BATCH_FILES;
  const createThumbCompactVisibleCount = 5;
  const createThumbTotalPages = Math.max(1, Math.ceil(sortedImages.length / createThumbCompactVisibleCount));
  const safeCreateThumbPage = Math.min(createThumbGridPage, createThumbTotalPages - 1);
  const visibleCreateThumbnails = useMemo(() => {
    if (isCreateThumbExpandedView) return sortedImages;
    const start = safeCreateThumbPage * createThumbCompactVisibleCount;
    return sortedImages.slice(start, start + createThumbCompactVisibleCount);
  }, [isCreateThumbExpandedView, safeCreateThumbPage, sortedImages]);
  const createThumbVisibleRangeLabel = useMemo(() => {
    if (sortedImages.length === 0) return "0-0 of 0";
    const start = isCreateThumbExpandedView ? 1 : safeCreateThumbPage * createThumbCompactVisibleCount + 1;
    const end = isCreateThumbExpandedView ? sortedImages.length : Math.min(sortedImages.length, start + visibleCreateThumbnails.length - 1);
    return `${start}-${end} of ${sortedImages.length}`;
  }, [createThumbCompactVisibleCount, isCreateThumbExpandedView, safeCreateThumbPage, sortedImages.length, visibleCreateThumbnails.length]);

  const canShowLoadedQueueGrid = images.length > 0;
  const canShowWorkspacePreview = connected && Boolean(shopId) && workspaceMode === "create";
  const canShowDetailPanel = Boolean(selectedImage);
  const canEditDetailTitle = Boolean(selectedImage);
  const canEditDetailDescription = Boolean(selectedImage);
  const titleFeedback = inlineSaveFeedback?.field === "title" ? inlineSaveFeedback : null;
  const descriptionFeedback = inlineSaveFeedback?.field === "description" ? inlineSaveFeedback : null;
  const selectedImageStatus = selectedImage ? getResolvedItemStatus(selectedImage) : null;
  const canManualRescueSelectedImage =
    !!selectedImage
    && selectedImageStatus === "error"
    && !selectedImage.aiProcessing;
  const templateReadyForAi = Boolean(template?.reference);
  const showPreviewStats = images.length > 0 || queuedImages.length > 0;
  const generationProgressPct = clamp(
    allImages.length === 0
      ? 0
      : Math.round(((readyCount + errorCount) / Math.max(allImages.length, 1)) * 100),
    0,
    100
  );
  const supportsImportedListingSync = provider === "printful" || provider === "printify";
  const supportsImportedPublish = provider === "printify";
  const approvedImportedItems = allImages.filter((img) => img.sourceType === "imported" && getResolvedItemStatus(img) === "ready");
  const showCompactDisconnectedToken = !connected && !isTokenInputFocused && token.trim().length > 0;
  const tokenFieldValue = connected || showCompactDisconnectedToken ? maskTokenCompact(token) : token;
  const canSubmitProviderConnection = Boolean(provider && token.trim());
  const canSubmitProviderConnectionWithToken = canSubmitProviderConnection && !loadingApi;
  const showWorkspaceModePicker = connected && shopId;
  const shopTriggerLabel = connected ? "Select Shop" : "Select Shop";
  const workspaceModePickerLabel = showWorkspaceModePicker ? "Edit mode" : "Edit mode";
  const canRerollSelectedImage = Boolean(selectedImage) && !selectedImage.aiProcessing;
  const descriptionActionDisabled = !selectedImage || selectedImage.aiProcessing;
  const detailTitle = selectedImage?.final || "";
  const detailTags = selectedImage?.tags || [];
  const detailBuyerDescription = useMemo(() => {
    const fullDescription = selectedImage?.finalDescription || "";
    return parseSterileTemplateDescription(fullDescription).buyerCopy;
  }, [selectedImage?.finalDescription]);
  const detailTemplateSpecBlock = useMemo(() => {
    const fullDescription = selectedImage?.finalDescription || "";
    return parseSterileTemplateDescription(fullDescription).templateSpecBlock;
  }, [selectedImage?.finalDescription]);

  const resetProviderState = useCallback((clearStatus = true) => {
    setConnected(false);
    setShopId("");
    setAvailableShops([]);
    setWorkspaceMode("");
    setTemplate(null);
    setApiProducts([]);
    setImages([]);
    setQueuedImages([]);
    setSelectedId("");
    setIsWorkspaceConfigured(false);
    setIsRoutingGridExpanded(false);
    setSelectedImportIds([]);
    setImportStatus("");
    setRunStatus("");
    setInlineSaveFeedback(null);
    clearAiAssistTelemetry();
    setManualPrebufferOverride(false);
    if (clearStatus) setApiStatus("");
  }, [clearAiAssistTelemetry]);

  useEffect(() => {
    if (!provider) {
      setToken("");
      resetProviderState(false);
      return;
    }
    setToken(getStoredProviderToken(provider));
  }, [provider, resetProviderState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY,
      isWorkspaceSelectionCondensed ? "1" : "0"
    );
  }, [isWorkspaceSelectionCondensed]);

  const setAiAssistStatus = useCallback((message: string) => {
    if (!message.trim()) {
      clearAiAssistTelemetry();
      return;
    }

    activateAiAssistTelemetry("listing", message);
  }, [activateAiAssistTelemetry, clearAiAssistTelemetry]);

  useEffect(() => {
    if (!selectedId) {
      setEditingField(null);
      setInlineSaveFeedback(null);
      clearAiAssistTelemetry();
      return;
    }
  }, [selectedId, clearAiAssistTelemetry]);

  useEffect(() => {
    if (!templateReadyForAi && !images.some((img) => img.sourceType === "imported")) return;
  }, [images, templateReadyForAi]);

  function getRoutingFieldGlowClass(field: "provider" | "token" | "shop" | "mode") {
    if (routingGuidanceTarget === field) {
      return "animate-pulse rounded-xl ring-1 ring-[#7F22FE]/45 shadow-[0_0_22px_rgba(127,34,254,0.35)]";
    }
    if (field === "provider" && connected) {
      return "rounded-xl ring-1 ring-[#00BC7D]/35 shadow-[0_0_18px_rgba(0,188,125,0.25)]";
    }
    return "";
  }

  function nudgeProviderSelectionFromTokenArea() {
    if (provider) return;
    setRoutingGuidanceTarget("provider");
    globalThis.setTimeout(() => setRoutingGuidanceTarget((current) => (current === "provider" ? null : current)), 1400);
  }

  function nudgeWorkflow(force = false) {
    if (!workspaceMode && !force) return;
    setIsRoutingGridExpanded((current) => (force ? true : current));
  }

  function handleShopSelection(nextShopId: string) {
    setShopId(nextShopId);
    setWorkspaceMode("");
    setTemplate(null);
    setApiProducts([]);
    setImages([]);
    setQueuedImages([]);
    setSelectedId("");
    setSelectedImportIds([]);
    setImportStatus("");
    setRunStatus("");
    setInlineSaveFeedback(null);
    clearAiAssistTelemetry();
    setManualPrebufferOverride(false);
    if (nextShopId) {
      setIsWorkspaceConfigured(true);
      setApiStatus("");
    }
  }

  function handleWorkspaceModeChange(nextMode: WorkspaceMode) {
    setWorkspaceMode(nextMode);
    setTemplate(null);
    setApiProducts([]);
    setImages([]);
    setQueuedImages([]);
    setSelectedId("");
    setSelectedImportIds([]);
    setImportStatus("");
    setRunStatus("");
    setInlineSaveFeedback(null);
    clearAiAssistTelemetry();
    setManualPrebufferOverride(false);
    if (nextMode) {
      setIsWorkspaceConfigured(true);
    }
  }

  async function connectProvider() {
    if (!provider || !token.trim()) return;
    setLoadingApi(true);
    setApiStatus("");
    try {
      const response = await fetch(`/api/providers/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, token: token.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `${connectedProviderMeta?.label || "Provider"} connect failed with status ${response.status}.`);
      const shops = Array.isArray(data?.shops)
        ? data.shops.map((shop: ApiShop) => ({ id: String(shop.id), title: shop.title }))
        : [];
      if (shops.length === 0) {
        setApiStatus("No shops were returned for this provider connection.");
        return;
      }
      storeProviderToken(provider, token);
      setAvailableShops(shops);
      setConnected(true);
      setIsDisconnectArmed(false);
      setPulseConnected(true);
      globalThis.setTimeout(() => setPulseConnected(false), 1200);
      setApiStatus("");
    } catch (error) {
      logErrorToConsole("[MerchQuantum] provider connect failed", error);
      setApiStatus(getUserFacingErrorMessage("connection"));
    } finally {
      setLoadingApi(false);
    }
  }

  async function disconnectProvider() {
    if (!provider) return;
    setLoadingApi(true);
    try {
      await fetch(`/api/providers/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider }),
      });
    } catch {
      // Ignore disconnect failures; local reset still happens.
    } finally {
      storeProviderToken(provider, "");
      setToken("");
      setIsDisconnectArmed(false);
      resetProviderState();
      setLoadingApi(false);
    }
  }

  async function loadProviderProducts() {
    if (!provider || !shopId || !workspaceMode) return;
    setLoadingProducts(true);
    setApiStatus("");
    try {
      const response = await fetch(`/api/providers/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, shopId, workspaceMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Products request failed with status ${response.status}.`);
      const mapped: Product[] = Array.isArray(data?.products)
        ? data.products.map((product: ApiProduct) => ({
            id: product.id,
            title: product.title,
            type: inferProductFamily(`${product.title} ${product.description || ""}`),
            shopId,
            description: product.description,
            previewUrl: product.preview_url,
          }))
        : [];
      setApiProducts(mapped);
      setApiStatus(mapped.length === 0 ? "No products were found for this shop." : "");
    } catch (error) {
      setApiStatus(formatApiError("providerLoad", error, "[MerchQuantum] product load failed"));
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    if (!connected || !shopId || !workspaceMode || loadingProducts || apiProducts.length > 0 || !!apiStatus) return;
    void loadProviderProducts();
  }, [apiProducts.length, apiStatus, connected, loadingProducts, provider, shopId, workspaceMode]);

  async function loadTemplateFromProduct(productId: string) {
    if (!provider || !shopId || !productId) return;
    setLoadingApi(true);
    setApiStatus("");
    try {
      const response = await fetch(`/api/providers/product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, shopId, productId }),
      });
      const data: ApiTemplateResponse & { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Product request failed with status ${response.status}.`);
      const product = data.product;
      const placementGuide = data.placementGuide || getPlacementGuide(product || null);
      const reference = product?.id || productId;
      const nickname = product?.title || `Product ${reference}`;
      const description = stripHtml(product?.description || "");
      setTemplate({
        reference,
        nickname,
        description,
        source: "product",
        shopId,
        placementGuide,
      });
      setTemplateRef(reference);
      setTemplateNickname(nickname);
      setApiStatus("");
    } catch (error) {
      const base = formatApiError("providerLoad", error, "[MerchQuantum] template load failed");
      setApiStatus(base);
    } finally {
      setLoadingApi(false);
    }
  }

  async function openArtworkPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;
      await addFiles(input.files);
    };
    input.click();
  }

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).slice(0, IMPORT_QUEUE_LIMIT);
    if (files.length === 0) return;
    const nextImages = files.map((file) => createEmptyImage(file));
    const merged = [...images, ...nextImages];
    const { active, queued } = fillActiveBatch(merged.slice(0, activeBatchLimit), merged.slice(activeBatchLimit), activeBatchLimit);
    setImages(active);
    setQueuedImages(queued);
    if (!selectedId) setSelectedId(active[0]?.id || "");
    for (const image of nextImages) {
      void runAiListingForImage(image.id);
    }
  }

  async function runAiListingForImage(targetId: string, options: { pendingReason?: string; successMessage?: string; targetField?: "full" | AiFieldKey } = {}) {
    const nextImage = [...images, ...queuedImages].find((img) => img.id === targetId);
    if (!nextImage) return;
    const targetField = options.targetField || "full";
    const requestProductFamily = nextImage.productFamilyOverride || inferProductFamily(`${nextImage.final} ${template?.nickname || ""}`);
    const templateContext = template?.description || nextImage.templateDescriptionOverride || "";

    setImages((current) => current.map((img) => {
      if (img.id !== targetId) return img;
      return {
        ...img,
        aiProcessing: true,
        status: "pending",
        statusReason: options.pendingReason || "Quantum AI is analyzing artwork.",
        aiFieldStates: createAiFieldStates("loading"),
      };
    }));

    setAiAssistTelemetry(
      createQuantumRouteTelemetry(
        "listing",
        "active",
        options.pendingReason || "Quantum AI is analyzing artwork.",
        null
      )
    );

    try {
      const response = await requestAiListing({
        imageDataUrl: nextImage.preview,
        title: nextImage.final,
        fileName: nextImage.name,
        templateContext,
        productFamily: requestProductFamily,
      });
      const draft: AiListingDraft = {
        title: response.title,
        leadParagraphs: response.leadParagraphs,
        model: response.model,
        confidence: response.confidence,
        templateReference: template?.reference || nextImage.templateReferenceOverride || "",
        reasonFlags: response.reasonFlags,
        source: response.source,
        grade: response.grade,
        qcApproved: response.qcApproved,
        publishReady: response.publishReady,
      };
      const title = buildListingTitle(draft, nextImage.cleaned);
      const description = buildListingDescription(draft, templateContext);
      const tags = clampTagList(response.tags);
      const publishReady = Boolean(response.publishReady);
      const source = response.source;
      const status: ItemStatus = publishReady ? "ready" : "error";
      const successMessage = options.successMessage || targetField !== "full" || publishReady
        ? publishReady
          ? source === "fallback"
            ? "Quantum AI produced a publish-ready fallback draft."
            : "AI draft passed publish checks."
          : source === "fallback"
            ? "Quantum AI completed a fallback draft, but it did not pass publish checks."
            : "Quantum AI could not generate a publish-ready draft for this image."
        : "";
      const statusReason = response.reasonFlags.length > 0
        ? response.reasonFlags.join(" • ")
        : publishReady
          ? source === "fallback"
            ? "Quantum AI produced a publish-ready fallback draft."
            : "Quantum AI returned a publish-ready draft."
          : "Quantum AI could not generate a publish-ready draft for this image.";

      setImages((current) => current.map((img) => {
        if (img.id !== targetId) return img;
        return {
          ...img,
          final: targetField === "full" || targetField === "title" ? title : img.final,
          finalDescription: targetField === "full" || targetField === "description" ? description : img.finalDescription,
          tags: targetField === "full" || targetField === "tags" ? tags : img.tags,
          aiDraft: draft,
          aiProcessing: false,
          status: targetField === "full" ? status : publishReady ? "ready" : "error",
          statusReason,
          aiFieldStates: createAiFieldStates("ready"),
        };
      }));

      setAiAssistTelemetry(
        createQuantumRouteTelemetry(
          "listing",
          publishReady ? "success" : "fatal",
          successMessage || statusReason,
          200
        )
      );
    } catch (error) {
      const message = error instanceof QuantumRouteError
        ? error.telemetry.message
        : error instanceof Error
          ? error.message
          : "Quantum AI could not generate a draft for this image.";
      setImages((current) => current.map((img) => {
        if (img.id !== targetId) return img;
        return {
          ...img,
          aiProcessing: false,
          status: "error",
          statusReason: message,
          aiFieldStates: createAiFieldStates("error"),
        };
      }));
      setAiAssistTelemetry(
        error instanceof QuantumRouteError
          ? error.telemetry
          : createQuantumRouteTelemetry("listing", "fatal", message, 500)
      );
    }
  }

  async function rerollSelectedImageField(field: AiFieldKey) {
    if (!selectedImage) return;
    await runAiListingForImage(selectedImage.id, {
      pendingReason: `Quantum AI is refreshing the ${field}.`,
      targetField: field,
    });
  }

  function removePreviewItem(targetId: string) {
    const remainingActive = images.filter((entry) => entry.id !== targetId);
    const { active: nextActive, queued: nextQueued } = fillActiveBatch(remainingActive, queuedImages, activeBatchLimit);
    setImages(nextActive);
    setQueuedImages(nextQueued);
    if (selectedId === targetId) setSelectedId(nextActive[0]?.id || "");
  }

  async function beginInlineEdit(field: Exclude<InlineEditableField, null>) {
    if (!selectedImage) return;
    setInlineSaveFeedback(null);
    setEditingField(field);
    if (field === "title") setEditableTitleDraft(selectedImage.final || "");
    if (field === "description") setEditableDescriptionDraft(detailBuyerDescription || "");
  }

  function autosizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  async function commitInlineEdit(field: Exclude<InlineEditableField, null>, value: string) {
    if (!selectedImage) return;
    setInlineSaveFeedback({ field, tone: "saving", message: "Saving..." });
    try {
      if (field === "title") {
        const nextTitle = safeTitle(value, selectedImage.cleaned);
        setImages((current) => current.map((img) => img.id === selectedImage.id ? { ...img, final: nextTitle } : img));
      }
      if (field === "description") {
        const stitched = [value.trim(), detailTemplateSpecBlock].filter(Boolean).join("\n\n");
        setImages((current) => current.map((img) => img.id === selectedImage.id ? { ...img, finalDescription: stitched } : img));
      }
      setInlineSaveFeedback({ field, tone: "saved", message: "Saved." });
      globalThis.setTimeout(() => setInlineSaveFeedback((current) => current?.field === field ? null : current), 1200);
    } catch (error) {
      setInlineSaveFeedback({ field, tone: "error", message: error instanceof Error ? error.message : "Save failed." });
    } finally {
      setEditingField(null);
    }
  }

  async function triggerDescriptionAction() {
    if (!selectedImage) return;
    await runAiListingForImage(selectedImage.id, {
      pendingReason: "Quantum AI is preparing listing copy.",
      successMessage: "Quantum AI refreshed the listing copy.",
      targetField: "full",
    });
  }

  async function importProviderListings() {
    if (!provider || !shopId || selectedImportIds.length === 0) return;
    setIsImportingListings(true);
    setImportStatus(`Importing ${selectedImportIds.length} provider listing${selectedImportIds.length === 1 ? "" : "s"}...`);
    try {
      const response = await fetch(`/api/providers/import-listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, shopId, productIds: selectedImportIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Import request failed with status ${response.status}.`);
      const records: ImportedListingRecord[] = Array.isArray(data?.records) ? data.records : [];
      const importedImages = records.map((record) => {
        const title = resolveImportedProductTitle(record);
        const description = resolveImportedProductDescription(record);
        const tags = resolveImportedProductTags(record);
        const previewUrl = record.artwork?.previewUrl || record.artwork?.url || "";
        return {
          id: makeId(),
          name: record.artwork?.fileName || `${title}.png`,
          file: new File([], record.artwork?.fileName || `${title}.png`),
          preview: previewUrl,
          cleaned: title,
          final: title,
          finalDescription: description,
          tags,
          status: "ready" as ItemStatus,
          statusReason: "Imported listing is ready for review.",
          aiFieldStates: createAiFieldStates("ready"),
          sourceType: "imported" as const,
          providerId: provider,
          providerStoreId: record.storeId,
          providerProductId: record.id,
          importedArtwork: normalizeImportedArtwork(record),
          originalListingTitle: record.title,
          originalListingDescription: record.description,
          syncState: "idle" as const,
          syncMessage: "",
        };
      });
      const merged = [...images, ...importedImages];
      setImages(merged);
      setQueuedImages([]);
      if (!selectedId) setSelectedId(merged[0]?.id || "");
      setSelectedImportIds([]);
      setImportStatus(importedImages.length > 0 ? `Imported ${importedImages.length} listing${importedImages.length === 1 ? "" : "s"}.` : "No provider listings were imported.");
    } catch (error) {
      setImportStatus(formatApiError("listingImport", error, "[MerchQuantum] listing import failed"));
    } finally {
      setIsImportingListings(false);
    }
  }

  async function syncImportedListings() {
    if (!provider || approvedImportedItems.length === 0) return;
    if (!supportsImportedListingSync) {
      setImportStatus(`${connectedProviderMeta?.label || "This provider"} metadata sync is not available in this pass yet.`);
      return;
    }
    setIsSyncingImportedListings(true);
    setImportStatus(`Syncing ${approvedImportedItems.length} approved listing${approvedImportedItems.length === 1 ? "" : "s"} back to ${connectedProviderMeta?.label || "the provider"}...`);
    try {
      const response = await fetch(`/api/providers/update-listing-metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider,
          items: approvedImportedItems.map((img) => ({
            providerProductId: img.providerProductId,
            storeId: img.providerStoreId,
            title: img.final,
            description: img.finalDescription,
            tags: img.tags,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Metadata sync failed with status ${response.status}.`);
      setImages((current) => current.map((img) => approvedImportedItems.some((item) => item.id === img.id)
        ? { ...img, syncState: "synced", syncMessage: "Provider metadata synced." }
        : img));
      setImportStatus(`Synced ${approvedImportedItems.length} approved listing${approvedImportedItems.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setImportStatus(formatApiError("providerLoad", error, "[MerchQuantum] metadata sync failed"));
    } finally {
      setIsSyncingImportedListings(false);
    }
  }

  async function publishImportedListings() {
    if (!provider || approvedImportedItems.length === 0) return;
    if (!supportsImportedPublish) {
      setImportStatus(`${connectedProviderMeta?.label || "This provider"} direct publishing is not available in this pass yet.`);
      return;
    }
    const publishableProductIds = new Set(approvedImportedItems.filter((img) => img.syncState === "synced").map((img) => img.providerProductId).filter(Boolean));
    if (publishableProductIds.size === 0) {
      setImportStatus("Sync approved listings before sending them to the provider publish step.");
      return;
    }
    setIsPublishingImportedListings(true);
    setImportStatus(`Publishing ${publishableProductIds.size} synced approved listing${publishableProductIds.size === 1 ? "" : "s"}...`);
    try {
      const response = await fetch(`/api/providers/publish-listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, productIds: Array.from(publishableProductIds) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Publish request failed with status ${response.status}.`);
      setImportStatus(`Published ${publishableProductIds.size} listing${publishableProductIds.size === 1 ? "" : "s"}.`);
    } catch (error) {
      setImportStatus(formatApiError("listingPublish", error, "[MerchQuantum] publish listings failed"));
    } finally {
      setIsPublishingImportedListings(false);
    }
  }

  async function runDraftBatch() {
    const activeImages = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready");
    if (!provider || !shopId || activeImages.length === 0) return;
    setRunStatus("");
    setIsRunningBatch(true);
    try {
      let createdCount = 0;
      for (let index = 0; index < activeImages.length; index += 1) {
        const image = activeImages[index];
        setRunStatus(`Uploading draft ${index + 1} of ${activeImages.length}...`);
        const response = await fetch(`/api/providers/batch-create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: provider,
            shopId,
            title: image.final,
            description: image.finalDescription,
            tags: image.tags,
            artworkUrl: image.preview,
            placementGuide: template?.placementGuide || DEFAULT_PLACEMENT_GUIDE,
            productId: template?.reference,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `Draft request failed with status ${response.status}.`);
        createdCount += 1;
      }

      const batchSucceeded = createdCount === activeImages.length;
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
    <main className="box-border flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto overflow-x-hidden bg-[#0d1117] p-6 font-sans text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="sticky top-0 z-10 bg-[#0d1117] pb-2 space-y-2">
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
            <div className={`min-w-0 self-start ${getRoutingFieldGlowClass("provider")}`}>
              <SetupSelect
                value={provider}
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
              </SetupSelect>
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
              className={`min-w-0 self-start ${getRoutingFieldGlowClass("token")}`}
            >
              <div className="relative flex min-w-0 items-center">
                <SetupInput
                  id="provider-api-key-input"
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
                    if (e.key === "Enter" && canSubmitProviderConnectionWithToken()) {
                      e.preventDefault();
                      void connectProvider();
                    }
                  }}
                  className="min-w-0 truncate pr-14 sm:pr-16"
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
                        className="inline-flex h-8 items-center rounded-lg border border-[#FF2056]/40 bg-[#FF2056]/12 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#FF2056] transition hover:bg-[#FF2056]/18"
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
                      aria-label="Connect provider"
                      title="Connect"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/80 disabled:text-slate-200 ${
                        !connected && token.trim().length > 0
                          ? "animate-pulse border-purple-400/40 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                          : ""
                      }`}
                    >
                      <ConnectArrowIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={`relative min-w-0 ${getRoutingFieldGlowClass("shop")}`}>
              <SetupSelect
                value={shopId}
                disabled={!connected || loadingApi}
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
              </SetupSelect>
            </div>

            <div className={`relative min-w-0 ${getRoutingFieldGlowClass("mode")}`}>
              <SetupSelect
                value={workspaceMode}
                disabled={!connected || !shopId}
                onChange={(event) => {
                  handleWorkspaceModeChange(event.target.value as WorkspaceMode);
                }}
              >
                <option value="">{workspaceModePickerLabel}</option>
                <option value="create">Bulk Create</option>
                <option value="edit">Bulk Edit</option>
              </SetupSelect>
            </div>
            </div>

            {apiStatus ? <p className="mt-3 text-sm text-[#FF2056]">{apiStatus}</p> : null}
          </Box>
          </div>
          ) : null}

        </div>
        {connected && shopId && workspaceMode ? (
          <div className="relative z-10">
            {showWorkspaceModeLoader ? <WorkspaceModeLoadingOverlay label={workspaceModeLoadingLabel} /> : null}
            <div aria-hidden={showWorkspaceModeLoader} className={showWorkspaceModeLoader ? "pointer-events-none opacity-0" : ""}>
          <Box className="relative border-slate-800 bg-[#020616] shadow-[0_24px_70px_-38px_rgba(2,6,22,0.95)]">
            {workspaceMode === "edit" ? (
              <ProductGrid
                heading={<><span className="text-[#7F22FE]">Merch </span><span className="text-white">Quantum: Choose listings to edit</span></>}
                items={apiProducts}
                selectedIds={selectedImportIds}
                activeId={activeGridProductId}
                importedProductIds={new Set(images.filter((img) => img.providerProductId).map((img) => String(img.providerProductId)))}
                highlighted={Boolean(shopId)}
                collapsed={!isRoutingGridExpanded}
                rangeLabel={apiProducts.length === 0 ? "0-0 of 0" : `1-${Math.min(apiProducts.length, 5)} of ${apiProducts.length}`}
                page={0}
                pageSize={isRoutingGridExpanded ? 25 : 5}
                totalPages={Math.max(1, Math.ceil(apiProducts.length / (isRoutingGridExpanded ? 25 : 5)))}
                loading={loadingProducts}
                headerAccessory={<span className="text-xs text-slate-100">Mode</span>}
                onToggleCollapsed={() => setIsRoutingGridExpanded((current) => !current)}
                onSelectAll={() => setSelectedImportIds(apiProducts.map((product) => product.id))}
                footerLabel={apiProducts.length === 0 ? "0-0 of 0" : `1-${Math.min(apiProducts.length, 5)} of ${apiProducts.length}`}
                onItemActivate={(product) => {
                  setActiveGridProductId(product.id);
                  setSelectedImportIds((current) => current.includes(product.id)
                    ? current.filter((entry) => entry !== product.id)
                    : [...current, product.id]);
                }}
                onPreviousPage={() => undefined}
                onNextPage={() => undefined}
                footerActions={(
                  <button
                    type="button"
                    className="font-semibold text-[#C084FC] transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                    disabled={selectedImportIds.length === 0 || isImportingListings}
                    onClick={() => { void importProviderListings(); }}
                  >
                    Import
                  </button>
                )}
              />
            ) : (
              <ProductGrid
                heading={<><span className="text-[#7F22FE]">Merch </span><span className="text-white">Quantum: Choose product template</span></>}
                items={apiProducts}
                selectedIds={template ? [template.reference] : []}
                activeId={template?.reference}
                importedProductIds={new Set()}
                highlighted={Boolean(shopId)}
                collapsed={!isRoutingGridExpanded}
                rangeLabel={apiProducts.length === 0 ? "0-0 of 0" : `1-${Math.min(apiProducts.length, 5)} of ${apiProducts.length}`}
                page={0}
                pageSize={isRoutingGridExpanded ? 25 : 5}
                totalPages={Math.max(1, Math.ceil(apiProducts.length / (isRoutingGridExpanded ? 25 : 5)))}
                loading={loadingProducts}
                headerAccessory={<span className="text-xs text-slate-100">Mode</span>}
                onToggleCollapsed={() => setIsRoutingGridExpanded((current) => !current)}
                footerLabel={apiProducts.length === 0 ? "0-0 of 0" : `1-${Math.min(apiProducts.length, 5)} of ${apiProducts.length}`}
                onItemActivate={(product) => {
                  setActiveGridProductId(product.id);
                  void loadTemplateFromProduct(product.id);
                }}
                onPreviousPage={() => undefined}
                onNextPage={() => undefined}
                footerActions={null}
              />
            )}

            {shopId && canShowWorkspacePreview ? (
              <>
                <div className="mt-3">
                  <div className="space-y-3" onPointerDownCapture={() => nudgeWorkflow(true)}>
                      <div className="relative rounded-[24px] transition-all">
                      <div className="grid grid-cols-1 items-stretch gap-2">
                        <div className="flex h-full min-w-0 w-full flex-col gap-2">
                          {workspaceMode === "create" ? (
                            <div
                              role={isWorkspaceConfigured ? "button" : undefined}
                              tabIndex={isWorkspaceConfigured ? 0 : -1}
                              className={`w-full rounded-xl border border-dashed border-slate-700 bg-[#020616]/92 px-3 py-1 text-center transition-colors ${isWorkspaceConfigured ? "cursor-pointer hover:bg-[#0b1024]" : "cursor-default"}`}
                              onClick={isWorkspaceConfigured ? openArtworkPicker : undefined}
                              onKeyDown={(e) => {
                                if (!isWorkspaceConfigured) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openArtworkPicker();
                                }
                              }}
                              onDragOver={(e) => {
                                if (workspaceMode === "create") {
                                  e.preventDefault();
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (workspaceMode !== "create" || !connected || !isWorkspaceConfigured) {
                                  nudgeWorkflow(true);
                                  return;
                                }
                                void addFiles(e.dataTransfer.files);
                              }}
                            >
                              <div className="flex min-h-[44px] flex-col justify-between gap-2">
                                <div className="flex items-center justify-center">
                                  <div className="flex flex-col items-center gap-2 text-center">
                                    <p className="text-sm font-medium leading-6 text-white">
                                      Drop Images Here
                                    </p>
                                    <p className="text-xs font-medium text-slate-100">
                                      50 per batch • 500 max queue
                                    </p>
                                  </div>
                                </div>
                                <div className="flex w-full items-center justify-between text-xs font-medium text-slate-100">
                                  <span>{`Loaded: ${loadedStatCount} | Queue: ${queuedStatCount}`}</span>
                                  <button
                                    type="button"
                                    disabled={!canShowLoadedQueueGrid}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (!canShowLoadedQueueGrid) return;
                                      setImages([]);
                                      setQueuedImages([]);
                                      setSelectedId("");
                                    }}
                                    className="text-xs font-medium text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                              {showPreviewStats ? (
                                <div className="pointer-events-none mt-1 h-[2px] rounded-full bg-slate-800/90">
                                  <div
                                    className={`h-full transition-all duration-500 ${processingCount > 0 ? "bg-[#7F22FE]" : "bg-[#00A6F4]"}`}
                                    style={{ width: `${generationProgressPct}%` }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {canShowLoadedQueueGrid ? (
                            <div className="space-y-1 p-1">
                        <div className="quantum-scroll-hidden grid grid-cols-5 gap-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
                                {visibleCreateThumbnails.map((img) => {
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
                                      onClick={() => {
                                        setSelectedId(img.id);
                                      }}
                                      className={`w-full snap-start transition-all duration-500 ${isProcessing ? "shadow-[0_12px_32px_-24px_rgba(124,58,237,0.45)]" : isSelected ? "shadow-[0_10px_24px_-20px_rgba(124,58,237,0.45)]" : ""}`}
                                    >
                                      <SmartThumbnail
                                        src={img.preview}
                                        alt={img.final}
                                        className={`group rounded-lg border transition-all duration-200 ease-out hover:z-10 hover:shadow-[inset_0_0_0_2px_rgba(127,34,254,0.8)] ${previewFrameTone}`}
                                      >
                                        {isProcessing ? <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
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
                                          className="absolute right-1 top-1 z-20 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#020616]/92 p-0 text-xs font-normal text-slate-300 shadow-sm transition-colors hover:text-[#FF2056]"
                                        >
                                          x
                                        </button>
                                      </SmartThumbnail>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                                  <span className="min-w-0 flex-1 truncate text-slate-100">{createThumbVisibleRangeLabel}</span>
                                  <div className="flex items-center justify-end gap-2">
                                  {createThumbTotalPages > 1 ? (
                                    <>
                                      <button
                                        type="button"
                                        aria-label="Previous image set"
                                        className="inline-flex items-center justify-center text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                                        disabled={safeCreateThumbPage <= 0}
                                        onClick={() => setCreateThumbGridPage((current) => Math.max(0, current - 1))}
                                      >
                                        <ChevronIcon open={false} className="h-4 w-4 rotate-90" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Next image set"
                                        className="inline-flex items-center justify-center text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                                        disabled={safeCreateThumbPage >= createThumbTotalPages - 1}
                                        onClick={() => setCreateThumbGridPage((current) => Math.min(createThumbTotalPages - 1, current + 1))}
                                      >
                                        <ChevronIcon open={false} className="h-4 w-4 -rotate-90" />
                                      </button>
                                    </>
                                  ) : null}
                                  {sortedImages.length > createThumbCompactVisibleCount ? (
                                    <button
                                      type="button"
                                      className="font-medium text-slate-100 transition hover:text-white"
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
                        <div className="flex min-w-0 flex-col space-y-0">
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-6 tracking-tight text-slate-200">
                                  <span className="inline-flex items-center text-sm font-semibold leading-6">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 text-white">AI Title</span>
                                  </span>
                                </div>
                                {canRerollSelectedImage ? (
                                  <button
                                    type="button"
                                    onClick={() => { void rerollSelectedImageField("title"); }}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7F22FE]/25 text-slate-300 transition hover:border-[#7F22FE]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/35"
                                    aria-label="Re-roll title with Quantum AI"
                                    title="Re-Roll title"
                                  >
                                    <ReRollIcon className="h-3 w-3" />
                                  </button>
                                ) : null}
                              </div>
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
                                        className="h-9 px-3 py-1 pr-20 font-sans text-sm font-normal text-white"
                                      />
                                      <div className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center gap-2 text-xs font-medium text-slate-100">
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
                                      className={`group relative flex min-h-[36px] w-full items-center rounded-xl border bg-[#020616] px-3 py-1 pr-24 text-left transition ${canEditDetailTitle ? "cursor-text border-slate-700 hover:border-slate-500 focus-visible:border-[#7F22FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30" : "cursor-default border-slate-700"}`}
                                    >
                                      {shouldAwaitQuantumTitle ? (
                                        <div className="flex w-full items-center justify-start gap-2 text-left font-sans text-sm font-normal text-white">
                                          <QuantOrbLoader />
                                          <span>{QUANTUM_TITLE_AWAITING_TEXT}</span>
                                        </div>
                                      ) : (
                                        <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                          <span className="min-w-0 flex-1 truncate font-sans text-sm font-normal text-white">
                                            {detailTitle || <span className="font-sans text-sm font-normal text-white">Click to add a final title.</span>}
                                          </span>
                                        </div>
                                      )}
                                      <div className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center gap-2 text-xs font-medium text-slate-100">
                                        <span>{(detailTitle || "").trim().length}/{LISTING_LIMITS.titleMax}</span>
                                      </div>
                                    </button>
                                  )}
                                </div>
                                {titleFeedback ? (
                                  <p className={`text-xs ${titleFeedback.tone === "error" ? "text-[#FF2056]" : titleFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-100"}`}>
                                    {titleFeedback.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-6 tracking-tight text-slate-200">
                                  <span className="inline-flex min-w-0 items-center text-sm font-semibold leading-6">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 truncate text-white">AI Description</span>
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className={`rounded-xl border bg-[#020616] px-3 py-2.5 transition ${DETAIL_DATA_TEXT_CLASSES} ${canEditDetailDescription ? "border-slate-700 hover:border-slate-500 focus-within:border-[#7F22FE] focus-within:ring-2 focus-within:ring-[#7F22FE]/30" : "border-slate-700"}`}>
                                  <div className="flex">
                                    {editingField === "description" ? (
                                      <div className="flex w-full flex-col gap-2">
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
                                            className={`min-h-[112px] w-full resize-none overflow-hidden bg-transparent px-0 py-0 text-left outline-none transition placeholder:text-slate-200 ${DETAIL_DATA_TEXT_CLASSES}`}
                                          />
                                        </div>
                                        {detailTemplateSpecBlock ? (
                                          <>
                                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                            <div className={`max-h-12 w-full overflow-y-auto whitespace-pre-wrap text-left [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              {detailTemplateSpecBlock}
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="flex w-full flex-col gap-2">
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
                                          className={`group relative flex min-h-[112px] w-full items-start bg-transparent px-0 py-0 text-left transition ${DETAIL_DATA_TEXT_CLASSES} ${canEditDetailDescription ? "cursor-text focus-visible:outline-none" : "cursor-default"}`}
                                        >
                                          {shouldAwaitQuantumDescription ? (
                                            <div className={`flex w-full items-center justify-start gap-2 text-left ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              <QuantOrbLoader />
                                              <span>{QUANTUM_DESCRIPTION_AWAITING_TEXT}</span>
                                            </div>
                                          ) : (
                                            <div className="flex w-full min-w-0 items-start justify-between gap-2">
                                              <div className="min-w-0 flex-1 whitespace-pre-wrap text-left">
                                                {detailBuyerDescription || (
                                                  <span className={DETAIL_DATA_TEXT_CLASSES}>Select or add artwork to generate image-based listing copy.</span>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </button>
                                        {detailTemplateSpecBlock ? (
                                          <>
                                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                            <div className={`max-h-12 w-full overflow-y-auto whitespace-pre-wrap text-left [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              {detailTemplateSpecBlock}
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {descriptionFeedback ? (
                                  <p className={`text-xs ${descriptionFeedback.tone === "error" ? "text-[#FF2056]" : descriptionFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-100"}`}>
                                    {descriptionFeedback.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="pt-0">
                            <div className="rounded-xl border border-slate-700 bg-[#020616] px-3 py-2.5">
                              <div className="flow-root w-full text-center mt-0">
                              <div className="float-left flex items-center h-8">
                                <span className="text-[#7F22FE] text-sm leading-6 font-normal font-sans">Quantum </span>
                                <span className="text-white text-sm leading-6 font-normal font-sans">AI Tags</span>
                              </div>
                              <button
                                type="button"
                                onClick={triggerDescriptionAction}
                                disabled={descriptionActionDisabled}
                                className="float-right flex items-center h-8 text-[#7F22FE] text-sm leading-6 font-normal font-sans bg-transparent border-none p-0 cursor-pointer"
                              >
                                Upload
                              </button>
                              {isDetailTagsLoading ? (
                                Array.from({ length: LISTING_LIMITS.tagCount }).map((_, index) => (
                                  <div
                                    key={`loading-tag-${index}`}
                                    className="inline-block mx-1 my-1 border border-white/20 rounded-full py-1 px-3 bg-transparent text-white text-sm leading-6 font-normal font-sans"
                                  >
                                    <QuantOrbLoader />
                                  </div>
                                ))
                              ) : detailTags.length > 0 ? (
                                detailTags.map((tag, index) => (
                                  <div
                                    key={`${selectedImage?.id || productId}-tag-${index}`}
                                    title={tag}
                                    className="inline-block mx-1 my-1 border border-white/20 rounded-full py-1 px-3 bg-transparent text-white text-sm leading-6 font-normal font-sans"
                                  >
                                    {tag}
                                  </div>
                                ))
                              ) : (
                                <div className="inline-block mx-1 my-1 border border-white/20 rounded-full py-1 px-3 bg-transparent text-white text-sm leading-6 font-normal font-sans">
                                  Tags will appear after Quantum AI processing completes.
                                </div>
                              )}
                              </div>
                            </div>
                          </div>
                        </div>
                        ) : null}
                    </div>
                    </div>
                </div>
              </div>
              </>
            ) : null}
          </Box>
            </div>
          </div>
        ) : null}

      </div>
      <CreativeWellspringBrandMark docked />
      </div>
      <style jsx global>{`
        .quantum-scroll-hidden {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .quantum-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>
    </main>
  );
}


