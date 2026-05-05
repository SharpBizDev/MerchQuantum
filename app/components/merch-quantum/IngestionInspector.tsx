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

function JobRow({ job }: { job: JobGraphJob }) {
  const active = ACTIVE_STAGES.has(job.status);

  return (
    <li className={`rounded-[20px] border ${job.status === "FAILED" ? "border-[#BC13FE]/45" : "border-white/10"} bg-[rgba(15,23,42,0.55)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[12px] uppercase tracking-[0.28em] text-slate-400">{job.kind}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${stageChipClass(job.status)} ${active ? "animate-pulse" : ""}`}>
              {job.status}
            </span>
            {job.refineryBucket ? (
              <span className="inline-flex items-center rounded-full border border-[#BC13FE]/30 bg-[#BC13FE]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#E9D5FF]">
                {job.refineryBucket}
              </span>
            ) : null}
          </div>
          <p className="mt-2 truncate font-mono text-sm text-slate-200">{job.sourceLabel}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span>{job.mimeType}</span>
            <span>{formatBytes(job.byteLength)}</span>
            <span>{Math.round(job.progress * 100)}%</span>
            {job.stagingMode === "sync-worker" ? <span className="text-[#BC13FE]">Fe sync</span> : null}
          </div>
          {job.refinerySummary ? (
            <p className="mt-2 text-xs leading-5 text-slate-300">{job.refinerySummary}</p>
          ) : null}
        </div>
        <div className="w-full max-w-[180px] shrink-0">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${job.status === "FAILED" ? "bg-[#BC13FE]" : "bg-[linear-gradient(90deg,#BC13FE,rgba(188,19,254,0.35))]"}`}
              style={{ width: `${Math.max(6, Math.round(job.progress * 100))}%` }}
            />
          </div>
        </div>
      </div>
      {job.status === "FAILED" && job.errorDetail ? (
        <details className="mt-3 rounded-[16px] border border-[#BC13FE]/35 bg-[rgba(188,19,254,0.08)] p-3 text-xs text-slate-200">
          <summary className="cursor-pointer list-none font-semibold text-[#F5D0FE]">Failure Detail</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-slate-200">{job.errorDetail}</pre>
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(2,6,23,0.55)] px-4 pb-28 pt-6 backdrop-blur-[10px] sm:items-center sm:pb-6">
      <div
        ref={panelRef}
        className="relative flex max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.82)] text-white shadow-[0_40px_140px_-42px_rgba(2,6,23,0.95)] [--inspector-haunt:0.5]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(188,19,254,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(188,19,254,0.08),transparent_28%)] opacity-[calc(0.4+var(--inspector-haunt)*0.22)]" />
        <div className="relative border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-slate-400">Universal Ingestion Ledger</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Refinery Inspector</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">Live audit of hydration, sniffing, refinement, and forged output moving through the universal job graph.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-200 transition hover:border-[#BC13FE]/40 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {Object.entries(snapshot.counts).map(([label, value]) => (
              <div key={label} className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid min-h-0 flex-1 gap-4 overflow-hidden px-5 py-4 sm:px-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-4">
            <section className="rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Storage Audit</p>
                  <p className="mt-1 text-sm text-slate-200">{snapshot.storageAudit.reason ?? "OPFS scratch iron is available."}</p>
                </div>
                {snapshot.storageAudit.syncAccessHandleReady ? (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#BC13FE]/35 bg-[#BC13FE]/10 font-mono text-xs font-semibold text-[#F5D0FE]">Fe</span>
                ) : (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-xs font-semibold text-slate-300">OP</span>
                )}
              </div>
              <dl className="mt-4 space-y-2 text-sm text-slate-300">
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

            <section className="rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Bridge Status</p>
                  <p className="mt-1 text-sm text-slate-200">{bridge.message}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] ${bridgeBadgeClass(bridge.status)}`}>
                  {bridge.status}
                </span>
              </div>
              <dl className="mt-4 space-y-2 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <dt>Source</dt>
                  <dd className="font-mono text-slate-100">{bridge.source ?? "pending"}</dd>
                </div>
                {bridge.lastError ? (
                  <div className="rounded-[16px] border border-[#FF6B6B]/35 bg-[rgba(255,107,107,0.08)] p-3">
                    <dt className="font-semibold text-[#FFE4E6]">Bridge Error</dt>
                    <dd className="mt-2 font-mono text-[11px] leading-5 text-slate-200">{bridge.lastError}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Pressure Readout</p>
              <dl className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <dt>Pending</dt>
                  <dd className="font-mono text-slate-100">{snapshot.pendingCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Active Hydration</dt>
                  <dd className="font-mono text-slate-100">{snapshot.activeHydrationCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Terminal</dt>
                  <dd className="font-mono text-slate-100">{snapshot.terminalCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Queue Pressure</dt>
                  <dd className="font-mono text-slate-100">{Math.round(snapshot.queuePressure * 100)}%</dd>
                </div>
              </dl>
            </section>
          </aside>

          <section className="min-h-0 rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Live Ledger</p>
              <p className="font-mono text-[11px] text-slate-400">{sortedJobs.length} jobs</p>
            </div>
            <div className="max-h-[48vh] overflow-y-auto pr-1 [scrollbar-width:thin]">
              <ul className="space-y-3">
                {sortedJobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            </div>
          </section>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[rgba(2,6,23,0.55)] px-5 py-4 backdrop-blur-[18px] sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-400">
            {snapshot.paused ? "Ledger paused" : "Ledger live"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onRefreshStorageAudit()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs uppercase tracking-[0.22em] text-slate-200 transition hover:border-[#BC13FE]/35 hover:text-white"
            >
              Refresh Audit
            </button>
            <button
              type="button"
              onClick={() => void onTogglePaused()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs uppercase tracking-[0.22em] text-slate-200 transition hover:border-[#BC13FE]/35 hover:text-white"
            >
              {snapshot.paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => void onPurgeFinished()}
              className="rounded-full border border-[#BC13FE]/35 bg-[#BC13FE]/12 px-3 py-2 font-mono text-xs uppercase tracking-[0.22em] text-[#F5D0FE] transition hover:bg-[#BC13FE]/18"
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
