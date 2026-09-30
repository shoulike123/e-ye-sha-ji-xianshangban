/**
 * 【墓穴】的**界面渲染**验证（服务端渲染 Board 到 HTML 再断言）。
 *
 * 覆盖：
 *  - 坍塌板块：塌了才画，位置/尺寸/旋转来自 `map.collapsedMarks`
 *  - 门消失：塌掉的地点连出去的门不再渲染
 *  - 遗物标记：正面朝上 / 翻面的图不同；杀手地图不显示
 *  - 遗物牌堆：右上角的界面区 + 牌背
 *  - 坍塌收尾面板：轮到你时给可选目的地，轮到别人时只说"在等谁"
 *
 * 跑法：`npm run test:cryptui`（依赖 build-menu.mjs 先编译 Board / GameViews）
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { loadContent } = await import('../../server/dist/content/loader.js');
const {
  createLobby, createPlayer, startGame, buildSnapshot,
} = await import('../../server/dist/game/engine.js');
const { Board } = await import('../../client/_ssrbuild/Board.js');
const { collapseMovePanelFor } = await import('../../client/_ssrbuild/GameViews.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 一局墓穴 1对1（界面测试不用多人） */
function mkCrypt() {
  const st = createLobby('T', 'h', 'H', content, 'crypt');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players['h'], s: bs };
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer1';
  st.players['h'].ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  return st;
}

/** 渲染 Board（指定视角） */
function renderBoard(st, viewer) {
  const snap = buildSnapshot(st, viewer);
  return renderToStaticMarkup(
    React.createElement(Board, {
      map: snap.map,
      players: snap.players,
      youId: viewer === 'h' ? st.killerId : viewer,
      viewerFaction: viewer === 'h' ? 'killer' : 'survivor',
      legalMoves: [],
      noises: [],
      blockades: snap.blockades ?? [],
      onRoomClick: () => {},
      collapsedRooms: snap.collapsedRooms ?? [],
      relicMarkerFaceUp: snap.relicMarkerFaceUp !== false,
      /** 牌堆张数：遗物牌堆要按它决定画不画牌背 */
      pileCounts: {
        search: snap.pileCounts?.search ?? 0,
        discovery: snap.pileCounts?.discovery ?? 0,
        treasure: snap.pileCounts?.treasure ?? 0,
        relic: snap.pileCounts?.relic ?? 0,
        discard: snap.pileCounts?.discard ?? 0,
      },
      cardById: snap.cardById ?? {},
    }),
  );
}

const PLATE_SRC = encodeURI('/Image/UI/坍塌板块.png');
const RELIC_FRONT = encodeURI('/Image/UI/遗物_正面.png');
const RELIC_BACK = encodeURI('/Image/UI/遗物_背面.png');

console.log('=== ① 坍塌板块：塌了才画 ===');
{
  const st = mkCrypt();
  const before = renderBoard(st, 's');
  ok(!before.includes(PLATE_SRC), '还没塌时地图上没有坍塌板块');

  /** 直接标记 R4 塌了（不走升级，专测渲染） */
  st.collapsedRooms = ['R4'];
  const after = renderBoard(st, 's');
  ok(after.includes(PLATE_SRC), '塌了之后画上了坍塌板块');
  /** 位置/尺寸/旋转要和地图配置一致 */
  const mark = st.map.collapsedMarks.find((m) => m.roomId === 'R4');
  ok(Boolean(mark), 'R4 在 collapsedMarks 里有配置');
  ok(
    after.includes(`rotate(${mark.rotation ?? 90})`),
    '板块按配置的角度旋转',
    String(mark.rotation ?? 90),
  );
  ok(after.includes(`width="${mark.w}"`), '板块宽度取配置值', String(mark.w));
  ok(after.includes(`height="${mark.h}"`), '板块高度取配置值', String(mark.h));

  /** 只塌了一个：别的板块不该出现 */
  const others = st.map.collapsedMarks.filter((m) => m.roomId !== 'R4');
  const othersDrawn = others.filter((m) => after.includes(`collapse-${m.roomId}`));
  ok(othersDrawn.length === 0, '没塌的地点不画板块', othersDrawn.map((m) => m.roomId).join(','));

  /** 塌掉的地点连出去的门不再渲染 */
  const hasEdgeToR4 = after.includes('R2|R4') || after.includes('R4|R2');
  ok(!hasEdgeToR4, '与 R4 相连的门不再渲染');
}

console.log('=== ② 遗物标记正反面 ===');
{
  const st = mkCrypt();
  const front = renderBoard(st, 's');
  ok(front.includes(RELIC_FRONT), '正面朝上时画的是正面图');
  ok(!front.includes(RELIC_BACK), '正面朝上时不画背面图');

  st.relicMarkerFaceUp = false;
  const back = renderBoard(st, 's');
  ok(back.includes(RELIC_BACK), '翻面后画的是背面图');
  ok(!back.includes(RELIC_FRONT), '翻面后不画正面图');

  /** 杀手地图上没有遗物室标记（那是幸存者地图上的东西） */
  const killerView = renderBoard(st, 'h');
  ok(!killerView.includes(RELIC_FRONT) && !killerView.includes(RELIC_BACK), '杀手地图不显示遗物标记');

  /** 遗物室塌了标记也没了 */
  st.collapsedRooms = ['R6'];
  const gone = renderBoard(st, 's');
  ok(!gone.includes(RELIC_BACK) && !gone.includes(RELIC_FRONT), 'R6 塌了遗物标记消失');
}

