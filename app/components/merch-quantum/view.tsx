'use client';

import type { ProviderChoiceId } from "../../../lib/providers/client-options";
import { autosizeTextarea } from "../../../lib/services/merch-quantum/artwork-analysis";
import { getResolvedItemStatus, normalizeSelectionIds } from "../../../lib/services/merch-quantum/batch-state";
import { LISTING_LIMITS } from "../../../lib/services/merch-quantum/product-logic";
import type { WorkspaceMode } from "./types";
import {
  Box,
  ChevronIcon,
  ConnectArrowIcon,
  CreativeWellspringBrandMark,
  Input,
  MerchQuantumInlineHeading,
  ProductGrid,
  QuantOrbLoader,
  ReRollIcon,
  SetupInput,
  SetupSelect,
  SmartThumbnail,
  StatusThumbIcon,
  WorkspaceModeLoadingOverlay,
} from "./ui";
import type { UseMerchQuantumControllerResult } from "./controller";

const DETAIL_DATA_TEXT_CLASSES = "font-sans text-sm font-normal leading-6 text-white";
export const QUANTUM_TITLE_AWAITING_TEXT = "Awaiting Quantum AI title...";
export const QUANTUM_DESCRIPTION_AWAITING_TEXT = "Awaiting Quantum AI description...";

