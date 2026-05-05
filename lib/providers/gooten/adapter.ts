import crypto from "node:crypto";

import type { ProviderAdapter, ProviderAdapterContext, ProviderArtworkContext } from "../contracts";
import { ProviderError, providerErrorFromResponse, toProviderError } from "../errors";
import type {
  DraftProductResult,
  HostedArtworkReference,
  NormalizedArtworkUpload,
  NormalizedPlacementGuide,
  NormalizedStore,
  NormalizedTemplateDetail,
  NormalizedTemplateSummary,
  ProviderCapabilities,
} from "../types";

const GOOTEN_API_BASE = "https://api.print.io";
const GOOTEN_PREVIEW_API_BASE = "https://previews.gooten.com";
const GOOTEN_CATALOG_URL = "https://gtnadminassets.blob.core.windows.net/productdatav3/catalog.json";
const PROVIDER_TIMEOUT_MS = 90000;
const USER_AGENT = "MerchQuantum";
const GOOTEN_SYNTHETIC_STORE_ID = "gooten-catalog";
const DEFAULT_COUNTRY_CODE = "US";
const DEFAULT_PLACEMENT_GUIDE: NormalizedPlacementGuide = {
  position: "default",
  width: 1800,
  height: 2400,
  source: "fallback",
};

type GootenAdapterOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
  previewApiBase?: string;
  catalogUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type GootenCatalogRoot = {
  "product-catalog"?: Array<{
    name?: string;
    items?: GootenCatalogEntry[];
  }>;
};

type GootenCatalogEntry = {
  product_id?: number | string;
  staging_product_id?: number | string;
  name?: string;
  meta_description?: string;
  meta_title?: string;
  url?: string;
  type?: string;
  deprecated?: boolean;
};

type GootenVariantOption = {
  Name?: string;
  Value?: string;
};

type GootenProductVariant = {
  Options?: GootenVariantOption[];
  PriceInfo?: {
    Price?: number;
    CurrencyCode?: string;
  };
  Sku?: string;
  MaxImages?: number;
  HasTemplates?: boolean;
};

type GootenProductVariantsPayload = {
  ProductVariants?: GootenProductVariant[];
};

type GootenTemplateLayer = {
  Id?: string;
  Type?: string;
  Description?: string;
  X1?: number;
  X2?: number;
  Y1?: number;
  Y2?: number;
};

type GootenTemplateSpace = {
  Id?: string;
  Description?: string;
  FinalX1?: number;
  FinalX2?: number;
  FinalY1?: number;
  FinalY2?: number;
  Layers?: GootenTemplateLayer[];
};

type GootenTemplateOption = {
  Name?: string;
  IsDefault?: boolean;
  Spaces?: GootenTemplateSpace[];
};

type GootenProductTemplatesPayload = {
  Options?: GootenTemplateOption[];
};

type GootenPreviewTemplate = {
  name?: string;
  width?: number;
  height?: number;
  areas?: Array<{
    sku?: string;
    width?: number;
    height?: number;
    layerId?: string;
    spaceId?: string;
  }>;
};

type GootenPreviewTemplatesPayload = {
  templates?: GootenPreviewTemplate[];
  error?: boolean;
  errors?: Array<{ message?: string }>;
};

type GootenPreconfiguredProductsResponse = {
  HadError?: boolean;
  Errors?: Array<{
    PropertyName?: string;
    ErrorMessage?: string;
    AttemptedValue?: unknown;
  }>;
  ErrorReferenceCode?: string;
};

export const GOOTEN_CAPABILITIES: ProviderCapabilities = {
  supportsStores: true,
  supportsTemplates: true,
  supportsProductDrafts: true,
  supportsMockups: true,
  supportsWebhooks: false,
  supportsOrderOnly: false,
  supportsPublishStep: false,
  supportsMultiplePlacements: false,
  requiresHostedArtwork: true,
  supportsDirectUpload: false,
  supportsOrderFirst: false,
  supportsStoreTemplateDraftFlow: true,
};

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSyntheticStore(recipeId: string): NormalizedStore {
  const suffix = recipeId.trim().slice(-6);
  return {
    id: GOOTEN_SYNTHETIC_STORE_ID,
    name: suffix ? `Gooten Catalog ${suffix}` : "Gooten Catalog",
    salesChannel: "gooten_catalog",
  };
}

