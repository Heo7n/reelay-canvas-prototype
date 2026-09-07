// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); window.sessionStorage.clear(); });

it("keeps an experience launch prompt in memory and loses it on a new runtime", async () => {
  vi.stubEnv("VITE_REELAY_EXPERIENCE", "true");
  vi.resetModules();
  const intent = await import("./launch-intent");
  intent.setLaunchIntent("我的体验需求");
  expect(window.sessionStorage.length).toBe(0);
  expect(intent.takeExperienceLaunchIntent()).toBe("我的体验需求");
  expect(intent.takeExperienceLaunchIntent()).toBe("");
  intent.setLaunchIntent("刷新前的需求");
  vi.resetModules();
  expect((await import("./launch-intent")).takeExperienceLaunchIntent()).toBe("");
});

it("preserves the existing internal canvas launch handoff", async () => {
  vi.stubEnv("VITE_REELAY_EXPERIENCE", "false");
  vi.resetModules();
  (await import("./launch-intent")).setLaunchIntent(" 内部需求 ");
  expect(window.sessionStorage.getItem("reelay-home-launch-intent")).toBe("内部需求");
});
