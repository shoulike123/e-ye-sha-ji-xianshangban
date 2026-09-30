/**
 * 女猎手：猎手陷阱。
 *
 * 规则要点：
 *  - 开局杀手在地图 4 个「猎手陷阱位置」各放 1 个陷阱（2 捕网 / 1 白骨 / 1 捕熊）。
 *    位置在幸存者地图上画成问号（双方都看得到标记，但**只有杀手知道是什么陷阱**）。
 *  - **任何时间、因任何原因**从某处进入陷阱所在地点就会触发（**经过也算**）。
 *  - 触发时双方那个位置的标记都移除，战报写明「谁在哪里触发了什么陷阱，（什么效果）」。
 *  - 捕熊：直接伤害。白骨：获得 2 恐惧。捕网：放倒模型，本回合不能离开本地点，
 *    且**直到此轮（幸存者大回合 + 杀手回合）结束才移除**。
 *  - 白骨造成的恐惧溢出按「惊吓过度」流程：一次只发出 1 次响声；恐惧标记最多 2 个。
 */
import type { GameState } from './types.js';
import { log, roomName } from './effects.js';

export type HunterTrapKind = 'bear' | 'bone' | 'net';



/**
 * 这个杀手是不是女猎手。
 * `killerId` 可选：2v3 有两名杀手，要能指定问的是哪一个。
 */
export function isHuntressKiller(state: GameState, killerId?: string | null): boolean {
  const kid = killerId ?? state.killerId;
  const k = kid ? state.players[kid] : null;
  if (!k) return false;
  const ch = state.characters.find((c) => c.id === k.characterId);
  return /killer4|女猎手|huntress/i.test(`${k.characterId ?? ''} ${ch?.name ?? ''}`);
}

/**
 * 这个杀手是不是狼人。
 * `killerId` 可选：2v3 有两名杀手，要能指定问的是哪一个。
 */
export function isWerewolfKiller(state: GameState, killerId?: string | null): boolean {
  const kid = killerId ?? state.killerId;
  const k = kid ? state.players[kid] : null;
  if (!k) return false;
  const ch = state.characters.find((c) => c.id === k.characterId);
  return /killer5|狼人|werewolf/i.test(`${k.characterId ?? ''} ${ch?.name ?? ''}`);
}

/**
 * 【地点分类】女猎手陷阱的布置区域。
 *
 * 规则：**游戏开始时**陷阱只能布在「3 个常规搜索位 + 1 个常规修理位」；
 * **陷阱重置**时不受这个限制（任意地点）。
 *
 * 这些位置**不硬编码**，按地图的房间 tag 归类 —— 以后换地图 / 调地点会自动跟上：
 *  - 常规搜索位 → `tags` 含 `searchable`
 *  - 常规修理位 → `tags` 含 `repairable`
 *  - 特殊位（遗物室）→ `tags` 含 `special-relic`
 *
 * ⚠ **遗物室（墓穴 R6）不是搜索地点**（用户明确要求：
 * 「遗物室不是幸存者搜索地点！获得遗物是一种全新的获得牌的方式，与搜索不同」），
 * 所以它标的是 `special-relic` 而不是 `searchable` ——
 * 幸存者在那里**搜不了物资**，但女猎手**可以**把陷阱布在那儿。
 */
export function regularSearchRooms(state: GameState): string[] {
  return (state.map.rooms ?? [])
    .filter((r) => (r.tags ?? []).includes('searchable'))
    .map((r) => r.id);
}

export function regularRepairRooms(state: GameState): string[] {
  return (state.map.rooms ?? [])
    .filter((r) => (r.tags ?? []).includes('repairable'))
    .map((r) => r.id);
}

/**
 * 只在**女猎手布陷阱**时才算常规位的地点。
 *
 * 遗物室就是这一类：它不是搜索地点，但开局可以往那儿放陷阱
 * （用户要求「在女猎手游戏开始时将它算在布置陷阱的地方里」）。
 */
export const TRAP_EXTRA_TAGS = ['special-relic'];

export function trapExtraRooms(state: GameState): string[] {
  return (state.map.rooms ?? [])
    .filter((r) => TRAP_EXTRA_TAGS.some((t) => (r.tags ?? []).includes(t)))
    .map((r) => r.id);
}

/** 开局允许放陷阱的地点 = 常规搜索位 + 常规修理位 + 遗物室这类特殊位（去重） */
export function regularTrapRooms(state: GameState): string[] {
  return [
    ...new Set([
      ...regularSearchRooms(state),
      ...regularRepairRooms(state),
      ...trapExtraRooms(state),
    ]),
  ];
}

