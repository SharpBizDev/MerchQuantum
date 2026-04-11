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
const MAX_GEMINI_ATTEMPTS = 2;
const MAX_VISION_ANALYSIS_BYTES = 15 * 1024 * 1024;
const MAX_VISION_ANALYSIS_PIXELS = 33_000_000;
const MAX_VISION_ANALYSIS_DIMENSION = 7000;
const SPARSE_TRANSPARENT_COVERAGE_THRESHOLD = 0.68;
const MIN_TRIM_GAIN_PX = 48;
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
  if (upper === "T-SHIRT") return "T-Shirt";
  if (["AI", "USA", "DTG", "DTF", "SVG", "PNG", "JPG", "PDF", "DIY"].includes(upper)) return upper;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeTitle(rawTitle: string, fileName = "", maxChars = MAX_TITLE_CHARS) {
  const seed = cleanSpaces(stripExtension(rawTitle || fileName || "Product"));
  const words = seed
    .replace(/[\/_|]+/g, " ")
    .replace(/\s*[-â€“â€”]\s*/g, " ")
    .replaceþÉâ¦ y¶¬{®(š+my×è­ºÞ¾+rŠ{.šf«