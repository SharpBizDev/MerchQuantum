'use client';

import { useMemo } from "react";
import { useAmbientStreams } from "./hooks/useAmbientStreams";
import { useBatchState } from "./hooks/useBatchState";
import { useProviderWorkspace } from "./hooks/useProviderWorkspace";
import { useQuantumEditor } from "./hooks/useQuantumEditor";

export function useMerchQuantumController() {
  const batchState = useBatchState();
  const providerWorkspace = useProviderWorkspace(batchState);
  const quantumEditor = useQuantumEditor(batchState);
  const ambientStreams = useAmbientStreams();

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

  return {
    ...batchState,
    ...providerWorkspace,
    ...quantumEditor,
    ambientStreams,
    providerTaskRouter,
    computerUseFallback: ambientStreams.computerUseFallback,
    setComputerUseFallback: ambientStreams.setComputerUseFallback,
  };
}

export type UseMerchQuantumControllerResult = ReturnType<typeof useMerchQuantumController>;
