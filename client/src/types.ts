/**
 * 网页这边看到的局面形状。
 * 和服务器 types 差不多，但只有“发给你的那一份”，没有隐藏情报。
 */
export type Faction = 'killer' | 'survivor' | 'spectator';
export type GameMode = 'solo' | 'duo' | 'vs2' | 'multi' | '2v3';
export type EncounterStep = 'pick' | 'attack' | 'defend' | 'flee';
export type KillerTurnStep = 'fast' | 'main' | 'slow';
export type KillerMainChoice = 'actions' | 'special' | null;

export type Phase =
  | 'lobby'
  | 'characterSelect'
  /** 开局准备：女猎手先布好猎手陷阱才进第 1 回合 */
  | 'trapSetup'
  /** 开局准备：雕像选主雕像（选完锁定） */
  | 'statueSetup'
  /** 开局准备：女王局由幸存者指定谁拿十字弩 */
  | 'crossbowSetup'
  /** 【变体1】开局前选特性卡：所有人都选完才真正开始第 1 回合 */
  | 'traitDraft'
  | 'survivorMain'
  | 'discovery'
  | 'noiseReport'
  | 'killerMain'
  | 'encounter'
  | 'upkeep'
  | 'gameOver';

export interface EffectDef {
  op: string;
  value?: number | boolean | string;
  min?: number;
  at?: string;
  itemId?: string;
  amount?: number;
}

export interface SkillDef {
  id: string;
  name: string;
  trigger: string;
  oncePerTurn?: boolean;
  text: string;
  effects: EffectDef[];
}

export interface CharacterDef {
  id: string;
  name: string;
  faction: 'killer' | 'survivor';
  maxHp: number;
  description: string;
  startingPower?: number;
  inventorySlots?: number;
  skills: SkillDef[];
}

/**
 * 【变体1】特性卡定义（服务端从 `content/traits.json` 读进来、随快照下发）。
 *
 * 客户端只需要拿它画卡面 / 文字 / 点开放大，效果逻辑全在服务端。
 */
export interface TraitDef {
  id: string;
  faction: 'survivor' | 'killer';
  index: number;
  name: string;
  /** passive 被动自动 / special 特殊行动 / extra 额外行动 / trigger 时机触发 */
  kind: 'passive' | 'special' | 'extra' | 'trigger';
  /** 卡面「（每场游戏仅限一次）」：用掉后卡牌变暗 */
  oncePerGame?: boolean;
  /** 卡面写「可以」：需要玩家选择并确认 */
  optional?: boolean;
  /** 开局设置类（游戏开始时结算） */
  setup?: boolean;
  text: string;
  /** 卡面图：`/Image/Traits/幸存者/01_速度爆发.png` */
  art: string;
}

export interface CardDef {
  id: string;
  name: string;
  type: string;
  speed?: string;
  /** 卡牌类型：attack = 攻击卡牌（遭遇中打出），special = 特殊卡牌 */
  category?: string;
  /** 多时机牌可在哪些阶段打出（如领地意识 ⚡＋⌛） */
  timings?: string[];
  /** 每个时机各自的效果（和 timings 一一对应） */
  effectsByTiming?: EffectDef[][];
  text: string;
  makesNoise?: boolean;
  locked?: boolean;
  unlockLevel?: number;
  owner?: string;
  handCost?: number;
  effects: EffectDef[];
}

export interface RoomDef {
  id: string;
  name: string;
  nameKiller?: string;
  x: number;
  y: number;
  tags: string[];
}

export interface MapZone {
  id: string;
  label?: string;
  color: string;
  shape: 'rect' | 'circle';
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  side?: 'killer' | 'survivor' | 'both';
}

export interface MapToken {
  id: string;
  kind: string;
  src: string;
  /** 可翻转标记的背面图（墓穴 R6 遗物标记） */
  srcBack?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  side?: 'killer' | 'survivor' | 'both';
  roomId?: string;
  label?: string;
}

/** 【墓穴】坍塌板块：按地点配一块（素材 + 位置/尺寸/旋转），塌了就画上去 */
export interface CollapsedMark {
  roomId: string;
  src: string;
  srcKiller?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  side?: 'killer' | 'survivor' | 'both';
}

