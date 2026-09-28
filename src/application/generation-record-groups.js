(function registerGenerationRecordGroups(root) {
  "use strict";

  const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);

  function sourceKey(task, taskId, resultId) {
    const scope = task?.scope;
    if (task?.sourceSurface !== "conversation" || !scope?.projectId || !scope.conversationId || !taskId || !resultId) return null;
    return JSON.stringify([scope.projectId, scope.conversationId, taskId, resultId]);
  }

  function groupTasks(tasks = []) {
    const visible = tasks.filter((task) => task?.sourceSurface !== "canvas");
    const roots = new Map();
    const attached = new Set();
    const groups = new Map(visible.map((task) => [task, { root: task, finals: [] }]));
    for (const task of visible) {
      const asset = task.result?.asset || task.result;
      if (task.status !== "succeeded" || asset?.generation?.stage !== "draft") continue;
      const key = sourceKey(task, task.id, asset.generation.resultId || asset.id);
      if (key) roots.set(key, task);
    }
    for (const task of visible) {
      if (task.input?.generationStage !== "final") continue;
      const key = sourceKey(task, task.input.sourceDraftTaskId, task.input.sourceResultId);
      const source = key && roots.get(key);
      if (!source || source === task) continue;
      groups.get(source).finals.push(task);
      attached.add(task);
    }
    return visible.filter((task) => !attached.has(task)).map((task) => groups.get(task));
  }

  function recordForTask(tasks, taskOrId) {
    const id = typeof taskOrId === "string" ? taskOrId : taskOrId?.id;
    return groupTasks(tasks).find((group) => group.root.id === id || group.finals.some((task) => task.id === id)) || null;
  }

  function canRemove(group) {
    return Boolean(group && [group.root, ...group.finals].every((task) => terminalStatuses.has(task.status)));
  }

  root.REELAY_GENERATION_RECORD_GROUPS = Object.freeze({ groupTasks, recordForTask, canRemove });
})(globalThis);
