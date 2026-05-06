'use client';

import { memo, useEffect, useMemo, useRef } from "react";
import type { JobGraphJob, JobGraphSnapshot, JobGraphState } from "../../../lib/services/ingestion/JobGraph";
import type { UseSpecializedRefineryBridgeResult } from "./hooks/useSpecializedRefineryBridge";

const ACTIVE_STAGES = new Set<JobGraphState>(["HYDRATING", "SNIFFING", "REFINING"]);

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "--";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function stageChipClass(status: JobGraphState) {
  if (status === "FAILED") {
    return "border-[#BC13FE]/45 bg-[#BC13FE]/12 text-[#F5D0FE]";
  }
  if (status === "FORGED") {
    return "border-emerald-400/35 bg-emerald-400/10 text-emerald-100";
  }
  return "border-white/10 bg-white/5 text-slate-200";
}

function bridgeBadgeClass(status: UseSpecializedRefineryBridgeResult["status"]) {
  if (status === "ready") return "border-emerald-400/35 bg-emerald-400/10 text-emerald-100";
  if (status === "error") return "border-[#FF6B6B]/35 bg-[#FF6B6B]/10 text-[#FFE4E6]";
  return "border-[#FFBF00]/35 bg-[#FFBF00]/10 text-[#FEF3C7]";
}

function formatBridgeSource(source: string | null) {
  if (source === "native-sab-bridge") return "Native (SAB Enabled)";
  if (source === "wasm-browser-loader") return "Browser WASM";
  if (source === "loader") return "Loader";
  return source ?? "pending";
}

