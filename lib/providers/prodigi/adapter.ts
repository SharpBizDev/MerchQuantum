import type {
  ProviderAdapter,
  ProviderAdapterContext,
  ProviderGetOrderContext,
  ProviderListOrdersContext,
  ProviderOrderSubmitContext,
} from "../contracts";
import { ProviderError, providerErrorFromResponse, toProviderError } from "../errors";
import type {
  DraftProductResult,
  NormalizedArtworkUpload,
  NormalizedOrderDetail,
  NormalizedOrderSummary,
  NormalizedPlacementGuide,
  NormalizedStore,
  ProviderCapabilities,
} from "../types";

const PRODIGI_API_BASE = "https://api.prodigi.com/v4.0";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 90000;
const PRODIGI_SYNTHETIC_STORE_ID = "order-first";
const DEFAULT_PLACEMENT_GUIDE: NormalizedPlacementGuide = {
  position: "default",
  width: 1,
  height: 1,
  source: "fallback",
};

type ProdigiAdapterOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
  timeoutMs?: number;
  userAgent?: string;
};

type ProdigiOrderSummaryResponse = {
  id?: string;
  merchantReference?: string;
  status?: { stage?: string };
  created?: string;
  createdAt?: string;
};

type ProdigiOrdersListResponse = {
  orders?: ProdigiOrderSummaryResponse[];
  hasMore?: boolean;
  nextUrl?: string | null;
};

type ProdigiOrderDetailResponse = ProdigiOrderSummaryResponse & {
  items?: Array<Record<string, unknown>>;
  recipient?: Record<string, unknown>;
  charges?: Record<string, unknown>;
};

type ProdigiProductResponse = {
  sku?: string;
  description?: string;
  productDimensions?: {
    width?: number;
    height?: number;
    units?: string;
  };
  printAreas?: Record<string, { required?: boolean }>;
  attributes?: Record<string, unknown>;
  variants?: Array<Record<string, unknown>>;
};

type ProdigiCreatedOrderResponse = {
  id?: string;
  outcome?: string;
  created?: string;
  status?: { stage?: string };
};

export const PRODIGI_CAPABILITIES: ProviderCapabilities = {
  supportsStores: false,
  supportsTemplates: false,
  supportsProductDrafts: false,
  supportsMockups: false,
  supportsWebhooks: false,
  supportsOrderOnly: true,
  supportsPublishStep: false,
  supportsMultiplePlacements: false,
  requiresHostedArtwork: true,
  supportsDirectUpload: false,
  supportsOrderFirst: true,
  supportsStoreTemplateDraftFlow: false,
};

function getSyntheticStore(): NormalizedStore {
  return {
    id: PRODIGI_SYNTHETIC_STORE_ID,
    name: "Prodigi Order Flow",
    salesChannel: "order_first",
  };
}

function normalizeOrderSummary(order: ProdigiOrderSummaryResponse): NormalizedOrderSummary {
  return {
    id: String(order.id || order.merchantReference || ""),
    providerId: "prodigi",
    storeId: PRODIGI_SYNTHETIC_STORE_ID,
    status: order.status?.stage,
    createdAt: order.createdAt || order.created,
  };
}

function normalizePlacementGuide(product: ProdigiProductResponse): NormalizedPlacementGuide {
  const position = Object.keys(product.printAreas || {})[0] || DEFAULT_PLACEMENT_GUIDE.position;
  const width = product.productDimensions?.width;
  const height = product.productDimensions?.height;

  if (typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height)) {
    return {
      position,
      width,
      height,
      source: "live",
    };
  }

  return {
    ...DEFAULT_PLACEMENT_GUIDE,
    position,
  };
}

