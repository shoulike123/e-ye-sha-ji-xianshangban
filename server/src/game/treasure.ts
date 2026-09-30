/**
 * 狼人：宝藏牌堆。
 *
 * 规则要点：
 *  - 地图上有宝箱时建立宝藏牌堆（4 张：3 银质匕首 + 1 银质子弹），
 *    宝藏牌堆**放在幸存者地图上**；宝箱只在幸存者地图显示（杀手地图没有）。
 *  - 幸存者开一个宝箱 → 牌堆顶抽 1 张、那个宝箱图标消失。
 *  - 宝藏牌算物品，占背包格。
 *  - 银质匕首：+5 防御值，**一次性**。
 *  - 银质子弹：用法同弹药包（需左轮手枪），效果不同（掷出的 1、3 都当 5），
 *    **一次性**，用完进弃牌堆。
 */
import type { GameState } from './types.js';
import { drawTreasureCard, log } from './effects.js';

export const TREASURE_ITEM_NAME: Record<string, string> = {
  silver_dagger: '银质匕首',
  silver_bullet: '银质子弹',
};

/**
 * **宝箱只会出现在这四类特殊地点**（每张图各一个，共 4 个）。
 * 书本 / 螺旋 / 锤子 / 隐藏出口 —— 和原版地图上画着图标的那四处一致。
 */
export const TREASURE_ROOM_TAGS = [
  'special-book',
  'special-spiral',
  'special-hammer',
  'hiddenExit',
] as const;

/** 这个地点是不是"该有宝箱"的四类特殊地点之一 */
export function isTreasureRoom(state: GameState, roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  const room = state.map.rooms.find((r) => r.id === roomId);
  return Boolean(room?.tags?.some((t) => (TREASURE_ROOM_TAGS as readonly string[]).includes(t)));
}

/**
 * 地图上有几个宝箱。
 *
 * ⚠ **只有落在四类特殊地点上的宝箱标记才算数** ——
 * 这是一道保险：万一某张图的数据把宝箱写在了别的地点（早期用豪宅模板生成的
 * 实验室/城堡/墓穴就是这样，宝箱挂着豪宅的 G5/R4/G3/G2），
 * 那些标记会被忽略，而不会在地图上冒出一个"本不该有宝箱的地点"。
 */
export function chestMarkers(state: GameState): Array<{ id: string; roomId: string }> {
  return (state.map.tokens ?? [])
    .filter((t) => t.kind === 'treasureChest' && t.roomId)
    .filter((t) => isTreasureRoom(state, t.roomId))
    .map((t) => ({ id: t.id, roomId: t.roomId! }));
}

/** 建立宝藏牌堆：3 银质匕首 + 1 银质子弹 */
export function setupTreasure(state: GameState, content: { treasure: Array<{ id: string }> }): void {
  const chests = chestMarkers(state);
  state.treasureDeck = [];
  state.treasureDiscard = [];
  state.treasureChests = {};
  if (!chests.length) return;
  for (const m of chests) state.treasureChests[m.id] = m.roomId;
  state.treasureDeck = shuffle(content.treasure.map((c) => c.id));
  log(
    state,
    `地图上有 ${chests.length} 个宝箱，已建立宝藏牌堆（${state.treasureDeck.length} 张）。`,
  );
}


/**
 * 开宝箱：移除这个宝箱 + 从宝藏牌堆抽 1 张。
 * @returns 抽到的牌 id（null = 牌堆空且弃牌堆也空）
 */
export function openChest(state: GameState, chestId: string): string | null {
  const roomId = state.treasureChests[chestId];
  if (!roomId) return null;
  delete state.treasureChests[chestId];
  // 摸牌堆空时把弃牌堆洗回（和搜索牌堆同规则）
  const cardId = drawTreasureCard(state);
  log(
    state,
    cardId
      ? `开箱：从宝藏牌堆获得「${TREASURE_ITEM_NAME[state.cardById[cardId]?.id ?? ''] ?? state.cardById[cardId]?.name ?? cardId}」。`
      : '开箱：宝藏牌堆已空。',
  );
  return cardId;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
