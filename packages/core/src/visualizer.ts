import type { GraphStore } from "./storage.js";

/**
 * Generate a self-contained interactive HTML dashboard showing the repository
 * code graph.  The output is a single HTML string with embedded CSS and JS —
 * no external CDN dependencies.
 */
export function generateDashboardHtml(store: GraphStore): string {
  const nodes = store.allNodes();
  const edges = store.allEdges();

  const nodesJson = JSON.stringify(
    nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      name: n.name,
      filePath: n.filePath,
      line: n.start.line,
    })),
  );

  const edgesJson = JSON.stringify(
    edges.map((e) => ({
      source: e.sourceId,
      target: e.targetId,
      kind: e.kind,
    })),
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RepoGraph by aayanlabs — Interactive Code Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0d1117; color: #c9d1d9; overflow: hidden;
  }
  #header {
    position: fixed; top: 0; left: 0; right: 0; height: 48px;
    background: #161b22; border-bottom: 1px solid #30363d;
    display: flex; align-items: center; padding: 0 16px; z-index: 10;
  }
  #header h1 { font-size: 16px; font-weight: 600; color: #58a6ff; }
  #header h1 span { color: #8b949e; font-weight: 400; }
  #search-box {
    margin-left: 24px; padding: 6px 12px; width: 260px;
    background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    color: #c9d1d9; font-size: 13px; outline: none;
  }
  #search-box:focus { border-color: #58a6ff; }
  #stats { margin-left: auto; font-size: 12px; color: #8b949e; }
  #canvas { position: fixed; top: 48px; left: 0; right: 0; bottom: 0; }
  #info-panel {
    position: fixed; bottom: 16px; right: 16px; width: 320px;
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 16px; display: none; z-index: 10; font-size: 13px;
    max-height: 50vh; overflow-y: auto;
  }
  #info-panel h3 { color: #58a6ff; margin-bottom: 8px; }
  #info-panel .field { margin-bottom: 4px; }
  #info-panel .label { color: #8b949e; }
  #info-panel .edges-list { margin-top: 8px; padding-left: 16px; }
  #info-panel .edges-list li { margin-bottom: 2px; color: #c9d1d9; }
  #legend {
    position: fixed; top: 60px; left: 16px;
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 12px; z-index: 10; font-size: 11px;
  }
  #legend div { display: flex; align-items: center; margin-bottom: 4px; }
  #legend .dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  #controls {
    position: fixed; bottom: 16px; left: 16px;
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 8px; z-index: 10; font-size: 11px; color: #8b949e;
  }
</style>
</head>
<body>
<div id="header">
  <h1>RepoGraph <span>by aayanlabs</span></h1>
  <input id="search-box" placeholder="Search nodes..." type="text" autocomplete="off">
  <div id="stats"></div>
