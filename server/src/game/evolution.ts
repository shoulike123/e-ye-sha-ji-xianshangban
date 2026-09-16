/**
 * 杀手进化牌：等级效果叠加上去，开局 1 级就生效。
 * 升级只多拿新一级，旧级一直留着。力量只有牌面写了才加。
 */
import type { GameState, PlayerState } from './types.js';
import {
  addFear,
  addKillerTurnPower,
  applyDamage,
  canonicalDoorId,
  clearTrapAfterEncounter,
  doorId,
  isDoorBlocked,
  isDoorEdge,
  log,
  parseDoor,
  removableBlockades,
  roomName,
  survivorsInRoom,
  tryPlaceBlockadeDoor,
  unblockedDoorsAt,
} from './effects.js';

export type KillerKind = 'butcher' | 'spectre' | 'murderer';

/** 进化牌原文，按等级 1～5。空字符串 = 这一级没有效果。 */
export const EVOLUTION_TEXT: Record<KillerKind, string[]> = {
  butcher: [
    '/',
    '力量 +1',
    '解锁「残酷暴怒」',
    '「链锯轰鸣」成为快速',
    '发生遭遇时，在攻击前伤害地点中的所有目标',
  ],
  spectre: [
    '发生遭遇时，【惊吓】地点中的所有目标',
    '在使用「呼啸而过」后，你可以弃掉 2 张卡牌来【搜索房间】',
    '每当有幸存者惊恐过度时，你可以弃掉 3 张卡牌来伤害该幸存者',
    '解锁「生命吸取」',
    '发生遭遇时，在攻击前伤害地点中的所有目标',
  ],
  murderer: [
    '/',
    '如果你在重现时遇到任何幸存者，本回合 +3 力量',
    '解锁「死亡盛放」',
    '力量 +1；在任意地点总计【封堵】×4（可以在多个地点使用）',
    '发生遭遇时，在攻击前伤害地点中的所有目标',
  ],
};

export function killerKindOf(state: GameState): KillerKind | null {
  const k = state.killerId ? state.players[state.killerId] : null;
  const ch = state.characters.find((c) => c.id === k?.characterId);
  const hay = `${k?.characterId ?? ''} ${ch?.name ?? ''} ${k?.name ?? ''}`;
  if (/killer1|屠夫|butcher/i.test(hay)) return 'butcher';
  if (/killer2|幽魂|spectre/i.test(hay)) return 'spectre';
  if (/killer3|谋杀|murder/i.test(hay)) return 'murderer';
  return null;
}

/** 1 级到当前级，已经生效的原文（给「查看杀手信息」） */
export function activeEvolutionLines(state: GameState): Array<{ level: number; text: string }> {
  const kind = killerKindOf(state);
  if (!kind) return [];
  const lv = Math.max(1, Math.min(5, state.killerLevel));
  return EVOLUTION_TEXT[kind].slice(0, lv).map((text, i) => ({ level: i + 1, text }));
}

/** 永久力量 + 本回合临时力量，不超过上限 10 */
export function effectiveKillerPower(state: GameState): number {
  const cap = state.rules.killerPowerMax ?? 10;
  return Math.min(cap, Math.max(0, state.killerPower + (state.killerTurnPowerBonus ?? 0)));
}

export function formatKillerPowerLabel(state: GameState): string {
  const bonus = state.killerTurnPowerBonus ?? 0;
  return bonus > 0 ? `${state.killerPower}+${bonus}` : `${String(state.killerPower)}`;
}

function addPermanentPower(state: GameState, delta: number): void {
  const cap = state.rules.killerPowerMax ?? 10;
  const before = state.killerPower;
  state.killerPower = Math.min(cap, Math.max(0, state.killerPower + delta));
  if (state.killerPower !== before) {
    log(state, `进化：永久力量 ${before} → ${state.killerPower}。`);
  }
}

function allUnblockedDoorIds(state: GameState): string[] {
  const seen = new Set<string>();
  for (const e of state.map.edges) {
    if (!isDoorEdge(e.pathType)) continue;
    const id = doorId(e.from, e.to);
    if (!isDoorBlocked(state, id)) seen.add(id);
  }
  return [...seen];
}

function doorTouchesRoom(doorIdStr: string, roomId: string): boolean {
  const pair = parseDoor(doorIdStr);
  return Boolean(pair && (pair[0] === roomId || pair[1] === roomId));
}

