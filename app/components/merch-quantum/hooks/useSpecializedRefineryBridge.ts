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

  return useMemo(() => bridge, [bridge]);
}

export type UseSpecializedRefineryBridgeResult = ReturnType<typeof useSpecializedRefineryBridge>;
