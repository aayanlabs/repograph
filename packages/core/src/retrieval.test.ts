import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GraphStore } from "./storage.js";
import { RetrievalEngine, formatContextResult } from "./retrieval.js";
import type { GraphNode, RepositoryFile } from "./types.js";

describe("retrieval", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: GraphStore;
  let engine: RetrievalEngine;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "repograph-retrieval-test-"));
    dbPath = join(tmpDir, "index.sqlite");
    store = new GraphStore(dbPath);
    engine = new RetrievalEngine(store);
  });

  afterEach(async () => {
    store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("retrieves ranked context for task queries", async () => {
    const file: RepositoryFile = {
      path: "src/auth.ts",
      absolutePath: join(tmpDir, "src/auth.ts"),
      size: 150,
      modifiedTimeMs: Date.now(),
      hash: "authhash",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    };

    const node: GraphNode = {
      id: "symbol:function:src/auth.ts:authenticateUser:1:1",
      kind: "function",
      name: "authenticateUser",
      filePath: "src/auth.ts",
      start: { line: 1, column: 1 },
      end: { line: 10, column: 1 },
      signature: "function authenticateUser(token: string): boolean",
      source: "function authenticateUser(token: string): boolean { return token === 'secret'; }",
    };

    store.replaceFileGraph(file, [node], [], []);

    const contextResults = await engine.context("authenticateUser");
    expect(contextResults).toHaveLength(1);
    expect(contextResults[0]?.node.name).toBe("authenticateUser");

    const firstResult = contextResults[0];
    expect(firstResult).toBeDefined();
    if (firstResult) {
      const formatted = formatContextResult(firstResult);
      expect(formatted).toContain("src/auth.ts:1-10");
      expect(formatted).toContain("function authenticateUser");
    }
  });
});
