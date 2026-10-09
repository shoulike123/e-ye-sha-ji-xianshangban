/**
 * **雕像：行动区最上方的状态条要写清"主雕像 / 本回合被停滞的雕像"＋几号＋位置**（用户口径）。
 *
 * 用户原话：「在雕像行动区最上方写明主雕像和本轮被停滞的雕像」
 * ＋「写明雕像几和位置」。
 *
 * 画法是 `GameViews.tsx` 里 `.table-actions` 顶上那条 `.statue-status-bar`：
 *  - 主雕像：雕像 N（R#地点）
 *  - 本回合被停滞：雕像 M（R#地点）…（没有就写"无"）
 *
 * ⚠ **只给杀手看** —— 幸存者界面不能暴露哪尊是主雕像（老口径：
 * 「幸存者界面不能有正确的主雕像的高亮显示」），所以这里 ③ 专门查这一条。
 *
 * 跑法：node scripts/tests/statue-status-bar.mjs
 * （需要先 `node scripts/tests/build-menu.mjs`）
 */
import { createRequire } from 'node:module';
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

let GameView = null;
try {
  ({ GameView } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}
const draw = (snap) => renderToStaticMarkup(
  React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
);

/** 1对1，杀手 = 雕像（killer6） */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer6';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 开局准备：选主雕像（雕像 1）并确认 */
  if (st.phase === 'statueSetup') {
    const main = Object.values(st.players).find((p) => p.statueIndex === 1);
    if (main) {
      try { handleAction(st, 'h', { type: 'chooseMainStatue', statueId: main.id }, content); }
      catch { /* 已经选好就跳过 */ }
    }
    try { handleAction(st, 'h', { type: 'confirmMainStatue' }, content); }
    catch { /* 同上 */ }
  }
  return st;
}

const statuesOf = (st) => Object.values(st.players).filter((p) => p.statueIndex != null);
/** 和客户端 `roomDisplayName(map, id, 'killer')` 同一口径：`编号+地名` */
const where = (st, roomId) => {
  const r = st.map.rooms.find((x) => x.id === roomId);
  if (!r) return String(roomId ?? '未知');
  const name = r.nameKiller ?? r.name;
  return name.startsWith(r.id) ? name : `${r.id}${name}`;
};

console.log('=== ① 杀手行动区最上方：写明主雕像（几号 + 位置）===');
{
  const st = mk();
  st.phase = 'killerMain';
  const main = st.players[st.killerId];
  ok(main?.statueIndex != null, '（前提）开局准备已选定主雕像', String(main?.statueIndex));
  const snap = buildSnapshot(st, 'h');
  ok(snap.isStatueKiller === true, '（前提）快照认得出这是雕像杀手');
  const html = await draw(snap);
  const expect = `主雕像：雕像 ${main.statueIndex}（${where(st, main.roomId)}）`;
  console.log(`  期望包含：${expect}`);
  ok(html.includes('statue-status-bar'), '有状态条这块');
  ok(html.includes(expect), '**写了主雕像：几号 + 在哪**', expect);
}

console.log('\n=== ② 本回合被停滞的雕像：几号 + 位置（没有就写"无"）===');
{
  const st = mk();
  st.phase = 'killerMain';
  const all = statuesOf(st);
  const halted = all.filter((p) => p.id !== st.killerId).slice(0, 2);
  for (const p of halted) p.statueHalted = true;
  const snap = buildSnapshot(st, 'h');
  const html = await draw(snap);
  const expect = `本回合被停滞：${halted.map((p) => `雕像 ${p.statueIndex}（${where(st, p.roomId)}）`).join('、')}`;
  console.log(`  期望包含：${expect}`);
  ok(html.includes(expect), '**被停滞的雕像逐尊写了号数和位置**', expect);
  /** 对照：没有被停滞的 → 写"无" */
  const st2 = mk();
  st2.phase = 'killerMain';
  const html2 = await draw(buildSnapshot(st2, 'h'));
  ok(html2.includes('本回合被停滞：无'), '没有被停滞时写"无"');
}

console.log('\n=== ③ 幸存者界面不能有这条（会暴露主雕像）===');
{
  const st = mk();
  st.phase = 'killerMain';
  statuesOf(st).filter((p) => p.id !== st.killerId)[0].statueHalted = true;
  const html = await draw(buildSnapshot(st, 's'));
  ok(!html.includes('statue-status-bar'), '**幸存者那边没有状态条**');
  ok(!html.includes('主雕像：雕像'), '**没有"主雕像：雕像 N"这种字样**');
  ok(!html.includes('本回合被停滞：'), '**也没有"本回合被停滞"清单**');
}

console.log(`\n雕像状态条：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
