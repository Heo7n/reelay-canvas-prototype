(function (root) {
  "use strict";

  function createController({ list, seed, escapeHtml, refreshIcons, onSelect, onRename, requestDelete }) {
    const conversations = structuredClone(seed);
    let activeId = conversations[0]?.id;
    let editingId = null;
    let sequence = 0;

    function newConversation() {
      let id;
      do { id = `local-chat-${++sequence}`; } while (conversations.some((item) => item.id === id));
      const conversation = { id, title: "新对话", messages: [] };
      conversations.unshift(conversation);
      return conversation;
    }
    if (!conversations.length) activeId = newConversation().id;

    const getConversation = (id = activeId) => conversations.find((item) => item.id === id);
    const getRow = (id) => [...list.querySelectorAll("[data-chat-id]")].find((row) => row.dataset.chatId === id);

    function focusRow(id, action = "select") {
      const row = getRow(id);
      const target = row && !row.hidden && row.querySelector(`[data-history-action="${action}"]`);
      (target || list.querySelector(".history-select"))?.focus({ preventScroll: true });
    }

    function rowMarkup(conversation) {
      const { id, title } = conversation;
      const escapedTitle = escapeHtml(title);
      const selected = id === activeId;
      let content;
      if (id === editingId) {
        content = `<input class="history-rename-input" type="text" maxlength="80" value="${escapedTitle}" aria-label="对话名称" />`;
      } else {
        content = `<button class="history-select" type="button" data-history-action="select" aria-current="${selected}" title="${escapedTitle}">${escapedTitle}</button>
          <div class="history-row-end">
            ${selected ? '<i class="history-current-check" data-lucide="check" aria-hidden="true"></i>' : ""}
            <div class="history-actions">
              <button type="button" data-history-action="rename" aria-label="重命名：${escapedTitle}" title="重命名"><i data-lucide="pencil" aria-hidden="true"></i></button>
              <button type="button" data-history-action="delete" aria-label="删除：${escapedTitle}" title="删除" aria-haspopup="dialog"><i data-lucide="trash-2" aria-hidden="true"></i></button>
            </div>
          </div>`;
      }
      return `<div class="history-item${selected ? " active" : ""}${id === editingId ? " is-editing" : ""}" data-chat-id="${escapeHtml(id)}">${content}</div>`;
    }

    function render() {
      const scrollTop = list.scrollTop;
      list.innerHTML = conversations.map(rowMarkup).join("");
      list.scrollTop = scrollTop;
      refreshIcons();
    }

    function renderRow(id) {
      const row = getRow(id);
      const conversation = getConversation(id);
      if (row && conversation) row.outerHTML = rowMarkup(conversation);
      refreshIcons();
    }

    function deleteConversation(id) {
      const index = conversations.findIndex((item) => item.id === id);
      if (index < 0) return;
      conversations.splice(index, 1);
      const next = conversations[Math.min(index, conversations.length - 1)] || newConversation();
      if (activeId === id) select(next.id, { closeMenu: false });
      else render();
    }

    function finishRename(save, { focus = false } = {}) {
      if (!editingId) return;
      const id = editingId;
      const value = getRow(id)?.querySelector("input")?.value.trim();
      const conversation = getConversation(id);
      editingId = null;
      if (save && value && conversation && conversation.title !== value) {
        conversation.title = value;
        onRename(conversation);
      }
      // Preserve other rows so blur cannot detach the user's next click target.
      renderRow(id);
      if (focus) focusRow(id, "rename");
    }

    function close() {
      if (editingId) finishRename(true);
    }

    function select(id, { closeMenu = true } = {}) {
      const conversation = getConversation(id);
      if (!conversation) return;
      close();
      activeId = id;
      render();
      onSelect(conversation, { closeMenu });
    }

    function startNew() {
      close();
      const empty = conversations.find((item) => !item.messages.length && item.title === "新对话");
      select((empty || newConversation()).id);
    }

    function handleEscape() {
      if (editingId) {
        finishRename(false, { focus: true });
        return true;
      }
      return false;
    }

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-history-action]");
      const row = button?.closest("[data-chat-id]");
      if (!row) return;
      event.stopPropagation();
      const id = row.dataset.chatId;
      const action = button.dataset.historyAction;
      if (editingId) finishRename(true);
      if (action === "select") select(id);
      if (action === "rename") {
        editingId = id;
        renderRow(id);
        const input = getRow(id)?.querySelector("input");
        input?.focus();
        input?.select();
      }
      if (action === "delete") {
        requestDelete({ conversation: getConversation(id), onConfirm: () => deleteConversation(id) });
      }
    });
    list.addEventListener("keydown", (event) => {
      if (!event.target.matches(".history-rename-input") || event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finishRename(true, { focus: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleEscape();
      }
    });
    list.addEventListener("focusout", (event) => {
      if (editingId && event.target.matches(".history-rename-input")) finishRename(true);
    });

    return { render, select, startNew, close, handleEscape, getConversation, getActiveId: () => activeId };
  }

  root.REELAY_AGENT_HISTORY = Object.freeze({ createController });
})(globalThis);
