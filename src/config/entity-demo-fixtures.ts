/** Deliberately published examples, independent of account and database identities. */
export interface EntityDemoAssetFixture {
  key: string;
  staticMediaId: string;
  fileName: string;
  displayName: string;
  mediaKind: "image";
  contentType: string;
  width: number;
  height: number;
  goldenByteSize: number;
  goldenChecksumSha256: string;
}

export interface EntityDemoFixture {
  key: string;
  staticEntityId: string;
  name: string;
  description: string;
  assetKeys: readonly string[];
  coverAssetKey: string;
}

export const DEMO_ASSET_FIXTURES: readonly EntityDemoAssetFixture[] = [
  {
    key: "umbra-key-art",
    staticMediaId: "media-personal-umbra-key-art",
    fileName: "entity-umbra-01-key-art-v4.jpg",
    displayName: "幽影_01_角色主视觉.jpg",
    mediaKind: "image",
    contentType: "image/jpeg",
    width: 1500,
    height: 1924,
    goldenByteSize: 332_365,
    goldenChecksumSha256: "17889c79d1f9ba22f58f4c6985abc97e4f6eb2764f0b368e012a802c8a25e38e",
  },
  {
    key: "umbra-character-sheet",
    staticMediaId: "media-personal-umbra-character-sheet",
    fileName: "entity-umbra-02-character-sheet-v4.png",
    displayName: "幽影_02_角色多视图.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 2048,
    height: 1152,
    goldenByteSize: 3_256_959,
    goldenChecksumSha256: "0b469a7ebc88e55f0501e3cd97601879211c9ba6a9c9418e0332970293373921",
  },
  {
    key: "umbra-concept-sketches",
    staticMediaId: "media-personal-umbra-concept-sketches",
    fileName: "entity-umbra-03-concept-sketches-v4.jpg",
    displayName: "幽影_03_概念草图.jpg",
    mediaKind: "image",
    contentType: "image/jpeg",
    width: 1920,
    height: 831,
    goldenByteSize: 198_380,
    goldenChecksumSha256: "4def5efb61340407001f8afa1750f0666eb036c3df449117638d535c0b27fb7b",
  },
  {
    key: "umbra-chain-blades",
    staticMediaId: "media-personal-umbra-chain-blades",
    fileName: "entity-umbra-04-chain-blades-v4.png",
    displayName: "幽影_04_链刃武器设定.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 2048,
    height: 1152,
    goldenByteSize: 1_746_841,
    goldenChecksumSha256: "d504da1c11cdba6d60c6c769d82a48629257b39443b9ef342a4f28d07e1a6db7",
  },
  {
    key: "umbra-energy-shield",
    staticMediaId: "media-personal-umbra-energy-shield",
    fileName: "entity-umbra-05-energy-shield-v4.png",
    displayName: "幽影_05_能量护盾特效.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 2048,
    height: 1152,
    goldenByteSize: 2_704_102,
    goldenChecksumSha256: "286b859fce573a52b948dfc7503a71ad4ed9d6cb2a548fddaf4bafbbb2700c27",
  },
  {
    key: "baixi-portrait",
    staticMediaId: "media-personal-baixi-portrait",
    fileName: "entity-baixi-01-portrait-v4.png",
    displayName: "白汐_01_角色肖像.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1122,
    height: 1402,
    goldenByteSize: 2_173_837,
    goldenChecksumSha256: "48675a5fd4683fb8d4a37e6a18b9fefaaf5d54564a47e5b9397c271684e0cbf7",
  },
  {
    key: "baixi-turnaround",
    staticMediaId: "media-personal-baixi-turnaround",
    fileName: "entity-baixi-02-turnaround-v4.png",
    displayName: "白汐_02_角色三视图.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1448,
    height: 1086,
    goldenByteSize: 2_019_252,
    goldenChecksumSha256: "ebf455c7dc07e6a4dcbe153ad93e1527d0ffcecbb7727aeba0397edb2e144649",
  },
  {
    key: "baixi-equipment",
    staticMediaId: "media-personal-baixi-equipment",
    fileName: "entity-baixi-03-equipment-v4.png",
    displayName: "白汐_03_随身装备设定.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1122,
    height: 1402,
    goldenByteSize: 2_017_911,
    goldenChecksumSha256: "a86725932c4a020d5fb4ea205f9420f3a93b1ee4760582340e336c75d33c39a3",
  },
  {
    key: "xuanling-key-art",
    staticMediaId: "media-personal-xuanling-key-art",
    fileName: "entity-xuanling-01-key-art-v4.png",
    displayName: "玄翎_01_角色主视觉.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 941,
    height: 1672,
    goldenByteSize: 2_564_775,
    goldenChecksumSha256: "ccde25e3d1f1286962fbefd2aab73b49b8f9515ca76f57386c76ae44bab4ecec",
  },
  {
    key: "xuanling-character-sheet",
    staticMediaId: "media-personal-xuanling-character-sheet",
    fileName: "entity-xuanling-02-character-sheet-v4.png",
    displayName: "玄翎_02_角色多视图.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1672,
    height: 941,
    goldenByteSize: 2_402_245,
    goldenChecksumSha256: "90e5b65f9a5030b50e0f54c982d72f0298bd51aa67cef3ee9da9b76317bef1f4",
  },
  {
    key: "xuanling-costume-variations",
    staticMediaId: "media-personal-xuanling-costume-variations",
    fileName: "entity-xuanling-03-costume-variations-v4.png",
    displayName: "玄翎_03_服装造型变体.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1122,
    height: 1402,
    goldenByteSize: 2_807_541,
    goldenChecksumSha256: "f2223f18e2a81310c419a3fd27de44f867404ccfce3ac3507ab1ffafa5ede9fe",
  },
  {
    key: "xuanling-equipment",
    staticMediaId: "media-personal-xuanling-equipment",
    fileName: "entity-xuanling-04-equipment-v4.png",
    displayName: "玄翎_04_武器装备设定.png",
    mediaKind: "image",
    contentType: "image/png",
    width: 1122,
    height: 1402,
    goldenByteSize: 2_241_266,
    goldenChecksumSha256: "988d8dc144b80031dea204b183f30477183c7d6138368c3dd44d8caf88af6a4d",
  },
] as const;

