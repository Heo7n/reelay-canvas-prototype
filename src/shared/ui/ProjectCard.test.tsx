// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, Outlet, RouterProvider, useRouteLoaderData } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "../../domain/project/project";
import { ProjectCard } from "./ProjectCard";
import { ProjectMenuProvider } from "./ProjectMenuProvider";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
});

function renderCard(
  project: ProjectSummary,
  action: ({ request }: { request: Request }) => Promise<unknown> = async () => null,
): void {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        action,
        element: (
          <ProjectMenuProvider>
            <ProjectCard project={project} onNotice={vi.fn()} />
          </ProjectMenuProvider>
        ),
      },
    ],
    { initialEntries: ["/w/workspace-organization/projects"] },
  );
  routers.push(router);
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
  routers.push(router);
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

const editableProject: ProjectSummary = {
  ...collaborativeViewerProject,
  id: "project-editable",
  accessKind: "private",
  currentUserRole: "admin",
  name: "个人项目",
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

describe("ProjectCard inline name editing", () => {
  it.each([
    ["home index", "/w/workspace-organization"],
    ["projects", "/w/workspace-organization/projects"],
  ])("saves through the owning %s route and reloads the new name", async (_page, initialEntry) => {
    let project = { ...editableProject };
    const submitted = vi.fn();
    const action = async ({ request }: { request: Request }) => {
      const fields = Object.fromEntries(await request.formData());
      submitted(fields);
      project = { ...project, name: String(fields.name) };
      return { ok: true };
    };
    function LoadedProjectCard() {
      const loadedProject = useRouteLoaderData("workspace") as ProjectSummary;
      return <ProjectMenuProvider><ProjectCard project={loadedProject} onNotice={vi.fn()} /></ProjectMenuProvider>;
    }
    const router = createMemoryRouter([
      {
        id: "workspace",
        path: "/w/:workspaceId",
        loader: async () => project,
        element: <Outlet />,
        errorElement: <div role="alert">项目页面路由错误</div>,
        // The real workspace parent owns the loader but deliberately has no action.
        children: [
          { index: true, action, element: <LoadedProjectCard /> },
          { path: "projects", action, element: <LoadedProjectCard /> },
        ],
      },
    ], { initialEntries: [initialEntry] });
    routers.push(router);
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "重命名 个人项目" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "已保存的项目名称" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("button", { name: "重命名 已保存的项目名称" })).toHaveTextContent("已保存的项目名称");
    expect(screen.getByRole("link", { name: "打开项目 已保存的项目名称" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.state.location.pathname).toBe(initialEntry);
    expect(submitted).toHaveBeenCalledExactlyOnceWith({
      intent: "rename",
      projectId: editableProject.id,
      name: "已保存的项目名称",
    });
  });

  it("edits the name in place, keeps the cover as navigation, and saves Enter plus blur only once", async () => {
    let releaseSave: (() => void) | undefined;
    const savePending = new Promise<void>((resolve) => { releaseSave = resolve; });
    const submitted = vi.fn();
    renderCard(editableProject, async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      await savePending;
      return { ok: true };
    });

    const title = screen.getByRole("button", { name: "重命名 个人项目" });
    expect(title).toHaveTextContent("个人项目");
    expect(screen.getByRole("link", { name: "打开项目 个人项目" })).toHaveAttribute(
      "href",
      "/w/workspace-organization/projects/project-editable/canvases/main",
    );
    fireEvent.click(title);
    const input = screen.getByRole("textbox", { name: "项目名称" }) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(editableProject.name.length);

    fireEvent.change(input, { target: { value: "春日产品影像" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted).toHaveBeenCalledWith({
      intent: "rename",
      projectId: editableProject.id,
      name: "春日产品影像",
    });
    expect(input).toBeInTheDocument();
    expect(input).toHaveProperty("readOnly", true);

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(submitted).toHaveBeenCalledTimes(1);

    await act(async () => { releaseSave?.(); });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull());
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("saves a changed name when focus leaves the input", async () => {
    const submitted = vi.fn();
    renderCard(editableProject, async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return { ok: true };
    });

    fireEvent.click(screen.getByRole("button", { name: "重命名 个人项目" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "秋季主视觉" } });
    fireEvent.blur(input);

    await waitFor(() => expect(submitted).toHaveBeenCalledWith({
      intent: "rename",
      projectId: editableProject.id,
      name: "秋季主视觉",
    }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull());
  });

  it("preserves a failed edit with a visible error and allows a corrected retry", async () => {
    const submitted = vi.fn();
    renderCard(editableProject, async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return submitted.mock.calls.length === 1
        ? { error: "保存失败，请重试。" }
        : { ok: true };
    });

    fireEvent.click(screen.getByRole("button", { name: "重命名 个人项目" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(input, { target: { value: "第一次名称" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试。");
    expect(screen.getByRole("alert")).toBeVisible();
    expect(input).toHaveValue("第一次名称");
    expect(input).toHaveProperty("readOnly", false);

    fireEvent.change(input, { target: { value: "修订名称" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2));
    expect(submitted).toHaveBeenLastCalledWith({
      intent: "rename",
      projectId: editableProject.id,
      name: "修订名称",
    });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels Escape and leaves unchanged names without sending a rename request", async () => {
    const action = vi.fn(async () => ({ ok: true }));
    renderCard(editableProject, action);

    fireEvent.click(screen.getByRole("button", { name: "重命名 个人项目" }));
    const changedInput = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.change(changedInput, { target: { value: "取消的名称" } });
    fireEvent.keyDown(changedInput, { key: "Escape" });
    fireEvent.blur(changedInput);
    expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull();
    expect(screen.getByRole("button", { name: "重命名 个人项目" })).toHaveTextContent("个人项目");

    fireEvent.click(screen.getByRole("button", { name: "重命名 个人项目" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "项目名称" }), { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重命名 个人项目" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "项目名称" }));
    expect(screen.queryByRole("textbox", { name: "项目名称" })).toBeNull();
    await act(async () => {});
    expect(action).not.toHaveBeenCalled();
  });

  it("does not save Enter used to confirm an IME composition", async () => {
    const action = vi.fn(async () => ({ ok: true }));
    renderCard(editableProject, action);

    fireEvent.click(screen.getByRole("button", { name: "重命名 个人项目" }));
    const input = screen.getByRole("textbox", { name: "项目名称" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "中文名称" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    fireEvent.compositionEnd(input);
    await act(async () => {});

    expect(action).not.toHaveBeenCalled();
    expect(input).toHaveValue("中文名称");
    expect(input).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("shows the updated date in a stable local YYYY-MM-DD format", () => {
    const updatedAt = new Date(2026, 8, 5, 12, 30).toISOString();
    renderCard({ ...collaborativeViewerProject, updatedAt });

    expect(screen.getByText("2026-09-05")).toHaveAttribute("dateTime", updatedAt);
    expect(screen.getByLabelText("协作项目")).toBeInTheDocument();
  });
});
