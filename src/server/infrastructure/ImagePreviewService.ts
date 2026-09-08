import { createHash } from "node:crypto";

import sharp from "sharp";

import type { WorkspaceMediaAsset } from "../../domain/asset/workspace-media-asset";
import { ObjectKeyConflictError } from "../application/ObjectStore";
import type { ObjectStore, StoredObject, StoredObjectMetadata } from "../application/ObjectStore";

const PREVIEW_TRANSFORM = "v1:512x512:inside:without-enlargement:auto-orient:first-frame:webp-q76:strip-metadata";
const CANVAS_PREVIEW_TRANSFORM = "v1:512x512:inside:without-enlargement:auto-orient:static-only-v1:webp-q76:strip-metadata";
export type ImagePreviewVariant = "library" | "canvas";
export interface ImagePreviewServiceOptions {
  maxCacheBytes?: number;
  maxCacheEntries?: number;
  cacheIdleTtlMs?: number;
  now?: () => number;
}
interface CachedPreview {
  object: StoredObject;
  lastAccessedAt: number;
}
const MAX_INPUT_PIXELS = 64_000_000;
const PREVIEW_SIDE = 512;
const INPUT_FORMATS = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

export class ImagePreviewUnsupportedError extends Error {
  constructor() {
    super("The asset is not a supported, decodable image within the preview pixel limit.");
    this.name = "ImagePreviewUnsupportedError";
  }
}

export class ImagePreviewUnavailableError extends Error {
  constructor() {
    super("The image preview content is unavailable or failed integrity validation.");
    this.name = "ImagePreviewUnavailableError";
  }
}

function checksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function previewIdentity(asset: WorkspaceMediaAsset, variant: ImagePreviewVariant): string {
  if (asset.mediaKind !== "image" || !INPUT_FORMATS.has(asset.contentType)) {
    throw new ImagePreviewUnsupportedError();
  }
  if (!asset.objectKey || asset.objectKey !== asset.objectKey.trim()
    || /[\\\u0000-\u001f\u007f?:#]/.test(asset.objectKey)
    || asset.objectKey.split("/").some((segment) => !segment || segment === "." || segment === "..")
    || !/^[a-f0-9]{64}$/.test(asset.checksumSha256)
    || !Number.isSafeInteger(asset.byteSize) || asset.byteSize <= 0) {
    throw new ImagePreviewUnavailableError();
  }
  return createHash("sha256")
    .update(JSON.stringify([
      variant === "canvas" && asset.contentType !== "image/jpeg" ? CANVAS_PREVIEW_TRANSFORM : PREVIEW_TRANSFORM,
      asset.objectKey, asset.checksumSha256,
    ]))
    .digest("hex");
}

function hasAnimationContainer(body: Uint8Array, format: string): boolean {
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (format === "png") {
    // libvips can expose APNG as a single PNG page. Read its actual animation
    // control chunk rather than trusting pages or the asset's editable name.
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) throw new ImagePreviewUnsupportedError();
      if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
      offset = end;
    }
  }
  if (format === "webp") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const length = bytes.readUInt32LE(offset + 4);
      const end = offset + 8 + length;
      if (end > bytes.length) throw new ImagePreviewUnsupportedError();
      const kind = bytes.toString("ascii", offset, offset + 4);
      if (kind === "ANIM" || kind === "ANMF"
        || (kind === "VP8X" && length > 0 && (bytes[offset + 8] & 2) !== 0)) return true;
      offset = end + (length % 2);
    }
  }
  if (format === "avif") {
    const boxSize = bytes.readUInt32BE(0);
    if (bytes.toString("ascii", 8, 12) === "avis") return true;
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
      if (bytes.toString("ascii", offset, offset + 4) === "avis") return true;
    }
  }
  return false;
}

function actualFormat(body: Uint8Array): string | null {
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const boxSize = bytes.readUInt32BE(0);
    if (boxSize >= 16 && boxSize <= bytes.length) {
      const brands = [bytes.toString("ascii", 8, 12)];
      for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(bytes.toString("ascii", offset, offset + 4));
      if (brands.some((brand) => brand === "avif" || brand === "avis")) return "avif";
    }
  }
  return null;
}

