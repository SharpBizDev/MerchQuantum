import { NextRequest, NextResponse } from "next/server";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import {
  ContextQuantumEvaluatorError,
  runContextQuantumRoutingLoop,
} from "../../../../lib/ai/context-quantum-evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_RESPONSES_URL = `${XAI_BASE_URL}/responses`;
const XAI_API_KEY_ENV_NAME = "XAI_API_KEY";
const DEFAULT_REFINERY_MODEL = "grok-4-fast-non-reasoning";

const yamlAgentRequestSchema = z.object({
  transcript: z.string().trim().min(1, "transcript is required"),
  transcriptId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
}).strict();

const yamlAgentDocumentSchema = z.object({
  transcript_id: z.string().trim().min(1),
  source: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  key_points: z.array(z.string().trim().min(1)).min(1),
  quoted_evidence: z.array(z.string().trim().min(1)).min(1),
}).strict();

type YamlAgentRequest = z.infer<typeof yamlAgentRequestSchema>;

function resolveApiKey() {
  const apiKey = process.env[XAI_API_KEY_ENV_NAME]?.trim();
  if (!apiKey) {
    throw new Error(`Missing ${XAI_API_KEY_ENV_NAME} for refinery yaml-agent.`);
  }
  return apiKey;
}

function buildPrimaryContext(input: YamlAgentRequest) {
  const transcriptId = input.transcriptId || (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `transcript-${Date.now()}`);
  const source = input.source || "transcript-payload";

  return [
    "You are the Context Quantum primary refinery agent.",
    "Convert the transcript into strict YAML only.",
    "Do not output prose, markdown fences, or explanations.",
    "Required YAML keys:",
    "- transcript_id",
    "- source",
    "- title",
    "- summary",
    "- key_points",
    "- quoted_evidence",
    "",
    "Constraints:",
    "- Every scalar must be a non-empty string.",
    "- key_points must contain at least one item.",
    "- quoted_evidence must contain at least one literal supporting quote from the transcript.",
    "",
    `transcript_id: ${transcriptId}`,
    `source: ${source}`,
    "transcript:",
    input.transcript,
  ].join("\n");
}

async function callPrimaryYamlAgent(context: string, apiKey: string) {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_REFINERY_MODEL,
      store: false,
      temperature: 0,
      instructions: "Return YAML only.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: context,
            },
          ],
        },
      ],
    }),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Primary YAML agent transport failed: ${message}`);
  });

  const responseText = await response.text().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Primary YAML agent response body read failed: ${message}`);
  });

  if (!response.ok) {
    throw new Error(`Primary YAML agent failed with status ${response.status}: ${responseText}`);
  }

  const parsedEnvelope = z.object({
    output_text: z.string().optional(),
    output: z.array(
      z.object({
        content: z.array(
          z.object({
            text: z.string().optional(),
            output_text: z.string().optional(),
            value: z.string().optional(),
          }).passthrough()
        ).optional(),
      }).passthrough()
    ).optional(),
  }).passthrough().parse(JSON.parse(responseText) as unknown);

  if (typeof parsedEnvelope.output_text === "string" && parsedEnvelope.output_text.trim()) {
    return parsedEnvelope.output_text.trim();
  }

  const contentText = (parsedEnvelope.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || part.value || "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!contentText) {
    throw new Error("Primary YAML agent returned an empty payload.");
  }

  return contentText;
}

function validateYamlDocument(yamlText: string) {
  const parsed = parseYaml(yamlText) as unknown;
  return yamlAgentDocumentSchema.parse(parsed);
}

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON request body: ${message}`);
    });
    const input = yamlAgentRequestSchema.parse(requestBody);
    const apiKey = resolveApiKey();

    const result = await runContextQuantumRoutingLoop({
      originalPrimaryContext: buildPrimaryContext(input),
      executePrimary: ({ context }) => callPrimaryYamlAgent(context, apiKey),
      evaluateOptions: {
        apiKey,
      },
    });

    validateYamlDocument(result.yaml);

    return new NextResponse(result.yaml, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Schema Validation Failed" }, { status: 400 });
    }

    if (error instanceof ContextQuantumEvaluatorError) {
      return NextResponse.json(
        {
          error: "Context Quantum evaluation failed",
          failures: error.failures,
        },
        { status: 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Unhandled refinery yaml-agent failure.";
    if (/^Invalid JSON request body:/i.test(message)) {
      return NextResponse.json({ error: "Schema Validation Failed" }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
