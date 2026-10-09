/**
 * 1对1（duo）**只读实测**：从开局玩到分出胜负。
 *
 * ⚠⚠ **本脚本绝不修改任何游戏代码，也不直接改 state** ——
 *    只用 `handleAction` 推进。跑出来的问题只**记录**，不在这里修。
 *
 * 和 `2v3-e2e.mjs` 的区别：
 *   那个为了验证"轮次能推进"，会直接 `st.phase = 'survivorMain'` 摆状态；
 *   这里每一步都问"当前局面能做什么"，挨个试，试不出任何合法动作 = **卡住**，
 *   把当时的完整状态 dump 出来（哪些字段非默认、所有动作的拒绝原因）。
 *
 * 跑法：node scripts/tests/duo-playthrough.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot, activePlayerId,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const findings = [];   // 记录发现的问题

/** 1对1：杀手 h + 幸存者 s（s 一个人管 3 枚棋子） */
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

function actorOf(st) {
  const ap = activePlayerId(st);
  if (ap && st.players[ap]) return { pieceId: ap, socketId: st.players[ap].controllerId ?? ap };
  const killer = Object.values(st.players).find((p) => p.faction === 'killer');
  return { pieceId: killer?.id ?? 'h', socketId: killer?.controllerId ?? 'h' };
}

/** state 里"非默认值"的字段（排除大对象），卡住时用来看它到底在等什么 */
function interestingFields(st) {
  const SKIP = /deck|logs|cardById|^map$|characters|rooms|edges|tokens|zones|tiles|images$/i;
  const out = [];
  for (const [k, v] of Object.entries(st)) {
    if (SKIP.test(k)) continue;
    if (v === null || v === undefined || v === false || v === 0 || v === '') continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      out.push(`${k}=[${v.length}] ${JSON.stringify(v).slice(0, 90)}`);
      continue;
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (!keys.length) continue;
      if (keys.length > 12) { out.push(`${k}={${keys.length} 项}`); continue; }
      out.push(`${k}=${JSON.stringify(v).slice(0, 90)}`);
      continue;
    }
    out.push(`${k}=${String(v).slice(0, 90)}`);
  }
  return out;
}

/** 一个局面下**可能**合法的动作，先清待办、再正常行动 */
function candidates(st, snap, piece) {
  const list = [];
  const push = (a) => list.push(a);
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);

  // ① 各种"等答复"的待办
  if (st.pendingEvolutionAck) push({ type: 'ackEvolution' });
  for (const c of st.pendingEvolutionCardPick ?? []) push({ type: 'pickEvolutionCard', cardId: c.id });
  for (const c of st.pendingUnlockChoice ?? []) push({ type: 'pickUnlockChoice', cardId: c.id });
  if (st.pendingKillerDiscards > 0) {
    for (const c of st.killers?.[st.killerId]?.hand ?? []) push({ type: 'discardKillerCard', cardId: c });
  }
  if (st.pendingOptionalEffect) {
    push({ type: 'resolveOptionalEffect', use: true });
    push({ type: 'resolveOptionalEffect', use: false });
  }
  if (st.pendingAmulet) {
    push({ type: 'confirmAmulet', use: true });
    push({ type: 'confirmAmulet', use: false });
  }
  if (st.pendingResilience) {
    push({ type: 'confirmResilience', use: true });
    push({ type: 'confirmResilience', use: false });
  }
  for (const c of st.pendingSixthSense ?? []) push({ type: 'resolveSixthSense', cardId: c?.id ?? c });
  if (st.pendingReturnToDeckTop) {
    push({ type: 'resolveDeckTop', toDeckTop: true });
    push({ type: 'resolveDeckTop', toDeckTop: false });
  }
  if (st.pendingTrade) {
    push({ type: 'respondTrade', accept: true });
    push({ type: 'respondTrade', accept: false });
  }
  if (st.pendingCoopConfirm) {
    push({ type: 'respondCoopAction', accept: true });
    push({ type: 'respondCoopAction', accept: false });
  }
  if ((st.pendingPathDraft ?? []).length) push({ type: 'finishPendingMove' });
  if (st.pendingItemDiscard) {
    const owner = st.players[st.pendingItemDiscard.playerId];
    for (const itemId of Object.keys(owner?.items ?? {})) push({ type: 'discardItem', itemId });
  }

  // ② 发现阶段：候选在 state.discoveryOptions（不是快照字段）
  if (st.phase === 'discovery') {
    if (st.pendingDiscoveryPick) {
      for (const p of survivors) push({ type: 'pickSurvivorTurn', playerId: p.id });
    }
    for (const c of st.discoveryOptions ?? []) push({ type: 'chooseDiscovery', cardId: c?.id ?? c });
    push({ type: 'acknowledgeDiscovery' });
  }

  // ③ 遭遇
  if (st.encounter) {
    push({ type: 'resolveEncounterDice' });
    for (const p of survivors) push({ type: 'pickEncounterTarget', targetPlayerId: p.id });
    push({ type: 'playEncounterAttack', cardId: null, boost: false });
    for (const p of survivors) push({ type: 'pickFleeSurvivor', targetPlayerId: p.id });
  }

  // ④ 响声
  if (st.phase === 'noiseReport') push({ type: 'acknowledgeNoise' });

  // ⑤ 幸存者主回合
  if (st.phase === 'survivorMain') {
    if (st.pendingSurvivorPick) {
      for (const p of survivors) push({ type: 'pickSurvivorTurn', playerId: p.id });
      for (const p of survivors) push({ type: 'pickMoveSurvivor', targetPlayerId: p.id });
    }
    push({ type: 'search' });
    push({ type: 'repair' });
    for (const to of (snap?.legalMoves ?? []).slice(0, 4)) push({ type: 'move', toRoomId: to });
    push({ type: 'georgeDraw', actorPlayerId: piece });
    push({ type: 'useSuitcase', actorPlayerId: piece });
    push({ type: 'useMirrorPortal' });
    push({ type: 'useInsightOrb' });
    for (const itemId of Object.keys(st.players[piece]?.items ?? {})) {
      push({ type: 'useItem', itemId, actorPlayerId: piece });
    }
    push({ type: 'clearFear' });
    push({ type: 'finishSurvivorPhase' });
  }

  // ⑥ 杀手主回合
  if (st.phase === 'killerMain') {
    push({ type: 'advanceKillerStep' });
    push({ type: 'chooseKillerMain', choice: 'actions' });
    const hand = st.killers?.[st.killerId]?.hand ?? [];
    for (const cardId of hand.slice(0, 5)) push({ type: 'playKillerCard', cardId, payCardIds: [] });
    /**
     * ⚠ **不管还有没有行动次数都要发 `move`** ——
     * 很多"点地图"的操作走的都是 `move`：封堵选门（`engine.ts:7998`
     * 在 `case 'move'` 里调 `placeBlockade`）、选感知地点、选核心标记地点…
     * 而快照的 `legalMoves` 已经算好"当前该点什么"，照着点就行。
     * （第 16 步以前就是卡在这里：打出【设障】后 `pendingBlockade=true`，
     *   `killerMainActionsLeft` 已经是 0，于是驱动器一直不发 move，看着像死局。）
     */
    for (const to of (snap?.legalMoves ?? []).slice(0, 6)) push({ type: 'move', toRoomId: to });
    push({ type: 'endTurn' });
  }

  push({ type: 'endTurn' });
  return list;
}

