// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountSettingsDialog } from "./AccountSettingsDialog";

const actor = {
  account: "creator@reelay.test",
  contactEmail: null,
  contactPhone: null,
  id: "actor-tianmaochao",
  displayName: "田茂超",
  workspaceIds: ["workspace-organization-reelay"],
};

const workspace = {
  id: "workspace-organization-reelay",
  kind: "organization" as const,
  name: "星海视觉工作室",
  currentUserRole: "owner" as const,
};

afterEach(cleanup);

function renderDialog(action = async ({ request }: { request: Request }) => {
  await request.formData();
  return { ok: true };
}) {
  const router = createMemoryRouter(
    [
      {
        path: "/w/:workspaceId",
        element: (
          <AccountSettingsDialog
            actor={actor}
            workspace={workspace}
            open
            onClose={vi.fn()}
          />
        ),
      },
      { path: "/account", action },
    ],
    { initialEntries: ["/w/workspace-organization-reelay"] },
  );
  render(<RouterProvider router={router} />);
}

describe("AccountSettingsDialog", () => {
  it("shows the requested account sections without subscription or device-management placeholders", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "个人主页" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "积分记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "用量看板" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "账户信息" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("creator@reelay.test")).not.toBeInTheDocument();
    expect(screen.getByText("creator@reelay.test")).toBeInTheDocument();
    expect(screen.queryByText("演示账号")).not.toBeInTheDocument();
    expect(screen.queryByText("当前为固定演示账号，昵称、登录标识与头像暂不可修改。")).not.toBeInTheDocument();
    expect(screen.queryByText("Reelay 本地演示")).not.toBeInTheDocument();
    expect(screen.queryByText("订阅")).toBeNull();
    expect(screen.queryByText("设备管理")).toBeNull();
  });

  it("saves valid optional contact details only after explicit confirmation", async () => {
    const submitted = vi.fn();
    renderDialog(async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return { ok: true, notice: "联系资料已保存。" };
    });

    fireEvent.change(screen.getByLabelText(/联系邮箱/), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/手机号码/), { target: { value: "+86 138 0000 0000" } });
    expect(submitted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted).toHaveBeenCalledWith({
      contactEmail: "owner@example.com",
      contactPhone: "+86 138 0000 0000",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("联系资料已保存。");
    expect(screen.getByText("creator@reelay.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存资料" })).toBeDisabled();
  });

  it("does not submit invalid contact details", async () => {
    const submitted = vi.fn();
    renderDialog(async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return { ok: true };
    });

    const emailInput = screen.getByLabelText(/联系邮箱/);
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    expect(emailInput).toBeInvalid();
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(submitted).not.toHaveBeenCalled();
  });

  it("clears a previous success message as soon as contact details change again", async () => {
    renderDialog(async ({ request }) => {
      await request.formData();
      return { ok: true, notice: "联系资料已保存。" };
    });

    const emailInput = screen.getByLabelText(/联系邮箱/);
    fireEvent.change(emailInput, { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("联系资料已保存。"));

    fireEvent.change(emailInput, { target: { value: "changed@example.com" } });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存资料" })).toBeEnabled();
  });

  it("keeps credits and usage honest while their persistent sources do not exist", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "积分记录" }));
    expect(screen.getByRole("heading", { name: "积分记录" })).toBeInTheDocument();
    expect(screen.getByText("暂无积分记录")).toBeInTheDocument();
    expect(screen.getByText("未接入账本")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "用量看板" }));
    expect(screen.getByRole("heading", { name: "用量看板" })).toBeInTheDocument();
    expect(screen.getByText("尚无可统计数据")).toBeInTheDocument();
    expect(screen.getByText(/组织用量/)).toBeInTheDocument();
  });
});
