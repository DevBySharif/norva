import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // These suites hit the same PostgreSQL database and run Serializable
    // transactions. Running files in parallel produced cascading serialization
    // aborts across suites, so execute files one at a time.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/empty-module.ts"),
    },
  },
});