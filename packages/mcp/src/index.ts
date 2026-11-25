import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GraphStore,
  RetrievalEngine,
  defaultDatabasePath,
  explainArchitecture,
  exportGraph,
  findCycles,
  findGitRoot,
  findPath,
  formatContextResult,
} from "@repograph/core";
import { z } from "zod";

export function createRepoGraphMcpServer(repositoryPath: string, store?: GraphStore): McpServer {
  const currentStore = store ?? new GraphStore(defaultDatabasePath(repositoryPath));
  const engine = new RetrievalEngine(currentStore);
  const server = new McpServer({
    name: "repograph-by-aayanlabs",
    version: "0.2.0",
  });

  // 1. Repository Overview & Architecture
  server.registerTool(
    "get_repository_overview",
    {
      description: "Get high-level repository statistics, languages, modules, and architecture summary.",
      inputSchema: {},
    },
    async () => {
      const stats = currentStore.stats();
      const files = currentStore.getFiles();
      const cycles = findCycles(currentStore);
      const metrics = currentStore.getModuleMetrics();
      const langCounts: Record<string, number> = {};
      files.forEach((f) => {
        const l = f.language ?? "other";
        langCounts[l] = (langCounts[l] ?? 0) + 1;
      });

      return textResult({
        stats,
        languages: langCounts,
        circularDependencyLoops: cycles.length,
        topCoupledModules: metrics
          .slice()
          .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
          .slice(0, 5),
      });
    },
  );

  server.registerTool(
    "explain_architecture",
    {
      description: "Generate a grounded architectural overview explaining module boundaries and coupling.",
      inputSchema: {},
    },
    async () => {
      const explanation = await explainArchitecture(currentStore);
      return { content: [{ type: "text", text: explanation }] };
    },
  );

  // 2. Symbol Search
  server.registerTool(
    "search_symbols",
    {
      description: "Search symbols by name, path, or signature with optional kind filtering.",
      inputSchema: {
        query: z.string(),
        kind: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ query, kind, limit }) => {
      let results = engine.search(query, limit ?? 20);
      if (kind) {
        results = results.filter((r) => r.node.kind === kind);
      }
      return textResult(results);
    },
  );

  // 3. Dependencies & Dependents
  server.registerTool(
    "get_dependencies",
    {
      description: "List direct outgoing dependencies of a file or symbol.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.dependencies(target)),
  );

  server.registerTool(
    "get_dependents",
    {
      description: "List direct incoming dependents of a file or symbol.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.dependents(target)),
  );

  server.registerTool(
    "get_file_relationships",
    {
      description: "List both incoming and outgoing dependencies for a specific file path.",
      inputSchema: { filePath: z.string() },
    },
    async ({ filePath }) => {
      const incoming = engine.dependents(filePath);
      const outgoing = engine.dependencies(filePath);
      const metrics = currentStore.getModuleMetrics(filePath)[0] ?? null;
      return textResult({ filePath, metrics, incoming, outgoing });
    },
  );

  // 4. Impact Analysis & Blast Radius
  server.registerTool(
    "analyze_impact",
    {
      description:
        "Perform multi-hop downstream blast radius analysis for a file or symbol with risk scoring and causal paths.",
      inputSchema: {
        target: z.string(),
        depth: z.number().int().min(1).max(10).optional(),
      },
    },
    async ({ target, depth }) => {
      const report = currentStore.getImpactReport(target, depth ?? 3);
      return textResult(report ?? { error: `Target '${target}' not found in graph.` });
    },
  );

  // 5. Context & Path Tracing
  server.registerTool(
    "get_relevant_context",
    {
      description: "Retrieve ranked code snippets and symbol relationships relevant to a task.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ task, limit }) => {
      const context = await engine.context(task, limit ?? 12);
      return {
        content: [{ type: "text", text: context.map(formatContextResult).join("\n\n---\n\n") }],
      };
    },
  );

  server.registerTool(
    "find_cycles",
    {
      description: "Detect circular import loops across repository files.",
      inputSchema: {},
    },
    async () => textResult(findCycles(currentStore)),
  );

  server.registerTool(
    "get_module_metrics",
    {
      description: "Get fan-in, fan-out, instability index, and complexity metrics for files.",
      inputSchema: { filePath: z.string().optional() },
    },
    async ({ filePath }) => textResult(currentStore.getModuleMetrics(filePath)),
  );

  /* -------------------------------------------------------------------------- */
  /* Backward Compatibility Aliases for existing MCP clients                    */
  /* -------------------------------------------------------------------------- */
  server.registerTool(
    "repo_search",
    {
      description: "Legacy alias for search_symbols: Search indexed symbols and files by lexical relevance.",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ query, limit }) => textResult(engine.search(query, limit ?? 20)),
  );

  server.registerTool(
    "repo_context",
    {
      description: "Legacy alias for get_relevant_context: Retrieve compact, ranked source context for a task.",
      inputSchema: { task: z.string(), limit: z.number().int().min(1).max(50).optional() },
    },
    async ({ task, limit }) => {
      const context = await engine.context(task, limit ?? 12);
      return {
        content: [{ type: "text", text: context.map(formatContextResult).join("\n\n---\n\n") }],
      };
    },
  );

  server.registerTool(
    "repo_symbol",
    {
      description: "Legacy alias: Look up an indexed symbol or file.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.search(target, 20)),
  );

  server.registerTool(
    "repo_dependencies",
    {
      description: "Legacy alias: List direct dependencies of a file or symbol.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.dependencies(target)),
  );

  server.registerTool(
    "repo_dependents",
    {
      description: "Legacy alias: List direct dependents of a file or symbol.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.dependents(target)),
  );

  server.registerTool(
    "repo_impact",
    {
      description: "Legacy alias: List direct and indirect dependents up to a traversal depth.",
      inputSchema: { target: z.string(), depth: z.number().int().min(1).max(10).optional() },
    },
    async ({ target, depth }) => textResult(engine.impact(target, depth ?? 3)),
  );

  server.registerTool(
    "repo_path",
    {
      description: "Find shortest call or import path between two symbols or files.",
      inputSchema: { source: z.string(), target: z.string() },
    },
    async ({ source, target }) => textResult(findPath(currentStore, source, target)),
  );

  server.registerTool(
    "repo_cycles",
    {
      description: "Legacy alias: Find circular dependency or import loops in the repository.",
      inputSchema: {},
    },
    async () => textResult(findCycles(currentStore)),
  );

  server.registerTool(
    "repo_export",
    {
      description: "Export repository graph in JSON or GraphML format.",
      inputSchema: { format: z.enum(["json", "graphml"]).optional() },
    },
    async ({ format }) => ({
      content: [{ type: "text", text: exportGraph(currentStore, format ?? "json") }],
    }),
  );

  return server;
}

export async function startMcpServer(repositoryPath: string): Promise<void> {
  const root = await findGitRoot(repositoryPath);
  const server = createRepoGraphMcpServer(root);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(value: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
