import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderImportDetailContext,
  ProviderListingMetadataUpdateContext,
} from "../contracts";
import { ProviderError, providerErrorFromResponse, toProviderError } from "../errors";
import type {
  DraftProductResult,
  NormalizedArtworkUpload,
  NormalizedImportedListingDetail,
  NormalizedPlacementGuide,
  NormalizedRecoveredArtwork,
  NormalizedStore,
  NormalizedTemplateDetail,
  NormalizedTemplateSummary,
  NormalizedUpdatedListing,
  ProviderCapabilities,
} from "../types";

const PRINTFUL_API_BASE = "https://api.printful.com";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 90000;
const DEFAULT_PLACEMENT_GUIDE: NormalizedPlacementGuide = {
  position: "default",
  width: 1800,
  height: 2400,
  source: "fallback",
};

type PrintfulAdapterOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type PrintfulStore = {
  id: number | string;
  name?: string;
  title?: string;
  type?: string;
};

type PrintfulSyncProductListItem = {
  id: number | string;
  external_id?: string | null;
  name?: string;
  thumbnail_url?: string | null;
};

type PrintfulSyncVariant = {
  id?: number | string;
  variant_id?: number;
  retail_price?: string | number | null;
  files?: Array<{
    id?: number | string;
    type?: string;
    url?: string;
    filename?: string;
    width?: number;
    height?: number;
    preview_url?: string;
    thumbnail_url?: string;
  }>;
  options?: Array<Record<string, unknown>>;
  product?: {
    id?: number;
    product_id?: number;
    placements?: Array<{
      placement?: string;
      display_name?: string;
      technique_key?: string;
      technique_display_name?: string;
    }>;
    placement_option_data?: Array<Record<string, unknown>>;
  };
};

type PrintfulSyncProductDetail = {
  sync_product?: {
    id?: number | string;
    external_id?: string | null;
    name?: string;
    thumbnail_url?: string | null;
  };
  sync_variants?: PrintfulSyncVariant[];
};

type PrintfulPrintfileInfo = {
  available_placements?: Record<string, string>;
  printfiles?: Array<{
    printfile_id: number;
    width?: number;
    height?: number;
  }>;
  variant_printfiles?: Array<{
    variant_id?: number;
    placements?: Record<string, number>;
  }>;
  option_groups?: string[];
  options?: string[];
};

type PrintfulFile = {
  id: number | string;
  url?: string | null;
  filename?: string | null;
  preview_url?: string | null;
  thumbnail_url?: string | null;
  mime_type?: string | null;
  width?: number;
  height?: number;
  status?: string;
};

