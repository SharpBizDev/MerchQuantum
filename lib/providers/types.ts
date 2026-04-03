export type ProviderId =
  | "printify"
  | "printful"
  | "gelato"
  | "gooten"
  | "apliiq"
  | "prodigi"
  | "lulu_direct"
  | "spod"
  | "tshirtgang";

export type ProviderCapabilities = {
  supportsStores: boolean;
  supportsTemplates: boolean;
  supportsProductDrafts: boolean;
  supportsMockups: boolean;
  supportsWebhooks: boolean;
  supportsOrderOnly: boolean;
  supportsPublishStep: boolean;
  supportsMultiplePlacements: boolean;
  requiresHostedArtwork: boolean;
  supportsDirectUpload: boolean;
  supportsOrderFirst: boolean;
  supportsStoreTemplateDraftFlow: boolean;
};

export type ProviderCredentials = {
  apiKey: string;
  apiSecret?: string;
};

export type ProviderSession = {
  providerId: ProviderId;
  credentials: ProviderCredentials;
};

export type ArtworkBounds = {
  canvasWidth?: number;
  canvasHeight?: number;
  visibleLeft?: number;
  visibleTop?: number;
  visibleWidth?: number;
  visibleHeight?: number;
};

export type NormalizedStore = {
  id: string;
  name: string;
  salesChannel?: string;
};

export type NormalizedTemplateSummary = {
  id: string;
  storeId: string;
  title: string;
  description?: string;
  type: string;
};

export type NormalizedPlacementGuide = {
  position: string;
  width: number;
  height: number;
  source: "live" | "fallback";
  decorationMethod?: string;
};

export type NormalizedTemplateDetail = {
  id: string;
  storeId: string;
  title: string;
  description: string;
  placementGuide: NormalizedPlacementGuide;
  metadata: Record<string, unknown>;
};

export type NormalizedArtworkUpload = {
  id: string;
  fileName: string;
  providerId: ProviderId;
};

export type HostedArtworkReference = {
  id: string;
  providerId: ProviderId;
  fileName: string;
  contentType: string;
  byteLength: number;
  checksum: string;
  publicUrl: string;
  createdAt: string;
  expiresAt: string;
};

export type DraftProductItemInput = {
  fileName: string;
  title: string;
  description: string;
  tags: string[];
  imageDataUrl: string;
  artworkBounds?: ArtworkBounds;
};

export type DraftProductInput = {
  storeId: string;
  templateId: string;
  item: DraftProductItemInput;
  templateDetail?: NormalizedTemplateDetail;
  hostedArtwork?: HostedArtworkReference;
};

export type DraftProductResult = {
  providerId: ProviderId;
  fileName: string;
  title: string;
  productId?: string;
  message: string;
  placementGuide?: NormalizedPlacementGuide;
};

export type NormalizedPreviewResult = {
  providerId: ProviderId;
  sourceId: string;
  previewUrl?: string;
  metadata?: Record<string, unknown>;
};

export type NormalizedOrderSummary = {
  id: string;
  providerId: ProviderId;
  storeId?: string;
  status?: string;
  createdAt?: string;
};

export type NormalizedOrderDetail = NormalizedOrderSummary & {
  metadata?: Record<string, unknown>;
};

export type NormalizedWebhookEvent = {
  providerId: ProviderId;
  eventType: string;
  resourceId?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
};

export type ProviderConnectionResult = {
  providerId: ProviderId;
  displayName: string;
  capabilities: ProviderCapabilities;
  stores: NormalizedStore[];
};

export const EMPTY_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  supportsStores: false,
  supportsTemplates: false,
  supportsProductDrafts: false,
  supportsMockups: false,
  supportsWebhooks: false,
  supportsOrderOnly: false,
  supportsPublishStep: false,
  supportsMultiplePlacements: false,
  requiresHostedArtwork: false,
  supportsDirectUpload: false,
  supportsOrderFirst: false,
  supportsStoreTemplateDraftFlow: false,
};
