import type { ProductFamily } from "../../providers/types";
import type { AiFieldStates, AiFieldStatus, Img } from "../../../app/components/merch-quantum/types";

export const FIXED_TAG_COUNT = 13;

export const LISTING_LIMITS = {
  titleMin: 45,
  titleMax: 120,
  descriptionMin: 220,
  descriptionMax: 1200,
  descriptionTargetWords: 150,
  tagCount: 13,
} as const;

export const AI_MODEL_LABEL = "Quantum AI";
export const AI_TITLE_MAX_CHARS = LISTING_LIMITS.titleMax;
export const AI_LEAD_MAX_CHARS = 380;

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

const FAMILY_RULES: Array<{ family: ProductFamily; patterns: RegExp[] }> = [
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

const PROTECTED_TITLE_SUFFIXES = ["Tank Top", "T-Shirt", "Sweatshirt", "Hoodie", "Shirt", "Tee"] as const;

export type TemplateSection = {
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

export function cleanTitle(filename: string) {
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

export function safeTitle(value: string, fallback: string) {
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

export function stripHtml(value: string) {
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

export function formatTemplateDescription(templateDescription: string) {
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

export function detectProductFamilyFromText(value: string) {
  const text = stripHtml(value).trim();
  if (!text) return null;

  for (const rule of FAMILY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.family;
    }
  }

  return null;
}

export function normalizeAiLeadParagraphs(paragraphs: string[]) {
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

export function resolveProductFamily(title: string, templateDescription: string): ProductFamily {
  const titleFamily = detectProductFamilyFromText(title);
  const templateFamily = detectProductFamilyFromText(templateDescription);

  if (titleFamily) return titleFamily;
  if (templateFamily) return templateFamily;
  return "product";
}

export function parseTemplateDescription(formattedDescription: string) {
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

export function buildTemplateContext(templateDescription: string, productFamily?: ProductFamily) {
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

function titleCaseTag(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function deriveTags(title: string, templateDescription: string) {
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

export function extractBuyerFacingDescriptionFromListing(listingDescription: string, templateDescription: string) {
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

export function formatProductDescriptionWithSections(leadParagraphs: string[], templateDescription: string) {
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

export function buildLeadOnlyDescription(leadParagraphs: string[]) {
  return leadToHtml(dedupeParagraphs(normalizeAiLeadParagraphs(leadParagraphs)));
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

export function buildManualOverrideTags(title: string, description: string, count: number) {
  return deriveTags(title, description)
    .filter((tag) => !/^keyword\s+\d+$/i.test(tag.trim()))
    .slice(0, count);
}

export function canManualOverrideFlaggedImage(image: Img | null) {
  return !!image && image.aiDraft?.qcApproved !== false;
}

export function createAiFieldStates(status: AiFieldStatus = "idle"): AiFieldStates {
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

export function normalizeTagsFromPayload(input: unknown) {
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

export function normalizeDescriptionText(value: unknown) {
  return stripMarkdownFences(String(value || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*description\s*:\s*/i, "")
    .replace(/^\s*final[_ ]description\s*:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function descriptionTextToParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/\n/))
    .map((paragraph) => paragraph.replace(/^[-*•]+\s*/, "").trim())
    .filter(Boolean);
}

export function clampTitleForListing(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= LISTING_LIMITS.titleMax) return normalized;
  return trimTitleAtWordBoundary(normalized, LISTING_LIMITS.titleMax);
}

export function clampDescriptionForListing(value: string) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";
  if (normalized.length <= LISTING_LIMITS.descriptionMax) return normalized;
  return normalized.slice(0, LISTING_LIMITS.descriptionMax).trimEnd();
}