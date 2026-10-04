/**
 * 验证【变体1】特性 08「压抑怒火」的连级流程（用户口径）：
 *
 *   「杀手在 3 级时，就**执行 3 级进化效果**，然后由于 08，**再确认 4 级进化效果**，
 *    再坍塌，再特性牌（此时等级 4 级，**不触发 08**），再执行进化效果。」
 *
 * 也就是要**完整走两轮**（每轮都：确认 → 坍塌 → 特性 → 进化效果）。
 *
 * 跑法：node scripts/tests/evolution-trait08-jump.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { runUpgrade, advanceEvolutionChoices } from '../../server/dist/game/evolution.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const st = createLobby('T', HOST, 'H', content, 'crypt');
st.mode = 'solo';
st.variant1 = true;
st.soloKillerCharacterId = 'killer7';            // 未命名（有进化卡/解锁二选一，顺带压流程）
st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
st.players[HOST].ready = true;
startGame(st, content, HOST);
st.pendingEvolutionAck = null;
st.pendingUnlockChoice = null;
st.pendingUnlockDiscard = false;
st.phase = 'killerMain';
st.killerTurnStep = 'fast';
st.killerMainChoice = null;
st.killerMainActionsLeft = 0;
st.traitById = Object.fromEntries((content.traits ?? []).map((t) => [t.id, t]));

const kid = st.killerId;
/** 挂上特性 08「压抑怒火」 */
st.traits = { [kid]: ['trait_k08'] };

