/**
 * **雕像「圍困」要能走完整张牌**（用户报的：「围困在执行完后卡住了」）。
 *
 * 圍困 = 所有雕像〔移動〕×0-2（顺序自选）→ 所有雕像以任意顺序〔搜索〕。
 *
 * ⚠ 卡点：搜索段**没搜到人**时，`statueSearchOne` 不会清 `pendingStatuePick`，
 * 而"选下一尊"也没人重新露出来 —— 四尊全选完之后待选一直挂着，
 * `engine` 的 `pickStatueStep` 看到它还挂着就直接 `break`：**整张牌卡死**。
 * 修法：没命中也要 `statueStepsRemain(state)`（还有没选过的→继续提示；
 * 全选完→收掉待选，上层接着把这张牌落定）。
 *
 * 跑法：node scripts/tests/statue-siege-flow.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

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

/** 雕像局：把「圍困」拿在手上、摆到能打特殊牌的那一刻 */
function mk() {
  const st = createLobby('T', HOST, 'H', content, 'mansion');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer6';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 雕像局开局要选主雕像 */
  if (st.phase === 'statueSetup') {
    const main = Object.values(st.players).find((p) => p.statueIndex === 1);
    if (main) tryIt(st, { type: 'chooseMainStatue', statueId: main.id });
    tryIt(st, { type: 'confirmMainStatue' });
  }
  /** 幸存者都挪到一个雕像不会去的角落，免得搜索段直接开遭遇 */
  const statues = Object.values(st.players).filter((p) => p.statueIndex != null);
  const statueRooms = new Set(statues.map((p) => p.roomId));
  const corner = st.map.rooms.find((r) => !statueRooms.has(r.id))?.id;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor' && corner) p.roomId = corner;
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  st.killerUsedSlowThisTurn = false;
  st.pendingCardSpeed = null;
  /** 圍困费用 1 → 手里另外放一张当费用；再放一张巡邏验证"打完还能接着打" */
  st.killerHand = ['statue_siege', 'statue_patrol_1', 'statue_patrol_2'];
  return st;
}

console.log('=== 圍困：移动段（4 尊，各留原地）→ 搜索段（4 尊，都没人）→ 整张牌落定 ===');
{
  const st = mk();
  const err = tryIt(st, { type: 'playKillerCard', cardId: 'statue_siege', payCardIds: ['statue_patrol_1'] });
  console.log(`  打出圍困：${err ?? 'OK'}；pendingStatuePick=${JSON.stringify(st.pendingStatuePick?.kind ?? null)}`);
  ok(!err, '（前提）圍困打得出来', err ?? '');
  ok(st.pendingStatuePick?.kind === 'move', '**先进入"选一尊移动"阶段**',
    String(st.pendingStatuePick?.kind));

  /** —— 移动段：四尊各"留在原地" —— */
  let moved = 0;
  for (let guard = 0; guard < 12; guard += 1) {
    const pick = st.pendingStatuePick;
    if (!pick || pick.kind !== 'move') break;
    const opts = Object.values(st.players).filter(
      (p) => p.statueIndex != null && !pick.done.includes(p.id),
    );
    if (!opts.length) break;
    const e = tryIt(st, { type: 'pickStatueStep', statueId: opts[0].id });
    if (e) { console.log(`    选雕像失败：${e}`); break; }
    const e2 = tryIt(st, { type: 'finishPendingMove' });   // 0 步 = 留在原地
    if (e2) { console.log(`    确认路径失败：${e2}`); break; }
    moved += 1;
  }
  console.log(`  移动段处理了 ${moved} 尊；现在 pendingStatuePick=${JSON.stringify(st.pendingStatuePick?.kind ?? null)}`);
  ok(moved === 4, '**四尊都能选到**', String(moved));
  ok(st.pendingStatuePick?.kind === 'search', '**移动完自动进入搜索段**',
    String(st.pendingStatuePick?.kind ?? '（没有待选）'));

  /** —— 搜索段：四尊各搜一次（都没人） —— */
  let searched = 0;
  for (let guard = 0; guard < 12; guard += 1) {
    const pick = st.pendingStatuePick;
    if (!pick || pick.kind !== 'search') break;
    const opts = Object.values(st.players).filter(
      (p) => p.statueIndex != null && !pick.done.includes(p.id),
    );
    if (!opts.length) break;
    const e = tryIt(st, { type: 'pickStatueStep', statueId: opts[0].id });
    if (e) { console.log(`    搜索选雕像失败：${e}`); break; }
    searched += 1;
  }
  console.log(`  搜索段处理了 ${searched} 尊；pendingStatuePick=${JSON.stringify(st.pendingStatuePick ?? null)}；` +
    `当前牌=${JSON.stringify(st.currentKillerCardId ?? null)} / 待落定=${JSON.stringify(st.deferredPlayedCard ?? null)}`);
  ok(searched === 4, '**四尊都搜过**', String(searched));
  ok(st.pendingStatuePick == null, '**全搜完之后待选收掉了**（以前就卡在这儿）',
    JSON.stringify(st.pendingStatuePick));
  ok(!st.pendingStatueStepId, '没有残留"正在走的那尊"', String(st.pendingStatueStepId));
  ok(st.deferredPlayedCard == null, '**这张牌落定了**（不再挂在"正在结算"上）',
    String(st.deferredPlayedCard));
  ok(st.pendingCardSpeed == null, '速度标记也清了', String(st.pendingCardSpeed));
  ok(st.killerDiscard.includes('statue_siege'), '圍困进了弃牌堆',
    JSON.stringify(st.killerDiscard.slice(-3)));
  /**
   * ⚠ **这才是"卡死"的判据**：`hasPendingKillerChoice` 为 true 时
   * `engine` 的 `pickStatueStep` 会 `break`、牌也落不定。
   */
  const { hasPendingKillerChoice } = await import('../../server/dist/game/killerCards.js');
  ok(hasPendingKillerChoice(st) === false, '**没有"还在等杀手选"的待办了**',
    String(hasPendingKillerChoice(st)));
  console.log(`  收尾状态：phase=${st.phase} step=${st.killerTurnStep} choice=${st.killerMainChoice}`);
}

