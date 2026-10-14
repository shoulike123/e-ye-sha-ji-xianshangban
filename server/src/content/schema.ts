/**
 * 说明书长什么样才算合格。
 * JSON 写错一个字段，这里会在读入时拦住，避免开打后才崩。
 */
import { z } from 'zod';

/**
 * 一张牌或一个技能可以触发的小动作（走路、惊吓、摸牌……）。
 * `alternatives` 让它递归：一张牌上可以写「或」的两组效果，打出时二选一。
 */
export interface EffectDef {
  op: string;
  value?: number | boolean | string;
  min?: number;
  at?: 'self' | 'target' | 'chosen';
  scope?: 'all' | 'main';
  requires?:
    | 'injuredSurvivor'
    | 'noiseOnBoard'
    | 'chestOnBoard'
    /** 未命名「伏擊」：仅在你重现或本回合移动通过了秘密通道时可用 */
    | 'reappearedOrSecretPassage';
  /**
   * 是否**可选**：牌面写了「可以」的才让玩家选；没写「可以」的必须执行。
   */
  optional?: boolean;
  /** 「或」的另一条效果：打出时让杀手二选一 */
  alternatives?: EffectDef[];
  itemId?: string;
  amount?: number;
  tokenId?: string;
  roomId?: string;
}

