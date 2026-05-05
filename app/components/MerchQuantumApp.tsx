'use client';

import { QuantumFamilyShell } from "./quantum-family/Shell";
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
      taskbarSlot={<TaskbarOrb latestFrameRef={controller.ambientStreams.latestFrameRef} />}
    >
      <MerchQuantumView controller={controller} />
    </QuantumFamilyShell>
  );
}
