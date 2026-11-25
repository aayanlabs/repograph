import { describe, expect, it } from "vitest";

import {
  createAiProvider,
  explainArchitecture,
  explainImpact,
  queryGraphNaturalLanguage,
} from "./ai.js";
import { GraphStore } from "./storage.js";

describe("ai integration layer", () => {
  it("initializes mock provider safely without external credentials", () => {
    const provider = createAiProvider({ provider: "mock" });
    expect(provider.id).toBe("mock");
    expect(provider.name).toContain("Local Grounded Engine");
  });

  it("generates grounded architecture explanation from GraphStore", async () => {
    const store = new GraphStore(":memory:");
    store.upsertFile({
      path: "src/server.ts",
      absolutePath: "/app/src/server.ts",
      size: 500,
      modifiedTimeMs: Date.now(),
      hash: "h1",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    });

    const explanation = await explainArchitecture(store);
    expect(explanation).toBeDefined();
    expect(typeof explanation).toBe("string");
    expect(explanation.length).toBeGreaterThan(20);

    store.close();
  });

  it("generates impact explanation and natural language query response", async () => {
    const store = new GraphStore(":memory:");
    store.upsertFile({
      path: "src/auth.ts",
      absolutePath: "/app/src/auth.ts",
      size: 300,
      modifiedTimeMs: Date.now(),
      hash: "h2",
      language: "typescript",
      isBinary: false,
      isTooLarge: false,
    });

    const fileNode = store.getNode("src/auth.ts");
    expect(fileNode).not.toBeNull();

    const impactExplanation = await explainImpact(store, fileNode!.id, 2);
    expect(impactExplanation).toContain("risk");

    const nlResponse = await queryGraphNaturalLanguage(store, "find circular dependencies");
    expect(nlResponse.answer).toBeDefined();
    expect(nlResponse.facts.length).toBeGreaterThan(0);

    store.close();
  });
});
