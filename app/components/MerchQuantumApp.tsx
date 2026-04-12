'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PROVIDER_OPTIONS } from "../../lib/providers/client-options";

const APP_TAGLINE = "Bulk product creation, simplified";
const ACTIVE_BATCH_FILES = 50;
const CONNECTED_TOTAL_BATCH_FILES = 300;
const DEMO_TOTAL_BATCH_FILES = 5;
const FIXED_TAG_COUNT = 13;

type ProviderId =
  | "printify"
  | "printful"
  | "gelato"
  | "gooten"
  | "apliiq"
  | "spod"
  | "prodigi"
  | "lulu_direct";

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

type ReviewStatus = "pending" | "ready" | "error";

type AiListingDraft = {
  title: string;
  leadParagraphs: string[];
  model: string;
  confidence: number;
  templateReference: string;
  reasonFlags: string[];
  source: "gemini" | "fallback";
  grade: "green" | "orange" | "red";
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
  status: ReviewStatus;
  statusReason: string;
  aiProcessing?: boolean;
  processedTemplateKey?: string;
  artworkBounds?: ArtworkBounds;
  aiDraft?: AiListingDraft;
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

const PROVIDERS = PROVIDER_OPTIONS;

const FALLBACK_SHOPS: Shop[] = [
  { id: "451293", title: "Primary Printify Shop" },
  { id: "451294", title: "Secondary Printify Shop" },
];

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "12345ABCDE",
    title: "Example Template Product 12345ABCDE",
    type: "Apparel",
    shopId: "451293",
  },
  {
    id: "67890FGHIJ",
    title: "Example Template Product 67890FGHIJ",
    type: "Accessory",
    shopId: "451294",
  },
];

const DEFAULT_PLACEMENT_GUIDE: PlacementGuide = {
  position: "front",
  width: 3153,
  height: 3995,
  source: "fallback",
};

const AI_MODEL_LABEL = "Quantum AI";
const AI_TITLE_MIN_CHARS = 45;
const AI_TITLE_MAX_CHARS = 120;
const AI_LEAD_MIN_CHARS = 220;
const AI_LEAD_MAX_CHARS = 380;
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
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
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

  const headers = new Set([
    "Product features",
    "Care instructions",
    "Size chart",
    "Product details",
    "Materials",
    "Sizing",
    "Dimensions",
  ]);

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

    if (headers.has(header) && out.length && out[out.length - 1] !== "") out.push("");
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
  const headers = new Set([
    "Product features",
    "Care instructions",
    "Size chart",
    "Product details",
    "Materials",
    "Sizing",
    "Dimensions",
  ]);

  const introParagraphs: string[] = [];
  const sections: TemplateSection[] = [];
  let currentSection: TemplateSection | null = null;

  const lines = formattedDescription
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalizedHeader = line.replace(/:$/, "");

    if (headers.has(normalizedHeader)) {
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

function buildTemplateContext(templateDescription: string) {
  const formatted = formatTemplateDescription(templateDescription);
  const parsed = parseTemplateDescription(formatted);
  return parsed.introParagraphs.join(" ").replace(/\s+/g, " ").trim();
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
  const safe = safeTitle(title, title);
  const family = resolveProductFamily(safe, templateDescription);
  const familyLabel = getFamilyLabel(family);
  const themePhrase = detectThemePhrase(safe);
  const trimmedTitle = trimTitleAtWordBoundary(safe, AI_TITLE_MAX_CHARS) || safe;

  const sentenceA = (() => {
    switch (family) {
      case "t-shirt":
        return `${trimmedTitle} puts the design front and center with a ${themePhrase} graphic tee presentation that reads clearly at first glance.`;
      case "hoodie":
        return `${trimmedTitle} gives the artwork a ${themePhrase} hoodie presentation with a strong front-facing graphic focus.`;
      case "sweatshirt":
        return `${trimmedTitle} frames the artwork as a ${themePhrase} sweatshirt with a clear, easy-to-read statement graphic.`;
      case "tank top":
        return `${trimmedTitle} turns the design into a ${themePhrase} tank top with a crisp graphic presence that stays easy to recognize.`;
      default:
        return `${trimmedTitle} presents the artwork as a ${themePhrase} ${familyLabel} with a clean, readable graphic focus.`;
    }
  })();

  const sentenceB = (() => {
    switch (family) {
      case "t-shirt":
        return `It is a strong fit for casual rotation, gift-ready assortments, and apparel shoppers who want a shirt that communicates the design theme quickly without extra explanation.`;
      case "hoodie":
        return `It works well for layered everyday wear, cooler-season drops, and gift-ready assortments that need a design-led hoodie with immediate visual clarity.`;
      case "sweatshirt":
        return `It fits naturally into comfort-led collections, seasonal gifting, and everyday wardrobe picks that benefit from a design buyers can recognize right away.`;
      case "tank top":
        return `It fits naturally into warm-weather collections, gym-adjacent casual wear, and gift-ready assortments that benefit from a direct, recognizable graphic statement.`;
      case "hat":
        return `It works well for accessory-led drops, everyday styling, and gift-ready picks where the design needs to stay visible in a compact format.`;
      case "drinkware":
        return `It gives the design an easy gift-ready angle and a practical everyday use case, making it a flexible choice for buyers who want both function and personality.`;
      case "candle":
        return `It adds an easy gift-ready angle and a calm lifestyle feel, making the design feel more intentional in home, self-care, or seasonal collections.`;
      case "bath-body":
        return `It gives the design a polished personal-care angle that feels giftable, approachable, and easy to understand in boutique-style assortments.`;
      case "home-kitchen":
        return `It fits naturally into home-forward and gift-ready assortments where the artwork needs to read quickly and still feel polished in daily use.`;
      case "wall-art":
        return `It works well for design-led home decor collections and gift-ready assortments where the artwork needs to carry the product story with minimal explanation.`;
      case "sticker":
        return `It is a strong fit for impulse-friendly add-ons and gift-ready accessory collections where the design needs to feel immediate, fun, and easy to understand.`;
      case "bag":
        return `It gives the artwork a functional everyday carry angle that still feels design-led and easy to recognize in gift-ready accessory assortments.`;
      case "accessory":
        return `It works well for smaller add-on products and gift-ready assortments where the design needs to stay direct, clear, and visually memorable.`;
      case "footwear":
        return `It gives the design a wearable lifestyle angle that feels bold, practical, and easy to understand in gift-ready fashion assortments.`;
      default:
        return `It gives the design a clear buyer-facing story with enough visual direction to feel giftable, approachable, and easy to place in everyday collections.`;
    }
  })();

  return normalizeAiLeadParagraphs([sentenceA, sentenceB]);
}

function buildDescription(title: string, templateDescription: string, leadParagraphs: string[]) {
  const safe = safeTitle(title, title);
  const { introParagraphs, sections } = parseTemplateDescription(formatTemplateDescription(templateDescription));
  const lead = normalizeAiLeadParagraphs(leadParagraphs);
  const parts: string[] = [];

  if (lead.length) {
    parts.push(lead.join("\n\n"));
  }

  const bodySource = dedupeParagraphs(introParagraphs);
  if (bodySource.length) {
    parts.push(bodySource.join("\n\n"));
  }

  for (const section of sections) {
    const lines: string[] = [section.heading];
    if (section.paragraphs.length) lines.push(...section.paragraphs);
    if (section.bullets.length) lines.push(...section.bullets.map((bullet) => `- ${bullet}`));
    parts.push(lines.join("\n"));
  }

  return parts.filter(Boolean).join("\n\n");
}

function splitDescriptionIntoParts(description: string) {
  const trimmed = description.trim();
  if (!trimmed) {
    return { leadParagraphs: [] as string[], templateBlock: "" };
  }

  const rawBlocks = trimmed
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const headerBlocks: string[] = [];
  const leadParagraphs: string[] = [];
  let templateStarted = false;

  for (const block of rawBlocks) {
    const firstLine = block.split("\n")[0]?.trim().replace(/:$/, "") || "";
    const isHeaderBlock = [
      "Product features",
      "Care instructions",
      "Size chart",
      "Product details",
      "Materials",
      "Sizing",
      "Dimensions",
    ].includes(firstLine);

    if (templateStarted || isHeaderBlock) {
      templateStarted = true;
      headerBlocks.push(block);
    } else {
      leadParagraphs.push(block);
    }
  }

  return {
    leadParagraphs,
    templateBlock: headerBlocks.join("\n\n"),
  };
}

function buildTags(title: string, description: string, count = FIXED_TAG_COUNT) {
  const combined = `${title} ${description}`.toLowerCase();
  const words = combined
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  const counts = new Map<string, number>();

  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([word]) => word)
    .concat(Array.from({ length: count }, (_, index) => `tag-${index + 1}`))
    .slice(0, count);
}

