import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { publishHostedArtwork, readHostedArtwork } from "../../lib/providers/artwork";
import { ProviderError, providerErrorFromResponse } from "../../lib/providers/errors";
import { getProviderAdapter, getProviderEntry, isProviderId, listProviderEntries } from "../../lib/providers/registry";
import { createProviderCredentials, readProviderCredentials, setProviderSession, clearProviderSession } from "../../lib/providers/session";
import { createApliiqAdapter } from "../../lib/providers/apliiq/adapter";
import { PROVIDER_OPTIONS } from "../../lib/providers/client-options";
import { createProdigiAdapter } from "../../lib/providers/prodigi/adapter";
import { createPrintfulAdapter } from "../../lib/providers/printful/adapter";
import { createPrintifyAdapter } from "../../lib/providers/printify/adapter";

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

await run("provider activation options keep printify and printful live while leaving others gated", () => {
  const printify = PROVIDER_OPTIONS.find((provider) => provider.id === "printify");
  const printful = PROVIDER_OPTIONS.find((provider) => provider.id === "printful");
  const apliiq = PROVIDER_OPTIONS.find((provider) => provider.id === "apliiq");
  const gelato = PROVIDER_OPTIONS.find((provider) => provider.id === "gelato");

  assert.equal(printify?.isLive, true);
  assert.equal(printful?.isLive, true);
  assert.equal(apliiq?.isLive, true);
  assert.equal(gelato?.isLive, false);
  assert.equal(gelato?.statusText, "Coming soon");
});

await run("provider capability expansion keeps live providers on draft/store flow and direct upload", () => {
  const printify = createPrintifyAdapter();
  const printful = createPrintfulAdapter();
  const apliiq = createApliiqAdapter();
  const prodigi = createProdigiAdapter();
  const gelato = getProviderEntry("gelato");

  assert.equal(printify.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(printify.capabilities.supportsDirectUpload, true);
  assert.equal(printify.capabilities.requiresHostedArtwork, false);
  assert.equal(printify.capabilities.supportsOrderFirst, false);

  assert.equal(printful.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(printful.capabilities.supportsDirectUpload, true);
  assert.equal(printful.capabilities.requiresHostedArtwork, false);
  assert.equal(printful.capabilities.supportsOrderFirst, false);

  assert.equal(apliiq.capabilities.supportsStoreTemplateDraftFlow, true);
  assert.equal(apliiq.capabilities.supportsDirectUpload, false);
  assert.equal(apliiq.capabilities.requiresHostedArtwork, true);
  assert.equal(apliiq.capabilities.supportsOrderFirst, false);

  assert.equal(prodigi.capabilities.supportsOrderFirst, true);
  assert.equal(prodigi.capabilities.supportsOrderOnly, true);
  assert.equal(prodigi.capabilities.supportsStoreTemplateDraftFlow, false);
  assert.equal(prodigi.capabilities.requiresHostedArtwork, true);

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

await run("printify adapter validates credentials before making provider calls", async () => {
  const adapter = createPrintifyAdapter({
    fetch: async () => createResponse([], { status: 200 }),
  });

  await assert.rejects(
    () => adapter.connect({ credentials: { apiKey: "   " } }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "missing_credentials");
      return true;
    }
  );
});

await run("printify adapter connects and lists stores through the normalized contract", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse([{ id: 11, title: "Main Shop", sales_channel: "etsy" }], { status: 200 }),
  ]);
  const adapter = createPrintifyAdapter({ fetch: fetchFn });

  const result = await adapter.connect({ credentials: { apiKey: "token-1" } });

  assert.equal(result.providerId, "printify");
  assert.equal(result.stores.length, 1);
  assert.deepEqual(result.stores[0], { id: "11", name: "Main Shop", salesChannel: "etsy" });
  assert.match(calls[0].input, /\/shops\.json$/);
});

