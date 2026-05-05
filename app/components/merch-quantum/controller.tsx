'use client';

import { useEffect, useMemo, useState } from "react";
import { useAmbientStreams } from "./hooks/useAmbientStreams";
import { useBatchState } from "./hooks/useBatchState";
import { useProviderWorkspace } from "./hooks/useProviderWorkspace";
import { useQuantumEditor } from "./hooks/useQuantumEditor";
import { useIngestionPressureBridge } from "./hooks/useIngestionPressureBridge";

export function useMerchQuantumController() {
  const ambientStreams = useAmbientStreams();
  const batchState = useBatchState();
  const providerWorkspace = useProviderWorkspace(batchState);
  const quantumEditor = useQuantumEditor(batchState);
  const [isIngestionInspectorOpen, setIsIngestionInspectorOpen] = useState(false);

  useIngestionPressureBridge(batchState.jobGraphSnapshot, ambientStreams);

  useEffect(() => {
    if (!isIngestionInspectorOpen) return;
    void batchState.refreshIngestionStorageAudit();
  }, [batchState, isIngestionInspectorOpen]);

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
    snapshot: batchState.jobGraphSnapshot,
    openPanel: () => setIsIngestionInspectorOpen(true),
    closePanel: () => setIsIngestionInspectorOpen(false),
    togglePanel: () => setIsIngestionInspectorOpen((current) => !current),
    togglePaused: batchState.toggleIngestionGraphPaused,
    purgeFinished: batchState.purgeFinishedIngestionJobs,
    refreshStorageAudit: batchState.refreshIngestionStorageAudit,
  }), [batchState.jobGraphSnapshot, batchState.purgeFinishedIngestionJobs, batchState.refreshIngestionStorageAudit, batchState.toggleIngestionGraphPaused, isIngestionInspectorOpen]);

  return {
    ...batchState,
    ...providerWorkspace,
    ...quantumEditor,
    ambientStreams,
    ingestionInspector,
    providerTaskRouter,
    computerUseFallback: ambientStreams.computerUseFallback,
    setComputerUseFallback: ambientStreams.setComputerUseFallback,
  };
}

export type UseMerchQuantumControllerResult = ReturnType<typeof useMerchQuantumController>;
