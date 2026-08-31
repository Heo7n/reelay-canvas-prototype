import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileSystemObjectStore } from "./FileSystemObjectStore";

describe("FileSystemObjectStore", () => {
  let rootPath: string;
  let store: FileSystemObjectStore;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(os.tmpdir(), "reelay-object-store-"));
    store = new FileSystemObjectStore(rootPath);
  });

  afterEach(async () => {
    const resolved = path.resolve(rootPath);
    const tempRoot = path.resolve(os.tmpdir());
    if (!resolved.startsWith(`${tempRoot}${path.sep}reelay-object-store-`)) {
      throw new Error(`Refusing to remove unexpected test path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  });

  it("persists immutable content and metadata across adapter instances", async () => {
    const body = new TextEncoder().encode("asset bytes");
    const stored = await store.putObject({
      objectKey: "workspace-1/asset-1/original.bin",
      contentType: "application/octet-stream",
      body,
    });

    expect(stored).toEqual(expect.objectContaining({
      objectKey: "workspace-1/asset-1/original.bin",
      byteSize: body.byteLength,
      contentType: "application/octet-stream",
    }));
    expect(stored.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    const reopened = new FileSystemObjectStore(rootPath);
    await expect(reopened.headObject(stored.objectKey)).resolves.toEqual(stored);
    await expect(reopened.getObject(stored.objectKey)).resolves.toEqual({ ...stored, body });
  });

  it("publishes a complete bundle atomically and ignores stale sibling temp directories", async () => {
    const objectKey = "workspace-1/asset-atomic/original.bin";
    const digest = createHash("sha256").update(objectKey).digest("hex");
    const bundlePath = path.join(rootPath, ".reelay-objects-v1", digest.slice(0, 2), digest);
    const staleTempPath = `${bundlePath}.tmp-stale`;
    await mkdir(staleTempPath, { recursive: true });
    await writeFile(path.join(staleTempPath, "content"), Buffer.from("incomplete"));

    await expect(store.headObject(objectKey)).resolves.toBeNull();
    const body = new TextEncoder().encode("fully published");
    const metadata = await store.putObject({ objectKey, contentType: "application/octet-stream", body });

    expect(await readFile(path.join(bundlePath, "content"))).toEqual(Buffer.from(body));
    expect(JSON.parse(await readFile(path.join(bundlePath, "metadata.json"), "utf8"))).toEqual(metadata);
    await expect(access(path.join(rootPath, ...objectKey.split("/")))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.getObject(objectKey)).resolves.toEqual({ ...metadata, body });
  });

  it("is race-idempotent for identical bytes and refuses immutable-key replacement", async () => {
    const input = {
      objectKey: "workspace-1/asset-1/file.png",
      contentType: "image/png",
      body: new Uint8Array([1, 2, 3]),
    };
    const [first, raced] = await Promise.all([store.putObject(input), store.putObject(input)]);

    expect(raced).toEqual(first);
    await expect(store.putObject(input)).resolves.toEqual(first);
    await expect(store.putObject({ ...input, body: new Uint8Array([9]) })).rejects.toThrow(
      /different content/i,
    );
    await expect(store.getObject(input.objectKey)).resolves.toEqual({ ...first, body: input.body });
  });

  it("reads only the requested inclusive range", async () => {
    const body = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const metadata = await store.putObject({
      objectKey: "workspace-1/ranged.mp4",
      contentType: "video/mp4",
      body,
    });

    await expect(store.getObject(metadata.objectKey, { range: { start: 2, end: 4 } })).resolves.toEqual({
      ...metadata,
      body: new Uint8Array([2, 3, 4]),
    });
    await expect(store.getObject(metadata.objectKey, { range: { start: 5, end: 6 } }))
      .rejects.toBeInstanceOf(RangeError);
  });

  it("keeps the original body plus metadata-sidecar layout readable", async () => {
    const objectKey = "workspace-legacy/asset.bin";
    const objectPath = path.join(rootPath, ...objectKey.split("/"));
    const body = Buffer.from("legacy bytes");
    const checksum = createHash("sha256").update(body).digest("hex");
    const metadata = {
      objectKey,
      contentType: "application/octet-stream",
      byteSize: body.byteLength,
      checksumSha256: checksum,
      etag: checksum,
    };
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, body);
    await writeFile(`${objectPath}.metadata.json`, `${JSON.stringify(metadata)}\n`);

    await expect(store.headObject(objectKey)).resolves.toEqual(metadata);
    await expect(store.getObject(objectKey, { range: { start: 1, end: 3 } })).resolves.toEqual({
      ...metadata,
      body: new Uint8Array(body.buffer, body.byteOffset + 1, 3),
    });
    await expect(store.putObject({ objectKey, contentType: metadata.contentType, body })).resolves.toEqual(metadata);
    await expect(store.putObject({ objectKey, contentType: metadata.contentType, body: Buffer.from("changed") }))
      .rejects.toThrow(/different content/i);
  });

  it("rejects traversal and deletes only the exact object files", async () => {
    await expect(store.putObject({
      objectKey: "../outside.bin",
      contentType: "application/octet-stream",
      body: new Uint8Array([1]),
    })).rejects.toThrow(/invalid/);

    const stored = await store.putObject({
      objectKey: "workspace-1/asset.bin",
      contentType: "application/octet-stream",
      body: new Uint8Array([1]),
    });
    await expect(store.deleteObject(stored.objectKey)).resolves.toBe(true);
    await expect(store.getObject(stored.objectKey)).resolves.toBeNull();
    await expect(store.deleteObject(stored.objectKey)).resolves.toBe(false);
  });
});
