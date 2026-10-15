(function registerGenerationStatus(root) {
  "use strict";

  function values({ progress = 0, canCancel = false } = {}) {
    return { progress: Math.max(0, Math.min(99, Math.floor(Number(progress) || 0))), canCancel: Boolean(canCancel) };
  }
  function description(canCancel) {
    return canCancel ? `发送后 ${root.REELAY_PROTOTYPE_CONFIG.generationCancelWindowMs / 1000} 秒内可取消，取消后返还本次积分` : "已进入生成阶段，当前无法取消";
  }
  function escape(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function realContent(state) {
    const labels = { prepared: "准备真实生成", submitting: "提交中", waiting: "生成中", saving: "保存中",
      save_failed: "视频已生成，保存失败", unconfirmed: "结果待确认", failed: "生成失败", succeeded: "已完成" };
    const label = state.channel === "checking" && state.executionStatus !== "failed" ? "检查生成连接" : labels[state.executionStatus] || "生成中";
    return `<span class="generation-status-label">${label}</span>${state.message || state.error ? `<span class="generation-status-description">${escape(state.message || state.error)}</span>` : ""}${state.executionStatus === "save_failed" && state.isOwner !== false ? '<button type="button" class="generation-status-cancel" data-generation-action="retry-save">重试保存</button>' : ""}${state.executionStatus === "prepared" && state.isOwner !== false && state.message ? '<button type="button" class="generation-status-cancel" data-generation-action="resume-generation">继续提交</button>' : ""}`;
  }
  function render(state) {
    if (["real", "checking"].includes(state?.channel)) return `<div class="generation-status is-real" role="status">${realContent(state)}</div>`;
    const { progress, canCancel } = values(state);
    return `<div class="generation-status"><span class="generation-status-progress" role="progressbar" aria-label="生成中" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span class="generation-status-label">生成中</span><span class="generation-status-separator" aria-hidden="true">·</span><span data-generation-progress>${progress}%</span></span><button type="button" class="generation-status-cancel" data-cancel-generation data-generation-action="cancel" aria-label="取消生成" title="${description(canCancel)}" aria-description="${description(canCancel)}"${canCancel ? "" : " disabled"}>取消</button></div>`;
  }
  function update(element, state) {
    const status = element?.matches(".generation-status") ? element : element?.querySelector(".generation-status");
    if (!status) return;
    if (["real", "checking"].includes(state?.channel)) {
      status.classList.add("is-real"); status.setAttribute("role", "status"); status.innerHTML = realContent(state); return;
    }
    if (status.classList.contains("is-real")) { status.outerHTML = render(state); return; }
    const { progress, canCancel } = values(state);
    status.querySelector("[data-generation-progress]").textContent = `${progress}%`;
    status.querySelector('[role="progressbar"]').setAttribute("aria-valuenow", String(progress));
    const cancel = status.querySelector("[data-cancel-generation]");
    cancel.disabled = !canCancel;
    cancel.title = description(canCancel);
    cancel.setAttribute("aria-description", description(canCancel));
  }
  root.REELAY_GENERATION_STATUS = Object.freeze({ render, update });
})(globalThis);
