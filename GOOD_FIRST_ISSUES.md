# Good First Issues

These are well-scoped issues for new contributors. Pick one, open an issue on GitHub referencing it, and submit a PR!

---

## 1. Add Rust Language Support (`parser.ts`)

**Labels**: `good first issue`, `enhancement`, `language-support`

Add a regex-based fallback parser for `.rs` files in `packages/core/src/parser.ts`, following the existing Python/Go patterns. Extract:

- `fn` → function
- `pub fn` → function (exported)
- `struct` → class
- `trait` → interface
- `impl` → method container
- `use` → import

**Files**: `packages/core/src/parser.ts`, `packages/core/src/scanner.ts` (add `.rs` to `LANGUAGE_BY_EXTENSION`)

---

## 2. Add Java Language Support (`parser.ts`)

**Labels**: `good first issue`, `enhancement`, `language-support`

Add a regex-based fallback parser for `.java` files. Extract:

- `public/private/protected class` → class
- `public/private/protected interface` → interface
- `public/private/protected .* method(` → method/function
- `import` → import
- `extends` / `implements` → edges

**Files**: `packages/core/src/parser.ts`, `packages/core/src/scanner.ts`

---

## 3. Add `repograph diff` Command for PR Impact Checks

**Labels**: `good first issue`, `enhancement`, `cli`

Add a CLI command that runs `git diff --name-only HEAD~1` (or accepts a base ref), then calls `analyze_impact` on each changed file and prints a combined blast-radius summary. This helps developers check impact before merging PRs.

**Files**: `packages/cli/src/index.ts`

---

## 4. Add Dark/Light Theme Toggle to Dashboard

**Labels**: `good first issue`, `enhancement`, `dashboard`

The visualizer currently only has a dark theme. Add a toggle button in the top nav that switches CSS custom properties between dark and light palettes. The Canvas render colors should also update.

**Files**: `packages/core/src/visualizer.ts`

---

## 5. Add Edge Bundling for Dense Graphs

**Labels**: `enhancement`, `dashboard`, `performance`

When a graph has 500+ edges, individual curved edges create visual clutter. Implement simple edge bundling (group edges that share source/target clusters into thicker bundled paths) in the Canvas render loop.

**Files**: `packages/core/src/visualizer.ts`

---

## 6. Export Dashboard as PNG/SVG

**Labels**: `good first issue`, `enhancement`, `dashboard`

Add a "Download" button to the floating toolbar that captures the current Canvas state via `canvas.toDataURL('image/png')` and triggers a download. Optionally support SVG export for the treemap view.

**Files**: `packages/core/src/visualizer.ts`

---

## 7. Add C# Language Support (`parser.ts`)

**Labels**: `good first issue`, `enhancement`, `language-support`

Add regex-based parsing for `.cs` files: `class`, `interface`, `struct`, `enum`, method signatures, `using` imports, and inheritance (`:` base class).

**Files**: `packages/core/src/parser.ts`, `packages/core/src/scanner.ts`

---

## 8. Add `repograph serve` with Live Reload

**Labels**: `enhancement`, `cli`, `dashboard`

Combine `repograph watch` + `repograph ui` into a single `repograph serve` command that watches for file changes, re-indexes incrementally, and sends a WebSocket signal to the browser to refresh the dashboard data without a full page reload.

**Files**: `packages/cli/src/index.ts`, `packages/core/src/visualizer.ts`
