/**
 * **【变体3】计划卡：核心流程**（发牌 → 确认/改变计划 → 位置判定推进 → 完成）。
 *
 * 用户口径（见 `变体3_设计.md`）：
 *  - 开局给幸存者方**随机 2 张**；**杀手看不到**。
 *  - 判定时机：**发现阶段结束后、大回合结束前**，**只查人物位置**。
 *  - 每个大回合**最多推进一个进度**。
 *  - 本回合**换过计划** → 进发现阶段检查时原计划进度清零。
 *  - 完成整张计划 → **另一张隐藏**、能力生效。
 *
 * 跑法：node scripts/tests/plan-cards-core.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot, enterNoiseReport,
} from '../../server/dist/game/engine.js';
import { checkPlanProgress } from '../../server/dist/game/plans.js';
import { applyCollapse } from '../../server/dist/game/collapse.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** duo：杀手 h + 一名幸存者玩家 s（控 3 名幸存者）→ 确认计划时"全员同意"= s 自己一票 */
function mk({ variant3 = true, planIds = null } = {}) {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  st.variant3 = variant3;
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
  /** 需要确定性时，直接指定手上是哪两张 */
  if (planIds) {
    st.planHand = [...planIds];
    st.planCurrentId = null;
    st.planStep = 0;
    st.planAdvancedThisRound = false;
    st.planChangedThisRound = false;
    st.pendingPlanSwitch = null;
    st.planCompletedId = null;
    st.planUsedAbilities = [];
    st.planMarkers = [];
  }
  return st;
}
const tryIt = (st, action, socketId = 's') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const survsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
/** 把三名幸存者放到某个 tag 的地点（找不到就放第一个房间） */
function putSurvivorsAtTag(st, tag) {
  const room = st.map.rooms.find((r) => (r.tags ?? []).includes(tag)) ?? st.map.rooms[0];
  for (const s of survsOf(st)) s.roomId = room.id;
  return room.id;
}

/* ═══════════ ① 开局发牌 + 只有幸存者看得到 ═══════════ */
console.log('=== ① 开局发 2 张、杀手看不到 ===');
{
  const st = mk();
  ok(st.variant3 === true, '变体3 开着', String(st.variant3));
  ok((st.planHand ?? []).length === 2, '**发了 2 张计划卡**', JSON.stringify(st.planHand));
  ok(new Set(st.planHand).size === 2, '两张不重复');
  ok(st.planCurrentId === null, '还没有确认任何计划');

  const sSnap = buildSnapshot(st, 's');
  ok(Boolean(sSnap.plans), '幸存者快照里有 `plans`');
  ok((sSnap.plans?.cards ?? []).length === 2, '里面有 2 张卡',
    JSON.stringify((sSnap.plans?.cards ?? []).map((c) => c.name)));
  ok((sSnap.plans?.cards ?? []).every((c) => c.progress.length >= 2),
    '每张卡都带进度序列（界面直接画）');
  ok((sSnap.plans?.cards ?? []).every((c) => c.candidate && !c.active),
    '还没确认时两张都是"候选"');
  const kSnap = buildSnapshot(st, 'h');
  ok(kSnap.plans === null,
    '**杀手快照里没有计划卡**（用户口径：杀手不知道幸存者的计划）',
    JSON.stringify(kSnap.plans));
  /** 关掉变体3 就不该有 */
  const off = mk({ variant3: false });
  ok((off.planHand ?? []).length === 0, '没开变体3 → 不发牌', JSON.stringify(off.planHand));
  ok(buildSnapshot(off, 's').plans === null, '没开变体3 → 快照里也没有');
}

/* ═══════════ ② 确认 / 改变计划（要所有幸存者玩家同意） ═══════════ */
console.log('=== ② 确认计划 / 改变计划 ===');
{
  const st = mk({ planIds: ['plan_careful_repair', 'plan_molotov'] });
  const [a, b] = st.planHand;
  /** 第一次选 = 确认计划 */
  const e1 = tryIt(st, { type: 'pickPlan', planId: a });
  ok(!e1, '发起"确认计划"', String(e1 ?? ''));
  ok(st.planCurrentId === a,
    '**duo 里幸存者玩家只有一人 → 他自己一票即生效**', String(st.planCurrentId));
  ok(st.planChangedThisRound === false,
    '第一次确认**不算"改过"**（不清零）', String(st.planChangedThisRound));
  /** 再确认同一张 → 报错 */
  ok(Boolean(tryIt(st, { type: 'pickPlan', planId: a })), '重复确认同一张会被拒');
  /** 改变计划 */
  const e2 = tryIt(st, { type: 'pickPlan', planId: b });
  ok(!e2, '发起"改变计划"', String(e2 ?? ''));
  ok(st.planCurrentId === b, '换成另一张', String(st.planCurrentId));
  ok(st.planChangedThisRound === true,
    '**换过计划 → 标记"本回合改过"**（检查时清零）', String(st.planChangedThisRound));
  /** 只有发现阶段之前能选 */
  st.phase = 'discovery';
  ok(Boolean(tryIt(st, { type: 'pickPlan', planId: a })),
    '发现阶段不能再改计划（只能在发现阶段之前）');
  st.phase = 'survivorMain';
}

