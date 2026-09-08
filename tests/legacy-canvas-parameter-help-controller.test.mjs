import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [placementSource, controllerSource] = await Promise.all([
  "canvas-popover-placement.js", "canvas-parameter-help-controller.js",
].map((file) => readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")));

const helpItems = [
  { title: "全模态参考", description: "结合参考素材与提示词生成视频。" },
  { title: "视频编辑", description: "根据提示词编辑视频。" },
  { title: "视频延长", description: "向前或向后续写镜头。" },
];

function fixture(t) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="panel" class="param-panel"><div class="parameter-mode-heading">模式
      <button id="help" data-parameter-help data-help-title="模式说明"
        aria-label="了解三种视频模式" aria-describedby="existing-hint"><svg></svg></button>
    </div><div id="mode">
      <button data-mode="reference">全模态参考</button>
      <button data-mode="edit">视频编辑</button>
      <button data-mode="extend">视频延长</button>
    </div></div><div id="agent-menu" class="agent-param-menu"><div id="agent-panel" class="param-panel"><div class="parameter-mode-heading">模式
      <button id="agent-help" data-parameter-help data-help-title="模式说明"
        aria-label="了解三种视频模式"><svg></svg></button>
    </div></div></div><button id="outside">其他操作</button><p id="existing-hint">原有说明</p>
  </body>`, { runScripts: "outside-only" });
  const view = dom.window;
  const document = view.document;
  let serial = 0;
  let time = 0;
  const timers = new Map();
  const frames = new Map();
  view.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, due: time + delay }); return id; };
  view.clearTimeout = (id) => timers.delete(id);
  view.requestAnimationFrame = (callback) => { const id = ++serial; frames.set(id, callback); return id; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  let anchor = rect(100, 200, 18, 18);
  let panelBounds = rect(60, 100, 280, 300);
  let agentBounds = rect(600, 100, 348, 380);
  let tooltipHeight = 180;
  const help = document.querySelector("#help");
  const agentHelp = document.querySelector("#agent-help");
  const panel = document.querySelector("#panel");
  const agentMenu = document.querySelector("#agent-menu");
  const agentPanel = document.querySelector("#agent-panel");
  const outside = document.querySelector("#outside");
  help.dataset.helpItems = JSON.stringify(helpItems);
  agentHelp.dataset.helpItems = JSON.stringify(helpItems);
  help.getBoundingClientRect = () => anchor;
  agentHelp.getBoundingClientRect = () => rect(630, 140, 18, 18);
  panel.getBoundingClientRect = () => panelBounds;
  agentMenu.getBoundingClientRect = () => agentBounds;
  agentPanel.getBoundingClientRect = () => rect(612, 112, 324, 700);
  view.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return this.classList.contains("parameter-help-tooltip")
      ? rect(0, 0, Number.parseFloat(this.style.width) || 320,
        Math.min(tooltipHeight, Number.parseFloat(this.style.maxHeight) || tooltipHeight))
      : rect(0, 0, 1024, 768);
  };
  view.eval(placementSource);
  view.eval(controllerSource);
  const controller = view.REELAY_CANVAS_PARAMETER_HELP.createController({
    document,
    placeAnchoredPopover: view.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
  });
  t.after(() => { controller.dispose(); view.close(); });
  function tick(duration) {
    time += duration;
    for (const [id, timer] of [...timers]) if (timer.due <= time && timers.delete(id)) timer.callback();
  }
  function flushFrames() {
    for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(time);
  }
  function pointer(type, target, relatedTarget = null) {
    target.dispatchEvent(new view.MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget }));
  }
  function click(target) {
    const event = new view.MouseEvent("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }
  function escape(target = document) {
    const event = new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }
  return {
    view, document, help, agentHelp, panel, agentMenu, agentPanel, outside, controller, timers, frames, rect,
    tick, flushFrames, pointer, click, escape,
    move: (next) => { anchor = next; },
    movePanel: (next) => { panelBounds = next; },
    moveAgentMenu: (next) => { agentBounds = next; },
    resizeTooltip: (height) => { tooltipHeight = height; },
    tooltip: () => document.querySelector(".parameter-help-tooltip"),
  };
}

test("hover waits briefly, cancels on departure, and lets the pointer cross into the explanation", (t) => {
  const f = fixture(t);
  f.pointer("pointerover", f.help);
  f.tick(100);
  assert.equal(f.tooltip(), null);
  f.pointer("pointerout", f.help, f.outside);
  f.tick(300);
  assert.equal(f.tooltip(), null);
  f.pointer("pointerover", f.help);
  f.tick(220);
  const tooltip = f.tooltip();
  assert.ok(tooltip);
  assert.equal(tooltip.parentElement, f.document.body);
  assert.equal(tooltip.getAttribute("role"), "tooltip");
  assert.deepEqual([...tooltip.querySelectorAll(".parameter-help-tooltip-section")].map((section) => ({
    title: section.querySelector("strong").textContent,
    description: section.querySelector("p").textContent,
  })), helpItems);
  f.pointer("pointerout", f.help);
  f.tick(80);
  f.pointer("pointerover", tooltip);
  f.tick(300);
  assert.equal(f.tooltip(), tooltip);
  f.pointer("pointerout", tooltip, f.outside);
  f.tick(160);
  assert.equal(f.tooltip(), null);
  assert.equal(f.help.getAttribute("aria-describedby"), "existing-hint");
  assert.equal(f.frames.size, 0);
});

test("keyboard focus opens immediately, keeps the explanation while focused, and releases it after blur", (t) => {
  const f = fixture(t);
  f.help.focus();
  assert.ok(f.tooltip());
  assert.equal(f.timers.size, 0);
  f.pointer("pointerover", f.help);
  f.pointer("pointerout", f.help, f.outside);
  f.tick(1000);
  assert.ok(f.tooltip());
  f.outside.focus();
  f.tick(160);
  assert.equal(f.tooltip(), null);
  assert.equal(f.document.activeElement, f.outside);
});

test("only the first Escape dismisses help; it preserves the parameter panel and current focus", (t) => {
  const f = fixture(t);
  let panelEscapes = 0;
  f.document.addEventListener("keydown", () => { panelEscapes++; });
  f.help.focus();
  const first = f.escape(f.help);
  assert.equal(first.defaultPrevented, true);
  assert.equal(panelEscapes, 0);
  assert.equal(f.tooltip(), null);
  assert.equal(f.document.activeElement, f.help);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  const second = f.escape(f.help);
  assert.equal(second.defaultPrevented, false);
  assert.equal(panelEscapes, 1);
});

test("help click and pointerdown are independent of mode selection and canvas gestures", (t) => {
  const f = fixture(t);
  let modeClicks = 0;
  let canvasPresses = 0;
  f.panel.addEventListener("click", () => { modeClicks++; });
  f.panel.addEventListener("pointerdown", () => { canvasPresses++; });
  const icon = f.help.querySelector("svg");
  f.pointer("pointerdown", icon);
  const helpClick = f.click(icon);
  assert.equal(canvasPresses, 0);
  assert.equal(modeClicks, 0);
  assert.equal(helpClick.defaultPrevented, true);
  assert.ok(f.tooltip());
  f.click(f.document.querySelector('[data-mode="edit"]'));
  assert.equal(modeClicks, 1);
  assert.equal(f.tooltip(), null);
});

test("node and Agent reuse one comparison tooltip with safe text and independent ARIA ownership", (t) => {
  const f = fixture(t);
  f.help.focus();
  const tooltip = f.tooltip();
  assert.equal(f.help.getAttribute("aria-describedby"), `existing-hint ${tooltip.id}`);
  const maliciousText = "<img src=x onerror=alert(1)>";
  f.agentHelp.dataset.helpItems = JSON.stringify([{ title: maliciousText, description: maliciousText }]);
  f.agentHelp.focus();
  assert.equal(f.tooltip(), tooltip);
  assert.equal(f.help.getAttribute("aria-describedby"), "existing-hint");
  assert.equal(f.agentHelp.getAttribute("aria-describedby"), tooltip.id);
  assert.equal(tooltip.querySelector(".parameter-help-tooltip-title").textContent, "模式说明");
  assert.equal(tooltip.querySelector(".parameter-help-tooltip-mode").textContent, maliciousText);
  assert.equal(tooltip.querySelector("p").textContent, maliciousText);
  assert.equal(tooltip.querySelectorAll(".parameter-help-tooltip-section").length, 1);
  assert.equal(tooltip.querySelector("img"), null);
  f.agentHelp.setAttribute("aria-describedby", `${tooltip.id} external-description`);
  f.controller.close();
  assert.equal(f.agentHelp.getAttribute("aria-describedby"), "external-description");
});

test("invalid comparison payloads do not create an empty tooltip or ARIA reference", (t) => {
  const f = fixture(t);
  for (const invalid of ["{", "{}", "[]", '[{"title":"模式"}]', '[{"title":"模式","description":12}]']) {
    f.help.dataset.helpItems = invalid;
    f.click(f.help);
    assert.equal(f.tooltip(), null);
    assert.equal(f.help.getAttribute("aria-describedby"), "existing-hint");
  }
});

test("the node explanation aligns with its parent panel and prefers the space above it", (t) => {
  const f = fixture(t);
  f.movePanel(f.rect(60, 420, 348, 300));
  f.move(f.rect(100, 440, 18, 18));
  f.help.focus();
  const tooltip = f.tooltip();
  assert.equal(tooltip.dataset.placement, "top-start");
  assert.equal(tooltip.style.top, "232px");
  assert.equal(tooltip.style.left, "60px");
  assert.equal(tooltip.style.width, "348px");
  assert.equal(f.frames.size, 1);
  f.movePanel(f.rect(120, 360, 280, 240));
  f.move(f.rect(150, 380, 14, 14));
  f.flushFrames();
  assert.equal(tooltip.style.top, "172px");
  assert.equal(tooltip.style.left, "120px");
  assert.equal(tooltip.style.width, "280px");
  assert.equal(f.frames.size, 1);
  f.movePanel(f.rect(120, 20, 280, 240));
  f.move(f.rect(150, 40, 14, 14));
  f.flushFrames();
  assert.equal(tooltip.dataset.placement, "bottom-start");
  assert.equal(tooltip.style.top, "268px");
  assert.equal(tooltip.style.left, "120px");
});

test("Agent explanation uses the visible menu frame instead of its taller inset scrolling panel", (t) => {
  const f = fixture(t);
  f.agentHelp.focus();
  const tooltip = f.tooltip();
  assert.equal(tooltip.style.width, "348px");
  assert.equal(tooltip.style.left, "600px");
  assert.equal(tooltip.style.top, "488px");
  assert.equal(tooltip.dataset.placement, "bottom-start");
  f.moveAgentMenu(f.rect(550, 80, 400, 300));
  f.flushFrames();
  assert.equal(tooltip.style.width, "400px");
  assert.equal(tooltip.style.left, "550px");
  assert.equal(tooltip.style.top, "388px");
});

test("the explanation keeps a viewport gutter at both horizontal edges and limits excessive parent width", (t) => {
  const f = fixture(t);
  f.movePanel(f.rect(-30, 100, 348, 300));
  f.help.focus();
  const tooltip = f.tooltip();
  assert.equal(tooltip.style.width, "348px");
  assert.equal(tooltip.style.left, "12px");
  f.movePanel(f.rect(800, 100, 348, 300));
  f.move(f.rect(830, 200, 18, 18));
  f.flushFrames();
  assert.equal(tooltip.style.left, "664px");
  f.movePanel(f.rect(-40, 100, 1200, 300));
  f.flushFrames();
  assert.equal(tooltip.style.width, "1000px");
  assert.equal(tooltip.style.left, "12px");
});

test("short viewports constrain the explanation height without compressing it into a gap beside the parent", (t) => {
  const f = fixture(t);
  f.view.innerHeight = 240;
  f.movePanel(f.rect(60, 12, 280, 216));
  f.move(f.rect(100, 40, 18, 18));
  f.resizeTooltip(320);
  f.help.focus();
  const tooltip = f.tooltip();
  assert.equal(tooltip.style.maxHeight, "216px");
  assert.equal(tooltip.getBoundingClientRect().height, 216);
  assert.equal(tooltip.style.top, "12px");
  f.view.innerHeight = 768;
  f.flushFrames();
  assert.equal(tooltip.style.maxHeight, "744px");
  assert.equal(tooltip.getBoundingClientRect().height, 320);
  assert.equal(tooltip.style.top, "236px");
});

test("an offscreen trigger closes help even when the parent frame remains onscreen", (t) => {
  const f = fixture(t);
  f.help.focus();
  assert.ok(f.tooltip());
  f.move(f.rect(100, -25, 18, 18));
  f.flushFrames();
  assert.equal(f.tooltip(), null);
  assert.equal(f.frames.size, 0);
});

test("a removed, hidden, or fully scroll-clipped trigger cannot leave an orphan tooltip", (t) => {
  const f = fixture(t);
  f.help.focus();
  f.help.remove();
  f.flushFrames();
  assert.equal(f.tooltip(), null);
  assert.equal(f.help.getAttribute("aria-describedby"), "existing-hint");
  f.panel.append(f.help);
  f.click(f.help);
  assert.ok(f.tooltip());
  f.panel.style.opacity = "0";
  f.flushFrames();
  assert.equal(f.tooltip(), null);
  f.panel.style.opacity = "1";
  f.panel.style.overflowY = "auto";
  f.click(f.help);
  assert.ok(f.tooltip());
  f.move(f.rect(100, 70, 18, 18));
  f.flushFrames();
  assert.equal(f.tooltip(), null);
  assert.equal(f.frames.size, 0);
});

test("dispose clears pending work and removes delegated event handlers", (t) => {
  const f = fixture(t);
  f.pointer("pointerover", f.help);
  assert.equal(f.timers.size, 1);
  f.controller.dispose();
  f.tick(1000);
  f.help.focus();
  let clicks = 0;
  f.panel.addEventListener("click", () => { clicks++; });
  f.click(f.help);
  assert.equal(clicks, 1);
  assert.equal(f.tooltip(), null);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
});

test("BFCache pagehide closes help but allows reentry; final pagehide disposes everything", (t) => {
  const f = fixture(t);
  f.help.focus();
  f.view.dispatchEvent(new f.view.PageTransitionEvent("pagehide", { persisted: true }));
  assert.equal(f.tooltip(), null);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  f.click(f.agentHelp);
  assert.ok(f.tooltip());
  f.view.dispatchEvent(new f.view.PageTransitionEvent("pagehide", { persisted: false }));
  assert.equal(f.tooltip(), null);
  assert.equal(f.agentHelp.hasAttribute("aria-describedby"), false);
  assert.equal(f.frames.size, 0);
  f.click(f.help);
  assert.equal(f.tooltip(), null);
});
