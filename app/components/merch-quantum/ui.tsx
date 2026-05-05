'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSmartThumbnailSource,
  choosePreviewBackgroundFromImageElement,
  DISPLAY_DARK_BACKGROUND,
  ensureContrastPreviewBackground,
  resolvePreviewSurfaceBackground,
} from "../../../lib/services/merch-quantum/artwork-analysis";
import type { ProductGridProps, SmartThumbnailProps } from "./types";

const BOOT_TAGLINE = "EFFORTLESS PRODUCT CREATION.";
const BRAND_WORDMARK_TEXT_CLASSES = "text-3xl sm:text-4xl";
const BRAND_TAGLINE_TEXT_CLASSES = "text-[12px]";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

type BoxProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
};

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`box-border h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-[#020616] px-3 font-sans text-sm text-white outline-none transition placeholder:text-slate-200 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-200 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function SetupInput({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`box-border h-9 w-full min-w-0 rounded-xl border border-slate-700 bg-[#020616] px-3 font-sans text-sm font-normal text-white outline-none transition placeholder:text-slate-200 focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-200 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function SetupSelect({ className = "", children, ...props }: SelectProps) {
  return (
    <div className={`relative min-w-0 w-full text-sm font-normal text-white ${props.disabled ? "cursor-not-allowed" : ""}`}>
      <select
        className={`box-border h-9 w-full min-w-0 appearance-none rounded-xl border border-slate-700 bg-[#020616] px-3 pr-8 font-sans text-sm font-normal text-white outline-none transition focus:border-[#7F22FE] focus:ring-2 focus:ring-[#7F22FE]/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-[#020616] disabled:text-slate-200 disabled:opacity-60 ${className}`}
        {...props}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-100" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

export function Box({ title, children, className = "", headerClassName = "" }: BoxProps) {
  return (
    <section className={`rounded-[28px] border border-slate-800 bg-[#020616] p-4 text-white shadow-[0_18px_60px_-38px_rgba(2,6,22,0.9)] backdrop-blur-sm ${className}`}>
      {title ? <div className={`mb-4 text-sm font-semibold leading-6 tracking-tight ${headerClassName}`}>{title}</div> : null}
      {children}
    </section>
  );
}

export function MerchQuantumInlineHeading({ className = "" }: { className?: string }) {
  return (
    <span className={`min-w-0 text-sm font-semibold leading-6 tracking-tight text-white ${className}`}>
      <span className="text-[#7F22FE]">Merch</span>{" "}
      <span className="text-white">Quantum AI bulk auto listings</span>
    </span>
  );
}

export function CreativeWellspringBrandMark({ docked = false, className = "" }: { docked?: boolean; className?: string }) {
  if (docked) {
    return (
      <div className={`mt-auto py-4 flex flex-col items-center justify-center gap-1 text-center ${className}`.trim()}>
        <div className={`flex items-center gap-x-1 ${BRAND_WORDMARK_TEXT_CLASSES}`}>
          <span className="font-bold tracking-tighter text-[#7F22FE]">Merch</span>
          <span className="font-bold tracking-tighter text-white">Quantum</span>
        </div>
        <span className={`block font-medium tracking-widest text-white uppercase ${BRAND_TAGLINE_TEXT_CLASSES}`}>
          effortless product creation
        </span>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none relative z-10 flex w-full items-center justify-center ${docked ? "min-h-[88px]" : "min-h-[148px]"} ${className}`}
      aria-hidden="true"
    >
      <div className="relative z-10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-1 px-6 text-center">
          <div className={`flex flex-wrap items-baseline justify-center gap-x-2 tracking-tight ${BRAND_WORDMARK_TEXT_CLASSES}`}>
            <span className="font-bold text-[#7F22FE]">Merch</span>
            <span className="font-medium text-white">Quantum</span>
          </div>
          <p className={`font-light uppercase tracking-[0.3em] text-slate-300 ${BRAND_TAGLINE_TEXT_CLASSES}`}>
            {BOOT_TAGLINE}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SmartThumbnail({
  src,
  alt,
  className = "",
  safeZoneClassName = "",
  imageClassName = "absolute top-[5%] h-[90%] w-full object-contain object-top",
  fallbackClassName = "",
  children,
}: SmartThumbnailProps) {
  const resolvedSrc = useMemo(() => buildSmartThumbnailSource(src), [src]);
  const [backgroundColor, setBackgroundColor] = useState(DISPLAY_DARK_BACKGROUND);

  useEffect(() => {
    let isCancelled = false;

    if (!resolvedSrc) {
      setBackgroundColor(DISPLAY_DARK_BACKGROUND);
      return;
    }

    void resolvePreviewSurfaceBackground(resolvedSrc).then((background) => {
      if (isCancelled) return;
      setBackgroundColor(ensureContrastPreviewBackground(background));
    });

    return () => {
      isCancelled = true;
    };
  }, [resolvedSrc]);

  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      setBackgroundColor(
        ensureContrastPreviewBackground(choosePreviewBackgroundFromImageElement(event.currentTarget))
      );
    } catch {
      setBackgroundColor(DISPLAY_DARK_BACKGROUND);
    }
  }, []);

  return (
    <div
      className={`relative box-border flex aspect-square w-full overflow-hidden bg-center bg-cover bg-no-repeat ${className}`}
      style={{ backgroundColor }}
    >
      <div className={`relative flex w-full h-full overflow-hidden justify-center ${safeZoneClassName}`}>
        {resolvedSrc ? (
          <img src={resolvedSrc} alt={alt} className={imageClassName} onLoad={handleImageLoad} />
        ) : (
          <div className={`h-full w-full ${fallbackClassName}`} />
        )}
      </div>
      {children}
    </div>
  );
}

export function ProductGrid({
  heading,
  items,
  selectedIds,
  activeId,
  importedProductIds,
  highlighted = false,
  collapsed = false,
  rangeLabel,
  page,
  pageSize,
  totalPages,
  loading,
  headerAccessory,
  onToggleCollapsed,
  onSelectAll,
  selectAllLabel = "Select All",
  footerLabel,
  onItemActivate,
  onPreviousPage,
  onNextPage,
  footerActions,
}: ProductGridProps) {
  const visibleItems = collapsed ? items.slice(0, 5) : items;
  const displayedRangeLabel = useMemo(() => {
    const sourceLabel = typeof footerLabel === "string" && footerLabel.trim().length > 0 ? footerLabel : rangeLabel;
    const match = String(sourceLabel || "").match(/^(\d+)-(\d+) of (\d+)$/);
    if (!match) return sourceLabel;
    const start = Number(match[1]);
    const total = Number(match[3]);
    const end = collapsed ? Math.min(total, start + Math.max(visibleItems.length - 1, 0)) : Number(match[2]);
    return `${start}-${end} of ${total}`;
  }, [collapsed, footerLabel, rangeLabel, visibleItems.length]);

  return (
    <div className={`mx-auto flex w-full max-w-6xl flex-col gap-2 ${highlighted ? "drop-shadow-[0_10px_24px_rgba(127,34,254,0.18)]" : ""}`}>
      <div className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-white">{heading}</span>
        <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 text-xs">
          {onSelectAll ? (
            <button
              type="button"
              className="font-medium text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
              disabled={items.length === 0}
              onClick={onSelectAll}
            >
              {selectAllLabel}
            </button>
          ) : null}
          {headerAccessory}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="grid h-full w-full grid-cols-5 gap-1 overflow-hidden snap-y snap-mandatory">
          {visibleItems.map((product, index) => {
            const globalIndex = page * pageSize + index;
            const isSelected = selectedIds.includes(product.id);
            const isActive = activeId === product.id;
            const alreadyImported = importedProductIds.has(product.id);
            const cardTone = isSelected
              ? "border-[#7F22FE] shadow-[inset_0_0_0_2px_rgba(127,34,254,0.85),0_0_10px_rgba(147,51,234,0.32)] opacity-100"
              : isActive
                ? "border-[#7F22FE]/70 shadow-[inset_0_0_0_2px_rgba(127,34,254,0.55)] opacity-100"
                : alreadyImported
                  ? "border-[#00BC7D]/45 opacity-75 hover:opacity-100"
                  : "border-slate-800/80 opacity-85 hover:opacity-100";
            const frameGlow = isSelected
              ? "shadow-[0_10px_24px_-20px_rgba(124,58,237,0.45)]"
              : isActive
                ? "shadow-[0_8px_20px_-18px_rgba(124,58,237,0.38)]"
                : "";

            return (
              <button
                key={product.id}
                type="button"
                onClick={(event) => onItemActivate(product, globalIndex, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onItemActivate(product, globalIndex, event);
                  }
                }}
                className={`w-full snap-start transition-all duration-500 focus-visible:outline-none ${frameGlow}`}
                aria-label={product.title}
              >
                <SmartThumbnail
                  src={product.previewUrl}
                  alt={product.title}
                  className={`group rounded-lg border transition-all duration-200 ease-out hover:z-10 hover:shadow-[inset_0_0_0_2px_rgba(127,34,254,0.8)] ${cardTone}`}
                  fallbackClassName="flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(127,34,254,0.28),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,22,0.98))]"
                >
                  {(isSelected || alreadyImported) ? (
                    <span
                      className={`absolute left-2 top-2 h-2.5 w-2.5 rounded-full ${
                        isSelected
                          ? "bg-[#C084FC] shadow-[0_0_10px_rgba(192,132,252,0.95)]"
                          : "bg-[#00BC7D] shadow-[0_0_8px_rgba(0,188,125,0.9)]"
                      }`}
                    />
                  ) : null}
                </SmartThumbnail>
              </button>
            );
          })}
        </div>
      ) : loading ? (
        <div className="flex w-full min-h-[16rem] items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-2 px-6 text-center">
            <QuantOrbLoader />
            <span className="font-sans text-sm font-normal text-white">Awaiting Quantum AI...</span>
          </div>
        </div>
      ) : null}

      <div className="flex w-full items-center justify-between gap-2 pt-1 text-xs">
        <div className="min-w-0 flex-1 truncate text-slate-100">{displayedRangeLabel}</div>
        <div className="flex items-center justify-end gap-2">
          {footerActions}
          {onToggleCollapsed ? (
            <button type="button" onClick={onToggleCollapsed} className="text-sm font-normal text-gray-400 transition-colors hover:text-white">
              {collapsed ? "Maximize" : "Minimize"}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Previous ${pageSize} items`}
            className="inline-flex items-center justify-center text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
            disabled={page <= 0}
            onClick={onPreviousPage}
          >
            <ChevronIcon open={false} className="h-4 w-4 rotate-90" />
          </button>
          <button
            type="button"
            aria-label={`Next ${pageSize} items`}
            className="inline-flex items-center justify-center text-slate-100 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-200"
            disabled={page >= totalPages - 1}
            onClick={onNextPage}
          >
            <ChevronIcon open={false} className="h-4 w-4 -rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuantOrbLoader({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}>
      <span className="absolute inset-0 rounded-full bg-[#7F22FE]/22 blur-[4px]" />
      <span className="absolute inset-0 inline-flex items-center justify-center animate-[spin_2.4s_linear_infinite]">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 text-[#C084FC]">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.25" fill="none" />
          <path d="M8 1.75a6.25 6.25 0 0 1 4.68 2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </span>
      <span className="absolute inset-[4px] rounded-full bg-[#7F22FE] shadow-[0_0_12px_rgba(127,34,254,0.9)]" />
    </span>
  );
}

export function WorkspaceModeLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-2 px-6 text-center">
        <QuantOrbLoader />
        <span className="font-sans text-sm font-normal text-white">{label}</span>
      </div>
    </div>
  );
}

export function StatusThumbIcon({ tone, direction }: { tone: "ready" | "error"; direction: "up" | "down" }) {
  const colorClass = tone === "ready" ? "text-[#00BC7D]" : "text-[#FF2056]";

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-3 w-3 shrink-0 ${colorClass}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35">
      {direction === "up" ? (
        <path d="M6.25 7 8.4 3.35c.22-.38.62-.6 1.06-.6h.16c.6 0 1.09.49 1.09 1.1v2.1h1.92c.77 0 1.35.7 1.23 1.46l-.63 3.86c-.1.58-.6 1.01-1.19 1.01H6.25m0-5.28H4.18c-.49 0-.88.39-.88.88v3.68c0 .49.39.88.88.88h2.07V7Z" />
      ) : (
        <path d="M9.75 9 7.6 12.65c-.22.38-.62.6-1.06.6h-.16c-.6 0-1.09-.49-1.09-1.1v-2.1H3.37c-.77 0-1.35-.7-1.23-1.46l.63-3.86c.1-.58.6-1.01 1.19-1.01h5.79m0 5.28h2.07c.49 0 .88-.39.88-.88V4.44c0-.49-.39-.88-.88-.88H9.75V9Z" />
      )}
    </svg>
  );
}

export function ReRollIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2">
      <path d="M12.75 5.25V2.8m0 0h-2.45m2.45 0L9.9 5.65" />
      <path d="M12.1 8a4.7 4.7 0 1 1-1.38-3.32" />
    </svg>
  );
}

export function ConnectArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4">
      <path d="M3.25 8h8.5" />
      <path d="m8.9 4.15 3.85 3.85-3.85 3.85" />
    </svg>
  );
}

export function ChevronIcon({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`${className} transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4">
      <path d="M4.75 6.25 8 9.5l3.25-3.25" />
    </svg>
  );
}