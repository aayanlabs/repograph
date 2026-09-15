# RepoGraph architecture

RepoGraph is a local-first monorepo. The `@repograph/core` package owns all
repository analysis, graph storage, traversal, and retrieval behavior.

- `packages/core` — domain logic and persistence
- `packages/cli` — thin command-line interface
- `packages/mcp` — thin MCP adapter
- `parsers` — language-specific parser boundaries
- `tests` — cross-package tests
- `benchmarks` — reproducible performance measurements

The current phase only establishes these boundaries. Functional indexing is
intentionally deferred until the foundation is verified.
