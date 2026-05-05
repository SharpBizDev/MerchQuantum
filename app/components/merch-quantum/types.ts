import type React from "react";
import type {
  ArtworkBounds,
  NormalizedPlacementGuide,
  NormalizedRecoveredArtwork,
  ProductFamily,
  ProviderId,
} from "../../../lib/providers/types";

export type PlacementGuide = NormalizedPlacementGuide;
export type ImportedArtwork = NormalizedRecoveredArtwork;

export type ItemStatus = "pending" | "ready" | "error";
export type AiFieldKey = "title" | "description" | "tags";
export type AiFieldStatus = "idle" | "loading" | "ready" | "error";
export type AiFieldStates = Record<AiFieldKey, AiFieldStatus>;

export type AiListingDraft = {
  title: string;
  leadParagraphs: string[];
  model: string;
  confidence: number;
  templateReference: string;
  reasonFlags: string[];
  source: "gemini" | "fallback";
  grade: "green" | "red";
  qcApproved?: boolean;
  publishReady?: boolean;
};

export type Img = {
  id: string;
  name: string;
  file: File;
  preview: string;
  cleaned: string;
  final: string;
  finalDescription: string;
  tags: string[];
  status: ItemStatus;
  statusReason: string;
  aiProcessing?: boolean;
  aiFieldStates: AiFieldStates;
  processedTemplateKey?: string;
  artworkBounds?: ArtworkBounds;
  aiDraft?: AiListingDraft;
  sourceType?: "upload" | "imported";
  providerId?: ProviderId;
  providerStoreId?: string;
  providerProductId?: string;
  templateDescriptionOverride?: string;
  templateReferenceOverride?: string;
  productFamilyOverride?: ProductFamily;
  importedArtwork?: ImportedArtwork | null;
  originalListingTitle?: string;
  originalListingDescription?: string;
  syncState?: "idle" | "syncing" | "synced" | "error";
  syncMessage?: string;
};

export type InlineEditableField = "title" | "description" | null;
export type InlineSaveTone = "idle" | "saving" | "saved" | "error";

export type InlineSaveFeedback = {
  field: Exclude<InlineEditableField, null>;
  tone: InlineSaveTone;
  message: string;
};

export type WorkspaceMode = "" | "create" | "edit";

export type Template = {
  reference: string;
  nickname: string;
  source: "product" | "manual";
  shopId: string;
  description: string;
  placementGuide?: PlacementGuide;
};

export type Shop = { id: string; title: string };

export type Product = {
  id: string;
  title: string;
  type: string;
  shopId: string;
  description?: string;
  previewUrl?: string;
};

export type ProductGridProps = {
  heading: React.ReactNode;
  items: Product[];
  selectedIds: string[];
  activeId?: string;
  importedProductIds: Set<string>;
  highlighted?: boolean;
  collapsed?: boolean;
  rangeLabel: string;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  headerAccessory?: React.ReactNode;
  onToggleCollapsed?: () => void;
  onSelectAll?: () => void;
  selectAllLabel?: string;
  footerLabel?: React.ReactNode;
  onItemActivate: (
    product: Product,
    index: number,
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>
  ) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  footerActions?: React.ReactNode;
};

export type SmartThumbnailProps = {
  src?: string | null;
  alt: string;
  className?: string;
  safeZoneClassName?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  children?: React.ReactNode;
};

export type ApiShop = { id: number | string; title: string; sales_channel?: string };

export type ApiProduct = {
  id: string;
  title: string;
  description?: string;
  shop_id?: number | string;
  preview_url?: string;
  blueprint_id?: number;
  print_provider_id?: number;
};

export type ApiTemplateResponse = {
  product?: ApiProduct & { description?: string };
  placementGuide?: PlacementGuide;
};

export type BatchResult = {
  fileName: string;
  title: string;
  productId?: string;
  message: string;
};

export type ImportedListingRecord = {
  id: string;
  storeId: string;
  title: string;
  description: string;
  tags: string[];
  templateDescription: string;
  artwork: ImportedArtwork | null;
};