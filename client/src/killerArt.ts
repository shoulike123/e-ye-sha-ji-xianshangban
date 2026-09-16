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
  cards: string[];
}

/** 按杀手文件夹拼出一套图片路径 */
function artOf(
  id: string,
  folder: string,
  name: string,
  cards: string[],
): KillerArt {
  const base = `/Image/Killers/${folder}`;
  return {
    id,
    folder,
    name,
    standee: `${base}/立绘.png`,
    back: `${base}/牌背.png`,
    evolution: `${base}/进化牌.png`,
    intro: `${base}/人物介绍.png`,
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

/** 某张杀手行动牌的图片 */
export function killerCardSrc(cardId: string): string | null {
  return KILLER_CARD_BY_ID[cardId] ?? null;
}
