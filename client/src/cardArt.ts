/**
 * 卡牌和物品该显示哪张画。
 * 编号对不上时，就按中文牌名去 Image/Key、Image/Discovery 里找。
 */
import { ITEM_ICON } from './uiAssets';
import { killerCardSrc } from './killerArt';
import type { CardDef } from './types';

export const ITEM_CARD: Record<string, string> = {
  key: '/Image/Key/01_钥匙.png',
  axe: '/Image/Key/05_手斧.png',
  lime: '/Image/Key/06_石灰粉.png',
  whiskey: '/Image/Key/07_威士忌酒瓶.png',
  herb: '/Image/Key/08_草药.png',
  toolbox: '/Image/Key/09_工具箱.png',
  ammo: '/Image/Discovery/09_弹药包.png',
  longsword: '/Image/Discovery/13_长剑.png',
  amulet: '/Image/Discovery/14_古代护符.png',
  shortsword: '/Image/Discovery/15_短剑.png',
  revolver: '/Image/Discovery/16_左轮手枪.png',
  firecracker: '/Image/Discovery/21_爆竹.png',
  map: '/Image/Discovery/24_秘密地图.png',
  sedative: '/Image/Discovery/25_镇静剂.png',
  flashlight: '/Image/Discovery/28_手电筒.png',
  adrenaline: '/Image/Discovery/29_肾上腺素.png',
  trap: '/Image/Discovery/32_陷阱零件.png',
  sophia_camera: '/Image/UI/索菲亚的相机.png',
  marco_medkit: '/Image/UI/马尔科的医疗包.png',
  // 乔治的笔记
  george_note_blockade: '/Image/Notes/笔记_拆除封堵.png',
  george_note_noise: '/Image/Notes/笔记_响声.png',
  george_note_defense: '/Image/Notes/笔记_防御.png',
  // 凯莱布「幸运币」：开局专属物品（卡牌版）
  lucky_coin: '/Image/UI/凯莱布的幸运币.png',
  // 迪伦「坚毅」：开局专属标记（不是物品，但同样按图片展示）
  resilience: '/Image/UI/迪伦的坚毅标记.png',
  // 女王对局的十字弩：由某名幸存者持有（开局指定），也算一件物品
  crossbow: '/Image/Killers/杀手九_女王/十字弩.png',
  /**
   * **【墓穴・遺物室】的 5 张遗物牌**。
   * 遗物**就是背包物品**（物品 id = 卡牌 id），所以走这张表 ——
   * 和别的物品一样在装备卡那一排显示、点开看牌面。
   */
  relic_key: '/Image/Relic/01_鑰匙.png',
  relic_mirror: '/Image/Relic/02_鏡之門戶.png',
  relic_shield: '/Image/Relic/03_剛毅之盾.png',
  relic_guard: '/Image/Relic/04_守護之石.png',
  relic_insight: '/Image/Relic/05_洞察之球.png',
  // 替换牌（开启「替换鸿运当骰等牌」后进搜索牌堆）—— 图片放在 `Image/Promo/`
  lamp: '/Image/Promo/煤油灯.png',
  parcel: '/Image/Promo/神秘包裹.png',
  lucky_dice: '/Image/Promo/鸿运当骰.png',
  /**
   * 狼人宝藏（开宝箱抽到的物品，占背包格）。
   * ⚠ 以前这里没登记 —— 抽到宝藏后背包里只显示原始 id「silver_dagger」，
   * 卡面完全没有（用户报的「宝藏牌也没载入」就是这个）。
   */
  silver_dagger: '/Image/Treasure/银质匕首.png',
  silver_bullet: '/Image/Treasure/银质子弹.png',
};

const SEARCH_BY_NAME: Record<string, string> = {
  钥匙: '/Image/Key/01_钥匙.png',
  手斧: '/Image/Key/05_手斧.png',
  石灰粉: '/Image/Key/06_石灰粉.png',
  威士忌酒瓶: '/Image/Key/07_威士忌酒瓶.png',
  草药: '/Image/Key/08_草药.png',
  工具箱: '/Image/Key/09_工具箱.png',
  // 替换牌（`Image/Promo/`）
  煤油灯: '/Image/Promo/煤油灯.png',
  神秘包裹: '/Image/Promo/神秘包裹.png',
  鸿运当骰: '/Image/Promo/鸿运当骰.png',
};

