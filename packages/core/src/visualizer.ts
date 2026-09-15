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
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #090d16; color: #c9d1d9; overflow: hidden; height: 100vh; width: 100vw;
  }
  #header {
    position: fixed; top: 12px; left: 16px; right: 16px; height: 52px;
    background: rgba(22, 27, 34, 0.85); backdrop-filter: blur(12px);
    border: 1px solid rgba(48, 54, 61, 0.8); border-radius: 12px;
    display: flex; align-items: center; padding: 0 16px; z-index: 100;
    box-shadow: 0 8px 32px rgba(0,0,0,0.37);
  }
  #header .logo { font-size: 16px; font-weight: 700; color: #58a6ff; letter-spacing: -0.3px; display: flex; align-items: center; gap: 6px; }
  #header .logo span { color: #8b949e; font-weight: 400; font-size: 13px; }
  #search-wrapper { position: relative; margin-left: 20px; flex: 1; max-width: 320px; }
  #search-box {
    width: 100%; padding: 7px 12px 7px 32px;
    background: rgba(13, 17, 23, 0.9); border: 1px solid #30363d; border-radius: 8px;
    color: #c9d1d9; font-size: 13px; outline: none; transition: all 0.2s;
  }
  #search-box:focus { border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,0.15); }
  #search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 13px; color: #8b949e; pointer-events: none; }
  #stats { margin-left: auto; font-size: 12px; color: #8b949e; font-weight: 500; display: flex; gap: 12px; }
  #stats .stat-item { background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; }
  #canvas { position: fixed; top: 0; left: 0; right: 0; bottom: 0; cursor: grab; }
  #canvas:active { cursor: grabbing; }

  #legend {
    position: fixed; top: 76px; left: 16px;
    background: rgba(22, 27, 34, 0.85); backdrop-filter: blur(12px);
    border: 1px solid rgba(48, 54, 61, 0.8); border-radius: 10px;
    padding: 10px 14px; z-index: 90; font-size: 11px;
    display: flex; flex-direction: column; gap: 4px;
    max-height: calc(100vh - 160px); overflow-y: auto;
  }
  #legend div { display: flex; align-items: center; cursor: pointer; opacity: 0.85; transition: opacity 0.15s; }
  #legend div:hover { opacity: 1; }
  #legend .dot { width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; }

  #controls-bar {
    position: fixed; bottom: 16px; left: 16px;
    background: rgba(22, 27, 34, 0.85); backdrop-filter: blur(12px);
    border: 1px solid rgba(48, 54, 61, 0.8); border-radius: 10px;
    padding: 6px 12px; z-index: 90; font-size: 11px; color: #8b949e;
    display: flex; align-items: center; gap: 12px;
  }
  .btn-icon {
    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
    padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;
    transition: background 0.15s;
  }
  .btn-icon:hover { background: #30363d; color: #58a6ff; }

  #info-panel {
    position: fixed; bottom: 16px; right: 16px; width: 340px;
    background: rgba(22, 27, 34, 0.95); backdrop-filter: blur(16px);
    border: 1px solid #30363d; border-radius: 12px;
    padding: 16px; display: none; z-index: 100; font-size: 13px;
    max-height: 60vh; overflow-y: auto; box-shadow: 0 12px 36px rgba(0,0,0,0.5);
  }
  #info-panel h3 { color: #58a6ff; font-size: 15px; margin-bottom: 10px; word-break: break-all; }
  #info-panel .field { margin-bottom: 6px; line-height: 1.4; }
  #info-panel .label { color: #8b949e; font-weight: 500; }
  #info-panel .edges-section { margin-top: 10px; border-top: 1px solid #30363d; padding-top: 10px; }
  #info-panel .edges-list { margin-top: 6px; padding-left: 0; list-style: none; max-height: 180px; overflow-y: auto; }
  #info-panel .edges-list li {
    padding: 3px 6px; background: rgba(255,255,255,0.03); border-radius: 4px;
    margin-bottom: 3px; font-size: 11px; display: flex; align-items: center; justify-content: space-between;
  }
