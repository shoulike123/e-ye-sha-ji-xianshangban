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
  // 替换牌（开启「替换鸿运当骰等牌」后进搜索牌堆）
  lamp: '/Image/Search/煤油灯.png',
  parcel: '/Image/Search/神秘包裹.png',
  lucky_dice: '/Image/Search/鸿运当骰.png',
};

const SEARCH_BY_NAME: Record<string, string> = {
  钥匙: '/Image/Key/01_钥匙.png',
  手斧: '/Image/Key/05_手斧.png',
  石灰粉: '/Image/Key/06_石灰粉.png',
  威士忌酒瓶: '/Image/Key/07_威士忌酒瓶.png',
  草药: '/Image/Key/08_草药.png',
  工具箱: '/Image/Key/09_工具箱.png',
  // 替换牌
  煤油灯: '/Image/Search/煤油灯.png',
  神秘包裹: '/Image/Search/神秘包裹.png',
  鸿运当骰: '/Image/Search/鸿运当骰.png',
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

/** 一张牌的图片：先看杀手牌，再看搜索/发现牌名 */
export function cardArtSrc(card: CardDef | undefined | null, cardId?: string): string | undefined {
  const id = card?.id ?? cardId;
  if (id) {
    const killer = killerCardSrc(id);
    if (killer) return killer;
  }
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
