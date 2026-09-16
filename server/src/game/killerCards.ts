/**
 * 杀手牌的逐条结算。
 * 一张牌可能有好几步：先惊吓，再走路，再封门。
 * 需要玩家点地图时就停下来等；点完再 continueKillerQueue 继续。
 */
import type { CardDef, EffectDef } from '../content/schema.js';
import type { GameState, PlayerState, StealthRevealKind } from './types.js';
import {
  addFear,
  addKillerTurnPower,
  applyDamage,
  discardConsumedItem,
  log,
  mapDist,
  roomName,
  setStealth,
  tryMove,
  killerAdjacentRooms,
} from './effects.js';
import {
  hasEvolutionPending,
  maybeOfferWhizSearch,
  markWhizFollowup,
  maybePromptOverFearWound,
  finishEncounterOpen,
  startOneDoorBlockade,
  startSealAllBlockade,
} from './evolution.js';

/** 杀手是不是还在等玩家点地图 / 选颜色 / 选人 / 确认进化？没点完不能进入下一阶段 */
export function hasPendingKillerChoice(state: GameState): boolean {
  return (
    state.pendingMoveRange != null ||
    state.pendingBlockade ||
    Boolean(state.pendingBlockadePlace) ||
    Boolean(state.pendingSensePair) ||
    state.pendingSenseColor ||
    state.pendingLurkPick ||
    Boolean(state.pendingAmulet) ||
    Boolean(state.pendingPathDraft) ||
    hasEvolutionPending(state)
  );
}

/** 这张牌现在算快速、特殊还是慢速（链锯轰鸣 4 级变快速） */
export function effectiveCardSpeed(state: GameState, card: CardDef): string | undefined {
  if ((card.id === 'butcher_saw_1' || card.id === 'butcher_saw_2') && state.killerLevel >= 4) {
    return 'fast';
  }
  return card.speed;
}

/** 安娜的低调：感知看不见她 */
export function isLowProfile(state: GameState, p: PlayerState): boolean {
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (ch?.skills.some((s) => s.id === 'low_profile' || s.name.includes('低调'))) return true;
  return /安娜|anna|survivor1/i.test(`${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`);
}

/** 房间号以 R/B/G 开头的，分别是红蓝绿区 */
export function colorPrefixRooms(state: GameState, color: 'R' | 'B' | 'G'): string[] {
  return state.map.rooms.filter((r) => r.id.startsWith(color)).map((r) => r.id);
}

/** 这些房间里感知能看见谁（安娜除外） */
export function senseVisibleInRooms(state: GameState, roomIds: string[]): PlayerState[] {
  const set = new Set(roomIds);
  return Object.values(state.players).filter(
    (s) =>
      s.faction === 'survivor' &&
      s.alive &&
      s.roomId &&
      set.has(s.roomId) &&
      !isLowProfile(state, s),
  );
}

/** 离某格不超过 range 步的活着的幸存者 */
export function survivorsWithin(
  state: GameState,
  from: string,
  range: number,
): PlayerState[] {
  return Object.values(state.players).filter((s) => {
    if (s.faction !== 'survivor' || !s.alive || !s.roomId) return false;
    return mapDist(state, from, s.roomId, false) <= range;
  });
}

/** 桌上那名杀手棋子 */
function killerActor(state: GameState): PlayerState | null {
  return state.killerId ? state.players[state.killerId] ?? null : null;
}

/** 距离内所有幸存者各加 1 恐惧；没人就记“没有人受到惊吓” */
export function fearAtRange(state: GameState, origin: string, range: number): string[] {
  const hits = survivorsWithin(state, origin, range);
  const names: string[] = [];
  for (const s of hits) {
    addFear(state, s.id, 1);
    names.push(s.name);
  }
      if (names.length) log(state, `受到惊吓：${names.join('、')}。`);
      else log(state, '没有人受到惊吓。');
  maybePromptOverFearWound(state);
  return names;
}

