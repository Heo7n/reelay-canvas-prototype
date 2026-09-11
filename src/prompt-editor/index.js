import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo, closeHistory } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, splitBlock, deleteSelection } from 'prosemirror-commands';
import { Slice } from 'prosemirror-model';
import { promptSchema, toEditorDocument, fromEditorDocument, sliceDocument } from './schema.js';
import { findMention, filterReferences, placeMentionMenu } from './mention.js';
import { createReferenceElement, updateReferenceElement } from './reference-element.js';

export const CLIPBOARD_TYPE = 'application/x-reelay-prompt+json';
const getModel = () => globalThis.REELAY_CANVAS_PROMPT_DOCUMENT;
const normalize = (value) => {
  const model = getModel();
  if (!model) throw new Error('Prompt document model must load before the editor.');
  return model.normalize(value);
};
const scopeIdentity = (scope) => typeof scope === 'string' ? scope : JSON.stringify(scope ?? null);
const editorDocument = (value) => toEditorDocument(normalize(value));
let nextEditorId = 0;

export function createSnapshot(document, scope) {
  return { state: EditorState.create({ schema: promptSchema, doc: editorDocument(document), plugins: [history()] }), scope: scopeIdentity(scope) };
}

export function replaceSnapshot(snapshot, document, { addToHistory = true } = {}) {
  const next = editorDocument(document);
  if (snapshot.state.doc.eq(next)) return snapshot;
  const transaction = closeHistory(snapshot.state.tr).replaceWith(0, snapshot.state.doc.content.size, next.content).setMeta('addToHistory', addToHistory);
  return { ...snapshot, state: snapshot.state.apply(transaction) };
}

