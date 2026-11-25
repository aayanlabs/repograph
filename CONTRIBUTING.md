# Contributing to RepoGraph

Thank you for your interest in contributing to **RepoGraph**!

## Development Setup

1. Ensure you have **Node.js `>= 22.5.0`** (required for `node:sqlite`) and **pnpm `>= 10.0.0`**.
2. Clone and install dependencies:

   ```bash
   git clone https://github.com/aayanlabs/repograph.git
   cd repograph
   pnpm install
   pnpm build
   ```

## Verification Before Opening a PR

All pull requests must pass the full CI verification suite:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

You can auto-format code with:

```bash
pnpm format
```

## Areas Where Contributions Are Welcome

- **Language Parsers**: Expanding AST / symbol extraction in `packages/core/src/parser.ts` (e.g., Rust, Java, C#, Ruby).
- **Graph Algorithms & Metrics**: Additional static metrics or traversal queries in `packages/core/src/query.ts` and `packages/core/src/storage.ts`.
- **Dashboard UX**: Enhancements to the 5-mode visualizer in `packages/core/src/visualizer.ts`.
- **MCP Tools & Workflows**: New MCP tools or agent workflows in `packages/mcp/src/index.ts`.
