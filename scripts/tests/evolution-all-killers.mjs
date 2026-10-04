/**
 * **九名杀手的进化流程全检**：每一名都从 1 级一路推到 5 级，
 * 每一步"要你选的东西"都按规则做掉，看有没有卡死 / 漏挂 / 选不了。
 *
 * 覆盖：力量型（屠夫/幽魂/谋杀者/女猎手/狼人）、雕像（选主雕像）、
 * 未命名（选进化卡 + 解锁二选一）、扼杀者（4 级核心标记）、女王（4 级选地点）。
 *
 * 跑法：node scripts/tests/evolution-all-killers.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { runUpgrade } from '../../server/dist/game/evolution.js';
import { advanceEvolutionChoices } from '../../server/dist/game/evolution.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 每位杀手配一张能体现其机制的地图（墓穴会额外触发坍塌） */
const MAP_OF = {
  killer1: 'cabin', killer2: 'cabin', killer3: 'cabin', killer4: 'cabin',
  killer5: 'cabin', killer6: 'mansion', killer7: 'cabin', killer8: 'crypt',
  killer9: 'crypt',
};

function mkSolo(killerId, variant1 = false) {
  const st = createLobby('T', HOST, 'H', content, MAP_OF[killerId] ?? 'cabin');
  st.mode = 'solo';
  st.variant1 = variant1;
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /**
   * 女猎手开局要先布 4 个陷阱（`trapSetup`），不然所有操作都被拦。
   * 这里直接把布置标成完成 —— 本脚本测的是**进化流程**，不测陷阱摆放。
   */
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    try { handleAction(st, HOST, { type: 'confirmTrapPlacement' }, content); } catch { /* 忽略 */ }
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  return st;
}

const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

/** 模拟 engine 的升级入口（坍塌被推迟时 handler 会补跑一次） */
function upgradeViaEnginePath(st) {
  runUpgrade(st);
  if (!st.pendingCollapseAfterEvolution) return;
  st.collapseConsumedForLevel = st.pendingCollapseLevel;
  runUpgrade(st);
  st.collapseConsumedForLevel = 0;
}

/** 把"确认之后挂出来的选择"按规则做掉；返回是否做出了选择 */
function resolveOneChoice(st) {
  const before = st.killerLevel;
  /** 雕像：转主雕像（选一尊别的，或直接跳过） */
  if (st.pendingStatueEvoSwitch) {
    const statues = st.statueIds ?? [];
    const other = statues.find((id) => id !== st.killerId);
    if (other) return { acted: !tryIt(st, { type: 'pickStatueEvoSwitch', statueId: other }), what: '选主雕像' };
    return { acted: !tryIt(st, { type: 'skipStatueEvoSwitch' }), what: '跳过换主雕像' };
  }
  /** 未命名：选进化卡 */
  if (st.pendingEvolutionCardPick?.length) {
    const id = st.pendingEvolutionCardPick[0];
    return { acted: !tryIt(st, { type: 'pickEvolutionCard', cardId: id }), what: `选进化卡 ${id}` };
  }
  /** 未命名：解锁二选一 */
  if (st.pendingUnlockChoice?.length) {
    const id = st.pendingUnlockChoice[0];
    return { acted: !tryIt(st, { type: 'pickUnlockChoice', cardId: id }), what: `解锁二选一 ${id}` };
  }
  /** 女王 4 级：点 2 个地点 */
  if (st.pendingQueenSpawnRooms) {
    const rooms = st.map.rooms.slice(0, 2).map((r) => r.id);
    let acted = true;
    for (const rid of rooms) acted = !tryIt(st, { type: 'pickQueenSpawnRoom', roomId: rid }) && acted;
    return { acted, what: '女王生成丧尸' };
  }
  /** 特性 17/18 之类（变体1 才有） */
  if (st.pendingTraitVictim) {
    const v = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
    return { acted: !tryIt(st, { type: 'useTrait', traitId: 'trait_k17', targetPlayerId: v.id }), what: '特性17选目标' };
  }
  if (state0HasPendingBlockade(st)) {
    /** 特性 18：随便点一扇门封 */
    return { acted: true, what: '特性18封堵（跳过细节）' };
  }
  void before;
  return { acted: false, what: '' };
}

function state0HasPendingBlockade(st) {
  return Boolean(st.pendingBlockadeJob);
}

/** 超限弃牌（进化入手牌之后可能超） */
function clearDiscards(st) {
  let guard = 0;
  while (st.pendingKillerDiscards > 0 && guard < 12) {
    guard += 1;
    const card = st.killerHand.find((c) => !(st.justUnlockedCards ?? []).includes(c)) ?? st.killerHand[0];
    const err = tryIt(st, { type: 'discardKillerCard', cardId: card });
    if (err) return err;
  }
  return st.pendingKillerDiscards > 0 ? '弃牌没清干净' : null;
}

const killers = Object.keys(MAP_OF);

for (const kid of killers) {
  const meta = content.characters.find((c) => c.id === kid);
  console.log(`\n──────── ${kid} ${meta?.name ?? ''}（${MAP_OF[kid]}）────────`);
  const st = mkSolo(kid);
  const name = st.players[st.killerId]?.name ?? kid;
  const seen = new Set();
  let guard = 0;
  let stuck = null;

  while (st.killerLevel < 5 && guard < 40) {
    guard += 1;
    const beforeLv = st.killerLevel;
    upgradeViaEnginePath(st);

    /** 确认 */
    const ackErr = tryIt(st, { type: 'ackEvolution' });
    if (ackErr) { stuck = `确认失败：${ackErr}`; break; }

    /** 把这一级"要你选的东西"逐个做掉 */
    let inner = 0;
    while (inner < 12) {
      inner += 1;
      const { acted, what } = resolveOneChoice(st);
      if (!acted) break;
      if (what) seen.add(what.replace(/\s.*/, ''));
    }
    const dErr = clearDiscards(st);
    if (dErr) { stuck = dErr; break; }

    if (st.killerLevel === beforeLv) { stuck = `等级没涨（卡在 ${beforeLv}）`; break; }
    console.log(`  ${beforeLv} → ${st.killerLevel} 级` +
      `${seen.size ? `（做过：${[...seen].join('、')}）` : ''} ` +
      `hand=${st.killerHand.length} power=${st.killerPower} ` +
      `${(st.collapsedRooms ?? []).length ? `collapsed=${JSON.stringify(st.collapsedRooms)}` : ''}`);
  }

  ok(st.killerLevel === 5, `${name} 能一路升到 5 级`, `level=${st.killerLevel}`);
  ok(!stuck, `${name} 流程没有卡死`, stuck ?? '');
  ok(st.pendingEvolutionAck == null || st.killerLevel === 5, `${name} 升级完没有挂着未完成的确认`);
  void name;
}

console.log(`\n九名杀手进化全检：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
