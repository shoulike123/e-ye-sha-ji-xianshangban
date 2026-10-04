/**
 * **谋杀者 4 级「在任意地点总计封堵 ×4」的选点要看得见。**
 *
 * 用户报的两件事：
 *  ① 「我谋杀者 4 级放四个封堵预选时为什么地点没高亮」
 *  ② 「机关大门不能放在有封堵的位置」
 *
 * ① 这条走的是 `startAnyDoorsBlockade`（进化 4 级 / 变体1 特性 13、18 共用），
 *    和普通封堵（`pendingBlockade` / `pendingBlockadePlace`）**不是同一套字段**：
 *    前者是 `pendingBlockadeJob.kind === 'anyDoors'`，每点一格直接发 `move`，
 *    两格记在服务端 `firstRoomId` / `secondRoomId` 上。
 *    以前 `pickedRoomIds` 只认 `blockadeDest`（普通封堵才用）→ 点过的两格
 *    **在图上一点标记都没有**；而候选又是"整张地图全给" → 看不出该点哪。
 *    现在：点过的那两格画实心金圈，候选按进度收窄到"真能点的那几格"。
 *
 * ② 原来只有单向守卫（往封堵上放闸门会被拒），**反方向漏了** ——
 *    封堵可以落在机关大门那扇门上，两张图叠在一起。
 *    现在 `isBlockadableDoor` 统一把机关大门排除：所有封堵路径（封堵牌 /
 *    就地封堵 / 留下 / 核心标记 / 进化封堵）都点不到它。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/evo4-blockade-highlight.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { runUpgrade, roomsForAnyDoorPick } from '../../server/dist/game/evolution.js';
import { tryPlaceBlockadeDoor, isBlockadableDoor } from '../../server/dist/game/effects.js';
import { placeLeverGate } from '../../server/dist/game/mapEffects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const isDoor = (e) => !e.pathType || e.pathType === 'door';
const doorKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 单人：一台电脑全控。杀手 = 谋杀者（killer3） */
function mkSolo(killerId, mapId = 'cabin') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, { type: 'confirmTrapPlacement' });
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  return st;
}

/**
 * 升到 4 级并确认（**走引擎那条升级入口**）。
 *
 * 墓穴地图上 `runUpgrade` 第一次只会记下"确认之后要坍塌"，必须补跑一次 ——
 * 直接调 `runUpgrade` 会停在"等级没涨"的状态（本脚本第一版就栽在这里，
 * 误判成"墓穴地图没高亮"）。
 */
function levelTo4(st) {
  st.killerLevel = 3;
  runUpgrade(st);
  if (st.pendingCollapseAfterEvolution) {
    st.collapseConsumedForLevel = st.pendingCollapseLevel;
    runUpgrade(st);
    st.collapseConsumedForLevel = 0;
  }
  const err = tryIt(st, { type: 'ackEvolution' });
  for (let i = 0; i < 5 && st.pendingStatueEvoSwitch; i += 1) tryIt(st, { type: 'skipStatueEvoSwitch' });
  return err;
}

let GameView = null;
try {
  GameView = (await import('../../client/_ssrbuild/GameViews.js')).GameView;
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}
const draw = (snap) => renderToStaticMarkup(
  React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
);
/** 每个地点画出来的那一圈是什么 class（拿地图坐标对上号） */
const roomClasses = (html) =>
  [...html.matchAll(/class="(room-node[^"]*)"\s+cx="(-?[\d.]+)"\s+cy="(-?[\d.]+)"/g)].map((m) => ({
    cls: m[1],
    x: Number(m[2]),
    y: Number(m[3]),
  }));
const classAt = (html, room) => {
  const hit = roomClasses(html).find((n) => n.x === room.x && n.y === room.y);
  return hit ? hit.cls : '(没画出来)';
};
/** 服务端说能点的地点 = 图上带 .legal 的地点 */
function checkHighlight(label, snap, html) {
  const want = new Set(snap.legalMoves);
  const wrong = [];
  for (const r of snap.map.rooms) {
    const cls = classAt(html, r);
    const has = /\blegal\b/.test(cls);
    if (has !== want.has(r.id)) wrong.push(`${r.id}${has ? '(多了圈)' : '(没圈)'}`);
  }
  ok(wrong.length === 0, label, wrong.join(' ') || `${want.size} 格，图上一致`);
  return want;
}

