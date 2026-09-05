// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  createMemoryRouter,
  RouterProvider,
  type ActionFunctionArgs,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceActionData } from "../../app/route-data";
import { CreationComposer } from "./CreationComposer";

const launchIntentKey = "reelay-home-launch-intent";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function ComposerHarness({ initialPrompt = "" }: { initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [notice, setNotice] = useState("");

  return (
    <>
      <CreationComposer
        prompt={prompt}
        onPromptChange={setPrompt}
        onNotice={setNotice}
      />
      <output aria-label="创作提示">{notice}</output>
    </>
  );
}

function renderComposer(
  action: (args: ActionFunctionArgs) => Promise<WorkspaceActionData>,
  initialPrompt = "",
) {
  const router = createMemoryRouter(
    [
      {
        path: "/w/:workspaceId",
        action,
        element: <ComposerHarness initialPrompt={initialPrompt} />,
      },
      {
        path: "/w/:workspaceId/projects/:projectId/canvases/:canvasId",
        element: <p>项目画布</p>,
      },
    ],
    { initialEntries: ["/w/workspace-organization"] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("CreationComposer prompt launch", () => {
  it("does not submit a blank prompt when Enter is pressed", async () => {
    const action = vi.fn(async () => ({ ok: true, projectId: "should-not-exist" }));
    renderComposer(action, "   ");
    window.sessionStorage.setItem(launchIntentKey, "stale prompt");

    fireEvent.keyDown(screen.getByLabelText("描述你的创作需求"), { key: "Enter" });

    expect(action).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(launchIntentKey)).toBeNull();
    expect(screen.getByLabelText("创作提示")).toHaveTextContent("请先输入创作需求。");
    expect(screen.getByRole("button", { name: "带着创作需求创建项目" })).toBeDisabled();
  });

  it("writes the submitted prompt only after creation succeeds and then opens that project", async () => {
    let finishCreation: ((data: WorkspaceActionData) => void) | undefined;
    const action = vi.fn(async ({ request }: ActionFunctionArgs) => {
      const formData = await request.formData();
      expect(Object.fromEntries(formData)).toEqual({
        intent: "launch-from-prompt",
        prompt: "  生成一支海边产品短片  ",
      });
      return new Promise<WorkspaceActionData>((resolve) => {
        finishCreation = resolve;
      });
    });
    const router = renderComposer(action, "  生成一支海边产品短片  ");
    window.sessionStorage.setItem(launchIntentKey, "stale prompt");

    fireEvent.click(screen.getByRole("button", { name: "带着创作需求创建项目" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(window.sessionStorage.getItem(launchIntentKey)).toBeNull();
    expect(screen.getByRole("button", { name: "带着创作需求创建项目" })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("描述你的创作需求"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "带着创作需求创建项目" }));
    expect(action).toHaveBeenCalledOnce();

    await waitFor(() => expect(finishCreation).toEqual(expect.any(Function)));
    finishCreation?.({ ok: true, projectId: "project-created" });

    expect(await screen.findByText("项目画布")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      "/w/workspace-organization/projects/project-created/canvases/main",
    );
    expect(JSON.parse(window.sessionStorage.getItem(launchIntentKey) ?? "null")).toEqual({
      version: 1,
      workspaceId: "workspace-organization",
      projectId: "project-created",
      prompt: "生成一支海边产品短片",
    });
  });

  it("keeps the user on the composer and clears stale handoff state when creation fails", async () => {
    const action = vi.fn(async () => ({ error: "项目创建失败，请稍后重试。" }));
    const router = renderComposer(action, "失败场景");
    window.sessionStorage.setItem(launchIntentKey, "stale prompt");

    fireEvent.click(screen.getByRole("button", { name: "带着创作需求创建项目" }));

    await waitFor(() => {
      expect(screen.getByLabelText("创作提示")).toHaveTextContent("项目创建失败，请稍后重试。");
    });
    expect(router.state.location.pathname).toBe("/w/workspace-organization");
    expect(window.sessionStorage.getItem(launchIntentKey)).toBeNull();
    expect(screen.getByLabelText("描述你的创作需求")).toHaveValue("失败场景");
    expect(screen.getByRole("button", { name: "带着创作需求创建项目" })).toBeEnabled();
  });
});
