import type { MediaAssetKind, PersonalMediaAsset, ProjectMediaAsset } from "./MediaAssetRepository";

export interface ImportTransientMediaInput {
  workspaceId: string;
  projectId: string;
  target: "project" | "personal";
  displayName: string;
  mediaKind: MediaAssetKind;
  contentType: string;
  body: ArrayBuffer;
}

/** Page-owned files; implementations must not upload or persist their contents. */
export interface TransientMediaRepository {
  importFile(input: ImportTransientMediaInput): Promise<{
    asset: PersonalMediaAsset;
    projectAsset: ProjectMediaAsset | null;
  }>;
}
