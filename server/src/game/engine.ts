/**
 * 规则裁判（整副游戏最重要的文件）。
 *
 * 小朋友可以这样想：
 * - 网页只负责“画出棋盘、收集你点了哪个按钮”
 * - 这个文件负责当裁判：现在轮到谁、这步合不合法、打完之后局面变成什么样
 *
 * 走路、封堵、摸牌、受伤的具体动作在 effects.ts。
 * 杀手牌一张张结算在 killerCards.ts。
 */
import type { GameContent } from '../content/loader.js';
import type { CardDef } from '../content/schema.js';
import {
  addFear,
  applyDamage,
  applyPassiveBonuses,
  checkSurvivorWin,
  doRepair,
  doSearch,
  drawKillerCards,
  discardFromKillerDeck,
  legalMoveRooms,
  killerAdjacentRooms,
  roomsAdjacentKiller,
  log,
  pushNoise,
  removeBlockade,
  roomName,
  runEffects,
  shuffle,
  survivorsInRoom,
  tryMove,
  buildSearchDeck,
  doorsAt,
  legalBlockadeRooms,
  placeBlockade,
  itemCount,
  inventorySlotsFor,
  takeItem,
  itemName,
  isKeyCard,
  canUseDefenseItem,
  applyDefenseItem,
  hasTenacity,
  applyHeal,
  healItemDef,
  setStealth,
  trySecretPassage,
  clearTrapAfterEncounter,
  cardHandCost,
  discardUniqueCard,
  discardConsumedItem,
  cardBecomesPossession,
  mapAdjacentRooms,
  senseRooms,
  killerCardBlockedReason,
  injuredAlliesHere,
  assertHealSameRoom,
  isEngineeringExpert,
  killerInRoom,
  takeEarliestFromSurvivorDiscard,
  survivorDiscardHasItem,
  generalAdjacentRooms,
  enforceInventory,
  relocateBlockadeToPending,
  removableBlockades,
  parseDoor,
  maybeArmRescue,
  announceRepairIfJustFinished,
  personalItemBlockReason,
  canonicalDoorId,
  isDoorBlocked,
  addRepairProgress,
  addKeys,
  drawSearchCard,
  drawDiscoveryCard,
  setOverFearHandler,
  setUpgradeHandler,
} from './effects.js';
import {
  activeEvolutionLines,
  applyEncounterOpenEffects,
  applyMurdererRevealPower,
  confirmAnyDoor,
  effectiveKillerPower,
  emptyEvolutionFields,
  formatKillerPowerLabel,
  maybeOfferWhizSearch,
  markWhizFollowup,
  pickAnyDoorRoom,
  queueOverFearWound,
  removeBoardBlockade,
  resolveOverFearWound,
  resolveWhizSearch,
  removableForJob,
  roomsForAnyDoorPick,
  roomsForBlockadeRemove,
  runUpgrade,
  startPendingEvoFourIfNeeded,
  afterOneDoorPlaced,
  EVOLUTION_TEXT,
  killerKindOf,
  setEncounterOpenNoTargetsHandler,
} from './evolution.js';

setOverFearHandler(queueOverFearWound);
setUpgradeHandler(runUpgrade);
import {
  completeKillerCardMove,
  confirmPathDraft,
  finishKillerCardMove,
  confirmAmuletUse,
  continueKillerQueue,
  effectiveCardSpeed,
  finishLurkPick,
  forcedRevealAndSearch,
  encounterCardAttackBonus,
  hasPendingKillerChoice,
  resolveSenseColor,
  colorPrefixRooms,
} from './killerCards.js';
import type {
  ClientAction,
  EncounterState,
  Faction,
  GameMode,
  GameState,
  Phase,
  PlayerState,
  PublicPlayerView,
  PublicSnapshot,
} from './types.js';

/** 某些角色开局就自带东西：索菲亚有相机，马尔科有医药包 */
function startingItemsFor(characterId: string, characterName: string): Record<string, number> {
  const hay = `${characterId} ${characterName}`;
  // 旧写法「索菲娅」也认（历史存档、外部文案可能仍是旧名）
  if (/survivor4|索菲亚|索菲娅|sophia/i.test(hay)) return { sophia_camera: 1 };
  if (/survivor3|马尔科|marco/i.test(hay)) return { marco_medkit: 1 };
  return {};
}

/** 做一个空的玩家棋子：还没选阵营、还没放到地图上 */
function createPlayer(id: string, name: string, controllerId?: string): PlayerState {
  return {
    id,
    name,
    controllerName: name,
    controllerId: controllerId ?? id,
    faction: null,
    characterId: null,
    ready: false,
    connected: true,
    roomId: null,
    hp: 0,
    maxHp: 0,
    fear: 0,
    exposed: false,
    overFear: false,
    hand: [],
    items: {},
    alive: true,
    stealth: false,
    stealthOriginRoomId: null,
    moveLeft: 0,
    actionsLeft: 0,
    mainActionUsed: false,
    searchedThisTurn: false,
    repairedThisTurn: false,
    skillUsedThisTurn: new Set(),
    quietSearch: false,
    attackBonus: 0,
    moveBonus: 0,
    actedThisRound: false,
  };
}

function isSharedSurvivorMode(state: GameState): boolean {
  return state.mode === 'solo' || state.mode === 'duo' || state.mode === 'vs2';
}

function isSurvivorOperator(state: GameState, socketId: string): boolean {
  if (state.mode === 'solo') return socketId === state.hostId;
  if (state.mode === 'duo' || state.mode === 'vs2') {
    return state.survivorOperators.some((o) => o.id === socketId);
  }
  return false;
}

function controlsPiece(state: GameState, socketId: string, piece: PlayerState | undefined): boolean {
  if (!piece) return false;
  if (state.mode === 'solo' && socketId === state.hostId) return true;
  if (piece.faction === 'survivor' && isSurvivorOperator(state, socketId)) return true;
  return piece.controllerId === socketId;
}

function otherConnectedSurvivorOperator(state: GameState, socketId: string) {
  return state.survivorOperators.find((o) => o.id !== socketId && o.connected) ?? null;
}

function needsCoopConfirm(
  state: GameState,
  action: ClientAction,
  actor: PlayerState,
): boolean {
  if (state.mode !== 'vs2' || state.applyingConfirmedCoop) return false;
  if (actor.faction !== 'survivor') return false;
  return (
    action.type === 'move' ||
    action.type === 'search' ||
    action.type === 'repair' ||
    action.type === 'clearFear' ||
    action.type === 'removeBlockade' ||
    action.type === 'useItem' ||
    action.type === 'useSkill' ||
    action.type === 'useSuitcase'
  );
}

function coopActionSummary(state: GameState, action: ClientAction, actor: PlayerState): string {
  const dest =
    'toRoomId' in action && action.toRoomId ? roomName(state, action.toRoomId) : '';
  if (action.type === 'move') return `${actor.name} 移动到「${dest}」`;
  if (action.type === 'search') return `${actor.name} 搜索物资`;
  if (action.type === 'repair') return `${actor.name} 修理无线电`;
  if (action.type === 'clearFear') return `${actor.name} 消除恐惧`;
  if (action.type === 'removeBlockade') return `${actor.name} 移除封堵`;
  if (action.type === 'useItem') {
    const item = itemName(action.itemId);
    const tgt = action.targetPlayerId ? state.players[action.targetPlayerId]?.name : '';
    if (dest) return `${actor.name} 使用「${item}」→${dest}`;
    if (tgt) return `${actor.name} 使用「${item}」治疗 ${tgt}`;
    return `${actor.name} 使用「${item}」`;
  }
  if (action.type === 'useSkill') {
    const skill = action.skillId;
    if (dest) return `${actor.name} 发动「${skill}」→${dest}`;
    return `${actor.name} 发动「${skill}」`;
  }
  if (action.type === 'useSuitcase') return `${actor.name} 打开手提箱摸一张发现牌`;
  return `${actor.name} 的行动`;
}

/** 开一桌新牌：大厅、默认单人热座、规则和地图先摆好 */
export function createLobby(
  roomCode: string,
  hostId: string,
  hostName: string,
  content: GameContent,
  mapId?: string,
): GameState {
  const host = createPlayer(hostId, hostName);
  return {
    roomCode,
    hostId,
    mode: 'multi',
    soloKillerCharacterId: null,
    soloSurvivorCharacterIds: [],
    survivorOperators: [],
    pendingCoopAction: null,
    applyingConfirmedCoop: false,
    phase: 'lobby',
    round: 0,
    contentVersion: content.rules.id,
    map: content.maps.find((m) => m.id === mapId) ?? content.map,
    maps: content.maps,
    rules: content.rules,
    characters: content.characters,
    cardById: content.cards.byId,
    players: { [hostId]: host },
    turnOrder: [],
    activeSurvivorIndex: 0,
    killerId: null,
    noises: [],
    keysCollected: 0,
    repairProgress: 0,
    rescueCountdown: null,
    rescueArmed: false,
    searchDeck: [],
    searchDiscard: [],
    discoveryDeck: [],
    discoveryDiscard: [],
    killerDeck: [],
    killerDiscard: [],
    killerHand: [],
    blockades: [],
    killerPower: 0,
    killerLevel: 1,
    killerLocked: [],
    pendingKillerDiscards: 0,
    pendingBlockade: false,
    pendingBlockadePlace: null,
    blockadesThisAction: [],
    pendingSealQueue: [],
    sealAllRoomId: null,
    killerMainActionsLeft: 0,
    killerUsedSlowThisTurn: false,
    killerTurnStep: 'fast',
    killerMainChoice: null,
    lastDiscoveryCardId: null,
    discoveryOptions: [],
    lastDiceRoll: null,
    encounter: null,
    winner: null,
    winReason: null,
    logs: [{ t: Date.now(), text: `房间 ${roomCode} 已创建。` }],
    pendingMoveRange: null,
    pendingCardSpeed: null,
    pendingItemDiscard: null,
    pendingTrade: null,
    trapRoomIds: [],
    survivorDiscard: [],
    pendingSurvivorPick: false,
    pendingDiscoveryPick: false,
    discoveryActorId: null,
    pendingSensePair: null,
    pendingSenseColor: false,
    senseHighlight: null,
    pendingEffectQueue: [],
    pendingMoveMin: 0,
    lastMovePath: [],
    lastMoveCrossedBlockade: false,
    lastSearchFound: false,
    stealthRevealKind: null,
    pendingLurkPick: false,
    pendingAmulet: null,
    repairedThisPhase: false,
    firecrackerThisRound: false,
    firecrackerRoomId: null,
    suitcaseAvailable: true,
    encounterTailBonus: 0,
    pendingRescueArm: false,
    killerPublicKeys: 0,
    killerRepairGuess: 0,
    pendingUnlockDiscard: false,
    justUnlockedCards: [],
    pendingDice: null,
    pendingExtraRerolls: 0,
    replacementDeck: false,
    pendingPathDraft: null,
    pendingSenseColorPick: null,
    rematchReady: [],
    ...emptyEvolutionFields(),
  };
}

/** 把断线座位认领给新连上的人（同一房间码可反复进出） */
function adoptDisconnected(state: GameState, socketId: string, name: string): boolean {
  if (Object.values(state.players).some((p) => p.controllerId === socketId && p.connected)) {
    return true;
  }
  const byController = new Map<string, PlayerState[]>();
  for (const p of Object.values(state.players)) {
    const list = byController.get(p.controllerId) ?? [];
    list.push(p);
    byController.set(p.controllerId, list);
  }
  const dead = [...byController.entries()].filter(([, ps]) => ps.every((p) => !p.connected));
  if (dead.length === 0) return false;
  const named = dead.find(([, ps]) =>
    ps.some((p) => p.controllerName === name || p.name === name),
  );
  const pick = named?.[0] ?? (dead.length === 1 ? dead[0]![0] : null);
  if (!pick) return false;
  for (const p of Object.values(state.players)) {
    if (p.controllerId === pick) {
      p.controllerId = socketId;
      p.connected = true;
      if (name) p.controllerName = name;
    }
  }
  if (state.hostId === pick) state.hostId = socketId;
  for (const o of state.survivorOperators) {
    if (o.id === pick) {
      o.id = socketId;
      o.connected = true;
      if (name) o.name = name;
    }
  }
  if (state.pendingCoopAction?.fromControllerId === pick) {
    state.pendingCoopAction.fromControllerId = socketId;
  }
  log(state, `${name || '玩家'} 重新入座。`);
  return true;
}

function adoptDisconnectedOperator(state: GameState, socketId: string, name: string): boolean {
  const dead = state.survivorOperators.filter((o) => !o.connected);
  if (dead.length === 0) return false;
  const pick = dead.find((o) => o.name === name) ?? (dead.length === 1 ? dead[0]! : null);
  if (!pick) return false;
  const oldId = pick.id;
  pick.id = socketId;
  pick.connected = true;
  if (name) pick.name = name;
  for (const p of Object.values(state.players)) {
    if (p.controllerId === oldId) p.controllerId = socketId;
  }
  if (state.hostId === oldId) state.hostId = socketId;
  if (state.pendingCoopAction?.fromControllerId === oldId) {
    state.pendingCoopAction.fromControllerId = socketId;
  }
  log(state, `${name || '玩家'} 重新入座。`);
  return true;
}

/** 同学加入这桌。对局中优先坐回断线座位 */
export function addPlayer(state: GameState, id: string, name: string): void {
  if (state.players[id]) {
    state.players[id].connected = true;
    if (name) {
      state.players[id].name = name;
      state.players[id].controllerName = name;
    }
    return;
  }
  if (adoptDisconnected(state, id, name || '玩家')) return;
  if (adoptDisconnectedOperator(state, id, name || '玩家')) return;
  if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
    throw new Error('对局已经开始。请用离开时的昵称加入，即可坐回原位。');
  }
  if (state.mode === 'solo' && Object.keys(state.players).length >= 1) {
    throw new Error('单人模式只能房主一人，请先切换多人模式');
  }
  if (state.mode === 'duo' && Object.keys(state.players).length >= 2) {
    throw new Error('1 对 1 只能 2 人：一人杀手、一人操控 3 名幸存者');
  }
  if (state.mode === 'vs2' && Object.keys(state.players).length >= 3) {
    throw new Error('1对2 只能 3 人：一人杀手、两人共控 3 名幸存者');
  }
  if (state.mode === 'multi' && Object.keys(state.players).length >= 1 + state.rules.maxSurvivors) {
    throw new Error(`房间已满（1 名杀手 + ${state.rules.maxSurvivors} 名幸存者）`);
  }
  state.players[id] = createPlayer(id, name);
  log(state, `${name} 加入了房间。`);
}

/** 有人离开：只标断线，房间和棋子都留着，方便用房间码再进来 */
export function removePlayer(state: GameState, id: string): void {
  let any = false;
  const op = state.survivorOperators.find((o) => o.id === id);
  if (op) {
    op.connected = false;
    any = true;
  }
  const partnerOnline = state.survivorOperators.some((o) => o.id !== id && o.connected);
  for (const p of Object.values(state.players)) {
    if (p.controllerId === id || p.id === id) {
      if (!(p.faction === 'survivor' && (state.mode === 'duo' || state.mode === 'vs2') && partnerOnline)) {
        p.connected = false;
      }
      any = true;
    }
  }
  if (any) log(state, `有人离开房间，座位保留。用房间码和原来的昵称即可回来。`);
}

/** 还活着的幸存者里，行动顺序最靠前的那一个 */
function firstAliveSurvivorId(state: GameState): string | null {
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (p?.alive && p.faction === 'survivor') return id;
  }
  const any = Object.values(state.players).find(
    (p) => p.faction === 'survivor' && p.alive,
  );
  return any?.id ?? null;
}

/** 现在正在行动的那名幸存者 */
function activeSurvivorId(state: GameState): string | null {
  if (state.phase !== 'survivorMain') return null;
  if (state.pendingSurvivorPick) return null;
  const order = state.turnOrder;
  if (!order.length) return null;
  return order[state.activeSurvivorIndex] ?? null;
}

/** 遭遇里还没轮到防御的幸存者 */
function pendingDefenseSurvivorIds(state: GameState): string[] {
  const enc = state.encounter;
  if (!enc || enc.step !== 'defend' || !enc.targetId) return [];
  if (enc.targetId in enc.defenses) return [];
  return [enc.targetId];
}

/** 现在该谁点按钮：选角、幸存者、杀手、遭遇里的某一步 */
function activePlayerId(state: GameState): string | null {
  if (state.pendingAmulet) return state.pendingAmulet.playerId;
  if (state.pendingEvolutionAck) return state.killerId;
  if (state.pendingOverFearWound) return state.killerId;
  if (state.pendingWhizSearch) return state.killerId;
  if (state.pendingBlockadeJob) return state.killerId;
  if (state.pendingItemDiscard && state.mode !== 'multi') return state.pendingItemDiscard.playerId;
  if (state.phase === 'survivorMain') return activeSurvivorId(state);
  if (state.phase === 'discovery') {
    if (state.pendingDiscoveryPick) return firstAliveSurvivorId(state) ?? state.hostId;
    return state.discoveryActorId ?? firstAliveSurvivorId(state) ?? state.hostId;
  }
  if (state.phase === 'noiseReport' || state.phase === 'killerMain' || state.phase === 'upkeep') {
    return state.killerId;
  }
  if (state.phase === 'encounter' && state.encounter) {
    if (state.encounterOpenHold || state.pendingOverFearWound) return state.killerId;
    const enc = state.encounter;
    if (enc.step === 'pick') {
      const here = remainingEncounterTargets(state);
      return here[0]?.id ?? firstAliveSurvivorId(state);
    }
    if (enc.step === 'attack') return state.killerId;
    if (enc.step === 'defend') {
      const pending = pendingDefenseSurvivorIds(state);
      return pending[0] ?? null;
    }
    if (enc.step === 'flee') return enc.fleeQueue[0] ?? null;
  }
  return null;
}

/** 将 socket 映射为当前应操作的玩家实体 id */
/**
 * 把“哪根网线发来的消息”翻译成“桌上哪颗棋子在行动”。
 * 单人/1对1时，一个人操控好几颗棋子，所以不能只用 socketId。
 */
export function resolveActorId(
  state: GameState,
  socketId: string,
  action: ClientAction,
): string {
  const lobbyish = state.phase === 'lobby' || state.phase === 'characterSelect';
  if (lobbyish) return socketId;

  if (isSharedSurvivorMode(state)) {
    const hostOverride = state.mode === 'solo';
    const operatedBy = (pieceId: string | null | undefined) =>
      Boolean(pieceId && controlsPiece(state, socketId, state.players[pieceId]));
    if (action.type === 'discardKillerCard' && state.killerId) {
      const k = state.players[state.killerId];
      if (k?.controllerId === socketId) return state.killerId;
    }
    if (action.type === 'acknowledgeNoise' && state.killerId) {
      const k = state.players[state.killerId];
      if (k?.controllerId === socketId) return state.killerId;
    }
    if (action.type === 'confirmAmulet' && state.pendingAmulet) {
      const sid = state.pendingAmulet.playerId;
      if (operatedBy(sid)) return sid;
      if (hostOverride && socketId === state.hostId && sid) return sid;
    }
    if (action.type === 'discardItem' && state.pendingItemDiscard) {
      const sid = state.pendingItemDiscard.playerId;
      if (operatedBy(sid)) return sid;
      if (hostOverride && socketId === state.hostId && sid) return sid;
    }
    if (action.type === 'acknowledgeDiscovery' || action.type === 'chooseDiscovery') {
      const sid = state.discoveryActorId ?? firstAliveSurvivorId(state);
      if (operatedBy(sid)) return sid!;
      if (hostOverride && socketId === state.hostId && sid) return sid;
    }
    if (action.type === 'pickSurvivorTurn') {
      const sid = firstAliveSurvivorId(state);
      if (operatedBy(sid)) return sid!;
      if (hostOverride && socketId === state.hostId && sid) return sid;
    }
    if (action.type === 'pickEncounterTarget' && state.encounter?.step === 'pick') {
      const here = survivorsInRoom(state, state.encounter.roomId);
      const mine = here.find((s) => controlsPiece(state, socketId, s));
      if (mine) return mine.id;
      if (hostOverride && socketId === state.hostId && here[0]) return here[0].id;
    }
    if (action.type === 'tradeItem') {
      const fromId = action.fromPlayerId;
      if (operatedBy(fromId)) return fromId!;
      const sid = firstAliveSurvivorId(state);
      if (operatedBy(sid)) return sid!;
      if (hostOverride && socketId === state.hostId && sid) return sid;
    }
    if (
      (action.type === 'useItem' || action.type === 'useSkill' || action.type === 'useSuitcase') &&
      action.actorPlayerId &&
      operatedBy(action.actorPlayerId)
    ) {
      return action.actorPlayerId;
    }
    if (
      action.type === 'finishSurvivorPhase' ||
      action.type === 'respondTrade' ||
      action.type === 'respondCoopAction' ||
      action.type === 'rematchReady' ||
      action.type === 'confirmSense' ||
      action.type === 'setKillerRepairGuess' ||
      action.type === 'ackEvolution' ||
      action.type === 'confirmWhizSearch' ||
      action.type === 'skipWhizSearch' ||
      action.type === 'confirmOverFearWound' ||
      action.type === 'skipOverFearWound' ||
      action.type === 'removeBoardBlockade' ||
      action.type === 'confirmEvoBlockade'
    ) {
      const mine = Object.values(state.players).find((pl) => controlsPiece(state, socketId, pl));
      if (mine) return mine.id;
    }
    if (action.type === 'playEncounterDefense' && state.encounter?.step === 'defend') {
      const pending = pendingDefenseSurvivorIds(state).find((id) => operatedBy(id));
      if (pending) return pending;
    }
    if (action.type === 'encounterFlee' && state.encounter?.step === 'flee') {
      const fid = state.encounter.fleeQueue[0];
      if (operatedBy(fid)) return fid!;
    }
    const active = activePlayerId(state);
    if (operatedBy(active)) return active!;
    const any = Object.values(state.players).find((p) => controlsPiece(state, socketId, p));
    if (any) return any.id;
  }

  return socketId;
}

