import { join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RepositoryIndexer, resolveImportPath } from "./indexer.js";

describe("indexer", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "repograph-indexer-test-"));
    dbPath = join(tmpDir, ".repograph", "index.sqlite");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves relative and aliased import paths", () => {
    const repositoryPaths = new Set(["src/utils/math.ts", "src/components/Button.tsx"]);

    const file = {
      path: "src/index.ts",
      absolutePath: "/app/src/index.ts",
      size: 100,
      modifiedTimeMs: Date.now(),
      hash: "abc",
      language: "typescript" as const,
      isBinary: false,
      isTooLarge: false,
    };

    expect(resolveImportPath(file, "./utils/math", repositoryPaths)).toBe("src/utils/math.ts");
    expect(resolveImportPath(file, "@/components/Button", repositoryPaths)).toBe(
      "src/components/Button.tsx",
    );
    expect(resolveImportPath(file, "external-pkg", repositoryPaths)).toBeNull();
  });

  it("indexes repository incrementally and skips unmodified files", async () => {
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(
      join(tmpDir, "src", "a.ts"),
      "export function add(x: number, y: number): number { return x + y; }",
    );
    await writeFile(
      join(tmpDir, "src", "b.ts"),
      'import { add } from "./a.js"; export function calc() { return add(1, 2); }',
    );

    const indexer = new RepositoryIndexer(dbPath);
    try {
      const summary1 = await indexer.index({ rootDir: tmpDir, databasePath: dbPath });
      expect(summary1.indexedFiles).toBe(2);
      expect(summary1.skippedFiles).toBe(0);

      // Re-index without modifications
      const summary2 = await indexer.index({ rootDir: tmpDir, databasePath: dbPath });
      expect(summary2.indexedFiles).toBe(0);
      expect(summary2.skippedFiles).toBe(2);

      // Delete a file and verify indexer cleans it up
      await rm(join(tmpDir, "src", "b.ts"));
      const summary3 = await indexer.index({ rootDir: tmpDir, databasePath: dbPath });
      expect(summary3.removedFiles).toBe(1);
    } finally {
      indexer.store.close();
    }
  });

  it("resolves cross-file calls, imports, and inheritance accurately", async () => {
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(
      join(tmpDir, "src", "base.ts"),
      `
      export class BaseService {
        baseMethod(): void {}
      }
      export function coreCompute(): number {
        return 100;
      }
      `,
    );
    await writeFile(
      join(tmpDir, "src", "app.ts"),
      `
      import { BaseService, coreCompute } from "./base.js";

      export class AppService extends BaseService {
        execute(): number {
          return coreCompute();
        }
      }
      `,
    );

    const indexer = new RepositoryIndexer(dbPath);
    try {
      const summary = await indexer.index({ rootDir: tmpDir, databasePath: dbPath });
      expect(summary.indexedFiles).toBe(2);
      expect(summary.crossFileEdgesResolved).toBeGreaterThan(0);

      const allEdges = indexer.store.allEdges();
      const extendsEdges = allEdges.filter((e) => e.kind === "extends");
      expect(extendsEdges.length).toBeGreaterThan(0);

      const callEdges = allEdges.filter((e) => e.kind === "calls");
      expect(callEdges.length).toBeGreaterThan(0);

      // Verify impact report for coreCompute
      const coreComputeNode = indexer.store.search("coreCompute")[0]?.node;
      expect(coreComputeNode).toBeDefined();

      const impactReport = indexer.store.getImpactReport(coreComputeNode!.id);
      expect(impactReport).not.toBeNull();
      expect(impactReport?.directDependents.length).toBeGreaterThan(0);
      expect(impactReport?.affectedFiles).toContain("src/app.ts");

      // Verify module metrics
      const metrics = indexer.store.getModuleMetrics();
      expect(metrics.length).toBe(2);
      const appMetrics = metrics.find((m) => m.filePath === "src/app.ts");
      expect(appMetrics?.fanOut).toBeGreaterThan(0);
    } finally {
      indexer.store.close();
    }
  });
});
