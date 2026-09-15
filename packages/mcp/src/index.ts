import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GraphStore,
  RetrievalEngine,
  defaultDatabasePath,
  exportGraph,
  findCycles,
  findGitRoot,
  findPath,
  formatContextResult,
} from "@repograph/core";
import { z } from "zod";

export async function startMcpServer(repositoryPath: string): Promise<void> {
  const root = await findGitRoot(repositoryPath);
  const store = new GraphStore(defaultDatabasePath(root));
  const engine = new RetrievalEngine(store);
  const server = new McpServer({
    name: "repograph-by-aayanlabs",
    version: "0.1.0",
  });

  server.registerTool(
    "repo_search",
    {
      description: "Search indexed symbols and files by lexical relevance.",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ query, limit }) => textResult(engine.search(query, limit ?? 20)),
  );
  server.registerTool(
    "repo_context",
    {
      description: "Retrieve compact, ranked source context for a coding task.",
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
      description: "Look up an indexed symbol or file.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.search(target, 20)),
  );
  server.registerTool(
    "repo_dependencies",
    {
      description: "List direct dependencies of a file or symbol.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.dependencies(target)),
  );
  server.registerTool(
    "repo_dependents",
    {
      description: "List direct dependents of a file or symbol.",
      inputSchema: { target: z.string() },
    },
    async ({ target }) => textResult(engine.dependents(target)),
  );
  server.registerTool(
    "repo_impact",
    {
      description: "List direct and indirect dependents up to a traversal depth.",
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
    async ({ source, target }) => textResult(findPath(engine.store, source, target)),
  );
  server.registerTool(
    "repo_cycles",
    {
      description: "Find circular dependency or import loops in the repository.",
      inputSchema: {},
    },
    async () => textResult(findCycles(engine.store)),
  );
  server.registerTool(
    "repo_export",
    {
      description: "Export repository graph in JSON or GraphML format.",
      inputSchema: { format: z.enum(["json", "graphml"]).optional() },
    },
    async ({ format }) => ({
      content: [{ type: "text", text: exportGraph(engine.store, format ?? "json") }],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(value: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
