import type { ProviderId } from "./types";

export type ProviderErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "missing_parameter"
  | "not_found"
  | "timeout"
  | "rate_limited"
  | "unsupported_operation"
  | "upstream_error"
  | "validation_error";

type ProviderErrorOptions = {
  providerId: ProviderId;
  code: ProviderErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export class ProviderError extends Error {
  providerId: ProviderId;
  code: ProviderErrorCode;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(options: ProviderErrorOptions) {
    super(options.message);
    this.name = "ProviderError";
    this.providerId = options.providerId;
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

async function readProviderErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);

    if (payload && typeof payload === "object") {
      const candidate =
        "error" in payload
          ? payload.error
          : "message" in payload
            ? payload.message
            : "errors" in payload
              ? JSON.stringify(payload.errors)
              : "";

      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

export async function providerErrorFromResponse(
  providerId: ProviderId,
  response: Response,
  fallbackMessage: string
) {
  const message = await readProviderErrorMessage(response, fallbackMessage);

  if (response.status === 400 || response.status === 422) {
    return new ProviderError({
      providerId,
      code: "validation_error",
      status: response.status,
      message,
      details: { statusText: response.statusText },
    });
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderError({
      providerId,
      code: "invalid_credentials",
      status: response.status,
      message,
      details: { statusText: response.statusText },
    });
  }

  if (response.status === 404) {
    return new ProviderError({
      providerId,
      code: "not_found",
      status: response.status,
      message,
      details: { statusText: response.statusText },
    });
  }

  if (response.status === 429) {
    return new ProviderError({
      providerId,
      code: "rate_limited",
      status: response.status,
      retryable: true,
      message,
      details: { statusText: response.statusText },
    });
  }

  if (response.status === 408 || response.status === 504) {
    return new ProviderError({
      providerId,
      code: "timeout",
      status: response.status,
      retryable: true,
      message,
      details: { statusText: response.statusText },
    });
  }

  return new ProviderError({
    providerId,
    code: "upstream_error",
    status: response.status,
    retryable: response.status >= 500,
    message,
    details: { statusText: response.statusText },
  });
}

export function toProviderError(
  error: unknown,
  fallback: Omit<ProviderErrorOptions, "message"> & { message?: string }
) {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProviderError({
      ...fallback,
      code: "timeout",
      status: 504,
      retryable: true,
      message: fallback.message || "The provider took too long to respond.",
    });
  }

  return new ProviderError({
    ...fallback,
    message: error instanceof Error ? error.message : fallback.message || "Provider request failed.",
  });
}
