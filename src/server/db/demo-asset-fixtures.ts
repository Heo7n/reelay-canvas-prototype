export const DEMO_ACTOR_ID = "actor-tianmaochao";
export const DEMO_WORKSPACE_ID = "workspace-organization-reelay";
export const DEMO_PROJECT_ID = "project-perfume-tvc";

const CANONICAL_ASSET_FIXTURE_VERSION = "entity-library-v2";
const LEGACY_ASSET_FIXTURE_VERSION = "image2-v1";

export interface DemoAssetFixture {
  key: string;
  staticMediaId: string;
  fileName: string;
  displayName: string;
  goldenByteSize?: number;
  goldenChecksumSha256?: string;
}

export interface DemoEntityFixture {
  key: string;
  staticEntityId: string;
  createIdempotencyKey: string;
  name: string;
  description: string;
  assetKeys: readonly string[];
  coverAssetKey: string;
}

export const DEMO_ASSET_FIXTURES: readonly DemoAssetFixture[] = [
  {
    key: "mist-courier-cover",
    staticMediaId: "media-personal-mist-courier-cover",
    fileName: "entity-mist-courier-cover.png",
    displayName: "雾森信使_林溪主视觉.png",
  },
  {
    key: "mist-courier-portrait",
    staticMediaId: "media-personal-mist-courier-portrait",
    fileName: "entity-mist-courier-portrait.png",
    displayName: "雾森信使_罗盘近景.png",
  },
  {
    key: "mist-courier-gear",
    staticMediaId: "media-personal-mist-courier-gear",
    fileName: "entity-mist-courier-gear.png",
    displayName: "雾森信使_装备细节.png",
  },
  {
    key: "obsidian-probe-cover",
    staticMediaId: "media-personal-obsidian-probe-cover",
    fileName: "entity-obsidian-probe-cover.png",
    displayName: "曜石勘探体_雨夜主视觉.png",
  },
  {
    key: "obsidian-probe-detail",
    staticMediaId: "media-personal-obsidian-probe-detail",
    fileName: "entity-obsidian-probe-detail.png",
    displayName: "曜石勘探体_结构资料.png",
  },
  {
    key: "obsidian-probe-profile",
    staticMediaId: "media-personal-obsidian-probe-profile",
    fileName: "entity-obsidian-probe-profile.png",
    displayName: "曜石勘探体_侧视结构.png",
  },
] as const;

// Keep these two creation slots stable so an already-seeded database can be
// calibrated in place instead of gaining a second pair of demo Entities.
export const DEMO_ENTITY_FIXTURES: readonly DemoEntityFixture[] = [
  {
    key: "mist-courier",
    staticEntityId: "entity-personal-mist-courier",
    createIdempotencyKey: "reelay-demo-image2-v1-entity-crimson-mist-perfumer",
    name: "雾森信使",
    description: "往返古林与边境聚落的年轻信使，熟悉隐蔽林径与旧路标。",
    assetKeys: ["mist-courier-cover", "mist-courier-portrait", "mist-courier-gear"],
    coverAssetKey: "mist-courier-cover",
  },
  {
    key: "obsidian-probe",
    staticEntityId: "entity-personal-obsidian-probe",
    createIdempotencyKey: "reelay-demo-image2-v1-entity-aureate-fragrance-core",
    name: "曜石勘探体",
    description: "配备琥珀光学核心的多足勘探机械体，用于潮湿工业遗迹与低照度环境。",
    assetKeys: ["obsidian-probe-cover", "obsidian-probe-detail", "obsidian-probe-profile"],
    coverAssetKey: "obsidian-probe-cover",
  },
] as const;

