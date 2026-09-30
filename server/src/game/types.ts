/**
 * 服务器心里的“棋盘长什么样”。
 * GameState = 整桌的秘密真相；PublicSnapshot = 发给某个人看的删节版。
 */
import type { CardDef, CharacterDef, EffectDef, MapDef, RulesDef, TraitDef } from '../content/schema.js';

/** 现在棋局走到哪一页：大厅、选角、幸存者、发现、噪音、杀手、遭遇、结束 */
export type Phase =
  | 'lobby'
  | 'characterSelect'
  /**
   * 开局准备步骤：女猎手先布好 4 个猎手陷阱，才进入第 1 回合。
   * 这是**游戏开始时的准备动作**，不属于杀手的第一个回合。
   */
  | 'trapSetup'
  /**
   * 开局准备：雕像杀手先选主雕像（选完锁定，本局不能再改）。
   */
  | 'statueSetup'
  /** 开局准备：女王局由幸存者指定谁拿十字弩 */
  | 'crossbowSetup'
  | 'survivorMain'
  | 'discovery'
  | 'noiseReport'
  | 'killerMain'
  | 'encounter'
  | 'upkeep'
  /**
   * 【变体1】开局前选特性卡：**所有人都选完才真正开始第 1 回合**。
   */
  | 'traitDraft'
  | 'gameOver';

export type Faction = 'killer' | 'survivor' | 'spectator';

/**
 * 【变体1】生存难度等级。
 *
 * 幸存者侧四档**完全一样**（每人抽 2 选 1）；差别在杀手侧：
 * `easy` 不抽 / `normal` 2选1 / `hard` 4选2 / `nightmare` 6选3。
 */
export type TraitDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare';
/**
 * solo=一个人热座，duo=1对1，vs2=1对2两人共控幸存者，multi=1对3各控自己，
 * 2v3=2 名杀手 vs 3 名幸存者（界面显示「2对3」）。
 */
export type GameMode = 'solo' | 'duo' | 'vs2' | 'multi' | '2v3';

/**
 * 「**分头行动**」：1对3 / 2对3 的一个**规则开关**（不是新的 mode 值）。
 *
 * ⚠ 为什么不加 `mode: 'split1v3'` 之类的新值：`state.mode === 'multi' / '2v3'`
 * 的判断遍布引擎（座位、快照、界面），加新值等于到处漏改。
 * 做成开关后，**只有"分头行动特有的规则"才看 `state.split`**，其余一律照旧。
 *
 * 这个模式的核心（用户原话）：
 *  - 杀手杀死幸存者**不结束游戏**，要所有幸存者都逃脱或被杀才结束；
 *  - 钥匙单独保管、不报告杀手、各自结算胜利。
 */
export type SplitMode = boolean;

/** 遭遇四步：选人 → 杀手进攻 → 幸存者加防 →（旧规则留下的逃离，当前几乎不用） */
/** 遭遇：选人 → 杀手是否加攻 → 幸存者是否加防 → 被发现的人可移动 1 格 */
export type EncounterStep = 'pick' | 'attack' | 'defend' | 'flee';
/** 杀手回合三阶段：快速牌 → 主要行动 → 慢速牌 */
export type KillerTurnStep = 'fast' | 'main' | 'slow';
/** 第三阶段二选一：2 次走路/搜索，或 1 张特殊牌 */
export type KillerMainChoice = 'actions' | 'special' | null;

/** 2v3：一名杀手选的先后手偏好 */
export type KillerOrderPick = 'first' | 'second' | null;

/**
 * 2v3 专用：**每个杀手各自**的那一份状态。
 *
 * 现在 1 杀手模式里这些字段直接挂在 `GameState` 顶层（`killerHand` 等）。
 * 2v3 有两个杀手，各有一套牌库/手牌/弃牌堆/力量/行动区，所以这里存一份权威副本；
 * 行动中的那个杀手的切片会镜像到 `GameState` 顶层字段，
 * 让既有的 500 多处代码不用逐个改（见 `syncActiveKiller`）。
 */
export interface KillerState {
  /** 这个切片属于哪个杀手棋子 */
  killerId: string;
  hand: string[];
  deck: string[];
  discard: string[];
  locked: string[];
  power: number;
  /** 本回合临时力量（疯狂 +2、谋杀者重现 +3 等） */
  turnPowerBonus: number;
  mainActionsLeft: number;
  usedSlowThisTurn: boolean;
  turnStep: KillerTurnStep;
  mainChoice: KillerMainChoice;
  /** 进化发锁定牌导致手牌超员 */
  pendingDiscards: number;
  pendingUnlockDiscard: boolean;
  justUnlockedCards: string[];
  /** 自己猜的修理进度 0–5（和真实进度无关，两个杀手各猜各的） */
  repairGuess: number;
  /** 这个杀手被允许看到的钥匙数（大回合结束才更新） */
  publicKeys: number;
  /** 本回合是否遭遇过幸存者（女王 1 级 / 狼人 4 级用） */
  encounteredThisTurn: boolean;
  /**
   * 本回合是否**移动通过了秘密通道**（`map.passages`）——**按杀手隔离**。
   *
   * 未命名「保護色」（通过秘密通道 +3）与【伏擊】的条件都看它；
   * 2对3 里放全局会让另一名杀手走过秘密通道替未命名满足条件（张冠李戴）。
   */
  movedThroughPassage: boolean;
  /**
   * **「持续到本回合结束」的力量**（疯狂 / 保護色「通过秘密通道 +3」/ 屏息）。
   *
   * ⚠ 必须**按杀手隔离**：2对3 里放全局的话，甲打【屏息】乙会白拿 +3，
   * 而且乙的回合收尾会把甲的屏息一起清掉（用户问的"屏息被清除"）。
   */
  turnLingering: number;
  /** 屏息等「到你的下回合结束」的力量：下回合开始时重新挂上的量 */
  carryPower: number;
  /** 本回合是不是「带上来的」那一回合（是就该在回合末清掉） */
  carryPowerActive: boolean;
  /** 只对**下一次攻击**有效的力量（保護色重现 +3 等），用掉就清 */
  pendingAttackPower: number;
  /** 保護色「重现时 +3」的意向：重现后那次搜索若遭遇才兑现，否则回合末作废 */
  pendingRevealPower: number;
  /** 离场（被打倒/永退）——2v3 里一个杀手出局不影响另一个 */
  out: boolean;
}

/** 一颗棋子的完整状态（只有服务器自己拿着） */
export interface PlayerState {
  id: string;
  name: string;
  /** 操控者进房时的昵称，重连认座位用；和棋子角色名分开 */
  controllerName: string;
  controllerId: string;
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
  hand: string[];
  items: Record<string, number>;
  /**
   * **「分头行动」里这名幸存者单独保管的钥匙数**
   * （不进物品栏、不占物品格、**没有上限**）。
   *
   * ⚠ 只在 `state.split` 下使用；其余模式钥匙还是上钥匙架（`state.keysCollected`）。
   * ⚠ 对**杀手隐藏**（用户要求：找到钥匙不需要报告杀手），但仍会发出响声。
   */
  keys?: number;
  /**
   * 【分头行动】**已经单独逃脱**（不是被杀）。
   *
   * 逃脱 = 大回合开始时站在出口且条件达标 → **立刻离开，不花行动**。
   * 逃脱者同样 `alive = false`（不在场上、不能再操作），
   * 但地图上要留一个**变暗的立绘**（双方都看得到真实位置），
   * 而且他身上**多余的钥匙留在原地**，同地点的人可以拿（见 `checkSplitEscapes`）。
   */
  escaped?: boolean;
  alive: boolean;
  stealth: boolean;
  stealthOriginRoomId: string | null;
  moveLeft: number;
  actionsLeft: number;
  mainActionUsed: boolean;
  searchedThisTurn: boolean;
  repairedThisTurn: boolean;
  skillUsedThisTurn: Set<string>;
  quietSearch: boolean;
  attackBonus: number;
  moveBonus: number;
  actedThisRound: boolean;
  /** 2v3：这名杀手选的先后手偏好（两人一致才生效） */
  orderPick?: KillerOrderPick;
  /**
   * 雕像专用（雕像杀手有 4 个棋子，各有各的位置）：
   * 1–4 表示这是第几号雕像；其他角色为 null。
   * 立绘：1、2 放主要出口，3、4 放隐藏出口。
   */
  statueIndex: number | null;
  /** 本大回合这个雕像是否被幸存者停滞（停滞则移动/搜索前取消） */
  statueHalted: boolean;
  /**
   * 迪伦·温（survivor9）「坚毅」：开局有一个**坚毅标记**。
   * 移除该标记可以**防止第一次伤害**（和古代护符同类的免伤机制）。
   */
  resilienceToken?: boolean;
  /**
   * 欧菲莉亚「言语鼓励」给的**鼓励标记**。
   * 每个幸存者**至多一个**；放在装备卡的人物格上。
   * 满足条件**必须自动使用**，用掉后弃置；杀手看不到谁有。
   */
  encourageToken?: boolean;
  /**
   * 凯莱布「幸运币」：本回合是否用过（额外行动，可反复用）
   */
  luckyCoinUsedThisTurn?: boolean;
  /** 扼杀者：本大回合是否已移除过自己地点的核心标记 */
  coreRemovedThisRound?: boolean;
  /** **本大回合**是否用过额外行动 / 交换过物品（雕像「停滞」的前置条件） */
  extraActionUsedThisTurn?: boolean;
  tradedThisTurn?: boolean;
  /** 本大回合是否已停滞（停滞会拦住额外行动） */
  haltedThisRound?: boolean;
  /** 迪伦「机械知识」（额外行动）：本大回合是否已经用过 */
  mechanicalKnackUsedThisTurn?: boolean;
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
  stealth: boolean;
  moveLeft: number;
  actionsLeft: number;
  mainActionUsed: boolean;
  actedThisRound?: boolean;
  /** 本大回合是否做过额外行动（额外行动不受小回合限制，谁都能做） */
  extraActionUsedThisTurn?: boolean;
  /** 本大回合是否执行过停滞（停滞过就不能再做额外行动） */
  haltedThisRound?: boolean;
  /** 迪伦「机械知识」本大回合用没用过 */
  mechanicalKnackUsedThisTurn?: boolean;
  /** 鼓励标记（画在装备卡的人物身体上；杀手看不到） */
  hasEncourageToken?: boolean;
  /** 坚毅标记（画在装备卡的人物身体上；杀手看不到） */
  hasResilienceToken?: boolean;
  /** 2对3：这名杀手选的先后手偏好（两人一致才生效） */
  orderPick?: KillerOrderPick;
  /**
   * 雕像杀手：这是第几号雕像（1–4）。
   * 右键菜单靠它把雕像**逐尊**列出来，并把原始杀手棋子排除掉。
   */
  statueIndex?: number | null;
  /**
   * 【变体1】他身上已选的**特性卡 id**（按视角过滤过）：
   *  - 杀手特性：**双方都能看到**（用户规则：杀手选的特性要给幸存者展示）；
   *  - 幸存者特性：**只有幸存者视角能看到**（同伴互相可见，杀手看不到）。
   */
  traits?: string[];
}

/**
 * all=两边都看；survivor=只有幸存者（**幸存者大回合结束后会进入公开战报历史**）；
 * killer=只有杀手（潜行中的走路等）；
 * survivorSecret=只有幸存者，且**永远不对杀手开放**（例：【陷阱零件】放置陷阱）。
 */
export type LogVis = 'all' | 'survivor' | 'killer' | 'survivorSecret';

export interface LogEntry {
  t: number;
  text: string;
  vis?: LogVis;
  /**
   * true = 幸存者大回合期间也对杀手可见的「共通信息」。
   * 幸存者层日志只有这一类能在幸存者回合透给杀手：
   * 哪里响了、谁消除恐惧、谁被治疗、钥匙上架、修理刚好完成、哪扇封堵被处理、
   * 阶段与胜负、骰点结论、遭遇。其余（搜索到什么、谁走到哪、谁用了什么牌、
   * 发现翻牌与留牌）一律只能等该大回合结束后才随战报历史开放。
   */
  needsCommon?: boolean;
}

export type StealthRevealKind = 'vanishScare' | 'lurkPick' | 'bloomKill';

export interface PendingAmulet {
  playerId: string;
  amount: number;
  sourceId: string;
  /**
   * 这次问的是哪一张免伤牌：
   *  - `'guard'` = 墓穴遗物**守護之石**（连遭遇中的直接伤害也能挡，用了不弃牌）
   *  - `null` / 省略 = **古代护符**（只在非遭遇时问，用了进弃牌堆）
   */
  relic?: 'guard' | null;
}

