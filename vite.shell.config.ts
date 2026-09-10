import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { canvasLayoutTunerPlugin } from "./src/dev/canvas-layout-tuner-plugin";
import { promptEditorPlugin } from "./src/dev/prompt-editor-plugin";
import { generationSimulatorPlugin } from "./src/dev/generation-simulator-plugin";

function shellHistoryFallback() {
  return {
    name: "reelay-shell-history-fallback",
    configureServer(server: { middlewares: { use: (handler: (request: { url?: string }, response: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((request, _response, next) => {
        const url = request.url || "";
        const isApplicationRoute = /^\/app(?:\/|$)/.test(url);
        const isViteInternalRoute = /^\/app\/@/.test(url);
        const hasFileExtension = /\.[A-Za-z0-9]+(?:[?#]|$)/.test(url);

        if (isApplicationRoute && !isViteInternalRoute && !hasFileExtension) {
          request.url = "/app-shell.html";
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "/",
  define: { "import.meta.env.VITE_REELAY_EXPERIENCE": JSON.stringify(mode === "experience" ? "true" : "false") },
  plugins: [react(), shellHistoryFallback(), canvasLayoutTunerPlugin(), promptEditorPlugin(), generationSimulatorPlugin()],
  server: {
    proxy: mode === "experience" ? undefined : {
      "/api": "http://127.0.0.1:5175",
    },
  },
  build: {
    outDir: mode === "experience" ? "dist/experience" : "dist/shell",
    emptyOutDir: true,
    rollupOptions: {
      input: "app-shell.html",
    },
  },
}));
