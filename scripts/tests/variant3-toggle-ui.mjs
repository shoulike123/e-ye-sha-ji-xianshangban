/**
 * **大厅 / 选人界面那颗「【变体3】计划卡：开 / 关」按钮要点得动。**
 *
 * 用户报的：「选择界面变体3我无法点击」。
 *
 * 根因：服务端快照**从来没下发 `variant3`** —— 客户端 `state.variant3` 永远是
 * `undefined`，于是按钮一直显示"关"、点完也不变，看起来像点不动
 * （其实服务端已经开了）。
 *
 * 这个脚本锁死三件事：
 *   ① 快照里带着 `variant3`（双方都要有 —— 这是模式设置）
 *   ② 点一下 → 服务端真的开/关，快照跟着变，界面文案与高亮跟着变
 *   ③ 不是房主就根本看不到那块设置（不会出现"看得见点不动"）
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/variant3-toggle-ui.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 房主 + 一名客人，停在选人界面 */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  const guest = createPlayer('g', 'G', 'g');
  guest.ready = false;
  st.players = { ...st.players, g: guest };
  st.hostId = 'h';
  st.phase = 'characterSelect';
  return st;
}

let GameView = null;
let LobbyView = null;
try {
  ({ GameView, LobbyView } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}
/**
 * ⚠ 那颗「【变体3】计划卡」按钮在**大厅/选人界面**（`LobbyView`）里，
 * 不在对局界面（`GameView`）里 —— 所以要渲染的是 LobbyView。
 */
const draw = (snap) => renderToStaticMarkup(
  React.createElement(LobbyView, {
    state: { ...snap, isHost: snap.isHost },
    isHost: snap.isHost,
    error: null,
    onAction: async () => {},
    onLeave: async () => {},
    /** 设置面板默认是收起的，测试里直接展开 */
    initialMoreSettingsOpen: true,
  }),
);

/* ═══════════ ① 快照里必须有 variant3 ═══════════ */
console.log('=== ① 快照下发 `variant3` ===');
{
  const st = mk();
  const snapHost = buildSnapshot(st, 'h');
  const snapGuest = buildSnapshot(st, 'g');
  ok(snapHost.variant3 === false, '**房主快照里有 `variant3`（默认关）**',
    JSON.stringify(snapHost.variant3));
  ok(snapGuest.variant3 === false,
    '**客人快照里也有**（这是模式设置，双方都该知道）', JSON.stringify(snapGuest.variant3));
  ok(snapHost.variant1 === false, '（顺带）`variant1` 照旧在', JSON.stringify(snapHost.variant1));
}

/* ═══════════ ② 点一下 → 服务端真的开了，界面跟着变 ═══════════ */
console.log('=== ② 点一下：真的开 / 关，界面跟随 ===');
{
  const st = mk();
  const htmlOff = draw(buildSnapshot(st, 'h'));
  ok(htmlOff.includes('【变体3】计划卡：关'), '**初始显示"关"**');

  /** 客户端点按钮就是发这个动作 */
  const err = tryIt(st, 'h', { type: 'setVariant3', on: !buildSnapshot(st, 'h').variant3 });
  ok(!err, '房主能点（服务端接受）', String(err ?? ''));
  ok(st.variant3 === true, '**服务端真的开了**', String(st.variant3));
  const snapOn = buildSnapshot(st, 'h');
  ok(snapOn.variant3 === true, '**快照跟着变成 true**（这就是以前缺的那一环）',
    JSON.stringify(snapOn.variant3));
  const htmlOn = draw(snapOn);
  ok(htmlOn.includes('【变体3】计划卡：开'), '**按钮文案变成"开"**');
  ok(htmlOn.includes('开局给幸存者方随机发 2 张计划卡'), '说明文字也跟着出现');

  /** 再点一下 → 关 */
  const err2 = tryIt(st, 'h', { type: 'setVariant3', on: !buildSnapshot(st, 'h').variant3 });
  ok(!err2, '再点一下也能用', String(err2 ?? ''));
  ok(st.variant3 === false, '**关回去了**', String(st.variant3));
  ok(draw(buildSnapshot(st, 'h')).includes('【变体3】计划卡：关'), '文案回到"关"');
}

/* ═══════════ ③ 不是房主：压根看不到这块设置 ═══════════ */
console.log('=== ③ 非房主看不到设置（不会"看得见点不动"）===');
{
  const st = mk();
  const htmlGuest = draw({ ...buildSnapshot(st, 'g'), isHost: false });
  ok(!htmlGuest.includes('【变体3】计划卡'), '**客人界面里没有这颗按钮**');
  const err = tryIt(st, 'g', { type: 'setVariant3', on: true });
  ok(Boolean(err && err.includes('房主')), '客人硬发这个动作会被拒（服务端也挡一道）',
    String(err ?? ''));
}

/* ═══════════ ④ 开局之后不能再改（老规矩没被改坏）═══════════ */
console.log('=== ④ 进对局后不能再切 ===');
{
  const st = mk();
  st.phase = 'survivorMain';
  const err = tryIt(st, 'h', { type: 'setVariant3', on: true });
  ok(Boolean(err && err.includes('对局开始后')), '对局中切换被拒', String(err ?? ''));
}

console.log(`\n变体3 开关：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
