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

  /**
   * 杀手素材表：读 `tools/shared/killer-art.js`（九位全有）。
   * 以前这里手写了 `KILLER_ART` / `lockedArt` / `ruleArt` / `evoCardArt` 四张表，
   * 而且只写到 killer3，切到新杀手时底图全空、信息面板没法编辑。
   */
  const KILLER_TABLE = window.KILLER_ART_TABLE;

  /** 取一位杀手的素材；取不到就给一个空壳，避免整个面板炸掉 */
  function killerArtOf(id) {
    const a = KILLER_TABLE?.get(id);
    if (a) return a;
    return {
      evolution: '', standee: '', back: '', intro: '',
      lockedCards: [], specialRules: [], evolutionCards: [],
    };
  }

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

  const round1 = (n) => ToolUtil.round1(n);

  const clamp = (...a) => ToolUtil.clamp(...a);

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
    /**
     * 锁定牌：共用槽位**只补 1 格**（九个杀手里八个都是 1 张）。
     *
     * ⚠ 未命名那 2 张走的是**专属**的 `lockedByKiller.killer7`
     * （在 `pieces()` 里按需创建），**不在这里扩** ——
     * 以前那版会把这一格补到 2 格，一保存就变成"每个杀手都两张"。
     */
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
    /**
     * 【雕像】4 尊立绘各自一格 + 图层。
     * 老存档里没有这个键 → 补一套默认值（都摆上，等用户自己拖）。
     */
    if (!state.layout.killerDock.statueStandees?.length) {
      state.layout.killerDock.statueStandees = [0, 1, 2, 3].map((i) => ({
        x: 0.6 + i * 3.6,
        y: 6,
        w: 3.4,
        h: 88,
        layer: 0,
      }));
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
    /**
     * `killerInfo` 里每个键都单独兜底。
     * 早先这里只在 `killerInfo` **整个缺失**时才补键 —— 于是「存在但缺
     * `specialRule` / `evolutionCards`」的老存档，编辑器补了一套、
     * 游戏用默认的另一套，两边显示不一致。现在逐键补，存档一保存就补齐。
     */
    if (!state.layout.killerInfo) {
      state.layout.killerInfo = {};
    }
    {
      const I = state.layout.killerInfo;
      if (!I.evolution) I.evolution = { x: 1.6, y: 2, w: 47, h: 55 };
      if (!I.effects) I.effects = { x: 50.2, y: 2, w: 47.4, h: 55 };
      if (!I.locked?.length) {
        I.locked = [
          { x: 1.6, y: 59, w: 8.2, h: 18 },
          { x: 10.6, y: 59, w: 8.2, h: 18 },
        ];
      }
      if (!I.cards?.length) {
        I.cards = Array.from({ length: 12 }, (_, i) => ({
          x: 1.6 + i * 8.2,
          y: 79,
          w: 7.6,
          h: 19,
        }));
      }
      /** 老存档只有单个 specialRule 时，升级成数组 */
      if (!Array.isArray(I.specialRule)) {
        const old = I.specialRule;
        I.specialRule = old
          ? [old, { x: (old.x ?? 50.2) + 15.3, y: old.y ?? 59, w: old.w ?? 13, h: old.h ?? 19 }]
          : [
              { x: 50.2, y: 59, w: 13, h: 19 },
              { x: 65.5, y: 59, w: 13, h: 19 },
            ];
      }
      /** 进化卡牌（未命名 4 张，2x2） */
      if (!I.evolutionCards?.length) {
        I.evolutionCards = [
          { x: 50.2, y: 59, w: 7.0, h: 9 },
          { x: 57.8, y: 59, w: 7.0, h: 9 },
          { x: 50.2, y: 68.6, w: 7.0, h: 9 },
          { x: 57.8, y: 68.6, w: 7.0, h: 9 },
        ];
      }
    }
    // 求生者相关物品：3 行 x 3 个
    if (state.layout.survivorItems?.rows?.length !== 3) {
      state.layout.survivorItems = {
        rows: [0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => ({ x: 4 + c * 18, y: 4 + r * 32, w: 16, h: 28 })),
        ),
      };
    }
    /**
     * 【变体3】计划卡：进度标识的 4 个行位 + 能力标记位。
     *
     * 老存档没有这一栏就补一份默认值（和客户端 `DEFAULT_SURVIVOR_LAYOUT.planCards`
     * 保持一致，否则编辑器调一套、游戏用另一套）。
     */
    if (!state.layout.planCards) {
      state.layout.planCards = {
        lines: [
          { x: 25, y: 11.5, w: 18, h: 11 },
          { x: 25, y: 21.7, w: 18, h: 11 },
          { x: 25, y: 31.9, w: 18, h: 11 },
          { x: 25, y: 42.1, w: 18, h: 11 },
        ],
        abilityMarker: { x: 76, y: 72, w: 14, h: 12 },
      };
    }
    if (!state.layout.planCards.lines?.length) {
      state.layout.planCards.lines = [
        { x: 25, y: 11.5, w: 18, h: 11 },
        { x: 25, y: 21.7, w: 18, h: 11 },
        { x: 25, y: 31.9, w: 18, h: 11 },
        { x: 25, y: 42.1, w: 18, h: 11 },
      ];
    }
    if (!state.layout.planCards.abilityMarker) {
      state.layout.planCards.abilityMarker = { x: 76, y: 72, w: 14, h: 12 };
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
      if (!L.statusBar.poison?.length) {
        L.statusBar.poison = [
          { x: 26, y: 36, w: 7, h: 22, card: 0 },
          { x: 58, y: 36, w: 7, h: 22, card: 1 },
          { x: 90, y: 36, w: 7, h: 22, card: 2 },
        ];
      }
      L.statusBar.poison.forEach((b) => {
        out.push({
          id: `poison-${b.card}`,
          label: `中毒 卡${b.card + 1}`,
          kind: 'poison',
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
      const art = killerArtOf(state.killerId);
      return [
        { id: 'pub-evo', label: '进化牌', kind: 'evolution', box: L.publicStrip.evolution, src: art.evolution },
        { id: 'pub-lv', label: '等级', kind: 'level', box: L.publicStrip.level },
        { id: 'pub-pw', label: '力量', kind: 'power', box: L.publicStrip.power },
      ];
    }
    if (state.panel === 'killer') {
      const art = killerArtOf(state.killerId);
      const D = L.killerDock;
      const out = [];
      /**
       * **立绘**：
       *  - 雕像（killer6）：4 尊**各自一格**（`statueStandees`），
       *    用户要求"雕像的立绘有 4 个，都放上，我来调整图层和位置"；
       *  - 其它杀手：还是单张 `standee`。
       */
      if (state.killerId === 'killer6' && (D.statueStandees ?? []).length) {
        D.statueStandees.forEach((b, i) => {
          out.push({
            id: `k-statue-${i}`,
            label: `雕像立绘 ${i + 1}`,
            kind: 'statue',
            box: b,
            src: art.standees[i] ?? art.standee,
            /** key 用它在数组里的下标，保存时按这个写回 */
            index: i,
          });
        });
      } else {
        out.push({ id: 'k-standee', label: '立绘', kind: 'standee', box: D.standee, src: art.standee });
      }
      out.push(
        { id: 'k-deck', label: '牌堆', kind: 'deck', box: D.deck, src: art.back },
        { id: 'k-discard', label: '弃牌堆', kind: 'discard', box: D.discard, src: art.back },
        { id: 'k-evo', label: '进化牌', kind: 'evolution', box: D.evolution, src: art.evolution },
        { id: 'k-evo-label', label: '进化牌标注', kind: 'label', box: D.evolutionLabel },
      );
      D.hand.forEach((b, i) => {
        out.push({ id: `k-hand-${i}`, label: `手牌 ${i + 1}`, kind: 'hand', box: b, src: art.back });
      });
      const lockedArt = art.lockedCards;
      /**
       * **锁定牌槽位**：
       *  - 有**专属**槽位的杀手（目前只有未命名，2 张）走
       *    `lockedByKiller[杀手id]` —— 用户明确「未命名的第一张锁定牌
       *    不要跟其他杀手的绑定调整」，所以两边是独立的两份；
       *  - 其它杀手继续用共用的 `locked`（1 格），**一点不动**。
       */
      const D2 = state.layout.killerDock;
      if (!D2.lockedByKiller) D2.lockedByKiller = {};
      /** 只给"张数比共用槽位多"的杀手补专属槽位（未命名是唯一一个） */
      if ((lockedArt?.length ?? 0) > (D2.locked?.length ?? 1)) {
        if (!D2.lockedByKiller[state.killerId]?.length) {
          const b = D2.locked?.[0] ?? { x: 54, y: 62, w: 12, h: 34 };
          D2.lockedByKiller[state.killerId] = Array.from(
            { length: lockedArt.length },
            (_, i) => ({
              x: b.x + i * ((b.w ?? 12) + 0.5),
              y: b.y,
              w: b.w ?? 12,
              h: b.h ?? 34,
            }),
          );
        }
      }
      const ownBoxes = D2.lockedByKiller[state.killerId];
      /**
       * ⚠ **画几格 = 这名杀手实际有几张锁定牌**（按素材张数），
       * 而不是按数组长度 —— 存档里万一多留了格子（以前那版会补到 2 格），
       * 也不会给只有 1 张锁定牌的杀手多画一格。
       */
      const lockBoxes = (ownBoxes?.length ? ownBoxes : (D2.locked ?? [])).slice(
        0,
        lockedArt?.length ?? 0,
      );
      lockBoxes.forEach((b, i) => {
        out.push({
          id: `k-lock-${i}`,
          label: `锁定牌 ${i + 1}`,
          kind: 'locked',
          box: b,
          src: lockedArt[i] ?? lockedArt[lockedArt.length - 1],
        });
      });
      return out;
    }
    if (state.panel === 'killerInfo') {
      /**
       * 素材全部来自 `KILLER_TABLE`（九位杀手）。
       * 锁定牌 / 特殊规则 / 进化卡牌各按**实际张数**取图：
       * 没图的杀手就是没有（不硬凑一张不存在的图）。
       */
      const art = killerArtOf(state.killerId);
      const I = L.killerInfo;
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
          src: art.lockedCards[i] ?? art.lockedCards[art.lockedCards.length - 1],
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
      // 特殊规则卡（女猎手/狼人/雕像/扼杀者 1 张；女王 2 张；屠夫/幽魂/谋杀者/未命名 没有）
      (I.specialRule ?? []).forEach((b, i) => {
        out.push({
          id: `ki-rule-${i}`,
          label: `特殊规则 ${i + 1}`,
          kind: 'locked',
          box: b,
          src: art.specialRules[i] ?? art.specialRules[art.specialRules.length - 1],
        });
      });
      // 进化卡牌（只有未命名有 4 张）
      (I.evolutionCards ?? []).forEach((b, i) => {
        out.push({
          id: `ki-evocard-${i}`,
          label: `进化卡牌 ${i + 1}`,
          kind: 'locked',
          box: b,
          src: art.evolutionCards[i] ?? art.evolutionCards[art.evolutionCards.length - 1],
        });
      });
      return out;
    }
    if (state.panel === 'survivorItems') {
      const S = L.survivorItems ?? { rows: [] };
      const out = [];
      (S.rows ?? []).forEach((row, ri) => {
        (row ?? []).forEach((b, ci) => {
          out.push({
            id: `si-${ri}-${ci}`,
            label: `第 ${ri + 1} 行 物品 ${ci + 1}`,
            kind: 'hand',
            box: b,
            src: '/Image/UI/索菲亚的相机.png',
          });
        });
      });
      return out;
    }
    if (state.panel === 'planCards') {
      /**
       * 【变体3】计划卡：4 个进度行位 + 能力标记位。
       *
       * 背景用一张 **4 条进度**的卡（萬能鑰匙）作图 —— 4 个行位都能看到；
       * 各卡的行距是一致的（750×1039 的卡面，每行约 10.2%）。
       */
      const P = L.planCards;
      const MARK = '/Image/UI/计划进度标识.png';
      const out = (P.lines ?? []).map((b, i) => ({
        id: `plan-line-${i}`,
        label: `进度第 ${i + 1} 行`,
        kind: 'hand',
        box: b,
        src: MARK,
      }));
      out.push({
        id: 'plan-ability',
        label: '能力标记（完成后，有框的才用 · 顺时针 90°）',
        kind: 'hand',
        box: P.abilityMarker,
        src: MARK,
        /**
         * ⚠ **游戏里这个标记是顺时针转 90° 画的**（`GameViews.tsx` 里
         * `transform: 'rotate(90deg)'`）—— 校准预览必须跟着转，
         * 不然这里看着是横的、进游戏却是竖的，怎么调都对不上。
         *
         * 只转**图案**，不转外框：外框（虚线框/四个角的手柄）保持轴对齐，
         * 才方便拖动改位置和大小。
         */
        rotate: 90,
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
        /**
         * ⚠ `rotate`（度数，正 = 顺时针）：**只转图案**，外框和手柄不转 ——
         * 校准的时候要拖的是外框，转了会跟着歪。
         */
        const rot = Number.isFinite(p.rotate) ? `transform:rotate(${p.rotate}deg);` : '';
        const fill = p.src
          ? `<img class="piece-art" src="${encodeURI(p.src)}" alt="" style="${rot}" />`
          : '';
        /**
         * 【图层】`layer` 直接当 `z-index`（雕像 4 尊摆一起时要能调谁盖谁）。
         * 没写 layer 的物件按它在列表里的顺序由 CSS 自然叠放。
         */
        const z = Number.isFinite(p.box.layer) ? `z-index:${p.box.layer};` : '';
        return `<div class="piece ${p.kind}${on ? ' sel' : ''}" data-id="${p.id}" style="left:${p.box.x}%;top:${p.box.y}%;width:${p.box.w}%;height:${p.box.h}%;${z}">${fill}<span>${p.label}</span>${
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
        ${
          /** 只有带图层的物件（雕像立绘 / 未命名进化牌）才有这一格 */
          Number.isFinite(sel.box.layer)
            ? `<label>图层</label><input type="number" step="1" data-k="layer" value="${sel.box.layer}" title="数字越大越靠上（谁盖谁）" />`
            : ''
        }
      </div>${sel.kind === 'slot' ? '<p class="muted">一格一格拖动。四角缩放时保持搜索卡 531×803 比例。</p>' : ''}${
        Number.isFinite(sel.box.layer)
          ? '<p class="muted">「图层」= 谁盖谁：数字大的画在上面。4 尊雕像叠在一起时用它排序。</p>'
          : ''
      }`;
    inspector.querySelectorAll('input[data-k]').forEach((el) => {
      el.onchange = () => {
        const k = el.getAttribute('data-k');
        const v = Number(el.value);
        if (!Number.isFinite(v)) return;
        sel.box[k] = k === 'layer' ? Math.round(v) : round1(v);
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
    const blank =
      panel === 'public' ||
      panel === 'killer' ||
      panel === 'hud' ||
      panel === 'killerInfo' ||
      panel === 'survivorItems' ||
      /** 【变体3】计划卡：背景是"卡面 + 标识"，用一张 4 行卡作图 */
      panel === 'planCards';
    bgImg.hidden = blank;
    blankBg.hidden = !blank;
    blankBg.className = `blank-bg ${panel}`;
    if (!blank) bgImg.src = encodeURI(BGS[panel] || BGS.status);
    if (panel === 'planCards') {
      /**
       * 计划卡面板的底图：一张 **4 条进度**的卡面（萬能鑰匙）——
       * 4 个行位都能看到，各卡行距一致，照着调就行。
       */
      blankBg.style.backgroundImage = `url("${encodeURI('/Image/Plan/万能钥匙.png')}")`;
    } else {
      blankBg.style.backgroundImage = '';
    }
    const hint = $('hint');
    if (hint) {
      hint.textContent =
        panel === 'killerInfo'
          ? '这是「查看杀手信息」大面板。拖进化牌、效果文字、锁定牌、行动牌、特殊规则、进化卡牌的色块改位置。切「预览杀手」可看不同杀手的特殊规则/进化卡牌。'
          : panel === 'survivorItems'
            ? '这是「求生者相关物品」弹窗。每行对应一名幸存者（从上往下 3 行），拖色块改专属物品的位置。'
            : panel === 'planCards'
              ? '【变体3】计划卡：底图是一张 4 条进度的卡面。拖 4 个「进度第 N 行」色块，把标记摆到那一行的位置上（各卡行距一致）；「能力标记」是整张计划完成后、能力右侧有框时那个转 90° 的标记位。'
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