export const EffectSchema = z.lazy(() =>
  z.object({
    op: z.enum([
      'move',
      'search',
      'searchSurvivors',
      'repair',
      'noise',
      'draw',
      'discard',
      'stealth',
      'reveal',
      'damage',
      'heal',
      'placeToken',
      'removeToken',
      'gainItem',
      'waitRescue',
      'modifyMoveRange',
      'modifyAttackDamage',
      'quietSearch',
      'addFear',
      'clearFear',
      'placeBlockade',
      'placeBlockadeAll',
      'removeBlockade',
      'expose',
      'modifyPower',
      'attackValue',
      'defenseValue',
      'senseAdjacentPair',
      'senseColor',
      'addFearRange',
      'addFearPath',
      'damageHere',
      'damageFeared',
      'exposeFeared',
      'onReveal',
      'rageSearch',
      // 鸿运当骰：遭遇期间可重掷骰子
      'luckyDice',
      // 雕像杀手（killer6）专用
      'statueMove',
      'statueDraw',
      'statueExecute',
      'statueRally',
      'statueRelease',
      'statueSummonSeal',
      'statueSiege',
      // 女猎手（killer4）专用
      /** 感知任意一个地点：杀手点地图选地点，然后在行动区确认 */
      'senseRoom',
      /** 追踪：搜索 + 向双方展示某名幸存者与你的距离 */
      'searchTrackerDistance',
      /** 陷阱重置：潜行到任意地点 + 重置任意个地点上的所有陷阱 */
      'stealthResetTraps',
      /** 屏息：直到你的下回合结束 +N 力量 */
      'modifyPowerUntilNextTurn',
      // 狼人（killer5）专用
      /** 超听觉：移动到最近的带有响声标记的地点，然后搜索 */
      'moveNearestNoiseSearch',
      /** 领地意识：〔感知〕所有带响声的地点 */
      'senseAllNoise',
      // 未命名（killer7）专用
      /** 永久从弃牌堆中移除 N 张卡牌（變形 / 戰鬥適應） */
      'removeFromDiscardPermanent',
      /** 〔感知〕距离 N 内的所有地点（红外探測） */
      'senseRange',
      /** 强制某些幸存者揭示地点（音波感知） */
      'revealRooms',
      /** 回到牌库顶（刺耳噪声） */
      'returnToDeckTop',
      /** 潜行到任意一个带有秘密通道的地点（恐詭管道） */
      'stealthToPassage',
      /** 〔潜行〕到**任意地点**（保護色版的恐詭管道 / 女猎手「陷阱重置」）：点选 + 确认，不规划路径 */
      'stealthToAnywhere',
      // 扼杀者（killer8）专用
      /** 放置核心标记 */
      'placeCore',
      /** 移除一个核心标记 */
      'removeCore',
      /** 本次攻击中目标不能使用任何物品（荊棘纏繞） */
      'attackBlockItems',
      /** 在带有核心标记的地点封堵 */
      'placeBlockadeAtCore',
      /** 扼杀者「茂盛」：在你的地点**自动**封堵×N（不需要点门） */
      'blockadeHereAuto',
      /** 传送到带核心标记或封堵标记的地点 */
      'teleportToCore',
      /** 移动一个核心标记到相邻地点 */
      'moveCoreToAdjacent',
      // 通用补充
      /** 永久 +N 力量 */
      'permanentPower',
      /** 〔潛行〕并移动（潜行 + move 组合） */
      'stealthAndMove',
      /** 伤害你的地点和一个相邻地点，然后封堵两者之间的门（酸液喷吐） */
      'acidSpray',
      /** 本次攻击 +x 力量（x = 地图上核心标记数量，扼殺） */
      'attackValuePerCore',
      /** 伤害所在地点带核心标记或秘密通道的所有幸存者（狂亂枝條） */
      'damageCoreOrPassageRooms',
      // 未命名进化卡牌
      /** 保護色：重现时 **下一次攻击** +N 力量 */
      'nextAttackPower',
      /** 保護色：把「恐詭管道」的效果改成「潛行到任何地点」（进化卡牌被动） */
      'passageBecomesAnyStealth',
      /** 保護色：移动通过秘密通道时，**直到回合结束** +N 力量 */
      'powerUntilTurnEndOnPassage',
      /** 爬蟲爬行：把「爬行」的移動改成 ×1-3（进化卡牌被动） */
      'crawlBecomesOneToThree',
      /** 音波感知：回合开始时按响声情况强制幸存者揭示地点 */
      'sonarReveal',
      /** 粘液腺體：回合结束不在潜行则封堵×1；用「變形」后抽1张并封堵×2 */
      'slimeGland',
      /** 變形 的追加结算（有粘液腺體时抽 1 张并封堵×2） */
      'transformBonus',
      // 女王（killer9）
      /** 在你的地点生成 1 个僵尸（地图最多 6 个，满了则取消） */
      'spawnZombie',
      /** 选择 1 个僵尸〔搜索〕（抓住他們！） */
      'zombieSearch',
      /** 任意一个地点中的所有僵尸朝同一个目的地〔移動〕×N（屍群來了） */
      'zombieHordeMove',
      /** 使目标〔中毒〕（毒液之觸） */
      'poisonTarget',
      /** 献祭 1 个僵尸，并使距离 N 内所有幸存者〔中毒〕（屍體爆炸） */
      'sacrificeZombiePoisonRange',
      /** 〔感知〕一个地点；若目击幸存者，〔移動〕其中一个 ×N（君臨天下） */
      'senseThenMoveSurvivor',
      // 幸存者七（欧菲莉亚）
      /** 言语鼓励：移除目标全部恐惧 + 放置一个鼓励标记 */
      'encourage',
      // 幸存者八（凯莱布）
      /** 幸运币：弃掉搜索牌库顶 1 张；是钥匙则治疗，不是则移动 0-2 */
      'luckyCoin',
      // 幸存者九（迪伦）
      /** 机械知识：从弃牌堆拿一张工具箱 */
      'takeToolboxFromDiscard',
    ]),
    value: z.union([z.number(), z.boolean(), z.string()]).optional(),
    min: z.number().optional(),
    at: z.enum(['self', 'target', 'chosen']).optional(),
    /** 雕像牌用：all = 所有雕像，main = 只有主雕像 */
    scope: z.enum(['all', 'main']).optional(),
    requires: z
      .enum([
        'injuredSurvivor',
        'noiseOnBoard',
        'chestOnBoard',
        'reappearedOrSecretPassage',
      ])
      .optional(),
    /**
     * 这条效果是否**可选**。
     *
     * 规则：牌面描述里写了「**可以**」的才让玩家选，没写「可以」的**必须执行**。
     * 所以只有对应牌面带「可以」的效果才标 `optional: true`；
     * 省略 = 必须执行（引擎直接结算，不打断）。
     */
    optional: z.boolean().optional(),
    /** 「或」的另一条效果：打出时让杀手二选一（递归） */
    alternatives: z.array(EffectSchema).optional(),
    itemId: z.string().optional(),
    amount: z.number().optional(),
    tokenId: z.string().optional(),
    roomId: z.string().optional(),
  }),
) as unknown as z.ZodType<EffectDef>;

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  trigger: z.enum([
    'passive',
    'activated',
    'onTurnStart',
    'onSearch',
    'onNoise',
    'onDamaged',
  ]),
  oncePerTurn: z.boolean().optional(),
  text: z.string(),
  effects: z.array(EffectSchema),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.enum(['killer', 'survivor']),
  maxHp: z.number().int().positive(),
  description: z.string(),
  startingPower: z.number().int().nonnegative().optional(),
  inventorySlots: z.number().int().positive().optional(),
  skills: z.array(SkillSchema).default([]),
});

