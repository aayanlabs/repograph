#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { Command } from "commander";

import {
  RepositoryIndexer,
  RetrievalEngine,
  defaultDatabasePath,
  exportGraph,
  findCycles,
  findGitRoot,
  findPath,
  formatContextResult,
  generateDashboardHtml,
  watchRepository,
} from "@repograph/core";

const program = new Command()
  .name("repograph")
  .description("RepoGraph by aayanlabs — A local-first semantic code graph for AI coding agents")
  .version("0.1.0 (RepoGraph by aayanlabs)");

program
  .command("init")
  .description("Index a Git repository")
  .argument("[path]", "repository path", ".")
  .option("--force", "reparse every supported file")
  .action(async (path: string, options: { force?: boolean }) => {
    const root = await findGitRoot(resolve(path));
    const databasePath = defaultDatabasePath(root);
    const indexer = new RepositoryIndexer(databasePath);
    try {
      const summary = await indexer.index({
        rootDir: root,
        databasePath,
        force: options.force,
      });
      printJson(summary);
    } finally {
      indexer.store.close();
    }
  });

program
  .command("update")
  .description("Incrementally update the repository index")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    await runIndex(path, false);
  });

program
  .command("status")
  .description("Show index and graph statistics")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const root = await findGitRoot(resolve(path));
    const databasePath = defaultDatabasePath(root);
    if (!existsSync(databasePath)) {
      console.error("RepoGraph is not initialized. Run `repograph init` first.");
      process.exitCode = 1;
      return;
    }
    const indexer = new RepositoryIndexer(databasePath);
    try {
      printJson({ root, databasePath, ...indexer.store.stats() });
    } finally {
      indexer.store.close();
    }
  });

program
  .command("search")
  .description("Find symbols and files by lexical relevance")
  .argument("<query>")
  .option("-p, --path <path>", "repository path", ".")
  .option("-l, --limit <number>", "maximum results", parseLimit, 20)
  .action(async (query: string, options: { path: string; limit: number }) => {
    const engine = await openEngine(options.path);
    try {
      printJson(engine.search(query, options.limit));
    } finally {
      engine.store.close();
    }
  });

program
  .command("context")
  .description("Retrieve ranked code context for a task")
  .argument("<task>")
  .option("-p, --path <path>", "repository path", ".")
  .option("-l, --limit <number>", "maximum results", parseLimit, 12)
  .action(async (task: string, options: { path: string; limit: number }) => {
    const engine = await openEngine(options.path);
    try {
      const context = await engine.context(task, options.limit);
      console.log(context.map(formatContextResult).join("\n\n---\n\n"));
    } finally {
      engine.store.close();
    }
  });

program
  .command("deps")
  .description("Show direct dependencies of a file or symbol")
  .argument("<target>")
  .option("-p, --path <path>", "repository path", ".")
  .action(async (target: string, options: { path: string }) => {
    const engine = await openEngine(options.path);
    try {
      printJson(engine.dependencies(target));
    } finally {
      engine.store.close();
    }
  });

program
  .command("impact")
  .description("Show direct and indirect dependents")
  .argument("<target>")
  .option("-p, --path <path>", "repository path", ".")
  .option("-d, --depth <number>", "traversal depth", parseLimit, 3)
  .action(async (target: string, options: { path: string; depth: number }) => {
    const engine = await openEngine(options.path);
    try {
      printJson(engine.impact(target, options.depth));
    } finally {
      engine.store.close();
    }
  });

program
  .command("path")
  .description("Find shortest call or import path between two symbols or files")
  .argument("<source>", "source symbol or file")
  .argument("<target>", "target symbol or file")
  .option("-p, --path <path>", "repository path", ".")
  .action(async (source: string, target: string, options: { path: string }) => {
    const engine = await openEngine(options.path);
    try {
      printJson(findPath(engine.store, source, target));
    } finally {
      engine.store.close();
    }
  });

program
  .command("cycles")
  .description("Find circular dependency or import loops in the repository")
  .option("-p, --path <path>", "repository path", ".")
  .action(async (options: { path: string }) => {
    const engine = await openEngine(options.path);
    try {
      printJson(findCycles(engine.store));
    } finally {
      engine.store.close();
    }
  });

program
  .command("export")
  .description("Export repository graph in JSON or GraphML format")
  .option("-p, --path <path>", "repository path", ".")
  .option("-f, --format <format>", "export format (json|graphml)", "json")
  .action(async (options: { path: string; format: string }) => {
    const engine = await openEngine(options.path);
    try {
      const format = options.format.toLowerCase() === "graphml" ? "graphml" : "json";
      console.log(exportGraph(engine.store, format));
    } finally {
      engine.store.close();
    }
  });

program
  .command("watch")
  .description("Continuously incrementally update the index on file changes")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const root = await findGitRoot(resolve(path));
    console.error(`Watching ${root} for file changes...`);
    const watcher = watchRepository({
      rootDir: root,
      onUpdate: (summary) => {
        console.error(
          `Updated ${summary.indexedFiles} files, removed ${summary.removedFiles}; ${summary.durationMs}ms`,
        );
      },
    });
    process.once("SIGINT", () => {
      watcher.close();
      process.exit(0);
    });
    await new Promise<void>(() => undefined);
  });

program
  .command("ui")
  .description("Launch interactive web visualizer dashboard for the code graph")
  .option("-p, --path <path>", "repository path", ".")
  .option("--port <number>", "HTTP server port", "3333")
  .action(async (options: { path: string; port: string }) => {
    const engine = await openEngine(options.path);
    const port = Number.parseInt(options.port, 10) || 3333;
    const html = generateDashboardHtml(engine.store);

    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });

    server.listen(port, () => {
      console.error(`RepoGraph UI dashboard running at http://localhost:${port}`);
      console.error("Press Ctrl+C to stop.");
    });

    process.once("SIGINT", () => {
      server.close();
      engine.store.close();
      process.exit(0);
    });
  });

program
  .command("mcp")
  .description("Start the MCP server over stdio")
  .option("-p, --path <path>", "repository path", ".")
  .action(async (options: { path: string }) => {
    const { startMcpServer } = await import("@repograph/mcp");
    await startMcpServer(options.path);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function runIndex(path: string, force: boolean): Promise<void> {
  const root = await findGitRoot(resolve(path));
  const databasePath = defaultDatabasePath(root);
  const indexer = new RepositoryIndexer(databasePath);
  try {
    printJson(await indexer.index({ rootDir: root, databasePath, force }));
  } finally {
    indexer.store.close();
  }
}

async function openEngine(path: string): Promise<RetrievalEngine> {
  const root = await findGitRoot(resolve(path));
  const databasePath = defaultDatabasePath(root);
  if (!existsSync(databasePath)) {
    throw new Error("RepoGraph is not initialized. Run `repograph init` first.");
  }
  const indexer = new RepositoryIndexer(databasePath);
  return new RetrievalEngine(indexer.store);
}

function parseLimit(value: string): number {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Limit must be an integer from 1 to 1000");
  }
  return limit;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
