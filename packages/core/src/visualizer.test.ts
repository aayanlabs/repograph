import { describe, expect, it } from "vitest";

import { GraphStore } from "./storage.js";
import { generateDashboardHtml } from "./visualizer.js";

describe("visualizer", () => {
  it("generates valid standalone HTML with embedded nodes and edges", () => {
    const store = new GraphStore(":memory:");
    store.upsertFile({
      path: "src/index.ts",
      absolutePath: "/app/src/index.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "abc",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    });

    const html = generateDashboardHtml(store);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("RepoGraph");
    expect(html).toContain("by aayanlabs");
    expect(html).toContain('<canvas id="canvas">');
    expect(html).toContain("src/index.ts");
    store.close();
  });
});