console.log('=== ③ 遗物牌堆的界面区 ===');
{
  const st = mkCrypt();
  /** 开局就有 5 张遗物牌，所以地图上应该已经画出牌背 */
  ok(st.relicDeck.length === 5, '开局遗物牌堆有 5 张', `${st.relicDeck.length}`);
  const html = renderBoard(st, 's');
  ok(html.includes(encodeURI('/Image/Relic/牌背.png')), '有牌时画出遗物牌背');
  /** 牌堆空的时候不画牌背（和搜索/宝藏牌堆一致） */
  st.relicDeck = [];
  const empty = renderBoard(st, 's');
  ok(!empty.includes(encodeURI('/Image/Relic/牌背.png')), '牌堆为空时不画牌背');
  /** 界面区位置由地图 zones 里的 relic 决定 */
  ok(
    (st.map.zones ?? []).some((z) => z.id === 'relic'),
    '地图数据里有 relic 的界面区',
  );
}

console.log('=== ④ 坍塌收尾面板（纯函数 + 文本） ===');
{
  const st = mkCrypt();
  const snapBase = buildSnapshot(st, 's');
  const name = (rid) => st.map.rooms.find((r) => r.id === rid)?.name ?? rid;

  ok(collapseMovePanelFor({ ...snapBase, pendingCollapseMoves: null }, name) === null, '没有坍塌时返回 null');

  /** 轮到自己：给出可选目的地 */
  const mine = collapseMovePanelFor(
    {
      map: st.map,
      pendingCollapseMoves: {
        roomId: 'R4',
        currentId: 's',
        name: 'S',
        options: ['R2', 'R3'],
        mustMove: true,
        waiting: false,
      },
    },
    name,
  );
  ok(mine !== null, '轮到自己时有面板');
  ok(mine.roomLabel === name('R4'), '面板写的是塌掉的地点名', mine.roomLabel);
  ok(mine.waiting === false, '不是"等待"状态');
  ok(mine.options.length === 2, '列出 2 个可选目的地', JSON.stringify(mine.options));
  ok(mine.options[0].label === name('R2'), '目的地显示房间名而不是 id', mine.options[0].label);

  /** 轮到别人：只说在等谁，不给选项 */
  const others = collapseMovePanelFor(
    {
      map: st.map,
      pendingCollapseMoves: {
        roomId: 'R4',
        currentId: null,
        name: 'H',
        options: [],
        mustMove: false,
        waiting: true,
      },
    },
    name,
  );
  ok(others.waiting === true, '别人视角是"等待"状态');
  ok(others.options.length === 0, '等待时不泄露目的地');
  ok(others.name === 'H', '等待时说出在等谁', others.name);

  /** 轮到杀手：面板要提示弃光手牌 */
  const killerPanel = collapseMovePanelFor(
    {
      map: st.map,
      pendingCollapseMoves: {
        roomId: 'R4',
        currentId: 'h',
        name: 'H',
        options: ['R2'],
        mustMove: true,
        waiting: false,
        isKiller: true,
      },
    },
    name,
  );
  ok(killerPanel.isKiller === true, '轮到杀手时 isKiller = true（面板会提示弃光手牌）');
}

console.log('=== ⑤ 5 张遗物牌的牌面图 ===');
{
  const { cardArtSrc, itemArtSrc } = await import('../../client/_ssrbuild/cardArt.js');
  const want = {
    relic_key: '/Image/Relic/01_鑰匙.png',
    relic_mirror: '/Image/Relic/02_鏡之門戶.png',
    relic_shield: '/Image/Relic/03_剛毅之盾.png',
    relic_guard: '/Image/Relic/04_守護之石.png',
    relic_insight: '/Image/Relic/05_洞察之球.png',
  };
  const content = loadContent();
  const byId = Object.fromEntries(content.cards.relic.map((c) => [c.id, c]));
  for (const [id, src] of Object.entries(want)) {
    /** 抽遗物时（卡牌视角） */
    ok(cardArtSrc(byId[id], id) === src, `${byId[id]?.name ?? id} 的牌面图正确（卡牌）`, String(cardArtSrc(byId[id], id)));
    /** 拿到手之后（**物品**视角，走装备卡那一排） */
    ok(itemArtSrc(id) === src, `${byId[id]?.name ?? id} 的牌面图正确（物品）`, String(itemArtSrc(id)));
  }
  ok(
    content.cards.relic.every((c) => Boolean(itemArtSrc(c.id))),
    '遗物作为物品时每张都能找到图',
    content.cards.relic.map((c) => c.id).join(','),
  );
}

