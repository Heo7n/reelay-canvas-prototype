(function registerCanvasLayerReconciler(root) {
  "use strict";

  function createCollectionReconciler(options) {
    const layer = options?.layer;
    const selector = options?.selector;
    const datasetKey = options?.datasetKey;
    const getId = options?.getId;
    const getSignature = options?.getSignature;
    const createElement = options?.createElement;
    const syncElement = options?.syncElement;
    const prepareItem = options?.prepareItem;

    if (!layer || !selector || !datasetKey) return null;
    if (![getId, getSignature, createElement, syncElement].every((value) => typeof value === "function")) {
      return null;
    }

    function reconcile(items = []) {
      const existingElements = new Map(
        Array.from(layer.querySelectorAll(selector), (element) => [
          element.dataset[datasetKey],
          element,
        ]),
      );
      const liveIds = new Set(items.map((item) => String(getId(item))));

      existingElements.forEach((element, id) => {
        if (liveIds.has(id)) return;
        element.remove();
        existingElements.delete(id);
      });

      items.forEach((item) => {
        prepareItem?.(item);
        const id = String(getId(item));
        const signature = getSignature(item);
        let element = existingElements.get(id);

        if (!element || element.dataset.renderSignature !== signature) {
          const nextElement = createElement(item);
          if (!nextElement) return;
          nextElement.dataset[datasetKey] = id;
          nextElement.dataset.renderSignature = signature;
          if (element) {
            element.replaceWith(nextElement);
          } else {
            layer.appendChild(nextElement);
          }
          existingElements.set(id, nextElement);
          return;
        }

        syncElement(element, item);
      });
    }

    return Object.freeze({ reconcile });
  }

  function createLayerReconciler(options) {
    const groups = createCollectionReconciler({
      layer: options?.layer,
      selector: ".group-frame",
      datasetKey: "groupId",
      ...options?.groups,
    });
    const nodes = createCollectionReconciler({
      layer: options?.layer,
      selector: ".canvas-node",
      datasetKey: "id",
      ...options?.nodes,
    });
    if (!groups || !nodes) return null;

    function reconcile(input) {
      groups.reconcile(input?.groups || []);
      nodes.reconcile(input?.nodes || []);
    }

    return Object.freeze({ reconcile });
  }

  root.REELAY_CANVAS_LAYER_RECONCILER = Object.freeze({
    createCollectionReconciler,
    createLayerReconciler,
  });
}(typeof globalThis === "object" ? globalThis : window));
