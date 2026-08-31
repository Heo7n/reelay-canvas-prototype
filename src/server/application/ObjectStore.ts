export interface PutObjectInput {
  objectKey: string;
  contentType: string;
  body: Uint8Array;
}

export interface StoredObjectMetadata {
  objectKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  etag: string;
}

export interface StoredObject extends StoredObjectMetadata {
  body: Uint8Array;
}

export interface ObjectByteRange {
  /** Inclusive byte offset. */
  start: number;
  /** Inclusive byte offset. */
  end: number;
}

export interface GetObjectOptions {
  range?: ObjectByteRange;
}

export class ObjectKeyConflictError extends Error {
  constructor() {
    super("An object with this key already exists with different content.");
    this.name = "ObjectKeyConflictError";
  }
}

export interface ObjectStore {
  putObject(input: PutObjectInput): Promise<StoredObjectMetadata>;
  headObject(objectKey: string): Promise<StoredObjectMetadata | null>;
  getObject(objectKey: string, options?: GetObjectOptions): Promise<StoredObject | null>;
  deleteObject(objectKey: string): Promise<boolean>;
}
