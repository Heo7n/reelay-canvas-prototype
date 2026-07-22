// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
  render(<RouterProvider router={router} />);
}

describe("ProjectsPage project access filters", () => {
  it("defaults to private projects without changing the organization route", async () => {
    renderProjectsPage("/w/workspace-organization/projects");

    expect(await screen.findByRole("link", { name: "个人故事片" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "团队广告片" })).toBeNull();
    expect(screen.getByRole("link", { name: "协作项目" })).toHaveAttribute(
      "href",
      "/w/workspace-organization/projects?kind=collaborative",
    );
  });

  it("shows collaborative projects from the same organization route", async () => {
    renderProjectsPage("/w/workspace-organization/projects?kind=collaborative");

    expect(await screen.findByRole("link", { name: "团队广告片" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "个人故事片" })).toBeNull();
    expect(screen.getByLabelText("协作项目")).toBeInTheDocument();
  });
});
