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
