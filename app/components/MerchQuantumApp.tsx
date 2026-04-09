'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PROVIDER_OPTIONS } from "../../lib/providers/client-options";

const APP_TAGLINE = "Bulk product creation, simplified";
const MAX_BATCH_FILES = 50;
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

type ReviewStatus = "pending" | "ready" | "review" | "error";

type AiListingDraft = {
  title: string;
  leadParagraphs: string[];
  model: string;
  confidence: number;
  templateReference: string;
  reasonFlags: string[];
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

  const ranked = Array.from(new Set([...phrases, ...singles])).slice(0, FIXED_TAG_COUNT);
  while (ranked.length < FIXED_TAG_COUNT) ranked.push(`Keyword ${ranked.length + 1}`);
  return ranked.map(titleCaseTag);
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

function formatProductDescriptionWithSections(leadParagraphs: string[], templateDescription: string) {
  const paragraphs = dedupeParagraphs(normalizeAiLeadParagraphs(leadParagraphs));
  const leadHtml = leadToHtml(paragraphs);

  const formattedTemplate = formatTemplateDescription(templateDescription);
  const parsed = parseTemplateDescription(formattedTemplate);
  const detailSectionHeadings = new Set(["Product features", "Care instructions", "Size chart"]);

  const detailSections = parsed.sections.filter((section) => detailSectionHeadings.has(section.heading));

  if (detailSections.length === 0) {
    return leadHtml;
  }

  const detailHtml = detailSections
    .map((section) => {
      const pieces: string[] = [`<h3>${escapeHtml(section.heading)}</h3>`];
      for (const paragraph of section.paragraphs) {
        pieces.push(`<p>${escapeHtml(paragraph)}</p>`);
      }
      if (section.bullets.length > 0) {
        const items = section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
        pieces.push(`<ul>${items}</ul>`);
      }
      return pieces.join("");
    })
    .join("");

  return `${leadHtml}${detailHtml}`;
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
    const templateContext = buildTemplateContext(templateDescription);
    const productFamily = resolveProductFamily(image.final, templateDescription);

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
        templateContext,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
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
    };
  } catch {
    return null;
  }
}

function compareByStatus(a: Img, b: Img) {
  const order: Record<ReviewStatus, number> = {
    ready: 0,
    review: 1,
    error: 2,
    pending: 3,
  };

  return order[a.status] - order[b.status];
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "ghost";
};