console.log('=== ⑥ 乔治「聪明绝顶」只在书本地点显示 ===');
{
  const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
  const st = mkCrypt();
  /** 把唯一的幸存者换成乔治（多人模式里幸存者是 `s__surv1` 这样的棋子） */
  const geo = Object.values(st.players).find((p) => p.faction === 'survivor');
  geo.characterId = 'survivor6';
  st.pendingEvolutionAck = null;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = st.turnOrder.indexOf(geo.id);
  geo.mainActionUsed = false;
  geo.actedThisRound = false;
  /** `buildSnapshot` 收的是**操控者 id**，不是棋子 id */
  const ctrl = geo.controllerId;

  /** 墓穴的书本地点是 B4 澡堂；G1 不是 */
  const bookRoom = st.map.rooms.find((r) => (r.tags ?? []).includes('special-book'));
  console.log(`   书本地点：${bookRoom?.id} ${bookRoom?.name}`);
  ok(Boolean(bookRoom), '墓穴有书本标记地点', bookRoom?.id);

  const render = (roomId) => {
    geo.roomId = roomId;
    const snap = buildSnapshot(st, ctrl);
    return renderToStaticMarkup(
      React.createElement(GameView, { state: snap, onAction: () => {}, onLeave: () => {} }),
    );
  };

  const atBook = render(bookRoom.id);
  ok(atBook.includes('聪明绝顶'), '在书本地点时显示「聪明绝顶」的选项');
  ok(atBook.includes('抽一张搜索牌'), '在书本地点时能看到两个按钮');

  const notAtBook = render('G1');
  ok(!notAtBook.includes('聪明绝顶'), '不在书本地点时**整块都不显示**（不是灰按钮）');
  ok(!notAtBook.includes('抽一张搜索牌'), '不在书本地点时连按钮文字都没有');
}

console.log('=== ⑥ 翻面标记：遗物标记 + 手提箱（同一套机制）===');
{
  const RELIC_FRONT_S = encodeURI('/Image/UI/遗物_正面.png');
  const RELIC_BACK_S = encodeURI('/Image/UI/遗物_背面.png');
  const CASE_FRONT_S = encodeURI('/Image/UI/手提箱.jpg');
  const CASE_BACK_S = encodeURI('/Image/UI/手提箱已用.jpg');

  /** ① 墓穴遗物标记 */
  const st = mkCrypt();
  const front = renderBoard(st, 's');
  ok(front.includes(RELIC_FRONT_S), '遗物标记正面：画的是正面图');
  ok(!front.includes(RELIC_BACK_S), '遗物标记正面：不画背面图');
  st.relicMarkerFaceUp = false;
  const back = renderBoard(st, 's');
  ok(back.includes(RELIC_BACK_S), '遗物标记翻面：画的是背面图');
  ok(!back.includes(RELIC_FRONT_S), '遗物标记翻面：不画正面图');

  /** ② 小屋手提箱 —— 和遗物标记用同一个 `flipTokenImage` */
  const cabin = (() => {
    const c = createLobby('C', 'h', 'H', content, 'cabin');
    c.mode = 'duo';
    const bs = createPlayer('s', 'S', 's');
    bs.faction = 'survivor';
    bs.ready = true;
    c.players = { h: c.players['h'], s: bs };
    c.players['h'].faction = 'killer';
    c.players['h'].characterId = 'killer1';
    c.players['h'].ready = true;
    c.hostId = 'h';
    c.soloSurvivorCharacterIds = survCharIds.slice(0, c.rules.maxSurvivors);
    startGame(c, content, 'h');
    c.pendingEvolutionAck = null;
    return c;
  })();
  /** 手提箱现在应该是**一个**翻面 token */
  const caseTokens = (cabin.map.tokens ?? []).filter(
    (t) => t.kind === 'suitcase' || t.kind === '手提箱' || /suitcase|手提/i.test(t.id),
  );
  ok(caseTokens.length === 1, '小屋的手提箱只有 1 个 token（不再是"可用/已用"两个）', `${caseTokens.length}`);
  ok(Boolean(caseTokens[0]?.srcBack), '手提箱配了背面图（可翻面）', String(caseTokens[0]?.srcBack));

  const renderCabin = (available) => {
    const snap = buildSnapshot(cabin, 's');
    return renderToStaticMarkup(
      React.createElement(Board, {
        map: snap.map,
        players: snap.players,
        youId: 's',
        viewerFaction: 'survivor',
        legalMoves: [],
        noises: [],
        blockades: snap.blockades ?? [],
        onRoomClick: () => {},
        suitcaseAvailable: available,
      }),
    );
  };
  const caseOpen = renderCabin(true);
  ok(caseOpen.includes(CASE_FRONT_S), '手提箱可用：画的是未开那张');
  ok(!caseOpen.includes(CASE_BACK_S), '手提箱可用：不画已用那张');
  const caseUsed = renderCabin(false);
  ok(caseUsed.includes(CASE_BACK_S), '手提箱已用（翻面）：画的是已用那张');
  ok(!caseUsed.includes(CASE_FRONT_S), '手提箱已用（翻面）：不画未开那张');
}

console.log(`\n墓穴界面：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