/** 一名幸存者开始自己的一段：还没做一般行动，移动力按规则重置 */
function beginSurvivorTurn(state: GameState, playerId: string) {
  const p = state.players[playerId];
  if (!p) return;
  applyPassiveBonuses(state, playerId);
  const range = state.rules.survivorMoveRange + p.moveBonus;
  p.moveLeft = range;
  p.actionsLeft = 1;
  p.mainActionUsed = false;
  p.searchedThisTurn = false;
  p.repairedThisTurn = false;
  p.skillUsedThisTurn = new Set();
  p.quietSearch = false;
  log(state, `${p.name} 的小回合（一般行动：移动 1–${range} / 搜索物资 / 修理 / 特殊 / 拆封堵 / 消恐惧）。`);
}

/** 杀手回合开头：先快速牌。如果在潜行，先重现并强制搜一次 */
function beginKillerTurn(state: GameState) {
  const kid = state.killerId;
  if (!kid) return;
  const k = state.players[kid];
  applyPassiveBonuses(state, kid);
  k.moveLeft = state.rules.killerMoveRange + k.moveBonus;
  k.actionsLeft = state.rules.killerActionsPerTurn;
  k.searchedThisTurn = false;
  k.repairedThisTurn = false;
  k.skillUsedThisTurn = new Set();
  k.mainActionUsed = false;
  state.killerMainActionsLeft = 0;
  state.killerUsedSlowThisTurn = false;
  state.killerTurnStep = 'fast';
  state.killerMainChoice = null;
  state.pendingMoveRange = null;
  state.pendingCardSpeed = null;
  state.pendingSensePair = null;
  state.pendingSenseColor = false;
  state.pendingEffectQueue = [];
  state.pendingLurkPick = false;
  state.pendingAmulet = null;
  state.encounterTailBonus = 0;
  state.killerTurnPowerBonus = 0;
  state.lastSearchFound = false;
  state.pendingBlockadePlace = null;
  state.blockadesThisAction = [];
  state.pendingSealQueue = [];
  state.sealAllRoomId = null;
  log(
    state,
    `${k.name} 的回合：先打任意张快速牌，再二选一（2 次移动/搜索房间，或 1 张特殊牌），无遭遇则进入慢速阶段。`,
  );
  if (k.stealth) {
    forcedRevealAndSearch(state);
    applyMurdererRevealPower(state);
    placeFirecrackerMarker(state);
    if (state.pendingLurkPick || state.pendingAmulet || state.pendingOverFearWound) return;
    maybeStartEncounter(state);
    if (state.encounter) return;
  } else {
    placeFirecrackerMarker(state);
  }
}

/** 这一轮还没行动过、还活着的幸存者 */
function unactedAliveSurvivorIds(state: GameState): string[] {
  return state.turnOrder.filter((id) => {
    const pl = state.players[id];
    return Boolean(pl?.alive && pl.faction === 'survivor' && !pl.actedThisRound);
  });
}

/** 玩家选定“下一名行动的幸存者”之后，正式开始他的回合 */
function startPickedSurvivorTurn(state: GameState, playerId: string) {
  const p = state.players[playerId];
  if (!p) return;
  if (activeSurvivorId(state) === playerId && !p.actedThisRound) {
    state.pendingSurvivorPick = false;
    return;
  }
  // 还没做一般行动前可以反复换人，所以这里不标记 acted
  state.pendingSurvivorPick = false;
  const idx = state.turnOrder.indexOf(playerId);
  if (idx >= 0) state.activeSurvivorIndex = idx;
  beginSurvivorTurn(state, playerId);
}

/** 幸存者大回合：做完一般行动的人不能再选；没做完的可以随时换 */
function promptOrAutoNextSurvivor(state: GameState) {
  const left = unactedAliveSurvivorIds(state);
  if (left.length === 0) {
    state.pendingSurvivorPick = false;
    log(state, '所有幸存者已完成一般行动。仍可交换物品或额外行动，然后点「幸存者所有操作已结束」。');
    return;
  }
  state.pendingSurvivorPick = true;
  log(
    state,
    state.mode === 'multi'
      ? '请点选自己的角色开始小回合。一般行动只能操作自己。'
      : '点选一名幸存者开始小回合。做一般行动前可反复换人。',
  );
}

function clearNoiseAndFirecrackerTokens(state: GameState) {
  state.noises = [];
  state.firecrackerThisRound = false;
  state.firecrackerRoomId = null;
}

/** 爆竹标记：杀手回合开始时放在杀手所在格；潜行则等重现后再放。 */
function placeFirecrackerMarker(state: GameState) {
  if (!state.firecrackerThisRound || state.firecrackerRoomId) return;
  const k = state.killerId ? state.players[state.killerId] : null;
  if (!k?.roomId || k.stealth) return;
  state.firecrackerRoomId = k.roomId;
}

/** 新的一轮：幸存者大回合开始前清响声/爆竹、复位手提箱，再请第一名幸存者行动 */
function startRound(state: GameState) {
  state.round += 1;
  clearNoiseAndFirecrackerTokens(state);
  state.suitcaseAvailable = true;
  state.repairedThisPhase = false;
  state.senseHighlight = null;
  for (const pl of Object.values(state.players)) {
    pl.overFear = false;
    if (pl.faction === 'survivor') pl.actedThisRound = false;
  }
  state.phase = 'survivorMain';
  state.activeSurvivorIndex = 0;
  state.pendingMoveRange = null;
  state.pendingCardSpeed = null;
  state.encounter = null;
  state.lastDiscoveryCardId = null;
  state.pendingSurvivorPick = false;
  state.pendingDiscoveryPick = false;
  state.discoveryActorId = null;
  state.pendingSensePair = null;
  log(state, `—— 第 ${state.round} 回合 ——`);
  promptOrAutoNextSurvivor(state);
}

/** 给一颗棋子戴上角色：血量、背包格、开局物品 */
function initPiece(state: GameState, content: GameContent, p: PlayerState): void {
  const ch = content.characters.find((c) => c.id === p.characterId);
  if (!ch || ch.faction !== p.faction) throw new Error(`${p.name} 的角色无效`);
  p.maxHp = ch.maxHp;
  p.hp = ch.maxHp;
  p.alive = true;
  p.fear = 0;
  p.exposed = false;
  p.overFear = false;
  p.mainActionUsed = false;
  p.hand = [];
  p.items = {};
  p.stealth = false;
  p.stealthOriginRoomId = null;
  if (p.faction === 'survivor') {
    const startItems = startingItemsFor(ch.id, ch.name);
    p.items = { ...startItems };
    if (Object.keys(startItems).length) {
      const names: Record<string, string> = {
        sophia_camera: '索菲亚的相机',
        marco_medkit: '马尔科的医药包',
      };
      log(state, `${p.name} 开局带上了 ${Object.keys(startItems).map((id) => names[id] ?? id).join('、')}。`);
    }
  }
  if (p.faction === 'survivor') p.roomId = state.map.survivorStartRoomId;
  if (p.faction === 'killer') {
    p.roomId = state.map.killerStartRoomId;
  }
  applyPassiveBonuses(state, p.id);
}

/** 三种开局模式共用的收尾：洗牌、杀手起始手牌、幸存者放进地图、开始第 1 轮 */
/** 「替换鸿运当骰等牌」用的三张替换牌 id */
const REPLACEMENT_CARD_IDS = ['sk_lucky_dice', 'sk_lamp', 'sk_parcel'] as const;

/**
 * 【替换「鸿运当骰」等牌】：开启时搜索牌堆里的
 * 1 个手斧 / 1 瓶威士忌酒瓶 / 1 张石灰粉 换成 鸿运当骰 / 煤油灯 / 神秘包裹。
 * 关闭时这三张替换牌不进牌堆（钥匙不受影响）。
 */
function applyReplacementDeck(state: GameState, search: CardDef[]): CardDef[] {
  const base = search.filter(
    (c) => !(REPLACEMENT_CARD_IDS as readonly string[]).includes(c.id),
  );
  if (!state.replacementDeck) return base;
  /** 按牌 id 替换（每 id 只换一张），换掉的牌不进搜索牌堆 */
  const pairs: Array<[string, string]> = [
    ['sk_axe', 'sk_lamp'],
    ['sk_whiskey', 'sk_parcel'],
    ['sk_lime', 'sk_lucky_dice'],
  ];
  const out = [...base];
  for (const [fromId, toId] of pairs) {
    const to = state.cardById[toId];
    if (!to) continue;
    const i = out.findIndex((c) => c.id === fromId);
    if (i < 0) continue;
    out[i] = to;
  }
  return out;
}

function finishStartCommon(state: GameState, content: GameContent) {
  state.keysCollected = 0;
  state.repairProgress = 0;
  state.rescueArmed = false;
  state.rescueCountdown = null;
  state.winner = null;
  state.winReason = null;
  state.blockades = [];
  state.encounter = null;
  state.lastDiscoveryCardId = null;
  state.discoveryOptions = [];
  state.lastDiceRoll = null;
  state.pendingMoveRange = null;
  state.pendingCardSpeed = null;
  state.killerMainActionsLeft = 0;
  state.killerUsedSlowThisTurn = false;
  state.killerTurnStep = 'fast';
  state.killerMainChoice = null;
  state.killerLevel = 1;
  state.pendingKillerDiscards = 0;
  state.pendingBlockade = false;
  state.pendingItemDiscard = null;
  state.pendingTrade = null;
  state.pendingCoopAction = null;
  state.applyingConfirmedCoop = false;
  state.trapRoomIds = [];
  state.survivorDiscard = [];
  state.pendingSurvivorPick = false;
  state.pendingDiscoveryPick = false;
  state.discoveryActorId = null;
  state.pendingSensePair = null;
  state.pendingRescueArm = false;
  state.killerPublicKeys = 0;
  state.killerRepairGuess = 0;
  state.pendingUnlockDiscard = false;
  state.justUnlockedCards = [];
  state.pendingPathDraft = null;
  state.pendingSenseColorPick = null;
  state.rematchReady = [];
  Object.assign(state, emptyEvolutionFields());
  const killerCh = content.characters.find((c) => c.id === state.players[state.killerId ?? '']?.characterId);
  state.killerPower = killerCh?.startingPower ?? state.rules.killerPowerStart;

  state.searchDeck = buildSearchDeck(applyReplacementDeck(state, content.cards.search));
  state.searchDiscard = [];
  state.discoveryDeck = shuffle(content.cards.discovery.map((c) => c.id));
  state.discoveryDiscard = [];
  state.survivorDiscard = [];
  const kCharId = state.killerId ? state.players[state.killerId]?.characterId : null;
  const owned = content.cards.killerAction.filter((c) => {
    if (c.owner) return c.owner === kCharId || c.owner === killerCh?.name;
    return false;
  });
  const pool = owned.length ? owned : content.cards.killerAction.filter((c) => !c.owner);
  const startCards = pool.filter((c) => !c.locked);
  const lockedCards = pool.filter((c) => c.locked);
  state.killerDeck = shuffle(startCards.map((c) => c.id));
  state.killerLocked = lockedCards.map((c) => c.id);
  state.killerDiscard = [];
  state.killerHand = [];
  if (lockedCards.length) {
    log(state, `锁定牌未洗入摸牌堆：${lockedCards.map((c) => c.name).join('、')}。`);
  }

  drawKillerCards(state, state.rules.killerStartingHand ?? 2);
  state.round = 0;
  startRound(state);
}

/** 单人热座：一个人操控 3 名幸存者 + 1 名杀手 */
function startSoloGame(state: GameState, content: GameContent, hostSocketId: string): void {
  const host = state.players[hostSocketId];
  if (!host) throw new Error('房主不在房间内');
  const needed = state.rules.maxSurvivors;
  if (!state.soloKillerCharacterId || state.soloSurvivorCharacterIds.length !== needed) {
    throw new Error(`请先选好 1 名杀手和 ${needed} 名幸存者`);
  }
  if (!host.ready) throw new Error('请先点击准备');

  const killerCh = content.characters.find((c) => c.id === state.soloKillerCharacterId);
  if (!killerCh || killerCh.faction !== 'killer') throw new Error('杀手角色无效');
  const survChars = state.soloSurvivorCharacterIds.map((id) => {
    const ch = content.characters.find((c) => c.id === id);
    if (!ch || ch.faction !== 'survivor') throw new Error('幸存者角色无效');
    return ch;
  });
  if (new Set(survChars.map((c) => c.id)).size !== survChars.length) {
    throw new Error('幸存者角色不能重复');
  }

  const killerId = `${hostSocketId}__killer`;
  const killer = createPlayer(killerId, killerCh.name, hostSocketId);
  killer.faction = 'killer';
  killer.characterId = killerCh.id;
  killer.ready = true;
  killer.controllerName = host.controllerName || host.name;

  const survivors = survChars.map((ch, i) => {
    const sid = `${hostSocketId}__surv${i + 1}`;
    const surv = createPlayer(sid, ch.name, hostSocketId);
    surv.faction = 'survivor';
    surv.characterId = ch.id;
    surv.ready = true;
    surv.controllerName = host.controllerName || host.name;
    return surv;
  });

  state.players = {
    [killerId]: killer,
    ...Object.fromEntries(survivors.map((s) => [s.id, s])),
  };

  initPiece(state, content, killer);
  for (const surv of survivors) initPiece(state, content, surv);

  state.killerId = killerId;
  state.turnOrder = survivors.map((s) => s.id);
  finishStartCommon(state, content);
  log(state, `单人热座开始：依次操控 ${survivors.map((s) => s.name).join('、')}，再操控杀手。`);
}

/** 1 对 1：一人杀手，一人操控全部幸存者 */
function startDuoGame(state: GameState, content: GameContent): void {
  const humans = Object.values(state.players);
  if (humans.length !== 2) throw new Error('1 对 1 需要恰好 2 名玩家');
  const killerHuman = humans.find((p) => p.faction === 'killer');
  const survHuman = humans.find((p) => p.faction === 'survivor');
  if (!killerHuman || !survHuman) throw new Error('一人选杀手，一人选幸存者');
  if (!killerHuman.characterId) throw new Error(`${killerHuman.name} 尚未选择杀手角色`);
  const needed = state.rules.maxSurvivors;
  if (state.soloSurvivorCharacterIds.length !== needed) {
    throw new Error(`${survHuman.name} 请先点选 ${needed} 名幸存者`);
  }
  if (!killerHuman.ready || !survHuman.ready) throw new Error('双方都需要准备');

  const killerCh = content.characters.find((c) => c.id === killerHuman.characterId);
  if (!killerCh || killerCh.faction !== 'killer') throw new Error('杀手角色无效');
  const survChars = state.soloSurvivorCharacterIds.map((id) => {
    const ch = content.characters.find((c) => c.id === id);
    if (!ch || ch.faction !== 'survivor') throw new Error('幸存者角色无效');
    return ch;
  });
  if (new Set(survChars.map((c) => c.id)).size !== survChars.length) {
    throw new Error('幸存者角色不能重复');
  }

  const killerId = `${killerHuman.id}__killer`;
  const killer = createPlayer(killerId, killerCh.name, killerHuman.id);
  killer.faction = 'killer';
  killer.characterId = killerCh.id;
  killer.ready = true;
  killer.controllerName = killerHuman.controllerName || killerHuman.name;

  const survivors = survChars.map((ch, i) => {
    const sid = `${survHuman.id}__surv${i + 1}`;
    const surv = createPlayer(sid, ch.name, survHuman.id);
    surv.faction = 'survivor';
    surv.characterId = ch.id;
    surv.ready = true;
    surv.controllerName = survHuman.controllerName || survHuman.name;
    return surv;
  });

  state.players = {
    [killerId]: killer,
    ...Object.fromEntries(survivors.map((s) => [s.id, s])),
  };
  state.survivorOperators = [
    { id: survHuman.id, name: survHuman.controllerName || survHuman.name, connected: true },
  ];

  initPiece(state, content, killer);
  for (const surv of survivors) initPiece(state, content, surv);

  state.killerId = killerId;
  state.turnOrder = survivors.map((s) => s.id);
  finishStartCommon(state, content);
  log(
    state,
    `1 对 1 开始：${killerHuman.name} 操控杀手「${killer.name}」，${survHuman.name} 操控 ${survivors.map((s) => s.name).join('、')}。`,
  );
}

/** 1对2：一人杀手，两人共控全部幸存者 */
function startVs2Game(state: GameState, content: GameContent): void {
  const humans = Object.values(state.players);
  if (humans.length !== 3) throw new Error('1对2 需要恰好 3 名玩家');
  const killerHuman = humans.find((p) => p.faction === 'killer');
  const survHumans = humans.filter((p) => p.faction === 'survivor');
  if (!killerHuman || survHumans.length !== 2) throw new Error('一人选杀手，两人选幸存者并共控 3 名角色');
  if (!killerHuman.characterId) throw new Error(`${killerHuman.name} 尚未选择杀手角色`);
  const needed = state.rules.maxSurvivors;
  if (state.soloSurvivorCharacterIds.length !== needed) {
    throw new Error(`请先点选 ${needed} 名幸存者`);
  }
  if (!killerHuman.ready || survHumans.some((p) => !p.ready)) throw new Error('三人都需要准备');

  const killerCh = content.characters.find((c) => c.id === killerHuman.characterId);
  if (!killerCh || killerCh.faction !== 'killer') throw new Error('杀手角色无效');
  const survChars = state.soloSurvivorCharacterIds.map((id) => {
    const ch = content.characters.find((c) => c.id === id);
    if (!ch || ch.faction !== 'survivor') throw new Error('幸存者角色无效');
    return ch;
  });
  if (new Set(survChars.map((c) => c.id)).size !== survChars.length) {
    throw new Error('幸存者角色不能重复');
  }

  const killerId = `${killerHuman.id}__killer`;
  const killer = createPlayer(killerId, killerCh.name, killerHuman.id);
  killer.faction = 'killer';
  killer.characterId = killerCh.id;
  killer.ready = true;
  killer.controllerName = killerHuman.controllerName || killerHuman.name;

  const survivors = survChars.map((ch, i) => {
    const owner = survHumans[i % survHumans.length]!;
    const sid = `${owner.id}__surv${i + 1}`;
    const surv = createPlayer(sid, ch.name, owner.id);
    surv.faction = 'survivor';
    surv.characterId = ch.id;
    surv.ready = true;
    surv.controllerName = survHumans.map((h) => h.controllerName || h.name).join('、');
    return surv;
  });

  state.players = {
    [killerId]: killer,
    ...Object.fromEntries(survivors.map((s) => [s.id, s])),
  };
  state.survivorOperators = survHumans.map((h) => ({
    id: h.id,
    name: h.controllerName || h.name,
    connected: true,
  }));

  initPiece(state, content, killer);
  for (const surv of survivors) initPiece(state, content, surv);

  state.killerId = killerId;
  state.turnOrder = survivors.map((s) => s.id);
  finishStartCommon(state, content);
  log(
    state,
    `1对2 开始：${killerHuman.name} 操控杀手「${killer.name}」，${survHumans.map((h) => h.name).join('、')} 共控 ${survivors.map((s) => s.name).join('、')}。一般行动和额外行动需另一人确认，交换物品不用。`,
  );
}

