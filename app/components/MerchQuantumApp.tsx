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
  | "lulu_direct"
  | "tshirtgang";

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

function safeTitle(value: string, fallback: string) {
  return value.replace(/\s+/g, " ").trim() || fallback;
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
        `It fits naturally into seasonal collections, self-care moments, and home accents that need a warm atmosphere with a polished, gift-ready presentation.`,
      ];
    case "bath-body":
      return [
        `${productName} brings a ${theme} touch to self-care routines, everyday use, and giftable bath and body collections.`,
        `It works well for practical personal care, simple pampering, and lifestyle assortments that benefit from a cleaner, more polished presentation.`,
      ];
    case "home-kitchen":
      return [
        `${productName} brings a ${theme} touch to the home, combining useful function with a more gift-ready presentation.`,
        `It fits well in kitchen, décor, and household collections where buyers want something practical, visually appealing, and easy to enjoy day after day.`,
      ];
    case "wall-art":
      return [
        `${productName} brings a ${theme} statement to walls, workspaces, and giftable décor collections.`,
        `It suits home styling, office setups, and design-forward spaces that need a stronger focal point with clean presentation and everyday visual appeal.`,
      ];
    case "sticker":
      return [
        `${productName} adds a ${theme} hit of personality to laptops, water bottles, notebooks, bundles, and low-ticket gift add-ons.`,
        `It works well for casual everyday use, niche drops, and collectible-style assortments that benefit from fast, easy visual appeal.`,
      ];
    case "bag":
      return [
        `${productName} brings a ${theme} look to daily carry, errands, travel, and giftable accessory collections.`,
        `It fits naturally into practical lifestyle use while still giving the design enough presence to feel intentional, polished, and easy to merchandize.`,
      ];
    case "accessory":
      return [
        `${productName} brings a ${theme} touch to everyday use, gift giving, and simple accessory styling.`,
        `It works best in collections that need something practical, easy to wear or use, and cleanly presented without losing the personality of the design.`,
      ];
    case "footwear":
      return [
        `${productName} brings a ${theme} look to casual footwear built for comfort, daily wear, and giftable style.`,
        `It fits naturally into easygoing outfits, everyday routines, and apparel assortments that benefit from comfort, personality, and a more polished finish.`,
      ];
    default:
      return [
        `${productName} brings a ${theme} look to a product built for everyday use, gift appeal, and clearer presentation.`,
        `It works well in collections that need practical value, a stronger visual identity, and a more complete product description before the template details begin.`,
      ];
  }
}

function paragraphsToHtml(paragraphs: string[]) {
  return paragraphs
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function sectionsToHtml(sections: TemplateSection[]) {
  return sections
    .map((section) => {
      const heading = `<h3>${escapeHtml(section.heading)}</h3>`;
      const paragraphs = paragraphsToHtml(section.paragraphs);
      const bullets = section.bullets.length
        ? `<ul>${section.bullets
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")}</ul>`
        : "";

      return `${heading}${paragraphs}${bullets}`;
    })
    .join("");
}

function buildDescription(title: string, templateDescription: string, leadOverride?: string[]) {
  const base =
    formatTemplateDescription(templateDescription) ||
    "Template description will load here after live API wiring.";
  const parsed = parseTemplateDescription(base);
  const leadParagraphs = normalizeAiLeadParagraphs(leadOverride || buildLeadParagraphs(title, templateDescription));
  const introParagraphs = dedupeParagraphs([...leadParagraphs, ...parsed.introParagraphs]);

  return `${paragraphsToHtml(introParagraphs)}${sectionsToHtml(parsed.sections)}`.trim();
}

function canonicalTagKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ")
    .trim();
}

function normalizeTagCandidate(value: string) {
  const cleaned = cleanTitle(value)
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  if (cleaned.length < 2 || cleaned.length > 30) return "";
  return cleaned;
}