/**
 * 【变体1】特性卡（`content/traits.json`）：幸存者 20 张 + 杀手 20 张。
 *
 * 字段都是给**实现**用的，不只是文案：
 *  - `kind`：`special` 特殊行动 / `extra` 额外行动（这两种要放进行动区对应位置）
 *    / `passive` 被动自动 / `trigger` 时机触发
 *  - `oncePerGame`：卡面写「（每场游戏仅限一次）」→ 用掉后卡牌**变暗**
 *  - `optional`：卡面写「可以」→ 要玩家**选择并确认**；没写的默认自动执行
 *  - `setup`：开局设置类（开局一次性结算）
 */
export const TraitSchema = z.object({
  id: z.string(),
  faction: z.enum(['survivor', 'killer']),
  index: z.number().int().positive(),
  name: z.string(),
  kind: z.enum(['passive', 'special', 'extra', 'trigger']),
  oncePerGame: z.boolean().optional(),
  optional: z.boolean().optional(),
  setup: z.boolean().optional(),
  text: z.string(),
  art: z.string(),
});
export type TraitDef = z.infer<typeof TraitSchema>;

/**
 * 【变体3】**计划卡**（`content/plans.json`）。
 *
 * 判定只看两类条件（用户口径：**只检查人物位置**）：
 *  - `icon`：四类地点图标 —— `gear`=修理地点 / `hammer`=锤子地点 / `book`=书本地点 / `spiral`=螺旋地点
 *  - `place`：整句位置条件 —— `killerRoom`=杀手地点 / `allSame`=所有幸存者同一地点 /
 *    `allDifferent`=所有幸存者不同地点 / `hiddenExit`=隐藏出口
 *
 * 能力里：
 *  - `oncePerGame` **只认卡面文字写明的「每場遊戲僅限一次」**（和有没有标记框无关）
 *  - `hasBox` = 卡面能力文字**右侧有没有那个标记框**（有框的用掉后标记消失，代表已使用）
 *  - `mapMarker` = 这条能力要在地图上放计划标记
 *  - `impl` = 引擎里的实现键（`plans.ts` 按它 switch）
 */
export const PlanStepSchema = z.object({
  icon: z.enum(['gear', 'hammer', 'book', 'spiral']).optional(),
  place: z.enum(['killerRoom', 'allSame', 'allDifferent', 'hiddenExit', 'mainExit']).optional(),
  /** 进度名（风味文字，判定不看它） */
  label: z.string(),
});

export const PlanAbilitySchema = z.object({
  text: z.string(),
  impl: z.string(),
  kind: z.enum(['passive', 'special', 'extra', 'onComplete', 'win']),
  /** 「在主要出口 / 在螺旋地点」这类**使用地点**限制 */
  place: z.enum(['mainExit', 'spiral']).optional(),
  /** 发动代价（弃物品） */
  cost: z.object({ item: z.string(), count: z.number().int().positive() }).optional(),
  oncePerGame: z.boolean().optional(),
  hasBox: z.boolean().optional(),
  mapMarker: z.boolean().optional(),
  /** 需要玩家选一名幸存者（例如情报分享的"选一人抽 1 张"） */
  pickTarget: z.boolean().optional(),
});

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  art: z.string(),
  progress: z.array(PlanStepSchema).min(1),
  abilities: z.array(PlanAbilitySchema).min(1),
});
export type PlanDef = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
export type PlanAbility = z.infer<typeof PlanAbilitySchema>;