export interface DiceRoll {
  id: number;
  values: number[];
  total: number;
  attack: number;
  success: boolean;
  survivorName: string;
  /** true = 这次是重掷后的结果 */
  rerolled?: boolean;
}

/** 等幸存者决定要不要用「鸿运当骰」重掷（重掷完才结算战斗） */
export interface PendingDice {
  playerId: string;
  values: number[];
  attack: number;
  /** 还能重掷几次（鸿运当骰每张给 1 次） */
  extra: number;
}

export interface EncounterState {
  roomId: string;
  step: EncounterStep;
  targetId: string | null;
  attackCardId: string | null;
  /** 杀手是否打出了卡牌加攻（对当前这一次攻击有效） */
  attackBoost: boolean;
  /** 杀手是否已经为当前这一次攻击做过加攻选择（打牌或不加） */
  attackChoiceMade: boolean;
  /** 本场遭遇是否已经结算过至少一次攻击 */
  attackCommitted: boolean;
  attackOptions: string[];
  defenses: Record<string, string | null>;
  defenseItems: Record<string, string | null>;
  /**
   * **剛毅之盾**（墓穴遗物）：这名幸存者本次防御勾没勾它。
   *
   * ⚠ 单独一个表，就是为了让它**不占 `defenseItems` 那个名额** ——
   * 勾了盾照样能再选一件防御物品（用户要求）。
   */
  shieldUsed?: Record<string, boolean>;
  defenseOptions: Record<string, string[]>;
  fleeQueue: string[];
  /** 遭遇开始时被发现的幸存者，战后可移 1 格 */  discoveredIds: string[];
  /** 开战时该地有陷阱：本场遭遇必触发（防御 +2 一次） */
  trapArmed: boolean;
  /** 本场是否已结算过陷阱的防御加成 */
  trapApplied: boolean;
  /**
   * 雕像【處決】：本次攻击打出了處決。
   * 等目标掷完防御骰后，用「力量 vs 防御」判定：高出 3 点或更多就消灭目标。
   * 只对当前雕像的当前这次攻击有效（结算完清掉）。
   */
  executeArmed: boolean;
  /** 處決是哪尊雕像打的（攻击力按这尊的当前值算） */
  executeStatueId: string | null;
  /**
   * 荊棘纏繞：本次攻击中目标不能使用任何物品。
   * 每次新的遭遇/新一轮攻击都会重置。
   */
  blockItems?: boolean;
}

export interface GameState {
  roomCode: string;
  hostId: string;
  mode: GameMode;
  /**
   * **「分头行动」开关**（只在 1对3 `multi` / 2对3 `2v3` 下有意义）。
   * 规则开关存在 `GameState` 上，快照里下发给客户端画标识。
   */
  split: boolean;
  /**
   * 【分头行动】**本大回合的先手**（幸存者棋子 id）。
   *
   * 规则：第一个大回合由开局前选定的先手先做一般行动，然后**从左往右轮**；
   * **每个大回合结束后先手后移一位**（在还活着的幸存者里）。
   *
   * ⚠ 实现上就是"把 `turnOrder` 旋转成以他为第一" ——
   * 行动推进和**发现牌归属**（取 `turnOrder` 第一个活人）全都自动跟着走。
   */
  splitFirstId: string | null;
  /** 座位顺序（**不旋转**的基准），开局第一次轮转时记下 */
  splitOrderBase: string[];
  soloKillerCharacterId: string | null;
  soloSurvivorCharacterIds: string[];
  /** 1对1 / 1对2：哪些真人在操控幸存者棋子 */
  survivorOperators: Array<{ id: string; name: string; connected: boolean }>;
  /**
   * 女王对局：**进入游戏后**在幸存者行动区指定的十字弩持有者（**棋子 id**）。
   * 指定后那人才拿得到十字弩；没指定前没人持有。
   */
  crossbowHolderId: string | null;
  /** 十字弩是否已经指定过持有者（一次性） */
  crossbowAssigned: boolean;
  /**
   * 【解散房间】：谁发起的 + 已经点了「确认解散」的**玩家 id**。
   * 发起人自己算第一票；除观众以外、**还连着的**玩家全部确认后
   * `disbanded = true`，房间由 RoomManager 销毁，所有人退回主界面。
   */
  disband: { requestedBy: string | null; votes: string[] };
  /** 全员确认解散（或房间本来就一个人）→ 这一桌结束 */
  disbanded?: boolean;
  /**
   * 【重新开始】：和 `disband` 同一套投票机制，但**不解散房间** ——
   * 全员确认后回到大厅，重新选地图 / 身份 / 角色（`restartMatch`）。
   *
   * 投票人集合与解散完全一致（除观众以外、还连着的玩家）。
   */
  restart: { requestedBy: string | null; votes: string[] };
  /** 1对2：一般行动/额外行动等队友确认 */
  pendingCoopAction: {
    fromControllerId: string;
    fromName: string;
    actorPlayerId: string;
    actorName: string;
    summary: string;
    action: ClientAction;
  } | null;
  /** 正在把已确认的协作行动写进棋盘，不再二次请求确认 */
  applyingConfirmedCoop: boolean;
  phase: Phase;
  round: number;
  contentVersion: string;
  map: MapDef;
  /** 开局时载入的全部地图，供大厅换图用（只把有底图的发给前端） */
  maps: MapDef[];
  rules: RulesDef;
  characters: CharacterDef[];
  cardById: Record<string, CardDef>;
  players: Record<string, PlayerState>;
  turnOrder: string[];
  activeSurvivorIndex: number;
  /** **当前行动**的杀手棋子 id。杀手换人时会改（2v3 里两人交替行动） */
  killerId: string | null;
  /**
   * 本局**所有**杀手棋子 id（1 杀手模式就一个）。
   * `killerId` 只是"现在轮到谁"，这个是"有哪些杀手" —— 全都写进 `killers`。
   */
  killerIds: string[];
  /**
   * 2v3：每个杀手各自的状态切片（权威副本）。
   * 行动中的那个杀手的切片会镜像到下面的 `killerHand` / `killerDeck` 等顶层字段，
   * 所以 1 杀手模式与既有代码完全不受影响。改完行动记得 `syncActiveKiller`。
   */
  killers: Record<string, KillerState>;
  /**
   * 2v3：**本轮的先后手顺序**（两个杀手棋子 id，长度 2）。
   * 每轮结束后互换。行动中的那个就是 `killerId`。
   */
  killerTurnOrder: string[];
  /** 2v3：当前轮到 `killerTurnOrder` 里的第几个（0=先手，1=后手） */
  killerTurnIndex: number;
  /** 2v3：本轮的先后手是否已经定下（两人偏好一致才定） */
  killerOrderDecided: boolean;
  /**
   * 【变体1】**特性卡开关**（所有模式都能开；和【变体2 分头行动】可以同时开）。
   */
  variant1: boolean;
  /**
   * 【变体1】**生存难度等级** —— 四种难度**幸存者侧完全一样**（每人抽 2 选 1），
   * 差别只在杀手侧：简单不抽 / 普通 2选1 / 困难 4选2 / 噩梦 6选3。
   */
  traitDifficulty: TraitDifficulty;
  /**
   * 【变体1】特性卡定义表（开局时从 `content/traits.json` 灌进来）。
   *
   * ⚠ 存在 state 上是为了让**快照**能直接查名字/图片，不用把 content 传进 `buildSnapshot`。
   */
  traitById: Record<string, TraitDef>;
  /** 【变体1】**还没被抽走的**特性池（按阵营分）。抽走即出池，没选中的也弃掉 */
  traitPool: { survivor: string[]; killer: string[] };
  /** 【变体1】每人已选到的特性（幸存者 1 张；杀手 1~3 张） */
  traits: Record<string, string[]>;
  /** 【变体1】正在等他选的候选（`playerId → 候选 id`）；有键 = 现在轮到他选 */
  traitOffers: Record<string, string[]>;
  /** 【变体1】还没选的人（座位顺序，只用来显示"还剩几个人没选"） */
  traitPickQueue: string[];
  /** 【变体1】已经用掉的"每场游戏仅限一次"特性（客户端据此把卡面变暗） */
  traitUsed: string[];
  /**
   * 【变体1】杀手特性 14「埋伏等待」：这些杀手**跳过自己的第一个回合**。
   * 开局时写进来，轮到他的回合时消费掉（用一次就移除）。
   */
  killerSkipFirstTurn: string[];
  /**
   * 【变体1】杀手特性 13「阴险圈套」：开局还要选几个地点【封堵】。
   * `0` = 没有这个任务；选完一扇少一个，减到 0 就结束这一步。
   */
  pendingTraitBlockades: number;
  /**
   * 【变体1】杀手特性 14「埋伏等待」的**开局升级**挂起中：
   * 等杀手"确认新效果"（可能还要先决定要不要转换主雕像）。
   *
   * 确认完之后要**直接回到开局流程 `startRound`** —— 不能走
   * `maybeCloseKillerUpkeep`（那会把这一次当成正常杀手回合收尾、多抽 3 张牌）。
   */
  pendingTraitSetupResume: boolean;
  /**
   * 【变体1】杀手特性 14「嘲讽战术」：幸存者发动后，**等杀手自己选要弃的牌**。
   * `> 0` = 还差几张没选；选完（`resolveTraitDiscard`）再抽 1 张。
   */
  pendingTraitDiscard: number;
  /** 这次弃牌是谁的「嘲讽战术」造成的（只用于战报） */
  pendingTraitDiscardFrom: string | null;
  /**
   * 【变体1】感知**发现了幸存者**之后，等杀手决定要不要发动特性卡
   * （10 即刻反应 / 15 谋杀意图 / 16 敏锐感知 —— 卡面都写"可以"，所以要他确认）。
   */
  pendingSenseTraits: boolean;
  /** 刚感知到的那批幸存者（特性 15「谋杀意图」要惊吓的就是他们） */
  pendingSenseWitnessed: string[];
  /** 【变体1】"**每轮一次**"的特性这轮用没用过（目前只有 16 敏锐感知），每轮清空 */
  traitUsedThisRound: string[];
  /**
   * 【变体1】特性 11「安静搜查」：**每次发现要发出响声时问一句要不要取消**
   * （用户要求："每次他有响声时询问"）。挂起期间发现流程停在这里等答复。
   */
  pendingQuietSearch: {
    playerId: string;
    roomId: string;
    /** 这次响声来自哪条流程，答复后要接着走完 */
    from: 'suitcase' | 'discovery';
  } | null;
  /**
   * 【变体1】特性 17「压迫威慑」：升级到 3/4/5 级时，**由杀手选 1 名幸存者**惊吓
   * （卡面写"任意 1 个幸存者" → 必须他选，不许系统代选）。
   */
  pendingTraitVictim: { killerId: string; traitId: string; level: number } | null;
  /**
   * 【变体1】特性 18「拾物妙手」：正在"**两张发现牌都留下**"。
   *
   * 机制：两张各走一次 `resolveDiscoveryChoice`，但**第一次不推进流程**
   * （靠这个标记），第二次才照常进响声阶段 —— 否则会推进两次。
   */
  discoveryKeepBoth: boolean;
  /**
   * 【变体1】特性 02「玩弄猎物」：遭遇爆发时**先问杀手**要不要取消这次遭遇。
   *
   * ⚠ 顺序（用户明确）：**先看杀手取不取消，再看幸存者用不用 12** ——
   * 所以这个询问挂起期间**不**挂「英勇阻截」；杀手点了"不取消"才轮到幸存者。
   */
  pendingPreyOffer: boolean;
  /**
   * 【变体1】特性 12「英勇阻截」：
   * 「当你和任意幸存者共同遭遇杀手时，你可以让所有其他幸存者【移动】X1 来逃离这次攻击
   *  （在告知杀手找到的是哪些幸存者之后再使用本卡牌）。**跑掉的人脱离这次遭遇**。」
   *
   * 卡面写"可以" → 必须持有人自己决定；方向**逐个选**（用户要求：任意都要选）。
   */
  pendingHeroicBlock: {
    holderId: string;
    /** 已经决定发动了（false = 还在问要不要用） */
    started: boolean;
    /** 还没选方向的人 */
    queue: string[];
    /** 已经移动好的人 */
    moved: string[];
  } | null;
  /**
   * 2v3：本轮的杀手是否已因遭遇而**双双结束回合**。
   * 一旦为 true，本轮剩下没行动的杀手也直接跳过。
   */
  killerRoundEndedByEncounter: boolean;
  noises: string[];
  keysCollected: number;
  repairProgress: number;
  rescueCountdown: number | null;
  rescueArmed: boolean;
  searchDeck: string[];
  searchDiscard: string[];
  discoveryDeck: string[];
  discoveryDiscard: string[];
  killerDeck: string[];
  killerDiscard: string[];
  killerHand: string[];
  blockades: string[];
  killerPower: number;
  killerLevel: number;
  killerLocked: string[];
  pendingKillerDiscards: number;
  pendingBlockade: boolean;
  pendingBlockadePlace: string | null;
  blockadesThisAction: string[];
  pendingSealQueue: string[];
  sealAllRoomId: string | null;
  killerMainActionsLeft: number;
  killerUsedSlowThisTurn: boolean;
  killerTurnStep: KillerTurnStep;
  killerMainChoice: KillerMainChoice;
  lastDiscoveryCardId: string | null;
  discoveryOptions: string[];
  lastDiceRoll: DiceRoll | null;
  encounter: EncounterState | null;
  winner: 'killer' | 'survivors' | null;
  winReason: string | null;
  logs: LogEntry[];
  pendingMoveRange: number | null;
  pendingCardSpeed: 'fast' | 'slow' | 'special' | null;
  pendingItemDiscard: { playerId: string; count: number } | null;
  /** 1对3：给予/互换等对方点确认 */
  pendingTrade: {
    fromPlayerId: string;
    targetPlayerId: string;
    itemId: string;
    amount: number;
    receiveItemId?: string;
    /**
     * 【分头行动】`'keys'` = 这次给的是**单独保管的钥匙**（不是背包物品），
     * 所以 `itemId` 无意义、只看 `amount`（给出几把）。
     */
    kind?: 'item' | 'keys';
  } | null;
  trapRoomIds: string[];
  survivorDiscard: string[];
  pendingSurvivorPick: boolean;
  pendingDiscoveryPick: boolean;
  discoveryActorId: string | null;
  pendingSensePair: { firstRoomId: string | null; secondRoomId?: string | null } | null;
  pendingSenseColor: boolean;
  senseHighlight: 'R' | 'B' | 'G' | null;
  pendingEffectQueue: EffectDef[];
  pendingMoveMin: number;
  lastMovePath: string[];
  lastMoveCrossedBlockade: boolean;
  lastSearchFound: boolean;
  stealthRevealKind: StealthRevealKind | null;
  pendingLurkPick: boolean;
  pendingAmulet: PendingAmulet | null;
  /**
   * 迪伦·温「坚毅」：等玩家决定要不要用**坚毅标记**挡掉这次伤害。
   */
  pendingResilience: { playerId: string; amount: number; sourceId: string } | null;
  /**
   * 欧菲莉亚「第六感」：搜索时摸 2 张，等玩家选 1 张留下，
   * 另 1 张**放回搜索牌库顶**（返回的卡牌不会触发警报）。
   */
  pendingSixthSense: {
    playerId: string;
    /** 摸到的两张（牌 id） */
    cardIds: string[];
    /** 搜索当时的地点（离开也要按原地点结算响声） */
    roomId: string;
    /** 安娜式的「搜索不出声」是否生效 */
    quiet: boolean;
  } | null;
  repairedThisPhase: boolean;
  firecrackerThisRound: boolean;
  /** 爆竹标记所在格：杀手回合开始时的位置；潜行则等重现后再放 */
  firecrackerRoomId: string | null;
  /** 木屋 R4 手提箱：true=图一可摸发现牌，false=图二本大回合已用 */
  suitcaseAvailable: boolean;
  encounterTailBonus: number;
  /** 本幸存者大回合已修满 5，等大回合结束再把警车放到 5 */
  pendingRescueArm: boolean;
  /** 杀手上次被允许看到的钥匙数（大回合结束才更新） */
  killerPublicKeys: number;
  /** 杀手自己猜的修理进度 0–5，和真实进度无关 */
  killerRepairGuess: number;
  /** 进化发锁定牌导致手牌超员时，才允许自选弃一张 */
  pendingUnlockDiscard: boolean;
  /**
   * 刚因进化入手、本次超员弃牌里**不能弃**的牌（就是这一级新发的锁定牌）。
   * 手牌满了再摸到的牌不会进这里 —— 那些本来就该弃。
   */
  justUnlockedCards: string[];
  /** 呼啸而过：先点路径，确认后才走路+惊吓 */
  /**
   * 路径草稿。**`owner` 决定谁来确认**：
   *  - `killer`（默认，缺省即此）= 杀手的牌在走（追逐 / 呼啸而过 / 巡邏 / 幸運幣…）
   *  - `survivor` = **幸存者自己在走**，目前只有凯莱布「幸运币」的〔移動〕×0-2
   *    （以前没这个字段，导致幸运币能建草稿却没人能确认 —— 客户端面板只给杀手、
   *     服务端 `finishPendingMove` 也直接拒绝幸存者。）
   */
  pendingPathDraft: {
    min: number;
    max: number;
    rooms: string[];
    owner?: 'killer' | 'survivor';
    /** owner=survivor 时：**这条草稿属于哪个幸存者**（幸运币的〔移動〕） */
    actorId?: string;
  } | null;
  /** 感知已选颜色，等确认 */
  pendingSenseColorPick: 'R' | 'B' | 'G' | null;
  rematchReady: string[];
  /** 是否开启【替换「鸿运当骰」等牌】 */
  replacementDeck: boolean;
  /**
   * 雕像杀手（killer6）：4 个雕像棋子的 id。
   * 每个棋子同时是 state.players 里的一条（faction='killer'、statueIndex=1..4）。
   * `state.killerId` 指向其中的**主雕像** —— 手牌/力量/等级都挂在主雕像那条上。
   */
  statueIds: string[];
  /** 切换主雕像的待确认目标（杀手选了但还没确认） */
  pendingStatueSwitch: string | null;
  /**
   * 【雕像进化 / 升级时切换主雕像】**已经点了、但还没确认**的那一尊。
   *
   * 用户要求"选择要确认"：点一尊只记在这里，真正的切换在
   * 「确认新效果」（`ackEvolution`）时一并执行。
   */
  pendingStatueEvoTarget?: string | null;
  /**
   * 雕像：开局是否已经选定主雕像。
   * **true 之后本局不能再改** —— 只有进化等级的「先决定要不要转换主雕像」能改。
   */
  statueMainLocked?: boolean;
  /**
   * 雕像牌的「逐个行动」队列：所有雕像移动 / 所有雕像搜索 都不是一次点完，
   * 而是从第 1 个雕像到第 4 个依次处理。这里记录还剩哪些没做。
   */
  pendingStatueMoveQueue: string[];
  /**
   * **雕像「巡邏 / 圍困」正在等杀手选下一尊**（用户要求：顺序由杀手自己选，
   * 移动段和搜索段**各选各的**）。
   *
   * - `kind`：这一段是移动还是搜索
   * - `done`：这一次效果里**已经行动过**的雕像（不再出现在选项里）
   * - `active`：正在走的那尊（非空 = 正在移动中，客户端这时不画选项）
   *
   * ⚠ 选项里**只放"能动的、还没选过的"**（被停滞的直接不出现）；
   * 一尊能动的都没有时，那张牌**根本打不出来**（在 `playKillerCard` 里拦）。
   */
  pendingStatuePick: {
    kind: 'move' | 'search';
    max: number;
    min: number;
    done: string[];
    active: string | null;
    scope: string;
  } | null;
  /** 这一步正在处理哪个雕像（移动/搜索时，主雕像身份会临时指到它） */
  pendingStatueStepId: string | null;
  /** 每轮移动的步数上限（雕像牌给的 value/min） */
  pendingStatueMoveMax: number;
  pendingStatueMoveMin: number;
  /** 圍困：移动做完后要依次搜索的雕像队列 */
  pendingStatueSearchQueue: string[];
  /** 重整旗鼓：已经进入「移动封堵」这一步 */
  pendingStatueRallyMoveBlockade: boolean;
  /** 重建旗鼓：已选中、等待放置的封堵门 id */
  pendingStatueMovedBlockadeFrom: string | null;
  /**
   * 幸存者猜的"主雕像"：key = 幸存者 id，value = 他猜的雕像 id。
   * 只有幸存者之间可见（杀手看不到）。
   */
  statueGuesses: Record<string, string>;

