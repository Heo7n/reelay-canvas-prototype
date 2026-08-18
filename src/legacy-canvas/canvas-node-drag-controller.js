(function registerCanvasNodeDragController(root) {
  "use strict";

  function createCanvasNodeDragController(options) {
    const interaction = options.interaction;

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

      if (action.altKey) {
        draggedNodes = sourceNodes.map(options.cloneNode);
        options.addNodes(draggedNodes);
        origins = draggedNodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
        options.selectNodes(
          draggedNodes.map((node) => node.id),
          draggedNodes.find((node) => node.kind === "generator")?.id || draggedNodes[0].id,
        );
        options.render();
      }

      options.promoteNodes(draggedNodes);
      const dragAction = {
        type: "drag-nodes",
        pointerId: action.pointerId,
        ids: draggedNodes.map((node) => node.id),
        startClientX: action.startClientX,
        startClientY: action.startClientY,
        origins,
        groups: action.groups,
        isDuplicate: action.altKey,
      };
      options.setAction(dragAction);
      options.setDragging(true);
      move(dragAction, pointer);
      return dragAction;
    }

    function finish(action) {
      options.updateGroupMembership(action.ids);
      if (action.moved && !action.isDuplicate) {
        options.pushUndoAction({
          type: "move",
          positions: action.origins,
          groups: action.groups,
        });
      }
      options.render();
    }

    return Object.freeze({ move, promote, finish });
  }

  root.REELAY_CANVAS_NODE_DRAG_CONTROLLER = Object.freeze({
    createCanvasNodeDragController,
  });
}(typeof globalThis === "object" ? globalThis : window));