function buildPhraseCandidates(title: string) {
  const words = title
    .replace(/[^A-Za-z0-9&' ]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 16);

  const phrases: string[] = [];

  for (let size = 4; size >= 2; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      phrases.push(words.slice(index, index + size).join(" "));
    }
  }

  for (const word of words) {
    phrases.push(word);
  }

  return phrases;
}

function buildThemeTags(title: string) {
  const lower = title.toLowerCase();
  if (/(christian|jesus|faith|saved|forgiven|church|bible|gospel|cross)\b/.test(lower)) {
    return ["Faith Inspired", "Christian Gift", "Religious Graphic"];
  }
  if (/(funny|humor|sarcastic|joke)\b/.test(lower)) {
    return ["Funny Graphic", "Humor Gift", "Conversation Starter"];
  }
  if (/(retro|vintage|distressed)\b/.test(lower)) {
    return ["Vintage Style", "Retro Graphic"];
  }
  if (/(dog|cat|pet|puppy)\b/.test(lower)) {
    return ["Pet Lover Gift", "Animal Graphic"];
  }
  if (/(halloween|fall|thanksgiving|christmas|holiday)\b/.test(lower)) {
    return ["Seasonal Gift", "Holiday Graphic"];
  }
  return [];
}

function buildFamilyTags(family: ProductFamily) {
  switch (family) {
    case "t-shirt":
      return ["Graphic Tee", "Unisex T Shirt", "Everyday Apparel"];
    case "hoodie":
      return ["Graphic Hoodie", "Cozy Apparel", "Layered Style"];
    case "sweatshirt":
      return ["Graphic Sweatshirt", "Casual Fleece", "Giftable Apparel"];
    case "tank top":
      return ["Graphic Tank", "Warm Weather Style", "Lightweight Apparel"];
    case "hat":
      return ["Graphic Hat", "Casual Accessory", "Everyday Cap"];
    case "drinkware":
      return ["Giftable Drinkware", "Daily Use Cup", "Desk Friendly"];
    case "candle":
      return ["Giftable Candle", "Home Fragrance", "Cozy Decor"];
    case "bath-body":
      return ["Bath And Body", "Self Care Gift", "Personal Care"];
    case "home-kitchen":
      return ["Home Kitchen Decor", "Gift Ready Home", "Useful Houseware"];
    case "wall-art":
      return ["Wall Art Decor", "Giftable Artwork", "Home Accent"];
    case "sticker":
      return ["Sticker Design", "Laptop Sticker", "Bottle Decal"];
    case "bag":
      return ["Everyday Bag", "Giftable Accessory", "Carryall Style"];
    case "accessory":
      return ["Graphic Accessory", "Gift Ready", "Lifestyle Item"];
    case "footwear":
      return ["Casual Footwear", "Graphic Slides", "Comfort Style"];
    default:
      return ["Gift Ready", "Everyday Use"];
  }
}

function buildTags(title: string, description: string, count: number) {
  if (count <= 0) return [];

  const searchableDescription = stripHtml(description);
  const family = resolveProductFamily(title, searchableDescription);
  const candidates = [
    ...buildPhraseCandidates(title),
    ...buildFamilyTags(family),
    ...buildThemeTags(title),
    ...buildPhraseCandidates(searchableDescription).slice(0, 12),
    getFamilyLabel(family),
  ];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const candidate of candidates) {
    const formatted = normalizeTagCandidate(candidate);
    const key = canonicalTagKey(formatted);
    if (!formatted || !key || seen.has(key)) continue;
    seen.add(key);
    tags.push(formatted);
    if (tags.length >= count) break;
  }

  return tags.slice(0, count);
}

function isImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
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
  if (!raw) return "Live provider connection is not available in this preview.";
  if (raw.includes("UnsupportedHttpVerb")) {
    return "Live Printify connection is not available in this preview. The backend API route is not installed in this environment yet.";
  }
  if (raw.startsWith("<?xml")) {
    return "Live Printify connection is not available in this preview. The request reached a static host instead of a backend API route.";
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

function Box({
  title,
  actions,
  children,
  className,
  headerClassName,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  const showHeader = !!title || !!actions;
  return (
    <div className={`rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-sm shadow-slate-200/60 transition-colors dark:border-slate-800 dark:bg-slate-950 ${className || ""}`.trim()}>
      {showHeader ? (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${headerClassName || ""}`.trim()}>
          <h2 className="text-[1.05rem] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium tracking-tight text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[0.8rem] leading-5 text-slate-500 dark:text-slate-400">{children}</p>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-400 ${props.className || ""}`.trim()}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-400 ${props.className || ""}`.trim()}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-400 ${props.className || ""}`.trim()}
    />
  );
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  }
) {
  const variant = props.variant || "primary";
  const classes =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-500"
      : variant === "secondary"
        ? "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
        : "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900";

  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes} ${props.className || ""}`.trim()}
    />
  );
}

function Badge({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${on ? "bg-slate-900 text-white dark:bg-violet-600" : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
    >
      {children}
    </span>
  );
}

function BrandMark() {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <span className="absolute left-[10px] top-[13px] z-10 text-[2rem] font-semibold leading-none text-violet-500">
        M
      </span>
      <span className="absolute right-[8px] top-[8px] text-[2.45rem] font-semibold leading-none text-white">
        Q
      </span>
    </div>
  );
}


function getStatusMeta(status: ReviewStatus) {
  switch (status) {
    case "ready":
      return { label: "Ready", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-200 dark:ring-emerald-900/60" };
    case "review":
      return { label: "Needs Review", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", ring: "ring-amber-200 dark:ring-amber-900/60" };
    case "error":
      return { label: "Error", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400", ring: "ring-rose-200 dark:ring-rose-900/60" };
    default:
      return { label: "Processing", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-400", ring: "ring-slate-200 dark:ring-slate-800" };
  }
}

function getStatusSortValue(status: ReviewStatus) {
  switch (status) {
    case "error":
      return 0;
    case "review":
      return 1;
    case "pending":
      return 2;
    case "ready":
    default:
      return 3;
  }
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
      return "bg-slate-300 ring-slate-200 dark:bg-slate-700 dark:ring-slate-800";
  }
}

function htmlToEditableText(html: string) {
  return stripHtml(html)
    .split("\n")
    .map((line) => line.replace(/^[\s\u00a0]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function editableTextToHtml(value: string) {
  const paragraphs = value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return paragraphsToHtml(paragraphs);
}

function buildLeadOnlyDescription(leadParagraphs: string[]) {
  return paragraphsToHtml(normalizeAiLeadParagraphs(leadParagraphs));
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
  const [source, setSource] = useState<"" | "product" | "manual">("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [nickname, setNickname] = useState("");
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
  const availableShops = connected && isLiveProvider ? (apiShops.length ? apiShops : FALLBACK_SHOPS) : [];
  const productSource = apiProducts.length ? apiProducts : FALLBACK_PRODUCTS;
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
  const readyCount = images.filter((img) => img.status === "ready").length;
  const reviewCount = images.filter((img) => img.status === "review").length;
  const errorCount = images.filter((img) => img.status === "error").length;
  const processingCount = images.filter((img) => img.status === "pending" || img.aiProcessing).length;
  const uploadDisabled = !connected || !template || images.length === 0 || isRunningBatch || processingCount > 0;
  const guidanceStep = !connected
    ? "connect"
    : images.length === 0
      ? "import"
      : !shopId || !source || !template
        ? "template"
        : "settled";
  const templateConfirmation = template ? `Selected template: ${template.nickname}` : "";
  const skippedCount = Array.from(message.matchAll(/Skipped (\d+)/g)).reduce((total, [, count]) => total + Number(count || 0), 0);

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
    if (!selectedImage || selectedImage.artworkBounds) return;

    let cancelled = false;
    void analyzeArtworkBounds(selectedImage.file)
      .then((bounds) => {
        if (cancelled) return;
        setImages((current) =>
          current.map((img) => (img.id === selectedImage.id ? { ...img, artworkBounds: bounds } : img))
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  useEffect(() => {
    if (!images.length) return;
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
    if (!connected || !isLiveProvider || !shopId || source !== "product") return;
    if (loadingProducts || apiProducts.some((product) => product.shopId === shopId)) return;
    void loadProductsForShop(shopId);
  }, [connected, isLiveProvider, shopId, source, loadingProducts, apiProducts]);

  useEffect(() => {
    if (source !== "product" || !shopId || !productId) return;
    void loadProductTemplate(productId);
  }, [source, shopId, productId]);

  useEffect(() => {
    if (source !== "manual" || !shopId) return;
    const ref = normalizeRef(manualRef);
    if (!ref) return;

    const timeout = setTimeout(() => {
      loadManualTemplate(ref, nickname);
    }, 250);

    return () => clearTimeout(timeout);
  }, [source, shopId, manualRef, nickname]);

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
              title: safeTitle(nextImage.final, nextImage.cleaned),
              fileName: nextImage.name,
              productFamily: resolveProductFamily(nextImage.final, templateDescription),
              templateContext: buildTemplateContext(templateDescription),
            }),
          },
          60000
        );

        const data = await parseResponsePayload(response);
        if (!response.ok) {
          throw new Error(data?.error || `Quantum AI request failed with status ${response.status}.`);
        }

        const rawParagraphs = Array.isArray(data?.leadParagraphs)
          ? data.leadParagraphs
          : [data?.leadParagraph1, data?.leadParagraph2].filter(Boolean);
        const leadParagraphs = normalizeAiLeadParagraphs(rawParagraphs.length ? rawParagraphs : buildLeadParagraphs(nextImage.cleaned, templateDescription));
        const finalTitle = safeTitle(trimToSentence(String(data?.title || nextImage.cleaned), AI_TITLE_MAX_CHARS), nextImage.cleaned);
        const finalDescription = templateDescription.trim()
          ? buildDescription(finalTitle, templateDescription, leadParagraphs)
          : buildLeadOnlyDescription(leadParagraphs);
        const tags = buildTags(finalTitle, finalDescription, FIXED_TAG_COUNT);
        const confidence = typeof data?.confidence === "number" ? clamp(data.confidence, 0, 1) : 0.8;
        const reasonFlags = Array.isArray(data?.reasonFlags)
          ? data.reasonFlags.filter((flag: unknown) => typeof flag === "string" && flag.trim())
          : [];
        const status: ReviewStatus = confidence >= 0.78 && reasonFlags.length === 0 ? "ready" : "review";
        const statusReason = status === "ready"
          ? "Quantum AI is confident in this listing."
          : reasonFlags[0] || "This item may need a quick review before upload.";

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
      setApiStatus((current) => (current.startsWith("Unable to load products") ? "" : current));
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
      const firstShopId = shopsFromApi[0]?.id || FALLBACK_SHOPS[0].id;
      setShopId(firstShopId);
      setPulseConnected(true);
      setTimeout(() => setPulseConnected(false), 1200);
      void loadProductsForShop(firstShopId);
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
      setNickname(title);
      setManualRef(chosen?.id || fallback.id);
      setTemplateDescription(base);
    } catch (error) {
      const title = fallback.title;
      const base = formatTemplateDescription(
        fallback.description?.trim() ||
          `${title}. This is the base description from your saved template. Live product descriptions from Printify will replace this placeholder after API wiring.`
      );

      setTemplate({
        reference: fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
        placementGuide: template?.placementGuide || DEFAULT_PLACEMENT_GUIDE,
      });
      setNickname(title);
      setManualRef(fallback.id);
      setTemplateDescription(base);
    }
  }

  function loadManualTemplate(nextManualRef = manualRef, nextNickname = nickname) {
    const ref = normalizeRef(nextManualRef);
    if (!ref || !shopId) return;
    const name = safeTitle(nextNickname, "Template");
    const base = formatTemplateDescription(templateDescription.trim()) ||
      "Base description from the user template goes here until live API wiring is added.";

    setTemplate({
      reference: ref,
      nickname: name,
      source: "manual",
      shopId,
      description: base,
      placementGuide: template?.placementGuide || DEFAULT_PLACEMENT_GUIDE,
    });
    setTemplateDescription(base);
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
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-4">
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
          className={`relative overflow-hidden border-slate-900/90 bg-slate-950 text-white shadow-[0_28px_80px_-40px_rgba(15,23,42,0.9)] dark:border-slate-800 ${guidanceStep === "connect" ? "ring-1 ring-violet-500/40 shadow-[0_28px_90px_-40px_rgba(124,58,237,0.45)]" : connected ? "ring-1 ring-emerald-500/30" : ""}`}
          headerClassName="mb-5"
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
                readOnly={connected}
                placeholder="Provider Personal Access Token (API)"
                onChange={(e) => setToken(e.target.value)}
                className={`pr-32 ${connected ? "pr-52" : ""}`}
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
            <div className="space-y-1">
              <div className="font-medium text-slate-900 dark:text-slate-100">Drag images here or click <span className="text-violet-600 dark:text-violet-400">Add Images</span></div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Powered by Quantum AI. It generates listing copy automatically and flags anything that needs review.</div>
            </div>
          </div>
          
          <div className="mt-4">
          <div className="px-0.5 py-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <div className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300/80 dark:ring-emerald-900/70" />
                  <span>{readyCount}</span>
                  Approved / Ready
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-300/80 dark:ring-amber-900/70" />
                  <span>{reviewCount}</span>
                  Needs Review
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-300/80 dark:ring-rose-900/70" />
                  <span>{errorCount}</span>
                  Rejected / Error
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span>{skippedCount}</span>
                  Skipped
                </div>
                <div className="inline-flex items-center gap-1.5">X = Remove</div>
              </div>
              <span
                role="button"
                tabIndex={images.length ? 0 : -1}
                onClick={() => {
                  if (!images.length) return;
                  setImages([]);
                  setSelectedId("");
                  setMessage("");
                  setBatchResults([]);
                  setRunStatus("");
                }}
                onKeyDown={(e) => {
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
                className={`text-sm font-medium transition-colors ${images.length ? "cursor-pointer text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400" : "cursor-default text-slate-400 opacity-40 dark:text-slate-600"}`}
              >
                Clear All
              </span>
            </div>
          </div>

          {sortedImages.length > 0 ? (
            <div className="mt-3">
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                {sortedImages.map((img, index) => {
                  const isSelected = selectedImage?.id === img.id;
                  const previewAlignRight = (index + 1) % 10 === 0 || (index + 1) % 10 === 9;
                  const previewOpenUp = sortedImages.length - index <= 10;
                  return (
                    <div
                      key={img.id}
                      onClick={() => setSelectedId(img.id)}
                      className={`rounded-xl border p-1.5 transition-colors ${isSelected ? "border-violet-500 bg-violet-50/50 dark:border-violet-500 dark:bg-violet-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}
                    >
                      <div className="space-y-1.5">
                        <div className="relative">
                          <div className="group relative flex aspect-square w-full items-center justify-center overflow-visible rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900">
                            {img.preview ? <img src={img.preview} alt={img.final} className="max-h-full max-w-full object-contain" /> : null}
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
                                className={`h-3 w-3 rounded-full ring-2 shadow-sm transition-transform hover:scale-105 ${isActive ? getStatusTone(status) : getStatusTone("pending")}`}
                              />
                            );
                          })}
                          <button
                            type="button"
                            aria-label="remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePreviewItem(img.id);
                            }}
                            className="inline-flex h-3.5 w-3.5 items-center justify-center text-[9px] font-semibold text-slate-500 transition-colors hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400"
                          >
                            X
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          </div>

          <div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800">
          <div className={`relative grid gap-3 rounded-xl transition-all duration-500 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ${guidanceStep === "template" ? "border border-violet-200/80 bg-violet-50/50 p-3 shadow-[0_18px_50px_-32px_rgba(124,58,237,0.35)] dark:border-violet-500/30 dark:bg-violet-950/15" : ""}`}>
            {guidanceStep === "template" ? <div className="pointer-events-none absolute inset-x-4 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-violet-500/80 to-transparent" /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Select
                  value={shopId}
                  disabled={!availableShops.length}
                  onChange={(e) => {
                    const nextShopId = e.target.value;
                    setShopId(nextShopId);
                    setProductId("");
                    setTemplate(null);
                    if (connected && isLiveProvider && nextShopId) void loadProductsForShop(nextShopId);
                  }}
                >
                  <option value="">Select shop</option>
                  {availableShops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.title}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Select value={source} onChange={(e) => {
                  setSource(e.target.value as "" | "product" | "manual");
                  setTemplate(null);
                }}>
                  <option value="">Template Source</option>
                  <option value="product">Choose From My Products</option>
                  <option value="manual">Paste Product Reference</option>
                </Select>
              </div>
            </div>

            {source === "product" ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div>
                  <Select value={productId} disabled={!shopId || loadingProducts} onChange={(e) => setProductId(e.target.value)}>
                    <option value="">{loadingProducts ? "Loading products..." : "Choose product"}</option>
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
            ) : source === "manual" ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div>
                  <Input value={manualRef} onChange={(e) => setManualRef(e.target.value)} placeholder="Paste Product Reference" />
                </div>
                <div>
                  <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Template Nickname" />
                </div>
              </div>
            ) : (
              <div />
            )}
          </div>

          {templateConfirmation ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{templateConfirmation}</p> : null}
          </div>

          <div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800">
          {!selectedImage ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Select a batch item to review the larger artwork preview, final title, final description, and tags.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[296px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="text-sm font-medium tracking-tight text-slate-700 dark:text-slate-300">Uploaded Artwork</div>
                <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-4 lg:h-[19rem] dark:border-slate-800 dark:bg-slate-950">
                  {selectedImage.preview ? (
                    <img src={selectedImage.preview} alt={selectedImage.final} className="max-h-full max-w-full object-contain" />
                  ) : null}
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-white/92 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-950/90 dark:text-slate-400">
                    Draft upload only. Review before publishing.
                  </div>
                </div>
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

              <div className="space-y-3 pt-px">
                <Field label="Final Title">
                  <div className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {selectedImage.final}
                  </div>
                </Field>

                <Field label="Final Description">
                  <div className="min-h-[316px] whitespace-pre-wrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {htmlToEditableText(selectedImage.finalDescription || "")}
                  </div>
                </Field>
              </div>
              </div>

              <div className="space-y-2.5">
                <div className="text-sm font-medium tracking-tight text-slate-700 dark:text-slate-300">Tags</div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {(selectedImage.tags || []).map((tag, index) => (
                    <div
                      key={`${selectedImage.id}-tag-${index}`}
                      className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
        </Box>
      </div>
    </div>
  );
}
