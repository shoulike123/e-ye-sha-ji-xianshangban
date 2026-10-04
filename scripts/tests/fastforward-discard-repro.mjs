/**
 * 复现脚本：solo 模式「幸存者快进」→ 马尔科（survivor3）装备溢出 → pendingItemDiscard
 * 之后，客户端的 `viewerFactionOf`（client/src/GameViews.tsx:927）会走哪一支？
 *
 * 跑法（项目根目录）：& node ".\scripts\tests\fastforward-discard-repro.mjs"
 *
 * 说明：
 *  - 客户端是 TSX、不能直接 import，所以这里把 `viewerFactionOf` 的分支顺序
 *    **逐行照抄**一遍（行号按当前 GameViews.tsx 标注），用**真实快照字段**跑判定，
 *    并把命中的分支名 / 行号打出来。
 *  - 台子用真实公开 API 搭（createLobby / startGame / startRound / handleAction），
 *    只有两处"直接操纵 state"：① 女猎手开局布陷阱跳过；② 给马尔科塞装备到满格
 *    （为了让"发现牌 +1 件"必然溢出）。两处都在下面就地说明。
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, buildSnapshot, handleAction, startRound,
} from '../../server/dist/game/engine.js';
import { enforceInventory } from '../../server/dist/game/effects.js';

const content = loadContent();
const HOST = 'h';

/* ─────────────── 搭台子：solo、地图 cabin、杀手 killer4、幸存者 survivor3/4/1 ─────────────── */
function mkSolo() {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer4';                       // 女猎手，起始力量 3
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor1'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  /**
   * ① 直接操纵 state：女猎手开局要先布 4 个陷阱（phase='trapSetup'）。
   * 本脚本不关心陷阱，把这一步标记为已完成再进第 1 回合 ——
   * 它只影响开局准备，不影响快进 / 发现 / 弃装的任何逻辑。
   */
  if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
  startRound(st);
  st.pendingEvolutionAck = null;
  return st;
}

/** 马尔科在 solo 下的棋子 id 固定是 `${hostId}__surv1`，而且 turnOrder 第 1 位 */
function marcoOf(st) {
  return st.players[`${HOST}__surv1`];
}

/**
 * ② 直接操纵 state：把马尔科塞到**正好满格**（= inventorySlots 件）。
 * 「正好满」是刻意的 —— 快进时"直接选第一张发现物"，只要那是一张 `gainItem`
 * 的牌，`effects.ts:1641` 的 `enforceInventory` 就必然算出 extra = 1。
 */
function fillMarcoToFull(st, cap) {
  const marco = marcoOf(st);
  const pool = ['lime', 'axe', 'shortsword', 'herb', 'lamp', 'whiskey'];
  let i = 0;
  while (Object.values(marco.items).reduce((a, b) => a + b, 0) < cap) {
    const f = pool[i % pool.length];
    i += 1;
    marco.items[f] = (marco.items[f] ?? 0) + 1;
  }
  return marco;
}

const dumpPendings = (st, tag) => {
  console.log(`\n──── ${tag} ────`);
  const fields = [
    'phase', 'mode', 'killerLevel', 'killerPower', 'activeSurvivorIndex', 'pendingSurvivorPick',
    'pendingItemDiscard', 'pendingEvolutionAck', 'pendingOverFearWound', 'pendingWhizSearch',
    'pendingBlockadeJob', 'pendingAmulet', 'pendingUnlockChoice', 'pendingUnlockDiscard',
    'pendingQuietSearch', 'pendingDiscoveryPick', 'discoveryActorId', 'discoveryOptions',
    'killerTurnStep', 'killerMainChoice',
  ];
  for (const f of fields) {
    const v = st[f];
    let s;
    if (v === null || v === undefined) s = String(v);
    else if (typeof v === 'object') s = JSON.stringify(v);
    else s = String(v);
    console.log(`  ${f.padEnd(22)} = ${s.length > 170 ? `${s.slice(0, 170)}…` : s}`);
  }
};