await run("printify adapter lists templates/products and normalizes summaries", async () => {
  const { fetchFn } = createQueuedFetch([
    createResponse({ data: [{ id: "prod-1", title: "Template Tee", description: "Soft tee" }] }, { status: 200 }),
  ]);
  const adapter = createPrintifyAdapter({ fetch: fetchFn });

  const products = await adapter.listTemplatesOrProducts({
    credentials: { apiKey: "token-1" },
    storeId: "shop-1",
  });

  assert.deepEqual(products, [
    {
      id: "prod-1",
      storeId: "shop-1",
      title: "Template Tee",
      description: "Soft tee",
      type: "product",
    },
  ]);
});

await run("printify adapter loads template detail and derives normalized placement guidance", async () => {
  const { fetchFn } = createQueuedFetch([
    createResponse(
      {
        id: "prod-1",
        title: "Template Tee",
        description: "Soft tee",
        blueprint_id: 6,
        print_provider_id: 99,
        variants: [{ id: 101, is_enabled: true, is_default: true }],
        print_areas: [{ variant_ids: [101], placeholders: [{ position: "front" }] }],
      },
      { status: 200 }
    ),
    createResponse(
      [{ id: 101, placeholders: [{ position: "front", width: 4000, height: 5000, decoration_method: "dtg" }] }],
      { status: 200 }
    ),
  ]);
  const adapter = createPrintifyAdapter({ fetch: fetchFn });

  const detail = await adapter.getTemplateDetail({
    credentials: { apiKey: "token-1" },
    storeId: "shop-1",
    sourceId: "prod-1",
  });

  assert.equal(detail.id, "prod-1");
  assert.equal(detail.placementGuide.position, "front");
  assert.equal(detail.placementGuide.width, 4000);
  assert.equal(detail.placementGuide.source, "live");
});

await run("printify adapter normalizes artwork upload responses", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    (_input, init) => {
      assert.ok(init?.body);
      const parsed = JSON.parse(String(init.body));
      assert.equal(parsed.file_name, "art.png");
      assert.ok(parsed.contents);
      return createResponse({ id: "upload-1" }, { status: 200 });
    },
  ]);
  const adapter = createPrintifyAdapter({ fetch: fetchFn });

  const upload = await adapter.uploadArtwork({
    credentials: { apiKey: "token-1" },
    fileName: "art.png",
    imageDataUrl: SAMPLE_PNG_DATA_URL,
  });

  assert.equal(upload.id, "upload-1");
  assert.equal(upload.fileName, "art.png");
  assert.equal(upload.providerId, "printify");
  assert.match(calls[0].input, /\/uploads\/images\.json$/);
});

await run("printify adapter creates a normalized draft product result", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({ id: "upload-1" }, { status: 200 }),
    (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.title, "Draft Title");
      assert.equal(payload.tags.length, 13);
      assert.equal(payload.print_areas.length, 1);
      return createResponse({ id: "draft-1" }, { status: 200 });
    },
  ]);
  const adapter = createPrintifyAdapter({ fetch: fetchFn });

  const result = await adapter.createDraftProduct({
    credentials: { apiKey: "token-1" },
    storeId: "shop-1",
    templateId: "prod-1",
    templateDetail: {
      id: "prod-1",
      storeId: "shop-1",
      title: "Template Tee",
      description: "Soft tee",
      placementGuide: {
        position: "front",
        width: 4000,
        height: 5000,
        source: "live",
      },
      metadata: {
        rawTemplate: {
          id: "prod-1",
          title: "Template Tee",
          blueprint_id: 6,
          print_provider_id: 99,
          variants: [{ id: 101, price: 2499, is_enabled: true, is_default: true }],
          print_areas: [
            {
              variant_ids: [101],
              placeholders: [{ position: "front", images: [{ x: 0.5, y: 0.5, scale: 1 }] }],
            },
          ],
        },
      },
    },
    item: {
      fileName: "art.png",
      title: "Draft Title",
      description: "Draft Description",
      tags: Array.from({ length: 15 }, (_, index) => `tag-${index + 1}`),
      imageDataUrl: SAMPLE_PNG_DATA_URL,
    },
  });

  assert.equal(result.providerId, "printify");
  assert.equal(result.productId, "draft-1");
  assert.equal(result.placementGuide?.position, "front");
  assert.match(calls[1].input, /\/shops\/shop-1\/products\.json$/);
});

