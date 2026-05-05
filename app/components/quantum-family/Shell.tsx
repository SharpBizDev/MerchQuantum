'use client';

import { useEffect, useRef, type ReactNode } from "react";

type QuantumFamilyShellProps = {
  children: ReactNode;
  spectralSlot?: ReactNode;
  taskbarSlot?: ReactNode;
};

type HoleScoreDetail = {
  width?: number;
  height?: number;
};

const HAUNTED_MASK =
  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.95), transparent 48%), radial-gradient(circle at 80% 18%, rgba(255,255,255,0.7), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.55))";
const HOLE_SCORE_EVENT = "contextquantum:hole-score";

function applyDensity(shell: HTMLDivElement, compact: boolean) {
  shell.dataset.holeCompact = compact ? "true" : "false";
  shell.style.setProperty("--cq-shell-inline", compact ? "0.45rem" : "clamp(0.55rem, 1.35vw, 1rem)");
  shell.style.setProperty("--cq-shell-block", compact ? "0.45rem" : "clamp(0.55rem, 1.4vw, 1rem)");
  shell.style.setProperty("--cq-shell-radius", compact ? "1.1rem" : "clamp(1.4rem, 3vw, 2rem)");
  shell.style.setProperty("--cq-spectral-pad", compact ? "0.35rem" : "clamp(0.45rem, 1.3vw, 0.9rem)");
  shell.style.setProperty("--cq-spectral-top", compact ? "0.55rem" : "clamp(0.7rem, 1.8vw, 1.4rem)");
}

export function QuantumFamilyShell({ children, spectralSlot, taskbarSlot }: QuantumFamilyShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    applyDensity(shell, window.innerWidth <= 360);

    const onResize = () => {
      if (!shell.dataset.nativeHoleCompact) {
        applyDensity(shell, window.innerWidth <= 360);
      }
    };

    const onHoleScore = (event: Event) => {
      const detail = (event as CustomEvent<HoleScoreDetail>).detail ?? {};
      const compact = (detail.width ?? Number.POSITIVE_INFINITY) <= 560 || (detail.height ?? Number.POSITIVE_INFINITY) <= 720;
      shell.dataset.nativeHoleCompact = compact ? "true" : "";
      applyDensity(shell, compact);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener(HOLE_SCORE_EVENT, onHoleScore as EventListener);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener(HOLE_SCORE_EVENT, onHoleScore as EventListener);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className="relative min-h-screen overflow-hidden bg-[#020617] text-white"
      style={{
        ['--cq-shell-inline' as string]: 'clamp(0.55rem, 1.35vw, 1rem)',
        ['--cq-shell-block' as string]: 'clamp(0.55rem, 1.4vw, 1rem)',
        ['--cq-shell-radius' as string]: 'clamp(1.4rem, 3vw, 2rem)',
        ['--cq-spectral-pad' as string]: 'clamp(0.45rem, 1.3vw, 0.9rem)',
        ['--cq-spectral-top' as string]: 'clamp(0.7rem, 1.8vw, 1.4rem)',
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(188,19,254,0.24),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(96,165,250,0.12),transparent_24%),linear-gradient(180deg,#020617_0%,#020617_100%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          maskImage: HAUNTED_MASK,
          WebkitMaskImage: HAUNTED_MASK,
          background: 'linear-gradient(125deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 42%, rgba(188,19,254,0.08) 100%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-[1700px] flex-col px-[var(--cq-shell-inline)] py-[var(--cq-shell-block)]">
        <div className="relative flex min-h-[calc(100vh-(var(--cq-shell-block)*2))] flex-1 flex-col overflow-hidden rounded-[var(--cq-shell-radius)] border border-white/10 bg-[rgba(15,23,42,0.62)] shadow-[0_40px_120px_-48px_rgba(15,23,42,0.95)] backdrop-blur-[20px] [backdrop-filter:blur(20px)_saturate(180%)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#BC13FE]/80 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_90%_80%,rgba(188,19,254,0.1),transparent_26%)]" />
          {spectralSlot ? (
            <div className="pointer-events-none relative z-10 px-[var(--cq-spectral-pad)] pb-[calc(var(--cq-spectral-pad)*0.65)] pt-[var(--cq-spectral-top)]">
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
