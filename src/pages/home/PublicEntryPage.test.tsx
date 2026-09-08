// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppRouteObjects } from "../../app/router";
import type { ApplicationServices } from "../../app/services";
import type { Workspace } from "../../domain/workspace/workspace";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { readGuestCreationDraft, saveGuestCreationDraft } from "./guest-creation-draft";


const actor = { id: "review-actor", account: "creator@reelay.test", displayName: "Hoo", workspaceIds: ["review-workspace"] };
const workspace: Workspace = { id: "review-workspace", kind: "organization", name: "评审工作室", currentUserRole: "owner" };
let routers: ReturnType<typeof createMemoryRouter>[] = [];

function setup(initialEntry = "/app", initiallySignedIn = false) {
  let signedIn = initiallySignedIn;
  const services = {
    sessionGateway: {
      getCurrent: vi.fn(async () => ({ actor: signedIn ? actor : null })),
      signInWithPassword: vi.fn(async () => { signedIn = true; return { actor }; }),
      signOut: vi.fn(async () => { signedIn = false; }),
    },
    workspaceRepository: { listForActor: vi.fn(async () => [workspace]) },
    workspaceContextGateway: { load: vi.fn(async () => ({ actor, currentWorkspace: workspace, workspaces: [workspace], projects: [] })) },
    projectRepository: { create: vi.fn(), listByWorkspace: vi.fn() },
  } as unknown as ApplicationServices;
  const router = createMemoryRouter(createAppRouteObjects(services), { initialEntries: [initialEntry], basename: "/app" });
  routers.push(router);
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  return { router, services, setSession: (value: boolean) => { signedIn = value; } };
}

beforeEach(() => {
  window.sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});

afterEach(() => {
  cleanup();
  routers.forEach((router) => router.dispose());
  routers = [];
  window.sessionStorage.clear();
});