function blockadeSlots(state: GameState): number {
  return Math.max(0, (state.rules.blockadeTokenMax ?? 7) - state.blockades.length);
}

export function removableForJob(state: GameState): string[] {
  const job = state.pendingBlockadeJob;
  const forbidden = job?.kind === 'sealAll' ? job.roomId : null;
  return removableBlockades(state).filter((id) => !forbidden || !doorTouchesRoom(id, forbidden));
}

/** 摸牌堆空了还要摸时调用：升一级、结算该级力量/锁定牌，并停下来确认新效果。 */
export function runUpgrade(state: GameState): void {
  const beforeLv = state.killerLevel;
  if (beforeLv >= 5) return;
  state.killerLevel = beforeLv + 1;
  log(state, `杀手进化！等级 ${beforeLv} → ${state.killerLevel}。请确认新效果。弃牌洗回摸牌堆。`);
  applyNewEvolutionLevel(state, state.killerLevel);
  const unlocked = state.killerLocked.filter((id) => {
    const card = state.cardById[id];
    return card?.unlockLevel != null && card.unlockLevel <= state.killerLevel;
  });
  for (const id of unlocked) {
    state.killerLocked = state.killerLocked.filter((x) => x !== id);
    state.killerHand.push(id);
    log(state, `锁定牌「${state.cardById[id]?.name ?? id}」加入手牌，此后与普通牌无异。`);
  }
  const max = state.rules.killerHandMax ?? 5;
  if (state.killerHand.length > max) {
    state.pendingUnlockDiscard = true;
    state.pendingKillerDiscards = state.killerHand.length - max;
    /** 刚入手的锁定牌本次不能弃（满手牌时摸进来的牌不在此列，那些就该弃） */
    state.justUnlockedCards = [...unlocked];
    log(state, `进化入手牌后手牌超过 ${max}，请自选弃置 ${state.pendingKillerDiscards} 张。`);
  } else {
    state.justUnlockedCards = [];
  }
  if (!state.pendingEvolutionAck) {
    state.pendingEvolutionAck = { fromLevel: beforeLv, toLevel: state.killerLevel };
  } else {
    state.pendingEvolutionAck.toLevel = state.killerLevel;
  }
}

/** 升到 newLevel 当下：只结算这一级（旧级已经在身上） */
export function applyNewEvolutionLevel(state: GameState, newLevel: number): void {
  const kind = killerKindOf(state);
  if (!kind) return;
  if (kind === 'butcher' && newLevel === 2) addPermanentPower(state, 1);
  if (kind === 'murderer' && newLevel === 4) addPermanentPower(state, 1);
  if (kind === 'murderer' && newLevel === 4) {
    state.pendingEvoFourBlockade = true;
  }
}

/** 重现强制搜索确实发现人：谋杀者 2 级本回合 +3 力量（上限 10） */
export function applyMurdererRevealPower(state: GameState): void {
  if (killerKindOf(state) !== 'murderer' || state.killerLevel < 2) return;
  if (!state.lastSearchFound) return;
  log(state, '谋杀者进化 2 级：重现时搜索房间找到人，本回合力量 +3。');
  addKillerTurnPower(state, 3);
}

export function queueOverFearWound(state: GameState, targetId: string): void {
  if (killerKindOf(state) !== 'spectre' || state.killerLevel < 3) return;
  const t = state.players[targetId];
  if (!t?.alive) return;
  if (!state.pendingOverFearQueue) state.pendingOverFearQueue = [];
  state.pendingOverFearQueue.push(targetId);
  maybePromptOverFearWound(state);
}

export function maybePromptOverFearWound(state: GameState): void {
  if (state.pendingOverFearWound || state.pendingAmulet) return;
  if (!state.pendingOverFearQueue) state.pendingOverFearQueue = [];
  while (state.pendingOverFearQueue.length) {
    const id = state.pendingOverFearQueue.shift()!;
    const t = state.players[id];
    if (!t?.alive) continue;
    state.pendingOverFearWound = { targetId: id };
    log(
      state,
      `${t.name} 惊恐过度。幽魂可以弃 3 张手牌对其造成 1 点伤害（手里不足 3 张则不能用）。`,
    );
    return;
  }
}

