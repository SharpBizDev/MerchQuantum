import type { UseBatchStateResult } from "./useBatchState";

export function useProviderWorkspace(batch: UseBatchStateResult) {
  return {
    PROVIDERS: batch.PROVIDERS,
    provider: batch.provider,
    setProvider: batch.setProvider,
    token: batch.token,
    setToken: batch.setToken,
    connected: batch.connected,
    loadingApi: batch.loadingApi,
    apiStatus: batch.apiStatus,
    setApiStatus: batch.setApiStatus,
    pulseConnected: batch.pulseConnected,
    loadingProducts: batch.loadingProducts,
    shopId: batch.shopId,
    isDisconnectArmed: batch.isDisconnectArmed,
    setIsDisconnectArmed: batch.setIsDisconnectArmed,
    isTokenInputFocused: batch.isTokenInputFocused,
    setIsTokenInputFocused: batch.setIsTokenInputFocused,
    workspaceMode: batch.workspaceMode,
    isRoutingGridExpanded: batch.isRoutingGridExpanded,
    setIsRoutingGridExpanded: batch.setIsRoutingGridExpanded,
    isWorkspaceSelectionCollapsed: batch.isWorkspaceSelectionCollapsed,
    setIsWorkspaceSelectionCollapsed: batch.setIsWorkspaceSelectionCollapsed,
    isCreateMode: batch.isCreateMode,
    isBulkEditMode: batch.isBulkEditMode,
    availableShops: batch.availableShops,
    showCompactDisconnectedToken: batch.showCompactDisconnectedToken,
    tokenFieldValue: batch.tokenFieldValue,
    shopTriggerLabel: batch.shopTriggerLabel,
    workspaceModeLoadingLabel: batch.workspaceModeLoadingLabel,
    canSubmitProviderConnection: batch.canSubmitProviderConnection,
    routingGuidanceTarget: batch.routingGuidanceTarget,
    getRoutingFieldGlowClass: batch.getRoutingFieldGlowClass,
    resetProviderState: batch.resetProviderState,
    nudgeProviderSelectionFromTokenArea: batch.nudgeProviderSelectionFromTokenArea,
    connectProvider: batch.connectProvider,
    disconnectProvider: batch.disconnectProvider,
    handleWorkspaceModeChange: batch.handleWorkspaceModeChange,
    handleShopSelection: batch.handleShopSelection,
    canSubmitProviderConnectionWithToken: batch.canSubmitProviderConnectionWithToken,
    nudgeWorkflow: batch.nudgeWorkflow,
  };
}

export type UseProviderWorkspaceResult = ReturnType<typeof useProviderWorkspace>;

