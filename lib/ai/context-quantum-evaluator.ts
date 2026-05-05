import { z } from "zod";

const XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_RESPONSES_URL = `${XAI_BASE_URL}/responses`;
const XAI_API_KEY_ENV_NAME = "XAI_API_KEY";
const DEFAULT_CONTEXT_QUANTUM_MODEL = "grok-4-fast-non-reasoning";
const DEFAULT_CONTEXT_QUANTUM_REWRITE_ATTEMPTS = 2;

export const CONTEXT_QUANTUM_EVALUATOR_SYSTEM_PROMPT =
  "You are the F.O.R.C.E. Evaluator. Your sole function is to identify structural gaps, weak assumptions, and formatting flaws in this YAML schema. Do not balance with positives. Return 'PASS' or an array of specific logical failures.";

const evaluatorDecisionSchema = z.union([z.literal("PASS"), z.array(z.string().min(1)).min(1)]);
const nonEmptyYamlSchema = z.string().trim().min(1, "finalized YAML is required");
const responseTextValueSchema = z.object({
  value: z.string(),
}).strict();
const xaiResponseContentPartSchema = z.object({
  text: z.union([z.string(), responseTextValueSchema]).optional(),
  value: z.string().optional(),
  output_text: z.string().optional(),
}).passthrough();
const xaiResponseOutputItemSchema = z.object({
  content: z.union([z.string(), z.array(xaiResponseContentPartSchema)]).optional(),
}).passthrough();
const xaiResponseEnvelopeSchema = z.object({
  output_text: z.string().optional(),
  output: z.array(xaiResponseOutputItemSchema).optional(),
}).passthrough();

export type ContextQuantumEvaluationDecision = "PASS" | string[];

export type EvaluateYAMLOptions = {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

export type ContextQuantumPrimaryExecutor = (input: {
  context: string;
  attempt: number;
  critiqueFailures: string[];
}) => Promise<string>;

export type ContextQuantumRoutingLoopInput = {
  originalPrimaryContext: string;
  executePrimary: ContextQuantumPrimaryExecutor;
  evaluateOptions?: EvaluateYAMLOptions;
  maxAttempts?: number;
};

export type ContextQuantumRoutingLoopResult = {
  yaml: string;
  evaluation: ContextQuantumEvaluationDecision;
  attempts: number;
  finalPrimaryContext: string;
};

export class ContextQuantumEvaluatorError extends Error {
  failures: string[];
  attempts: number;
  lastYaml: string;

  constructor(message: string, failures: string[], attempts: number, lastYaml: string) {
    super(message);
    this.name = "ContextQuantumEvaluatorError";
    this.failures = failures;
    this.attempts = attempts;
    this.lastYaml = lastYaml;
  }
}

function resolveApiKey(apiKey?: string) {
  const resolved = typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : process.env[XAI_API_KEY_ENV_NAME]?.trim();
  if (!resolved) {
    throw new Error(`Missing ${XAI_API_KEY_ENV_NAME} for Context Quantum evaluation.`);
  }
  return resolved;
}

function cleanEvaluatorText(value: string) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json|yaml|yml)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractContentPartText(part: z.infer<typeof xaiResponseContentPartSchema>) {
  if (typeof part.text === "string") return part.text;
  if (part.text && typeof part.text === "object" && typeof part.text.value === "string") return part.text.value;
  if (typeof part.value === "string") return part.value;
  if (typeof part.output_text === "string") return part.output_text;
  return "";
}

function extractResponseText(responsePayload: unknown) {
  const parsed = xaiResponseEnvelopeSchema.safeParse(responsePayload);
  if (!parsed.success) return "";

  if (typeof parsed.data.output_text === "string") {
    return parsed.data.output_text.trim();
  }

  const parts = (parsed.data.output || []).flatMap((item) => {
    if (typeof item.content === "string") return [item.content];
    const content = Array.isArray(item.content) ? item.content : [];
    return content.map((part) => extractContentPartText(part));
  });

  return parts.filter(Boolean).join("\n").trim();
}

