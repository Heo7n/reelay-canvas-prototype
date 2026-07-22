import type { ActorId } from "../domain/identity/session";
import type { ProjectSummary } from "../domain/project/project";
import type { Membership, Workspace } from "../domain/workspace/workspace";

export interface DemoAccountFixture {
  account: string;
  password: string;
  actorId: ActorId;
  displayName: string;
}

export interface DemoSeed {
  accounts: DemoAccountFixture[];
  workspaces: Workspace[];
  memberships: Membership[];
  projects: ProjectSummary[];
}

export const DEMO_PASSWORD = "reelay-demo";

export function createDemoSeed(): DemoSeed {
  return {
    accounts: [
      {
        account: "tianmaochao@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-tianmaochao",
        displayName: "天猫超",
      },
      {
        account: "linjing@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-linjing",
        displayName: "林静",
      },
    ],
    workspaces: [
      { id: "workspace-personal-tianmaochao", kind: "personal", name: "天猫超的个人空间" },
      { id: "workspace-personal-linjing", kind: "personal", name: "林静的个人空间" },
      { id: "workspace-organization-reelay", kind: "organization", name: "Reelay 创作组" },
    ],
    memberships: [
      { workspaceId: "workspace-personal-tianmaochao", actorId: "actor-tianmaochao", role: "owner" },
      { workspaceId: "workspace-personal-linjing", actorId: "actor-linjing", role: "owner" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-tianmaochao", role: "owner" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-linjing", role: "editor" },
    ],
    projects: [
      {
        id: "project-brand-story",
        workspaceId: "workspace-organization-reelay",
        name: "品牌故事片脚本",
        updatedAt: "2026-07-21T10:00:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-personal-concept",
        workspaceId: "workspace-personal-tianmaochao",
        name: "个人概念短片",
        updatedAt: "2026-07-20T08:00:00.000Z",
        coverAssetId: null,
      },
    ],
  };
}
