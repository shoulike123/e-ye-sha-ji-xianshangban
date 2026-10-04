/**
 * **雕像「重整旗鼓」的完整流程**（用户报的两处缺失）。
 *
 * 卡面：抽 1 张牌；「你**可以**切换主雕像。一旦切换，就必须把一个封堵标记
 * 移到另一扇没被封堵的门。」
 *
 * 用户报的：
 *  ① 「没有不切换的选项」 —— 以前只有"选一尊 → 确认"，没有"不切换"这条路；
 *  ② 「场上有封堵标记没有移动封堵的步骤」 —— 服务端 `pickMoveBlockade` /
 *     `placeMovedBlockade` 都实现了，但**快照没下发"正在搬封堵"的状态**，
 *     客户端根本不知道要画这一步。
 *
 * 规则（用户确认）：
 *  - 「不切换 = 重整旗鼓到此结束，只留抽的那 1 张牌，不需要移封堵」；
 *  - 被移的封堵「**任意一扇没被封堵的门，但不能是原处**」。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`（最后一段要 SSR）。
 *
 * 跑法：node scripts/tests/statue-rally-flow.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { resolveRally } from '../../server/dist/game/statues.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mkStatue() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer6';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  /** 开局准备：主雕像选定（否则本局不能改） */
  st.statueMainLocked = true;
  st.pendingStatueSwitch = null;
  return st;
}
const doorKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

console.log('=== ① 不切换：重整旗鼓直接结束，只留抽的那张牌 ===');
{
  const st = mkStatue();
  const handBefore = st.killerHand.length;
  resolveRally(st);
  console.log(`  打出重整旗鼓：pendingStatueRally=${st.pendingStatueRally}，` +
    `手牌 ${handBefore} → ${st.killerHand.length}`);
  ok(st.pendingStatueRally === true, '进入"可以切换主雕像"这一步');
  ok(st.killerHand.length === handBefore + 1, '**抽到的 1 张留着**');

  const err = tryIt(st, { type: 'skipStatueRallySwitch' });
  ok(!err, '**能选"不切换"**', String(err ?? ''));
  ok(st.pendingStatueRally === false, '重整旗鼓结束');
  ok(st.pendingStatueRallyMoveBlockade === false, '**不需要移封堵**');
}

console.log('=== ② 切换主雕像：场上有封堵 → 进入"移动封堵"这一步 ===');
{
  const st = mkStatue();
  /** 放一个封堵（随便一扇白门） */
  const edge = st.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  const blockedDoor = doorKey(edge.from, edge.to);
  st.blockades = [blockedDoor];

  resolveRally(st);
  const statues = Object.values(st.players).filter((x) => x.statueIndex != null);
  const main = statues.find((x) => x.id === st.killerId);
  const other = statues.find((x) => x.id !== st.killerId);
  console.log(`  主雕像=${main?.statueIndex}号，准备切到 ${other?.statueIndex}号`);

  ok(!tryIt(st, { type: 'pickMainStatue', statueId: other.id }), '选中另一尊');
  ok(!tryIt(st, { type: 'confirmMainStatue' }), '确认切换');
  console.log(`  切换后：pendingStatueRallyMoveBlockade=${st.pendingStatueRallyMoveBlockade}`);
  ok(st.pendingStatueRallyMoveBlockade === true,
    '**进入"请选择场上的一个封堵标记来移动"**', String(st.pendingStatueRallyMoveBlockade));

  /** 快照必须下发这一步，否则界面画不出来 */
  const snap = buildSnapshot(st, 'h');
  ok(snap.pendingStatueRallyMoveBlockade === true,
    '**快照里带着"正在搬封堵"**（客户端才画得出）',
    String(snap.pendingStatueRallyMoveBlockade));

  /** 选源 → 选目标门 */
  ok(!tryIt(st, { type: 'pickMoveBlockade', doorId: blockedDoor }), '选中要搬的封堵');
  const snap2 = buildSnapshot(st, 'h');
  ok(snap2.pendingStatueMovedBlockadeFrom === blockedDoor,
    '快照里带着"已选中的那扇门"', String(snap2.pendingStatueMovedBlockadeFrom));

  /** 找一扇没被封堵的白门当目标 */
  const target = (st.map.edges ?? [])
    .filter((e) => !e.pathType || e.pathType === 'door')
    .map((e) => doorKey(e.from, e.to))
    .find((k) => k !== blockedDoor && !(st.blockades ?? []).includes(k));
  const err = tryIt(st, { type: 'placeMovedBlockade', toDoorId: target });
  console.log(`  搬到 ${target} → ${err ?? 'OK'}；封堵=${JSON.stringify(st.blockades)}`);
  ok(!err, '**封堵搬过去了**', String(err ?? ''));
  ok((st.blockades ?? []).includes(target) && !(st.blockades ?? []).includes(blockedDoor),
    '旧的那扇没了、新的那扇有了', JSON.stringify(st.blockades));
  ok(st.pendingStatueRallyMoveBlockade === false && st.pendingStatueRally === false,
    '这一步收掉了');
}

