/**
 * 女王（killer9）的**僵尸**机制。
 *
 * 规则要点（来自扩展书）：
 *  - 僵尸是女王的僕從，**不算杀手棋子**，但能透过女王的能力/技能卡
 *    做「移動」或「搜索」。
 *  - **一个僵尸的战力 = 女王的力量**（动态）。
 *  - 遭遇总攻击力只按**遭遇地点里**的女王和僵尸算：
 *    女王本体在这个地点才算她的力量；僵尸各按女王力量计。
 *  - 一个地点上可以有多个僵尸。
 *  - 地图上最多同时存在 **6 个**僵尸；已经有 6 个时「生成丧屍」的效果**被取消**。
 *  - 僵尸**不会阻止**幸存者搜索或修理。
 *  - 女王移动时，可以把**同一地点任意数量**的僵尸一起移到目的地。
 *  - 3 个立绘轮流复用。
 *
 * 僵尸不是 `state.players` 里的棋子（那样会污染杀手/幸存者逻辑），
 * 而是独立数组 `state.zombies`。
 */
import type { GameState, PlayerState } from './types.js';
import { effectiveKillerPower, killerKindOf } from './evolution.js';
import {
  doorId,
  isDoorBlocked,
  log,
  mapDist,
  removeBlockade,
  roomName,
  roomsAdjacentKiller,
} from './effects.js';

/** 地图上最多同时存在几个僵尸 */
export const ZOMBIE_MAX = 6;
/** 僵尸立绘张数（3 张轮流复用） */
export const ZOMBIE_ART_COUNT = 3;

/** 这个杀手是不是女王 */
export function isQueenKiller(state: GameState): boolean {
  return killerKindOf(state) === 'queen';
}

/** 女王棋子 */
function queen(state: GameState): PlayerState | null {
  return state.killerId ? state.players[state.killerId] ?? null : null;
}

/**
 * **一个僵尸的战力 = 女王的力量**（动态，随女王力量变化）。
 *
 * ⚠ 别改成固定值：用户明确「僵尸力量**总是等于**女王力量」。
 * （举例里的"一个僵尸战力 2 / 两个僵尸 4"是因为女王 1 级时力量正好是 2。）
 *
 * 而**总力量**的算法是另一回事（见 `engine.rollEncounterDefense`）：
 * 只按**遭遇地点里**的女王和僵尸算 —— 女王本体不在那个地点就不算她的力量，
 * 但僵尸仍各按女王力量计。
 */
export function zombiePower(state: GameState): number {
  /** 每个僵尸各自一份，和女王力量相同，同样不能超过上限 */
  return effectiveKillerPower(state);
}

/** 地图上的僵尸总数 */
export function zombieCount(state: GameState): number {
  return (state.zombies ?? []).length;
}

/** 某个地点有几个僵尸 */
export function zombiesIn(state: GameState, roomId: string): GameState['zombies'] {
  return (state.zombies ?? []).filter((z) => z.roomId === roomId);
}

/**
 * 在某地点生成一个僵尸。
 * - 女王不在场 / 不是女王 → 不生成
 * - 已经有 6 个 → **效果被取消**（规则原文）
 * 返回新僵尸 id；没生成返回 null。
 */
export function spawnZombieAt(state: GameState, roomId: string): string | null {
  if (!isQueenKiller(state)) return null;
  if (!state.zombies) state.zombies = [];
  if (state.zombies.length >= ZOMBIE_MAX) {
    log(state, `地图上已经有 ${ZOMBIE_MAX} 个僵尸，本次生成被取消。`, 'all', true);
    return null;
  }
  if (!state.nextZombieArt || state.nextZombieArt < 1 || state.nextZombieArt > ZOMBIE_ART_COUNT) {
    state.nextZombieArt = 1;
  }
  const art = state.nextZombieArt;
  /** 3 张立绘轮流复用 */
  state.nextZombieArt = art >= ZOMBIE_ART_COUNT ? 1 : art + 1;
  const id = `zombie_${art}_${state.zombies.length}_${Math.random().toString(36).slice(2, 7)}`;
  state.zombies.push({ id, roomId, art });
  log(state, `在「${roomName(state, roomId)}」生成 1 个僵尸（现有 ${state.zombies.length}/${ZOMBIE_MAX} 个）。`, 'all', true);
  return id;
}

