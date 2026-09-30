/**
 * 三名杀手的立绘、牌背、进化牌、每张行动牌的图片。
 * 文件夹在 Image/Killers/ 下面。
 */
export interface KillerArt {
  id: string;
  folder: string;
  name: string;
  standee: string;
  back: string;
  evolution: string;
  intro: string;
  /**
   * 杀手特殊规则卡（数组，可能 0/1/2 张）：
   * 女猎手/狼人/雕像/扼杀者 各 1 张，女王 2 张，其余杀手没有。
   */
  specialRules: string[];
  /** 立绘变体（雕像有 立绘1~4；其余为空数组，用 standee） */
  standees: string[];
  cards: string[];
}

/** 有特殊规则卡的杀手：文件夹 -> 张数 */
const SPECIAL_RULE_COUNT: Record<string, number> = {
  杀手四_女猎手: 1,
  杀手五_狼人: 1,
  杀手六_雕像: 1,
  杀手八_扼杀者: 1,
  杀手九_女王: 2,
};

/** 有多张立绘变体的杀手：文件夹 -> 变体数量 */
const STANDEE_VARIANTS: Record<string, number> = {
  杀手六_雕像: 4,
};

/** 按杀手文件夹拼出一套图片路径 */
function artOf(
  id: string,
  folder: string,
  name: string,
  cards: string[],
): KillerArt {
  const base = `/Image/Killers/${folder}`;
  const ruleCount = SPECIAL_RULE_COUNT[folder] ?? 0;
  // 单张时文件叫「特殊规则.png」，多张时叫「特殊规则1.png」「特殊规则2.png」
  const specialRules = Array.from({ length: ruleCount }, (_, i) =>
    ruleCount === 1 ? `${base}/特殊规则.png` : `${base}/特殊规则${i + 1}.png`,
  );
  const n = STANDEE_VARIANTS[folder] ?? 0;
  return {
    id,
    folder,
    name,
    standee: `${base}/立绘.png`,
    back: `${base}/牌背.png`,
    evolution: `${base}/进化牌.png`,
    intro: `${base}/人物介绍.png`,
    specialRules,
    standees: Array.from({ length: n }, (_, i) => `${base}/立绘${i + 1}.png`),
    cards: cards.map((f) => `${base}/${f}`),
  };
}

