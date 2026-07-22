import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  base: "/",
  plugins: [react(), shellHistoryFallback()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5175",
    },
  },
  build: {
    outDir: "dist/shell",
    emptyOutDir: true,
    rollupOptions: {
      input: "app-shell.html",
    },
  },
});
