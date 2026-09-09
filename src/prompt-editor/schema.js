import { Schema } from 'prosemirror-model';

export const promptSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    reference: {
      inline: true, group: 'inline', atom: true, selectable: true, draggable: false,
      attrs: { key: {}, mediaType: {}, fallbackLabel: {} },
      // Clipboard HTML never creates references. Only a scoped, validated custom
      // clipboard payload may restore identity.
      toDOM: (node) => ['span', { class: 'prompt-reference', 'data-reference-key': node.attrs.key }, node.attrs.fallbackLabel],
    },
  },
});

export function toEditorDocument(document) {
  const paragraphs = [];
  let inline = [];
  for (const item of document.content || []) {
    if (item.type === 'reference') {
      inline.push(promptSchema.nodes.reference.create({ key: item.key, mediaType: item.mediaType, fallbackLabel: item.fallbackLabel }));
    } else if (item.type === 'text') {
      const lines = item.text.split('\n');
      lines.forEach((line, index) => {
        if (index) { paragraphs.push(promptSchema.nodes.paragraph.create(null, inline)); inline = []; }
        if (line) inline.push(promptSchema.text(line));
      });
    }
  }
  paragraphs.push(promptSchema.nodes.paragraph.create(null, inline));
  return promptSchema.nodes.doc.create(null, paragraphs);
}

export function fromEditorDocument(document) {
  const content = [];
  function append(text) {
    if (!text) return;
    const previous = content[content.length - 1];
    if (previous?.type === 'text') previous.text += text;
    else content.push({ type: 'text', text });
  }
  document.forEach((block, offset, index) => {
    if (index) append('\n');
    block.forEach((node) => {
      if (node.isText) append(node.text);
      else if (node.type.name === 'hard_break') append('\n');
      else if (node.type.name === 'reference') content.push({ type: 'reference', ...node.attrs });
    });
  });
  return { version: 1, content };
}

export function sliceDocument(document, from, to) {
  const content = [];
  let blockSeen = false;
  document.nodesBetween(from, to, (node, position) => {
    if (node.type.name === 'paragraph') {
      if (blockSeen) content.push({ type: 'text', text: '\n' });
      blockSeen = true;
    } else if (node.isText) {
      const text = node.text.slice(Math.max(0, from - position), Math.min(node.nodeSize, to - position));
      if (text) content.push({ type: 'text', text });
    } else if (node.type.name === 'reference') content.push({ type: 'reference', ...node.attrs });
    else if (node.type.name === 'hard_break') content.push({ type: 'text', text: '\n' });
  });
  return { version: 1, content };
}
