import type { AiFieldStates, AiFieldStatus, Img, ItemStatus } from "../../../app/components/merch-quantum/types";

export const IMPORT_QUEUE_LIMIT = 50;

export type BatchAuthority = "local" | "provider" | "crdt";
export type BatchEventSource = "ui" | "provider" | "stream";

export type BatchSnapshot = {
  active: Img[];
  queued: Img[];
  archived: Img[];
  selectedId: string;
};

export type BatchPendingEvent = {
  eventId: string;
  authority: BatchAuthority;
  source: BatchEventSource;
  optimistic: boolean;
  createdAt: number;
  status: "pending" | "acknowledged" | "rejected";
  reason?: string;
};

export type BatchProjection = BatchSnapshot & {
  authority: BatchAuthority;
  streamCursor: string | null;
  lastEventId: string | null;
  pending: Record<string, BatchPendingEvent>;
};

export type BatchEvent =
  | {
      type: "snapshot.replace";
      snapshot: Partial<BatchSnapshot>;
      preserveSelection?: boolean;
      authority?: BatchAuthority;
    }
  | {
      type: "selection.set";
      selectedId: string;
    }
  | {
      type: "authority.set";
      authority: BatchAuthority;
    }
  | {
      type: "stream.cursor";
      cursor: string | null;
      authority?: BatchAuthority;
    }
  | {
      type: "event.ack";
      eventId: string;
      authority?: BatchAuthority;
    }
  | {
      type: "event.reject";
      eventId: string;
      reason?: string;
    };

export type BatchEventEnvelope = {
  eventId: string;
  source: BatchEventSource;
  optimistic: boolean;
  createdAt: number;
  event: BatchEvent;
};

export function createAiFieldStates(status: AiFieldStatus = "idle"): AiFieldStates {
  return {
    title: status,
    description: status,
    tags: status,
  };
}

export function createBatchSnapshot(snapshot?: Partial<BatchSnapshot>): BatchSnapshot {
  return {
    active: snapshot?.active ? [...snapshot.active] : [],
    queued: snapshot?.queued ? [...snapshot.queued] : [],
    archived: snapshot?.archived ? [...snapshot.archived] : [],
    selectedId: snapshot?.selectedId || "",
  };
}

export function createBatchProjection(snapshot?: Partial<BatchSnapshot>): BatchProjection {
  const base = createBatchSnapshot(snapshot);
  return {
    ...base,
    selectedId: resolveSelectedId(base.active, base.selectedId),
    authority: "local",
    streamCursor: null,
    lastEventId: null,
    pending: {},
  };
}

export function createBatchEvent(
  event: BatchEvent,
  options: {
    eventId?: string;
    source?: BatchEventSource;
    optimistic?: boolean;
    createdAt?: number;
  } = {}
): BatchEventEnvelope {
  return {
    eventId: options.eventId || buildBatchEventId(options.createdAt),
    source: options.source || "ui",
    optimistic: options.optimistic ?? false,
    createdAt: options.createdAt ?? Date.now(),
    event,
  };
}

export function reduceBatchProjection(current: BatchProjection, envelope: BatchEventEnvelope): BatchProjection {
  const next = cloneProjection(current);
  next.lastEventId = envelope.eventId;

  if (envelope.optimistic) {
    next.pending[envelope.eventId] = {
      eventId: envelope.eventId,
      authority: envelope.event.type === "authority.set"
        ? envelope.event.authority
        : current.authority,
      source: envelope.source,
      optimistic: true,
      createdAt: envelope.createdAt,
      status: "pending",
    };
  }

  switch (envelope.event.type) {
    case "snapshot.replace": {
      const replaced = applySnapshotPatch(next, envelope.event.snapshot, envelope.event.preserveSelection ?? false);
      if (envelope.event.authority) {
        replaced.authority = envelope.event.authority;
      }
      return replaced;
    }
    case "selection.set": {
      next.selectedId = resolveSelectedId(next.active, envelope.event.selectedId);
      return next;
    }
    case "authority.set": {
      next.authority = envelope.event.authority;
      return next;
    }
    case "stream.cursor": {
      next.streamCursor = envelope.event.cursor;
      if (envelope.event.authority) {
        next.authority = envelope.event.authority;
      }
      return next;
    }
    case "event.ack": {
      const pending = next.pending[envelope.event.eventId];
      if (pending) {
        next.pending[envelope.event.eventId] = {
          ...pending,
          status: "acknowledged",
        };
      }
      if (envelope.event.authority) {
        next.authority = envelope.event.authority;
      }
      return next;
    }
    case "event.reject": {
      const pending = next.pending[envelope.event.eventId];
      if (pending) {
        next.pending[envelope.event.eventId] = {
          ...pending,
          status: "rejected",
          reason: envelope.event.reason,
        };
      }
      return next;
    }
    default:
      return next;
  }
}

