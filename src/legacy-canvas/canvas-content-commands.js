(function registerCanvasContentCommands(root) {
  "use strict";

  const NODE_FIELDS = Object.freeze([
    "name", "prompt", "model", "workflow", "omniReferenceTaskType", "aspect",
    "resolution", "quality", "duration", "outputFormat", "count", "audioEnabled",
    "autoLinkEnabled", "assetValidationEnabled", "x", "y", "z", "groupId",
  ]);
  const GROUP_FIELDS = Object.freeze(["name", "x", "y", "width", "height", "z", "nodeIds"]);
  const FIELD_SETS = { nodes: new Set(NODE_FIELDS), groups: new Set(GROUP_FIELDS) };
  const BOOLEAN_FIELDS = new Set(["audioEnabled", "autoLinkEnabled", "assetValidationEnabled"]);
  const NUMBER_FIELDS = new Set(["x", "y", "z", "width", "height", "count"]);
  const hasOwn = (record, field) => Object.prototype.hasOwnProperty.call(record, field);
  const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }

  function equal(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => hasOwn(right, key) && equal(left[key], right[key]));
  }

  function pickFields(record, fields) {
    return Object.fromEntries(fields.map((field) => [field, hasOwn(record, field)
      ? { present: true, value: copy(record[field]) }
      : { present: false }]));
  }

  function buildFieldChange(collection, beforeRecord, afterRecord, fields = collection === "nodes" ? NODE_FIELDS : GROUP_FIELDS) {
    const allowed = FIELD_SETS[collection];
    if (!allowed || fields.some((field) => !allowed.has(field))) throw new TypeError("Unsupported canvas content field.");
    if (!beforeRecord?.id || beforeRecord.id !== afterRecord?.id) throw new TypeError("Field patches require one existing record id.");
    const before = pickFields(beforeRecord, fields);
    const after = pickFields(afterRecord, fields);
    const changed = [...new Set(fields)].filter((field) => !equal(before[field], after[field]));
    if (!changed.length) return null;
    return {
      collection, id: beforeRecord.id, kind: "fields",
      before: { fields: Object.fromEntries(changed.map((field) => [field, before[field]])) },
      after: { fields: Object.fromEntries(changed.map((field) => [field, after[field]])) },
    };
  }

  function pickGroupContent(group) {
    if (group === null) return null;
    return Object.fromEntries(["id", ...GROUP_FIELDS].filter((field) => hasOwn(group, field)).map((field) => [field, copy(group[field])]));
  }

  function projectRecord(collection, record) {
    return collection === "groups" ? pickGroupContent(record) : record;
  }

  function buildGroupChanges({ nodes, groups }, nextGroups, { positions = [] } = {}) {
    const beforeById = new Map(groups.map((group) => [group.id, group]));
    const afterById = new Map(nextGroups.map((group) => [group.id, group]));
    if (beforeById.size !== groups.length || afterById.size !== nextGroups.length) {
      throw new TypeError("Group transactions require unique group ids.");
    }
    const changes = [];
    groups.forEach((group, index) => {
      const next = afterById.get(group.id);
      changes.push(next
        ? buildFieldChange("groups", group, next, GROUP_FIELDS)
        : { collection: "groups", id: group.id, before: { record: pickGroupContent(group), index }, after: { record: null } });
    });
    nextGroups.forEach((group, index) => {
      if (beforeById.has(group.id)) return;
      changes.push({ collection: "groups", id: group.id, before: { record: null }, after: { record: pickGroupContent(group), index } });
    });
    const membership = new Map(nextGroups.flatMap((group) => group.nodeIds.map((id) => [id, group.id])));
    const positionsById = new Map(positions.map((position) => [position.id, position]));
    nodes.forEach((node) => {
      const next = { ...node };
      if (membership.has(node.id)) next.groupId = membership.get(node.id);
      else if (node.groupId) delete next.groupId;
      const position = positionsById.get(node.id);
      if (position) { next.x = position.x; next.y = position.y; }
      changes.push(buildFieldChange("nodes", node, next, position ? ["groupId", "x", "y"] : ["groupId"]));
    });
    return changes.filter(Boolean);
  }

  function validFieldValue(field, value) {
    if (field === "nodeIds") return Array.isArray(value) && value.every((id) => typeof id === "string" && id.trim());
    if (field === "groupId") return value === null || (typeof value === "string" && Boolean(value.trim()));
    if (BOOLEAN_FIELDS.has(field)) return typeof value === "boolean";
    if (NUMBER_FIELDS.has(field)) {
      if (!Number.isFinite(value)) return false;
      if (field === "width" || field === "height") return value > 0;
      if (field === "count") return Number.isInteger(value) && value > 0;
      return true;
    }
    return typeof value === "string";
  }

  function failure(message) {
    return { code: "unsupported-content-command", message };
  }

  function validateMembership(canvas) {
    const nodes = new Map(canvas.nodes.map((node) => [node.id, node]));
    const groups = new Map(canvas.groups.map((group) => [group.id, group]));
    const membership = new Map();
    for (const group of canvas.groups) {
      if (!Array.isArray(group.nodeIds)) return "Every group must contain a nodeIds array.";
      for (const nodeId of group.nodeIds) {
        if (!nodes.has(nodeId)) return `Group ${group.id} contains missing node ${nodeId}.`;
        if (membership.has(nodeId)) return `Node ${nodeId} belongs to more than one group entry.`;
        if (nodes.get(nodeId).groupId !== group.id) return `Node ${nodeId} and group ${group.id} disagree about membership.`;
        membership.set(nodeId, group.id);
      }
    }
    for (const node of canvas.nodes) {
      if (node.groupId === null || node.groupId === undefined || node.groupId === "") continue;
      if (!groups.has(node.groupId)) return `Node ${node.id} refers to a missing group.`;
      if (membership.get(node.id) !== node.groupId) return `Group ${node.groupId} is missing node ${node.id}.`;
    }
    return null;
  }

  function validateTransition({ command, canvas }) {
    let membershipChanged = false;
    for (const change of command.changes) {
      if (change.collection === "connections") {
        if (change.kind === "fields") return failure("Connections use the existing record command contract.");
        continue;
      }
      const allowed = FIELD_SETS[change.collection];
      if (!allowed) return failure("Unsupported canvas collection.");
      if (change.kind !== "fields") {
        if (change.collection !== "groups" || (change.before.record !== null && change.after.record !== null)) {
          return failure("Node content requires field patches; groups only use records for creation or deletion.");
        }
        for (const snapshot of [change.before, change.after]) {
          if (snapshot.record && Object.keys(snapshot.record).some((field) => field !== "id" && !allowed.has(field))) {
            return failure("Group records may contain only canonical content fields.");
          }
          if (snapshot.record && Object.entries(snapshot.record).some(([field, value]) => field !== "id" && !validFieldValue(field, value))) {
            return { code: "invalid-content-field", message: "Group content contains an invalid field value." };
          }
        }
        membershipChanged = true;
        continue;
      }
      for (const snapshot of [change.before, change.after]) {
        for (const [field, entry] of Object.entries(snapshot.fields)) {
          if (!allowed.has(field)) return failure(`${change.collection}.${field} is not editable canvas content.`);
          if (entry.present && !validFieldValue(field, entry.value)) {
            return { code: "invalid-content-field", message: `${change.collection}.${field} contains an invalid field value.` };
          }
          if (field === "groupId" || field === "nodeIds") membershipChanged = true;
        }
      }
    }
    if (membershipChanged) {
      const message = validateMembership(canvas);
      if (message) return { code: "invalid-group-membership", message };
    }
    return null;
  }

  // Import boundary only. Runtime edits must submit both sides in one command.
  // node.groupId is primary; valid existing group order survives older documents.
  function normalizeGroupMembership(nodes, groups) {
    const groupIds = new Set(groups.map((group) => group.id));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      if (node.groupId && !groupIds.has(node.groupId)) delete node.groupId;
    }
    for (const group of groups) {
      const seen = new Set();
      const members = [];
      for (const nodeId of Array.isArray(group.nodeIds) ? group.nodeIds : []) {
        if (!seen.has(nodeId) && nodesById.get(nodeId)?.groupId === group.id) {
          seen.add(nodeId);
          members.push(nodeId);
        }
      }
      for (const node of nodes) {
        if (node.groupId === group.id && !seen.has(node.id)) {
          seen.add(node.id);
          members.push(node.id);
        }
      }
      group.nodeIds = members;
    }
    return { nodes, groups };
  }

  root.REELAY_CANVAS_CONTENT_COMMANDS = Object.freeze({
    NODE_FIELDS, GROUP_FIELDS, pickFields, buildFieldChange, pickGroupContent,
    projectRecord, buildGroupChanges, validateTransition, normalizeGroupMembership,
  });
}(typeof globalThis === "object" ? globalThis : window));
