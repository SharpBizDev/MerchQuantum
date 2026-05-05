declare module "/refinery-wasm/quantum_core.js" {
  export default function init(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
  export function refine_specialized_bytes(kind: string, buffer: Uint8Array): string;
}
