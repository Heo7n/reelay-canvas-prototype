(function registerCanvasLayoutTuner() {
  "use strict";

  const queryKey = "layoutTune";
  const storageKey = "reelay:canvas-layout-tune:v1";
  const activeAttribute = "data-layout-tune-active";

  const properties = Object.freeze({
    edgeInset: {
      label: "画布外边距",
      token: "--canvas-edge-inset",
      min: 4,
      max: 20,
    },
    leftBarWidth: {
      label: "上下条宽度",
      token: "--canvas-edge-bar-width",
      min: 220,
      max: 320,
    },
    projectBarHeight: {
      label: "项目条高度",
      token: "--canvas-project-bar-height",
      min: 34,
      max: 48,
    },
    toolbarHeight: {
      label: "工具条高度",
      token: "--canvas-viewport-toolbar-height",
      min: 36,
      max: 52,
    },
    panelGap: {
      label: "板块间距",
      token: "--canvas-chrome-panel-gap",
      min: 2,
      max: 20,
    },
    assetWidth: {
      label: "资产库宽度",
      runtime: true,
      min: 380,
      max: 780,
    },
    agentWidth: {
      label: "Agent 宽度",
      runtime: true,
      min: 340,
      max: 640,
    },
    agentTopInset: {
      label: "Agent 顶部内缩",
      runtime: true,
      min: 0,
      max: 800,
    },
    agentBottomInset: {
      label: "Agent 底部内缩",
      runtime: true,
      min: 0,
      max: 800,
    },
    projectX: {
      label: "水平偏移",
      token: "--layout-tune-project-x",
      positionTarget: "project",
      axis: "x",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    projectY: {
      label: "垂直偏移",
      token: "--layout-tune-project-y",
      positionTarget: "project",
      axis: "y",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    assetX: {
      label: "水平偏移",
      token: "--layout-tune-asset-x",
      positionTarget: "asset",
      axis: "x",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    assetY: {
      label: "垂直偏移",
      token: "--layout-tune-asset-y",
      positionTarget: "asset",
      axis: "y",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    toolbarX: {
      label: "水平偏移",
      token: "--layout-tune-toolbar-x",
      positionTarget: "toolbar",
      axis: "x",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    toolbarY: {
      label: "垂直偏移",
      token: "--layout-tune-toolbar-y",
      positionTarget: "toolbar",
      axis: "y",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    agentX: {
      label: "水平偏移",
      token: "--layout-tune-agent-x",
      positionTarget: "agent",
      axis: "x",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
    agentY: {
      label: "垂直偏移",
      token: "--layout-tune-agent-y",
      positionTarget: "agent",
      axis: "y",
      defaultValue: 0,
      min: -2000,
      max: 2000,
    },
  });

  const targets = Object.freeze({
    project: {
      label: "项目条",
      selector: ".top-bar .canvas-project-switcher",
      propertyKeys: ["projectX", "projectY", "leftBarWidth", "projectBarHeight"],
      move: { xKey: "projectX", yKey: "projectY" },
      handles: {
        east: { key: "leftBarWidth", axis: "x", sign: 1 },
        south: { key: "projectBarHeight", axis: "y", sign: 1 },
      },
      hint: "拖动蓝色标签移动；右侧或下侧手柄调整尺寸，宽度同步作用于下方工具条。",
    },
    asset: {
      label: "资产库",
      selector: "#assetLibraryPanel",
      propertyKeys: ["assetX", "assetY", "assetWidth"],
      move: { xKey: "assetX", yKey: "assetY" },
      handles: {
        east: { key: "assetWidth", axis: "x", sign: 1 },
      },
      hint: "拖动蓝色标签移动；右侧手柄调整宽度，仍遵守画布走廊约束。",
    },
    toolbar: {
      label: "工具条",
      selector: "#canvasTools .canvas-tool-row",
      propertyKeys: ["toolbarX", "toolbarY", "leftBarWidth", "toolbarHeight"],
      move: { xKey: "toolbarX", yKey: "toolbarY" },
      handles: {
        east: { key: "leftBarWidth", axis: "x", sign: 1 },
        north: { key: "toolbarHeight", axis: "y", sign: -1 },
      },
      hint: "拖动蓝色标签移动；右侧或上侧手柄调整尺寸，宽度同步作用于上方项目条。",
    },
    agent: {
      label: "Agent",
      selector: "#agentPanel",
      propertyKeys: ["agentX", "agentY", "agentWidth", "agentTopInset", "agentBottomInset"],
      move: { xKey: "agentX", yKey: "agentY" },
      handles: {
        west: { key: "agentWidth", axis: "x", sign: -1 },
        north: { key: "agentTopInset", axis: "y", sign: 1 },
        south: { key: "agentBottomInset", axis: "y", sign: -1 },
      },
      hint: "拖动蓝色标签移动；左、上、下三侧调整尺寸，高度始终保留至少 420px。",
    },
    spacing: {
      label: "整体间距",
      selector: null,
      propertyKeys: ["edgeInset", "panelGap"],
      handles: {},
      hint: "外边距和板块间距共同影响左侧项目条、资产库与工具条。",
    },
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number.parseFloat(String(value));
    return Number.isFinite(number) ? number : fallback;
  }

  function rounded(value) {
    return Math.round(value * 10) / 10;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function isElementVisible(element) {
    if (!(element instanceof Element)) return false;
    if (element.closest("[aria-hidden='true'], [hidden]")) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0
      && rect.right > 0
      && rect.bottom > 0
      && rect.left < window.innerWidth
      && rect.top < window.innerHeight;
  }

  function parseStoredValues() {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function mountLayoutTuner(adapter) {
    const query = new URLSearchParams(window.location.search);
    if (query.get(queryKey) !== "1") return null;
    if (!adapter || typeof adapter.getRuntimeValues !== "function" || typeof adapter.setRuntimeValue !== "function") {
      return null;
    }

    document.querySelector("#reelay-layout-tuner")?.remove();

    const documentElement = document.documentElement;
    const cssBaseline = {};
    const baseline = {};
    const values = {};
    let selectedTargetKey = null;
    let hoveredTargetKey = null;
    let picking = false;
    let drag = null;
    let persistTimer = 0;
    let toastTimer = 0;
    let frameRequest = 0;

    for (const [key, definition] of Object.entries(properties)) {
      if (!definition.token) continue;
      cssBaseline[key] = {
        inlineValue: documentElement.style.getPropertyValue(definition.token),
        inlinePriority: documentElement.style.getPropertyPriority(definition.token),
      };
      const computedValue = finiteNumber(
        window.getComputedStyle(documentElement).getPropertyValue(definition.token),
        definition.defaultValue ?? definition.min,
      );
      baseline[key] = computedValue;
      values[key] = computedValue;
    }

    const runtimeBaseline = adapter.getRuntimeValues();
    for (const [key, definition] of Object.entries(properties)) {
      if (!definition.runtime) continue;
      const value = finiteNumber(runtimeBaseline[key], definition.min);
      baseline[key] = value;
      values[key] = value;
    }

    const root = createElement("div");
    root.id = "reelay-layout-tuner";
    root.setAttribute("aria-label", "画布布局调节器");
    root.innerHTML = `
      <section class="layout-tune-panel" role="dialog" aria-label="布局调节">
        <header class="layout-tune-panel-header">
          <span class="layout-tune-title">布局调节</span>
          <div class="layout-tune-header-actions">
            <button class="layout-tune-button" type="button" data-layout-tune-action="pick">选取</button>
            <button class="layout-tune-button" type="button" data-layout-tune-action="copy">复制参数</button>
            <button class="layout-tune-button" type="button" data-layout-tune-action="reset-all">全部重置</button>
            <button class="layout-tune-button layout-tune-button-icon" type="button" data-layout-tune-action="hide" aria-label="隐藏布局调节器" title="隐藏（Ctrl + Shift + L）">×</button>
          </div>
        </header>
        <nav class="layout-tune-targets" aria-label="可调节区域"></nav>
        <div class="layout-tune-properties"></div>
        <footer class="layout-tune-footer" aria-live="polite"></footer>
      </section>
      <div class="layout-tune-hover" hidden></div>
      <div class="layout-tune-selection" hidden>
        <button class="layout-tune-selection-label" type="button" aria-label="拖动移动所选区域"></button>
        <button class="layout-tune-handle" type="button" data-direction="north" aria-label="调整上边缘"></button>
        <button class="layout-tune-handle" type="button" data-direction="east" aria-label="调整右边缘"></button>
        <button class="layout-tune-handle" type="button" data-direction="south" aria-label="调整下边缘"></button>
        <button class="layout-tune-handle" type="button" data-direction="west" aria-label="调整左边缘"></button>
      </div>
      <div class="layout-tune-toast" role="status" aria-live="polite"></div>
    `;
    document.body.append(root);
    documentElement.setAttribute(activeAttribute, "true");

    const panel = root.querySelector(".layout-tune-panel");
    const targetList = root.querySelector(".layout-tune-targets");
    const propertyList = root.querySelector(".layout-tune-properties");
    const footer = root.querySelector(".layout-tune-footer");
    const selection = root.querySelector(".layout-tune-selection");
    const selectionLabel = root.querySelector(".layout-tune-selection-label");
    const hoverOutline = root.querySelector(".layout-tune-hover");
    const toast = root.querySelector(".layout-tune-toast");
    const pickButton = root.querySelector("[data-layout-tune-action='pick']");
    const targetButtons = new Map();

    function targetElement(targetKey) {
      const selector = targets[targetKey]?.selector;
      return selector ? document.querySelector(selector) : null;
    }

    function targetIsAvailable(targetKey) {
      return targetKey === "spacing" || isElementVisible(targetElement(targetKey));
    }

    function boundsFor(key) {
      const definition = properties[key];
      let min = definition.min;
      let max = definition.max;
      if (definition.positionTarget && definition.axis) {
        const element = targetElement(definition.positionTarget);
        if (isElementVisible(element)) {
          const rect = element.getBoundingClientRect();
          const current = finiteNumber(values[key]);
          const start = definition.axis === "x" ? rect.left : rect.top;
          const end = definition.axis === "x" ? rect.right : rect.bottom;
          const viewportSize = definition.axis === "x" ? window.innerWidth : window.innerHeight;
          const safeInset = 8;
          const visibleMin = Math.ceil(current + safeInset - start);
          const visibleMax = Math.floor(current + viewportSize - safeInset - end);
          if (visibleMin <= visibleMax) {
            min = Math.max(min, visibleMin);
            max = Math.min(max, visibleMax);
          } else {
            min = current;
            max = current;
          }
        }
      } else if (key === "assetWidth") {
        const handle = document.querySelector("#assetLibraryResizeHandle");
        min = finiteNumber(handle?.getAttribute("aria-valuemin"), min);
        max = finiteNumber(handle?.getAttribute("aria-valuemax"), max);
      } else if (key === "agentTopInset") {
        max = Math.max(0, window.innerHeight - 420 - finiteNumber(values.agentBottomInset));
      } else if (key === "agentBottomInset") {
        max = Math.max(0, window.innerHeight - 420 - finiteNumber(values.agentTopInset));
      }
      return { min, max: Math.max(min, max) };
    }

    function refreshRuntimeValues() {
      const runtimeValues = adapter.getRuntimeValues();
      for (const [key, definition] of Object.entries(properties)) {
        if (!definition.runtime) continue;
        values[key] = finiteNumber(runtimeValues[key], values[key]);
      }
    }

    function persistValues() {
      window.clearTimeout(persistTimer);
      persistTimer = 0;
      const changed = {};
      for (const key of Object.keys(properties)) {
        if (Math.abs(finiteNumber(values[key]) - finiteNumber(baseline[key])) >= 0.1) {
          changed[key] = rounded(values[key]);
        }
      }
      try {
        if (Object.keys(changed).length > 0) {
          window.sessionStorage.setItem(storageKey, JSON.stringify(changed));
        } else {
          window.sessionStorage.removeItem(storageKey);
        }
      } catch {
        // The visual tool remains usable when storage is unavailable.
      }
    }

    function schedulePersist() {
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(persistValues, 80);
    }

    function applyValue(key, rawValue, options = {}) {
      const definition = properties[key];
      if (!definition) return;
      const bounds = boundsFor(key);
      const nextValue = rounded(clamp(finiteNumber(rawValue, values[key]), bounds.min, bounds.max));
      if (definition.token) {
        documentElement.style.setProperty(definition.token, `${nextValue}px`);
        values[key] = nextValue;
      } else {
        adapter.setRuntimeValue(key, nextValue);
        refreshRuntimeValues();
      }
      syncPropertyInputs();
      scheduleOutlineUpdate();
      if (options.persist !== false) schedulePersist();
    }

    function restoreCssProperty(key) {
      const definition = properties[key];
      const original = cssBaseline[key];
      if (!definition?.token || !original) return;
      if (original.inlineValue) {
        documentElement.style.setProperty(definition.token, original.inlineValue, original.inlinePriority);
      } else {
        documentElement.style.removeProperty(definition.token);
      }
      values[key] = finiteNumber(
        window.getComputedStyle(documentElement).getPropertyValue(definition.token),
        baseline[key],
      );
    }

    function resetValue(key) {
      if (properties[key]?.token) restoreCssProperty(key);
      else adapter.setRuntimeValue(key, baseline[key]);
      refreshRuntimeValues();
      syncPropertyInputs();
      scheduleOutlineUpdate();
      persistValues();
    }

    function resetAll() {
      for (const [key, definition] of Object.entries(properties)) {
        if (definition.token) restoreCssProperty(key);
      }
      for (const [key, definition] of Object.entries(properties)) {
        if (definition.runtime) adapter.setRuntimeValue(key, baseline[key]);
      }
      refreshRuntimeValues();
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage restrictions in the visual tool.
      }
      renderProperties();
      scheduleOutlineUpdate();
      showToast("已恢复进入页面时的布局");
    }

    function syncPropertyInputs() {
      for (const input of propertyList.querySelectorAll("[data-layout-tune-property]")) {
        const key = input.getAttribute("data-layout-tune-property");
        const value = values[key];
        const bounds = boundsFor(key);
        input.min = String(bounds.min);
        input.max = String(bounds.max);
        input.value = String(rounded(value));
      }
    }

    function renderProperties() {
      propertyList.replaceChildren();
      const target = targets[selectedTargetKey];
      if (!target) return;
      for (const key of target.propertyKeys) {
        const definition = properties[key];
        const bounds = boundsFor(key);
        const row = createElement("label", "layout-tune-property");
        const label = createElement("span", "layout-tune-property-label", definition.label);
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(bounds.min);
        range.max = String(bounds.max);
        range.step = "1";
        range.value = String(rounded(values[key]));
        range.setAttribute("data-layout-tune-property", key);
        range.setAttribute("aria-label", definition.label);

        const numberWrap = createElement("span", "layout-tune-number-wrap");
        const number = document.createElement("input");
        number.className = "layout-tune-number";
        number.type = "number";
        number.min = String(bounds.min);
        number.max = String(bounds.max);
        number.step = "1";
        number.value = String(rounded(values[key]));
        number.setAttribute("data-layout-tune-property", key);
        number.setAttribute("aria-label", `${definition.label}，像素`);
        numberWrap.append(number, createElement("span", "layout-tune-number-unit", "px"));

        const reset = createElement("button", "layout-tune-property-reset", "↺");
        reset.type = "button";
        reset.title = `重置${definition.label}`;
        reset.setAttribute("aria-label", `重置${definition.label}`);
        reset.addEventListener("click", () => resetValue(key));

        const update = (event) => {
          if (event.currentTarget.value === "") return;
          applyValue(key, event.currentTarget.value);
        };
        range.addEventListener("input", update);
        number.addEventListener("input", update);
        number.addEventListener("change", () => syncPropertyInputs());
        row.append(label, range, numberWrap, reset);
        propertyList.append(row);
      }
      footer.innerHTML = `<strong>${target.label}</strong>${target.hint}`;
    }

    function showToast(message) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.add("is-visible");
      toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1500);
    }

    function updateTargetButtons() {
      for (const [targetKey, button] of targetButtons) {
        const available = targetIsAvailable(targetKey);
        button.disabled = !available;
        button.classList.toggle("is-active", targetKey === selectedTargetKey);
        button.title = available ? targets[targetKey].label : `请先展开${targets[targetKey].label}`;
      }
    }

    function setOutlineRect(outline, element) {
      if (!isElementVisible(element)) {
        outline.hidden = true;
        return null;
      }
      const rect = element.getBoundingClientRect();
      outline.hidden = false;
      outline.style.left = `${rect.left}px`;
      outline.style.top = `${rect.top}px`;
      outline.style.width = `${rect.width}px`;
      outline.style.height = `${rect.height}px`;
      return rect;
    }

    function updateOutline() {
      frameRequest = 0;
      updateTargetButtons();
      const target = targets[selectedTargetKey];
      const element = targetElement(selectedTargetKey);
      const rect = target?.selector ? setOutlineRect(selection, element) : null;
      if (!rect) {
        selection.hidden = true;
      } else {
        const moveText = target.move
          ? ` · X ${Math.round(rect.left)} · Y ${Math.round(rect.top)}`
          : "";
        const dragText = drag?.kind === "resize"
          ? ` · ${properties[drag.key].label} ${rounded(values[drag.key])}px`
          : "";
        selection.classList.toggle("label-inside", rect.top < 32);
        selectionLabel.textContent = `${target.label} · ${Math.round(rect.width)} × ${Math.round(rect.height)}${moveText}${dragText}`;
        selectionLabel.disabled = !target.move;
        selectionLabel.title = target.move ? "拖动移动；方向键微调；Shift + 方向键移动 8px；Home 归零" : "";
        for (const handle of selection.querySelectorAll(".layout-tune-handle")) {
          const direction = handle.getAttribute("data-direction");
          const mapping = target.handles[direction];
          handle.classList.toggle("is-visible", Boolean(mapping));
          handle.tabIndex = mapping ? 0 : -1;
          if (mapping) handle.title = properties[mapping.key].label;
        }
      }

      const hoveredElement = targetElement(hoveredTargetKey);
      if (!picking || !hoveredTargetKey || hoveredTargetKey === selectedTargetKey) {
        hoverOutline.hidden = true;
      } else {
        setOutlineRect(hoverOutline, hoveredElement);
      }
    }

    function scheduleOutlineUpdate() {
      if (frameRequest) return;
      frameRequest = window.requestAnimationFrame(updateOutline);
    }

    function selectTarget(targetKey) {
      if (!targets[targetKey] || !targetIsAvailable(targetKey)) return;
      selectedTargetKey = targetKey;
      stopPicking();
      updateTargetButtons();
      renderProperties();
      scheduleOutlineUpdate();
    }

    function findTargetKey(node) {
      if (!(node instanceof Node) || root.contains(node)) return null;
      for (const [targetKey, target] of Object.entries(targets)) {
        if (!target.selector || !targetIsAvailable(targetKey)) continue;
        const element = targetElement(targetKey);
        if (element === node || element?.contains(node)) return targetKey;
      }
      return null;
    }

    function startPicking() {
      picking = true;
      hoveredTargetKey = null;
      root.classList.add("is-picking");
      documentElement.setAttribute("data-layout-tune-picking", "true");
      pickButton.classList.add("is-active");
      pickButton.textContent = "点击区域";
      showToast("点击项目条、资产库、工具条或 Agent");
    }

    function stopPicking() {
      picking = false;
      hoveredTargetKey = null;
      root.classList.remove("is-picking");
      documentElement.removeAttribute("data-layout-tune-picking");
      pickButton.classList.remove("is-active");
      pickButton.textContent = "选取";
      hoverOutline.hidden = true;
    }

    function onPickerPointerMove(event) {
      if (!picking) return;
      const nextTargetKey = findTargetKey(event.target);
      if (hoveredTargetKey === nextTargetKey) return;
      hoveredTargetKey = nextTargetKey;
      scheduleOutlineUpdate();
    }

    function onPickerPointerDown(event) {
      if (!picking || !findTargetKey(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function onPickerClick(event) {
      if (!picking) return;
      const targetKey = findTargetKey(event.target);
      if (!targetKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectTarget(targetKey);
    }

    function endDrag({ restore = false } = {}) {
      if (!drag) return;
      const currentDrag = drag;
      drag = null;
      currentDrag.cleanup?.();
      documentElement.removeAttribute("data-layout-tune-dragging");
      if (restore && currentDrag.kind === "move") {
        applyValue(currentDrag.xKey, currentDrag.startX, { persist: false });
        applyValue(currentDrag.yKey, currentDrag.startY, { persist: false });
      } else if (restore) {
        applyValue(currentDrag.key, currentDrag.startValue, { persist: false });
      }
      persistValues();
      renderProperties();
      scheduleOutlineUpdate();
    }

    function startDrag(event, direction) {
      const mapping = targets[selectedTargetKey]?.handles?.[direction];
      if (!mapping || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const startPoint = mapping.axis === "x" ? event.clientX : event.clientY;
      const pointerId = event.pointerId;
      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId || !drag) return;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        const point = mapping.axis === "x" ? moveEvent.clientX : moveEvent.clientY;
        const delta = (point - startPoint) * mapping.sign;
        applyValue(mapping.key, drag.startValue + delta, { persist: false });
      };
      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        upEvent.preventDefault();
        upEvent.stopPropagation();
        endDrag();
      };
      const onCancel = (cancelEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        cancelEvent.preventDefault();
        cancelEvent.stopPropagation();
        endDrag({ restore: true });
      };
      const cleanup = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      };
      drag = {
        kind: "resize",
        key: mapping.key,
        direction,
        startValue: values[mapping.key],
        cleanup,
      };
      documentElement.setAttribute("data-layout-tune-dragging", "true");
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
      handle.setPointerCapture?.(pointerId);
      scheduleOutlineUpdate();
    }

    function startMove(event) {
      const mapping = targets[selectedTargetKey]?.move;
      if (!mapping || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId || drag?.kind !== "move") return;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        applyValue(mapping.xKey, drag.startX + moveEvent.clientX - startClientX, { persist: false });
        applyValue(mapping.yKey, drag.startY + moveEvent.clientY - startClientY, { persist: false });
      };
      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        upEvent.preventDefault();
        upEvent.stopPropagation();
        endDrag();
      };
      const onCancel = (cancelEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        cancelEvent.preventDefault();
        cancelEvent.stopPropagation();
        endDrag({ restore: true });
      };
      const cleanup = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      };
      drag = {
        kind: "move",
        xKey: mapping.xKey,
        yKey: mapping.yKey,
        startX: values[mapping.xKey],
        startY: values[mapping.yKey],
        cleanup,
      };
      documentElement.setAttribute("data-layout-tune-dragging", "true");
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
      handle.setPointerCapture?.(pointerId);
      scheduleOutlineUpdate();
    }

    function onMoveHandleKeyDown(event) {
      const mapping = targets[selectedTargetKey]?.move;
      if (!mapping) return;
      if (event.key === "Home") {
        event.preventDefault();
        resetValue(mapping.xKey);
        resetValue(mapping.yKey);
        return;
      }
      const step = event.shiftKey ? 8 : 1;
      const xDelta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
      const yDelta = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
      if (!xDelta && !yDelta) return;
      event.preventDefault();
      if (xDelta) applyValue(mapping.xKey, values[mapping.xKey] + xDelta);
      if (yDelta) applyValue(mapping.yKey, values[mapping.yKey] + yDelta);
    }

    function onHandleKeyDown(event, direction) {
      const mapping = targets[selectedTargetKey]?.handles?.[direction];
      if (!mapping) return;
      if (event.key === "Home") {
        event.preventDefault();
        resetValue(mapping.key);
        return;
      }
      const physicalDelta = mapping.axis === "x"
        ? (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0)
        : (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0);
      if (!physicalDelta) return;
      event.preventDefault();
      applyValue(mapping.key, values[mapping.key] + physicalDelta * mapping.sign * (event.shiftKey ? 8 : 1));
    }

    async function copyText(text) {
      try {
        await window.navigator.clipboard.writeText(text);
        return true;
      } catch {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        return copied;
      }
    }

    function layoutSnapshotText() {
      const cssLines = Object.entries(properties)
        .filter(([, definition]) => definition.token)
        .map(([key, definition]) => `  ${definition.token}: ${rounded(values[key])}px;`);
      return [
        "/* Reelay layout tuning snapshot */",
        ":root {",
        ...cssLines,
        "}",
        "",
        ".app-shell {",
        `  --asset-panel-width: ${rounded(values.assetWidth)}px;`,
        `  --agent-width: ${rounded(values.agentWidth)}px;`,
        "}",
        "",
        ".agent-dock {",
        `  --agent-width: ${rounded(values.agentWidth)}px;`,
        `  --agent-top-inset: ${rounded(values.agentTopInset)}px;`,
        `  --agent-bottom-inset: ${rounded(values.agentBottomInset)}px;`,
        "}",
      ].join("\n");
    }

    function showTuner() {
      root.hidden = false;
      scheduleOutlineUpdate();
      panel.querySelector("button")?.focus({ preventScroll: true });
    }

    function hideTuner() {
      stopPicking();
      if (drag) endDrag({ restore: true });
      root.hidden = true;
    }

    function onDocumentKeyDown(event) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.code === "KeyL") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (root.hidden) showTuner();
        else hideTuner();
        return;
      }
      if (event.key !== "Escape") return;
      if (drag) {
        event.preventDefault();
        event.stopImmediatePropagation();
        endDrag({ restore: true });
      } else if (picking) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopPicking();
      } else if (root.contains(document.activeElement)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        hideTuner();
      }
    }

    for (const [targetKey, target] of Object.entries(targets)) {
      const button = createElement("button", "layout-tune-target", target.label);
      button.type = "button";
      button.setAttribute("data-layout-tune-target", targetKey);
      button.addEventListener("click", () => selectTarget(targetKey));
      targetList.append(button);
      targetButtons.set(targetKey, button);
    }

    for (const handle of selection.querySelectorAll(".layout-tune-handle")) {
      const direction = handle.getAttribute("data-direction");
      handle.addEventListener("pointerdown", (event) => startDrag(event, direction));
      handle.addEventListener("keydown", (event) => onHandleKeyDown(event, direction));
    }
    selectionLabel.addEventListener("pointerdown", startMove);
    selectionLabel.addEventListener("keydown", onMoveHandleKeyDown);

    pickButton.addEventListener("click", () => {
      if (picking) stopPicking();
      else startPicking();
    });
    root.querySelector("[data-layout-tune-action='copy']").addEventListener("click", async () => {
      const copied = await copyText(layoutSnapshotText());
      showToast(copied ? "布局参数已复制" : "无法访问剪贴板，请稍后重试");
    });
    root.querySelector("[data-layout-tune-action='reset-all']").addEventListener("click", resetAll);
    root.querySelector("[data-layout-tune-action='hide']").addEventListener("click", hideTuner);

    for (const eventName of ["pointerdown", "click", "dblclick", "wheel", "keydown", "keyup"]) {
      root.addEventListener(eventName, (event) => event.stopPropagation());
    }

    document.addEventListener("pointermove", onPickerPointerMove, true);
    document.addEventListener("pointerdown", onPickerPointerDown, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    window.addEventListener("resize", scheduleOutlineUpdate);

    const resizeObserver = typeof window.ResizeObserver === "function"
      ? new window.ResizeObserver(scheduleOutlineUpdate)
      : null;
    for (const target of Object.values(targets)) {
      const element = target.selector ? document.querySelector(target.selector) : null;
      if (element) resizeObserver?.observe(element);
    }
    const mutationObserver = new MutationObserver(scheduleOutlineUpdate);
    const shell = document.querySelector(".app-shell");
    if (shell) {
      mutationObserver.observe(shell, {
        attributes: true,
        attributeFilter: ["class", "aria-hidden", "style"],
        subtree: true,
      });
    }

    for (const [key, storedValue] of Object.entries(parseStoredValues())) {
      if (properties[key]) applyValue(key, storedValue, { persist: false });
    }
    refreshRuntimeValues();
    selectedTargetKey = ["asset", "agent", "project"].find(targetIsAvailable) || "spacing";
    renderProperties();
    updateTargetButtons();
    scheduleOutlineUpdate();

    return Object.freeze({
      getValues: () => ({ ...values }),
      show: showTuner,
      hide: hideTuner,
      reset: resetAll,
      destroy() {
        endDrag({ restore: true });
        stopPicking();
        window.clearTimeout(persistTimer);
        window.clearTimeout(toastTimer);
        window.cancelAnimationFrame(frameRequest);
        resizeObserver?.disconnect();
        mutationObserver.disconnect();
        document.removeEventListener("pointermove", onPickerPointerMove, true);
        document.removeEventListener("pointerdown", onPickerPointerDown, true);
        document.removeEventListener("click", onPickerClick, true);
        document.removeEventListener("keydown", onDocumentKeyDown, true);
        window.removeEventListener("resize", scheduleOutlineUpdate);
        documentElement.removeAttribute(activeAttribute);
        root.remove();
      },
    });
  }

  window.REELAY_CANVAS_LAYOUT_TUNER_BOOTSTRAP = mountLayoutTuner;
})();
