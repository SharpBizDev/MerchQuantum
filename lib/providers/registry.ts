import { createApliiqAdapter, APLIIQ_CAPABILITIES } from "./apliiq/adapter";
import { ProviderError } from "./errors";
import type { ProviderAdapter } from "./contracts";
import { createPrintfulAdapter, PRINTFUL_CAPABILITIES } from "./printful/adapter";
import { createPrintifyAdapter, PRINTIFY_CAPABILITIES } from "./printify/adapter";
import { createProdigiAdapter, PRODIGI_CAPABILITIES } from "./prodigi/adapter";
import { createSpodAdapter, SPOD_CAPABILITIES } from "./spod/adapter";
import { EMPTY_PROVIDER_CAPABILITIES, type ProviderCapabilities, type ProviderId } from "./types";

export type ProviderRegistryEntry = {
  id: ProviderId;
  displayName: string;
  implemented: boolean;
  capabilities: ProviderCapabilities;
  createAdapter?: () => ProviderAdapter;
};

const PROVIDER_REGISTRY: Record<ProviderId, ProviderRegistryEntry> = {
  printify: {
    id: "printify",
    displayName: "Printify",
    implemented: true,
    capabilities: PRINTIFY_CAPABILITIES,
    createAdapter: () => createPrintifyAdapter(),
  },
  printful: {
    id: "printful",
    displayName: "Printful",
    implemented: true,
    capabilities: PRINTFUL_CAPABILITIES,
    createAdapter: () => createPrintfulAdapter(),
  },
  gelato: { id: "gelato", displayName: "Gelato", implemented: false, capabilities: EMPTY_PROVIDER_CAPABILITIES },
  gooten: { id: "gooten", displayName: "Gooten", implemented: false, capabilities: EMPTY_PROVIDER_CAPABILITIES },
  apliiq: {
    id: "apliiq",
    displayName: "Apliiq",
    implemented: true,
    capabilities: APLIIQ_CAPABILITIES,
    createAdapter: () => createApliiqAdapter(),
  },
  prodigi: {
    id: "prodigi",
    displayName: "Prodigi",
    implemented: true,
    capabilities: PRODIGI_CAPABILITIES,
    createAdapter: () => createProdigiAdapter(),
  },
  lulu_direct: { id: "lulu_direct", displayName: "Lulu Direct", implemented: false, capabilities: EMPTY_PROVIDER_CAPABILITIES },
  spod: {
    id: "spod",
    displayName: "SPOD / Spreadconnect",
    implemented: true,
    capabilities: SPOD_CAPABILITIES,
    createAdapter: () => createSpodAdapter(),
  },
};

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDER_REGISTRY;
}

export function listProviderEntries() {
  return Object.values(PROVIDER_REGISTRY);
}

export function getProviderEntry(providerId: ProviderId) {
  return PROVIDER_REGISTRY[providerId];
}

export function getProviderAdapter(providerId: ProviderId) {
  const entry = PROVIDER_REGISTRY[providerId];

  if (!entry?.implemented || !entry.createAdapter) {
    throw new ProviderError({
      providerId,
      code: "unsupported_operation",
      status: 501,
      message: `${entry?.displayName || providerId} is not implemented in the adapter registry yet.`,
    });
  }

  return entry.createAdapter();
}
