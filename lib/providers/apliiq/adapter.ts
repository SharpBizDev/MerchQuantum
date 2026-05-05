import crypto from "node:crypto";

import type { ProviderAdapter, ProviderAdapterContext, ProviderArtworkContext } from "../contracts";
import { ProviderError, providerErrorFromResponse, toProviderError } from "../errors";
import type {
  DraftProductResult,
  NormalizedArtworkUpload,
  NormalizedPlacementGuide,
  NormalizedStore,
  NormalizedTemplateSummary,
  ProviderCapabilities,
} from "../types";

const APLIIQ_API_BASE = "https://api.apliiq.com";
const PROVIDER_TIMEOUT_MS = 90000;
const USER_AGENT = "MerchQuantum";
const APLIIQ_DEFAULT_STORE_ID = "custom-store";
const DEFAULT_PLACEMENT_GUIDE: NormalizedPlacementGuide = {
  position: "front",
  width: 944,
  height: 1440,
  source: "fallback",
};

type ApliiqAdapterOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type ApliiqProductSummary = {
  Id?: number | string;
  Code?: string;
  SKU?: string;
  Name?: string;
  DetailName?: string;
  Description?: string;
  Features?: string;
  Benefits?: string;
};

type ApliiqProductsPayload = {
  Products?: ApliiqProductSummary[];
};

type ApliiqColor = {
  Id?: number | string;
  Name?: string;
};

type ApliiqLocation = {
  Id?: number | string;
  Name?: string;
};

type ApliiqAvailableColor = {
  HexColorCode?: string;
};

type ApliiqService = {
  Alt_Name?: string;
  Name?: string;
  AvailableColors?: ApliiqAvailableColor[];
};

type ApliiqProductDetail = ApliiqProductSummary & {
  Colors?: ApliiqColor[];
  Locations?: ApliiqLocation[];
  Services?: ApliiqService[];
  Sizes?: Array<{
    Id?: number | string;
    Name?: string;
  }>;
};

type ApliiqArtworkResponse = {
  Id?: number | string;
  Name?: string;
};

type ApliiqDesignResponse = {
  Id?: number | string;
  Name?: string;
  Variants?: Array<{
    SKU?: string;
    Name?: string;
  }>;
};

export const APLIIQ_CAPABILITIES: ProviderCapabilities = {
  supportsStores: true,
  supportsTemplates: true,
  supportsProductDrafts: true,
  supportsMockups: false,
  supportsWebhooks: false,
  supportsOrderOnly: false,
  supportsPublishStep: false,
  supportsMultiplePlacements: false,
  requiresHostedArtwork: true,
  supportsDirectUpload: false,
  supportsOrderFirst: false,
  supportsStoreTemplateDraftFlow: true,
};

function normalizeStoreName(apiKey: string) {
  const suffix = apiKey.trim().slice(-6);
  return suffix ? `Apliiq Custom Store ${suffix}` : "Apliiq Custom Store";
}

function getSyntheticStore(context: ProviderAdapterContext): NormalizedStore {
  return {
    id: APLIIQ_DEFAULT_STORE_ID,
    name: normalizeStoreName(context.credentials.apiKey),
    salesChannel: "custom_store",
  };
}

function normalizeProductSourceId(product: ApliiqProductSummary) {
  return String(product.Id || product.Code || product.SKU || "").trim();
}

function choosePreferredLocation(detail: ApliiqProductDetail) {
  const locations = Array.isArray(detail.Locations) ? detail.Locations : [];
  const preferred =
    locations.find((location) => /front/i.test(String(location.Name || ""))) ||
    locations.find((location) => /center|default/i.test(String(location.Name || ""))) ||
    locations[0];

  return preferred && preferred.Id != null
    ? {
        id: String(preferred.Id),
        name: String(preferred.Name || "Front"),
      }
    : {
        id: "front",
        name: "Front",
      };
}

function choosePreferredService(detail: ApliiqProductDetail) {
  const services = Array.isArray(detail.Services) ? detail.Services : [];
  const normalized = services.map((service) => {
    const name = String(service.Alt_Name || service.Name || "").trim().toLowerCase();
    return {
      name,
      availableColors: Array.isArray(service.AvailableColors) ? service.AvailableColors : [],
    };
  });

  const preferred =
    normalized.find((service) => service.name === "dtgprint") ||
    normalized.find((service) => service.name === "transfer_print") ||
    normalized.find((service) => service.name === "sublimation") ||
    normalized.find((service) => service.name === "print") ||
    normalized.find((service) => service.name === "embroidery") ||
    normalized[0];

  return preferred || { name: "dtgprint", availableColors: [] };
}

