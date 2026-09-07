// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityRepository } from "../../application/assets/EntityRepository";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import type { MediaAssetRepository } from "../../application/assets/MediaAssetRepository";
import { LegacyCanvasRoute } from "./LegacyCanvasRoute";
import { takeExperienceLaunchIntent } from "../home/launch-intent";

const hostContexts = vi.hoisted(() => [] as Array<{ canvasId?: string; launchPrompt?: string }>);
vi.mock("../home/launch-intent", () => ({ takeExperienceLaunchIntent: vi.fn(() => "") }));

vi.mock("../../app/useWorkspaceRouteData", () => ({
  useWorkspaceRouteData: () => ({
    actor: {
      account: "creator@reelay.test",
      contactEmail: null,
      contactPhone: null,
      displayName: "Hoo",
      id: "actor-1",
      workspaceIds: ["workspace-1"],
    },
    currentWorkspace: {
      currentUserRole: "owner",
      id: "workspace-1",
      kind: "organization",
      name: "星海视觉工作室",
    },
    projects: [{
      accessKind: "private",
      coverAssetId: null,
      currentUserRole: "admin",
      id: "project-1",
      name: "品牌故事",
      updatedAt: "2026-08-01T00:00:00.000Z",
      workspaceId: "workspace-1",
    }],
  }),
}));

vi.mock("../../shared/theme/theme", () => ({ readTheme: () => "light" }));

vi.mock("../../legacy-canvas/CanvasHost", () => ({
  CanvasHost: ({ context, onCreateProject, onOpenAccountSettings, onLaunchPromptConsumed }: {
    context: {
      canvasId?: string;
      launchPrompt?: string;
      capabilities?: {
        accountSections?: boolean;
        projectSwitcher?: boolean;
        assetPersistence?: boolean;
        entityPersistence?: boolean;
      };
      projects?: Array<{ id: string; name: string; coverUrl: string | null }>;
    };
    onCreateProject?: () => void;
    onOpenAccountSettings: (section: "profile" | "credits") => void;
    onLaunchPromptConsumed?: () => void;
  }) => {
    hostContexts.push(context);
    return (
    <div>
      <output data-testid="account-sections-capability">
        {String(context.capabilities?.accountSections === true)}
      </output>
      <output data-testid="project-switcher-capability">
        {String(context.capabilities?.projectSwitcher === true)}
      </output>
      <output data-testid="asset-persistence-capability">
        {String(context.capabilities?.assetPersistence === true)}
      </output>
      <output data-testid="entity-persistence-capability">
        {String(context.capabilities?.entityPersistence === true)}
      </output>
      <output data-testid="project-options">
        {context.projects?.map((project) => project.name).join(",")}
      </output>
      <output data-testid="project-create-handler">{typeof onCreateProject}</output>
      <output data-testid="launch-prompt">{context.launchPrompt}</output>
      <button type="button" onClick={onLaunchPromptConsumed}>完成画布初始化</button>
      <button type="button" onClick={() => onOpenAccountSettings("profile")}>打开个人主页</button>
      <button type="button" onClick={() => onOpenAccountSettings("credits")}>打开我的积分</button>
    </div>
    );
  },
}));

vi.mock("../../features/account/AccountSettingsDialog", () => ({
  AccountSettingsDialog: ({ initialSection, open }: {
    initialSection: "profile" | "credits";
    open: boolean;
  }) => open ? <output data-testid="initial-account-section">{initialSection}</output> : null,
}));

afterEach(() => {
  cleanup();
  hostContexts.length = 0;
  vi.mocked(takeExperienceLaunchIntent).mockReset().mockReturnValue("");
});

function renderExperienceRoute() {
  const router = createMemoryRouter([{
    path: "/w/:workspaceId/projects/:projectId/canvases/:canvasId",
    element: <LegacyCanvasRoute
      canvasDocumentRepository={{ getCanvasDocument: vi.fn(), save: vi.fn() }}
      mediaAssetRepository={{} as MediaAssetRepository}
      entityRepository={{} as EntityRepository}
      transientMediaRepository={{ importFile: vi.fn() }}
    />,
  }], { initialEntries: ["/w/workspace-1/projects/project-1/canvases/main"] });
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  return router;
}

describe("LegacyCanvasRoute", () => {
  it("reads an experience intent once under StrictMode and clears it when the host initializes", () => {
    vi.mocked(takeExperienceLaunchIntent).mockReturnValueOnce("一支香水广告");
    renderExperienceRoute();
    expect(screen.getByTestId("launch-prompt")).toHaveTextContent("一支香水广告");
    expect(takeExperienceLaunchIntent).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "完成画布初始化" }));
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "打开我的积分" }));
    expect(takeExperienceLaunchIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
  });

  it("does not carry an unconsumed prompt into a different canvas, including its first render", async () => {
    vi.mocked(takeExperienceLaunchIntent).mockReturnValueOnce("一支香水广告");
    const router = renderExperienceRoute();
    expect(screen.getByTestId("launch-prompt")).toHaveTextContent("一支香水广告");
    await act(async () => router.navigate("/w/workspace-1/projects/project-1/canvases/second"));
    expect(takeExperienceLaunchIntent).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
    const nextCanvasContexts = hostContexts.filter((context) => context.canvasId === "second");
    expect(nextCanvasContexts.length).toBeGreaterThan(0);
    expect(nextCanvasContexts.every((context) => context.launchPrompt === "")).toBe(true);
  });

  it("preserves the account section requested by the legacy canvas", () => {
    const repository = {
      getCanvasDocument: vi.fn(async () => null),
      save: vi.fn(),
    } as unknown as CanvasDocumentRepository;
    const mediaAssetRepository = {
      listPersonalAssets: vi.fn(async () => []),
      listProjectAssets: vi.fn(async () => []),
    } as unknown as MediaAssetRepository;
    const entityRepository = {
      listPersonal: vi.fn(async () => []),
    } as unknown as EntityRepository;
    const router = createMemoryRouter([{
      path: "/w/:workspaceId/projects/:projectId/canvases/:canvasId",
      element: (
        <LegacyCanvasRoute
          canvasDocumentRepository={repository}
          entityRepository={entityRepository}
          mediaAssetRepository={mediaAssetRepository}
        />
      ),
    }], {
      initialEntries: ["/w/workspace-1/projects/project-1/canvases/main"],
    });
    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("account-sections-capability")).toHaveTextContent("true");
    expect(screen.getByTestId("project-switcher-capability")).toHaveTextContent("true");
    expect(screen.getByTestId("asset-persistence-capability")).toHaveTextContent("true");
    expect(screen.getByTestId("entity-persistence-capability")).toHaveTextContent("true");
    expect(screen.getByTestId("project-options")).toHaveTextContent("品牌故事");
    expect(screen.getByTestId("project-create-handler")).toHaveTextContent("function");

    fireEvent.click(screen.getByRole("button", { name: "打开我的积分" }));
    expect(screen.getByTestId("initial-account-section")).toHaveTextContent("credits");

    fireEvent.click(screen.getByRole("button", { name: "打开个人主页" }));
    expect(screen.getByTestId("initial-account-section")).toHaveTextContent("profile");
  });
});
