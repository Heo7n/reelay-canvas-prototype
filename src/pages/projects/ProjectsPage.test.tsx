// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceRouteData } from "../../app/route-data";
import { ProjectsPage } from "./ProjectsPage";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  window.localStorage.clear();
});

const routeData: WorkspaceRouteData = {
  actor: {
    account: "creator@reelay.test",
    id: "actor-one",
    displayName: "Demo One",
    workspaceIds: ["workspace-organization"],
  },
  currentWorkspace: {
    id: "workspace-organization",
    kind: "organization",
    name: "星海视觉工作室",
    currentUserRole: "owner",
  },
  projects: [
    {
      id: "project-private",
      workspaceId: "workspace-organization",
      accessKind: "private",
      currentUserRole: "admin",
      name: "个人故事片",
      updatedAt: "2026-07-22T08:00:00.000Z",
      coverAssetId: null,
    },
    {
      id: "project-collaborative",
      workspaceId: "workspace-organization",
      accessKind: "collaborative",
      currentUserRole: "edit",
      name: "团队广告片",
      updatedAt: "2026-07-22T09:00:00.000Z",
      coverAssetId: null,
    },
  ],
  workspaces: [
    {
      id: "workspace-organization",
      kind: "organization",
      name: "星海视觉工作室",
      currentUserRole: "owner",
    },
  ],
};

function renderProjectsPage(initialEntry: string): void {
  const router = createMemoryRouter(
    [
      {
        path: "/w/:workspaceId/projects",
        loader: async () => routeData,
        action: async () => null,
        element: <ProjectsPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
}

describe("ProjectsPage project access filters", () => {
  it("defaults to private projects without changing the organization route", async () => {
    renderProjectsPage("/w/workspace-organization/projects");

    expect(await screen.findByRole("link", { name: "打开项目 个人故事片" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "打开项目 团队广告片" })).toBeNull();
    expect(screen.getByRole("heading", { name: "全部项目", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新建文件夹" })).toBeNull();
    expect(screen.getByRole("link", { name: "协作" })).toHaveAttribute(
      "href",
      "/w/workspace-organization/projects?kind=collaborative",
    );
  });

  it("shows collaborative projects from the same organization route", async () => {
    renderProjectsPage("/w/workspace-organization/projects?kind=collaborative");

    expect(await screen.findByRole("link", { name: "打开项目 团队广告片" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "打开项目 个人故事片" })).toBeNull();
    expect(screen.getByLabelText("协作项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建项目" })).toHaveTextContent("创建个人项目");
  });

  it("keeps search when switching access types and always keeps the blank creation entry", async () => {
    renderProjectsPage("/w/workspace-organization/projects");
    await screen.findByRole("link", { name: "打开项目 个人故事片" });
    const search = screen.getByRole("searchbox", { name: "搜索项目" });
    fireEvent.change(search, { target: { value: "广告" } });
    expect(screen.queryByRole("link", { name: "打开项目 个人故事片" })).not.toBeInTheDocument();
    expect(screen.getByText("没有找到匹配“广告”的个人项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled();

    fireEvent.click(screen.getByRole("link", { name: "协作" }));
    expect(await screen.findByRole("link", { name: "打开项目 团队广告片" })).toBeInTheDocument();
    expect(search).toHaveValue("广告");
    await waitFor(() => expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "新建项目" })).toHaveTextContent("创建个人项目");
    fireEvent.change(search, { target: { value: "不存在" } });
    expect(screen.getByText("没有找到匹配“不存在”的协作项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled();
    fireEvent.change(search, { target: { value: "  " } });
    expect(screen.getByRole("link", { name: "打开项目 团队广告片" })).toBeInTheDocument();
  });
});