  // —— 狼人：宝藏 ——
  /**
   * 宝藏牌堆（摸牌堆）。只在地图上有宝箱时建立 ——
   * 3 张银质匕首 + 1 张银质子弹，正好 4 张，对应地图上 4 个宝箱。
   */
  treasureDeck: string[];
  /** 宝藏弃牌堆 */
  treasureDiscard: string[];
  /**
   * 地图上还没被开过的宝箱：key = 宝箱标记 id，value = 所在房间 id。
   * 幸存者开一个，这里就删一个，图标随之消失。
   */
  treasureChests: Record<string, string>;

  // —— 女猎手：猎手陷阱 ——
  /**
   * 地图上的猎手陷阱：key = 位置标记 id。
   * `kind` 是杀手开局秘密声明的陷阱类型，幸存者只看得到问号。
   * `revealed` 被触发后就揭晓；`removed` 触发后是否已移除。
   */
  hunterTraps: Record<
    string,
    {
      roomId: string;
      kind: 'bear' | 'bone' | 'net';
      revealed: boolean;
      /**
       * 触发后是否已移除。
       * 注意：**触发时是直接从 `hunterTraps` 里删掉**（一次性），
       * 所以正常的"已触发"陷阱不会留在这个表里；这个字段只用于
       * 「被移除但需要保留痕迹」的兜底，以及快照判断。
       */
      removed: boolean;
    }
  >;
  /**
   * 【陷阱零件】使用后留下标记的地点（只有幸存者看得到）。
   * 和 trapRoomIds（+2 防御的实际效果）分开：那个是规则效果，这个是地图上的可见标记。
   */
  trapPartRooms: string[];

  /**
   * 【女猎手】**捕网的"本回合不能离开"效果**。
   *
   * 陷阱是**一次性的**：触发后立刻从场上移除（双方地图上的标记都消失）。
   * 但捕网的效果要持续到本回合结束，所以效果本身单独记在这里 ——
   * 不能挂在陷阱对象上（那个已经被删掉了）。
   */
  netLocks: Array<{ roomId: string; playerId: string; round: number }>;

  // —— 地图特殊规则（实验室 / 城堡 / 墓穴）——
  /**
   * 【实验室】G3「急救室」的急救箱标记。
   * `true` = 还在地上，可以用；用掉后变 `false`（一次性，标记随之消失）。
   */
  firstAidKit: boolean;
  /**
   * 【城堡】R1「監視室」的**机关大门**：被放了门的那扇门号（`"A|B"` 规范格式）。
   * 场上至多一个 —— 改放位置时旧门**自动消失**（直接覆盖这个字段即可）。
   * `null` = 场上没有机关大门。
   */
  leverGateDoorId: string | null;
  /**
   * **粘液腺體：回合收尾正挂在"等杀手点一扇门封堵"上。**
   *
   * 用户要求「杀手该回合结束处理的让杀手处理完，处理完才给到幸存者」——
   * 所以 `closeKillerTurn` 走到粘液腺體时会挂起并**停在这里**，
   * 点完门由 `case 'move'` 接着把回合收尾走完（切给幸存者）。
   */
  pendingTurnEndSwitch: boolean;
  /**
   * 【城堡】**是谁操作的控制杆**（放置当前这道机关大门的幸存者 id）。
   *
   * 用户要求：「机关大门给杀手的报告和战报都只有大门的位置，
   * 不知道是谁动的机关」—— 所以要把操作者记下来，
   * 放门的战报和杀手被挡住时的提示都要写出名字。
   * 门被拆掉 / 换位置 / 重开一局时跟着 `leverGateDoorId` 一起清。
   */
  leverGateOwnerId: string | null;
  /**
   * 【城堡】杀手要花 3 张手牌通过机关大门：等他自选弃哪 3 张。
   * 选完才继续那次移动。
   */
  pendingGatePay: {
    /** 谁在过门 */
    actorId: string;
    /** 目的地（付完费要走到这里） */
    toRoomId: string;
    /** 要走的那扇机关大门 */
    doorId: string;
    /** 已点的牌（要先确认） */
    picked: string[];
  } | null;
  /**
   * 【城堡】B4「雕像長廊」的"本局第一次有人进来"是否已经触发过。
   * 只触发一次（惊吓 + 响声）。
   */
  castleHallFirstEnterDone: boolean;

