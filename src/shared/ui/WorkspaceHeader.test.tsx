// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceHeader } from "./WorkspaceHeader";

const actor = {
  id: "actor-one",
  displayName: "Demo One",
  workspaceIds: ["workspace-personal", "workspace-organization"],
};

const workspaces = [
  { id: "workspace-personal", kind: "personal" as const, name: "Demo 的个人空间" },
  { id: "workspace-organization", kind: "organization" as const, name: "Reelay 创作组" },
];

describe("workspace account menu", () => {
  it("keeps credits inside the complete profile menu instead of a separate header control", () => {
    const router = createMemoryRouter([
      {
        path: "*",
        action: async () => null,
        element: <WorkspaceHeader actor={actor} currentWorkspace={workspaces[0]} workspaces={workspaces} onNotice={vi.fn()} />,
      },
    ], { initialEntries: ["/w/workspace-personal"] });
    render(<RouterProvider router={router} />);

    expect(screen.queryByRole("button", { name: "可用积分 3000" })).toBeNull();

    const profileTrigger = screen.getByLabelText("打开账户菜单");
    fireEvent.pointerEnter(profileTrigger);

    expect(profileTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("积分详情")).toHaveTextContent("3000");
    expect(screen.getByRole("link", { name: /Demo 的个人空间/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reelay 创作组/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "帮助中心" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出演示账号" })).toBeInTheDocument();
  });
});