function validObject(object: StoredObject, expectedKey: string): boolean {
  return object.objectKey === expectedKey
    && Number.isSafeInteger(object.byteSize) && object.byteSize > 0
    && object.body.byteLength === object.byteSize
    && /^[a-f0-9]{64}$/.test(object.checksumSha256)
    && checksum(object.body) === object.checksumSha256
    && typeof object.etag === "string" && object.etag.length > 0;
}

async function validatePreview(object: StoredObject, expectedKey: string): Promise<StoredObject> {
  if (!validObject(object, expectedKey) || object.contentType !== "image/webp" || actualFormat(object.body) !== "webp") {
    throw new ImagePreviewUnavailableError();
  }
  try {
    const metadata = await sharp(object.body, { limitInputPixels: PREVIEW_SIDE * PREVIEW_SIDE, failOn: "warning" }).metadata();
    if (metadata.format !== "webp" || !metadata.width || !metadata.height
      || metadata.width > PREVIEW_SIDE || metadata.height > PREVIEW_SIDE
      || (metadata.pages ?? 1) !== 1 || metadata.exif || metadata.icc || metadata.iptc || metadata.xmp
      || metadata.orientation !== undefined) throw new ImagePreviewUnavailableError();
  } catch {
    throw new ImagePreviewUnavailableError();
  }
  return object;
}

/** Only call with a canonical asset that the route has already authorized. */
export class ImagePreviewService {
  private readonly inFlight = new Map<string, Promise<StoredObject>>();
  private readonly cache = new Map<string, CachedPreview>();
  private readonly maxCacheBytes: number;
  private readonly maxCacheEntries: number;
  private readonly cacheIdleTtlMs: number;
  private readonly now: () => number;
  private cachedBytes = 0;
  private activeGenerations = 0;
  private readonly generationWaiters: (() => void)[] = [];

  constructor(private readonly objectStore: ObjectStore, options: ImagePreviewServiceOptions = {}) {
    this.maxCacheBytes = options.maxCacheBytes ?? 16 * 1024 * 1024;
    this.maxCacheEntries = options.maxCacheEntries ?? 256;
    this.cacheIdleTtlMs = options.cacheIdleTtlMs ?? 5 * 60 * 1000;
    for (const limit of [this.maxCacheBytes, this.maxCacheEntries, this.cacheIdleTtlMs]) {
      if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Image preview cache limits must be non-negative integers.");
    }
    this.now = options.now ?? Date.now;
  }

  etag(asset: WorkspaceMediaAsset, variant: ImagePreviewVariant = "library"): string {
    return `W/"image-preview-${previewIdentity(asset, variant)}"`;
  }

  async getPreview(asset: WorkspaceMediaAsset, variant: ImagePreviewVariant = "library"): Promise<StoredObject> {
    const key = `previews/v1/${previewIdentity(asset, variant)}.webp`;
    // Keep GIF originals in the canvas even when a persisted node has lost
    // its MIME/name hints. The service owns this canonical media type.
    if (variant === "canvas" && asset.contentType === "image/gif") throw new ImagePreviewUnsupportedError();
    const cached = this.readCachedPreview(key);
    if (cached) return { ...cached, body: Uint8Array.from(cached.body) };
    let operation = this.inFlight.get(key);
    if (!operation) {
      operation = this.loadOrCreate({ ...asset }, key, variant).then((object) => {
        this.cachePreview(key, object);
        return object;
      }).finally(() => {
        this.inFlight.delete(key);
      });
      this.inFlight.set(key, operation);
    }
    const object = await operation;
    // Neither callers nor the ObjectStore share the cache's owned byte array.
    return { ...object, body: Uint8Array.from(object.body) };
  }

  private removeCachedPreview(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    this.cachedBytes -= entry.object.body.byteLength;
    this.cache.delete(key);
  }

