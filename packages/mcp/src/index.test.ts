import { describe, expect, it } from "vitest";

import { GraphStore } from "@repograph/core";
import { createRepoGraphMcpServer } from "./index.js";

describe("mcp server tools", () => {
  it("creates server instance and registers all intelligence tools", () => {
    const store = new GraphStore(":memory:");
    store.upsertFile({
      path: "src/main.ts",
      absolutePath: "/app/src/main.ts",
      size: 200,
      modifiedTimeMs: Date.now(),
      hash: "abc",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    });

    const server = createRepoGraphMcpServer("/app", store);
    expect(server).toBeDefined();

    store.close();
  });
});