export const DEMO_ENTITY_FIXTURES: readonly EntityDemoFixture[] = [
  {
    key: "umbra",
    staticEntityId: "entity-personal-umbra",
    name: "幽影",
    description: "紫色兜帽与青色能量面甲的幽影战士；收录角色主视觉、多视图、概念草图、链刃武器与能量护盾设定。",
    assetKeys: ["umbra-key-art", "umbra-character-sheet", "umbra-concept-sketches", "umbra-chain-blades", "umbra-energy-shield"],
    coverAssetKey: "umbra-key-art",
  },
  {
    key: "baixi",
    staticEntityId: "entity-personal-baixi",
    name: "白汐",
    description: "身着白色机能外套的短发探索者，以薄荷绿与橙色细节为识别特征；收录肖像、三视图与随身装备。",
    assetKeys: ["baixi-portrait", "baixi-turnaround", "baixi-equipment"],
    coverAssetKey: "baixi-portrait",
  },
  {
    key: "xuanling",
    staticEntityId: "entity-personal-xuanling",
    name: "玄翎",
    description: "穿行巨构遗迹的黑白金配色剑士，以长剑、束发与飘带构成角色轮廓；收录主视觉、多视图、服装变体与武器装备。",
    assetKeys: ["xuanling-key-art", "xuanling-character-sheet", "xuanling-costume-variations", "xuanling-equipment"],
    coverAssetKey: "xuanling-key-art",
  },
] as const;
