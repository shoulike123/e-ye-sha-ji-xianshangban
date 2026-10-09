/**
 * 定点验证：`discardKillerCard` 到底弃的是不是**指定的那张**（只读，不改游戏代码）。
 *
 * 由来：`duo-permission-probe-2.mjs` 第 ① 项里，
 *   杀手手牌 = `["butcher_chase_1"]`，指定弃 `butcher_chase_1`，
 *   结果**手牌没变**，而弃牌堆里多了一张 `butcher_mad`（那张不在手上）。
 *
 * ⚠⚠ **本脚本的方法无效，结论不可用**（2025 实测得出）：
 *   这里手动往 `st.killers[killerId].hand` 塞了一副固定手牌，
 *   但 `handleAction` 走完后引擎会把切片重建，读回来的 `hand` 跟塞进去的**毫无关系**
 *   （四条用例的"手牌（后）"都是随机的另外两张）。
 *   所以它**只能证明一件事**：四条都报 `手牌中没有此卡` ——
 *   说明引擎**确实会校验"这张牌在不在手上"**，这一点是好的。
 *
 *   "幸存者替杀手弃牌"那条权限问题由 `duo-permission-probe.mjs` /
 *   `duo-permission-probe-2.mjs` 证得（发的是**真实手牌里的牌**，动作被接受）。
 *
 * 跑法：node scripts/tests/duo-discard-probe.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();

function newDuo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  return st;
}

/** 用真实存在的屠夫卡 id 固定一副手牌，再指定弃其中一张 */
function fixedHandCase(label, hand, target, who) {
  const st = newDuo();
  st.pendingKillerDiscards = 1;
  st.killers[st.killerId].hand = [...hand];
  st.killerDiscard = [];
  const before = [...st.killers[st.killerId].hand];
  let err = null;
  try { handleAction(st, who, { type: 'discardKillerCard', cardId: target }, content); }
  catch (e) { err = e.message; }
  const after = st.killers[st.killerId].hand;
  const disc = st.killerDiscard ?? [];
  const correct = !after.includes(target) && disc.includes(target);
  console.log(`\n  【${label}】`);
  console.log(`     手牌（前）  ${JSON.stringify(before)}`);
  console.log(`     指定弃      ${target}`);
  console.log(`     手牌（后）  ${JSON.stringify(after)}`);
  console.log(`     杀手弃牌堆  ${JSON.stringify(disc)}`);
  console.log(`     待弃张数    ${st.pendingKillerDiscards}`);
  if (err) console.log(`     报错        ${err}`);
  console.log(`     → 弃的正是指定那张？ ${correct ? '是 ✓' : '**不是**'}`);
  return { correct, before, after, disc, target, err, who };
}

console.log('=== discardKillerCard：弃的是不是指定的那张 ===');

const r1 = fixedHandCase(
  '手牌 3 张，指定弃中间那张（杀手自己发）',
  ['butcher_sense_1', 'butcher_chase_1', 'butcher_mad'],
  'butcher_chase_1',
  'h',
);

const r2 = fixedHandCase(
  '手牌 3 张，指定弃最后那张（杀手自己发）',
  ['butcher_sense_1', 'butcher_chase_1', 'butcher_mad'],
  'butcher_mad',
  'h',
);

const r3 = fixedHandCase(
  '手牌 3 张，指定弃中间那张（**幸存者**发）',
  ['butcher_sense_1', 'butcher_chase_1', 'butcher_mad'],
  'butcher_chase_1',
  's',
);

const r4 = fixedHandCase(
  '指定一张**不在手上**的牌（butcher_rage）',
  ['butcher_sense_1', 'butcher_chase_1'],
  'butcher_rage',
  'h',
);

console.log('\n════════ 结论 ════════');
const all = [r1, r2, r3, r4];
for (const [i, r] of all.entries()) {
  const id = ['①手牌3张弃中间(杀手)', '②手牌3张弃最后(杀手)', '③手牌3张弃中间(幸存者)', '④弃不在手上的牌'][i];
  console.log(`  ${r.correct ? '✓ 正确' : '⚠ 有问题'}  ${id}   → 弃牌堆 ${JSON.stringify(r.disc)}`);
}
const bad = all.filter((r) => !r.correct && !r.err).length;
console.log(`\n  ${bad} 条「接受了动作但弃错了牌」。`);
