import type {
  DraftProductInput,
  DraftProductResult,
  HostedArtworkReference,
  NormalizedArtworkUpload,
  NormalizedOrderDetail,
  NormalizedOrderSummary,
  NormalizedPreviewResult,
  NormalizedStore,
  NormalizedTemplateDetail,
  NormalizedTemplateSummary,
  ProviderCapabilities,
  ProviderConnectionResult,
  ProviderCredentials,
  ProviderId,
} from "./types";

export type ProviderAdapterContext = {
  credentials: ProviderCredentials;
};

export type ProviderArtworkContext = ProviderAdapterContext & {
  fileName: string;
  imageDataUrl: string;
  hostedArtwork?: HostedArtworkReference;
};

export type ProviderPreviewContext = ProviderAdapterContext & {
  sourceId: string;
  storeId: string;
};

export type ProviderPublishContext = ProviderAdapterContext & {
  productId: string;
  storeId: string;
};

export type ProviderOrderSubmitContext = ProviderAdapterContext & {
  orderInput: Record<string, unknown>;
};

export type ProviderListOrdersContext = ProviderAdapterContext & {
  storeId?: string;
};

export type ProviderGetOrderContext = ProviderAdapterContext & {
  orderId: string;
  storeId?: string;
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  connect(context: ProviderAdapterContext): Promise<ProviderConnectionResult>;
  listStores(context: ProviderAdapterContext): Promise<NormalizedStore[]>;
  listTemplatesOrProducts(context: ProviderAdapterContext & { storeId: string }): Promise<NormalizedTemplateSummary[]>;
  getTemplateDetail(context: ProviderAdapterContext & { storeId: string; sourceId: string }): Promise<NormalizedTemplateDetail>;
  uploadArtwork(context: ProviderArtworkContext): Promise<NormalizedArtworkUpload>;
  createDraftProduct(context: ProviderAdapterContext & DraftProductInput): Promise<DraftProductResult>;
  createPreview?(context: ProviderPreviewContext): Promise<NormalizedPreviewResult>;
  publishProduct?(context: ProviderPublishContext): Promise<unknown>;
  submitOrder?(context: ProviderOrderSubmitContext): Promise<unknown>;
  listOrders?(context: ProviderListOrdersContext): Promise<NormalizedOrderSummary[]>;
  getOrder?(context: ProviderGetOrderContext): Promise<NormalizedOrderDetail>;
}
