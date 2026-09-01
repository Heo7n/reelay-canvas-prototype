// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityRepository } from "../../application/assets/EntityRepository";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import type { MediaAssetRepository } from "../../application/assets/MediaAssetRepository";
import { LegacyCanvasRoute } from "./LegacyCanvasRoute";

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
  CanvasHost: ({ context, onCreateProject, onOpenAccountSettings }: {
    context: {
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
  }) => (
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
      <button type="button" onClick={() => onOpenAccountSettings("profile")}>打开个人主页</button>
      <button type="button" onClick={() => onOpenAccountSettings("credits")}>打开我的积分</button>
    </div>
  ),
}));

vi.mock("../../features/account/AccountSettingsDialog", () => ({
  AccountSettingsDialog: ({ initialSection, open }: {
    initialSection: "profile" | "credits";
    open: boolean;
  }) => open ? <output data-testid="initial-account-section">{initialSection}</output> : null,
}));

afterEach(cleanup);

describe("LegacyCanvasRoute", () => {
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
