// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  createMemoryRouter,
  RouterProvider,
  type ActionFunctionArgs,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceActionData, WorkspaceRouteData } from "../../app/route-data";
import { WorkspaceHomePage } from "./WorkspaceHomePage";

const routeData: WorkspaceRouteData = {
  actor: {
    account: "creator@reelay.test",
    id: "actor-one",
    displayName: "Demo One",
    workspaceIds: ["workspace-organization"],
  },
  currentWorkspace: {
    id: "workspace-organization",
    kind: "organization",
    name: "星海视觉工作室",
    currentUserRole: "owner",
  },
  projects: [],
  workspaces: [
    {
      id: "workspace-organization",
      kind: "organization",
      name: "星海视觉工作室",
      currentUserRole: "owner",
    },
  ],
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderHomePage(
  action: (args: ActionFunctionArgs) => Promise<WorkspaceActionData>,
): void {
  const router = createMemoryRouter(
    [{
      path: "/w/:workspaceId",
      loader: async () => routeData,
      action,
      element: <WorkspaceHomePage />,
    }],
    { initialEntries: ["/w/workspace-organization"] },
  );
  render(<RouterProvider router={router} />);
}

describe("WorkspaceHomePage project creation coordination", () => {
  it("disables blank project creation while prompt creation is pending", async () => {
    let finishCreation: ((data: WorkspaceActionData) => void) | undefined;
    const submittedIntent = vi.fn();
    renderHomePage(async ({ request }) => {
      const formData = await request.formData();
      submittedIntent(String(formData.get("intent")));
      return new Promise<WorkspaceActionData>((resolve) => {
        finishCreation = resolve;
      });
    });

    const promptInput = await screen.findByLabelText("描述你的创作需求");
    fireEvent.change(promptInput, { target: { value: "生成一支品牌短片" } });
    fireEvent.click(screen.getByRole("button", { name: "带着创作需求创建项目" }));

    await waitFor(() => expect(submittedIntent).toHaveBeenCalledWith("launch-from-prompt"));
    const blankCreate = screen.getByRole("button", {
      name: "新建项目，创建仅自己可见的个人项目",
    });
    expect(blankCreate).toBeDisabled();
    fireEvent.click(blankCreate);
    expect(submittedIntent).toHaveBeenCalledOnce();

    finishCreation?.({ error: "测试结束" });
    await waitFor(() => expect(blankCreate).toBeEnabled());
  });

  it("disables prompt creation while blank project creation is pending", async () => {
    let finishCreation: ((data: WorkspaceActionData) => void) | undefined;
    const submittedIntent = vi.fn();
    renderHomePage(async ({ request }) => {
      const formData = await request.formData();
      submittedIntent(String(formData.get("intent")));
      return new Promise<WorkspaceActionData>((resolve) => {
        finishCreation = resolve;
      });
    });

    const promptInput = await screen.findByLabelText("描述你的创作需求");
    fireEvent.change(promptInput, { target: { value: "先准备好另一种创建方式" } });
    fireEvent.click(screen.getByRole("button", {
      name: "新建项目，创建仅自己可见的个人项目",
    }));

    await waitFor(() => expect(submittedIntent).toHaveBeenCalledWith("create"));
    const promptCreate = screen.getByRole("button", { name: "带着创作需求创建项目" });
    expect(promptCreate).toBeDisabled();
    fireEvent.click(promptCreate);
    expect(submittedIntent).toHaveBeenCalledOnce();

    finishCreation?.({ error: "测试结束" });
    await waitFor(() => expect(promptCreate).toBeEnabled());
  });
});