  // —— 【墓穴】——
  /**
   * 【墓穴】已经**坍塌**的地点。塌了的地点视作**不存在**（永远不能进、不能搜索），
   * 跟它相连的门也一起消失。杀手每升一级（1→2、2→3、3→4、4→5）随机塌一个，
   * 一共 4 次、四个地点各塌一次（不会重复）。提示词：`坍塌检查()`。
   */
  collapsedRooms: string[];
  /**
   * 【墓穴】杀手升级时还没选中要塌哪个地点。
   * 升级流程里若这里是 `true`，就先结算坍塌（发提示词、清标记、扣血、排队移动），
   * 结完把它设回 `false`，**再**继续升级本身的效果。
   */
  pendingCollapse: boolean;
  /** 【墓穴】本次升到几级（用于提示词「杀手进化到 N 级」） */
  pendingCollapseLevel: number;
  /**
   * 【墓穴】哪一级的坍塌**已经结算过了**（0 = 没有）。
   *
   * 为什么需要它：`runUpgrade` 被坍塌拦下时等级**还没涨**，
   * 所以"结算完坍塌再跑一次升级"时，gate 会又看到同样的「1 → 2」而再拦一次，
   * 结果就是无限循环着塌（等级永远卡在 1）。用这个标记告诉 gate
   * "这一级的坍塌已经做完了，这次放行"。
   */
  collapseConsumedForLevel?: number;
  /**
   * 【墓穴】坍塌后「屋里的人轮流走一步」的待办队列。
   * 一次只问一个人（面板一次只出一个），走完了自动问下一个。
   * `null` = 没人要走了。
   */
  pendingCollapseMoves: {
    /** 塌掉的地点（必须离开这里） */
    roomId: string;
    /** 杀手也要强制弃光手牌 + 走一步 */
    killerId: string | null;
    /** 还没轮到的人（幸存者在前，杀手最后） */
    queue: string[];
    /** 当前正在等谁选 */
    currentId: string | null;
  } | null;
  /**
   * 【墓穴】R6「遺物室」的遗物标记：`true` = 正面朝上（可以花额外行动抽遗物）。
   * 抽完翻面，每个幸存者大回合开始时翻回正面。
   */
  relicMarkerFaceUp: boolean;
  /** 【墓穴】R6 遗物牌堆（抽牌堆），牌背朝上 */
  relicDeck: string[];

  // —— 女猎手 / 狼人专用 ——
  /** 猎手本能：杀手已选、等待在行动区确认的感知地点 */
  pendingSenseRoom: string | null;
  /** 猎手本能：是否正处于「选一个地点来感知」的状态 */
  killerSenseRoomActive: boolean;
  /**
   * 君臨天下：这次感知用的是「感知后移动一名目击者」——
   * 确认感知后如果目击到人，就要接着让杀手选一名目击者移动。
   */
  pendingSenseMoveAfter?: boolean;
  /** 君臨天下：等待杀手点选一名**目击到的**幸存者 */
  pendingMoveSurvivorPick: string[] | null;
  /** 君臨天下：已选中的幸存者，正在规划他的移动路径 */
  pendingMoveSurvivorId: string | null;
  /**
   * 杀手地图上的「目击立绘」：这些幸存者上次被〔感知〕目击时在哪。
   * 只用于**杀手视角**把立绘摆到那个位置，不改变幸存者真实位置。
   */
  witnessedAt: Record<string, string>;
  /**
   * 君臨天下「目击者移动」结算完的收尾回调。
   * 由 engine 注入 —— killerCards 不能反向 import engine（会成环）。
   * 运行时用，不参与序列化。
   */
  onMoveSurvivorDone?: (() => void) | null;
  /** 追踪：等待杀手选一名幸存者来展示距离 */
  pendingTrackerPick: boolean;
  /**
   * **杀手打牌后拿到的信息**（感知看到了谁、追蹤的距离、红外探测结果…）。
   *
   * 用户要求改成**地图右边的信息区**（类似战报的一块），而且
   * **「杀手行动区里的获得的信息确认那些流程删去」** ——
   * 所以这里是一个**累积列表**（一条条往下排），不再是"待确认的一块"，
   * 也**不在 `hasPendingKillerChoice` 里**（不再挡流程）。
   *
   * 每个杀手回合开始时清空（"杀手回合期间"的信息区）。
   */
  killerIntel: Array<{ title: string; lines: string[] }>;
  /**
   * **杀手当前打出的牌**（幸存者地图右边要能看到这张牌的卡面）。
   * 打牌时记下，**每个杀手回合开始时清空**。
   */
  currentKillerCardId: string | null;
  /** 超听觉：路径确认后要接着搜索 */
  pendingStatueSearchAfterPath?: boolean;
  /** 屏息等「持续到杀手下回合结束」的力量，回合结束时清掉 */
  killerPowerUntilNextTurn?: number;
  /**
   * **持续到本回合结束**的力量加成（如保護色「移动通过秘密通道 +3」、疯狂 +2）。
   * 每次杀手回合开始时清零。
   */
  turnLingeringPower: number;
  /**
   * 屏息等「**使用这张牌时启用，下回合结束时清除**」的力量。
   *
   * 覆盖「打出它的这一回合」+「接下来的一个杀手回合」，到那个回合结束才失效。
   *  - `carryPowerUntilNextTurn`：下回合开始时重新挂上的量
   *  - `carryPowerActive`：本回合是不是「带上来的」那一回合（是就该在回合末清掉）
   */
  carryPowerUntilNextTurn: number;
  carryPowerActive: boolean;
  /**
   * **下一次攻击**的力量加成（如未命名「保護色」重现时 +3）。
   * 只对下一次攻击有效，用掉就清。
   */
  pendingAttackPower: number;
  /**
   * **保護色「重現時 +3 力量」的意向值**：重现时挂上，只有**重现后那次搜索
   * 真的发生遭遇**才由 `startEncounter` 兑现成本次遭遇的力量加成；
   * 没遭遇就在回合结束时作废。
   */
  pendingRevealPower: number;
  /**
   * 本回合是否移动**通过了秘密通道**（`map.passages`；未命名「伏擊」的条件之一）。
   *
   * ⚠ **杀手通道 / 杀手密道（`edges` 里 `pathType: 'killer'`）不算** ——
   * 那和秘密通道是完全两回事。
   */
  movedThroughPassageThisTurn: boolean;
  // 注：`coreRemovedThisRound` / `extraActionUsedThisTurn` / `tradedThisTurn`
  // / `haltedThisRound` 都是**按幸存者**记的，声明在 `PlayerState` 上。

  // —— 未命名进化卡牌（被动开关）——
  /** 保護色：移动通过秘密通道时 +N 力量（0 = 未获得，类型同疯狂/谋杀者2级） */
  passagePowerBonus: number;
  /** 保護色：「恐詭管道」可以潜行到任何地点（`stealthToPassage` 里读） */
  passageStealthAnywhere: boolean;
  /** 音波感知：回合开始时按响声揭示 */
  sonarRevealActive: boolean;
  /** 粘液腺體：回合结束封堵 */
  slimeGlandActive: boolean;

  // —— 未命名：进化卡牌 ——
  /** 已获得的进化卡牌 id（等级 2 / 4 各选 1 张） */
  chosenEvolutionCards: string[];
  /** 等杀手从可选进化卡牌里选一张 */
  pendingEvolutionCardPick: string[] | null;
  /** 未命名的进化卡牌候选池（开局写入，升级时用来让杀手挑） */
  unEvolutionPool: string[];
  /**
   * **解锁二选一**：同一个 unlockChoice 组到级时，等杀手挑一张入手。
   * 存的是候选牌 id。
   */
  pendingUnlockChoice: string[] | null;
  /**
   * 【超听觉】自动寻路时，若有多条并列最快路径，就停下来让杀手选一条。
   * 每项 = 一条完整路径。
   */
  pendingMoveChoices: Array<{ path: string[]; label: string }> | null;
  /**
   * 雕像进化 1 级：**每次升级时首先执行** ——
   * 停下来让杀手选择「切换主雕像」或「不切」，选完才继续结算这一级的其它效果。
   */
  pendingStatueEvoSwitch: boolean;

  // —— 未命名（killer7）——
  /** 永久移除的卡牌（變形 / 戰鬥適應），不会洗回牌堆 */
  killerRemovedPermanently?: string[];
  /** 等级给的永久力量累计（用于展示） */
  killerLevelPowerGain?: number;
  /** 恐詭管道：等杀手点一个有秘密通道的地点 */
  pendingPassagePick: string[] | null;
  /**
   * **本回合杀手"重现"过**（主动现身、公开所在格）。
   *
   * ⚠ 注意区分**重现**和**暴露**：
   *  - **重现**（回合开始时自己结束潜行）→ 会**强制搜索一次**房间
   *  - **暴露**（被幸存者撞见、坍塌、或其他效果解除潜行）→ **不搜索**
   *
   * 未命名【伏擊】的使用条件之一：「在你重现后送的这次搜索中若遭遇，则可用」。
   */
  reappearedThisTurn?: boolean;
  /**
   * **现在这场遭遇是"重现时那一次强制搜索"引发的。**
   *
   * 用户明确：「伏击的条件、谋杀者 2 级的条件都有一个"重现时"，
   * 这个**特指重现时的这一次搜索**」——
   * 所以不能宽泛地判"本回合重现过"，必须是**那一次**搜索引发的遭遇。
   *
   * 由 `forcedRevealAndSearch` 设置，遭遇结束 / 新回合开始时清掉。
   */
  encounterFromRevealSearch?: boolean;
  /**
   * **刚刚做了"重现时那一次强制搜索"**（还没开遭遇）。
   * `startEncounter` 会据此把这次遭遇标成 `encounterFromRevealSearch`。
   */
  revealSearchHappened?: boolean;
  /**
   * **这个幸存者大回合已经给过乔治笔记了**（「思维敏捷」每个大回合只判定一次）。
   * 不加这个的话，挑完笔记回到 `enterNoiseReport` 会再次满足条件 → 死循环。
   */
  georgeNoteGivenThisRound?: boolean;
  /**
   * 【未命名・變形 / 戰鬥適應】等杀手从**弃牌堆**里挑要永久移除的牌。
   * 以前是自动从堆顶拿、玩家没得选。
   */
  pendingDiscardRemove: {
    remaining: number;
    excludeCardIds: string[];
    options: string[];
    optionsNamed: Array<{ id: string; name: string }>;
    cardName: string;
  } | null;
  /** 酸液喷吐：等杀手点一个相邻地点 */
  pendingAcidPick: boolean;

