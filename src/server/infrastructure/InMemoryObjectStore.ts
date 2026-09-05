import { createHash } from "node:crypto";

import type {
  GetObjectOptions,
  ObjectStore,
  PutObjectInput,
  StoredObject,
  StoredObjectMetadata,
} from "../application/ObjectStore";
import { ObjectKeyConflictError } from "../application/ObjectStore";

function cloneMetadata(value: StoredObjectMetadata): StoredObjectMetadata {
  return {
    objectKey: value.objectKey,
    contentType: value.contentType,
    byteSize: value.byteSize,
    checksumSha256: value.checksumSha256,
    etag: value.etag,
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();

  async putObject(input: PutObjectInput): Promise<StoredObjectMetadata> {
    const objectKey = input.objectKey.trim();
    const contentType = input.contentType.trim();
    if (!objectKey) throw new Error("Object key is required.");
    if (!contentType) throw new Error("Object content type is required.");
    if (input.body.byteLength === 0) throw new Error("Object body must not be empty.");

    const body = Uint8Array.from(input.body);
    const existing = this.objects.get(objectKey);
    if (existing) {
      if (existing.contentType === contentType && bytesEqual(existing.body, body)) {
        return cloneMetadata(existing);
      }
      throw new ObjectKeyConflictError();
    }
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    const stored: StoredObject = {
      objectKey,
      contentType,
      byteSize: body.byteLength,
      checksumSha256,
      etag: checksumSha256,
      body,
    };
    this.objects.set(objectKey, stored);
    return cloneMetadata(stored);
  }

  async headObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    const stored = this.objects.get(objectKey);
    return stored ? cloneMetadata(stored) : null;
  }

  async getObject(objectKey: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    const stored = this.objects.get(objectKey);
    if (!stored) return null;
    const range = options.range;
    if (!range) return { ...cloneMetadata(stored), body: Uint8Array.from(stored.body) };
    if (
      !Number.isSafeInteger(range.start)
      || !Number.isSafeInteger(range.end)
      || range.start < 0
      || range.end < range.start
      || range.end >= stored.byteSize
    ) throw new RangeError("Object byte range is invalid.");
    return {
      ...cloneMetadata(stored),
      body: stored.body.slice(range.start, range.end + 1),
    };
  }

  async deleteObject(objectKey: string): Promise<boolean> {
    return this.objects.delete(objectKey);
  }
}
