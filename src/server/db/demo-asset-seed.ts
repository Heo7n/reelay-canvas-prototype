import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

import type { WorkspaceEntity } from "../../domain/asset/entity";
import type { WorkspaceMediaAsset } from "../../domain/asset/workspace-media-asset";
import type { EntityStore } from "../application/EntityStore";
import type { ObjectStore } from "../application/ObjectStore";
import type { ProjectAssetReferenceStore } from "../application/ProjectAssetReferenceStore";
import type { WorkspaceMediaAssetStore } from "../application/WorkspaceMediaAssetStore";
import {
  assertDemoEntityFixturesCanBeReconciled,
  reconcileLegacyDemoEntities,
  retireUnreferencedLegacyDemoAssets,
  type ResolvedDemoAssetFixture,
} from "./demo-asset-fixture-reconciler";
import {
  DEMO_ACTOR_ID,
  DEMO_ASSET_FIXTURES,
  DEMO_ENTITY_FIXTURES,
  DEMO_PROJECT_ID,
  DEMO_WORKSPACE_ID,
  LEGACY_DEMO_ASSET_FIXTURES,
  demoAssetIdempotencyKey,
  legacyDemoAssetIdempotencyKey,
  type DemoAssetFixture,
} from "./demo-asset-fixtures";

export {
  DEMO_ASSET_FIXTURES,
  DEMO_ENTITY_FIXTURES,
  LEGACY_DEMO_ASSET_FIXTURES,
  LEGACY_DEMO_ENTITY_FIXTURES,
} from "./demo-asset-fixtures";
export { DemoAssetFixtureConflictError } from "./demo-asset-fixture-reconciler";

export interface DemoAssetSeedDependencies {
  pool: Pool;
  assetStore: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
  entityStore: EntityStore;
  objectStore: ObjectStore;
}

export interface DemoAssetSeedResult {
  assets: WorkspaceMediaAsset[];
  entities: WorkspaceEntity[];
}

function fixtureUrl(fileName: string): URL {
  return new URL(`../../../assets/home/${fileName}`, import.meta.url);
}

export async function resolveDemoAssetFixtures(
  fixtures: readonly DemoAssetFixture[],
  idempotencyKeyFor: (fixture: DemoAssetFixture) => string,
): Promise<ResolvedDemoAssetFixture[]> {
  return Promise.all(fixtures.map(async (fixture) => {
    const body = await readFile(fixtureUrl(fixture.fileName));
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    if (
      (fixture.goldenByteSize != null && body.byteLength !== fixture.goldenByteSize)
      || (fixture.goldenChecksumSha256 != null && checksumSha256 !== fixture.goldenChecksumSha256)
    ) {
      throw new Error(`Demo fixture file no longer matches its published fingerprint: ${fixture.fileName}.`);
    }
    return {
      ...fixture,
      idempotencyKey: idempotencyKeyFor(fixture),
      byteSize: body.byteLength,
      checksumSha256,
    };
  }));
}

async function seedAsset(
  dependencies: DemoAssetSeedDependencies,
  fixture: ResolvedDemoAssetFixture,
): Promise<WorkspaceMediaAsset> {
  const body = await readFile(fixtureUrl(fixture.fileName));
  const intent = await dependencies.assetStore.createUploadIntent({
    actorId: DEMO_ACTOR_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    idempotencyKey: fixture.idempotencyKey,
    mediaKind: "image",
    displayName: fixture.displayName,
    contentType: "image/png",
    byteSize: fixture.byteSize,
    checksumSha256: fixture.checksumSha256,
  });
  const stored = await dependencies.objectStore.putObject({
    objectKey: intent.objectKey,
    contentType: "image/png",
    body,
  });
  await dependencies.assetStore.recordUpload({
    actorId: DEMO_ACTOR_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    uploadIntentId: intent.id,
    objectKey: stored.objectKey,
    contentType: stored.contentType,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256,
    etag: stored.etag,
  });
  const asset = await dependencies.assetStore.finalizeUpload({
    actorId: DEMO_ACTOR_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    uploadIntentId: intent.id,
  });
  await dependencies.assetStore.attachAssetToProject({
    actorId: DEMO_ACTOR_ID,
    projectId: DEMO_PROJECT_ID,
    assetId: asset.id,
  });
  return asset;
}

function requireAsset(
  assetsByKey: ReadonlyMap<string, WorkspaceMediaAsset>,
  key: string,
): WorkspaceMediaAsset {
  const asset = assetsByKey.get(key);
  if (!asset) throw new Error(`Demo Entity fixture references an unknown asset key: ${key}.`);
  return asset;
}

export async function seedDemoAssetLibrary(
  dependencies: DemoAssetSeedDependencies,
): Promise<DemoAssetSeedResult> {
  const canonicalFixtureAssets = await resolveDemoAssetFixtures(
    DEMO_ASSET_FIXTURES,
    demoAssetIdempotencyKey,
  );
  const legacyFixtureAssets = await resolveDemoAssetFixtures(
    LEGACY_DEMO_ASSET_FIXTURES,
    legacyDemoAssetIdempotencyKey,
  );
  await assertDemoEntityFixturesCanBeReconciled(
    dependencies.pool,
    canonicalFixtureAssets,
    legacyFixtureAssets,
  );

  const assets: WorkspaceMediaAsset[] = [];
  const assetsByKey = new Map<string, WorkspaceMediaAsset>();
  for (const fixture of canonicalFixtureAssets) {
    const asset = await seedAsset(dependencies, fixture);
    assets.push(asset);
    assetsByKey.set(fixture.key, asset);
  }

  await reconcileLegacyDemoEntities(
    dependencies.pool,
    canonicalFixtureAssets,
    legacyFixtureAssets,
    assetsByKey,
  );

  const entities: WorkspaceEntity[] = [];
  for (const fixture of DEMO_ENTITY_FIXTURES) {
    const mediaAssets = fixture.assetKeys.map((key) => requireAsset(assetsByKey, key));
    const coverAsset = requireAsset(assetsByKey, fixture.coverAssetKey);
    entities.push(await dependencies.entityStore.createPersonalEntity({
      actorId: DEMO_ACTOR_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      idempotencyKey: fixture.createIdempotencyKey,
      name: fixture.name,
      description: fixture.description,
      mediaAssetIds: mediaAssets.map(({ id }) => id),
      coverMediaId: coverAsset.id,
    }));
  }

  await retireUnreferencedLegacyDemoAssets(dependencies.pool, legacyFixtureAssets);

  return { assets, entities };
}
