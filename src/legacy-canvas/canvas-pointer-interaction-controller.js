(function registerCanvasPointerInteractionController(root) {
  "use strict";

  function createCanvasPointerInteractionController(options) {
    const interaction = options.interaction;

    function schedule(action, pointer, move) {
      action.pendingPointerPosition = {
        clientX: pointer.clientX,
        clientY: pointer.clientY,
      };
      if (action.pointerFrameId) return;

      action.pointerFrameId = options.requestFrame(() => {
        action.pointerFrameId = 0;
        const pending = action.pendingPointerPosition;
        action.pendingPointerPosition = null;
        if (options.getAction() !== action || !pending) return;
        move(action, pending);
      });
    }

    function flush(action, pointer, move) {
      if (action.pointerFrameId) {
        options.cancelFrame(action.pointerFrameId);
        action.pointerFrameId = 0;
      }
      action.pendingPointerPosition = null;
      move(action, pointer);
    }

    function beginPan(pointer, captureTarget) {
      const viewport = options.getViewport();
      const action = {
        type: "pan",
        pointerId: pointer.pointerId,
        startClientX: pointer.clientX,
        startClientY: pointer.clientY,
        tx: viewport.tx,
        ty: viewport.ty,
        captureTarget,
      };
      options.setAction(action);
      options.setDragging(true);
      options.capturePointer(captureTarget, pointer);
      return action;
    }

    function movePan(action, pointer) {
      const viewport = {
        tx: action.tx + pointer.clientX - action.startClientX,
        ty: action.ty + pointer.clientY - action.startClientY,
      };
      options.applyViewport(viewport);
      return viewport;
    }

    function beginMarquee(pointer, captureTarget) {
      const rect = options.getShellRect();
      const action = {
        type: "marquee",
        pointerId: pointer.pointerId,
        startClientX: pointer.clientX,
        startClientY: pointer.clientY,
        localStartX: pointer.clientX - rect.left,
        localStartY: pointer.clientY - rect.top,
        additive: pointer.shiftKey,
        baseSelection: new Set(options.getSelection()),
        moved: false,
        captureTarget,
      };
      options.setAction(action);
      options.capturePointer(captureTarget, pointer);
      return action;
    }

    function moveMarquee(action, pointer) {
      if (!interaction.hasCrossedDragThreshold(action, pointer)) return null;
      action.moved = true;
      const selectionRect = interaction.getLocalMarqueeRect(action, pointer, options.getShellRect());
      options.showMarquee(selectionRect);

      const start = options.screenToWorld(action.startClientX, action.startClientY);
      const end = options.screenToWorld(pointer.clientX, pointer.clientY);
      const marquee = interaction.getWorldMarqueeRect(start, end);
      const selectedIds = interaction.resolveMarqueeSelection({
        nodes: options.getNodes(),
        marquee,
        getBounds: options.getNodeBounds,
        additive: action.additive,
        baseSelection: action.baseSelection,
      });
      options.setSelection(selectedIds);
      options.collapseGeneratorPanels();
      options.render();
      return { selectionRect, selectedIds };
    }

    function finishMarquee(action) {
      options.hideMarquee();
      if (!action.moved) {
        options.clearSelection();
        options.collapseGeneratorPanels();
      }
      options.render();
    }

    return Object.freeze({
      schedule,
      flush,
      beginPan,
      movePan,
      beginMarquee,
      moveMarquee,
      finishMarquee,
    });
  }

  root.REELAY_CANVAS_POINTER_INTERACTION_CONTROLLER = Object.freeze({
    createCanvasPointerInteractionController,
  });
}(typeof globalThis === "object" ? globalThis : window));