console.log('=== ① 谋杀者 4 级：选门阶段服务端 + 界面都要有高亮 ===');
{
  const st = mkSolo('killer3');
  const err = levelTo4(st);
  ok(!err, '升到 4 级并确认', String(err ?? ''));
  const job = st.pendingBlockadeJob;
  console.log(`  phase=${st.phase} 作业=${JSON.stringify(job)}`);
  ok(job?.kind === 'anyDoors' && job.need === 4, '进入「任意地点选门封堵」（4 扇）', JSON.stringify(job));
  ok(st.phase === 'upkeep', '这一步发生在**收尾阶段**（upkeep）', st.phase);

  const snap = buildSnapshot(st, 'h');
  /** 期望：至少有一扇可封白门的地点（机关大门/已封的不算） */
  const expected = new Set();
  for (const e of st.map.edges) {
    if (!isDoor(e)) continue;
    if (!isBlockadableDoor(st, doorKey(e.from, e.to))) continue;
    expected.add(e.from);
    expected.add(e.to);
  }
  console.log(`  controllingActive=${snap.controllingActive} you=${snap.you.faction} ` +
    `legalMoves=${snap.legalMoves.length} 有门可封的地点=${expected.size}（地点总数 ${snap.map.rooms.length}）`);
  ok(snap.controllingActive === true, '**操控者能动**（controllingActive）');
  ok(snap.you.faction === 'killer', '视角是杀手', String(snap.you.faction));
  ok(snap.legalMoves.length === expected.size && snap.legalMoves.every((id) => expected.has(id)),
    '**候选 = 至少有一扇可封白门的地点**',
    `${snap.legalMoves.length}/${expected.size}`);
  checkHighlight('**界面上每一格候选都画了可点圈（其余不画）**', snap, draw(snap));
}

console.log('=== ② 点第一格 / 第二格：选中画实心金圈，候选跟着收窄 ===');
{
  const st = mkSolo('killer3');
  levelTo4(st);
  const snap0 = buildSnapshot(st, 'h');
  const pair = (snap0.map.edges ?? []).find((e) => isDoor(e));
  const a = pair.from;
  const b = pair.to;
  const roomOf = (id) => snap0.map.rooms.find((r) => r.id === id);

  ok(!tryIt(st, { type: 'move', toRoomId: a }), `点第一格「${a}」`);
  const snap1 = buildSnapshot(st, 'h');
  console.log(`  firstRoomId=${snap1.pendingBlockadeJob.firstRoomId} secondRoomId=${snap1.pendingBlockadeJob.secondRoomId} ` +
    `legalMoves=${JSON.stringify(snap1.legalMoves)}`);
  ok(snap1.pendingBlockadeJob.firstRoomId === a, '第一格记下来了', String(snap1.pendingBlockadeJob.firstRoomId));
  const html1 = draw(snap1);
  ok(/\bpicked\b/.test(classAt(html1, roomOf(a))), '**第一格在图上画了实心金圈（.picked）**', classAt(html1, roomOf(a)));
  ok(snap1.legalMoves.includes(b), '与它相连的地点仍在候选里', String(b));
  checkHighlight('候选收窄到「与第一格以门相连的地点」', snap1, html1);

  ok(!tryIt(st, { type: 'move', toRoomId: b }), `点第二格「${b}」`);
  const snap2 = buildSnapshot(st, 'h');
  console.log(`  firstRoomId=${snap2.pendingBlockadeJob.firstRoomId} secondRoomId=${snap2.pendingBlockadeJob.secondRoomId}`);
  ok(snap2.pendingBlockadeJob.secondRoomId === b, '第二格记下来了', String(snap2.pendingBlockadeJob.secondRoomId));
  const html2 = draw(snap2);
  ok(/\bpicked\b/.test(classAt(html2, roomOf(a))) && /\bpicked\b/.test(classAt(html2, roomOf(b))),
    '**两格都画了实心金圈**', `${classAt(html2, roomOf(a))} / ${classAt(html2, roomOf(b))}`);
  ok(html2.includes('确认封堵'), '行动区出现「确认封堵」按钮');
  checkHighlight('两格都点完之后候选不变（还能再点同一格取消）', snap2, html2);
}

