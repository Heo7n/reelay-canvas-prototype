// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceHeader } from "./WorkspaceHeader";

const actor = {
  account: "creator@reelay.test",
  id: "actor-one",
  displayName: "Hoo",
  workspaceIds: ["workspace-organization"],
};

const workspace = {
  id: "workspace-organization",
  kind: "organization" as const,
  name: "星海视觉工作室",
  currentUserRole: "owner" as const,
};

afterEach(cleanup);

describe("workspace account menu", () => {
  it("exposes the workbench primary navigation with the current section", () => {
    const router = createMemoryRouter([
      {
        path: "*",
        action: async () => null,
        element: (
          <WorkspaceHeader
            activeSection="projects"
            actor={actor}
            currentWorkspace={workspace}
          />
        ),
      },
    ], { initialEntries: ["/w/workspace-organization/projects"] });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("navigation", { name: "工作台主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "创作首页" })).toHaveAttribute(
      "href",
      "/w/workspace-organization",
    );
    expect(screen.getByRole("link", { name: "项目空间" })).toHaveAttribute("aria-current", "page");
  });

  it("can keep only the brand on focused management surfaces", () => {
    const router = createMemoryRouter([
      {
        path: "*",
        element: (
          <WorkspaceHeader
            actor={actor}
            currentWorkspace={workspace}
            showAccount={false}
          />
        ),
      },
    ], { initialEntries: ["/w/workspace-organization/organization"] });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("link", { name: /Reelay/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("打开账户菜单")).toBeNull();
  });

  it("keeps credits inside the complete profile menu instead of a separate header control", () => {
    const router = createMemoryRouter([
      {
        path: "*",
        action: async () => null,
        element: <WorkspaceHeader actor={actor} currentWorkspace={workspace} />,
      },
    ], { initialEntries: ["/w/workspace-organization"] });
    render(<RouterProvider router={router} />);

    expect(screen.queryByRole("button", { name: "可用积分 3000" })).toBeNull();

    const profileTrigger = screen.getByLabelText("打开账户菜单");
    fireEvent.pointerEnter(profileTrigger);

    expect(profileTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "查看我的积分" })).toHaveTextContent("3,000");
    expect(screen.getByRole("button", { name: "查看我的积分" })).toHaveTextContent("我的积分");
    expect(screen.queryByText("累计消耗 0 积分")).toBeNull();
    expect(screen.queryByText("个人空间")).toBeNull();
    expect(screen.getByTitle("星海视觉工作室")).toBeInTheDocument();
    expect(screen.getByText("creator@reelay.test")).toBeInTheDocument();
    const organizationEntry = screen.getByRole("link", { name: "进入星海视觉工作室组织信息" });
    expect(organizationEntry).toHaveTextContent("主账户");
    expect(organizationEntry).toHaveAttribute("href", "/w/workspace-organization/organization");
    expect(screen.queryByText("所属组织")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("button", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "帮助中心" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出账号" })).toBeInTheDocument();

    fireEvent.click(organizationEntry);
    expect(router.state.location.state).toEqual({
      organizationReturnTo: "/w/workspace-organization",
    });
  });

  it.each([
    ["admin", "管理员"],
    ["member", "成员"],
  ] as const)("shows the %s organization membership without implying project permission", (currentUserRole, label) => {
    const router = createMemoryRouter([
      {
        path: "*",
        action: async () => null,
        element: (
          <WorkspaceHeader
            actor={actor}
            currentWorkspace={{ ...workspace, currentUserRole }}
          />
        ),
      },
    ], { initialEntries: ["/w/workspace-organization"] });
    render(<RouterProvider router={router} />);

    fireEvent.pointerEnter(screen.getByLabelText("打开账户菜单"));
    expect(screen.getByRole("link", { name: "进入星海视觉工作室组织信息" })).toHaveTextContent(label);
  });

  it("opens the routed account settings dialog from the profile menu", () => {
    const router = createMemoryRouter([
      {
        path: "*",
        action: async () => null,
        element: <WorkspaceHeader actor={actor} currentWorkspace={workspace} />,
      },
    ], { initialEntries: ["/w/workspace-organization"] });
    render(<RouterProvider router={router} />);

    fireEvent.pointerEnter(screen.getByLabelText("打开账户菜单"));
    fireEvent.click(screen.getByRole("button", { name: "账号设置" }));

    expect(screen.getByRole("dialog", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "账户信息" })).toBeInTheDocument();
  });

  it("opens personal credits directly from the credit summary", () => {
    const router = createMemoryRouter([
      {
        path: "*",
        action: async () => null,
        element: <WorkspaceHeader actor={actor} currentWorkspace={workspace} />,
      },
    ], { initialEntries: ["/w/workspace-organization"] });
    render(<RouterProvider router={router} />);

    fireEvent.pointerEnter(screen.getByLabelText("打开账户菜单"));
    fireEvent.click(screen.getByRole("button", { name: "查看我的积分" }));

    expect(screen.getByRole("dialog", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "我的积分" })).toBeInTheDocument();
  });
});
