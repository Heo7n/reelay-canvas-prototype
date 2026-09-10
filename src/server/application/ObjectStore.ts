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

export interface SignedObjectDownload extends StoredObjectMetadata {
  /** A time-limited URL for this exact immutable object, never a server credential. */
  url: string;
}

export interface SignedObjectUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface CreateSignedObjectUploadInput {
  objectKey: string;
  contentType: string;
  checksumSha256: string;
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
  /** Optional direct delivery for remote stores; callers must authorize access first. */
  createSignedDownload?(objectKey: string, expiresInSeconds: number): Promise<SignedObjectDownload | null>;
  /** Uploads remain invisible until the caller verifies the real bytes and finalizes its intent. */
  createSignedUpload?(input: CreateSignedObjectUploadInput): Promise<SignedObjectUpload>;
  deleteObject(objectKey: string): Promise<boolean>;
}
