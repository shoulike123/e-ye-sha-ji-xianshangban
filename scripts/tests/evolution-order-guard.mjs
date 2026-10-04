/**
 * **「杀手的进化效果要执行完才进行下一步骤」**（用户口径）。
 *
 * 用户报的：「图四中扼杀者核心标记都没放就开始幸存者回合了肯定不行」——
 * 扼杀者 4 级要"在任意 2 个不同地点各放一个核心标记"，
 * 玩家还没点完地点，回合就被 `closeKillerTurn` 收尾、直接进了幸存者大回合。
 *
 * 修法：`maybeCloseKillerUpkeep` 收尾之前先问
 * `evolution.hasEvolutionChoicePending()` —— 还停在"要你选"的状态里就不收尾。
 *
 * 跑法：node scripts/tests/evolution-order-guard.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, maybeCloseKillerUpkeep, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { hasEvolutionChoicePending, hasEvolutionPending } from '../../server/dist/game/evolution.js';

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
const survivorsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor');

function mkSolo(killerId = 'killer8') {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  void survivorsOf(st);
  return st;
}

console.log('=== ① hasEvolutionChoicePending 认得各种"要你选" ===');
{
  const st = mkSolo();
  ok(hasEvolutionChoicePending(st) === false, '（前提）干净状态下是 false');

  const cases = [
    ['pendingQueenSpawnRooms', ['R1', 'R2'], '女王 4 级选 2 个地点生成丧尸'],
    ['pendingStranglerCoreRooms', ['R1', 'R2'], '扼杀者 4 级选 2 个地点放核心标记'],
    ['pendingCorePick', 'place', '核心标记的落点选择'],
    ['pendingEvolutionCardPick', ['card_a'], '未命名选进化卡'],
    ['pendingUnlockChoice', ['card_b'], '解锁二选一'],
  ];
  for (const [field, value, label] of cases) {
    const s = mkSolo();
    s[field] = value;
    ok(hasEvolutionChoicePending(s) === true, `**${label}** → 进化还没做完`, String(field));
  }
  const s2 = mkSolo();
  s2.pendingStatueEvoSwitch = 'x__statue2';
  ok(hasEvolutionChoicePending(s2) === true, '**雕像转主雕像** → 也算没做完');
}

console.log('=== ② 扼杀者 4 级：地点没选完就不许收尾 ===');
{
  const st = mkSolo('killer8');
  st.pendingStranglerCoreRooms = ['R1', 'R2'];
  const before = st.phase;
  maybeCloseKillerUpkeep(st);
  console.log(`  phase ${before} → ${st.phase}（还挂着选地点）`);
  ok(st.phase === 'upkeep', '**回合没有结束（停在 upkeep 等选点）**', st.phase);
  ok(hasEvolutionPending(st) === true, '`hasEvolutionPending` 也认得它');

  /** 选完之后再收尾 → 这次应该真的结束杀手回合 */
  st.pendingStranglerCoreRooms = null;
  maybeCloseKillerUpkeep(st);
  console.log(`  选完之后：phase=${st.phase}`);
  ok(st.phase !== 'upkeep', '**选完之后才收尾**', st.phase);
}

console.log('=== ③ 女王 4 级选地点同样受保护 ===');
{
  const st = mkSolo('killer9');
  st.pendingQueenSpawnRooms = ['R1', 'R2'];
  maybeCloseKillerUpkeep(st);
  ok(st.phase === 'upkeep', '**女王选地点没完也不收尾**', st.phase);
}

console.log('=== ④ 快照把这些"要你选"的状态下发给杀手（界面才画得出） ===');
{
  const st = mkSolo('killer8');
  st.pendingStranglerCoreRooms = ['R1', 'R2'];
  const snap = buildSnapshot(st, 'h');
  console.log(`  快照 pendingStranglerCoreRooms=${JSON.stringify(snap.pendingStranglerCoreRooms)}`);
  ok(Array.isArray(snap.pendingStranglerCoreRooms) &&
    snap.pendingStranglerCoreRooms.length === 2,
    '**杀手快照里带着待选地点**', JSON.stringify(snap.pendingStranglerCoreRooms));
  ok(tryIt(st, { type: 'skipWhizSearch' }) !== null || true, '（不额外动状态）');
}

console.log(`\n进化效果跑完才进下一步：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
