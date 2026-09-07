// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppRouteObjects } from "../../app/router";
import type { ApplicationServices } from "../../app/services";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { readGuestCreationDraft } from "./guest-creation-draft";

const actor = { id: "review-actor", account: "creator@reelay.test", displayName: "Hoo", workspaceIds: ["review-workspace"] };
const workspace = { id: "review-workspace", kind: "organization", name: "评审工作室", currentUserRole: "owner" };
let routers: ReturnType<typeof createMemoryRouter>[] = [];

function setup(initialEntry = "/app") {
  let signedIn = false;
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
  return { router, services };
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
  it("keeps the draft and opening control when the login dialog closes", async () => {
    const { router, services } = setup();
    const prompt = await screen.findByRole("textbox", { name: "描述你的创作需求" });
    expect(screen.getByRole("button", { name: "注册/登录" })).toBeEnabled();
    expect(services.workspaceRepository.listForActor).not.toHaveBeenCalled();
    expect(services.workspaceContextGateway.load).not.toHaveBeenCalled();
    fireEvent.change(prompt, { target: { value: "一组清晨的品牌镜头" } });
    const trigger = screen.getByRole("button", { name: "登录后继续创作" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    expect(within(dialog).getByRole("button", { name: "立即注册" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/app");
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toBe(prompt);
    expect(prompt).toHaveValue("一组清晨的品牌镜头");
    expect(trigger).toHaveFocus();
    expect(services.projectRepository.create).not.toHaveBeenCalled();
  });

  it("carries the guest idea into the signed-in composer without creating a project", async () => {
    const { router, services } = setup();
    const prompt = await screen.findByRole("textbox", { name: "描述你的创作需求" });
    fireEvent.change(prompt, { target: { value: "规划一个森林故事" } });
    fireEvent.click(screen.getByRole("button", { name: "登录后继续创作" }));
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    await screen.findByRole("heading", { name: "最近项目" });
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("规划一个森林故事");
    expect(readGuestCreationDraft()).toBe("");
    expect(services.projectRepository.create).not.toHaveBeenCalled();
    expect(services.sessionGateway.signInWithPassword).toHaveBeenCalledWith({ account: "creator@reelay.test", password: "reelay-demo" });
  });

  it("keeps an authentication error inside the modal and clears its handoff on cancellation", async () => {
    const { services } = setup();
    vi.mocked(services.sessionGateway.signInWithPassword).mockRejectedValue(new ApplicationError("authentication_required", "账号或密码不正确。"));
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "失败后保留的想法" } });
    fireEvent.click(screen.getByRole("button", { name: "登录后继续创作" }));
    const dialog = await screen.findByRole("dialog", { name: "欢迎登录" });
    fireEvent.change(within(dialog).getByLabelText("密码", { exact: true }), { target: { value: "incorrect" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "登录" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("账号或密码不正确。");
    expect(within(dialog).getByLabelText("密码", { exact: true })).toHaveValue("incorrect");
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭登录" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(readGuestCreationDraft()).toBe("");
    expect(screen.getByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("失败后保留的想法");
  });

  it("preserves the idea if another tab signs in before this tab opens login", async () => {
    const { router, services } = setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "描述你的创作需求" }), { target: { value: "另一个标签登录前的草稿" } });
    vi.mocked(services.sessionGateway.getCurrent).mockResolvedValue({ actor });
    fireEvent.click(screen.getByRole("button", { name: "登录后继续创作" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/w/review-workspace"));
    expect(await screen.findByRole("textbox", { name: "描述你的创作需求" })).toHaveValue("另一个标签登录前的草稿");
    expect(services.sessionGateway.signInWithPassword).not.toHaveBeenCalled();
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
