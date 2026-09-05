(function registerCanvasCommandExecutor(root) {
  "use strict";

  const COLLECTIONS = Object.freeze(["nodes", "groups", "connections"]);
  const COLLECTION_SET = new Set(COLLECTIONS);
  const UNDO_KIND = "canvas-command";
  const DEFAULT_UNDO_LIMIT = 50;

  function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlain(value, seen = new Map()) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) throw new TypeError("Canvas command records must not contain cycles.");
    const output = Array.isArray(value) ? [] : {};
    seen.set(value, output);
    for (const key of Object.keys(value)) output[key] = clonePlain(value[key], seen);
    seen.delete(value);
    return output;
  }

  function equalPlain(left, right) {
    if (Object.is(left, right)) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
      return false;
    }
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) return false;
      if (!equalPlain(left[leftKeys[index]], right[rightKeys[index]])) return false;
    }
    return true;
  }

  function identityNormalize(_collection, records) {
    return records;
  }

  function failure(code, message) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code, message }),
    });
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeIndex(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function validateSnapshot(snapshot, label, changeId) {
    if (!snapshot || typeof snapshot !== "object" || !("record" in snapshot)) {
      return `${label} for ${changeId} must contain a record field.`;
    }
    if (snapshot.record !== null && !isRecord(snapshot.record)) {
      return `${label}.record for ${changeId} must be a plain record or null.`;
    }
    if (snapshot.index !== undefined && normalizeIndex(snapshot.index) === null) {
      return `${label}.index for ${changeId} must be a non-negative integer.`;
    }
    if (snapshot.record === null && snapshot.index !== undefined) {
      return `${label}.index for ${changeId} requires a record.`;
    }
    if (snapshot.record !== null && normalizeText(snapshot.record.id) !== changeId) {
      return `${label}.record.id must match change id ${changeId}.`;
    }
    return null;
  }

  function validateUniqueRecords(records, collection) {
    if (!Array.isArray(records)) return `${collection} must be an array.`;
    const ids = new Set();
    for (const record of records) {
      if (!isRecord(record)) return `${collection} contains a non-record value.`;
      const id = normalizeText(record.id);
      if (!id) return `${collection} contains a record without an id.`;
      if (ids.has(id)) return `${collection} contains duplicate id ${id}.`;
      ids.add(id);
    }
    return null;
  }

  function createCanvasCommandExecutor(options = {}) {
    if (typeof options.getCanvas !== "function") {
      throw new TypeError("Canvas command executor requires getCanvas(canvasId).");
    }
    const getCanvas = options.getCanvas;
    const onCommit = typeof options.onCommit === "function" ? options.onCommit : () => undefined;
    const clone = typeof options.clone === "function" ? options.clone : clonePlain;
    const equal = typeof options.equal === "function" ? options.equal : equalPlain;
    const normalize = typeof options.normalize === "function" ? options.normalize : identityNormalize;
    const validateTransition = typeof options.validateTransition === "function"
      ? options.validateTransition
      : () => null;
    const undoLimit = Number.isInteger(options.undoLimit) && options.undoLimit > 0
      ? options.undoLimit
      : DEFAULT_UNDO_LIMIT;

    function cloneSnapshot(snapshot) {
      const output = { record: snapshot.record === null ? null : clone(snapshot.record) };
      if (snapshot.index !== undefined) output.index = snapshot.index;
      return output;
    }

    function validateCommand(command) {
      if (!command || typeof command !== "object") return failure("invalid-command", "Command must be an object.");
      const id = normalizeText(command.id);
      const type = normalizeText(command.type);
      const canvasId = normalizeText(command.canvasId);
      if (!id) return failure("invalid-command", "Command id is required.");
      if (!type) return failure("invalid-command", "Command type is required.");
      if (!canvasId) return failure("invalid-command", "Command canvasId is required.");
      if (!Array.isArray(command.changes) || !command.changes.length) {
        return failure("invalid-command", "Command changes must be a non-empty array.");
      }

      const seen = new Set();
      const changes = [];
      for (const candidate of command.changes) {
        if (!candidate || typeof candidate !== "object") {
          return failure("invalid-change", "Every command change must be an object.");
        }
        const collection = normalizeText(candidate.collection);
        const changeId = normalizeText(candidate.id);
        if (!COLLECTION_SET.has(collection)) {
          return failure("invalid-collection", `Unsupported canvas collection: ${collection || "(empty)"}.`);
        }
        if (!changeId) return failure("invalid-change", "Every command change requires an id.");
        const key = `${collection}\u0000${changeId}`;
        if (seen.has(key)) {
          return failure("duplicate-change", `Command changes ${collection}/${changeId} more than once.`);
        }
        seen.add(key);

        const beforeError = validateSnapshot(candidate.before, "before", changeId);
        if (beforeError) return failure("invalid-change", beforeError);
        const afterError = validateSnapshot(candidate.after, "after", changeId);
        if (afterError) return failure("invalid-change", afterError);
        if (candidate.before.record === null && candidate.after.record === null) {
          return failure("invalid-change", `Change ${collection}/${changeId} has no record transition.`);
        }

        changes.push({
          collection,
          id: changeId,
          before: cloneSnapshot(candidate.before),
          after: cloneSnapshot(candidate.after),
        });
      }
      return Object.freeze({ ok: true, command: { id, type, canvasId, changes } });
    }

    function findRecordIndex(records, id) {
      return records.findIndex((record) => normalizeText(record?.id) === id);
    }

    function validatePreconditions(command, originals) {
      for (const change of command.changes) {
        const records = originals[change.collection];
        const actualIndex = findRecordIndex(records, change.id);
        if (change.before.record === null) {
          if (actualIndex !== -1) {
            return failure("before-conflict", `${change.collection}/${change.id} must be absent before insert.`);
          }
          continue;
        }
        if (actualIndex === -1) {
          return failure("before-conflict", `${change.collection}/${change.id} is missing.`);
        }
        if (change.before.index !== undefined && change.before.index !== actualIndex) {
          return failure("before-conflict", `${change.collection}/${change.id} moved before execution.`);
        }
        if (!equal(records[actualIndex], change.before.record)) {
          return failure("before-conflict", `${change.collection}/${change.id} no longer matches its before record.`);
        }
      }
      return null;
    }

    function insertAt(records, index, record) {
      const targetIndex = index === undefined ? records.length : Math.min(index, records.length);
      records.splice(targetIndex, 0, record);
    }

    function applyRawChanges(command, drafts) {
      for (const change of command.changes) {
        const records = drafts[change.collection];
        const currentIndex = findRecordIndex(records, change.id);
        if (change.after.record === null) {
          if (currentIndex === -1) {
            return failure("apply-conflict", `${change.collection}/${change.id} disappeared during execution.`);
          }
          records.splice(currentIndex, 1);
          continue;
        }

        const nextRecord = clone(change.after.record);
        if (currentIndex === -1) {
          insertAt(records, change.after.index, nextRecord);
          continue;
        }
        records.splice(currentIndex, 1);
        insertAt(records, change.after.index === undefined ? currentIndex : change.after.index, nextRecord);
      }
      return null;
    }

    function validateNormalizedScope(command, originals, drafts) {
      for (const collection of Object.keys(drafts)) {
        const explicitIds = new Set(
          command.changes.filter((change) => change.collection === collection).map((change) => change.id),
        );
        const originalUntouched = originals[collection].filter((record) => !explicitIds.has(normalizeText(record.id)));
        const finalUntouched = drafts[collection].filter((record) => !explicitIds.has(normalizeText(record.id)));
        if (originalUntouched.length !== finalUntouched.length) {
          return failure("normalize-scope", `Normalizer changed untargeted ${collection} records.`);
        }
        for (let index = 0; index < originalUntouched.length; index += 1) {
          if (
            normalizeText(originalUntouched[index].id) !== normalizeText(finalUntouched[index].id)
            || !equal(originalUntouched[index], finalUntouched[index])
          ) {
            return failure("normalize-scope", `Normalizer changed untargeted ${collection} records.`);
          }
        }
      }
      return null;
    }

    function validatePostconditions(command, drafts) {
      for (const change of command.changes) {
        const finalIndex = findRecordIndex(drafts[change.collection], change.id);
        if (change.after.record === null && finalIndex !== -1) {
          return failure(
            "after-conflict",
            `${change.collection}/${change.id} still exists after normalization.`,
          );
        }
        if (change.after.record !== null && finalIndex === -1) {
          return failure(
            "after-conflict",
            `${change.collection}/${change.id} was rejected during normalization.`,
          );
        }
      }
      return null;
    }

    function createAppliedCommand(command, originals, drafts) {
      return {
        id: command.id,
        type: command.type,
        canvasId: command.canvasId,
        changes: command.changes.map((change) => {
          const originalIndex = findRecordIndex(originals[change.collection], change.id);
          const finalIndex = findRecordIndex(drafts[change.collection], change.id);
          return {
            collection: change.collection,
            id: change.id,
            before: originalIndex === -1
              ? { record: null }
              : { record: clone(originals[change.collection][originalIndex]), index: originalIndex },
            after: finalIndex === -1
              ? { record: null }
              : { record: clone(drafts[change.collection][finalIndex]), index: finalIndex },
          };
        }),
      };
    }

    function createInverseCommand(command) {
      const removals = [];
      const replacements = [];
      const insertions = [];
      for (const change of command.changes) {
        const inverse = {
          collection: change.collection,
          id: change.id,
          before: cloneSnapshot(change.after),
          after: cloneSnapshot(change.before),
        };
        if (inverse.after.record === null) removals.push(inverse);
        else if (inverse.before.record === null) insertions.push(inverse);
        else replacements.push(inverse);
      }
      replacements.sort((left, right) => (left.after.index ?? 0) - (right.after.index ?? 0));
      insertions.sort((left, right) => (left.after.index ?? 0) - (right.after.index ?? 0));
      return {
        id: `${command.id}:undo`,
        type: `undo:${command.type}`,
        canvasId: command.canvasId,
        changes: [...removals.reverse(), ...replacements, ...insertions],
      };
    }

    function createUndoEntry(appliedCommand) {
      return {
        kind: UNDO_KIND,
        command: clone(appliedCommand),
        inverse: clone(createInverseCommand(appliedCommand)),
      };
    }

    function applyCommand(commandCandidate, settings = {}) {
      const validation = validateCommand(commandCandidate);
      if (!validation.ok) return validation;
      const command = validation.command;
      const canvas = getCanvas(command.canvasId);
      if (!canvas || typeof canvas !== "object") {
        return failure("canvas-not-found", `Canvas ${command.canvasId} was not found.`);
      }

      const touchedCollections = COLLECTIONS.filter((collection) =>
        command.changes.some((change) => change.collection === collection));
      const originals = {};
      const drafts = {};
      try {
        for (const collection of touchedCollections) {
          const uniquenessError = validateUniqueRecords(canvas[collection], collection);
          if (uniquenessError) return failure("invalid-canvas", uniquenessError);
          originals[collection] = clone(canvas[collection]);
          drafts[collection] = clone(canvas[collection]);
        }

        const preconditionFailure = validatePreconditions(command, originals);
        if (preconditionFailure) return preconditionFailure;
        const applyFailure = applyRawChanges(command, drafts);
        if (applyFailure) return applyFailure;

        const safeCanvasView = {};
        for (const collection of COLLECTIONS) {
          safeCanvasView[collection] = drafts[collection] || clone(Array.isArray(canvas[collection]) ? canvas[collection] : []);
        }
        for (const collection of touchedCollections) {
          const normalized = normalize(collection, safeCanvasView[collection], {
            canvasId: command.canvasId,
            command: clone(command),
            canvas: safeCanvasView,
          });
          if (normalized !== undefined) safeCanvasView[collection] = normalized;
          if (!Array.isArray(safeCanvasView[collection])) {
            return failure("normalize-failed", `Normalizer must return an array for ${collection}.`);
          }
          drafts[collection] = safeCanvasView[collection];
          const uniquenessError = validateUniqueRecords(drafts[collection], collection);
          if (uniquenessError) return failure("duplicate-id", uniquenessError);
        }

        const postconditionFailure = validatePostconditions(command, drafts);
        if (postconditionFailure) return postconditionFailure;
        const scopeFailure = validateNormalizedScope(command, originals, drafts);
        if (scopeFailure) return scopeFailure;

        const transitionFailure = validateTransition({
          canvasId: command.canvasId,
          command,
          canvas: safeCanvasView,
        });
        if (transitionFailure) {
          if (typeof transitionFailure === "string") {
            return failure("invalid-transition", transitionFailure);
          }
          return failure(
            normalizeText(transitionFailure.code) || "invalid-transition",
            normalizeText(transitionFailure.message) || "Canvas command transition is invalid.",
          );
        }

        const appliedCommand = createAppliedCommand(command, originals, drafts);
        const recordUndo = settings.recordUndo !== false;
        const currentUndoStack = Array.isArray(canvas.undoStack) ? canvas.undoStack : [];
        const nextUndoStack = settings.undoStackAfter
          ? settings.undoStackAfter.slice()
          : currentUndoStack.slice();
        let undoEntry = null;
        if (recordUndo) {
          undoEntry = createUndoEntry(appliedCommand);
          nextUndoStack.push(undoEntry);
          if (nextUndoStack.length > undoLimit) {
            nextUndoStack.splice(0, nextUndoStack.length - undoLimit);
          }
        }

        const result = Object.freeze({
          ok: true,
          canvasId: command.canvasId,
          command: clone(appliedCommand),
          undoEntry: undoEntry ? clone(undoEntry) : null,
          source: settings.source || "execute",
        });
        for (const collection of touchedCollections) canvas[collection] = drafts[collection];
        canvas.undoStack = nextUndoStack;
        try {
          onCommit(result);
          return result;
        } catch (error) {
          return Object.freeze({
            ...result,
            effectError: Object.freeze({
              message: typeof error?.message === "string" ? error.message : String(error),
            }),
          });
        }
      } catch (error) {
        return failure(
          "execution-failed",
          typeof error?.message === "string" ? error.message : String(error),
        );
      }
    }

    function execute(command, settings = {}) {
      return applyCommand(command, { recordUndo: settings.recordUndo !== false, source: "execute" });
    }

    function undoLast(canvasIdCandidate) {
      const canvasId = normalizeText(canvasIdCandidate);
      const canvas = canvasId ? getCanvas(canvasId) : null;
      if (!canvas || typeof canvas !== "object") {
        return failure("canvas-not-found", `Canvas ${canvasId || "(empty)"} was not found.`);
      }
      const undoStack = Array.isArray(canvas.undoStack) ? canvas.undoStack : [];
      const entry = undoStack[undoStack.length - 1];
      if (!entry) return failure("undo-empty", `Canvas ${canvasId} has no command to undo.`);
      if (entry.kind !== UNDO_KIND || !entry.inverse) {
        return failure("undo-unsupported", `Canvas ${canvasId} has a non-command undo entry on top.`);
      }
      return applyCommand(entry.inverse, {
        recordUndo: false,
        source: "undo",
        undoStackAfter: undoStack.slice(0, -1),
      });
    }

    return Object.freeze({ execute, undoLast });
  }

  root.REELAY_CANVAS_COMMAND_EXECUTOR = Object.freeze({
    COLLECTIONS,
    createCanvasCommandExecutor,
  });
}(typeof globalThis === "object" ? globalThis : window));