const KILLERS: KillerArt[] = [
  artOf('killer1', '杀手一_屠夫', '屠夫', [
    '卡牌/01_感知.png',
    '卡牌/02_感知.png',
    '卡牌/03_追逐.png',
    '卡牌/04_追逐.png',
    '卡牌/05_追逐.png',
    '卡牌/06_设障.png',
    '卡牌/07_设障.png',
    '卡牌/08_设障.png',
    '卡牌/09_链锯轰鸣.png',
    '卡牌/10_链锯轰鸣.png',
    '卡牌/11_疯狂.png',
    '卡牌/12_留下.png',
    '卡牌/13_残酷暴怒.png',
  ]),
  artOf('killer2', '杀手二_幽魂', '幽魂', [
    '卡牌/01_感知.png',
    '卡牌/02_感知.png',
    '卡牌/03_感知.png',
    '卡牌/04_追逐.png',
    '卡牌/05_追逐.png',
    '卡牌/06_尖叫.png',
    '卡牌/07_尖叫.png',
    '卡牌/08_呼啸而过.png',
    '卡牌/09_呼啸而过.png',
    '卡牌/10_消失.png',
    '卡牌/11_消失.png',
    '卡牌/12_惊吓之迹.png',
    '卡牌/13_生命吸取.png',
  ]),
  artOf('killer3', '杀手三_谋杀者', '谋杀者', [
    '卡牌/01_感知.png',
    '卡牌/02_追逐.png',
    '卡牌/03_追逐.png',
    '卡牌/04_追逐.png',
    '卡牌/05_追逐.png',
    '卡牌/06_尾随.png',
    '卡牌/07_尾随.png',
    '卡牌/08_尾随.png',
    '卡牌/09_逻辑推理.png',
    '卡牌/10_逻辑推理.png',
    '卡牌/11_谋杀预告.png',
    '卡牌/12_潜藏威胁.png',
    '卡牌/13_死亡盛放.png',
  ]),
  artOf('killer4', '杀手四_女猎手', '女猎手', [
    '卡牌/01_追逐.png',
    '卡牌/02_追逐.png',
    '卡牌/03_追逐.png',
    '卡牌/04_感知.png',
    '卡牌/05_感知.png',
    '卡牌/06_擲斧.png',
    '卡牌/07_追蹤.png',
    '卡牌/08_追蹤.png',
    '卡牌/09_追蹤.png',
    '卡牌/10_屏息.png',
    '卡牌/11_猎手本能.png',
    '卡牌/12_猎手本能.png',
    '卡牌/13_陷阱重置.png',
  ]),
  artOf('killer5', '杀手五_狼人', '狼人', [
    '卡牌/01_追逐.png',
    '卡牌/02_追逐.png',
    '卡牌/03_追逐.png',
    '卡牌/04_追逐.png',
    '卡牌/05_感知.png',
    '卡牌/06_感知.png',
    '卡牌/07_嚎叫.png',
    '卡牌/08_嚎叫.png',
    '卡牌/09_狂野撕咬.png',
    '卡牌/10_狂野撕咬.png',
    '卡牌/11_鲜血追猎.png',
    '卡牌/12_领地意识.png',
    '卡牌/13_超听觉.png',
  ]),
  artOf('killer6', '杀手六_雕像', '雕像', [
    '卡牌/01_感知.png',
    '卡牌/02_感知.png',
    '卡牌/03_巡邏.png',
    '卡牌/04_巡邏.png',
    '卡牌/05_巡邏.png',
    '卡牌/06_處決.png',
    '卡牌/07_重整旗鼓.png',
    '卡牌/08_重整旗鼓.png',
    '卡牌/09_釋放.png',
    '卡牌/10_召唤石碑.png',
    '卡牌/11_召唤石碑.png',
    '卡牌/12_召唤石碑.png',
    '卡牌/13_圍困.png',
  ]),
  artOf('killer7', '杀手七_未命名', '未命名', [
    '卡牌/01_爬行.png',
    '卡牌/02_爬行.png',
    '卡牌/03_爬行.png',
    '卡牌/04_变形.png',
    '卡牌/05_伏擊.png',
    '卡牌/06_伏擊.png',
    '卡牌/07_红外探测.png',
    '卡牌/08_红外探测.png',
    '卡牌/09_恐诡管道.png',
    '卡牌/10_恐诡管道.png',
    '卡牌/11_恐诡管道.png',
    '卡牌/12_戰鬥適應.png',
    '卡牌/13_刺耳噪声.png',
    '卡牌/14_酸液喷吐.png',
  ]),
  artOf('killer8', '杀手八_扼杀者', '扼杀者', [
    '卡牌/01_荊棘纏繞.png',
    '卡牌/02_荊棘纏繞.png',
    '卡牌/03_茂盛.png',
    '卡牌/04_茂盛.png',
    '卡牌/05_扼殺.png',
    '卡牌/06_枝條生長.png',
    '卡牌/07_枝條生長.png',
    '卡牌/08_枝條生長.png',
    '卡牌/09_枝條生長.png',
    '卡牌/10_傳送聚合.png',
    '卡牌/11_傳送聚合.png',
    '卡牌/12_傳送聚合.png',
    '卡牌/13_狂亂枝條.png',
  ]),
  artOf('killer9', '杀手九_女王', '女王', [
    '卡牌/01_感知.png',
    '卡牌/02_感知.png',
    '卡牌/03_抓住他們.png',
    '卡牌/04_抓住他們.png',
    '卡牌/05_召喚亡者.png',
    '卡牌/06_召喚亡者.png',
    '卡牌/07_毒液之觸.png',
    '卡牌/08_毒液之觸.png',
    '卡牌/09_屍群來了.png',
    '卡牌/10_屍群來了.png',
    '卡牌/11_屍體爆炸.png',
    '卡牌/12_汽化.png',
    '卡牌/13_君臨天下.png',
  ]),
];

