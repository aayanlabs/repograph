import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { exportGraph, findCycles, findPath } from "./query.js";
import { GraphStore } from "./storage.js";
import type { GraphNode, RepositoryFile } from "./types.js";

describe("query engine", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: GraphStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "repograph-query-test-"));
    dbPath = join(tmpDir, "index.sqlite");
    store = new GraphStore(dbPath);
  });

  afterEach(async () => {
    store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("finds shortest call path between symbols", () => {
    const fileA: RepositoryFile = {
      path: "src/a.ts",
      absolutePath: "/app/src/a.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hA",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const fileB: RepositoryFile = {
      path: "src/b.ts",
      absolutePath: "/app/src/b.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hB",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const nodeA: GraphNode = {
      id: "symbol:function:src/a.ts:start:1:1",
      kind: "function",
      name: "start",
      filePath: "src/a.ts",
      start: { line: 1, column: 1 },
      end: { line: 5, column: 1 },
      signature: "function start()",
      source: "function start() { finish(); }",
    };

    const nodeB: GraphNode = {
      id: "symbol:function:src/b.ts:finish:1:1",
      kind: "function",
      name: "finish",
      filePath: "src/b.ts",
      start: { line: 1, column: 1 },
      end: { line: 5, column: 1 },
      signature: "function finish()",
      source: "function finish() {}",
    };

    store.replaceFileGraph(fileA, [nodeA], [], []);
    store.replaceFileGraph(
      fileB,
      [nodeB],
      [
        {
          sourceId: nodeA.id,
          targetId: nodeB.id,
          kind: "calls",
          metadata: null,
        },
      ],
      [],
    );

    const pathResult = findPath(store, "start", "finish");
    expect(pathResult).not.toBeNull();
    expect(pathResult?.distance).toBe(1);
    expect(pathResult?.path.map((n) => n.name)).toEqual(["start", "finish"]);
  });

  it("detects circular import dependencies", () => {
    const fileA: RepositoryFile = {
      path: "src/a.ts",
      absolutePath: "/app/src/a.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hA",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const fileB: RepositoryFile = {
      path: "src/b.ts",
      absolutePath: "/app/src/b.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hB",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    store.upsertFile(fileA);
    store.upsertFile(fileB);

    store.replaceFileGraph(fileA, [], [], [{ targetPath: "src/b.ts", specifier: "./b.js" }]);
    store.replaceFileGraph(fileB, [], [], [{ targetPath: "src/a.ts", specifier: "./a.js" }]);

    const cycles = findCycles(store);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("exports graph to GraphML format", () => {
    const file: RepositoryFile = {
      path: "src/index.ts",
      absolutePath: "/app/src/index.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hIdx",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    store.replaceFileGraph(file, [], [], []);

    const xml = exportGraph(store, "graphml");
    expect(xml).toContain("<?xml");
    expect(xml).toContain("<graphml");
    expect(xml).toContain("RepoGraph");
  });
});
