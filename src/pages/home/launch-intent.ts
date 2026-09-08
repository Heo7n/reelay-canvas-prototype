import { z } from "zod";
import { isExperienceRuntime } from "../../app/runtime-mode";

export interface ProjectLaunchScope {
  workspaceId: string;
  projectId: string;
  canvasId: string;
}

const launchIntentSchema = z.object({
  version: z.literal(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  canvasId: z.string().min(1),
  prompt: z.string().trim().min(1).max(600),
}).strict();

type ProjectLaunchIntent = z.infer<typeof launchIntentSchema>;
let experienceIntent: ProjectLaunchIntent | null = null;
const key = "reelay-home-launch-intent";

// Publish only once project creation succeeds, when its destination is known.
// A blank project replaces any previous pending handoff with no prompt.
export function publishProjectLaunchIntent(scope: ProjectLaunchScope, prompt: string): void {
  const parsed = launchIntentSchema.safeParse({ version: 1, ...scope, prompt });
  const intent = parsed.success ? parsed.data : null;
  if (isExperienceRuntime) {
    experienceIntent = intent;
    return;
  }
  try {
    if (intent) window.sessionStorage.setItem(key, JSON.stringify(intent));
    else window.sessionStorage.removeItem(key);
  } catch { /* The project remains usable when optional session storage is unavailable. */ }
}

export function takeProjectLaunchIntent(scope: ProjectLaunchScope): string {
  try {
    const raw: unknown = isExperienceRuntime
      ? experienceIntent
      : JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    const parsed = launchIntentSchema.safeParse(raw);
    if (!parsed.success) return "";
    const intent = parsed.data;
    if (intent.workspaceId !== scope.workspaceId || intent.projectId !== scope.projectId
      || intent.canvasId !== scope.canvasId) return "";
    if (isExperienceRuntime) experienceIntent = null;
    else window.sessionStorage.removeItem(key);
    return intent.prompt;
  } catch {
    return "";
  }
}
