(function registerCanvasArrangeLayout(root) {
  "use strict";

  const MODES = new Set(["auto", "grid", "horizontal", "vertical"]);
  const compare = (left, right) => left.y - right.y || left.x - right.x || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const validSize = (value) => Number.isFinite(value) && value > 0;
  const validBox = (item) => Boolean(item && Number.isFinite(item.x) && Number.isFinite(item.y)
    && validSize(item.width) && validSize(item.height)
    && Number.isFinite(item.x + item.width) && Number.isFinite(item.y + item.height));
  const gapOption = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback;
  const failure = (reason) => ({ ok: false, positions: [], changed: false, bounds: null, reason });

  function boundsOf(items) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const item of items) {
      left = Math.min(left, item.x);
      top = Math.min(top, item.y);
      right = Math.max(right, item.x + item.width);
      bottom = Math.max(bottom, item.y + item.height);
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function gridPositions(items, mode, gap) {
    const positions = new Map();
    let x = 0;
    let y = 0;
    if (mode === "horizontal" || mode === "vertical") {
      for (const item of items) {
        positions.set(item.id, { x, y });
        if (mode === "horizontal") x += item.width + gap;
        else y += item.height + gap;
      }
      return positions;
    }
    const columns = Math.ceil(Math.sqrt(items.length));
    const cellWidth = items.reduce((value, item) => Math.max(value, item.width), 0) + gap;
    const cellHeight = items.reduce((value, item) => Math.max(value, item.height), 0) + gap;
    items.forEach((item, index) => positions.set(item.id, {
      x: (index % columns) * cellWidth,
      y: Math.floor(index / columns) * cellHeight,
    }));
    return positions;
  }

  // Collapse cycles before assigning columns. Iterative DFS also handles long
  // chains without depending on the JavaScript call-stack limit.
  function stronglyConnectedItems(items, edges) {
    const indexById = new Map(items.map((item, index) => [item.id, index]));
    const outgoing = items.map(() => new Set());
    const incoming = items.map(() => new Set());
    for (const edge of edges) {
      const from = indexById.get(edge?.fromId);
      const to = indexById.get(edge?.toId);
      if (from === undefined || to === undefined || from === to) continue;
      outgoing[from].add(to);
      incoming[to].add(from);
    }
    const next = outgoing.map((neighbors) => [...neighbors].sort((a, b) => a - b));
    const previous = incoming.map((neighbors) => [...neighbors].sort((a, b) => a - b));
    const visited = new Set();
    const finished = [];
    for (let index = 0; index < items.length; index += 1) {
      if (visited.has(index)) continue;
      visited.add(index);
      const stack = [{ index, cursor: 0 }];
      while (stack.length) {
        const frame = stack[stack.length - 1];
        const neighbor = next[frame.index][frame.cursor++];
        if (neighbor === undefined) {
          finished.push(frame.index);
          stack.pop();
        } else if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ index: neighbor, cursor: 0 });
        }
      }
    }
    const blocks = [];
    const blockByIndex = new Map();
    for (let offset = finished.length - 1; offset >= 0; offset -= 1) {
      const index = finished[offset];
      if (blockByIndex.has(index)) continue;
      const blockIndex = blocks.length;
      const members = [];
      const stack = [index];
      blockByIndex.set(index, blockIndex);
      while (stack.length) {
        const current = stack.pop();
        members.push(items[current]);
        for (const neighbor of previous[current]) {
          if (blockByIndex.has(neighbor)) continue;
          blockByIndex.set(neighbor, blockIndex);
          stack.push(neighbor);
        }
      }
      members.sort(compare);
      const bounds = boundsOf(members);
      blocks.push({
        id: members.map((item) => item.id).sort()[0],
        x: bounds.left, y: bounds.top, members,
        incoming: new Set(), outgoing: new Set(), layer: 0,
      });
    }
    next.forEach((neighbors, index) => {
      const from = blockByIndex.get(index);
      for (const neighbor of neighbors) {
        const to = blockByIndex.get(neighbor);
        if (from === to) continue;
        blocks[from].outgoing.add(to);
        blocks[to].incoming.add(from);
      }
    });
    return blocks;
  }

  function graphPositions(items, edges, gap, layerGap, componentGap) {
    const blocks = stronglyConnectedItems(items, edges);
    for (const block of blocks) {
      block.width = block.members.reduce((value, item) => Math.max(value, item.width), 0);
      block.height = block.members.reduce((value, item) => value + item.height, 0) + gap * (block.members.length - 1);
    }
    const remainingInputs = blocks.map((block) => block.incoming.size);
    const queue = blocks.flatMap((_, index) => remainingInputs[index] ? [] : [index]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const block = blocks[queue[cursor]];
      for (const index of block.outgoing) {
        blocks[index].layer = Math.max(blocks[index].layer, block.layer + 1);
        remainingInputs[index] -= 1;
        if (!remainingInputs[index]) queue.push(index);
      }
    }

    const components = [];
    const visited = new Set();
    for (let index = 0; index < blocks.length; index += 1) {
      if (visited.has(index)) continue;
      const componentBlocks = [];
      const stack = [index];
      visited.add(index);
      while (stack.length) {
        const current = stack.pop();
        const block = blocks[current];
        componentBlocks.push(block);
        for (const neighbor of [...block.incoming, ...block.outgoing]) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
      const sourceBounds = boundsOf(componentBlocks.flatMap((block) => block.members));
      const component = {
        id: componentBlocks.map((block) => block.id).sort()[0],
        x: sourceBounds.left, y: sourceBounds.top,
        width: 0, height: 0, positions: new Map(),
      };
      const layers = new Map();
      for (const block of componentBlocks) {
        if (!layers.has(block.layer)) layers.set(block.layer, []);
        layers.get(block.layer).push(block);
      }
      let columnX = 0;
      for (const layer of [...layers.keys()].sort((a, b) => a - b)) {
        const column = layers.get(layer).sort(compare);
        const width = column.reduce((value, block) => Math.max(value, block.width), 0);
        let rowY = 0;
        for (const block of column) {
          for (const member of block.members) {
            component.positions.set(member.id, { x: columnX, y: rowY });
            rowY += member.height + gap;
          }
        }
        component.width = columnX + width;
        component.height = Math.max(component.height, rowY - gap);
        columnX += width + layerGap;
      }
      components.push(component);
    }

    // Each disconnected flow gets a separate shelf cell. The width depends on
    // content dimensions, not viewport or zoom, so a second arrange is stable.
    components.sort(compare);
    const area = components.reduce((value, item) => value + (item.width + componentGap) * (item.height + componentGap), 0);
    const widest = components.reduce((value, item) => Math.max(value, item.width), 0);
    const targetWidth = Math.max(widest, Math.sqrt(area) * 1.35);
    const positions = new Map();
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const component of components) {
      if (x > 0 && x + component.width > targetWidth) {
        x = 0;
        y += rowHeight + componentGap;
        rowHeight = 0;
      }
      for (const [id, position] of component.positions) {
        positions.set(id, { x: x + position.x, y: y + position.y });
      }
      x += component.width + componentGap;
      rowHeight = Math.max(rowHeight, component.height);
    }
    return positions;
  }

  function clearOfObstacles(items, obstacles, gap) {
    const overlaps = (item, obstacle) => item.x < obstacle.x + obstacle.width + gap
      && item.x + item.width > obstacle.x - gap
      && item.y < obstacle.y + obstacle.height + gap
      && item.y + item.height > obstacle.y - gap;
    return !items.some((item) => obstacles.some((obstacle) => overlaps(item, obstacle)));
  }

  function avoidObstacles(items, obstacles, gap) {
    if (!obstacles.length || clearOfObstacles(items, obstacles, gap)) return items;
    const bounds = boundsOf(items);
    const candidates = [];
    // A directional sweep crosses every blocking interval only once. Choosing
    // the shortest of four clear translations avoids a combinatorial search,
    // while keeping all edges, group offsets and column alignment together.
    for (const axis of ["x", "y"]) {
      const size = axis === "x" ? "width" : "height";
      const cross = axis === "x" ? "y" : "x";
      const crossSize = axis === "x" ? "height" : "width";
      const origin = axis === "x" ? bounds.left : bounds.top;
      const crossOrigin = axis === "x" ? bounds.top : bounds.left;
      const relevant = obstacles.filter((obstacle) => crossOrigin < obstacle[cross] + obstacle[crossSize] + gap
        && crossOrigin + bounds[crossSize] > obstacle[cross] - gap);
      for (const direction of [1, -1]) {
        const ordered = [...relevant].sort((left, right) => direction > 0
          ? left[axis] - right[axis]
          : right[axis] + right[size] - left[axis] - left[size]);
        let shift = 0;
        for (const obstacle of ordered) {
          const start = origin + shift;
          if (start < obstacle[axis] + obstacle[size] + gap && start + bounds[size] > obstacle[axis] - gap) {
            shift = direction > 0
              ? obstacle[axis] + obstacle[size] + gap - origin
              : obstacle[axis] - gap - bounds[size] - origin;
          }
        }
        if (Number.isFinite(shift)) candidates.push({ x: axis === "x" ? shift : 0, y: axis === "y" ? shift : 0 });
      }
    }
    candidates.sort((left, right) => Math.abs(left.x || left.y) - Math.abs(right.x || right.y));
    for (const shift of candidates) {
      const placed = items.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
      if (clearOfObstacles(placed, obstacles, gap)) return placed;
    }
    return null;
  }

  function planArrangement(options = {}) {
    if (!options || !Array.isArray(options.items)) return failure("invalid-items");
    const mode = options.mode ?? "auto";
    if (!MODES.has(mode)) return failure("invalid-mode");
    const ids = new Set();
    const items = [];
    for (const item of options.items) {
      if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)
        || !validBox(item)) {
        return failure("invalid-items");
      }
      ids.add(item.id);
      items.push({ id: item.id, x: item.x, y: item.y, width: item.width, height: item.height });
    }
    const obstacles = options.obstacles ?? [];
    if (!Array.isArray(obstacles) || obstacles.some((obstacle) => !validBox(obstacle))) return failure("invalid-obstacles");
    if (!items.length) return { ok: true, positions: [], changed: false, bounds: null, reason: "" };
    const original = boundsOf(items);
    if (!Number.isFinite(original.width) || !Number.isFinite(original.height)) return failure("invalid-items");
    if (items.length === 1 && options.translateSingle !== true) return {
      ok: true, positions: [{ id: items[0].id, x: items[0].x, y: items[0].y }], changed: false, bounds: original, reason: "",
    };
    items.sort(compare);
    const gap = gapOption(options.gap, 48);
    const offsets = mode === "auto"
      ? graphPositions(items, Array.isArray(options.edges) ? options.edges : [], gap,
        gapOption(options.layerGap, 120), gapOption(options.componentGap, 96))
      : gridPositions(items, mode, gap);
    const proposed = items.map((item) => ({
      ...item,
      x: original.left + offsets.get(item.id).x,
      y: original.top + offsets.get(item.id).y,
    }));
    const placed = avoidObstacles(proposed, obstacles, gapOption(options.obstacleGap, 48));
    if (!placed) return failure("layout-overflow");
    const bounds = boundsOf(placed);
    if (Object.values(bounds).some((value) => !Number.isFinite(value))) return failure("layout-overflow");
    return {
      ok: true,
      positions: placed.map(({ id, x, y }) => ({ id, x, y })),
      changed: placed.some((item, index) => item.x !== items[index].x || item.y !== items[index].y),
      bounds,
      reason: "",
    };
  }

  root.REELAY_CANVAS_ARRANGE_LAYOUT = Object.freeze({ planArrangement });
})(typeof window !== "undefined" ? window : globalThis);
