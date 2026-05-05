'use client';

import { useEffect, useRef } from "react";
import { readAmbientVisualSignalFromRef } from "./ambient";

type SpectralBarProps = {
  latestFrameRef: React.MutableRefObject<{ metadata?: Record<string, unknown> } | null>;
};

export function SpectralBar({ latestFrameRef }: SpectralBarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barsRef = useRef<number[]>(Array.from({ length: 32 }, () => 0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let animationFrame = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = () => {
      const signal = readAmbientVisualSignalFromRef(latestFrameRef);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const barGap = 4;
      const barWidth = Math.max(4, (width - barGap * 31) / 32);

      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(15, 23, 42, 0.42)";
      context.fillRect(0, 0, width, height);

      const backgroundGlow = context.createLinearGradient(0, 0, width, 0);
      backgroundGlow.addColorStop(0, "rgba(188, 19, 254, 0.04)");
      backgroundGlow.addColorStop(0.5, signal.fallbackSignal ? "rgba(255, 191, 0, 0.1)" : "rgba(188, 19, 254, 0.16)");
      backgroundGlow.addColorStop(1, "rgba(188, 19, 254, 0.04)");
      context.fillStyle = backgroundGlow;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < 32; index += 1) {
        const target = signal.amplitudeVector[index] ?? 0;
        const previous = barsRef.current[index] ?? 0;
        const next = previous + (target - previous) * 0.26;
        barsRef.current[index] = next;

        const x = index * (barWidth + barGap);
        const activeHeight = Math.max(6, next * (height - 12));
        const y = height - activeHeight;
        const gradient = context.createLinearGradient(0, y, 0, height);
        if (signal.fallbackSignal) {
          gradient.addColorStop(0, "rgba(255, 234, 173, 0.92)");
          gradient.addColorStop(0.55, "rgba(255, 191, 0, 0.95)");
          gradient.addColorStop(1, "rgba(255, 140, 0, 0.98)");
        } else {
          gradient.addColorStop(0, "rgba(245, 208, 254, 0.95)");
          gradient.addColorStop(0.45, "rgba(188, 19, 254, 0.95)");
          gradient.addColorStop(1, "rgba(76, 29, 149, 0.98)");
        }

        context.fillStyle = gradient;
        context.beginPath();
        context.roundRect(x, y, barWidth, activeHeight, 999);
        context.fill();
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [latestFrameRef]);

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(15,23,42,0.3)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_45%)]" />
      <canvas ref={canvasRef} className="block h-16 w-full" />
    </div>
  );
}