export function resolveOverFearWound(state: GameState, use: boolean, payCardIds: string[]): void {
  const pending = state.pendingOverFearWound;
  if (!pending) throw new Error('当前没有惊恐过度的进化选择');
  const t = state.players[pending.targetId];
  state.pendingOverFearWound = null;
  if (!use) {
    log(state, '幽魂不使用惊恐过度伤害。');
    continueAfterOverFear(state);
    return;
  }
  if (state.killerHand.length < 3) throw new Error('手里不足 3 张，不能弃牌伤害');
  const pay = [...new Set(payCardIds)];
  if (pay.length !== 3) throw new Error('请自选弃置 3 张手牌');
  for (const id of pay) {
    if (!state.killerHand.includes(id)) throw new Error('弃置的牌不在手里');
  }
  for (const id of pay) {
    const i = state.killerHand.indexOf(id);
    state.killerHand.splice(i, 1);
    state.killerDiscard.push(id);
  }
  const names = pay.map((id) => state.cardById[id]?.name ?? id);
  log(state, `幽魂弃置「${names.join('、')}」，伤害 ${t?.name ?? '幸存者'}。`);
  if (t?.alive && state.killerId) {
    applyDamage(state, t.id, 1, state.killerId);
  }
  continueAfterOverFear(state);
}

function continueAfterOverFear(state: GameState): void {
  if (state.phase === 'gameOver') return;
  maybePromptOverFearWound(state);
  if (state.pendingOverFearWound || state.pendingAmulet) return;
  if (state.encounterOpenHold) {
    finishEncounterOpen(state);
    return;
  }
  maybeOfferWhizSearch(state);
}

/** 遭遇刚开战：先惊吓（幽魂 1），再伤害（5 级），再选人 / 加攻。遭遇期间伤害不能出示护符。 */
export function applyEncounterOpenEffects(state: GameState): void {
  const enc = state.encounter;
  if (!enc) return;
  const kind = killerKindOf(state);
  const here = survivorsInRoom(state, enc.roomId);
  if (kind === 'spectre' && state.killerLevel >= 1) {
    for (const s of here) addFear(state, s.id, 1);
    if (here.length) log(state, `幽魂进化 1 级：惊吓了 ${here.map((s) => s.name).join('、')}。`);
    else log(state, '幽魂进化 1 级：地点里没有可惊吓的人。');
  }
  state.encounterOpenHold = true;
  if (state.pendingOverFearWound || (state.pendingOverFearQueue?.length ?? 0) > 0) {
    maybePromptOverFearWound(state);
    if (state.pendingOverFearWound) return;
  }
  finishEncounterOpen(state);
}

export function finishEncounterOpen(state: GameState): void {
  const enc = state.encounter;
  if (!enc || !state.encounterOpenHold) return;
  if (state.pendingOverFearWound || state.pendingAmulet) return;
  state.encounterOpenHold = false;
  if (state.killerLevel >= 5 && state.killerId) {
    const targets = survivorsInRoom(state, enc.roomId);
    log(
      state,
      targets.length
        ? `进化 5 级：攻击前伤害「${roomName(state, enc.roomId)}」的 ${targets.map((s) => s.name).join('、')}。`
        : '进化 5 级：地点里没有可伤害的人。',
    );
    for (const s of targets) {
      applyDamage(state, s.id, 1, state.killerId, { skipAmulet: true });
      if (state.phase === 'gameOver') {
        clearTrapAfterEncounter(state, enc.roomId);
        state.encounter = null;
        return;
      }
    }
  }
  const alive = survivorsInRoom(state, enc.roomId);
  if (alive.length === 0) {
    // 当前模式打死人通常已 gameOver；各自为战等模式可能地点清空但局未终——必须清掉遭遇，否则行动区卡住。
    log(state, '遭遇地点已没有存活幸存者，遭遇结束。');
    onEncounterOpenNoTargets?.(state);
    return;
  }
  enc.discoveredIds = alive.map((s) => s.id);
  if (alive.length === 1) {
    enc.targetId = alive[0]!.id;
    enc.defenseOptions[alive[0]!.id] = [];
    enc.step = 'attack';
  } else {
    enc.targetId = null;
    enc.step = 'pick';
  }
}

/** 开战效果后地点无人：由 engine 注册，清遭遇并收尾杀手回合（未终局时） */
let onEncounterOpenNoTargets: ((state: GameState) => void) | null = null;

