/**
 * **进化 4 级：必须「选完 2 个地点」之后才「确认」**（用户口径）。
 *
 * 用户原话：「女王和扼杀者是选完两个后才确认」。
 *
 * 所以这一条要成立：
 *  - 只选 1 个 → 什么都没有发生（没生成丧尸 / 没放核心标记），
 *    而且这时候按「确认」要被拒绝（提示"请先选满 2 个地点再确认"）；
 *  - 选满 2 个 → **仍然什么都没发生**，只是按钮可以按了；
 *  - 按下「确认」→ 才真的生效（2 个丧尸 / 2 个核心标记）；
 *  - 再点同一格 → 取消那一格（点错了能反悔）。
 *
 * ⚠ 这里同时是一份**回归测试**：女王 4 级的"选地点"是在 `ackEvolution`
 * 的 ④ 步挂出来的，那时 `pendingEvolutionAck` **还没清**，
 * 而 `handleAction` 有一道"请先确认进化效果"的闸门（只放行白名单里的动作）。
 * 最开始漏了 `confirmEvoRooms` 没进白名单 → 点「确认生成丧尸」被拦下，
 * 玩家只能去点「确认新效果」，那条路又会因为 `pendingQueenSpawnRooms`
 * 已挂而跳过挂选择直接结算 —— **丧尸不生成、待办永远留着、回合收不了尾**。
 * 本脚本走的正是 `handleAction` 这条真实路径，所以能盯住这个死锁。
 *
 * 跑法：node scripts/tests/evo4-pick2-confirm.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { runUpgrade, hasEvolutionChoicePending } from '../../server/dist/game/evolution.js';

/**
 * ⚠ 客户端的"现在该画哪一边的界面"是**纯函数**，可以直接问它 ——
 * 用户报的「女王4级选完后没有正常切回幸存者界面」就靠这个盯：
 * 单人热座里选完 + 确认之后，它必须交还给幸存者。
 */
