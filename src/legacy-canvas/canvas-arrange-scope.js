(function registerCanvasArrangeScope(root) {
  "use strict";

  const validId = (value) => typeof value === "string" && Boolean(value.trim());
  const finite = Number.isFinite;
  const epsilon = 0.000001;

  function failure(reason, reasonCode, details = {}) {
    return {
      affectedNodeIds: [], unitCount: 0,
      groupCount: 0, expandedGroupCount: 0, scopeLabel: "当前选择", notice: "", internalGroupId: null,
      ...details, ok: false, available: false, reason, reasonCode, positions: [], groupPositions: [], changed: false,
    };
  }

  function collectScope(options = {}) {
    const nodes = options.nodes || [];
    const groups = options.groups || [];
    const scope = options.scope || "current";
    if (!Array.isArray(nodes) || !Array.isArray(groups) || !["current", "all"].includes(scope)) {
      return { result: failure("当前整理范围不可用", "invalid-scope") };
    }
    const nodeById = new Map();
    const groupById = new Map();
    const membership = new Map();
    const invalidMembership = () => ({ result: failure("画布分组关联异常，暂时无法整理", "invalid-membership") });
    for (const node of nodes) {
      if (!validId(node?.id) || nodeById.has(node.id)) return invalidMembership();
      nodeById.set(node.id, node);
    }
    for (const group of groups) {
      if (!validId(group?.id) || groupById.has(group.id) || !Array.isArray(group.nodeIds)) return invalidMembership();
      groupById.set(group.id, group);
      for (const id of group.nodeIds) {
        if (!nodeById.has(id) || membership.has(id) || nodeById.get(id).groupId !== group.id) return invalidMembership();
        membership.set(id, group.id);
      }
    }
    for (const node of nodes) {
      if (node.groupId === undefined || node.groupId === null || node.groupId === "") continue;
      if (!groupById.has(node.groupId) || membership.get(node.id) !== node.groupId) return invalidMembership();
    }

    const membersByGroup = new Map(groups.map((group) => [group.id, []]));
    for (const node of nodes) {
      if (membership.has(node.id)) membersByGroup.get(membership.get(node.id)).push(node);
    }
    const unitForNode = (node) => membership.has(node.id) ? `group:${membership.get(node.id)}` : `node:${node.id}`;
    const units = [];
    const unitIds = new Set();
    for (const node of nodes) {
      const id = unitForNode(node);
      if (unitIds.has(id)) continue;
      unitIds.add(id);
      const group = groupById.get(membership.get(node.id));
      units.push({ id, group: group || null, nodes: group ? membersByGroup.get(group.id) : [node] });
    }
    for (const group of groups) {
      if (unitIds.has(`group:${group.id}`)) continue;
      units.push({ id: `group:${group.id}`, group, nodes: [] });
    }

    let selected = [];
    let selectedIds;
    let internalGroup = null;
    let expandedGroupCount = 0;
    if (scope === "all") {
      selected = units;
    } else if (options.activeGroupId) {
      internalGroup = groupById.get(options.activeGroupId);
      if (!internalGroup) return { result: failure("当前分组已不可用", "missing-group") };
      selected = membersByGroup.get(internalGroup.id)
        .map((node) => ({ id: `node:${node.id}`, group: null, nodes: [node] }));
    } else {
      if (options.selectedIds != null && (typeof options.selectedIds === "string" || !options.selectedIds[Symbol.iterator])) {
        return { result: failure("当前选择已不可用", "invalid-selection") };
      }
      selectedIds = new Set(options.selectedIds || []);
      if (Array.from(selectedIds).some((id) => !nodeById.has(id))) {
        return { result: failure("当前选择已发生变化，请重新选择", "invalid-selection") };
      }
      const selectedUnits = new Set(Array.from(selectedIds, (id) => unitForNode(nodeById.get(id))));
      selected = units.filter((unit) => selectedUnits.has(unit.id));
      expandedGroupCount = selected.filter((unit) => unit.group && unit.nodes.some((node) => !selectedIds.has(node.id))).length;
    }
    const affected = new Set(selected.flatMap((unit) => unit.nodes.map((node) => node.id)));
    const groupCount = internalGroup ? 1 : selected.filter((unit) => unit.group).length;
    const details = {
      affectedNodeIds: nodes.filter((node) => affected.has(node.id)).map((node) => node.id),
      unitCount: selected.length, groupCount, expandedGroupCount,
      scopeLabel: scope === "all" ? "整张画布" : internalGroup ? "当前分组" : "当前选择",
      internalGroupId: internalGroup?.id || null,
      notice: internalGroup ? "整理组内节点，保留分组归属和较大的组框尺寸"
        : expandedGroupCount ? `已包含所选节点所在的 ${expandedGroupCount} 个完整分组，保留组内布局`
          : groupCount ? `${groupCount} 个分组将整体移动，保留组内布局` : "",
    };
    if (selected.length < 2) {
      const reason = internalGroup ? "组内至少需要两个节点才能整理"
        : !selected.length ? scope === "all" ? "画布暂无可整理内容" : "请先选择需要整理的节点"
          : "当前范围只有一个节点或分组，无需整理";
      return { result: failure(reason, "insufficient-items", details) };
    }
    return {
      result: { ok: true, available: true, reason: "", reasonCode: "", ...details },
      nodes, groups, units, selected, internalGroup, unitForNode, nodeById, groupById,
    };
  }

  function describeScope(options) {
    return collectScope(options).result;
  }

  function readBounds(value) {
    if (!value) return null;
    const left = value.left ?? value.x;
    const top = value.top ?? value.y;
    const right = value.right ?? left + value.width;
    const bottom = value.bottom ?? top + value.height;
    if (![left, top, right, bottom].every(finite) || right <= left || bottom <= top) return null;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function union(rects) {
    if (!rects.length) return null;
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (const rect of rects) {
      bounds.left = Math.min(bounds.left, rect.left);
      bounds.top = Math.min(bounds.top, rect.top);
      bounds.right = Math.max(bounds.right, rect.right);
      bounds.bottom = Math.max(bounds.bottom, rect.bottom);
    }
    return readBounds(bounds);
  }

  function plannerItem(id, bounds) {
    return { id, x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  }

  function validPlan(plan, items) {
    if (!plan?.ok || !Array.isArray(plan.positions) || plan.positions.length !== items.length) return false;
    const ids = new Set(items.map((item) => item.id));
    for (const position of plan.positions) {
      if (!ids.delete(position?.id) || !finite(position.x) || !finite(position.y)) return false;
    }
    return !ids.size;
  }

  function prepareArrangement(options = {}) {
    const collected = collectScope(options);
    const details = collected.result;
    if (!details.ok) return details;
    const failed = (reason, code) => failure(reason, code, details);
    const { nodes, groups, units, selected, internalGroup, unitForNode, nodeById, groupById } = collected;
    if (typeof options.getNodeBounds !== "function" || typeof options.getGroupBounds !== "function"
      || typeof options.planArrangement !== "function") return failed("整理布局暂不可用", "missing-adapter");

    try {
      const nodeBounds = new Map();
      const groupBounds = new Map();
      for (const node of nodes) {
        const bounds = readBounds(options.getNodeBounds(node));
        if (!bounds || !finite(node.x) || !finite(node.y)) return failed("节点尺寸暂不可用，请稍后再试", "invalid-geometry");
        nodeBounds.set(node.id, bounds);
      }
      for (const group of groups) {
        const bounds = readBounds(options.getGroupBounds(group));
        if (!bounds || ![group.x, group.y, group.width, group.height].every(finite)
          || group.width <= 0 || group.height <= 0) return failed("分组尺寸暂不可用，请稍后再试", "invalid-geometry");
        groupBounds.set(group.id, bounds);
      }
      const boundsForUnit = (unit) => union([
        ...(unit.group ? [groupBounds.get(unit.group.id)] : []), ...unit.nodes.map((node) => nodeBounds.get(node.id)),
      ]);
      const selectedUnitIds = new Set(selected.map((unit) => unit.id));
      const obstacles = units.filter((unit) => internalGroup ? unit.group?.id !== internalGroup.id : !selectedUnitIds.has(unit.id))
        .map((unit) => plannerItem(unit.id, boundsForUnit(unit)));
      const items = selected.map((unit) => plannerItem(unit.id, boundsForUnit(unit)));
      const mappedId = (id) => {
        const node = nodeById.get(id);
        return node ? internalGroup ? `node:${node.id}` : unitForNode(node) : null;
      };
      const edgeKeys = new Set();
      const edges = (Array.isArray(options.connections) ? options.connections : []).flatMap((edge) => {
        const fromId = mappedId(edge?.sourceNodeId);
        const toId = mappedId(edge?.targetNodeId);
        const key = JSON.stringify([fromId, toId]);
        if (!fromId || !toId || fromId === toId || !selectedUnitIds.has(fromId) || !selectedUnitIds.has(toId) || edgeKeys.has(key)) return [];
        edgeKeys.add(key);
        return [{ fromId, toId }];
      });
      const plan = options.planArrangement({ items, edges, mode: options.mode || "auto", obstacles: internalGroup ? [] : obstacles });
      if (!validPlan(plan, items)) return failed("暂时无法完成整理，请稍后重试", plan?.reason || "invalid-layout");
      const nextById = new Map(plan.positions.map((position) => [position.id, position]));
      const positions = [];
      const groupPositions = [];
      if (internalGroup) {
        const original = groupBounds.get(internalGroup.id);
        const padding = options.groupPadding || {};
        const inset = (value) => finite(value) ? Math.max(0, value) : 0;
        const left = inset(padding.left ?? padding.paddingX);
        const right = inset(padding.right ?? padding.paddingX);
        const top = inset(padding.top ?? padding.paddingTop);
        const bottom = inset(padding.bottom ?? padding.paddingBottom);
        const packed = union(items.map((item) => readBounds({ ...item, ...nextById.get(item.id) })));
        const insetX = Math.max(0, original.left + left - packed.left);
        const insetY = Math.max(0, original.top + top - packed.top);
        const frame = {
          id: `group:${internalGroup.id}`, x: original.left, y: original.top,
          width: Math.max(original.width, packed.right + insetX + right - original.left),
          height: Math.max(original.height, packed.bottom + insetY + bottom - original.top),
        };
        const enclosingPlan = options.planArrangement({ items: [frame], edges: [], mode: "auto", obstacles, translateSingle: true });
        if (!validPlan(enclosingPlan, [frame])) return failed("当前分组暂时无法避让其他内容", enclosingPlan?.reason || "invalid-layout");
        const shiftX = enclosingPlan.positions[0].x - frame.x;
        const shiftY = enclosingPlan.positions[0].y - frame.y;
        for (const unit of selected) {
          const node = unit.nodes[0];
          const before = nodeBounds.get(node.id);
          const after = nextById.get(unit.id);
          positions.push({ id: node.id, x: node.x + after.x - before.left + insetX + shiftX, y: node.y + after.y - before.top + insetY + shiftY });
        }
        groupPositions.push({
          id: internalGroup.id, x: internalGroup.x + shiftX, y: internalGroup.y + shiftY,
          width: internalGroup.width + frame.width - original.width, height: internalGroup.height + frame.height - original.height,
        });
      } else {
        for (const unit of selected) {
          const before = boundsForUnit(unit);
          const after = nextById.get(unit.id);
          const dx = after.x - before.left;
          const dy = after.y - before.top;
          for (const node of unit.nodes) positions.push({ id: node.id, x: node.x + dx, y: node.y + dy });
          if (unit.group) groupPositions.push({ id: unit.group.id, x: unit.group.x + dx, y: unit.group.y + dy });
        }
      }
      if ([...positions, ...groupPositions].some((position) => Object.entries(position).some(([key, value]) => key !== "id" && !finite(value)))) {
        return failed("整理范围超出画布坐标限制", "layout-overflow");
      }
      const changed = positions.some((position) => {
        const node = nodeById.get(position.id);
        return Math.abs(node.x - position.x) > epsilon || Math.abs(node.y - position.y) > epsilon;
      }) || groupPositions.some((position) => {
        const group = groupById.get(position.id);
        return ["x", "y", "width", "height"].some((field) => position[field] !== undefined && Math.abs(group[field] - position[field]) > epsilon);
      });
      return { ...details, positions, groupPositions, changed };
    } catch {
      return failed("整理布局暂不可用，请稍后再试", "layout-error");
    }
  }

  root.REELAY_CANVAS_ARRANGE_SCOPE = Object.freeze({ describeScope, prepareArrangement });
}(typeof globalThis === "object" ? globalThis : window));