export function setEncounterOpenNoTargetsHandler(fn: (state: GameState) => void) {
  onEncounterOpenNoTargets = fn;
}

export function markWhizFollowup(state: GameState): void {
  state.whizJustResolved = true;
}

export function maybeOfferWhizSearch(state: GameState): void {
  if (!state.whizJustResolved) return;
  if (state.pendingPathDraft || state.pendingMoveRange != null) return;
  if (state.pendingAmulet || state.pendingOverFearWound) return;
  if (state.encounter || state.phase === 'gameOver') {
    state.whizJustResolved = false;
    return;
  }
  state.whizJustResolved = false;
  if (killerKindOf(state) !== 'spectre' || state.killerLevel < 2) return;
  if (state.killerHand.length < 2) {
    log(state, '幽魂进化 2 级：手里不足 2 张，不能弃牌搜索房间。');
    return;
  }
  state.pendingWhizSearch = true;
  log(state, '幽魂进化 2 级：可以弃 2 张手牌，搜索移动结束后的当前房间（不占行动）。');
}

export function resolveWhizSearch(state: GameState, use: boolean, payCardIds: string[]): boolean {
  if (!state.pendingWhizSearch) throw new Error('当前没有呼啸后的搜索房间选择');
  state.pendingWhizSearch = false;
  if (!use) {
    log(state, '幽魂不使用呼啸后的搜索房间。');
    return false;
  }
  if (state.killerHand.length < 2) throw new Error('手里不足 2 张，不能弃牌搜索房间');
  const pay = [...new Set(payCardIds)];
  if (pay.length !== 2) throw new Error('请自选弃置 2 张手牌');
  for (const id of pay) {
    if (!state.killerHand.includes(id)) throw new Error('弃置的牌不在手里');
  }
  for (const id of pay) {
    const i = state.killerHand.indexOf(id);
    state.killerHand.splice(i, 1);
    state.killerDiscard.push(id);
  }
  const names = pay.map((id) => state.cardById[id]?.name ?? id);
  const k = state.killerId ? state.players[state.killerId] : null;
  log(state, `幽魂弃置「${names.join('、')}」，搜索房间「${roomName(state, k?.roomId)}」。`);
  if (!k?.roomId) return false;
  const victims = survivorsInRoom(state, k.roomId);
  state.lastSearchFound = victims.length > 0;
  if (victims.length === 0) log(state, `${k.name} 搜索房间，没有发现人。`);
  else log(state, `${k.name} 搜索房间，发现了 ${victims.map((v) => v.name).join('、')}！`);
  return victims.length > 0;
}

export function startOneDoorBlockade(state: GameState, roomId: string): boolean {
  if (unblockedDoorsAt(state, roomId).length === 0) {
    log(state, '此地没有能封堵的门，跳过封堵。');
    return false;
  }
  if (blockadeSlots(state) >= 1) {
    state.pendingBlockade = true;
    log(state, `请点与「${roomName(state, roomId)}」相邻的一扇门封堵。再点同一格可取消，行动区确认后才落下。`);
    return true;
  }
  if (removableBlockades(state).length === 0) {
    log(state, '场上封堵已满，且没有可移除的封堵，跳过。');
    return false;
  }
  state.pendingBlockadeJob = { kind: 'oneDoor', roomId, need: 1, removeLeft: 1, placed: 0, firstRoomId: null };
  log(state, '场上可放置封堵不足。请先选一扇场上封堵移除（每次确认），然后再封新门。');
  return true;
}

export function startSealAllBlockade(state: GameState, roomId: string): boolean {
  state.pendingBlockadeJob = {
    kind: 'sealAll',
    roomId,
    need: unblockedDoorsAt(state, roomId).length,
    removeLeft: 0,
    placed: 0,
    firstRoomId: null,
  };
  return continueSealAllBlockade(state);
}

