import { isExperienceRuntime } from "../../app/runtime-mode";

let experiencePrompt = "";
const key = "reelay-home-launch-intent";

export function setLaunchIntent(prompt: string): void {
  if (isExperienceRuntime) {
    experiencePrompt = prompt.trim().slice(0, 600);
    return;
  }
  try { window.sessionStorage.setItem(key, prompt.trim()); } catch { /* Optional draft. */ }
}

export function takeExperienceLaunchIntent(): string {
  const prompt = experiencePrompt;
  experiencePrompt = "";
  return prompt;
}
