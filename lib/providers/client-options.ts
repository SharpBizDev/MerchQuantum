import type { ProviderId } from "./types";

export type ProviderChoiceId = ProviderId | "spreadconnect";

export type ProviderOption = {
  id: ProviderChoiceId;
  providerId: ProviderId;
  label: string;
  isLive: boolean;
  statusText?: string;
};

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "printify", providerId: "printify", label: "Printify", isLive: true },
  { id: "printful", providerId: "printful", label: "Printful", isLive: true },
  { id: "gooten", providerId: "gooten", label: "Gooten", isLive: true },
  { id: "apliiq", providerId: "apliiq", label: "Apliiq", isLive: true },
  { id: "spod", providerId: "spod", label: "SPOD", isLive: true },
  { id: "spreadconnect", providerId: "spod", label: "Spreadconnect", isLive: true },
];
