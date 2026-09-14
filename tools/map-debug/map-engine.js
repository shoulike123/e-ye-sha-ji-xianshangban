/**
 * MAP_CONFIG = {
 *   storageKey, startRoom, factionLabel,
 *   rooms: { id: { id, name, x, y } },
 *   edges: [ { a, b, type } ],  // type: door|dash|passage
 *   zones?: [ { id, label, color, shape:'rect'|'circle', x, y, w?, h?, r? } ]
 * }
 * passage 仅作标注绘制，默认不计入移动图。
 * zones 为外围 UI 高亮（牌堆/标记等）。
 */
(function () {
  const cfg = window.MAP_CONFIG;
  if (!cfg) throw new Error('缺少 MAP_CONFIG');

  const ROOMS = cfg.rooms;
  const EDGES = cfg.edges;
  const ZONES = cfg.zones || [];
  const START = cfg.startRoom || 'R1';
  const STORAGE_KEY = cfg.storageKey || 'map-room-xy';

  const graph = {};
  for (const id of Object.keys(ROOMS)) graph[id] = [];
  for (const e of EDGES) {
    if (e.type === 'passage') continue; // 特殊通道默认不可通行
    if (e.type === 'killer' && cfg.faction !== 'killer') continue;
    graph[e.a].push({ to: e.b, type: e.type });
    graph[e.b].push({ to: e.a, type: e.type });
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      for (const id of Object.keys(ROOMS)) {
        if (saved[id] && typeof saved[id].x === 'number') {
          ROOMS[id].x = saved[id].x;
          ROOMS[id].y = saved[id].y;
        }
      }
    }
  } catch (_) {}

  function persistCoords() {
    const data = {};
    for (const r of Object.values(ROOMS)) data[r.id] = { x: r.x, y: r.y };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  const state = {
    roomId: START,
    ap: 2,
    maxAp: 2,
    calibrate: false,
  };

  const overlay = document.getElementById('overlay');
  const logEl = document.getElementById('log');
  const posLabel = document.getElementById('posLabel');
  const apLabel = document.getElementById('apLabel');
  const apSelect = document.getElementById('apSelect');
  const calibrateBtn = document.getElementById('calibrateBtn');
  const copyCoordsBtn = document.getElementById('copyCoords');
  const resetPosBtn = document.getElementById('resetPos');

  let drag = null;

  function addLog(text) {
    const d = document.createElement('div');
    d.textContent = text;
    logEl.prepend(d);
    while (logEl.children.length > 40) logEl.lastChild.remove();
  }

  function pctToSvg(x, y) {
    return { x: x * 1000, y: y * 500 };
  }

  function clientToPct(clientX, clientY) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  /** BFS：从 from 到全图最短路（每条门/虚线边代价 1） */
  function shortestPaths(from) {
    const info = { [from]: { dist: 0, prev: null } };
    const q = [from];
    while (q.length) {
      const cur = q.shift();
      const d = info[cur].dist;
      for (const { to } of graph[cur]) {
        if (info[to]) continue;
        info[to] = { dist: d + 1, prev: cur };
        q.push(to);
      }
    }
    return info;
  }

  function pathTo(target, info) {
    if (!info[target]) return null;
    const path = [];
    let cur = target;
    while (cur) {
      path.push(cur);
      cur = info[cur].prev;
    }
    path.reverse();
    return path;
  }

  /** 起点→终点最短距离；不可达返回 null */
  function moveCost(from, to) {
    if (from === to) return { dist: 0, path: [from], info: shortestPaths(from) };
    const info = shortestPaths(from);
    if (!info[to]) return null;
    return { dist: info[to].dist, path: pathTo(to, info), info };
  }

  function roomsDump() {
    const lines = Object.values(ROOMS).map(
      (r) =>
        `      ${r.id}: { id: '${r.id}', name: '${r.name}', x: ${r.x.toFixed(3)}, y: ${r.y.toFixed(3)} },`,
    );
    return `const ROOMS = {\n${lines.join('\n')}\n    };`;
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function zoneSvg(z) {
    const stroke = z.color;
    const fill = hexToRgba(z.color, 0.22);
    if (z.shape === 'circle') {
      const p = pctToSvg(z.x, z.y);
      const rr = (z.r || 0.025) * 1000;
      const labelY = p.y + rr + 12;
      return [
        `<circle class="zone" cx="${p.x}" cy="${p.y}" r="${rr}" fill="${fill}" stroke="${stroke}" />`,
        z.label
          ? `<text class="zone-label" x="${p.x}" y="${labelY}" fill="${stroke}">${z.label}</text>`
          : '',
      ].join('');
    }
    const x = z.x * 1000;
    const y = z.y * 500;
    const w = z.w * 1000;
    const h = z.h * 500;
    const lx = x + w / 2;
    const ly = y + h / 2 + 4;
    return [
      `<rect class="zone" x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" />`,
      z.label
        ? `<text class="zone-label" x="${lx}" y="${ly}" fill="${stroke}">${z.label}</text>`
        : '',
    ].join('');
  }

  function render() {
    const paths = state.calibrate ? null : shortestPaths(state.roomId);
    const parts = [];

    for (const z of ZONES) parts.push(zoneSvg(z));

    for (const e of EDGES) {
      const A = pctToSvg(ROOMS[e.a].x, ROOMS[e.a].y);
      const B = pctToSvg(ROOMS[e.b].x, ROOMS[e.b].y);
      parts.push(
        `<line class="edge ${e.type}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" />`,
      );
    }

    for (const room of Object.values(ROOMS)) {
      const p = pctToSvg(room.x, room.y);
      const isHere = !state.calibrate && room.id === state.roomId;
      const dist = paths && paths[room.id] ? paths[room.id].dist : null;
      const isLegal =
        !state.calibrate &&
        !isHere &&
        dist != null &&
        dist > 0 &&
        dist <= state.ap;
      const cls = `node${isHere ? ' here' : ''}${isLegal ? ' legal' : ''}${state.calibrate ? ' calibrate' : ''}`;
      parts.push(
        `<circle class="${cls}" data-id="${room.id}" cx="${p.x}" cy="${p.y}" r="18" />`,
        `<text class="node-label" x="${p.x}" y="${p.y - 2}">${room.id}</text>`,
        `<text class="node-sub" x="${p.x}" y="${p.y + 11}">${room.name}</text>`,
      );
      if (isLegal) {
        parts.push(
          `<text class="cost-badge" x="${p.x + 14}" y="${p.y - 12}">${dist}</text>`,
        );
      }
    }

    if (!state.calibrate) {
      const here = pctToSvg(ROOMS[state.roomId].x, ROOMS[state.roomId].y);
      parts.push(
        `<circle class="token" cx="${here.x}" cy="${here.y}" r="10" fill="#f0c14b" stroke="#3a2a10" stroke-width="2" />`,
        `<text class="node-label" x="${here.x}" y="${here.y + 4}" style="fill:#2a1a08;font-size:10px">你</text>`,
      );
    }

    overlay.innerHTML = parts.join('');

    if (state.calibrate) {
      overlay.querySelectorAll('circle.node').forEach((el) => {
        el.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          drag = { id: el.getAttribute('data-id'), el };
          el.setPointerCapture(ev.pointerId);
        });
      });
    } else {
      overlay.querySelectorAll('circle.node.legal').forEach((el) => {
        el.addEventListener('click', () => tryMove(el.getAttribute('data-id')));
      });
    }

    const r = ROOMS[state.roomId];
    posLabel.textContent = `${r.id} ${r.name}`;
    apLabel.textContent = String(state.ap);
  }

  function updateNodeVisual(id) {
    const room = ROOMS[id];
    const p = pctToSvg(room.x, room.y);
    const circle = overlay.querySelector(`circle.node[data-id="${id}"]`);
    if (circle) {
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
    }
    const texts = [...overlay.querySelectorAll('text.node-label, text.node-sub')];
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (t.textContent === id) {
        t.setAttribute('x', p.x);
        t.setAttribute('y', p.y - 2);
        const sub = texts[i + 1];
        if (sub && sub.classList.contains('node-sub')) {
          sub.setAttribute('x', p.x);
          sub.setAttribute('y', p.y + 11);
        }
        break;
      }
    }
    overlay.querySelectorAll('line.edge').forEach((el) => el.remove());
    const edgeHtml = EDGES.map((e) => {
      const A = pctToSvg(ROOMS[e.a].x, ROOMS[e.a].y);
      const B = pctToSvg(ROOMS[e.b].x, ROOMS[e.b].y);
      return `<line class="edge ${e.type}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" />`;
    }).join('');
    overlay.insertAdjacentHTML('afterbegin', edgeHtml);
  }

  overlay.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const pct = clientToPct(ev.clientX, ev.clientY);
    ROOMS[drag.id].x = pct.x;
    ROOMS[drag.id].y = pct.y;
    updateNodeVisual(drag.id);
  });

  overlay.addEventListener('pointerup', () => {
    if (!drag) return;
    const room = ROOMS[drag.id];
    persistCoords();
    addLog(`校准 ${drag.id} → (${room.x.toFixed(3)}, ${room.y.toFixed(3)})`);
    drag = null;
  });
  overlay.addEventListener('pointercancel', () => {
    drag = null;
  });

  function tryMove(toId) {
    const result = moveCost(state.roomId, toId);
    if (!result || result.dist <= 0) {
      addLog(`无法前往 ${toId}`);
      return;
    }
    if (result.dist > state.ap) {
      addLog(
        `无法前往 ${toId}${ROOMS[toId].name}：最短 ${result.dist} 格，当前行动力仅 ${state.ap}`,
      );
      return;
    }
    const via = result.path.map((id) => `${id}${ROOMS[id].name}`).join(' → ');
    state.roomId = toId;
    state.ap -= result.dist;
    addLog(`最短路径 ${via}（消耗 ${result.dist}，剩余 ${state.ap}）`);
    render();
  }

  document.getElementById('resetAp').onclick = () => {
    state.maxAp = Number(apSelect.value);
    state.ap = state.maxAp;
    addLog(`行动力重置为 ${state.ap}`);
    render();
  };
  resetPosBtn.onclick = () => {
    state.roomId = START;
    state.maxAp = Number(apSelect.value);
    state.ap = state.maxAp;
    const r = ROOMS[START];
    addLog(`角色回到 ${r.id} ${r.name}，行动力已重置`);
    render();
  };
  apSelect.onchange = () => {
    state.maxAp = Number(apSelect.value);
    state.ap = state.maxAp;
    render();
  };

  calibrateBtn.onclick = () => {
    state.calibrate = !state.calibrate;
    drag = null;
    calibrateBtn.classList.toggle('active', state.calibrate);
    calibrateBtn.textContent = state.calibrate ? '退出校准' : '校准圆点';
    copyCoordsBtn.style.display = state.calibrate ? '' : 'none';
    addLog(state.calibrate ? '校准模式：拖动圆点对齐房间中心' : '已退出校准，可正常移动');
    render();
  };

  copyCoordsBtn.onclick = async () => {
    const text = roomsDump();
    try {
      await navigator.clipboard.writeText(text);
      addLog('坐标已复制到剪贴板');
    } catch {
      addLog(text);
    }
  };

  function boot() {
    addLog(
      `${cfg.factionLabel || '地图'}已加载。行动力=起点到终点最短路径格数；绿圈旁数字=消耗；紫虚线特殊通道默认不可通行。`,
    );
    render();
  }

  const mapImg = document.getElementById('mapImg');
  mapImg.onload = boot;
  if (mapImg.complete) boot();
})();
