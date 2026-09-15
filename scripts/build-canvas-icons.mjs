import { build } from "esbuild";
import path from "node:path";

export async function buildCanvasIcons(root) {
  const result = await build({
    absWorkingDir: root, entryPoints: [path.join(root, "src/icons/index.js")],
    bundle: true, format: "iife", platform: "browser", target: "es2022",
    minify: true, legalComments: "inline", write: false,
  });
  return result.outputFiles[0].text;
}