const tryIt = (action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

/** 模拟 engine 的升级入口（坍塌被推迟时 handler 会补跑一次） */
function upgradeViaEnginePath() {
  runUpgrade(st);
  if (!st.pendingCollapseAfterEvolution) return;
  st.collapseConsumedForLevel = st.pendingCollapseLevel;
  runUpgrade(st);
  st.collapseConsumedForLevel = 0;
}

/**
 * 把**这一级剩下的流程走完**：做掉所有"要你选的东西"，然后让引擎结算。
 *
 * ⚠ 必须走真实操作（`pickEvolutionCard` / `pickUnlockChoice` / `ackEvolution`），
 * 因为"结算"是由 `advanceEvolutionAfterChoice` 在**最后一项选完**时触发的；
 * 只调 `advanceEvolutionChoices`（纯查询挂选项）不会推进结算。
 */
function finishCurrentLevel(st, tag) {
  let guard = 0;
  while (guard < 12) {
    guard += 1;
    const cardPick = st.pendingEvolutionCardPick;
    const unlock = st.pendingUnlockChoice;
    const statue = st.pendingStatueEvoSwitch;
    const queen = st.pendingQueenSpawnRooms;
    if (cardPick?.length) {
      const err = tryIt({ type: 'pickEvolutionCard', cardId: cardPick[0] });
      console.log(`    [${tag}] 选进化卡 → ${err ?? 'OK'}`);
      continue;
    }
    if (unlock?.length) {
      const err = tryIt({ type: 'pickUnlockChoice', cardId: unlock[0] });
      console.log(`    [${tag}] 选解锁牌 → ${err ?? 'OK'}`);
      continue;
    }
    if (statue) {
      const err = tryIt({ type: 'skipStatueEvoSwitch' });
      console.log(`    [${tag}] 跳过换主雕像 → ${err ?? 'OK'}`);
      continue;
    }
    if (queen) {
      const err = tryIt({ type: 'pickQueenSpawnRoom', roomId: st.map.rooms[0].id });
      console.log(`    [${tag}] 选丧尸地点 → ${err ?? 'OK'}`);
      if (!st.pendingQueenSpawnRooms) continue;
      tryIt({ type: 'pickQueenSpawnRoom', roomId: st.map.rooms[1].id });
      continue;
    }
    break;
  }
  /** 超限弃牌 */
  let g2 = 0;
  while (st.pendingKillerDiscards > 0 && g2 < 12) {
    g2 += 1;
    const card = st.killerHand.find((c) => !(st.justUnlockedCards ?? []).includes(c)) ?? st.killerHand[0];
    if (tryIt({ type: 'discardKillerCard', cardId: card })) break;
  }
}

console.log('=== ① 3 级：先执行 3 级效果，然后 08 才发起 4 级 ===');
{
  st.killerLevel = 2;
  upgradeViaEnginePath();
  console.log(`  升级后：level=${st.killerLevel} ack=${st.pendingEvolutionAck?.toLevel} ` +
    `collapseAfter=${st.pendingCollapseAfterEvolution}`);
  ok(st.pendingEvolutionAck?.toLevel === 3, '挂出的是 **3 级**确认面板', String(st.pendingEvolutionAck?.toLevel));

  const err = tryIt({ type: 'ackEvolution' });
  ok(!err, '确认 3 级', String(err ?? ''));
  const collapsed3 = (st.collapsedRooms ?? []).length;
  console.log(`  3 级确认后：level=${st.killerLevel} collapsed=${JSON.stringify(st.collapsedRooms)} ` +
    `ack=${st.pendingEvolutionAck?.toLevel}`);
  ok(collapsed3 > 0, '3 级这一轮**坍塌发生了**（第二轮前的那次）', String(collapsed3));

  finishCurrentLevel(st, '3级');
  console.log(`  3 级效果结算完之后：level=${st.killerLevel} ack=${st.pendingEvolutionAck?.toLevel} ` +
    `collapseAfter=${st.pendingCollapseAfterEvolution}`);
  ok(st.killerLevel === 4, '**3 级效果执行完，等级升到 4**', String(st.killerLevel));
  ok(st.pendingEvolutionAck?.toLevel === 4, '**由于 08，重新挂出 4 级确认面板**',
    String(st.pendingEvolutionAck?.toLevel));
  ok(st.pendingCollapseAfterEvolution === true, '**4 级这一轮也记了"确认后要坍塌"**（要完整走一遍）',
    String(st.pendingCollapseAfterEvolution));
}

console.log('=== ② 4 级：再确认 → 再坍塌 → 再特性（此时 4 级不再触发 08）→ 再效果 ===');
{
  const before = (st.collapsedRooms ?? []).length;
  const err = tryIt({ type: 'ackEvolution' });
  ok(!err, '确认 4 级', String(err ?? ''));
  const after = (st.collapsedRooms ?? []).length;
  console.log(`  collapsed ${before} → ${after}；level=${st.killerLevel} ` +
    `ack=${st.pendingEvolutionAck?.toLevel ?? 'null'}`);
  ok(after > before, '**4 级这一轮又坍塌了一次**', `${before} → ${after}`);
  finishCurrentLevel(st, '4级');
  console.log(`  4 级效果结算完：level=${st.killerLevel} ack=${st.pendingEvolutionAck ?? 'null'}`);
  ok(st.killerLevel === 4, '等级停在 4（**不再因为 08 继续跳**）', String(st.killerLevel));
  ok(st.pendingEvolutionAck == null, '4 级走完，不再挂着确认面板');
}

console.log('=== ③ 没有 08 时：3 级就是 3 级（不跳级） ===');
{
  const st2 = createLobby('T', HOST, 'H', content, 'crypt');
  st2.mode = 'solo';
  st2.variant1 = true;
  st2.soloKillerCharacterId = 'killer7';
  st2.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st2.players[HOST].ready = true;
  startGame(st2, content, HOST);
  st2.pendingEvolutionAck = null;
  st2.pendingUnlockChoice = null;
  st2.pendingUnlockDiscard = false;
  st2.phase = 'killerMain';
  st2.killerTurnStep = 'fast';
  st2.killerMainChoice = null;
  st2.killerMainActionsLeft = 0;
  st2.traits = { [st2.killerId]: [] };
  st2.killerLevel = 2;
  runUpgrade(st2);
  if (st2.pendingCollapseAfterEvolution) {
    st2.collapseConsumedForLevel = st2.pendingCollapseLevel;
    runUpgrade(st2);
    st2.collapseConsumedForLevel = 0;
  }
  tryIt({ type: 'ackEvolution' });
  /** 走完 3 级的选择 */
  let guard = 0;
  while (advanceEvolutionChoices(st2) && guard < 6) {
    guard += 1;
    if (st2.pendingEvolutionCardPick?.length)
      handleAction(st2, HOST, { type: 'pickEvolutionCard', cardId: st2.pendingEvolutionCardPick[0] }, content);
    else break;
  }
  console.log(`  level=${st2.killerLevel} ack=${st2.pendingEvolutionAck ?? 'null'}`);
  ok(st2.killerLevel === 3, '**没有 08 就不跳级**（停在 3 级）', String(st2.killerLevel));
}

console.log(`\n特性 08 连级：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
