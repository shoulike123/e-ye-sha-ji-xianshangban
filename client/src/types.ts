/**
 * 网页这边看到的局面形状。
 * 和服务器 types 差不多，但只有“发给你的那一份”，没有隐藏情报。
 */
export type Faction = 'killer' | 'survivor' | 'spectator';
export type GameMode = 'solo' | 'duo' | 'vs2' | 'multi';
export type EncounterStep = 'pick' | 'attack' | 'defend' | 'flee';
export type KillerTurnStep = 'fast' | 'main' | 'slow';
export type KillerMainChoice = 'actions' | 'special' | null;

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

export interface CardDef {
  id: string;
  name: string;
  type: string;
  speed?: string;
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
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  side?: 'killer' | 'survivor' | 'both';
  roomId?: string;
  label?: string;
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
  stealth: boolean;
  moveLeft: number;
  actionsLeft: number;
  mainActionUsed: boolean;
  actedThisRound?: boolean;
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
  pendingAmulet?: { playerId: string; amount: number; sourceId: string } | null;
  repairedThisPhase?: boolean;
  firecrackerThisRound?: boolean;
  firecrackerRoomId?: string | null;
  suitcaseAvailable?: boolean;
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
    discard: number;
    killerDraw: number;
    killerDiscard: number;
  };
  pileCards?: {
    search: Array<{ id: string; name: string }>;
    discovery: Array<{ id: string; name: string }>;
    treasure: Array<{ id: string; name: string }>;
    discard: Array<{ id: string; name: string }>;
    killerDraw: Array<{ id: string; name: string }>;
    killerDiscard: Array<{ id: string; name: string }>;
  };
  pileTops?: {
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
  pendingPathDraft?: { min: number; max: number; rooms: string[] } | null;
  killerRepairGuess?: number;
  rematchReady?: string[];
  youRematchReady?: boolean;
  /** 是否开启【替换「鸿运当骰」等牌】 */
  replacementDeck?: boolean;
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
  | { type: 'setMap'; mapId: string }
  /** 房主开关【替换「鸿运当骰」等牌】 */
  | { type: 'setReplacementDeck'; on: boolean }
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
  /** 遭遇防御：用「鸿运当骰」重掷选中的骰子 / 接受当前结果 */
  | { type: 'rerollEncounterDice'; diceIndexes: number[] }
  | { type: 'resolveEncounterDice' }
  | { type: 'clearFear' }
  | { type: 'removeBlockade' }
  | { type: 'tradeItem'; targetPlayerId: string; itemId: string; amount?: number; receiveItemId?: string; fromPlayerId?: string }
  | { type: 'respondTrade'; accept: boolean }
  | { type: 'respondCoopAction'; accept: boolean }
  | { type: 'discardItem'; itemId: string }
  | { type: 'useSkill'; skillId: string; targetPlayerId?: string; toRoomId?: string; itemId?: string; actorPlayerId?: string }
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
