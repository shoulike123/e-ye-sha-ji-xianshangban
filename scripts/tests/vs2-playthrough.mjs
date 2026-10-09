/**
 * 1对2（vs2）**整个一局**的只读实测：从开局走到分出胜负。
 *
 * 和 `duo-playthrough.mjs` 的区别：
 *   1对2 里幸存者的动作要**另一名幸存者玩家确认**（见 `vs2-coop-confirm.mjs`），
 *   所以这个驱动器遇到 `pendingCoopAction` 就**自动让队友确认** ——
 *   要验的正是"合作确认会不会在真实流程里把整局卡住"。
 *
 * ⚠ 只读：不改任何游戏代码，也不直接改 state，只用 `handleAction` 推进。
 *
 * 跑法：node scripts/tests/vs2-playthrough.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot, activePlayerId,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const SOCkETS = ['s1', 's2', 'k'];

/** 1对2：杀手 k + 两名幸存者玩家 s1 / s2 */
function mkVs2(mapId = 'cabin', killerId = 'killer1') {
  const st = createLobby('T', 'k', 'K', content, mapId);
  st.mode = 'vs2';
  const map = { k: st.players.k };
  for (const id of ['s1', 's2']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.players.k.faction = 'killer';
  st.players.k.characterId = killerId;
  st.players.k.ready = true;
  for (const id of ['s1', 's2']) { st.players[id].faction = 'survivor'; st.players[id].ready = true; }
  st.hostId = 'k';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'k');
  st.pendingEvolutionAck = null;
  return st;
}

function actorOf(st) {
  const ap = activePlayerId(st);
  if (ap && st.players[ap]) return { pieceId: ap, socketId: st.players[ap].controllerId ?? 's1' };
  return { pieceId: st.killerId ?? 'k', socketId: 'k' };
}

/** state 里"非默认值"的字段（排除大对象），卡住时用来看它在等什么 */
function interestingFields(st) {
  const SKIP = /deck|logs|cardById|^map$|characters|rooms|edges|tokens|zones|tiles|images$/i;
  const out = [];
  for (const [k, v] of Object.entries(st)) {
    if (SKIP.test(k)) continue;
    if (v === null || v === undefined || v === false || v === 0 || v === '') continue;
    if (Array.isArray(v)) { if (v.length) out.push(`${k}=[${v.length}] ${JSON.stringify(v).slice(0, 90)}`); continue; }
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (!keys.length) continue;
      out.push(keys.length > 12 ? `${k}={${keys.length} 项}` : `${k}=${JSON.stringify(v).slice(0, 90)}`);
      continue;
    }
    out.push(`${k}=${String(v).slice(0, 90)}`);
  }
  return out;
}