/** 女猎手一共要放几个陷阱（2 捕网 + 1 白骨 + 1 捕熊 = 4） */
export function totalTrapCount(): number {
  return TRAP_COUNT.bear + TRAP_COUNT.bone + TRAP_COUNT.net;
}

/**
 * 开局：准备好放置陷阱的状态，但**位置和类型都由女猎手自己选**。
 *
 * 规则：陷阱放在**哪个地点**是女猎手决定的，
 * 她放好之后，幸存者地图上**那些地点**才出现「?」标记。
 * 4 个陷阱必须放在**4 个不同地点**。
 *
 * **开局布置受区域限制**：只能放在「3 个常规搜索位 + 1 个常规修理位」。
 * 陷阱重置走 `resetHunterTraps`，那边 `restricted: false`，位置任选。
 *
 * ⚠ **常规位不足 4 个时自动放宽限制**。
 * 墓穴地图一开始只有 3 个常规位（遺物室 R6 没标 `searchable`），
 * 于是女猎手永远放不满 4 个陷阱、**整局卡在开局准备**里出不来。
 * 现在改成：位置不够就整张图随便放，并在战报里说明 ——
 * 以后再添新地图也不会因为少标一个 tag 就把对局卡死。
 */
export function setupHunterTraps(state: GameState): void {
  state.hunterTraps = {};
  const allowed = regularTrapRooms(state);
  const need = totalTrapCount();
  const restricted = allowed.length >= need;
  state.pendingTrapPlacement = {
    kind: null,
    placed: {} as Record<string, hunterTrapKind>,
    done: false,
    restricted,
  };
  log(
    state,
    '女猎手：请放置猎手陷阱 —— 2 个捕网陷阱、1 个白骨陷阱、1 个捕熊陷阱。' +
      (restricted
        ? `**开局布置只能放在常规搜索位 / 常规修理位**（${allowed.length} 个可选：` +
          `${allowed.map((id) => roomName(state, id)).join('、')}）。先点类型，再点地图上的地点。`
        : `这张地图的常规位置只有 ${allowed.length} 个、不够放 ${need} 个陷阱，` +
          '所以本次**不受区域限制**，任意地点都可以放。先点类型，再点地图上的地点。'),
    'killer',
  );
}

type hunterTrapKind = 'bear' | 'bone' | 'net';

/** 每种陷阱要放几个 */
export const TRAP_COUNT: Record<hunterTrapKind, number> = {
  bear: 1,
  bone: 1,
  net: 2,
};

export const TRAP_LABEL: Record<hunterTrapKind, string> = {
  bear: '捕熊陷阱',
  bone: '白骨陷阱',
  net: '捕网陷阱',
};

/** 某种陷阱已经放了几个 */
export function trapPlacedCount(state: GameState, kind: hunterTrapKind): number {
  const placed = state.pendingTrapPlacement?.placed ?? {};
  return Object.values(placed).filter((k) => k === kind).length;
}

/**
 * **重置陷阱放置**（用户要求的按钮）：在**最终确认前**，
 * 女猎手可以把已经点好的陷阱全部清掉、重新选一遍。
 *
 * 只清 `pendingPlaced` 里"还没确认"的草稿 —— 已经确认过的正式陷阱
 * （`state.hunterTraps`）不动，因为那时候 `done` 已经是 true、面板也收起来了。
 */
export function resetTrapPlacement(state: GameState): boolean {
  const pp = state.pendingTrapPlacement;
  if (!pp || pp.done) return false;
  const n = Object.keys(pp.placed ?? {}).length;
  pp.placed = {};
  pp.kind = null;
  /**
   * ⚠ **`state.hunterTraps` 也要一起清。**
   *
   * 确认之前，落子状态就写在 `hunterTraps` 里（`placeHunterTrap` 两边同时写），
   * 而 `placeHunterTrap` 会拿它判「这个地点已经有陷阱了」。
   * 只清 `pp.placed` 的话，重置之后原来那些地点既**还挂着陷阱标记**、
   * 又**放不回去**（一点就报"已经有陷阱了"）——
   * 用户要的是"在最终确定前可以重新选一遍"。
   */
  state.hunterTraps = {};
  log(
    state,
    n > 0
      ? `女猎手重置了陷阱放置（清掉刚放的 ${n} 个），请重新选择位置。`
      : '女猎手重置了陷阱放置（本来还没放），请重新选择位置。',
    'killer',
  );
  return true;
}

/** 这种陷阱还差几个没放 */
export function trapRemaining(state: GameState, kind: hunterTrapKind): number {
  return TRAP_COUNT[kind] - trapPlacedCount(state, kind);
}

