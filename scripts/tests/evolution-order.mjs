/**
 * 验证进化流程的新顺序（用户口径）：
 *
 *   ① 确认进化效果 → ② 双方坍塌结算（墓穴） → ③ 变体1 里与进化有关的特性
 *   → ④ 执行进化效果（力量 / **选卡** / 选牌 / 选主雕像 / 选地点 / 入手 / 弃牌）
 *
 * 重点是：**选卡不许再出现在确认之前**（用户原话：
 * 「这个选卡是执行进化效果，怎么能在确认效果之前呢」），坍塌也要排在确认之后。
 *
 * 跑法：node scripts/tests/evolution-order.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
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

function mkSolo(killerId, mapId = 'cabin', variant1 = false) {
  const st = createLobby('T', HOST, 'H', content, mapId);
  st.mode = 'solo';
  st.variant1 = variant1;
  st.soloKillerCharacterId = killerId;
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
 * **模拟引擎的升级入口**（`engine.ts` 里 `setUpgradeHandler` 那段）。
 *
 * 直接调 `runUpgrade` 会绕过它：坍塌被拦下时只记标记、`pendingEvolutionAck`
 * 压根没挂出来。真实对局里 engine 会紧接着"再跑一次 runUpgrade"把升级走完，
 * 所以测试里也要照做。
 */
function upgradeViaEnginePath(st) {
  runUpgrade(st);
  if (!st.pendingCollapseAfterEvolution) return;
  st.collapseConsumedForLevel = st.pendingCollapseLevel;
  runUpgrade(st);
  st.collapseConsumedForLevel = 0;
}

