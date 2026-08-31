import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ObjectKeyConflictError } from "../application/ObjectStore";
import { InMemoryObjectStore } from "./InMemoryObjectStore";

describe("InMemoryObjectStore", () => {
  it("stores isolated bytes and exposes stable metadata", async () => {
    const store = new InMemoryObjectStore();
    const body = new TextEncoder().encode("reelay asset");
    const checksum = createHash("sha256").update(body).digest("hex");

    await expect(store.putObject({ objectKey: "workspace/asset", contentType: "image/webp", body }))
      .resolves.toEqual({
        objectKey: "workspace/asset",
        contentType: "image/webp",
        byteSize: body.byteLength,
        checksumSha256: checksum,
        etag: checksum,
      });

    body[0] = 0;
    const restored = await store.getObject("workspace/asset");
    expect(new TextDecoder().decode(restored?.body)).toBe("reelay asset");
    if (restored) restored.body[0] = 0;
    expect(new TextDecoder().decode((await store.getObject("workspace/asset"))?.body)).toBe("reelay asset");
    await expect(store.deleteObject("workspace/asset")).resolves.toBe(true);
    await expect(store.headObject("workspace/asset")).resolves.toBeNull();
  });

  it("rejects empty keys, content types, and object bodies", async () => {
    const store = new InMemoryObjectStore();
    await expect(store.putObject({ objectKey: "", contentType: "image/png", body: new Uint8Array([1]) }))
      .rejects.toThrow(/key is required/);
    await expect(store.putObject({ objectKey: "asset", contentType: "", body: new Uint8Array([1]) }))
      .rejects.toThrow(/content type is required/);
    await expect(store.putObject({ objectKey: "asset", contentType: "image/png", body: new Uint8Array() }))
      .rejects.toThrow(/must not be empty/);
  });

  it("treats the same immutable put as idempotent and rejects conflicting bytes", async () => {
    const store = new InMemoryObjectStore();
    const original = new TextEncoder().encode("immutable");
    const metadata = await store.putObject({ objectKey: "asset", contentType: "image/png", body: original });

    await expect(store.putObject({
      objectKey: "asset",
      contentType: "image/png",
      body: Uint8Array.from(original),
    })).resolves.toEqual(metadata);
    await expect(store.putObject({
      objectKey: "asset",
      contentType: "image/png",
      body: new TextEncoder().encode("different"),
    })).rejects.toBeInstanceOf(ObjectKeyConflictError);
    await expect(store.getObject("asset")).resolves.toEqual(expect.objectContaining({ body: original }));
  });

  it("returns only an inclusive requested byte range while preserving full metadata", async () => {
    const store = new InMemoryObjectStore();
    const body = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const metadata = await store.putObject({ objectKey: "ranged", contentType: "video/mp4", body });

    await expect(store.getObject("ranged", { range: { start: 2, end: 4 } })).resolves.toEqual({
      ...metadata,
      body: new Uint8Array([2, 3, 4]),
    });
    await expect(store.getObject("ranged", { range: { start: 4, end: 6 } }))
      .rejects.toBeInstanceOf(RangeError);
  });
});
