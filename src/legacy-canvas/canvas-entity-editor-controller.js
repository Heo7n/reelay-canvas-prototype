(function registerCanvasEntityEditorController(root) {
  "use strict";

  function requireFunction(value, label) {
    if (typeof value !== "function") throw new TypeError(`${label} must be a function.`);
    return value;
  }

  function createCanvasEntityEditorController(options = {}) {
    const host = options.host;
    const pickerHost = options.pickerHost;
    const uploadInput = options.uploadInput;
    const model = options.model;
    const view = options.view;
    if (!host || !pickerHost || !uploadInput || !model?.createCanvasEntityEditorDraft
      || !view?.renderEntityEditor || !view?.renderMediaPicker) {
      throw new TypeError("Canvas Entity editor controller dependencies are incomplete.");
    }
    const getAvailableMedia = requireFunction(options.getAvailableMedia, "getAvailableMedia");
    const persistFiles = requireFunction(options.persistFiles, "persistFiles");
    const renameMedia = requireFunction(options.renameMedia, "renameMedia");
    const saveEntity = requireFunction(options.saveEntity, "saveEntity");
    const confirmDiscard = typeof options.confirmDiscard === "function" ? options.confirmDiscard : () => true;
    const onVisibilityChange = typeof options.onVisibilityChange === "function" ? options.onVisibilityChange : () => undefined;
    const onSaved = typeof options.onSaved === "function" ? options.onSaved : () => undefined;
    const onError = typeof options.onError === "function" ? options.onError : () => undefined;
    const refreshIcons = typeof options.refreshIcons === "function" ? options.refreshIcons : () => undefined;
    const basePermissions = Object.freeze({
      mutable: options.mutable !== false,
      canAddFromLibrary: options.canAddFromLibrary !== false,
      canUpload: options.canUpload !== false,
    });

    let draft = null;
    let mode = "create";
    let entityId = null;
    let submitting = false;
    let uploading = false;
    let mediaRenameBusy = false;
    let renamingMediaId = null;
    let mediaRenameValue = "";
    let mediaRenameExtension = "";
    let errors = {};
    let pickerOpen = false;
    let pickerQuery = "";
    let pickerFilter = "all";
    let pickerSelectedIds = new Set();
    let pickerMedia = [];
    let permissions = { ...basePermissions };

    function isBusy() {
      return submitting || uploading || mediaRenameBusy;
    }

    function canEditDraft() {
      return Boolean(draft) && permissions.mutable && !isBusy();
    }

    function clearErrors(...names) {
      if (!names.some((name) => Object.prototype.hasOwnProperty.call(errors, name))) return;
      errors = { ...errors };
      names.forEach((name) => delete errors[name]);
    }

    function setHostVisibility(target, visible) {
      target.hidden = !visible;
      target.toggleAttribute("inert", !visible);
      target.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function currentMedia() {
      return draft ? draft.listMedia("all") : [];
    }

    function renderEditor({ focus = null } = {}) {
      if (!draft) {
        host.innerHTML = "";
        setHostVisibility(host, false);
        return;
      }
      const state = draft.getState();
      const media = currentMedia();
      host.innerHTML = view.renderEntityEditor({
        ...state,
        entity: { id: entityId, name: state.name, description: state.description, coverMediaId: state.coverMediaId },
        media,
        previewMedia: media.find((item) => item.id === state.selectedPreviewId) || null,
        mutable: permissions.mutable,
        canAddFromLibrary: permissions.canAddFromLibrary,
        canUpload: permissions.canUpload,
        submitting,
        uploading,
        mediaRenameBusy,
        renamingMediaId,
        mediaRenameValue,
        errors,
      });
      setHostVisibility(host, true);
      refreshIcons();
      if (focus) {
        queueMicrotask(() => {
          const element = host.querySelector(focus);
          element?.focus();
          if (element?.select && (focus.includes("name") || focus.includes("preview-rename"))) element.select();
        });
      }
    }

    function splitFileName(value) {
      const name = String(value || "");
      const extensionIndex = name.lastIndexOf(".");
      if (extensionIndex <= 0 || extensionIndex === name.length - 1) {
        return { baseName: name, extension: "" };
      }
      return { baseName: name.slice(0, extensionIndex), extension: name.slice(extensionIndex) };
    }

    function startMediaRename(mediaId) {
      if (!canEditDraft()) return;
      const media = currentMedia().find((item) => item.id === mediaId);
      if (!media) return;
      const parts = splitFileName(media.name || media.displayName);
      renamingMediaId = media.id;
      mediaRenameValue = parts.baseName;
      mediaRenameExtension = parts.extension;
      renderEditor({ focus: "[data-entity-editor-preview-rename]" });
    }

    async function finishMediaRename(input, { cancel = false } = {}) {
      const mediaId = renamingMediaId;
      if (!mediaId || mediaRenameBusy) return false;
      if (cancel) {
        renamingMediaId = null;
        mediaRenameValue = "";
        mediaRenameExtension = "";
        renderEditor({ focus: "[data-entity-editor-preview-name]" });
        return false;
      }
      const baseName = String(input?.value ?? mediaRenameValue).trim();
      if (!baseName) {
        onError(new Error("文件名称不能为空"));
        renderEditor({ focus: "[data-entity-editor-preview-rename]" });
        return false;
      }
      const displayName = `${baseName}${mediaRenameExtension}`;
      if (displayName.length > 300) {
        onError(new Error("文件名称不能超过 300 个字符"));
        renderEditor({ focus: "[data-entity-editor-preview-rename]" });
        return false;
      }
      const current = currentMedia().find((item) => item.id === mediaId);
      if (!current || displayName === String(current.name || current.displayName || "")) {
        renamingMediaId = null;
        mediaRenameValue = "";
        mediaRenameExtension = "";
        renderEditor({ focus: "[data-entity-editor-preview-name]" });
        return false;
      }

      mediaRenameBusy = true;
      mediaRenameValue = baseName;
      renderEditor();
      try {
        const updated = await renameMedia({ mediaId, displayName, media: current });
        draft?.renameMedia(mediaId, updated?.displayName || updated?.name || displayName);
        renamingMediaId = null;
        mediaRenameValue = "";
        mediaRenameExtension = "";
        mediaRenameBusy = false;
        if (draft) renderEditor({ focus: "[data-entity-editor-preview-name]" });
        return true;
      } catch (error) {
        mediaRenameBusy = false;
        onError(error);
        if (draft) renderEditor({ focus: "[data-entity-editor-preview-rename]" });
        return false;
      }
    }

    function syncTextState() {
      if (!draft) return;
      const state = draft.getState();
      const title = host.querySelector("#canvasEntityEditorTitle");
      if (title) {
        title.textContent = state.title;
        title.title = state.title;
      }
      const submit = host.querySelector("[data-entity-editor-submit]");
      if (submit) {
        const disabled = isBusy() || !permissions.mutable || !state.valid;
        submit.disabled = disabled;
        submit.setAttribute("aria-disabled", String(disabled));
      }
      if (!errors.name) {
        const nameInput = host.querySelector("[data-entity-editor-name]");
        nameInput?.removeAttribute("aria-invalid");
        nameInput?.removeAttribute("aria-describedby");
        host.querySelector("#canvasEntityEditorNameError")?.remove();
      }
    }

    function availablePickerMedia() {
      const referenced = new Set(currentMedia().map((item) => item.id));
      return Array.from(getAvailableMedia() || []).filter((item) => item && !referenced.has(String(item.id || "")));
    }

    function renderPicker({ focusSearch = false, focusFilter = null } = {}) {
      if (!pickerOpen) {
        pickerHost.innerHTML = "";
        setHostVisibility(pickerHost, false);
        return;
      }
      pickerMedia = availablePickerMedia();
      pickerHost.innerHTML = view.renderMediaPicker({
        media: pickerMedia,
        query: pickerQuery,
        filter: pickerFilter,
        selectedIds: pickerSelectedIds,
        mutable: permissions.mutable && permissions.canAddFromLibrary,
      });
      setHostVisibility(pickerHost, true);
      refreshIcons();
      if (focusSearch) {
        queueMicrotask(() => {
          const input = pickerHost.querySelector("[data-entity-picker-search]");
          input?.focus();
          if (input?.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
        });
      } else if (focusFilter) {
        queueMicrotask(() => pickerHost.querySelector(`[data-entity-picker-filter="${focusFilter}"]`)?.focus());
      }
    }

    function closePicker() {
      pickerOpen = false;
      pickerQuery = "";
      pickerFilter = "all";
      pickerSelectedIds.clear();
      renderPicker();
      queueMicrotask(() => host.querySelector("[data-entity-editor-add-from-library]")?.focus());
    }

    function openPicker() {
      if (!canEditDraft() || !permissions.canAddFromLibrary) return;
      pickerOpen = true;
      pickerQuery = "";
      pickerFilter = "all";
      pickerSelectedIds = new Set();
      renderPicker({ focusSearch: true });
    }

    function finishClose() {
      draft = null;
      entityId = null;
      submitting = false;
      uploading = false;
      mediaRenameBusy = false;
      renamingMediaId = null;
      mediaRenameValue = "";
      mediaRenameExtension = "";
      errors = {};
      closePicker();
      renderEditor();
      onVisibilityChange(false);
    }

    async function requestClose() {
      if (!draft || submitting || uploading) return false;
      if (pickerOpen) {
        closePicker();
        return false;
      }
      if (draft.isDirty() && !(await Promise.resolve(confirmDiscard()))) return false;
      draft.cancel();
      finishClose();
      return true;
    }

    async function submit() {
      if (!canEditDraft()) return;
      let payload;
      try {
        payload = draft.createCommitPayload();
      } catch (error) {
        errors = { ...(error?.errors || {}) };
        renderEditor({ focus: errors.name ? "[data-entity-editor-name]" : null });
        return;
      }
      errors = {};
      submitting = true;
      renderEditor();
      try {
        const entity = await saveEntity({ mode, entityId, ...payload });
        onSaved(entity);
        finishClose();
      } catch (error) {
        submitting = false;
        onError(error);
        renderEditor();
      }
    }

    function open(input = {}) {
      if (draft) finishClose();
      mode = input.mode === "edit" ? "edit" : "create";
      entityId = mode === "edit" ? String(input.entity?.id || "").trim() : null;
      errors = {};
      submitting = false;
      uploading = false;
      mediaRenameBusy = false;
      renamingMediaId = null;
      mediaRenameValue = "";
      mediaRenameExtension = "";
      permissions = {
        mutable: basePermissions.mutable && input.mutable !== false,
        canAddFromLibrary: basePermissions.canAddFromLibrary && input.canAddFromLibrary !== false,
        canUpload: basePermissions.canUpload && input.canUpload !== false,
      };
      const draftOptions = {
        mode,
        entity: input.entity,
        media: Array.isArray(input.media) ? input.media : [],
      };
      if (Object.prototype.hasOwnProperty.call(input, "expectedVersion")) {
        draftOptions.expectedVersion = input.expectedVersion;
      }
      draft = model.createCanvasEntityEditorDraft(draftOptions);
      onVisibilityChange(true);
      renderEditor({ focus: "[data-entity-editor-name]" });
      return draft.getState();
    }

    function moveFilterFromKey(event, container, selector, dataKey, onChange) {
      const current = event.target.closest?.(selector);
      if (!current || current.disabled) return false;
      const buttons = Array.from(container.querySelectorAll(selector)).filter((button) => !button.disabled);
      const currentIndex = buttons.indexOf(current);
      if (currentIndex < 0 || buttons.length === 0) return false;
      let nextIndex;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = buttons.length - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      else return false;
      event.preventDefault();
      const nextFilter = buttons[nextIndex]?.dataset?.[dataKey];
      if (nextFilter) onChange(nextFilter);
      return Boolean(nextFilter);
    }

    host.addEventListener("keydown", (event) => {
      if (!draft) return;
      const renameInput = event.target.closest?.("[data-entity-editor-preview-rename]");
      if (renameInput) {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          void finishMediaRename(renameInput);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          void finishMediaRename(renameInput, { cancel: true });
        }
        return;
      }
      if (isBusy()) return;
      const previewName = event.target.closest?.("[data-entity-editor-preview-name]");
      if (previewName && (event.key === "Enter" || event.key === "F2")) {
        event.preventDefault();
        startMediaRename(previewName.dataset.entityEditorPreviewName);
        return;
      }
      moveFilterFromKey(
        event,
        host,
        "[data-entity-editor-filter]",
        "entityEditorFilter",
        (filter) => {
          draft.setFilter(filter);
          renderEditor({ focus: `[data-entity-editor-filter="${filter}"]` });
        },
      );
    });

    host.addEventListener("input", (event) => {
      if (!canEditDraft()) return;
      if (event.target.matches("[data-entity-editor-preview-rename]")) {
        mediaRenameValue = event.target.value;
      } else if (event.target.matches("[data-entity-editor-name]")) {
        draft.setName(event.target.value);
        clearErrors("name");
        syncTextState();
      } else if (event.target.matches("[data-entity-editor-description]")) {
        draft.setDescription(event.target.value);
        clearErrors("description");
        syncTextState();
      }
    });

    host.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-entity-editor-form]")) return;
      event.preventDefault();
      void submit();
    });

    host.addEventListener("dblclick", (event) => {
      if (!draft || isBusy()) return;
      const previewName = event.target.closest?.("[data-entity-editor-preview-name]");
      if (previewName) startMediaRename(previewName.dataset.entityEditorPreviewName);
    });

    host.addEventListener("focusout", (event) => {
      if (event.target.matches?.("[data-entity-editor-preview-rename]")) {
        void finishMediaRename(event.target);
      }
    });

    host.addEventListener("click", (event) => {
      if (!draft) return;
      if (event.target.closest("[data-entity-editor-cancel]")) {
        void requestClose();
        return;
      }
      if (isBusy()) return;
      const filter = event.target.closest("[data-entity-editor-filter]")?.dataset.entityEditorFilter;
      if (filter) {
        draft.setFilter(filter);
        renderEditor({ focus: `[data-entity-editor-filter="${filter}"]` });
        return;
      }
      const select = event.target.closest("[data-entity-editor-media-select]")?.dataset.entityEditorMediaSelect;
      if (select) {
        draft.selectPreview(select);
        renderEditor();
        return;
      }
      const remove = event.target.closest("[data-entity-editor-media-remove]")?.dataset.entityEditorMediaRemove;
      if (remove && permissions.mutable) {
        draft.removeMedia(remove);
        clearErrors("media", "coverMediaId");
        renderEditor();
        return;
      }
      const cover = event.target.closest("[data-entity-editor-set-cover]")?.dataset.entityEditorSetCover;
      if (cover && permissions.mutable) {
        try {
          draft.setCover(cover);
          clearErrors("coverMediaId");
          renderEditor();
        } catch (error) {
          onError(error);
        }
        return;
      }
      if (event.target.closest("[data-entity-editor-add-from-library]")) {
        openPicker();
        return;
      }
      if (event.target.closest("[data-entity-editor-upload]") && permissions.mutable && permissions.canUpload) {
        uploadInput.click();
      }
    });

    pickerHost.addEventListener("input", (event) => {
      if (!pickerOpen || !event.target.matches("[data-entity-picker-search]")) return;
      pickerQuery = event.target.value;
      renderPicker({ focusSearch: true });
    });

    pickerHost.addEventListener("keydown", (event) => {
      if (!pickerOpen) return;
      moveFilterFromKey(
        event,
        pickerHost,
        "[data-entity-picker-filter]",
        "entityPickerFilter",
        (filter) => {
          pickerFilter = filter;
          renderPicker({ focusFilter: filter });
        },
      );
    });

    pickerHost.addEventListener("click", (event) => {
      if (!pickerOpen) return;
      if (event.target.closest("[data-entity-picker-cancel]")) {
        closePicker();
        return;
      }
      const filter = event.target.closest("[data-entity-picker-filter]")?.dataset.entityPickerFilter;
      if (filter) {
        pickerFilter = filter;
        renderPicker({ focusFilter: filter });
        return;
      }
      const toggle = event.target.closest("[data-entity-picker-toggle]")?.dataset.entityPickerToggle;
      if (toggle) {
        if (pickerSelectedIds.has(toggle)) pickerSelectedIds.delete(toggle);
        else pickerSelectedIds.add(toggle);
        renderPicker();
        return;
      }
      if (event.target.closest("[data-entity-picker-confirm]")) {
        const selected = pickerMedia.filter((item) => pickerSelectedIds.has(String(item.id)));
        if (selected.length) {
          draft.addMediaBatch(selected);
          clearErrors("media", "coverMediaId");
        }
        closePicker();
        renderEditor();
      }
    });

    uploadInput.addEventListener("change", () => {
      const files = Array.from(uploadInput.files || []);
      uploadInput.value = "";
      if (!canEditDraft() || !permissions.canUpload || files.length === 0) return;
      uploading = true;
      renderEditor();
      void Promise.resolve(persistFiles(files)).then(
        (media) => {
          uploading = false;
          if (!draft) return;
          if (Array.isArray(media) && media.length) {
            draft.addUploadedMedia(media);
            clearErrors("media", "coverMediaId");
          }
          renderEditor();
        },
        (error) => {
          uploading = false;
          onError(error);
          if (draft) renderEditor();
        },
      );
    });

    const handleKeydown = (event) => {
      if (!draft || event.key !== "Escape") return;
      event.preventDefault();
      if (pickerOpen) closePicker();
      else void requestClose();
    };
    document.addEventListener("keydown", handleKeydown);

    function destroy() {
      document.removeEventListener("keydown", handleKeydown);
      finishClose();
    }

    setHostVisibility(host, false);
    setHostVisibility(pickerHost, false);
    return Object.freeze({
      destroy,
      getDraftState: () => draft?.getState() || null,
      isOpen: () => Boolean(draft),
      open,
      requestClose,
      submit,
    });
  }

  root.REELAY_CANVAS_ENTITY_EDITOR_CONTROLLER = Object.freeze({ createCanvasEntityEditorController });
}(typeof globalThis === "object" ? globalThis : window));