</div>
<canvas id="canvas"></canvas>
<div id="legend"></div>
<div id="controls">Scroll: zoom · Drag: pan · Click node: inspect</div>
<div id="info-panel"></div>
<script>
(function() {
  "use strict";

  const rawNodes = ${nodesJson};
  const rawEdges = ${edgesJson};

  /* ---- Color palette by node kind ---- */
  const KIND_COLORS = {
    file: "#8b949e",
    directory: "#7c8693",
    function: "#79c0ff",
    class: "#d2a8ff",
    method: "#a5d6ff",
    interface: "#7ee787",
    type: "#ffa657",
    variable: "#ff7b72",
    parameter: "#f0883e",
    component: "#f778ba",
    import: "#56d4dd",
    export: "#d5a5ff",
  };

  /* ---- Build adjacency for info panel ---- */
  const adj = {};
  for (const e of rawEdges) {
    if (!adj[e.source]) adj[e.source] = [];
    if (!adj[e.target]) adj[e.target] = [];
    adj[e.source].push({ dir: "out", kind: e.kind, peer: e.target });
    adj[e.target].push({ dir: "in", kind: e.kind, peer: e.source });
  }

  /* ---- Node lookup ---- */
  const nodeById = {};
  for (const n of rawNodes) nodeById[n.id] = n;

  /* ---- Layout: random initial positions ---- */
  const W = window.innerWidth, H = window.innerHeight - 48;
  const positions = rawNodes.map(() => ({
    x: (Math.random() - 0.5) * W * 0.8,
    y: (Math.random() - 0.5) * H * 0.8,
    vx: 0, vy: 0,
  }));
  const idxById = {};
  rawNodes.forEach((n, i) => idxById[n.id] = i);

  /* ---- Force simulation (simple) ---- */
  const edgeIdx = rawEdges.map(e => ({
    s: idxById[e.source] ?? -1,
    t: idxById[e.target] ?? -1,
  })).filter(e => e.s >= 0 && e.t >= 0);

  function tick() {
    const N = positions.length;
    const repulsionStrength = 800;
    const springLength = 60;
    const springStrength = 0.004;
    const damping = 0.85;
    const maxNodes = 2000;

    /* Repulsion (limit to maxNodes for perf) */
    const step = N > maxNodes ? Math.ceil(N / maxNodes) : 1;
    for (let i = 0; i < N; i += step) {
      for (let j = i + 1; j < N; j += step) {
        let dx = positions[j].x - positions[i].x;
        let dy = positions[j].y - positions[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const f = repulsionStrength / d2;
        const fx = dx * f, fy = dy * f;
        positions[i].vx -= fx; positions[i].vy -= fy;
        positions[j].vx += fx; positions[j].vy += fy;
      }
    }

    /* Spring attraction */
    for (const e of edgeIdx) {
      const dx = positions[e.t].x - positions[e.s].x;
      const dy = positions[e.t].y - positions[e.s].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - springLength) * springStrength;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      positions[e.s].vx += fx; positions[e.s].vy += fy;
      positions[e.t].vx -= fx; positions[e.t].vy -= fy;
    }

    /* Integrate */
    for (let i = 0; i < N; i++) {
      positions[i].vx *= damping;
      positions[i].vy *= damping;
      positions[i].x += positions[i].vx;
      positions[i].y += positions[i].vy;
    }
  }

  /* ---- Canvas setup ---- */
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  let cw, ch;
  function resize() {
    cw = window.innerWidth; ch = window.innerHeight - 48;
    canvas.width = cw * devicePixelRatio;
    canvas.height = ch * devicePixelRatio;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---- Camera ---- */
  let camX = 0, camY = 0, zoom = 1;

  /* ---- Pan ---- */
  let dragging = false, dragX = 0, dragY = 0;
  canvas.addEventListener("mousedown", e => { dragging = true; dragX = e.clientX; dragY = e.clientY; });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    camX += (e.clientX - dragX) / zoom;
    camY += (e.clientY - dragY) / zoom;
    dragX = e.clientX; dragY = e.clientY;
  });
  window.addEventListener("mouseup", () => dragging = false);

  /* ---- Zoom ---- */
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.05, Math.min(10, zoom * factor));
  }, { passive: false });

  /* ---- Click-to-inspect ---- */
  let selectedIdx = -1;
  canvas.addEventListener("click", e => {
    const mx = (e.clientX - cw / 2) / zoom - camX;
    const my = (e.clientY - 48 - ch / 2) / zoom - camY;
    let best = -1, bestD = 12 / zoom;
    for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - mx, dy = positions[i].y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    selectedIdx = best;
    showInfoPanel(best);
  });

  /* ---- Info panel ---- */
  const infoPanel = document.getElementById("info-panel");
  function showInfoPanel(idx) {
    if (idx < 0) { infoPanel.style.display = "none"; return; }
    const n = rawNodes[idx];
    const edges = adj[n.id] || [];
    const inEdges = edges.filter(e => e.dir === "in");
    const outEdges = edges.filter(e => e.dir === "out");
    let html = '<h3>' + esc(n.name) + '</h3>';
    html += '<div class="field"><span class="label">Kind:</span> ' + esc(n.kind) + '</div>';
    html += '<div class="field"><span class="label">File:</span> ' + esc(n.filePath) + ':' + n.line + '</div>';
    if (inEdges.length) {
      html += '<div class="field"><span class="label">Incoming (' + inEdges.length + '):</span></div>';
      html += '<ul class="edges-list">' + inEdges.slice(0, 20).map(e => {
        const peer = nodeById[e.peer];
        return '<li>' + esc(e.kind) + ' ← ' + (peer ? esc(peer.name) : '?') + '</li>';
      }).join('') + '</ul>';
    }
    if (outEdges.length) {
      html += '<div class="field"><span class="label">Outgoing (' + outEdges.length + '):</span></div>';
      html += '<ul class="edges-list">' + outEdges.slice(0, 20).map(e => {
        const peer = nodeById[e.peer];
        return '<li>' + esc(e.kind) + ' → ' + (peer ? esc(peer.name) : '?') + '</li>';
      }).join('') + '</ul>';
    }
    infoPanel.innerHTML = html;
    infoPanel.style.display = "block";
  }
  function esc(s) { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  /* ---- Search ---- */
  const searchBox = document.getElementById("search-box");
  let searchTerm = "";
  const matchedSet = new Set();
  searchBox.addEventListener("input", () => {
    searchTerm = searchBox.value.toLowerCase();
    matchedSet.clear();
    if (searchTerm) {
      for (let i = 0; i < rawNodes.length; i++) {
        if (rawNodes[i].name.toLowerCase().includes(searchTerm) ||
            rawNodes[i].filePath.toLowerCase().includes(searchTerm)) {
          matchedSet.add(i);
        }
      }
    }
  });

  /* ---- Stats ---- */
  document.getElementById("stats").textContent =
    rawNodes.length + " nodes · " + rawEdges.length + " edges";

  /* ---- Legend ---- */
  const legendEl = document.getElementById("legend");
  const usedKinds = [...new Set(rawNodes.map(n => n.kind))];
  legendEl.innerHTML = usedKinds.map(k =>
    '<div><span class="dot" style="background:' + (KIND_COLORS[k] || "#888") + '"></span>' + k + '</div>'
  ).join('');

  /* ---- Render loop ---- */
  let frame = 0;
  function render() {
    requestAnimationFrame(render);

    /* Run simulation for first 300 frames, then every 4th */
    if (frame < 300 || frame % 4 === 0) tick();
    frame++;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(camX, camY);

    /* Edges */
    ctx.globalAlpha = searchTerm ? 0.08 : 0.15;
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const e of edgeIdx) {
      ctx.moveTo(positions[e.s].x, positions[e.s].y);
      ctx.lineTo(positions[e.t].x, positions[e.t].y);
    }
    ctx.stroke();

    /* Nodes */
    const baseRadius = 3;
    for (let i = 0; i < rawNodes.length; i++) {
      const n = rawNodes[i];
      const p = positions[i];
      const color = KIND_COLORS[n.kind] || "#888";
      const isSelected = i === selectedIdx;
      const isMatched = matchedSet.has(i);
      const dimmed = searchTerm && !isMatched;

      ctx.globalAlpha = dimmed ? 0.1 : 1;
      ctx.beginPath();
      const r = isSelected ? baseRadius * 2.5 : (isMatched ? baseRadius * 1.8 : baseRadius);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      /* Label when zoomed in enough */
      if (zoom > 1.5 || isSelected || isMatched) {
        ctx.globalAlpha = dimmed ? 0.1 : 0.9;
        ctx.fillStyle = "#c9d1d9";
        ctx.font = (isSelected ? "bold " : "") + "10px sans-serif";
        ctx.fillText(n.name, p.x + r + 3, p.y + 3);
      }
    }

    ctx.restore();
  }
  render();
})();
</script>
</body>
</html>`;
}