console.log('=== ① 确认之前**不许**出现选卡 / 二选一 ===');
{
  const st = mkSolo('killer7');            // 未命名：2 级应给选进化卡
  upgradeViaEnginePath(st);
  ok(st.pendingEvolutionAck != null, '挂了「待确认进化」');
  ok(
    st.pendingEvolutionCardPick == null,
    '**确认之前没有挂出"选进化卡牌"**（它在确认之后）',
    JSON.stringify(st.pendingEvolutionCardPick),
  );
  ok(st.pendingUnlockChoice == null, '确认之前没有挂出"解锁二选一"');
  console.log(`  快照里 pendingEvolutionCardPick=${JSON.stringify(buildSnapshot(st, HOST).pendingEvolutionCardPick)}`);

  console.log(`  确认新效果 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  ok(Array.isArray(st.pendingEvolutionCardPick), '**确认之后才挂出"选进化卡牌"**', JSON.stringify(st.pendingEvolutionCardPick));
}

console.log('=== ② 墓穴：坍塌排在确认之后 ===');
{
  const st = mkSolo('killer7', 'crypt');
  upgradeViaEnginePath(st);
  ok(st.pendingEvolutionAck != null, '挂了「待确认进化」');
  ok(
    st.pendingCollapseAfterEvolution === true,
    '**确认之前没有当场坍塌**，只记了"确认后要塌"',
    String(st.pendingCollapseAfterEvolution),
  );
  ok(st.pendingCollapse !== true, 'pendingCollapse 还没被置起（没开塌）');

  console.log(`  确认新效果 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  console.log(`    [调试] collapseAfter=${st.pendingCollapseAfterEvolution} pendingCollapse=${st.pendingCollapse} ` +
    `collapsed=${JSON.stringify(st.collapsedRooms)} moves=${Boolean(st.pendingCollapseMoves)} ` +
    `ack=${Boolean(st.pendingEvolutionAck)} level=${st.killerLevel}`);
  ok(st.pendingCollapseAfterEvolution !== true, '确认之后"待坍塌"标记不再挂着');
  /** 确认之后应该已经塌了（或者进入逐人走位） */
  const collapsed = (st.collapsedRooms ?? []).length > 0 || Boolean(st.pendingCollapseMoves);
  ok(collapsed, '**确认之后坍塌确实发生了**',
    `collapsedRooms=${JSON.stringify(st.collapsedRooms ?? [])} moves=${Boolean(st.pendingCollapseMoves)}`);
}

console.log('=== ③ 未命名 2 级：选卡 → 走完全程（含超限弃牌） ===');
{
  const st = mkSolo('killer7');
  st.killerHand = ['un_infrared_1', 'un_crawl_1', 'un_passage_1', 'un_passage_2', 'un_infrared_2'];
  runUpgrade(st);
  console.log(`  确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  const pool = st.pendingEvolutionCardPick ?? [];
  ok(pool.length > 0, '确认之后出现选卡池', `${pool.length} 张`);
  /** 直接问一次"还有没有要选的东西" —— 已选完的卡不该再出现 */
  const { advanceEvolutionChoices } = await import('../../server/dist/game/evolution.js');
  console.log(`    [调试] chosenEvolutionCards=${JSON.stringify(st.chosenEvolutionCards)} ` +
    `unEvolutionPool=${JSON.stringify(st.unEvolutionPool)}`);
  console.log(`    [调试] 现在 advanceEvolutionChoices() 返回 ${advanceEvolutionChoices(st)}（应为 false：卡还没选呢）`);
  console.log(`  选「${st.cardById[pool[0]]?.name}」 → ${tryIt(st, { type: 'pickEvolutionCard', cardId: pool[0] }) ?? 'OK'}`);
  console.log(`    [调试] chosenEvolutionCards=${JSON.stringify(st.chosenEvolutionCards)} ` +
    `ack=${JSON.stringify(st.pendingEvolutionAck)} cardPick=${JSON.stringify(st.pendingEvolutionCardPick)}`);
  ok(st.pendingEvolutionAck == null, '**选完卡，进化整条流程走完**（不卡死）');
  console.log(`  最终：level=${st.killerLevel} hand=${st.killerHand.length} pendingKillerDiscards=${st.pendingKillerDiscards}`);
}

console.log('=== ④ 未命名 3 级：解锁二选一 → 超限弃牌 → 收尾 ===');
{
  const st = mkSolo('killer7');
  st.killerHand = ['un_infrared_1', 'un_crawl_1', 'un_passage_1', 'un_passage_2', 'un_infrared_2'];
  /** 推到 3 级（1→2 先走完） */
  runUpgrade(st);
  tryIt(st, { type: 'ackEvolution' });
  const p2 = st.pendingEvolutionCardPick ?? [];
  tryIt(st, { type: 'pickEvolutionCard', cardId: p2[0] });
  runUpgrade(st);
  console.log(`  3 级确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  const pool = st.pendingUnlockChoice ?? [];
  ok(pool.length > 1, '确认之后出现解锁二选一', pool.map((i) => st.cardById[i]?.name).join('/'));
  console.log(`  选「${st.cardById[pool[0]]?.name}」 → ${tryIt(st, { type: 'pickUnlockChoice', cardId: pool[0] }) ?? 'OK'}`);
  if (st.pendingKillerDiscards > 0) {
    const card = st.killerHand.find((c) => !(st.justUnlockedCards ?? []).includes(c));
    console.log(`  需要弃 ${st.pendingKillerDiscards} 张，弃「${st.cardById[card]?.name}」`);
    while (st.pendingKillerDiscards > 0) {
      const next = st.killerHand.find((c) => !(st.justUnlockedCards ?? []).includes(c))
        ?? st.killerHand[0];
      const err = tryIt(st, { type: 'discardKillerCard', cardId: next });
      if (err) { console.log(`    弃牌失败：${err}`); break; }
    }
  }
  ok(st.pendingKillerDiscards === 0, '**超限的牌都弃完了**（弃牌不再被进化卡住）',
    `discards=${st.pendingKillerDiscards}`);
  ok(st.pendingEvolutionAck == null, '**整条进化流程走完，没有卡死**');
  console.log(`  最终：level=${st.killerLevel} hand=${st.killerHand.length} ` +
    `pendingKillerDiscards=${st.pendingKillerDiscards} pendingUnlockDiscard=${st.pendingUnlockDiscard}`);
}

console.log('=== ⑤ 雕像：选主雕像也排在确认之后 ===');
{
  const st = mkSolo('killer6');            // 雕像
  runUpgrade(st);
  ok(st.pendingStatueEvoSwitch !== true, '确认之前**没有**挂出"要不要换主雕像"');
  console.log(`  确认 → ${tryIt(st, { type: 'ackEvolution' }) ?? 'OK'}`);
  ok(st.pendingStatueEvoSwitch === true, '确认之后才问"要不要换主雕像"');
  console.log(`  选「不转换」 → ${tryIt(st, { type: 'skipStatueEvoSwitch' }) ?? 'OK'}`);
  ok(st.pendingEvolutionAck == null, '雕像进化也能走完', String(st.pendingEvolutionAck));
}

console.log(`\n进化流程顺序：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