let viewerFactionOf = null;
try {
  ({ viewerFactionOf } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch { /* 没编译 SSR 就跳过这两条断言 */ }
/** `viewerFactionOf` 里"留在杀手界面"的那几个待办 */
const blockingPendings = (st) => [
  ['pendingEvolutionAck', Boolean(st.pendingEvolutionAck)],
  ['pendingWhizSearch', Boolean(st.pendingWhizSearch)],
  ['pendingOverFearWound', Boolean(st.pendingOverFearWound)],
  ['pendingBlockadeJob', Boolean(st.pendingBlockadeJob)],
  ['pendingCollapseMoves', Boolean(st.pendingCollapseMoves && !st.pendingCollapseMoves.waiting)],
].filter(([, on]) => on).map(([k]) => k);

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mkSolo(killerId) {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
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
  return st;
}

/** 升到 level 级、并把「确认新效果」按下去（真实路径，会挂出 4 级要选的东西） */
function levelUpTo(st, level) {
  st.killerLevel = level - 1;
  runUpgrade(st);
  if (st.pendingCollapseAfterEvolution) {
    st.collapseConsumedForLevel = st.pendingCollapseLevel;
    runUpgrade(st);
    st.collapseConsumedForLevel = 0;
  }
  const err = tryIt(st, { type: 'ackEvolution' });
  return err;
}

const roomsFree = (st, n) => st.map.rooms.map((r) => r.id).filter((id) => !(st.coreMarkers ?? []).includes(id)).slice(0, n);

console.log('=== ① 女王 4 级：选 2 个地点 → 确认 → 才生成丧尸 ===');
{
  const st = mkSolo('killer9');
  const err = levelUpTo(st, 4);
  ok(!err, '（前提）确认新效果能按下去', err ?? '');
  ok(Array.isArray(st.pendingQueenSpawnRooms), '（前提）女王 4 级挂出了"选 2 个地点"', JSON.stringify(st.pendingQueenSpawnRooms));
  ok(Boolean(st.pendingEvolutionAck), '（前提）这时**进化确认还挂着**（死锁就藏在这个窗口里）');
  /**
   * ⚠ **这一行就是"行动区点不了确认"的现场**：
   * 界面上"杀手行动区"整个被 `state.phase === 'killerMain'` 挡着
   * （`GameViews.tsx:6598`），而进化 4 级的选择是**回合收尾时**挂出来的 ——
   * 所以确认按钮必须画在**不看阶段**的那一层（进化确认面板旁边）。
   */
  console.log(`   [现场] phase=${st.phase} pendingEvolutionAck=${Boolean(st.pendingEvolutionAck)}`);

  const zombies0 = st.zombies.length;
  /**
   * ⚠ 选点要**避开杀手自己所在的地点** —— 确认之后进化流程会一路走完、
   * 顺手把杀手回合收尾，而**女王等级 1**「回合结束时若本回合没遭遇任何人
   * 且不在潜行，在你的地点生成一个丧尸」也会跟着结算，那里会多出 1 个。
   * 避开它，下面"每个地点各有几个"才数得干净。
   */
  const qRoom = st.players[st.killerId]?.roomId;
  const [r1, r2, r3] = st.map.rooms.map((r) => r.id).filter((id) => id !== qRoom).slice(0, 3);

  /** 只选 1 个 */
  const e1 = tryIt(st, { type: 'pickQueenSpawnRoom', roomId: r1 });
  ok(!e1, '点第 1 个地点没报错', e1 ?? '');
  ok(st.pendingQueenSpawnRooms.length === 1, '**只选了 1 个**', `已选 ${st.pendingQueenSpawnRooms.length}/2`);
  ok(st.zombies.length === zombies0, '**只选 1 个 → 一个丧尸都没生成**', `${zombies0} → ${st.zombies.length}`);

  /** 这时按确认 → 必须被拒 */
  const e2 = tryIt(st, { type: 'confirmEvoRooms' });
  ok(e2 != null && e2.includes('请先选满 2 个地点'), '**没选满就按确认 → 被拒绝**', e2 ?? '（居然通过了）');
  ok(st.pendingQueenSpawnRooms?.length === 1, '被拒之后选择还在（没被悄悄清掉）', JSON.stringify(st.pendingQueenSpawnRooms));
  ok(st.zombies.length === zombies0, '被拒之后仍然没有丧尸', String(st.zombies.length));

  /** 点错了能反悔 */
  tryIt(st, { type: 'pickQueenSpawnRoom', roomId: r1 });
  ok(st.pendingQueenSpawnRooms.length === 0, '**再点同一格 = 取消**', `已选 ${st.pendingQueenSpawnRooms.length}/2`);

  /** 选满 2 个 */
  tryIt(st, { type: 'pickQueenSpawnRoom', roomId: r1 });
  const e3 = tryIt(st, { type: 'pickQueenSpawnRoom', roomId: r2 });
  ok(!e3, '点第 2 个（不同）地点没报错', e3 ?? '');
  ok(st.pendingQueenSpawnRooms.length === 2, '**选满 2 个**', JSON.stringify(st.pendingQueenSpawnRooms));
  ok(st.zombies.length === zombies0, '**选满 2 个也还没生成丧尸（要等确认）**', `${zombies0} → ${st.zombies.length}`);

  const e4 = tryIt(st, { type: 'pickQueenSpawnRoom', roomId: r3 });
  ok(e4 != null && e4.includes('已经选满 2 个地点'), '**选第 3 个 → 被拒绝**', e4 ?? '（居然通过了）');

  /** 快照：只有杀手看得到待选地点 */
  const kSnap = buildSnapshot(st, HOST);
  const sSnap = buildSnapshot(st, Object.values(st.players).find((p) => p.faction === 'survivor').id);
  ok(Array.isArray(kSnap.pendingQueenSpawnRooms) && kSnap.pendingQueenSpawnRooms.length === 2,
    '杀手快照里带着待选地点', JSON.stringify(kSnap.pendingQueenSpawnRooms));
  ok(sSnap.pendingQueenSpawnRooms == null, '**幸存者快照里没有**（保密）', String(sSnap.pendingQueenSpawnRooms));

  /** 确认 → 这时才生效 */
  const at = (rid) => st.zombies.filter((z) => z.roomId === rid).length;
  /** 确认前的基线（开局女王自己地点上本来就站着丧尸，不能跟 0 比） */
  const base = { r1: at(r1), r2: at(r2), q: at(qRoom), all: st.zombies.length };
  ok(base.r1 === 0 && base.r2 === 0, '（前提）选的这 2 个地点本来没有丧尸', `${r1}:${base.r1} ${r2}:${base.r2}`);

  const e5 = tryIt(st, { type: 'confirmEvoRooms' });
  ok(!e5, '**「确认生成丧尸」能按下去（不再被"请先确认进化效果"拦）**', e5 ?? '');
  const added = st.zombies.length - base.all;
  ok(at(r1) === base.r1 + 1 && at(r2) === base.r2 + 1,
    '**确认后每个选中的地点各多了 1 个丧尸**', `${r1}:${base.r1}→${at(r1)} ${r2}:${base.r2}→${at(r2)}`);
  /**
   * ⚠ 总数会多 1 个：确认之后进化流程一路走完 → **杀手回合收尾**，
   * 顺手把**女王等级 1**「回合结束时若本回合没遭遇任何人且不在潜行，
   * 在你的地点生成一个丧尸」也结算了。那不是重复生成，是 1 级效果。
   */
  ok(added === 2 || added === 3, '**确认只生出选中的那 2 个（多出来的只能是女王 1 级）**', `总数 +${added}`);
  if (added === 3)
    ok(at(qRoom) === base.q + 1, '多出来的那 1 个 = 女王 1 级「回合结束在自己地点生成丧尸」', `${qRoom}:${base.q}→${at(qRoom)}`);
  ok(st.pendingQueenSpawnRooms == null, '待选地点已清空', String(st.pendingQueenSpawnRooms));
  /**
   * ⚠ **用户报的「女王4级选完后没有正常切回幸存者界面」**（单人热座）。
   * 直接问客户端的界面判定：选完 + 确认之后必须是幸存者。
   * 只要它还留在 killer，`blockingPendings` 就会把"是哪个待办卡着"打出来。
   */
  if (viewerFactionOf) {
    const view = viewerFactionOf(buildSnapshot(st, HOST));
    const left = blockingPendings(st);
    console.log(`   [界面] viewerFactionOf=${view}；phase=${st.phase}` +
      `${left.length ? `；还卡着：${left.join('、')}` : ''}`);
    ok(view === 'survivor', '**选完之后界面交还给幸存者**（单人热座）', String(view));
  }
  ok(st.pendingEvolutionAck == null, '**进化流程接着走完了（没有卡在确认上）**', String(Boolean(st.pendingEvolutionAck)));
  ok(hasEvolutionChoicePending(st) === false, '**没有留下收不掉尾的待办**', String(hasEvolutionChoicePending(st)));
}

console.log('\n=== ② 扼杀者 4 级：选 2 个地点 → 确认 → 才放核心标记 ===');
{
  const st = mkSolo('killer8');
  const err = levelUpTo(st, 4);
  ok(!err, '（前提）确认新效果能按下去', err ?? '');
  ok(Array.isArray(st.pendingStranglerCoreRooms), '（前提）扼杀者 4 级挂出了"选 2 个地点"', JSON.stringify(st.pendingStranglerCoreRooms));
  console.log(`   [现场] phase=${st.phase} pendingEvolutionAck=${Boolean(st.pendingEvolutionAck)}`);

  const cores0 = (st.coreMarkers ?? []).length;
  const [r1, r2, r3] = roomsFree(st, 3);

  const e1 = tryIt(st, { type: 'pickStranglerCoreRoom', roomId: r1 });
  ok(!e1, '点第 1 个地点没报错', e1 ?? '');
  ok((st.coreMarkers ?? []).length === cores0, '**只选 1 个 → 一个核心标记都没放**', `${cores0} → ${(st.coreMarkers ?? []).length}`);

  const e2 = tryIt(st, { type: 'confirmEvoRooms' });
  ok(e2 != null && e2.includes('请先选满 2 个地点'), '**没选满就按确认 → 被拒绝**', e2 ?? '（居然通过了）');
  ok(st.pendingStranglerCoreRooms?.length === 1, '被拒之后选择还在', JSON.stringify(st.pendingStranglerCoreRooms));

  tryIt(st, { type: 'pickStranglerCoreRoom', roomId: r1 });
  ok(st.pendingStranglerCoreRooms.length === 0, '**再点同一格 = 取消**', `已选 ${st.pendingStranglerCoreRooms.length}/2`);

  tryIt(st, { type: 'pickStranglerCoreRoom', roomId: r1 });
  tryIt(st, { type: 'pickStranglerCoreRoom', roomId: r2 });
  ok(st.pendingStranglerCoreRooms.length === 2, '**选满 2 个**', JSON.stringify(st.pendingStranglerCoreRooms));
  ok((st.coreMarkers ?? []).length === cores0, '**选满 2 个也还没放（要等确认）**', `${cores0} → ${(st.coreMarkers ?? []).length}`);

  const e4 = tryIt(st, { type: 'pickStranglerCoreRoom', roomId: r3 });
  ok(e4 != null && e4.includes('已经选满 2 个地点'), '**选第 3 个 → 被拒绝**', e4 ?? '（居然通过了）');

  const e5 = tryIt(st, { type: 'confirmEvoRooms' });
  ok(!e5, '**「确认放置核心标记」能按下去**', e5 ?? '');
  ok((st.coreMarkers ?? []).length === cores0 + 2, '**确认后放了 2 个核心标记**', `${cores0} → ${(st.coreMarkers ?? []).length}`);
  ok(st.coreMarkers.includes(r1) && st.coreMarkers.includes(r2), '**标记落在选的那 2 个地点**', JSON.stringify([r1, r2]));
  ok(st.pendingStranglerCoreRooms == null, '待选地点已清空', String(st.pendingStranglerCoreRooms));
  ok(hasEvolutionChoicePending(st) === false, '**没有留下收不掉尾的待办**', String(hasEvolutionChoicePending(st)));
  /** 同上：扼杀者这条也要把界面交还给幸存者（用户说「应该也有这个问题」） */
  if (viewerFactionOf) {
    const view = viewerFactionOf(buildSnapshot(st, HOST));
    const left = blockingPendings(st);
    console.log(`   [界面] viewerFactionOf=${view}；phase=${st.phase}` +
      `${left.length ? `；还卡着：${left.join('、')}` : ''}`);
    ok(view === 'survivor', '**选完之后界面交还给幸存者**（单人热座）', String(view));
  }
}

console.log('\n=== ③ 没挂着选择时按确认 → 应该有话说，而不是把什么东西结算掉 ===');
{
  const st = mkSolo('killer9');
  const err = tryIt(st, { type: 'confirmEvoRooms' });
  ok(err != null && err.includes('当前没有待确认的地点选择'), '**空按确认 → 明确报错**', err ?? '（居然通过了）');
}

console.log(`\n进化 4 级「选满 2 个再确认」：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
