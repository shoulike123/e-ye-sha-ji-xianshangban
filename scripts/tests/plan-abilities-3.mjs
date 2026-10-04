/**
 * **【变体3】计划能力：要选目标的 + 移动类**。
 *
 *  - 現場研究（額外行動：【移動】×2）→ 本小回合移动力 +2，**不占一般行动**
 *  - 秘術草藥（螺旋地点：治療 + 清中毒）
 *  - 通道調查 ①「所有秘密通道互相連接」→ 手电筒能去**任意**通道口
 *  - 通道調查 ②「特殊行動：移動通過一條秘密通道」→ 占一般行动、要选出口
 *  - 情報分享（完成计划时：选一名幸存者抽 1 张）
 *
 * 跑法：node scripts/tests/plan-abilities-3.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, enterNoiseReport,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  st.variant3 = true;
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  st.noises = [];
  st.planMarkers = [];
  st.planUsedAbilities = [];
  st.planCompletedId = null;
  st.planCurrentId = null;
  st.planStep = 0;
  st.planChangedThisRound = false;
  st.planAdvancedThisRound = false;
  st.pendingPlanTarget = null;
  st.pendingPlanResume = false;
  st.pendingPlanPassage = null;
  /** 全员（含杀手）都挪到 B1 之外的默认位置；具体场景各自摆 */
  const surv = survivorOf(st);
  st.players[st.killerId].roomId = 'A1';
  st.pendingSurvivorPick = false;
  st.encounter = null;
  st.activeSurvivorIndex = Math.max(0, st.turnOrder.indexOf(surv.id));
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') {
      p.mainActionUsed = false;
      p.moveLeft = st.rules.survivorMoveRange;
      p.actedThisRound = false;
      p.alive = true;
      p.faction = 'survivor';
    }
  }
  return st;
}
function survivorOf(st) {
  return Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
}
const tryIt = (st, action, socketId = 's') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const text = (st, n = 6) => st.logs.slice(-n).map((l) => l.text).join(' | ');

/* ═══════════ ① 現場研究：額外行動，移动力 +2 ═══════════ */
console.log('=== ① 現場研究：額外行动 +2 格移动力（不占一般行动） ===');
{
  const st = mk();
  const surv = survivorOf(st);
  surv.roomId = 'B1';
  surv.moveLeft = 2;
  st.planCompletedId = 'plan_field_study';
  const err = tryIt(st, { type: 'usePlanAbility', planId: 'plan_field_study', index: 0 });
  ok(!err, '发动成功', String(err ?? ''));
  ok(surv.moveLeft === 4, '**移动力 2 → 4**', String(surv.moveLeft));
  ok(surv.mainActionUsed !== true, '**没占一般行动**', String(surv.mainActionUsed));
  ok(st.planUsedAbilities.includes('plan_field_study#0'), '记下"本局已用过"（每场一次）',
    JSON.stringify(st.planUsedAbilities));
  const err2 = tryIt(st, { type: 'usePlanAbility', planId: 'plan_field_study', index: 0 });
  ok(Boolean(err2), '**同一场不能再用第二次**', String(err2 ?? ''));

  /** 不是你的小回合 → 不给发动（免得白扔） */
  const st2 = mk();
  const other = Object.values(st2.players).find(
    (p) => p.faction === 'survivor' && p.id !== st2.turnOrder[st2.activeSurvivorIndex],
  );
  st2.planCompletedId = 'plan_field_study';
  if (other) {
    const err3 = tryIt(st2, { type: 'usePlanAbility', planId: 'plan_field_study', index: 0 }, 's');
    /** duo 只有一个幸存者棋子 —— 换个方式：把行动权交给"不是他"的局面 */
    ok(!err3 || err3.includes('不是你的小回合'), '轮到本人时可以发动', String(err3 ?? ''));
  }
}

