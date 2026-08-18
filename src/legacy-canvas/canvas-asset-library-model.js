(function registerCanvasAssetLibraryModel(root) {
  "use strict";

  const globalScopes = new Set(["personal", "organization", "official"]);

  function normalizeSearch(value = "") {
    return String(value || "").trim().toLowerCase();
  }

  function matchesSearch(values = [], query = "") {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return true;
    return values
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }

  function normalizeGlobalScope(scope) {
    return globalScopes.has(scope) ? scope : "personal";
  }

  function getAssetCategory(asset, { categoryLabels = {} } = {}) {
    if (!asset) return "material";
    if (asset.category && categoryLabels[asset.category]) return asset.category;
    if (asset.type === "audio") return "material";

    const text = [asset.displayName, asset.name, asset.source, asset.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/角色|人物|人像|模特|机器人|character|portrait|person|avatar|model/.test(text)) return "character";
    if (/场景|城市|街道|风景|scene|city|street|landscape|environment/.test(text)) return "scene";
    if (/道具|物品|产品|prop|object|product|item/.test(text)) return "prop";
    return "material";
  }

  function countAssetsByCategory(assets = [], filters = [], options = {}) {
    return filters.reduce((result, [id]) => {
      result[id] = assets.filter((asset) => getAssetCategory(asset, options) === id).length;
      return result;
    }, {});
  }

  function getPreferredAssetFilter({ assets = [], currentFilter, filters = [], categoryLabels = {} } = {}) {
    if (categoryLabels[currentFilter]) return currentFilter;
    const counts = countAssetsByCategory(assets, filters, { categoryLabels });
    return filters.find(([id]) => counts[id] > 0)?.[0] || filters[0]?.[0] || "material";
  }

  function canvasItemMatchesFilter(item, filter = "all") {
    if (filter === "all") return true;
    if (filter === "generator") return item.nodeKind === "generator";
    return item.type === filter;
  }

  function canvasItemMatchesSearch(item, query = "") {
    return matchesSearch([item.title, item.subtitle, item.meta, item.type], query);
  }

  function filterCanvasElementTree(items = [], { filter = "all", query = "" } = {}) {
    return items
      .map((item) => {
        if (item.kind !== "group") {
          return canvasItemMatchesFilter(item, filter) && canvasItemMatchesSearch(item, query) ? item : null;
        }

        const matchesSelf = canvasItemMatchesFilter(item, filter) && canvasItemMatchesSearch(item, query);
        const visibleChildren = (item.children || []).filter(
          (child) => canvasItemMatchesFilter(child, filter) && canvasItemMatchesSearch(child, query),
        );

        if (filter === "group") return matchesSelf ? { ...item, children: [] } : null;
        if (!matchesSelf && !visibleChildren.length) return null;

        return {
          ...item,
          children: matchesSelf && !normalizeSearch(query) && filter === "all" ? item.children : visibleChildren,
        };
      })
      .filter(Boolean);
  }

  function countCanvasElementRows(items = []) {
    return items.reduce((count, item) => count + 1 + (item.collapsed ? 0 : item.children?.length || 0), 0);
  }

  function buildCanvasElementItems({
    nodes = [],
    groups = [],
    collapsedGroupIds = new Set(),
    getGroupNodes,
    getGroupBounds,
    createNodeItem,
  } = {}) {
    const groupedNodeIds = new Set();
    const groupItems = groups
      .map((group) => {
        const groupNodes = getGroupNodes(group);
        const bounds = getGroupBounds(group);
        if (!bounds) return null;
        groupNodes.forEach((node) => groupedNodeIds.add(node.id));
        return {
          id: group.id,
          kind: "group",
          type: "group",
          icon: "layers-3",
          title: group.name || "新建组",
          subtitle: `${groupNodes.length} 个节点`,
          meta: `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`,
          collapsed: collapsedGroupIds.has(group.id),
          children: groupNodes.map((node) => createNodeItem(node, group.id)),
        };
      })
      .filter(Boolean);

    const ungroupedNodeItems = nodes
      .filter((node) => !groupedNodeIds.has(node.id))
      .map((node) => createNodeItem(node));
    return [...groupItems, ...ungroupedNodeItems];
  }

  function buildGlobalAssetFolders({ assets = [], scope = "personal" } = {}) {
    const audioAssets = assets.filter((asset) => asset.type === "audio");
    const visualAssets = assets.filter((asset) => asset.type !== "audio");
    const generatedAssets = assets.filter((asset) => asset.source === "generated");
    const sourceAssets = assets.filter((asset) => asset.source !== "generated");
    const foldersByScope = {
      personal: [
        {
          id: "personal-library",
          icon: "folder",
          title: "个人常用",
          body: "自己跨项目复用的图片、视频、音频与参考素材。",
          assets,
        },
        {
          id: "personal-generated",
          icon: "folder",
          title: "生成沉淀",
          body: "从画布结果保存来的可复用生成资产。",
          assets: generatedAssets,
        },
        {
          id: "personal-inbox",
          icon: "folder",
          title: "待整理",
          body: "稍后再归档的临时资产入口。",
          assets: [],
        },
      ],
      organization: [
        {
          id: "organization-shared",
          icon: "folder",
          title: "团队共享",
          body: "同组织成员共用的项目素材与规范资产。",
          assets,
        },
        {
          id: "organization-brand",
          icon: "folder",
          title: "品牌资料",
          body: "后续用于沉淀品牌视觉、字体、产品图和标准片段。",
          assets: sourceAssets.filter((asset) => asset.type !== "audio"),
        },
        {
          id: "organization-audio",
          icon: "folder",
          title: "声音资料",
          body: "后续用于管理组织内共享音效与旁白素材。",
          assets: audioAssets,
        },
      ],
      official: [
        {
          id: "official-starters",
          icon: "folder",
          title: "官方示例包",
          body: "官方提供的可直接拖入画布的视觉素材包。",
          assets: visualAssets,
        },
        {
          id: "official-sound",
          icon: "folder",
          title: "声音与氛围",
          body: "官方公共音效、氛围声与后续音乐素材入口。",
          assets: audioAssets,
        },
        {
          id: "official-workflows",
          icon: "folder",
          title: "工作流模板",
          body: "后续承载官方推荐的素材组合与生成流程。",
          assets: [],
        },
      ],
    };

    return foldersByScope[normalizeGlobalScope(scope)];
  }

  root.REELAY_CANVAS_ASSET_LIBRARY_MODEL = Object.freeze({
    normalizeSearch,
    matchesSearch,
    normalizeGlobalScope,
    getAssetCategory,
    countAssetsByCategory,
    getPreferredAssetFilter,
    canvasItemMatchesFilter,
    canvasItemMatchesSearch,
    filterCanvasElementTree,
    countCanvasElementRows,
    buildCanvasElementItems,
    buildGlobalAssetFolders,
    folderMatchesSearch(folder, query = "") {
      return matchesSearch([folder.title, folder.body], query);
    },
  });
})(typeof globalThis === "object" ? globalThis : window);
