/**
 * **地图上"预选"的地点都要有标记**（用户口径：
 * 「【留下】在选需拆除的封堵时预选地有高亮吗，扼杀者 4 级放核心标记的预选地有高亮吗，
 *   **所有在地图上预选的情况都应该这样**」）。
 *
 * 两件事：
 *  ① **候选格** = 流动虚线圈（`.legal`，来自服务端 `legalMoves`）；
 *  ② **已经点选、还没确认的那一格** = 实心金圈（`.picked`）。
 *
 * 这次补的是 ② —— 客户端原来只给"封堵 / 任选门封堵 / 机关大门"三种情况画了金圈，
 * 其余（扼杀者 4 级、女王 4 级、屍群來了、移动核心标记、逻辑推理、恐詭管道、
 * 猎手本能、召唤石碑）**只有路径预览、没有地图标记**。
 * 现在统一在 `pickedMapRooms` 里算。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/picked-spot-highlight.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkDuo(mapId = 'mansion') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer8';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  return st;
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
  React.createElement(GameView, {
    state: snap, isHost: true, error: null, onAction: async () => {},
  }),
);
/** 每个地点那一圈的 class（按坐标对上号） */
const roomClassAt = (html, room) => {
  const hit = [...html.matchAll(/class="(room-node[^"]*)"\s+cx="(-?[\d.]+)"\s+cy="(-?[\d.]+)"/g)]
    .find((m) => Number(m[2]) === room.x && Number(m[3]) === room.y);
  return hit ? hit[1] : '(没画出来)';
};

/** 一个场景：设好状态 → 断言"已选格有金圈、候选格有虚线圈" */
function scene(label, patch, pickedIds, expectLegal = true) {
  const st = mkDuo();
  patch(st);
  const snap = buildSnapshot(st, 'h');
  const html = draw(snap);
  const roomOf = (id) => snap.map.rooms.find((r) => r.id === id);
  const detail = pickedIds.map((id) => `${id}:${roomClassAt(html, roomOf(id))}`).join('  ');
  console.log(`  ${label}\n      ${detail}   legalMoves=${snap.legalMoves.length}`);
  const bad = pickedIds.filter((id) => !/\bpicked\b/.test(roomClassAt(html, roomOf(id))));
  ok(bad.length === 0, `**${label}：已选格是实心金圈**`, bad.length ? `缺：${bad.join(',')}` : '');
  if (expectLegal) {
    const cand = snap.legalMoves[0];
    const okLegal = cand ? /\blegal\b/.test(roomClassAt(html, roomOf(cand))) : false;
    ok(okLegal, `${label}：候选格是虚线圈`, cand ? `${cand}:${roomClassAt(html, roomOf(cand))}` : '(没有候选)');
  }
}

console.log('=== ① 扼杀者 4 级：选 2 个地点放核心标记（用户点名） ===');
scene('选了第一个地点', (st) => {
  st.pendingStranglerCoreRooms = ['R1'];
}, ['R1']);

console.log('=== ② 女王 4 级：选 2 个地点生成丧尸 ===');
scene('选了第一个地点', (st) => {
  st.pendingQueenSpawnRooms = ['R1'];
}, ['R1']);

console.log('=== ②b 女王 4 级：一个都还没点时（空数组）===');
scene('还没点任何地点（候选应该是整张图）', (st) => {
  st.pendingQueenSpawnRooms = [];
}, [], true);

console.log('=== ③ 屍群來了第一步：已经点过的"有僵尸的地点" ===');
scene('选了一个地点', (st) => {
  st.pendingZombieHordeFrom = ['R1'];
}, ['R1']);

console.log('=== ④ 移动核心标记第一步（从哪一格移走） ===');
scene('选了要移走的那格', (st) => {
  st.pendingCorePick = 'moveFrom';
  st.pendingCoreRooms = ['R1', 'R2'];
  st.pendingCoreFrom = 'R1';
}, ['R1']);

console.log('=== ⑤ 逻辑推理 / 感知相连两格 ===');
scene('两格都选了', (st) => {
  st.pendingSensePair = { firstRoomId: 'R1', secondRoomId: 'R2' };
}, ['R1', 'R2']);
scene('只选了第一格', (st) => {
  st.pendingSensePair = { firstRoomId: 'R1', secondRoomId: null };
}, ['R1']);

console.log('=== ⑥ 恐詭管道 / 猎手本能 / 召唤石碑 ===');
scene('恐詭管道选中落点', (st) => {
  st.pendingPassageRoom = 'R1';
}, ['R1']);
scene('猎手本能选中地点', (st) => {
  st.pendingSenseRoom = 'R1';
}, ['R1']);
scene('召唤石碑第一步', (st) => {
  st.pendingStatueSealFrom = 'R1';
}, ['R1']);

console.log('=== ⑦ 任选门封堵（进化 4 级 / 特性 13、18）：两格都是金圈 ===');
scene('两格都点了', (st) => {
  st.pendingBlockadeJob = {
    kind: 'anyDoors', roomId: null, need: 4, removeLeft: 0, placed: 0,
    firstRoomId: 'R1', secondRoomId: 'R2',
  };
}, ['R1', 'R2']);

console.log('=== ⑧ 【留下】"先拆再封"阶段：靠客户端点击选中（源码断言） ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  const memo = views.slice(views.indexOf('const blockadeTargetRooms'), views.indexOf('const sharedControl'));
  ok(/job\.removeLeft > 0/.test(memo),
    '**"先拆"阶段的可点清单覆盖了 `removeLeft > 0`**（点得动）');
  ok(/removableBoardBlockades/.test(memo), '用的是 `removableBoardBlockades`（可拆的封堵）');
  ok(/blockadeDest/.test(memo) || /pickedMapRooms/.test(views),
    '点中的那一格会进"已选集合"（`pickedMapRooms` 含 `blockadeDest`）');
  const pick = views.slice(views.indexOf('const pickedMapRooms'), views.indexOf('const previewPath'));
  for (const [field, label] of [
    ['pendingStranglerCoreRooms', '扼杀者 4 级'],
    ['pendingQueenSpawnRooms', '女王 4 级'],
    ['pendingZombieHordeFrom', '屍群來了'],
    ['pendingCoreFrom', '移动核心标记'],
    ['pendingSensePair', '逻辑推理'],
    ['pendingPassageRoom', '恐詭管道'],
    ['pendingSenseRoom', '猎手本能'],
    ['pendingStatueSealFrom', '召唤石碑'],
    ['blockadeDest', '封堵'],
    ['gateDoorFrom', '机关大门'],
  ]) {
    ok(pick.includes(field), `**已选集合覆盖「${label}」（\`${field}\`）**`);
  }
}

console.log('=== ⑨ 没有选中任何格时，地图上不该有金圈（免得乱亮） ===');
{
  const st = mkDuo();
  const snap = buildSnapshot(st, 'h');
  const html = draw(snap);
  const picked = [...html.matchAll(/class="room-node[^"]*\bpicked\b[^"]*"/g)].length;
  ok(picked === 0, '**一格金圈都没有**', `出现 ${picked} 次`);
}

console.log(`\n地图预选高亮：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
