import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";

import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceMediaAsset } from "../../domain/asset/workspace-media-asset";
import { ObjectKeyConflictError } from "../application/ObjectStore";
import type { StoredObject } from "../application/ObjectStore";
import { InMemoryObjectStore } from "./InMemoryObjectStore";
import { ImagePreviewService, ImagePreviewUnavailableError, ImagePreviewUnsupportedError } from "./ImagePreviewService";

function digest(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

async function original(store: InMemoryObjectStore, body: Uint8Array, contentType = "image/png", objectKey = "workspace/asset/original"): Promise<WorkspaceMediaAsset> {
  await store.putObject({ objectKey, body, contentType });
  return {
    id: objectKey, workspaceId: "workspace", mediaKind: "image", displayName: "Private image",
    objectKey, objectVersion: 1, contentType, byteSize: body.byteLength,
    checksumSha256: digest(body), createdByActorId: "owner",
    createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z",
  };
}

function png(width = 1200, height = 800, alpha = 1): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 28, g: 134, b: 212, alpha } } })
    .png().toBuffer();
}

function storedPreview(key: string, body: Uint8Array): StoredObject {
  return { objectKey: key, body, contentType: "image/webp", byteSize: body.byteLength, checksumSha256: digest(body), etag: digest(body) };
}

