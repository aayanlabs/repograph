import { describe, expect, it } from "vitest";

import { fileNodeId } from "./index.js";

describe("core package", () => {
  it("creates stable file node identifiers", () => {
    expect(fileNodeId("src/index.ts")).toBe(fileNodeId("src/index.ts"));
    expect(fileNodeId("src/index.ts")).not.toBe(fileNodeId("src/other.ts"));
  });
});
