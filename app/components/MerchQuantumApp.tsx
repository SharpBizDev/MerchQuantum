'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_LISTINGS, DEMO_SHOPS, type DemoListing } from "../../lib/demo/merchquantum-demo";
import { PROVIDER_OPTIONS } from "../../lib/providers/client-options";

const APP_TAGLINE = "Bulk product creation, simplified";
const ACTIVE_BATCH_FILES = 50;
const CONNECTED_TOTAL_BATCH_FILES = 300;
const DEMO_TOTAL_BATCH_FILES = DEMO_LISTINGS.length;
const DEMO_TITLE_PLACEHOLDER = "Upload 5 Designs Free and See AI Listing Results Instantly";
const DEMO_DESCRIPTION_PLACEHOLDER = "Upload up to 5 designs free to preview how MerchQuantum scans artwork, writes titles and descriptions, and builds listing-ready content. Connect a provider to unlock templates, product details, and full batch draft creation.";
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
  isDemo?: boolean;
  demoListingId?: string;
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