// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealGenerationGateway } from "../../application/generation/RealGenerationGateway";
import { REAL_GENERATION_PROBE_SPEC } from "../../contracts/real-generation";
import { AccountSettingsDialog } from "./AccountSettingsDialog";

vi.mock("../../app/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/services")>();
  return { ...actual, applicationServices: { ...actual.applicationServices, realGenerationGateway: undefined } };
});
const actor = { account: "creator@reelay.test", contactEmail: null, contactPhone: null, id: "actor", displayName: "创作者", workspaceIds: ["workspace"] };
const workspace = { id: "workspace", kind: "organization" as const, name: "工作室", currentUserRole: "owner" as const };
function testGateway(): RealGenerationGateway {
  return { getConnection: vi.fn(async () => ({ available: true, channel: "web" as const, state: "connected" as const, reason: null, platformUser: { id: "platform-user", displayName: "平台用户" }, specification: REAL_GENERATION_PROBE_SPEC, probe: null })),
    connect: vi.fn(), disconnect: vi.fn(), listProjects: vi.fn(async () => ({ items: [], page: 1, hasMore: false })), startProbe: vi.fn(), getProbe: vi.fn(), retrySave: vi.fn() };
}
function show(gateway?: RealGenerationGateway) {
  const onClose = vi.fn();
  const router = createMemoryRouter([{ path: "/", element: <AccountSettingsDialog actor={actor} workspace={workspace} open onClose={onClose} initialSection="generation" realGenerationGateway={gateway} /> }]);
  return { onClose, ...render(<RouterProvider router={router} />) };
}
afterEach(cleanup);

describe("AccountSettingsDialog generation connection", () => {
  it("hides the entry when the runtime provides no real-generation gateway", () => {
    show();
    expect(screen.queryByRole("button", { name: "生成连接" })).toBeNull();
    expect(screen.getByRole("button", { name: "个人主页" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "生成连接" })).toBeNull();
  });

  it("opens the injected connection and includes its textarea in the focus trap", async () => {
    show(testGateway());
    await screen.findByText("平台用户");
    expect(screen.getByRole("button", { name: "生成连接" })).toHaveAttribute("aria-current", "page");
    const first = screen.getByRole("button", { name: "个人主页" });
    const textarea = screen.getByRole("textbox", { name: "提示词" });
    expect(screen.getByRole("button", { name: "准备真实生成" })).toBeDisabled();
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(textarea).toHaveFocus();
  });

  it("can close the connection dialog without invoking disconnect or generation", async () => {
    const gateway = testGateway();
    const { onClose } = show(gateway);
    await screen.findByText("平台用户");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(gateway.disconnect).not.toHaveBeenCalled();
    expect(gateway.startProbe).not.toHaveBeenCalled();
  });
});
