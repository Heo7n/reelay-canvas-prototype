(function registerCanvasConnectionRenderer(root) {
  "use strict";

  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function createSvgElement(name, className) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    if (className) element.classList.add(className);
    return element;
  }

  function createConnectionRenderer(options) {
    const paths = options?.paths;
    const preview = options?.preview;
    const previewEndpoint = options?.previewEndpoint;
    const onSelect = typeof options?.onSelect === "function" ? options.onSelect : () => {};
    const onRemove = typeof options?.onRemove === "function" ? options.onRemove : () => {};
    if (!paths || !preview) return null;

    function getPointerPoint(event) {
      const matrix = paths.getScreenCTM?.();
      if (!matrix || typeof window.DOMPoint !== "function") return null;
      return new window.DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    }

    function positionCutControl(group, point) {
      const control = group.querySelector(".connection-cut-control");
      if (!control || !point) return;
      const scale = Number(group.dataset.controlScale) || 1;
      control.setAttribute("transform", `translate(${point.x} ${point.y}) scale(${scale})`);
    }

    function createGroup() {
      const group = createSvgElement("g", "connection-group");
      const underlay = createSvgElement("path", "connection-underlay");
      const path = createSvgElement("path", "connection-path");
      const hitPath = createSvgElement("path", "connection-hit-path");
      [underlay, path].forEach((element) => element.setAttribute("pathLength", "1"));

      hitPath.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (group.dataset.connectionId) onSelect(group.dataset.connectionId);
      });
      hitPath.addEventListener("pointerenter", (event) => {
        positionCutControl(group, getPointerPoint(event));
      });
      hitPath.addEventListener("pointermove", (event) => {
        positionCutControl(group, getPointerPoint(event));
      });

      const cutControl = createSvgElement("g", "connection-cut-control");
      cutControl.setAttribute("role", "button");
      cutControl.setAttribute("aria-label", "断开连接");

      const cutTitle = createSvgElement("title");
      cutTitle.textContent = "断开连接";
      const cutSurface = createSvgElement("circle", "connection-cut-surface");
      cutSurface.setAttribute("r", "11");
      const cutMarkA = createSvgElement("path", "connection-cut-mark");
      cutMarkA.setAttribute("d", "M -1.8 -2 L 4.2 2.4");
      const cutMarkB = createSvgElement("path", "connection-cut-mark");
      cutMarkB.setAttribute("d", "M -1.8 2 L 4.2 -2.4");
      const cutHandleA = createSvgElement("circle", "connection-cut-mark");
      cutHandleA.classList.add("connection-cut-handle");
      cutHandleA.setAttribute("cx", "-3.25");
      cutHandleA.setAttribute("cy", "-3");
      cutHandleA.setAttribute("r", "1.55");
      const cutHandleB = createSvgElement("circle", "connection-cut-mark");
      cutHandleB.classList.add("connection-cut-handle");
      cutHandleB.setAttribute("cx", "-3.25");
      cutHandleB.setAttribute("cy", "3");
      cutHandleB.setAttribute("r", "1.55");

      cutControl.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      cutControl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (group.dataset.connectionId) onRemove(group.dataset.connectionId);
      });
      cutControl.append(cutTitle, cutSurface, cutMarkA, cutMarkB, cutHandleA, cutHandleB);
      group.append(underlay, path, hitPath, cutControl);
      return group;
    }

    function renderConnections(input) {
      const existingGroups = new Map(
        Array.from(paths.children, (group) => [group.dataset.connectionId, group]),
      );

      input.connections.forEach((connection) => {
        const points = input.resolvePoints(connection);
        if (!points) return;
        const pathData = input.getPath(points.source, points.target);
        let group = existingGroups.get(connection.id);
        if (group) {
          existingGroups.delete(connection.id);
        } else {
          group = createGroup();
          paths.appendChild(group);
        }

        const isActive = input.activeConnectionId === connection.id;
        const isRelated = input.relatedConnectionIds.has(connection.id);
        group.dataset.connectionId = connection.id;
        group.dataset.controlScale = input.controlScale;
        group.classList.toggle("is-active", isActive);
        group.classList.toggle("is-related", isRelated);
        group.classList.toggle("is-new", input.recentConnectionId === connection.id);
        group.classList.toggle(
          "is-muted",
          input.hasFocusedContext && !isActive && !isRelated,
        );
        group.querySelectorAll(".connection-underlay, .connection-path, .connection-hit-path")
          .forEach((element) => element.setAttribute("d", pathData));
        positionCutControl(group, {
          x: (points.source.x + points.target.x) / 2,
          y: (points.source.y + points.target.y) / 2,
        });
      });

      existingGroups.forEach((group) => group.remove());
    }

    function renderPreview(action, getPath) {
      if (action?.type === "connect") {
        preview.setAttribute(
          "d",
          action.originSide === "input"
            ? getPath(action.current, action.start)
            : getPath(action.start, action.current),
        );
        preview.classList.remove("hidden");
        previewEndpoint?.setAttribute("cx", action.current.x);
        previewEndpoint?.setAttribute("cy", action.current.y);
        previewEndpoint?.classList.remove("hidden");
        previewEndpoint?.classList.toggle("is-snapped", Boolean(action.targetPortId));
        return;
      }

      preview.classList.add("hidden");
      preview.removeAttribute("d");
      previewEndpoint?.classList.add("hidden");
      previewEndpoint?.classList.remove("is-snapped");
      previewEndpoint?.removeAttribute("cx");
      previewEndpoint?.removeAttribute("cy");
    }

    return Object.freeze({ renderConnections, renderPreview });
  }

  root.REELAY_CANVAS_CONNECTION_RENDERER = Object.freeze({ createConnectionRenderer });
}(typeof globalThis === "object" ? globalThis : window));