function chooseVariant(payload: GootenProductVariantsPayload) {
  const variants = Array.isArray(payload.ProductVariants) ? payload.ProductVariants : [];
  return (
    variants.find((variant) => variant.HasTemplates && /graphics/i.test(JSON.stringify(variant.Options || []))) ||
    variants.find((variant) => variant.HasTemplates) ||
    variants[0]
  );
}

function chooseTemplateOption(payload: GootenProductTemplatesPayload) {
  const options = Array.isArray(payload.Options) ? payload.Options : [];
  return options.find((option) => option.IsDefault) || options[0];
}

function chooseTemplateSpace(option: GootenTemplateOption | undefined) {
  const spaces = Array.isArray(option?.Spaces) ? option?.Spaces : [];
  return spaces.find((space) => Array.isArray(space.Layers) && space.Layers.some((layer) => layer.Type === "Image")) || spaces[0];
}

function buildPlacementGuide(space: GootenTemplateSpace | undefined, previewPayload: GootenPreviewTemplatesPayload | null) {
  const previewArea = Array.isArray(previewPayload?.templates)
    ? previewPayload.templates.flatMap((template) => template.areas || []).find((area) => area.width && area.height)
    : undefined;

  if (previewArea?.width && previewArea?.height) {
    return {
      position: String(space?.Description || previewArea.spaceId || space?.Id || DEFAULT_PLACEMENT_GUIDE.position),
      width: previewArea.width,
      height: previewArea.height,
      source: "live" as const,
    };
  }

  const width = Math.max(1, Number(space?.FinalX2 || 0) - Number(space?.FinalX1 || 0));
  const height = Math.max(1, Number(space?.FinalY2 || 0) - Number(space?.FinalY1 || 0));

  if (width > 1 && height > 1) {
    return {
      position: String(space?.Description || space?.Id || DEFAULT_PLACEMENT_GUIDE.position),
      width,
      height,
      source: "fallback" as const,
    };
  }

  return DEFAULT_PLACEMENT_GUIDE;
}

function createHostedArtworkUpload(fileName: string, hostedArtwork?: HostedArtworkReference) {
  if (!hostedArtwork?.publicUrl) {
    throw new ProviderError({
      providerId: "gooten",
      code: "validation_error",
      status: 400,
      message: "Gooten requires hosted artwork URLs for print-ready product creation.",
    });
  }

  return {
    id: hostedArtwork.id || crypto.createHash("sha1").update(hostedArtwork.publicUrl).digest("hex"),
    fileName,
    providerId: "gooten",
  } satisfies NormalizedArtworkUpload;
}

function buildPreconfiguredSku(baseSku: string, fileName: string) {
  const normalizedBase = baseSku.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "GOOTEN";
  const normalizedFile = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 24) || "ART";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `MQ_${normalizedBase}_${normalizedFile}_${suffix}`.slice(0, 96);
}

