import { z } from "zod";
import { isExperienceRuntime } from "../../app/runtime-mode";
import { routePaths } from "../../app/routes";

const key = "reelay-guest-prompt-draft-v1";
const draftSchema = z.object({
  prompt: z.string().max(600),
  workspaceId: z.string().min(1).nullable(),
}).strict();

export type GuestCreationDraft = z.infer<typeof draftSchema>;

function readDraft(): GuestCreationDraft | null {
  if (isExperienceRuntime) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(window.sessionStorage.getItem(key) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function readGuestCreationDraft(workspaceId: string | null = null): string {
  const draft = readDraft();
  return draft?.workspaceId === workspaceId ? draft.prompt : "";
}

export function readLoginCreationDraft(returnTo: string | null): GuestCreationDraft {
  const draft = readDraft();
  const matches = draft && (draft.workspaceId === null
    ? returnTo === null
    : returnTo === routePaths.workspaceHome(draft.workspaceId));
  return matches ? draft : { prompt: "", workspaceId: null };
}

export function saveGuestCreationDraft(prompt: string, workspaceId: string | null = null): void {
  if (isExperienceRuntime) return;
  try {
    if (prompt.trim()) window.sessionStorage.setItem(key, JSON.stringify({ prompt: prompt.slice(0, 600), workspaceId }));
    else window.sessionStorage.removeItem(key);
  } catch { /* Login remains usable if temporary storage is unavailable. */ }
}

export function clearGuestCreationDraft(): void {
  saveGuestCreationDraft("");
}

// Resolve the destination after authentication; drafts never follow deep links
// or a fallback into a different workspace when membership has changed.
export function prepareCreationDraftReturn(destination: string, returnTo: string | null = null): void {
  const draft = readDraft();
  const expectedReturn = draft?.workspaceId ? routePaths.workspaceHome(draft.workspaceId) : null;
  const match = destination.match(/^\/w\/([^/?#]+)$/);
  let workspaceId = "";
  try { workspaceId = match ? decodeURIComponent(match[1]!) : ""; } catch { /* Invalid destinations cannot receive a draft. */ }
  if (!draft || expectedReturn !== returnTo || !workspaceId || (draft.workspaceId !== null && draft.workspaceId !== workspaceId)) {
    clearGuestCreationDraft();
    return;
  }
  saveGuestCreationDraft(draft.prompt, workspaceId);
}
