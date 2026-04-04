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

const DEFAULT_MODEL = process.env.GEMINI_LISTING_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TEMPLATE_CONTEXT = 1400;
const MAX_TITLE_CHARS = 120;
const MAX_LEAD_CHARS = 260;
const MAX_GEMINI_ATTEMPTS = 2;

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

function trimSentence(value: string, maxChars: number) {
  const clean = cleanSpaces(value);
  if (!clean || clean.length <= maxChars) return clean;
  const clipped = clean.slice(0, maxChars).trim();
  const sentenceBreak = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (sentenceBreak >= Math.floor(maxChars * 0.6)) {
    return clipped.slice(0, sentenceBreak + 1).trim();
  }
  const spaceBreak = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, Math.max(spaceBreak, 1)).trim()}...`;
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

  if (titleTokens.length >= 3 && sharedTitleTokens.length >= Math.min(titleTokens.length, 4)) {
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
  const titleCore = chooseTitleSeed(input, imageTruth, filenameAssessment);
  const styleOccasion = imageTruth.likelyOccasion || detectTheme(`${titleCore} ${input.templateContext || ""}`);
  const benefitCore = `Clear ${productNoun} messaging for ${imageTruth.likelyAudience || "gift-ready"} discovery and merchandising.`;
  const visibleKeywords = unique([
    ...imageTruth.visibleText,
    ...imageTruth.visibleFacts,
    ...(filenameAssessment.classification.startsWith("strong") ? filenameAssessment.usefulTokens : []),
  ]).slice(0, 18);
  const inferredKeywords = unique([
    ...imageTruth.inferredMeaning,
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
    `${semantic.titleCore} brings ${semantic.styleOccasion} style to a ${semantic.productNoun} built for clean, high-intent ${localeProfile.discoveryTermLabel}.`,
    `${semantic.benefitCore} Pair it with the imported product details below for a complete ${localeProfile.leadTone} listing.`,
  ];
}

export function normalizeLeadParagraphs(
  title: string,
  paragraphs: string[],
  semantic: SemanticRecord,
  localeProfile: LocaleProfile = getLocaleProfile()
) {
  const raw = paragraphs.map((paragraph) => cleanSpaces(paragraph)).filter(Boolean);
  const normalized = raw.map((paragraph, index) =>
    index === 0 ? stripTitlePrefix(trimSentence(paragraph, MAX_LEAD_CHARS), title) : trimSentence(paragraph, MAX_LEAD_CHARS)
  );

  const fallback = buildDefaultLead(semantic, localeProfile);
  const merged = [normalized[0] || fallback[0], normalized[1] || fallback[1]];
  const finalParagraphs = merged.map((paragraph) => cleanSpaces(paragraph)).filter(Boolean).slice(0, 2);

  if (
    finalParagraphs.length === 2 &&
    normalizeComparableText(finalParagraphs[0]) === normalizeComparableText(finalParagraphs[1])
  ) {
    finalParagraphs[1] = fallback[1];
  }

  while (finalParagraphs.length < 2) {
    finalParagraphs.push(fallback[finalParagraphs.length]);
  }

  return finalParagraphs;
}

function buildChannelDraft(
  channel: "etsy" | "amazon" | "ebay" | "tiktokShop",
  semantic: SemanticRecord,
  leadParagraphs: string[],
  localeProfile: LocaleProfile
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
      localeProfile
    ),
    discoveryTerms: terms,
  } satisfies ChannelDraft;
}

function buildMarketplaceDrafts(semantic: SemanticRecord, canonicalLead: string[], localeProfile: LocaleProfile) {
  return {
    etsy: buildChannelDraft("etsy", semantic, canonicalLead, localeProfile),
    amazon: buildChannelDraft("amazon", semantic, canonicalLead, localeProfile),
    ebay: buildChannelDraft("ebay", semantic, canonicalLead, localeProfile),
    tiktokShop: buildChannelDraft("tiktokShop", semantic, canonicalLead, localeProfile),
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

  const complianceReasons = evaluateComplianceReasons([
    title,
    ...leadParagraphs,
    ...semantic.visibleKeywords,
    ...semantic.inferredKeywords,
    ...semantic.forbiddenClaims,
  ]);
  if (complianceReasons.length) {
    confidence -= 0.16;
    reasonDetails.push(...complianceReasons);
    complianceFlags.push(...semantic.forbiddenClaims.map((claim) => `Potential unsupported claim: ${claim}`));
  }

  if (!semantic.titleCore || semantic.titleCore.length < 12) {
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

  confidence = clamp(Number(confidence.toFixed(2)), 0, 1);
  const dedupedCompliance = unique(complianceFlags).slice(0, 4);
  const mergedReasonDetails = mergeReasonDetails(reasonDetails);
  const dedupedReasons = reasonFlagsFromDetails(mergedReasonDetails, dedupedCompliance);

  if (confidence < 0.38 || imageTruth.meaningClarity < 0.35) {
    return {
      grade: "red",
      confidence,
      reasonFlags: dedupedReasons.length ? dedupedReasons : ["Image meaning is too unclear for safe listing generation."],
      complianceFlags: dedupedCompliance,
      reasonDetails: mergedReasonDetails.length
        ? mergedReasonDetails
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
    reasonDetails: mergedReasonDetails,
  } satisfies ValidatorResult;
}

function summarizeTemplateContext(templateContext: string) {
  const cleaned = cleanSpaces(templateContext.slice(0, MAX_TEMPLATE_CONTEXT));
  if (!cleaned) return "No template context supplied.";
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanSpaces(sentence))
    .filter(Boolean);
  return (sentences.slice(0, 2).join(" ") || cleaned).slice(0, 340);
}

function parseImageData(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    inlineData: match[2],
  };
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
  localeProfile: LocaleProfile
) {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const title = normalizeTitle(String(obj.title || semantic.titleCore), semantic.titleCore);
  const leadParagraphs = normalizeLeadParagraphs(title, normalizeArray(obj.leadParagraphs), semantic, localeProfile);
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
  localeProfile: LocaleProfile
) {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    etsy: normalizeChannelDraft(obj.etsy, semantic, fallbackLead, localeProfile),
    amazon: normalizeChannelDraft(obj.amazon, semantic, fallbackLead, localeProfile),
    ebay: normalizeChannelDraft(obj.ebay, semantic, fallbackLead, localeProfile),
    tiktokShop: normalizeChannelDraft(obj.tiktokShop, semantic, fallbackLead, localeProfile),
  } satisfies MarketplaceDrafts;
}

function normalizeValidator(input: unknown, fallback: ValidatorResult): ValidatorResult {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const gradeRaw = String(obj.grade || fallback.grade).toLowerCase();
  const grade = gradeRaw === "green" || gradeRaw === "orange" || gradeRaw === "red" ? gradeRaw : fallback.grade;
  const reasonDetails = mergeReasonDetails(normalizeReasonDetails(obj.reasonDetails), fallback.reasonDetails);
  const complianceFlags = normalizeArray(obj.complianceFlags).slice(0, 8);
  const reasonFlags = normalizeArray(obj.reasonFlags).slice(0, 8);
  const effectiveComplianceFlags = complianceFlags.length ? complianceFlags : fallback.complianceFlags;

  return {
    grade,
    confidence: clamp(Number(obj.confidence ?? fallback.confidence) || fallback.confidence, 0, 1),
    reasonFlags: reasonFlags.length ? reasonFlags : reasonFlagsFromDetails(reasonDetails, effectiveComplianceFlags),
    complianceFlags: effectiveComplianceFlags,
    reasonDetails,
  };
}

function buildMasterPrompt(
  input: ListingRequest,
  filenameAssessment: FilenameAssessment,
  normalizedTitleSeed: string,
  retryContext: RetryContext,
  localeProfile: LocaleProfile
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
  const leadParagraphs = normalizeLeadParagraphs(semantic.titleCore, [], semantic, localeProfile);
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
  const image = parseImageData(String(input.imageDataUrl || ""));
  if (!image) return null;

  const normalizedTitleSeed = normalizeTitle(input.title || "", input.fileName || "");
  const filenameAssessmentSeed = assessFilenameRelevance(input.fileName || "", []);
  const prompt = buildMasterPrompt(
    input,
    filenameAssessmentSeed,
    normalizedTitleSeed,
    options.retryContext,
    options.localeProfile
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
                mimeType: image.mimeType,
                data: image.inlineData,
              },
            },
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
    normalizeArray(parsedObj.canonicalLeadParagraphs || parsedObj.leadParagraphs),
    semantic,
    options.localeProfile
  );

  const marketplaceDrafts = normalizeMarketplaceDrafts(
    parsedObj.marketplaceDrafts,
    semantic,
    canonicalLeads,
    options.localeProfile
  );
  const gradedFallback = gradeListing(
    imageTruth,
    semantic,
    filenameAssessment,
    canonicalTitle,
    canonicalLeads,
    marketplaceDrafts.etsy.discoveryTerms
  );
  const validator = normalizeValidator(parsedObj.validator, gradedFallback);
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
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : process.env.GEMINI_API_KEY || "";
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
