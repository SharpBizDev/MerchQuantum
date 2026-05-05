export type UserFacingErrorKind =
  | "connection"
  | "imageProcessing"
  | "listingGeneration"
  | "providerLoad"
  | "metadataSave"
  | "listingImport"
  | "listingPublish"
  | "draftCreate"
  | "order"
  | "general";

const USER_FACING_ERROR_MESSAGES: Record<UserFacingErrorKind, string> = {
  connection: "Connection failed. Please check your settings.",
  imageProcessing: "Image processing failed. Please try a different file.",
  listingGeneration: "An unexpected error occurred. Please try again.",
  providerLoad: "Unable to load your items. Please try again.",
  metadataSave: "Unable to save your changes. Please try again.",
  listingImport: "Unable to import your items. Please try again.",
  listingPublish: "Unable to publish your items. Please try again.",
  draftCreate: "Image processing failed. Please try a different file.",
  order: "An unexpected error occurred. Please try again.",
  general: "An unexpected error occurred. Please try again.",
};

export function getUserFacingErrorMessage(kind: UserFacingErrorKind) {
  return USER_FACING_ERROR_MESSAGES[kind];
}

export function getErrorStatus(error: unknown, fallbackStatus = 500) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return 504;
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }

  return fallbackStatus;
}

export function buildSanitizedErrorPayload(
  kind: UserFacingErrorKind,
  error: unknown,
  fallbackStatus = 500
) {
  return {
    status: getErrorStatus(error, fallbackStatus),
    message: getUserFacingErrorMessage(kind),
  };
}

export function logErrorToConsole(context: string, error: unknown) {
  console.error(context, error);
}
