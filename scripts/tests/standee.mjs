/**
 * 常驻回归测试：**杀手地图上的幸存者立绘**。
 *
 * 规则（引擎侧）：`rules.killerSeesSurvivorPositions = false` ——
 * 服务端**不告诉**杀手幸存者的真实位置，杀手靠"记忆"：
 *  - 手动摆放（右上角「移动立绘」→「放置XXX」→ 点房间）
 *  - 〔感知〕目击 / 遭遇时自动同步
 *
 * 曾经的 bug：Board 又在渲染时按 `witnessedAt` 过滤了一遍，
 * 于是**没目击过的幸存者一个都不画** —— 摆放记下来了但地图上看不到，
 * 表现为「点房间摆放没反应」。这个套件就是守这一条。
 *
 * 跑法：`npm run test:standee`（依赖 `build-menu.mjs` 先编译 Board）
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
const killerCharIds = content.characters.filter((c) => c.faction === 'killer').map((c) => c.id);

/** 1对1 局 */
function newDuo(killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
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

/** 2对3 局 */
function new2v3(killerA = 'killer1', killerB = 'killer5') {
  const st = createLobby('T', 'k1', 'K1', content, 'cabin');
  st.mode = '2v3';
  const map = { k1: st.players['k1'] };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players['k1'].faction = 'killer';
  st.players['k1'].characterId = killerA;
  st.players['k2'].faction = 'killer';
  st.players['k2'].characterId = killerB;
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  st.players['k1'].orderPick = 'first';
  st.players['k2'].orderPick = 'second';
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  return st;
}

/**
 * 按 `GameViews` 的 `displayPlayers` 逻辑渲染杀手视角，返回立绘数量与 html。
 * `placedMap` = 杀手手动摆的位置。
 */
function renderKillerView(st, viewerId, placedMap) {
  const snap = buildSnapshot(st, viewerId);
  const players = snap.players.map((p) =>
    p.faction !== 'survivor'
      ? p
      : { ...p, roomId: placedMap[p.id] ?? snap.map.survivorStartRoomId, placed: true });
  const html = renderToStaticMarkup(
    React.createElement(Board, {
      map: snap.map,
      players,
      youId: st.killerId ?? viewerId,
      viewerFaction: 'killer',
      legalMoves: [],
      noises: [],
      onRoomClick: () => {},
      witnessedAt: snap.witnessedAt ?? {},
      standeeMoveMode: true,
    }),
  );
  return { count: (html.match(/map-standee/g) ?? []).length, html };
}

console.log('=== ① 没目击过任何幸存者时，摆放的立绘也要画出来 ===');
{
  const st = newDuo();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  console.log(`   幸存者 ${survs.length} 名，witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  /** 把 3 人都摆到 R1 */
  const placedMap = Object.fromEntries(survs.map((s) => [s.id, 'R1']));
  const r = renderKillerView(st, 'h', placedMap);
  console.log(`   立绘数 = ${r.count}`);
  /** 4 = 杀手 1 + 幸存者 3 */
  ok(r.count === 4, '杀手(1) + 三名幸存者(3) 都被画出来', `${r.count}`);
  ok((st.witnessedAt && Object.keys(st.witnessedAt).length) === 0, '（前提）确实一次都没目击过');
  /** 三人都摆在 R1，R1 那里就该有 3 个幸存者立绘 */
  const r1 = r.html.indexOf('R1接待处');
  const around = r.html.slice(r1, r1 + 4000);
  const inR1 = (around.match(/map-standee/g) ?? []).length;
  ok(inR1 >= 3, 'R1 那一段里至少有 3 个立绘', `${inR1}`);
}

console.log('=== ② 目击状态不影响立绘数量（数量只由"活着"决定）===');
{
  const st = newDuo();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const placedMap = Object.fromEntries(survs.map((s) => [s.id, 'R1']));
  const before = renderKillerView(st, 'h', placedMap).count;
  /** 目击一人 */
  st.witnessedAt = { [survs[0].id]: 'R1' };
  const after = renderKillerView(st, 'h', placedMap).count;
  console.log(`   没目击 = ${before}，目击 1 人 = ${after}`);
  ok(before === after, '目击与否不改变立绘数量', `${before} vs ${after}`);
  /** 目击全部 */
  st.witnessedAt = Object.fromEntries(survs.map((s) => [s.id, 'R1']));
  const all = renderKillerView(st, 'h', placedMap).count;
  ok(all === before, '目击全部也不改变数量', `${all}`);
}

console.log('=== ③ 摆到不同地点，立绘跟着分散 ===');
{
  const st = newDuo();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  /** 一人摆 R1、一人摆 B5、一人摆 G1 —— 看三个地点各自有没有立绘 */
  const rooms = ['R1', 'B5', 'G1'];
  const placedMap = Object.fromEntries(survs.map((s, i) => [s.id, rooms[i % rooms.length]]));
  const r = renderKillerView(st, 'h', placedMap);
  console.log(`   摆放：${survs.map((s, i) => `${s.name}→${rooms[i % 3]}`).join('，')}`);
  ok(r.count === 4, '总数仍是 4', `${r.count}`);
  /** 每个地点那一段都该有立绘 */
  let hits = 0;
  for (const rid of rooms) {
    const i = r.html.indexOf(rid);
    if (i >= 0 && r.html.slice(i, i + 4000).includes('map-standee')) hits += 1;
  }
  ok(hits >= 3, '三个地点都有立绘', `${hits}/3`);
}

console.log('=== ④ 2对3 里同样生效（两名杀手都在场）===');
{
  const st = new2v3();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  console.log(`   幸存者 ${survs.length} 名，killerIds = ${JSON.stringify(st.killerIds)}`);
  /** 摆到 R1，R1 起始就有 2 名幸存者（所以三人可能分散在 R1 与别处） */
  const placedMap = Object.fromEntries(survs.map((s) => [s.id, 'R1']));
  const r = renderKillerView(st, st.killerIds[0], placedMap);
  console.log(`   立绘数 = ${r.count}`);
  /** 雕像局会多出立绘，这里用普通两名杀手：杀手 2 + 幸存者 3 = 5 */
  ok(r.count === 5, '两名杀手(2) + 三名幸存者(3) 都被画出来', `${r.count}`);
}

console.log('=== ⑤ 死掉的幸存者不画 ===');
{
  const st = newDuo();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const placedMap = Object.fromEntries(survs.map((s) => [s.id, 'R1']));
  const before = renderKillerView(st, 'h', placedMap).count;
  survs[0].alive = false;
  const after = renderKillerView(st, 'h', placedMap).count;
  console.log(`   有人倒下：${before} → ${after}`);
  ok(after === before - 1, '倒下的幸存者少一个立绘', `${before} → ${after}`);
}

void killerCharIds;
console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
