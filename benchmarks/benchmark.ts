import { join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

import { RepositoryIndexer, RetrievalEngine, defaultDatabasePath } from "@repograph/core";

export interface BenchmarkMetrics {
  scannedFiles: number;
  indexedFiles: number;
  scanAndIndexTimeMs: number;
  searchLatencyMs: number;
  contextLatencyMs: number;
  impactLatencyMs: number;
  databaseSizeKb: number;
}

export async function runBenchmark(fileCount = 20): Promise<BenchmarkMetrics> {
  const tmpDir = await mkdtemp(join(tmpdir(), "repograph-benchmark-"));
  const dbPath = defaultDatabasePath(tmpDir);

  try {
    await mkdir(join(tmpDir, "src"), { recursive: true });

    // Generate sample files
    for (let i = 0; i < fileCount; i += 1) {
      const code = `
        export interface Model_${i} {
          id: string;
          value_${i}: number;
        }

        export class Service_${i} implements Model_${i} {
          id = "id_${i}";
          value_${i} = ${i};

          execute_${i}(): number {
            return this.value_${i} * 2;
          }
        }

        ${
          i > 0
            ? `
          import { Service_${i - 1} } from "./module_${i - 1}.js";
          export function runner_${i}() {
            const s = new Service_${i - 1}();
            return s.execute_${i - 1}();
          }
        `
            : ""
        }
      `;
      await writeFile(join(tmpDir, "src", `module_${i}.ts`), code);
    }

    const startTime = performance.now();
    const indexer = new RepositoryIndexer(dbPath);
    const summary = await indexer.index({ rootDir: tmpDir, databasePath: dbPath });
    const scanAndIndexTimeMs = Math.round(performance.now() - startTime);

    const engine = new RetrievalEngine(indexer.store);

    const searchStart = performance.now();
    engine.search("Service_0");
    const searchLatencyMs = Math.round((performance.now() - searchStart) * 100) / 100;

    const contextStart = performance.now();
    await engine.context("Service_0");
    const contextLatencyMs = Math.round((performance.now() - contextStart) * 100) / 100;

    const impactStart = performance.now();
    engine.impact("symbol:class:src/module_0.ts:Service_0:6:9", 3);
    const impactLatencyMs = Math.round((performance.now() - impactStart) * 100) / 100;

    indexer.store.close();

    return {
      scannedFiles: summary.scannedFiles,
      indexedFiles: summary.indexedFiles,
      scanAndIndexTimeMs,
      searchLatencyMs,
      contextLatencyMs,
      impactLatencyMs,
      databaseSizeKb: 0,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
