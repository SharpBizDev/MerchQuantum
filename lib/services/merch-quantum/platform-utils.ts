import { getUserFacingErrorMessage, logErrorToConsole, type UserFacingErrorKind } from "../../user-facing-errors";

const PROVIDER_TOKEN_STORAGE_PREFIX = "merchQuantumApiKey";
export const WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY = "mq-workspace-selection-condensed";
const REQUEST_TIMEOUT_MS = 45000;

export function getStoredWorkspaceSelectionCondensed() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY) !== "0";
}

export function normalizeRef(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.findIndex((segment) => segment.toLowerCase() === "products");
    return idx >= 0 && segments[idx + 1]
      ? segments[idx + 1]
      : segments[segments.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}

export function maskTokenCompact(value: string) {
  const s = value.trim();
  if (!s) return "";
  return `••••${s.slice(-4)}`;
}

export function getProviderTokenStorageKey(providerId: string | null | undefined) {
  if (!providerId) return null;
  return `${PROVIDER_TOKEN_STORAGE_PREFIX}:${providerId}`;
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiError(kind: UserFacingErrorKind, error: unknown, context: string) {
  logErrorToConsole(context, error);
  return getUserFacingErrorMessage(kind);
}

export async function parseResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { error: text || `Request failed with status ${response.status}.` };
}