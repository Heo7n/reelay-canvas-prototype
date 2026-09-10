import { createHash } from "node:crypto";

import { ObjectKeyConflictError } from "../application/ObjectStore";
import type {
  CreateSignedObjectUploadInput,
  GetObjectOptions,
  ObjectStore,
  PutObjectInput,
  SignedObjectDownload,
  SignedObjectUpload,
  StoredObject,
  StoredObjectMetadata,
} from "../application/ObjectStore";

export interface SupabaseObjectStoreOptions {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  fetch?: typeof globalThis.fetch;
}

interface ObjectInfo {
  metadata: StoredObjectMetadata;
  storageEtag: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function checksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function normalizeObjectKey(value: string): string {
  const key = value.trim();
  if (!key || /[\\\u0000-\u001f\u007f]/.test(key)
    || key.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Object key is invalid.");
  }
  return key;
}

function isServiceRoleKey(value: string): boolean {
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    // This only rejects accidental anon configuration; Supabase verifies the JWT.
    return record(JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"))).role
      === "service_role";
  } catch {
    return false;
  }
}

function storageError(status?: number): Error {
  // Never retain provider bodies, request URLs, headers, or original errors:
  // fetch failures and gateway diagnostics can contain server credentials.
  return new Error(`Supabase object storage request failed${status ? ` (HTTP ${status})` : ""}.`);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw storageError(response.status);
  }
}

async function errorKind(response: Response): Promise<"missing" | "duplicate" | "other"> {
  const body = record(await response.json().catch(() => null));
  if ([400, 404].includes(response.status)
    && (body.code === "NoSuchKey" || body.error === "not_found")) return "missing";
  if ([400, 409].includes(response.status)
    && (body.code === "KeyAlreadyExists" || body.code === "ResourceAlreadyExists"
      || body.error === "Duplicate")) return "duplicate";
  return "other";
}

/** Server-only, immutable objects in an existing private Supabase bucket. */
export class SupabaseObjectStore implements ObjectStore {
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly headers: Record<string, string>;
  private readonly fetcher: typeof globalThis.fetch;
  private privateBucketCheck?: Promise<void>;