export const PRINTFUL_CAPABILITIES: ProviderCapabilities = {
  supportsStores: true,
  supportsTemplates: false,
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

function normalizeStoreHeader(storeId: string) {
  return {
    "X-PF-Store-Id": storeId,
  };
}

function unwrapPrintfulPayload<T>(payload: unknown): T {
  if (payload && typeof payload === "object") {
    if ("result" in payload) {
      return payload.result as T;
    }

    if ("data" in payload) {
      return payload.data as T;
    }
  }

  return payload as T;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function choosePrimaryPlacement(syncVariants: PrintfulSyncVariant[]) {
  for (const variant of syncVariants) {
    for (const file of variant.files || []) {
      const type = String(file.type || "").trim();
      if (type && type !== "preview") {
        return type;
      }
    }

    for (const placement of variant.product?.placements || []) {
      const type = String(placement.placement || "").trim();
      if (type) {
        return type;
      }
    }
  }

  return DEFAULT_PLACEMENT_GUIDE.position;
}

function resolveCatalogProductId(syncVariants: PrintfulSyncVariant[]) {
  for (const variant of syncVariants) {
    const candidates = [
      variant.product?.product_id,
      variant.product?.id,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function buildFallbackPlacementGuide(syncVariants: PrintfulSyncVariant[]) {
  const primaryPlacement = choosePrimaryPlacement(syncVariants);

  for (const variant of syncVariants) {
    const matchingFile =
      (variant.files || []).find((file) => String(file.type || "").trim() === primaryPlacement) ||
      (variant.files || []).find((file) => String(file.type || "").trim() && String(file.type || "").trim() !== "preview") ||
      variant.files?.[0];

    if (matchingFile?.width && matchingFile?.height) {
      return {
        position: primaryPlacement,
        width: matchingFile.width,
        height: matchingFile.height,
        source: "fallback" as const,
      };
    }
  }

  return {
    ...DEFAULT_PLACEMENT_GUIDE,
    position: primaryPlacement,
  };
}

function chooseImportedFile(syncVariants: PrintfulSyncVariant[]) {
  for (const variant of syncVariants) {
    const preferred = (variant.files || []).find((file) => String(file.type || "").trim() && String(file.type || "").trim() !== "preview");
    if (preferred) {
      return preferred;
    }

    if (variant.files?.[0]) {
      return variant.files[0];
    }
  }

  return null;
}

function resolveRetailPrice(variant: PrintfulSyncVariant) {
  if (typeof variant.retail_price === "string" && variant.retail_price.trim()) {
    return variant.retail_price.trim();
  }

  if (typeof variant.retail_price === "number" && Number.isFinite(variant.retail_price)) {
    return variant.retail_price.toFixed(2);
  }

  return undefined;
}

export function createPrintfulAdapter(options: PrintfulAdapterOptions = {}): ProviderAdapter {
  const fetchFn = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? PRINTFUL_API_BASE;
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
    init?: RequestInit,
    storeId?: string
  ) {
    const apiKey = context.credentials.apiKey.trim();
    if (!apiKey) {
      throw new ProviderError({
        providerId: "printful",
        code: "missing_credentials",
        status: 401,
        message: "Missing provider API key.",
      });
    }

    const response = await fetchWithTimeout(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": userAgent,
        "Content-Type": "application/json",
        ...(storeId ? normalizeStoreHeader(storeId) : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await providerErrorFromResponse("printful", response, fallbackMessage);
    }

    return unwrapPrintfulPayload<T>(await response.json());
  }

  async function resolvePlacementGuide(context: ProviderAdapterContext, storeId: string, syncVariants: PrintfulSyncVariant[]) {
    const primaryPlacement = choosePrimaryPlacement(syncVariants);
    const catalogProductId = resolveCatalogProductId(syncVariants);

    if (!catalogProductId) {
      return buildFallbackPlacementGuide(syncVariants);
    }

    try {
      const printfileInfo = await requestJson<PrintfulPrintfileInfo>(
        context,
        `/mockup-generator/printfiles/${encodeURIComponent(String(catalogProductId))}`,
        "Unable to load Printful printfile metadata.",
        undefined,
        storeId
      );

      const firstVariantId = syncVariants.find((variant) => typeof variant.variant_id === "number")?.variant_id;
      const placementMap =
        printfileInfo.variant_printfiles?.find((variant) => variant.variant_id === firstVariantId)?.placements ||
        printfileInfo.variant_printfiles?.[0]?.placements;
      const printfileId =
        placementMap?.[primaryPlacement] ||
        Object.values(placementMap || {})[0];
      const selectedPrintfile =
        printfileInfo.printfiles?.find((printfile) => printfile.printfile_id === printfileId) ||
        printfileInfo.printfiles?.[0];

      if (selectedPrintfile?.width && selectedPrintfile?.height) {
        return {
          position: primaryPlacement,
          width: selectedPrintfile.width,
          height: selectedPrintfile.height,
          source: "live" as const,
        };
      }
    } catch (error) {
      if (error instanceof ProviderError && error.code === "invalid_credentials") {
        throw error;
      }
    }

    return buildFallbackPlacementGuide(syncVariants);
  }

  async function resolveImportedArtwork(
    context: ProviderImportDetailContext,
    syncVariants: PrintfulSyncVariant[]
  ): Promise<NormalizedRecoveredArtwork | null> {
    const file = chooseImportedFile(syncVariants);
    if (!file?.id && !file?.preview_url && !file?.thumbnail_url && !file?.url) {
      return null;
    }

    if (file?.id) {
      try {
        const resolved = await requestJson<PrintfulFile>(
          context,
          `/files/${encodeURIComponent(String(file.id))}`,
          "Unable to retrieve the imported artwork from Printful.",
          undefined,
          context.storeId
        );

        return {
          assetId: String(resolved.id || file.id),
          fileName: resolved.filename || file.filename || `printful-${file.id}.png`,
          url: resolved.url || file.url || resolved.preview_url || file.preview_url || resolved.thumbnail_url || file.thumbnail_url || "",
          previewUrl: resolved.preview_url || file.preview_url || resolved.thumbnail_url || file.thumbnail_url || resolved.url || file.url || "",
          width: resolved.width || file.width,
          height: resolved.height || file.height,
          contentType: resolved.mime_type,
        };
      } catch (error) {
        if (error instanceof ProviderError && error.code === "invalid_credentials") {
          throw error;
        }
      }
    }

    const fallbackUrl = file.url || file.preview_url || file.thumbnail_url;
    if (!fallbackUrl) {
      return null;
    }

    return {
      assetId: file.id ? String(file.id) : undefined,
      fileName: file.filename || `printful-${file.id || "artwork"}.png`,
      url: fallbackUrl,
      previewUrl: file.preview_url || file.thumbnail_url || fallbackUrl,
      width: file.width,
      height: file.height,
    };
  }

  return {
    id: "printful",
    displayName: "Printful",
    capabilities: PRINTFUL_CAPABILITIES,
    async connect(context) {
      const stores = await this.listStores(context);
      return {
        providerId: this.id,
        displayName: this.displayName,
        capabilities: this.capabilities,
        stores,
      };
    },
    async listStores(context) {
      const stores = await requestJson<PrintfulStore[]>(context, "/stores", "Unable to load Printful stores.");

      return asArray<PrintfulStore>(stores).map((store): NormalizedStore => ({
        id: String(store.id),
        name: store.name || store.title || `Store ${store.id}`,
        salesChannel: store.type || "manual_api",
      }));
    },
    async listTemplatesOrProducts(context) {
      const storeId = context.storeId.trim();
      if (!storeId) {
        throw new ProviderError({
          providerId: "printful",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const products = await requestJson<PrintfulSyncProductListItem[]>(
        context,
        "/store/products?limit=100",
        "Unable to load Printful store products.",
        undefined,
        storeId
      );

      return asArray<PrintfulSyncProductListItem>(products).map((product): NormalizedTemplateSummary => ({
        id: String(product.id),
        storeId,
        title: product.name || `Product ${product.id}`,
        type: "sync_product",
        previewUrl: product.thumbnail_url || undefined,
      }));
    },
    async getTemplateDetail(context) {
      const storeId = context.storeId.trim();
      const sourceId = context.sourceId.trim();

      if (!storeId || !sourceId) {
        throw new ProviderError({
          providerId: "printful",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId or sourceId.",
        });
      }

      const detail = await requestJson<PrintfulSyncProductDetail>(
        context,
        `/store/products/${encodeURIComponent(sourceId)}`,
        "Unable to load Printful product detail.",
        undefined,
        storeId
      );

      const syncProduct = detail.sync_product || {};
      const syncVariants = asArray<PrintfulSyncVariant>(detail.sync_variants);
      const placementGuide = await resolvePlacementGuide(context, storeId, syncVariants);
      const placements = Array.from(
        new Set(
          syncVariants.flatMap((variant) => [
            ...(variant.product?.placements || []).map((placement) => String(placement.placement || "").trim()).filter(Boolean),
            ...(variant.files || []).map((file) => String(file.type || "").trim()).filter((type) => type && type !== "preview"),
          ])
        )
      );

      return {
        id: String(syncProduct.id || sourceId),
        storeId,
        title: syncProduct.name || `Printful Product ${sourceId}`,
        description: `Manual/API store product with ${syncVariants.length} variant${syncVariants.length === 1 ? "" : "s"}.`,
        placementGuide,
        metadata: {
          rawTemplate: detail,
          syncVariants,
          placements,
          pricingHints: syncVariants
            .map((variant) => resolveRetailPrice(variant))
            .filter((value): value is string => Boolean(value)),
          fileRequirements: {
            preferredPlacement: placementGuide.position,
            files: syncVariants.flatMap((variant) =>
              (variant.files || []).map((file) => ({
                type: file.type || "default",
                filename: file.filename,
                width: file.width,
                height: file.height,
              }))
            ),
          },
        },
      };
    },
    async getImportedListingDetail(context) {
      const storeId = context.storeId.trim();
      const sourceId = context.sourceId.trim();

      if (!storeId || !sourceId) {
        throw new ProviderError({
          providerId: "printful",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId or sourceId.",
        });
      }

      const detail = await requestJson<PrintfulSyncProductDetail>(
        context,
        `/store/products/${encodeURIComponent(sourceId)}`,
        "Unable to load Printful product detail for import.",
        undefined,
        storeId
      );

      const syncProduct = detail.sync_product || {};
      const syncVariants = asArray<PrintfulSyncVariant>(detail.sync_variants);
      const artwork = await resolveImportedArtwork(context, syncVariants);

      return {
        id: String(syncProduct.id || sourceId),
        storeId,
        title: syncProduct.name || `Printful Product ${sourceId}`,
        description: "",
        tags: [],
        templateDescription: "",
        artwork,
        metadata: {
          rawTemplate: detail,
          syncVariants,
        },
      } satisfies NormalizedImportedListingDetail;
    },
    async uploadArtwork(context) {
      const data = context.imageDataUrl.trim();
      if (!extractDataUrlParts(data)) {
        throw new ProviderError({
          providerId: "printful",
          code: "validation_error",
          status: 400,
          message: "Image data is missing or not base64.",
        });
      }

      const file = await requestJson<PrintfulFile>(
        context,
        "/files",
        "Unable to upload artwork to the Printful file library.",
        {
          method: "POST",
          body: JSON.stringify({
            data,
            filename: context.fileName,
            visible: false,
          }),
        }
      );

      return {
        id: String(file.id),
        fileName: file.filename || context.fileName,
        providerId: "printful",
      } satisfies NormalizedArtworkUpload;
    },
    async createDraftProduct(context) {
      try {
        const templateDetail =
          context.templateDetail ||
          (await this.getTemplateDetail({
            credentials: context.credentials,
            storeId: context.storeId,
            sourceId: context.templateId,
          }));
        const rawTemplate = templateDetail.metadata?.rawTemplate as PrintfulSyncProductDetail | undefined;
        const syncProduct = rawTemplate?.sync_product;
        const syncVariants = asArray<PrintfulSyncVariant>(rawTemplate?.sync_variants);

        if (!syncVariants.length) {
          throw new ProviderError({
            providerId: "printful",
            code: "validation_error",
            status: 400,
            message: "Template has no reusable sync variants.",
          });
        }

        const upload = await this.uploadArtwork({
          credentials: context.credentials,
          fileName: context.item.fileName,
          imageDataUrl: context.item.imageDataUrl,
        });

        const preferredPlacement = String(templateDetail.placementGuide.position || "default").trim() || "default";
        const syncVariantsPayload = syncVariants
          .filter((variant) => typeof variant.variant_id === "number")
          .map((variant) => {
            const retailPrice = resolveRetailPrice(variant);
            const files = [
              {
                type: preferredPlacement === "default" ? undefined : preferredPlacement,
                id: upload.id,
              },
            ].map((file) => (file.type ? file : { id: file.id }));

            return {
              variant_id: variant.variant_id,
              ...(retailPrice ? { retail_price: retailPrice } : {}),
              ...(Array.isArray(variant.options) && variant.options.length ? { options: variant.options } : {}),
              files,
            };
          });

        if (!syncVariantsPayload.length) {
          throw new ProviderError({
            providerId: "printful",
            code: "validation_error",
            status: 400,
            message: "Template variants are missing catalog variant IDs.",
          });
        }

        const created = await requestJson<{ id?: number | string; sync_product?: { id?: number | string } }>(
          context,
          "/store/products",
          "Unable to create Printful draft product.",
          {
            method: "POST",
            body: JSON.stringify({
              sync_product: {
                name: context.item.title,
                ...(syncProduct?.thumbnail_url ? { thumbnail: syncProduct.thumbnail_url } : {}),
              },
              sync_variants: syncVariantsPayload,
            }),
          },
          context.storeId
        );

        return {
          providerId: "printful",
          fileName: context.item.fileName,
          title: context.item.title,
          productId: String(created.id || created.sync_product?.id || ""),
          message: `Created Printful Manual/API draft product using ${preferredPlacement} placement.`,
          placementGuide: templateDetail.placementGuide,
        } satisfies DraftProductResult;
      } catch (error) {
        throw toProviderError(error, {
          providerId: "printful",
          code: "upstream_error",
          status: 500,
          message: "Unable to create Printful draft product.",
        });
      }
    },
    async updateListingMetadata(context) {
      const sourceId = context.sourceId.trim();
      const storeId = context.storeId.trim();
      const title = context.title?.trim();
      const description = context.description?.trim();
      const tags = Array.isArray(context.tags)
        ? context.tags.filter((tag): tag is string => typeof tag === "string" && !!tag.trim()).slice(0, 15)
        : [];

      if (!storeId || !sourceId) {
        throw new ProviderError({
          providerId: "printful",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId or sourceId.",
        });
      }

      if (!title && !description && tags.length === 0) {
        throw new ProviderError({
          providerId: "printful",
          code: "validation_error",
          status: 400,
          message: "Nothing to update.",
        });
      }

      if (description || tags.length) {
        throw new ProviderError({
          providerId: "printful",
          code: "unsupported_operation",
          status: 501,
          message: "Printful metadata sync currently supports title updates only in this pass.",
        });
      }

      const updated = await requestJson<{ sync_product?: { id?: number | string; name?: string } }>(
        context,
        `/store/products/${encodeURIComponent(sourceId)}`,
        "Unable to update the Printful listing title.",
        {
          method: "PUT",
          body: JSON.stringify({
            sync_product: {
              name: title,
            },
          }),
        },
        storeId
      );

      return {
        id: String(updated.sync_product?.id || sourceId),
        storeId,
        title: updated.sync_product?.name || title || "",
        description: "",
        tags: [],
      } satisfies NormalizedUpdatedListing;
    },
  };
}