/** 按顺序执行这张牌剩下的效果；碰到要玩家点选的就停 */
export function continueKillerQueue(state: GameState): void {
  if (state.pendingAmulet || state.pendingOverFearWound) return;
  const k = killerActor(state);
  if (!k) {
    state.pendingEffectQueue = [];
    return;
  }
  while (state.pendingEffectQueue.length) {
    if (state.phase === 'gameOver' || state.pendingAmulet || state.pendingOverFearWound) return;
    const fx = state.pendingEffectQueue.shift()!;
    if (applyQueued(state, k, fx)) return;
  }
  maybeOfferWhizSearch(state);
}

/** @returns true if waiting for player input */
/**
 * 执行杀手牌的一条效果。
 * 返回 true = 还要等玩家点（走路、封门、选颜色），先别继续下一条。
 */
function applyQueued(state: GameState, k: PlayerState, fx: EffectDef): boolean {
  switch (fx.op) {
    case 'senseColor':
      state.pendingSenseColor = true;
      log(state, '请选择要感知的颜色区域：红 / 蓝 / 绿。');
      return true;
    case 'senseAdjacentPair':
      state.pendingSensePair = { firstRoomId: null };
      log(state, '逻辑推理：请先点任意一个地点，再点一个与它相连的地点（门或一般通道，不含特殊通道；这两处不必与你相邻）。');
      return true;
    case 'move': {
      const max = typeof fx.value === 'number' ? fx.value : 1;
      const min = typeof fx.min === 'number' ? fx.min : 0;
      state.pendingPathDraft = { min, max, rooms: k.roomId ? [k.roomId] : [] };
      log(
        state,
        `请依次点相邻地点规划路径（${min}–${max} 步）。再点同一格可取消该步。步数合法后在行动区确认，才会移动。`,
      );
      return true;
    }
    case 'addFearRange': {
      if (!k.roomId) return false;
      const range = typeof fx.value === 'number' ? fx.value : 1;
      fearAtRange(state, k.roomId, range);
      return false;
    }
    case 'addFearPath': {
      const rooms = state.lastMovePath.length ? state.lastMovePath : k.roomId ? [k.roomId] : [];
      const names: string[] = [];
      for (const s of Object.values(state.players)) {
        if (s.faction !== 'survivor' || !s.alive || !s.roomId) continue;
        if (!rooms.includes(s.roomId)) continue;
        addFear(state, s.id, 1);
        names.push(s.name);
      }
      if (names.length) log(state, `路径上受到惊吓：${names.join('、')}。`);
      else log(state, '路径上没有人受到惊吓。');
      return false;
    }
    case 'addFear': {
      const amount = typeof fx.value === 'number' ? fx.value : 1;
      if (k.faction === 'survivor') addFear(state, k.id, amount);
      else {
        for (const s of Object.values(state.players)) {
          if (s.faction === 'survivor' && s.alive) addFear(state, s.id, amount);
        }
      }
      return false;
    }
    case 'damageHere': {
      const ids =
        typeof fx.value === 'string'
          ? fx.value.split(',').filter(Boolean)
          : Object.values(state.players)
              .filter((s) => s.faction === 'survivor' && s.alive && s.roomId === k.roomId)
              .map((s) => s.id);
      if (ids.length === 0) {
        log(state, '没有人受到伤害。');
        return false;
      }
      while (ids.length) {
        const id = ids.shift()!;
        applyDamage(state, id, 1, k.id);
        if (state.pendingAmulet) {
          if (ids.length) state.pendingEffectQueue.unshift({ op: 'damageHere', value: ids.join(',') });
          return true;
        }
      }
      return false;
    }
    case 'damageFeared': {
      const amount = typeof fx.amount === 'number' ? fx.amount : typeof fx.value === 'number' ? fx.value : 1;
      const ids =
        typeof fx.value === 'string'
          ? fx.value.split(',').filter(Boolean)
          : Object.values(state.players)
              .filter((s) => s.faction === 'survivor' && s.alive && s.fear >= 1)
              .map((s) => s.id);
      if (ids.length === 0) {
        log(state, '没有人受到伤害。');
        return false;
      }
      while (ids.length) {
        const id = ids.shift()!;
        applyDamage(state, id, amount, k.id);
        if (state.pendingAmulet) {
          if (ids.length) {
            state.pendingEffectQueue.unshift({ op: 'damageFeared', value: ids.join(','), amount });
          }
          return true;
        }
      }
      return false;
    }
    case 'exposeFeared': {
      const feared = Object.values(state.players).filter(
        (s) => s.faction === 'survivor' && s.alive && s.fear >= 1,
      );
      if (feared.length === 0) {
        log(state, '没有人需要揭示地点。');
        return false;
      }
      for (const s of feared) {
        s.exposed = true;
        log(state, `${s.name} 必须揭示地点：在「${roomName(state, s.roomId)}」。`);
      }
      return false;
    }
    case 'searchSurvivors':
    case 'rageSearch': {
      if (!k.roomId) {
        state.lastSearchFound = false;
        return false;
      }
      setStealth(k, false);
      const victims = Object.values(state.players).filter(
        (x) => x.faction === 'survivor' && x.alive && x.roomId === k.roomId,
      );
      state.lastSearchFound = victims.length > 0;
      log(
        state,
        victims.length
          ? `${k.name} 发现了 ${victims.map((v) => v.name).join('、')}！`
          : `${k.name} 搜索房间，没有发现人。`,
      );
      if (fx.op === 'rageSearch' && !state.lastSearchFound && state.lastMoveCrossedBlockade) {
        log(state, '没找到人且拆掉了封堵，「残酷暴怒」再执行一次。');
        state.pendingEffectQueue.unshift(
          { op: 'move', value: 2, min: 1 },
          { op: 'rageSearch' },
        );
      }
      return false;
    }
    case 'stealth':
      // 杀手不会自己解除潜行，只在回合开始重现
      if (fx.value === false) return false;
      setStealth(k, true);
      log(state, `${k.name} 在${roomName(state, k.roomId)}进入潜行。`);
      return false;
    case 'onReveal':
      state.stealthRevealKind = String(fx.value ?? '') as StealthRevealKind;
      return false;
    case 'placeBlockade':
      if (!k.roomId) {
        log(state, '不在地图上，无法封堵。');
        return false;
      }
      return startOneDoorBlockade(state, k.roomId);
    case 'placeBlockadeAll':
      if (!k.roomId) {
        log(state, '不在地图上，跳过封堵。');
        return false;
      }
      return startSealAllBlockade(state, k.roomId);
    case 'modifyPower':
      // 「疯狂」等：本回合临时力量，不是永久，也不是本次攻击
      if (typeof fx.value === 'number') addKillerTurnPower(state, fx.value);
      return false;
    default:
      return false;
  }
}

