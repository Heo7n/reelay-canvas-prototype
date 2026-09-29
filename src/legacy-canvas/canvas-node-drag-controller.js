(function registerCanvasNodeDragController(root) {
  "use strict";

  function createCanvasNodeDragController(options) {
    const interaction = options.interaction;
    const preview = options.preview;
    if (!preview?.promoteNodes || !preview?.commit) throw new TypeError("Node dragging requires a geometry preview owner.");
    const finishedActions = new WeakSet();

    function move(action, pointer) {
      if (!preview.isCurrent(action)) return null;
      const drag = interaction.getDraggedPositions(action, pointer, options.getScale());
      action.moved = drag.moved;
      if (!preview.setNodePositions(action, drag.positions)) return null;
      options.renderMovement();
      return drag;
    }

    function promote(action, pointer) {
      const promoted = preview.promoteNodes(action);
      if (!promoted) {
        options.setAction(null);
        return null;
      }
      const { nodes: draggedNodes, origins, activeId, sourceIds, sourceActiveId, isDuplicate } = promoted;
      const dragAction = {
        type: "drag-nodes",
        gesture: action.gesture,
        pointerId: action.pointerId,
        ids: draggedNodes.map((node) => node.id),
        activeId,
        sourceIds,
        sourceActiveId,
        startClientX: action.startClientX,
        startClientY: action.startClientY,
        origins,
        groups: action.groups,
        isDuplicate,
        interactionSource: action.interactionSource,
        revealMediaToolbar: action.revealMediaToolbar,
        revealGeneratorPanel: action.revealGeneratorPanel,
      };
      options.setAction(dragAction);
      options.setDragging(true);
      if (isDuplicate) { options.selectNodes(dragAction.ids, activeId); options.render(); }
      move(dragAction, pointer);
      return dragAction;
    }

    function finish(action, finishOptions = {}) {
      if (finishedActions.has(action)) return;
      finishedActions.add(action);
      if (finishOptions.cancelled) {
        const current = preview.isCurrent(action);
        preview.cancel(action);
        if (current && action.isDuplicate) options.restoreSelection?.(action);
        if (finishOptions.render !== false) options.render();
        return { ok: current, changed: false };
      }
      const result = preview.commit(action);
      if (!result.ok) { if (finishOptions.render !== false) options.render(); return result; }
      options.onGeometryCommit?.(action);
      if (action.isDuplicate) {
        options.pushUndoAction({ type: "create", nodeIds: action.ids.slice() });
      } else if (action.moved) {
        options.pushUndoAction({
          type: "move",
          positions: action.origins,
          groups: action.groups,
        });
      }
      if (result.changed) options.onCommit?.();
      if (finishOptions.render !== false) options.render();
      return result;
    }

    return Object.freeze({ move, promote, finish });
  }

  root.REELAY_CANVAS_NODE_DRAG_CONTROLLER = Object.freeze({
    createCanvasNodeDragController,
  });
}(typeof globalThis === "object" ? globalThis : window));
