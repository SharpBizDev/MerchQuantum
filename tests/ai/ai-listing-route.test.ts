import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import * as routeModuleNamespace from "../../app/api/ai/listing/route";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=";

type RouteModuleShape = {
  POST: (request: NextRequest) => Promise<Response>;
};

type AppRouteNamespace = {
  POST?: (request: NextRequest) => Promise<Response>;
  default?: RouteModuleShape;
  "module.exports"?: RouteModuleShape;
};

type FetchMockHandler = (url: string, init?: RequestInit) => Promise<Response>;

function createStructuredTextResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      created: Date.now(),
      model: "grok-4-fast-non-reasoning",
      status: "completed",
      output: [
        {
          id: "msg_test",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text,
            },
          ],
        },
      ],
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    }
  );
}

function createFileUploadResponse(fileId = "file_test") {
  return new Response(JSON.stringify({ id: fileId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function withMockedFetch(handler: FetchMockHandler, test: () => Promise<void>) {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-key";
  global.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;

  try {
    await test();
  } finally {
    global.fetch = originalFetch;
    process.env.XAI_API_KEY = originalApiKey;
  }
}

const routeModule = routeModuleNamespace as unknown as AppRouteNamespace;
const POST =
  routeModule.POST
  || routeModule.default?.POST
  || routeModule["module.exports"]?.POST;

if (!POST) {
  throw new Error("Unable to resolve ai listing route POST handler.");
}

async function createRouteRequest(body: string) {
  return new NextRequest("http://localhost/api/ai/listing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

test("returns deterministic fallback when Grok responds with malformed structured output", async () => {
  await withMockedFetch(async (url) => {
    if (url.endsWith("/files")) {
      return createFileUploadResponse();
    }

    if (url.endsWith("/responses")) {
      return createStructuredTextResponse("not-valid-json");
    }

    throw new Error(`Unexpected fetch target: ${url}`);
  }, async () => {
    const response = await POST(
      await createRouteRequest(
        JSON.stringify({
          imageDataUrl: SAMPLE_PNG_DATA_URL,
          fileName: "faith-over-fear.png",
          productFamily: "t-shirt",
        })
      )
    );
    const payload = (await response.json()) as { source?: string; reasonFlags?: string[] };

    assert.equal(response.status, 200);
    assert.equal(payload.source, "fallback");
    assert.equal(Array.isArray(payload.reasonFlags), true);
  });
});

test("returns deterministic fallback when route-level F.O.R.C.E. validation rejects the generated payload", async () => {
  await withMockedFetch(async (url) => {
    if (url.endsWith("/files")) {
      return createFileUploadResponse();
    }

    if (url.endsWith("/responses")) {
      return createStructuredTextResponse(JSON.stringify({
        qc_status: "PASS",
        extracted_text: "",
        primary_niche: "Everyday wear basketball line art",
        literal_visual_elements: null,
        target_audience_identity: "",
        generated_title: "Minimal Basketball Line Art",
        seo_tags: ["basketball tee", "line art"],
      }));
    }

    throw new Error(`Unexpected fetch target: ${url}`);
  }, async () => {
    const response = await POST(
      await createRouteRequest(
        JSON.stringify({
          imageDataUrl: SAMPLE_PNG_DATA_URL,
          fileName: "basketball-line-art.png",
          productFamily: "t-shirt",
        })
      )
    );
    const payload = (await response.json()) as { source?: string; reasonFlags?: string[] };

    assert.equal(response.status, 200);
    assert.equal(payload.source, "fallback");
    assert.equal(Array.isArray(payload.reasonFlags), true);
  });
});

test("aggressively rejects upstream 500 from Grok", async () => {
  await withMockedFetch(async (url) => {
    if (url.endsWith("/files")) {
      return createFileUploadResponse();
    }

    if (url.endsWith("/responses")) {
      return new Response("upstream failure", { status: 500 });
    }

    throw new Error(`Unexpected fetch target: ${url}`);
  }, async () => {
    const response = await POST(
      await createRouteRequest(
        JSON.stringify({
          imageDataUrl: SAMPLE_PNG_DATA_URL,
          fileName: "faith-over-fear.png",
          productFamily: "t-shirt",
        })
      )
    );
    const payload = (await response.json()) as { error?: string };

    assert.equal(response.status, 500);
    assert.equal(payload.error, "An unexpected error occurred. Please try again.");
  });
});

test("aggressively rejects 429 rate limits from Grok", async () => {
  await withMockedFetch(async (url) => {
    if (url.endsWith("/files")) {
      return createFileUploadResponse();
    }

    if (url.endsWith("/responses")) {
      return new Response("rate limited", { status: 429 });
    }

    throw new Error(`Unexpected fetch target: ${url}`);
  }, async () => {
    const response = await POST(
      await createRouteRequest(
        JSON.stringify({
          imageDataUrl: SAMPLE_PNG_DATA_URL,
          fileName: "faith-over-fear.png",
          productFamily: "t-shirt",
        })
      )
    );
    const payload = (await response.json()) as { error?: string };

    assert.equal(response.status, 429);
    assert.equal(payload.error, "An unexpected error occurred. Please try again.");
  });
});

test("aggressively rejects Grok timeouts with 504", async () => {
  await withMockedFetch((url) => {
    if (url.endsWith("/files")) {
      return Promise.resolve(createFileUploadResponse());
    }

    if (url.endsWith("/responses")) {
      return Promise.reject(new DOMException("upstream timeout", "AbortError"));
    }

    return Promise.reject(new Error(`Unexpected fetch target: ${url}`));
  }, async () => {
    const response = await POST(
      await createRouteRequest(
        JSON.stringify({
          imageDataUrl: SAMPLE_PNG_DATA_URL,
          fileName: "faith-over-fear.png",
          productFamily: "t-shirt",
        })
      )
    );
    const payload = (await response.json()) as { error?: string };

    assert.equal(response.status, 504);
    assert.equal(payload.error, "An unexpected error occurred. Please try again.");
  });
});
