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

export type FilenameAssessment = {
  classification: "strong_support" | "partial_support" | "weak_or_generic" | "conflicting";
  usefulness: number;
  usefulTokens: string[];
  ignoredTokens: string[];
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
};

const DEFAULT_MODEL = process.env.GEMINI_LISTING_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TEMPLATE_CONTEXT = 1400;
const MAX_TITLE_CHARS = 120;
const MAX_LEAD_CHARS = 260;

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

export function assessFilenameRelevance(fileName: string, visibleTextHints: string[]) {
  const tokens = toKeywordTokens(fileName);
  const usefulTokens = tokens.filter((token) => !WEAK_FILENAME_TOKENS.has(token) && !/^\d+$/.test(token));
  const ignoredTokens = tokens.filter((token) => !usefulTokens.includes(token));
  const visibleTokens = new Set(visibleTextHints.flatMap((entry) => toKeywordTokens(entry)));
  const overlap = usefulTokens.filter((token) => visibleTokens.has(token));

  if (usefulTokens.length >= 3 && overlap.length >= 1) {
    return {
      classification: "strong_support",
      usefulness: 0.9,
      usefulTokens,
      ignoredTokens,
      reason: "Filename provides specific terms that support visible artwork content.",
    } satisfies FilenameAssessment;
  }

  if (usefulTokens.length >= 1 && overlap.length >= 1) {
    return {
      classification: "partial_support",
      usefulness: 0.68,
      usefulTokens,
      ignoredTokens,
      reason: "Filename offers limited but useful support for the visible artwork.",
    } satisfies FilenameAssessment;
  }

  if (usefulTokens.length >= 2 && overlap.length === 0 && visibleTokens.size > 0) {
    return {
      classification: "conflicting",
      usefulness: 0.25,
      usefulTokens,
      ignoredTokens,
      reason: "Filename tokens conflict with the visible image signal and should be de-prioritized.",
    } satisfies FilenameAssessment;
  }

  return {
    classification: "weak_or_generic",
    usefulness: usefulTokens.length ? 0.42 : 0.15,
    usefulTokens,
    ignoredTokens,
    reason: "Filename is generic, weak, or not trustworthy enough for primary listing logic.",
  } satisfies FilenameAssessment;
}

function buildSemanticRecord(input: ListingRequest, imageTruth: ImageTruthRecord, filenameAssessment: FilenameAssessment) {
  const productNoun = getProductNoun(input.productFamily || "");
  const titleCore = normalizeTitle(input.title || input.fileName || "Product", input.fileName || "");
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

  const forbiddenClaims = inferredKeywords
    .filter((keyword) => /(official|licensed|medical|guaranteed|cure|doctor)/i.test(keyword))
    .slice(0, 6);

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

function buildDefaultLead(semantic: SemanticRecord) {
  return [
    `${semantic.titleCore} brings ${semantic.styleOccasion} style to a ${semantic.productNoun} built for clean, high-intent discovery.`,
    `${semantic.benefitCore} Pair it with the imported product details below for a complete marketplace-ready listing.`,
  ];
}

export function normalizeLeadParagraphs(title: string, paragraphs: string[], semantic: SemanticRecord) {
  const raw = paragraphs.map((paragraph) => cleanSpaces(paragraph)).filter(Boolean);
  const normalized = raw.map((paragraph, index) =>
    index === 0 ? stripTitlePrefix(trimSentence(paragraph, MAX_LEAD_CHARS), title) : trimSentence(paragraph, MAX_LEAD_CHARS)
  );

  const fallback = buildDefaultLead(semantic);
  const merged = [normalized[0] || fallback[0], normalized[1] || fallback[1]];
  const finalParagraphs = merged.map((paragraph) => cleanSpaces(paragraph)).filter(Boolean).slice(0, 2);

  while (finalParagraphs.length < 2) {
    finalParagraphs.push(fallback[finalParagraphs.length]);
  }

  return finalParagraphs;
}

function buildChannelDraft(
  channel: "etsy" | "amazon" | "ebay" | "tiktokShop",
  semantic: SemanticRecord,
  leadParagraphs: string[]
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
    leadParagraphs: normalizeLeadParagraphs(normalizedTitle || semantic.titleCore || "Product", leadParagraphs, semantic),
    discoveryTerms: terms,
  } satisfies ChannelDraft;
}