/**
 * 移除一个僵尸（献祭 / 被十字弩消灭）。
 * `quiet`：调用方自己写战报（十字弩只报「哪里的僵尸被消灭」，不另写一条「移除了」）。
 */
export function removeZombie(state: GameState, zombieId: string, quiet = false): boolean {
  const i = (state.zombies ?? []).findIndex((z) => z.id === zombieId);
  if (i < 0) return false;
  const [z] = state.zombies.splice(i, 1);
  if (!quiet) {
    log(state, `移除了「${roomName(state, z!.roomId)}」的一个僵尸（剩余 ${state.zombies.length} 个）。`, 'all', true);
  }
  return true;
}

/**
 * 僵尸/女王移动时**移去路过的封堵**。
 *
 * 规则：「僵尸移动通过封堵时会移去封堵」—— 和杀手自己走过去一样。
 * 这里按**最短路径**算出经过哪些门，把其中被封堵的去掉。
 * 找不到路径（或本来就同格）就什么都不做。
 */
/** 沿给定路线拆掉走过的封堵（僵尸实际走的那几格，不另算一条最短路）。 */
export function clearBlockadesOnRoute(state: GameState, rooms: string[]): string[] {
  const cleared: string[] = [];
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    if (!a || !b || a === b) continue;
    const door = doorId(a, b);
    if (!isDoorBlocked(state, door)) continue;
    removeBlockade(state, door);
    cleared.push(door);
  }
  if (cleared.length) {
    log(
      state,
      `僵尸经过封堵（${cleared.map((d) => d.split('|').map((r) => roomName(state, r)).join('–')).join('、')}），封堵被移去。`,
      'all',
      true,
    );
  }
  return cleared;
}

export function clearBlockadesAlongPath(state: GameState, fromRoomId: string, toRoomId: string): string[] {
  if (!fromRoomId || !toRoomId || fromRoomId === toRoomId) return [];
  const path = shortestZombiePath(state, fromRoomId, toRoomId);
  if (!path || path.length < 2) return [];
  return clearBlockadesOnRoute(state, path);
}

/** 僵尸走路用的最短路径（可用杀手密道，封堵不挡路） */
function shortestZombiePath(state: GameState, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const n of roomsAdjacentKiller(state, cur)) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      q.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const out: string[] = [to];
  let w = prev.get(to) ?? null;
  while (w) {
    out.unshift(w);
    w = prev.get(w) ?? null;
  }
  return out;
}

/**
 * 〔屍群來了〕能落到的格子：从出发地走 **1** 格。
 * 和僵尸走路同一套相邻（杀手密道算 1 格，封堵不挡路）。
 */
export function hordeStepRooms(state: GameState, fromRoomId: string): string[] {
  if (!fromRoomId) return [];
  return roomsAdjacentKiller(state, fromRoomId);
}

/** 把一个僵尸移到相邻/任意地点（**经过封堵会移去封堵**） */
export function moveZombie(state: GameState, zombieId: string, toRoomId: string): boolean {
  const z = (state.zombies ?? []).find((x) => x.id === zombieId);
  if (!z) return false;
  clearBlockadesAlongPath(state, z.roomId, toRoomId);
  z.roomId = toRoomId;
  return true;
}

/**
 * 生成僵尸的「位置」由**女王当前地点**决定（召喚亡者 / 等级 1 / 等级 4）。
 */
export function spawnZombieAtQueen(state: GameState): string | null {
  const q = queen(state);
  if (!q?.roomId) return null;
  return spawnZombieAt(state, q.roomId);
}

