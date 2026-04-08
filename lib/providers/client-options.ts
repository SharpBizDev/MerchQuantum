import type { ProviderId } from "./types";

export type ProviderOption = {
  id: ProviderId;
  label: string;
  isLive: boolean;
  statusText?: string;
};

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "printify", label: "Printify", isLive: true },
  { id: "printful", label: "Printful", isLive: true },
  { id: "gooten", label: "Gooten", isLive: true },
  { id: "apliiq", label: "Apliiq", isLive: true },
  { id: "spod", label: "SPOD / Spreadconnect", isLive: true },
];