export const CardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'search',
    'discovery',
    'killerAction',
    'upgrade',
    'item',
    // 乔治的笔记：拿到手才有效，只有乔治本人能用
    'note',
    // 宝藏牌（狼人）：银质匕首 / 银质子弹
    'treasure',
    // 遗物牌（墓穴 R6 遺物室）
    'relic',
    // 未命名的「进化卡牌」：等级 2 / 4 二选一拿到的永久效果
    'evolutionCard',
  ]),
  /**
   * 卡牌类型，同时决定能打出的阶段：
   *  - fast / slow / special：杀手回合的三个阶段（⚡快速、⌛慢速、⬆特殊）
   *  - attack：**攻击卡牌**，只在遭遇的攻击时机打出（⚔）
   * 多时机牌用 `timings` 覆盖单个时机。
   */
  speed: z.enum(['fast', 'slow', 'special', 'attack']).optional(),
  /**
   * 可在哪些**时机**打出。省略时由 `speed` 决定单个时机。
   * 时机 = 阶段：
   *  - fast / slow / special：杀手回合的三个阶段
   *    （牌面图标：⚡快速、⌛慢速、⬆特殊）
   *  - attack：**遭遇的攻击时机**（牌面 ⚔ 图标）
   * 用于**双时机**的牌，例如：
   *  - 谋杀者「尾随」attack＋slow：遭遇中打＝本次攻击+1；慢速阶段打＝潜行 0-2
   *  - 狼人「领地意识」fast＋slow：快速阶段打＝感知响声地点；慢速阶段打＝潜行 0-3
   * 顺序与 `effectsByTiming` 一一对应。
   */
  timings: z.array(z.enum(['fast', 'slow', 'special', 'attack'])).optional(),
  /**
   * 每个时机各自的效果（和 `timings` 一一对应）。
   * 没写就退回 `effects`。
   */
  effectsByTiming: z.array(z.array(EffectSchema)).optional(),
  text: z.string(),
  makesNoise: z.boolean().optional(),
  locked: z.boolean().optional(),
  unlockLevel: z.number().int().positive().optional(),
  /**
   * **解锁二选一**：同一个 `unlockChoice` 组里的锁定牌，到达 `unlockAtLevel` 时
   * 只让杀手挑 **一张** 入手（未命名的「刺耳噪声 / 酸液喷吐」就是这种）。
   */
  unlockChoice: z.string().optional(),
  unlockAtLevel: z.number().int().positive().optional(),
  owner: z.string().optional(),
  handCost: z.number().int().nonnegative().optional(),
  effects: z.array(EffectSchema).default([]),
});

/**
 * 地图上一个"贴图标记"的位置：**左上角坐标 + 宽高**（可选旋转）。
 * 封堵标记 / 机关大门 / 急救箱都用它。
 *
 * ⚠ 必须定义在 `RoomSchema` **之前** —— `z.object({...})` 是立即求值的，
 * 放在后面会撞上 `const` 的暂时性死区。
 */
export const BlockadeMarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameKiller: z.string().optional(),
  x: z.number(),
  y: z.number(),
  tags: z.array(z.string()).default([]),
});

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  bidirectional: z.boolean().default(true),
  pathType: z.string().optional(),
  blockade: z
    .object({
      survivor: BlockadeMarkSchema.optional(),
      killer: BlockadeMarkSchema.optional(),
    })
    .optional(),
});

export const ZoneSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  color: z.string(),
  shape: z.enum(['rect', 'circle']),
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),
  h: z.number().optional(),
  r: z.number().optional(),
  side: z.enum(['killer', 'survivor', 'both']).optional(),
});

export const TokenSchema = z.object({
  id: z.string(),
  kind: z.string(),
  src: z.string(),
  /**
   * **可翻转标记的背面图**（目前只有墓穴 R6 的遗物标记用）。
   * 写了它就意味着这个标记有正反两面，客户端按状态选 `src` / `srcBack`。
   */
  srcBack: z.string().optional(),
  /**
   * 绝对坐标（地图坐标）。宝箱、修理标记这类「在地图上摆位置」的标记用。
   * 猎手陷阱 / 陷阱零件标记不用它 —— 它们**跟着地点圆圈走**，
   * 只算相对圆心的位移（见 survivorLayout.roomMarkerOffsets），
   * 那时 x/y/w/h 都可以省略。
   */
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  rotation: z.number().optional(),
  side: z.enum(['killer', 'survivor', 'both']).optional(),
  roomId: z.string().optional(),
  label: z.string().optional(),
  /** true = 位置跟着 roomId 的圆圈走，不用 x/y */
  relativeToRoom: z.boolean().optional(),
});