function chooseColorId(detail: ApliiqProductDetail) {
  const colors = Array.isArray(detail.Colors) ? detail.Colors : [];
  const preferred =
    colors.find((color) => /^black$/i.test(String(color.Name || ""))) ||
    colors.find((color) => /^white$/i.test(String(color.Name || ""))) ||
    colors[0];

  return preferred?.Id != null ? String(preferred.Id) : "";
}

function choosePrintColors(service: ReturnType<typeof choosePreferredService>) {
  if (!["print", "embroidery"].includes(service.name)) {
    return undefined;
  }

  const color = service.availableColors.find((entry) => entry.HexColorCode)?.HexColorCode;
  return color || undefined;
}

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

function createAuthHeader(credentials: ProviderAdapterContext["credentials"], bodyText: string) {
  const apiKey = credentials.apiKey.trim();
  const apiSecret = credentials.apiSecret?.trim();

  if (!apiKey || !apiSecret) {
    throw new ProviderError({
      providerId: "apliiq",
      code: "missing_credentials",
      status: 401,
      message: "Apliiq requires app key and shared secret in appKey:sharedSecret format.",
    });
  }

  const requestTimestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "").toLowerCase();
  const bodyBase64 = bodyText ? Buffer.from(bodyText, "utf8").toString("base64") : "";
  const data = `${apiKey}${requestTimestamp}${nonce}${bodyBase64}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(data, "utf8").digest("base64");

  return `x-apliiq-auth ${requestTimestamp}:${signature}:${apiKey}:${nonce}`;
}

export function createApliiqAdapter(options: ApliiqAdapterOptions = {}): ProviderAdapter {
  const fetchFn = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? APLIIQ_API_BASE;
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
    const bodyText =
      typeof init?.body === "string"
        ? init.body
        : init?.body
          ? String(init.body)
          : "";

    const response = await fetchWithTimeout(path, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: createAuthHeader(context.credentials, bodyText),
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await providerErrorFromResponse("apliiq", response, fallbackMessage);
    }

    return (await response.json()) as T;
  }

  async function listRawProducts(context: ProviderAdapterContext) {
    const payload = await requestJson<ApliiqProductSummary[] | ApliiqProductsPayload>(
      context,
      "/api/Product/",
      "Unable to load Apliiq products."
    );

    return Array.isArray(payload) ? payload : Array.isArray(payload?.Products) ? payload.Products : [];
  }

  async function resolveProductDetail(context: ProviderAdapterContext, sourceId: string) {
    const trimmedSourceId = sourceId.trim();
    if (!trimmedSourceId) {
      throw new ProviderError({
        providerId: "apliiq",
        code: "missing_parameter",
        status: 400,
        message: "Missing sourceId.",
      });
    }

    if (/^\d+$/.test(trimmedSourceId)) {
      return await requestJson<ApliiqProductDetail>(
        context,
        `/api/Product/${encodeURIComponent(trimmedSourceId)}`,
        "Unable to load Apliiq product detail."
      );
    }

    const products = await listRawProducts(context);
    const match = products.find((product) => {
      const candidates = [product.Code, product.SKU, product.Name].map((value) => String(value || "").trim().toLowerCase());
      return candidates.includes(trimmedSourceId.toLowerCase());
    });

    if (!match?.Id) {
      throw new ProviderError({
        providerId: "apliiq",
        code: "not_found",
        status: 404,
        message: "Unable to resolve Apliiq product detail from the selected source.",
      });
    }

    return await requestJson<ApliiqProductDetail>(
      context,
      `/api/Product/${encodeURIComponent(String(match.Id))}`,
      "Unable to load Apliiq product detail."
    );
  }

  return {
    id: "apliiq",
    displayName: "Apliiq",
    capabilities: APLIIQ_CAPABILITIES,
    async connect(context) {
      await listRawProducts(context);
      return {
        providerId: this.id,
        displayName: this.displayName,
        capabilities: this.capabilities,
        stores: [getSyntheticStore(context)],
      };
    },
    async listStores(context) {
      return [getSyntheticStore(context)];
    },
    async listTemplatesOrProducts(context) {
      if (!context.storeId.trim()) {
        throw new ProviderError({
          providerId: "apliiq",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const products = await listRawProducts(context);

      return products
        .map((product): NormalizedTemplateSummary | null => {
          const id = normalizeProductSourceId(product);
          if (!id) return null;

          return {
            id,
            storeId: context.storeId,
            title: String(product.DetailName || product.Name || product.Code || `Apliiq Product ${id}`),
            description: String(product.Description || product.Features || product.Benefits || "").trim() || undefined,
            type: "product",
          };
        })
        .filter(Boolean) as NormalizedTemplateSummary[];
    },
    async getTemplateDetail(context) {
      if (!context.storeId.trim() || !context.sourceId.trim()) {
        throw new ProviderError({
          providerId: "apliiq",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId or sourceId.",
        });
      }

      const detail = await resolveProductDetail(context, context.sourceId);
      const location = choosePreferredLocation(detail);
      const service = choosePreferredService(detail);
      const printColors = choosePrintColors(service);
      const colorId = chooseColorId(detail);

      return {
        id: String(detail.Id || context.sourceId),
        storeId: context.storeId,
        title: String(detail.DetailName || detail.Name || detail.Code || `Apliiq Product ${context.sourceId}`),
        description: stripHtml(String(detail.Description || detail.Features || detail.Benefits || "")),
        placementGuide: {
          ...DEFAULT_PLACEMENT_GUIDE,
          position: location.name.toLowerCase(),
        },
        metadata: {
          rawTemplate: detail,
          defaultColorId: colorId,
          preferredLocation: location,
          preferredService: service.name,
          preferredPrintColors: printColors,
          fileRequirements: {
            requiresHostedArtwork: true,
            imagePathMustBeHttps: true,
            mockImageIdealSize: "944x1440",
          },
        },
      };
    },
    async uploadArtwork(context: ProviderArtworkContext) {
      const hostedArtwork = context.hostedArtwork;
      if (!hostedArtwork?.publicUrl || !/^https:\/\//i.test(hostedArtwork.publicUrl)) {
        throw new ProviderError({
          providerId: "apliiq",
          code: "validation_error",
          status: 400,
          message: "Apliiq requires hosted HTTPS artwork.",
        });
      }

      const uploaded = await requestJson<ApliiqArtworkResponse>(
        context,
        "/v1/Artwork",
        "Unable to upload artwork to Apliiq.",
        {
          method: "POST",
          body: JSON.stringify({
            Name: context.fileName.slice(0, 50),
            ImagePath: hostedArtwork.publicUrl,
          }),
        }
      );

      return {
        id: String(uploaded.Id || ""),
        fileName: String(uploaded.Name || context.fileName),
        providerId: "apliiq",
      } satisfies NormalizedArtworkUpload;
    },
    async createDraftProduct(context) {
      try {
        if (!context.hostedArtwork?.publicUrl) {
          throw new ProviderError({
            providerId: "apliiq",
            code: "validation_error",
            status: 400,
            message: "Apliiq draft creation requires hosted artwork.",
          });
        }

        const templateDetail =
          context.templateDetail ||
          (await this.getTemplateDetail({
            credentials: context.credentials,
            storeId: context.storeId,
            sourceId: context.templateId,
          }));

        const rawTemplate = templateDetail.metadata?.rawTemplate as ApliiqProductDetail | undefined;
        const location = (templateDetail.metadata?.preferredLocation as { id?: string; name?: string } | undefined) || choosePreferredLocation(rawTemplate || {});
        const serviceName =
          String(templateDetail.metadata?.preferredService || choosePreferredService(rawTemplate || {}).name || "dtgprint").trim() ||
          "dtgprint";
        const printColors =
          (templateDetail.metadata?.preferredPrintColors as string | undefined) || choosePrintColors(choosePreferredService(rawTemplate || {}));
        const colorId = String(templateDetail.metadata?.defaultColorId || chooseColorId(rawTemplate || {})).trim();

        if (!rawTemplate?.Code || !rawTemplate?.Id || !colorId) {
          throw new ProviderError({
            providerId: "apliiq",
            code: "validation_error",
            status: 400,
            message: "The selected Apliiq product is missing required color or product metadata.",
          });
        }

        const artwork = await this.uploadArtwork({
          credentials: context.credentials,
          fileName: context.item.fileName,
          imageDataUrl: context.item.imageDataUrl,
          hostedArtwork: context.hostedArtwork,
        });

        const created = await requestJson<ApliiqDesignResponse>(
          context,
          "/v1/Design",
          "Unable to create Apliiq design.",
          {
            method: "POST",
            body: JSON.stringify({
              ProductId: rawTemplate.Id,
              ProductCode: rawTemplate.Code,
              Name: context.item.title,
              Description: context.item.description,
              ColorId: Number(colorId),
              Locations: [
                {
                  Id: Number(location.id),
                  ImagePath: context.hostedArtwork.publicUrl,
                  Artworks: [
                    {
                      Service: serviceName,
                      ...(printColors ? { PrintColors: printColors } : {}),
                      Id: Number(artwork.id),
                    },
                  ],
                },
              ],
            }),
          }
        );

        return {
          providerId: "apliiq",
          fileName: context.item.fileName,
          title: context.item.title,
          productId: String(created.Id || ""),
          message: `Created Apliiq design using ${location.name || "front"} placement.`,
          placementGuide: templateDetail.placementGuide,
        } satisfies DraftProductResult;
      } catch (error) {
        throw toProviderError(error, {
          providerId: "apliiq",
          code: "upstream_error",
          status: 500,
          message: "Unable to create Apliiq design.",
        });
      }
    },
  };
}
