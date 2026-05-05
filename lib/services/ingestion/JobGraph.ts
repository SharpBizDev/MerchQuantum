"use client";

import { getOpfsStagingBridge, type OpfsStagingState, type OpfsStageResult, type OpfsStagingMode } from "./OpfsStaging";

export type JobGraphState = "QUEUED" | "HYDRATING" | "SNIFFING" | "REFINING" | "FORGED" | "FAILED";
export type JobGraphKind = "file" | "url";

export type JobGraphSniffResult = {
  mimeType: string;
  headerAudit: string[];
  magicSignature: string | null;
  openGraph: Record<string, string>;
  jsonLd: Array<Record<string, unknown>>;
  canonicalUrl: string | null;
  title: string | null;
  byteLength: number;
};

export type JobGraphJob = {
  id: string;
  kind: JobGraphKind;
  sourceLabel: string;
  status: JobGraphState;
  progress: number;
  createdAt: number;
  updatedAt: number;
  byteLength: number;
  scratchPath: string | null;
  mimeType: string;
  stagingMode: OpfsStagingMode;
  crossOriginIsolated: boolean;
  headerAudit: string[];
  magicSignature: string | null;
  openGraph: Record<string, string>;
  jsonLd: Array<Record<string, unknown>>;
  canonicalUrl: string | null;
  title: string | null;
  error: string | null;
  file?: File;
  url?: string;
};

export type JobGraphSnapshot = {
  jobs: JobGraphJob[];
  counts: Record<JobGraphState, number>;
  workerLimit: number;
  activeHydrationCount: number;
  pendingCount: number;
  queuePressure: number;
  batchPressure: boolean;
  eventSequence: number;
  staging: OpfsStagingState;
  pressureAmplitudeVector: number[];
  orbPulseIntensity: number;
  fallbackSignal: boolean;
};

type JobGraphListener = (snapshot: JobGraphSnapshot) => void;

const DEFAULT_WORKER_LIMIT = 4;
const MAX_WORKER_LIMIT = 6;
const URL_TEXT_SAMPLE_LIMIT = 8;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeWorkerLimit(workerLimit?: number) {
  if (!Number.isFinite(workerLimit)) return DEFAULT_WORKER_LIMIT;
  return Math.max(DEFAULT_WORKER_LIMIT, Math.min(MAX_WORKER_LIMIT, Math.round(workerLimit as number)));
}

function emptyCounts(): Record<JobGraphState, number> {
  return {
    QUEUED: 0,
    HYDRATING: 0,
    SNIFFING: 0,
    REFINING: 0,
    FORGED: 0,
    FAILED: 0,
  };
}

function normalizeUrlCandidates(urlText: string) {
  return urlText
    .split(/[\r\n\s]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => /^https?:\/\//i.test(entry));
}

function inferMimeTypeFromMagicBytes(headBytes: Uint8Array) {
  const bytes = Array.from(headBytes.slice(0, 16));
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes[0] === 0x44 && bytes[1] === 0x49 && bytes[2] === 0x43 && bytes[3] === 0x4d) {
    return "application/dicom";
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "video/mp4";
  }
  const ascii = String.fromCharCode(...bytes).toUpperCase();
  if (ascii.includes("ISO-10303-21")) {
    return "model/step";
  }
  return null;
}

