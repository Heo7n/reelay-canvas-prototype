import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { WorkspaceEntity } from "../../domain/asset/entity";
import type { WorkspaceMediaAsset } from "../../domain/asset/workspace-media-asset";
import type { EntityStore } from "../application/EntityStore";
import type { ObjectStore } from "../application/ObjectStore";
import type { ProjectAssetReferenceStore } from "../application/ProjectAssetReferenceStore";
import type { WorkspaceMediaAssetStore } from "../application/WorkspaceMediaAssetStore";

const DEMO_ACTOR_ID = "actor-tianmaochao";
const DEMO_WORKSPACE_ID = "workspace-organization-reelay";
const DEMO_PROJECT_ID = "project-perfume-tvc";
const FIXTURE_VERSION = "image2-v1";

interface DemoAssetFixture {
  key: string;
  fileName: string;
  displayName: string;
}

interface DemoEntityFixture {
  key: string;
  name: string;
  description: string;
  assetKeys: readonly string[];
  coverAssetKey: string;
}

export const DEMO_ASSET_FIXTURES: readonly DemoAssetFixture[] = [
  {
    key: "crimson-mist-cover",
    fileName: "entity-crimson-mist-cover.png",
    displayName: "绯雾调香师_横版设定.png",
  },
  {
    key: "crimson-mist-portrait",
    fileName: "entity-crimson-mist-portrait.png",
    displayName: "绯雾调香师_竖版肖像.png",
  },
  {
    key: "crimson-mist-detail",
    fileName: "entity-crimson-mist-detail.png",
    displayName: "绯雾调香师_香氛细节.png",
  },
  {
    key: "aureate-core-cover",
    fileName: "entity-aureate-core-cover.png",
    displayName: "曜金香氛核心_方形封面.png",
  },
  {
    key: "aureate-core-profile",
    fileName: "entity-aureate-core-profile.png",
    displayName: "曜金香氛核心_横版产品图.png",
  },
  {
    key: "aureate-core-vertical",
    fileName: "entity-aureate-core-vertical.png",
    displayName: "曜金香氛核心_竖版广告.png",
  },
] as const;

export const DEMO_ENTITY_FIXTURES: readonly DemoEntityFixture[] = [
  {
    key: "crimson-mist-perfumer",
    name: "绯雾调香师",
    description: "未来香氛实验室中的品牌调香师；含横版设定、竖版肖像与方形细节素材。",
    assetKeys: ["crimson-mist-cover", "crimson-mist-portrait", "crimson-mist-detail"],
    coverAssetKey: "crimson-mist-cover",
  },
  {
    key: "aureate-fragrance-core",
    name: "曜金香氛核心",
    description: "黑金未来感香氛产品主体；含方形封面、横版产品图与竖版广告素材。",
    assetKeys: ["aureate-core-cover", "aureate-core-profile", "aureate-core-vertical"],
    coverAssetKey: "aureate-core-cover",
  },
] as const;

export interface DemoAssetSeedDependencies {
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

async function seedAsset(
  dependencies: DemoAssetSeedDependencies,
  fixture: DemoAssetFixture,
): Promise<WorkspaceMediaAsset> {
  const body = await readFile(fixtureUrl(fixture.fileName));
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const intent = await dependencies.assetStore.createUploadIntent({
    actorId: DEMO_ACTOR_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    idempotencyKey: `reelay-demo-${FIXTURE_VERSION}-asset-${fixture.key}`,
    mediaKind: "image",
    displayName: fixture.displayName,
    contentType: "image/png",
    byteSize: body.byteLength,
    checksumSha256,
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
  const assets: WorkspaceMediaAsset[] = [];
  const assetsByKey = new Map<string, WorkspaceMediaAsset>();
  for (const fixture of DEMO_ASSET_FIXTURES) {
    const asset = await seedAsset(dependencies, fixture);
    assets.push(asset);
    assetsByKey.set(fixture.key, asset);
  }

  const entities: WorkspaceEntity[] = [];
  for (const fixture of DEMO_ENTITY_FIXTURES) {
    const mediaAssets = fixture.assetKeys.map((key) => requireAsset(assetsByKey, key));
    const coverAsset = requireAsset(assetsByKey, fixture.coverAssetKey);
    entities.push(await dependencies.entityStore.createPersonalEntity({
      actorId: DEMO_ACTOR_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      idempotencyKey: `reelay-demo-${FIXTURE_VERSION}-entity-${fixture.key}`,
      name: fixture.name,
      description: fixture.description,
      mediaAssetIds: mediaAssets.map(({ id }) => id),
      coverMediaId: coverAsset.id,
    }));
  }

  return { assets, entities };
}