export function fillActiveBatch(active: Img[], queued: Img[], limit: number) {
  const room = Math.max(0, limit - active.length);
  if (room === 0 || queued.length === 0) {
    return { active, queued };
  }

  return {
    active: [...active, ...queued.slice(0, room)],
    queued: queued.slice(room),
  };
}

export function appendToActiveBatch(active: Img[], queued: Img[], incoming: Img[], limit: number) {
  const room = queued.length > 0 ? 0 : Math.max(0, limit - active.length);
  return {
    active: [...active, ...incoming.slice(0, room)],
    queued: [...queued, ...incoming.slice(room)],
  };
}

export function normalizeSelectionIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean))).slice(0, IMPORT_QUEUE_LIMIT);
}

export function selectionsMatch(a: string[], b: string[]) {
  const left = normalizeSelectionIds(a).slice().sort();
  const right = normalizeSelectionIds(b).slice().sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function getStatusSortValue(status: ItemStatus) {
  switch (status) {
    case "ready":
      return 0;
    case "error":
      return 1;
    default:
      return 2;
  }
}

export function getResolvedItemStatus(image: Img): ItemStatus {
  if (image.aiProcessing || image.status === "pending") {
    return "pending";
  }

  if (!image.aiDraft) {
    return image.status;
  }

  const hasCompleteVisibleOutput =
    !!image.final.trim() &&
    !!image.finalDescription.trim() &&
    image.tags.some((tag) => !!String(tag || "").trim());

  if (image.aiDraft.qcApproved === false) {
    return "error";
  }

  return image.aiDraft.publishReady === true && hasCompleteVisibleOutput ? "ready" : "error";
}

export function getPendingBatchEventCount(projection: BatchProjection) {
  return Object.values(projection.pending).filter((event) => event.status === "pending").length;
}

function applySnapshotPatch(
  projection: BatchProjection,
  snapshot: Partial<BatchSnapshot>,
  preserveSelection: boolean
) {
  const active = snapshot.active ? [...snapshot.active] : projection.active;
  const queued = snapshot.queued ? [...snapshot.queued] : projection.queued;
  const archived = snapshot.archived ? [...snapshot.archived] : projection.archived;
  const requestedSelectedId = snapshot.selectedId ?? (preserveSelection ? projection.selectedId : projection.selectedId);

  return {
    ...projection,
    active,
    queued,
    archived,
    selectedId: resolveSelectedId(active, requestedSelectedId),
  };
}

function resolveSelectedId(active: Img[], selectedId: string) {
  if (selectedId && active.some((img) => img.id === selectedId)) {
    return selectedId;
  }
  return active[0]?.id || "";
}

function cloneProjection(current: BatchProjection): BatchProjection {
  return {
    active: [...current.active],
    queued: [...current.queued],
    archived: [...current.archived],
    selectedId: current.selectedId,
    authority: current.authority,
    streamCursor: current.streamCursor,
    lastEventId: current.lastEventId,
    pending: { ...current.pending },
  };
}

function buildBatchEventId(createdAt = Date.now()) {
  return `batch_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
}
