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

describe("ImagePreviewService", () => {
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
    const service = new ImagePreviewService(store);
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