export function createProdigiAdapter(options: ProdigiAdapterOptions = {}): ProviderAdapter {
  const fetchFn = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? PRODIGI_API_BASE;
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
        providerId: "prodigi",
        code: "missing_credentials",
        status: 401,
        message: "Missing provider API key.",
      });
    }

    const response = await fetchWithTimeout(path, {
      ...init,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await providerErrorFromResponse("prodigi", response, fallbackMessage);
    }

    return (await response.json()) as T;
  }

  return {
    id: "prodigi",
    displayName: "Prodigi",
    capabilities: PRODIGI_CAPABILITIES,
    async connect(context) {
      await this.listOrders!({ credentials: context.credentials });

      return {
        providerId: this.id,
        displayName: this.displayName,
        capabilities: this.capabilities,
        stores: [getSyntheticStore()],
      };
    },
    async listStores() {
      return [getSyntheticStore()];
    },
    async listTemplatesOrProducts() {
      throw new ProviderError({
        providerId: "prodigi",
        code: "unsupported_operation",
        status: 501,
        message: "Prodigi requires a specific product SKU and does not expose storefront-style source listing in the current flow.",
      });
    },
    async getTemplateDetail(context) {
      const sourceId = context.sourceId.trim();
      if (!sourceId) {
        throw new ProviderError({
          providerId: "prodigi",
          code: "missing_parameter",
          status: 400,
          message: "Missing product SKU.",
        });
      }

      const payload = await requestJson<{ product?: ProdigiProductResponse }>(
        context,
        `/products/${encodeURIComponent(sourceId)}`,
        "Unable to load Prodigi product detail."
      );

      const product = payload.product;
      if (!product?.sku) {
        throw new ProviderError({
          providerId: "prodigi",
          code: "not_found",
          status: 404,
          message: "Prodigi product not found.",
        });
      }

      return {
        id: product.sku,
        storeId: PRODIGI_SYNTHETIC_STORE_ID,
        title: product.sku,
        description: product.description || "",
        placementGuide: normalizePlacementGuide(product),
        metadata: {
          rawTemplate: product,
          attributes: product.attributes || {},
          printAreas: product.printAreas || {},
          variants: product.variants || [],
          dimensions: product.productDimensions || {},
        },
      };
    },
    async uploadArtwork(context) {
      const publicUrl = context.hostedArtwork?.publicUrl;
      if (!publicUrl || !/^https:\/\//i.test(publicUrl)) {
        throw new ProviderError({
          providerId: "prodigi",
          code: "validation_error",
          status: 400,
          message: "Prodigi requires hosted HTTPS artwork.",
        });
      }

      return {
        id: publicUrl,
        fileName: context.fileName,
        providerId: "prodigi",
      } satisfies NormalizedArtworkUpload;
    },
    async createDraftProduct(): Promise<DraftProductResult> {
      throw new ProviderError({
        providerId: "prodigi",
        code: "unsupported_operation",
        status: 501,
        message: "Prodigi is order-first and does not support the current draft product workflow.",
      });
    },
    async submitOrder(context: ProviderOrderSubmitContext) {
      try {
        return await requestJson<ProdigiCreatedOrderResponse>(
          context,
          "/orders",
          "Unable to submit Prodigi order.",
          {
            method: "POST",
            body: JSON.stringify(context.orderInput),
          }
        );
      } catch (error) {
        throw toProviderError(error, {
          providerId: "prodigi",
          code: "upstream_error",
          status: 500,
          message: "Unable to submit Prodigi order.",
        });
      }
    },
    async listOrders(context: ProviderListOrdersContext) {
      const payload = await requestJson<ProdigiOrdersListResponse>(
        { credentials: context.credentials },
        "/orders?top=25",
        "Unable to list Prodigi orders."
      );

      return (payload.orders || []).map(normalizeOrderSummary);
    },
    async getOrder(context: ProviderGetOrderContext): Promise<NormalizedOrderDetail> {
      const orderId = context.orderId.trim();
      if (!orderId) {
        throw new ProviderError({
          providerId: "prodigi",
          code: "missing_parameter",
          status: 400,
          message: "Missing orderId.",
        });
      }

      const order = await requestJson<ProdigiOrderDetailResponse>(
        { credentials: context.credentials },
        `/orders/${encodeURIComponent(orderId)}`,
        "Unable to load Prodigi order."
      );

      return {
        ...normalizeOrderSummary(order),
        metadata: {
          items: order.items || [],
          recipient: order.recipient || {},
          charges: order.charges || {},
        },
      };
    },
  };
}