function Button({ className = "", tone = "default", type = "button", ...props }: ButtonProps) {
  const base =
    "inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
  const tones =
    tone === "ghost"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-500";

  return <button type={type} className={`${base} ${tones} ${className}`} {...props} />;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:ring-violet-500/30 ${className}`}
      {...props}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function Select({ className = "", children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={`h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:ring-violet-500/30 ${className}`}
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
      <span className="flex min-h-[20px] items-center text-sm font-medium leading-5 tracking-tight text-slate-700 dark:text-slate-300">{label}</span>
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
    <section className={`rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/92 ${className}`}>
      {title ? <div className={`mb-4 text-base font-semibold tracking-tight ${headerClassName}`}>{title}</div> : null}
      {children}
    </section>
  );
}

function BrandMark() {
  return (
    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-lg font-semibold text-white shadow-lg shadow-violet-500/30">
      MQ
    </div>
  );
}

function getStatusTone(status: ReviewStatus) {
  switch (status) {
    case "ready":
      return "bg-emerald-500 ring-emerald-300 dark:ring-emerald-900/70";
    case "review":
      return "bg-amber-500 ring-amber-300 dark:ring-amber-900/70";
    case "error":
      return "bg-rose-500 ring-rose-300 dark:ring-rose-900/70";
    default:
      return "bg-slate-300 ring-slate-200/80 dark:bg-slate-700 dark:ring-slate-800";
  }
}

function getStatusIndicatorClass(status: ReviewStatus) {
  return `h-2 w-2 rounded-full ring-2 ${getStatusTone(status)}`;
}

function getLoadingIndicatorClass() {
  return "h-2 w-2 rounded-full ring-2 bg-violet-500 ring-violet-300/80 dark:ring-violet-900/70";
}

function getStatusSortValue(status: ReviewStatus) {
  switch (status) {
    case "ready":
      return 0;
    case "review":
      return 1;
    case "error":
      return 2;
    default:
      return 3;
  }
}

export default function MerchQuantumApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewUrlsRef = useRef<string[]>([]);
  const aiLoopBusyRef = useRef(false);

  const [provider, setProvider] = useState<ProviderId | "">("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [pulseConnected, setPulseConnected] = useState(false);
  const [apiShops, setApiShops] = useState<Shop[]>([]);
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [shopId, setShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);

  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || null;
  const isLiveProvider = selectedProvider?.isLive || false;
  const availableShops = connected && isLiveProvider ? apiShops : [];
  const productSource = connected && isLiveProvider ? apiProducts : [];
  const templateKey = useMemo(() => `${template?.reference || "no-template"}::${templateDescription.trim()}`, [template?.reference, templateDescription]);

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
  const reviewCount = images.filter((img) => img.status === "review").length;
  const errorCount = images.filter((img) => img.status === "error").length;
  const processingCount = images.filter((img) => img.status === "pending" || img.aiProcessing).length;
  const completedGenerationCount = Math.max(0, images.length - processingCount);
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
  const guidanceStep = !connected
    ? "connect"
    : images.length === 0
      ? "import"
      : !shopId || !template
        ? "template"
        : "settled";
  const skippedCount = Array.from(message.matchAll(/Skipped (\d+)/g)).reduce((total, [, count]) => total + Number(count || 0), 0);
  const processingBanner = processingCount > 0
    ? `Quantum AI is generating listing copy for ${processingCount} image${processingCount === 1 ? "" : "s"} in this batch.`
    : "";

  function getProviderRoute(path: "connect" | "disconnect" | "products" | "product" | "batch-create") {
    return `/api/providers/${path}`;
  }

  useEffect(() => {
    const previous = previousPreviewUrlsRef.current;
    const current = images.map((img) => img.preview);

    for (const url of previous) {
      if (url.startsWith("blob:") && !current.includes(url)) {
        URL.revokeObjectURL(url);
      }
    }

    previousPreviewUrlsRef.current = current;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const url of previousPreviewUrlsRef.current) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    setImages((current) =>
      current.map((img) =>
        img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              processedTemplateKey: undefined,
              aiDraft: undefined,
              aiProcessing: false,
              status: "pending",
              statusReason: "Quantum AI is preparing listing copy.",
            }
      )
    );
  }, [templateKey]);

  useEffect(() => {
    if (!connected || !isLiveProvider || !shopId) {
      setApiProducts([]);
      setProductId("");
      return;
    }

    void loadProductsForShop(shopId);
  }, [shopId]);

  useEffect(() => {
    if (!shopId) {
      setProductId("");
      setTemplate(null);
      setTemplateDescription("");
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
      return;
    }

    void loadProductTemplate(productId);
  }, [shopId, productId]);

  useEffect(() => {
    if (aiLoopBusyRef.current) return;
    const nextImage = images.find((img) => !img.aiProcessing && img.processedTemplateKey !== templateKey);
    if (!nextImage) return;

    aiLoopBusyRef.current = true;
    setImages((current) =>
      current.map((img) =>
        img.id === nextImage.id
          ? { ...img, aiProcessing: true, status: "pending", statusReason: "Quantum AI is analyzing artwork." }
          : img
      )
    );

    void (async () => {
      try {
        const imageDataUrl = await readDataUrl(nextImage.file);
        const response = await fetchWithTimeout(
          "/api/ai/listing",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl,
              fileName: nextImage.name,
              templateContext: templateDescription,
              productFamily: resolveProductFamily(nextImage.cleaned, templateDescription),
            }),
          },
          60000
        );

        const data = await parseResponsePayload(response);
        if (!response.ok) throw new Error(data?.error || `AI request failed with status ${response.status}.`);

        const leadParagraphs = normalizeAiLeadParagraphs(Array.isArray(data?.leadParagraphs) ? data.leadParagraphs : []);
        const fallbackLead = buildLeadParagraphs(nextImage.cleaned, templateDescription);
        const finalLead = leadParagraphs.length ? leadParagraphs : fallbackLead;
        const fallbackTitle = safeTitle(nextImage.final, nextImage.cleaned);
        const titleFromApi = typeof data?.title === "string" ? data.title : fallbackTitle;
        const finalTitle = safeTitle(titleFromApi, fallbackTitle);
        const finalDescription = templateDescription.trim()
          ? buildDescription(finalTitle, templateDescription, finalLead)
          : buildLeadOnlyDescription(finalLead);
        const tags = buildTags(finalTitle, finalDescription, FIXED_TAG_COUNT);
        const confidence = Number.isFinite(data?.confidence) ? clamp(Number(data.confidence), 0, 1) : 0;
        const reasonFlags = Array.isArray(data?.reasonFlags)
          ? data.reasonFlags.filter((flag: unknown) => typeof flag === "string")
          : [];

        const status: ReviewStatus = confidence >= 0.8 && reasonFlags.length === 0 ? "ready" : "review";
        const statusReason = status === "ready"
          ? "AI draft looks solid."
          : reasonFlags.length
            ? reasonFlags.join(" • ")
            : "Review the AI draft before upload.";

        setImages((current) =>
          current.map((img) =>
            img.id === nextImage.id
              ? {
                  ...img,
                  final: finalTitle,
                  finalDescription,
                  tags,
                  aiProcessing: false,
                  status,
                  statusReason,
                  processedTemplateKey: templateKey,
                  aiDraft: {
                    title: finalTitle,
                    leadParagraphs,
                    model: typeof data?.model === "string" ? data.model : AI_MODEL_LABEL,
                    confidence,
                    templateReference: template?.reference || "",
                    reasonFlags,
                  },
                }
              : img
          )
        );
      } catch (error) {
        const leadParagraphs = normalizeAiLeadParagraphs(buildLeadParagraphs(nextImage.cleaned, templateDescription));
        const fallbackTitle = safeTitle(nextImage.final, nextImage.cleaned);
        const fallbackDescription = templateDescription.trim()
          ? buildDescription(fallbackTitle, templateDescription, leadParagraphs)
          : buildLeadOnlyDescription(leadParagraphs);
        const message = formatApiError(error instanceof Error ? error.message : "Quantum AI could not process this item.");
        setImages((current) =>
          current.map((img) =>
            img.id === nextImage.id
              ? {
                  ...img,
                  final: fallbackTitle,
                  finalDescription: fallbackDescription,
                  tags: buildTags(fallbackTitle, fallbackDescription, FIXED_TAG_COUNT),
                  aiProcessing: false,
                  status: "review",
                  statusReason: message,
                  processedTemplateKey: templateKey,
                }
              : img
          )
        );
      } finally {
        aiLoopBusyRef.current = false;
      }
    })();
  }, [images, templateDescription, templateKey, template?.reference]);

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
    setBatchResults([]);
    setRunStatus("");
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setMessage("");

    const room = Math.max(0, MAX_BATCH_FILES - images.length);
    const valid = Array.from(list).filter(isImage).slice(0, room);
    const skippedByType = Array.from(list).filter((f) => !isImage(f)).length;
    const skippedByLimit = Math.max(0, Array.from(list).filter(isImage).length - valid.length);

    const good = valid.map((file) => {
      const cleaned = cleanTitle(file.name);
      const leadDescription = templateDescription.trim() ? buildDescription(cleaned, templateDescription) : buildLeadOnlyDescription(buildLeadParagraphs(cleaned, templateDescription));
      return {
        id: makeId(),
        name: file.name,
        file,
        preview: URL.createObjectURL(file),
        cleaned,
        final: cleaned,
        finalDescription: leadDescription,
        tags: buildTags(cleaned, leadDescription, FIXED_TAG_COUNT),
        status: "pending" as ReviewStatus,
        statusReason: "Quantum AI is preparing listing copy.",
      } satisfies Img;
    });

    setImages((current) => {
      const next = [...current, ...good];
      if (!selectedId && next[0]) setSelectedId(next[0].id);
      return next;
    });

    const parts: string[] = [];
    if (good.length) parts.push(`Loaded ${good.length} image${good.length === 1 ? "" : "s"}.`);
    if (skippedByType) parts.push(`Skipped ${skippedByType} non-image file${skippedByType === 1 ? "" : "s"}.`);
    if (skippedByLimit) parts.push(`Skipped ${skippedByLimit} image${skippedByLimit === 1 ? "" : "s"} above the ${MAX_BATCH_FILES}-file batch cap.`);
    setMessage(parts.join(" "));
  }

  async function loadProductsForShop(nextShopId: string) {
    if (!connected || !isLiveProvider || !nextShopId) {
      setApiProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    try {
      const response = await fetchWithTimeout(
        `${getProviderRoute("products")}?provider=${encodeURIComponent(provider)}&shopId=${encodeURIComponent(nextShopId)}`
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

  async function connectPrintify() {
    if (!provider || !token.trim() || !isLiveProvider) return;
    setLoadingApi(true);
    setApiStatus("");

    try {
      const response = await fetchWithTimeout(getProviderRoute("connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, token }),
      });

      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `${selectedProvider?.label || "Provider"} connect failed with status ${response.status}.`);

      const shopsFromApi: Shop[] = Array.isArray(data?.shops)
        ? data.shops.map((shop: ApiShop) => ({ id: String(shop.id), title: shop.title || `Shop ${shop.id}` }))
        : [];

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

  async function disconnectPrintify() {
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
    if (!fallback || !shopId) return;

    try {
      const response = await fetchWithTimeout(
        `${getProviderRoute("product")}?provider=${encodeURIComponent(provider)}&shopId=${encodeURIComponent(shopId)}&productId=${encodeURIComponent(nextProductId)}`
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `Product request failed with status ${response.status}.`);

      const responseData = (data || {}) as ApiTemplateResponse;
      const chosen = responseData.product || fallback;
      const title = chosen?.title || fallback.title;
      const usingFallbackDescription = !chosen?.description?.trim();
      const base = formatTemplateDescription(
        chosen?.description?.trim() ||
          fallback.description?.trim() ||
          `${title}. This is the base description from your saved template. Live product descriptions from ${selectedProvider?.label || "the provider"} will replace this placeholder after API wiring.`
      );
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
      setApiStatus(usingFallbackDescription ? "Live template description is unavailable here, so MerchQuantum is using the saved product summary from this provider response." : "");
    } catch (error) {
      const title = fallback.title;
      const base = formatTemplateDescription(
        fallback.description?.trim() ||
          `${title}. This is the base description from your saved template. Live product descriptions from ${selectedProvider?.label || "the connected provider"} will replace this placeholder when available.`
      );

      setTemplate({
        reference: fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
        placementGuide: template?.placementGuide || DEFAULT_PLACEMENT_GUIDE,
      });
      setTemplateDescription(base);
      setApiStatus(formatApiError(error instanceof Error ? error.message : "Unable to load template product."));
    }
  }

  async function runDraftBatch() {
    if (!template || !shopId || images.length === 0 || !isLiveProvider) return;

    setIsRunningBatch(true);
    setRunStatus("");
    setBatchResults([]);
    const nextResults: BatchResult[] = [];

    try {
      for (let index = 0; index < images.length; index += 1) {
        const img = images[index];
        const titleForUpload = safeTitle(img.final, img.cleaned);
        const description = img.finalDescription || buildDescription(titleForUpload, templateDescription, img.aiDraft?.leadParagraphs);
        const tags = img.tags.length ? img.tags : buildTags(titleForUpload, description, FIXED_TAG_COUNT);

        setRunStatus(`Uploading draft ${index + 1} of ${images.length}...`);

        try {
          const imageDataUrl = await readDataUrl(img.file);
          const artworkBounds = img.artworkBounds || (await analyzeArtworkBounds(img.file));
          if (!img.artworkBounds) {
            setImages((current) => current.map((entry) => (entry.id === img.id ? { ...entry, artworkBounds } : entry)));
          }

          const response = await fetchWithTimeout(getProviderRoute("batch-create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              shopId,
              templateProductId: template.reference,
              item: {
                fileName: img.name,
                title: titleForUpload,
                description,
                tags,
                imageDataUrl,
                artworkBounds,
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
      setRunStatus(`Uploaded ${createdCount} draft product${createdCount === 1 ? "" : "s"} out of ${images.length}.`);
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
                  : status === "review"
                    ? "Needs review."
                    : "Rejected or error.",
            }
          : entry
      )
    );
  }

  function removePreviewItem(targetId: string) {
    setImages((current) => {
      const next = current.filter((entry) => entry.id !== targetId);
      if (selectedId === targetId) setSelectedId(next[0]?.id || "");
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900 transition-colors dark:bg-black dark:text-slate-100 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="text-violet-600">Merch</span>
              <span className="text-slate-900 dark:text-white">Quantum</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{APP_TAGLINE}</p>
          </div>
        </div>

        <Box
          className={`relative overflow-hidden border-slate-900/90 bg-slate-950 text-white shadow-[0_28px_80px_-40px_rgba(15,23,42,0.9)] dark:border-slate-800 ${guidanceStep === "connect" ? "ring-1 ring-violet-500/40 shadow-[0_28px_90px_-40px_rgba(124,58,237,0.45)]" : connected ? "ring-1 ring-emerald-500/30 shadow-[0_28px_90px_-40px_rgba(16,185,129,0.42)]" : ""}`}
          headerClassName="mb-4"
          title={
            <span className="inline-flex items-center font-semibold tracking-tight">
              <span className="font-semibold text-violet-600">Quantum</span>
              <span className="ml-1 font-semibold text-white">AI</span>
              <span className={`ml-1 font-semibold ${connected ? `text-emerald-400 ${pulseConnected ? "animate-pulse" : ""}` : "text-white"}`}>
                {connected ? "Connection" : "Connect"}
              </span>
            </span>
          }
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/70 to-transparent" />
          <div className={`pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full blur-3xl transition-all duration-700 ${connected ? "bg-emerald-500/12" : "bg-violet-500/12"} ${guidanceStep === "connect" ? "animate-pulse" : ""}`} />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
          <div
            className={`pointer-events-none absolute inset-x-5 bottom-0 h-px transition-all duration-700 ${connected ? "bg-gradient-to-r from-transparent via-emerald-400/90 to-transparent" : "bg-gradient-to-r from-transparent via-violet-500/70 to-transparent"} ${pulseConnected || guidanceStep === "connect" ? "scale-x-100 opacity-100" : "scale-x-75 opacity-60"}`}
          />
          <div className="grid gap-3 md:grid-cols-2">
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

            <div className="relative">
              <Input
                type={connected ? "text" : "password"}
                value={connected ? maskToken(token) : token}
                disabled={!provider}
                readOnly={connected}
                placeholder="Provider Personal Access Token (API)"
                onChange={(e) => setToken(e.target.value)}
                className={`pr-32 ${connected ? "pr-52" : ""} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-900 dark:disabled:text-slate-500`}
              />
              <button
                type="button"
                onClick={() => { void connectPrintify(); }}
                disabled={!provider || !isLiveProvider || !token.trim() || loadingApi || connected}
                className={`absolute top-1.5 min-h-[32px] rounded-lg px-3 text-sm font-medium transition-colors ${connected ? "right-24 bg-emerald-500 text-white" : "right-1.5 bg-violet-600 text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"}`}
              >
                {loadingApi ? "Connecting..." : connected ? "Connected" : "Connect"}
              </button>
              {connected ? (
                <button
                  type="button"
                  onClick={() => { void disconnectPrintify(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:text-white"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>

          {apiStatus ? <p className="mt-3 text-sm text-amber-300">{apiStatus}</p> : null}
        </Box>

        <Box className="border-slate-200/80 bg-white/92 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.35)] dark:border-slate-800/90 dark:bg-slate-950/95">
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
            className={`cursor-pointer rounded-[22px] border border-dashed px-4 py-3.5 text-sm text-slate-600 transition-all duration-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900 ${guidanceStep === "import" ? "border-violet-400/80 bg-violet-50/70 shadow-[0_0_0_1px_rgba(124,58,237,0.16),0_18px_50px_-30px_rgba(124,58,237,0.45)] dark:border-violet-500/60 dark:bg-violet-950/20" : "border-slate-300/90 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-900/55"} ${connected && images.length > 0 ? "ring-1 ring-emerald-400/20" : ""}`}
          >
            {guidanceStep === "import" ? <div className="pointer-events-none absolute inset-x-4 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-violet-500/80 to-transparent" /> : null}
            <div className="min-w-0 space-y-2 text-left">
              <div className="min-w-0 space-y-1">
                <div className="font-medium text-slate-900 dark:text-slate-100">Drag images here or click <span className="text-violet-600 dark:text-violet-400">Add Images</span></div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Quantum AI generates listings and flags items for review.</div>
              </div>
              <div className="relative overflow-hidden px-0.5 pb-1.5 pt-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={getStatusIndicatorClass("ready")} />
                      <span>{readyCount} Ready</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={getStatusIndicatorClass("review")} />
                      <span>{reviewCount} Needs Review</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={getStatusIndicatorClass("error")} />
                      <span>{errorCount} Failed</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span>{skippedCount} Skipped</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span>x = Remove</span>
                    </div>
                  </div>
                  <span
                    role="button"
                    tabIndex={images.length ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!images.length) return;
                      setImages([]);
                      setSelectedId("");
                      setMessage("");
                      setBatchResults([]);
                      setRunStatus("");
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (!images.length) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setImages([]);
                        setSelectedId("");
                        setMessage("");
                        setBatchResults([]);
                        setRunStatus("");
                      }
                    }}
                    className={`text-[11px] font-medium transition-colors ${images.length ? "cursor-pointer text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400" : "cursor-default text-slate-400 opacity-40 dark:text-slate-600"}`}
                  >
                    Clear All
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                    <span className={getLoadingIndicatorClass()} />
                    <span>{processingCount} Loading</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-sky-200/90 dark:ring-sky-900/60" />
                    <span>{completedGenerationCount} Complete</span>
                  </div>
                  <span className="shrink-0 text-slate-500 dark:text-slate-400">{generationProgressPct}%</span>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-slate-200/90 dark:bg-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${processingCount > 0 ? "bg-violet-500" : "bg-sky-500"}`}
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
                    ? "border-violet-300 dark:border-violet-500/40"
                    : img.status === "ready"
                      ? "border-emerald-300 dark:border-emerald-500/40"
                      : img.status === "review"
                        ? "border-amber-300 dark:border-amber-500/40"
                        : img.status === "error"
                          ? "border-rose-300 dark:border-rose-500/40"
                          : "border-slate-200 dark:border-slate-800";
                  const previewAlignRight = (index + 1) % 10 === 0 || (index + 1) % 10 === 9;
                  const previewOpenUp = sortedImages.length - index <= 10;
                  return (
                    <div
                      key={img.id}
                      onClick={() => setSelectedId(img.id)}
                      className={`rounded-xl border p-1.5 transition-all duration-500 ${isProcessing ? "border-violet-300 bg-violet-50/80 shadow-[0_12px_32px_-24px_rgba(124,58,237,0.45)] dark:border-violet-500/45 dark:bg-violet-950/20" : isSelected ? "border-violet-500 bg-violet-50/50 dark:border-violet-500 dark:bg-violet-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}
                    >
                      <div className="space-y-1.5">
                        <div className="relative">
                          {isProcessing ? <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-px animate-pulse bg-gradient-to-r from-transparent via-violet-500/80 to-transparent" /> : null}
                          <div className={`group relative flex aspect-square w-full items-center justify-center overflow-visible rounded-lg border transition-all duration-500 ${previewFrameTone}`}>
                            {isProcessing ? <div className="pointer-events-none absolute inset-0 rounded-lg border border-violet-400/80 animate-pulse dark:border-violet-400/60" /> : null}
                            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] bg-white p-1.5 dark:bg-slate-950">
                              {img.preview ? <img src={img.preview} alt={img.final} className="max-h-full max-w-full object-contain" /> : null}
                            </div>
                            <button
                              type="button"
                              aria-label="remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePreviewItem(img.id);
                              }}
                              className="absolute bottom-1 right-1 z-20 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/92 p-0 text-[8px] font-normal leading-none text-slate-500 shadow-sm transition-colors hover:text-rose-500 dark:bg-slate-950/90 dark:text-slate-400 dark:hover:text-rose-400"
                            >
                              x
                            </button>
                            {img.preview ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-40 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl group-hover:block dark:border-slate-800 dark:bg-slate-950 ${previewOpenUp ? "bottom-full mb-2" : "top-0"} ${previewAlignRight ? "right-0" : "left-0"}`}>
                                <img src={img.preview} alt={img.final} className="max-h-48 w-full object-contain" />
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-1">
                          {(["ready", "review", "error"] as const).map((status) => {
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
          <div className={`relative grid gap-3 rounded-xl transition-all duration-500 ${guidanceStep === "template" ? "border border-violet-200/80 bg-violet-50/50 p-3 shadow-[0_18px_50px_-32px_rgba(124,58,237,0.35)] dark:border-violet-500/30 dark:bg-violet-950/15" : ""}`}>
            {guidanceStep === "template" ? <div className="pointer-events-none absolute inset-x-4 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-violet-500/80 to-transparent" /> : null}
            <div className="grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
              <div>
                <Select
                  value={shopId}
                  className={shopId ? "text-[13px] font-normal text-slate-900 dark:text-slate-100" : "font-medium text-slate-500 dark:text-slate-400"}
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

              <div>
                <Select
                  value={productId}
                  className={productId ? "text-[13px] font-normal text-slate-900 dark:text-slate-100" : "font-medium text-slate-500 dark:text-slate-400"}
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

          <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
          {!canShowDetailPanel ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Select a shop and product to open the review area.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid items-stretch gap-3 lg:grid-cols-[296px_minmax(0,1fr)]">
              <div className="flex h-full flex-col">
                <div className="space-y-1.5">
                  <div className="flex min-h-[20px] items-center text-sm font-medium leading-5 tracking-tight text-slate-700 dark:text-slate-300">Uploaded Artwork</div>
                  <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-4 lg:h-[19rem] dark:border-slate-800 dark:bg-slate-950">
                    {selectedImage?.preview ? (
                      <img src={selectedImage.preview} alt={selectedImage.final} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/90 px-6 text-center transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-900"
                      >
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Drag images here</span>
                        <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">or click Add Images</span>
                      </button>
                    )}
                    <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-white/92 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-950/90 dark:text-slate-400">
                      Draft upload only. Review before publishing.
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                <Button
                  className="w-full !bg-violet-600 !text-white hover:!bg-violet-500 dark:!bg-violet-600 dark:hover:!bg-violet-500"
                  disabled={uploadDisabled}
                  onClick={() => { void runDraftBatch(); }}
                >
                  {isRunningBatch ? "Uploading Draft Products..." : "Upload Draft Products"}
                </Button>
                  {runStatus ? <p className="text-sm text-slate-600 dark:text-slate-400">{runStatus}</p> : null}
                  {batchResults.length > 0 ? (
                    <div className="max-h-[14rem] overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="space-y-1.5">
                        {batchResults.map((result) => (
                          <div key={`${result.fileName}-${result.title}`} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                            <div className="font-medium">{result.title}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{result.fileName}</div>
                            <div className="mt-1 text-sm">{result.message}</div>
                            {result.productId ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Product ID: {result.productId}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex h-full flex-col space-y-3">
                <Field label="Final Title">
                  <div className="flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3 py-0 text-left text-sm font-normal leading-5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {detailTitle}
                  </div>
                </Field>

                <Field label="Final Description">
                  <div className="min-h-[264px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 lg:h-[17rem] lg:overflow-y-auto">
                    <div className="flex min-h-full items-center">
                      <div className="w-full whitespace-pre-wrap text-left">
                        {htmlToEditableText(detailDescription)}
                      </div>
                    </div>
                  </div>
                </Field>
              </div>
              </div>

              {canShowReviewDetail ? (
              <div className="pt-0.5">
                <div className="grid gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                  <div className="flex min-h-[34px] items-center justify-center rounded-xl border border-slate-900/90 bg-slate-950 px-2.5 py-1.5 text-center text-sm dark:border-slate-700">
                    <span className="font-semibold text-violet-500">Quantum</span>
                    <span className="ml-1 font-semibold text-white">AI</span>
                    <span className="ml-1 font-semibold text-emerald-400">Tags</span>
                  </div>
                  {detailTags.map((tag, index) => (
                    <div
                      key={`${selectedImage?.id || productId}-tag-${index}`}
                      title={tag}
                      className="flex min-h-[34px] items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-center text-sm leading-5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
