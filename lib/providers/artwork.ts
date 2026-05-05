import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { HostedArtworkReference, ProviderId } from "./types";

type PublishHostedArtworkInput = {
  providerId: ProviderId;
  fileName: string;
  imageDataUrl: string;
  publicBaseUrl: string;
  storageDir?: string;
};

type ReadHostedArtworkOptions = {
  publicBaseUrl: string;
  storageDir?: string;
};

type StoredArtworkRecord = HostedArtworkReference & {
  storagePath: string;
};

type HostedArtworkPayload = {
  reference: StoredArtworkRecord;
  buffer: Buffer;
};

const DEFAULT_STORAGE_DIR = path.join(process.cwd(), ".tmp", "hosted-artwork");

function decodeDataUrl(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function resolveStorageDir(storageDir?: string) {
  return storageDir || DEFAULT_STORAGE_DIR;
}

function buildPublicUrl(publicBaseUrl: string, id: string) {
  return `${publicBaseUrl.replace(/\/$/, "")}/api/providers/artwork/${id}`;
}

async function ensureStorageDir(storageDir: string) {
  await fs.mkdir(storageDir, { recursive: true });
}

async function writeHostedArtwork(storageDir: string, payload: HostedArtworkPayload) {
  await ensureStorageDir(storageDir);
  await fs.writeFile(path.join(storageDir, `${payload.reference.id}.bin`), payload.buffer);
  await fs.writeFile(
    path.join(storageDir, `${payload.reference.id}.json`),
    JSON.stringify(payload.reference, null, 2),
    "utf8"
  );
}

export async function publishHostedArtwork(input: PublishHostedArtworkInput): Promise<HostedArtworkReference> {
  const { contentType, buffer } = decodeDataUrl(input.imageDataUrl);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const id = crypto.randomUUID();
  const storageDir = resolveStorageDir(input.storageDir);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const reference: StoredArtworkRecord = {
    id,
    providerId: input.providerId,
    fileName: input.fileName,
    contentType,
    byteLength: buffer.byteLength,
    checksum,
    publicUrl: buildPublicUrl(input.publicBaseUrl, id),
    createdAt: now.toISOString(),
    expiresAt,
    storagePath: path.join(storageDir, `${id}.bin`),
  };

  await writeHostedArtwork(storageDir, { reference, buffer });
  return reference;
}

export async function readHostedArtwork(id: string, options: ReadHostedArtworkOptions) {
  const storageDir = resolveStorageDir(options.storageDir);
  const metadataPath = path.join(storageDir, `${id}.json`);
  const binaryPath = path.join(storageDir, `${id}.bin`);

  try {
    const [metadataJson, buffer] = await Promise.all([
      fs.readFile(metadataPath, "utf8"),
      fs.readFile(binaryPath),
    ]);
    const reference = JSON.parse(metadataJson) as StoredArtworkRecord;
    return {
      ...reference,
      publicUrl: buildPublicUrl(options.publicBaseUrl, reference.id),
      buffer,
    };
  } catch {
    return null;
  }
}