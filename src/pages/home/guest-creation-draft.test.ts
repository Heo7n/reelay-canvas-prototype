// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); window.sessionStorage.clear(); });

async function loadDraft(experience = false) {
  vi.stubEnv("VITE_REELAY_EXPERIENCE", String(experience));
  vi.resetModules();
  return import("./guest-creation-draft");
}

it("binds a visitor draft to the authenticated destination homepage", async () => {
  const draft = await loadDraft();
  draft.saveGuestCreationDraft("  角色特写，柔和的光线  ");
  expect(draft.readLoginCreationDraft(null)).toEqual({ prompt: "  角色特写，柔和的光线  ", workspaceId: null });
  expect(draft.readGuestCreationDraft("workspace-one")).toBe("");
  draft.prepareCreationDraftReturn("/w/workspace-one");
  expect(draft.readGuestCreationDraft("workspace-one")).toBe("  角色特写，柔和的光线  ");
  expect(draft.readGuestCreationDraft("workspace-two")).toBe("");
  draft.clearGuestCreationDraft();
  expect(draft.readGuestCreationDraft("workspace-one")).toBe("");
});

it("restores a session-expired draft only for the original workspace homepage", async () => {
  const draft = await loadDraft();
  draft.saveGuestCreationDraft("只属于原主页", "workspace-one");
  expect(draft.readLoginCreationDraft("/w/workspace-one")).toEqual({ prompt: "只属于原主页", workspaceId: "workspace-one" });
  expect(draft.readLoginCreationDraft(null).prompt).toBe("");
  expect(draft.readLoginCreationDraft("/w/workspace-two").prompt).toBe("");
  expect(draft.readLoginCreationDraft("/w/workspace-one/projects").prompt).toBe("");
  draft.prepareCreationDraftReturn("/w/workspace-one", "/w/workspace-one");
  expect(draft.readGuestCreationDraft("workspace-one")).toBe("只属于原主页");
});

it.each(["/w/workspace-two", "/w/workspace-one/projects", "/w/workspace-one/projects/project/canvases/main", "/no-workspace"])(
  "discards a scoped draft when authentication returns elsewhere: %s", async (destination) => {
    const draft = await loadDraft();
    draft.saveGuestCreationDraft("不可转交其他位置", "workspace-one");
    draft.prepareCreationDraftReturn(destination, "/w/workspace-one");
    expect(draft.readGuestCreationDraft("workspace-one")).toBe("");
    expect(draft.readGuestCreationDraft("workspace-two")).toBe("");
    expect(window.sessionStorage.length).toBe(0);
  },
);

it("does not let a visitor draft follow a login deep link", async () => {
  const draft = await loadDraft();
  draft.saveGuestCreationDraft("访客需求");
  expect(draft.readLoginCreationDraft("/w/workspace-one/projects").prompt).toBe("");
  draft.prepareCreationDraftReturn("/w/workspace-one/projects");
  expect(window.sessionStorage.length).toBe(0);
});

it("does not attach a visitor draft to an explicit homepage return target", async () => {
  const draft = await loadDraft();
  draft.saveGuestCreationDraft("普通访客输入");
  draft.prepareCreationDraftReturn("/w/workspace-one", "/w/workspace-one");
  expect(draft.readGuestCreationDraft("workspace-one")).toBe("");
});

it("does not revive a scoped draft when an unrelated deep link falls back to its workspace", async () => {
  const draft = await loadDraft();
  draft.saveGuestCreationDraft("已取消的输入", "workspace-one");
  draft.prepareCreationDraftReturn("/w/workspace-one", "/w/another-workspace/projects");
  expect(draft.readGuestCreationDraft("workspace-one")).toBe("");
});

it("keeps experience builds independent of persisted login drafts", async () => {
  const internal = await loadDraft();
  internal.saveGuestCreationDraft("内部未提交的需求", "workspace-one");
  const existing = window.sessionStorage.getItem("reelay-guest-prompt-draft-v1");
  const experience = await loadDraft(true);
  expect(experience.readGuestCreationDraft("workspace-one")).toBe("");
  experience.saveGuestCreationDraft("体验内容", "workspace-one");
  experience.prepareCreationDraftReturn("/w/workspace-one");
  experience.clearGuestCreationDraft();
  expect(window.sessionStorage.getItem("reelay-guest-prompt-draft-v1")).toBe(existing);
});
