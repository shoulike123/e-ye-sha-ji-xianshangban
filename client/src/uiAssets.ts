/**
 * 界面小图片清单：钥匙架、恐惧、封堵、行动规则图……
 * 路径都从网站根目录 /Image/ 开始。
 */
export const UI = {
  rescue: '/Image/UI/救援板块.png',
  car: '/Image/UI/警车.png',
  keys: '/Image/UI/钥匙架.png',
  /**
   * 【分头行动】顶栏标识：官方那张木牌（用户给的素材）。
   * 分头行动下**替换**钥匙架那一块（钥匙各自保管、不上架）。
   */
  splitBadge: '/Image/UI/分头行动.png',
  status: '/Image/UI/状态栏.png',
  fear: '/Image/UI/恐惧.png',
  noise: '/Image/UI/响声.png',
  firecrackerNoise: '/Image/UI/爆竹响声.png',
  keyCard: '/Image/Key/01_钥匙.png',
  stealth: '/Image/UI/潜行.png',
  trap: '/Image/UI/陷阱.png',
  repair: '/Image/UI/修理.png',
  blockade: '/Image/UI/封堵.png',
  /** 【城堡 R1 控制杆】机关大门：放在门上，幸存者不能过、杀手要弃 3 张 */
  leverGate: '/Image/UI/机关大门.png',
  /** 【实验室 G3 急救室】急救箱标记：用一次就消失 */
  firstAidKit: '/Image/UI/急救箱.png',
  /**
   * 【墓穴】坍塌板块：地点塌了盖在上面（默认旋转 90 度）。
   * 素材由用户提供，位置/尺寸在 `maps/crypt.json` 的 `collapsedMarks` 里调。
   */
  collapsePlate: '/Image/UI/坍塌板块.png',
  suitcase: '/Image/UI/手提箱.jpg',
  suitcaseUsed: '/Image/UI/手提箱已用.jpg',
  searchBack: '/Image/Key/牌背1.png',
  searchBackLast: '/Image/Key/牌背2.png',
  discoveryBack: '/Image/Discovery/牌背.png',
  /** 狼人宝藏牌堆的牌背 */
  treasureBack: '/Image/Treasure/牌背.png',
  /**
   * 【墓穴 R6 遺物室】遗物牌堆的牌背。
   *
   * 素材放在**遗物卡牌那个文件夹**里（`Image/Relic/牌背.png`），
   * 和别的牌堆一个规矩：牌 + 牌背放一起（发现牌堆、钥匙牌堆、宝藏牌堆都是这样）。
   * 遗物**标记**的正/背面是板块类素材，放在 `Image/UI/`（见 `content/maps/crypt.json`）。
   */
  relicBack: '/Image/Relic/牌背.png',
  rulesSurvivor: '/Image/UI/行动规则_幸存者.png',
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

/** 特殊物品小图标（相机、医药包、十字弩、钥匙） */
export const ITEM_ICON: Record<string, string> = {
  sophia_camera: '/Image/UI/索菲亚的相机.png',
  marco_medkit: '/Image/UI/马尔科的医疗包.png',
  /** 女王对局的十字弩 */
  crossbow: '/Image/Killers/杀手九_女王/十字弩.png',
  key: '/Image/Key/01_钥匙.png',
};

/**
 * 幸存者身上的**标记**图标。
 * 只画在装备卡（技能与背包）里的人物身体上，不画在地图或顶栏。
 */
export const SURVIVOR_TOKEN: Record<string, string> = {
  encourage: '/Image/UI/欧菲莉亚的鼓励标记.png',
  resilience: '/Image/UI/迪伦的坚毅标记.png',
};

