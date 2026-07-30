import type { ActorId } from "../domain/identity/session";
import type { ProjectAccessKind, ProjectId, ProjectUserRole } from "../domain/project/project";
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
  projects: DemoProjectFixture[];
  projectMemberships: DemoProjectMembershipFixture[];
}

export interface DemoProjectFixture {
  id: ProjectId;
  workspaceId: string;
  accessKind: ProjectAccessKind;
  createdByActorId: ActorId;
  name: string;
  updatedAt: string;
  coverAssetId: string | null;
}

export interface DemoProjectMembershipFixture {
  projectId: ProjectId;
  actorId: ActorId;
  role: ProjectUserRole;
}

export const DEMO_PASSWORD = "reelay-demo";

export function createDemoSeed(): DemoSeed {
  return {
    accounts: [
      {
        account: "creator@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-tianmaochao",
        displayName: "Hoo",
      },
      {
        account: "linjing@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-linjing",
        displayName: "林静",
      },
      {
        account: "liran@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-liran",
        displayName: "李然",
      },
      {
        account: "chenxi@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-chenxi",
        displayName: "陈曦",
      },
      {
        account: "zhouyu@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-zhouyu",
        displayName: "周予",
      },
      {
        account: "suhe@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-suhe",
        displayName: "苏禾",
      },
      {
        account: "wangyin@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-wangyin",
        displayName: "王茵",
      },
      {
        account: "xuzhe@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-xuzhe",
        displayName: "许哲",
      },
      {
        account: "yelan@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-yelan",
        displayName: "叶澜",
      },
      {
        account: "shenan@reelay.test",
        password: DEMO_PASSWORD,
        actorId: "actor-shenan",
        displayName: "沈岸",
      },
    ],
    workspaces: [
      { id: "workspace-organization-reelay", kind: "organization", name: "星海视觉工作室" },
    ],
    memberships: [
      { workspaceId: "workspace-organization-reelay", actorId: "actor-tianmaochao", role: "owner" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-linjing", role: "admin" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-liran", role: "admin" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-chenxi", role: "member" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-zhouyu", role: "member" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-suhe", role: "member" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-wangyin", role: "member" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-xuzhe", role: "member" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-yelan", role: "member" },
      { workspaceId: "workspace-organization-reelay", actorId: "actor-shenan", role: "member" },
    ],
    projects: [
      {
        id: "project-perfume-tvc",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-tianmaochao",
        name: "香水品牌 TVC_最终版",
        updatedAt: "2026-07-22T06:32:00.000Z",
        coverAssetId: "demo-cover-perfume",
      },
      {
        id: "project-scifi-trailer",
        workspaceId: "workspace-organization-reelay",
        accessKind: "collaborative",
        createdByActorId: "actor-tianmaochao",
        name: "科幻预告片_初剪版",
        updatedAt: "2026-07-21T10:05:00.000Z",
        coverAssetId: "demo-cover-scifi",
      },
      {
        id: "project-character-film",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-tianmaochao",
        name: "角色动画短片_第 3 版",
        updatedAt: "2026-07-21T03:20:00.000Z",
        coverAssetId: "demo-cover-character",
      },
      {
        id: "project-product-film",
        workspaceId: "workspace-organization-reelay",
        accessKind: "collaborative",
        createdByActorId: "actor-linjing",
        name: "产品视觉广告_旁白已配",
        updatedAt: "2026-07-20T08:40:00.000Z",
        coverAssetId: "demo-cover-product",
      },
      {
        id: "project-education-video",
        workspaceId: "workspace-organization-reelay",
        accessKind: "collaborative",
        createdByActorId: "actor-linjing",
        name: "教育课程视频_第 2 版",
        updatedAt: "2026-07-19T11:18:00.000Z",
        coverAssetId: "demo-cover-education",
      },
      {
        id: "project-brand-story",
        workspaceId: "workspace-organization-reelay",
        accessKind: "collaborative",
        createdByActorId: "actor-tianmaochao",
        name: "品牌故事片脚本",
        updatedAt: "2026-07-18T09:00:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-personal-concept",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-tianmaochao",
        name: "个人概念短片",
        updatedAt: "2026-07-17T08:00:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-city-emotion",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-linjing",
        name: "城市情感短片",
        updatedAt: "2026-07-16T14:00:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-brand-motion-proposal",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-zhouyu",
        name: "品牌动态视觉提案",
        updatedAt: "2026-07-15T10:30:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-documentary-storyboard",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-chenxi",
        name: "纪录片分镜草稿",
        updatedAt: "2026-07-14T09:15:00.000Z",
        coverAssetId: null,
      },
      {
        id: "project-product-demo-script",
        workspaceId: "workspace-organization-reelay",
        accessKind: "private",
        createdByActorId: "actor-suhe",
        name: "产品演示脚本",
        updatedAt: "2026-07-13T07:45:00.000Z",
        coverAssetId: null,
      },
    ],
    projectMemberships: [
      { projectId: "project-perfume-tvc", actorId: "actor-tianmaochao", role: "admin" },
      { projectId: "project-character-film", actorId: "actor-tianmaochao", role: "admin" },
      { projectId: "project-personal-concept", actorId: "actor-tianmaochao", role: "admin" },
      { projectId: "project-city-emotion", actorId: "actor-linjing", role: "admin" },
      { projectId: "project-brand-motion-proposal", actorId: "actor-zhouyu", role: "admin" },
      { projectId: "project-documentary-storyboard", actorId: "actor-chenxi", role: "admin" },
      { projectId: "project-product-demo-script", actorId: "actor-suhe", role: "admin" },
      { projectId: "project-scifi-trailer", actorId: "actor-tianmaochao", role: "admin" },
      { projectId: "project-scifi-trailer", actorId: "actor-linjing", role: "edit" },
      { projectId: "project-scifi-trailer", actorId: "actor-zhouyu", role: "view" },
      { projectId: "project-product-film", actorId: "actor-linjing", role: "admin" },
      { projectId: "project-product-film", actorId: "actor-tianmaochao", role: "edit" },
      { projectId: "project-product-film", actorId: "actor-chenxi", role: "view" },
      { projectId: "project-education-video", actorId: "actor-linjing", role: "admin" },
      { projectId: "project-education-video", actorId: "actor-suhe", role: "edit" },
      { projectId: "project-education-video", actorId: "actor-tianmaochao", role: "view" },
      { projectId: "project-brand-story", actorId: "actor-tianmaochao", role: "admin" },
      { projectId: "project-brand-story", actorId: "actor-zhouyu", role: "edit" },
      { projectId: "project-brand-story", actorId: "actor-chenxi", role: "view" },
    ],
  };
}
