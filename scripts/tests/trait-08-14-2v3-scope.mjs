/**
 * **2对3：特性 08 / 14（以及 09）里"哪些是共同的、哪些只对持有者有效"**。
 *
 * 用户口径：
 *   「注意**只有进化是共同的**（由于 2v3 规则，两个杀手一同进化），
 *     **08、14 的其他效果只对持有者有效**。」
 *
 * 也就是分成两类：
 *   共同（= 进化本身，因为队伍等级是共享的）
 *     · 队伍等级一起涨 / 一起跳级（08 的「升到 3 级立刻升到 4 级」）
 *     · 14 的「开局等级 2」把**队伍**推到 2 级
 *   只对持有者有效
 *     · 08 的「游戏开始时没有起始手牌并 -1 力量」
 *     · 14 的「跳过**你自己**的第一个回合」
 *     · 09 的「每次升级 +1 力量」（也是特性，不是进化本身）
 *
 * ⚠ 读值方式：2v3 里顶层字段是"当前切到的那名杀手"的镜像，**切片只在下一次
 * 切换时才被动同步** —— 所以一律"先 `switchActiveKiller` 切过去、再读顶层"，
 * 读切片会读到旧值（这一点本身不是 bug，顶层才是权威）。
 *
 * 跑法：node scripts/tests/trait-08-14-2v3-scope.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, applyVariant1Setup, handleAction,
  switchActiveKiller, syncActiveKiller,
} from '../../server/dist/game/engine.js';
const { upgradeKiller } = await import('../../server/dist/game/effects.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 2对3：屠夫 k1（起始力量 5，先手）+ 狼人 k2（起始力量 6，后手） */
function mk(traitsFor) {
  const st = createLobby('T', 'k1', 'K1', content, 'cabin');
  st.mode = '2v3';
  st.variant1 = true;
  const map = { k1: st.players.k1 };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players.k1.faction = 'killer';
  st.players.k1.characterId = 'killer1';
  st.players.k2.faction = 'killer';
  st.players.k2.characterId = 'killer5';
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  st.players.k1.orderPick = 'first';
  st.players.k2.orderPick = 'second';
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.traitPickerIds = [];
  st.phase = 'upkeep';
  st.traits = { ...(st.traits ?? {}), ...traitsFor };
  return st;
}

/** 切到某个杀手 → 执行 fn（读/改顶层）→ 把顶层写回切片 */
function withKiller(st, id, fn) {
  switchActiveKiller(st, id);
  const r = fn();
  syncActiveKiller(st);
  return r;
}
const handOf = (st, id) => withKiller(st, id, () => [...st.killerHand]);
const powerOf = (st, id) => withKiller(st, id, () => st.killerPower);
const setPower = (st, id, v) => withKiller(st, id, () => { st.killerPower = v; });

/** 把进化面板推完（谁该确认由 `st.killerId` 决定） */
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
function drainEvolution(st, maxSteps = 10) {
  const seq = [];
  let guard = 0;
  while (st.pendingEvolutionAck && guard < maxSteps) {
    guard += 1;
    const who = st.killerId;
    const levelBefore = st.killerLevel;
    const err = tryIt(st, st.players[who].controllerId, { type: 'ackEvolution' });
    seq.push(`${who}@${levelBefore}级`);
    if (err) break;
  }
  return seq;
}

/* ═══════════ ① 08 的开局效果：只对持有者 ═══════════ */
console.log('=== ① 08「没有起始手牌并 -1 力量」只对持有者有效 ===');
{
  const st = mk({ k1: ['trait_k08'] });
  const [first, second] = st.killerIds;
  const h1 = handOf(st, first);
  const h2 = handOf(st, second);
  const p1 = powerOf(st, first);
  const p2 = powerOf(st, second);
  console.log(`   开局手牌：${first} ${h1.length} 张 / ${second} ${h2.length} 张`);

  applyVariant1Setup(st);

  const h1After = handOf(st, first);
  const h2After = handOf(st, second);
  const p1After = powerOf(st, first);
  const p2After = powerOf(st, second);
  console.log(`   结算后：${first} 手牌 ${h1After.length} 张、力量 ${p1} → ${p1After}；` +
    `${second} 手牌 ${h2After.length} 张、力量 ${p2} → ${p2After}`);
  ok(h1.length > 0, '前提：持有者本来有起始手牌', `${h1.length} 张`);
  ok(h1After.length === 0, '**持有者：起始手牌被全部弃掉**');
  ok(p1After === p1 - 1, '**持有者：力量 -1**', `${p1} → ${p1After}`);
  ok(h2After.length === h2.length,
    '**队友的手牌一张没动**（08 不是"两家一起弃"）', `${h2.length} → ${h2After.length}`);
  ok(p2After === p2, '**队友的力量也没变**', `${p2} → ${p2After}`);
  ok(st.killerLevel === 1, '08 的开局效果**不碰等级**（等级留到 3 级那次跳级）', String(st.killerLevel));
}