function extractOpenGraphMetadata(textSample: string) {
  const openGraph: Record<string, string> = {};
  const metaRegex = /<meta\s+[^>]*(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null = metaRegex.exec(textSample);
  while (match) {
    const key = String(match[1] ?? "").trim().toLowerCase();
    const value = String(match[2] ?? "").trim();
    if (key.startsWith("og:") || key.startsWith("twitter:")) {
      openGraph[key] = value;
    }
    match = metaRegex.exec(textSample);
  }
  return openGraph;
}

function extractJsonLd(textSample: string) {
  const matches = [...textSample.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return matches
    .slice(0, URL_TEXT_SAMPLE_LIMIT)
    .flatMap((match) => {
      try {
        const parsed = JSON.parse(match[1] ?? "null");
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    })
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
}

function extractDocumentTitle(textSample: string) {
  const titleMatch = textSample.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1]?.trim() ?? null;
}

function buildPressureAmplitudeVector(snapshot: Pick<JobGraphSnapshot, "activeHydrationCount" | "pendingCount" | "counts" | "workerLimit">) {
  const activeIntensity = clamp(snapshot.activeHydrationCount / Math.max(1, snapshot.workerLimit));
  const queueIntensity = clamp(snapshot.pendingCount / 50);
  const sniffingIntensity = clamp(snapshot.counts.SNIFFING / Math.max(1, snapshot.workerLimit));

  return Array.from({ length: 32 }, (_, index) => {
    const centerDistance = Math.abs(index - 15.5) / 15.5;
    const ridge = 1 - clamp(centerDistance);
    const lanePulse = (index % 4) / 6;
    return clamp(activeIntensity * (0.28 + ridge * 0.62) + queueIntensity * (0.12 + lanePulse) + sniffingIntensity * 0.18);
  });
}

function buildSnapshot(
  jobs: Map<string, JobGraphJob>,
  order: string[],
  workerLimit: number,
  activeHydrationCount: number,
  eventSequence: number,
  staging: OpfsStagingState
): JobGraphSnapshot {
  const counts = emptyCounts();
  const serializedJobs = order.map((jobId) => jobs.get(jobId)).filter((job): job is JobGraphJob => Boolean(job));

  for (const job of serializedJobs) {
    counts[job.status] += 1;
  }

  const pendingCount = counts.QUEUED + counts.HYDRATING + counts.SNIFFING + counts.REFINING;
  const queuePressure = clamp(pendingCount / 50);
  const batchPressure = pendingCount > 10;
  const pressureAmplitudeVector = buildPressureAmplitudeVector({
    activeHydrationCount,
    pendingCount,
    counts,
    workerLimit,
  });

  return {
    jobs: serializedJobs,
    counts,
    workerLimit,
    activeHydrationCount,
    pendingCount,
    queuePressure,
    batchPressure,
    eventSequence,
    staging,
    pressureAmplitudeVector,
    orbPulseIntensity: clamp(0.18 + queuePressure * 0.32 + (batchPressure ? 0.34 : 0) + clamp(activeHydrationCount / Math.max(1, workerLimit)) * 0.16),
    fallbackSignal: !staging.available,
  };
}

export class UniversalJobGraph {
  private readonly jobs = new Map<string, JobGraphJob>();
  private readonly order: string[] = [];
  private readonly queuedJobIds: string[] = [];
  private readonly listeners = new Set<JobGraphListener>();
  private readonly stagingBridge = getOpfsStagingBridge();
  private readonly activeHydrations = new Set<string>();
  private workerLimit = DEFAULT_WORKER_LIMIT;
  private eventSequence = 0;
  private snapshot = buildSnapshot(this.jobs, this.order, this.workerLimit, 0, this.eventSequence, this.stagingBridge.getState());

  subscribe(listener: JobGraphListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  configure(options: { workerLimit?: number } = {}) {
    this.workerLimit = normalizeWorkerLimit(options.workerLimit);
    this.publish();
  }

  enqueueFiles(files: Iterable<File>) {
    const createdJobs: JobGraphJob[] = [];

    for (const file of files) {
      const job = this.createJob({
        kind: "file",
        sourceLabel: file.name,
        mimeType: file.type || "application/octet-stream",
        file,
      });
      createdJobs.push(job);
    }

    this.drainQueue();
    return createdJobs;
  }

  enqueueUrls(urls: Iterable<string>) {
    const createdJobs: JobGraphJob[] = [];

    for (const url of urls) {
      const normalized = String(url).trim();
      if (!normalized) continue;
      const job = this.createJob({
        kind: "url",
        sourceLabel: normalized,
        mimeType: "text/html",
        url: normalized,
      });
      createdJobs.push(job);
    }

    this.drainQueue();
    return createdJobs;
  }

  enqueueMixedPayload(payload: { files?: Iterable<File>; urls?: Iterable<string>; text?: string }) {
    const createdJobs = [
      ...(payload.files ? this.enqueueFiles(payload.files) : []),
      ...(payload.urls ? this.enqueueUrls(payload.urls) : []),
      ...(payload.text ? this.enqueueUrls(normalizeUrlCandidates(payload.text)) : []),
    ];

    return createdJobs;
  }

  private createJob(input: Pick<JobGraphJob, "kind" | "sourceLabel" | "mimeType"> & Partial<Pick<JobGraphJob, "file" | "url">>) {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const stagingState = this.stagingBridge.getState();

    const job: JobGraphJob = {
      id,
      kind: input.kind,
      sourceLabel: input.sourceLabel,
      status: "QUEUED",
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      byteLength: 0,
      scratchPath: null,
      mimeType: input.mimeType,
      stagingMode: stagingState.preferredMode,
      crossOriginIsolated: stagingState.crossOriginIsolated,
      headerAudit: [],
      magicSignature: null,
      openGraph: {},
      jsonLd: [],
      canonicalUrl: input.url ?? null,
      title: null,
      error: null,
      file: input.file,
      url: input.url,
    };

    this.jobs.set(job.id, job);
    this.order.unshift(job.id);
    this.queuedJobIds.push(job.id);
    this.publish();
    return job;
  }

  private updateJob(jobId: string, updater: (job: JobGraphJob) => JobGraphJob) {
    const existing = this.jobs.get(jobId);
    if (!existing) return null;
    const next = updater(existing);
    this.jobs.set(jobId, next);
    this.publish();
    return next;
  }

  private publish() {
    this.eventSequence += 1;
    this.snapshot = buildSnapshot(
      this.jobs,
      this.order,
      this.workerLimit,
      this.activeHydrations.size,
      this.eventSequence,
      this.stagingBridge.getState()
    );
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private drainQueue() {
    while (this.activeHydrations.size < this.workerLimit && this.queuedJobIds.length > 0) {
      const nextJobId = this.queuedJobIds.shift();
      if (!nextJobId) break;
      const nextJob = this.jobs.get(nextJobId);
      if (!nextJob || nextJob.status !== "QUEUED") continue;
      void this.processJob(nextJobId);
    }
  }

  private async processJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    this.activeHydrations.add(jobId);
    this.updateJob(jobId, (current) => ({
      ...current,
      status: "HYDRATING",
      progress: 0.08,
      updatedAt: Date.now(),
      error: null,
    }));

    try {
      const stageResult = job.kind === "file" && job.file
        ? await this.stagingBridge.stageFile(job.file, `${job.id}-${job.sourceLabel}`, (progress) => {
            this.updateJob(jobId, (current) => ({
              ...current,
              byteLength: progress.byteLength,
              progress: clamp(progress.byteLength / Math.max(progress.totalBytes ?? progress.byteLength, 1), 0.08, 0.7),
              updatedAt: Date.now(),
            }));
          })
        : await this.stagingBridge.stageUrl(job.url ?? job.sourceLabel, `${job.id}-remote`, (progress) => {
            this.updateJob(jobId, (current) => ({
              ...current,
              byteLength: progress.byteLength,
              progress: clamp(0.1 + progress.byteLength / Math.max(progress.totalBytes ?? progress.byteLength, 1) * 0.6),
              updatedAt: Date.now(),
            }));
          });

      this.updateJob(jobId, (current) => ({
        ...current,
        status: "SNIFFING",
        progress: 0.76,
        byteLength: stageResult.byteLength,
        scratchPath: stageResult.scratchPath,
        mimeType: stageResult.contentType || current.mimeType,
        stagingMode: stageResult.mode,
        crossOriginIsolated: stageResult.crossOriginIsolated,
        updatedAt: Date.now(),
      }));

      const sniffResult = this.sniffStage(job, stageResult);

      this.updateJob(jobId, (current) => ({
        ...current,
        status: "REFINING",
        progress: 0.9,
        mimeType: sniffResult.mimeType,
        headerAudit: sniffResult.headerAudit,
        magicSignature: sniffResult.magicSignature,
        openGraph: sniffResult.openGraph,
        jsonLd: sniffResult.jsonLd,
        canonicalUrl: sniffResult.canonicalUrl,
        title: sniffResult.title,
        updatedAt: Date.now(),
      }));

      this.updateJob(jobId, (current) => ({
        ...current,
        status: "FORGED",
        progress: 1,
        byteLength: sniffResult.byteLength,
        updatedAt: Date.now(),
      }));
    } catch (error) {
      this.updateJob(jobId, (current) => ({
        ...current,
        status: "FAILED",
        progress: 1,
        error: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      }));
    } finally {
      this.activeHydrations.delete(jobId);
      this.publish();
      this.drainQueue();
    }
  }

  private sniffStage(job: JobGraphJob, stageResult: OpfsStageResult): JobGraphSniffResult {
    const headerAudit = [
      `mime:${stageResult.contentType || job.mimeType || "application/octet-stream"}`,
      `mode:${stageResult.mode}`,
      `isolated:${stageResult.crossOriginIsolated ? "yes" : "no"}`,
    ];
    const magicMime = inferMimeTypeFromMagicBytes(stageResult.headBytes);
    if (magicMime) {
      headerAudit.push(`magic:${magicMime}`);
    }

    const openGraph = stageResult.textSample ? extractOpenGraphMetadata(stageResult.textSample) : {};
    const jsonLd = stageResult.textSample ? extractJsonLd(stageResult.textSample) : [];
    const title = stageResult.textSample
      ? openGraph["og:title"] ?? openGraph["twitter:title"] ?? extractDocumentTitle(stageResult.textSample)
      : null;
    const canonicalUrlMatch = stageResult.textSample?.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);

    return {
      mimeType: magicMime ?? (stageResult.contentType || job.mimeType),
      headerAudit,
      magicSignature: magicMime,
      openGraph,
      jsonLd,
      canonicalUrl: canonicalUrlMatch?.[1] ?? job.url ?? null,
      title,
      byteLength: stageResult.byteLength,
    };
  }
}

let universalJobGraphSingleton: UniversalJobGraph | null = null;

export function getUniversalJobGraph() {
  if (!universalJobGraphSingleton) {
    universalJobGraphSingleton = new UniversalJobGraph();
  }

  return universalJobGraphSingleton;
}