const DISCOVERY_BY_NAME: Record<string, string> = {
  钥匙: '/Image/Discovery/01_钥匙.png',
  威士忌酒瓶: '/Image/Discovery/03_威士忌酒瓶.png',
  草药: '/Image/Discovery/06_草药.png',
  弹药包: '/Image/Discovery/09_弹药包.png',
  石灰粉: '/Image/Discovery/12_石灰粉.png',
  长剑: '/Image/Discovery/13_长剑.png',
  古代护符: '/Image/Discovery/14_古代护符.png',
  短剑: '/Image/Discovery/15_短剑.png',
  左轮手枪: '/Image/Discovery/16_左轮手枪.png',
  手斧: '/Image/Discovery/18_手斧.png',
  爆竹: '/Image/Discovery/21_爆竹.png',
  工具箱: '/Image/Discovery/22_工具箱.png',
  秘密地图: '/Image/Discovery/24_秘密地图.png',
  镇静剂: '/Image/Discovery/25_镇静剂.png',
  手电筒: '/Image/Discovery/28_手电筒.png',
  肾上腺素: '/Image/Discovery/29_肾上腺素.png',
  陷阱零件: '/Image/Discovery/32_陷阱零件.png',
};


/** 背包里一件物品的图片地址 */
export function itemArtSrc(itemId: string): string | undefined {
  if (ITEM_ICON[itemId]) return ITEM_ICON[itemId];
  if (ITEM_CARD[itemId]) return ITEM_CARD[itemId];
  return undefined;
}

/** 一张牌的图片：先看杀手牌，再看遗物（遗物就是物品 id），再看搜索/发现牌名 */
export function cardArtSrc(card: CardDef | undefined | null, cardId?: string): string | undefined {
  const id = card?.id ?? cardId;
  if (id) {
    const killer = killerCardSrc(id);
    if (killer) return killer;
  }
  if (card?.type === 'relic') return itemArtSrc(card.id);
  if (!card) return undefined;
  if (card.type === 'search') return SEARCH_BY_NAME[card.name];
  if (card.type === 'discovery') return DISCOVERY_BY_NAME[card.name];
  const itemId = card.effects.find((e) => e.op === 'gainItem')?.itemId;
  if (itemId) return itemArtSrc(itemId);
  return undefined;
}

/** 打这张牌还要再丢掉几张手牌。优先读 handCost，没有就从牌面“费用N”里抠数字 */
export function cardHandCost(card: CardDef | undefined | null): number {
  if (!card) return 0;
  if (typeof card.handCost === 'number' && Number.isFinite(card.handCost)) {
    return Math.max(0, Math.floor(card.handCost));
  }
  const m = /费用\s*(\d+)/.exec(card.text ?? '');
  return m ? Number(m[1]) : 0;
}

/**
 * **实际要弃几张**（把进化带来的减免算进去）。
 *
 * 【女猎手进化 3 级】「所有卡牌费用 -1（最少为 0）」——
 * 这是**打牌时真正收的牌数**，必须和服务端
 * `killerCardCostAfterDiscount(cardHandCost(card), huntressCostDiscount(state))` 一致。
 *
 * ⚠ 以前客户端只认 `cardHandCost`（原价），服务端却按减价校验：
 * 玩家按原价选够了弃牌，服务端一算 `cost` 已经是 0，于是报
 * 「此牌不需要弃置其他手牌」—— **所有带费用的牌升到 3 级后都打不出去**。
 */
export function effectiveHandCost(
  state: { isHuntressKiller?: boolean; killerLevel?: number } | undefined,
  card: CardDef | undefined | null,
): number {
  const base = cardHandCost(card);
  if (!state?.isHuntressKiller) return base;
  if ((state.killerLevel ?? 1) < 3) return base;
  return Math.max(0, base - 1);
}
