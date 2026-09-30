/**
 * 雕像杀手（killer6）专用规则。
 *
 * 核心概念：
 *  - 4 个雕像棋子同时在场上，各有各的位置；立绘 1、2 在主要出口，3、4 在隐藏出口。
 *  - `state.killerId` 指向**主雕像**（手牌/力量/等级都挂在它那条上）。
 *  - 只有主雕像能在一般行动里移动/搜索；所有雕像都算「杀手」（同格即遇敌 / 不能搜修）。
 *  - 卡牌 scope：'all' = 所有雕像，'main' = 只有主雕像。
 *  - 雕像被幸存者「停滞」后，本大回合不能移动/搜索。
 *
 * 这个模块只负责「雕像牌怎么结算」；棋子本身在 engine.ts 里建。
 */
import type { EffectDef } from '../content/schema.js';
import type { GameState, PlayerState } from './types.js';
import { addFear, applyDamage, drawKillerCards, log, roomName } from './effects.js';
import { isStatueKiller, mainStatue, statuePieces, switchMainStatue } from './engine.js';

export { isStatueKiller, mainStatue, statuePieces, switchMainStatue };

/** 被停滞的雕像本大回合不能动 */
function canAct(p: PlayerState): boolean {
  return p.alive && !p.statueHalted;
}

/** 这次效果作用哪些雕像 */
export function statueTargets(state: GameState, scope: string | undefined): PlayerState[] {
  if (scope === 'main') {
    const m = mainStatue(state);
    return m ? [m] : [];
  }
  return statuePieces(state);
}

// —— 依次移动 / 依次搜索 ——

/** 队列里还有没有雕像没处理 */
export function statueBusy(state: GameState): boolean {
  return (
    Boolean(state.pendingStatueStepId) ||
    (state.pendingStatueMoveQueue?.length ?? 0) > 0 ||
    (state.pendingStatueSearchQueue?.length ?? 0) > 0
  );
}

/**
 * 「选雕像」的候选：**能动的、且这一次还没选过的**。
 *
 * ⚠ 用户要求：被停滞的、已经选过的**直接不出现在选项里**（不是显示出来再禁用）。
 */
export function statuePickOptions(state: GameState): PlayerState[] {
  const pick = state.pendingStatuePick;
  if (!pick) return [];
  return statuePieces(state).filter((p) => canAct(p) && !pick.done.includes(p.id));
}

/**
 * 让某一尊开始走：挂上路径草稿（和以前 `advanceStatueMove` 里那段一样）。
 * 走完由 `finishStatueStep` 重新把"选下一尊"露出来。
 */
function startStatueStep(
  state: GameState,
  piece: PlayerState,
  max: number,
  min: number,
): boolean {
  if (state.pendingStatuePick) state.pendingStatuePick.active = piece.id;
  state.pendingStatueStepId = piece.id;
  state.pendingPathDraft = {
    min,
    max,
    rooms: piece.roomId ? [piece.roomId] : [],
  };
  log(
    state,
    `雕像 ${piece.statueIndex}「${roomName(state, piece.roomId)}」：请点相邻地点规划路径（${min}–${max} 步）` +
      `${state.pendingStatuePick ? '，确认后可以再选下一尊' : ''}。`,
    'killer',
  );
  return true;
}

/**
 * 一次效果里**还有没有**没选过的、能动的雕像。
 * 有 → 把"选下一尊"重新露出来（返回 true）；没有 → 收掉待选（返回 false）。
 */
function statueStepsRemain(state: GameState): boolean {
  const pick = state.pendingStatuePick;
  if (!pick) return false;
  pick.active = null;
  const left = statuePickOptions(state);
  if (!left.length) {
    state.pendingStatuePick = null;
    return false;
  }
  log(
    state,
    `请选择下一尊要${pick.kind === 'move' ? '移动' : '搜索'}的雕像（还剩 ${left.length} 尊可选）。`,
    'killer',
  );
  return true;
}

/**
 * 一尊雕像搜自己所在地点，命中就返回那个房间 id（遭遇开始，其余雕像作废）。
 * 战报不写"哪尊是主雕像"，所以对幸存者也只说「雕像 N」。
 */
