(function registerCanvasConnectionRenderer(root) {
  "use strict";

  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function createSvgElement(name, className) {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    if (className) element.classList.add(className);
    return element;
  }

  const SETTLE_ELEMENT_CLASSES = Object.freeze([
    "connection-settle-progress",
    "connection-settle-trail",
    "connection-settle-head",
    "connection-settle-origin",
    "connection-settle-arrival",
  ]);

  function getDashOffset(segmentLength, progress) {
    return String(segmentLength - progress);
  }

  function animateElement(element, keyframes, duration) {
    if (typeof element?.animate !== "function") return null;
    return element.animate(keyframes, {
      duration,
      easing: "linear",
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

    function clearSettleHighlight(group) {
      group.classList.remove("is-settling");
      delete group.dataset.feedbackToken;
      SETTLE_ELEMENT_CLASSES.forEach((className) => {
        group.querySelector(`.${className}`)?.remove();
      });
    }

    function syncSettleGeometry(group, pathData, origin, arrival) {
      group.querySelectorAll(
        ".connection-settle-progress, .connection-settle-trail, .connection-settle-head",
      ).forEach((element) => element.setAttribute("d", pathData));
      const originMarker = group.querySelector(".connection-settle-origin");
      originMarker?.setAttribute("cx", origin.x);
      originMarker?.setAttribute("cy", origin.y);
      const arrivalMarker = group.querySelector(".connection-settle-arrival");
      arrivalMarker?.setAttribute("cx", arrival.x);
      arrivalMarker?.setAttribute("cy", arrival.y);
    }

    function createSettleElements(group, pathData, origin, arrival, profile) {
      const hitPath = group.querySelector(".connection-hit-path");
      const progress = createSvgElement("path", "connection-settle-progress");
      const trail = createSvgElement("path", "connection-settle-trail");
      const head = createSvgElement("path", "connection-settle-head");
      const originMarker = createSvgElement("circle", "connection-settle-origin");
      const arrivalMarker = createSvgElement("circle", "connection-settle-arrival");
      originMarker.setAttribute("r", "2.7");
      arrivalMarker.setAttribute("r", "3.1");
      [progress, trail, head].forEach((element) => element.setAttribute("pathLength", "1"));
      progress.style.strokeDasharray = "1 1";
      trail.style.strokeDasharray = `${profile.tailLength} 1`;
      head.style.strokeDasharray = `${profile.headLength} 1`;
      [progress, trail, head, originMarker, arrivalMarker]
        .forEach((element) => group.insertBefore(element, hitPath));
      syncSettleGeometry(group, pathData, origin, arrival);
      return { progress, trail, head, originMarker, arrivalMarker };
    }

    function startSettleAnimations(elements, profile) {
      const { originEnd, travelEnd, arrivalEnd } = profile.phaseOffsets;
      const originFadeEnd = Math.min(travelEnd, originEnd + 80 / profile.totalMs);
      const opacity = profile.overlayOpacity;
      const animations = [
        animateElement(elements.progress, [
          { strokeDashoffset: "1", opacity: 0.5 * opacity, offset: 0 },
          { strokeDashoffset: String(1 - profile.originProgress), opacity: 0.72 * opacity, offset: originEnd },
          { strokeDashoffset: "0", opacity: 0.76 * opacity, offset: travelEnd },
          { strokeDashoffset: "0", opacity: 0.68 * opacity, offset: arrivalEnd },
          { strokeDashoffset: "0", opacity: 0, offset: 1 },
        ], profile.totalMs),
        animateElement(elements.trail, [
          { strokeDashoffset: getDashOffset(profile.tailLength, 0), opacity: 0.44 * opacity, offset: 0 },
          { strokeDashoffset: getDashOffset(profile.tailLength, profile.originProgress), opacity: 0.64 * opacity, offset: originEnd },
          { strokeDashoffset: getDashOffset(profile.tailLength, 1), opacity: 0.88 * opacity, offset: travelEnd },
          { strokeDashoffset: getDashOffset(profile.tailLength, 1), opacity: 0.56 * opacity, offset: arrivalEnd },
          { strokeDashoffset: getDashOffset(profile.tailLength, 1), opacity: 0, offset: 1 },
        ], profile.totalMs),
        animateElement(elements.head, [
          { strokeDashoffset: getDashOffset(profile.headLength, 0), opacity: 0.72 * opacity, offset: 0 },
          { strokeDashoffset: getDashOffset(profile.headLength, profile.originProgress), opacity, offset: originEnd },
          { strokeDashoffset: getDashOffset(profile.headLength, 1), opacity, offset: travelEnd },
          { strokeDashoffset: getDashOffset(profile.headLength, 1), opacity: 0.42 * opacity, offset: arrivalEnd },
          { strokeDashoffset: getDashOffset(profile.headLength, 1), opacity: 0, offset: 1 },
        ], profile.totalMs),
        animateElement(elements.originMarker, [
          { opacity: 0.92 * opacity, transform: "scale(0.82)", offset: 0 },
          { opacity: opacity, transform: "scale(1)", offset: originEnd },
          { opacity: 0, transform: "scale(0.72)", offset: originFadeEnd },
          { opacity: 0, transform: "scale(0.72)", offset: 1 },
        ], profile.totalMs),
        animateElement(elements.arrivalMarker, [
          { opacity: 0, transform: "scale(0.72)", offset: 0 },
          { opacity: 0, transform: "scale(0.72)", offset: travelEnd },
          { opacity: opacity, transform: "scale(1.08)", offset: arrivalEnd },
          { opacity: 0, transform: "scale(1.36)", offset: 1 },
        ], profile.totalMs),
      ].filter(Boolean);
      return animations;
    }

    function syncSettleHighlight(group, feedback, pathData, points, callbacks) {
      if (!feedback || feedback.profile?.reducedMotion || feedback.profile?.totalMs <= 0) {
        clearSettleHighlight(group);
        return;
      }
      const origin = feedback.direction === "reverse" ? points.target : points.source;
      const arrival = feedback.direction === "reverse" ? points.source : points.target;
      const token = String(feedback.token);
      if (group.dataset.feedbackToken === token) {
        syncSettleGeometry(group, pathData, origin, arrival);
        return;
      }
      clearSettleHighlight(group);
      if (callbacks.onStart?.(feedback.id, feedback.token) === false) return;
      group.dataset.feedbackToken = token;
      group.classList.add("is-settling");
      const elements = createSettleElements(group, pathData, origin, arrival, feedback.profile);
      const animations = startSettleAnimations(elements, feedback.profile);
      if (animations.length) {
        Promise.all(animations.map((animation) => animation.finished))
          .then(() => callbacks.onComplete?.(feedback.id, feedback.token))
          .catch(() => {});
      } else {
        clearSettleHighlight(group);
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
        const feedbackPathData = feedback?.direction === "reverse"
          ? input.getPath(points.source, points.target, { reverse: true })
          : pathData;
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
        syncSettleHighlight(group, feedback, feedbackPathData, points, {
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
