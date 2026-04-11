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
const MAX_TITLE_CHARS) 