export interface BlockadeMark {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface MapEdge {
  from: string;
  to: string;
  bidirectional?: boolean;
  pathType?: string;
  blockade?: {
    survivor?: BlockadeMark;
    killer?: BlockadeMark;
  };
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  backgrounds?: { survivor?: string; killer?: string };
  rooms: RoomDef[];
  edges: MapEdge[];
  passages?: Array<{ from: string; to: string; bidirectional?: boolean }>;
  zones?: MapZone[];
  tokens?: MapToken[];
  /**
   * 【墓穴】可坍塌的地点（杀手每次升级随机塌一个，不会重复）。
   * 放在地图数据里，编辑界面能直接改。
   */
  collapsibleRooms?: string[];
  /** 【墓穴】每个可坍塌地点对应的坍塌板块（素材 + 位置） */
  collapsedMarks?: CollapsedMark[];
  survivorStartRoomId: string;
  killerStartRoomId: string;
}

export interface PublicPlayerView {
  id: string;
  name: string;
  faction: Faction | null;
  characterId: string | null;
  ready: boolean;
  connected: boolean;
  roomId: string | null;
  hp: number;
  maxHp: number;
  fear: number;
  exposed: boolean;
  overFear: boolean;
  handCount: number;
  items: Record<string, number>;
  inventorySlots: number;
  alive: boolean;
  /**
   * 【分头行动】倒在这儿了（**逃脱或被杀**）：立绘要留在原地并变暗。
   * 只有分头行动会下发 true；别的模式死人照旧不画立绘。
   */
  downed?: boolean;
  /** 【分头行动】是"单独逃脱"而不是被杀（立绘都变暗，文案不同） */
  escaped?: boolean;
  /** 【分头行动】他身上还剩几把钥匙（同地点的人可以从遗留物里拿） */
  keys?: number;
  stealth: boolean;
  moveLeft: number;
  actionsLeft: number;
  mainActionUsed: boolean;
  actedThisRound?: boolean;
  /** 本大回合是否做过额外行动（额外行动不受小回合限制） */
  extraActionUsedThisTurn?: boolean;
  /** 本大回合是否执行过停滞（停滞过就不能再做额外行动） */
  haltedThisRound?: boolean;
  /** 迪伦「机械知识」本大回合用没用过 */
  mechanicalKnackUsedThisTurn?: boolean;
  /** 【变体1】他身上已选的特性卡 id（杀手特性双方可见；幸存者特性只有幸存者视角有） */
  traits?: string[];
  /** 鼓励标记 / 坚毅标记：画在装备卡的人物身体上（杀手看不到） */
  hasEncourageToken?: boolean;
  hasResilienceToken?: boolean;
  /** 凯莱布「幸运币」本大回合是否已用过（每人各自记） */
  luckyCoinUsedThisTurn?: boolean;
  /** 2对3：这名杀手选的先后手偏好（两人一致才生效） */
  orderPick?: 'first' | 'second' | null;
  /** 雕像杀手：这是第几号雕像（1–4）；右键菜单按它逐尊列 */
  statueIndex?: number | null;
}

export interface DiceRoll {
  id: number;
  values: number[];
  total: number;
  attack: number;
  success: boolean;
  survivorName: string;
}

export interface EncounterState {
  roomId: string;
  step: EncounterStep;
  targetId?: string | null;
  attackCardId: string | null;
  attackBoost?: boolean;
  attackChoiceMade?: boolean;
  attackCommitted?: boolean;
  attackOptions: string[];
  defenses: Record<string, string | null>;
  defenseItems?: Record<string, string | null>;
  /** **剛毅之盾**勾没勾（不占 `defenseItems` 的名额，所以单列） */
  shieldUsed?: Record<string, boolean>;
  /** 荊棘纏繞：本次攻击中目标**不能使用任何物品**（含剛毅之盾） */
  blockItems?: boolean;
  defenseOptions: Record<string, string[]>;
  fleeQueue: string[];
  discoveredIds?: string[];
  trapArmed?: boolean;
  trapApplied?: boolean;
}

export interface PublicSnapshot {
  roomCode: string;
  hostId: string;
  mode: GameMode;
  /** 「分头行动」开关（1对3 / 2对3 专用）：顶栏换成模式标识、显示各自钥匙数 */
  split?: boolean;
  /** 【分头行动】本大回合的先手（棋子 id）；开局前没选就是 null */
  splitFirstId?: string | null;
  /** 【分头行动】座位顺序基准（不旋转），用来画"从左往右"轮转 */
  splitOrderBase?: string[];
  /** 【分头行动】一个人单独逃脱要几把钥匙（默认 3，服务端下发，前端不用写死） */
  splitEscapeKeys?: number;
  /** 【变体1】特性卡开关（所有模式都能开，可与分头行动同开） */
  variant1?: boolean;
  /** 【变体1】生存难度等级（四档，差别只在杀手侧抽几张） */
  traitDifficulty?: 'easy' | 'normal' | 'hard' | 'nightmare';
  /** 【变体1】当前可见的特性卡定义（卡面/文字/图片路径） */
  traitDefs?: TraitDef[];
  /** 【变体1】现在轮到**你**选的那一份（弹窗用） */
  yourTraitPick?: {
    playerId: string;
    playerName: string;
    options: string[];
    keep: number;
  } | null;
  /** 【变体1】还等着选的人（显示"等待 XX 选特性"） */
  traitPickerIds?: string[];
  /** 【变体1】已经用掉的一次性特性（卡面变暗） */
  traitUsed?: string[];
  /** 【变体1】杀手特性 14「嘲讽战术」：等杀手自己选要弃的牌（还差几张） */
  pendingTraitDiscard?: number;
  /** 【变体1】感知命中后可以发动特性卡（10 即刻反应 / 15 谋杀意图 / 16 敏锐感知） */
  pendingSenseTraits?: boolean;
  /** 【变体1】特性 11「安静搜查」的询问（只发给本人）：要不要取消这次发现的响声 */
  pendingQuietSearch?: { playerId: string; from: 'suitcase' | 'discovery' } | null;
  /** 【变体1】17 压迫威慑：等杀手选 1 名幸存者惊吓（只发杀手） */
  pendingTraitVictim?: { killerId: string; traitId: string; level: number } | null;
  /** 【变体1】12 英勇阻截：问持有人要不要发动 / 逐个给其他幸存者选 1 格方向（只发持有人） */
  /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消这次遭遇（只发杀手） */
  pendingPreyOffer?: boolean;
  pendingHeroicBlock?: {
    holderId: string;
    started: boolean;
    queue: string[];
    moved: string[];
  } | null;
  soloKillerCharacterId: string | null;
  soloSurvivorCharacterIds: string[];
  phase: Phase;
  round: number;
  isHost: boolean;
  you: PublicPlayerView & { hand: string[]; skillUsedThisTurn: string[] };
  controllingActive: boolean;
  players: PublicPlayerView[];
  map: MapDef;
  playableMaps?: Array<{ id: string; name: string; backgrounds?: { survivor?: string; killer?: string } }>;
  rules: {
    keysNeeded: number;
    repairNeeded: number;
    survivorMoveRange: number;
    killerMoveRange: number;
    killerActionsPerTurn: number;
    fearMax?: number;
    enableFear?: boolean;
    killerPowerMax?: number;
    blockadeTokenMax?: number;
    killerHandMax?: number;
    maxSurvivors?: number;
  };
  characters: CharacterDef[];
  noises: string[];
  keysCollected: number;
  /**
   * **「分头行动」各人单独保管的钥匙数**（`playerId → 把数`）。
   * 只有幸存者视角有（找到钥匙不报告杀手）；显示在每个人的物品栏上方。
   */
  splitKeys?: Record<string, number>;
  repairProgress: number;
  rescueCountdown: number | null;
  rescueArmed: boolean;
  blockades: string[];
  killerPower: number;
  killerTurnPowerBonus?: number;
  killerPowerLabel?: string;
  evolutionEffects?: Array<{ level: number; text: string }>;
  pendingEvolutionAck?: { fromLevel: number; toLevel: number } | null;
  pendingWhizSearch?: boolean;
  pendingOverFearWound?: { targetId: string } | null;
  pendingBlockadeJob?: {
    kind: 'oneDoor' | 'sealAll' | 'anyDoors';
    roomId: string | null;
    need: number;
    removeLeft: number;
    placed: number;
    firstRoomId: string | null;
    secondRoomId?: string | null;
  } | null;
  removableBoardBlockades?: Array<{ id: string; from: string; to: string }>;
  /** 乔治还没被拿走的笔记（杀手视角为空） */
  georgeNotes?: Array<{ id: string; name: string }>;
  /** 3 张笔记的定义（图鉴用） */
  allGeorgeNotes?: Array<{ id: string; name: string; text: string }>;
  /** 等乔治挑笔记 */
  pendingGeorgeNote?: boolean;
  /** 局中是否有乔治 */
  georgeInPlay?: boolean;
  encounterOpenHold?: boolean;
  killerLevel: number;
  pendingKillerDiscards: number;
  /** 刚由进化入手、本次超员弃牌里不能弃的牌 */
  justUnlockedCards?: string[];
  pendingBlockade: boolean;
  pendingBlockadePlace?: string | null;
  relocatableBlockades?: Array<{ id: string; from: string; to: string }>;
  pendingSensePair?: { firstRoomId: string | null; secondRoomId?: string | null } | null;
  pendingSenseColor?: boolean;
  senseHighlight?: 'R' | 'B' | 'G' | null;
  pendingMoveRange?: number | null;
  pendingMoveMin?: number;
  pendingMoveTaken?: number;
  pendingLurkPick?: boolean;
  pendingAmulet?: {
    playerId: string;
    amount: number;
    sourceId: string;
    /** `'guard'` = 墓穴遗物守護之石（遭遇中的直接伤害也能挡、用了不弃置）；其他 = 古代护符 */
    relic?: 'guard' | null;
  } | null;
  repairedThisPhase?: boolean;
  firecrackerThisRound?: boolean;
  firecrackerRoomId?: string | null;
  suitcaseAvailable?: boolean;
  // —— 地图特殊规则（实验室 / 城堡）——
  /** 【实验室】G3 的急救箱标记是否还在 */
  firstAidKit?: boolean;
  /** 【实验室】急救箱所在房间（如 G3） */
  firstAidRoomId?: string;
  /** 【实验室】当前观众能不能用急救箱 */
  canUseFirstAidKit?: boolean;
  /** 【雕像・召唤石碑】正在选门（`from` = 已点的第一端，点同一格取消） */
  pendingStatueSeal?: boolean;
  pendingStatueSealFrom?: string | null;
  /** 【變形 / 戰鬥適應】等杀手从弃牌堆里选要永久移除的牌 */
  pendingDiscardRemove?: {
    remaining: number;
    cardName: string;
    options: Array<{ id: string; name: string }>;
  } | null;
  /**
   * **遭遇防御阶段能选的防御物品**（服务端下发，客户端不再自己维护清单）。
   * 一次防御只能选一件；骰子自动、「剛毅之盾」不占名额。
   */
  defenseItemChoices?: Array<{ id: string; name: string; hint: string }>;
  /** 【城堡】场上的机关大门门号（`"A|B"`；双方都看得到） */
  leverGateDoorId?: string | null;
  /** 【城堡】这道机关大门是谁操作控制杆放的（名字，双方都看得到） */
  leverGateOwnerName?: string | null;
  /** 【城堡】杀手过门要弃 3 张手牌，等他自选（只有杀手视角有） */
  pendingGatePay?: { toRoomId: string; doorId: string; cost: number; ownerName?: string | null } | null;
  /** 【城堡】当前观众能不能在 R1 放机关大门 */
  canPlaceLeverGate?: boolean;
  /** 【城堡】B4 的"第一次有人进入"是否已触发 */
  castleHallFirstEnterDone?: boolean;
  // —— 【墓穴】——
  /** 已经坍塌的地点（双方都看得到；塌了的地点视作不存在） */
  collapsedRooms?: string[];
  /**
   * 【墓穴】坍塌后「屋里的人轮流走一步」的当前状态。
   * `currentId` 有值 = 轮到你选目的地（`options` 是能去的相邻地点）；
   * `waiting` = 是别人在选，只能等。
   */
  pendingCollapseMoves?: {
    roomId: string;
    currentId: string | null;
    name: string;
    options: string[];
    mustMove: boolean;
    waiting: boolean;
    isKiller?: boolean;
  } | null;
  /**
   * 【墓穴】遗物室所在地点。
   *
   * ⚠ **这张图没有遗物室时是 `null`** —— 遗物室只有**墓穴的 R6**才有；
   * 别的图也有叫 R6 的房间，所以判断"能不能抽遗物"必须看这个字段，
   * 不能自己拿 `'R6'` 去比。
   */
  relicRoomId?: string | null;
  /** 【墓穴】遗物标记是否正面朝上（正面才能抽） */
  relicMarkerFaceUp?: boolean;
  /** 【墓穴】遗物牌堆剩几张 */
  relicDeckCount?: number;
  /** 【墓穴】当前观众能不能在遗物室抽遗物 */
  canDrawRelic?: boolean;
  /**
   * 【墓穴遗物】背包里的遗物（牌名，双方都看得到）。
   * 遗物**就是背包物品**（`items` 里的一格），客户端在装备卡那一排显示。
   */
  relics?: Array<{ id: string; name: string }>;
  /** 【墓穴遗物】鏡之門戶：现在能不能用 */
  canUseMirrorPortal?: boolean;
  /** 【墓穴遗物】鏡之門戶能传送到的 🌀 螺旋地点 */
  mirrorTargets?: string[];
  /** 【墓穴遗物】洞察之球：现在能不能用（**特殊行动**，在可搜索的地点依次摸两张牌） */
  canUseInsightOrb?: boolean;
  highlightRoomIds?: string[];
  encounterTailBonus?: number;
  yourDiscardPile: Array<{ id: string; name: string }>;
  pendingSurvivorPick?: boolean;
  pendingDiscoveryPick?: boolean;
  discoveryActorId?: string | null;
  pileCounts?: {
    search: number;
    discovery: number;
    treasure: number;
    relic: number;
    discard: number;
    killerDraw: number;
    killerDiscard: number;
  };
  pileCards?: {
    search: Array<{ id: string; name: string }>;
    discovery: Array<{ id: string; name: string }>;
    treasure: Array<{ id: string; name: string }>;
    relic: Array<{ id: string; name: string }>;
    discard: Array<{ id: string; name: string }>;
    killerDraw: Array<{ id: string; name: string }>;
    killerDiscard: Array<{ id: string; name: string }>;
  };
  pileTops?: {
    search: { id: string; name: string } | null;
    discovery: { id: string; name: string } | null;
    treasure: { id: string; name: string } | null;
    relic: { id: string; name: string } | null;
    discard: { id: string; name: string } | null;
    killerDraw: { id: string; name: string } | null;
    killerDiscard: { id: string; name: string } | null;
  };
  pendingItemDiscard: {
    playerId: string;
    count: number;
    name?: string;
    inventorySlots?: number;
    items?: Record<string, number>;
  } | null;
  pendingTrade?: {
    fromPlayerId: string;
    fromName: string;
    targetPlayerId: string;
    targetName: string;
    itemId: string;
    itemName: string;
    amount: number;
    receiveItemId?: string;
    receiveItemName?: string;
    /** 【分头行动】`'keys'` = 这笔是**给钥匙**（钥匙不在物品栏里，文案要分开写） */
    kind?: 'item' | 'keys';
  } | null;
  pendingCoopAction?: {
    fromControllerId: string;
    fromName: string;
    actorPlayerId: string;
    actorName: string;
    summary: string;
    youAreProposer: boolean;
    youMustConfirm: boolean;
  } | null;
  killerMainActionsLeft: number;
  killerUsedSlowThisTurn: boolean;
  killerTurnStep: KillerTurnStep;
  killerMainChoice: KillerMainChoice;
  lastDiscoveryCardId: string | null;
  discoveryOptions: string[];
  lastDiceRoll: DiceRoll | null;
  encounter: EncounterState | null;
  killerHandCount: number;
  killerDeckCount?: number;
  yourKillerHand: string[] | null;
  yourKillerLocked?: string[] | null;
  winner: 'killer' | 'survivors' | null;
  winReason: string | null;
  logs: Array<{
    t: number;
    text: string;
    vis?: 'all' | 'survivor' | 'killer';
    /** true = 幸存者回合期间对杀手也公开的共通信息 */
    needsCommon?: boolean;
  }>;
  pendingSenseColorPick?: 'R' | 'B' | 'G' | null;
  /**
   * 路径草稿。`owner` 决定**谁确认**：
   *  - `survivor` = 幸存者自己在走（凯莱布幸运币的〔移動〕）
   *  - 缺省 = 杀手牌在走
   */
  pendingPathDraft?: {
    min: number;
    max: number;
    rooms: string[];
    owner?: 'killer' | 'survivor';
    /** owner=survivor 时：这条草稿属于哪个幸存者 */
    actorId?: string;
  } | null;
  killerRepairGuess?: number;
  rematchReady?: string[];
  youRematchReady?: boolean;
  /** 是否开启【替换「鸿运当骰」等牌】 */
  replacementDeck?: boolean;
  /** 雕像杀手（killer6）：4 个雕像棋子的位置 / 主雕像 / 停滞 / 幸存者猜测 */
  isStatueKiller?: boolean;
  statues?: Array<{
    id: string;
    index: number;
    roomId: string | null;
    main: boolean;
    halted: boolean;
    /**
     * 幸存者猜测：猜这尊雕像的**操控者颜色槽位**（只有幸存者视角才有）。
     * 用槽位而非 id，`cursorColor(slot)` 直接取到和座位一致的颜色。
     */
    guesserSlots?: number[];
  }>;
  /** 杀手选了但还没确认的切换目标（只有杀手视角有） */
  pendingStatueSwitch?: string | null;
  /**
   * 雕像「巡邏 / 圍困」：等杀手选下一尊要移动/搜索的雕像。
   * `options` 只列能动的、还没选过的（被停滞的不出现）；`active` 非空 = 正在走。
   */
  pendingStatuePick?: {
    kind: 'move' | 'search';
    active: string | null;
    options: Array<{ id: string; index: number; roomId: string | null }>;
  } | null;
  /** 正在移动的雕像编号（1-4） */
  pendingStatueStepIndex?: number | null;
  /** 狼人宝藏：还没开的宝箱 id / 牌堆剩余张数 */
  treasureChests?: string[];
  treasureDeckCount?: number;
  isWerewolfKiller?: boolean;
  /**
   * 女猎手猎手陷阱：标记位置双方可见，
   * kind 只有杀手视角有值（幸存者永远是 null = 问号）。
   */
  hunterTraps?: Array<{
    id: string;
    roomId: string;
    removed: boolean;
    kind: string | null;
    revealed: boolean;
  }>;
  isHuntressKiller?: boolean;
  /**
   * 猎手本能：正在点地图选地点 / 已选待确认（只有杀手视角）。
   * 客户端据此在**快速阶段也让地图点击生效** —— 猎手本能是快速牌。
   */
  killerSenseRoomActive?: boolean;
  /**
   * 【保護色】持有这张进化卡牌 →「恐詭管道」可以潛行到**任何地点**
   * （不再是"带秘密通道的地点"）。用来把「或」选项的按钮文案写准。
   */
  passageStealthAnywhere?: boolean;
  pendingSenseRoom?: string | null;
  /**
   * **杀手打牌后拿到的信息**（感知看到了谁、追蹤距离、红外探测结果…）。
   * 客户端在行动区**单独**弹一块，确认后才继续；同一时刻只有一块。
   */
  /**
   * **杀手打牌后拿到的信息区**（地图右边那块，类似战报）——
   * 只放"打出卡牌获得的信息"（感知看到了谁、追蹤距离、红外探测结果…）。
   * 只有杀手视角有；每个杀手回合开始时清空。
   */
  killerIntel?: Array<{ title: string; lines: string[] }>;
  /**
   * **杀手当前打出的牌 id**（双方都下发）——
   * 幸存者在地图右边看到它的卡面，知道杀手这回合打了什么。
   */
  currentKillerCardId?: string | null;
  /** 追踪：等杀手选一名幸存者 */
  pendingTrackerPick?: boolean;
  /** 君臨天下：等杀手选一名目击者移动 */
  pendingMoveSurvivorPick?: string[];
  /** 杀手地图上的「目击立绘」位置（只有杀手视角有值） */
  witnessedAt?: Record<string, string>;
  /** 「或」牌：等杀手选一组效果 */
  pendingEffectChoice?: {
    options: Array<Array<{ op: string; value?: unknown; min?: number }>>;
  } | null;
  /** 【超听觉】多路径选择 */
  pendingMoveChoices?: Array<{
    label: string;
    rooms: Array<{ id: string; name: string }>;
  }> | null;
  /** 雕像进化 1 级：等杀手决定是否转换主雕像 */
  pendingStatueEvoSwitch?: boolean;
  /** 已经点了、但还没确认的那尊雕像（选择要确认，点完不会立刻切换） */
  pendingStatueEvoTarget?: string | null;
  /** 雕像「重整旗鼓」：卡牌效果允许切换主雕像 */
  pendingStatueRally?: boolean;
  /** 这次重整旗鼓的切换机会是否已用掉 */
  pendingStatueRallySwitched?: boolean;
  /** 2对3：两名杀手的先后手偏好是否已一致 */
  killerOrderDecided?: boolean;
  /** 2对3：本轮的先后手顺序（两个杀手棋子 id） */
  killerTurnOrder?: string[];
  /** 2对3：这一轮轮到第几个杀手（0=先手，1=后手） */
  killerTurnIndex?: number;
  /** 2对3：本局所有杀手棋子 id */
  killerIds?: string[];
  /** 2对3：【查看另一名杀手界面】的只读信息 */
  otherKiller?: {
    id: string;
    name: string;
    characterName: string;
    power: number;
    level: number;
    hand: Array<{ id: string; name: string }>;
    deckCount: number;
    discard: Array<{ id: string; name: string }>;
    locked: Array<{ id: string; name: string }>;
    repairGuess: number;
    isActing: boolean;
    evolutionEffects: Array<{ level: number; text: string }>;
  } | null;
  /** 雕像：开局准备是否已选定主雕像（选定后本局不能改） */
  statueMainLocked?: boolean;
  /** 未命名：已获得 / 待选的进化卡牌 */
  chosenEvolutionCards?: Array<{ id: string; name: string; text: string }>;
  pendingEvolutionCardPick?: Array<{ id: string; name: string; text: string }> | null;
  /** 解锁二选一（刺耳噪声 / 酸液喷吐） */
  pendingUnlockChoice?: Array<{ id: string; name: string; text: string }> | null;
  /** 未命名：永久移除的卡牌 */
  killerRemovedPermanently?: string[];
  /** 等玩家点门封堵：地点 + 还差几扇 */
  pendingBlockadeRoom?: string | null;
  pendingBlockadeRemaining?: number;
  /** 核心标记满 5 个时：正准备放到哪个地点（等玩家选移除哪个） */
  pendingCoreOverflowPlaceAt?: string | null;

