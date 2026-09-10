import { defineConfig } from "vite";

import { canvasLayoutTunerPlugin } from "./src/dev/canvas-layout-tuner-plugin";
import { promptEditorPlugin } from "./src/dev/prompt-editor-plugin";
import { generationSimulatorPlugin } from "./src/dev/generation-simulator-plugin";

export default defineConfig({
  plugins: [canvasLayoutTunerPlugin(), promptEditorPlugin(), generationSimulatorPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5194,
    strictPort: true,
  },
});
