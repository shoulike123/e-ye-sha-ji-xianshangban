/**
 * **2对3 里杀手特性 08「压抑怒火」的执行流程**（实测）。
 *
 * 卡面（`content/traits.json`）：游戏开始时你没有起始手牌并 -1 力量；
 * **当你升级到等级 3 时，立刻升级到等级 4**。
 *
 * 2对3 的特殊之处：两名杀手**共用队伍等级**（`state.killerLevel`），
 * 但每一段流程要**各自进行**（确认 → 坍塌 → 特性 → 效果，先手做完才切给后手）。
 * 所以 08 有三个必须实测的情形：
 *   (a) 只有**先手**持 08
 *   (b) 只有**后手**持 08
 *   (c) 两人都持 08（只能跳一次，不能连跳到 5 级）
 *
 * 跑法：node scripts/tests/evolution-trait08-2v3.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
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

/** 2对3：屠夫(killer1，先手) + 狼人(killer5，3 级 +1 力量，后手)；豪宅图（无坍塌，聚焦 08） */
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
  st.phase = 'killerMain';
  st.traits = { ...(st.traits ?? {}), ...traitsFor };
  return st;
}

const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/**
 * 把进化流程推到"没人再等确认"为止，记录每一步是谁确认的、当时几级。
 * @returns {{steps: Array<{who: string, level: number, err: string|null}>, guardHit: boolean}}
 */
function drainEvolution(st, maxSteps = 12) {
  const steps = [];
  let guard = 0;
  while (st.pendingEvolutionAck && guard < maxSteps) {
    guard += 1;
    const who = st.killerId;
    const levelBefore = st.killerLevel;
    const err = tryIt(st, st.players[who].controllerId, { type: 'ackEvolution' });
    steps.push({ who, levelBefore, level: st.killerLevel, err });
    if (err) break;
  }
  return { steps, guardHit: Boolean(st.pendingEvolutionAck) && guard >= maxSteps };
}

const nameOf = (st, id) => `${st.players[id]?.name ?? id}(${st.players[id]?.characterId ?? '?'})`;

/** 把队伍等级先提到 2，再触发一次升级（→ 3 级，08 的触发点） */
function upTo3(st) {
  st.killerLevel = 2;
  for (const id of st.killerIds) if (st.killers[id]) st.killers[id].level = 2;
  upgradeKiller(st);
  return st;
}

/* ═══════════ (a) 只有先手持 08 ═══════════ */
console.log('=== (a) 只有先手（屠夫）持 08：升到 3 级应立刻跳到 4 级 ===');
{
  const st = mk({ k1: ['trait_k08'] });
  const [first, second] = st.killerIds;
  console.log(`   先手 ${nameOf(st, first)} 持 08 / 后手 ${nameOf(st, second)} 不持`);
  upTo3(st);
  console.log(`   触发升级后：等级=${st.killerLevel}，待确认者=${st.killerId}，` +
    `killerIds=${JSON.stringify(st.pendingEvolutionAck?.killerIds)}`);
  const { steps } = drainEvolution(st);
  for (const s of steps) {
    console.log(`     确认者 ${nameOf(st, s.who)}（${s.levelBefore} 级）→ ${s.err ?? 'OK'}；之后等级=${s.level}`);
  }
  ok(st.killerLevel === 4,
    '**先手的 08 也把队伍从 3 级顶到了 4 级**（任一人持 08 都该跳）',
    `等级=${st.killerLevel}`);
  ok(steps.filter((s) => s.levelBefore === 3).length === 2,
    '3 级那一轮：**两名杀手各自确认了一次**',
    `3 级确认次数=${steps.filter((s) => s.levelBefore === 3).length}`);
  ok(steps.filter((s) => s.levelBefore === 4).length === 2,
    '4 级那一轮：**两名杀手也各自确认了一次**（不是只走一个人）',
    `4 级确认次数=${steps.filter((s) => s.levelBefore === 4).length}`);
  /**
   * ⚠ 用户口径：「先手持 08，则是 **k1，k2，k1，k2**」——
   * 也就是 4 级那一轮也要**从先手开始**，不能因为"是后手触发的跳级"就反过来。
   */
  ok(steps.map((s) => s.who).join(',') === `${first},${second},${first},${second}`,
    '**确认顺序 = k1, k2, k1, k2（每一轮都从先手开始）**',
    steps.map((s) => `${s.who}@${s.levelBefore}`).join(' → '));
  ok(!st.pendingEvolutionAck, '整条流程收尾');
}

/* ═══════════ (b) 只有后手持 08 ═══════════ */
console.log('=== (b) 只有后手（狼人）持 08：同样应跳到 4 级 ===');
{
  const st = mk({ k2: ['trait_k08'] });
  const [first, second] = st.killerIds;
  console.log(`   先手 ${nameOf(st, first)} 不持 / 后手 ${nameOf(st, second)} 持 08`);
  upTo3(st);
  const { steps } = drainEvolution(st);
  for (const s of steps) {
    console.log(`     确认者 ${nameOf(st, s.who)}（${s.levelBefore} 级）→ ${s.err ?? 'OK'}；之后等级=${s.level}`);
  }
  ok(st.killerLevel === 4, '队伍顶到 4 级', `等级=${st.killerLevel}`);
  ok(steps.filter((s) => s.levelBefore === 3).length === 2, '3 级那一轮两人各自确认');
  ok(steps.filter((s) => s.levelBefore === 4).length === 2, '4 级那一轮两人也各自确认');
  ok(!st.pendingEvolutionAck, '整条流程收尾');
}

/* ═══════════ (c) 两人都持 08 ═══════════ */
console.log('=== (c) 两人都持 08：只跳一次，不能连跳到 5 级 ===');
{
  const st = mk({ k1: ['trait_k08'], k2: ['trait_k08'] });
  upTo3(st);
  const { steps } = drainEvolution(st, 20);
  for (const s of steps) {
    console.log(`     确认者 ${nameOf(st, s.who)}（${s.levelBefore} 级）→ ${s.err ?? 'OK'}；之后等级=${s.level}`);
  }
  ok(st.killerLevel === 4, '**停在 4 级**（08 只在 3 级触发一次）', `等级=${st.killerLevel}`);
  ok(!st.pendingEvolutionAck, '整条流程收尾（没有无限确认）');
}

console.log(`\n2对3 特性 08：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
