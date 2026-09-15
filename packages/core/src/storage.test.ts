import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GraphStore } from "./storage.js";
import type { GraphNode, RepositoryFile } from "./types.js";

describe("storage", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: GraphStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "repograph-storage-test-"));
    dbPath = join(tmpDir, "index.sqlite");
    store = new GraphStore(dbPath);
  });

  afterEach(async () => {
    store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("stores and retrieves repository file records", () => {
    const file: RepositoryFile = {
      path: "src/utils.ts",
      absolutePath: join(tmpDir, "src/utils.ts"),
      size: 250,
      modifiedTimeMs: Date.now(),
      hash: "1234567890abcdef",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    store.upsertFile(file);

    const fetched = store.getFile("src/utils.ts");
    expect(fetched).not.toBeNull();
    expect(fetched?.size).toBe(250);
    expect(fetched?.hash).toBe("1234567890abcdef");

    const allFiles = store.getFiles();
    expect(allFiles).toHaveLength(1);

    const stats = store.stats();
    expect(stats.files).toBe(1);
    expect(stats.nodes).toBe(1); // File node automatically inserted
  });

  it("replaces file subgraphs cleanly", () => {
    const file: RepositoryFile = {
      path: "src/math.ts",
      absolutePath: join(tmpDir, "src/math.ts"),
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hash1",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const node1: GraphNode = {
      id: "symbol:function:src/math.ts:add:1:1",
      kind: "function",
      name: "add",
      filePath: "src/math.ts",
      start: { line: 1, column: 1 },
      end: { line: 5, column: 1 },
      signature: "function add(a: number, b: number): number",
      source: "function add(a: number, b: number): number { return a + b; }",
    };

    store.replaceFileGraph(file, [node1], [], []);

    let stats = store.stats();
    expect(stats.nodes).toBe(2); // 1 file node + 1 symbol node

    // Re-replace graph
    store.replaceFileGraph(file, [], [], []);
    stats = store.stats();
    expect(stats.nodes).toBe(1); // symbol node purged
  });

  it("searches symbols and calculates impact graph", () => {
    const fileA: RepositoryFile = {
      path: "src/a.ts",
      absolutePath: join(tmpDir, "src/a.ts"),
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hashA",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const fileB: RepositoryFile = {
      path: "src/b.ts",
      absolutePath: join(tmpDir, "src/b.ts"),
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "hashB",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const nodeA: GraphNode = {
      id: "symbol:function:src/a.ts:compute:1:1",
      kind: "function",
      name: "compute",
      filePath: "src/a.ts",
      start: { line: 1, column: 1 },
      end: { line: 5, column: 1 },
      signature: "function compute(): void",
      source: "function compute() {}",
    };

    const nodeB: GraphNode = {
      id: "symbol:function:src/b.ts:caller:1:1",
      kind: "function",
      name: "caller",
      filePath: "src/b.ts",
      start: { line: 1, column: 1 },
      end: { line: 5, column: 1 },
      signature: "function caller(): void",
      source: "function caller() { compute(); }",
    };

    store.replaceFileGraph(fileA, [nodeA], [], []);
    store.replaceFileGraph(
      fileB,
      [nodeB],
      [
        {
          sourceId: nodeB.id,
          targetId: nodeA.id,
          kind: "calls",
          metadata: null,
        },
      ],
      [],
    );

    const searchResults = store.search("compute");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.node.name).toBe("compute");

    const impact = store.getImpact(nodeA.id, 3);
    expect(impact.map((n) => n.name)).toContain("caller");
  });
});
