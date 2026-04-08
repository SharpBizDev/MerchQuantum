import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

import { ProviderError } from "./errors";
import type { HostedArtworkReference, ProviderId } from "./types";

const DEFAULT_HOSTED_ARTWORK_TTL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_STORAGE_DIR = process.env.MQ_HOSTED_ARTWORK_DIR?.trim() || "";
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";

type PublishHostedArtworkOptions = {
  providerId: ProviderId;
  fileName: string;
  imageDataUrl: string;
  publicBaseUrl: string;
  storageDir?: string;
  ttlMs?: number;
  now?: Date;
};

type StoredHostedArtworkRecord = Omit<HostedArtworkReference, "publicUrl">;

export type StoredHostedArtwork = HostedArtworkReference & {
  buffer: Buffer;
};

function getMetadataPath(storageDir: string, assetId: string) {
  return path.join(storageDir, `${assetId}.json`);
}

function getBinaryPath(storageDir: string, assetId: string) {
  return path.join(storageDir, `${assetId}.bin`);
}

function sanitizeFileName(fileName: string) {
  const trimmed = path.basename(fileName).trim();
  return trimmed || "artwork";
}

function decodeDataUrl(imageDataUrl: string) {
  const match = imageDataUrl.trim().match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    contentType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

function buildPublicUrl(assetId: string, publicBaseUrl: string) {
  return new URL(`/api/providers/artwork/${encodeURIComponent(assetId)}`, publicBaseUrl).toString();
}

function toHostedArtworkReference(record: StoredHostedArtworkRecord, publicBaseUrl: string): HostedArtworkReference {
  return {
    ...record,
    publicUrl: buildPublicUrl(record.id, publicBaseUrl),
  };
}

async function ensureStorageDir(storageDir: string) {
  await fs.mkdir(storageDir, { recursive: true });
}

async function removeStoredArtwork(assetId: string, storageDir: string) {
  await Promise.allSettled([
    fs.rm(getMetadataPath(storageDir, assetId), { force: true }),
    fs.rm(getBinaryPath(storageDir, assetId), { force: true }),
  ]);
}

export async function publishHostedArtwork(options: PublishHostedArtworkOptions): Promise<HostedArtworkReference> {
  const decoded = decodeDataUrl(options.imageDataUrl);
  if (!decoded || !decoded.buffer.length) {
    throw new ProviderError({
      providerId: options.providerId,
      code: "validation_error",
      status: 400,
      message: "Image data is missing or not base64.",
    });
  }

  const storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
  const now = options.now || new Date();
  const ttlMs = options.ttlMs || DEFAULT_HOSTED_ARTWORK_TTL_MS;
  const assetId = crypto.randomUUID();
  const checksum = crypto.createHash("sha256").update(decoded.buffer).digest("hex");
  const record: StoredHostedArtworkRecord = {
    id: assetId,
    providerId: options.providerId,
    fileName: sanitizeFileName(options.fileName),
    contentType: decoded.contentType,
    byteLength: decoded.buffer.byteLength,
    checksum,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  if (BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`provider-artwork/${options.providerId}/${assetId}/${record.fileName}`, decoded.buffer, {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: Math.max(60, Math.floor(ttlMs / 1000)),
      contentType: decoded.contentType,
      token: BLOB_READ_WRITE_TOKEN,
    });

    return {
      ...record,
      publicUrl: blob.url,
    };
  }

  if (!storageDir) {
    throw new ProviderError({
      providerId: options.providerId,
      code: "upstream_error",
      status: 500,
      message: "Hosted artwork storage is not configured for this environment.",
    });
  }

  await ensureStorageDir(storageDir);
  await fs.writeFile(getBinaryPath(storageDir, assetId), decoded.buffer);
  await fs.writeFile(getMetadataPath(storageDir, assetId), JSON.stringify(record, null, 2), "utf8");

  return toHostedArtworkReference(record, options.publicBaseUrl);
}

export async function readHostedArtwork(
  assetId: string,
  options: {
    publicBaseUrl: string;
    storageDir?: string;
    now?: Date;
  }
): Promise<StoredHostedArtwork | null> {
  const storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
  const now = options.now || new Date();

  if (!storageDir) {
    return null;
  }

  try {
    const metadataText = await fs.readFile(getMetadataPath(storageDir, assetId), "utf8");
    const record = JSON.parse(metadataText) as StoredHostedArtworkRecord;

    if (new Date(record.expiresAt).getTime() <= now.getTime()) {
      await removeStoredArtwork(assetId, storageDir);
      return null;
    }

    const buffer = await fs.readFile(getBinaryPath(storageDir, assetId));

    return {
      ...toHostedArtworkReference(record, options.publicBaseUrl),
      buffer,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}
