// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { OrganizationRouteData } from "../../app/route-data";
import { OrganizationCenterPage, type OrganizationSection } from "./OrganizationCenterPage";

const routeData: OrganizationRouteData = {
  actor: {
    account: "creator@reelay.test",
    id: "actor-owner",
    displayName: "Hoo",
    workspaceIds: ["workspace-organization-reelay"],
  },
  currentWorkspace: {
    id: "workspace-organization-reelay",
    kind: "organization",
    name: "星海视觉工作室",
    currentUserRole: "owner",
  },
  workspaces: [],
  members: [
    {
      userId: "actor-owner",
      displayName: "Hoo",
      loginIdentifier: "creator@reelay.test",
      role: "owner",
    },
    {
      userId: "actor-linjing",
      displayName: "林静",
      loginIdentifier: "linjing@reelay.test",
      role: "admin",
    },
  ],
};

afterEach(cleanup);

function renderSection(section: OrganizationSection, data: OrganizationRouteData = routeData) {
  const suffix = section === "management" ? "" : `/${section}`;
  const routePath = `/w/:workspaceId/organization${suffix}`;
  const initialEntry = `/w/workspace-organization-reelay/organization${suffix}`;
  const router = createMemoryRouter([
    {
      path: routePath,
      loader: async () => data,
      element: <OrganizationCenterPage section={section} />,
    },
  ], { initialEntries: [initialEntry] });

  render(<RouterProvider router={router} />);
}

describe("organization center", () => {
  it("keeps organization information and member management on one page", async () => {
    renderSection("management");

    expect(await screen.findByRole("heading", { name: "组织管理" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "成员管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByText("2 位成员")).toBeInTheDocument();
    expect(screen.getByText("组织 ID：REELAY-7X29M4")).toBeInTheDocument();
    expect(screen.queryByText("组织信息")).toBeNull();
    expect(screen.queryByText(/当前身份/)).toBeNull();
    expect(screen.queryByText("2 位组织成员")).toBeNull();
    expect(screen.queryByLabelText("打开账户菜单")).toBeNull();
    expect(screen.getByRole("button", { name: "更改组织名称" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更改组织头像" })).toBeInTheDocument();
    expect(screen.getByText("linjing@reelay.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "调整 林静 的组织角色" }));
    expect(screen.getByRole("dialog", { name: "调整 林静 的组织角色" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "成员" }));
    expect(screen.getByText(/林静 已在本页显示为成员/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "管理 林静 的账号" }));
    const memberPopover = screen.getByRole("dialog", { name: "管理 林静 的账号" });
    expect(memberPopover).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置登录密码" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用账号" })).toBeInTheDocument();
    expect(memberPopover).not.toHaveTextContent("组织角色");
    expect(screen.queryByText(/查看现有密码/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "停用账号" }));
    expect(screen.queryByRole("dialog", { name: "管理 林静 的账号" })).toBeNull();
    expect(screen.queryByText("已停用")).toBeNull();
    expect(screen.getByText("林静").closest("[data-account-disabled='true']")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "管理 林静 的账号" }));
    expect(screen.getByRole("button", { name: "恢复账号" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "恢复账号" }));
    expect(screen.queryByText("已停用")).toBeNull();
  });

  it("closes the temporary role selector after clicking elsewhere", async () => {
    renderSection("management");

    fireEvent.click(await screen.findByRole("button", { name: "调整 林静 的组织角色" }));
    expect(screen.getByRole("dialog", { name: "调整 林静 的组织角色" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "调整 林静 的组织角色" })).toBeNull();
  });

  it("lets administrators adjust other non-owner members without editing themselves", async () => {
    const adminData: OrganizationRouteData = {
      ...routeData,
      actor: {
        ...routeData.actor,
        id: "actor-linjing",
        displayName: "林静",
        account: "linjing@reelay.test",
      },
      currentWorkspace: {
        ...routeData.currentWorkspace,
        currentUserRole: "admin",
      },
      members: [
        ...routeData.members,
        {
          userId: "actor-chenxi",
          displayName: "陈曦",
          loginIdentifier: "chenxi@reelay.test",
          role: "member",
        },
      ],
    };
    renderSection("management", adminData);

    expect(await screen.findByRole("heading", { name: "组织管理" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整 Hoo 的组织角色" })).toBeNull();
    expect(screen.queryByRole("button", { name: "调整 林静 的组织角色" })).toBeNull();
    expect(screen.getByRole("button", { name: "调整 陈曦 的组织角色" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更改组织名称" })).toBeNull();
    expect(screen.queryByRole("button", { name: "管理 Hoo 的账号" })).toBeNull();
    expect(screen.getByRole("button", { name: "管理 林静 的账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理 陈曦 的账号" })).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "管理 林静 的账号" }));
    expect(screen.getByRole("button", { name: "重置登录密码" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用账号" })).toBeNull();

    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: "管理 陈曦 的账号" }));
    expect(screen.getByRole("button", { name: "停用账号" })).toBeInTheDocument();
  });

  it("opens credit records from the metric cards while marking them as prototype data", async () => {
    renderSection("credits");

    expect(await screen.findByRole("heading", { name: "积分管理" })).toBeInTheDocument();
    expect(screen.getByText("67,000")).toBeInTheDocument();
    expect(screen.queryByText("原型演示数据")).toBeNull();
    expect(screen.queryByText("当前演示口径")).toBeNull();
    expect(screen.queryByText("成员额度首版按组织子账户展示，项目预算暂不加入。")).toBeNull();
    expect(screen.queryByRole("button", { name: "分配积分" })).toBeNull();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("可用余额")).toBeInTheDocument();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "为 Hoo 发放积分" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回收 Hoo 的积分" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 Hoo 的积分记录" })).toBeInTheDocument();
    const incomeMetric = screen.getByText("累计入账积分");
    const allocatedMetric = screen.getByText("已分配积分");
    const unallocatedMetric = screen.getByText("未分配积分");
    expect(
      incomeMetric.compareDocumentPosition(allocatedMetric) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      allocatedMetric.compareDocumentPosition(unallocatedMetric) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /累计入账积分/ }));
    expect(screen.getByRole("dialog", { name: "入账记录" })).toBeInTheDocument();
    expect(screen.getByText(/尚未接入 CreditLedger/)).toBeInTheDocument();
  });

  it("keeps usage metrics empty until task and ledger data exist", async () => {
    renderSection("usage");

    expect(await screen.findByRole("heading", { name: "用量看板" })).toBeInTheDocument();
    expect(screen.getByText("等待真实生成任务与积分账本")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
});