</style>
</head>
<body>
<div id="header">
  <div class="logo">RepoGraph <span>by aayanlabs</span></div>
  <div id="search-wrapper">
    <span id="search-icon">🔍</span>
    <input id="search-box" placeholder="Search symbols or files..." type="text" autocomplete="off">
  </div>
  <div id="stats">
    <div class="stat-item" id="stat-nodes">0 nodes</div>
    <div class="stat-item" id="stat-edges">0 edges</div>
  </div>
</div>

<canvas id="canvas"></canvas>

<div id="legend"></div>

<div id="controls-bar">
  <button class="btn-icon" id="btn-reset">Reset View</button>
  <button class="btn-icon" id="btn-recenter">Recenter</button>
  <span>Scroll: Zoom · Drag: Pan · Click: Inspect</span>
</div>

<div id="info-panel"></div>

<script>
(function() {
  "use strict";

  const rawNodes = ${nodesJson};
  const rawEdges = ${edgesJson};

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

  const nodeById = {};
  rawNodes.forEach(n => nodeById[n.id] = n);

  const idxById = {};
  rawNodes.forEach((n, i) => idxById[n.id] = i);

  const adj = {};
  rawEdges.forEach(e => {
    if (!adj[e.source]) adj[e.source] = [];
    if (!adj[e.target]) adj[e.target] = [];
    adj[e.source].push({ dir: "out", kind: e.kind, peer: e.target });
    adj[e.target].push({ dir: "in", kind: e.kind, peer: e.source });
  });

  /* ---- Initialize Stable Clustered Layout ---- */
  const N = rawNodes.length;
  const positions = new Array(N);
  const fileClusters = {};
  let clusterCount = 0;

  for (let i = 0; i < N; i++) {
    const file = rawNodes[i].filePath || "root";
    if (fileClusters[file] === undefined) {
      fileClusters[file] = clusterCount++;
    }
  }

  const radiusStep = Math.sqrt(N) * 25;
  for (let i = 0; i < N; i++) {
    const cIdx = fileClusters[rawNodes[i].filePath || "root"];
    const angle = (cIdx / Math.max(clusterCount, 1)) * Math.PI * 2 + (i % 7) * 0.5;
    const r = Math.min(radiusStep * 0.8, 300) + (i % 13) * 15;
    positions[i] = {
      x: Math.cos(angle) * r + (Math.random() - 0.5) * 40,
      y: Math.sin(angle) * r + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
    };
  }

  const edgeIdx = rawEdges.map(e => ({
    s: idxById[e.source] ?? -1,
    t: idxById[e.target] ?? -1,
  })).filter(e => e.s >= 0 && e.t >= 0);

  /* ---- Bounded Physics Simulation (No Explosion!) ---- */
  let alpha = 1.0;
  const alphaDecay = 0.008;
  const alphaMin = 0.001;

  function tick() {
    if (alpha <= alphaMin) return;

    const repulsionStrength = 150 * alpha;
    const springLength = 40;
    const springStrength = 0.05 * alpha;
    const centerGravity = 0.002 * alpha;
    const damping = 0.75;
    const maxVelocity = 8;

    /* 1. Soft-body Repulsion */
    const sampleStep = N > 1200 ? Math.ceil(N / 1200) : 1;
    for (let i = 0; i < N; i += sampleStep) {
      for (let j = i + 1; j < N; j += sampleStep) {
        let dx = positions[j].x - positions[i].x;
        let dy = positions[j].y - positions[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 100) d2 = 100; // prevent division by tiny dist explosion
        if (d2 > 250000) continue; // ignore far nodes

        const d = Math.sqrt(d2);
        const force = repulsionStrength / d2;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;

        positions[i].vx -= fx; positions[i].vy -= fy;
        positions[j].vx += fx; positions[j].vy += fy;
      }
    }

    /* 2. Edge Attraction */
    for (let i = 0; i < edgeIdx.length; i++) {
      const e = edgeIdx[i];
      const dx = positions[e.t].x - positions[e.s].x;
      const dy = positions[e.t].y - positions[e.s].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (d - springLength) * springStrength;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;

      positions[e.s].vx += fx; positions[e.s].vy += fy;
      positions[e.t].vx -= fx; positions[e.t].vy -= fy;
    }

    /* 3. Center Gravity & Integration */
    for (let i = 0; i < N; i++) {
      positions[i].vx -= positions[i].x * centerGravity;
      positions[i].vy -= positions[i].y * centerGravity;

      positions[i].vx = Math.max(-maxVelocity, Math.min(maxVelocity, positions[i].vx * damping));
      positions[i].vy = Math.max(-maxVelocity, Math.min(maxVelocity, positions[i].vy * damping));

      positions[i].x += positions[i].vx;
      positions[i].y += positions[i].vy;
    }

    alpha *= (1 - alphaDecay);
  }

  /* ---- Canvas Setup ---- */
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

  /* ---- Pan & Zoom Camera ---- */
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
    const newZoom = Math.max(0.08, Math.min(8, zoom * zoomFactor));

    const mouseX = e.clientX - cw / 2;
    const mouseY = e.clientY - ch / 2;
    camX -= (mouseX / zoom - mouseX / newZoom);
    camY -= (mouseY / zoom - mouseY / newZoom);
    zoom = newZoom;
  }, { passive: false });

  document.getElementById("btn-reset").addEventListener("click", () => {
    camX = 0; camY = 0; zoom = 1;
  });
  document.getElementById("btn-recenter").addEventListener("click", () => {
    alpha = 0.5; // kick simulation gently
  });

  /* ---- Selection & Hover ---- */
  let selectedIdx = -1;
  let hoverIdx = -1;

  canvas.addEventListener("mousemove", e => {
    if (dragging) return;
    const mx = (e.clientX - cw / 2) / zoom - camX;
    const my = (e.clientY - ch / 2) / zoom - camY;
    let best = -1, bestD = 14 / zoom;
    for (let i = 0; i < N; i++) {
      const dx = positions[i].x - mx, dy = positions[i].y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    hoverIdx = best;
  });

  canvas.addEventListener("click", e => {
    if (hoverIdx >= 0) {
      selectedIdx = hoverIdx;
      showInfoPanel(selectedIdx);
    } else {
      selectedIdx = -1;
      showInfoPanel(-1);
    }
  });

  /* ---- Info Panel ---- */
  const infoPanel = document.getElementById("info-panel");
  function showInfoPanel(idx) {
    if (idx < 0) { infoPanel.style.display = "none"; return; }
    const n = rawNodes[idx];
    const edges = adj[n.id] || [];
    const inEdges = edges.filter(e => e.dir === "in");
    const outEdges = edges.filter(e => e.dir === "out");

    let html = '<h3>' + esc(n.name) + '</h3>';
    html += '<div class="field"><span class="label">Kind:</span> ' + esc(n.kind) + '</div>';
    html += '<div class="field"><span class="label">Location:</span> ' + esc(n.filePath) + ':' + n.line + '</div>';
    html += '<div class="field"><span class="label">Connections:</span> ' + edges.length + ' total</div>';

    if (inEdges.length) {
      html += '<div class="edges-section"><span class="label">Incoming Dependencies (' + inEdges.length + ')</span>';
      html += '<ul class="edges-list">' + inEdges.slice(0, 15).map(e => {
        const peer = nodeById[e.peer];
        return '<li><span>' + esc(peer ? peer.name : '?') + '</span><span style="color:#8b949e">' + esc(e.kind) + '</span></li>';
      }).join('') + '</ul></div>';
    }

    if (outEdges.length) {
      html += '<div class="edges-section"><span class="label">Outgoing Dependencies (' + outEdges.length + ')</span>';
      html += '<ul class="edges-list">' + outEdges.slice(0, 15).map(e => {
        const peer = nodeById[e.peer];
        return '<li><span>' + esc(peer ? peer.name : '?') + '</span><span style="color:#8b949e">' + esc(e.kind) + '</span></li>';
      }).join('') + '</ul></div>';
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
      for (let i = 0; i < N; i++) {
        if (rawNodes[i].name.toLowerCase().includes(searchTerm) ||
            rawNodes[i].filePath.toLowerCase().includes(searchTerm)) {
          matchedSet.add(i);
        }
      }
    }
  });

  /* ---- Stats & Legend ---- */
  document.getElementById("stat-nodes").textContent = N + " nodes";
  document.getElementById("stat-edges").textContent = rawEdges.length + " edges";

  const legendEl = document.getElementById("legend");
  const usedKinds = [...new Set(rawNodes.map(n => n.kind))];
  legendEl.innerHTML = usedKinds.map(k =>
    '<div><span class="dot" style="background:' + (KIND_COLORS[k] || "#888") + '"></span>' + k + '</div>'
  ).join('');

  /* ---- Render Loop ---- */
  function render() {
    requestAnimationFrame(render);
    tick();

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(camX, camY);

    const activeIndex = selectedIdx >= 0 ? selectedIdx : hoverIdx;
    const activeNeighbors = new Set();
    if (activeIndex >= 0) {
      const connected = adj[rawNodes[activeIndex].id] || [];
      connected.forEach(e => activeNeighbors.add(idxById[e.peer]));
      activeNeighbors.add(activeIndex);
    }

    /* Draw Edges */
    ctx.lineWidth = 0.6;
    for (let i = 0; i < edgeIdx.length; i++) {
      const e = edgeIdx[i];
      const isConnected = activeIndex >= 0 && (e.s === activeIndex || e.t === activeIndex);
      const dimmed = activeIndex >= 0 && !isConnected;

      ctx.globalAlpha = dimmed ? 0.03 : (isConnected ? 0.8 : (searchTerm ? 0.05 : 0.15));
      ctx.strokeStyle = isConnected ? "#58a6ff" : "#30363d";
      ctx.lineWidth = isConnected ? 1.5 : 0.6;

      ctx.beginPath();
      ctx.moveTo(positions[e.s].x, positions[e.s].y);
      ctx.lineTo(positions[e.t].x, positions[e.t].y);
      ctx.stroke();
    }

    /* Draw Nodes */
    const baseRadius = 3.5;
    for (let i = 0; i < N; i++) {
      const n = rawNodes[i];
      const p = positions[i];
      const color = KIND_COLORS[n.kind] || "#888";

      const isSelected = i === selectedIdx;
      const isHovered = i === hoverIdx;
      const isMatched = matchedSet.has(i);
      const isNeighbor = activeNeighbors.has(i);
      const dimmed = (searchTerm && !isMatched) || (activeIndex >= 0 && !isNeighbor);

      ctx.globalAlpha = dimmed ? 0.08 : 1;
      ctx.beginPath();
      let r = baseRadius;
      if (isSelected || isHovered) r = baseRadius * 2.2;
      else if (isMatched || isNeighbor) r = baseRadius * 1.5;

      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      /* Draw Labels */
      if (zoom > 1.2 || isSelected || isHovered || isMatched) {
        ctx.globalAlpha = dimmed ? 0.1 : 0.9;
        ctx.fillStyle = (isSelected || isHovered) ? "#ffffff" : "#c9d1d9";
        ctx.font = (isSelected || isHovered ? "bold " : "") + "10px sans-serif";
        ctx.fillText(n.name, p.x + r + 4, p.y + 3);
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
