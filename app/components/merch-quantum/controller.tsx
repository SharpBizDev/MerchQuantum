'use client';

import { useBatchState } from "./hooks/useBatchState";
import { useProviderWorkspace } from "./hooks/useProviderWorkspace";
import { useQuantumEditor } from "./hooks/useQuantumEditor";

export function useMerchQuantumController() {
  const batchState = useBatchState();
  const providerWorkspace = useProviderWorkspace(batchState);
  const quantumEditor = useQuantumEditor(batchState);

  return {
    ...batchState,
    ...providerWorkspace,
    ...quantumEditor,
  };
}

export type UseMerchQuantumControllerResult = ReturnType<typeof useMerchQuantumController>;

