# RepoGraph

RepoGraph is a local-first semantic codebase graph for AI coding agents. It
indexes a repository into a structured, queryable model so an agent can
retrieve the files, symbols, and relationships relevant to a task without
scanning the entire codebase.

## Status

The repository is being built in phases. The current foundation includes:

- A strict TypeScript monorepo managed with pnpm
- Separate core, CLI, and MCP package boundaries
- Vitest, ESLint, and Prettier checks
- Parser and benchmark extension points

The indexing and graph implementation is the next development milestone.

## Development

Requirements:

- Node.js 20 or newer
- pnpm 10 or newer

Install dependencies and run the verification suite:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

## Architecture

- `packages/core` owns indexing, parsing, persistence, traversal, and
  retrieval logic.
- `packages/cli` provides the developer-facing command line interface.
- `packages/mcp` exposes the core retrieval engine to AI coding agents.
- `parsers` contains language-specific parser boundaries.
- `benchmarks` contains reproducible performance measurements.
- `docs` contains architecture and public API documentation.

The core system is designed to remain local by default and to avoid external
services or model dependencies for structural analysis.