function candidates(st, snap, piece) {
  const list = [];
  const push = (a) => list.push(a);
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);

  /** ① 最优先：有合作确认就**替队友点确认**（这是这一局能不能走完的关键） */
  if (st.pendingCoopAction) push({ type: 'respondCoopAction', accept: true });

  // ② 各种"等答复"的待办
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
  if ((st.pendingPathDraft ?? []).length) push({ type: 'finishPendingMove' });
  if (st.pendingItemDiscard) {
    const owner = st.players[st.pendingItemDiscard.playerId];
    for (const itemId of Object.keys(owner?.items ?? {})) push({ type: 'discardItem', itemId });
  }

  // ③ 发现阶段
  if (st.phase === 'discovery') {
    if (st.pendingDiscoveryPick) for (const p of survivors) push({ type: 'pickSurvivorTurn', playerId: p.id });
    for (const c of st.discoveryOptions ?? []) push({ type: 'chooseDiscovery', cardId: c?.id ?? c });
    push({ type: 'acknowledgeDiscovery' });
  }

  // ④ 遭遇
  if (st.encounter) {
    push({ type: 'resolveEncounterDice' });
    for (const p of survivors) push({ type: 'pickEncounterTarget', targetPlayerId: p.id });
    push({ type: 'playEncounterAttack', cardId: null, boost: false });
    /** 防御这一步（不选物品最省，再按快照给的可选物品逐个试） */
    push({ type: 'playEncounterDefense', cardId: null, itemId: null });
    for (const itemId of (snap?.defenseItemChoices ?? [])) {
      push({ type: 'playEncounterDefense', cardId: null, itemId });
    }
    /**
     * ⚠ **`encounterFlee` 要排在 `pickFleeSurvivor` 前面**：
     * 点名单重复点同一个人也算成功，排前面就会一直点名单、走不到"真的撤离"
     * （`duo-sweep.mjs` 就是这么红的）。还没人选中时它会报错，自然落到点名单。
     */
    push({ type: 'encounterFlee', moveToRoomId: null });
    for (const to of (snap?.legalMoves ?? []).slice(0, 4)) {
      push({ type: 'encounterFlee', moveToRoomId: to });
    }
    for (const p of survivors) push({ type: 'pickFleeSurvivor', targetPlayerId: p.id });
  }

  // ⑤ 响声
  if (st.phase === 'noiseReport') push({ type: 'acknowledgeNoise' });

  // ⑥ 幸存者主回合
  if (st.phase === 'survivorMain') {
    /** 现在轮到谁行动（`activePlayerId` 在 survivorMain 就是那名幸存者） */
    const active = st.players[activePlayerId(st)];
    if (st.pendingSurvivorPick) {
      for (const p of survivors) push({ type: 'pickSurvivorTurn', playerId: p.id });
      for (const p of survivors) push({ type: 'pickMoveSurvivor', targetPlayerId: p.id });
    }
    /**
     * ⚠ **只在"这里真的能搜索"时才提** —— 合作确认是**先挂起、后校验**：
     * 提一个不合法的搜索会让"队友确认"那一步重放失败，而失败时
     * `pendingCoopAction` 已经被清掉了，驱动器就会一直重复"提搜索→确认失败"，
     * 原地打转 6000 步走不出第 1 个大回合（这就是之前那次的现象）。
     */
    if (snap?.canSearchHere) push({ type: 'search' });
    /**
     * ⚠ **`repair` / `clearFear` / `useSuitcase` 要按"能不能用"来提**，
     * 不能无条件提 —— 它们都要过合作确认，而合作确认是**先挂起、后校验**：
     * 提一个不能做的动作会白占一步（先挂起 → 队友确认时才报错），
     * 原来一局里大半步数都浪费在"提修理 → 确认失败"上。
     *
     * 判定口径抄客户端的 `canRepairHere`（`GameViews.tsx:2134`）：
     * 地点带 `repairable` 标签 + 本阶段还没修过 + 修理进度没满 + 同地点没杀手。
     */
    const hereRoom = st.map.rooms.find((r) => r.id === active?.roomId);
    const canRepairHere = Boolean(hereRoom?.tags?.includes('repairable')) &&
      !st.repairedThisPhase &&
      st.repairProgress < (st.rules.repairNeeded ?? Number.POSITIVE_INFINITY) &&
      !snap?.killerInYourRoom;
    if (canRepairHere) push({ type: 'repair' });
    if ((active?.fear ?? 0) > 0) push({ type: 'clearFear' });
    if (st.suitcaseAvailable) push({ type: 'useSuitcase', actorPlayerId: active?.id });
    /**
     * ⚠ **移动要排除"自己现在站着的地点"**。
     *
     * 快照的 `legalMoves` 是 `legalMoveRooms(range, minRange=0)` 算出来的，
     * **含 0 步**（也就是自己那一格）；而"一般行动移动"要求 1–2 步，
     * 点自己那格会被拒（`一般行动移动必须 1–2 步`）—— 那个拒绝又发生在
     * "队友确认重放"这一步，以前会把 `move` **整类**永久拉黑，
     * 于是这名幸存者再也动不了、主回合走不完。
     */
    const here = active?.roomId;
    for (const to of (snap?.legalMoves ?? []).filter((r) => r !== here).slice(0, 4)) {
      push({ type: 'move', toRoomId: to });
    }
    push({ type: 'georgeDraw', actorPlayerId: piece });
    push({ type: 'useMirrorPortal' });
    push({ type: 'useInsightOrb' });
    for (const itemId of Object.keys(st.players[piece]?.items ?? {})) {
      push({ type: 'useItem', itemId, actorPlayerId: piece });
    }
    push({ type: 'finishSurvivorPhase' });
    /**
     * ⚠ **换人必须排在最后**：规则允许"做一般行动前反复换人"，
     * 所以 `pickSurvivorTurn` **永远都会成功** —— 排在前面的话驱动器
     * 就只会一直换来换去、一个动作都不做（6000 步走不出第 1 个大回合）。
     *
     * 只换**还没行动过的**人：换到已经行动过的人身上会变成 ping-pong。
     */
    for (const p of survivors) {
      if (p.id !== active?.id && !p.mainActionUsed) push({ type: 'pickSurvivorTurn', playerId: p.id });
    }
  }

  // ⑦ 杀手主回合（"点地图"的操作都走 move，所以无条件发）
  if (st.phase === 'killerMain') {
    push({ type: 'advanceKillerStep' });
    push({ type: 'chooseKillerMain', choice: 'actions' });
    for (const cardId of (st.killers?.[st.killerId]?.hand ?? []).slice(0, 5)) {
      push({ type: 'playKillerCard', cardId, payCardIds: [] });
    }
    /**
     * ⚠ 杀手的主要行动是**移动或搜索** —— 这一支原来漏了 `search`，
     * 于是手里只剩慢速牌时（`endTurn` 会报"第三阶段必须进行 1–2 次行动"）
     * 就再也推不动了。搜索对杀手**不走合作确认**（`needsCoopConfirm` 只看幸存者），
     * 所以无条件发也不会打转。
     */
    push({ type: 'search' });
    for (const to of (snap?.legalMoves ?? []).slice(0, 6)) push({ type: 'move', toRoomId: to });
    push({ type: 'endTurn' });
  }

  push({ type: 'endTurn' });
  return list;
}