export const MapSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  backgrounds: z
    .object({
      survivor: z.string().optional(),
      killer: z.string().optional(),
    })
    .optional(),
  rooms: z.array(RoomSchema).min(1),
  edges: z.array(EdgeSchema),
  passages: z.array(EdgeSchema).optional(),
  zones: z.array(ZoneSchema).optional(),
  tokens: z.array(TokenSchema).optional(),
  /**
   * **可坍塌的地点**（目前只有墓穴用）。杀手每次升级随机塌一个，不会重复。
   * 放在地图数据里而不是写死在代码里：改哪几个地点要塌不用动服务端。
   */
  collapsibleRooms: z.array(z.string()).optional(),
  /**
   * **坍塌板块的位置**（按地点配）。
   * 板块本身让客户端按 `src` 画在 `x/y/w/h` 上，`rotation` 默认 90 度
   * （板块是横的，贴到地图上要转成竖的）。
   */
  collapsedMarks: z
    .array(
      z.object({
        roomId: z.string(),
        src: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        rotation: z.number().optional(),
        /** 只在哪一方的地图上显示（默认两边都显示） */
        side: z.enum(['killer', 'survivor', 'both']).optional(),
        /** 有的话杀手地图用另一张图（例如镜像过的） */
        srcKiller: z.string().optional(),
      }),
    )
    .optional(),
  survivorStartRoomId: z.string(),
  killerStartRoomId: z.string(),
});

export const RulesSchema = z.object({
  id: z.string(),
  name: z.string(),
  mapId: z.string(),
  maxSurvivors: z.number().int().positive(),
  minPlayersToStart: z.number().int().positive(),
  survivorMoveRange: z.number().int().positive(),
  killerMoveRange: z.number().int().positive(),
  killerActionsPerTurn: z.number().int().positive(),
  searchMakesNoise: z.boolean(),
  repairMakesNoise: z.boolean(),
  keysNeeded: z.number().int().nonnegative(),
  repairNeeded: z.number().int().nonnegative(),
  rescueWaitRounds: z.number().int().nonnegative(),
  killerWinsOnAnyKill: z.boolean(),
  survivorExitRequiresAllAliveAt: z.string(),
  hiddenExitRequiresMapItem: z.boolean(),
  killerSeesSurvivorPositions: z.boolean(),
  survivorSeesKillerPosition: z.boolean(),
  startingHandSize: z.number().int().nonnegative(),
  killerDrawOnTurnEnd: z.number().int().nonnegative(),
  killerStartingHand: z.number().int().nonnegative().default(2),
  killerHandMax: z.number().int().positive().default(5),
  survivorDefaultMaxHp: z.number().int().positive().default(2),
  fearMax: z.number().int().positive().default(3),
  blockadeTokenMax: z.number().int().positive().default(7),
  killerPowerMax: z.number().int().positive().default(10),
  killerPowerStart: z.number().int().nonnegative().default(1),
  enableDiscovery: z.boolean().default(true),
  enableEncounter: z.boolean().default(true),
  enableBlockades: z.boolean().default(true),
  enableFear: z.boolean().default(true),
});

export type SkillDef = z.infer<typeof SkillSchema>;
export type CharacterDef = z.infer<typeof CharacterSchema>;
export type CardDef = z.infer<typeof CardSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type MapToken = z.infer<typeof TokenSchema>;
export type RulesDef = z.infer<typeof RulesSchema>;

const LayoutBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

/**
 * 带**图层**的色块：`layer` 就是 CSS 的 `z-index`。
 *
 * 【雕像】4 尊立绘摆在一起时会互相遮挡，得能调谁在上谁在下
 * （用户要求："都放上，我来调整图层和位置"）。
 */
const LayeredBoxSchema = LayoutBoxSchema.extend({
  layer: z.number().int().default(0),
});