  // —— 女王（killer9）：僵尸 & 中毒 ——
  isQueenKiller?: boolean;
  zombies?: Array<{ id: string; roomId: string; art: number; power: number }>;
  zombiePower?: number;
  zombieMax?: number;
  poisoned?: string[];
  canUseCrossbow?: boolean;
  pendingCrossbow?: { zombieIds: string[]; max: number } | null;
  pendingQueenMove?: { toRoomId: string; zombieCount: number } | null;
  pendingZombieSearch?: string[] | null;
  pendingZombieHordeFrom?: string[] | null;
  pendingZombieHordeTo?: string | null;
  pendingZombieSacrifice?: string[] | null;
  /** 女王等级 4：已选的生成地点 */
  pendingQueenSpawnRooms?: string[] | null;
  /** 扼杀者进化 4 级：已点选的地点 */
  pendingStranglerCoreRooms?: string[] | null;
  /** 乔治「拆封堵」笔记：玩家正在选要拆哪几个 */
  pendingGeorgeBlockade?: {
    noteId: string;
    doors: string[];
    picked: string[];
  } | null;
  /** 女王对局：十字弩持有者（进入游戏后指定） */
  crossbowHolderId?: string | null;
  crossbowAssigned?: boolean;
  /** 能否去指定十字弩持有者 */
  canPickCrossbowHolder?: boolean;
  /** 【解散房间】正在等确认：谁发起的、谁确认了、还差谁 */
  disband?: {
    requestedBy: string;
    requestedByName: string;
    confirmed: string[];
    waiting: string[];
    /** 自己确认过没有 */
    youConfirmed: boolean;
  } | null;
  /** 房间已经解散：收到之后直接退回主界面 */
  disbanded?: boolean;
  /** 观看者不能点【解散房间】 */
  canRequestDisband?: boolean;
  /**
   * 【重新开始】正在等确认（和解散同一套；确认完**不解散房间**，回大厅重开）。
   */
  restart?: {
    requestedBy: string;
    requestedByName: string;
    confirmed: string[];
    waiting: string[];
    /** 自己确认过没有 */
    youConfirmed: boolean;
  } | null;
  /** 观看者不能点【重新开始】；大厅/选人阶段也不显示 */
  canRequestRestart?: boolean;
  /** 迪伦·温「坚毅」：等玩家决定是否用坚毅标记 */
  pendingResilience?: { playerId: string; amount: number } | null;
  /** 鼓励标记持有者（**只给幸存者**） */
  encouragedIds?: string[];
  /** 凯莱布幸运币：本回合是否已用 */
  luckyCoinUsedThisTurn?: boolean;
  /** 当前地点是不是锤子 / 螺旋标记地点 */
  isHammerRoomHere?: boolean;
  isSpiralRoomHere?: boolean;
  /** 这名观看者现在能不能在自己地点搜索（含神秘狂热粉的螺旋地点） */
  canSearchHere?: boolean;
  /** 欧菲莉亚「第六感」：待选的 2 张牌 */
  pendingSixthSense?: { cards: Array<{ id: string; name: string }> } | null;
  /** 扼杀者：地图上的核心标记（双方同步显示） */
  coreMarkers?: string[];
  /** 幸存者能否移除自己地点的核心标记 */
  canRemoveCoreMarker?: boolean;
  isStranglerKiller?: boolean;
  /** 等杀手点地点（放/移核心标记、传送、酸液、恐詭管道） */
  pendingCorePick?: string | null;
  pendingCoreRooms?: string[];
  pendingCoreNeighbors?: string[];
  pendingTeleportPick?: string[];
  pendingPassagePick?: string[];
  pendingAcidPick?: boolean;
  pendingReturnToDeckTop?: boolean;
  /** 可选效果（牌面写了「可以」）：等杀手决定执行或跳过 */
  pendingOptionalEffect?: { label: string } | null;
  /** 刺耳噪声：待决定是否放牌库顶的那张牌 */
  pendingDeckTopCard?: { id: string; name: string } | null;
  /** 女猎手放置陷阱进度（只有杀手视角有） */
  trapPlacement?: {
    kind: 'bear' | 'bone' | 'net' | null;
    done: boolean;
    placed: Record<string, 'bear' | 'bone' | 'net'>;
    remaining: { bear: number; bone: number; net: number };
    allPlaced: boolean;
    /** true = 开局布置（只能放常规搜索位/修理位）；false = 陷阱重置（任选） */
    restricted?: boolean;
    /** 开局布置时合法的地点；陷阱重置时为 null */
    allowedRooms?: string[] | null;
  } | null;
  /** 可以放陷阱的位置标记 */
  trapMarkers?: Array<{ id: string; roomId: string }>;
  /** 【陷阱零件】使用后留下标记的地点（只有幸存者看得到） */
  trapPartRooms?: string[];
  /** 遭遇防御掷完骰、等决定是否用「鸿运当骰」重掷 */
  pendingDice?: { playerId: string; values: number[]; attack: number; extra: number } | null;
  allKillerCards?: Array<{ id: string; name: string; locked: boolean }>;
  survivorActionsDone?: boolean;
  activePlayerId: string | null;
  legalMoves: string[];
  cardById: Record<string, CardDef>;
  trapRoomIds?: string[];
  stealthOriginRoomId?: string | null;
  turnOrder?: string[];
}

export type ClientAction =
  | { type: 'setName'; name: string }
  | { type: 'setMode'; mode: GameMode }
  /** 「分头行动」开关（房主在大厅勾；只在 1对3 / 2对3 下有效） */
  | { type: 'setSplit'; split: boolean }
  /** 【变体1】特性卡开关（所有模式都能开，房主在大厅勾） */
  | { type: 'setVariant1'; on: boolean }
  /** 【变体1】生存难度等级（房主选；开了变体1 才有意义） */
  | { type: 'setTraitDifficulty'; difficulty: 'easy' | 'normal' | 'hard' | 'nightmare' }
  /** 【变体1】选特性卡（开局弹窗里确认；`traitIds` 张数必须正好等于要选的张数） */
  | { type: 'pickTrait'; playerId?: string; traitIds: string[] }
  /** 【变体1】发动特性卡（行动型：特殊行动 / 额外行动），参数按卡面需要传 */
  | {
      type: 'useTrait';
      traitId: string;
      /** 谁发动（单人模式一个操控者管多名幸存者时必须传） */
      actorPlayerId?: string;
      toRoomId?: string;
      steps?: number;
      targetPlayerId?: string;
      moves?: Array<{ playerId: string; toRoomId: string; steps?: number }>;
      choice?: 'removeBlockade' | 'clearFear' | 'noise';
      doorId?: string;
      /** 【变体1】杀手特性"弃 N 张卡牌来…"的代价（弃哪几张由杀手自己点手牌选） */
      payCardIds?: string[];
      /** 【变体1】12 英勇阻截这类"要不要发动"的询问：`true` = 不发动 */
      decline?: boolean;
    }
  /** 【变体1】杀手特性 14「嘲讽战术」：杀手自选要弃掉的 3 张牌 */
  | { type: 'resolveTraitDiscard'; cardIds: string[] }
  /** 【变体1】特性 11「安静搜查」的答复：取消这次发现的响声 / 让它照响 */
  | { type: 'resolveQuietSearch'; use: boolean }
  | { type: 'setMap'; mapId: string }
  /** 房主开关【替换「鸿运当骰」等牌】 */
  | { type: 'setReplacementDeck'; on: boolean }
  | { type: 'setSoloKiller'; characterId: string }
  | { type: 'setSoloSurvivor'; characterId: string }
  | { type: 'setFaction'; faction: 'killer' | 'survivor' | 'spectator' }
  /** 【解散房间】除观众外谁都能点；其他人确认后房间解散、大家回主界面 */
  | { type: 'requestDisband' }
  | { type: 'confirmDisband' }
  | { type: 'cancelDisband' }
  /** 【重新开始】：和解散同一套投票确认，但**不解散房间**，回大厅重开 */
  | { type: 'requestRestart' }
  | { type: 'confirmRestart' }
  | { type: 'cancelRestart' }
  /** 【快进】（只有单人热座）—— 幸存者：剩下的人消除恐惧 → 发现阶段；杀手：原地搜索两次后结束回合 */
  | { type: 'fastForward' }
  /** 【实验室 G3】用急救箱治疗同地点一人并清空其恐惧（一次性） */
  | { type: 'useFirstAidKit'; targetPlayerId?: string }
  /**
   * 【城堡 R1】把机关大门放到一扇门上（额外行动）。
   * `actorPlayerId` = 是哪名幸存者操作的控制杆 —— 共享控制模式下
   * 必须带上，否则会记到"当前行动者"头上、然后报「你不在 R1」。
   */
  | { type: 'placeLeverGate'; fromRoomId: string; toRoomId: string; actorPlayerId?: string }
  /** 【城堡】杀手弃 3 张手牌通过机关大门并拆除它 */
  | { type: 'confirmGatePay'; cardIds?: string[] }
  /** 【城堡】放弃通过机关大门 */
  | { type: 'cancelGatePay' }
  /** 【墓穴】坍塌后屋里的人轮流走一步离开 */
  | { type: 'collapseMove'; toRoomId?: string | null }
  /**
   * 【墓穴 R6】花额外行动抽 1 张遗物。
   * `actorPlayerId` = 是哪名幸存者抽（和宝箱 `openChest` 同一套写法）——
   * 弹窗是按每个人列按钮的，不带就会记到"当前行动者"头上。
   */
  | { type: 'drawRelic'; actorPlayerId?: string }
  /** 【墓穴遗物】鏡之門戶：额外行动传送到 🌀 螺旋地点 */
  | { type: 'useMirrorPortal'; toRoomId?: string }
  /** 【墓穴遗物】洞察之球：特殊行动，本回合再搜一次 */
  | { type: 'useInsightOrb' }
  /** 【雕像・召唤石碑】点一个地点选门（两段式） */
  | { type: 'pickSummonSealRoom'; roomId: string }
  /**
   * 雕像「巡邏 / 圍困」：**选下一尊要移动/搜索的雕像**
   * （顺序由杀手自己选；移动段和搜索段各选各的）。
   */
  | { type: 'pickStatueStep'; statueId: string }
  /** 【恐詭管道】点一个有秘密通道的地点作为潜行落点 */
  | { type: 'pickPassageRoom'; roomId: string }
  /** 【女猎手】重置陷阱放置（确认之前可以重选） */
  | { type: 'resetTrapPlacement' }
  /** 【變形 / 戰鬥適應】从弃牌堆里选一张永久移除的牌 */
  | { type: 'pickDiscardRemove'; cardId: string }
  /** 2对3：一名杀手选先后手偏好（两人一致才生效） */
  | { type: 'pickKillerOrder'; order: 'first' | 'second' }
  | { type: 'selectCharacter'; characterId: string }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startGame' }
  | { type: 'pickSurvivorTurn'; playerId: string }
  /** 把杀手牌的路径草稿清回起点 */
  | { type: 'resetPathDraft' }
  /** 君臨天下：从目击到的幸存者里选一名来移动 */
  | { type: 'pickMoveSurvivor'; targetPlayerId: string }
  | { type: 'move'; toRoomId: string }
  | { type: 'search' }
  | { type: 'repair' }
  /** 乔治·聪明绝顶：弃工具箱换 +1 修理进度 */
  | { type: 'georgeToolboxRepair'; actorPlayerId?: string }
  /** 乔治·聪明绝顶：从搜索牌库抽一张 */
  | { type: 'georgeDraw'; actorPlayerId?: string }
  /** 用一张笔记（额外行动）：响声那张要带 toRoomId */
  | { type: 'useNote'; noteId: string; toRoomId?: string; actorPlayerId?: string }
  /** 乔治「拆封堵」笔记：点选/取消一个要拆的封堵 */
  | { type: 'pickNoteBlockade'; doorId: string }
  /** 乔治「拆封堵」笔记：确认拆除已选的封堵 */
  | { type: 'confirmNoteBlockade' }
  /** 思维敏捷：挑一张笔记（null = 放弃） */
  | { type: 'chooseGeorgeNote'; noteId: string | null }
  /** 遭遇防御：用「鸿运当骰」重掷选中的骰子 / 接受当前结果 */
  | { type: 'rerollEncounterDice'; diceIndexes: number[] }
  | { type: 'resolveEncounterDice' }
  /** 雕像：选/确认/取消切换主雕像 */
  | { type: 'pickMainStatue'; statueId: string }
  | { type: 'confirmMainStatue' }
  | { type: 'cancelMainStatue' }
  /** 雕像：重整旗鼓移动封堵 */
  | { type: 'pickMoveBlockade'; doorId: string }
  | { type: 'placeMovedBlockade'; toDoorId: string }
  /** 幸存者：停滞一个雕像（本大回合该雕像不能移动/搜索） */
  | { type: 'haltStatue'; statueId: string; actorPlayerId?: string }
  /** 幸存者：双击雕像猜它是主雕像 */
  | { type: 'guessMainStatue'; statueId: string; actorPlayerId?: string }
  /** 狼人：开自己地点的一个宝箱 */
  | { type: 'openChest'; chestId: string; actorPlayerId?: string }
  /** 女猎手：猎手本能 —— 行动区确认要感知的地点 */
  | { type: 'confirmSenseRoom' }
  /** 女猎手：追踪 —— 选一名幸存者展示距离 */
  | { type: 'pickTrackerTarget'; targetPlayerId: string }
  /** 「或」牌：打出时选一组效果 */
  | { type: 'chooseEffectOption'; optionIndex: number }
  /** 【超听觉】多条最快路径时选一条 */
  | { type: 'chooseMovePath'; pathIndex: number }
  /** 雕像进化 1 级：升级时切换主雕像（或不切） */
  | { type: 'pickStatueEvoSwitch'; statueId: string }
  | { type: 'skipStatueEvoSwitch' }
  /** 未命名：升级时选一张进化卡牌 */
  | { type: 'pickEvolutionCard'; cardId: string }
  /** 解锁二选一：挑一张入手 */
  | { type: 'pickUnlockChoice'; cardId: string }
  /** 扼杀者规则：幸存者移除自己地点的一个核心标记（一般行动·特殊行动） */
  | { type: 'removeCoreMarker'; actorPlayerId?: string }
  /** 扼杀者：放核心标记 / 在带核心标记的地点封堵 / 传送 / 移动核心标记 */
  | { type: 'placeCoreMarker'; roomId: string }
  | { type: 'blockadeAtCore'; roomId: string }
  | { type: 'teleportToCore'; roomId: string }
  | { type: 'moveCoreMarker'; roomId: string }
  /** 未命名：酸液喷吐 —— 选一个相邻地点 */
  | { type: 'sprayAcid'; roomId: string }
  // —— 女王（killer9）——
  | { type: 'confirmQueenMove'; count?: number; cancel?: boolean }
  | { type: 'pickZombieSearch'; zombieId: string }
  | { type: 'pickZombieHorde'; roomId: string }
  | { type: 'pickZombieSacrifice'; zombieId: string }
  | { type: 'useCrossbow' }
  | { type: 'confirmCrossbow'; zombieIds: string[] }
  | { type: 'pickQueenSpawnRoom'; roomId: string }
  /** 扼杀者进化 4 级：点 2 个不同地点各放一个核心标记 */
  | { type: 'pickStranglerCoreRoom'; roomId: string }
  /** 女王对局：进入游戏后指定十字弩持有者 */
  | { type: 'pickCrossbowHolder'; holderId: string }
  /** 迪伦·温「坚毅」：用坚毅标记挡掉这次伤害（或不用） */
  | { type: 'confirmResilience'; use: boolean }
  /** 欧菲莉亚「言语鼓励」 */
  | { type: 'useEncourage'; targetPlayerId?: string; actorPlayerId?: string }
  /** 凯莱布「幸运币」 */
  | { type: 'useLuckyCoin'; actorPlayerId?: string }
  /** 迪伦「机械知识」 */
  | { type: 'useMechanicalKnack'; actorPlayerId?: string }
  /** 欧菲莉亚「第六感」：选 1 张留下 */
  | { type: 'resolveSixthSense'; cardId: string }
  /** 刺耳噪声：选择是否把这张牌背面向上放到摸牌堆顶 */
  | { type: 'resolveDeckTop'; toDeckTop: boolean }
  /** 可选效果（牌面写了「可以」）：执行还是跳过 */
  | { type: 'resolveOptionalEffect'; use: boolean }
  /** 女猎手：选陷阱类型 / 放到某位置 / 确认 */
  | { type: 'pickTrapKind'; kind: 'bear' | 'bone' | 'net' }
  | { type: 'placeHunterTrap'; tokenId: string }
  | { type: 'confirmTrapPlacement' }
  /** 开局准备：雕像选定主雕像（选定后本局锁定） */
  | { type: 'chooseMainStatue'; statueId: string }
  | { type: 'clearFear' }
  | { type: 'removeBlockade' }
  | { type: 'tradeItem'; targetPlayerId: string; itemId: string; amount?: number; receiveItemId?: string; fromPlayerId?: string }
  | { type: 'respondTrade'; accept: boolean }
  /** 【分头行动】给钥匙（额外行动；同一地点，对方确认） */
  | { type: 'tradeKeys'; targetPlayerId: string; amount: number; fromPlayerId?: string }
  /** 【分头行动】从同地遗留物（**被杀**的幸存者）身上拿钥匙或物品（额外行动，不需要对方确认） */
  | { type: 'lootFrom'; fromPlayerId: string; itemId?: string; amount?: number; actorPlayerId?: string }
  /** 【分头行动】开局前选定本大回合的先手 */
  | { type: 'pickSplitFirst'; playerId: string }
  | { type: 'respondCoopAction'; accept: boolean }
  | { type: 'discardItem'; itemId: string }
  | {
      type: 'useSkill';
      skillId: string;
      targetPlayerId?: string;
      toRoomId?: string;
      /**
       * 一步一步点出来的完整路径（含起点）。
       * 目前用于威廉「短跑冲刺」—— 必须刚好 3 步。
       */
      path?: string[];
      itemId?: string;
      actorPlayerId?: string;
    }
  | { type: 'useItem'; itemId: string; targetPlayerId?: string; toRoomId?: string; actorPlayerId?: string }
  | { type: 'useSuitcase'; actorPlayerId?: string }
  | { type: 'playKillerCard'; cardId: string; toRoomId?: string; payCardIds?: string[] }
  | { type: 'finishPendingMove' }
  | { type: 'chooseSenseColor'; color: 'R' | 'B' | 'G' }
  | { type: 'chooseLurkTarget'; targetPlayerId: string }
  | { type: 'confirmAmulet'; use: boolean }
  | { type: 'discardKillerCard'; cardId: string }
  | { type: 'advanceKillerStep' }
  | { type: 'chooseKillerMain'; choice: 'actions' }
  | { type: 'endTurn' }
  | { type: 'acknowledgeNoise' }
  | { type: 'acknowledgeDiscovery' }
  | { type: 'chooseDiscovery'; cardId: string }
  | { type: 'playEncounterAttack'; cardId: string | null; boost?: boolean; payCardIds?: string[] }
  | {
      type: 'playEncounterDefense';
      cardId: string | null;
      itemId?: string | null;
      /** **剛毅之盾**：不占"一次只能选一件"的名额，所以单独一个开关 */
      shield?: boolean;
    }
  | {
      type: 'encounterFlee';
      moveToRoomId: string | null;
      /** 【变体1】特性 09「生存本能」：撤离走 2 格（走完清空自己的恐惧） */
      fleeSteps?: 1 | 2;
    }
  | { type: 'pickEncounterTarget'; targetPlayerId: string }
  | { type: 'relocateBlockade'; fromDoorId: string }
  | { type: 'removeBoardBlockade'; doorId: string }
  | { type: 'ackEvolution' }
  | { type: 'confirmWhizSearch'; payCardIds: string[] }
  | { type: 'skipWhizSearch' }
  | { type: 'confirmOverFearWound'; payCardIds: string[] }
  | { type: 'skipOverFearWound' }
  | { type: 'confirmEvoBlockade' }
  | { type: 'finishSurvivorPhase' }
  | { type: 'confirmSense' }
  | { type: 'setKillerRepairGuess'; value: number }
  | { type: 'rematchReady' };
