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

const SPOD_API_BASE = "https://api.spreadconnect.app";
const PROVIDER_TIMEOUT_MS = 90000;
const USER_AGENT = "MerchQuantum";
const DEFAULT_PLACEMENT_GUIDE: NormalizedPlacementGuide = {
  position: "FULL_FRONT",
  width: 1800,
  height: 2400,
  source: "fallback",
};

type SpodAdapterOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type SpodAuthPayload = {
  merchantId?: number | string;
  pointOfSaleId?: number | string;
  pointOfSaleName?: string;
  pointOfSaleType?: string;
};

type SpodProductType = {
  id?: number | string;
  customerName?: string;
  customerDescription?: string;
  merchantName?: string;
  merchantDescription?: string;
  brand?: string;
  sizes?: Array<{
    id?: number | string;
    name?: string;
  }>;
  appearances?: Array<{
    id?: number | string;
    name?: string;
  }>;
  views?: string[];
  price?: number;
  currency?: string;
};

type SpodViewsPayload = {
  views?: Array<{
    name?: string;
    id?: string;
    hotspots?: Array<{
      name?: string;
    }>;
    images?: Array<{
      appearanceId?: string;
      image?: string;
    }>;
  }>;
};

type SpodStockPayload = {
  variants?: Array<{
    appearanceId?: string;
    sizeId?: string;
    stock?: number;
  }>;
};

type SpodHotspotsPayload = {
  hotspots?: Array<{
    name?: string;
  }>;
};

type SpodDesignUploadPayload = {
  designId?: string;
};

