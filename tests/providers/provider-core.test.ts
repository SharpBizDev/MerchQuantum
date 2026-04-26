import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

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

async function createPngDataUrl(width: number, height: number) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

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
  const spod = PROVIDER_OPTIONS.find((provider) => provider.providerId === "spod");

  assert.equal(printify?.isLive, true);
  assert.equal(printful?.isLive, true);
  assert.equal(gooten?.isLive, true);
  assert.equal(apliiq?.isLive, true);
  assert.equal(spod?.isLive, true);
  assert.equal(spod?.id, "spreadconnect");
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

await run("printify import detail restores recovered artwork and legacy metadata", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({
      id: "prod-1",
      title: "Legacy Cross Shirt",
      description: "Legacy storefront description",
      tags: ["cross", "christian", "unisex"],
      visible: true,
      print_areas: [
        {
          placeholders: [
            {
              position: "front",
              images: [
                {
                  id: "upload-1",
                  src: "https://cdn.printify.test/fallback.png",
                  name: "fallback.png",
                  type: "image/png",
                  width: 1400,
                  height: 1800,
                },
              ],
            },
          ],
        },
      ],
    }),
    createResponse({
      id: "upload-1",
      file_name: "restored-art.png",
      src: "https://cdn.printify.test/restored-art.png",
      preview_url: "https://cdn.printify.test/restored-art-preview.png",
      type: "image/png",
      width: 2400,
      height: 3200,
    }),
  ]);

  const adapter = createPrintifyAdapter({ fetch: fetchFn });
  const detail = await adapter.getImportedListingDetail?.({
    credentials: { apiKey: "token" },
    storeId: "shop-1",
    sourceId: "prod-1",
  });

  assert.ok(detail);
  assert.equal(detail?.title, "Legacy Cross Shirt");
  assert.equal(detail?.description, "Legacy storefront description");
  assert.deepEqual(detail?.tags, ["cross", "christian", "unisex"]);
  assert.equal(detail?.templateDescription, "Legacy storefront description");
  assert.equal(detail?.artwork?.fileName, "restored-art.png");
  assert.equal(detail?.artwork?.url, "https://cdn.printify.test/restored-art.png");
  assert.equal(detail?.artwork?.previewUrl, "https://cdn.printify.test/restored-art-preview.png");
  assert.equal(detail?.metadata.visible, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.input || "", /\/shops\/shop-1\/products\/prod-1\.json$/);
  assert.match(calls[1]?.input || "", /\/uploads\/upload-1\.json$/);
});

await run("printify metadata sync trims payloads and publish step pushes the expected flags", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({
      id: "prod-2",
      title: "Updated Cross Tee",
      description: "Buyer-facing paragraph copy",
      tags: Array.from({ length: 20 }, (_, index) => `tag-${index + 1}`),
    }),
    createResponse({ ok: true }),
  ]);

  const adapter = createPrintifyAdapter({ fetch: fetchFn });

  const updated = await adapter.updateListingMetadata?.({
    credentials: { apiKey: "token" },
    storeId: "shop-1",
    sourceId: "prod-2",
    title: "  Updated Cross Tee  ",
    description: "  Buyer-facing paragraph copy  ",
    tags: Array.from({ length: 20 }, (_, index) => ` tag-${index + 1} `),
  });

  assert.ok(updated);
  assert.equal(updated?.title, "Updated Cross Tee");
  assert.equal(updated?.description, "Buyer-facing paragraph copy");
  assert.equal(updated?.tags.length, 20);

  const updatePayload = JSON.parse(String(calls[0]?.init?.body || "{}"));
  assert.equal(updatePayload.title, "Updated Cross Tee");
  assert.equal(updatePayload.description, "Buyer-facing paragraph copy");
  assert.equal(updatePayload.tags.length, 15);
  assert.deepEqual(updatePayload.tags.slice(0, 3), ["tag-1", "tag-2", "tag-3"]);

  await adapter.publishProduct?.({
    credentials: { apiKey: "token" },
    storeId: "shop-1",
    productId: "prod-2",
  });

  const publishPayload = JSON.parse(String(calls[1]?.init?.body || "{}"));
  assert.deepEqual(publishPayload, {
    title: true,
    description: true,
    images: true,
    variants: true,
    tags: true,
    keyFeatures: true,
    shipping_template: true,
  });
});