console.log('=== ③ 四扇门一路封完 ===');
{
  const st = mkSolo('killer3');
  levelTo4(st);
  const before = st.blockades.length;
  let guard = 0;
  while (st.pendingBlockadeJob && guard < 12) {
    guard += 1;
    const snap = buildSnapshot(st, 'h');
    /** 从候选里挑一对"真的以白门相连"的地点 */
    const edge = (st.map.edges ?? []).find(
      (e) => isDoor(e) && snap.legalMoves.includes(e.from) && snap.legalMoves.includes(e.to) &&
        isBlockadableDoor(st, doorKey(e.from, e.to)),
    );
    if (!edge) { ok(false, '候选里找不到成对的门', JSON.stringify(snap.legalMoves)); break; }
    tryIt(st, { type: 'move', toRoomId: edge.from });
    tryIt(st, { type: 'move', toRoomId: edge.to });
    const err = tryIt(st, { type: 'confirmEvoBlockade' });
    if (err) { ok(false, '确认封堵', err); break; }
  }
  const placed = st.blockades.length - before;
  console.log(`  封了 ${placed} 扇：${JSON.stringify(st.blockades)}；作业=${JSON.stringify(st.pendingBlockadeJob)}`);
  ok(placed === 4, '**4 扇门全部落地**', String(placed));
  ok(st.pendingBlockadeJob == null, '作业收掉了');
}

console.log('=== ④ 机关大门和封堵不能共存（两个方向都要挡） ===');
{
  const st = mkSolo('killer3', 'castle');
  /** 找一扇门当机关大门（顺便要求它两端的地点各自还有别的白门，方便验证高亮） */
  const gateEdge = (st.map.edges ?? []).find((e) => isDoor(e));
  const gateDoor = doorKey(gateEdge.from, gateEdge.to);
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  placeLeverGate(st, gateEdge.from, gateEdge.to, surv.id);
  ok(st.leverGateDoorId === gateDoor, '（前提）机关大门放在一扇白门上', String(st.leverGateDoorId));

  /** 方向一：直接落封堵 → 拒绝 */
  const r = tryPlaceBlockadeDoor(st, gateDoor);
  ok(r === 'skip' && !st.blockades.includes(gateDoor), '**机关大门那扇门封不上**', `${r}`);
  ok(st.logs.some((l) => String(l.text ?? '').includes('机关大门，不能封堵')),
    '战报写明原因');

  /** 方向二：往封堵上放闸门 → 早就挡着，这里复核一次 */
  const st2 = mkSolo('killer3', 'castle');
  const anyDoor = (st2.map.edges ?? []).find((e) => isDoor(e));
  tryPlaceBlockadeDoor(st2, doorKey(anyDoor.from, anyDoor.to));
  let gateErr = null;
  try { placeLeverGate(st2, anyDoor.from, anyDoor.to, 'x'); } catch (e) { gateErr = e.message; }
  ok(gateErr != null && /已经被封堵/.test(gateErr), '**封堵上放不了机关大门**', String(gateErr));

  /** 方向三：进化封堵的候选/点选都不许碰机关大门 */
  const st3 = mkSolo('killer3', 'castle');
  const gEdge = (st3.map.edges ?? []).find((e) => isDoor(e));
  const gDoor = doorKey(gEdge.from, gEdge.to);
  placeLeverGate(st3, gEdge.from, gEdge.to, surv.id);
  levelTo4(st3);
  const blockadable = (st3.map.edges ?? []).filter((e) => isDoor(e))
    .map((e) => doorKey(e.from, e.to))
    .filter((k) => isBlockadableDoor(st3, k)).length;
  const totalDoors = new Set((st3.map.edges ?? []).filter((e) => isDoor(e)).map((e) => doorKey(e.from, e.to))).size;
  console.log(`  白门 ${totalDoors} 扇（含机关大门 1 扇）→ 可封 ${blockadable} 扇；作业 need=${st3.pendingBlockadeJob?.need}`);
  ok(st3.pendingBlockadeJob?.need === Math.min(4, blockadable),
    '**4 级封堵的数量不把机关大门算进去**', `need=${st3.pendingBlockadeJob?.need} 可封=${blockadable}`);
  ok(!tryIt(st3, { type: 'move', toRoomId: gEdge.from }), '点机关大门这一端作为第一格');
  const legalAfter = roomsForAnyDoorPick(st3);
  ok(!legalAfter.includes(gEdge.to),
    '**另一端（隔着机关大门）不在候选里**', JSON.stringify(legalAfter));
  const pickErr = tryIt(st3, { type: 'move', toRoomId: gEdge.to });
  ok(pickErr != null && /机关大门/.test(pickErr), '硬点过去会被明确拒绝', String(pickErr));
  void gDoor;
}