/** 四种陷阱是不是都放完了 */
export function allTrapsPlaced(state: GameState): boolean {
  return (
    trapRemaining(state, 'bear') === 0 &&
    trapRemaining(state, 'bone') === 0 &&
    trapRemaining(state, 'net') === 0
  );
}

/**
 * 把当前选中的陷阱放到**任意一个地点**上。
 * 再对同一个地点调用 = 取消那里的放置。
 *
 * 位置由女猎手决定 —— 所以只校验「是不是地图上的地点」+「该地点还没放过」，
 * 不再要求它必须是地图上预先标好的固定位置。
 */
export function placeHunterTrap(state: GameState, roomId: string): void {
  const pp = state.pendingTrapPlacement;
  if (!pp || pp.done) throw new Error('当前不是放置陷阱的时间');
  if (!state.map.rooms.some((r) => r.id === roomId))
    throw new Error('未知地点');

  /**
   * **开局布置受区域限制**：只能放在常规搜索位 / 常规修理位。
   * 陷阱重置（`restricted: false`）时不受限制，可以放任意地点。
   * 「取消」不受限制 —— 取消自己刚放的地方永远允许。
   */
  if (pp.restricted === true && !pp.placed[roomId]) {
    const allowed = regularTrapRooms(state);
    if (!allowed.includes(roomId)) {
      throw new Error(
        '开局布置只能放在常规搜索位或常规修理位' +
          `（可选：${allowed.map((id) => roomName(state, id)).join('、')}）`,
      );
    }
  }

  // 再点同一个地点 = 取消
  if (pp.placed[roomId]) {
    const was = pp.placed[roomId]!;
    delete pp.placed[roomId];
    delete state.hunterTraps[roomId];
    log(state, `已取消「${roomName(state, roomId)}」的${TRAP_LABEL[was]}。`, 'killer');
    return;
  }
  const kind = pp.kind;
  if (!kind) throw new Error('请先在行动区选择要放置的陷阱类型');
  if (trapRemaining(state, kind) <= 0) {
    throw new Error(`${TRAP_LABEL[kind]}已经放满了`);
  }
  /**
   * 四个陷阱必须放在**不同地点**：一个地点只能放一个陷阱。
   * 判定用 `state.hunterTraps`（真正的落子状态）。
   */
  if (state.hunterTraps[roomId]) {
    throw new Error('这个地点已经有陷阱了');
  }
  pp.placed[roomId] = kind;
  state.hunterTraps[roomId] = {
    roomId,
    kind,
    revealed: false,
    removed: false,
  };
  log(state, `已在「${roomName(state, roomId)}」放置${TRAP_LABEL[kind]}。`, 'killer');
}

/** 确认放置完成 */
export function confirmTrapPlacement(state: GameState): void {
  const pp = state.pendingTrapPlacement;
  if (!pp) throw new Error('当前不是放置陷阱的时间');
  if (!allTrapsPlaced(state)) {
    const left: string[] = [];
    for (const k of ['bear', 'bone', 'net'] as hunterTrapKind[]) {
      const n = trapRemaining(state, k);
      if (n > 0) left.push(`${TRAP_LABEL[k]} ×${n}`);
    }
    throw new Error(`还有陷阱没放完：${left.join('、')}`);
  }
  pp.done = true;
  pp.kind = null;
  log(
    state,
    `女猎手已完成陷阱放置：${(Object.values(pp.placed) as hunterTrapKind[])
      .map((k) => TRAP_LABEL[k])
      .join('、')}。`,
    'killer',
  );
}

/**
 * 进入某地点时检查猎手陷阱。
 * 实现在 effects.ts（那边能直接用 addFear / applyDamage，避免循环依赖）。
 */

/**
 * `netLockedRoom`（"这名幸存者是不是被捕网锁住"）**只在 effects.ts 里定义** ——
 * 那里能直接用 addFear / applyDamage，也方便 `tryMove` 这边调用。
 * 这里不再重复定义，避免两份实现漂移（以前就有一份从没被调用过）。
 */

/**
 * 新的一轮开始时清掉**上一轮的捕网锁**。
 *
 * 捕网陷阱本身触发时就消失了（一次性，见 effects.ts 的
 * `triggerHunterTrapOnEnter`），所以这里只需要把"本回合不能离开"这个
 * 效果清掉 —— 陷阱对象已经不在 `hunterTraps` 里了。
 */
export function settleNetTrapsOnNewRound(state: GameState): void {
  const before = (state.netLocks ?? []).length;
  state.netLocks = (state.netLocks ?? []).filter((l) => l.round >= state.round);
  const after = state.netLocks.length;
  if (after < before) {
    log(state, `上一轮的捕网效果已结束（${before - after} 名幸存者恢复行动）。`);
  }
}
