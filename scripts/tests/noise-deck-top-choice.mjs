/**
 * **实测：刺耳噪声（`un_noise`）的「你可以把这张牌放到你的牌库顶」到底能不能做。**
 *
 * 用户口径：「我记得我能做，你先实测一下」 ——
 * 所以这个脚本走**真实打牌流程**（不是摆 state），逐步验证：
 *   ① 打出手牌里的【刺耳噪声】→ 服务端挂出"可选效果"这一问
 *   ② 界面（SSR）里确实有那两块按钮（执行 / 跳过）
 *   ③ 选「执行」→ 这张牌进**摸牌堆顶**（下次摸牌第一张就是它）
 *   ④ 选「跳过」→ 这张牌进**弃牌堆**
 *   ⑤ 答完之后流程不卡住（杀手能继续做别的事）
 *
 * 跑法：node scripts/tests/noise-deck-top-choice.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 未命名（killer7）局；手里给一张【刺耳噪声】 */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  const k = st.players[st.killerId];
  k.roomId = 'R1';
  k.actionsLeft = 2;
  /** 幸存者都挪到杀手 3 格内（`addFearRange 3` 才有效果） */
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = 'B1';
  }
  st.encounter = null;
  st.killerHand = ['un_noise'];
  st.killerDeck = ['butcher_mad', 'butcher_stay'];
  st.killerDiscard = [];
  return st;
}
const tryIt = (st, action, socketId = 'h') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
let GameView = null;
try {
  ({ GameView } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 node scripts/tests/build-menu.mjs）');
  process.exit(1);
}
const draw = (snap) => renderToStaticMarkup(
  React.createElement(GameView, {
    state: snap, isHost: true, error: null, onAction: async () => {},
  }),
);

/* ═══════════ ① 打出手牌里的刺耳噪声 → 挂出"可选效果" ═══════════ */
console.log('=== ① 打出【刺耳噪声】 ===');
{
  const st = mk();
  const err = tryIt(st, { type: 'playKillerCard', cardId: 'un_noise' });
  ok(!err, '**能打出这张牌**', String(err ?? ''));
  console.log(`   hand=${JSON.stringify(st.killerHand)} deck=${JSON.stringify(st.killerDeck)} ` +
    `discard=${JSON.stringify(st.killerDiscard)}`);
  ok(!st.killerHand.includes('un_noise'), '它已经从手牌拿开');
  ok(!st.killerDiscard.includes('un_noise'), '**还没进弃牌堆**（等这一问的答复）',
    JSON.stringify(st.killerDiscard));
  ok(st.pendingDeckTopCard === 'un_noise', '服务端记着"待处理的牌"',
    String(st.pendingDeckTopCard));
  ok(Boolean(st.pendingOptionalEffect),
    '**挂出了"可选效果"这一问**', JSON.stringify(st.pendingOptionalEffect ?? null));
  ok(st.pendingOptionalEffect?.fx?.op === 'returnToDeckTop',
    '**挂出的是"放牌库顶"这条可选效果**',
    JSON.stringify(st.pendingOptionalEffect ?? null));
  console.log(`   这一问的 label = ${JSON.stringify(st.pendingOptionalEffect?.label ?? null)}`);
  /**
   * ⚠ `pendingReturnToDeckTop` 是**另一条（客户端没走的）老路**上的标记：
   * 正常打牌流程由"可选效果"接手，所以它保持 false。
   */
  console.log(`   （参考）pendingReturnToDeckTop = ${st.pendingReturnToDeckTop}`);
  /** 恐惧效果照常结算（〔驚嚇〕距离 3 内所有幸存者） */
  const feared = Object.values(st.players).filter((p) => p.faction === 'survivor' && (p.fear ?? 0) > 0);
  ok(feared.length > 0, '前面的〔驚嚇〕已经生效', `${feared.length} 人被惊吓`);

  /** 快照 + 界面 */
  const snap = buildSnapshot(st, 'h');
  ok(snap.pendingOptionalEffect != null, '快照里有 `pendingOptionalEffect`（界面靠它画按钮）');
  ok(snap.pendingDeckTopCard?.id === 'un_noise', '快照里带着"待处理的牌"',
    JSON.stringify(snap.pendingDeckTopCard ?? null));
  const html = draw(snap);
  ok(html.includes('可以执行，也可以跳过'), '**界面上有这一问的两块按钮**');
  ok(html.includes('执行') && html.includes('跳过'), '「执行 / 跳过」都在');
  /**
   * ⚠ 这一问是**针对某一张牌**的 → 要能看清是哪张牌：
   * 面板上要有那张牌的**卡面**和卡名（用户要求"要选牌的地方都要有卡面"）。
   */
  ok(html.includes('inline-card-art'), '**面板上画了那张牌的卡面**');
  ok(html.includes('「刺耳噪声」'), '也写了卡名');
}

/* ═══════════ ② 选「执行」→ 进摸牌堆顶 ═══════════ */
console.log('=== ② 选「执行」：放到摸牌堆顶 ===');
{
  const st = mk();
  tryIt(st, { type: 'playKillerCard', cardId: 'un_noise' });
  const deckBefore = [...st.killerDeck];
  const err = tryIt(st, { type: 'resolveOptionalEffect', use: true });
  ok(!err, '**能执行**', String(err ?? ''));
  ok(st.killerDeck[0] === 'un_noise',
    '**它成了摸牌堆顶第一张**', JSON.stringify(st.killerDeck.slice(0, 3)));
  ok(st.killerDeck.length === deckBefore.length + 1, '牌堆多了一张（没收进弃牌堆）',
    `${deckBefore.length} → ${st.killerDeck.length}`);
  ok(!st.killerDiscard.includes('un_noise'), '弃牌堆里没有它', JSON.stringify(st.killerDiscard));
  ok(!st.pendingDeckTopCard && !st.pendingOptionalEffect, '这一问收掉了',
    JSON.stringify({ card: st.pendingDeckTopCard, opt: st.pendingOptionalEffect }));
  console.log(`   战报：${st.logs.slice(-3).map((l) => l.text).join(' | ')}`);
}

/* ═══════════ ③ 选「跳过」→ 进弃牌堆 ═══════════ */
console.log('=== ③ 选「跳过」：进弃牌堆 ===');
{
  const st = mk();
  tryIt(st, { type: 'playKillerCard', cardId: 'un_noise' });
  const err = tryIt(st, { type: 'resolveOptionalEffect', use: false });
  ok(!err, '**能跳过**', String(err ?? ''));
  ok(st.killerDiscard.includes('un_noise'), '**它进了弃牌堆**', JSON.stringify(st.killerDiscard));
  ok(st.killerDeck[0] !== 'un_noise', '摸牌堆顶不是它', JSON.stringify(st.killerDeck.slice(0, 2)));
  ok(!st.pendingDeckTopCard, '这一问收掉了');
}

/* ═══════════ ④ 答完之后不卡住：还能继续做别的事 ═══════════ */
console.log('=== ④ 答完之后流程继续 ===');
{
  const st = mk();
  tryIt(st, { type: 'playKillerCard', cardId: 'un_noise' });
  tryIt(st, { type: 'resolveOptionalEffect', use: true });
  /** 快速阶段结束 → 进主要行动（动作名是 `advanceKillerStep`） */
  const err = tryIt(st, { type: 'advanceKillerStep' });
  ok(!err, '**能结束快速阶段**（没被这一问卡死）', String(err ?? ''));
  console.log(`   phase=${st.phase} step=${st.killerTurnStep} choice=${st.killerMainChoice}`);
  ok(st.killerTurnStep === 'main' || st.phase === 'killerMain', '进到主要行动阶段',
    `${st.phase}/${st.killerTurnStep}`);
}

/* ═══════════ ⑤ 另一条老路（`resolveDeckTop`）也还能用 ═══════════ */
console.log('=== ⑤ 服务端另有一个 `resolveDeckTop` 动作（客户端没用到）===');
{
  const st = mk();
  tryIt(st, { type: 'playKillerCard', cardId: 'un_noise' });
  const err = tryIt(st, { type: 'resolveDeckTop', toDeckTop: true });
  ok(!err, '直接发 `resolveDeckTop` 也能结算', String(err ?? ''));
  ok(st.killerDeck[0] === 'un_noise', '照样能放到摸牌堆顶', JSON.stringify(st.killerDeck.slice(0, 2)));
  console.log('   说明：界面走的是 `resolveOptionalEffect`；`resolveDeckTop` 是并存的另一条路。');
}

console.log(`\n刺耳噪声·放牌库顶：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
