"use client";

import { stringify as stringifyYaml } from "yaml";
import { getOpfsStagingBridge, type OpfsStageResult } from "./OpfsStaging";

export type RefineryBucket = "text" | "media" | "binary" | "generic";
export type RefineryStatus = "refined" | "metadata-only" | "awaiting-research-data" | "raw";
export type SpecializedRefineryKind = "step" | "stl" | "dicom";
export type SpecializedRefineryBridgeStatus = {
  status: "waiting" | "ready" | "error";
  source: string | null;
  message: string;
  lastError: string | null;
};

export type RefinerySniffInput = {
  mimeType: string;
  magicSignature: string | null;
  openGraph: Record<string, string>;
  jsonLd: Array<Record<string, unknown>>;
  canonicalUrl: string | null;
  title: string | null;
  byteLength: number;
};

export type RefineryArtifact = {
  bucket: RefineryBucket;
  status: RefineryStatus;
  summary: string;
  outputText: string | null;
  metadata: Record<string, unknown>;
};

export type RefineryForgeInput = {
  sourceLabel: string;
  sniff: RefinerySniffInput;
  staged: OpfsStageResult;
};

type SpecializedRefineryBridge = {
  refine: (kind: SpecializedRefineryKind, buffer: Uint8Array) => Promise<string | Record<string, unknown>> | string | Record<string, unknown>;
};

type RustSpecializedRefineryHost = {
  refine_specialized_bytes?: (kind: string, buffer: Uint8Array) => Promise<string> | string;
};

type QuantumRefineryWasmModule = {
  default?: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
  refine_specialized_bytes?: (kind: string, buffer: Uint8Array) => string;
};

declare global {
  interface Window {
    __contextQuantumRustWasm__?: RustSpecializedRefineryHost;
    __contextQuantumSpecializedRefinery__?: SpecializedRefineryBridge;
  }
}

let bridgeLoadPromise: Promise<SpecializedRefineryBridge | null> | null = null;
let bridgeStatus: SpecializedRefineryBridgeStatus = {
  status: "waiting",
  source: null,
  message: "Awaiting Rust specialized refinery bridge.",
  lastError: null,
};

function setBridgeStatus(next: SpecializedRefineryBridgeStatus) {
  bridgeStatus = next;
}

function getFingerprint(input: RefineryForgeInput) {
  return `${input.sniff.magicSignature ?? ""} ${input.sniff.mimeType} ${input.sourceLabel}`.toLowerCase();
}

function routeBucket(input: RefineryForgeInput): RefineryBucket {
  if (detectSpecializedKind(input)) {
    return "binary";
  }

  const mime = input.sniff.magicSignature ?? input.sniff.mimeType;
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("xml") || mime.includes("yaml") || mime.includes("markdown")) {
    return "text";
  }
  if (mime.startsWith("audio/") || mime.startsWith("video/") || mime.startsWith("image/")) {
    return "media";
  }
  if (mime.includes("pdf") || mime.includes("dicom") || mime.includes("step") || mime.includes("model/") || mime.includes("stl")) {
    return "binary";
  }
  return "generic";
}

function normalizeTextSample(textSample: string, mimeType: string) {
  const trimmed = textSample.replace(/\u0000/g, "").trim();
  if (!trimmed) {
    return {
      status: "raw" as const,
      summary: "No inline text sample was available during refinement.",
      outputText: null,
    };
  }

  if (mimeType.includes("json")) {
    try {
      return {
        status: "refined" as const,
        summary: "JSON payload normalized for downstream refinery steps.",
        outputText: JSON.stringify(JSON.parse(trimmed), null, 2),
      };
    } catch {
      return {
        status: "raw" as const,
        summary: "JSON-like payload returned as raw text after parse failure.",
        outputText: trimmed,
      };
    }
  }

  const normalized = trimmed
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  return {
    status: "refined" as const,
    summary: mimeType.includes("yaml")
      ? "Structured text normalized for YAML-aware downstream parsing."
      : "Text sample normalized for refinery consumption.",
    outputText: normalized,
  };
}

function normalizeBuffer(buffer: Uint8Array | ArrayBuffer | number[]) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return Uint8Array.from(buffer);
}

function parseSpecializedPayload(payload: string | Record<string, unknown>) {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return { raw: payload };
    }
  }

  return payload;
}

function detectSpecializedKind(input: RefineryForgeInput): SpecializedRefineryKind | null {
  const fingerprint = getFingerprint(input);
  if (fingerprint.includes("dicom") || fingerprint.endsWith(".dcm")) return "dicom";
  if (fingerprint.includes("step") || fingerprint.endsWith(".stp") || fingerprint.endsWith(".step")) return "step";
  if (fingerprint.includes("stl") || fingerprint.endsWith(".stl")) return "stl";
  return null;
}

async function ensureRustSpecializedRefineryHost() {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.__contextQuantumRustWasm__?.refine_specialized_bytes) {
    return window.__contextQuantumRustWasm__;
  }

  const modulePath = "/refinery-wasm/quantum_core.js";
  const wasmModule = await import(/* webpackIgnore: true */ modulePath) as unknown as QuantumRefineryWasmModule;
  if (typeof wasmModule.default === "function") {
    await wasmModule.default("/refinery-wasm/quantum_core_bg.wasm");
  }

  if (typeof wasmModule.refine_specialized_bytes !== "function") {
    throw new Error("Rust specialized refinery export refine_specialized_bytes was not found.");
  }

  window.__contextQuantumRustWasm__ = {
    refine_specialized_bytes: (kind, buffer) => wasmModule.refine_specialized_bytes!(kind, normalizeBuffer(buffer)),
  };

  return window.__contextQuantumRustWasm__;
}

