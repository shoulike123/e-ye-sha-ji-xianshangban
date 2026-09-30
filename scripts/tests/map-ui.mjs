/**
 * 地图特殊规则的**界面渲染**验证（服务端渲染 Board 到 HTML 再断言）。
 *
 * 覆盖：
 *  - 【城堡】机关大门画在门上（用的是 `机关大门.png`，不是封堵那张图）
 *  - 【实验室】急救箱画在 G3；用掉之后图标消失
 *  - 两者互不影响：别的图/没有标记时都不该出现
 *
 * 跑法：`npm run test:mapui`（依赖 build-menu.mjs 先编译 Board）
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { loadContent } = await import('../../server/dist/content/loader.js');
const { createLobby, createPlayer, startGame, buildSnapshot } = await import('../../server/dist/game/engine.js');
const { Board } = await import('../../client/_ssrbuild/Board.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function mk(mapId, killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players['h'], s: bs };
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = killerId;
  st.players['h'].ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  return st;
}

/** 渲染 Board（双方视角各来一次），返回 html */
function render(st, viewer) {
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
      leverGateDoorId: snap.leverGateDoorId ?? null,
      firstAidKit: snap.firstAidKit === true,
      firstAidRoomId: snap.firstAidRoomId ?? null,
    }),
  );
}

/** URL 编码后的图片路径，用来在 HTML 里找 */
const GATE_SRC = encodeURI('/Image/UI/机关大门.png');
const BLOCK_SRC = encodeURI('/Image/UI/封堵.png');
const AID_SRC = encodeURI('/Image/UI/急救箱.png');

console.log('=== ① 城堡：机关大门画在门上 ===');
{
  const st = mk('castle');
  const { placeLeverGate } = await import('../../server/dist/game/mapEffects.js');
  /** 先把大门放上（城堡里真实存在的一扇门：R5–G4） */
  placeLeverGate(st, 'R5', 'G4');
  const gate = st.leverGateDoorId;
  console.log(`   大门门号 = ${gate}`);
  ok(Boolean(gate), '大门已放置');

  for (const viewer of ['h', 's']) {
    const html = render(st, viewer);
    const n = (html.match(new RegExp(GATE_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
    console.log(`   ${viewer === 'h' ? '杀手' : '幸存者'}视角：机关大门图标出现 ${n} 次`);
    ok(n >= 1, `${viewer === 'h' ? '杀手' : '幸存者'}视角能看到机关大门`);
  }
  /** 没放门时不该出现 */
  const st2 = mk('castle');
  const html2 = render(st2, 's');
  ok(!html2.includes(GATE_SRC), '没放门时 HTML 里没有机关大门图标');
}

console.log('=== ② 机关大门和封堵用的是不同的图 ===');
{
  const st = mk('castle');
  const { placeLeverGate } = await import('../../server/dist/game/mapEffects.js');
  placeLeverGate(st, 'R5', 'G4');
  /** 同时在那扇门上加一个封堵，看两张图各画各的 */
  st.blockades = [st.leverGateDoorId];
  const html = render(st, 's');
  console.log(`   同时有大门+封堵：大门图 ${html.includes(GATE_SRC)}，封堵图 ${html.includes(BLOCK_SRC)}`);
  ok(html.includes(GATE_SRC), '大门图标在');
  ok(html.includes(BLOCK_SRC), '封堵图标也在（两者不互相顶掉）');
  ok(GATE_SRC !== BLOCK_SRC, '两张图路径不同（形状不一样，不会认错）');
}

console.log('=== ③ 实验室：急救箱画在 G3（只有幸存者看得到），用掉后消失 ===');
{
  const st = mk('laboratory');
  /**
   * ⚠ `firstAidRoomId` 只存在于**快照**里（服务端算出来给客户端的），
   * `state` 上只有 `firstAidKit` 这个开关 —— 别直接读 `st.firstAidRoomId`。
   */
  const snap0 = buildSnapshot(st, 's');
  console.log(`   开局 state.firstAidKit=${st.firstAidKit} 快照.firstAidRoomId=${snap0.firstAidRoomId}`);
  ok(st.firstAidKit === true, '开局有急救箱');
  ok(snap0.firstAidRoomId === 'G3', '急救箱在 G3', String(snap0.firstAidRoomId));

  /**
   * 急救箱是 `map.tokens` 里的道具，数据里写的是 `side: 'survivor'`
   * —— 所以**只有幸存者的地图上画**（用户要求），杀手看不到。
   */
  const htmlS = render(st, 's');
  const n = (htmlS.match(new RegExp(AID_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
  console.log(`   幸存者视角：急救箱图标出现 ${n} 次`);
  ok(n >= 1, '幸存者视角能看到急救箱');
  const htmlK = render(st, 'h');
  ok(!htmlK.includes(AID_SRC), '**杀手视角看不到急救箱**');

  /** 用掉之后图标要消失 */
  st.firstAidKit = false;
  const after = render(st, 's');
  ok(!after.includes(AID_SRC), '用掉后 HTML 里不再有急救箱图标');
}

console.log('=== ④ 别的图不该出现这两个图标 ===');
{
  for (const mapId of ['mansion', 'cabin', 'laboratory']) {
    const st = mk(mapId);
    const html = render(st, 's');
    ok(!html.includes(GATE_SRC), `${mapId}：没有机关大门图标（城堡专属）`);
  }
  for (const mapId of ['mansion', 'cabin', 'castle']) {
    const st = mk(mapId);
    const html = render(st, 's');
    ok(!html.includes(AID_SRC), `${mapId}：没有急救箱图标（实验室专属）`);
  }
}

console.log('=== ⑤ 实验室开局那个预置封堵画出来了 ===');
{
  const st = mk('laboratory');
  console.log(`   blockades = ${JSON.stringify(st.blockades)}`);
  ok(st.blockades.length === 1, '有一个预置封堵');
  const html = render(st, 's');
  ok(html.includes(BLOCK_SRC), '封堵图标出现在地图上');
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