/** 房主按下开始：按模式走上面三种开局 */
function startMultiGame(state: GameState, content: GameContent): void {
  const players = Object.values(state.players);
  const killers = players.filter((p) => p.faction === 'killer');
  const survs = players.filter((p) => p.faction === 'survivor');
  const needed = state.rules.maxSurvivors;
  if (killers.length !== 1) throw new Error('必须恰好有 1 名杀手');
  if (survs.length !== needed) {
    throw new Error(`必须恰好有 ${needed} 名幸存者（当前 ${survs.length}）`);
  }
  if (players.length !== 1 + needed) {
    throw new Error(`需要 ${1 + needed} 名玩家：1 杀手 + ${needed} 幸存者`);
  }
  for (const p of players) {
    if (!p.characterId) throw new Error(`${p.name} 尚未选择角色`);
    if (!p.ready) throw new Error(`${p.name} 尚未准备`);
    initPiece(state, content, p);
  }

  state.killerId = killers[0]!.id;
  state.turnOrder = survs.map((s) => s.id);
  state.survivorOperators = [];
  finishStartCommon(state, content);
  log(
    state,
    `1对3 开始：${killers[0]!.name} 操控杀手，${survs.map((s) => `${s.controllerName || s.name}→${s.name}`).join('，')}。每人只操控自己的角色。`,
  );
}

/** 房主按下开始：按模式走上面三种开局 */
export function startGame(state: GameState, content: GameContent, hostSocketId: string): void {
  if (state.mode === 'solo') {
    startSoloGame(state, content, hostSocketId);
  } else if (state.mode === 'duo') {
    startDuoGame(state, content);
  } else if (state.mode === 'vs2') {
    startVs2Game(state, content);
  } else {
    startMultiGame(state, content);
  }
}

/**
 * 再来一局：保留座位与房间，退回大厅重新选地图 / 身份 / 角色。
 * 所有人都点过「再来一局」后才会走到这里，此时把棋盘整盘重置。
 */
function restartMatch(state: GameState, content: GameContent) {
  const roomCode = state.roomCode;
  const hostId = state.hostId;
  const mode = state.mode;
  /** 上一局的地图作为默认值带过去，房主可以在大厅里换 */
  const mapId = state.map.id;
  const hostName =
    Object.values(state.players).find((p) => p.controllerId === hostId)?.controllerName || '房主';

  /** 每个操控者留一个座位（杀手优先），用来重建大厅里的人 */
  const byCtrl = new Map<string, PlayerState>();
  for (const p of Object.values(state.players)) {
    const prev = byCtrl.get(p.controllerId);
    if (!prev || p.faction === 'killer') byCtrl.set(p.controllerId, p);
  }
  const humans: Record<string, PlayerState> = {};
  for (const [cid, src] of byCtrl) {
    const h = createPlayer(cid, src.controllerName || src.name, cid);
    h.controllerName = src.controllerName || src.name;
    h.connected = Object.values(state.players).some((p) => p.controllerId === cid && p.connected);
    humans[cid] = h;
  }

  const fresh = createLobby(roomCode, hostId, hostName, content, mapId);
  const dest = state as unknown as Record<string, unknown>;
  const src = fresh as unknown as Record<string, unknown>;
  for (const key of Object.keys(src)) dest[key] = src[key];
  state.players = humans;
  state.mode = mode;
  state.hostId = hostId;
  /**
   * 「再来一局」不再直接开局：清掉身份与角色，退回大厅，
   * 让房主重新选地图、所有人重新选身份和角色，再各自点准备开打。
   * （历史战绩/棋盘状态都由上面的 createLobby 重置，地图保留上一局那张作为默认）
   */
  state.soloKillerCharacterId = null;
  state.soloSurvivorCharacterIds = [];
  state.survivorOperators = [];
  state.phase = 'lobby';
  for (const h of Object.values(state.players)) {
    h.faction = null;
    h.characterId = null;
    h.ready = false;
  }
  log(state, '再来一局：请重新选择地图、身份与角色，全部准备后由房主开始。');
}

/** 幸存者阶段结束，把本回合响声报给杀手看 */
function enterNoiseReport(state: GameState) {
  closeSurvivorBigRound(state);
  if (state.phase === 'gameOver') return;
  state.phase = 'noiseReport';
  log(
    state,
    `响声阶段：${
      state.firecrackerThisRound
        ? '爆竹：所有地点发出响声（不额外放置响声标记）'
        : state.noises.length
          ? state.noises.map((id) => roomName(state, id)).join('、')
          : '无'
    }。${state.mode === 'solo' ? '（请切换为杀手视角继续）' : ''}`,
  );
}

/** 进入发现阶段：摸最多 2 张留 1；只剩 1 张则直接拿；没牌且未修完则幸存者败 */
function enterDiscovery(state: GameState) {
  if (state.pendingTrade) {
    log(state, '未确认的物品交换已取消。');
    state.pendingTrade = null;
  }
  if (state.pendingCoopAction) {
    log(state, '未确认的幸存者行动已取消。');
    state.pendingCoopAction = null;
  }
  if (!state.rules.enableDiscovery) {
    enterNoiseReport(state);
    return;
  }
  state.phase = 'discovery';
  state.lastDiscoveryCardId = null;
  state.discoveryOptions = [];
  state.discoveryActorId = null;
  const alive = state.turnOrder.filter((id) => {
    const pl = state.players[id];
    return Boolean(pl?.alive && pl.faction === 'survivor');
  });
  if (alive.length === 0) {
    enterNoiseReport(state);
    return;
  }
  if (alive.length === 1) {
    beginDiscoveryDraw(state, alive[0]!);
    return;
  }
  state.pendingDiscoveryPick = true;
  log(state, '发现阶段：先选择一名幸存者翻发现牌（最多摸 2 留 1；只剩 1 张则直接拿）。');
}

function discoveryRepairDone(state: GameState): boolean {
  return (
    state.repairProgress >= state.rules.repairNeeded ||
    Boolean(state.pendingRescueArm) ||
    state.rescueArmed
  );
}

/** 指定的那个人从发现牌堆翻牌。不把弃牌洗回来：牌堆空就是空。 */
function beginDiscoveryDraw(state: GameState, actorId: string) {
  const actor = state.players[actorId];
  if (!actor?.alive || actor.faction !== 'survivor') throw new Error('无法选择该幸存者');
  state.pendingDiscoveryPick = false;
  state.discoveryActorId = actorId;
  const left = state.discoveryDeck.length;
  if (left === 0) {
    if (!discoveryRepairDone(state)) {
      state.winner = 'killer';
      state.winReason = '发现牌抽完，且无线电尚未修好。';
      state.phase = 'gameOver';
      log(state, '杀手胜利：发现牌库已空，修理未完成。');
      return;
    }
    log(state, '发现牌库已空，无线电已修好，跳过发现。');
    enterNoiseReport(state);
    return;
  }
  const take = Math.min(2, left);
  const opts: string[] = [];
  for (let i = 0; i < take; i++) {
    const id = state.discoveryDeck.shift();
    if (id) opts.push(id);
  }
  state.discoveryOptions = opts;
  if (opts.length === 1) {
    const only = opts[0]!;
    log(
      state,
      `发现牌堆只剩一张，${actor.name} 直接获得「${state.cardById[only]?.name ?? only}」。`,
    );
    resolveDiscoveryChoice(state, only);
    return;
  }
  log(
    state,
    `发现阶段：由 ${actor.name} 翻开 ${opts.map((id) => state.cardById[id]?.name ?? id).join('、')}，选留 1 张。未留下的那张进入弃牌堆。有响声标记的牌无论留哪张都会在 ${actor.name} 所在地点响。`,
  );
}

/** 这张发现牌左上角带不带响声（钥匙也吵） */
function discoveryCardNoisy(state: GameState, id: string): boolean {
  const card = state.cardById[id];
  if (!card) return false;
  return Boolean(card.makesNoise) || isKeyCard(card);
}

function suitcaseRoomId(state: GameState): string | null {
  const tok = (state.map.tokens ?? []).find((t) => t.kind === 'suitcase' || t.kind === '手提箱' || t.kind === '手提箱已用');
  if (tok?.roomId) return tok.roomId;
  return state.map.id === 'cabin' ? 'R4' : null;
}

/** 手提箱额外行动：摸到的发现牌留下。安娜的静默搜索不适用，牌面有响声就会响 */
function keepSuitcaseDiscovery(state: GameState, actorId: string, cardId: string) {
  const kept = state.cardById[cardId];
  const noisy = discoveryCardNoisy(state, cardId);
  state.lastDiscoveryCardId = cardId;
  if (kept) {
    const fx = kept.effects.filter((e) => e.op !== 'noise');
    if (fx.length) runEffects({ state, actorId, effects: fx });
    if (!cardBecomesPossession(kept) && !isKeyCard(kept)) {
      discardUniqueCard(state, cardId, 'discovery');
    }
    if (isKeyCard(kept)) {
      log(state, `手提箱摸到钥匙，放入钥匙架。`);
    }
  } else {
    discardUniqueCard(state, cardId, 'discovery');
  }
  if (noisy) {
    const room = state.players[actorId]?.roomId;
    if (room) pushNoise(state, room);
    log(state, '该发现牌带有响声标记，在手提箱所在地点发出响声。');
  }
  log(state, `从手提箱获得发现牌「${kept?.name ?? cardId}」。`);
}

/** 留下这一张，另一张进弃牌堆。钥匙上架，物品进背包 */
function resolveDiscoveryChoice(state: GameState, cardId: string) {
  if (state.phase !== 'discovery') throw new Error('当前不是发现阶段');
  if (state.pendingDiscoveryPick) throw new Error('请先选择翻牌的幸存者');
  if (!state.discoveryOptions.includes(cardId)) throw new Error('这张不是本次摸到的牌');
  const actorId = state.discoveryActorId ?? firstAliveSurvivorId(state);
  const options = [...state.discoveryOptions];
  const noisy = options.some((id) => discoveryCardNoisy(state, id));
  const kept = state.cardById[cardId];

  state.discoveryOptions = [];
  for (const id of options) {
    if (id === cardId) continue;
    const rejected = state.cardById[id];
    discardUniqueCard(state, id, 'discovery');
    if (rejected && isKeyCard(rejected)) {
      log(state, `放弃钥匙「${rejected.name}」，放入弃牌堆，钥匙架不加。`);
    }
  }

  state.lastDiscoveryCardId = cardId;

  if (actorId && kept) {
    const fx = kept.effects.filter((e) => e.op !== 'noise');
    if (fx.length) runEffects({ state, actorId, effects: fx });
    if (!cardBecomesPossession(kept) && !isKeyCard(kept)) {
      discardUniqueCard(state, cardId, 'discovery');
    }
    if (isKeyCard(kept)) {
      log(state, `留下钥匙，放入钥匙架。`);
    }
  } else if (!cardBecomesPossession(kept)) {
    discardUniqueCard(state, cardId, 'discovery');
  }

  if (noisy && actorId) {
    const room = state.players[actorId]?.roomId;
    if (room) pushNoise(state, room);
    log(state, '发现牌带有响声（含钥匙），无论留哪张都必须在翻牌者所在地点响。');
  }
  log(state, `留下发现牌「${kept?.name ?? cardId}」。`);
  if (state.pendingItemDiscard) return;
  enterNoiseReport(state);
}

/** 幸存者大回合结束：才放警车 / 才让警车往前开一格 */
function closeSurvivorBigRound(state: GameState) {
  if (state.pendingRescueArm && !state.rescueArmed) {
    state.rescueArmed = true;
    state.rescueCountdown = state.rules.rescueWaitRounds;
    state.pendingRescueArm = false;
    state.killerRepairGuess = state.rules.repairNeeded;
    log(state, `警车放到救援板块 ${state.rescueCountdown}。之后每个幸存者大回合结束开一格。`);
  } else if (state.rescueArmed && state.rescueCountdown != null && state.rescueCountdown > 0) {
    state.rescueCountdown -= 1;
    if (state.rescueCountdown <= 0) log(state, '警车开到出口。');
    else log(state, `警车开到 ${state.rescueCountdown}。`);
  }
  state.killerPublicKeys = state.keysCollected;
  checkSurvivorWin(state);
}

/** 一名幸存者做完一般行动：立刻结束其小回合，不必再点结束 */
function advanceAfterSurvivor(state: GameState, endedPlayerId: string) {
  const ended = state.players[endedPlayerId];
  if (ended) ended.actedThisRound = true;
  checkSurvivorWin(state);
  if (state.phase === 'gameOver') return;
  promptOrAutoNextSurvivor(state);
}

/** 幸存者阶段收工：进入发现。大回合的警车要等发现结束再推 */
function finishSurvivorPhase(state: GameState) {
  if (state.pendingTrade) throw new Error('请先确认或取消物品交换');
  if (state.pendingCoopAction) throw new Error('请先确认或取消幸存者行动');
  const left = unactedAliveSurvivorIds(state);
  for (const id of left) {
    if (survivorHasGeneralAction(state, id)) {
      throw new Error('还有幸存者可以做一般行动，不能结束');
    }
    state.players[id]!.actedThisRound = true;
  }
  enterDiscovery(state);
}

/** 轮到杀手了 */
function enterKillerMain(state: GameState) {
  state.phase = 'killerMain';
  beginKillerTurn(state);
}

/** 第三阶段做完（或被允许跳过）后，进入慢速牌阶段 */
function enterKillerSlow(state: GameState) {
  if (state.phase !== 'killerMain') return;
  if (state.encounter) return;
  if (hasPendingKillerChoice(state)) return;
  if (state.killerTurnStep === 'slow') return;
  state.killerTurnStep = 'slow';
  state.killerMainActionsLeft = 0;
  const k = state.killerId ? state.players[state.killerId] : null;
  if (k) k.actionsLeft = 0;
  log(state, '进入慢速卡牌阶段：可打出沙漏类慢速牌，然后结束回合抽牌。');
}

/** 特殊牌打完，或 2 次普通行动用光，就自动进慢速 */
function maybeFinishKillerMain(state: GameState) {
  if (state.killerTurnStep !== 'main') return;
  if (hasPendingKillerChoice(state)) return;
  if (state.encounter || state.phase === 'gameOver') return;
  if (state.killerMainChoice === 'special') {
    enterKillerSlow(state);
    return;
  }
  if (state.killerMainChoice === 'actions' && state.killerMainActionsLeft <= 0) {
    enterKillerSlow(state);
  }
}

/** 这场遭遇里还没挨打的幸存者 */
function remainingEncounterTargets(state: GameState): PlayerState[] {
  const enc = state.encounter;
  if (!enc) return [];
  return survivorsInRoom(state, enc.roomId).filter((s) => !(s.id in enc.defenses));
}

/** 遭遇加攻牌打出时已进杀手弃牌堆，这里只清引用（不再有重击/挥砍牌堆） */
function discardEncounterAttackCards(state: GameState) {
  const enc = state.encounter;
  if (!enc) return;
  enc.attackCardId = null;
  enc.attackOptions = [];
}

/** 遭遇战斗结束：被发现的幸存者可移 1 格（杀手看不见），然后杀手摸牌结束回合 */
function finishEncounter(state: GameState) {
  discardEncounterAttackCards(state);
  const enc = state.encounter;
  clearTrapAfterEncounter(state, enc?.roomId);
  if (state.phase === 'gameOver') {
    state.encounter = null;
    return;
  }
  if (!enc) {
    endKillerTurn(state);
    return;
  }
  /**
   * 撤离队列：遭遇结束时**还活着、还在这场遭遇所在地点**的幸存者，
   * 每人在轮到自己的那一步可以走 1 格或留在原地 —— 一人只走一次。
   * 不直接用 discoveredIds：它是开战那一刻的快照，
   * 有人在开战效果里倒下、或中途被打倒后，会让队列缺人或顺序不对。
   */
  const queue = survivorsInRoom(state, enc.roomId).map((s) => s.id);
  if (queue.length === 0) {
    state.encounter = null;
    log(state, '遭遇结束，杀手摸牌后结束回合。');
    endKillerTurn(state);
    return;
  }
  enc.fleeQueue = queue;
  enc.step = 'flee';
  enc.targetId = queue[0] ?? null;
  log(
    state,
    `遭遇结束。${queue.length} 名幸存者依次选择移动 1 格或留在原地。`,
    'survivor',
  );
}

/** 打中一个人之后：同地还有人就再选，没有人了就结束遭遇 */
function continueEncounterAfterHit(state: GameState) {
  const enc = state.encounter;
  if (!enc) return;
  if (state.phase === 'gameOver') {
    discardEncounterAttackCards(state);
    clearTrapAfterEncounter(state, enc.roomId);
    state.encounter = null;
    return;
  }
  enc.attackCommitted = true;
  resetEncounterAttackChoice(state);
  const left = remainingEncounterTargets(state);
  if (left.length === 0) {
    log(state, '这次遭遇里的幸存者都已被伤害，遭遇结束。');
    finishEncounter(state);
    return;
  }
  if (left.length === 1) {
    const t = left[0]!;
    enc.targetId = t.id;
    enc.defenseOptions[t.id] = [];
    enc.step = 'attack';
    log(state, `下一名遭遇对象：${t.name}。攻击前再次选择是否加攻。`);
    return;
  }
  enc.targetId = null;
  enc.step = 'pick';
  log(
    state,
    `伤害成功。请再选一名幸存者继续遭遇（${left.map((s) => s.name).join('、')}）。每人攻击前都可选择是否加攻。`,
  );
}

/** 下一次攻击重新询问加攻；上一张加攻牌只对刚才那次有效 */
function resetEncounterAttackChoice(state: GameState) {
  const enc = state.encounter;
  if (!enc) return;
  enc.attackChoiceMade = false;
  enc.attackBoost = false;
  enc.attackCardId = null;
  state.encounterTailBonus = 0;
}

/** 杀手回合收尾：抽 3 张。手牌满时多的牌已正面进弃牌；进化确认 / 锁定牌超员 / 4 级封堵会停在收尾。 */
function endKillerTurn(state: GameState) {
  if (state.encounter) {
    discardEncounterAttackCards(state);
    clearTrapAfterEncounter(state, state.encounter.roomId);
    state.encounter = null;
  }
  if (state.phase === 'gameOver') return;
  state.pendingMoveRange = null;
  state.pendingCardSpeed = null;
  // 回合收尾时把第三阶段的状态清干净（遭遇打断时可能还留着 1 次没用完的行动）
  state.killerMainActionsLeft = 0;
  state.killerMainChoice = null;
  drawKillerCards(state, state.rules.killerDrawOnTurnEnd);
  maybeCloseKillerUpkeep(state);
}

/** 进化确认、弃超额、4 级封堵都做完，才真正结束杀手回合并清掉本回合 +3 */
function maybeCloseKillerUpkeep(state: GameState) {
  if (state.phase === 'gameOver') return;
  // 挡住弃牌 / 长剑摸牌可能在遭遇中途升级。确认效果时遭遇还在，不能切收尾或结束回合。
  if (state.encounter) return;
  if (state.pendingUnlockDiscard && state.pendingKillerDiscards > 0) {
    state.phase = 'upkeep';
    log(state, '进化入手锁定牌后手牌超额，请自选弃牌再结束回合。');
    return;
  }
  if (state.pendingEvolutionAck) {
    state.phase = 'upkeep';
    return;
  }
  if (startPendingEvoFourIfNeeded(state) || state.pendingBlockadeJob) {
    state.phase = 'upkeep';
    return;
  }
  state.pendingKillerDiscards = 0;
  state.killerTurnPowerBonus = 0;
  closeKillerTurn(state);
}

/** 杀手回合彻底结束，回到幸存者阶段（响声/爆竹等到幸存者大回合开始前再清） */
function closeKillerTurn(state: GameState) {
  state.killerTurnPowerBonus = 0;
  checkSurvivorWin(state);
  if (state.phase === 'gameOver') return;
  startRound(state);
}

/** 开战效果后同地已无人：清遭遇；未终局则摸牌结束杀手回合（给以后各自为战留路） */
setEncounterOpenNoTargetsHandler((state) => {
  discardEncounterAttackCards(state);
  clearTrapAfterEncounter(state, state.encounter?.roomId);
  state.encounter = null;
  state.encounterOpenHold = false;
  if (state.phase === 'gameOver') return;
  endKillerTurn(state);
});