export const LEGACY_DEMO_ASSET_FIXTURES: readonly DemoAssetFixture[] = [
  {
    key: "crimson-mist-cover",
    staticMediaId: "legacy-crimson-mist-cover",
    fileName: "entity-crimson-mist-cover.png",
    displayName: "绯雾调香师_横版设定.png",
    goldenByteSize: 1_881_212,
    goldenChecksumSha256: "ffd8d8e39254d43f07549bf999f27523ea4f129cf7f154fa5dd12752b5995cc4",
  },
  {
    key: "crimson-mist-portrait",
    staticMediaId: "legacy-crimson-mist-portrait",
    fileName: "entity-crimson-mist-portrait.png",
    displayName: "绯雾调香师_竖版肖像.png",
    goldenByteSize: 2_028_486,
    goldenChecksumSha256: "d0a723cc67f9790424b4f970cce5e42943aa9743689d3a9655e0f01fd3888585",
  },
  {
    key: "crimson-mist-detail",
    staticMediaId: "legacy-crimson-mist-detail",
    fileName: "entity-crimson-mist-detail.png",
    displayName: "绯雾调香师_香氛细节.png",
    goldenByteSize: 1_946_682,
    goldenChecksumSha256: "1d329fbd187219fb2a056a3e36d4fd5f68e139b85f1533ca0129c21f40a5083f",
  },
  {
    key: "aureate-core-cover",
    staticMediaId: "legacy-aureate-core-cover",
    fileName: "entity-aureate-core-cover.png",
    displayName: "曜金香氛核心_方形封面.png",
    goldenByteSize: 1_710_774,
    goldenChecksumSha256: "b6c7d681f7ff1e8c8938fe54f8eb8fd19a363b7e0f99dda8b273c96e2f9e83e5",
  },
  {
    key: "aureate-core-profile",
    staticMediaId: "legacy-aureate-core-profile",
    fileName: "entity-aureate-core-profile.png",
    displayName: "曜金香氛核心_横版产品图.png",
    goldenByteSize: 1_634_268,
    goldenChecksumSha256: "5d03e9f49b7a011a68a5ed6675c7429d28755fdcf0eef7495f553b4a747e3825",
  },
  {
    key: "aureate-core-vertical",
    staticMediaId: "legacy-aureate-core-vertical",
    fileName: "entity-aureate-core-vertical.png",
    displayName: "曜金香氛核心_竖版广告.png",
    goldenByteSize: 1_635_620,
    goldenChecksumSha256: "fe734a82c7e1df5d01977e5fe6ae2cefd1f81e053ef2bb93401fe1cb83ff1480",
  },
] as const;

export const LEGACY_DEMO_ENTITY_FIXTURES: readonly DemoEntityFixture[] = [
  {
    key: "crimson-mist-perfumer",
    staticEntityId: "legacy-crimson-mist-perfumer",
    createIdempotencyKey: DEMO_ENTITY_FIXTURES[0].createIdempotencyKey,
    name: "绯雾调香师",
    description: "未来香氛实验室中的品牌调香师；含横版设定、竖版肖像与方形细节素材。",
    assetKeys: ["crimson-mist-cover", "crimson-mist-portrait", "crimson-mist-detail"],
    coverAssetKey: "crimson-mist-cover",
  },
  {
    key: "aureate-fragrance-core",
    staticEntityId: "legacy-aureate-fragrance-core",
    createIdempotencyKey: DEMO_ENTITY_FIXTURES[1].createIdempotencyKey,
    name: "曜金香氛核心",
    description: "黑金未来感香氛产品主体；含方形封面、横版产品图与竖版广告素材。",
    assetKeys: ["aureate-core-cover", "aureate-core-profile", "aureate-core-vertical"],
    coverAssetKey: "aureate-core-cover",
  },
] as const;

export function demoAssetIdempotencyKey(fixture: DemoAssetFixture): string {
  return `reelay-demo-${CANONICAL_ASSET_FIXTURE_VERSION}-asset-${fixture.key}`;
}

export function legacyDemoAssetIdempotencyKey(fixture: DemoAssetFixture): string {
  return `reelay-demo-${LEGACY_ASSET_FIXTURE_VERSION}-asset-${fixture.key}`;
}
