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
import { takeProjectLaunchIntent } from "../home/launch-intent";

const hostContexts = vi.hoisted(() => [] as Array<{ projectId?: string; canvasId?: string; launchPrompt?: string; theme?: string }>);
vi.mock("../home/launch-intent", () => ({ takeProjectLaunchIntent: vi.fn(() => "") }));

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
    }, {
      accessKind: "shared", coverAssetId: null, currentUserRole: "view", id: "read-only-project",
      name: "只读项目", updatedAt: "2026-08-01T00:00:00.000Z", workspaceId: "workspace-1",
    }, {
      accessKind: "private", coverAssetId: null, currentUserRole: "admin", id: "project-2",
      name: "另一个项目", updatedAt: "2026-08-01T00:00:00.000Z", workspaceId: "workspace-1",
    }],
  }),
}));

vi.mock("../../legacy-canvas/CanvasHost", () => ({
  CanvasHost: ({ context, onCreateProject, onOpenAccountSettings, onLaunchPromptConsumed, onThemeChange }: {
    context: {
      projectId?: string;
      canvasId?: string;
      launchPrompt?: string;
      theme?: string;
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
    onThemeChange: (theme: "light" | "dark") => void;
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
      <button type="button" onClick={() => onThemeChange("light")}>画布切浅色</button>
      <button type="button" onClick={() => onThemeChange("dark")}>画布切深色</button>
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
  vi.restoreAllMocks();
  window.localStorage.removeItem("reelay-theme-mode");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("color-scheme");
  hostContexts.length = 0;
  vi.mocked(takeProjectLaunchIntent).mockReset().mockReturnValue("");
});

function renderCanvasRoute(experience = true, projectId = "project-1") {
  const router = createMemoryRouter([{
    path: "/w/:workspaceId/projects/:projectId/canvases/:canvasId",
    element: <LegacyCanvasRoute
      canvasDocumentRepository={{ getCanvasDocument: vi.fn(), save: vi.fn() }}
      mediaAssetRepository={{} as MediaAssetRepository}
      entityRepository={{} as EntityRepository}
      transientMediaRepository={experience ? { importFile: vi.fn() } : undefined}
    />,
  }], { initialEntries: [`/w/workspace-1/projects/${projectId}/canvases/main`] });
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  return router;
}

describe("LegacyCanvasRoute", () => {
  it.each(["light", "dark"] as const)("keeps the shell and account dialog on the canvas-selected %s theme", (theme) => {
    window.localStorage.setItem("reelay-theme-mode", theme === "light" ? "dark" : "light");
    renderCanvasRoute();
    fireEvent.click(screen.getByRole("button", { name: theme === "light" ? "画布切浅色" : "画布切深色" }));
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(document.documentElement.style.colorScheme).toBe(theme);
    expect(window.localStorage.getItem("reelay-theme-mode")).toBe(theme);
    fireEvent.click(screen.getByRole("button", { name: "打开我的积分" }));
    expect(screen.getByTestId("initial-account-section")).toHaveTextContent("credits");
    expect(hostContexts.at(-1)?.theme).toBe(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });

  it("keeps the current canvas theme when preference storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    renderCanvasRoute();
    fireEvent.click(screen.getByRole("button", { name: "画布切深色" }));
    fireEvent.click(screen.getByRole("button", { name: "打开我的积分" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(hostContexts.at(-1)?.theme).toBe("dark");
  });

  it.each([true, false])("reads a matching intent once under StrictMode with experience=%s and clears it when the host initializes", (experience) => {
    vi.mocked(takeProjectLaunchIntent).mockReturnValueOnce("一支香水广告");
    renderCanvasRoute(experience);
    expect(screen.getByTestId("launch-prompt")).toHaveTextContent("一支香水广告");
    expect(takeProjectLaunchIntent).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "workspace-1", projectId: "project-1", canvasId: "main",
    });
    fireEvent.click(screen.getByRole("button", { name: "完成画布初始化" }));
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "打开我的积分" }));
    expect(takeProjectLaunchIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
  });

  it("does not carry an unconsumed prompt into a different canvas, including its first render", async () => {
    vi.mocked(takeProjectLaunchIntent).mockReturnValueOnce("一支香水广告");
    const router = renderCanvasRoute();
    expect(screen.getByTestId("launch-prompt")).toHaveTextContent("一支香水广告");
    await act(async () => router.navigate("/w/workspace-1/projects/project-1/canvases/second"));
    expect(takeProjectLaunchIntent).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
    const nextCanvasContexts = hostContexts.filter((context) => context.canvasId === "second");
    expect(nextCanvasContexts.length).toBeGreaterThan(0);
    expect(nextCanvasContexts.every((context) => context.launchPrompt === "")).toBe(true);
  });

  it("does not expose an unconsumed prompt to a different project, including its first render", async () => {
    vi.mocked(takeProjectLaunchIntent).mockReturnValueOnce("只属于第一个项目");
    const router = renderCanvasRoute(false);
    await act(async () => router.navigate("/w/workspace-1/projects/project-2/canvases/main"));
    const otherProjectContexts = hostContexts.filter((context) => context.projectId === "project-2");
    expect(otherProjectContexts.length).toBeGreaterThan(0);
    expect(otherProjectContexts.every((context) => context.launchPrompt === "")).toBe(true);
  });

  it("never claims or sends a handoff for a read-only project", () => {
    renderCanvasRoute(false, "read-only-project");
    expect(takeProjectLaunchIntent).not.toHaveBeenCalled();
    expect(screen.getByTestId("launch-prompt")).toBeEmptyDOMElement();
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
