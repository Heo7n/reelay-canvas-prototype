import type { AccountStore } from "./AccountStore";
import type { CanvasDocumentStore } from "./CanvasDocumentStore";
import type { ProjectStore } from "./ProjectStore";
import type { SessionStore } from "./SessionStore";
import type { WorkspaceStore } from "./WorkspaceStore";

export interface CollaborationStore
  extends AccountStore, CanvasDocumentStore, ProjectStore, SessionStore, WorkspaceStore {
  readonly storageKind: "server-memory" | "postgresql";

  ping(): Promise<void>;
  close(): Promise<void>;
}
