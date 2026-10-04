/**
 * **【变体3】计划能力：被动三条**（接进修理与防御的现有流程）。
 *
 *  - 謹慎修理：修理本身的响声被压住
 *  - 機械藍圖：每次修理**额外放一个修理标记**（+2）
 *  - 燃燒瓶：防御时弃一个威士忌酒瓶 **+2**（不占防御物品名额）
 *
 * 跑法：node scripts/tests/plan-abilities-2.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
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
  /** 保证"修理会响"这条规则开着，才好验证"压住响声" */
  st.rules.repairMakesNoise = true;
  /** 幸存者挪到修理地点；杀手挪到别处（与杀手同地不能修理） */
  const repairRoom = st.map.rooms.find((r) => (r.tags ?? []).includes('repairable')) ?? st.map.rooms[0];
  const away = st.map.rooms.find((r) => r.id !== repairRoom.id) ?? st.map.rooms[0];
  st.players[st.killerId].roomId = away.id;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = repairRoom.id;
  }
  /** ⚠ 修理是"幸存者一般行动"：要真的轮到某个人（`assertSurvivorMainAction`） */
  st.pendingSurvivorPick = false;
  st.encounter = null;
  const firstSurv = st.turnOrder.find((id) => st.players[id]?.faction === 'survivor');
  st.activeSurvivorIndex = Math.max(0, st.turnOrder.indexOf(firstSurv ?? ''));
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') {
      p.mainActionUsed = false;
      p.actedThisRound = false;
      p.moveLeft = 2;
    }
  }
  return { st, repairRoom };
}
/** 造一场"轮到某人防御"的遭遇（每个场景各造一份，别复用被改过的对象） */
function mkDefendEncounter(st, surv) {
  const killer = st.players[st.killerId];
  killer.roomId = surv.roomId;
  st.phase = 'encounter';
  st.encounter = {
    roomId: surv.roomId,
    targetId: surv.id,
    targets: [surv.id],
    step: 'defend',
    attackBoost: false,
    attackChoiceMade: true,
    attackCardId: null,
    fleeQueue: [surv.id],
    fled: [],
    defenses: {},
    blockItems: false,
    executeArmed: false,
    executeStatueId: null,
    source: 'search',
  };
  return st.encounter;
}
const actorOf = (st) => Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
const tryIt = (st, action, socketId = 's') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/* ═══════════ ① 謹慎修理：修理不响 ═══════════ */
console.log('=== ① 謹慎修理：修理本身的响声被压住 ===');
{
  /** 对照：没完成计划 → 修理照响 */
  const a = mk();
  a.st.repairedThisPhase = false;
  a.st.planCompletedId = null;
  a.st.noises = [];
  const e0 = tryIt(a.st, { type: 'repair' });
  ok(!e0, '对照：普通修理能进行', String(e0 ?? ''));
  ok((a.st.noises ?? []).includes(a.repairRoom.id),
    '对照：**没这张计划时修理会响**', JSON.stringify(a.st.noises));

  /** 完成謹慎修理 → 修理不响 */
  const b = mk();
  b.st.repairedThisPhase = false;
  b.st.planCompletedId = 'plan_careful_repair';
  b.st.noises = [];
  const e1 = tryIt(b.st, { type: 'repair' });
  ok(!e1, '完成计划后修理照样能做', String(e1 ?? ''));
  ok(!(b.st.noises ?? []).includes(b.repairRoom.id),
    '**修理不再发出响声**', JSON.stringify(b.st.noises));
  ok(b.st.repairProgress === 1, '进度照常 +1', String(b.st.repairProgress));
}

/* ═══════════ ② 機械藍圖：额外放一个修理标记（+2） ═══════════ */
console.log('=== ② 機械藍圖：每次修理 +2 ===');
{
  const a = mk();
  a.st.repairedThisPhase = false;
  a.st.repairProgress = 0;
  tryIt(a.st, { type: 'repair' });
  ok(a.st.repairProgress === 1, '对照：普通修理 +1', String(a.st.repairProgress));

  const b = mk();
  b.st.repairedThisPhase = false;
  b.st.repairProgress = 0;
  b.st.planCompletedId = 'plan_blueprint';
  const e = tryIt(b.st, { type: 'repair' });
  ok(!e, '完成機械藍圖后修理能进行', String(e ?? ''));
  ok(b.st.repairProgress === 2,
    '**一次修理放两个修理标记（+2）**', String(b.st.repairProgress));
}

