'use client';

import { useCallback, useState } from "react";
import { z } from "zod";

const CLIENT_REQUEST_TIMEOUT_MS = 60000;

export const QUANTUM_ROUTE_COLORS = {
  active: "#7F22FE",
  success: "#00BC7D",
  caution: "#FE9A00",
  fatal: "#FF2056",
} as const;

export type QuantumRouteName = "listing" | "yaml-agent";
export type QuantumTelemetryTone = keyof typeof QUANTUM_ROUTE_COLORS;
export type QuantumTelemetryColor = (typeof QUANTUM_ROUTE_COLORS)[QuantumTelemetryTone];

export type QuantumRouteTelemetry = {
  route: QuantumRouteName;
  tone: QuantumTelemetryTone;
  color: QuantumTelemetryColor;
  message: string;
  status: number | null;
};

export type QuantumYamlAgentRequest = {
  transcript: string;
  transcriptId?: string;
  source?: string;
};

const backendErrorSchema = z.object({
  error: z.string().min(1),
  failures: z.array(z.string().min(1)).optional(),
}).strict();

const channelDraftSchema = z.object({
  title: z.string(),
  leadParagraphs: z.array(z.string()),
  discoveryTerms: z.array(z.string()),
}).strict();

const semanticRecordSchema = z.object({
  productNoun: z.string(),
  titleCore: z.string(),
  benefitCore: z.string(),
  likelyAudience: z.string(),
  styleOccasion: z.string(),
  visibleKeywords: z.array(z.string()),
  inferredKeywords: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
}).strict();

const listingRequestSchema = z.object({
  imageDataUrl: z.string().min(1),
  title: z.string().optional(),
  fileName: z.string().min(1),
  templateContext: z.string().optional(),
  productFamily: z.string().optional(),
  userHints: z.array(z.string()).optional(),
  legacyContext: z.string().optional(),
}).strict();

export const listingResponseSchema = z.object({
  qcApproved: z.boolean(),
  publishReady: z.boolean(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  leadParagraphs: z.array(z.string()),
  leadParagraph1: z.string(),
  leadParagraph2: z.string(),
  model: z.string(),
  confidence: z.number().finite(),
  reasonFlags: z.array(z.string()),
  source: z.enum(["gemini", "fallback"]),
  grade: z.enum(["green", "red"]),
  marketplaceDrafts: z.object({
    etsy: channelDraftSchema,
    amazon: channelDraftSchema,
    ebay: channelDraftSchema,
    tiktokShop: channelDraftSchema,
  }).strict(),
  semanticRecord: semanticRecordSchema,
}).strict();

const yamlAgentRequestSchema = z.object({
  transcript: z.string().trim().min(1),
  transcriptId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
}).strict();

export const yamlAgentResponseSchema = z.object({
  transcript_id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  key_points: z.array(z.string().min(1)).min(1),
  quoted_evidence: z.array(z.string().min(1)).min(1),
}).strict();

export type QuantumListingResponse = z.infer<typeof listingResponseSchema>;
export type QuantumYamlAgentResponse = z.infer<typeof yamlAgentResponseSchema>;

export class QuantumRouteError extends Error {
  route: QuantumRouteName;
  status: number;
  telemetry: QuantumRouteTelemetry;

  constructor(route: QuantumRouteName, status: number, message: string, telemetry: QuantumRouteTelemetry) {
    super(message);
    this.name = "QuantumRouteError";
    this.route = route;
    this.status = status;
    this.telemetry = telemetry;
  }
}

function buildStatusMessage(status: number, detail: string) {
  if (detail.trim()) {
    return `HTTP ${status}: ${detail.trim()}`;
  }

  switch (status) {
    case 400:
      return "HTTP 400: Schema Validation Failed.";
    case 429:
      return "HTTP 429: Rate Limit Exceeded. Awaiting retry.";
    case 500:
      return "HTTP 500: Backend Error.";
    case 502:
      return "HTTP 502: Malformed Backend Payload.";
    case 504:
      return "HTTP 504: Gateway Timeout.";
    default:
      return `HTTP ${status}: Backend request failed.`;
  }
}

export function createQuantumRouteTelemetry(
  route: QuantumRouteName,
  tone: QuantumTelemetryTone,
  message: string,
  status: number | null
): QuantumRouteTelemetry {
  return {
    route,
    tone,
    color: QUANTUM_ROUTE_COLORS[tone],
    message,
    status,
  };
}

function createRouteError(route: QuantumRouteName, status: number, detail: string, tone: QuantumTelemetryTone) {
  const message = buildStatusMessage(status, detail);
  return new QuantumRouteError(route, status, message, createQuantumRouteTelemetry(route, tone, message, status));
}

function createLocalSchemaError(route: QuantumRouteName, message: string) {
  return new QuantumRouteError(
    route,
    400,
    message,
    createQuantumRouteTelemetry(route, "fatal", message, 400)
  );
}

async function fetchRouteWithTimeout(
  route: QuantumRouteName,
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = CLIENT_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw createRouteError(route, 504, "Gateway Timeout.", "fatal");
      }

      const detail = error instanceof Error ? error.message : "Client transport failure.";
      throw createRouteError(route, 500, detail, "fatal");
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function readResponseText(response: Response) {
  return response.text().catch(() => "");
}

async function parseErrorDetail(response: Response) {
  const rawText = await readResponseText(response);
  if (!rawText.trim()) {
    return response.statusText || "";
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return rawText.trim();
  }

  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(rawText) as unknown;
  } catch {
    return rawText.trim();
  }
  const parsedPayload = backendErrorSchema.safeParse(parsedJson);
  if (!parsedPayload.success) {
    return rawText.trim();
  }

  return parsedPayload.data.failures?.length
    ? `${parsedPayload.data.error} ${parsedPayload.data.failures.join(" • ")}`
    : parsedPayload.data.error;
}

