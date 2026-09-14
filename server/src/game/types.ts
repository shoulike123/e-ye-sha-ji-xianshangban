/**
 * 服务器心里的“棋盘长什么样”。
 * GameState = 整桌的秘密真相；PublicSnapshot = 发给某个人看的删节版。
 */
import type { CardDef, CharacterDef, EffectDef, MapDef, RulesDef } from '../content/schema.js';

/** 现在棋局走到哪一页：大厅、选角、求生者、发现、噪音、杀手、遭遇、结束 */
export type Phase =
  | 'lobby'
  | 'characterSelect'
  | 'survivorMain'
  | 'discovery'
  | 'noiseReport'
  | 'killerMain'
  | 'encounter'
  | 'upkeep'
  | 'gameOver';

export type Faction = 'killer' | 'survivor' | 'spectator';
/** solo=一个人热座，duo=1对1，vs2=1VS2两人共控求生者，multi=1VS3各控自己 */
export type GameMode = 'solo' | 'duo' | 'vs2' | 'multi';
/** 遭遇四步：选人 → 杀手进攻 → 求生者加防 →（旧规则留下的逃离，当前几乎不用） */
/** 遭遇：选人 → 杀手是否加攻 → 求生者是否加防 → 被发现的人可移动 1 格 */
export type EncounterStep = 'pick' | 'attack' | 'defend' | 'flee';
/** 杀手回合三阶段：快速牌 → 主要行动 → 慢速牌 */
export type KillerTurnStep = 'fast' | 'main' | 'slow';
/** 第三阶段二选一：2 次走路/搜索，或 1 张特殊牌 */
export type KillerMainChoice = 'actions' | 'special' | null;

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
}

/** all=两边都看；survivor=只有求生者；killer=只有杀手（潜行中的走路等） */
export type LogVis = 'all' | 'survivor' | 'killer';

export interface LogEntry {
  t: number;
  text: string;
  vis?: LogVis;
}

export type StealthRevealKind = 'vanishScare' | 'lurkPick' | 'bloomKill';

export interface PendingAmulet {
  playerId: string;
  amount: number;
  sourceId: string;
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
  defenseOptions: Record<string, string[]>;
  fleeQueue: string[];
  /** 遭遇开始时被发现的求生者，战后可移 1 格 */
  discoveredIds: string[];
  /** 开战时该地有陷阱：本场遭遇必触发（防御 +2 一次） */
  trapArmed: boolean;
  /** 本场是否已结算过陷阱的防御加成 */
  trapApplied: boolean;
}

