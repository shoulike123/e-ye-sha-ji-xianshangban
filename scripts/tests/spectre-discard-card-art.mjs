/**
 * **幽魂 2 级 / 3 级的弃牌选择要显示卡面**（用户报过："弃牌时没有显示牌的图片"）。
 *
 *  - 2 级「呼啸而过之后」：弃 2 张手牌搜索当前房间（`pendingWhizSearch`）
 *  - 3 级「惊恐过度」：弃 3 张手牌造成 1 点伤害（`pendingOverFearWound`）
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/spectre-discard-card-art.mjs
 */
import { createRequire } from 'node:module';
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
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 幽魂（killer2）局 */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer2';
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
  st.players[st.killerId].actionsLeft = 2;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = 'B1';
  }
  st.encounter = null;
  st.killerLevel = 3;
  /** 手上给几张真牌（这样才有卡面可画） */
  const hand = Object.values(st.cardById)
    .filter((c) => c.type === 'killerAction' && c.owner === 'killer2')
    .slice(0, 4)
    .map((c) => c.id);
  st.killerHand = [...hand];
  return st;
}

let GameView = null;
try {
  ({ GameView } = await import('../../client/_ssrbuild/GameViews.js'));
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
/** 截取某段 html（从 a 到 b），用来单独检查"这块里有没有图" */
const slice = (html, from, to) => {
  const i = html.indexOf(from);
  if (i < 0) return '';
  const j = html.indexOf(to, i);
  return html.slice(i, j < 0 ? i + 4000 : j);
};

/* ═══════════ ① 2 级：呼啸而过之后的弃牌 ═══════════ */
console.log('=== ① 幽魂 2 级：弃 2 张搜索房间的选择要带卡面 ===');
{
  const st = mk();
  st.pendingWhizSearch = true;
  const snap = buildSnapshot(st, st.players[st.killerId].controllerId);
  ok(snap.pendingWhizSearch === true, '快照里挂着这一步');
  const html = draw(snap);
  ok(html.includes('呼啸而过之后'), '面板画出来了');
  const block = slice(html, '呼啸而过之后', '弃 2 张并搜索房间');
  ok(block.includes('inline-card-art'),
    '**这块里每张牌都有卡面（`inline-card-art`）**',
    block.includes('inline-card-art') ? '' : block.slice(0, 200));
  const hand = snap.yourKillerHand ?? [];
  const withArt = hand.filter((cid) => block.includes((snap.cardById?.[cid]?.name ?? cid).slice(0, 4)));
  ok(withArt.length === hand.length,
    '**手牌都列出来了**', `${withArt.length}/${hand.length}`);
  ok(block.includes('点击选中'), '写着可以点选');
}

/* ═══════════ ② 3 级：惊恐过度的弃牌 ═══════════ */
console.log('=== ② 幽魂 3 级：弃 3 张伤害的选择要带卡面 ===');
{
  const st = mk();
  const victim = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  st.pendingOverFearWound = { targetId: victim.id };
  const snap = buildSnapshot(st, st.players[st.killerId].controllerId);
  ok(Boolean(snap.pendingOverFearWound), '快照里挂着这一步');
  const html = draw(snap);
  ok(html.includes('惊恐过度'), '面板画出来了');
  const block = slice(html, '惊恐过度', '弃 3 张并伤害');
  ok(block.includes('inline-card-art'),
    '**这块里每张牌都有卡面**', block.includes('inline-card-art') ? '' : block.slice(0, 200));
}

/* ═══════════ ③ 卡面路径确实指向幽魂的行动牌图 ═══════════ */
console.log('=== ③ 用的是幽魂自己的卡面素材 ===');
{
  const st = mk();
  st.pendingWhizSearch = true;
  const snap = buildSnapshot(st, st.players[st.killerId].controllerId);
  const html = draw(snap);
  const block = slice(html, '呼啸而过之后', '弃 2 张并搜索房间');
  const srcs = [...block.matchAll(/src="([^"]+)"/g)].map((m) => decodeURI(m[1]));
  console.log(`   这一块里的图：${JSON.stringify(srcs.slice(0, 4))}`);
  ok(srcs.length >= (snap.yourKillerHand ?? []).length,
    '**每张手牌一张图**', `${srcs.length} 张图 / ${(snap.yourKillerHand ?? []).length} 张手牌`);
  ok(srcs.every((s) => /\.(png|jpg|webp)$/i.test(s)), '都是真实的图片路径', JSON.stringify(srcs));
  ok(srcs.every((s) => !s.includes('/Image/Killer/行动牌')), '不是占位图（走的是卡面素材表）');
}

console.log(`\n幽魂 2/3 级弃牌卡面：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
