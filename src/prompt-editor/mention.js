// Typing @ is an explicit reference intent, including immediately after prose
// or another atom. Only recognizable addresses suppress it; a bare name@ is
// ambiguous and must not disable the user's reference shortcut.
export function findMention(state) {
  if (!state.selection.empty || !state.selection.$from.parent.isTextblock) return null;
  const { $from } = state.selection;
  const prefix = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc');
  const match = /@([^\s@\ufffc]{0,80})$/.exec(prefix);
  if (!match) return null;
  const before = prefix.slice(0, match.index).split(/[\s\ufffc]/).at(-1);
  if (/(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|www\.)/i.test(before)) return null;
  const emailLocal = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(before);
  const domain = match[1].replace(/[.,;:!?，。；：！？)）\]]+$/, '');
  const completeDomain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
  if (emailLocal && completeDomain) return null;
  return { from: $from.start() + match.index, to: $from.pos, query: match[1] };
}

export function filterReferences(references, query) {
  const search = query.toLocaleLowerCase().replace(/\s/g, '');
  return references.filter((reference) => `${reference.label} ${reference.name || ''}`.toLocaleLowerCase().replace(/\s/g, '').includes(search));
}

export function placeMentionMenu(anchor, viewport, height, width = 288) {
  const margin = 8;
  const availableWidth = Math.max(0, viewport.width - margin * 2);
  width = Math.min(width, availableWidth);
  const below = Math.max(0, viewport.height - anchor.bottom - margin - 6);
  const above = Math.max(0, anchor.top - margin - 6);
  const upward = below < Math.min(height, 168) && above > below;
  height = Math.max(0, Math.min(height, upward ? above : below));
  return {
    left: Math.max(margin, Math.min(anchor.left, viewport.width - width - margin)),
    top: upward ? Math.max(margin, anchor.top - height - 6) : anchor.bottom + 6,
    width, maxHeight: height,
  };
}
