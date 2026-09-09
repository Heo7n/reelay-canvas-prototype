import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

import { canvasLayoutTunerPlugin } from "./src/dev/canvas-layout-tuner-plugin";
import { promptEditorPlugin } from "./src/dev/prompt-editor-plugin";

function siteFavicon(experience: boolean): Plugin {
  return {
    name: "reelay-site-favicon",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => experience
        ? html.replace(/favicon-account\.svg/g, "favicon-experience.svg")
        : html,
    },
  };
}

const developmentApiPort = Number(process.env.REELAY_DEV_API_PORT || "5175");
if (!Number.isInteger(developmentApiPort) || developmentApiPort < 1 || developmentApiPort > 65535) {
  throw new Error("REELAY_DEV_API_PORT must be a valid local API port.");
}

function shellHistoryFallback() {
  return {
    name: "reelay-shell-history-fallback",
    configureServer(server: { middlewares: { use: (handler: (request: { url?: string }, response: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((request, _response, next) => {
        const pathname = (request.url || "").split(/[?#]/, 1)[0];
        const isApplicationRoute = /^\/app(?:\/|$)/.test(pathname);
        const isViteInternalRoute = /^\/app\/@/.test(pathname);
        const hasFileExtension = /\.[A-Za-z0-9]+$/.test(pathname);

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
  plugins: [siteFavicon(mode === "experience"), react(), shellHistoryFallback(), canvasLayoutTunerPlugin(), promptEditorPlugin()],
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
