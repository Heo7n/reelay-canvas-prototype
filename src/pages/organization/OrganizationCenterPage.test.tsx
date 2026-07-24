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

function renderSection(section: OrganizationSection) {
  const suffix = section === "management" ? "" : `/${section}`;
  const routePath = `/w/:workspaceId/organization${suffix}`;
  const initialEntry = `/w/workspace-organization-reelay/organization${suffix}`;
  const router = createMemoryRouter([
    {
      path: routePath,
      loader: async () => routeData,
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
    expect(screen.getByText("2 位成员")).toBeInTheDocument();
    expect(screen.getByText("linjing@reelay.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "管理 林静 的账号" }));
    expect(screen.getByRole("dialog", { name: "林静" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发起重置" })).toBeInTheDocument();
    expect(screen.queryByText(/查看现有密码/)).toBeNull();
  });

  it("opens credit records from the metric cards while marking them as prototype data", async () => {
    renderSection("credits");

    expect(await screen.findByRole("heading", { name: "积分管理" })).toBeInTheDocument();
    expect(screen.getByText("67,000")).toBeInTheDocument();
    expect(screen.getByText("原型演示数据")).toBeInTheDocument();

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
