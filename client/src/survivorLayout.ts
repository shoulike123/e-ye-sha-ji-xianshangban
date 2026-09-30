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

/**
 * 带**图层**的色块：`layer` 直接当 CSS 的 `z-index`。
 *
 * 【雕像】4 尊立绘摆在一起会互相遮挡，得能调谁在上谁在下
 * （用户要求："都放上，我来调整图层和位置"）。
 */
export interface LayeredBox extends LayoutBox {
  layer?: number;
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
    /**
     * 装备卡下半「人物身体」的位置（百分比，相对整张装备卡）。
     * 幸存者的标记（鼓励标记 / 坚毅标记）**只画在这里**，
     * 即人物身体上；不画在地图立绘或顶栏头像上。
     */
    body: LayoutBox;
  };
  publicStrip: {
    evolution: LayoutBox;
    level: LayoutBox;
    power: LayoutBox;
  };
  killerDock: {
    /** 非雕像杀手的单张立绘 */
    standee: LayoutBox;
    /** 【雕像】4 尊立绘各自的色块 + 图层（雕像局用这套） */
    statueStandees: LayeredBox[];
    deck: LayoutBox;
    discard: LayoutBox;
    hand: LayoutBox[];
    /** 非雕像杀手的单张进化牌 */
    evolution: LayoutBox;
    evolutionLabel: LayoutBox;
    /**
     * 锁定牌色块（**大多数杀手共用的这一格**）。
     * ⚠ 只有未命名有 2 张锁定牌，而且他的槽位**不跟这里共用**
     * （见 `lockedByKiller`）—— 调他不会带偏别人。
     */
    locked: LayoutBox[];
    /** 某个杀手专属的锁定牌槽位（按角色 id）；目前只有 `killer7` 未命名有 2 格 */
    lockedByKiller?: Record<string, LayoutBox[]>;
  };
  /** 「查看杀手信息」大面板：进化牌、效果文字、锁定牌、行动牌、特殊规则 */
  killerInfo: {
    evolution: LayoutBox;
    effects: LayoutBox;
    locked: LayoutBox[];
    cards: LayoutBox[];
    /** 杀手特殊规则卡：女猎手/狼人/雕像/扼杀者 1 张、女王 2 张 */
    specialRule: LayoutBox[];
    /** 杀手进化卡牌（未命名 4 张） */
    evolutionCards: LayoutBox[];
  };
  /**
   * 「求生者相关物品」弹窗：按当前选的 3 名幸存者，从上往下 3 行。
   * 每行放那名幸存者的专属物品；乔治的 3 张笔记固定在同一行。
   */
  survivorItems: {
    rows: LayoutBox[][];
  };
  /**
   * 地图上「跟着地点圆圈走」的标记的**相对位移**（相对圆心，单位是地图坐标）。
   * 和幸存者/杀手立绘一样：只算相对位移，不在地图上摆绝对位置。
   */
  roomMarkerOffsets: {
    /** 猎手陷阱标记：圆心左侧 */
    hunterTrap: { dx: number; dy: number; size: number };
    /** 陷阱零件标记（【陷阱零件】使用后留下）：圆心下方 */
    trapPart: { dx: number; dy: number; size: number };
    /** 扼杀者核心标记：圆心上方（一个地点可以有多个） */
    coreMarker: { dx: number; dy: number; size: number };
    /** 女王僵尸：圆心右侧（一个地点可以有多个） */
    zombie: { dx: number; dy: number; size: number };
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
    // 人物躯干（格子区下面的左侧人物）：实测三张新卡都是头 y≈60–70、躯干 y≈72–88、x≈10–30
    body: { x: 17, y: 78, w: 15, h: 15 },
  },
  publicStrip: {
    evolution: { x: 18, y: 4, w: 64, h: 92 },
    level: { x: 20.5, y: 10, w: 8, h: 14 },
    power: { x: 20.2, y: 78, w: 8, h: 16 },
  },
  killerDock: {
    standee: { x: 1.2, y: 6, w: 14, h: 88 },
    /**
     * 【雕像】4 尊立绘：默认并排挤在原来那张立绘的位置上，
     * 用户在「界面校准 → 杀手」里自己拖开、调图层。
     */
    statueStandees: [
      { x: 0.6, y: 6, w: 3.4, h: 88, layer: 0 },
      { x: 4.2, y: 6, w: 3.4, h: 88, layer: 0 },
      { x: 7.8, y: 6, w: 3.4, h: 88, layer: 0 },
      { x: 11.4, y: 6, w: 3.4, h: 88, layer: 0 },
    ],
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
    /**
     * 锁定牌色块：**默认只有 1 格**。
     * 只有**未命名**有 2 张锁定牌（刺耳噪声 / 酸液喷吐），它是特例 ——
     * 那一格在校准页预览未命名时会扩到 2 格，别的杀手就用这 1 格。
     */
    locked: [{ x: 54, y: 62, w: 12, h: 34 }],
    /**
     * 【未命名】**专属**的锁定牌槽位（2 格）。
     * 用户明确："未命名的第一张锁定牌不要跟其他杀手的绑定调整" ——
     * 所以这里是**独立的一份**，改它不会动到 `locked`。
     */
    lockedByKiller: {
      killer7: [
        { x: 54, y: 62, w: 12, h: 34 },
        { x: 66.5, y: 62, w: 12, h: 34 },
      ],
    },
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
    // 特殊规则卡：右侧竖长条（909x1372，比例约 0.66），最多 2 张
    specialRule: [
      { x: 50.2, y: 59, w: 13, h: 19 },
      { x: 65.5, y: 59, w: 13, h: 19 },
    ],
    // 进化卡牌：未命名 4 张，占用原「特殊规则」的位置（2x2 排布）
    evolutionCards: [
      { x: 50.2, y: 59, w: 7.0, h: 9 },
      { x: 57.8, y: 59, w: 7.0, h: 9 },
      { x: 50.2, y: 68.6, w: 7.0, h: 9 },
      { x: 57.8, y: 68.6, w: 7.0, h: 9 },
    ],
  },
  // 求生者相关物品：3 行 x 每行最多 3 个
  survivorItems: {
    rows: [
      [
        { x: 4, y: 4, w: 16, h: 28 },
        { x: 22, y: 4, w: 16, h: 28 },
        { x: 40, y: 4, w: 16, h: 28 },
      ],
      [
        { x: 4, y: 36, w: 16, h: 28 },
        { x: 22, y: 36, w: 16, h: 28 },
        { x: 40, y: 36, w: 16, h: 28 },
      ],
      [
        { x: 4, y: 68, w: 16, h: 28 },
        { x: 22, y: 68, w: 16, h: 28 },
        { x: 40, y: 68, w: 16, h: 28 },
      ],
    ],
  },
  /** 地图标记相对圆心的位移（地图坐标单位，不是百分比） */
  roomMarkerOffsets: {
    // 猎手陷阱：圆心左侧
    hunterTrap: { dx: -30, dy: 0, size: 30 },
    // 陷阱零件：圆心下方
    trapPart: { dx: 0, dy: 34, size: 28 },
    // 扼杀者核心标记：圆心上方（一个地点可以有多个，会重叠显示）
    coreMarker: { dx: 0, dy: -34, size: 30 },
    // 女王僵尸：圆心右侧
    zombie: { dx: 34, dy: 0, size: 34 },
  },
};