const attempt = (st, action, sid) => {
  try { handleAction(st, sid, action, content); return null; }
  catch (e) { return e.message; }
};

/**
 * 「动作指纹」：类型 + 关键参数。
 *
 * 用来记住"哪一个动作被队友确认打回来了"。用**类型+参数**而不是只认类型 ——
 * `move` 到 A 被拒不代表 `move` 到 B 也不行（点自己那格才算 0 步非法）。
 *
 * ⚠ 不能直接 `JSON.stringify(action)`：`pendingCoopAction.action` 是服务端
 * 存下来的（过了一遍解析），键的顺序未必和驱动器里那个字面量一致。
 */
const keyOf = (a) => a
  ? [a.type, a.toRoomId, a.targetPlayerId, a.actorPlayerId, a.cardId, a.itemId, a.roomId]
    .map((x) => x ?? '').join('|')
  : '';

function playOne(mapId, killerId, maxSteps = 6000, quiet = false) {
  const st = mkVs2(mapId, killerId);
  const phaseSeq = [];
  const stuckAt = [];
  let steps = 0;
  let coopConfirmed = 0;   // 替队友确认了几次
  /**
   * ⚠ 被"队友确认"打回来的**那一个动作**，之后不再提。
   *
   * 合作确认是**先挂起、后校验**：像"站在不能搜索的地点提搜索"、"点自己
   * 站着的那一格移动（0 步）"这种，挂起会成功、但队友确认时**重放才报**，
   * 而那一刻 `pendingCoopAction` 已经被清掉了 —— 驱动器就会一遍遍
   * "提同一个动作 → 确认失败"，原地打转 6000 步走不出第 1 个大回合。
   *
   * ⚠ 拉黑**只针对"那一个动作"**（类型 + 目标），而且**换人就清空**：
   * 以前按动作**类型**永久拉黑，`move` / `repair` / `useSuitcase` / `clearFear`
   * 各被打回来一次之后，幸存者就**没有任何动作可发**了 —— 主回合永远走不完
   * （第 31 步那个卡点）。
   */
  const banned = new Set();
  let lastActive = null;

  while (st.phase !== 'gameOver' && steps < maxSteps) {
    steps += 1;
    const who = actorOf(st);
    const snap = buildSnapshot(st, who.socketId);
    const key = `${st.phase}|${st.pendingSurvivorPick ? 'pick' : ''}|${st.discoveryOptions?.length ?? 0}|${st.encounter ? 'enc' : ''}|${st.pendingCoopAction ? 'coop' : ''}`;
    if (phaseSeq[phaseSeq.length - 1] !== key) phaseSeq.push(key);
    if (st.pendingCoopAction) coopConfirmed += 1;

    /** 换人了/换阶段了 → 黑名单作废（那条拒绝是针对上一个人那个位置的） */
    if (who.pieceId !== lastActive) { banned.clear(); lastActive = who.pieceId; }

    /** 这一轮挂着的合作提议是**哪一个动作**（失败时拉黑的就是它，不是整类） */
    const offerKey = st.pendingCoopAction ? keyOf(st.pendingCoopAction.action) : null;
    /**
     * ⚠ 拉黑**只对幸存者主回合生效**：幸存者提"站在不能搜的地点搜索"会被
     * 队友确认打回来（那种要拉黑），但 `move` / `search` 在**杀手回合是正常动作** ——
     * 一起拉黑的话杀手就只剩 `endTurn`，而它又要求"必须先做 1–2 次行动"，直接死锁。
     */
    const cands = candidates(st, snap, who.pieceId)
      .filter((a) => !(st.phase === 'survivorMain' && banned.has(keyOf(a))));
    /**
     * ⚠ **该谁动就只让谁发**。一开始我把三个网线都试一遍，
     * 结果幸存者在**杀手回合**发 `search` 会走进"挂起合作确认"（它不报错），
     * 驱动器就一直提它、永远轮不到杀手自己搜 —— 原地打转。
     */
    const sockets =
      (st.phase === 'killerMain' || st.phase === 'noiseReport' || st.phase === 'upkeep') ? ['k']
        : (st.phase === 'survivorMain' || st.phase === 'discovery') ? ['s1', 's2']
          : ['k', 's1', 's2'];   // 遭遇这种两边都可能动的，就都试
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
    if (!quiet && steps <= 40) {
      console.log(`   ${String(steps).padStart(4)}. [${st.phase}] ${used ? JSON.stringify(used) : '**卡住**'}`);
    }
    if (st.pendingCoopAction && coopConfirmed <= 3) {
      console.log(`     [诊断] offer=${JSON.stringify(st.pendingCoopAction)}`);
      for (const r of rejects.filter((x) => x.includes('respondCoopAction')).slice(0, 4)) {
        console.log(`     [诊断] ${r}`);
      }
    }
    /** 这一轮挂着合作确认、"队友确认"又没能成功 → 那个动作本身不合法，拉黑不再提 */
    if (offerKey &&
        rejects.some((r) => r.includes('respondCoopAction') && !r.includes('只能由另一名'))) {
      banned.add(offerKey);
    }
    if (!done) {
      stuckAt.push({
        step: steps, phase: st.phase, round: st.round,
        fields: interestingFields(st),
        lastRejects: [...new Set(rejects)].slice(0, 24),
        extra: `killer.roomId=${st.players[st.killerId]?.roomId} legalMoves=${JSON.stringify(snap.legalMoves)}`
          + ` step=${st.killerTurnStep} left=${st.killerMainActionsLeft} choice=${st.killerMainChoice}`,
      });
      break;
    }
  }
  return { st, steps, stuckAt, phaseSeq, coopConfirmed };
}

