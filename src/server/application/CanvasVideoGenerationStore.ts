import type { CanvasVideoProjectBinding, CanvasVideoTask, PrepareCanvasVideoTask } from "../../domain/generation/canvas-video-task";
import type { StoredObjectMetadata } from "./ObjectStore";
import type { PlatformVideo } from "./RealGenerationPlatform";

export interface CanvasVideoTaskRecord {
  task: CanvasVideoTask;
  input: PrepareCanvasVideoTask;
  actorId: string;
  platformUserId: string;
  connectionId: string;
  platformProjectId: string;
  attemptId: string | null;
  ownerProcessId: string | null;
  video: PlatformVideo | null;
  object: StoredObjectMetadata | null;
  artifact: { assetId: string; artifactId: string } | null;
}
export interface GenerationAccountGuard {
  claim(platformUserId: string, operationId: string): Promise<boolean>;
  release(platformUserId: string, operationId: string): Promise<void>;
}
export interface CanvasVideoGenerationStore extends GenerationAccountGuard {
  getBinding(actorId: string, platformUserId: string, projectId: string): Promise<CanvasVideoProjectBinding | null>;
  setBinding(actorId: string, platformUserId: string, connectionId: string, value: CanvasVideoProjectBinding): Promise<CanvasVideoProjectBinding>;
  prepare(record: CanvasVideoTaskRecord): Promise<CanvasVideoTaskRecord>;
  get(actorId: string, taskId: string): Promise<CanvasVideoTaskRecord | null>;
  getProjectTask(projectId: string, taskId: string): Promise<CanvasVideoTaskRecord | null>;
  list(actorId: string, projectId: string): Promise<CanvasVideoTaskRecord[]>;
  getResult(projectId: string, resultId: string): Promise<CanvasVideoTaskRecord | null>;
  activate(actorId: string, taskId: string, attemptId: string, ownerProcessId: string): Promise<CanvasVideoTaskRecord>;
  beginSaveRetry(actorId: string, taskId: string, ownerProcessId: string): Promise<CanvasVideoTaskRecord>;
  /** Persist attempt evidence; confirmed terminal states release the account in the same transaction. */
  update(record: CanvasVideoTaskRecord): Promise<void>;
  heartbeat(platformUserId: string, operationId: string): Promise<void>;
  recoverInterrupted(): Promise<void>;
}
