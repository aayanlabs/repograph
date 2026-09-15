import { describe, expect, it } from "vitest";

import { runBenchmark } from "./benchmark.js";

describe("benchmarks", () => {
  it("runs performance benchmark suite and reports metrics", async () => {
    const metrics = await runBenchmark(10);
    expect(metrics.scannedFiles).toBe(10);
    expect(metrics.indexedFiles).toBe(10);
    expect(metrics.scanAndIndexTimeMs).toBeGreaterThan(0);
  }, 15000);
});
