// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "../../domain/project/project";
import { ProjectCard } from "./ProjectCard";

afterEach(cleanup);

function renderCard(project: ProjectSummary): void {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        action: async () => null,
        element: <ProjectCard project={project} onNotice={vi.fn()} />,
      },
    ],
    { initialEntries: ["/w/workspace-organization/projects"] },
  );
  render(<RouterProvider router={router} />);
}

const collaborativeViewerProject: ProjectSummary = {
  id: "project-viewer",
  workspaceId: "workspace-organization",
  accessKind: "collaborative",
  currentUserRole: "view",
  name: "只读协作项目",
  updatedAt: "2026-07-22T08:00:00.000Z",
  coverAssetId: null,
};

describe("ProjectCard access projection", () => {
  it("marks collaboration from the project and hides every write action for viewers", () => {
    renderCard(collaborativeViewerProject);

    expect(screen.getByLabelText("协作项目")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `重命名 ${collaborativeViewerProject.name}` })).toBeNull();

    fireEvent.click(screen.getByLabelText(`打开 ${collaborativeViewerProject.name} 的项目菜单`));

    expect(screen.getByRole("menuitem", { name: "打开" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "重命名" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "修改封面" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "转为协作项目" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "删除项目" })).toBeNull();
  });

  it("keeps project administration on private projects for admins", () => {
    renderCard({
      ...collaborativeViewerProject,
      id: "project-admin",
      accessKind: "private",
      currentUserRole: "admin",
      name: "个人项目",
    });

    expect(screen.queryByLabelText("协作项目")).toBeNull();
    expect(screen.getByRole("button", { name: "重命名 个人项目" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("打开 个人项目 的项目菜单"));

    expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "转为协作项目" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除项目" })).toBeInTheDocument();
  });
});
