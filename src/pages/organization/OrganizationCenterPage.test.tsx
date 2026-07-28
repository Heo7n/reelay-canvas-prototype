// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OrganizationRouteData } from "../../app/route-data";
import { OrganizationCenterPage } from "./OrganizationCenterPage";
import { OrganizationSectionRoute, type OrganizationSection } from "./OrganizationSectionRoute";

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

function renderSection(
  section: OrganizationSection,
  data: OrganizationRouteData = routeData,
  loader: () => Promise<OrganizationRouteData> = async () => data,
) {
  const suffix = section === "management" ? "" : `/${section}`;
  const initialEntry = `/w/workspace-organization-reelay/organization${suffix}`;
  const router = createMemoryRouter([
    {
      path: "/w/:workspaceId/organization",
      loader,
      element: <OrganizationCenterPage />,
      children: [
        { index: true, element: <OrganizationSectionRoute section="management" /> },
        { path: "credits", element: <OrganizationSectionRoute section="credits" /> },
        { path: "usage", element: <OrganizationSectionRoute section="usage" /> },
      ],
    },
  ], { initialEntries: [initialEntry] });

  render(<RouterProvider router={router} />);
  return router;
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

  it("keeps organization credit balances clear and opens reconcilable demo records", async () => {
    renderSection("credits");

    expect(await screen.findByRole("heading", { name: "积分管理" })).toBeInTheDocument();
    expect(screen.getByText("100,000")).toBeInTheDocument();
    expect(screen.getByText("33,000")).toBeInTheDocument();
    expect(screen.getByText("67,000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "分配积分" })).toBeNull();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("可用余额")).toBeInTheDocument();
    expect(screen.queryByText("本月消耗")).toBeNull();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调整 Hoo 的积分额度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 Hoo 的积分明细" })).toBeInTheDocument();
    const availableMetric = screen.getByText("组织积分余额");
    const allocatedMetric = screen.getByText("所有成员账户余额");
    const unallocatedMetric = screen.getByText("可分配余额");
    expect(
      availableMetric.compareDocumentPosition(unallocatedMetric) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      unallocatedMetric.compareDocumentPosition(allocatedMetric) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByRole("img", {
      name: "可分配余额 67,000，所有成员账户余额 33,000",
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /可分配余额/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /所有成员账户余额/ })).toBeNull();
    expect(screen.queryByText("5 位成员持有积分")).toBeNull();
    expect(screen.queryByRole("button", { name: "查看组织入账记录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "查看积分分配记录" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "调整 Hoo 的积分额度" }));
    const adjustmentDialog = screen.getByRole("dialog", { name: "调整 Hoo 的积分额度" });
    expect(within(adjustmentDialog).getByText("当前可用余额")).toBeInTheDocument();
    expect(within(adjustmentDialog).getByText("12,000")).toBeInTheDocument();
    expect(within(adjustmentDialog).getByRole("button", { name: "发放积分" })).toBeInTheDocument();
    expect(within(adjustmentDialog).getByRole("button", { name: "回收积分" })).toBeInTheDocument();
    fireEvent.click(within(adjustmentDialog).getByRole("button", { name: "发放积分" }));
    expect(screen.getByText("Hoo 的积分发放流程将在额度规则确认后接入。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看积分流水" }));
    const creditDialog = screen.getByRole("dialog", { name: "积分流水" });
    expect(creditDialog).toBeInTheDocument();
    expect(within(creditDialog).getByRole("tab", { name: "入账" })).toHaveAttribute("aria-selected", "true");
    expect(within(creditDialog).getByText("累计入账积分")).toBeInTheDocument();
    expect(within(creditDialog).getByText("180,000")).toBeInTheDocument();
    expect(within(creditDialog).getByText("共 5 笔")).toBeInTheDocument();
    expect(within(creditDialog).queryByText(/演示数据/)).toBeNull();
    expect(within(creditDialog).queryByText("入账笔数")).toBeNull();
    expect(within(creditDialog).getByRole("table", { name: "组织积分入账流水" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "来源与说明" })).toBeInTheDocument();

    fireEvent.click(within(creditDialog).getByRole("tab", { name: "分配" }));
    expect(within(creditDialog).getByRole("tab", { name: "分配" })).toHaveAttribute("aria-selected", "true");
    expect(within(creditDialog).getByText("额度分配流水")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "筛选成员" })).toHaveValue("");
    const allocationSummaryLabels = within(creditDialog).getAllByText(
      /可分配余额|本月发放|本月回收|所有成员账户余额/,
    );
    expect(allocationSummaryLabels.map((label) => label.textContent)).toEqual([
      "可分配余额",
      "本月发放",
      "本月回收",
      "所有成员账户余额",
    ]);
    expect(within(creditDialog).getByRole("columnheader", { name: "有效期" })).toBeInTheDocument();

    fireEvent.click(within(creditDialog).getByRole("tab", { name: "消耗" }));
    expect(within(creditDialog).getByRole("tab", { name: "消耗" })).toHaveAttribute("aria-selected", "true");
    expect(within(creditDialog).getByText("任务消耗流水")).toBeInTheDocument();
    expect(within(creditDialog).getByText("共 10 条 · 合计消耗 13,500 积分")).toBeInTheDocument();
    expect(within(creditDialog).queryByText("本月消耗")).toBeNull();
    expect(within(creditDialog).queryByText("扣减后余额")).toBeNull();
    expect(within(creditDialog).getByRole("columnheader", { name: "项目" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "任务 / 模型" })).toBeInTheDocument();
    expect(within(creditDialog).getAllByText("已结算")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));

    fireEvent.click(screen.getByRole("button", { name: "查看分配明细" }));
    expect(screen.getByRole("tab", { name: "分配" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox", { name: "筛选成员" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));

    fireEvent.click(screen.getByRole("button", { name: "查看 Hoo 的积分明细" }));
    const memberFilter = screen.getByRole("combobox", { name: "筛选成员" });
    expect(screen.getByRole("tab", { name: "消耗" })).toHaveAttribute("aria-selected", "true");
    expect(memberFilter).toHaveValue("creator@reelay.test");
    expect(
      within(screen.getByRole("table", { name: "任务积分消耗流水" })).getAllByRole("row"),
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "分配" }));
    expect(memberFilter).toHaveValue("creator@reelay.test");
    expect(screen.queryByRole("table", { name: "任务积分消耗流水" })).toBeNull();
    fireEvent.change(memberFilter, { target: { value: "linjing@reelay.test" } });
    expect(memberFilter).toHaveValue("linjing@reelay.test");
    fireEvent.change(memberFilter, { target: { value: "" } });
    expect(memberFilter).toHaveValue("");
  });

  it("presents a coherent organization usage demo for owners", async () => {
    renderSection("usage");

    expect(await screen.findByRole("heading", { name: "用量看板" })).toBeInTheDocument();
    expect(screen.getByText("演示数据 · 更新于 5 分钟前")).toBeInTheDocument();
    expect(screen.getByText("可用积分")).toBeInTheDocument();
    expect(screen.getByText("100,000")).toBeInTheDocument();
    expect(screen.getByText(/近期趋势估算/)).toBeInTheDocument();
    expect(screen.getByText("历史平均参考")).toBeInTheDocument();
    expect(screen.getByText(/近期日均较历史/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "365 天活动" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "期间用量" })).toBeInTheDocument();
    expect(screen.getByText("图片产出")).toBeInTheDocument();
    expect(screen.getByText("视频产出")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "消耗构成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "每日" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "每周" }));
    expect(screen.getByRole("button", { name: "每周" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "累计" }));
    expect(screen.getByRole("img", { name: "近 365 天按周累计积分消耗" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "成员" }));
    expect(screen.getByRole("button", { name: "成员" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getAllByRole("button", { name: /查看.*消耗明细/ })[0]);
    expect(screen.getByRole("dialog", { name: /消耗明细/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /消耗记录/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭消耗明细" }));
    expect(screen.getByRole("link", { name: "前往积分管理" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "流水明细" })).toBeNull();
  });

  it("keeps organization usage private from regular members", async () => {
    renderSection("usage", {
      ...routeData,
      currentWorkspace: {
        ...routeData.currentWorkspace,
        currentUserRole: "member",
      },
    });

    expect(await screen.findByText("此页面仅对主账户与管理员开放")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用量看板" })).not.toBeInTheDocument();
    expect(screen.queryByText("可用积分")).not.toBeInTheDocument();
  });

  it("reuses organization data while switching between center sections", async () => {
    const loader = vi.fn(async () => routeData);
    renderSection("management", routeData, loader);

    expect(await screen.findByRole("heading", { name: "组织管理" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("link", { name: "积分管理" }));
    expect(await screen.findByRole("heading", { name: "积分管理" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("link", { name: "用量看板" }));
    expect(await screen.findByRole("heading", { name: "用量看板" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();
  });
});