function buildMarketplaceDrafts(semantic: SemanticRecord, canonicalLead: string[]) {
  return {
    etsy: buildChannelDraft("etsy", semantic, canonicalLead),
    amazon: buildChannelDraft("amazon", semantic, canonicalLead),
    ebay: buildChannelDraft("ebay", semantic, canonicalLead),
    tiktokShop: buildChannelDraft("tiktokShop", semantic, canonicalLead),
  } satisfies MarketplaceDrafts;
}

export function gradeListing(imageTruth: ImageTruthRecord, semantic: SemanticRecord, filenameAssessment: FilenameAssessment) {
  const reasonFlags: string[] = [];
  const complianceFlags: string[] = [];
  let confidence = 0.56;

  confidence += imageTruth.meaningClarity >= 0.8 ? 0.24 : imageTruth.meaningClarity >= 0.6 ? 0.12 : -0.12;
  confidence += imageTruth.hasReadableText ? 0.05 : -0.04;

  if (filenameAssessment.classification === "conflicting") {
    confidence -= 0.08;
    reasonFlags.push("Filename conflicts with visible image signal.");
  } else if (filenameAssessment.classification === "weak_or_generic") {
    reasonFlags.push("Filename provides weak listing support.");
  }

  if (imageTruth.ocrWeakness && !/none|clear/i.test(imageTruth.ocrWeakness)) {
    confidence -= 0.1;
    reasonFlags.push("OCR/text legibility is weak or partial.");
  }

  if (imageTruth.uncertainty.length > 0) {
    confidence -= 0.06;
    reasonFlags.push(...imageTruth.uncertainty.slice(0, 2));
  }

  if (semantic.forbiddenClaims.length) {
    confidence -= 0.16;
    complianceFlags.push(...semantic.forbiddenClaims.map((claim) => `Potential unsupported claim: ${claim}`));
    reasonFlags.push("Potential compliance-sensitive wording detected.");
  }

  if (!semantic.titleCore || semantic.titleCore.length < 12) {
    confidence -= 0.1;
    reasonFlags.push("Generated title core is too weak and needs review.");
  }

  confidence = clamp(Number(confidence.toFixed(2)), 0, 1);
  const dedupedReasons = unique(reasonFlags).slice(0, 6);
  const dedupedCompliance = unique(complianceFlags).slice(0, 4);

  if (confidence < 0.38 || imageTruth.meaningClarity < 0.35) {
    return {
      grade: "red",
      confidence,
      reasonFlags: dedupedReasons.length ? dedupedReasons : ["Image meaning is too unclear for safe listing generation."],
      complianceFlags: dedupedCompliance,
    } satisfies ValidatorResult;
  }

  if (confidence >= 0.78 && dedupedReasons.length === 0 && dedupedCompliance.length === 0) {
    return {
      grade: "green",
      confidence,
      reasonFlags: [],
      complianceFlags: [],
    } satisfies ValidatorResult;
  }

  return {
    grade: "orange",
    confidence,
    reasonFlags: dedupedReasons.length ? dedupedReasons : ["Usable draft detected but manual review is recommended."],
    complianceFlags: dedupedCompliance,
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

function normalizeChannelDraft(input: unknown, semantic: SemanticRecord, fallbackLead: string[]) {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const title = normalizeTitle(String(obj.title || semantic.titleCore), semantic.titleCore);
  const leadParagraphs = normalizeLeadParagraphs(title, normalizeArray(obj.leadParagraphs), semantic);
  const discoveryTerms = unique(normalizeArray(obj.discoveryTerms)).slice(0, 20);

  return {
    title: title || semantic.titleCore || "Product",
    leadParagraphs: leadParagraphs.length ? leadParagraphs : fallbackLead,
    discoveryTerms,
  } satisfies ChannelDraft;
}

function normalizeMarketplaceDrafts(input: unknown, semantic: SemanticRecord, fallbackLead: string[]) {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    etsy: normalizeChannelDraft(obj.etsy, semantic, fallbackLead),
    amazon: normalizeChannelDraft(obj.amazon, semantic, fallbackLead),
    ebay: normalizeChannelDraft(obj.ebay, semantic, fallbackLead),
    tiktokShop: normalizeChannelDraft(obj.tiktokShop, semantic, fallbackLead),
  } satisfies MarketplaceDrafts;
}

function normalizeValidator(input: unknown, fallback: ValidatorResult): ValidatorResult {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const gradeRaw = String(obj.grade || fallback.grade).toLowerCase();
  const grade = gradeRaw === "green" || gradeRaw === "orange" || gradeRaw === "red" ? gradeRaw : fallback.grade;

  return {
    grade,
    confidence: clamp(Number(obj.confidence ?? fallback.confidence) || fallback.confidence, 0, 1),
    reasonFlags: normalizeArray(obj.reasonFlags).slice(0, 8),
    complianceFlags: normalizeArray(obj.complianceFlags).slice(0, 8),
  };
}

function buildMasterPrompt(input: ListingRequest, filenameAssessment: FilenameAssessment, normalizedTitleSeed: string) {
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
    "- Validate relevance, readability, compliance, and review risk.",
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
  ].join("\n");
}

