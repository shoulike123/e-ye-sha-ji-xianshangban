/**
 * **【变体3】计划能力：第一批**（放/响计划标记、立刻修好无线电、弃工具箱换钥匙、
 * 弃护符抽 3 张、完成时的即时效果）。
 *
 * 跑法：node scripts/tests/plan-abilities-1.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { applyPlanAbility } from '../../server/dist/game/plans.js';
import { isKeyCard } from '../../server/dist/game/effects.js';

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
  return st;
}
const actorOf = (st) => Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
const planOf = (st, id) => st.planById[id];
const abilityIndex = (st, planId, impl) =>
  planOf(st, planId).abilities.findIndex((a) => a.impl === impl);
/** 把这张计划标成"已完成"（能力只有完成后才有） */
function complete(st, planId) {
  st.planCompletedId = planId;
}

/* ═══════════ ① 蜂鳴器 ②：在带计划标记的地点发出响声 ═══════════ */
console.log('=== ① 蜂鳴器②：有标记才响 ===');
{
  const st = mk();
  const actor = actorOf(st);
  complete(st, 'plan_buzzer');
  const plan = planOf(st, 'plan_buzzer');
  const i = abilityIndex(st, 'plan_buzzer', 'noiseOnPlanMarker');
  ok(i >= 0, '找到「在带计划标记的地点响」这条能力', String(i));

  /** 没有标记 → 不响，并写一条说明 */
  st.noises = [];
  const from = st.logs.length;
  applyPlanAbility(st, plan, i, actor.id);
  ok(!(st.noises ?? []).length, '**没标记时不响**', JSON.stringify(st.noises));
  ok(st.logs.slice(from).some((l) => l.text.includes('没有计划标记')),
    '并说明了原因', st.logs.slice(from).map((l) => l.text).join(' | '));

  /** 有标记 → 响 */
  st.planMarkers = [actor.roomId];
  st.noises = [];
  applyPlanAbility(st, plan, i, actor.id);
  ok((st.noises ?? []).includes(actor.roomId),
    '**有标记 → 在该地点发出响声**', JSON.stringify(st.noises));
}

/* ═══════════ ② 自製無線電：弃 3 工具箱 → 立刻修好 + 响声 ═══════════ */
console.log('=== ② 自製無線電：立刻完成修理 ===');
{
  const st = mk();
  const actor = actorOf(st);
  complete(st, 'plan_radio');
  const plan = planOf(st, 'plan_radio');
  const i = abilityIndex(st, 'plan_radio', 'finishRepairNow');
  actor.items.toolbox = 3;
  st.repairProgress = 1;
  st.noises = [];
  applyPlanAbility(st, plan, i, actor.id);
  console.log(`   修理 ${1} → ${st.repairProgress}/${st.rules.repairNeeded}；` +
    `工具箱 ${actor.items.toolbox ?? 0}；响声 ${JSON.stringify(st.noises)}`);
  ok(st.repairProgress === st.rules.repairNeeded,
    '**修理进度直接拉满**', `${st.repairProgress}/${st.rules.repairNeeded}`);
  ok((actor.items.toolbox ?? 0) === 0,
    '**扣掉 3 个工具箱**', String(actor.items.toolbox ?? 0));
  ok((st.noises ?? []).includes(actor.roomId),
    '**在你的地点发出响声**', JSON.stringify(st.noises));
}

/* ═══════════ ③ 萬能鑰匙：从线索牌库底部取出钥匙 ═══════════ */
console.log('=== ③ 萬能鑰匙：弃一个工具箱 → 拿线索牌库底部的钥匙 ===');
{
  const st = mk();
  const actor = actorOf(st);
  complete(st, 'plan_master_key');
  const plan = planOf(st, 'plan_master_key');
  const i = abilityIndex(st, 'plan_master_key', 'spendToolboxForKey');
  actor.items.toolbox = 1;
  /** 把一张钥匙卡塞到搜索牌库**底部**，前面放两张普通牌 */
  const keyCard = content.cards.search.find((c) => isKeyCard(c));
  ok(Boolean(keyCard), '内容里有一张钥匙卡', keyCard?.id ?? '（没有）');
  const plain = content.cards.search.filter((c) => !isKeyCard(c)).slice(0, 2).map((c) => c.id);
  st.searchDeck = [...plain, keyCard.id];
  const deckBefore = st.searchDeck.length;
  const keysBefore = st.keysCollected;
  applyPlanAbility(st, plan, i, actor.id);
  console.log(`   搜索牌库 ${deckBefore} → ${st.searchDeck.length}；钥匙 ${keysBefore} → ${st.keysCollected}`);
  ok(st.searchDeck.length === deckBefore - 1, '**牌库少 1 张（就是那张钥匙）**',
    String(st.searchDeck.length));
  ok(!st.searchDeck.includes(keyCard.id), '**拿走的正是底部那张钥匙**');
  ok(st.keysCollected === keysBefore + 1, '**钥匙上架 +1**', String(st.keysCollected));
  ok((actor.items.toolbox ?? 0) === 0, '工具箱被扣掉', String(actor.items.toolbox ?? 0));
  /** 一次性：再用一次应该被 `planAbilityBlockReason` 挡住（这里直接看记录） */
  ok(st.planUsedAbilities.includes('plan_master_key#' + i),
    '记进了"本局已用"（每场一次）', JSON.stringify(st.planUsedAbilities));
}