/** 杀手在这个房间搜到人，开战。只有搜索才会走到这里 */
function startEncounter(state: GameState, roomId: string) {
  const alive = survivorsInRoom(state, roomId);
  if (alive.length === 0) return;

  const trapArmed = (state.trapRoomIds ?? []).includes(roomId);
  const encounter: EncounterState = {
    roomId,
    step: 'pick',
    targetId: null,
    attackCardId: null,
    attackBoost: false,
    attackChoiceMade: false,
    attackCommitted: false,
    attackOptions: [],
    defenses: {},
    defenseItems: {},
    defenseOptions: {},
    fleeQueue: [],
    discoveredIds: alive.map((s) => s.id),
    trapArmed,
    trapApplied: false,
  };
  state.encounter = encounter;
  state.phase = 'encounter';
  state.pendingMoveRange = null;
  state.pendingCardSpeed = null;
  state.lastSearchFound = false;
  log(state, `遭遇战爆发于「${roomName(state, roomId)}」！${alive.map((s) => s.name).join('、')} 被卷入。`, 'all', true);
  if (trapArmed) {
    log(state, `「${roomName(state, roomId)}」有陷阱：本场遭遇中第一名被攻击的幸存者必须获得防御 +2。`);
  }
  applyEncounterOpenEffects(state);
}

/** 刚才那次搜索抓到人了吗？抓到才开战 */
function maybeStartEncounter(state: GameState) {
  if (!state.rules.enableEncounter) return;
  if (state.encounter) return;
  if (state.phase === 'gameOver') return;
  if (!state.lastSearchFound) return;
  const kid = state.killerId;
  if (!kid) return;
  const k = state.players[kid];
  if (!k?.roomId || !k.alive) return;
  const here = survivorsInRoom(state, k.roomId);
  if (here.length === 0) return;
  startEncounter(state, k.roomId);
}

/** 比大小：力量 + 永久加攻 + 本次卡牌加攻 vs 加防物品（+ 威廉坚韧）
 *  `diceValues` 有值就用它（「鸿运当骰」重掷后的点数），否则现掷。 */
function resolveEncounterCombat(state: GameState, diceValues?: number[]) {
  const enc = state.encounter;
  if (!enc || !state.killerId) return;
  if (!state.players[state.killerId]) return;
  const survId = enc.targetId;
  if (!survId) return;
  const surv = state.players[survId];
  if (!surv?.alive) {
    log(state, '遭遇对象已倒下，遭遇结束。');
    endKillerTurn(state);
    return;
  }

  const killer = state.players[state.killerId];
  const tempBoost = state.encounterTailBonus ?? 0;
  const powerNow = effectiveKillerPower(state);
  const totalAtk = powerNow + (killer?.attackBonus ?? 0) + tempBoost;
  const parts = [`力量 ${formatKillerPowerLabel(state)}`];
  if (killer?.attackBonus) parts.push(`永久 +${killer.attackBonus}`);
  if (tempBoost) {
    const cardName = enc.attackCardId ? state.cardById[enc.attackCardId]?.name : null;
    parts.push(cardName ? `「${cardName}」本次 +${tempBoost}` : `本次加攻 +${tempBoost}`);
  }
  log(state, `遭遇攻击力：${totalAtk}（${parts.join(' + ')}）。`, 'all', true);
  const trapBonus = enc.trapArmed && !enc.trapApplied ? 2 : 0;

  let defenseValue = 0;
  /** 骰子以外的防御加成（物品、陷阱等）；威廉一技能仅在此项为 0 时触发 */
  let otherDefenseBoost = 0;
  const itemId = enc.defenseItems?.[survId] ?? null;
  if (itemId) {
    const itemBonus = applyDefenseItem(state, survId, itemId);
    if (itemBonus > 0) {
      defenseValue += itemBonus;
      otherDefenseBoost += itemBonus;
    }
  }
  if (trapBonus) {
    enc.trapApplied = true;
    defenseValue += trapBonus;
    otherDefenseBoost += trapBonus;
    log(state, `${surv.name} 必须使用陷阱，防御 +${trapBonus}。`);
  }
  const dieFaces = [1, 0, 1, 1, 0, 3];
  const nDice = Math.max(2, 4 - Math.min(surv.fear, 2));
  const values =
    diceValues && diceValues.length
      ? [...diceValues]
      : Array.from({ length: nDice }, () => dieFaces[Math.floor(Math.random() * dieFaces.length)]!);
  const diceTotal = values.reduce((a, b) => a + b, 0);
  defenseValue += diceTotal;
  if (hasTenacity(state, surv)) {
    if (otherDefenseBoost > 0) {
      log(state, `${surv.name}「坚韧不拔」未触发：本场已有其他防御加成。`);
    } else {
      defenseValue += 1;
      log(state, `${surv.name}「坚韧不拔」：未因其他原因增加防御，防御 +1。`);
    }
  }
  state.lastDiceRoll = {
    id: Date.now(),
    values,
    total: diceTotal,
    attack: totalAtk,
    success: defenseValue >= totalAtk,
    survivorName: surv.name,
  };
  log(state, `${surv.name} 掷骰 ${values.join('+')}=${diceTotal}，防御合计 ${defenseValue}。`, 'all', true);
  const blocked = defenseValue >= totalAtk;
  if (blocked) {
    log(state, `${surv.name} 完全挡住了攻击（防御 ${defenseValue} ≥ 攻击 ${totalAtk}）。`, 'all', true);
    discardFromKillerDeck(state, 2);
    finishEncounter(state);
    return;
  }

  applyDamage(state, survId, 1, state.killerId);
  continueEncounterAfterHit(state);
}

/** 手里有几张「鸿运当骰」（每张给 1 次重掷机会，一次可选任意颗骰子） */
function luckyDiceCount(p: PlayerState): number {
  return p.items.lucky_dice ?? 0;
}

/**
 * 遭遇防御掷骰。掷完先给客户端看点数：
 * 手里有「鸿运当骰」就停下来等他用不用重掷；没有就直接结算。
 */
function rollEncounterDefense(state: GameState) {
  const enc = state.encounter;
  if (!enc?.targetId) return;
  const surv = state.players[enc.targetId];
  if (!surv?.alive) return;
  const dieFaces = [1, 0, 1, 1, 0, 3];
  const nDice = Math.max(2, 4 - Math.min(surv.fear, 2));
  const values = Array.from({ length: nDice }, () => dieFaces[Math.floor(Math.random() * dieFaces.length)]!);
  const killer = state.killerId ? state.players[state.killerId] : null;
  const totalAtk =
    effectiveKillerPower(state) + (killer?.attackBonus ?? 0) + (state.encounterTailBonus ?? 0);
  const extra = luckyDiceCount(surv);
  if (extra <= 0) {
    resolveEncounterCombat(state, values);
    return;
  }
  state.pendingDice = { playerId: surv.id, values, attack: totalAtk, extra };
  state.pendingExtraRerolls = extra;
  log(
    state,
    `${surv.name} 掷骰 ${values.join('+')}。手里有「鸿运当骰」，可以先决定要不要重掷。`,
    'survivor',
  );
}

/**
 * 「鸿运当骰」重掷：由掷骰的幸存者挑**任意几颗**骰子重掷（只重掷选中那些）。
 * 它不算防御物品 —— 和加防物品互不影响，可以同时用（先选用不用加防物品，再决定重掷）。
 * 每用一次消耗 1 张牌；重掷后的结果无论好坏都要接受。
 */
function rerollEncounterDice(state: GameState, p: PlayerState, diceIndexes: number[]) {
  const pend = state.pendingDice;
  if (!pend) throw new Error('现在没有待重掷的骰子');
  if (pend.playerId !== p.id) throw new Error('不是你的骰子');
  if (state.pendingExtraRerolls <= 0) throw new Error('本场已经用过重掷了');
  const picked = [...new Set(diceIndexes)].filter((i) => i >= 0 && i < pend.values.length);
  if (picked.length === 0) throw new Error('请先点选要重掷的骰子');
  const card = Object.values(state.cardById).find((c) => c.effects.some((e) => e.op === 'luckyDice'))
    ?? Object.values(state.cardById).find((c) => c.effects.some((e) => e.itemId === 'lucky_dice'));
  const dieFaces = [1, 0, 1, 1, 0, 3];
  const before = [...pend.values];
  for (const i of picked) {
    pend.values[i] = dieFaces[Math.floor(Math.random() * dieFaces.length)]!;
  }
  /** 用掉一张「鸿运当骰」（它进过装备栏，所以是消耗品） */
  takeItem(p, 'lucky_dice', 1);
  state.pendingExtraRerolls -= 1;
  // 界面读的是 pendingDice.extra，一起同步
  pend.extra = state.pendingExtraRerolls;
  log(
    state,
    `${p.name} 使用「${card?.name ?? '鸿运当骰'}」重掷 ${picked.length} 颗骰子：` +
      `${before.join('+')} → ${pend.values.join('+')}。`,
  );
}

/** 重掷完（或者不重掷）就按当前点数结算 */
function resolvePendingEncounterDice(state: GameState) {
  const pend = state.pendingDice;
  if (!pend) throw new Error('现在没有待结算的骰子');
  const values = [...pend.values];
  state.pendingDice = null;
  state.pendingExtraRerolls = 0;
  resolveEncounterCombat(state, values);
}

/** 对局已经结束，或者还没轮到你，就不许动手 */
function assertActive(state: GameState, playerId: string) {
  if (state.phase === 'gameOver') throw new Error('对局已结束');
  const active = activePlayerId(state);
  if (active !== playerId) throw new Error('还没轮到你');
}

function assertSurvivorMainAction(p: PlayerState) {
  if (p.faction !== 'survivor') throw new Error('只有幸存者可以执行');
  if (!p.alive) throw new Error('已倒下');
  if (p.mainActionUsed) throw new Error('本回合主要行动已使用');
}

/** 一般行动：移动 / 搜索 / 修理 / 特殊 / 拆封堵 / 消恐惧。额外行动和交换不算。 */
function survivorHasGeneralAction(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p?.alive || p.faction !== 'survivor' || p.mainActionUsed) return false;
  if (p.roomId) return true;
  if (p.fear > 0 || p.overFear) return true;
  if (injuredAlliesHere(state, playerId).length > 0) {
    if ((p.items.herb ?? 0) > 0) return true;
    // 医药包只有马尔科本人算「能做的一般行动」
    if ((p.items.marco_medkit ?? 0) > 0 && !personalItemBlockReason(state, p.id, 'marco_medkit')) {
      return true;
    }
  }
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (ch?.skills.some((s) => s.id === 'resourceful') && !p.skillUsedThisTurn.has('resourceful')) {
    if (survivorDiscardHasItem(state, 'adrenaline') || survivorDiscardHasItem(state, 'sedative')) {
      return true;
    }
  }
  return false;
}

function killerMainWorkDone(state: GameState): boolean {
  if (state.killerMainChoice === 'special') return true;
  if (state.killerMainChoice === 'actions' && state.killerMainActionsLeft < 2) return true;
  return false;
}

function killerHasMainOption(state: GameState): boolean {
  const k = state.killerId ? state.players[state.killerId] : null;
  if (!k?.alive) return false;
  if (k.roomId) return true;
  return state.killerHand.some((id) => {
    const card = state.cardById[id];
    if (!card) return false;
    if (effectiveCardSpeed(state, card) !== 'special') return false;
    return state.killerHand.length - 1 >= cardHandCost(card);
  });
}

function assertKillerMainMayLeave(state: GameState) {
  if (state.killerTurnStep !== 'main') return;
  if (killerMainWorkDone(state)) return;
  if (!killerHasMainOption(state)) return;
  throw new Error('第三阶段必须进行 1–2 次行动，或打出 1 张特殊行动牌');
}

/** 杀手牌让他一步步走：点到一个相邻房间 */
function completePendingCardMove(state: GameState, playerId: string, toRoomId: string) {
  const done = completeKillerCardMove(state, toRoomId);
  if (!done) return;
  const speed = state.pendingCardSpeed;
  if (!hasPendingKillerChoice(state)) {
    state.pendingCardSpeed = null;
    maybeStartEncounter(state);
    if (speed === 'special') maybeFinishKillerMain(state);
  }
}

/** 杀手说“走到这里就停 / 留在原地” */
function finishPendingCardMove(state: GameState) {
  finishKillerCardMove(state);
  const speed = state.pendingCardSpeed;
  if (!hasPendingKillerChoice(state)) {
    state.pendingCardSpeed = null;
    maybeStartEncounter(state);
    if (speed === 'special') maybeFinishKillerMain(state);
  }
}

/** 封堵、感知等点选完成后，继续结算这张牌剩下的效果 */
function resumeAfterKillerChoice(state: GameState) {
  if (hasPendingKillerChoice(state)) return;
  continueKillerQueue(state);
  if (hasPendingKillerChoice(state)) return;
  state.pendingCardSpeed = null;
  maybeStartEncounter(state);
  maybeFinishKillerMain(state);
}

function assertTradeLegal(
  state: GameState,
  giver: PlayerState | undefined,
  target: PlayerState | undefined,
  itemId: string,
  amount: number,
  receiveItemId?: string,
): void {
  if (!giver?.alive || giver.faction !== 'survivor') throw new Error('给予者无效');
  if (!target?.alive || target.faction !== 'survivor') throw new Error('目标无效');
  if (target.id === giver.id) throw new Error('不能给自己');
  if (target.roomId !== giver.roomId || !giver.roomId) throw new Error('必须在同一地点');
  if (itemId === 'key' || receiveItemId === 'key') throw new Error('钥匙不能当作装备交换');
  if (amount <= 0) throw new Error('数量无效');
  if ((giver.items[itemId] ?? 0) < amount) throw new Error('物品不足');
  if (receiveItemId) {
    if ((target.items[receiveItemId] ?? 0) < 1) throw new Error('对方没有这件装备');
    const nextMine = itemCount(giver.items) - amount + 1;
    const nextTheirs = itemCount(target.items) - 1 + amount;
    if (nextMine > inventorySlotsFor(state, giver.id)) throw new Error('交换后给予者的装备栏会超员');
    if (nextTheirs > inventorySlotsFor(state, target.id)) throw new Error('交换后对方装备栏会超员');
  } else if (itemCount(target.items) + amount > inventorySlotsFor(state, target.id)) {
    throw new Error('对方装备栏已满，只能互换');
  }
}

function applyResolvedTrade(
  state: GameState,
  giver: PlayerState,
  target: PlayerState,
  itemId: string,
  amount: number,
  receiveItemId?: string,
): void {
  if (receiveItemId) {
    takeItem(giver, itemId, amount);
    takeItem(target, receiveItemId, 1);
    giver.items[receiveItemId] = (giver.items[receiveItemId] ?? 0) + 1;
    target.items[itemId] = (target.items[itemId] ?? 0) + amount;
    log(
      state,
      `${giver.name} 用 ${itemName(itemId)} 与 ${target.name} 交换了 ${itemName(receiveItemId)}。`,
    );
  } else {
    takeItem(giver, itemId, amount);
    target.items[itemId] = (target.items[itemId] ?? 0) + amount;
    log(state, `${giver.name} 将 ${amount}×${itemName(itemId)} 交给 ${target.name}。`);
  }
}

function expirePendingTrade(state: GameState): void {
  const offer = state.pendingTrade;
  if (!offer) return;
  if (state.phase !== 'survivorMain') {
    state.pendingTrade = null;
    return;
  }
  const giver = state.players[offer.fromPlayerId];
  const target = state.players[offer.targetPlayerId];
  try {
    assertTradeLegal(state, giver, target, offer.itemId, offer.amount, offer.receiveItemId);
  } catch {
    log(state, '待确认的物品交换已失效。');
    state.pendingTrade = null;
  }
}

/**
 * 总开关：网页发来的每一种按钮，都在下面分岔。
 * 大厅选角 → 幸存者走路/搜/修 → 杀手打牌 → 遭遇 → 发现/噪音。
 */
