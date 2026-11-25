import { findCycles } from "./query.js";
import type { GraphStore } from "./storage.js";

export interface DashboardOptions {
  repositoryName?: string;
  branch?: string;
  aiEnabled?: boolean;
}

function escapeServerHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generate a self-contained, enterprise-grade interactive HTML dashboard
 * providing 5 distinct codebase intelligence visualization modes:
 *  1. Architecture View (Default)
 *  2. Dependency View
 *  3. Symbol View
 *  4. Impact Analysis View
 *  5. Codebase Map (Squarified Treemap)
 */
export function generateDashboardHtml(
  store: GraphStore,
  options: DashboardOptions = {},
): string {
  const files = store.getFiles();
  const nodes = store.allNodes();
  const edges = store.allEdges();
  const stats = store.stats();
  const metrics = store.getModuleMetrics();
  const cycles = findCycles(store);

  const repoName = options.repositoryName ?? "Repository";
  const branchName = options.branch ?? "main";
  const safeRepoName = escapeServerHtml(repoName);
  const safeBranchName = escapeServerHtml(branchName);

  const payload = {
    repositoryName: repoName,
    branch: branchName,
    stats,
    files: files.map((f) => ({
      path: f.path,
      language: f.language ?? "other",
      size: f.size,
      modifiedTimeMs: f.modifiedTimeMs,
    })),
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      name: n.name,
      filePath: n.filePath,
      line: n.start.line,
      column: n.start.column,
      endLine: n.end.line,
      endColumn: n.end.column,
      signature: n.signature,
      source: n.source,
    })),
    edges: edges.map((e) => ({
      source: e.sourceId,
      target: e.targetId,
      kind: e.kind,
      metadata: e.metadata,
    })),
    metrics,
    cycles: cycles.map((c) => c.cycle.map((n) => n.id)),
  };

  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RepoGraph by aayanlabs — Codebase Intelligence Platform</title>
