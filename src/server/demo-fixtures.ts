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
  projectAuthors: Record<string, ActorId>;
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
        id: "project-perfume-tvc",
        workspaceId: "workspace-personal-tianmaochao",
        name: "香水品牌 TVC_最终版",
        updatedAt: "2026-07-22T06:32:00.000Z",
        coverAssetId: "demo-cover-perfume",
      },
      {
        id: "project-scifi-trailer",
        workspaceId: "workspace-organization-reelay",
        name: "科幻预告片_初剪版",
        updatedAt: "2026-07-21T10:05:00.000Z",
        coverAssetId: "demo-cover-scifi",
      },
      {
        id: "project-character-film",
        workspaceId: "workspace-personal-tianmaochao",
        name: "角色动画短片_第 3 版",
        updatedAt: "2026-07-21T03:20:00.000Z",
        coverAssetId: "demo-cover-character",
      },
      {
        id: "project-product-film",
        workspaceId: "workspace-organization-reelay",
        name: "产品视觉广告_旁白已配",
        updatedAt: "2026-07-20T08:40:00.000Z",
        coverAssetId: "demo-cover-product",
      },
      {
        id: "project-education-video",
        workspaceId: "workspace-organization-reelay",
        name: "教育课程视频_第 2 版",
        updatedAt: "2026-07-19T11:18:00.000Z",
        coverAssetId: "demo-cover-education",
      },
      {
        id: "project-brand-story",
        workspaceId: "workspace-organization-reelay",
        name: "品牌故事片脚本",
        updatedAt: "2026-07-18T09:00:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-personal-concept",
        workspaceId: "workspace-personal-tianmaochao",
        name: "个人概念短片",
        updatedAt: "2026-07-17T08:00:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-city-emotion",
        workspaceId: "workspace-personal-linjing",
        name: "城市情感短片",
        updatedAt: "2026-07-16T14:00:00.000Z",
        coverAssetId: null,
      },
    ],
    projectAuthors: {
      "project-perfume-tvc": "actor-tianmaochao",
      "project-scifi-trailer": "actor-tianmaochao",
      "project-character-film": "actor-tianmaochao",
      "project-product-film": "actor-linjing",
      "project-education-video": "actor-linjing",
      "project-brand-story": "actor-tianmaochao",
      "project-personal-concept": "actor-tianmaochao",
      "project-city-emotion": "actor-linjing",
    },
  };
}
