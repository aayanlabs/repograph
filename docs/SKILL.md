---
name: repograph
description: Use RepoGraph's semantic code graph and MCP tools to inspect repository architecture, trace cross-file dependencies, analyze blast radius before edits, and retrieve ranked code context without reading entire files.
---

# RepoGraph Agent Intelligence Skill

RepoGraph indexes a software repository into a local SQLite (`node:sqlite` + FTS5) semantic code graph with cross-file symbol resolution, module coupling metrics, and blast-radius analysis.

## When to Use RepoGraph Tools

Use RepoGraph **before** grepping or reading dozens of files when working in an unfamiliar or large codebase:

1. **Repository Orientation (`get_repository_overview`, `explain_architecture`)**
   - At the start of a task, call `get_repository_overview` to see file/node/edge counts, language distribution, circular dependency loops, and the most coupled modules.
   - Call `explain_architecture` for a grounded structural summary based on actual graph metrics.

2. **Targeted Context Retrieval (`get_relevant_context`, `search_symbols`)**
   - Call `get_relevant_context(task, limit)` instead of guessing which files to open. It ranks symbols by FTS5 lexical relevance and degree centrality and includes incoming/outgoing relationships.
   - Use `search_symbols(query, kind?, limit?)` when looking for a specific class, function, interface, or file.

3. **Pre-Edit Impact & Blast Radius Check (`analyze_impact`, `get_dependents`)**
   - **Always** run `analyze_impact(target, depth)` before modifying a shared function, class, type, or module API.
   - Review `riskScore`, `affectedFiles`, and `affectedNodes` with their causal paths so you know which callers and tests may break.

4. **Dependency & Cycle Inspection (`get_dependencies`, `get_file_relationships`, `find_cycles`)**
   - Use `get_file_relationships(filePath)` to inspect a module's fan-in, fan-out, Martin instability index ($I = \text{FanOut} / (\text{FanIn} + \text{FanOut})$), and direct neighbors.
   - Run `find_cycles` after refactoring imports to verify no circular dependencies were introduced.

5. **Module Coupling & Health (`get_module_metrics`)**
   - Use `get_module_metrics(filePath?)` to identify fragile/volatile modules ($I > 0.8$) vs. stable core modules ($I < 0.2$).

## Recommended Agent Workflows

### Pre-Edit Safety Workflow

1. `search_symbols` to locate the exact symbol ID or file path.
2. `analyze_impact` with `depth: 3` to inspect all downstream dependents.
3. Update the symbol and any affected callers identified in `affectedFiles`.

### Post-Edit Verification Workflow

1. Run `repograph update` (or let `repograph watch` update the graph).
2. Call `find_cycles` to ensure no new import cycles exist.
3. Run the project's test suite covering the `affectedFiles` from `analyze_impact`.

## CLI Equivalents

- `repograph init` / `repograph update` — Index or incrementally update `.repograph/graph.db`
- `repograph overview` — Print repository summary, cycle warnings, and top coupled modules
- `repograph metrics [target]` — Print fan-in, fan-out, and instability metrics
- `repograph impact <target>` — Inspect downstream dependents
- `repograph ui` — Launch the 5-mode interactive web dashboard
- `repograph ai "<question>"` — Run grounded natural-language graph queries
