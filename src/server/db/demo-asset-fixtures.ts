import type { MediaKind } from "../../domain/asset/workspace-media-asset";

export const DEMO_ACTOR_ID = "actor-tianmaochao";
export const DEMO_WORKSPACE_ID = "workspace-organization-reelay";
export const DEMO_PROJECT_ID = "project-perfume-tvc";

const CURRENT_ASSET_FIXTURE_VERSION = "entity-library-v3";
const PREVIOUS_ASSET_FIXTURE_VERSION = "entity-library-v2";
const LEGACY_ASSET_FIXTURE_VERSION = "image2-v1";

const MIST_COURIER_CREATE_KEY = "reelay-demo-image2-v1-entity-crimson-mist-perfumer";
const OBSIDIAN_PROBE_CREATE_KEY = "reelay-demo-image2-v1-entity-aureate-fragrance-core";

export interface DemoAssetFixture {
  key: string;
  staticMediaId: string;
  fileName: string;
  displayName: string;
  mediaKind: MediaKind;
  contentType: string;
  width?: number;
  height?: number;
  duration?: number;
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
    fileName: "entity-mist-courier-cover-v3.webp",
    displayName: "雾森信使_林溪主视觉.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1600,
    height: 900,
    goldenByteSize: 202_908,
    goldenChecksumSha256: "3edafc44748a328f1c5bf133194e93d69b584efe95dcccba1b29c5170aa9706a",
  },
  {
    key: "mist-courier-vertical",
    staticMediaId: "media-personal-mist-courier-vertical",
    fileName: "entity-mist-courier-vertical-v3.webp",
    displayName: "雾森信使_路标全身.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 900,
    height: 1600,
    goldenByteSize: 310_540,
    goldenChecksumSha256: "32f4dff5fe4b7491ddc526e05460ed155a521139d5b0384f7e19180596e4ff30",
  },
  {
    key: "mist-courier-portrait",
    staticMediaId: "media-personal-mist-courier-portrait",
    fileName: "entity-mist-courier-portrait-v3.webp",
    displayName: "雾森信使_罗盘近景.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1080,
    height: 1440,
    goldenByteSize: 217_116,
    goldenChecksumSha256: "1d121faec318744371792ad00024cf5b8eb7d4a4ad4163bd24e53286a39fe66c",
  },
  {
    key: "mist-courier-gear",
    staticMediaId: "media-personal-mist-courier-gear",
    fileName: "entity-mist-courier-gear-v3.webp",
    displayName: "雾森信使_装备细节.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1200,
    height: 1200,
    goldenByteSize: 266_542,
    goldenChecksumSha256: "d14716c5aa5428bd4ddb49b2f83d4d7922a613ceffe7c9a68c65c77e3c11406d",
  },
  {
    key: "mist-courier-action",
    staticMediaId: "media-personal-mist-courier-action",
    fileName: "entity-mist-courier-action-v3.webp",
    displayName: "雾森信使_林间投递.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1440,
    height: 1080,
    goldenByteSize: 340_036,
    goldenChecksumSha256: "9b4aa12b84b6c55130d98455afcda609814889f42c9c65d3ba438ad843ab15a7",
  },
  {
    key: "mist-courier-ambience",
    staticMediaId: "media-personal-mist-courier-ambience",
    fileName: "entity-mist-courier-ambience-v3.mp3",
    displayName: "雾森信使_林径声景.mp3",
    mediaKind: "audio",
    contentType: "audio/mpeg",
    duration: 10,
    goldenByteSize: 201_165,
    goldenChecksumSha256: "26d760897bdac807aacc7f854bf76aca019e53cca190c59b81228aac191ed2cf",
  },
  {
    key: "obsidian-probe-cover",
    staticMediaId: "media-personal-obsidian-probe-cover",
    fileName: "entity-obsidian-probe-cover-v3.webp",
    displayName: "曜石勘探体_遗迹勘探.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1600,
    height: 900,
    goldenByteSize: 238_706,
    goldenChecksumSha256: "fc55638c77240dfc3e3eea5765f5fa62c59eb8960f023ac24bb81f10a07f40bf",
  },
  {
    key: "obsidian-probe-vertical",
    staticMediaId: "media-personal-obsidian-probe-vertical",
    fileName: "entity-obsidian-probe-vertical-v3.webp",
    displayName: "曜石勘探体_升降井全机.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 900,
    height: 1600,
    goldenByteSize: 211_610,
    goldenChecksumSha256: "d770fc9f19c1be3d1e9f011518761d9cdee24d5ed80cb1b2f8015d742fcfc250",
  },
  {
    key: "obsidian-probe-detail",
    staticMediaId: "media-personal-obsidian-probe-detail",
    fileName: "entity-obsidian-probe-identity-v3.webp",
    displayName: "曜石勘探体_结构锚点.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1200,
    height: 1200,
    goldenByteSize: 128_914,
    goldenChecksumSha256: "0768dcbb0463e64c9b67cfb2329a74f6b96a4f4fbdddf3a8f042c792c33aee5e",
  },
  {
    key: "obsidian-probe-profile",
    staticMediaId: "media-personal-obsidian-probe-profile",
    fileName: "entity-obsidian-probe-optics-v3.webp",
    displayName: "曜石勘探体_光学核心.webp",
    mediaKind: "image",
    contentType: "image/webp",
    width: 1440,
    height: 1080,
    goldenByteSize: 191_194,
    goldenChecksumSha256: "fd830dbecb0fb72a680497c3eb58fbabb14f7a2c6e04d38692e6fc59ba778b19",
  },
  {
    key: "obsidian-probe-ambience",
    staticMediaId: "media-personal-obsidian-probe-ambience",
    fileName: "entity-obsidian-probe-ambience-v3.mp3",
    displayName: "曜石勘探体_扫描脉冲.mp3",
    mediaKind: "audio",
    contentType: "audio/mpeg",
    duration: 10,
    goldenByteSize: 201_165,
    goldenChecksumSha256: "b7382270e8067a59fa1281d1162a4b87bde9902a46ff3d8760c0219cbd7dd516",
  },
] as const;

