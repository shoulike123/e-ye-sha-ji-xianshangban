/**
 * **02「玩弄猎物」取消遭遇 → 女猎手【追蹤】的后半段（展示距离）一起作废。**
 *
 * 用户口径：「所有杀手在遭遇之后都会直接到结束回合，如果还有什么卡牌的效果没执行就跳过」——
 * 【追蹤】的"展示距离"和那场遭遇是同一次牌的结果，所以遭遇没了，距离也不该再展示。
 *
 * 跑法：node scripts/tests/tracker-cancel-by-prey.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 女猎手（killer4）局：1对3，变体1 开着、带 02「玩弄猎物」 */
function mk() {
  const st = createLobby('T', 'K', '杀手', content, 'mansion');
  st.mode = 'multi';
  st.variant1 = true;
  const specs = [
    ['K', '杀手', 'killer', 'killer4'],
    ['S1', '幸存者甲', 'survivor', 'survivor1'],
    ['S2', '幸存者乙', 'survivor', 'survivor2'],
    ['S3', '幸存者丙', 'survivor', 'survivor3'],
  ];
  st.players = {};
  for (const [id, name, faction, ch] of specs) {
    const p = createPlayer(id, name, id);
    p.faction = faction;
    p.characterId = ch;
    p.ready = true;
    st.players[id] = p;
  }
  st.hostId = 'K';
  startGame(st, content, 'K');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.traitPickerIds = [];
  st.traits = { K: ['trait_k02'] };
  /** 跳过开局布陷阱 */
  if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  st.players.K.actionsLeft = 2;
  st.players.K.roomId = 'R1';
  st.players.K.stealth = false;
  /** 【追蹤】是**搜索杀手所在地点** → 幸存者要站在同一格，遭遇才会爆发 */
  for (const id of ['S1', 'S2', 'S3']) st.players[id].roomId = 'R1';
  st.encounter = null;
  st.killerHand = ['huntress_track_1', 'huntress_track_2', 'huntress_track_3'];
  st.killerDeck = ['huntress_track_1'];
  return st;
}
/** 打出【追蹤】（快速牌，费用 1 张手牌） */
const playTracker = (st) => tryIt(st, 'K', {
  type: 'playKillerCard',
  cardId: 'huntress_track_1',
  payCardIds: ['huntress_track_3'],
});

/* ═══════════ ① 遭遇爆发那一刻，展示距离就已经挂不出来了 ═══════════ */
console.log('=== ① 追蹤的搜索直接开战 → 距离不给问 ===');
{
  const st = mk();
  const err = playTracker(st);
  ok(!err, '打出【追蹤】', String(err ?? ''));
  ok(st.encounter?.roomId === 'R1', '**搜索命中，遭遇爆发**', st.encounter?.roomId ?? 'null');
  ok(st.pendingTrackerPick === false,
    '**遭遇一爆发，`pendingTrackerPick` 就被清掉**（`interruptCurrentCardEffects`）',
    String(st.pendingTrackerPick));
  ok(!st.logs.some((l) => l.text.includes('请选择一名幸存者来展示距离')),
    '压根没问过"选一名幸存者展示距离"');
  ok(st.pendingPreyOffer === true, '02 的询问挂出来了');
}

/* ═══════════ ② 02 取消遭遇后：距离仍然作废，补发动作也不认 ═══════════ */
console.log('=== ② 02 取消遭遇后，补发"选距离目标"要被拒 ===');
{
  const st = mk();
  playTracker(st);
  const err = tryIt(st, 'K', { type: 'useTrait', traitId: 'trait_k02' });
  ok(!err, '女王/杀手能发动「玩弄猎物」', String(err ?? ''));
  ok(!st.encounter, '遭遇被取消', String(st.encounter));
  ok(st.pendingTrackerPick === false, '`pendingTrackerPick` 仍是 false', String(st.pendingTrackerPick));
  /** 把进化挂起清掉，专门验证"追蹤"这道闸 */
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  const late = tryIt(st, 'K', { type: 'pickTrackerTarget', targetPlayerId: 'S1' });
  ok(Boolean(late && late.includes('追蹤')),
    '**迟到的 `pickTrackerTarget` 被拒**（不会又把距离结算出来）', String(late ?? '（没有报错）'));
  ok(!st.logs.some((l) => l.text.includes('距离你')),
    '**整局都没有出现过"距离你 N 步"**',
    st.logs.filter((l) => l.text.includes('距离你')).map((l) => l.text).join(' | '));
}

/* ═══════════ ③ 对照：搜索没遇到人时，追蹤照常问距离 ═══════════ */
console.log('=== ③ 对照：没开战 → 距离照常展示（新加的闸没误伤正常流程）===');
{
  const st = mk();
  for (const id of ['S1', 'S2', 'S3']) st.players[id].roomId = 'G5'; // 挪走 → 搜索没人
  playTracker(st);
  ok(!st.encounter, '没开战');
  ok(st.pendingTrackerPick === true, '照常挂出"选一名幸存者展示距离"');
  ok(buildSnapshot(st, 'K').pendingTrackerPick === true, '杀手快照里也有（他要能点）');
  ok(buildSnapshot(st, 'S1').pendingTrackerPick === false, '幸存者快照里没有（那是杀手的信息）');
  const err = tryIt(st, 'K', { type: 'pickTrackerTarget', targetPlayerId: 'S1' });
  ok(!err, '选人成功', String(err ?? ''));
  ok(st.logs.some((l) => l.text.includes('距离你')),
    '**距离正常展示出来**', st.logs.filter((l) => l.text.includes('距离你')).map((l) => l.text).join(' | '));
  ok(st.pendingTrackerPick === false, '选完就收掉');
}

console.log(`\n02 取消遭遇 ×【追蹤】后半段：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
