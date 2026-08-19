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
  returnTo?: string,
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
    {
      path: "/w/:workspaceId/projects/:projectId/canvases/:canvasId",
      element: <p>canvas origin</p>,
    },
    {
      path: "/w/:workspaceId",
      element: <p>workspace origin</p>,
    },
  ], {
    initialEntries: [{
      pathname: initialEntry,
      state: returnTo ? { organizationReturnTo: returnTo } : undefined,
    }],
  });

  render(<RouterProvider router={router} />);
  return router;
}

describe("organization center", () => {
  it("keeps organization information and member management on one page", async () => {
    renderSection("management");

    expect(await screen.findByRole("heading", { name: "组织信息" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "成员管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByText("2 位成员")).toBeInTheDocument();
    expect(screen.getByText("组织 ID：REELAY-7X29M4")).toBeInTheDocument();
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

  it("returns to the recorded application source after switching organization sections", async () => {
    const canvasPath = "/w/workspace-organization-reelay/projects/project-one/canvases/main";
    renderSection("management", routeData, async () => routeData, canvasPath);

    fireEvent.click(await screen.findByRole("link", { name: "积分管理" }));
    expect(await screen.findByRole("heading", { name: "积分管理" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(await screen.findByText("canvas origin")).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "组织信息" })).toBeInTheDocument();
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
    expect(screen.queryByText(/最近变动/)).toBeNull();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调整 Hoo 的积分额度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 Hoo 的账户变动记录" })).toBeInTheDocument();
    expect(screen.queryByText("组织余额与成员账户")).toBeNull();
    expect(screen.queryByRole("button", { name: "查看积分流水" })).toBeNull();
    expect(screen.getByRole("heading", { name: "组织积分账户" })).toBeInTheDocument();
    const availableMetric = screen.getByText("积分余量");
    const allocatedMetric = screen.getByText("成员账户积分");
    const unallocatedMetric = screen.getByText("未分配积分");
    expect(
      availableMetric.compareDocumentPosition(unallocatedMetric) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      unallocatedMetric.compareDocumentPosition(allocatedMetric) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByRole("img", {
      name: "未分配积分 67,000，成员账户积分 33,000",
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /未分配积分/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /成员账户积分/ })).toBeNull();
    expect(screen.queryByText("5 位成员持有积分")).toBeNull();
    expect(screen.queryByRole("button", { name: "查看组织入账记录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "查看积分分配记录" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "调整 Hoo 的积分额度" }));
    const adjustmentDialog = screen.getByRole("dialog", { name: "调整 Hoo 的积分额度" });
    expect(within(adjustmentDialog).getByText("当前余额")).toBeInTheDocument();
    expect(within(adjustmentDialog).getByText("12,000")).toBeInTheDocument();
    expect(within(adjustmentDialog).getByRole("button", { name: "发放" })).toHaveAttribute("aria-pressed", "true");
    expect(within(adjustmentDialog).getByRole("button", { name: "回收" })).toBeInTheDocument();
    expect(within(adjustmentDialog).getByText("组织未分配余额 67,000")).toBeInTheDocument();
    const creditAmountInput = within(adjustmentDialog).getByRole("spinbutton", { name: "积分数量" });
    const grantConfirm = within(adjustmentDialog).getByRole("button", { name: "确认发放" });
    expect(grantConfirm).toBeDisabled();
    fireEvent.change(creditAmountInput, { target: { value: "1000" } });
    expect(grantConfirm).toBeEnabled();
    fireEvent.click(grantConfirm);
    expect(screen.getByText("已为 Hoo 提交 1,000 积分发放。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看积分变动记录" }));
    const creditDialog = screen.getByRole("dialog", { name: "积分变动记录" });
    expect(creditDialog).toBeInTheDocument();
    expect(within(creditDialog).getByRole("tab", { name: "入账记录" })).toHaveAttribute("aria-selected", "true");
    expect(within(creditDialog).getByText(/累计入账/)).toBeInTheDocument();
    expect(within(creditDialog).getByText("180,000")).toBeInTheDocument();
    expect(within(creditDialog).getByText(/共 5 笔/)).toBeInTheDocument();
    expect(within(creditDialog).queryByText(/演示数据/)).toBeNull();
    expect(within(creditDialog).queryByText("入账笔数")).toBeNull();
    expect(within(creditDialog).getByRole("table", { name: "组织积分入账记录" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "来源与说明" })).toBeInTheDocument();
    const rangeButton = within(creditDialog).getByRole("button", {
      name: "筛选记录时间，当前全部时间",
    });
    fireEvent.click(rangeButton);
    const ledgerRangeMenu = within(creditDialog).getByRole("group", {
      name: "记录时间范围",
    });
    expect(within(ledgerRangeMenu).getByRole("button", { name: "全部时间" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(ledgerRangeMenu).getByRole("button", { name: "自定义" }));
    fireEvent.change(within(creditDialog).getByLabelText("记录开始日期"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(within(creditDialog).getByLabelText("记录结束日期"), {
      target: { value: "2026-06-30" },
    });
    expect(within(creditDialog).getByText("2026-06-20")).toBeInTheDocument();
    expect(within(creditDialog).queryByText("2026-07-20")).toBeNull();
    fireEvent.click(within(creditDialog).getByRole("tab", { name: "分配记录" }));
    expect(within(creditDialog).getByText("当前时间范围内暂无分配记录")).toBeInTheDocument();
    expect(within(creditDialog).getByRole("button", {
      name: "筛选记录时间，当前2026-06-01 至 2026-06-30",
    })).toBeInTheDocument();
    fireEvent.click(within(creditDialog).getByRole("tab", { name: "入账记录" }));
    fireEvent.click(within(ledgerRangeMenu).getByRole("button", { name: "全部时间" }));

    const creditExportButton = within(creditDialog).getByRole("button", {
      name: "导出积分账户流水",
    });
    fireEvent.click(creditExportButton);
    const exportMenu = creditExportButton.closest("details");
    expect(exportMenu).not.toBeNull();
    expect(within(exportMenu as HTMLDetailsElement).queryByRole("combobox", {
      name: "记录时间范围",
    })).toBeNull();
    expect(within(creditDialog).getByRole("button", {
      name: "导出全部积分账户流水为 Excel",
    })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("button", {
      name: "导出当前入账记录为 CSV",
    })).toBeInTheDocument();
    fireEvent.click(creditExportButton);

    fireEvent.click(within(creditDialog).getByRole("tab", { name: "分配记录" }));
    expect(within(creditDialog).getByRole("tab", { name: "分配记录" })).toHaveAttribute("aria-selected", "true");
    expect(within(creditDialog).getByRole("heading", { name: "发放与回收明细" })).toBeInTheDocument();
    expect(within(creditDialog).queryByText("全部成员账户")).toBeNull();
    expect(within(creditDialog).getByText(/共 10 笔/)).toBeInTheDocument();
    expect(within(creditDialog).queryByRole("combobox", { name: "筛选成员" })).toBeNull();
    expect(within(creditDialog).getByText(/已发放/)).toBeInTheDocument();
    expect(within(creditDialog).getByText(/已回收/)).toBeInTheDocument();
    expect(within(creditDialog).queryByText("可分配余额")).toBeNull();
    expect(within(creditDialog).queryByText("所有成员账户余额")).toBeNull();
    expect(within(creditDialog).getByRole("columnheader", { name: "有效期" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "操作人" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "备注" })).toBeInTheDocument();
    expect(within(creditDialog).queryByRole("columnheader", { name: "操作信息" })).toBeNull();
    expect(within(creditDialog).getAllByText("永久").length).toBeGreaterThan(0);
    expect(within(creditDialog).getAllByText("截至").length).toBeGreaterThan(0);
    expect(within(creditDialog).getByText("至 2026-08-24")).toBeInTheDocument();
    expect(within(creditDialog).queryByText(/^余额 \d/)).toBeNull();

    fireEvent.click(within(creditDialog).getByRole("tab", { name: "消耗记录" }));
    expect(within(creditDialog).getByRole("tab", { name: "消耗记录" })).toHaveAttribute("aria-selected", "true");
    expect(within(creditDialog).getByText("任务消耗")).toBeInTheDocument();
    expect(within(creditDialog).queryByText("全部成员账户")).toBeNull();
    expect(within(creditDialog).getByText(/共 10 条 · 合计消耗/)).toBeInTheDocument();
    expect(within(creditDialog).getByText("13,500")).toBeInTheDocument();
    expect(within(creditDialog).queryByText("本月消耗")).toBeNull();
    expect(within(creditDialog).queryByText("扣减后余额")).toBeNull();
    expect(within(creditDialog).getByRole("columnheader", { name: "项目" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "任务类型" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "模型" })).toBeInTheDocument();
    expect(within(creditDialog).getByRole("columnheader", { name: "生成规格" })).toBeInTheDocument();
    expect(within(creditDialog).queryByRole("columnheader", { name: "结算状态" })).toBeNull();
    fireEvent.click(within(creditDialog).getByRole("button", { name: "筛选" }));
    const consumptionFilters = within(creditDialog).getByRole("group", {
      name: "筛选消耗记录",
    });
    expect(within(consumptionFilters).getAllByRole("combobox")).toHaveLength(3);
    expect(within(consumptionFilters).getByRole("combobox", { name: "筛选成员" })).toBeInTheDocument();
    expect(within(consumptionFilters).getByRole("combobox", { name: "任务类型" })).toBeInTheDocument();
    expect(within(consumptionFilters).getByRole("combobox", { name: "模型" })).toBeInTheDocument();
    expect(within(consumptionFilters).queryByRole("combobox", { name: "清晰度" })).toBeNull();
    fireEvent.change(within(consumptionFilters).getByRole("combobox", { name: "筛选成员" }), {
      target: { value: "creator@reelay.test" },
    });
    expect(
      within(screen.getByRole("table", { name: "任务积分消耗记录" })).getAllByRole("row"),
    ).toHaveLength(3);
    fireEvent.change(within(consumptionFilters).getByRole("combobox", { name: "任务类型" }), {
      target: { value: "图片生成" },
    });
    expect(
      within(screen.getByRole("table", { name: "任务积分消耗记录" })).getAllByRole("row"),
    ).toHaveLength(2);
    expect(within(creditDialog).getByText("2K · 1:1 · 4 张")).toBeInTheDocument();
    fireEvent.click(within(creditDialog).getByRole("button", { name: "清除筛选" }));
    expect(within(consumptionFilters).getByRole("combobox", { name: "筛选成员" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));

    fireEvent.click(screen.getByRole("button", { name: "查看积分变动记录" }));
    expect(screen.getByRole("tab", { name: "入账记录" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));

    fireEvent.click(screen.getByRole("button", { name: "查看 Hoo 的账户变动记录" }));
    const memberDialog = screen.getByRole("dialog", { name: "Hoo 账户记录" });
    expect(within(memberDialog).getByText("creator@reelay.test")).toBeInTheDocument();
    expect(within(memberDialog).getByText("可用余额")).toBeInTheDocument();
    expect(within(memberDialog).getByRole("heading", { name: "额度变动" })).toBeInTheDocument();
    expect(within(memberDialog).getByRole("heading", { name: "消耗明细" })).toBeInTheDocument();
    expect(within(memberDialog).queryByRole("tab")).toBeNull();
    expect(within(memberDialog).queryByRole("button", {
      name: "导出积分账户流水",
    })).toBeNull();
    expect(within(memberDialog).queryByRole("combobox", { name: "筛选成员" })).toBeNull();
    expect(within(memberDialog).getByRole("table", { name: "Hoo额度变动记录" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("table", { name: "Hoo积分消耗明细" })).getAllByRole("row"),
    ).toHaveLength(3);
  });

  it("presents a coherent organization usage demo for owners", async () => {
    renderSection("usage");

    expect(await screen.findByRole("heading", { name: "用量看板" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByText("可用积分")).toBeInTheDocument();
    expect(screen.getByText("100,000")).toBeInTheDocument();
    expect(screen.getByText("预计可用天数")).toBeInTheDocument();
    expect(screen.getByText("按近30天日均消耗估算")).toBeInTheDocument();
    expect(screen.getByText("近30天日均")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出报表" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "用量分析" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "消耗类型" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "时间分布" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "消耗来源" })).toBeInTheDocument();
    expect(screen.getByText("视频生成")).toBeInTheDocument();
    expect(screen.getByText("图片生成")).toBeInTheDocument();
    expect(screen.getAllByText("媒体处理").length).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: "近7天" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("近7天每日积分消耗")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "模型" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "项目" }));
    expect(screen.getByRole("button", { name: "项目" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getAllByRole("button", { name: /查看.*用量详情/ })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭消耗明细" }));

    fireEvent.click(screen.getByRole("button", { name: "近30天" }));
    expect(screen.getByRole("button", { name: "近30天" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: /近30天每日堆叠柱形图/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /总消耗.*积分/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "成员" }));
    expect(screen.getByRole("button", { name: "成员" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies usage date ranges only after confirmation and remembers the selection", async () => {
    renderSection("usage");
    await screen.findByRole("heading", { name: "用量看板" });

    const rolling7Button = screen.getByRole("button", { name: "近7天" });
    expect(rolling7Button).toHaveAttribute("aria-pressed", "true");

    const dateRangeButton = screen.getByRole("button", { name: "日期范围" });
    fireEvent.click(dateRangeButton);
    const dialog = screen.getByRole("dialog", { name: "选择日期范围" });
    const startInput = within(dialog).getByLabelText("开始日期") as HTMLInputElement;
    const endInput = within(dialog).getByLabelText("结束日期") as HTMLInputElement;
    const current = new Date();
    expect(startInput.value).toBe(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`,
    );
    expect(endInput.value).toBe(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${
        String(current.getDate()).padStart(2, "0")
      }`,
    );

    fireEvent.change(startInput, { target: { value: endInput.value } });
    expect(rolling7Button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "选择日期范围" })).toBeNull();
    expect(dateRangeButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(dateRangeButton);
    const customDialog = screen.getByRole("dialog", { name: "选择日期范围" });
    const todayValue = `${current.getFullYear()}-${
      String(current.getMonth() + 1).padStart(2, "0")
    }-${String(current.getDate()).padStart(2, "0")}`;
    fireEvent.change(within(customDialog).getByLabelText("结束日期"), {
      target: { value: todayValue },
    });
    fireEvent.change(
      within(screen.getByRole("dialog", { name: "选择日期范围" }))
        .getByLabelText("开始日期"),
      { target: { value: todayValue } },
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "选择日期范围" }))
        .getByRole("button", { name: "应用" }),
    );
    expect(dateRangeButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(dateRangeButton);
    const retainedDialog = screen.getByRole("dialog", { name: "选择日期范围" });
    expect(within(retainedDialog).getByLabelText("开始日期")).toHaveValue(todayValue);
    expect(within(retainedDialog).getByLabelText("结束日期")).toHaveValue(todayValue);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "选择日期范围" })).toBeNull();
    fireEvent.click(dateRangeButton);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "选择日期范围" })).toBeNull();
  });

  it("gives regular members a read-only organization directory and redirects restricted sections", async () => {
    const memberData: OrganizationRouteData = {
      ...routeData,
      actor: {
        ...routeData.actor,
        id: "actor-chenxi",
        displayName: "陈曦",
        account: "chenxi@reelay.test",
      },
      currentWorkspace: {
        ...routeData.currentWorkspace,
        currentUserRole: "member",
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
    const router = renderSection("usage", memberData);

    expect(await screen.findByRole("heading", { name: "组织信息" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "组织成员" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "组织信息" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "积分管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "用量看板" })).not.toBeInTheDocument();
    expect(screen.getByText("creator@reelay.test")).toBeInTheDocument();
    expect(screen.getByText("linjing@reelay.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /调整 .* 的组织角色/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /管理 .* 的账号/ })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/w/workspace-organization-reelay/organization");
  });

  it("reuses organization data while switching between center sections", async () => {
    const loader = vi.fn(async () => routeData);
    renderSection("management", routeData, loader);

    expect(await screen.findByRole("heading", { name: "组织信息" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("link", { name: "积分管理" }));
    expect(await screen.findByRole("heading", { name: "积分管理" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("link", { name: "用量看板" }));
    expect(await screen.findByRole("heading", { name: "用量看板" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();
  });
});
