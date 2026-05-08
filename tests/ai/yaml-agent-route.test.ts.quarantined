import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import * as routeModuleNamespace from "../../app/api/refinery/yaml-agent/route";
import { CONTEXT_QUANTUM_EVALUATOR_SYSTEM_PROMPT } from "../../lib/ai/context-quantum-evaluator";

type RouteModuleShape = {
  POST: (request: NextRequest) => Promise<Response>;
};

type AppRouteNamespace = {
  POST?: (request: NextRequest) => Promise<Response>;
  default?: RouteModuleShape;
  "module.exports"?: RouteModuleShape;
};

function createModelResponse(text: string, status = 200) {
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

const routeModule = routeModuleNamespace as unknown as AppRouteNamespace;
const POST =
  routeModule.POST
  || routeModule.default?.POST
  || routeModule["module.exports"]?.POST;

if (!POST) {
  throw new Error("Unable to resolve yaml-agent POST handler.");
}

test("yaml-agent rejects malformed request payloads", async () => {
  const response = await POST(
    new NextRequest("http://localhost/api/refinery/yaml-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "" }),
    })
  );
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Schema Validation Failed");
});

test("yaml-agent rewrites when the evaluator returns failures and then emits strict YAML", async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-key";
  let primaryAttempt = 0;
  let evaluatorAttempt = 0;

  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as {
      instructions?: string;
      input?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const instructions = String(body.instructions || "");
    const promptText = String(body.input?.[0]?.content?.[0]?.text || "");

    if (instructions === CONTEXT_QUANTUM_EVALUATOR_SYSTEM_PROMPT) {
      evaluatorAttempt += 1;
      if (evaluatorAttempt === 1) {
        return createModelResponse(JSON.stringify(["missing quoted_evidence depth"]));
      }

      return createModelResponse("PASS");
    }

    primaryAttempt += 1;
    if (primaryAttempt === 1) {
      return createModelResponse(
        [
          "transcript_id: generated-1",
          "source: transcript-payload",
          "title: Draft One",
          "summary: Weak summary",
          "key_points:",
          "  - First point",
          "quoted_evidence:",
          "  - \"Short quote\"",
        ].join("\n")
      );
    }

    assert.equal(promptText.includes("F.O.R.C.E. EVALUATOR CRITIQUE ARRAY"), true);
    return createModelResponse(
      [
        "transcript_id: generated-1",
        "source: transcript-payload",
        "title: Draft Two",
        "summary: Strong summary",
        "key_points:",
        "  - First point",
        "  - Second point",
        "quoted_evidence:",
        "  - \"Literal supporting quote one\"",
        "  - \"Literal supporting quote two\"",
      ].join("\n")
    );
  }) as typeof fetch;

  try {
    const response = await POST(
      new NextRequest("http://localhost/api/refinery/yaml-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: "Literal supporting quote one. Literal supporting quote two.",
        }),
      })
    );
    const yamlText = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/yaml; charset=utf-8");
    assert.equal(primaryAttempt, 2);
    assert.equal(evaluatorAttempt, 2);
    assert.equal(/title: Draft Two/.test(yamlText), true);
  } finally {
    global.fetch = originalFetch;
    process.env.XAI_API_KEY = originalApiKey;
  }
});
