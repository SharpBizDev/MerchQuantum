import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { publishHostedArtwork, readHostedArtwork } from "../../lib/providers/artwork";
import { createGootenAdapter } from "../../lib/providers/gooten/adapter";
import { ProviderError, providerErrorFromResponse } from "../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId, listProviderEntries } from "../../lib/providers/registry";
import { createProviderCredentials, readProviderCredentials, setProviderSession, clearProviderSession } from "../../lib/providers/session";
import { createApliiqAdapter } from "../../lib/providers/apliiq/adapter";
import { PROVIDER_OPTIONS } from "../../lib/providers/client-options";
import { createProdigiAdapter } from "../../lib/providers/prodigi/adapter";
import { createPrintfulAdapter } from "../../lib/providers/printful/adapter";
import { createPrintifyAdapter } from "../../lib/providers/printify/adapter";
import { createSpodAdapter } from "../../lib/providers/spod/adapter";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=";

function createResponse(body: unknown, init: ResponseInit = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(payload, {
    headers: {
      "content-type": typeof body === "string" ? "text/plain" : "application/json",
    },
    ...init,
  });
}

function createQueuedFetch(responses: Array<Response | ((input: string, init?: RequestInit) => Response | Promise<Response>)>) {
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ input: url, init });

    const next = responses.shift();
    assert.ok(next, `No mock response left for ${url}`);

    return typeof next === "function" ? await next(url, init) : next;
  };

  return {
    fetchFn: fetchFn as typeof fetch,
    calls,
  };
}

function createCookieStore() {
  const values = new Map<string, string>();

  return {
    get(name: string) {
      const value = values.get(name);
      return value ? { value } : undefined;
    },
    set(name: string, value: string) {
      if (!value) {
        values.delete(name);
        return;
      }

      values.set(name, value);
    },
  };
}

async function run(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`PASS ${name}`);
}

async function main() {
await run("provider registry exposes printify and guards unsupported providers", () => {
  assert.equal(isProviderId("printify"), true);
  assert.equal(isProviderId("unknown"), false);
  assert.equal(getProviderEntry("printify")?.implemented, true);
  assert.equal(getProviderEntry("printful")?.implemented, true);
  assert.ok(listProviderEntries().some((entry) => entry.id === "printify"));
  assert.ok(listProviderEntries().some((entry) => entry.id === "printful"));

  assert.throws(() => getProviderAdapter("gelato"), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "unsupported_operation");
    return true;
  });
});

await run("provider activation options expose only supported locked-frontend providers", () => {
  const printify = PROVIDER_OPTIONS.find((provider) => provider.id === "printify");
  const printful = PROVIDER_OPTIONS.find((provider) => provider.id === "printful");
  const gooten = PROVIDER_OPTIONS.find((provider) => provider.id === "gooten");
  const apliiq = PROVIDER_OPTIONS.find((provider) => provider.id === "apliiq");
  const gelato = PROVIDER_OPTIONS.find((provider) => provider.id === "gelato");
  const prodigi = PROVIDER_OPTIONS.find((provider) => provider.id === "prodigi");
  const lulu = PROVIDER_OPTIONS.find((provider) => provider.id === "lulu_direct");
  const spod = PROVIDER_OPTIONS.find((provider) => provider.id === "spod");

  assert.equal(printify?.isLive, true);
  assert.equal(printful?.isLive, true);
  assert.equal(gooten?.isLive, true);
  assert.equal(apliiq?.isLive, true);
  assert.equal(spod?.isLive, true);
  assert.equal(gelato, undefined);
  assert.equal(prodigi, undefined);
  assert.equal(lulu, undefined);
});

