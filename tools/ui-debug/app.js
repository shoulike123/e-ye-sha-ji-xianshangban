(() => {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const state = {
    maps: [],
    map: null,
    mapId: q.get('map') || 'mansion',
    side: q.get('side') === 'killer' ? 'killer' : 'survivor',
    youRoom: null,
    panel: null,
    openCard: null,
    keys: 2,
    repair: 1,
  };

  const SURVIVORS = [
    {
      id: 'a',
      name: '安娜·库布里克',
      role: '学生',
      fear: 0,
      room: 'R1',
      src: '/Image/Survivors/幸存者一_安娜_学生/状态_健康.png',
      pack: '手电筒',
    },
    {
      id: 'j',
      name: '约翰逊·尼斯佩尔',
      role: '工程师',
      fear: 1,
      room: 'B2',
      src: '/Image/Survivors/幸存者二_约翰逊_工程师/状态_健康.png',
      pack: '工具箱',
    },
    {
      id: 'w',
      name: '威廉·霍伯',
      role: '运动员',
      fear: 0,
      room: 'R3',
      src: '/Image/Survivors/幸存者五_威廉_运动员/状态_健康.png',
      pack: '短剑',
    },
  ];

  function neighbors(roomId) {
    const out = [];
    for (const e of state.map.edges || []) {
      if (e.pathType === 'killer' && state.side !== 'killer') continue;
      if (e.from === roomId) out.push(e.to);
      else if ((e.bidirectional ?? true) && e.to === roomId) out.push(e.from);
    }
    return out;
  }

  function roomName(id) {
    const r = state.map.rooms.find((x) => x.id === id);
    if (!r) return id;
    return state.side === 'killer' && r.nameKiller ? r.nameKiller : r.name;
  }

  function renderMap() {
    const map = state.map;
    const overlay = $('overlay');
    overlay.setAttribute('viewBox', `0 0 ${map.width} ${map.height}`);
    const legal = new Set(neighbors(state.youRoom));
    const parts = [];
    for (const e of map.edges || []) {
      const a = map.rooms.find((r) => r.id === e.from);
      const b = map.rooms.find((r) => r.id === e.to);
      if (!a || !b) continue;
      if (e.pathType === 'killer' && state.side !== 'killer') continue;
      parts.push(
        `<line class="edge-line ${e.pathType || 'door'}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`,
      );
    }
    for (const r of map.rooms) {
      const cls = r.id === state.youRoom ? 'here' : legal.has(r.id) ? 'legal' : '';
      parts.push(
        `<circle class="room-node ${cls}" data-id="${r.id}" cx="${r.x}" cy="${r.y}" r="16" />`,
        `<text class="room-id" x="${r.x}" y="${r.y + 4}" text-anchor="middle">${r.id}</text>`,
      );
    }
    for (const t of map.tokens || []) {
      const s = t.side || 'both';
      if (s !== 'both' && s !== state.side) continue;
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      parts.push(
        `<g transform="translate(${cx} ${cy}) rotate(${t.rotation || 0}) translate(${-t.w / 2} ${-t.h / 2})">`,
        `<image href="${encodeURI(t.src)}" width="${t.w}" height="${t.h}" />`,
        `</g>`,
      );
    }
    overlay.innerHTML = parts.join('');
    overlay.querySelectorAll('.room-node.legal').forEach((el) => {
      el.addEventListener('click', () => {
        state.youRoom = el.getAttribute('data-id');
        renderMap();
        renderDock();
      });
    });
  }

  function renderChips() {
    const fear = SURVIVORS.reduce((n, p) => n + p.fear, 0);
    const chips = [
      { id: 'keys', icon: '/Image/Key/01_钥匙.png', label: `钥匙 <strong>${state.keys}/5</strong>` },
      state.side === 'survivor'
        ? { id: 'repair', icon: '/Image/UI/修理.png', label: `修理 <strong>${state.repair}/5</strong>` }
        : null,
      { id: 'fear', icon: '/Image/UI/恐惧.png', label: `恐惧 <strong>${fear}</strong>` },
    ].filter(Boolean);
    $('chips').innerHTML = chips
      .map(
        (c) =>
          `<button type="button" class="track-chip${state.panel === c.id ? ' on' : ''}" data-id="${c.id}">
            <img src="${encodeURI(c.icon)}" alt="" />
            <span>${c.label}</span>
          </button>`,
      )
      .join('');
    $('chips').querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        state.panel = state.panel === id ? null : id;
        renderPanel();
        renderChips();
      };
    });
  }

  function renderPanel() {
    const box = $('overlayPanel');
    if (!state.panel) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    const title = state.panel === 'keys' ? '钥匙架' : state.panel === 'repair' ? '修理进度' : '恐惧标记';
    let body = '';
    if (state.panel === 'keys') {
      body = `<div class="key-slots">${Array.from({ length: 5 }, (_, i) =>
        i < state.keys
          ? `<div class="key-slot"><img src="/Image/Key/01_钥匙.png" alt="" /></div>`
          : `<div class="key-slot"></div>`,
      ).join('')}</div>`;
    } else if (state.panel === 'repair') {
      body = `<div class="repair-pips">${Array.from({ length: 5 }, (_, i) =>
        `<img class="repair-pip${i < state.repair ? ' on' : ''}" src="/Image/UI/修理.png" alt="" />`,
      ).join('')}</div>`;
    } else {
      body = SURVIVORS.map(
        (p) =>
          `<div class="fear-row"><span>${p.name}</span><span>恐惧 ${p.fear}</span></div>`,
      ).join('');
    }
    box.innerHTML = `<div class="hud-overlay-card">
      <div class="hud-overlay-head"><h3>${title}</h3><button type="button" id="closePanel">关闭</button></div>
      ${body}
    </div>`;
    box.onclick = (e) => {
      if (e.target === box) {
        state.panel = null;
        renderPanel();
        renderChips();
      }
    };
    $('closePanel').onclick = () => {
      state.panel = null;
      renderPanel();
      renderChips();
    };
  }

  function renderActions() {
    const el = $('actions');
    if (state.side === 'killer') {
      el.innerHTML = `<h3>行动 · 杀手快速阶段（调试假数据）</h3>
        <div class="row">
          <button type="button">追逐</button>
          <button type="button">感知</button>
          <button type="button" class="primary">结束快速阶段</button>
        </div>`;
      $('phaseLabel').textContent = '杀手行动';
      $('powerLabel').textContent = state.mapId === 'cabin' ? '2' : '5';
    } else {
      el.innerHTML = `<h3>行动 · 求生者（调试假数据）</h3>
        <p class="muted">点地图高亮格移动。当前位置：${roomName(state.youRoom)}</p>
        <div class="row">
          <button type="button">搜索</button>
          <button type="button">修理</button>
          <button type="button">消除恐惧</button>
        </div>`;
      $('phaseLabel').textContent = '幸存者行动';
    }
  }

  function renderDock() {
    $('dock').innerHTML = SURVIVORS.map((p, i) => {
      const mine = state.side === 'survivor' && i === 0;
      const open = state.openCard === p.id;
      const room = i === 0 ? state.youRoom : p.room;
      return `<div class="surv-card${mine ? ' mine' : ''}">
        <button type="button" class="surv-face" data-id="${p.id}">
          <img src="${encodeURI(p.src)}" alt="${p.name}" />
          <div class="surv-meta">
            <span class="surv-name">${p.name}</span>
            <span class="surv-vitals">健康 · 恐惧 ${p.fear} · ${roomName(room)}</span>
          </div>
        </button>
        ${open ? `<div class="surv-pack">装备栏 · ${p.pack}</div>` : ''}
      </div>`;
    }).join('');
    $('dock').querySelectorAll('.surv-face').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        state.openCard = state.openCard === id ? null : id;
        renderDock();
      };
    });
  }

  function applySide() {
    const bg =
      state.side === 'killer' ? state.map.backgrounds?.killer : state.map.backgrounds?.survivor;
    $('mapImg').src = encodeURI(bg || '');
    document.title = `${state.map.name} · ${state.side === 'killer' ? '杀手' : '求生者'}界面调试`;
    $('sideSelect').value = state.side;
    $('mapSelect').value = state.mapId;
    const start = state.side === 'killer' ? state.map.killerStartRoomId : state.map.survivorStartRoomId;
    state.youRoom = start;
    renderChips();
    renderActions();
    renderDock();
    renderMap();
  }

  $('overlay').addEventListener('click', (e) => {
    const id = e.target.getAttribute?.('data-id');
    if (!id) return;
  });

  $('sideSelect').onchange = () => {
    state.side = $('sideSelect').value;
    const url = new URL(location.href);
    url.searchParams.set('side', state.side);
    history.replaceState(null, '', url);
    applySide();
  };

  $('mapSelect').onchange = async () => {
    state.mapId = $('mapSelect').value;
    const url = new URL(location.href);
    url.searchParams.set('map', state.mapId);
    history.replaceState(null, '', url);
    await loadMap(state.mapId);
  };

  async function loadMap(id) {
    const res = await fetch('/api/maps/' + id);
    if (!res.ok) throw new Error('无法读取地图');
    state.map = await res.json();
    state.mapId = id;
    applySide();
  }

  async function boot() {
    try {
      const res = await fetch('/api/maps');
      state.maps = await res.json();
      $('mapSelect').innerHTML = state.maps
        .map((m) => `<option value="${m.id}">${m.name}</option>`)
        .join('');
      await loadMap(state.mapId);
    } catch (e) {
      $('actions').innerHTML = `<p>无法连接服务端：${e.message}。请先启动游戏。</p>`;
    }
  }

  boot();
})();
