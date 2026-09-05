// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceRouteData } from "../../app/route-data";
import { ProjectsPage } from "./ProjectsPage";

afterEach(cleanup);

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

function renderProjectsPage(initialEntry: string) {
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
  render(<RouterProvider router={router} />);
  return router;
}

describe("ProjectsPage project access filters", () => {
  it("defaults to every accessible project and exposes stable workspace navigation", async () => {
    renderProjectsPage("/w/workspace-organization/projects");

    expect(await screen.findByRole("link", { name: "个人故事片" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "团队广告片" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "项目空间" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "全部 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "协作 1" })).toHaveAttribute(
      "href",
      "/w/workspace-organization/projects?kind=collaborative",
    );
  });

  it("shows collaborative projects from the same organization route", async () => {
    renderProjectsPage("/w/workspace-organization/projects?kind=collaborative");

    expect(await screen.findByRole("link", { name: "团队广告片" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "个人故事片" })).toBeNull();
    expect(screen.getByLabelText("协作项目")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^新建个人项目/ })).toBeNull();
  });

  it("keeps search in the URL and searches across all accessible projects", async () => {
    const router = renderProjectsPage("/w/workspace-organization/projects");

    const search = await screen.findByRole("searchbox", { name: "搜索项目" });
    fireEvent.change(search, { target: { value: "团队" } });

    expect(await screen.findByRole("link", { name: "团队广告片" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "个人故事片" })).toBeNull());
    expect(search).toHaveValue("团队");
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe("团队");
  });

  it("explains an empty collaborative filter without offering a private-project card", async () => {
    const emptyRouteData = { ...routeData, projects: routeData.projects.filter((project) => project.accessKind === "private") };
    const router = createMemoryRouter(
      [{
        path: "/w/:workspaceId/projects",
        loader: async () => emptyRouteData,
        action: async () => null,
        element: <ProjectsPage />,
      }],
      { initialEntries: ["/w/workspace-organization/projects?kind=collaborative"] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/项目管理员添加你后/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^新建个人项目/ })).toBeNull();
  });
});
