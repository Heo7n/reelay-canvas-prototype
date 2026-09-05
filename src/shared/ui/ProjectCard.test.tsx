// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "../../domain/project/project";
import { ProjectCard } from "./ProjectCard";
import { ProjectMenuProvider } from "./ProjectMenuProvider";

afterEach(cleanup);

function renderCard(
  project: ProjectSummary,
  action: ({ request }: { request: Request }) => Promise<unknown> = async () => null,
  onNotice = vi.fn(),
): void {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        action,
        element: (
          <ProjectMenuProvider>
            <ProjectCard project={project} onNotice={onNotice} />
          </ProjectMenuProvider>
        ),
      },
    ],
    { initialEntries: ["/w/workspace-organization/projects"] },
  );
  render(<RouterProvider router={router} />);
}

function renderCards(projects: ProjectSummary[]): void {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <ProjectMenuProvider>
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onNotice={vi.fn()} />
            ))}
          </ProjectMenuProvider>
        ),
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

    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("从你的个人项目列表中移除");
  });

  it("lets collaborative editors edit but reserves deletion for project admins", () => {
    renderCard({
      ...collaborativeViewerProject,
      id: "project-editor",
      currentUserRole: "edit",
      name: "协作编辑项目",
    });

    fireEvent.click(screen.getByLabelText("打开 协作编辑项目 的项目菜单"));

    expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "修改封面" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除项目（仅项目管理员可用）" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "删除项目（仅项目管理员可用）" })).toHaveAttribute(
      "title",
      "仅项目管理员可删除",
    );
  });

  it("derives deletion from the explicit admin role even for a private projection", () => {
    renderCard({
      ...collaborativeViewerProject,
      id: "project-private-editor",
      accessKind: "private",
      currentUserRole: "edit",
      name: "个人编辑项目",
    });

    fireEvent.click(screen.getByLabelText("打开 个人编辑项目 的项目菜单"));

    expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /删除项目/ })).toBeNull();
  });

  it("describes cover editing as a future asset capability instead of stale project persistence", () => {
    const onNotice = vi.fn();
    renderCard({
      ...collaborativeViewerProject,
      id: "project-cover",
      currentUserRole: "edit",
      name: "封面项目",
    }, async () => null, onNotice);

    fireEvent.click(screen.getByLabelText("打开 封面项目 的项目菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "修改封面" }));

    expect(onNotice).toHaveBeenCalledWith("项目封面编辑尚未接入；后续将与可复用资产能力一起开放。");
    expect(onNotice.mock.calls[0]?.[0]).not.toContain("项目持久化阶段");
  });

  it("keeps only one card menu open and dismisses it outside or with Escape", () => {
    const firstProject = {
      ...collaborativeViewerProject,
      id: "project-first",
      currentUserRole: "admin" as const,
      name: "第一个协作项目",
    };
    const secondProject = {
      ...firstProject,
      id: "project-second",
      name: "第二个协作项目",
    };
    renderCards([firstProject, secondProject]);

    const firstTrigger = screen.getByLabelText("打开 第一个协作项目 的项目菜单");
    const secondTrigger = screen.getByLabelText("打开 第二个协作项目 的项目菜单");
    const firstDetails = firstTrigger.closest("details");
    const secondDetails = secondTrigger.closest("details");

    fireEvent.click(firstTrigger);
    expect(firstDetails).toHaveAttribute("open");

    fireEvent.click(secondTrigger);
    expect(firstDetails).not.toHaveAttribute("open");
    expect(secondDetails).toHaveAttribute("open");

    fireEvent.pointerDown(document.body);
    expect(secondDetails).not.toHaveAttribute("open");

    fireEvent.click(firstTrigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(firstDetails).not.toHaveAttribute("open");
    expect(firstTrigger).toHaveFocus();
  });

  it("asks for explicit confirmation before moving an administered project to trash", async () => {
    const submitted = vi.fn();
    const project = {
      ...collaborativeViewerProject,
      id: "project-admin",
      accessKind: "collaborative" as const,
      currentUserRole: "admin" as const,
      name: "协作广告项目",
    };
    renderCard(project, async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return { ok: true };
    });

    fireEvent.click(screen.getByLabelText("打开 协作广告项目 的项目菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));

    const dialog = screen.getByRole("alertdialog", { name: "删除“协作广告项目”？" });
    expect(dialog).toHaveTextContent("项目成员关系与画布数据会保留");
    expect(dialog).toHaveTextContent("协作成员也将无法继续访问这个项目");
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(submitted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("打开 协作广告项目 的项目菜单"));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));
    fireEvent.click(screen.getByRole("button", { name: "删除项目" }));

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted).toHaveBeenCalledWith({
      intent: "delete",
      projectId: "project-admin",
    });
  });
});

describe("ProjectCard rename reliability", () => {
  const editableProject: ProjectSummary = {
    ...collaborativeViewerProject,
    id: "project-rename",
    accessKind: "private",
    currentUserRole: "admin",
    name: "原项目名",
  };

  it("closes without a request when the normalized name did not change", () => {
    const action = vi.fn(async () => ({ ok: true }));
    renderCard(editableProject, action);

    fireEvent.click(screen.getByRole("button", { name: "重命名 原项目名" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "  原项目名  " } });
    fireEvent.blur(input);

    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull();
  });

  it("keeps an empty name editable and shows a visible validation error", () => {
    const action = vi.fn(async () => ({ ok: true }));
    renderCard(editableProject, action);

    fireEvent.click(screen.getByRole("button", { name: "重命名 原项目名" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(action).not.toHaveBeenCalled();
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("项目名称不能为空");
  });

  it("submits the trimmed name once, disables editing while pending, and exits after success", async () => {
    const submitted = vi.fn();
    let resolveAction: ((value: unknown) => void) | undefined;
    renderCard(editableProject, async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return new Promise((resolve) => {
        resolveAction = resolve;
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "重命名 原项目名" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "  新项目名  " } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(submitted).toHaveBeenCalledWith({
      intent: "rename",
      name: "新项目名",
      projectId: "project-rename",
    }));
    await waitFor(() => expect(input).toBeDisabled());
    expect(input).toHaveValue("新项目名");

    resolveAction?.({ ok: true });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull());
  });

  it("keeps the normalized draft editable and exposes the server error after failure", async () => {
    renderCard(editableProject, async () => ({ error: "这个项目名称暂时无法保存。" }));

    fireEvent.click(screen.getByRole("button", { name: "重命名 原项目名" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "  新项目名  " } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("这个项目名称暂时无法保存");
    expect(screen.getByRole("textbox", { name: "项目名称" })).toHaveValue("新项目名");
    expect(screen.getByRole("textbox", { name: "项目名称" })).toBeEnabled();
  });
});