// Keep these two creation slots stable so every fixture generation upgrades
// the same Entities in place instead of creating duplicate examples.
export const DEMO_ENTITY_FIXTURES: readonly DemoEntityFixture[] = [
  {
    key: "mist-courier",
    staticEntityId: "entity-personal-mist-courier",
    createIdempotencyKey: MIST_COURIER_CREATE_KEY,
    name: "雾森信使",
    description: "穿行古林与边境聚落的年轻信使；包含横版场景、9:16 全身、身份近景、装备与投递动作，并附林径声景。",
    assetKeys: [
      "mist-courier-cover",
      "mist-courier-vertical",
      "mist-courier-portrait",
      "mist-courier-gear",
      "mist-courier-action",
      "mist-courier-ambience",
    ],
    coverAssetKey: "mist-courier-cover",
  },
  {
    key: "obsidian-probe",
    staticEntityId: "entity-personal-obsidian-probe",
    createIdempotencyKey: OBSIDIAN_PROBE_CREATE_KEY,
    name: "曜石勘探体",
    description: "配备琥珀光学核心的六足勘探机械体；包含遗迹任务、9:16 全机、结构锚点、光学细节和扫描声景。",
    assetKeys: [
      "obsidian-probe-cover",
      "obsidian-probe-vertical",
      "obsidian-probe-detail",
      "obsidian-probe-profile",
      "obsidian-probe-ambience",
    ],
    coverAssetKey: "obsidian-probe-cover",
  },
] as const;

