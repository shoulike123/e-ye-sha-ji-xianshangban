/**
 * **【变体3】计划的保密性**（用户口径）：
 *
 * > 计划能力之类**永远不告诉杀手**，只有在**游戏因此胜利时**告诉杀手原因。
 *
 * 所以：
 *  - 计划的下发 / 确认 / 推进 / 完成 / 能力发动 / 标记……全部只写幸存者战报（`vis: 'survivor'`）；
 *  - 杀手那边**一条 `【变体3】` 都不该有**（除了大厅里"房主开启了计划卡"这条模式设置）；
 *  - **因计划直接获胜**时，那一条要走双方战报，并且把原因写清楚；
 *  - 而**机制本身照旧对杀手可见**（响声标记、防御数值、修理完成…）——保密的是"这是计划做的"。
 *
 * 跑法：node scripts/tests/plan-secrecy.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot, enterNoiseReport,
  resolveEncounterCombat,
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
  st.planAdvancedThisRound = false;
  st.planChangedThisRound = false;
  st.pendingSurvivorPick = false;
  st.encounter = null;
  const first = survivorsOf(st)[0];
  st.activeSurvivorIndex = Math.max(0, st.turnOrder.indexOf(first.id));
  return st;
}
const tryIt = (st, action, socketId = 's') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
/** 某一边快照里能看到的战报文字 */
const logsFor = (st, socketId) =>
  (buildSnapshot(st, socketId).logs ?? []).map((l) => l.text).join('\n');
const planLines = (st) => st.logs.filter((l) => (l.text ?? '').includes('【变体3】'));

/* ═══════════ ① 计划的推进 / 完成：只写给幸存者 ═══════════ */
console.log('=== ① 计划下发 / 确认 / 推进 / 完成：杀手一条都看不到 ===');
{
  const st = mk();
  for (const p of survivorsOf(st)) p.roomId = 'G2'; // 螺旋地点：秘術草藥的进度条件
  st.planUsedAbilities = [];
  st.planCurrentId = 'plan_herbs';
  st.planHand = ['plan_herbs', 'plan_molotov'];
  st.planById['plan_herbs'] = content.plans.find((p) => p.id === 'plan_herbs');
  st.planById['plan_molotov'] = content.plans.find((p) => p.id === 'plan_molotov');
  st.planStep = 1;
  /** 最后一条进度 = 螺旋地点（全员都在 G2）→ 推完就完成 */
  enterNoiseReport(st);
  ok(st.planCompletedId === 'plan_herbs', '计划确实推完并完成了', String(st.planCompletedId));

  const mine = planLines(st);
  ok(mine.length > 0, '幸存者侧有 `【变体3】` 战报', `${mine.length} 条`);
  ok(mine.every((l) => l.vis === 'survivor'),
    '**这些战报全是 `vis: survivor`**', JSON.stringify([...new Set(mine.map((l) => l.vis))]));
  const killerText = logsFor(st, 'h');
  ok(!killerText.includes('【变体3】'), '**杀手战报里一条 `【变体3】` 都没有**',
    killerText.split('\n').filter((t) => t.includes('【变体3】')).join(' | '));
  ok(!killerText.includes('秘術草藥') && !killerText.includes('燃燒瓶'),
    '连卡名都没漏给杀手');
  const survText = logsFor(st, 's');
  ok(survText.includes('【变体3】'), '幸存者自己看得到这些战报');
}

/* ═══════════ ② 能力发动（蜂鳴器②）：响声照旧、原因保密 ═══════════ */
console.log('=== ② 能力发动：响声给杀手看，"这是计划做的"不给他看 ===');
{
  const st = mk();
  const surv = survivorsOf(st)[0];
  surv.roomId = 'B1';
  st.planMarkers = ['B1'];
  st.planCompletedId = 'plan_buzzer';
  st.planHand = ['plan_buzzer', 'plan_molotov'];
  st.pendingSurvivorPick = false;
  surv.mainActionUsed = false;
  const err = tryIt(st, { type: 'usePlanAbility', planId: 'plan_buzzer', index: 1 });
  ok(!err, '蜂鳴器②能发动', String(err ?? ''));
  /** 机制：响声是真的（服务端状态里就有） */
  ok((st.noises ?? []).includes('B1'), '**响声本身照常发出**（机制不受影响）',
    JSON.stringify(st.noises));
  const lines = planLines(st);
  ok(lines.every((l) => l.vis === 'survivor'), '能力那条战报只给幸存者',
    JSON.stringify(lines.map((l) => [l.vis, l.text.slice(0, 24)])));
  const killerText = logsFor(st, 'h');
  ok(!killerText.includes('【变体3】'), '**杀手看不到"这是蜂鳴器/计划弄的"**',
    killerText.split('\n').filter((t) => t.includes('【变体3】')).join(' | '));
  /** 计划标记本身也不下发（地图上不给杀手看） */
  const killerSnap = buildSnapshot(st, 'h');
  ok(!killerSnap.plans, '杀手的快照里没有 `plans`（卡、进度、标记都不下发）',
    JSON.stringify(killerSnap.plans ?? null));
}

