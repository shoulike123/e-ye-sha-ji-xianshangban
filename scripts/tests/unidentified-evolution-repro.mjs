/**
 * 诊断：**未命名（killer7）进化流程**到底卡在哪一步。
 *
 * 用户报的两张截图：
 *  - 图一：手牌超上限要弃牌 + 未命名选进化牌，**卡死**
 *  - 图二：确认新效果之前先做了坍塌结算（顺序不对）
 *
 * 本脚本把"升级 → 该做的选择 → 确认 → 结算"整条链走一遍，
 * 每一步都打印**待办字段**和"哪些动作会被拒"，用来定位互锁。
 *
 * 跑法：node scripts/tests/unidentified-evolution-repro.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';

function mkSolo(mapId = 'cabin') {
  const st = createLobby('T', HOST, 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer7';           // 未命名
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const PENDING = [
  'pendingEvolutionAck', 'pendingEvolutionCardPick', 'pendingUnlockChoice',
  'pendingUnlockDiscard', 'pendingKillerDiscards', 'pendingStatueEvoSwitch',
  'pendingQueenSpawnRooms', 'pendingCollapse', 'pendingCollapseAfterEvolution',
  'pendingCollapseMoves',
];

function dump(st, tag) {
  console.log(`\n──── ${tag} ────`);
  console.log(`  killerLevel=${st.killerLevel} phase=${st.phase} hand=${st.killerHand.length} ` +
    `(max=${st.rules.killerHandMax})`);
  for (const f of PENDING) {
    const v = st[f];
    if (v === null || v === undefined || v === false || v === 0) continue;
    console.log(`  ${f} = ${typeof v === 'object' ? JSON.stringify(v).slice(0, 140) : v}`);
  }
  console.log(`  手牌：${st.killerHand.map((c) => st.cardById[c]?.name ?? c).join('、')}`);
}

const tryIt = (st, action, who = HOST) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return e.message; }
};

/* ═══════ ③ 复刻用户那局：手牌满 5 张，未命名 1 → 3 级 ═══════ */
console.log('\n\n══════════ ③ 手牌满 5 张，未命名连升到 3 级（复刻截图状态） ══════════');
{
  const st = mkSolo('cabin');
  const { runUpgrade } = await import('../../server/dist/game/evolution.js');
  /** 塞满 5 张手牌（用户截图里是 5 张） */
  st.killerHand = ['un_infrared_1', 'un_crawl_1', 'un_passage_1', 'un_passage_2', 'un_infrared_2'];
  console.log(`  手牌 5 张：${st.killerHand.map((c) => st.cardById[c]?.name ?? c).join('、')}`);

  /** —— 升到 2 级 —— */
  runUpgrade(st);
  dump(st, '升到 2 级（等确认）');
  const pool2 = st.pendingEvolutionCardPick ?? [];
  console.log(`  选进化牌「${st.cardById[pool2[0]]?.name}」 → ${tryIt(st, { type: 'pickEvolutionCard', cardId: pool2[0] }) ?? 'OK'}`);
  console.log(`  确认新效果 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  dump(st, '2 级确认之后');

  /** —— 升到 3 级（这一步会出现【刺耳噪声】/【酸液喷吐】二选一）—— */
  runUpgrade(st);
  dump(st, '升到 3 级（等确认）');

  /** 先试"直接确认"，看会不会被拦 */
  console.log(`  直接点确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  const unlockPool = st.pendingUnlockChoice ?? [];
  console.log(`  解锁候选：${unlockPool.map((id) => st.cardById[id]?.name ?? id).join('、')}`);
  if (unlockPool.length) {
    console.log(`  选「${st.cardById[unlockPool[0]]?.name}」 → ${tryIt(st, { type: 'pickUnlockChoice', cardId: unlockPool[0] }) ?? 'OK'}`);
  }
  dump(st, '选完解锁牌');

  /** 现在应该"能确认"了 —— 确认会触发力量/入手/弃牌 */
  console.log(`  确认新效果 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  dump(st, '3 级确认之后');

  /** 需要弃牌时，能不能弃、弃完能不能收尾 */
  if (st.pendingKillerDiscards > 0) {
    const cands = st.killerHand.filter((c) => !(st.justUnlockedCards ?? []).includes(c));
    console.log(`  需要弃 ${st.pendingKillerDiscards} 张；可弃：${cands.map((c) => st.cardById[c]?.name ?? c).join('、')}`);
    for (const c of cands.slice(0, st.pendingKillerDiscards)) {
      console.log(`    弃「${st.cardById[c]?.name}」 → ${tryIt(st, { type: 'discardKillerCard', cardId: c }) ?? 'OK'}`);
    }
    dump(st, '弃完之后');
  }
  const snap = buildSnapshot(st, HOST);
  console.log(`  快照：handCount=${snap.killerHandCount} pendingKillerDiscards=${snap.pendingKillerDiscards} ` +
    `pendingUnlockChoice=${JSON.stringify(snap.pendingUnlockChoice?.map((c) => c.name))} ` +
    `pendingEvolutionAck=${JSON.stringify(snap.pendingEvolutionAck)}`);
}

/* ═══════ ④ 小屋（无坍塌）：升级到 2 级 → 选进化牌 → 确认 ═══════ */
console.log('══════════ ① 小屋地图（没有坍塌），未命名升到 2 级 ══════════');
{
  const st = mkSolo('cabin');
  const k = st.players[st.killerId];
  const { runUpgrade } = await import('../../server/dist/game/evolution.js');
  runUpgrade(st);            // 直接推一级，跳过摸牌
  dump(st, '升级后（还没确认）');

  const pickPool = st.pendingEvolutionCardPick ?? [];
  console.log(`  可选的进化牌：${pickPool.map((id) => st.cardById[id]?.name ?? id).join('、')}`);
  if (pickPool.length) {
    console.log(`  选第 1 张「${st.cardById[pickPool[0]]?.name}」 → ${tryIt(st, { type: 'pickEvolutionCard', cardId: pickPool[0] }) ?? 'OK'}`);
  }
  dump(st, '选完进化牌');

  console.log(`  确认新效果 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  dump(st, '确认之后');

  /** 如果这时要弃牌，看看"能不能弃"以及"弃完能不能继续" */
  if (st.pendingKillerDiscards > 0) {
    const card = st.killerHand.find((c) => !(st.justUnlockedCards ?? []).includes(c));
    console.log(`  需要弃 ${st.pendingKillerDiscards} 张，试着弃「${st.cardById[card]?.name}」`);
    console.log(`    弃牌 → ${tryIt(st, { type: 'discardKillerCard', cardId: card }) ?? 'OK'}`);
    dump(st, '弃完一张之后');
  }
  void k;
}

/* ═══════ ② 墓穴（有坍塌）：确认效果 vs 坍塌的先后 ═══════ */
console.log('\n\n══════════ ② 墓穴地图（有坍塌），未命名升到 2 级 ══════════');
{
  const st = mkSolo('crypt');
  const { runUpgrade } = await import('../../server/dist/game/evolution.js');
  /**
   * 墓穴的坍塌在"进化的拦截"里触发（`interceptEvolutionForCollapse`），
   * 它由 engine 的 `setUpgradeHandler` 在调完 `runUpgrade` 之后执行。
   * 这里走**正常入口**：直接调 engine 暴露的升级入口不方便，
   * 所以用"杀手摸牌到升级"那条路太绕 —— 改用 setUpgradeHandler 的同一套顺序：
   * 先 runUpgrade（会被拦下、挂 pendingCollapse），再看 engine 有没有结算。
   */
  runUpgrade(st);
  dump(st, '第一次 runUpgrade 之后（engine 的 handler 不在这里，所以 pendingCollapse 会挂着）');
  console.log('  说明：真实对局里 engine 的 setUpgradeHandler 会紧接着结算坍塌。');
  console.log('  这一步用来确认"坍塌是在确认效果之前发生的"（用户认为顺序错了）。');
}