await run("printful adapter connects and lists stores through the normalized contract", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({ code: 200, result: [{ id: 21, name: "Manual API Store", type: "api" }] }, { status: 200 }),
  ]);
  const adapter = createPrintfulAdapter({ fetch: fetchFn });

  const result = await adapter.connect({ credentials: { apiKey: "pf-token" } });

  assert.equal(result.providerId, "printful");
  assert.deepEqual(result.stores, [{ id: "21", name: "Manual API Store", salesChannel: "api" }]);
  assert.match(calls[0].input, /\/stores$/);
});

await run("printful adapter lists store products as normalized provider sources", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse(
      {
        code: 200,
        result: [{ id: 3001, name: "Legacy Tee" }],
      },
      { status: 200 }
    ),
  ]);
  const adapter = createPrintfulAdapter({ fetch: fetchFn });

  const products = await adapter.listTemplatesOrProducts({
    credentials: { apiKey: "pf-token" },
    storeId: "21",
  });

  assert.deepEqual(products, [
    {
      id: "3001",
      storeId: "21",
      title: "Legacy Tee",
      type: "sync_product",
    },
  ]);
  assert.equal((calls[0].init?.headers as Record<string, string>)["X-PF-Store-Id"], "21");
});

await run("printful adapter loads template detail and derives normalized placement guidance", async () => {
  const { fetchFn } = createQueuedFetch([
    createResponse(
      {
        code: 200,
        result: {
          sync_product: { id: 3001, name: "Legacy Tee" },
          sync_variants: [
            {
              id: 9001,
              variant_id: 4012,
              retail_price: "24.99",
              files: [{ type: "front", width: 1800, height: 2400 }],
              product: {
                id: 71,
                placements: [{ placement: "front", display_name: "Front print" }],
              },
            },
          ],
        },
      },
      { status: 200 }
    ),
    createResponse(
      {
        code: 200,
        result: {
          available_placements: { front: "Front print" },
          printfiles: [{ printfile_id: 1, width: 1800, height: 2400 }],
          variant_printfiles: [{ variant_id: 4012, placements: { front: 1 } }],
        },
      },
      { status: 200 }
    ),
  ]);
  const adapter = createPrintfulAdapter({ fetch: fetchFn });

  const detail = await adapter.getTemplateDetail({
    credentials: { apiKey: "pf-token" },
    storeId: "21",
    sourceId: "3001",
  });

  assert.equal(detail.id, "3001");
  assert.equal(detail.placementGuide.position, "front");
  assert.equal(detail.placementGuide.width, 1800);
  assert.equal(detail.placementGuide.source, "live");
  assert.deepEqual(detail.metadata.placements, ["front"]);
});

await run("printful adapter normalizes artwork upload responses", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.filename, "art.png");
      assert.ok(payload.data.startsWith("data:image/png;base64,"));
      return createResponse({ code: 200, result: { id: 777, filename: "art.png", preview_url: "https://files.example/art.png" } }, { status: 200 });
    },
  ]);
  const adapter = createPrintfulAdapter({ fetch: fetchFn });

  const upload = await adapter.uploadArtwork({
    credentials: { apiKey: "pf-token" },
    fileName: "art.png",
    imageDataUrl: SAMPLE_PNG_DATA_URL,
  });

  assert.equal(upload.id, "777");
  assert.equal(upload.fileName, "art.png");
  assert.equal(upload.providerId, "printful");
  assert.match(calls[0].input, /\/files$/);
});

