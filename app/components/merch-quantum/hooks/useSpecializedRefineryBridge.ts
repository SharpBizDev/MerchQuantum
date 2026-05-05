'use client';

import { useEffect, useMemo, useState } from "react";
import {
  ensureSpecializedRefineryBridge,
  getSpecializedRefineryBridgeStatus,
  type SpecializedRefineryBridgeStatus,
} from "../../../../lib/services/ingestion/RefineryExtractionForge";

export function useSpecializedRefineryBridge() {
  const [bridge, setBridge] = useState<SpecializedRefineryBridgeStatus>(() => getSpecializedRefineryBridgeStatus());

  useEffect(() => {
    let disposed = false;

    const sync = () => {
      if (!disposed) {
        setBridge(getSpecializedRefineryBridgeStatus());
      }
    };

    void ensureSpecializedRefineryBridge().finally(sync);
    sync();

    const interval = window.setInterval(sync, 700);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  return useMemo(() => {
    const sabEnabled = typeof SharedArrayBuffer !== "undefined" && window.crossOriginIsolated;
    if (bridge.status === "ready" && sabEnabled) {
      return {
        ...bridge,
        source: "native-sab-bridge",
        message: "Native specialized refinery bridge is online (SAB enabled).",
      };
    }

    return bridge;
  }, [bridge]);
}

export type UseSpecializedRefineryBridgeResult = ReturnType<typeof useSpecializedRefineryBridge>;
