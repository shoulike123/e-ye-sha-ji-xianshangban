/**
 * 九位杀手的素材路径表（给调试台用）。
 *
 * 为什么单独一份：`tools/ui-layout` 的「杀手信息」面板原本把 `KILLER_ART` /
 * `lockedArt` / `ruleArt` / `evoCardArt` 四张表**手写在 app.js 里，而且只写了
 * killer1–3**（`ruleArt` 写到 killer9 但漏了 killer7）。结果切到新杀手时
 * `art` 是 `undefined`，信息面板的每个色块都没有底图，等于**没法编辑**。
 *
 * 这里按**目录实际内容**列全，`ui-layout` 直接读它。
 *
 * 注意：这仅供**工具预览**。游戏里的映射真源仍是
 * `client/src/killerArt.ts`（那边还带卡牌 id ↔ 图片的对应）。
 */
(function (global) {
  'use strict';

  /**
   * ⚠ `locked` 是**锁定牌的图片文件名**（在 `<杀手>/卡牌/` 下）。
   *
   * 这里以前把 killer1/2/3 写成了 `[]` —— 于是校准页切到屠夫 / 幽魂 / 谋杀者时，
   * 「锁定牌」那一格**没有底图**（色块是空的），看起来像"这三个杀手没有锁定牌"。
   * 实际上他们各有一张：
   *   屠夫 13_残酷暴怒（等级 3）/ 幽魂 13_生命吸取（等级 4）/ 谋杀者 13_死亡盛放（等级 3）。
   * 其他杀手只有 1 张；**未命名是唯一有 2 张的**（刺耳噪声 / 酸液喷吐）。
   */
  const KILLERS = [
    { id: 'killer1', folder: '杀手一_屠夫', name: '屠夫', locked: ['13_残酷暴怒.png'] },
    { id: 'killer2', folder: '杀手二_幽魂', name: '幽魂', locked: ['13_生命吸取.png'] },
    { id: 'killer3', folder: '杀手三_谋杀者', name: '谋杀者', locked: ['13_死亡盛放.png'] },
    { id: 'killer4', folder: '杀手四_女猎手', name: '女猎手', locked: ['13_陷阱重置.png'] },
    { id: 'killer5', folder: '杀手五_狼人', name: '狼人', locked: ['13_超听觉.png'] },
    { id: 'killer6', folder: '杀手六_雕像', name: '雕像', locked: ['13_圍困.png'] },
    { id: 'killer7', folder: '杀手七_未命名', name: '未命名', locked: ['13_刺耳噪声.png', '14_酸液喷吐.png'] },
    { id: 'killer8', folder: '杀手八_扼杀者', name: '扼杀者', locked: ['13_狂亂枝條.png'] },
    { id: 'killer9', folder: '杀手九_女王', name: '女王', locked: ['13_君臨天下.png'] },
  ];

  const BASE = '/Image/Killers';

  /** 女王的特殊规则是两张，别的是一张 */
  const RULE_FILES = {
    killer4: ['特殊规则.png'],
    killer5: ['特殊规则.png'],
    killer6: ['特殊规则.png'],
    killer8: ['特殊规则.png'],
    killer9: ['特殊规则1.png', '特殊规则2.png'],
  };

  /** 未命名的 4 张进化卡牌 */
  const EVOLUTION_CARD_FILES = {
    killer7: [
      '进化卡牌_保护色.png',
      '进化卡牌_爬虫爬行.png',
      '进化卡牌_音波感知.png',
      '进化卡牌_粘液腺体.png',
    ],
  };

  const BY_ID = {};
  for (const k of KILLERS) {
    const base = `${BASE}/${k.folder}`;
    /** 有多张立绘变体的杀手（和 `client/src/killerArt.ts` 的 STANDEE_VARIANTS 一致） */
    const standeeVariants = k.id === 'killer6' ? 4 : 0;
    BY_ID[k.id] = {
      id: k.id,
      folder: k.folder,
      name: k.name,
      evolution: `${base}/进化牌.png`,
      standee: `${base}/立绘.png`,
      /** 立绘变体：雕像有 立绘1~4.png（地图上 4 尊雕像各用一张） */
      standees: Array.from({ length: standeeVariants }, (_, i) => `${base}/立绘${i + 1}.png`),
      back: `${base}/牌背.png`,
      intro: `${base}/人物介绍.png`,
      /** 锁定牌（可能没有） */
      lockedCards: k.locked.map((f) => `${base}/卡牌/${f}`),
      /** 特殊规则卡（可能一张都没有） */
      specialRules: (RULE_FILES[k.id] ?? []).map((f) => `${base}/${f}`),
      /** 进化卡牌（只有未命名有） */
      evolutionCards: (EVOLUTION_CARD_FILES[k.id] ?? []).map((f) => `${base}/${f}`),
    };
  }

  global.KILLER_ART_TABLE = {
    list: KILLERS,
    byId: BY_ID,
    /** 取一位杀手的素材；未知 id 返回 null（调用方自己兜底） */
    get(id) {
      return BY_ID[id] ?? null;
    },
  };
})(window);
