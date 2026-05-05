'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestAiListing } from "../../../../lib/client/quantum-routes";
import { PROVIDER_OPTIONS, type ProviderChoiceId } from "../../../../lib/providers/client-options";
import type { ArtworkBounds, ProviderId } from "../../../../lib/providers/types";
import {
  analyzeArtworkBounds,
  clamp,
  createPreviewObjectUrl,
  getFileSignature,
  isImage,
  readDataUrl,
  urlToFile,
} from "../../../../lib/services/merch-quantum/artwork-analysis";
import {
  appendToActiveBatch,
  createBatchEvent,
  createBatchProjection,
  fillActiveBatch,
  getPendingBatchEventCount,
  getResolvedItemStatus,
  getStatusSortValue,
  IMPORT_QUEUE_LIMIT,
  normalizeSelectionIds,
  reduceBatchProjection,
  selectionsMatch,
  type BatchAuthority,
  type BatchEventEnvelope,
  type BatchEventSource,
  type BatchPendingEvent,
  type BatchProjection,
  type BatchSnapshot,
} from "../../../../lib/services/merch-quantum/batch-state";
import {
  AI_MODEL_LABEL,
  buildLeadOnlyDescription,
  buildManualOverrideTags,
  buildTemplateContext,
  canManualOverrideFlaggedImage,
  canManualOverrideListingCopy,
  clampDescriptionForListing,
  clampTitleForListing,
  cleanTitle,
  createAiFieldStates,
  descriptionTextToParagraphs,
  extractBuyerFacingDescriptionFromListing,
  formatProductDescriptionWithSections,
  LISTING_LIMITS,
  normalizeAiLeadParagraphs,
  normalizeDescriptionText,
  normalizeTagsFromPayload,
  resolveProductFamily,
  safeTitle,
  sanitizeTemplateDescriptionForPrebuffer,
  splitDetailDescriptionForDisplay,
} from "../../../../lib/services/merch-quantum/product-logic";
import {
  fetchWithTimeout,
  formatApiError,
  getProviderTokenStorageKey,
  getStoredWorkspaceSelectionCondensed,
  maskTokenCompact,
  normalizeRef,
  parseResponsePayload,
  WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY,
} from "../../../../lib/services/merch-quantum/platform-utils";
import { getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";
import type {
  AiFieldStates,
  ApiProduct,
  ApiShop,
  ApiTemplateResponse,
  BatchResult,
  Img,
  ImportedListingRecord,
  InlineEditableField,
  InlineSaveFeedback,
  InlineSaveTone,
  ItemStatus,
  Product,
  Shop,
  Template,
  WorkspaceMode,
} from "../types";

const PROVIDERS = PROVIDER_OPTIONS;
const ACTIVE_BATCH_FILES = 50;
const CONNECTED_TOTAL_BATCH_FILES = 50;const DEFAULT_PLACEMENT_GUIDE = {
  position: "front",
  width: 3153,
  height: 3995,
  source: "fallback",
} as const;

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useBatchState() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewUrlsRef = useRef<string[]>([]);
  const aiLoopBusyRef = useRef<symbol | null>(null);
  const activeTemplateKeyRef = useRef("");
  const inlineFeedbackTimeoutRef = useRef<number | null>(null);

  const [provider, setProvider] = useState<ProviderChoiceId | "">("");
    const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [pulseConnected, setPulseConnected] = useState(false);
  const [apiShops, setApiShops] = useState<Shop[]>([]);
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingTemplateDetails, setLoadingTemplateDetails] = useState(false);
  const [shopId, setShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [bulkEditGridPage, setBulkEditGridPage] = useState(0);
  const [createTemplateGridPage, setCreateTemplateGridPage] = useState(0);
  const [isCreateThumbExpandedView, setIsCreateThumbExpandedView] = useState(false);
  const [createThumbGridPage, setCreateThumbGridPage] = useState(0);
  const [templateDescription, setTemplateDescription] = useState("");
  const [importedListingTitle, setImportedListingTitle] = useState("");
  const [importedListingDescription, setImportedListingDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [pendingTemplateSelectionIds, setPendingTemplateSelectionIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isDisconnectArmed, setIsDisconnectArmed] = useState(false);
  const [isTokenInputFocused, setIsTokenInputFocused] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("");
  const [isRoutingGridExpanded, setIsRoutingGridExpanded] = useState(true);
  const [isWorkspaceSelectionCollapsed, setIsWorkspaceSelectionCollapsed] = useState(getStoredWorkspaceSelectionCondensed);
  const [isImportingListings, setIsImportingListings] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [isSyncingImportedListings, setIsSyncingImportedListings] = useState(false);
  const [isPublishingImportedListings, setIsPublishingImportedListings] = useState(false);
  const [imagesState, setImagesState] = useState<Img[]>([]);
  const [completedImportedImagesState, setCompletedImportedImagesState] = useState<Img[]>([]);
  const [queuedImagesState, setQueuedImagesState] = useState<Img[]>([]);
  const [selectedIdState, setSelectedIdState] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchAuthority, setBatchAuthorityState] = useState<BatchAuthority>("local");
  const [batchStreamCursor, setBatchStreamCursor] = useState<string | null>(null);
  const [batchPending, setBatchPending] = useState<Record<string, BatchPendingEvent>>({});
  const [lastBatchEvent, setLastBatchEvent] = useState<BatchEventEnvelope | null>(null);
  const [attentionTarget, setAttentionTarget] = useState<"provider" | "token" | "import" | "shop" | "template" | "mode" | null>(null);
  const [editingField, setEditingField] = useState<InlineEditableField>(null);
  const [editableTitleDraft, setEditableTitleDraft] = useState("");
  const [editableDescriptionDraft, setEditableDescriptionDraft] = useState("");
  const [inlineSaveFeedback, setInlineSaveFeedback] = useState<InlineSaveFeedback | null>(null);
  const [manualPrebufferOverride, setManualPrebufferOverride] = useState(false);
  const [activeGridProductId, setActiveGridProductId] = useState("");

  const batchProjection = useMemo<BatchProjection>(() => {
    const projection = createBatchProjection({
      active: imagesState,
      queued: queuedImagesState,
      archived: completedImportedImagesState,
      selectedId: selectedIdState,
    });
    return {
      ...projection,
      authority: batchAuthority,
      streamCursor: batchStreamCursor,
      lastEventId: lastBatchEvent?.eventId ?? null,
      pending: batchPending,
    };
  }, [batchAuthority, batchPending, batchStreamCursor, completedImportedImagesState, imagesState, lastBatchEvent, queuedImagesState, selectedIdState]);

  const batchProjectionRef = useRef(batchProjection);
  batchProjectionRef.current = batchProjection;

  const syncBatchProjection = useCallback((nextProjection: BatchProjection) => {
    batchProjectionRef.current = nextProjection;
    setImagesState(nextProjection.active);
    setQueuedImagesState(nextProjection.queued);
    setCompletedImportedImagesState(nextProjection.archived);
    setSelectedIdState(nextProjection.selectedId);
    setBatchAuthorityState(nextProjection.authority);
    setBatchStreamCursor(nextProjection.streamCursor);
    setBatchPending(nextProjection.pending);
  }, []);

  const applyBatchEnvelope = useCallback((envelope: BatchEventEnvelope) => {
    const nextProjection = reduceBatchProjection(batchProjectionRef.current, envelope);
    syncBatchProjection(nextProjection);
    setLastBatchEvent(envelope);
    return nextProjection;
  }, [syncBatchProjection]);

  const applyBatchSnapshot = useCallback((
    snapshot: Partial<BatchSnapshot>,
    options: {
      preserveSelection?: boolean;
      authority?: BatchAuthority;
      optimistic?: boolean;
      source?: BatchEventSource;
    } = {}
  ) => {
    return applyBatchEnvelope(
      createBatchEvent(
        {
          type: "snapshot.replace",
          snapshot,
          preserveSelection: options.preserveSelection,
          authority: options.authority,
        },
        {
          optimistic: options.optimistic,
          source: options.source,
        }
      )
    );
  }, [applyBatchEnvelope]);

  const setImages = useCallback((updater: Img[] | ((current: Img[]) => Img[]), options: { optimistic?: boolean; source?: BatchEventSource; authority?: BatchAuthority } = {}) => {
    const current = batchProjectionRef.current.active;
    const next = typeof updater === "function" ? (updater as (value: Img[]) => Img[])(current) : updater;
    applyBatchSnapshot({ active: next }, options);
  }, [applyBatchSnapshot]);

  const setQueuedImages = useCallback((updater: Img[] | ((current: Img[]) => Img[]), options: { optimistic?: boolean; source?: BatchEventSource; authority?: BatchAuthority } = {}) => {
    const current = batchProjectionRef.current.queued;
    const next = typeof updater === "function" ? (updater as (value: Img[]) => Img[])(current) : updater;
    applyBatchSnapshot({ queued: next }, options);
  }, [applyBatchSnapshot]);

  const setCompletedImportedImages = useCallback((updater: Img[] | ((current: Img[]) => Img[]), options: { optimistic?: boolean; source?: BatchEventSource; authority?: BatchAuthority } = {}) => {
    const current = batchProjectionRef.current.archived;
    const next = typeof updater === "function" ? (updater as (value: Img[]) => Img[])(current) : updater;
    applyBatchSnapshot({ archived: next }, options);
  }, [applyBatchSnapshot]);

  const setSelectedId = useCallback((selectedId: string, options: { optimistic?: boolean; source?: BatchEventSource; authority?: BatchAuthority } = {}) => {
    applyBatchEnvelope(createBatchEvent({ type: "selection.set", selectedId }, options));
  }, [applyBatchEnvelope]);

  const setBatchAuthority = useCallback((authority: BatchAuthority) => {
    applyBatchEnvelope(createBatchEvent({ type: "authority.set", authority }, { source: "stream" }));
  }, [applyBatchEnvelope]);

  const setBatchStreamCursorLocal = useCallback((cursor: string | null, authority: BatchAuthority = batchProjectionRef.current.authority) => {
    applyBatchEnvelope(createBatchEvent({ type: "stream.cursor", cursor, authority }, { source: "stream" }));
  }, [applyBatchEnvelope]);

  const acknowledgePendingBatchEvent = useCallback((eventId: string, authority?: BatchAuthority) => {
    applyBatchEnvelope(createBatchEvent({ type: "event.ack", eventId, authority }, { source: "provider" }));
  }, [applyBatchEnvelope]);

  const rejectPendingBatchEvent = useCallback((eventId: string, reason?: string) => {
    applyBatchEnvelope(createBatchEvent({ type: "event.reject", eventId, reason }, { source: "provider" }));
  }, [applyBatchEnvelope]);

  const images = batchProjection.active;
  const completedImportedImages = batchProjection.archived;
  const queuedImages = batchProjection.queued;
  const selectedId = batchProjection.selectedId;
  const pendingBatchEventCount = getPendingBatchEventCount(batchProjection);

  useEffect(() => {
    window.localStorage.setItem(
      WORKSPACE_SELECTION_CONDENSED_STORAGE_KEY,
      isWorkspaceSelectionCollapsed ? "1" : "0"
    );
  }, [isWorkspaceSelectionCollapsed]);

  const resolvedProviderId = provider === "spreadconnect" ? "spod" : provider;
  const providerTokenStorageKey = getProviderTokenStorageKey(resolvedProviderId);
  const selectedProvider = PROVIDERS.find((entry) => entry.id === provider) || null;
  const isLiveProvider = selectedProvider?.isLive || false;
  const isCreateMode = workspaceMode === "create";
  const isBulkEditMode = workspaceMode === "edit";
  const supportsProviderMetadataSync = resolvedProviderId === "printify";
  const supportsImportedListingSync = resolvedProviderId === "printify" || resolvedProviderId === "printful";
  const supportsImportedPublish = resolvedProviderId === "printify";
  const totalBatchLimit = CONNECTED_TOTAL_BATCH_FILES;
  const activeBatchLimit = ACTIVE_BATCH_FILES;
  const allImages = useMemo(() => [...completedImportedImages, ...images], [completedImportedImages, images]);
  const queuedImportedImages = useMemo(
    () => queuedImages.filter((img) => img.sourceType === "imported"),
    [queuedImages]
  );
  const availableShops = connected && isLiveProvider ? apiShops : [];
  const selectedShop = availableShops.find((shop) => shop.id === shopId) || null;
  const hasTokenValue = token.trim().length > 0;
  const showCompactDisconnectedToken = !connected && hasTokenValue && !isTokenInputFocused;
  const tokenFieldValue = connected || showCompactDisconnectedToken ? maskTokenCompact(token) : token;
  const shopTriggerLabel = loadingApi
    ? "Loading..."
    : selectedShop?.title || (connected && availableShops.length === 0 ? "No Shops" : "Select Shop");
  const productSource = connected && isLiveProvider ? apiProducts : [];
  const templateKey = useMemo(() => `${template?.reference || "no-template"}::${templateDescription.trim()}`, [template?.reference, templateDescription]);
  const templateReadyForAi = !!template && !loadingTemplateDetails;
  const hasWorkspaceRoute = connected && !!shopId && !!workspaceMode;
  const workspaceModeLoadingLabel = isCreateMode ? "Awaiting Quantum AI Templates..." : "Awaiting Quantum AI Edit...";

  const visibleProducts = useMemo(() => {
    return productSource.filter((p) => p.shopId === shopId);
  }, [shopId, productSource]);
  const importedQueueCount = useMemo(
    () => allImages.filter((img) => img.sourceType === "imported").length + queuedImportedImages.length,
    [allImages, queuedImportedImages]
  );

  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => {
      const statusDelta = getStatusSortValue(getResolvedItemStatus(a)) - getStatusSortValue(getResolvedItemStatus(b));
      if (statusDelta !== 0) return statusDelta;
      const aLabel = (a.final || a.originalListingTitle || a.cleaned || a.name).trim().toLowerCase();
      const bLabel = (b.final || b.originalListingTitle || b.cleaned || b.name).trim().toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [images]);

  const selectedImage = useMemo(() => {
    return images.find((img) => img.id === selectedId) || sortedImages[0] || null;
  }, [images, selectedId, sortedImages]);

  useEffect(() => {
    if (images.length === 0) {
      if (selectedId) {
        setSelectedId("");
      }
      return;
    }

    if (!selectedId || !images.some((img) => img.id === selectedId)) {
      setSelectedId(images[0]?.id || "");
    }
  }, [images, selectedId]);

  const selectedProduct = useMemo(
    () => productSource.find((product) => product.id === productId && product.shopId === shopId) || productSource.find((product) => product.id === productId) || null,
    [productId, productSource, shopId]
  );
  const activeGridProduct = useMemo(
    () => visibleProducts.find((product) => product.id === activeGridProductId) || null,
    [activeGridProductId, visibleProducts]
  );
  const readyCount = images.filter((img) => getResolvedItemStatus(img) === "ready").length;
  const errorCount = images.filter((img) => getResolvedItemStatus(img) === "error").length;
  const processingCount = images.filter((img) => getResolvedItemStatus(img) === "pending").length;
  const draftReadyCount = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready").length;
  const hasAnyLoadedImages = allImages.length > 0 || queuedImages.length > 0;
  const completedGenerationCount = readyCount + errorCount;
  const generationProgressPct = images.length > 0 ? Math.round((completedGenerationCount / images.length) * 100) : 0;
  const isWorkspaceConfigured = isCreateMode ? connected && !!shopId && !!template : hasWorkspaceRoute;
  const canSubmitProviderConnection = Boolean(provider && isLiveProvider && token.trim() && !loadingApi && !connected);
  const isQuantumAiGenerating = processingCount > 0;
  const canShowDetailWorkspace = hasWorkspaceRoute;
  const canShowWorkspacePreview = isCreateMode
    ? canShowDetailWorkspace && (!!activeGridProduct || hasAnyLoadedImages)
    : canShowDetailWorkspace && (hasAnyLoadedImages || !!selectedImage || !!activeGridProduct);
  const canShowDetailPanel = canShowWorkspacePreview && hasAnyLoadedImages && !!selectedImage;
  const canShowLoadedQueueGrid = canShowWorkspacePreview && sortedImages.length > 0;
  const showPreviewStats = hasAnyLoadedImages;
  const showWorkspaceModeLoader = hasWorkspaceRoute && loadingProducts && visibleProducts.length === 0;
  const selectedImageFieldStates = selectedImage?.aiFieldStates ?? createAiFieldStates("idle");
  const detailTemplateDescription = selectedImage?.templateDescriptionOverride ?? templateDescription;
  const selectedImageTemplateKey = selectedImage
    ? `${selectedImage.templateReferenceOverride || template?.reference || "no-template"}::${detailTemplateDescription.trim()}`
    : templateKey;
  const isImageAwaitingStructuredOutput =
    !!(selectedImage && selectedImage.processedTemplateKey !== selectedImageTemplateKey);
  const hasVisibleSelectedImageTitle = !!selectedImage && selectedImageFieldStates.title === "ready" && !!selectedImage.final.trim();
  const hasVisibleSelectedImageDescription = !!selectedImage && selectedImageFieldStates.description === "ready" && !!selectedImage.finalDescription.trim();
  const isDetailTitleLoading =
    selectedImageFieldStates.title === "loading"
    || !!selectedImage?.aiProcessing
    || (isImageAwaitingStructuredOutput && !hasVisibleSelectedImageTitle);
  const isDetailDescriptionLoading =
    selectedImageFieldStates.description === "loading"
    || !!selectedImage?.aiProcessing
    || (isImageAwaitingStructuredOutput && !hasVisibleSelectedImageDescription);
  const isDetailTagsLoading =
    selectedImageFieldStates.tags === "loading"
    || !!selectedImage?.aiProcessing
    || isImageAwaitingStructuredOutput;
  const isTemplatePrebufferState = templateReadyForAi && !selectedImage && !hasAnyLoadedImages && !manualPrebufferOverride;
  const shouldAwaitQuantumTitle = isTemplatePrebufferState || isDetailTitleLoading;
  const shouldAwaitQuantumDescription = isTemplatePrebufferState || isDetailDescriptionLoading;
  const detailTitle = selectedImage
    ? selectedImageFieldStates.title === "ready"
      ? selectedImage.final
      : ""
    : !hasWorkspaceRoute
      ? ""
      : !templateReadyForAi
      ? template?.nickname
      || selectedProduct?.title
      || ""
      : importedListingTitle;
  const detailDescription = selectedImage
    ? selectedImageFieldStates.description === "ready"
      ? selectedImage.finalDescription
      : ""
    : (!hasWorkspaceRoute
      ? ""
      : !templateReadyForAi
      ? (templateDescription
      ? templateDescription
      : canShowDetailWorkspace
        ? "Select or add artwork to generate image-based listing copy."
        : selectedImage
          ? "Add a shop and product template when you're ready. Quantum AI will build the final listing copy here."
          : "")
      : importedListingDescription);
  const detailDescriptionSections = splitDetailDescriptionForDisplay(
    detailTemplateDescription,
    selectedImage?.aiDraft?.leadParagraphs || [],
    detailDescription
  );
  const detailBuyerDescription = detailDescriptionSections.buyerFacingDescription;
  const detailTemplateSpecBlock = detailDescriptionSections.templateSpecBlock;
  const workspaceGridHeading = isBulkEditMode
    ? (
      <>
        <span className="text-[#7F22FE]">Merch</span>{" "}
        Quantum: Choose listings to edit
      </>
    )
    : (
      <>
        <span className="text-[#7F22FE]">Merch</span>{" "}
        Quantum: Choose product template
      </>
    );
  const canEditImportedListing = !selectedImage && templateReadyForAi && !!template?.reference;
  const canEditSelectedImageCopy =
    !!selectedImage
    && !selectedImage.aiProcessing
    && canManualOverrideFlaggedImage(selectedImage)
    && getResolvedItemStatus(selectedImage) !== "pending";
  const canEditDetailTitle = canEditImportedListing || canEditSelectedImageCopy;
  const canEditDetailDescription = canEditImportedListing || canEditSelectedImageCopy;
  const titleFeedback = inlineSaveFeedback?.field === "title" ? inlineSaveFeedback : null;
  const descriptionFeedback = inlineSaveFeedback?.field === "description" ? inlineSaveFeedback : null;
  const selectedImageStatus = selectedImage ? getResolvedItemStatus(selectedImage) : null;
  const canManualRescueSelectedImage =
    !!selectedImage
    && selectedImageStatus === "error"
    && canManualOverrideFlaggedImage(selectedImage);
  const canRerollSelectedImage =
    !!selectedImage
    && !selectedImage.aiProcessing
    && !isImageAwaitingStructuredOutput;
  const detailTags = selectedImage && selectedImageFieldStates.tags === "ready"
    ? selectedImage.tags
    : [];
  const approvedImportedItems = allImages.filter((img) => img.sourceType === "imported" && getResolvedItemStatus(img) === "ready");
  const importedProductIds = useMemo(
    () => new Set([...allImages, ...queuedImages].map((img) => img.providerProductId).filter((value): value is string => !!value)),
    [allImages, queuedImages]
  );
  const loadedStatCount = allImages.length;
  const queuedStatCount = queuedImages.length;
  const hasBulkEditStagedSelections = pendingTemplateSelectionIds.length > 0;
  const selectionPageSize = isWorkspaceSelectionCollapsed ? 5 : 25;
  const createTemplatePageSize = selectionPageSize;
  const createTemplateTotalPages = Math.max(1, Math.ceil(visibleProducts.length / createTemplatePageSize));
  const safeCreateTemplatePage = Math.min(createTemplateGridPage, createTemplateTotalPages - 1);
  const createTemplateVisibleProducts = visibleProducts.slice(
    safeCreateTemplatePage * createTemplatePageSize,
    safeCreateTemplatePage * createTemplatePageSize + createTemplatePageSize
  );
  const createTemplateVisibleRangeLabel = visibleProducts.length > 0
    ? `${safeCreateTemplatePage * createTemplatePageSize + 1}-${Math.min(visibleProducts.length, safeCreateTemplatePage * createTemplatePageSize + createTemplateVisibleProducts.length)} of ${visibleProducts.length}`
    : "0 of 0";
  const bulkEditPageSize = selectionPageSize;
  const bulkEditTotalPages = Math.max(1, Math.ceil(visibleProducts.length / bulkEditPageSize));
  const safeBulkEditPage = Math.min(bulkEditGridPage, bulkEditTotalPages - 1);
  const bulkEditVisibleProducts = visibleProducts.slice(
    safeBulkEditPage * bulkEditPageSize,
    safeBulkEditPage * bulkEditPageSize + bulkEditPageSize
  );
  const bulkEditVisibleProductIds = bulkEditVisibleProducts.map((product) => product.id);
  const hasAllBulkEditVisibleSelections =
    bulkEditVisibleProductIds.length > 0
    && pendingTemplateSelectionIds.length === bulkEditVisibleProductIds.length
    && bulkEditVisibleProductIds.every((id) => pendingTemplateSelectionIds.includes(id));
  const bulkEditVisibleRangeLabel = visibleProducts.length > 0
    ? `${safeBulkEditPage * bulkEditPageSize + 1}-${Math.min(visibleProducts.length, safeBulkEditPage * bulkEditPageSize + bulkEditVisibleProducts.length)} of ${visibleProducts.length}`
    : "0 of 0";
  const workspaceLoadingPlaceholderItems = useMemo<Product[]>(
    () =>
      Array.from({ length: selectionPageSize }, (_, index) => ({
        id: `workspace-loading-placeholder-${workspaceMode || "mode"}-${index}`,
        title: `Loading placeholder ${index + 1}`,
        type: "Template",
        shopId,
        description: "",
        previewUrl: "",
      })),
    [isWorkspaceSelectionCollapsed, selectionPageSize, shopId, workspaceMode]
  );
  const createThumbCompactVisibleCount = 5;
  const createThumbExpandedPageSize = 25;
  const createThumbPageSize = isCreateThumbExpandedView ? createThumbExpandedPageSize : createThumbCompactVisibleCount;
  const createThumbTotalPages = Math.max(1, Math.ceil(sortedImages.length / createThumbPageSize));
  const safeCreateThumbPage = Math.min(createThumbGridPage, createThumbTotalPages - 1);
  const visibleCreateThumbnails = sortedImages.slice(
    safeCreateThumbPage * createThumbPageSize,
    safeCreateThumbPage * createThumbPageSize + createThumbPageSize
  );
  const createThumbVisibleRangeLabel = sortedImages.length > 0
    ? `${safeCreateThumbPage * createThumbPageSize + 1}-${Math.min(sortedImages.length, safeCreateThumbPage * createThumbPageSize + visibleCreateThumbnails.length)} of ${sortedImages.length}`
    : "0 of 0";
  const workspaceModePickerLabel = isCreateMode ? "Bulk Create" : isBulkEditMode ? "Bulk Edit" : "Edit mode";
  const uploadDisabled = !isCreateMode || !isWorkspaceConfigured || draftReadyCount === 0 || isRunningBatch || isQuantumAiGenerating;
  const bulkEditPublishDisabled =
    !isBulkEditMode
    || approvedImportedItems.length === 0
    || isSyncingImportedListings
    || isPublishingImportedListings
    || isQuantumAiGenerating
    || (!supportsImportedListingSync && !supportsImportedPublish);
  const descriptionActionDisabled = isCreateMode ? uploadDisabled : bulkEditPublishDisabled;
  const descriptionActionReady = !descriptionActionDisabled;
  const triggerDescriptionAction = () => {
    if (isCreateMode) {
      void runDraftBatch();
      return;
    }
    void runBulkEditPublishAction();
  };
  const routingGuidanceTarget =
    !provider
      ? "provider"
      : !connected
        ? "token"
        : !shopId
          ? "shop"
          : !workspaceMode
            ? "mode"
            : null;
  function getProviderRoute(path: "connect" | "disconnect" | "products" | "product" | "batch-create") {
    return `/api/providers/${path}`;
  }

  function triggerAttentionCue(target: "provider" | "token" | "import" | "shop" | "template" | "mode") {
    setAttentionTarget(target);
    window.clearTimeout((triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId);
    (triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId = window.setTimeout(() => {
      setAttentionTarget((current) => (current === target ? null : current));
    }, 1200);
  }

  function getMissingWorkflowTarget(includeImportStep: boolean) {
    if (!provider) return "provider" as const;
    if (!connected) return "token" as const;
    if (!shopId) return "shop" as const;
    if (!workspaceMode) return "mode" as const;
    if (isCreateMode && !template) return "template" as const;
    if (isBulkEditMode && !selectedImportIds.length && !hasAnyLoadedImages) return "template" as const;
    if (includeImportStep && isCreateMode && images.length === 0) return "import" as const;
    return null;
  }

  function canSubmitProviderConnectionWithToken(tokenCandidate?: string) {
    const submittedToken = String(tokenCandidate ?? token).trim();
    return Boolean(provider && isLiveProvider && submittedToken && !loadingApi && !connected);
  }

  function nudgeWorkflow(includeImportStep: boolean) {
    const target = getMissingWorkflowTarget(includeImportStep);
    if (target) triggerAttentionCue(target);
  }

  useEffect(() => {
    if (!providerTokenStorageKey) {
      setToken("");
      return;
    }

    const storedToken = window.localStorage.getItem(providerTokenStorageKey) || "";
    setToken(storedToken);
    setApiStatus("");
    setIsTokenInputFocused(false);
  }, [providerTokenStorageKey]);

  function nudgeProviderSelectionFromTokenArea() {
    if (!provider) {
      triggerAttentionCue("provider");
    }
  }

  function getRoutingFieldGlowClass(target: "provider" | "token" | "shop" | "mode") {
    return attentionTarget === target || routingGuidanceTarget === target
      ? "rounded-2xl ring-2 ring-[#7F22FE]/70 shadow-[0_0_0_1px_rgba(127,34,254,0.24),0_18px_45px_-28px_rgba(127,34,254,0.6)] animate-pulse"
      : "";
  }

  function clearInlineFeedbackTimer() {
    if (inlineFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(inlineFeedbackTimeoutRef.current);
      inlineFeedbackTimeoutRef.current = null;
    }
  }

  function setInlineFeedbackState(
    field: Exclude<InlineEditableField, null>,
    tone: InlineSaveTone,
    message: string,
    autoClearMs = tone === "saved" ? 2200 : 0
  ) {
    clearInlineFeedbackTimer();
    setInlineSaveFeedback({ field, tone, message });
    if (autoClearMs > 0) {
      inlineFeedbackTimeoutRef.current = window.setTimeout(() => {
        setInlineSaveFeedback((current) => (
          current?.field === field && current.tone === tone ? null : current
        ));
        inlineFeedbackTimeoutRef.current = null;
      }, autoClearMs);
    }
  }

  function buildEditableDescriptionHtml(value: string) {
    const paragraphs = descriptionTextToParagraphs(value);
    return detailTemplateDescription.trim()
      ? formatProductDescriptionWithSections(paragraphs, detailTemplateDescription)
      : buildLeadOnlyDescription(paragraphs);
  }

  function buildImageDescriptionHtmlForEdit(value: string, image?: Img | null) {
    const imageTemplateDescription = image?.templateDescriptionOverride ?? detailTemplateDescription;
    const paragraphs = descriptionTextToParagraphs(value);
    return imageTemplateDescription.trim()
      ? formatProductDescriptionWithSections(paragraphs, imageTemplateDescription)
      : buildLeadOnlyDescription(paragraphs);
  }

  function buildUserHintsForImage(image: Img) {
    const activeTitleHint = clampTitleForListing(
      editingField === "title"
        ? editableTitleDraft
        : detailTitle || image.final || image.originalListingTitle || image.cleaned
    );
    const fallbackBuyerDescription = splitDetailDescriptionForDisplay(
      image.templateDescriptionOverride ?? detailTemplateDescription,
      image.aiDraft?.leadParagraphs || [],
      image.finalDescription
    ).buyerFacingDescription;
    const activeDescriptionHint = clampDescriptionForListing(
      editingField === "description"
        ? editableDescriptionDraft
        : detailBuyerDescription || fallbackBuyerDescription
    );
    const descriptionParagraphs = descriptionTextToParagraphs(activeDescriptionHint).slice(0, 2);
    const seen = new Set<string>();

    return [
      activeTitleHint,
      ...image.tags.map((tag) => String(tag || "").trim()),
      ...descriptionParagraphs,
    ]
      .map((hint) => hint.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((hint) => {
        const key = hint.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  function buildLegacyContextForImage(image: Img) {
    if (image.sourceType !== "imported") return undefined;

    const legacyParts = [
      image.originalListingTitle?.trim()
        ? `Legacy title: ${image.originalListingTitle.trim()}`
        : "",
      image.originalListingDescription?.trim()
        ? `Legacy description: ${image.originalListingDescription.trim()}`
        : "",
    ].filter(Boolean);

    return legacyParts.length > 0 ? legacyParts.join("\n") : undefined;
  }

  async function runAiListingForImage(
    nextImage: Img,
    options: {
      userHints?: string[];
      legacyContext?: string;
      titleSeed?: string;
      preserveVisibleCopyOnFailure?: boolean;
      targetField?: "title" | "description" | "full";
    } = {}
  ) {
    const requestTemplateDescription = nextImage.templateDescriptionOverride ?? templateDescription;
    const requestTemplateReference = nextImage.templateReferenceOverride ?? (template?.reference || "");
    const requestTemplateKey = `${requestTemplateReference || "no-template"}::${requestTemplateDescription.trim()}`;
    const requestUsesGlobalTemplate = !nextImage.templateDescriptionOverride;
    const requestOwner = Symbol(nextImage.id);

    aiLoopBusyRef.current = requestOwner;
    setImages((current) =>
      current.map((img) =>
        img.id === nextImage.id
          ? {
              ...img,
              aiProcessing: true,
              aiFieldStates: createAiFieldStates("loading"),
              status: "pending",
              statusReason: "",
            }
          : img
      )
    );

    try {
      const imageDataUrl = await readDataUrl(nextImage.file);
      const requestProductFamily = nextImage.productFamilyOverride || resolveProductFamily(nextImage.cleaned, requestTemplateDescription);
      const sterileTemplateContext = buildTemplateContext(requestTemplateDescription, requestProductFamily);
      const legacyContext = options.legacyContext || buildLegacyContextForImage(nextImage);
      const data = await requestAiListing({
        imageDataUrl,
        title: options.titleSeed || nextImage.originalListingTitle || undefined,
        fileName: nextImage.name,
        templateContext: sterileTemplateContext,
        productFamily: requestProductFamily,
        userHints: options.userHints?.length ? options.userHints : undefined,
        legacyContext,
      });
      if (requestUsesGlobalTemplate && activeTemplateKeyRef.current !== requestTemplateKey) return;

      const qcApproved = data.qcApproved;
      if (!qcApproved) {
        setImages((current) =>
          current.map((img) => {
            if (img.id !== nextImage.id) return img;

            if (!options.preserveVisibleCopyOnFailure) {
              return {
                ...img,
                final: "",
                finalDescription: "",
                tags: [],
                aiProcessing: false,
                aiFieldStates: {
                  title: "error",
                  description: "error",
                  tags: "error",
                },
                status: "error",
                statusReason: "",
                processedTemplateKey: requestTemplateKey,
                aiDraft: undefined,
              };
            }

            const preservedBuyerDescription = splitDetailDescriptionForDisplay(
              img.templateDescriptionOverride ?? templateDescription,
              img.aiDraft?.leadParagraphs || [],
              img.finalDescription
            ).buyerFacingDescription;

            return {
              ...img,
              aiProcessing: false,
              aiFieldStates: {
                title: cleanTitle(String(img.final || img.aiDraft?.title || "")).trim() ? "ready" : "error",
                description: preservedBuyerDescription.trim() ? "ready" : "error",
                tags: img.tags.some((tag) => String(tag || "").trim()) ? "ready" : "error",
              },
              status: "error",
              statusReason: "",
              processedTemplateKey: requestTemplateKey,
            };
          })
        );
        return;
      }

      const fallbackTitle = clampTitleForListing(safeTitle(nextImage.final, nextImage.cleaned));
      const titleFromApi = data.title;
      const finalTitle = clampTitleForListing(safeTitle(titleFromApi, fallbackTitle));
      const descriptionText = clampDescriptionForListing(normalizeDescriptionText(data.description));
      const descriptionParagraphs = normalizeAiLeadParagraphs(
        data.leadParagraphs.length
          ? data.leadParagraphs
          : descriptionTextToParagraphs(descriptionText)
      );
      const finalDescription = descriptionParagraphs.length
        ? (
          requestTemplateDescription.trim()
            ? formatProductDescriptionWithSections(descriptionParagraphs, requestTemplateDescription)
            : buildLeadOnlyDescription(descriptionParagraphs)
      )
        : "";
      const tags = normalizeTagsFromPayload(data.tags).slice(0, LISTING_LIMITS.tagCount);
      const finalLead = descriptionParagraphs;
      const confidence = clamp(Number(data.confidence), 0, 1);
      const reasonFlags = data.reasonFlags;
      const grade = data.grade;
      const source = data.source;
      const publishReady = data.publishReady;
      const hasCompleteStructuredOutput = !!finalTitle && !!finalDescription && tags.length > 0;
      if (!hasCompleteStructuredOutput) {
        throw new Error("HTTP 502: Quantum AI returned incomplete structured output.");
      }
      const nextFieldStates: AiFieldStates = publishReady
        ? {
            title: "ready",
            description: "ready",
            tags: "ready",
          }
        : {
            title: "error",
            description: "error",
            tags: "error",
          };
      const status: ItemStatus =
        publishReady
          ? "ready"
          : "error";
      const targetField = options.targetField || "full";
      const currentVisibleTitle = safeTitle(nextImage.final, nextImage.originalListingTitle || nextImage.cleaned);
      const currentBuyerDescription = splitDetailDescriptionForDisplay(
        requestTemplateDescription,
        nextImage.aiDraft?.leadParagraphs || [],
        nextImage.finalDescription
      ).buyerFacingDescription;
      const currentVisibleDescription = currentBuyerDescription
        ? buildImageDescriptionHtmlForEdit(currentBuyerDescription, nextImage)
        : "";
      const currentVisibleTags = normalizeTagsFromPayload(nextImage.tags).slice(0, LISTING_LIMITS.tagCount);
      const targetedPublishReady =
        targetField === "full"
          ? publishReady
          : qcApproved
            && !!(targetField === "title" ? finalTitle : currentVisibleTitle)
            && !!(targetField === "description" ? finalDescription : currentVisibleDescription)
            && currentVisibleTags.length > 0;
      const nextStatus: ItemStatus = targetedPublishReady ? "ready" : "error";
      const nextStatusReason = "";
      const visibleTitle =
        targetField === "description"
          ? currentVisibleTitle
          : safeTitle(finalTitle, currentVisibleTitle);
      const visibleDescription =
        targetField === "title"
          ? currentVisibleDescription
          : finalDescription || currentVisibleDescription;
      const visibleTags =
        targetField === "full"
          ? (publishReady ? tags : [])
          : currentVisibleTags;

      setImages((current) =>
        current.map((img) =>
          img.id === nextImage.id
            ? {
                ...img,
                final: visibleTitle,
                finalDescription: visibleDescription,
                tags: visibleTags,
                aiProcessing: false,
                aiFieldStates:
                  targetField === "title"
                    ? {
                        ...img.aiFieldStates,
                        title: visibleTitle ? "ready" : "error",
                      }
                    : targetField === "description"
                      ? {
                          ...img.aiFieldStates,
                          description: visibleDescription ? "ready" : "error",
                        }
                      : nextFieldStates,
                status: targetField === "full" ? status : nextStatus,
                statusReason: nextStatusReason,
                processedTemplateKey: requestTemplateKey,
                aiDraft: {
                  title: targetField === "description" ? (img.aiDraft?.title || currentVisibleTitle) : finalTitle,
                  leadParagraphs: targetField === "title" ? (img.aiDraft?.leadParagraphs || finalLead) : finalLead,
                  model: data.model || AI_MODEL_LABEL,
                  confidence,
                  templateReference: requestTemplateReference,
                  reasonFlags,
                  source,
                  grade,
                  qcApproved,
                  publishReady: targetField === "full" ? publishReady : targetedPublishReady,
                },
              }
            : img
        )
      );
    } catch (error) {
      if (requestUsesGlobalTemplate && activeTemplateKeyRef.current !== requestTemplateKey) return;
      console.error(error);
      logErrorToConsole("[MerchQuantum] AI listing failed", error);
      setImages((current) =>
        current.map((img) => {
          if (img.id !== nextImage.id) return img;

          if (!options.preserveVisibleCopyOnFailure) {
            return {
              ...img,
              aiProcessing: false,
              aiFieldStates: {
                title: "error",
                description: "error",
                tags: "error",
              },
              status: "error",
              statusReason: "",
              processedTemplateKey: requestTemplateKey,
              aiDraft: undefined,
            };
          }

          const preservedBuyerDescription = splitDetailDescriptionForDisplay(
            img.templateDescriptionOverride ?? templateDescription,
            img.aiDraft?.leadParagraphs || [],
            img.finalDescription
          ).buyerFacingDescription;
          const preservedFieldStates: AiFieldStates = {
            title: cleanTitle(String(img.final || img.aiDraft?.title || "")).trim() ? "ready" : "error",
            description: preservedBuyerDescription.trim() ? "ready" : "error",
            tags: img.tags.some((tag) => String(tag || "").trim()) ? "ready" : "error",
          };

          return {
            ...img,
            aiProcessing: false,
            aiFieldStates: preservedFieldStates,
            status: "error",
            statusReason: "",
            processedTemplateKey: requestTemplateKey,
          };
        })
      );
    } finally {
      if (aiLoopBusyRef.current === requestOwner) {
        aiLoopBusyRef.current = null;
      }
    }
  }

  function beginInlineEdit(field: Exclude<InlineEditableField, null>) {
    if (field === "title") {
      if (!canEditDetailTitle) return;
      setEditableTitleDraft(shouldAwaitQuantumTitle ? "" : detailTitle || "");
    } else {
      if (!canEditDetailDescription) return;
      setEditableDescriptionDraft(shouldAwaitQuantumDescription ? "" : detailBuyerDescription || "");
    }

    setInlineSaveFeedback(null);
    setEditingField(field);
  }

  async function commitInlineEdit(field: Exclude<InlineEditableField, null>, rawValue: string) {
    const nextValue = (
      field === "title"
        ? clampTitleForListing(rawValue)
        : clampDescriptionForListing(rawValue)
    ).replace(/\r\n?/g, "\n").trim();
    const previousValue = (field === "title" ? detailTitle : detailBuyerDescription).trim();

    if (!nextValue) {
      setEditingField(null);
      setInlineFeedbackState(field, "error", `${field === "title" ? "Title" : "Description"} cannot be blank.`);
      return;
    }

    if (nextValue === previousValue) {
      setEditingField(null);
      setInlineSaveFeedback(null);
      return;
    }

    if (selectedImage && canEditSelectedImageCopy) {
      setImages((current) =>
        current.map((img) => {
          if (img.id !== selectedImage.id) return img;

          const currentBuyerDescription = splitDetailDescriptionForDisplay(
            img.templateDescriptionOverride ?? templateDescription,
            img.aiDraft?.leadParagraphs || [],
            img.finalDescription
          ).buyerFacingDescription;
          const nextTitle = field === "title"
            ? nextValue
            : clampTitleForListing(
              safeTitle(img.final, img.aiDraft?.title || img.originalListingTitle || img.cleaned)
            );
          const nextBuyerDescription = field === "description"
            ? nextValue
            : currentBuyerDescription;
          const nextLeadParagraphs = descriptionTextToParagraphs(nextBuyerDescription);
          const nextDescriptionHtml = buildImageDescriptionHtmlForEdit(nextBuyerDescription, img);
          const preservedTags = normalizeTagsFromPayload(img.tags).slice(0, LISTING_LIMITS.tagCount);
          const derivedTags = preservedTags.length > 0
            ? preservedTags
            : buildManualOverrideTags(nextTitle, nextBuyerDescription, LISTING_LIMITS.tagCount);
          const readyAfterManualOverride =
            canManualOverrideFlaggedImage(img)
            && canManualOverrideListingCopy(nextTitle, nextBuyerDescription)
            && derivedTags.length > 0;

          return {
            ...img,
            final: nextTitle,
            finalDescription: nextDescriptionHtml,
            tags: readyAfterManualOverride ? derivedTags : preservedTags,
            aiFieldStates: readyAfterManualOverride
              ? {
                  title: "ready",
                  description: "ready",
                  tags: derivedTags.length > 0 ? "ready" : "error",
                }
              : {
                  ...img.aiFieldStates,
                  [field]: "ready",
                },
            status: readyAfterManualOverride ? "ready" : "error",
            statusReason: readyAfterManualOverride
              ? "Manual override approved this draft for upload."
              : img.statusReason,
            aiDraft: {
              title: nextTitle,
              leadParagraphs: nextLeadParagraphs,
              model: img.aiDraft?.model || AI_MODEL_LABEL,
              confidence: Math.max(img.aiDraft?.confidence || 0, readyAfterManualOverride ? 0.74 : 0.52),
              templateReference:
                img.aiDraft?.templateReference
                || img.templateReferenceOverride
                || template?.reference
                || "",
              reasonFlags: readyAfterManualOverride
                ? ["Manual override completed the missing listing fields."]
                : img.aiDraft?.reasonFlags || [],
              source: img.aiDraft?.source || "fallback",
              grade: readyAfterManualOverride ? "green" : (img.aiDraft?.grade || "red"),
              qcApproved: img.aiDraft?.qcApproved !== false,
              publishReady: readyAfterManualOverride,
            },
          };
        })
      );

      setEditingField(null);
      setInlineFeedbackState(
        field,
        "saved",
        canManualRescueSelectedImage
          ? "Saved and marked Good."
          : "Saved to this draft."
      );
      return;
    }

    if (!template || !shopId || !canEditImportedListing) {
      setEditingField(null);
      setInlineFeedbackState(field, "error", "Select a provider listing before editing metadata.");
      return;
    }

    if (field === "title") {
      setImportedListingTitle(nextValue);
      setTemplate((current) => (current ? { ...current, nickname: nextValue } : current));
    } else {
      setImportedListingDescription(nextValue);
    }

    setManualPrebufferOverride(true);

    if (!supportsProviderMetadataSync || !resolvedProviderId || !hasAnyLoadedImages) {
      setEditingField(null);
      const providerName = selectedProvider?.label || "This provider";
      setInlineFeedbackState(
        field,
        "saved",
        hasAnyLoadedImages
          ? `${providerName} metadata sync is not live yet, so this change is saved locally.`
          : "Saved locally for this draft."
      );
      return;
    }

    setInlineFeedbackState(field, "saving", field === "title" ? "Saving title..." : "Saving description...", 0);

    try {
      const body =
        field === "title"
          ? {
              provider: resolvedProviderId,
              shopId,
              productId: template.reference,
              title: nextValue,
            }
          : {
              provider: resolvedProviderId,
              shopId,
              productId: template.reference,
              description: buildEditableDescriptionHtml(nextValue),
            };

      const response = await fetchWithTimeout(
        "/api/update-listing-metadata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        30000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Metadata save failed with status ${response.status}.`);
      }

      setEditingField(null);
      setInlineFeedbackState(field, "saved", "Saved to provider.");
    } catch (error) {
      setEditingField(null);
      setInlineFeedbackState(field, "error", formatApiError("metadataSave", error, "[MerchQuantum] metadata save failed"));
    }
  }

  async function rerollSelectedImageField(field: "title" | "description") {
    if (!selectedImage || !canRerollSelectedImage) return;

    const userHints = buildUserHintsForImage(selectedImage);
    const titleSeed = clampTitleForListing(
      editingField === "title"
        ? editableTitleDraft
        : detailTitle || selectedImage.originalListingTitle || selectedImage.final || selectedImage.cleaned
    );

    setInlineSaveFeedback(null);

    await runAiListingForImage(selectedImage, {
      targetField: field,
      userHints,
      legacyContext: buildLegacyContextForImage(selectedImage),
      titleSeed: titleSeed || undefined,
      preserveVisibleCopyOnFailure: true,
    });
  }

  useEffect(() => {
    const previous = previousPreviewUrlsRef.current;
    const current = [...images, ...queuedImages].map((img) => img.preview);

    for (const url of previous) {
      if (url.startsWith("blob:") && !current.includes(url)) {
        URL.revokeObjectURL(url);
      }
    }

    previousPreviewUrlsRef.current = current;
  }, [images, queuedImages]);

  useEffect(() => {
    return () => {
      for (const url of previousPreviewUrlsRef.current) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      window.clearTimeout((triggerAttentionCue as typeof triggerAttentionCue & { timeoutId?: number }).timeoutId);
      clearInlineFeedbackTimer();
    };
  }, []);

  useEffect(() => {
    activeTemplateKeyRef.current = templateKey;
    aiLoopBusyRef.current = null;
    setImages((current) =>
      current.map((img) =>
        img.sourceType === "imported" || img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              processedTemplateKey: undefined,
              aiDraft: undefined,
              aiProcessing: false,
              aiFieldStates: createAiFieldStates("idle"),
              status: "pending",
              statusReason: "",
            }
      )
    );
    setQueuedImages((current) =>
      current.map((img) =>
        img.sourceType === "imported" || img.processedTemplateKey === templateKey
          ? img
          : {
              ...img,
              processedTemplateKey: undefined,
              aiDraft: undefined,
              aiProcessing: false,
              aiFieldStates: createAiFieldStates("idle"),
              status: "pending",
              statusReason: "",
            }
      )
    );
  }, [templateKey]);

  useEffect(() => {
    if (!shopId) {
      setApiProducts([]);
      setProductId("");
      setActiveGridProductId("");
      setTemplate(null);
      setTemplateDescription("");
      setImportedListingTitle("");
      setImportedListingDescription("");
      setWorkspaceMode("");
      setIsRoutingGridExpanded(true);
      setSelectedImportIds([]);
      setPendingTemplateSelectionIds([]);
      setBulkEditGridPage(0);
      setCreateTemplateGridPage(0);
      setLastSelectedIndex(null);
      setImportStatus("");
      setEditingField(null);
      setInlineSaveFeedback(null);
      return;
    }

    if (productId && !visibleProducts.some((product) => product.id === productId)) {
      setProductId("");
    }

    if (activeGridProductId && !visibleProducts.some((product) => product.id === activeGridProductId)) {
      setActiveGridProductId("");
    }
  }, [shopId, visibleProducts, productId, activeGridProductId]);

  useEffect(() => {
    if (bulkEditGridPage > bulkEditTotalPages - 1) {
      setBulkEditGridPage(Math.max(0, bulkEditTotalPages - 1));
    }
  }, [bulkEditGridPage, bulkEditTotalPages, isBulkEditMode]);

  useEffect(() => {
    if (createTemplateGridPage > createTemplateTotalPages - 1) {
      setCreateTemplateGridPage(Math.max(0, createTemplateTotalPages - 1));
    }
  }, [createTemplateGridPage, createTemplateTotalPages, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      setIsCreateThumbExpandedView(false);
      setCreateThumbGridPage(0);
      return;
    }

    if (createThumbGridPage > createThumbTotalPages - 1) {
      setCreateThumbGridPage(Math.max(0, createThumbTotalPages - 1));
    }
  }, [createThumbGridPage, createThumbTotalPages, isCreateMode]);

  useEffect(() => {
    setBulkEditGridPage(0);
    setCreateTemplateGridPage(0);
    setLastSelectedIndex(null);
  }, [shopId, workspaceMode]);

  useEffect(() => {
    if (!connected || !shopId || !workspaceMode || loadingProducts || apiProducts.length > 0 || !!apiStatus) return;
    void loadProductsForShop(shopId);
  }, [apiProducts.length, apiStatus, connected, loadingProducts, shopId, workspaceMode]);

  useEffect(() => {
    if (!shopId || !productId) {
      setTemplate(null);
      setTemplateDescription("");
      setImportedListingTitle("");
      setImportedListingDescription("");
      setManualPrebufferOverride(false);
      setEditingField(null);
      setInlineSaveFeedback(null);
      return;
    }

    void loadProductTemplate(productId);
  }, [shopId, productId]);

  useEffect(() => {
    setEditingField(null);
    setInlineSaveFeedback(null);
  }, [selectedId, template?.reference]);

  useEffect(() => {
    if (!templateReadyForAi && !images.some((img) => img.sourceType === "imported")) return;
    if (aiLoopBusyRef.current) return;
    const nextImage = images.find((img) => {
      if (img.aiProcessing) return false;
      const nextTemplateDescription = img.templateDescriptionOverride ?? templateDescription;
      const nextReference = img.templateReferenceOverride ?? template?.reference ?? "no-template";
      const nextProcessingKey = `${nextReference}::${nextTemplateDescription.trim()}`;
      return img.processedTemplateKey !== nextProcessingKey;
    });
    if (!nextImage) return;
    void runAiListingForImage(nextImage);
  }, [LISTING_LIMITS.tagCount, images, template, templateDescription, templateKey, templateReadyForAi]);

  useEffect(() => {
    if (queuedImportedImages.length === 0) return;

    const settledApprovedImported = images.filter(
      (img) =>
        img.sourceType === "imported"
        && !img.aiProcessing
        && getResolvedItemStatus(img) === "ready"
    );

    if (settledApprovedImported.length === 0) return;

    const archivedIds = new Set(settledApprovedImported.map((img) => img.id));
    const remainingActive = images.filter((img) => !archivedIds.has(img.id));
    const { active: nextActive, queued: nextQueued } = fillActiveBatch(remainingActive, queuedImages, activeBatchLimit);

    setCompletedImportedImages((current) => [...current, ...settledApprovedImported]);
    setImages(nextActive);
    setQueuedImages(nextQueued);
    if (!selectedId || archivedIds.has(selectedId)) {
      setSelectedId(nextActive[0]?.id || "");
    }
  }, [activeBatchLimit, images, queuedImages, queuedImportedImages, selectedId]);

  function resetProviderState(clearStatus = true) {
    setConnected(false);
    setLoadingApi(false);
    setPulseConnected(false);
    setIsDisconnectArmed(false);
    setIsTokenInputFocused(false);
    if (clearStatus) setApiStatus("");
    setApiShops([]);
    setApiProducts([]);
    setLoadingProducts(false);
    setShopId("");
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");
    setWorkspaceMode("");
    setIsRoutingGridExpanded(true);
    setIsWorkspaceSelectionCollapsed(getStoredWorkspaceSelectionCondensed());
    setManualPrebufferOverride(false);
    setBatchResults([]);
    setRunStatus("");
    setEditingField(null);
    setInlineSaveFeedback(null);
    setSelectedImportIds([]);
    setImportStatus("");
    setIsImportingListings(false);
    setImages([]);
    setCompletedImportedImages([]);
    setQueuedImages([]);
    setSelectedId("");
  }

  function clearPreviewWorkspace() {
    setImages([]);
    setCompletedImportedImages([]);
    setQueuedImages([]);
    setSelectedId("");
    setIsCreateThumbExpandedView(false);
    setCreateThumbGridPage(0);
    setBatchResults([]);
    setRunStatus("");
    setImportStatus("");
    setManualPrebufferOverride(false);
  }

  function handleWorkspaceModeChange(nextMode: WorkspaceMode) {
    setWorkspaceMode(nextMode);
    setIsRoutingGridExpanded(!nextMode);
    setIsWorkspaceSelectionCollapsed(getStoredWorkspaceSelectionCondensed());
    setProductId("");
    setActiveGridProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");
    setSelectedImportIds([]);
    setPendingTemplateSelectionIds([]);
    setLastSelectedIndex(null);
    setEditingField(null);
    setInlineSaveFeedback(null);
    clearPreviewWorkspace();

    if (nextMode === "edit") {
      setImportStatus("");
    }
  }

  function handleShopSelection(nextShopId: string) {
    setShopId(nextShopId);
    setApiProducts([]);
    setWorkspaceMode("");
    setIsRoutingGridExpanded(true);
    setIsWorkspaceSelectionCollapsed(getStoredWorkspaceSelectionCondensed());
    setProductId("");
    setActiveGridProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");
    setSelectedImportIds([]);
    setPendingTemplateSelectionIds([]);
    setBulkEditGridPage(0);
    setCreateTemplateGridPage(0);
    setLastSelectedIndex(null);
    clearPreviewWorkspace();
    setEditingField(null);
    setInlineSaveFeedback(null);
  }

  function openArtworkPicker() {
    if (!isCreateMode || !connected || !isWorkspaceConfigured) {
      nudgeWorkflow(true);
      return;
    }

    fileRef.current?.click();
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    if (!connected) return;
    const incoming = Array.from(list);
    const imageFiles = incoming.filter(isImage);
    const ignoredByType = incoming.length - imageFiles.length;
    const existingSignatures = new Set(
      [...images, ...completedImportedImages, ...queuedImages]
        .map((entry) => getFileSignature(entry.file))
        .filter(Boolean)
    );
    const uniqueImageFiles = imageFiles.filter((file) => {
      const signature = getFileSignature(file);
      if (existingSignatures.has(signature)) return false;
      existingSignatures.add(signature);
      return true;
    });
    const currentTotal = images.length + queuedImages.length;
    const room = Math.max(0, totalBatchLimit - currentTotal);
    const accepted = uniqueImageFiles.slice(0, room);
    const ignoredByLimit = Math.max(0, uniqueImageFiles.length - accepted.length);

    const good = await Promise.all(accepted.map(async (file) => {
      const cleaned = cleanTitle(file.name);
      const preview = createPreviewObjectUrl(file);
      return {
        id: makeId(),
        name: file.name,
        file,
        preview,
        cleaned,
        final: cleaned,
        finalDescription: "",
        tags: [],
        status: "pending" as ItemStatus,
        statusReason: "",
        aiFieldStates: createAiFieldStates("idle"),
      } satisfies Img;
    }));

    const { active: mergedActive, queued: mergedQueued } = appendToActiveBatch(images, queuedImages, good, activeBatchLimit);
    setImages(mergedActive);
    setQueuedImages(mergedQueued);
    if (!selectedId && mergedActive[0]) setSelectedId(mergedActive[0].id);

    const parts: string[] = [];
    if (mergedActive.length !== images.length || mergedQueued.length) {
      parts.push(`Loaded ${good.length} image${good.length === 1 ? "" : "s"}.`);
    }
    if (mergedQueued.length) {
      parts.push(`Queued ${mergedQueued.length} for later batches.`);
    }
    if (ignoredByType) parts.push(`Ignored ${ignoredByType} non-image file${ignoredByType === 1 ? "" : "s"}.`);
    if (ignoredByLimit) {
      parts.push(`Ignored ${ignoredByLimit} image${ignoredByLimit === 1 ? "" : "s"} above the ${CONNECTED_TOTAL_BATCH_FILES}-image total cap.`);
    }
  }

  async function loadProductsForShop(nextShopId: string) {
    if (!connected || !isLiveProvider || !nextShopId || !resolvedProviderId) {
      setApiProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    try {
      const response = await fetchWithTimeout(
        `${getProviderRoute("products")}?provider=${encodeURIComponent(resolvedProviderId)}&shopId=${encodeURIComponent(nextShopId)}`
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `Products request failed with status ${response.status}.`);

      const mapped: Product[] = Array.isArray(data?.products)
        ? data.products.map((product: ApiProduct) => ({
            id: product.id,
            title: product.title || product.id,
            type: "Template",
            shopId: String(product.shop_id ?? nextShopId),
            description: product.description || "",
            previewUrl: product.preview_url || "",
          }))
        : [];

      setApiProducts(mapped);
      setApiStatus(mapped.length === 0 ? "No products were found for this shop." : "");
    } catch (error) {
      setApiProducts([]);
      setApiStatus(formatApiError("providerLoad", error, "[MerchQuantum] product load failed"));
    } finally {
      setLoadingProducts(false);
    }
  }

  async function connectProvider(tokenOverride?: string) {
    const submittedToken = String(tokenOverride ?? token).trim();
    if (!provider || !resolvedProviderId || !submittedToken || !isLiveProvider) return;
    setLoadingApi(true);
    setApiStatus("");

    try {
      const response = await fetchWithTimeout(getProviderRoute("connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: resolvedProviderId, token: submittedToken }),
      });

      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `${selectedProvider?.label || "Provider"} connect failed with status ${response.status}.`);

      const shopsFromApi: Shop[] = Array.isArray(data?.shops)
        ? data.shops.map((shop: ApiShop) => ({ id: String(shop.id), title: shop.title || `Shop ${shop.id}` }))
        : [];

      if (providerTokenStorageKey) {
        window.localStorage.setItem(providerTokenStorageKey, submittedToken);
      }
      setToken(submittedToken);
      setApiShops(shopsFromApi);
      setConnected(true);
      setIsDisconnectArmed(false);
      setIsTokenInputFocused(false);
      setShopId("");
      setWorkspaceMode("");
      setIsRoutingGridExpanded(true);
      setProductId("");
      setTemplate(null);
      setTemplateDescription("");
      setApiProducts([]);
      setPulseConnected(true);
      setTimeout(() => setPulseConnected(false), 1200);
      if (shopsFromApi.length === 0) {
        setApiStatus("No shops were returned for this provider connection.");
        return;
      }
    } catch (error) {
      logErrorToConsole("[MerchQuantum] provider connect failed", error);
      resetProviderState(false);
      setApiStatus(getUserFacingErrorMessage("connection"));
    } finally {
      setLoadingApi(false);
    }
  }

  async function disconnectProvider() {
    try {
      await fetchWithTimeout(getProviderRoute("disconnect"), { method: "POST" });
    } catch {
      // local reset only
    } finally {
      setIsDisconnectArmed(false);
      setIsTokenInputFocused(false);
      if (providerTokenStorageKey) {
        window.localStorage.removeItem(providerTokenStorageKey);
      }
      setToken("");
      resetProviderState(true);
      setApiStatus("");
    }
  }

  async function loadProductTemplate(nextProductId = productId) {
    const fallback = productSource.find((p) => p.id === nextProductId);
    if (!fallback || !shopId || !resolvedProviderId) return;

    setLoadingTemplateDetails(true);
    try {
      const response = await fetchWithTimeout(
        `${getProviderRoute("product")}?provider=${encodeURIComponent(resolvedProviderId)}&shopId=${encodeURIComponent(shopId)}&productId=${encodeURIComponent(nextProductId)}`
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) throw new Error(data?.error || `Product request failed with status ${response.status}.`);

      const responseData = (data || {}) as ApiTemplateResponse;
      const chosen = responseData.product || fallback;
      const title = chosen?.title || fallback.title;
      const usingFallbackDescription = !chosen?.description?.trim();
      const rawTemplateDescription =
        chosen?.description?.trim() ||
          fallback.description?.trim() ||
          "";
      const base = sanitizeTemplateDescriptionForPrebuffer(rawTemplateDescription, title);
      const importedBuyerDescription = extractBuyerFacingDescriptionFromListing(rawTemplateDescription, base);
      const nextPlacementGuide = responseData.placementGuide || template?.placementGuide || DEFAULT_PLACEMENT_GUIDE;

      setTemplate({
        reference: chosen?.id || fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
        placementGuide: nextPlacementGuide,
      });
      setTemplateDescription(base);
      setImportedListingTitle(title);
      setImportedListingDescription(importedBuyerDescription);
      setManualPrebufferOverride(false);
      setApiStatus(
        !base
          ? "Static provider product specs were not available in this template response."
          : usingFallbackDescription
            ? "Live template specs are unavailable here, so MerchQuantum is preserving the saved provider spec block from this response."
            : ""
      );
    } catch (error) {
      const title = fallback.title;
      const base = sanitizeTemplateDescriptionForPrebuffer(fallback.description?.trim() || "", title);
      const importedBuyerDescription = extractBuyerFacingDescriptionFromListing(fallback.description?.trim() || "", base);

      setTemplate({
        reference: fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
        placementGuide: template?.placementGuide || DEFAULT_PLACEMENT_GUIDE,
      });
      setTemplateDescription(base);
      setImportedListingTitle(title);
      setImportedListingDescription(importedBuyerDescription);
      setManualPrebufferOverride(false);
      const baseStatus = formatApiError("providerLoad", error, "[MerchQuantum] template load failed");
      setApiStatus(base ? baseStatus : `${baseStatus} Static provider product specs were not available in this template response.`);
    } finally {
      setLoadingTemplateDetails(false);
    }
  }

  function getSelectionRangeIds(startIndex: number, endIndex: number) {
    const rangeStart = Math.min(startIndex, endIndex);
    const rangeEnd = Math.max(startIndex, endIndex);
    return visibleProducts.slice(rangeStart, rangeEnd + 1).map((product) => product.id);
  }

  function handleBulkEditThumbnailSelection(
    sourceId: string,
    index: number,
    options?: { shiftKey?: boolean }
  ) {
    setActiveGridProductId(sourceId);
    const nextSelections = options?.shiftKey && lastSelectedIndex !== null
      ? normalizeSelectionIds([...pendingTemplateSelectionIds, ...getSelectionRangeIds(lastSelectedIndex, index)])
      : pendingTemplateSelectionIds.includes(sourceId)
        ? pendingTemplateSelectionIds.filter((entry) => entry !== sourceId)
        : normalizeSelectionIds([...pendingTemplateSelectionIds, sourceId]);

    setPendingTemplateSelectionIds(nextSelections);
    setLastSelectedIndex(index);
  }

  async function handleCreateTemplateSelection(sourceId: string, index: number) {
    setActiveGridProductId(sourceId);
    setLastSelectedIndex(index);
    await commitTemplateSelections(selectedImportIds.includes(sourceId) ? [] : [sourceId]);
  }

  async function commitTemplateSelections(sourceIds: string[]) {
    const normalizedSelections = normalizeSelectionIds(sourceIds);
    const nextSelections = isCreateMode ? normalizedSelections.slice(0, 1) : normalizedSelections;
    const selectionChanged = !selectionsMatch(nextSelections, selectedImportIds);

    setSelectedImportIds(nextSelections);
    setPendingTemplateSelectionIds(nextSelections);
    if (isCreateMode) {
      setActiveGridProductId(nextSelections[0] || "");
    }
    if (nextSelections.length === 0) {
      setLastSelectedIndex(null);
    }
    setEditingField(null);
    setInlineSaveFeedback(null);

    if (!selectionChanged) {
      if (isBulkEditMode && nextSelections.length > 0) {
        setImportStatus("");
      }
      return;
    }

    clearPreviewWorkspace();
    setProductId("");
    setTemplate(null);
    setTemplateDescription("");
    setImportedListingTitle("");
    setImportedListingDescription("");

    if (nextSelections.length === 0) {
      setImportStatus("");
      return;
    }

    if (isCreateMode) {
      setImportStatus("");
      setProductId(nextSelections[0]);
      return;
    }

    setImportStatus(`Loading ${nextSelections.length} provider listing${nextSelections.length === 1 ? "" : "s"} for SEO tuning...`);
    await importSelectedListings(nextSelections, { replaceExisting: true });
  }

  function buildImportedImageSeed(record: ImportedListingRecord, file: File, preview: string, artworkBounds: ArtworkBounds): Img {
    const titleSeed = clampTitleForListing(record.title || record.artwork?.fileName || "Recovered Artwork");
    const cleaned = cleanTitle(titleSeed || record.artwork?.fileName || record.id);
    const staticSpecBlock = sanitizeTemplateDescriptionForPrebuffer(record.templateDescription || record.description || "", record.title);
    const buyerDescription = clampDescriptionForListing(
      extractBuyerFacingDescriptionFromListing(record.description || "", staticSpecBlock)
    );

    return {
      id: makeId(),
      name: titleSeed || cleaned,
      file,
      preview,
      cleaned,
      final: titleSeed || cleaned,
      finalDescription: "",
      tags: [],
      status: "pending",
      statusReason: "",
      aiFieldStates: createAiFieldStates("idle"),
      artworkBounds,
      sourceType: "imported",
      providerId: resolvedProviderId as ProviderId,
      providerStoreId: record.storeId,
      providerProductId: record.id,
      templateDescriptionOverride: staticSpecBlock,
      templateReferenceOverride: normalizeRef(record.id) || record.id,
      productFamilyOverride: resolveProductFamily(titleSeed || cleaned, staticSpecBlock),
      importedArtwork: record.artwork,
      originalListingTitle: titleSeed || cleaned,
      originalListingDescription: buyerDescription,
      syncState: "idle",
      syncMessage: "Awaiting Quantum AI rewrite.",
    };
  }

  async function importSelectedListings(
    sourceIdsOverride = selectedImportIds,
    options: { replaceExisting?: boolean } = {}
  ) {
    const sourceIds = normalizeSelectionIds(sourceIdsOverride);
    if (!resolvedProviderId || !shopId || sourceIds.length === 0) {
      return;
    }

    const existingImportedCount = options.replaceExisting ? 0 : importedQueueCount;
    const existingImportedIds = options.replaceExisting ? new Set<string>() : importedProductIds;
    const remainingCapacity = Math.max(0, IMPORT_QUEUE_LIMIT - existingImportedCount);
    if (remainingCapacity === 0) {
      setImportStatus(`The workspace is capped at ${IMPORT_QUEUE_LIMIT} listings in this pass.`);
      return;
    }

    const uniqueIds = Array.from(new Set(sourceIds));
    const duplicateIds = uniqueIds.filter((id) => existingImportedIds.has(id));
    const idsToImport = uniqueIds
      .filter((id) => !existingImportedIds.has(id))
      .slice(0, remainingCapacity);
    const skippedByLimit = Math.max(0, uniqueIds.length - duplicateIds.length - idsToImport.length);

    if (idsToImport.length === 0) {
      setImportStatus(duplicateIds.length > 0 ? "Those provider listings are already loaded in the review queue." : "Select at least one provider listing to import.");
      return;
    }

    setIsImportingListings(true);
    setImportStatus(`Importing ${idsToImport.length} provider listing${idsToImport.length === 1 ? "" : "s"}...`);

    try {
      const response = await fetchWithTimeout(
        "/api/providers/import-listings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: resolvedProviderId,
            shopId,
            sourceIds: idsToImport,
          }),
        },
        60000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Import request failed with status ${response.status}.`);
      }

      const importedRecords: ImportedListingRecord[] = Array.isArray(data?.items)
        ? data.items.map((item: ImportedListingRecord) => ({
            id: String(item.id || ""),
            storeId: String(item.storeId || shopId),
            title: String(item.title || ""),
            description: String(item.description || ""),
            tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || "")) : [],
            templateDescription: String(item.templateDescription || ""),
            artwork: item.artwork || null,
          }))
        : [];

      const rescued: Img[] = [];
      let skippedMissingArtwork = 0;
      let skippedFailedRescue = 0;

      for (const record of importedRecords) {
        if (!record.artwork?.url) {
          skippedMissingArtwork += 1;
          continue;
        }

        try {
          const fallbackFileName = `${cleanTitle(record.title || record.artwork.fileName || "Recovered Artwork") || "Recovered Artwork"}.png`;
          const file = await urlToFile(record.artwork.url, record.artwork.fileName || fallbackFileName, record.artwork.contentType || "image/png");
          const preview = createPreviewObjectUrl(file);
          const artworkBounds = await analyzeArtworkBounds(file);
          rescued.push(buildImportedImageSeed(record, file, preview, artworkBounds));
        } catch {
          skippedFailedRescue += 1;
        }
      }

      let queuedImportedAfterImport = queuedImportedImages.length;
      if (rescued.length > 0) {
        const baseActive = options.replaceExisting ? [] : images;
        const baseQueued = options.replaceExisting ? [] : queuedImages;
        const { active: mergedActive, queued: mergedQueued } = appendToActiveBatch(baseActive, baseQueued, rescued, activeBatchLimit);
        if (options.replaceExisting) {
          setCompletedImportedImages([]);
        }
        setImages(mergedActive);
        setQueuedImages(mergedQueued);
        setSelectedId(mergedActive[0]?.id || "");
        queuedImportedAfterImport = mergedQueued.filter((img) => img.sourceType === "imported").length;
      }

      const summary: string[] = [];
      if (rescued.length > 0 && queuedImportedAfterImport > 0) {
        summary.push(`${queuedImportedAfterImport} listing${queuedImportedAfterImport === 1 ? "" : "s"} are waiting behind the active review set.`);
      }
      if (duplicateIds.length > 0) {
        summary.push(`Skipped ${duplicateIds.length} duplicate${duplicateIds.length === 1 ? "" : "s"}.`);
      }
      if (skippedByLimit > 0) {
        summary.push(`Skipped ${skippedByLimit} above the ${IMPORT_QUEUE_LIMIT}-item import cap.`);
      }
      if (skippedMissingArtwork > 0) {
        summary.push(`${skippedMissingArtwork} listing${skippedMissingArtwork === 1 ? "" : "s"} did not expose recoverable artwork.`);
      }
      if (skippedFailedRescue > 0) {
        summary.push(`${skippedFailedRescue} artwork rescue${skippedFailedRescue === 1 ? "" : "s"} failed during download.`);
      }

      setImportStatus(summary.join(" ") || "No provider listings were imported.");
    } catch (error) {
      setImportStatus(formatApiError("listingImport", error, "[MerchQuantum] listing import failed"));
    } finally {
      setIsImportingListings(false);
    }
  }

  async function syncImportedItems(items: Img[], options: { announce?: boolean } = {}) {
    const announce = options.announce !== false;

    if (!resolvedProviderId || !shopId || items.length === 0) {
      return { syncedItems: [] as Img[], failedCount: 0 };
    }

    if (!supportsImportedListingSync) {
      if (announce) {
        setImportStatus(`${selectedProvider?.label || "This provider"} metadata sync is not available in this pass yet.`);
      }
      return { syncedItems: [] as Img[], failedCount: items.length };
    }

    setIsSyncingImportedListings(true);
    if (announce) {
      setImportStatus(`Syncing ${items.length} approved listing${items.length === 1 ? "" : "s"} back to ${selectedProvider?.label || "the provider"}...`);
    }

    let syncedCount = 0;
    let failedCount = 0;
    const syncedItems: Img[] = [];

    for (const item of items) {
      if (!item.providerProductId) {
        failedCount += 1;
        continue;
      }

      const optimisticSyncEvent = createBatchEvent(
        {
          type: "snapshot.replace",
          snapshot: {
            active: batchProjectionRef.current.active.map((img) =>
              img.id === item.id
                ? {
                    ...img,
                    syncState: "syncing",
                    syncMessage: "Syncing SEO rewrite to provider...",
                  }
                : img
            ),
          },
          authority: "provider",
        },
        {
          source: "provider",
          optimistic: true,
        }
      );
      applyBatchEnvelope(optimisticSyncEvent);

      try {
        const requestBody: Record<string, unknown> = {
          provider: resolvedProviderId,
          shopId,
          productId: item.providerProductId,
          title: item.final,
        };

        if (resolvedProviderId === "printify") {
          requestBody.description = item.finalDescription;
          requestBody.tags = item.tags;
        }

        const response = await fetchWithTimeout(
          "/api/update-listing-metadata",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          },
          60000
        );
        const data = await parseResponsePayload(response);
        if (!response.ok) {
          throw new Error(data?.error || `Metadata sync failed with status ${response.status}.`);
        }

        syncedCount += 1;
        syncedItems.push(item);
        setImages((current) =>
          current.map((img) =>
            img.id === item.id
              ? {
                  ...img,
                  syncState: "synced",
                  syncMessage: "Provider metadata is synced.",
                }
              : img
          )
        );
        acknowledgePendingBatchEvent(optimisticSyncEvent.eventId, "provider");
      } catch (error) {
        failedCount += 1;
        const message = formatApiError("metadataSave", error, "[MerchQuantum] metadata sync failed");
        setImages((current) =>
          current.map((img) =>
            img.id === item.id
              ? {
                  ...img,
                  syncState: "error",
                  syncMessage: message,
                }
              : img
          )
        );
        rejectPendingBatchEvent(optimisticSyncEvent.eventId, message);
      }
    }

    if (announce) {
      setImportStatus(
        failedCount > 0
          ? `Synced ${syncedCount} approved listing${syncedCount === 1 ? "" : "s"} and flagged ${failedCount} for manual review.`
          : `Synced ${syncedCount} approved listing${syncedCount === 1 ? "" : "s"} back to ${selectedProvider?.label || "the provider"}.`
      );
    }
    setIsSyncingImportedListings(false);
    return { syncedItems, failedCount };
  }

  async function publishImportedItems(items: Img[]) {
    if (!resolvedProviderId || !shopId || items.length === 0) {
      setImportStatus("Sync approved listings before sending them to the provider publish step.");
      return;
    }

    if (!supportsImportedPublish) {
      setImportStatus(`${selectedProvider?.label || "This provider"} direct publishing is not available in this pass yet.`);
      return;
    }

    const publishableProductIds = new Set(
      items.map((item) => item.providerProductId).filter((value): value is string => !!value)
    );
    if (publishableProductIds.size === 0) {
      setImportStatus("Sync approved listings before sending them to the provider publish step.");
      return;
    }

    setIsPublishingImportedListings(true);
    setImportStatus(`Publishing ${publishableProductIds.size} synced approved listing${publishableProductIds.size === 1 ? "" : "s"}...`);

    try {
      const response = await fetchWithTimeout(
        "/api/providers/publish-listings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: resolvedProviderId,
            shopId,
            items: items.map((item) => ({
              productId: item.providerProductId,
              title: item.final,
              description: item.finalDescription,
              tags: item.tags,
              publishReady: item.aiDraft?.publishReady === true,
              qcApproved: item.aiDraft?.qcApproved !== false,
            })),
          }),
        },
        60000
      );
      const data = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(data?.error || `Publish request failed with status ${response.status}.`);
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const publishedIds = new Set<string>();
      const errorMessages = new Map<string, string>();

      for (const entry of results) {
        const productId = String(entry?.productId || "").trim();
        const message = String(entry?.message || "").trim();
        if (!productId) continue;
        if (/accepted/i.test(message)) {
          publishedIds.add(productId);
        } else if (message) {
          errorMessages.set(productId, message);
        }
      }

      setImages((current) =>
        current.map((img) => {
          if (!img.providerProductId || !publishableProductIds.has(img.providerProductId)) {
            return img;
          }

          if (publishedIds.has(img.providerProductId)) {
            return {
              ...img,
              syncMessage: "Provider publish request accepted.",
            };
          }

          if (errorMessages.has(img.providerProductId)) {
            return {
              ...img,
              syncState: "error",
              syncMessage: formatApiError(
                "listingPublish",
                errorMessages.get(img.providerProductId) || null,
                "[MerchQuantum] publish listing failed"
              ),
            };
          }

          return img;
        })
      );

      const failedCount = errorMessages.size;
      setImportStatus(
        failedCount > 0
          ? `Published ${publishedIds.size} listing${publishedIds.size === 1 ? "" : "s"} and left ${failedCount} flagged for follow-up.`
          : `Published ${publishedIds.size} approved listing${publishedIds.size === 1 ? "" : "s"} to ${selectedProvider?.label || "the provider"}.`
      );
    } catch (error) {
      setImportStatus(formatApiError("listingPublish", error, "[MerchQuantum] publish listings failed"));
    } finally {
      setIsPublishingImportedListings(false);
    }
  }

  async function runBulkEditPublishAction() {
    if (approvedImportedItems.length === 0) {
      setImportStatus("Approve at least one rescued listing before publishing.");
      return;
    }

    if (supportsImportedPublish) {
      setImportStatus(`Preparing ${approvedImportedItems.length} approved listing${approvedImportedItems.length === 1 ? "" : "s"} for publish...`);
      const { syncedItems } = await syncImportedItems(approvedImportedItems, { announce: false });
      if (syncedItems.length === 0) {
        setImportStatus("No approved rescued listings were ready to publish after provider sync.");
        return;
      }
      await publishImportedItems(syncedItems);
      return;
    }

    if (supportsImportedListingSync) {
      await syncImportedItems(approvedImportedItems);
      return;
    }

    setImportStatus(`${selectedProvider?.label || "This provider"} publishing is not available in this pass yet.`);
  }

  async function runDraftBatch() {
    if (!template || !shopId || readyCount === 0 || !isLiveProvider || !resolvedProviderId) return;

    const activeImages = images.filter((img) => img.sourceType !== "imported" && getResolvedItemStatus(img) === "ready");
    setIsRunningBatch(true);
    setRunStatus("");
    setBatchResults([]);
    const nextResults: BatchResult[] = [];

    try {
      for (let index = 0; index < activeImages.length; index += 1) {
        const img = activeImages[index];
        const titleForUpload = String(img.final || "").trim();
        const description = String(img.finalDescription || "").trim();
        const tags = img.tags
          .map((tag) => String(tag || "").trim())
          .filter(Boolean);

        setRunStatus(`Uploading draft ${index + 1} of ${activeImages.length}...`);

        try {
          if (!titleForUpload || !description || tags.length === 0 || img.aiDraft?.publishReady !== true || img.aiDraft?.qcApproved === false) {
            throw new Error("Only Good items with complete Quantum AI output can be uploaded.");
          }

          const imageDataUrl = await readDataUrl(img.file);
          const artworkBounds = img.artworkBounds || (await analyzeArtworkBounds(img.file));
          if (!img.artworkBounds) {
            setImages((current) => current.map((entry) => (entry.id === img.id ? { ...entry, artworkBounds } : entry)));
          }

          const response = await fetchWithTimeout(getProviderRoute("batch-create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: resolvedProviderId,
              shopId,
              templateProductId: template.reference,
              item: {
                fileName: img.name,
                title: titleForUpload,
                description,
                tags,
                imageDataUrl,
                artworkBounds,
                publishReady: img.aiDraft?.publishReady === true,
                qcApproved: true,
              },
            }),
          });

          const data = await parseResponsePayload(response);
          if (!response.ok) throw new Error(data?.error || `Draft request failed with status ${response.status}.`);

          const result = Array.isArray(data?.results) && data.results[0]
            ? (data.results[0] as BatchResult)
            : { fileName: img.name, title: titleForUpload, message: data?.message || "Created draft product." };

          nextResults.push(result);
          setBatchResults([...nextResults]);
        } catch (error) {
          const errorMessage = formatApiError("draftCreate", error, "[MerchQuantum] draft create failed");
          nextResults.push({ fileName: img.name, title: titleForUpload, message: errorMessage });
          setBatchResults([...nextResults]);
        }
      }

      const createdCount = nextResults.filter((result) => !!result.productId).length;
      const batchSucceeded = createdCount === activeImages.length && activeImages.length > 0;

      if (batchSucceeded && queuedImages.length > 0) {
        const nextBatch = queuedImages.slice(0, ACTIVE_BATCH_FILES);
        const remainingQueue = queuedImages.slice(ACTIVE_BATCH_FILES);
        setImages(nextBatch);
        setQueuedImages(remainingQueue);
        setSelectedId(nextBatch[0]?.id || "");
        setRunStatus(
          `Uploaded ${createdCount} draft product${createdCount === 1 ? "" : "s"}. Loaded ${nextBatch.length} queued image${nextBatch.length === 1 ? "" : "s"} next.`
        );
      } else {
        setRunStatus(`Uploaded ${createdCount} draft product${createdCount === 1 ? "" : "s"} out of ${activeImages.length}.`);
      }
    } finally {
      setIsRunningBatch(false);
    }
  }

  function removePreviewItem(targetId: string) {
    const remainingActive = images.filter((entry) => entry.id !== targetId);
    const { active: nextActive, queued: nextQueued } = fillActiveBatch(remainingActive, queuedImages, activeBatchLimit);
    setImages(nextActive);
    setQueuedImages(nextQueued);
    if (selectedId === targetId) setSelectedId(nextActive[0]?.id || "");
  }


  return {
    PROVIDERS,
    fileRef,
    provider,
    setProvider,
    token,
    setToken,
    connected,
    loadingApi,
    apiStatus,
    setApiStatus,
    pulseConnected,
    apiShops,
    apiProducts,
    loadingProducts,
    loadingTemplateDetails,
    shopId,
    productId,
    bulkEditGridPage,
    setBulkEditGridPage,
    createTemplateGridPage,
    setCreateTemplateGridPage,
    isCreateThumbExpandedView,
    setIsCreateThumbExpandedView,
    createThumbGridPage,
    setCreateThumbGridPage,
    templateDescription,
    importedListingTitle,
    setImportedListingTitle,
    importedListingDescription,
    setImportedListingDescription,
    template,
    selectedImportIds,
    pendingTemplateSelectionIds,
    isDisconnectArmed,
    setIsDisconnectArmed,
    isTokenInputFocused,
    setIsTokenInputFocused,
    workspaceMode,
    isRoutingGridExpanded,
    setIsRoutingGridExpanded,
    isWorkspaceSelectionCollapsed,
    setIsWorkspaceSelectionCollapsed,
    isImportingListings,
    isSyncingImportedListings,
    isPublishingImportedListings,
    importStatus,
    runStatus,
    batchResults,
    batchProjection,
    batchAuthority,
    batchStreamCursor,
    pendingBatchEventCount,
    lastBatchEvent,
    setBatchAuthority,
    setBatchStreamCursorLocal,
    acknowledgePendingBatchEvent,
    rejectPendingBatchEvent,
    images,
    completedImportedImages,
    queuedImages,
    selectedId,
    setSelectedId,
    isRunningBatch,
    attentionTarget,
    editingField,
    editableTitleDraft,
    setEditableTitleDraft,
    editableDescriptionDraft,
    setEditableDescriptionDraft,
    inlineSaveFeedback,
    manualPrebufferOverride,
    setManualPrebufferOverride,
    resolvedProviderId,
    providerTokenStorageKey,
    selectedProvider,
    isLiveProvider,
    isCreateMode,
    isBulkEditMode,
    supportsProviderMetadataSync,
    supportsImportedListingSync,
    supportsImportedPublish,
    allImages,
    queuedImportedImages,
    availableShops,
    selectedShop,
    hasTokenValue,
    showCompactDisconnectedToken,
    tokenFieldValue,
    shopTriggerLabel,
    productSource,
    templateKey,
    templateReadyForAi,
    hasWorkspaceRoute,
    workspaceModeLoadingLabel,
    visibleProducts,
    importedQueueCount,
    sortedImages,
    selectedImage,
    selectedProduct,
    activeGridProduct,
    readyCount,
    errorCount,
    processingCount,
    draftReadyCount,
    hasAnyLoadedImages,
    completedGenerationCount,
    generationProgressPct,
    isWorkspaceConfigured,
    canSubmitProviderConnection,
    isQuantumAiGenerating,
    canShowDetailWorkspace,
    canShowWorkspacePreview,
    canShowDetailPanel,
    canShowLoadedQueueGrid,
    showPreviewStats,
    showWorkspaceModeLoader,
    selectedImageFieldStates,
    detailTemplateDescription,
    selectedImageTemplateKey,
    isImageAwaitingStructuredOutput,
    hasVisibleSelectedImageTitle,
    hasVisibleSelectedImageDescription,
    isDetailTitleLoading,
    isDetailDescriptionLoading,
    isDetailTagsLoading,
    isTemplatePrebufferState,
    shouldAwaitQuantumTitle,
    shouldAwaitQuantumDescription,
    detailTitle,
    detailDescription,
    detailDescriptionSections,
    detailBuyerDescription,
    detailTemplateSpecBlock,
    workspaceGridHeading,
    canEditImportedListing,
    canEditSelectedImageCopy,
    canEditDetailTitle,
    canEditDetailDescription,
    titleFeedback,
    descriptionFeedback,
    selectedImageStatus,
    canManualRescueSelectedImage,
    canRerollSelectedImage,
    detailTags,
    approvedImportedItems,
    importedProductIds,
    loadedStatCount,
    queuedStatCount,
    hasBulkEditStagedSelections,
    selectionPageSize,
    createTemplatePageSize,
    createTemplateTotalPages,
    safeCreateTemplatePage,
    createTemplateVisibleProducts,
    createTemplateVisibleRangeLabel,
    bulkEditPageSize,
    bulkEditTotalPages,
    safeBulkEditPage,
    bulkEditVisibleProducts,
    bulkEditVisibleProductIds,
    hasAllBulkEditVisibleSelections,
    bulkEditVisibleRangeLabel,
    workspaceLoadingPlaceholderItems,
    createThumbCompactVisibleCount,
    createThumbExpandedPageSize,
    createThumbPageSize,
    createThumbTotalPages,
    safeCreateThumbPage,
    visibleCreateThumbnails,
    createThumbVisibleRangeLabel,
    workspaceModePickerLabel,
    uploadDisabled,
    bulkEditPublishDisabled,
    descriptionActionDisabled,
    descriptionActionReady,
    triggerDescriptionAction,
    routingGuidanceTarget,
    getRoutingFieldGlowClass,
    resetProviderState,
    nudgeProviderSelectionFromTokenArea,
    connectProvider,
    disconnectProvider,
    handleWorkspaceModeChange,
    handleShopSelection,
    openArtworkPicker,
    addFiles,
    loadProductTemplate,
    handleBulkEditThumbnailSelection,
    handleCreateTemplateSelection,
    commitTemplateSelections,
    importSelectedListings,
    runBulkEditPublishAction,
    runDraftBatch,
    removePreviewItem,
    beginInlineEdit,
    commitInlineEdit,
    rerollSelectedImageField,
    canSubmitProviderConnectionWithToken,
    nudgeWorkflow,
    activeGridProductId,
    setPendingTemplateSelectionIds,
    setActiveGridProductId,
    setLastSelectedIndex,
    clearPreviewWorkspace,
    setEditingField,
    setInlineSaveFeedback
  };
}

export type UseBatchStateResult = ReturnType<typeof useBatchState>;