console.log('=== ③ 被移的封堵：不能是原处 ===');
{
  const st = mkStatue();
  const edge = st.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  const blockedDoor = doorKey(edge.from, edge.to);
  st.blockades = [blockedDoor];
  st.pendingStatueRallyMoveBlockade = true;
  tryIt(st, { type: 'pickMoveBlockade', doorId: blockedDoor });
  const err = tryIt(st, { type: 'placeMovedBlockade', toDoorId: blockedDoor });
  console.log(`  放回原处 → ${err}`);
  ok(err != null && /原处/.test(err), '**不能移回原处**', String(err));
}

console.log('=== ④ 没有"正在搬封堵"时，那两条动作会被拒（不能随便搬） ===');
{
  const st = mkStatue();
  const edge = st.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  const blockedDoor = doorKey(edge.from, edge.to);
  st.blockades = [blockedDoor];
  st.pendingStatueRallyMoveBlockade = false;
  const e1 = tryIt(st, { type: 'pickMoveBlockade', doorId: blockedDoor });
  ok(e1 != null && /重整旗鼓/.test(e1), '不在这一步时 `pickMoveBlockade` 被拒', String(e1));
}

console.log('=== ⑤ 界面上真的有这两块（不切换按钮 + 移动封堵面板） ===');
{
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

  /** ⑤-1 "不切换"按钮 */
  const st = mkStatue();
  resolveRally(st);
  const html = draw(buildSnapshot(st, 'h'));
  ok(html.includes('不切换'), '**面板上有「不切换」按钮**');

  /** ⑤-2 移动封堵面板 */
  const st2 = mkStatue();
  const edge = st2.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  const blockedDoor = doorKey(edge.from, edge.to);
  st2.blockades = [blockedDoor];
  resolveRally(st2);
  const other = Object.values(st2.players).find((x) => x.statueIndex != null && x.id !== st2.killerId);
  tryIt(st2, { type: 'pickMainStatue', statueId: other.id });
  tryIt(st2, { type: 'confirmMainStatue' });
  const html2 = draw(buildSnapshot(st2, 'h'));
  console.log(`  移动封堵面板 HTML 长度=${html2.length}`);
  ok(html2.includes('移走'), '**列出了一扇可移走的封堵**');
  ok(/必须把一个封堵标记移到/.test(html2), '写清了规则');

  /** 选了源之后 → 列出可放的门 */
  tryIt(st2, { type: 'pickMoveBlockade', doorId: blockedDoor });
  const html3 = draw(buildSnapshot(st2, 'h'));
  ok(html3.includes('放到'), '**选了源之后列出"可以放的门"**');
  ok(!html3.includes(`放到 ${blockedDoor.split('|').reverse().join('|')}`) ||
    !html3.includes('放到 ' + blockedDoor), '原处那扇不在候选里');
}

console.log(`\n雕像重整旗鼓：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
