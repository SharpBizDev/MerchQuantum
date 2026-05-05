import type { MutableRefObject } from "react";

type AmbientFrameLike = {
  metadata?: Record<string, unknown>;
} | null;

export type AmbientVisualSignal = {
  amplitudeVector: number[];
  orbPulseIntensity: number;
  fallbackSignal: boolean;
  sequence: number;
  timestampEpochMs: number;
};

const EMPTY_SIGNAL: AmbientVisualSignal = {
  amplitudeVector: Array.from({ length: 32 }, () => 0),
  orbPulseIntensity: 0,
  fallbackSignal: false,
  sequence: 0,
  timestampEpochMs: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAmplitudeVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return EMPTY_SIGNAL.amplitudeVector;
  }

  const next = value.slice(0, 32).map((entry) => {
    const parsed = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(1, parsed));
  });

  while (next.length < 32) {
    next.push(0);
  }

  return next;
}

export function readAmbientVisualSignal(frame: AmbientFrameLike): AmbientVisualSignal {
  if (!frame?.metadata || !isRecord(frame.metadata)) {
    return EMPTY_SIGNAL;
  }

  const params = isRecord(frame.metadata.params) ? frame.metadata.params : null;
  const payload = params && isRecord(params.payload) ? params.payload : null;

  const orbPulseIntensity = payload && typeof payload.orb_pulse_intensity === "number"
    ? Math.max(0, Math.min(1, payload.orb_pulse_intensity))
    : 0;

  return {
    amplitudeVector: normalizeAmplitudeVector(payload?.amplitude_vector),
    orbPulseIntensity,
    fallbackSignal: payload?.fallback_signal === true,
    sequence: typeof params?.sequence === "number" ? params.sequence : 0,
    timestampEpochMs: typeof params?.timestamp_epoch_ms === "number" ? params.timestamp_epoch_ms : 0,
  };
}

export function readAmbientVisualSignalFromRef(frameRef: MutableRefObject<AmbientFrameLike>) {
  return readAmbientVisualSignal(frameRef.current);
}
