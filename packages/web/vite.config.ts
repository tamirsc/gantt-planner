import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@gantt-planner/engine": fileURLToPath(new URL("../engine/src/index.ts", import.meta.url)),
      "@gantt-planner/mspdi": fileURLToPath(new URL("../mspdi/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
