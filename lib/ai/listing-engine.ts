import sharp from "sharp";

export type ListingRequest = {
  imageDataUrl?: string;
  title?: string;
  fileName?: string;
  productFamily?: string;
  templateContext?: string;
};

export type ListingUiResponse = {
  qcApproved: boolean;
  title: string;
  description: string;
  tags: string[];
  leadParagraphs: string[];
  leadParagraph1: string;
  leadParagraph2: string;
  model: string;
  confidence: number;
  reasonFlags: string[];
  source: "gemini" | "fallback";
  grade: "green" | "orange" | "red";
  marketplaceDrafts: MarketplaceDrafts;
  semanticRecord: SemanticRecord;
};

export type ListingReasonSeverity = "info" | "warning" | "critical";

export type ListingReasonStage =
  | "image_truth"
  | "filename"
  | "semantic"
  | "render"
  | "validator"
  | "compliance"
  | "fallback";

export type ListingReason = {
  code: string;
  severity: ListingReasonSeverity;
  stage: ListingReasonStage;
  summary: string;
};

export type FilenameAssessment = {
  classification: "strong_support" | "partial_support" | "weak_or_generic" | "conflicting";
  usefulness: number;
  usefulTokens: string[];
  ignoredTokens: string[];
  conflictSeverity: "none" | "low" | "medium" | "high";
  shouldIgnore: boolean;
  reason: string;
};

export type ImageTruthRecord = {
  visibleText: string[];
  visibleFacts: string[];
  inferredMeaning: string[];
  dominantTheme: string;
  likelyAudience: string;
  likelyOccasion: string;
  uncertainty: string[];
  ocrWeakness: string;
  meaningClarity: number;
  hasReadableText: boolean;
};

export type SemanticRecord = {
  productNoun: string;
  titleCore: string;
  benefitCore: string;
  likelyAudience: string;
  styleOccasion: string;
  visibleKeywords: string[];
  inferredKeywords: string[];
  forbiddenClaims: string[];
};

export type ChannelDraft = {
  title: string;
  leadParagraphs: string[];
  discoveryTerms: string[];
};

export type MarketplaceDrafts = {
  etsy: ChannelDraft;
  amazon: ChannelDraft;
  ebay: ChannelDraft;
  tiktokShop: ChannelDraft;
};

export type ValidatorResult = {
  grade: "green" | "orange" | "red";
  confidence: number;
  reasonFlags: string[];
  complianceFlags: string[];
  reasonDetails: ListingReason[];
};

type GeminiRecord = {
  imageTruth: ImageTruthRecord;
  filenameAssessment: FilenameAssessment;
  semanticRecord: SemanticRecord;
  marketplaceDrafts: MarketplaceDrafts;
  validator: ValidatorResult;
  canonicalTitle: string;
  canonicalDescription: string;
  seoTags: string[];
  canonicalLeadParagraphs: string[];
};

type EngineRecord = GeminiRecord & {
  source: "gemini" | "fallback";
  qcApproved: boolean;
};

type GenerateOptions = {
  fetchFn?: typeof fetch;
  apiKey?: string;
  model?: string;
  locale?: string;
};

type RetryContext = {
  attempt: number;
  retryInstruction?: string;
};

type LocaleProfile = {
  locale: string;
  leadTone: string;
  discoveryTermLabel: string;
};

type TemplateSignal = {
  shortLabel: string;
  detailSummary: string;
  buyerBenefit: string;
  useCase: string;
  keywords: string[];
};

type ParsedImageData = {
  mimeType: string;
  inlineData: string;
};

type VisionInputSet = {
  primary: ParsedImageData;
  helpers?: ParsedImageData[];
  promptHint?: string;
};

export class ListingInputGuardError extends Error {
  status: number;

  constructor(message: string, status = 413) {
    super(message);
    this.name = "ListingInputGuardError";
    this.status = status;
  }
}

const DEFAULT_MODEL = process.env.GEMINI_LISTING_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TEMPLATE_CONTEXT = 1400;
const MAX_TITLE_CHARS = 120;
const MAX_LEAD_CHARS = 260;
const MAX_DESCRIPTION_CHARS = 950;
const MAX_GEMINI_ATTEMPTS = 2;
const FINAL_TAG_COUNT = 15;
const MAX_VISION_ANALYSIS_BYTES = 15 * 1024 * 1024;
const MAX_VISION_ANALYSIS_PIXELS = 33_000_000;
const MAX_VISION_ANALYSIS_DIMENSION = 7000;
const SPARSE_TRANSPARENT_COVERAGE_THRESHOLD = 0.68;
const MEANINGFUL_TRANSPARENCY_RATIO_THRESHOLD = 0.04;
const MIN_TRIM_GAIN_PX = 48;
const TRANSPARENT_ANALYSIS_COVERAGE_THRESHOLD = 0.96;
const TRANSPARENT_ANALYSIS_TRIM_GAIN_THRESHOLD = 24;
const LIGHT_ARTWORK_LUMINANCE_THRESHOLD = 0.72;
const DARK_ARTWORK_LUMINANCE_THRESHOLD = 0.28;
const MIXED_ARTWORK_SHARE_THRESHOLD = 0.18;
const MIN_ANALYSIS_PANEL_SIZE = 960;
const MAX_ANALYSIS_PANEL_SIZE = 1600;
const ANALYSIS_ARTWORK_FILL_RATIO = 0.88;
const CROPPED_ANALYSIS_ARTWORK_FILL_RATIO = 0.96;
const TEXT_PRIORITY_ANALYSIS_ARTWORK_FILL_RATIO = 0.985;
const ANALYSIS_LIGHT_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 } as const;
const ANALYSIS_DARK_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 1 } as const;

const WEAK_FILENAME_TOKENS = new Set([
  "img",
  "image",
  "final",
  "draft",
  "copy",
  "new",
  "design",
  "graphic",
  "upload",
  "export",
  "mockup",
  "transparent",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "file",
  "edited",
  "version",
  "v2",
  "v3",
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "our",
  "you",
  "are",
  "into",
  "onto",
  "over",
  "under",
  "about",
  "just",
  "very",
  "more",
]);

const LOW_SIGNAL_TITLE_TOKENS = new Set([
  ...WEAK_FILENAME_TOKENS,
  "product",
  "placeholder",
  "sample",
  "untitled",
  "item",
]);

const LOCALE_PROFILES: Record<string, LocaleProfile> = {
  "en-us": {
    locale: "en-US",
    leadTone: "marketplace-ready",
    discoveryTermLabel: "discovery terms",
  },
  "en-gb": {
    locale: "en-GB",
    leadTone: "marketplace-ready",
    discoveryTermLabel: "discovery terms",
  },
};

const TEMPLATE_HIGHLIGHT_RULES = [
  { pattern: /\bheavyweight\b/i, label: "heavyweight structure", keyword: "heavyweight" },
  { pattern: /\bmidweight\b/i, label: "midweight warmth", keyword: "midweight" },
  { pattern: /\bgarment-dyed\b/i, label: "garment-dyed softness", keyword: "garment dyed" },
  { pattern: /\bring-spun cotton\b/i, label: "ring-spun cotton comfort", keyword: "ring spun cotton" },
  { pattern: /\b100%\s+ring-spun cotton\b/i, label: "100% ring-spun cotton comfort", keyword: "100% ring spun cotton" },
  { pattern: /\bcotton\/poly fleece blend\b/i, label: "soft fleece-blend warmth", keyword: "cotton poly fleece blend" },
  { pattern: /\brelaxed fit\b/i, label: "a relaxed fit", keyword: "relaxed fit" },
  { pattern: /\bdouble-needle stitching\b/i, label: "reinforced stitching", keyword: "double needle stitching" },
  {
    pattern: /\bshoulder-to-shoulder twill tape\b/i,
    label: "shoulder reinforcement",
    keyword: "shoulder to shoulder twill tape",
  },
  { pattern: /\bjersey-lined hood\b/i, label: "a jersey-lined hood", keyword: "jersey lined hood" },
  { pattern: /\bpouch pocket\b/i, label: "a classic pouch pocket", keyword: "pouch pocket" },
  { pattern: /\btear-away label\b/i, label: "easy rebranding flexibility", keyword: "tear away label" },
] as const;

const TEMPLATE_USE_CASE_RULES = [
  { pattern: /\beveryday casual wear\b/i, label: "everyday casual wear", keyword: "everyday casual wear" },
  { pattern: /\bcool-weather comfort\b/i, label: "cool-weather comfort", keyword: "cool weather comfort" },
  { pattern: /\blayering\b/i, label: "easy layering", keyword: "layering" },
  { pattern: /\bgiftable\b/i, label: "gift-friendly merchandising", keyword: "giftable" },
  { pattern: /\bboutique apparel\b/i, label: "boutique-ready merchandising", keyword: "boutique apparel" },
] as const;

const COMPLIANCE_RULE_PACKS = [
  {
    code: "medical_claim",
    severity: "critical",
    summary: "Potential unsupported medical claim detected.",
    patterns: [
      /\bcures?\b/i,
      /\bheals?(?:ing)?\b/i,
      /\bdoctor[- ]recommended\b/i,
      /\bclinically proven\b/i,
      /\bpain relief\b/i,
    ],
  },
  {
    code: "licensing_claim",
    severity: "critical",
    summary: "Potential official, licensed, or trademark-style claim detected.",
    patterns: [
      /\bofficial\b/i,
      /\blicensed\b/i,
      /\btrademark(?:ed)?\b/i,
      /\bauthorized\b/i,
      /\bbrand[- ]approved\b/i,
    ],
  },
  {
    code: "certification_claim",
    severity: "warning",
    summary: "Potential certification-style language detected.",
    patterns: [
      /\bcertified\b/i,
      /\bFDA[- ]approved\b/i,
      /\bUSDA[- ]certified\b/i,
      /\bapproved by experts\b/i,
    ],
  },
  {
    code: "guarantee_claim",
    severity: "warning",
    summary: "Potential guarantee or exaggerated performance claim detected.",
    patterns: [
      /\bguaranteed\b/i,
      /\b100%\s+guaranteed\b/i,
      /\bresults guaranteed\b/i,
      /\bmiracle\b/i,
      /\bworks every time\b/i,
    ],
  },
] as const;

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    qc_approved: { type: "BOOLEAN" },
    seo_title: { type: "STRING" },
    seo_paragraph_1: { type: "STRING" },
    seo_paragraph_2: { type: "STRING" },
    seo_tags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "qc_approved",
    "seo_title",
    "seo_paragraph_1",
    "seo_paragraph_2",
    "seo_tags",
  ],
};

function cleanSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripExtension(value: string) {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleCaseWord(word: string) {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (upper === "T-SHIRT") return "T-Shirt";
  if (["AI", "USA", "DTG", "DTF", "SVG", "PNG", "JPG", "PDF", "DIY"].includes(upper)) return upper;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeTitle(rawTitle: string, fileName = "", maxChars = MAX_TITLE_CHARS) {
  const seed = cleanSpaces(stripExtension(rawTitle || fileName || "Product"));
  const words = seed
    .replace(/[\/_|]+/g, " ")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/[^A-Za-z0-9&+'% ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const normalizedWords: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const nextWord = words[index + 1] || "";

    if (/^t$/i.test(word) && /^shirt$/i.test(nextWord)) {
      normalizedWords.push("T-Shirt");
      index += 1;
      continue;
    }

    if (/^t-?shirt$/i.test(word) || /^tshirt$/i.test(word)) {
      normalizedWords.push("T-Shirt");
      continue;
    }

    if (/^t$/i.test(word)) {
      normalizedWords.push("Tee");
      continue;
    }

    normalizedWords.push(word);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const word of normalizedWords) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(word);
  }

  return cleanSpaces(
    deduped
      .map((word) => {
        if (/^(and|or|for|with|the|a|an|of|to|in|on)$/i.test(word)) return word.toLowerCase();
        if (/^\d+%$/.test(word)) return word;
        return titleCaseWord(word);
      })
      .join(" ")
  )
    .slice(0, maxChars)
    .trim();
}

function toKeywordTokens(value: string) {
  return cleanSpaces(stripExtension(value))
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map((entry) => cleanSpaces(entry)).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function joinReadableList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const INCOMPLETE_ENDING_WORDS = new Set([
  "and",
  "or",
  "but",
  "with",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "from",
  "by",
  "that",
  "which",
  "while",
  "because",
  "so",
  "as",
]);

function hasTerminalSentencePunctuation(value: string) {
  return /[.!?]["')\]]*$/.test(cleanSpaces(value));
}

function normalizeSentenceEnding(value: string) {
  const clean = cleanSpaces(value).replace(/…/g, "...");
  if (!clean) return clean;

  const withoutEllipsis = clean.replace(/(?:\.\.\.|…)+\s*$/, "").trim();
  const withoutTrailingJoiners = withoutEllipsis.replace(/[,:;–—-]+\s*$/, "").trim();
  if (!withoutTrailingJoiners) return "";

  return hasTerminalSentencePunctuation(withoutTrailingJoiners)
    ? withoutTrailingJoiners
    : `${withoutTrailingJoiners}.`;
}

function splitIntoSentences(value: string) {
  const clean = cleanSpaces(value).replace(/…/g, "...");
  if (!clean) return [];

  const matches = clean.match(/[^.!?]+(?:[.!?]+|$)/g) || [clean];
  return matches.map((sentence) => normalizeSentenceEnding(sentence)).filter(Boolean);
}

function trimSentence(value: string, maxChars: number) {
  const clean = cleanSpaces(value);
  if (!clean) return clean;

  const normalizedClean = normalizeSentenceEnding(clean);
  if (normalizedClean.length <= maxChars) return normalizedClean;

  const sentences = splitIntoSentences(clean);
  let combined = "";

  for (const sentence of sentences) {
    const candidate = combined ? `${combined} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      combined = candidate;
      continue;
    }

    if (combined) return combined;
    break;
  }

  const firstSentence = sentences[0] || normalizedClean;
  if (firstSentence.length <= maxChars) return firstSentence;

  const sentenceCore = cleanSpaces(firstSentence.replace(/[.!?]["')\]]*$/, ""));
  const clauseSegments = sentenceCore
    .split(/(?:,\s+|;\s+|:\s+|\s+[–—-]\s+|\s+(?:while|because|so|which|that)\s+)/i)
    .map((segment) => cleanSpaces(segment))
    .filter(Boolean);

  let clauseCandidate = "";
  for (const clause of clauseSegments) {
    const candidate = clauseCandidate ? `${clauseCandidate}, ${clause}` : clause;
    const normalizedCandidate = normalizeSentenceEnding(candidate);
    if (normalizedCandidate.length <= maxChars) {
      clauseCandidate = candidate;
      continue;
    }

    if (clauseCandidate) break;
  }

  if (clauseCandidate) {
    const normalizedClause = normalizeSentenceEnding(clauseCandidate);
    if (normalizedClause.length <= maxChars) return normalizedClause;
  }

  const words = sentenceCore.split(/\s+/).filter(Boolean);
  const keptWords: string[] = [];

  for (const word of words) {
    const candidate = normalizeSentenceEnding([...keptWords, word].join(" "));
    if (candidate.length > maxChars) break;
    keptWords.push(word);
  }

  while (keptWords.length && INCOMPLETE_ENDING_WORDS.has(keptWords[keptWords.length - 1].toLowerCase())) {
    keptWords.pop();
  }

  if (keptWords.length) return normalizeSentenceEnding(keptWords.join(" "));

  return normalizeSentenceEnding(sentenceCore.slice(0, Math.max(maxChars - 1, 1)));
}

function looksClippedLeadParagraph(value: string) {
  const clean = cleanSpaces(value);
  if (!clean) return false;
  if (/(?:\.\.\.|…)\s*$/.test(clean)) return true;
  if (!hasTerminalSentencePunctuation(clean)) return true;

  const withoutEnding = clean.replace(/[.!?]["')\]]*$/, "").trim();
  if (/\b(?:or|and)\s+(?:simply|just|even)\s*$/i.test(withoutEnding)) return true;
  const trailingWord = withoutEnding.split(/\s+/).pop()?.toLowerCase() || "";
  return INCOMPLETE_ENDING_WORDS.has(trailingWord);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTitlePrefix(paragraph: string, title: string) {
  const cleanParagraph = cleanSpaces(paragraph);
  const cleanTitle = cleanSpaces(title);
  if (!cleanParagraph || !cleanTitle) return cleanParagraph;

  const titlePrefix = new RegExp(`^${escapeRegExp(cleanTitle)}[\\s:,.!\\-–—]*`, "i");
  return cleanSpaces(cleanParagraph.replace(titlePrefix, ""));
}

function getProductNoun(productFamily: string) {
  switch ((productFamily || "").toLowerCase()) {
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
      return "drinkware item";
    case "wall-art":
      return "wall art print";
    case "sticker":
      return "sticker";
    case "bag":
      return "bag";
    case "accessory":
      return "accessory";
    default:
      return "product";
  }
}

function detectTheme(text: string) {
  const haystack = text.toLowerCase();
  if (/(christian|jesus|faith|bible|church|cross|gospel|prayer)/.test(haystack)) return "faith-forward";
  if (/(funny|humor|sarcastic|joke|snark|hilarious)/.test(haystack)) return "conversation-starting";
  if (/(retro|vintage|distressed|throwback)/.test(haystack)) return "retro-inspired";
  if (/(pet|dog|cat|puppy|kitten)/.test(haystack)) return "pet-friendly";
  if (/(halloween|christmas|holiday|fall|thanksgiving|easter)/.test(haystack)) return "seasonal";
  if (/(minimal|minimalist|modern|clean)/.test(haystack)) return "minimal";
  return "graphic";
}

function normalizeArray(input: unknown) {
  return Array.isArray(input) ? unique(input.map((value) => String(value || ""))) : [];
}

function stripMarkdownFences(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/^```[a-z0-9_-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function removeLeadingLabel(value: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return value.replace(new RegExp(`^(?:${escaped.join("|")})\\s*:\\s*`, "i"), "").trim();
}

function buildComparableText(value: string) {
  return cleanSpaces(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function removeTitleLead(description: string, title: string) {
  const cleanDescription = cleanSpaces(description);
  const comparableTitle = buildComparableText(title);
  if (!cleanDescription || !comparableTitle) return cleanDescription;

  const titlePattern = title
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const removed = cleanDescription.replace(new RegExp(`^${titlePattern}(?:\\s*[-–—:|,.!?]+\\s*|\\s+)`, "i"), "").trim();
  const comparableRemoved = buildComparableText(removed);

  if (!comparableRemoved || comparableRemoved === comparableTitle || comparableRemoved.startsWith(comparableTitle)) {
    return "";
  }

  return removed;
}

function normalizeDescriptionParagraphs(rawDescription: unknown, title: string) {
  const stripped = stripMarkdownFences(String(rawDescription || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*json\s*/i, "")
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/\n/))
    .map((line) => removeLeadingLabel(line, ["finalDescription", "final_description", "description"]))
    .map((line) => line.replace(/^[-*•]+\s*/, "").replace(/^#+\s*/, ""))
    .map((line) => cleanSpaces(line))
    .filter(Boolean);

  if (stripped.length === 0) return [];

  const paragraphs = unique(
    stripped
      .map((paragraph, index) => (index === 0 ? removeTitleLead(paragraph, title) : paragraph))
      .filter(Boolean)
      .map((paragraph) => trimSentence(normalizeSentenceEnding(paragraph), Math.min(MAX_DESCRIPTION_CHARS, 340)))
      .filter(Boolean)
  );

  return paragraphs.slice(0, 3);
}

function normalizeDescriptionText(rawDescription: unknown, title: string, fallbackParagraphs: string[]) {
  const paragraphs = normalizeDescriptionParagraphs(rawDescription, title);
  const resolved = paragraphs.length ? paragraphs : unique(fallbackParagraphs).slice(0, 3);
  return resolved.join("\n\n").slice(0, MAX_DESCRIPTION_CHARS).trim();
}

function assembleMarketingDescription(paragraphs: string[]) {
  return unique(
    paragraphs
      .map((paragraph) => stripMarkdownFences(String(paragraph || "")))
      .map((paragraph) =>
        removeLeadingLabel(paragraph, [
          "seoParagraph1",
          "seoParagraph2",
          "seo_paragraph_1",
          "seo_paragraph_2",
          "generatedParagraph1",
          "generatedParagraph2",
          "paragraph1",
          "paragraph2",
        ])
      )
      .map((paragraph) => paragraph.replace(/^[-*•]+\s*/, ""))
      .map((paragraph) => cleanSpaces(paragraph))
      .filter(Boolean)
      .map((paragraph) => trimSentence(normalizeSentenceEnding(paragraph), Math.min(MAX_DESCRIPTION_CHARS, 340)))
      .filter(Boolean)
  )
    .slice(0, 2)
    .join("\n\n")
    .slice(0, MAX_DESCRIPTION_CHARS)
    .trim();
}

function normalizeTagLabel(tag: string) {
  const words = cleanSpaces(tag)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^#+\s*/, "")
    .split(/\s+/)
    .filter(Boolean);

  return words.map((word) => titleCaseWord(word)).join(" ");
}

function buildFallbackTags(title: string, description: string, semantic: SemanticRecord, drafts: MarketplaceDrafts) {
  const tokenPool = unique([
    ...drafts.etsy.discoveryTerms,
    ...semantic.visibleKeywords,
    ...semantic.inferredKeywords,
    ...toKeywordTokens(`${title} ${description}`),
  ]);

  const normalized = tokenPool
    .map((tag) => normalizeTagLabel(tag))
    .filter((tag) => tag.length >= 3 && tag.length <= 48);

  return unique(normalized).slice(0, FINAL_TAG_COUNT);
}

function normalizeTagsOutput(
  rawTags: unknown,
  title: string,
  description: string,
  semantic: SemanticRecord,
  drafts: MarketplaceDrafts
) {
  const rawValues = Array.isArray(rawTags)
    ? rawTags.map((value) => String(value || ""))
    : typeof rawTags === "string"
      ? rawTags.split(/[,\n;|]/g)
      : [];

  const cleaned = unique(
    rawValues
      .map((value) => stripMarkdownFences(value))
      .map((value) => removeLeadingLabel(value, ["tags", "seoTags", "seo_tags"]))
      .map((value) => value.replace(/^[-*•]+\s*/, ""))
      .map((value) => normalizeTagLabel(value))
      .filter((value) => value.length >= 3 && value.length <= 48)
  ).slice(0, FINAL_TAG_COUNT);

  if (cleaned.length > 0) return cleaned;
  return buildFallbackTags(title, description, semantic, drafts);
}

function isLowSignalTitle(title: string) {
  const rawTokens = cleanSpaces(stripExtension(title))
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const usefulTokens = rawTokens.filter((token) => !LOW_SIGNAL_TITLE_TOKENS.has(token) && !/^\d+$/.test(token));
  return usefulTokens.length === 0 || (usefulTokens.length === 1 && rawTokens.length <= 2);
}

function getLocaleProfile(locale?: string) {
  const key = cleanSpaces(locale || "en-US").toLowerCase();
  return LOCALE_PROFILES[key] || LOCALE_PROFILES["en-us"];
}

function makeReason(
  code: string,
  severity: ListingReasonSeverity,
  stage: ListingReasonStage,
  summary: string
): ListingReason {
  return {
    code,
    severity,
    stage,
    summary: cleanSpaces(summary),
  };
}

function mergeReasonDetails(...groups: ListingReason[][]) {
  const seen = new Set<string>();
  const merged: ListingReason[] = [];

  for (const group of groups) {
    for (const item of group) {
      const key = `${item.stage}:${item.code}:${item.summary.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function isCodeLikeReasonSummary(summary: string) {
  return /^[a-z0-9_]+$/.test(cleanSpaces(summary));
}

function getReasonBucket(detail: ListingReason) {
  const normalized = detail.summary.toLowerCase();

  if (detail.stage === "filename" || /filename/.test(normalized)) {
    if (/conflict/.test(normalized)) return "filename_conflict";
    if (/weak listing support|weak filename/.test(normalized)) return "filename_weak";
  }

  if (/cropped/.test(normalized)) {
    return "cropped_text";
  }

  if (/ocr|legibility|weak contrast|difficult to read/.test(normalized)) {
    return "ocr_legibility";
  }

  if (
    /specific symbolic meaning|exact interpretation|open to interpretation|highly ambiguous|exact number|specific features|title seed|not explicitly depicted|stylized/.test(
      normalized
    )
  ) {
    return "image_ambiguity";
  }

  if (/fallback/.test(normalized)) return "fallback";
  if (/repetitive|repeat|overlap|variety/.test(normalized)) return "repetition";
  if (/clipped|sentence finish|ellipsis|mid-sentence/.test(normalized)) return "lead_finish";
  if (/medical|licensed|trademark|official|certified|guarantee|healing|miracle|claim/.test(normalized)) {
    return "compliance";
  }

  return `${detail.stage}:${detail.code}`;
}

function getReasonStrength(detail: ListingReason) {
  const normalized = detail.summary.toLowerCase();
  let score = detail.severity === "critical" ? 30 : detail.severity === "warning" ? 20 : 10;

  if (/strongly conflicts|should be ignored/.test(normalized)) score += 8;
  if (/cropped/.test(normalized)) score += 7;
  if (/ocr\/text legibility is weak or partial/.test(normalized)) score += 7;
  if (/highly ambiguous|low contrast/.test(normalized)) score += 6;
  if (/filename and title seed|not explicitly depicted/.test(normalized)) score += 5;
  if (/specific symbolic meaning|exact interpretation|exact number|specific features/.test(normalized)) score += 1;
  if (!isCodeLikeReasonSummary(detail.summary)) score += 2;
  if (detail.summary.length > 80) score += 1;

  return score;
}

function shouldSuppressWeakReason(detail: ListingReason, imageTruth: ImageTruthRecord, bucketSize: number) {
  const normalized = detail.summary.toLowerCase();
  const strongGrounding =
    hasStrongReadyGrounding(imageTruth) ||
    imageTruth.meaningClarity >= 0.72 ||
    imageTruth.hasReadableText ||
    imageTruth.visibleText.length > 0 ||
    imageTruth.visibleFacts.length > 0;

  if (
    /specific symbolic meaning.*not explicitly stated/.test(normalized) &&
    strongGrounding &&
    imageTruth.visibleText.length > 0
  ) {
    return true;
  }

  if (
    bucketSize > 1 &&
    /exact interpretation|exact number|specific features/.test(normalized) &&
    strongGrounding
  ) {
    return true;
  }

  if (
    bucketSize > 1 &&
    /filename and title seed|not explicitly depicted/.test(normalized) &&
    imageTruth.meaningClarity >= 0.7 &&
    imageTruth.visibleText.length > 0
  ) {
    return true;
  }

  return false;
}

function polishReasonDetails(reasonDetails: ListingReason[], imageTruth: ImageTruthRecord) {
  const bucketed = new Map<string, ListingReason[]>();

  for (const detail of reasonDetails) {
    const bucket = getReasonBucket(detail);
    const existing = bucketed.get(bucket) || [];
    existing.push(detail);
    bucketed.set(bucket, existing);
  }

  const polished: ListingReason[] = [];

  for (const detail of reasonDetails) {
    const bucket = getReasonBucket(detail);
    const candidates = bucketed.get(bucket) || [detail];

    if (shouldSuppressWeakReason(detail, imageTruth, candidates.length)) {
      continue;
    }

    const hasReadableVariant = candidates.some(
      (candidate) => !isCodeLikeReasonSummary(candidate.summary) && !shouldSuppressWeakReason(candidate, imageTruth, candidates.length)
    );

    if (hasReadableVariant && isCodeLikeReasonSummary(detail.summary)) {
      continue;
    }

    const preferred = candidates
      .filter((candidate) => !shouldSuppressWeakReason(candidate, imageTruth, candidates.length))
      .sort((a, b) => getReasonStrength(b) - getReasonStrength(a))[0];

    if (!preferred) continue;
    if (preferred !== detail) continue;
    polished.push(detail);
  }

  return mergeReasonDetails(polished);
}

function isSoftReviewReason(detail: ListingReason, imageTruth: ImageTruthRecord) {
  if (detail.severity === "info") return true;
  if (!hasStrongReadyGrounding(imageTruth)) return false;
  if (detail.stage !== "image_truth") return false;

  const normalized = detail.summary.toLowerCase();
  return /specific symbolic meaning|exact interpretation|open to interpretation|exact number|specific features|stylized/.test(
    normalized
  );
}

function getReviewBlockingReasonDetails(reasonDetails: ListingReason[], imageTruth: ImageTruthRecord) {
  return reasonDetails.filter((detail) => !isSoftReviewReason(detail, imageTruth));
}

function reasonFlagsFromDetails(reasonDetails: ListingReason[], complianceFlags: string[]) {
  const fromDetails = reasonDetails
    .filter((detail) => detail.severity !== "info")
    .map((detail) => detail.summary);
  return unique([...fromDetails, ...complianceFlags]).slice(0, 6);
}

function isWeakImageTitleCandidate(value: string) {
  const comparable = normalizeComparableText(stripLeadProductWords(value));
  if (!comparable) return true;
  if (/^(graphic|design|artwork|art|style|message|slogan|scene|illustration|look|vibe)$/.test(comparable)) {
    return true;
  }
  if (
    /white lettering|black lettering|clean transparent design|transparent design|transparent artwork|text on|lettering on|clean readable slogan|readable slogan|bold lettering|low contrast/i.test(
      comparable
    )
  ) {
    return true;
  }

  return comparable.split(/\s+/).filter(Boolean).length > 9;
}

function getVisibleTextSeed(imageTruth: ImageTruthRecord) {
  const candidates = unique([...imageTruth.visibleText, ...imageTruth.visibleFacts]);
  for (const candidate of candidates) {
    if (isWeakImageTitleCandidate(candidate)) continue;
    const normalized = normalizeTitle(candidate, "");
    if (normalized) return normalized;
  }

  return "";
}

function getImageDrivenTitleSeed(imageTruth: ImageTruthRecord) {
  const visibleSeed = getVisibleTextSeed(imageTruth);
  if (visibleSeed) return visibleSeed;

  const candidates = unique([...imageTruth.inferredMeaning, imageTruth.dominantTheme, imageTruth.likelyOccasion]);
  for (const candidate of candidates) {
    if (isWeakImageTitleCandidate(candidate)) continue;
    const normalized = normalizeTitle(candidate, "");
    if (normalized) return normalized;
  }

  return "";
}

function hasStrongImageGrounding(imageTruth: ImageTruthRecord) {
  return (
    imageTruth.meaningClarity >= 0.8 &&
    (imageTruth.hasReadableText ||
      imageTruth.visibleText.length > 0 ||
      imageTruth.visibleFacts.length > 0 ||
      imageTruth.inferredMeaning.length > 0)
  );
}

function chooseTitleSeed(input: ListingRequest, imageTruth: ImageTruthRecord, filenameAssessment: FilenameAssessment) {
  const explicitTitle = cleanSpaces(input.title || "") ? normalizeTitle(input.title || "", "") : "";
  if (explicitTitle) return explicitTitle;

  const imageDrivenSeed = getImageDrivenTitleSeed(imageTruth);
  if (
    imageDrivenSeed &&
    (hasStrongImageGrounding(imageTruth) ||
      filenameAssessment.shouldIgnore ||
      filenameAssessment.classification !== "strong_support")
  ) {
    return imageDrivenSeed;
  }

  return normalizeTitle(input.fileName || imageDrivenSeed || "Product", imageDrivenSeed || "");
}

function normalizeComparableText(value: string) {
  return cleanSpaces(value).toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
}

function tokenizeForVariety(value: string) {
  return normalizeComparableText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function pickDeterministicVariant(seed: string, options: string[]) {
  if (!options.length) return "";

  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return options[hash % options.length];
}

function analyzeRepetition(title: string, leadParagraphs: string[], discoveryTerms: string[]) {
  const reasons: ListingReason[] = [];
  const [firstLead = "", secondLead = ""] = leadParagraphs;
  const firstTokens = tokenizeForVariety(firstLead);
  const secondTokens = tokenizeForVariety(secondLead);
  const titleTokens = tokenizeForVariety(title);
  const sharedLeadTokens = firstTokens.filter((token) => secondTokens.includes(token));
  const sharedTitleTokens = firstTokens.filter((token) => titleTokens.includes(token));

  if (
    firstTokens.length >= 4 &&
    secondTokens.length >= 4 &&
    firstTokens.slice(0, 4).join(" ") === secondTokens.slice(0, 4).join(" ")
  ) {
    reasons.push(
      makeReason(
        "repeated_lead_opener",
        "warning",
        "render",
        "Lead paragraphs repeat the same opener and should vary more."
      )
    );
  }

  if (sharedLeadTokens.length >= Math.min(firstTokens.length, secondTokens.length, 6) && secondTokens.length > 0) {
    reasons.push(
      makeReason(
        "lead_phrase_overlap",
        "warning",
        "render",
        "Lead copy is too repetitive across the two buyer-facing paragraphs."
      )
    );
  }

  const titleOverlapRatio = titleTokens.length ? sharedTitleTokens.length / titleTokens.length : 0;
  if (
    titleTokens.length >= 4 &&
    titleOverlapRatio >= 0.85 &&
    normalizeComparableText(stripTitlePrefix(firstLead, title)).split(/\s+/).filter(Boolean).length < 8
  ) {
    reasons.push(
      makeReason(
        "lead_title_overlap",
        "warning",
        "render",
        "Lead copy leans too heavily on title phrasing instead of adding new value."
      )
    );
  }

  if (unique(discoveryTerms).length > 0 && unique(discoveryTerms).length < 5) {
    reasons.push(
      makeReason(
        "low_term_variety",
        "warning",
        "render",
        "Discovery terms are too repetitive to justify a green-ready listing."
      )
    );
  }

  return reasons;
}

function findComplianceMatches(values: string[]) {
  const matches: string[] = [];

  for (const value of values.map((entry) => cleanSpaces(entry)).filter(Boolean)) {
    for (const pack of COMPLIANCE_RULE_PACKS) {
      for (const pattern of pack.patterns) {
        const match = value.match(pattern);
        if (match) {
          matches.push(match[0]);
        }
      }
    }
  }

  return unique(matches).slice(0, 10);
}

function findComplianceCodes(values: string[]) {
  const codes = new Set<string>();

  for (const value of values.map((entry) => cleanSpaces(entry)).filter(Boolean)) {
    for (const pack of COMPLIANCE_RULE_PACKS) {
      if (pack.patterns.some((pattern) => pattern.test(value))) {
        codes.add(pack.code);
      }
    }
  }

  return codes;
}

function evaluateComplianceReasons(values: string[]) {
  const reasons: ListingReason[] = [];
  const normalizedValues = values.map((value) => cleanSpaces(value)).filter(Boolean);

  for (const pack of COMPLIANCE_RULE_PACKS) {
    if (normalizedValues.some((value) => pack.patterns.some((pattern) => pattern.test(value)))) {
      reasons.push(makeReason(pack.code, pack.severity, "compliance", pack.summary));
    }
  }

  return reasons;
}

function inferReasonStage(summary: string): ListingReasonStage {
  const normalized = summary.toLowerCase();
  if (/filename|conflict/.test(normalized)) return "filename";
  if (/ocr|cropped|contrast|legibility|visible text|image/.test(normalized)) return "image_truth";
  if (/fallback/.test(normalized)) return "fallback";
  if (/lead|title|discovery|repetitive|clipped|sentence/.test(normalized)) return "render";
  if (/medical|licensed|trademark|official|certified|guarantee|healing|miracle|claim/.test(normalized)) {
    return "compliance";
  }
  return "validator";
}

function inferReasonSeverity(summary: string): ListingReasonSeverity {
  const normalized = summary.toLowerCase();
  if (/critical|unsafe|non-compliant|strongly conflicts/.test(normalized)) return "critical";
  if (/warning|weak|partial|review|clipped|conflict|fallback|detected|repetitive|unclear|should be ignored/.test(normalized)) {
    return "warning";
  }
  return "info";
}

function reasonDetailsFromFlags(flags: string[]) {
  return unique(flags)
    .map((summary, index) =>
      makeReason(
        `validator_flag_${index + 1}`,
        inferReasonSeverity(summary),
        inferReasonStage(summary),
        summary
      )
    )
    .slice(0, 8);
}

function getComplianceEvidenceValues(title: string, leadParagraphs: string[], imageTruth: ImageTruthRecord) {
  return [
    title,
    ...leadParagraphs,
    ...imageTruth.visibleText,
    ...imageTruth.visibleFacts,
  ].map((value) => cleanSpaces(value)).filter(Boolean);
}

function sanitizeValidatorSignals(
  validator: ValidatorResult,
  title: string,
  leadParagraphs: string[],
  imageTruth: ImageTruthRecord
) {
  const evidenceValues = getComplianceEvidenceValues(title, leadParagraphs, imageTruth);
  const supportedComplianceCodes = findComplianceCodes(evidenceValues);
  const supportedComplianceMatches = findComplianceMatches(evidenceValues);

  const filteredReasonDetails = validator.reasonDetails.filter((detail) => {
    if (detail.stage !== "compliance") return true;
    return supportedComplianceCodes.has(detail.code);
  });

  const filteredComplianceFlags = validator.complianceFlags.filter((flag) =>
    supportedComplianceMatches.some((match) => flag.toLowerCase().includes(match.toLowerCase()))
  );

  const polishedReasonDetails = polishReasonDetails(filteredReasonDetails, imageTruth);
  const blockingReasonDetails = getReviewBlockingReasonDetails(polishedReasonDetails, imageTruth);
  const rebuiltReasonFlags = reasonFlagsFromDetails(polishedReasonDetails, filteredComplianceFlags);
  const blockingReasonFlags = reasonFlagsFromDetails(blockingReasonDetails, filteredComplianceFlags);
  const readyThreshold = getReadyConfidenceThreshold(imageTruth);
  const recoverableForReview = hasRecoverableReviewGrounding(imageTruth, title, leadParagraphs);
  let grade = validator.grade;

  if (validator.confidence < 0.38 && !recoverableForReview) {
    grade = "red";
  } else if (grade === "red" && recoverableForReview && filteredComplianceFlags.length === 0) {
    grade = "orange";
  } else if (blockingReasonFlags.length === 0 && filteredComplianceFlags.length === 0 && validator.confidence >= readyThreshold) {
    grade = "green";
  } else if (
    grade === "green" &&
    (blockingReasonFlags.length > 0 || filteredComplianceFlags.length > 0 || validator.confidence < readyThreshold)
  ) {
    grade = "orange";
  }

  if (grade === "green") {
    return {
      ...validator,
      grade,
      reasonFlags: [],
      complianceFlags: [],
      reasonDetails: [],
    } satisfies ValidatorResult;
  }

  return {
    ...validator,
    grade,
    reasonFlags: rebuiltReasonFlags,
    complianceFlags: filteredComplianceFlags,
    reasonDetails: polishedReasonDetails,
  } satisfies ValidatorResult;
}

function normalizeReasonDetails(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const severity = String(obj.severity || "").toLowerCase();
      const stage = String(obj.stage || "").toLowerCase();

      if (!["info", "warning", "critical"].includes(severity)) return null;
      if (!["image_truth", "filename", "semantic", "render", "validator", "compliance", "fallback"].includes(stage)) {
        return null;
      }

      return makeReason(
        cleanSpaces(String(obj.code || "unknown_reason")) || "unknown_reason",
        severity as ListingReasonSeverity,
        stage as ListingReasonStage,
        String(obj.summary || "")
      );
    })
    .filter((entry): entry is ListingReason => Boolean(entry));
}

export function assessFilenameRelevance(fileName: string, visibleTextHints: string[]) {
  const tokens = toKeywordTokens(fileName);
  const usefulTokens = tokens.filter((token) => !WEAK_FILENAME_TOKENS.has(token) && !/^\d+$/.test(token));
  const ignoredTokens = tokens.filter((token) => !usefulTokens.includes(token));
  const visibleTokens = new Set(visibleTextHints.flatMap((entry) => toKeywordTokens(entry)));
  const overlap = usefulTokens.filter((token) => visibleTokens.has(token));
  const conflictTokenCount = usefulTokens.filter((token) => !visibleTokens.has(token)).length;

  if (usefulTokens.length >= 3 && overlap.length >= 1) {
    return {
      classification: "strong_support",
      usefulness: 0.9,
      usefulTokens,
      ignoredTokens,
      conflictSeverity: "none",
      shouldIgnore: false,
      reason: "Filename provides specific terms that support visible artwork content.",
    } satisfies FilenameAssessment;
  }

  if (usefulTokens.length >= 1 && overlap.length >= 1) {
    return {
      classification: "partial_support",
      usefulness: 0.68,
      usefulTokens,
      ignoredTokens,
      conflictSeverity: conflictTokenCount >= 2 ? "low" : "none",
      shouldIgnore: false,
      reason: "Filename offers limited but useful support for the visible artwork.",
    } satisfies FilenameAssessment;
  }

  if (visibleTokens.size === 0 && usefulTokens.length >= 2) {
    return {
      classification: "partial_support",
      usefulness: 0.55,
      usefulTokens,
      ignoredTokens,
      conflictSeverity: "none",
      shouldIgnore: false,
      reason: "Filename offers soft support because the image signal is weak or text-light.",
    } satisfies FilenameAssessment;
  }

  if (usefulTokens.length >= 2 && overlap.length === 0 && visibleTokens.size > 0) {
    const conflictSeverity = usefulTokens.length >= 4 ? "high" : usefulTokens.length >= 2 ? "medium" : "low";
    return {
      classification: "conflicting",
      usefulness: conflictSeverity === "high" ? 0.08 : conflictSeverity === "medium" ? 0.18 : 0.28,
      usefulTokens,
      ignoredTokens,
      conflictSeverity,
      shouldIgnore: conflictSeverity !== "low",
      reason: "Filename tokens conflict with the visible image signal and should be de-prioritized.",
    } satisfies FilenameAssessment;
  }

  return {
    classification: "weak_or_generic",
    usefulness: usefulTokens.length ? 0.42 : 0.15,
    usefulTokens,
    ignoredTokens,
    conflictSeverity: "none",
    shouldIgnore: visibleTokens.size > 0,
    reason: "Filename is generic, weak, or not trustworthy enough for primary listing logic.",
  } satisfies FilenameAssessment;
}

function buildSemanticRecord(input: ListingRequest, imageTruth: ImageTruthRecord, filenameAssessment: FilenameAssessment) {
  const productNoun = getProductNoun(input.productFamily || "");
  const templateSignal = extractTemplateSignal(input.templateContext || "", productNoun);
  const titleSeed = chooseTitleSeed(input, imageTruth, filenameAssessment);
  const titleCore = templateSignal && isLowSignalTitle(titleSeed) ? templateSignal.shortLabel : titleSeed;
  const styleOccasion = imageTruth.likelyOccasion || detectTheme(`${titleCore} ${input.templateContext || ""}`);
  const benefitCore =
    templateSignal?.buyerBenefit ||
    `Clear ${productNoun} messaging for ${imageTruth.likelyAudience || "gift-ready"} discovery and merchandising.`;
  const visibleKeywords = unique([
    ...imageTruth.visibleText,
    ...imageTruth.visibleFacts,
    ...(filenameAssessment.classification.startsWith("strong") ? filenameAssessment.usefulTokens : []),
  ]).slice(0, 18);
  const inferredKeywords = unique([
    ...imageTruth.inferredMeaning,
    ...(templateSignal?.keywords || []),
    ...toKeywordTokens(styleOccasion),
    ...toKeywordTokens(titleCore),
  ]).slice(0, 20);
  const forbiddenClaims = findComplianceMatches([
    ...visibleKeywords,
    ...inferredKeywords,
    titleCore,
    benefitCore,
  ]).slice(0, 6);

  return {
    productNoun,
    titleCore,
    benefitCore,
    likelyAudience: imageTruth.likelyAudience || "general audience",
    styleOccasion,
    visibleKeywords,
    inferredKeywords,
    forbiddenClaims,
  } satisfies SemanticRecord;
}

function buildDiscoveryTerms(semantic: SemanticRecord, maxTerms: number) {
  return unique([
    ...semantic.visibleKeywords,
    ...semantic.inferredKeywords,
    ...toKeywordTokens(semantic.titleCore),
    ...toKeywordTokens(semantic.styleOccasion),
  ])
    .map((term) => cleanSpaces(term.toLowerCase()))
    .filter((term) => term.length > 2 && !STOPWORDS.has(term))
    .slice(0, maxTerms);
}

function stripLeadProductWords(value: string) {
  return cleanSpaces(
    value.replace(
      /\b(?:graphic|tee|shirt|t-shirt|t shirt|hoodie|sweatshirt|tank top|hat|sticker|bag|accessory|item|product|gift)\b/gi,
      " "
    )
  );
}

function getPrimaryDesignAnchor(semantic: SemanticRecord) {
  const candidates = unique([
    ...semantic.visibleKeywords,
    ...semantic.inferredKeywords,
    semantic.titleCore,
    semantic.styleOccasion,
  ]);

  for (const candidate of candidates) {
    const stripped = stripLeadProductWords(candidate);
    if (!stripped) continue;

    const comparable = normalizeComparableText(stripped);
    if (!comparable) continue;
    if (/^(graphic|design|artwork|product|style)$/.test(comparable)) continue;
    if (/white lettering|black lettering|transparent design|clean transparent design|bold lettering|text on/i.test(comparable)) {
      continue;
    }
    if (stripped.split(/\s+/).length > 8) continue;

    return stripped;
  }

  return semantic.styleOccasion || semantic.productNoun;
}

function getPrimaryDesignPhrase(semantic: SemanticRecord) {
  const anchor = cleanSpaces(getPrimaryDesignAnchor(semantic));
  if (!anchor) return "the design";

  if (
    anchor.split(/\s+/).length <= 6 &&
    !/\b(?:graphic|design|art|artwork|scene|illustration|style|line art|landscape)\b/i.test(anchor)
  ) {
    return `the "${normalizeTitle(anchor, anchor)}" message`;
  }

  if (/\b(?:graphic|design|art|artwork|scene|illustration|style|line art|landscape)\b/i.test(anchor)) {
    return `the ${anchor.toLowerCase()}`;
  }

  return `the ${anchor.toLowerCase()} artwork`;
}

function getSemanticLeadSignalTokens(semantic: SemanticRecord, templateSignal?: TemplateSignal | null) {
  return unique([
    ...toKeywordTokens(getPrimaryDesignAnchor(semantic)),
    ...toKeywordTokens(semantic.titleCore),
    ...semantic.visibleKeywords.flatMap((keyword) => toKeywordTokens(keyword)),
    ...semantic.inferredKeywords.flatMap((keyword) => toKeywordTokens(keyword)),
    ...(templateSignal?.keywords || []).flatMap((keyword) => toKeywordTokens(keyword)),
  ])
    .filter((token) => token.length > 3)
    .slice(0, 20);
}

function looksGenericBuyerLead(paragraph: string, semantic: SemanticRecord, templateSignal?: TemplateSignal | null) {
  const clean = cleanSpaces(paragraph);
  if (!clean) return true;

  const comparable = normalizeComparableText(clean);
  const signalTokens = getSemanticLeadSignalTokens(semantic, templateSignal);
  const hasSignal = signalTokens.some((token) => comparable.includes(token));
  const genericPattern =
    /crafted for comfort|perfect for everyday wear|ideal choice|ideal pick|thoughtful gift|versatile addition|pairs well with any outfit|casual wardrobe|share a meaningful statement|anyone seeking inspiration|powerful message|high-quality|loved one|music festivals|casual outings|or simply\b|conversation starter/i;

  if (genericPattern.test(clean)) return true;
  if (!hasSignal && tokenizeForVariety(clean).length < 12) return true;
  return false;
}

function buildDefaultLead(semantic: SemanticRecord, localeProfile: LocaleProfile) {
  const designPhrase = getPrimaryDesignPhrase(semantic);
  const seed = `${semantic.titleCore}|${semantic.styleOccasion}|${semantic.likelyAudience}|${localeProfile.locale}`;

  return [
    pickDeterministicVariant(seed, [
      `${capitalizeFirst(designPhrase)} gives this ${semantic.productNoun} a ${semantic.styleOccasion} angle that reads clearly at a glance and feels specific from the first scroll.`,
      `${capitalizeFirst(designPhrase)} keeps the mood of this ${semantic.productNoun} clear, giving it a ${semantic.styleOccasion} feel that lands quickly without sounding generic.`,
      `This ${semantic.productNoun} uses ${designPhrase.toLowerCase()} to create a ${semantic.styleOccasion} direction that feels easy to read and easy to place.`,
    ]),
    pickDeterministicVariant(`${seed}|buyer`, [
      `It gives buyers a quicker read on ${designPhrase.toLowerCase()}, so the ${semantic.productNoun} feels specific before any template details have to do the heavy lifting.`,
      `That ${semantic.styleOccasion} direction keeps ${designPhrase.toLowerCase()} doing the work, which helps ${semantic.likelyAudience} shoppers understand the design without leaning on filler copy.`,
      `The design stays clear enough to sell the mood on first impression, giving ${semantic.likelyAudience} shoppers a better sense of the artwork than a spec-led opener would.`,
    ]),
  ];
}

function hasTemplateSpecLeakage(paragraph: string) {
  return /\b(?:\d+%\s+ring-spun\s+cotton|ring-spun\s+cotton|garment-dyed|heavyweight|midweight|fleece|machine\s+wash|tumble\s+dry|double-needle|twill\s+tape|care\s+instructions?|product\s+features?|size\s+chart|materials?|relaxed\s+fit|shoulder-to-shoulder|shoulder\s+to\s+shoulder|cotton)\b/i.test(
    cleanSpaces(paragraph)
  );
}

function sanitizeMarketingLeadParagraphs(
  paragraphs: string[],
  semantic: SemanticRecord,
  localeProfile: LocaleProfile
) {
  const defaultLead = buildDefaultLead(semantic, localeProfile);
  return paragraphs.map((paragraph, index) =>
    hasTemplateSpecLeakage(paragraph) ? defaultLead[index] || paragraph : paragraph
  );
}

export function normalizeLeadParagraphs(
  title: string,
  paragraphs: string[],
  semantic: SemanticRecord,
  localeProfile: LocaleProfile = getLocaleProfile(),
  templateContext = ""
) {
  const raw = paragraphs.map((paragraph) => cleanSpaces(paragraph)).filter(Boolean);
  const normalized = raw.map((paragraph, index) =>
    index === 0
      ? normalizeSentenceEnding(stripTitlePrefix(trimSentence(paragraph, MAX_LEAD_CHARS), title))
      : trimSentence(paragraph, MAX_LEAD_CHARS)
  );

  const templateSignal = extractTemplateSignal(templateContext, semantic.productNoun);
  const fallback = templateSignal
    ? buildTemplateAwareLead(templateContext, semantic, localeProfile)
    : buildDefaultLead(semantic, localeProfile);
  const normalizedFallback = fallback.map((paragraph) => trimSentence(paragraph, MAX_LEAD_CHARS));
  const merged = [normalized[0] || fallback[0], normalized[1] || fallback[1]];
  const finalParagraphs = merged
    .map((paragraph, index) => {
      const normalizedParagraph = trimSentence(paragraph, MAX_LEAD_CHARS);
      if (looksClippedLeadParagraph(normalizedParagraph)) {
        return normalizedFallback[index] || normalizedParagraph;
      }
      return normalizedParagraph;
    })
    .map((paragraph) => cleanSpaces(paragraph))
    .filter(Boolean)
    .slice(0, 2);

  if (
    finalParagraphs.length === 2 &&
    normalizeComparableText(finalParagraphs[0]) === normalizeComparableText(finalParagraphs[1])
  ) {
    finalParagraphs[1] = normalizedFallback[1];
  }

  while (finalParagraphs.length < 2) {
    finalParagraphs.push(normalizedFallback[finalParagraphs.length]);
  }

  if (looksGenericBuyerLead(finalParagraphs[0] || "", semantic, templateSignal)) {
    finalParagraphs[0] = normalizedFallback[0];
  }

  if (templateSignal) {
    const secondLead = finalParagraphs[1] || "";
    const secondLeadComparable = normalizeComparableText(secondLead);
    const mentionsTemplateSignal =
      normalizeComparableText(templateSignal.shortLabel)
        .split(/\s+/)
        .filter((token) => token.length > 3)
        .some((token) => secondLeadComparable.includes(token)) ||
      normalizeComparableText(templateSignal.detailSummary)
        .split(/\s+/)
        .filter((token) => token.length > 4)
        .some((token) => secondLeadComparable.includes(token)) ||
      templateSignal.keywords.some((keyword) => secondLeadComparable.includes(normalizeComparableText(keyword)));
    const genericLead = looksGenericBuyerLead(secondLead, semantic, templateSignal);

    if (!mentionsTemplateSignal || genericLead) {
      finalParagraphs[1] = normalizedFallback[1];
    }
  } else if (looksGenericBuyerLead(finalParagraphs[1] || "", semantic, templateSignal)) {
    finalParagraphs[1] = normalizedFallback[1];
  }

  return finalParagraphs;
}

function buildChannelDraft(
  channel: "etsy" | "amazon" | "ebay" | "tiktokShop",
  semantic: SemanticRecord,
  leadParagraphs: string[],
  localeProfile: LocaleProfile,
  templateContext = ""
) {
  const titleSeed = semantic.titleCore || `${semantic.styleOccasion} ${semantic.productNoun}`;
  let title = titleSeed;
  let maxTitle = 120;

  if (channel === "etsy") {
    maxTitle = 140;
    title = `${titleSeed} ${semantic.productNoun}`.trim();
  } else if (channel === "amazon") {
    maxTitle = 120;
    title = `${titleSeed} - ${semantic.productNoun}`.trim();
  } else if (channel === "ebay") {
    maxTitle = 80;
    title = `${titleSeed} ${semantic.styleOccasion}`.trim();
  } else if (channel === "tiktokShop") {
    maxTitle = 100;
    title = `${titleSeed} ${semantic.likelyAudience}`.trim();
  }

  const normalizedTitle = normalizeTitle(title, semantic.titleCore, maxTitle);
  const terms = buildDiscoveryTerms(semantic, channel === "amazon" ? 20 : channel === "etsy" ? 13 : 12);

    return {
      title: normalizedTitle || semantic.titleCore || "Product",
      leadParagraphs: normalizeLeadParagraphs(
        normalizedTitle || semantic.titleCore || "Product",
        leadParagraphs,
        semantic,
        localeProfile,
        templateContext
      ),
      discoveryTerms: terms,
    } satisfies ChannelDraft;
}

function buildMarketplaceDrafts(
  semantic: SemanticRecord,
  canonicalLead: string[],
  localeProfile: LocaleProfile,
  templateContext = ""
) {
  return {
    etsy: buildChannelDraft("etsy", semantic, canonicalLead, localeProfile, templateContext),
    amazon: buildChannelDraft("amazon", semantic, canonicalLead, localeProfile, templateContext),
    ebay: buildChannelDraft("ebay", semantic, canonicalLead, localeProfile, templateContext),
    tiktokShop: buildChannelDraft("tiktokShop", semantic, canonicalLead, localeProfile, templateContext),
  } satisfies MarketplaceDrafts;
}

function buildEmptyMarketplaceDrafts(): MarketplaceDrafts {
  const blankDraft: ChannelDraft = {
    title: "",
    leadParagraphs: [],
    discoveryTerms: [],
  };

  return {
    etsy: { ...blankDraft },
    amazon: { ...blankDraft },
    ebay: { ...blankDraft },
    tiktokShop: { ...blankDraft },
  };
}

export function gradeListing(
  imageTruth: ImageTruthRecord,
  semantic: SemanticRecord,
  filenameAssessment: FilenameAssessment,
  title = semantic.titleCore,
  leadParagraphs: string[] = [],
  discoveryTerms: string[] = []
) {
  const reasonDetails: ListingReason[] = [];
  const complianceFlags: string[] = [];
  let confidence = 0.56;
  const strongGrounding = hasStrongReadyGrounding(imageTruth);
  const materialUncertainty = imageTruth.uncertainty
    .filter((summary) => {
      const normalized = summary.toLowerCase();
      if (!strongGrounding) return true;
      return !/specific symbolic meaning|exact interpretation|open to interpretation|exact number|specific features|not explicitly depicted|title seed/i.test(
        normalized
      );
    })
    .slice(0, 2);

  confidence += imageTruth.meaningClarity >= 0.8 ? 0.24 : imageTruth.meaningClarity >= 0.6 ? 0.12 : -0.12;
  confidence += imageTruth.hasReadableText ? 0.05 : -0.04;

  if (filenameAssessment.classification === "conflicting") {
    confidence -= filenameAssessment.conflictSeverity === "high" ? 0.18 : filenameAssessment.conflictSeverity === "medium" ? 0.12 : 0.08;
    reasonDetails.push(
      makeReason(
        `filename_conflict_${filenameAssessment.conflictSeverity}`,
        filenameAssessment.conflictSeverity === "high" ? "critical" : "warning",
        "filename",
        filenameAssessment.conflictSeverity === "high"
          ? "Filename strongly conflicts with visible image meaning and should be ignored."
          : "Filename conflicts with visible image signal."
      )
    );
  } else if (filenameAssessment.classification === "weak_or_generic") {
    reasonDetails.push(
      makeReason("filename_weak", "info", "filename", "Filename provides weak listing support.")
    );
  }

  const softOcrWarning =
    strongGrounding &&
    /weak contrast|partial|low contrast/i.test(imageTruth.ocrWeakness) &&
    (imageTruth.hasReadableText || imageTruth.visibleText.length > 0);

  if (imageTruth.ocrWeakness && !/none|clear/i.test(imageTruth.ocrWeakness) && !softOcrWarning) {
    confidence -= 0.1;
    reasonDetails.push(
      makeReason("ocr_weakness", "warning", "image_truth", "OCR/text legibility is weak or partial.")
    );
  }

  if (materialUncertainty.length > 0) {
    confidence -= 0.06;
    reasonDetails.push(
      ...materialUncertainty
        .map((summary, index) => makeReason(`image_uncertainty_${index + 1}`, "warning", "image_truth", summary))
    );
  }

  const complianceEvidence = getComplianceEvidenceValues(title, leadParagraphs, imageTruth);
  const complianceReasons = evaluateComplianceReasons(complianceEvidence);
  if (complianceReasons.length) {
    confidence -= 0.16;
    reasonDetails.push(...complianceReasons);
    complianceFlags.push(
      ...findComplianceMatches(complianceEvidence).map((claim) => `Potential unsupported claim: ${claim}`)
    );
  }

  const effectiveTitle = cleanSpaces(title || semantic.titleCore);
  if (!effectiveTitle || effectiveTitle.length < 12 || isLowSignalTitle(effectiveTitle)) {
    confidence -= 0.1;
    reasonDetails.push(
      makeReason("weak_title_core", "warning", "semantic", "Generated title core is too weak and needs review.")
    );
  }

  const repetitionReasons = analyzeRepetition(title, leadParagraphs, discoveryTerms);
  if (repetitionReasons.length) {
    confidence -= 0.1;
    reasonDetails.push(...repetitionReasons);
  }

  const clippedLeadReasons = leadParagraphs
    .map((paragraph, index) =>
      looksClippedLeadParagraph(paragraph)
        ? makeReason(
            `lead_paragraph_${index + 1}_clipped`,
            "warning",
            "render",
            `Lead paragraph ${index + 1} appears clipped or ends without a clean sentence finish.`
          )
        : null
    )
    .filter((reason): reason is ListingReason => Boolean(reason));
  if (clippedLeadReasons.length) {
    confidence -= 0.12;
    reasonDetails.push(...clippedLeadReasons);
  }

  confidence = clamp(Number(confidence.toFixed(2)), 0, 1);
  const dedupedCompliance = unique(complianceFlags).slice(0, 4);
  const mergedReasonDetails = mergeReasonDetails(reasonDetails);
  const polishedReasonDetails = polishReasonDetails(mergedReasonDetails, imageTruth);
  const blockingReasonDetails = getReviewBlockingReasonDetails(polishedReasonDetails, imageTruth);
  const dedupedReasons = reasonFlagsFromDetails(polishedReasonDetails, dedupedCompliance);
  const readyThreshold = getReadyConfidenceThreshold(imageTruth);
  const recoverableForReview = hasRecoverableReviewGrounding(imageTruth, effectiveTitle, leadParagraphs);

  if ((confidence < 0.38 || imageTruth.meaningClarity < 0.35) && !recoverableForReview) {
    return {
      grade: "red",
      confidence,
      reasonFlags: dedupedReasons.length ? dedupedReasons : ["Image meaning is too unclear for safe listing generation."],
      complianceFlags: dedupedCompliance,
      reasonDetails: polishedReasonDetails.length
        ? polishedReasonDetails
        : [makeReason("image_unclear", "critical", "validator", "Image meaning is too unclear for safe listing generation.")],
    } satisfies ValidatorResult;
  }

  if (confidence >= readyThreshold && blockingReasonDetails.length === 0 && dedupedCompliance.length === 0) {
    return {
      grade: "green",
      confidence,
      reasonFlags: [],
      complianceFlags: [],
      reasonDetails: [],
    } satisfies ValidatorResult;
  }

  return {
    grade: "orange",
    confidence,
    reasonFlags: dedupedReasons.length ? dedupedReasons : ["Usable draft detected but manual review is recommended."],
    complianceFlags: dedupedCompliance,
    reasonDetails: polishedReasonDetails,
  } satisfies ValidatorResult;
}

function buildQcDerivedImageTruth(input: ListingRequest, titleSeed: string, qcApproved: boolean): ImageTruthRecord {
  const productFamily = cleanSpaces(input.productFamily || "merchandise");
  const dominantTheme = detectTheme(`${titleSeed} ${input.fileName || ""} ${productFamily}`);

  if (!qcApproved) {
    return {
      visibleText: [],
      visibleFacts: [],
      inferredMeaning: [],
      dominantTheme: "unknown",
      likelyAudience: "manual review required",
      likelyOccasion: "manual review required",
      uncertainty: ["Image is blank, illegible, or too distorted for reliable listing generation."],
      ocrWeakness: "qc-rejected-illegible-or-distorted",
      meaningClarity: 0.08,
      hasReadableText: false,
    };
  }

  return {
    visibleText: [],
    visibleFacts: [`clear ${productFamily} artwork detected on an isolated print-ready canvas`],
    inferredMeaning: [dominantTheme],
    dominantTheme,
    likelyAudience: "merchandise shoppers",
    likelyOccasion: dominantTheme,
    uncertainty: [],
    ocrWeakness: cleanSpaces(titleSeed) ? "structured-qc-approved" : "design-only-qc-approved",
    meaningClarity: 0.88,
    hasReadableText: cleanSpaces(titleSeed).length >= 8,
  };
}

function buildQcRejectedValidator(): ValidatorResult {
  return {
    grade: "red",
    confidence: 0.08,
    reasonFlags: ["Quantum AI QC flagged this artwork for manual review before draft publishing."],
    complianceFlags: [],
    reasonDetails: [
      makeReason(
        "qc_rejected_visual_signal",
        "critical",
        "validator",
        "Quantum AI QC rejected this artwork because the design appears blank, illegible, or too distorted for safe listing generation."
      ),
    ],
  };
}

function summarizeTemplateContext(templateContext: string) {
  const cleaned = cleanSpaces(templateContext.slice(0, MAX_TEMPLATE_CONTEXT));
  if (!cleaned) return "No template context supplied.";
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanSpaces(sentence))
    .filter(Boolean);
  return unique(sentences).slice(0, 4).join(" ").slice(0, 520) || cleaned.slice(0, 520);
}

function extractTemplateSignal(templateContext: string, productNoun: string): TemplateSignal | null {
  const summary = summarizeTemplateContext(templateContext);
  if (!summary || summary === "No template context supplied.") return null;

  const highlights = TEMPLATE_HIGHLIGHT_RULES.filter((rule) => rule.pattern.test(summary));
  const useCase = TEMPLATE_USE_CASE_RULES.find((rule) => rule.pattern.test(summary));

  const labelParts: string[] = [];
  if (/\bheavyweight\b/i.test(summary)) {
    labelParts.push("Heavyweight");
  } else if (/\bmidweight\b/i.test(summary)) {
    labelParts.push("Midweight");
  }

  if (/\bgarment-dyed\b/i.test(summary)) {
    labelParts.push("Garment-Dyed");
  } else if (/\bring-spun cotton\b/i.test(summary) && /graphic tee|tee/i.test(productNoun)) {
    labelParts.push("Ring-Spun Cotton");
  } else if (/\bfleece\b/i.test(summary) && /hoodie|sweatshirt/i.test(productNoun)) {
    labelParts.push("Fleece");
  }

  const shortLabel = normalizeTitle(`${labelParts.join(" ")} ${productNoun}`, productNoun);
  const detailSummary =
    joinReadableList(highlights.slice(0, 3).map((entry) => entry.label)) ||
    "practical product details that support shopper expectations";
  const resolvedUseCase =
    useCase?.label ||
    (/hoodie|sweatshirt/i.test(productNoun)
      ? "cool-weather comfort and easy layering"
      : "everyday wear and gift-friendly merchandising");
  const buyerBenefit = highlights.length
    ? `That template combination gives the ${productNoun} a more believable foundation for buyer-facing copy without turning the opener into a spec sheet.`
    : `Template details give the ${productNoun} enough factual grounding to avoid placeholder copy.`;
  const keywords = unique([
    ...highlights.map((entry) => entry.keyword),
    useCase?.keyword || "",
    ...toKeywordTokens(summary).slice(0, 10),
  ]).slice(0, 12);

  return {
    shortLabel,
    detailSummary,
    buyerBenefit,
    useCase: resolvedUseCase,
    keywords,
  };
}

function buildTemplateAwareLead(
  templateContext: string,
  semantic: SemanticRecord,
  localeProfile: LocaleProfile
) {
  const templateSignal = extractTemplateSignal(templateContext, semantic.productNoun);
  if (!templateSignal) return buildDefaultLead(semantic, localeProfile);

  const seed = `${semantic.titleCore}|${templateSignal.shortLabel}|${templateSignal.useCase}|${semantic.likelyAudience}`;
  const designPhrase = getPrimaryDesignPhrase(semantic);
  const firstParagraph = pickDeterministicVariant(seed, [
    `${capitalizeFirst(designPhrase)} stays front and center, while the ${templateSignal.shortLabel.toLowerCase()} base gives this ${semantic.productNoun} enough real-world context to suit ${templateSignal.useCase}.`,
    `${capitalizeFirst(designPhrase)} sets the tone immediately, and ${templateSignal.detailSummary.toLowerCase()} help the ${semantic.productNoun} feel believable for ${templateSignal.useCase} without turning the opener into a spec sheet.`,
    `The ${templateSignal.shortLabel.toLowerCase()} base supports ${designPhrase.toLowerCase()} without burying the artwork in raw product details, so the ${semantic.productNoun} still reads design-first for ${templateSignal.useCase}.`,
  ]);

  const secondParagraph = pickDeterministicVariant(`${seed}|buyer`, [
    `Buyers get a quicker read on ${designPhrase.toLowerCase()} first, while the product cues quietly support repeat wear, gifting, and everyday use.`,
    `That balance keeps ${designPhrase.toLowerCase()} doing the real work up front, so the description feels specific to the artwork before the template details take over.`,
    `It gives ${semantic.likelyAudience} shoppers a clearer sense of the ${semantic.styleOccasion} mood, while the product context backs up the listing without turning it into a spec dump.`,
    `The opener stays centered on ${designPhrase.toLowerCase()}, which makes the ${semantic.productNoun} feel more intentional than a generic blank-product description.`,
  ]);

  return [
    firstParagraph,
    secondParagraph,
  ];
}

function resolveApiKey(explicitApiKey?: string) {
  if (typeof explicitApiKey === "string") return explicitApiKey;
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function parseImageData(imageDataUrl: string): ParsedImageData | null {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    inlineData: match[2],
  };
}

function hasStrongReadyGrounding(imageTruth: ImageTruthRecord) {
  return (
    imageTruth.meaningClarity >= 0.84 &&
    (imageTruth.hasReadableText ||
      imageTruth.visibleText.length > 0 ||
      imageTruth.visibleFacts.length > 0 ||
      imageTruth.inferredMeaning.length > 0)
  );
}

function hasRecoverableReviewGrounding(
  imageTruth: ImageTruthRecord,
  title: string,
  leadParagraphs: string[]
) {
  const hasReadableEvidence = imageTruth.hasReadableText || imageTruth.visibleText.length > 0;
  const hasRecoverableImageSignal =
    imageTruth.visibleFacts.length > 0 ||
    imageTruth.inferredMeaning.length > 0 ||
    (!!cleanSpaces(imageTruth.dominantTheme) && cleanSpaces(imageTruth.dominantTheme).toLowerCase() !== "unknown");
  const lowInformationSignal = [
    ...imageTruth.visibleFacts,
    ...imageTruth.inferredMeaning,
    imageTruth.dominantTheme,
    ...imageTruth.uncertainty,
  ]
    .map((value) => cleanSpaces(value).toLowerCase())
    .join(" ");
  const hardUncertainty = imageTruth.uncertainty.some((summary) =>
    /meaning unclear|too unclear|unable to read|cannot read|unreadable|illegible|no meaningful signal/i.test(summary)
  );
  const weakTitle = !cleanSpaces(title) || isLowSignalTitle(title);
  const clippedLead = leadParagraphs.some((paragraph) => looksClippedLeadParagraph(paragraph));

  if (hardUncertainty || weakTitle || clippedLead) {
    return false;
  }

  if (hasReadableEvidence) {
    return true;
  }

  if (
    /single small dot|single dot mark|single mark|tiny mark|minimal abstract|extremely minimal|low information/i.test(
      lowInformationSignal
    )
  ) {
    return false;
  }

  return hasRecoverableImageSignal && imageTruth.meaningClarity >= 0.3;
}

function getReadyConfidenceThreshold(imageTruth: ImageTruthRecord) {
  return hasStrongReadyGrounding(imageTruth) ? 0.74 : 0.78;
}

function estimateBase64ByteLength(inlineData: string) {
  const normalized = inlineData.trim();
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
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

async function getAlphaWeightedArtworkLuminance(imageBuffer: Buffer) {
  const { data, info } = await sharp(imageBuffer, {
    failOn: "none",
    limitInputPixels: MAX_VISION_ANALYSIS_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 4;
  let weightedLuminance = 0;
  let totalAlpha = 0;

  for (let index = 0; index < data.length; index += channels) {
    const alpha = (data[index + 3] || 0) / 255;
    if (alpha <= 0) continue;

    weightedLuminance += getRelativeLuminance(data[index], data[index + 1], data[index + 2]) * alpha;
    totalAlpha += alpha;
  }

  return totalAlpha > 0 ? weightedLuminance / totalAlpha : null;
}

async function analyzeTransparencySurface(sourceImage: sharp.Sharp) {
  const { data, info } = await sourceImage
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 4;
  const totalPixels = info.width * info.height;
  let transparentPixelCount = 0;
  let visiblePixelCount = 0;
  let weightedLuminance = 0;
  let totalAlpha = 0;
  let lightVisibleAlpha = 0;
  let darkVisibleAlpha = 0;

  for (let index = 0; index < data.length; index += channels) {
    const alphaByte = data[index + 3] || 0;
    if (alphaByte <= 0) {
      transparentPixelCount += 1;
      continue;
    }

    const alpha = alphaByte / 255;
    visiblePixelCount += 1;
    const luminance = getRelativeLuminance(data[index], data[index + 1], data[index + 2]);
    weightedLuminance += luminance * alpha;
    totalAlpha += alpha;
    if (luminance >= LIGHT_ARTWORK_LUMINANCE_THRESHOLD) {
      lightVisibleAlpha += alpha;
    }
    if (luminance <= DARK_ARTWORK_LUMINANCE_THRESHOLD) {
      darkVisibleAlpha += alpha;
    }
  }

  return {
    artworkLuminance: totalAlpha > 0 ? weightedLuminance / totalAlpha : null,
    transparentPixelRatio: totalPixels > 0 ? transparentPixelCount / totalPixels : 0,
    visiblePixelCount,
    lightVisibleRatio: totalAlpha > 0 ? lightVisibleAlpha / totalAlpha : 0,
    darkVisibleRatio: totalAlpha > 0 ? darkVisibleAlpha / totalAlpha : 0,
  };
}

async function buildDerivedAnalysisImage(
  artworkBuffer: Buffer,
  panelSize: number,
  background: (typeof ANALYSIS_LIGHT_BACKGROUND) | (typeof ANALYSIS_DARK_BACKGROUND),
  options: {
    fillRatio?: number;
  } = {}
): Promise<ParsedImageData> {
  const fillRatio = clamp(options.fillRatio ?? ANALYSIS_ARTWORK_FILL_RATIO, 0.48, 0.98);
  const artworkSize = clamp(Math.round(panelSize * fillRatio), 320, panelSize - 48);
  const renderedArtwork = await sharp(artworkBuffer, {
    failOn: "none",
    limitInputPixels: MAX_VISION_ANALYSIS_PIXELS,
  })
    .resize({
      width: artworkSize,
      height: artworkSize,
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const analysisBuffer = await sharp({
    create: {
      width: panelSize,
      height: panelSize,
      channels: 4,
      background,
    },
  })
    .composite([{ input: renderedArtwork, gravity: "center" }])
    .png()
    .toBuffer();

  return {
    mimeType: "image/png",
    inlineData: analysisBuffer.toString("base64"),
  };
}

async function buildTextPriorityAnalysisImage(
  artworkBuffer: Buffer,
  panelSize: number,
  useDarkBackground: boolean
): Promise<ParsedImageData> {
  const source = sharp(artworkBuffer, {
    failOn: "none",
    limitInputPixels: MAX_VISION_ANALYSIS_PIXELS,
  }).ensureAlpha();
  const metadata = await source.metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;
  const alphaMask = await source.clone().extractChannel("alpha").png().toBuffer();
  const inkColor = useDarkBackground ? ANALYSIS_LIGHT_BACKGROUND : ANALYSIS_DARK_BACKGROUND;
  const flatArtwork = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: inkColor.r,
        g: inkColor.g,
        b: inkColor.b,
      },
    },
  })
    .joinChannel(alphaMask)
    .png()
    .toBuffer();

  return buildDerivedAnalysisImage(
    flatArtwork,
    panelSize,
    useDarkBackground ? ANALYSIS_DARK_BACKGROUND : ANALYSIS_LIGHT_BACKGROUND,
    { fillRatio: TEXT_PRIORITY_ANALYSIS_ARTWORK_FILL_RATIO }
  );
}

async function prepareVisionInputs(imageDataUrl: string): Promise<VisionInputSet | null> {
  const parsed = parseImageData(imageDataUrl);
  if (!parsed) return null;

  if (!/^image\/(png|webp)$/i.test(parsed.mimeType)) {
    return { primary: parsed };
  }

  try {
    const estimatedBytes = estimateBase64ByteLength(parsed.inlineData);
    if (estimatedBytes > MAX_VISION_ANALYSIS_BYTES) {
      throw new ListingInputGuardError("Image is too large for listing analysis. Please use an image under 15 MB.");
    }

    const sourceBuffer = Buffer.from(parsed.inlineData, "base64");
    const sourceImage = sharp(sourceBuffer, {
      failOn: "none",
      limitInputPixels: MAX_VISION_ANALYSIS_PIXELS,
    }).ensureAlpha();
    const metadata = await sourceImage.metadata();

    if (!metadata.hasAlpha || !metadata.width || !metadata.height) {
      return { primary: parsed };
    }

    const sourcePixels = metadata.width * metadata.height;
    if (
      sourcePixels > MAX_VISION_ANALYSIS_PIXELS ||
      metadata.width > MAX_VISION_ANALYSIS_DIMENSION ||
      metadata.height > MAX_VISION_ANALYSIS_DIMENSION
    ) {
      throw new ListingInputGuardError("Image is too large for listing analysis. Please use an image under 33 megapixels.");
    }

    const { data: trimmedBuffer, info: trimmedInfo } = await sourceImage
      .clone()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .png()
      .toBuffer({ resolveWithObject: true });

    const transparencySurface = await analyzeTransparencySurface(sourceImage);
    if (transparencySurface.visiblePixelCount === 0) {
      return { primary: parsed };
    }

    const coverage = (trimmedInfo.width * trimmedInfo.height) / (metadata.width * metadata.height);
    const trimGain = (metadata.width - trimmedInfo.width) + (metadata.height - trimmedInfo.height);
    const hasMeaningfulTransparency =
      transparencySurface.transparentPixelRatio >= MEANINGFUL_TRANSPARENCY_RATIO_THRESHOLD;
    const artworkLuminance = transparencySurface.artworkLuminance ?? (await getAlphaWeightedArtworkLuminance(trimmedBuffer));
    const resolvedArtworkLuminance = artworkLuminance ?? 0.5;
    const hasStrongLuminanceBias =
      resolvedArtworkLuminance >= LIGHT_ARTWORK_LUMINANCE_THRESHOLD ||
      resolvedArtworkLuminance <= DARK_ARTWORK_LUMINANCE_THRESHOLD;
    const hasMixedContrastArtwork =
      transparencySurface.lightVisibleRatio >= MIXED_ARTWORK_SHARE_THRESHOLD &&
      transparencySurface.darkVisibleRatio >= MIXED_ARTWORK_SHARE_THRESHOLD;
    const shouldIncludeCroppedCloseRender =
      coverage < TRANSPARENT_ANALYSIS_COVERAGE_THRESHOLD || trimGain >= TRANSPARENT_ANALYSIS_TRIM_GAIN_THRESHOLD;
    const shouldUseDerivedAnalysis = hasMeaningfulTransparency;

    if (!Number.isFinite(coverage)) {
      return { primary: parsed };
    }

    if (!shouldUseDerivedAnalysis) {
      return { primary: parsed };
    }

    const trimmedLongestEdge = Math.max(trimmedInfo.width, trimmedInfo.height);
    const panelSize = clamp(
      Math.round(Math.max(trimmedLongestEdge * 1.18, MIN_ANALYSIS_PANEL_SIZE)),
      MIN_ANALYSIS_PANEL_SIZE,
      MAX_ANALYSIS_PANEL_SIZE
    );

    const lightBackgroundLuminance = getRelativeLuminance(
      ANALYSIS_LIGHT_BACKGROUND.r,
      ANALYSIS_LIGHT_BACKGROUND.g,
      ANALYSIS_LIGHT_BACKGROUND.b
    );
    const darkBackgroundLuminance = getRelativeLuminance(
      ANALYSIS_DARK_BACKGROUND.r,
      ANALYSIS_DARK_BACKGROUND.g,
      ANALYSIS_DARK_BACKGROUND.b
    );
    const contrastOnLight = getContrastRatio(resolvedArtworkLuminance, lightBackgroundLuminance);
    const contrastOnDark = getContrastRatio(resolvedArtworkLuminance, darkBackgroundLuminance);
    const useDarkBackground = contrastOnDark >= contrastOnLight;
    const analysisBackground = useDarkBackground ? ANALYSIS_DARK_BACKGROUND : ANALYSIS_LIGHT_BACKGROUND;
    const analysisBackgroundLabel = useDarkBackground ? "black" : "white";
    const blackBackedRender = await buildDerivedAnalysisImage(sourceBuffer, panelSize, ANALYSIS_DARK_BACKGROUND);
    const whiteBackedRender = await buildDerivedAnalysisImage(sourceBuffer, panelSize, ANALYSIS_LIGHT_BACKGROUND);
    const croppedCloseRender = shouldIncludeCroppedCloseRender
      ? await buildDerivedAnalysisImage(trimmedBuffer, panelSize, analysisBackground, {
          fillRatio: CROPPED_ANALYSIS_ARTWORK_FILL_RATIO,
        })
      : null;
    const shouldIncludeTextPriorityRender =
      hasStrongLuminanceBias || hasMixedContrastArtwork || shouldIncludeCroppedCloseRender;
    const textPriorityRender = shouldIncludeTextPriorityRender
      ? await buildTextPriorityAnalysisImage(
          croppedCloseRender ? trimmedBuffer : sourceBuffer,
          panelSize,
          useDarkBackground
        )
      : null;
    const primary = croppedCloseRender || (useDarkBackground ? blackBackedRender : whiteBackedRender);
    const helpers: ParsedImageData[] = [];

    if (primary !== blackBackedRender) {
      helpers.push(blackBackedRender);
    }
    if (primary !== whiteBackedRender) {
      helpers.push(whiteBackedRender);
    }
    if (croppedCloseRender && primary !== croppedCloseRender) {
      helpers.push(croppedCloseRender);
    }
    if (textPriorityRender) {
      helpers.push(textPriorityRender);
    }
    helpers.push({
      mimeType: parsed.mimeType,
      inlineData: parsed.inlineData,
    });

    return {
      primary,
      helpers,
      promptHint:
        `The provided images all show the same artwork. The strongest temporary high-contrast analysis render may appear first on a ${analysisBackgroundLabel} garment-neutral background. Additional helper renders may show the same transparent design on both black and white garment-neutral backgrounds, and a cropped close view around the visible artwork bounds may be included when the full canvas leaves too much empty space. A single-ink text-prioritized helper render may also appear to emphasize letters, symbols, and linework shape without changing the original design. A later helper image may show the untouched original transparent upload. Infer the design from the render with the strongest visual grounding, then use the untouched original only as confirmation rather than as the main reading surface.`,
    };
  } catch (error) {
    if (error instanceof ListingInputGuardError) {
      throw error;
    }

    return { primary: parsed };
  }
}

function extractGeminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("\n").trim();
}

function parseJsonLoose(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeImageTruth(input: unknown, titleSeed: string): ImageTruthRecord {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const visibleText = normalizeArray(obj.visibleText).slice(0, 20);
  const visibleFacts = normalizeArray(obj.visibleFacts).slice(0, 20);
  const inferredMeaning = normalizeArray(obj.inferredMeaning).slice(0, 20);
  const uncertainty = normalizeArray(obj.uncertainty).slice(0, 8);
  const dominantTheme = cleanSpaces(String(obj.dominantTheme || detectTheme(titleSeed) || "graphic"));
  const likelyAudience = cleanSpaces(String(obj.likelyAudience || "general audience"));
  const likelyOccasion = cleanSpaces(String(obj.likelyOccasion || dominantTheme));
  const ocrWeakness = cleanSpaces(String(obj.ocrWeakness || "none"));
  const meaningClarity = clamp(Number(obj.meaningClarity ?? 0.72) || 0.72, 0, 1);
  const hasReadableText = Boolean(obj.hasReadableText ?? (visibleText.length > 0));

  return {
    visibleText,
    visibleFacts,
    inferredMeaning,
    dominantTheme,
    likelyAudience,
    likelyOccasion,
    uncertainty,
    ocrWeakness,
    meaningClarity,
    hasReadableText,
  };
}

function normalizeSemantic(input: unknown, fallback: SemanticRecord): SemanticRecord {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    productNoun: cleanSpaces(String(obj.productNoun || fallback.productNoun)),
    titleCore: normalizeTitle(String(obj.titleCore || fallback.titleCore), fallback.titleCore),
    benefitCore: cleanSpaces(String(obj.benefitCore || fallback.benefitCore)),
    likelyAudience: cleanSpaces(String(obj.likelyAudience || fallback.likelyAudience)),
    styleOccasion: cleanSpaces(String(obj.styleOccasion || fallback.styleOccasion)),
    visibleKeywords: normalizeArray(obj.visibleKeywords).slice(0, 24),
    inferredKeywords: normalizeArray(obj.inferredKeywords).slice(0, 24),
    forbiddenClaims: normalizeArray(obj.forbiddenClaims).slice(0, 8),
  };
}

function normalizeChannelDraft(
  input: unknown,
  semantic: SemanticRecord,
  fallbackLead: string[],
  localeProfile: LocaleProfile,
  templateContext = ""
) {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const title = normalizeTitle(String(obj.title || semantic.titleCore), semantic.titleCore);
  const leadParagraphs = normalizeLeadParagraphs(
    title,
    normalizeArray(obj.leadParagraphs),
    semantic,
    localeProfile,
    templateContext
  );
  const discoveryTerms = unique(normalizeArray(obj.discoveryTerms)).slice(0, 20);

  return {
    title: title || semantic.titleCore || "Product",
    leadParagraphs: leadParagraphs.length ? leadParagraphs : fallbackLead,
    discoveryTerms,
  } satisfies ChannelDraft;
}

function normalizeMarketplaceDrafts(
  input: unknown,
  semantic: SemanticRecord,
  fallbackLead: string[],
  localeProfile: LocaleProfile,
  templateContext = ""
) {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    etsy: normalizeChannelDraft(obj.etsy, semantic, fallbackLead, localeProfile, templateContext),
    amazon: normalizeChannelDraft(obj.amazon, semantic, fallbackLead, localeProfile, templateContext),
    ebay: normalizeChannelDraft(obj.ebay, semantic, fallbackLead, localeProfile, templateContext),
    tiktokShop: normalizeChannelDraft(obj.tiktokShop, semantic, fallbackLead, localeProfile, templateContext),
  } satisfies MarketplaceDrafts;
}

function normalizeValidator(
  input: unknown,
  fallback: ValidatorResult,
  context?: {
    title: string;
    leadParagraphs: string[];
    imageTruth: ImageTruthRecord;
  }
): ValidatorResult {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const gradeRaw = String(obj.grade || fallback.grade).toLowerCase();
  let grade = gradeRaw === "green" || gradeRaw === "orange" || gradeRaw === "red" ? gradeRaw : fallback.grade;
  const reasonFlags = normalizeArray(obj.reasonFlags).slice(0, 8);
  const reasonDetails = mergeReasonDetails(
    normalizeReasonDetails(obj.reasonDetails),
    reasonDetailsFromFlags(reasonFlags),
    fallback.reasonDetails
  );
  const complianceFlags = normalizeArray(obj.complianceFlags).slice(0, 8);
  const confidence = clamp(Number(obj.confidence ?? fallback.confidence) || fallback.confidence, 0, 1);
  const effectiveComplianceFlags = complianceFlags.length ? complianceFlags : fallback.complianceFlags;
  const effectiveReasonFlags = reasonFlagsFromDetails(reasonDetails, effectiveComplianceFlags);
  const readyThreshold = context ? getReadyConfidenceThreshold(context.imageTruth) : 0.78;
  const blockingReasonDetails = context ? getReviewBlockingReasonDetails(reasonDetails, context.imageTruth) : reasonDetails;
  const blockingReasonFlags = reasonFlagsFromDetails(blockingReasonDetails, effectiveComplianceFlags);

  if (grade === "green" && (blockingReasonFlags.length > 0 || effectiveComplianceFlags.length > 0 || confidence < readyThreshold)) {
    grade = "orange";
  }

  const normalizedValidator = {
    grade,
    confidence,
    reasonFlags: effectiveReasonFlags,
    complianceFlags: effectiveComplianceFlags,
    reasonDetails,
  } satisfies ValidatorResult;

  if (!context) return normalizedValidator;

  return sanitizeValidatorSignals(
    normalizedValidator,
    context.title,
    context.leadParagraphs,
    context.imageTruth
  );
}

function buildMasterPrompt(
  input: ListingRequest,
  filenameAssessment: FilenameAssessment,
  explicitTitleSeed: string,
  retryContext: RetryContext,
  localeProfile: LocaleProfile,
  visionPromptHint?: string
) {
  const productFamily = cleanSpaces(input.productFamily || "product");

  return [
    "You are an elite e-commerce copywriter and Quality Control gatekeeper. Analyze the provided merchandise graphic.",
    "",
    "VISION INSTRUCTION",
    "This image may be a transparent PNG or isolated vector graphic intended for merchandise printing.",
    "If the image has been composited on a solid background for visibility, ignore the artificial background and focus only on the foreground typography, artwork, symbols, illustration, linework, and aesthetic.",
    "If multiple renders are provided, treat them as alternate views of the same design and trust the clearest render over the filename.",
    "If you receive black-backed, white-backed, cropped, or helper renders, use them only to understand sparse or transparent artwork while preserving the untouched upload as the source of truth.",
    visionPromptHint ? visionPromptHint : "",
    "",
    "STEP 1: QC GATE",
    "If the image is completely illegible, a blank square, or highly distorted, set qc_approved to false and leave all other fields blank.",
    "If the design is legible and clear, set qc_approved to true.",
    "",
    "STEP 2: SEO GENERATION (IF APPROVED)",
    "Based purely on the visual aesthetic, typography, and vibe of the design, generate:",
    "- seo_title: a highly clickable, keyword-optimized title.",
    "- seo_paragraph_1: the first marketing paragraph.",
    "- seo_paragraph_2: the second marketing paragraph.",
    "- seo_tags: an array of exactly 15 high-value SEO tags.",
    "",
    "CRITICAL RULES",
    "- Do not include generic garment specs, care instructions, fit, cotton weight, or template text.",
    "- Focus only on the art/design and its customer appeal.",
    "- Weave the strongest keywords from seo_title naturally into seo_paragraph_1.",
    "- seo_paragraph_2 must end in a complete sentence.",
    "- Provider template/spec content is application-owned and must never be rewritten, summarized, or paraphrased.",
    "",
    "ANALYSIS RULES",
    "- Image truth is primary. Visible text outranks filename text.",
    "- Ignore artificial helper backgrounds and focus only on the foreground design.",
    "- Do not hallucinate unsupported claims, official licensing, or hidden artwork details.",
    "- Use filename only as support. If the artwork is clear, do not let the filename write the title or marketing copy for you.",
    "- Strong transparent PNG artwork with clean readable text or simple legible iconography still counts as meaningful visual evidence even when the canvas is sparse.",
    `- Current local filename assessment hint: ${filenameAssessment.classification} (${filenameAssessment.reason})`,
    `- Conflict severity hint: ${filenameAssessment.conflictSeverity}; ignore filename: ${filenameAssessment.shouldIgnore ? "yes" : "no"}`,
    "",
    "JSON SCHEMA",
    '{"qc_approved": boolean, "seo_title": string, "seo_paragraph_1": string, "seo_paragraph_2": string, "seo_tags": string[]}',
    "",
    "OUTPUT FORMAT",
    "Return ONLY valid structured JSON.",
    "No conversational filler.",
    "No markdown fences.",
    "",
    "INPUT CONTEXT",
    `productFamily: ${productFamily}`,
    `titleSeed: ${explicitTitleSeed || "none"}`,
    `fileNameSupport: ${input.fileName || "none"}`,
    `locale: ${localeProfile.locale}`,
    `retryAttempt: ${retryContext.attempt}`,
    retryContext.retryInstruction ? `retryInstruction: ${retryContext.retryInstruction}` : "",
  ].join("\n");
}

function buildFallbackRecord(input: ListingRequest, localeProfile: LocaleProfile, retryCount = 0) {
  const emptyImageTruth: ImageTruthRecord = {
    visibleText: [],
    visibleFacts: [],
    inferredMeaning: [],
    dominantTheme: detectTheme(`${input.title || ""} ${input.templateContext || ""}`),
    likelyAudience: "general audience",
    likelyOccasion: detectTheme(`${input.title || ""} ${input.templateContext || ""}`),
    uncertainty: [],
    ocrWeakness: "local-fallback-no-multimodal-ocr",
    meaningClarity: input.title || input.fileName ? 0.58 : 0.34,
    hasReadableText: false,
  };
  const filenameAssessment = assessFilenameRelevance(input.fileName || "", []);
  const normalizedTitleSeed = chooseTitleSeed(input, emptyImageTruth, filenameAssessment);
  const imageTruth: ImageTruthRecord = {
    visibleText: [],
    visibleFacts: [],
    inferredMeaning: [detectTheme(`${normalizedTitleSeed} ${input.templateContext || ""}`)],
    dominantTheme: detectTheme(`${normalizedTitleSeed} ${input.templateContext || ""}`),
    likelyAudience: "general audience",
    likelyOccasion: detectTheme(`${normalizedTitleSeed} ${input.templateContext || ""}`),
    uncertainty: [
      retryCount > 0
        ? `Deterministic fallback used after ${retryCount} bounded Gemini attempt${retryCount === 1 ? "" : "s"} failed or returned unusable structured output.`
        : "Local fallback used because Gemini output was unavailable or unparseable.",
    ],
    ocrWeakness: "local-fallback-no-multimodal-ocr",
    meaningClarity: normalizedTitleSeed ? 0.58 : 0.34,
    hasReadableText: false,
  };

  const semantic = buildSemanticRecord(input, imageTruth, filenameAssessment);
  const leadParagraphs = normalizeLeadParagraphs(
    semantic.titleCore,
    buildDefaultLead(semantic, localeProfile),
    semantic,
    localeProfile
  );
  const marketplaceDrafts = buildMarketplaceDrafts(semantic, leadParagraphs, localeProfile);
  const validator = gradeListing(
    imageTruth,
    semantic,
    filenameAssessment,
    semantic.titleCore,
    leadParagraphs,
    marketplaceDrafts.etsy.discoveryTerms
  );
  const canonicalTitle = marketplaceDrafts.etsy.title || semantic.titleCore || "Product";
  const canonicalLeadParagraphs = sanitizeMarketingLeadParagraphs(
    marketplaceDrafts.etsy.leadParagraphs,
    semantic,
    localeProfile
  );
  const canonicalDescription = assembleMarketingDescription(canonicalLeadParagraphs);
  const seoTags = buildFallbackTags(canonicalTitle, canonicalDescription, semantic, marketplaceDrafts);
  const qcApproved = validator.grade !== "red";

  return {
    source: "fallback",
    qcApproved,
    imageTruth,
    filenameAssessment,
    semanticRecord: semantic,
    marketplaceDrafts,
    validator,
    canonicalTitle,
    canonicalDescription,
    seoTags,
    canonicalLeadParagraphs,
  } satisfies EngineRecord;
}

async function callGeminiRecord(
  input: ListingRequest,
  options: Required<Pick<GenerateOptions, "apiKey" | "model" | "fetchFn">> & {
    localeProfile: LocaleProfile;
    retryContext: RetryContext;
  }
) {
  const visionInputs = await prepareVisionInputs(String(input.imageDataUrl || ""));
  if (!visionInputs) return null;

  const explicitTitleSeed = cleanSpaces(input.title || "") ? normalizeTitle(input.title || "", "") : "";
  const filenameAssessmentSeed = assessFilenameRelevance(input.fileName || "", []);
  const prompt = buildMasterPrompt(
    input,
    filenameAssessmentSeed,
    explicitTitleSeed,
    options.retryContext,
    options.localeProfile,
    visionInputs.promptHint
  );
  const endpoint = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(options.model)}:generateContent`;

  const response = await options.fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": options.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: visionInputs.primary.mimeType,
                data: visionInputs.primary.inlineData,
              },
            },
            ...(visionInputs.helpers || []).map((helperInput) => ({
              inlineData: {
                mimeType: helperInput.mimeType,
                data: helperInput.inlineData,
              },
            })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const rawText = extractGeminiText(payload);
  const parsed = parseJsonLoose(rawText);
  if (!parsed || typeof parsed !== "object") return null;

  const parsedObj = parsed as Record<string, unknown>;
  const qcApproved =
    typeof parsedObj.qc_approved === "boolean"
      ? parsedObj.qc_approved
      : typeof parsedObj.qcApproved === "boolean"
        ? parsedObj.qcApproved
        : true;

  const titleSeedCandidate =
    parsedObj.seo_title
    || parsedObj.seoTitle
    || parsedObj.generatedTitle
    || parsedObj.generated_title
    || parsedObj.finalTitle
    || parsedObj.final_title
    || parsedObj.canonicalTitle
    || parsedObj.title
    || explicitTitleSeed
    || input.fileName
    || "Product";

  const provisionalTitle = normalizeTitle(String(titleSeedCandidate), input.fileName || explicitTitleSeed);
  const fallbackImageTruth = buildQcDerivedImageTruth(input, provisionalTitle, qcApproved);
  const imageTruth = parsedObj.imageTruth
    ? normalizeImageTruth(parsedObj.imageTruth, provisionalTitle || explicitTitleSeed)
    : fallbackImageTruth;
  const filenameAssessment = assessFilenameRelevance(input.fileName || "", imageTruth.visibleText);
  const semanticFallback = buildSemanticRecord(
    {
      ...input,
      title: provisionalTitle || input.title,
    },
    imageTruth,
    filenameAssessment
  );
  const semantic = parsedObj.semanticRecord
    ? normalizeSemantic(parsedObj.semanticRecord, semanticFallback)
    : {
        ...semanticFallback,
        titleCore: provisionalTitle || semanticFallback.titleCore,
        benefitCore: cleanSpaces(
          String(
            parsedObj.seo_paragraph_1
            || parsedObj.seoParagraph1
            || parsedObj.generatedParagraph1
            || semanticFallback.benefitCore
          )
        ),
      };

  if (!qcApproved) {
    return {
      source: "gemini",
      qcApproved: false,
      imageTruth,
      filenameAssessment,
      semanticRecord: semantic,
      marketplaceDrafts: buildEmptyMarketplaceDrafts(),
      validator: buildQcRejectedValidator(),
      canonicalTitle: "",
      canonicalDescription: "",
      seoTags: [],
      canonicalLeadParagraphs: [],
    } satisfies EngineRecord;
  }

  const finalTitleCandidate =
    parsedObj.seo_title
    || parsedObj.seoTitle
    || parsedObj.generatedTitle
    || parsedObj.generated_title
    || parsedObj.finalTitle
    || parsedObj.final_title
    || parsedObj.canonicalTitle
    || parsedObj.title
    || semantic.titleCore
    || explicitTitleSeed;

  const canonicalTitle = normalizeTitle(
    String(finalTitleCandidate),
    input.fileName || explicitTitleSeed
  );

  const suppliedLeadCandidates = [
    parsedObj.seo_paragraph_1,
    parsedObj.seoParagraph1,
    parsedObj.seo_paragraph_2,
    parsedObj.seoParagraph2,
    parsedObj.generatedParagraph1,
    parsedObj.generated_paragraph_1,
    parsedObj.generatedParagraph2,
    parsedObj.generated_paragraph_2,
    ...normalizeArray(parsedObj.canonicalLeadParagraphs || parsedObj.leadParagraphs),
    ...normalizeDescriptionParagraphs(
      parsedObj.finalDescription || parsedObj.final_description || parsedObj.description,
      canonicalTitle
    ),
  ]
    .map((value) => stripMarkdownFences(String(value || "")))
    .map((value) =>
      removeLeadingLabel(value, [
        "seoParagraph1",
        "seoParagraph2",
        "seo_paragraph_1",
        "seo_paragraph_2",
        "generatedParagraph1",
        "generatedParagraph2",
        "generated_paragraph_1",
        "generated_paragraph_2",
        "paragraph1",
        "paragraph2",
      ])
    )
    .map((value) => value.replace(/^[-*•]+\s*/, "").trim())
    .filter(Boolean);

  const canonicalLeads = sanitizeMarketingLeadParagraphs(
    normalizeLeadParagraphs(
      canonicalTitle,
      suppliedLeadCandidates.length
        ? suppliedLeadCandidates
        : buildDefaultLead(semantic, options.localeProfile),
      semantic,
      options.localeProfile
    ),
    semantic,
    options.localeProfile
  );

  const marketplaceDrafts = parsedObj.marketplaceDrafts
    ? normalizeMarketplaceDrafts(
        parsedObj.marketplaceDrafts,
        semantic,
        canonicalLeads,
        options.localeProfile
      )
    : buildMarketplaceDrafts(semantic, canonicalLeads, options.localeProfile);
  const gradedFallback = gradeListing(
    imageTruth,
    semantic,
    filenameAssessment,
    canonicalTitle,
    canonicalLeads,
    marketplaceDrafts.etsy.discoveryTerms
  );
  const validator = normalizeValidator(parsedObj.validator, gradedFallback, {
    title: canonicalTitle,
    leadParagraphs: canonicalLeads,
    imageTruth,
  });
  const canonicalDescription = assembleMarketingDescription(canonicalLeads);
  const seoTags = normalizeTagsOutput(
    parsedObj.seo_tags ?? parsedObj.seoTags ?? parsedObj.tags,
    canonicalTitle,
    canonicalDescription,
    semantic,
    marketplaceDrafts
  );
  const reasonFlags = validator.reasonFlags.length
    ? validator.reasonFlags
    : reasonFlagsFromDetails(validator.reasonDetails, validator.complianceFlags);

  return {
    source: "gemini",
    qcApproved: true,
    imageTruth,
    filenameAssessment,
    semanticRecord: semantic,
    marketplaceDrafts,
    validator: {
      ...validator,
      reasonFlags,
    },
    canonicalTitle: canonicalTitle || marketplaceDrafts.etsy.title || semantic.titleCore || explicitTitleSeed || "Product",
    canonicalDescription,
    seoTags,
    canonicalLeadParagraphs: canonicalLeads,
  } satisfies EngineRecord;
}

function mapRecordToUiResponse(record: EngineRecord, model: string, localeProfile: LocaleProfile): ListingUiResponse {
  const leadParagraphs = normalizeLeadParagraphs(
    record.canonicalTitle,
    record.canonicalLeadParagraphs,
    record.semanticRecord,
    localeProfile
  );

  return {
    qcApproved: record.qcApproved,
    title: record.qcApproved ? normalizeTitle(record.canonicalTitle, record.semanticRecord.titleCore || "Product") : "",
    description: record.qcApproved ? record.canonicalDescription : "",
    tags: record.qcApproved ? unique(record.seoTags).slice(0, FINAL_TAG_COUNT) : [],
    leadParagraphs: record.qcApproved ? leadParagraphs : [],
    leadParagraph1: record.qcApproved ? leadParagraphs[0] || "" : "",
    leadParagraph2: record.qcApproved ? leadParagraphs[1] || "" : "",
    model,
    confidence: clamp(Number(record.validator.confidence || 0.7), 0, 1),
    reasonFlags: unique(record.validator.reasonFlags).slice(0, 6),
    source: record.source,
    grade: record.validator.grade,
    marketplaceDrafts: record.marketplaceDrafts,
    semanticRecord: record.semanticRecord,
  };
}

export async function generateListingResponse(input: ListingRequest, options: GenerateOptions = {}): Promise<ListingUiResponse> {
  const fetchFn = options.fetchFn || fetch;
  const model = options.model || DEFAULT_MODEL;
  const apiKey = resolveApiKey(options.apiKey);
  const localeProfile = getLocaleProfile(options.locale);

  if (!input?.imageDataUrl) {
    throw new Error("Image data is required.");
  }

  if (apiKey) {
    for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt += 1) {
      try {
        const geminiRecord = await callGeminiRecord(input, {
          fetchFn,
          apiKey,
          model,
          localeProfile,
          retryContext: {
            attempt,
            retryInstruction:
              attempt > 1
                ? "Previous attempt failed schema validation or parsing. Return strict JSON only, with all required fields populated."
                : undefined,
          },
        });
        if (geminiRecord) {
          return mapRecordToUiResponse(geminiRecord, model, localeProfile);
        }
      } catch (error) {
        if (error instanceof ListingInputGuardError) {
          throw error;
        }

        if (attempt >= MAX_GEMINI_ATTEMPTS) break;
      }
    }
  }

  return mapRecordToUiResponse(buildFallbackRecord(input, localeProfile, apiKey ? MAX_GEMINI_ATTEMPTS : 0), model, localeProfile);
}
