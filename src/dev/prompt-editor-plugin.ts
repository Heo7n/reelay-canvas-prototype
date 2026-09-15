import { build } from "esbuild";
import path from "node:path";
import type { Plugin } from "vite";

export function promptEditorPlugin(entry = "prompt-editor"): Plugin {
  let cached: Promise<string> | undefined;
  return {
    name: `reelay-${entry}`,
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      server.watcher.on("change", (file) => {
        if (file.replaceAll("\\", "/").includes(`/src/${entry}/`)) cached = undefined;
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== `/assets/${entry === "icons" ? "canvas-icons" : entry}.js`) return next();
        cached ||= build({
          absWorkingDir: root, entryPoints: [path.join(root, `src/${entry}/index.js`)],
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
          response.end("Canvas dependency build failed.");
        });
      });
    },
  };
}
