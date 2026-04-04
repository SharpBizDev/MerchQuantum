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
  { id: "gelato", label: "Gelato", isLive: false, statusText: "Coming soon" },
  { id: "gooten", label: "Gooten", isLive: false, statusText: "Coming soon" },
  { id: "apliiq", label: "Apliiq", isLive: true },
  { id: "spod", label: "SPOD / Spreadconnect", isLive: true },
  { id: "prodigi", label: "Prodigi", isLive: false, statusText: "Coming soon" },
  { id: "lulu_direct", label: "Lulu Direct", isLive: false, statusText: "Coming soon" },
];
