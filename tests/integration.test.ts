import { join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { RepositoryIndexer, RetrievalEngine, defaultDatabasePath } from "@repograph/core";

describe("integration - repo indexing & context retrieval", () => {
  it("indexes sample repository and queries context", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "repograph-integration-test-"));
    const dbPath = defaultDatabasePath(tmpDir);

    try {
      await mkdir(join(tmpDir, "src"), { recursive: true });

      await writeFile(
        join(tmpDir, "src", "service.ts"),
        `
        export interface Config {
          port: number;
        }

        export class ServerService {
          constructor(private config: Config) {}

          start(): void {
            console.log("Server started");
          }
        }
        `,
      );

      await writeFile(
        join(tmpDir, "src", "index.ts"),
        `
        import { ServerService } from "./service.js";

        const server = new ServerService({ port: 8080 });
        server.start();
        `,
      );

      const indexer = new RepositoryIndexer(dbPath);
      const summary = await indexer.index({ rootDir: tmpDir, databasePath: dbPath });

      expect(summary.scannedFiles).toBe(2);
      expect(summary.indexedFiles).toBe(2);
      if (summary.parseErrors.length > 0) {
        console.error("DEBUG parseError message:", summary.parseErrors[0].message);
      }
      expect(summary.parseErrors).toHaveLength(0);

      const engine = new RetrievalEngine(indexer.store);
      const searchResults = engine.search("ServerService");

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0]?.node.name).toBe("ServerService");

      const contextResults = await engine.context("ServerService");
      expect(contextResults.length).toBeGreaterThan(0);

      indexer.store.close();
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