// v2 is a published historical generation. Its fingerprints are immutable so
// reconciliation can distinguish an untouched demo from user-edited content.
export const PREVIOUS_DEMO_ASSET_FIXTURES: readonly DemoAssetFixture[] = [
  {
    key: "mist-courier-cover",
    staticMediaId: "media-personal-mist-courier-cover",
    fileName: "entity-mist-courier-cover.png",
    displayName: "雾森信使_林溪主视觉.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1672,
    height: 941,
    goldenByteSize: 2_241_691,
    goldenChecksumSha256: "4c9e9957d25a6851eef518da5cb6c85bd7b9ccecd639fd604e662ca00552f8bd",
  },
  {
    key: "mist-courier-portrait",
    staticMediaId: "media-personal-mist-courier-portrait",
    fileName: "entity-mist-courier-portrait.png",
    displayName: "雾森信使_罗盘近景.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1086,
    height: 1448,
    goldenByteSize: 2_327_682,
    goldenChecksumSha256: "63bf72eaee5fb533d5f248e55c91b859b6cd89a871b52943c5ad6d928d7d8942",
  },
  {
    key: "mist-courier-gear",
    staticMediaId: "media-personal-mist-courier-gear",
    fileName: "entity-mist-courier-gear.png",
    displayName: "雾森信使_装备细节.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1254,
    height: 1254,
    goldenByteSize: 2_525_035,
    goldenChecksumSha256: "f65689157283502bbc0ae31fc2e22ca2fd22ca32f795e5242547d8cccdc4d09c",
  },
  {
    key: "obsidian-probe-cover",
    staticMediaId: "media-personal-obsidian-probe-cover",
    fileName: "entity-obsidian-probe-cover.png",
    displayName: "曜石勘探体_雨夜主视觉.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1672,
    height: 941,
    goldenByteSize: 1_934_775,
    goldenChecksumSha256: "23bece3fdff997309813550a257be2229b9f97c88a0a6f50d4c66a771ce54dc9",
  },
  {
    key: "obsidian-probe-detail",
    staticMediaId: "media-personal-obsidian-probe-detail",
    fileName: "entity-obsidian-probe-detail.png",
    displayName: "曜石勘探体_结构资料.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1254,
    height: 1254,
    goldenByteSize: 2_072_248,
    goldenChecksumSha256: "b5003d6ca703141d2e15298106b15ef47718f1f9c6c24f9f6ff84f47fbcf3f6e",
  },
  {
    key: "obsidian-probe-profile",
    staticMediaId: "media-personal-obsidian-probe-profile",
    fileName: "entity-obsidian-probe-profile.png",
    displayName: "曜石勘探体_侧视结构.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1448,
    height: 1086,
    goldenByteSize: 1_937_868,
    goldenChecksumSha256: "8b0b930bf9c5ba14d168d92a98b8bd27a7c628d2b9833b2c4b56183d39bfe34c",
  },
] as const;

