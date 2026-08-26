import { describe, expect, it } from "vitest";

import { CanvasDocumentProjectUnavailableError } from "../application/CanvasDocumentStore";
import { createDemoSeed } from "../demo-fixtures";
import { InMemoryCollaborationStore } from "./InMemoryCollaborationStore";

describe("InMemoryCollaborationStore authorization boundaries", () => {
  it("rejects project creation when the actor is not a workspace member", async () => {
    const seed = createDemoSeed();
    seed.workspaces.push({
      id: "workspace-outside-actor-scope",
      kind: "organization",
      name: "未加入的组织",
    });
    const store = new InMemoryCollaborationStore(seed);

    await expect(store.createProject({
      workspaceId: "workspace-outside-actor-scope",
      createdByActorId: "actor-tianmaochao",
      name: "不应创建",
    })).rejects.toMatchObject({
      name: "ProjectWorkspaceUnavailableError",
      reason: "forbidden",
    });
    await expect(store.listProjects(
      "actor-tianmaochao",
      "workspace-outside-actor-scope",
    )).resolves.toEqual([]);

    await expect(store.createProject({
      workspaceId: "workspace-missing",
      createdByActorId: "actor-tianmaochao",
      name: "同样不应创建",
    })).rejects.toMatchObject({
      name: "ProjectWorkspaceUnavailableError",
      reason: "not_found",
    });
  });

  it("enforces project read scope inside canvas storage calls", async () => {
    const store = new InMemoryCollaborationStore();
    const projectId = "project-scifi-trailer";
    const canvasId = "direct-store-scope";

    await store.saveCanvasDocument({
      actorId: "actor-tianmaochao",
      projectId,
      canvasId,
      schemaVersion: 1,
      expectedRevision: 0,
      content: { nodes: [{ id: "authorized" }] },
    });

    await expect(store.getCanvasDocument({
      actorId: "actor-zhouyu",
      projectId,
      canvasId,
    })).resolves.toEqual(expect.objectContaining({ revision: 1 }));
    await expect(store.getCanvasDocument({
      actorId: "actor-chenxi",
      projectId,
      canvasId,
    })).rejects.toBeInstanceOf(CanvasDocumentProjectUnavailableError);

    await expect(store.moveProjectToTrash(
      "workspace-organization-reelay",
      projectId,
      "actor-tianmaochao",
    )).resolves.toBe(true);
    await expect(store.getCanvasDocument({
      actorId: "actor-tianmaochao",
      projectId,
      canvasId,
    })).rejects.toBeInstanceOf(CanvasDocumentProjectUnavailableError);
  });
});