await run("printful adapter creates a normalized manual-api draft product result", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({ code: 200, result: { id: 777, filename: "art.png" } }, { status: 200 }),
    (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.sync_product.name, "Printful Draft");
      assert.equal(payload.sync_variants.length, 1);
      assert.equal(payload.sync_variants[0].variant_id, 4012);
      assert.equal(payload.sync_variants[0].files[0].id, "777");
      assert.equal(payload.sync_variants[0].files[0].type, "front");
      return createResponse({ code: 200, result: { id: 9991 } }, { status: 200 });
    },
  ]);
  const adapter = createPrintfulAdapter({ fetch: fetchFn });

  const result = await adapter.createDraftProduct({
    credentials: { apiKey: "pf-token" },
    storeId: "21",
    templateId: "3001",
    templateDetail: {
      id: "3001",
      storeId: "21",
      title: "Legacy Tee",
      description: "Manual/API store product with 1 variant.",
      placementGuide: {
        position: "front",
        width: 1800,
        height: 2400,
        source: "live",
      },
      metadata: {
        rawTemplate: {
          sync_product: { id: 3001, name: "Legacy Tee" },
          sync_variants: [
            {
              id: 9001,
              variant_id: 4012,
              retail_price: "24.99",
              options: [{ id: "stitch" }],
              files: [{ type: "front" }],
            },
          ],
        },
      },
    },
    item: {
      fileName: "art.png",
      title: "Printful Draft",
      description: "Ignored upstream description",
      tags: ["one", "two"],
      imageDataUrl: SAMPLE_PNG_DATA_URL,
    },
  });

  assert.equal(result.providerId, "printful");
  assert.equal(result.productId, "9991");
  assert.equal(result.placementGuide?.position, "front");
  assert.match(calls[1].input, /\/store\/products$/);
});

await run("apliiq adapter connects through product validation and exposes one synthetic store", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({ Products: [{ Id: 162, Code: "mens_classic", DetailName: "Classic Tee" }] }, { status: 200 }),
  ]);
  const adapter = createApliiqAdapter({ fetch: fetchFn });

  const result = await adapter.connect({ credentials: { apiKey: "app-key", apiSecret: "shared-secret" } });

  assert.equal(result.providerId, "apliiq");
  assert.equal(result.stores.length, 1);
  assert.equal(result.stores[0].id, "custom-store");
  assert.match(calls[0].input, /\/api\/Product\/$/);
  const authHeader = (calls[0].init?.headers as Record<string, string>).Authorization;
  assert.ok(authHeader.startsWith("x-apliiq-auth "));
});

await run("apliiq adapter lists products as normalized provider sources", async () => {
  const { fetchFn } = createQueuedFetch([
    createResponse(
      {
        Products: [
          { Id: 162, Code: "mens_classic", DetailName: "Classic Tee", Description: "Heavyweight tee" },
          { Id: 409, Code: "mens_comfort", DetailName: "Comfort Tee", Features: "<p>Comfort weight</p>" },
        ],
      },
      { status: 200 }
    ),
  ]);
  const adapter = createApliiqAdapter({ fetch: fetchFn });

  const products = await adapter.listTemplatesOrProducts({
    credentials: { apiKey: "app-key", apiSecret: "shared-secret" },
    storeId: "custom-store",
  });

  assert.deepEqual(products, [
    {
      id: "162",
      storeId: "custom-store",
      title: "Classic Tee",
      description: "Heavyweight tee",
      type: "product",
    },
    {
      id: "409",
      storeId: "custom-store",
      title: "Comfort Tee",
      description: "<p>Comfort weight</p>",
      type: "product",
    },
  ]);
});

await run("apliiq adapter loads template detail and normalizes placement metadata", async () => {
  const { fetchFn } = createQueuedFetch([
    createResponse(
      {
        Id: 162,
        Code: "mens_classic",
        DetailName: "Classic Tee",
        Description: "<p>Heavyweight tee</p>",
        Colors: [{ Id: 50, Name: "black" }],
        Services: [{ Alt_Name: "dtgprint" }],
        Locations: [{ Id: 164, Name: "Front" }, { Id: 167, Name: "Back" }],
      },
      { status: 200 }
    ),
  ]);
  const adapter = createApliiqAdapter({ fetch: fetchFn });

  const detail = await adapter.getTemplateDetail({
    credentials: { apiKey: "app-key", apiSecret: "shared-secret" },
    storeId: "custom-store",
    sourceId: "162",
  });

  assert.equal(detail.id, "162");
  assert.equal(detail.placementGuide.position, "front");
  assert.equal(detail.placementGuide.width, 944);
  assert.equal(detail.metadata.defaultColorId, "50");
  assert.equal(detail.metadata.preferredService, "dtgprint");
});

