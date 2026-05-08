import type { ProviderId } from "./types";

export async function runWithProviderGovernor<T>(
  _providerId: ProviderId,
  _operation: "read" | "write",
  task: () => Promise<T>
): Promise<T> {
  return task();
}