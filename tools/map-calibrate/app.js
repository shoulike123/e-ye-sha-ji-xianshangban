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
    show: { rooms: true, zones: true, tokens: true, edges: true, blockades: true, collapseMarks: true },
    linkMode: false,
    linkFrom: null,
  };

  const BLOCKADE_SRC = '/Image/UI/封堵.png';
  /** 【城堡】机关大门：和封堵一样贴在门上，但位置/大小是**全图共用一份**的 */
  const LEVER_GATE_SRC = '/Image/UI/机关大门.png';
  /** 机关大门只在城堡用 */
  const isCastle = () => state.map?.id === 'castle';

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

  /** 鼠标位置 → 地图像素坐标（换算逻辑与其它工具共用 ToolUtil） */
  function clientToMap(clientX, clientY) {
    return ToolUtil.clientToBox(overlay, clientX, clientY, state.map.width, state.map.height);
  }

  const clamp = (...a) => ToolUtil.clamp(...a);

  const round1 = (n) => ToolUtil.round1(n);

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;');
  }

  const hexToRgba = (hex, alpha) => ToolUtil.hexToRgba(hex, alpha);

  function findRoom(id) {
    return state.map.rooms.find((r) => r.id === id);
  }
  function findZone(id) {
    return (state.map.zones ?? []).find((z) => z.id === id);
  }
  function findToken(id) {
    return (state.map.tokens ?? []).find((t) => t.id === id);
  }
  /**
   * 【墓穴】坍塌板块。按 `roomId` 找（每个可坍塌地点一块）。
   * 位置存的是**旋转前**的矩形；旋转只允许 0/90/180/270，
   * 这样拖拽和命中判定都能用简单的坐标变换处理，不会出错。
   */
  function findCollapseMark(roomId) {
    return (state.map.collapsedMarks ?? []).find((m) => m.roomId === roomId);
  }

  /**
   * 把"旋转 90/180/270 度"换算成外接框（+ 中心）。
   * 旋转后外接框会**转置**：`w/h` 互换 —— 命中判定和手柄都用这个。
   */
  function markBox(m) {
    const rot = ((Math.round((m.rotation ?? 0) / 90) * 90) % 360 + 360) % 360;
    const cx = m.x + m.w / 2;
    const cy = m.y + m.h / 2;
    const bw = rot === 90 || rot === 270 ? m.h : m.w;
    const bh = rot === 90 || rot === 270 ? m.w : m.h;
    return { cx, cy, rot, bw, bh, x: cx - bw / 2, y: cy - bh / 2 };
  }

  /** 点在某个旋转后的矩形里吗 */
  function insideMark(m, x, y) {
    const b = markBox(m);
    return x >= b.x && x <= b.x + b.bw && y >= b.y && y <= b.y + b.bh;
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

  /* ---------------------------------------------- 机关大门（城堡） ---- */
  /**
   * 【城堡】机关大门：**和封堵共用同一个位置**（用户要求）。
   *
   * 也就是说大门的位置、大小、角度全都读该扇门的 `blockade[side]`
   * —— 在这里拖封堵，就等于调好了机关大门；保存时也只存封堵那一份数据。
   * 所以这个工具里机关大门只是**只读预览**（换一张图看看贴上去什么样），
   * 不能单独拖它。
   */
  function gatePreviewDoor() {
    if (!isCastle()) return null;
    const edges = state.map.edges ?? [];
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (!isDoorEdge(e.pathType)) continue;
      const a = findRoom(e.from);
      const b = findRoom(e.to);
      const m = e.blockade?.[state.side];
      if (a && b && m) return { index: i, a, b, m };
    }
    return null;
  }

  /** 画预览用：中心点 + 尺寸 + 门的角度（全部来自那扇门的封堵标记） */
  function gateMarkAbs() {
    const d = gatePreviewDoor();
    if (!d) return null;
    return {
      cx: round1(d.m.x + d.m.w / 2),
      cy: round1(d.m.y + d.m.h / 2),
      w: d.m.w,
      h: d.m.h,
      angle: round1(
        d.m.rotation ?? (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI,
      ),
    };
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
    if (state.selected.type === 'collapseMark') return findCollapseMark(state.selected.id) ?? null;
    return findToken(state.selected.id);
  }

  function hitTest(x, y) {
    /** 【墓穴】坍塌板块画在最上层，所以也最先命中 */
    if (state.show.collapseMarks !== false) {
      const marks = [...(state.map.collapsedMarks ?? [])].reverse();
      for (const m of marks) {
        if (!visibleSide(m.side)) continue;
        if (insideMark(m, x, y)) return { type: 'collapseMark', id: m.roomId };
      }
    }
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
    /**
     * 【城堡】机关大门预览：它**和封堵共用位置**，所以这里按那扇门的
     * 封堵标记来画（只读，不能拖 —— 要调就调封堵）。
     * 把鼠标点转进门的局部坐标再判，斜门上的命中也不会歪。
     */
    if (state.show.gates !== false) {
      const g = gateMarkAbs();
      if (g) {
        const rad = (-g.angle * Math.PI) / 180;
        const dx = x - g.cx;
        const dy = y - g.cy;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        if (Math.abs(lx) <= g.w / 2 + 4 && Math.abs(ly) <= Math.max(g.h / 2, 12) + 4) {
          return { type: 'blockade', index: gatePreviewDoor()?.index, side: state.side };
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
    /**
     * 【墓穴】坍塌板块：手柄按**旋转后**的外接框摆（`markBox`），
     * 拖角改尺寸、拖顶上那个点改旋转（每次 90 度）。
     */
    if (sel.type === 'collapseMark') {
      const b = markBox(obj);
      const pts = {
        nw: [b.x, b.y],
        ne: [b.x + b.bw, b.y],
        se: [b.x + b.bw, b.y + b.bh],
        sw: [b.x, b.y + b.bh],
        rot: [b.cx, b.y - 22],
      };
      return pts[which];
    }
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

    /**
     * 【墓穴】**坍塌板块**（每个可坍塌地点一块）。
     * 这里把 4 块**全都画出来**（不管局里塌没塌）—— 编辑界面要能提前把位置摆好，
     * 实际对局里只画"已经塌了"的那些（见 `client/src/Board.tsx`）。
     */
    if (state.show.collapseMarks !== false) {
      for (const m of state.map.collapsedMarks ?? []) {
        if (!visibleSide(m.side)) continue;
        const b = markBox(m);
        const on = sel && sel.type === 'collapseMark' && sel.id === m.roomId;
        parts.push(
          `<g transform="translate(${b.cx} ${b.cy}) rotate(${b.rot}) translate(${-m.w / 2} ${-m.h / 2})">`,
          `<image href="${encodeURI(m.src)}" width="${m.w}" height="${m.h}" preserveAspectRatio="xMidYMid meet" />`,
          `<rect class="token-hit${on ? ' sel' : ''}" data-type="collapseMark" data-id="${m.roomId}" width="${m.w}" height="${m.h}" fill="rgba(160,120,220,0.25)" stroke="#a06bd6" />`,
          `</g>`,
          `<text class="sub" x="${b.cx}" y="${b.y - 6}" fill="#c79bff">坍塌：${m.roomId}</text>`,
        );
      }
    }

    /**
     * 【城堡】**机关大门**预览（只读）。
     *
     * 它**和封堵共用位置**（用户要求）：位置、大小、角度全读那扇门的
     * `blockade` 数据，只是把图片换成竖闸门。所以这里不给边框、不给手柄
     * —— 想调就调封堵，拖封堵就是拖它。
     */
    if (state.show.gates !== false) {
      const g = gateMarkAbs();
      if (g) {
        parts.push(
          `<g transform="translate(${g.cx} ${g.cy}) rotate(${g.angle}) translate(${-g.w / 2} ${-g.h / 2})" pointer-events="none">`,
          `<image href="${encodeURI(LEVER_GATE_SRC)}" width="${g.w}" height="${g.h}" preserveAspectRatio="xMidYMid meet" />`,
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
        sel.type === 'token' || sel.type === 'blockade' || sel.type === 'collapseMark'
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
    if (sel.type === 'collapseMark') {
      const b = markBox(obj);
      inspector.innerHTML = `<div><strong>坍塌板块：${obj.roomId}</strong></div>
        <p class="hint">
          【墓穴】杀手每次升级时会随机塌掉 <strong>${(state.map.collapsibleRooms ?? []).join(' / ') || '（未配置）'}</strong>
          里的一个，塌掉的地点会盖上这块图。<br />
          位置存的是<strong>旋转前</strong>的矩形；旋转只吸附 0/90/180/270。<br />
          素材在生产环境读 <code>${obj.src}</code>。
        </p>
        <div class="fields">
          ${field('X', obj.x, 'x')}
          ${field('Y', obj.y, 'y')}
          ${field('宽', obj.w, 'w')}
          ${field('高', obj.h, 'h')}
          ${field('旋转', obj.rotation ?? 0, 'rotation')}
          <label>显示方</label>
          <select id="cmSide">
            <option value="both"${(obj.side ?? 'both') === 'both' ? ' selected' : ''}>双方</option>
            <option value="survivor"${obj.side === 'survivor' ? ' selected' : ''}>只有幸存者</option>
            <option value="killer"${obj.side === 'killer' ? ' selected' : ''}>只有杀手</option>
          </select>
          <label>素材</label>
          <input type="text" id="cmSrc" value="${escapeHtml(obj.src)}" />
        </div>
        <p class="hint">旋转后的外接框：${round1(b.x)}, ${round1(b.y)} · ${round1(b.bw)}×${round1(b.bh)}</p>`;
      const bind = (id, apply) => {
        const el = $(id);
        if (el) el.onchange = () => { apply(el.value); markDirty(); render(); };
      };
      bind('cmSide', (v) => { obj.side = v; });
      bind('cmSrc', (v) => { obj.src = v; });
      /**
       * 数字输入：**宽高各自独立**（不像封堵标记那样锁宽高比）——
       * 坍塌板块贴到地图上以后，用户想单独微调长或宽；
       * 旋转吸附到 90 的倍数，和拖拽时的规则一致。
       */
      inspector.querySelectorAll('input[data-key]').forEach((el) => {
        el.addEventListener('change', () => {
          const key = el.getAttribute('data-key');
          const v = Number(el.value);
          if (!Number.isFinite(v)) return;
          if (key === 'rotation') {
            obj.rotation = ((Math.round(v / 90) * 90) % 360 + 360) % 360;
          } else if (key === 'w') {
            obj.w = clamp(v, 12, 500);
          } else if (key === 'h') {
            obj.h = clamp(v, 12, 500);
          } else {
            obj[key] = v;
          }
          markDirty();
          render();
        });
      });
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
    /**
     * 【墓穴】坍塌板块也列进这张表（点了就选中，方便用手柄/输入框细调）。
     * 它们不是 `tokens`，而是 `collapsedMarks`，所以单独拼一段并带 `data-mark` 标记。
     */
    const marks = state.map.collapsedMarks ?? [];
    tokenList.innerHTML =
      marks
        .map((m) => {
          const on = state.selected?.type === 'collapseMark' && state.selected.id === m.roomId;
          return `<div class="token-item${on ? ' active' : ''}" data-mark="${m.roomId}">
            <img src="${encodeURI(m.src)}" alt="" />
            <div class="meta">
              <strong>坍塌板块 · ${m.roomId}</strong><br />
              位置 ${round1(m.x)}, ${round1(m.y)} · ${round1(m.w)}×${round1(m.h)} · ${round1(m.rotation ?? 0)}°
            </div>
          </div>`;
        })
        .join('') +
      tokens
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
        const mark = el.getAttribute('data-mark');
        state.selected = mark
          ? { type: 'collapseMark', id: mark }
          : { type: 'token', id: el.getAttribute('data-id') };
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
          : state.drag.type === 'collapseMark'
            ? findCollapseMark(state.drag.id)
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
    } else if (state.drag.type === 'collapseMark') {
      /**
       * 坍塌板块：旋转**吸附到 0/90/180/270**。
       *
       * 特意不做自由角度：`markBox` 的外接框算法假设直角，
       * 自由角度会让手柄位置和"点中了没有"都对不上（很难用）。
       * 规则上板块本来也就是转 90 度贴上去的。
       */
      if (state.drag.kind === 'rot') {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const raw = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        obj.rotation = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
      } else {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const startHalf = Math.hypot(s.w / 2, s.h / 2) || 1;
        const nowHalf = Math.hypot(p.x - cx, p.y - cy);
        const scale = clamp(nowHalf / startHalf, 0.15, 8);
        /** 尺寸始终按"旋转前"存：转了 90 度的那块，拖角时手感会反过来，这是有意的简化 */
        obj.w = round1(clamp(s.w * scale, 12, 500));
        obj.h = round1(clamp(s.h * scale, 12, 500));
        obj.x = round1(cx - obj.w / 2);
        obj.y = round1(cy - obj.h / 2);
      }
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

  ['showRooms', 'showZones', 'showTokens', 'showEdges', 'showBlockades', 'showGates', 'showCollapseMarks'].forEach((id) => {
    $(id).onchange = () => {
      state.show.rooms = $('showRooms').checked;
      state.show.zones = $('showZones').checked;
      state.show.tokens = $('showTokens').checked;
      state.show.edges = $('showEdges').checked;
      state.show.blockades = $('showBlockades').checked;
      state.show.gates = $('showGates').checked;
      state.show.collapseMarks = $('showCollapseMarks').checked;
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
