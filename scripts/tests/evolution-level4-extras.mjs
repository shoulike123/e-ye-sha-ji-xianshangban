/**
 * 两条容易被漏掉的进化效果用例：
 *
 *  ① 谋杀者 4 级：「力量 +1；在任意地点总计【封堵】×4」——**立即进入选门封堵**。
 *  ② 雕像 4 级：「力量 +2；将『圍困』从弃牌堆加入手牌」——弃牌堆没有就跳过。
 *
 * 跑法：node scripts/tests/evolution-level4-extras.mjs
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

function mkSolo(killerId, mapId = 'cabin') {
  const st = createLobby('T', HOST, 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    try { handleAction(st, HOST, { type: 'confirmTrapPlacement' }, content); } catch { /* 忽略 */ }
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  return st;
}

const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

/**
 * 走到"升到 4 级并**把这一级的选择都做完**"。
 *
 * 注意：确认之后还会挂出这一级的"要你选的东西"（雕像要选主雕像），
 * 全部选完才会真正结算力量 / 取回圍困，所以这里要按顺序做掉。
 */
function levelTo4(st) {
  st.killerLevel = 3;
  runUpgrade(st);
  const err = tryIt(st, { type: 'ackEvolution' });
  /** 雕像会在确认之后问"要不要换主雕像"，选"不转换"即可 */
  let guard = 0;
  while (st.pendingStatueEvoSwitch && guard < 5) {
    guard += 1;
    tryIt(st, { type: 'skipStatueEvoSwitch' });
  }
  return err;
}

console.log('=== ① 谋杀者 4 级：力量 +1 且**立即要求封堵 4 扇门** ===');
{
  const st = mkSolo('killer3');
  const kid = st.killerId;
  const beforePower = st.killerPower;
  const err = levelTo4(st);
  ok(!err, '升到 4 级并确认（走完全程）', String(err ?? ''));
  console.log(`  力量 ${beforePower} → ${st.killerPower}；` +
    `pendingEvoFourBlockade=${st.pendingEvoFourBlockade} pendingBlockadeJob=${JSON.stringify(st.pendingBlockadeJob)}`);
  ok(st.killerPower === beforePower + 1, '**力量 +1**', `Δ=${st.killerPower - beforePower}`);
  /**
   * 封堵作业在确认/收尾时就已经挂出来了（`startPendingEvoFourIfNeeded` 会被消耗），
   * 所以判"**选门封堵已经生效**"而不是判那个中间标记。
   */
  const job = st.pendingBlockadeJob;
  console.log(`  封堵作业：${JSON.stringify(job)}`);
  ok(job != null && job.kind === 'anyDoors', '**立即进入"任意地点选门封堵"**', JSON.stringify(job));
  ok((job?.need ?? 0) === 4, '总量是 **4** 扇（4 级效果）', `need=${job?.need}`);

  /** 标记已经消费掉也无所谓：再问一次应该是"没有待办" */
  const { startPendingEvoFourIfNeeded } = await import('../../server/dist/game/evolution.js');
  const again = startPendingEvoFourIfNeeded(st);
  ok(again === false, '该待办不会被重复挂一次', String(again));
  void kid;
}

console.log('=== ② 雕像 4 级：把「圍困」从弃牌堆取回 ===');
{
  const st = mkSolo('killer6', 'mansion');
  /** 把「圍困」放进弃牌堆（模拟"已经打出去过"） */
  st.killerDiscard = [...st.killerDiscard, 'statue_siege'];
  const beforePower = st.killerPower;
  const handBefore = st.killerHand.length;
  const err = levelTo4(st);
  ok(!err, '升到 4 级并确认', String(err ?? ''));
  console.log(`  力量 ${beforePower} → ${st.killerPower}；手牌 ${handBefore} → ${st.killerHand.length}；` +
    `手上有没有圍困=${st.killerHand.includes('statue_siege')}`);
  ok(st.killerPower === beforePower + 2, '**力量 +2**', `Δ=${st.killerPower - beforePower}`);
  ok(st.killerHand.includes('statue_siege'), '**「圍困」从弃牌堆进了手牌**');
  ok(!st.killerDiscard.includes('statue_siege'), '弃牌堆里不再有它');
}

console.log('=== ③ 雕像 4 级：弃牌堆**没有**「圍困」→ 跳过取回，但力量照样 +2 ===');
{
  const st = mkSolo('killer6', 'mansion');
  /**
   * 严格构造"弃牌堆里没有"：把它从**手牌 / 锁定区 / 弃牌堆**全部清掉。
   * （3 级解锁后它通常在手牌里，不清掉就测不到"跳过"这条分支。）
   */
  const SIEGE = 'statue_siege';
  st.killerDiscard = st.killerDiscard.filter((c) => c !== SIEGE);
  st.killerHand = st.killerHand.filter((c) => c !== SIEGE);
  st.killerLocked = st.killerLocked.filter((c) => c !== SIEGE);
  const beforePower = st.killerPower;
  const beforeHand = st.killerHand.length;
  const err = levelTo4(st);
  ok(!err, '升到 4 级并确认（没有圍困也不该报错）', String(err ?? ''));
  console.log(`  力量 ${beforePower} → ${st.killerPower}；手牌 ${beforeHand} → ${st.killerHand.length}；` +
    `手上有没有圍困=${st.killerHand.includes(SIEGE)}`);
  ok(st.killerPower === beforePower + 2, '**力量照样 +2**（取回流程被跳过）',
    `Δ=${st.killerPower - beforePower}`);
  ok(!st.killerHand.includes(SIEGE), '没有凭空多出一张「圍困」');
  const said = st.logs.some((l) => String(l.text ?? '').includes('弃牌堆里没有'));
  ok(said, '战报写明"弃牌堆里没有「圍困」，跳过取回"');
}

console.log(`\n4 级两条特殊效果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
