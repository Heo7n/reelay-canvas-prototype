/** Explicitly published motion/audio examples; no account or database identity. */
export interface MediaDemoFixture {
  key: string;
  fileName: string;
  displayName: string;
  mediaKind: "video" | "audio";
  contentType: string;
  goldenByteSize: number;
  goldenChecksumSha256: string;
}

export const DEMO_MEDIA_FIXTURES: readonly MediaDemoFixture[] = [
  {
    key: "seedance-empty-state",
    fileName: "seedance-empty-state-7ed500ba.webm",
    displayName: "seedance-emptystate",
    mediaKind: "video",
    contentType: "video/webm",
    goldenByteSize: 6_194_638,
    goldenChecksumSha256: "7ed500ba6adcf4e7103d9fdf3be0941aaab7a196d59fb4582eda6fd532b8572d",
  },
  {
    key: "editing-empty-state",
    fileName: "editing-empty-state-dfddf1e7.webm",
    displayName: "edit-studio-empty-state",
    mediaKind: "video",
    contentType: "video/webm",
    goldenByteSize: 6_163_336,
    goldenChecksumSha256: "dfddf1e710f74072bdfab304b65b94d08df780e2d80cd9e029adbb495c3eeb01",
  },
  {
    key: "multishot",
    fileName: "multishot-fe80f293.webm",
    displayName: "MultiShot_touchpoint_optimized",
    mediaKind: "video",
    contentType: "video/webm",
    goldenByteSize: 8_944_518,
    goldenChecksumSha256: "fe80f293d43c84b256f95719ec23931533b3cdb69bbfdbfd159b6f941a4eeb5d",
  },
  {
    key: "scanner-pulse",
    fileName: "scanner-pulse-b7382270.mp3",
    displayName: "曜石勘探体_扫描脉冲.mp3",
    mediaKind: "audio",
    contentType: "audio/mpeg",
    goldenByteSize: 201_165,
    goldenChecksumSha256: "b7382270e8067a59fa1281d1162a4b87bde9902a46ff3d8760c0219cbd7dd516",
  },
];
