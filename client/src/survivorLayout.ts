/**
 * 幸存者界面每一块该摆在屏幕的百分之几。
 * 数字来自校准页，存进 content/ui/survivor-layout.json。
 */
import type { CSSProperties } from 'react';

/** 搜索/发现牌原图 531×803，物品格按这个比例缩 */
export const SEARCH_CARD_W = 531;
export const SEARCH_CARD_H = 803;
export const SKILL_BOARD_W = 1832;
export const SKILL_BOARD_H = 1853;

export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RescueCellBox extends LayoutBox {
  step: number;
}

export interface SurvivorLayout {
  statusBar: {
    cards: LayoutBox[];
    fear: Array<LayoutBox & { card: number; index: number }>;
    noise: Array<LayoutBox & { card: number }>;
  };
  /** 顶栏三块：钥匙架 / 角色状态 / 救援板块，百分比相对整行。 */
  hudRow: {
    keys: LayoutBox;
    status: LayoutBox;
    rescue: LayoutBox;
  };
  keySlots: LayoutBox[];
  rescueCells: RescueCellBox[];
  skillBoard: {
    slots3: LayoutBox[];
    slots6: LayoutBox[];
  };
  publicStrip: {
    evolution: LayoutBox;
    level: LayoutBox;
    power: LayoutBox;
  };
  killerDock: {
    standee: LayoutBox;
    deck: LayoutBox;
    discard: LayoutBox;
    hand: LayoutBox[];
    evolution: LayoutBox;
    evolutionLabel: LayoutBox;
    locked: LayoutBox[];
  };
  /** 「查看杀手信息」大面板：进化牌、效果文字、锁定牌、行动牌 */
  killerInfo: {
    evolution: LayoutBox;
    effects: LayoutBox;
    locked: LayoutBox[];
    cards: LayoutBox[];
  };
}

/** 钥匙架 3027×1484、状态栏 2885×981、救援 905×981，同高横排。 */
export const HUD_ROW_ASPECT = '5791 / 981';

export const DEFAULT_SURVIVOR_LAYOUT: SurvivorLayout = {
  statusBar: {
    cards: [
      { x: 1.6, y: 5, w: 31.2, h: 72 },
      { x: 34.4, y: 5, w: 31.2, h: 72 },
      { x: 67.2, y: 5, w: 31.2, h: 72 },
    ],
    fear: [
      { card: 0, index: 0, x: 6, y: 78, w: 4.2, h: 16 },
      { card: 0, index: 1, x: 11, y: 78, w: 4.2, h: 16 },
      { card: 1, index: 0, x: 38.8, y: 78, w: 4.2, h: 16 },
      { card: 1, index: 1, x: 43.8, y: 78, w: 4.2, h: 16 },
      { card: 2, index: 0, x: 71.6, y: 78, w: 4.2, h: 16 },
      { card: 2, index: 1, x: 76.6, y: 78, w: 4.2, h: 16 },
    ],
    noise: [
      { card: 0, x: 16.2, y: 78, w: 4.2, h: 16 },
      { card: 1, x: 49, y: 78, w: 4.2, h: 16 },
      { card: 2, x: 81.8, y: 78, w: 4.2, h: 16 },
    ],
  },
  hudRow: {
    keys: { x: 0, y: 0, w: 34.5, h: 100 },
    status: { x: 34.5, y: 0, w: 49.8, h: 100 },
    rescue: { x: 84.3, y: 0, w: 15.7, h: 100 },
  },
  keySlots: [
    { x: 2.4, y: 47.5, w: 18, h: 50 },
    { x: 21.4, y: 47.5, w: 18, h: 50 },
    { x: 40.4, y: 47.5, w: 18, h: 50 },
    { x: 59.4, y: 47.5, w: 18, h: 50 },
    { x: 78.4, y: 47.5, w: 18, h: 50 },
  ],
  rescueCells: [
    { step: 5, x: 6, y: 14, w: 24, h: 32 },
    { step: 4, x: 6, y: 56, w: 24, h: 32 },
    { step: 3, x: 38, y: 14, w: 24, h: 32 },
    { step: 2, x: 38, y: 56, w: 24, h: 32 },
    { step: 1, x: 70, y: 14, w: 24, h: 32 },
    { step: 0, x: 70, y: 56, w: 24, h: 32 },
  ],
  skillBoard: {
    slots3: [
      { x: 3.5, y: 2.9, w: 29.5, h: 44.1 },
      { x: 35.8, y: 2.6, w: 29.2, h: 43.7 },
      { x: 67.6, y: 2.8, w: 29.4, h: 44.0 },
    ],
    slots6: [
      { x: 4.6, y: 3.1, w: 27.5, h: 41.1 },
      { x: 36.2, y: 2.5, w: 27.5, h: 41.1 },
      { x: 67, y: 2.5, w: 27.5, h: 41.1 },
      { x: 4, y: 23.2, w: 28.6, h: 42.8 },
      { x: 36.2, y: 24, w: 27.5, h: 41.1 },
      { x: 67, y: 24, w: 27.5, h: 41.1 },
    ],
  },
  publicStrip: {
    evolution: { x: 18, y: 4, w: 64, h: 92 },
    level: { x: 20.5, y: 10, w: 8, h: 14 },
    power: { x: 20.2, y: 78, w: 8, h: 16 },
  },
  killerDock: {
    standee: { x: 1.2, y: 6, w: 14, h: 88 },
    deck: { x: 16.5, y: 8, w: 10, h: 52 },
    discard: { x: 27.5, y: 8, w: 10, h: 52 },
    hand: [
      { x: 39, y: 10, w: 9, h: 48 },
      { x: 48.5, y: 10, w: 9, h: 48 },
      { x: 58, y: 10, w: 9, h: 48 },
      { x: 67.5, y: 10, w: 9, h: 48 },
      { x: 77, y: 10, w: 9, h: 48 },
    ],
    evolution: { x: 77, y: 62, w: 22, h: 34 },
    evolutionLabel: { x: 77, y: 56, w: 22, h: 6 },
    locked: [{ x: 54, y: 62, w: 12, h: 34 }],
  },
  killerInfo: {
    evolution: { x: 1.6, y: 2, w: 47, h: 55 },
    effects: { x: 50.2, y: 2, w: 47.4, h: 55 },
    locked: [
      { x: 1.6, y: 59, w: 8.2, h: 18 },
      { x: 10.6, y: 59, w: 8.2, h: 18 },
    ],
    cards: [
      { x: 1.6, y: 79, w: 7.6, h: 19 },
      { x: 9.8, y: 79, w: 7.6, h: 19 },
      { x: 18, y: 79, w: 7.6, h: 19 },
      { x: 26.2, y: 79, w: 7.6, h: 19 },
      { x: 34.4, y: 79, w: 7.6, h: 19 },
      { x: 42.6, y: 79, w: 7.6, h: 19 },
      { x: 50.8, y: 79, w: 7.6, h: 19 },
      { x: 59, y: 79, w: 7.6, h: 19 },
      { x: 67.2, y: 79, w: 7.6, h: 19 },
      { x: 75.4, y: 79, w: 7.6, h: 19 },
      { x: 83.6, y: 79, w: 7.6, h: 19 },
      { x: 91.8, y: 79, w: 7.6, h: 19 },
    ],
  },
};

