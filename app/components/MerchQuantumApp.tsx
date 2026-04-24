'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDER_OPTIONS, type ProviderChoiceId } from "../../lib/providers/client-options";
import { getUserFacingErrorMessage, logErrorToConsole, type UserFacingErrorKind } from "../../lib/user-facing-errors";

const BOOT_TAGLINE = "EFFORTLESS PRODUCT CREATION.";
const ACTIVE_BATCH_FILES = 50;
const BRAND_WORDMARK_TEXT_CLASSES = "text-4xl sm:text-5xl";
const BRAND_TAGLINE_TEXT_CLASSES = "text-[11px] sm:text-xs";
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
  const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight);
  const { data } = imageData;

  let visiblePixelCount = 0;
  let brightnessTotal = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < DISPLAY_ALPHA_THRESHOLD) continue;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    brightnessTotal += brightness;
    visiblePixelCount += 1;
  }

  return visiblePixelCount > 0 ? brightnessTotal / visiblePixelCount : null;
}

async function choosePreviewBackgroundFromSource(src: string | null | undefined) {
  const resolvedSrc = String(src || "").trim();
  if (!resolvedSrc || typeof window === "undefined") {
    return DISPLAY_DARK_BACKGROUND;
  }

  try {
    const image = await loadImageElement(resolvedSrc);
    const averageBrightness = measureVisiblePixelBrightness(image);
    return choosePreviewBackground(averageBrightness);
  } catch {
    return DISPLAY_DARK_BACKGROUND;
  }
}

function createPreviewObjectUrl(file: File) {
  return URL.createObjectURL(file);
}

function buildParagraphsFromRawText(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function buildLeadOnlyDescription(paragraphs: string[]) {
  return paragraphs.join("\n\n").trim();
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
      ? `- ${trimmed.replace(/^[-–—]\s*/, "")}`
      : trimmed.replace(/\s+/g, " ");
    const header = cleaned.replace(/:$/, "");

    if (TEMPLATE_SPEC_SECTION_HEADERS.has(header) && out.length && out[out.length - 1] !== "") out.push("");
    out.push(cleaned);
  }

  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function parseTemplateDescription(formattedDescription: string) {
  const introParagraphs: string[] = [];
  const sections: Array<{ heading: string; paragraphs: string[]; bullets: string[] }> = [];
  let currentSection: { heading: string; paragraphs: string[]; bullets: string[] } | null = null;

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
  return stripHtmlTags(value)
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

export function sanitizeTemplateDescriptionForPrebuffer(value: string, title: string) {
  const formatted = formatTemplateDescription(value);
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

  const preservedIntro = parsed.introParagraphs.filter((line) => isStaticTemplateSpecLine(line, title));
  const sanitizedIntro = joinTemplateSpecLines(preservedIntro);
  if (sanitizedIntro) return sanitizedIntro;

  const looseLines = formatted
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => isStaticTemplateSpecLine(line, title));

  return joinTemplateSpecLines(looseLines);
}

function decodeHtmlEntities(value: string) {
  if (!value) return "";
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized.startsWith("#x")) {
      const parsed = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : full;
    }
    if (normalized.startsWith("#")) {
      const parsed = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : full;
    }
    return HTML_ENTITY_MAP[normalized] || full;
  });
}

