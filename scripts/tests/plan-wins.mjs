/**
 * **【变体3】计划卡的 5 条「立刻獲勝」**。
 *
 *  - 反擊！暗中伏擊：防御值高出杀手力量 ≥3
 *  - 反擊！奧術封印：在螺旋地点用長劍成功防御
 *  - 反擊！爆炸陷阱：杀手搜索带计划标记、且没人的地点
 *  - 反擊！火箭發射器：幸存者回合开始时，全员在**与杀手相邻的同一地点**，且上一回合没遭遇
 *  - 被封印的傳送門：幸存者回合开始时，全员在螺旋地点、队伍有秘密地图＋手电筒＋古代护符
 *
 * 跑法：node scripts/tests/plan-wins.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, startRound, resolveEncounterCombat,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const survivorsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);

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
  st.encountersThisRound = 0;
  st.pendingSurvivorPick = false;
  st.encounter = null;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') {
      p.alive = true;
      p.hp = p.maxHp;
      p.mainActionUsed = false;
      p.moveLeft = st.rules.survivorMoveRange;
      p.items = {};
    }
  }
  const first = survivorsOf(st)[0];
  st.activeSurvivorIndex = Math.max(0, st.turnOrder.indexOf(first.id));
  return st;
}
const tryIt = (st, action, socketId = 's') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 造一场"轮到某人防御"的遭遇，然后用**固定骰子**结算 */
function setupDefense(st, opts = {}) {
  const surv = survivorsOf(st)[0];
  const killer = st.players[st.killerId];
  const roomId = opts.roomId ?? 'A1';
  surv.roomId = roomId;
  killer.roomId = roomId;
  killer.stealth = false;
  /** 力量压到 1：固定骰子 3+3+3+3=12，怎么都挡得住、而且高出一大截 */
  st.killerPower = 1;
  st.encounterTailBonus = 0;
  if (opts.itemId) surv.items[opts.itemId] = 1;
  st.phase = 'encounter';
  st.encounter = {
    roomId,
    step: 'defend',
    targetId: surv.id,
    targets: [surv.id],
    discoveredIds: [surv.id],
    attackCardId: null,
    attackBoost: false,
    attackChoiceMade: true,
    attackCommitted: true,
    attackOptions: [],
    defenses: {},
    defenseItems: opts.itemId ? { [surv.id]: opts.itemId } : {},
    defenseOptions: {},
    fleeQueue: [],
    fled: [],
    blockItems: false,
    trapArmed: false,
    trapApplied: false,
    executeArmed: false,
    executeStatueId: null,
    source: 'search',
  };
  return { surv, killer, roomId };
}
const dice4 = [3, 3, 3, 3];

/* ═══════════ ① 暗中伏擊：防御高出力量 ≥3 ═══════════ */
console.log('=== ① 反擊！暗中伏擊：防御高出杀手力量 ≥3 → 获胜 ===');
{
  const a = mk();
  setupDefense(a);
  resolveEncounterCombat(a, dice4);
  ok(a.phase !== 'gameOver', '对照：**没完成计划时不会因为挡住就赢**', String(a.phase));

  const b = mk();
  b.planCompletedId = 'plan_ambush';
  setupDefense(b);
  resolveEncounterCombat(b, dice4);
  ok(b.winner === 'survivors' && b.phase === 'gameOver',
    '**完成计划后：挡住且高出 3 点 → 幸存者立刻获胜**',
    `${b.winner} / ${b.winReason}`);
  console.log(`   ${b.winReason}`);

  /** 刚好只高出 2 点 → 不触发（12 防御 vs 力量 10） */
  const c = mk();
  c.planCompletedId = 'plan_ambush';
  setupDefense(c);
  c.killerPower = 10;
  resolveEncounterCombat(c, [3, 1, 1, 1]); // 防御 6 + 0 = 6 < 10，直接挨打
  ok(c.phase !== 'gameOver', '对照：防御没高出 3 点不触发', String(c.phase));
}

/* ═══════════ ② 奧術封印：螺旋地点用長劍挡住 ═══════════ */
console.log('=== ② 反擊！奧術封印：螺旋地点長劍成功防御 → 获胜 ===');
{
  const a = mk();
  a.planCompletedId = 'plan_arcane_seal';
  setupDefense(a, { roomId: 'A1', itemId: 'longsword' });
  resolveEncounterCombat(a, dice4);
  ok(a.phase !== 'gameOver', '对照：**不在螺旋地点用長劍挡住也不赢**', String(a.phase));

  const b = mk();
  b.planCompletedId = 'plan_arcane_seal';
  setupDefense(b, { roomId: 'G2', itemId: 'longsword' }); // G2 = 墓地（螺旋地点）
  resolveEncounterCombat(b, dice4);
  ok(b.winner === 'survivors' && b.phase === 'gameOver',
    '**螺旋地点用長劍挡住 → 幸存者立刻获胜**', `${b.winner} / ${b.winReason}`);

  /** 螺旋地点但没用長劍 → 不触发 */
  const c = mk();
  c.planCompletedId = 'plan_arcane_seal';
  setupDefense(c, { roomId: 'G2' });
  resolveEncounterCombat(c, dice4);
  ok(c.phase !== 'gameOver', '对照：没用長劍不触发', String(c.phase));
}

