import sharp from "sharp";

export type ListingRequest = {
  imageDataUrl?: string;
  title?: string;
  fileName?: string;
  productFamily?: string;
  templateContext?: string;
};

export type ListingUiResponse = {
  title: string;
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
  canonicalLeadParagraphs: string[];
};

type EngineRecord = GeminiRecord & {
  source: "gemini" | "fallback";
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
  helper?: ParsedImageData;
  promptHint?: string;
};

const DEFAULT_MODEL = process.env.GEMINI_LISTING_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TEMPLATE_CONTEXT = 1400;
const MAX_TITLE_CHARS = 120;
const MAX_LEAD_CHARS = 260;
const MAX_GEMINI_ATTEMPTS = 2;
const SPARSE_TRANSPARENT_COVERAGE_THRESHOLD = 0.68;
const MIN_TRIM_GAIN_PX = 48;

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
    imageTruth: {
      type: "OBJECT",
      properties: {
        visibleText: { type: "ARRAY", items: { type: "STRING" } },
        visibleFacts: { type: "ARRAY", items: { type: "STRING" } },
        inferredMeaning: { type: "ARRAY", items: { type: "STRING" } },
        dominantTheme: { type: "STRING" },
        likelyAudience: { type: "STRING" },
        likelyOccasion: { type: "STRING" },
        uncertainty: { type: "ARRAY", items: { type: "STRING" } },
        ocrWeakness: { type: "STRING" },
        meaningClarity: { type: "NUMBER" },
        hasReadableText: { type: "BOOLEAN" },
      },
      required: [
        "visibleText",
        "visibleFacts",
        "inferredMeaning",
        "dominantTheme",
        "likelyAudience",
        "likelyOccasion",
        "uncertainty",
        "ocrWeakness",
        "meaningClarity",
        "hasReadableText",
      ],
    },
    filenameAssessment: {
      type: "OBJECT",
      properties: {
        classification: { type: "STRING" },
        usefulness: { type: "NUMBER" },
        usefulTokens: { type: "ARRAY", items: { type: "STRING" } },
        ignoredTokens: { type: "ARRAY", items: { type: "STRING" } },
        conflictSeverity: { type: "STRING" },
        shouldIgnore: { type: "BOOLEAN" },
        reason: { type: "STRING" },
      },
      required: ["classification", "usefulness", "usefulTokens", "ignoredTokens", "reason"],
    },
    semanticRecord: {
      type: "OBJECT",
      properties: {
        productNoun: { type: "STRING" },
        titleCore: { type: "STRING" },
        benefitCore: { type: "STRING" },
        likelyAudience: { type: "STRING" },
        styleOccasion: { type: "STRING" },
        visibleKeywords: { type: "ARRAY", items: { type: "STRING" } },
        inferredKeywords: { type: "ARRAY", items: { type: "STRING" } },
        forbiddenClaims: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: [
        "productNoun",
        "titleCore",
        "benefitCore",
        "likelyAudience",
        "styleOccasion",
        "visibleKeywords",
        "inferredKeywords",
        "forbiddenClaims",
      ],
    },
    marketplaceDrafts: {
      type: "OBJECT",
      properties: {
        etsy: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            leadParagraphs: { type: "ARRAY", items: { type: "STRING" } },
            discoveryTerms: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["title", "leadParagraphs", "discoveryTerms"],
        },
        amazon: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            leadParagraphs: { type: "ARRAY", items: { type: "STRING" } },
            discoveryTerms: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["title", "leadParagraphs", "discoveryTerms"],
        },
        ebay: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            leadParagraphs: { type: "ARRAY", items: { type: "STRING" } },
            discoveryTerms: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["title", "leadParagraphs", "discoveryTerms"],
        },
        tiktokShop: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            leadParagraphs: { type: "ARRAY", items: { type: "STRING" } },
            discoveryTerms: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["title", "leadParagraphs", "discoveryTerms"],
        },
      },
      required: ["etsy", "amazon", "ebay", "tiktokShop"],
    },
    validator: {
      type: "OBJECT",
      properties: {
        grade: { type: "STRING" },
        confidence: { type: "NUMBER" },
        reasonFlags: { type: "ARRAY", items: { type: "STRING" } },
        complianceFlags: { type: "ARRAY", items: { type: "STRING" } },
        reasonDetails: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              code: { type: "STRING" },
              severity: { type: "STRING" },
              stage: { type: "STRING" },
              summary: { type: "STRING" },
            },
            required: ["code", "severity", "stage", "summary"],
          },
        },
      },
      required: ["grade", "confidence", "reasonFlags", "complianceFlags"],
    },
    canonicalTitle: { type: "STRING" },
    canonicalLeadParagraphs: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "imageTruth",
    "filenameAssessment",
    "semanticRecord",
    "marketplaceDrafts",
    "validator",
    "canonicalTitle",
    "canonicalLeadParagraphs",
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

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const word of words) {
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

function reasonFlagsFromDetails(reasonDetails: ListingReason[], complianceFlags: string[]) {
  const fromDetails = reasonDetails
    .filter((detail) => detail.severity !== "info")
    .map((detail) => detail.summary);
  return unique([...fromDetails, ...complianceFlags]).slice(0, 6);
}

function getVisibleTextSeed(imageTruth: ImageTruthRecord) {
  const visibleSeed = normalizeTitle(imageTruth.visibleText.slice(0, 2).join(" "), "");
  return visibleSeed || normalizeTitle(imageTruth.visibleFacts.slice(0, 1).join(" "), "");
}

function chooseTitleSeed(input: ListingRequest, imageTruth: ImageTruthRecord, filenameAssessment: FilenameAssessment) {
  const explicitTitle = normalizeTitle(input.title || "", input.fileName || "");
  if (explicitTitle) return explicitTitle;

  const visibleSeed = getVisibleTextSeed(imageTruth);
  if (visibleSeed && (filenameAssessment.shouldIgnore || filenameAssessment.classification === "weak_or_generic")) {
    return visibleSeed;
  }

  return normalizeTitle(input.fileName || visibleSeed || "Product", visibleSeed || "");
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
  const rebuiltReasonFlags = reasonFlagsFromDetails(polishedReasonDetails, filteredComplianceFlags);
  let grade = validator.grade;

  if (validator.confidence < 0.38) {
    grade = "red";
  } else if (rebuiltReasonFlags.length === 0 && filteredComplianceFlags.length === 0 && validator.confidence >= 0.78) {
    grade = "green";
  } else if (grade === "green" && (rebuiltReasonFlags.length > 0 || filteredComplianceFlags.length > 0)) {
    grade = "orange";
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

function buildDefaultLead(semantic: SemanticRecord, localeProfile: LocaleProfile) {
  return [
    `${capitalizeFirst(semantic.benefitCore)} shape the tone of this ${semantic.productNoun}, giving it a ${semantic.styleOccasion} feel that reads clearly at a glance.`,
    `It is positioned for ${semantic.likelyAudience} shoppers who want something easy to wear, easy to gift, and strong enough to let the design carry the story.`,
  ];
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
    const genericLead =
      /crafted for comfort|perfect for everyday wear|ideal choice|thoughtful gift|versatile addition|pairs well with any outfit|simply adding a touch|casual wardrobe/i.test(
        secondLead
      ) ||
      tokenizeForVariety(secondLead).length < 10;

    if (!mentionsTemplateSignal || genericLead) {
      finalParagraphs[1] = normalizedFallback[1];
    }
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

  if (imageTruth.ocrWeakness && !/none|clear/i.test(imageTruth.ocrWeakness)) {
    confidence -= 0.1;
    reasonDetails.push(
      makeReason("ocr_weakness", "warning", "image_truth", "OCR/text legibility is weak or partial.")
    );
  }

  if (imageTruth.uncertainty.length > 0) {
    confidence -= 0.06;
    reasonDetails.push(
      ...imageTruth.uncertainty
        .slice(0, 2)
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
  const dedupedReasons = reasonFlagsFromDetails(polishedReasonDetails, dedupedCompliance);

  if (confidence < 0.38 || imageTruth.meaningClarity < 0.35) {
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

  if (confidence >= 0.78 && dedupedReasons.length === 0 && dedupedCompliance.length === 0) {
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
  const firstParagraph = pickDeterministicVariant(seed, [
    `Built on a ${templateSignal.shortLabel.toLowerCase()} base, this ${semantic.productNoun} feels ready for ${templateSignal.useCase}, supported by ${templateSignal.detailSummary.toLowerCase()}.`,
    `${capitalizeFirst(templateSignal.detailSummary)} give this ${semantic.productNoun} a more believable foundation for ${templateSignal.useCase}, keeping the design message clear at a glance.`,
    `This ${semantic.productNoun} uses ${templateSignal.detailSummary.toLowerCase()} to support a ${templateSignal.useCase} angle that feels grounded instead of generic.`,
  ]);

  const secondParagraph = pickDeterministicVariant(`${seed}|buyer`, [
    `That ${templateSignal.shortLabel.toLowerCase()} foundation helps shoppers picture the design in real rotation without forcing the opener into a raw spec dump.`,
    `Instead of leaning on stock filler, the product context gives buyers a clearer sense of how the design fits into repeat wear, gifting, and everyday styling.`,
    `The template details give the artwork a more convincing home, so the listing can stay message-led while still sounding useful for buyers.`,
    `Those product cues keep the copy grounded for ${templateSignal.useCase}, making the listing feel easier to trust, gift, and wear on repeat.`,
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

async function prepareVisionInputs(imageDataUrl: string): Promise<VisionInputSet | null> {
  const parsed = parseImageData(imageDataUrl);
  if (!parsed) return null;

  if (!/^image\/(png|webp)$/i.test(parsed.mimeType)) {
    return { primary: parsed };
  }

  try {
    const sourceBuffer = Buffer.from(parsed.inlineData, "base64");
    const sourceImage = sharp(sourceBuffer, { failOn: "none", limitInputPixels: false }).ensureAlpha();
    const metadata = await sourceImage.metadata();

    if (!metadata.hasAlpha || !metadata.width || !metadata.height) {
      return { primary: parsed };
    }

    const { data: trimmedBuffer, info: trimmedInfo } = await sourceImage
      .clone()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .png()
      .toBuffer({ resolveWithObject: true });

    const coverage = (trimmedInfo.width * trimmedInfo.height) / (metadata.width * metadata.height);
    const trimGain = (metadata.width - trimmedInfo.width) + (metadata.height - trimmedInfo.height);

    if (!Number.isFinite(coverage) || coverage >= SPARSE_TRANSPARENT_COVERAGE_THRESHOLD || trimGain < MIN_TRIM_GAIN_PX) {
      return { primary: parsed };
    }

    const panelSize = clamp(Math.max(trimmedInfo.width, trimmedInfo.height) + 96, 640, 1024);
    const artworkSize = Math.max(220, Math.round(panelSize * 0.7));
    const gap = 24;
    const artworkBuffer = await sharp(trimmedBuffer, { failOn: "none", limitInputPixels: false })
      .resize({
        width: artworkSize,
        height: artworkSize,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const lightPanel = await sharp({
      create: {
        width: panelSize,
        height: panelSize,
        channels: 4,
        background: { r: 245, g: 245, b: 244, alpha: 1 },
      },
    })
      .composite([{ input: artworkBuffer, gravity: "center" }])
      .png()
      .toBuffer();

    const darkPanel = await sharp({
      create: {
        width: panelSize,
        height: panelSize,
        channels: 4,
        background: { r: 17, g: 24, b: 39, alpha: 1 },
      },
    })
      .composite([{ input: artworkBuffer, gravity: "center" }])
      .png()
      .toBuffer();

    const helperBuffer = await sharp({
      create: {
        width: panelSize * 2 + gap * 3,
        height: panelSize + gap * 2,
        channels: 4,
        background: { r: 229, g: 231, b: 235, alpha: 1 },
      },
    })
      .composite([
        { input: lightPanel, left: gap, top: gap },
        { input: darkPanel, left: panelSize + gap * 2, top: gap },
      ])
      .png()
      .toBuffer();

    return {
      primary: parsed,
      helper: {
        mimeType: "image/png",
        inlineData: helperBuffer.toString("base64"),
      },
      promptHint:
        "A second helper image may be included showing the same artwork cropped to its non-transparent bounds and placed on light and dark neutral panels. Use that helper to read sparse transparent line art, but treat it as the same design rather than a second product image.",
    };
  } catch {
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
  const effectiveComplianceFlags = complianceFlags.length ? complianceFlags : fallback.complianceFlags;
  const effectiveReasonFlags = reasonFlagsFromDetails(reasonDetails, effectiveComplianceFlags);

  if (grade === "green" && (effectiveReasonFlags.length > 0 || effectiveComplianceFlags.length > 0)) {
    grade = "orange";
  }

  const normalizedValidator = {
    grade,
    confidence: clamp(Number(obj.confidence ?? fallback.confidence) || fallback.confidence, 0, 1),
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
  normalizedTitleSeed: string,
  retryContext: RetryContext,
  localeProfile: LocaleProfile,
  visionPromptHint?: string
) {
  const templateContext = summarizeTemplateContext(input.templateContext || "");
  const productFamily = cleanSpaces(input.productFamily || "product");

  return [
    "SYSTEM ROLE",
    "You are Quantum AI Listing Engine, a marketplace-safe multimodal listing strategist for print-on-demand products.",
    "",
    "PRIMARY GOAL",
    "Generate image-first listing intelligence and channel-aware listing drafts from the uploaded design image while preserving compliance, clarity, and relevance.",
    "",
    "NON-NEGOTIABLE RULES",
    "- Image truth is primary. Visible text outranks filename text.",
    "- Separate visible facts from inferred meaning.",
    "- Do not hallucinate unsupported claims or official licensing.",
    "- Do not begin buyer-facing lead copy by repeating the full title.",
    "- Keep discovery terms relevant and non-redundant.",
    "- Treat templateContext as factual product/spec context, not as buyer-facing lead copy.",
    "- Use templateContext to understand the blank product, fit, materials, and merchandising angle without dumping raw spec language into the opener.",
    visionPromptHint ? `- ${visionPromptHint}` : "",
    "",
    "STEP 1 IMAGE TRUTH EXTRACTION",
    "- Extract visible text, visible facts, inferred meaning, dominant theme, likely audience, likely occasion, uncertainty, and OCR weakness.",
    "",
    "STEP 2 FILENAME RELEVANCE CHECK",
    "- Evaluate filename usefulness independently.",
    "- Keep only supportive filename clues; ignore weak/generic terms.",
    `- Current local filename assessment hint: ${filenameAssessment.classification} (${filenameAssessment.reason})`,
    `- Conflict severity hint: ${filenameAssessment.conflictSeverity}; ignore filename: ${filenameAssessment.shouldIgnore ? "yes" : "no"}`,
    "- Few-shot examples:",
    "  1) clear image text + useless filename -> trust image text, ignore filename",
    "  2) useful filename + weak image text -> use filename only as soft support, lower confidence",
    "  3) transparent PNG weak contrast -> note OCR weakness and uncertainty",
    "  4) partial/cropped slogan -> preserve only visible words, avoid guessing missing words",
    "  5) filename conflicts with visible text -> mark conflict and de-prioritize filename",
    "  6) filename has fragmentary support -> include only non-conflicting supportive terms",
    "",
    "STEP 3 SEMANTIC RECORD GENERATION",
    "- Build product_noun, title_core, benefit_core, likely audience, style/occasion, visible keywords, inferred keywords, forbidden claim candidates.",
    "",
    "STEP 4 TITLE GENERATION",
    "- Produce concise, readable, marketplace-usable titles.",
    "- Avoid hype stuffing, fake urgency, and unsupported claims.",
    "",
    "STEP 5 TWO-LAYER DESCRIPTION GENERATION",
    "- Produce two lead paragraphs only for buyer-facing opening copy.",
    "- Keep persuasion copy separate from factual template/spec content.",
    "- Never start the first lead paragraph with the full title string.",
    "",
    "STEP 6 DISCOVERY TERMS BY MARKETPLACE",
    "- Render internal channel-aware outputs for Etsy, Amazon, eBay, and TikTok Shop.",
    "- Keep each channel output structured with title, leadParagraphs, discoveryTerms.",
    "",
    "STEP 7 VALIDATION",
    "- Validate relevance, readability, compliance, review risk, and repetition.",
    "- Return validator.reasonDetails objects with code, severity, stage, and summary when possible.",
    "",
    "STEP 8 FINAL GREEN / ORANGE / RED GRADING",
    "- Green: clear image meaning + usable title + non-repetitive lead + relevant discovery terms + no compliance concerns.",
    "- Orange: usable but needs review (partial OCR, filename conflict, or soft compliance risk).",
    "- Red: meaning too unclear, text extraction too weak, or likely non-compliant.",
    "",
    "OUTPUT FORMAT",
    "Return JSON only matching the required schema fields.",
    "",
    "INPUT CONTEXT",
    `productFamily: ${productFamily}`,
    `titleSeed: ${normalizedTitleSeed}`,
    `fileName: ${input.fileName || "none"}`,
    `templateContext: ${templateContext}`,
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
    buildTemplateAwareLead(input.templateContext || "", semantic, localeProfile),
    semantic,
    localeProfile,
    input.templateContext || ""
  );
  const marketplaceDrafts = buildMarketplaceDrafts(semantic, leadParagraphs, localeProfile, input.templateContext || "");
  const validator = gradeListing(
    imageTruth,
    semantic,
    filenameAssessment,
    semantic.titleCore,
    leadParagraphs,
    marketplaceDrafts.etsy.discoveryTerms
  );
  const canonicalTitle = marketplaceDrafts.etsy.title || semantic.titleCore || "Product";
  const canonicalLeadParagraphs = marketplaceDrafts.etsy.leadParagraphs;

  return {
    source: "fallback",
    imageTruth,
    filenameAssessment,
    semanticRecord: semantic,
    marketplaceDrafts,
    validator,
    canonicalTitle,
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

  const normalizedTitleSeed = normalizeTitle(input.title || "", input.fileName || "");
  const filenameAssessmentSeed = assessFilenameRelevance(input.fileName || "", []);
  const prompt = buildMasterPrompt(
    input,
    filenameAssessmentSeed,
    normalizedTitleSeed,
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
            ...(visionInputs.helper
              ? [
                  {
                    inlineData: {
                      mimeType: visionInputs.helper.mimeType,
                      data: visionInputs.helper.inlineData,
                    },
                  },
                ]
              : []),
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
  const imageTruth = normalizeImageTruth(parsedObj.imageTruth, normalizedTitleSeed);
  const filenameAssessment = assessFilenameRelevance(input.fileName || "", imageTruth.visibleText);
  const semanticFallback = buildSemanticRecord(input, imageTruth, filenameAssessment);
  const semantic = normalizeSemantic(parsedObj.semanticRecord, semanticFallback);

  const canonicalTitle = normalizeTitle(
    String(parsedObj.canonicalTitle || parsedObj.title || semantic.titleCore || normalizedTitleSeed),
    input.fileName || normalizedTitleSeed
  );

  const canonicalLeads = normalizeLeadParagraphs(
    canonicalTitle,
    (() => {
      const suppliedLeads = normalizeArray(parsedObj.canonicalLeadParagraphs || parsedObj.leadParagraphs);
      return suppliedLeads.length
        ? suppliedLeads
        : buildTemplateAwareLead(input.templateContext || "", semantic, options.localeProfile);
    })(),
    semantic,
    options.localeProfile,
    input.templateContext || ""
  );

  const marketplaceDrafts = normalizeMarketplaceDrafts(
    parsedObj.marketplaceDrafts,
    semantic,
    canonicalLeads,
    options.localeProfile,
    input.templateContext || ""
  );
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
  const reasonFlags = validator.reasonFlags.length
    ? validator.reasonFlags
    : reasonFlagsFromDetails(validator.reasonDetails, validator.complianceFlags);

  return {
    source: "gemini",
    imageTruth,
    filenameAssessment,
    semanticRecord: semantic,
    marketplaceDrafts,
    validator: {
      ...validator,
      reasonFlags,
    },
    canonicalTitle: canonicalTitle || marketplaceDrafts.etsy.title || semantic.titleCore || normalizedTitleSeed || "Product",
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
    title: normalizeTitle(record.canonicalTitle, record.semanticRecord.titleCore || "Product"),
    leadParagraphs,
    leadParagraph1: leadParagraphs[0] || "",
    leadParagraph2: leadParagraphs[1] || "",
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
      } catch {
        if (attempt >= MAX_GEMINI_ATTEMPTS) break;
      }
    }
  }

  return mapRecordToUiResponse(buildFallbackRecord(input, localeProfile, apiKey ? MAX_GEMINI_ATTEMPTS : 0), model, localeProfile);
}