function htmlToEditableText(value: string) {
  return stripHtml(value)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseResponsePayload(response: Response) {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: text };
    }
  });
}

const REQUEST_TIMEOUT_MS = 45000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function formatApiError(message: string) {
  if (!message) return "Something went wrong. Please try again.";
  const lower = message.toLowerCase();

  if (lower.includes("static host")) {
    return "Live provider connection is not available in this environment. The request reached a static host instead of the backend API route.";
  }
  if (lower.includes("timed out")) {
    return "The request timed out before the provider responded. Please try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "MerchQuantum could not reach the server. Please check your connection and try again.";
  }

  return message;
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetchWithTimeout(url, init);
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  return { response, data: data as Record<string, unknown> };
}

async function requestAiListingDraft({
  title,
  imageDataUrl,
  templateContext,
  productFamily,
}: {
  title: string;
  imageDataUrl: string;
  templateContext: string;
  productFamily: ProductFamily;
}): Promise<AiListingDraft> {
  const { response, data } = await requestJson("/api/ai/listing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      imageDataUrl,
      templateContext,
      productFamily,
    }),
  });

  if (!response.ok) {
    throw new Error(String(data?.error || `Quantum AI request failed with status ${response.status}.`));
  }

  const leadParagraphs = Array.isArray(data?.leadParagraphs)
    ? normalizeAiLeadParagraphs((data.leadParagraphs as unknown[]).map((entry) => String(entry || "")))
    : [];

  return {
    title: String(data?.title || title).trim() || title,
    leadParagraphs,
    model: String(data?.model || AI_MODEL_LABEL),
    confidence: typeof data?.confidence === "number" ? data.confidence : 0.65,
    templateReference: String(data?.templateReference || ""),
    reasonFlags: Array.isArray(data?.reasonFlags) ? (data.reasonFlags as unknown[]).map((entry) => String(entry || "")).filter(Boolean) : [],
    source: data?.source === "gemini" || data?.source === "fallback" ? data.source : "fallback",
    grade: data?.grade === "green" || data?.grade === "orange" || data?.grade === "red" ? data.grade : "orange",
  };
}

