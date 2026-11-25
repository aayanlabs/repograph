import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { performance } from "node:perf_hooks";

import { fileNodeId } from "./ids.js";
import { parseSource } from "./parser.js";
import { isGeneratedPath, isIndexableSource, scanRepository } from "./scanner.js";
import { GraphStore } from "./storage.js";
import type {
  GraphEdge,
  IndexOptions,
  IndexSummary,
  NamedImport,
  RepositoryFile,
  UnresolvedCall,
  UnresolvedInheritance,
} from "./types.js";

interface FileResolutionContext {
  file: RepositoryFile;
  namedImports: NamedImport[];
  unresolvedCalls: UnresolvedCall[];
  unresolvedInheritance: UnresolvedInheritance[];
}

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
    const contexts: FileResolutionContext[] = [];

    for (const file of files) {
      this.store.upsertFile(file);
    }

    // Pass 1: Parse and store local graph + exported symbol table
    for (const file of files) {
      const previous = previousByPath.get(file.path);
      const isUnchanged =
        !options.force && previous?.hash === file.hash && previous.size === file.size;

      if (isUnchanged) {
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
        if (parsed.exportedSymbols && parsed.exportedSymbols.length > 0) {
          this.store.saveExportedSymbols(file.path, parsed.exportedSymbols);
        }

        contexts.push({
          file,
          namedImports: parsed.namedImports ?? [],
          unresolvedCalls: parsed.unresolvedCalls ?? [],
          unresolvedInheritance: parsed.unresolvedInheritance ?? [],
        });

        if (parsed.parseError) {
          parseErrors.push({ path: file.path, message: parsed.parseError });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.store.replaceFileGraph(file, [], [], []);
        parseErrors.push({ path: file.path, message });
      }
    }

    // Pass 2: Cross-File Resolution (Imports, Calls, Inheritance)
    let crossFileEdgesResolved = 0;
    const crossFileEdges: GraphEdge[] = [];

    const exportedByName = new Map<string, ReturnType<GraphStore["getAllExportedSymbols"]>>();
    const exportedByFile = new Map<string, ReturnType<GraphStore["getAllExportedSymbols"]>>();
    if (contexts.length > 0) {
      for (const sym of this.store.getAllExportedSymbols()) {
        const byName = exportedByName.get(sym.name);
        if (byName) byName.push(sym);
        else exportedByName.set(sym.name, [sym]);

        const byFile = exportedByFile.get(sym.filePath);
        if (byFile) byFile.push(sym);
        else exportedByFile.set(sym.filePath, [sym]);
      }
    }

    for (const ctx of contexts) {
      const localMap = new Map<string, { nodeId: string; targetPath: string; isFile: boolean }>();

      // 1. Resolve named imports to target exported symbols
      for (const imp of ctx.namedImports) {
        const targetPath = resolveImportPath(ctx.file, imp.specifier, currentPaths);
        if (!targetPath) continue;

        const targetFileId = fileNodeId(targetPath);
        const fileExports = exportedByFile.get(targetPath) ?? [];

        if (imp.importedName === "*") {
          localMap.set(imp.localName, { nodeId: targetFileId, targetPath, isFile: true });
          continue;
        }

        if (imp.isDefault) {
          const defSym =
            fileExports.find((s) => s.isDefault) ??
            fileExports.find((s) => s.name === "default") ??
            null;
          if (defSym) {
            localMap.set(imp.localName, { nodeId: defSym.nodeId, targetPath, isFile: false });
            crossFileEdges.push({
              sourceId: fileNodeId(ctx.file.path),
              targetId: defSym.nodeId,
              kind: "references",
              metadata: {
                confidence: "static",
                specifier: imp.specifier,
                importedName: "default",
              },
            });
          } else {
            localMap.set(imp.localName, { nodeId: targetFileId, targetPath, isFile: true });
          }
          continue;
        }

        const targetSym = fileExports.find((s) => s.name === imp.importedName) ?? null;
        if (targetSym) {
          localMap.set(imp.localName, { nodeId: targetSym.nodeId, targetPath, isFile: false });
          crossFileEdges.push({
            sourceId: fileNodeId(ctx.file.path),
            targetId: targetSym.nodeId,
            kind: "references",
            metadata: {
              confidence: "static",
              specifier: imp.specifier,
              importedName: imp.importedName,
            },
          });
        }
      }

      // 2. Resolve cross-file calls
      for (const call of ctx.unresolvedCalls) {
        const callerId = call.callerSymbolId ?? fileNodeId(ctx.file.path);
        const resolved = localMap.get(call.callName);
        if (resolved && !resolved.isFile) {
          crossFileEdges.push({
            sourceId: callerId,
            targetId: resolved.nodeId,
            kind: "calls",
            metadata: {
              confidence: "static",
              callName: call.callName,
              line: String(call.line),
            },
          });
        } else {
          // Unambiguous unique project-wide match fallback
          const allMatches = (exportedByName.get(call.callName) ?? []).filter(
            (s) => s.kind === "function" || s.kind === "method" || s.kind === "class",
          );
          const singleCallMatch = allMatches.length === 1 ? allMatches[0] : undefined;
          if (singleCallMatch && singleCallMatch.filePath !== ctx.file.path) {
            crossFileEdges.push({
              sourceId: callerId,
              targetId: singleCallMatch.nodeId,
              kind: "calls",
              metadata: {
                confidence: "inferred",
                callName: call.callName,
                line: String(call.line),
              },
            });
          }
        }
      }

      // 3. Resolve cross-file class inheritance & interface implementation
      for (const inh of ctx.unresolvedInheritance) {
        const resolved = localMap.get(inh.parentName);
        if (resolved && !resolved.isFile) {
          crossFileEdges.push({
            sourceId: inh.childSymbolId,
            targetId: resolved.nodeId,
            kind: inh.kind,
            metadata: {
              confidence: "static",
              parentName: inh.parentName,
            },
          });
        } else {
          const allMatches = (exportedByName.get(inh.parentName) ?? []).filter(
            (s) => s.kind === "class" || s.kind === "interface" || s.kind === "type",
          );
          const singleInhMatch = allMatches.length === 1 ? allMatches[0] : undefined;
          if (singleInhMatch) {
            crossFileEdges.push({
              sourceId: inh.childSymbolId,
              targetId: singleInhMatch.nodeId,
              kind: inh.kind,
              metadata: {
                confidence: "inferred",
                parentName: inh.parentName,
              },
            });
          }
        }
      }
    }

    if (crossFileEdges.length > 0) {
      this.store.insertEdges(crossFileEdges);
      crossFileEdgesResolved = crossFileEdges.length;
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
      crossFileEdgesResolved,
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
    `${base}.vue`,
    `${base}.svelte`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.vue`,
    `${base}/index.svelte`,
  ];
  return candidates.find((candidate) => repositoryPaths.has(candidate)) ?? null;
}

export function defaultDatabasePath(rootDir: string): string {
  return join(rootDir, ".repograph", "index.sqlite");
}
