import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { performance } from "node:perf_hooks";

import { parseSource } from "./parser.js";
import { isGeneratedPath, isIndexableSource, scanRepository } from "./scanner.js";
import { GraphStore } from "./storage.js";
import type { IndexOptions, IndexSummary, RepositoryFile } from "./types.js";

export class RepositoryIndexer {
  readonly store: GraphStore;

  constructor(databasePath: string) {
    this.store = new GraphStore(databasePath);
  }

  async index(options: IndexOptions): Promise<IndexSummary> {
    const startedAt = performance.now();
    const files = await scanRepository(options);
    const currentPaths = new Set(files.map((file) => file.path));
    const previousFiles = this.store.getFiles();
    const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
    let indexedFiles = 0;
    let skippedFiles = 0;
    const parseErrors: Array<{ path: string; message: string }> = [];

    for (const file of files) {
      this.store.upsertFile(file);
    }

    for (const file of files) {
      const previous = previousByPath.get(file.path);
      if (!options.force && previous?.hash === file.hash && previous.size === file.size) {
        skippedFiles += 1;
        continue;
      }

      indexedFiles += 1;
      if (!isIndexableSource(file) || isGeneratedPath(file.path)) {
        this.store.replaceFileGraph(file, [], [], []);
        continue;
      }

      try {
        const source = await readFile(file.absolutePath, "utf8");
        const parsed = parseSource(file, source);
        const imports = parsed.imports.flatMap((entry) => {
          const targetPath = resolveImportPath(file, entry.specifier, currentPaths);
          return targetPath ? [{ targetPath, specifier: entry.specifier }] : [];
        });
        this.store.replaceFileGraph(file, parsed.symbols, parsed.edges, imports);
        if (parsed.parseError) {
          parseErrors.push({ path: file.path, message: parsed.parseError });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.store.replaceFileGraph(file, [], [], []);
        parseErrors.push({ path: file.path, message });
      }
    }

    const removedFiles = previousFiles.filter((file) => !currentPaths.has(file.path));
    for (const file of removedFiles) {
      this.store.removeFile(file.path);
    }

    return {
      rootDir: options.rootDir,
      databasePath: options.databasePath ?? "",
      scannedFiles: files.length,
      indexedFiles,
      skippedFiles,
      removedFiles: removedFiles.length,
      parseErrors,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

export function resolveImportPath(
  file: RepositoryFile,
  specifier: string,
  repositoryPaths: Set<string>,
): string | null {
  let base: string;

  if (specifier.startsWith(".")) {
    const fileDir = posix.dirname(file.path.replace(/\\/g, "/"));
    base = posix.normalize(posix.join(fileDir, specifier)).replace(/^\.\//, "");
  } else if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    const aliasPath = specifier.slice(2);
    const candidateSrc = `src/${aliasPath}`;
    base =
      repositoryPaths.has(candidateSrc) ||
      Array.from(repositoryPaths).some((p) => p.startsWith("src/"))
        ? candidateSrc
        : aliasPath;
  } else {
    return null;
  }

  base = base.replace(/\\/g, "/");

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
  return candidates.find((candidate) => repositoryPaths.has(candidate)) ?? null;
}

export function defaultDatabasePath(rootDir: string): string {
  return join(rootDir, ".repograph", "index.sqlite");
}
