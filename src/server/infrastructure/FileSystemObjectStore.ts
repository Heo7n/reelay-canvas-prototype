import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import type {
  GetObjectOptions,
  ObjectStore,
  PutObjectInput,
  StoredObject,
  StoredObjectMetadata,
} from "../application/ObjectStore";
import { ObjectKeyConflictError } from "../application/ObjectStore";

interface StoredMetadataFile {
  objectKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  etag: string;
}

interface LocatedObject {
  contentPath: string;
  metadata: StoredMetadataFile;
}

const BUNDLE_DIRECTORY = ".reelay-objects-v1";
const CONTENT_FILE = "content";
const METADATA_FILE = "metadata.json";

function checksumSha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

function isStoredMetadata(value: unknown): value is StoredMetadataFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredMetadataFile>;
  return typeof candidate.objectKey === "string"
    && typeof candidate.contentType === "string"
    && typeof candidate.byteSize === "number"
    && Number.isSafeInteger(candidate.byteSize)
    && candidate.byteSize > 0
    && typeof candidate.checksumSha256 === "string"
    && /^[0-9a-f]{64}$/.test(candidate.checksumSha256)
    && typeof candidate.etag === "string"
    && candidate.etag.length > 0;
}

function isMissingPathError(error: unknown): boolean {
  return ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "");
}

function validateRange(options: GetObjectOptions, byteSize: number): { start: number; end: number } {
  const range = options.range ?? { start: 0, end: byteSize - 1 };
  if (
    !Number.isSafeInteger(range.start)
    || !Number.isSafeInteger(range.end)
    || range.start < 0
    || range.end < range.start
    || range.end >= byteSize
  ) throw new RangeError("Object byte range is invalid.");
  return range;
}

export class FileSystemObjectStore implements ObjectStore {
  private readonly resolvedRoot: string;

  constructor(rootPath: string) {
    this.resolvedRoot = path.resolve(rootPath);
  }