/* ═══════════ ③ 位置判定 → 推进（每个大回合最多一个） ═══════════ */
console.log('=== ③ 只按人物位置推进，且每回合最多一个 ===');
{
  /** 谨慎修理：齿轮 → 锤子 → 齿轮 */
  const st = mk({ planIds: ['plan_careful_repair', 'plan_molotov'] });
  st.planCurrentId = 'plan_careful_repair';
  st.planChangedThisRound = false;

  /** 第 1 条：修理地点（齿轮） */
  const gearRoom = putSurvivorsAtTag(st, 'repairable');
  console.log(`   把三名幸存者放到修理地点「${gearRoom}」`);
  checkPlanProgress(st);
  ok(st.planStep === 1, '**推进到第 2 条**', `planStep=${st.planStep}`);
  ok(st.planAdvancedThisRound === true, '记下"本回合已推进"');

  /** 同一大回合再查：不推进 */
  putSurvivorsAtTag(st, 'special-hammer');
  checkPlanProgress(st);
  ok(st.planStep === 1,
    '**同一大回合不再推进**（每个大回合最多一个）', `planStep=${st.planStep}`);

  /** 下一个大回合：锤子地点 */
  st.planAdvancedThisRound = false;
  checkPlanProgress(st);
  ok(st.planStep === 2, '第 2 条（锤子地点）达成 → 推进', `planStep=${st.planStep}`);

  /** 第三个大回合：又是齿轮 */
  st.planAdvancedThisRound = false;
  putSurvivorsAtTag(st, 'repairable');
  checkPlanProgress(st);
  ok(st.planStep === 3, '第 3 条（齿轮）达成 → 推进到底', `planStep=${st.planStep}`);
  ok(st.planCompletedId === 'plan_careful_repair',
    '**整张计划完成**', String(st.planCompletedId));

  /** 完成之后另一张隐藏 */
  const snap = buildSnapshot(st, 's');
  ok((snap.plans?.cards ?? []).length === 1,
    '**另一张计划卡隐藏**（只剩已完成的那张）',
    JSON.stringify((snap.plans?.cards ?? []).map((c) => c.name)));
  ok((snap.plans?.cards ?? [])[0]?.completed === true, '剩下那张标着"已完成"');
}

/* ═══════════ ④ 换过计划 → 检查时进度清零 ═══════════ */
console.log('=== ④ 本回合换过计划：检查时清零、从第一条重新看 ===');
{
  const st = mk({ planIds: ['plan_careful_repair', 'plan_molotov'] });
  st.planCurrentId = 'plan_careful_repair';
  st.planChangedThisRound = false;
  /** 先推进一条 */
  putSurvivorsAtTag(st, 'repairable');
  checkPlanProgress(st);
  ok(st.planStep === 1, '前提：已有 1 条进度', String(st.planStep));

  /** 换到另一张（燃烧瓶：锤子 → 锤子） */
  st.planChangedThisRound = true;
  st.planCurrentId = 'plan_molotov';
  st.planAdvancedThisRound = false;
  const hammerRoom = putSurvivorsAtTag(st, 'special-hammer');
  checkPlanProgress(st);
  console.log(`   换计划后把三人放到锤子地点「${hammerRoom}」`);
  ok(st.planChangedThisRound === false, '清零只做一次');
  ok(st.planStep === 1,
    '**从新计划的第一条重新看**（锤子地点达成 → 推进到 1）', `planStep=${st.planStep}`);
}

/* ═══════════ ⑤ 接线：`enterNoiseReport` 里真的会检查 ═══════════ */
console.log('=== ⑤ 发现阶段结束后（enterNoiseReport）自动检查 ===');
{
  const st = mk({ planIds: ['plan_careful_repair', 'plan_molotov'] });
  st.planCurrentId = 'plan_careful_repair';
  st.planChangedThisRound = false;
  st.planAdvancedThisRound = false;
  st.phase = 'discovery';
  putSurvivorsAtTag(st, 'repairable');
  const from = st.logs.length;
  enterNoiseReport(st);
  const lines = st.logs.slice(from).map((l) => l.text);
  ok(lines.some((t) => t.includes('【变体3】')),
    '**战报里出现了变体3 的检查记录**',
    lines.filter((t) => t.includes('【变体3】')).join(' | ') || '（没有）');
  ok(st.planStep === 1, '而且真的推进了', `planStep=${st.planStep}`);
}

/* ═══════════ ⑥ 坍塌会清掉该地点的计划标记 ═══════════ */
console.log('=== ⑥ 地图计划标记：坍塌会清掉 ===');
{
  const st = mk({ planIds: ['plan_buzzer', 'plan_molotov'] });
  const room = st.map.rooms[0].id;
  const other = st.map.rooms[1].id;
  st.planMarkers = [room, other];
  applyCollapse(st, room);
  ok(!(st.planMarkers ?? []).includes(room),
    '**塌掉那个地点的计划标记被清掉**', JSON.stringify(st.planMarkers));
  ok((st.planMarkers ?? []).includes(other), '别处的标记留着');
}

console.log(`\n变体3 计划卡核心：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