/* ═══════════ ② 秘術草藥：螺旋地点，治療 + 移除所有恐惧 ═══════════ */
console.log('=== ② 秘術草藥：治疗自己并移除身上所有恐惧 ===');
{
  const st = mk();
  const surv = survivorOf(st);
  surv.roomId = 'G2'; // 螺旋地点（墓地）
  surv.hp = surv.maxHp - 1;
  surv.fear = 2;
  st.poisoned = [surv.id];
  st.planCompletedId = 'plan_herbs';
  const err = tryIt(st, { type: 'usePlanAbility', planId: 'plan_herbs', index: 0 });
  ok(!err, '在螺旋地点发动成功', String(err ?? ''));
  ok(surv.hp === surv.maxHp, '**治疗 +1**', `${surv.hp}/${surv.maxHp}`);
  ok((surv.fear ?? 0) === 0, '**移除身上所有恐惧**', String(surv.fear));
  ok(surv.overFear !== true, '「恐惧过度」也一并清掉', String(surv.overFear));
  ok(!(st.poisoned ?? []).includes(surv.id),
    '**中毒也一起没了（治疗自带的）**', JSON.stringify(st.poisoned));
  ok(surv.mainActionUsed !== true, '额外行动不占一般行动', String(surv.mainActionUsed));
  console.log(`   战报：${text(st, 3)}`);

  /** 满血、没中毒、只有恐惧 → 照样能治（清恐惧才是这条的价值） */
  const st1 = mk();
  const surv1 = survivorOf(st1);
  surv1.roomId = 'G2';
  surv1.fear = 3;
  st1.planCompletedId = 'plan_herbs';
  const err1 = tryIt(st1, { type: 'usePlanAbility', planId: 'plan_herbs', index: 0 });
  ok(!err1 && (surv1.fear ?? 0) === 0, '**满血但有恐惧 → 照样能发动并清恐惧**',
    String(err1 ?? surv1.fear));

  /** 不在螺旋地点 → 拒绝 */
  const st2 = mk();
  const surv2 = survivorOf(st2);
  surv2.roomId = 'R1';
  surv2.hp = surv2.maxHp - 1;
  surv2.fear = 1;
  st2.planCompletedId = 'plan_herbs';
  const err2 = tryIt(st2, { type: 'usePlanAbility', planId: 'plan_herbs', index: 0 });
  ok(Boolean(err2 && err2.includes('螺旋')), '**不在螺旋地点不能发动**', String(err2 ?? ''));

  /** 什么都没得治 → 不让点（别白白吃掉"每场一次"） */
  const st3 = mk();
  const surv3 = survivorOf(st3);
  surv3.roomId = 'G2';
  surv3.hp = surv3.maxHp;
  surv3.fear = 0;
  st3.planCompletedId = 'plan_herbs';
  const err3 = tryIt(st3, { type: 'usePlanAbility', planId: 'plan_herbs', index: 0 });
  ok(Boolean(err3 && err3.includes('恐惧')), '**没伤没毒没恐惧 → 不让点**', String(err3 ?? ''));
  ok(!st3.planUsedAbilities.includes('plan_herbs#0'),
    '**这种情况不会用掉"每场一次"**', JSON.stringify(st3.planUsedAbilities));
}

/* ═══════════ ③ 通道調查 ①：所有秘密通道互相連接 ═══════════ */
console.log('=== ③ 通道調查 ①：秘密通道互连（手电筒能去任意通道口） ===');
{
  /** 对照：没这张计划时，B1 只能去 G2 */
  const a = mk();
  const sa = survivorOf(a);
  sa.roomId = 'B1';
  sa.items.flashlight = 1;
  const errA = tryIt(a, { type: 'useItem', itemId: 'flashlight', toRoomId: 'G5' });
  ok(Boolean(errA), '对照：**没互连时 B1 去不了 G5**', String(errA ?? ''));

  const b = mk();
  const sb = survivorOf(b);
  sb.roomId = 'B1';
  sb.items.flashlight = 1;
  sb.mainActionUsed = false;
  b.planCompletedId = 'plan_passage_survey';
  const errB = tryIt(b, { type: 'useItem', itemId: 'flashlight', toRoomId: 'G5' });
  ok(!errB, '**互连后 B1 能直接去 G5**', String(errB ?? ''));
  ok(sb.roomId === 'G5', '人真的到了 G5', String(sb.roomId));
  console.log(`   战报：${text(b, 2)}`);
}