export const PREVIOUS_DEMO_ENTITY_FIXTURES: readonly DemoEntityFixture[] = [
  {
    key: "mist-courier-v2",
    staticEntityId: "entity-personal-mist-courier",
    createIdempotencyKey: MIST_COURIER_CREATE_KEY,
    name: "雾森信使",
    description: "往返古林与边境聚落的年轻信使，熟悉隐蔽林径与旧路标。",
    assetKeys: ["mist-courier-cover", "mist-courier-portrait", "mist-courier-gear"],
    coverAssetKey: "mist-courier-cover",
  },
  {
    key: "obsidian-probe-v2",
    staticEntityId: "entity-personal-obsidian-probe",
    createIdempotencyKey: OBSIDIAN_PROBE_CREATE_KEY,
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
    mediaKind: "image",
    contentType: "image/png",
    goldenByteSize: 1_881_212,
    goldenChecksumSha256: "ffd8d8e39254d43f07549bf999f27523ea4f129cf7f154fa5dd12752b5995cc4",
  },
  {
    key: "crimson-mist-portrait",
    staticMediaId: "legacy-crimson-mist-portrait",
    fileName: "entity-crimson-mist-portrait.png",
    displayName: "绯雾调香师_竖版肖像.png",
    mediaKind: "image",
    contentType: "image/png",
    goldenByteSize: 2_028_486,
    goldenChecksumSha256: "d0a723cc67f9790424b4f970cce5e42943aa9743689d3a9655e0f01fd3888585",
  },
  {
    key: "crimson-mist-detail",
    staticMediaId: "legacy-crimson-mist-detail",
    fileName: "entity-crimson-mist-detail.png",
    displayName: "绯雾调香师_香氛细节.png",
    mediaKind: "image",
    contentType: "image/png",
    goldenByteSize: 1_946_682,
    goldenChecksumSha256: "1d329fbd187219fb2a056a3e36d4fd5f68e139b85f1533ca0129c21f40a5083f",
  },
  {
    key: "aureate-core-cover",
    staticMediaId: "legacy-aureate-core-cover",
    fileName: "entity-aureate-core-cover.png",
    displayName: "曜金香氛核心_方形封面.png",
    mediaKind: "image",
    contentType: "image/png",
    goldenByteSize: 1_710_774,
    goldenChecksumSha256: "b6c7d681f7ff1e8c8938fe54f8eb8fd19a363b7e0f99dda8b273c96e2f9e83e5",
  },
  {
    key: "aureate-core-profile",
    staticMediaId: "legacy-aureate-core-profile",
    fileName: "entity-aureate-core-profile.png",
    displayName: "曜金香氛核心_横版产品图.png",
    mediaKind: "image",
    contentType: "image/png",
    goldenByteSize: 1_634_268,
    goldenChecksumSha256: "5d03e9f49b7a011a68a5ed6675c7429d28755fdcf0eef7495f553b4a747e3825",
  },
  {
    key: "aureate-core-vertical",
    staticMediaId: "legacy-aureate-core-vertical",
    fileName: "entity-aureate-core-vertical.png",
    displayName: "曜金香氛核心_竖版广告.png",
    mediaKind: "image",
    contentType: "image/png",
    goldenByteSize: 1_635_620,
    goldenChecksumSha256: "fe734a82c7e1df5d01977e5fe6ae2cefd1f81e053ef2bb93401fe1cb83ff1480",
  },
] as const;

export const LEGACY_DEMO_ENTITY_FIXTURES: readonly DemoEntityFixture[] = [
  {
    key: "crimson-mist-perfumer",
    staticEntityId: "legacy-crimson-mist-perfumer",
    createIdempotencyKey: MIST_COURIER_CREATE_KEY,
    name: "绯雾调香师",
    description: "未来香氛实验室中的品牌调香师；含横版设定、竖版肖像与方形细节素材。",
    assetKeys: ["crimson-mist-cover", "crimson-mist-portrait", "crimson-mist-detail"],
    coverAssetKey: "crimson-mist-cover",
  },
  {
    key: "aureate-fragrance-core",
    staticEntityId: "legacy-aureate-fragrance-core",
    createIdempotencyKey: OBSIDIAN_PROBE_CREATE_KEY,
    name: "曜金香氛核心",
    description: "黑金未来感香氛产品主体；含方形封面、横版产品图与竖版广告素材。",
    assetKeys: ["aureate-core-cover", "aureate-core-profile", "aureate-core-vertical"],
    coverAssetKey: "aureate-core-cover",
  },
] as const;

export function demoAssetIdempotencyKey(fixture: DemoAssetFixture): string {
  return `reelay-demo-${CURRENT_ASSET_FIXTURE_VERSION}-asset-${fixture.key}`;
}

export function previousDemoAssetIdempotencyKey(fixture: DemoAssetFixture): string {
  return `reelay-demo-${PREVIOUS_ASSET_FIXTURE_VERSION}-asset-${fixture.key}`;
}

export function legacyDemoAssetIdempotencyKey(fixture: DemoAssetFixture): string {
  return `reelay-demo-${LEGACY_ASSET_FIXTURE_VERSION}-asset-${fixture.key}`;
}
