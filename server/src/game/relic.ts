/**
 * **【墓穴・遺物室】的 5 张遗物牌的规则**。
 *
 * 遗物和普通牌不一样：
 *  - **不打牌**：拿到的瞬间结算（抽遗物的那一步），不会进手牌、不占手牌上限
 *  - **摊在面前**：只有**剛毅之盾**是不弃置的（角标 ∞），一直留着随时生效
 *  - **用完就走**：鑰匙 / 鏡之門戶 / 洞察之球 / **守護之石** 用完都进**普通弃牌堆**
 *
 * 牌面文字（用户提供，与 `content/cards/official.json` 同步）：
 *  - 鑰匙     立刻将本卡放入钥匙立牌
 *  - 鏡之門戶 额外行动：传送到 🌀 地点
 *  - 剛毅之盾 +1 防禦值，你能够使用一个额外武器（使用后不进入弃牌堆）
 *  - 守護之石 你可以向杀手出示本卡牌，以防止一次伤害
 *  - 洞察之球 （在搜索地点）特殊行动：搜索两次
 *
 * ⚠ 守護之石**不是 ∞**（用户口径：「遗物中只有剛毅之盾有无穷，其他都没有，
 *   包括守護之石」）—— 出示后从背包移除、进普通弃牌堆，见 `killerCards.confirmAmuletUse`。
 */
import type { GameState, PlayerState } from './types.js';
import { addKeys, enforceInventory, log, roomName, survivorActionVis } from './effects.js';

/* --------------------------------------------------------- 识别 ---- */
/**
 * 遗物的种类：**直接看卡牌 id**（`relic_*`），不额外加 schema 字段。
 * 好处是 `content/cards` 里只写 `{ id, name, type: 'relic', text }`，
 * 规则全在这个文件里，改平衡不用动 schema。
 */
const RELIC_IDS = {
  key: 'relic_key',
  mirror: 'relic_mirror',
  shield: 'relic_shield',
  guard: 'relic_guard',
  insight: 'relic_insight',
} as const;

export type RelicKind = keyof typeof RELIC_IDS;

const KIND_BY_ID: Record<string, RelicKind> = Object.fromEntries(
  Object.entries(RELIC_IDS).map(([k, id]) => [id, k as RelicKind]),
);

/** 这张牌是哪一种遗物（不是遗物就 null） */
export function relicKindOf(cardId: string | null | undefined): RelicKind | null {
  if (!cardId) return null;
  return KIND_BY_ID[cardId] ?? null;
}

/**
 * 这名幸存者身上有没有这种遗物。
 *
 * 遗物**就是背包里的物品**（`p.items`）—— 游戏里没有"遗物栏"这种东西，
 * 所以持有型遗物（剛毅之盾 / 守護之石）占背包格、和别的物品一样交互。
 */
export function hasRelic(p: PlayerState | undefined, kind: RelicKind): boolean {
  const id = RELIC_IDS[kind];
  return Boolean(p && (p.items[id] ?? 0) > 0);
}

/**
 * 把遗物放进这名幸存者的背包。
 *
 * **和普通物品一模一样**：`p.items` 里一格，超过背包上限就走既有的
 * `enforceInventory`（由那名幸存者**自选弃哪件**，和搜索/发现拿到的物品同一套流程）。
 */
export function giveRelic(state: GameState, p: PlayerState, cardId: string): void {
  p.items[cardId] = (p.items[cardId] ?? 0) + 1;
  /**
   * 用户口径：**"获得遗物"不给杀手看**（除非正好发生在遭遇里）——
   * 遗物牌堆是背面朝下的，"他拿到了哪一张"本来就是幸存者的私有信息。
   */
  log(
    state,
    `${p.name} 获得遗物「${state.cardById[cardId]?.name ?? cardId}」。`,
    survivorActionVis(state),
  );
  enforceInventory(state, p.id);
}

/** 用掉一件遗物：从背包移除 */
export function removeRelic(p: PlayerState, cardId: string, amount = 1): void {
  const have = p.items[cardId] ?? 0;
  if (have <= amount) delete p.items[cardId];
  else p.items[cardId] = have - amount;
}

/**
 * **遗物用毕 = 进普通弃牌堆**（和普通物品一个待遇：摊在 `survivorDiscard` 里，
 * 双方点「弃牌堆」能看到它）。
 *
 * ⚠ 但**不洗回遗物牌堆**：遗物牌堆只有 5 张、一张就一份，
 * 洗回去等于"同一张遗物可以反复拿"，规则上不是这样。
 */
export function discardRelic(state: GameState, cardId: string): void {
  if (!state.survivorDiscard.includes(cardId)) state.survivorDiscard.push(cardId);
}

/* --------------------------------------------------- ① 鑰匙 ---- */
/**
 * 鑰匙：**逻辑与搜索牌堆的钥匙一致** —— 立刻放上钥匙立牌（`keysCollected +1`），
 * 区别只在于它来自**遗物牌堆**：卡本身留在幸存者面前当"立牌上的那把钥匙"，
 * 不进搜索弃牌堆、也不算搜索牌。
 *
 * @returns 实际上了几把（钥匙架满了就是 0）
 */