function attempt(st, action, socketId) {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return e.message; }
}

/** 跑一局，返回结果 */
function playOne(mapId, killerId, maxSteps = 4000, quiet = false) {
  const st = newDuo(mapId, killerId);
  const sockets = ['s', 'h'];
  const phaseSeq = [];
  const stuckAt = [];
  let steps = 0;

  while (st.phase !== 'gameOver' && steps < maxSteps) {
    steps += 1;
    const who = actorOf(st);
    const snap = buildSnapshot(st, who.socketId);
    const key = `${st.phase}|${st.pendingSurvivorPick ? 'pick' : ''}|${st.discoveryOptions?.length ?? 0}|${st.encounter ? 'enc' : ''}`;
    if (phaseSeq[phaseSeq.length - 1] !== key) phaseSeq.push(key);

    const cands = candidates(st, snap, who.pieceId);
    let done = false;
    let used = null;
    const rejects = [];
    for (const a of cands) {
      for (const sid of sockets) {
        const err = attempt(st, a, sid);
        if (!err) { done = true; used = { ...a, by: sid }; break; }
        rejects.push(`${JSON.stringify(a)}@${sid}: ${err}`);
      }
      if (done) break;
    }
    if (!quiet && steps <= 120) {
      console.log(`   ${String(steps).padStart(4)}. [${st.phase}] ${used ? JSON.stringify(used) : '**卡住**'}`);
    }
    if (!done) {
      stuckAt.push({
        step: steps, phase: st.phase, round: st.round,
        fields: interestingFields(st),
        lastRejects: rejects.slice(-8),
      });
      break;
    }
  }
  return { st, steps, stuckAt, phaseSeq };
}

/* ═══════════════════════════ 实测 ═══════════════════════════ */
console.log('=== 第 1 局：小屋 + 屠夫（看能不能走完一整局）===');
const r1 = playOne('cabin', 'killer1');
console.log(`\n  走了 ${r1.steps} 步 → 阶段=${r1.st.phase} 大回合=${r1.st.round} 胜负=${r1.st.winner ?? '(未分)'}`);
console.log(`  胜负原因：${r1.st.winReason ?? '(无)'}`);
console.log(`  战报 ${r1.st.logs.length} 条`);
console.log(`  阶段轨迹（去重）：${r1.phaseSeq.join(' → ')}`);

if (r1.stuckAt.length) {
  const s = r1.stuckAt[0];
  console.log(`\n  ⚠⚠ 第 ${s.step} 步卡住：phase=${s.phase} round=${s.round}`);
  console.log(`     当时非默认字段：`);
  for (const f of s.fields) console.log(`       ${f}`);
  console.log(`     最后 8 条拒绝原因：`);
  for (const r of s.lastRejects) console.log(`       ${r}`);
  findings.push({ 场景: '小屋+屠夫走完一局', 结果: `第 ${s.step} 步卡在 ${s.phase}`, 细节: s });
}

console.log(`\n发现 ${findings.length} 个卡点。`);