describe("guest home and login navigation", () => {
  it("keeps the admin demo link through dismissal and reopening and waits for an explicit login", async () => {
    const { router, services } = setup("/app/login?demo=admin");
    let dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(within(dialog).getByLabelText("账号")).toHaveValue("linjing@reelay.test");
    expect(within(dialog).getByLabelText("密码", { exact: true })).toHaveValue("reelay-demo");
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname + router.state.location.search).toBe("/app?demo=admin");
    fireEvent.click(screen.getByRole("button", { name: "注册/登录" }));
    dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(router.state.location.pathname + router.state.location.search).toBe("/app/login?demo=admin");
    expect(within(dialog).getByLabelText("账号")).toHaveValue("linjing@reelay.test");
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(services.sessionGateway.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      account: "linjing@reelay.test", password: "reelay-demo",
    }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
  });

  it.each([
    "",
    "?demo=unknown",
    "?demo=admin&demo=admin",
    "?demo=admin&demo=creator",
  ])("uses the main account for an absent, unknown, or ambiguous preset: %s", async (search) => {
    const { services } = setup(`/app/login${search}`);
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(within(dialog).getByLabelText("账号")).toHaveValue("creator@reelay.test");
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();
  });

  it("ignores credentials in the URL and preserves manually edited credentials after a failed admin login", async () => {
    const { router, services } = setup("/app/login?demo=admin&account=other%40reelay.test&password=from-url");
    vi.mocked(services.sessionGateway.signInWithPassword).mockRejectedValue(new ApplicationError("authentication_required", "账号或密码不正确。"));
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    const account = within(dialog).getByLabelText("账号");
    const password = within(dialog).getByLabelText("密码", { exact: true });
    expect(account).toHaveValue("linjing@reelay.test");
    expect(password).toHaveValue("reelay-demo");
    fireEvent.change(account, { target: { value: "manual@reelay.test" } });
    fireEvent.change(password, { target: { value: "manual-password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("账号或密码不正确。");
    expect(services.sessionGateway.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      account: "manual@reelay.test", password: "manual-password",
    });
    expect(account).toHaveValue("manual@reelay.test");
    expect(password).toHaveValue("manual-password");
    expect(router.state.location.pathname).toBe("/app/login");
  });

  it("keeps an existing session when an admin demo link is opened", async () => {
    const { router, services } = setup("/app/login?demo=admin", true);
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();
    expect(services.sessionGateway.signOut).not.toHaveBeenCalled();
  });


  it("offers a central project entry without exposing private projects or invented capabilities", async () => {
    const { services } = setup();
    const create = await screen.findByRole("button", { name: "登录后新建项目" });
    expect(screen.queryByRole("link", { name: "项目" })).not.toBeInTheDocument();
    expect(screen.queryByText("快速开始")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI 分镜" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加素材" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reelay 创作能力" })).not.toBeInTheDocument();
    create.focus();
    fireEvent.click(create);
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(create).toHaveFocus();
    expect(services.workspaceContextGateway.load).not.toHaveBeenCalled();
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it("keeps the real draft and returns focus when login closes", async () => {
    const { router, services } = setup();
    expect(await screen.findByRole("button", { name: "注册/登录" })).toBeEnabled();
    expect(services.workspaceRepository.listForActor).not.toHaveBeenCalled();
    expect(services.workspaceContextGateway.load).not.toHaveBeenCalled();
    const prompt = screen.getByRole("textbox", { name: "描述你的创作需求" });
    fireEvent.change(prompt, { target: { value: "清晨薄雾中的森林" } });
    const trigger = await screen.findByRole("button", { name: "登录后新建项目" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(within(dialog).getByRole("button", { name: "立即注册" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/app");
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toBe(prompt);
    expect(prompt).toHaveValue("清晨薄雾中的森林");
    expect(readGuestCreationDraft()).toBe("");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it("carries the real draft through login without implicitly creating a project", async () => {
    const { router, services } = setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "角色的半身肖像，柔和侧光" } });
    fireEvent.click(await screen.findByRole("button", { name: "登录后新建项目" }));
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    await screen.findByRole("heading", { name: "最近项目" });
    expect(within(screen.getByRole("region", { name: "开始创作" })).getByRole("button", { name: "新建项目" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("角色的半身肖像，柔和侧光");
    expect(readGuestCreationDraft()).toBe("");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
    expect(services.sessionGateway.signInWithPassword).toHaveBeenCalledWith({ account: "creator@reelay.test", password: "reelay-demo" });
  });

  it("keeps an authentication error inside the modal and returns to the home on cancellation", async () => {
    const { services } = setup();
    vi.mocked(services.sessionGateway.signInWithPassword).mockRejectedValue(new ApplicationError("authentication_required", "账号或密码不正确。"));
    fireEvent.click(await screen.findByRole("button", { name: "登录后新建项目" }));
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.change(within(dialog).getByLabelText("密码", { exact: true }), { target: { value: "incorrect" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("账号或密码不正确。");
    expect(within(dialog).getByLabelText("密码", { exact: true })).toHaveValue("incorrect");
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reuses another tab's session without a duplicate login or project creation", async () => {
    const { router, services } = setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "镜头缓缓推近，雨后的街道" } });
    vi.mocked(services.sessionGateway.getCurrent).mockResolvedValue({ actor });
    fireEvent.click(await screen.findByRole("button", { name: "登录后新建项目" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("镜头缓缓推近，雨后的街道");
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it("also preserves real input when the visitor uses the header login button", async () => {
    const { router, services } = setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "晨光中的展厅空间" } });
    fireEvent.click(screen.getByRole("button", { name: "注册/登录" }));
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("晨光中的展厅空间");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps a session-expired homepage draft through login, including cancellation=%s", async (cancelFirst) => {
    const { router, services, setSession } = setup("/app/w/review-workspace", true);
    const prompt = "  雨后的城市街道，镜头缓缓推近  ";
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: prompt } });
    setSession(false);
    vi.mocked(services.projectRepository.create).mockRejectedValueOnce(new ApplicationError("authentication_required", "Session expired"));
    fireEvent.click(within(screen.getByRole("region", { name: "开始创作" })).getByRole("button", { name: "新建项目" }));
    let dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(router.state.location.search).toBe("?returnTo=%2Fw%2Freview-workspace");
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toHaveValue(prompt);
    if (cancelFirst) {
      fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toHaveValue(prompt);
      fireEvent.click(screen.getByRole("button", { name: "注册/登录" }));
      dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
      expect(router.state.location.search).toBe("?returnTo=%2Fw%2Freview-workspace");
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue(prompt);
    expect(services.projectRepository.create).toHaveBeenCalledOnce();
    expect(readGuestCreationDraft("review-workspace")).toBe("");
    expect(window.sessionStorage.getItem("reelay-home-launch-intent")).toBeNull();
  });

  it("does not move an expired draft into a different workspace after login falls back", async () => {
    saveGuestCreationDraft("原工作空间的输入", "original-workspace");
    const { router, services } = setup("/app/login?returnTo=%2Fw%2Foriginal-workspace");
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
    expect(readGuestCreationDraft("original-workspace")).toBe("");
  });

  it("restores the failed input without another login when another tab has renewed the session", async () => {
    const { router, services } = setup("/app/w/review-workspace", true);
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "跨标签续登的输入" } });
    vi.mocked(services.projectRepository.create).mockRejectedValueOnce(new ApplicationError("authentication_required", "Session expired"));
    fireEvent.click(within(screen.getByRole("region", { name: "开始创作" })).getByRole("button", { name: "新建项目" }));
    await waitFor(() => expect(services.sessionGateway.getCurrent).toHaveBeenCalled());
    await waitFor(() => expect(router.state.navigation.state).toBe("idle"));
    expect(router.state.location.pathname).toBe("/app/w/review-workspace");
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("跨标签续登的输入");
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();
    expect(services.projectRepository.create).toHaveBeenCalledOnce();
    expect(readGuestCreationDraft("review-workspace")).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not carry a homepage draft through a project-list login deep link", async () => {
    saveGuestCreationDraft("不能流入项目的输入", "review-workspace");
    const { router, services } = setup("/app/login?returnTo=%2Fw%2Freview-workspace%2Fprojects");
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace/projects"));
    await act(async () => router.navigate("/app/w/review-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it("does not show the current input when navigating to another workspace homepage", async () => {
    const { router, services } = setup("/app/w/review-workspace", true);
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "仅限当前空间" } });
    const otherWorkspace = { ...workspace, id: "other-workspace" };
    vi.mocked(services.workspaceContextGateway.load).mockResolvedValue({ actor, workspaces: [workspace, otherWorkspace], projects: [] });
    await act(async () => router.navigate("/app/w/other-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it("closes a directly opened login URL to a usable visitor homepage", async () => {
    const { router } = setup("/app/login?returnTo=%2Fw%2Freview-workspace%2Fprojects");
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    await act(async () => fireEvent(dialog, new Event("cancel", { cancelable: true })));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/app");
    expect(screen.getByRole("button", { name: "注册/登录" })).toHaveFocus();
  });
});