export function applyRelicKey(state: GameState, p: PlayerState): number {
  /** ⚠ 分头行动：钥匙单独保管（记在他身上），不上架、不报告杀手 —— 但**仍会发声**（由摸牌那步发） */
  const added = addKeys(state, 1, p.id);
  log(
    state,
    state.split
      ? `${p.name} 的遗物「鑰匙」由他单独保管（共 ${p.keys ?? 0} 把）。`
      : added > 0
        ? `${p.name} 的遗物「鑰匙」放上钥匙立牌（${state.keysCollected}/${state.rules.keysNeeded}）。`
        : `钥匙架已有 ${state.keysCollected}/${state.rules.keysNeeded} 把，「鑰匙」不再上架。`,
    state.split ? 'survivor' : 'all',
    !state.split,
  );
  return added;
}

/* --------------------------------------------- ② 鏡之門戶 ---- */
/** 现在能传送到哪些地点：地图上所有 🌀 螺旋地点（塌掉的除外） */
export function mirrorTargets(state: GameState): string[] {
  return state.map.rooms
    .filter((r) => (r.tags ?? []).includes('special-spiral'))
    .filter((r) => !(state.collapsedRooms ?? []).includes(r.id))
    .map((r) => r.id)
    .sort();
}

/** 这名幸存者能不能用鏡之門戶（有遗物 + 有能去的螺旋地点 + 没被停滞） */
export function canUseMirror(state: GameState, p: PlayerState | undefined): boolean {
  if (!p?.alive || p.faction !== 'survivor') return false;
  if (!hasRelic(p, 'mirror')) return false;
  /**
   * ⚠ **只拦"停滞"**，不拦"本大回合做没做过额外行动" ——
   * 用户明确："所有的额外行动都是满足条件就能无限用的"。
   */
  if (p.haltedThisRound) return false;
  return mirrorTargets(state).length > 0;
}

/**
 * 传送到一个 🌀 螺旋地点（**额外行动**）。
 *
 * 这是**传送**，不是移动：不触发陷阱、不看门/封堵、不改"上次移动路径"。
 * 用完把卡放进**普通弃牌堆**（一次性）——
 * 遗物牌堆只有 5 张、一张就一份，所以弃牌**不会洗回遗物牌堆**（洗回去等于可以反复拿）。
 *
 * 记 `extraActionUsedThisTurn` 只是给「停滞雕像」的前置条件用
 * （做过额外行动就不能再停滞），**不用来拦第二次传送**。
 */
export function useMirror(state: GameState, p: PlayerState, toRoomId: string): void {
  if (!canUseMirror(state, p)) throw new Error('现在不能用鏡之門戶');
  if (!mirrorTargets(state).includes(toRoomId)) throw new Error('只能传送到螺旋地点');
  const from = p.roomId;
  p.roomId = toRoomId;
  p.extraActionUsedThisTurn = true;
  removeRelic(p, RELIC_IDS.mirror);
  log(
    state,
    `${p.name} 使用遗物「鏡之門戶」，从「${roomName(state, from)}」传送到「${roomName(state, toRoomId)}」（额外行动）。`,
    survivorActionVis(state),
  );
  discardRelic(state, RELIC_IDS.mirror);
}

/* --------------------------------------------- ③ 剛毅之盾 ---- */
/**
 * 剛毅之盾的 +1 防御值：**每次遭遇都能用**，而且**不占「防御物品」的名额** ——
 * 同一次防御里可以再选一件防御物品一起用。
 *
 * ⚠ 它计入「其他防御加成」，所以会占掉威廉「坚韧不拔」的 +1 —— 这是规则的自然结果。
 */
export function shieldDefenseBonus(state: GameState, p: PlayerState): number {
  return hasRelic(p, 'shield') ? 1 : 0;
}

/* --------------------------------------------- ④ 守護之石 ---- */
/**
 * 守護之石：**能防止遭遇中的直接伤害**（走攻击/防御流程的那种伤害不行）。
 *
 * 和古代护符的区别就在这里 —— 护符只在**非遭遇**时问，
 * 守護之石连"遭遇中不经防御流程的伤害"（例如杀手 5 级效果的直伤）也能挡。
 * 角标 ∞：用了**不进弃牌堆**，一直留着。
 *
 * ⚠ 实际挂起询问的是 `effects.applyDamage`（它按"守護之石 > 护符"的优先级问）；
 * 这里只提供"他有没有守護之石"这个判定，engine 把它注入给 effects。
 */
export function hasGuardStone(p: PlayerState | undefined): boolean {
  return hasRelic(p, 'guard');
}

/* --------------------------------------------- ⑤ 洞察之球 ---- */
/**
 * 洞察之球：**特殊行动**，点了就**依次摸两张牌**（各张独立结算，和搜索规则一致）。
 *
 * 所以它**不占一般行动之外的东西**：`canUseInsight` 判"在可搜索的地点"，
 * 用掉由 engine 走特殊行动那套（`assertSurvivorMainAction` + `mainActionUsed`）。
 */
export function canUseInsight(state: GameState, p: PlayerState | undefined): boolean {
  if (!p?.alive || p.faction !== 'survivor') return false;
  if (!hasRelic(p, 'insight')) return false;
  const room = state.map.rooms.find((r) => r.id === p.roomId);
  return Boolean(room?.tags?.includes('searchable'));
}

/** 用掉洞察之球：从背包移除 + 进普通弃牌堆（实际摸牌由 engine 调 `searchDrawMultiple`） */
export function consumeInsight(state: GameState, p: PlayerState): void {
  removeRelic(p, RELIC_IDS.insight);
  discardRelic(state, RELIC_IDS.insight);
}