export function boxStyle(box: LayoutBox): CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
  };
}

export function slotHeightFromWidth(
  wPct: number,
  boardW = SKILL_BOARD_W,
  boardH = SKILL_BOARD_H,
): number {
  return (wPct * boardW * SEARCH_CARD_H) / (boardH * SEARCH_CARD_W);
}

export function slotWidthFromHeight(
  hPct: number,
  boardW = SKILL_BOARD_W,
  boardH = SKILL_BOARD_H,
): number {
  return (hPct * boardH * SEARCH_CARD_W) / (boardW * SEARCH_CARD_H);
}

/** Position by x/y/w; height is CSS-locked to search-card ratio. */
export function slotBoxStyle(box: LayoutBox): CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: 'auto',
    aspectRatio: `${SEARCH_CARD_W} / ${SEARCH_CARD_H}`,
  };
}

export function mergeSurvivorLayout(raw: Partial<SurvivorLayout> | null | undefined): SurvivorLayout {
  const hand = (raw?.killerDock?.hand?.length
    ? raw.killerDock.hand
    : DEFAULT_SURVIVOR_LAYOUT.killerDock.hand
  ).slice(0, 5);
  return {
    statusBar: raw?.statusBar ?? DEFAULT_SURVIVOR_LAYOUT.statusBar,
    hudRow: { ...DEFAULT_SURVIVOR_LAYOUT.hudRow, ...raw?.hudRow },
    keySlots: raw?.keySlots?.length ? raw.keySlots : DEFAULT_SURVIVOR_LAYOUT.keySlots,
    rescueCells: raw?.rescueCells?.length ? raw.rescueCells : DEFAULT_SURVIVOR_LAYOUT.rescueCells,
    skillBoard: raw?.skillBoard ?? DEFAULT_SURVIVOR_LAYOUT.skillBoard,
    publicStrip: { ...DEFAULT_SURVIVOR_LAYOUT.publicStrip, ...raw?.publicStrip },
    killerDock: {
      ...DEFAULT_SURVIVOR_LAYOUT.killerDock,
      ...raw?.killerDock,
      hand,
      evolutionLabel: raw?.killerDock?.evolutionLabel ?? DEFAULT_SURVIVOR_LAYOUT.killerDock.evolutionLabel,
      locked: raw?.killerDock?.locked?.length
        ? raw.killerDock.locked
        : DEFAULT_SURVIVOR_LAYOUT.killerDock.locked,
    },
    killerInfo: {
      ...DEFAULT_SURVIVOR_LAYOUT.killerInfo,
      ...raw?.killerInfo,
      locked: raw?.killerInfo?.locked?.length
        ? raw.killerInfo.locked
        : DEFAULT_SURVIVOR_LAYOUT.killerInfo.locked,
      cards: raw?.killerInfo?.cards?.length
        ? raw.killerInfo.cards
        : DEFAULT_SURVIVOR_LAYOUT.killerInfo.cards,
    },
  };
}
