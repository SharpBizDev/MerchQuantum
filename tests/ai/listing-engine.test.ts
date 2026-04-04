import assert from "node:assert/strict";

import {
  assessFilenameRelevance,
  generateListingResponse,
  gradeListing,
  normalizeLeadParagraphs,
  type SemanticRecord,
} from "../../lib/ai/listing-engine";

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

async function run(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`PASS ${name}`);
}

async function main() {
  await run("filename relevance marks generic names as weak", () => {
    const result = assessFilenameRelevance("IMG_1234_final_design.png", ["Blessed"]);
    assert.equal(result.classification, "weak_or_generic");
  });

  await run("filename relevance marks conflicting clues", () => {
    const result = assessFilenameRelevance("cat_mom_gift.png", ["jesus saves", "faith over fear"]);
    assert.equal(result.classification, "conflicting");
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
        "This clean design supports gift-ready merch listings with clear buyer intent.",
      ],
      semantic
    );

    assert.equal(leads.length, 2);
    assert.equal(leads[0].toLowerCase().startsWith("faith over fear christian tee"), false);
  });

  await run("validator grades green for clear records and red for unclear records", () => {
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
        reason: "supportive filename",
      }
    );
    assert.equal(green.grade, "green");

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
        reason: "weak filename",
      }
    );
    assert.equal(red.grade, "red");
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

  await run("Gemini structured output maps into canonical UI response shape", async () => {
    const fetchFn: typeof fetch = async () =>
      createGeminiResponse({
        imageTruth: {
          visibleText: ["faith over fear"],
          visibleFacts: ["white lettering"],
          inferredMeaning: ["faith-forward"],
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
              "Faith Over Fear Christian Tee delivers a clean, faith-forward statement for daily wear.",
              "Pair this opening copy with your imported template details for a complete listing.",
            ],
            discoveryTerms: ["faith over fear", "christian gift"],
          },
          amazon: {
            title: "Faith Over Fear Christian Tee",
            leadParagraphs: ["Faith-forward design for everyday confidence.", "Strong buyer intent keyword alignment."],
            discoveryTerms: ["faith shirt", "christian tee"],
          },
          ebay: {
            title: "Faith Over Fear Tee",
            leadParagraphs: ["Bold readable slogan.", "Gift-ready listing starter copy."],
            discoveryTerms: ["faith over fear"],
          },
          tiktokShop: {
            title: "Faith Over Fear Christian Tee",
            leadParagraphs: ["Fast-scroll clarity with visible slogan copy.", "Built for clean conversion messaging."],
            discoveryTerms: ["faith shirt", "faith gift"],
          },
        },
        validator: {
          grade: "green",
          confidence: 0.9,
          reasonFlags: [],
          complianceFlags: [],
        },
        canonicalTitle: "Faith Over Fear Christian Tee",
        canonicalLeadParagraphs: [
          "Faith Over Fear Christian Tee helps this listing communicate a clear faith-forward style quickly.",
          "Use this as opening persuasion copy, then keep your imported factual template details below.",
        ],
      });

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

  await run("Gemini parse failures gracefully fall back", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not-valid-json" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const response = await generateListingResponse(
      {
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        title: "fallback seed",
        fileName: "fallback_seed.png",
        productFamily: "t-shirt",
      },
      { apiKey: "test-key", model: "gemini-test", fetchFn }
    );

    assert.equal(response.source, "fallback");
    assert.equal(response.leadParagraphs.length, 2);
  });

  console.log("listing-engine tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
