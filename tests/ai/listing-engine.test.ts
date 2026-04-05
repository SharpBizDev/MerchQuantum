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

    assert.equal(clipped.grade, "orange");
    assert.equal(
      clipped.reasonFlags.some((flag) => flag.toLowerCase().includes("appears clipped")),
      true
    );
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

  await run("fallback uses template context to improve weak filename outputs", async () => {
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
    assert.equal(response.title.toLowerCase().includes("garment"), true);
    assert.equal(
      response.leadParagraphs.some((paragraph) => /ring-spun cotton|relaxed fit|everyday casual wear/i.test(paragraph)),
      true
    );
    assert.equal(
      response.marketplaceDrafts.etsy.discoveryTerms.some((term) => /heavyweight|ring spun cotton|relaxed fit/i.test(term)),
      true
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
            const requestBody = JSON.parse(String(init?.body || "{}"));
            const parts = requestBody?.contents?.[0]?.parts || [];
            const prompt = String(parts[0]?.text || "");
            const inlineData = parts[1]?.inlineData || {};

            assert.equal(inlineData.mimeType, "image/png", `${fixture.name}: image mime type`);
            assert.equal(inlineData.data, image.base64, `${fixture.name}: exact image fixture should be sent to Gemini`);
            assert.equal(prompt.includes(`fileName: ${fixture.request.fileName}`), true, `${fixture.name}: prompt should include request filename`);
            assert.equal(
              prompt.includes(`productFamily: ${fixture.request.productFamily}`),
              true,
              `${fixture.name}: prompt should include product family`
            );

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
                  "Filename strongly conflicts with visible image meaning and should be ignored.",
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