function buildFallbackRecord(input: ListingRequest) {
  const normalizedTitleSeed = normalizeTitle(input.title || "", input.fileName || "");
  const filenameAssessment = assessFilenameRelevance(input.fileName || "", []);
  const imageTruth: ImageTruthRecord = {
    visibleText: [],
    visibleFacts: [],
    inferredMeaning: [detectTheme(`${normalizedTitleSeed} ${input.templateContext || ""}`)],
    dominantTheme: detectTheme(`${normalizedTitleSeed} ${input.templateContext || ""}`),
    likelyAudience: "general audience",
    likelyOccasion: detectTheme(`${normalizedTitleSeed} ${input.templateContext || ""}`),
    uncertainty: ["Local fallback used because Gemini output was unavailable or unparseable."],
    ocrWeakness: "local-fallback-no-multimodal-ocr",
    meaningClarity: normalizedTitleSeed ? 0.58 : 0.34,
    hasReadableText: false,
  };

  const semantic = buildSemanticRecord(input, imageTruth, filenameAssessment);
  const leadParagraphs = normalizeLeadParagraphs(semantic.titleCore, [], semantic);
  const marketplaceDrafts = buildMarketplaceDrafts(semantic, leadParagraphs);
  const validator = gradeListing(imageTruth, semantic, filenameAssessment);
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

async function callGeminiRecord(input: ListingRequest, options: Required<Pick<GenerateOptions, "apiKey" | "model" | "fetchFn">>) {
  const image = parseImageData(String(input.imageDataUrl || ""));
  if (!image) return null;

  const normalizedTitleSeed = normalizeTitle(input.title || "", input.fileName || "");
  const filenameAssessmentSeed = assessFilenameRelevance(input.fileName || "", []);
  const prompt = buildMasterPrompt(input, filenameAssessmentSeed, normalizedTitleSeed);
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
    semantic
  );

  const marketplaceDrafts = normalizeMarketplaceDrafts(parsedObj.marketplaceDrafts, semantic, canonicalLeads);
  const gradedFallback = gradeListing(imageTruth, semantic, filenameAssessment);
  const validator = normalizeValidator(parsedObj.validator, gradedFallback);
  const reasonFlags = validator.reasonFlags.length ? validator.reasonFlags : gradedFallback.reasonFlags;

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

function mapRecordToUiResponse(record: EngineRecord, model: string): ListingUiResponse {
  const leadParagraphs = normalizeLeadParagraphs(record.canonicalTitle, record.canonicalLeadParagraphs, record.semanticRecord);

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

  if (!input?.imageDataUrl) {
    throw new Error("Image data is required.");
  }

  if (apiKey) {
    try {
      const geminiRecord = await callGeminiRecord(input, { fetchFn, apiKey, model });
      if (geminiRecord) {
        return mapRecordToUiResponse(geminiRecord, model);
      }
    } catch {
      // fall through to deterministic fallback
    }
  }

  return mapRecordToUiResponse(buildFallbackRecord(input), model);
}
