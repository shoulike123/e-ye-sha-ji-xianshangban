/**
 * 扼杀者（killer8）：**核心标记**的公共逻辑。
 *
 * 单独一个模块是为了**打断循环依赖**：
 *  - `killerSpecials.ts` 需要 `evolution.ts` 的 `killerKindOf`
 *  - 而 `evolution.ts` 的扼杀者进化（2 级放核心标记）又需要放核心标记的函数
 * 两边都从这里导入就不会成环。
 */
import type { GameState } from './types.js';
import { log, roomName } from './effects.js';

/**
 * 这个杀手是不是扼杀者。
 *
 * `killerId` 可选：2v3 有**两名**杀手，要能指定问的是哪一个，
 * 不能一律看 `state.killerId`（那个只是"现在轮到谁"）。
 */
export function isStranglerKiller(state: GameState, killerId?: string | null): boolean {
  const kid = killerId ?? state.killerId;
  const k = kid ? state.players[kid] : null;
  if (!k) return false;
  const ch = state.characters.find((c) => c.id === k.characterId);
  return /killer8|扼杀者|strangler/i.test(`${k.characterId ?? ''} ${ch?.name ?? ''}`);
}

/** 地图上所有「带核心标记的地点」（去重） */
export function coreRooms(state: GameState): string[] {
  return [...new Set(state.coreMarkers ?? [])];
}

/** 地图上核心标记总数（含同一地点叠放） */
export function coreCount(state: GameState): number {
  return (state.coreMarkers ?? []).length;
}

/**
 * 游戏准备：在扼杀者的**起始地点**放置 1 个核心标记（双方都要放）。
 * 另外 4 个备用核心标记放在地图旁。
 */
export function setupCoreMarkers(state: GameState): void {
  state.coreMarkers = [];
  state.coreSetupDone = false;
  if (!isStranglerKiller(state)) return;
  const start = state.map.killerStartRoomId;
  if (start) state.coreMarkers.push(start);
  state.coreSetupDone = true;
  log(
    state,
    `扼杀者准备：在起始地点「${roomName(state, start)}」放置 1 个核心标记（另有 4 个备用）。`,
    'all',
    true,
  );
}

/**
 * 放一个核心标记。
 *
 * 规则：「如果地图上已经有 5 个核心标记，扼杀者**可以**移除 1 个核心标记重新放置」
 * —— 所以达到上限时**由玩家选移除哪一个**（不是自动挑）。
 * 返回 true = 停下来等玩家选要移除哪个；false = 已经放好了。
 */
export function placeCoreAt(state: GameState, roomId: string): boolean {
  if (!state.coreMarkers) state.coreMarkers = [];
  /**
   * ⚠ **同一次升级里，同一个地点只处理一次。**
   *
   * 效果队列在收尾时会把这批效果**重新跑一遍**（实测：
   * 扼杀者 4 级「在任意 2 个地点各放一个」会被跑两次，导致
   *  1. 核心标记被重复放（出现两个 G1）
   *  2. 第二次又撞上 5 个上限 → 又要求玩家「选移除」→ **人卡住**
   * 所以这里记住"这次已经放过哪些地点"，重复调用直接跳过。
   *
   * 用一个短标记（`killerLevel` + 房间号）来判定，升级或换地点后自然失效。
   */
  const key = `corePlaced:${state.killerLevel}:${roomId}`;
  if (state.corePlacedKeys?.includes(key)) return false;
  if (!state.corePlacedKeys) state.corePlacedKeys = [];
  state.corePlacedKeys.push(key);

  /** 还没到 5 个上限：直接放 */
  if (state.coreMarkers.length < 5) {
    state.coreMarkers.push(roomId);
    log(state, `在「${roomName(state, roomId)}」放置了一个核心标记（现有 ${state.coreMarkers.length} 个）。`, 'all', true);
    return false;
  }
  /** 已达上限：请玩家选一个要移除的核心标记，选完再放新的 */
  state.pendingCorePick = 'remove';
  state.pendingCoreRooms = coreRooms(state);
  state.pendingCoreOverflowPlaceAt = roomId;
  log(
    state,
    `核心标记已达 5 个上限：请点一个要移除的核心标记，移除后会在「${roomName(state, roomId)}」放上新的。`,
    'killer',
  );
  return true;
}