  private readCachedPreview(key: string): StoredObject | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    const now = this.now();
    if (now - entry.lastAccessedAt >= this.cacheIdleTtlMs) {
      this.removeCachedPreview(key);
      return null;
    }
    entry.lastAccessedAt = now;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.object;
  }

  private cachePreview(key: string, object: StoredObject): void {
    // Only validated derived content reaches this method. Authorization remains
    // at the route on every request, including cache hits and conditional reads.
    const byteSize = object.body.byteLength;
    if (!this.maxCacheEntries || !this.cacheIdleTtlMs || byteSize > this.maxCacheBytes) return;
    const now = this.now();
    for (const [cachedKey, entry] of this.cache) {
      if (now - entry.lastAccessedAt >= this.cacheIdleTtlMs) this.removeCachedPreview(cachedKey);
    }
    this.removeCachedPreview(key);
    while (this.cache.size >= this.maxCacheEntries || this.cachedBytes + byteSize > this.maxCacheBytes) {
      this.removeCachedPreview(this.cache.keys().next().value!);
    }
    this.cache.set(key, { object: { ...object, body: Uint8Array.from(object.body) }, lastAccessedAt: now });
    this.cachedBytes += byteSize;
  }

  private async loadOrCreate(asset: WorkspaceMediaAsset, key: string, variant: ImagePreviewVariant): Promise<StoredObject> {
    try {
      const cached = await this.objectStore.getObject(key);
      if (cached) return await validatePreview(cached, key);
      return await this.withGenerationSlot(() => this.createPreview(asset, key, variant));
    } catch (error) {
      if (error instanceof ImagePreviewUnsupportedError || error instanceof ImagePreviewUnavailableError) throw error;
      // Keep decoder/storage diagnostics and server connection details private.
      throw new ImagePreviewUnavailableError();
    }
  }

  private async withGenerationSlot(operation: () => Promise<StoredObject>): Promise<StoredObject> {
    if (this.activeGenerations >= 2) {
      await new Promise<void>((resolve) => this.generationWaiters.push(resolve));
    } else {
      this.activeGenerations += 1;
    }
    try {
      return await operation();
    } finally {
      const resume = this.generationWaiters.shift();
      if (resume) resume();
      else this.activeGenerations -= 1;
    }
  }

  private async createPreview(asset: WorkspaceMediaAsset, key: string, variant: ImagePreviewVariant): Promise<StoredObject> {
    // Acquire the generation slot before fetching a large original. Cached
    // previews never wait behind decodes, and at most two originals are in use.
    const source = await this.objectStore.getObject(asset.objectKey);
    if (!source || !validObject(source, asset.objectKey)
      || source.contentType !== asset.contentType || source.byteSize !== asset.byteSize
      || source.checksumSha256 !== asset.checksumSha256) throw new ImagePreviewUnavailableError();
    const body = await this.transform(source.body, asset.contentType, variant);
    let stored: StoredObjectMetadata;
    try {
      stored = await this.objectStore.putObject({ objectKey: key, contentType: "image/webp", body });
    } catch (error) {
      if (!(error instanceof ObjectKeyConflictError)) throw error;
      // Another server instance may have produced different valid encoded
      // bytes for the same weak representation. The immutable winner owns it.
      const winner = await this.objectStore.getObject(key);
      if (!winner) throw new ImagePreviewUnavailableError();
      return await validatePreview(winner, key);
    }
    return await validatePreview({ ...stored, body }, key);
  }

  private async transform(body: Uint8Array, contentType: string, variant: ImagePreviewVariant): Promise<Uint8Array> {
    const expectedFormat = INPUT_FORMATS.get(contentType);
    // Reject SVG, PDF and other powerful decoders before invoking libvips, even
    // when an upload supplied a misleading image/png Content-Type.
    if (!expectedFormat || actualFormat(body) !== expectedFormat) throw new ImagePreviewUnsupportedError();
    if (variant === "canvas" && hasAnimationContainer(body, expectedFormat)) throw new ImagePreviewUnsupportedError();
    try {
      const image = sharp(body, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: "warning",
        animated: false,
        page: 0,
        pages: 1,
      });
      const metadata = await image.metadata();
      const decodedFormat = metadata.format === "heif" && metadata.compression === "av1" ? "avif" : metadata.format;
      if (decodedFormat !== expectedFormat || !metadata.width || !metadata.height
        || metadata.width * metadata.height > MAX_INPUT_PIXELS) throw new ImagePreviewUnsupportedError();
      if (variant === "canvas" && ((metadata.pages ?? 1) > 1 || (metadata.delay?.length ?? 0) > 1)) {
        throw new ImagePreviewUnsupportedError();
      }
      return await image
        .rotate()
        .resize(PREVIEW_SIDE, PREVIEW_SIDE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 76 })
        .timeout({ seconds: 10 })
        .toBuffer();
    } catch {
      throw new ImagePreviewUnsupportedError();
    }
  }
}