/**
 * 〔屍群來了〕：**出发地点**中的所有僵尸朝同一个目的地〔移動〕×N。
 *
 * - 只能选**有僵尸的地点**作为出发地（由调用方校验）。
 * - 僵尸按路径一步步走，**经过封堵会移去封堵**。
 * - 目的地**不需要与出发地相邻**（牌面写的是"朝同一个目的地"），
 *   但**这一群只走 N 格**（用户口径：「女王的尸群来了只能移动一格」）——
 *   目的地很远时是"朝那个方向走 1 格"，不是直接飞过去。
 * - 路线用 `shortestZombiePath`：**杀手密道（`pathType:'killer'` 的边）算 1 格**
 *   （用户口径：「小屋的杀手密道应该是算在内」）。
 */
export function hordeMove(state: GameState, fromRoomId: string, toRoomId: string, steps: number): number {
  const list = zombiesIn(state, fromRoomId);
  if (!list.length) {
    log(state, `屍群來了：「${roomName(state, fromRoomId)}」没有僵尸。`, 'killer');
    return 0;
  }
  /** 先确认目的地可达；不可达就不要动僵尸 */
  const path = shortestZombiePath(state, fromRoomId, toRoomId);
  if (!path) {
    log(state, `屍群來了：从「${roomName(state, fromRoomId)}」到不了「${roomName(state, toRoomId)}」。`, 'killer');
    return 0;
  }
  /**
   * ⚠ **只走 `steps` 格**（以前是直接 `roomId = toRoomId`，一步跨好几个房间 ——
   * 战报却写着「移動×1」，自相矛盾）。
   */
  const walk = Math.max(0, Math.min(Math.trunc(steps), path.length - 1));
  const dest = path[walk] ?? fromRoomId;
  /** 经过的封堵先移去（一群僵尸一起走，只需要结算一次）—— 只算**这 N 格**走过的 */
  if (walk > 0 && dest !== fromRoomId)
    clearBlockadesAlongPath(state, fromRoomId, dest);
  for (const z of list) z.roomId = dest;
  const n = list.length;
  const route = path.map((id) => roomName(state, id)).join(' → ');
  const left = path.length - 1 - walk;
  log(
    state,
    `屍群來了：「${roomName(state, fromRoomId)}」的 ${n} 个僵尸朝「${roomName(state, toRoomId)}」移動×${walk}` +
      `（走到「${roomName(state, dest)}」${left > 0 ? `，还差 ${left} 格` : '，已到目的地'}；路线：${route}）。`,
    'all',
    true,
  );
  return n;
}

/**
 * 〔屍體爆炸〕：献祭 1 个僵尸，并使**距离 1 内**的所有幸存者〔中毒〕。
 */
export function sacrificeZombieForPoison(
  state: GameState,
  zombieId: string,
  range: number,
  applyPoison: (survivorId: string) => void,
): void {
  const z = (state.zombies ?? []).find((x) => x.id === zombieId);
  if (!z) return;
  const roomId = z.roomId;
  removeZombie(state, zombieId);
  const victims: PlayerState[] = [];
  for (const p of Object.values(state.players)) {
    if (p.faction !== 'survivor' || !p.alive || !p.roomId) continue;
    const d = mapDist(state, roomId, p.roomId, false);
    if (d >= 0 && d <= range) victims.push(p);
  }
  log(
    state,
    `屍體爆炸：献祭「${roomName(state, roomId)}」的 1 个僵尸，距离 ${range} 内的 ${victims.length} 名幸存者〔中毒〕。`,
    'all',
    true,
  );
  for (const v of victims) applyPoison(v.id);
}

// ————————————————————————————————————————————————
// 〔中毒〕
// ————————————————————————————————————————————————

