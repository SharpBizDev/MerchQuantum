'use client';

import React, { useMemo, useRef, useState } from "react";

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

type Img = {
  id: string;
  name: string;
  preview: string;
  cleaned: string;
  final: string;
};

type Template = {
  reference: string;
  nickname: string;
  source: "product" | "manual";
  shopId: string;
  description: string;
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
};

type BatchResult = {
  fileName: string;
  title: string;
  productId?: string;
  message: string;
};

type ProviderOption = {
  id: ProviderId;
  label: string;
  isLive: boolean;
  statusText?: string;
};

const PROVIDERS: ProviderOption[] = [
  { id: "printify", label: "Printify", isLive: true },
  { id: "printful", label: "Printful", isLive: false, statusText: "Coming soon" },
  { id: "gelato", label: "Gelato", isLive: false, statusText: "Coming soon" },
  { id: "gooten", label: "Gooten", isLive: false, statusText: "Coming soon" },
  { id: "apliiq", label: "Apliiq", isLive: false, statusText: "Coming soon" },
  { id: "spod", label: "SPOD / Spreadconnect", isLive: false, statusText: "Coming soon" },
  { id: "prodigi", label: "Prodigi", isLive: false, statusText: "Coming soon" },
  { id: "lulu_direct", label: "Lulu Direct", isLive: false, statusText: "Coming soon" },
  { id: "tshirtgang", label: "Tshirtgang", isLive: false, statusText: "Coming soon" },
];

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