/* ═══════════ ③ 爆炸陷阱：杀手搜索带标记的空地点 ═══════════ */
console.log('=== ③ 反擊！爆炸陷阱：杀手搜索带计划标记的空地点 → 获胜 ===');
{
  const mkKillerSearch = (planDone, marked, survivorsThere) => {
    const st = mk();
    const killer = st.players[st.killerId];
    killer.roomId = 'B1';
    for (const s of survivorsOf(st)) s.roomId = survivorsThere ? 'B1' : 'A1';
    st.planCompletedId = planDone ? 'plan_bomb_trap' : null;
    st.planMarkers = marked ? ['B1'] : [];
    st.phase = 'killerMain';
    st.killerTurnStep = 'main';
    st.killerMainChoice = 'actions';
    st.killerMainActionsLeft = 2;
    killer.actionsLeft = 2;
    st.encounter = null;
    const err = tryIt(st, { type: 'search' }, 'h');
    return { st, err };
  };

  const a = mkKillerSearch(true, false, false);
  ok(!a.err, '对照：搜索本身能进行', String(a.err ?? ''));
  ok(a.st.phase !== 'gameOver', '对照：**没有计划标记就不赢**', String(a.st.phase));

  const b = mkKillerSearch(true, true, true);
  ok(b.st.phase !== 'gameOver', '对照：**地点里有人就不赢**（有人会开遭遇）', String(b.st.phase));

  const c = mkKillerSearch(false, true, false);
  ok(c.st.phase !== 'gameOver', '对照：**没完成计划就不赢**', String(c.st.phase));

  const d = mkKillerSearch(true, true, false);
  ok(d.st.winner === 'survivors' && d.st.phase === 'gameOver',
    '**带标记 + 没人 → 幸存者立刻获胜**', `${d.st.winner} / ${d.st.winReason}`);
}

/* ═══════════ ④ 火箭發射器：全员在杀手隔壁同一地点、上回合无遭遇 ═══════════ */
console.log('=== ④ 反擊！火箭發射器：幸存者回合开始时的位置判定 ===');
{
  /**
   * 杀手在 A1；和 A1 相邻的**一般通道**地点（门/虚线）——
   * 「與殺手相鄰」用的是普通相邻，**不算杀手通道**，所以这里也要按同一口径找。
   */
  const adjacentOf = (st, roomId) => {
    const out = [];
    for (const e of st.map.edges) {
      const general = !e.pathType || e.pathType === 'door' || e.pathType === 'dash';
      if (!general) continue;
      if (e.from === roomId) out.push(e.to);
      else if (e.to === roomId) out.push(e.from);
    }
    return out;
  };
  const run = (planDone, hadEncounter) => {
    const st = mk();
    const killer = st.players[st.killerId];
    /** 豪宅地图真的有 R1（杀手开局点）；A1 之类不存在的房号相邻表是空的 */
    const killerRoomId = 'R1';
    killer.roomId = killerRoomId;
    const near = adjacentOf(st, killerRoomId)[0];
    for (const s of survivorsOf(st)) s.roomId = near;
    st.planCompletedId = planDone ? 'plan_rocket' : null;
    st.encountersThisRound = hadEncounter ? 1 : 0;
    startRound(st);
    return st;
  };

  const a = run(true, false);
  ok(a.winner === 'survivors' && a.phase === 'gameOver',
    '**全员在与杀手相邻的同一地点 + 上回合无遭遇 → 获胜**', `${a.winner} / ${a.winReason}`);

  const b = run(true, true);
  ok(b.phase !== 'gameOver', '对照：**上一回合发生过遭遇就不赢**', String(b.phase));
  ok((b.encountersThisRound ?? 0) === 0, '读完之后计数器归零', String(b.encountersThisRound));

  const c = run(false, false);
  ok(c.phase !== 'gameOver', '对照：没完成计划不赢', String(c.phase));

  /** 有人不在同一地点 → 不赢 */
  const d = mk();
  d.players[d.killerId].roomId = 'R1';
  const near2 = adjacentOf(d, 'R1')[0];
  const ss = survivorsOf(d);
  ss[0].roomId = near2;
  ss[1].roomId = adjacentOf(d, 'R1')[1] ?? 'B1';
  d.planCompletedId = 'plan_rocket';
  d.encountersThisRound = 0;
  startRound(d);
  ok(d.phase !== 'gameOver', '对照：**没凑在同一个地点也不赢**', String(d.phase));
}

/* ═══════════ ⑤ 被封印的傳送門：全员在螺旋地点 + 三样东西 ═══════════ */
console.log('=== ⑤ 被封印的傳送門：幸存者回合开始时的物品判定 ===');
{
  const run = (planDone, items, atSpiral) => {
    const st = mk();
    st.players[st.killerId].roomId = 'A1';
    const ss = survivorsOf(st);
    ss.forEach((s, i) => {
      s.roomId = atSpiral ? 'G2' : 'A1';
      if (i === 0) s.items = { ...items };
    });
    st.planCompletedId = planDone ? 'plan_sealed_portal' : null;
    startRound(st);
    return st;
  };
  const all3 = { map: 1, flashlight: 1, amulet: 1 };

  const a = run(true, all3, true);
  ok(a.winner === 'survivors' && a.phase === 'gameOver',
    '**全员在螺旋地点 + 秘密地图/手电筒/古代护符 → 获胜**', `${a.winner} / ${a.winReason}`);

  const b = run(true, { map: 1, flashlight: 1 }, true);
  ok(b.phase !== 'gameOver', '对照：**少古代护符不赢**', String(b.phase));

  const c = run(true, all3, false);
  ok(c.phase !== 'gameOver', '对照：**不都在螺旋地点不赢**', String(c.phase));

  const d = run(false, all3, true);
  ok(d.phase !== 'gameOver', '对照：没完成计划不赢', String(d.phase));
}

console.log(`\n变体3 计划获胜条件：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