/* ═══════════ ③ 燃燒瓶：连"在被问要不要弃威士忌"都不给杀手看 ═══════════ */
console.log('=== ③ 燃燒瓶：第二段选择与 +2 都只写给幸存者 ===');
{
  const st = mk();
  const surv = survivorsOf(st)[0];
  surv.roomId = 'B1';
  st.players[st.killerId].roomId = 'B1';
  st.players[st.killerId].stealth = false;
  st.planCompletedId = 'plan_molotov';
  surv.items.whiskey = 1;
  st.phase = 'encounter';
  st.encounter = {
    roomId: 'B1',
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
    defenseItems: {},
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
  tryIt(st, { type: 'playEncounterDefense', itemId: null });
  ok(st.encounter?.whiskeyOffer?.playerId === surv.id, '服务端挂出了这一问');
  const survSnap = buildSnapshot(st, 's');
  const killerSnap = buildSnapshot(st, 'h');
  ok(survSnap.encounter?.whiskeyOffer?.playerId === surv.id,
    '幸存者快照里有这一问（他要能点）');
  ok(!killerSnap.encounter?.whiskeyOffer,
    '**杀手快照里没有这一问**（否则等于告诉他对方有燃燒瓶）',
    JSON.stringify(killerSnap.encounter?.whiskeyOffer ?? null));

  tryIt(st, { type: 'confirmWhiskeyDefense', use: true });
  const lines = planLines(st);
  ok(lines.length > 0 && lines.every((l) => l.vis === 'survivor'),
    '弃置威士忌 +2 的战报只给幸存者',
    JSON.stringify(lines.map((l) => [l.vis, l.text.slice(0, 20)])));
  ok(!logsFor(st, 'h').includes('【变体3】'),
    '**杀手战报里没有这条**（他只看到防御总数更高）');
  ok((buildSnapshot(st, 'h').encounter?.whiskeyUsed ?? {}) &&
    Object.keys(buildSnapshot(st, 'h').encounter?.whiskeyUsed ?? {}).length === 0,
    '杀手的遭遇快照里 `whiskeyUsed` 也是空的',
    JSON.stringify(buildSnapshot(st, 'h').encounter?.whiskeyUsed ?? null));
}

/* ═══════════ ④ 因计划获胜：这时才告诉杀手原因 ═══════════ */
console.log('=== ④ 计划直接导致获胜：这条要告诉杀手，并写清原因 ===');
{
  /** 用「爆炸陷阱」：杀手搜索带计划标记、且没有幸存者的地点 */
  const st = mk();
  const killer = st.players[st.killerId];
  killer.roomId = 'B1';
  for (const s of survivorsOf(st)) s.roomId = 'A1' === s.roomId ? 'A1' : 'R3';
  st.planCompletedId = 'plan_bomb_trap';
  st.planMarkers = ['B1'];
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  killer.actionsLeft = 2;
  const err = tryIt(st, { type: 'search' }, 'h');
  ok(!err, '杀手搜索能进行', String(err ?? ''));
  ok(st.winner === 'survivors' && st.phase === 'gameOver', '幸存者因计划立刻获胜',
    `${st.winner} / ${st.winReason}`);

  const lines = planLines(st);
  const winLine = lines.find((l) => l.text.includes('幸存者胜利'));
  ok(Boolean(winLine), '有一条"幸存者胜利"的战报', JSON.stringify(lines.map((l) => l.text.slice(0, 30))));
  ok(winLine?.vis === 'all', '**这条走双方战报（`vis: all`）**', String(winLine?.vis));
  const killerText = logsFor(st, 'h');
  ok(killerText.includes('【变体3】幸存者胜利'),
    '**杀手看得到这条**（含"计划「爆炸陷阱」"）',
    killerText.split('\n').filter((t) => t.includes('【变体3】')).join(' | '));
  ok(killerText.includes('爆炸陷阱') && killerText.includes('计划标记'),
    '并且把原因写清楚了（哪张计划、为什么赢）');
  ok(buildSnapshot(st, 'h').winReason === st.winReason, '`winReason` 双方都能拿到',
    String(buildSnapshot(st, 'h').winReason));
}

/* ═══════════ ⑤ 例外：大厅里的"房主开启了计划卡"照旧双方可见 ═══════════ */
console.log('=== ⑤ 例外：模式开关（大厅）仍然告诉杀手 ===');
{
  const st = createLobby('T2', 'h', 'H', content, 'mansion');
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.hostId = 'h';
  const err = tryIt(st, { type: 'setVariant3', on: true }, 'h');
  ok(!err, '房主能开计划卡', String(err ?? ''));
  const line = st.logs.find((l) => l.text.includes('开启了【变体3】'));
  ok(Boolean(line), '有一条"开启计划卡"的战报');
  ok(line?.vis === 'all', '**这条是双方可见的**（模式设置，杀手必须知道）', String(line?.vis));
  ok(logsFor(st, 'h').includes('开启了【变体3】'), '杀手看得到这条');
}

console.log(`\n变体3 计划保密：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