export function continueSealAllBlockade(state: GameState): boolean {
  const job = state.pendingBlockadeJob;
  if (!job || job.kind !== 'sealAll') return false;
  const roomId = job.roomId;
  if (!roomId) {
    state.pendingBlockadeJob = null;
    return false;
  }
  const left = unblockedDoorsAt(state, roomId);
  if (left.length === 0) {
    log(state, `已封堵「${roomName(state, roomId)}」的全部门（场上 ${state.blockades.length}/${state.rules.blockadeTokenMax}）。`);
    state.pendingBlockadeJob = null;
    return false;
  }
  const slots = blockadeSlots(state);
  const removable = removableForJob(state);
  if (slots >= left.length) {
    for (const d of left) tryPlaceBlockadeDoor(state, d.id);
    return continueSealAllBlockade(state);
  }
  if (removable.length === 0) {
    log(
      state,
      `「${roomName(state, roomId)}」仍有 ${left.length} 扇门未封，但没有可移除的场上封堵（不能拆自己所在地的封堵）。`,
    );
    state.pendingBlockadeJob = null;
    return false;
  }
  job.need = left.length;
  job.removeLeft = Math.min(left.length - slots, removable.length);
  log(
    state,
    `「留下」要封 ${job.need} 扇门，可放置槽位不够。请先移除 ${job.removeLeft} 个场上封堵（不能拆「${roomName(state, roomId)}」的门）。每次移除都确认。`,
  );
  return true;
}

export function startAnyDoorsBlockade(state: GameState, want: number): boolean {
  const available = allUnblockedDoorIds(state);
  const need = Math.min(want, available.length);
  if (need <= 0) {
    log(state, '地图上没有未封堵的门，跳过进化封堵。');
    return false;
  }
  const slots = blockadeSlots(state);
  const removeLeft = Math.max(0, need - slots);
  state.pendingBlockadeJob = {
    kind: 'anyDoors',
    roomId: null,
    need,
    removeLeft,
    placed: 0,
    firstRoomId: null,
    secondRoomId: null,
  };
  if (removeLeft > 0) {
    log(state, `进化 4 级要封 ${need} 扇门。请先依次移除 ${removeLeft} 个场上封堵，再选新门。`);
  } else {
    log(state, `进化 4 级：请在整张地图选 ${need} 扇未封堵的门（每扇点两个相邻地点，行动区确认）。`);
  }
  return true;
}

export function removeBoardBlockade(state: GameState, doorIdStr: string): void {
  const job = state.pendingBlockadeJob;
  if (!job || job.removeLeft <= 0) throw new Error('当前不是移除场上封堵');
  if (!isDoorBlocked(state, doorIdStr)) throw new Error('那里没有封堵');
  if (state.blockadesThisAction?.some((id) => canonicalDoorId(id) === canonicalDoorId(doorIdStr))) {
    throw new Error('不能拆除本次刚封上的门');
  }
  if (job.kind === 'sealAll' && job.roomId && doorTouchesRoom(doorIdStr, job.roomId)) {
    throw new Error('不能拆除自己所在地点的封堵');
  }
  const i = state.blockades.indexOf(doorIdStr);
  state.blockades.splice(i, 1);
  const pair = parseDoor(doorIdStr);
  log(
    state,
    pair
      ? `移除「${roomName(state, pair[0])}」–「${roomName(state, pair[1])}」的封堵（还需移除 ${job.removeLeft - 1}）。`
      : `移除封堵。`,
  );
  job.removeLeft -= 1;
  if (job.removeLeft > 0) return;
  if (job.kind === 'sealAll') {
    continueSealAllBlockade(state);
    return;
  }
  if (job.kind === 'oneDoor' && job.roomId) {
    state.pendingBlockade = true;
    log(state, `请点与「${roomName(state, job.roomId)}」相邻的一扇门封堵。`);
    return;
  }
  if (job.kind === 'anyDoors') {
    log(state, `请再选 ${job.need - job.placed} 扇未封堵的门（每扇点两个相邻地点后确认）。`);
  }
}