function JobRow({ job }: { job: JobGraphJob }) {
  const active = ACTIVE_STAGES.has(job.status);

  return (
    <li className={`rounded-[18px] border ${job.status === "FAILED" ? "border-[#BC13FE]/45" : "border-white/10"} bg-[rgba(15,23,42,0.55)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`} style={{ contentVisibility: "auto", containIntrinsicSize: "220px" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">{job.kind}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${stageChipClass(job.status)} ${active ? "animate-pulse" : ""}`}>
              {job.status}
            </span>
            {job.refineryBucket ? (
              <span className="inline-flex items-center rounded-full border border-[#BC13FE]/30 bg-[#BC13FE]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#E9D5FF]">
                {job.refineryBucket}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 truncate font-mono text-[12px] text-slate-100 sm:text-[13px]">{job.sourceLabel}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
            <span>{job.mimeType}</span>
            <span>{formatBytes(job.byteLength)}</span>
            <span>{Math.round(job.progress * 100)}%</span>
            {job.stagingMode === "sync-worker" ? <span className="text-[#BC13FE]">Fe sync</span> : null}
          </div>
          {job.refinerySummary ? (
            <p className="mt-1.5 text-[11px] leading-4 text-slate-300 sm:text-xs sm:leading-5">{job.refinerySummary}</p>
          ) : null}
        </div>
        <div className="w-full sm:max-w-[148px] sm:shrink-0">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${job.status === "FAILED" ? "bg-[#BC13FE]" : "bg-[linear-gradient(90deg,#BC13FE,rgba(188,19,254,0.35))]"}`}
              style={{ width: `${Math.max(6, Math.round(job.progress * 100))}%` }}
            />
          </div>
        </div>
      </div>
      {job.refineryOutputText ? (
        <details className="mt-2 rounded-[14px] border border-white/8 bg-[rgba(2,6,23,0.35)] p-2.5 text-xs text-slate-200">
          <summary className="cursor-pointer list-none font-semibold text-slate-200">Refined Metadata</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-slate-300 sm:text-[11px] sm:leading-5">{job.refineryOutputText}</pre>
        </details>
      ) : null}
      {job.status === "FAILED" && job.errorDetail ? (
        <details className="mt-2 rounded-[14px] border border-[#BC13FE]/35 bg-[rgba(188,19,254,0.08)] p-2.5 text-xs text-slate-200">
          <summary className="cursor-pointer list-none font-semibold text-[#F5D0FE]">Failure Detail</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-slate-200 sm:text-[11px] sm:leading-5">{job.errorDetail}</pre>
        </details>
      ) : null}
    </li>
  );
}

function IngestionInspectorImpl({
  open,
  snapshot,
  bridge,
  onClose,
  onTogglePaused,
  onPurgeFinished,
  onRefreshStorageAudit,
}: {
  open: boolean;
  snapshot: JobGraphSnapshot;
  bridge: UseSpecializedRefineryBridgeResult;
  onClose: () => void;
  onTogglePaused: () => void | Promise<void>;
  onPurgeFinished: () => void | Promise<void>;
  onRefreshStorageAudit: () => void | Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !panelRef.current) return;

    let animationFrame = 0;
    const paint = () => {
      const phase = (Math.sin(performance.now() / 900) + 1) / 2;
      panelRef.current?.style.setProperty("--inspector-haunt", phase.toFixed(4));
      animationFrame = window.requestAnimationFrame(paint);
    };

    animationFrame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [open]);

  const sortedJobs = useMemo(
    () => [...snapshot.jobs].sort((left, right) => right.updatedAt - left.updatedAt),
    [snapshot.jobs]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(2,6,23,0.58)] px-2 pb-20 pt-2 backdrop-blur-[10px] sm:items-center sm:px-4 sm:pb-6 sm:pt-6">
      <div
        ref={panelRef}
        className="glass-pane relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[rgba(15,23,42,0.84)] text-white shadow-[0_40px_140px_-42px_rgba(2,6,23,0.95)] [--inspector-haunt:0.5] sm:rounded-[28px]" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(188,19,254,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(188,19,254,0.08),transparent_28%)] opacity-[calc(0.4+var(--inspector-haunt)*0.22)]" />
        <div className="relative border-b border-white/10 px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-slate-400 sm:text-[11px] sm:tracking-[0.32em]">Universal Ingestion Ledger</p>
              <h2 className="mt-1.5 text-[clamp(1rem,4vw,1.25rem)] font-semibold text-white">Refinery Inspector</h2>
              <p className="mt-1.5 max-w-2xl text-[11px] leading-4 text-slate-300 sm:text-sm sm:leading-5">Live audit of hydration, sniffing, refinement, and forged output moving through the universal job graph.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-200 transition hover:border-[#BC13FE]/40 hover:text-white sm:text-xs sm:tracking-[0.24em]"
            >
              Close
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {Object.entries(snapshot.counts).map(([label, value]) => (
              <div key={label} className="rounded-[16px] border border-white/10 bg-white/5 px-2 py-1.5" style={{ containerType: "inline-size", fontSize: "clamp(12px, calc(11.07px + 0.33cqi), 14px)" }}>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px] sm:tracking-[0.24em]">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white sm:mt-2 sm:text-lg">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid min-h-0 flex-1 gap-2 overflow-hidden px-3 py-3 sm:px-5 sm:py-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-4">
          <section className="order-1 min-h-0 rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 sm:rounded-[22px] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px] sm:tracking-[0.24em]">Live Ledger</p>
              <p className="font-mono text-[10px] text-slate-400 sm:text-[11px]">{sortedJobs.length} jobs</p>
            </div>
            <div className="max-h-[52vh] overflow-y-auto pr-1 [scrollbar-width:thin] sm:max-h-[48vh]">
              <ul className="space-y-2">
                {sortedJobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            </div>
          </section>

          <aside className="order-2 flex min-h-0 flex-col gap-2 xl:order-2 xl:gap-4">
            <section className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 sm:rounded-[22px] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px] sm:tracking-[0.24em]">Storage Audit</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-200 sm:text-sm sm:leading-5">{snapshot.storageAudit.reason ?? "OPFS scratch iron is available."}</p>
                </div>
                {snapshot.storageAudit.syncAccessHandleReady ? (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#BC13FE]/35 bg-[#BC13FE]/10 font-mono text-[11px] font-semibold text-[#F5D0FE]">Fe</span>
                ) : (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-[11px] font-semibold text-slate-300">OP</span>
                )}
              </div>
              <dl className="mt-3 space-y-2 text-[11px] text-slate-300 sm:text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt>Usage</dt>
                  <dd className="font-mono text-slate-100">{formatBytes(snapshot.storageAudit.usageBytes)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Quota</dt>
                  <dd className="font-mono text-slate-100">{formatBytes(snapshot.storageAudit.quotaBytes)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Mode</dt>
                  <dd className="font-mono text-slate-100">{snapshot.storageAudit.preferredMode}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Isolation</dt>
                  <dd className="font-mono text-slate-100">{snapshot.storageAudit.crossOriginIsolated ? "isolated" : "shared"}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 sm:rounded-[22px] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px] sm:tracking-[0.24em]">Bridge Status</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-200 sm:text-sm sm:leading-5">{bridge.message}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] ${bridgeBadgeClass(bridge.status)} sm:text-[10px] sm:tracking-[0.22em]`}>
                  {bridge.status}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-[11px] text-slate-300 sm:text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt>Source</dt>
                  <dd className="font-mono text-slate-100">{formatBridgeSource(bridge.source)}</dd>
                </div>
                {bridge.lastError ? (
                  <div className="rounded-[14px] border border-[#FF6B6B]/35 bg-[rgba(255,107,107,0.08)] p-3">
                    <dt className="font-semibold text-[#FFE4E6]">Bridge Error</dt>
                    <dd className="mt-2 font-mono text-[10px] leading-4 text-slate-200 sm:text-[11px] sm:leading-5">{bridge.lastError}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 sm:rounded-[22px] sm:p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px] sm:tracking-[0.24em]">Pressure Readout</p>
              <dl className="mt-3 space-y-2 text-[11px] text-slate-300 sm:text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt>Pending</dt>
                  <dd className="font-mono text-slate-100">{snapshot.pendingCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Hydration</dt>
                  <dd className="font-mono text-slate-100">{snapshot.activeHydrationCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Forged</dt>
                  <dd className="font-mono text-slate-100">{snapshot.specializedForgedCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Queue Pressure</dt>
                  <dd className="font-mono text-slate-100">{Math.round(snapshot.queuePressure * 100)}%</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[rgba(2,6,23,0.55)] px-3 py-3 backdrop-blur-[18px] sm:px-5 sm:py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
            {snapshot.paused ? "Ledger paused" : "Ledger live"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onRefreshStorageAudit()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-200 transition hover:border-[#BC13FE]/35 hover:text-white sm:text-xs sm:tracking-[0.22em]"
            >
              Refresh Audit
            </button>
            <button
              type="button"
              onClick={() => void onTogglePaused()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-200 transition hover:border-[#BC13FE]/35 hover:text-white sm:text-xs sm:tracking-[0.22em]"
            >
              {snapshot.paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => void onPurgeFinished()}
              className="rounded-full border border-[#BC13FE]/35 bg-[#BC13FE]/12 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#F5D0FE] transition hover:bg-[#BC13FE]/18 sm:text-xs sm:tracking-[0.22em]"
            >
              Purge Finished
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const IngestionInspector = memo(IngestionInspectorImpl);