/**
 * 判断一个布局色块是不是**可用**的（缺字段 / 负尺寸都算不可用）。
 *
 * 用途：存档里某个键缺失、或是 `null` 时，一律退回默认值。
 * 以前只判 `?.length`，所以 `null` / 元素残缺会被原样留下，
 * 结果是**编辑器和游戏显示不一致**（编辑器补了默认值，游戏却用了残缺值）。
 */
function isUsableBox(b: unknown): b is LayoutBox {
  if (!b || typeof b !== 'object') return false;
  const o = b as Partial<LayoutBox>;
  return (
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.w) &&
    Number.isFinite(o.h) &&
    (o.w as number) > 0 &&
    (o.h as number) > 0
  );
}

/** 一组色块：全部可用才采用，否则退回默认 */
function usableBoxes(got: unknown, fallback: LayoutBox[]): LayoutBox[] {
  return Array.isArray(got) && got.length > 0 && got.every(isUsableBox)
    ? (got as LayoutBox[])
    : fallback;
}

/**
 * 一组**带图层**的色块：位置要可用，`layer` 缺了就补 0。
 * 条数**不强制**和默认一致 —— 存档里只调了 2 尊也照用（缺的用默认补）。
 */
function usableLayeredBoxes(got: unknown, fallback: LayeredBox[]): LayeredBox[] {
  if (!Array.isArray(got) || got.length === 0 || !got.every(isUsableBox)) return fallback;
  return (got as LayeredBox[]).map((b, i) => ({
    ...b,
    layer: Number.isFinite(b.layer) ? (b.layer as number) : (fallback[i]?.layer ?? 0),
  }));
}

