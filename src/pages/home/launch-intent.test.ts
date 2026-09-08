// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); window.sessionStorage.clear(); });

const scope = { workspaceId: "workspace-one", projectId: "project-new", canvasId: "main" };

it("keeps an experience launch prompt in memory and loses it on a new runtime", async () => {
  vi.stubEnv("VITE_REELAY_EXPERIENCE", "true");
  vi.resetModules();
  const intent = await import("./launch-intent");
  intent.publishProjectLaunchIntent(scope, "我的体验需求");
  expect(window.sessionStorage.length).toBe(0);
  expect(intent.takeProjectLaunchIntent(scope)).toBe("我的体验需求");
  expect(intent.takeProjectLaunchIntent(scope)).toBe("");
  intent.publishProjectLaunchIntent(scope, "刷新前的需求");
  vi.resetModules();
  expect((await import("./launch-intent")).takeProjectLaunchIntent(scope)).toBe("");
});

it("keeps internal handoffs in the current tab until the matching destination consumes them", async () => {
  vi.stubEnv("VITE_REELAY_EXPERIENCE", "false");
  vi.resetModules();
  (await import("./launch-intent")).publishProjectLaunchIntent(scope, " 内部需求 ");
  expect(JSON.parse(window.sessionStorage.getItem("reelay-home-launch-intent")!)).toEqual({
    version: 1, ...scope, prompt: "内部需求",
  });
  vi.resetModules();
  const intent = await import("./launch-intent");
  expect(intent.takeProjectLaunchIntent(scope)).toBe("内部需求");
  expect(intent.takeProjectLaunchIntent(scope)).toBe("");
  expect(window.sessionStorage.length).toBe(0);
});

describe.each(["false", "true"])("project handoff with experience=%s", (experience) => {
  it("does not let another workspace, project or canvas consume the pending prompt", async () => {
    vi.stubEnv("VITE_REELAY_EXPERIENCE", experience);
    vi.resetModules();
    const intent = await import("./launch-intent");
    intent.publishProjectLaunchIntent(scope, "只属于新项目的需求");
    expect(intent.takeProjectLaunchIntent({ ...scope, workspaceId: "other-workspace" })).toBe("");
    expect(intent.takeProjectLaunchIntent({ ...scope, projectId: "other-project" })).toBe("");
    expect(intent.takeProjectLaunchIntent({ ...scope, canvasId: "other-canvas" })).toBe("");
    expect(intent.takeProjectLaunchIntent(scope)).toBe("只属于新项目的需求");
    expect(intent.takeProjectLaunchIntent(scope)).toBe("");
  });

  it("clears previous handoffs when a blank project succeeds", async () => {
    vi.stubEnv("VITE_REELAY_EXPERIENCE", experience);
    vi.resetModules();
    const intent = await import("./launch-intent");
    intent.publishProjectLaunchIntent(scope, "旧需求");
    const blankScope = { ...scope, projectId: "blank-project" };
    intent.publishProjectLaunchIntent(blankScope, "   ");
    expect(intent.takeProjectLaunchIntent(blankScope)).toBe("");
    expect(intent.takeProjectLaunchIntent(scope)).toBe("");
  });
});

it.each(["旧版未限定项目的需求", '"旧版字符串"', "{}", "null"])("ignores malformed or unscoped internal handoffs: %s", async (raw) => {
  vi.stubEnv("VITE_REELAY_EXPERIENCE", "false");
  vi.resetModules();
  window.sessionStorage.setItem("reelay-home-launch-intent", raw);
  expect((await import("./launch-intent")).takeProjectLaunchIntent(scope)).toBe("");
});