/** 杀手选好红/蓝/绿：只报这个颜色区有谁，不报具体房间 */
export function resolveSenseColor(state: GameState, color: 'R' | 'B' | 'G'): void {
  state.pendingSenseColor = false;
  state.pendingSenseColorPick = null;
  state.senseHighlight = color;
  const rooms = colorPrefixRooms(state, color);
  const found = senseVisibleInRooms(state, rooms);
  const label = color === 'R' ? '红色' : color === 'B' ? '蓝色' : '绿色';
  log(
    state,
    found.length
      ? `感知${label}区域：${found.map((s) => s.name).join('、')}。`
      : `感知${label}区域：该区域没有人。`,
  );
  continueKillerQueue(state);
}

/** 杀手牌移动：点相邻一格（可以往回走）。点自己的格子等于停下来 */
export function completeKillerCardMove(state: GameState, toRoomId: string): boolean {
  const k = killerActor(state);
  if (!k) throw new Error('没有杀手');
  const max = state.pendingMoveRange;
  if (max == null) throw new Error('没有待确认的移动');
  const min = state.pendingMoveMin ?? 0;
  if (!k.roomId) throw new Error('不在地图上');
  if (toRoomId === k.roomId) {
    finishKillerCardMove(state);
    return true;
  }
  const adj = killerAdjacentRooms(state, k.id);
  if (!adj.includes(toRoomId)) throw new Error('只能移动到相邻地点（可以沿原路移回）');
  const taken = Math.max(0, state.lastMovePath.length - 1);
  if (taken >= max) throw new Error('步数已用完');
  const pathSoFar = state.lastMovePath.length ? [...state.lastMovePath] : [k.roomId];
  const crossedBefore = state.lastMoveCrossedBlockade;
  const ok = tryMove(state, k.id, toRoomId, 1, 1);
  if (!ok) throw new Error('非法移动');
  state.lastMovePath = [...pathSoFar, toRoomId];
  state.lastMoveCrossedBlockade = crossedBefore || state.lastMoveCrossedBlockade;
  const nowTaken = Math.max(0, state.lastMovePath.length - 1);
  if (nowTaken >= max) {
    state.pendingMoveRange = null;
    state.pendingMoveMin = 0;
    continueKillerQueue(state);
    return true;
  }
  log(
    state,
    nowTaken >= min
      ? `已移动 ${nowTaken} 步，还可移动 ${max - nowTaken} 步（可以沿原路移回，也可结束移动）。`
      : `已移动 ${nowTaken} 步，至少还要移动 ${min - nowTaken} 步（可以沿原路移回）。`,
  );
  return false;
}

