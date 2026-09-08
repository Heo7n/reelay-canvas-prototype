const defaultPreset = { account: "creator@reelay.test", search: "" };
const adminPreset = { account: "linjing@reelay.test", search: "?demo=admin" };

// The link chooses a known demo form default, never credentials or a session.
export function getDemoLoginPreset(search: string) {
  const presets = new URLSearchParams(search).getAll("demo");
  return presets.length === 1 && presets[0] === "admin" ? adminPreset : defaultPreset;
}