export function getSpecializedRefineryBridgeStatus() {
  return bridgeStatus;
}

export async function ensureSpecializedRefineryBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.__contextQuantumSpecializedRefinery__) {
    if (bridgeStatus.status !== "ready") {
      setBridgeStatus({
        status: "ready",
        source: bridgeStatus.source ?? "browser-bridge",
        message: "Specialized refinery bridge is armed.",
        lastError: null,
      });
    }
    return window.__contextQuantumSpecializedRefinery__;
  }

  if (!bridgeLoadPromise) {
    setBridgeStatus({
      status: "waiting",
      source: "loader",
      message: "Loading Rust specialized refinery bridge.",
      lastError: null,
    });

    bridgeLoadPromise = (async () => {
      try {
        const rustHost = await ensureRustSpecializedRefineryHost();
        if (!rustHost?.refine_specialized_bytes) {
          setBridgeStatus({
            status: "waiting",
            source: null,
            message: "Awaiting Rust specialized refinery bridge.",
            lastError: null,
          });
          return null;
        }

        window.__contextQuantumSpecializedRefinery__ = {
          refine: async (kind, buffer) => rustHost.refine_specialized_bytes!(kind, normalizeBuffer(buffer)),
        };

        setBridgeStatus({
          status: "ready",
          source: "wasm-browser-loader",
          message: "Rust specialized refinery bridge is online.",
          lastError: null,
        });

        return window.__contextQuantumSpecializedRefinery__;
      } catch (error) {
        setBridgeStatus({
          status: "error",
          source: "wasm-browser-loader",
          message: "Rust specialized refinery bridge failed to initialize.",
          lastError: error instanceof Error ? error.message : String(error),
        });
        return null;
      } finally {
        bridgeLoadPromise = null;
      }
    })();
  }

  return bridgeLoadPromise;
}

async function invokeSpecializedRefinery(kind: SpecializedRefineryKind, staged: OpfsStageResult) {
  if (typeof window === "undefined" || !staged.scratchPath) {
    return null;
  }

  const bridge = window.__contextQuantumSpecializedRefinery__ ?? await ensureSpecializedRefineryBridge();
  if (!bridge) {
    return null;
  }

  const buffer = await getOpfsStagingBridge().readScratchBytes(staged.scratchPath);
  const payload = await bridge.refine(kind, buffer);
  return parseSpecializedPayload(payload);
}

function refineText(input: RefineryForgeInput): RefineryArtifact {
  const normalized = normalizeTextSample(input.staged.textSample, input.sniff.mimeType);
  return {
    bucket: "text",
    status: normalized.status,
    summary: normalized.summary,
    outputText: normalized.outputText,
    metadata: {
      canonicalUrl: input.sniff.canonicalUrl,
      title: input.sniff.title,
      jsonLdCount: input.sniff.jsonLd.length,
      openGraphKeys: Object.keys(input.sniff.openGraph),
    },
  };
}

function refineMedia(input: RefineryForgeInput): RefineryArtifact {
  const ogTitle = input.sniff.openGraph["og:title"] ?? input.sniff.title;
  return {
    bucket: "media",
    status: "metadata-only",
    summary: "Media refinery prepared metadata and ASR slots; transcript extraction is awaiting the Whisper bridge.",
    outputText: ogTitle ?? null,
    metadata: {
      mediaTitle: ogTitle,
      canonicalUrl: input.sniff.canonicalUrl,
      byteLength: input.sniff.byteLength,
      contentType: input.sniff.mimeType,
      sniffedMetadata: input.sniff.openGraph,
    },
  };
}

async function refineBinary(input: RefineryForgeInput): Promise<RefineryArtifact> {
  const specialization = input.sniff.magicSignature ?? input.sniff.mimeType;
  const kind = detectSpecializedKind(input);
  const rustMetadata = kind ? await invokeSpecializedRefinery(kind, input.staged) : null;

  if (rustMetadata && kind) {
    const yamlMetadata = stringifyYaml(rustMetadata).trim();
    return {
      bucket: "binary",
      status: "refined",
      summary: `Rust specialized refinery completed deep ${kind.toUpperCase()} extraction.`,
      outputText: yamlMetadata,
      metadata: {
        specialization,
        specializedKind: kind,
        canonicalUrl: input.sniff.canonicalUrl,
        byteLength: input.sniff.byteLength,
        rustMetadata,
        yamlMetadata,
      },
    };
  }

  return {
    bucket: "binary",
    status: "awaiting-research-data",
    summary: `Binary refinery parked ${specialization} for specialized CAD/medical/PDF extraction research.`,
    outputText: null,
    metadata: {
      specialization,
      canonicalUrl: input.sniff.canonicalUrl,
      byteLength: input.sniff.byteLength,
      headerAudit: input.sniff.openGraph,
      specializedKind: kind,
      bridgeStatus: getSpecializedRefineryBridgeStatus(),
    },
  };
}

function refineGeneric(input: RefineryForgeInput): RefineryArtifact {
  return {
    bucket: "generic",
    status: "metadata-only",
    summary: "Generic refinery preserved staged metadata for later domain-specific processing.",
    outputText: input.sniff.title ?? input.sourceLabel,
    metadata: {
      canonicalUrl: input.sniff.canonicalUrl,
      contentType: input.sniff.mimeType,
      byteLength: input.sniff.byteLength,
    },
  };
}

export async function forgeRefineryArtifact(input: RefineryForgeInput): Promise<RefineryArtifact> {
  const bucket = routeBucket(input);

  switch (bucket) {
    case "text":
      return refineText(input);
    case "media":
      return refineMedia(input);
    case "binary":
      return refineBinary(input);
    default:
      return refineGeneric(input);
  }
}



