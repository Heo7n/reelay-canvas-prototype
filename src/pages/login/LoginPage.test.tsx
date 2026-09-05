// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  createMemoryRouter,
  RouterProvider,
  type ActionFunction,
} from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPage } from "./LoginPage";

afterEach(cleanup);

function renderLoginPage(
  initialEntry = "/login",
  action: ActionFunction = async () => null,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/login",
        action,
        element: <LoginPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("LoginPage", () => {
  it("offers discoverable owner, admin, and member demo identities and restores the demo password", async () => {
    renderLoginPage();

    const account = await screen.findByLabelText("账号");
    const password = screen.getByLabelText("密码");
    const owner = screen.getByRole("button", { name: /主账户演示身份/ });
    const admin = screen.getByRole("button", { name: /管理员演示身份/ });
    const member = screen.getByRole("button", { name: /成员演示身份/ });

    expect(owner).toHaveAttribute("aria-pressed", "true");
    expect(account).toHaveValue("creator@reelay.test");
    expect(password).toHaveValue("reelay-demo");

    fireEvent.change(password, { target: { value: "temporary-value" } });
    fireEvent.click(admin);
    expect(account).toHaveValue("linjing@reelay.test");
    expect(password).toHaveValue("reelay-demo");
    expect(admin).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(member);
    expect(account).toHaveValue("chenxi@reelay.test");
    expect(member).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/请勿输入真实凭据/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google 登录.*暂未开放/ })).toBeDisabled();
  });

  it("toggles password visibility without changing the credential", async () => {
    renderLoginPage();

    const password = await screen.findByLabelText("密码");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("reelay-demo");

    fireEvent.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("shows an honest registration explanation and preserves the return target", async () => {
    const returnTo = "/w/workspace-organization/projects?kind=collaborative";
    const router = renderLoginPage(`/login?returnTo=${encodeURIComponent(returnTo)}`);

    fireEvent.click(await screen.findByRole("button", { name: "查看注册说明" }));

    expect(await screen.findByRole("heading", { name: "注册暂未开放" })).toBeInTheDocument();
    expect(screen.getByText(/不会创建账号、发送验证码或收集联系方式/)).toBeInTheDocument();
    expect(screen.queryByLabelText("账号")).not.toBeInTheDocument();

    let params = new URLSearchParams(router.state.location.search);
    expect(params.get("mode")).toBe("register");
    expect(params.get("returnTo")).toBe(returnTo);

    fireEvent.click(screen.getByRole("button", { name: "返回演示登录" }));
    expect(await screen.findByRole("heading", { name: "登录 Reelay" })).toBeInTheDocument();

    params = new URLSearchParams(router.state.location.search);
    expect(params.has("mode")).toBe(false);
    expect(params.get("returnTo")).toBe(returnTo);
  });

  it("renders route action errors as an associated alert", async () => {
    renderLoginPage("/login", async () => ({ error: "演示账号或密码错误。" }));

    fireEvent.click(await screen.findByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("演示账号或密码错误。");
    expect(screen.getByLabelText("账号")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("密码")).toHaveAttribute("aria-describedby", expect.stringContaining("login-error"));
  });
});
