import { join, resolve } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  findGitRoot,
  isGeneratedPath,
  isIndexableSource,
  languageForPath,
  scanRepository,
} from "./scanner.js";

describe("scanner", () => {
  it("determines correct language from file extension", () => {
    expect(languageForPath("src/index.ts")).toBe("typescript");
    expect(languageForPath("src/App.tsx")).toBe("tsx");
    expect(languageForPath("src/utils.js")).toBe("javascript");
    expect(languageForPath("src/Component.jsx")).toBe("jsx");
    expect(languageForPath("src/module.mjs")).toBe("javascript");
    expect(languageForPath("src/config.cjs")).toBe("javascript");
    expect(languageForPath("README.md")).toBeNull();
    expect(languageForPath("package.json")).toBeNull();
  });

  it("identifies generated file paths", () => {
    expect(isGeneratedPath("src/schema.generated.ts")).toBe(true);
    expect(isGeneratedPath("src/types.gen.ts")).toBe(true);
    expect(isGeneratedPath("src/generated/types.ts")).toBe(true);
    expect(isGeneratedPath("src/__generated__/graphql.ts")).toBe(true);
    expect(isGeneratedPath("src/normal.ts")).toBe(false);
  });

  it("checks whether file is indexable source", () => {
    expect(
      isIndexableSource({
        path: "src/index.ts",
        absolutePath: "/app/src/index.ts",
        size: 100,
        modifiedTimeMs: Date.now(),
        hash: "abc",
        language: "typescript",
        isBinary: false,
        isTooLarge: false,
      }),
    ).toBe(true);

    expect(
      isIndexableSource({
        path: "image.png",
        absolutePath: "/app/image.png",
        size: 100,
        modifiedTimeMs: Date.now(),
        hash: "abc",
        language: null,
        isBinary: true,
        isTooLarge: false,
      }),
    ).toBe(false);
  });

  it("finds git root directory", async () => {
    const root = await findGitRoot(process.cwd());
    expect(root).toBe(resolve(process.cwd()));
  });

  it("scans repository while respecting ignores and size limits", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "repograph-scanner-test-"));
    try {
      await mkdir(join(tmpDir, "src"), { recursive: true });
      await mkdir(join(tmpDir, "node_modules"), { recursive: true });

      await writeFile(join(tmpDir, ".gitignore"), "ignored.ts\nnode_modules/");
      await writeFile(join(tmpDir, "src", "main.ts"), "console.log('hello');");
      await writeFile(join(tmpDir, "src", "ignored.ts"), "export const a = 1;");
      await writeFile(join(tmpDir, "node_modules", "lib.ts"), "export const b = 2;");

      const files = await scanRepository({ rootDir: tmpDir, maxFileSizeBytes: 1024 });

      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/main.ts");
      expect(paths).not.toContain("src/ignored.ts");
      expect(paths).not.toContain("node_modules/lib.ts");

      const mainFile = files.find((f) => f.path === "src/main.ts");
      expect(mainFile?.language).toBe("typescript");
      expect(mainFile?.hash).toHaveLength(64);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