async function parseJsonPayload(response: Response, route: QuantumRouteName) {
  const rawText = await readResponseText(response);
  if (!rawText.trim()) {
    throw createRouteError(route, 502, "Malformed Backend Payload.", "fatal");
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw createRouteError(route, 502, "Malformed Backend Payload.", "fatal");
  }
}

export function useQuantumRouteTelemetry() {
  const [telemetry, setTelemetryState] = useState<QuantumRouteTelemetry | null>(null);

  const setTelemetry = useCallback((nextTelemetry: QuantumRouteTelemetry | null) => {
    setTelemetryState(nextTelemetry);
  }, []);

  const clearTelemetry = useCallback(() => {
    setTelemetryState(null);
  }, []);

  const activateTelemetry = useCallback((route: QuantumRouteName, message: string) => {
    setTelemetryState(createQuantumRouteTelemetry(route, "active", message, null));
  }, []);

  return {
    telemetry,
    setTelemetry,
    clearTelemetry,
    activateTelemetry,
  };
}

export async function requestAiListing(payload: z.infer<typeof listingRequestSchema>) {
  const validatedPayload = listingRequestSchema.safeParse(payload);
  if (!validatedPayload.success) {
    throw createLocalSchemaError("listing", "Client schema rejected the AI listing request payload.");
  }

  const response = await fetchRouteWithTimeout(
    "listing",
    "/api/ai/listing",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedPayload.data),
    }
  );

  if (response.status === 400) {
    throw createRouteError("listing", 400, await parseErrorDetail(response), "fatal");
  }

  if (response.status === 429) {
    throw createRouteError("listing", 429, await parseErrorDetail(response), "caution");
  }

  if (response.status === 500) {
    throw createRouteError("listing", 500, await parseErrorDetail(response), "fatal");
  }

  if (response.status === 504) {
    throw createRouteError("listing", 504, await parseErrorDetail(response), "fatal");
  }

  if (!response.ok) {
    throw createRouteError("listing", response.status, await parseErrorDetail(response), "fatal");
  }

  const parsedPayload = listingResponseSchema.safeParse(await parseJsonPayload(response, "listing"));
  if (!parsedPayload.success) {
    throw createRouteError("listing", 502, "Malformed Backend Payload.", "fatal");
  }

  return parsedPayload.data;
}

export async function requestYamlAgent(payload: QuantumYamlAgentRequest) {
  const validatedPayload = yamlAgentRequestSchema.safeParse(payload);
  if (!validatedPayload.success) {
    throw createLocalSchemaError("yaml-agent", "Client schema rejected the YAML refinery request payload.");
  }

  const response = await fetchRouteWithTimeout(
    "yaml-agent",
    "/api/refinery/yaml-agent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedPayload.data),
    }
  );

  if (response.status === 400) {
    throw createRouteError("yaml-agent", 400, await parseErrorDetail(response), "fatal");
  }

  if (response.status === 429) {
    throw createRouteError("yaml-agent", 429, await parseErrorDetail(response), "caution");
  }

  if (response.status === 500) {
    throw createRouteError("yaml-agent", 500, await parseErrorDetail(response), "fatal");
  }

  if (response.status === 504) {
    throw createRouteError("yaml-agent", 504, await parseErrorDetail(response), "fatal");
  }

  if (!response.ok) {
    throw createRouteError("yaml-agent", response.status, await parseErrorDetail(response), "fatal");
  }

  const yamlText = await readResponseText(response);
  if (!yamlText.trim()) {
    throw createRouteError("yaml-agent", 502, "Malformed Backend Payload.", "fatal");
  }

  const yamlModule = await import("yaml").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : "Failed to load YAML parser.";
    throw createRouteError("yaml-agent", 500, detail, "fatal");
  });
  const parsedYaml = yamlModule.parse(yamlText) as unknown;
  const parsedPayload = yamlAgentResponseSchema.safeParse(parsedYaml);
  if (!parsedPayload.success) {
    throw createRouteError("yaml-agent", 502, "Malformed Backend Payload.", "fatal");
  }

  return {
    yamlText,
    data: parsedPayload.data,
  };
}
