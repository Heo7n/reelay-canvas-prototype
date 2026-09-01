import { describe, expect, it } from "vitest";

import { normalizeEntityContent } from "./entity";

describe("Entity content invariant", () => {
  it("normalizes text and preserves the first occurrence order of unique media references", () => {
    expect(normalizeEntityContent({
      name: "  莉瑞尔  ",
      description: "  精灵感角色  ",
      mediaAssetIds: ["asset-front", "asset-voice", "asset-front"],
      coverMediaId: "asset-front",
    })).toEqual({
      name: "莉瑞尔",
      description: "精灵感角色",
      mediaRefs: [
        { mediaAssetId: "asset-front", order: 0 },
        { mediaAssetId: "asset-voice", order: 1 },
      ],
      coverMediaId: "asset-front",
    });
  });

  it("requires at least one media reference and keeps the cover inside the reference set", () => {
    expect(() => normalizeEntityContent({
      name: "空主体",
      mediaAssetIds: [],
    })).toThrowError(expect.objectContaining({ reason: "media_required" }));

    expect(() => normalizeEntityContent({
      name: "错误封面",
      mediaAssetIds: ["asset-front"],
      coverMediaId: "asset-missing",
    })).toThrowError(expect.objectContaining({ reason: "cover_not_referenced" }));
  });
});