/* ═══════════ ④ 古代箱子：弃护符 → 抽 3 张搜索牌 ═══════════ */
console.log('=== ④ 古代箱子：抽 3 张 ===');
{
  const st = mk();
  const actor = actorOf(st);
  complete(st, 'plan_ancient_chest');
  const plan = planOf(st, 'plan_ancient_chest');
  const i = abilityIndex(st, 'plan_ancient_chest', 'spendAmuletDraw3');
  actor.items.amulet = 1;
  const deckBefore = st.searchDeck.length;
  const handBefore = Object.values(actor.items).reduce((a, b) => a + b, 0);
  applyPlanAbility(st, plan, i, actor.id);
  const handAfter = Object.values(actor.items).reduce((a, b) => a + b, 0);
  console.log(`   搜索牌库 ${deckBefore} → ${st.searchDeck.length}；背包件数 ${handBefore} → ${handAfter}`);
  ok(st.searchDeck.length <= deckBefore - 3,
    '**抽了 3 张搜索牌**', `${deckBefore} → ${st.searchDeck.length}`);
  ok((actor.items.amulet ?? 0) === 0, '**护符被弃掉**', String(actor.items.amulet ?? 0));
}

/* ═══════════ ⑤ 完成时的即时效果：放标记 / 螺旋地点响 ═══════════ */
console.log('=== ⑤ 完成计划时的即时效果 ===');
{
  /** 反擊！暗中伏擊：立刻在幸存者地点放计划标记 */
  const st = mk();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  const rooms = st.map.rooms.filter((r) => r.id !== st.players[st.killerId].roomId);
  survs[0].roomId = rooms[0].id;
  survs[1].roomId = rooms[0].id;
  survs[2].roomId = rooms[1].id;
  st.planMarkers = [];
  const plan = planOf(st, 'plan_ambush');
  const i = abilityIndex(st, 'plan_ambush', 'placePlanMarkerAtSurvivors');
  applyPlanAbility(st, plan, i, survs[0].id);
  console.log(`   幸存者所在地点：${rooms[0].id}（2 人）、${rooms[1].id}（1 人）；` +
    `计划标记 = ${JSON.stringify(st.planMarkers)}`);
  ok(st.planMarkers.includes(rooms[0].id) && st.planMarkers.includes(rooms[1].id),
    '**每个有幸存者的地点都放了标记**（同地只放一个）',
    JSON.stringify(st.planMarkers));
  ok(new Set(st.planMarkers).size === st.planMarkers.length, '没有重复标记');

  /** 反擊！奧術封印：完成时在螺旋地点响 */
  const st2 = mk();
  st2.noises = [];
  const spiral = st2.map.rooms.find((r) => (r.tags ?? []).includes('special-spiral'))?.id;
  const plan2 = planOf(st2, 'plan_arcane_seal');
  const j = abilityIndex(st2, 'plan_arcane_seal', 'noiseAtSpiral');
  applyPlanAbility(st2, plan2, j, actorOf(st2).id);
  ok(Boolean(spiral) && (st2.noises ?? []).includes(spiral),
    '**在螺旋地点发出响声**', `${spiral} / noises=${JSON.stringify(st2.noises)}`);
}

/* ═══════════ ⑥ 行动入口：`usePlanAbility` 会走完同一条路 ═══════════ */
console.log('=== ⑥ 行动入口 usePlanAbility ===');
{
  const st = mk();
  const actor = actorOf(st);
  complete(st, 'plan_buzzer');
  /** 蜂鸣器①：弃一个工具箱放标记（每场一次） */
  actor.items.toolbox = 1;
  const i = abilityIndex(st, 'plan_buzzer', 'placePlanMarker');
  const err = (() => {
    try {
      handleAction(st, 's', { type: 'usePlanAbility', planId: 'plan_buzzer', index: i }, content);
      return null;
    }
    catch (e) { return String(e?.message ?? e); }
  })();
  ok(!err, '**通过行动入口发动成功**', String(err ?? ''));
  ok((st.planMarkers ?? []).includes(actor.roomId),
    '计划标记放在了他所在地点', JSON.stringify(st.planMarkers));
  ok((actor.items.toolbox ?? 0) === 0, '工具箱被扣掉');
  /** 再来一次：每场一次 → 被拒 */
  actor.items.toolbox = 1;
  const err2 = (() => {
    try {
      handleAction(st, 's', { type: 'usePlanAbility', planId: 'plan_buzzer', index: i }, content);
      return null;
    }
    catch (e) { return String(e?.message ?? e); }
  })();
  ok(Boolean(err2) && err2.includes('已经用过'),
    '**每场一次的能力第二次会被拒**', String(err2 ?? '（竟然成功了）'));
  /** 没完成的计划不能发动能力 */
  st.planCompletedId = null;
  const err3 = (() => {
    try {
      handleAction(st, 's', { type: 'usePlanAbility', planId: 'plan_buzzer', index: i }, content);
      return null;
    }
    catch (e) { return String(e?.message ?? e); }
  })();
  ok(Boolean(err3) && err3.includes('还没完成'),
    '**计划没完成不能发动它的能力**', String(err3 ?? '（竟然成功了）'));
}

console.log(`\n变体3 计划能力（第一批）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
