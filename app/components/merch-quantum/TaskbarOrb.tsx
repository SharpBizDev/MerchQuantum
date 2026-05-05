'use client';

import { useEffect, useRef } from "react";
import { readAmbientVisualSignalFromRef } from "./ambient";

type TaskbarOrbProps = {
  latestFrameRef: React.MutableRefObject<{ metadata?: Record<string, unknown> } | null>;
  inspectorOpen?: boolean;
  activeJobCount?: number;
  onToggleInspector?: () => void;
};

export function TaskbarOrb({ latestFrameRef, inspectorOpen = false, activeJobCount = 0, onToggleInspector }: TaskbarOrbProps) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animationFrame = 0;

    const paint = () => {
      const signal = readAmbientVisualSignalFromRef(latestFrameRef);
      const color = signal.fallbackSignal ? "255, 191, 0" : "188, 19, 254";
      const intensity = Math.max(0.18, signal.orbPulseIntensity || 0.18);
      const spread = 28 + intensity * 64;

      if (haloRef.current) {
        haloRef.current.style.background = `radial-gradient(circle, rgba(${color}, ${0.16 + intensity * 0.18}) 0%, rgba(${color}, ${0.06 + intensity * 0.08}) 34%, rgba(${color}, 0) 72%)`;
        haloRef.current.style.transform = `translateY(${6 - intensity * 8}px) scale(${1 + intensity * 0.08})`;
        haloRef.current.style.filter = `blur(${spread}px)`;
      }

      if (orbRef.current) {
        orbRef.current.style.boxShadow = `0 0 ${16 + intensity * 22}px rgba(${color}, ${0.55 + intensity * 0.2}), inset 0 0 ${10 + intensity * 12}px rgba(255,255,255,0.12)`;
        orbRef.current.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.92), rgba(${color}, ${0.88 + intensity * 0.08}) 36%, rgba(15,23,42,0.96) 100%)`;
        orbRef.current.style.transform = `translateY(${intensity * -4}px) scale(${1 + intensity * 0.06})`;
      }

      if (railRef.current) {
        railRef.current.style.boxShadow = `0 0 ${18 + intensity * 26}px rgba(${color}, ${0.18 + intensity * 0.18}), inset 0 1px 0 rgba(255,255,255,0.08)`;
        railRef.current.style.borderColor = `rgba(${color}, ${0.18 + intensity * 0.22})`;
      }

      animationFrame = window.requestAnimationFrame(paint);
    };

    animationFrame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [latestFrameRef]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-6">
      <div className="relative flex h-24 w-full max-w-[720px] items-end justify-center">
        <div ref={haloRef} className="absolute inset-x-12 bottom-1 h-10 rounded-full opacity-90 transition-transform duration-150" />
        <div
          ref={railRef}
          className="absolute inset-x-6 bottom-0 h-14 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),rgba(15,23,42,0.68)] backdrop-blur-[16px]"
        />
        {onToggleInspector ? (
          <button
            type="button"
            onClick={onToggleInspector}
            className={`pointer-events-auto absolute bottom-5 right-14 inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border px-3 transition ${inspectorOpen ? "border-[#BC13FE]/45 bg-[#BC13FE]/18 text-white" : "border-white/10 bg-[rgba(15,23,42,0.82)] text-slate-200 hover:border-[#BC13FE]/40 hover:text-white"}`}
            aria-label="Toggle ingestion inspector"
          >
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">Pulse</span>
            {activeJobCount > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#BC13FE]/22 px-1 font-mono text-[10px] text-[#F5D0FE]">
                {activeJobCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <div
          ref={orbRef}
          className="absolute bottom-3 h-16 w-16 rounded-full border border-white/15 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.92),rgba(188,19,254,0.88)_36%,rgba(15,23,42,0.96)_100%)]"
        />
      </div>
    </div>
  );
}
