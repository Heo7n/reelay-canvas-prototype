(function registerCanvasPointerDispatchController(root) {
  "use strict";

  function createCanvasPointerDispatchController(options) {
    function handleMove(pointer) {
      const action = options.getAction();
      if (!action) return false;
      if (Number.isFinite(action.pointerId) && pointer?.pointerId !== action.pointerId) return false;

      if (action.type === "connect") {
        options.schedule(action, pointer, options.moveConnection);
        return true;
      }
      if (action.type === "drag-candidate") {
        if (options.hasCrossedDragThreshold(action, pointer)) options.promoteNodeDrag(action, pointer);
        return true;
      }
      if (action.type === "group-drag-candidate") {
        if (options.hasCrossedDragThreshold(action, pointer)) options.promoteGroupDrag(action, pointer);
        return true;
      }

      const scheduledMove = {
        "drag-group": options.moveGroup,
        "resize-group": options.resizeGroup,
        "drag-nodes": options.moveNodes,
        marquee: options.moveMarquee,
        pan: options.movePan,
      }[action.type];
      if (scheduledMove) {
        options.schedule(action, pointer, scheduledMove);
        return true;
      }

      if (action.type === "minimap-drag") {
        options.moveMinimap(pointer);
        return true;
      }
      if (action.type === "resize-asset-library") {
        options.resizeAssetLibrary(action.startWidth + pointer.clientX - action.startClientX);
        return true;
      }
      if (action.type === "resize-agent") {
        options.resizeAgent(action.startWidth + action.startClientX - pointer.clientX);
        return true;
      }
      if (action.type === "resize-agent-top") {
        options.resizeAgentTop(action.startInset + pointer.clientY - action.startClientY);
        return true;
      }
      if (action.type === "resize-agent-bottom") {
        options.resizeAgentBottom(action.startInset + action.startClientY - pointer.clientY);
        return true;
      }
      return false;
    }

    function finish(pointer) {
      const action = options.getAction();
      if (!action) return false;
      if (Number.isFinite(action.pointerId) && pointer?.pointerId !== action.pointerId) return false;
      const cancelled = pointer?.type === "pointercancel";

      if (action.type === "connect") {
        if (!cancelled) options.flush(action, pointer, options.moveConnection);
        options.finishConnection(pointer, { cancelled });
        return true;
      }

      if (action.type === "drag-candidate") {
        if (!cancelled && options.hasCrossedDragThreshold(action, pointer)) {
          const promotedAction = options.promoteNodeDrag(action, pointer);
          if (promotedAction?.type === "drag-nodes") {
            options.finishNodeDrag(promotedAction, { render: false });
            options.finishNodeClick(promotedAction, pointer, { cancelled: false });
          }
        } else {
          options.finishNodeClick(action, pointer, { cancelled });
        }
      }

      if (action.type === "group-drag-candidate") {
        if (!cancelled && options.hasCrossedDragThreshold(action, pointer)) {
          const promotedAction = options.promoteGroupDrag(action, pointer);
          if (promotedAction?.type === "drag-group") {
            options.finishGroup(promotedAction, { cancelled: false });
          }
        } else if (cancelled) {
          options.finishGroup(action, { cancelled: true });
        }
      }

      const finalMove = {
        "drag-nodes": options.moveNodes,
        "drag-group": options.moveGroup,
        "resize-group": options.resizeGroup,
        marquee: options.moveMarquee,
        pan: options.movePan,
      }[action.type];
      if (finalMove && !cancelled) options.flush(action, pointer, finalMove);

      if (action.type === "marquee") options.finishMarquee(action);
      else if (action.type === "drag-nodes") {
        options.finishNodeDrag(action, { cancelled, render: cancelled });
        options.finishNodeClick(action, pointer, { cancelled });
      }
      else if (action.type === "drag-group" || action.type === "resize-group") {
        options.finishGroup(action, { cancelled });
      }
      else if (action.type === "resize-asset-library") options.finishAssetLibraryResize();

      options.clearAction();
      options.setDragging(false);
      options.releasePointer(action.captureTarget, pointer);
      return true;
    }

    function handleSurfacePointerDown(pointer) {
      if (!options.isCanvasSurface(pointer.target)) return false;
      options.closeConnectionCreateMenu();

      if (pointer.button === 1 || options.isSpaceDown()) {
        pointer.preventDefault();
        options.beginPan(pointer);
        return true;
      }
      if (pointer.button !== 0) return false;

      if (options.isSelectionFrameDragTarget(pointer)) {
        pointer.preventDefault();
        if (options.beginSelectionFrameDrag(pointer)) return true;
      }

      const activeNode = options.getActiveNode();
      if (activeNode?.kind === "generator" && activeNode.panel) {
        options.closeNodePanel(activeNode);
        options.render();
        return true;
      }
      options.beginMarquee(pointer);
      return true;
    }

    return Object.freeze({
      handleMove,
      finish,
      handleSurfacePointerDown,
    });
  }

  root.REELAY_CANVAS_POINTER_DISPATCH_CONTROLLER = Object.freeze({
    createCanvasPointerDispatchController,
  });
}(typeof globalThis === "object" ? globalThis : window));