/**
 * 使一名幸存者〔中毒〕（女王特殊能力）：
 *  - 状态栏上**没有**中毒标记 → 放一个中毒标记
 *  - **已经有**中毒标记 → 目标**受到伤害**（**标记留在身上**）
 *
 * 中毒标记**只会**因为两种原因离开：
 *  1. 被〔治愈〕效果治疗（见 `clearPoisonOnHeal`）
 *  2. 该幸存者倒下（见 `clearPoisonOnDeath`）
 *
 * 返回 true 表示这次是「造成伤害」而不是「放标记」。
 */
export function poisonSurvivor(
  state: GameState,
  survivorId: string,
  applyDamage: (id: string, amount: number) => void,
): boolean {
  if (!state.poisoned) state.poisoned = [];
  const p = state.players[survivorId];
  if (!p || p.faction !== 'survivor' || !p.alive) return false;

  if (state.poisoned.includes(survivorId)) {
    /** 已中毒：**只造成伤害，不移除标记**（扩展书原文） */
    log(state, `${p.name} 再次〔中毒〕：目标受到伤害（中毒标记留在身上）。`, 'all', true);
    applyDamage(survivorId, 1);
    return true;
  }
  state.poisoned.push(survivorId);
  log(state, `${p.name} 〔中毒〕（状态栏放置一个中毒标记）。`, 'all', true);
  return false;
}

/** 某个幸存者是否已中毒 */
export function isPoisoned(state: GameState, survivorId: string): boolean {
  return (state.poisoned ?? []).includes(survivorId);
}

/**
 * 〔治愈〕效果移除中毒标记。
 *
 * 扩展书：「中毒标记会留在幸存者上，除非其被任何〔治愈〕效果所治愈。」
 * 返回是否确实移除了标记。
 */
export function clearPoisonOnHeal(state: GameState, survivorId: string): boolean {
  if (!state.poisoned?.length) return false;
  if (!state.poisoned.includes(survivorId)) return false;
  state.poisoned = state.poisoned.filter((id) => id !== survivorId);
  const p = state.players[survivorId];
  log(state, `${p?.name ?? survivorId} 受到治疗，移除了中毒标记。`, 'all', true);
  return true;
}

/** 幸存者倒下时清掉他的中毒标记 */
export function clearPoisonOnDeath(state: GameState, survivorId: string): void {
  if (!state.poisoned?.length) return;
  const before = state.poisoned.length;
  state.poisoned = state.poisoned.filter((id) => id !== survivorId);
  if (state.poisoned.length !== before) {
    const p = state.players[survivorId];
    log(state, `${p?.name ?? survivorId} 倒下，其中毒标记一并移除。`, 'all', true);
  }
}

// ————————————————————————————————————————————————
// 遭遇战力：女王 + 同地所有僵尸
// ————————————————————————————————————————————————

/**
 * 女王遭遇时的**额外**力量 —— 也就是同地所有僵尸的战力之和。
 * （女王自己的力量由原有的 `effectiveKillerPower` 算，这里只补僵尸那部分。）
 */
export function zombiePowerInRoom(state: GameState, roomId: string): number {
  const n = zombiesIn(state, roomId).length;
  if (!n) return 0;
  return n * zombiePower(state);
}

// ————————————————————————————————————————————————
// 十字弩（幸存者特殊行动）
// ————————————————————————————————————————————————

/** 十字弩能覆盖的地点：使用者所在地点 + 相邻地点 */
export function crossbowRooms(state: GameState, survivorId: string): string[] {
  const p = state.players[survivorId];
  if (!p?.roomId) return [];
  const out = new Set<string>([p.roomId]);
  for (const e of state.map.edges) {
    if (e.pathType === 'killer') continue;
    if (e.from === p.roomId) out.add(e.to);
    else if ((e.bidirectional ?? true) && e.to === p.roomId) out.add(e.from);
  }
  return [...out];
}

/** 十字弩可消灭的僵尸（所在地点 + 相邻地点的全部僵尸） */
export function crossbowTargets(state: GameState, survivorId: string): GameState['zombies'] {
  const rooms = new Set(crossbowRooms(state, survivorId));
  return (state.zombies ?? []).filter((z) => rooms.has(z.roomId));
}
