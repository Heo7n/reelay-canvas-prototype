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
} from "./demo-asset-fixtures";

interface StaticMediaFixture {
  id: string;
  displayName: string;
  mediaKind: "image" | "video" | "audio";
  type: "image" | "video" | "audio";
  contentType: string;
  url: string;
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

function readUint24LE(source: Buffer, offset: number): number {
  return source[offset]! | (source[offset + 1]! << 8) | (source[offset + 2]! << 16);
}

function readWebpDimensions(fileName: string): { width: number; height: number } {
  const filePath = fileURLToPath(new URL(`../../../assets/home/${fileName}`, import.meta.url));
  const body = readFileSync(filePath);
  expect(body.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(body.subarray(8, 12).toString("ascii")).toBe("WEBP");

  const chunkType = body.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8 ") {
    expect(body.subarray(23, 26)).toEqual(Buffer.from([0x9d, 0x01, 0x2a]));
    return {
      width: body.readUInt16LE(26) & 0x3fff,
      height: body.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunkType === "VP8L") {
    expect(body[20]).toBe(0x2f);
    const packed = body.readUInt32LE(21);
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
    };
  }
  if (chunkType === "VP8X") {
    return {
      width: readUint24LE(body, 24) + 1,
      height: readUint24LE(body, 27) + 1,
    };
  }
  throw new Error(`Unsupported WebP fixture encoding: ${fileName} (${chunkType}).`);
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

  it("keeps the published v1 and v2 media fingerprints stable for safe in-place detection", () => {
    for (const fixture of [...LEGACY_DEMO_ASSET_FIXTURES, ...PREVIOUS_DEMO_ASSET_FIXTURES]) {
      const filePath = fileURLToPath(new URL(`../../../assets/home/${fixture.fileName}`, import.meta.url));
      const body = readFileSync(filePath);
      expect(body.byteLength).toBe(fixture.goldenByteSize);
      expect(createHash("sha256").update(body).digest("hex")).toBe(fixture.goldenChecksumSha256);
    }
  });

  it("provides every Entity with landscape, exact 9:16, square, 4:3, and audio references", () => {
    expect(DEMO_ASSET_FIXTURES.filter(({ mediaKind }) => mediaKind === "image")).toHaveLength(9);
    expect(DEMO_ASSET_FIXTURES.filter(({ mediaKind }) => mediaKind === "audio")).toHaveLength(2);
    expect(DEMO_ENTITY_FIXTURES.map(({ assetKeys }) => assetKeys.length).sort()).toEqual([5, 6]);

    const assetsByKey = new Map(DEMO_ASSET_FIXTURES.map((fixture) => [fixture.key, fixture]));
    for (const entity of DEMO_ENTITY_FIXTURES) {
      const assets = entity.assetKeys.map((key) => {
        const asset = assetsByKey.get(key);
        if (!asset) throw new Error(`Entity fixture references an unknown canonical asset: ${key}.`);
        return asset;
      });
      const imageDimensions = assets
        .filter(({ mediaKind }) => mediaKind === "image")
        .map(({ fileName }) => readWebpDimensions(fileName));

      expect(assets.filter(({ mediaKind }) => mediaKind === "audio")).toHaveLength(1);
      expect(imageDimensions.some(({ width, height }) => width * 9 === height * 16)).toBe(true);
      expect(imageDimensions).toContainEqual({ width: 900, height: 1600 });
      expect(imageDimensions.some(({ width, height }) => width === height)).toBe(true);
      expect(imageDimensions.some(({ width, height }) => width * 3 === height * 4)).toBe(true);

      const cover = assetsByKey.get(entity.coverAssetKey);
      expect(cover?.mediaKind).toBe("image");
    }
  });
});