/**
 * 照抄 `client/src/GameViews.tsx` 的 `viewerFactionOf`（927-1015）分支顺序。
 * 返回 `{ hit, result }`；行号按当前文件。
 */
function viewerFactionOfCopy(snap) {
  if (snap.phase === 'crossbowSetup') {
    return { hit: '① crossbowSetup（939）', result: snap.canPickCrossbowHolder ? 'survivor' : 'killer' };
  }
  if (snap.phase === 'traitDraft') {
    return { hit: '② traitDraft（949，本局未开变体1，不会命中）', result: 'survivor' };
  }
  if (snap.pendingCollapseMoves && !snap.pendingCollapseMoves.waiting) {
    return { hit: '③ 坍塌收尾（975）', result: snap.you.faction === 'survivor' ? 'survivor' : 'killer' };
  }
  if (snap.mode === 'solo') {
    if (snap.pendingEvolutionAck || snap.pendingWhizSearch || snap.pendingOverFearWound || snap.pendingBlockadeJob) {
      return { hit: '④ solo：等杀手确认进化/呼啸/恐惧/封堵（979-985）', result: 'killer' };
    }
    if (snap.pendingAmulet) return { hit: '⑤ solo：pendingAmulet（988）', result: 'survivor' };
    if (snap.phase === 'encounter' &&
        (snap.encounter?.step === 'pick' || snap.encounter?.step === 'defend' || snap.encounter?.step === 'flee')) {
      return { hit: '⑥ solo：遭遇里的幸存者步骤（989-995）', result: 'survivor' };
    }
    if (snap.phase === 'killerMain' || snap.phase === 'encounter' ||
        snap.phase === 'noiseReport' || snap.phase === 'upkeep') {
      return { hit: '⑦ solo：**杀手阶段兜底** killerMain/encounter/noiseReport/upkeep（997-998）', result: 'killer' };
    }
    if (snap.phase === 'trapSetup' || snap.phase === 'statueSetup') {
      return { hit: '⑧ solo：开局准备（1006）', result: 'killer' };
    }
    return { hit: '⑨ solo：其余一律幸存者（1009）', result: 'survivor' };
  }
  if (snap.pendingAmulet && snap.you.id === snap.pendingAmulet.playerId) {
    return { hit: '⑩ 非 solo：pendingAmulet 本人（1011）', result: 'survivor' };
  }
  return { hit: '⑪ 非 solo：按 state.you.faction（1014）', result: snap.you.faction };
}

/* ═══════════════════ 步骤 1：搭台子 ═══════════════════ */
const st = mkSolo();
const marco = marcoOf(st);
const cap = content.characters.find((c) => c.id === marco.characterId)?.inventorySlots ?? 3;
console.log('幸存者顺序 turnOrder =', st.turnOrder.join(', '));
console.log('马尔科 id =', marco.id, '|', marco.characterId, '|', marco.name,
  '| roomId =', marco.roomId, '| 背包格数 =', cap);
console.log('马尔科初始背包 =', JSON.stringify(marco.items));
dumpPendings(st, '步骤 1：快进之前');

/* ═══════════════════ 步骤 2：塞满装备 ═══════════════════ */
const marcoFilled = fillMarcoToFull(st, cap);
console.log('\n塞满后马尔科背包 =', JSON.stringify(marcoFilled.items),
  '共', Object.values(marcoFilled.items).reduce((a, b) => a + b, 0), '件 /', cap, '格');

/* ═══════════════════ 步骤 3：把发现牌堆顶两张换成 gainItem 牌 ═══════════════════ */
/**
 * 快进会 `beginDiscoveryDraw`（摸 2 张）再 `resolveDiscoveryChoice(discoveryOptions[0])`
 * —— 永远选第一张。所以把**前两张**都换成 gainItem 牌，保证第 1 张一定加物品。
 * 这是"控制牌堆"，服务端流程完全照常跑。
 */
const gainers = Object.values(content.cards.byId)
  .filter((c) => c.type === 'discovery' && (c.effects ?? []).some((e) => e.op === 'gainItem' && e.itemId !== 'key'));