function pngChunk(kind: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(kind, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}

async function apng(): Promise<Buffer> {
  const first = await png(12, 12);
  const second = await sharp({ create: { width: 12, height: 12, channels: 4, background: "red" } }).png().toBuffer();
  const chunks = (body: Buffer, kind: string) => {
    const found: Buffer[] = [];
    for (let offset = 8; offset + 12 <= body.length;) {
      const length = body.readUInt32BE(offset);
      if (body.toString("ascii", offset + 4, offset + 8) === kind) found.push(body.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
    }
    return found;
  };
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2, 0);
  const frame = (sequence: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence, 0);
    data.writeUInt32BE(12, 4);
    data.writeUInt32BE(12, 8);
    data.writeUInt16BE(1, 20);
    data.writeUInt16BE(10, 22);
    return pngChunk("fcTL", data);
  };
  const secondData = Buffer.concat([Buffer.from([0, 0, 0, 2]), ...chunks(second, "IDAT")]);
  return Buffer.concat([
    first.subarray(0, 8), pngChunk("IHDR", chunks(first, "IHDR")[0]),
    pngChunk("acTL", control), frame(0), pngChunk("IDAT", Buffer.concat(chunks(first, "IDAT"))),
    frame(1), pngChunk("fdAT", secondData), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("ImagePreviewService", () => {
  it("canvas variants certify static sources in a separate persistent cache and reuse proven JPEG library previews", async () => {
    const store = new InMemoryObjectStore();
    const service = new ImagePreviewService(store);
    const asset = await original(store, await png());
    const library = await service.getPreview(asset);
    const read = vi.spyOn(store, "getObject");
    const canvas = await service.getPreview(asset, "canvas");
    expect(canvas.objectKey).not.toBe(library.objectKey);
    expect(service.etag(asset, "canvas")).not.toBe(service.etag(asset));
    expect(read.mock.calls.some(([key]) => key === asset.objectKey)).toBe(true);
    expect(await sharp(canvas.body).metadata()).toMatchObject({ width: 512, height: 341, format: "webp" });
    read.mockClear();
    await expect(new ImagePreviewService(store).getPreview(asset, "canvas")).resolves.toEqual(canvas);
    expect(read.mock.calls).toEqual([[canvas.objectKey]]);

    const jpeg = await original(store, await sharp(await png()).jpeg().toBuffer(), "image/jpeg", "workspace/static-jpeg");
    const jpegLibrary = await service.getPreview(jpeg);
    read.mockClear();
    expect(service.etag(jpeg, "canvas")).toBe(service.etag(jpeg));
    await expect(service.getPreview(jpeg, "canvas")).resolves.toEqual(jpegLibrary);
    expect(read).not.toHaveBeenCalled();
  });

  it("renamed GIF, animated WebP and APNG cannot reuse a static first-frame library preview on the canvas", async () => {
    const pixels = Buffer.concat([Buffer.alloc(12 * 12 * 3, Buffer.from([255, 0, 0])), Buffer.alloc(12 * 12 * 3, Buffer.from([0, 0, 255]))]);
    const raw = { width: 12, height: 24, channels: 3 as const, pageHeight: 12 };
    const gif = await sharp(pixels, { raw }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
    const webp = await sharp(pixels, { raw }).webp({ delay: [100, 100], loop: 0 }).toBuffer();
    const store = new InMemoryObjectStore();
    const service = new ImagePreviewService(store);
    for (const [index, [body, contentType]] of ([
      [gif, "image/gif"], [webp, "image/webp"], [await apng(), "image/png"],
    ] as const).entries()) {
      const asset = { ...await original(store, body, contentType, `workspace/animation-${index}`), displayName: "角色动效" };
      const library = await service.getPreview(asset);
      expect((await sharp(library.body).metadata()).pages ?? 1).toBe(1);
      const write = vi.spyOn(store, "putObject");
      await expect(service.getPreview(asset, "canvas")).rejects.toBeInstanceOf(ImagePreviewUnsupportedError);
      expect(write).not.toHaveBeenCalled();
      write.mockRestore();
      expect((await store.getObject(asset.objectKey))?.body).toEqual(new Uint8Array(body));
    }
  });

  it("canvas previews reject an AVIF image sequence brand even when its first image is decodable", async () => {
    const store = new InMemoryObjectStore();
    const sequence = await sharp(await png(32, 16)).avif().toBuffer();
    // An avis-compatible ftyp is the container-level animation contract;
    // decoders that inspect only its primary image must not flatten it.
    sequence.write("avis", 8, 4, "ascii");
    const asset = await original(store, sequence, "image/avif");
    await expect(new ImagePreviewService(store).getPreview(asset, "canvas")).rejects.toBeInstanceOf(ImagePreviewUnsupportedError);
  });

  it("creates a bounded real WebP, preserves the original, and serves persistent cache without re-reading the original", async () => {
    const store = new InMemoryObjectStore();
    const body = await png();
    const asset = await original(store, body);
    const service = new ImagePreviewService(store);
    const read = vi.spyOn(store, "getObject");
    const preview = await service.getPreview(asset);
    expect(await sharp(preview.body).metadata()).toMatchObject({ format: "webp", width: 512, height: 341 });
    expect(preview.contentType).toBe("image/webp");
    expect(preview.byteSize).toBeLessThan(asset.byteSize);
    expect(preview.checksumSha256).toBe(digest(preview.body));
    expect(preview.objectKey).toMatch(/^previews\/v1\/[a-f0-9]{64}\.webp$/);
    expect(service.etag(asset)).toMatch(/^W\/"image-preview-[a-f0-9]{64}"$/);
    read.mockClear();
    const reopened = new ImagePreviewService(store);
    expect(reopened.etag(asset)).toBe(service.etag(asset));
    await expect(reopened.getPreview(asset)).resolves.toEqual(preview);
    expect(read.mock.calls).toEqual([[preview.objectKey]]);
    expect((await store.getObject(asset.objectKey))?.body).toEqual(new Uint8Array(body));
  });

  it("does not enlarge small transparent images and applies EXIF rotation while removing source metadata", async () => {
    const store = new InMemoryObjectStore();
    const service = new ImagePreviewService(store);
    const transparent = await original(store, await png(64, 32, 0.5));
    const preview = await service.getPreview(transparent);
    expect(await sharp(preview.body).metadata()).toMatchObject({ width: 64, height: 32, hasAlpha: true });
    const pixels = await sharp(preview.body).raw().toBuffer();
    expect(pixels[3]).toBeGreaterThanOrEqual(127);
    expect(pixels[3]).toBeLessThanOrEqual(128);
    const jpeg = await sharp(await png(80, 40))
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "private owner" } } }).jpeg().toBuffer();
    const oriented = await original(store, jpeg, "image/jpeg", "workspace/rotated");
    const output = await service.getPreview(oriented);
    const metadata = await sharp(output.body).metadata();
    expect(metadata).toMatchObject({ width: 40, height: 80 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it("uses only the first animation frame and accepts actual AVIF and WebP raster input", async () => {
    const store = new InMemoryObjectStore();
    const service = new ImagePreviewService(store);
    const framePixels = Buffer.concat([Buffer.alloc(12 * 12 * 3, Buffer.from([255, 0, 0])), Buffer.alloc(12 * 12 * 3, Buffer.from([0, 0, 255]))]);
    const animation = await sharp(framePixels, { raw: { width: 12, height: 24, channels: 3, pageHeight: 12 } })
      .gif({ delay: [100, 100], loop: 0 }).toBuffer();
    expect((await sharp(animation, { animated: true }).metadata()).pages).toBe(2);
    const animatedAsset = await original(store, animation, "image/gif");
    const staticPreview = await service.getPreview(animatedAsset);
    const staticMetadata = await sharp(staticPreview.body).metadata();
    expect(staticMetadata).toMatchObject({ width: 12, height: 12 });
    expect(staticMetadata.pages ?? 1).toBe(1);
    const firstPixel = await sharp(staticPreview.body).raw().toBuffer();
    expect(firstPixel[0]).toBeGreaterThan(240);
    expect(firstPixel[2]).toBeLessThan(20);
    for (const format of ["webp", "avif"] as const) {
      const raster = await sharp(await png(32, 16)).toFormat(format).toBuffer();
      const asset = await original(store, raster, `image/${format}`, `workspace/${format}`);
      expect(await sharp((await service.getPreview(asset)).body).metadata()).toMatchObject({ width: 32, height: 16, format: "webp" });
    }
  });

  it("rejects SVG and misleading MIME types before decoding, and enforces the 64 MP header limit", async () => {
    const store = new InMemoryObjectStore();
    const service = new ImagePreviewService(store);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');
    const oversize = await png(1, 1);
    oversize.writeUInt32BE(8001, 16);
    oversize.writeUInt32BE(8000, 20);
    oversize.writeUInt32BE(crc32(oversize.subarray(12, 29)), 29);
    const examples = [
      { body: svg, contentType: "image/png" },
      { body: svg, contentType: "image/svg+xml" },
      { body: await png(2, 2), contentType: "image/jpeg" },
      { body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), contentType: "image/png" },
      { body: oversize, contentType: "image/png" },
    ];
    for (const [index, example] of examples.entries()) {
      const asset = await original(store, example.body, example.contentType, `workspace/invalid-${index}`);
      await expect(service.getPreview(asset)).rejects.toBeInstanceOf(ImagePreviewUnsupportedError);
    }
  });

  it("coalesces concurrent work, isolates returned bytes, and clears failed operations for retry", async () => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png());
    const service = new ImagePreviewService(store);
    const read = vi.spyOn(store, "getObject");
    const write = vi.spyOn(store, "putObject").mockRejectedValueOnce(new Error("private backend diagnostics"));
    await expect(service.getPreview(asset)).rejects.toThrow("The image preview content is unavailable or failed integrity validation.");
    read.mockClear();
    write.mockClear();
    const previews = await Promise.all(Array.from({ length: 6 }, () => service.getPreview(asset)));
    expect(read.mock.calls.filter(([key]) => key === asset.objectKey)).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(previews.every((preview) => preview.checksumSha256 === previews[0].checksumSha256)).toBe(true);
    expect(previews[0].body).not.toBe(previews[1].body);
    previews[0].body[0] = 0;
    expect(previews[1].body[0]).toBe(82);
    expect((await service.getPreview(asset)).body[0]).toBe(82);
  });

  it("limits distinct cache misses to two original reads, releases a failed slot, and lets cache hits pass", async () => {
    const store = new InMemoryObjectStore();
    const service = new ImagePreviewService(store);
    const body = await png(64, 32);
    const cachedAsset = await original(store, body, "image/png", "workspace/cached");
    const cachedPreview = await service.getPreview(cachedAsset);
    const assets = await Promise.all([0, 1, 2].map((index) => original(store, body, "image/png", `workspace/queued-${index}`)));
    const get = store.getObject.bind(store);
    const originals = await Promise.all(assets.map((asset) => get(asset.objectKey)));
    const pending = new Map<string, { resolve: (object: StoredObject | null) => void; reject: (error: Error) => void }>();
    vi.spyOn(store, "getObject").mockImplementation((key, options) => {
      if (!assets.some((asset) => asset.objectKey === key)) return get(key, options);
      return new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
    });
    const completed = Promise.allSettled(assets.map((asset) => service.getPreview(asset)));
    await vi.waitFor(() => expect(pending.size).toBe(2));
    expect(pending.has(assets[2].objectKey)).toBe(false);
    await expect(service.getPreview(cachedAsset)).resolves.toEqual(cachedPreview);
    expect(pending.size).toBe(2);

    pending.get(assets[0].objectKey)!.reject(new Error("source temporarily unavailable"));
    await vi.waitFor(() => expect(pending.has(assets[2].objectKey)).toBe(true));
    pending.get(assets[1].objectKey)!.resolve(originals[1]);
    pending.get(assets[2].objectKey)!.resolve(originals[2]);
    const results = await completed;
    expect(results[0]).toMatchObject({ status: "rejected", reason: expect.any(ImagePreviewUnavailableError) });
    expect(results.slice(1).every((result) => result.status === "fulfilled")).toBe(true);
  });

  it("separates source keys and revisions and refuses original metadata/checksum mismatches", async () => {
    const store = new InMemoryObjectStore();
    const body = await png();
    const first = await original(store, body);
    const second = await original(store, body, "image/png", "other-workspace/asset/original");
    const service = new ImagePreviewService(store);
    const [one, two] = await Promise.all([service.getPreview(first), service.getPreview(second)]);
    expect(one.objectKey).not.toBe(two.objectKey);
    expect(service.etag(first)).not.toBe(service.etag(second));
    const changed = { ...first, checksumSha256: "b".repeat(64) };
    expect(service.etag(first)).not.toBe(service.etag(changed));
    await expect(service.getPreview(changed)).rejects.toBeInstanceOf(ImagePreviewUnavailableError);
    const missing = { ...first, objectKey: "workspace/missing" };
    await expect(service.getPreview(missing)).rejects.toBeInstanceOf(ImagePreviewUnavailableError);
  });

  it("does not overwrite an invalid immutable cache and validates its dimensions, metadata and bytes", async () => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png());
    const service = new ImagePreviewService(store, { maxCacheBytes: 0 });
    const good = await service.getPreview(asset);
    const read = vi.spyOn(store, "getObject");
    const write = vi.spyOn(store, "putObject");
    const tooWide = await sharp(await png(513, 100)).webp().toBuffer();
    const withExif = await sharp(await png(100, 100)).withMetadata({ orientation: 3 }).webp().toBuffer();
    for (const corrupt of [
      { ...good, contentType: "image/png" },
      { ...good, byteSize: good.byteSize + 1 },
      { ...good, checksumSha256: "f".repeat(64) },
      storedPreview(good.objectKey, tooWide),
      storedPreview(good.objectKey, withExif),
    ]) {
      read.mockResolvedValueOnce(corrupt);
      await expect(service.getPreview(asset)).rejects.toBeInstanceOf(ImagePreviewUnavailableError);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("reads a valid cross-instance winner after an immutable write conflict", async () => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png());
    const winnerBody = await sharp(await png(512, 341)).webp({ quality: 70 }).toBuffer();
    const put = store.putObject.bind(store);
    const write = vi.spyOn(store, "putObject").mockImplementationOnce(async (input) => {
      await put({ ...input, body: winnerBody });
      throw new ObjectKeyConflictError();
    });
    const preview = await new ImagePreviewService(store).getPreview(asset);
    expect(preview.body).toEqual(new Uint8Array(winnerBody));
    expect(write).toHaveBeenCalledTimes(1);
    expect((await store.getObject(asset.objectKey))?.checksumSha256).toBe(asset.checksumSha256);
  });
});

