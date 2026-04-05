import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  assessFilenameRelevance,
  generateListingResponse,
  gradeListing,
  normalizeLeadParagraphs,
  type SemanticRecord,
} from "../../lib/ai/listing-engine";
import { GOLDEN_CORPUS_FIXTURES } from "./fixtures/golden-corpus";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=";

function createGeminiResponse(payload: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(payload) }],
          },
        },
      ],
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    }
  );
}

function createGeminiPayload(overrides: Record<string, any> = {}) {
  const base = {
    imageTruth: {
      visibleText: ["faith over fear"],
      visibleFacts: ["white lettering on a clean transparent design"],
      inferredMeaning: ["faith-forward", "giftable christian apparel"],
      dominantTheme: "faith-forward",
      likelyAudience: "faith-based buyers",
      likelyOccasion: "daily wear",
      uncertainty: [],
      ocrWeakness: "none",
      meaningClarity: 0.91,
      hasReadableText: true,
    },
    filenameAssessment: {
      classification: "strong_support",
      usefulness: 0.88,
      usefulTokens: ["faith", "fear"],
      ignoredTokens: [],
      conflictSeverity: "none",
      shouldIgnore: false,
      reason: "supports image text",
    },
    semanticRecord: {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clear merch-ready faith message for buyer intent.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith over fear", "faith"],
      inferredKeywords: ["christian shirt", "faith gift"],
      forbiddenClaims: [],
    },
    marketplaceDrafts: {
      etsy: {
        title: "Faith Over Fear Christian Tee Faith Gift",
        leadParagraphs: [
          "Clean faith-forward design for everyday wear and gift-ready discovery.",
          "Pair this opening copy with your imported template details for a complete listing.",
        ],
        discoveryTerms: ["faith over fear", "christian gift", "faith shirt", "religious tee", "daily wear"],
      },
      amazon: {
        title: "Faith Over Fear Christian Tee",
        leadParagraphs: [
          "Faith-forward design for everyday confidence.",
          "Strong buyer intent keyword alignment for marketplace copy.",
        ],
        discoveryTerms: ["faith shirt", "christian tee", "daily wear", "gift shirt", "religious apparel"],
      },
      ebay: {
        title: "Faith Over Fear Tee",
        leadParagraphs: ["Bold readable slogan for fast scanning.", "Gift-ready listing starter copy with factual support."],
        discoveryTerms: ["faith over fear", "faith tee", "christian apparel", "gift idea", "readable slogan"],
      },
      tiktokShop: {
        title: "Faith Over Fear Christian Tee",
        leadParagraphs: [
          "Fast-scroll clarity with visible slogan copy.",
          "Built for clean conversion messaging on short-form storefronts.",
        ],
        discoveryTerms: ["faith shirt", "faith gift", "christian tee", "graphic tee", "daily style"],
      },
    },
    validator: {
      grade: "green",
      confidence: 0.9,
      reasonFlags: [],
      complianceFlags: [],
      reasonDetails: [],
    },
    canonicalTitle: "Faith Over Fear Christian Tee",
    canonicalLeadParagraphs: [
      "Faith-forward graphic styling helps this listing communicate its core message quickly.",
      "Use this as opening persuasion copy, then keep your imported factual template details below.",
    ],
  };

  return {
    ...base,
    ...overrides,
    imageTruth: { ...base.imageTruth, ...(overrides.imageTruth || {}) },
    filenameAssessment: { ...base.filenameAssessment, ...(overrides.filenameAssessment || {}) },
    semanticRecord: { ...base.semanticRecord, ...(overrides.semanticRecord || {}) },
    marketplaceDrafts: {
      etsy: { ...base.marketplaceDrafts.etsy, ...(overrides.marketplaceDrafts?.etsy || {}) },
      amazon: { ...base.marketplaceDrafts.amazon, ...(overrides.marketplaceDrafts?.amazon || {}) },
      ebay: { ...base.marketplaceDrafts.ebay, ...(overrides.marketplaceDrafts?.ebay || {}) },
      tiktokShop: { ...base.marketplaceDrafts.tiktokShop, ...(overrides.marketplaceDrafts?.tiktokShop || {}) },
    },
    validator: { ...base.validator, ...(overrides.validator || {}) },
    canonicalLeadParagraphs: overrides.canonicalLeadParagraphs || base.canonicalLeadParagraphs,
  };
}

function createFetchSequence(responses: Array<Response>) {
  let index = 0;
  const fetchFn: typeof fetch = async () => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next;
  };

  return {
    fetchFn,
    getCallCount: () => index,
  };
}

function readFixtureImageDataUrl(fileName: string) {
  const absolutePath = path.join(process.cwd(), "tests", "ai", "fixtures", "golden-corpus", fileName);
  const imageBuffer = readFileSync(absolutePath);
  return {
    absolutePath,
    base64: imageBuffer.toString("base64"),
    dataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
  };
}

async function run(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`PASS ${name}`);
}

async function main() {
  await run("filename relevance marks generic names as weak", () => {
    const result = assessFilenameRelevance("IMG_1234_final_design.png", ["Blessed"]);
    assert.equal(result.classification, "weak_or_generic");
    assert.equal(result.shouldIgnore, true);
  });
    