/**
 * 地图标记相对圆心的位移（`survivorLayout.roomMarkerOffsets`）。
 * 形状是 `{ dx, dy, size }`，单位是**地图坐标**，和 `LayoutBox` 不是一回事。
 */
const MarkerOffsetSchema = z.object({
  dx: z.number(),
  dy: z.number(),
  size: z.number(),
});

export const SurvivorLayoutSchema = z.object({
  statusBar: z.object({
    cards: z.array(LayoutBoxSchema).min(1),
    fear: z.array(LayoutBoxSchema.extend({ card: z.number().int(), index: z.number().int() })),
    noise: z.array(LayoutBoxSchema.extend({ card: z.number().int() })),
    /**
     * 女王〔中毒〕标记，一格对应一张状态卡。
     * **必须声明**，否则校准页保存时会被 zod 剥掉（zod 默认丢未知键），
     * 拖完点保存等于没存。
     */
    poison: z
      .array(LayoutBoxSchema.extend({ card: z.number().int() }))
      .default([
        { x: 26, y: 38, w: 7, h: 22, card: 0 },
        { x: 58, y: 38, w: 7, h: 22, card: 1 },
        { x: 90, y: 38, w: 7, h: 22, card: 2 },
      ]),
  }),
  hudRow: z
    .object({
      keys: LayoutBoxSchema,
      status: LayoutBoxSchema,
      rescue: LayoutBoxSchema,
    })
    .default({
      keys: { x: 0, y: 0, w: 34.5, h: 100 },
      status: { x: 34.5, y: 0, w: 49.8, h: 100 },
      rescue: { x: 84.3, y: 0, w: 15.7, h: 100 },
    }),
  keySlots: z.array(LayoutBoxSchema).default([
    { x: 2.4, y: 47.5, w: 18, h: 50 },
    { x: 21.4, y: 47.5, w: 18, h: 50 },
    { x: 40.4, y: 47.5, w: 18, h: 50 },
    { x: 59.4, y: 47.5, w: 18, h: 50 },
    { x: 78.4, y: 47.5, w: 18, h: 50 },
  ]),
  rescueCells: z
    .array(LayoutBoxSchema.extend({ step: z.number().int() }))
    .default([
      { step: 5, x: 6, y: 14, w: 24, h: 32 },
      { step: 4, x: 6, y: 56, w: 24, h: 32 },
      { step: 3, x: 38, y: 14, w: 24, h: 32 },
      { step: 2, x: 38, y: 56, w: 24, h: 32 },
      { step: 1, x: 70, y: 14, w: 24, h: 32 },
      { step: 0, x: 70, y: 56, w: 24, h: 32 },
    ]),
  skillBoard: z.object({
    slots3: z.array(LayoutBoxSchema),
    slots6: z.array(LayoutBoxSchema),
    /**
     * 装备卡下半「人物身体」的位置：幸存者的标记（鼓励 / 坚毅）画在这里。
     * **必须声明**，否则校准页保存时会被 zod 剥掉（zod 默认丢未知键），
     * 标记就没地方画了。
     */
    body: LayoutBoxSchema.optional(),
  }),
  publicStrip: z
    .object({
      evolution: LayoutBoxSchema,
      level: LayoutBoxSchema,
      power: LayoutBoxSchema,
    })
    .default({
      evolution: { x: 18, y: 4, w: 64, h: 92 },
      level: { x: 20.5, y: 10, w: 8, h: 14 },
      power: { x: 20.2, y: 78, w: 8, h: 16 },
    }),
  killerDock: z
    .object({
      standee: LayoutBoxSchema,
      /**
       * 【雕像】4 尊雕像立绘**各自的**位置与图层。
       *
       * 用户要求："雕像的立绘有 4 个，都放上，我来调整图层和位置" ——
       * 原来的 `standee` 是**单值**，雕像局里只能显示一尊，所以单开一个数组。
       * 非雕像杀手仍然用 `standee`。
       */
      statueStandees: z
        .array(LayeredBoxSchema)
        .default([
          { x: 0.6, y: 6, w: 3.4, h: 88, layer: 0 },
          { x: 4.2, y: 6, w: 3.4, h: 88, layer: 0 },
          { x: 7.8, y: 6, w: 3.4, h: 88, layer: 0 },
          { x: 11.4, y: 6, w: 3.4, h: 88, layer: 0 },
        ]),
      deck: LayoutBoxSchema,
      discard: LayoutBoxSchema,
      hand: z
        .array(LayoutBoxSchema)
        .min(1)
        .transform((boxes) => boxes.slice(0, 5)),
      evolution: LayoutBoxSchema,
      evolutionLabel: LayoutBoxSchema.default({ x: 77, y: 56, w: 22, h: 6 }),
      /**
       * 锁定牌色块（**大多数杀手共用的这一格**）。
       *
       * ⚠ **默认只有 1 格**，九名杀手里只有**未命名**有 2 张锁定牌；
       * 而且他的槽位**不跟这里共用** —— 见下面的 `lockedByKiller`。
       * 用户明确：「未命名的第一张锁定牌不要跟其他杀手的绑定调整」。
       */
      locked: z
        .array(LayoutBoxSchema)
        .default([{ x: 54, y: 62, w: 12, h: 34 }]),
      /**
       * **某个杀手专属的锁定牌槽位**（按角色 id 存）。
       *
       * 没登记的杀手继续用上面的 `locked`；登记了的（目前只有 `killer7` 未命名）
       * 完全用自己这一套 —— 两边互不影响，调一边不会带偏另一边。
       */
      lockedByKiller: z.record(z.string(), z.array(LayoutBoxSchema)).default({
        killer7: [
          { x: 54, y: 62, w: 12, h: 34 },
          { x: 66.5, y: 62, w: 12, h: 34 },
        ],
      }),
    })
    .default({
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
      lockedByKiller: {
        killer7: [
          { x: 54, y: 62, w: 12, h: 34 },
          { x: 66.5, y: 62, w: 12, h: 34 },
        ],
      },
    }),
  killerInfo: z
    .object({
      evolution: LayoutBoxSchema,
      effects: LayoutBoxSchema,
      locked: z.array(LayoutBoxSchema).min(1),
      cards: z.array(LayoutBoxSchema).min(1),
      /**
       * 特殊规则卡（女猎手 / 狼人 / 雕像 / 扼杀者 1 张、女王 2 张）。
       * 老存档里可能是**单个对象**，所以两种形态都收，读的时候统一成数组。
       */
      specialRule: z
        .union([LayoutBoxSchema, z.array(LayoutBoxSchema)])
        .optional(),
      /** 进化卡牌（未命名 4 张） */
      evolutionCards: z.array(LayoutBoxSchema).optional(),
    })
    .default({
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
    }),
  /**
   * 「求生者相关物品」面板：3 行，每行最多 3 个色块。
   * 同样**必须声明**，否则校准页保存时会被 zod 剥掉。
   */
  survivorItems: z
    .object({
      rows: z.array(z.array(LayoutBoxSchema)),
    })
    .optional(),
  /**
   * 地图上「跟着地点圆圈走」的标记相对位移。
   * 注意形状和 `LayoutBox` **不同**：是 `{ dx, dy, size }`，
   * 单位是**地图坐标**（相对圆心），不是百分比。
   */
  roomMarkerOffsets: z
    .object({
      hunterTrap: MarkerOffsetSchema,
      trapPart: MarkerOffsetSchema,
      coreMarker: MarkerOffsetSchema,
      zombie: MarkerOffsetSchema,
      /** 【变体3】计划标记：圆心左侧 */
      planMarker: MarkerOffsetSchema,
    })
    .partial()
    .optional(),
  /**
   * 【变体3】**计划卡**上进度标识的位置（相对卡面的百分比）。
   *
   * `lines` = 最多 4 个进度行位（标识放在"当前进度那一行"）；
   * `abilityMarker` = 整张计划完成后、能力文字右侧那个"已用"标记位。
   *
   * ⚠ 同样**必须在这里声明**，否则校准页保存时会被 zod 剥掉。
   */
  planCards: z
    .object({
      lines: z.array(LayoutBoxSchema).min(1),
      abilityMarker: LayoutBoxSchema,
    })
    .partial()
    .optional(),
});

export type SurvivorLayout = z.infer<typeof SurvivorLayoutSchema>;
