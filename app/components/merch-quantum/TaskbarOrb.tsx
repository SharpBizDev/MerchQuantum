'use client';

import { useEffect, useRef } from "react";
import { readAmbientVisualSignalFromRef } from "./ambient";

type TaskbarOrbProps = {
  latestFrameRef: React.MutableRefObject<{ metadata?: Record<string, unknown> } | null>;
  inspectorOpen?: boolean;
  activeJobCount?: number;
  bridgeStatus?: "waiting" | "ready" | "error";
  onToggleInspector?: () => void;
};

function bridgeIndicatorClass(status: TaskbarOrbProps["bridgeStatus"]) {
  if (status === "ready") return "bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.95)]";
  if (status === "error") return "bg-[#FF6B6B] shadow-[0_0_18px_rgba(255,107,107,0.95)]";
  return "bg-[#FFBF00] shadow-[0_0_18px_rgba(255,191,0,0.95)]";
}

export function TaskbarOrb({ latestFrameRef, inspectorOpen = false, activeJobCount = 0, bridgeStatus = "waiting", onToggleInspector }: TaskbarOrbProps) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animationFrame = 0;

    const paint = () => {
      const signal = readAmbientVisualSignalFromRef(latestFrameRef);
      const summonBoost = signal.summonWithoutFocus && !signal.fallbackSignal
        ? 0.16 + ((Math.sin(performance.now() / 140) + 1) / 2) * 0.18
        : 0;
      const color = signal.fallbackSignal ? "255, 191, 0" : "188, 19, 254";
      const intensity = Math.max(0.18, Math.min(1, (signal.orbPulseIntensity || 0.18) + summonBoost));
      const spread = 28 + intensity * 68;

      if (haloRef.current) {
        haloRef.current.style.background = `radial-gradient(circle, rgba(${color}, ${0.18 + intensity * 0.22}) 0%, rgba(${color}, ${0.08 + intensity * 0.12}) 34%, rgba(${color}, 0) 72%)`;
        haloRef.current.style.transform = `translateY(${6 - intensity * 9}px) scale(${1 + intensity * 0.1})`;
        haloRef.current.style.filter = `blur(${spread}px)`;
        haloRef.current.style.opacity = signal.summonWithoutFocus ? "1" : "0.9";
      }

      if (orbRef.current) {
        orbRef.current.style.boxShadow = `0 0 ${18 + intensity * 24}px rgba(${color}, ${0.58 + intensity * 0.24}), inset 0 0 ${12 + intensity * 14}px rgba(255,255,255,0.14)`;
        orbRef.current.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.96), rgba(${color}, ${0.9 + intensity * 0.08}) 36%, rgba(15,23,42,0.96) 100%)`;
        orbRef.current.style.transform = `translateY(${intensity * -5}px) scale(${1 + intensity * 0.08})`;
      }

      if (railRef.current) {
        railRef.current.style.boxShadow = `0 0 ${18 + intensity * 28}px rgba(${color}, ${0.18 + intensity * 0.2}), inset 0 1px 0 rgba(255,255,255,0.08)`;
        railRef.current.style.borderColor = `rgba(${color}, ${0.18 + intensity * 0.24})`;
        railRef.current.style.background = `linear-gradient(180deg, rgba(255,255,255,${0.07 + intensity * 0.03}), rgba(255,255,255,0.02)), rgba(15,23,42,${0.7 - intensity * 0.08})`;
      }

      animationFrame = window.requestAnimationFrame(paint);
    };

    animationFrame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [latestFrameRef]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-2 sm:bottom-4 sm:px-6">
      <div className="relative flex h-20 w-full max-w-[720px] items-end justify-center sm:h-24">
        <div ref={haloRef} className="absolute inset-x-10 bottom-1 h-10 rounded-full opacity-90 transition-transform duration-150 sm:inset-x-12" />
        <div
          ref={railRef}
          className="absolute inset-x-2 bottom-0 h-12 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),rgba(15,23,42,0.68)] backdrop-blur-[16px] sm:inset-x-6 sm:h-14 sm:rounded-[28px]"
        />
        {onToggleInspector ? (
          <button
            type="button"
            onClick={onToggleInspector}
            className={`pointer-events-auto absolute bottom-4 right-3 inline-flex h-9 min-w-[40px] items-center justify-center rounded-full border px-2.5 transition sm:bottom-5 sm:right-14 sm:h-11 sm:min-w-[44px] sm:px-3 ${inspectorOpen ? "border-[#BC13FE]/45 bg-[#BC13FE]/18 text-white" : "border-white/10 bg-[rgba(15,23,42,0.82)] text-slate-200 hover:border-[#BC13FE]/40 hover:text-white"}`}
            aria-label="Toggle ingestion inspector"
          >
            <span className={`mr-1.5 inline-flex h-2.5 w-2.5 rounded-full ${bridgeIndicatorClass(bridgeStatus)}`} />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-[11px] sm:tracking-[0.2em]">Pulse</span>
            {activeJobCount > 0 ? (
              <span className="ml-1.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-[#BC13FE]/22 px-1 font-mono text-[9px] text-[#F5D0FE] sm:ml-2 sm:h-5 sm:min-w-[20px] sm:text-[10px]">
                {activeJobCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <div
          ref={orbRef}
          className="absolute bottom-2.5 h-14 w-14 rounded-full border border-white/15 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.92),rgba(188,19,254,0.88)_36%,rgba(15,23,42,0.96)_100%)] sm:bottom-3 sm:h-16 sm:w-16"
        />
      </div>
    </div>
  );
}
