/**
 * **① 选择封堵时，被点选的那一格要高亮**
 * **② 挂久了点不动 → 断线/回不到房间时必须说出来，并且立刻给反馈**
 * **③ 封堵标记必须画在"校准的那一格"上，不许被错开带偏**
 *
 * 用户报的三件事：
 *  - 「选择封堵时，被选择的地点要高亮」
 *  - 「为什么我游戏挂久了就啥都点不了了」
 *  - 「地图编辑里封堵位置都准了，游戏内全都往上偏、露出底下白色的门」
 *
 * ② 的根因在 `useGameSocket`：`requireSocket` 只判 `socket` 存不存在，
 * 断线时 socket 对象还在 → `emit` 被 socket.io 缓存 → 确认回调永远不来，
 * `await sendAction` 挂死、界面像卡住；重连后 `joinRoom` 失败（服务器重启过）
 * 也什么都不说。现在：断线立刻给提示、回不到房间就退回主界面。
 *
 * ③ 的根因在 `Board.tsx`：以前写成 `gateShift = blocked ? 7 : 0` ——
 * 只要"有封堵"就把封堵上移 7px（那是为了和【城堡】机关大门错开），
 * 于是非城堡地图、或门上根本没闸门时也会偏。现在**封堵永远画在校准坐标**，
 * 错开量只加在闸门上、且只有两张图同时存在时才加。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/blockade-pick-and-disconnect.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 起一局（默认豪宅），并把杀手停在"行动中" */
function baseState(map = 'mansion', killerChar = 'killer7') {
  const st = createLobby('T', 'h', 'H', content, map);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerChar;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  const k = st.players[st.killerId];
  k.roomId = 'R1';
  k.actionsLeft = 2;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = 'B1';
  }
  st.encounter = null;
  return st;
}

/** 杀手在 R1、封堵第一步已经挂起（任意地方可封的那种） */
function mkBlockade() {
  const st = baseState();
  st.pendingBlockade = true;
  st.pendingBlockadeRoom = 'R1';
  return st;
}