function statueSearchOne(state: GameState, piece: PlayerState): string | null {
  if (!piece.roomId) return null;
  const here = Object.values(state.players).filter(
    (s) => s.faction === 'survivor' && s.alive && s.roomId === piece.roomId,
  );
  if (here.length) {
    state.pendingStatuePick = null;
    log(
      state,
      `雕像 ${piece.statueIndex} 在「${roomName(state, piece.roomId)}」搜到了 ${here.map((s) => s.name).join('、')}，遭遇开始（其余雕像的行动作废）。`,
    );
    return piece.roomId;
  }
  log(state, `雕像 ${piece.statueIndex} 搜索「${roomName(state, piece.roomId)}」：没有人。`, 'killer');
  return null;
}

/**
 * **开始「雕像移动」**（巡邏 / 圍困 / 釋放）。
 *
 * ⚠ 用户要求：**顺序由杀手自己选**（移动段和搜索段各选各的）——
 * 所以不再一次性建队列，而是挂一个"选下一尊"的待选。
 * 只有**一尊能动**时（比如釋放只动主雕像）直接进入移动，不让玩家白点一下。
 *
 * @returns true = 已停下来等玩家（选雕像 或 点路径）
 */
export function beginStatueMove(
  state: GameState,
  scope: string | undefined,
  max: number,
  min: number,
): boolean {
  const list = statueTargets(state, scope).filter(canAct);
  if (!list.length) {
    log(state, '没有可以行动的雕像（都被停滞了），跳过。', 'killer');
    return false;
  }
  state.pendingStatueMoveMax = max;
  state.pendingStatueMoveMin = min;
  if (list.length === 1) return startStatueStep(state, list[0]!, max, min);
  state.pendingStatuePick = {
    kind: 'move',
    max,
    min,
    done: [],
    active: null,
    scope: scope ?? 'all',
  };
  log(state, `请选择这一尊要移动的雕像（${list.length} 尊可选；被停滞的不能选）。`, 'killer');
  return true;
}

/**
 * **杀手点了一尊雕像**（「巡邏 / 圍困」的选雕像阶段）。
 *
 * 移动段：把它设成正在走的那尊（走现有路径草稿流程）。
 * 搜索段：**立刻**结算它所在地点的搜索。
 *
 * @returns 需要开遭遇的房间 id（没有就 null）
 */
export function pickStatueStep(state: GameState, statueId: string): string | null {
  const pick = state.pendingStatuePick;
  if (!pick || pick.active) throw new Error('当前不是选择雕像的时候');
  const st = state.players[statueId];
  if (!st || st.statueIndex == null) throw new Error('不是有效的雕像');
  /** 选项里本来就不该出现它们，这里再兜一道（防手改请求） */
  if (!canAct(st)) throw new Error('这尊雕像被停滞了，本大回合不能行动');
  if (pick.done.includes(st.id)) throw new Error('这尊雕像这次已经行动过了');
  pick.done.push(st.id);
  if (pick.kind === 'move') {
    startStatueStep(state, st, pick.max, pick.min);
    return null;
  }
  return statueSearchOne(state, st);
}

/**
 * 一尊雕像动完（toRoomId = null 表示留在原地）。
 * @returns true = 还要继续等玩家（去选下一尊）
 */
export function finishStatueStep(state: GameState, toRoomId: string | null): boolean {
  const id = state.pendingStatueStepId;
  const p = id ? state.players[id] : null;
  if (p) {
    /**
     * 雕像移动要**报给双方**（用户要求：
     * 「幸存者战报中，雕像的移动和搜索要写明是哪个雕像和所在地点（雕像1：R1）」）：
     *  - 幸存者看得到「雕像几」**走到哪**（立绘在地图上本来就看得见，
     *    所以地点不是秘密）；但**不说哪尊是主雕像**；
     *  - 杀手看得到完整的去向。
     */
    if (toRoomId) {
      p.roomId = toRoomId;
      log(state, `雕像 ${p.statueIndex}：移动到「${roomName(state, toRoomId)}」。`, 'survivor');
      log(state, `雕像 ${p.statueIndex} 移动到「${roomName(state, toRoomId)}」。`, 'killer');
    } else {
      log(state, `雕像 ${p.statueIndex}：留在「${roomName(state, p.roomId)}」。`, 'survivor');
      log(state, `雕像 ${p.statueIndex} 留在「${roomName(state, p.roomId)}」。`, 'killer');
    }
  }
  state.pendingStatueStepId = null;
  state.pendingPathDraft = null;
  /**
   * ⚠ **不再自动轮到下一尊** —— 顺序由杀手自己选：
   * 走完一尊就把"选下一尊"重新露出来（它已经进了 `done`，不会重复出现）。
   * 如果这批雕像都在这一轮选完了，返回 false，由上层接着走收尾（搜索段 / 下一个效果）。
   */
  return statueStepsRemain(state);
}