function resolveProductFamily(title: string, templateDescription: string): ProductFamily {
  const templateFamily = detectProductFamilyFromText(templateDescription);
  const titleFamily = detectProductFamilyFromText(title);

  if (templateFamily) return templateFamily;
  if (titleFamily) return titleFamily;
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
        `${productName} is a ${theme} graphic tee built for everyday wear, easy layering, and clear niche appeal.`,
        `It is designed to read cleanly in a listing, wear comfortably through daily use, and carry the kind of polished product copy that works well for personal wear, gifting, and apparel collections with a strong point of view.`,
      ];
    case "hoodie":
      return [
        `${productName} is a ${theme} hoodie built for comfort, cooler weather, and easy casual layering.`,
        `It fits naturally into giftable apparel drops, everyday streetwear styling, and niche collections that need warmer weight, clean presentation, and a stronger listing presence.`,
      ];
    case "sweatshirt":
      return [
        `${productName} is a ${theme} sweatshirt designed for comfort, clean graphic presentation, and relaxed everyday wear.`,
        `It works well for casual wardrobes, seasonal drops, and gift-ready apparel listings that benefit from a familiar fit and straightforward, polished copy.`,
      ];
    case "tank top":
      return [
        `${productName} is a ${theme} tank top built for lightweight comfort, warm-weather styling, and easy everyday wear.`,
        `It is a strong fit for casual apparel collections, gym-to-weekend use, and giftable listings that need clear product language without sounding generic or flat.`,
      ];
    case "hat":
      return [
        `${productName} is a ${theme} headwear piece that adds an easy finishing touch to casual outfits and giftable accessory lines.`,
        `It is built for everyday rotation, simple grab-and-go styling, and clean merchandising across niche collections where the product title needs to match the item clearly.`,
      ];
    case "drinkware":
      return [
        `${productName} is a ${theme} drinkware listing designed for daily use, desk setups, gifting, and practical personal style.`,
        `It fits well in lifestyle assortments that need a product description with better structure, clearer benefits, and a more polished sales presentation than a short generic placeholder.`,
      ];
    case "candle":
      return [
        `${productName} is a ${theme} candle built for atmosphere, thoughtful gifting, and décor-driven product lines.`,
        `It is positioned for cozy spaces, seasonal collections, and lifestyle shops that benefit from stronger descriptive copy while still keeping the original product details intact.`,
      ];
    case "bath-body":
      return [
        `${productName} is a ${theme} bath and body listing created for self-care, gifting, and clean personal-use merchandising.`,
        `It works best when the title clearly signals the item type, allowing the listing copy to stay aligned with the product and present it as a polished, market-ready offering.`,
      ];
    case "home-kitchen":
      return [
        `${productName} is a ${theme} home and kitchen item that balances usefulness, presentation, and gift-ready appeal.`,
        `It fits naturally into décor, kitchen, and household collections where buyers benefit from cleaner formatting, clearer product positioning, and easier-to-read details.`,
      ];
    case "wall-art":
      return [
        `${productName} is a ${theme} wall art listing built for home décor, office spaces, gifting, and standout niche presentation.`,
        `It is written to support a cleaner visual flow, stronger product relevance, and a more complete description than a short one-line placeholder can deliver.`,
      ];
    case "sticker":
      return [
        `${productName} is a ${theme} sticker listing made for laptops, water bottles, notebooks, bundles, and easy low-ticket gifting.`,
        `It works well in niche drops that need fast, readable product copy with better structure and stronger merchandising language.`,
      ];
    case "bag":
      return [
        `${productName} is a ${theme} bag listing built for daily carry, practical use, and giftable accessory collections.`,
        `It is suited to casual, travel, and lifestyle assortments that benefit from clearer formatting and a more complete description before the template details begin.`,
      ];
    case "accessory":
      return [
        `${productName} is a ${theme} accessory listing designed for practical use, gift appeal, and clean niche presentation.`,
        `It is written to keep the product type clear, preserve template details, and give the final listing a more complete and professional feel.`,
      ];
    case "footwear":
      return [
        `${productName} is a ${theme} footwear listing built for casual wear, giftable style, and standout niche presentation.`,
        `It works best when the title clearly identifies the item, allowing the supporting copy to stay aligned with the product and preserve its detailed template information.`,
      ];
    default:
      return [
        `${productName} is a ${theme} product listing built for clearer presentation, stronger search relevance, and better alignment with the selected template.`,
        `Accurate titles help the description stay matched to the product type while preserving the imported product details that matter to shoppers.`,
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

function buildDescription(title: string, templateDescription: string) {
  const base =
    formatTemplateDescription(templateDescription) ||
    "Template description will load here after live API wiring.";
  const parsed = parseTemplateDescription(base);
  const leadParagraphs = buildLeadParagraphs(title, templateDescription);
  const introParagraphs = dedupeParagraphs([...leadParagraphs, ...parsed.introParagraphs]);

  return `${paragraphsToHtml(introParagraphs)}${sectionsToHtml(parsed.sections)}`.trim();
}

function buildTags(title: string, description: string, count: number) {
  if (count <= 0) return [];

  const searchableDescription = stripHtml(description);
  const words = `${title} ${searchableDescription}`
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()));

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const word of words) {
    const formatted = cleanTitle(word);
    const key = formatted.toLowerCase();
    if (!formatted || seen.has(key)) continue;
    seen.add(key);
    tags.push(formatted);
    if (tags.length >= count) break;
  }

  const family = getFamilyLabel(resolveProductFamily(title, searchableDescription));
  const familyTag = cleanTitle(family);
  if (familyTag && !seen.has(familyTag.toLowerCase()) && tags.length < count) {
    tags.push(familyTag);
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

function formatApiError(message: string) {
  const raw = message.trim();
  if (!raw) return "Live provider connection is not available in this preview.";
  if (raw.includes("UnsupportedHttpVerb")) {
    return "Live Printify connection is not available in this preview. The backend API route is not installed in this environment yet.";
  }
  if (raw.startsWith("<?xml")) {
    return "Live Printify connection is not available in this preview. The request reached a static host instead of a backend API route.";
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

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-950">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{children}</p>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ${props.className || ""}`.trim()}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ${props.className || ""}`.trim()}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${props.className || ""}`.trim()}
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
      className={`rounded-xl px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${classes} ${props.className || ""}`.trim()}
    />
  );
}

function Badge({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs ${on ? "bg-slate-900 text-white dark:bg-violet-600" : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
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

export default function MerchQuantumApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [provider, setProvider] = useState<ProviderId>("printify");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [apiShops, setApiShops] = useState<Shop[]>([]);
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [shopId, setShopId] = useState("");
  const [source, setSource] = useState<"product" | "manual">("product");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [nickname, setNickname] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [saved, setSaved] = useState<Template[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);

  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || PROVIDERS[0];
  const isLiveProvider = selectedProvider.isLive;

  const availableShops = connected && isLiveProvider
    ? (apiShops.length ? apiShops : FALLBACK_SHOPS)
    : [];
  const productSource = apiProducts.length ? apiProducts : FALLBACK_PRODUCTS;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productSource.filter(
      (p) =>
        p.shopId === shopId &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q))
    );
  }, [shopId, search, productSource]);

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedId) || images[0] || null,
    [images, selectedId]
  );

  const previewDescription = selectedImage
    ? buildDescription(selectedImage.final, templateDescription)
    : templateDescription;

  const previewTags = selectedImage
    ? buildTags(selectedImage.final, previewDescription, FIXED_TAG_COUNT)
    : [];

  function resetProviderState(clearStatus = true) {
    setConnected(false);
    setLoadingApi(false);
    if (clearStatus) setApiStatus("");
    setApiShops([]);
    setApiProducts([]);
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
    const skippedByLimit = Math.max(
      0,
      Array.from(list).filter(isImage).length - valid.length
    );

    const results = await Promise.allSettled(
      valid.map(async (file) => {
        const cleaned = cleanTitle(file.name);
        return {
          id: makeId(),
          name: file.name,
          preview: await readDataUrl(file),
          cleaned,
          final: cleaned,
        } as Img;
      })
    );

    const good = results
      .filter((r): r is PromiseFulfilledResult<Img> => r.status === "fulfilled")
      .map((r) => r.value);

    const failed = results.length - good.length;

    setImages((current) => {
      const next = [...current, ...good];
      if (!selectedId && next[0]) setSelectedId(next[0].id);
      return next;
    });

    const parts: string[] = [];
    if (good.length)
      parts.push(`Loaded ${good.length} image${good.length === 1 ? "" : "s"}.`);
    if (skippedByType) {
      parts.push(
        `Skipped ${skippedByType} non-image file${skippedByType === 1 ? "" : "s"}.`
      );
    }
    if (skippedByLimit) {
      parts.push(
        `Skipped ${skippedByLimit} image${skippedByLimit === 1 ? "" : "s"} above the ${MAX_BATCH_FILES}-file batch cap.`
      );
    }
    if (failed)
      parts.push(`Failed to preview ${failed} image${failed === 1 ? "" : "s"}.`);
    setMessage(parts.join(" "));
  }

  async function loadProductsForShop(nextShopId: string) {
    if (!connected || !isLiveProvider || !nextShopId) {
      setApiProducts([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/printify/products?shopId=${encodeURIComponent(nextShopId)}`
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Products request failed with status ${response.status}.`);
      }

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
    } catch (error) {
      setApiProducts([]);
      const msg =
        error instanceof Error ? error.message : "Unable to load products.";
      setApiStatus(formatApiError(msg));
    }
  }

  async function connectPrintify() {
    if (!token.trim() || !isLiveProvider) return;
    setLoadingApi(true);
    setApiStatus("");

    try {
      const response = await fetch("/api/printify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `${selectedProvider.label} connect failed with status ${response.status}.`);
      }

      const shopsFromApi: Shop[] = Array.isArray(data?.shops)
        ? data.shops.map((shop: ApiShop) => ({
            id: String(shop.id),
            title: shop.title || `Shop ${shop.id}`,
          }))
        : [];

      setApiShops(shopsFromApi);
      setConnected(true);
      const firstShopId = shopsFromApi[0]?.id || FALLBACK_SHOPS[0].id;
      setShopId(firstShopId);
      setApiStatus(`Connected to ${selectedProvider.label}.`);
      void loadProductsForShop(firstShopId);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : `Unable to connect to ${selectedProvider.label}.`;
      resetProviderState(false);
      setApiStatus(formatApiError(msg));
    } finally {
      setLoadingApi(false);
    }
  }

  function disconnectPrintify() {
    resetProviderState(true);
  }

  async function loadProductTemplate() {
    const fallback = productSource.find((p) => p.id === productId);
    if (!fallback || !shopId) return;

    try {
      const response = await fetch(
        `/api/printify/product?shopId=${encodeURIComponent(
          shopId
        )}&productId=${encodeURIComponent(productId)}`
      );

      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Product request failed with status ${response.status}.`);
      }

      const chosen = data?.product || fallback;
      const title = chosen?.title || fallback.title;
      const base = formatTemplateDescription(
        chosen?.description?.trim() ||
          fallback.description?.trim() ||
          `${title}. This is the base description from your saved template. Live product descriptions from Printify will replace this placeholder after API wiring.`
      );

      setTemplate({
        reference: chosen?.id || fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
      });

      setNickname(title);
      setManualRef(chosen?.id || fallback.id);
      setTemplateDescription(base);
    } catch {
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
      });

      setNickname(title);
      setManualRef(fallback.id);
      setTemplateDescription(base);
    }
  }

  function loadManualTemplate() {
    const ref = normalizeRef(manualRef);
    if (!ref || !shopId) return;
    const name = safeTitle(nickname, "Template");
    const base =
      formatTemplateDescription(templateDescription.trim()) ||
      "Base description from the user template goes here until live API wiring is added.";

    setTemplate({
      reference: ref,
      nickname: name,
      source: "manual",
      shopId,
      description: base,
    });

    setNickname(name);
    setManualRef(ref);
    setTemplateDescription(base);
  }

  function saveTemplate() {
    if (!template) return;

    const nextTemplate = {
      ...template,
      nickname: safeTitle(nickname, template.nickname),
      description: templateDescription,
    };

    setTemplate(nextTemplate);
    setSaved((current) => {
      const idx = current.findIndex(
        (t) =>
          t.reference === nextTemplate.reference &&
          t.shopId === nextTemplate.shopId
      );
      if (idx === -1) return [...current, nextTemplate];
      const next = [...current];
      next[idx] = nextTemplate;
      return next;
    });
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
        const description = buildDescription(img.final, templateDescription);
        const tags = buildTags(img.final, description, FIXED_TAG_COUNT);

        setRunStatus(`Saving draft ${index + 1} of ${images.length}...`);

        try {
          const response = await fetch("/api/printify/batch-create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shopId,
              templateProductId: template.reference,
              items: [
                {
                  fileName: img.name,
                  title: safeTitle(img.final, img.cleaned),
                  description,
                  tags,
                  imageDataUrl: img.preview,
                },
              ],
            }),
          });

          const data = await parseResponsePayload(response);
          if (!response.ok) {
            throw new Error(data?.error || `Draft request failed with status ${response.status}.`);
          }

          const result = Array.isArray(data?.results) && data.results[0]
            ? (data.results[0] as BatchResult)
            : {
                fileName: img.name,
                title: safeTitle(img.final, img.cleaned),
                message: data?.message || "Created draft product.",
              };

          nextResults.push(result);
          setBatchResults([...nextResults]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Draft create failed.";
          nextResults.push({
            fileName: img.name,
            title: safeTitle(img.final, img.cleaned),
            message,
          });
          setBatchResults([...nextResults]);
        }
      }

      const createdCount = nextResults.filter((result) => !!result.productId).length;
      setRunStatus(`Saved ${createdCount} draft product${createdCount === 1 ? "" : "s"} out of ${images.length}.`);
    } finally {
      setIsRunningBatch(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900 transition-colors dark:bg-black dark:text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <BrandMark />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                <span className="text-violet-600">Merch</span>
                <span className="text-slate-900 dark:text-white">Quantum</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {APP_TAGLINE}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge on={connected}>
              {connected ? "Quantum connected" : "Quantum not connected"}
            </Badge>
            {connected ? (
              <Button variant="secondary" onClick={disconnectPrintify}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Box title="Quantum Connection">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Choose Provider">
                  <Select
                    value={provider}
                    onChange={(e) => {
                      const nextProvider = e.target.value as ProviderId;
                      setProvider(nextProvider);
                      resetProviderState(false);
                      const nextMeta = PROVIDERS.find((entry) => entry.id === nextProvider);
                      setApiStatus(nextMeta?.isLive ? "" : `${nextMeta?.label || "This provider"} is coming soon.`);
                    }}
                  >
                    {PROVIDERS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Provider API Token">
                  <div className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    Personal Access Token
                  </div>
                </Field>

                <Field label="Masked Preview">
                  <div className="max-w-[260px] overflow-hidden rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm whitespace-nowrap text-ellipsis dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {maskToken(token) || "No token entered"}
                  </div>
                  <FieldNote>Showing last 10 characters</FieldNote>
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                <Field label="Personal Access Token">
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste API key once"
                    disabled={!isLiveProvider}
                  />
                </Field>

                <div className="flex items-end">
                  <Button
                    onClick={() => {
                      void connectPrintify();
                    }}
                    disabled={!token.trim() || connected || loadingApi || !isLiveProvider}
                  >
                    {loadingApi ? "Connecting..." : "Connect"}
                  </Button>
                </div>
              </div>

              {apiStatus ? (
                <p className={`mt-3 text-sm ${connected ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {apiStatus}
                </p>
              ) : null}
            </Box>

            <Box title="Batch Setup">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Shop">
                  <Select
                    value={shopId}
                    onChange={(e) => {
                      const nextShopId = e.target.value;
                      setShopId(nextShopId);
                      setProductId("");
                      void loadProductsForShop(nextShopId);
                    }}
                    disabled={!connected || loadingApi}
                  >
                    <option value="">Select a shop</option>
                    {availableShops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.title}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Template Source">
                  <Select
                    value={source}
                    onChange={(e) => setSource(e.target.value as "product" | "manual")}
                    disabled={!isLiveProvider}
                  >
                    <option value="product">Choose From My Products</option>
                    <option value="manual">Paste Product Reference</option>
                  </Select>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Template Nickname">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Example: Unisex Tee Front Print"
                    disabled={!isLiveProvider}
                  />
                </Field>
              </div>

              {source === "product" ? (
                <div className="mt-4 space-y-4">
                  <Field label="Search My Products">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by title or type"
                      disabled={!connected || !shopId}
                    />
                  </Field>

                  <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-900">
                        <tr>
                          <th className="px-3 py-2 text-left">Use</th>
                          <th className="px-3 py-2 text-left">Example</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!connected || !shopId ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                              Connect and select a shop first.
                            </td>
                          </tr>
                        ) : visibleProducts.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                              No examples found.
                            </td>
                          </tr>
                        ) : (
                          visibleProducts.map((product) => (
                            <tr key={product.id} className="border-t border-slate-200 dark:border-slate-800">
                              <td className="px-3 py-2">
                                <input
                                  type="radio"
                                  name="template-product"
                                  checked={productId === product.id}
                                  onChange={() => setProductId(product.id)}
                                />
                              </td>
                              <td className="px-3 py-2">{product.title}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button onClick={loadProductTemplate} disabled={!productId || !shopId}>
                    Load Template Description
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Paste Product Reference
                  </div>
                  <Field label="Template Product Reference">
                    <Input
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      placeholder="Paste a Printify product ID or URL"
                      disabled={!isLiveProvider}
                    />
                  </Field>
                  <Button onClick={loadManualTemplate} disabled={!manualRef.trim() || !shopId}>
                    Load Manual Template
                  </Button>
                </div>
              )}

              <div className="mt-4">
                <Field label="Template Description Source">
                  <Textarea
                    rows={8}
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="This is where the loaded template description will appear after the selected product template is loaded."
                    disabled={!isLiveProvider}
                  />
                </Field>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <b>Loaded Template:</b> {template ? template.nickname : "None loaded"}
                </div>
                {template ? (
                  <div className="mt-1 break-all text-slate-600 dark:text-slate-400">
                    {template.reference} • {template.source} • Shop {template.shopId}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Title Signal">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    Filename / Final Title
                  </div>
                </Field>

                <Field label="Description Mode">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    Title + Template Matched
                  </div>
                </Field>

                <Field label="Tags">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    13 from Title + Description
                  </div>
                </Field>
              </div>

              <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                Clear product titles improve category matching, short-description accuracy, and alignment with the imported template description.
              </p>
            </Box>

            <Box title="Image Upload">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void addFiles(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
              >
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
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl dark:bg-slate-900">
                  🖼️
                </div>
                <p className="mt-4 font-medium">Drop images here or click to upload</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  File titles drive the listing title. Current prototype cap: {MAX_BATCH_FILES} images per batch.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => fileRef.current?.click()}>Add Images</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setImages([]);
                    setSelectedId("");
                    setMessage("");
                  }}
                  disabled={!images.length}
                >
                  Clear All
                </Button>
                <Badge>{images.length}/{MAX_BATCH_FILES}</Badge>
              </div>

              {message ? (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{message}</p>
              ) : null}
            </Box>

            <Box title="Batch Preview">
              <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-left">Preview</th>
                      <th className="px-3 py-2 text-left">Filename</th>
                      <th className="px-3 py-2 text-left">Suggested Title</th>
                      <th className="px-3 py-2 text-left">Final Title</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {images.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400">
                          No images loaded yet.
                        </td>
                      </tr>
                    ) : (
                      images.map((img) => (
                        <tr
                          key={img.id}
                          className={`border-t border-slate-200 dark:border-slate-800 ${selectedImage?.id === img.id ? "bg-slate-50 dark:bg-slate-900" : ""}`}
                          onClick={() => setSelectedId(img.id)}
                        >
                          <td className="px-3 py-2">
                            {img.preview ? (
                              <img
                                src={img.preview}
                                alt={safeTitle(img.final, img.cleaned)}
                                className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-800 dark:bg-slate-950"
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs dark:border-slate-800 dark:bg-slate-900">
                                No Preview
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                            {img.name}
                          </td>
                          <td className="px-3 py-2 font-medium">{img.cleaned}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-2">
                              <Input
                                value={img.final}
                                onChange={(e) =>
                                  setImages((current) =>
                                    current.map((x) =>
                                      x.id === img.id
                                        ? { ...x, final: e.target.value }
                                        : x
                                    )
                                  )
                                }
                                onBlur={() =>
                                  setImages((current) =>
                                    current.map((x) =>
                                      x.id === img.id
                                        ? { ...x, final: safeTitle(x.final, x.cleaned) }
                                        : x
                                    )
                                  )
                                }
                              />
                              <Button
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImages((current) =>
                                    current.map((x) =>
                                      x.id === img.id ? { ...x, final: x.cleaned } : x
                                    )
                                  );
                                }}
                              >
                                Use Suggested
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setImages((current) =>
                                  current.filter((x) => x.id !== img.id)
                                );
                                if (selectedId === img.id) setSelectedId("");
                              }}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Box>
          </div>

          <div className="space-y-6">
            <Box title="Listing Content Preview">
              {!selectedImage ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Select or upload an image to preview title, description, and tags.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex h-64 w-full items-center justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    {selectedImage.preview ? (
                      <img
                        src={selectedImage.preview}
                        alt={safeTitle(selectedImage.final, selectedImage.cleaned)}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <Field label="Title">
                    <Input
                      value={selectedImage.final}
                      onChange={(e) =>
                        setImages((current) =>
                          current.map((x) =>
                            x.id === selectedImage.id
                              ? { ...x, final: e.target.value }
                              : x
                          )
                        )
                      }
                    />
                    <FieldNote>
                      Strong titles help the app match the right short description and keep the imported template copy aligned with the actual product.
                    </FieldNote>
                  </Field>

                  <Field label="Description">
                    <div className="rounded-xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      <div
                        className="space-y-3 leading-6 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
                        dangerouslySetInnerHTML={{ __html: previewDescription }}
                      />
                    </div>
                    <FieldNote>Formatted as Printify-ready HTML paragraphs and lists so the converted description stays easier to read after export.</FieldNote>
                  </Field>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {previewTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Box>

            <Box title="Run Summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Shop
                  </div>
                  <div className="mt-1 font-medium">
                    {availableShops.find((s) => s.id === shopId)?.title ||
                      "None selected"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Loaded Template
                  </div>
                  <div className="mt-1 font-medium">
                    {template?.nickname || "None loaded"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Description
                  </div>
                  <div className="mt-1 font-medium">Title + Template Matched</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Tags
                  </div>
                  <div className="mt-1 font-medium">
                    From Title + Description (13)
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Products are saved as drafts from the selected template. Artwork is applied to the front print area only, and publishing is left for manual review inside Printify.
              </div>

              <div className="mt-4">
                <Button
                  className="w-full"
                  disabled={!connected || !template || images.length === 0 || isRunningBatch}
                  onClick={() => {
                    void runDraftBatch();
                  }}
                >
                  {isRunningBatch ? "Saving Draft Products..." : "Save Draft Products"}
                </Button>
              </div>

              {runStatus ? (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{runStatus}</p>
              ) : null}

              {batchResults.length > 0 ? (
                <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
                  {batchResults.map((result) => (
                    <div key={`${result.fileName}-${result.title}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="font-medium">{result.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{result.fileName}</div>
                      <div className="mt-1 text-sm">{result.message}</div>
                      {result.productId ? (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Product ID: {result.productId}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Box>

            <Box title="Saved Templates">
              {saved.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No saved templates yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {saved.map((t) => (
                    <div
                      key={`${t.shopId}:${t.reference}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{t.nickname}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {t.reference}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setTemplate(t);
                          setShopId(t.shopId);
                          setNickname(t.nickname);
                          setManualRef(t.reference);
                          setSource(t.source);
                          setTemplateDescription(t.description);
                        }}
                      >
                        Use
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant="secondary"
                  onClick={saveTemplate}
                  disabled={!template}
                >
                  Save Loaded Template
                </Button>
              </div>
            </Box>
          </div>
        </div>
      </div>
    </div>
  );
}
