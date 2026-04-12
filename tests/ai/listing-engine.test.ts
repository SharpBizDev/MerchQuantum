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
    assert.equal(response.grade, "orange");
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
    assert.equal(response.reasonFlags.length, 0);
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
                grade: "orange",
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
      false
    );
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("medical claim")),
      false
    );
    assert.equal(
      response.reasonFlags.some((flag) => flag.toLowerCase().includes("healing")),
      false
    );
    assert.equal(response.grade, "orange");
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
                "Guaranteed results language should trigger compliance review immediately.",
              ],
              validator: { grade: "orange", confidence: 0.44, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
            })
          ),
      }
    );

    assert.equal(response.reasonFlags.some((flag) => flag.toLowerCase().includes("official")), true);
    assert.equal(response.grade === "orange" || response.grade === "red", true);
    assert.deepEqual(Object.keys(response).filter((key) => ["title", "leadParagraphs", "confidence", "reasonFlags", "model"].includes(key)), [
      "title",
      "leadParagraphs",
      "model",
      "confidence",
      "reasonFlags",
    ]);
  });

  console.log("listing-engine tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