/**
 * 圍困第 2 段：所有雕像**以任意顺序**搜索 —— 顺序同样由杀手自己选
 * （和移动段**各选各的**，所以 `done` 是新的）。
 *
 * ⚠ 只有一尊能动时直接搜，不让玩家白点一下。
 * @returns true = 已挂起等杀手选 / 已命中（停下来）
 */
export function beginStatueSearch(state: GameState): boolean {
  const list = statueTargets(state, 'all').filter(canAct);
  if (!list.length) {
    log(state, '圍困：没有可以搜索的雕像（都被停滞了）。', 'killer');
    return false;
  }
  if (list.length === 1) {
    const room = statueSearchOne(state, list[0]!);
    if (room) {
      state.statueSearchHitRoomId = room;
      return true;
    }
    return false;
  }
  state.pendingStatuePick = {
    kind: 'search',
    max: 0,
    min: 0,
    done: [],
    active: null,
    scope: 'all',
  };
  log(state, `圍困：请选择这一尊要搜索的雕像（${list.length} 尊可选；被停滞的不能选）。`, 'killer');
  return true;
}

// —— 各张牌 ——

/** 巡邏：抽 1 张牌，所有雕像移动 0-1 */
export function resolvePatrol(state: GameState, fx: EffectDef): boolean {
  drawKillerCards(state, 1);
  const max = typeof fx.value === 'number' ? fx.value : 1;
  const min = typeof fx.min === 'number' ? fx.min : 0;
  return beginStatueMove(state, fx.scope ?? 'all', max, min);
}

/**
 * 重整旗鼓：抽 1 张牌。
 * 二效果写的是「可以」—— 所以切换主雕像可选；
 * 但**一旦切换**就一定要移动一个封堵（没有封堵则跳过）。
 */
export function resolveRally(state: GameState): boolean {
  drawKillerCards(state, 1);
  state.pendingStatueRally = true;
  state.pendingStatueRallySwitched = false;
  const hasBlockade = (state.blockades ?? []).length > 0;
  log(
    state,
    hasBlockade
      ? '重整旗鼓：你可以切换主雕像（在行动区选一尊后确认）。一旦切换，就必须把一个封堵标记移到另一扇没被封堵的门。'
      : '重整旗鼓：你可以切换主雕像（在行动区选一尊后确认）。场上没有封堵，移动封堵那步跳过。',
    'killer',
  );
  return true;
}

/** 處決：力量高出目标防御 3 点或更多 → 消灭目标 */
export function resolveExecute(state: GameState): void {
  const k = mainStatue(state);
  const targetId = state.encounter?.targetId;
  const sourceId = k?.id ?? state.killerId;
  if (!sourceId) return;
  if (!targetId) {
    log(state, '處決：当前没有遭遇目标，本牌没有效果。', 'killer');
    return;
  }
  const t = state.players[targetId];
  if (!t || !t.alive) {
    log(state, '處決：目标已不在场。', 'killer');
    return;
  }
  const atk = state.killerPower + (state.killerTurnPowerBonus ?? 0);
  /**
   * 目标的「防御」是遭遇防御阶段掷骰 + 物品得出的。
   * 本牌在遭遇中打出，此时还没掷防御骰 —— 所以这里按「目标当前防御加成 0」判定，
   * 即力量 ≥ 3 就消灭。等确认规则后再细化。
   */
  const def = 0;
  if (atk >= def + 3) {
    applyDamage(state, t.id, 99, sourceId, { eliminate: true });
    log(state, `處決：力量 ${atk} 高出 ${t.name} 的防御 ${def} 达 3 点以上，消灭目标。`);
  } else {
    log(state, `處決：力量 ${atk} 未高出防御 ${def} 达 3 点，本牌没有效果。`, 'killer');
  }
}

/** 釋放：惊吓主雕像颜色区域的幸存者；主雕像移动 0-2 后搜索 */
export function resolveRelease(state: GameState): boolean {
  const m = mainStatue(state);
  if (!m) return false;
  if (m.roomId) {
    const zone = colorPrefixRoomsFor(state, m.roomId);
    const names: string[] = [];
    for (const s of Object.values(state.players)) {
      if (s.faction !== 'survivor' || !s.alive || !s.roomId) continue;
      if (!zone.includes(s.roomId)) continue;
      addFear(state, s.id, 1);
      names.push(s.name);
    }
    log(
      state,
      names.length
        ? `釋放：主雕像颜色区域内的 ${names.join('、')} 受到惊吓。`
        : '釋放：主雕像颜色区域内没有幸存者。',
      'killer',
    );
  }
  // 移动 0-2（只主雕像），之后由 finishStatueStep 的收尾去搜索
  state.statueReleaseSearchesAfter = true;
  return beginStatueMove(state, 'main', 2, 0);
}

