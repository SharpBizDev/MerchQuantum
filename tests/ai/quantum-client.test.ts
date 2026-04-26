import assert from "node:assert/strict";
import test from "node:test";

import {
  QUANTUM_ROUTE_COLORS,
  QuantumRouteError,
  requestAiListing,
  requestYamlAgent,
} from "../../lib/client/quantum-routes";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=";

type FetchHandler = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function createListingSuccessResponse(overrides: Partial<{
  title: string;
  description: string;
  tags: string[];
}> = {}) {
  return new Response(
    JSON.stringify({
      qcApproved: true,
      publishReady: true,
      title: overrides.title || "Faith Over Fear Tee",
      description: overrides.description || "Structured buyer-facing description.",
      tags: overrides.tags || ["Faith", "Christian", "Tee"],
      leadParagraphs: ["Structured buyer-facing description."],
      leadParagraph1: "Structured buyer-facing description.",
      leadParagraph2: "",
      model: "grok-4-fast-non-reasoning",
      confidence: 0.94,
      reasonFlags: [],
      source: "gemini",
      grade: "green",
      marketplaceDrafts: {
        etsy: { title: "Etsy Title", leadParagraphs: ["Lead"], discoveryTerms: ["faith"] },
        amazon: { title: "Amazon Title", leadParagraphs: ["Lead"], discoveryTerms: ["faith"] },
        ebay: { title: "eBay Title", leadParagraphs: ["Lead"], discoveryTerms: ["faith"] },
        tiktokShop: { title: "TikTok Title", leadParagraphs: ["Lead"], discoveryTerms: ["faith"] },
      },
      semanticRecord: {
        productNoun: "tee",
        titleCore: "faith over fear",
        benefitCore: "clear spiritual message",
        likelyAudience: "faith-driven shoppers",
        styleOccasion: "casual wear",
        visibleKeywords: ["faith", "fear"],
        inferredKeywords: ["christian"],
        forbiddenClaims: [],
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

async function withMockedFetch(handler: FetchHandler, run: () => Promise<void>) {
  const originalFetch = global.fetch;
  global.fetch = ((input: string | URL | Request, init?: RequestInit) => handler(input, init)) as typeof fetch;

  try {
    await run();
  } finally {
    global.fetch = originalFetch;
  }
}

test("requestAiListing surfaces HTTP 400 as fatal red telemetry", async () => {
  await withMockedFetch(
    async () =>
      new Response(JSON.stringify({ error: "Schema Validation Failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      await assert.rejects(
        () =>
          requestAiListing({
            imageDataUrl: SAMPLE_PNG_DATA_URL,
            fileName: "faith-over-fear.png",
          }),
        (error: unknown) => {
          assert.equal(error instanceof QuantumRouteError, true);
          const typedError = error as QuantumRouteError;
          assert.equal(typedError.status, 400);
          assert.equal(typedError.telemetry.color, QUANTUM_ROUTE_COLORS.fatal);
          assert.equal(typedError.telemetry.message, "HTTP 400: Schema Validation Failed");
          return true;
        }
      );
    }
  );
});

test("requestAiListing surfaces HTTP 429 as caution telemetry", async () => {
  await withMockedFetch(
    async () =>
      new Response(JSON.stringify({ error: "Rate limit exceeded. Awaiting retry." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      await assert.rejects(
        () =>
          requestAiListing({
            imageDataUrl: SAMPLE_PNG_DATA_URL,
            fileName: "faith-over-fear.png",
          }),
        (error: unknown) => {
          assert.equal(error instanceof QuantumRouteError, true);
          const typedError = error as QuantumRouteError;
          assert.equal(typedError.status, 429);
          assert.equal(typedError.telemetry.color, QUANTUM_ROUTE_COLORS.caution);
          assert.equal(typedError.telemetry.message, "HTTP 429: Rate limit exceeded. Awaiting retry.");
          return true;
        }
      );
    }
  );
});

test("requestAiListing surfaces HTTP 500 as fatal red telemetry", async () => {
  await withMockedFetch(
    async () =>
      new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      await assert.rejects(
        () =>
          requestAiListing({
            imageDataUrl: SAMPLE_PNG_DATA_URL,
            fileName: "faith-over-fear.png",
          }),
        (error: unknown) => {
          assert.equal(error instanceof QuantumRouteError, true);
          const typedError = error as QuantumRouteError;
          assert.equal(typedError.status, 500);
          assert.equal(typedError.telemetry.color, QUANTUM_ROUTE_COLORS.fatal);
          assert.equal(typedError.telemetry.message, "HTTP 500: Internal server error");
          return true;
        }
      );
    }
  );
});

test("requestAiListing surfaces client aborts as HTTP 504 fatal telemetry", async () => {
  await withMockedFetch(
    async () => Promise.reject(new DOMException("Gateway Timeout.", "AbortError")),
    async () => {
      await assert.rejects(
        () =>
          requestAiListing({
            imageDataUrl: SAMPLE_PNG_DATA_URL,
            fileName: "faith-over-fear.png",
          }),
        (error: unknown) => {
          assert.equal(error instanceof QuantumRouteError, true);
          const typedError = error as QuantumRouteError;
          assert.equal(typedError.status, 504);
          assert.equal(typedError.telemetry.color, QUANTUM_ROUTE_COLORS.fatal);
          assert.equal(typedError.telemetry.message, "HTTP 504: Gateway Timeout.");
          return true;
        }
      );
    }
  );
});

test("requestAiListing aggressively rejects malformed JSON payloads", async () => {
  await withMockedFetch(
    async () => new Response("{bad-json", { status: 200, headers: { "content-type": "application/json" } }),
    async () => {
      await assert.rejects(
        () =>
          requestAiListing({
            imageDataUrl: SAMPLE_PNG_DATA_URL,
            fileName: "faith-over-fear.png",
          }),
        (error: unknown) => {
          assert.equal(error instanceof QuantumRouteError, true);
          const typedError = error as QuantumRouteError;
          assert.equal(typedError.status, 502);
          assert.equal(typedError.telemetry.color, QUANTUM_ROUTE_COLORS.fatal);
          assert.equal(typedError.telemetry.message, "HTTP 502: Malformed Backend Payload.");
          return true;
        }
      );
    }
  );
});

test("requestYamlAgent validates returned YAML before releasing it to the client", async () => {
  await withMockedFetch(
    async () =>
      new Response(
        [
          "transcript_id: tx-1",
          "source: transcript-payload",
          "title: Structured YAML Output",
          "summary: Validated refinery output.",
          "key_points:",
          "  - Point one",
          "quoted_evidence:",
          "  - \"Literal quote\"",
        ].join("\n"),
        {
          status: 200,
          headers: { "content-type": "application/yaml; charset=utf-8" },
        }
      ),
    async () => {
      const result = await requestYamlAgent({
        transcript: "Literal quote",
      });

      assert.equal(result.data.transcript_id, "tx-1");
      assert.equal(result.data.title, "Structured YAML Output");
      assert.equal(/title: Structured YAML Output/.test(result.yamlText), true);
    }
  );
});

test("requestAiListing releases only schema-validated success payloads", async () => {
  await withMockedFetch(
    async () => createListingSuccessResponse(),
    async () => {
      const result = await requestAiListing({
        imageDataUrl: SAMPLE_PNG_DATA_URL,
        fileName: "faith-over-fear.png",
      });

      assert.equal(result.title, "Faith Over Fear Tee");
      assert.equal(result.publishReady, true);
      assert.deepEqual(result.tags, ["Faith", "Christian", "Tee"]);
    }
  );
});
