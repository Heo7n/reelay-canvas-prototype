(function registerPromptOptimization(root) {
  "use strict";

  const failureMessage = "优化未完成，请重试。";

  function freezeCopy(value, ancestors = new Set()) {
    if (value == null || typeof value !== "object") {
      if (["function", "symbol", "bigint"].includes(typeof value)) throw new TypeError("Optimization snapshots must contain data only.");
      return value;
    }
    if (ancestors.has(value)) throw new TypeError("Optimization snapshots must not contain cycles.");
    if (!Array.isArray(value) && Object.prototype.toString.call(value) !== "[object Object]") {
      throw new TypeError("Optimization snapshots must contain plain data only.");
    }
    ancestors.add(value);
    const result = Array.isArray(value) ? value.map((item) => freezeCopy(item, ancestors))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeCopy(item, ancestors)]));
    ancestors.delete(value);
    return Object.freeze(result);
  }

  function normalizeSettings(value = {}) {
    return freezeCopy({
      customInstructions: typeof value.customInstructions === "string" ? value.customInstructions.slice(0, 4000) : "",
    });
  }

  function simulate({ source, settings, version, promptDocument }) {
    const original = source.prompt;
    const rawText = original.content.filter((part) => part.type === "text").map((part) => part.text).join("");
    const preservePattern = /保留原文|不增加|不添加|keep (?:the )?original|do not add/gi;
    const concisePattern = /简洁|精简|简短|concise|brief/gi;
    const preserve = Boolean(settings.customInstructions.match(preservePattern));
    const preferConcise = Boolean(settings.customInstructions.match(concisePattern));
    const content = original.content.map((part) => part.type === "reference" ? { ...part } : {
      type: "text", text: preserve ? part.text : part.text.replace(/[\t ]{2,}/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n"),
    });
    // Add only optional presentation guidance; never invent scene facts or rewrite reference identities.
    const chinese = /[\u3400-\u9fff]/.test(rawText) && !/[\u3040-\u30ff\uac00-\ud7af]/.test(rawText);
    const english = /^[\x00-\x7f\u2010-\u2026]*$/.test(rawText) && /[a-z]/i.test(rawText);
    let additions = [];
    if (!preserve && !preferConcise && (chinese || english)) {
      if (source.model?.type === "video") additions = chinese
        ? ["动态表达：保持上述动作与镜头衔接自然，不改变原有事件顺序。", "动态表达：围绕原文安排动作节奏，保持镜头之间的连续性。"]
        : ["Motion direction: connect the described actions and shots naturally, preserving their sequence.", "Motion direction: keep the pacing and shot continuity consistent with the described actions."];
      else additions = chinese
        ? ["表达要求：以原文中的主体、关系与场景为准，保持描述一致。", "表达要求：清楚呈现原文的重点，保留原有设定与关系。"]
        : ["Direction: keep the subjects, relationships and setting consistent with the original description.", "Direction: clearly convey the original priorities while preserving the existing setting and relationships."];
    }
    const note = additions[(version - 1) % 2];
    const used = content.reduce((length, part) => length + (part.type === "reference" ? 1 : part.text.length), 0);
    const suffix = note ? `\n\n${note}` : "";
    // Never truncate the original to make room for a generated suffix, especially references near 20k.
    if (suffix && used + suffix.length <= promptDocument.limits.length) {
      const last = content[content.length - 1];
      if (last?.type === "text") last.text += suffix;
      else if (content.length < promptDocument.limits.parts) content.push({ type: "text", text: suffix });
    }
    const suggestion = promptDocument.normalize({ version: 1, content });
    let summary = JSON.stringify(suggestion) === JSON.stringify(original)
      ? "保留了原文与素材引用。" : "整理了表达，保留原意与素材引用。";
    const otherInstructions = settings.customInstructions.replace(preservePattern, "").replace(concisePattern, "")
      .replace(/please|请|一些|一点|保持|尽量|[\s，。；、：,.!！?？;:]/gi, "");
    if (otherInstructions) summary += preserve || preferConcise
      ? "已应用可识别的偏好。" : "自定义指令已保留，本次按默认规则整理。";
    return { suggestion, summary };
  }

  function createService(options = {}) {
    const promptDocument = options.promptDocument || root.REELAY_CANVAS_PROMPT_DOCUMENT;
    if (!promptDocument?.normalize || !promptDocument?.isDocument) throw new TypeError("A promptDocument adapter is required.");
    const setTimer = options.setTimer || ((callback, delay) => setTimeout(callback, delay));
    const clearTimer = options.clearTimer || ((timer) => clearTimeout(timer));
    const executor = options.executor || simulate;
    const records = new WeakMap();
    const pending = new Set();
    let disposed = false;

    function document(value) {
      if (typeof value === "string") {
        if (value.replace(/\r\n?/g, "\n").length > promptDocument.limits.length) throw new RangeError("提示词超过长度上限。");
        return promptDocument.normalize(value);
      }
      if (!promptDocument.isDocument(value)) throw new TypeError("提示词格式无效。");
      return promptDocument.normalize(value);
    }

    function notify(name, owner, state) {
      try { options[name]?.(owner, state); } catch { /* View observers cannot change task settlement. */ }
    }

    function current(owner, record) {
      return !disposed && records.get(owner) === record;
    }

    function get(owner) {
      return disposed ? null : records.get(owner)?.state || null;
    }

    function start(owner, source, settings) {
      if (disposed || !owner || !["object", "function"].includes(typeof owner)) return false;
      const previous = get(owner);
      if (previous?.status === "processing") return false;
      const frozenSource = freezeCopy({ ...source, prompt: document(source?.prompt), references: source?.references || [] });
      if (!frozenSource.prompt.content.length) return false;
      const record = { owner, timer: null, state: freezeCopy({
        // The displayed source and suggestion are one pair until a new result succeeds.
        status: "processing", source: previous?.suggestion ? previous.source : frozenSource, suggestion: previous?.suggestion || null,
        settings: normalizeSettings(settings), summary: previous?.summary || "", version: (previous?.version || 0) + 1,
        unread: false, error: "", edited: previous?.edited || false,
      }) };
      records.set(owner, record);
      pending.add(record);
      const finish = () => {
        pending.delete(record);
        record.timer = null;
        if (!current(owner, record)) return;
        try {
          const result = executor({ source: frozenSource, settings: record.state.settings, version: record.state.version, promptDocument });
          const suggestion = document(result?.suggestion);
          const references = (value) => value.content.filter((part) => part.type === "reference").map(({ key, mediaType }) => [key, mediaType]);
          if (JSON.stringify(references(suggestion)) !== JSON.stringify(references(frozenSource.prompt))) {
            throw new Error("优化结果未保留素材引用，请重试。");
          }
          if (!current(owner, record)) return;
          record.state = freezeCopy({ ...record.state, status: "ready", source: frozenSource, suggestion,
            summary: typeof result.summary === "string" ? result.summary : "已生成优化建议。", unread: true, edited: false });
          notify("onChange", owner, record.state);
          if (current(owner, record)) notify("onReady", owner, record.state);
        } catch (error) {
          if (!current(owner, record)) return;
          record.state = freezeCopy({ ...record.state, status: "failed", error: error?.message || failureMessage });
          notify("onChange", owner, record.state);
          if (current(owner, record)) notify("onError", owner, record.state);
        }
      };
      notify("onChange", owner, record.state);
      if (!current(owner, record)) return true;
      try { record.timer = setTimer(finish, Math.max(0, options.delayMs ?? 1800)); }
      catch {
        pending.delete(record);
        record.state = freezeCopy({ ...record.state, status: "failed", error: failureMessage });
        notify("onChange", owner, record.state);
        if (current(owner, record)) notify("onError", owner, record.state);
      }
      return true;
    }

    function edit(owner, value) {
      const record = records.get(owner);
      if (disposed || !record?.state.suggestion || record.state.status === "processing") return false;
      record.state = freezeCopy({ ...record.state, suggestion: document(value), edited: true, unread: false });
      notify("onChange", owner, record.state);
      return true;
    }

    function markRead(owner) {
      const record = records.get(owner);
      if (disposed || !record?.state.unread) return false;
      record.state = freezeCopy({ ...record.state, unread: false });
      notify("onChange", owner, record.state);
      return true;
    }

    function remove(owner) {
      const record = records.get(owner);
      if (!record) return false;
      records.delete(owner);
      pending.delete(record);
      if (record.timer !== null) clearTimer(record.timer);
      return true;
    }

    function dispose() {
      disposed = true;
      for (const record of pending) {
        if (record.timer !== null) clearTimer(record.timer);
        records.delete(record.owner);
      }
      pending.clear();
    }

    return Object.freeze({ start, get, edit, markRead, remove, dispose });
  }

  root.REELAY_PROMPT_OPTIMIZATION_SERVICE = Object.freeze({ createService });
}(typeof globalThis === "object" ? globalThis : window));