export interface GameState {
  roomCode: string;
  hostId: string;
  mode: GameMode;
  soloKillerCharacterId: string | null;
  soloSurvivorCharacterIds: string[];
  /** 1对1 / 1VS2：哪些真人在操控求生者棋子 */
  survivorOperators: Array<{ id: string; name: string; connected: boolean }>;
  /** 1VS2：一般行动/额外行动等队友确认 */
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
  rules: RulesDef;
  characters: CharacterDef[];
  cardById: Record<string, CardDef>;
  players: Record<string, PlayerState>;
  turnOrder: string[];
  activeSurvivorIndex: number;
  killerId: string | null;
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
  /** 1VS3：给予/互换等对方点确认 */
  pendingTrade: {
    fromPlayerId: string;
    targetPlayerId: string;
    itemId: string;
    amount: number;
    receiveItemId?: string;
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
  repairedThisPhase: boolean;
  firecrackerThisRound: boolean;
  /** 爆竹标记所在格：杀手回合开始时的位置；潜行则等重现后再放 */
  firecrackerRoomId: string | null;
  /** 木屋 R4 手提箱：true=图一可摸发现牌，false=图二本大回合已用 */
  suitcaseAvailable: boolean;
  encounterTailBonus: number;
  /** 本求生者大回合已修满 5，等大回合结束再把警车放到 5 */
  pendingRescueArm: boolean;
  /** 杀手上次被允许看到的钥匙数（大回合结束才更新） */
  killerPublicKeys: number;
  /** 杀手自己猜的修理进度 0–5，和真实进度无关 */
  killerRepairGuess: number;
  /** 进化发锁定牌导致手牌超员时，才允许自选弃一张 */
  pendingUnlockDiscard: boolean;
  /** 呼啸而过：先点路径，确认后才走路+惊吓 */
  pendingPathDraft: { min: number; max: number; rooms: string[] } | null;
  /** 感知已选颜色，等确认 */
  pendingSenseColorPick: 'R' | 'B' | 'G' | null;
  rematchReady: string[];
  /** 本回合临时力量（疯狂 +2、谋杀者重现 +3 等），与永久力量分开显示如 4+3；回合结束清掉 */
  killerTurnPowerBonus: number;
  /** 升级后停下来让杀手确认新效果 */
  pendingEvolutionAck: { fromLevel: number; toLevel: number } | null;
  /** 幽魂 2 级：呼啸而过结算完，可选弃 2 张搜索当前格 */
  pendingWhizSearch: boolean;
  /** 幽魂 3 级：当前这一次过度，等杀手选弃 3 伤害或不用 */
  pendingOverFearWound: { targetId: string } | null;
  pendingOverFearQueue: string[];
  /** 遭遇开战效果还没走完（先惊吓，再 5 级伤害，再选人） */
  encounterOpenHold: boolean;
  /** 刚打出的是呼啸而过，等路径/惊吓走完再问要不要搜索 */
  whizJustResolved: boolean;
  /** 升到谋杀者 4 级后，确认进化再立刻选 4 扇门 */
  pendingEvoFourBlockade: boolean;
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
  | { type: 'setSoloKiller'; characterId: string }
  | { type: 'setSoloSurvivor'; characterId: string }
  | { type: 'setFaction'; faction: 'killer' | 'survivor' }
  | { type: 'selectCharacter'; characterId: string }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startGame' }
  | { type: 'pickSurvivorTurn'; playerId: string }
  | { type: 'move'; toRoomId: string }
  | { type: 'search' }
  | { type: 'repair' }
  | { type: 'clearFear' }
  | { type: 'removeBlockade' }
  | { type: 'tradeItem'; targetPlayerId: string; itemId: string; amount?: number; receiveItemId?: string; fromPlayerId?: string }
  | { type: 'respondTrade'; accept: boolean }
  | { type: 'respondCoopAction'; accept: boolean }
  | { type: 'discardItem'; itemId: string }
  | { type: 'useSkill'; skillId: string; targetPlayerId?: string; toRoomId?: string; itemId?: string; actorPlayerId?: string }
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
  | { type: 'playEncounterAttack'; cardId: string | null; boost?: boolean }
  | { type: 'playEncounterDefense'; cardId: string | null; itemId?: string | null }
  | { type: 'encounterFlee'; moveToRoomId: string | null }
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
  soloKillerCharacterId: string | null;
  soloSurvivorCharacterIds: string[];
  phase: Phase;
  round: number;
  isHost: boolean;
  you: PublicPlayerView & { hand: string[]; skillUsedThisTurn: string[] };
  controllingActive: boolean;
  players: PublicPlayerView[];
  map: MapDef;
  rules: RulesDef;
  characters: CharacterDef[];
  noises: string[];
  keysCollected: number;
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
  encounterOpenHold?: boolean;
  killerLevel: number;
  pendingKillerDiscards: number;
  pendingBlockade: boolean;
  pendingBlockadePlace?: string | null;
  relocatableBlockades?: Array<{ id: string; from: string; to: string }>;
  pendingSensePair?: { firstRoomId: string | null; secondRoomId?: string | null } | null;
  pendingSenseColor?: boolean;
  pendingSenseColorPick?: 'R' | 'B' | 'G' | null;
  pendingPathDraft?: { min: number; max: number; rooms: string[] } | null;
  killerRepairGuess?: number;
  rematchReady?: string[];
  youRematchReady?: boolean;
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
    discard: number;
    killerDraw: number;
    killerDiscard: number;
  };
  pileCards: {
    search: Array<{ id: string; name: string }>;
    discovery: Array<{ id: string; name: string }>;
    treasure: Array<{ id: string; name: string }>;
    discard: Array<{ id: string; name: string }>;
    killerDraw: Array<{ id: string; name: string }>;
    killerDiscard: Array<{ id: string; name: string }>;
  };
  pileTops: {
    search: { id: string; name: string } | null;
    discovery: { id: string; name: string } | null;
    treasure: { id: string; name: string } | null;
    discard: { id: string; name: string } | null;
    killerDraw: { id: string; name: string } | null;
    killerDiscard: { id: string; name: string } | null;
  };
  pendingItemDiscard: {
    playerId: string;
    count: number;
    /** 给弃装界面用：即使当前仍是杀手视角也能看到该求生者背包 */
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