  // —— 扼杀者（killer8）——
  /** 地图上的核心标记（只有位置，一个地点可以有多个） */
  coreMarkers: string[];
  /** 是否已用完「扼杀者起始地点的 1 个核心标记 + 4 个备用」 */
  coreSetupDone?: boolean;
  /** 等杀手点一个地点放核心标记 */
  pendingCorePick: 'place' | 'remove' | 'placeBlockade' | 'moveFrom' | 'moveTo' | null;
  /**
   * 核心标记已达 5 个上限时，打「茂盛」等要**先让玩家选移除哪一个**，
   * 选完再放新的。这里存「本来想放在哪个地点」。
   */
  pendingCoreOverflowPlaceAt: string | null;
  /** 扼杀者 4 级：第一个地点撞上限时，第二个地点先挂在这里，移除完再补放 */
  pendingCoreOverflowPlaceAtAfter?: string | null;
  /** 移动核心标记：记下从哪来 */
  pendingCoreFrom: string | null;
  /** 带核心标记、可封堵的地点候选 */
  pendingCoreRooms?: string[];
  /** 移动核心标记：可选相邻地点 */
  pendingCoreNeighbors?: string[];
  /** 刺耳噪声：可以把本卡牌放到牌库顶 */
  pendingReturnToDeckTop: boolean;
  /**
   * **可选**效果等杀手决定（牌面写了「可以」的才停下来问）。
   * 没写「可以」的效果一律直接执行，不会进这里。
   */
  pendingOptionalEffect: { fx: import('../content/schema.js').EffectDef; label: string } | null;
  /**
   * **等玩家点门封堵**时，门所在的地点。
   *
   * 规则：封堵哪扇门**永远由人来选**（扼杀者的牌、粘液腺体、茂盛都一样），
   * 只有「该地点一扇能封的门都没有」才自动跳过。
   * 用这个字段记「在哪封」，玩家点门时的落点逻辑就知道该用哪个地点。
   */
  pendingBlockadeRoom: string | null;
  /** 这次效果还要再封几扇门（茂盛的「×1」等；递减到 0 就收尾） */
  pendingBlockadeRemaining: number;
  /**
   * 打出的牌本身：**等效果全部结算完**才进弃牌堆。
   *
   * 原因：變形 / 戰鬥適應 的「永久从弃牌堆移除 N 张」在效果队列里执行，
   * 而规则要求**不能选择此牌本身**。所以打牌时先把它挂在这里，
   * 效果跑完（`continueKillerQueue` 队列清空）再推进弃牌堆。
   */
  deferredPlayedCard: string | null;
  /**
   * 【刺耳噪声】打出后停在这里：让杀手选择是否把这张牌**背面向上放到摸牌堆顶**。
   * 选择期间这张牌**既不在手牌也不在弃牌堆**（保证牌的唯一性）。
   */
  pendingDeckTopCard: string | null;
  /** 荊棘纏繞：本次攻击目标不能使用物品 */
  encounterBlockItems: boolean;
  /** 傳送聚合：等杀手点一个带核心/封堵标记的地点 */
  pendingTeleportPick: string[] | null;
  /**
   * 「或」牌（如狼人领地意识）：打出时让杀手在两组效果里二选一。
   * 存的是备选效果组，选完就清掉。
   */
  pendingEffectChoice: {
    /** 已经确定要执行的公共部分（在 alternatives 之前的效果） */
    base: import('../content/schema.js').EffectDef[];
    /** 可选的各组 */
    options: import('../content/schema.js').EffectDef[][];
  } | null;

  // ————————————————————————————————————————————————
  // 女王（killer9）：僵尸 & 中毒
  // ————————————————————————————————————————————————
  /**
   * 僵尸棋子（**不是**杀手棋子，是女王的僕從）。
   *
   * 规则要点：
   *  - 地图上最多同时存在 **6 个**；已经有 6 个时「生成丧屍」的效果**被取消**
   *  - 每个僵尸的战力 == **女王的力量**（动态，随女王力量变化）
   *  - 3 个立绘**轮流复用**（`art` 1..3）
   *  - 一个地点上可以有多个僵尸
   *  - 僵尸**不会阻止**幸存者搜索或修理
   */
  zombies: Array<{
    id: string;
    roomId: string;
    /** 用哪张立绘（1..3，循环复用） */
    art: number;
  }>;
  /** 下一个僵尸用哪张立绘（1..3 循环） */
  nextZombieArt: number;
  /** 已〔中毒〕的幸存者 id（状态栏上一个中毒标记） */
  poisoned: string[];
  /** 等杀手为「抓住他們！」选一个僵尸去搜索 */
  pendingZombieSearch: string[] | null;
  /** 等杀手为「屍群來了」选出发地点 */
  pendingZombieHordeFrom: string[] | null;
  /** 等杀手为「屍群來了」选目的地（记下出发地） */
  pendingZombieHordeTo: { from: string } | null;
  /** 等杀手为「屍體爆炸」选要献祭的僵尸 */
  pendingZombieSacrifice: string[] | null;
  /**
   * 女王移动时：若移动前所在位置有僵尸，
   * 让杀手选「带几个僵尸一起走」（或取消）。
   * 这里存这次待完成的移动（目的地 + 可选僵尸数）。
   */
  pendingQueenMove: {
    toRoomId: string;
    /** 出发地里可同行的僵尸 id */
    zombieIds: string[];
  } | null;
  /**
   * 十字弩：幸存者点选要消灭的僵尸（至多 `max` 个）。
   */
  pendingCrossbow: {
    survivorId: string;
    zombieIds: string[];
    max: number;
  } | null;
  /**
   * 女王等级 1 用：**本回合是否遭遇过**任何幸存者。
   * 回合结束时若「本回合没遭遇任何人 且 不在潜行」→ 在女王地点生成 1 个僵尸。
   */
  queenEncounteredThisTurn?: boolean;
  /**
   * 女猎手进化 4 级：这次路径草稿是「追逐」造成的，
   * 走完之后要再追加一次〔移動〕×0-1。
   */
  chaseFollowupPending?: boolean;
  /**
   * 女王等级 4：等杀手在**任意 2 个不同地点**各生成 1 个僵尸。
   * 存已选的地点（最多 2 个）。
   */
  pendingQueenSpawnRooms?: string[] | null;
  /** 扼杀者进化 4 级：已点选的地点（选满 2 个就落子） */
  pendingStranglerCoreRooms?: string[] | null;
  /**
   * 扼杀者核心标记：**同一次升级里已经处理过的「等级:地点」**，
   * 用来挡住效果队列收尾时的重复结算（否则会重复放标记、还会卡在「选移除」）。
   */
  corePlacedKeys?: string[];

  /**
   * 乔治「拆封堵」笔记：**由玩家选要拆哪几个**（最多 2 个）。
   * - doors  = 与乔治所在地点相连的封堵门号（候选）
   * - picked = 已选中的门号
   * 打出笔记时进入这个状态，确认后才真的拆除并消耗笔记。
   */
  pendingGeorgeBlockade?: {
    noteId: string;
    doors: string[];
    picked: string[];
  } | null;
  /**
   * 女猎手正在放置陷阱：
   *  - kind = 当前在行动区选中的陷阱类型
   *  - placed = 位置标记 id -> 放上去的陷阱类型
   *  - done = 是否已确认完成
   */
  pendingTrapPlacement: {
    kind: 'bear' | 'bone' | 'net' | null;
    placed: Record<string, 'bear' | 'bone' | 'net'>;
    done: boolean;
    /**
     * true = **开局布置**，只能放在常规搜索位 / 常规修理位；
     * false/undefined = **陷阱重置**，位置任选。
     */
    restricted?: boolean;
  } | null;
  /** 本回合临时力量（疯狂 +2、谋杀者重现 +3 等），与永久力量分开显示如 4+3；回合结束清掉 */
  killerTurnPowerBonus: number;
  /** 升级后停下来让杀手确认新效果 */  pendingEvolutionAck: {
    fromLevel: number;
    toLevel: number;
    /**
     * **这一级的效果还没执行**，等杀手点「确认新效果」时才结算
     * （用户要求：「杀手在确认进化效果后才执行进化效果」）。
     *
     * 升级当场只挂"确认前必须做完的选择"（解锁二选一 / 转主雕像 /
     * 选进化卡牌 / 女王 4 级点地点）；真正的结算 —— 力量 +N、
     * 锁定牌入手、手牌超限弃牌 —— 都在 `resolveDeferredEvolution` 里做。
     *
     * 这样就不会出现「手牌满了要弃牌」和「还没选要不要转主雕像」互相
     * 卡死：弃牌发生在确认之后，那时前面那些选择都已经做完了。
     */
    deferred?: boolean;
    /** 本次进化要结算的杀手（2对3 是两个）；不写 = 就当前那个 */
    killerIds?: string[];
  } | null;
  /** 幽魂 2 级：呼啸而过结算完，可选弃 2 张搜索当前格 */
  pendingWhizSearch: boolean;
  /** 幽魂 3 级：当前这一次过度，等杀手选弃 3 伤害或不用 */
  pendingOverFearWound: { targetId: string } | null;
  /** 遭遇防御掷完骰，等幸存者决定要不要用「鸿运当骰」重掷 */
  pendingDice: PendingDice | null;
  /** 本次防御还能重掷几次（手里每张「鸿运当骰」给 1 次） */
  pendingExtraRerolls: number;
  pendingOverFearQueue: string[];
  /** 遭遇开战效果还没走完（先惊吓，再 5 级伤害，再选人） */
  encounterOpenHold: boolean;
  /** 刚打出的是呼啸而过，等路径/惊吓走完再问要不要搜索 */
  whizJustResolved: boolean;
  /** 升到谋杀者 4 级后，确认进化再立刻选 4 扇门 */
  pendingEvoFourBlockade: boolean;
  /**
   * 乔治的笔记：每张只有 1 份，被拿走就从这里移除（拿走 = 进乔治装备栏）。
   * 用掉的进 survivorDiscard。
   */
  notesDeck: string[];
  /** 乔治刚做完一般行动、满足「思维敏捷」条件，等他挑一张笔记（可以点放弃） */
  pendingGeorgeNote: boolean;
  /**
   * 封堵：先算要放几块；槽位不够就先一块块移除场上封堵，再放置。
   * 不再把旧封堵“挪”到新门。
   */
  pendingBlockadeJob: BlockadeJob | null;
}

/** 一次封堵任务：设障 1 扇 / 留下全封 / 进化任意 4 扇 */
export interface BlockadeJob {
  kind: 'oneDoor' | 'sealAll' | 'anyDoors';
  roomId: string | null;
  need: number;
  removeLeft: number;
  placed: number;
  firstRoomId: string | null;
  secondRoomId?: string | null;
}