export const SPOD_CAPABILITIES: ProviderCapabilities = {
  supportsStores: true,
  supportsTemplates: true,
  supportsProductDrafts: true,
  supportsMockups: false,
  supportsWebhooks: false,
  supportsOrderOnly: false,
  supportsPublishStep: false,
  supportsMultiplePlacements: false,
  requiresHostedArtwork: false,
  supportsDirectUpload: true,
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

function coerceId(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}

function normalizeViewName(value: string | undefined) {
  return String(value || "FRONT")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

function choosePreferredView(views: SpodViewsPayload["views"]) {
  const entries = Array.isArray(views) ? views : [];
  return (
    entries.find((view) => /front/i.test(String(view.name || ""))) ||
    entries.find((view) => /chest/i.test(String(view.name || ""))) ||
    entries[0]
  );
}

function choosePreferredHotspot(view: NonNullable<SpodViewsPayload["views"]>[number] | undefined) {
  const hotspots = Array.isArray(view?.hotspots) ? view.hotspots : [];
  return (
    hotspots.find((hotspot) => /full.*front/i.test(String(hotspot.name || ""))) ||
    hotspots.find((hotspot) => /center/i.test(String(hotspot.name || ""))) ||
    hotspots.find((hotspot) => /left.*chest/i.test(String(hotspot.name || ""))) ||
    hotspots[0]
  );
}

function choosePreferredStockVariant(detail: SpodProductType, stockPayload: SpodStockPayload | null) {
  const stockVariants = Array.isArray(stockPayload?.variants) ? stockPayload?.variants : [];
  const stocked = stockVariants.filter((variant) => Number(variant.stock || 0) > 0);
  const preferredSizeId =
    detail.sizes?.find((size) => /^M$/i.test(String(size.name || "")))?.id ??
    detail.sizes?.find((size) => /^L$/i.test(String(size.name || "")))?.id ??
    detail.sizes?.[0]?.id;
  const preferredAppearanceId =
    detail.appearances?.find((appearance) => /^black$/i.test(String(appearance.name || "")))?.id ??
    detail.appearances?.find((appearance) => /^white$/i.test(String(appearance.name || "")))?.id ??
    detail.appearances?.[0]?.id;

  return (
    stocked.find(
      (variant) =>
        String(variant.sizeId || "") === String(preferredSizeId || "") &&
        String(variant.appearanceId || "") === String(preferredAppearanceId || "")
    ) ||
    stocked.find((variant) => String(variant.sizeId || "") === String(preferredSizeId || "")) ||
    stocked.find((variant) => String(variant.appearanceId || "") === String(preferredAppearanceId || "")) ||
    stocked[0] || {
      sizeId: preferredSizeId != null ? String(preferredSizeId) : "",
      appearanceId: preferredAppearanceId != null ? String(preferredAppearanceId) : "",
    }
  );
}

function buildStore(payload: SpodAuthPayload): NormalizedStore {
  const pointOfSaleId = String(payload.pointOfSaleId ?? "").trim();

  return {
    id: pointOfSaleId || "spreadconnect",
    name: String(payload.pointOfSaleName || "Spreadconnect Store").trim() || "Spreadconnect Store",
    salesChannel: String(payload.pointOfSaleType || "spreadconnect").trim() || "spreadconnect",
  };
}

function extractDataUrlParts(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mime: match[1].toLowerCase(),
    contents: match[2],
  };
}

function buildUploadFormData(fileName: string, imageDataUrl: string, hostedArtwork?: HostedArtworkReference) {
  const form = new FormData();

  if (hostedArtwork?.publicUrl) {
    form.append("url", hostedArtwork.publicUrl);
    return form;
  }

  const parts = extractDataUrlParts(imageDataUrl);
  if (!parts) {
    throw new ProviderError({
      providerId: "spod",
      code: "validation_error",
      status: 400,
      message: "Spreadconnect requires a valid image payload for design upload.",
    });
  }

  const buffer = Buffer.from(parts.contents, "base64");
  form.append("file", new Blob([buffer], { type: parts.mime }), fileName);
  return form;
}

export function createSpodAdapter(options: SpodAdapterOptions = {}): ProviderAdapter {
  const fetchFn = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? SPOD_API_BASE;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const userAgent = options.userAgent ?? USER_AGENT;

  async function fetchWithTimeout(path: string, init?: RequestInit, requestTimeoutMs = timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      return await fetchFn(`${apiBase}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestJson<T>(
    context: ProviderAdapterContext,
    path: string,
    fallbackMessage: string,
    init?: RequestInit
  ) {
    const apiKey = context.credentials.apiKey.trim();
    if (!apiKey) {
      throw new ProviderError({
        providerId: "spod",
        code: "missing_credentials",
        status: 401,
        message: "Missing Spreadconnect API key.",
      });
    }

    const response = await fetchWithTimeout(path, {
      ...init,
      headers: {
        "X-SPOD-ACCESS-TOKEN": apiKey,
        Accept: "application/json",
        "User-Agent": userAgent,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await providerErrorFromResponse("spod", response, fallbackMessage);
    }

    return (await response.json()) as T;
  }

  async function resolveTemplateDetail(context: ProviderAdapterContext, sourceId: string) {
    const trimmedSourceId = sourceId.trim();
    if (!trimmedSourceId) {
      throw new ProviderError({
        providerId: "spod",
        code: "missing_parameter",
        status: 400,
        message: "Missing sourceId.",
      });
    }

    const detail = await requestJson<SpodProductType>(
      context,
      `/productTypes/${encodeURIComponent(trimmedSourceId)}`,
      "Unable to load Spreadconnect product type."
    );
    const [viewsPayload, stockPayload] = await Promise.all([
      requestJson<SpodViewsPayload>(
        context,
        `/productTypes/${encodeURIComponent(trimmedSourceId)}/views`,
        "Unable to load Spreadconnect product views."
      ),
      requestJson<SpodStockPayload>(
        context,
        `/stock/productType/${encodeURIComponent(trimmedSourceId)}`,
        "Unable to load Spreadconnect stock information."
      ).catch((error) => {
        const providerError = toProviderError(error, {
          providerId: "spod",
          code: "upstream_error",
          status: 500,
          message: "Unable to load Spreadconnect stock information.",
        });

        if (providerError.code === "not_found") {
          return null;
        }

        throw providerError;
      }),
    ]);

    const preferredView = choosePreferredView(viewsPayload.views);
    const preferredHotspot = choosePreferredHotspot(preferredView);
    const preferredVariant = choosePreferredStockVariant(detail, stockPayload);
    const description = stripHtml(String(detail.customerDescription || detail.merchantDescription || ""));

    return {
      id: String(detail.id || trimmedSourceId),
      storeId: "",
      title: String(detail.customerName || detail.merchantName || "Spreadconnect Product Type").trim() || "Spreadconnect Product Type",
      description,
      placementGuide: {
        ...DEFAULT_PLACEMENT_GUIDE,
        position: String(preferredHotspot?.name || normalizeViewName(preferredView?.name) || DEFAULT_PLACEMENT_GUIDE.position),
      },
      metadata: {
        productTypeId: String(detail.id || trimmedSourceId),
        brand: detail.brand,
        price: detail.price,
        currency: detail.currency,
        preferredAppearanceId: String(preferredVariant.appearanceId || ""),
        preferredSizeId: String(preferredVariant.sizeId || ""),
        preferredView: normalizeViewName(preferredView?.name),
        preferredHotspot: String(preferredHotspot?.name || ""),
        appearances: Array.isArray(detail.appearances) ? detail.appearances : [],
        sizes: Array.isArray(detail.sizes) ? detail.sizes : [],
        views: Array.isArray(viewsPayload.views) ? viewsPayload.views : [],
        stockVariants: Array.isArray(stockPayload?.variants) ? stockPayload?.variants : [],
      },
    } satisfies NormalizedTemplateDetail;
  }

  async function uploadArtworkInternal(context: ProviderArtworkContext) {
    const response = await fetchWithTimeout("/designs/upload", {
      method: "POST",
      headers: {
        "X-SPOD-ACCESS-TOKEN": context.credentials.apiKey.trim(),
        "User-Agent": userAgent,
      },
      body: buildUploadFormData(context.fileName, context.imageDataUrl, context.hostedArtwork),
    });

    if (!response.ok) {
      throw await providerErrorFromResponse("spod", response, "Unable to upload Spreadconnect design.");
    }

    const payload = (await response.json()) as SpodDesignUploadPayload;
    const designId = String(payload.designId || "").trim();
    if (!designId) {
      throw new ProviderError({
        providerId: "spod",
        code: "upstream_error",
        status: 502,
        message: "Spreadconnect did not return a design id.",
      });
    }

    return {
      id: designId,
      fileName: context.fileName,
      providerId: "spod",
    } satisfies NormalizedArtworkUpload;
  }

  return {
    id: "spod",
    displayName: "SPOD / Spreadconnect",
    capabilities: SPOD_CAPABILITIES,

    async connect(context) {
      try {
        const stores = await this.listStores(context);
        return {
          providerId: this.id,
          displayName: this.displayName,
          capabilities: this.capabilities,
          stores,
        };
      } catch (error) {
        throw toProviderError(error, {
          providerId: "spod",
          code: "upstream_error",
          status: 500,
          message: "Unable to connect to Spreadconnect.",
        });
      }
    },

    async listStores(context) {
      const payload = await requestJson<SpodAuthPayload>(
        context,
        "/authentication",
        "Unable to validate Spreadconnect credentials."
      );

      return [buildStore(payload)];
    },

    async listTemplatesOrProducts(context) {
      if (!context.storeId.trim()) {
        throw new ProviderError({
          providerId: "spod",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const payload = await requestJson<SpodProductType[]>(
        context,
        "/productTypes?limit=250",
        "Unable to load Spreadconnect product types."
      );

      const productTypes = Array.isArray(payload) ? payload : [];
      return productTypes.map((productType) => ({
        id: String(productType.id || "").trim(),
        storeId: context.storeId,
        title: String(productType.customerName || productType.merchantName || "Spreadconnect Product Type").trim() || "Spreadconnect Product Type",
        description: stripHtml(String(productType.customerDescription || productType.merchantDescription || "")),
        type: "product_type",
      })) satisfies NormalizedTemplateSummary[];
    },

    async getTemplateDetail(context) {
      if (!context.storeId.trim()) {
        throw new ProviderError({
          providerId: "spod",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const detail = await resolveTemplateDetail(context, context.sourceId);
      return {
        ...detail,
        storeId: context.storeId,
      };
    },

    async uploadArtwork(context) {
      try {
        return await uploadArtworkInternal(context);
      } catch (error) {
        throw toProviderError(error, {
          providerId: "spod",
          code: "upstream_error",
          status: 500,
          message: "Unable to upload Spreadconnect artwork.",
        });
      }
    },

    async createDraftProduct(context) {
      try {
        const detail = context.templateDetail && context.templateDetail.id === context.templateId
          ? context.templateDetail
          : await this.getTemplateDetail({
              credentials: context.credentials,
              storeId: context.storeId,
              sourceId: context.templateId,
            });

        const metadata = detail.metadata || {};
        const productTypeId = String(metadata.productTypeId || context.templateId).trim();
        const preferredView = normalizeViewName(String(metadata.preferredView || "FRONT"));
        const preferredAppearanceId = String(metadata.preferredAppearanceId || "");
        const preferredSizeId = String(metadata.preferredSizeId || "");
        const retailPrice = Number(metadata.price);
        const d2cPrice = Number.isFinite(retailPrice)
          ? Number(Math.max(retailPrice + 8, retailPrice * 1.6).toFixed(2))
          : 24.99;

        if (!productTypeId || !preferredAppearanceId || !preferredSizeId) {
          throw new ProviderError({
            providerId: "spod",
            code: "validation_error",
            status: 422,
            message: "Spreadconnect product type metadata is incomplete for article creation.",
          });
        }

        const upload = await uploadArtworkInternal({
          credentials: context.credentials,
          fileName: context.item.fileName,
          imageDataUrl: context.item.imageDataUrl,
          hostedArtwork: context.hostedArtwork,
        });

        const hotspotPayload = await requestJson<SpodHotspotsPayload>(
          context,
          `/productTypes/${encodeURIComponent(productTypeId)}/hotspots/design/${encodeURIComponent(upload.id)}`,
          "Unable to load printable Spreadconnect hotspots."
        ).catch((error) => {
          const providerError = toProviderError(error, {
            providerId: "spod",
            code: "upstream_error",
            status: 500,
            message: "Unable to load printable Spreadconnect hotspots.",
          });

          if (providerError.code === "not_found") {
            return { hotspots: [] };
          }

          throw providerError;
        });

        const hotspotCandidates = Array.isArray(hotspotPayload.hotspots) ? hotspotPayload.hotspots : [];
        const chosenHotspot =
          hotspotCandidates.find((hotspot) => String(hotspot.name || "") === String(metadata.preferredHotspot || "")) ||
          choosePreferredHotspot({ hotspots: hotspotCandidates }) ||
          { name: String(metadata.preferredHotspot || detail.placementGuide.position || DEFAULT_PLACEMENT_GUIDE.position) };

        const response = await requestJson<number | string>(
          context,
          "/articles",
          "Unable to create Spreadconnect article.",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: context.item.title,
              description: context.item.description,
              externalId: crypto.randomUUID(),
              variants: [
                {
                  productTypeId: coerceId(productTypeId),
                  appearanceId: coerceId(preferredAppearanceId),
                  sizeId: coerceId(preferredSizeId),
                  d2cPrice,
                  externalId: crypto.randomUUID(),
                },
              ],
              configurations: [
                {
                  image: {
                    designId: upload.id,
                  },
                  view: preferredView,
                  hotspot: String(chosenHotspot.name || DEFAULT_PLACEMENT_GUIDE.position),
                },
              ],
            }),
          }
        );

        return {
          providerId: "spod",
          fileName: context.item.fileName,
          title: context.item.title,
          productId: String(response),
          message: "Created Spreadconnect draft article.",
          placementGuide: detail.placementGuide,
        } satisfies DraftProductResult;
      } catch (error) {
        throw toProviderError(error, {
          providerId: "spod",
          code: "upstream_error",
          status: 500,
          message: "Unable to create Spreadconnect draft article.",
        });
      }
    },
  };
}