export function pickAnyDoorRoom(state: GameState, roomId: string): void {
  const job = state.pendingBlockadeJob;
  if (!job || job.kind !== 'anyDoors' || job.removeLeft > 0) {
    throw new Error('当前不是选择任意封堵门');
  }
  if (job.secondRoomId && roomId === job.secondRoomId) {
    job.secondRoomId = null;
    log(state, `已取消「${roomName(state, roomId)}」。`);
    return;
  }
  if (job.firstRoomId && roomId === job.firstRoomId) {
    job.firstRoomId = job.secondRoomId ?? null;
    job.secondRoomId = null;
    log(state, job.firstRoomId ? `已取消该地点。仍选「${roomName(state, job.firstRoomId)}」。` : '已取消地点选择。');
    return;
  }
  if (!job.firstRoomId) {
    job.firstRoomId = roomId;
    log(state, `已选「${roomName(state, roomId)}」，请再点一个与它以门相连的地点。再点同一格可取消。`);
    return;
  }
  if (job.secondRoomId) throw new Error('已经选好一扇门，请确认或再点已选地点取消');
  const id = doorId(job.firstRoomId, roomId);
  const edge = state.map.edges.find(
    (e) =>
      isDoorEdge(e.pathType) &&
      ((e.from === job.firstRoomId && e.to === roomId) || (e.to === job.firstRoomId && e.from === roomId)),
  );
  if (!edge) throw new Error('这两个地点之间没有可封的门');
  if (isDoorBlocked(state, id)) throw new Error('这扇门已经封上了');
  job.secondRoomId = roomId;
  log(state, `已选「${roomName(state, job.firstRoomId)}」与「${roomName(state, roomId)}」，请在行动区确认封堵。`);
}

export function confirmAnyDoor(state: GameState): void {
  const job = state.pendingBlockadeJob;
  if (!job || job.kind !== 'anyDoors' || job.removeLeft > 0) {
    throw new Error('当前不是确认任意封堵门');
  }
  if (!job.firstRoomId || !job.secondRoomId) throw new Error('请先点选两个相邻地点');
  const id = doorId(job.firstRoomId, job.secondRoomId);
  const placed = tryPlaceBlockadeDoor(state, id);
  if (placed !== 'ok') throw new Error('无法封堵这扇门');
  job.placed += 1;
  job.firstRoomId = null;
  job.secondRoomId = null;
  if (job.placed >= job.need) {
    log(state, `进化 4 级封堵完成（${job.placed} 扇）。`);
    state.pendingBlockadeJob = null;
    return;
  }
  log(state, `已封 ${job.placed}/${job.need}。请继续选下一扇门。`);
}

export function afterOneDoorPlaced(state: GameState): void {
  if (state.pendingBlockadeJob?.kind === 'oneDoor') state.pendingBlockadeJob = null;
  state.pendingBlockade = false;
}

export function hasEvolutionPending(state: GameState): boolean {
  return Boolean(
    state.pendingEvolutionAck ||
      state.pendingWhizSearch ||
      state.pendingOverFearWound ||
      (state.pendingOverFearQueue && state.pendingOverFearQueue.length > 0) ||
      state.encounterOpenHold ||
      state.pendingBlockadeJob ||
      state.pendingEvoFourBlockade,
  );
}

export function startPendingEvoFourIfNeeded(state: GameState): boolean {
  if (!state.pendingEvoFourBlockade) return false;
  if (state.pendingEvolutionAck) return true;
  state.pendingEvoFourBlockade = false;
  return startAnyDoorsBlockade(state, 4);
}

export function roomsForBlockadeRemove(state: GameState): string[] {
  const rooms = new Set<string>();
  for (const id of removableForJob(state)) {
    const pair = parseDoor(id);
    if (pair) {
      rooms.add(pair[0]);
      rooms.add(pair[1]);
    }
  }
  return [...rooms];
}

export function roomsForAnyDoorPick(state: GameState): string[] {
  return state.map.rooms.map((r) => r.id);
}

export function doorLabel(state: GameState, id: string): string {
  const pair = parseDoor(id);
  if (!pair) return id;
  return `${roomName(state, pair[0])}–${roomName(state, pair[1])}`;
}

export function emptyEvolutionFields(): Pick<
  GameState,
  | 'killerTurnPowerBonus'
  | 'pendingEvolutionAck'
  | 'pendingWhizSearch'
  | 'pendingOverFearWound'
  | 'pendingOverFearQueue'
  | 'encounterOpenHold'
  | 'whizJustResolved'
  | 'pendingEvoFourBlockade'
  | 'pendingBlockadeJob'
> {
  return {
    killerTurnPowerBonus: 0,
    pendingEvolutionAck: null,
    pendingWhizSearch: false,
    pendingOverFearWound: null,
    pendingOverFearQueue: [],
    encounterOpenHold: false,
    whizJustResolved: false,
    pendingEvoFourBlockade: false,
    pendingBlockadeJob: null,
  };
}

export function killerActorOrNull(state: GameState): PlayerState | null {
  return state.killerId ? state.players[state.killerId] ?? null : null;
}
