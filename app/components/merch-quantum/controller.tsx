'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAmbientStreams } from "./hooks/useAmbientStreams";
import { useBatchState } from "./hooks/useBatchState";
import { useProviderWorkspace } from "./hooks/useProviderWorkspace";
import { useQuantumEditor } from "./hooks/useQuantumEditor";
import { useIngestionPressureBridge } from "./hooks/useIngestionPressureBridge";
import { useSpecializedRefineryBridge } from "./hooks/useSpecializedRefineryBridge";

export function useMerchQuantumController() {
  const ambientStreams = useAmbientStreams();
  const batchState = useBatchState();
  const immutableJobGraphSnapshot = useSyncExternalStore(
    batchState.subscribeJobGraphSnapshot,
    batchState.getJobGraphSnapshot,
    batchState.getJobGraphSnapshot
  );
  const providerWorkspace = useProviderWorkspace(batchState);
  const quantumEditor = useQuantumEditor(batchState);
  const specializedBridge = useSpecializedRefineryBridge();
  const [isIngestionInspectorOpen, setIsIngestionInspectorOpen] = useState(false);
  const refreshIngestionStorageAudit = batchState.refreshIngestionStorageAudit;
  const toggleIngestionGraphPaused = batchState.toggleIngestionGraphPaused;
  const purgeFinishedIngestionJobs = batchState.purgeFinishedIngestionJobs;

  useIngestionPressureBridge(immutableJobGraphSnapshot, ambientStreams);

  useEffect(() => {
    if (!isIngestionInspectorOpen) return;
    void refreshIngestionStorageAudit();
  }, [isIngestionInspectorOpen, refreshIngestionStorageAudit]);

  const providerTaskRouter = useMemo(() => {
    const route = ambientStreams.computerUseFallback ? "computer-use" : "mcp";
    return {
      defaultRoute: "mcp" as const,
      activeRoute: route,
      hostileSurface: ambientStreams.computerUseFallback,
      hostileSurfaceReason: ambientStreams.hostileSurfaceReason,
      createTaskEnvelope(taskType: string) {
        return {
          taskType,
          route,
          authority: batchState.batchAuthority,
          streamCursor: batchState.batchStreamCursor,
        };
      },
    };
  }, [ambientStreams.computerUseFallback, ambientStreams.hostileSurfaceReason, batchState.batchAuthority, batchState.batchStreamCursor]);

  const ingestionInspector = useMemo(() => ({
    open: isIngestionInspectorOpen,
    snapshot: immutableJobGraphSnapshot,
    bridge: specializedBridge,
    openPanel: () => setIsIngestionInspectorOpen(true),
    closePanel: () => setIsIngestionInspectorOpen(false),
    togglePanel: () => setIsIngestionInspectorOpen((current) => !current),
    togglePaused: toggleIngestionGraphPaused,
    purgeFinished: purgeFinishedIngestionJobs,
    refreshStorageAudit: refreshIngestionStorageAudit,
  }), [immutableJobGraphSnapshot, isIngestionInspectorOpen, purgeFinishedIngestionJobs, refreshIngestionStorageAudit, specializedBridge, toggleIngestionGraphPaused]);

  return {
    ...batchState,
    ...providerWorkspace,
    ...quantumEditor,
    ambientStreams,
    specializedBridge,
    ingestionInspector,
    providerTaskRouter,
    jobGraphSnapshot: immutableJobGraphSnapshot,
    computerUseFallback: ambientStreams.computerUseFallback,
    setComputerUseFallback: ambientStreams.setComputerUseFallback,
  };
}

export type UseMerchQuantumControllerResult = ReturnType<typeof useMerchQuantumController>;

