/**
 * **雕像杀手不阻止幸存者的搜索 / 修理**（用户口径：
 * 「应该所有的雕像都不会影响，**包括主雕像**」「主雕像也不能挡搜索，雕像是个特例」）。
 *
 * 用户报的现象：「1对1、墓穴、杀手是雕像、用乔治在 G1，没有显示搜索」。
 *
 * 根因有两层：
 *  1. 雕像局是在原始杀手棋子之外**又**建 4 尊雕像（`setupStatues`），
 *     而那个原始棋子的 `roomId` 一直停在**杀手起始房间**
 *     —— 墓穴的杀手起始房间正好是 G1（= 隐藏出口）；
 *  2. `killerInRoom` 只豁免了 `statueIndex != null` 的棋子，
 *     于是那个原始棋子照样把 G1 封住（服务端 `canSearchHere=false`）。
 *     客户端还自己又判了一遍"同地"（同样漏了豁免）。
 *
 * 现在：`killerInRoom` 在雕像局里恒为假；客户端改成**只信服务端下发的**
 * `killerInYourRoom`，不再自己算第二份。
 *
 * 跑法：node scripts/tests/statue-no-block-search.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { killerInRoom } from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, who, action) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mk(mode, killerChar, mapId = 'crypt') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = mode;
  if (mode === 'solo') {
    st.soloKillerCharacterId = killerChar;
    st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
    st.players.h.ready = true;
  }
  else {
    const bs = createPlayer('s', 'S', 's');
    bs.faction = 'survivor';
    bs.ready = true;
    st.players = { h: st.players.h, s: bs };
    st.players.h.faction = 'killer';
    st.players.h.characterId = killerChar;
    st.players.h.ready = true;
    st.hostId = 'h';
    st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  }
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, 'h', { type: 'confirmTrapPlacement' });
  }
  st.phase = 'survivorMain';
  const first = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  if (first) tryIt(st, mode === 'solo' ? 'h' : 's', { type: 'pickSurvivorTurn', playerId: first.id });
  return st;
}

console.log('=== ① 雕像局：站在 G1（= 杀手起始房间 / 隐藏出口）也能搜索 ===');
{
  for (const mode of ['duo', 'solo']) {
    const st = mk(mode, 'killer6');
    const sock = mode === 'solo' ? 'h' : 's';
    const geo = Object.values(st.players).find((p) => p.characterId === 'survivor6');
    geo.roomId = 'G1';
    const snap = buildSnapshot(st, sock);
    const here = Object.values(st.players)
      .filter((p) => p.faction === 'killer' && p.roomId === 'G1')
      .map((p) => `${p.id}${p.statueIndex != null ? `(雕像${p.statueIndex})` : '(原始棋子)'}`);
    console.log(`  ${mode}：G1 上的杀手棋子=${here.join('、') || '（无）'}`);
    console.log(`    服务端 killerInRoom(G1)=${killerInRoom(st, 'G1')} ` +
      `canSearchHere=${snap.canSearchHere} killerInYourRoom=${snap.killerInYourRoom}`);
    ok(snap.canSearchHere === true, `**${mode}：服务端说能搜**`, String(snap.canSearchHere));
    ok(snap.killerInYourRoom === false, `**${mode}：快照里"有杀手同地"= false**`,
      String(snap.killerInYourRoom));
    const err = tryIt(st, sock, { type: 'search' });
    ok(!err, `**${mode}：搜索真的能执行**`, String(err ?? ''));
    ok(geo.searchedThisTurn === true, `${mode}：确实搜了`, String(geo.searchedThisTurn));
  }
}

console.log('=== ② 雕像局：修理也不受影响 ===');
{
  for (const mode of ['duo', 'solo']) {
    const st = mk(mode, 'killer6');
    const sock = mode === 'solo' ? 'h' : 's';
    const geo = Object.values(st.players).find((p) => p.characterId === 'survivor6');
    /** 墓穴的可修理地点是 B1 */
    const repairRoom = st.map.rooms.find((r) => (r.tags ?? []).includes('repairable'));
    geo.roomId = repairRoom.id;
    /** 顺手把一尊雕像也摆到同一格，确认它同样不挡 */
    const statue = Object.values(st.players).find((p) => p.statueIndex === 3);
    statue.roomId = repairRoom.id;
    const before = st.repairProgress;
    const err = tryIt(st, sock, { type: 'repair' });
    console.log(`  ${mode}：在 ${repairRoom.id} 修理 → ${err ?? 'OK'}（进度 ${before} → ${st.repairProgress}）`);
    ok(!err && st.repairProgress === before + 1, `**${mode}：雕像同格也能修理**`, String(err ?? ''));
  }
}

console.log('=== ③ 普通杀手照样挡搜索（不能把规则改弱） ===');
{
  for (const mode of ['duo', 'solo']) {
    const st = mk(mode, 'killer1');
    const sock = mode === 'solo' ? 'h' : 's';
    const geo = Object.values(st.players).find((p) => p.characterId === 'survivor6');
    geo.roomId = 'G1';
    st.players[st.killerId].roomId = 'G1';
    const snap = buildSnapshot(st, sock);
    console.log(`  ${mode}：屠夫在 G1，canSearchHere=${snap.canSearchHere} ` +
      `killerInYourRoom=${snap.killerInYourRoom}`);
    ok(snap.canSearchHere === false, `**${mode}：与真杀手同地不能搜索**`, String(snap.canSearchHere));
    ok(snap.killerInYourRoom === true, `**${mode}：快照如实说"有杀手同地"**`,
      String(snap.killerInYourRoom));
    const err = tryIt(st, sock, { type: 'search' });
    ok(err != null && /同地/.test(err), `**${mode}：搜索被拒**`, String(err));
  }
}

