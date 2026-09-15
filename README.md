# RepoGraph by aayanlabs

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Build & Test](https://img.shields.io/badge/tests-24%20passed-success.svg)](#development)

**RepoGraph by aayanlabs** is a local-first, zero-cloud semantic codebase graph built specifically for AI coding agents and developers. It indexes repository source code into a structured, SQLite-powered graph model, enabling AI agents to query symbols, dependencies, impact paths, and circular imports instantly without scanning entire files or burning LLM context windows.

> **Copyright (c) 2026 aayanlabs** — Released under the MIT License.

---

## 🚀 Features

- **Local-First & Fast**: Uses native Node.js SQLite (`node:sqlite`) with WAL mode, FTS5 full-text indexing, and Degree Centrality scoring. Zero external cloud APIs.
- **Multi-Language AST Parsing**:
  - **TypeScript / TSX / JavaScript / JSX**: Powered by `tree-sitter`.
  - **Python (`.py`) & Go (`.go`)**: Regex-based fallback AST parser for functions, classes, structs, interfaces, methods, imports, and inheritance.
- **Interactive Web UI Dashboard**: Run `repograph ui` to launch a local browser-based force-directed graph dashboard with live search, zoom, pan, and node inspection.
- **Model Context Protocol (MCP) Server**: Native stdio MCP server integration so AI assistants (Claude, Antigravity, Cursor, etc.) can query code context autonomously.
- **Graph Traversal Engines**:
  - **Shortest Path Finder**: Breadth-First Search (BFS) call/import paths between symbols or files.
  - **Cycle Detector**: Depth-First Search (DFS) circular import & dependency loop finder.
  - **Multi-Hop Impact Analysis**: Trace direct and indirect downstream dependents.
  - **Graph Exporter**: Export code graphs to standard JSON or GraphML format.
- **Real-Time File Watcher**: `repograph watch` continuously syncs incremental graph updates as you edit files.

---

## 📦 Package Architecture

RepoGraph is built as a clean TypeScript monorepo managed with `pnpm`:

```
RepoGraph/
├── packages/
│   ├── core/         # Parsing, SQLite storage (FTS5), scanner, indexing, graph algorithms, visualizer
│   ├── cli/          # Commander-based CLI executable (`repograph`)
│   └── mcp/          # Model Context Protocol (MCP) stdio server
├── benchmarks/       # Reproducible indexing & query performance benchmark suite
└── tests/            # Integration & cross-package test suite
```

---

## ⚙️ Prerequisites & Installation

### Requirements

- **Node.js**: `>= 22.5.0` (requires native `node:sqlite`)
- **pnpm**: `>= 10.0.0`

### Clone & Install

```bash
git clone https://github.com/aayanlabs/repograph.git
cd repograph
pnpm install
pnpm build
```

Link CLI globally (optional):

```bash
cd packages/cli
npm link
```

---

## 📖 CLI Usage & Commands

Run `repograph` in any repository:

```bash
repograph <command> [options]
```

| Command            | Description                                           | Example                              |
| ------------------ | ----------------------------------------------------- | ------------------------------------ |
| `init [path]`      | Index a repository into `.repograph/graph.db`         | `repograph init .`                   |
| `update [path]`    | Incrementally update index for modified files         | `repograph update`                   |
| `status [path]`    | Display graph statistics (files, nodes, edges)        | `repograph status`                   |
| `search <query>`   | Search symbols by name, path, or signature using FTS5 | `repograph search UserService`       |
| `context <task>`   | Retrieve ranked code context for a coding task        | `repograph context "fix login auth"` |
| `deps <target>`    | List direct outgoing dependencies                     | `repograph deps src/auth.ts`         |
| `impact <target>`  | List multi-hop downstream dependents                  | `repograph impact src/types.ts`      |
| `path <src> <dst>` | Find shortest call/import path between symbols/files  | `repograph path User Auth`           |
| `cycles`           | Find circular import loops across files               | `repograph cycles`                   |
| `export [options]` | Export repository graph in JSON or GraphML format     | `repograph export --format graphml`  |
| `watch [path]`     | Watch directory and incrementally index on file save  | `repograph watch`                    |
| `ui [path]`        | Launch interactive graph dashboard web server         | `repograph ui --port 3333`           |
| `mcp [path]`       | Start MCP server over stdio for AI tools              | `repograph mcp`                      |

---

## 🌐 Interactive Web UI Dashboard

Run `repograph ui` in your project directory:

```bash
repograph ui --port 3333
```

Open `http://localhost:3333` in your browser to inspect your codebase visually:

- **Canvas Graph View**: Interactive force-directed network rendering.
- **Node Color Coding**: Symbol kinds (`class`, `function`, `interface`, `file`, etc.).
- **Live Search & Filter**: Real-time symbol search highlighting.
- **Symbol Inspector**: Click any node to view incoming/outgoing relationships and source locations.

---

## 🤖 Model Context Protocol (MCP) Integration

RepoGraph seamlessly connects with AI assistants (Claude Desktop, Antigravity, Cursor, Windsurf).

### MCP Configuration Example (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "repograph": {
      "command": "node",
      "args": ["/path/to/repograph/packages/mcp/dist/index.js", "/path/to/your/project"]
    }
  }
}
```

### Exposed MCP Tools

- `repo_search`: Lexical & degree-weighted symbol search.
- `repo_context`: Retrieve ranked, contextually relevant code snippets for tasks.
- `repo_symbol`: Get complete metadata and source location for a symbol.
- `repo_dependencies`: Find outgoing dependencies of a symbol/file.
- `repo_dependents`: Find incoming dependents of a symbol/file.
- `repo_impact`: Multi-hop downstream impact analysis.
- `repo_path`: Shortest relationship path between two symbols/files.
- `repo_cycles`: Detect circular dependency loops.
- `repo_export`: Export graph data in JSON or GraphML formats.

---

## 🛠️ Development & Testing

Run full verification suite:

```bash
# Run unit & integration test suite (24 tests)
pnpm test

# Run TypeScript typechecking across monorepo
pnpm typecheck

# Run ESLint check
pnpm lint

# Run Prettier code format check
pnpm format:check

# Auto-format all files
pnpm format

# Run performance benchmarks
pnpm --filter benchmarks test
```

---

## 📜 License & Copyright

**RepoGraph by aayanlabs** is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 **aayanlabs** (`mdaayanmalik9291@gmail.com`).
