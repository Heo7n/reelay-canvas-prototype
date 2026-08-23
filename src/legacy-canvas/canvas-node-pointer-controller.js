(function registerCanvasNodePointerController(root) {
  "use strict";

  const controlSelector = [
    "button",
    "textarea",
    "input",
    "[contenteditable='true']",
    ".panel-popover",
    ".material-panel",
    ".asset-card",
    "audio",
    ".media-title",
    ".media-spec",
    ".node-port",
  ].join(", ");

  function createCanvasNodePointerController(options) {
    const interaction = options.interaction;

    function handlePointerDown(event, nodeId) {
      if (event.button === 1 || (event.button === 0 && options.isSpaceDown())) {
        event.preventDefault();
        event.stopPropagation();
        options.beginPan(event);
        return "pan";
      }

      if (event.button !== 0) return "ignored";
      event.stopPropagation();

      const target = event.target;
      const node = options.getNode(nodeId);
      if (!node) return "missing-node";

      if (target?.closest?.(controlSelector)) {
        options.handleControlPointer({ event, target, node });
        return "control";
      }

      const nextSelection = interaction.resolvePointerSelection({
        selectedIds: options.getSelectedIds(),
        nodeId,
        shiftKey: event.shiftKey,
      });

      options.applySelection(nextSelection, node);
      if (!nextSelection.includes(nodeId)) {
        options.setMediaToolbarNodeId(null);
        options.render();
        return "deselected";
      }
      const overMediaFrame = Boolean(target?.closest?.(".media-frame"));
      const selectedNodes = options.getSelectedNodes();
      const isSingleSelection = selectedNodes.length === 1 && selectedNodes[0]?.id === node.id;
      const revealMediaToolbar = overMediaFrame && isSingleSelection && options.isEditableMedia(node);
      const revealGeneratorPanel = overMediaFrame
        && isSingleSelection
        && node.kind === "generator"
        && !node.generating;

      if (!options.canMutate()) {
        options.setMediaToolbarNodeId(revealMediaToolbar ? node.id : null);
        options.render();
        return "selected";
      }
      const activeNode = selectedNodes.find((item) => item.id === nodeId);
      const nodesToPromote = selectedNodes.filter((item) => item.id !== nodeId);
      if (activeNode) nodesToPromote.push(activeNode);
      options.promoteNodes(nodesToPromote);

      options.setAction({
        type: "drag-candidate",
        pointerId: event.pointerId,
        ids: selectedNodes.map((item) => item.id),
        activeId: nodeId,
        altKey: event.altKey,
        startClientX: event.clientX,
        startClientY: event.clientY,
        origins: selectedNodes.map((item) => ({ id: item.id, x: item.x, y: item.y })),
        groups: options.getGroupSnapshots(),
        revealMediaToolbar,
        revealGeneratorPanel,
      });
      options.capturePointer(event.pointerId);
      options.render();
      return "drag-candidate";
    }

    return Object.freeze({ handlePointerDown });
  }

  root.REELAY_CANVAS_NODE_POINTER_CONTROLLER = Object.freeze({
    controlSelector,
    createCanvasNodePointerController,
  });
}(typeof globalThis === "object" ? globalThis : window));