function compareByStatus(a: Img, b: Img) {
  const order: Record<ReviewStatus, number> = {
    ready: 0,
    error: 1,
    pending: 2,
  };

  return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
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

function Button({
  children,
  className = "",
  tone = "primary",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "ghost";
}) {
  const base = "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
  const tones = tone === "ghost"
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
  label: string;
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

function getStatusTone(status: ReviewStatus) {
  switch (status) {
    case "ready":
      return "bg-[#00BC7D] ring-[#00BC7D]/35";
    case "error":
      return "bg-[#FF2056] ring-[#FF2056]/35";
    default:
      return "bg-slate-500 ring-slate-500/35";
  }
}

function getStatusIndicatorClass(status: ReviewStatus) {
  return `h-2 w-2 rounded-full ring-2 ${getStatusTone(status)}`;
}

function getLoadingIndicatorClass() {
  return "h-2 w-2 rounded-full ring-2 bg-[#7F22FE] ring-[#7F22FE]/35";
}

function getStatusSortValue(status: ReviewStatus) {
  switch (status) {
    case "ready":
      return 0;
    case "error":
      return 1;
    default:
      return 2;
  }
}

export default function MerchQuantumApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewUrlsRef = useRef<string[]>([]);
  const aiLoopBusyRef = useRef<symbol | null>(null);
  const activeTemplateKeyRef = useRef("");

  const [provider, setProvider] = useState<ProviderId | "">("");
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
  const [template, setTemplate] = useState<Template | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [queuedImages, setQueuedImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [attentionTarget, setAttentionTarget] = useState<"provider" | "token" | "import" | "shop" | "template" | null>(null);

  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || null;
  const isLiveProvider = selectedProvider?.isLive || false;
  const totalBatchLimit = connected ? CONNECTED_TOTAL_BATCH_FILES : DEMO_TOTAL_BATCH_FILES;
  const activeBatchLimit = connected ? ACTIVE_BATCH_FILES : DEMO_TOTAL_BATCH_FILES;
  const availableShops = connected && isLiveProvider ? apiShops : [];
  const productSource = connected && isLiveProvider ? apiProducts : [];
  const templateKey = useMemo(() => `${template?.reference || "no-template"}::${templateDescription.trim()}`, [template?.reference, templateDescription]);
  const templateReadyForAi = !!template && !!templateDescription.trim() && !loadingTemplateDetails;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productSource.filter(
      (p) =>
        p.shopId === shopId &&
        (!q || p.title.toLowerCase().includes(q) || p.type.toLowerCase().includes(q))
    );
  }, [shopId, search, productSource]);

  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => {
      const statusDelta = getStatusSortValue(a.status) - getStatusSortValue(b.status);
      if (statusDelta !== 0) return statusDelta;
      return a.name.localeCompare(b.name);
    });
  }, [images]);

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedId) || sortedImages[0] || null,
    [images, selectedId, sortedImages]
  );
  const selectedProduct = useMemo(
    () => productSource.find((product) => product.id === productId && product.shopId === shopId) || productSource.find((product) => product.id === productId) || null,
    [productId, productSource, shopId]
  );
  const readyCount = images.filter((img) => img.status === "ready").length;
  const errorCount = images.filter((img) => img.status === "error").length;
  const processingCount = images.filter((img) => img.status === "pending" || img.aiProcessing).length;
  const queuedCount = queuedImages.length;
  const hasAnyLoadedImages = images.length > 0 || queuedImages.length > 0;
  const completedGenerationCount = readyCount + errorCount;
  const generationProgressPct = images.length > 0 ? Math.round((completedGenerationCount / images.length) * 100) : 0;
  const uploadDisabled = !connected || !template || images.length === 0 || isRunningBatch || processingCount > 0;
  const canShowReviewDetail = connected && !!shopId && !!productId;
  const canShowDetailPanel = !!selectedImage || canShowReviewDetail;
  const detailTitle = selectedImage?.final || template?.nickname || selectedProduct?.title || "Loading selected product...";
  const detailDescription = selectedImage?.finalDescription
    || (templateDescription
      ? templateDescription
      : canShowReviewDetail
        ? "Select or add artwork to generate image-based listing copy."
        : selectedImage
          ? "Add a shop and product template when you're ready. Quantum AI will build the final listing copy here."
          : "");
  const detailTags = selectedImage?.tags?.length
    ? selectedImage.tags
    : canShowReviewDetail
      ? buildTags(detailTitle, detailDescription, FIXED_TAG_COUNT)
      : [];
  const isDetailDescriptionLoading =
    loadingTemplateDetails
    || !!selectedImage?.aiProcessing
    || !!(selectedImage && templateReadyForAi && selectedImage.processedTemplateKey !== templateKey);
  const guidanceStep = !connected
    ? "connect"
    : images.length === 0
      ? "import"
      : !shopId || !template
        ? "template"
        : "detail";

  const processingBanner = processingCount > 0
    ? `Quantum AI is generating listing copy for ${processingCount} image${processingCount === 1 ? "" : "s"} in this batch.`
    : "";

  const activeTemplateDescription = templateDescription;

  function triggerAttentionCue(target: "provider" | "token" | "import" | "shop" | "template") {
    setAttentionTarget(target);
    window.clearTimeout((triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId);
    (triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId = window.setTimeout(() => {
      setAttentionTarget((current) => (current === target ? null : current));
    }, 1200);
  }

  function nudgeWorkflow(detailOnly = false) {
    if (!provider) {
      triggerAttentionCue("provider");
      return;
    }
    if (!connected) {
      triggerAttentionCue("token");
      return;
    }
    if (!images.length) {
      triggerAttentionCue("import");
      return;
    }
    if (!shopId) {
      if (!detailOnly || images.length > 0) triggerAttentionCue("shop");
      return;
    }
    if (!template) {
      if (!detailOnly || images.length > 0) triggerAttentionCue("template");
    }
  }

  useEffect(() => {
    const previous = previousPreviewUrlsRef.current;
    const current = [...images, ...queuedImages].map((img) => img.preview);
    for (const url of previous) {
      if (!current.includes(url) && url.startsWith("blob:")) {
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
    };
  }, []);

  useEffect(() => {
    activeTemplateKeyRef.current = templateKey;
  }, [templateKey]);

  useEffect(() => {
    if (!templateKey) return;
    setImages((current) =>
      current.map((img) =>
        img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              status: "pending",
              statusReason: "Quantum AI is preparing listing copy.",
              aiProcessing: false,
              aiDraft: undefined,
            }
      )
    );
    setQueuedImages((current) =>
      current.map((img) =>
        img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              status: "pending",
              statusReason: "Quantum AI is preparing listing copy.",
              aiProcessing: false,
              aiDraft: undefined,
            }
      )
    );
  }, [templateKey]);

  useEffect(() => {
    if (!templateReadyForAi) return;
    if (aiLoopBusyRef.current) return;

    const nextImage = images.find((img) => img.processedTemplateKey !== templateKey && !img.aiProcessing);
    if (!nextImage) return;

    const requestTemplateKey = templateKey;
    const requestTemplateDescription = templateDescription;
    const requestTemplateReference = template?.reference || "";
    const requestOwner = Symbol(nextImage.id);
    aiLoopBusyRef.current = requestOwner;

    setImages((current) =>
      current.map((img) =>
        img.id === nextImage.id
          ? { ...img, aiProcessing: true, status: "pending", statusReason: "Quantum AI is analyzing artwork." }
          : img
      )
    );

    void (async () => {
      try {
        const response = await fetchWithTimeout("/api/ai/listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextImage.cleaned,
            imageDataUrl: nextImage.preview,
            templateContext: requestTemplateDescription,
            productFamily: resolveProductFamily(nextImage.cleaned, requestTemplateDescription),
          }),
        });

        const data = await parseResponsePayload(response);
        if (!response.ok) throw new Error(String(data?.error || `AI request failed with status ${response.status}.`));
        if (activeTemplateKeyRef.current !== requestTemplateKey) return;

        const fallbackLead = buildLeadParagraphs(nextImage.cleaned, requestTemplateDescription);
        const finalTitle = safeTitle(String(data?.title || nextImage.cleaned), nextImage.cleaned);
        const finalLead = normalizeAiLeadParagraphs(
          Array.isArray(data?.leadParagraphs) ? (data.leadParagraphs as unknown[]).map((entry) => String(entry || "")) : fallbackLead
        );
        const finalDescription = requestTemplateDescription.trim()
          ? buildDescription(finalTitle, requestTemplateDescription, finalLead)
          : finalLead.join("\n\n");
        const tags = Array.isArray(data?.tags)
          ? (data.tags as unknown[]).map((entry) => String(entry || "")).filter(Boolean).slice(0, FIXED_TAG_COUNT)
          : buildTags(finalTitle, finalDescription, FIXED_TAG_COUNT);
        const reasonFlags = Array.isArray(data?.reasonFlags) ? (data.reasonFlags as unknown[]).map((entry) => String(entry || "")).filter(Boolean) : [];
        const grade = data?.grade === "green" || data?.grade === "orange" || data?.grade === "red"
          ? data.grade
          : (typeof data?.confidence === "number" && data.confidence >= 0.8 && reasonFlags.length === 0 ? "green" : "red");
        const source = data?.source === "gemini" || data?.source === "fallback" ? data.source : "fallback";
        const confidence = typeof data?.confidence === "number" ? data.confidence : 0.65;
        const status: ReviewStatus = grade === "green" ? "ready" : "error";
        const statusReason = status === "ready"
          ? "Quantum AI approved this item as ready."
          : reasonFlags.length
            ? reasonFlags.join(" • ")
            : source === "fallback"
              ? "Quantum AI completed this item with fallback output, but it did not pass ready checks."
              : "Quantum AI could not generate a ready draft for this image.";

        setImages((current) =>
          current.map((img) =>
            img.id === nextImage.id
              ? {
                  ...img,
                  final: finalTitle,
                  finalDescription,
                  tags,
                  status,
                  statusReason,
                  aiProcessing: false,
                  processedTemplateKey: requestTemplateKey,
                  aiDraft: {
                    title: finalTitle,
                    leadParagraphs: finalLead,
                    model: String(data?.model || AI_MODEL_LABEL),
                    confidence,
                    templateReference: requestTemplateReference,
                    reasonFlags,
                    source,
                    grade,
                  },
                }
              : img
          )
        );
      } catch (error) {
        if (activeTemplateKeyRef.current !== requestTemplateKey) return;
        const message = formatApiError(error instanceof Error ? error.message : "Quantum AI could not process this item.");
        setImages((current) =>
          current.map((img) =>
            img.id === nextImage.id
              ? {
                  ...img,
                  status: "error",
                  statusReason: message,
                  aiProcessing: false,
                  processedTemplateKey: requestTemplateKey,
                }
              : img
          )
        );
      } finally {
        if (aiLoopBusyRef.current === requestOwner) {
          aiLoopBusyRef.current = null;
        }
      }
    })();
  }, [images, template, templateDescription, templateKey, templateReadyForAi]);

  function resetProviderState(clearStatus = true) {
    setConnected(false);
    setLoadingApi(false);
    if (clearStatus) setApiStatus("");
    setApiShops([]);
    setApiProducts([]);
    setLoadingProducts(false);
    setLoadingTemplateDetails(false);
    setShopId("");
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setSearch("");
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;

    const incoming = Array.from(list);
    if (!incoming.length) return;

    const imageFiles = incoming.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name));
    const ignoredByType = incoming.length - imageFiles.length;
    const currentTotal = images.length + queuedImages.length;
    const room = Math.max(0, totalBatchLimit - currentTotal);
    const accepted = imageFiles.slice(0, room);
    const ignoredByLimit = Math.max(0, imageFiles.length - accepted.length);

    const good: Img[] = [];
    for (const file of accepted) {
      try {
        const preview = await createContrastSafePreview(file);
        const artworkBounds = await analyzeArtworkBounds(file);
        const cleaned = cleanTitle(file.name);
        good.push({
          id: makeId(),
          name: file.name,
          file,
          preview: preview.src,
          previewBackground: preview.background,
          cleaned,
          final: cleaned,
          finalDescription: "",
          tags: [],
          status: "pending" as ReviewStatus,
          statusReason: "Quantum AI is preparing listing copy.",
          artworkBounds,
        });
      } catch {
        // Ignore unreadable files.
      }
    }

    const activeRoom = queuedImages.length > 0 ? 0 : Math.max(0, activeBatchLimit - images.length);
    const nextActive = good.slice(0, activeRoom);
    const nextQueued = good.slice(activeRoom);
    const mergedActive = [...images, ...nextActive];
    const mergedQueued = [...queuedImages, ...nextQueued];
    setImages(mergedActive);
    setQueuedImages(mergedQueued);
    if (!selectedId && mergedActive[0]) setSelectedId(mergedActive[0].id);

    const parts: string[] = [];
    if (mergedActive.length !== images.length || nextQueued.length) {
      parts.push(`Loaded ${good.length} image${good.length === 1 ? "" : "s"}.`);
    }
    if (nextQueued.length) {
      parts.push(`Queued ${nextQueued.length} for later batches.`);
    }
    if (ignoredByType) {
      parts.push(`Ignored ${ignoredByType} non-image file${ignoredByType === 1 ? "" : "s"}.`);
    }
    if (ignoredByLimit) {
      parts.push(
        connected
          ? `Ignored ${ignoredByLimit} image${ignoredByLimit === 1 ? "" : "s"} above the ${CONNECTED_TOTAL_BATCH_FILES}-image total cap.`
          : `Demo mode supports up to ${DEMO_TOTAL_BATCH_FILES} images. Connect a provider for full batch access.`
      );
    }

    setMessage(parts.join(" "));
  }

  async function connectPrintify() {
    if (!provider || !token.trim()) return;
    setLoadingProducts(false);
    setApiStatus("");
    setRunStatus("");
    setBatchResults([]);
    setLoadingApi(true);
    try {
      const { response, data } = await requestJson("/api/providers/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, token: token.trim() }),
      });

      if (!response.ok) throw new Error(String(data?.error || `${selectedProvider?.label || "Provider"} connect failed with status ${response.status}.`));

      const shops = Array.isArray(data?.shops) ? (data.shops as ApiShop[]).map((shop) => ({ id: String(shop.id), title: String(shop.title) })) : [];
      setConnected(true);
      setPulseConnected(true);
      window.setTimeout(() => setPulseConnected(false), 1200);
      setApiShops(shops);
      setApiStatus(shops.length ? "Connected successfully." : "Connected successfully, but no shops were returned.");
      if (shops.length === 1) {
        setShopId(shops[0].id);
      }
    } catch (error) {
      setApiStatus(formatApiError(error instanceof Error ? error.message : "Connection failed."));
      resetProviderState(false);
    } finally {
      setLoadingApi(false);
    }
  }

  async function disconnectPrintify() {
    if (!provider) return;
    try {
      await requestJson("/api/providers/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
    } finally {
      resetProviderState();
      setToken("");
    }
  }

  useEffect(() => {
    if (!connected || !isLiveProvider || !shopId) {
      setApiProducts([]);
      return;
    }

    let cancelled = false;
    setLoadingProducts(true);
    void (async () => {
      try {
        const { response, data } = await requestJson(`/api/providers/products?provider=${provider}&shopId=${encodeURIComponent(shopId)}`);
        if (!response.ok) throw new Error(String(data?.error || `Products request failed with status ${response.status}.`));

        const products = Array.isArray(data?.products)
          ? (data.products as ApiProduct[]).map((product) => ({
              id: String(product.id),
              title: String(product.title),
              type: String(product.blueprint_id || product.print_provider_id || product.description || "Product"),
              shopId: String(product.shop_id ?? shopId),
              description: product.description,
            }))
          : [];

        if (!cancelled) {
          setApiProducts(products);
        }
      } catch (error) {
        if (!cancelled) {
          setApiStatus(formatApiError(error instanceof Error ? error.message : "Could not load products."));
        }
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, isLiveProvider, provider, shopId]);

  useEffect(() => {
    if (!connected || !isLiveProvider || !provider || !productId) return;

    let cancelled = false;
    setLoadingTemplateDetails(true);
    setTemplateDescription("");
    setTemplate(null);

    void (async () => {
      try {
        const { response, data } = await requestJson(`/api/providers/product?provider=${provider}&shopId=${encodeURIComponent(shopId)}&productId=${encodeURIComponent(productId)}`);
        if (!response.ok) throw new Error(String(data?.error || `Product request failed with status ${response.status}.`));

        const responseData = data as ApiTemplateResponse;
        const product = responseData.product;
        const description = String(product?.description || "").trim();
        const formattedDescription = formatTemplateDescription(description);
        const usingFallbackDescription = !formattedDescription;
        const fallbackDescription = selectedProduct?.description || templateDescription || "";
        const finalDescription = usingFallbackDescription ? fallbackDescription : formattedDescription;
        const reference = product?.id ? String(product.id) : productId;

        if (!cancelled) {
          setTemplate({
            reference,
            nickname: selectedProduct?.title || `Template ${reference}`,
            source: product ? "product" : "manual",
            shopId,
            description: finalDescription,
            placementGuide: responseData.placementGuide || DEFAULT_PLACEMENT_GUIDE,
          });
          setTemplateDescription(finalDescription);
          setApiStatus(usingFallbackDescription ? "Live template description is unavailable here, so MerchQuantum is using the saved product summary from this provider response." : "");
        }
      } catch (error) {
        if (!cancelled) {
          const fallbackDescription = selectedProduct?.description || "";
          setTemplate({
            reference: productId,
            nickname: selectedProduct?.title || `Template ${productId}`,
            source: "manual",
            shopId,
            description: fallbackDescription,
            placementGuide: DEFAULT_PLACEMENT_GUIDE,
          });
          setTemplateDescription(fallbackDescription);
          setApiStatus(formatApiError(error instanceof Error ? error.message : "Could not load template details."));
        }
      } finally {
        if (!cancelled) setLoadingTemplateDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, isLiveProvider, productId, provider, selectedProduct?.description, selectedProduct?.title, shopId]);

  async function runDraftBatch() {
    if (uploadDisabled) return;
    setIsRunningBatch(true);
    setBatchResults([]);
    setRunStatus("");

    const nextResults: BatchResult[] = [];
    const activeImages = images;

    try {
      for (const [index, img] of activeImages.entries()) {
        setRunStatus(`Uploading draft ${index + 1} of ${activeImages.length}...`);
        try {
          const titleForUpload = img.final || cleanTitle(img.name);
          const description = img.finalDescription || buildDescription(titleForUpload, activeTemplateDescription, buildLeadParagraphs(titleForUpload, activeTemplateDescription));
          const tags = img.tags.length ? img.tags : buildTags(titleForUpload, description, FIXED_TAG_COUNT);
          const imageDataUrl = img.preview;
          const artworkBounds = normalizeArtworkBounds(img.artworkBounds, 1, 1);

          const response = await fetchWithTimeout("/api/providers/batch-create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              token,
              shopId,
              productId,
              results: [{
                fileName: img.name,
                title: titleForUpload,
                description,
                tags,
                imageDataUrl,
                artworkBounds,
              }],
            }),
          });

          const data = await parseResponsePayload(response);
          if (!response.ok) throw new Error(String(data?.error || `Draft request failed with status ${response.status}.`));

          const result = Array.isArray(data?.results) && data.results[0]
            ? (data.results[0] as BatchResult)
            : { fileName: img.name, title: titleForUpload, message: String(data?.message || "Created draft product.") };

          nextResults.push(result);
          setBatchResults([...nextResults]);
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : "Draft create failed.";
          const errorMessage = formatApiError(rawMessage);
          nextResults.push({ fileName: img.name, title: img.final || cleanTitle(img.name), message: errorMessage });
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

  function updatePreviewStatus(targetId: string, status: Exclude<ReviewStatus, "pending">) {
    setImages((current) =>
      current.map((entry) =>
        entry.id === targetId
          ? {
              ...entry,
              status,
              statusReason:
                status === "ready"
                  ? "Approved and ready."
                  : "Marked failed.",
            }
          : entry
      )
    );
  }

  function removePreviewItem(targetId: string) {
    const remainingActive = images.filter((entry) => entry.id !== targetId);
    const { active: nextActive, queued: nextQueued } = fillActiveBatch(remainingActive, queuedImages, activeBatchLimit);
    setImages(nextActive);
    setQueuedImages(nextQueued);
    if (selectedId === targetId) setSelectedId(nextActive[0]?.id || "");
  }

  return (
    <div className="min-h-screen bg-[#000000] p-6 text-white transition-colors md:p-8">
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
          className={`relative overflow-hidden border-slate-800 bg-[#020616] text-white shadow-[0_28px_80px_-40px_rgba(2,6,22,0.95)] ${guidanceStep === "connect" ? "ring-1 ring-[#7F22FE]/45 shadow-[0_28px_90px_-40px_rgba(127,34,254,0.45)]" : connected ? "ring-1 ring-[#00BC7D]/35 shadow-[0_28px_90px_-40px_rgba(0,188,125,0.32)]" : ""}`}
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
          <div className="grid gap-3 md:grid-cols-2">
            <div className={`${attentionTarget === "provider" ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}`}>
              <Select
                value={provider}
                onChange={(e) => {
                  const nextProvider = e.target.value as ProviderId | "";
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

            <div className={`relative ${attentionTarget === "token" ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}`}>
              <Input
                type={connected ? "text" : "password"}
                value={connected ? maskToken(token) : token}
                disabled={!provider}
                readOnly={connected}
                placeholder="Provider Personal Access Token (API)"
                onChange={(e) => setToken(e.target.value)}
                className={`pr-32 ${connected ? "pr-52" : ""} disabled:cursor-not-allowed`}
              />
              <button
                type="button"
                onClick={() => { void connectPrintify(); }}
                disabled={!provider || !isLiveProvider || !token.trim() || loadingApi || connected}
                className={`absolute top-1.5 min-h-[32px] rounded-lg px-3 text-sm font-medium transition-colors ${connected ? "right-24 bg-[#00BC7D] text-white" : "right-1.5 bg-[#7F22FE] text-white hover:bg-[#6d1ee0] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"}`}
              >
                {loadingApi ? "Connecting..." : connected ? "Connected" : "Connect"}
              </button>
              {connected ? (
                <button
                  type="button"
                  onClick={() => { void disconnectPrintify(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-white transition-opacity hover:opacity-80"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>

          {apiStatus ? <p className="mt-3 text-sm text-[#FE9A00]">{apiStatus}</p> : null}
        </Box>

        <Box className="border-slate-800 bg-[#020616] shadow-[0_24px_70px_-38px_rgba(2,6,22,0.95)]">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-[22px] border border-dashed px-4 py-3.5 text-sm text-slate-200 transition-all duration-500 hover:bg-[#0b1024] ${guidanceStep === "import" ? "border-[#7F22FE]/80 bg-[#7F22FE]/10 shadow-[0_0_0_1px_rgba(127,34,254,0.16),0_18px_50px_-30px_rgba(127,34,254,0.45)]" : "border-slate-700 bg-[#020616]/82"} ${connected && hasAnyLoadedImages ? "ring-1 ring-[#00BC7D]/20" : ""} ${attentionTarget === "import" ? "ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.22),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}`}
          >
            {guidanceStep === "import" ? <div className="pointer-events-none absolute inset-x-4 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
            <div className="flex min-w-0 flex-col gap-2 text-left lg:flex-row lg:items-start lg:justify-between lg:gap-4">
              <div className="min-w-0 shrink-0 pt-0.5">
              <div className="font-medium text-white">Drag or click to <span className="text-[#7F22FE]">add images</span></div>
              </div>
              <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-0.5 pb-1.5 pt-0.5 text-[11px] font-medium text-white sm:text-xs">
                <div className="flex min-w-max flex-nowrap items-center gap-x-3 gap-y-1.5 lg:justify-end">
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={getStatusIndicatorClass("ready")} />
                      <span>{readyCount} Ready</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={getStatusIndicatorClass("error")} />
                      <span>{errorCount} Failed</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span>{queuedCount} Q</span>
                    </div>
                    <div className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                      <span className={getLoadingIndicatorClass()} />
                      <span>{processingCount} Loading</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#00A6F4] ring-2 ring-[#00A6F4]/35" />
                      <span>{completedGenerationCount} Complete</span>
                    </div>
                    <span
                      role="button"
                      tabIndex={hasAnyLoadedImages ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasAnyLoadedImages) return;
                        setImages([]);
                        setQueuedImages([]);
                        setSelectedId("");
                        setMessage("");
                        setBatchResults([]);
                        setRunStatus("");
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (!hasAnyLoadedImages) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setImages([]);
                          setQueuedImages([]);
                          setSelectedId("");
                          setMessage("");
                          setBatchResults([]);
                          setRunStatus("");
                        }
                      }}
                      className={`whitespace-nowrap text-[11px] font-medium transition-colors sm:text-xs ${hasAnyLoadedImages ? "cursor-pointer text-[#7F22FE] hover:text-[#8f49ff]" : "cursor-default text-slate-500 opacity-40"}`}
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
          {sortedImages.length > 0 ? (
            <div className="mt-3">
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                {sortedImages.map((img, index) => {
                  const isSelected = selectedImage?.id === img.id;
                  const isProcessing = img.aiProcessing || img.status === "pending";
                  const previewFrameTone = isProcessing
                    ? "border-[#7F22FE]/55"
                    : img.status === "ready"
                      ? "border-[#00BC7D]/55"
                      : img.status === "error"
                        ? "border-[#FF2056]/55"
                        : "border-slate-700";
                  const previewAlignRight = (index + 1) % 10 === 0 || (index + 1) % 10 === 9;
                  const previewOpenUp = sortedImages.length - index <= 10;
                  return (
                    <div
                      key={img.id}
                      onClick={() => setSelectedId(img.id)}
                      className={`rounded-lg transition-all duration-500 ${isProcessing ? "shadow-[0_12px_32px_-24px_rgba(124,58,237,0.45)]" : isSelected ? "shadow-[0_10px_24px_-20px_rgba(124,58,237,0.45)]" : ""}`}
                    >
                      <div className="relative">
                        {isProcessing ? <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
                        <div className={`group relative flex aspect-square w-full items-center justify-center overflow-visible rounded-lg border bg-[#020616] transition-all duration-500 ${previewFrameTone}`}>
                          {isProcessing ? <div className="pointer-events-none absolute inset-0 rounded-lg border border-[#7F22FE]/80 animate-pulse" /> : null}
                          <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1">
                            {(["ready", "error"] as const).map((status) => {
                              const isActive = img.status === status;
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  aria-label={status}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updatePreviewStatus(img.id, status);
                                  }}
                                  className={`${getStatusIndicatorClass(isActive ? status : "pending")} transition-transform hover:scale-105`}
                                />
                              );
                            })}
                          </div>
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
                            <div className={`pointer-events-none absolute z-30 hidden w-40 rounded-2xl border border-slate-800 bg-[#020616] p-3 shadow-xl group-hover:block ${previewOpenUp ? "bottom-full mb-2" : "top-0"} ${previewAlignRight ? "right-0" : "left-0"}`}>
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

          <div className="mt-3 border-t border-slate-800 pt-3">
          <div
            onPointerDownCapture={() => nudgeWorkflow(false)}
            className={`relative grid gap-3 rounded-xl transition-all duration-500 ${guidanceStep === "template" ? "border border-[#7F22FE]/40 bg-[#7F22FE]/10 p-3 shadow-[0_18px_50px_-32px_rgba(127,34,254,0.38)]" : ""}`}
          >
            {guidanceStep === "template" ? <div className="pointer-events-none absolute inset-x-4 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
            <div className="grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className={attentionTarget === "shop" ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}>
                  <Select
                    value={shopId}
                    className={shopId ? "text-[13px] font-normal text-white" : "font-medium text-slate-400"}
                    disabled={!availableShops.length}
                    onChange={(e) => {
                    const nextShopId = e.target.value;
                    setShopId(nextShopId);
                    setProductId("");
                    setTemplate(null);
                  }}
                >
                  <option value="">
                    {loadingApi
                      ? "Loading shops..."
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

                <div className={attentionTarget === "template" ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_22px_55px_-30px_rgba(127,34,254,0.6)] animate-pulse" : ""}>
                  <Select
                    value={productId}
                    className={productId ? "text-[13px] font-normal text-white" : "font-medium text-slate-400"}
                    disabled={!shopId || loadingProducts}
                    onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">
                    {loadingProducts
                      ? "Loading products..."
                      : connected && isLiveProvider && shopId && visibleProducts.length === 0
                        ? "No products found"
                        : "Choose Product Template"}
                  </option>
                  {visibleProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search My Products" />
              </div>
            </div>
          </div>
          </div>

          <div className="mt-3 border-t border-slate-800 pt-3">
          {!canShowDetailPanel ? null : (
            <div className="space-y-3" onPointerDownCapture={() => nudgeWorkflow(true)}>
              <div className="grid items-stretch gap-3 lg:grid-cols-[296px_minmax(0,1fr)]">
              <div className="flex h-full flex-col">
                <div className="space-y-1.5">
                  <div className="flex min-h-[20px] items-center text-sm font-medium leading-5 tracking-tight text-slate-200">Uploaded Artwork</div>
                  <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#020616] lg:h-[19rem]">
                    {selectedImage?.preview ? (
                      <div
                        className="absolute inset-0 overflow-hidden rounded-[inherit]"
                        style={{ backgroundColor: selectedImage.previewBackground || DISPLAY_NEUTRAL_BACKGROUND }}
                      >
                        <img src={selectedImage.preview} alt={selectedImage.final} className="h-full w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex h-full w-full p-4">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#020616]/92 px-6 text-center transition-colors hover:bg-[#0b1024]"
                        >
                          <span className="text-sm font-medium text-white">Drag images here</span>
                          <span className="mt-1 text-xs text-slate-400">or click Add Images</span>
                        </button>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-[#020616]/92 px-2.5 py-1 text-[11px] font-medium text-slate-400 shadow-sm">
                      Draft upload only. Ready items can be uploaded.
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                <Button
                  className="w-full !bg-[#7F22FE] !text-white hover:!bg-[#6d1ee0]"
                  disabled={uploadDisabled}
                  onClick={() => { void runDraftBatch(); }}
                >
                  {isRunningBatch ? "Uploading Draft Products..." : "Upload Draft Products"}
                </Button>
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
              </div>

              <div className="flex h-full flex-col space-y-3">
                <Field label="Final Title">
                  <div className="flex min-h-[44px] items-center rounded-xl border border-slate-700 bg-[#020616] px-3 py-0 text-left text-sm font-normal leading-5 text-white">
                    {detailTitle}
                  </div>
                </Field>

                <Field label="Final Description">
                  <div className="min-h-[264px] rounded-xl border border-slate-700 bg-[#020616] px-3 py-2 text-sm font-normal leading-6 text-white lg:h-[17rem] lg:overflow-y-auto">
                    <div className="flex min-h-full items-center">
                      {isDetailDescriptionLoading ? (
                        <div className="flex w-full items-center justify-center gap-2 text-sm font-medium text-slate-300">
                          <span className={`${getLoadingIndicatorClass()} animate-pulse`} />
                          <span>Loading description...</span>
                        </div>
                      ) : (
                        <div className="w-full whitespace-pre-wrap text-left">
                          {htmlToEditableText(detailDescription)}
                        </div>
                      )}
                    </div>
                  </div>
                </Field>
              </div>
              </div>

              {canShowReviewDetail ? (
              <div className="pt-0.5">
                <div className="grid gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                  <div className="flex min-h-[34px] items-center justify-center rounded-xl border border-slate-800 bg-[#020616] px-2.5 py-1.5 text-center text-sm">
                    <span className="font-semibold text-[#7F22FE]">Quantum</span>
                    <span className="ml-1 font-semibold text-white">AI</span>
                    <span className="ml-1 font-semibold text-[#00BC7D]">Tags</span>
                  </div>
                  {detailTags.map((tag, index) => (
                    <div
                      key={`${selectedImage?.id || productId}-tag-${index}`}
                      title={tag}
                      className="flex min-h-[34px] items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#020616] px-2.5 py-1.5 text-center text-sm leading-5 text-white"
                    >
                      <span className="truncate">{tag}</span>
                    </div>
                  ))}
                </div>
              </div>
              ) : null}
            </div>
          )}
          </div>
        </Box>
      </div>
    </div>
  );
}
