(function registerCanvasConnectionRenderer(root) {
  "use strict";

  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function createSvgElement(name, className) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    if (className) element.classList.add(className);
    return element;
  }

  const CONFIRMATION_ELEMENT_CLASSES = Object.freeze([
    "connection-confirmation-path",
    "connection-confirmation-endpoint",
  ]);

  function animateElement(element, keyframes, duration) {
    if (typeof element?.animate !== "function") return null;
    return element.animate(keyframes, {
      duration,
      easing: "cubic-bezier(0.22, 0.72, 0.28, 1)",
      fill: "both",
    });
  }

  function createConnectionRenderer(options) {
    const paths = options?.paths;
    const batchPreviewPaths = options?.batchPreviewPaths;
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

    function clearConnectionConfirmation(group) {
      group.classList.remove("is-confirming");
      delete group.dataset.feedbackToken;
      CONFIRMATION_ELEMENT_CLASSES.forEach((className) => {
        group.querySelector(`.${className}`)?.remove();
      });
    }

    function syncConfirmationGeometry(group, pathData, endpoint) {
      group.querySelector(".connection-confirmation-path")?.setAttribute("d", pathData);
      const marker = group.querySelector(".connection-confirmation-endpoint");
      marker?.setAttribute("cx", endpoint.x);
      marker?.setAttribute("cy", endpoint.y);
    }

    function createConfirmationElements(group, pathData, endpoint) {
      const hitPath = group.querySelector(".connection-hit-path");
      const path = createSvgElement("path", "connection-confirmation-path");
      const marker = createSvgElement("circle", "connection-confirmation-endpoint");
      marker.setAttribute("r", "3.2");
      group.insertBefore(path, hitPath);
      group.insertBefore(marker, hitPath);
      syncConfirmationGeometry(group, pathData, endpoint);
      return { path, marker };
    }

    function startConfirmationAnimations(elements, profile) {
      const opacity = profile.overlayOpacity;
      const animations = [
        animateElement(elements.path, [
          { opacity: 0.38 * opacity, offset: 0 },
          { opacity: 0.78 * opacity, offset: profile.linePeakOffset },
          { opacity: 0, offset: 1 },
        ], profile.totalMs),
        animateElement(elements.marker, [
          { opacity: 0.7 * opacity, transform: "scale(0.72)", offset: 0 },
          { opacity: 0.92 * opacity, transform: "scale(1)", offset: profile.endpointPeakOffset },
          { opacity: 0, transform: "scale(1.55)", offset: 1 },
        ], profile.totalMs),
      ].filter(Boolean);
      return animations;
    }

    function syncConnectionConfirmation(group, feedback, pathData, points, callbacks) {
      if (!feedback || feedback.profile?.reducedMotion || feedback.profile?.totalMs <= 0) {
        clearConnectionConfirmation(group);
        return;
      }
      const endpoint = feedback.direction === "reverse" ? points.source : points.target;
      const token = String(feedback.token);
      if (group.dataset.feedbackToken === token) {
        syncConfirmationGeometry(group, pathData, endpoint);
        return;
      }
      clearConnectionConfirmation(group);
      if (callbacks.onStart?.(feedback.id, feedback.token) === false) return;
      group.dataset.feedbackToken = token;
      group.classList.add("is-confirming");
      const elements = createConfirmationElements(group, pathData, endpoint);
      const animations = startConfirmationAnimations(elements, feedback.profile);
      if (animations.length) {
        Promise.all(animations.map((animation) => animation.finished))
          .then(() => callbacks.onComplete?.(feedback.id, feedback.token))
          .catch(() => {});
      } else {
        clearConnectionConfirmation(group);
        Promise.resolve().then(() => callbacks.onComplete?.(feedback.id, feedback.token));
      }
    }

    function renderConnections(input) {
      const existingGroups = new Map(
        Array.from(paths.children, (group) => [group.dataset.connectionId, group]),
      );
      const renderedGroups = [];

      input.connections.forEach((connection) => {
        const points = input.resolvePoints(connection);
        if (!points) return;
        const feedback = input.connectionFeedbacks?.get(connection.id) || null;
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
        group.classList.toggle(
          "is-muted",
          input.hasFocusedContext && !isActive && !isRelated,
        );
        renderedGroups.push({
          group,
          rank: isActive ? 3 : isRelated ? 2 : input.hasFocusedContext ? 0 : 1,
        });
        group.querySelectorAll(".connection-underlay, .connection-path, .connection-hit-path")
          .forEach((element) => element.setAttribute("d", pathData));
        syncConnectionConfirmation(group, feedback, pathData, points, {
          onStart: input.onFeedbackStart,
          onComplete: input.onFeedbackComplete,
        });
        positionCutControl(group, {
          x: (points.source.x + points.target.x) / 2,
          y: (points.source.y + points.target.y) / 2,
        });
      });

      existingGroups.forEach((group) => group.remove());
      renderedGroups
        .sort((a, b) => a.rank - b.rank)
        .forEach(({ group }) => paths.appendChild(group));
    }

    function renderPreview(action, getPath) {
      if (action?.type === "connect" && action.mode === "selection-output") {
        preview.classList.add("hidden");
        preview.classList.remove("is-near-target", "is-snapped");
        preview.removeAttribute("d");
        previewEndpoint?.classList.add("hidden");
        previewEndpoint?.classList.remove("is-near-target", "is-snapped");
        previewEndpoint?.removeAttribute("cx");
        previewEndpoint?.removeAttribute("cy");
        if (!batchPreviewPaths) return;
        const existing = new Map(Array.from(
          batchPreviewPaths.children,
          (path) => [path.dataset.sourceNodeId, path],
        ));
        (action.origins || []).forEach((origin) => {
          let path = existing.get(origin.nodeId);
          if (path) {
            existing.delete(origin.nodeId);
          } else {
            path = createSvgElement("path", "connection-preview");
            path.classList.add("selection-connection-preview");
            batchPreviewPaths.appendChild(path);
          }
          path.dataset.sourceNodeId = origin.nodeId;
          path.setAttribute("d", getPath(origin.start, action.current));
          path.classList.toggle("is-near-target", Boolean(action.nearPortId));
          path.classList.toggle("is-snapped", Boolean(action.targetPortId));
          path.classList.toggle("is-pending-create", Boolean(action.pendingCreate));
        });
        existing.forEach((path) => path.remove());
        return;
      }

      batchPreviewPaths?.replaceChildren();
      if (action?.type === "connect") {
        preview.setAttribute(
          "d",
          action.originSide === "input"
            ? getPath(action.current, action.start)
            : getPath(action.start, action.current),
        );
        preview.classList.remove("hidden");
        preview.classList.toggle("is-near-target", Boolean(action.nearPortId));
        preview.classList.toggle("is-snapped", Boolean(action.targetPortId));
        preview.classList.toggle("is-pending-create", Boolean(action.pendingCreate));
        previewEndpoint?.setAttribute("cx", action.current.x);
        previewEndpoint?.setAttribute("cy", action.current.y);
        previewEndpoint?.classList.toggle("hidden", Boolean(action.pendingCreate));
        previewEndpoint?.classList.toggle("is-near-target", Boolean(action.nearPortId));
        previewEndpoint?.classList.toggle("is-snapped", Boolean(action.targetPortId));
        return;
      }

      preview.classList.add("hidden");
      preview.classList.remove("is-near-target", "is-snapped", "is-pending-create");
      preview.removeAttribute("d");
      previewEndpoint?.classList.add("hidden");
      previewEndpoint?.classList.remove("is-near-target", "is-snapped");
      previewEndpoint?.removeAttribute("cx");
      previewEndpoint?.removeAttribute("cy");
    }

    return Object.freeze({ renderConnections, renderPreview });
  }

  root.REELAY_CANVAS_CONNECTION_RENDERER = Object.freeze({ createConnectionRenderer });
}(typeof globalThis === "object" ? globalThis : window));