export function createGootenAdapter(options: GootenAdapterOptions = {}): ProviderAdapter {
  const fetchFn = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? GOOTEN_API_BASE;
  const previewApiBase = options.previewApiBase ?? GOOTEN_PREVIEW_API_BASE;
  const catalogUrl = options.catalogUrl ?? GOOTEN_CATALOG_URL;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const userAgent = options.userAgent ?? USER_AGENT;

  async function fetchWithTimeout(url: string, init?: RequestInit, requestTimeoutMs = timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      return await fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function getCredentials(context: ProviderAdapterContext) {
    const recipeId = context.credentials.apiKey.trim();
    const partnerBillingKey = context.credentials.apiSecret?.trim();

    if (!recipeId || !partnerBillingKey) {
      throw new ProviderError({
        providerId: "gooten",
        code: "missing_credentials",
        status: 401,
        message: "Gooten requires recipeId:partnerBillingKey in the existing provider credential field.",
      });
    }

    return { recipeId, partnerBillingKey };
  }

  async function requestJson<T>(
    url: string,
    providerId: "gooten",
    fallbackMessage: string,
    init?: RequestInit
  ) {
    const response = await fetchWithTimeout(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await providerErrorFromResponse(providerId, response, fallbackMessage);
    }

    return (await response.json()) as T;
  }

  async function listCatalogProducts() {
    const payload = await requestJson<GootenCatalogRoot>(catalogUrl, "gooten", "Unable to load the Gooten product catalog.");
    const groups = Array.isArray(payload["product-catalog"]) ? payload["product-catalog"] : [];
    const products = groups.flatMap((group) => Array.isArray(group.items) ? group.items : []);

    return products.filter((item) => item.type === "product" && item.deprecated !== true && item.product_id != null);
  }

  async function getPreviewTemplates(context: ProviderAdapterContext, sku?: string) {
    const { recipeId, partnerBillingKey } = getCredentials(context);
    const path = sku
      ? `${previewApiBase}/api/v/2/templates/for-sku/${encodeURIComponent(sku)}?recipeId=${encodeURIComponent(recipeId)}&partnerBillingKey=${encodeURIComponent(partnerBillingKey)}&strict=true`
      : `${previewApiBase}/api/v/2/templates?recipeId=${encodeURIComponent(recipeId)}&partnerBillingKey=${encodeURIComponent(partnerBillingKey)}&strict=true`;

    const payload = await requestJson<GootenPreviewTemplatesPayload>(
      path,
      "gooten",
      "Unable to load Gooten pro preview templates."
    );

    if (payload.error) {
      const message = payload.errors?.map((error) => error.message).filter(Boolean).join(" | ") || "Unable to load Gooten pro preview templates.";
      throw new ProviderError({
        providerId: "gooten",
        code: "validation_error",
        status: 422,
        message,
      });
    }

    return payload;
  }

  async function getProductVariants(context: ProviderAdapterContext, productId: string) {
    const { recipeId } = getCredentials(context);
    return await requestJson<GootenProductVariantsPayload>(
      `${apiBase}/api/v/5/source/api/productvariants/?recipeId=${encodeURIComponent(recipeId)}&countryCode=${encodeURIComponent(DEFAULT_COUNTRY_CODE)}&productId=${encodeURIComponent(productId)}`,
      "gooten",
      "Unable to load Gooten product variants."
    );
  }

  async function getProductTemplates(context: ProviderAdapterContext, sku: string) {
    const { recipeId } = getCredentials(context);
    return await requestJson<GootenProductTemplatesPayload>(
      `${apiBase}/api/v/5/source/api/producttemplates/?recipeId=${encodeURIComponent(recipeId)}&sku=${encodeURIComponent(sku)}`,
      "gooten",
      "Unable to load Gooten product templates."
    );
  }

  return {
    id: "gooten",
    displayName: "Gooten",
    capabilities: GOOTEN_CAPABILITIES,

    async connect(context) {
      try {
        await getPreviewTemplates(context);
        return {
          providerId: this.id,
          displayName: this.displayName,
          capabilities: this.capabilities,
          stores: [buildSyntheticStore(context.credentials.apiKey)],
        };
      } catch (error) {
        throw toProviderError(error, {
          providerId: "gooten",
          code: "upstream_error",
          status: 500,
          message: "Unable to connect to Gooten.",
        });
      }
    },

    async listStores(context) {
      await getPreviewTemplates(context);
      return [buildSyntheticStore(context.credentials.apiKey)];
    },

    async listTemplatesOrProducts(context) {
      if (!context.storeId.trim()) {
        throw new ProviderError({
          providerId: "gooten",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const products = await listCatalogProducts();
      return products.map((product) => ({
        id: String(product.product_id),
        storeId: context.storeId,
        title: String(product.name || product.meta_title || "Gooten Product").trim() || "Gooten Product",
        description: stripHtml(String(product.meta_description || "")),
        type: "catalog_product",
      })) satisfies NormalizedTemplateSummary[];
    },

    async getTemplateDetail(context) {
      if (!context.storeId.trim()) {
        throw new ProviderError({
          providerId: "gooten",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const products = await listCatalogProducts();
      const product = products.find((entry) => String(entry.product_id) === context.sourceId.trim());
      if (!product?.product_id) {
        throw new ProviderError({
          providerId: "gooten",
          code: "not_found",
          status: 404,
          message: "Unable to find the selected Gooten catalog product.",
        });
      }

      const variantsPayload = await getProductVariants(context, String(product.product_id));
      const variant = chooseVariant(variantsPayload);
      const sku = String(variant?.Sku || "").trim();
      if (!sku) {
        throw new ProviderError({
          providerId: "gooten",
          code: "not_found",
          status: 404,
          message: "Unable to resolve a Gooten SKU for the selected product.",
        });
      }

      const templatesPayload = await getProductTemplates(context, sku);
      const templateOption = chooseTemplateOption(templatesPayload);
      const templateSpace = chooseTemplateSpace(templateOption);
      const previewPayload = await getPreviewTemplates(context, sku).catch(() => null);
      const placementGuide = buildPlacementGuide(templateSpace, previewPayload);

      return {
        id: String(product.product_id),
        storeId: context.storeId,
        title: String(product.name || product.meta_title || "Gooten Product").trim() || "Gooten Product",
        description: stripHtml(String(product.meta_description || "")),
        placementGuide,
        metadata: {
          productId: Number(product.product_id),
          stagingProductId: product.staging_product_id,
          sku,
          templateName: String(templateOption?.Name || "Single"),
          spaceId: String(templateSpace?.Id || ""),
          spaceDescription: String(templateSpace?.Description || ""),
          price: variant?.PriceInfo?.Price,
          currency: variant?.PriceInfo?.CurrencyCode,
          maxImages: variant?.MaxImages,
          previewTemplates: previewPayload?.templates || [],
        },
      } satisfies NormalizedTemplateDetail;
    },

    async uploadArtwork(context: ProviderArtworkContext) {
      try {
        return createHostedArtworkUpload(context.fileName, context.hostedArtwork);
      } catch (error) {
        throw toProviderError(error, {
          providerId: "gooten",
          code: "upstream_error",
          status: 500,
          message: "Unable to normalize Gooten hosted artwork.",
        });
      }
    },

    async createDraftProduct(context) {
      try {
        const templateDetail =
          context.templateDetail && context.templateDetail.id === context.templateId
            ? context.templateDetail
            : await this.getTemplateDetail({
                credentials: context.credentials,
                storeId: context.storeId,
                sourceId: context.templateId,
              });

        const metadata = templateDetail.metadata || {};
        const hostedArtwork = context.hostedArtwork;
        if (!hostedArtwork?.publicUrl) {
          throw new ProviderError({
            providerId: "gooten",
            code: "validation_error",
            status: 400,
            message: "Gooten draft creation requires a hosted artwork URL.",
          });
        }

        const recipeId = getCredentials(context).recipeId;
        const productId = Number(metadata.productId);
        const variantSku = String(metadata.sku || "").trim();
        const templateName = String(metadata.templateName || "Single").trim();
        const spaceId = String(metadata.spaceId || "").trim();
        const spaceDescription = String(metadata.spaceDescription || "").trim();
        const preconfiguredSku = buildPreconfiguredSku(variantSku, context.item.fileName);

        if (!Number.isFinite(productId) || !variantSku || !spaceId) {
          throw new ProviderError({
            providerId: "gooten",
            code: "validation_error",
            status: 422,
            message: "Gooten template metadata is incomplete for print-ready product creation.",
          });
        }

        const payload = {
          Sku: preconfiguredSku,
          Name: context.item.title,
          Description: context.item.description,
          Items: [
            {
              ProductId: productId,
              ProductVariantSku: variantSku,
              TemplateName: templateName,
              Preconfigurations: [
                {
                  SpaceId: spaceId,
                  ...(spaceDescription ? { SpaceDesc: spaceDescription } : {}),
                  Url: hostedArtwork.publicUrl,
                },
              ],
            },
          ],
          Images: [
            {
              Url: hostedArtwork.publicUrl,
              Index: 0,
            },
          ],
        };

        const response = await requestJson<GootenPreconfiguredProductsResponse>(
          `${apiBase}/api/v/1/source/api/preconfiguredproducts/?recipeid=${encodeURIComponent(recipeId)}`,
          "gooten",
          "Unable to create a Gooten print-ready product.",
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );

        if (response.HadError) {
          const message =
            response.Errors?.map((error) => `${error.PropertyName || "Request"}: ${error.ErrorMessage || "Unknown error"}`).join(" | ") ||
            "Unable to create a Gooten print-ready product.";

          throw new ProviderError({
            providerId: "gooten",
            code: "validation_error",
            status: 422,
            message,
            details: {
              errorReferenceCode: response.ErrorReferenceCode,
            },
          });
        }

        return {
          providerId: "gooten",
          fileName: context.item.fileName,
          title: context.item.title,
          productId: preconfiguredSku,
          message: "Created Gooten print-ready product.",
          placementGuide: templateDetail.placementGuide,
        } satisfies DraftProductResult;
      } catch (error) {
        throw toProviderError(error, {
          providerId: "gooten",
          code: "upstream_error",
          status: 500,
          message: "Unable to create a Gooten print-ready product.",
        });
      }
    },
  };
}
