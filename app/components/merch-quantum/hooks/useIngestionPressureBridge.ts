'use client';

import { useEffect } from "react";
import type { JobGraphSnapshot } from "../../../../lib/services/ingestion/JobGraph";
import type { UseAmbientStreamsResult } from "./useAmbientStreams";

function buildAmbientMetadata(snapshot: JobGraphSnapshot) {
  return {
    jsonrpc: "2.0",
    method: "ambient.frame",
    params: {
      sequence: snapshot.eventSequence,
      timestamp_epoch_ms: Date.now(),
      payload: {
        amplitude_vector: snapshot.pressureAmplitudeVector,
        orb_pulse_intensity: snapshot.orbPulseIntensity,
        fallback_signal: snapshot.fallbackSignal,
        summon_without_focus: snapshot.summonWithoutFocus,
      },
    },
  };
}

export function useIngestionPressureBridge(snapshot: JobGraphSnapshot, ambientStreams: UseAmbientStreamsResult) {
  const { pushFrame } = ambientStreams;

  useEffect(() => {
    pushFrame({
      channel: "ingestion-pressure",
      payload: null,
      metadata: buildAmbientMetadata(snapshot),
    });
  }, [pushFrame, snapshot.eventSequence, snapshot.orbPulseIntensity, snapshot.fallbackSignal, snapshot.pressureAmplitudeVector]);
}


