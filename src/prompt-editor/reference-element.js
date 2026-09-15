import { Image, SquarePlay, Music2 } from 'lucide';

const referenceIcons = { image: Image, video: SquarePlay, audio: Music2 };

// Render official icon nodes in the editor's document, including iframe editors.
// Lucide's DOM helper otherwise always uses the global document.
function createReferenceIcon(document, mediaType) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const attributes = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, String(value));
  for (const [tag, attrs] of referenceIcons[mediaType] || Image) {
    const child = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) child.setAttribute(name, String(value));
    svg.append(child);
  }
  return svg;
}

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
      thumb.append(createReferenceIcon(element.ownerDocument, atom.mediaType));
    }
  }
}