const c1 = gainers.find((c) => c.id === 'dc_herb_1') ?? gainers[0];
const c2 = gainers.find((c) => c.id !== c1.id);
st.discoveryDeck = [c1.id, c2.id, ...st.discoveryDeck.filter((id) => id !== c1.id && id !== c2.id)];
console.log('发现牌堆顶两张 =', c1.id, `(${c1.name})`, '/', c2.id, `(${c2.name})`);

/* ═══════════════════ 步骤 4：点「快进」（幸存者侧） ═══════════════════ */
console.log('\n>>> handleAction(st, "h", { type: "fastForward" }) —— 幸存者侧快进');
handleAction(st, HOST, { type: 'fastForward' }, content);
console.log('快进后战报尾部：');
for (const line of st.logs.slice(-8)) console.log('   ·', line.text ?? JSON.stringify(line));
dumpPendings(st, '步骤 4：快进之后');

/* ═══════════════════ 步骤 5：buildSnapshot ═══════════════════ */
const snap = buildSnapshot(st, HOST);
console.log('\n──── 步骤 5：buildSnapshot(st, hostId) ────');
console.log('  snap.phase                =', snap.phase,
  st.pendingItemDiscard ? '   ← 修复后：pendingItemDiscard 还挂着，所以停在 discovery（不再提前进 noiseReport）' : '');
console.log('  snap.you.id               =', snap.you.id);
console.log('  snap.you.name             =', snap.you.name);
console.log('  snap.you.faction          =', snap.you.faction,
  snap.you.faction === 'survivor' ? '  ← 幸存者界面（修复前这里是 killer）' : '  ← 杀手界面（说明闸门没生效）');
console.log('  snap.controllingActive    =', snap.controllingActive);
console.log('  snap.activePlayerId       =', snap.activePlayerId, '  ← 服务端认为该行动的是马尔科');
console.log('  snap.pendingItemDiscard   =', JSON.stringify(snap.pendingItemDiscard));
console.log('  snap.yourKillerHand       =', JSON.stringify(snap.yourKillerHand));
console.log('  snap.encounter            =', JSON.stringify(snap.encounter));

/* ═══════════════════ 步骤 6：viewerFactionOf 分支判定 ═══════════════════ */
const vf = viewerFactionOfCopy(snap);
console.log('\n──── 步骤 6：viewerFactionOf（照抄分支）────');
console.log('  命中分支            =', vf.hit);
console.log('  viewerFactionOf 返回 =', JSON.stringify(vf.result));
console.log('  弃牌面板（GameViews.tsx:4223）条件：pendingItemDiscard.items != null →',
  snap.pendingItemDiscard?.items != null, '→ 面板照样渲染，列的是马尔科的物品');
console.log(`  于是：界面 = ${vf.result === 'killer' ? '杀手视角' : '幸存者视角'}，弃牌按钮 = 马尔科的物品`,
  vf.result === 'killer' ? '—— 与用户截图一致（这是修好之前的旧行为）' : '—— 一致，正常');

/* ═══════════════════ 步骤 7：最小修复的验证（模拟"修好之后"的状态） ═══════════════════ */
/**
 * 修复点在服务端 `fastForwardSurvivors`：`pendingItemDiscard` 还挂着时**不要**
 * 推进入响声阶段（`resolveDiscoveryChoice` 里已经有同样的闸，见 engine.ts:3508）。
 * 这里**不改源码**，只是把状态手工摆成"那道闸生效后应有的样子"（phase 留在 discovery），
 * 再跑一遍分支判定，确认界面会回到幸存者侧。
 */
const stFixed = mkSolo();
const marcoFixed = fillMarcoToFull(stFixed, cap);
marcoFixed.items.herb = (marcoFixed.items.herb ?? 0) + 1;      // 溢出 1 件
enforceInventory(stFixed, marcoFixed.id);                       // 挂上 pendingItemDiscard
stFixed.phase = 'discovery';                                    // ← 模拟修复后停在发现阶段
const snapFixed = buildSnapshot(stFixed, HOST);
const vfFixed = viewerFactionOfCopy(snapFixed);
console.log('\n──── 步骤 7：模拟"修复后"（phase 停在 discovery）────');
console.log('  st.phase                =', stFixed.phase);
console.log('  st.pendingItemDiscard   =', JSON.stringify(stFixed.pendingItemDiscard));
console.log('  snap.you.name/faction   =', snapFixed.you.name, '/', snapFixed.you.faction);
console.log('  snap.pendingItemDiscard =', JSON.stringify(snapFixed.pendingItemDiscard));
console.log('  命中分支                =', vfFixed.hit);
console.log('  viewerFactionOf 返回     =', JSON.stringify(vfFixed.result), '  ← 回到幸存者界面');

