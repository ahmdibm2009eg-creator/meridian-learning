import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    reporters: ["default"],
    // Integration suites share one test database — files must run sequentially.
    fileParallelism: false,
  },
});
