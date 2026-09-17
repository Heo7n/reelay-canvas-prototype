(function registerInspirationMatchingModel(root) {
  "use strict";

  // A bounded, local annotation matcher. These signals rank references; they are
  // not semantic understanding, hard filters, or confidence percentages.
  const fieldGroups = {
    movement: ["movement"], light: ["light"], framing: ["framing"],
    scene: ["title", "summary", "composition"], action: ["title", "summary"],
    composition: ["composition"],
  };
  const groupLabels = { movement: "运镜", light: "光线", framing: "景别", scene: "场景", action: "动作", composition: "构图" };
  const groupWeights = { movement: 4, light: 3, framing: 2, scene: 2, action: 3, composition: 2 };
  const definitions = [
    ["movement", "跟拍", "跟拍|跟随|跟踪镜头|tracking|follow|following", "跟随|随动作移动|随人物移动|tracking|following"],
    ["movement", "推进", "推进|推近|推镜头|push in|push-in|dolly in", "推进|推近|前移|靠近|push in|dolly in"],
    ["movement", "拉远", "拉远|拉镜头|后退|pull out|pull-out|dolly out", "拉远|后退|pull out|dolly out"],
    ["movement", "横移", "横移|横向移动|侧向移动|lateral|truck", "横向|侧向移动|lateral"],
    ["movement", "固定机位", "固定机位|固定镜头|静态镜头|稳定机位|static|locked off", "固定|机位基本稳定|稳定机位|稳定观察|稳定侧面机位|static|locked off"],
    ["movement", "环绕", "环绕|环拍|orbit|orbital", "环绕|环拍|orbit|orbital"],
    ["movement", "手持", "手持|handheld|hand held", "手持|handheld|hand held"],
    ["light", "逆光", "逆光|轮廓光|backlight|backlit|rim light", "逆光|轮廓光|侧后方强光|背后强光|backlight|backlit|rim light"],
    ["light", "自然光", "自然光|日光|白天|daylight|natural light", "日光|自然光|daylight|natural light"],
    ["light", "柔光", "柔光|柔和光|漫射光|阴天|soft light|diffused light|overcast", "柔和|柔光|漫射|阴天|soft light|diffused light|overcast"],
    ["light", "彩色光", "霓虹|彩色光|全息光|neon|colored light", "霓虹|彩色光|全息|neon|colored light"],
    ["light", "暖光", "暖色|暖光|金色光|warm light|warm lighting", "暖色|暖光|金色|warm light|warm lighting"],
    ["light", "冷光", "冷色|冷光|冷蓝|冷灰|cool light|cold light", "冷色|冷光|冷蓝|冷灰|cool light|cold light"],
    ["framing", "特写", "特写|close-up|close up|closeup", "特写|close-up|close up|closeup"],
    ["framing", "远景", "远景|wide shot|long shot", "远景|大全景|wide shot|long shot"],
    ["framing", "中景", "中景|medium shot", "中景|medium shot"],
    ["scene", "海岸", "海边|海岸|沙滩|coast|beach|seaside", "海边|海岸|沙滩|码头|coast|beach|seaside"],
    ["scene", "水下", "水下|underwater", "水下|underwater"],
    ["scene", "城市", "城市|街道|街头|都市|city|urban|street", "城市|老城|街道|街头|city|urban|street"],
    ["scene", "屋顶", "屋顶|楼顶|rooftop", "屋顶|楼顶|rooftop"],
    ["scene", "树林", "树林|森林|forest|woods", "树林|森林|树枝|树干|树冠|forest|woods"],
    ["scene", "草地", "草地|草原|grassland|meadow", "草地|草原|grassland|meadow"],
    ["scene", "沙漠", "沙漠|荒漠|desert", "沙漠|荒漠|沙丘|desert"],
    ["scene", "雪地", "雪地|雪山|snow|snowy", "雪地|雪山|积雪|雪原|snow|snowy"],
    ["scene", "月面", "月面|月球|moon|lunar", "月面|月球|moon|lunar"],
    ["scene", "实验室", "实验室|laboratory|lab", "实验室|laboratory|lab"],
    ["scene", "雨中", "雨夜|雨中|下雨|rain|rainy", "雨夜|雨中|下雨|雨水|rain|rainy"],
    ["action", "奔跑", "奔跑|跑步|跑向|跑去|running|run|sprint", "奔跑|跑向|跑去|跑远|running|run|sprint"],
    ["action", "游泳", "游泳|游动|swimming|swim", "游泳|游动|swimming|swim"],
    ["action", "追逐", "追逐|追赶|chase|chasing", "追逐|追赶|追蝶|chase|chasing"],
    ["action", "攀爬", "攀爬|攀上|climb|climbing", "攀爬|攀上|climb|climbing"],
    ["action", "行驶", "行驶|疾驰|驶过|driving|drive", "行驶|疾驰|驶过|driving|drive"],
    ["action", "转身", "转身|转头|turn around", "转身|转头|转动身体|turn around"],
    ["composition", "留白", "留白|负空间|negative space", "留白|negative space"],
    ["composition", "前景纵深", "前景纵深|前景层次|纵深|foreground|depth", "前景|纵深|foreground|depth"],
  ];

  function normalize(value) {
    return typeof value === "string" ? value.normalize("NFKC").toLowerCase().trim() : "";
  }

  function positiveText(value) {
    // Exclude explicitly negated clauses rather than turning "不要跟拍" into
    // a tracking preference. Conservative scope may omit an ambiguous clause.
    return normalize(value).split(/[，,。.!！？?；;\n]|(?:但是|而是|改为|只要|但)|\b(?:but|instead)\b/u)
      .map((part) => part.replace(/(?:不要|不需要|不用|避免|禁止|排除|不使用|不采用|没有|无须|无需|别用|\b(?:no|not|without|avoid|exclude|never|don['’]t)\b).*$/u, ""))
      .join(" ");
  }

  function contains(text, alias) {
    if (/^[a-z]/u.test(alias)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "u").test(text);
    }
    return text.includes(alias);
  }

  const signals = definitions.map(([group, label, queryAliases, evidenceAliases]) => ({
    id: `${group}:${label}`, group, label,
    queryAliases: queryAliases.split("|"), evidenceAliases: evidenceAliases.split("|"),
  }));

  function requestedSignals(text) {
    const query = positiveText(text);
    return signals.filter((signal) => signal.queryAliases.some((alias) => contains(query, alias)));
  }

  function extract(text) {
    return requestedSignals(text).map(({ id, group, label }) => ({ id, group, label }));
  }

  function preferenceFor(preferences, id) {
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)
      || !Object.prototype.hasOwnProperty.call(preferences, id)) return "normal";
    const value = preferences[id];
    return value === "focus" || value === "removed" ? value : "normal";
  }

  function match({ text = "", clips = [], preferences = {} } = {}) {
    const requested = requestedSignals(text)
      .map((signal) => ({ ...signal, preference: preferenceFor(preferences, signal.id) }))
      .filter((signal) => signal.preference !== "removed");
    if (!requested.length || !Array.isArray(clips)) return [];
    const results = [];
    const seenClips = new Set();
    for (const clip of clips) {
      if (!clip?.id || seenClips.has(clip.id) || !Array.isArray(clip.shots)) continue;
      seenClips.add(clip.id);
      let best = null;
      for (const shot of clip.shots) {
        if (!shot?.id || !Number.isFinite(shot.start) || !Number.isFinite(shot.end)
          || shot.start < 0 || shot.end <= shot.start
          || (Number.isFinite(clip.duration) && shot.end > clip.duration)) continue;
        const matched = requested.filter((signal) => {
          const evidence = fieldGroups[signal.group].map((field) => positiveText(shot[field])).join(" ");
          return signal.evidenceAliases.some((alias) => contains(evidence, alias));
        });
        if (!matched.length) continue;
        // Focus changes relative relevance, never turns a signal into a hard
        // requirement. Removing one ignores its evidence rather than excluding it.
        const score = matched.reduce((sum, signal) => sum + groupWeights[signal.group]
          * (signal.preference === "focus" ? 3 : 1), 0);
        if (!best || score > best.score) {
          best = { clipId: clip.id, shotId: shot.id, start: shot.start, end: shot.end,
            reasons: matched.sort((left, right) => Number(right.preference === "focus")
              - Number(left.preference === "focus"))
              .map((signal) => `${groupLabels[signal.group]}：${signal.label}`), score };
        }
      }
      if (best) results.push(best);
    }
    // Stable ties retain catalog order and the first equally matching shot.
    return results.sort((left, right) => right.score - left.score);
  }

  root.REELAY_CANVAS_INSPIRATION_MATCHING_MODEL = Object.freeze({ extract, match });
})(typeof globalThis === "object" ? globalThis : window);
