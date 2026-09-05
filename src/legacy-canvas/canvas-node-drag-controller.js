(function registerCanvasNodeDragController(root) {
  "use strict";

  function createCanvasNodeDragController(options) {
    const interaction = options.interaction;
    const finishedActions = new WeakSet();

    function move(action, pointer) {
      const drag = interaction.getDraggedPositions(action, pointer, options.getScale());
      action.moved = drag.moved;
      drag.positions.forEach(options.applyNodePosition);
      options.renderMovement();
      return drag;
    }

    function promote(action, pointer) {
      const sourceNodes = action.ids.map(options.getNode).filter(Boolean);
      if (!sourceNodes.length) {
        options.setAction(null);
        return null;
      }

      let draggedNodes = sourceNodes;
      let origins = action.origins;
      const activeIndex = Math.max(0, sourceNodes.findIndex((node) => node.id === action.activeId));
      let activeId = action.activeId;

      if (action.altKey) {
        draggedNodes = sourceNodes.map(options.cloneNode);
        options.addNodes(draggedNodes);
        origins = draggedNodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
        activeId = draggedNodes[activeIndex]?.id || draggedNodes[0]?.id || null;
        options.selectNodes(
          draggedNodes.map((node) => node.id),
          activeId,
        );
        options.render();
      }

      options.promoteNodes(draggedNodes);
      const dragAction = {
        type: "drag-nodes",
        pointerId: action.pointerId,
        ids: draggedNodes.map((node) => node.id),
        activeId,
        sourceIds: sourceNodes.map((node) => node.id),
        sourceActiveId: sourceNodes[activeIndex]?.id || null,
        startClientX: action.startClientX,
        startClientY: action.startClientY,
        origins,
        groups: action.groups,
        isDuplicate: action.altKey,
        interactionSource: action.interactionSource,
        revealMediaToolbar: action.revealMediaToolbar,
        revealGeneratorPanel: action.revealGeneratorPanel,
      };
      options.setAction(dragAction);
      options.setDragging(true);
      move(dragAction, pointer);
      return dragAction;
    }

    function finish(action, finishOptions = {}) {
      if (finishedActions.has(action)) return;
      finishedActions.add(action);
      if (finishOptions.cancelled) {
        if (action.isDuplicate) options.removeDuplicatedNodes(action.ids.slice(), action);
        else (action.origins || []).forEach(options.applyNodePosition);
        if (finishOptions.render !== false) options.render();
        return;
      }
      options.updateGroupMembership(action.ids);
      if (action.isDuplicate) {
        options.pushUndoAction({ type: "create", nodeIds: action.ids.slice() });
      } else if (action.moved) {
        options.pushUndoAction({
          type: "move",
          positions: action.origins,
          groups: action.groups,
        });
      }
      if (finishOptions.render !== false) options.render();
    }

    return Object.freeze({ move, promote, finish });
  }

  root.REELAY_CANVAS_NODE_DRAG_CONTROLLER = Object.freeze({
    createCanvasNodeDragController,
  });
}(typeof globalThis === "object" ? globalThis : window));
