/**
 * 1对1 越权探测 **第二轮**（只读，不改任何游戏代码）。
 *
 * 第一轮（`duo-permission-probe.mjs`）的结论：
 *   · 22 条里只有 1 条真可疑 —— **幸存者能替杀手弃牌**（`discardKillerCard`）
 *   · 另一条"杀手在杀手回合搜索"是**我的标签写错了**（那是杀手的正常主要行动）
 *
 * 这一轮做三件事：
 *   ① 把"替杀手弃牌"的**实际影响**验出来（杀手手牌到底被动没动）
 *   ② 覆盖第一轮没测到的阶段：响声 / 发现 / 遭遇 / upkeep
 *   ③ 对照验证"杀手搜索"确实合法（证明第一轮那条不是 bug）
 *
 * 跑法：node scripts/tests/duo-permission-probe-2.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const rows = [];

function newDuo(mapId = 'cabin', killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerId;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  return st;
}

function probe(label, who, action, setup = null, expectRefuse = true) {
  const st = newDuo();
  if (setup) setup(st);
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const ctx = { st, s1: survivors[0]?.id, s2: survivors[1]?.id, killer: st.killerId, hand: st.killers[st.killerId]?.hand ?? [] };
  const a = typeof action === 'function' ? action(ctx) : action;
  let err = null;
  try { handleAction(st, who, a, content); } catch (e) { err = e.message; }
  const accepted = err === null;
  rows.push({ label, accepted, expectRefuse, bad: expectRefuse && accepted, action: a });
  console.log(`  ${accepted ? (expectRefuse ? '⚠ 被接受' : '被接受') : '被拒绝'}  ${label}${accepted ? '' : `  ← ${err}`}`);
  return { st, accepted, ctx };
}

/* ═════ ① 替杀手弃牌的完整影响 ═════ */
console.log('=== ①「幸存者替杀手弃牌」的实际影响 ===');
{
  const { st, ctx } = probe(
    '幸存者发 discardKillerCard',
    's',
    (c) => ({ type: 'discardKillerCard', cardId: c.hand[0] }),
    (s) => { s.pendingKillerDiscards = 1; },
  );
  const after = st.killers[st.killerId]?.hand ?? [];
  console.log(`\n     杀手手牌：${JSON.stringify(ctx.hand)}`);
  console.log(`     弃牌之后：${JSON.stringify(after)}`);
  console.log(`     杀手弃牌堆：${JSON.stringify(st.killerDiscard ?? [])}`);
  console.log(`     还要弃几张（pendingKillerDiscards）：${st.pendingKillerDiscards}`);
  const reallyDiscarded = ctx.hand.length - after.length === 1 && !after.includes(ctx.hand[0]);
  console.log(`     → 杀手手牌**确实少了一张**：${reallyDiscarded ? '是 ⚠ 影响确凿' : '否'}`);
}

/* ═════ ② 对照：杀手搜索是合法的（第一轮那条不算 bug）═════ */
console.log('\n=== ② 对照：杀手在杀手回合搜索（应该是合法的）===');
{
  const toKillerMain = (st) => {
    st.phase = 'killerMain';
    st.killerTurnStep = 'main';
    st.killerMainChoice = 'actions';
    st.killerMainActionsLeft = 2;
  };
  probe('杀手搜索（该合法）', 'h', { type: 'search' }, toKillerMain, false);
}

/* ═════ ③ 响声阶段 ═════ */
console.log('\n=== ③ 响声阶段（该动的是杀手确认）===');
{
  const toNoise = (st) => { st.phase = 'noiseReport'; };
  probe('幸存者替杀手确认响声', 's', { type: 'acknowledgeNoise' }, toNoise);
  probe('杀手自己确认响声（该合法）', 'h', { type: 'acknowledgeNoise' }, toNoise, false);
  probe('幸存者在响声阶段搜索', 's', { type: 'search' }, toNoise);
  probe('幸存者在响声阶段移动', 's', { type: 'move', toRoomId: 'B5' }, toNoise);
}

/* ═════ ④ 发现阶段 ═════ */
console.log('\n=== ④ 发现阶段（该动的是幸存者翻牌）===');
{
  const toDiscovery = (st) => {
    st.phase = 'discovery';
    st.pendingDiscoveryPick = true;
    st.discoveryOptions = [];
  };
  probe('杀手替幸存者选翻牌的人', 'h', (c) => ({ type: 'pickSurvivorTurn', playerId: c.s1 }), toDiscovery);
  probe('幸存者自己选翻牌的人（该合法）', 's', (c) => ({ type: 'pickSurvivorTurn', playerId: c.s1 }), toDiscovery, false);
  probe('杀手在发现阶段搜索', 'h', { type: 'search' }, toDiscovery);
  probe('杀手替幸存者结束发现阶段', 'h', { type: 'finishSurvivorPhase' }, toDiscovery);
}

/* ═════ ⑤ upkeep（回合收尾）═════ */
console.log('\n=== ⑤ upkeep（回合收尾）===');
{
  const toUpkeep = (st) => { st.phase = 'upkeep'; };
  probe('幸存者在 upkeep 移动', 's', { type: 'move', toRoomId: 'B5' }, toUpkeep);
  probe('幸存者在 upkeep 搜索', 's', { type: 'search' }, toUpkeep);
  probe('幸存者在 upkeep 结束别人的回合', 's', { type: 'endTurn' }, toUpkeep);
}

/* ═════ ⑥ 遭遇中 ═════ */
console.log('\n=== ⑥ 遭遇中（该动的是杀手出攻击 / 幸存者防御）===');
{
  const toEncounter = (st) => {
    const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor');
    const killer = st.players[st.killerId];
    killer.roomId = survivors[0].roomId ?? st.map.rooms[0].id;
    survivors[0].roomId = killer.roomId;
    st.encounter = { roomId: killer.roomId, attackerId: st.killerId, targetIds: [survivors[0].id] };
  };
  probe('幸存者替杀手掷骰', 's', { type: 'resolveEncounterDice' }, toEncounter);
  probe('幸存者替杀手出攻击牌', 's', { type: 'playEncounterAttack', cardId: null, boost: false }, toEncounter);
  probe('杀手替幸存者撤离', 'h', (c) => ({ type: 'pickFleeSurvivor', targetPlayerId: c.s1 }), toEncounter);
  probe('杀手替幸存者用防御物品', 'h', { type: 'confirmAmulet', use: true }, toEncounter);
}

const bad = rows.filter((r) => r.bad);
console.log(`\n════════ 汇总 ════════`);
console.log(`共探测 ${rows.length} 条，其中 ${bad.length} 条「本该被拒却通过了」：`);
for (const b of bad) console.log(`  ⚠ ${b.label}   ${JSON.stringify(b.action)}`);
if (bad.length) {
  console.log('\n⚠ 有越权动作被接受 —— 权限校验出现回归。');
  process.exit(1);
}
console.log('\n✅ 全部正确拒绝。');
process.exit(0);
