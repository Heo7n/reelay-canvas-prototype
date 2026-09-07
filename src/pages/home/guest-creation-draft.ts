// A guest's unsent idea belongs to this browser tab, never to a project or canvas.
const key = "reelay-guest-creation-draft";

export function readGuestCreationDraft(): string {
  try {
    return (window.sessionStorage.getItem(key) ?? "").slice(0, 600);
  } catch {
    return "";
  }
}

export function saveGuestCreationDraft(prompt: string): void {
  try {
    if (prompt.trim()) window.sessionStorage.setItem(key, prompt.slice(0, 600));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Login remains available when the browser disallows temporary storage.
  }
}

export function clearGuestCreationDraft(): void {
  saveGuestCreationDraft("");
}
