/**
 * 验证【变体1】杀手"进化相关特性卡"的时机：
 *   确认进化效果 → 坍塌（墓穴才有）→ **进化相关的特性卡** → 执行进化效果
 *
 * 用 17「压迫威慑」（升级到 3/4/5 级时【惊吓】任意 1 名幸存者）当例子，
 * 因为它要玩家选目标，正好检验"流程会不会接着走"。
 *
 * 跑法：node scripts/tests/evolution-trait-stage.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { runUpgrade } from '../../server/dist/game/evolution.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkSolo(variant1, mapId = 'crypt') {
  const st = createLobby('T', HOST, 'H', content, mapId);
  st.mode = 'solo';
  st.variant1 = variant1;
  st.soloKillerCharacterId = 'killer7';
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

/**
 * 摆到**杀手回合**：升级本来就发生在杀手摸牌时，
 * 而 17 那种"选目标"的特性要求"在自己的回合发动"。
 */
function toKillerTurn(st) {
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
}

/** 模拟 engine 的升级入口（runUpgrade 被坍塌拦下时补跑一次） */
function upgradeViaEnginePath(st) {
  runUpgrade(st);
  if (!st.pendingCollapseAfterEvolution) return;
  st.collapseConsumedForLevel = st.pendingCollapseLevel;
  runUpgrade(st);
  st.collapseConsumedForLevel = 0;
}

console.log('=== ① 没开变体1：确认之后不该有特性作业 ===');
{
  const st = mkSolo(false);
  toKillerTurn(st);
  st.killerLevel = 2;
  upgradeViaEnginePath(st);
  ok(st.pendingEvolutionAck != null, '挂了待确认进化');
  console.log(`  确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  ok(st.pendingTraitVictim == null, '没开变体1时没有「压迫威慑」作业');
}

console.log('=== ② 开了变体1 + 特性17：特性作业排在坍塌之后 ===');
{
  const st = mkSolo(true);
  const kid = st.killerId;
  st.traits = { ...(st.traits ?? {}), [kid]: ['trait_k17'] };
  toKillerTurn(st);
  st.killerLevel = 2;
  upgradeViaEnginePath(st);
  ok(st.pendingCollapseAfterEvolution === true, '确认之前只记了要坍塌');
  ok(st.pendingTraitVictim == null, '确认之前没有特性作业');

  console.log(`  确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  console.log(`    [调试] collapsed=${JSON.stringify(st.collapsedRooms)} ` +
    `traitVictim=${JSON.stringify(st.pendingTraitVictim)} ` +
    `cardPick=${JSON.stringify(st.pendingEvolutionCardPick)} ack=${Boolean(st.pendingEvolutionAck)}`);
  ok((st.collapsedRooms ?? []).length > 0, '确认之后坍塌发生了（第二步）',
    JSON.stringify(st.collapsedRooms ?? []));
  ok(st.pendingTraitVictim != null, '坍塌之后挂出特性作业（第三步）');

  const victim = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  const err = tryIt(st, { type: 'useTrait', traitId: 'trait_k17', targetPlayerId: victim.id });
  ok(!err, '选惊吓目标（特性作业能点动）', String(err ?? ''));
  console.log(`    [调试] 之后 traitVictim=${JSON.stringify(st.pendingTraitVictim)} ` +
    `cardPick=${JSON.stringify(st.pendingEvolutionCardPick)} ack=${Boolean(st.pendingEvolutionAck)} ` +
    `issuedAt=${st.evolutionChoiceIssuedAtLevel} level=${st.killerLevel}`);
  ok(st.pendingTraitVictim == null, '**特性作业已完成、不再挂着**');
  /**
   * 这一级的"要你选的东西"已经问过了（`evolutionChoiceIssuedAtLevel`），
   * 所以不该再冒出来一个卡池；剩下的是正常结算（力量/入场/弃牌）。
   */
  ok(st.pendingEvolutionCardPick == null, '不会再把已经问过的选项重挂一遍');
}

console.log('=== ③ 非墓穴地图：没有坍塌，但特性照常 ===');
{
  const st = mkSolo(true, 'cabin');
  const kid = st.killerId;
  st.traits = { ...(st.traits ?? {}), [kid]: ['trait_k17'] };
  toKillerTurn(st);
  st.killerLevel = 2;
  upgradeViaEnginePath(st);
  console.log(`  确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  ok((st.collapsedRooms ?? []).length === 0, '小屋地图没有坍塌（条件不满足 → 跳过）');
  ok(st.pendingTraitVictim != null, '但特性作业照常挂出（它只看变体1）');
}

console.log(`\n进化特性时机：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