console.log('=== 1对2 走完整一局（合作确认自动通过）===');
const r = playOne('cabin', 'killer1');
console.log(`\n  走了 ${r.steps} 步 → 阶段=${r.st.phase} 大回合=${r.st.round} 胜负=${r.st.winner ?? '(未分)'}`);
console.log(`  胜负原因：${r.st.winReason ?? '(无)'}`);
console.log(`  战报 ${r.st.logs.length} 条；替队友确认过 ${r.coopConfirmed} 次`);

if (r.stuckAt.length) {
  const s = r.stuckAt[0];
  console.log(`\n  ⚠⚠ 第 ${s.step} 步卡住：phase=${s.phase} round=${s.round}`);
  console.log(`     当时非默认字段：`);
  for (const f of s.fields) console.log(`       ${f}`);
  console.log(`     ${s.extra}`);
  console.log(`     拒绝原因（去重后全列）：`);
  for (const x of s.lastRejects) console.log(`       ${x}`);
}

const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}`, extra);
  return cond ? 0 : 1;
};
let fail = 0;
console.log('');
fail += ok(r.steps > 20, '**真的推进了**', `${r.steps} 步`);
fail += ok(r.st.round > 1, '**至少走到第 2 个大回合**', `round=${r.st.round}`);
fail += ok(r.coopConfirmed > 0, '路上**确实遇到过合作确认**（不然这个测试没意义）', `${r.coopConfirmed} 次`);
/**
 * ⚠ 这两条是**这个脚本存在的意义**：合作确认不能把整局卡住。
 *
 * 以前这里只敢断言"至少走到第 2 个大回合"—— 因为驱动器对**分步动作**覆盖不够
 * （移动要排除自己那格、换人永远合法所以不能排前面、被队友确认打回的动作
 * 只能按"动作指纹"拉黑而不能按类型永久拉黑），会在幸存者主回合停住。
 * 驱动器补齐之后就能真的走到 `gameOver` 了。
 */
fail += ok(r.st.phase === 'gameOver', '**整局走完、分出了胜负**',
  `winner=${r.st.winner ?? '(未分)'} / ${r.st.winReason ?? '(无原因)'}`);
fail += ok(r.stuckAt.length === 0, '**中间没有卡住**',
  r.stuckAt.length ? `第 ${r.stuckAt[0].step} 步（${r.stuckAt[0].phase}）` : '');
if (r.stuckAt.length) {
  console.log(`  ⚠ 停在 ${r.stuckAt[0].phase} round=${r.stuckAt[0].round}` +
    `（驱动器对分步动作覆盖不足，不是游戏问题）`);
}

console.log(fail ? `\n${fail} 项不合格。` : '\n✅ 1对2 整局跑通，合作确认没有卡住流程。');
process.exit(fail ? 1 : 0);
