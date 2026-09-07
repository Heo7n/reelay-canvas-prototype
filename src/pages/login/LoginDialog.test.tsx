// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginDialog } from "./LoginDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
      // Model native dialog focus selection, including the first control fallback.
      const focusTarget = this.querySelector<HTMLElement>("[autofocus]")
        ?? this.querySelector<HTMLElement>("button:not([disabled]), a[href], input:not([disabled])");
      focusTarget?.focus();
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LoginDialog", () => {
  it("gives native opening focus to the account so the media carousel starts automatically", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const router = createMemoryRouter([{ path: "/", element: <LoginDialog action="/" onClose={vi.fn()} /> }]);
    render(<RouterProvider router={router} />);

    expect(screen.getByLabelText("账号")).toHaveAttribute("autofocus");
    expect(screen.getByLabelText("账号")).toHaveFocus();
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
  });

  it("keeps registration unavailable and restores focus and scroll on dismissal", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const router = createMemoryRouter([{ path: "/", element: <LoginDialog action="/" onClose={onClose} /> }]);
    const { unmount } = render(<RouterProvider router={router} />);

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "欢迎登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即注册" })).toBeDisabled();
    expect(screen.queryByText("暂未开放")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用条款" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "隐私政策" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "使用条款" }).closest("p"))
      .toHaveTextContent("继续即表示您同意 使用条款 和 隐私政策");
    expect(screen.getByLabelText("账号")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "立即注册" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("shows a transient demo notice inside the dialog each time it opens without taking focus", () => {
    vi.useFakeTimers();
    const router = createMemoryRouter([{ path: "/", element: <LoginDialog action="/" onClose={vi.fn()} /> }]);
    const firstOpen = render(<RouterProvider router={router} />);
    const notice = screen.getByRole("status");
    expect(screen.getByRole("dialog")).toContainElement(notice);
    expect(notice).toHaveTextContent("已填入演示账号，可直接登录。");
    expect(screen.getByLabelText("账号")).toHaveFocus();
    act(() => vi.advanceTimersByTime(3799));
    expect(notice).toHaveTextContent("已填入演示账号，可直接登录。");
    act(() => vi.advanceTimersByTime(1));
    expect(notice).toBeEmptyDOMElement();
    expect(screen.queryByText("已填入演示账号，可直接登录。")).not.toBeInTheDocument();
    expect(screen.getByLabelText("账号")).toHaveFocus();
    firstOpen.unmount();

    render(<RouterProvider router={router} />);
    expect(screen.getByRole("status")).toHaveTextContent("已填入演示账号，可直接登录。");
    expect(screen.getByLabelText("账号")).toHaveFocus();
  });

  it("keeps input and blocks dismissal and repeat submits through submission and loading", async () => {
    let finishAction!: (value: { error: string }) => void;
    let finishReload!: (value: null) => void;
    const actionGate = new Promise<{ error: string }>((resolve) => { finishAction = resolve; });
    const reloadGate = new Promise<null>((resolve) => { finishReload = resolve; });
    const onBeforeSubmit = vi.fn();
    const onClose = vi.fn();
    const received = vi.fn();
    let loads = 0;
    const router = createMemoryRouter([{
      path: "/",
      loader: () => ++loads === 1 ? null : reloadGate,
      action: async ({ request }) => {
        received(Object.fromEntries(await request.formData()));
        return actionGate;
      },
      element: <LoginDialog action="/" onClose={onClose} onBeforeSubmit={onBeforeSubmit} />,
    }]);
    render(<RouterProvider router={router} />);
    const account = await screen.findByLabelText("账号");
    const password = screen.getByLabelText("密码", { exact: true });
    fireEvent.change(account, { target: { value: "wrong@reelay.test" } });
    fireEvent.change(password, { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(received).toHaveBeenCalledWith({ account: "wrong@reelay.test", password: "wrong-password" }));
    expect(onBeforeSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "正在登录…" })).toBeDisabled();
    expect(account).toHaveAttribute("readonly");
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    fireEvent.click(screen.getByRole("button", { name: "关闭登录" }));
    fireEvent.submit(account.closest("form")!);
    expect(onClose).not.toHaveBeenCalled();
    expect(onBeforeSubmit).toHaveBeenCalledTimes(1);
    await act(async () => { finishAction({ error: "账号或密码不正确。" }); });
    await waitFor(() => expect(router.state.navigation.state).toBe("loading"));
    expect(screen.getByRole("button", { name: "关闭登录" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finishReload(null); });
    expect(await screen.findByRole("alert")).toHaveTextContent("账号或密码不正确。");
    expect(account).toHaveValue("wrong@reelay.test");
    expect(password).toHaveValue("wrong-password");
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
  });
});
