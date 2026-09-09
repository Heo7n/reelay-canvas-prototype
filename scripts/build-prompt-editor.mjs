import { build } from "esbuild";
import path from "node:path";

// One local, separately cached editor bundle. The canvas can initialize without
// parsing an editing engine until an input surface is actually used.
export async function buildPromptEditor(root) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "src/prompt-editor/index.js")],
    bundle: true, format: "iife", platform: "browser", target: "es2022",
    minify: true, legalComments: "inline", write: false,
  });
  return result.outputFiles[0].text;
}