  constructor(options: SupabaseObjectStoreOptions) {
    let url: URL;
    try {
      url = new URL(options.url.trim());
    } catch {
      throw new Error("Supabase storage URL is invalid.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/") throw new Error("Supabase storage URL must be an HTTPS origin.");
    const key = options.serviceRoleKey.trim();
    if (!isServiceRoleKey(key)) throw new Error("Supabase storage requires a server secret key.");
    this.bucket = options.bucket.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(this.bucket)) {
      throw new Error("Supabase storage bucket is invalid.");
    }
    this.baseUrl = `${url.origin}/storage/v1`;
    this.headers = { apikey: key };
    // Modern secret keys use apikey only; legacy service_role JWTs also use Bearer.
    if (!key.startsWith("sb_secret_")) this.headers.Authorization = `Bearer ${key}`;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async putObject(input: PutObjectInput): Promise<StoredObjectMetadata> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const contentType = input.contentType.trim();
    if (!contentType || /[\r\n]/.test(contentType)) throw new Error("Object content type is invalid.");
    if (input.body.byteLength <= 0) throw new Error("Object body must not be empty.");
    const body = Uint8Array.from(input.body);
    const digest = checksum(body);
    const metadata = { objectKey, contentType, byteSize: body.byteLength, checksumSha256: digest, etag: digest };
    await this.assertPrivateBucket();
    // The bytes and custom metadata are published by one Storage operation.
    // No upsert or process-local metadata cache can overwrite a concurrent winner.
    const response = await this.request(`/object/${this.objectPath(objectKey)}`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        "cache-control": "max-age=3600",
        "x-upsert": "false",
        "x-metadata": Buffer.from(JSON.stringify({ reelayObjectStore: 1, checksumSha256: digest })).toString("base64"),
      },
      body,
    });
    if (response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return metadata;
    }
    if (await errorKind(response) === "duplicate") {
      const existing = await this.getObject(objectKey);
      if (existing && existing.contentType === contentType && existing.checksumSha256 === digest
        && existing.body.byteLength === body.byteLength
        && existing.body.every((value, index) => value === body[index])) {
        const { body: _body, ...storedMetadata } = existing;
        return storedMetadata;
      }
      throw new ObjectKeyConflictError();
    }
    throw storageError(response.status);
  }

  async headObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    return (await this.info(normalizeObjectKey(objectKey)))?.metadata ?? null;
  }

  async getObject(objectKey: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const key = normalizeObjectKey(objectKey);
    const info = await this.info(key);
    if (!info) return null;
    const { metadata, storageEtag } = info;
    const range = options.range;
    if (range && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start < 0 || range.end < range.start || range.end >= metadata.byteSize)) {
      throw new RangeError("Object byte range is invalid.");
    }
    const headers: Record<string, string> = { "if-match": storageEtag };
    if (range) headers.range = `bytes=${range.start}-${range.end}`;
    const response = await this.request(`/object/authenticated/${this.objectPath(key)}`, { headers });
    if (!response.ok) {
      if (await errorKind(response) === "missing") return null;
      throw storageError(response.status);
    }
    const expectedLength = range ? range.end - range.start + 1 : metadata.byteSize;
    if (response.headers.get("etag") !== storageEtag
      || (range ? response.status !== 206
        || response.headers.get("content-range") !== `bytes ${range.start}-${range.end}/${metadata.byteSize}`
        : response.status !== 200)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Stored object response failed integrity validation.");
    }
    let body: Uint8Array;
    try {
      body = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw storageError();
    }
    if (body.byteLength !== expectedLength
      || (expectedLength === metadata.byteSize && checksum(body) !== metadata.checksumSha256)) {
      throw new Error("Stored object response failed integrity validation.");
    }
    return { ...metadata, body };
  }

  async deleteObject(objectKey: string): Promise<boolean> {
    const key = normalizeObjectKey(objectKey);
    await this.assertPrivateBucket();
    const response = await this.request(`/object/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!response.ok) throw storageError(response.status);
    const deleted = await readJson(response);
    if (!Array.isArray(deleted)) throw storageError(response.status);
    return deleted.some((entry) => record(entry).name === key);
  }

  async createSignedDownload(objectKey: string, expiresInSeconds: number): Promise<SignedObjectDownload | null> {
    const key = normalizeObjectKey(objectKey);
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 300) {
      throw new RangeError("Object download expiry must be between 1 and 300 seconds.");
    }
    const info = await this.info(key);
    if (!info) return null;
    const path = `/object/sign/${this.objectPath(key)}`;
    const response = await this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!response.ok) {
      if (await errorKind(response) === "missing") return null;
      throw storageError(response.status);
    }
    const data = record(await readJson(response));
    // Supabase returns a storage-relative path. Pin it to the exact requested
    // private object so a malformed provider response cannot become a redirect.
    if (typeof data.signedURL !== "string" || !data.signedURL.startsWith(`${path}?`)) {
      throw storageError(response.status);
    }
    const url = new URL(`${this.baseUrl}${data.signedURL}`);
    if (url.pathname !== `/storage/v1${path}` || !url.searchParams.get("token") || url.hash) {
      throw storageError(response.status);
    }
    return { ...info.metadata, url: url.toString() };
  }

  async createSignedUpload(input: CreateSignedObjectUploadInput): Promise<SignedObjectUpload> {
    const key = normalizeObjectKey(input.objectKey);
    const contentType = input.contentType.trim();
    if (!contentType || /[\r\n]/.test(contentType) || !/^[0-9a-f]{64}$/.test(input.checksumSha256)) {
      throw new Error("Object upload metadata is invalid.");
    }
    await this.assertPrivateBucket();
    const path = `/object/upload/sign/${this.objectPath(key)}`;
    const response = await this.request(path, { method: "POST", headers: { "x-upsert": "false" } });
    if (!response.ok) throw storageError(response.status);
    const data = record(await readJson(response));
    if (typeof data.url !== "string" || !data.url.startsWith(`${path}?`)) throw storageError(response.status);
    const url = new URL(`${this.baseUrl}${data.url}`);
    if (url.pathname !== `/storage/v1${path}` || !url.searchParams.get("token") || url.hash) {
      throw storageError(response.status);
    }
    return {
      url: url.toString(), method: "PUT",
      headers: {
        "Content-Type": contentType,
        "cache-control": "max-age=3600",
        "x-upsert": "false",
        "x-metadata": Buffer.from(JSON.stringify({ reelayObjectStore: 1, checksumSha256: input.checksumSha256 })).toString("base64"),
      },
    };
  }

  private async info(key: string): Promise<ObjectInfo | null> {
    await this.assertPrivateBucket();
    const response = await this.request(`/object/info/authenticated/${this.objectPath(key)}`);
    if (!response.ok) {
      if (await errorKind(response) === "missing") return null;
      throw storageError(response.status);
    }
    const data = record(await readJson(response));
    const custom = record(data.metadata);
    if (data.name !== key || data.bucket_id !== this.bucket
      || typeof data.size !== "number" || !Number.isSafeInteger(data.size) || data.size <= 0
      || typeof data.content_type !== "string" || !data.content_type.trim()
      || typeof data.etag !== "string" || !data.etag
      || custom.reelayObjectStore !== 1 || typeof custom.checksumSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(custom.checksumSha256)) {
      throw new Error("Stored object metadata failed integrity validation.");
    }
    return {
      metadata: {
        objectKey: key,
        byteSize: data.size,
        contentType: data.content_type,
        checksumSha256: custom.checksumSha256,
        etag: custom.checksumSha256,
      },
      storageEtag: data.etag,
    };
  }

  private async assertPrivateBucket(): Promise<void> {
    if (!this.privateBucketCheck) {
      this.privateBucketCheck = (async () => {
        const response = await this.request(`/bucket/${encodeURIComponent(this.bucket)}`);
        if (!response.ok) throw storageError(response.status);
        const bucket = record(await readJson(response));
        if (bucket.id !== this.bucket || bucket.public !== false) {
          throw new Error("Supabase object storage requires an existing private bucket.");
        }
      })().catch((error: unknown) => {
        this.privateBucketCheck = undefined;
        throw error;
      });
    }
    await this.privateBucketCheck;
  }

  private objectPath(key: string): string {
    return `${encodeURIComponent(this.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers, ...init.headers },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw storageError();
    }
  }
}
