(function registerCanvasAgentComposerView(global) {
  "use strict";

  const TYPE_LABELS = { image: "图片", video: "视频", audio: "音频" };

  function createController({ document, composer, addButton, menu, messages, getScope, isBusy,
    getSelectedAssets, onChooseFiles, onLibrary, onAddSelected, onDropFiles, onDropLibrary,
    hasLibraryDrag, closeOtherPopovers, escapeHtml, getAssetLabel, assetPreview, sanitizeUrl,
    referenceStrip, placeAnchoredPopover }) {
    const view = document.defaultView;
    const menuParent = menu.parentNode;
    const menuNext = menu.nextSibling;
    const actions = composer.querySelector(".agent-composer-top-actions");
    const optimize = composer.querySelector("#agentPromptOptimizationBtn");
    const advanced = composer.querySelector("#agentAdvancedBtn");
    let menuScope = null;
    let dragScope = null;
    let dragCanceled = false;
    let renderedScope = null;
    let renderedMessages = [];
    let frame = 0;
    let disposed = false;
    let mode = null;

    function captureScope() {
      const scope = getScope();
      return scope?.projectId && scope.conversation && typeof scope.conversation === "object"
        ? { projectId: scope.projectId, conversation: scope.conversation } : null;
    }

    function current(scope) {
      const active = disposed ? null : captureScope();
      return scope && active && scope.projectId === active.projectId && scope.conversation === active.conversation;
    }

    function available(scope) { return current(scope) && !isBusy(); }

    function setMenuOpen(open) {
      if (!open || disposed || isBusy() || !addButton.isConnected) {
        menuScope = null;
        menu.hidden = true;
        menu.classList.add("hidden");
        addButton.classList.remove("active");
        addButton.setAttribute("aria-expanded", "false");
        if (frame) view.cancelAnimationFrame(frame);
        frame = 0;
        return false;
      }
      const scope = captureScope();
      if (!scope) return setMenuOpen(false);
      closeOtherPopovers();
      menuScope = scope;
      menu.querySelector('[data-agent-reference-source="canvas"]').disabled = !getSelectedAssets().length;
      menu.hidden = false;
      menu.classList.remove("hidden");
      menu.style.position = "fixed";
      menu.dataset.wheelScope = "local";
      document.body.append(menu);
      addButton.classList.add("active");
      addButton.setAttribute("aria-expanded", "true");
      positionMenu();
      return Boolean(menuScope);
    }

    function positionMenu() {
      if (!available(menuScope) || !composer.isConnected || !addButton.isConnected) {
        setMenuOpen(false); return;
      }
      const anchor = addButton.getBoundingClientRect();
      const style = view.getComputedStyle(composer);
      if (!anchor.width || !anchor.height || anchor.bottom <= 0 || anchor.top >= view.innerHeight
        || anchor.right <= 0 || anchor.left >= view.innerWidth || composer.hidden || composer.inert
        || style.display === "none" || style.visibility === "hidden") {
        setMenuOpen(false); return;
      }
      menu.style.maxWidth = `${Math.max(0, view.innerWidth - 24)}px`;
      menu.style.maxHeight = `${Math.max(0, view.innerHeight - 24)}px`;
      const placement = placeAnchoredPopover({
        anchor, floating: menu.getBoundingClientRect(),
        boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
        placements: ["top-start", "bottom-start"], padding: 12, gap: 8,
      });
      if (!placement) { setMenuOpen(false); return; }
      menu.style.left = `${placement.left}px`;
      menu.style.top = `${placement.top}px`;
      menu.dataset.placement = placement.placement;
      if (!frame) frame = view.requestAnimationFrame(() => { frame = 0; positionMenu(); });
    }

    function menuButtons() { return [...menu.querySelectorAll("button:not(:disabled)")]; }

    function onAddClick(event) {
      event.stopPropagation();
      const opened = setMenuOpen(!menuScope);
      if (opened && event.detail === 0) menuButtons()[0]?.focus({ preventScroll: true });
    }

    function onMenuClick(event) {
      const button = event.target.closest?.("[data-agent-reference-source]");
      if (!button || !menu.contains(button)) return;
      event.stopPropagation();
      const scope = menuScope;
      if (button.disabled || !available(scope)) { setMenuOpen(false); return; }
      const source = button.dataset.agentReferenceSource;
      setMenuOpen(false);
      if (source === "local") onChooseFiles(scope);
      else if (source === "library") onLibrary(scope);
      else if (source === "canvas") onAddSelected(getSelectedAssets(), scope);
    }

    function onOutsidePointer(event) {
      if (menuScope && !menu.contains(event.target) && !addButton.contains(event.target)) setMenuOpen(false);
    }

    function onKeyDown(event) {
      if (event.isComposing) return;
      if (!menuScope && event.target === addButton && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (setMenuOpen(true)) {
          const buttons = menuButtons();
          (event.key === "ArrowUp" ? buttons.at(-1) : buttons[0])?.focus({ preventScroll: true });
        }
        return;
      }
      if (!menuScope) return;
      if (event.key === "Escape") {
        const restoreFocus = current(menuScope);
        event.preventDefault(); event.stopImmediatePropagation();
        setMenuOpen(false);
        if (restoreFocus) addButton.focus({ preventScroll: true });
      } else if (menu.contains(event.target) && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const buttons = menuButtons();
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }
    }

    function onFocusIn(event) {
      if (menuScope && !menu.contains(event.target) && !addButton.contains(event.target)) setMenuOpen(false);
    }

    function dropKind(transfer) {
      if (!transfer) return null;
      if (Array.from(transfer.types || []).includes("Files") || transfer.files?.length) return "files";
      return hasLibraryDrag(transfer) ? "library" : null;
    }

    function clearDrop() {
      dragScope = null;
      dragCanceled = false;
      composer.classList.remove("agent-reference-drop-active");
    }

    function cancelDrop() {
      if (dragScope) dragCanceled = true;
      composer.classList.remove("agent-reference-drop-active");
    }

    function onOutsideDrop(event) {
      if (!composer.contains(event.target)) clearDrop();
    }

    function onDragOver(event) {
      if (!dropKind(event.dataTransfer)) return;
      event.preventDefault(); event.stopPropagation();
      if (!dragScope) dragScope = captureScope();
      const accepted = !dragCanceled && available(dragScope);
      event.dataTransfer.dropEffect = accepted ? "copy" : "none";
      composer.classList.toggle("agent-reference-drop-active", Boolean(accepted));
    }

    function onDragLeave(event) {
      if (!composer.contains(event.relatedTarget)) composer.classList.remove("agent-reference-drop-active");
    }

    function onDrop(event) {
      const kind = dropKind(event.dataTransfer);
      if (!kind) return;
      event.preventDefault(); event.stopPropagation();
      const scope = dragScope || captureScope();
      const accepted = !dragCanceled && available(scope);
      clearDrop();
      if (!accepted) return;
      setMenuOpen(false);
      if (kind === "files") onDropFiles(Array.from(event.dataTransfer.files || []), scope);
      else onDropLibrary(event.dataTransfer, scope);
    }

    function referenceEntries(message) {
      const source = Array.isArray(message?.referenceSnapshot) ? message.referenceSnapshot
        : (Array.isArray(message?.references) ? message.references : []).filter((asset) => typeof asset?.id === "string")
          .map((asset) => ({ key: `asset:${asset.id}`, asset }));
      const entries = source.filter((entry) => entry?.asset && Object.hasOwn(TYPE_LABELS, entry.asset.type))
        .map((entry) => ({ ...entry, label: entry.name || getAssetLabel(entry.asset),
          asset: { ...entry.asset, url: sanitizeUrl(entry.asset.url) } }));
      return global.REELAY_CANVAS_PROMPT_DOCUMENT.referenceIndex(entries);
    }

    function referencesMarkup(message, index) {
      const entries = referenceEntries(message);
      if (!entries.length) return "";
      return `<div class="agent-message-reference-shelf asset-shelf" data-agent-message-references="${index}" role="group" aria-label="已发送的参考素材">
        ${entries.map((entry) => `<div class="asset-card agent-reference-card ${entry.mediaType}"
          data-reference-key="${escapeHtml(entry.key)}" data-reference-locked="true" role="button" tabindex="0"
          aria-label="${escapeHtml(entry.label)}：${escapeHtml(entry.name)}，可预览">
          <div class="asset-thumb">${assetPreview(entry.asset)}</div><span class="reference-number" aria-hidden="true">${entry.ordinal}</span>
        </div>`).join("")}</div>`;
    }

    function messageBodyMarkup(message) {
      const model = global.REELAY_CANVAS_PROMPT_DOCUMENT;
      if (!model.isDocument(message.promptDocument)) return escapeHtml(String(message.content ?? "")).replaceAll("\n", "<br>");
      const entries = new Map(referenceEntries(message).map((entry) => [entry.key, entry]));
      return message.promptDocument.content.map((part) => {
        if (part.type === "text") return escapeHtml(part.text).replaceAll("\n", "<br>");
        const entry = entries.get(part.key);
        const available = entry?.mediaType === part.mediaType && Boolean(entry.asset.url);
        const label = available ? entry.label : `${part.fallbackLabel} · 已移除`;
        const title = available ? `${entry.label}：${entry.name}` : label;
        const thumb = available && entry.mediaType === "image" ? assetPreview(entry.asset)
          : `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${part.mediaType === "video" ? "m6 4 6 4-6 4Z"
            : part.mediaType === "audio" ? "M3 6v4m3-7v10m4-9v8m3-6v4" : "M3 3h10v10H3zM3 10l3-3 4 6m-1-4 2-2 2 3"}"/></svg>`;
        return `<span class="prompt-reference${available ? "" : " is-missing"}" data-reference-key="${escapeHtml(part.key)}"
          data-media-type="${part.mediaType}" contenteditable="false" role="button" tabindex="0"
          title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}${available ? "，预览" : ""}"><span class="prompt-reference-thumb" aria-hidden="true">${thumb}</span><span class="prompt-reference-label">${escapeHtml(label)}</span></span>`;
      }).join("");
    }

    const sentPreviews = referenceStrip.createController({
      document, root: messages, placeAnchoredPopover,
      isCardEligible: (card) => Boolean(card.closest(".agent-message-reference-shelf")
        || (card.matches(".prompt-reference:not(.is-missing)") && card.closest(".agent-message-body"))),
      getContext(card) {
        if (!current(renderedScope)) return null;
        const index = Number(card.closest("[data-agent-message-index]")?.dataset.agentMessageIndex);
        const message = renderedMessages[index];
        if (!message || message !== renderedScope.conversation.messages[index]) return null;
        return { scope: renderedScope.projectId, node: message, nodeId: String(index), canReorder: false,
          entries: referenceEntries(message).map((entry) => ({ ...entry, label: `${entry.label} · ${entry.name}` })) };
      },
      onMove: () => false,
    });

    function renderMessages(conversation) {
      sentPreviews.close();
      renderedScope = captureScope();
      renderedMessages = current(renderedScope) && conversation === renderedScope.conversation
        && Array.isArray(conversation.messages) ? [...conversation.messages] : [];
      if (!renderedMessages.length) { messages.replaceChildren(); return; }
      messages.innerHTML = `<div class="agent-message-list">${renderedMessages.map((message, index) => {
        const role = message.role === "user" ? "user" : "agent";
        return `<div class="agent-message ${role}" data-agent-message-index="${index}"><div class="agent-message-role">${role === "user" ? "你" : "Reelay Agent"}</div>
          <div class="agent-message-body">${messageBodyMarkup(message)}</div>
          ${referencesMarkup(message, index)}</div>`;
      }).join("")}</div>`;
      messages.scrollTop = messages.scrollHeight;
    }

    function syncMode(nextMode) {
      const generation = nextMode === "generation";
      composer.dataset.composerMode = generation ? "generation" : "agent";
      for (const element of [actions, optimize, advanced]) {
        if (!element) continue;
        element.hidden = !generation;
        element.classList.toggle("hidden", !generation);
      }
      if (advanced) advanced.disabled = !generation || isBusy();
      if (optimize && (!generation || isBusy())) optimize.disabled = true;
      if (mode !== nextMode) close();
      mode = nextMode;
    }

    function close() { setMenuOpen(false); cancelDrop(); sentPreviews.close(); }

    function dispose() {
      if (disposed) return;
      close(); disposed = true;
      clearDrop();
      sentPreviews.dispose();
      for (const [target, name, handler, capture] of listeners) target.removeEventListener(name, handler, capture);
      if (menuParent?.isConnected) menuParent.insertBefore(menu, menuNext?.parentNode === menuParent ? menuNext : null);
      else menu.remove();
      renderedScope = null; renderedMessages = [];
    }

    function onPageHide(event) { if (event.persisted) close(); else dispose(); }

    const listeners = [
      [addButton, "click", onAddClick, false], [menu, "click", onMenuClick, false],
      [document, "pointerdown", onOutsidePointer, true], [document, "keydown", onKeyDown, true],
      [document, "focusin", onFocusIn, false], [composer, "dragenter", onDragOver, false],
      [composer, "dragover", onDragOver, false], [composer, "dragleave", onDragLeave, false],
      [composer, "drop", onDrop, false], [view, "dragend", clearDrop, false],
      [document, "dragstart", clearDrop, true], [document, "drop", onOutsideDrop, true],
      [view, "blur", close, false], [view, "pagehide", onPageHide, false],
    ];
    for (const [target, name, handler, capture] of listeners) target.addEventListener(name, handler, capture);
    addButton.setAttribute("aria-controls", menu.id);
    addButton.setAttribute("aria-haspopup", "menu");
    setMenuOpen(false);

    return Object.freeze({ setMenuOpen, syncMode, renderMessages, renderPrompt: messageBodyMarkup, close, dispose });
  }

  global.REELAY_CANVAS_AGENT_COMPOSER_VIEW = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
