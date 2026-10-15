export type SeedanceVideoModelId = "seedance-2" | "seedance-2-fast" | "seedance-2-5";
export type SeedanceVideoResolution = "480P" | "720P" | "1080P";
export type SeedanceVideoAspectRatio = "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";

/** Immutable ordinary text-to-video parameters passed to the Web adapter. */
export interface SeedanceVideoParameters {
  modelId: SeedanceVideoModelId;
  model: string;
  resolution: SeedanceVideoResolution;
  aspectRatio: SeedanceVideoAspectRatio;
  duration: number;
  generateAudio: boolean;
  workflow: "omni-reference";
  generationStage: "standard";
  omniReferenceTaskType?: "auto";
  outputFormat?: "mp4";
}

export interface SeedanceVideoCapability {
  modelId: SeedanceVideoModelId;
  model: string;
  channel: "web";
  resolutions: readonly SeedanceVideoResolution[];
  aspectRatios: readonly SeedanceVideoAspectRatio[];
  durationRange: { min: number; max: number; step: 1 };
  generateAudio: true;
  maxCount: 1;
  referencesRequirePlatformAsset: true;
  optionalFieldsPlacement: "video" | "extra";
  verification: "documented";
}
