import type { ProviderId } from "./types";

type ProviderErrorCode =
  | "invalid_credentials"
  | "rate_limited"
  | "not_found"
  | "validation_error"
  | "missing_credentials"
  | "missing_parameter"
  | "unsupported_operation"
  | "upstream_error";

export type ProviderErrorInit = {
  providerId: ProviderId;
  code: ProviderErrorCode;
  status: number;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export class ProviderError extends Error {
  providerId: ProviderId;
  code: ProviderErrorCode;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(init: ProviderErrorInit) {
    super(init.message);
    this.name = "ProviderError";
    this.providerId = init.providerId;
    this.code = init.code;
    this.status = init.status;
    this.retryable = init.retryable ?? false;
    this.details = init.details;
  }
}

function mapStatusToCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "validation_error";
  return "upstream_error";
}

async function readProviderErrorMessage(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text().catch(() => "");
  if (!text.trim()) return fallbackMessage;
  if (!contentType.includes("application/json")) return text.trim();

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return String(payload.error || payload.message || fallbackMessage).trim() || fallbackMessage;
  } catch {
    return text.trim() || fallbackMessage;
  }
}

export async function providerErrorFromResponse(providerId: ProviderId, response: Response, fallbackMessage: string) {
  const code = mapStatusToCode(response.status);
  const message = await readProviderErrorMessage(response, fallbackMessage);
  return new ProviderError({
    providerId,
    code,
    status: response.status,
    message,
    retryable: response.status === 429 || response.status >= 500,
  });
}

export function toProviderError(error: unknown, fallback: ProviderErrorInit) {
  if (error instanceof ProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallback.message;
  return new ProviderError({
    ...fallback,
    message,
  });
}