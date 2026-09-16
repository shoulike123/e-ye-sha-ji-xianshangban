(() => {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const mapImg = $('mapImg');
  const statusEl = $('status');
  const inspector = $('inspector');
  const tokenList = $('tokenList');
  const edgeList = $('edgeList');

  const state = {
    maps: [],
    mapId: '',
    map: null,
    side: 'survivor',
    selected: null,
    drag: null,
    dirty: false,
    assets: [],
    show: { rooms: true, zones: true, tokens: true, edges: true, blockades: true },
    linkMode: false,
    linkFrom: null,
  };

  const BLOCKADE_SRC = '/Image/UI/封堵.png';

  function setStatus(text, kind = '') {
    statusEl.textContent = text;
    statusEl.className = `status ${kind}`;
  }

  function markDirty() {
    state.dirty = true;
    setStatus('有未保存更改', 'dirty');
  }

  function visibleSide(side) {
    const s = side ?? 'survivor';
    if (s === 'both') return true;
    return s === state.side;
  }

  function clientToMap(clientX, clientY) {
    const rect = overlay.getBoundingClientRect();
    const w = state.map.width;
    const h = state.map.height;
    return {
      x: ((clientX - rect.left) / rect.width) * w,
      y: ((clientY - rect.top) / rect.height) * h,
    };
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;');
  }

  function hexToRgba(hex, alpha) {
    const h = String(hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function findRoom(id) {
    return state.map.rooms.find((r) => r.id === id);
  }
  function findZone(id) {
    return (state.map.zones ?? []).find((z) => z.id === id);
  }
  function findToken(id) {
    return (state.map.tokens ?? []).find((t) => t.id === id);
  }

  function sameEdge(e, a, b) {
    return (e.from === a && e.to === b) || (e.from === b && e.to === a);
  }

  function findEdgeIndex(a, b) {
    return (state.map.edges ?? []).findIndex((e) => sameEdge(e, a, b));
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function pathTypeLabel(t) {
    if (t === 'dash') return '户外小径';
    if (t === 'killer') return '杀手通道';
    return '门';
  }

  function isDoorEdge(pathType) {
    return !pathType || pathType === 'door';
  }

  function defaultBlockadeMark(a, b) {
    const tmpl = (state.map.tokens ?? []).find((t) => t.kind === 'blockade' || t.kind === '封堵');
    const w = tmpl?.w ?? 44;
    const h = tmpl?.h ?? 22;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const rotation = round1((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    return {
      x: round1(mx - w / 2),
      y: round1(my - h / 2),
      w: round1(w),
      h: round1(h),
      rotation,
    };
  }

  function ensureDoorBlockades() {
    if (!state.map) return 0;
    let added = 0;
    for (const e of state.map.edges ?? []) {
      if (!isDoorEdge(e.pathType)) continue;
      const a = findRoom(e.from);
      const b = findRoom(e.to);
      if (!a || !b) continue;
      e.blockade = e.blockade || {};
      for (const side of ['survivor', 'killer']) {
        if (!e.blockade[side]) {
          e.blockade[side] = defaultBlockadeMark(a, b);
          added += 1;
        }
      }
    }
    return added;
  }

  function zoneForSide(zone, side) {
    const s = zone.side ?? 'survivor';
    return s === 'both' || s === side;
  }

  function ensureRescueCars() {
    if (!state.map) return 0;
    state.map.tokens = state.map.tokens ?? [];
    const dropped = state.map.tokens.filter((t) => t.id === 'rescue0_killer').length;
    state.map.tokens = state.map.tokens.filter((t) => t.id !== 'rescue0_killer');
    const src = '/Image/UI/警车.png';
    let added = 0;
    for (const side of ['survivor', 'killer']) {
      const zone = (state.map.zones ?? []).find((z) => z.id === 'rescueTrack' && zoneForSide(z, side));
      const minStep = side === 'killer' ? 1 : 0;
      for (let step = 5; step >= minStep; step--) {
        const id = `rescue${step}_${side}`;
        if (state.map.tokens.some((t) => t.id === id)) continue;
        const i = 5 - step;
        let x;
        let y;
        if (zone && zone.shape !== 'circle') {
          const zw = zone.w ?? 160;
          const zh = zone.h ?? 28;
          const cell = zw / 6;
          x = round1(zone.x + cell * i + Math.max(0, (cell - 24) / 2));
          y = round1(zone.y + Math.max(0, (zh - 16) / 2));
        } else {
          const baseX = side === 'killer' ? 820 : 18;
          const baseY = 448;
          x = round1(baseX + i * 26);
          y = baseY;
        }
        state.map.tokens.push({
          id,
          kind: 'rescue',
          src,
          x,
          y,
          w: 24,
          h: 16,
          rotation: 0,
          side,
          label: `警车${step}（${side === 'killer' ? '杀手' : '幸存者'}）`,
        });
        added += 1;
      }
    }
    return added + dropped;
  }

  function selectedBlockadeMark(index, side) {
    const e = (state.map.edges ?? [])[index];
    if (!e) return null;
    return e.blockade?.[side || state.side] ?? null;
  }

  function selectedObj() {
    if (!state.selected) return null;
    if (state.selected.type === 'room') return findRoom(state.selected.id);
    if (state.selected.type === 'zone') return findZone(state.selected.id);
    if (state.selected.type === 'edge') return (state.map.edges ?? [])[state.selected.index] ?? null;
    if (state.selected.type === 'blockade') {
      const e = (state.map.edges ?? [])[state.selected.index];
      if (!e || !isDoorEdge(e.pathType)) return null;
      const side = state.selected.side || state.side;
      e.blockade = e.blockade || {};
      if (!e.blockade[side]) {
        const a = findRoom(e.from);
        const b = findRoom(e.to);
        e.blockade[side] = a && b ? defaultBlockadeMark(a, b) : { x: 0, y: 0, w: 44, h: 22, rotation: 0 };
      }
      return e.blockade[side];
    }
    return findToken(state.selected.id);
  }

  function hitTest(x, y) {
    if (state.show.blockades) {
      const edges = state.map.edges ?? [];
      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        if (!isDoorEdge(e.pathType)) continue;
        const m = e.blockade?.[state.side];
        if (!m) continue;
        if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
          return { type: 'blockade', index: i, side: state.side };
        }
      }
    }
    const tokens = [...(state.map.tokens ?? [])].reverse();
    if (state.show.tokens) {
      for (const t of tokens) {
        if (t.kind === 'blockade' || t.kind === '封堵') continue;
        if (!visibleSide(t.side)) continue;
        if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
          return { type: 'token', id: t.id };
        }
      }
    }
    if (state.show.rooms) {
      for (const r of state.map.rooms) {
        if ((x - r.x) ** 2 + (y - r.y) ** 2 <= 18 * 18) return { type: 'room', id: r.id };
      }
    }
    if (state.show.edges) {
      let best = null;
      let bestD = 12;
      (state.map.edges ?? []).forEach((e, index) => {
        const a = findRoom(e.from);
        const b = findRoom(e.to);
        if (!a || !b) return;
        const d = distToSeg(x, y, a.x, a.y, b.x, b.y);
        if (d < bestD) {
          bestD = d;
          best = { type: 'edge', index };
        }
      });
      if (best) return best;
    }
    if (state.show.zones) {
      const zones = [...(state.map.zones ?? [])].reverse();
      for (const z of zones) {
        if (!visibleSide(z.side)) continue;
        if (z.shape === 'circle') {
          const rr = z.r ?? 20;
          if ((x - z.x) ** 2 + (y - z.y) ** 2 <= rr * rr) return { type: 'zone', id: z.id };
        } else if (x >= z.x && x <= z.x + (z.w ?? 40) && y >= z.y && y <= z.y + (z.h ?? 40)) {
          return { type: 'zone', id: z.id };
        }
      }
    }
    return null;
  }

  function handleAt(sel, which) {
    const obj = selectedObj();
    if (!obj) return null;
    if (sel.type === 'token' || sel.type === 'blockade') {
      const { x, y, w, h } = obj;
      const pts = {
        nw: [x, y],
        ne: [x + w, y],
        se: [x + w, y + h],
        sw: [x, y + h],
        rot: [x + w / 2, y - 22],
      };
      return pts[which];
    }
    if (sel.type === 'zone' && obj.shape === 'rect') {
      const w = obj.w ?? 40;
      const h = obj.h ?? 40;
      const { x, y } = obj;
      return {
        nw: [x, y],
        n: [x + w / 2, y],
        ne: [x + w, y],
        e: [x + w, y + h / 2],
        se: [x + w, y + h],
        s: [x + w / 2, y + h],
        sw: [x, y + h],
        w: [x, y + h / 2],
      }[which];
    }
    if (sel.type === 'zone' && obj.shape === 'circle') {
      return { e: [obj.x + (obj.r ?? 20), obj.y] }[which];
    }
    return null;
  }

  function handleHit(x, y) {
    if (!state.selected) return null;
    const kinds =
      state.selected.type === 'token' || state.selected.type === 'blockade'
        ? ['nw', 'ne', 'se', 'sw', 'rot']
        : state.selected.type === 'zone' && findZone(state.selected.id)?.shape === 'circle'
          ? ['e']
          : state.selected.type === 'zone'
            ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
            : [];
    for (const kind of kinds) {
      const p = handleAt(state.selected, kind);
      if (!p) continue;
      if (Math.abs(x - p[0]) <= 8 && Math.abs(y - p[1]) <= 8) return kind;
    }
    return null;
  }

  function render() {
    if (!state.map) return;
    overlay.setAttribute('viewBox', `0 0 ${state.map.width} ${state.map.height}`);
    const parts = [];
    const sel = state.selected;

    if (state.show.edges) {
      (state.map.edges ?? []).forEach((e, i) => {
        const a = findRoom(e.from);
        const b = findRoom(e.to);
        if (!a || !b) return;
        const on = sel && sel.type === 'edge' && sel.index === i;
        parts.push(
          `<line class="edge ${e.pathType || 'door'}${on ? ' sel' : ''}" data-type="edge" data-index="${i}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`,
        );
      });
    }

    if (state.show.zones) {
      for (const z of state.map.zones ?? []) {
        if (!visibleSide(z.side)) continue;
        const on = sel && sel.type === 'zone' && sel.id === z.id;
        if (z.shape === 'circle') {
          parts.push(
            `<circle class="zone-shape${on ? ' sel' : ''}" data-type="zone" data-id="${z.id}" cx="${z.x}" cy="${z.y}" r="${z.r ?? 20}" fill="${hexToRgba(z.color, 0.22)}" stroke="${z.color}" stroke-width="2" />`,
          );
          if (z.label) {
            parts.push(
              `<text class="label" x="${z.x}" y="${z.y + (z.r ?? 20) + 12}" fill="${z.color}">${z.label}</text>`,
            );
          }
        } else {
          parts.push(
            `<rect class="zone-shape${on ? ' sel' : ''}" data-type="zone" data-id="${z.id}" x="${z.x}" y="${z.y}" width="${z.w ?? 40}" height="${z.h ?? 40}" rx="6" fill="${hexToRgba(z.color, 0.22)}" stroke="${z.color}" stroke-width="2" />`,
          );
          if (z.label) {
            parts.push(
              `<text class="label" x="${z.x + (z.w ?? 40) / 2}" y="${z.y + (z.h ?? 40) / 2 + 4}" fill="${z.color}">${z.label}</text>`,
            );
          }
        }
      }
    }

    if (state.show.rooms) {
      for (const r of state.map.rooms) {
        const on =
          (sel && sel.type === 'room' && sel.id === r.id) || state.linkFrom === r.id;
        const name = state.side === 'killer' && r.nameKiller ? r.nameKiller : r.name;
        parts.push(
          `<circle class="node${on ? ' sel' : ''}" data-type="room" data-id="${r.id}" cx="${r.x}" cy="${r.y}" r="18" />`,
          `<text class="label" x="${r.x}" y="${r.y - 2}">${r.id}</text>`,
          `<text class="sub" x="${r.x}" y="${r.y + 11}">${name}</text>`,
        );
      }
    }

    if (state.show.tokens) {
      for (const t of state.map.tokens ?? []) {
        if (t.kind === 'blockade' || t.kind === '封堵') continue;
        if (!visibleSide(t.side)) continue;
        const on = sel && sel.type === 'token' && sel.id === t.id;
        const cx = t.x + t.w / 2;
        const cy = t.y + t.h / 2;
        const rot = t.rotation ?? 0;
        parts.push(
          `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-t.w / 2} ${-t.h / 2})">`,
          `<image href="${encodeURI(t.src)}" width="${t.w}" height="${t.h}" preserveAspectRatio="xMidYMid meet" />`,
          `<rect class="token-hit${on ? ' sel' : ''}" data-type="token" data-id="${t.id}" width="${t.w}" height="${t.h}" />`,
          `</g>`,
        );
      }
    }

    if (state.show.blockades) {
      (state.map.edges ?? []).forEach((e, i) => {
        if (!isDoorEdge(e.pathType)) return;
        const m = e.blockade?.[state.side];
        if (!m) return;
        const on = sel && sel.type === 'blockade' && sel.index === i;
        const cx = m.x + m.w / 2;
        const cy = m.y + m.h / 2;
        const rot = m.rotation ?? 0;
        parts.push(
          `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-m.w / 2} ${-m.h / 2})">`,
          `<image href="${encodeURI(BLOCKADE_SRC)}" width="${m.w}" height="${m.h}" preserveAspectRatio="xMidYMid meet" />`,
          `<rect class="token-hit blockade${on ? ' sel' : ''}" data-type="blockade" data-index="${i}" width="${m.w}" height="${m.h}" />`,
          `</g>`,
        );
      });
    }

    if (sel) {
      const kinds =
        sel.type === 'token' || sel.type === 'blockade'
          ? ['nw', 'ne', 'se', 'sw', 'rot']
          : sel.type === 'zone' && findZone(sel.id)?.shape === 'circle'
            ? ['e']
            : sel.type === 'zone'
              ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
              : [];
      for (const kind of kinds) {
        const p = handleAt(sel, kind);
        if (!p) continue;
        parts.push(
          `<circle class="handle${kind === 'rot' ? ' rot' : ''}" data-handle="${kind}" cx="${p[0]}" cy="${p[1]}" r="6" />`,
        );
      }
    }

    overlay.innerHTML = parts.join('');
    renderInspector();
    renderTokenList();
    renderEdgeList();
  }

  function field(label, value, key, step = 1) {
    return `<label>${label}</label><input type="number" step="${step}" data-key="${key}" value="${round1(value)}" />`;
  }

  function renderInspector() {
    const sel = state.selected;
    const obj = selectedObj();
    if (!sel || !obj) {
      inspector.innerHTML = state.linkMode
        ? `<span class="muted">连线中：${state.linkFrom ? `已选 ${state.linkFrom}，再点另一个地点` : '请点第一个地点'}</span>`
        : '<span class="muted">点击地图上的圆点、矩形、道具或连线。选中地点可改名称。</span>';
      return;
    }
    if (sel.type === 'edge') {
      const type = obj.pathType || 'door';
      const door = isDoorEdge(type);
      inspector.innerHTML = `<div><strong>通道 ${obj.from} ↔ ${obj.to}</strong></div>
        <div class="fields">
          <label>类型</label>
          <select id="edgeType">
            <option value="door"${type === 'door' || !obj.pathType ? ' selected' : ''}>门（白实线，可封堵）</option>
            <option value="dash"${type === 'dash' ? ' selected' : ''}>户外小径（蓝虚线）</option>
            <option value="killer"${type === 'killer' ? ' selected' : ''}>杀手通道（黄虚线）</option>
          </select>
          <label></label>
          <button type="button" class="danger" id="delEdge">删除连线</button>
        </div>
        ${
          door
            ? `<p class="hint">当前视角（${state.side === 'killer' ? '杀手' : '幸存者'}）的封堵标记可拖到白门上。换视角再调另一张图。</p>
               <button type="button" id="editBlockade">选中本视角封堵标记</button>`
            : `<p class="hint">只有白实线门可以封堵，本通道不会出现封堵标记。</p>`
        }`;
      $('edgeType').onchange = () => {
        obj.pathType = $('edgeType').value;
        if (isDoorEdge(obj.pathType)) ensureDoorBlockades();
        markDirty();
        render();
      };
      $('delEdge').onclick = () => {
        state.map.edges.splice(sel.index, 1);
        state.selected = null;
        markDirty();
        render();
      };
      const editBlk = $('editBlockade');
      if (editBlk) {
        editBlk.onclick = () => {
          ensureDoorBlockades();
          state.selected = { type: 'blockade', index: sel.index, side: state.side };
          render();
        };
      }
      return;
    }
    if (sel.type === 'blockade') {
      const e = (state.map.edges ?? [])[sel.index];
      const sideLabel = (sel.side || state.side) === 'killer' ? '杀手地图' : '幸存者地图';
      inspector.innerHTML = `<div><strong>封堵标记 ${e.from} ↔ ${e.to}</strong></div>
        <p class="hint">${sideLabel}。拖动改位置，角点缩放，绿点旋转。对局里封堵这扇门时，双方地图都会显示各自的标记。</p>
        <div class="fields">
          ${field('X', obj.x, 'x')}
          ${field('Y', obj.y, 'y')}
          ${field('宽', obj.w, 'w')}
          ${field('高', obj.h, 'h')}
          ${field('旋转', obj.rotation ?? 0, 'rotation')}
          <label></label>
          <button type="button" id="resetBlockade">重置到中点</button>
        </div>`;
      inspector.querySelectorAll('input[data-key]').forEach((el) => {
        el.addEventListener('change', () => {
          const key = el.getAttribute('data-key');
          let v = Number(el.value);
          if (!Number.isFinite(v)) return;
          if (key === 'w' || key === 'h') {
            const aspect = obj.w / (obj.h || 1);
            if (key === 'w') {
              obj.w = clamp(v, 8, 400);
              obj.h = round1(obj.w / aspect);
            } else {
              obj.h = clamp(v, 8, 400);
              obj.w = round1(obj.h * aspect);
            }
          } else {
            obj[key] = v;
          }
          markDirty();
          render();
        });
      });
      $('resetBlockade').onclick = () => {
        const a = findRoom(e.from);
        const b = findRoom(e.to);
        if (!a || !b) return;
        const next = defaultBlockadeMark(a, b);
        obj.x = next.x;
        obj.y = next.y;
        obj.w = next.w;
        obj.h = next.h;
        obj.rotation = next.rotation;
        markDirty();
        render();
      };
      return;
    }
    const title =
      sel.type === 'room'
        ? `房间 ${obj.id} ${obj.name}`
        : sel.type === 'zone'
          ? `高亮 ${obj.id}（${obj.shape === 'circle' ? '圆' : '矩形'}）`
          : `道具 ${obj.label || obj.id}`;
    let extra = '';
    if (sel.type === 'room') {
      extra =
        field('X', obj.x, 'x') +
        field('Y', obj.y, 'y') +
        `<label>幸存者名</label><input type="text" data-text="name" value="${escapeHtml(obj.name ?? '')}" />` +
        `<label>杀手名</label><input type="text" data-text="nameKiller" value="${escapeHtml(obj.nameKiller ?? '')}" />`;
    }
    if (sel.type === 'zone' && obj.shape === 'circle') {
      extra = field('X', obj.x, 'x') + field('Y', obj.y, 'y') + field('半径', obj.r ?? 20, 'r');
    }
    if (sel.type === 'zone' && obj.shape === 'rect') {
      extra =
        field('X', obj.x, 'x') +
        field('Y', obj.y, 'y') +
        field('宽', obj.w ?? 40, 'w') +
        field('高', obj.h ?? 40, 'h');
    }
    if (sel.type === 'token') {
      extra =
        field('X', obj.x, 'x') +
        field('Y', obj.y, 'y') +
        field('宽', obj.w, 'w') +
        field('高', obj.h, 'h') +
        field('旋转', obj.rotation ?? 0, 'rotation') +
        `<label></label><button type="button" class="danger" id="delToken">删除道具</button>`;
    }
    inspector.innerHTML = `<div><strong>${title}</strong></div><div class="fields">${extra}</div>`;
    inspector.querySelectorAll('input[data-key]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.getAttribute('data-key');
        let v = Number(el.value);
        if (!Number.isFinite(v)) return;
        if (sel.type === 'token' && (key === 'w' || key === 'h')) {
          const aspect = obj.w / (obj.h || 1);
          if (key === 'w') {
            obj.w = clamp(v, 8, 400);
            obj.h = round1(obj.w / aspect);
          } else {
            obj.h = clamp(v, 8, 400);
            obj.w = round1(obj.h * aspect);
          }
        } else {
          obj[key] = v;
        }
        markDirty();
        render();
      });
    });
    inspector.querySelectorAll('input[data-text]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.getAttribute('data-text');
        obj[key] = el.value;
        markDirty();
        render();
      });
    });
    const del = $('delToken');
    if (del) {
      del.onclick = () => {
        state.map.tokens = (state.map.tokens ?? []).filter((t) => t.id !== obj.id);
        state.selected = null;
        markDirty();
        render();
      };
    }
  }

  function renderTokenList() {
    const tokens = (state.map.tokens ?? []).filter((t) => t.kind !== 'blockade' && t.kind !== '封堵');
    tokenList.innerHTML = tokens
      .map((t) => {
        const on = state.selected?.type === 'token' && state.selected.id === t.id;
        return `<div class="token-item${on ? ' active' : ''}" data-id="${t.id}">
          <img src="${encodeURI(t.src)}" alt="" />
          <div class="meta">
            <strong>${t.label || t.id}</strong><br />
            位置 ${round1(t.x)}, ${round1(t.y)} · ${round1(t.w)}×${round1(t.h)} · ${round1(t.rotation ?? 0)}°
          </div>
        </div>`;
      })
      .join('');
    tokenList.querySelectorAll('.token-item').forEach((el) => {
      el.onclick = () => {
        state.selected = { type: 'token', id: el.getAttribute('data-id') };
        render();
      };
    });
  }

  function renderEdgeList() {
    if (!edgeList || !state.map) return;
    const edges = state.map.edges ?? [];
    edgeList.innerHTML = edges
      .map((e, i) => {
        const on = state.selected?.type === 'edge' && state.selected.index === i;
        return `<div class="token-item${on ? ' active' : ''}" data-index="${i}">
          <div class="meta" style="grid-column:1/-1">
            <strong>${e.from} ↔ ${e.to}</strong><br />
            ${pathTypeLabel(e.pathType || 'door')}${isDoorEdge(e.pathType) ? ' · 可封堵' : ''}
          </div>
        </div>`;
      })
      .join('');
    edgeList.querySelectorAll('.token-item').forEach((el) => {
      el.onclick = () => {
        state.selected = { type: 'edge', index: Number(el.getAttribute('data-index')) };
        render();
      };
    });
  }

  function addEdge(from, to, pathType) {
    if (from === to) return;
    const existing = findEdgeIndex(from, to);
    if (existing >= 0) {
      state.selected = { type: 'edge', index: existing };
      setStatus(`已有 ${from} ↔ ${to}，已选中`, 'ok');
      return;
    }
    state.map.edges = state.map.edges ?? [];
    state.map.edges.push({ from, to, bidirectional: true, pathType: pathType || 'door' });
    if (isDoorEdge(pathType || 'door')) ensureDoorBlockades();
    state.selected = { type: 'edge', index: state.map.edges.length - 1 };
    markDirty();
    setStatus(`已连接 ${from} ↔ ${to}（${pathTypeLabel(pathType || 'door')}）`, 'dirty');
  }

  overlay.addEventListener('pointerdown', (ev) => {
    if (!state.map) return;
    ev.preventDefault();
    overlay.setPointerCapture(ev.pointerId);
    const p = clientToMap(ev.clientX, ev.clientY);
    const handle = handleHit(p.x, p.y);
    if (handle) {
      const obj = selectedObj();
      state.drag = {
        kind: handle,
        start: { ...obj },
        pointer: p,
        type: state.selected.type,
        id: state.selected.id,
        index: state.selected.index,
        side: state.selected.side,
      };
      return;
    }
    const hit = hitTest(p.x, p.y);
    if (state.linkMode) {
      if (hit?.type === 'room') {
        if (!state.linkFrom) {
          state.linkFrom = hit.id;
          state.selected = hit;
          setStatus(`连线：已选 ${hit.id}，再点另一个地点`, 'dirty');
        } else {
          addEdge(state.linkFrom, hit.id, $('newEdgeType').value);
          state.linkFrom = null;
        }
      } else {
        state.linkFrom = null;
        state.selected = hit;
      }
      render();
      return;
    }
    state.selected = hit;
    if (hit && hit.type !== 'edge') {
      const obj = selectedObj();
      if (obj && typeof obj.x === 'number') {
        state.drag = {
          kind: 'move',
          start: { ...obj },
          pointer: p,
          type: hit.type,
          id: hit.id,
          index: hit.index,
          side: hit.side,
        };
      }
    }
    render();
  });

  overlay.addEventListener('pointermove', (ev) => {
    if (!state.drag || !state.map) return;
    const p = clientToMap(ev.clientX, ev.clientY);
    const obj =
      state.drag.type === 'room'
        ? findRoom(state.drag.id)
        : state.drag.type === 'zone'
          ? findZone(state.drag.id)
          : state.drag.type === 'blockade'
            ? selectedBlockadeMark(state.drag.index, state.drag.side)
            : findToken(state.drag.id);
    if (!obj) return;
    const dx = p.x - state.drag.pointer.x;
    const dy = p.y - state.drag.pointer.y;
    const s = state.drag.start;

    if (state.drag.kind === 'move') {
      obj.x = round1(s.x + dx);
      obj.y = round1(s.y + dy);
    } else if (state.drag.type === 'token' || state.drag.type === 'blockade') {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      if (state.drag.kind === 'rot') {
        obj.rotation = round1((Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90);
      } else {
        const startHalf = Math.hypot(s.w / 2, s.h / 2) || 1;
        const nowHalf = Math.hypot(p.x - cx, p.y - cy);
        const scale = clamp(nowHalf / startHalf, 0.15, 8);
        obj.w = round1(clamp(s.w * scale, 8, 420));
        obj.h = round1(clamp(s.h * scale, 8, 420));
        obj.x = round1(cx - obj.w / 2);
        obj.y = round1(cy - obj.h / 2);
      }
    } else if (state.drag.type === 'zone' && obj.shape === 'circle') {
      obj.r = round1(clamp(Math.hypot(p.x - obj.x, p.y - obj.y), 6, 120));
    } else if (state.drag.type === 'zone') {
      let x = s.x;
      let y = s.y;
      let w = s.w ?? 40;
      let h = s.h ?? 40;
      const kind = state.drag.kind;
      if (kind.includes('e')) w = p.x - x;
      if (kind.includes('s')) h = p.y - y;
      if (kind.includes('w')) {
        w = x + w - p.x;
        x = p.x;
      }
      if (kind.includes('n')) {
        h = y + h - p.y;
        y = p.y;
      }
      if (w < 8) {
        if (kind.includes('w')) x -= 8 - w;
        w = 8;
      }
      if (h < 8) {
        if (kind.includes('n')) y -= 8 - h;
        h = 8;
      }
      obj.x = round1(x);
      obj.y = round1(y);
      obj.w = round1(w);
      obj.h = round1(h);
    }
    markDirty();
    render();
  });

  overlay.addEventListener('pointerup', () => {
    state.drag = null;
  });
  overlay.addEventListener('pointercancel', () => {
    state.drag = null;
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, select, textarea')) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && state.selected?.type === 'edge') {
      ev.preventDefault();
      state.map.edges.splice(state.selected.index, 1);
      state.selected = null;
      markDirty();
      render();
      return;
    }
    const obj = selectedObj();
    if (!obj || state.selected?.type === 'edge') return;
    const step = ev.shiftKey ? 5 : 1;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
      ev.preventDefault();
      if (ev.key === 'ArrowLeft') obj.x = round1(obj.x - step);
      if (ev.key === 'ArrowRight') obj.x = round1(obj.x + step);
      if (ev.key === 'ArrowUp') obj.y = round1(obj.y - step);
      if (ev.key === 'ArrowDown') obj.y = round1(obj.y + step);
      markDirty();
      render();
    }
    if (state.selected?.type === 'token' || state.selected?.type === 'blockade') {
      if (ev.key === '[' || ev.key === ']') {
        obj.rotation = round1((obj.rotation ?? 0) + (ev.key === ']' ? 5 : -5));
        markDirty();
        render();
      }
      if (ev.key === '+' || ev.key === '=' || ev.key === '-') {
        const scale = ev.key === '-' ? 0.95 : 1.05;
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        obj.w = round1(clamp(obj.w * scale, 8, 420));
        obj.h = round1(clamp(obj.h * scale, 8, 420));
        obj.x = round1(cx - obj.w / 2);
        obj.y = round1(cy - obj.h / 2);
        markDirty();
        render();
      }
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && state.selected?.type === 'token') {
        state.map.tokens = (state.map.tokens ?? []).filter((t) => t.id !== obj.id);
        state.selected = null;
        markDirty();
        render();
      }
    }
  });

  async function loadMap(id) {
    const res = await fetch(`/api/maps/${id}`);
    if (!res.ok) throw new Error('无法读取地图');
    state.map = await res.json();
    state.map.tokens = state.map.tokens ?? [];
    state.map.zones = state.map.zones ?? [];
    state.map.edges = state.map.edges ?? [];
    const addedMarks = ensureDoorBlockades() + ensureRescueCars();
    state.mapId = id;
    state.selected = null;
    state.linkFrom = null;
    state.dirty = false;
    const bg =
      state.side === 'killer'
        ? state.map.backgrounds?.killer
        : state.map.backgrounds?.survivor ?? state.map.backgrounds?.killer;
    mapImg.src = encodeURI(bg || '');
    overlay.setAttribute('viewBox', `0 0 ${state.map.width} ${state.map.height}`);
    if (addedMarks) {
      markDirty();
      setStatus(`已加载 ${state.map.name}。已补上门封堵/警车格位，请拖到图上后保存。`, 'dirty');
    } else {
      setStatus(`已加载 ${state.map.name}`, 'ok');
    }
    render();
  }

  async function saveMap() {
    if (!state.map) return;
    const res = await fetch(`/api/maps/${state.map.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.map),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '保存失败');
    state.map = data.map;
    state.dirty = false;
    setStatus(`已写入 content/maps（${state.map.name}）。新开房间会用这份数据。`, 'ok');
  }

  function fillMapSelect() {
    $('mapSelect').innerHTML = state.maps
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
    $('mapSelect').value = state.mapId;
  }

  function fillAssets() {
    $('assetSelect').innerHTML = state.assets
      .map((a) => `<option value="${a.src}">${a.label}</option>`)
      .join('');
  }

  $('mapSelect').onchange = async () => {
    if (state.dirty && !confirm('有未保存更改，切换地图将丢弃。继续？')) {
      $('mapSelect').value = state.mapId;
      return;
    }
    await loadMap($('mapSelect').value);
  };
  $('sideSelect').onchange = () => {
    state.side = $('sideSelect').value;
    const bg =
      state.side === 'killer'
        ? state.map?.backgrounds?.killer
        : state.map?.backgrounds?.survivor ?? state.map?.backgrounds?.killer;
    if (bg) mapImg.src = encodeURI(bg);
    if (state.selected?.type === 'blockade') {
      state.selected.side = state.side;
    }
    render();
  };
  $('reloadBtn').onclick = async () => {
    if (state.dirty && !confirm('有未保存更改，重新加载将丢弃。继续？')) return;
    await loadMap(state.mapId);
  };
  $('saveBtn').onclick = async () => {
    try {
      await saveMap();
    } catch (e) {
      setStatus(e.message, 'err');
    }
  };
  $('addTokenBtn').onclick = () => {
    if (!state.map) return;
    const src = $('assetSelect').value;
    const asset = state.assets.find((a) => a.src === src);
    if (!src) return;
    const id = `token_${Date.now().toString(36)}`;
    state.map.tokens = state.map.tokens ?? [];
    state.map.tokens.push({
      id,
      kind: asset?.id ?? 'item',
      src,
      x: state.map.width * 0.4,
      y: state.map.height * 0.4,
      w: 36,
      h: 36,
      rotation: 0,
      side: 'both',
      label: asset?.label ?? id,
    });
    state.selected = { type: 'token', id };
    markDirty();
    render();
  };

  $('linkBtn').onclick = () => {
    state.linkMode = !state.linkMode;
    state.linkFrom = null;
    $('linkBtn').classList.toggle('primary', state.linkMode);
    $('linkBtn').textContent = state.linkMode ? '结束连线' : '开始连线';
    setStatus(
      state.linkMode ? '连线模式：依次点两个地点' : '已退出连线模式',
      state.linkMode ? 'dirty' : 'ok',
    );
    render();
  };

  ['showRooms', 'showZones', 'showTokens', 'showEdges', 'showBlockades'].forEach((id) => {
    $(id).onchange = () => {
      state.show.rooms = $('showRooms').checked;
      state.show.zones = $('showZones').checked;
      state.show.tokens = $('showTokens').checked;
      state.show.edges = $('showEdges').checked;
      state.show.blockades = $('showBlockades').checked;
      render();
    };
  });

  mapImg.onload = () => render();

  async function boot() {
    try {
      const [mapsRes, assetsRes] = await Promise.all([
        fetch('/api/maps'),
        fetch('/api/calibrate/assets'),
      ]);
      state.maps = await mapsRes.json();
      state.assets = await assetsRes.json();
      fillAssets();
      if (!state.maps.length) {
        setStatus('没有可校准的地图', 'err');
        return;
      }
      const q = new URLSearchParams(location.search);
      state.mapId = q.get('map') || state.maps[0].id;
      fillMapSelect();
      await loadMap(state.mapId);
    } catch (e) {
      setStatus(`无法连接服务端：${e.message}。请先启动游戏服务。`, 'err');
    }
  }

  boot();
})();