export function createEditor(options) {
  const { element } = options;
  const document = element.ownerDocument;
  const window = document.defaultView;
  const ownerScope = scopeIdentity(options.getScope?.());
  const id = `prompt-reference-menu-${++nextEditorId}`;
  const atomViews = new Set();
  let disposed = false;
  let composing = false;
  let menu = null;
  let query = null;
  let candidates = [];
  let selectedIndex = 0;
  let dismissedFrom = null;
  let animation = 0;
  let view;
  let indexedReferences = [];
  let referencesByKey = new Map();
  const isCurrent = () => !disposed && ownerScope === scopeIdentity(options.getScope?.());
  const editable = () => isCurrent() && options.isEditable?.() !== false;
  const references = () => indexedReferences;
  const referenceFor = (key) => referencesByKey.get(key);
  const readReferences = () => {
    indexedReferences = getModel().referenceIndex(options.getReferences?.() || []);
    referencesByKey = new Map(indexedReferences.map((reference) => [reference.key, reference]));
    return indexedReferences;
  };
  const textOf = (doc) => getModel().toText(doc, readReferences());

  readReferences();
  element.classList.add('prompt-editor');
  element.replaceChildren();
  const existing = options.historyState;
  const state = existing?.scope === ownerScope ? existing.state : createSnapshot(options.document, ownerScope).state;

  function closeMenu(dismiss = false) {
    if (dismiss && query) dismissedFrom = query.from;
    query = null; candidates = [];
    menu?.remove(); menu = null;
    delete element.dataset.referenceMenuOpen;
    delete element.dataset.mentionOpen;
    view?.dom.removeAttribute('aria-controls');
    view?.dom.removeAttribute('aria-activedescendant');
    view?.dom.setAttribute('aria-expanded', 'false');
    if (animation) window.cancelAnimationFrame(animation);
    animation = 0;
  }

  function placeMenu() {
    if (!menu || !query || !isCurrent() || !view.hasFocus()) return closeMenu();
    let anchor;
    try { anchor = view.coordsAtPos(view.state.selection.head); } catch { return closeMenu(); }
    const clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (let ancestor = view.dom; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const rect = ancestor.getBoundingClientRect();
      const style = window.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden') return closeMenu();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow)) {
        clip.left = Math.max(clip.left, rect.left); clip.right = Math.min(clip.right, rect.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow)) {
        clip.top = Math.max(clip.top, rect.top); clip.bottom = Math.min(clip.bottom, rect.bottom);
      }
    }
    if (anchor.bottom < clip.top || anchor.top > clip.bottom || anchor.left < clip.left - 1 || anchor.left > clip.right + 1) return closeMenu();
    const placement = placeMentionMenu(anchor, { width: window.innerWidth, height: window.innerHeight }, Math.min(326, candidates.length ? 42 + candidates.length * 46 : 90));
    Object.assign(menu.style, { left: `${placement.left}px`, top: `${placement.top}px`, width: `${placement.width}px`, maxHeight: `${placement.maxHeight}px` });
  }

  function followMenu() {
    animation = 0;
    placeMenu();
    if (menu) animation = window.requestAnimationFrame(followMenu);
  }

  function highlight(index) {
    selectedIndex = Math.max(0, Math.min(index, candidates.length - 1));
    for (const row of menu?.querySelectorAll('[role="option"]') || []) {
      const active = Number(row.dataset.index) === selectedIndex;
      row.classList.toggle('is-active', active); row.setAttribute('aria-selected', String(active));
      if (active) {
        view.dom.setAttribute('aria-activedescendant', row.id);
        const list = row.parentElement;
        if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
        else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }
    if (!candidates.length) view.dom.removeAttribute('aria-activedescendant');
  }

  function insertReference(key) {
    if (!editable() || options.isMentionEnabled?.() === false || composing || view.composing) return false;
    readReferences();
    const entry = referenceFor(key);
    if (!entry) return false;
    const from = query?.from ?? view.state.selection.from;
    const to = query?.to ?? view.state.selection.to;
    const atom = promptSchema.nodes.reference.create({ key: entry.key, mediaType: entry.mediaType, fallbackLabel: entry.label });
    closeMenu(); dismissedFrom = null;
    const transaction = closeHistory(view.state.tr).replaceWith(from, to, atom);
    transaction.setSelection(TextSelection.create(transaction.doc, from + 1));
    transaction.setMeta('promptOrigin', 'reference');
    view.dispatch(transaction.scrollIntoView());
    view.dispatch(closeHistory(view.state.tr));
    view.focus();
    return true;
  }

  function renderMenu() {
    if (!menu) {
      menu = document.createElement('div'); menu.className = 'prompt-reference-menu'; menu.id = id;
      menu.dataset.wheelScope = 'local';
      menu.addEventListener('mousedown', (event) => event.preventDefault());
      menu.addEventListener('pointerdown', (event) => event.stopPropagation());
      menu.addEventListener('wheel', (event) => event.stopPropagation());
      (element.closest('dialog[open]') || document.body).append(menu);
    }
    menu.replaceChildren();
    const title = document.createElement('div'); title.className = 'prompt-reference-menu-title'; title.textContent = '引用参考素材';
    const list = document.createElement('div'); list.className = 'prompt-reference-menu-list'; list.id = `${id}-list`; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '参考素材');
    if (!candidates.length) {
      const empty = document.createElement('div'); empty.className = 'prompt-reference-menu-empty';
      empty.textContent = '没有匹配的参考素材'; list.append(empty);
    }
    candidates.forEach((entry, index) => {
      const row = document.createElement('div'); row.className = 'prompt-reference-menu-row'; row.id = `${id}-${index}`; row.dataset.index = String(index); row.setAttribute('role', 'option');
      const media = createReferenceElement(document, { key: entry.key, mediaType: entry.mediaType, fallbackLabel: entry.label }, entry);
      const name = document.createElement('span'); name.className = 'prompt-reference-menu-name'; name.textContent = entry.name || entry.label;
      row.append(media, name);
      row.addEventListener('pointermove', () => highlight(index));
      row.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); insertReference(entry.key); });
      list.append(row);
    });
    menu.append(title, list);
    element.dataset.referenceMenuOpen = 'true'; element.dataset.mentionOpen = 'true';
    view.dom.setAttribute('aria-controls', list.id); view.dom.setAttribute('aria-expanded', 'true');
    highlight(selectedIndex); placeMenu();
    if (menu && !animation) animation = window.requestAnimationFrame(followMenu);
  }

  function updateMenu(allowOpen = false) {
    if (!editable() || options.isMentionEnabled?.() === false || !references().length || composing || view.composing) return closeMenu();
    const next = findMention(view.state);
    if (!next) { dismissedFrom = null; return closeMenu(); }
    if (dismissedFrom === next.from || (!query && !allowOpen)) return closeMenu();
    if (!query || query.from !== next.from || query.query !== next.query) selectedIndex = 0;
    query = next; candidates = filterReferences(references(), next.query); renderMenu();
  }

  function refreshAtoms() {
    for (const atomView of atomViews) atomView.refresh();
  }

  function scrollSelection() {
    let rect;
    try { rect = view.coordsAtPos(view.state.selection.head); } catch { return true; }
    const host = element.scrollHeight > element.clientHeight ? element : view.dom;
    const bounds = host.getBoundingClientRect();
    if (rect.top < bounds.top + 3) host.scrollTop -= bounds.top + 3 - rect.top;
    else if (rect.bottom > bounds.bottom - 3) host.scrollTop += rect.bottom - bounds.bottom + 3;
    return true;
  }

  function attributes() {
    return { class: 'prompt-editor-content', role: 'textbox', 'aria-multiline': 'true', 'aria-label': options.ariaLabel || '提示词', 'aria-autocomplete': 'list', 'aria-haspopup': 'listbox', 'data-placeholder': options.getPlaceholder?.() || '' };
  }

  function atomDelete(direction) {
    return (state, dispatch) => {
      if (!editable()) return false;
      if (!state.selection.empty) return deleteSelection(state, dispatch);
      const { $from } = state.selection;
      const adjacent = direction < 0 ? $from.nodeBefore : $from.nodeAfter;
      if (adjacent?.type.name !== 'reference') return false;
      const from = direction < 0 ? $from.pos - adjacent.nodeSize : $from.pos;
      dispatch?.(closeHistory(state.tr).delete(from, from + adjacent.nodeSize).scrollIntoView());
      return true;
    };
  }

  function writeClipboard(event, cut = false) {
    if (!event.clipboardData || view.state.selection.empty) return false;
    const { from, to } = view.state.selection;
    const selected = normalize(sliceDocument(view.state.doc, from, to));
    event.clipboardData.setData('text/plain', textOf(selected));
    event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify({ version: 1, scope: ownerScope, document: selected }));
    event.preventDefault(); event.stopPropagation();
    if (cut && editable()) view.dispatch(closeHistory(view.state.tr).deleteSelection().setMeta('promptOrigin', 'cut').scrollIntoView());
    return true;
  }

  function paste(event) {
    if (!editable()) { event.preventDefault(); return true; }
    const clipboard = event.clipboardData;
    if (!clipboard) return false;
    let pasted;
    let crossScope = false;
    const payload = clipboard.getData(CLIPBOARD_TYPE);
    if (payload) {
      try {
        const parsed = JSON.parse(payload);
        if (parsed.version === 1 && parsed.scope === ownerScope && getModel().isDocument(parsed.document)) pasted = normalize(parsed.document);
        else crossScope = Boolean(parsed.document?.content?.some((item) => item.type === 'reference'));
      } catch { /* Treat arbitrary clipboard data as plain text. */ }
    }
    if (!pasted) pasted = normalize(clipboard.getData('text/plain'));
    const next = toEditorDocument(pasted);
    closeMenu(true);
    const slice = new Slice(next.content, 1, 1);
    view.dispatch(closeHistory(view.state.tr).replaceSelection(slice).setMeta('paste', true).setMeta('promptOrigin', 'paste').scrollIntoView());
    event.preventDefault(); event.stopPropagation();
    if (crossScope) options.onMessage?.('已粘贴为文字，请从当前参考区重新引用素材');
    return true;
  }

  function runHistory(origin) {
    if (!editable()) return false;
    const command = origin === 'undo' ? undo : redo;
    return command(view.state, (transaction) => view.dispatch(transaction.setMeta('promptOrigin', origin)));
  }

  const bindings = {
    'Mod-z': () => runHistory('undo'),
    'Mod-y': () => runHistory('redo'),
    'Mod-Shift-z': () => runHistory('redo'),
    'Mod-Enter': () => { if (editable()) options.onSubmit?.(); return true; },
    Backspace: atomDelete(-1), Delete: atomDelete(1),
    Enter: (state, dispatch) => {
      if (!editable()) return true;
      if (options.submitOnEnter) { options.onSubmit?.(); return true; }
      return splitBlock(state, dispatch);
    },
    'Shift-Enter': (state, dispatch) => {
      if (!editable()) return true;
      dispatch?.(state.tr.replaceSelectionWith(promptSchema.nodes.hard_break.create()).scrollIntoView()); return true;
    },
  };
  const plugins = [history(), keymap(bindings), keymap(baseKeymap)];
  view = new EditorView(element, {
    state: state.reconfigure({ plugins }), editable, attributes,
    handleScrollToSelection: scrollSelection,
    nodeViews: {
      reference(node) {
        let current = node;
        const dom = createReferenceElement(document, node.attrs, referenceFor(node.attrs.key));
        const atomView = {
          dom, refresh: () => updateReferenceElement(dom, current.attrs, referenceFor(current.attrs.key)),
          update(next) { if (next.type !== current.type) return false; current = next; this.refresh(); return true; },
          selectNode() {
            dom.classList.add('ProseMirror-selectednode');
            dom.dispatchEvent(new window.CustomEvent('reference-preview-request', { bubbles: true, detail: { open: true } }));
          },
          deselectNode() {
            dom.classList.remove('ProseMirror-selectednode');
            dom.dispatchEvent(new window.CustomEvent('reference-preview-request', { bubbles: true, detail: { open: false } }));
          },
          ignoreMutation: () => true,
          destroy() { atomViews.delete(atomView); },
        };
        atomViews.add(atomView); return atomView;
      },
    },
    dispatchTransaction(transaction) {
      if (disposed) return;
      if (transaction.docChanged && !editable() && !transaction.getMeta('promptExternal')) { view.updateState(view.state); return; }
      const nextDocument = fromEditorDocument(transaction.doc);
      const normalized = normalize(nextDocument);
      if (JSON.stringify(normalized) !== JSON.stringify(nextDocument)) {
        // A native contenteditable mutation can precede its transaction. Restore
        // the current state as well as rejecting the oversized document.
        view.updateState(view.state);
        options.onMessage?.('提示词内容超出可保存范围，请缩短后再试'); return;
      }
      readReferences();
      view.updateState(view.state.apply(transaction));
      view.dom.dataset.empty = String(normalized.content.length === 0);
      refreshAtoms();
      if (transaction.docChanged && !transaction.getMeta('promptSilent')) options.onChange?.(normalized, { origin: transaction.getMeta('promptOrigin') || 'input', composing: composing || view.composing });
      if (transaction.getMeta('paste')) { const current = findMention(view.state); dismissedFrom = current?.from ?? null; closeMenu(); }
      else updateMenu(transaction.docChanged);
    },
    handleKeyDown(editor, event) {
      if (event.isComposing || event.keyCode === 229 || composing || editor.composing) { event.stopPropagation(); return false; }
      // Prevent outer canvas Delete/Enter/arrow shortcuts from handling text.
      event.stopPropagation();
      if (query) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { highlight(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1)); return true; }
        if (event.key === 'Enter') { if (candidates[selectedIndex]) insertReference(candidates[selectedIndex].key); return true; }
        if (event.key === 'Escape') { closeMenu(true); return true; }
        if (event.key === 'Tab') { closeMenu(true); return false; }
      }
      if (event.key === 'Escape') { options.onEscape?.(); return true; }
      return false;
    },
    handleDOMEvents: {
      compositionstart() { composing = true; closeMenu(); return false; },
      compositionend() { composing = false; window.setTimeout(() => { if (!disposed) updateMenu(true); }, 0); return false; },
      blur() { closeMenu(true); return false; },
      copy: (editor, event) => writeClipboard(event), cut: (editor, event) => writeClipboard(event, true),
      paste: (editor, event) => paste(event),
    },
  });

  function onOutsidePointer(event) {
    if (!element.contains(event.target) && !menu?.contains(event.target)) closeMenu(true);
  }
  document.addEventListener('pointerdown', onOutsidePointer, true);
  view.dom.dataset.empty = String(fromEditorDocument(view.state.doc).content.length === 0);

  function setDocument(value, { addToHistory = false, notify = false, resetHistory = false } = {}) {
    if (!isCurrent()) return false;
    const next = editorDocument(value);
    const changed = !view.state.doc.eq(next);
    if (!changed && !resetHistory) { refresh(); return false; }
    const scrollTop = view.dom.scrollTop;
    const hostScrollTop = element.scrollTop;
    const anchor = Math.min(view.state.selection.anchor, next.content.size - 1);
    const head = Math.min(view.state.selection.head, next.content.size - 1);
    if (resetHistory) {
      // Sending ends the draft's undo lifetime. A new state clears both undo
      // and redo even when the next document happens to equal the current one.
      closeMenu(true); readReferences();
      const selection = TextSelection.between(next.resolve(Math.max(1, anchor)), next.resolve(Math.max(1, head)));
      view.updateState(EditorState.create({ schema: promptSchema, doc: next, selection, plugins }));
      view.dom.dataset.empty = String(fromEditorDocument(next).content.length === 0);
      refreshAtoms(); view.dom.scrollTop = scrollTop; element.scrollTop = hostScrollTop;
      if (changed && notify) options.onChange?.(normalize(fromEditorDocument(next)), { origin: 'external', composing: false });
      return true;
    }
    const transaction = closeHistory(view.state.tr).replaceWith(0, view.state.doc.content.size, next.content);
    transaction.setSelection(TextSelection.between(transaction.doc.resolve(Math.max(1, anchor)), transaction.doc.resolve(Math.max(1, head))));
    transaction.setMeta('addToHistory', addToHistory).setMeta('promptExternal', true).setMeta('promptSilent', !notify).setMeta('promptOrigin', 'external');
    closeMenu(true); view.dispatch(transaction); view.dom.scrollTop = scrollTop; element.scrollTop = hostScrollTop;
    if (addToHistory) view.dispatch(closeHistory(view.state.tr));
    return true;
  }

  function refresh() {
    if (disposed) return;
    readReferences();
    view.setProps({ editable, attributes }); refreshAtoms();
    if (!editable() || options.isMentionEnabled?.() === false) closeMenu();
    else if (query) updateMenu();
  }

  return {
    dom: view.dom, view,
    getDocument: () => normalize(fromEditorDocument(view.state.doc)),
    getText: () => textOf(normalize(fromEditorDocument(view.state.doc))),
    setDocument, refresh, insertReference,
    revealReference(key) {
      if (!isCurrent()) return false;
      let position = null;
      view.state.doc.descendants((node, offset) => {
        if (position === null && node.type.name === 'reference' && node.attrs.key === key) position = offset;
      });
      if (position === null) return false;
      closeMenu(true);
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
      view.focus(); scrollSelection(); return true;
    },
    focus: () => { if (isCurrent()) view.focus(); },
    blur: () => { closeMenu(true); view.dom.blur(); },
    undo: () => runHistory('undo'),
    redo: () => runHistory('redo'),
    // Keep document/history, but drop per-mounted-view keymaps whose closures
    // would otherwise retain a detached editor and its DOM while collapsed.
    snapshotState: () => ({ state: view.state.reconfigure({ plugins: [history()] }), scope: ownerScope }),
    restoreState(snapshot) {
      if (!isCurrent() || snapshot?.scope !== ownerScope) return false;
      closeMenu(true); readReferences(); view.updateState(snapshot.state.reconfigure({ plugins })); refreshAtoms();
      view.dom.dataset.empty = String(fromEditorDocument(view.state.doc).content.length === 0);
      options.onChange?.(normalize(fromEditorDocument(view.state.doc)), { origin: 'history' }); return true;
    },
    destroy() {
      if (disposed) return;
      closeMenu(); disposed = true; document.removeEventListener('pointerdown', onOutsidePointer, true);
      view.destroy(); atomViews.clear(); element.classList.remove('prompt-editor');
    },
  };
}

export { createReferenceElement };
export const promptEditor = Object.freeze({ createEditor, createSnapshot, replaceSnapshot, createReferenceElement });
globalThis.REELAY_PROMPT_EDITOR = promptEditor;