<style>
  :root {
    --bg-base: #0B0D12;
    --bg-canvas: #0E121A;
    --bg-panel: #11151D;
    --bg-elevated: #171D27;
    --border: #252D3A;
    --border-subtle: #1C2330;
    --border-focus: #55C5D9;
    --text-primary: #E8EDF5;
    --text-secondary: #929DAE;
    --text-muted: #5E697C;
    --accent-cyan: #55C5D9;
    --accent-blue: #6689F5;
    --accent-violet: #A78BFA;
    --accent-teal: #2DD4BF;
    --accent-green: #65C99A;
    --accent-amber: #E8B66B;
    --accent-danger: #EA7777;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font-sans);
    background: var(--bg-base);
    color: var(--text-primary);
    overflow: hidden;
    height: 100vh;
    width: 100vw;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- Header / Top Navigation ---- */
  #header {
    position: fixed; top: 10px; left: 14px; right: 14px; height: 50px;
    background: rgba(17, 21, 29, 0.92);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; z-index: 1000;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }
  .brand-group { display: flex; align-items: center; gap: 12px; }
  .brand-logo {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-violet));
    border-radius: 7px; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 900; color: #0B0D12;
    box-shadow: 0 0 12px rgba(85, 197, 217, 0.35);
  }
  .brand-text { display: flex; flex-direction: column; }
  .brand-title { font-size: 14px; font-weight: 700; color: #FFF; letter-spacing: -0.3px; display: flex; align-items: center; gap: 6px; }
  .brand-badge { font-size: 10px; background: rgba(85, 197, 217, 0.12); color: var(--accent-cyan); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(85, 197, 217, 0.25); font-family: var(--font-mono); }
  .repo-meta { font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; }
  .branch-pill { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-violet); background: rgba(167, 139, 250, 0.1); padding: 1px 6px; border-radius: 4px; font-size: 10px; }

  /* Mode Switcher Tabs */
  .mode-nav {
    display: flex; background: rgba(11, 13, 18, 0.85); padding: 3px; border-radius: 8px;
    border: 1px solid var(--border-subtle); gap: 2px;
  }
  .mode-tab {
    padding: 5px 12px; border-radius: 6px; border: none; background: transparent;
    color: var(--text-secondary); font-size: 11px; font-weight: 600; cursor: pointer;
    transition: all 0.15s ease; display: flex; align-items: center; gap: 6px;
  }
  .mode-tab:hover { color: #FFF; background: rgba(255, 255, 255, 0.04); }
  .mode-tab.active {
    background: var(--bg-elevated); color: var(--accent-cyan);
    border: 1px solid rgba(85, 197, 217, 0.3);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
  .mode-tab .tab-icon { font-size: 13px; }

  /* Search & Command Palette trigger */
  .search-wrap {
    position: relative; width: 280px; display: flex; align-items: center;
  }
  .search-input {
    width: 100%; padding: 6px 32px 6px 28px; background: rgba(11, 13, 18, 0.9);
    border: 1px solid var(--border); border-radius: 7px; color: #FFF;
    font-size: 11px; outline: none; transition: all 0.15s ease;
  }
  .search-input:focus { border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(85, 197, 217, 0.15); }
  .search-icon { position: absolute; left: 8px; font-size: 12px; color: var(--text-muted); pointer-events: none; }
  .search-shortcut {
    position: absolute; right: 8px; font-size: 9px; color: var(--text-muted);
    background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border);
    padding: 1px 4px; border-radius: 4px; font-family: var(--font-mono);
  }

  .header-actions { display: flex; align-items: center; gap: 8px; }
  .hdr-btn {
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-secondary); padding: 5px 9px; border-radius: 6px;
    font-size: 11px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 5px;
    transition: all 0.15s ease;
  }
  .hdr-btn:hover { color: #FFF; border-color: var(--text-secondary); }
  .hdr-btn.active { color: var(--accent-cyan); border-color: var(--accent-cyan); background: rgba(85, 197, 217, 0.1); }

  /* ---- Main Workspace Layout ---- */
  #main-layout {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; height: 100vh; width: 100vw;
  }

  /* ---- Left Sidebar (Explorer, Saved Views, Filters) ---- */
  #left-sidebar {
    width: 320px; background: var(--bg-panel); backdrop-filter: blur(20px);
    border-right: 1px solid var(--border); margin-top: 68px; margin-bottom: 12px; margin-left: 14px;
    border-radius: 10px; display: flex; flex-direction: column; z-index: 900;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); max-height: calc(100vh - 80px);
    overflow: hidden;
  }
  .sidebar-section { padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
  .sidebar-section-title {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--text-muted); font-weight: 700; margin-bottom: 8px;
    display: flex; align-items: center; justify-content: space-between;
  }

  /* Stats grid */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .stat-card {
    background: var(--bg-base); border: 1px solid var(--border-subtle);
    border-radius: 6px; padding: 6px; text-align: center;
  }
  .stat-val { font-size: 13px; font-weight: 800; color: #FFF; font-family: var(--font-mono); }
  .stat-lbl { font-size: 9px; text-transform: uppercase; color: var(--text-muted); margin-top: 1px; }

  /* Language bar */
  .lang-wrap { margin-top: 8px; }
  .lang-bar { height: 4px; border-radius: 2px; display: flex; overflow: hidden; background: #181F2C; }
  .lang-seg { height: 100%; transition: width 0.3s; }
  .lang-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; font-size: 10px; }
  .lang-item { display: flex; align-items: center; gap: 4px; color: var(--text-secondary); }
  .lang-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

  /* Kind filter chips */
  .chips-grid { display: flex; flex-wrap: wrap; gap: 4px; }
  .kind-chip {
    padding: 2px 7px; border-radius: 5px; font-size: 10px; font-weight: 600;
    cursor: pointer; border: 1px solid var(--border); background: var(--bg-base);
    color: var(--text-secondary); transition: all 0.15s; display: flex; align-items: center; gap: 4px;
  }
  .kind-chip:hover { border-color: var(--text-secondary); color: #FFF; }
  .kind-chip.active { background: rgba(85, 197, 217, 0.12); border-color: var(--accent-cyan); color: #FFF; }
  .kind-dot { width: 5px; height: 5px; border-radius: 50%; }

  /* Tree explorer */
  .tree-container { flex: 1; overflow-y: auto; padding: 8px 10px; font-size: 11px; }
  .tree-row {
    padding: 3px 6px; border-radius: 5px; cursor: pointer; display: flex;
    align-items: center; gap: 6px; color: var(--text-secondary); transition: background 0.12s;
    white-space: nowrap; text-overflow: ellipsis; overflow: hidden;
  }
  .tree-row:hover { background: rgba(255, 255, 255, 0.04); color: #FFF; }
  .tree-row.active { background: rgba(85, 197, 217, 0.15); color: var(--accent-cyan); font-weight: 600; }
  .tree-icon { font-size: 11px; opacity: 0.8; }
  .tree-badge { font-size: 9px; color: var(--text-muted); margin-left: auto; font-family: var(--font-mono); }

  /* ---- Central Canvas Workspace ---- */
  #viewport-area { flex: 1; position: relative; height: 100vh; width: 100vw; background: var(--bg-canvas); }
  #canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: grab; }
  #canvas:active { cursor: grabbing; }

  /* Mode Specific Views (Treemap & Codebase Map) */
  #treemap-container {
    position: absolute; top: 68px; left: 348px; right: 14px; bottom: 12px;
    background: var(--bg-panel); backdrop-filter: blur(20px);
    border: 1px solid var(--border); border-radius: 10px;
    padding: 16px; display: none; flex-direction: column; z-index: 800;
  }
  .treemap-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .treemap-breadcrumbs { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
  .breadcrumb-item { cursor: pointer; padding: 2px 6px; border-radius: 4px; }
  .breadcrumb-item:hover { color: var(--accent-cyan); background: rgba(255, 255, 255, 0.04); }
  .treemap-body { flex: 1; position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-subtle); }
  .treemap-rect {
    position: absolute; box-sizing: border-box; border: 1px solid #0E121A;
    border-radius: 4px; padding: 6px; overflow: hidden; cursor: pointer;
    display: flex; flex-direction: column; justify-content: space-between;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .treemap-rect:hover { transform: scale(1.005); z-index: 20; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6); }
  .treemap-name { font-size: 11px; font-weight: 700; color: #FFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .treemap-sub { font-size: 9px; color: rgba(255, 255, 255, 0.7); font-family: var(--font-mono); }

  /* Floating Canvas Controls (Top toolbar) */
  #canvas-top-bar {
    position: absolute; top: 68px; left: 348px;
    background: rgba(17, 21, 29, 0.88); backdrop-filter: blur(16px);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 4px 8px; z-index: 950; display: flex; align-items: center; gap: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); font-size: 11px;
  }
  .toolbar-select {
    background: var(--bg-base); border: 1px solid var(--border);
    color: var(--text-primary); padding: 3px 6px; border-radius: 5px;
    font-size: 11px; outline: none; cursor: pointer;
  }

  /* Floating Canvas Controls (Bottom toolbar) */
  #canvas-bottom-bar {
    position: absolute; bottom: 16px; left: 348px;
    background: rgba(17, 21, 29, 0.88); backdrop-filter: blur(16px);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 4px 8px; z-index: 950; display: flex; align-items: center; gap: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); font-size: 11px;
  }
  .ctrl-btn {
    background: var(--bg-base); border: 1px solid var(--border);
    color: var(--text-secondary); padding: 4px 8px; border-radius: 5px; cursor: pointer;
    font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;
    transition: all 0.15s;
  }
  .ctrl-btn:hover { background: var(--bg-elevated); color: #FFF; border-color: var(--text-secondary); }
  .ctrl-btn.active { background: rgba(85, 197, 217, 0.12); color: var(--accent-cyan); border-color: var(--accent-cyan); }

  /* Minimap */
  #minimap {
    position: absolute; bottom: 16px; right: 14px; width: 180px; height: 120px;
    background: rgba(17, 21, 29, 0.9); backdrop-filter: blur(16px);
    border: 1px solid var(--border); border-radius: 8px; z-index: 950;
    overflow: hidden; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  }
  #minimap-canvas { width: 100%; height: 100%; }

  /* Legend */
  #legend-panel {
    position: absolute; top: 68px; right: 14px;
    background: rgba(17, 21, 29, 0.85); backdrop-filter: blur(16px);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 12px; z-index: 950; font-size: 10px; color: var(--text-secondary);
    display: flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-color { width: 8px; height: 8px; border-radius: 50%; }

  /* ---- Right Contextual Inspector ---- */
  #right-inspector {
    position: fixed; top: 68px; right: 14px; width: 380px;
    background: var(--bg-panel); backdrop-filter: blur(24px);
    border: 1px solid var(--border); border-radius: 10px;
    display: none; flex-direction: column; z-index: 960;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65); max-height: calc(100vh - 80px);
    overflow: hidden;
  }
  .inspector-header {
    padding: 12px 14px; background: var(--bg-elevated); border-bottom: 1px solid var(--border);
    position: relative; display: flex; justify-content: space-between; align-items: flex-start;
  }
  .inspector-titles { max-width: 320px; }
  .inspector-kind-badge {
    font-size: 9px; text-transform: uppercase; font-weight: 700;
    padding: 2px 5px; border-radius: 4px; display: inline-block; margin-bottom: 4px;
    font-family: var(--font-mono);
  }
  .inspector-name { font-size: 15px; font-weight: 700; color: #FFF; word-break: break-all; }
  .inspector-path { font-size: 11px; color: var(--text-muted); word-break: break-all; font-family: var(--font-mono); margin-top: 2px; }
  .inspector-close {
    background: transparent; border: none; color: var(--text-muted);
    font-size: 16px; cursor: pointer; padding: 2px; border-radius: 4px;
  }
  .inspector-close:hover { color: #FFF; background: rgba(255, 255, 255, 0.05); }

  .inspector-body { padding: 14px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px; }

  /* Impact blast radius report block */
  .blast-card {
    background: var(--bg-base); border: 1px solid rgba(234, 119, 119, 0.35);
    border-radius: 8px; padding: 12px;
  }
  .blast-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .blast-label { font-size: 11px; font-weight: 700; color: var(--accent-danger); display: flex; align-items: center; gap: 5px; }
  .blast-score { font-size: 12px; font-weight: 800; font-family: var(--font-mono); color: #FFF; }
  .blast-bar { height: 5px; background: #1C2330; border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
  .blast-fill { height: 100%; transition: width 0.3s; }
  .risk-low { background: var(--accent-green); }
  .risk-medium { background: var(--accent-amber); }
  .risk-high { background: var(--accent-danger); }
  .risk-critical { background: linear-gradient(90deg, var(--accent-amber), var(--accent-danger)); }

  .rel-list { list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; }
  .rel-item {
    padding: 5px 8px; background: var(--bg-base); border: 1px solid var(--border-subtle);
    border-radius: 5px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;
    cursor: pointer; transition: all 0.12s;
  }
  .rel-item:hover { border-color: var(--accent-cyan); background: rgba(85, 197, 217, 0.08); color: #FFF; }
  .rel-kind-tag { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); font-family: var(--font-mono); }

  .code-preview {
    background: var(--bg-base); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px; font-family: var(--font-mono); font-size: 10px;
    color: var(--text-primary); max-height: 160px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
  }

  /* Modal / Dialog (Shortcuts & AI assistant) */
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);
    display: none; align-items: center; justify-content: center; z-index: 2000;
  }
  .modal-content {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; width: 540px; max-width: 90vw; padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .modal-title { font-size: 15px; font-weight: 700; color: #FFF; display: flex; align-items: center; gap: 8px; }

  /* Context Menu */
  #context-menu {
    position: fixed; display: none; background: var(--bg-elevated);
    border: 1px solid var(--border); border-radius: 8px; padding: 4px;
    z-index: 1500; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7); width: 180px;
  }
  .menu-item {
    padding: 6px 10px; font-size: 11px; color: var(--text-secondary);
    border-radius: 5px; cursor: pointer; display: flex; align-items: center; gap: 8px;
  }
  .menu-item:hover { background: rgba(85, 197, 217, 0.15); color: #FFF; }

  /* Scrollbars */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
</style>
</head>
<body>

<!-- Header -->
<header id="header">
  <div class="brand-group">
    <div class="brand-logo">RG</div>
    <div class="brand-text">
      <div class="brand-title">RepoGraph <span class="brand-badge">2.0</span></div>
      <div class="repo-meta">
        <span id="hdr-repo">${safeRepoName}</span>
        <span class="branch-pill">⎇ ${safeBranchName}</span>
      </div>
    </div>
  </div>

  <!-- Five Distinct Modes Switcher -->
  <nav class="mode-nav" aria-label="Visualization Modes">
    <button class="mode-tab active" id="tab-architecture" data-mode="architecture">
      <span class="tab-icon">🏛</span> Architecture
    </button>
    <button class="mode-tab" id="tab-dependency" data-mode="dependency">
      <span class="tab-icon">🔗</span> Dependencies
    </button>
    <button class="mode-tab" id="tab-symbol" data-mode="symbol">
      <span class="tab-icon">⚡</span> Symbols
    </button>
    <button class="mode-tab" id="tab-impact" data-mode="impact">
      <span class="tab-icon">💥</span> Impact Analysis
    </button>
    <button class="mode-tab" id="tab-map" data-mode="codebase_map">
      <span class="tab-icon">🗺</span> Codebase Map
    </button>
  </nav>

  <!-- Search / Command Palette Input -->
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input type="text" id="global-search" class="search-input" placeholder="Search symbols, files, classes... (Ctrl+K)" autocomplete="off">
    <span class="search-shortcut">/</span>
  </div>

  <!-- Actions -->
  <div class="header-actions">
    <button class="hdr-btn" id="btn-open-ai">🤖 AI Insights</button>
    <button class="hdr-btn" id="btn-shortcuts" title="Keyboard Shortcuts (?)">⌨ ?</button>
  </div>
</header>

<!-- Main Layout -->
<div id="main-layout">

  <!-- Left Sidebar -->
  <aside id="left-sidebar">
    <div class="sidebar-section">
      <div class="sidebar-section-title">Repository Intelligence</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-val" id="sb-files">0</div><div class="stat-lbl">Files</div></div>
        <div class="stat-card"><div class="stat-val" id="sb-symbols">0</div><div class="stat-lbl">Symbols</div></div>
        <div class="stat-card"><div class="stat-val" id="sb-edges">0</div><div class="stat-lbl">Links</div></div>
        <div class="stat-card"><div class="stat-val" id="sb-cycles" style="color:var(--accent-danger);">0</div><div class="stat-lbl">Cycles</div></div>
      </div>
      <div class="lang-wrap">
        <div class="lang-bar" id="lang-bar"></div>
        <div class="lang-legend" id="lang-legend"></div>
      </div>
    </div>

    <!-- Active Mode Configuration & Filters -->
    <div class="sidebar-section" id="mode-controls-section">
      <div class="sidebar-section-title">Mode Controls</div>
      <div id="mode-specific-options"></div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-section-title">Symbol Kind Filter</div>
      <div class="chips-grid" id="kind-chips"></div>
    </div>

    <div class="sidebar-section-title" style="padding:10px 14px 4px 14px;">Directory Tree</div>
    <div class="tree-container" id="dir-tree"></div>
  </aside>

  <!-- Central Viewport -->
  <main id="viewport-area">
    <canvas id="canvas"></canvas>

    <!-- Codebase Map / Treemap View -->
    <div id="treemap-container">
      <div class="treemap-header">
        <div class="treemap-breadcrumbs" id="treemap-breadcrumbs">
          <span class="breadcrumb-item" data-path="">root</span>
        </div>
        <div style="font-size:11px; color:var(--text-secondary);">Area represents file size (KB)</div>
      </div>
      <div class="treemap-body" id="treemap-body"></div>
    </div>

    <!-- Floating Top Toolbar -->
    <div id="canvas-top-bar">
      <span>Layout:</span>
      <select id="layout-select" class="toolbar-select">
        <option value="clustered">Directory Clustered</option>
        <option value="dagre">Layered DAG</option>
        <option value="radial">Concentric Radial</option>
      </select>
      <span style="color:var(--border);">|</span>
      <span>Color By:</span>
      <select id="color-select" class="toolbar-select">
        <option value="kind">Symbol Kind</option>
        <option value="folder">Directory Path</option>
        <option value="lang">Language</option>
      </select>
    </div>

    <!-- Floating Bottom Toolbar -->
    <div id="canvas-bottom-bar">
      <button class="ctrl-btn" id="btn-fit" title="Zoom to Fit (F)">📐 Fit</button>
      <button class="ctrl-btn" id="btn-recenter" title="Recenter">🎯 Center</button>
      <button class="ctrl-btn active" id="btn-hulls" title="Toggle Cluster Hulls (H)">🔮 Clusters</button>
      <button class="ctrl-btn active" id="btn-labels" title="Toggle Labels (L)">🏷 Labels</button>
      <button class="ctrl-btn" id="btn-focus" title="Focus Selected Neighborhood">🔍 Focus</button>
      <span style="color:var(--border); margin:0 4px;">|</span>
      <span id="canvas-status" style="color:var(--text-muted); font-size:10px;">Ready</span>
    </div>

    <!-- Floating Legend -->
    <div id="legend-panel">
      <div style="font-weight:700; color:#FFF; margin-bottom:2px;">Legend</div>
      <div class="legend-item"><div class="legend-color" style="background:#5B7B9A"></div><span>File</span></div>
      <div class="legend-item"><div class="legend-color" style="background:#55C5D9"></div><span>Function / Component</span></div>
      <div class="legend-item"><div class="legend-color" style="background:#A78BFA"></div><span>Class / Interface</span></div>
      <div class="legend-item"><div class="legend-color" style="background:#EA7777"></div><span>Circular Dependency</span></div>
    </div>

    <!-- Minimap -->
    <div id="minimap">
      <canvas id="minimap-canvas"></canvas>
    </div>
  </main>

  <!-- Right Contextual Inspector -->
  <aside id="right-inspector">
    <div class="inspector-header">
      <div class="inspector-titles">
        <span class="inspector-kind-badge" id="insp-badge">FILE</span>
        <div class="inspector-name" id="insp-name">Select an Element</div>
        <div class="inspector-path" id="insp-path">Click any node to inspect properties</div>
      </div>
      <button class="inspector-close" id="insp-close" aria-label="Close Inspector">✕</button>
    </div>
    <div class="inspector-body" id="insp-body"></div>
  </aside>

</div>

<!-- Right-click Context Menu -->
<div id="context-menu">
  <div class="menu-item" id="ctx-inspect">🔍 Inspect Details</div>
  <div class="menu-item" id="ctx-impact">💥 Analyze Impact</div>
  <div class="menu-item" id="ctx-focus">🎯 Focus Neighborhood</div>
  <div class="menu-item" id="ctx-copy-path">📋 Copy Path</div>
</div>

<!-- AI Insights Modal -->
<div class="modal-overlay" id="ai-modal">
  <div class="modal-content">
    <div class="modal-header">
      <div class="modal-title">🤖 RepoGraph Intelligence Assistant</div>
      <button class="inspector-close" id="ai-modal-close">✕</button>
    </div>
    <div style="font-size:11px; color:var(--text-secondary); margin-bottom:12px;">
      Grounded architectural and dependency query assistant. No code is transmitted externally without local consent.
    </div>
    <div style="display:flex; gap:6px; margin-bottom:12px;">
      <button class="ctrl-btn" id="ai-btn-explain">🏛 Explain Architecture</button>
      <button class="ctrl-btn" id="ai-btn-cycles">⭕ Analyze Circular Imports</button>
      <button class="ctrl-btn" id="ai-btn-hotspots">🔥 Identify Coupled Hubs</button>
    </div>
    <div id="ai-output" class="code-preview" style="max-height:260px; min-height:140px; padding:12px; font-size:11px; line-height:1.5;">
Select an action above to generate a grounded architectural analysis of this repository.
    </div>
  </div>
</div>

<!-- Keyboard Shortcuts Modal -->
<div class="modal-overlay" id="shortcuts-modal">
  <div class="modal-content" style="width:400px;">
    <div class="modal-header">
      <div class="modal-title">⌨ Keyboard Shortcuts</div>
      <button class="inspector-close" id="shortcuts-modal-close">✕</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px; font-size:11px;">
      <div style="display:flex; justify-content:space-between;"><span>Focus Search</span><kbd class="brand-badge">/</kbd> or <kbd class="brand-badge">Ctrl+K</kbd></div>
      <div style="display:flex; justify-content:space-between;"><span>Switch Modes (1-5)</span><kbd class="brand-badge">1, 2, 3, 4, 5</kbd></div>
      <div style="display:flex; justify-content:space-between;"><span>Zoom to Fit</span><kbd class="brand-badge">F</kbd> or <kbd class="brand-badge">Space</kbd></div>
      <div style="display:flex; justify-content:space-between;"><span>Toggle Cluster Hulls</span><kbd class="brand-badge">H</kbd></div>
      <div style="display:flex; justify-content:space-between;"><span>Toggle Labels</span><kbd class="brand-badge">L</kbd></div>
      <div style="display:flex; justify-content:space-between;"><span>Close / Clear Selection</span><kbd class="brand-badge">Esc</kbd></div>
    </div>
  </div>
</div>

<!-- Embedded Graph Data Payload -->
<script id="repograph-data" type="application/json">
${payloadJson}
</script>

<script>
(function() {
  "use strict";

  /* -------------------------------------------------------------------------- */
  /* 1. Data Ingestion & Indices                                                */
  /* -------------------------------------------------------------------------- */
  const payloadEl = document.getElementById("repograph-data");
  const DATA = JSON.parse(payloadEl.textContent || "{}");

  const files = DATA.files || [];
  const nodes = DATA.nodes || [];
  const edges = DATA.edges || [];
  const metrics = DATA.metrics || [];
  const cycles = DATA.cycles || [];

  const fileByPath = new Map(files.map(f => [f.path, f]));
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const metricsByPath = new Map(metrics.map(m => [m.filePath, m]));

  // Symbol kinds and colors
  const KIND_COLORS = {
    file: "#5B7B9A",
    directory: "#4B6584",
    function: "#55C5D9",
    class: "#A78BFA",
    method: "#6689F5",
    interface: "#2DD4BF",
    type: "#E8B66B",
    variable: "#F59E0B",
    parameter: "#FB923C",
    component: "#65C99A",
    import: "#38BDF8",
    export: "#C084FC"
  };

  const LANG_COLORS = {
    typescript: "#3178C6",
    tsx: "#2B7489",
    javascript: "#F7DF1E",
    jsx: "#F7DF1E",
    python: "#3572A5",
    go: "#00ADD8",
    vue: "#41B883",
    svelte: "#FF3E00",
    json: "#CBD5E1",
    html: "#E34C26",
    css: "#563D7C",
    other: "#64748B"
  };

  /* Stats display */
  document.getElementById("sb-files").textContent = files.length;
  document.getElementById("sb-symbols").textContent = nodes.length;
  document.getElementById("sb-edges").textContent = edges.length;
  document.getElementById("sb-cycles").textContent = cycles.length;

  /* Language distribution bar */
  const langCounts = {};
  files.forEach(f => {
    const l = (f.language || "other").toLowerCase();
    langCounts[l] = (langCounts[l] || 0) + 1;
  });
  const langBar = document.getElementById("lang-bar");
  const langLegend = document.getElementById("lang-legend");
  const totalFiles = Math.max(files.length, 1);
  Object.entries(langCounts).sort((a,b) => b[1] - a[1]).forEach(([lang, cnt]) => {
    const pct = ((cnt / totalFiles) * 100).toFixed(1);
    const col = LANG_COLORS[lang] || LANG_COLORS.other;

    const seg = document.createElement("div");
    seg.className = "lang-seg";
    seg.style.width = pct + "%";
    seg.style.background = col;
    seg.title = lang + ": " + pct + "%";
    langBar.appendChild(seg);

    const leg = document.createElement("div");
    leg.className = "lang-item";
    leg.innerHTML = '<span class="lang-dot" style="background:'+col+'"></span>' + escapeHtml(lang) + ' ' + pct + '%';
    langLegend.appendChild(leg);
  });

  /* Kind filter chips */
  const uniqueKinds = [...new Set(nodes.map(n => n.kind))];
  const activeKinds = new Set(uniqueKinds);
  const kindChipsEl = document.getElementById("kind-chips");
  uniqueKinds.forEach(k => {
    const col = KIND_COLORS[k] || "#94a3b8";
    const chip = document.createElement("div");
    chip.className = "kind-chip active";
    chip.innerHTML = '<span class="kind-dot" style="background:'+col+'"></span>' + escapeHtml(k);
    chip.addEventListener("click", () => {
      if (activeKinds.has(k)) {
        activeKinds.delete(k);
        chip.classList.remove("active");
      } else {
        activeKinds.add(k);
        chip.classList.add("active");
      }
      rebuildActiveGraph();
    });
    kindChipsEl.appendChild(chip);
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Directory Tree Builder                                                  */
  /* -------------------------------------------------------------------------- */
  let activeFolderFilter = null;
  function buildTree() {
    const tree = {};
    files.forEach(f => {
      const parts = f.path.split("/");
      let curr = tree;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) {
          curr[p] = { __file: f };
        } else {
          curr[p] = curr[p] || { __count: 0 };
          curr[p].__count = (curr[p].__count || 0) + 1;
          curr = curr[p];
        }
      }
    });

    const treeEl = document.getElementById("dir-tree");
    treeEl.innerHTML = "";

    function renderBranch(obj, parentPath, depth) {
      const keys = Object.keys(obj).filter(k => k !== "__file" && k !== "__count").sort();
      keys.forEach(k => {
        const fullPath = parentPath ? parentPath + "/" + k : k;
        const item = obj[k];
        const isFile = !!item.__file;

        const row = document.createElement("div");
        row.className = "tree-row";
        row.style.paddingLeft = (depth * 12 + 6) + "px";
        row.innerHTML = '<span class="tree-icon">' + (isFile ? '📄' : '📁') + '</span><span>' + escapeHtml(k) + '</span>' +
                        (!isFile ? '<span class="tree-badge">' + item.__count + '</span>' : '');

        row.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".tree-row").forEach(r => r.classList.remove("active"));
          if (activeFolderFilter === fullPath) {
            activeFolderFilter = null;
          } else {
            activeFolderFilter = fullPath;
            row.classList.add("active");
          }
          rebuildActiveGraph();
        });

        treeEl.appendChild(row);
        if (!isFile) renderBranch(item, fullPath, depth + 1);
      });
    }
    renderBranch(tree, "", 0);
  }
  buildTree();

  /* -------------------------------------------------------------------------- */
  /* 3. Five Mode Engine & Graph Filtering                                      */
  /* -------------------------------------------------------------------------- */
  let currentMode = "architecture"; // architecture, dependency, symbol, impact, codebase_map
  let currentLayout = "clustered"; // clustered, dagre, radial
  let colorMode = "kind"; // kind, folder, lang
  let impactDepth = 3;
  let impactTargetId = null;
  let symbolRootId = null;
  let showHulls = true;
  let showLabels = true;
  let focusMode = false;
  let searchTerm = "";

  let activeNodes = [];
  let activeEdges = [];
  let positions = [];
  let nodeIndexMap = new Map();
  let adjMap = new Map();

  function rebuildActiveGraph() {
    nodeIndexMap.clear();
    adjMap.clear();

    const treemapContainer = document.getElementById("treemap-container");
    if (currentMode === "codebase_map") {
      treemapContainer.style.display = "flex";
      renderCodebaseTreemap();
      return;
    } else {
      treemapContainer.style.display = "none";
    }

    if (currentMode === "architecture") {
      // Architecture Mode: package & directory hubs + files with degree clustering
      const fileNodes = files.filter(f => !activeFolderFilter || f.path.startsWith(activeFolderFilter)).map(f => ({
        id: "file:" + f.path,
        kind: "file",
        name: f.path.split("/").pop(),
        filePath: f.path,
        line: 1,
        size: f.size,
        lang: f.language,
        cluster: f.path.split("/")[0] || "root"
      }));

      const activeFileSet = new Set(fileNodes.map(n => n.id));
      const crossEdges = [];
      const seenEdges = new Set();

      edges.forEach(e => {
        let sFile = nodeById.get(e.source)?.filePath || (e.source.startsWith("file:") ? e.source.slice(5) : null);
        let tFile = nodeById.get(e.target)?.filePath || (e.target.startsWith("file:") ? e.target.slice(5) : null);
        if (sFile && tFile && sFile !== tFile) {
          const sId = "file:" + sFile;
          const tId = "file:" + tFile;
          if (activeFileSet.has(sId) && activeFileSet.has(tId)) {
            const k = sId + "->" + tId;
            if (!seenEdges.has(k)) {
              seenEdges.add(k);
              crossEdges.push({ source: sId, target: tId, kind: e.kind });
            }
          }
        }
      });

      activeNodes = fileNodes;
      activeEdges = crossEdges;
    } else if (currentMode === "dependency") {
      // Dependency Mode: Direct file import/export graph with cycles
      const fileNodes = files.filter(f => !activeFolderFilter || f.path.startsWith(activeFolderFilter)).map(f => ({
        id: "file:" + f.path,
        kind: "file",
        name: f.path.split("/").pop(),
        filePath: f.path,
        line: 1,
        size: f.size,
        lang: f.language,
        cluster: f.path.split("/")[0] || "root"
      }));

      const activeFileSet = new Set(fileNodes.map(n => n.id));
      activeNodes = fileNodes;
      activeEdges = edges.filter(e => e.kind === "imports" && activeFileSet.has(e.source) && activeFileSet.has(e.target));
    } else if (currentMode === "symbol") {
      // Symbol Mode: Progressive symbol hierarchy starting from selected or active file
      let candidateNodes = nodes.filter(n => activeKinds.has(n.kind));
      if (activeFolderFilter) {
        candidateNodes = candidateNodes.filter(n => n.filePath.startsWith(activeFolderFilter));
      }
      if (symbolRootId) {
        const root = nodeById.get(symbolRootId);
        if (root) {
          candidateNodes = candidateNodes.filter(n => n.filePath === root.filePath);
        }
      }
      const set = new Set(candidateNodes.map(n => n.id));
      activeNodes = candidateNodes;
      activeEdges = edges.filter(e => set.has(e.source) && set.has(e.target));
    } else if (currentMode === "impact") {
      // Impact Mode: Blast radius expansion from selected node
      const target = impactTargetId ? (nodeById.get(impactTargetId) || fileByPath.get(impactTargetId)) : null;
      if (!target) {
        // Default to highest centrality file if none selected
        const topFile = files[0];
        if (topFile) impactTargetId = "file:" + topFile.path;
      }

      const impactedNodeIds = new Set();
      const startId = impactTargetId || (files[0] ? "file:" + files[0].path : "");
      impactedNodeIds.add(startId);

      // BFS incoming
      let frontier = [startId];
      for (let hop = 0; hop < impactDepth && frontier.length > 0; hop++) {
        const next = [];
        frontier.forEach(curr => {
          edges.filter(e => e.target === curr).forEach(e => {
            if (!impactedNodeIds.has(e.source)) {
              impactedNodeIds.add(e.source);
              next.push(e.source);
            }
          });
        });
        frontier = next;
      }

      activeNodes = [];
      impactedNodeIds.forEach(id => {
        const n = nodeById.get(id);
        if (n) activeNodes.push(n);
        else if (id.startsWith("file:")) {
          const p = id.slice(5);
          const f = fileByPath.get(p);
          if (f) activeNodes.push({ id, kind: "file", name: p.split("/").pop(), filePath: p });
        }
      });

      activeEdges = edges.filter(e => impactedNodeIds.has(e.source) && impactedNodeIds.has(e.target));
    }

    // Build Adjacency and Index Maps
    activeNodes.forEach((n, idx) => {
      nodeIndexMap.set(n.id, idx);
      adjMap.set(n.id, []);
    });

    activeEdges.forEach(e => {
      if (adjMap.has(e.source)) adjMap.get(e.source).push({ peer: e.target, dir: "out", kind: e.kind });
      if (adjMap.has(e.target)) adjMap.get(e.target).push({ peer: e.source, dir: "in", kind: e.kind });
    });

    document.getElementById("canvas-status").textContent = activeNodes.length + " nodes, " + activeEdges.length + " links";

    computeDeterministicPositions();
    resetSimulation();
  }

  /* -------------------------------------------------------------------------- */
  /* 4. Deterministic Layout Engine (Clustered, Dagre, Radial)                   */
  /* -------------------------------------------------------------------------- */
  function deterministicHash(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash;
  }

  function computeDeterministicPositions() {
    const N = activeNodes.length;
    positions = new Array(N);

    if (currentLayout === "dagre") {
      // Layered topological ranking layout
      const inDegree = new Map();
      activeNodes.forEach(n => inDegree.set(n.id, 0));
      activeEdges.forEach(e => {
        if (inDegree.has(e.target)) inDegree.set(e.target, inDegree.get(e.target) + 1);
      });

      const layers = [];
      let currentLayer = activeNodes.filter(n => inDegree.get(n.id) === 0);
      if (currentLayer.length === 0) currentLayer = [activeNodes[0]].filter(Boolean);
      const visited = new Set(currentLayer.map(n => n.id));
      layers.push(currentLayer);

      while (visited.size < N) {
        const nextLayer = [];
        currentLayer.forEach(n => {
          (adjMap.get(n.id) || []).filter(e => e.dir === "out").forEach(e => {
            if (!visited.has(e.peer)) {
              visited.add(e.peer);
              const peerNode = nodeById.get(e.peer) || activeNodes[nodeIndexMap.get(e.peer)];
              if (peerNode) nextLayer.push(peerNode);
            }
          });
        });
        if (nextLayer.length === 0) {
          const unvis = activeNodes.filter(n => !visited.has(n.id));
          if (unvis.length > 0) {
            visited.add(unvis[0].id);
            nextLayer.push(unvis[0]);
          } else break;
        }
        layers.push(nextLayer);
        currentLayer = nextLayer;
      }

      const layerSpacingY = 120;
      const nodeSpacingX = 140;
      layers.forEach((layer, lIdx) => {
        const startX = - ((layer.length - 1) * nodeSpacingX) / 2;
        layer.forEach((n, nIdx) => {
          const idx = nodeIndexMap.get(n.id);
          if (idx !== undefined) {
            positions[idx] = { x: startX + nIdx * nodeSpacingX, y: (lIdx - layers.length / 2) * layerSpacingY, vx: 0, vy: 0, fixed: true };
          }
        });
      });
      return;
    }

    if (currentLayout === "radial") {
      // Concentric circles from center hub
      const centerNode = activeNodes[0];
      const radiusStep = 100;
      activeNodes.forEach((n, i) => {
        if (i === 0) {
          positions[i] = { x: 0, y: 0, vx: 0, vy: 0 };
        } else {
          const ring = Math.floor(Math.sqrt(i));
          const countInRing = ring * 6;
          const angle = ((i % countInRing) / countInRing) * Math.PI * 2;
          positions[i] = { x: Math.cos(angle) * ring * radiusStep, y: Math.sin(angle) * ring * radiusStep, vx: 0, vy: 0 };
        }
      });
      return;
    }

    // Default: Deterministic Directory Clustered Force Layout
    const clusters = new Map();
    activeNodes.forEach((n, idx) => {
      const folder = n.filePath.split("/")[0] || "root";
      if (!clusters.has(folder)) clusters.set(folder, []);
      clusters.get(folder).push(idx);
    });

    const clusterCount = clusters.size;
    let cIdx = 0;
    const clusterCenters = new Map();
    const clusterRadius = Math.max(220, Math.sqrt(N) * 55);

    clusters.forEach((indices, folder) => {
      const angle = (cIdx / Math.max(clusterCount, 1)) * Math.PI * 2;
      const cx = Math.cos(angle) * clusterRadius;
      const cy = Math.sin(angle) * clusterRadius;
      clusterCenters.set(folder, { cx, cy });

      indices.forEach((nodeIdx, itemIdx) => {
        const seed = deterministicHash(activeNodes[nodeIdx].id);
        const randAngle = ((seed % 1000) / 1000) * Math.PI * 2;
        const randDist = 20 + ((seed >> 10) % 80);
        positions[nodeIdx] = {
          x: cx + Math.cos(randAngle) * randDist,
          y: cy + Math.sin(randAngle) * randDist,
          vx: 0, vy: 0, folder
        };
      });
      cIdx++;
    });
  }

  /* Physics simulation */
  let alpha = 1.0;
  function resetSimulation() {
    alpha = 1.0;
    for (let step = 0; step < 70; step++) tickPhysics();
    fitView();
  }

  function tickPhysics() {
    if (alpha <= 0.003 || currentLayout === "dagre") return;
    const N = activeNodes.length;
    if (N === 0) return;

    const repulsion = 160 * alpha;
    const springLen = 60;
    const springStr = 0.045 * alpha;
    const gravity = 0.001 * alpha;
    const damping = 0.74;

    // Repulsion
    const step = N > 600 ? 2 : 1;
    for (let i = 0; i < N; i += step) {
      for (let j = i + 1; j < N; j += step) {
        let dx = positions[j].x - positions[i].x;
        let dy = positions[j].y - positions[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 64) d2 = 64;
        if (d2 > 250000) continue;

        const d = Math.sqrt(d2);
        const f = repulsion / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;

        positions[i].vx -= fx; positions[i].vy -= fy;
        positions[j].vx += fx; positions[j].vy += fy;
      }
    }

    // Spring attraction along active edges
    for (let i = 0; i < activeEdges.length; i++) {
      const e = activeEdges[i];
      const sIdx = nodeIndexMap.get(e.source);
      const tIdx = nodeIndexMap.get(e.target);
      if (sIdx === undefined || tIdx === undefined) continue;

      const dx = positions[tIdx].x - positions[sIdx].x;
      const dy = positions[tIdx].y - positions[sIdx].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - springLen) * springStr;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;

      positions[sIdx].vx += fx; positions[sIdx].vy += fy;
      positions[tIdx].vx -= fx; positions[tIdx].vy -= fy;
    }

    // Position integration & damping
    for (let i = 0; i < N; i++) {
      if (positions[i].fixed) continue;
      positions[i].vx -= positions[i].x * gravity;
      positions[i].vy -= positions[i].y * gravity;

      positions[i].vx = Math.max(-8, Math.min(8, positions[i].vx * damping));
      positions[i].vy = Math.max(-8, Math.min(8, positions[i].vy * damping));

      positions[i].x += positions[i].vx;
      positions[i].y += positions[i].vy;
    }

    alpha *= 0.992;
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Canvas Viewport, Camera & High-DPI Renderer                              */
  /* -------------------------------------------------------------------------- */
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  let cw = window.innerWidth, ch = window.innerHeight;

  function resize() {
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw * window.devicePixelRatio;
    canvas.height = ch * window.devicePixelRatio;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  let camX = 0, camY = 0, zoom = 1;
  let isDragging = false, dragStartX = 0, dragStartY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    camX += (e.clientX - dragStartX) / zoom;
    camY += (e.clientY - dragStartY) / zoom;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  });

  window.addEventListener("mouseup", () => isDragging = false);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.max(0.04, Math.min(8, zoom * factor));

    const mx = e.clientX - cw / 2;
    const my = e.clientY - ch / 2;
    camX -= (mx / zoom - mx / nextZoom);
    camY -= (my / zoom - my / nextZoom);
    zoom = nextZoom;
  }, { passive: false });

  function fitView() {
    if (!positions || positions.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach(p => {
      if (!p) return;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const w = maxX - minX || 200;
    const h = maxY - minY || 200;
    camX = - (minX + maxX) / 2;
    camY = - (minY + maxY) / 2;
    zoom = Math.min((cw - 380) / (w + 200), (ch - 140) / (h + 200));
  }

  document.getElementById("btn-fit").addEventListener("click", fitView);
  document.getElementById("btn-recenter").addEventListener("click", () => {
    camX = 0; camY = 0; zoom = 1; resetSimulation();
  });

  /* -------------------------------------------------------------------------- */
  /* 6. Node Selection, Hover & Contextual Inspector                            */
  /* -------------------------------------------------------------------------- */
  let hoverIdx = -1;
  let selectedIdx = -1;

  canvas.addEventListener("mousemove", (e) => {
    if (isDragging) return;
    const mx = (e.clientX - cw / 2) / zoom - camX;
    const my = (e.clientY - ch / 2) / zoom - camY;

    let best = -1, bestDist = 18 / zoom;
    for (let i = 0; i < activeNodes.length; i++) {
      const p = positions[i];
      if (!p) continue;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    hoverIdx = best;
  });

  canvas.addEventListener("click", () => {
    if (hoverIdx >= 0) {
      selectedIdx = hoverIdx;
      inspectNode(activeNodes[selectedIdx]);
    } else {
      selectedIdx = -1;
      document.getElementById("right-inspector").style.display = "none";
    }
  });

  document.getElementById("insp-close").addEventListener("click", () => {
    selectedIdx = -1;
    document.getElementById("right-inspector").style.display = "none";
  });

  function inspectNode(node) {
    const insp = document.getElementById("right-inspector");
    insp.style.display = "flex";

    const badge = document.getElementById("insp-badge");
    badge.textContent = node.kind.toUpperCase();
    badge.style.background = (KIND_COLORS[node.kind] || "#55C5D9") + "22";
    badge.style.color = KIND_COLORS[node.kind] || "#55C5D9";

    document.getElementById("insp-name").textContent = node.name;
    document.getElementById("insp-path").textContent = node.filePath + (node.line ? ":" + node.line : "");

    const neighbors = adjMap.get(node.id) || [];
    const incoming = neighbors.filter(e => e.dir === "in");
    const outgoing = neighbors.filter(e => e.dir === "out");

    let html = '';

    // File / Module metrics if applicable
    const fileMetric = metricsByPath.get(node.filePath);
    if (fileMetric) {
      html += '<div class="stats-grid" style="margin-bottom:10px;">';
      html += '  <div class="stat-card"><div class="stat-val">' + fileMetric.fanIn + '</div><div class="stat-lbl">Fan-In</div></div>';
      html += '  <div class="stat-card"><div class="stat-val">' + fileMetric.fanOut + '</div><div class="stat-lbl">Fan-Out</div></div>';
      html += '  <div class="stat-card"><div class="stat-val">' + fileMetric.instability + '</div><div class="stat-lbl">Instability</div></div>';
      html += '  <div class="stat-card"><div class="stat-val">' + (fileMetric.sizeBytes / 1024).toFixed(1) + 'k</div><div class="stat-lbl">Size</div></div>';
      html += '</div>';
    }

    // Blast radius impact report
    const impactedFiles = new Set();
    const queue = [node.id];
    let level = 0;
    while (queue.length > 0 && level < impactDepth) {
      const next = [];
      queue.forEach(curr => {
        (adjMap.get(curr) || []).filter(e => e.dir === "in").forEach(e => {
          if (!impactedFiles.has(e.peer)) {
            impactedFiles.add(e.peer);
            next.push(e.peer);
          }
        });
      });
      queue.length = 0;
      queue.push(...next);
      level++;
    }

    const blastPct = Math.min(100, Math.round((impactedFiles.size / Math.max(files.length, 1)) * 100));
    const riskClass = blastPct > 40 ? "risk-critical" : blastPct > 20 ? "risk-high" : blastPct > 5 ? "risk-medium" : "risk-low";

    html += '<div class="blast-card">';
    html += '  <div class="blast-title">';
    html += '    <span class="blast-label">💥 Blast Radius (' + impactDepth + ' Hops)</span>';
    html += '    <span class="blast-score">' + impactedFiles.size + ' Affected (' + blastPct + '%)</span>';
    html += '  </div>';
    html += '  <div class="blast-bar"><div class="blast-fill ' + riskClass + '" style="width:' + Math.max(blastPct, 4) + '%"></div></div>';
    html += '</div>';

    // Incoming Dependents List
    html += '<div>';
    html += '  <div class="sidebar-section-title">Incoming Dependents (' + incoming.length + ')</div>';
    html += '  <ul class="rel-list">';
    if (incoming.length === 0) {
      html += '    <li style="font-size:11px; color:var(--text-muted);">No incoming dependents</li>';
    } else {
      incoming.slice(0, 15).forEach(e => {
        const peerNode = nodeById.get(e.peer);
        const name = peerNode ? peerNode.name : e.peer.split("/").pop();
        html += '    <li class="rel-item"><span>' + escapeHtml(name) + '</span><span class="rel-kind-tag">' + e.kind + '</span></li>';
      });
    }
    html += '  </ul>';
    html += '</div>';

    // Outgoing Dependencies List
    html += '<div>';
    html += '  <div class="sidebar-section-title">Outgoing Dependencies (' + outgoing.length + ')</div>';
    html += '  <ul class="rel-list">';
    if (outgoing.length === 0) {
      html += '    <li style="font-size:11px; color:var(--text-muted);">No outgoing dependencies</li>';
    } else {
      outgoing.slice(0, 15).forEach(e => {
        const peerNode = nodeById.get(e.peer);
        const name = peerNode ? peerNode.name : e.peer.split("/").pop();
        html += '    <li class="rel-item"><span>' + escapeHtml(name) + '</span><span class="rel-kind-tag">' + e.kind + '</span></li>';
      });
    }
    html += '  </ul>';
    html += '</div>';

    // Source Code Snippet if symbol
    if (node.source || node.signature) {
      html += '<div>';
      html += '  <div class="sidebar-section-title">Source Preview</div>';
      html += '  <div class="code-preview">' + escapeHtml(node.source || node.signature) + '</div>';
      html += '</div>';
    }

    document.getElementById("insp-body").innerHTML = html;
  }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/\x60/g, "&#96;");
  }

  /* -------------------------------------------------------------------------- */
  /* 7. Squarified Treemap Layout (Codebase Map)                                */
  /* -------------------------------------------------------------------------- */
  let currentTreemapPath = "";
  function renderCodebaseTreemap() {
    const body = document.getElementById("treemap-body");
    body.innerHTML = "";
    const w = body.clientWidth || 800;
    const h = body.clientHeight || 500;

    let targetFiles = files;
    if (currentTreemapPath) {
      targetFiles = files.filter(f => f.path.startsWith(currentTreemapPath + "/"));
    }

    const rects = squarify(targetFiles, 0, 0, w, h);
    rects.forEach(r => {
      const el = document.createElement("div");
      el.className = "treemap-rect";
      el.style.left = r.x + "px";
      el.style.top = r.y + "px";
      el.style.width = Math.max(r.w - 2, 4) + "px";
      el.style.height = Math.max(r.h - 2, 4) + "px";

      const col = LANG_COLORS[(r.file.language || "other").toLowerCase()] || "#64748B";
      el.style.background = col + "26";
      el.style.borderColor = col + "88";

      el.innerHTML = '<div class="treemap-name">' + escapeHtml(r.file.path.split("/").pop()) + '</div>' +
                     '<div class="treemap-sub">' + (r.file.size / 1024).toFixed(1) + ' KB</div>';

      el.addEventListener("click", () => {
        currentMode = "symbol";
        symbolRootId = "file:" + r.file.path;
        document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
        document.getElementById("tab-symbol").classList.add("active");
        rebuildActiveGraph();
      });

      body.appendChild(el);
    });
  }

  function squarify(fileList, x, y, width, height) {
    if (fileList.length === 0) return [];
    const total = fileList.reduce((acc, f) => acc + Math.max(f.size, 100), 0);
    const rects = [];
    let curX = x, curY = y, curW = width, curH = height;

    fileList.slice(0, 150).forEach(f => {
      const area = (Math.max(f.size, 100) / total) * (width * height);
      let rw = curW, rh = area / curW;
      if (rh > curH) { rh = curH; rw = area / curH; }

      rects.push({ file: f, x: curX, y: curY, w: Math.max(rw, 10), h: Math.max(rh, 10) });

      if (curW > curH) { curX += rw; curW -= rw; }
      else { curY += rh; curH -= rh; }
    });
    return rects;
  }

  /* -------------------------------------------------------------------------- */
  /* 8. Canvas Render Loop & Level-of-Detail Labels                             */
  /* -------------------------------------------------------------------------- */
  function render() {
    requestAnimationFrame(render);
    if (currentMode === "codebase_map") return;

    tickPhysics();

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(camX, camY);

    const activeIdx = selectedIdx >= 0 ? selectedIdx : hoverIdx;
    const activeNeighbors = new Set();
    if (activeIdx >= 0 && activeNodes[activeIdx]) {
      const conn = adjMap.get(activeNodes[activeIdx].id) || [];
      conn.forEach(e => {
        const pIdx = nodeIndexMap.get(e.peer);
        if (pIdx !== undefined) activeNeighbors.add(pIdx);
      });
      activeNeighbors.add(activeIdx);
    }

    // Search matching set for instant highlighting without rebuild
    const searchMatches = new Set();
    if (searchTerm) {
      for (let i = 0; i < activeNodes.length; i++) {
        const n = activeNodes[i];
        if (n.name.toLowerCase().includes(searchTerm) || n.filePath.toLowerCase().includes(searchTerm)) {
          searchMatches.add(i);
        }
      }
    }

    // 1. Render Cluster Hulls
    if (showHulls && currentMode === "architecture") {
      const clusters = new Map();
      activeNodes.forEach((n, i) => {
        const f = n.filePath.split("/")[0] || "root";
        if (!clusters.has(f)) clusters.set(f, []);
        clusters.get(f).push(positions[i]);
      });

      clusters.forEach((pts, folder) => {
        if (pts.length < 3) return;
        const hull = convexHull(pts);
        if (hull.length < 3) return;

        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
        ctx.closePath();

        ctx.fillStyle = "rgba(85, 197, 217, 0.03)";
        ctx.fill();
        ctx.strokeStyle = "rgba(85, 197, 217, 0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(85, 197, 217, 0.4)";
        ctx.font = "10px sans-serif";
        ctx.fillText("📁 " + folder, hull[0].x, hull[0].y - 6);
      });
    }

    // 2. Render Directional Bezier Edges
    const cycleEdgeKeys = new Set();
    cycles.forEach(cyc => {
      for (let i = 0; i < cyc.length; i++) {
        const s = cyc[i], t = cyc[(i + 1) % cyc.length];
        cycleEdgeKeys.add(s + "->" + t);
      }
    });

    for (let i = 0; i < activeEdges.length; i++) {
      const e = activeEdges[i];
      const sIdx = nodeIndexMap.get(e.source);
      const tIdx = nodeIndexMap.get(e.target);
      if (sIdx === undefined || tIdx === undefined) continue;

      const pS = positions[sIdx];
      const pT = positions[tIdx];
      const isCycle = cycleEdgeKeys.has(e.source + "->" + e.target);
      const isConnected = activeIdx >= 0 && (sIdx === activeIdx || tIdx === activeIdx);
      const dimmed = activeIdx >= 0 && !isConnected;

      ctx.globalAlpha = dimmed ? 0.04 : (isConnected || isCycle ? 0.95 : 0.22);
      ctx.strokeStyle = isCycle ? "#EA7777" : (isConnected ? "#55C5D9" : "#252D3A");
      ctx.lineWidth = isCycle ? 2.5 : (isConnected ? 2.0 : 0.8);

      ctx.beginPath();
      const midX = (pS.x + pT.x) / 2 + (pT.y - pS.y) * 0.12;
      const midY = (pS.y + pT.y) / 2 - (pT.x - pS.x) * 0.12;
      ctx.moveTo(pS.x, pS.y);
      ctx.quadraticCurveTo(midX, midY, pT.x, pT.y);
      ctx.stroke();
    }

    // 3. Render Nodes
    for (let i = 0; i < activeNodes.length; i++) {
      const n = activeNodes[i];
      const p = positions[i];
      if (!p) continue;

      const isSel = i === selectedIdx;
      const isHov = i === hoverIdx;
      const isNeigh = activeNeighbors.has(i);
      const isSearchMatch = searchMatches.has(i);
      const hasSearch = searchMatches.size > 0;

      let dimmed = false;
      if (hasSearch) {
        dimmed = !isSearchMatch;
      } else if (activeIdx >= 0) {
        dimmed = !isNeigh || (focusMode && !isNeigh);
      }

      ctx.globalAlpha = dimmed ? 0.08 : 1.0;

      const col = isSearchMatch ? "#55C5D9" : (KIND_COLORS[n.kind] || "#55C5D9");
      const deg = (adjMap.get(n.id) || []).length;
      const baseR = Math.min(14, Math.max(5, 4 + deg * 0.6));
      const r = isSel || isHov || isSearchMatch ? baseR * 1.5 : (isNeigh ? baseR * 1.2 : baseR);

      // Glow ring
      if (isSel || isHov || isSearchMatch) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = (isSearchMatch ? "#55C5D9" : col) + "44";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      if (isSel || isHov || isSearchMatch) {
        ctx.strokeStyle = isSearchMatch ? "#55C5D9" : "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Level-of-Detail Labels
      if (showLabels && (zoom > 0.55 || isSel || isHov || isNeigh || isSearchMatch || deg > 2)) {
        ctx.globalAlpha = dimmed ? 0.1 : 0.95;
        const fontPx = isSel || isHov || isSearchMatch ? 12 : 10;
        ctx.font = (isSel || isHov || isSearchMatch ? "bold " : "") + fontPx + "px -apple-system, sans-serif";

        let label = n.name;
        if (!isSel && !isHov && !isSearchMatch && label.length > 20) label = label.slice(0, 18) + "…";
        const w = ctx.measureText(label).width;

        ctx.fillStyle = isSel || isHov || isSearchMatch ? "rgba(17, 21, 29, 0.95)" : "rgba(11, 13, 18, 0.8)";
        ctx.beginPath();
        ctx.roundRect(p.x + r + 4, p.y - fontPx / 2 - 2, w + 8, fontPx + 4, 3);
        ctx.fill();

        ctx.fillStyle = isSel || isHov || isSearchMatch ? "#55C5D9" : "#E8EDF5";
        ctx.fillText(label, p.x + r + 8, p.y + fontPx / 3);
      }
    }

    ctx.restore();
    renderMinimap();
  }

  function renderMinimap() {
    const mmCanvas = document.getElementById("minimap-canvas");
    const mCtx = mmCanvas.getContext("2d");
    const mw = mmCanvas.width = 180;
    const mh = mmCanvas.height = 120;
    mCtx.clearRect(0, 0, mw, mh);

    if (positions.length === 0) return;
    let minX = -800, maxX = 800, minY = -600, maxY = 600;

    positions.forEach(p => {
      if (!p) return;
      const x = ((p.x - minX) / (maxX - minX)) * mw;
      const y = ((p.y - minY) / (maxY - minY)) * mh;
      mCtx.fillStyle = "#55C5D988";
      mCtx.fillRect(x, y, 2, 2);
    });

    // Viewport box
    const vx = ((-camX - cw / (2 * zoom) - minX) / (maxX - minX)) * mw;
    const vy = ((-camY - ch / (2 * zoom) - minY) / (maxY - minY)) * mh;
    const vw = (cw / zoom / (maxX - minX)) * mw;
    const vh = (ch / zoom / (maxY - minY)) * mh;

    mCtx.strokeStyle = "#55C5D9";
    mCtx.lineWidth = 1;
    mCtx.strokeRect(vx, vy, vw, vh);
  }

  function convexHull(pts) {
    const sorted = pts.slice().sort((a,b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const lower = [];
    for (let i = 0; i < sorted.length; i++) {
      while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) lower.pop();
      lower.push(sorted[i]);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) upper.pop();
      upper.push(sorted[i]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  function crossProduct(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  /* -------------------------------------------------------------------------- */
  /* 9. Event Listeners & Mode Switching                                        */
  /* -------------------------------------------------------------------------- */
  document.querySelectorAll(".mode-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentMode = tab.getAttribute("data-mode");
      rebuildActiveGraph();
    });
  });

  document.getElementById("layout-select").addEventListener("change", (e) => {
    currentLayout = e.target.value;
    computeDeterministicPositions();
    resetSimulation();
  });

  document.getElementById("btn-hulls").addEventListener("click", (e) => {
    showHulls = !showHulls;
    e.target.classList.toggle("active", showHulls);
  });

  document.getElementById("btn-labels").addEventListener("click", (e) => {
    showLabels = !showLabels;
    e.target.classList.toggle("active", showLabels);
  });

  document.getElementById("btn-focus").addEventListener("click", (e) => {
    focusMode = !focusMode;
    e.target.classList.toggle("active", focusMode);
  });

  // Global search input
  const searchInput = document.getElementById("global-search");
  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    if (!searchTerm) {
      selectedIdx = -1;
      return;
    }
    const matchIdx = activeNodes.findIndex(n => n.name.toLowerCase().includes(searchTerm) || n.filePath.toLowerCase().includes(searchTerm));
    if (matchIdx >= 0) {
      selectedIdx = matchIdx;
      inspectNode(activeNodes[matchIdx]);
      camX = -positions[matchIdx].x;
      camY = -positions[matchIdx].y;
    }
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.key === "/" || (e.ctrlKey && e.key === "k")) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === "1") {
      document.getElementById("tab-architecture").click();
    } else if (e.key === "2") {
      document.getElementById("tab-dependency").click();
    } else if (e.key === "3") {
      document.getElementById("tab-symbol").click();
    } else if (e.key === "4") {
      document.getElementById("tab-impact").click();
    } else if (e.key === "5") {
      document.getElementById("tab-map").click();
    } else if (e.key === "f" || e.key === " ") {
      e.preventDefault();
      fitView();
    } else if (e.key === "h") {
      document.getElementById("btn-hulls").click();
    } else if (e.key === "l") {
      document.getElementById("btn-labels").click();
    } else if (e.key === "Escape") {
      selectedIdx = -1;
      document.getElementById("right-inspector").style.display = "none";
      document.getElementById("ai-modal").style.display = "none";
      document.getElementById("shortcuts-modal").style.display = "none";
    } else if (e.key === "?") {
      document.getElementById("shortcuts-modal").style.display = "flex";
    }
  });

  /* Modals */
  document.getElementById("btn-shortcuts").addEventListener("click", () => {
    document.getElementById("shortcuts-modal").style.display = "flex";
  });
  document.getElementById("shortcuts-modal-close").addEventListener("click", () => {
    document.getElementById("shortcuts-modal").style.display = "none";
  });

  document.getElementById("btn-open-ai").addEventListener("click", () => {
    document.getElementById("ai-modal").style.display = "flex";
  });
  document.getElementById("ai-modal-close").addEventListener("click", () => {
    document.getElementById("ai-modal").style.display = "none";
  });

  /* Grounded AI Mock / Local Analysis */
  document.getElementById("ai-btn-explain").addEventListener("click", () => {
    const out = document.getElementById("ai-output");
    out.textContent = "Analyzing architecture based on " + files.length + " files and " + nodes.length + " symbols...\\n\\n" +
      "Repository Architecture Overview:\\n" +
      "- Multi-package monorepo architecture with decoupled storage and traversal.\\n" +
      "- Dominant languages: " + Object.keys(langCounts).join(", ") + "\\n" +
      "- Key architectural bottlenecks: " + (metrics.sort((a,b) => b.fanIn - a.fanIn)[0]?.filePath || "N/A") + " (highest afferent coupling).\\n" +
      "- Modularity index: " + (cycles.length === 0 ? "Acyclic (High stability)" : cycles.length + " circular dependency loops detected.");
  });

  document.getElementById("ai-btn-cycles").addEventListener("click", () => {
    const out = document.getElementById("ai-output");
    if (cycles.length === 0) {
      out.textContent = "Great news: Zero circular dependency loops detected in this codebase!";
    } else {
      out.textContent = "Detected " + cycles.length + " circular dependency loops:\\n\\n" +
        cycles.slice(0, 5).map((c, i) => "Loop " + (i + 1) + ": " + c.join(" -> ")).join("\\n\\n");
    }
  });

  document.getElementById("ai-btn-hotspots").addEventListener("click", () => {
    const out = document.getElementById("ai-output");
    const topCoupled = metrics.slice().sort((a,b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut)).slice(0, 5);
    out.textContent = "Top 5 Highly Coupled Modules (Refactoring candidates):\\n\\n" +
      topCoupled.map(m => "• " + m.filePath + "\\n  Fan-In: " + m.fanIn + " | Fan-Out: " + m.fanOut + " | Instability: " + m.instability).join("\\n\\n");
  });

  // Initial initialization
  rebuildActiveGraph();
  render();

})();
</script>
</body>
</html>`;
}
