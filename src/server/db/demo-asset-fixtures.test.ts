import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  DEMO_ASSET_FIXTURES,
  DEMO_ENTITY_FIXTURES,
  LEGACY_DEMO_ASSET_FIXTURES,
  PREVIOUS_DEMO_ASSET_FIXTURES,
  V3_DEMO_ASSET_FIXTURES,
} from "./demo-asset-fixtures";

interface StaticMediaFixture {
  id: string;
  displayName: string;
  mediaKind: "image" | "video" | "audio";
  type: "image" | "video" | "audio";
  contentType: string;
  url: string;
  width: number;
  height: number;
}

interface StaticEntityFixture {
  id: string;
  name: string;
  description: string;
  mediaRefs: Array<{ mediaId: string; order: number }>;
  coverMediaId: string;
}

function readStaticAssetLibrarySeed(): { media: StaticMediaFixture[]; entities: StaticEntityFixture[] } {
  const sourcePath = fileURLToPath(new URL("../../config/prototype-config.js", import.meta.url));
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  runInNewContext(readFileSync(sourcePath, "utf8"), sandbox, { filename: sourcePath });
  const config = sandbox.window.REELAY_PROTOTYPE_CONFIG as {
    assetLibrarySeed: { media: StaticMediaFixture[]; entities: StaticEntityFixture[] };
  };
  return config.assetLibrarySeed;
}

function readImageDimensions(fileName: string): { width: number; height: number } {
  const filePath = fileURLToPath(new URL(`../../../assets/home/${fileName}`, import.meta.url));
  const body = readFileSync(filePath);
  if (fileName.endsWith(".png")) {
    expect(body.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  }
  expect(body.readUInt16BE(0)).toBe(0xffd8);
  let offset = 2;
  while (offset + 8 < body.length) {
    expect(body[offset]).toBe(0xff);
    while (body[offset] === 0xff) offset++;
    const marker = body[offset++]!;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { width: body.readUInt16BE(offset + 5), height: body.readUInt16BE(offset + 3) };
    }
    const length = body.readUInt16BE(offset);
    if (length < 2) break;
    offset += length;
  }
  throw new Error(`Missing JPEG dimensions: ${fileName}.`);
}

describe("canonical demo asset fixtures", () => {
  it("stay identical to the personal Entity examples shown by the static file prototype", () => {
    const staticSeed = readStaticAssetLibrarySeed();
    const staticMediaById = new Map(staticSeed.media.map((media) => [media.id, media]));
    const staticEntitiesById = new Map(staticSeed.entities.map((entity) => [entity.id, entity]));

    for (const fixture of DEMO_ASSET_FIXTURES) {
      expect(staticMediaById.get(fixture.staticMediaId)).toEqual(expect.objectContaining({
        id: fixture.staticMediaId,
        displayName: fixture.displayName,
        mediaKind: fixture.mediaKind,
        type: fixture.mediaKind,
        contentType: fixture.contentType,
        url: `./assets/home/${fixture.fileName}`,
        width: fixture.width,
        height: fixture.height,
      }));
    }
    for (const fixture of DEMO_ENTITY_FIXTURES) {
      const staticEntity = staticEntitiesById.get(fixture.staticEntityId);
      expect(staticEntity).toEqual(expect.objectContaining({
        id: fixture.staticEntityId,
        name: fixture.name,
        description: fixture.description,
        coverMediaId: DEMO_ASSET_FIXTURES.find(({ key }) => key === fixture.coverAssetKey)?.staticMediaId,
      }));
      expect(staticEntity?.mediaRefs).toEqual(fixture.assetKeys.map((assetKey, order) => ({
        mediaId: DEMO_ASSET_FIXTURES.find(({ key }) => key === assetKey)?.staticMediaId,
        order,
      })));
    }
  });

  it("keeps every published media fingerprint stable for safe in-place detection", () => {
    for (const fixture of [...LEGACY_DEMO_ASSET_FIXTURES, ...PREVIOUS_DEMO_ASSET_FIXTURES, ...V3_DEMO_ASSET_FIXTURES, ...DEMO_ASSET_FIXTURES]) {
      const filePath = fileURLToPath(new URL(`../../../assets/home/${fixture.fileName}`, import.meta.url));
      const body = readFileSync(filePath);
      expect(body.byteLength).toBe(fixture.goldenByteSize);
      expect(createHash("sha256").update(body).digest("hex")).toBe(fixture.goldenChecksumSha256);
    }
  });

  it("preserves the supplied 5/3/4 character groups, cover-first order, and original dimensions", () => {
    expect(DEMO_ASSET_FIXTURES).toHaveLength(12);
    expect(DEMO_ASSET_FIXTURES.every(({ mediaKind }) => mediaKind === "image")).toBe(true);
    expect(DEMO_ENTITY_FIXTURES.map(({ assetKeys }) => assetKeys.length)).toEqual([5, 3, 4]);
    expect(new Set(DEMO_ENTITY_FIXTURES.flatMap(({ assetKeys }) => assetKeys)).size).toBe(12);

    const assetsByKey = new Map(DEMO_ASSET_FIXTURES.map((fixture) => [fixture.key, fixture]));
    for (const entity of DEMO_ENTITY_FIXTURES) {
      const assets = entity.assetKeys.map((key) => {
        const asset = assetsByKey.get(key);
        if (!asset) throw new Error(`Entity fixture references an unknown canonical asset: ${key}.`);
        return asset;
      });
      expect(entity.coverAssetKey).toBe(entity.assetKeys[0]);
      for (const [index, asset] of assets.entries()) {
        expect(readImageDimensions(asset.fileName)).toEqual({ width: asset.width, height: asset.height });
        const ordinal = String(index + 1).padStart(2, "0");
        expect(asset.fileName).toContain(`-${ordinal}-`);
        expect(asset.displayName).toMatch(new RegExp(`^${entity.name}_${ordinal}_`));
      }
    }
  });
});
