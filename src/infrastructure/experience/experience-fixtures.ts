import type { WorkspaceEntity } from "../../application/assets/EntityRepository";
import type { PersonalMediaAsset } from "../../application/assets/MediaAssetRepository";
import { DEMO_ASSET_FIXTURES, DEMO_ENTITY_FIXTURES } from "../../config/entity-demo-fixtures";
import { DEMO_MEDIA_FIXTURES } from "../../config/media-demo-fixtures";

const SNAPSHOT_TIMESTAMP = "2026-09-07T00:00:00.000Z";

/** A new page owns new records; only explicitly published example files are shared. */
export function createExperienceAssetFixtures(workspaceId: string): {
  media: PersonalMediaAsset[];
  entities: WorkspaceEntity[];
} {
  // Host-owned records must not collide with the legacy page-local demo records.
  const mediaIds = new Map(DEMO_ASSET_FIXTURES.map((asset) => [asset.key, `experience-${asset.staticMediaId}`]));
  const mediaId = (key: string): string => {
    const id = mediaIds.get(key);
    if (!id) throw new Error(`Unknown experience example: ${key}.`);
    return id;
  };
  return {
    media: [...DEMO_ASSET_FIXTURES.map((fixture) => ({
      id: mediaId(fixture.key),
      workspaceId,
      mediaKind: fixture.mediaKind,
      displayName: fixture.displayName,
      objectVersion: 1,
      contentType: fixture.contentType,
      byteSize: fixture.goldenByteSize,
      checksumSha256: fixture.goldenChecksumSha256,
      contentUrl: `/assets/home/${fixture.fileName}`,
      createdAt: SNAPSHOT_TIMESTAMP,
      updatedAt: SNAPSHOT_TIMESTAMP,
    })), ...DEMO_MEDIA_FIXTURES.map((fixture) => ({
      id: `experience-media-${fixture.key}`,
      workspaceId,
      mediaKind: fixture.mediaKind,
      displayName: fixture.displayName,
      objectVersion: 1,
      contentType: fixture.contentType,
      byteSize: fixture.goldenByteSize,
      checksumSha256: fixture.goldenChecksumSha256,
      contentUrl: `/assets/experience-media/${fixture.fileName}`,
      createdAt: SNAPSHOT_TIMESTAMP,
      updatedAt: SNAPSHOT_TIMESTAMP,
    }))],
    entities: DEMO_ENTITY_FIXTURES.map((fixture) => ({
      id: `experience-${fixture.staticEntityId}`,
      workspaceId,
      name: fixture.name,
      description: fixture.description,
      mediaRefs: fixture.assetKeys.map((key, order) => ({ assetId: mediaId(key), order })),
      coverAssetId: mediaId(fixture.coverAssetKey),
      version: 1,
      createdAt: SNAPSHOT_TIMESTAMP,
      updatedAt: SNAPSHOT_TIMESTAMP,
    })),
  };
}
