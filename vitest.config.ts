import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@repograph/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@repograph/cli": resolve(__dirname, "packages/cli/src/index.ts"),
      "@repograph/mcp": resolve(__dirname, "packages/mcp/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts", "benchmarks/**/*.test.ts"],
    passWithNoTests: false,
  },
});
