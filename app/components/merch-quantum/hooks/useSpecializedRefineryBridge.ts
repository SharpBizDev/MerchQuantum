'use client';

import { useEffect, useMemo, useState } from "react";
import type { SpecializedRefineryKind } from "../../../../lib/services/ingestion/RefineryExtractionForge";

type BridgeStatus = "waiting" | "ready" | "error";

type RustSpecializedRefineryHost = {
  refine_specialized_bytes?: (kind: string, buffer: Uint8Array) => Promise<string> | string;
};

type SpecializedRefineryBridgeStatus = {
  status: BridgeStatus;
  source: string | null;
  message: string;
  lastError: string | null;
};

declare global {
  interface Window {
    __contextQuantumRustWasm__?: RustSpecializedRefineryHost;
    __contextQuantumSpecializedRefinery__?: {
      refine: (kind: SpecializedRefineryKind, buffer: Uint8Array) => Promise<string | Record<string, unknown>> | string | Record<string, unknown>;
    };
  }
}

function createWaitingState(): SpecializedRefineryBridgeStatus {
  return {
    status: "waiting",
    source: null,
    message: "Awaiting Rust specialized refinery bridge.",
    lastError: null,
  };
}

function normalizeBuffer(buffer: Uint8Array | ArrayBuffer | number[]) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return Uint8Array.from(buffer);
}

function tryRegisterBridge(): SpecializedRefineryBridgeStatus {
  if (typeof window === "undefined") {
    return createWaitingState();
  }

  if (window.__contextQuantumSpecializedRefinery__) {
    return {
      status: "ready",
      source: "browser-bridge",
      message: "Specialized refinery bridge is armed.",
      lastError: null,
    };
  }

  const rustHost = window.__contextQuantumRustWasm__;
  if (!rustHost?.refine_specialized_bytes) {
    return createWaitingState();
  }

  window.__contextQuantumSpecializedRefinery__ = {
    refine: async (kind, buffer) => {
      return await rustHost.refine_specialized_bytes!(kind, normalizeBuffer(buffer));
    },
  };

  return {
    status: "ready",
    source: "window.__contextQuantumRustWasm__",
    message: "Rust specialized refinery bridge is online.",
    lastError: null,
  };
}

export function useSpecializedRefineryBridge() {
  const [bridge, setBridge] = useState<SpecializedRefineryBridgeStatus>(() => tryRegisterBridge());

  useEffect(() => {
    let disposed = false;

    const refresh = () => {
      if (disposed) return;
      try {
        setBridge(tryRegisterBridge());
      } catch (error) {
        setBridge({
          status: "error",
          source: "registration",
          message: "Specialized refinery bridge registration failed.",
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    };

    refresh();
    const interval = window.setInterval(refresh, 1250);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  return useMemo(() => bridge, [bridge]);
}

export type UseSpecializedRefineryBridgeResult = ReturnType<typeof useSpecializedRefineryBridge>;