export function MerchQuantumView({ controller }: { controller: UseMerchQuantumControllerResult }) {
  const {
    PROVIDERS,
    fileRef,
    provider,
    setProvider,
    token,
    setToken,
    connected,
    loadingApi,
    setApiStatus,
    pulseConnected,
    loadingProducts,
    shopId,
    setBulkEditGridPage,
    setCreateTemplateGridPage,
    isCreateThumbExpandedView,
    setIsCreateThumbExpandedView,
    setCreateThumbGridPage,
    selectedImportIds,
    pendingTemplateSelectionIds,
    isDisconnectArmed,
    setIsDisconnectArmed,
    setIsTokenInputFocused,
    workspaceMode,
    isRoutingGridExpanded,
    setIsRoutingGridExpanded,
    isWorkspaceSelectionCollapsed,
    setIsWorkspaceSelectionCollapsed,
    isImportingListings,
    setSelectedId,
    attentionTarget,
    editingField,
    editableTitleDraft,
    setEditableTitleDraft,
    editableDescriptionDraft,
    setEditableDescriptionDraft,
    isCreateMode,
    isBulkEditMode,
    availableShops,
    showCompactDisconnectedToken,
    tokenFieldValue,
    shopTriggerLabel,
    workspaceModeLoadingLabel,
    sortedImages,
    selectedImage,
    processingCount,
    hasAnyLoadedImages,
    generationProgressPct,
    isWorkspaceConfigured,
    canSubmitProviderConnection,
    canShowWorkspacePreview,
    canShowDetailPanel,
    canShowLoadedQueueGrid,
    showPreviewStats,
    showWorkspaceModeLoader,
    isDetailTagsLoading,
    shouldAwaitQuantumTitle,
    shouldAwaitQuantumDescription,
    detailTitle,
    detailBuyerDescription,
    detailTemplateSpecBlock,
    workspaceGridHeading,
    canEditDetailTitle,
    canEditDetailDescription,
    titleFeedback,
    descriptionFeedback,
    canRerollSelectedImage,
    detailTags,
    importedProductIds,
    loadedStatCount,
    queuedStatCount,
    hasBulkEditStagedSelections,
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
    createThumbTotalPages,
    safeCreateThumbPage,
    visibleCreateThumbnails,
    createThumbVisibleRangeLabel,
    workspaceModePickerLabel,
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
    handleBulkEditThumbnailSelection,
    handleCreateTemplateSelection,
    commitTemplateSelections,
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
  } = controller;

  return (    <main className="box-border flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto overflow-x-hidden bg-[#0d1117] p-6 font-sans text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="sticky top-0 z-10 bg-[#0d1117] pb-2 space-y-2">
          {!workspaceMode || isRoutingGridExpanded ? (
          <div className="relative">
            <Box
              className={`relative overflow-visible border-slate-800 bg-[#0b0f19] text-white shadow-[0_28px_80px_-40px_rgba(2,6,22,0.95)] ${routingGuidanceTarget ? "ring-1 ring-[#7F22FE]/45 shadow-[0_28px_90px_-40px_rgba(127,34,254,0.45)]" : connected ? "ring-1 ring-[#00BC7D]/35 shadow-[0_28px_90px_-40px_rgba(0,188,125,0.32)]" : ""}`}
            >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" />
            <div className={`pointer-events-none absolute -right-10 top-0 h-36 w-36 blur-3xl transition-all duration-700 sm:-right-16 sm:h-40 sm:w-40 md:-right-20 md:h-48 md:w-48 ${connected ? "bg-[#00BC7D]/12" : "bg-[#7F22FE]/12"} ${routingGuidanceTarget ? "animate-pulse" : ""}`} />
            <div className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-white/5 blur-3xl sm:-left-8 sm:h-28 sm:w-28 md:-left-12 md:h-32 md:w-32" />
            <div
              className={`pointer-events-none absolute inset-x-5 bottom-0 h-px transition-all duration-700 ${connected ? "bg-gradient-to-r from-transparent via-[#00BC7D]/90 to-transparent" : "bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent"} ${pulseConnected || routingGuidanceTarget ? "scale-x-100 opacity-100" : "scale-x-75 opacity-60"}`}
            />
            <div className="mb-3 flex min-w-0 items-center">
              <MerchQuantumInlineHeading className="max-w-full" />
            </div>
            <div className="grid w-full grid-cols-2 gap-2">
            <div className={`min-w-0 self-start ${getRoutingFieldGlowClass("provider")}`}>
              <SetupSelect
                value={provider}
                onChange={(e) => {
                  const nextProvider = e.target.value as ProviderChoiceId | "";
                  setProvider(nextProvider);
                  setToken("");
                  setIsDisconnectArmed(false);
                  setIsTokenInputFocused(false);
                  resetProviderState(false);
                  const nextMeta = PROVIDERS.find((entry) => entry.id === nextProvider);
                  setApiStatus(nextMeta && !nextMeta.isLive ? `${nextMeta.label} is coming soon.` : "");
                }}
              >
                <option value="">Choose Provider</option>
                {PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </SetupSelect>
            </div>

            <div
              onMouseEnter={() => {
                nudgeProviderSelectionFromTokenArea();
                if (connected) setIsDisconnectArmed(true);
              }}
              onMouseLeave={() => setIsDisconnectArmed(false)}
              onFocusCapture={() => {
                nudgeProviderSelectionFromTokenArea();
                if (connected) setIsDisconnectArmed(true);
              }}
              onBlurCapture={(event) => {
                const relatedTarget = event.relatedTarget as Node | null;
                if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                  setIsDisconnectArmed(false);
                }
              }}
              onPointerDownCapture={nudgeProviderSelectionFromTokenArea}
              className={`min-w-0 self-start ${getRoutingFieldGlowClass("token")}`}
            >
              <div className="relative flex min-w-0 items-center">
                <SetupInput
                  id="provider-api-key-input"
                  type={connected || showCompactDisconnectedToken ? "text" : "password"}
                  value={tokenFieldValue}
                  disabled={!provider}
                  readOnly={connected || showCompactDisconnectedToken}
                  placeholder="API Key"
                  onChange={(e) => setToken(e.target.value)}
                  onPaste={(event) => {
                    if (connected) return;
                    const pastedToken = event.clipboardData.getData("text").trim();
                    if (!pastedToken) return;
                    event.preventDefault();
                    setToken(pastedToken);
                    setIsTokenInputFocused(false);
                  }}
                  onFocus={() => {
                    if (!connected) {
                      setIsTokenInputFocused(true);
                    }
                  }}
                  onBlur={() => {
                    if (!connected) {
                      setIsTokenInputFocused(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmitProviderConnectionWithToken()) {
                      e.preventDefault();
                      void connectProvider();
                    }
                  }}
                  className="min-w-0 truncate pr-14 sm:pr-16"
                />
                <div
                  className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center"
                  onMouseEnter={() => {
                    if (connected) setIsDisconnectArmed(true);
                  }}
                  onMouseLeave={() => setIsDisconnectArmed(false)}
                  onFocusCapture={() => {
                    if (connected) setIsDisconnectArmed(true);
                  }}
                  onBlurCapture={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null;
                    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                      setIsDisconnectArmed(false);
                    }
                  }}
                >
                  {loadingApi ? (
                    <span className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-slate-300">
                      <QuantOrbLoader />
                    </span>
                  ) : connected ? (
                    isDisconnectArmed ? (
                      <button
                        type="button"
                        onClick={() => { void disconnectProvider(); }}
                        className="inline-flex h-8 items-center rounded-lg border border-[#FF2056]/40 bg-[#FF2056]/12 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#FF2056] transition hover:bg-[#FF2056]/18"
                      >
                        Off
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="Provider connected. Hover or click to disconnect."
                        onClick={() => setIsDisconnectArmed(true)}
                        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#00BC7D]/35 bg-[#00BC7D]/10 transition hover:bg-[#00BC7D]/14"
                      >
                        <span className="absolute inset-[7px] rounded-full bg-[#00BC7D] shadow-[0_0_14px_rgba(0,188,125,0.95)]" />
                        <span className="absolute inset-[3px] rounded-full border border-[#00BC7D]/55 animate-pulse" />
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void connectProvider(); }}
                      disabled={!canSubmitProviderConnection}
                      aria-label="Connect provider"
                      title="Connect"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/80 disabled:text-slate-200 ${
                        !connected && token.trim().length > 0
                          ? "animate-pulse border-purple-400/40 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                          : ""
                      }`}
                    >
                      <ConnectArrowIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={`relative min-w-0 ${getRoutingFieldGlowClass("shop")}`}>
              <SetupSelect
                value={shopId}
                disabled={!connected || loadingApi}
                onChange={(event) => {
                  handleShopSelection(event.target.value);
                }}
              >
                <option value="">
                  {shopTriggerLabel}
                </option>
                {availableShops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.title}
                  </option>
                ))}
              </SetupSelect>
            </div>

            <div className={`relative min-w-0 ${getRoutingFieldGlowClass("mode")}`}>
              <SetupSelect
                value={workspaceMode}
                disabled={!connected || !shopId}
                onChange={(event) => {
                  handleWorkspaceModeChange(event.target.value as WorkspaceMode);
                }}
              >
                <option value="">{workspaceModePickerLabel}</option>
                <option value="create">Bulk Create</option>
                <option value="edit">Bulk Edit</option>
              </SetupSelect>
            </div>
            </div>

          </Box>
          </div>
          ) : null}

        </div>
        {connected && shopId && workspaceMode ? (
          <div className="relative z-10">
            {showWorkspaceModeLoader ? <WorkspaceModeLoadingOverlay label={workspaceModeLoadingLabel} /> : null}
            <div aria-hidden={showWorkspaceModeLoader} className={showWorkspaceModeLoader ? "pointer-events-none opacity-0" : ""}>
          <Box className="relative border-slate-800 bg-[#020616] shadow-[0_24px_70px_-38px_rgba(2,6,22,0.95)]">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
              className="hidden"
              onChange={(e) => {
                if (isCreateMode && connected && isWorkspaceConfigured) {
                  void addFiles(e.target.files);
                } else {
                  nudgeWorkflow(true);
                }
                e.currentTarget.value = "";
              }}
            />

            {isBulkEditMode ? (
              <ProductGrid
                heading={workspaceGridHeading}
                items={showWorkspaceModeLoader ? workspaceLoadingPlaceholderItems : bulkEditVisibleProducts}
                selectedIds={pendingTemplateSelectionIds}
                activeId={activeGridProductId}
                importedProductIds={importedProductIds}
                highlighted={attentionTarget === "template"}
                rangeLabel={bulkEditVisibleRangeLabel}
                page={safeBulkEditPage}
                pageSize={bulkEditPageSize}
                totalPages={bulkEditTotalPages}
                loading={loadingProducts}
                footerLabel={bulkEditVisibleRangeLabel}
                collapsed={isWorkspaceSelectionCollapsed}
                selectAllLabel={hasAllBulkEditVisibleSelections ? "Deselect All" : "Select All"}
                headerAccessory={
                  <button
                    type="button"
                    onClick={() => setIsRoutingGridExpanded((current) => !current)}
                    className="font-medium text-slate-100 transition hover:text-white"
                  >
                    Mode
                  </button>
                }
                onToggleCollapsed={() => setIsWorkspaceSelectionCollapsed((current) => !current)}
                onSelectAll={() => {
                  if (hasAllBulkEditVisibleSelections) {
                    setPendingTemplateSelectionIds([]);
                    setActiveGridProductId("");
                    setLastSelectedIndex(null);
                    return;
                  }
                  setPendingTemplateSelectionIds(normalizeSelectionIds(bulkEditVisibleProductIds));
                  setActiveGridProductId(bulkEditVisibleProductIds[0] || "");
                  setLastSelectedIndex(null);
                }}
                onItemActivate={(product, index, event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleBulkEditThumbnailSelection(product.id, index, { shiftKey: "shiftKey" in event ? event.shiftKey : false });
                }}
                onPreviousPage={() => setBulkEditGridPage((current) => Math.max(0, current - 1))}
                onNextPage={() => setBulkEditGridPage((current) => Math.min(bulkEditTotalPages - 1, current + 1))}
                footerActions={
                  <>
                    <span className="inline-flex h-4 w-4 items-center justify-center">
                      {isImportingListings ? <QuantOrbLoader /> : null}
                    </span>
                    <button
                      type="button"
                      className="font-semibold text-[#C084FC] transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                      disabled={!hasBulkEditStagedSelections || isImportingListings}
                      onClick={() => { void commitTemplateSelections(pendingTemplateSelectionIds); }}
                    >
                      Load Selected
                    </button>
                  </>
                }
              />
            ) : (
              <ProductGrid
                heading={workspaceGridHeading}
                items={showWorkspaceModeLoader ? workspaceLoadingPlaceholderItems : createTemplateVisibleProducts}
                selectedIds={selectedImportIds}
                activeId={activeGridProductId}
                importedProductIds={importedProductIds}
                highlighted={attentionTarget === "template"}
                rangeLabel={createTemplateVisibleRangeLabel}
                page={safeCreateTemplatePage}
                pageSize={createTemplatePageSize}
                totalPages={createTemplateTotalPages}
                loading={loadingProducts}
                collapsed={isWorkspaceSelectionCollapsed}
                headerAccessory={
                  <button
                    type="button"
                    onClick={() => setIsRoutingGridExpanded((current) => !current)}
                    className="font-medium text-slate-100 transition hover:text-white"
                  >
                    Mode
                  </button>
                }
                onToggleCollapsed={() => setIsWorkspaceSelectionCollapsed((current) => !current)}
                onItemActivate={(product, index, event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleCreateTemplateSelection(product.id, index);
                }}
                onPreviousPage={() => setCreateTemplateGridPage((current) => Math.max(0, current - 1))}
                onNextPage={() => setCreateTemplateGridPage((current) => Math.min(createTemplateTotalPages - 1, current + 1))}
              />
            )}
            {shopId && canShowWorkspacePreview ? (
              <>
                <div className="mt-3">
                  <div className="space-y-3" onPointerDownCapture={() => nudgeWorkflow(true)}>
                      <div className="relative rounded-[24px] transition-all">
                      <div className="grid grid-cols-1 items-stretch gap-2">
                        <div className="flex h-full min-w-0 w-full flex-col gap-2">
                          {isCreateMode ? (
                            <div
                              role={isWorkspaceConfigured ? "button" : undefined}
                              tabIndex={isWorkspaceConfigured ? 0 : -1}
                              className={`w-full rounded-xl border border-dashed border-slate-700 bg-[#020616]/92 px-3 py-1 text-center transition-colors ${isWorkspaceConfigured ? "cursor-pointer hover:bg-[#0b1024]" : "cursor-default"}`}
                              onClick={isWorkspaceConfigured ? openArtworkPicker : undefined}
                              onKeyDown={(e) => {
                                if (!isWorkspaceConfigured) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openArtworkPicker();
                                }
                              }}
                              onDragOver={(e) => {
                                if (isCreateMode) {
                                  e.preventDefault();
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!isCreateMode || !connected || !isWorkspaceConfigured) {
                                  nudgeWorkflow(true);
                                  return;
                                }
                                void addFiles(e.dataTransfer.files);
                              }}
                            >
                              <div className="flex min-h-[44px] flex-col justify-between gap-2">
                                <div className="flex items-center justify-center">
                                  <div className="flex flex-col items-center gap-2 text-center">
                                    <p className="text-sm font-medium leading-6 text-white">
                                      Drop Images Here
                                    </p>
                                    <p className="text-xs font-medium text-slate-100">
                                      50 per batch • 500 max queue
                                    </p>
                                  </div>
                                </div>
                                <div className="flex w-full items-center justify-between text-xs font-medium text-slate-100">
                                  <span>{`Loaded: ${loadedStatCount} | Queue: ${queuedStatCount}`}</span>
                                  <button
                                    type="button"
                                    disabled={!hasAnyLoadedImages}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (!hasAnyLoadedImages) return;
                                      clearPreviewWorkspace();
                                    }}
                                    className="text-xs font-medium text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                              {showPreviewStats ? (
                                <div className="pointer-events-none mt-1 h-[2px] rounded-full bg-slate-800/90">
                                  <div
                                    className={`h-full transition-all duration-500 ${processingCount > 0 ? "bg-[#7F22FE]" : "bg-[#00A6F4]"}`}
                                    style={{ width: `${generationProgressPct}%` }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {canShowLoadedQueueGrid ? (
                            <div className="space-y-1 p-1">
                        <div className="quantum-scroll-hidden grid grid-cols-5 gap-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
                                {visibleCreateThumbnails.map((img) => {
                                  const isSelected = selectedImage?.id === img.id;
                                  const resolvedStatus = getResolvedItemStatus(img);
                                  const isProcessing = resolvedStatus === "pending";
                                  const previewFrameTone = isProcessing
                                    ? "border-[#7F22FE]/55"
                                    : resolvedStatus === "ready"
                                      ? "border-[#00BC7D]/55"
                                      : resolvedStatus === "error"
                                        ? "border-[#FF2056]/55"
                                        : "border-slate-700";
                                  const statusIndicator = resolvedStatus === "ready"
                                    ? { tone: "ready" as const, direction: "up" as const }
                                    : resolvedStatus === "error"
                                      ? { tone: "error" as const, direction: "down" as const }
                                      : null;

                                  return (
                                    <div
                                      key={img.id}
                                      onClick={() => {
                                        setSelectedId(img.id);
                                      }}
                                      className={`w-full snap-start transition-all duration-500 ${isProcessing ? "shadow-[0_12px_32px_-24px_rgba(124,58,237,0.45)]" : isSelected ? "shadow-[0_10px_24px_-20px_rgba(124,58,237,0.45)]" : ""}`}
                                    >
                                      <SmartThumbnail
                                        src={img.preview}
                                        alt={img.final}
                                        className={`group rounded-lg border transition-all duration-200 ease-out hover:z-10 hover:shadow-[inset_0_0_0_2px_rgba(127,34,254,0.8)] ${previewFrameTone}`}
                                      >
                                        {isProcessing ? <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-px animate-pulse bg-gradient-to-r from-transparent via-[#7F22FE]/80 to-transparent" /> : null}
                                        {statusIndicator ? (
                                          <div
                                            aria-label={statusIndicator.tone}
                                            className="absolute bottom-2 left-1/2 z-20 inline-flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-black"
                                          >
                                            <StatusThumbIcon tone={statusIndicator.tone} direction={statusIndicator.direction} />
                                          </div>
                                        ) : null}
                                        <button
                                          type="button"
                                          aria-label="remove"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removePreviewItem(img.id);
                                          }}
                                          className="absolute right-1 top-1 z-20 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#020616]/92 p-0 text-xs font-normal text-slate-300 shadow-sm transition-colors hover:text-[#FF2056]"
                                        >
                                          x
                                        </button>
                                      </SmartThumbnail>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                                  <span className="min-w-0 flex-1 truncate text-slate-100">{createThumbVisibleRangeLabel}</span>
                                  <div className="flex items-center justify-end gap-2">
                                  {createThumbTotalPages > 1 ? (
                                    <>
                                      <button
                                        type="button"
                                        aria-label="Previous image set"
                                        className="inline-flex items-center justify-center text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                                        disabled={safeCreateThumbPage <= 0}
                                        onClick={() => setCreateThumbGridPage((current) => Math.max(0, current - 1))}
                                      >
                                        <ChevronIcon open={false} className="h-4 w-4 rotate-90" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Next image set"
                                        className="inline-flex items-center justify-center text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
                                        disabled={safeCreateThumbPage >= createThumbTotalPages - 1}
                                        onClick={() => setCreateThumbGridPage((current) => Math.min(createThumbTotalPages - 1, current + 1))}
                                      >
                                        <ChevronIcon open={false} className="h-4 w-4 -rotate-90" />
                                      </button>
                                    </>
                                  ) : null}
                                  {sortedImages.length > createThumbCompactVisibleCount ? (
                                    <button
                                      type="button"
                                      className="font-medium text-slate-100 transition hover:text-white"
                                      onClick={() => {
                                        setIsCreateThumbExpandedView((current) => !current);
                                        setCreateThumbGridPage(0);
                                      }}
                                    >
                                      {isCreateThumbExpandedView ? "Compact" : "View All"}
                                    </button>
                                  ) : null}
                                  </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {canShowDetailPanel ? (
                        <div className="flex min-w-0 flex-col space-y-0">
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-6 tracking-tight text-slate-200">
                                  <span className="inline-flex items-center text-sm font-semibold leading-6">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 text-white">AI Title</span>
                                  </span>
                                </div>
                                {canRerollSelectedImage ? (
                                  <button
                                    type="button"
                                    onClick={() => { void rerollSelectedImageField("title"); }}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7F22FE]/25 text-slate-300 transition hover:border-[#7F22FE]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/35"
                                    aria-label="Re-roll title with Quantum AI"
                                    title="Re-Roll title"
                                  >
                                    <ReRollIcon className="h-3 w-3" />
                                  </button>
                                ) : null}
                              </div>
                              <div className="space-y-2">
                                <div className="rounded-xl">
                                  {editingField === "title" ? (
                                    <div className="relative">
                                      <Input
                                        autoFocus
                                        value={editableTitleDraft}
                                        onChange={(e) => setEditableTitleDraft(e.target.value)}
                                        maxLength={LISTING_LIMITS.titleMax}
                                        onBlur={() => { void commitInlineEdit("title", editableTitleDraft); }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            e.currentTarget.blur();
                                          }
                                          if (e.key === "Escape") {
                                            e.preventDefault();
                                            setEditingField(null);
                                            setInlineSaveFeedback(null);
                                          }
                                        }}
                                        className="h-9 px-3 py-1 pr-20 font-sans text-sm font-normal text-white"
                                      />
                                      <div className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center gap-2 text-xs font-medium text-slate-100">
                                        <span>{editableTitleDraft.trim().length}/{LISTING_LIMITS.titleMax}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => beginInlineEdit("title")}
                                      onKeyDown={(e) => {
                                        if (!canEditDetailTitle) return;
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          beginInlineEdit("title");
                                        }
                                      }}
                                      disabled={!canEditDetailTitle}
                                      className={`group relative flex min-h-[36px] w-full items-center rounded-xl border bg-[#020616] px-3 py-1 pr-24 text-left transition ${canEditDetailTitle ? "cursor-text border-slate-700 hover:border-slate-500 focus-visible:border-[#7F22FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F22FE]/30" : "cursor-default border-slate-700"}`}
                                    >
                                      {shouldAwaitQuantumTitle ? (
                                        <div className="flex w-full items-center justify-start gap-2 text-left font-sans text-sm font-normal text-white">
                                          <QuantOrbLoader />
                                          <span>{QUANTUM_TITLE_AWAITING_TEXT}</span>
                                        </div>
                                      ) : (
                                        <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                          <span className="min-w-0 flex-1 truncate font-sans text-sm font-normal text-white">
                                            {detailTitle || <span className="font-sans text-sm font-normal text-white">Click to add a final title.</span>}
                                          </span>
                                        </div>
                                      )}
                                      <div className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center gap-2 text-xs font-medium text-slate-100">
                                        <span>{(detailTitle || "").trim().length}/{LISTING_LIMITS.titleMax}</span>
                                      </div>
                                    </button>
                                  )}
                                </div>
                                {titleFeedback ? (
                                  <p className={`text-xs ${titleFeedback.tone === "error" ? "text-[#FF2056]" : titleFeedback.tone === "saved" ? "text-[#00BC7D]" : "text-slate-100"}`}>
                                    {titleFeedback.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 w-full">
                              <div className="flex items-center justify-between w-full">
                                <div className="flex min-h-[20px] min-w-0 flex-1 items-center text-left text-sm font-medium leading-6 tracking-tight text-slate-200">
                                  <span className="inline-flex min-w-0 items-center text-sm font-semibold leading-6">
                                    <span className="text-[#7F22FE]">Quantum</span>
                                    <span className="ml-1 truncate text-white">AI Description</span>
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={triggerDescriptionAction}
                                  disabled={descriptionActionDisabled}
                                  className={`text-[8px] leading-none font-sans font-normal px-0.5 py-px flex items-center justify-center whitespace-nowrap shrink-0 border border-gray-600/50 rounded-sm text-gray-300 transition-colors duration-200 ${
                                    descriptionActionReady
                                      ? "bg-purple-600 cursor-pointer hover:bg-purple-500"
                                      : "bg-gray-800/80 cursor-wait"
                                  }`}
                                >
                                  Publish
                                </button>
                              </div>
                              <div className="space-y-2">
                                <div className={`rounded-xl border bg-[#020616] px-3 py-2.5 transition ${DETAIL_DATA_TEXT_CLASSES} ${canEditDetailDescription ? "border-slate-700 hover:border-slate-500 focus-within:border-[#7F22FE] focus-within:ring-2 focus-within:ring-[#7F22FE]/30" : "border-slate-700"}`}>
                                  <div className="flex">
                                    {editingField === "description" ? (
                                      <div className="flex w-full flex-col gap-2">
                                        <div className="relative">
                                          <textarea
                                            autoFocus
                                            value={editableDescriptionDraft}
                                            onFocus={(e) => autosizeTextarea(e.currentTarget)}
                                            onChange={(e) => {
                                              setEditableDescriptionDraft(e.target.value);
                                              autosizeTextarea(e.currentTarget);
                                            }}
                                            maxLength={LISTING_LIMITS.descriptionMax}
                                            onBlur={() => { void commitInlineEdit("description", editableDescriptionDraft); }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                              }
                                              if (e.key === "Escape") {
                                                e.preventDefault();
                                                setEditingField(null);
                                                setInlineSaveFeedback(null);
                                              }
                                            }}
                                            className={`min-h-[112px] w-full resize-none overflow-hidden bg-transparent px-0 py-0 text-left outline-none transition placeholder:text-slate-200 ${DETAIL_DATA_TEXT_CLASSES}`}
                                          />
                                        </div>
                                        {detailTemplateSpecBlock ? (
                                          <>
                                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                            <div className={`max-h-12 w-full overflow-y-auto whitespace-pre-wrap text-left [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              {detailTemplateSpecBlock}
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="flex w-full flex-col gap-2">
                                        <button
                                          type="button"
                                          onClick={() => beginInlineEdit("description")}
                                          onKeyDown={(e) => {
                                            if (!canEditDetailDescription) return;
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              beginInlineEdit("description");
                                            }
                                          }}
                                          disabled={!canEditDetailDescription}
                                          className={`group relative flex min-h-[112px] w-full items-start bg-transparent px-0 py-0 text-left transition ${DETAIL_DATA_TEXT_CLASSES} ${canEditDetailDescription ? "cursor-text focus-visible:outline-none" : "cursor-default"}`}
                                        >
                                          {shouldAwaitQuantumDescription ? (
                                            <div className={`flex w-full items-center justify-start gap-2 text-left ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              <QuantOrbLoader />
                                              <span>{QUANTUM_DESCRIPTION_AWAITING_TEXT}</span>
                                            </div>
                                          ) : (
                                            <div className="flex w-full min-w-0 items-start justify-between gap-2">
                                              <div className="min-w-0 flex-1 whitespace-pre-wrap text-left">
                                                {detailBuyerDescription || (
                                                  <span className={DETAIL_DATA_TEXT_CLASSES}>Select or add artwork to generate image-based listing copy.</span>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </button>
                                        {detailTemplateSpecBlock ? (
                                          <>
                                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                                            <div className={`max-h-12 w-full overflow-y-auto whitespace-pre-wrap text-left [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${DETAIL_DATA_TEXT_CLASSES}`}>
                                              {detailTemplateSpecBlock}
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="pt-0">
                            <div className="rounded-xl border border-slate-700 bg-[#020616] px-3 py-2.5">
                              {descriptionFeedback ? (
                                <div className="w-full p-2 mb-2 bg-yellow-900/20 border border-yellow-700/30 rounded-md flex flex-col gap-1">
                                  <p className="text-[11px] leading-tight text-yellow-500">
                                    {descriptionFeedback.message}
                                  </p>
                                </div>
                              ) : null}
                              <div className="flex overflow-hidden w-full relative">
                              <div
                                className="flex w-max gap-2 items-center hover:[animation-play-state:paused]"
                                style={{ animation: "infinite-scroll 30s linear infinite" }}
                              >
                                {isDetailTagsLoading ? (
                                  Array.from({ length: LISTING_LIMITS.tagCount }).map((_, index) => (
                                    <div
                                      key={`loading-tag-${index}`}
                                      className="text-[12px] leading-none px-2.5 py-1.5 flex items-center justify-center text-gray-300 bg-gray-800/80 border border-gray-600/50 rounded-md whitespace-nowrap shrink-0 font-sans"
                                    >
                                      <QuantOrbLoader />
                                    </div>
                                  ))
                                ) : detailTags.length > 0 ? (
                                  [...detailTags, ...detailTags].map((tag, index) => (
                                    <div
                                      key={`tag-${index}`}
                                      title={tag}
                                      className="text-[12px] leading-none px-2.5 py-1.5 flex items-center justify-center text-gray-300 bg-gray-800/80 border border-gray-600/50 rounded-md whitespace-nowrap shrink-0 font-sans"
                                    >
                                      {tag}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[12px] leading-none px-2.5 py-1.5 flex items-center justify-center text-gray-300 bg-gray-800/80 border border-gray-600/50 rounded-md whitespace-nowrap shrink-0 font-sans">
                                    Tags will appear after Quantum AI processing completes.
                                  </div>
                                )}
                              </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        ) : null}
                    </div>
                    </div>
                </div>
              </div>
              </>
            ) : null}
          </Box>
            </div>
          </div>
        ) : null}

      </div>
      <CreativeWellspringBrandMark docked />
      </div>
      <style jsx global>{`
        .quantum-scroll-hidden {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .quantum-scroll-hidden::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        @keyframes infinite-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </main>
  );
}