console.log('=== ⑤ 普通封堵（封堵牌那条路）也不许点在机关大门上 ===');
{
  const st = mkSolo('killer3', 'castle');
  /** 找一扇"两端各自还有别的白门"的房间当起点，才能验证"少了一格、别的还在" */
  const doors = (st.map.edges ?? []).filter((e) => isDoor(e));
  const count = (roomId) => doors.filter((e) => e.from === roomId || e.to === roomId).length;
  const start = doors.find((e) => count(e.from) >= 2 && count(e.to) >= 2);
  ok(Boolean(start), '（前提）找到两端都还有别的白门的一对地点',
    JSON.stringify(start && [start.from, start.to]));
  if (start) {
    const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
    placeLeverGate(st, start.from, start.to, surv.id);
    st.pendingBlockade = true;
    st.pendingBlockadeRoom = start.from;
    const snap = buildSnapshot(st, 'h');
    const html = draw(snap);
    const other = start.to;
    const otherRoom = snap.map.rooms.find((r) => r.id === other);
    const oneMore = doors.find(
      (e) => e.from === start.from && e.to !== other ? true : e.to === start.from && e.from !== other,
    );
    const moreRoom = oneMore
      ? snap.map.rooms.find((r) => r.id === (oneMore.from === start.from ? oneMore.to : oneMore.from))
      : null;
    console.log(`  起点 ${start.from}：机关大门通 ${other}；另一扇白门通 ${moreRoom?.id}`);
    ok(!/\blegal\b/.test(classAt(html, otherRoom)),
      '**机关大门那一格不高亮、也点不动**', classAt(html, otherRoom));
    ok(moreRoom && /\blegal\b/.test(classAt(html, moreRoom)),
      '同一地点别的白门照常高亮', moreRoom ? classAt(html, moreRoom) : '(没有别的门)');
  }
}

console.log('=== ⑥ 五张地图的选门阶段都要有高亮 ===');
{
  const bad = [];
  for (const m of content.maps) {
    const st = mkSolo('killer3', m.id);
    levelTo4(st);
    const snap = buildSnapshot(st, 'h');
    const html = draw(snap);
    const want = new Set(snap.legalMoves);
    if (!snap.controllingActive || want.size === 0) bad.push(`${m.id}:候选=${want.size}`);
    for (const r of snap.map.rooms) {
      const has = /\blegal\b/.test(classAt(html, r));
      if (has !== want.has(r.id)) { bad.push(`${m.id}:${r.id}`); break; }
    }
  }
  ok(bad.length === 0, `**${content.maps.length} 张地图**逐一看过`, bad.join(' ') || '全都对');
}

console.log('=== ⑦ 场上封堵满时（先拆再封）：候选是"可拆的门"，地图点击也要能用 ===');
{
  const st = mkSolo('killer3');
  levelTo4(st);
  const doors = (st.map.edges ?? []).filter((e) => isDoor(e));
  st.blockades = doors.slice(0, st.rules.blockadeTokenMax).map((e) => doorKey(e.from, e.to));
  st.pendingEvoFourBlockade = true;
  st.pendingBlockadeJob = null;
  const { startPendingEvoFourIfNeeded } = await import('../../server/dist/game/evolution.js');
  startPendingEvoFourIfNeeded(st);
  console.log(`  作业=${JSON.stringify(st.pendingBlockadeJob)}`);
  ok((st.pendingBlockadeJob?.removeLeft ?? 0) > 0, '**要先移除**若干场上封堵', String(st.pendingBlockadeJob?.removeLeft));

  const snap = buildSnapshot(st, 'h');
  const html = draw(snap);
  console.log(`  legalMoves=${JSON.stringify(snap.legalMoves)}`);
  ok(snap.legalMoves.length > 0, '移除阶段有高亮', String(snap.legalMoves.length));
  checkHighlight('高亮 = 可拆封堵所在的地点', snap, html);
  /** 行动区必须列出可拆的门（否则玩家只能靠地图点） */
  ok(html.includes('拆除'), '行动区列出了「拆除 …」按钮');

  /**
   * 地图点击这条路以前被静默吞掉（`blockadeTargetRooms` 只认
   * `pendingBlockade` / `pendingBlockadePlace`，不含进化封堵的"先拆"阶段）。
   * SSR 点不了地图，所以查源码里那一支在不在。
   */
  const src = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(/job\.removeLeft > 0/.test(src) && /removableBoardBlockades/.test(src),
    '**"先拆"阶段的地图点击也算进 blockadeTargetRooms**（点了能选、能确认拆）');
  ok(/state\.leverGateDoorId === key/.test(src),
    '**普通封堵的可点清单也排除了机关大门**（客户端和服务端同一口径）');
}

console.log(`\n谋杀者 4 级封堵选点高亮 + 机关大门互斥：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
