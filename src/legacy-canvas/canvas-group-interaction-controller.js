(function registerCanvasGroupInteractionController(root) {
  "use strict";

  function createCanvasGroupInteractionController(options) {
    function snapshotNodes(group) {
      return options.getGroupNodes(group).map((node) => ({ id: node.id, x: node.x, y: node.y }));
    }

    function beginDrag(group, pointer, captureTarget) {
      const bounds = options.getGroupBounds(group);
      const originFrame = bounds
        ? { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
        : {
          x: group.x || 0,
          y: group.y || 0,
          width: group.width || options.minWidth,
          height: group.height || options.minHeight,
        };
      const action = {
        type: "group-drag-candidate",
        pointerId: pointer.pointerId,
        groupId: group.id,
        startClientX: pointer.clientX,
        startClientY: pointer.clientY,
        originFrame,
        origins: snapshotNodes(group),
        groups: options.getGroupSnapshots(),
        startScale: options.getScale(),
        captureTarget,
      };
      options.setActiveGroup(group.id);
      options.setAction(action);
      options.capturePointer(captureTarget, pointer.pointerId);
      options.render();
      return action;
    }

    function beginResize(group, pointer, handle, captureTarget) {
      const bounds = options.getGroupBounds(group);
      if (!bounds) return null;
      const action = {
        type: "resize-group",
        pointerId: pointer.pointerId,
        groupId: group.id,
        handle,
        startClientX: pointer.clientX,
        startClientY: pointer.clientY,
        origin: {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        },
        origins: snapshotNodes(group),
        groups: options.getGroupSnapshots(),
        startScale: options.getScale(),
        captureTarget,
      };
      options.setActiveGroup(group.id);
      options.setAction(action);
      options.capturePointer(captureTarget, pointer.pointerId);
      options.render();
      return action;
    }

    function promoteDrag(action, pointer) {
      if (!options.getGroup(action.groupId)) {
        options.setAction(null);
        return null;
      }
      const dragAction = {
        type: "drag-group",
        pointerId: action.pointerId,
        groupId: action.groupId,
        startClientX: action.startClientX,
        startClientY: action.startClientY,
        originFrame: action.originFrame,
        origins: action.origins,
        groups: action.groups,
        startScale: action.startScale,
        captureTarget: action.captureTarget,
      };
      options.setAction(dragAction);
      options.setDragging(true);
      move(dragAction, pointer);
      return dragAction;
    }

    function move(action, pointer) {
      const scale = Math.max(0.0001, action.startScale || options.getScale());
      const dx = (pointer.clientX - action.startClientX) / scale;
      const dy = (pointer.clientY - action.startClientY) / scale;
      action.moved = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      if (action.originFrame) {
        options.applyGroupFrame(action.groupId, {
          x: action.originFrame.x + dx,
          y: action.originFrame.y + dy,
        });
      }
      action.origins.forEach((origin) => {
        options.applyNodePosition(origin.id, {
          x: origin.x + dx,
          y: origin.y + dy,
        });
      });
      options.render();
      return { dx, dy };
    }

    function resize(action, pointer) {
      if (!options.getGroup(action.groupId)) return null;
      const scale = Math.max(0.0001, action.startScale || options.getScale());
      const dx = (pointer.clientX - action.startClientX) / scale;
      const dy = (pointer.clientY - action.startClientY) / scale;
      action.moved = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      const handle = action.handle || "";
      let x = action.origin.x;
      let y = action.origin.y;
      let width = action.origin.width;
      let height = action.origin.height;

      if (handle.includes("e")) width += dx;
      if (handle.includes("s")) height += dy;
      if (handle.includes("w")) {
        x += dx;
        width -= dx;
      }
      if (handle.includes("n")) {
        y += dy;
        height -= dy;
      }

      if (width < options.minWidth) {
        if (handle.includes("w")) x = action.origin.x + action.origin.width - options.minWidth;
        width = options.minWidth;
      }
      if (height < options.minHeight) {
        if (handle.includes("n")) y = action.origin.y + action.origin.height - options.minHeight;
        height = options.minHeight;
      }

      const frame = { x, y, width, height };
      options.applyGroupFrame(action.groupId, frame);
      options.render();
      return frame;
    }

    function restore(action) {
      const originFrame = action.originFrame || action.origin;
      if (originFrame) options.applyGroupFrame(action.groupId, originFrame);
      (action.origins || []).forEach((origin) => options.applyNodePosition(origin.id, origin));
    }

    function finish(action, finishOptions = {}) {
      if (finishOptions.cancelled) {
        restore(action);
        options.render();
        return;
      }
      if (action.moved) {
        options.pushUndoAction({
          type: "move",
          positions: action.origins || [],
          groups: action.groups,
        });
      }
      options.render();
    }

    return Object.freeze({ beginDrag, beginResize, promoteDrag, move, resize, finish });
  }

  root.REELAY_CANVAS_GROUP_INTERACTION_CONTROLLER = Object.freeze({
    createCanvasGroupInteractionController,
  });
}(typeof globalThis === "object" ? globalThis : window));
