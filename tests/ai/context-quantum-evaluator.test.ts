import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_QUANTUM_EVALUATOR_SYSTEM_PROMPT,
  ContextQuantumEvaluatorError,
  evaluateYAML,
  runContextQuantumRoutingLoop,
} from "../../lib/ai/context-quantum-evaluator";

function createEvaluatorResponse(text: string, status = 200) {
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

test("evaluateYAML returns PASS and sends the strict evaluator prompt", async () => {
  let capturedInstructions = "";
  let capturedUserPrompt = "";

  const decision = await evaluateYAML("title: Sample\nsummary: Ready", {
    apiKey: "test-key",
    fetchFn: async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as {
        instructions?: string;
        input?: Array<{ content?: Array<{ text?: string }> }>;
      };
      capturedInstructions = String(body.instructions || "");
      capturedUserPrompt = String(body.input?.[0]?.content?.[0]?.text || "");
      return createEvaluatorResponse("PASS");
    },
  });

  assert.equal(decision, "PASS");
  assert.equal(capturedInstructions, CONTEXT_QUANTUM_EVALUATOR_SYSTEM_PROMPT);
  assert.equal(/FINALIZED YAML/.test(capturedUserPrompt), true);
  assert.equal(/title: Sample/.test(capturedUserPrompt), true);
});

test("evaluateYAML parses an array of logical failures", async () => {
  const decision = await evaluateYAML("title: Sample\nsummary: Ready", {
    apiKey: "test-key",
    fetchFn: async () =>
      createEvaluatorResponse(
        JSON.stringify([
          "missing top-level version field",
          "weak assumption in audience mapping",
        ])
      ),
  });

  assert.deepEqual(decision, [
    "missing top-level version field",
    "weak assumption in audience mapping",
  ]);
});

test("routing loop appends critique to the original primary context and forces one rewrite", async () => {
  const primaryContexts: string[] = [];
  let evaluationAttempt = 0;

  const result = await runContextQuantumRoutingLoop({
    originalPrimaryContext: "PRIMARY CONTEXT\nReturn YAML only.",
    executePrimary: async ({ context, attempt }) => {
      primaryContexts.push(context);

      if (attempt === 1) {
        return "title: Draft One\nsummary: Weak";
      }

      return "title: Draft Two\nsummary: Strong";
    },
    evaluateOptions: {
      apiKey: "test-key",
      fetchFn: async () => {
        evaluationAttempt += 1;
        if (evaluationAttempt === 1) {
          return createEvaluatorResponse(
            JSON.stringify([
              "missing confidence field",
              "formatting flaw in nested section indentation",
            ])
          );
        }

        return createEvaluatorResponse("PASS");
      },
    },
  });

  assert.equal(result.evaluation, "PASS");
  assert.equal(result.attempts, 2);
  assert.equal(primaryContexts.length, 2);
  assert.equal(primaryContexts[0], "PRIMARY CONTEXT\nReturn YAML only.");
  assert.equal(primaryContexts[1].includes("PRIMARY CONTEXT\nReturn YAML only."), true);
  assert.equal(primaryContexts[1].includes("F.O.R.C.E. EVALUATOR CRITIQUE ARRAY"), true);
  assert.equal(primaryContexts[1].includes("missing confidence field"), true);
});

test("routing loop throws after bounded rewrite attempts fail", async () => {
  await assert.rejects(
    () =>
      runContextQuantumRoutingLoop({
        originalPrimaryContext: "PRIMARY CONTEXT",
        executePrimary: async ({ attempt }) => `title: Attempt ${attempt}\nsummary: Still weak`,
        evaluateOptions: {
          apiKey: "test-key",
          fetchFn: async () => createEvaluatorResponse(JSON.stringify(["schema gap remains"])),
        },
        maxAttempts: 2,
      }),
    (error: unknown) => {
      assert.equal(error instanceof ContextQuantumEvaluatorError, true);
      const typedError = error as ContextQuantumEvaluatorError;
      assert.deepEqual(typedError.failures, ["schema gap remains"]);
      assert.equal(typedError.attempts, 2);
      return true;
    }
  );
});
