'use client';

import { QuantumFamilyShell } from "./quantum-family/Shell";
import { IngestionInspector } from "./merch-quantum/IngestionInspector";
import { SpectralBar } from "./merch-quantum/SpectralBar";
import { TaskbarOrb } from "./merch-quantum/TaskbarOrb";
import { useMerchQuantumController } from "./merch-quantum/controller";
import { MerchQuantumView } from "./merch-quantum/view";
export {
  QUANTUM_DESCRIPTION_AWAITING_TEXT,
  QUANTUM_TITLE_AWAITING_TEXT,
} from "./merch-quantum/view";
export {
  canManualOverrideListingCopy,
  sanitizeTemplateDescriptionForPrebuffer,
  splitDetailDescriptionForDisplay,
} from "../../lib/services/merch-quantum/product-logic";

export default function MerchQuantumApp() {
  const controller = useMerchQuantumController();

  return (
    <QuantumFamilyShell
      spectralSlot={<SpectralBar latestFrameRef={controller.ambientStreams.latestFrameRef} />}
      taskbarSlot={
        <TaskbarOrb
          latestFrameRef={controller.ambientStreams.latestFrameRef}
          inspectorOpen={controller.ingestionInspector.open}
          activeJobCount={controller.ingestionInspector.snapshot.pendingCount}
          bridgeStatus={controller.specializedBridge.status}
          onToggleInspector={controller.ingestionInspector.togglePanel}
        />
      }
    >
      <MerchQuantumView controller={controller} />
      <IngestionInspector
        open={controller.ingestionInspector.open}
        snapshot={controller.ingestionInspector.snapshot}
        bridge={controller.ingestionInspector.bridge}
        onClose={controller.ingestionInspector.closePanel}
        onTogglePaused={controller.ingestionInspector.togglePaused}
        onPurgeFinished={controller.ingestionInspector.purgeFinished}
        onRefreshStorageAudit={controller.ingestionInspector.refreshStorageAudit}
      />
    </QuantumFamilyShell>
  );
}
