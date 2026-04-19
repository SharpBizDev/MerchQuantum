import type { ProviderId } from "./types";

export type ProviderGovernorLane = "read" | "write";

const GOVERNOR_SPACING_MS: Record<ProviderGovernorLane, number> = {
  read: 1200,
  write: 36000,
};

const laneTail = new Map<string, Promise<void>>();
const laneReadyAt = new Map<string, number>();

function getGovernorKey(providerId: ProviderId, lane: ProviderGovernorLane) {
  return `${providerId}:${lane}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runWithProviderGovernor<T>(
  providerId: ProviderId,
  lane: ProviderGovernorLane,
  operation: () => Promise<T>
) {
  const key = getGovernorKey(providerId, lane);
  const previous = laneTail.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  laneTail.set(key, gate);
  await previous.catch(() => undefined);

  try {
    const waitUntil = laneReadyAt.get(key) ?? 0;
    const delayMs = Math.max(0, waitUntil - Date.now());
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const result = await operation();
    laneReadyAt.set(key, Date.now() + GOVERNOR_SPACING_MS[lane]);
    return result;
  } finally {
    release();
    if (laneTail.get(key) === gate) {
      laneTail.delete(key);
    }
  }
}
