/**
 * 界面小图片清单：钥匙架、恐惧、封堵、行动规则图……
 * 路径都从网站根目录 /Image/ 开始。
 */
export const UI = {
  rescue: '/Image/UI/救援板块.png',
  car: '/Image/UI/警车.png',
  keys: '/Image/UI/钥匙架.png',
  status: '/Image/UI/状态栏.png',
  fear: '/Image/UI/恐惧.png',
  noise: '/Image/UI/响声.png',
  firecrackerNoise: '/Image/UI/爆竹响声.png',
  keyCard: '/Image/Key/01_钥匙.png',
  stealth: '/Image/UI/潜行.png',
  trap: '/Image/UI/陷阱.png',
  repair: '/Image/UI/修理.png',
  blockade: '/Image/UI/封堵.png',
  suitcase: '/Image/UI/手提箱.jpg',
  suitcaseUsed: '/Image/UI/手提箱已用.jpg',
  searchBack: '/Image/Key/牌背1.png',
  searchBackLast: '/Image/Key/牌背2.png',
  discoveryBack: '/Image/Discovery/牌背.png',
  rulesSurvivor: '/Image/UI/行动规则_求生者.png',
  rulesKiller: '/Image/UI/行动规则_杀手.png',
};

/** 六面骰子每一面的画。有的面是 0、1、3，不是普通 1～6 */
export const DICE_FACES = [
  { value: 1, src: '/Image/UI/骰子/face_1_1.png' },
  { value: 0, src: '/Image/UI/骰子/face_2_0.png' },
  { value: 1, src: '/Image/UI/骰子/face_3_1.png' },
  { value: 1, src: '/Image/UI/骰子/face_4_1.png' },
  { value: 0, src: '/Image/UI/骰子/face_5_0.png' },
  { value: 3, src: '/Image/UI/骰子/face_6_3.png' },
] as const;

/** 特殊物品小图标（相机、医药包、钥匙） */
export const ITEM_ICON: Record<string, string> = {
  sophia_camera: '/Image/UI/索菲亚的相机.png',
  marco_medkit: '/Image/UI/马尔科的医疗包.png',
  key: '/Image/Key/01_钥匙.png',
};

/** 救援板上警车该停在哪一格。5 是刚修好，0 是开到出口。对局里以 survivor-layout 校准值为准 */
export const RESCUE_CELLS: Record<number, { left: string; top: string }> = {
  5: { left: '18%', top: '30%' },
  4: { left: '18%', top: '72%' },
  3: { left: '50%', top: '30%' },
  2: { left: '50%', top: '72%' },
  1: { left: '82%', top: '30%' },
  0: { left: '82%', top: '72%' },
};
