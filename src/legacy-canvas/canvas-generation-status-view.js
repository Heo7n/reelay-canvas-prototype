(function registerGenerationStatus(root) {
  "use strict";

  function values({ progress = 0, canCancel = false } = {}) {
    return { progress: Math.max(0, Math.min(99, Math.floor(Number(progress) || 0))), canCancel: Boolean(canCancel) };
  }
  function description(canCancel) {
    return canCancel ? "发送后 7 秒内可取消，取消后返还本次积分" : "已进入生成阶段，当前无法取消";
  }
  function render(state) {
    const { progress, canCancel } = values(state);
    return `<div class="generation-status"><span class="generation-status-progress" role="progressbar" aria-label="生成中" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span class="generation-status-label">生成中</span><span class="generation-status-separator" aria-hidden="true">·</span><span data-generation-progress>${progress}%</span></span><button type="button" class="generation-status-cancel" data-cancel-generation data-generation-action="cancel" aria-label="取消生成" title="${description(canCancel)}" aria-description="${description(canCancel)}"${canCancel ? "" : " disabled"}>取消</button></div>`;
  }
  function update(element, state) {
    const status = element?.matches(".generation-status") ? element : element?.querySelector(".generation-status");
    if (!status) return;
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
