import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  assessFilenameRelevance,
  generateListingResponse,
  gradeListing,
  normalizeLeadParagraphs,
  type SemanticRecord,
} from "../../lib/ai/listing-engine";
import {
  QUANTUM_DESCRIPTION_AWAITING_TEXT,
  QUANTUM_TITLE_AWAITING_TEXT,
  sanitizeTemplateDescriptionForPrebuffer,
  splitDetailDescriptionForDisplay,
} from "../../app/components/MerchQuantumApp";
import { validateReadyDraftItem } from "../../app/api/providers/batch-create/route";
import { GOLDEN_CORPUS_FIXTURES } from "./fixtures/golden-corpus";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=";

async function createTransparentSvgDataUrl(svgMarkup: string) {
  const buffer = await sharp(Buffer.from(svgMarkup)).png().toBuffer();
  const base64 = buffer.toString("base64");
  return {
    base64,
    dataUrl: `data:image/png;base64,${base64}`,
  };
}

async function readCornerPixel(base64: string) {
  const { data } = await sharp(Buffer.from(base64, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    r: data[0] || 0,
    g: data[1] || 0,
    b: data[2] || 0,
    a: data[3] || 0,
  };
}

function isNearPixel(
  pixel: { r: number; g: number; b: number; a: number },
  target: { r: number; g: number; b: number; a: number },
  tolerance = 8
) {
  return (
    Math.abs(pixel.r - target.r) <= tolerance &&
    Math.abs(pixel.g - target.g) <= tolerance &&
    Math.abs(pixel.b - target.b) <= tolerance &&
    Math.abs(pixel.a - target.a) <= tolerance
  );
}

function getGeminiRequestParts(init?: RequestInit) {
  const requestBody = JSON.parse(String(init?.body || "{}"));
  return (requestBody?.contents?.[0]?.parts || []) as Array<{
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
  }>;
}

function getGeminiInlineImageParts(init?: RequestInit) {
  return getGeminiRequestParts(init)
    .filter((part) => part?.inlineData)
    .map((part) => part.inlineData || {});
}

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
    qc_status: "PASS",
    extracted_text: "FAITH OVER FEAR",
    generated_title: "Faith Over Fear Christian Tee",
    generated_paragraph_1:
      "Faith-based shoppers will love the bold message and clean spiritual design that makes this shirt feel encouraging, wearable, and giftable.",
    generated_paragraph_2:
      "This uplifting Christian shirt keeps the typography easy to read while helping the design connect quickly with buyers searching for meaningful everyday faith apparel.",
    seo_tags: [
      "faith over fear",
      "christian shirt",
      "faith gift",
      "religious tee",
      "scripture apparel",
      "church outfit",
      "uplifting graphic",
      "inspirational shirt",
      "believer gift",
      "gospel message",
      "faith based style",
      "motivational tee",
      "daily wear shirt",
      "christian merch",
      "print on demand faith",
    ],
    generatedTitle: "Faith Over Fear Christian Tee",
    generatedParagraph1:
      "Faith-based shoppers will love the bold message and clean spiritual design that makes this shirt feel encouraging, wearable, and giftable.",
    generatedParagraph2:
      "This uplifting Christian shirt keeps the typography easy to read while helping the design connect quickly with buyers searching for meaningful everyday faith apparel.",
    finalTitle: "Faith Over Fear Christian Tee",
    finalDescription:
      "Faith-forward graphic styling gives this merchandise a clear, uplifting message that stands out fast for shoppers looking for meaningful everyday apparel.\n\nThe clean slogan aesthetic keeps the design giftable, easy to merchandize, and strong for buyers who want visible inspiration with a polished print-ready look.",
    tags: [
      "faith over fear",
      "christian shirt",
      "faith gift",
      "religious tee",
      "scripture apparel",
      "church outfit",
      "uplifting graphic",
      "inspirational shirt",
      "believer gift",
      "gospel message",
      "faith based style",
      "motivational tee",
      "daily wear shirt",
      "christian merch",
      "print on demand faith",
    ],
    canonicalTitle: "Faith Over Fear Christian Tee",
    canonicalLeadParagraphs: [
      "Faith-forward graphic styling helps this listing communicate its core message quickly.",
      "Use this as opening persuasion copy, then keep your imported factual template details below.",
    ],
  };

  const resolvedCanonicalTitle = overrides.canonicalTitle || base.canonicalTitle;
  const resolvedFinalTitle = overrides.finalTitle || overrides.final_title || resolvedCanonicalTitle;
  const resolvedGeneratedTitle =
    overrides.generated_title
    || overrides.generatedTitle
    || overrides.seo_title
    || overrides.seoTitle
    || resolvedFinalTitle;
  const resolvedGeneratedParagraph1 =
    overrides.generated_paragraph_1
    || overrides.generatedParagraph1
    || overrides.seo_paragraph_1
    || overrides.seoParagraph1
    || overrides.canonicalLeadParagraphs?.[0]
    || base.generatedParagraph1;
  const resolvedGeneratedParagraph2 =
    overrides.generated_paragraph_2
    || overrides.generatedParagraph2
    || overrides.seo_paragraph_2
    || overrides.seoParagraph2
    || overrides.canonicalLeadParagraphs?.[1]
    || base.generatedParagraph2;
  const resolvedTags = overrides.seo_tags || overrides.seoTags || overrides.tags || base.tags;
  const hasListingShapeOverride = Boolean(
    overrides.semanticRecord
    || overrides.canonicalTitle
    || overrides.generated_title
    || overrides.generatedTitle
    || overrides.generated_paragraph_1
    || overrides.generatedParagraph1
    || overrides.generated_paragraph_2
    || overrides.generatedParagraph2
    || overrides.finalTitle
    || overrides.final_title
  );
  const resolvedMarketplaceDrafts = overrides.marketplaceDrafts
    ? {
        etsy: { ...base.marketplaceDrafts.etsy, ...(overrides.marketplaceDrafts.etsy || {}) },
        amazon: { ...base.marketplaceDrafts.amazon, ...(overrides.marketplaceDrafts.amazon || {}) },
        ebay: { ...base.marketplaceDrafts.ebay, ...(overrides.marketplaceDrafts.ebay || {}) },
        tiktokShop: { ...base.marketplaceDrafts.tiktokShop, ...(overrides.marketplaceDrafts.tiktokShop || {}) },
      }
    : hasListingShapeOverride
      ? undefined
      : base.marketplaceDrafts;
  const resolvedFinalDescription =
    overrides.finalDescription
    || overrides.final_description
    || (hasListingShapeOverride
      ? `${resolvedGeneratedParagraph1}\n\n${resolvedGeneratedParagraph2}`
      : base.finalDescription);
  const resolvedQcStatus =
    typeof overrides.qc_status === "string"
      ? String(overrides.qc_status).toUpperCase() === "FAIL"
        ? "FAIL"
        : "PASS"
      : typeof overrides.qcStatus === "string"
        ? String(overrides.qcStatus).toUpperCase() === "FAIL"
          ? "FAIL"
          : "PASS"
        : typeof overrides.qc_approved === "boolean"
          ? overrides.qc_approved
            ? "PASS"
            : "FAIL"
          : typeof overrides.qcApproved === "boolean"
            ? overrides.qcApproved
              ? "PASS"
              : "FAIL"
            : "PASS";
  const resolvedExtractedText =
    overrides.extracted_text
    || overrides.extractedText
    || (overrides.imageTruth?.visibleText || base.imageTruth.visibleText).join("\n");

  return {
    ...base,
    ...overrides,
    imageTruth: { ...base.imageTruth, ...(overrides.imageTruth || {}) },
    filenameAssessment: { ...base.filenameAssessment, ...(overrides.filenameAssessment || {}) },
    semanticRecord: { ...base.semanticRecord, ...(overrides.semanticRecord || {}) },
    marketplaceDrafts: resolvedMarketplaceDrafts,
    validator: { ...base.validator, ...(overrides.validator || {}) },
    qc_status: resolvedQcStatus,
    extracted_text: resolvedExtractedText,
    generated_title: resolvedGeneratedTitle,
    generated_paragraph_1: resolvedGeneratedParagraph1,
    generated_paragraph_2: resolvedGeneratedParagraph2,
    seo_title: resolvedGeneratedTitle,
    seo_paragraph_1: resolvedGeneratedParagraph1,
    seo_paragraph_2: resolvedGeneratedParagraph2,
    seo_tags: resolvedTags,
    generatedTitle: resolvedGeneratedTitle,
    generatedParagraph1: resolvedGeneratedParagraph1,
    generatedParagraph2: resolvedGeneratedParagraph2,
    tags: resolvedTags,
    finalTitle: resolvedFinalTitle,
    finalDescription: resolvedFinalDescription,
    canonicalLeadParagraphs: overrides.canonicalLeadParagraphs || base.canonicalLeadParagraphs,
    canonicalTitle: resolvedCanonicalTitle,
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

  await run("filename relevance marks conflicting clues with severity", () => {
    const result = assessFilenameRelevance("cat_mom_gift_meow_love.png", ["jesus saves", "faith over fear"]);
    assert.equal(result.classification, "conflicting");
    assert.equal(result.conflictSeverity, "high");
    assert.equal(result.shouldIgnore, true);
  });

  await run("filename relevance gives soft support when image text is weak", () => {
    const result = assessFilenameRelevance("mountain_adventure_outdoors_hiking.png", []);
    assert.equal(result.classification, "partial_support");
    assert.equal(result.shouldIgnore, false);
  });

  await run("lead paragraph normalization removes title duplication", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clean discovery copy for faith-forward shoppers.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith", "fear"],
      inferredKeywords: ["christian gift"],
      forbiddenClaims: [],
    };

    const leads = normalizeLeadParagraphs(
      "Faith Over Fear Christian Tee",
      [
        "Faith Over Fear Christian Tee is made for everyday confidence and bold belief.",
        "Faith Over Fear Christian Tee is made for everyday confidence and bold belief.",
      ],
      semantic
    );

    assert.equal(leads.length, 2);
    assert.equal(leads[0].toLowerCase().startsWith("faith over fear christian tee"), false);
    assert.notEqual(leads[0].toLowerCase(), leads[1].toLowerCase());
  });

  await run("lead paragraph normalization preserves complete sentence endings without lazy ellipses", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clean discovery copy for faith-forward shoppers.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith", "fear"],
      inferredKeywords: ["christian gift"],
      forbiddenClaims: [],
    };

    const leads = normalizeLeadParagraphs(
      "Faith Over Fear Christian Tee",
      [
        "Faith Over Fear Christian Tee delivers a bold message of courage and conviction for believers who want their wardrobe to reflect everyday confidence, trust, and resilient hope in a design that stays readable at a glance even when the listing image is viewed quickly on mobile devices.",
        "Crafted for comfort and style, this heavyweight garment-dyed tee feels ready for repeat wear, gifting moments, church events, weekend errands, and everyday casual outfits while still keeping the design message front and center for shoppers who care about both softness and substance.",
      ],
      semantic,
      undefined,
      "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel."
    );

    assert.equal(leads.length, 2);
    for (const lead of leads) {
      assert.equal(/(?:\.\.\.|…)\s*$/.test(lead), false);
      assert.equal(/[.!?]["')\]]*$/.test(lead), true);
      assert.equal(lead.length <= 260, true);
    }
  });

  await run("lead paragraph normalization replaces generic first paragraph with a more specific buyer-facing opener", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clean discovery copy for faith-forward shoppers.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith over fear", "faith"],
      inferredKeywords: ["christian gift"],
      forbiddenClaims: [],
    };

    const leads = normalizeLeadParagraphs(
      "Faith Over Fear Christian Tee",
      [
        "Crafted for comfort and style, this tee is perfect for anyone seeking inspiration or looking to share a meaningful statement.",
        "This versatile addition to your casual wardrobe also makes a thoughtful gift for a loved one.",
      ],
      semantic,
      undefined,
      "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel."
    );

    assert.equal(/crafted for comfort and style/i.test(leads[0]), false);
    assert.equal(/thoughtful gift|versatile addition|casual wardrobe/i.test(leads[0]), false);
    assert.equal(/faith|message|garment-dyed|ring-spun|everyday/i.test(leads[0]), true);
  });

  await run("lead paragraph normalization replaces generic trailing filler with a complete design-aware sentence", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Retro Peace Sign Graphic Tee",
      benefitCore: "Specific retro artwork copy for vintage-style buyers.",
      likelyAudience: "retro art shoppers",
      styleOccasion: "retro hippie",
      visibleKeywords: ["peace sign", "retro"],
      inferredKeywords: ["hippie shirt", "festival style"],
      forbiddenClaims: [],
    };

    const leads = normalizeLeadParagraphs(
      "Retro Peace Sign Graphic Tee",
      [
        "The retro peace sign graphic gives this tee a laid-back vintage mood that reads quickly at a glance.",
        "Ideal for casual outings, music festivals, or simply...",
      ],
      semantic,
      undefined,
      "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel."
    );

    assert.equal(/music festivals|or simply/i.test(leads[1]), false);
    assert.equal(/[.!?]["')\]]*$/.test(leads[1]), true);
    assert.equal(/peace|retro|hippie|artwork|design/i.test(leads[1]), true);
  });

  await run("template pre-buffer sanitization strips themed fluff and preserves only static provider specs", () => {
    const sanitized = sanitizeTemplateDescriptionForPrebuffer(
      [
        "Vintage faith boutique favorite — Unisex Heavy Cotton Tee with uplifting Christian gift angle.",
        "",
        "Product features",
        "- 100% ring-spun cotton",
        "- Relaxed fit with double-needle stitching",
        "",
        "Care instructions",
        "- Machine wash cold",
        "- Tumble dry low",
      ].join("\n"),
      "Faith Over Fear Christian Tee"
    );

    assert.equal(/boutique favorite|uplifting christian gift angle/i.test(sanitized), false);
    assert.equal(/Product features/i.test(sanitized), true);
    assert.equal(/100% ring-spun cotton/i.test(sanitized), true);
    assert.equal(/Relaxed fit with double-needle stitching/i.test(sanitized), true);
    assert.equal(/Care instructions/i.test(sanitized), true);
    assert.equal(/Machine wash cold/i.test(sanitized), true);
  });

  await run("template pre-buffer awaiting copy stays on the exact branded wording", () => {
    assert.equal(QUANTUM_TITLE_AWAITING_TEXT, "Awaiting Quantum AI title...");
    assert.equal(QUANTUM_DESCRIPTION_AWAITING_TEXT, "Awaiting Quantum AI description...");
  });

  await run("detail description display keeps buyer copy above the preserved provider spec block", () => {
    const templateSpecBlock = sanitizeTemplateDescriptionForPrebuffer(
      [
        "Vintage faith boutique favorite — Unisex Heavy Cotton Tee with uplifting Christian gift angle.",
        "",
        "Product features",
        "- 100% ring-spun cotton",
        "- Relaxed fit with double-needle stitching",
        "",
        "Care instructions",
        "- Machine wash cold",
      ].join("\n"),
      "Unisex Heavy Cotton Tee"
    );

    const detailSections = splitDetailDescriptionForDisplay(
      templateSpecBlock,
      [
        "This faith-forward graphic speaks to shoppers who want an encouraging message that feels easy to wear every day.",
        "The clean typography and balanced layout make it simple to style with denim, layers, and casual weekend outfits.",
      ],
      ""
    );

    assert.equal(
      detailSections.buyerFacingDescription,
      [
        "This faith-forward graphic speaks to shoppers who want an encouraging message that feels easy to wear every day.",
        "The clean typography and balanced layout make it simple to style with denim, layers, and casual weekend outfits.",
      ].join("\n\n")
    );
    assert.equal(detailSections.templateSpecBlock, templateSpecBlock);
    assert.equal(/boutique favorite/i.test(detailSections.templateSpecBlock), false);
  });

  await run("validator grades green for clear records and red for unclear or repetitive records", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clear discovery copy for buyer intent.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith"],
      inferredKeywords: ["christian"],
      forbiddenClaims: [],
    };

    const green = gradeListing(
      {
        visibleText: ["faith over fear"],
        visibleFacts: ["white text on black design"],
        inferredMeaning: ["faith-forward"],
        dominantTheme: "faith-forward",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "daily wear",
        uncertainty: [],
        ocrWeakness: "none",
        meaningClarity: 0.92,
        hasReadableText: true,
      },
      semantic,
      {
        classification: "strong_support",
        usefulness: 0.9,
        usefulTokens: ["faith", "fear"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "supportive filename",
      },
      semantic.titleCore,
      [
        "Clean faith-forward styling for everyday wear and buyer clarity.",
        "Gift-ready positioning and readable messaging support marketplace discovery.",
      ],
      ["faith shirt", "christian tee", "gift idea", "daily wear", "readable slogan"]
    );
    assert.equal(green.grade, "green");
    assert.equal(green.reasonDetails.length, 0);

    const red = gradeListing(
      {
        visibleText: [],
        visibleFacts: [],
        inferredMeaning: [],
        dominantTheme: "unknown",
        likelyAudience: "unknown",
        likelyOccasion: "unknown",
        uncertainty: ["meaning unclear"],
        ocrWeakness: "weak contrast",
        meaningClarity: 0.2,
        hasReadableText: false,
      },
      {
        ...semantic,
        titleCore: "Product",
      },
      {
        classification: "weak_or_generic",
        usefulness: 0.1,
        usefulTokens: [],
        ignoredTokens: ["img", "final"],
        conflictSeverity: "none",
        shouldIgnore: true,
        reason: "weak filename",
      },
      "Product",
      ["Product product product.", "Product product product."],
      ["product"]
    );
    assert.equal(red.grade, "red");
    assert.ok(red.reasonFlags.some((flag) => flag.toLowerCase().includes("unclear")));
  });

  await run("validator downgrades clipped lead paragraphs from green", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clear discovery copy for buyer intent.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith"],
      inferredKeywords: ["christian"],
      forbiddenClaims: [],
    };

    const clipped = gradeListing(
      {
        visibleText: ["faith over fear"],
        visibleFacts: ["white text on black design"],
        inferredMeaning: ["faith-forward"],
        dominantTheme: "faith-forward",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "daily wear",
        uncertainty: [],
        ocrWeakness: "none",
        meaningClarity: 0.92,
        hasReadableText: true,
      },
      semantic,
      {
        classification: "strong_support",
        usefulness: 0.9,
        usefulTokens: ["faith", "fear"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "supportive filename",
      },
      semantic.titleCore,
      [
        "Clean faith-forward styling for everyday wear and buyer clarity...",
        "Gift-ready positioning and readable messaging support marketplace discovery.",
      ],
      ["faith shirt", "christian tee", "gift idea", "daily wear", "readable slogan"]
    );

    assert.equal(clipped.grade, "red");
    assert.equal(
      clipped.reasonFlags.some((flag) => flag.toLowerCase().includes("appears clipped")),
      true
    );
  });

  await run("validator keeps clearly readable designs green when only soft OCR and symbolic uncertainty remain", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Faith Over Fear Christian Tee",
      benefitCore: "Clear discovery copy for buyer intent.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "faith-forward",
      visibleKeywords: ["faith over fear", "faith"],
      inferredKeywords: ["christian"],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: ["faith over fear"],
        visibleFacts: ["clean readable slogan on transparent artwork"],
        inferredMeaning: ["faith-forward encouragement"],
        dominantTheme: "faith-forward",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "daily wear",
        uncertainty: ["The specific symbolic meaning is open to interpretation."],
        ocrWeakness: "weak contrast",
        meaningClarity: 0.9,
        hasReadableText: true,
      },
      semantic,
      {
        classification: "strong_support",
        usefulness: 0.9,
        usefulTokens: ["faith", "fear"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "supportive filename",
      },
      semantic.titleCore,
      [
        "The \"Faith Over Fear\" message gives this graphic tee a clear faith-forward angle that reads quickly at a glance.",
        "It feels wearable, giftable, and straightforward for buyers who want an encouraging design without extra filler.",
      ],
      ["faith shirt", "christian tee", "encouraging gift", "daily wear", "readable slogan"]
    );

    assert.equal(result.grade, "green");
    assert.equal(result.reasonFlags.length, 0);
  });

  await run("validator keeps clearly interpretable symbolic designs ready when only soft ambiguity remains", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Classic Peace Sign Retro Hippie T-Shirt",
      benefitCore: "Readable retro peace design for laid-back buyers.",
      likelyAudience: "retro lifestyle shoppers",
      styleOccasion: "retro hippie",
      visibleKeywords: ["peace sign", "retro"],
      inferredKeywords: ["hippie shirt", "festival tee"],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: [],
        visibleFacts: ["clear retro peace sign artwork on transparent background"],
        inferredMeaning: ["peace-forward retro mood", "laid-back hippie style"],
        dominantTheme: "retro peace",
        likelyAudience: "retro lifestyle shoppers",
        likelyOccasion: "casual wear",
        uncertainty: ["The exact symbolic meaning is open to interpretation."],
        ocrWeakness: "none",
        meaningClarity: 0.9,
        hasReadableText: false,
      },
      semantic,
      {
        classification: "partial_support",
        usefulness: 0.56,
        usefulTokens: ["peace", "retro", "hippie"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "filename supports the visible design theme",
      },
      semantic.titleCore,
      [
        "The retro peace sign artwork gives this graphic tee a clear laid-back vibe that reads quickly even without text.",
        "It feels easy to wear for festival weekends, casual days, and shoppers who want a recognizable vintage-inspired symbol.",
      ],
      ["peace sign shirt", "retro hippie tee", "festival graphic", "vintage peace", "casual retro style"]
    );

    assert.equal(result.grade, "green");
    assert.equal(result.reasonFlags.length, 0);
  });

  await run("validator keeps dark monochrome transparent logo artwork Good when image signal is still recoverable", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Classic Arcade Logo Minimalist Gamer Shirt",
      benefitCore: "Readable minimalist arcade logo styling for retro gaming buyers.",
      likelyAudience: "retro gaming fans",
      styleOccasion: "minimal gamer",
      visibleKeywords: ["arcade logo", "gamer"],
      inferredKeywords: ["retro gaming shirt", "minimalist gamer tee"],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: [],
        visibleFacts: ["dark monochrome arcade-style logo on transparent background"],
        inferredMeaning: ["retro gamer identity", "minimal arcade brand look"],
        dominantTheme: "retro arcade",
        likelyAudience: "retro gaming fans",
        likelyOccasion: "casual wear",
        uncertainty: ["Small interior logo details remain stylized rather than fully literal."],
        ocrWeakness: "low contrast on the untouched transparent render",
        meaningClarity: 0.33,
        hasReadableText: false,
      },
      semantic,
      {
        classification: "partial_support",
        usefulness: 0.58,
        usefulTokens: ["arcade", "logo", "gamer"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "filename supports the visible logo direction",
      },
      semantic.titleCore,
      [
        "The monochrome arcade logo keeps the design clean and recognizable for buyers who want a simple retro gaming look.",
        "It reads as a usable gamer tee even when the smallest interior details stay stylized instead of perfectly literal.",
      ],
      ["arcade logo shirt", "retro gamer tee", "minimal gamer shirt", "arcade graphic tee", "gaming logo shirt"]
    );

    assert.equal(result.grade, "green");
    assert.equal(result.reasonFlags.some((flag) => flag.toLowerCase().includes("stylized")), true);
    assert.equal(result.reasonFlags.some((flag) => flag.toLowerCase().includes("unclear")), false);
  });

  await run("validator keeps decorative faith-text transparent artwork Good when the message is still recoverable", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Jesus I Believe In You Christian Faith Shirt",
      benefitCore: "Decorative faith-led message for devotional apparel buyers.",
      likelyAudience: "christian faith shoppers",
      styleOccasion: "devotional",
      visibleKeywords: ["jesus i believe in you", "faith"],
      inferredKeywords: ["christian faith shirt", "devotional tee"],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: ["jesus i believe in you"],
        visibleFacts: ["decorative badge-style faith lettering on transparent artwork"],
        inferredMeaning: ["devotional christian encouragement"],
        dominantTheme: "christian faith",
        likelyAudience: "christian faith shoppers",
        likelyOccasion: "daily devotion",
        uncertainty: ["Decorative flourishes soften a few letter edges in the raw transparent view."],
        ocrWeakness: "partial decorative lettering with low contrast in the untouched transparent render",
        meaningClarity: 0.34,
        hasReadableText: true,
      },
      semantic,
      {
        classification: "strong_support",
        usefulness: 0.8,
        usefulTokens: ["jesus", "believe", "faith"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "filename supports the visible message",
      },
      semantic.titleCore,
      [
        "The Jesus I Believe In You message comes through clearly enough for buyers who want a visible faith-centered design.",
        "It stays usable as a Good listing even when decorative badge details make the lettering less than perfect in the raw scan.",
      ],
      ["jesus faith shirt", "christian devotional tee", "believe in you shirt", "faith graphic tee", "christian encouragement shirt"]
    );

    assert.equal(result.grade, "green");
    assert.equal(result.reasonFlags.some((flag) => flag.toLowerCase().includes("decorative")), true);
    assert.equal(result.reasonFlags.some((flag) => flag.toLowerCase().includes("image meaning is too unclear")), false);
  });

  await run("validator keeps dense line-art with readable internal text Good when the core message survives", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Discover Decide Defend 1 Peter 3 15 Christian Scripture Tee",
      benefitCore: "Scripture-forward message supported by bold symbolic line art.",
      likelyAudience: "faith-based buyers",
      styleOccasion: "scripture-centered",
      visibleKeywords: ["discover decide defend", "1 peter 3 15"],
      inferredKeywords: ["scripture shirt", "christian fingerprint tee"],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: ["discover decide defend", "1 peter 3 15"],
        visibleFacts: ["dense fingerprint line art with readable scripture-centered text inside the shape"],
        inferredMeaning: ["apologetics-oriented christian message"],
        dominantTheme: "scripture-centered",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "church wear",
        uncertainty: ["Outer fingerprint lines add noise around the text, but the core wording remains recoverable."],
        ocrWeakness: "partial OCR around dense line-art noise",
        meaningClarity: 0.31,
        hasReadableText: true,
      },
      semantic,
      {
        classification: "partial_support",
        usefulness: 0.7,
        usefulTokens: ["discover", "decide", "defend", "peter", "faith"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "filename supports the visible scripture message",
      },
      semantic.titleCore,
      [
        "The Discover Decide Defend message still reads through the fingerprint line art well enough to anchor the design for buyers.",
        "It still belongs in the Good path because the core scripture-driven wording is meaningfully recoverable.",
      ],
      ["discover decide defend shirt", "1 peter 3 15 tee", "christian scripture shirt", "faith fingerprint shirt", "apologetics tee"]
    );

    assert.equal(result.grade, "green");
    assert.equal(result.reasonFlags.some((flag) => flag.toLowerCase().includes("fingerprint")), true);
    assert.equal(result.reasonFlags.some((flag) => flag.toLowerCase().includes("too unclear")), false);
  });

  await run("validator still preserves legitimate failed cases for truly unreadable transparent artwork", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Graphic Tee",
      benefitCore: "Generic placeholder copy.",
      likelyAudience: "unknown",
      styleOccasion: "unknown",
      visibleKeywords: [],
      inferredKeywords: [],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: [],
        visibleFacts: [],
        inferredMeaning: [],
        dominantTheme: "unknown",
        likelyAudience: "unknown",
        likelyOccasion: "unknown",
        uncertainty: ["Image meaning is too unclear for safe listing generation."],
        ocrWeakness: "unreadable low-contrast transparent artwork",
        meaningClarity: 0.18,
        hasReadableText: false,
      },
      semantic,
      {
        classification: "weak_or_generic",
        usefulness: 0.05,
        usefulTokens: [],
        ignoredTokens: ["img", "transparent"],
        conflictSeverity: "none",
        shouldIgnore: true,
        reason: "weak filename",
      },
      semantic.titleCore,
      ["Graphic tee.", "Graphic tee."],
      ["graphic tee"]
    );

    assert.equal(result.grade, "red");
  });

  await run("transparent artwork uses a derived high-contrast analysis image while preserving the untouched upload", async () => {
    const fixture = GOLDEN_CORPUS_FIXTURES.find((entry) => entry.name === "transparent png weak contrast");
    assert.ok(fixture);

    const image = readFixtureImageDataUrl(fixture.imageFile);
    let capturedPrompt = "";
    let capturedImages: Array<{ mimeType?: string; data?: string }> = [];

    const response = await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: fixture.request.fileName,
        title: fixture.request.title,
        productFamily: fixture.request.productFamily,
        templateContext: fixture.request.templateContext,
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          const parts = getGeminiRequestParts(init);
          capturedPrompt = String(parts[0]?.text || "");
          capturedImages = getGeminiInlineImageParts(init);

          return createGeminiResponse(createGeminiPayload(fixture.payloadOverrides));
        },
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(capturedImages.length >= 4, true);
    assert.equal(capturedImages.every((part) => part.mimeType === "image/png"), true);
    assert.equal(capturedImages.some((part) => part.data === image.base64), true);
    assert.equal(capturedImages.filter((part) => part.data !== image.base64).length >= 3, true);
    assert.equal(/temporary high-contrast analysis render/i.test(capturedPrompt), true);
    assert.equal(/dark and light garment-neutral backgrounds/i.test(capturedPrompt), true);
    assert.equal(/cropped close view around the visible artwork bounds/i.test(capturedPrompt), true);
    assert.equal(/untouched original transparent upload/i.test(capturedPrompt), true);
  });

  await run("dense transparent line-art adds a text-prioritized helper render for OCR-oriented grounding", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
        <rect width="1200" height="1200" fill="transparent"/>
        <g fill="none" stroke="#000000" stroke-width="18" stroke-linecap="round">
          <path d="M280 220 C440 180 760 180 920 220" />
          <path d="M250 320 C430 270 770 270 950 320" />
          <path d="M220 430 C420 370 780 370 980 430" />
          <path d="M200 550 C410 480 790 480 1000 550" />
          <path d="M220 670 C420 730 780 730 980 670" />
          <path d="M250 780 C430 830 770 830 950 780" />
        </g>
        <text x="205" y="580" font-size="100" font-family="Arial, sans-serif" font-weight="700" fill="#000000">DISCOVER</text>
        <text x="310" y="690" font-size="92" font-family="Arial, sans-serif" font-weight="700" fill="#000000">DECIDE</text>
        <text x="330" y="790" font-size="92" font-family="Arial, sans-serif" font-weight="700" fill="#000000">DEFEND</text>
      </svg>
    `);
    let capturedPrompt = "";
    let capturedImages: Array<{ mimeType?: string; data?: string }> = [];

    await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: "discover-decide-defend-scripture.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          const parts = getGeminiRequestParts(init);
          capturedPrompt = String(parts[0]?.text || "");
          capturedImages = getGeminiInlineImageParts(init);
          return createGeminiResponse(createGeminiPayload());
        },
      }
    );

    assert.equal(/single-ink text-prioritized helper render/i.test(capturedPrompt), true);
    assert.equal(capturedImages.length >= 5, true);
    assert.equal(capturedImages.some((part) => part.data === image.base64), true);
  });

  await run("transparent white artwork uses a black-backed derived analysis image while preserving the untouched upload", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
        <rect width="1200" height="1200" fill="transparent"/>
        <text x="140" y="640" font-size="260" font-family="Arial, sans-serif" font-weight="700" fill="#FFFFFF">BE KIND</text>
      </svg>
    `);
    let capturedImages: Array<{ mimeType?: string; data?: string }> = [];

    await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: "IMG_0001_final.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          capturedImages = getGeminiInlineImageParts(init);
          return createGeminiResponse(
            createGeminiPayload({
              canonicalTitle: "Be Kind Minimal Graphic Tee",
              canonicalLeadParagraphs: [
                "The visible be kind message keeps the design easy to understand for buyers who want a clean encouragement graphic.",
                "It works as a simple everyday tee for shoppers who prefer readable artwork over filler-heavy copy.",
              ],
            })
          );
        },
      }
    );

    assert.equal(capturedImages.length >= 4, true);
    assert.equal(capturedImages.some((part) => part.data === image.base64), true);

    const derivedImages = capturedImages.filter((part) => part.data && part.data !== image.base64);
    assert.equal(derivedImages.length >= 3, true);

    const derivedPixels = await Promise.all(derivedImages.map((part) => readCornerPixel(String(part.data || ""))));
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 26, g: 26, b: 26, a: 255 })), true);
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 245, g: 245, b: 245, a: 255 })), true);
  });

  await run("transparent black artwork uses a white-backed derived analysis image while preserving the untouched upload", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
        <rect width="1200" height="1200" fill="transparent"/>
        <text x="160" y="640" font-size="260" font-family="Arial, sans-serif" font-weight="700" fill="#000000">STAY WILD</text>
      </svg>
    `);
    let capturedImages: Array<{ mimeType?: string; data?: string }> = [];

    await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: "IMG_0002_final.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          capturedImages = getGeminiInlineImageParts(init);
          return createGeminiResponse(
            createGeminiPayload({
              canonicalTitle: "Stay Wild Outdoor Graphic Tee",
              canonicalLeadParagraphs: [
                "The visible stay wild message gives the design a clear outdoor tone that reads quickly in search results.",
                "It stays buyer-friendly without leaning on generic template filler or weak filename fragments.",
              ],
            })
          );
        },
      }
    );

    assert.equal(capturedImages.length >= 4, true);
    assert.equal(capturedImages.some((part) => part.data === image.base64), true);

    const derivedImages = capturedImages.filter((part) => part.data && part.data !== image.base64);
    assert.equal(derivedImages.length >= 3, true);

    const derivedPixels = await Promise.all(derivedImages.map((part) => readCornerPixel(String(part.data || ""))));
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 245, g: 245, b: 245, a: 255 })), true);
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 26, g: 26, b: 26, a: 255 })), true);
  });

  await run("mixed transparent artwork adds an opposite-contrast helper render while preserving the untouched upload", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
        <rect width="1200" height="1200" fill="transparent"/>
        <text x="140" y="420" font-size="250" font-family="Arial, sans-serif" font-weight="700" fill="#FFFFFF">HIGH</text>
        <text x="140" y="780" font-size="250" font-family="Arial, sans-serif" font-weight="700" fill="#000000">LOW</text>
      </svg>
    `);
    let capturedPrompt = "";
    let capturedImages: Array<{ mimeType?: string; data?: string }> = [];

    await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: "mixed_signal_artwork.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          const parts = getGeminiRequestParts(init);
          capturedPrompt = String(parts[0]?.text || "");
          capturedImages = getGeminiInlineImageParts(init);
          return createGeminiResponse(
            createGeminiPayload({
              canonicalTitle: "High Low Contrast Graphic Tee",
              canonicalLeadParagraphs: [
                "The mixed light and dark artwork stays readable once both contrast views are considered as the same design.",
                "It keeps the opening copy image-led and finishes with complete sentences for buyers.",
              ],
            })
          );
        },
      }
    );

    assert.equal(/dark and light garment-neutral backgrounds/i.test(capturedPrompt), true);
    assert.equal(/neutral-gray garment-neutral helper view/i.test(capturedPrompt), true);
    assert.equal(/cropped close view around the visible artwork bounds/i.test(capturedPrompt), true);
    assert.equal(capturedImages.length >= 5, true);
    assert.equal(capturedImages.some((part) => part.data === image.base64), true);

    const derivedImages = capturedImages.filter((part) => part.data && part.data !== image.base64);
    assert.equal(derivedImages.length >= 4, true);

    const derivedPixels = await Promise.all(derivedImages.map((part) => readCornerPixel(String(part.data || ""))));
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 26, g: 26, b: 26, a: 255 })), true);
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 245, g: 245, b: 245, a: 255 })), true);
    assert.equal(derivedPixels.some((pixel) => isNearPixel(pixel, { r: 229, g: 229, b: 229, a: 255 })), true);
  });

  await run("small opaque artwork gets an upscaled helper-render bundle while preserving the untouched upload", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
        <rect width="180" height="180" fill="#F5F5F5"/>
        <text x="20" y="102" font-size="42" font-family="Arial, sans-serif" font-weight="700" fill="#111111">GO</text>
      </svg>
    `);
    let capturedPrompt = "";
    let capturedImages: Array<{ mimeType?: string; data?: string }> = [];

    await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: "small-opaque-go.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          const parts = getGeminiRequestParts(init);
          capturedPrompt = String(parts[0]?.text || "");
          capturedImages = getGeminiInlineImageParts(init);
          return createGeminiResponse(createGeminiPayload());
        },
      }
    );

    assert.equal(/temporary upscaled analysis render/i.test(capturedPrompt), true);
    assert.equal(capturedImages.length >= 2, true);
    assert.equal(capturedImages.some((part) => part.data === image.base64), true);
    assert.equal(capturedImages.some((part) => part.data && part.data !== image.base64), true);
  });

  await run("OCR-heavy transparent artwork escalates to the stronger Gemini model route", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="520" viewBox="0 0 1600 520">
        <rect width="1600" height="520" fill="transparent"/>
        <text x="80" y="250" font-size="148" font-family="Arial, sans-serif" font-weight="700" fill="#111111">MERCY OVER FEAR</text>
        <text x="140" y="390" font-size="110" font-family="Arial, sans-serif" font-weight="700" fill="#111111">GRACE WINS DAILY</text>
      </svg>
    `);
    let capturedUrl = "";

    const response = await generateListingResponse(
      {
        imageDataUrl: image.dataUrl,
        fileName: "mercy-over-fear-transparent-typography.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-fast-test",
        ocrModel: "gemini-ocr-test",
        fetchFn: async (url) => {
          capturedUrl = String(url || "");
          return createGeminiResponse(createGeminiPayload());
        },
      }
    );

    assert.equal(/models\/gemini-ocr-test:generateContent/i.test(capturedUrl), true);
    assert.equal(response.model, "gemini-ocr-test");
  });

  await run("OCR-heavy transparent artwork falls back to Gemini Pro when no OCR override is configured", async () => {
    const image = await createTransparentSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="520" viewBox="0 0 1600 520">
        <rect width="1600" height="520" fill="transparent"/>
        <text x="80" y="250" font-size="148" font-family="Arial, sans-serif" font-weight="700" fill="#111111">MERCY OVER FEAR</text>
        <text x="140" y="390" font-size="110" font-family="Arial, sans-serif" font-weight="700" fill="#111111">GRACE WINS DAILY</text>
      </svg>
    `);
    let capturedUrl = "";
    const previousOcrModel = process.env.GEMINI_LISTING_OCR_MODEL;
    const previousStrongModel = process.env.GEMINI_LISTING_STRONG_MODEL;
    const previousLegacyOcrModel = process.env.GEMINI_LISTING_MODEL_OCR;

    delete process.env.GEMINI_LISTING_OCR_MODEL;
    delete process.env.GEMINI_LISTING_STRONG_MODEL;
    delete process.env.GEMINI_LISTING_MODEL_OCR;

    try {
      const response = await generateListingResponse(
        {
          imageDataUrl: image.dataUrl,
          fileName: "mercy-over-fear-transparent-typography.png",
          title: "",
          productFamily: "t-shirt",
        },
        {
          apiKey: "test-key",
          model: "gemini-fast-test",
          fetchFn: async (url) => {
            capturedUrl = String(url || "");
            return createGeminiResponse(createGeminiPayload());
          },
        }
      );

      assert.equal(/models\/gemini-2\.5-pro:generateContent/i.test(capturedUrl), true);
      assert.equal(response.model, "gemini-2.5-pro");
    } finally {
      if (typeof previousOcrModel === "string") {
        process.env.GEMINI_LISTING_OCR_MODEL = previousOcrModel;
      } else {
        delete process.env.GEMINI_LISTING_OCR_MODEL;
      }

      if (typeof previousStrongModel === "string") {
        process.env.GEMINI_LISTING_STRONG_MODEL = previousStrongModel;
      } else {
        delete process.env.GEMINI_LISTING_STRONG_MODEL;
      }

      if (typeof previousLegacyOcrModel === "string") {
        process.env.GEMINI_LISTING_MODEL_OCR = previousLegacyOcrModel;
      } else {
        delete process.env.GEMINI_LISTING_MODEL_OCR;
      }
    }
  });

  await run("non-OCR artwork stays on the default Gemini model route", async () => {
    let capturedUrl = "";

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "simple-badge.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-fast-test",
        ocrModel: "gemini-ocr-test",
        fetchFn: async (url) => {
          capturedUrl = String(url || "");
          return createGeminiResponse(createGeminiPayload());
        },
      }
    );

    assert.equal(/models\/gemini-fast-test:generateContent/i.test(capturedUrl), true);
    assert.equal(response.model, "gemini-fast-test");
  });

  await run("Gemini prompt keeps filename as support-only context when no explicit title is supplied", async () => {
    let capturedPrompt = "";

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "Classic Peace Sign Retro Hippie Shirt.png",
        title: "",
        productFamily: "t-shirt",
        templateContext:
          "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          const requestBody = JSON.parse(String(init?.body || "{}"));
          const parts = requestBody?.contents?.[0]?.parts || [];
          capturedPrompt = String(parts[0]?.text || "");

          return createGeminiResponse(createGeminiPayload());
        },
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(/titleSeed: none/i.test(capturedPrompt), true);
    assert.equal(/fileNameSupport: Classic Peace Sign Retro Hippie Shirt\.png/i.test(capturedPrompt), true);
    assert.equal(/do not let the filename write the title or marketing copy/i.test(capturedPrompt), true);
    assert.equal(/trust the clearest render over the filename/i.test(capturedPrompt), true);
  });

  await run("validator keeps the strongest ambiguity warning while preserving real OCR clarity concerns", () => {
    const semantic: SemanticRecord = {
      productNoun: "graphic tee",
      titleCore: "Minimalist Mountain Adventure Hiking T Shirt",
      benefitCore: "Outdoor-themed discovery copy for buyers who like clean art.",
      likelyAudience: "outdoor lifestyle buyers",
      styleOccasion: "minimal adventure aesthetic",
      visibleKeywords: [],
      inferredKeywords: ["mountain shirt", "hiking tee"],
      forbiddenClaims: [],
    };

    const result = gradeListing(
      {
        visibleText: [],
        visibleFacts: ["low-contrast mountain-like line art"],
        inferredMeaning: ["stylized outdoor scene"],
        dominantTheme: "outdoor",
        likelyAudience: "outdoor lifestyle buyers",
        likelyOccasion: "casual wear",
        uncertainty: [
          "The extreme low contrast and minimal detail make the visual content highly ambiguous and open to interpretation.",
          "The exact number or specific features of the mountains are unclear.",
        ],
        ocrWeakness: "weak contrast",
        meaningClarity: 0.58,
        hasReadableText: false,
      },
      semantic,
      {
        classification: "partial_support",
        usefulness: 0.42,
        usefulTokens: ["mountain", "adventure"],
        ignoredTokens: [],
        conflictSeverity: "none",
        shouldIgnore: false,
        reason: "soft support from filename clues",
      },
      semantic.titleCore,
      [
        "Minimal mountain line art keeps the listing visually calm while still pointing toward an outdoor adventure mood.",
        "The clean tee framing makes the artwork usable for shoppers who like subtle hiking and nature-inspired graphics.",
      ],
      ["mountain tee", "hiking shirt", "outdoor graphic", "nature art", "adventure style"]
    );

    assert.equal(
      result.reasonFlags.some((flag) => flag.toLowerCase().includes("ocr/text legibility is weak or partial")),
      true
    );
    assert.equal(
      result.reasonFlags.some((flag) => flag.toLowerCase().includes("highly ambiguous")),
      true
    );
    assert.equal(
      result.reasonFlags.some((flag) => flag.toLowerCase().includes("specific features of the mountains are unclear")),
      false
    );
    assert.equal(result.grade, "red");
  });

  await run("fallback response remains backward compatible when Gemini is unavailable", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "Blessed Christian Tee",
        fileName: "blessed_christian_tee.png",
        productFamily: "t-shirt",
        templateContext: "Heavyweight cotton with shoulder taping.",
      },
      { apiKey: "" }
    );

    assert.equal(typeof response.title, "string");
    assert.ok(Array.isArray(response.leadParagraphs));
    assert.equal(response.leadParagraphs.length, 2);
    assert.equal(typeof response.leadParagraph1, "string");
    assert.equal(typeof response.leadParagraph2, "string");
    assert.equal(typeof response.confidence, "number");
    assert.ok(Array.isArray(response.reasonFlags));
    assert.equal(typeof response.model, "string");
    assert.equal(response.source, "fallback");
  });

  await run("fallback keeps sterile product context for weak filenames without leaking template specs into buyer copy", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "IMG_9384_final_design.png",
        productFamily: "t-shirt",
        templateContext:
          "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel.",
      },
      { apiKey: "" }
    );

    assert.equal(response.source, "fallback");
    assert.equal(response.title.toLowerCase().includes("img 9384"), false);
    assert.equal(response.title.length > 0, true);
    assert.equal(
      response.leadParagraphs.some((paragraph) => /ring-spun cotton|relaxed fit|everyday casual wear|care instructions|100% cotton/i.test(paragraph)),
      false
    );
    assert.equal(
      response.marketplaceDrafts.etsy.discoveryTerms.some((term) => /heavyweight|ring spun cotton|relaxed fit/i.test(term)),
      false
    );
  });

  await run("image-backed golden corpus preserves grade, title, lead, and filename handling behavior", async () => {
    const seenBase64 = new Set<string>();

    for (const fixture of GOLDEN_CORPUS_FIXTURES) {
      const image = readFixtureImageDataUrl(fixture.imageFile);
      seenBase64.add(image.base64);
      assert.equal(image.absolutePath.endsWith(`${path.sep}${fixture.imageFile}`), true, `${fixture.name}: image path should resolve`);

      const filenameAssessment = assessFilenameRelevance(
        fixture.request.fileName,
        (createGeminiPayload(fixture.payloadOverrides).imageTruth.visibleText || []) as string[]
      );

      assert.equal(filenameAssessment.classification, fixture.expected.filename.classification, `${fixture.name}: filename classification`);
      assert.equal(filenameAssessment.shouldIgnore, fixture.expected.filename.shouldIgnore, `${fixture.name}: filename shouldIgnore`);
      assert.equal(
        filenameAssessment.conflictSeverity,
        fixture.expected.filename.conflictSeverity,
        `${fixture.name}: filename conflict severity`
      );

      const response = await generateListingResponse(
        {
          imageDataUrl: image.dataUrl,
          fileName: fixture.request.fileName,
          title: fixture.request.title,
          productFamily: fixture.request.productFamily,
          templateContext: fixture.request.templateContext,
        },
        {
          apiKey: "test-key",
          model: "gemini-test",
          fetchFn: async (_url, init) => {
            const parts = getGeminiRequestParts(init);
            const prompt = String(parts[0]?.text || "");
            const imageParts = getGeminiInlineImageParts(init);
            const inlineData = imageParts[0] || {};
            const helperInlineData = imageParts[imageParts.length - 1] || {};

            assert.equal(inlineData.mimeType, "image/png", `${fixture.name}: image mime type`);
            assert.equal(/qc_status/i.test(prompt), true, `${fixture.name}: prompt should demand qc_status`);
            assert.equal(/extracted_text/i.test(prompt), true, `${fixture.name}: prompt should demand extracted_text`);
            assert.equal(/generated_paragraph_1/i.test(prompt), true, `${fixture.name}: prompt should demand generated marketing paragraphs`);
            if (fixture.name === "transparent png weak contrast") {
              assert.equal(imageParts.length >= 4, true, `${fixture.name}: should send multi-render helper bundle`);
              assert.notEqual(inlineData.data, image.base64, `${fixture.name}: should use derived analysis image as primary`);
              assert.equal(helperInlineData.mimeType, "image/png", `${fixture.name}: helper image mime type`);
              assert.equal(helperInlineData.data, image.base64, `${fixture.name}: untouched original image should be preserved as helper`);
              assert.equal(
                /temporary high-contrast analysis render/i.test(prompt),
                true,
                `${fixture.name}: prompt should describe derived analysis render`
              );
              assert.equal(
                /dark and light garment-neutral backgrounds/i.test(prompt),
                true,
                `${fixture.name}: prompt should describe dark and light helper renders`
              );
            } else {
              assert.equal(inlineData.data, image.base64, `${fixture.name}: exact image fixture should be sent to Gemini`);
            }
            assert.equal(
              prompt.includes(`fileNameSupport: ${fixture.request.fileName}`),
              true,
              `${fixture.name}: prompt should include request filename as support context`
            );
            assert.equal(/sterileProductType:\s*/.test(prompt), true, `${fixture.name}: prompt should include sterile product type`);
            assert.equal(prompt.includes("productFamily:"), false, `${fixture.name}: prompt should no longer include raw product family`);

            return createGeminiResponse(createGeminiPayload(fixture.payloadOverrides));
          },
        }
      );

      assert.equal(response.source, "gemini", fixture.name);
      assert.equal(response.grade, fixture.expected.grade, fixture.name);
      assert.equal(response.leadParagraphs.length, 2, fixture.name);
      assert.equal(response.leadParagraphs[0].toLowerCase().startsWith(response.title.toLowerCase()), false, fixture.name);

      for (const titleFragment of fixture.expected.titleMustInclude) {
        assert.equal(response.title.toLowerCase().includes(titleFragment.toLowerCase()), true, `${fixture.name}: title fragment ${titleFragment}`);
      }

      for (const titleFragment of fixture.expected.titleMustExclude || []) {
        assert.equal(
          response.title.toLowerCase().includes(titleFragment.toLowerCase()),
          false,
          `${fixture.name}: unexpected title fragment ${titleFragment}`
        );
      }

      for (const leadFragment of fixture.expected.leadMustInclude || []) {
        assert.equal(
          response.leadParagraphs.some((paragraph) => paragraph.toLowerCase().includes(leadFragment.toLowerCase())),
          true,
          `${fixture.name}: missing lead fragment ${leadFragment}`
        );
      }

      for (const reasonFragment of fixture.expected.reasonIncludes || []) {
        assert.equal(
          response.reasonFlags.some((flag) => flag.toLowerCase().includes(reasonFragment.toLowerCase())),
          true,
          `${fixture.name}: missing reason fragment ${reasonFragment}`
        );
      }
    }

    assert.equal(seenBase64.size, GOLDEN_CORPUS_FIXTURES.length, "fixture images should all be unique binary cases");
  });

  await run("Gemini structured output maps into canonical UI response shape", async () => {
    const fetchFn: typeof fetch = async () => createGeminiResponse(createGeminiPayload());

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "seed title",
        fileName: "faith_over_fear.png",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn,
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(response.model, "gemini-test");
    assert.equal(response.title.length > 0, true);
    assert.equal(response.leadParagraphs.length, 2);
    assert.equal(typeof response.confidence, "number");
    assert.equal(response.publishReady, true);
    assert.ok(Array.isArray(response.reasonFlags));
    assert.ok(response.marketplaceDrafts.etsy.title.length > 0);
    assert.equal(response.leadParagraphs[0].toLowerCase().startsWith(response.title.toLowerCase()), false);
  });

  await run("Gemini lead shaping replaces generic second paragraph with template-grounded buyer copy", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "IMG_9384_final_design.png",
        productFamily: "t-shirt",
        templateContext:
          "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              canonicalTitle: "Faith Over Fear T Shirt Inspirational Motivational Spiritual Tee",
              canonicalLeadParagraphs: [
                "Embrace strength and positivity with our 'Faith Over Fear' t-shirt. This powerful message serves as a daily reminder to trust in your beliefs and overcome challenges with courage and hope.",
                "Crafted for comfort and style, this tee is perfect for anyone seeking inspiration or looking to share a meaningful statement. It's an ideal addition to your casual wardrobe or a thoughtful gift for a loved one.",
              ],
            })
          ),
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(/(?:^| )T(?: |$)/.test(response.title), false);
    assert.equal(/T-Shirt|Tee|Shirt/i.test(response.title), true);
    assert.equal(/crafted for comfort and style/i.test(response.leadParagraphs[1]), false);
    assert.equal(/doing the heavy lifting on comfort and presentation/i.test(response.leadParagraphs[1]), false);
    assert.equal(/wear|gift|buyer|listing|trust/i.test(response.leadParagraphs[1]), true);
  });

  await run("Gemini lead shaping returns finished sentences instead of clipped ellipsis endings", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "IMG_9384_final_design.png",
        productFamily: "t-shirt",
        templateContext:
          "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching and shoulder-to-shoulder twill tape. Great for everyday casual wear and giftable boutique apparel.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              canonicalLeadParagraphs: [
                "Faith Over Fear Christian Tee delivers a clear message of confidence and conviction for buyers who want an encouraging design that reads quickly in thumbnails, feels meaningful in person, and keeps the visual message central even on busy marketplace result pages...",
                "Crafted for comfort and style, this heavyweight garment-dyed tee works beautifully for repeat wear, giftable moments, and everyday casual outfits while helping shoppers understand the product story without scrolling through a wall of raw template specs...",
              ],
            })
          ),
      }
    );

    assert.equal(response.source, "gemini");
    for (const lead of response.leadParagraphs) {
      assert.equal(/(?:\.\.\.|…)\s*$/.test(lead), false);
      assert.equal(/[.!?]["')\]]*$/.test(lead), true);
    }
  });

  await run("template-aware second paragraph varies across different listing contexts", async () => {
    const heavyResponse = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "faith_over_fear.png",
        productFamily: "t-shirt",
        templateContext:
          "Comfort Colors 1717 heavyweight garment-dyed t-shirt. 100% ring-spun cotton. Relaxed fit with double-needle stitching.",
      },
      {
        apiKey: "",
      }
    );

    const summerResponse = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "sunset-palm-beach-art.png",
        productFamily: "t-shirt",
        templateContext:
          "Lightweight cotton tee with a breathable feel, easy summer styling, and a gift-friendly beachwear angle.",
      },
      {
        apiKey: "",
      }
    );

    assert.notEqual(heavyResponse.leadParagraphs[1], summerResponse.leadParagraphs[1]);
    assert.equal(/doing the heavy lifting on comfort and presentation/i.test(heavyResponse.leadParagraphs[1]), false);
    assert.equal(/doing the heavy lifting on comfort and presentation/i.test(summerResponse.leadParagraphs[1]), false);
  });

  await run("runtime resolves GOOGLE_GENERATIVE_AI_API_KEY for Gemini calls", async () => {
    const previousGemini = process.env.GEMINI_API_KEY;
    const previousGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-env-key";

    try {
      const response = await generateListingResponse(
        {
          imageDataUrl: SAMPLE_PNG_DATA_URL,
          title: "seed title",
          fileName: "faith_over_fear.png",
          productFamily: "t-shirt",
          templateContext: "Heavyweight ring-spun cotton tee built for everyday wear.",
        },
        {
          model: "gemini-test",
          fetchFn: async (_url, init) => {
            assert.equal(String(init?.headers?.["x-goog-api-key"] || ""), "google-env-key");
            return createGeminiResponse(createGeminiPayload());
          },
        }
      );

      assert.equal(response.source, "gemini");
    } finally {
      if (typeof previousGemini === "string") {
        process.env.GEMINI_API_KEY = previousGemini;
      } else {
        delete process.env.GEMINI_API_KEY;
      }

      if (typeof previousGoogle === "string") {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousGoogle;
      } else {
        delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      }
    }
  });

  await run("Gemini prompt strips provider theme bleed down to sterile product type context", async () => {
    let capturedPrompt = "";

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "minimal_mountain.png",
        productFamily: "t-shirt",
        templateContext:
          "Vintage faith boutique favorite &mdash; Unisex Heavy Cotton Tee with uplifting Christian gift angle, washed texture, and soft everyday style&rsquo;s familiar comfort.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async (_url, init) => {
          capturedPrompt = String(getGeminiRequestParts(init)[0]?.text || "");
          return createGeminiResponse(
            createGeminiPayload({
              generated_title: "Minimal Mountain Graphic Tee",
              generated_paragraph_1:
                "Outdoor-minded shoppers will appreciate the calm scenic mood and minimalist energy that make this design feel easy to wear, gift, and style.",
              generated_paragraph_2:
                "Clean mountain linework and balanced composition give the artwork a versatile look that pairs naturally with layered outfits, casual denim, and everyday rotation.",
              seo_tags: [
                "mountain graphic tee",
                "minimal mountain shirt",
                "outdoor vibe apparel",
                "nature lover tee",
                "scenic line art shirt",
                "hiking graphic shirt",
                "camping gift tee",
                "minimalist outdoor style",
                "mountain lover gift",
                "adventure graphic tee",
                "neutral aesthetic shirt",
                "graphic hiking apparel",
                "casual outdoors tee",
                "alpine line art top",
                "giftable nature shirt",
              ],
            })
          );
        },
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(/sterileProductType:\s*Unisex Heavy Cotton Tee/i.test(capturedPrompt), true);
    assert.equal(/faith boutique|christian gift|uplifting/i.test(capturedPrompt), false);
    assert.equal(/&mdash;|&rsquo;|&sup2;/i.test(capturedPrompt), false);
    assert.equal(/40 to 60 words/i.test(capturedPrompt), true);
    assert.equal(/emotional hook, vibe, and audience/i.test(capturedPrompt), true);
    assert.equal(/design details, styling suggestions, and aesthetic fit/i.test(capturedPrompt), true);
    assert.equal(/Read every word on this design exactly as written/i.test(capturedPrompt), true);
    assert.equal(/do not judge dpi, metadata, file headers, or upload-constraint validity/i.test(capturedPrompt), true);
    assert.equal(/model should verify dpi|model should verify metadata|check file headers/i.test(capturedPrompt), false);
  });

  await run("Gemini validator output cannot stay green when reasons or compliance flags are present", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "best-dad-ever-baseball-shirt.png",
        productFamily: "t-shirt",
        templateContext: "Comfort Colors 1717 garment-dyed heavyweight tee with relaxed fit and ring-spun cotton.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              validator: {
                grade: "green",
                confidence: 0.96,
                reasonFlags: ["Filename strongly conflicts with visible image meaning and should be ignored."],
                complianceFlags: [],
                reasonDetails: [],
              },
            })
          ),
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(response.grade, "green");
    assert.equal(response.publishReady, true);
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("filename strongly conflicts")),
      true
    );
  });

  await run("Gemini validator can stay green when only soft symbolic ambiguity remains", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "Classic Peace Sign Retro Hippie Shirt.png",
        productFamily: "t-shirt",
        templateContext: "Comfort Colors 1717 garment-dyed heavyweight tee with relaxed fit and ring-spun cotton.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              imageTruth: {
                visibleText: [],
                visibleFacts: ["clear retro peace sign artwork on transparent background"],
                inferredMeaning: ["peace-forward retro mood", "laid-back hippie style"],
                dominantTheme: "retro peace",
                likelyAudience: "retro lifestyle shoppers",
                likelyOccasion: "casual wear",
                uncertainty: ["The exact symbolic meaning is open to interpretation."],
                ocrWeakness: "none",
                meaningClarity: 0.9,
                hasReadableText: false,
              },
              filenameAssessment: {
                classification: "partial_support",
                usefulness: 0.56,
                usefulTokens: ["peace", "retro", "hippie"],
                ignoredTokens: [],
                conflictSeverity: "none",
                shouldIgnore: false,
                reason: "filename supports the visible design theme",
              },
              semanticRecord: {
                titleCore: "Classic Peace Sign Retro Hippie T-Shirt",
                benefitCore: "Readable retro peace design for laid-back buyers.",
                likelyAudience: "retro lifestyle shoppers",
                styleOccasion: "retro hippie",
                visibleKeywords: ["peace sign", "retro"],
                inferredKeywords: ["hippie shirt", "festival tee"],
                forbiddenClaims: [],
              },
              canonicalTitle: "Classic Peace Sign Retro Hippie T-Shirt",
              canonicalLeadParagraphs: [
                "The retro peace sign graphic gives this shirt a clear vintage mood that reads fast without relying on extra filler.",
                "It lands as an easy festival-ready or casual everyday design for shoppers who want a recognizable peace-forward look.",
              ],
              validator: {
                grade: "green",
                confidence: 0.84,
                reasonFlags: ["The exact symbolic meaning is open to interpretation."],
                complianceFlags: [],
                reasonDetails: [],
              },
            })
          ),
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(response.grade, "green");
    assert.equal(response.publishReady, true);
    assert.equal(response.reasonFlags.some((flag) => flag.toLowerCase().includes("open to interpretation")), true);
  });

  await run("Gemini recoverable transparent-art caution can stay Good on the binary publish path", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "arcade_logo_transparent.png",
        productFamily: "t-shirt",
        templateContext: "Comfort Colors 1717 garment-dyed heavyweight tee with relaxed fit and ring-spun cotton.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            {
              imageTruth: {
                visibleText: [],
                visibleFacts: ["dark monochrome arcade-style logo on transparent background"],
                inferredMeaning: ["retro gamer identity", "minimal arcade brand look"],
                dominantTheme: "retro arcade",
                likelyAudience: "retro gaming fans",
                likelyOccasion: "casual wear",
                uncertainty: ["Small interior logo details remain stylized rather than fully literal."],
                ocrWeakness: "low contrast on the untouched transparent render",
                meaningClarity: 0.33,
                hasReadableText: false,
              },
              filenameAssessment: {
                classification: "partial_support",
                usefulness: 0.58,
                usefulTokens: ["arcade", "logo", "gamer"],
                ignoredTokens: [],
                conflictSeverity: "none",
                shouldIgnore: false,
                reason: "filename supports the visible logo direction",
              },
              semanticRecord: {
                titleCore: "Classic Arcade Logo Minimalist Gamer Shirt",
                benefitCore: "Readable minimalist arcade logo styling for retro gaming buyers.",
                likelyAudience: "retro gaming fans",
                styleOccasion: "minimal gamer",
                visibleKeywords: ["arcade logo", "gamer"],
                inferredKeywords: ["retro gaming shirt", "minimalist gamer tee"],
                forbiddenClaims: [],
              },
              generated_title: "Classic Arcade Logo Minimalist Gamer Shirt",
              generated_paragraph_1:
                "The monochrome arcade logo keeps the design clean and recognizable for buyers who want a simple retro gaming look.",
              generated_paragraph_2:
                "Crisp linework and balanced negative space give the design a clean retro arcade feel that pairs naturally with denim, layered streetwear, and casual weekend styling for shoppers who want subtle gaming identity without a noisy full-color print.",
              seo_tags: [
                "arcade logo shirt",
                "retro gamer tee",
                "minimal arcade shirt",
                "gaming logo apparel",
                "monochrome gamer shirt",
                "retro gaming gift",
                "arcade fan tee",
                "minimalist gamer top",
                "video game style shirt",
                "classic arcade graphic",
                "clean gaming design",
                "subtle gamer apparel",
                "weekend gamer outfit",
                "retro logo tee",
                "gaming culture shirt",
              ],
              qc_status: "PASS",
              extracted_text: "",
              canonicalTitle: "Classic Arcade Logo Minimalist Gamer Shirt",
              canonicalLeadParagraphs: [
                "The monochrome arcade logo keeps the design clean and recognizable for buyers who want a simple retro gaming look.",
                "Crisp linework and balanced negative space give the design a clean retro arcade feel that pairs naturally with denim, layered streetwear, and casual weekend styling for shoppers who want subtle gaming identity without a noisy full-color print.",
              ],
              validator: {
                grade: "green",
                confidence: 0.52,
                reasonFlags: [
                  "Small interior logo details remain stylized rather than fully literal.",
                  "OCR/text legibility is weak or partial.",
                ],
                complianceFlags: [],
                reasonDetails: [
                  {
                    code: "image_uncertainty_1",
                    severity: "warning",
                    stage: "image_truth",
                    summary: "Small interior logo details remain stylized rather than fully literal.",
                  },
                  {
                    code: "ocr_weakness",
                    severity: "warning",
                    stage: "image_truth",
                    summary: "OCR/text legibility is weak or partial.",
                  },
                ],
              },
            }
          ),
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(response.grade, "green");
    assert.equal(response.publishReady, true);
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("stylized")),
      true
    );
  });

  await run("Gemini blocking image-truth reasons keep the item out of the Good publish path", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "ambiguous_scan.png",
        productFamily: "t-shirt",
        templateContext: "Comfort Colors 1717 garment-dyed heavyweight tee with relaxed fit and ring-spun cotton.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              validator: {
                grade: "red",
                confidence: 0.62,
                reasonFlags: ["Visible artwork remains too ambiguous for a trustworthy listing title."],
                complianceFlags: [],
                reasonDetails: [
                  {
                    code: "ambiguous_image_truth",
                    severity: "warning",
                    stage: "image_truth",
                    summary: "Visible artwork remains too ambiguous for a trustworthy listing title.",
                  },
                ],
              },
            })
          ),
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(response.grade, "red");
    assert.equal(response.publishReady, false);
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("too ambiguous")),
      true
    );
  });

  await run("Gemini validator filters unsupported compliance flags on faith conflict cases", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "",
        fileName: "cat_mom_gift_meow_love.png",
        productFamily: "t-shirt",
        templateContext: "Classic unisex cotton tee with everyday comfort and simple faith-forward gifting potential.",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              imageTruth: {
                visibleText: ["jesus saves"],
                visibleFacts: ["bold faith slogan"],
                inferredMeaning: ["faith-forward"],
                dominantTheme: "faith-forward",
                likelyAudience: "faith-based buyers",
                likelyOccasion: "daily wear",
                uncertainty: [],
                ocrWeakness: "none",
                meaningClarity: 0.88,
                hasReadableText: true,
              },
              semanticRecord: {
                titleCore: "Jesus Saves Christian Faith T Shirt",
                benefitCore: "Readable faith slogan for gift-ready apparel listings.",
                likelyAudience: "faith-based buyers",
                styleOccasion: "faith-forward",
                visibleKeywords: ["jesus saves"],
                inferredKeywords: ["faith shirt", "christian tee"],
                forbiddenClaims: ["Claims of healing, miracles, or specific religious dogma that could be seen as exclusive or judgmental."],
              },
              canonicalTitle: "Jesus Saves Christian Faith T Shirt",
              canonicalLeadParagraphs: [
                "Share your faith with conviction in this Jesus Saves t-shirt. The bold visible message keeps the artwork easy to read for buyers.",
                "The product details give the artwork a more convincing home, so the listing can stay message-led while still sounding useful for buyers.",
              ],
              validator: {
                grade: "green",
                confidence: 0.84,
                reasonFlags: [
                  "filename_conflict_ignored",
                  "Filename strongly conflicts with visible image meaning and should be ignored.",
                  "The specific symbolic meaning of the purple circle is not explicitly stated.",
                  "Potential unsupported medical claim detected.",
                  "Potential unsupported claim: Claims of healing, miracles, or specific religious dogma that could be seen as exclusive or judgmental.",
                ],
                complianceFlags: [
                  "Potential unsupported claim: Claims of healing, miracles, or specific religious dogma that could be seen as exclusive or judgmental.",
                ],
                reasonDetails: [],
              },
            })
          ),
      }
    );

    assert.equal(response.source, "gemini");
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("filename strongly conflicts")),
      true
    );
    assert.equal(response.reasonFlags.some((flag) => flag.toLowerCase().includes("filename_conflict_ignored")), false);
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("specific symbolic meaning")),
      true
    );
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("medical claim")),
      false
    );
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("healing")),
      false
    );
    assert.equal(response.grade, "green");
    assert.equal(response.publishReady, true);
  });

  await run("Gemini retry ladder succeeds on second structured attempt", async () => {
    const sequence = createFetchSequence([
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not-valid-json" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
      createGeminiResponse(createGeminiPayload({ canonicalTitle: "Recovered Structured Output Tee" })),
    ]);

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "seed title",
        fileName: "recovered_output.png",
        productFamily: "t-shirt",
      },
      { apiKey: "test-key", model: "gemini-test", fetchFn: sequence.fetchFn }
    );

    assert.equal(sequence.getCallCount(), 2);
    assert.equal(response.source, "gemini");
    assert.equal(response.title.includes("Recovered Structured Output Tee"), true);
  });

  await run("Gemini retry ladder falls back deterministically after bounded failures", async () => {
    const sequence = createFetchSequence([
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not-valid-json" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
      new Response("temporary failure", { status: 500, headers: { "content-type": "text/plain" } }),
    ]);

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "fallback seed",
        fileName: "fallback_seed.png",
        productFamily: "t-shirt",
      },
      { apiKey: "test-key", model: "gemini-test", fetchFn: sequence.fetchFn }
    );

    assert.equal(sequence.getCallCount(), 2);
    assert.equal(response.source, "fallback");
    assert.equal(response.reasonFlags.some((flag) => flag.toLowerCase().includes("deterministic fallback used")), true);
  });

  await run("structured response sanitizes buyer-facing paragraphs and tag output without title bleed", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "faith_over_fear_transparent.png",
        productFamily: "t-shirt",
        templateContext:
          "Product features\n- 100% ring-spun cotton\nCare instructions\n- Machine wash cold",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              generatedTitle: "Faith Over Fear Christian Tee",
              generatedParagraph1:
                "```markdown\nFaith Over Fear Christian Tee - Faith-based shoppers will love the bold message and clean spiritual design that makes this shirt feel encouraging, wearable, and giftable.\n```",
              generatedParagraph2:
                "This uplifting Christian shirt keeps the typography easy to read while helping the design connect quickly with buyers searching for meaningful everyday faith apparel.",
              tags: "faith over fear, christian shirt, faith gift, religious tee, church outfit, inspirational shirt, spiritual apparel, gospel message, believer gift, faith based style, daily wear shirt, christian merch, motivational tee, scripture apparel, print on demand faith",
            })
          ),
      }
    );

    assert.equal(response.qcApproved, true);
    assert.equal(response.title, "Faith Over Fear Christian Tee");
    assert.equal(response.publishReady, true);
    assert.equal(response.description.includes("```"), false);
    assert.equal(response.description.toLowerCase().startsWith(response.title.toLowerCase()), false);
    assert.equal(/100% ring-spun cotton|machine wash cold/i.test(response.description), false);
    assert.equal(response.description.split(/\n\n/).length, 2);
    assert.equal(Array.isArray(response.tags), true);
    assert.equal(response.tags.length, 15);
    assert.equal(response.tags.some((tag) => tag.includes(",")), false);
  });

  await run("qc FAIL path blanks structured fields and keeps the item out of the Good publish path", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "illegible_scan.png",
        productFamily: "t-shirt",
        templateContext:
          "Product features\n- 100% ring-spun cotton\nCare instructions\n- Machine wash cold",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              qc_status: "FAIL",
              extracted_text: "",
              generated_title: "",
              generated_paragraph_1: "",
              generated_paragraph_2: "",
              seo_tags: [],
            })
          ),
      }
    );

    assert.equal(response.qcApproved, false);
    assert.equal(response.publishReady, false);
    assert.equal(response.title, "");
    assert.equal(response.description, "");
    assert.deepEqual(response.leadParagraphs, []);
    assert.deepEqual(response.tags, []);
    assert.equal(response.grade, "red");
    assert.equal(response.reasonFlags.some((flag) => /rejected|blank|illegible|distorted|qc/i.test(flag)), true);
  });

  await run("compliance rule packs surface explainable reasons without breaking UI contract", async () => {
    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "official_medical_cure_shirt.png",
        title: "",
        productFamily: "t-shirt",
      },
      {
        apiKey: "test-key",
        model: "gemini-test",
        fetchFn: async () =>
          createGeminiResponse(
            createGeminiPayload({
              semanticRecord: {
                titleCore: "Official Miracle Cure Graphic Tee",
                benefitCore: "Official healing shirt with guaranteed results.",
                inferredKeywords: ["official shirt", "miracle cure"],
                forbiddenClaims: ["official", "cure", "guaranteed"],
              },
              canonicalTitle: "Official Miracle Cure Graphic Tee",
              canonicalLeadParagraphs: [
                "Official Miracle Cure Graphic Tee offers bold promise-heavy messaging.",
                "Guaranteed results language should trigger immediate compliance failure.",
              ],
              validator: { grade: "red", confidence: 0.44, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
            })
          ),
      }
    );

    assert.equal(response.reasonFlags.some((flag) => flag.toLowerCase().includes("official")), true);
    assert.equal(response.grade, "red");
    assert.deepEqual(Object.keys(response).filter((key) => ["title", "leadParagraphs", "confidence", "reasonFlags", "model"].includes(key)), [
      "title",
      "leadParagraphs",
      "model",
      "confidence",
      "reasonFlags",
    ]);
  });

  await run("server-side draft publish guard rejects non-ready items and accepts Good items", async () => {
    assert.equal(
      validateReadyDraftItem({
        fileName: "soft-warning.png",
        title: "Usable Listing",
        description: "Buyer-facing paragraph one.\n\nBuyer-facing paragraph two.",
        tags: ["tag-one", "tag-two"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        publishReady: false,
        qcApproved: true,
      }),
      "Only Good items can be published. Re-run or remove failed artwork before uploading drafts."
    );

    assert.equal(
      validateReadyDraftItem({
        fileName: "ready-item.png",
        title: "Ready Listing",
        description: "Buyer-facing paragraph one.\n\nBuyer-facing paragraph two.",
        tags: ["tag-one", "tag-two"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        publishReady: true,
        qcApproved: true,
      }),
      null
    );

    assert.equal(
      validateReadyDraftItem({
        fileName: "ready-html-item.png",
        title: "Ready Listing",
        description: "<p>Buyer-facing paragraph one with enough detail to read like real marketing copy.</p><p>Buyer-facing paragraph two with styling context and a complete closing sentence.</p><h3>Product features</h3><ul><li>Exact provider template text remains appended separately.</li></ul>",
        tags: ["tag-one", "tag-two"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        publishReady: true,
        qcApproved: true,
      }),
      null
    );

    assert.equal(
      validateReadyDraftItem({
        fileName: "raw-output.png",
        title: "Ready Listing",
        description: "```json\n{\"generated_title\":\"Ready Listing\"}\n```",
        tags: ["tag-one", "tag-two"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        publishReady: true,
        qcApproved: true,
      }),
      "Only sanitized Good items can be published. Re-run artwork that still contains raw AI output."
    );

    assert.equal(
      validateReadyDraftItem({
        fileName: "half-assembled.png",
        title: "Ready Listing",
        description: "Only one paragraph is present here.",
        tags: ["tag-one", "tag-two"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        publishReady: true,
        qcApproved: true,
      }),
      "Only fully assembled Good items with buyer-facing marketing paragraphs can be published."
    );
  });

  console.log("listing-engine tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