let GameView = null;
let Board = null;
try {
  const ssr = await import('../../client/_ssrbuild/GameViews.js');
  GameView = ssr.GameView;
  Board = (await import('../../client/_ssrbuild/Board.js')).Board;
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}
const draw = (snap, extra = {}) => renderToStaticMarkup(
  React.createElement(GameView, {
    state: snap, isHost: true, error: null, onAction: async () => {}, ...extra,
  }),
);
/** Board 画每个标记都是 `translate(cx cy) rotate(...) translate(...)` —— 抠出中心点比对 */
const translatesIn = (html) =>
  [...html.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const near = (p, x, y) => Math.abs(p[0] - x) < 0.05 && Math.abs(p[1] - y) < 0.05;

/* ═══════════ ① 封堵：候选高亮 + 点选后高亮 ═══════════ */
console.log('=== ① 封堵选点：候选是虚线圈、选中的是实心金圈 ===');
{
  const st = mkBlockade();
  const snap = buildSnapshot(st, 'h');
  const html = draw(snap);
  const candidates = snap.legalMoves;
  console.log(`   服务端给的候选：${JSON.stringify(candidates)}`);
  ok(candidates.length > 0, '有可封的候选格', JSON.stringify(candidates));
  ok(html.includes('room-node legal'), '候选格画的是 `.legal`（流动虚线圈）');
  ok(!html.includes('room-node picked'), '还没点选 → 没有 `.picked`');

  /** SSR 点不了地图，所以直接给 Board 传"已点选"的那一格 */
  const picked = candidates[0];
  const board = renderToStaticMarkup(
    React.createElement(Board, {
      map: snap.map,
      players: [],
      youId: st.killerId,
      viewerFaction: 'killer',
      legalMoves: candidates,
      pickedRoomIds: [picked],
      noises: [],
      statues: [],
    }),
  );
  ok(board.includes('legal picked') || board.includes('picked legal'),
    '**被点选的那一格带 `.picked`**（实心金圈）', picked);
  const pickedCount = (board.match(/picked/g) ?? []).length;
  ok(pickedCount === 1, '**只有被点选的那一格是 picked**', `出现 ${pickedCount} 次`);
}

/* ═══════════ ② 断线 / 回不到房间：必须说出来 ═══════════ */
console.log('=== ② 断线不再"静默卡死" ===');
{
  const src = fs.readFileSync(new URL('../../client/src/useGameSocket.ts', import.meta.url), 'utf8');
  ok(src.includes('socket?.connected'),
    '**`requireSocket` 连 `connected` 一起判**（断线时立刻拒绝，不再让 await 挂死）');
  ok(/断线了，正在重连/.test(src), '断线时会写一条明确提示');
  ok(/原来的房间/.test(src) && /已经不在了/.test(src),
    '**重连后回不到房间**（服务器重启过）会退回主界面并说明原因');
  ok(/connect_error/.test(src), '连不上服务器也有提示（不是一直"正在连接…"）');

  const app = fs.readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  ok(/disconnect-banner/.test(app), '对局中有一条**醒目的断线横幅**');
  const css = fs.readFileSync(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  ok(/\.disconnect-banner/.test(css), '横幅有样式');
  ok(/\.room-node\.picked/.test(css), '地图上有 `.room-node.picked` 的样式');
}

/* ═══════════ ③ 封堵确认这条路照旧能走完 ═══════════ */
console.log('=== ③ 选了门之后确认封堵照常生效 ===');
{
  const st = mkBlockade();
  const snap = buildSnapshot(st, 'h');
  const target = snap.legalMoves[0];
  /**
   * ⚠ 客户端确认封堵走的就是**普通 `move`**（`confirmBlockadeDest` 里是
   * `onAction({type:'move', toRoomId: blockadeDest})`）—— 服务端认得出
   * "现在在选封堵"，把它当成"点那扇门"。
   */
  const err = tryIt(st, 'h', { type: 'move', toRoomId: target });
  ok(!err, '**能确认封堵**（点了门之后的那一步）', String(err ?? ''));
  const door = ['R1', target].sort().join('|');
  ok((st.blockades ?? []).includes(door), '**门被封上了**', JSON.stringify(st.blockades));
  ok(!st.pendingBlockade, '这一问收掉了');
}

/* ═══════════ ④ 封堵必须画在校准的那一格 ═══════════ */
console.log('=== ④ 封堵标记的位置 = 校准的位置（不许上移） ===');
{
  const st = baseState('castle', 'killer2');
  const snap = buildSnapshot(st, 'h');
  const doors = (snap.map.edges ?? []).filter((e) => {
    const isDoor = !e.pathType || e.pathType === 'door';
    return isDoor && e.blockade && e.blockade.killer;
  });
  ok(doors.length > 0, '（前提）地图里有带校准坐标的白门', `${doors.length} 扇`);
  const edge = doors[0];
  if (edge) {
    const mark = edge.blockade.killer;
    const key = [edge.from, edge.to].sort().join('|');
    const baseProps = {
      map: snap.map,
      players: [],
      youId: st.killerId,
      viewerFaction: 'killer',
      legalMoves: [],
      noises: [],
      statues: [],
    };
    /** 只封堵、门上没有机关大门（用户看到的常态） */
    const onlyBlocked = renderToStaticMarkup(
      React.createElement(Board, { ...baseProps, blockades: [key] }),
    );
    const pts = translatesIn(onlyBlocked);
    const wantX = mark.x + mark.w / 2;
    const wantY = mark.y + mark.h / 2;
    ok(pts.some((p) => near(p, wantX, wantY)),
      '**封堵画在校准的坐标上**（y 没有被上移）',
      `${wantX.toFixed(1)}, ${wantY.toFixed(1)}`);
    /** 反证：老写法会上移 7px，那个坐标不该出现 */
    ok(!pts.some((p) => near(p, wantX, wantY - 7)),
      '**没有"上移 7px"的旧坐标**', `${wantX.toFixed(1)}, ${(wantY - 7).toFixed(1)}`);

    /** 城堡里同时有封堵 + 机关大门：封堵不动，闸门才错开 */
    const both = renderToStaticMarkup(
      React.createElement(Board, { ...baseProps, blockades: [key], leverGateDoorId: key }),
    );
    const imgs = (both.match(/<image/g) ?? []).length;
    ok(imgs >= 2, '同一扇门上两张图都画出来', `${imgs} 张`);
    ok(translatesIn(both).some((p) => near(p, wantX, wantY)),
      '**两张同门时，封堵仍然在校准位置**', `${wantX.toFixed(1)}, ${wantY.toFixed(1)}`);
  }
}

console.log(`\n封堵选点高亮 + 断线提示 + 封堵位置：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
