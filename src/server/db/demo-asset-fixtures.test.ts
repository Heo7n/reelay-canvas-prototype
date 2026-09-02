import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  DEMO_ASSET_FIXTURES,
  DEMO_ENTITY_FIXTURES,
  LEGACY_DEMO_ASSET_FIXTURES,
} from "./demo-asset-fixtures";

interface StaticMediaFixture {
  id: string;
  displayName: string;
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

describe("canonical demo asset fixtures", () => {
  it("stay identical to the personal Entity examples shown by the static file prototype", () => {
    const staticSeed = readStaticAssetLibrarySeed();
    const staticMediaById = new Map(staticSeed.media.map((media) => [media.id, media]));
    const staticEntitiesById = new Map(staticSeed.entities.map((entity) => [entity.id, entity]));

    for (const fixture of DEMO_ASSET_FIXTURES) {
      expect(staticMediaById.get(fixture.staticMediaId)).toEqual(expect.objectContaining({
        id: fixture.staticMediaId,
        displayName: fixture.displayName,
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

  it("keeps the published legacy media fingerprints stable for safe in-place detection", () => {
    for (const fixture of LEGACY_DEMO_ASSET_FIXTURES) {
      const filePath = fileURLToPath(new URL(`../../../assets/home/${fixture.fileName}`, import.meta.url));
      const body = readFileSync(filePath);
      expect(body.byteLength).toBe(fixture.goldenByteSize);
      expect(createHash("sha256").update(body).digest("hex")).toBe(fixture.goldenChecksumSha256);
    }
  });
});
