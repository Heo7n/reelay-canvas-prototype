// A guest's unsent idea belongs to this browser tab, never to a project or canvas.
import { isExperienceRuntime } from "../../app/runtime-mode";

const key = "reelay-guest-creation-draft";

export function readGuestCreationDraft(): string {
  if (isExperienceRuntime) return "";
  try {
    return (window.sessionStorage.getItem(key) ?? "").slice(0, 600);
  } catch {
    return "";
  }
}

export function saveGuestCreationDraft(prompt: string): void {
  if (isExperienceRuntime) return;
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
