import type { GraphStore } from "./storage.js";

/**
 * Generate a self-contained interactive HTML dashboard showing the repository
 * code graph. The output is a single HTML string with embedded CSS and JS —
 * no external CDN dependencies.
 */
export function generateDashboardHtml(store: GraphStore): string {
  const files = store.getFiles();
  const nodes = store.allNodes();
  const edges = store.allEdges();
  const stats = store.stats();

  const filesJson = JSON.stringify(
    files.map((f) => ({
      path: f.path,
      language: f.language,
      size: f.size,
    })),
  );

  const nodesJson = JSON.stringify(
    nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      name: n.name,
      filePath: n.filePath,
      line: n.start.line,
      signature: n.signature,
    })),
  );

  const edgesJson = JSON.stringify(
    edges.map((e) => ({
      source: e.sourceId,
      target: e.targetId,
      kind: e.kind,
    })),
  );

  const statsJson = JSON.stringify(stats);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RepoGraph by aayanlabs — Interactive Code Graph</title>
<style>
  :root {
    --bg-dark: #090c15;
    --panel-bg: rgba(17, 22, 37, 0.88);
    --panel-border: rgba(48, 56, 80, 0.7);
    --panel-header: rgba(26, 33, 54, 0.9);
    --text-main: #e2e8f0;
    --text-muted: #8b9bb4;
    --accent-cyan: #38bdf8;
    --accent-purple: #c084fc;
    --accent-green: #34d399;
    --accent-amber: #fbbf24;
    --accent-red: #f87171;
    --hover-bg: rgba(56, 189, 248, 0.12);
    --active-bg: rgba(56, 189, 248, 0.22);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    background: var(--bg-dark);
    color: var(--text-main);
    overflow: hidden;
    height: 100vh;
    width: 100vw;
    user-select: none;
  }

  /* ---- Header ---- */
  #header {
    position: fixed; top: 12px; left: 16px; right: 16px; height: 54px;
    background: var(--panel-bg);
    backdrop-filter: blur(16px);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; z-index: 1000;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .brand {
    display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px;
    letter-spacing: -0.4px; color: #fff;
  }
  .brand-logo {
    width: 28px; height: 28px; background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
    border-radius: 8px; display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 900; color: #090c15; box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
  }
  .brand-sub { font-weight: 400; font-size: 12px; color: var(--text-muted); margin-left: 2px; }

  .view-tabs {
    display: flex; background: rgba(10, 14, 26, 0.7); padding: 3px; border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05); gap: 2px;
  }
  .tab-btn {
    padding: 6px 14px; border-radius: 8px; border: none; background: transparent;
    color: var(--text-muted); font-size: 12px; font-weight: 600; cursor: pointer;
    transition: all 0.2s ease; display: flex; align-items: center; gap: 6px;
  }
  .tab-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
  .tab-btn.active { background: var(--accent-cyan); color: #090c15; font-weight: 700; box-shadow: 0 2px 8px rgba(56, 189, 248, 0.3); }

  .search-container { position: relative; flex: 1; max-width: 320px; margin: 0 16px; }
  .search-input {
    width: 100%; padding: 7px 12px 7px 34px; background: rgba(9, 12, 21, 0.8);
    border: 1px solid var(--panel-border); border-radius: 8px; color: #fff;
    font-size: 12px; outline: none; transition: all 0.2s ease;
  }
  .search-input:focus { border-color: var(--accent-cyan); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2); }
  .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted); }

  .header-stats { display: flex; gap: 12px; font-size: 11px; }
  .stat-pill {
    background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 4px 10px; border-radius: 8px; color: var(--text-muted); font-weight: 500;
  }
  .stat-pill strong { color: var(--accent-cyan); font-weight: 700; margin-left: 3px; }

  /* ---- Main Layout Container ---- */
  #main-container {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; height: 100vh; width: 100vw;
  }

  /* ---- Left Sidebar (Explorer & Filters) ---- */
  #left-sidebar {
    width: 310px; background: var(--panel-bg); backdrop-filter: blur(16px);
    border-right: 1px solid var(--panel-border); margin-top: 76px; margin-bottom: 16px; margin-left: 16px;
    border-radius: 14px; display: flex; flex-direction: column; z-index: 900;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); max-height: calc(100vh - 92px);
    overflow: hidden;
  }
  .sidebar-section { padding: 14px 16px; border-bottom: 1px solid var(--panel-border); }
  .sidebar-title {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--text-muted); font-weight: 700; margin-bottom: 10px;
    display: flex; align-items: center; justify-content: space-between;
  }

  /* Overview Counters */
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .stat-card {
    background: rgba(9, 12, 21, 0.6); border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px; padding: 8px; text-align: center;
  }
  .stat-card .val { font-size: 15px; font-weight: 800; color: #fff; }
  .stat-card .lbl { font-size: 9px; text-transform: uppercase; color: var(--text-muted); margin-top: 2px; }

  /* Language Bar */
  .lang-bar-wrap { margin-top: 4px; }
  .lang-bar { height: 6px; border-radius: 3px; display: flex; overflow: hidden; background: #1e2640; }
  .lang-seg { height: 100%; transition: width 0.3s; }
  .lang-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 10px; }
  .lang-item { display: flex; align-items: center; gap: 4px; color: var(--text-muted); }
  .lang-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

  /* Control Selects & Toggles */
  .control-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 11px; }
  .control-row label { color: var(--text-muted); }
  .control-row select, .control-row button {
    background: rgba(9, 12, 21, 0.8); border: 1px solid var(--panel-border);
    color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 11px; outline: none;
    cursor: pointer;
  }

  /* Kind Pills */
  .kind-filter-grid { display: flex; flex-wrap: wrap; gap: 5px; }
  .kind-chip {
    padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 600;
    cursor: pointer; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(9, 12, 21, 0.5);
    color: var(--text-muted); transition: all 0.15s; display: flex; align-items: center; gap: 4px;
  }
  .kind-chip.active { background: var(--active-bg); border-color: var(--accent-cyan); color: #fff; }
  .kind-dot { width: 6px; height: 6px; border-radius: 50%; }

  /* Directory Tree Explorer */
  .tree-container { flex: 1; overflow-y: auto; padding: 10px 14px; font-size: 12px; }
  .tree-node {
    padding: 3px 6px; border-radius: 5px; cursor: pointer; display: flex;
    align-items: center; gap: 6px; color: var(--text-muted); transition: background 0.15s;
    white-space: nowrap; text-overflow: ellipsis; overflow: hidden;
  }
  .tree-node:hover { background: var(--hover-bg); color: #fff; }
  .tree-node.active { background: var(--active-bg); color: var(--accent-cyan); font-weight: 600; }
  .tree-indent { margin-left: 12px; }
  .tree-icon { font-size: 11px; opacity: 0.8; }
  .tree-count { font-size: 10px; color: rgba(255, 255, 255, 0.35); margin-left: auto; }

  /* ---- Viewport Canvas ---- */
  #viewport { flex: 1; position: relative; height: 100vh; width: 100vw; }
  #canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: grab; }
  #canvas:active { cursor: grabbing; }

  /* ---- Alternate Viewports (Treemap / Grid) ---- */
  #treemap-view, #grid-view {
    position: absolute; top: 76px; left: 342px; right: 16px; bottom: 16px;
    background: var(--panel-bg); backdrop-filter: blur(16px);
    border: 1px solid var(--panel-border); border-radius: 14px;
    padding: 20px; overflow-y: auto; display: none; z-index: 800;
  }

  .treemap-node {
    position: absolute; box-sizing: border-box; border: 1px solid rgba(9, 12, 21, 0.8);
    border-radius: 6px; padding: 6px; overflow: hidden; transition: transform 0.15s, box-shadow 0.15s;
    cursor: pointer; font-size: 11px; font-weight: 600; color: #fff;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .treemap-node:hover { transform: scale(1.01); z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
  .treemap-lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .treemap-sub { font-size: 9px; opacity: 0.7; font-weight: 400; }

  .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .grid-card {
    background: rgba(9, 12, 21, 0.6); border: 1px solid var(--panel-border);
    border-radius: 10px; padding: 14px; cursor: pointer; transition: all 0.2s;
  }
  .grid-card:hover { border-color: var(--accent-cyan); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
  .grid-card h4 { font-size: 13px; color: var(--accent-cyan); margin-bottom: 6px; word-break: break-all; }
  .grid-card .meta { font-size: 11px; color: var(--text-muted); display: flex; gap: 10px; }

  /* ---- Floating Canvas Controls ---- */
  #canvas-controls {
    position: fixed; bottom: 20px; left: 342px;
    background: var(--panel-bg); backdrop-filter: blur(16px);
    border: 1px solid var(--panel-border); border-radius: 12px;
    padding: 6px 12px; z-index: 950; display: flex; align-items: center; gap: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); font-size: 11px; color: var(--text-muted);
  }
  .ctrl-btn {
    background: rgba(9, 12, 21, 0.8); border: 1px solid var(--panel-border);
    color: var(--text-main); padding: 5px 10px; border-radius: 7px; cursor: pointer;
    font-size: 11px; font-weight: 600; transition: all 0.15s; display: flex; align-items: center; gap: 4px;
  }
  .ctrl-btn:hover { background: var(--hover-bg); border-color: var(--accent-cyan); color: #fff; }
  .ctrl-btn.active { background: var(--active-bg); border-color: var(--accent-cyan); color: var(--accent-cyan); }

  /* ---- Right Sidebar (Inspector & Impact Analysis) ---- */
  #right-inspector {
    position: fixed; top: 76px; right: 16px; width: 360px;
    background: var(--panel-bg); backdrop-filter: blur(20px);
    border: 1px solid var(--panel-border); border-radius: 14px;
    display: none; flex-direction: column; z-index: 950;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); max-height: calc(100vh - 92px);
    overflow: hidden;
  }
  .inspector-header {
    padding: 16px; background: var(--panel-header); border-bottom: 1px solid var(--panel-border);
    position: relative;
  }
  .inspector-close {
    position: absolute; top: 14px; right: 14px; background: transparent; border: none;
    color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 4px;
  }
  .inspector-close:hover { color: #fff; }
  .inspector-title { font-size: 15px; font-weight: 700; color: #fff; word-break: break-all; margin-bottom: 4px; }
  .inspector-sub { font-size: 11px; color: var(--text-muted); word-break: break-all; }

  .inspector-body { padding: 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }

  /* Blast Radius Section */
  .blast-box {
    background: rgba(9, 12, 21, 0.6); border: 1px solid rgba(248, 113, 113, 0.3);
    border-radius: 10px; padding: 12px;
  }
  .blast-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .blast-head h5 { font-size: 12px; color: var(--accent-red); font-weight: 700; display: flex; align-items: center; gap: 5px; }
  .blast-head .score { font-size: 12px; font-weight: 800; color: #fff; }
  .blast-meter { height: 6px; background: #1e2640; border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
  .blast-fill { height: 100%; background: linear-gradient(90deg, var(--accent-amber), var(--accent-red)); transition: width 0.4s; }

  .impact-list { list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; }
  .impact-item {
    padding: 5px 8px; background: rgba(255, 255, 255, 0.03); border-radius: 6px;
    font-size: 11px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;
  }
  .impact-item:hover { background: var(--hover-bg); color: #fff; }

  .symbol-list { list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
  .symbol-item {
    padding: 5px 8px; background: rgba(255, 255, 255, 0.03); border-radius: 6px;
    font-size: 11px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;
  }
  .symbol-item:hover { background: var(--hover-bg); color: var(--accent-cyan); }
  .symbol-kind-tag { font-size: 9px; padding: 2px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); }

  /* Utility scrollbar */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
</style>
</head>
<body>

<!-- Header -->
<div id="header">
  <div class="brand">
    <div class="brand-logo">RG</div>
    <div>RepoGraph <span class="brand-sub">by aayanlabs</span></div>
  </div>

  <div class="view-tabs">
    <button class="tab-btn active" id="tab-graph">🌐 Network Graph</button>
    <button class="tab-btn" id="tab-treemap">📊 Treemap</button>
    <button class="tab-btn" id="tab-grid">🗂 Grid View</button>
  </div>

  <div class="search-container">
    <span class="search-icon">🔍</span>
    <input type="text" id="search-box" class="search-input" placeholder="Search files or symbols..." autocomplete="off">
  </div>

  <div class="header-stats">
    <div class="stat-pill">Files <strong id="hdr-files">0</strong></div>
    <div class="stat-pill">Symbols <strong id="hdr-symbols">0</strong></div>
    <div class="stat-pill">Edges <strong id="hdr-edges">0</strong></div>
  </div>
</div>

<!-- Main Container -->
<div id="main-container">

  <!-- Left Sidebar -->
  <div id="left-sidebar">
    <div class="sidebar-section">
      <div class="sidebar-title">Repo Overview</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="val" id="sb-files">0</div><div class="lbl">Files</div></div>
        <div class="stat-card"><div class="val" id="sb-symbols">0</div><div class="lbl">Symbols</div></div>
        <div class="stat-card"><div class="val" id="sb-edges">0</div><div class="lbl">Links</div></div>
      </div>
      <div class="lang-bar-wrap">
        <div class="lang-bar" id="lang-bar"></div>
        <div class="lang-legend" id="lang-legend"></div>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">Display Options</div>
      <div class="control-row">
        <label>Graph Scope</label>
        <select id="sel-scope">
          <option value="file">File Imports Graph (Fast)</option>
          <option value="full">Full Symbol Graph</option>
        </select>
      </div>
      <div class="control-row">
        <label>Color Nodes By</label>
        <select id="sel-color-mode">
          <option value="folder">Folder Path</option>
          <option value="kind">Node Kind</option>
          <option value="lang">Language</option>
        </select>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">Node Kind Filters</div>
      <div class="kind-filter-grid" id="kind-chips"></div>
    </div>

    <div class="sidebar-title" style="padding: 12px 16px 4px 16px;">Directory Explorer</div>
    <div class="tree-container" id="folder-tree"></div>
  </div>

  <!-- Viewport Canvas -->
  <div id="viewport">
    <canvas id="canvas"></canvas>

    <!-- Alternative Viewports -->
    <div id="treemap-view"></div>
    <div id="grid-view"><div class="grid-cards" id="grid-cards-container"></div></div>

    <!-- Floating Canvas Controls -->
    <div id="canvas-controls">
      <button class="ctrl-btn" id="btn-recenter">🎯 Recenter</button>
      <button class="ctrl-btn" id="btn-fit">📐 Fit View</button>
      <button class="ctrl-btn active" id="btn-toggle-hulls">🔮 Folder Hulls</button>
      <button class="ctrl-btn active" id="btn-toggle-labels">🏷 Labels</button>
      <span style="margin-left: 8px;" id="status-vis-count">0 visible</span>
    </div>
  </div>

  <!-- Right Inspector & Impact Panel -->
  <div id="right-inspector">
    <div class="inspector-header">
      <button class="inspector-close" id="btn-close-inspector">✕</button>
      <div class="inspector-title" id="insp-title">Select a Node</div>
      <div class="inspector-sub" id="insp-sub">Click any node or file to inspect impact</div>
    </div>
    <div class="inspector-body" id="insp-body">
      <!-- Injected dynamically -->
    </div>
  </div>

</div>

<script>
(function() {
  "use strict";

  const rawFiles = ${filesJson};
  const rawNodes = ${nodesJson};
  const rawEdges = ${edgesJson};
  const rawStats = ${statsJson};

  /* Color Palette Maps */
  const KIND_COLORS = {
    file: "#38bdf8",
    directory: "#94a3b8",
    function: "#60a5fa",
    class: "#c084fc",
    method: "#818cf8",
    interface: "#34d399",
    type: "#fbbf24",
    variable: "#f87171",
    parameter: "#fb923c",
    component: "#f472b6",
    import: "#22d3ee",
    export: "#a78bfa"
  };

  const LANG_COLORS = {
    typescript: "#3178c6",
    javascript: "#f7df1e",
    python: "#3572A5",
    go: "#00ADD8",
    vue: "#41b883",
    svelte: "#ff3e00",
    json: "#cbd5e1",
    html: "#e34c26",
    css: "#563d7c",
    other: "#64748b"
  };

  /* ---- State Engine ---- */
  let activeTab = "graph"; // graph, treemap, grid
  let graphScope = "file"; // file, full
  let colorMode = "folder"; // folder, kind, lang
  let activeFolderFilter = null;
  let showHulls = true;
  let showLabels = true;
  let activeKindFilters = new Set(Object.keys(KIND_COLORS));
  let searchTerm = "";

  /* Pre-process Data Graphs */
  const fileMap = {};
  rawFiles.forEach(f => fileMap[f.path] = f);

  // Map Node IDs and File Node IDs to FilePaths
  const nodeToFileMap = {};
  rawNodes.forEach(n => nodeToFileMap[n.id] = n.filePath);
  rawFiles.forEach(f => {
    nodeToFileMap["file:" + f.path] = f.path;
    nodeToFileMap[f.path] = f.path;
  });

  // Stats Header Injection
  document.getElementById("hdr-files").textContent = rawFiles.length;
  document.getElementById("hdr-symbols").textContent = rawNodes.length;
  document.getElementById("hdr-edges").textContent = rawEdges.length;

  document.getElementById("sb-files").textContent = rawFiles.length;
  document.getElementById("sb-symbols").textContent = rawNodes.length;
  document.getElementById("sb-edges").textContent = rawEdges.length;

  /* Render Language Distribution Bar */
  const langCounts = {};
  rawFiles.forEach(f => {
    const l = (f.language || "other").toLowerCase();
    langCounts[l] = (langCounts[l] || 0) + 1;
  });

  const langBar = document.getElementById("lang-bar");
  const langLegend = document.getElementById("lang-legend");
  langBar.innerHTML = ""; langLegend.innerHTML = "";
  const totalF = Math.max(rawFiles.length, 1);

  Object.entries(langCounts).sort((a,b) => b[1] - a[1]).forEach(([lang, cnt]) => {
    const pct = ((cnt / totalF) * 100).toFixed(1);
    const col = LANG_COLORS[lang] || LANG_COLORS.other;

    const seg = document.createElement("div");
    seg.className = "lang-seg";
    seg.style.width = pct + "%";
    seg.style.background = col;
    seg.title = lang + ": " + pct + "%";
    langBar.appendChild(seg);

    const leg = document.createElement("div");
    leg.className = "lang-item";
    leg.innerHTML = '<span class="lang-dot" style="background:'+col+'"></span>' + lang + ' ' + pct + '%';
    langLegend.appendChild(leg);
  });

  /* Render Kind Filters Chips */
  const kindChipsEl = document.getElementById("kind-chips");
  const uniqueKinds = [...new Set(rawNodes.map(n => n.kind))];
  kindChipsEl.innerHTML = uniqueKinds.map(k => {
    const col = KIND_COLORS[k] || "#94a3b8";
    return '<div class="kind-chip active" data-kind="'+k+'"><span class="kind-dot" style="background:'+col+'"></span>'+k+'</div>';
  }).join('');

  kindChipsEl.querySelectorAll(".kind-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const k = chip.getAttribute("data-kind");
      if (activeKindFilters.has(k)) {
        activeKindFilters.delete(k);
        chip.classList.remove("active");
      } else {
        activeKindFilters.add(k);
        chip.classList.add("active");
      }
      rebuildGraph();
    });
  });

  /* ---- Build Directory Tree Explorer ---- */
  function buildDirTree() {
    const tree = {};
    rawFiles.forEach(f => {
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

    const treeEl = document.getElementById("folder-tree");
    treeEl.innerHTML = "";

    function renderTreeLevel(obj, parentPath, depth) {
      const keys = Object.keys(obj).filter(k => k !== "__file" && k !== "__count").sort();
      keys.forEach(k => {
        const fullPath = parentPath ? parentPath + "/" + k : k;
        const item = obj[k];
        const isFile = !!item.__file;

        const el = document.createElement("div");
        el.className = "tree-node";
        el.style.paddingLeft = (depth * 12 + 6) + "px";
        el.innerHTML = '<span class="tree-icon">' + (isFile ? '📄' : '📁') + '</span><span>' + k + '</span>' +
                       (!isFile ? '<span class="tree-count">' + item.__count + '</span>' : '');

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".tree-node").forEach(n => n.classList.remove("active"));
          if (activeFolderFilter === fullPath) {
            activeFolderFilter = null;
          } else {
            activeFolderFilter = fullPath;
            el.classList.add("active");
          }
          rebuildGraph();
        });

        treeEl.appendChild(el);
        if (!isFile) {
          renderTreeLevel(item, fullPath, depth + 1);
        }
      });
    }

    renderTreeLevel(tree, "", 0);
  }
  buildDirTree();

  /* ---- Graph Aggregation Engine (File Graph vs Full Graph) ---- */
  let activeNodes = [];
  let activeEdges = [];
  let positions = [];
  let nodeIndexMap = {};
  let folderHulls = [];
  let adjMap = {};

  function rebuildGraph() {
    nodeIndexMap = {};
    adjMap = {};

    if (graphScope === "file") {
      /* File-Level Aggregated Import Graph */
      const fileNodesMap = {};
      rawFiles.forEach(f => {
        if (activeFolderFilter && !f.path.startsWith(activeFolderFilter)) return;
        fileNodesMap[f.path] = {
          id: f.path,
          kind: "file",
          name: f.path.split("/").pop(),
          filePath: f.path,
          line: 1,
          size: f.size,
          lang: f.language || "other"
        };
      });

      // Aggregate All Cross-File Edges (both file imports AND symbol-to-symbol cross-file links)
      const aggregatedEdges = [];
      const edgeSet = new Set();

      rawEdges.forEach(e => {
        const sFile = nodeToFileMap[e.source];
        const tFile = nodeToFileMap[e.target];
        if (sFile && tFile && sFile !== tFile && fileNodesMap[sFile] && fileNodesMap[tFile]) {
          const key = sFile + "-->" + tFile;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            aggregatedEdges.push({ source: sFile, target: tFile, kind: e.kind });
          }
        }
      });

      activeNodes = Object.values(fileNodesMap);
      activeEdges = aggregatedEdges;
    } else {
      /* Full Symbol Graph */
      activeNodes = rawNodes.filter(n => {
        if (activeFolderFilter && !n.filePath.startsWith(activeFolderFilter)) return false;
        if (!activeKindFilters.has(n.kind)) return false;
        return true;
      });

      const activeSet = new Set(activeNodes.map(n => n.id));
      activeEdges = rawEdges.filter(e => activeSet.has(e.source) && activeSet.has(e.target));
    }

    /* Search Filtering */
    if (searchTerm) {
      const st = searchTerm.toLowerCase();
      activeNodes = activeNodes.filter(n => n.name.toLowerCase().includes(st) || n.filePath.toLowerCase().includes(st));
      const sSet = new Set(activeNodes.map(n => n.id));
      activeEdges = activeEdges.filter(e => sSet.has(e.source) && sSet.has(e.target));
    }

    activeNodes.forEach((n, i) => nodeIndexMap[n.id] = i);

    activeEdges.forEach(e => {
      if (!adjMap[e.source]) adjMap[e.source] = [];
      if (!adjMap[e.target]) adjMap[e.target] = [];
      adjMap[e.source].push({ peer: e.target, dir: "out", kind: e.kind });
      adjMap[e.target].push({ peer: e.source, dir: "in", kind: e.kind });
    });

    document.getElementById("status-vis-count").textContent = activeNodes.length + " nodes, " + activeEdges.length + " links";

    initLayoutPositions();
    resetSimulation();
  }

  /* ---- Physics & Cluster Layout Engine ---- */
  let alpha = 1.0;
  const N_TOTAL = () => activeNodes.length;

  function initLayoutPositions() {
    const N = N_TOTAL();
    positions = new Array(N);

    // Separate connected vs isolated nodes
    const connectedIdx = [];
    const isolatedIdx = [];

    for (let i = 0; i < N; i++) {
      const id = activeNodes[i].id;
      const deg = (adjMap[id] || []).length;
      if (deg > 0) connectedIdx.push(i);
      else isolatedIdx.push(i);
    }

    // Folder Cluster Centers for connected nodes
    const folderClusters = {};
    let cCount = 0;
    connectedIdx.forEach(i => {
      const parts = activeNodes[i].filePath.split("/");
      const folder = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : "root";
      if (folderClusters[folder] === undefined) folderClusters[folder] = cCount++;
    });

    const radiusStep = Math.max(160, Math.sqrt(connectedIdx.length) * 45);
    connectedIdx.forEach((idx, i) => {
      const parts = activeNodes[idx].filePath.split("/");
      const folder = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : "root";
      const cIdx = folderClusters[folder] || 0;
      const angle = (cIdx / Math.max(cCount, 1)) * Math.PI * 2 + (i % 5) * 0.4;
      const r = Math.min(radiusStep, 450) + (i % 7) * 22;

      positions[idx] = {
        x: Math.cos(angle) * r + (Math.random() - 0.5) * 60,
        y: Math.sin(angle) * r + (Math.random() - 0.5) * 60,
        vx: 0, vy: 0, isolated: false
      };
    });

    // Generously Spaced Grid for Isolated / Standalone Nodes (Prevents label streak overlap!)
    // Column spacing: 200px, Row spacing: 38px
    const gridCols = Math.min(5, Math.ceil(Math.sqrt(isolatedIdx.length)));
    const gridSpacingX = 210;
    const gridSpacingY = 38;
    const gridStartX = radiusStep > 0 ? radiusStep + 180 : - ((gridCols * gridSpacingX) / 2);
    const gridStartY = - ((Math.ceil(isolatedIdx.length / Math.max(gridCols, 1)) * gridSpacingY) / 2);

    isolatedIdx.forEach((idx, i) => {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      positions[idx] = {
        x: gridStartX + col * gridSpacingX,
        y: gridStartY + row * gridSpacingY,
        vx: 0, vy: 0, isolated: true
      };
    });
  }

  function resetSimulation() {
    alpha = 1.0;
    // Pre-tick layout so graph opens settled & ready
    for (let t = 0; t < 60; t++) tickSimulation();
    setTimeout(fitView, 50);
  }

  function tickSimulation() {
    if (alpha <= 0.002) return;
    const N = N_TOTAL();
    if (N === 0) return;

    const repulsion = 140 * alpha;
    const springLen = 50;
    const springStr = 0.05 * alpha;
    const gravity = 0.001 * alpha;
    const damping = 0.72;

    // Repulsion for connected nodes
    const sampleStep = N > 800 ? Math.ceil(N / 800) : 1;
    for (let i = 0; i < N; i += sampleStep) {
      if (positions[i].isolated) continue;
      for (let j = i + 1; j < N; j += sampleStep) {
        if (positions[j].isolated) continue;
        let dx = positions[j].x - positions[i].x;
        let dy = positions[j].y - positions[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 100) d2 = 100;
        if (d2 > 300000) continue;

        const d = Math.sqrt(d2);
        const force = repulsion / d2;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;

        positions[i].vx -= fx; positions[i].vy -= fy;
        positions[j].vx += fx; positions[j].vy += fy;
      }
    }

    // Edge Attraction
    for (let i = 0; i < activeEdges.length; i++) {
      const e = activeEdges[i];
      const sIdx = nodeIndexMap[e.source];
      const tIdx = nodeIndexMap[e.target];
      if (sIdx === undefined || tIdx === undefined) continue;

      const dx = positions[tIdx].x - positions[sIdx].x;
      const dy = positions[tIdx].y - positions[sIdx].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (d - springLen) * springStr;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;

      if (!positions[sIdx].isolated) { positions[sIdx].vx += fx; positions[sIdx].vy += fy; }
      if (!positions[tIdx].isolated) { positions[tIdx].vx -= fx; positions[tIdx].vy -= fy; }
    }

    // Center Gravity & Velocity Update
    for (let i = 0; i < N; i++) {
      if (positions[i].isolated) continue;
      positions[i].vx -= positions[i].x * gravity;
      positions[i].vy -= positions[i].y * gravity;

      positions[i].vx = Math.max(-6, Math.min(6, positions[i].vx * damping));
      positions[i].vy = Math.max(-6, Math.min(6, positions[i].vy * damping));

      positions[i].x += positions[i].vx;
      positions[i].y += positions[i].vy;
    }

    alpha *= 0.991;
  }

  /* ---- Compute Folder Convex Hulls ---- */
  function computeFolderHulls() {
    folderHulls = [];
    if (!showHulls) return;

    const groups = {};
    activeNodes.forEach((n, i) => {
      if (positions[i].isolated) return;
      const parts = n.filePath.split("/");
      const folder = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : "root";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(positions[i]);
    });

    Object.entries(groups).forEach(([folder, pts]) => {
      if (pts.length < 3) return;
      const hull = convexHull(pts);
      if (hull.length >= 3) {
        folderHulls.push({ folder, points: hull });
      }
    });
  }

  function convexHull(pts) {
    const sorted = pts.slice().sort((a,b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const lower = [];
    for (let i = 0; i < sorted.length; i++) {
      while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
        lower.pop();
      }
      lower.push(sorted[i]);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
        upper.pop();
      }
      upper.push(sorted[i]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  function crossProduct(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  /* ---- Canvas Setup & Camera Control ---- */
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  let cw, ch;

  function resize() {
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw * devicePixelRatio;
    canvas.height = ch * devicePixelRatio;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  let camX = 0, camY = 0, zoom = 1;
  let dragging = false, dragX = 0, dragY = 0;

  canvas.addEventListener("mousedown", e => {
    if (e.button === 0) { dragging = true; dragX = e.clientX; dragY = e.clientY; }
  });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    camX += (e.clientX - dragX) / zoom;
    camY += (e.clientY - dragY) / zoom;
    dragX = e.clientX; dragY = e.clientY;
  });
  window.addEventListener("mouseup", () => dragging = false);

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(6, zoom * zoomFactor));

    const mouseX = e.clientX - cw / 2;
    const mouseY = e.clientY - ch / 2;
    camX -= (mouseX / zoom - mouseX / newZoom);
    camY -= (mouseY / zoom - mouseY / newZoom);
    zoom = newZoom;
  }, { passive: false });

  document.getElementById("btn-recenter").addEventListener("click", () => {
    camX = 0; camY = 0; zoom = 1; resetSimulation();
  });
  document.getElementById("btn-fit").addEventListener("click", fitView);

  function fitView() {
    if (positions.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach(p => {
      if (!p) return;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const w = maxX - minX || 100;
    const h = maxY - minY || 100;
    camX = - (minX + maxX) / 2;
    camY = - (minY + maxY) / 2;
    zoom = Math.min(cw / (w + 260), ch / (h + 260));
  }

  /* ---- Canvas Hover & Selection Inspector ---- */
  let hoverIdx = -1;
  let selectedIdx = -1;

  canvas.addEventListener("mousemove", e => {
    if (dragging) return;
    const mx = (e.clientX - cw / 2) / zoom - camX;
    const my = (e.clientY - ch / 2) / zoom - camY;
    let best = -1, bestD = 18 / zoom;
    for (let i = 0; i < activeNodes.length; i++) {
      const dx = positions[i].x - mx, dy = positions[i].y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    hoverIdx = best;
  });

  canvas.addEventListener("click", () => {
    if (hoverIdx >= 0) {
      selectedIdx = hoverIdx;
      showInspector(selectedIdx);
    } else {
      selectedIdx = -1;
      showInspector(-1);
    }
  });

  document.getElementById("btn-close-inspector").addEventListener("click", () => {
    selectedIdx = -1; showInspector(-1);
  });

  function showInspector(idx) {
    const insp = document.getElementById("right-inspector");
    if (idx < 0) { insp.style.display = "none"; return; }

    const n = activeNodes[idx];
    document.getElementById("insp-title").textContent = n.name;
    document.getElementById("insp-sub").textContent = n.filePath + (n.line ? ":" + n.line : "");

    const edges = adjMap[n.id] || [];
    const inEdges = edges.filter(e => e.dir === "in");
    const outEdges = edges.filter(e => e.dir === "out");

    // Compute Blast Radius Impact Score (simulated BFS upstream impact)
    const impactedFiles = new Set();
    const queue = [n.id];
    let level = 0;
    while (queue.length > 0 && level < 3) {
      const nextQ = [];
      queue.forEach(currId => {
        (adjMap[currId] || []).filter(e => e.dir === "in").forEach(e => {
          if (!impactedFiles.has(e.peer)) {
            impactedFiles.add(e.peer);
            nextQ.push(e.peer);
          }
        });
      });
      queue.length = 0;
      queue.push(...nextQ);
      level++;
    }

    const blastPct = Math.min(100, Math.round((impactedFiles.size / Math.max(rawFiles.length, 1)) * 100));

    // Get contained symbols if file node
    const containedSymbols = rawNodes.filter(rn => rn.filePath === n.filePath && rn.kind !== "file");

    let html = '';

    /* Blast Radius Block (Image 1 Style) */
    html += '<div class="blast-box">';
    html += '  <div class="blast-head">';
    html += '    <h5>💥 Blast Radius Impact</h5>';
    html += '    <span class="score">' + impactedFiles.size + ' files (' + blastPct + '%)</span>';
    html += '  </div>';
    html += '  <div class="blast-meter"><div class="blast-fill" style="width:' + blastPct + '%"></div></div>';
    html += '  <div style="font-size:10px; color:var(--text-muted); margin-bottom:6px;">Upstream Dependents Affected:</div>';
    html += '  <ul class="impact-list">';
    if (inEdges.length === 0) {
      html += '    <li class="impact-item" style="color:var(--text-muted)">No incoming dependents</li>';
    } else {
      inEdges.slice(0, 10).forEach(e => {
        html += '    <li class="impact-item"><span>' + esc(e.peer) + '</span><span style="color:var(--accent-cyan)">' + esc(e.kind) + '</span></li>';
      });
    }
    html += '  </ul>';
    html += '</div>';

    /* Outgoing Dependencies */
    html += '<div>';
    html += '  <div class="sidebar-title">Outgoing Dependencies (' + outEdges.length + ')</div>';
    html += '  <ul class="impact-list">';
    if (outEdges.length === 0) {
      html += '    <li class="impact-item" style="color:var(--text-muted)">No outgoing dependencies</li>';
    } else {
      outEdges.slice(0, 10).forEach(e => {
        html += '    <li class="impact-item"><span>' + esc(e.peer) + '</span><span style="color:var(--text-muted)">' + esc(e.kind) + '</span></li>';
      });
    }
    html += '  </ul>';
    html += '</div>';

    /* Contained Symbols */
    if (containedSymbols.length > 0) {
      html += '<div>';
      html += '  <div class="sidebar-title">Contained Symbols (' + containedSymbols.length + ')</div>';
      html += '  <ul class="symbol-list">';
      containedSymbols.slice(0, 15).forEach(s => {
        const col = KIND_COLORS[s.kind] || "#94a3b8";
        html += '    <li class="symbol-item"><span>' + esc(s.name) + '</span><span class="symbol-kind-tag" style="color:'+col+'">' + esc(s.kind) + '</span></li>';
      });
      html += '  </ul>';
      html += '</div>';
    }

    document.getElementById("insp-body").innerHTML = html;
    insp.style.display = "flex";
  }

  function esc(s) { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  /* ---- Controls Handlers ---- */
  document.getElementById("btn-toggle-hulls").addEventListener("click", (e) => {
    showHulls = !showHulls;
    e.target.classList.toggle("active", showHulls);
  });
  document.getElementById("btn-toggle-labels").addEventListener("click", (e) => {
    showLabels = !showLabels;
    e.target.classList.toggle("active", showLabels);
  });

  document.getElementById("sel-scope").addEventListener("change", (e) => {
    graphScope = e.target.value; rebuildGraph();
  });
  document.getElementById("sel-color-mode").addEventListener("change", (e) => {
    colorMode = e.target.value;
  });

  document.getElementById("search-box").addEventListener("input", (e) => {
    searchTerm = e.target.value; rebuildGraph();
  });

  /* View Mode Tab Switcher */
  document.getElementById("tab-graph").addEventListener("click", () => switchView("graph"));
  document.getElementById("tab-treemap").addEventListener("click", () => switchView("treemap"));
  document.getElementById("tab-grid").addEventListener("click", () => switchView("grid"));

  function switchView(mode) {
    activeTab = mode;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("tab-" + mode).classList.add("active");

    document.getElementById("viewport").style.display = mode === "graph" ? "block" : "block";
    document.getElementById("treemap-view").style.display = mode === "treemap" ? "block" : "none";
    document.getElementById("grid-view").style.display = mode === "grid" ? "block" : "none";

    if (mode === "treemap") renderTreemap();
    if (mode === "grid") renderGridView();
  }

  /* ---- Render Treemap View ---- */
  function renderTreemap() {
    const tm = document.getElementById("treemap-view");
    tm.innerHTML = '<div style="font-weight:700; font-size:16px; margin-bottom:14px; color:var(--accent-cyan)">Repository Code Treemap</div>';

    const container = document.createElement("div");
    container.style.position = "relative"; container.style.width = "100%"; container.style.height = "calc(100% - 40px)";
    tm.appendChild(container);

    const rects = squarifyFiles(rawFiles, container.clientWidth, container.clientHeight);
    rects.forEach(r => {
      const div = document.createElement("div");
      div.className = "treemap-node";
      div.style.left = r.x + "px"; div.style.top = r.y + "px";
      div.style.width = r.w + "px"; div.style.height = r.h + "px";
      const col = LANG_COLORS[(r.file.language || "other").toLowerCase()] || LANG_COLORS.other;
      div.style.background = col + "33"; div.style.borderColor = col;

      div.innerHTML = '<div class="treemap-lbl">' + r.file.path.split("/").pop() + '</div>' +
                      '<div class="treemap-sub">' + (r.file.size / 1024).toFixed(1) + ' KB</div>';
      container.appendChild(div);
    });
  }

  function squarifyFiles(files, width, height) {
    if (files.length === 0) return [];
    const totalSize = files.reduce((s, f) => s + Math.max(f.size, 100), 0);
    const rects = [];
    let curX = 0, curY = 0, curW = width, curH = height;

    files.slice(0, 120).forEach(f => {
      const area = (Math.max(f.size, 100) / totalSize) * (width * height);
      let w = curW, h = area / curW;
      if (h > curH) { h = curH; w = area / curH; }

      rects.push({ file: f, x: curX, y: curY, w: Math.max(w - 2, 10), h: Math.max(h - 2, 10) });
      if (curW > curH) { curX += w; curW -= w; }
      else { curY += h; curH -= h; }
    });
    return rects;
  }

  /* ---- Render Grid View ---- */
  function renderGridView() {
    const gc = document.getElementById("grid-cards-container");
    gc.innerHTML = "";
    rawFiles.slice(0, 80).forEach(f => {
      const card = document.createElement("div");
      card.className = "grid-card";
      const langCol = LANG_COLORS[(f.language || "other").toLowerCase()] || LANG_COLORS.other;
      const symbolsCount = rawNodes.filter(n => n.filePath === f.path).length;

      card.innerHTML = '<h4>' + f.path.split("/").pop() + '</h4>' +
                       '<div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">' + f.path + '</div>' +
                       '<div class="meta"><span><span class="lang-dot" style="background:'+langCol+'"></span> ' + (f.language || "code") + '</span>' +
                       '<span>' + symbolsCount + ' symbols</span><span>' + (f.size / 1024).toFixed(1) + ' KB</span></div>';
      card.addEventListener("click", () => {
        switchView("graph"); activeFolderFilter = f.path; rebuildGraph();
      });
      gc.appendChild(card);
    });
  }

  /* ---- Node Color Resolver ---- */
  function getNodeColor(n) {
    if (colorMode === "kind") return KIND_COLORS[n.kind] || "#38bdf8";
    if (colorMode === "lang") return LANG_COLORS[(n.lang || "other").toLowerCase()] || "#38bdf8";
    // Folder color hashing
    const parts = n.filePath.split("/");
    const folder = parts.length > 1 ? parts[0] : "root";
    let hash = 0;
    for (let i = 0; i < folder.length; i++) hash = folder.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return "hsl(" + hue + ", 75%, 60%)";
  }

  /* ---- Main Render Loop ---- */
  function render() {
    requestAnimationFrame(render);
    if (activeTab !== "graph") return;

    tickSimulation();
    computeFolderHulls();

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(camX, camY);

    const activeIdx = selectedIdx >= 0 ? selectedIdx : hoverIdx;
    const activeNeighbors = new Set();
    if (activeIdx >= 0 && activeNodes[activeIdx]) {
      const conn = adjMap[activeNodes[activeIdx].id] || [];
      conn.forEach(e => {
        const peerIdx = nodeIndexMap[e.peer];
        if (peerIdx !== undefined) activeNeighbors.add(peerIdx);
      });
      activeNeighbors.add(activeIdx);
    }

    /* 1. Render Translucent Folder Cluster Hulls */
    if (showHulls) {
      folderHulls.forEach(h => {
        ctx.beginPath();
        ctx.moveTo(h.points[0].x, h.points[0].y);
        for (let i = 1; i < h.points.length; i++) {
          ctx.lineTo(h.points[i].x, h.points[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = "rgba(56, 189, 248, 0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(56, 189, 248, 0.5)";
        ctx.font = "10px sans-serif";
        ctx.fillText("📁 " + h.folder, h.points[0].x, h.points[0].y - 6);
      });
    }

    /* 2. Render Curved Edges */
    for (let i = 0; i < activeEdges.length; i++) {
      const e = activeEdges[i];
      const sIdx = nodeIndexMap[e.source];
      const tIdx = nodeIndexMap[e.target];
      if (sIdx === undefined || tIdx === undefined) continue;

      const pS = positions[sIdx];
      const pT = positions[tIdx];

      const isConn = activeIdx >= 0 && (sIdx === activeIdx || tIdx === activeIdx);
      const dimmed = activeIdx >= 0 && !isConn;

      ctx.globalAlpha = dimmed ? 0.03 : (isConn ? 0.9 : 0.2);
      ctx.strokeStyle = isConn ? "var(--accent-cyan)" : "#334155";
      ctx.lineWidth = isConn ? 2.2 : 0.8;

      ctx.beginPath();
      const midX = (pS.x + pT.x) / 2 + (pT.y - pS.y) * 0.15;
      const midY = (pS.y + pT.y) / 2 - (pT.x - pS.x) * 0.15;
      ctx.moveTo(pS.x, pS.y);
      ctx.quadraticCurveTo(midX, midY, pT.x, pT.y);
      ctx.stroke();
    }

    /* 3. Render Nodes */
    for (let i = 0; i < activeNodes.length; i++) {
      const n = activeNodes[i];
      const p = positions[i];
      if (!p) continue;

      const col = getNodeColor(n);

      const isSel = i === selectedIdx;
      const isHov = i === hoverIdx;
      const isNeigh = activeNeighbors.has(i);
      const dimmed = activeIdx >= 0 && !isNeigh;

      const deg = (adjMap[n.id] || []).length;
      const baseR = Math.min(14, Math.max(5, 4 + deg * 0.8));
      let r = baseR;
      if (isSel || isHov) r = baseR * 1.8;
      else if (isNeigh) r = baseR * 1.3;

      ctx.globalAlpha = dimmed ? 0.08 : 1.0;

      // Glow ring for high degree / selection
      if (isSel || isHov || deg > 5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = col + "44";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      if (isSel || isHov) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      /* Node Labels with Pill Background to Avoid Overlap Streaks */
      if (showLabels && (zoom > 0.6 || isSel || isHov || isNeigh || deg > 0)) {
        ctx.globalAlpha = dimmed ? 0.1 : 0.95;
        const fontPx = (isSel || isHov ? 12 : 10);
        ctx.font = (isSel || isHov ? "bold " : "") + fontPx + "px sans-serif";

        let labelText = n.name;
        if (!isSel && !isHov && labelText.length > 22) {
          labelText = labelText.substring(0, 20) + "…";
        }

        const textMetrics = ctx.measureText(labelText);
        const textW = textMetrics.width;

        // Label Semi-transparent Pill Background
        ctx.fillStyle = isSel || isHov ? "rgba(15, 23, 42, 0.9)" : "rgba(9, 12, 21, 0.75)";
        ctx.beginPath();
        ctx.roundRect(p.x + r + 4, p.y - fontPx / 2 - 2, textW + 8, fontPx + 4, 4);
        ctx.fill();

        ctx.fillStyle = (isSel || isHov) ? "#ffffff" : "#c9d1d9";
        ctx.fillText(labelText, p.x + r + 8, p.y + fontPx / 3);
      }
    }

    ctx.restore();
  }

  // Initial Build & Render
  rebuildGraph();
  render();

})();
</script>
</body>
</html>`;
}