await run("provider capability expansion keeps live providers on draft/store flow and direct upload", () => {
  const printify = createPrintifyAdapter();
  const printful = createPrintfulAdapter();
  const gooten = createGootenAdapter();
  const apliiq = createApliiqAdapter();
  const prodigi = createProdigiAdapter();
  const spod = createSpodAdapter();
  const gelato = getProviderEntry("gelato");

  assert.equal(printify.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(printify.capabilities.supportsDirectUpload, true);
  assert.equal(printify.capabilities.requiresHostedArtwork, false);
  assert.equal(printify.capabilities.supportsOrderFirst, false);

  assert.equal(printful.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(printful.capabilities.supportsDirectUpload, true);
  assert.equal(printful.capabilities.requiresHostedArtwork, false);
  assert.equal(printful.capabilities.supportsOrderFirst, false);

  assert.equal(gooten.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(gooten.capabilities.supportsDirectUpload, false);
  assert.equal(gooten.capabilities.requiresHostedArtwork, true);
  assert.equal(gooten.capabilities.supportsOrderFirst, false);

  assert.equal(apliiq.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(apliiq.capabilities.supportsDirectUpload, false);
  assert.equal(apliiq.capabilities.requiresHostedArtwork, true);
  assert.equal(apliiq.capabilities.supportsOrderFirst, false);

  assert.equal(prodigi.capabilities.supportsOrderFirst, true);
  assert.equal(prodigi.capabilities.supportsOrderOnly, true);
  assert.equal(prodigi.capabilities.supportsStoreTemplateDraftFlow, false);
  assert.equal(prodigi.capabilities.requiresHostedArtwork, true);

  assert.equal(spod.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(spod.capabilities.supportsDirectUpload, true);
  assert.equal(spod.capabilities.requiresHostedArtwork, false);
  assert.equal(spod.capabilities.supportsOrderFirst, false);

  assert.equal(gelato?.capabilities.requiresHostedArtwork, false);
  assert.equal(gelato?.capabilities.supportsDirectUpload, false);
  assert.equal(gelato?.capabilities.supportsOrderFirst, false);
  assert.equal(gelato?.capabilities.supportsStoreTemplateDraftFlow, false);
});

await run("provider session helpers preserve active provider and legacy printify token compatibility", () => {
  const cookieStore = createCookieStore();
  const credentials = createProviderCredentials("  secret-token  ");
  const pairCredentials = createProviderCredentials("  app-key:shared-secret  ");

  setProviderSession(cookieStore, "printify", credentials);
  assert.deepEqual(readProviderCredentials(cookieStore, "printify"), { apiKey: "secret-token" });

  clearProviderSession(cookieStore);
  assert.equal(readProviderCredentials(cookieStore, "printify"), null);

  setProviderSession(cookieStore, "apliiq", pairCredentials);
  assert.deepEqual(readProviderCredentials(cookieStore, "apliiq"), { apiKey: "app-key", apiSecret: "shared-secret" });
});

await run("hosted artwork bridge publishes and reloads normalized hosted references", async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "mq-artwork-test-"));
  try {
    const hosted = await publishHostedArtwork({
      providerId: "printify",
      fileName: "art.png",
      imageDataUrl: SAMPLE_PNG_DATA_URL,
      publicBaseUrl: "https://example.com",
      storageDir,
    });

    assert.equal(hosted.providerId, "printify");
    assert.equal(hosted.fileName, "art.png");
    assert.match(hosted.publicUrl, /^https:\/\/example\.com\/api\/providers\/artwork\//);
    assert.equal(hosted.contentType, "image/png");
    assert.ok(hosted.byteLength > 0);

    const loaded = await readHostedArtwork(hosted.id, {
      publicBaseUrl: "https://example.com",
      storageDir,
    });

    assert.ok(loaded);
    assert.equal(loaded?.checksum, hosted.checksum);
    assert.equal(loaded?.contentType, "image/png");
    assert.equal(loaded?.buffer.toString("base64"), SAMPLE_PNG_DATA_URL.split(",")[1]);
  } finally {
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

await run("provider error normalization maps upstream status codes cleanly", async () => {
  const unauthorized = await providerErrorFromResponse(
    "printify",
    createResponse({ error: "bad token" }, { status: 401, statusText: "Unauthorized" }),
    "fallback"
  );
  assert.equal(unauthorized.code, "invalid_credentials");
  assert.equal(unauthorized.status, 401);

  const rateLimited = await providerErrorFromResponse(
    "printify",
    createResponse({ message: "slow down" }, { status: 429, statusText: "Too Many Requests" }),
    "fallback"
  );
  assert.equal(rateLimited.code, "rate_limited");
  assert.equal(rateLimited.retryable, true);
});

