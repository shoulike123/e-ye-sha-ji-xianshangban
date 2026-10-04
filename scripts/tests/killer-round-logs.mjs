/**
 * **杀手界面：地图旁边的信息栏里放「本大回合全部战报」**（用户要求）。
 *
 * 口径：
 *  - 范围 = **当前这个大回合**（`state.round`：幸存者大回合 + 本轮杀手回合）；
 *  - 内容 = **杀手本来就看得见的那部分**（幸存者私密日志、雾阶段的"共通信息"都不能漏）；
 *  - **只给杀手视角**（幸存者那边本来就有完整战报栏）。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/killer-round-logs.mjs
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
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer5';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  st.round = 1;
  st.noises = [];
  st.players[st.killerId].roomId = 'R1';
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = 'B1';
  }
  st.pendingSurvivorPick = false;
  st.encounter = null;
  return st;
}

let GameView = null;
try {
  ({ GameView } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 node scripts/tests/build-menu.mjs）');
  process.exit(1);
}
const draw = (snap, extra = {}) => renderToStaticMarkup(
  React.createElement(GameView, {
    state: snap, isHost: true, error: null, onAction: async () => {}, ...extra,
  }),
);

/* ═══════════ ① 只给杀手视角 + 真实战报都带回合号 ═══════════ */
console.log('=== ① `roundLogs` 只下发杀手 ===');
{
  const st = mk();
  const snapK = buildSnapshot(st, 'h');
  const snapS = buildSnapshot(st, 's');
  ok(Array.isArray(snapK.roundLogs), '杀手快照里有 `roundLogs`', typeof snapK.roundLogs);
  ok((snapK.roundLogs ?? []).length > 0, '里面有本回合的战报',
    JSON.stringify((snapK.roundLogs ?? []).slice(0, 3)));
  ok((snapS.roundLogs ?? []).length === 0,
    '**幸存者快照里是空的**（他有完整战报栏，不需要这块）',
    JSON.stringify(snapS.roundLogs ?? null));
  ok(st.logs.every((l) => typeof l.round === 'number'),
    '**`log()` 写下的每条战报都带 `round`**',
    JSON.stringify(st.logs.filter((l) => typeof l.round !== 'number').map((l) => l.text).slice(0, 3)));
}

/* ═══════════ ② 只装"本大回合"的：上一回合的不进来 ═══════════ */
console.log('=== ② 跨回合隔离 ===');
{
  const st = mk();
  /** 第 1 回合：一条双方可见的战报（和 `log()` 同一种写法） */
  st.logs.push({ t: Date.now(), text: '【第1回合】杀手搜索房间，没有发现人。', vis: 'all', round: st.round });
  const r1 = buildSnapshot(st, 'h').roundLogs ?? [];
  ok(r1.some((t) => t.includes('【第1回合】')), '第 1 回合那条在里面', JSON.stringify(r1.slice(-1)));

  /** 推进大回合号（模拟进入下一轮幸存者大回合） */
  st.round = 2;
  st.logs.push({ t: Date.now(), text: '【第2回合】幸存者正在行动（第 2 回合）。', vis: 'all', round: 2 });
  const r2 = buildSnapshot(st, 'h').roundLogs ?? [];
  ok(r2.some((t) => t.includes('【第2回合】')), '第 2 回合的新战报在里面', JSON.stringify(r2.slice(-2)));
  ok(!r2.some((t) => t.includes('【第1回合】')),
    '**第 1 回合那些不在了**', JSON.stringify(r2.filter((t) => t.includes('【第1回合】'))));
  /** 战报历史里那条还在（只是不在这块里） */
  ok(st.logs.some((l) => l.text.includes('【第1回合】')), '历史战报没被删（只是这块按回合筛）');
}

/* ═══════════ ③ 幸存者私密日志不漏给杀手 ═══════════ */
console.log('=== ③ 私密日志不进这块 ===');
{
  const st = mk();
  st.logs.push({ t: Date.now(), text: '【私密】某幸存者搜索到了工具箱', vis: 'survivor', round: st.round });
  st.logs.push({ t: Date.now(), text: '【公开】某幸存者被治疗了', vis: 'all', round: st.round });
  const round = buildSnapshot(st, 'h').roundLogs ?? [];
  ok(!round.some((t) => t.includes('【私密】')),
    '**`vis: survivor` 的日志没进杀手这块**', JSON.stringify(round.filter((t) => t.includes('【私密】'))));
  ok(round.some((t) => t.includes('【公开】')), '公开的那些在', JSON.stringify(round.filter((t) => t.includes('【公开】'))));
  /** 幸存者视角：这块是空的（他自己有战报栏） */
  ok((buildSnapshot(st, 's').roundLogs ?? []).length === 0, '幸存者视角仍然为空');
}

/* ═══════════ ④ 界面：地图旁边那块信息栏画出来了 ═══════════ */
console.log('=== ④ 界面 ===');
{
  const st = mk();
  const snapK = buildSnapshot(st, 'h');
  const htmlK = draw(snapK);
  ok(htmlK.includes('本大回合战报'), '**杀手界面有「本大回合战报」这一块**');
  const lines = snapK.roundLogs ?? [];
  const sample = lines[lines.length - 1] ?? '';
  ok(sample.length > 0, '有可断言的战报行', sample);
  ok(htmlK.includes(sample.slice(0, 12)), '**战报内容画出来了**', sample.slice(0, 40));
  ok(htmlK.includes('round-log-box'), '用的是专门的容器（有滚动条，不会撑破信息栏）');

  /** 幸存者界面不该有这一块 */
  const htmlS = draw(buildSnapshot(st, 's'));
  ok(!htmlS.includes('本大回合战报'), '**幸存者界面没有这块**');

  /**
   * ⚠ 用户后来要求：**「获得的信息」那一栏去掉** ——
   * 那些信息（感知/追蹤…）本来就都会写进战报，现在这块战报里已经有了。
   */
  ok(!htmlK.includes('获得的信息'), '**「获得的信息」那一栏已经去掉了**');
  ok(!htmlK.includes('本回合还没有获得信息'), '那栏的占位文案也没了');
  /** 就算服务端还挂着 intel 数据，界面也不该再画那一栏 */
  st.killerIntel = [
    { title: '感知（猎手本能 / 君臨天下）', lines: ['地点：R1接待处', '看到 1 名幸存者：安娜·库布里克'] },
  ];
  const htmlIntel = draw(buildSnapshot(st, 'h'));
  ok(!htmlIntel.includes('获得的信息'), '挂上 intel 数据后也不画那一栏');
  ok(htmlIntel.includes('本大回合战报'), '战报那块还在（这才是这块信息栏现在唯一的内容）');
}

console.log(`\n杀手界面·本大回合战报：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
