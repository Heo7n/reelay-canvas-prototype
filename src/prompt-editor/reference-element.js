const paths = {
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  audio: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
};

export function createReferenceElement(document, atom, reference) {
  const element = document.createElement('span');
  element.className = 'prompt-reference';
  element.dataset.referenceKey = atom.key;
  element.dataset.mediaType = atom.mediaType;
  element.contentEditable = 'false';
  const thumb = document.createElement('span');
  thumb.className = 'prompt-reference-thumb';
  const label = document.createElement('span');
  label.className = 'prompt-reference-label';
  element.append(thumb, label);
  updateReferenceElement(element, atom, reference);
  return element;
}

export function updateReferenceElement(element, atom, reference) {
  const asset = reference?.asset || reference || {};
  const status = !reference ? '已移除' : reference.mediaType !== atom.mediaType ? '类型已变化' : !asset.url ? '暂不可用' : '';
  const missing = Boolean(status);
  const label = missing ? `${atom.fallbackLabel} · ${status}` : reference.label;
  element.classList.toggle('is-missing', missing);
  element.dataset.referenceKey = atom.key;
  element.dataset.mediaType = atom.mediaType;
  const labelElement = element.querySelector('.prompt-reference-label');
  if (labelElement.textContent !== label) labelElement.textContent = label;
  const accessibleLabel = missing ? `${atom.fallbackLabel}，参考素材已不可用` : `${label}，${reference.name || label}`;
  if (element.getAttribute('aria-label') !== accessibleLabel) element.setAttribute('aria-label', accessibleLabel);
  const thumb = element.querySelector('.prompt-reference-thumb');
  const candidate = reference?.thumbnailUrl || asset.thumbnail || asset.thumbnailUrl || (atom.mediaType === 'image' ? asset.url || asset.src : null);
  const thumbnail = typeof candidate === 'string' && !/^\s*(?:javascript|vbscript|data:(?!image\/))/i.test(candidate) ? candidate : '';
  const identity = `${atom.mediaType}|${missing ? '' : thumbnail}`;
  if (thumb.dataset.identity !== identity) {
    thumb.dataset.identity = identity;
    thumb.replaceChildren();
    if (!missing && thumbnail) {
      const img = element.ownerDocument.createElement('img');
      img.alt = ''; img.src = thumbnail; img.loading = 'lazy'; img.draggable = false;
      thumb.append(img);
    } else {
      thumb.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[atom.mediaType] || paths.image}</svg>`;
    }
  }
}