describe("ImagePreviewService memory cache", () => {
  it("reuses validated derived bytes without Storage reads and isolates callers, variants and storage buffers", async () => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png());
    const persisted = await new ImagePreviewService(store, { maxCacheBytes: 0 }).getPreview(asset);
    const read = vi.spyOn(store, "getObject").mockResolvedValueOnce(persisted);
    const service = new ImagePreviewService(store);
    const first = await service.getPreview(asset);
    const expectedBody = Uint8Array.from(first.body);
    persisted.body.fill(0);
    first.body.fill(1);
    first.contentType = "image/png";
    read.mockClear();
    const cached = await service.getPreview(asset);
    expect(cached.body).toEqual(expectedBody);
    expect(cached.contentType).toBe("image/webp");
    expect(cached.checksumSha256).toBe(digest(cached.body));
    expect(read).not.toHaveBeenCalled();
    cached.body.fill(2);
    expect((await service.getPreview(asset)).body).toEqual(expectedBody);

    const canvas = await service.getPreview(asset, "canvas");
    expect(canvas.objectKey).not.toBe(cached.objectKey);
    expect(read.mock.calls.some(([key]) => key === asset.objectKey)).toBe(true);
    read.mockClear();
    await service.getPreview(asset, "canvas");
    await service.getPreview(asset);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["entries", "bytes"] as const)("evicts the least recently used derived image at its %s limit", async (limit) => {
    const store = new InMemoryObjectStore();
    const body = await png(64, 32);
    const assets = await Promise.all([0, 1, 2].map((index) => original(store, body, "image/png", `workspace/lru-${index}`)));
    const seed = new ImagePreviewService(store, { maxCacheBytes: 0 });
    const previews = await Promise.all(assets.map((asset) => seed.getPreview(asset)));
    expect(new Set(previews.map((preview) => preview.body.byteLength)).size).toBe(1);
    const service = new ImagePreviewService(store, limit === "entries"
      ? { maxCacheEntries: 2 }
      : { maxCacheBytes: previews[0].body.byteLength * 2 });
    await service.getPreview(assets[0]);
    await service.getPreview(assets[1]);
    await service.getPreview(assets[0]);
    await service.getPreview(assets[2]);
    const read = vi.spyOn(store, "getObject");
    await service.getPreview(assets[0]);
    await service.getPreview(assets[2]);
    expect(read).not.toHaveBeenCalled();
    await service.getPreview(assets[1]);
    expect(read.mock.calls).toEqual([[previews[1].objectKey]]);
  });

  it("renews idle expiry on a hit, then reloads the persistent preview at the expiry boundary", async () => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png(64, 32));
    let now = 0;
    const service = new ImagePreviewService(store, { cacheIdleTtlMs: 100, now: () => now });
    const preview = await service.getPreview(asset);
    const read = vi.spyOn(store, "getObject");
    now = 99;
    await service.getPreview(asset);
    now = 150;
    await service.getPreview(asset);
    expect(read).not.toHaveBeenCalled();
    now = 250;
    await service.getPreview(asset);
    expect(read.mock.calls).toEqual([[preview.objectKey]]);
  });

  it("returns oversized previews without caching them or evicting a smaller valid entry", async () => {
    const store = new InMemoryObjectStore();
    const smallAsset = await original(store, await png(4, 4), "image/png", "workspace/small");
    const largeAsset = await original(store, await png(), "image/png", "workspace/large");
    const seed = new ImagePreviewService(store, { maxCacheBytes: 0 });
    const small = await seed.getPreview(smallAsset);
    const large = await seed.getPreview(largeAsset);
    expect(large.body.byteLength).toBeGreaterThan(small.body.byteLength);
    const service = new ImagePreviewService(store, { maxCacheBytes: small.body.byteLength });
    await service.getPreview(smallAsset);
    const read = vi.spyOn(store, "getObject");
    await expect(service.getPreview(largeAsset)).resolves.toEqual(large);
    await expect(service.getPreview(largeAsset)).resolves.toEqual(large);
    await expect(service.getPreview(smallAsset)).resolves.toEqual(small);
    expect(read.mock.calls).toEqual([[large.objectKey], [large.objectKey]]);
  });

  it("does not cache invalid content or failures and caches the next validated retry", async () => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png(64, 32));
    const preview = await new ImagePreviewService(store, { maxCacheBytes: 0 }).getPreview(asset);
    const service = new ImagePreviewService(store);
    const read = vi.spyOn(store, "getObject")
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce({ ...preview, checksumSha256: "f".repeat(64) });
    await expect(service.getPreview(asset)).rejects.toBeInstanceOf(ImagePreviewUnavailableError);
    await expect(service.getPreview(asset)).rejects.toBeInstanceOf(ImagePreviewUnavailableError);
    await expect(service.getPreview(asset)).resolves.toEqual(preview);
    expect(read).toHaveBeenCalledTimes(3);
    await expect(service.getPreview(asset)).resolves.toEqual(preview);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it.each(["maxCacheBytes", "maxCacheEntries", "cacheIdleTtlMs"] as const)("supports disabling %s without changing returned content", async (option) => {
    const store = new InMemoryObjectStore();
    const asset = await original(store, await png(4, 4));
    const service = new ImagePreviewService(store, { [option]: 0 });
    const preview = await service.getPreview(asset);
    const read = vi.spyOn(store, "getObject");
    await expect(service.getPreview(asset)).resolves.toEqual(preview);
    expect(read.mock.calls).toEqual([[preview.objectKey]]);
  });
});