await run("apliiq adapter uploads hosted artwork references instead of base64 payloads", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.Name, "art.png");
      assert.equal(payload.ImagePath, "https://assets.example/art.png");
      return createResponse({ Id: 5623808, Name: "art.png" }, { status: 200 });
    },
  ]);
  const adapter = createApliiqAdapter({ fetch: fetchFn });

  const upload = await adapter.uploadArtwork({
    credentials: { apiKey: "app-key", apiSecret: "shared-secret" },
    fileName: "art.png",
    imageDataUrl: SAMPLE_PNG_DATA_URL,
    hostedArtwork: {
      id: "hosted-1",
      providerId: "apliiq",
      fileName: "art.png",
      contentType: "image/png",
      byteLength: 128,
      checksum: "abc123",
      publicUrl: "https://assets.example/art.png",
      createdAt: "2026-04-02T00:00:00.000Z",
      expiresAt: "2026-04-03T00:00:00.000Z",
    },
  });

  assert.equal(upload.id, "5623808");
  assert.match(calls[0].input, /\/v1\/Artwork$/);
});

await run("apliiq adapter creates a normalized design result using hosted artwork", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({ Id: 5623808, Name: "art.png" }, { status: 200 }),
    (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.ProductId, 162);
      assert.equal(payload.ProductCode, "mens_classic");
      assert.equal(payload.ColorId, 50);
      assert.equal(payload.Locations[0].Id, 164);
      assert.equal(payload.Locations[0].ImagePath, "https://assets.example/art.png");
      assert.equal(payload.Locations[0].Artworks[0].Service, "dtgprint");
      assert.equal(payload.Locations[0].Artworks[0].Id, 5623808);
      return createResponse({ Id: 3110428, Name: "API Design" }, { status: 200 });
    },
  ]);
  const adapter = createApliiqAdapter({ fetch: fetchFn });

  const result = await adapter.createDraftProduct({
    credentials: { apiKey: "app-key", apiSecret: "shared-secret" },
    storeId: "custom-store",
    templateId: "162",
    templateDetail: {
      id: "162",
      storeId: "custom-store",
      title: "Classic Tee",
      description: "Heavyweight tee",
      placementGuide: {
        position: "front",
        width: 944,
        height: 1440,
        source: "fallback",
      },
      metadata: {
        rawTemplate: {
          Id: 162,
          Code: "mens_classic",
        },
        defaultColorId: "50",
        preferredLocation: { id: "164", name: "Front" },
        preferredService: "dtgprint",
      },
    },
    hostedArtwork: {
      id: "hosted-1",
      providerId: "apliiq",
      fileName: "art.png",
      contentType: "image/png",
      byteLength: 128,
      checksum: "abc123",
      publicUrl: "https://assets.example/art.png",
      createdAt: "2026-04-02T00:00:00.000Z",
      expiresAt: "2026-04-03T00:00:00.000Z",
    },
    item: {
      fileName: "art.png",
      title: "Apliiq Draft",
      description: "Draft description",
      tags: ["one", "two"],
      imageDataUrl: SAMPLE_PNG_DATA_URL,
    },
  });

  assert.equal(result.providerId, "apliiq");
  assert.equal(result.productId, "3110428");
  assert.match(calls[1].input, /\/v1\/Design$/);
});

