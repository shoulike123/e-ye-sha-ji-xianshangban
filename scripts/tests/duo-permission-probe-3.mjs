/**
 * 1对1 越权探测 **第三轮** + **单人热座对照**（只读，不改游戏代码）。
 *
 * 这一轮修掉的东西（`engine.ts` 五处"豁免写太宽"）：
 *   · `discardKillerCard` / `removeBoardBlockade`：原来 `&& state.killerId` 只看"这局有杀手"，
 *     1对1 里幸存者玩家（对手）就能替杀手弃牌 / 拆封堵
 *   · `pickPlan`：反过来，杀手能替幸存者方选计划
 *   · `chooseDiscovery` / `acknowledgeDiscovery`：`socketId === state.hostId` 豁免，
 *     而 1对1 里房主**就是杀手**
 *
 * 断言是**双向**的：
 *   · 越权动作**必须被拒绝**（`expect: 'refuse'`）
 *   · 单人热座里同一批动作**必须仍然通过**（`expect: 'accept'`）——
 *     那是"房主一人同时管杀手和幸存者"，不能被我改坏
 *
 * 跑法：node scripts/tests/duo-permission-probe-3.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const rows = [];

function newDuo({ variant3 = false } = {}) {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  if (variant3) st.variant3 = true;
  return st;
}

/** 单人热座：只有一根网线（房主），同时管杀手和幸存者 */
function newSolo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  return st;
}

function probe(label, who, action, setup = null, expect = 'refuse') {
  const st = setup?.solo ? newSolo() : newDuo(setup?.opts ?? {});
  if (setup?.fn) setup.fn(st);
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const ctx = {
    st, s1: survivors[0]?.id, s2: survivors[1]?.id,
    killer: st.killerId, hand: [...(st.killers[st.killerId]?.hand ?? [])],
  };
  const a = typeof action === 'function' ? action(ctx) : action;
  let err = null;
  try { handleAction(st, who, a, content); } catch (e) { err = e.message; }
  const accepted = err === null;
  /**
   * 「热座必须仍然通过」那一组的判定只看**权限类**错误 ——
   * 脚本摆的 `discoveryOptions` 和真实牌堆对不上时，引擎会报"这张不是本次摸到的牌"，
   * 那是**已经过了权限关**、只是测试数据不对，不该算成"权限把热座挡了"。
   */
  const PERM_ERR = /无权|仅杀手|仅幸存者|只有幸存者|只有房主|还没轮到你/;
  const bad = expect === 'refuse' && accepted;                        // 该拒却过了
  const missing = expect === 'accept' && !accepted && PERM_ERR.test(err ?? ''); // 该过却被权限挡了
  rows.push({ label, who, accepted, action: a, err, expect, bad, missing });
  const mark = bad ? '⚠ 该拒却通过' : missing ? '⚠ 该过却被拒' : accepted ? '通过 ✓' : '拒绝 ✓';
  console.log(`  ${mark}  ${label}`);
  console.log(`          ${JSON.stringify(a)}${accepted ? '' : `  ← ${err}`}`);
}

console.log('=== 1对1：这些越权动作必须被拒绝 ===');
probe('幸存者替杀手弃牌', 's',
  (c) => ({ type: 'discardKillerCard', cardId: c.hand[0] }),
  { fn: (st) => { st.pendingKillerDiscards = 1; } });
probe('幸存者移除场上封堵', 's',
  { type: 'removeBoardBlockade', doorId: 'B1|B2' },
  { fn: (st) => { st.blockades = ['B1|B2']; } });
probe('杀手选幸存者的计划卡', 'h',
  { type: 'pickPlan', planId: 'plan_careful_repair' },
  { opts: { variant3: true }, fn: (st) => { st.plans = ['plan_careful_repair', 'plan_molotov']; } });
probe('杀手替幸存者选发现牌', 'h',
  (c) => ({ type: 'chooseDiscovery', cardId: c.st.discoveryOptions?.[0]?.id ?? 'dc_map' }),
  { fn: (st) => {
    st.phase = 'discovery';
    st.pendingDiscoveryPick = false;
    st.discoveryOptions = (content.cards.discovery ?? []).slice(0, 2);
    st.discoveryActorId = Object.values(st.players).find((p) => p.faction === 'survivor')?.id ?? null;
  } });
probe('杀手替幸存者确认发现阶段', 'h',
  { type: 'acknowledgeDiscovery' },
  { fn: (st) => { st.phase = 'discovery'; st.pendingDiscoveryPick = false; st.discoveryOptions = []; } });
probe('杀手替幸存者结束大回合', 'h', { type: 'finishSurvivorPhase' });

console.log('\n=== 单人热座：同一批动作必须**仍然通过**（房主一人全控）===');
probe('热座：房主替杀手弃牌', 'h',
  (c) => ({ type: 'discardKillerCard', cardId: c.hand[0] }),
  { solo: true, fn: (st) => { st.pendingKillerDiscards = 1; } }, 'accept');
probe('热座：房主确认发现阶段', 'h',
  { type: 'acknowledgeDiscovery' },
  { solo: true, fn: (st) => { st.phase = 'discovery'; st.pendingDiscoveryPick = false; st.discoveryOptions = []; } }, 'accept');
probe('热座：房主选发现牌', 'h',
  (c) => ({ type: 'chooseDiscovery', cardId: c.st.discoveryOptions?.[0]?.id ?? 'dc_map' }),
  { solo: true, fn: (st) => {
    st.phase = 'discovery';
    st.pendingDiscoveryPick = false;
    st.discoveryOptions = (content.cards.discovery ?? []).slice(0, 2);
    st.discoveryActorId = Object.values(st.players).find((p) => p.faction === 'survivor')?.id ?? null;
  } }, 'accept');

const bad = rows.filter((r) => r.bad);
const missing = rows.filter((r) => r.missing);
console.log('\n════════ 汇总 ════════');
console.log(`共探测 ${rows.length} 条：越权被接受 ${bad.length} 条、热座被误拒 ${missing.length} 条`);
for (const b of bad) console.log(`  ⚠ 该拒却通过：${b.label}   ${JSON.stringify(b.action)}`);
for (const m of missing) console.log(`  ⚠ 该过却被拒：${m.label}   ← ${m.err}`);
if (bad.length || missing.length) process.exit(1);
console.log('\n✅ 越权全部挡住，单人热座不受影响。');
process.exit(0);
