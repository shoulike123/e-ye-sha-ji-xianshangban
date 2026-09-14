(() => {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const bgImg = $('bgImg');
  const blankBg = $('blankBg');
  const statusEl = $('status');
  const inspector = $('inspector');
  const pieceList = $('pieceList');

  const BGS = {
    status: '/Image/UI/状态栏.png',
    keys: '/Image/UI/钥匙架.png',
    rescue: '/Image/UI/救援板块.png',
    skill3: '/Image/Survivors/幸存者一_安娜_学生/技能与背包.png',
    skill6: '/Image/Survivors/幸存者二_约翰逊_工程师/技能与背包.png',
  };

  const KILLER_ART = {
    killer1: {
      evolution: '/Image/Killers/杀手一_屠夫/进化牌.png',
      standee: '/Image/Killers/杀手一_屠夫/立绘.png',
      back: '/Image/Killers/杀手一_屠夫/牌背.png',
    },
    killer2: {
      evolution: '/Image/Killers/杀手二_幽魂/进化牌.png',
      standee: '/Image/Killers/杀手二_幽魂/立绘.png',
      back: '/Image/Killers/杀手二_幽魂/牌背.png',
    },
    killer3: {
      evolution: '/Image/Killers/杀手三_谋杀者/进化牌.png',
      standee: '/Image/Killers/杀手三_谋杀者/立绘.png',
      back: '/Image/Killers/杀手三_谋杀者/牌背.png',
    },
  };

  const SEARCH_CARD_W = 531;
  const SEARCH_CARD_H = 803;

  const state = {
    layout: null,
    panel: 'status',
    killerId: 'killer1',
    selected: null,
    drag: null,
    dirty: false,
  };

  function setStatus(text, kind = '') {
    statusEl.textContent = text;
    statusEl.className = `status ${kind}`;
  }

  function markDirty() {
    state.dirty = true;
    setStatus('有未保存更改', 'dirty');
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function slotHeightFromWidth(wPct, boardW, boardH) {
    return (wPct * boardW * SEARCH_CARD_H) / (boardH * SEARCH_CARD_W);
  }

  function slotWidthFromHeight(hPct, boardW, boardH) {
    return (hPct * boardH * SEARCH_CARD_W) / (boardW * SEARCH_CARD_H);
  }

  function lockSlotBox(box, prefer) {
    const board = { w: 1832, h: 1853 };
    if (prefer === 'h') {
      box.w = round1(clamp(slotWidthFromHeight(box.h, board.w, board.h), 1, 80));
    } else {
      box.h = round1(clamp(slotHeightFromWidth(box.w, board.w, board.h), 1, 80));
    }
  }

  function ensureExtras() {
    if (!state.layout) return;
    if (!state.layout.publicStrip) {
      state.layout.publicStrip = {
        evolution: { x: 18, y: 4, w: 64, h: 92 },
        level: { x: 20.5, y: 10, w: 8, h: 14 },
        power: { x: 20.2, y: 78, w: 8, h: 16 },
      };
    }
    if (!state.layout.killerDock) {
      state.layout.killerDock = {
        standee: { x: 1.2, y: 6, w: 14, h: 88 },
        deck: { x: 16.5, y: 8, w: 10, h: 52 },
        discard: { x: 27.5, y: 8, w: 10, h: 52 },
        hand: [
          { x: 39, y: 10, w: 9, h: 48 },
          { x: 48.5, y: 10, w: 9, h: 48 },
          { x: 58, y: 10, w: 9, h: 48 },
          { x: 67.5, y: 10, w: 9, h: 48 },
          { x: 77, y: 10, w: 9, h: 48 },
        ],
        evolution: { x: 77, y: 62, w: 22, h: 34 },
        evolutionLabel: { x: 77, y: 56, w: 22, h: 6 },
        locked: [{ x: 54, y: 62, w: 12, h: 34 }],
      };
    }
    if (state.layout.killerDock.hand.length > 5) {
      state.layout.killerDock.hand = state.layout.killerDock.hand.slice(0, 5);
    }
    if (!state.layout.killerDock.evolutionLabel) {
      const evo = state.layout.killerDock.evolution;
      state.layout.killerDock.evolutionLabel = {
        x: evo?.x ?? 77,
        y: Math.max(0, (evo?.y ?? 62) - 6),
        w: evo?.w ?? 22,
        h: 6,
      };
    }
    if (!state.layout.killerDock.locked?.length) {
      const evo = state.layout.killerDock.evolution;
      state.layout.killerDock.locked = [
        {
          x: (evo?.x ?? 77) + (evo?.w ?? 22) * 0.55,
          y: evo?.y ?? 62,
          w: 12,
          h: evo?.h ?? 34,
        },
      ];
    }
    if (!state.layout.hudRow) {
      state.layout.hudRow = {
        keys: { x: 0, y: 0, w: 34.5, h: 100 },
        status: { x: 34.5, y: 0, w: 49.8, h: 100 },
        rescue: { x: 84.3, y: 0, w: 15.7, h: 100 },
      };
    }
    if (!state.layout.keySlots?.length) {
      state.layout.keySlots = [
        { x: 2.4, y: 47.5, w: 18, h: 50 },
        { x: 21.4, y: 47.5, w: 18, h: 50 },
        { x: 40.4, y: 47.5, w: 18, h: 50 },
        { x: 59.4, y: 47.5, w: 18, h: 50 },
        { x: 78.4, y: 47.5, w: 18, h: 50 },
      ];
    }
    if (!state.layout.rescueCells?.length) {
      state.layout.rescueCells = [
        { step: 5, x: 6, y: 14, w: 24, h: 32 },
        { step: 4, x: 6, y: 56, w: 24, h: 32 },
        { step: 3, x: 38, y: 14, w: 24, h: 32 },
        { step: 2, x: 38, y: 56, w: 24, h: 32 },
        { step: 1, x: 70, y: 14, w: 24, h: 32 },
        { step: 0, x: 70, y: 56, w: 24, h: 32 },
      ];
    }
    if (!state.layout.killerInfo) {
      state.layout.killerInfo = {
        evolution: { x: 1.6, y: 2, w: 47, h: 55 },
        effects: { x: 50.2, y: 2, w: 47.4, h: 55 },
        locked: [
          { x: 1.6, y: 59, w: 8.2, h: 18 },
          { x: 10.6, y: 59, w: 8.2, h: 18 },
        ],
        cards: [
          { x: 1.6, y: 79, w: 7.6, h: 19 },
          { x: 9.8, y: 79, w: 7.6, h: 19 },
          { x: 18, y: 79, w: 7.6, h: 19 },
          { x: 26.2, y: 79, w: 7.6, h: 19 },
          { x: 34.4, y: 79, w: 7.6, h: 19 },
          { x: 42.6, y: 79, w: 7.6, h: 19 },
          { x: 50.8, y: 79, w: 7.6, h: 19 },
          { x: 59, y: 79, w: 7.6, h: 19 },
          { x: 67.2, y: 79, w: 7.6, h: 19 },
          { x: 75.4, y: 79, w: 7.6, h: 19 },
          { x: 83.6, y: 79, w: 7.6, h: 19 },
          { x: 91.8, y: 79, w: 7.6, h: 19 },
        ],
      };
    }
  }

  function slotBoxes() {
    if (!state.layout) return [];
    return state.panel === 'skill6' ? state.layout.skillBoard.slots6 : state.layout.skillBoard.slots3;
  }

  function clientToPct(clientX, clientY) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }

  function pieces() {
    const L = state.layout;
    if (!L) return [];
    if (state.panel === 'status') {
      const out = L.statusBar.cards.map((b, i) => ({
        id: `card-${i}`,
        label: `状态卡 ${i + 1}`,
        kind: 'card',
        box: b,
      }));
      L.statusBar.fear.forEach((b) => {
        out.push({
          id: `fear-${b.card}-${b.index}`,
          label: `恐惧 卡${b.card + 1}·第${b.index + 1}枚`,
          kind: 'fear',
          box: b,
        });
      });
      L.statusBar.noise.forEach((b) => {
        out.push({
          id: `noise-${b.card}`,
          label: `响声 卡${b.card + 1}`,
          kind: 'noise',
          box: b,
        });
      });
      return out;
    }
    if (state.panel === 'hud') {
      return [
        { id: 'hud-keys', label: '钥匙架', kind: 'hud', box: L.hudRow.keys, src: BGS.keys },
        { id: 'hud-status', label: '角色状态栏', kind: 'hud', box: L.hudRow.status, src: BGS.status },
        { id: 'hud-rescue', label: '救援板块', kind: 'hud', box: L.hudRow.rescue, src: BGS.rescue },
      ];
    }
    if (state.panel === 'keys') {
      return (L.keySlots ?? []).map((b, i) => ({
        id: `key-${i}`,
        label: `钥匙格 ${i + 1}`,
        kind: 'keyslot',
        box: b,
      }));
    }
    if (state.panel === 'rescue') {
      return (L.rescueCells ?? []).map((b) => ({
        id: `rescue-${b.step}`,
        label: b.step === 0 ? '出口（警车终点）' : `救援 ${b.step}`,
        kind: 'rescue',
        box: b,
        src: '/Image/UI/警车.png',
      }));
    }
    if (state.panel === 'public') {
      const art = KILLER_ART[state.killerId];
      return [
        { id: 'pub-evo', label: '进化牌', kind: 'evolution', box: L.publicStrip.evolution, src: art.evolution },
        { id: 'pub-lv', label: '等级', kind: 'level', box: L.publicStrip.level },
        { id: 'pub-pw', label: '力量', kind: 'power', box: L.publicStrip.power },
      ];
    }
    if (state.panel === 'killer') {
      const art = KILLER_ART[state.killerId];
      const D = L.killerDock;
      const out = [
        { id: 'k-standee', label: '立绘', kind: 'standee', box: D.standee, src: art.standee },
        { id: 'k-deck', label: '牌堆', kind: 'deck', box: D.deck, src: art.back },
        { id: 'k-discard', label: '弃牌堆', kind: 'discard', box: D.discard, src: art.back },
        { id: 'k-evo', label: '进化牌', kind: 'evolution', box: D.evolution, src: art.evolution },
        { id: 'k-evo-label', label: '进化牌标注', kind: 'label', box: D.evolutionLabel },
      ];
      D.hand.forEach((b, i) => {
        out.push({ id: `k-hand-${i}`, label: `手牌 ${i + 1}`, kind: 'hand', box: b, src: art.back });
      });
      const lockedArt = {
        killer1: '/Image/Killers/杀手一_屠夫/卡牌/13_残酷暴怒.png',
        killer2: '/Image/Killers/杀手二_幽魂/卡牌/13_生命吸取.png',
        killer3: '/Image/Killers/杀手三_谋杀者/卡牌/13_死亡盛放.png',
      };
      (D.locked ?? []).forEach((b, i) => {
        out.push({
          id: `k-lock-${i}`,
          label: `锁定牌 ${i + 1}`,
          kind: 'locked',
          box: b,
          src: lockedArt[state.killerId],
        });
      });
      return out;
    }
    if (state.panel === 'killerInfo') {
      const art = KILLER_ART[state.killerId];
      const I = L.killerInfo;
      const lockedArt = {
        killer1: '/Image/Killers/杀手一_屠夫/卡牌/13_残酷暴怒.png',
        killer2: '/Image/Killers/杀手二_幽魂/卡牌/13_生命吸取.png',
        killer3: '/Image/Killers/杀手三_谋杀者/卡牌/13_死亡盛放.png',
      };
      const out = [
        { id: 'ki-evo', label: '进化牌', kind: 'evolution', box: I.evolution, src: art.evolution },
        { id: 'ki-fx', label: '已生效进化', kind: 'label', box: I.effects },
      ];
      (I.locked ?? []).forEach((b, i) => {
        out.push({
          id: `ki-lock-${i}`,
          label: `锁定牌 ${i + 1}`,
          kind: 'locked',
          box: b,
          src: lockedArt[state.killerId],
        });
      });
      (I.cards ?? []).forEach((b, i) => {
        out.push({
          id: `ki-card-${i}`,
          label: `行动牌 ${i + 1}`,
          kind: 'hand',
          box: b,
          src: art.back,
        });
      });
      return out;
    }
    return slotBoxes().map((b, i) => ({
      id: `slot-${i}`,
      label: `物品格 ${i + 1}`,
      kind: 'slot',
      box: b,
    }));
  }

  function selectedPiece() {
    return pieces().find((p) => p.id === state.selected) ?? null;
  }

  function render() {
    const list = pieces();
    overlay.innerHTML = list
      .map((p) => {
        const on = p.id === state.selected;
        const fill = p.src
          ? `<img class="piece-art" src="${encodeURI(p.src)}" alt="" />`
          : '';
        return `<div class="piece ${p.kind}${on ? ' sel' : ''}" data-id="${p.id}" style="left:${p.box.x}%;top:${p.box.y}%;width:${p.box.w}%;height:${p.box.h}%;">${fill}<span>${p.label}</span>${
          on
            ? '<i class="handle nw" data-h="nw"></i><i class="handle ne" data-h="ne"></i><i class="handle se" data-h="se"></i><i class="handle sw" data-h="sw"></i>'
            : ''
        }</div>`;
      })
      .join('');

    pieceList.innerHTML = list
      .map(
        (p) =>
          `<div class="token-item${p.id === state.selected ? ' active' : ''}" data-id="${p.id}"><strong>${p.label}</strong><br/>${round1(p.box.x)}, ${round1(p.box.y)} · ${round1(p.box.w)}×${round1(p.box.h)}</div>`,
      )
      .join('');
    pieceList.querySelectorAll('.token-item').forEach((el) => {
      el.onclick = () => {
        state.selected = el.getAttribute('data-id');
        render();
      };
    });

    const sel = selectedPiece();
    if (!sel) {
      inspector.innerHTML = '<span class="muted">点击色块，一次只改一格</span>';
      return;
    }
    inspector.innerHTML = `<div><strong>${sel.label}</strong></div>
      <div class="fields">
        <label>X%</label><input type="number" step="0.1" data-k="x" value="${round1(sel.box.x)}" />
        <label>Y%</label><input type="number" step="0.1" data-k="y" value="${round1(sel.box.y)}" />
        <label>宽%</label><input type="number" step="0.1" data-k="w" value="${round1(sel.box.w)}" />
        <label>高%</label><input type="number" step="0.1" data-k="h" value="${round1(sel.box.h)}" ${sel.kind === 'slot' ? 'title="物品格高度随搜索卡比例锁定"' : ''} />
      </div>${sel.kind === 'slot' ? '<p class="muted">一格一格拖动。四角缩放时保持搜索卡 531×803 比例。</p>' : ''}`;
    inspector.querySelectorAll('input[data-k]').forEach((el) => {
      el.onchange = () => {
        const k = el.getAttribute('data-k');
        const v = Number(el.value);
        if (!Number.isFinite(v)) return;
        sel.box[k] = round1(v);
        if (sel.kind === 'slot') lockSlotBox(sel.box, k === 'h' ? 'h' : 'w');
        markDirty();
        render();
      };
    });
  }

  overlay.addEventListener('pointerdown', (ev) => {
    const handle = ev.target.getAttribute?.('data-h');
    const el = ev.target.closest?.('.piece');
    if (!el) {
      state.selected = null;
      render();
      return;
    }
    ev.preventDefault();
    overlay.setPointerCapture(ev.pointerId);
    const id = el.getAttribute('data-id');
    state.selected = id;
    const p = selectedPiece();
    if (!p) return;
    const pt = clientToPct(ev.clientX, ev.clientY);
    state.drag = {
      handle: handle || 'move',
      start: { ...p.box },
      pointer: pt,
    };
    render();
  });

  overlay.addEventListener('pointermove', (ev) => {
    if (!state.drag) return;
    const p = selectedPiece();
    if (!p) return;
    const pt = clientToPct(ev.clientX, ev.clientY);
    const dx = pt.x - state.drag.pointer.x;
    const dy = pt.y - state.drag.pointer.y;
    const s = state.drag.start;
    const h = state.drag.handle;
    let x = s.x;
    let y = s.y;
    let w = s.w;
    let ht = s.h;
    if (h === 'move') {
      x = s.x + dx;
      y = s.y + dy;
    } else {
      if (h.includes('e')) w = s.w + dx;
      if (h.includes('s')) ht = s.h + dy;
      if (h.includes('w')) {
        x = s.x + dx;
        w = s.w - dx;
      }
      if (h.includes('n')) {
        y = s.y + dy;
        ht = s.h - dy;
      }
    }
    p.box.x = round1(clamp(x, -5, 100));
    p.box.y = round1(clamp(y, -5, 100));
    const maxW = p.kind === 'hud' ? 100 : 80;
    const maxH = p.kind === 'hud' ? 100 : 80;
    p.box.w = round1(clamp(w, 1, maxW));
    p.box.h = round1(clamp(ht, 1, maxH));
    if (p.kind === 'slot' && h !== 'move') {
      lockSlotBox(p.box, h.includes('n') || h.includes('s') ? 'h' : 'w');
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
    const p = selectedPiece();
    if (!p) return;
    const step = ev.shiftKey ? 1 : 0.3;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
      ev.preventDefault();
      if (ev.key === 'ArrowLeft') p.box.x = round1(p.box.x - step);
      if (ev.key === 'ArrowRight') p.box.x = round1(p.box.x + step);
      if (ev.key === 'ArrowUp') p.box.y = round1(p.box.y - step);
      if (ev.key === 'ArrowDown') p.box.y = round1(p.box.y + step);
      markDirty();
      render();
    }
  });

  function setPanel(panel) {
    state.panel = panel;
    state.selected = null;
    const blank = panel === 'public' || panel === 'killer' || panel === 'hud' || panel === 'killerInfo';
    bgImg.hidden = blank;
    blankBg.hidden = !blank;
    blankBg.className = `blank-bg ${panel}`;
    if (!blank) bgImg.src = encodeURI(BGS[panel] || BGS.status);
    const hint = $('hint');
    if (hint) {
      hint.textContent =
        panel === 'killerInfo'
          ? '这是「查看杀手信息」大面板。拖进化牌、效果文字、锁定牌和行动牌的色块改位置，保存后刷新对局。'
          : '拖单个色块改位置，角点缩放。顶栏三块、钥匙格、警车格都可以单独拖。保存后刷新对局即可看到。';
    }
    render();
  }

  async function loadLayout() {
    const res = await fetch('/api/ui/survivor-layout');
    if (!res.ok) throw new Error('无法读取布局');
    state.layout = await res.json();
    ensureExtras();
    if (state.layout?.skillBoard) {
      for (const box of [...(state.layout.skillBoard.slots3 ?? []), ...(state.layout.skillBoard.slots6 ?? [])]) {
        lockSlotBox(box, 'w');
      }
    }
    state.dirty = false;
    state.selected = null;
    setStatus('已加载布局', 'ok');
    setPanel(state.panel);
  }

  async function saveLayout() {
    const res = await fetch('/api/ui/survivor-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.layout),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '保存失败');
    state.layout = data.layout;
    state.dirty = false;
    setStatus('已写入 content/ui/survivor-layout.json。刷新对局即可看到。', 'ok');
  }

  $('panelSelect').onchange = () => setPanel($('panelSelect').value);
  $('killerSelect').onchange = () => {
    state.killerId = $('killerSelect').value;
    render();
  };
  $('reloadBtn').onclick = async () => {
    if (state.dirty && !confirm('有未保存更改，重新加载将丢弃。继续？')) return;
    try {
      await loadLayout();
    } catch (e) {
      setStatus(e.message, 'err');
    }
  };
  $('saveBtn').onclick = async () => {
    try {
      await saveLayout();
    } catch (e) {
      setStatus(e.message, 'err');
    }
  };
  bgImg.onload = () => render();

  const back = $('backToGame');
  if (back) {
    back.onclick = (ev) => {
      ev.preventDefault();
      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      if (window.history.length > 1) window.history.back();
      else window.location.href = '/';
    };
  }

  const params = new URLSearchParams(location.search);
  const panelParam = params.get('panel');
  if (panelParam && [...$('panelSelect').options].some((o) => o.value === panelParam)) {
    $('panelSelect').value = panelParam;
    state.panel = panelParam;
  }

  loadLayout().catch((e) => setStatus(e.message, 'err'));
})();
