import type { AiFieldStates, AiFieldStatus, Img, ItemStatus } from "../../../app/components/merch-quantum/types";

export const IMPORT_QUEUE_LIMIT = 50;

export function createAiFieldStates(status: AiFieldStatus = "idle"): AiFieldStates {
  return {
    title: status,
    description: status,
    tags: status,
  };
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