/**
 * **城堡的「操作控制杆放置机关大门」归类到额外行动弹窗**（用户要求）。
 *
 * 用户原话：「城堡操作机关大门放在额外行动里，不要单独列出来」
 *          「它出现在特殊行动区，我想归类于额外行动」
 *          「我想让它出现在左上角额外行动的集合里」
 *
 * 所以断言两件事：
 *  1. **默认渲染（不点任何按钮）时，行动区里完全没有这颗按钮** —— 不再单独占一行；
 *  2. 左上角「额外行动」弹窗展开后，它出现在里面。
 *
 * 弹窗是 `useState(false)`，SSR 点不了，所以用 `initialExtraOpen` 让它初始展开。
 *
 * 跑法：`npm run test:gateui`
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { readFileSync } from 'node:fs';
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

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const GATE_LABEL = '操作控制杆放置机关大门';

/** 一局 1 对 1（可选地图 / 幸存者起点） */
function mk(mapId = 'castle', roomId = 'R1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 摆到幸存者大回合 */
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = 0;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') {
      p.roomId = roomId;
      p.mainActionUsed = false;
    }
  }
  return st;
}

const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
const draw = (snap, initialExtraOpen = false) => renderToStaticMarkup(
  React.createElement(GameView, {
    state: snap,
    isHost: true,
    error: null,
    onAction: async () => {},
    initialExtraOpen,
  }),
);

/* ═══════════ ① 行动区里不再单独列出 ═══════════ */
console.log('=== ① 行动区：不再单独占一行 ===');
{
  const st = mk('castle', 'R1');
  const snap = buildSnapshot(st, 's');
  ok(snap.canPlaceLeverGate === true, '服务端仍然说"可以放机关大门"', String(snap.canPlaceLeverGate));

  const html = await draw(snap);
  ok(!html.includes(GATE_LABEL), '**默认界面（行动区）里没有这颗按钮**');
  ok(!html.includes('额外行动：操作控制杆'), '旧的"额外行动：操作控制杆…"那一行也消失了');
  /** 行动区里其它额外行动仍在（证明我们只是移走了这一颗） */
  ok(html.includes('额外行动'), '「额外行动」这个标题还在（其它额外行动不受影响）');
}

/* ═══════════ ② 左上角「额外行动」弹窗里有它 ═══════════ */
console.log('=== ② 左上角「额外行动」弹窗：出现在集合里 ===');
{
  const st = mk('castle', 'R1');
  const html = await draw(buildSnapshot(st, 's'), true);
  ok(html.includes('hud-overlay'), '弹窗渲染出来了');
  ok(html.includes(GATE_LABEL), '**弹窗里有「操作控制杆放置机关大门」**');
  ok(
    /<button[^>]*>[^<]*：操作控制杆放置机关大门/.test(html),
    '按弹窗的统一格式显示（"角色名：操作控制杆…"）',
    (html.match(/[^>]*：操作控制杆放置机关大门/) ?? [''])[0],
  );
}

/* ═══════════ ③ 条件不对时两边都不出现 ═══════════ */
console.log('=== ③ 条件不满足时，哪儿都没有 ===');
{
  /** 不在 R1 */
  const away = mk('castle', 'R2');
  ok(
    !(await draw(buildSnapshot(away, 's'), true)).includes(GATE_LABEL),
    '**人不在 R1 时不出现**',
  );

  /**
   * 一般行动已经用掉 —— ⚠ **照样要出现**（用户报的 bug）：
   * 「走到控制杆这里了，但是没有弹出额外行动」。
   * 额外行动不占一般行动，而"走到 R1"本身就是那次一般行动，
   * 所以 `mainActionUsed` 不能当门槛（狼人宝箱也没有这条）。
   */
  const used = mk('castle', 'R1');
  for (const p of Object.values(used.players)) if (p.faction === 'survivor') p.mainActionUsed = true;
  ok(
    (await draw(buildSnapshot(used, 's'), true)).includes(GATE_LABEL),
    '**用过一般行动后照样出现**（额外行动不占一般行动）',
  );

  /** 不是城堡 */
  const other = mk('mansion', 'R1');
  ok(
    !(await draw(buildSnapshot(other, 's'), true)).includes(GATE_LABEL),
    '别的地图不出现',
  );
}

/* ═══════════ ④ 选门提示（源码那一处不能一起删掉） ═══════════ */
console.log('=== ④ 「正在选门」的提示还在 ===');
{
  const src = readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(
    src.includes('放置机关大门（') && src.includes('）：先点一个地点'),
    '**地图上方有"正在选门"的提示**（还带上了是谁在操作）',
  );
  ok(src.includes('取消放置'), '提示里有「取消放置」按钮');
  /**
   * 行动区那段 extras 里**不该**再有入口 —— 用"旧写法"的出现次数兜底：
   * `state.canPlaceLeverGate` 现在只应该出现在提示/守卫相关的地方，
   * 不该再作为"往 extras 里 push 按钮"的条件。
   */
  const extrasPush = /if \(state\.canPlaceLeverGate\)\s*\{\s*extras\.push/.test(src);
  ok(!extrasPush, '行动区里已经没有"用 canPlaceLeverGate 往 extras 塞按钮"的代码');
  ok(
    src.includes("state.map.id === 'castle' && p.roomId === 'R1'"),
    '弹窗里的判定按**每个幸存者自己**算（共享控制模式下不会挂错人）',
  );
}

console.log(`\n机关大门归类：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
