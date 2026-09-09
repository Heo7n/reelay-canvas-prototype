import { build } from "esbuild";
import path from "node:path";
import type { Plugin } from "vite";

export function promptEditorPlugin(): Plugin {
  let cached: Promise<string> | undefined;
  return {
    name: "reelay-prompt-editor",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      server.watcher.on("change", (file) => {
        if (file.replaceAll("\\", "/").includes("/src/prompt-editor/")) cached = undefined;
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/assets/prompt-editor.js") return next();
        cached ||= build({
          absWorkingDir: root, entryPoints: [path.join(root, "src/prompt-editor/index.js")],
          bundle: true, format: "iife", platform: "browser", target: "es2022",
          minify: true, legalComments: "inline", write: false,
        }).then((result) => result.outputFiles[0].text);
        cached.then((source) => {
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(source);
        }).catch((error: unknown) => {
          cached = undefined;
          server.config.logger.error(String(error));
          response.statusCode = 500;
          response.end("Prompt editor build failed.");
        });
      });
    },
  };
}