/**
 * 召唤石碑：**等杀手点任意一扇门**。
 *
 * 门的表示方式是"两个相邻地点"，所以走**两段式**（和进化 4 级那套一致）：
 * 先点一个地点、再点一个与它相邻的地点 = 选中那扇门，然后确认。
 *
 * ⚠ 以前这里只设了 `pendingStatueSeal = true` 就完事 ——
 * **没有任何地方消费它**，所以玩家点完牌就直接结束了（用户报的"没有选择封堵的流程"）。
 */
export function resolveSummonSeal(state: GameState): boolean {
  state.pendingStatueSeal = true;
  state.pendingStatueSealFrom = null;
  log(
    state,
    '召唤石碑：请点任意一扇门来封堵（先点一个地点，再点与它相邻的地点选定那扇门）。封上后该地点的幸存者会被惊吓。',
    'killer',
  );
  return true;
}

/** 圍困：所有雕像移动 0-2 → 所有雕像依次搜索 */
export function resolveSiege(state: GameState): boolean {
  state.statueSiegeSearchesAfter = true;
  return beginStatueMove(state, 'all', 2, 0);
}

/**
 * 所有雕像移动都做完后的收尾：
 *  - 釋放：主雕像搜索自己所在地点
 *  - 圍困：所有雕像依次搜索
 * @returns 需要开遭遇的房间 id；没有就返回 null
 */
export function afterStatueMoves(state: GameState): string | null {
  if (state.statueReleaseSearchesAfter) {
    state.statueReleaseSearchesAfter = false;
    const m = mainStatue(state);
    if (m?.roomId) {
      const hit = Object.values(state.players).some(
        (s) => s.faction === 'survivor' && s.alive && s.roomId === m.roomId,
      );
      state.lastSearchFound = hit;
      log(
        state,
        hit
          ? `釋放：主雕像在「${roomName(state, m.roomId)}」搜到了人。`
          : '釋放：主雕像搜索所在地点，没有人。',
        'killer',
      );
      if (hit) return m.roomId;
    }
    return null;
  }
  if (state.statueSiegeSearchesAfter) {
    state.statueSiegeSearchesAfter = false;
    state.statueSearchHitRoomId = null;
    beginStatueSearch(state);
    const room = state.statueSearchHitRoomId ?? null;
    state.statueSearchHitRoomId = null;
    if (room) state.lastSearchFound = true;
    return room;
  }
  return null;
}

/** 主雕像所在格的「颜色区域」：按房间 id 前缀 R/B/G 归类 */
function colorPrefixRoomsFor(state: GameState, roomId: string): string[] {
  const room = state.map.rooms.find((r) => r.id === roomId);
  const prefix = (room?.id ?? '').match(/^[RBG]/i)?.[0]?.toUpperCase();
  if (!prefix) return roomId ? [roomId] : [];
  return state.map.rooms
    .filter((r) => r.id.toUpperCase().startsWith(prefix))
    .map((r) => r.id);
}

// 雕像流程用的额外状态（挂在 GameState 上）
declare module './types.js' {
  interface GameState {
    /** 重整旗鼓进行中 */
    pendingStatueRally?: boolean;
    /** 重整旗鼓里是否已经切换过主雕像（切换过就必须移封堵） */
    pendingStatueRallySwitched?: boolean;
    /** 召唤石碑：等杀手点一扇门 */
    pendingStatueSeal?: boolean;
    /** 召唤石碑：两段式选门时已点的第一个地点 */
    pendingStatueSealFrom?: string | null;
    /** 釋放：移动完成后要搜索主雕像所在地 */
    statueReleaseSearchesAfter?: boolean;
    /** 圍困：移动完成后要依次搜索 */
    statueSiegeSearchesAfter?: boolean;
    /** 圍困搜索命中时记下房间，交给遭遇流程 */
    statueSearchHitRoomId?: string | null;
    /** 雕像搜索命中、等待开遭遇的房间 */
    statueEncounterRoom?: string | null;
  }
}