console.log('=== ④ 客户端"同地"判定只信服务端（不再自己算第二份） ===');
{
  const fs = await import('node:fs');
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(/const killerHere = Boolean\(state\.killerInYourRoom\)/.test(views),
    '**`killerHere` 直接读快照字段**');
  ok(!/pl\.roomId === state\.you\.roomId/.test(views),
    '不再自己遍历棋子判同地（那份漏了雕像豁免）');
  ok(/state\.stealthOriginRoomId && state\.stealthOriginRoomId === state\.you\.roomId/.test(views) === false,
    '潜行入口那半句也一起交给服务端');
}

console.log('=== ⑤ 雕像局：原始棋子被隐藏（幸存者视角只有 4 个杀手） ===');
{
  const st = mk('duo', 'killer6');
  const ghosts = Object.values(st.players).filter(
    (p) => p.faction === 'killer' && p.statueIndex == null,
  );
  const statues = Object.values(st.players).filter((p) => p.statueIndex != null);
  console.log(`  原始棋子：${ghosts.map((g) => `${g.id}@${g.roomId}`).join('、') || '（没有）'}`);
  console.log(`  雕像：${statues.map((s) => `${s.statueIndex}号@${s.roomId}`).join('、')}`);
  ok(ghosts.length === 1, '（前提）雕像局里只有一条原始棋子', String(ghosts.length));
  ok(ghosts.every((g) => g.roomId === null),
    '**原始棋子的位置被清空**（不再占着杀手起始房间）',
    JSON.stringify(ghosts.map((g) => g.roomId)));
  ok(statues.length === 4, '4 尊雕像都在', String(statues.length));
  ok(statues.every((s) => s.roomId != null), '4 尊雕像各有各的位置');
  ok(statues[0].roomId === st.map.survivorStartRoomId &&
    statues[2].roomId === st.map.killerStartRoomId,
    '1/2 号在主要出口、3/4 号在隐藏出口',
    `${statues[0].roomId} / ${statues[2].roomId}`);

  /**
   * 幸存者视角：**画在地图上的杀手刚好是那 4 尊雕像**。
   *
   * ⚠ 幸存者看的不是 `players` 里的杀手棋子（那些位置在雾里会被藏），
   * 而是快照专门的 `statues` 字段 —— 客户端就靠它画 4 尊雕像。
   */
  const snap = buildSnapshot(st, 's');
  const shown = (snap.statues ?? []).map((x) => `${x.index}号@${x.roomId}`);
  console.log(`  幸存者视角的杀手（statues）：${shown.join('、') || '（空）'}`);
  ok((snap.statues ?? []).length === 4, '**幸存者视角刚好 4 个杀手**',
    String((snap.statues ?? []).length));
  ok(!shown.some((x) => x.includes('原始')), '没有第 5 个');

  /** 变体3 计划的"杀手地点"：只算雕像 */
  const { killerRoomIds } = await import('../../server/dist/game/plans.js');
  /** 人为把原始棋子摆到一个**没有任何雕像**的房间，确认判定不会把它算进去 */
  const ghost = ghosts[0];
  const emptyRoom = st.map.rooms.find(
    (r) => !statues.some((s) => s.roomId === r.id),
  );
  ghost.roomId = emptyRoom.id;
  const rooms = killerRoomIds(st);
  console.log(`  人为把原始棋子摆到 ${emptyRoom.id} 后的「杀手地点」：${JSON.stringify(rooms)}`);
  ok(!rooms.includes(emptyRoom.id),
    `**原始棋子所在的 ${emptyRoom.id} 不算「杀手地点」**`, JSON.stringify(rooms));
  ok(rooms.length >= 1, '雕像的格子照常算', String(rooms.length));
}

console.log('=== ⑥ 2v3：藏原始棋子不能影响另一名杀手 ===');
{
  const st = createLobby('TEST', 'k1', 'K1', content, 'cabin');
  st.mode = '2v3';
  const map = { k1: st.players.k1 };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players.k1.faction = 'killer';
  /** k1 = 雕像，k2 = 普通杀手 */
  st.players.k1.characterId = 'killer6';
  st.players.k2.faction = 'killer';
  st.players.k2.characterId = 'killer1';
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = ['survivor6', 'survivor7', 'survivor9'][i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  st.players.k1.orderPick = 'first';
  st.players.k2.orderPick = 'second';
  startGame(st, content, 'k1');
  const ghosts = Object.values(st.players).filter(
    (p) => p.faction === 'killer' && p.statueIndex == null,
  );
  console.log(`  2v3 原始棋子：${ghosts.map((g) => `${g.id}@${g.roomId}`).join('、')}`);
  const statueGhost = ghosts.find((g) => g.id === 'k1');
  const otherGhost = ghosts.find((g) => g.id === 'k2');
  ok(statueGhost?.roomId === null, '**雕像那个杀手的原始棋子被藏起来**',
    String(statueGhost?.roomId));
  ok(otherGhost != null && otherGhost.roomId != null,
    '**另一名杀手的原始棋子位置照旧**（不受影响）', String(otherGhost?.roomId));
}

console.log(`\n雕像不挡搜索/修理：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
