"use client";

export type OpfsStagingMode = "sync-worker" | "async-opfs" | "unavailable";

export type OpfsStageResult = {
  scratchPath: string;
  byteLength: number;
  contentType: string;
  mode: OpfsStagingMode;
  crossOriginIsolated: boolean;
  headBytes: Uint8Array;
  textSample: string;
  stagedAt: number;
};

export type OpfsStagingState = {
  available: boolean;
  crossOriginIsolated: boolean;
  preferredMode: OpfsStagingMode;
  reason: string | null;
};

type StageProgress = {
  byteLength: number;
  totalBytes: number | null;
};

type WorkerStageMessage =
  | {
      type: "stage-file";
      requestId: string;
      scratchPath: string;
      file: File;
    }
  | {
      type: "stage-url";
      requestId: string;
      scratchPath: string;
      url: string;
    };

type WorkerProgressMessage = {
  type: "progress";
  requestId: string;
  byteLength: number;
  totalBytes: number | null;
};

type WorkerSuccessMessage = {
  type: "success";
  requestId: string;
  result: {
    scratchPath: string;
    byteLength: number;
    contentType: string;
    headBytes: number[];
    textSample: string;
  };
};

type WorkerErrorMessage = {
  type: "error";
  requestId: string;
  error: string;
};

type WorkerResponseMessage = WorkerProgressMessage | WorkerSuccessMessage | WorkerErrorMessage;

type PendingWorkerRequest = {
  resolve: (value: OpfsStageResult) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: StageProgress) => void;
};

const HEAD_SAMPLE_BYTES = 4096;
const TEXT_SAMPLE_BYTES = 65536;

function canUseDomApis() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function sanitizeScratchPath(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 96) || "scratch";
}

function isTextLikeContentType(contentType: string) {
  return contentType.startsWith("text/")
    || contentType.includes("json")
    || contentType.includes("xml")
    || contentType.includes("javascript")
    || contentType.includes("svg");
}

function getReadableStreamReaderFromFile(file: File) {
  return file.stream().getReader();
}

function toWritableChunk(value: Uint8Array) {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return new Uint8Array(buffer);
}

async function createAsyncWritable(path: string) {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(path, { create: true });
  return fileHandle.createWritable();
}

async function stageReadableStream(
  path: string,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  contentType: string,
  onProgress?: (progress: StageProgress) => void
): Promise<OpfsStageResult> {
  const writable = await createAsyncWritable(path);
  const headBytes: number[] = [];
  const textDecoder = isTextLikeContentType(contentType) ? new TextDecoder() : null;
  const textChunks: string[] = [];
  let byteLength = 0;
  let textLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      await writable.write(toWritableChunk(value));
      byteLength += value.byteLength;

      if (headBytes.length < HEAD_SAMPLE_BYTES) {
        const sliceLength = Math.min(value.byteLength, HEAD_SAMPLE_BYTES - headBytes.length);
        for (let index = 0; index < sliceLength; index += 1) {
          headBytes.push(value[index] ?? 0);
        }
      }

      if (textDecoder && textLength < TEXT_SAMPLE_BYTES) {
        const decoded = textDecoder.decode(value, { stream: true });
        textChunks.push(decoded);
        textLength += decoded.length;
      }

      onProgress?.({ byteLength, totalBytes: null });
    }
  } finally {
    await writable.close();
    reader.releaseLock();
  }

  return {
    scratchPath: path,
    byteLength,
    contentType,
    mode: "async-opfs",
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    headBytes: Uint8Array.from(headBytes),
    textSample: textChunks.join("").slice(0, TEXT_SAMPLE_BYTES),
    stagedAt: Date.now(),
  };
}

function createWorkerScript() {
  return `
    const HEAD_SAMPLE_BYTES = ${HEAD_SAMPLE_BYTES};
    const TEXT_SAMPLE_BYTES = ${TEXT_SAMPLE_BYTES};

    function isTextLikeContentType(contentType) {
      return contentType.startsWith("text/")
        || contentType.includes("json")
        || contentType.includes("xml")
        || contentType.includes("javascript")
        || contentType.includes("svg");
    }

    async function stageReadable(path, reader, contentType, totalBytes, requestId) {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(path, { create: true });
      const accessHandle = await fileHandle.createSyncAccessHandle();
      const headBytes = [];
      const textChunks = [];
      const textDecoder = isTextLikeContentType(contentType) ? new TextDecoder() : null;
      let textLength = 0;
      let offset = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          accessHandle.write(value, { at: offset });
          offset += value.byteLength;

          if (headBytes.length < HEAD_SAMPLE_BYTES) {
            const sliceLength = Math.min(value.byteLength, HEAD_SAMPLE_BYTES - headBytes.length);
            for (let index = 0; index < sliceLength; index += 1) {
              headBytes.push(value[index] ?? 0);
            }
          }

          if (textDecoder && textLength < TEXT_SAMPLE_BYTES) {
            const decoded = textDecoder.decode(value, { stream: true });
            textChunks.push(decoded);
            textLength += decoded.length;
          }

          self.postMessage({
            type: "progress",
            requestId,
            byteLength: offset,
            totalBytes: totalBytes ?? null,
          });
        }
      } finally {
        accessHandle.flush();
        accessHandle.close();
        reader.releaseLock();
      }

      return {
        scratchPath: path,
        byteLength: offset,
        contentType,
        headBytes,
        textSample: textChunks.join("").slice(0, TEXT_SAMPLE_BYTES),
      };
    }

    self.onmessage = async (event) => {
      const data = event.data;
      try {
        if (data.type === "stage-file") {
          const file = data.file;
          const result = await stageReadable(
            data.scratchPath,
            file.stream().getReader(),
            file.type || "application/octet-stream",
            typeof file.size === "number" ? file.size : null,
            data.requestId,
          );

          self.postMessage({ type: "success", requestId: data.requestId, result });
          return;
        }

        if (data.type === "stage-url") {
          const response = await fetch(data.url);
          if (!response.ok) {
            throw new Error("Hydration fetch failed with status " + response.status + ".");
          }

          if (!response.body) {
            throw new Error("Hydration response did not include a readable body.");
          }

          const result = await stageReadable(
            data.scratchPath,
            response.body.getReader(),
            response.headers.get("content-type") || "application/octet-stream",
            null,
            data.requestId,
          );

          self.postMessage({ type: "success", requestId: data.requestId, result });
        }
      } catch (error) {
        self.postMessage({
          type: "error",
          requestId: data.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
  `;
}

