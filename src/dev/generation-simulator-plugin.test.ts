// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generationSimulatorPlugin, generationSimulatorTags } from "./generation-simulator-plugin";

const clientSource = readFileSync(path.resolve("src/dev/generation-simulator.js"), "utf8");

function setup() {
  document.body.innerHTML = '<section id="agentPanel" aria-hidden="false"><header><div class="agent-actions"></div></header><div id="agentComposer" data-composer-mode="generation"></div></section>';
  let tasks: { id: string; status: string; input?: { modelName: string } }[] = [];
  let changed = () => {};
  const unsubscribe = vi.fn();
  const capabilities = {
    setNextScenario: vi.fn(), list: () => tasks,
    listPresets: () => [
      { id: "image-square", label: "图片 · 方图", description: "参考两张图片" },
      { id: "video-wide", label: "视频 · 横屏", description: "图片、视频和音频混合参考" },
    ],
    hasDraft: vi.fn(() => false), fillPreset: vi.fn(() => true),
    initializePreviewHistory: vi.fn(() => true),
    subscribe: vi.fn((listener: () => void) => { changed = listener; return unsubscribe; }),
  };
  const ready = () => window.dispatchEvent(new CustomEvent("reelay:generation-ready", { detail: capabilities }));
  window.addEventListener("reelay:generation-connect", ready);
  window.eval(clientSource);
  window.removeEventListener("reelay:generation-connect", ready);
  const root = document.querySelector<HTMLElement>("#reelay-generation-simulator")!;
  const panel = document.querySelector<HTMLElement>("#generation-simulator-panel")!;
  const select = (selector: string, value: string) => {
    const element = panel.querySelector<HTMLSelectElement>(selector)!;
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const setTasks = (next: typeof tasks) => { tasks = next; changed(); };
  return { root, panel, capabilities, unsubscribe, ready, select, setTasks };
}

afterEach(() => { window.dispatchEvent(new Event("pagehide")); document.body.replaceChildren(); Reflect.deleteProperty(window, "REELAY_GENERATION_HISTORY_PRESETS"); });

describe("generation simulator development boundary", () => {
  it("injects only into the served canvas and leaves built entries unreferenced", () => {
    expect(generationSimulatorPlugin().apply).toBe("serve");
    expect(generationSimulatorTags("/index.html")).toHaveLength(2);
    expect(generationSimulatorTags("/app-shell.html")).toEqual([]);
    expect(generationSimulatorTags("/app/projects/example")).toEqual([]);
    for (const name of ["index.html", "app-shell.html"]) {
      expect(readFileSync(path.resolve(name), "utf8")).not.toMatch(/generation-simulator/);
    }
    expect(generationSimulatorTags("/index.html").map((tag) => tag.attrs?.src || tag.attrs?.href))
      .toEqual(["/src/dev/generation-simulator.css", "/src/dev/generation-simulator.js"]);
  });

  it("connects through capabilities, starts closed, and is hidden outside generation mode", async () => {
    const { root, panel, capabilities } = setup();
    expect(root.hidden).toBe(false);
    expect(root.parentElement?.className).toBe("agent-actions");
    expect(panel.parentElement).toBe(document.body);
    expect(panel.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>(".generation-simulator-toggle")!.click();
    expect(document.activeElement?.id).toBe("generation-simulator-preset");
    expect(capabilities.setNextScenario).not.toHaveBeenCalled();
    document.querySelector<HTMLElement>("#agentComposer")!.dataset.composerMode = "agent";
    await Promise.resolve();
    expect(root.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
  });

  it("leaves default history initialization to the shared product entry", () => {
    const create = vi.fn(() => []);
    Object.assign(window, { REELAY_GENERATION_HISTORY_PRESETS: { create } });
    const { capabilities, ready, panel } = setup();
    expect(capabilities.initializePreviewHistory).not.toHaveBeenCalled();
    ready();
    expect(capabilities.initializePreviewHistory).not.toHaveBeenCalled();
    expect(panel.textContent).toContain("默认记录为展示示例，不影响当前积分或画布");
    expect(capabilities.setNextScenario).not.toHaveBeenCalled();
    expect(document.querySelector(".generation-record")).toBeNull();
  });

  it("configures success or failure for the next task without manual settlement controls", () => {
    const { panel, select, capabilities, setTasks } = setup();
    expect([...panel.querySelector<HTMLSelectElement>("#generation-simulator-outcome")!.options].map((option) => option.value)).toEqual(["success", "failure"]);
    expect(panel.querySelector("[data-simulator-complete], [data-simulator-fail], #generation-simulator-task")).toBeNull();
    select("#generation-simulator-outcome", "failure");
    expect(capabilities.setNextScenario).toHaveBeenLastCalledWith({ outcome: "failure", failureReason: "生成服务暂时不可用，请稍后重试。" });
    const reason = panel.querySelector<HTMLInputElement>("#generation-simulator-reason")!;
    reason.value = "参考视频暂时无法读取";
    reason.dispatchEvent(new Event("input", { bubbles: true }));
    expect(capabilities.setNextScenario).toHaveBeenLastCalledWith({ outcome: "failure", failureReason: reason.value });
    setTasks([{ id: "task-1", status: "running", input: { modelName: "Seedance 2.5" } }, { id: "done-2", status: "succeeded" }]);
    expect(panel.querySelector<HTMLSelectElement>("#generation-simulator-outcome")!.value).toBe("success");
    expect(capabilities.setNextScenario).toHaveBeenCalledTimes(2);
  });

  it("fills examples only through capabilities and protects a nonempty draft", () => {
    const { root, panel, select, capabilities } = setup();
    root.querySelector<HTMLButtonElement>(".generation-simulator-toggle")!.click();
    select("#generation-simulator-preset", "video-wide");
    expect(panel.querySelector(".generation-simulator-description")!.textContent).toBe("图片、视频和音频混合参考");
    panel.querySelector<HTMLButtonElement>("[data-simulator-fill]")!.click();
    expect(capabilities.fillPreset).toHaveBeenLastCalledWith("video-wide", { replace: false });
    expect(panel.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>(".generation-simulator-toggle")!.click();
    capabilities.hasDraft.mockReturnValue(true);
    panel.querySelector<HTMLButtonElement>("[data-simulator-fill]")!.click();
    expect(panel.querySelector<HTMLElement>(".generation-simulator-confirm")!.hidden).toBe(false);
    expect(capabilities.fillPreset).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.hasAttribute("data-simulator-keep")).toBe(true);
    panel.querySelector<HTMLButtonElement>("[data-simulator-keep]")!.click();
    expect(capabilities.fillPreset).toHaveBeenCalledTimes(1);
    panel.querySelector<HTMLButtonElement>("[data-simulator-fill]")!.click();
    panel.querySelector<HTMLButtonElement>("[data-simulator-replace]")!.click();
    expect(capabilities.fillPreset).toHaveBeenLastCalledWith("video-wide", { replace: true });
    expect(document.querySelector("#agentComposer")!.innerHTML).toBe("");
  });

  it("does not duplicate installation or subscriptions and disposes listeners", () => {
    const { root, panel, ready, capabilities, unsubscribe } = setup();
    window.eval(clientSource);
    ready();
    expect(document.querySelectorAll("#reelay-generation-simulator")).toHaveLength(1);
    expect(capabilities.subscribe).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(root.isConnected).toBe(false);
    expect(panel.isConnected).toBe(false);
    ready();
    expect(capabilities.subscribe).toHaveBeenCalledTimes(1);
  });

  it("restores its closed entry after a back-forward cache return", () => {
    const { root, panel, unsubscribe } = setup();
    root.querySelector<HTMLButtonElement>(".generation-simulator-toggle")!.click();
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    expect(root.hidden).toBe(true);
    expect(unsubscribe).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(root.hidden).toBe(false);
    expect(panel.hidden).toBe(true);
  });
});