function stripHtmlTags(value: string) {
  if (!value) return "";
  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
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

function formatProductDescriptionWithSections(paragraphs: string[], specBlock: string) {
  const lead = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const spec = specBlock
    ? `<p>Product features</p><p>${escapeHtml(specBlock).replace(/\n/g, "<br />")}</p>`
    : "";
  return `${lead}${spec}`;
}

function descriptionTextToParagraphs(value: string) {
  return stripHtmlTags(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeDescriptionText(value: unknown) {
  return typeof value === "string" ? stripHtmlTags(value) : "";
}

function normalizeAiLeadParagraphs(paragraphs: string[]) {
  return paragraphs
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((paragraph) => trimToSentence(paragraph, AI_LEAD_MAX_CHARS));
}

export function splitDetailDescriptionForDisplay(specBlock: string, leadParagraphs: string[], fullDescriptionHtml: string) {
  const normalizedLead = normalizeAiLeadParagraphs(leadParagraphs);
  if (normalizedLead.length > 0) {
    return {
      buyerFacingDescription: normalizedLead.join("\n\n"),
      templateSpecBlock: specBlock,
    };
  }

  const paragraphs = descriptionTextToParagraphs(fullDescriptionHtml);
  if (paragraphs.length === 0) {
    return { buyerFacingDescription: "", templateSpecBlock: specBlock };
  }

  const featuresIndex = paragraphs.findIndex((paragraph) => TEMPLATE_SPEC_SECTION_HEADERS.has(paragraph));
  if (featuresIndex >= 0) {
    return {
      buyerFacingDescription: paragraphs.slice(0, featuresIndex).join("\n\n").trim(),
      templateSpecBlock: paragraphs.slice(featuresIndex + 1).join("\n").trim() || specBlock,
    };
  }

  return { buyerFacingDescription: paragraphs.join("\n\n").trim(), templateSpecBlock: specBlock };
}

function extractBuyerFacingDescriptionFromListing(rawDescription: string, specBlock: string) {
  const paragraphs = buildParagraphsFromRawText(stripHtmlTags(rawDescription));
  if (paragraphs.length === 0) return "";

  const featuresIndex = paragraphs.findIndex((paragraph) => TEMPLATE_SPEC_SECTION_HEADERS.has(paragraph));
  const buyerParagraphs = featuresIndex >= 0 ? paragraphs.slice(0, featuresIndex) : paragraphs;
  return buyerParagraphs.join("\n\n").trim() || specBlock;
}

export function canManualOverrideListingCopy(title: string, description: string) {
  const normalizedTitle = clampTitleForListing(title).trim();
  const normalizedDescription = String(description || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LISTING_LIMITS.descriptionMax)
    .trim();
  const paragraphs = normalizedDescription
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return (
    normalizedTitle.length >= LISTING_LIMITS.titleMin
    && normalizedDescription.length >= LISTING_LIMITS.descriptionMin
    && paragraphs.length >= 2
    && paragraphs[0].trim().length >= 24
    && paragraphs[1].trim().length >= 24
  );
}

function normalizeTagsFromPayload(payload: unknown) {
  const base = Array.isArray(payload)
    ? payload
    : typeof payload === "string"
      ? payload.split(/[,\n]/)
      : [];

  const seen = new Set<string>();
  return base
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/\s+/g, " ").trim())
    .filter((tag) => {
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function buildManualOverrideTags(title: string, description: string, count: number) {
  const words = `${title} ${description}`
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9'-]+/g, "").trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));

  return normalizeTagsFromPayload(words).slice(0, count);
}

function clampTitleForListing(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return safeTitle(clean, clean).slice(0, LISTING_LIMITS.titleMax);
}

function clampDescriptionForListing(value: string) {
  const clean = stripHtmlTags(value).replace(/\s+/g, " ").trim();
  return clean.slice(0, LISTING_LIMITS.descriptionMax);
}

function autosizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${Math.max(element.scrollHeight, 124)}px`;
}

function buildLegacyContextForImage(image: Img) {
  const titleSeed = image.originalListingTitle || image.cleaned || image.name;
  const parts = [titleSeed, image.originalListingDescription || "", image.templateDescriptionOverride || ""]
    .map((value) => stripHtmlTags(value).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.join(" | ");
}

function buildTemplateContext(description: string, family: ProductFamily) {
  const typeLabel = family === "product" ? "product" : family.replace(/-/g, " ");
  const sanitized = sanitizeTemplateDescriptionForPrebuffer(description, "");
  return [typeLabel, sanitized].filter(Boolean).join(" | ");
}

function resolveProductFamily(titleSeed: string, templateDescription: string) {
  const combined = `${titleSeed} ${templateDescription}`.trim();
  for (const rule of FAMILY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(combined))) return rule.family;
  }
  return "product";
}

function getStatusSortValue(status: ItemStatus) {
  return status === "ready" ? 0 : status === "pending" ? 1 : 2;
}

function createAiFieldStates(status: AiFieldStatus = "idle"): AiFieldStates {
  return {
    title: status,
    description: status,
    tags: status,
  };
}

function canManualOverrideFlaggedImage(image: Img | null) {
  return !!image && image.aiDraft?.qcApproved !== false;
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

function QuantOrbLoader() {
  return <div className="h-2.5 w-2.5 rounded-full bg-[#7F22FE] shadow-[0_0_12px_rgba(127,34,254,0.8)]" />;
}

function ChevronIcon({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {open ? <path d="M5 12l5-5 5 5" /> : <path d="M5 8l5 5 5-5" />}
    </svg>
  );
}

function ReRollIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M15.5 8.5V4.5h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.8 10A5.8 5.8 0 1 1 9 4.2c1.6 0 3 .6 4 1.6l2.5 2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConnectArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 10h10" />
      <path d="m11 6 4 4-4 4" />
    </svg>
  );
}

function StatusThumbIcon({ tone, direction }: { tone: "ready" | "error"; direction: "up" | "down" }) {
  const isUp = direction === "up";
  const color = tone === "ready" ? "#00BC7D" : "#FF2056";
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d={isUp
          ? "M9 16V8.7l-1.8 1.8-1.1-1.1L10 5.5l3.9 3.9-1.1 1.1L11 8.7V16H9Z"
          : "M11 4v7.3l1.8-1.8 1.1 1.1L10 14.5l-3.9-3.9 1.1-1.1L9 11.3V4h2Z"}
        fill={color}
      />
    </svg>
  );
}

function CreativeWellspringBrandMark({ docked = false }: { docked?: boolean }) {
  return (
    <div className={`${docked ? "mt-auto pt-8" : "pt-6"} flex flex-col items-center justify-center text-center`}>
      <div className={`${BRAND_WORDMARK_TEXT_CLASSES} font-bold tracking-tight`}>
        <span className="text-[#7F22FE]">Merch</span>{" "}
        <span className="text-white">Quantum</span>
      </div>
      <div className={`${BRAND_TAGLINE_TEXT_CLASSES} mt-1 font-semibold tracking-[0.16em] text-white`}>{BOOT_TAGLINE}</div>
    </div>
  );
}

function MerchQuantumInlineHeading({ className = "" }: { className?: string }) {
  return (
    <div className={`min-w-0 text-[15px] font-semibold tracking-tight text-white ${className}`}>
      <span className="text-[#7F22FE]">Merch</span>{" "}
      <span>Quantum</span>
    </div>
  );
}

function Box({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`relative rounded-[24px] border p-3 ${className}`}>{children}</div>;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return getNodeText(node.props.children);
  return "";
}

function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`box-border h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-[#020616] px-3 font-sans text-sm text-white outline-none transition placeholder:text-slate-200 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-200 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

function SetupInput({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`box-border w-full min-w-0 rounded-xl border border-slate-700 bg-[#020616] px-3 py-2 leading-tight font-sans text-sm font-normal text-white outline-none transition placeholder:text-slate-200 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-200 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

function SetupSelect({ className = "", children, ...props }: SelectProps) {
  const isEmptyValue = props.value === "" || props.value == null;
  const emptyOptionLabel = React.Children.toArray(children).reduce<string | null>((foundLabel, child) => {
    if (foundLabel || !React.isValidElement<{ value?: string | number | readonly string[]; children?: React.ReactNode }>(child)) return foundLabel;
    if (String(child.props.value ?? "") !== "") return foundLabel;
    const label = getNodeText(child.props.children).trim();
    return label || foundLabel;
  }, null);
  const enabledSelectClasses = "border-slate-700 bg-[#020616] text-white focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30";
  const disabledSelectClasses = "disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-200 disabled:opacity-60";
  const selectBaseClasses = `box-border h-9 w-full min-w-0 appearance-none rounded-xl px-3 pr-8 font-sans text-sm font-normal outline-none transition ${disabledSelectClasses}`;
  const emptyStateShellClasses = props.disabled
    ? "border-slate-800 bg-[#020616] text-slate-200 opacity-60"
    : "border-slate-700 bg-[#020616] text-white focus-within:border-[#7F22FE] focus-within:ring-2 focus-within:ring-[#7F22FE]/30";

  return (
    <div className={`relative min-w-0 w-full text-sm font-normal text-white ${props.disabled ? "cursor-not-allowed" : ""}`}>
      {isEmptyValue && emptyOptionLabel ? (
        <div className={`relative flex h-9 w-full items-center rounded-xl border px-3 pr-8 font-sans text-sm font-normal transition ${emptyStateShellClasses}`}>
          <div aria-hidden="true" className="pointer-events-none flex min-w-0 items-center">
            <span className="min-w-0 truncate">{emptyOptionLabel}</span>
          </div>
          <select
            className={`absolute inset-0 z-10 h-full w-full appearance-none rounded-xl border-0 bg-transparent px-3 pr-8 font-sans text-sm font-normal text-transparent opacity-0 outline-none ${props.disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
            {...props}
          >
            {children}
          </select>
        </div>
      ) : (
        <select
          className={`${selectBaseClasses} border ${enabledSelectClasses} ${className}`}
          {...props}
        >
          {children}
        </select>
      )}
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-100" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

function SmartThumbnail({
  src,
  alt,
  className = "",
  safeZoneClassName = "",
  imageClassName = "",
  fallbackClassName = "",
  children,
}: SmartThumbnailProps) {
  const [backgroundColor, setBackgroundColor] = useState(DISPLAY_DARK_BACKGROUND);
  const resolvedSrc = buildSmartThumbnailSource(src);

  const handleImageLoad = useCallback(async () => {
    const nextBackground = await choosePreviewBackgroundFromSource(resolvedSrc);
    setBackgroundColor(ensureContrastPreviewBackground(nextBackground));
  }, [resolvedSrc]);

  useEffect(() => {
    let cancelled = false;

    async function loadBackground() {
      const nextBackground = await choosePreviewBackgroundFromSource(resolvedSrc);
      if (!cancelled) {
        setBackgroundColor(ensureContrastPreviewBackground(nextBackground));
      }
    }

    void loadBackground();
    return () => {
      cancelled = true;
    };
  }, [resolvedSrc]);

  return (
    <div
      className={`relative box-border flex aspect-square w-full overflow-hidden bg-center bg-cover bg-no-repeat ${className}`}
      style={{ backgroundColor }}
    >
      <div className={`relative w-full h-full overflow-hidden ${safeZoneClassName}`}>
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt={alt}
            className={`absolute top-[5%] h-[90%] w-full object-contain object-top ${imageClassName}`.trim()}
            onLoad={handleImageLoad}
          />
        ) : (
          <div className={`h-full w-full ${fallbackClassName}`} />
        )}
      </div>
      {children}
    </div>
  );
}

function ProductGrid({
  heading,
  items,
  selectedIds,
  activeId,
  importedProductIds,
  highlighted,
  collapsed,
  rangeLabel,
  page,
  totalPages,
  loading,
  headerAccessory,
  onToggleCollapsed,
  onSelectAll,
  selectAllLabel,
  footerLabel,
  onItemActivate,
  onPreviousPage,
  onNextPage,
  footerActions,
}: ProductGridProps) {
  const displayItems = collapsed ? items.slice(0, 5) : items;
  const effectiveRangeLabel = footerLabel ?? rangeLabel;
  return (
    <div className={`relative rounded-[24px] border border-slate-700/80 bg-[#020616] p-3 shadow-[0_24px_70px_-40px_rgba(2,6,22,0.98)] ${highlighted ? "ring-1 ring-[#7F22FE]/55" : ""}`}>
      <div className="flex items-center justify-between gap-3 pb-2">
        <div className="min-w-0 text-[15px] font-semibold tracking-tight text-white">{heading}</div>
        <div className="flex items-center gap-3 text-[11px] text-slate-100">
          {headerAccessory}
          {onSelectAll ? (
            <button type="button" className="text-slate-100 transition hover:text-white" onClick={onSelectAll}>
              {selectAllLabel || "Select All"}
            </button>
          ) : null}
          {onToggleCollapsed ? (
            <button type="button" className="text-slate-100 transition hover:text-white" onClick={onToggleCollapsed}>
              Mode
            </button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className="flex flex-col items-center justify-center space-y-3 min-h-[50vh] w-full">
          <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
          <span className="font-sans text-sm font-normal text-white">Awaiting Quantum AI...</span>
        </div>
      ) : (
        <>
          <div className={`grid ${collapsed ? "grid-cols-5" : "grid-cols-5"} gap-2`}>{displayItems.map((product, index) => {
            const isSelected = selectedIds.includes(product.id);
            const isActive = activeId === product.id;
            const alreadyImported = importedProductIds.has(product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={(event) => onItemActivate(product, index, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onItemActivate(product, index, event);
                  }
                }}
                className={`group relative overflow-hidden rounded-xl border bg-[#020616] transition ${isSelected ? "border-[#7F22FE] shadow-[0_0_0_1px_rgba(127,34,254,0.45)]" : alreadyImported ? "border-[#00BC7D]/45" : "border-slate-700 hover:border-slate-500"}`}
                aria-pressed={isSelected}
              >
                <SmartThumbnail
                  src={product.previewUrl}
                  alt={product.title}
                  className={`rounded-[10px] ${isActive ? "ring-1 ring-white/10" : ""}`}
                />
              </button>
            );
          })}</div>
          <div className="flex items-center justify-between gap-2 pt-3 text-[11px] text-slate-100">
            <span className="min-w-0 flex-1 truncate">{effectiveRangeLabel}</span>
            <div className="flex items-center gap-2">
              {footerActions}
              {onToggleCollapsed ? (
                <button type="button" className="text-slate-100 transition hover:text-white" onClick={onToggleCollapsed}>
                  {collapsed ? "Maximize" : "Minimize"}
                </button>
              ) : null}
              {totalPages > 1 ? (
                <>
                  <button type="button" className="text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200" onClick={onPreviousPage} disabled={page <= 0} aria-label="Previous page">
                    <ChevronIcon open={false} className="h-4 w-4 rotate-90" />
                  </button>
                  <button type="button" className="text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200" onClick={onNextPage} disabled={page >= totalPages - 1} aria-label="Next page">
                    <ChevronIcon open={false} className="h-4 w-4 -rotate-90" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function parseResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function formatApiError(kind: UserFacingErrorKind, error: unknown, consolePrefix?: string) {
  logErrorToConsole(consolePrefix || `[MerchQuantum] ${kind} failed`, error);
  return getUserFacingErrorMessage(kind);
}

function appendToActiveBatch(active: Img[], queued: Img[], incoming: Img[], activeLimit: number) {
  const nextActive = [...active];
  const nextQueued = [...queued];

  for (const image of incoming) {
    if (nextActive.length < activeLimit) {
      nextActive.push(image);
    } else {
      nextQueued.push(image);
    }
  }

  return { active: nextActive, queued: nextQueued };
}

function fillActiveBatch(active: Img[], queued: Img[], activeLimit: number) {
  const nextActive = [...active];
  const nextQueued = [...queued];

  while (nextActive.length < activeLimit && nextQueued.length > 0) {
    const next = nextQueued.shift();
    if (next) nextActive.push(next);
  }

  return { active: nextActive, queued: nextQueued };
}

function normalizeSelectionIds(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function selectionsMatch(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

async function readDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

async function analyzeArtworkBounds(file: File): Promise<ArtworkBounds> {
  const previewUrl = createPreviewObjectUrl(file);
  try {
    const image = await loadImageElement(previewUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width || 1;
    canvas.height = image.naturalHeight || image.height || 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        visibleLeft: 0,
        visibleTop: 0,
        visibleWidth: canvas.width,
        visibleHeight: canvas.height,
      };
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width;
    let top = canvas.height;
    let right = 0;
    let bottom = 0;
    let found = false;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha < DISPLAY_ALPHA_THRESHOLD) continue;
        found = true;
        if (x < left) left = x;
        if (y < top) top = y;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }

    if (!found) {
      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        visibleLeft: 0,
        visibleTop: 0,
        visibleWidth: canvas.width,
        visibleHeight: canvas.height,
      };
    }

    return normalizeArtworkBounds({
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      visibleLeft: left,
      visibleTop: top,
      visibleWidth: right - left + 1,
      visibleHeight: bottom - top + 1,
    }, canvas.width, canvas.height);
  } finally {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }
}

export default function MerchQuantumApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewUrlsRef = useRef<string[]>([]);
  const aiLoopBusyRef = useRef<symbol | null>(null);
  const activeTemplateKeyRef = useRef("");
  const inlineFeedbackTimeoutRef = useRef<number | null>(null);

  const [provider, setProvider] = useState<ProviderChoiceId | "">("");
  const [token, setToken] = useState("");
  const [apiStatus, setApiStatus] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingApi, setLoadingApi] = useState(false);
  const [pulseConnected, setPulseConnected] = useState(false);
  const [isDisconnectArmed, setIsDisconnectArmed] = useState(false);
  const [isTokenInputFocused, setIsTokenInputFocused] = useState(false);
  const [apiShops, setApiShops] = useState<Shop[]>([]);
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [shopId, setShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [activeGridProductId, setActiveGridProductId] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateDescription, setTemplateDescription] = useState("");
  const [loadingTemplateDetails, setLoadingTemplateDetails] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("");
  const [isRoutingGridExpanded, setIsRoutingGridExpanded] = useState(true);
  const [isWorkspaceSelectionCollapsed, setIsWorkspaceSelectionCollapsed] = useState(getStoredWorkspaceSelectionCondensed());
  const [manualPrebufferOverride, setManualPrebufferOverride] = useState(false);
  const [images, setImages] = useState<Img[]>([]);
  const [queuedImages, setQueuedImages] = useState<Img[]>([]);
  const [completedImportedImages, setCompletedImportedImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [, setBatchResults] = useState<BatchResult[]>([]);
  const [attentionTarget, setAttentionTarget] = useState<"provider" | "token" | "import" | "shop" | "template" | "mode" | null>(null);
  const [editingField, setEditingField] = useState<InlineEditableField>(null);
  const [editableTitleDraft, setEditableTitleDraft] = useState("");
  const [editableDescriptionDraft, setEditableDescriptionDraft] = useState("");
  const [inlineSaveFeedback, setInlineSaveFeedback] = useState<InlineSaveFeedback | null>(null);
  const [aiAssistStatus, setAiAssistStatus] = useState("");
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [pendingTemplateSelectionIds, setPendingTemplateSelectionIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkEditGridPage, setBulkEditGridPage] = useState(0);
  const [createTemplateGridPage, setCreateTemplateGridPage] = useState(0);
  const [isCreateThumbExpandedView, setIsCreateThumbExpandedView] = useState(false);
  const [createThumbGridPage, setCreateThumbGridPage] = useState(0);
  const [, setImportStatus] = useState("");
  const [isImportingListings, setIsImportingListings] = useState(false);
  const [isSyncingImportedListings, setIsSyncingImportedListings] = useState(false);
  const [isPublishingImportedListings, setIsPublishingImportedListings] = useState(false);
  const [importedListingTitle, setImportedListingTitle] = useState("");
  const [importedListingDescription, setImportedListingDescription] = useState("");

  const providerTokenStorageKey = getProviderTokenStorageKey(provider);
  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || null;
  const resolvedProviderId = selectedProvider?.providerId || null;
  const isLiveProvider = selectedProvider?.isLive === true;
  const supportsImportedListingSync = resolvedProviderId === "printify";
  const supportsImportedPublish = resolvedProviderId === "printify";
  const supportsProviderMetadataSync = resolvedProviderId === "printify";
  const activeBatchLimit = ACTIVE_BATCH_FILES;
  const allImages = [...images, ...completedImportedImages];
  const queuedImportedImages = queuedImages.filter((img) => img.sourceType === "imported");
  const isCreateMode = workspaceMode === "create";
  const isBulkEditMode = workspaceMode === "edit";
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
  const workspaceModeLoadingLabel = isCreateMode ? "Awaiting Quantum AI Templates..." : "Awaiting Quantum AI Edit...";

  const visibleProducts = useMemo(() => {
    return productSource.filter((p) => p.shopId === shopId);
  }, [shopId, productSource]);
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

  useEffect(() => {
    if (images.length === 0) {
      if (selectedId) {
        setSelectedId("");
      }
      return;
    }

    if (!selectedId || !images.some((img) => img.id === selectedId)) {
      setSelectedId(images[0]?.id || "");
    }
  }, [images, selectedId]);

  const selectedProduct = useMemo(
    () => productSource.find((product) => product.id === productId && product.shopId === shopId) || productSource.find((product) => product.id === productId) || null,
    [productId, productSource, shopId]
  );
  const activeGridProduct = useMemo(
    () => visibleProducts.find((product) => product.id === activeGridProductId) || null,
    [activeGridProductId, visibleProducts]
  );
  const readyCount = images.filter((img) => getResolvedItemStatus(img) === "ready").length;
  const processingCount = images.filter((img) => getResolvedItemStatus(img) === "pending").length;
  const draftReadyCount = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready").length;
  const hasAnyLoadedImages = allImages.length > 0 || queuedImages.length > 0;
  const isWorkspaceConfigured = isCreateMode ? connected && !!shopId && !!template : hasWorkspaceRoute;
  const canSubmitProviderConnection = Boolean(provider && isLiveProvider && token.trim() && !loadingApi && !connected);
  const isQuantumAiGenerating = processingCount > 0;
  const uploadDisabled = !isCreateMode || !isWorkspaceConfigured || draftReadyCount === 0 || isRunningBatch || isQuantumAiGenerating;
  const canShowDetailWorkspace = hasWorkspaceRoute;
  const canShowWorkspacePreview = isCreateMode
    ? canShowDetailWorkspace && (!!activeGridProduct || hasAnyLoadedImages)
    : canShowDetailWorkspace && (hasAnyLoadedImages || !!selectedImage || !!activeGridProduct);
  const canShowDetailPanel = canShowWorkspacePreview && hasAnyLoadedImages && !!selectedImage;
  const showPreviewStats = hasAnyLoadedImages;
  const showWorkspaceModeLoader = hasWorkspaceRoute && loadingProducts && visibleProducts.length === 0;
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
  const workspaceGridHeading = isBulkEditMode
    ? (
      <>
        <span className="text-[#7F22FE]">Merch</span>{" "}
        Quantum: Choose listings to edit
      </>
    )
    : (
      <>
        <span className="text-[#7F22FE]">Merch</span>{" "}
        Quantum: Choose product template
      </>
    );
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
  const importedProductIds = useMemo(
    () => new Set([...allImages, ...queuedImages].map((img) => img.providerProductId).filter((value): value is string => !!value)),
    [allImages, queuedImages]
  );
  const hasBulkEditStagedSelections = pendingTemplateSelectionIds.length > 0;
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
  const bulkEditVisibleProductIds = bulkEditVisibleProducts.map((product) => product.id);
  const hasAllBulkEditVisibleSelections =
    bulkEditVisibleProductIds.length > 0
    && pendingTemplateSelectionIds.length === bulkEditVisibleProductIds.length
    && bulkEditVisibleProductIds.every((id) => pendingTemplateSelectionIds.includes(id));
  const bulkEditVisibleRangeLabel = visibleProducts.length > 0
    ? `${safeBulkEditPage * bulkEditPageSize + 1}-${Math.min(visibleProducts.length, safeBulkEditPage * bulkEditPageSize + bulkEditVisibleProducts.length)} of ${visibleProducts.length}`
    : "0 of 0";
  const workspaceLoadingPlaceholderItems = useMemo<Product[]>(
    () =>
      Array.from({ length: isWorkspaceSelectionCollapsed ? 5 : selectionPageSize }, (_, index) => ({
        id: `workspace-loading-placeholder-${workspaceMode || "mode"}-${index}`,
        title: `Loading placeholder ${index + 1}`,
        type: "Template",
        shopId,
        description: "",
        previewUrl: "",
      })),
    [isWorkspaceSelectionCollapsed, selectionPageSize, shopId, workspaceMode]
  );
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
  const workspaceModePickerLabel = isCreateMode ? "Bulk Create" : isBulkEditMode ? "Bulk Edit" : "Edit mode";

  const bulkEditPublishDisabled =
    !isBulkEditMode
    || approvedImportedItems.length === 0
    || isSyncingImportedListings
    || isPublishingImportedListings
    || isQuantumAiGenerating
    || (!supportsImportedListingSync && !supportsImportedPublish);
  const descriptionActionDisabled = isCreateMode ? uploadDisabled : bulkEditPublishDisabled;
  const triggerDescriptionAction = () => {
    if (isCreateMode) {
      void runDraftBatch();
      return;
    }
    void runBulkEditPublishAction();
  };
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

  function getProviderRoute(path: "connect" | "disconnect" | "products" | "product" | "batch-create") {
    return `/api/providers/${path}`;
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

  useEffect(() => {
    if (!providerTokenStorageKey) {
      setToken("");
      return;
    }

    const storedToken = window.localStorage.getItem(providerTokenStorageKey) || "";
    setToken(storedToken);
    setApiStatus("");
    setIsTokenInputFocused(false);
  }, [providerTokenStorageKey]);

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
    const derivedWords = [...activeTitleHint.split(/\s+/), ...descriptionParagraphs.flatMap((paragraph) => paragraph.split(/\s+/))]
      .map((word) => word.replace(/[^A-Za-z0-9'-]+/g, "").trim())
      .filter((word) => word.length >= 3)
      .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
      .map((word) => (word.toLowerCase() === word ? word : word.toLowerCase()));
    const candidateTags = normalizeTagsFromPayload(image.tags);
    const fallbackTags = normalizeTagsFromPayload(derivedWords).slice(0, LISTING_LIMITS.tagCount);
    const tagsForHints = (candidateTags.length > 0 ? candidateTags : fallbackTags).filter((tag) => {
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    const hints: string[] = [];
    if (activeTitleHint) hints.push(`Title anchor: ${activeTitleHint}`);
    if (descriptionParagraphs.length > 0) hints.push(`Buyer-facing lead: ${descriptionParagraphs.join(" | ")}`);
    if (tagsForHints.length > 0) hints.push(`Preserve these search tags if they still fit: ${tagsForHints.join(", ")}`);
    return hints;
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
        ? data.reasonFlags.filter((flag: unknown): flag is string => typeof flag === "string")
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
        ? { title: "ready", description: "ready", tags: "ready" }
        : { title: "error", description: "error", tags: "error" };
      const status: ItemStatus = publishReady ? "ready" : "error";
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
                    ? { ...img.aiFieldStates, title: visibleTitle ? "ready" : "error" }
                    : targetField === "description"
                      ? { ...img.aiFieldStates, description: visibleDescription ? "ready" : "error" }
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
      const message = formatApiError("listingGeneration", error, "[MerchQuantum] AI listing failed");
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
          const nextBuyerDescription = field === "description" ? nextValue : currentBuyerDescription;
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
      setInlineFeedbackState(field, "error", formatApiError("metadataSave", error, "[MerchQuantum] metadata save failed"));
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
    if (!shopId) {
      setApiProducts([]);
      setProductId("");
      setActiveGridProductId("");
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

    if (activeGridProductId && !visibleProducts.some((product) => product.id === activeGridProductId)) {
      setActiveGridProductId("");
    }
  }, [shopId, visibleProducts, productId, activeGridProductId]);

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
    setIsWorkspaceSelectionCollapsed(getStoredWorkspaceSelectionCondensed());
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
    setIsCreateThumbExpandedView(false);
    setCreateThumbGridPage(0);
    setBatchResults([]);
    setRunStatus("");
    setImportStatus("");
    setAiAssistStatus("");
    setManualPrebufferOverride(false);
  }

  function handleWorkspaceModeChange(nextMode: WorkspaceMode) {
    setWorkspaceMode(nextMode);
    setIsRoutingGridExpanded(!nextMode);
    setIsWorkspaceSelectionCollapsed(getStoredWorkspaceSelectionCondensed());
    setProductId("");
    setActiveGridProductId("");
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
    setIsWorkspaceSelectionCollapsed(getStoredWorkspaceSelectionCondensed());
    setProductId("");
    setActiveGridProductId("");
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
      setApiStatus(formatApiError("providerLoad", error, "[MerchQuantum] product load failed"));
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

      if (providerTokenStorageKey) {
        window.localStorage.setItem(providerTokenStorageKey, submittedToken);
      }
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
      logErrorToConsole("[MerchQuantum] provider connect failed", error);
      resetProviderState(false);
      setApiStatus(getUserFacingErrorMessage("connection"));
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
      if (providerTokenStorageKey) {
        window.localStorage.removeItem(providerTokenStorageKey);
      }
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
      const baseStatus = formatApiError("providerLoad", error, "[MerchQuantum] template load failed");
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
    setActiveGridProductId(sourceId);
    const nextSelections = options?.shiftKey && lastSelectedIndex !== null
      ? normalizeSelectionIds([...pendingTemplateSelectionIds, ...getSelectionRangeIds(lastSelectedIndex, index)])
      : pendingTemplateSelectionIds.includes(sourceId)
        ? pendingTemplateSelectionIds.filter((entry) => entry !== sourceId)
        : normalizeSelectionIds([...pendingTemplateSelectionIds, sourceId]);

    setPendingTemplateSelectionIds(nextSelections);
    setLastSelectedIndex(index);
  }

  async function handleCreateTemplateSelection(sourceId: string, index: number) {
    setActiveGridProductId(sourceId);
    setLastSelectedIndex(index);
    await commitTemplateSelections(selectedImportIds.includes(sourceId) ? [] : [sourceId]);
  }

  async function commitTemplateSelections(sourceIds: string[]) {
    const normalizedSelections = normalizeSelectionIds(sourceIds);
    const nextSelections = isCreateMode ? normalizedSelections.slice(0, 1) : normalizedSelections;
    const selectionChanged = !selectionsMatch(nextSelections, selectedImportIds);

    setSelectedImportIds(nextSelections);
    setPendingTemplateSelectionIds(nextSelections);
    if (isCreateMode) {
      setActiveGridProductId(nextSelections[0] || "");
    }
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

  function buildImportedImageSeed(record: ImportedListingRecord, file: File, preview: string, artworkBounds: ArtworkBounds): Img {
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
      preview,
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
      templateReferenceOverride: record.id,
      productFamilyOverride: resolveProductFamily(record.title, staticSpecBlock),
      importedArtwork: record.artwork,
      originalListingTitle: record.title,
      originalListingDescription: buyerDescription,
      syncState: "idle",
      syncMessage: "",
    };
  }

  async function importSelectedListings(selectionIds: string[], options: { replaceExisting?: boolean } = {}) {
    if (!resolvedProviderId || !shopId || selectionIds.length === 0) {
      setImportStatus("Select at least one provider listing to import.");
      return;
    }

    setIsImportingListings(true);
    try {
      const response = await fetchWithTimeout(
        "/api/providers/import-listings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: resolvedProviderId,
            shopId,
            productIds: selectionIds,
          }),
        },
        60000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `Listing import failed with status ${response.status}.`);

      const importedRecords: ImportedListingRecord[] = Array.isArray(data?.products)
        ? data.products.map((record: any) => ({
            id: String(record?.id || ""),
            storeId: String(record?.storeId || shopId),
            title: String(record?.title || "Recovered Artwork"),
            description: String(record?.description || ""),
            tags: normalizeTagsFromPayload(record?.tags),
            templateDescription: String(record?.templateDescription || ""),
            artwork: record?.artwork && typeof record.artwork === "object"
              ? {
                  assetId: record.artwork.assetId ? String(record.artwork.assetId) : undefined,
                  fileName: String(record.artwork.fileName || record.title || "artwork"),
                  url: String(record.artwork.url || ""),
                  previewUrl: record.artwork.previewUrl ? String(record.artwork.previewUrl) : undefined,
                  contentType: record.artwork.contentType ? String(record.artwork.contentType) : undefined,
                  width: Number.isFinite(record.artwork.width) ? Number(record.artwork.width) : undefined,
                  height: Number.isFinite(record.artwork.height) ? Number(record.artwork.height) : undefined,
                }
              : null,
          }))
        : [];

      let skippedMissingArtwork = 0;
      let skippedFailedRescue = 0;
      const duplicateIds: string[] = [];
      let skippedByLimit = 0;
      const rescued: Img[] = [];

      for (const record of importedRecords) {
        if (!record.id || importedProductIds.has(record.id)) {
          if (record.id) duplicateIds.push(record.id);
          continue;
        }
        if (!record.artwork?.url) {
          skippedMissingArtwork += 1;
          continue;
        }
        if (rescued.length >= IMPORT_QUEUE_LIMIT) {
          skippedByLimit += 1;
          continue;
        }

        try {
          const artworkResponse = await fetchWithTimeout(record.artwork.url);
          if (!artworkResponse.ok) throw new Error(`Artwork download failed with status ${artworkResponse.status}.`);
          const blob = await artworkResponse.blob();
          const fileName = record.artwork.fileName || `${record.title || record.id}.png`;
          const file = new File([blob], fileName, { type: blob.type || record.artwork.contentType || "image/png" });
          const preview = createPreviewObjectUrl(file);
          const bounds = await analyzeArtworkBounds(file);
          rescued.push(buildImportedImageSeed(record, file, preview, bounds));
        } catch (error) {
          skippedFailedRescue += 1;
          logErrorToConsole("[MerchQuantum] artwork rescue failed", error);
        }
      }

      let queuedImportedAfterImport = queuedImportedImages.length;
      if (rescued.length > 0) {
        const { active: mergedActive, queued: mergedQueued } = options.replaceExisting
          ? appendToActiveBatch([], [], rescued, activeBatchLimit)
          : appendToActiveBatch(images, queuedImages, rescued, activeBatchLimit);
        if (options.replaceExisting) {
          setCompletedImportedImages([]);
        }
        setImages(mergedActive);
        setQueuedImages(mergedQueued);
        setSelectedId(mergedActive[0]?.id || "");
        queuedImportedAfterImport = mergedQueued.filter((img) => img.sourceType === "imported").length;
      }

      const summary: string[] = [];
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
      setImportStatus(formatApiError("listingImport", error, "[MerchQuantum] listing import failed"));
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
        const message = formatApiError("metadataSave", error, "[MerchQuantum] metadata sync failed");
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
              syncMessage: formatApiError(
                "listingPublish",
                errorMessages.get(img.providerProductId) || null,
                "[MerchQuantum] publish listing failed"
              ),
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
      setImportStatus(formatApiError("listingPublish", error, "[MerchQuantum] publish listings failed"));
    } finally {
      setIsPublishingImportedListings(false);
    }
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
          const errorMessage = formatApiError("draftCreate", error, "[MerchQuantum] draft create failed");
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
    <main className="box-border flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto overflow-x-hidden bg-[#0d1117] p-6 font-sans text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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
            <div className={`relative self-start min-w-0 ${getRoutingFieldGlowClass("provider")}`}>
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
              className={`min-w-0 ${getRoutingFieldGlowClass("token")}`}
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
        </Box>
      </div>
    ) : null}

        {showWorkspaceModeLoader ? (
          <div className="relative">
            <div className="pointer-events-none opacity-0">
              <ProductGrid
                heading={workspaceGridHeading}
                items={workspaceLoadingPlaceholderItems}
                selectedIds={[]}
                importedProductIds={importedProductIds}
                highlighted={false}
                collapsed={isWorkspaceSelectionCollapsed}
                rangeLabel="0 of 0"
                page={0}
                pageSize={selectionPageSize}
                totalPages={1}
                loading={false}
                headerAccessory={null}
                onToggleCollapsed={() => setIsWorkspaceSelectionCollapsed((current) => !current)}
                onSelectAll={isBulkEditMode ? () => undefined : undefined}
                selectAllLabel={isBulkEditMode ? "Select All" : undefined}
                footerLabel="0 of 0"
                onItemActivate={() => undefined}
                onPreviousPage={() => undefined}
                onNextPage={() => undefined}
              />
            </div>
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center justify-center gap-3 text-center font-sans text-sm font-normal text-white">
                <QuantOrbLoader />
                <span>{workspaceModeLoadingLabel}</span>
              </div>
            </div>
          </div>
        ) : workspaceMode && visibleProducts.length > 0 ? (
          <>
            <ProductGrid
              heading={workspaceGridHeading}
              items={isCreateMode ? createTemplateVisibleProducts : bulkEditVisibleProducts}
              selectedIds={isCreateMode ? selectedImportIds : pendingTemplateSelectionIds}
              activeId={activeGridProductId}
              importedProductIds={importedProductIds}
              highlighted={false}
              collapsed={isWorkspaceSelectionCollapsed}
              rangeLabel={isCreateMode ? createTemplateVisibleRangeLabel : bulkEditVisibleRangeLabel}
              page={isCreateMode ? safeCreateTemplatePage : safeBulkEditPage}
              pageSize={selectionPageSize}
              totalPages={isCreateMode ? createTemplateTotalPages : bulkEditTotalPages}
              loading={false}
              headerAccessory={null}
              onToggleCollapsed={() => setIsWorkspaceSelectionCollapsed((current) => !current)}
              onSelectAll={isBulkEditMode
                ? () => {
                    if (hasAllBulkEditVisibleSelections) {
                      void commitTemplateSelections([]);
                      return;
                    }
                    void commitTemplateSelections(bulkEditVisibleProductIds);
                  }
                : undefined}
              selectAllLabel={isBulkEditMode ? (hasAllBulkEditVisibleSelections ? "Deselect All" : "Select All") : undefined}
              footerLabel={isCreateMode ? createTemplateVisibleRangeLabel : bulkEditVisibleRangeLabel}
              onItemActivate={(product, index, event) => {
                if (isCreateMode) {
                  void handleCreateTemplateSelection(product.id, index);
                  return;
                }
                handleBulkEditThumbnailSelection(product.id, index, { shiftKey: "shiftKey" in event ? Boolean(event.shiftKey) : false });
              }}
              onPreviousPage={() => {
                if (isCreateMode) {
                  setCreateTemplateGridPage((current) => Math.max(0, current - 1));
                  return;
                }
                setBulkEditGridPage((current) => Math.max(0, current - 1));
              }}
              onNextPage={() => {
                if (isCreateMode) {
                  setCreateTemplateGridPage((current) => Math.min(createTemplateTotalPages - 1, current + 1));
                  return;
                }
                setBulkEditGridPage((current) => Math.min(bulkEditTotalPages - 1, current + 1));
              }}
              footerActions={isBulkEditMode ? (
                <button
                  type="button"
                  onClick={() => { void commitTemplateSelections(pendingTemplateSelectionIds); }}
                  disabled={!hasBulkEditStagedSelections || isImportingListings}
                  className="inline-flex items-center gap-2 text-sm font-normal text-[#7F22FE] transition hover:text-[#9550FF] disabled:cursor-not-allowed disabled:text-slate-200"
                >
                  {isImportingListings ? <QuantOrbLoader /> : null}
                  <span>Load Selected</span>
                </button>
              ) : null}
            />

            {canShowWorkspacePreview ? (
              <>
                <div className="mt-3">
                  <div className="space-y-3" onPointerDownCapture={() => nudgeWorkflow(true)}>
                    <div className="relative rounded-[24px] transition-all">
                      <div className="grid grid-cols-1 items-stretch gap-3">
                        <div className="flex h-full min-w-0 w-full flex-col gap-3">
                          {isCreateMode ? (
                            <div
                              role={isWorkspaceConfigured ? "button" : undefined}
                              tabIndex={isWorkspaceConfigured ? 0 : -1}
                              onClick={openArtworkPicker}
                              onKeyDown={(e) => {
                                if (!isWorkspaceConfigured) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openArtworkPicker();
                                }
                              }}
                              className={`group rounded-[22px] border bg-[#0b1022] px-4 pb-4 pt-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/45 ${
                                isWorkspaceConfigured
                                  ? "cursor-pointer border-slate-700/80 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_30px_90px_-52px_rgba(2,6,23,0.95)] hover:border-[#7F22FE]/45 hover:shadow-[0_0_0_1px_rgba(127,34,254,0.25),0_34px_100px_-54px_rgba(10,16,42,0.98)]"
                                  : "cursor-default border-slate-800/70 shadow-[0_26px_80px_-56px_rgba(2,6,23,0.94)]"
                              } ${attentionTarget === "import" ? "ring-2 ring-[#7F22FE]/65 shadow-[0_0_0_1px_rgba(127,34,254,0.28),0_0_0_22px_rgba(127,34,254,0.08)] animate-pulse" : ""}`}
                            >
                              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                              <div className="relative flex flex-col gap-4">
                                <div className="rounded-2xl border border-slate-700 bg-[#090f23] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                  <div className="grid grid-cols-[1fr_auto] items-start gap-4 text-sm text-white">
                                    <div className="min-w-0">
                                      <div className="truncate text-[13px] font-semibold tracking-tight text-slate-100">
                                        Drop Images Here
                                      </div>
                                      <p className="mt-2 text-[11px] font-medium tracking-[0.02em] text-slate-200/90">
                                        50 per batch • 500 max queue
                                      </p>
                                    </div>
                                    <div className="justify-self-end text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 transition-colors duration-300 group-hover:text-white/80">
                                      Browse
                                    </div>
                                  </div>
                                  <div className="mt-4 h-[2px] rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.18),rgba(59,130,246,0.95),rgba(59,130,246,0.22))] shadow-[0_0_18px_rgba(59,130,246,0.42)]" />
                                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-slate-100">
                                    <span>Loaded: {images.length} | Queue: {queuedImages.length}</span>
                                    {hasAnyLoadedImages ? (
                                      <button
                                        type="button"
                                        className="pointer-events-auto text-slate-100 transition hover:text-white"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          clearPreviewWorkspace();
                                        }}
                                      >
                                        Clear
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {showPreviewStats ? (
                            <div className="min-w-0">
                              <div className="grid grid-cols-1 gap-4">
                                <div className="grid grid-cols-1 gap-2">
                                  <div className="grid grid-cols-5 gap-2">
                                    {visibleCreateThumbnails.map((img) => {
                                      const status = getResolvedItemStatus(img);
                                      const statusIndicator =
                                        status === "ready"
                                          ? { tone: "ready" as const, direction: "up" as const }
                                          : status === "error"
                                            ? { tone: "error" as const, direction: "down" as const }
                                            : null;
                                      return (
                                        <div key={img.id} className="relative">
                                          <SmartThumbnail
                                            src={img.preview}
                                            alt={img.name}
                                            className={`rounded-[10px] border ${status === "ready" ? "border-[#00BC7D]/45" : status === "error" ? "border-[#FF2056]/45" : "border-slate-700"}`}
                                          >
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
                                          </SmartThumbnail>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
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
                            </div>
                          </div>
                          ) : null}
                        </div>
                        {canShowDetailPanel ? (
                        <div className="flex min-w-0 flex-col space-y-3">
                          <div className="flex flex-col gap-4 w-full">
                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-5 tracking-tight text-slate-200">
                                  <span className="inline-flex items-center text-sm font-semibold">
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
                                      <div className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center gap-2 text-[10px] font-medium text-slate-100">
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
                                        <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                          <span className="min-w-0 flex-1 truncate font-sans text-sm font-normal text-white">
                                            {detailTitle || <span className="font-sans text-sm font-normal text-white">Click to add a final title.</span>}
                                          </span>
                                        </div>
                                      )}
                                      <div className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center gap-2 text-[10px] font-medium text-slate-100">
                                        <span>{(detailTitle || "").trim().length}/{LISTING_LIMITS.titleMax}</span>
                                      </div>
                                    </button>
                                  )}
                                </div>
                                {titleFeedback ? (
                                  <p className={`text-xs ${titleFeedback.tone === "error" ? "text-[#FF8AA5]" : titleFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-100"}`}>
                                    {titleFeedback.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-5 tracking-tight text-slate-200">
                                  <span className="inline-flex min-w-0 items-center text-sm font-semibold">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 truncate text-white">AI Description</span>
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className={`rounded-xl border bg-[#020616] px-3 py-2.5 transition ${DETAIL_DATA_TEXT_CLASSES} ${canEditDetailDescription ? "border-slate-700 hover:border-slate-500 focus-within:border-[#7F22FE] focus-within:ring-2 focus-within:ring-[#7F22FE]/30" : "border-slate-700"}`}>
                                  <div className="flex">
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
                                            className={`min-h-[112px] w-full resize-none overflow-hidden bg-transparent px-0 py-0 text-left outline-none transition placeholder:text-slate-200 ${DETAIL_DATA_TEXT_CLASSES}`}
                                          />
                                        </div>
                                        {detailTemplateSpecBlock ? (
                                          <>
                                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                            <div className={`max-h-24 w-full overflow-y-auto whitespace-pre-wrap text-left [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${DETAIL_DATA_TEXT_CLASSES}`}>
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
                                          className={`group relative flex min-h-[112px] w-full items-start bg-transparent px-0 py-0 text-left transition ${DETAIL_DATA_TEXT_CLASSES} ${canEditDetailDescription ? "cursor-text focus-visible:outline-none" : "cursor-default"}`}
                                        >
                                          {shouldAwaitQuantumDescription ? (
                                            <div className={`flex w-full items-center justify-start gap-2 text-left ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              <QuantOrbLoader />
                                              <span>{QUANTUM_DESCRIPTION_AWAITING_TEXT}</span>
                                            </div>
                                          ) : (
                                            <div className="flex w-full min-w-0 items-start justify-between gap-3">
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
                                            <div className={`max-h-24 w-full overflow-y-auto whitespace-pre-wrap text-left [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              {detailTemplateSpecBlock}
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {descriptionFeedback ? (
                                  <p className={`text-xs ${descriptionFeedback.tone === "error" ? "text-[#FF8AA5]" : descriptionFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-100"}`}>
                                    {descriptionFeedback.message}
                                  </p>
                                ) : null}
                                {aiAssistStatus && selectedImage ? (
                                  <p className={`text-xs ${canManualRescueSelectedImage ? "text-slate-100" : "text-slate-100"}`}>
                                    {aiAssistStatus}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="pt-0">
                            <div className="flow-root w-full text-center mt-4">
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
                        ) : null}
                    </div>
                    </div>
                </div>
              </div>
              </>
            ) : null}
          </>
        ) : null}
        </div>
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