export type ClientAction =
  | { type: 'setName'; name: string }
  | { type: 'setMode'; mode: GameMode }
  /**
   * **「分头行动」开关**（1对3 / 2对3 专用，房主在大厅勾）：
   * 杀手杀人不结束游戏、钥匙单独保管、各自结算胜利。
   */
  | { type: 'setSplit'; split: boolean }
  /**
   * 【变体1】**特性卡开关**（所有模式都能开，房主在大厅勾；可与变体2 同开）。
   */
  | { type: 'setVariant1'; on: boolean }
  /**
   * 【变体1】**生存难度等级**（房主在大厅选；开了变体1 才有意义）。
   * 四档难度幸存者侧一样，差别只在杀手侧抽几张。
   */
  | { type: 'setTraitDifficulty'; difficulty: TraitDifficulty }
  /**
   * 【变体1】**选特性卡**（开局前弹窗里点确认）。
   *
   * `playerId` 只在**同一个操控者管多个棋子**时需要（单人选 3 名幸存者那种）；
   * 不传就是"操作者自己的棋子"。`traitIds` 必须正好是该他选的张数。
   */
  | { type: 'pickTrait'; playerId?: string; traitIds: string[] }
  /**
   * 【变体1】**发动特性卡**（行动型：特殊行动 / 额外行动）。
   *
   * 参数按卡面需要传：
   *  - `toRoomId`：需要选地点的（速度爆发/声音诱饵/明智之举的响声/迅速反应…）
   *  - `steps`：移动几步（速度爆发 2–4、迅速反应 1）
   *  - `targetPlayerId`：需要指定人的（紧急救治）
   *  - `moves`：调度人员那种"一次让好几个人各走一段"
   *  - `choice`：明智之举的三选一
   *  - `doorId`：明智之举拆封堵时选哪扇门
   */
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
      /**
       * 【变体1】**杀手特性**里"弃 N 张卡牌来…"的代价：弃哪几张**由杀手点手牌选**。
       * 张数按卡面固定（见 `traits.ts` 的 `KILLER_TRAIT_PAY`）。
       */
      payCardIds?: string[];
      /** 【变体1】12 英勇阻截这类"要不要发动"的询问：`true` = 不发动 */
      decline?: boolean;
    }
  /**
   * 【变体1】杀手特性 14「嘲讽战术」：**杀手自选要弃掉的牌**（3 张，然后抽 1 张）。
   */
  | { type: 'resolveTraitDiscard'; cardIds: string[] }
  /**
   * 【变体1】特性 11「安静搜查」的答复：`use` = 取消这次发现的响声（每局一次，用掉变暗）；
   * `false` = 让它照响。
   */
  | { type: 'resolveQuietSearch'; use: boolean }
  /**
   * 【分头行动】**选定本大回合的先手**（选角后、开局前，和 2v3 选杀手先后同一时机）。
   * 第一个大回合由他先做一般行动，之后每个大回合自动后移一位。
   */
  | { type: 'pickSplitFirst'; playerId: string }
  /**
   * 【分头行动】**从遗留物上拿东西**（额外行动）。
   *
   * 只有**被杀**的人才有遗留物：立绘留在原地，他剩下的**钥匙和物品**可以被
   * 同地点的幸存者拿走。`itemId` 省略 = 拿钥匙（`amount` 把）。
   *
   * ⚠ **逃脱的人没有遗留物** —— 他身上的钥匙和物品一律清零（自己带走了），
   * 原地只剩一个变暗的立绘，所以 `lootFrom` 会拒绝 `escaped` 的人。
   * 遗留物的主人不能拒绝，所以**不需要对方确认**（和给钥匙那种不同）。
   */
  | { type: 'lootFrom'; fromPlayerId: string; itemId?: string; amount?: number; actorPlayerId?: string }
  /** 房主在大厅/选角阶段换地图（对局开始后不许换） */
  | { type: 'setMap'; mapId: string }
  /**
   * 房主开关【替换「鸿运当骰」等牌】：
   * 开启后搜索牌堆里各 1 张钥匙 / 手斧 / 威士忌酒瓶 换成鸿运当骰 / 煤油灯 / 神秘包裹。
   */
  | { type: 'setReplacementDeck'; on: boolean }
  | { type: 'setSoloKiller'; characterId: string }
  | { type: 'setSoloSurvivor'; characterId: string }
  | { type: 'setFaction'; faction: 'killer' | 'survivor' | 'spectator' }
  /**
   * 【解散房间】除观众外谁都能点。点了之后进入"等所有人确认"状态，
   * 除观众以外**还连着的**玩家都确认之后房间解散、大家退回主界面。
   */
  | { type: 'requestDisband' }
  /** 别人发起解散后点「确认解散」 */
  | { type: 'confirmDisband' }
  /** 反悔：取消这次解散请求（谁都可以点） */
  | { type: 'cancelDisband' }
  /**
   * 【重新开始】：和解散房间同一套投票确认，但**不解散房间** ——
   * 全员确认后回到大厅重新选地图 / 身份 / 角色。
   */
  | { type: 'requestRestart' }
  | { type: 'confirmRestart' }
  | { type: 'cancelRestart' }
  /**
   * 【快进】（**只有单人热座 `solo`**）—— 为了快速测后期效果：
   * 幸存者侧 = 没做一般行动的都「消除恐惧」→ 发现阶段发给第一个幸存者 → 选第一张发现物；
   * 杀手侧 = 不打出任何卡牌、原地搜索两次，然后直接结束回合（进下一轮幸存者大回合）。
   */
  | { type: 'fastForward' }
  /** 【实验室 G3】用急救箱治疗同地点一人并清空其恐惧（一次性） */
  | { type: 'useFirstAidKit'; targetPlayerId?: string }
  /**
   * 【城堡 R1】把机关大门放到一扇门上（额外行动，至多一个、覆盖旧的）。
   * `actorPlayerId` = 是哪名幸存者操作的控制杆（见 `drawRelic` 的说明）。
   */
  | { type: 'placeLeverGate'; fromRoomId: string; toRoomId: string; actorPlayerId?: string }
  /** 【城堡】杀手弃 3 张手牌通过机关大门并拆除它 */
  | { type: 'confirmGatePay'; cardIds?: string[] }
  /** 【城堡】放弃通过机关大门 */
  | { type: 'cancelGatePay' }
  /**
   * 【雕像・召唤石碑】点一个地点。
   * 两段式：第一下记住起点，第二下（必须与之以门相连）决定那扇门并结算封堵。
   * 再点同一个地点 = 取消。
   */
  | { type: 'pickSummonSealRoom'; roomId: string }
  /**
   * 雕像「巡邏 / 圍困」：**杀手选下一尊要移动/搜索的雕像**
   * （顺序由杀手自己选；移动段和搜索段各选各的）。
   */
  | { type: 'pickStatueStep'; statueId: string }
  /**
   * 【未命名・恐詭管道】点一个**带秘密通道的地点**作为潜行落点。
   * （以前 `resolveStealthToPassage` 是死代码 —— 没有任何 action 调它，
   *   所以玩家点了地点也没反应。）
   */
  | { type: 'pickPassageRoom'; roomId: string }
  /**
   * 【女猎手】**重置陷阱放置**：最终确认之前，把已点好的陷阱全清、重新选。
   */
  | { type: 'resetTrapPlacement' }
  /**
   * 【未命名・變形 / 戰鬥適應】从**弃牌堆**里选一张要永久移除的牌。
   */
  | { type: 'pickDiscardRemove'; cardId: string }
  /** 【墓穴】坍塌后屋里的人轮流走一步离开（`toRoomId` 省略 = 留在原地，仅无处可去时允许） */
  | { type: 'collapseMove'; toRoomId?: string | null }
  /**
   * 【墓穴 R6】花**额外行动**抽取 1 张遗物，抽完标记翻面。
   *
   * `actorPlayerId` = 是**哪名幸存者**在抽（和宝箱 `openChest` 同一套写法）：
   * 共享控制模式下弹窗是按每个人列按钮的，不带它就会记到
   * "当前行动者"头上 → 然后因为那人不在 R6 而报错。
   */
  | { type: 'drawRelic'; actorPlayerId?: string }
  /** 【墓穴遗物】鏡之門戶：额外行动，传送到 🌀 螺旋地点 */
  | { type: 'useMirrorPortal'; toRoomId?: string }
  /** 【墓穴遗物】洞察之球：在搜索地点花特殊行动，本回合再搜一次 */
  | { type: 'useInsightOrb' }
  /**
   * 2对3：一名杀手选先后手偏好（`'first'` / `'second'`）。
   * 两人一致才生效；两人都选同一个时按座位顺序。
   */
  | { type: 'pickKillerOrder'; order: 'first' | 'second' }
  | { type: 'selectCharacter'; characterId: string }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startGame' }
  | { type: 'pickSurvivorTurn'; playerId: string }
  /** 把杀手牌的路径草稿清回起点（保留草稿本身，仍可继续点） */
  | { type: 'resetPathDraft' }
  /** 君臨天下：从目击到的幸存者里选一名来移动 */
  | { type: 'pickMoveSurvivor'; targetPlayerId: string }
  /**
   * 移动。`toRoomId` 是目的地。
   * 幸存者的`path`（可选）= 玩家**一步一步点出来的完整路径**（含起点）。
   * 传了 path 就**按玩家选的路径走**，不再由服务端算最短路径。
   */
  | { type: 'move'; toRoomId: string; path?: string[] }
  | { type: 'search' }
  | { type: 'repair' }
  /** 乔治·聪明绝顶：弃工具箱换 +1 修理进度 */
  | { type: 'georgeToolboxRepair'; actorPlayerId?: string }
  /** 乔治·聪明绝顶：从搜索牌库抽一张 */
  | { type: 'georgeDraw'; actorPlayerId?: string }
  /**
   * 用一张笔记（额外行动）。
   * 拆除封堵：不需要额外参数；响声：带 toRoomId 指定任意一格。
   */
  | { type: 'useNote'; noteId: string; toRoomId?: string; actorPlayerId?: string }
  /** 乔治「拆封堵」笔记：点选/取消一个要拆的封堵 */
  | { type: 'pickNoteBlockade'; doorId: string }
  /** 乔治「拆封堵」笔记：确认拆除已选的封堵 */
  | { type: 'confirmNoteBlockade' }
  /** 思维敏捷：挑一张笔记（noteId 为空 = 放弃） */
  | { type: 'chooseGeorgeNote'; noteId: string | null }
  /** 遭遇防御：用「鸿运当骰」重掷选中的骰子，或接受当前结果 */
  | { type: 'rerollEncounterDice'; diceIndexes: number[] }
  | { type: 'resolveEncounterDice' }
  /** 雕像：选择要切换成主雕像的雕像（改选择，不生效） */
  | { type: 'pickMainStatue'; statueId: string }
  /** 雕像：确认切换主雕像 */
  | { type: 'confirmMainStatue' }
  /** 雕像：取消切换选择 */
  | { type: 'cancelMainStatue' }
  /** 雕像：切换主雕像后，选一个封堵来移动（重整旗鼓） */
  | { type: 'pickMoveBlockade'; doorId: string }
  /** 雕像：把选中的封堵移到这扇门（重整旗鼓） */
  | { type: 'placeMovedBlockade'; toDoorId: string }
  /** 幸存者：停滞一个雕像（本大回合该雕像不能移动/搜索） */
  | { type: 'haltStatue'; statueId: string; actorPlayerId?: string }
  /** 幸存者：双击雕像猜它是主雕像 */
  | { type: 'guessMainStatue'; statueId: string; actorPlayerId?: string }
  /** 狼人：开自己地点的一个宝箱（抽 1 张宝藏牌） */
  | { type: 'openChest'; chestId: string; actorPlayerId?: string }
  /** 女猎手：放置陷阱时选一种类型（捕熊 / 白骨 / 捕网），然后点地图选地点 */
  | { type: 'pickTrapKind'; kind: 'bear' | 'bone' | 'net' }
  /** 女猎手：把当前选中的陷阱放到这个位置标记上（再点同一个 = 取消） */
  | { type: 'placeHunterTrap'; tokenId: string }
  /** 女猎手：确认陷阱放置完成 */
  | { type: 'confirmTrapPlacement' }
  /**
   * 开局准备：雕像杀手选定主雕像。**选定后本局锁定**，之后不能再改。
   */
  | { type: 'chooseMainStatue'; statueId: string }
  /** 女猎手：猎手本能 —— 行动区确认要感知的地点 */
  | { type: 'confirmSenseRoom' }
  /** 女猎手：追踪 —— 选一名幸存者展示距离 */
  | { type: 'pickTrackerTarget'; targetPlayerId: string }
  /** 「或」牌：打出时选一组效果（index 指向 alternatives） */
  | { type: 'chooseEffectOption'; optionIndex: number }
  /** 【超听觉】多条最快路径时选一条 */
  | { type: 'chooseMovePath'; pathIndex: number }
  /** 雕像进化 1 级：升级时切换主雕像（或不切） */
  | { type: 'pickStatueEvoSwitch'; statueId: string }
  | { type: 'skipStatueEvoSwitch' }
  /** 未命名：升级时选一张进化卡牌 */
  | { type: 'pickEvolutionCard'; cardId: string }
  /** 解锁二选一（刺耳噪声 / 酸液喷吐）：挑一张入手 */
  | { type: 'pickUnlockChoice'; cardId: string }
  /** 扼杀者规则：幸存者移除自己地点的一个核心标记（一般行动·特殊行动） */
  | { type: 'removeCoreMarker'; actorPlayerId?: string }
  /** 扼杀者：点一个地点放核心标记（茂盛） */
  | { type: 'placeCoreMarker'; roomId: string }
  /** 扼杀者：点一个「带核心标记」的地点封堵×1（枝條生長） */
  | { type: 'blockadeAtCore'; roomId: string }
  /** 扼杀者：传送到带核心/封堵标记的地点（傳送聚合 用法一） */
  | { type: 'teleportToCore'; roomId: string }
  /** 扼杀者：移动一个核心标记到相邻地点（傳送聚合 用法二，两步：选源 → 选目标） */
  | { type: 'moveCoreMarker'; roomId: string }
  /** 未命名：酸液喷吐 —— 选一个相邻地点（伤害两地点的幸存者并封堵它们之间的门） */
  | { type: 'sprayAcid'; roomId: string }
  // —— 女王（killer9）——
  /** 女王移动时：带 N 个僵尸一起走，或取消 */
  | { type: 'confirmQueenMove'; count?: number; cancel?: boolean }
  /** 抓住他們！：选一个僵尸〔搜索〕 */
  | { type: 'pickZombieSearch'; zombieId: string }
  /** 屍群來了：选出发地点 / 目的地（按当前待选阶段分岔） */
  | { type: 'pickZombieHorde'; roomId: string }
  /** 屍體爆炸：选要献祭的僵尸 */
  | { type: 'pickZombieSacrifice'; zombieId: string }
  /** 十字弩：进入待选 */
  | { type: 'useCrossbow'; actorPlayerId?: string }
  /** 十字弩：确认消灭选中的僵尸 */
  | { type: 'confirmCrossbow'; zombieIds: string[]; actorPlayerId?: string }
  /** 女王等级 4：点 2 个不同地点各生成 1 个僵尸 */
  | { type: 'pickQueenSpawnRoom'; roomId: string }
  /** 扼杀者进化 4 级：点 2 个不同地点各放一个核心标记 */
  | { type: 'pickStranglerCoreRoom'; roomId: string }
  /** 女王对局：进入游戏后指定十字弩持有者 */
  | { type: 'pickCrossbowHolder'; holderId: string }
  /** 迪伦·温「坚毅」：用坚毅标记挡掉这次伤害（或不用） */
  | { type: 'confirmResilience'; use: boolean }
  /** 欧菲莉亚「言语鼓励」：移除目标全部恐惧 + 放鼓励标记 */
  | { type: 'useEncourage'; targetPlayerId?: string; actorPlayerId?: string }
  /** 凯莱布「幸运币」：弃搜索牌库顶 1 张（钥匙→治疗，否则→移动 0-2） */
  | { type: 'useLuckyCoin'; actorPlayerId?: string }
  /** 迪伦「机械知识」：在锤子地点从弃牌堆拿工具箱 */
  | { type: 'useMechanicalKnack'; actorPlayerId?: string }
  /** 欧菲莉亚「第六感」：选 1 张留下，另 1 张放回搜索牌库顶 */
  | { type: 'resolveSixthSense'; cardId: string }
  /** 刺耳噪声：选择是否把这张牌背面向上放到摸牌堆顶 */
  | { type: 'resolveDeckTop'; toDeckTop: boolean }
  /** 可选效果（牌面写了「可以」）：执行还是跳过 */
  | { type: 'resolveOptionalEffect'; use: boolean }
  | { type: 'clearFear' }
  | { type: 'removeBlockade' }
  | { type: 'tradeItem'; targetPlayerId: string; itemId: string; amount?: number; receiveItemId?: string; fromPlayerId?: string }
  /**
   * 【分头行动】**给钥匙**（额外行动）：同一地点的幸存者之间给任意把
   * **单独保管的钥匙**。流程和给物品一致 —— 先点给出、选几把、对方确认。
   */
  | { type: 'tradeKeys'; targetPlayerId: string; amount: number; fromPlayerId?: string }
  | { type: 'respondTrade'; accept: boolean }
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
  | { type: 'useItem'; itemId: string; targetPlayerId?: string; toRoomId?: string; useToolbox?: boolean; actorPlayerId?: string }
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
      /**
       * **剛毅之盾**（墓穴遗物）：它**不占「一次只能选一件防御物品」的名额**，
       * 所以单独一个开关 —— 可以和 `itemId` 同时用。
       */
      shield?: boolean;
    }
  | {
      type: 'encounterFlee';
      moveToRoomId: string | null;
      /**
       * 【变体1】特性 09「生存本能」：撤离时可以走 **2 格**而不是 1 格
       * （走 2 格之后清空自己的全部恐惧标记）。不传 = 正常 1 格。
       */
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

export interface PublicSnapshot {
  roomCode: string;
  hostId: string;
  mode: GameMode;
  /**
   * **「分头行动」开关**（只在 1对3 `multi` / 2对3 `2v3` 下有意义）。
   * 规则开关存在 `GameState` 上，快照里下发给客户端画标识。
   */
  split: boolean;
  /**
   * 【分头行动】**本大回合的先手**（幸存者棋子 id）。
   *
   * 规则：第一个大回合由开局前选定的先手先做一般行动，然后**从左往右轮**；
   * **每个大回合结束后先手后移一位**（在还活着的幸存者里）。
   *
   * ⚠ 实现上就是"把 `turnOrder` 旋转成以他为第一" ——
   * 行动推进和**发现牌归属**（取 `turnOrder` 第一个活人）全都自动跟着走。
   */
  splitFirstId: string | null;
  /** 座位顺序（**不旋转**的基准），开局第一次轮转时记下 */
  splitOrderBase: string[];
  soloKillerCharacterId: string | null;
  soloSurvivorCharacterIds: string[];
  /** 女王对局：十字弩持有者（进入游戏后指定） */
  crossbowHolderId?: string | null;
  crossbowAssigned?: boolean;
  /** 能否去指定十字弩持有者 */
  canPickCrossbowHolder?: boolean;
  /**
   * 【解散房间】正在等确认：谁发起的、已经确认了谁、还差谁。
   * `null` / 不存在的字段 = 现在没有解散请求。
   */
  disband?: {
    requestedBy: string;
    requestedByName: string;
    confirmed: string[];
    waiting: string[];
    /** 观看者自己确认过没有 */
    youConfirmed: boolean;
  } | null;
  /** 房间已经解散：客户端收到之后直接退回主界面 */
  disbanded?: boolean;
  /** 观看者能不能点【解散房间】（观众不行） */
  canRequestDisband?: boolean;
  /**
   * 【重新开始】正在等确认（和解散同一套；确认完**不解散房间**，回大厅重开）。
   * `null` / 不存在的字段 = 现在没有重新开始请求。
   */
  restart?: {
    requestedBy: string;
    requestedByName: string;
    confirmed: string[];
    waiting: string[];
    /** 观看者自己确认过没有 */
    youConfirmed: boolean;
  } | null;
  /** 观看者能不能点【重新开始】（观众不行） */
  canRequestRestart?: boolean;
  /** 迪伦·温「坚毅」：等玩家决定是否用坚毅标记 */
  pendingResilience?: { playerId: string; amount: number } | null;
  /** 鼓励标记持有者（**只给幸存者**，杀手看不到） */
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
  phase: Phase;
  round: number;
  isHost: boolean;
  you: PublicPlayerView & { hand: string[]; skillUsedThisTurn: string[] };
  controllingActive: boolean;
  players: PublicPlayerView[];
  map: MapDef;
  /** 大厅里可选的地图（只列画好底图、能真正开打的） */
  playableMaps: Array<{ id: string; name: string; backgrounds?: { survivor?: string; killer?: string } }>;
  rules: RulesDef;
  characters: CharacterDef[];
  noises: string[];
  keysCollected: number;
  /**
   * **「分头行动」各人单独保管的钥匙数**（`playerId → 把数`）。
   * 只有幸存者视角有；杀手视角是空的（找到钥匙不报告杀手）。
   */
  splitKeys?: Record<string, number>;
  /**
   * **「分头行动」一个人单独逃脱要几把钥匙**（默认 3，见 `SPLIT_ESCAPE_KEYS`）。
   * 客户端拿它显示「几把 / 3 把」，不用在前端再写一遍常量。
   */
  splitEscapeKeys?: number;
  /** 【变体1】开关（界面显示变体状态、决定要不要画特性卡区） */
  variant1?: boolean;
  /** 【变体1】生存难度等级（显示用） */
  traitDifficulty?: TraitDifficulty;
  /**
   * 【变体1】**当前可见的特性卡定义**（只下发看得见的那些，不是整包 40 张）。
   * 客户端拿它画卡面、点开放大。
   */
  traitDefs?: TraitDef[];
  /** 【变体1】现在轮到**你**选的那一份（客户端据此弹窗）；没轮到你就是 null */
  yourTraitPick?: {
    playerId: string;
    playerName: string;
    options: string[];
    /** 要选几张（幸存者 1 张；杀手按难度 1/2/3 张） */
    keep: number;
  } | null;
  /** 【变体1】还等着选的人（界面显示"等待 XX 选特性"） */
  traitPickerIds?: string[];
  /** 【变体1】已经用掉的一次性特性（客户端据此把卡面**变暗**） */
  traitUsed?: string[];
  /**
   * 【变体1】杀手特性 14「嘲讽战术」：**等杀手自己选要弃的牌**（还差几张）。
   * `0` / 省略 = 没有这个任务。
   */
  pendingTraitDiscard?: number;
  /** 【变体1】感知命中后可以发动特性卡（10/15/16）—— 只发杀手 */
  pendingSenseTraits?: boolean;
  /**
   * 【变体1】特性 11「安静搜查」的询问：**只发给本人**。
   * 有值时表示"发现要发出响声了，问你要不要取消"。
   */
  pendingQuietSearch?: { playerId: string; from: 'suitcase' | 'discovery' } | null;
  /** 【变体1】17 压迫威慑：等杀手选 1 名幸存者（只发杀手） */
  pendingTraitVictim?: { killerId: string; traitId: string; level: number } | null;
  /**
   * 【变体1】12 英勇阻截的询问 / 逐个选方向（**只发给持有人**）。
   * `started === false` = 还在问"要不要发动"；`started` = 队列里每个人各选 1 格方向。
   */
  /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消这次遭遇（只发杀手） */
  pendingPreyOffer?: boolean;
  pendingHeroicBlock?: {
    holderId: string;
    started: boolean;
    queue: string[];
    moved: string[];
  } | null;
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
  pendingBlockadeJob?: BlockadeJob | null;
  removableBoardBlockades?: Array<{ id: string; from: string; to: string }>;
  /** 乔治还没被拿走的笔记（杀手看不到内容） */
  georgeNotes?: Array<{ id: string; name: string }>;
  /** 乔治全部 3 张笔记的定义（双方都看得到，用于「乔治的笔记」图鉴） */
  allGeorgeNotes?: Array<{ id: string; name: string; text: string }>;
  /** 「思维敏捷」等乔治挑笔记 */
  pendingGeorgeNote?: boolean;
  /** 局中是否有乔治（决定要不要显示「乔治的笔记」按钮） */
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
  pendingSenseColorPick?: 'R' | 'B' | 'G' | null;
  /**
   * 路径草稿。`owner` 决定谁确认：
   *  - `survivor` = 幸存者自己在走（凯莱布幸运币的〔移動〕）
   *  - 缺省 = 杀手牌在走
   */
  pendingPathDraft?: {
    min: number;
    max: number;
    rooms: string[];
    owner?: 'killer' | 'survivor';
    actorId?: string;
  } | null;
  killerRepairGuess?: number;
  rematchReady?: string[];
  youRematchReady?: boolean;
  /** 是否开启【替换「鸿运当骰」等牌】 */
  replacementDeck?: boolean;
  /**
   * 雕像杀手的棋子列表（位置用 id 索引 state.players）。
   * 主雕像轮廓在杀手侧高亮；幸存者侧的猜测标记只发给幸存者。
   */
  statues?: Array<{
    /** 棋子 id */
    id: string;
    /** 1..4 */
    index: number;
    roomId: string | null;
    /** 是不是主雕像 */
    main: boolean;
    /** 本大回合是否被停滞 */
    halted: boolean;
    /**
     * 幸存者猜测：猜这尊雕像的**操控者颜色槽位**（只有幸存者视角才有）。
     *
     * 用槽位而不是 id —— 客户端 `cursorColor(slot)` 就能取到和座位一致的颜色，
     * 1对2 里两个人的猜测自动是两种颜色（用户要求"区分不同颜色"）。
     */
    guesserSlots?: number[];
  }>;
  /** 杀手选了但还没确认的切换目标 */
  pendingStatueSwitch?: string | null;
  /**
   * 雕像「巡邏 / 圍困」：等杀手**选下一尊要移动/搜索的雕像**（只有杀手视角）。
   *
   * ⚠ `options` **只列"能动的、还没选过的"** —— 被停滞的、已经行动过的
   * 直接不出现在选项里（用户要求）。
   */
  pendingStatuePick?: {
    kind: 'move' | 'search';
    /** 非空 = 正在走这一尊，这时不该再显示选项 */
    active: string | null;
    options: Array<{ id: string; index: number; roomId: string | null }>;
  } | null;
  /** 正在移动的雕像编号（1-4），杀手侧用来显示「当前是雕像 N 在移动」 */
  pendingStatueStepIndex?: number | null;

  /** 狼人宝藏：地图上还没开的宝箱 id 列表 */
  treasureChests?: string[];
  /** 宝藏牌堆剩余张数 */
  treasureDeckCount?: number;
  isWerewolfKiller?: boolean;
  /**
   * 女猎手猎手陷阱：标记位置双方可见，
   * 但 kind 只有杀手视角才有值（幸存者拿到的永远是 null，显示问号）。
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
   * 客户端据此在**快速阶段也让地图点击生效** —— 猎手本能是快速牌，
   * 打完就要点地点，不能等"结束快速阶段"。
   */
  killerSenseRoomActive?: boolean;
  /**
   * 【保護色】持有这张进化卡牌 →「恐詭管道」的落点是**整张地图**
   * （不再是"带秘密通道的地点"）。客户端用它把「或」选项的按钮文案写准。
   */
  passageStealthAnywhere?: boolean;
  pendingSenseRoom?: string | null;
  /**
   * **杀手打牌后拿到的信息区**（地图右边那块，类似战报）——
   * 只放"打出卡牌获得的信息"（感知看到了谁、追蹤距离、红外探测结果…）。
   *
   * 只有杀手视角有；每个杀手回合开始时清空。
   */
  killerIntel?: Array<{ title: string; lines: string[] }>;
  /**
   * **杀手当前打出的牌 id**（双方都下发）——
   * 幸存者在地图右边看到它的卡面，知道杀手打了什么。
   */
  currentKillerCardId?: string | null;
  /** 追踪：等杀手选一名幸存者 */
  pendingTrackerPick?: boolean;
  /** 君臨天下：等杀手选一名目击者移动（只有杀手视角） */
  pendingMoveSurvivorPick?: string[];
  /** 杀手地图上的「目击立绘」位置（只有杀手视角） */
  witnessedAt?: Record<string, string>;
  /** 「或」牌：等杀手选一组效果 */
  pendingEffectChoice?: {
    options: import('../content/schema.js').EffectDef[][];
  } | null;
  /** 【超听觉】多路径选择（只给杀手；含每条路径的房间名） */
  pendingMoveChoices?: Array<{
    label: string;
    rooms: Array<{ id: string; name: string }>;
  }> | null;
  /** 雕像进化 1 级：等杀手决定是否转换主雕像 */
  pendingStatueEvoSwitch?: boolean;
  /** 已点、待确认的那尊雕像（选择要确认，点完不会立刻切换） */
  pendingStatueEvoTarget?: string | null;
  /** 雕像「重整旗鼓」：卡牌效果允许切换主雕像 */
  pendingStatueRally?: boolean;
  /** 这次重整旗鼓的切换机会是否已用掉 */
  pendingStatueRallySwitched?: boolean;
  /** 2对3：两名杀手的先后手偏好是否已一致（未定则继续在大厅提示选） */
  killerOrderDecided?: boolean;
  /** 2对3：本轮的先后手顺序（两个杀手棋子 id） */
  killerTurnOrder?: string[];
  /** 2对3：这一轮轮到第几个杀手（0=先手，1=后手） */
  killerTurnIndex?: number;
  /** 2对3：本局所有杀手棋子 id */
  killerIds?: string[];
  /**
   * 2对3：【查看另一名杀手界面】用的只读信息。
   * 两名杀手各自只看自己的行动区/卡牌区，但规则允许互相查看 —— 只展示，不给操作入口。
   */
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
    /** 现在是不是轮到他行动 */
    isActing: boolean;
    evolutionEffects: Array<{ level: number; text: string }>;
  } | null;
  /** 雕像：开局准备是否已选定主雕像（选定后本局不能改） */
  statueMainLocked?: boolean;
  /** 等玩家点门封堵：地点 + 还差几扇 */
  pendingBlockadeRoom?: string | null;
  pendingBlockadeRemaining?: number;
  /** 核心标记满 5 个时：正准备放到哪个地点（等玩家选移除哪个） */
  pendingCoreOverflowPlaceAt?: string | null;

  // —— 女王（killer9）：僵尸 & 中毒 ——
  isQueenKiller?: boolean;
  /** 地图上的僵尸（双方地图都要同步显示） */
  zombies?: Array<{ id: string; roomId: string; art: number; power: number }>;
  /** 每个僵尸的战力（= 女王力量） */
  zombiePower?: number;
  zombieMax?: number;
  /** 已〔中毒〕的幸存者 id（状态栏上的中毒标记） */
  poisoned?: string[];
  /** 这名观看者（幸存者）能否使用十字弩 */
  canUseCrossbow?: boolean;
  /** 十字弩待选（只给该幸存者） */
  pendingCrossbow?: { zombieIds: string[]; max: number } | null;
  /** 女王移动选僵尸（只给杀手） */
  pendingQueenMove?: { toRoomId: string; zombieCount: number } | null;
  pendingZombieSearch?: string[] | null;
  pendingZombieHordeFrom?: string[] | null;
  pendingZombieHordeTo?: string | null;
  pendingZombieSacrifice?: string[] | null;
  /** 女王等级 4：已选的生成地点（等点满 2 个） */
  pendingQueenSpawnRooms?: string[] | null;
  /** 扼杀者进化 4 级：已点选的地点 */
  pendingStranglerCoreRooms?: string[] | null;
  /**
   * 乔治「拆封堵」笔记：**玩家正在选要拆哪几个**（最多 2 个）。
   * 打出笔记后进入这个状态；选满或确认才真的拆、才消耗笔记。
   */
  pendingGeorgeBlockade?: {
    noteId: string;
    doors: string[];
    picked: string[];
  } | null;
  /** 扼杀者：地图上的核心标记（双方地图同步） */
  coreMarkers?: string[];
  /** 幸存者能否移除自己地点的核心标记（扼杀者规则） */
  canRemoveCoreMarker?: boolean;
  isStranglerKiller?: boolean;
  /** 未命名：永久移除的卡牌 */
  killerRemovedPermanently?: string[];
  /** 未命名：已获得的进化卡牌（杀手信息里高亮 + 列效果） */
  chosenEvolutionCards?: Array<{ id: string; name: string; text: string }>;
  /** 未命名：等杀手选一张进化卡牌 */
  pendingEvolutionCardPick?: Array<{ id: string; name: string; text: string }> | null;
  /** 解锁二选一（刺耳噪声 / 酸液喷吐）：等杀手挑一张 */
  pendingUnlockChoice?: Array<{ id: string; name: string; text: string }> | null;
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
  /** 刺耳噪声：待决定是否放牌库顶的那张牌（杀手侧） */
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
  /** 这是不是雕像杀手在场 */
  isStatueKiller?: boolean;
  allKillerCards?: Array<{ id: string; name: string; locked: boolean }>;
  survivorActionsDone?: boolean;
  senseHighlight?: 'R' | 'B' | 'G' | null;
  pendingMoveRange?: number | null;
  pendingMoveMin?: number;
  pendingMoveTaken?: number;
  pendingLurkPick?: boolean;
  pendingAmulet?: PendingAmulet | null;
  repairedThisPhase?: boolean;
  firecrackerThisRound?: boolean;
  firecrackerRoomId?: string | null;
  suitcaseAvailable?: boolean;
  // —— 地图特殊规则（实验室 / 城堡）——
  /** 【实验室】G3 的急救箱标记是否还在 */
  firstAidKit?: boolean;
  /** 【实验室】急救箱所在房间（客户端显示用） */
  firstAidRoomId?: string;
  /** 【实验室】当前观众能不能用急救箱（在 G3、有一般行动、标记还在） */
  canUseFirstAidKit?: boolean;
  /** 【雕像・召唤石碑】正在选门：`true` 时地图点击要路由到选门；`from` 是已点的第一端 */
  pendingStatueSeal?: boolean;
  pendingStatueSealFrom?: string | null;
  /**
   * 【未命名・變形 / 戰鬥適應】等杀手从弃牌堆里选要永久移除的牌。
   * `options` 是可选的牌（刚打出的那张已排除）。
   */
  pendingDiscardRemove?: {
    remaining: number;
    cardName: string;
    options: Array<{ id: string; name: string }>;
  } | null;
  /**
   * **遭遇防御阶段能选的防御物品**（服务端算，客户端不自己维护清单）。
   * 一次防御只能选一件；骰子自动、「剛毅之盾」不占名额。
   */
  defenseItemChoices?: Array<{ id: string; name: string; hint: string }>;
  /** 【城堡】场上的机关大门门号（`"A|B"`；双方都看得到） */
  leverGateDoorId?: string | null;
  /** 这道机关大门是谁操作控制杆放的（名字，双方都看得到） */
  leverGateOwnerName?: string | null;
  /** 【城堡】杀手过门要弃 3 张手牌，等他自选（只有杀手视角有） */
  pendingGatePay?: { toRoomId: string; doorId: string; cost: number; ownerName?: string | null } | null;
  /** 【城堡】当前观众能不能在 R1 放机关大门 */
  canPlaceLeverGate?: boolean;
  /** 【城堡】B4 的"第一次有人进入"是否已触发 */
  castleHallFirstEnterDone?: boolean;
  // —— 【墓穴】——
  /** 已经坍塌的地点（双方都看得到） */
  collapsedRooms?: string[];
  /**
   * 【墓穴】坍塌后「屋里的人轮流走一步」的当前状态。
   * 轮到你时 `currentId` 是你、`options` 是能去的相邻地点；
   * `waiting = true` 表示是别人在选（只能看，不能操作）。
   */
  pendingCollapseMoves?: {
    roomId: string;
    currentId: string | null;
    name: string;
    options: string[];
    mustMove: boolean;
    waiting: boolean;
    /** 轮到的是杀手（要额外弃光手牌） */
    isKiller?: boolean;
  } | null;
  /**
   * 【墓穴】遗物室所在地点。
   *
   * ⚠ **这张图没有遗物室时是 `null`** —— 遗物室只有**墓穴的 R6**才有。
   * 别的图（城堡等）也有叫 R6 的房间，所以不能硬编码下发 `'R6'`，
   * 否则站在那张图 R6 上的幸存者会看到「抽取遗物」。
   */
  relicRoomId?: string | null;
  /** 【墓穴】遗物标记是否正面朝上 */
  relicMarkerFaceUp?: boolean;
  /** 【墓穴】遗物牌堆剩几张 */
  relicDeckCount?: number;
  /** 【墓穴】当前观众能不能抽遗物 */
  canDrawRelic?: boolean;
  /** 【墓穴遗物】这名观众摊在面前的遗物牌（牌名，双方都看得到） */
  relics?: Array<{ id: string; name: string }>;
  /** 【墓穴遗物】鏡之門戶：现在能不能用 */
  canUseMirrorPortal?: boolean;
  /** 【墓穴遗物】鏡之門戶能传送到的 🌀 螺旋地点 */
  mirrorTargets?: string[];
  /** 【墓穴遗物】洞察之球：现在能不能用（特殊行动，在可搜索的地点依次摸两张牌） */
  canUseInsightOrb?: boolean;
  highlightRoomIds?: string[];
  survivorDiscard?: Array<{ id: string; name: string }>;
  encounterTailBonus?: number;
  yourDiscardPile: Array<{ id: string; name: string }>;
  pendingSurvivorPick: boolean;
  pendingDiscoveryPick: boolean;
  discoveryActorId: string | null;
  pileCounts: {
    search: number;
    discovery: number;
    treasure: number;
    /** 【墓穴 R6】遗物牌堆 */
    relic: number;
    discard: number;
    killerDraw: number;
    killerDiscard: number;
  };
  pileCards: {
    search: Array<{ id: string; name: string }>;
    discovery: Array<{ id: string; name: string }>;
    treasure: Array<{ id: string; name: string }>;
    /** 【墓穴 R6】遗物牌堆 */
    relic: Array<{ id: string; name: string }>;
    discard: Array<{ id: string; name: string }>;
    killerDraw: Array<{ id: string; name: string }>;
    killerDiscard: Array<{ id: string; name: string }>;
  };
  pileTops: {
    search: { id: string; name: string } | null;
    discovery: { id: string; name: string } | null;
    treasure: { id: string; name: string } | null;
    /** 【墓穴 R6】遗物牌堆 */
    relic: { id: string; name: string } | null;
    discard: { id: string; name: string } | null;
    killerDraw: { id: string; name: string } | null;
    killerDiscard: { id: string; name: string } | null;
  };
  pendingItemDiscard: {
    playerId: string;
    count: number;
    /** 给弃装界面用：即使当前仍是杀手视角也能看到该幸存者背包 */
    name?: string;
    inventorySlots?: number;
    items?: Record<string, number>;
  } | null;
  pendingTrade: {
    fromPlayerId: string;
    fromName: string;
    targetPlayerId: string;
    targetName: string;
    itemId: string;
    itemName: string;
    amount: number;
    receiveItemId?: string;
    receiveItemName?: string;
    /** 【分头行动】`'keys'` = 这笔是**给钥匙**（钥匙不在物品栏里，客户端文案要分开写） */
    kind?: 'item' | 'keys';
  } | null;
  pendingCoopAction: {
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
  /** 遭遇防御掷完骰、等决定是否重掷（鸿运当骰） */
  pendingDice?: PendingDice | null;
  encounter: EncounterState | null;
  killerHandCount: number;
  killerDeckCount: number;
  yourKillerHand: string[] | null;
  yourKillerLocked?: string[] | null;
  winner: 'killer' | 'survivors' | null;
  winReason: string | null;
  logs: LogEntry[];
  activePlayerId: string | null;
  legalMoves: string[];
  cardById: Record<string, CardDef>;
  trapRoomIds: string[];
  /** 【陷阱零件】使用后留下标记的地点（只有幸存者看得到） */
  trapPartRooms: string[];
  stealthOriginRoomId: string | null;
  turnOrder: string[];
}

export type EffectContext = {
  state: GameState;
  actorId: string;
  effects: EffectDef[];
  targetRoomId?: string;
  targetPlayerId?: string;
  out?: { attackValue?: number; defenseValue?: number };
};