  async putObject(input: PutObjectInput): Promise<StoredObjectMetadata> {
    const objectKey = this.normalizeObjectKey(input.objectKey);
    const contentType = input.contentType.trim();
    if (!contentType) throw new Error("Object content type is required.");
    if (input.body.byteLength <= 0) throw new Error("Object body must not be empty.");

    const body = Uint8Array.from(input.body);
    const checksum = checksumSha256(body);
    const metadata: StoredMetadataFile = {
      objectKey,
      contentType,
      byteSize: body.byteLength,
      checksumSha256: checksum,
      etag: checksum,
    };
    const existing = await this.getObject(objectKey);
    if (existing) return this.resolveIdempotentPut(existing, metadata, body);

    const bundlePath = this.bundlePath(objectKey);
    const bundleParent = path.dirname(bundlePath);
    const temporaryPath = `${bundlePath}.tmp-${process.pid}-${randomUUID()}`;
    await mkdir(bundleParent, { recursive: true });
    await mkdir(temporaryPath);

    try {
      await this.writeDurably(path.join(temporaryPath, CONTENT_FILE), body);
      await this.writeDurably(
        path.join(temporaryPath, METADATA_FILE),
        new TextEncoder().encode(`${JSON.stringify(metadata)}\n`),
      );
      try {
        await rename(temporaryPath, bundlePath);
      } catch (error) {
        const winner = await this.getObject(objectKey);
        if (winner) return this.resolveIdempotentPut(winner, metadata, body);
        throw error;
      }
      await this.syncDirectoryBestEffort(bundleParent);
      return { ...metadata };
    } finally {
      // A unique sibling name means stale cleanup can never block a later retry.
      await rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async headObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    const normalizedKey = this.normalizeObjectKey(objectKey);
    const located = await this.locateObject(normalizedKey);
    return located ? { ...located.metadata } : null;
  }

  async getObject(objectKey: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const normalizedKey = this.normalizeObjectKey(objectKey);
    const located = await this.locateObject(normalizedKey);
    if (!located) return null;
    const range = validateRange(options, located.metadata.byteSize);
    const length = range.end - range.start + 1;

    let handle;
    try {
      handle = await open(located.contentPath, "r");
      const currentStats = await handle.stat();
      if (!currentStats.isFile() || currentStats.size !== located.metadata.byteSize) return null;
      const body = Buffer.allocUnsafe(length);
      let offset = 0;
      while (offset < length) {
        const { bytesRead } = await handle.read(body, offset, length - offset, range.start + offset);
        if (bytesRead === 0) return null;
        offset += bytesRead;
      }
      return {
        ...located.metadata,
        body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      };
    } catch (error) {
      if (isMissingPathError(error)) return null;
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async deleteObject(objectKey: string): Promise<boolean> {
    const normalizedKey = this.normalizeObjectKey(objectKey);
    const existed = await this.locateObject(normalizedKey) !== null;
    const legacyPath = this.legacyObjectPath(normalizedKey);
    await Promise.all([
      rm(this.bundlePath(normalizedKey), { recursive: true, force: true }),
      rm(legacyPath, { force: true }),
      rm(this.legacyMetadataPath(legacyPath), { force: true }),
    ]);
    return existed;
  }

  private async locateObject(objectKey: string): Promise<LocatedObject | null> {
    const bundlePath = this.bundlePath(objectKey);
    const bundled = await this.readLocatedObject(
      path.join(bundlePath, CONTENT_FILE),
      path.join(bundlePath, METADATA_FILE),
      objectKey,
    );
    if (bundled) return bundled;

    // Read-only compatibility with the original body + sidecar layout. New writes
    // always use an atomically published bundle directory.
    const legacyPath = this.legacyObjectPath(objectKey);
    return this.readLocatedObject(legacyPath, this.legacyMetadataPath(legacyPath), objectKey);
  }

  private async readLocatedObject(
    contentPath: string,
    metadataPath: string,
    objectKey: string,
  ): Promise<LocatedObject | null> {
    try {
      const [metadataSource, objectStats] = await Promise.all([
        readFile(metadataPath, "utf8"),
        stat(contentPath),
      ]);
      const metadata: unknown = JSON.parse(metadataSource);
      if (!isStoredMetadata(metadata) || metadata.objectKey !== objectKey) return null;
      if (!objectStats.isFile() || objectStats.size !== metadata.byteSize) return null;
      return { contentPath, metadata };
    } catch (error) {
      if (isMissingPathError(error) || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  private resolveIdempotentPut(
    existing: StoredObject,
    requested: StoredMetadataFile,
    requestedBody: Uint8Array,
  ): StoredObjectMetadata {
    if (
      existing.contentType === requested.contentType
      && existing.byteSize === requested.byteSize
      && existing.checksumSha256 === requested.checksumSha256
      && bytesEqual(existing.body, requestedBody)
    ) {
      return {
        objectKey: existing.objectKey,
        contentType: existing.contentType,
        byteSize: existing.byteSize,
        checksumSha256: existing.checksumSha256,
        etag: existing.etag,
      };
    }
    throw new ObjectKeyConflictError();
  }

  private async writeDurably(filePath: string, body: Uint8Array): Promise<void> {
    const handle = await open(filePath, "wx");
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async syncDirectoryBestEffort(directoryPath: string): Promise<void> {
    let handle;
    try {
      handle = await open(directoryPath, "r");
      await handle.sync();
    } catch {
      // Some platforms do not expose directory fsync. File sync plus same-volume
      // rename still preserves the atomic visibility boundary.
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  private normalizeObjectKey(objectKey: string): string {
    const normalizedKey = objectKey.trim();
    const segments = normalizedKey.split("/");
    if (
      !normalizedKey
      || normalizedKey.includes("\\")
      || path.isAbsolute(normalizedKey)
      || segments[0] === BUNDLE_DIRECTORY
      || segments.some((segment) => !segment || segment === "." || segment === "..")
    ) throw new Error("Object key is invalid.");
    return normalizedKey;
  }

  private legacyObjectPath(objectKey: string): string {
    const resolved = path.resolve(this.resolvedRoot, ...objectKey.split("/"));
    const relative = path.relative(this.resolvedRoot, resolved);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error("Object key escapes the configured root.");
    }
    return resolved;
  }

  private legacyMetadataPath(objectPath: string): string {
    return `${objectPath}.metadata.json`;
  }

  private bundlePath(objectKey: string): string {
    const digest = createHash("sha256").update(objectKey).digest("hex");
    return path.join(this.resolvedRoot, BUNDLE_DIRECTORY, digest.slice(0, 2), digest);
  }
}