/**
 * 「某个杀手专属的锁定牌槽位」逐键兜底。
 *
 * 现有存档里没有这个键 —— 直接补上默认的 `killer7` 那两格；
 * 已经调过的保留原值。**别的杀手不受影响**（他们走 `locked`）。
 */
function mergeLockedByKiller(
  got: unknown,
): Record<string, LayoutBox[]> {
  const fallback = DEFAULT_SURVIVOR_LAYOUT.killerDock.lockedByKiller ?? {};
  const out: Record<string, LayoutBox[]> = {};
  for (const [killerId, boxes] of Object.entries(fallback)) {
    const raw = (got as Record<string, unknown> | undefined)?.[killerId];
    out[killerId] = usableBoxes(raw, boxes);
  }
  /** 存档里多出来的杀手条目也留着（以后可能加别的特例） */
  if (got && typeof got === 'object') {
    for (const [killerId, boxes] of Object.entries(got as Record<string, unknown>)) {
      if (!(killerId in out)) out[killerId] = usableBoxes(boxes, []);
    }
  }
  return out;
}

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
    /**
     * 状态栏：三个数组都要**逐项兜底**。
     * 校准页若存了残缺对象（比如 `cards` 空了、`fear` 少一项），
     * 整体替换会让状态栏直接塌掉 —— 所以空数组一律退回默认值。
     */
    statusBar: {
      cards: usableBoxes(raw?.statusBar?.cards, DEFAULT_SURVIVOR_LAYOUT.statusBar.cards),
      fear: Array.isArray(raw?.statusBar?.fear) && raw.statusBar.fear.length
        ? raw.statusBar.fear
        : DEFAULT_SURVIVOR_LAYOUT.statusBar.fear,
      noise: Array.isArray(raw?.statusBar?.noise) && raw.statusBar.noise.length
        ? raw.statusBar.noise
        : DEFAULT_SURVIVOR_LAYOUT.statusBar.noise,
    },
    hudRow: { ...DEFAULT_SURVIVOR_LAYOUT.hudRow, ...raw?.hudRow },
    keySlots: usableBoxes(raw?.keySlots, DEFAULT_SURVIVOR_LAYOUT.keySlots),
    rescueCells: raw?.rescueCells?.length ? raw.rescueCells : DEFAULT_SURVIVOR_LAYOUT.rescueCells,
    /**
     * 装备卡：老存档里没有 `body`（人物身体坐标），要补默认值，
     * 否则标记没地方画（`body` 可能是 `null`，所以用 isUsableBox 判）。
     */
    skillBoard: {
      ...DEFAULT_SURVIVOR_LAYOUT.skillBoard,
      ...(raw?.skillBoard ?? {}),
      slots3: usableBoxes(raw?.skillBoard?.slots3, DEFAULT_SURVIVOR_LAYOUT.skillBoard.slots3),
      slots6: usableBoxes(raw?.skillBoard?.slots6, DEFAULT_SURVIVOR_LAYOUT.skillBoard.slots6),
      body: isUsableBox(raw?.skillBoard?.body)
        ? raw.skillBoard.body
        : DEFAULT_SURVIVOR_LAYOUT.skillBoard.body,
    },
    publicStrip: { ...DEFAULT_SURVIVOR_LAYOUT.publicStrip, ...raw?.publicStrip },
    killerDock: {
      ...DEFAULT_SURVIVOR_LAYOUT.killerDock,
      ...raw?.killerDock,
      hand,
      /**
       * 【雕像】4 尊立绘：逐项兜底。
       * 老存档里没有这个键 → 用默认值（也就是"都摆上，等你去调"）。
       */
      statueStandees: usableLayeredBoxes(
        raw?.killerDock?.statueStandees,
        DEFAULT_SURVIVOR_LAYOUT.killerDock.statueStandees,
      ),
      evolutionLabel: isUsableBox(raw?.killerDock?.evolutionLabel)
        ? raw.killerDock.evolutionLabel
        : DEFAULT_SURVIVOR_LAYOUT.killerDock.evolutionLabel,
      locked: usableBoxes(raw?.killerDock?.locked, DEFAULT_SURVIVOR_LAYOUT.killerDock.locked),
      /**
       * 每个杀手专属的锁定牌槽位：逐键兜底。
       * 存档里缺 `killer7` 就补默认的那两格 —— 不影响别的杀手。
       */
      lockedByKiller: mergeLockedByKiller(raw?.killerDock?.lockedByKiller),
    },
    killerInfo: {
      ...DEFAULT_SURVIVOR_LAYOUT.killerInfo,
      ...raw?.killerInfo,
      /**
       * 每个色块都**逐项**兜底：存档缺这个键、或给了 `null` / 残缺值，
       * 就退回默认值。这样编辑器和游戏看到的**一定是同一套**坐标。
       *
       * 老存档里 `specialRule` 是**单个对象**（不是数组），要升级成数组。
       */
      evolution: isUsableBox(raw?.killerInfo?.evolution)
        ? raw.killerInfo.evolution
        : DEFAULT_SURVIVOR_LAYOUT.killerInfo.evolution,
      effects: isUsableBox(raw?.killerInfo?.effects)
        ? raw.killerInfo.effects
        : DEFAULT_SURVIVOR_LAYOUT.killerInfo.effects,
      locked: usableBoxes(raw?.killerInfo?.locked, DEFAULT_SURVIVOR_LAYOUT.killerInfo.locked),
      cards: usableBoxes(raw?.killerInfo?.cards, DEFAULT_SURVIVOR_LAYOUT.killerInfo.cards),
      /**
       * `specialRule` 有两个历史形态：**单个对象**（很老）与**数组**（现在）。
       * 先取数组；不是数组就退回单个对象（升级成两项）；两者都不是就用默认。
       */
      specialRule: (() => {
        const got = raw?.killerInfo?.specialRule as LayoutBox | LayoutBox[] | undefined;
        if (Array.isArray(got)) {
          return usableBoxes(got, DEFAULT_SURVIVOR_LAYOUT.killerInfo.specialRule);
        }
        if (isUsableBox(got)) {
          return [
            got,
            { x: got.x + 15.3, y: got.y, w: got.w, h: got.h },
          ];
        }
        return DEFAULT_SURVIVOR_LAYOUT.killerInfo.specialRule;
      })(),
      /** 老存档没有 evolutionCards，用默认值 */
      evolutionCards: usableBoxes(
        raw?.killerInfo?.evolutionCards,
        DEFAULT_SURVIVOR_LAYOUT.killerInfo.evolutionCards,
      ),
    },
    /**
     * 老存档没有 survivorItems，用默认值。
     * 行数对得上**且每行的色块都可用**才采用，否则退回默认（防残缺行导致面板塌掉）。
     */
    survivorItems: (() => {
      const got = raw?.survivorItems?.rows;
      const def = DEFAULT_SURVIVOR_LAYOUT.survivorItems;
      if (!Array.isArray(got) || got.length !== def.rows.length) return def;
      if (!got.every((row) => Array.isArray(row) && row.length > 0 && row.every(isUsableBox))) return def;
      return raw!.survivorItems as SurvivorLayout['survivorItems'];
    })(),
    /** 老存档没有 roomMarkerOffsets，用默认值 */
    roomMarkerOffsets: {
      hunterTrap: {
        ...DEFAULT_SURVIVOR_LAYOUT.roomMarkerOffsets.hunterTrap,
        ...(raw?.roomMarkerOffsets?.hunterTrap ?? {}),
      },
      trapPart: {
        ...DEFAULT_SURVIVOR_LAYOUT.roomMarkerOffsets.trapPart,
        ...(raw?.roomMarkerOffsets?.trapPart ?? {}),
      },
      coreMarker: {
        ...DEFAULT_SURVIVOR_LAYOUT.roomMarkerOffsets.coreMarker,
        ...(raw?.roomMarkerOffsets?.coreMarker ?? {}),
      },
      zombie: {
        ...DEFAULT_SURVIVOR_LAYOUT.roomMarkerOffsets.zombie,
        ...(raw?.roomMarkerOffsets?.zombie ?? {}),
      },
    },
  };
}