export function handleAction(
  state: GameState,
  socketId: string,
  action: ClientAction,
  content: GameContent,
): void {
  const playerId = resolveActorId(state, socketId, action);
  const p = state.players[playerId];
  if (!p) throw new Error('不在房间内');

  if (state.pendingKillerDiscards > 0 && action.type !== 'discardKillerCard') {
    throw new Error('请先弃置多余手牌');
  }
  if (state.pendingAmulet && action.type !== 'confirmAmulet') {
    throw new Error('请先决定是否出示古代护符');
  }
  if (state.pendingEvolutionAck && action.type !== 'ackEvolution') {
    throw new Error('请先确认进化效果');
  }
  if (
    state.pendingOverFearWound &&
    action.type !== 'confirmOverFearWound' &&
    action.type !== 'skipOverFearWound' &&
    action.type !== 'confirmAmulet'
  ) {
    throw new Error('请先决定是否弃牌伤害惊恐过度的幸存者');
  }
  if (
    state.pendingWhizSearch &&
    action.type !== 'confirmWhizSearch' &&
    action.type !== 'skipWhizSearch'
  ) {
    throw new Error('请先决定呼啸而过后是否弃牌搜索房间');
  }
  if (
    state.pendingBlockadeJob &&
    state.pendingBlockadeJob.removeLeft > 0 &&
    action.type !== 'removeBoardBlockade' &&
    action.type !== 'relocateBlockade'
  ) {
    throw new Error('请先移除场上封堵，腾出可放置数量');
  }
  if (state.pendingItemDiscard && action.type !== 'discardItem' && action.type !== 'confirmAmulet') {
    if (state.mode !== 'multi' || playerId === state.pendingItemDiscard.playerId) {
      throw new Error('装备栏已满，请先弃置一件装备');
    }
  }

  if (action.type === 'respondCoopAction') {
    const offer = state.pendingCoopAction;
    if (!offer) throw new Error('当前没有待确认的行动');
    const isProposer = socketId === offer.fromControllerId;
    const isPartner = Boolean(otherConnectedSurvivorOperator(state, offer.fromControllerId)?.id === socketId) ||
      (isSurvivorOperator(state, socketId) && !isProposer);
    if (!isProposer && !isPartner) throw new Error('无权处理这笔行动');
    if (!action.accept) {
      log(state, `${p.name} ${isProposer ? '取消了' : '拒绝了'}「${offer.summary}」。`);
      state.pendingCoopAction = null;
      return;
    }
    if (isProposer) throw new Error('只能由另一名幸存者操控者确认');
    const saved = offer.action;
    const fromId = offer.fromControllerId;
    state.pendingCoopAction = null;
    state.applyingConfirmedCoop = true;
    try {
      handleAction(state, fromId, saved, content);
    } finally {
      state.applyingConfirmedCoop = false;
    }
    return;
  }

  if (needsCoopConfirm(state, action, p)) {
    if (state.pendingCoopAction) throw new Error('已有一笔行动等待队友确认');
    const partner = otherConnectedSurvivorOperator(state, socketId);
    if (partner) {
      state.pendingCoopAction = {
        fromControllerId: socketId,
        fromName: state.survivorOperators.find((o) => o.id === socketId)?.name ?? p.name,
        actorPlayerId: p.id,
        actorName: p.name,
        summary: coopActionSummary(state, action, p),
        action: { ...action },
      };
      log(state, `${state.pendingCoopAction.fromName} 提出「${state.pendingCoopAction.summary}」，等待队友确认。`);
      return;
    }
  }

  switch (action.type) {
    // —— 大厅：改名字、选模式、选角色、准备、开打 ——
    case 'setName': {
      const next = action.name.slice(0, 24) || p.controllerName || p.name;
      p.controllerName = next;
      if (state.phase === 'lobby' || state.phase === 'characterSelect') p.name = next;
      for (const pl of Object.values(state.players)) {
        if (pl.controllerId === socketId) pl.controllerName = next;
      }
      break;
    }
    case 'setMap': {
      if (socketId !== state.hostId) throw new Error('只有房主可以换地图');
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('对局开始后无法换地图');
      }
      const next = content.maps.find((m) => m.id === action.mapId);
      if (!next) throw new Error('没有这张地图');
      if (!next.backgrounds?.survivor && !next.backgrounds?.killer) {
        throw new Error('这张地图还没有画底图，不能用来对局');
      }
      if (next.id === state.map.id) break;
      state.map = next;
      log(state, `地图已切换为「${next.name}」。`);
      break;
    }
    case 'setReplacementDeck': {
      if (socketId !== state.hostId) throw new Error('只有房主可以改设置');
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('对局开始后无法改设置');
      }
      state.replacementDeck = Boolean(action.on);
      log(
        state,
        state.replacementDeck
          ? '已开启【替换「鸿运当骰」等牌】：搜索牌堆里的 1 把钥匙、1 个手斧、1 瓶威士忌酒瓶会换成鸿运当骰、煤油灯、神秘包裹。'
          : '已关闭【替换「鸿运当骰」等牌】。',
      );
      break;
    }
    case 'setMode': {
      if (socketId !== state.hostId) throw new Error('只有房主可以切换模式');
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('对局开始后无法切换模式');
      }
      const mode: GameMode = action.mode;
      if (mode === 'solo') {
        const others = Object.keys(state.players).filter((id) => id !== state.hostId);
        if (others.length > 0) {
          throw new Error('房间里还有其他人，无法切到单人模式（请让其退出或新开房间）');
        }
      }
      if (mode === 'duo' && Object.keys(state.players).length > 2) {
        throw new Error('1 对 1 只能 2 人，请先让多余的人退出');
      }
      if (mode === 'vs2' && Object.keys(state.players).length > 3) {
        throw new Error('1对2 只能 3 人，请先让多余的人退出');
      }
      state.mode = mode;
      state.soloKillerCharacterId = null;
      state.soloSurvivorCharacterIds = [];
      state.survivorOperators = [];
      state.pendingCoopAction = null;
      for (const pl of Object.values(state.players)) {
        pl.faction = null;
        pl.characterId = null;
        pl.ready = false;
      }
      state.phase = 'lobby';
      log(
        state,
        mode === 'solo'
          ? '已切换为【单人热座】模式。'
          : mode === 'duo'
            ? '已切换为【1 对 1】：一人杀手，一人操控 3 名幸存者。'
            : mode === 'vs2'
              ? '已切换为【1对2】：一人杀手，两人共控 3 名幸存者。一般行动和额外行动需另一人确认。'
              : '已切换为【1对3】模式。',
      );
      break;
    }
    case 'setSoloKiller': {
      if (state.mode !== 'solo') throw new Error('仅单人模式可选');
      if (socketId !== state.hostId) throw new Error('只有房主可以选角');
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('当前无法选择角色');
      }
      const ch = content.characters.find((c) => c.id === action.characterId);
      if (!ch || ch.faction !== 'killer') throw new Error('请选择杀手角色');
      if (state.soloSurvivorCharacterIds.includes(action.characterId)) {
        throw new Error('不能与幸存者选同一角色');
      }
      state.soloKillerCharacterId = action.characterId;
      p.ready = false;
      state.phase = 'characterSelect';
      break;
    }
    case 'setSoloSurvivor': {
      if (state.mode !== 'solo' && state.mode !== 'duo' && state.mode !== 'vs2') {
        throw new Error('仅单人、1对1或1对2可选多名幸存者');
      }
      if (state.mode === 'solo' && socketId !== state.hostId) throw new Error('只有房主可以选角');
      if ((state.mode === 'duo' || state.mode === 'vs2') && p.faction !== 'survivor') {
        throw new Error('请先选择幸存者阵营，再点选 3 名幸存者');
      }
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('当前无法选择角色');
      }
      const ch = content.characters.find((c) => c.id === action.characterId);
      if (!ch || ch.faction !== 'survivor') throw new Error('请选择幸存者角色');
      if (state.soloKillerCharacterId === action.characterId) {
        throw new Error('不能与杀手选同一角色');
      }
      const needed = state.rules.maxSurvivors;
      const ids = [...state.soloSurvivorCharacterIds];
      const idx = ids.indexOf(action.characterId);
      if (idx >= 0) ids.splice(idx, 1);
      else if (ids.length >= needed) {
        throw new Error(`幸存者已选满 ${needed} 人，请先取消一名再换`);
      } else {
        ids.push(action.characterId);
      }
      state.soloSurvivorCharacterIds = ids;
      p.ready = false;
      state.phase = 'characterSelect';
      break;
    }
    case 'setFaction': {
      if (state.mode === 'solo') throw new Error('单人模式请直接选择杀手与幸存者角色');
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('当前无法更换阵营');
      }
      if (action.faction === 'killer') {
        const existing = Object.values(state.players).find(
          (x) => x.faction === 'killer' && x.id !== playerId,
        );
        if (existing) throw new Error('杀手位置已被占用');
      }
      if (action.faction === 'survivor') {
        const count = Object.values(state.players).filter(
          (x) => x.faction === 'survivor' && x.id !== playerId,
        ).length;
        const cap = state.mode === 'duo' ? 1 : state.mode === 'vs2' ? 2 : state.rules.maxSurvivors;
        if (count >= cap) {
          throw new Error(
            state.mode === 'duo'
              ? '1 对 1 只能有一名玩家操控全部幸存者'
              : state.mode === 'vs2'
                ? '1对2 只能有两名玩家共控幸存者'
                : `幸存者已满 ${cap} 人`,
          );
        }
      }
      if (
        (state.mode === 'duo' || state.mode === 'vs2') &&
        p.faction === 'survivor' &&
        action.faction !== 'survivor'
      ) {
        const still = Object.values(state.players).filter(
          (x) => x.faction === 'survivor' && x.id !== playerId,
        ).length;
        if (still === 0) state.soloSurvivorCharacterIds = [];
      }
      p.faction = action.faction;
      p.characterId = null;
      p.ready = false;
      state.phase = 'characterSelect';
      break;
    }
    case 'selectCharacter': {
      if (state.mode === 'solo') throw new Error('单人模式请用杀手/幸存者选角按钮');
      if ((state.mode === 'duo' || state.mode === 'vs2') && p.faction === 'survivor') {
        throw new Error('幸存者请点选 3 名幸存者角色');
      }
      if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
        throw new Error('当前无法选择角色');
      }
      if (!p.faction || p.faction === 'spectator') throw new Error('请先选择阵营');
      const ch = content.characters.find((c) => c.id === action.characterId);
      if (!ch || ch.faction !== p.faction) throw new Error('角色无效');
      const taken = Object.values(state.players).some(
        (x) => x.characterId === action.characterId && x.id !== playerId,
      );
      if (taken) throw new Error('该角色已被选择');
      p.characterId = action.characterId;
      p.ready = false;
      state.phase = 'characterSelect';
      break;
    }
    case 'setReady': {
      if (state.mode === 'solo') {
        if (
          !state.soloKillerCharacterId ||
          state.soloSurvivorCharacterIds.length !== state.rules.maxSurvivors
        ) {
          throw new Error(`请先选好 1 名杀手和 ${state.rules.maxSurvivors} 名幸存者`);
        }
        p.ready = action.ready;
        break;
      }
      if (state.mode === 'duo' || state.mode === 'vs2') {
        if (p.faction === 'killer') {
          if (!p.characterId) throw new Error('请先选择杀手角色');
        } else if (p.faction === 'survivor') {
          if (state.soloSurvivorCharacterIds.length !== state.rules.maxSurvivors) {
            throw new Error(`请先点选 ${state.rules.maxSurvivors} 名幸存者`);
          }
        } else {
          throw new Error('请先选择阵营');
        }
        p.ready = action.ready;
        break;
      }
      if (!p.faction || !p.characterId) throw new Error('请先选择阵营和角色');
      p.ready = action.ready;
      break;
    }
    case 'startGame': {
      if (socketId !== state.hostId) throw new Error('只有房主可以开始游戏');
      startGame(state, content, socketId);
      break;
    }
    // —— 幸存者阶段：选谁行动、走路、搜索、修理、恐惧、封堵、交换、技能、物品 ——
    case 'pickSurvivorTurn': {
      if (state.phase === 'discovery' && state.pendingDiscoveryPick) {
        if (state.mode !== 'solo' && p.faction !== 'survivor') {
          throw new Error('只有幸存者可以选择翻牌的人');
        }
        const target = state.players[action.playerId];
        if (!target || target.faction !== 'survivor' || !target.alive) {
          throw new Error('无法选择该幸存者');
        }
        beginDiscoveryDraw(state, target.id);
        break;
      }
      if (state.phase !== 'survivorMain') {
        throw new Error('现在不能选择行动顺序');
      }
      if (state.mode !== 'solo' && p.faction !== 'survivor') {
        throw new Error('只有幸存者可以选择行动顺序');
      }
      const target = state.players[action.playerId];
      if (!target || target.faction !== 'survivor' || !target.alive) {
        throw new Error('无法选择该幸存者');
      }
      if (target.actedThisRound) throw new Error('该幸存者本回合已经做过一般行动');
      if (state.mode === 'multi') {
        if (target.id !== p.id) throw new Error('1对3 只能点选自己的角色开始小回合');
        if (!state.pendingSurvivorPick) throw new Error('当前已有幸存者在行动');
      } else if (!state.pendingSurvivorPick) {
        const curId = activeSurvivorId(state);
        const cur = curId ? state.players[curId] : null;
        if (cur?.mainActionUsed) {
          throw new Error('当前幸存者已开始一般行动，不能再换人');
        }
      }
      startPickedSurvivorTurn(state, target.id);
      break;
    }
    case 'move': {
      if (state.phase === 'encounter' && state.encounter?.step === 'flee') {
        throw new Error('请使用逃离操作');
      }
      assertActive(state, playerId);
      if (p.faction === 'survivor') {
        assertSurvivorMainAction(p);
        const range = state.rules.survivorMoveRange + p.moveBonus;
        const ok = tryMove(state, playerId, action.toRoomId, range, 1);
        if (!ok) throw new Error('一般行动移动必须 1–2 步');
        p.mainActionUsed = true;
        p.moveLeft = 0;
        checkSurvivorWin(state);
        advanceAfterSurvivor(state, p.id);
      } else if (p.faction === 'killer') {
        if (state.phase !== 'killerMain' && state.phase !== 'upkeep') throw new Error('当前无法移动');
        if (state.pendingBlockadeJob && state.pendingBlockadeJob.removeLeft > 0) {
          const hits = removableForJob(state).filter((id) => {
            const pair = parseDoor(id);
            return pair && (pair[0] === action.toRoomId || pair[1] === action.toRoomId);
          });
          if (hits.length === 0) throw new Error('请选择一个可拆除的已封堵门');
          if (hits.length > 1) throw new Error('该地点有多扇已封堵门，请在行动区点选要拆除的那扇');
          removeBoardBlockade(state, hits[0]!);
          resumeAfterKillerChoice(state);
          if (state.phase === 'upkeep') maybeCloseKillerUpkeep(state);
          break;
        }
        if (state.pendingBlockadeJob?.kind === 'anyDoors' && state.pendingBlockadeJob.removeLeft <= 0) {
          pickAnyDoorRoom(state, action.toRoomId);
          break;
        }
        if (state.pendingPathDraft) {
          const draft = state.pendingPathDraft;
          const last = draft.rooms[draft.rooms.length - 1];
          if (!last) throw new Error('没有起点');
          const already = draft.rooms.lastIndexOf(action.toRoomId);
          if (already >= 0) {
            draft.rooms = draft.rooms.slice(0, Math.max(1, already));
            log(state, `已取消该地点。路径：${draft.rooms.map((id) => roomName(state, id)).join(' → ')}`);
            break;
          }
          if (!roomsAdjacentKiller(state, last).includes(action.toRoomId)) {
            throw new Error('请点与当前路径末端相邻的地点');
          }
          const taken = draft.rooms.length - 1;
          if (taken >= draft.max) throw new Error('步数已用完，请点确认');
          draft.rooms.push(action.toRoomId);
          log(state, `路径：${draft.rooms.map((id) => roomName(state, id)).join(' → ')}（再点同一格可取消，确认后才结算）`);
          break;
        }
        if (state.pendingSensePair) {
          const pending = state.pendingSensePair;
          if (pending.secondRoomId && action.toRoomId === pending.secondRoomId) {
            pending.secondRoomId = null;
            log(state, `已取消「${roomName(state, action.toRoomId)}」。请再选第二个地点或确认。`);
            break;
          }
          if (pending.firstRoomId && action.toRoomId === pending.firstRoomId) {
            pending.firstRoomId = pending.secondRoomId ?? null;
            pending.secondRoomId = null;
            log(
              state,
              pending.firstRoomId
                ? `已取消该地点。当前仍选「${roomName(state, pending.firstRoomId)}」。`
                : '已取消地点选择。请重新点选。',
            );
            break;
          }
          if (!pending.firstRoomId) {
            if (!state.map.rooms.some((r) => r.id === action.toRoomId)) throw new Error('未知地点');
            pending.firstRoomId = action.toRoomId;
            log(state, `已选「${roomName(state, action.toRoomId)}」，请再选一个与它相连的地点，然后确认。再点同一格可取消。`);
            break;
          }
          if (pending.secondRoomId) {
            throw new Error('已经选好两个地点，请点确认感知，或再点已选地点取消');
          }
          if (!mapAdjacentRooms(state.map, pending.firstRoomId).includes(action.toRoomId)) {
            throw new Error('这两个地点不相连');
          }
          pending.secondRoomId = action.toRoomId;
          log(state, `已选「${roomName(state, pending.firstRoomId)}」与「${roomName(state, action.toRoomId)}」，请点确认感知。`);
          break;
        }
        if (state.pendingBlockade) {
          if (!p.roomId) throw new Error('不在地图上');
          placeBlockade(state, p.roomId, action.toRoomId);
          afterOneDoorPlaced(state);
          continueKillerQueue(state);
          if (!hasPendingKillerChoice(state)) {
            state.pendingCardSpeed = null;
            maybeStartEncounter(state);
            maybeFinishKillerMain(state);
          }
          break;
        }
        if (state.pendingMoveRange != null) {
          completePendingCardMove(state, playerId, action.toRoomId);
          break;
        }
        if (state.killerTurnStep !== 'main' || state.killerMainChoice !== 'actions') {
          throw new Error('请先结束快速阶段，并选择执行 2 个普通行动');
        }
        if (state.killerMainActionsLeft <= 0) throw new Error('没有剩余主要行动');
        const range = state.rules.killerMoveRange + p.moveBonus;
        const ok = tryMove(state, playerId, action.toRoomId, range);
        if (!ok) throw new Error('非法移动');
        state.killerMainActionsLeft -= 1;
        p.actionsLeft = state.killerMainActionsLeft;
        p.moveLeft = state.rules.killerMoveRange + p.moveBonus;
        maybeFinishKillerMain(state);
      }
      break;
    }
    case 'search': {
      assertActive(state, playerId);
      if (p.faction === 'survivor') {
        assertSurvivorMainAction(p);
        doSearch(state, playerId);
        p.mainActionUsed = true;
        p.moveLeft = 0;
        checkSurvivorWin(state);
        advanceAfterSurvivor(state, p.id);
      } else if (p.faction === 'killer') {
        if (state.phase !== 'killerMain') throw new Error('当前无法搜索房间');
        if (hasPendingKillerChoice(state)) throw new Error('请先完成当前牌的选择');
        if (state.killerTurnStep !== 'main' || state.killerMainChoice !== 'actions') {
          throw new Error('请先结束快速阶段，并选择执行 2 个普通行动');
        }
        if (state.killerMainActionsLeft <= 0) throw new Error('没有剩余主要行动');
        setStealth(p, false);
        state.killerMainActionsLeft -= 1;
        p.actionsLeft = state.killerMainActionsLeft;
        const here = p.roomId;
        if (!here) throw new Error('不在地图上');
        const victims = survivorsInRoom(state, here);
        state.lastSearchFound = victims.length > 0;
        if (victims.length === 0) {
          log(state, `${p.name} 搜索房间，没有发现人。`);
        } else {
          log(state, `${p.name} 发现了 ${victims.length} 名幸存者！`);
        }
        maybeStartEncounter(state);
        maybeFinishKillerMain(state);
      } else {
        throw new Error('无法搜索房间');
      }
      break;
    }
    case 'repair': {
      assertActive(state, playerId);
      assertSurvivorMainAction(p);
      doRepair(state, playerId);
      p.mainActionUsed = true;
      p.moveLeft = 0;
      checkSurvivorWin(state);
      advanceAfterSurvivor(state, p.id);
      break;
    }
    case 'clearFear': {
      assertActive(state, playerId);
      assertSurvivorMainAction(p);
      if (!state.rules.enableFear) throw new Error('本局未启用恐惧');
      p.fear = 0;
      p.overFear = false;
      p.mainActionUsed = true;
      p.moveLeft = 0;
      log(state, `${p.name} 消除恐惧。`);
      advanceAfterSurvivor(state, p.id);
      break;
    }
    case 'removeBlockade': {
      assertActive(state, playerId);
      assertSurvivorMainAction(p);
      if (!state.rules.enableBlockades) throw new Error('本局未启用封堵');
      if (!p.roomId) throw new Error('不在地图上');
      if (!doorsAt(state, p.roomId).some((d) => isDoorBlocked(state, d.id))) {
        throw new Error('当前地点没有可拆的门封堵');
      }
      removeBlockade(state, p.roomId);
      p.mainActionUsed = true;
      p.moveLeft = 0;
      advanceAfterSurvivor(state, p.id);
      break;
    }
    case 'tradeItem': {
      if (state.phase !== 'survivorMain') throw new Error('仅幸存者阶段（发现之前）可交易');
      const giverId = action.fromPlayerId ?? playerId;
      const giver = state.players[giverId];
      if (isSharedSurvivorMode(state)) {
        if (!controlsPiece(state, socketId, giver)) {
          throw new Error('无权操作该幸存者');
        }
      } else {
        if (p.faction !== 'survivor' || !p.alive) throw new Error('只有幸存者可交易');
        if (!giver || giver.controllerId !== socketId || giver.id !== p.id) {
          throw new Error('只能交出自己的物品');
        }
      }
      const target = state.players[action.targetPlayerId];
      const itemId = action.itemId;
      const amount = action.amount ?? 1;
      assertTradeLegal(state, giver, target, itemId, amount, action.receiveItemId);
      if (state.mode === 'multi') {
        if (state.pendingTrade) throw new Error('已有一笔交换等待确认');
        state.pendingTrade = {
          fromPlayerId: giver!.id,
          targetPlayerId: target!.id,
          itemId,
          amount,
          receiveItemId: action.receiveItemId,
        };
        log(
          state,
          action.receiveItemId
            ? `${giver!.name} 向 ${target!.name} 提出用 ${itemName(itemId)} 交换 ${itemName(action.receiveItemId)}，等待确认。`
            : `${giver!.name} 向 ${target!.name} 提出给予 ${amount}×${itemName(itemId)}，等待确认。`,
        );
        break;
      }
      applyResolvedTrade(state, giver!, target!, itemId, amount, action.receiveItemId);
      break;
    }
    case 'respondTrade': {
      const offer = state.pendingTrade;
      if (!offer) throw new Error('当前没有待确认的交换');
      if (state.phase !== 'survivorMain') throw new Error('仅幸存者阶段可确认交换');
      const isTarget = p.id === offer.targetPlayerId;
      const isGiver = p.id === offer.fromPlayerId;
      if (!isTarget && !isGiver) throw new Error('无权处理这笔交换');
      if (!action.accept) {
        log(state, `${p.name} ${isTarget && !isGiver ? '拒绝了' : '取消了'}物品交换。`);
        state.pendingTrade = null;
        break;
      }
      if (!isTarget) throw new Error('只能由接收方确认收下');
      const giver = state.players[offer.fromPlayerId];
      const target = state.players[offer.targetPlayerId];
      try {
        assertTradeLegal(state, giver, target, offer.itemId, offer.amount, offer.receiveItemId);
      } catch (err) {
        state.pendingTrade = null;
        throw err;
      }
      applyResolvedTrade(state, giver!, target!, offer.itemId, offer.amount, offer.receiveItemId);
      state.pendingTrade = null;
      break;
    }
    case 'discardItem': {
      const pending = state.pendingItemDiscard;
      if (!pending || pending.playerId !== playerId) throw new Error('当前不需要弃装备');
      if (p.faction !== 'survivor') throw new Error('只有幸存者可弃装备');
      if (!takeItem(p, action.itemId, 1)) throw new Error('你没有这件装备');
      discardConsumedItem(state, action.itemId, 1);
      pending.count -= 1;
      log(state, `${p.name} 弃置了 ${itemName(action.itemId)}。`);
      if (pending.count <= 0 || itemCount(p.items) <= inventorySlotsFor(state, p.id)) {
        state.pendingItemDiscard = null;
        if (state.phase === 'discovery' && state.discoveryOptions.length === 0) {
          enterNoiseReport(state);
        }
      }
      break;
    }
    case 'useSkill': {
      const ch = content.characters.find((c) => c.id === p.characterId);
      const skill = ch?.skills.find((s) => s.id === action.skillId);
      if (!skill) throw new Error('未知技能');
      if (skill.trigger !== 'activated') throw new Error('该技能不可主动使用');
      if (skill.oncePerTurn && p.skillUsedThisTurn.has(skill.id)) {
        throw new Error('本回合已使用过该技能');
      }
      if (skill.id === 'observant') {
        if (p.faction !== 'survivor' || !p.alive) throw new Error('只有幸存者可使用');
        if (state.phase !== 'survivorMain') throw new Error('仅幸存者阶段可使用');
        if (!action.toRoomId) throw new Error('请选择秘密通道出口');
        const extra = (p.items.flashlight ?? 0) > 0;
        if (!extra) {
          assertActive(state, playerId);
          assertSurvivorMainAction(p);
          p.mainActionUsed = true;
          p.moveLeft = 0;
        } else if (!controlsPiece(state, socketId, p)) {
          throw new Error('无权操作该幸存者');
        }
        trySecretPassage(state, playerId, action.toRoomId);
        p.skillUsedThisTurn.add(skill.id);
        log(
          state,
          extra
            ? `${p.name} 持手电筒发动「观察入微」（额外行动）。`
            : `${p.name} 发动「观察入微」。`,
        );
        checkSurvivorWin(state);
        if (!extra) advanceAfterSurvivor(state, p.id);
        break;
      }
      if (skill.id === 'resourceful') {
        if (p.faction !== 'survivor' || !p.alive) throw new Error('只有幸存者可使用');
        if (state.phase !== 'survivorMain') throw new Error('仅幸存者阶段可使用');
        const itemId = action.itemId;
        if (itemId !== 'adrenaline' && itemId !== 'sedative') throw new Error('请选择肾上腺素或镇静剂');
        if (!survivorDiscardHasItem(state, itemId)) throw new Error('弃牌堆里没有这张牌');
        assertActive(state, playerId);
        assertSurvivorMainAction(p);
        if (!takeEarliestFromSurvivorDiscard(state, itemId)) throw new Error('弃牌堆里没有这张牌');
        p.items[itemId] = (p.items[itemId] ?? 0) + 1;
        enforceInventory(state, playerId);
        p.mainActionUsed = true;
        p.moveLeft = 0;
        p.skillUsedThisTurn.add(skill.id);
        log(state, `${p.name} 发动「足智多谋」，从弃牌堆拿回了「${itemName(itemId)}」。`, 'survivor');
        advanceAfterSurvivor(state, p.id);
        break;
      }
      if (skill.id === 'sprint') {
        if (p.faction !== 'survivor' || !p.alive) throw new Error('只有幸存者可使用');
        if (state.phase !== 'survivorMain') throw new Error('仅幸存者阶段可使用');
        if (!action.toRoomId) throw new Error('请选择短跑目的地');
        const legal = legalMoveRooms(state, playerId, 3, 3);
        if (legal.length === 0) throw new Error('没有刚好 3 步可达的地点');
        if (!legal.includes(action.toRoomId)) throw new Error('目的地必须刚好 3 步');
        assertActive(state, playerId);
        assertSurvivorMainAction(p);
        const ok = tryMove(state, playerId, action.toRoomId, 3, 3);
        if (!ok) throw new Error('短跑移动不合法');
        if (p.roomId) pushNoise(state, p.roomId);
        p.mainActionUsed = true;
        p.moveLeft = 0;
        p.skillUsedThisTurn.add(skill.id);
        checkSurvivorWin(state);
        advanceAfterSurvivor(state, p.id);
        break;
      }
      const heals = skill.effects.some((e) => e.op === 'heal');
      if (heals) {
        const tid = action.targetPlayerId ?? playerId;
        assertHealSameRoom(state, playerId, tid);
      }
      if (p.faction === 'survivor') {
        assertActive(state, playerId);
        assertSurvivorMainAction(p);
        p.mainActionUsed = true;
        p.moveLeft = 0;
      } else if (p.faction === 'killer') {
        if (state.phase !== 'killerMain') throw new Error('当前无法使用技能');
        if (hasPendingKillerChoice(state)) throw new Error('请先完成当前牌的选择');
        if (state.killerTurnStep !== 'main' || state.killerMainChoice !== 'actions') {
          throw new Error('技能占用普通主要行动，请先选择 2 次行动');
        }
        if (state.killerMainActionsLeft <= 0) throw new Error('没有剩余主要行动');
        state.killerMainActionsLeft -= 1;
        p.actionsLeft = state.killerMainActionsLeft;
      }
      p.skillUsedThisTurn.add(skill.id);
      runEffects({
        state,
        actorId: playerId,
        effects: skill.effects,
        targetPlayerId: action.targetPlayerId,
      });
      if (p.faction === 'killer') {
        maybeStartEncounter(state);
        maybeFinishKillerMain(state);
      }
      checkSurvivorWin(state);
      if (p.faction === 'survivor') {
        advanceAfterSurvivor(state, p.id);
      }
      break;
    }
    case 'useItem': {
      if (p.faction !== 'survivor' || !p.alive) throw new Error('只有存活幸存者可使用物品');
      if (state.phase !== 'survivorMain') throw new Error('仅幸存者阶段可使用物品');
      const extraItems = new Set([
        'sophia_camera',
        'whiskey',
        'adrenaline',
        'sedative',
        'firecracker',
        'axe',
        // 替换牌：煤油灯走通道、神秘包裹抽发现牌，都是额外行动
        'lamp',
        'parcel',
      ]);
      if (!extraItems.has(action.itemId)) {
        assertActive(state, playerId);
      } else if (!controlsPiece(state, socketId, p)) {
        throw new Error('无权操作该幸存者');
      }
      if ((p.items[action.itemId] ?? 0) < 1 && action.itemId !== 'sophia_camera') {
        throw new Error('你没有这件物品');
      }
      if (action.itemId === 'sophia_camera') {
        // 本人限定：换给别人也用不了
        const ownerBlock = personalItemBlockReason(state, playerId, 'sophia_camera');
        if (ownerBlock) throw new Error(ownerBlock);
        if ((p.items.sophia_camera ?? 0) < 1) throw new Error('你没有索菲亚的相机');
        if (p.skillUsedThisTurn.has('sophia_camera')) throw new Error('本回合已使用过相机');
        if (!p.roomId) throw new Error('不在地图上');
        takeItem(p, 'sophia_camera', 1);
        discardConsumedItem(state, 'sophia_camera', 1);
        p.skillUsedThisTurn.add('sophia_camera');
        pushNoise(state, p.roomId);
        log(state, `${p.name} 使用索菲亚的相机（额外行动），在原地发出响声。`);
        break;
      }
      if (action.itemId === 'toolbox') {
        if (!p.roomId) throw new Error('不在地图上');
        const room = state.map.rooms.find((r) => r.id === p.roomId);
        if (!room?.tags.includes('repairable')) throw new Error('当前地点不能修理');
        if (state.repairedThisPhase) throw new Error('本阶段已经有人修理过了');
        if (state.repairProgress >= state.rules.repairNeeded) throw new Error('无线电已经修好');
        if (killerInRoom(state, p.roomId)) throw new Error('与杀手同地不能修理');
        assertSurvivorMainAction(p);
        takeItem(p, 'toolbox', 1);
        discardConsumedItem(state, 'toolbox', 1);
        const amount = 2 + (isEngineeringExpert(state, playerId) ? 1 : 0);
        const repairBefore = state.repairProgress;
        state.repairedThisPhase = true;
        p.repairedThisTurn = true;
        p.mainActionUsed = true;
        p.moveLeft = 0;
        const repairAdded = addRepairProgress(state, amount);
        log(
          state,
          `${p.name} 使用工具箱修理无线电 +${repairAdded}（${state.repairProgress}/${state.rules.repairNeeded}）。`,
          'survivor',
        );
        announceRepairIfJustFinished(state, repairBefore);
        maybeArmRescue(state);
        if (state.rules.repairMakesNoise && p.roomId) pushNoise(state, p.roomId);
        checkSurvivorWin(state);
        advanceAfterSurvivor(state, p.id);
        break;
      }
      if (action.itemId === 'whiskey') {
        if (!action.toRoomId) throw new Error('请选择相邻地点');
        if (!p.roomId) throw new Error('不在地图上');
        if (!generalAdjacentRooms(state.map, p.roomId).includes(action.toRoomId)) {
          throw new Error('只能在门或一般通道相邻的地点发出响声');
        }
        takeItem(p, 'whiskey', 1);
        discardConsumedItem(state, 'whiskey', 1);
        pushNoise(state, action.toRoomId);
        log(state, `${p.name} 把威士忌酒瓶扔向「${roomName(state, action.toRoomId)}」。`, 'survivor');
        break;
      }
      if (action.itemId === 'adrenaline') {
        if (!action.toRoomId) throw new Error('请选择移动目的地');
        const legal = legalMoveRooms(state, playerId, 1, 1);
        if (legal.length === 0) throw new Error('没有可进入的相邻地点');
        if (!legal.includes(action.toRoomId)) throw new Error('肾上腺素只能移动 1 步');
        takeItem(p, 'adrenaline', 1);
        discardConsumedItem(state, 'adrenaline', 1);
        const ok = tryMove(state, playerId, action.toRoomId, 1, 1);
        if (!ok) throw new Error('移动不合法');
        log(state, `${p.name} 使用肾上腺素移动。`, 'survivor');
        checkSurvivorWin(state);
        break;
      }
      if (action.itemId === 'sedative') {
        takeItem(p, 'sedative', 1);
        discardConsumedItem(state, 'sedative', 1);
        p.fear = 0;
        p.overFear = false;
        log(state, `${p.name} 使用镇静剂，消除了恐惧。`);
        break;
      }
      if (action.itemId === 'firecracker') {
        takeItem(p, 'firecracker', 1);
        discardConsumedItem(state, 'firecracker', 1);
        state.firecrackerThisRound = true;
        state.firecrackerRoomId = null;
        state.noises = [];
        log(state, '点燃爆竹。接下来的杀手回合视为所有地点发出响声，不再额外放置响声标记。');
        break;
      }
      if (action.itemId === 'axe' && action.toRoomId === undefined && !action.targetPlayerId) {
        if (!p.roomId) throw new Error('不在地图上');
        if (!doorsAt(state, p.roomId).some((d) => isDoorBlocked(state, d.id))) {
          throw new Error('当前地点没有可拆的封堵');
        }
        takeItem(p, 'axe', 1);
        discardConsumedItem(state, 'axe', 1);
        removeBlockade(state, p.roomId);
        log(state, `${p.name} 用手斧拆除了封堵。`, 'survivor');
        break;
      }
      if (action.itemId === 'flashlight') {
        if (!action.toRoomId) throw new Error('请选择秘密通道出口');
        assertSurvivorMainAction(p);
        trySecretPassage(state, playerId, action.toRoomId);
        p.mainActionUsed = true;
        p.moveLeft = 0;
        log(state, `${p.name} 使用手电筒穿过秘密通道。`);
        checkSurvivorWin(state);
        advanceAfterSurvivor(state, p.id);
        break;
      }
      // 煤油灯：额外行动穿过秘密通道
      if (action.itemId === 'lamp') {
        if (!action.toRoomId) throw new Error('请选择秘密通道出口');
        trySecretPassage(state, playerId, action.toRoomId);
        log(state, `${p.name} 使用煤油灯穿过秘密通道。`);
        checkSurvivorWin(state);
        break;
      }
      // 神秘包裹：额外行动，从发现牌堆抽一张，并在自己所在格发出响声
      if (action.itemId === 'parcel') {
        if (!p.roomId) throw new Error('不在地图上');
        const cardId = drawDiscoveryCard(state);
        takeItem(p, 'parcel', 1);
        discardConsumedItem(state, 'parcel', 1);
        if (cardId) {
          keepSuitcaseDiscovery(state, p.id, cardId);
        } else {
          log(state, '发现牌堆已空，神秘包裹没有抽到牌。');
        }
        pushNoise(state, p.roomId);
        checkSurvivorWin(state);
        break;
      }
      if (action.itemId === 'trap') {
        assertSurvivorMainAction(p);
        if (!p.roomId) throw new Error('不在地图上');
        takeItem(p, 'trap', 1);
        discardConsumedItem(state, 'trap', 1);
        if (!state.trapRoomIds) state.trapRoomIds = [];
        if (!state.trapRoomIds.includes(p.roomId)) state.trapRoomIds.push(p.roomId);
        p.mainActionUsed = true;
        p.moveLeft = 0;
        log(state, `${p.name} 在「${roomName(state, p.roomId)}」放置了陷阱。`, 'survivor');
        advanceAfterSurvivor(state, p.id);
        break;
      }
      const heal = healItemDef(action.itemId);
      if (!heal) throw new Error('该物品不能这样使用');
      // 医药包只能马尔科本人用（换给别人也用不了）
      const healOwnerBlock = personalItemBlockReason(state, playerId, action.itemId);
      if (healOwnerBlock) throw new Error(healOwnerBlock);
      const targetId = action.targetPlayerId ?? playerId;
      assertHealSameRoom(state, playerId, targetId);
      const target = state.players[targetId]!;
      if (injuredAlliesHere(state, playerId).length === 0) throw new Error('同一地点没有受伤的幸存者，无法使用治疗');
      assertSurvivorMainAction(p);
      if (heal.consume) {
        takeItem(p, action.itemId, 1);
        discardConsumedItem(state, action.itemId, 1);
      }
      applyHeal(state, targetId, heal.amount);
      if (heal.clearFear) {
        target.fear = 0;
        target.overFear = false;
      }
      if (heal.noiseAtUser && p.roomId) pushNoise(state, p.roomId);
      p.mainActionUsed = true;
      p.moveLeft = 0;
      log(
        state,
        heal.clearFear
          ? `${p.name} 使用「${itemName(action.itemId)}」治疗了 ${target.name}，并消除其恐惧。`
          : `${p.name} 使用「${itemName(action.itemId)}」治疗了 ${target.name}。`,
      );
      checkSurvivorWin(state);
      advanceAfterSurvivor(state, p.id);
      break;
    }
    case 'useSuitcase': {
      if (p.faction !== 'survivor' || !p.alive) throw new Error('只有存活幸存者可打开手提箱');
      if (state.phase !== 'survivorMain') throw new Error('仅幸存者大回合可打开手提箱');
      if (!controlsPiece(state, socketId, p)) throw new Error('无权操作该幸存者');
      const room = suitcaseRoomId(state);
      if (!room) throw new Error('当前地图没有手提箱');
      if (p.roomId !== room) throw new Error(`只有位于「${roomName(state, room)}」的幸存者可以打开手提箱`);
      if (!state.suitcaseAvailable) throw new Error('手提箱本幸存者大回合已经打开过了');
      const cardId = state.discoveryDeck.shift();
      if (!cardId) throw new Error('发现牌堆已空');
      state.suitcaseAvailable = false;
      keepSuitcaseDiscovery(state, p.id, cardId);
      checkSurvivorWin(state);
      break;
    }
    // —— 杀手：打牌、走完牌上的路、切换阶段、结束回合 ——
    case 'playKillerCard': {
      const inEncounterAttack =
        state.phase === 'encounter' &&
        state.encounter?.step === 'attack' &&
        !state.encounter.attackChoiceMade;
      if (inEncounterAttack) {
        const enc = state.encounter;
        if (!enc) throw new Error('当前不在遭遇中');
        if (p.faction !== 'killer') throw new Error('仅杀手可执行');
        const idx = state.killerHand.indexOf(action.cardId);
        if (idx < 0) throw new Error('手牌中没有此卡');
        const card = state.cardById[action.cardId];
        const bonus = encounterCardAttackBonus(card);
        if (!card || bonus <= 0) throw new Error('遭遇中只能打出加攻牌');
        state.killerHand.splice(idx, 1);
        state.killerDiscard.push(action.cardId);
        state.encounterTailBonus = bonus;
        enc.attackBoost = true;
        enc.attackChoiceMade = true;
        enc.attackCardId = action.cardId;
        enc.step = 'defend';
        log(state, `${p.name} 打出「${card.name}」，本次攻击 +${bonus}。`);
        break;
      }
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      if (state.phase !== 'killerMain') throw new Error('当前无法打牌');
      if (hasPendingKillerChoice(state)) throw new Error('请先完成当前牌的选择');
      const idx = state.killerHand.indexOf(action.cardId);
      if (idx < 0) throw new Error('手牌中没有此卡');
      const card = state.cardById[action.cardId];
      if (!card) throw new Error('未知卡牌');

      const speed = effectiveCardSpeed(state, card);
      if (speed !== 'fast' && speed !== 'slow' && speed !== 'special') {
        throw new Error('行动牌必须标明速度');
      }
      if (speed === 'fast' && state.killerTurnStep !== 'fast') {
        throw new Error('快速牌只能在快速阶段打出');
      }
      if (speed === 'special') {
        if (state.killerTurnStep !== 'main') throw new Error('特殊牌请在快速阶段结束后打出');
        if (state.killerMainChoice === 'actions') throw new Error('已选择普通行动，不能再打特殊牌');
        if (state.killerMainChoice === 'special') throw new Error('本回合已打过特殊牌');
      }
      if (speed === 'slow') {
        if (state.killerTurnStep !== 'slow') throw new Error('慢速牌只能在慢速阶段打出');
      }

      const cost = cardHandCost(card);
      const payCardIds = [...new Set(action.payCardIds ?? [])];
      if (payCardIds.includes(action.cardId)) throw new Error('不能用正在打出的牌支付弃牌费用');
      if (payCardIds.length !== cost) {
        throw new Error(cost > 0 ? `打出此牌需同时弃置 ${cost} 张其他手牌` : '此牌不需要弃置其他手牌');
      }
      for (const id of payCardIds) {
        if (!state.killerHand.includes(id)) throw new Error('支付的手牌不在手里');
      }
      const blocked = killerCardBlockedReason(state, playerId, card);
      if (blocked) throw new Error(blocked);

      const takeFromHand = (id: string) => {
        const i = state.killerHand.indexOf(id);
        if (i < 0) throw new Error('手牌中没有此卡');
        state.killerHand.splice(i, 1);
      };
      for (const id of payCardIds) takeFromHand(id);
      takeFromHand(action.cardId);
      for (const id of payCardIds) state.killerDiscard.push(id);
      state.killerDiscard.push(action.cardId);
      const speedLabel = speed === 'fast' ? '快速' : speed === 'special' ? '特殊' : '慢速';
      const payNames = payCardIds.map((id) => state.cardById[id]?.name ?? id);
      log(
        state,
        payNames.length
          ? `${p.name} 打出${speedLabel}牌「${card.name}」，同时将「${payNames.join('、')}」放入弃牌堆。`
          : `${p.name} 打出${speedLabel}牌「${card.name}」。`,
      );

      if (speed === 'special') {
        state.killerMainChoice = 'special';
        state.killerMainActionsLeft = 0;
        p.actionsLeft = 0;
      }
      if (speed === 'slow') {
        state.killerUsedSlowThisTurn = true;
      }

      state.pendingCardSpeed = speed;
      state.blockadesThisAction = [];
      state.pendingSealQueue = [];
      state.sealAllRoomId = null;
      state.pendingBlockadePlace = null;
      if (/^spectre_whiz_/.test(action.cardId)) markWhizFollowup(state);
      state.pendingEffectQueue = [...card.effects];
      continueKillerQueue(state);
      if (hasPendingKillerChoice(state)) break;
      state.pendingCardSpeed = null;
      maybeStartEncounter(state);
      maybeFinishKillerMain(state);
      break;
    }
    case 'finishPendingMove': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      if (state.pendingPathDraft) {
        confirmPathDraft(state);
        const speed = state.pendingCardSpeed;
        if (!hasPendingKillerChoice(state)) {
          state.pendingCardSpeed = null;
          maybeStartEncounter(state);
          if (speed === 'special') maybeFinishKillerMain(state);
        }
        break;
      }
      finishPendingCardMove(state);
      break;
    }
    case 'advanceKillerStep': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      if (state.phase !== 'killerMain') throw new Error('当前不是杀手阶段');
      if (hasPendingKillerChoice(state)) throw new Error('请先完成当前牌的选择');
      if (state.killerTurnStep === 'fast') {
        state.killerTurnStep = 'main';
        state.killerMainChoice = null;
        log(state, '快速阶段结束。请二选一：执行 2 个普通行动，或打出 1 张特殊行动牌。');
        break;
      }
      if (state.killerTurnStep === 'main') {
        // 第三阶段必须行动：不能手动跳过。行动做完会自动进入慢速阶段。
        throw new Error('第三阶段必须完成行动，做完后自动进入慢速阶段');
      }
      throw new Error('慢速阶段请结束回合');
    }
    case 'chooseKillerMain': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      if (state.phase !== 'killerMain') throw new Error('当前不是杀手阶段');
      if (state.killerTurnStep !== 'main') throw new Error('请先结束快速阶段');
      if (state.killerMainChoice) throw new Error('已经选过本回合的主要行动方式');
      if (action.choice !== 'actions') throw new Error('无效选择');
      state.killerMainChoice = 'actions';
      state.killerMainActionsLeft = 2;
      p.actionsLeft = 2;
      log(state, '选择 2 个普通主要行动：每次可移动 1 或搜索房间。');
      break;
    }
    case 'endTurn': {
      assertActive(state, playerId);
      // 遭遇优先判断：单人热座下 playerId 会解析成当前幸存者，
      // 否则在遭遇里点「结束回合」会收到一句牛头不对马嘴的幸存者提示。
      if (state.phase === 'encounter') {
        throw new Error('遭遇中无法主动结束回合，按遭遇提示操作');
      }
      if (p.faction === 'survivor') {
        throw new Error('幸存者做完一般行动后小回合已结束，请用「幸存者所有操作已结束」进入发现');
      } else if (p.faction === 'killer') {
        if (hasPendingKillerChoice(state)) throw new Error('请先完成当前牌的选择');
        if (state.killerTurnStep === 'fast') {
          state.killerTurnStep = 'main';
          state.killerMainChoice = null;
          log(state, '快速阶段结束。请二选一：执行 2 个普通行动，或打出 1 张特殊行动牌。');
          break;
        }
        if (state.killerTurnStep === 'main') {
          assertKillerMainMayLeave(state);
          enterKillerSlow(state);
          break;
        }
        endKillerTurn(state);
      }
      break;
    }
    case 'discardKillerCard': {
      if (p.faction !== 'killer' && !(isSharedSurvivorMode(state) && state.killerId)) {
        throw new Error('仅杀手可弃牌');
      }
      const hand = state.killerHand;
      const idx = hand.indexOf(action.cardId);
      if (idx < 0) throw new Error('手牌中没有此卡');
      if (state.pendingKillerDiscards <= 0) throw new Error('当前不需要弃牌');
      if ((state.justUnlockedCards ?? []).includes(action.cardId)) {
        throw new Error('刚由进化入手的牌本次不能弃置，请弃另一张');
      }
      hand.splice(idx, 1);
      state.killerDiscard.push(action.cardId);
      state.pendingKillerDiscards -= 1;
      log(state, `杀手弃置「${state.cardById[action.cardId]?.name ?? action.cardId}」。`);
      if (state.pendingKillerDiscards === 0) {
        state.pendingUnlockDiscard = false;
        state.justUnlockedCards = [];
        if (state.phase === 'upkeep') maybeCloseKillerUpkeep(state);
      }
      break;
    }
    // —— 发现翻牌、确认噪音、遭遇攻防、感知颜色、护符 ——
    case 'chooseDiscovery': {
      if (state.pendingDiscoveryPick) throw new Error('请先选择翻牌的幸存者');
      if (state.mode === 'multi') {
        if (p.faction !== 'survivor') throw new Error('只有幸存者可选择发现牌');
        if (state.discoveryActorId && playerId !== state.discoveryActorId) {
          throw new Error('只能由被选中翻牌的幸存者选择');
        }
      } else {
        const allowed =
          socketId === state.hostId ||
          p.faction === 'survivor' ||
          (isSharedSurvivorMode(state) && isSurvivorOperator(state, socketId));
        if (!allowed) throw new Error('无权选择发现牌');
      }
      resolveDiscoveryChoice(state, action.cardId);
      break;
    }
    case 'acknowledgeDiscovery': {
      if (state.phase !== 'discovery') throw new Error('当前不是发现阶段');
      if (state.pendingDiscoveryPick) throw new Error('请先选择翻牌的幸存者');
      if (state.discoveryOptions.length > 0) throw new Error('请先选留一张发现牌');
      const allowed =
        state.mode === 'multi'
          ? p.faction === 'survivor'
          : socketId === state.hostId ||
            playerId === firstAliveSurvivorId(state) ||
            (isSharedSurvivorMode(state) && isSurvivorOperator(state, socketId));
      if (!allowed) throw new Error('无权确认发现');
      enterNoiseReport(state);
      break;
    }
    case 'acknowledgeNoise': {
      if (state.phase !== 'noiseReport') throw new Error('当前不是响声阶段');
      if (playerId !== state.killerId) throw new Error('仅杀手可执行');
      enterKillerMain(state);
      break;
    }
    case 'playEncounterAttack': {
      if (state.phase !== 'encounter' || !state.encounter) throw new Error('当前不在遭遇中');
      if (state.encounter.step !== 'attack') throw new Error('当前不是攻击步骤');
      if (playerId !== state.killerId) throw new Error('仅杀手可选择是否加攻击');
      const enc = state.encounter;
      if (enc.attackChoiceMade) throw new Error('这次攻击已经选过是否加攻');
      if (action.cardId) {
        const idx = state.killerHand.indexOf(action.cardId);
        if (idx < 0) throw new Error('手牌中没有此卡');
        const card = state.cardById[action.cardId];
        const bonus = encounterCardAttackBonus(card);
        if (!card || bonus <= 0) throw new Error('这张牌不能在遭遇中加攻');
        state.killerHand.splice(idx, 1);
        state.killerDiscard.push(action.cardId);
        state.encounterTailBonus = bonus;
        enc.attackBoost = true;
        enc.attackChoiceMade = true;
        enc.attackCardId = action.cardId;
        enc.step = 'defend';
        log(state, `${p.name} 打出「${card.name}」，本次攻击 +${bonus}。`);
        break;
      }
      enc.attackBoost = false;
      enc.attackChoiceMade = true;
      enc.attackCardId = null;
      state.encounterTailBonus = 0;
      enc.step = 'defend';
      log(state, '杀手不加攻击。');
      break;
    }
    case 'playEncounterDefense': {
      if (state.phase !== 'encounter' || !state.encounter) throw new Error('当前不在遭遇中');
      if (state.encounter.step !== 'defend') throw new Error('当前不是防御步骤');
      const enc = state.encounter;
      if (!enc.targetId || enc.targetId !== playerId) throw new Error('你不是本次遭遇对象');
      if (playerId in enc.defenses) throw new Error('已经选择过防御');
      const itemId = action.itemId ?? null;
      if (itemId && !canUseDefenseItem(p, itemId)) {
        throw new Error('无法使用该物品增强防御');
      }
      enc.defenses[playerId] = null;
      if (!enc.defenseItems) enc.defenseItems = {};
      enc.defenseItems[playerId] = itemId;
      log(state, itemId ? `${p.name} 使用「${itemName(itemId)}」加防。` : `${p.name} 不使用防御物品。`);
      rollEncounterDefense(state);
      break;
    }
    case 'rerollEncounterDice': {
      if (!state.pendingDice) throw new Error('现在没有待重掷的骰子');
      const who = state.players[state.pendingDice.playerId];
      if (!who) throw new Error('找不到掷骰的幸存者');
      if (!controlsPiece(state, socketId, who)) throw new Error('无权操作该幸存者');
      rerollEncounterDice(state, who, action.diceIndexes ?? []);
      break;
    }
    case 'resolveEncounterDice': {
      if (!state.pendingDice) throw new Error('现在没有待结算的骰子');
      const who = state.players[state.pendingDice.playerId];
      if (!who) throw new Error('找不到掷骰的幸存者');
      if (!controlsPiece(state, socketId, who)) throw new Error('无权操作该幸存者');
      resolvePendingEncounterDice(state);
      break;
    }
    case 'encounterFlee': {
      if (state.phase !== 'encounter' || !state.encounter) throw new Error('当前不在遭遇中');
      if (state.encounter.step !== 'flee') throw new Error('当前不是逃离步骤');
      const enc = state.encounter;
      if (enc.fleeQueue[0] !== playerId) throw new Error('还没轮到你逃离');
      if (action.moveToRoomId) {
        const ok = tryMove(state, playerId, action.moveToRoomId, 1, 1);
        if (!ok) throw new Error('移动不合法');
        log(state, `${p.name} 遭遇后移动到「${roomName(state, p.roomId)}」。`, 'survivor');
      } else {
        log(state, `${p.name} 选择不移动。`, 'survivor');
      }
      enc.fleeQueue.shift();
      if (enc.fleeQueue.length === 0) {
        clearTrapAfterEncounter(state, enc.roomId);
        state.encounter = null;
        log(state, '遭遇结束，杀手摸牌后结束回合。');
        endKillerTurn(state);
      }
      break;
    }
    case 'chooseSenseColor': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      if (!state.pendingSenseColor) throw new Error('当前不是选择感知颜色');
      state.pendingSenseColorPick = action.color;
      log(state, `已选${action.color === 'R' ? '红色' : action.color === 'B' ? '蓝色' : '绿色'}区域，请确认感知。`);
      break;
    }
    case 'confirmSense': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      if (state.pendingSenseColor) {
        if (!state.pendingSenseColorPick) throw new Error('请先选择颜色');
        resolveSenseColor(state, state.pendingSenseColorPick);
      } else if (state.pendingSensePair) {
        const a = state.pendingSensePair.firstRoomId;
        const b = state.pendingSensePair.secondRoomId;
        if (!a || !b) throw new Error('请先选好两个相连地点');
        senseRooms(state, [a, b]);
        state.pendingSensePair = null;
        continueKillerQueue(state);
      } else {
        throw new Error('当前没有待确认的感知');
      }
      if (!hasPendingKillerChoice(state)) {
        state.pendingCardSpeed = null;
        maybeStartEncounter(state);
        maybeFinishKillerMain(state);
      }
      break;
    }
    case 'finishSurvivorPhase': {
      if (p.faction !== 'survivor' && !(isSharedSurvivorMode(state) && isSurvivorOperator(state, socketId))) {
        throw new Error('仅幸存者可结束本阶段');
      }
      finishSurvivorPhase(state);
      break;
    }
    case 'setKillerRepairGuess': {
      if (p.faction !== 'killer') throw new Error('仅杀手可猜测修理进度');
      if (state.rescueArmed) throw new Error('警车已出动，修理进度已锁定');
      const n = Math.max(0, Math.min(state.rules.repairNeeded, Math.floor(action.value)));
      state.killerRepairGuess = n;
      break;
    }
    case 'rematchReady': {
      if (state.phase !== 'gameOver') throw new Error('对局尚未结束');
      if (!state.rematchReady.includes(socketId)) state.rematchReady.push(socketId);
      const seats = new Set(
        Object.values(state.players)
          .filter((pl) => pl.connected)
          .map((pl) => pl.controllerId),
      );
      log(state, `${p.controllerName || p.name} 已准备再来一局。`);
      if (seats.size > 0 && [...seats].every((id) => state.rematchReady.includes(id))) {
        restartMatch(state, content);
      }
      break;
    }
    case 'chooseLurkTarget': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      finishLurkPick(state, action.targetPlayerId);
      maybeStartEncounter(state);
      break;
    }
    case 'confirmAmulet': {
      if (!state.pendingAmulet || state.pendingAmulet.playerId !== playerId) {
        throw new Error('当前不是你选择护符');
      }
      confirmAmuletUse(state, action.use);
      if (!hasPendingKillerChoice(state)) {
        state.pendingCardSpeed = null;
        maybeStartEncounter(state);
        maybeFinishKillerMain(state);
      }
      break;
    }
    case 'pickEncounterTarget': {
      if (state.phase !== 'encounter' || !state.encounter) throw new Error('当前不在遭遇中');
      if (state.encounterOpenHold) throw new Error('开战效果还没结算完');
      if (state.encounter.step !== 'pick') throw new Error('当前不是选择遭遇对象');
      const enc = state.encounter;
      const target = state.players[action.targetPlayerId];
      if (!target?.alive || target.faction !== 'survivor' || target.roomId !== enc.roomId) {
        throw new Error('只能选择本次遭遇地点的幸存者');
      }
      if (target.id in enc.defenses) throw new Error('该幸存者已经在这次遭遇中受过伤害');
      enc.targetId = target.id;
      enc.defenseOptions = { ...enc.defenseOptions, [target.id]: [] };
      resetEncounterAttackChoice(state);
      enc.step = 'attack';
      log(state, `遭遇对象定为 ${target.name}。攻击前选择是否加攻。`);
      break;
    }
    case 'relocateBlockade': {
      assertActive(state, playerId);
      if (p.faction !== 'killer') throw new Error('仅杀手可执行');
      removeBoardBlockade(state, action.fromDoorId);
      resumeAfterKillerChoice(state);
      if (state.phase === 'upkeep') maybeCloseKillerUpkeep(state);
      break;
    }
    case 'removeBoardBlockade': {
      if (p.faction !== 'killer' && !(isSharedSurvivorMode(state) && state.killerId)) {
        throw new Error('仅杀手可移除场上封堵');
      }
      removeBoardBlockade(state, action.doorId);
      resumeAfterKillerChoice(state);
      if (state.phase === 'upkeep') maybeCloseKillerUpkeep(state);
      break;
    }
    case 'ackEvolution': {
      if (!state.pendingEvolutionAck) throw new Error('当前没有待确认的进化');
      const ack = state.pendingEvolutionAck;
      const kind = killerKindOf(state);
      const texts = kind
        ? EVOLUTION_TEXT[kind].slice(ack.fromLevel, ack.toLevel).map((t, i) => `${ack.fromLevel + i + 1} 级：${t}`)
        : [];
      log(state, `已确认进化效果：${texts.join('；') || `等级 ${ack.toLevel}`}。`);
      state.pendingEvolutionAck = null;
      maybeCloseKillerUpkeep(state);
      break;
    }
    case 'confirmWhizSearch': {
      const found = resolveWhizSearch(state, true, action.payCardIds ?? []);
      if (found) maybeStartEncounter(state);
      maybeFinishKillerMain(state);
      break;
    }
    case 'skipWhizSearch': {
      resolveWhizSearch(state, false, []);
      maybeFinishKillerMain(state);
      break;
    }
    case 'confirmOverFearWound': {
      resolveOverFearWound(state, true, action.payCardIds ?? []);
      if (state.phase === 'gameOver') break;
      maybeStartEncounter(state);
      maybeFinishKillerMain(state);
      break;
    }
    case 'skipOverFearWound': {
      resolveOverFearWound(state, false, []);
      maybeStartEncounter(state);
      maybeFinishKillerMain(state);
      break;
    }
    case 'confirmEvoBlockade': {
      confirmAnyDoor(state);
      resumeAfterKillerChoice(state);
      if (state.phase === 'upkeep') maybeCloseKillerUpkeep(state);
      break;
    }
    default:
      throw new Error('未知操作');
  }
  if (action.type !== 'tradeItem' && action.type !== 'respondTrade') {
    expirePendingTrade(state);
  }
  if (state.pendingCoopAction && state.phase !== 'survivorMain') {
    log(state, '待确认的幸存者行动已失效。');
    state.pendingCoopAction = null;
  }
}

