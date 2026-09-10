import { describe, expect, it } from "vitest";

import { DEMO_ASSET_FIXTURES, DEMO_ENTITY_FIXTURES } from "../../config/entity-demo-fixtures";
import { DEMO_MEDIA_FIXTURES } from "../../config/media-demo-fixtures";
import { createExperienceAssetFixtures } from "./experience-fixtures";

describe("published experience asset fixtures", () => {
  it("projects the selected characters, twelve images and four audio/video examples", () => {
    const snapshot = createExperienceAssetFixtures("workspace-experience");
    expect(snapshot.media).toHaveLength(16);
    expect(snapshot.entities.map((entity) => [entity.name, entity.mediaRefs.length])).toEqual([
      ["幽影", 5], ["白汐", 3], ["玄翎", 4],
    ]);
    expect(new Set(snapshot.entities.flatMap((entity) => entity.mediaRefs.map((ref) => ref.assetId))))
      .toEqual(new Set(snapshot.media.filter((asset) => asset.mediaKind === "image").map((asset) => asset.id)));
    for (const [index, fixture] of DEMO_ASSET_FIXTURES.entries()) {
      expect(snapshot.media[index]).toMatchObject({
        id: `experience-${fixture.staticMediaId}`,
        workspaceId: "workspace-experience",
        displayName: fixture.displayName,
        byteSize: fixture.goldenByteSize,
        checksumSha256: fixture.goldenChecksumSha256,
        contentUrl: `/assets/home/${fixture.fileName}`,
      });
    }
    for (const fixture of DEMO_MEDIA_FIXTURES) {
      expect(snapshot.media.find((asset) => asset.id === `experience-media-${fixture.key}`)).toMatchObject({
        mediaKind: fixture.mediaKind,
        displayName: fixture.displayName,
        contentType: fixture.contentType,
        byteSize: fixture.goldenByteSize,
        checksumSha256: fixture.goldenChecksumSha256,
        contentUrl: `/assets/experience-media/${fixture.fileName}`,
      });
    }
    for (const entity of snapshot.entities) {
      expect(entity.coverAssetId).toBe(entity.mediaRefs[0]?.assetId);
      expect(entity.mediaRefs.map((ref) => ref.order)).toEqual(entity.mediaRefs.map((_, index) => index));
    }
    const published = JSON.stringify({ snapshot, DEMO_ASSET_FIXTURES, DEMO_ENTITY_FIXTURES });
    expect(published).not.toMatch(/actor-tianmaochao|workspace-organization-reelay|project-perfume-tvc|createIdempotencyKey|objectKey|reelay-demo|mist-courier|obsidian-probe|password|session/i);
  });

  it("keeps host identities separate from every page-local identity and references closed", () => {
    const snapshot = createExperienceAssetFixtures("workspace-experience");
    const staticIds = new Set([
      ...DEMO_ASSET_FIXTURES.map((fixture) => fixture.staticMediaId),
      ...DEMO_ENTITY_FIXTURES.map((fixture) => fixture.staticEntityId),
    ]);
    const hostIds = [...snapshot.media.map((asset) => asset.id), ...snapshot.entities.map((entity) => entity.id)];
    expect(new Set(hostIds).size).toBe(19);
    expect(hostIds.every((id) => id.startsWith("experience-") && !staticIds.has(id))).toBe(true);
    const mediaIds = new Set(snapshot.media.map((asset) => asset.id));
    for (const entity of snapshot.entities) {
      expect(entity.mediaRefs.every((ref) => mediaIds.has(ref.assetId))).toBe(true);
      expect(mediaIds.has(entity.coverAssetId!)).toBe(true);
      expect(entity.mediaRefs.some((ref) => ref.assetId === entity.coverAssetId)).toBe(true);
    }
    expect(new Set(snapshot.entities.flatMap((entity) => entity.mediaRefs.map((ref) => ref.assetId))))
      .toEqual(new Set(snapshot.media.filter((asset) => asset.mediaKind === "image").map((asset) => asset.id)));
  });

  it("creates independent records and nested references for every page", () => {
    const first = createExperienceAssetFixtures("workspace-first");
    const second = createExperienceAssetFixtures("workspace-second");
    first.media[0]!.displayName = "changed";
    first.entities[0]!.mediaRefs[0]!.assetId = "changed";
    first.entities[0]!.name = "changed";
    expect(second.media[0]!.displayName).toBe(DEMO_ASSET_FIXTURES[0]!.displayName);
    expect(second.entities[0]!.mediaRefs[0]!.assetId).toBe(`experience-${DEMO_ASSET_FIXTURES[0]!.staticMediaId}`);
    expect(second.entities[0]!.name).toBe(DEMO_ENTITY_FIXTURES[0]!.name);
    expect(createExperienceAssetFixtures("workspace-first").media[0]!.displayName).not.toBe("changed");
  });
});
