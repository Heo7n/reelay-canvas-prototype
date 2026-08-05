// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("keeps personal account settings focused on profile and personal credits", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "个人主页" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "我的积分" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "我的用量" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "用量看板" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "账户信息" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("creator@reelay.test")).not.toBeInTheDocument();
    expect(screen.getByText("creator@reelay.test")).toBeInTheDocument();
    expect(screen.queryByText("演示账号")).not.toBeInTheDocument();
    expect(screen.queryByText("当前为固定演示账号，昵称、登录标识与头像暂不可修改。")).not.toBeInTheDocument();
    expect(screen.queryByText("Reelay 本地演示")).not.toBeInTheDocument();
    expect(screen.queryByText("订阅")).toBeNull();
    expect(screen.queryByText("设备管理")).toBeNull();
  });

  it("automatically saves valid optional contact details", async () => {
    const submitted = vi.fn();
    renderDialog(async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return { ok: true, notice: "联系资料已保存。" };
    });

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("手机"), { target: { value: "+86 138 0000 0000" } });
    fireEvent.blur(screen.getByLabelText("手机"));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(submitted).toHaveBeenCalledWith({
      contactEmail: "owner@example.com",
      contactPhone: "+86 138 0000 0000",
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已自动保存"));
    expect(screen.getByText("creator@reelay.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存资料" })).not.toBeInTheDocument();
  });

  it("does not submit invalid contact details", async () => {
    const submitted = vi.fn();
    renderDialog(async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return { ok: true };
    });

    const emailInput = screen.getByLabelText("邮箱");
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    expect(emailInput).toBeInvalid();
    fireEvent.blur(emailInput);

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(submitted).not.toHaveBeenCalled();
  });

  it("clears a previous auto-save message as soon as contact details change again", async () => {
    renderDialog(async ({ request }) => {
      await request.formData();
      return { ok: true, notice: "联系资料已保存。" };
    });

    const emailInput = screen.getByLabelText("邮箱");
    fireEvent.change(emailInput, { target: { value: "owner@example.com" } });
    fireEvent.blur(emailInput);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已自动保存"));

    fireEvent.change(emailInput, { target: { value: "changed@example.com" } });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存资料" })).not.toBeInTheDocument();
  });

  it("preserves newer edits while a previous auto-save request is in flight", async () => {
    const submitted: Array<Record<string, FormDataEntryValue>> = [];
    let releaseFirstSave: (() => void) | null = null;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    renderDialog(async ({ request }) => {
      submitted.push(Object.fromEntries(await request.formData()));
      if (submitted.length === 1) await firstSave;
      return { ok: true, notice: "联系资料已保存。" };
    });

    const emailInput = screen.getByLabelText("邮箱");
    fireEvent.change(emailInput, { target: { value: "first@example.com" } });
    fireEvent.blur(emailInput);
    await waitFor(() => expect(submitted).toHaveLength(1));

    fireEvent.change(emailInput, { target: { value: "latest@example.com" } });
    fireEvent.blur(emailInput);
    expect(emailInput).toHaveValue("latest@example.com");

    await act(async () => {
      releaseFirstSave?.();
      await firstSave;
    });

    await waitFor(() => expect(submitted).toHaveLength(2));
    expect(submitted[0]).toEqual({
      contactEmail: "first@example.com",
      contactPhone: "",
    });
    expect(submitted[1]).toEqual({
      contactEmail: "latest@example.com",
      contactPhone: "",
    });
    expect(emailInput).toHaveValue("latest@example.com");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已自动保存"));
  });

  it("combines personal analysis and gain or consumption entries under personal credits", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "我的积分" }));
    expect(screen.getByRole("heading", { name: "我的积分" })).toBeInTheDocument();
    expect(screen.getByText("可用积分")).toBeInTheDocument();
    expect(screen.getByText("本月获得")).toBeInTheDocument();
    expect(screen.getByText("本月消耗")).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "积分流水" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("积分变化")).toBeInTheDocument();
    expect(screen.getByText("任务类型")).toBeInTheDocument();
    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("生成规格")).toBeInTheDocument();
    const ledgerFilter = screen.getByRole("button", {
      name: "筛选个人积分流水，当前无筛选",
    });
    fireEvent.click(ledgerFilter);
    expect(screen.getByRole("button", { name: "获得" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "消耗" })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "选择个人流水开始日期，当前未选择",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "选择个人流水结束日期，当前未选择",
    })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /个人流水/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "获得" }));
    expect(screen.getByRole("button", {
      name: "筛选个人积分流水，当前1项筛选",
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getAllByText("组织发放").length).toBeGreaterThan(0);
    expect(screen.getAllByText("任务消耗").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", {
      name: "筛选个人积分流水，当前无筛选",
    })).toBeInTheDocument();
    expect(screen.getByText(/^共 \d+ 条$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 1 页" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByRole("button", { name: "第 2 页" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("tab", { name: "用量分析" }));
    expect(screen.getByRole("tab", { name: "用量分析" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("消耗积分")).toBeInTheDocument();
    expect(screen.getByText("任务数量")).toBeInTheDocument();
    expect(screen.getByText("平均单任务")).toBeInTheDocument();
    expect(screen.getByText("消耗构成")).toBeInTheDocument();
    expect(screen.getByText("消耗来源")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日明细" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按项目" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "按模型" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "近 30 天个人积分消耗走势" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "日明细" }));
    expect(screen.getByRole("table", { name: "近 30 天个人每日用量明细" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "按模型" }));
    expect(screen.getByRole("button", { name: "按模型" })).toHaveAttribute("aria-pressed", "true");
  });
});
