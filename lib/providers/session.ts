import type { ProviderCredentials, ProviderId } from "./types";

export const ACTIVE_PROVIDER_COOKIE = "mq_provider_id";
export const ACTIVE_PROVIDER_TOKEN_COOKIE = "mq_provider_token";
export const LEGACY_PRINTIFY_TOKEN_COOKIE = "printify_token";

type CookieValue = { value: string } | undefined;

type CookieStoreLike = {
  get(name: string): CookieValue;
  set(name: string, value: string, options: Record<string, unknown>): void;
};

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

function setCookie(cookieStore: CookieStoreLike, name: string, value: string, maxAge: number) {
  cookieStore.set(name, value, {
    ...BASE_COOKIE_OPTIONS,
    maxAge,
  });
}

function clearCookie(cookieStore: CookieStoreLike, name: string) {
  cookieStore.set(name, "", {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 0,
    expires: new Date(0),
  });
}

export function createProviderCredentials(apiKey: string): ProviderCredentials {
  return {
    apiKey: apiKey.trim(),
  };
}

export function readActiveProviderId(cookieStore: CookieStoreLike): ProviderId | null {
  const value = cookieStore.get(ACTIVE_PROVIDER_COOKIE)?.value?.trim();
  return value ? (value as ProviderId) : null;
}

export function setProviderSession(cookieStore: CookieStoreLike, providerId: ProviderId, credentials: ProviderCredentials) {
  setCookie(cookieStore, ACTIVE_PROVIDER_COOKIE, providerId, 60 * 60 * 24 * 7);
  setCookie(cookieStore, ACTIVE_PROVIDER_TOKEN_COOKIE, credentials.apiKey, 60 * 60 * 24 * 7);

  if (providerId === "printify") {
    setCookie(cookieStore, LEGACY_PRINTIFY_TOKEN_COOKIE, credentials.apiKey, 60 * 60 * 24 * 7);
  }
}

export function clearProviderSession(cookieStore: CookieStoreLike) {
  clearCookie(cookieStore, ACTIVE_PROVIDER_COOKIE);
  clearCookie(cookieStore, ACTIVE_PROVIDER_TOKEN_COOKIE);
  clearCookie(cookieStore, LEGACY_PRINTIFY_TOKEN_COOKIE);
}

export function readProviderCredentials(cookieStore: CookieStoreLike, providerId: ProviderId): ProviderCredentials | null {
  const genericToken = cookieStore.get(ACTIVE_PROVIDER_TOKEN_COOKIE)?.value?.trim();
  const activeProviderId = readActiveProviderId(cookieStore);
  const legacyPrintifyToken = cookieStore.get(LEGACY_PRINTIFY_TOKEN_COOKIE)?.value?.trim();

  if (genericToken && activeProviderId === providerId) {
    return createProviderCredentials(genericToken);
  }

  if (providerId === "printify" && legacyPrintifyToken) {
    return createProviderCredentials(legacyPrintifyToken);
  }

  return null;
}