/* ═══════════════════ 步骤 8：反证 —— 只要 phase 落进杀手阶段就一定误判 ═══════════════════ */
const st2 = mkSolo();
const marco2 = fillMarcoToFull(st2, cap);
marco2.items.herb = (marco2.items.herb ?? 0) + 1;
st2.phase = 'killerMain';
st2.killerTurnStep = 'main';
st2.killerMainChoice = 'actions';
st2.killerMainActionsLeft = 2;
enforceInventory(st2, marco2.id);
const snap2 = buildSnapshot(st2, HOST);
const vf2 = viewerFactionOfCopy(snap2);
console.log('\n──── 步骤 8：反证（同一份 pendingItemDiscard，phase = killerMain）────');
console.log('  st.pendingItemDiscard   =', JSON.stringify(st2.pendingItemDiscard));
console.log('  snap.you.name/faction   =', snap2.you.name, '/', snap2.you.faction);
console.log('  snap.pendingItemDiscard =', JSON.stringify(snap2.pendingItemDiscard));
console.log('  命中分支                =', vf2.hit);
console.log('  viewerFactionOf 返回     =', JSON.stringify(vf2.result));
/* ═══════════════════ 步骤 9：端到端 —— 弃掉一件，流程能不能接着走 ═══════════════════ */
/**
 * 修复（`fastForwardSurvivors` 里那道 `if (state.pendingItemDiscard) return;`）之后，
 * 真实的快进状态就是步骤 4/5 打印的样子：`phase = discovery` + 马尔科的弃牌挂着。
 * 这里把它**走完**：弃一件 → 应当自动进响声报告，并且界面切回杀手。
 */
console.log('\n──── 步骤 9：在 discovery 里弃掉一件，看能不能接着走 ────');
const discardable = Object.entries(st.pendingItemDiscard
  ? (st.players[st.pendingItemDiscard.playerId].items ?? {})
  : {}).map(([id, n]) => ({ id, n }));
console.log(`  当前可弃：${discardable.map((d) => `${d.id}×${d.n}`).join('、')}`);
const pick = discardable.find((d) => d.id === 'lime') ?? discardable[0];
const err = (() => {
  try {
    handleAction(st, HOST, { type: 'discardItem', itemId: pick.id }, content);
    return null;
  } catch (e) { return e.message; }
})();
console.log(`  弃置「${pick.id}」→ ${err ?? 'OK'}`);
console.log(`  phase                 = ${st.phase}`);
console.log(`  pendingItemDiscard    = ${JSON.stringify(st.pendingItemDiscard)}`);
const snapAfter = buildSnapshot(st, HOST);
const vfAfter = viewerFactionOfCopy(snapAfter);
console.log(`  snap.you.faction      = ${snapAfter.you.faction}`);
console.log(`  viewerFactionOf 返回   = ${JSON.stringify(vfAfter.result)}（命中 ${vfAfter.hit}）`);
console.log(`  → ${st.phase === 'noiseReport' && !st.pendingItemDiscard
  ? '流程接着走了：弃完自动进响声报告，界面回到杀手侧'
  : '⚠ 没走到响声报告，检查是否有新的卡点'}`);

console.log('\n结论（修复后）：`fastForwardSurvivors` 里 `pendingItemDiscard` 还挂着时不推进阶段 ——');
console.log('      phase 留在 discovery → 快照 you = 马尔科 / survivor → 弃牌界面停在幸存者侧；');
console.log('      弃完由 discardItem 自己进响声报告 → 界面再切回杀手侧。');
