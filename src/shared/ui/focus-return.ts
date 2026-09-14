// document.activeElement is only the iframe when focus lives in another
// browsing context. Capture the actual same-origin control before opening UI.
export function captureFocusReturn(preferredTarget?: HTMLElement | null): () => void {
  let target: Element | null = preferredTarget ?? document.activeElement;
  while (target?.tagName === "IFRAME") {
    try {
      const frameDocument = (target as HTMLIFrameElement).contentDocument;
      const child = frameDocument?.activeElement;
      if (!child || child === frameDocument?.body) break;
      target = child;
    } catch {
      // A cross-origin frame is itself the deepest accessible return target.
      break;
    }
  }
  return () => {
    // instanceof HTMLElement would reject a valid element from another frame.
    if (target?.isConnected && "focus" in target && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  };
}
