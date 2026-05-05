import type { ReactNode } from "react";

type QuantumFamilyShellProps = {
  children: ReactNode;
  spectralSlot?: ReactNode;
  taskbarSlot?: ReactNode;
};

const HAUNTED_MASK =
  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.95), transparent 48%), radial-gradient(circle at 80% 18%, rgba(255,255,255,0.7), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.55))";

export function QuantumFamilyShell({ children, spectralSlot, taskbarSlot }: QuantumFamilyShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(188,19,254,0.24),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(96,165,250,0.12),transparent_24%),linear-gradient(180deg,#020617_0%,#020617_100%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          maskImage: HAUNTED_MASK,
          WebkitMaskImage: HAUNTED_MASK,
          background:
            "linear-gradient(125deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 42%, rgba(188,19,254,0.08) 100%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-[1700px] flex-col px-2 py-2 sm:px-4 sm:py-4">
        <div className="relative flex min-h-[calc(100vh-1rem)] flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.62)] shadow-[0_40px_120px_-48px_rgba(15,23,42,0.95)] backdrop-blur-[20px] [backdrop-filter:blur(20px)_saturate(180%)] sm:min-h-[calc(100vh-1.5rem)] sm:rounded-[32px]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#BC13FE]/80 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_90%_80%,rgba(188,19,254,0.1),transparent_26%)]" />
          {spectralSlot ? (
            <div className="pointer-events-none relative z-10 px-2 pb-1 pt-2 sm:px-6 sm:pb-2 sm:pt-5">
              {spectralSlot}
            </div>
          ) : null}
          <div className="relative z-10 flex flex-1 flex-col">{children}</div>
        </div>
      </div>
      {taskbarSlot}
    </div>
  );
}
