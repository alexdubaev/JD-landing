import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Cap parallel workers so the jsdom + React 19 worker processes stay within
    // the Node heap limit. Without this, concurrent test runs can crash with
    // "JavaScript heap out of memory" on memory-constrained machines or CI.
    // `50%` uses half the available CPU cores, which is enough headroom here.
    maxWorkers: "50%",
    minWorkers: 1,
  },
});