export class OpfsStagingBridge {
  private pendingWorkerRequests = new Map<string, PendingWorkerRequest>();
  private workerPromise: Promise<Worker> | null = null;

  getState(): OpfsStagingState {
    if (!canUseDomApis() || !("storage" in navigator) || typeof navigator.storage.getDirectory !== "function") {
      return {
        available: false,
        crossOriginIsolated: false,
        preferredMode: "unavailable",
        reason: "Origin Private File System is unavailable in this browser surface.",
      };
    }

    if (globalThis.crossOriginIsolated !== true) {
      return {
        available: true,
        crossOriginIsolated: false,
        preferredMode: "async-opfs",
        reason: "Cross-origin isolation is disabled; falling back to async OPFS staging.",
      };
    }

    return {
      available: true,
      crossOriginIsolated: true,
      preferredMode: "sync-worker",
      reason: null,
    };
  }

  async stageFile(file: File, scratchKey: string, onProgress?: (progress: StageProgress) => void) {
    const state = this.getState();
    const scratchPath = `${sanitizeScratchPath(scratchKey)}.bin`;

    if (!state.available) {
      throw new Error(state.reason ?? "OPFS staging is unavailable.");
    }

    if (state.preferredMode === "sync-worker") {
      return this.stageWithWorker(
        {
          type: "stage-file",
          requestId: crypto.randomUUID(),
          file,
          scratchPath,
        },
        onProgress
      );
    }

    return stageReadableStream(scratchPath, getReadableStreamReaderFromFile(file), file.type || "application/octet-stream", onProgress);
  }

  async stageUrl(url: string, scratchKey: string, onProgress?: (progress: StageProgress) => void) {
    const state = this.getState();
    const scratchPath = `${sanitizeScratchPath(scratchKey)}.fetch`;

    if (!state.available) {
      throw new Error(state.reason ?? "OPFS staging is unavailable.");
    }

    if (state.preferredMode === "sync-worker") {
      return this.stageWithWorker(
        {
          type: "stage-url",
          requestId: crypto.randomUUID(),
          url,
          scratchPath,
        },
        onProgress
      );
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Hydration fetch failed with status ${response.status}.`);
    }
    if (!response.body) {
      throw new Error("Hydration response did not include a readable body.");
    }

    return stageReadableStream(
      scratchPath,
      response.body.getReader(),
      response.headers.get("content-type") || "application/octet-stream",
      onProgress
    );
  }

  private async getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = Promise.resolve().then(() => {
        const blob = new Blob([createWorkerScript()], { type: "text/javascript" });
        const worker = new Worker(URL.createObjectURL(blob));

        worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
          const message = event.data;
          const pending = this.pendingWorkerRequests.get(message.requestId);
          if (!pending) return;

          if (message.type === "progress") {
            pending.onProgress?.({
              byteLength: message.byteLength,
              totalBytes: message.totalBytes,
            });
            return;
          }

          this.pendingWorkerRequests.delete(message.requestId);

          if (message.type === "error") {
            pending.reject(new Error(message.error));
            return;
          }

          pending.resolve({
            scratchPath: message.result.scratchPath,
            byteLength: message.result.byteLength,
            contentType: message.result.contentType,
            mode: "sync-worker",
            crossOriginIsolated: true,
            headBytes: Uint8Array.from(message.result.headBytes),
            textSample: message.result.textSample,
            stagedAt: Date.now(),
          });
        };

        return worker;
      });
    }

    return this.workerPromise;
  }

  private async stageWithWorker(message: WorkerStageMessage, onProgress?: (progress: StageProgress) => void) {
    const worker = await this.getWorker();

    return new Promise<OpfsStageResult>((resolve, reject) => {
      this.pendingWorkerRequests.set(message.requestId, {
        resolve,
        reject,
        onProgress,
      });

      worker.postMessage(message);
    });
  }
}

let opfsStagingBridgeSingleton: OpfsStagingBridge | null = null;

export function getOpfsStagingBridge() {
  if (!opfsStagingBridgeSingleton) {
    opfsStagingBridgeSingleton = new OpfsStagingBridge();
  }

  return opfsStagingBridgeSingleton;
}


