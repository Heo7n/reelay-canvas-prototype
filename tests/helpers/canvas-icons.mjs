import { fileURLToPath } from "node:url";
import { buildCanvasIcons } from "../../scripts/build-canvas-icons.mjs";

export const canvasIconsSource = await buildCanvasIcons(fileURLToPath(new URL("../../", import.meta.url)));
export function installCanvasIcons(window) { window.eval(canvasIconsSource); }