await run("prodigi adapter connects through safe order listing and returns a synthetic order-first store", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({ outcome: "Ok", orders: [] }, { status: 200 }),
  ]);
  const adapter = createProdigiAdapter({ fetch: fetchFn });

  const result = await adapter.connect({ credentials: { apiKey: "prodigi-token" } });

  assert.equal(result.providerId, "prodigi");
  assert.equal(result.stores.length, 1);
  assert.equal(result.stores[0].id, "order-first");
  assert.match(calls[0].input, /\/orders\?top=25$/);
});

await run("prodigi adapter keeps storefront listing unsupported in the locked flow", async () => {
  const adapter = createProdigiAdapter();

  await assert.rejects(
    () =>
      adapter.listTemplatesOrProducts({
        credentials: { apiKey: "prodigi-token" },
        storeId: "order-first",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "unsupported_operation");
      return true;
    }
  );
});

await run("prodigi adapter loads product detail by SKU for order-first use", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse(
      {
        outcome: "Ok",
        product: {
          sku: "GLOBAL-CAN-10X10",
          description: "Canvas print",
          productDimensions: { width: 10, height: 10, units: "in" },
          printAreas: { default: { required: true } },
          variants: [{ sku: "GLOBAL-CAN-10X10" }],
        },
      },
      { status: 200 }
    ),
  ]);
  const adapter = createProdigiAdapter({ fetch: fetchFn });

  const detail = await adapter.getTemplateDetail({
    credentials: { apiKey: "prodigi-token" },
    storeId: "order-first",
    sourceId: "GLOBAL-CAN-10X10",
  });

  assert.equal(detail.id, "GLOBAL-CAN-10X10");
  assert.equal(detail.placementGuide.position, "default");
  assert.equal(detail.placementGuide.width, 10);
  assert.match(calls[0].input, /\/products\/GLOBAL-CAN-10X10$/);
});

await run("prodigi adapter passes hosted artwork through for order-first payloads", async () => {
  const adapter = createProdigiAdapter();

  const upload = await adapter.uploadArtwork({
    credentials: { apiKey: "prodigi-token" },
    fileName: "poster.png",
    imageDataUrl: SAMPLE_PNG_DATA_URL,
    hostedArtwork: {
      id: "hosted-1",
      providerId: "prodigi",
      fileName: "poster.png",
      contentType: "image/png",
      byteLength: 128,
      checksum: "abc123",
      publicUrl: "https://assets.example/poster.png",
      createdAt: "2026-04-03T00:00:00.000Z",
      expiresAt: "2026-04-04T00:00:00.000Z",
    },
  });

  assert.equal(upload.id, "https://assets.example/poster.png");
  assert.equal(upload.providerId, "prodigi");
});

await run("prodigi adapter submits and normalizes order-first operations", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.recipient.name, "Order Tester");
      return createResponse({ outcome: "Ok", id: "ord_123", status: { stage: "Received" } }, { status: 200 });
    },
    createResponse({ outcome: "Ok", orders: [{ id: "ord_123", status: { stage: "Received" }, created: "2026-04-03T00:00:00Z" }] }, { status: 200 }),
    createResponse({ outcome: "Ok", id: "ord_123", status: { stage: "Received" }, items: [{ sku: "GLOBAL-CAN-10X10" }] }, { status: 200 }),
  ]);
  const adapter = createProdigiAdapter({ fetch: fetchFn });

  const created = await adapter.submitOrder?.({
    credentials: { apiKey: "prodigi-token" },
    orderInput: {
      recipient: { name: "Order Tester" },
    },
  });
  const orders = await adapter.listOrders?.({
    credentials: { apiKey: "prodigi-token" },
  });
  const order = await adapter.getOrder?.({
    credentials: { apiKey: "prodigi-token" },
    orderId: "ord_123",
  });

  assert.equal((created as { id?: string }).id, "ord_123");
  assert.equal(orders?.[0].id, "ord_123");
  assert.equal(order?.id, "ord_123");
  assert.match(calls[0].input, /\/orders$/);
  assert.match(calls[1].input, /\/orders\?top=25$/);
  assert.match(calls[2].input, /\/orders\/ord_123$/);
});

  console.log("provider-core tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
