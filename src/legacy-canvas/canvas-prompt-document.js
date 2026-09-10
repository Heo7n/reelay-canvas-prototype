(function registerCanvasPromptDocument(root) {
  "use strict";

  const limits = Object.freeze({ length: 20_000, parts: 2048, references: 512, keyId: 200, label: 80 });
  const TYPE_LABELS = Object.freeze({ image: "图片", video: "视频", audio: "音频" });
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const mediaType = (value) => typeof value === "string" && hasOwn(TYPE_LABELS, value) ? value : null;

  function keyParts(key) {
    if (typeof key !== "string") return null;
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    return (kind === "asset" || kind === "connection") && id && id === id.trim()
      && id.length <= limits.keyId && !/[\u0000-\u001f\u007f]/.test(id) ? { kind, id } : null;
  }

  function cutText(value, length) {
    let result = value.slice(0, Math.max(0, length));
    // Avoid leaving an unmatched high surrogate at the truncation boundary.
    if (result.length < value.length && /[\ud800-\udbff]$/.test(result)) result = result.slice(0, -1);
    return result;
  }

  function fallbackLabel(value, type) {
    const label = typeof value === "string" ? value.replace(/[\r\n\u0000-\u001f\u007f]/g, "").trim() : "";
    return cutText(label, limits.label) || TYPE_LABELS[type];
  }

  function normalize(value) {
    const source = typeof value === "string" ? [{ type: "text", text: value }]
      : isObject(value) && value.version === 1 && Array.isArray(value.content) ? value.content : [];
    const content = [];
    let length = 0;
    let references = 0;
    for (const part of source.slice(0, limits.parts)) {
      if (length >= limits.length) break;
      if (!isObject(part)) continue;
      if (part.type === "text" && typeof part.text === "string") {
        const text = cutText(part.text.replace(/\r\n?/g, "\n"), limits.length - length);
        if (!text) continue;
        const previous = content[content.length - 1];
        if (previous?.type === "text") previous.text += text;
        else content.push({ type: "text", text });
        length += text.length;
      } else if (part.type === "reference" && keyParts(part.key) && mediaType(part.mediaType)
        && references < limits.references) {
        content.push({ type: "reference", key: part.key, mediaType: part.mediaType,
          fallbackLabel: fallbackLabel(part.fallbackLabel, part.mediaType) });
        references++;
        length++;
      }
    }
    return { version: 1, content };
  }

  function sameKeys(value, names) {
    const keys = Object.keys(value);
    return keys.length === names.length && names.every((key) => hasOwn(value, key));
  }

  // Commands validate rather than silently sanitizing a malformed transaction.
  function isDocument(value) {
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.content)
      || !sameKeys(value, ["version", "content"]) || value.content.length > limits.parts) return false;
    const canonical = normalize(value);
    if (canonical.content.length !== value.content.length) return false;
    return value.content.every((part, index) => {
      if (!isObject(part)) return false;
      const names = part.type === "text" ? ["type", "text"] : ["type", "key", "mediaType", "fallbackLabel"];
      const expected = canonical.content[index];
      return sameKeys(part, names) && names.every((name) => part[name] === expected[name]);
    });
  }

  function hasReferences(value) {
    return normalize(value).content.some((part) => part.type === "reference");
  }

  function referenceIndex(entries) {
    const counts = { image: 0, video: 0, audio: 0 };
    const seen = new Set();
    const index = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const type = mediaType(entry?.asset?.type);
      if (!keyParts(entry?.key) || !type || seen.has(entry.key)) continue;
      seen.add(entry.key);
      const ordinal = ++counts[type];
      const label = `${TYPE_LABELS[type]}${ordinal}`;
      const name = [entry.name, entry.label, entry.asset.displayName, entry.asset.name, label]
        .find((value) => typeof value === "string" && value.trim());
      index.push({ key: entry.key, asset: entry.asset, mediaType: type, ordinal, label,
        name: cutText(name.trim(), 300),
        ...(typeof entry.sourceNodeId === "string" ? { sourceNodeId: entry.sourceNodeId } : {}),
        ...(typeof entry.connectionId === "string" ? { connectionId: entry.connectionId } : {}) });
    }
    return index;
  }

  function labelFor(part, byKey) {
    const entry = byKey.get(part.key);
    return entry?.mediaType === part.mediaType ? entry.label : part.fallbackLabel;
  }

  function toText(value, entries) {
    const byKey = new Map(referenceIndex(entries).map((entry) => [entry.key, entry]));
    return normalize(value).content.map((part) => part.type === "text" ? part.text : labelFor(part, byKey)).join("");
  }

  function cloneSnapshot(value, seen = new WeakSet(), depth = 0) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "object" || seen.has(value) || depth > 16) return undefined;
    seen.add(value);
    const result = Array.isArray(value) ? [] : {};
    if (Array.isArray(value)) {
      for (const item of value) result.push(cloneSnapshot(item, seen, depth + 1) ?? null);
    } else {
      for (const key of Object.keys(value)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        const cloned = cloneSnapshot(value[key], seen, depth + 1);
        if (cloned !== undefined) result[key] = cloned;
      }
    }
    seen.delete(value);
    return result;
  }

  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function resolve(value, entries) {
    const document = normalize(value);
    const media = referenceIndex(entries).map((entry) => cloneSnapshot(entry));
    const byKey = new Map(media.map((entry, index) => [entry.key, { ...entry, mediaIndex: index }]));
    const references = [];
    const missing = [];
    const mismatched = [];
    const seenReferences = new Map();
    const seenProblems = new Set();
    for (const [contentIndex, part] of document.content.entries()) {
      if (part.type !== "reference") continue;
      const entry = byKey.get(part.key);
      const problemKey = `${part.key}\u0000${part.mediaType}`;
      if (!seenProblems.has(problemKey)) {
        if (!entry) missing.push({ ...part, reason: "removed" });
        else if (entry.mediaType !== part.mediaType) mismatched.push({ ...part, reason: "type-mismatch", actualType: entry.mediaType });
        else if (typeof entry.asset.url !== "string" || !entry.asset.url.trim()) missing.push({ ...part, reason: "unavailable" });
        seenProblems.add(problemKey);
      }
      let reference = seenReferences.get(part.key);
      if (!reference) {
        reference = { key: part.key, mediaType: part.mediaType, label: labelFor(part, byKey),
          ordinal: entry?.mediaType === part.mediaType ? entry.ordinal : null,
          mediaIndex: entry?.mediaType === part.mediaType ? entry.mediaIndex : null, occurrences: [] };
        seenReferences.set(part.key, reference);
        references.push(reference);
      }
      reference.occurrences.push(contentIndex);
    }
    const text = document.content.map((part) => part.type === "text" ? part.text : labelFor(part, byKey)).join("");
    return deepFreeze({ document, text, references, media, missing, mismatched,
      valid: missing.length === 0 && mismatched.length === 0 });
  }

  function remap(value, { assetIds, connectionIds } = {}) {
    const document = normalize(value);
    for (const part of document.content) {
      if (part.type !== "reference") continue;
      const parts = keyParts(part.key);
      const mapping = parts.kind === "asset" ? assetIds : connectionIds;
      const id = typeof mapping?.get === "function" ? mapping.get(parts.id) : undefined;
      const mappedKey = typeof id === "string" ? `${parts.kind}:${id}` : "";
      // Missing mappings remain explicit broken bindings; names and ordinals
      // must never guess a new target in a copied node's reference scope.
      if (keyParts(mappedKey)) part.key = mappedKey;
    }
    return document;
  }

  function optimize(value, transformText) {
    const document = normalize(value);
    if (typeof transformText !== "function") return document;
    const referenceCount = document.content.filter((part) => part.type === "reference").length;
    let remainingText = limits.length - referenceCount;
    const content = document.content.map((part, index) => {
      if (part.type === "reference") return part;
      const transformed = transformText(part.text, index);
      const text = cutText(typeof transformed === "string" ? transformed.replace(/\r\n?/g, "\n") : part.text, remainingText);
      remainingText -= text.length;
      return { type: "text", text };
    });
    return normalize({ version: 1, content });
  }

  root.REELAY_CANVAS_PROMPT_DOCUMENT = Object.freeze({ limits, normalize, isDocument, hasReferences,
    referenceIndex, toText, resolve, remap, optimize });
}(typeof globalThis === "object" ? globalThis : window));