console.log('\n=== ③ 幸存者「停滞雕像」之后小回合要推进（不能停在原地） ===');
{
  const st = mk();
  /** 换成"幸存者大回合"：安娜和某尊雕像同地点 */
  const statue = Object.values(st.players).find((p) => p.statueIndex === 1);
  const actors = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const anna = actors[0];
  anna.roomId = statue.roomId;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = 0;
  st.turnOrder = actors.map((p) => p.id);
  for (const p of actors) {
    p.mainActionUsed = false;
    p.haltedThisRound = false;
    p.extraActionUsedThisTurn = false;
    p.tradedThisTurn = false;
    p.actedThisRound = false;
  }
  const before = {
    index: st.activeSurvivorIndex,
    acted: anna.actedThisRound,
    halted: anna.haltedThisRound,
  };
  /**
   * ⚠ 停滞是**特殊行动**（一般行动第 4 项），做完就该结束这个小回合。
   * 以前只 `break`、不收尾 —— 人卡在自己小回合里，什么也点不了（用户报的
   * 「停滞雕像后直接卡住了」）。
   */
  const e = tryIt(st, { type: 'haltStatue', statueId: statue.id, actorPlayerId: anna.id });
  console.log(`  停滞：${e ?? 'OK'}；acted=${anna.actedThisRound} halted=${anna.haltedThisRound} ` +
    `mainActionUsed=${anna.mainActionUsed}；activeSurvivorIndex=${before.index} → ${st.activeSurvivorIndex}；` +
    `pendingSurvivorPick=${Boolean(st.pendingSurvivorPick)} phase=${st.phase}`);
  ok(!e, '停滞本身成功', e ?? '');
  ok(statue.statueHalted === true, '（机制）那尊雕像被停滞了');
  ok(anna.mainActionUsed === true, '（机制）占掉了一般行动');
  ok(anna.haltedThisRound === true, '（机制）本大回合不能再做额外行动/交换');
  /**
   * 收尾判据：小回合已经交出去 —— 要么轮到下一个幸存者（`activeSurvivorIndex` 变了 /
   * 又要选人 `pendingSurvivorPick`），要么整个大回合进了发现阶段。
   */
  const movedOn =
    st.phase !== 'survivorMain' ||
    st.activeSurvivorIndex !== before.index ||
    Boolean(st.pendingSurvivorPick);
  ok(movedOn, '**小回合交出去了**（不会再停在"已行动却点不了"的状态）',
    `phase=${st.phase} index=${st.activeSurvivorIndex} pick=${Boolean(st.pendingSurvivorPick)}`);

  /**
   * ⚠ **给杀手那条只说"哪尊雕像被停滞"，不说是谁做的**（用户口径）；
   * 幸存者那条照旧点名。`logSplit` 正好是两条、各有各的 `vis`。
   */
  const rawHalt = st.logs.filter((l) => l.text.includes('停滞'));
  const killerLine = rawHalt.find((l) => l.vis === 'killer');
  const survivorLine = rawHalt.find((l) => l.vis === 'survivor');
  console.log(`  给杀手：${killerLine?.text ?? '（没有）'}`);
  console.log(`  给幸存者：${survivorLine?.text ?? '（没有）'}`);
  ok(Boolean(killerLine) && !killerLine.text.includes(anna.name),
    '**给杀手那条不点名**（只说哪尊被停滞）', killerLine?.text ?? '');
  ok(Boolean(survivorLine) && survivorLine.text.includes(anna.name),
    '幸存者那条照旧写清是谁停滞的', survivorLine?.text ?? '');
}

console.log('\n=== 对照：搜索命中 → 直接开遭遇（不走"选下一尊"）===');
{
  const st = mk();
  /** 把一名幸存者放到某尊雕像脚下 */
  const statue = Object.values(st.players).find((p) => p.statueIndex === 2);
  const victim = Object.values(st.players).find((p) => p.faction === 'survivor');
  victim.roomId = statue.roomId;
  st.pendingStatuePick = { kind: 'search', max: 0, min: 0, done: [], active: null, scope: 'all' };
  const e = tryIt(st, { type: 'pickStatueStep', statueId: statue.id });
  console.log(`  搜到人：${e ?? 'OK'}；遭遇房间=${st.encounter?.roomId ?? null}；` +
    `pendingStatuePick=${JSON.stringify(st.pendingStatuePick ?? null)}`);
  ok(!e, '选得了那尊雕像', e ?? '');
  ok(st.encounter?.roomId === statue.roomId, '**命中就直接开遭遇**（立绘那间房）',
    String(st.encounter?.roomId));
  ok(st.pendingStatuePick == null, '命中时待选清掉（遭遇接管）');
}

console.log(`\n雕像圍困流程：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