const CARD_IDS: Record<string, string[]> = {
  killer1: [
    'butcher_sense_1',
    'butcher_sense_2',
    'butcher_chase_1',
    'butcher_chase_2',
    'butcher_chase_3',
    'butcher_block_1',
    'butcher_block_2',
    'butcher_block_3',
    'butcher_saw_1',
    'butcher_saw_2',
    'butcher_mad',
    'butcher_stay',
    'butcher_rage',
  ],
  killer2: [
    'spectre_sense_1',
    'spectre_sense_2',
    'spectre_sense_3',
    'spectre_chase_1',
    'spectre_chase_2',
    'spectre_scream_1',
    'spectre_scream_2',
    'spectre_whiz_1',
    'spectre_whiz_2',
    'spectre_vanish_1',
    'spectre_vanish_2',
    'spectre_trace',
    'spectre_drain',
  ],
  killer3: [
    'murder_sense',
    'murder_chase_1',
    'murder_chase_2',
    'murder_chase_3',
    'murder_chase_4',
    'murder_tail_1',
    'murder_tail_2',
    'murder_tail_3',
    'murder_logic_1',
    'murder_logic_2',
    'murder_omen',
    'murder_lurk',
    'murder_bloom',
  ],
  /**
   * killer4–9 的映射以前**整段缺失**，导致 `killerCardSrc()` 对这六位杀手
   * 恒返回 `null` —— 手牌只能显示一张通用牌背，卡面加载不出来。
   * 下面的顺序与 `content/cards/killers.json` 里该杀手的出牌顺序**一一对应**。
   */
  killer4: [
    'huntress_chase_1',
    'huntress_chase_2',
    'huntress_chase_3',
    'huntress_sense_1',
    'huntress_sense_2',
    'huntress_axe',
    'huntress_track_1',
    'huntress_track_2',
    'huntress_track_3',
    'huntress_breathe',
    'huntress_instinct_1',
    'huntress_instinct_2',
    'huntress_trapreset',
  ],
  killer5: [
    'wolf_chase_1',
    'wolf_chase_2',
    'wolf_chase_3',
    'wolf_chase_4',
    'wolf_sense_1',
    'wolf_sense_2',
    'wolf_howl_1',
    'wolf_howl_2',
    'wolf_bite_1',
    'wolf_bite_2',
    'wolf_bloodhunt',
    'wolf_territory',
    'wolf_hearing',
  ],
  killer6: [
    'statue_sense_1',
    'statue_sense_2',
    'statue_patrol_1',
    'statue_patrol_2',
    'statue_patrol_3',
    'statue_execute',
    'statue_rally_1',
    'statue_rally_2',
    'statue_release',
    'statue_seal_1',
    'statue_seal_2',
    'statue_seal_3',
    'statue_siege',
  ],
  killer7: [
    'un_crawl_1',
    'un_crawl_2',
    'un_crawl_3',
    'un_transform',
    'un_ambush_1',
    'un_ambush_2',
    'un_infrared_1',
    'un_infrared_2',
    'un_pipe_1',
    'un_pipe_2',
    'un_pipe_3',
    'un_adapt',
    'un_noise',
    'un_acid',
  ],
  killer8: [
    'st_thorn_1',
    'st_thorn_2',
    'st_bloom_1',
    'st_bloom_2',
    'st_choke',
    'st_branch_1',
    'st_branch_2',
    'st_branch_3',
    'st_branch_4',
    'st_teleport_1',
    'st_teleport_2',
    'st_teleport_3',
    'st_rampage',
  ],
  killer9: [
    'q_sense_1',
    'q_sense_2',
    'q_grab_1',
    'q_grab_2',
    'q_summon_1',
    'q_summon_2',
    'q_venom_1',
    'q_venom_2',
    'q_horde_1',
    'q_horde_2',
    'q_boom',
    'q_vapor',
    'q_reign',
  ],
};

const KILLER_CARD_BY_ID: Record<string, string> = {};
for (const art of KILLERS) {
  const ids = CARD_IDS[art.id] ?? [];
  ids.forEach((id, i) => {
    const src = art.cards[i];
    if (src) KILLER_CARD_BY_ID[id] = src;
  });
}

const ID_ALIAS: Record<string, string> = {
  killer1: '屠夫',
  killer2: '幽魂',
  killer3: '谋杀者',
  killer4: '女猎手',
  killer5: '狼人',
  killer6: '雕像',
  killer7: '未命名',
  killer8: '扼杀者',
  killer9: '女王',
};

/** 用编号或中文名找到这名杀手的画 */
export function killerArtFor(characterId: string | null, characterName?: string | null): KillerArt | null {
  if (characterId) {
    const byId = KILLERS.find((a) => a.id === characterId);
    if (byId) return byId;
  }
  const alias = characterId ? ID_ALIAS[characterId] : undefined;
  const hay = `${characterId ?? ''} ${characterName ?? ''} ${alias ?? ''}`;
  return KILLERS.find((a) => hay.includes(a.name) || hay.includes(a.folder)) ?? null;
}

/** 地图上的杀手立绘 */
export function killerStandeeSrc(art: KillerArt | null): string | null {
  return art?.standee ?? null;
}

/**
 * 雕像杀手在地图上的立绘：按雕像编号取「立绘N.png」。
 * 立绘 1、2 放主要出口，3、4 放隐藏出口；没有变体就退回立绘.png。
 */
export function killerStatueSrc(
  art: KillerArt | null,
  statueIndex: number,
): string | null {
  if (!art) return null;
  const variant = art.standees[statueIndex - 1];
  return variant ?? art.standee ?? null;
}

/** 某张杀手行动牌的图片 */
export function killerCardSrc(cardId: string): string | null {
  return KILLER_CARD_BY_ID[cardId] ?? null;
}