/** 把服务器心里的完整棋子，裁成“这个观众能看的版本”（杀手看不到别人背包） */
function toPublicPlayer(
  state: GameState,
  p: PlayerState,
  viewerFaction: Faction | null,
  viewerPieceId: string,
): PublicPlayerView {
  const inEncounter =
    Boolean(state.encounter) && p.roomId != null && p.roomId === state.encounter?.roomId;
  const killerFog =
    viewerFaction === 'killer' &&
    (state.phase === 'survivorMain' || state.phase === 'discovery');
  const hideSurvivorPos =
    viewerFaction === 'killer' &&
    p.faction === 'survivor' &&
    !inEncounter &&
    (killerFog ||
      (!state.rules.killerSeesSurvivorPositions && !p.exposed));
  const hideKillerPos =
    (!state.rules.survivorSeesKillerPosition || p.stealth) &&
    viewerFaction === 'survivor' &&
    p.faction === 'killer' &&
    !inEncounter;

  let roomId = p.roomId;
  if (hideSurvivorPos && p.id !== viewerPieceId) roomId = null;
  if (hideKillerPos && p.id !== viewerPieceId) roomId = null;

  return {
    id: p.id,
    name: p.name,
    faction: p.faction,
    characterId: p.characterId,
    ready: p.ready,
    connected: p.connected,
    roomId,
    hp: p.hp,
    maxHp: p.maxHp,
    fear: p.fear,
    exposed: p.exposed,
    overFear: p.overFear,
    handCount: p.hand.length,
    items:
      viewerFaction === 'killer' && p.faction === 'survivor' ? {} : { ...p.items },
    inventorySlots: inventorySlotsFor(state, p.id),
    alive: p.alive,
    stealth: p.faction === 'killer' ? p.stealth : false,
    moveLeft: p.moveLeft,
    actionsLeft: p.faction === 'killer' ? state.killerMainActionsLeft : p.actionsLeft,
    mainActionUsed: p.mainActionUsed,
    actedThisRound: p.actedThisRound,
  };
}