await run("printful import detail restores file-library artwork when available", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({
      result: {
        sync_product: {
          id: 101,
          name: "Imported Flag Shirt",
        },
        sync_variants: [
          {
            id: 900,
            variant_id: 321,
            retail_price: "24.99",
            files: [
              {
                id: 555,
                type: "front",
                url: "https://files.printful.test/front-fallback.png",
                filename: "front-fallback.png",
                width: 1800,
                height: 2400,
              },
            ],
          },
        ],
      },
    }),
    createResponse({
      result: {
        id: 555,
        url: "https://files.printful.test/front-original.png",
        filename: "front-original.png",
        preview_url: "https://files.printful.test/front-preview.png",
        mime_type: "image/png",
        width: 3600,
        height: 4800,
      },
    }),
  ]);

  const adapter = createPrintfulAdapter({ fetch: fetchFn });
  const detail = await adapter.getImportedListingDetail?.({
    credentials: { apiKey: "token" },
    storeId: "store-1",
    sourceId: "101",
  });

  assert.ok(detail);
  assert.equal(detail?.title, "Imported Flag Shirt");
  assert.equal(detail?.artwork?.fileName, "front-original.png");
  assert.equal(detail?.artwork?.url, "https://files.printful.test/front-original.png");
  assert.equal(detail?.artwork?.previewUrl, "https://files.printful.test/front-preview.png");
  assert.equal(detail?.artwork?.contentType, "image/png");
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.input || "", /\/store\/products\/101$/);
  assert.match(calls[1]?.input || "", /\/files\/555$/);
});

await run("printful draft creation pads artwork to the template placement guide before upload", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({
      result: {
        id: 888,
        filename: "normalized-upload.png",
      },
    }),
    createResponse({
      result: {
        id: 999,
        sync_product: {
          id: 999,
        },
      },
    }),
  ]);

  const adapter = createPrintfulAdapter({ fetch: fetchFn });
  const sourceImageDataUrl = await createPngDataUrl(600, 400);

  const result = await adapter.createDraftProduct({
    credentials: { apiKey: "token" },
    storeId: "store-1",
    templateId: "template-1",
    item: {
      fileName: "source-art.png",
      title: "Normalized Printful Draft",
      description: "Draft description",
      tags: ["alpha", "beta"],
      imageDataUrl: sourceImageDataUrl,
    },
    templateDetail: {
      id: "template-1",
      storeId: "store-1",
      title: "Template",
      description: "",
      placementGuide: {
        position: "front",
        width: 1800,
        height: 2400,
        source: "live",
      },
      metadata: {
        rawTemplate: {
          sync_product: {
            id: 123,
            name: "Template",
          },
          sync_variants: [
            {
              variant_id: 321,
              retail_price: "24.99",
              files: [
                {
                  type: "front",
                },
              ],
            },
          ],
        },
      },
    },
  });

  assert.equal(result.productId, "999");
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.input || "", /\/files$/);
  assert.match(calls[1]?.input || "", /\/store\/products$/);

  const uploadPayload = JSON.parse(String(calls[0]?.init?.body || "{}")) as {
    data?: string;
    filename?: string;
    visible?: boolean;
  };
  assert.equal(uploadPayload.filename, "source-art.png");
  assert.equal(uploadPayload.visible, false);
  assert.match(uploadPayload.data || "", /^data:image\/png;base64,/);

  const normalizedBase64 = String(uploadPayload.data || "").split(",")[1] || "";
  const normalizedMetadata = await sharp(Buffer.from(normalizedBase64, "base64")).metadata();
  assert.equal(normalizedMetadata.width, 1800);
  assert.equal(normalizedMetadata.height, 2400);

  const createPayload = JSON.parse(String(calls[1]?.init?.body || "{}")) as {
    sync_variants?: Array<{
      variant_id?: number;
      files?: Array<{ id?: string; type?: string }>;
    }>;
  };
  assert.equal(createPayload.sync_variants?.[0]?.variant_id, 321);
  assert.deepEqual(createPayload.sync_variants?.[0]?.files, [{ id: "888", type: "front" }]);
});

await run("printful metadata sync is title-only in this pass and rejects unsupported fields", async () => {
  const { fetchFn, calls } = createQueuedFetch([
    createResponse({
      result: {
        sync_product: {
          id: 202,
          name: "Refined Printful Title",
        },
      },
    }),
  ]);

  const adapter = createPrintfulAdapter({ fetch: fetchFn });
  const updated = await adapter.updateListingMetadata?.({
    credentials: { apiKey: "token" },
    storeId: "store-1",
    sourceId: "202",
    title: "  Refined Printful Title  ",
  });

  assert.ok(updated);
  assert.equal(updated?.title, "Refined Printful Title");
  assert.equal(updated?.description, "");
  assert.deepEqual(updated?.tags, []);

  const titlePayload = JSON.parse(String(calls[0]?.init?.body || "{}"));
  assert.deepEqual(titlePayload, {
    sync_product: {
      name: "Refined Printful Title",
    },
  });

  await assert.rejects(
    () =>
      adapter.updateListingMetadata?.({
        credentials: { apiKey: "token" },
        storeId: "store-1",
        sourceId: "202",
        description: "Should not be accepted in this pass.",
      }) ?? Promise.resolve(undefined),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "unsupported_operation");
      return true;
    }
  );
});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