/** 呼啸而过：确认路径后一次走完，再结算路径惊吓 */
export function confirmPathDraft(state: GameState): void {
  const draft = state.pendingPathDraft;
  if (!draft) throw new Error('当前没有待确认的路径');
  const taken = Math.max(0, draft.rooms.length - 1);
  if (taken < draft.min) throw new Error(`至少选择 ${draft.min} 步`);
  if (taken > draft.max) throw new Error(`最多 ${draft.max} 步`);
  const k = killerActor(state);
  if (!k) throw new Error('没有杀手');
  /** 玩家确认的路线就是牌面移动的「实际路径」。
   *  注意 tryMove 每次都会把 lastMovePath 覆盖成它自己算出的那一步路径，
   *  所以逐格走完以后必须还原成玩家选的这条，否则「呼啸而过」的路径惊吓会打错格子。 */
  const walked = draft.rooms.length ? [...draft.rooms] : k.roomId ? [k.roomId] : [];
  let crossed = false;
  for (let i = 1; i < draft.rooms.length; i++) {
    const ok = tryMove(state, k.id, draft.rooms[i]!, 1, 1);
    if (!ok) throw new Error('路径不合法');
    crossed = crossed || state.lastMoveCrossedBlockade;
  }
  state.lastMovePath = walked;
  state.lastMoveCrossedBlockade = crossed;
  if (draft.rooms.length <= 1 && k.roomId) {
    state.lastMovePath = [k.roomId];
    log(state, `${k.name} 留在「${roomName(state, k.roomId)}」。`);
  }
  state.pendingPathDraft = null;
  continueKillerQueue(state);
}

/** 结束这次牌上的移动，继续后面的惊吓/搜索 */
export function finishKillerCardMove(state: GameState): void {
  const max = state.pendingMoveRange;
  if (max == null) throw new Error('没有待确认的移动');
  const min = state.pendingMoveMin ?? 0;
  const taken = Math.max(0, state.lastMovePath.length - 1);
  if (taken < min) throw new Error(`至少移动 ${min} 步`);
  const k = killerActor(state);
  if (taken === 0 && k?.roomId) {
    state.lastMovePath = [k.roomId];
    state.lastMoveCrossedBlockade = false;
    log(state, `${k.name} 留在「${roomName(state, k.roomId)}」。`);
  }
  state.pendingMoveRange = null;
  state.pendingMoveMin = 0;
  continueKillerQueue(state);
}