/** 这个操控者现在应该以哪颗棋子的身份看界面 */
function resolveYouForController(state: GameState, controllerId: string): PlayerState | null {
  if (
    state.pendingEvolutionAck ||
    state.pendingOverFearWound ||
    state.pendingWhizSearch ||
    state.pendingBlockadeJob
  ) {
    const k = state.killerId ? state.players[state.killerId] : null;
    if (k && (k.controllerId === controllerId || (state.mode === 'solo' && controllerId === state.hostId))) {
      return k;
    }
  }
  if (state.pendingAmulet) {
    const ap = state.players[state.pendingAmulet.playerId];
    if (ap && ap.controllerId === controllerId) return ap;
    if (state.mode === 'solo' && controllerId === state.hostId && ap) return ap;
  }
  if (state.pendingItemDiscard) {
    const dp = state.players[state.pendingItemDiscard.playerId];
    if (dp && dp.controllerId === controllerId) return dp;
    if (state.mode === 'solo' && controllerId === state.hostId && dp) return dp;
  }
  if (state.phase === 'encounter' && state.encounter) {
    if (state.encounter.step === 'pick' || state.encounter.step === 'defend') {
      const tid =
        state.encounter.step === 'defend'
          ? state.encounter.targetId
          : remainingEncounterTargets(state).find((p) => p.controllerId === controllerId)?.id;
      if (tid && state.players[tid]?.controllerId === controllerId) return state.players[tid]!;
      if (state.mode === 'solo' && controllerId === state.hostId) {
        const sid =
          state.encounter.targetId ??
          remainingEncounterTargets(state)[0]?.id;
        if (sid && state.players[sid]) return state.players[sid]!;
      }
    }
  }
  if (state.players[controllerId]) return state.players[controllerId];

  const mine = Object.values(state.players).filter((p) => controlsPiece(state, controllerId, p));
  if (!mine.length) return null;

  if (
    isSharedSurvivorMode(state) &&
    state.phase === 'survivorMain' &&
    state.pendingSurvivorPick
  ) {
    const pick =
      mine.find((p) => p.faction === 'survivor' && p.alive && !p.actedThisRound) ??
      mine.find((p) => p.faction === 'survivor');
    if (pick) return pick;
  }
  if (state.phase === 'discovery' && state.pendingDiscoveryPick) {
    const pick = mine.find((p) => p.faction === 'survivor' && p.alive);
    if (pick) return pick;
  }
  const active = activePlayerId(state);
  if (active && controlsPiece(state, controllerId, state.players[active])) {
    return state.players[active]!;
  }
  return mine[0] ?? null;
}

/** 把牌编号翻译成“编号 + 中文名”，给牌堆检视用 */
function namedCards(state: GameState, ids: string[]): Array<{ id: string; name: string }> {
  return ids.map((id) => ({
    id,
    name: state.cardById[id]?.name ?? itemName(id),
  }));
}