/* ═══════════ ② 14 的开局效果：只对持有者 ═══════════ */
console.log('=== ② 14「跳过你自己的第一个回合」只登记持有者 ===');
{
  const st = mk({ k2: ['trait_k14'] });
  const [first, second] = st.killerIds;
  const h1 = handOf(st, first);
  const h2 = handOf(st, second);
  const p1 = powerOf(st, first);
  const p2 = powerOf(st, second);

  applyVariant1Setup(st);

  ok(!(st.killerSkipFirstTurn ?? []).includes(first), '队友**不跳过**自己的回合');
  ok((st.killerSkipFirstTurn ?? []).includes(second), '**持有者登记"跳过自己的第一个回合"**',
    JSON.stringify(st.killerSkipFirstTurn));
  ok(handOf(st, first).length === h1.length && handOf(st, second).length === h2.length,
    '14 **不动任何人的手牌**',
    `${h1.length}/${h2.length} → ${handOf(st, first).length}/${handOf(st, second).length}`);
  ok(powerOf(st, first) === p1 && powerOf(st, second) === p2, '14 **不动任何人的力量**');
}

/* ═══════════ ③ 08 的"升级"部分：共同（跳级是队伍级的） ═══════════ */
console.log('=== ③ 08「升到 3 级立刻升到 4 级」= 进化本身 → 共同生效 ===');
{
  const st = mk({ k1: ['trait_k08'] });
  const [first, second] = st.killerIds;
  setPower(st, first, 5);
  setPower(st, second, 6);
  /**
   * ⚠ 上面的读/写工具会 `switchActiveKiller`，那会把"当前行动的杀手"也带成最后切的人 ——
   * 这里恢复成**先手**（升级那一轮的确认顺序应当从先手开始）。
   */
  switchActiveKiller(st, first);
  st.killerLevel = 2;
  upgradeKiller(st);
  const seq = drainEvolution(st);
  console.log(`   确认顺序：${seq.join(' → ')}`);
  ok(st.killerLevel === 4,
    '**队伍等级 3 → 4（共同）**，两名杀手都走完了 4 级那一轮',
    String(st.killerLevel));
  ok(seq.join(',') === `${first}@3级,${second}@3级,${first}@4级,${second}@4级`,
    '**两轮都是先手 → 后手**（3 级两人 + 4 级两人）', seq.join(','));
  ok(powerOf(st, first) === 5,
    '屠夫：3 级 / 4 级都没有力量效果 → 不变（跳级本身不加力量）',
    `5 → ${powerOf(st, first)}`);
  ok(powerOf(st, second) === 7,
    '狼人：**自己的 3 级效果 +1 力量照常生效**（这是进化效果，不是 08 的）',
    `6 → ${powerOf(st, second)}`);
}

/* ═══════════ ④ 09「每次升级 +1 力量」：只对持有者 ═══════════ */
console.log('=== ④ 09「每次升级 +1 力量」只对持有者有效（顺便核对） ===');
{
  const st = mk({ k1: ['trait_k09'] });
  const [first, second] = st.killerIds;
  setPower(st, first, 5);
  setPower(st, second, 5);
  /** 恢复"当前行动杀手 = 先手"（见 ③ 的说明） */
  switchActiveKiller(st, first);
  st.killerLevel = 1;
  upgradeKiller(st);
  const seq = drainEvolution(st);
  console.log(`   确认顺序：${seq.join(' → ')}`);
  ok(seq.join(',') === `${first}@2级,${second}@2级`,
    '**顺序仍是先手 → 后手**（确认时等级已经是 2 级）', seq.join(','));
  ok(st.killerLevel === 2, '队伍升到 2 级（进化共同）', String(st.killerLevel));
  ok(powerOf(st, first) === 7,
    '**持有者：09 特性 +1 + 屠夫 2 级效果 +1 = +2**',
    `5 → ${powerOf(st, first)}`);
  ok(powerOf(st, second) === 5,
    '**队友没拿这张特性 → 力量不变**（狼人 2 级没有力量效果）',
    `5 → ${powerOf(st, second)}`);
}

console.log(`\n08 / 14 / 09 效果范围（2对3）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
