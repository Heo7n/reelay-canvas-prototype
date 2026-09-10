(function registerCanvasReferenceOrder(root) {
  "use strict";

  function keyParts(key) {
    if (typeof key !== "string") return null;
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    return (kind === "asset" || kind === "connection") && id && id === id.trim() && id.length <= 200
      ? { kind, id }
      : null;
  }

  // Entries are runtime projections. Keep their object identities and never
  // rewrite node assets or connections while deriving the visible order.
  function orderEntries(entries, order) {
    const byKey = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (keyParts(entry?.key) && !byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
    const result = [];
    for (const key of Array.isArray(order) ? order : []) {
      if (!byKey.has(key)) continue;
      result.push(byKey.get(key));
      byKey.delete(key);
    }
    return result.concat([...byKey.values()]);
  }

  function move(keys, sourceKey, targetKey, placement = "before") {
    if (!Array.isArray(keys) || (placement !== "before" && placement !== "after")
      || keys.some((key) => !keyParts(key)) || new Set(keys).size !== keys.length
      || sourceKey === targetKey || !keys.includes(sourceKey) || !keys.includes(targetKey)) return keys;
    const result = keys.filter((key) => key !== sourceKey);
    const targetIndex = result.indexOf(targetKey) + (placement === "after" ? 1 : 0);
    result.splice(targetIndex, 0, sourceKey);
    return result.every((key, index) => key === keys[index]) ? keys : result;
  }

  // Clone operations provide old-to-new ID Maps. Uncopied references are
  // omitted, so a copied node cannot retain keys belonging to its source.
  function remap(order, { assetIds, connectionIds } = {}) {
    if (!Array.isArray(order)) return undefined;
    const result = [];
    const seen = new Set();
    for (const key of order) {
      const parts = keyParts(key);
      if (!parts) continue;
      const mapping = parts.kind === "asset" ? assetIds : connectionIds;
      const mappedId = typeof mapping?.get === "function" ? mapping.get(parts.id) : undefined;
      if (typeof mappedId !== "string") continue;
      const mappedKey = `${parts.kind}:${mappedId}`;
      if (!keyParts(mappedKey) || seen.has(mappedKey)) continue;
      seen.add(mappedKey);
      result.push(mappedKey);
    }
    return result;
  }

  root.REELAY_CANVAS_REFERENCE_ORDER = Object.freeze({ orderEntries, move, remap });
}(typeof globalThis === "object" ? globalThis : window));
