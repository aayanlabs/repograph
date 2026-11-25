import { describe, expect, it } from "vitest";

import { GraphStore } from "./storage.js";
import { generateDashboardHtml } from "./visualizer.js";

describe("visualizer", () => {
  it("generates valid standalone HTML with embedded nodes, edges, and 5 distinct visualization modes", () => {
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

    const html = generateDashboardHtml(store, {
      repositoryName: "test-repo",
      branch: "main",
    });

    // Brand and structure
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("RepoGraph");
    expect(html).toContain("by aayanlabs");
    expect(html).toContain('<canvas id="canvas">');
    expect(html).toContain("src/index.ts");

    // Five distinct modes
    expect(html).toContain('data-mode="architecture"');
    expect(html).toContain('data-mode="dependency"');
    expect(html).toContain('data-mode="symbol"');
    expect(html).toContain('data-mode="impact"');
    expect(html).toContain('data-mode="codebase_map"');

    // Layout algorithms & controls
    expect(html).toContain("Directory Clustered");
    expect(html).toContain("Layered DAG");
    expect(html).toContain("Concentric Radial");
    expect(html).toContain("btn-hulls");
    expect(html).toContain("btn-labels");
    expect(html).toContain("minimap-canvas");

    // Palette & Design System
    expect(html).toContain("--bg-base: #0B0D12");
    expect(html).toContain("--accent-cyan: #55C5D9");
    expect(html).toContain("--accent-danger: #EA7777");

    store.close();
  });
});