/** 潜行回合开始：公开所在格，按牌面惊吓/点名，再强制搜一次 */
export function forcedRevealAndSearch(state: GameState): boolean {
  const k = killerActor(state);
  if (!k?.stealth) return false;
  setStealth(k, false);
  log(state, `${k.name} 在${roomName(state, k.roomId)}重现！`);
  const kind = state.stealthRevealKind;
  state.stealthRevealKind = null;
  if (kind === 'vanishScare' && k.roomId) {
    fearAtRange(state, k.roomId, 1);
  } else if (kind === 'bloomKill' && k.roomId) {
    const hits = Object.values(state.players).filter((s) => {
      if (s.faction !== 'survivor' || !s.alive || !s.roomId) return false;
      const d = mapDist(state, k.roomId!, s.roomId, false);
      return d >= 0 && d <= 1;
    });
    for (const s of hits) {
      applyDamage(state, s.id, 99, k.id, { eliminate: true, skipAmulet: true });
    }
    if (hits.length) log(state, `死亡盛放消灭了：${hits.map((s) => s.name).join('、')}。`);
    else log(state, '死亡盛放：没有人受到影响。');
  } else if (kind === 'lurkPick') {
    state.pendingLurkPick = true;
    log(state, '潜藏威胁：请选择任意 1 名幸存者施加惊吓。');
    return true;
  }
  forcedSearchHere(state);
  return Boolean(state.encounter);
}

/** 潜藏威胁重现：杀手点名惊吓哪一名幸存者 */
export function finishLurkPick(state: GameState, targetId: string): void {
  if (!state.pendingLurkPick) throw new Error('当前不是选择惊吓目标');
  const t = state.players[targetId];
  if (!t?.alive || t.faction !== 'survivor') throw new Error('目标无效');
  state.pendingLurkPick = false;
  addFear(state, t.id, 1);
  log(state, `潜藏威胁惊吓了 ${t.name}。`);
  forcedSearchHere(state);
}

/** 不占行动的搜查：这格有人就把 lastSearchFound 设为 true */
export function forcedSearchHere(state: GameState): void {
  const k = killerActor(state);
  if (!k?.roomId || state.phase === 'gameOver') return;
  const victims = Object.values(state.players).filter(
    (x) => x.faction === 'survivor' && x.alive && x.roomId === k.roomId,
  );
  state.lastSearchFound = victims.length > 0;
  log(
    state,
    victims.length
      ? `${k.name} 重现后搜索房间，发现了 ${victims.map((v) => v.name).join('、')}！`
      : `${k.name} 重现后搜索房间，没有发现人。`,
  );
}

/** 幸存者决定这次非遭遇伤害要不要出示古代护符 */
export function confirmAmuletUse(state: GameState, use: boolean): void {
  const pending = state.pendingAmulet;
  if (!pending) throw new Error('当前没有护符选择');
  const p = state.players[pending.playerId];
  state.pendingAmulet = null;
  if (!p) {
    continueKillerQueue(state);
    return;
  }
  if (use && (p.items.amulet ?? 0) > 0) {
    p.items.amulet = (p.items.amulet ?? 1) - 1;
    if (p.items.amulet <= 0) delete p.items.amulet;
    discardConsumedItem(state, 'amulet', 1);
    log(state, `${p.name} 出示古代护符，防止了这次伤害（护符进入弃牌堆）。`);
  } else {
    applyDamage(state, pending.playerId, pending.amount, pending.sourceId, { skipAmulet: true });
  }
  continueKillerQueue(state);
  maybePromptOverFearWound(state);
  if (state.encounterOpenHold) finishEncounterOpen(state);
}

/** 是不是谋杀者的“尾随”（遭遇里加攻，慢速阶段潜行） */
export function isTailCard(card: CardDef | undefined): boolean {
  return Boolean(card && /^murder_tail_/.test(card.id));
}

/** 遭遇中可打出加攻的牌，以及这次加攻的数值（永久力量不加在这里） */
export function encounterCardAttackBonus(card: CardDef | undefined): number {
  if (!card) return 0;
  if (isTailCard(card)) return 1;
  let n = 0;
  for (const fx of card.effects) {
    if (fx.op === 'attackValue' && typeof fx.value === 'number') n += fx.value;
  }
  if (n > 0) return n;
  const m = /本次攻击\s*\+(\d+)/.exec(card.text ?? '');
  return m ? Number(m[1]) : 0;
}