function namedCardsSorted(state: GameState, ids: string[]): Array<{ id: string; name: string }> {
  return namedCards(state, ids).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function namedCardsNewestFirst(state: GameState, ids: string[]): Array<{ id: string; name: string }> {
  return namedCards(state, [...ids].reverse());
}

function namedTop(state: GameState, ids: string[]): { id: string; name: string } | null {
  const id = ids[0];
  if (!id) return null;
  return namedCards(state, [id])[0] ?? null;
}

/** 这个操控者现在能不能点行动按钮 */
function isControllerActive(state: GameState, controllerId: string): boolean {
  if (
    state.pendingEvolutionAck ||
    state.pendingOverFearWound ||
    state.pendingWhizSearch ||
    state.pendingBlockadeJob
  ) {
    const kid = state.killerId ? state.players[state.killerId] : null;
    return Boolean(
      kid &&
        (kid.controllerId === controllerId ||
          (state.mode === 'solo' && controllerId === state.hostId)),
    );
  }
  if (state.pendingAmulet) {
    const ap = state.players[state.pendingAmulet.playerId];
    return Boolean(
      ap &&
        (ap.controllerId === controllerId ||
          (state.mode === 'solo' && controllerId === state.hostId)),
    );
  }
  const activeId = activePlayerId(state);
  if (activeId && controlsPiece(state, controllerId, state.players[activeId])) return true;

  if (
    isSharedSurvivorMode(state) &&
    state.phase === 'survivorMain' &&
    state.pendingSurvivorPick
  ) {
    return Object.values(state.players).some(
      (pl) => controlsPiece(state, controllerId, pl) && pl.faction === 'survivor' && pl.alive,
    );
  }

  if (state.phase === 'encounter' && state.encounter?.step === 'pick') {
    return survivorsInRoom(state, state.encounter.roomId).some((pl) =>
      controlsPiece(state, controllerId, pl),
    ) || (state.mode === 'solo' && controllerId === state.hostId);
  }
  if (state.phase === 'encounter' && state.encounter?.step === 'defend') {
    return pendingDefenseSurvivorIds(state).some((id) =>
      controlsPiece(state, controllerId, state.players[id]),
    );
  }
  if (state.phase === 'discovery') {
    const isSurvivor = isSurvivorOperator(state, controllerId) ||
      Object.values(state.players).some(
        (p) => p.controllerId === controllerId && p.faction === 'survivor',
      );
    if (state.pendingDiscoveryPick) return isSurvivor || (state.mode === 'solo' && controllerId === state.hostId);
    if (state.mode === 'solo' && controllerId === state.hostId) return true;
    const sid = state.discoveryActorId ?? firstAliveSurvivorId(state);
    if (sid && controlsPiece(state, controllerId, state.players[sid])) return true;
  }
  return false;
}

/** 给某个人做一份局面快照：幸存者多看到修理和物品，杀手多看到手牌和潜行位置 */
export function buildSnapshot(state: GameState, controllerId: string): PublicSnapshot {
  const you = resolveYouForController(state, controllerId);
  if (!you) throw new Error('观察者不在对局中');

  const activeId = activePlayerId(state);
  const controllingActive = isControllerActive(state, controllerId);

  let legalMoves: string[] = [];
  if (controllingActive && activeId) {
    if (state.pendingPathDraft && state.phase === 'killerMain') {
      const last = state.pendingPathDraft.rooms[state.pendingPathDraft.rooms.length - 1];
      const adj = last ? roomsAdjacentKiller(state, last) : [];
      legalMoves = last ? [...new Set([...adj, last, ...state.pendingPathDraft.rooms])] : [];
    } else if (state.pendingSensePair && state.phase === 'killerMain') {
      const first = state.pendingSensePair.firstRoomId;
      const second = state.pendingSensePair.secondRoomId;
      if (second && first) {
        legalMoves = [first, second];
      } else if (first) {
        legalMoves = [...mapAdjacentRooms(state.map, first), first];
      } else {
        legalMoves = state.map.rooms.map((r) => r.id);
      }
    } else if (state.pendingBlockadeJob && state.pendingBlockadeJob.removeLeft > 0) {
      legalMoves = roomsForBlockadeRemove(state);
    } else if (state.pendingBlockadeJob?.kind === 'anyDoors') {
      legalMoves = roomsForAnyDoorPick(state);
    } else if (state.pendingBlockadePlace && state.phase === 'killerMain') {
      const rooms = new Set<string>();
      for (const id of removableBlockades(state)) {
        const pair = parseDoor(id);
        if (pair) {
          rooms.add(pair[0]);
          rooms.add(pair[1]);
        }
      }
      legalMoves = [...rooms];
    } else if (state.pendingBlockade && state.phase === 'killerMain') {
      legalMoves = legalBlockadeRooms(state, activeId);
    } else if (state.pendingMoveRange != null && (state.phase === 'killerMain' || state.phase === 'survivorMain')) {
      const actor = state.players[activeId]!;
      if (actor.faction === 'killer') {
        const adj = killerAdjacentRooms(state, activeId);
        const taken = Math.max(0, state.lastMovePath.length - 1);
        const min = state.pendingMoveMin ?? 0;
        legalMoves = actor.roomId && taken >= min ? [...adj, actor.roomId] : adj;
      } else {
        legalMoves = legalMoveRooms(state, activeId, state.pendingMoveRange, state.pendingMoveMin ?? 0);
      }
    } else if (state.phase === 'survivorMain' || state.phase === 'killerMain') {
      const actor = state.players[activeId]!;
      let range = 0;
      if (actor.faction === 'survivor' && !actor.mainActionUsed) {
        range = actor.moveLeft;
      } else if (actor.faction === 'killer' && state.killerMainActionsLeft > 0) {
        range = state.rules.killerMoveRange + actor.moveBonus;
      }
      if (range > 0) legalMoves = legalMoveRooms(state, activeId, range);
    } else if (
      state.phase === 'encounter' &&
      state.encounter?.step === 'flee' &&
      activeId === state.encounter.fleeQueue[0]
    ) {
      // minRange=1：原地要靠「留在原地」按钮单独表达，不把当前格算成可点的落点
      legalMoves = legalMoveRooms(state, activeId, 1, 1);
    }
  }

  const viewPieceRaw =
    state.mode === 'multi'
      ? you
      : controllingActive && activeId
        ? state.players[activeId]!
        : you;
  /** 杀手回合里幸存者装备溢出：仍以杀手座位看雾与手牌，弃装数据走 pendingItemDiscard */
  let viewPiece = viewPieceRaw;
  if (state.pendingItemDiscard) {
    const keepKiller =
      (state.phase === 'killerMain' ||
        state.phase === 'upkeep' ||
        state.phase === 'noiseReport' ||
        (state.phase === 'encounter' &&
          (state.encounter?.step === 'attack' || state.encounterOpenHold))) &&
      state.killerId
        ? state.players[state.killerId]
        : null;
    if (
      keepKiller &&
      (keepKiller.controllerId === controllerId ||
        (state.mode === 'solo' && controllerId === state.hostId))
    ) {
      viewPiece = keepKiller;
    }
  }
  const viewerFaction = viewPiece.faction;

  const publicYou: PublicSnapshot['you'] = {
    ...toPublicPlayer(state, viewPiece, viewerFaction, viewPiece.id),
    roomId: viewPiece.roomId,
    hand: [...viewPiece.hand],
    skillUsedThisTurn: [...viewPiece.skillUsedThisTurn],
  };

  const showKillerHand =
    viewPiece.faction === 'killer' ||
    (state.mode === 'solo' &&
      (state.phase === 'killerMain' ||
        state.phase === 'upkeep' ||
        state.phase === 'noiseReport' ||
        Boolean(state.pendingOverFearWound || state.pendingWhizSearch || state.pendingEvolutionAck) ||
        (state.phase === 'encounter' && state.encounter?.step === 'attack')));

  const killerFogPhase = viewerFaction === 'killer' && (state.phase === 'survivorMain' || state.phase === 'discovery');
  const killerNoisePhase = viewerFaction === 'killer' && state.phase === 'noiseReport';
  const noiseRevealPhase =
    state.phase === 'noiseReport' ||
    state.phase === 'killerMain' ||
    state.phase === 'encounter' ||
    state.phase === 'upkeep' ||
    state.phase === 'gameOver';
  const visibleNoises = killerFogPhase || !noiseRevealPhase ? [] : [...state.noises];
  const visibleFirecrackerRoom =
    state.firecrackerThisRound && noiseRevealPhase && !killerFogPhase ? state.firecrackerRoomId : null;
  const visibleKeys =
    viewerFaction === 'killer' ? state.killerPublicKeys : state.keysCollected;
  const visibleRepair =
    viewerFaction === 'killer' ? state.killerRepairGuess : state.repairProgress;
  /**
   * 战报历史任何时候都在。杀手在幸存者大回合里只能看到「共通信息」那几条
   * （响声 / 消除恐惧 / 治疗 / 钥匙 / 修理完成 / 封堵变动 / 阶段胜负 / 骰点 / 遭遇），
   * 看不到幸存者的完整流程（搜索到什么、谁走到哪、用了什么、发现翻牌）。
   * 幸存者侧本来就只看得到杀手的公开行动，潜行移动的日志是 vis='killer'。
   */
  let visibleLogs = (
    viewerFaction === 'killer'
      ? state.logs.filter((l) => l.vis !== 'survivor' || (l.needsCommon && killerFogPhase))
      : state.logs.filter((l) => l.vis !== 'killer')
  ).slice(-80);
  if (killerNoisePhase) {
    const noiseLines = state.firecrackerThisRound
      ? ['爆竹：所有地点发出响声。']
      : state.noises.length
        ? [`发出响声的位置：${state.noises.map((id) => roomName(state, id)).join('、')}。`]
        : ['没有地点发出响声。'];
    visibleLogs = [
      ...visibleLogs,
      ...noiseLines.map((text) => ({ t: Date.now(), text, vis: 'all' as const })),
    ];
  }

  /**
   * 幸存者大回合（含发现）期间，杀手不许知道内部进度：
   * 现在轮到谁、谁要翻发现牌、三个人是不是都行动完了 —— 一律抹掉。
   * 幸存者自己看到的 activePlayerId 不受影响（这条只作用于杀手视角）。
   */
  const activeIdForViewer = killerFogPhase ? null : activeId;
  const killerPiece = state.killerId ? state.players[state.killerId] : undefined;
  const killerOwner = killerPiece
    ? state.characters.find((c) => c.id === killerPiece.characterId)
    : null;
  /** 早期演示牌，不是当前这名杀手的行动牌 */
  const junkKillerInfoNames = new Set(['疾冲', '潜伏', '封堵', '猎杀', '巡逻', '重击', '挥砍']);
  const allKillerCards = Object.values(state.cardById)
    .filter((c) => {
      if (c.type !== 'killerAction') return false;
      if (!c.owner) return false;
      if (junkKillerInfoNames.has(c.name)) return false;
      return c.owner === killerPiece?.characterId || c.owner === killerOwner?.id || c.owner === killerOwner?.name;
    })
    .map((c) => ({ id: c.id, name: c.name, locked: Boolean(c.locked) }));

  return {
    roomCode: state.roomCode,
    hostId: state.hostId,
    mode: state.mode,
    soloKillerCharacterId: state.soloKillerCharacterId,
    soloSurvivorCharacterIds: [...state.soloSurvivorCharacterIds],
    phase: state.phase,
    round: state.round,
    isHost: controllerId === state.hostId,
    you: publicYou,
    controllingActive,
    players: Object.values(state.players).map((p) =>
      toPublicPlayer(state, p, viewerFaction, viewPiece.id),
    ),
    map: state.map,
    /** 大厅换地图用：只列有底图的（没有底图的地图选进来会开不了局） */
    playableMaps: state.maps
      .filter((m) => m.backgrounds?.survivor || m.backgrounds?.killer)
      .map((m) => ({ id: m.id, name: m.name, backgrounds: m.backgrounds })),
    rules: state.rules,
    characters: state.characters,
    noises: visibleNoises,
    keysCollected: visibleKeys,
    repairProgress: visibleRepair,
    rescueCountdown: state.rescueCountdown,
    rescueArmed: state.rescueArmed,
    blockades: state.blockades.map((id) => canonicalDoorId(id)),
    killerPower: state.killerPower,
    killerTurnPowerBonus: state.killerTurnPowerBonus,
    killerPowerLabel: formatKillerPowerLabel(state),
    evolutionEffects: activeEvolutionLines(state),
    pendingEvolutionAck: state.pendingEvolutionAck ? { ...state.pendingEvolutionAck } : null,
    pendingWhizSearch: state.pendingWhizSearch,
    pendingOverFearWound: state.pendingOverFearWound ? { ...state.pendingOverFearWound } : null,
    pendingBlockadeJob: state.pendingBlockadeJob ? { ...state.pendingBlockadeJob } : null,
    removableBoardBlockades: removableForJob(state).map((id) => {
      const pair = parseDoor(id);
      return { id, from: pair?.[0] ?? id, to: pair?.[1] ?? id };
    }),
    encounterOpenHold: state.encounterOpenHold,
    killerLevel: state.killerLevel,
    pendingKillerDiscards: state.pendingKillerDiscards,
    /** 刚由进化入手、本次超员弃牌里不能弃的牌 */
    justUnlockedCards: [...(state.justUnlockedCards ?? [])],
    pendingBlockade: state.pendingBlockade,
    pendingBlockadePlace: state.pendingBlockadePlace,
    relocatableBlockades: removableBlockades(state).map((id) => {
      const pair = parseDoor(id);
      return { id, from: pair?.[0] ?? id, to: pair?.[1] ?? id };
    }),
    pendingSensePair: state.pendingSensePair
      ? {
          firstRoomId: state.pendingSensePair.firstRoomId,
          secondRoomId: state.pendingSensePair.secondRoomId,
        }
      : null,
    pendingSenseColor: state.pendingSenseColor,
    pendingSenseColorPick: state.pendingSenseColorPick,
    pendingPathDraft: state.pendingPathDraft ? { ...state.pendingPathDraft, rooms: [...state.pendingPathDraft.rooms] } : null,
    killerRepairGuess: state.killerRepairGuess,
    rematchReady: [...new Set(
      state.rematchReady.map((id) => {
        const pl = Object.values(state.players).find((p) => p.controllerId === id);
        return pl?.controllerName || pl?.name || id;
      }),
    )],
    replacementDeck: state.replacementDeck,
    pendingDice: state.pendingDice ? { ...state.pendingDice, values: [...state.pendingDice.values] } : null,
    youRematchReady: state.rematchReady.includes(controllerId),
    allKillerCards,
    survivorActionsDone:
      !killerFogPhase &&
      state.phase === 'survivorMain' &&
      unactedAliveSurvivorIds(state).length === 0,
    senseHighlight: state.senseHighlight,
    pendingMoveRange: state.pendingMoveRange,
    pendingMoveMin: state.pendingMoveMin,
    pendingMoveTaken:
      state.pendingMoveRange != null ? Math.max(0, state.lastMovePath.length - 1) : 0,
    pendingLurkPick: state.pendingLurkPick,
    pendingAmulet: state.pendingAmulet ? { ...state.pendingAmulet } : null,
    repairedThisPhase: state.repairedThisPhase,
    firecrackerThisRound: state.firecrackerThisRound,
    firecrackerRoomId: visibleFirecrackerRoom,
    suitcaseAvailable: state.suitcaseAvailable,
    highlightRoomIds: state.senseHighlight ? colorPrefixRooms(state, state.senseHighlight) : [],
    encounterTailBonus: state.encounterTailBonus,
    yourDiscardPile: (viewerFaction === 'killer'
      ? namedCardsNewestFirst(state, state.killerDiscard)
      : namedCardsNewestFirst(state, state.survivorDiscard)
    ),
    pendingSurvivorPick: killerFogPhase ? false : state.pendingSurvivorPick,
    pendingDiscoveryPick: killerFogPhase ? false : state.pendingDiscoveryPick,
    discoveryActorId: killerFogPhase ? null : state.discoveryActorId,
    pileCounts: {
      search: state.searchDeck.length,
      discovery: state.discoveryDeck.length,
      treasure: 0,
      discard: state.survivorDiscard.length,
      killerDraw: state.killerDeck.length,
      killerDiscard: state.killerDiscard.length,
    },
    pileCards: {
      search: viewerFaction === 'survivor' ? namedCardsSorted(state, state.searchDeck) : [],
      discovery: viewerFaction === 'survivor' ? namedCardsSorted(state, state.discoveryDeck) : [],
      treasure: [],
      discard: namedCardsNewestFirst(state, state.survivorDiscard),
      killerDraw: viewerFaction === 'killer' ? namedCardsSorted(state, state.killerDeck) : [],
      killerDiscard: viewerFaction === 'killer' ? namedCardsNewestFirst(state, state.killerDiscard) : [],
    },
    pileTops: {
      search: viewerFaction === 'survivor' ? namedTop(state, state.searchDeck) : null,
      discovery: viewerFaction === 'survivor' ? namedTop(state, state.discoveryDeck) : null,
      treasure: null,
      discard: namedTop(state, [...state.survivorDiscard].reverse()),
      killerDraw: viewerFaction === 'killer' ? namedTop(state, state.killerDeck) : null,
      killerDiscard: viewerFaction === 'killer' ? namedTop(state, [...state.killerDiscard].reverse()) : null,
    },
    pendingItemDiscard: state.pendingItemDiscard
      ? (() => {
          const dp = state.players[state.pendingItemDiscard!.playerId];
          const canSeeItems = Boolean(
            dp &&
              (dp.controllerId === controllerId ||
                (state.mode === 'solo' && controllerId === state.hostId)),
          );
          return {
            playerId: state.pendingItemDiscard!.playerId,
            count: state.pendingItemDiscard!.count,
            name: dp?.name,
            inventorySlots: dp ? inventorySlotsFor(state, dp.id) : undefined,
            items: canSeeItems && dp ? { ...dp.items } : undefined,
          };
        })()
      : null,
    pendingTrade: state.pendingTrade
      ? (() => {
          const offer = state.pendingTrade!;
          const from = state.players[offer.fromPlayerId];
          const to = state.players[offer.targetPlayerId];
          return {
            fromPlayerId: offer.fromPlayerId,
            fromName: from?.name ?? '幸存者',
            targetPlayerId: offer.targetPlayerId,
            targetName: to?.name ?? '幸存者',
            itemId: offer.itemId,
            itemName: itemName(offer.itemId),
            amount: offer.amount,
            receiveItemId: offer.receiveItemId,
            receiveItemName: offer.receiveItemId ? itemName(offer.receiveItemId) : undefined,
          };
        })()
      : null,
    pendingCoopAction: state.pendingCoopAction
      ? {
          fromControllerId: state.pendingCoopAction.fromControllerId,
          fromName: state.pendingCoopAction.fromName,
          actorPlayerId: state.pendingCoopAction.actorPlayerId,
          actorName: state.pendingCoopAction.actorName,
          summary: state.pendingCoopAction.summary,
          youAreProposer: state.pendingCoopAction.fromControllerId === controllerId,
          youMustConfirm:
            isSurvivorOperator(state, controllerId) &&
            state.pendingCoopAction.fromControllerId !== controllerId,
        }
      : null,
    killerMainActionsLeft: state.killerMainActionsLeft,
    killerUsedSlowThisTurn: state.killerUsedSlowThisTurn,
    killerTurnStep: state.killerTurnStep,
    killerMainChoice: state.killerMainChoice,
    lastDiscoveryCardId: state.lastDiscoveryCardId,
    discoveryOptions: [...state.discoveryOptions],
    lastDiceRoll: state.lastDiceRoll ? { ...state.lastDiceRoll, values: [...state.lastDiceRoll.values] } : null,
    encounter: state.encounter
      ? {
          ...state.encounter,
          defenses: { ...state.encounter.defenses },
          defenseItems: { ...(state.encounter.defenseItems ?? {}) },
          defenseOptions: Object.fromEntries(
            Object.entries(state.encounter.defenseOptions).map(([k, v]) => [k, [...v]]),
          ),
          attackOptions: [...state.encounter.attackOptions],
          fleeQueue: [...state.encounter.fleeQueue],
        }
      : null,
    killerHandCount: state.killerHand.length,
    killerDeckCount: state.killerDeck.length,
    yourKillerHand: showKillerHand ? [...state.killerHand] : null,
    yourKillerLocked: showKillerHand ? [...state.killerLocked] : null,
    winner: state.winner,
    winReason: state.winReason,
    logs: visibleLogs,
    activePlayerId: activeIdForViewer,
    legalMoves,
    cardById: state.cardById,
    trapRoomIds: viewerFaction === 'survivor' ? [...state.trapRoomIds] : [],
    /**
     * 潜行起点（幸存者用来判断「杀手是不是可能在我这格」）。
     * 这是幸存者侧情报：杀手自己拿到没用，旁观/观战也不该顺着它找杀手。
     */
    stealthOriginRoomId:
      viewerFaction === 'survivor'
        ? (Object.values(state.players).find((pl) => pl.faction === 'killer' && pl.stealth)
            ?.stealthOriginRoomId ?? null)
        : null,
    turnOrder: [...state.turnOrder],
  };
}

/** 这桌上还连着网的操控者名单 */
export function listControllerIds(state: GameState): string[] {
  const set = new Set<string>();
  for (const p of Object.values(state.players)) {
    if (p.connected) set.add(p.controllerId);
  }
  return [...set];
}

export type { Phase };