/* ═══════════ ③ 燃燒瓶：防御确认**之后**再弃威士忌 +2 ═══════════ */
console.log('=== ③ 燃燒瓶：防御物品确认之后再弃威士忌酒瓶 +2 ===');
{
  const st = mk().st;
  const surv = actorOf(st);
  /** 造一场遭遇：杀手与幸存者同地，进入防御步骤 */
  mkDefendEncounter(st, surv);
  /** 计划已完成 + 手里有一个威士忌酒瓶 */
  st.planCompletedId = 'plan_molotov';
  surv.items.whiskey = 1;

  /**
   * 第一段：确认防御物品 —— 这一步**不该掷骰**，而是把"要不要弃威士忌"问出来。
   * （用户口径：酒瓶那一问要**排在防御物品确认之后**。）
   */
  const err = tryIt(st, { type: 'playEncounterDefense', itemId: null });
  ok(!err, '确认防御物品这一步能进行', String(err ?? ''));
  ok(st.encounter?.whiskeyOffer?.playerId === surv.id,
    '**确认之后挂出"要不要弃威士忌"这一问**', JSON.stringify(st.encounter?.whiskeyOffer ?? null));
  ok(!st.lastDiceRoll || st.lastDiceRoll.defense === undefined,
    '还没掷骰（等这一问答完）', JSON.stringify(st.lastDiceRoll ?? null));
  ok((surv.items.whiskey ?? 0) === 1, '酒瓶还在身上', String(surv.items.whiskey ?? 0));

  /** 第二段：回答"弃置" */
  const err2 = tryIt(st, { type: 'confirmWhiskeyDefense', use: true });
  ok(!err2, '回答"弃置威士忌"成功', String(err2 ?? ''));
  console.log(`   威士忌剩 ${surv.items.whiskey ?? 0}；战报：` +
    st.logs.slice(-3).map((l) => l.text).join(' | '));
  ok((surv.items.whiskey ?? 0) === 0,
    '**威士忌酒瓶被弃掉**', String(surv.items.whiskey ?? 0));
  ok(st.survivorDiscard.includes('whiskey'), '**进的是物品弃牌堆（弃置）**',
    JSON.stringify(st.survivorDiscard.slice(-3)));
  ok(st.logs.some((l) => l.text.includes('弃置') && l.text.includes('+2')),
    '战报写明"弃置"和 +2');
  ok(!st.encounter?.whiskeyOffer, '这一问已经结算完，不再挂着');
  ok(Boolean(st.encounter === null || st.lastDiceRoll), '答完才掷骰/结算',
    JSON.stringify(st.lastDiceRoll?.total ?? null));

  /** 回答"不用" → 酒瓶留着 */
  const st3 = mk().st;
  const surv3 = actorOf(st3);
  mkDefendEncounter(st3, surv3);
  st3.planCompletedId = 'plan_molotov';
  surv3.items.whiskey = 1;
  tryIt(st3, { type: 'playEncounterDefense', itemId: null });
  const err3 = tryIt(st3, { type: 'confirmWhiskeyDefense', use: false });
  ok(!err3, '回答"不用"也能继续', String(err3 ?? ''));
  ok((surv3.items.whiskey ?? 0) === 1,
    '**不弃的话酒瓶留着**', String(surv3.items.whiskey ?? 0));

  /** 没完成计划时：根本不问这一步 */
  const st2 = mk().st;
  const surv2 = actorOf(st2);
  mkDefendEncounter(st2, surv2);
  surv2.items.whiskey = 1;
  const err4 = tryIt(st2, { type: 'playEncounterDefense', itemId: null });
  ok(!err4, '没完成计划时照常防御', String(err4 ?? ''));
  ok(!st2.encounter?.whiskeyOffer, '**没完成计划就不会有这一问**',
    JSON.stringify(st2.encounter?.whiskeyOffer ?? null));
  const err5 = tryIt(st2, { type: 'confirmWhiskeyDefense', use: true });
  ok(Boolean(err5), '没挂着这一问时点它会报错', String(err5 ?? ''));
  ok((surv2.items.whiskey ?? 0) === 1,
    '**没完成计划时不会误弃威士忌**', String(surv2.items.whiskey ?? 0));

  /**
   * **弃置 ≠ 使用物品**：威廉「坚韧不拔」照样 +1
   * （用户口径：酒瓶不算防御物品、也不算使用物品，不影响威廉和剛毅之盾）。
   */
  const st4 = mk().st;
  const surv4 = actorOf(st4);
  mkDefendEncounter(st4, surv4);
  surv4.characterId = 'surv_runner';
  surv4.name = '威廉';
  st4.planCompletedId = 'plan_molotov';
  surv4.items.whiskey = 1;
  st4.killerPower = 0;
  tryIt(st4, { type: 'playEncounterDefense', itemId: null });
  tryIt(st4, { type: 'confirmWhiskeyDefense', use: true });
  ok(
    st4.logs.some((l) => l.text.includes('坚韧不拔') && l.text.includes('+1')),
    '**弃威士忌不影响威廉「坚韧不拔」的 +1**',
    st4.logs.slice(-4).map((l) => l.text).join(' | '),
  );

  /**
   * **也不影响剛毅之盾**：盾（+1，不占名额）和"弃威士忌 +2"可以一起用，
   * 两者各自单独结算。
   */
  const st5 = mk().st;
  const surv5 = actorOf(st5);
  mkDefendEncounter(st5, surv5);
  st5.planCompletedId = 'plan_molotov';
  surv5.items.whiskey = 1;
  /** 遗物就是背包里的物品（`relic_shield` = 剛毅之盾） */
  surv5.items.relic_shield = 1;
  st5.killerPower = 0;
  const errShield = tryIt(st5, { type: 'playEncounterDefense', itemId: null, shield: true });
  ok(!errShield, '同時用剛毅之盾 + 確認防御能进行', String(errShield ?? ''));
  tryIt(st5, { type: 'confirmWhiskeyDefense', use: true });
  ok(st5.encounter?.shieldUsed?.[surv5.id] === true, '剛毅之盾生效（`shieldUsed`）',
    JSON.stringify(st5.encounter?.shieldUsed ?? null));
  ok(st5.logs.some((l) => l.text.includes('剛毅之盾') && l.text.includes('+1')),
    '**剛毅之盾照样 +1**', st5.logs.slice(-5).map((l) => l.text).join(' | '));
}

console.log(`\n变体3 计划能力（被动三条）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