function parseEvaluatorDecision(rawText: string): ContextQuantumEvaluationDecision {
  const cleaned = cleanEvaluatorText(rawText);
  if (/^PASS$/i.test(cleaned)) {
    return "PASS";
  }

  try {
    return evaluatorDecisionSchema.parse(JSON.parse(cleaned));
  } catch {
    const bulletFailures = cleaned
      .split(/\r?\n/g)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);

    return evaluatorDecisionSchema.parse(bulletFailures);
  }
}

async function callContextQuantumModel(
  systemPrompt: string,
  userPrompt: string,
  options: Required<Pick<EvaluateYAMLOptions, "apiKey" | "model" | "fetchFn">>
) {
  const response = await options.fetchFn(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      store: false,
      temperature: 0,
      instructions: systemPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt,
            },
          ],
        },
      ],
    }),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Context Quantum model request transport failed: ${message}`);
  });

  const responseText = await response.text().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Context Quantum model response body read failed: ${message}`);
  });
  if (!response.ok) {
    throw new Error(`Context Quantum model request failed with status ${response.status}: ${responseText}`);
  }

  return extractResponseText(JSON.parse(responseText) as unknown);
}

function buildEvaluatorUserPrompt(finalizedYaml: string) {
  return [
    "Evaluate this finalized YAML only.",
    "You are blind to the original raw data and must not infer missing source evidence.",
    "Return exactly one of the following:",
    "1. PASS",
    "2. A JSON array of specific logical failures as plain strings",
    "",
    "FINALIZED YAML",
    finalizedYaml,
  ].join("\n");
}

export async function evaluateYAML(
  finalizedYaml: string,
  options: EvaluateYAMLOptions = {}
): Promise<ContextQuantumEvaluationDecision> {
  const yaml = nonEmptyYamlSchema.parse(finalizedYaml);
  const fetchFn = options.fetchFn || fetch;
  const apiKey = resolveApiKey(options.apiKey);
  const model = options.model || DEFAULT_CONTEXT_QUANTUM_MODEL;

  const rawDecision = await callContextQuantumModel(
    CONTEXT_QUANTUM_EVALUATOR_SYSTEM_PROMPT,
    buildEvaluatorUserPrompt(yaml),
    {
      apiKey,
      model,
      fetchFn,
    }
  );

  return parseEvaluatorDecision(rawDecision);
}

function buildRewriteContext(originalPrimaryContext: string, critiqueFailures: string[]) {
  const baseContext = nonEmptyYamlSchema.parse(originalPrimaryContext);
  if (critiqueFailures.length === 0) {
    return baseContext;
  }

  return [
    baseContext,
    "",
    "F.O.R.C.E. EVALUATOR CRITIQUE ARRAY",
    JSON.stringify(critiqueFailures, null, 2),
    "",
    "Rewrite the YAML from scratch.",
    "Resolve every cited structural gap, weak assumption, and formatting flaw.",
    "Return YAML only.",
  ].join("\n");
}

export async function runContextQuantumRoutingLoop(
  input: ContextQuantumRoutingLoopInput
): Promise<ContextQuantumRoutingLoopResult> {
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts || DEFAULT_CONTEXT_QUANTUM_REWRITE_ATTEMPTS));
  const originalPrimaryContext = nonEmptyYamlSchema.parse(input.originalPrimaryContext);
  let critiqueFailures: string[] = [];
  let lastYaml = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const activeContext = buildRewriteContext(originalPrimaryContext, critiqueFailures);
    const yaml = nonEmptyYamlSchema.parse(
      await input.executePrimary({
        context: activeContext,
        attempt,
        critiqueFailures,
      })
    );

    lastYaml = yaml;
    const evaluation = await evaluateYAML(yaml, input.evaluateOptions);
    if (evaluation === "PASS") {
      return {
        yaml,
        evaluation,
        attempts: attempt,
        finalPrimaryContext: activeContext,
      };
    }

    critiqueFailures = evaluation;
  }

  throw new ContextQuantumEvaluatorError(
    "Context Quantum evaluation failed after the maximum rewrite attempts.",
    critiqueFailures,
    maxAttempts,
    lastYaml
  );
}