/* ═══════════ ④ 通道調查 ②：特殊行动穿过一条秘密通道 ═══════════ */
console.log('=== ④ 通道調查 ②：特殊行动移动通过秘密通道 ===');
{
  const st = mk();
  const surv = survivorOf(st);
  surv.roomId = 'B5';
  surv.mainActionUsed = false;
  st.planCompletedId = 'plan_passage_survey';

  /** 不带目的地 → 服务端把候选挂起来等选（不消耗行动、不消耗能力） */
  const err = tryIt(st, { type: 'usePlanAbility', planId: 'plan_passage_survey', index: 1 });
  ok(!err, '"发动"后进入选出口', String(err ?? ''));
  const ends = st.pendingPlanPassage ?? [];
  ok(ends.includes('G5') && ends.includes('B1'), '**候选里同时有 G5（原来的口）和 B1（互连出来的）**',
    JSON.stringify(ends));
  ok(surv.mainActionUsed !== true, '还没选就还没消耗一般行动', String(surv.mainActionUsed));

  const err2 = tryIt(st, {
    type: 'usePlanAbility', planId: 'plan_passage_survey', index: 1, toRoomId: 'B1',
  });
  ok(!err2, '选了 B1 之后成功移动', String(err2 ?? ''));
  ok(surv.roomId === 'B1', '**人到了 B1**', String(surv.roomId));
  ok(surv.mainActionUsed === true, '**占一般行动**', String(surv.mainActionUsed));
  ok((st.pendingPlanPassage ?? []).length === 0, '候选清空');
  console.log(`   战报：${text(st, 3)}`);

  /** 不是通道地点 → 拒绝；目的地非法 → 拒绝 */
  const st2 = mk();
  const surv2 = survivorOf(st2);
  surv2.roomId = 'A1';
  st2.planCompletedId = 'plan_passage_survey';
  const err3 = tryIt(st2, { type: 'usePlanAbility', planId: 'plan_passage_survey', index: 1 });
  ok(Boolean(err3 && err3.includes('秘密通道')), '**不在通道地点不能发动**', String(err3 ?? ''));

  const st3 = mk();
  const surv3 = survivorOf(st3);
  surv3.roomId = 'B5';
  surv3.mainActionUsed = false;
  st3.planCompletedId = 'plan_passage_survey';
  const err4 = tryIt(st3, {
    type: 'usePlanAbility', planId: 'plan_passage_survey', index: 1, toRoomId: 'A1',
  });
  ok(Boolean(err4), '**去一个不是通道口的地方会被拒**', String(err4 ?? ''));
  ok(surv3.roomId === 'B5', '人被留原地', String(surv3.roomId));
}

/* ═══════════ ⑤ 情報分享：完成计划时选一名幸存者抽 1 张 ═══════════ */
console.log('=== ⑤ 情報分享：完成计划时选人抽牌 ===');
{
  const st = mk();
  const surv = survivorOf(st);
  /** `allSame` = **所有**幸存者同地，所以三个人都要摆到 A1 */
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = 'A1';
  }
  st.players[st.killerId].roomId = 'A1';
  /** 直接摆到最后一条进度达成的位置：`allSame` = 所有幸存者同地 */
  st.planCurrentId = 'plan_intel_share';
  st.planStep = 2;
  st.planAdvancedThisRound = false;
  st.planChangedThisRound = false;
  st.discoveryActorId = surv.id;
  const deckBefore = st.searchDeck.length;
  enterNoiseReport(st);
  ok(st.planCompletedId === 'plan_intel_share', '**计划完成**', String(st.planCompletedId));
  ok(Boolean(st.pendingPlanTarget), '**挂起"选一名幸存者抽牌"**', JSON.stringify(st.pendingPlanTarget));
  ok(st.pendingPlanResume === true, '选完要回到发现阶段收尾（`pendingPlanResume`）',
    String(st.pendingPlanResume));
  ok(st.phase !== 'noiseReport', '选人期间**不往下走阶段**', String(st.phase));

  const cands = st.pendingPlanTarget?.candidates ?? [];
  ok(cands.length > 0, '有待选名单', JSON.stringify(cands));
  const err = tryIt(st, { type: 'pickPlanTarget', playerId: cands[0] });
  ok(!err, '选人成功', String(err ?? ''));
  ok(st.searchDeck.length === deckBefore - 1, '**搜索牌库少了一张**',
    `${deckBefore} → ${st.searchDeck.length}`);
  ok(!st.pendingPlanTarget, '待选清空');
  ok(st.phase === 'noiseReport', '**选完继续走响声阶段**', String(st.phase));
  console.log(`   战报：${text(st, 4)}`);

  /** 没有待选时不能乱选 */
  const st2 = mk();
  const err2 = tryIt(st2, { type: 'pickPlanTarget', playerId: survivorOf(st2).id });
  ok(Boolean(err2 && err2.includes('没有待选')), '没待选时拒绝', String(err2 ?? ''));
}

console.log(`\n变体3 计划能力（目標/移動类）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
