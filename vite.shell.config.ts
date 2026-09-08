import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { canvasLayoutTunerPlugin } from "./src/dev/canvas-layout-tuner-plugin";

const developmentApiPort = Number(process.env.REELAY_DEV_API_PORT || "5175");
if (!Number.isInteger(developmentApiPort) || developmentApiPort < 1 || developmentApiPort > 65535) {
  throw new Error("REELAY_DEV_API_PORT must be a valid local API port.");
}

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
  plugins: [react(), shellHistoryFallback(), canvasLayoutTunerPlugin()],
  server: {
    proxy: mode === "experience" ? undefined : {
      "/api": `http://127.0.0.1:${developmentApiPort}`,
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
