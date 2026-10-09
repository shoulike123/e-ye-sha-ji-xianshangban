/**
 * 游戏引擎：大厅、大小回合、遭遇、发现/响声、结算的唯一权威。
 *
 * 类型已补全（本文件曾因是从构建产物反推恢复而临时关掉类型检查，现已全部标注）。
 * 现在 `npx tsc -p server/tsconfig.json` 对本文件零错误。
 */
import {
  addKeys,
  addRepairProgress,
  announceRepairIfJustFinished,
  applyDamage,
  applyDefenseItem,
  applyHeal,
  applyPassiveBonuses,
  assertHealSameRoom,
  buildSearchDeck,
  canSearchRoom,
  canUseDefenseItem,
  canonicalDoorId,
  cardBecomesPossession,
  cardHandCost,
  checkSplitEnd,
  checkSplitEscapes,
  checkSurvivorWin,
  clearTrapAfterEncounter,
  discardConsumedItem,
  discardFromKillerDeck,
  discardUniqueCard,
  doRepair,
  doorId,
  doSearch,
  doorsAt,
  drawDiscoveryCard,
  drawKillerCards,
  drawSearchCard,
  enforceInventory,
  /** 【变体3】"某条计划能力现在生效吗"（修理不响 / 额外修理标记 / 燃燒瓶） */
  planImplActive,
  /** 【变体3】把"某条计划能力生效吗"注入给 effects（修理不响 / 额外修理标记） */
  setPlanImplChecker,
  generalAdjacentRooms,
  georgeDefenseNoteBonus,
  georgeInPlay,
  georgeNoteDefs,
  hasTenacity,
  healItemDef,
  healableAlliesHere,
  injuredAlliesHere,
  inventorySlotsFor,
  isBookRoom,
  isDoorEdge,
  isDoorBlocked,
  addFear,
  addKillerTurnPower,
  isEngineeringExpert,
  isGeorge,
  isKeyCard,
  itemCount,
  itemName,
  killerAdjacentRooms,
  killerCardBlockedReason,
  killerCardCostAfterDiscount,
  killerInRoom,
  legalBlockadeRooms,
  legalMoveRooms,
  log,
  logSplit,
  mapAdjacentRooms,
  maybeArmRescue,
  moveAdjacentRooms,
  netLockedRoom,
  parseDoor,
  passageNeighborsFor,
  personalItemBlockReason,
  placeBlockade,
  pushNoise,
  removableBlockades,
  removeBlockade,
  resolveSixthSense,
  roomName,
  runEffects,
  usableDefenseItemIds,
  withinKillerDistance,
  defenseItemHint,
  senseRooms,
  noteSingleRoomSense,
  setOnSurvivorDownHandler,
  setOnSurvivorDamagedHandler,
  setOverFearHandler,
  setSurvivorEnterRoomHandler,
  setLeverGateChecker,
  setRoomGoneChecker,
  setGuardStoneChecker,
  setSlyTrickChecker,
  blockedDoorsAt,
  setStealth,
  setUpgradeHandler,
  resumeDeferredDeckRecycle,
  pathRooms,
  shuffle,
  setKillerInfo,
  splitEscapeKeysNeeded,
  survivorDiscardHasItem,
  survivorActionVis,
  isSurvivorPrivatePhase,
  survivorsInRoom,
  takeEarliestFromSurvivorDiscard,
  takeItem,
  tryMove,
  trySecretPassage,
  unblockedDoorsAt,
  walkSurvivorPath,
} from './effects.js';
import {
  TRAP_LABEL,
  allTrapsPlaced,  confirmTrapPlacement,
  isHuntressKiller,
  isWerewolfKiller,
  placeHunterTrap,
  regularTrapRooms,
  resetTrapPlacement,
  settleNetTrapsOnNewRound,
  setupHunterTraps,
  trapRemaining,
} from './hunterTraps.js';
import { openChest, setupTreasure } from './treasure.js';
/** 地图特殊规则（实验室 / 城堡 / 墓穴）集中在这个模块 */
import {
  LEVER_GATE_COST,
  LEVER_ROOM,
  canUseFirstAidKitAt,
  firstAidKitRoomId,
  isLeverGate,
  leverGateDoor,
  onSurvivorEnterRoom,
  placeLeverGate,
  setupMapSpecials,
  useFirstAidKit,
} from './mapEffects.js';
import {
  addPlanMarker,
  applyPlanAbility,
  beginPlanSwitch,
  canPickPlan,
  checkPlanProgress,
  onPlanRoundStart,
  planAbilityBlockReason,
  planDefaults,
  planHasImpl,
  planMarkersAt,
  planSwitchProgress,
  planViewFor,
  planVoters,
  setPlanAbilityEffectHandler,
  setupPlanCards,
  votePlanSwitch,
} from './plans.js';
import {
  RELIC_ROOM,
  beginCollapse,
  canDrawRelic,
  collapseMoveOptions,
  collapseMoverFor,
  drawRelic,
  hasRelicRoom,
  interceptEvolutionForCollapse,
  isRoomGone,
  onSurvivorRoundStart as onCryptSurvivorRoundStart,
  resolveCollapseMove,
  resolveRelicCard,
  setCollapseDoneHandler,
  setupRelicRoom,
} from './collapse.js';
import {
  canUseInsight,
  canUseMirror,
  consumeInsight,
  hasGuardStone,
  hasRelic,
  mirrorTargets,
  relicKindOf,
  shieldDefenseBonus,
  useMirror,
} from './relic.js';
import {
  acidSpray,
  addPowerUntilNextTurn,
  applyCarryPower,
  applyEvolutionCard,
  applySonarReveal,
  chooseAutoMovePath,
  clearPowerUntilNextTurn,
  confirmSenseRoom,
  continueBlockadeRequest,
  coreRooms,
  isStranglerKiller,
  placeCoreAt,
  removeCoreAt,
  beginRemoveFromDiscardPermanent,
  removeFromDiscardPermanent,
  requestBlockadeAt,
  resolveCoreOverflow,
  resolveMoveCore,
  resolveTrackerDistance,
  beginSlimeGlandPick,
  setupCoreMarkers,
} from './killerSpecials.js';
import { isQueenKiller, zombiesIn, zombieCount, moveZombie, removeZombie, hordeMove, hordeStepRooms, sacrificeZombieForPoison, poisonSurvivor, crossbowTargets, spawnZombieAt, clearPoisonOnDeath, zombiePower, spawnZombieAtQueen, clearPoisonOnHeal, } from './zombies.js';
import {
  EVOLUTION_TEXT,
  activeEvolutionLines,
  advanceEvolutionChoices,
  afterOneDoorPlaced,
  applyEncounterOpenEffects,
  applyMurdererRevealPower,
  confirmAnyDoor,
  doorLabel,
  effectiveKillerPower,
  emptyEvolutionFields,
  evolutionLevelJump,
  formatKillerPowerLabel,
  huntressCostDiscount,
  huntressTrackerFollowupMove,
  killerKindOf,
  markWhizFollowup,
  pickAnyDoorRoom,
  queueOverFearWound,
  removableForJob,
  removeBoardBlockade,
  resolveDeferredEvolution,
  resolveOverFearWound,
  resolveWhizSearch,
  hasEvolutionChoicePending,
  roomsForAnyDoorPick,
  roomsForBlockadeRemove,
  runUpgrade,
  setAfterLevelSettledHandler,
  startAnyDoorsBlockade,
  setEncounterOpenNoTargetsHandler,
  setEvolutionCollapseGate,
  setKillerMirrorHandlers,
  startPendingEvoFourIfNeeded,
} from './evolution.js';
/** 恐詭管道的落点选择（以前是死代码，没有任何 action 调它） */
import { confirmStealthToPassage, resolveStealthToPassage } from './killerSpecials.js';
import {
  KILLER_TRAIT_PAY,
  KILLER_TRAIT_PLAN,
  TRAIT_DIFFICULTY_LABEL,
  beginTraitDraft,
  hasTrait,
  hasTraitForKiller,
  killerHasTrait,
  markTraitUsed,
  pickTraits,
  setKillerScopeHandler,
  setTraitDraftDoneHandler,
  setTraitSetupHandler,
  setupTraitsOf,
  traitAvailable,
  traitAvailableForKiller,
  traitDef,
} from './traits.js';
setOverFearHandler(queueOverFearWound);
/** 2对3：进化要在两个杀手之间切镜像，把这三个函数注入给 evolution.ts（避免模块成环） */
setKillerMirrorHandlers({
    switchTo: (s, id) => switchActiveKiller(s, id),
    save: (s) => syncActiveKiller(s),
    load: (s, id) => loadKillerToMirror(s, id),
});
/**
 * 地图特殊规则注入给 `effects.ts`（它不能反向 import 本模块 / mapEffects，会成环）：
 *  - 幸存者**因移动进入某地点**时回调（实验室 R4 响声 / 城堡 B4 首次惊吓）
 *  - 「这扇门是不是机关大门」（城堡 R1 的控制杆）
 */
setSurvivorEnterRoomHandler((s, p, roomId) => onSurvivorEnterRoom(s, p, roomId));
setLeverGateChecker((s, door) => isLeverGate(s, door));
/** 「这个地点是不是已经塌了」（墓穴坍塌）—— 寻路里统一当作"不存在" */
setRoomGoneChecker((s, roomId) => isRoomGone(s, roomId));
/**
 * 「这名幸存者有没有守護之石」（墓穴遗物）——
 * `effects.applyDamage` 用它决定"遭遇中的直接伤害也能不能问一句免伤"。
 */
setGuardStoneChecker((p) => hasGuardStone(p));

/**
 * 这条移动路径会不会经过**机关大门**？返回那扇门的门号（不经过就 null）。
 *
 * 杀手走的是"封堵不挡路"的邻接（`pathRooms(..., true, true)`），
 * 和 `tryMove` 里杀手分支用的参数保持一致，否则判定和实际走的路径会不一致。
 */
function leverGateOnPath(state: GameState, p: PlayerState, toRoomId: string): string | null {
    const gate = leverGateDoor(state);
    if (!gate || !p.roomId || p.roomId === toRoomId) return null;
    const path = pathRooms(state, p.roomId, toRoomId, true, true);
    if (!path || path.length < 2) return null;
    for (let i = 1; i < path.length; i += 1) {
        if (doorId(path[i - 1]!, path[i]!) === gate) return gate;
    }
    return null;
}

/**
 * 某个杀手棋子**实际轮到谁**。
 *
 * 雕像杀手会把自己拆成 4 个雕像棋子，状态挂在主雕像（`statueIds[0]`）名下，
 * 原始棋子 `xxx__killer` / 玩家座位棋子就不再持有状态了。
 * 所以"轮到某个杀手"时要换成他实际的那个棋子。
 */
export function killerTurnPieceId(state: GameState, killerPieceId: string): string {
    if (isStatueKiller(state, killerPieceId)) {
        const main = state.statueIds?.[0];
        if (main) return main;
    }
    return killerPieceId;
}

/**
 * 本局**参与行动的杀手棋子**（去重，且雕像只算一个）。
 *
 * ⚠ 不能直接把所有 `faction === 'killer'` 的棋子都算进来 ——
 * 雕像的 4 个棋子是同一个杀手的 4 个位置，`killers` 里它们共享同一份切片，
 * 若都算进 `killerIds`，进化会被重复结算 4 次。
 */
export function killerTurnPieceIds(state: GameState): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const pl of Object.values(state.players)) {
        if (pl.faction !== 'killer') continue;
        const id = killerTurnPieceId(state, pl.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out.sort();
}

/**
 * 幸存者倒下时的统一入口。
 *
 * ⚠ 这里**必须注册 `onSurvivorDown`（本文件的包装函数）而不是直接注册
 * `clearPoisonOnDeath`** —— 那个包装里除了清中毒标记，还有
 * 【分头行动】的"杀手每杀一人升一级 / 全员出局才结束"。
 * （注册成 `clearPoisonOnDeath` 会让那两条规则**静默失效**。）
 */
setOnSurvivorDownHandler(onSurvivorDown);
/**
 * **升级的统一入口**（engine 内部一律用它，别直接调 `runUpgrade`）。
 *
 * **【墓穴】坍塌排在"确认进化效果"之后**（用户口径）：
 * 「先确认进化效果 → 再执行双方坍塌结算 → 再执行特性卡里与进化有关的特性
 *   → 再执行进化效果」。
 *
 * 所以这里**不当场坍塌**：`runUpgrade` 第一次被拦下时只记
 * `pendingCollapseAfterEvolution`（等级**没涨**、确认面板**也没挂**），
 * 必须**补跑一次**才会挂出「确认新效果」；坍塌本身等玩家确认时才发生
 * （`ackEvolution`）。
 *
 * ⚠ 以前只有"摸牌堆空了"那条路走这个补跑，`startRound`（特性 14 的开局升级）
 * 和 `onSurvivorDown`（分头行动死人升级）都是**直接调 `runUpgrade`** ——
 * 于是墓穴地图上这两条升级会停在"只记了标记"：等级不涨、面板不挂、整局卡住
 * （`evolution-trait14-2v3.mjs` 的墓穴那一节抓到的）。
 */
function upgradeKillerWithCollapse(s: GameState): void {
    runUpgrade(s);
    if (!s.pendingCollapseAfterEvolution) return;
    /**
     * ⚠ 关键：**同一级进化只塌一次**。
     *
     * `runUpgrade` 被拦下时等级还没涨（`beforeLv` 还是 1），
     * 所以再调一次它时 gate 会**又**看到"1 → 2 要升级"，
     * 不加这个标记就会无限循环着塌下去（第一次开发时就是这个现象：
     * 等级卡在 1，`pendingCollapse` 一直挂着）。
     */
    s.collapseConsumedForLevel = s.pendingCollapseLevel;
    runUpgrade(s);
    s.collapseConsumedForLevel = 0;
    /** 到这里 `pendingEvolutionAck` 已经挂好，等玩家点「确认新效果」→ 那时才坍塌 */
}
setUpgradeHandler((s) => upgradeKillerWithCollapse(s));
/**
 * 【变体1】特性 03「狡猾诡计」的查询注入给 `effects.ts`
 * （那边不能 import traits.ts，会成环）。
 */
setSlyTrickChecker((s) => Boolean(s.variant1 && s.killerId && hasTrait(s, s.killerId, 'trait_k03')));
setEvolutionCollapseGate((s, fromLv, toLv) => interceptEvolutionForCollapse(s, fromLv, toLv));
import { completeKillerCardMove, confirmPathDraft, finishKillerCardMove, confirmAmuletUse, continueKillerQueue, effectiveCardSpeed, finishLurkPick, forcedRevealAndSearch, encounterCardAttackBonus, canPlayAsEncounterAttack, runAttackTimingExtras, runOptionalEffect, hasPendingKillerChoice, resolveSenseColor, colorPrefixRooms, flushDeferredPlayedCard, queenSenseFear, setMoveSurvivorDoneHandler, setSearchFoundHandler, interruptCurrentCardEffects, pickStatueStepAction, fearAtRange, attackCardConditionBlockReason, cardRequirementBlockReason, } from './killerCards.js';
/**
 * 君臨天下「目击者移动」结算完的收尾。
 * 放在这里是因为 killerCards 不能 import engine（成环），只能反向注入。
 */
setMoveSurvivorDoneHandler((state) => {
    if (hasPendingKillerChoice(state))
        return;
    flushDeferredPlayedCard(state);
    state.pendingCardSpeed = null;
    maybeStartEncounter(state);
    maybeFinishKillerMain(state);
});
/**
 * **追蹤「先搜索、命中就立刻开遭遇」**的回调。
 *
 * 牌面是「〔搜索〕。展示一名幸存者与你之间的距离。」—— 顺序是先搜后展示。
 * 搜索命中人时，这场遭遇就是这张牌的结果，**"展示距离"整条跳过**
 * （用户明确要求：「如果搜索到人发生遭遇了，展示距离就跳过了」）。
 *
 * @returns true = 已经开战（调用方要停下，别再挂"选人展示距离"）
 */
setSearchFoundHandler((state) => {
    if (!state.lastSearchFound)
        return false;
    maybeStartEncounter(state);
    return Boolean(state.encounter);
});
import type { GameContent } from '../content/loader.js';
import type { CardDef, MapDef } from '../content/schema.js';
import type { ClientAction, EncounterState, Faction, GameState, KillerState, LogEntry, Phase, PlayerState, PublicSnapshot } from './types.js';
export type { Phase };

/**
 * 替换「鸿运当骰」等牌时用到的三张替换牌 id。
 * 放在文件最前面，避免任何作用域/求值顺序问题。
 */
const REPLACEMENT_CARD_IDS = ['sk_lucky_dice', 'sk_lamp', 'sk_parcel'];

/** 某些角色开局就自带东西：索菲亚有相机，马尔科有医药包 */

/** 某些角色开局就自带东西：索菲亚有相机，马尔科有医药包 */
export function startingItemsFor(
    characterId: string,
    characterName: string | null | undefined,
): Record<string, number> {
    const hay = `${characterId} ${characterName}`;
    // 旧写法「索菲娅」也认（历史存档、外部文案可能仍是旧名）
    if (/survivor4|索菲亚|索菲娅|sophia/i.test(hay))
        return { sophia_camera: 1 };
    if (/survivor3|马尔科|marco/i.test(hay))
        return { marco_medkit: 1 };
    return {};
}

/** 做一个空的玩家棋子：还没选阵营、还没放到地图上 */
/** 选择界面的地图顺序（从左往右）：豪宅 → 小屋 → 其它（保持原顺序） */
export function sortMapsForPicker(maps: MapDef[]): MapDef[] {
    const order = ['mansion', 'cabin'];
    return [...maps].sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        if (ia < 0 && ib < 0)
            return 0;
        if (ia < 0)
            return 1;
        if (ib < 0)
            return -1;
        return ia - ib;
    });
}

export function createPlayer(id: string, name: string, controllerId?: string | null): PlayerState {
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
        skillUsedThisTurn: new Set<string>(),
        quietSearch: false,
        attackBonus: 0,
        moveBonus: 0,
        actedThisRound: false,
        statueIndex: null,
        statueHalted: false,
        /**
         * 扼杀者：本大回合是否已移除过核心标记。
         * 雕像「停滞」用的三个字段也在 PlayerState 上。
         */
        coreRemovedThisRound: false,
        extraActionUsedThisTurn: false,
        tradedThisTurn: false,
        haltedThisRound: false,
    };
}

/** 雕像杀手（killer6）：4 个雕像棋子的 id */
export function statuePieceIds(state: GameState): string[]
{
    return state.statueIds ?? [];
}

/**
 * **某个杀手名下的全部棋子**。
 *
 *  - 雕像：4 尊全算他的（特性卡挂在主雕像那一份上，但"他的雕像"有 4 尊）
 *  - 其他杀手：就是他自己那一个
 *
 * ⚠ 2对3 里必须**按名下的杀手**算，不能"桌上任一杀手棋子" ——
 * 用户明确：两个杀手的特性不能弄混。
 */
function killerPieceIdsFor(state: GameState, killerId: string | null | undefined): string[]
{
    if (!killerId || !state.players[killerId])
        return [];
    if (isStatueKiller(state, killerId)) {
        const statues = statuePieceIds(state).filter((id) => state.players[id]);
        return statues.length ? statues : [killerId];
    }
    return [killerId];
}

/** 当前这名杀手（`state.killerId`）名下的全部棋子 */
export function currentKillerPieceIds(state: GameState): string[]
{
    return killerPieceIdsFor(state, state.killerId);
}

/**
 * 这个杀手是不是「雕像」（看角色 id / 名字）。
 *
 * `killerId` 可选：2v3 有两名杀手，要能指定问的是哪一个 ——
 * 不能一律看 `state.killerId`（那个只是"现在轮到谁"）。
 */
export function isStatueKiller(state: GameState, killerId?: string | null): boolean
{
    const kid = killerId ?? state.killerId;
    const k = kid ? state.players[kid] : null;
    if (!k)
        return false;
    const ch = state.characters.find((c) => c.id === k.characterId);
    return /killer6|雕像|statues/i.test(`${k.characterId ?? ''} ${ch?.name ?? ''}`);
}

/** 所有雕像棋子（按编号 1..4） */
export function statuePieces(state: GameState): PlayerState[]
{
    return statuePieceIds(state)
        .map((id) => state.players[id])
        .filter((p) => Boolean(p))
        .sort((a, b) => (a.statueIndex ?? 0) - (b.statueIndex ?? 0));
}

/** 主雕像棋子（= state.killerId 那条） */
export function mainStatue(state: GameState): PlayerState | null
{
    return state.killerId ? state.players[state.killerId] ?? null : null;
}

/**
 * 切换主雕像。
 *
 * 注意：杀手的手牌、力量、等级、进化都挂在 `state.killer*` 上，
 * 和具体是哪尊雕像无关 —— 所以切换**只需要改 state.killerId**，
 * 既不用搬数据，也**不会搬位置**（每尊雕像留在原地）。
 */
export function switchMainStatue(state: GameState, toStatueId: string): boolean
{
    const from = state.killerId ? state.players[state.killerId] : null;
    const to = state.players[toStatueId];
    if (!to || to.statueIndex == null)
        return false;
    if (from && from.id === to.id)
        return false;
    /**
     * 潜行是挂在棋子上的：主雕像潜行中被切换时，
     * 潜行状态留在原来那尊身上（以后可能出现「主雕像在潜行中切换」，
     * 下回合那尊雕像正常重现）。
     */
    state.killerId = to.id;
    return true;
}

/**
 * 【雕像】**这个杀手棋子是雕像局里的"原始棋子"吗**（局里已经有它的雕像替身了）。
 *
 * 用户口径：「雕像局在幸存者视角就**只有 4 个杀手**，不应多一个」、
 * 「主雕像就代表原始棋子，或者在雕像局把这个原始棋子**隐藏**」。
 *
 * 所以雕像局里：
 *  - 原始棋子的 `roomId` 被置空（不在任何地点 → 不会被"遍历杀手棋子"的判定
 *    当成"杀手在此"，也不会被画成立绘）；
 *  - 状态（手牌 / 力量 / 等级）本来就挂在主雕像那一份上，原始棋子只是个空壳。
 *
 * ⚠ **只认这个棋子自己的雕像替身**（`${p.id}__statueN`）——
 * 2v3 里另一名杀手的原始棋子**不受影响**。
 */
export function isStatueGhostPiece(state: GameState, p: PlayerState): boolean {
    if (p.faction !== 'killer' || p.statueIndex != null) return false;
    return (state.statueIds ?? []).some((id) => id.startsWith(`${p.id}__statue`));
}

/**
 * 重整旗鼓／雕像封堵搬运：把场上一个已有封堵从 fromDoorId 移到 toDoorId。
 *
 * 规则（用户口径）：「**任意一扇没被封堵的门，但不能是原处**」——
 * 所以目标门必须：① 目前没有封堵；② 不是它原来那扇。
 *
 * ⚠ 机关大门也**不能**放（`isLeverGate` 那扇门等于"不可封堵"，见 `isBlockadableDoor`）——
 * 这一条和"封堵不能封在机关大门上"是同一个口径。
 */
export function moveBlockadeTo(state: GameState, fromDoorId: string, toDoorId: string) {
    if (!isDoorBlocked(state, fromDoorId))
        throw new Error('那里没有封堵');
    if (canonicalDoorId(fromDoorId) === canonicalDoorId(toDoorId))
        throw new Error('封堵不能移回原处（要换一扇没被封堵的门）');
    if (isDoorBlocked(state, toDoorId))
        throw new Error('那扇门已经有封堵了');
    if (isLeverGate(state, toDoorId))
        throw new Error('那扇门上是机关大门，封堵不能移过去');
    const i = state.blockades.findIndex((id) => canonicalDoorId(id) === canonicalDoorId(fromDoorId));
    if (i < 0)
        throw new Error('找不到这个封堵');
    const fromPair = parseDoor(state.blockades[i]);
    const toPair = parseDoor(toDoorId);
    // 移除旧的，放上新的
    state.blockades.splice(i, 1);
    const newId = canonicalDoorId(toDoorId);
    state.blockades.push(newId);
    log(state, fromPair && toPair
        ? `封堵从「${roomName(state, fromPair[0])}」–「${roomName(state, fromPair[1])}」移到「${roomName(state, toPair[0])}」–「${roomName(state, toPair[1])}」。`
        : '封堵已移动。');
}

export function isSharedSurvivorMode(state: GameState) {
    return state.mode === 'solo' || state.mode === 'duo' || state.mode === 'vs2';
}

/**
 * 2v3 有两名杀手，各自一套牌库/手牌/弃牌堆/力量/行动区。
 *
 * 为了让既有的 500 多处 `state.killerHand` 一类代码不用逐个改写，
 * 这里把**当前行动杀手**的切片镜像到 `GameState` 顶层字段：
 *  - `syncActiveKiller(state)`：把顶层字段**存回**它所属的切片
 *  - `loadKillerToMirror(state, id)`：把某个杀手的切片**读进**顶层字段
 *  - `switchActiveKiller(state, id)`：先存旧的、再读新的
 *
 * 1 杀手模式下这些函数等价于无操作（只有一个切片，永远同步）。
 */
/** 顶层字段的名 ↔ 切片字段名的映射（名字对不上的那几个） */
const MIRROR_FIELD_MAP: Record<string, string> = {
    killerHand: 'hand',
    killerDeck: 'deck',
    killerDiscard: 'discard',
    killerLocked: 'locked',
    killerPower: 'power',
    killerTurnPowerBonus: 'turnPowerBonus',
    killerMainActionsLeft: 'mainActionsLeft',
    killerUsedSlowThisTurn: 'usedSlowThisTurn',
    killerTurnStep: 'turnStep',
    killerMainChoice: 'mainChoice',
    pendingKillerDiscards: 'pendingDiscards',
    pendingUnlockDiscard: 'pendingUnlockDiscard',
    justUnlockedCards: 'justUnlockedCards',
    killerRepairGuess: 'repairGuess',
    killerPublicKeys: 'publicKeys',
    encounteredThisTurn: 'encounteredThisTurn',
    /**
     * ⚠ **「本回合移动通过了秘密通道」也要按杀手隔离**（用户问的"张冠李戴"）：
     * 保护色「通过秘密通道 +3」和【伏擊】的条件都看它，
     * 放全局的话**另一名杀手走过秘密通道会替未命名满足条件**。
     */
    movedThroughPassageThisTurn: 'movedThroughPassage',
    /**
     * ⚠ **力量/意向类状态也要按杀手隔离**（用户问的"屏息被清除"）：
     * 放全局的话，甲打【屏息】乙会白拿 +3，而且**乙的回合收尾会把甲的屏息清掉**。
     * `turnLingeringPower` 同时被疯狂 / 保護色「通过秘密通道 +3」用，同理。
     */
    turnLingeringPower: 'turnLingering',
    carryPowerUntilNextTurn: 'carryPower',
    carryPowerActive: 'carryPowerActive',
    pendingAttackPower: 'pendingAttackPower',
    pendingRevealPower: 'pendingRevealPower',
    /**
     * ⚠ `killerLevel` **故意不在**这张表里 ——
     * 2对3 的进化等级是**队伍共用**的一条进度（两人同时进化、等级永远相同），
     * 放进镜像就会被"每个杀手各存一份"，换人时按切片覆盖，反而会漂移。
     */
};

/** 造一个全新的杀手切片（还没发牌，力量按角色填） */
export function makeKillerSlice(killerId: string, startingPower = 0): KillerState {
    return {
        killerId,
        hand: [],
        deck: [],
        discard: [],
        locked: [],
        power: startingPower,
        turnPowerBonus: 0,
        mainActionsLeft: 0,
        usedSlowThisTurn: false,
        turnStep: 'fast',
        mainChoice: null,
        pendingDiscards: 0,
        pendingUnlockDiscard: false,
        justUnlockedCards: [],
        repairGuess: 0,
        publicKeys: 0,
        encounteredThisTurn: false,
        /**
         * ⚠ **「本回合是否移动通过了秘密通道」必须按杀手隔离** ——
         * 2对3 里两名杀手共用一个 state，如果放全局字段，
         * 甲走过秘密通道会让**乙（未命名）**的保護色 +3、【伏擊】误判成可用
         * （用户问的"张冠李戴"）。所以它进了镜像表。
         */
        movedThroughPassage: false,
        /**
         * ⚠ 下面这几个"力量/意向"类字段**必须按杀手隔离**，
         * 而且**必须在切片里给出初值** —— 否则换人时顶层会被读成 `undefined`，
         * 那种"状态丢失"比张冠李戴更难查。
         */
        turnLingering: 0,
        carryPower: 0,
        carryPowerActive: false,
        pendingAttackPower: 0,
        pendingRevealPower: 0,
        out: false,
    };
}

/** 顶层镜像现在属于哪个杀手（`null` = 还没同步过） */
function mirrorOwner(state: GameState): string | null {
    return (state as GameState & { _mirrorKillerId?: string | null })._mirrorKillerId ?? null;
}

/**
 * **发牌当下**给某个杀手建档 + 同步：把顶层字段（这时装的是**刚发给他的牌**）
 * 存进他的切片，并把"当前镜像属于谁"标成他。
 *
 * 为什么需要它：`drawKillerCards(state, n)` 只认顶层字段（它是共享函数，
 * 牌库/手牌/弃牌堆都从 `state.` 上读），所以开局发牌必须"发一个、同步一个"。
 * 2v3 里第一个杀手的牌会先落在顶层，建档后归他，再清空给第二个杀手发。
 */
export function claimKillerGlobalsFor(state: GameState, killerId: string, startingPower: number): void {
    const prev = mirrorOwner(state);
    /**
     * 先把"上一个认领者"的改动存回他自己的切片，再把顶层清空 ——
     * 否则他的力量/牌库会粘到新杀手身上。
     */
    if (prev && prev !== killerId)
        syncActiveKiller(state);
    for (const top of Object.keys(MIRROR_FIELD_MAP))
        (state as unknown as Record<string, unknown>)[top] = undefined;
    const slice = makeKillerSlice(killerId, startingPower);
    for (const [top, field] of Object.entries(MIRROR_FIELD_MAP)) {
        (slice as unknown as Record<string, unknown>)[field] = (state as unknown as Record<string, unknown>)[top];
    }
    state.killers[killerId] = slice;
    (state as GameState & { _mirrorKillerId?: string | null })._mirrorKillerId = killerId;
}

/** 把顶层字段存回它所属的切片 */
export function syncActiveKiller(state: GameState): void {
    const owner = mirrorOwner(state);
    if (!owner) {
        /**
         * 还没建立镜像：说明这是 1 杀手模式开局阶段（`createLobby` 里字段还是空的）。
         * 等杀手入场时由 `loadKillerToMirror` / `switchActiveKiller` 建立。
         */
        if (state.killerId && state.killers[state.killerId]) {
            loadKillerToMirror(state, state.killerId);
        }
        return;
    }
    const slice = state.killers[owner];
    if (!slice) return;
    for (const [top, field] of Object.entries(MIRROR_FIELD_MAP)) {
        (slice as unknown as Record<string, unknown>)[field] = (state as unknown as Record<string, unknown>)[top];
    }
}

/** 把某个杀手的切片读进顶层字段（不先保存旧的，调用方负责） */
export function loadKillerToMirror(state: GameState, killerId: string): void {
    /** 切片还没建档（`initPiece` 之前）就先按当前顶层字段补一份，免得丢数据 */
    if (!state.killers[killerId]) {
        const slice = makeKillerSlice(killerId);
        for (const [top, field] of Object.entries(MIRROR_FIELD_MAP)) {
            (slice as unknown as Record<string, unknown>)[field] = (state as unknown as Record<string, unknown>)[top];
        }
        state.killers[killerId] = slice;
    }
    const slice = state.killers[killerId];
    for (const [top, field] of Object.entries(MIRROR_FIELD_MAP)) {
        (state as unknown as Record<string, unknown>)[top] = (slice as unknown as Record<string, unknown>)[field];
    }
    (state as GameState & { _mirrorKillerId?: string | null })._mirrorKillerId = killerId;
}

/** 换当前行动的杀手：先把旧的存回，再把新的读进来 */
export function switchActiveKiller(state: GameState, killerId: string): void {
    if (mirrorOwner(state) === killerId) {
        state.killerId = killerId;
        return;
    }
    syncActiveKiller(state);
    state.killerId = killerId;
    loadKillerToMirror(state, killerId);
}

export function isSurvivorOperator(state: GameState, socketId: string) {
    if (state.mode === 'solo')
        return socketId === state.hostId;
    if (state.mode === 'duo' || state.mode === 'vs2') {
        return state.survivorOperators.some((o) => o.id === socketId);
    }
    return false;
}

export function controlsPiece(state: GameState, socketId: string, piece: PlayerState) {
    if (!piece)
        return false;
    if (state.mode === 'solo' && socketId === state.hostId)
        return true;
    if (piece.faction === 'survivor' && isSurvivorOperator(state, socketId))
        return true;
    return piece.controllerId === socketId;
}

export function otherConnectedSurvivorOperator(state: GameState, socketId: string) {
    return state.survivorOperators.find((o) => o.id !== socketId && o.connected) ?? null;
}

export function needsCoopConfirm(state: GameState, action: ClientAction, actor: PlayerState) {
    if (state.mode !== 'vs2' || state.applyingConfirmedCoop)
        return false;
    if (actor.faction !== 'survivor')
        return false;
    return (action.type === 'move' ||
        action.type === 'search' ||
        action.type === 'repair' ||
        action.type === 'clearFear' ||
        action.type === 'removeBlockade' ||
        action.type === 'useItem' ||
        action.type === 'useSkill' ||
        action.type === 'useSuitcase');
}

export function coopActionSummary(state: GameState, action: ClientAction, actor: PlayerState) {
    const dest = 'toRoomId' in action && action.toRoomId ? roomName(state, action.toRoomId) : '';
    if (action.type === 'move')
        return `${actor.name} 移动到「${dest}」`;
    if (action.type === 'search')
        return `${actor.name} 搜索物资`;
    if (action.type === 'repair')
        return `${actor.name} 修理无线电`;
    if (action.type === 'clearFear')
        return `${actor.name} 消除恐惧`;
    if (action.type === 'removeBlockade')
        return `${actor.name} 移除封堵`;
    if (action.type === 'useItem') {
        const item = itemName(action.itemId);
        const tgt = action.targetPlayerId ? state.players[action.targetPlayerId]?.name : '';
        if (dest)
            return `${actor.name} 使用「${item}」→${dest}`;
        if (tgt)
            return `${actor.name} 使用「${item}」治疗 ${tgt}`;
        return `${actor.name} 使用「${item}」`;
    }
    if (action.type === 'useSkill') {
        const skill = action.skillId;
        if (dest)
            return `${actor.name} 发动「${skill}」→${dest}`;
        return `${actor.name} 发动「${skill}」`;
    }
    if (action.type === 'useSuitcase')
        return `${actor.name} 打开手提箱摸一张发现牌`;
    return `${actor.name} 的行动`;
}

/** 开一桌新牌：大厅、默认单人热座、规则和地图先摆好 */
export function createLobby(roomCode: string, hostId: string, hostName: string, content: GameContent, mapId?: string): GameState
{
    const host = createPlayer(hostId, hostName);
    return {
        roomCode,
        /**
         * **这一局的唯一标识**（每次"开始新一局"都换一个）。
         *
         * 用途：杀手视角的"手动摆放幸存者立绘"是按它对客户端本地缓存的 ——
         * 「重新开始」时房间码和棋子 id 都不变，只按房间码缓存的话
         * **上一局的摆放会被继承**（换地图时那些房间 id 甚至在新图上不存在），
         * 表现就是用户报的"开局时幸存者立绘没摆在主要出口"。
         */
        matchId: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        hostId,
        mode: 'multi',
        /** 「分头行动」默认关（大厅里由房主勾选，1对3 / 2对3 才有效） */
        split: false,
        splitFirstId: null,
        splitOrderBase: [],
        /** 【变体1】特性卡：默认关；难度默认普通。所有模式都能开，和变体2 互不影响 */
        variant1: false,
        /** 【变体3】计划卡：默认关（大厅里由房主勾选），相关字段见 `plans.ts` */
        ...planDefaults(),
        traitDifficulty: 'normal',
        traitById: {},
        traitPool: { survivor: [], killer: [] },
        traits: {},
        traitOffers: {},
        traitPickQueue: [],
        traitUsed: [],
        killerSkipFirstTurn: [],
        pendingTraitBlockades: 0,
        pendingTraitSetupResume: false,
        pendingTraitDiscard: 0,
        pendingTraitDiscardFrom: null,
        pendingSenseTraits: false,
        pendingSenseWitnessed: [],
        traitUsedThisRound: [],
        pendingQuietSearch: null,
        pendingTraitVictim: null,
        discoveryKeepBoth: false,
        pendingHeroicBlock: null,
        pendingPreyOffer: false,
        /** 捕网的「本回合不能离开」效果（陷阱本身是一次性的，触发即消失） */
        netLocks: [],
        soloKillerCharacterId: null,
        soloSurvivorCharacterIds: [],
        survivorOperators: [],
        crossbowHolderId: null,
        crossbowAssigned: false,
        /** 【解散房间】开局没有任何解散请求 */
        disband: { requestedBy: null, votes: [] },
        restart: { requestedBy: null, votes: [] },
        pendingCoopAction: null,
        applyingConfirmedCoop: false,
        phase: 'lobby',
        round: 0,
        contentVersion: content.rules.id,
        map: content.maps.find((m) => m.id === mapId) ?? content.map,
        /**
         * 选择界面的地图顺序：从左往右。
         * 文件扫描顺序不固定，所以这里按固定优先级排：
         * 豪宅（mansion）→ 小屋（cabin）→ 其它。
         */
        maps: sortMapsForPicker(content.maps),
        rules: content.rules,
        characters: content.characters,
        cardById: content.cards.byId,
        players: { [hostId]: host },
        turnOrder: [],
        activeSurvivorIndex: 0,
        killerId: null,
        killerIds: [],
        killers: {},
        killerTurnOrder: [],
        killerTurnIndex: 0,
        killerOrderDecided: false,
        killerRoundEndedByEncounter: false,
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
        /** ⚠ 带上 `round: 0`（大厅阶段）—— 每条战报都有回合号，"本大回合"那块才好筛 */
        logs: [{ t: Date.now(), text: `房间 ${roomCode} 已创建。`, round: 0 }],
        pendingMoveRange: null,
        pendingCardSpeed: null,
        pendingItemDiscard: null,
        pendingTrade: null,
        trapRoomIds: [],
        trapPartRooms: [],
        firstAidKit: false,
        leverGateDoorId: null,
        leverGateOwnerId: null,
        pendingTurnEndSwitch: false,
        pendingGatePay: null,
        castleHallFirstEnterDone: false,
        collapsedRooms: [],
        pendingCollapse: false,
        pendingCollapseLevel: 0,
        pendingCollapseMoves: null,
        relicMarkerFaceUp: true,
        relicDeck: [],
        pendingInsightSearches: 0,
        pendingSenseRoom: null,
        killerSenseRoomActive: false,
        /** 打牌后拿到的信息（行动区显示 + 确认后才继续） */
        killerIntel: [],
        currentKillerCardId: null,
        pendingSenseMoveAfter: false,
        witnessedRev: {},
        pendingMoveSurvivorPick: null,
        pendingMoveSurvivorId: null,
        witnessedAt: {},
        pendingTrackerPick: false,
        pendingStatueSearchAfterPath: false,
        killerPowerUntilNextTurn: 0,
        turnLingeringPower: 0,
        carryPowerUntilNextTurn: 0,
        carryPowerActive: false,
        pendingAttackPower: 0,
        pendingRevealPower: 0,
        movedThroughPassageThisTurn: false,
        encounterFromRevealSearch: false,
        revealSearchHappened: false,
        passagePowerBonus: 0,
        passageStealthAnywhere: false,
        pendingPassageAnywhere: false,
        pendingPassageLabel: null,
        sonarRevealActive: false,
        slimeGlandActive: false,
        chosenEvolutionCards: [],
        pendingEvolutionCardPick: null,
        unEvolutionPool: [],
    pendingUnlockChoice: null,
        pendingMoveChoices: null,
        pendingStatueEvoSwitch: false,
        /** 已经点了、等确认的那尊雕像（选择要确认） */
        pendingStatueEvoTarget: null,
        killerRemovedPermanently: [],
        killerLevelPowerGain: 0,
        pendingPassagePick: null,
        pendingPassageRoom: null,
    pendingDiscardRemove: null,
        pendingAcidPick: false,
        coreMarkers: [],
        coreSetupDone: false,
        pendingCorePick: null,
        pendingCoreOverflowPlaceAt: null,
        pendingCoreOverflowPlaceAtAfter: null,
        pendingCoreFrom: null,
        pendingCoreRooms: [],
        pendingCoreNeighbors: [],
        pendingReturnToDeckTop: false,
        pendingDeckTopCard: null,
        deferredPlayedCard: null,
        pendingBlockadeRoom: null,
        pendingBlockadeRemaining: 0,
        // —— 女王（killer9）——
        zombies: [],
        nextZombieArt: 1,
        poisoned: [],
        pendingZombieSearch: null,
        pendingZombieHordeFrom: null,
        pendingZombieHordeTo: null,
        pendingZombieSacrifice: null,
        pendingQueenMove: null,
        pendingCrossbow: null,
        queenEncounteredThisTurn: false,
        pendingQueenSpawnRooms: null,
        pendingStranglerCoreRooms: null,
        pendingGeorgeBlockade: null,
        corePlacedKeys: [],
        pendingOptionalEffect: null,
        encounterBlockItems: false,
        pendingTeleportPick: null,
        pendingEffectChoice: null,
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
        pendingSixthSense: null,
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
        notesDeck: [],
        pendingGeorgeNote: false,
        pendingDice: null,
        pendingExtraRerolls: 0,
        replacementDeck: false,
        statueIds: [],
        pendingStatueSwitch: null,
        statueMainLocked: false,
        statueGuesses: {},
        treasureDeck: [],
        treasureDiscard: [],
        treasureChests: {},
        hunterTraps: {},
        pendingTrapPlacement: null,
        pendingStatueMoveQueue: [],
        pendingStatuePick: null,
        pendingStatueStepId: null,
        pendingStatueMoveMax: 1,
        pendingStatueMoveMin: 0,
        pendingStatueSearchQueue: [],
        pendingStatueRally: false,
        pendingStatueRallySwitched: false,
        pendingStatueRallyMoveBlockade: false,
        pendingStatueMovedBlockadeFrom: null,
        pendingStatueSeal: false,
    pendingStatueSealFrom: null,
        statueReleaseSearchesAfter: false,
        statueSiegeSearchesAfter: false,
        statueSearchHitRoomId: null,
        statueEncounterRoom: null,
        pendingPathDraft: null,
        pendingSenseColorPick: null,
        rematchReady: [],
        ...emptyEvolutionFields(),
    };
}

/** 把断线座位认领给新连上的人（同一房间码可反复进出） */
export function adoptDisconnected(state: GameState, socketId: string, name: string) {
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
    if (dead.length === 0)
        return false;
    const named = dead.find(([, ps]) => ps.some((p) => p.controllerName === name || p.name === name));
    const pick = named?.[0] ?? (dead.length === 1 ? dead[0][0] : null);
    if (!pick)
        return false;
    for (const p of Object.values(state.players)) {
        if (p.controllerId === pick) {
            p.controllerId = socketId;
            p.connected = true;
            if (name)
                p.controllerName = name;
        }
    }
    if (state.hostId === pick)
        state.hostId = socketId;
    for (const o of state.survivorOperators) {
        if (o.id === pick) {
            o.id = socketId;
            o.connected = true;
            if (name)
                o.name = name;
        }
    }
    const coop = state.pendingCoopAction;
    if (coop && coop.fromControllerId === pick) {
        coop.fromControllerId = socketId;
    }
    log(state, `${name || '玩家'} 重新入座。`);
    return true;
}

export function adoptDisconnectedOperator(state: GameState, socketId: string, name: string) {
    const dead = state.survivorOperators.filter((o) => !o.connected);
    if (dead.length === 0)
        return false;
    const pick = dead.find((o) => o.name === name) ?? (dead.length === 1 ? dead[0] : null);
    if (!pick)
        return false;
    const oldId = pick.id;
    pick.id = socketId;
    pick.connected = true;
    if (name)
        pick.name = name;
    for (const p of Object.values(state.players)) {
        if (p.controllerId === oldId)
            p.controllerId = socketId;
    }
    if (state.hostId === oldId)
        state.hostId = socketId;
    if (state.pendingCoopAction?.fromControllerId === oldId) {
        state.pendingCoopAction.fromControllerId = socketId;
    }
    log(state, `${name || '玩家'} 重新入座。`);
    return true;
}

/** 同学加入这桌。对局中优先坐回断线座位 */
export function addPlayer(state: GameState, id: string, name: string): void
{
    if (state.players[id]) {
        state.players[id].connected = true;
        if (name) {
            state.players[id].name = name;
            state.players[id].controllerName = name;
        }
        return;
    }
    if (adoptDisconnected(state, id, name || '玩家'))
        return;
    if (adoptDisconnectedOperator(state, id, name || '玩家'))
        return;
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
    /** 2对3：最多 5 个座位（2 杀手 + 3 幸存者），观众不占座位 */
    if (state.mode === '2v3') {
        const seated = Object.values(state.players).filter((x) => x.faction !== 'spectator').length;
        if (seated >= 5)
            throw new Error('房间已满（2 名杀手 + 3 名幸存者）');
    }
    state.players[id] = createPlayer(id, name);
    log(state, `${name} 加入了房间。`);
}

/** 有人离开：只标断线，房间和棋子都留着，方便用房间码再进来 */
export function removePlayer(state: GameState, id: string): void
{
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
    if (any)
        log(state, `有人离开房间，座位保留。用房间码和原来的昵称即可回来。`);
}

/** 还活着的幸存者里，行动顺序最靠前的那一个 */
export function firstAliveSurvivorId(state: GameState): string | null {
    for (const id of state.turnOrder) {
        const p = state.players[id];
        if (p?.alive && p.faction === 'survivor')
            return id;
    }
    const any = Object.values(state.players).find((p) => p.faction === 'survivor' && p.alive);
    return any?.id ?? null;
}

/** 现在正在行动的那名幸存者 */
export function activeSurvivorId(state: GameState) {
    if (state.phase !== 'survivorMain')
        return null;
    if (state.pendingSurvivorPick)
        return null;
    const order = state.turnOrder;
    if (!order.length)
        return null;
    return order[state.activeSurvivorIndex] ?? null;
}

/** 遭遇里还没轮到防御的幸存者 */
export function pendingDefenseSurvivorIds(state: GameState) {
    const enc = state.encounter;
    if (!enc || enc.step !== 'defend' || !enc.targetId)
        return [];
    if (enc.targetId in enc.defenses)
        return [];
    return [enc.targetId];
}

/** 现在该谁点按钮：选角、幸存者、杀手、遭遇里的某一步 */
export function activePlayerId(state: GameState) {
    if (state.pendingAmulet)
        return state.pendingAmulet.playerId;
    if (state.pendingEvolutionAck)
        return state.killerId;
    if (state.pendingOverFearWound)
        return state.killerId;
    if (state.pendingWhizSearch)
        return state.killerId;
    if (state.pendingBlockadeJob)
        return state.killerId;
    // 乔治在挑笔记：还是他的小回合，先挑完
    if (state.pendingGeorgeNote) {
        const g = Object.values(state.players).find((pl) => pl.faction === 'survivor' && isGeorge(state, pl.id));
        if (g)
            return g.id;
    }
    if (state.pendingItemDiscard && state.mode !== 'multi')
        return state.pendingItemDiscard.playerId;
    if (state.phase === 'survivorMain')
        return activeSurvivorId(state);
    if (state.phase === 'discovery') {
        if (state.pendingDiscoveryPick)
            return firstAliveSurvivorId(state) ?? state.hostId;
        return state.discoveryActorId ?? firstAliveSurvivorId(state) ?? state.hostId;
    }
    if (state.phase === 'noiseReport' || state.phase === 'killerMain' || state.phase === 'upkeep') {
        return state.killerId;
    }
    if (state.phase === 'encounter' && state.encounter) {
        if (state.encounterOpenHold || state.pendingOverFearWound)
            return state.killerId;
        const enc = state.encounter;
        if (enc.step === 'pick') {
            const here = remainingEncounterTargets(state);
            return here[0]?.id ?? firstAliveSurvivorId(state);
        }
        if (enc.step === 'attack')
            return state.killerId;
        if (enc.step === 'defend') {
            const pending = pendingDefenseSurvivorIds(state);
            return pending[0] ?? null;
        }
        if (enc.step === 'flee')
            return enc.targetId ?? pendingFleeIds(state)[0] ?? null;
    }
    return null;
}

/** 将 socket 映射为当前应操作的玩家实体 id */
/**
 * 把“哪根网线发来的消息”翻译成“桌上哪颗棋子在行动”。
 * 单人/1对1时，一个人操控好几颗棋子，所以不能只用 socketId。
 */
export function resolveActorId(state: GameState, socketId: string, action: ClientAction): string
{
    const lobbyish = state.phase === 'lobby' || state.phase === 'characterSelect';
    if (lobbyish)
        return socketId;
    /**
     * **【墓穴】坍塌收尾**：这一步不是"轮到谁的大回合"，而是"轮到谁离开废墟"。
     *
     * ⚠ 返回的必须是**棋子 id**（`mover.id`）—— `handleAction` 拿它去
     * `state.players` 里找棋子，而 solo/duo/vs2 下 `state.players` 的键是
     * **棋子 id**（`h__surv1`、`h__killer`），**不是 socketId**。
     *
     * 以前这里返回 `socketId`，于是那三种模式下 `state.players['h']` 是 undefined
     * → 直接报「不在房间内」，玩家什么也点不了（1对3 恰好键就是 socketId，
     * 所以那个模式没暴露出来）。
     */
    if (action.type === 'collapseMove' && state.pendingCollapseMoves?.currentId) {
        const mover = state.players[state.pendingCollapseMoves.currentId];
        if (mover && controlsPiece(state, socketId, mover))
            return mover.id;
        /** 单人热座：房主同时管杀手和幸存者，也让他自己点 */
        if (mover && state.mode === 'solo' && socketId === state.hostId)
            return mover.id;
    }
    if (isSharedSurvivorMode(state)) {
        const hostOverride = state.mode === 'solo';
        const operatedBy = (pieceId: string | null | undefined): boolean =>
            Boolean(pieceId && controlsPiece(state, socketId, state.players[pieceId]));
        if (action.type === 'discardKillerCard' && state.killerId) {
            const k = state.players[state.killerId];
            if (k?.controllerId === socketId)
                return state.killerId;
        }
        if (action.type === 'acknowledgeNoise' && state.killerId) {
            const k = state.players[state.killerId];
            if (k?.controllerId === socketId)
                return state.killerId;
        }
        if (action.type === 'confirmAmulet' && state.pendingAmulet) {
            const sid = state.pendingAmulet.playerId;
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        /** 第六感：由发动搜索的那名幸存者的操控者选择 */
        if (action.type === 'resolveSixthSense' && state.pendingSixthSense) {
            const sid = state.pendingSixthSense.playerId;
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        if (action.type === 'discardItem' && state.pendingItemDiscard) {
            const sid = state.pendingItemDiscard.playerId;
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        if (action.type === 'acknowledgeDiscovery' || action.type === 'chooseDiscovery') {
            const sid = state.discoveryActorId ?? firstAliveSurvivorId(state);
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        if (action.type === 'pickSurvivorTurn') {
            const sid = firstAliveSurvivorId(state);
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        if (action.type === 'pickEncounterTarget' && state.encounter?.step === 'pick') {
            const here = survivorsInRoom(state, state.encounter.roomId);
            const mine = here.find((s) => controlsPiece(state, socketId, s));
            if (mine)
                return mine.id;
            if (hostOverride && socketId === state.hostId && here[0])
                return here[0].id;
        }
        if (action.type === 'tradeItem') {
            const fromId = action.fromPlayerId;
            if (fromId && operatedBy(fromId))
                return fromId;
            const sid = firstAliveSurvivorId(state);
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        if ((action.type === 'useItem' || action.type === 'useSkill' || action.type === 'useSuitcase' || action.type === 'removeCoreMarker' || action.type === 'useEncourage' || action.type === 'useLuckyCoin' || action.type === 'useMechanicalKnack' || action.type === 'drawRelic' || action.type === 'placeLeverGate' || action.type === 'useMirrorPortal') &&
            action.actorPlayerId &&
            operatedBy(action.actorPlayerId)) {
            return action.actorPlayerId;
        }
        /**
         * 【变体3】计划能力：也认 `actorPlayerId` ——
         * 「額外行動」在额外行动窗口里是**按每名幸存者**列按钮的
         * （单人热座 / 共享操控下一个人管多名幸存者），不认这个参数就会
         * 一律算到行动顺序第一个幸存者头上。
         */
        if (action.type === 'usePlanAbility' && action.actorPlayerId && operatedBy(action.actorPlayerId)) {
            return action.actorPlayerId;
        }
        /**
         * 女王的僵尸落点动作：由**杀手**的操控者执行。
         */
        if (action.type === 'confirmQueenMove' ||
            action.type === 'pickZombieSearch' ||
            action.type === 'pickZombieHorde' ||
            action.type === 'pickZombieSacrifice') {
            const kid = state.killerId;
            if (kid && operatedBy(kid))
                return kid;
        }
        /**
         * 十字弩：由**那名幸存者**的操控者执行。
         */
        if (action.type === 'useCrossbow' || action.type === 'confirmCrossbow' || action.type === 'cancelCrossbow') {
            const sid = state.pendingCrossbow?.survivorId ?? action.actorPlayerId;
            if (sid && operatedBy(sid))
                return sid;
            if (hostOverride && socketId === state.hostId && sid)
                return sid;
        }
        /** 指定十字弩持有者：由被指定的那名幸存者的操控者执行 */
        if (action.type === 'pickCrossbowHolder') {
            const hid = action.holderId;
            if (hid && operatedBy(hid))
                return hid;
            if (hostOverride && socketId === state.hostId && hid)
                return hid;
        }
        /**
         * **路径草稿的动作，归草稿的主人。**
         *
         * 幸运币的〔移動〕是「幸存者自己的草稿」，而 `move` 不在
         * `actorPlayerId` 白名单里 —— 在单人热座下会被解析成
         * **第一个幸存者**（不是凯莱布），于是被「只能规划自己角色的移动」拒掉。
         * 所以这里按草稿上记的 `actorId` 归属来解析。
         */
        if (
            state.pendingPathDraft?.owner === 'survivor' &&
            state.pendingPathDraft.actorId &&
            (action.type === 'move' || action.type === 'finishPendingMove' || action.type === 'resetPathDraft') &&
            operatedBy(state.pendingPathDraft.actorId)
        ) {
            return state.pendingPathDraft.actorId;
        }
        /**
         * 扼杀者的核心标记落点动作：由**杀手**的操控者执行。
         */
        if (action.type === 'placeCoreMarker' ||
            action.type === 'blockadeAtCore' ||
            action.type === 'teleportToCore' ||
            action.type === 'moveCoreMarker') {
            const kid = state.killerId;
            if (kid && operatedBy(kid))
                return kid;
        }
        /**
         * **杀手侧**的"确认类"动作：要**先认 `state.killerId`（主雕像）**。
         *
         * ⚠ 以前下面那一支直接用 `Object.values(players).find(controlsPiece)`
         * —— 雕像局里 `players` 里躺着 4~5 个 killer 棋子（主雕像 + 副雕像），
         * `find` 会挑到**第一个副雕像**。于是 `assertActive` 拿它跟
         * `activePlayerId()`（= 主雕像）比，报**「还没轮到你」** ——
         * 用户报的"使用【感知】时显示还没轮到我"就是这个。
         */
        if (action.type === 'confirmSense' ||
            action.type === 'setKillerRepairGuess' ||
            action.type === 'ackEvolution' ||
            action.type === 'confirmWhizSearch' ||
            action.type === 'skipWhizSearch' ||
            action.type === 'confirmOverFearWound' ||
            action.type === 'skipOverFearWound' ||
            action.type === 'removeBoardBlockade' ||
            action.type === 'confirmEvoBlockade') {
            const kid = state.killerId;
            if (kid && controlsPiece(state, socketId, state.players[kid]!))
                return kid;
        }
        if (action.type === 'finishSurvivorPhase' ||
            action.type === 'respondTrade' ||
            action.type === 'respondCoopAction' ||
            action.type === 'rematchReady') {
            const mine = Object.values(state.players).find((pl) => controlsPiece(state, socketId, pl));
            if (mine)
                return mine.id;
        }
        if (action.type === 'playEncounterDefense' && state.encounter?.step === 'defend') {
            const pending = pendingDefenseSurvivorIds(state).find((id) => operatedBy(id));
            if (pending)
                return pending;
        }
        if (action.type === 'encounterFlee' && state.encounter?.step === 'flee') {
            /**
             * ⚠ **（甲）撤离先选人**：只有**被选中那个人**的操控者能发撤离动作。
             * 以前这里取的是 `fleeQueue[0]`，现在取 `targetId`（名单点出来的）。
             */
            const fid = state.encounter.targetId;
            if (fid && operatedBy(fid))
                return fid;
        }
        /** （甲）撤离名单：点谁撤离就解析成"那个人"（权限交给 `pickFleeSurvivor` 那一支校验） */
        if (action.type === 'pickFleeSurvivor' && state.encounter?.step === 'flee') {
            const wanted = state.players[action.targetPlayerId];
            if (wanted && operatedBy(wanted.id))
                return wanted.id;
        }
        const active = activePlayerId(state);
        if (active && operatedBy(active))
            return active;
        const any = Object.values(state.players).find((p) => controlsPiece(state, socketId, p));
        if (any)
            return any.id;
    }
    return socketId;
}

/** 一名幸存者开始自己的一段：还没做一般行动，移动力按规则重置 */
export function beginSurvivorTurn(state: GameState, playerId: string) {
    const p = state.players[playerId];
    if (!p)
        return;
    applyPassiveBonuses(state, playerId);
    /**
     * 【变体1】特性 06「匆匆逃离」：身处杀手距离 1 以内时，以【移动】为基础行动可以多走 1 格。
     * 这里也加进 `moveLeft` —— 客户端高亮的可达范围（`legalMoves`）就是按它算的，
     * 不加的话"能走却点不到"。判定在**小回合开始**时做一次。
     */
    const fleeBoost =
        state.variant1 && p.roomId && hasTrait(state, p.id, 'trait_s06') && withinKillerDistance(state, p.roomId, 1)
            ? 1
            : 0;
    const range = state.rules.survivorMoveRange + p.moveBonus + fleeBoost;
    p.moveLeft = range;
    p.actionsLeft = 1;
    p.mainActionUsed = false;
    p.searchedThisTurn = false;
    p.repairedThisTurn = false;
    p.skillUsedThisTurn = new Set();
    p.quietSearch = false;
    /** 凯莱布「幸运币」：每小回合可以用一次（额外行动） */
    p.luckyCoinUsedThisTurn = false;
    /**
     * 注意 `extraActionUsedThisTurn` / `tradedThisTurn` / `haltedThisRound`
     * **不在这里复位** —— 停滞的边界是**大回合**，只有 `startRound` 才清。
     * 换人做别人的小回合、再换回来，这几个标记都保持。
     */
    /**
     * **私有的那一条**：具体是谁、这一小回合能做哪些一般行动。
     * （公开的「幸存者正在行动」由 `startRound` 每个大回合打一次。）
     */
    log(state, `${p.name} 的小回合（一般行动：移动 1–${range} / 搜索物资 / 修理 / 特殊 / 拆封堵 / 消恐惧）。`, 'survivor');
}

/** 杀手回合开头：先快速牌。如果在潜行，**重现**并强制搜一次（暴露则不会搜） */
export function beginKillerTurn(state: GameState) {
    const kid = state.killerId;
    if (!kid)
        return;
    /**
     * **杀手回合一开始就把"哪些雕像被停滞了"报给他**（用户要求：
     * 「杀手回合开始时，报告被停滞的雕像，给杀手地图对应雕像打上叉标记」）。
     *
     * 必须放在下面那串复位之前 —— `statueHalted` 是新大回合开始时才清的，
     * 这里还看得到。战报里**只说哪几号、在哪**，不说谁停滞的。
     */
    reportHaltedStatues(state);
    /**
     * **新杀手回合：清空"打牌获得的信息区"和"当前打出的牌"。**
     *
     * 用户要求这两块都是**杀手回合期间**的东西：
     *  - 地图右边的信息区（`killerIntel`）只放本回合打牌拿到的信息；
     *  - 幸存者那边看到的"杀手当前打出的卡牌"也只反映本回合。
     */
    state.killerIntel = [];
    state.currentKillerCardId = null;
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
    /** 「持续到本回合结束」的力量在新回合清零；「下一次攻击」的加成也清（没用掉就作废） */
    state.turnLingeringPower = 0;
    state.pendingAttackPower = 0;
    /** 保護色「重现时 +3」的意向：重现发生在下面，这里先清掉上一回合的残留 */
    state.pendingRevealPower = 0;
    state.movedThroughPassageThisTurn = false;
    /** 「重现那一次搜索引发的遭遇」在新回合开始重置（重现发生在下面） */
    state.encounterFromRevealSearch = false;
    state.revealSearchHappened = false;
    /**
     * **欧菲莉亚「言语鼓励」的公开说明放在这里**（用户要求：
     * 「欧菲莉亚给幸存者鼓励标记放在杀手回合开始时说明」）。
     *
     * ⚠ **但这条只给幸存者看**（用户口径：「鼓励标记和迪伦的坚毅标记
     * **只有触发时才告诉杀手**」）——
     * 以前它是 `'all', needsCommon = true`，等于杀手回合一开始就被告知
     * "场上有鼓励标记"，那是"标记**存在**"的情报，不是"标记**触发**"的情报。
     * 触发那两条（取消恐惧 / 遭遇防御 +1）照旧 `'all', true`，杀手当场就知道。
     */
    if (Object.values(state.players).some((pl) => pl.faction === 'survivor' && pl.encourageToken)) {
        log(state, '幸存者方场上有**鼓励标记**（遭遇时防御 +1，恐惧 +1 时自动抵消一次）。', 'survivor');
    }
    /** 乔治「思维敏捷」每个大回合只能给一次笔记 */
    state.georgeNoteGivenThisRound = false;
    /** 女王等级 1：本回合还没遭遇过任何人 */
    state.queenEncounteredThisTurn = false;
    /**
     * 屏息等「持续到你的下回合结束」：上回合存的量在本回合重新挂上
     * （上一条刚把 turnLingeringPower 清零，这里再补回来）。
     */
    applyCarryPower(state);
    /** 音波感知（进化卡牌）：回合开始时按响声情况强制幸存者揭示地点 */
    applySonarReveal(state);
    state.lastSearchFound = false;
    state.pendingBlockadePlace = null;
    state.blockadesThisAction = [];
    state.pendingSealQueue = [];
    state.sealAllRoomId = null;
    /**
     * 回合开始的这条是**给双方看的公开战报**，所以雕像局里只说「雕像」——
     * 不能写「雕像1的回合」（用户要求：其他情况下都只说雕像，
     * 免得幸存者从编号推出"现在是哪一尊在行动"）。
     */
    log(state, `${k.statueIndex != null ? '雕像' : k.name} 的回合：先打任意张快速牌，再二选一（2 次移动/搜索房间，或 1 张特殊卡牌），无遭遇则进入慢速阶段。`);
    /**
     * **重现（不是"潜行结束"）**：杀手回合开始时如果还在潜行，
     * 就主动现身 → 公开所在格 → **强制搜索一次**。
     *
     * ⚠ 只有这一条路径会"重现+搜索"。**被暴露**（幸存者撞见 / 坍塌 /
     * 效果解除潜行）只把 `stealth` 设回 false，**不会搜索**。
     */
    if (k.stealth) {
        forcedRevealAndSearch(state);
        applyMurdererRevealPower(state);
        placeFirecrackerMarker(state);
        if (state.pendingLurkPick || state.pendingAmulet || state.pendingOverFearWound)
            return;
        maybeStartEncounter(state);
        if (state.encounter)
            return;
    }
    else {
        placeFirecrackerMarker(state);
    }
}

/** 这一轮还没行动过、还活着的幸存者 */
export function unactedAliveSurvivorIds(state: GameState) {
    return state.turnOrder.filter((id) => {
        const pl = state.players[id];
        return Boolean(pl?.alive && pl.faction === 'survivor' && !pl.actedThisRound);
    });
}

/** 玩家选定“下一名行动的幸存者”之后，正式开始他的回合 */
export function startPickedSurvivorTurn(state: GameState, playerId: string) {
    const p = state.players[playerId];
    if (!p)
        return;
    if (activeSurvivorId(state) === playerId && !p.actedThisRound) {
        state.pendingSurvivorPick = false;
        return;
    }
    // 还没做一般行动前可以反复换人，所以这里不标记 acted
    state.pendingSurvivorPick = false;
    const idx = state.turnOrder.indexOf(playerId);
    if (idx >= 0)
        state.activeSurvivorIndex = idx;
    beginSurvivorTurn(state, playerId);
}

/** 幸存者大回合：做完一般行动的人不能再选；没做完的可以随时换 */
export function promptOrAutoNextSurvivor(state: GameState) {
    const left = unactedAliveSurvivorIds(state);
    if (left.length === 0) {
        state.pendingSurvivorPick = false;
        /** 幸存者侧的操作提示：杀手看不到（不然能推出"他们都做完了"） */
        log(state, '所有幸存者已完成一般行动。仍可交换物品或额外行动，然后点「幸存者所有操作已结束」。', 'survivor');
        return;
    }
    /**
     * 1对3 / 2对3：三人**同时**行动，谁做完谁就结束，**不需要等别人、也不需要点选**。
     * 所以这里不进入「等待选人」状态 —— 否则一个人做完会把其他两人的操作面板挡住。
     */
    if (state.mode === 'multi' || state.mode === '2v3') {
        state.pendingSurvivorPick = false;
        log(state, `还有 ${left.length} 名幸存者未行动，可以继续行动（可同时行动）。`, 'survivor');
        return;
    }
    state.pendingSurvivorPick = true;
    /**
     * ⚠ 这是**幸存者的操作提示**，杀手不能看 ——
     * 杀手只知道"有幸存者在行动"，**不能知道轮到谁、也不能知道他们在挑人**。
     * 公开的那一条是 `startRound` 里每个大回合打一次的「幸存者正在行动」。
     */
    log(state, '点选一名幸存者开始小回合。做一般行动前可反复换人。', 'survivor');
}

export function clearNoiseAndFirecrackerTokens(state: GameState) {
    state.noises = [];
    state.firecrackerThisRound = false;
    state.firecrackerRoomId = null;
}

/**
 * 爆竹标记：杀手回合开始时放在**杀手所在格**（潜行则等重现后再放）。
 *
 * 注意区分两件事：
 *  - **判断条件**：爆竹回合「全场都有响声」—— 所以 `state.noises` 保持空，
 *    也不接受新的响声标记（`pushNoise` 会直接跳过）。按响声判定的牌
 *    （如狼人【超听觉】）会因为「到处都是响声」而**原地不动**。
 *  - **显示**：地图上只在**杀手所在位置**放一个爆竹标记（双方地图都有），
 *    图标与一般响声不同。
 */
export function placeFirecrackerMarker(state: GameState) {
    if (!state.firecrackerThisRound || state.firecrackerRoomId)
        return;
    const k = state.killerId ? state.players[state.killerId] : null;
    if (!k?.roomId || k.stealth)
        return;
    state.firecrackerRoomId = k.roomId;
    log(state, `爆竹响声标记放在「${roomName(state, k.roomId)}」（全场发出了响声！）。`, 'all', true);
}

/** 新的一轮：幸存者大回合开始前清响声/爆竹、复位手提箱，再请第一名幸存者行动 */
/**
 * 【分头行动】把行动顺序**旋转成以先手为第一**。
 *
 * 座位顺序只记一次（`splitOrderBase`），之后每次都基于它重排 ——
 * 不能拿已经旋转过的 `turnOrder` 当基准，否则会越转越乱。
 */
export function applySplitTurnOrder(state: GameState): void {
    if (!state.split) return;
    if (!state.splitOrderBase?.length) state.splitOrderBase = [...state.turnOrder];
    const base = state.splitOrderBase;
    if (!base.length) return;
    const idx = state.splitFirstId ? base.indexOf(state.splitFirstId) : -1;
    state.turnOrder = idx > 0 ? [...base.slice(idx), ...base.slice(0, idx)] : [...base];
}

/**
 * 【分头行动】先手**后移一位**（在每个大回合结束时调用一次）。
 * 只在**还活着的**幸存者里轮 —— 逃脱/被杀的会被跳过。
 */
export function advanceSplitFirst(state: GameState): void {
    const base = state.splitOrderBase?.length ? state.splitOrderBase : state.turnOrder;
    const alive = base.filter((id) => {
        const p = state.players[id];
        return Boolean(p?.alive && p.faction === 'survivor');
    });
    if (!alive.length) return;
    const cur = state.splitFirstId;
    const idx = cur ? alive.indexOf(cur) : -1;
    state.splitFirstId = alive[(idx + 1) % alive.length] ?? null;
}

/**
 * 还没确认的选择（十字弩选僵尸、乔治笔记选封堵）。
 * 正常流程里必须自己取消或确认，不能改做别的行动。
 * 这里只在新的大回合开始时清掉漏网的，免得留到下一轮。
 *
 * `playerId` 为空 = 这一轮里所有没确认的都收掉。
 */
function abandonUnconfirmedSurvivorPick(state: GameState, playerId: string | null) {
    const cb = state.pendingCrossbow;
    if (cb && (playerId == null || cb.survivorId === playerId)) {
        const name = state.players[cb.survivorId]?.name ?? '幸存者';
        state.pendingCrossbow = null;
        log(state, `${name} 收起十字弩，没有选择僵尸。`, 'survivor');
    }
    if (state.pendingGeorgeBlockade) {
        const george = Object.values(state.players).find(
            (pl) => pl.faction === 'survivor' && isGeorge(state, pl.id),
        );
        if (george && (playerId == null || george.id === playerId)) {
            state.pendingGeorgeBlockade = null;
            log(state, `${george.name} 收起「乔治的笔记」，没有拆除封堵。`, 'survivor');
        }
    }
}

/**
 * 一般行动有六种：移动、搜索物资、修理、拆除封堵、消除恐惧、特殊行动。
 * 其中一种还没确认时，不能改做别的行动。取消或确认这一件才放行。
 */
function survivorPickInProgressError(state: GameState, playerId: string, action: ClientAction): string | null {
    /**
     * 这些不是「再开一次行动」，是必须立刻回答的询问
     * （护符、弃牌、交换确认等）。不能被未确认的行动卡住。
     */
    if (action.type === 'confirmAmulet' ||
        action.type === 'discardItem' ||
        action.type === 'resolveSixthSense' ||
        action.type === 'resolveQuietSearch' ||
        action.type === 'respondTrade' ||
        action.type === 'respondCoopAction' ||
        action.type === 'guessMainStatue')
        return null;
    const cb = state.pendingCrossbow;
    if (cb && cb.survivorId === playerId) {
        if (action.type === 'confirmCrossbow' || action.type === 'cancelCrossbow')
            return null;
        return '十字弩还没确认。请先确认消灭，或取消。这期间不能做别的行动。';
    }
    if (state.pendingGeorgeBlockade) {
        const george = Object.values(state.players).find(
            (pl) => pl.faction === 'survivor' && isGeorge(state, pl.id),
        );
        if (george && george.id === playerId) {
            if (action.type === 'pickNoteBlockade' ||
                action.type === 'confirmNoteBlockade' ||
                action.type === 'cancelNoteBlockade')
                return null;
            return '乔治的笔记还没确认。请先确认拆除，或取消。这期间不能做别的行动。';
        }
    }
    const draft = state.pendingPathDraft;
    if (draft?.owner === 'survivor' && draft.actorId === playerId) {
        if (action.type === 'move' || action.type === 'finishPendingMove' || action.type === 'resetPathDraft')
            return null;
        return '幸运币的移动还没确认。请先确认，或选择留在原地。这期间不能做别的行动。';
    }
    return null;
}

export function startRound(state: GameState) {
    /** 上一轮没确认的幸存者选择不能再出现 */
    abandonUnconfirmedSurvivorPick(state, null);
    /**
     * 【变体3】新的大回合开始：重置"本回合已经推进过进度"
     * （规则：**每个大回合最多推进一个进度**）。
     */
    onPlanRoundStart(state);
    /**
     * **开局准备步骤**（都在幸存者第一个大回合开始**之前**，顺序固定）：
     *   ① 雕像：选择主雕像（**选完就锁定，之后不能再改**）
     *   ② 女猎手：布下 4 个猎手陷阱
     *   ③ 女王：由幸存者指定谁拿十字弩（这一步是**幸存者界面**，见客户端的 `crossbow-holder` 面板）
     */
    if (isStatueKiller(state) && state.statueMainLocked !== true) {
        state.phase = 'statueSetup';
        log(state, '开局准备：请雕像杀手先选择主雕像。', 'all', true);
        return;
    }
    const tp = state.pendingTrapPlacement;
    if (tp && !tp.done) {
        state.phase = 'trapSetup';
        log(state, '开局准备：请女猎手先布下 4 个猎手陷阱。', 'all', true);
        return;
    }
    /**
     * ③ 女王：**由幸存者指定谁拿十字弩** —— 也在第一个大回合开始**之前**
     * （时机和女猎手第一次布陷阱一致）。
     * 这一步是**幸存者界面**（不是杀手选），所以客户端在 `crossbowSetup` 阶段
     * 走的是幸存者视角。
     */
    if (isQueenKiller(state) && !state.crossbowAssigned) {
        state.phase = 'crossbowSetup';
        log(state, '开局准备：请幸存者指定一名角色持有十字弩。', 'all', true);
        return;
    }
    /**
     * 【变体1】特性 14「埋伏等待」：开局把杀手等级推到 2 级。
     *
     * ⚠ **顺序是用户明确要求的**：
     *   ① 开局设置先全部做完 —— 确认主雕像（`statueSetup`）、布置陷阱（`trapSetup`）、
     *      指定十字弩（`crossbowSetup`）、阴险圈套封堵（上面那段）、地图开局设定等
     *   ② **1 级效果**：各杀手 1 级都是**常驻被动/开局动作**（`EVOLUTION_TEXT` 第 1 项），
     *      由对应机制按杀手类型直接实现（不看等级），开局天然生效，不需要专门结算
     *   ③ 确认进化效果（`pendingEvolutionAck`）
     *   ④ 可以切换主雕像（雕像 1 级「每次升级首先执行」→ `pendingStatueEvoSwitch`）
     *   ⑤ 再结算 2 级效果
     *
     * 所以这一步放在开局准备的**最后**，而且走**正常升级流程** `runUpgrade` ——
     * 它内部会自己挂起 ③④，全都处理完才结算该级效果；
     * 确认完由 `pendingTraitSetupResume` 直接回到本函数继续。
     */
    if (
        state.variant1 &&
        state.killerLevel < 2 &&
        killerHasTrait(state, 'trait_k14') &&
        /**
         * ⚠ **排在下面「阴险圈套」之后**：13 也是"开局设置"（要选 2 个地点封堵），
         * 用户要求的顺序是「开局设置全做完 → 1 级效果 → 升到 2 级」。
         * 13 处理完会把这个计数归零，那时这一条才放行。
         */
        state.pendingTraitBlockades <= 0
    ) {
        /**
         * ⚠ 走**统一入口**：墓穴地图下 `runUpgrade` 第一次只会记下"确认之后要坍塌"
         * （等级不涨、确认面板也不挂），必须补跑一次 —— 见 `upgradeKillerWithCollapse`。
         */
        upgradeKillerWithCollapse(state);
        if (
            state.pendingEvolutionAck ||
            state.pendingStatueEvoSwitch ||
            state.pendingEvolutionCardPick ||
            state.pendingUnlockChoice ||
            state.pendingQueenSpawnRooms
        ) {
            /** 停下来等杀手确认新效果（/切换主雕像），确认完会再回到这里 */
            state.pendingTraitSetupResume = true;
            state.phase = 'upkeep';
            return;
        }
    }
    /**
     * 【变体1】特性 13「阴险圈套」：开局准备 —— 杀手先选要封堵的地点（共 2 个，可分开）。
     *
     * 复用现成的「任选门封堵」作业（进化 4 级也是这套 `startAnyDoorsBlockade`）：
     * 挂上 job 之后杀手点地图选地点、再在行动区确认。
     * ⚠ 这里把 `pendingTraitBlockades` 归零 —— **只挂一次**，还差几个由 job 自己记
     * （否则每轮 `startRound` 都会重新挂一遍，永远开不了局）。
     *
     * ⚠ **它属于"开局设置"，必须排在「14 升级」之前**（用户顺序：
     * 开局设置全做完 → 1 级效果 → 升到 2 级）；14 那边用
     * `pendingTraitBlockades <= 0` 当闸门，所以这里一旦归零，14 才会执行。
     */
    if (state.variant1 && state.pendingTraitBlockades > 0) {
        const want = state.pendingTraitBlockades;
        state.pendingTraitBlockades = 0;
        if (startAnyDoorsBlockade(state, want)) {
            state.phase = 'killerMain';
            /**
             * 标记"开局流程正挂起"：两扇门都封完之后，
             * `confirmEvoBlockade` 会据此**直接回到 `startRound`**（继续 14 的升级等）。
             */
            state.pendingTraitSetupResume = true;
            log(state, `开局准备：请杀手选地点放置「阴险圈套」的封堵标记（共 ${want} 个，可在不同地点）。`, 'all', true);
            return;
        }
        log(state, '「阴险圈套」：场上没有可以封堵的门，跳过。', 'all', true);
    }
    /**
     * 【分头行动】**先手轮转**：
     *  - **第一个大回合**用开局前选定的先手（没选就按座位第一个）
     *  - 之后每个大回合开始，先手**往后移一位**（在还活着的幸存者里）
     *
     * 然后把 `turnOrder` 旋转成"先手在最前" —— 这样**行动推进**
     * （`promptOrAutoNextSurvivor`）和**发现牌归属**（`enterDiscovery` 取
     * `turnOrder` 里第一个活人）自动全都跟着走，不用改两处逻辑。
     */
    if (state.split) {
        /**
         * ⚠ **先判逃脱、再轮转先手**：逃脱的人 `alive = false`，
         * 后面 `advanceSplitFirst` 里的"只算活人"就会自动跳过他们。
         */
        checkSplitEscapes(state);
        if (state.phase === 'gameOver')
            return;
        if (state.round > 0) advanceSplitFirst(state);
        applySplitTurnOrder(state);
    }
    state.round += 1;
    /**
     * 【变体3】**幸存者回合开始时**的两条获胜条件（火箭發射器 / 被封印的傳送門）。
     * 放在 `round += 1` 之后：那时候"上一回合的遭遇计数"还在（这一函数读完会归零）。
     */
    if (checkPlanRoundStartWins(state))
        return;
    /**
     * **警车推进**（用户规则）：
     *  - 修理完成时已经**立即**放到 `rescueWaitRounds`（见 `maybeArmRescue`）
     *  - 之后每个**幸存者大回合开始**开一格
     *  - **回合开始时它已经在位置 1**（也就是"这次移动之前"）→ 幸存者直接胜利
     *
     * 所以从修理完成算起正好等 5 个幸存者大回合。
     */
    if (state.rescueArmed && state.rescueCountdown != null && state.rescueCountdown > 0) {
        if (state.rescueCountdown <= 1) {
            log(state, '幸存者大回合开始时警车已经在出口（1）—— 幸存者胜利！', 'all', true);
            state.rescueCountdown = 0;
            checkSurvivorWin(state);
            if (state.phase === 'gameOver')
                return;
        }
        else {
            state.rescueCountdown -= 1;
            log(state, `新回合开始：警车开到 ${state.rescueCountdown}。`, 'all', true);
        }
    }
    /**
     * **幸存者获胜的判定统一放在这里**（用户口径）：
     * 「幸存者**收集钥匙**胜利的检测应该在**幸存者大回合开始时**，
     *   **警车到 0** 也是大回合开始时检测」、「**隐藏出口**也一起挪到大回合开始」。
     *
     * ⚠ 所以**动作之后不要再调 `checkSurvivorWin`** —— 那些调用点（搜索后 / 修理后 /
     * 移动后…，以前有 31 处）已经全部删掉。凑齐钥匙的那一刻不会马上赢，
     * 要等**下一个幸存者大回合开始**才结算（和警车同一条时间线）。
     */
    checkSurvivorWin(state);
    if (state.phase === 'gameOver')
        return;
    clearNoiseAndFirecrackerTokens(state);
    /**
     * 女猎手捕网：**到"此轮结束"才解除**
     * （一轮 = 幸存者大回合 + 2对3 的两名杀手回合）。
     *
     * ⚠ 顺序：**先 `round += 1` 再筛**。
     * `settleNetTrapsOnNewRound` 保留 `l.round >= state.round` 的锁 ——
     * 第 N 轮布下的锁 `round = N`，推进到 N+1 后 `N < N+1` 被清掉；
     * 新一轮布的锁 `round = N+1` 会留下。顺序反了会把刚布的锁一起清掉。
     *
     * 1 杀手与 2对3 都走这里：两者都满足"所有杀手回合结束后才结算"。
     */
    settleNetTrapsOnNewRound(state);
    /**
     * **【墓穴 R6】遗物标记在每个"幸存者大回合"开始时翻回正面**
     * —— 和手提箱 `suitcaseAvailable` 同一套"每大回合一次"的逻辑。
     */
    onCryptSurvivorRoundStart(state);
    state.suitcaseAvailable = true;
    state.repairedThisPhase = false;
    state.senseHighlight = null;
    for (const pl of Object.values(state.players)) {
        pl.overFear = false;
        if (pl.faction === 'survivor')
            pl.actedThisRound = false;
        /** 扼杀者：核心标记的移除每大回合限一次 */
        pl.coreRemovedThisRound = false;
        /**
         * 停滞的边界是**大回合**，所以这三个标记在这里（大回合开始）复位，
         * 而不是在每个小回合开始复位。
         */
        pl.extraActionUsedThisTurn = false;
        pl.tradedThisTurn = false;
        pl.haltedThisRound = false;
        /** 【变体1】"每轮一次"的特性卡（16 敏锐感知）跟着大回合复位 */
        state.traitUsedThisRound = [];
        state.pendingSenseTraits = false;
        state.pendingSenseWitnessed = [];
        /**
         * 雕像停滞只持续「上一个杀手回合」：
         * 新大回合开始时清掉，雕像恢复正常的移动/搜索。
         */
        if (pl.statueIndex != null)
            pl.statueHalted = false;
    }
    state.phase = 'survivorMain';
    state.activeSurvivorIndex = 0;
    /**
     * **幸存者大回合里，杀手唯一该看到的常规战报**：只有这一条。
     * 每个大回合只打一次 —— 每次换人都打的话，杀手能靠条数推出换了几个人。
     */
    log(state, `幸存者正在行动（第 ${state.round} 回合）。`, 'all');
    /**
     * 1对3：三人**同时**行动，不经过「点选自己的角色」这一步，
     * 所以这里要一次性把所有人的小回合资源（移动力 / mainActionUsed / 搜索标记…）都准备好。
     * 共享控制模式不这么做 —— 那种模式是一次只让一名行动，靠点选来开始小回合。
     */
    if (state.mode === 'multi' || state.mode === '2v3') {
        for (const pl of Object.values(state.players)) {
            if (pl.faction === 'survivor' && pl.alive)
                beginSurvivorTurn(state, pl.id);
        }
    }
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
export function initPiece(state: GameState, content: GameContent, p: PlayerState) {
    const ch = content.characters.find((c) => c.id === p.characterId);
    if (!ch || ch.faction !== p.faction)
        throw new Error(`${p.name} 的角色无效`);
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
    /** 迪伦·温「坚毅」：开局拿一个坚毅标记 */
    if (p.faction === 'survivor') {
        const sk = ch.skills.some((s) => s.id === 'resilient');
        p.resilienceToken = Boolean(sk);
        if (sk) {
            /**
             * ⚠ **只给幸存者看**（用户口径）。
             *
             * 坚毅标记是迪伦自己的**私密标记** —— 快照里 `hasResilienceToken`
             * 对杀手恒为 `false`（`engine.ts:12021`），界面上也不给杀手画。
             * 这条开局战报以前走默认可见性（非幸存者私有阶段 → `'all'`），
             * 于是**只有战报漏了底**：杀手一开局就知道迪伦身上有免伤标记。
             *
             * 口径和鼓励标记一致（`useEncourage` 那条也是 `'survivor'`）：
             * **谁有标记不给杀手看；标记"触发"的那一刻才明确告诉他**
             * （见 `effects.ts` 的 `坚毅标记自动生效，防止了这次伤害`）。
             */
            log(state, `${p.name} 开局获得一个坚毅标记（可防止第一次伤害）。`, 'survivor');
        }
    }
    if (p.faction === 'survivor') {
        const startItems = startingItemsFor(ch.id, ch.name);
        p.items = { ...startItems };
        /**
         * 凯莱布「幸运币」：开局拥有幸运币（额外行动）。
         * 注意必须放在 `p.items = {...}` **之后**，否则会被覆盖掉。
         */
        if (ch.skills.some((s) => s.id === 'lucky_coin')) {
            p.items.lucky_coin = (p.items.lucky_coin ?? 0) + 1;
            log(state, `${p.name} 开局获得凯莱布的幸运币。`);
        }
        if (Object.keys(startItems).length) {
            const names: Record<string, string> = {
                sophia_camera: '索菲亚的相机',
                marco_medkit: '马尔科的医药包',
            };
            log(state, `${p.name} 开局带上了 ${Object.keys(startItems).map((id) => names[id] ?? id).join('、')}。`);
        }
    }
    if (p.faction === 'survivor')
        p.roomId = state.map.survivorStartRoomId;
    if (p.faction === 'killer') {
        p.roomId = state.map.killerStartRoomId;
        p.statueIndex = null;
        p.statueHalted = false;
    }
    applyPassiveBonuses(state, p.id);
}

/**
 * **按杀手逐个**做开局设定：牌库、锁定牌、力量、起始手牌。
 *
 * 为什么要有这个函数：`finishStartCommon` 里那段共用流程只认顶层字段，
 * 而顶层只够装**一个**杀手。1 杀手模式走一遍就行；
 * 2v3 要两个杀手各来一遍 —— 每人一套自己的牌组。
 *
 * `killerId` 是**原先那个杀手棋子**（`xxx__killer`）。
 * 雕像杀手会在这一步里被拆成 4 个雕像棋子，
 * 牌组挂到**主雕像**（`state.killerId` 之后指向的那条）名下 ——
 * 和改动前一样：雕像局只有主雕像有手牌，另外 3 尊共用同一套。
 *
 * `skip` = true 时只做"把顶层镜像切到这个棋子"这一件事，
 * 不再单独发一套牌（雕像的 2/3/4 号走这条路）。
 */
function setupKillerOpeningHand(
    state: GameState,
    content: GameContent,
    killerId: string,
    skip = false,
): void {
    const kp = state.players[killerId];
    const killerCh = content.characters.find((c) => c.id === kp?.characterId);

    /** 让 `isStatueKiller` / `killerKindOf` 这类靠 killerId 判定的函数认对当前这个杀手 */
    state.killerId = killerId;

    if (skip) {
        /**
         * 雕像 2/3/4 号：它们和主雕像**共用一套牌**（改动前的行为），
         * 所以不给它们单独建档，只把镜像切过去。
         */
        return;
    }

    const power = killerCh?.startingPower ?? state.rules.killerPowerStart;

    /** ① 按他的角色组牌库（顶层字段现在装的就是**他**这一套） */
    const owned = content.cards.killerAction.filter((c) => {
        if (c.owner)
            return c.owner === killerCh?.id || c.owner === killerCh?.name;
        return false;
    });
    const pool = owned.length ? owned : content.cards.killerAction.filter((c) => !c.owner);
    const lockedCards = pool.filter((c) => c.locked);
    state.killerPower = power;
    state.killerDeck = shuffle(pool.filter((c) => !c.locked).map((c) => c.id));
    state.killerLocked = lockedCards.map((c) => c.id);
    state.killerDiscard = [];
    state.killerHand = [];
    if (lockedCards.length) {
        log(state, `${killerCh?.name ?? '杀手'}的锁定牌未洗入摸牌堆：${lockedCards.map((c) => c.name).join('、')}。`);
    }

    /** ③ 发起始手牌 */
    drawKillerCards(state, state.rules.killerStartingHand ?? 2);

    /**
     * ④ 雕像：把「杀手」拆成 4 个雕像棋子，并把 killerId 指到 1 号（默认主雕像）。
     *
     * **必须在建档之前**：这一步会把 `state.killerId` 从原始棋子改成主雕像，
     * 牌组要落在**主雕像**名下（4 尊雕像共用它）。
     * 否则切片会挂在原始棋子 `xxx__killer` 上，之后没人取得到。
     */
    if (isStatueKiller(state)) {
        setupStatues(state, kp);
        log(state, `${killerCh?.name ?? '杀手'}是 4 个独立棋子：1、2 号在主要出口，3、4 号在隐藏出口。`);
        /** 原始棋子已经没用了，别再留它那份空切片 */
        delete state.killers[killerId];
    }
    /**
     * ⑤ 建档：把顶层这一套牌归到**当前 killerId 指向的那个棋子**名下。
     * 雕像局这里就是主雕像（`xxx__statue1`），4 尊雕像共用它。
     *
     * 用 `loadKillerToMirror` 而不是 `claimKillerGlobalsFor` ——
     * 前者在切片不存在时**按顶层现有内容补一份**（不清空），正是这里要的。
     */
    loadKillerToMirror(state, state.killerId!);

    /**
     * ⑥ **角色专属的开局资源**：必须在这个杀手"名下"做。
     *
     * ⚠ 以前这些写在 `finishStartCommon` 循环之后，用 `isQueenKiller(state)` 判断 ——
     * 那时 `state.killerId` 已经是**最后一个杀手**，2对3 里会认错人
     * （表现：女王 + 扼杀者时女王的开局僵尸不生成）。
     */
    setupKillerRoleResources(state, content, killerCh);
}

/**
 * 某个杀手的**角色专属开局资源**。调用时 `state.killerId` 必须正是他。
 *
 * 这些资源目前在地图上是共享的（只有一份宝藏牌堆 / 一套陷阱 / 一个核心标记池），
 * 所以 2对3 里两种专属杀手同时出现时按"各自设一次"处理 ——
 * 后设的会覆盖前设的，这是当前引擎的边界（规则上也很少这么组队）。
 */
function setupKillerRoleResources(
    state: GameState,
    content: GameContent,
    killerCh: { id: string; name: string } | undefined,
): void {
    /** 狼人：建立宝藏牌堆（3 银质匕首 + 1 银质子弹） */
    if (isWerewolfKiller(state)) {
        setupTreasure(state, content.cards);
    }
    /** 女猎手：秘密布下 4 个猎手陷阱（2 捕网 / 1 白骨 / 1 捕熊） */
    if (isHuntressKiller(state)) {
        state.hunterTraps = {};
        state.netLocks = [];
        setupHunterTraps(state);
    }
    /** 扼杀者：在起始地点放 1 个核心标记（另有 4 个备用） */
    setupCoreMarkers(state);
    /** 未命名：4 张进化卡牌作为候选池（等级 2 / 4 各挑 1 张） */
    state.unEvolutionPool = content.cards.evolutionCard
        .filter((c) => c.owner === killerCh?.id)
        .map((c) => c.id);
    state.chosenEvolutionCards = [];
    state.pendingEvolutionCardPick = null;
    /**
     * 女王：开局摊有**一副十字弩**，但**先不发给任何人** ——
     * 进入游戏后在幸存者行动区指定持有者（见 `pickCrossbowHolder`）。
     */
    if (isQueenKiller(state)) {
        state.crossbowHolderId = null;
        state.crossbowAssigned = false;
        log(state, '面对女王：有一副十字弩。请在幸存者行动区指定由谁持有。', 'all', true);
        /** 女王开局：在隐藏出口放 2 个僵尸 */
        const exit = state.map.rooms.find((r) => (r.tags ?? []).includes('hiddenExit'));
        if (exit) {
            state.zombies = [];
            spawnZombieAt(state, exit.id);
            spawnZombieAt(state, exit.id);
            log(state, `女王开局：在隐藏出口「${roomName(state, exit.id)}」放置 2 个僵尸。`, 'all', true);
        }
        else {
            state.zombies = [];
        }
    }
    /** 没人是雕像时，清掉上一局残留的雕像棋子 —— 这件事放在 `finishStartCommon` 里做，
     *  因为它是"全局限一次"的，不能在每个杀手名下各跑一遍（第二个杀手会把雕像删掉）。 */
}

/**
 * 雕像杀手：建 4 个雕像棋子。
 * 立绘 1、2 放「主要出口」（幸存者起点），3、4 放「隐藏出口」（杀手起点）。
 * 每个雕像都是 faction='killer' 的棋子，但只有主雕像会被 state.killerId 指向。
 */
export function setupStatues(state: GameState, killerPiece: PlayerState) {
    // 先把上一次可能残留的雕像棋子清掉（换杀手重开、重赛同一房间）
    for (const id of state.statueIds ?? [])
        delete state.players[id];
    state.statueIds = [];
    state.pendingStatueSwitch = null;
    state.pendingStatueRally = false;
    state.pendingStatueRallySwitched = false;
    state.pendingStatueRallyMoveBlockade = false;
    state.pendingStatueMovedBlockadeFrom = null;
    state.pendingStatueSeal = false;
    state.pendingStatueSealFrom = null;
    state.pendingStatueMoveQueue = [];
    state.pendingStatueSearchQueue = [];
    state.pendingStatueStepId = null;
    state.statueReleaseSearchesAfter = false;
    state.statueSiegeSearchesAfter = false;
    state.statueEncounterRoom = null;
    state.statueGuesses = {};
    const mainRoom = state.map.survivorStartRoomId;
    const hiddenRoom = state.map.killerStartRoomId;
    for (let i = 1; i <= 4; i++) {
        const id = `${killerPiece.id}__statue${i}`;
        const piece = createPlayer(id, `${killerPiece.name} ${i}`, killerPiece.controllerId);
        piece.faction = 'killer';
        piece.characterId = killerPiece.characterId;
        piece.connected = false; // 不算独立操控者，避免多出座位
        piece.statueIndex = i;
        piece.roomId = i <= 2 ? mainRoom : hiddenRoom;
        state.players[id] = piece;
        state.statueIds.push(id);
    }
    // 主雕像默认 = 1 号，并把杀手状态搬过去
    state.killerId = state.statueIds[0];
    /**
     * **把原始棋子藏起来**（用户口径：「主雕像就代表原始棋子，或者在雕像局
     * 把这个原始棋子隐藏」）：位置清空 → 它不再算"杀手在此"、不画立绘，
     * 幸存者视角就只剩 4 尊雕像。
     *
     * ⚠ 只动**传进来的这个杀手**的棋子 —— 2v3 里另一名杀手的原始棋子
     * 没有自己的雕像替身，位置照旧。
     */
    if (isStatueGhostPiece(state, killerPiece)) killerPiece.roomId = null;
}

/**
 * 女王「抓住他們！」：让**一个僵尸**〔搜索〕。
 *
 * 僵尸搜索和杀手搜索同一套判定：那个地点有幸存者就开战
 * （复用 `statueEncounterRoom` 那套「指定开战房间」机制）。
 * 没搜到人就只写战报。
 */
export function searchAsZombie(state: GameState, roomId: string) {
    const here = survivorsInRoom(state, roomId);
    const found = here.length > 0;
    state.lastSearchFound = found;
    state.statueEncounterRoom = roomId;
    log(state, found
        ? `僵尸搜索「${roomName(state, roomId)}」，发现了 ${here.map((s) => s.name).join('、')}！`
        : `僵尸搜索「${roomName(state, roomId)}」，没有发现人。`, 'all', true);
    maybeStartEncounter(state);
}

/**
 * 当幸存者倒下时清掉中毒标记。
 *
 * 【分头行动】额外两条用户规则（**用户拍板：升级判定不看死因**）：
 *  - **只要死人了就升级** —— 不管是杀手亲手杀的，还是猎手陷阱、坍塌、
 *    任何"意外死亡"；2v3 里 `runUpgrade` 会让**两名杀手各升一级**。
 *  - **全员逃脱或被杀死才结束** —— 倒下之后检查一次收尾结算。
 */
export function onSurvivorDown(state: GameState, survivorId: string) {
    clearPoisonOnDeath(state, survivorId);
    if (!state.split)
        return;
    /** 已经 5 级了就不再喊"进化一级"（`runUpgrade` 到顶会直接返回） */
    if (state.killerLevel < 5)
        log(state, '有一名幸存者倒下，**杀手进化一级**（分头行动：死人就升级，不看死因）。', 'all', true);
    /** ⚠ 统一入口：墓穴下要补跑一次才会挂出确认面板（分头行动也可能在墓穴里死人） */
    upgradeKillerWithCollapse(state);
    /** ⚠ 顺序：先升级、再判收尾 —— 这样"最后一个被杀"时等级也照样记上 */
    checkSplitEnd(state);
}

/**
 * 把 4 个雕像的位置/停滞/猜测整理进快照
 */
export function statueView(
    state: GameState,
    viewerFaction: Faction,
): Array<{
    id: string;
    index: number;
    roomId: string | null;
    main: boolean;
    halted: boolean;
    /** 猜过这尊雕像的**操控者颜色槽位**（只有幸存者视角才有） */
    guesserSlots?: number[];
}> {
    if (!state.statueIds?.length)
        return [];
    return statuePieces(state).map((p) => {
        const row: {
            id: string;
            index: number;
            roomId: string | null;
            main: boolean;
            halted: boolean;
            guesserSlots?: number[];
        } = {
            id: p.id,
            index: p.statueIndex ?? 0,
            roomId: p.roomId,
            main: p.id === state.killerId,
            halted: p.statueHalted,
        };
        // 猜测只有幸存者之间可见（杀手看不到）
        if (viewerFaction === 'survivor') {
            /**
             * 下发的**不是**"谁猜的"，而是他占的**颜色槽位** ——
             * 用户要求 1对2 里两个人的猜测"区分不同颜色"，
             * 而客户端只认槽位就能取到和座位一致的颜色（`cursorColor(slot)`）。
             */
            const slots = survivorOperatorSlots(state);
            row.guesserSlots = Object.entries(state.statueGuesses ?? {})
                .filter(([, sid]) => sid === p.id)
                .map(([controllerId]) => slots.get(controllerId) ?? 0)
                .sort((a, b) => a - b);
        }
        return row;
    });
}

/**
 * **幸存者操控者 → 颜色槽位**（按行动顺序去重，从 0 开始）。
 *
 * 用户对"猜主雕像"的规则是**按人算，不按棋子算**：
 *  - 单人 / 1对1：幸存者方只有 1 个操控者（管 3 个棋子）→ **只能猜 1 个**
 *  - 1对2：2 个操控者 → **各猜 1 个**，用不同颜色区分
 *  - 1对3 / 2对3：3 个幸存者各控各的 → **各猜各的**（3 个）
 *
 * `state.statueGuesses` 就是按这个表的键（controllerId）记的，
 * 所以槽位数自然就等于"能猜几个"。
 */
export function survivorOperatorSlots(state: GameState): Map<string, number> {
    const slots = new Map<string, number>();
    const order = state.turnOrder?.length
        ? state.turnOrder
        : Object.values(state.players).filter((p) => p.faction === 'survivor').map((p) => p.id);
    for (const id of order) {
        const p = state.players[id];
        if (!p || p.faction !== 'survivor') continue;
        if (!slots.has(p.controllerId)) slots.set(p.controllerId, slots.size);
    }
    return slots;
}

/**
 * 【替换「鸿运当骰」等牌】：开启时搜索牌堆里的
 * 1 个手斧 / 1 瓶威士忌酒瓶 / 1 张石灰粉 换成 鸿运当骰 / 煤油灯 / 神秘包裹。
 * 关闭时这三张替换牌不进牌堆（钥匙不受影响）。
 */
export function applyReplacementDeck(state: GameState, search: CardDef[]) {
    const base = search.filter((c) => !REPLACEMENT_CARD_IDS.includes(c.id));
    if (!state.replacementDeck)
        return base;
    /** 按牌 id 替换（每 id 只换一张），换掉的牌不进搜索牌堆 */
    const pairs = [
        ['sk_axe', 'sk_lamp'],
        ['sk_whiskey', 'sk_parcel'],
        ['sk_lime', 'sk_lucky_dice'],
    ];
    const out = [...base];
    for (const [fromId, toId] of pairs) {
        const to = state.cardById[toId];
        if (!to)
            continue;
        const i = out.findIndex((c) => c.id === fromId);
        if (i < 0)
            continue;
        out[i] = to;
    }
    return out;
}

export function finishStartCommon(state: GameState, content: GameContent) {
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
    state.trapPartRooms = [];
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
    state.pendingGeorgeNote = false;
    state.pendingPathDraft = null;
    state.pendingSenseColorPick = null;
    state.rematchReady = [];
    /** 【变体1】每局重新记：谁要跳过首个回合、还有几扇门要封 */
    state.killerSkipFirstTurn = [];
    state.pendingTraitBlockades = 0;
    state.pendingTraitSetupResume = false;
    state.pendingTraitDiscard = 0;
    state.pendingTraitDiscardFrom = null;
    state.pendingSenseTraits = false;
    state.pendingSenseWitnessed = [];
    state.traitUsedThisRound = [];
    state.discoveryKeepBoth = false;
    state.pendingHeroicBlock = null;
    state.pendingPreyOffer = false;
    Object.assign(state, emptyEvolutionFields());
    state.searchDeck = buildSearchDeck(applyReplacementDeck(state, content.cards.search));
    state.searchDiscard = [];
    state.discoveryDeck = shuffle(content.cards.discovery.map((c) => c.id));
    state.discoveryDiscard = [];
    state.survivorDiscard = [];
    /** 乔治的笔记：3 张各 1 份，开局全部可用（没有乔治就空着） */
    state.notesDeck = content.cards.note.map((c) => c.id);
    state.pendingGeorgeNote = false;

    /**
     * **每个杀手各设一套开局牌组**（1 杀手模式只有一个，行为与改动前一致）。
     *
     * 注意顺序：雕像杀手会在这一步里被拆成 4 个雕像棋子，
     * 所以先按"原始杀手棋子"设牌组（雕像的牌组挂在主雕像名下），
     * 再把这些雕像棋子补进 `killerIds` 并让它们**共用主雕像那套牌**。
     */
    for (const kid of Object.values(state.players)
        .filter((pl) => pl.faction === 'killer')
        .map((pl) => pl.id)
        .sort())
        setupKillerOpeningHand(state, content, kid);
    /**
     * **参与行动的杀手棋子**：雕像只算一个（主雕像），
     * 否则 4 个雕像棋子会因为共享切片而被重复结算（比如进化一次涨 4 级）。
     */
    state.killerIds = killerTurnPieceIds(state);
    /**
     * 雕像的 4 个棋子**共用同一份切片**（改动前就是"只有主雕像有手牌"）：
     * 2/3/4 号直接引用主雕像那份，这样切主雕像时牌库/手牌不会跟着换一套。
     *
     * ⚠ 权威必须是 `statueIds[0]` —— **不能**用 `state.killerId`：
     * 上面那个循环会把 `killerId` 逐个改过去，跑完之后它指的是**最后一个杀手**
     * （2对3 里就是另一名杀手），那样会把雕像全指向别人的切片。
     */
    const statueMain = state.statueIds?.[0];
    if (statueMain && state.killers[statueMain]) {
        for (const sid of state.statueIds ?? []) {
            if (sid === statueMain) continue;
            state.killers[sid] = state.killers[statueMain]!;
        }
    }
    const hasStatueKiller = state.killerIds.some((kid) =>
        isStatueKiller(state, kid));
    if (!hasStatueKiller) {
        for (const id of state.statueIds ?? [])
            delete state.players[id];
        state.statueIds = [];
        state.pendingStatueSwitch = null;
        state.pendingStatueMoveQueue = [];
        state.pendingStatueSearchQueue = [];
        state.pendingStatueStepId = null;
        state.statueGuesses = {};
    }
    /**
     * 狼人宝藏 / 女猎手陷阱 / 女王僵尸 / 十字弩 / 未命名进化池 ——
     * 这些**都在 `setupKillerOpeningHand` 里按杀手逐个设好了**
     * （那里 `state.killerId` 正是该杀手本人；放在这里会被"最后一个杀手"的身份判错）。
     * 这里只把"本局没有对应杀手时该为空"的资源兜底清一次。
     */
    if (!isWerewolfKiller(state)) {
        state.treasureDeck = [];
        state.treasureDiscard = [];
        state.treasureChests = {};
    }
    if (!isHuntressKiller(state)) {
        state.hunterTraps = {};
        state.netLocks = [];
    }
    /**
     * **地图特殊规则的开局设定**（实验室急救箱 + 预置封堵、城堡机关大门复位…）。
     * 必须在 `startRound` 之前 —— 预置封堵要在第 1 轮就出现在地图上。
     */
    setupMapSpecials(state);
    /**
     * **【墓穴 R6 遺物室】**：建遗物牌堆 + 标记翻到正面。
     * 同样必须在 `startRound` 之前（第 1 轮就要能抽）。
     */
    state.collapsedRooms = [];
    state.pendingCollapse = false;
    state.pendingCollapseLevel = 0;
    state.pendingCollapseMoves = null;
    setupRelicRoom(state, (content.cards.relic ?? []).map((c) => c.id));
    state.round = 0;
    /**
     * 【变体3】计划卡：**排在其它同时机的动作之后**给幸存者方发 2 张
     * （用户口径："游戏开始时，排在其它同时机的动作之后"）。
     * 必须在 `startRound` 之前 —— 第 1 个幸存者大回合就可能要选计划。
     */
    setupPlanCards(state, content);
    /** 把镜像切回当前行动的那个杀手，紧接着 `startRound` 要用它的状态 */
    if (state.killerId && state.killers[state.killerId])
        loadKillerToMirror(state, state.killerId);
    /**
     * 【变体1】特性卡：先让所有人选完牌，选完才真正开始第 1 回合。
     * `beginTraitDraft` 返回 true = 挂起等选牌（`pickTrait` 选完之后会回调
     * `setTraitDraftDoneHandler` 注册的那个函数，也就是这里这行 `startRound`）。
     */
    if (beginTraitDraft(state, content)) {
        state.phase = 'traitDraft';
        return;
    }
    startRound(state);
}

/** 【变体1】`traits.ts` 选完特性后回调这里 —— 正式开局 */
setTraitDraftDoneHandler((state: GameState) => {
    state.phase = 'survivorMain';
    startRound(state);
});
setTraitSetupHandler((state: GameState) => applyVariant1Setup(state));
/**
 * 【变体3】把"某条计划能力现在生效吗"注入给 `effects.ts`
 * （那边要判"修理不响 / 额外修理标记"，但不能反过来 import `plans.ts`）。
 */
setPlanImplChecker((state, impl) => planHasImpl(state, impl));
/**
 * 【变体3】**计划能力的具体效果**。
 *
 * `plans.ts` 只做"通用部分"（扣代价、记"用过了"、按 `mapMarker` 放标记、写一条战报），
 * 具体做什么由这里按 `impl` 分派 —— 因为只有 engine 认识修理 / 搜索牌库 / 钥匙 / 中毒
 * / 遭遇 / 胜负这一套。
 *
 * ⚠ 这里**尽量不抛错**：`applyPlanAbility` 已经先把代价扣掉了，抛错会让"付了钱没效果"。
 * 条件不满足就写一条战报说明。
 */
setPlanAbilityEffectHandler((state, plan, index, actorId, target) => {
    const ab = plan.abilities[index];
    if (!ab)
        return;
    const actor = actorId ? state.players[actorId] : null;
    const who = actor?.name ?? '幸存者';
    switch (ab.impl) {
        /**
         * 蜂鳴器 ① / 爆炸陷阱 ①：在**你的地点**放置计划标记。
         * 标记已经由 `plans.ts` 的通用部分按 `mapMarker` 放好了，这里不用重复做。
         */
        case 'placePlanMarker':
            break;
        /** 蜂鳴器 ②：**在带有计划标记的地点**发出响声（不限次数） */
        case 'noiseOnPlanMarker': {
            if (!actor?.roomId) {
                log(state, '【变体3】蜂鳴器：你不在任何地点，发不出响声。', 'survivor');
                break;
            }
            if (!planMarkersAt(state, actor.roomId)) {
                log(state, `【变体3】蜂鳴器：你所在的「${roomName(state, actor.roomId)}」没有计划标记。`, 'survivor');
                break;
            }
            pushNoise(state, actor.roomId, false, { byPlayerId: actor.id, source: 'item' });
            /**
             * ⚠ **计划的事永远不写进杀手战报**（用户口径：「计划能力之类永远不告诉杀手，
             * 只有在游戏因此胜利时告诉杀手原因」）—— 响声本身杀手在响声阶段看得到，
             * 但"这是计划能力弄出来的"只有幸存者知道。
             */
            log(state, `【变体3】${who} 在带计划标记的「${roomName(state, actor.roomId)}」发出响声（响声双方都听得到，但原因只说给幸存者）。`, 'survivor');
            break;
        }
        /** 自製無線電：**立刻完成修理**，并在你的地点发出响声 */
        case 'finishRepairNow': {
            const before = state.repairProgress;
            if (before >= state.rules.repairNeeded) {
                log(state, '【变体3】自製無線電：无线电已经修好了。', 'survivor');
                break;
            }
            addRepairProgress(state, state.rules.repairNeeded);
            announceRepairIfJustFinished(state, before);
            maybeArmRescue(state);
            if (actor?.roomId)
                pushNoise(state, actor.roomId, false, { byPlayerId: actor.id, source: 'item' });
            /**
             * ⚠ 计划战报只给幸存者（用户口径）。
             * 「修理完成 / 警车倒数」那几条是**游戏状态变化**，照旧双方都发
             * （`announceRepairIfJustFinished` / `maybeArmRescue` 自己会写）。
             */
            log(state, `【变体3】自製無線電：修理进度直接拉满（${state.repairProgress}/${state.rules.repairNeeded}），并在「${actor?.roomId ? roomName(state, actor.roomId) : '?'}」发出响声。`, 'survivor');
            break;
        }
        /** 萬能鑰匙：从**线索（搜索）牌库底部**取出钥匙 */
        case 'spendToolboxForKey': {
            const deck = state.searchDeck ?? [];
            let idx = -1;
            for (let i = deck.length - 1; i >= 0; i -= 1) {
                const card = state.cardById[deck[i]!];
                if (card && isKeyCard(card)) {
                    idx = i;
                    break;
                }
            }
            if (idx < 0) {
                log(state, '【变体3】萬能鑰匙：线索牌库里已经没有钥匙了。', 'survivor');
                break;
            }
            const [cardId] = state.searchDeck.splice(idx, 1);
            const added = addKeys(state, 1, actor?.id);
            log(
                state,
                `【变体3】萬能鑰匙：${who} 从线索牌库底部取出「${state.cardById[cardId!]?.name ?? cardId}」——` +
                    (state.split
                        ? `钥匙由他单独保管（共 ${actor?.keys ?? 0} 把）。`
                        : `钥匙上架（${state.keysCollected}/${state.rules.keysNeeded}，本次 +${added}）。`),
                'survivor',
            );
            break;
        }
        /** 古代箱子：从搜索牌库抽 3 张（代价"弃一个古代护符"已由通用部分扣掉） */
        case 'spendAmuletDraw3': {
            if (!actor) {
                log(state, '【变体3】古代箱子：找不到发动者。', 'survivor');
                break;
            }
            for (let i = 0; i < 3; i += 1)
                planDrawSearchCard(state, actor, '古代箱子');
            break;
        }
        /** 反擊！暗中伏擊：**完成计划时**立刻在幸存者地点放置计划标记 */
        case 'placePlanMarkerAtSurvivors': {
            const rooms = [...new Set(aliveSurvivorsOf(state).map((s) => s.roomId!).filter(Boolean))];
            if (!rooms.length) {
                log(state, '【变体3】暗中伏擊：场上没有幸存者，放不了计划标记。', 'survivor');
                break;
            }
            for (const roomId of rooms) addPlanMarker(state, roomId);
            log(
                state,
                `【变体3】暗中伏擊：在 ${rooms.map((r) => `「${roomName(state, r)}」`).join('、')} 放置了计划标记。`,
                'survivor',
            );
            break;
        }
        /**
         * 現場研究：**額外行動：【移動】×2**。
         *
         * 「額外行動」= 不占这个幸存者的一般行动名额 —— 我们这边的一般行动名额
         * 是靠 `mainActionUsed` / 行动类型按钮控制的，所以直接给**本小回合
         * 移动力 +2**（客户端可达范围 `legalMoves` 是按 `moveLeft` 算的，会自动跟上）。
         */
        case 'extraMove12': {
            if (!actor) {
                log(state, '【变体3】現場研究：找不到发动者。', 'survivor');
                break;
            }
            actor.moveLeft = (actor.moveLeft ?? 0) + 2;
            log(state, `【变体3】現場研究：${who} 本小回合额外获得 2 格移动力（现在还能走 ${actor.moveLeft} 格）。`, 'survivor');
            break;
        }
        /**
         * 秘術草藥：**（在螺旋地点）額外行動：【治療】並移除目標身上所有「恐懼」**。
         *
         * ⚠ 用户口径（2024 澄清）：卡面写的是**移除「恐懼」**（不是中毒）——
         * "移除中毒"只是**治疗自带的**（本作规则：受到治疗就移除中毒标记，
         * 见 `clearPoisonOnHeal`），不是这条能力单独的条款。
         *
         * 目标 = **发动者自己**（卡面没写"选目标"，对比情報分享的 `pickTarget`）。
         */
        case 'healClearFear': {
            if (!actor) {
                log(state, '【变体3】秘術草藥：找不到发动者。', 'survivor');
                break;
            }
            const poisoned = (state.poisoned ?? []).includes(actor.id);
            const hurt = actor.hp < actor.maxHp;
            const feared = (actor.fear ?? 0) > 0 || actor.overFear === true;
            if (!hurt && !poisoned && !feared) {
                log(state, `【变体3】秘術草藥：${who} 既没受伤、没有中毒，也没有恐惧，没有可治的。`, 'survivor');
                break;
            }
            /** `clearsFear = true`：允许"满血但有恐惧"的人成为合法治疗目标 */
            applyHeal(state, actor.id, 1, true);
            /** 治疗自带的：移除中毒标记 */
            clearPoisonOnHeal(state, actor.id);
            if (feared) {
                actor.fear = 0;
                actor.overFear = false;
            }
            log(
                state,
                `【变体3】秘術草藥：${who} 在螺旋地点服用草药（${hurt ? `生命恢复到 ${actor.hp}/${actor.maxHp}` : '本来就满血'}）` +
                    `${feared ? '，并移除了身上所有恐惧' : ''}` +
                    `${poisoned ? '，治疗同时移除了中毒标记' : ''}。`,
                'survivor',
            );
            break;
        }
        /**
         * 通道調查 ②：**特殊行動：移動通過一條秘密通道**。
         *
         * 和「手電筒 / 煤油燈」走的是同一条路（`trySecretPassage`）——
         * 差别只在：不用道具、不限次数，但**占这个幸存者的一般行动**（卡面写的是"特殊行動"）。
         *
         * 目的地由界面点（`usePlanAbility` 带 `toRoomId` 进来）；没带就是
         * 界面还没选，`usePlanAbility` 那边会先把候选挂到 `pendingPlanPassage` 上。
         */
        case 'moveThroughPassage': {
            if (!actor) {
                log(state, '【变体3】通道調查：找不到发动者。', 'survivor');
                break;
            }
            const toRoomId = target?.toRoomId ?? null;
            if (!toRoomId) {
                log(state, '【变体3】通道調查：请先选择要穿过的秘密通道出口。', 'survivor');
                break;
            }
            const ends = passageNeighborsFor(state, actor.roomId);
            if (!ends.includes(toRoomId)) {
                log(state, `【变体3】通道調查：从「${actor.roomId ? roomName(state, actor.roomId) : '?'}」走不到那个出口。`, 'survivor');
                break;
            }
            const fromRoom = actor.roomId;
            trySecretPassage(state, actor.id, toRoomId);
            actor.mainActionUsed = true;
            actor.moveLeft = 0;
            log(
                state,
                `【变体3】通道調查：${who} 用计划找到的通道从「${fromRoom ? roomName(state, fromRoom) : '?'}」移动到「${roomName(state, toRoomId)}」（占一般行动）。`,
                'survivor',
            );
            advanceAfterSurvivor(state, actor.id);
            break;
        }
        /**
         * 情報分享：**完成计划时，选择一名幸存者从搜索牌库抽取一张牌**。
         *
         * 两步走：先由"完成计划时在场的那个幸存者"选人（`pendingPlanTarget`），
         * 选完带着 `targetPlayerId` 再进来一次，那时才真的抽牌。
         */
        case 'onCompleteDrawOneForOne': {
            const pickId = target?.targetPlayerId ?? null;
            const pick = pickId ? state.players[pickId] : null;
            if (pick && pick.alive && pick.faction === 'survivor') {
                planDrawSearchCard(state, pick, '情報分享');
                break;
            }
            if (!actor) {
                log(state, '【变体3】情報分享：找不到发动者，改为由第一名幸存者抽牌。', 'survivor');
                const fallback = aliveSurvivorsOf(state)[0];
                if (fallback)
                    planDrawSearchCard(state, fallback, '情報分享');
                break;
            }
            const cands = aliveSurvivorsOf(state).map((s) => s.id);
            if (cands.length === 0) {
                log(state, '【变体3】情報分享：场上没有幸存者，抽不了牌。', 'survivor');
                break;
            }
            state.pendingPlanTarget = { planId: plan.id, index, chooserId: actor.id, candidates: cands };
            log(
                state,
                `【变体3】情報分享：由 ${who} 选择一名幸存者，从搜索牌库抽取一张牌` +
                    `（${aliveSurvivorsOf(state).map((s) => s.name).join('、')}）。`,
                'survivor',
            );
            break;
        }
        /** 反擊！奧術封印：**完成计划时**在螺旋地点发出响声 */
        case 'noiseAtSpiral': {
            const rooms = (state.map.rooms ?? [])
                .filter((r) => (r.tags ?? []).includes('special-spiral'))
                .map((r) => r.id);
            if (!rooms.length) {
                log(state, '【变体3】奧術封印：这张地图没有螺旋地点。', 'survivor');
                break;
            }
            for (const roomId of rooms)
                pushNoise(state, roomId, false, { byPlayerId: actor?.id, source: 'item' });
            log(state, `【变体3】奧術封印：在螺旋地点「${rooms.map((r) => roomName(state, r)).join('、')}」发出响声（原因只说给幸存者）。`, 'survivor');
            break;
        }
        default:
            /** 还没落地的能力：明说，别静默吃掉（免得玩家以为发动成功却没效果） */
            log(state, `【变体3】计划能力「${ab.text}」的效果还在实现中（${ab.impl}）。`, 'survivor');
            break;
    }
});
/**
 * 【变体3】**计划自带的"立刻获胜"条件** —— 达成时直接结束对局。
 *
 * 卡面文字都是「…倖存者立刻獲勝！」，所以这里只判"这条 `impl` 的计划是否已完成"
 * （`planImplActive` 只认**已完成的那张计划**），不判是谁触发的。
 */
function planWinSurvivors(state: GameState, planLabel: string, reason: string): void {
    if (state.phase === 'gameOver')
        return;
    state.winner = 'survivors';
    state.winReason = reason;
    state.phase = 'gameOver';
    log(state, `【变体3】幸存者胜利：计划「${planLabel}」—— ${reason}`, 'all', true);
}
/** 某条地点的 tags 里有没有这个标记 */
function roomHasTag(state: GameState, roomId: string | null | undefined, tag: string): boolean {
    if (!roomId)
        return false;
    const room = (state.map.rooms ?? []).find((r) => r.id === roomId);
    return Boolean(room && (room.tags ?? []).includes(tag));
}
/**
 * 【变体3】**爆炸陷阱**：杀手【搜索】带计划标记、且该地点没有幸存者 → 幸存者立刻获胜。
 *
 * 必须由"搜索"这条路调用（主流程的搜索、快进里的搜索都要调），
 * 别的移动经过不算。
 */
function checkPlanBombTrapOnKillerSearch(state: GameState, roomId: string | null | undefined): boolean {
    if (!roomId || state.phase === 'gameOver')
        return false;
    if (!planImplActive(state, 'winOnKillerSearchMarkedRoom'))
        return false;
    if (!planMarkersAt(state, roomId))
        return false;
    if (survivorsInRoom(state, roomId).length > 0)
        return false;
    planWinSurvivors(
        state,
        '爆炸陷阱',
        `杀手搜索了带计划标记、且没有幸存者的「${roomName(state, roomId)}」。`,
    );
    return true;
}
/**
 * 【变体3】**幸存者回合开始时**的两条获胜条件：
 *  - 火箭發射器：所有幸存者都在**同一个**与杀手相邻的地点，且**上一回合没有发生遭遇**
 *  - 被封印的傳送門：所有幸存者都在**螺旋地点**，且队伍物品栏里有秘密地图＋手电筒＋古代护符
 *
 * 返回 true = 已经结束对局（调用方要停手）。
 */
function checkPlanRoundStartWins(state: GameState): boolean {
    /** 「上一個回合中沒有發生遭遇」：本计数器在每个大回合开头读一次、然后归零 */
    const hadEncounterLastRound = (state.encountersThisRound ?? 0) > 0;
    state.encountersThisRound = 0;
    if (state.phase === 'gameOver')
        return true;
    const alive = aliveSurvivorsOf(state);
    if (alive.length === 0)
        return false;
    /** ① 火箭發射器 */
    if (planImplActive(state, 'winOnAllAdjacentNoEncounter') && !hadEncounterLastRound) {
        const rooms = [...new Set(alive.map((s) => s.roomId).filter(Boolean))] as string[];
        const killer = state.killerId ? state.players[state.killerId] : null;
        if (rooms.length === 1 && killer?.roomId) {
            const here = rooms[0]!;
            /** 「與殺手相鄰」= 地图上的相邻地点（不管封堵/潜行那一套） */
            const adjacent = mapAdjacentRooms(state.map, killer.roomId).includes(here);
            if (adjacent) {
                planWinSurvivors(
                    state,
                    '火箭發射器',
                    `所有幸存者都在与杀手相邻的「${roomName(state, here)}」，且上一回合没有发生遭遇。`,
                );
                return true;
            }
        }
    }
    /** ② 被封印的傳送門：全员都在螺旋地点，队伍里齐了秘密地图/手电筒/古代护符 */
    if (planImplActive(state, 'winOnSpiralWithItems')) {
        const allAtSpiral = alive.every((s) => roomHasTag(state, s.roomId, 'special-spiral'));
        if (allAtSpiral) {
            const owners: Record<string, string[]> = { map: [], flashlight: [], amulet: [] };
            for (const s of alive) {
                for (const itemId of Object.keys(owners)) {
                    if ((s.items?.[itemId] ?? 0) > 0)
                        owners[itemId]!.push(s.name);
                }
            }
            const missing = Object.keys(owners).filter((itemId) => owners[itemId]!.length === 0);
            if (missing.length === 0) {
                const label: Record<string, string> = { map: '秘密地图', flashlight: '手电筒', amulet: '古代护符' };
                planWinSurvivors(
                    state,
                    '被封印的傳送門',
                    `所有幸存者都在螺旋地点，且队伍物品栏里有` +
                        `${Object.keys(owners).map((id) => `${label[id]}（${owners[id]!.join('、')}）`).join('、')}。`,
                );
                return true;
            }
        }
    }
    return false;
}
/**
 * 【变体3】从搜索牌库抽 1 张并按"搜索抽牌"的规矩结算
 * （钥匙上架 / 物品进背包 / 其它牌跑效果后进弃牌堆），带响声的那张照响。
 *
 * 和乔治「聪明绝顶 B」同一套口径，抽出来给计划能力复用。
 */
function planDrawSearchCard(state: GameState, p: PlayerState, reason: string): void {
    const cardId = drawSearchCard(state);
    if (!cardId) {
        log(state, `【变体3】${reason}：搜索牌库已空，没有抽到牌。`, 'survivor');
        return;
    }
    const card = state.cardById[cardId];
    log(state, `【变体3】${reason}：${p.name} 抽取「${card?.name ?? cardId}」。`, 'survivor');
    if (card && isKeyCard(card)) {
        const added = addKeys(state, 1, p.id);
        /** 【杀手该知道什么】同上：钥匙上架立即告知杀手，**分头行动那支保持私密** */
        log(
            state,
            state.split
                ? `${p.name} 获得 ${added} 把钥匙（单独保管，共 ${p.keys ?? 0} 把）。`
                : added > 0
                    ? `钥匙放入钥匙架（${state.keysCollected}/${state.rules.keysNeeded}）。`
                    : `钥匙架已有 ${state.keysCollected}/${state.rules.keysNeeded} 把，多出来的钥匙不再上架。`,
            state.split ? 'survivor' : 'all',
            !state.split,
        );
    }
    else if (card) {
        const gains = card.effects.filter((e) => e.op === 'gainItem');
        if (gains.length) {
            runEffects({ state, actorId: p.id, effects: gains });
        }
        else {
            runEffects({ state, actorId: p.id, effects: card.effects.filter((e) => e.op !== 'noise') });
            discardUniqueCard(state, cardId, 'search');
        }
    }
    if (card?.makesNoise && p.roomId)
        pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'item' });
}
/** 场上还活着的幸存者（计划能力里常要按位置判定） */
function aliveSurvivorsOf(state: GameState): PlayerState[] {
    return Object.values(state.players).filter(
        (x) => x.faction === 'survivor' && x.alive && Boolean(x.roomId),
    );
}
/**
 * 让 `traits.ts` 能问"**当前这名杀手**手上有哪些棋子"。
 *
 * 雕像局的特性卡挂在主雕像那一份上（一局只发一份，常驻效果只结算一次），
 * 所以"某尊雕像有没有某特性"要落到这一份卡上；但**只在本杀手名下找** ——
 * 2对3 里不能把另一名杀手的特性算进来（用户明确要求）。
 */
setKillerScopeHandler((state: GameState) => currentKillerPieceIds(state));

/**
 * 【变体1】**升级到某一级之后的特性追加效果**（09 慢热杀手 / 08 压抑怒火 /
 * 17 压迫威慑 / 18 狡诈猎手）。
 *
 * ⚠ **时机（用户口径）**：这是"进化相关的特性卡效果"，
 * 排在 **确认 → 坍塌 →（这里）→ 执行进化效果** 的第三步，
 * 所以在 `evolutionTraitStage` 里调用，而不是在结算阶段。
 * 返回一个更大的等级 = 继续跳级结算。
 */
export function revealEvolutionTraits(state: GameState, level: number): number | undefined {
    if (!state.variant1)
        return;
    const kid = state.killerId;
    if (!kid)
        return;
    const who = state.players[kid];
    const name = who?.name ?? '杀手';

    /** 09 慢热杀手：每次升级 +1 力量（开局那次 -1 已在 setup 里扣过） */
    if (hasTrait(state, kid, 'trait_k09')) {
        const cap = state.rules.killerPowerMax ?? 10;
        const before = state.killerPower;
        state.killerPower = Math.min(cap, before + 1);
        if (state.killerPower !== before) {
            log(state, `【变体1】${name} 的特性「慢热杀手」：升级 +1 力量（${before} → ${state.killerPower}）。`, 'all', true);
        }
    }
    /** 08 压抑怒火：升到 3 级时**立刻升到 4 级**（返回 4 → 上面递归再结算一轮） */
    if (level === 3 && hasTrait(state, kid, 'trait_k08')) {
        log(state, `【变体1】${name} 的特性「压抑怒火」：升到 3 级 → **立刻升到 4 级**。`, 'all', true);
        return 4;
    }
    /**
     * 18 狡诈猎手：「当你升级到等级 2/4 时，在任意地点【封堵】X1」（地点由杀手选）。
     *
     * 复用现成的「任选门封堵」作业（和特性 13、进化 4 级同一套）：
     * 挂上 `pendingBlockadeJob` 之后杀手点地图选门、再在行动区确认。
     * ⚠ 不加 `pendingTraitSetupResume` —— 这条发生在**局中升级**，
     * 收尾该走原本的 `ackEvolution` → `maybeCloseKillerUpkeep` 流程。
     */
    if ((level === 2 || level === 4) && hasTrait(state, kid, 'trait_k18')) {
        if (startAnyDoorsBlockade(state, 1)) {
            log(
                state,
                `【变体1】${name} 的特性「狡诈猎手」：升级到 ${level} 级，请在任意地点选 1 扇门【封堵】。`,
                'all',
                true,
            );
        }
        else {
            log(state, `【变体1】${name} 的特性「狡诈猎手」：场上没有可以封堵的门，跳过。`, 'all', true);
        }
    }
    /**
     * 17 压迫威慑：「当你升级到等级 3/4/5 时，【惊吓】任意 1 个幸存者」。
     *
     * ⚠ 目标**由杀手自己选**（用户要求：卡面上写"任意"的都要选，不许系统代选）——
     * 所以这里只挂起，等他在界面上点一名幸存者（`useTrait { targetPlayerId }`）。
     */
    if ((level === 3 || level === 4 || level === 5) && hasTrait(state, kid, 'trait_k17')) {
        state.pendingTraitVictim = { killerId: kid, traitId: 'trait_k17', level };
        log(
            state,
            `【变体1】${name} 的特性「压迫威慑」：升级到 ${level} 级，请**选 1 名幸存者**【惊吓】。`,
            'killer',
        );
    }
    return undefined;
}

/**
 * **③ 进化相关的特性卡效果**（用户口径的完整顺序）：
 *   ① 确认进化效果
 *   ② **双方坍塌结算**（只有**墓穴**地图才有 —— 由 `interceptEvolutionForCollapse`
 *      的 `isCrypt` 判定保证；非墓穴地图这一步自然跳过）
 *   ③ **进化相关的特性卡效果**（只有开了**变体1**才有 —— `revealEvolutionTraits`
 *      里第一句就是 `if (!state.variant1) return;`）
 *   ④ 执行进化效果（力量 / 选卡 / 选牌 / 选主雕像 / 选地点 / 入手 / 弃牌）
 *
 * ⚠ **特性 08「压抑怒火」不在这里跳级**（用户口径）：
 * 它要的是"**先执行 3 级进化效果**，然后由于 08 再走一轮 4 级"——
 * 也就是连 4 级那轮的坍塌 / 特性 / 效果都要完整走一遍。
 * 所以跳级在 `settleConfirmedEvolution` 的**末尾**才发起。
 *
 * @returns 是否挂出了"要玩家先选"的特性作业（如 18 的封堵选门、17 的选惊吓目标）
 */
function evolutionTraitStage(state: GameState, level: number): boolean {
    /**
     * ⚠ **同一级只跑一次**（幂等守卫）。
     *
     * 两处都会调它：`ackEvolution`（正常路径）和 `advanceEvolutionAfterChoice`
     * （坍塌打断后的补跑）。没有这道守卫的话，坍塌走完补跑时会**再结算一遍**
     * 特性（09 慢热杀手会重复 +1 力量）。
     */
    if (state.evolutionTraitStageAtLevel === level)
        return Boolean(state.pendingTraitVictim) || Boolean(state.pendingBlockadeJob);
    state.evolutionTraitStageAtLevel = level;
    revealEvolutionTraits(state, level);
    /** 17 要杀手自己选惊吓目标；18 要杀手点地图选门 */
    return Boolean(state.pendingTraitVictim) || Boolean(state.pendingBlockadeJob);
}

/**
 * 【变体1】杀手特性 11「恐惧迸发」：**当你伤害任何幸存者时，【惊吓】所有幸存者**。
 *
 * 只有**杀手阵营造成的伤害**才算"你伤害"（陷阱/坍塌等来源也记在当前杀手名下），
 * 其他来源（幸存者自己、环境）不触发。
 */
setOnSurvivorDamagedHandler((state: GameState, targetId: string, sourceId?: string) => {
    if (!state.variant1)
        return;
    const src = sourceId ? state.players[sourceId] : undefined;
    if (src?.faction !== 'killer')
        return;
    /**
     * ⚠ **按"造成伤害的那名杀手"查特性**（含他的全部雕像），不要按某一尊棋子查。
     *
     * 用户口径：02/11 认"**当前遭遇中的那尊雕像**"，而特性卡一局只发一份、
     * 挂在主雕像上（这样 12 那种常驻"力量 +1"只结算一次）。
     * 所以非主雕像打出的伤害也必须能触发它 —— 但又**不能跨到另一名杀手**
     * （2对3 里两名杀手的特性不能弄混）。
     */
    const ownerKillerId = src.statueIndex != null ? (state.killerId ?? src.id) : src.id;
    if (!killerPieceIdsFor(state, ownerKillerId).some((id) => hasTrait(state, id, 'trait_k11')))
        return;
    const victims = Object.values(state.players).filter((p) => p.faction === 'survivor' && p.alive);
    if (!victims.length)
        return;
    log(state, `【变体1】${src.name} 的特性「恐惧迸发」：伤害了幸存者，【惊吓】所有幸存者。`, 'all', true);
    for (const v of victims)
        addFear(state, v.id, 1);
});

/**
 * 【变体1】**开局设置类特性**结算（卡面写「游戏开始时」的那 7 张）。
 *
 * 调用时机：所有人选完特性之后、`startRound` 之前（`finishStartCommon` 里挂起，
 * 由 `traits.ts` 的 `onTraitSetup` 回调进来）。
 *
 * ⚠ **杀手侧必须逐个切镜像做**：力量 / 手牌 / 等级在 2对3 里是**每人一份切片**，
 * 不切镜像直接改会写错人（`switchActiveKiller` 会先存旧的、再读新的）。
 */
export function applyVariant1Setup(state: GameState): void {
    if (!state.variant1)
        return;
    /**
     * ⚠ **先记下"谁该行动"**：下面 ② 会逐个 `switchActiveKiller` 切镜像，
     * 循环结束时 `state.killerId` 已经变成"最后一个有开局特性的杀手"了。
     *
     * 以前收尾写的是 `switchActiveKiller(state, state.killerId)` —— 那时候
     * `state.killerId` 早被改掉了，"切回原样"其实是切到了别人：
     * 2对3 里只有**后手**持 14「埋伏等待」时，开局升级就从他开始确认
     * （用户口径：每轮都该从**先手**开始；`evolution-trait14-2v3.mjs` 抓到的）。
     */
    const backKillerId = state.killerId ?? null;

    /** ① 幸存者侧：04 持枪证明 */
    for (const p of Object.values(state.players)) {
        if (p.faction !== 'survivor')
            continue;
        for (const def of setupTraitsOf(state, p.id)) {
            if (def.id === 'trait_s04')
                applyTraitS04(state, p);
        }
    }

    /** ② 杀手侧：逐个切镜像 */
    /**
     * ⚠ **这里是"逐个杀手切镜像"结算的，所以 08 / 09 这类开局效果
     * 只影响持有者**（用户口径：「只有进化是共同的（2v3 两名杀手一同进化），
     * 08、14 的其他效果只对持有者有效」）——
     * 只有 `setupTraitsOf(state, kid)` 非空的那名杀手才会被切进来、
     * 才会动到他的切片（手牌 / 力量）。队友完全不受影响。
     *
     * 对照：**等级**是队伍共享的，所以"一起升级 / 08 的跳级 / 14 的开局等级 2"
     * 属于进化本身，两人一起生效（见 `runUpgrade`）。
     */
    const killerIds = (state.killerIds ?? []).filter((kid) => state.killers[kid]);
    for (const kid of killerIds) {
        const list = setupTraitsOf(state, kid);
        if (!list.length)
            continue;
        switchActiveKiller(state, kid);
        const who = state.players[kid];
        const name = who?.name ?? '杀手';
        for (const def of list) {
            switch (def.id) {
                /** 03 狡猾诡计：游戏开始时额外抽 1 张 */
                case 'trait_k03': {
                    drawKillerCards(state, 1);
                    log(state, `${name} 的开局特性「狡猾诡计」：额外抽 1 张卡牌。`, 'all', true);
                    break;
                }
                /** 04 噩梦降临：惊吓所有幸存者 */
                case 'trait_k04': {
                    for (const s of Object.values(state.players)) {
                        if (s.faction === 'survivor' && s.alive)
                            addFear(state, s.id, 1);
                    }
                    log(state, `${name} 的开局特性「噩梦降临」：所有幸存者被【惊吓】。`, 'all', true);
                    break;
                }
                /**
                 * 08 压抑怒火：**没有起始手牌**并 -1 力量。
                 * 起始手牌是 `setupKillerOpeningHand` 刚发的，这里整手弃掉。
                 * （"升到 3 级立刻升到 4 级"由 `setAfterLevelSettledHandler` 结算）
                 */
                case 'trait_k08': {
                    const dropped = state.killerHand.length;
                    state.killerDiscard.push(...state.killerHand);
                    state.killerHand = [];
                    const cap8 = state.rules.killerPowerMax ?? 10;
                    state.killerPower = Math.max(0, Math.min(cap8, state.killerPower - 1));
                    logSplit(
                        state,
                        `${name} 的开局特性「压抑怒火」：弃掉全部起始手牌、力量 -1。`,
                        `${name} 的开局特性「压抑怒火」：弃掉全部起始手牌（${dropped} 张）、力量 -1。`,
                    );
                    break;
                }
                /** 09 慢热杀手：-1 力量（"每次升级 +1 力量"由 `setAfterLevelSettledHandler` 结算） */
                case 'trait_k09': {
                    const cap9 = state.rules.killerPowerMax ?? 10;
                    state.killerPower = Math.max(0, Math.min(cap9, state.killerPower - 1));
                    log(state, `${name} 的开局特性「慢热杀手」：力量 -1（之后每次升级 +1）。`, 'all', true);
                    break;
                }
                /** 12 致命攻击：力量 +1（常驻，不需要确认） */
                case 'trait_k12': {
                    const cap12 = state.rules.killerPowerMax ?? 10;
                    state.killerPower = Math.min(cap12, state.killerPower + 1);
                    log(state, `${name} 的特性「致命攻击」：力量 +1（现为 ${state.killerPower}）。`, 'all', true);
                    break;
                }
                /**
                 * 14 埋伏等待：**开局等级 2**，但跳过自己的第一个回合。
                 *
                 * ⚠ 等级推进**不在这里做** —— 用户明确要求顺序是
                 * 「先选主雕像 → 确认进化效果 → 可以切换主雕像 → 再结算 2 级效果」，
                 * 所以它放在 `startRound` 的开局准备里（主雕像选完之后），
                 * 走的是正常升级流程 `runUpgrade`（内部会挂确认与主雕像切换）。
                 * 这里只登记"跳过第一个回合"。
                 */
                case 'trait_k14': {
                    if (!state.killerSkipFirstTurn.includes(kid))
                        state.killerSkipFirstTurn.push(kid);
                    log(
                        state,
                        `${name} 的开局特性「埋伏等待」：开局等级 2，但**跳过自己的第一个回合**。`,
                        'all',
                        true,
                    );
                    break;
                }
                /**
                 * 13 阴险圈套：开局在任意地点封堵 X2（地点由杀手选）。
                 *
                 * ⚠ 这里只把"待封堵"的任务挂上 —— 真正的选门流程在
                 * `startRound` 之后由"开局准备"阶段接管（和女猎手布陷阱同一时机）。
                 */
                case 'trait_k13': {
                    state.pendingTraitBlockades = 2;
                    log(
                        state,
                        `${name} 的开局特性「阴险圈套」：开局要选 2 个地点【封堵】（可以在不同地点）。`,
                        'all',
                        true,
                    );
                    break;
                }
                default:
                    break;
            }
        }
    }
    /** 收尾：切回**进来时该行动的那名杀手**（`switchActiveKiller` 会存旧读新） */
    if (backKillerId && state.killers[backKillerId])
        switchActiveKiller(state, backKillerId);
}

/**
 * 【变体1】04 持枪证明：开局从**发现牌堆**搜 1 张左轮手枪进物品栏，然后洗混牌堆。
 *
 * ⚠ 是"搜索"不是"抽"：从牌堆里**挑出**那张，剩下的洗混 —— 所以牌堆总数少 1 张。
 */
function applyTraitS04(state: GameState, p: PlayerState): void {
    const idx = state.discoveryDeck.findIndex(
        (id) => (state.cardById[id]?.name ?? '').includes('左轮手枪'),
    );
    if (idx < 0) {
        log(state, `${p.name} 的开局特性「持枪证明」：发现牌堆里已经没有被左轮手枪了。`, 'survivor', true);
        return;
    }
    const cardId = state.discoveryDeck.splice(idx, 1)[0]!;
    state.discoveryDeck = shuffle(state.discoveryDeck);
    p.items.revolver = (p.items.revolver ?? 0) + 1;
    log(
        state,
        `${p.name} 的开局特性「持枪证明」：从发现牌堆拿走「左轮手枪」，牌堆洗混。`,
        'survivor',
        true,
    );
    enforceInventory(state, p.id);
}

/** 单人热座：一个人操控 3 名幸存者 + 1 名杀手 */
export function startSoloGame(state: GameState, content: GameContent, hostSocketId: string) {
    const host = state.players[hostSocketId];
    if (!host)
        throw new Error('房主不在房间内');
    const needed = state.rules.maxSurvivors;
    if (!state.soloKillerCharacterId || state.soloSurvivorCharacterIds.length !== needed) {
        throw new Error(`请先选好 1 名杀手和 ${needed} 名幸存者`);
    }
    if (!host.ready)
        throw new Error('请先点击准备');
    const killerCh = content.characters.find((c) => c.id === state.soloKillerCharacterId);
    if (!killerCh || killerCh.faction !== 'killer')
        throw new Error('杀手角色无效');
    const survChars = state.soloSurvivorCharacterIds.map((id) => {
        const ch = content.characters.find((c) => c.id === id);
        if (!ch || ch.faction !== 'survivor')
            throw new Error('幸存者角色无效');
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
    for (const surv of survivors)
        initPiece(state, content, surv);
    state.killerId = killerId;
    state.turnOrder = survivors.map((s) => s.id);
    finishStartCommon(state, content);
    log(state, `单人热座开始：依次操控 ${survivors.map((s) => s.name).join('、')}，再操控杀手。`);
}

/** 1 对 1：一人杀手，一人操控全部幸存者 */
export function startDuoGame(state: GameState, content: GameContent) {
    const humans = Object.values(state.players);
    if (humans.length !== 2)
        throw new Error('1 对 1 需要恰好 2 名玩家');
    const killerHuman = humans.find((p) => p.faction === 'killer');
    const survHuman = humans.find((p) => p.faction === 'survivor');
    if (!killerHuman || !survHuman)
        throw new Error('一人选杀手，一人选幸存者');
    if (!killerHuman.characterId)
        throw new Error(`${killerHuman.name} 尚未选择杀手角色`);
    const needed = state.rules.maxSurvivors;
    if (state.soloSurvivorCharacterIds.length !== needed) {
        throw new Error(`${survHuman.name} 请先点选 ${needed} 名幸存者`);
    }
    if (!killerHuman.ready || !survHuman.ready)
        throw new Error('双方都需要准备');
    const killerCh = content.characters.find((c) => c.id === killerHuman.characterId);
    if (!killerCh || killerCh.faction !== 'killer')
        throw new Error('杀手角色无效');
    const survChars = state.soloSurvivorCharacterIds.map((id) => {
        const ch = content.characters.find((c) => c.id === id);
        if (!ch || ch.faction !== 'survivor')
            throw new Error('幸存者角色无效');
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
    for (const surv of survivors)
        initPiece(state, content, surv);
    state.killerId = killerId;
    state.turnOrder = survivors.map((s) => s.id);
    finishStartCommon(state, content);
    log(state, `1 对 1 开始：${killerHuman.name} 操控杀手「${killer.name}」，${survHuman.name} 操控 ${survivors.map((s) => s.name).join('、')}。`);
}

/** 1对2：一人杀手，两人共控全部幸存者 */
export function startVs2Game(state: GameState, content: GameContent) {
    const humans = Object.values(state.players);
    if (humans.length !== 3)
        throw new Error('1对2 需要恰好 3 名玩家');
    const killerHuman = humans.find((p) => p.faction === 'killer');
    const survHumans = humans.filter((p) => p.faction === 'survivor');
    if (!killerHuman || survHumans.length !== 2)
        throw new Error('一人选杀手，两人选幸存者并共控 3 名角色');
    if (!killerHuman.characterId)
        throw new Error(`${killerHuman.name} 尚未选择杀手角色`);
    const needed = state.rules.maxSurvivors;
    if (state.soloSurvivorCharacterIds.length !== needed) {
        throw new Error(`请先点选 ${needed} 名幸存者`);
    }
    if (!killerHuman.ready || survHumans.some((p) => !p.ready))
        throw new Error('三人都需要准备');
    const killerCh = content.characters.find((c) => c.id === killerHuman.characterId);
    if (!killerCh || killerCh.faction !== 'killer')
        throw new Error('杀手角色无效');
    const survChars = state.soloSurvivorCharacterIds.map((id) => {
        const ch = content.characters.find((c) => c.id === id);
        if (!ch || ch.faction !== 'survivor')
            throw new Error('幸存者角色无效');
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
        const owner = survHumans[i % survHumans.length];
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
    for (const surv of survivors)
        initPiece(state, content, surv);
    state.killerId = killerId;
    state.turnOrder = survivors.map((s) => s.id);
    finishStartCommon(state, content);
    log(state, `1对2 开始：${killerHuman.name} 操控杀手「${killer.name}」，${survHumans.map((h) => h.name).join('、')} 共控 ${survivors.map((s) => s.name).join('、')}。一般行动和额外行动需另一人确认，交换物品不用。`);
}

/** 房主按下开始：按模式走上面三种开局 */
export function startMultiGame(state: GameState, content: GameContent) {
    const players = Object.values(state.players);
    const killers = players.filter((p) => p.faction === 'killer');
    const survs = players.filter((p) => p.faction === 'survivor');
    const needed = state.rules.maxSurvivors;
    if (killers.length !== 1)
        throw new Error('必须恰好有 1 名杀手');
    if (survs.length !== needed) {
        throw new Error(`必须恰好有 ${needed} 名幸存者（当前 ${survs.length}）`);
    }
    if (players.length !== 1 + needed) {
        throw new Error(`需要 ${1 + needed} 名玩家：1 杀手 + ${needed} 幸存者`);
    }
    for (const p of players) {
        if (!p.characterId)
            throw new Error(`${p.name} 尚未选择角色`);
        if (!p.ready)
            throw new Error(`${p.name} 尚未准备`);
        initPiece(state, content, p);
    }
    state.killerId = killers[0].id;
    state.turnOrder = survs.map((s) => s.id);
    state.survivorOperators = [];
    finishStartCommon(state, content);
    log(state, `1对3 开始：${killers[0].name} 操控杀手，${survs.map((s) => `${s.controllerName || s.name}→${s.name}`).join('，')}。每人只操控自己的角色。`);
}

/**
 * 2 对 3：**两名杀手**对三名幸存者。
 *
 * 与其它模式的关键差别：
 *  - 两名杀手各选一个角色，**各有一套牌库 / 手牌 / 弃牌堆 / 力量**；
 *  - 开局两人各选一个先后手偏好，**两人一致才生效**（见 `killerOrderPick`）；
 *  - 地图、战报、幸存者、钥匙、修理进度共享，但"猜的幸存者位置 / 猜的修理进度"各算各的；
 *  - 开局钥匙进度 +1（把搜索牌堆垫底那把钥匙直接明置），修理进度 +1；
 *  - 每轮两名杀手先后各行动一次，**任一杀手遭遇结束则本轮两人都不再行动**；
 *  - 任一人摸牌堆空 → 两人**同时进化**（共用一个队伍等级，各套自己类型的 1~5 级效果）；
 *  - 捕网结算推迟到**所有杀手回合都结束**之后。
 */
export function start2v3Game(state: GameState, content: GameContent) {
    const players = Object.values(state.players);
    const killers = players.filter((p) => p.faction === 'killer');
    const survs = players.filter((p) => p.faction === 'survivor');
    /** 2对3 固定 3 名幸存者，不跟 rules.maxSurvivors 走 */
    const NEEDED_SURV = 3;
    if (killers.length !== 2)
        throw new Error(`2对3 必须恰好有 2 名杀手（当前 ${killers.length}）`);
    if (survs.length !== NEEDED_SURV) {
        throw new Error(`2对3 必须恰好有 ${NEEDED_SURV} 名幸存者（当前 ${survs.length}）`);
    }
    if (players.length !== 2 + NEEDED_SURV) {
        throw new Error(`2对3 需要 ${2 + NEEDED_SURV} 名玩家：2 杀手 + ${NEEDED_SURV} 幸存者`);
    }
    /** 必须 5 个操控者各不相同（一人不能既当杀手又当幸存者） */
    if (new Set(players.map((p) => p.controllerId)).size !== players.length) {
        throw new Error('2对3 需要 5 名不同的玩家各坐一个位置');
    }
    for (const p of players) {
        if (!p.characterId)
            throw new Error(`${p.name} 尚未选择角色`);
        if (!p.ready)
            throw new Error(`${p.name} 尚未准备`);
    }
    /** 两名杀手的角色不能重复；三名幸存者的角色也不能重复 */
    if (new Set(killers.map((p) => p.characterId)).size !== killers.length)
        throw new Error('两名杀手不能选同一个角色');
    if (new Set(survs.map((p) => p.characterId)).size !== survs.length)
        throw new Error('三名幸存者不能选同一个角色');

    for (const p of players)
        initPiece(state, content, p);

    /** 先后手：两人偏好一致才定；不一致就先按座位顺序，等他们在行动区选 */
    state.killerTurnOrder = [...killers.map((p) => p.id)].sort();
    state.killerTurnIndex = 0;
    state.killerOrderDecided = false;
    state.killerRoundEndedByEncounter = false;
    state.killerId = state.killerTurnOrder[0] ?? null;

    state.turnOrder = survs.map((s) => s.id);
    state.survivorOperators = [];
    finishStartCommon(state, content);

    /**
     * 先后手在**开局设定做完之后**再定 ——
     * `finishStartCommon` 会按 killerIds 的顺序逐个建切片，最后把镜像切到最后一个杀手，
     * 所以这里要把 killerId 和镜像重新指回先手那个。
     */
    applyKillerOrderPick(state);

    apply2v3OpeningProgress(state);

    log(
        state,
        `2对3 开始：${killers.map((k) => `${k.controllerName || k.name}→${k.name}`).join('、')} 两名杀手，` +
            `${survs.map((s) => `${s.controllerName || s.name}→${s.name}`).join('，')} 三名幸存者。` +
            '每个杀手有自己的牌库与行动区；开局钥匙进度 +1、修理进度 +1。',
    );
}

/**
 * 2对3 开局的两条特殊进度：
 *  - **钥匙进度 +1**：线下是把搜索牌堆**垫底那张钥匙**直接拿出来明置。
 *    所以这里把它从牌堆里摘掉（牌堆就只剩 9 把钥匙），进度 +1。
 *    摘掉之后牌堆最底下恢复成普通暗牌（客户端本来就按"最后一张"画特殊牌背）。
 *  - **修理进度 +1**。
 */
export function apply2v3OpeningProgress(state: GameState) {
    /** 取牌堆**最后**一张（= `buildSearchDeck` 垫底的那把钥匙） */
    const bottom = state.searchDeck[state.searchDeck.length - 1];
    if (bottom && isKeyCard(state.cardById[bottom] ?? { effects: [] })) {
        state.searchDeck.pop();
        addKeys(state, 1);
        log(state, `2对3 开局：把搜索牌堆垫底的钥匙直接明置，钥匙进度 +1（${state.keysCollected}/${state.rules.keysNeeded}）。`, 'all', true);
    }
    else {
        /** 兜底：垫底不是钥匙（换过牌堆等）就按数值加一次 */
        addKeys(state, 1);
        log(state, '2对3 开局：钥匙进度 +1。', 'all', true);
    }
    state.repairProgress = Math.min(state.rules.repairNeeded, state.repairProgress + 1);
    log(state, `2对3 开局：修理进度 +1（${state.repairProgress}/${state.rules.repairNeeded}）。`, 'all', true);
}

/**
 * 按两名杀手的先后手偏好定顺序。
 *
 * 规则：**两人一致才生效** ——
 * 都选「先手」→ 随机/按座位定一个先手；一先一后 → 直接就是那个顺序；
 * 有一人没选或两人都选同一个但分不出谁先，就先用座位顺序，等他们在行动区点。
 */
export function applyKillerOrderPick(state: GameState): void {
    /**
     * 先把"玩家座位上的杀手棋子"换成**实际轮到的棋子** ——
     * 雕像杀手的状态挂在主雕像名下，若用原始棋子，`switchActiveKiller` 会拿到空切片
     * （表现为"雕像杀手回合打出狼人的手牌"）。
     */
    const ids = state.killerIds.map((id) => killerTurnPieceId(state, id));
    if (ids.length !== 2) {
        state.killerTurnOrder = ids;
        state.killerOrderDecided = true;
        if (ids[0]) switchActiveKiller(state, ids[0]);
        return;
    }
    const [a, b] = ids;
    const pa = state.players[a]?.orderPick ?? null;
    const pb = state.players[b]?.orderPick ?? null;
    let first: string | null = null;
    if (pa === 'first' && pb === 'second') first = a;
    else if (pb === 'first' && pa === 'second') first = b;
    else if (pa === 'first' && pb === 'first') first = a;   // 都想先手：按座位
    else if (pa === 'second' && pb === 'second') first = a; // 都想后手：按座位
    if (!first) {
        /** 还有人没选 —— 先用座位顺序，标记"未定"让界面继续提示选 */
        state.killerOrderDecided = false;
        state.killerTurnOrder = [a, b];
        state.killerTurnIndex = 0;
        switchActiveKiller(state, a);
        return;
    }
    state.killerTurnOrder = [first, first === a ? b : a];
    state.killerTurnIndex = 0;
    state.killerOrderDecided = true;
    state.killerId = first;
    switchActiveKiller(state, first);
    log(
        state,
        `2对3：本轮先后手已定 —— 先手 ${state.players[first]?.name ?? first}，` +
            `后手 ${state.players[state.killerTurnOrder[1]]?.name ?? ''}。`,
        'all',
        true,
    );
}

/** 房主按下开始：按模式走对应的开局 */
export function startGame(state: GameState, content: GameContent, hostSocketId: string): void
{
    /**
     * **每局游戏开始时清空战报**（用户口径）。
     *
     * 大厅阶段写进来的那些（「房间 X 已创建。」、换地图 / 开变体 / 有人准备了…）
     * 都是**开局之前**的事，进了对局还留在战报里只会盖住真正的开局信息 ——
     * 客户端"本大回合战报"那块又会按 `round` 把它们一起捞出来。
     *
     * ⚠ **清在这里、不是清在 `finishStartCommon` 里**：
     * 每个棋子的开局准备（`initPiece`：开局手牌 / 起始物品 /
     * 「迪伦 开局获得一个坚毅标记」这类）都跑在 `finishStartCommon` **之前**，
     * 清晚了会把它们一起抹掉。
     */
    state.logs = [];
    if (state.mode === 'solo') {
        startSoloGame(state, content, hostSocketId);
    }
    else if (state.mode === 'duo') {
        startDuoGame(state, content);
    }
    else if (state.mode === 'vs2') {
        startVs2Game(state, content);
    }
    else if (state.mode === '2v3') {
        start2v3Game(state, content);
    }
    else {
        startMultiGame(state, content);
    }
}

/**
 * 再来一局：保留座位与房间，退回大厅重新选地图 / 身份 / 角色。
 * 所有人都点过「再来一局」后才会走到这里，此时把棋盘整盘重置。
 */
export function restartMatch(state: GameState, content: GameContent) {
    const roomCode = state.roomCode;
    const hostId = state.hostId;
    const mode = state.mode;
    /** 上一局的地图作为默认值带过去，房主可以在大厅里换 */
    const mapId = state.map.id;
    const hostName = Object.values(state.players).find((p) => p.controllerId === hostId)?.controllerName || '房主';
    /** 每个操控者留一个座位（杀手优先），用来重建大厅里的人 */
    const byCtrl = new Map();
    for (const p of Object.values(state.players)) {
        const prev = byCtrl.get(p.controllerId);
        if (!prev || p.faction === 'killer')
            byCtrl.set(p.controllerId, p);
    }
    const humans: Record<string, PlayerState> = {};
    for (const [cid, src] of byCtrl) {
        const h = createPlayer(cid, src.controllerName || src.name, cid);
        h.controllerName = src.controllerName || src.name;
        h.connected = Object.values(state.players).some((p) => p.controllerId === cid && p.connected);
        humans[cid] = h;
    }
    const fresh = createLobby(roomCode, hostId, hostName, content, mapId);
    const dest = state;
    const src = fresh;
    /** 用新大厅的字段覆盖当前 state（`players` 之后再单独换上保留的座位） */
    for (const key of Object.keys(src) as Array<keyof GameState>)
        (dest as unknown as Record<string, unknown>)[key] = src[key];
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
    state.crossbowHolderId = null;
    state.crossbowAssigned = false;
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
export function enterNoiseReport(state: GameState) {
    closeSurvivorBigRound(state);
    if (state.phase === 'gameOver')
        return;
    /**
     * 【变体3】计划卡：**发现阶段结束后、大回合结束前**插一次位置检查
     * （用户口径）——这里正是发现阶段收尾的公共出口，而且此时 `phase`
     * 还停在幸存者回合里，符合"仍在幸存者大回合之内"。
     * 返回 true = 这一步直接分出了胜负（"立刻获胜"类能力）。
     */
    if (checkPlanProgress(state))
        return;
    /**
     * 【变体3】「情報分享」完成时要**选一名幸存者抽 1 张**：
     * 选择期间停在这里（`phase` 还留在幸存者回合，界面才看得到幸存者视角），
     * 选完由 `pickPlanTarget` 再回到本函数。
     */
    if (state.pendingPlanTarget) {
        state.pendingPlanResume = true;
        return;
    }
    /**
     * 乔治「思维敏捷」：**幸存者大回合结束时**判定一次
     * （用户明确："乔治二技能要在幸存者大回合结束时判定是否达成条件"）。
     *
     * 条件满足就停下来等他挑一张笔记；挑完由 `chooseGeorgeNote` 收尾、
     * 再走一遍这里（`pendingGeorgeNote` 已清，不会重复停）。
     */
    if (state.pendingGeorgeNote) {
        /** 已经在挑笔记：等他挑完，别重复推进阶段 */
        return;
    }
    if (maybeOfferGeorgeNoteAtBigRoundEnd(state)) {
        return;
    }
    /**
     * 爆竹：响声阶段就把爆竹响声标记放到杀手所在位置，
     * 它是该回合**全场唯一**的响声（`state.noises` 里就是它）。
     */
    placeFirecrackerMarker(state);
    state.phase = 'noiseReport';
    log(state, `响声阶段：${state.firecrackerThisRound
        ? '全场都有响声（爆竹）'
        : state.noises.length
            ? state.noises.map((id) => roomName(state, id)).join('、')
            : '无'}。${state.mode === 'solo' ? '（请切换为杀手视角继续）' : ''}`);
}

/**
 * 乔治「思维敏捷」的**大回合结束**判定：找场上的乔治，看他在不在杀手距离 1 内。
 * 满足就挂起"等他挑笔记"（`pendingGeorgeNote`），返回 true = 先别推进阶段。
 */
export function maybeOfferGeorgeNoteAtBigRoundEnd(state: GameState): boolean {
    /** 一个大回合只判定一次（挑完笔记会再回到这里） */
    if (state.georgeNoteGivenThisRound) return false;
    const george = Object.values(state.players).find(
        (pl) => pl.faction === 'survivor' && pl.alive && isGeorge(state, pl.id),
    );
    if (!george)
        return false;
    return maybeOfferGeorgeNote(state, george);
}

/** 进入发现阶段：摸最多 2 张留 1；只剩 1 张则直接拿；没牌且未修完则幸存者败 */
export function enterDiscovery(state: GameState) {
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
    state.discoveryKeepQueue = null;
    state.discoveryActorId = null;
    const alive = state.turnOrder.filter((id) => {
        const pl = state.players[id];
        return Boolean(pl?.alive && pl.faction === 'survivor');
    });
    if (alive.length === 0) {
        enterNoiseReport(state);
        return;
    }
    /**
     * 【分头行动】用户规则：**发现牌归本大回合第一个行动者** ——
     * 所以**不让人挑**，直接发给 `alive[0]`。
     *
     * 分头行动下 `turnOrder` 已经在 `startRound` 里旋转成"先手在最前"
     * （见 `applySplitTurnOrder`），所以这里的第一个活人就是本大回合第一个行动者。
     */
    if (state.split) {
        beginDiscoveryDraw(state, alive[0]);
        return;
    }
    if (alive.length === 1) {
        beginDiscoveryDraw(state, alive[0]);
        return;
    }
    state.pendingDiscoveryPick = true;
    log(state, '发现阶段：先选择一名幸存者翻发现牌（最多摸 2 留 1；只剩 1 张则直接拿）。');
}

export function discoveryRepairDone(state: GameState) {
    return (state.repairProgress >= state.rules.repairNeeded ||
        Boolean(state.pendingRescueArm) ||
        state.rescueArmed);
}

/**
 * 【快进·幸存者方】（只有单人热座会用）
 *
 * 1. 还没做一般行动的幸存者，**全部按「消除恐惧」结算**（占掉他们的一般行动）；
 * 2. 进发现阶段：跳过"选谁翻牌"，直接发给**第一个**活着的幸存者；
 * 3. 直接选**第一张**发现物；
 * 4. 进响声报告（后面就交给杀手回合）。
 */
export function fastForwardSurvivors(state: GameState) {
    for (const id of state.turnOrder) {
        const pl = state.players[id];
        if (!pl?.alive || pl.faction !== 'survivor' || pl.mainActionUsed)
            continue;
        pl.fear = 0;
        pl.overFear = false;
        pl.mainActionUsed = true;
        pl.moveLeft = 0;
        pl.actedThisRound = true;
        log(state, `${pl.name} 消除恐惧（快进）。`);
        if (state.phase === 'gameOver')
            return;
    }
    /** 进发现阶段（没开发现阶段 / 没人活着时它会自己直接进响声报告） */
    enterDiscovery(state);
    if (state.phase !== 'discovery')
        return;
    const first = state.turnOrder.find((id) => {
        const pl = state.players[id];
        return Boolean(pl?.alive && pl.faction === 'survivor');
    });
    if (!first) {
        enterNoiseReport(state);
        return;
    }
    /** 跳过"选谁翻牌"，直接发给第一个幸存者（`beginDiscoveryDraw` 会自己清掉待选） */
    if (!state.discoveryActorId)
        beginDiscoveryDraw(state, first);
    if (state.phase !== 'discovery')
        return;
    /** 还剩 2 张时才需要选：直接留第一张 */
    if (state.discoveryOptions.length > 1)
        resolveDiscoveryChoice(state, state.discoveryOptions[0]!);
    /**
     * ⚠ **装备溢出还没弃完，就别把阶段推进到响声。**
     *
     * 用户报的「单人模式我快进，马尔科物品溢出弃牌时变成了杀手界面」就是这个：
     * 发现阶段拿到物品 → `enforceInventory` 挂起 `pendingItemDiscard` →
     * `resolveDiscoveryChoice` 自己 `return` 了（见它内部同一道闸），
     * 但**快进函数紧接着又自己推进了一次**：这时
     * `phase === 'discovery' && discoveryOptions.length === 0 && !pendingDiscoveryPick`
     * 三个条件都为真 → 直接 `enterNoiseReport`。
     * 于是 `phase = noiseReport`（杀手阶段）+ 马尔科的弃牌还挂着：
     * 快照把 `you` 换成杀手（`buildSnapshot` 的 viewPiece 那一段），
     * 客户端 solo 分支命中「响声报告 → 杀手界面」→ 出现
     * **杀手界面 + 马尔科的弃牌按钮**的错位。
     *
     * 闸住之后 phase 留在 `discovery`（幸存者界面），
     * 弃牌由 `discardItem` 自己收尾调 `enterNoiseReport`（见那一支）。
     */
    if (state.pendingItemDiscard)
        return;
    if (state.phase === 'discovery' && state.discoveryOptions.length === 0 && !state.pendingDiscoveryPick)
        enterNoiseReport(state);
}

/**
 * 【快进·杀手方】（只有单人热座会用）
 *
 * **不打出任何卡牌**：直接进"2 个普通行动"，在**原地搜索两次**，然后结束回合。
 * 中途搜到人开战就停下（遭遇打完本来就会直接结束杀手回合）。
 * 结束回合走正常的摸牌 + 收尾，所以最终落到**下一轮幸存者大回合开始**。
 */
export function fastForwardKiller(state: GameState) {
    const k = state.killerId ? state.players[state.killerId] : null;
    if (!k?.roomId)
        throw new Error('杀手不在地图上');
    if (state.encounter)
        throw new Error('遭遇中不能快进');
    /**
     * ⚠ **慢速阶段快进 ≠ 搜索**（用户口径：「我在慢速阶段快进怎么会搜索？」）。
     *
     * 慢速阶段本来只是"打不打沙漏牌"的可选阶段 —— 快进在这里只该
     * **跳过出牌、直接结束回合**。以前不管在哪个阶段，快进都把回合**拽回**
     * "2 次普通行动（原地搜索）"，于是慢速阶段点一下快进就凭空多出两次搜索，
     * 屋里有人就**直接爆发遭遇**（用户遇到的就是这个）。
     */
    if (state.killerTurnStep === 'slow') {
        if (hasPendingKillerChoice(state))
            throw new Error('请先完成当前的选择');
        log(state, '快进：跳过慢速阶段的出牌，直接结束回合。', 'killer');
        endKillerTurn(state);
        return;
    }
    /** 跳过快速 / 特殊阶段，直接给 2 个普通行动 */
    state.killerTurnStep = 'main';
    state.killerMainChoice = 'actions';
    state.killerMainActionsLeft = 2;
    k.actionsLeft = 2;
    log(state, '快进：杀手不打出卡牌，直接进行 2 次原地搜索。', 'killer');
    for (let i = 0; i < 2; i += 1) {
        if (state.phase !== 'killerMain' || state.encounter)
            return;
        if (hasPendingKillerChoice(state) || state.killerMainActionsLeft <= 0)
            break;
        /**
         * ⚠ **快进里被停滞的雕像也要跳过搜索**（用户口径：
         * 「单人模式的快进中被停滞的雕像也要跳过搜索」）。
         *
         * 和手动搜索同一个处理：这次普通行动照常消耗，但**不搜索**
         * （不发现人、不冒遭遇）。用 `continue` 不用 `break` ——
         * 两次普通行动都要各扣一次，扣完再照常结束回合。
         */
        if (k.statueIndex != null && k.statueHalted) {
            state.killerMainActionsLeft -= 1;
            k.actionsLeft = state.killerMainActionsLeft;
            log(state, `雕像 ${k.statueIndex} 本回合被停滞，这次搜索被跳过（不搜索）。`, 'killer');
            maybeFinishKillerMain(state);
            continue;
        }
        setStealth(k, false);
        state.killerMainActionsLeft -= 1;
        k.actionsLeft = state.killerMainActionsLeft;
        const victims = survivorsInRoom(state, k.roomId);
        state.lastSearchFound = victims.length > 0;
        log(
            state,
            victims.length
                ? `${k.name} 发现了 ${victims.length} 名幸存者！`
                : `${k.name} 搜索房间，没有发现人。`,
        );
        /** 【变体3】爆炸陷阱在快进里也照样判（和主流程同一条规则） */
        if (checkPlanBombTrapOnKillerSearch(state, k.roomId))
            return;
        maybeStartEncounter(state);
        if (state.encounter)
            return;
        maybeFinishKillerMain(state);
    }
    /** 两次都搜完 → 结束回合（摸牌 + 收尾 → 下一轮幸存者大回合） */
    if (state.phase === 'killerMain' && !hasPendingKillerChoice(state))
        endKillerTurn(state);
}

/** 指定的那个人从发现牌堆翻牌。不把弃牌洗回来：牌堆空就是空。 */
export function beginDiscoveryDraw(state: GameState, actorId: string) {
    const actor = state.players[actorId];
    if (!actor?.alive || actor.faction !== 'survivor')
        throw new Error('无法选择该幸存者');
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
    const opts = [];
    for (let i = 0; i < take; i++) {
        const id = state.discoveryDeck.shift();
        if (id)
            opts.push(id);
    }
    state.discoveryOptions = opts;
    if (opts.length === 1) {
        const only = opts[0];
        log(state, `发现牌堆只剩一张，${actor.name} 直接获得「${state.cardById[only]?.name ?? only}」。`);
        resolveDiscoveryChoice(state, only);
        return;
    }
    log(state, `发现阶段：由 ${actor.name} 翻开 ${opts.map((id) => state.cardById[id]?.name ?? id).join('、')}，选留 1 张。未留下的那张进入弃牌堆。有响声标记的牌无论留哪张都会在 ${actor.name} 所在地点响。`);
    /**
     * 【变体1】特性 18「拾物妙手」：
     * 「保留你在回合结束发现的两件物品（弃掉发现的卡牌前使用本卡牌）。」
     *
     * 摸到 2 张时**两张都留下**（正常只能留 1 张）。两张各走一次结算，
     * 靠 `discoveryKeepBoth` 让第一次不推进流程。
     * ⚠ 自动生效：两张都留对幸存者只有好处，没有需要权衡的场合。
     */
    if (opts.length === 2 && state.variant1 && traitAvailable(state, actorId, 'trait_s18')) {
        markTraitUsed(state, 'trait_s18');
        log(state, `【变体1】${actor.name}「拾物妙手」：这次发现的**两张都留下**。`, 'survivor');
        const keepIds = [...opts];
        /**
         * ⚠ 记下"还没结算完的那几张"：第一张结算时若挂起了背包弃装 / 安静搜查，
         * 就先停下来等玩家处理 —— 处理完由 `continueKeepBothDiscovery` 接着结算第二张
         * （不记队列的话那两张候选会一直挂着、流程卡死）。
         */
        state.discoveryKeepQueue = [...keepIds];
        continueKeepBothDiscovery(state);
        return;
    }
}

/**
 * 【变体1】特性 18「拾物妙手」：把"两张都留"里**还没结算的那张**继续结算。
 *
 * 被打断的两种情况（都由本函数负责续跑）：
 *  - 背包满 → `pendingItemDiscard`（`discardItem` 弃完会回来）
 *  - 发现牌带响声且持有人有「安静搜查」→ `pendingQuietSearch`（答完会回来）
 *
 * @returns 是否处理过（false = 当前没有待续的）
 */
function continueKeepBothDiscovery(state: GameState): boolean {
    const queue = state.discoveryKeepQueue;
    if (!queue?.length)
        return false;
    const all = [...queue];
    while (state.discoveryKeepQueue?.length) {
        const id = state.discoveryKeepQueue.shift()!;
        /** 每轮把候选恢复（`resolveDiscoveryChoice` 要按它校验"这张是本次摸到的"） */
        state.discoveryOptions = [...all];
        /** 只有最后一次才推进流程 */
        state.discoveryKeepBoth = state.discoveryKeepQueue.length > 0;
        resolveDiscoveryChoice(state, id);
        if (state.pendingItemDiscard || state.pendingQuietSearch)
            return true;
    }
    state.discoveryKeepBoth = false;
    return true;
}

/**
 * 【变体1】特性 18「拾物妙手」的收尾：两张都结算完了（最后一张可能只是被弃装打断）。
 *
 * @returns 是否确实是"两张都留"的收尾（false = 当前不是那个场景，调用方按普通流程走）
 */
function finishKeepBothDiscovery(state: GameState): boolean {
    if (state.discoveryKeepQueue == null)
        return false;
    state.discoveryKeepQueue = null;
    state.discoveryKeepBoth = false;
    state.discoveryOptions = [];
    if (!state.pendingItemDiscard && !state.pendingQuietSearch)
        enterNoiseReport(state);
    return true;
}

/** 这张发现牌左上角带不带响声（钥匙也吵） */
export function discoveryCardNoisy(state: GameState, id: string) {
    const card = state.cardById[id];
    if (!card)
        return false;
    return Boolean(card.makesNoise) || isKeyCard(card);
}

export function suitcaseRoomId(state: GameState) {
    /** 手提箱现在是一个**翻面标记**（`src` 未开 / `srcBack` 已用），不再是两个 token */
    const tok = (state.map.tokens ?? []).find((t) => t.kind === 'suitcase' || t.kind === '手提箱');
    if (tok?.roomId)
        return tok.roomId;
    return state.map.id === 'cabin' ? 'R4' : null;
}

/** 手提箱额外行动：摸到的发现牌留下。安娜的静默搜索不适用，牌面有响声就会响 */
export function keepSuitcaseDiscovery(state: GameState, actorId: string, cardId: string) {
    const kept = state.cardById[cardId];
    const noisy = discoveryCardNoisy(state, cardId);
    /**
     * ⚠ **不写 `lastDiscoveryCardId`**（用户口径：翻找手提箱**不算发现**，
     * 只算额外行动）—— 那个字段是"本大回合**发现阶段**翻到的那张牌"，
     * 客户端在发现面板里拿它显示「已留下：X」。
     * 手提箱 / 神秘包裹都是额外行动，写进去会冒充发现牌。
     */
    if (kept) {
        const fx = kept.effects.filter((e) => e.op !== 'noise');
        if (fx.length)
            runEffects({ state, actorId, effects: fx });
        if (!cardBecomesPossession(kept) && !isKeyCard(kept)) {
            discardUniqueCard(state, cardId, 'discovery');
        }
        if (isKeyCard(kept)) {
            log(state, `手提箱摸到钥匙，放入钥匙架。`);
        }
    }
    else {
        discardUniqueCard(state, cardId, 'discovery');
    }
    /** 【变体1】特性 16「高度警觉」：发现算"其他来源"（压不压由 `pushNoise` 内部判） */
    if (noisy) {
        /**
         * 【变体1】特性 11「安静搜查」：「取消发现造成的一个 ⚠」。
         *
         * 只有**自己翻的**发现牌才算（用户口径），所以直接看翻牌人有没有这张卡；
         * 它只有好处（响声对幸存者没好处），所以这里**自动生效**、用掉就变暗。
         */
        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            /** 用户要求：**每次他有响声时询问**要不要取消 —— 挂起等答复 */
            state.pendingQuietSearch = {
                playerId: actorId,
                roomId: state.players[actorId]?.roomId ?? '',
                from: 'suitcase',
            };
            log(state, '【变体1】「安静搜查」：要不要取消这次发现造成的响声？（每局一次）', 'survivor');
            return;
        }
        {
            const room = state.players[actorId]?.roomId;
            if (room)
                pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });
            log(state, '该发现牌带有响声标记，在手提箱所在地点发出响声。');
        }
    }
    log(state, `从手提箱获得发现牌「${kept?.name ?? cardId}」。`);
}

/** 留下这一张，另一张进弃牌堆。钥匙上架，物品进背包 */
export function resolveDiscoveryChoice(state: GameState, cardId: string) {
    if (state.phase !== 'discovery')
        throw new Error('当前不是发现阶段');
    if (state.pendingDiscoveryPick)
        throw new Error('请先选择翻牌的幸存者');
    if (!state.discoveryOptions.includes(cardId))
        throw new Error('这张不是本次摸到的牌');
    const actorId = state.discoveryActorId ?? firstAliveSurvivorId(state);
    const options = [...state.discoveryOptions];
    const noisy = options.some((id) => discoveryCardNoisy(state, id));
    const kept = state.cardById[cardId];
    /**
     * ⚠ 【变体1】特性 18「拾物妙手」正在"两张都留"（`discoveryKeepQueue != null`）时：
     *  - **另一张不进弃牌堆**（两张都留下，不能先丢一张再留下）
     *  - 候选**先不清空**：这一批还没结算完（最后收尾时统一清）
     */
    const keepAll = state.discoveryKeepQueue != null;
    if (!keepAll)
        state.discoveryOptions = [];
    for (const id of options) {
        if (id === cardId || keepAll)
            continue;
        const rejected = state.cardById[id];
        discardUniqueCard(state, id, 'discovery');
        if (rejected && isKeyCard(rejected)) {
            log(state, `放弃钥匙「${rejected.name}」，放入弃牌堆，钥匙架不加。`);
        }
    }
    state.lastDiscoveryCardId = cardId;
    if (actorId && kept) {
        const fx = kept.effects.filter((e) => e.op !== 'noise');
        if (fx.length)
            runEffects({ state, actorId, effects: fx });
        if (!cardBecomesPossession(kept) && !isKeyCard(kept)) {
            discardUniqueCard(state, cardId, 'discovery');
        }
        if (isKeyCard(kept)) {
            log(state, `留下钥匙，放入钥匙架。`);
        }
    }
    else if (!cardBecomesPossession(kept)) {
        discardUniqueCard(state, cardId, 'discovery');
    }
    /** 【变体1】特性 16「高度警觉」：发现算"其他来源"（压不压由 `pushNoise` 内部判） */
    if (noisy && actorId) {
        /** 【变体1】特性 11「安静搜查」：同上一处 —— **问一句**要不要取消，然后接着走 */
        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            state.pendingQuietSearch = {
                playerId: actorId,
                roomId: state.players[actorId]?.roomId ?? '',
                from: 'discovery',
            };
            log(state, '【变体1】「安静搜查」：要不要取消这次发现造成的响声？（每局一次）', 'survivor');
            return;
        }
        {
            const room = state.players[actorId]?.roomId;
            if (room)
                pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });
            log(state, '发现牌带有响声（含钥匙），无论留哪张都必须在翻牌者所在地点响。');
        }
    }
    log(state, `留下发现牌「${kept?.name ?? cardId}」。`);
    /**
     * 【变体1】特性 18「拾物妙手」：正在"两张都留"时，**第一次调用不推进流程** ——
     * 让第二张也走完同一段结算，第二次才照常进响声阶段（否则会推进两次）。
     */
    if (state.discoveryKeepBoth) {
        state.discoveryKeepBoth = false;
        return;
    }
    if (state.pendingItemDiscard)
        return;
    enterNoiseReport(state);
}

/**
 * 幸存者大回合结束的收尾。
 *
 * ⚠ **警车不在这里推进**（用户要求）：它在**修理完成时立即出现**、
 * 之后每个**幸存者大回合开始**时开一格，见 `startRound`。
 */
export function closeSurvivorBigRound(state: GameState) {
    state.killerPublicKeys = state.keysCollected;
}

/** 一名幸存者做完一般行动：立刻结束其小回合，不必再点结束 */
export function advanceAfterSurvivor(state: GameState, endedPlayerId: string) {
    const ended = state.players[endedPlayerId];
    if (ended)
        ended.actedThisRound = true;
    if (state.phase === 'gameOver')
        return;
    /**
     * ⚠ 乔治「思维敏捷」**不在这里判**（这里是小回合结束）。
     * 用户明确要求："乔治二技能要在**幸存者大回合**结束时判定是否达成条件"，
     * 所以判定挪到了 `enterNoiseReport`（大回合收尾）。
     */
    promptOrAutoNextSurvivor(state);
}

/**
 * 乔治的「思维敏捷」判定：条件满足就停下来等他挑，返回 true 表示先别往下走。
 *
 * 杀手潜行时拿不了笔记（不按进入潜行的格子，也不按潜行后的格子）。
 * 雕像是例外：主雕像潜行时，乔治仍可在**次雕像**旁边（同格或相邻）拿笔记。
 * 没人潜行时，雕像局每一尊都算杀手。
 */
export function maybeOfferGeorgeNote(state: GameState, george: PlayerState) {
    if (!isGeorge(state, george.id))
        return false;
    if (!george.alive || !george.roomId)
        return false;
    if (state.notesDeck.length === 0)
        return false;
    const killerRooms: string[] = [];
    const statues = statuePieces(state);
    if (statues.length) {
        const mainStealth = Boolean(mainStatue(state)?.stealth);
        for (const p of statues) {
            if (!p.alive || !p.roomId || p.stealth)
                continue;
            /** 主雕像正在潜行：只认次雕像 */
            if (mainStealth && p.id === state.killerId)
                continue;
            killerRooms.push(p.roomId);
        }
    }
    else {
        const k = state.killerId ? state.players[state.killerId] : null;
        if (!k?.alive || k.stealth)
            return false;
        if (k.roomId)
            killerRooms.push(k.roomId);
    }
    if (!killerRooms.length)
        return false;
    const georgeRoom = george.roomId;
    if (!georgeRoom)
        return false;
    const near = killerRooms.some(
        (room) => room === georgeRoom || generalAdjacentRooms(state.map, room).includes(georgeRoom),
    );
    if (!near)
        return false;
    state.pendingGeorgeNote = true;
    log(state, `${george.name}「思维敏捷」：小回合结束时在杀手距离 1 内，可以挑一张乔治的笔记。`, 'survivor');
    return true;
}

/** 某个门号是否连到指定房间 */
export function doorTouchesRoom(door: string, roomId: string) {
    const pair = parseDoor(door);
    return Boolean(pair && (pair[0] === roomId || pair[1] === roomId));
}

/**
 * 乔治用一张笔记（额外行动，不占一般行动，做完还能继续做一般行动）。
 * - 拆除封堵：移除他所在地点至多 2 块封堵
 * - 响声：在任意一格产生真实响声
 * - 防御：常驻效果，用物品防御时 +2，不在这里"使用"
 */
export function useGeorgeNote(state: GameState, p: PlayerState, noteId: string, toRoomId: string | null) {
    if (!isGeorge(state, p.id))
        throw new Error('乔治的笔记只能由乔治本人使用');
    if ((p.items[noteId] ?? 0) < 1)
        throw new Error('你手里没有这张笔记');
    if (state.phase !== 'survivorMain')
        throw new Error('仅幸存者阶段可以使用笔记');
    if (noteId === 'george_note_blockade') {
        const roomId = p.roomId;
        if (!roomId)
            throw new Error('不在地图上');
        const here = state.blockades.filter((id) => doorTouchesRoom(id, roomId));
        if (here.length === 0)
            throw new Error('你所在地点没有封堵可拆');
        /**
         * **由玩家选要拆哪几个**（最多 2 个）——
         * 所以这里只进入选择状态，**先不拆、也不消耗笔记**，
         * 等他确认（`confirmNoteBlockade`）才算数。
         */
        state.pendingGeorgeBlockade = {
            noteId,
            doors: here.map((id) => canonicalDoorId(id)),
            picked: [],
        };
        log(
            state,
            `${p.name} 使用「乔治的笔记」：请选择要拆除的封堵（最多 2 个，可拆的有 ${here.length} 个）。`,
        );
        return;
    }
    if (noteId === 'george_note_noise') {
        if (!toRoomId)
            throw new Error('请选择要发出响声的地点');
        if (!state.map.rooms.some((r) => r.id === toRoomId))
            throw new Error('未知地点');
        takeItem(p, noteId, 1);
        discardConsumedItem(state, noteId, 1);
        /** 【变体1】特性 16：乔治的笔记（技能产物）算"其他来源"，距离杀手 1 以内时不响 */
        pushNoise(state, toRoomId, false, { byPlayerId: p.id, source: 'skill' });
        log(state, `${p.name} 使用「乔治的笔记」，在「${roomName(state, toRoomId)}」发出响声。`);
        return;
    }
    if (noteId === 'george_note_defense') {
        throw new Error('这张笔记是常驻效果：用物品防御时自动 +2，不需要主动使用');
    }
    throw new Error('未知的笔记');
}

/**
 * 乔治「聪明绝顶」的共用前置。两个分支都要满足：
 * 自己的小回合、书本地标、同格没有杀手（潜行不算同格）、一回合一次。
 */
export function georgeBrilliantPrecheck(state: GameState, p: PlayerState) {
    if (!isGeorge(state, p.id))
        throw new Error('只有乔治可以使用这个技能');
    assertActive(state, p.id);
    assertSurvivorMainAction(p);
    if (p.skillUsedThisTurn.has('brilliant'))
        throw new Error('本回合已经用过「聪明绝顶」');
    if (!p.roomId)
        throw new Error('不在地图上');
    if (!isBookRoom(state, p.roomId))
        throw new Error('「聪明绝顶」只能在有书本标记的地点使用');
    if (killerInRoom(state, p.roomId))
        throw new Error('与杀手同地不能使用「聪明绝顶」');
}

/** 聪明绝顶 A：弃掉一个工具箱，修理进度 +1（占全队本大回合那一次修理） */
export function georgeToolboxRepair(state: GameState, p: PlayerState) {
    georgeBrilliantPrecheck(state, p);
    if ((p.items.toolbox ?? 0) < 1)
        throw new Error('你没有工具箱可以弃置');
    if (state.repairedThisPhase)
        throw new Error('本大回合已经有人修理过了');
    if (state.repairProgress >= state.rules.repairNeeded)
        throw new Error('无线电已经修好');
    const before = state.repairProgress;
    takeItem(p, 'toolbox', 1);
    discardConsumedItem(state, 'toolbox', 1);
    p.skillUsedThisTurn.add('brilliant');
    p.mainActionUsed = true;
    p.moveLeft = 0;
    state.repairedThisPhase = true;
    addRepairProgress(state, 1);
    log(state, `${p.name} 用「聪明绝顶」弃置工具箱，修理进度 +1（${state.repairProgress}/${state.rules.repairNeeded}）。`);
    announceRepairIfJustFinished(state, before);
    maybeArmRescue(state);
    advanceAfterSurvivor(state, p.id);
}

/**
 * 聪明绝顶 B：从搜索牌库抽一张。等于「特殊搜索」：
 * 同样的摸牌与响声规则，只是名字不同；响了就在乔治抽取的位置响（不是他后来的位置）。
 */
export function georgeDraw(state: GameState, p: PlayerState) {
    georgeBrilliantPrecheck(state, p);
    p.skillUsedThisTurn.add('brilliant');
    p.mainActionUsed = true;
    p.moveLeft = 0;
    const cardId = drawSearchCard(state);
    if (!cardId) {
        log(state, '搜索牌库已空，「聪明绝顶」没有抽到牌。');
        advanceAfterSurvivor(state, p.id);
        return;
    }
    const card = state.cardById[cardId];
    log(state, `${p.name} 用「聪明绝顶」抽取：${card?.name ?? cardId}。`, 'survivor');
    const makeNoise = Boolean(card?.makesNoise);
    if (card && isKeyCard(card)) {
        /** ⚠ 分头行动下钥匙**单独保管**（记到这个人身上、不上架、不报告杀手） */
        const added = addKeys(state, 1, p.id);
        /** 【杀手该知道什么】同上：钥匙上架立即告知杀手，**分头行动那支保持私密** */
        log(state, state.split
            ? `${p.name} 获得 ${added} 把钥匙（单独保管，共 ${p.keys ?? 0} 把）。`
            : added > 0
                ? `钥匙放入钥匙架（${state.keysCollected}/${state.rules.keysNeeded}）。`
                : `钥匙架已有 ${state.keysCollected}/${state.rules.keysNeeded} 把，多出来的钥匙不再上架。`,
            state.split ? 'survivor' : 'all',
            !state.split);
    }
    else if (card) {
        const gains = card.effects.filter((e) => e.op === 'gainItem');
        if (gains.length)
            runEffects({ state, actorId: p.id, effects: gains });
        else {
            runEffects({ state, actorId: p.id, effects: card.effects.filter((e) => e.op !== 'noise') });
            discardUniqueCard(state, cardId, 'search');
        }
    }
    /** 【变体1】特性 16：搜索造成的响声算"其他来源"，距离杀手 1 以内时不响 */
    if (makeNoise && p.roomId)
        pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'skill' });
    advanceAfterSurvivor(state, p.id);
}

/** 乔治挑一张笔记（可以放弃）；挑完继续轮到下一个人 */
export function chooseGeorgeNote(state: GameState, p: PlayerState, noteId: string) {
    if (!state.pendingGeorgeNote)
        throw new Error('现在不是挑笔记的时候');
    if (!isGeorge(state, p.id))
        throw new Error('只有乔治可以挑笔记');
    if (!noteId) {
        state.pendingGeorgeNote = false;
        state.georgeNoteGivenThisRound = true;
        log(state, `${p.name} 放弃了这个时机挑笔记。`, 'survivor');
        /** 继续把幸存者大回合收尾（判定已经做过了，不会再停） */
        enterNoiseReport(state);
        return;
    }
    if (!state.notesDeck.includes(noteId))
        throw new Error('这张笔记已经不在牌堆里了');
    const card = state.cardById[noteId];
    state.notesDeck = state.notesDeck.filter((id) => id !== noteId);
    p.items[noteId] = (p.items[noteId] ?? 0) + 1;
    state.pendingGeorgeNote = false;
    state.georgeNoteGivenThisRound = true;
    log(state, `${p.name} 获得笔记「${card?.name ?? noteId}」。`, 'survivor');
    enforceInventory(state, p.id);
    /** 挑完继续收尾大回合 */
    enterNoiseReport(state);
}

/** 幸存者阶段收工：进入发现。大回合的警车要等发现结束再推 */
export function finishSurvivorPhase(state: GameState) {
    if (state.pendingTrade)
        throw new Error('请先确认或取消物品交换');
    if (state.pendingCoopAction)
        throw new Error('请先确认或取消幸存者行动');
    if (state.pendingCrossbow)
        throw new Error('请先确认或取消十字弩');
    if (state.pendingGeorgeBlockade)
        throw new Error('请先确认或取消乔治的笔记');
    if (state.pendingPathDraft?.owner === 'survivor')
        throw new Error('请先确认或取消幸运币的移动');
    const left = unactedAliveSurvivorIds(state);
    for (const id of left) {
        if (survivorHasGeneralAction(state, id)) {
            throw new Error('还有幸存者可以做一般行动，不能结束');
        }
        state.players[id].actedThisRound = true;
    }
    /**
     * 雕像：**报告时机已经挪到杀手回合开始**（见 `beginKillerTurn`）——
     * 用户要求"杀手回合开始时报告被停滞的雕像"。这里不再重复报一次。
     */
    enterDiscovery(state);
}

/**
 * 【变体1】特性 12「英勇阻截」收尾：**跑掉的人脱离这次遭遇**。
 *
 * 做法：把"还留在遭遇地点"的幸存者写回 `discoveredIds`；
 *  - 当前攻击目标已经跑掉 → 退回"选目标"这一步，由杀手从剩下的人里重选；
 *  - 一个人都没剩 → 这次遭遇直接结束（回杀手回合收尾）。
 */
function settleHeroicBlock(state: GameState): void {
    state.pendingHeroicBlock = null;
    const enc = state.encounter;
    if (!enc)
        return;
    const still = survivorsInRoom(state, enc.roomId).map((s) => s.id);
    enc.discoveredIds = still;
    if (!still.length) {
        state.encounter = null;
        log(state, '被卷入的幸存者都跑掉了，这次遭遇结束。', 'all', true);
        endKillerTurn(state);
        return;
    }
    if (enc.targetId && !still.includes(enc.targetId)) {
        enc.targetId = null;
        enc.step = 'pick';
        log(state, '跑掉的人已经脱离这次遭遇，请杀手重新选择攻击目标。', 'all', true);
    }
}

/**
 * 【变体1】特性 03「狡猾诡计」：这名杀手是不是"可以弃任意手牌"？
 *
 * ⚠ **这条只跟"抽牌超上限"有关**（用户口径：「特性三只影响抽牌，
 * 不影响这种锁定牌加入手牌和雕像 4 级」）—— 锁定牌入手 / 雕像 4 级取回「圍困」
 * 那两类超额弃牌**不看**它（见 `discardKillerCard`）。
 *
 * 条件只看"当前行动的这名杀手有没有这张特性"（2对3 里按切片各算各的）。
 */
function who0HasSlyTrick(state: GameState, _cardId: string, _playerId: string): boolean {
    const kid = state.killerId;
    return Boolean(kid && hasTrait(state, kid, 'trait_k03'));
}

/**
 * 【变体1】**回合结束类杀手特性**的共同前提（01 完全围困 / 20 危险伏击）。
 *
 * 用户明确要求「**20 的条件跟 01 一样**」，所以抽成一个判断、一起改：
 *  - 本回合**没有遭遇过幸存者**（`queenEncounteredThisTurn`，
 *    这个字段名字是女王的，实际就是"杀手本回合遭遇过吗"）；
 *  - 并且**不在【潜行】**。
 */
function requireEndOfTurnTraitCondition(
    state: GameState,
    who: PlayerState,
    traitName: string,
): void {
    if (state.queenEncounteredThisTurn)
        throw new Error(`本回合已经遭遇过幸存者，不能发动「${traitName}」`);
    if (who.stealth)
        throw new Error(`不在【潜行】才能发动「${traitName}」`);
}

/**
 * 【变体1】感知**发现了幸存者**之后，把"可以发动的特性卡"挂出来等杀手决定。
 *
 * 涉及三张（卡面都写「可以」，所以要杀手自己选）：
 *  - 10 即刻反应：弃 1 张 →【移动】X1
 *  - 15 谋杀意图：弃 1 张 →【惊吓】刚发现的那批人
 *  - 16 敏锐感知：每轮一次、不弃牌 → 额外【感知】一个颜色区域
 *
 * ⚠ 只在**真的发现了人**时挂；没发现人就没什么可发动的。
 */
export function offerSenseTraits(state: GameState, witnessed: Array<{ id: string }>): void {
    if (!state.variant1 || !witnessed.length)
        return;
    const kid = state.killerId;
    if (!kid)
        return;
    const mine = state.traits[kid] ?? [];
    const usable = mine.filter((id) => {
        if (id === 'trait_k16')
            return !(state.traitUsedThisRound ?? []).includes(id);
        return id === 'trait_k10' || id === 'trait_k15';
    });
    if (!usable.length)
        return;
    state.pendingSenseTraits = true;
    state.pendingSenseWitnessed = witnessed.map((w) => w.id);
    log(
        state,
        `【变体1】感知发现了幸存者 —— 可以发动特性卡：${usable
            .map((id) => traitDef(state, id)?.name ?? id)
            .join('、')}。`,
        'killer',
    );
}

/**
 * 把本回合被停滞的雕像列进**杀手战报**（不带停滞者是谁）。
 * 由 `beginKillerTurn` 在杀手回合开始时调用一次。
 */
export function reportHaltedStatues(state: GameState) {
    if (!isStatueKiller(state))
        return;
    const halted = statuePieces(state).filter((p) => p.statueHalted);
    if (!halted.length)
        return;
    log(state, `本回合被停滞的雕像：${halted.map((p) => `${p.statueIndex} 号（${roomName(state, p.roomId)}）`).join('、')}。本回合它们的移动和搜索会被跳过。`, 'killer');
}

/** 轮到杀手了 */
export function enterKillerMain(state: GameState) {
    const kid = state.killerId;
    /**
     * 【变体1】杀手特性 14「埋伏等待」：轮到他的**第一个回合直接跳过** ——
     * 不行动、也不做回合结束的摸牌（整回合跳掉），然后轮到下一名杀手/回幸存者阶段。
     */
    if (kid && state.variant1 && (state.killerSkipFirstTurn ?? []).includes(kid)) {
        state.killerSkipFirstTurn = state.killerSkipFirstTurn.filter((id) => id !== kid);
        log(
            state,
            `【变体1】「埋伏等待」：${state.players[kid]?.name ?? kid} **跳过自己的第一个回合**。`,
            'all',
            true,
        );
        state.killerMainActionsLeft = 0;
        if (state.mode === '2v3')
            enterNextKillerTurn(state);
        else
            closeKillerRound(state);
        return;
    }
    state.phase = 'killerMain';
    beginKillerTurn(state);
}

/** 第三阶段做完（或被允许跳过）后，进入慢速牌阶段 */
export function enterKillerSlow(state: GameState) {
    if (state.phase !== 'killerMain')
        return;
    if (state.encounter)
        return;
    if (hasPendingKillerChoice(state))
        return;
    if (state.killerTurnStep === 'slow')
        return;
    state.killerTurnStep = 'slow';
    state.killerMainActionsLeft = 0;
    const k = state.killerId ? state.players[state.killerId] : null;
    if (k)
        k.actionsLeft = 0;
    log(state, '进入慢速卡牌阶段：可打出沙漏类慢速牌，然后结束回合抽牌。');
}

/** 特殊牌打完，或 2 次普通行动用光，就自动进慢速 */
export function maybeFinishKillerMain(state: GameState) {
    if (state.killerTurnStep !== 'main')
        return;
    if (hasPendingKillerChoice(state))
        return;
    if (state.encounter || state.phase === 'gameOver')
        return;
    if (state.killerMainChoice === 'special') {
        enterKillerSlow(state);
        return;
    }
    if (state.killerMainChoice === 'actions' && state.killerMainActionsLeft <= 0) {
        enterKillerSlow(state);
    }
}

/** 这场遭遇里还没挨打的幸存者 */
export function remainingEncounterTargets(state: GameState) {
    const enc = state.encounter;
    if (!enc)
        return [];
    return survivorsInRoom(state, enc.roomId).filter((s) => !(s.id in enc.defenses));
}

/** 遭遇加攻牌打出时已进杀手弃牌堆，这里只清引用（不再有重击/挥砍牌堆） */
export function discardEncounterAttackCards(state: GameState) {
    const enc = state.encounter;
    if (!enc)
        return;
    enc.attackCardId = null;
    enc.attackOptions = [];
}

/** 遭遇战斗结束：被发现的幸存者可移 1 格（杀手看不见），然后杀手摸牌结束回合 */
export function finishEncounter(state: GameState) {
    discardEncounterAttackCards(state);
    /**
     * 遭遇一结束，「重现那一次搜索引发的遭遇」这个标记就作废 ——
     * 未命名【伏擊】只在**那一次**遭遇里能用。
     */
    state.encounterFromRevealSearch = false;
    /** 这场遭遇是哪尊雕像打的（特性 02/11 要认它）—— 遭遇结束就作废 */
    state.encounterTriggerPieceId = null;
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
     * **撤离名单**：遭遇结束时**还活着、还在这场遭遇所在地点**的幸存者。
     * 不直接用 discoveredIds：它是开战那一刻的快照，
     * 有人在开战效果里倒下、或中途被打倒后，会让名单缺人或不对。
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
    /**
     * ⚠ **（甲）撤离是独立的一套：先选人，再选撤离。**
     *
     * 用户口径：「遭遇结束时先弹一个『谁来撤离』的名单让你点，
     * 选中谁谁才走」——和遭遇里"选下一名遭遇对象"同一种做法。
     *
     * 以前这里是"按队列自动来"（`targetId = queue[0]`），于是界面上
     * 没有"被选中"这一步，玩家点地图时很容易掉进普通移动那一套
     * （服务端就回「请使用逃离操作」）。
     *
     * `targetId = null` 就表示**正在等人点名单**；点了谁，谁才成为 target。
     */
    enc.targetId = null;
    log(
        state,
        `遭遇结束。${queue.length} 名幸存者需要依次撤离 —— 请点名单选择先让谁撤离（每人可移动 1 格或留在原地）。`,
        'survivor',
    );
}

/** 这场遭遇里还没撤离、还能被选中的幸存者 */
export function pendingFleeIds(state: GameState): string[] {
    const enc = state.encounter;
    if (!enc || enc.step !== 'flee')
        return [];
    return enc.fleeQueue.filter((id) => {
        const p = state.players[id];
        return Boolean(p?.alive);
    });
}

/** 谁有资格点这份"谁来撤离"的名单（共享操控模式下每个操控者都能点自己的人） */
export function canPickFleeSurvivor(state: GameState, socketId: string): boolean {
    const enc = state.encounter;
    if (!enc || enc.step !== 'flee' || enc.targetId)
        return false;
    return pendingFleeIds(state).some((id) => {
        const p = state.players[id];
        return p ? controlsPiece(state, socketId, p) : false;
    });
}

/**
 * 名单上点了某个人 → 轮到他撤离。
 *
 * 只有**名单里的活人**才能被选；选完由 `encounterFlee` 收尾。
 */
export function pickFleeSurvivor(state: GameState, targetId: string): void {
    const enc = state.encounter;
    if (!enc || enc.step !== 'flee')
        throw new Error('当前不是撤离步骤');
    const target = state.players[targetId];
    if (!target || target.faction !== 'survivor' || !target.alive)
        throw new Error('无法选择该幸存者');
    if (!enc.fleeQueue.includes(targetId))
        throw new Error('这名幸存者不需要撤离');
    enc.targetId = targetId;
    log(state, `轮到 ${target.name} 撤离：点地图选相邻 1 格后确认，或选择留在原地。`, 'survivor');
}

/**
 * 一场遭遇的撤离全部走完 → 收拾干净、交回杀手回合。
 * （撤离期间的收尾只有这一处，`encounterFlee` 和新流程都走它）
 */
export function endEncounterAndResumeKiller(state: GameState): void {
    const enc = state.encounter;
    if (enc)
        clearTrapAfterEncounter(state, enc.roomId);
    state.encounter = null;
    log(state, '遭遇结束，杀手摸牌后结束回合。');
    endKillerTurn(state);
}

/**
 * 一个人撤离完了 → 名单里去掉他。
 *
 *  - 名单空了 → 遭遇结束，杀手摸牌收尾；
 *  - 还有活人 → **回到"选人"这一步**（`targetId = null`），
 *    等玩家再点名单上的下一个（用户口径：选中谁谁才走，不按顺序自动来）。
 */
export function advanceFleeSelection(state: GameState, doneId?: string | null): void {
    const enc = state.encounter;
    if (!enc)
        return;
    /**
     * ⚠ **刚撤离完的那个人必须从名单里去掉** —— 否则名单永远不空，
     * 遭遇结束不了（这是（甲）改版的第一个 bug，由 `flee-pick-flow.mjs` 抓出来的）。
     */
    enc.fleeQueue = enc.fleeQueue.filter((id) => {
        if (doneId && id === doneId)
            return false;
        const p = state.players[id];
        return Boolean(p?.alive);
    });
    enc.targetId = null;
    const left = pendingFleeIds(state);
    if (left.length === 0) {
        endEncounterAndResumeKiller(state);
        return;
    }
    log(state, `还有 ${left.length} 名幸存者要撤离（${left.map((id) => state.players[id]?.name ?? id).join('、')}），请继续选人。`, 'survivor');
}

/** 打中一个人之后：同地还有人就再选，没有人了就结束遭遇 */
export function continueEncounterAfterHit(state: GameState) {
    const enc = state.encounter;
    if (!enc)
        return;
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
        const t = left[0];
        enc.targetId = t.id;
        enc.defenseOptions[t.id] = [];
        enc.step = 'attack';
        log(state, `下一名遭遇对象：${t.name}。攻击前再次选择是否加攻。`);
        return;
    }
    enc.targetId = null;
    enc.step = 'pick';
    log(state, `伤害成功。请再选一名幸存者继续遭遇（${left.map((s) => s.name).join('、')}）。每人攻击前都可选择是否加攻。`);
}

/** 下一次攻击重新询问加攻；上一张加攻牌只对刚才那次有效 */
export function resetEncounterAttackChoice(state: GameState) {
    const enc = state.encounter;
    if (!enc)
        return;
    enc.attackChoiceMade = false;
    enc.attackBoost = false;
    enc.attackCardId = null;
    state.encounterTailBonus = 0;
    /** 荊棘纏繞的「不能用物品」只对**本次攻击**有效，下一次攻击就清掉 */
    enc.blockItems = false;
    state.encounterBlockItems = false;
}

/** 杀手回合收尾：抽 3 张。手牌满时多的牌已正面进弃牌；进化确认 / 锁定牌超员 / 4 级封堵会停在收尾。 */
export function endKillerTurn(state: GameState) {
    if (state.encounter) {
        discardEncounterAttackCards(state);
        clearTrapAfterEncounter(state, state.encounter.roomId);
        state.encounter = null;
    }
    if (state.phase === 'gameOver')
        return;
    state.pendingMoveRange = null;
    state.pendingCardSpeed = null;
    // 回合收尾时把第三阶段的状态清干净（遭遇打断时可能还留着 1 次没用完的行动）
    state.killerMainActionsLeft = 0;
    state.killerMainChoice = null;
    /**
     * 打出的那张牌**照常进弃牌堆**（效果被遭遇中断 ≠ 这张牌没打出去）。
     * 不在这里放掉的话，下个回合打新牌时会把它从 `deferredPlayedCard` 上覆盖掉。
     */
    flushDeferredPlayedCard(state);
    /**
     * **遭遇被打断后收尾时，`phase` 还停在 `encounter`**（开战效果结算完发现
     * 同地已经没人了，走 `setEncounterOpenNoTargetsHandler` 那条路进来）。
     * 先归位到 `killerMain`：否则下面挂出来的"点门"请求客户端点不了
     * （`legalMoves` 只认 `killerMain`），人会卡在收尾这一步。
     */
    if (state.phase === 'encounter')
        state.phase = 'killerMain';
    /**
     * 2对3：**每个杀手自己的回合结束时抽 2 张**（单杀手模式仍是规则里的 3 张）。
     * 因为一轮里两名杀手各行动一次，各抽各的。
     */
    const draw = state.mode === '2v3'
        ? Math.min(2, state.rules.killerDrawOnTurnEnd)
        : state.rules.killerDrawOnTurnEnd;
    drawKillerCards(state, draw);
    maybeCloseKillerUpkeep(state);
}

/** 进化确认、弃超额、4 级封堵都做完，才真正结束杀手回合并清掉本回合 +3 */
export function maybeCloseKillerUpkeep(state: GameState) {
    if (state.phase === 'gameOver')
        return;
    // 挡住弃牌 / 长剑摸牌可能在遭遇中途升级。确认效果时遭遇还在，不能切收尾或结束回合。
    if (state.encounter)
        return;
    /**
     * ⚠ **不在杀手回合的阶段里，一律不"收尾"**（独立判断）。
     *
     * 这个函数是给"杀手回合收尾"用的，但**账可能在幸存者大回合里冒出来**：
     * 幸存者的「長劍」会让杀手摸牌，配上【变体1】03「狡猾诡计」就会
     * "先入手、等你自选弃置" —— 这时"正在行动的人"是幸存者。
     * 一路走到底会 `closeKillerTurn`：把**还没开始的杀手回合**直接勾掉、
     * 把幸存者这一轮截断（阶段还会被改成 `upkeep`）。
     *
     * 所以这里按阶段独立判断：幸存者私有阶段只当"没这回事"，
     * 欠的弃牌照样挂着（服务端的 `pendingKillerDiscards` 闸门会拦住别人，
     * 杀手那边界面上有弃牌面板，弃完这一轮正常继续）。
     */
    if (isSurvivorPrivatePhase(state))
        return;
    if (state.pendingUnlockDiscard && state.pendingKillerDiscards > 0) {
        state.phase = 'upkeep';
        /**
         * ⚠ 措辞保持中性：这一笔账现在有两个来源 ——
         * 进化入手的锁定牌/圍困，以及【变体1】03「狡猾诡计」摸进来的牌。
         * 具体是哪种，战报在"入手那一刻"已经写过了。
         */
        log(state, '手牌超过上限，请自选弃牌再结束回合。');
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
    /**
     * ⚠ **「进化效果要执行完才进行下一步骤」**（用户口径）。
     *
     * 还停在"要你选"的状态里时**不许收尾** —— 典型漏网的是**扼杀者 4 级**
     * （"在任意 2 个不同地点各放一个核心标记"）：以前这里直接
     * `closeKillerTurn`，核心标记一个没放就进了幸存者大回合
     * （用户报的「图四中扼杀者核心标记都没放就开始幸存者回合了」）。
     *
     * 清单见 `evolution.hasEvolutionChoicePending()`：选进化卡 / 解锁二选一 /
     * 超限弃牌 / 转主雕像 / 女王选地点 / 扼杀者选地点 / 核心标记落点 / 特性 17、18。
     */
    if (hasEvolutionChoicePending(state)) {
        state.phase = 'upkeep';
        return;
    }
    /**
     * ⚠ **收尾之前必须把"进化欠下的洗牌 / 摸牌"结清**（兜底闸门）。
     *
     * 那些摸牌是**这个杀手回合**的账（回合结束摸牌、以及当回合打出的
     * 「巡邏」/「重整旗鼓」等），被进化挡下时先记着，等效果结算完再补。
     * 一旦回合真的收了尾，再补就补到幸存者大回合里去了（战报还会被判成
     * 幸存者私有、杀手看不见 —— 用户报的「雕像 3 级进化后没有洗牌」）。
     *
     * `resumeDeferredDeckRecycle` 自己会在"没欠东西 / 进化还没确认"时直接返回。
     */
    resumeDeferredDeckRecycle(state);
    state.pendingKillerDiscards = 0;
    state.killerTurnPowerBonus = 0;
    closeKillerTurn(state);
}

/**
 * 2对3：本轮**还有没有没行动的杀手**。
 * `killerTurnIndex` 指向当前/下一个要行动的杀手。
 */
export function hasNextKillerThisRound(state: GameState) {
    if (state.mode !== '2v3') return false;
    if (state.killerRoundEndedByEncounter) return false;
    return state.killerTurnIndex + 1 < state.killerTurnOrder.length;
}

/**
 * 2对3：**交给下一名杀手**开始他的回合。
 *
 * 流程：幸存者大回合 →（响声报告）→ 杀手 A 的回合 → 杀手 B 的回合 → 整轮结算 → 下一轮。
 *
 * 每个杀手回合开始时：
 *  - 把当前行动杀手切到他（`switchActiveKiller`，牌库/手牌/力量各用各的）
 *  - 重新放一次爆竹标记（标记跟着杀手位置走，所以轮到谁就放在谁那格）
 *  - 先走 `noiseReport` 让他确认响声，再进杀手主阶段
 */
export function enterNextKillerTurn(state: GameState) {
    if (state.mode !== '2v3') return;
    state.killerTurnIndex += 1;
    const nextId = state.killerTurnOrder[state.killerTurnIndex];
    if (!nextId) {
        closeKillerRound(state);
        return;
    }
    switchActiveKiller(state, nextId);
    /** 新杀手上场，本回合的临时状态归零 */
    state.killerTurnPowerBonus = 0;
    state.queenEncounteredThisTurn = false;
    /** 「本回合通过秘密通道」是按杀手隔离的，换人时同样归零 */
    state.movedThroughPassageThisTurn = false;
    state.encounterOpenHold = false;
    /** 爆竹标记跟着杀手位置：轮到谁就重新放一次 */
    state.firecrackerRoomId = null;
    placeFirecrackerMarker(state);
    log(
        state,
        `轮到后手杀手「${state.players[nextId]?.name ?? nextId}」的回合。`,
        'all',
        true,
    );
    /** 响声报告：每个杀手都要自己确认一次 */
    state.phase = 'noiseReport';
    log(state, `响声阶段：${state.firecrackerThisRound
        ? '全场都有响声（爆竹）'
        : state.noises.length
            ? state.noises.map((id) => roomName(state, id)).join('、')
            : '无'}。`);
}

/**
 * 2对3：两名杀手的回合都做完了 —— 结算整轮。
 *
 * 「捕网结算推迟到所有杀手回合都结束后」：一轮 = 幸存者大回合 + 杀手 A 回合 + 杀手 B 回合，
 * 捕网要到这时候才解除（不是在先手杀手回合结束时）。
 * 另外每轮结束后先后手**互换**。
 */
export function closeKillerRound(state: GameState) {
    if (state.mode !== '2v3') {
        startRound(state);
        return;
    }
    /** 下一轮先后手互换 */
    if (state.killerTurnOrder.length === 2)
        state.killerTurnOrder = [state.killerTurnOrder[1]!, state.killerTurnOrder[0]!];
    state.killerTurnIndex = 0;
    state.killerRoundEndedByEncounter = false;
    const firstId = state.killerTurnOrder[0];
    if (firstId)
        switchActiveKiller(state, firstId);
    syncActiveKiller(state);
    startRound(state);
}

/** 杀手回合彻底结束，回到幸存者阶段（响声/爆竹等到幸存者大回合开始前再清） */
export function closeKillerTurn(state: GameState) {
    state.killerTurnPowerBonus = 0;
    /**
     * 女王**等级 1**：你的回合结束时，如果本回合中
     * **没有遭遇任何幸存者** 且 你**不在〔潜行〕**，
     * 在你的地点生成一个僵尸（满 6 个则生成被取消）。
     */
    if (isQueenKiller(state) && state.killerLevel >= 1 && !state.queenEncounteredThisTurn) {
        const q = state.killerId ? state.players[state.killerId] : null;
        if (q && !q.stealth)
            spawnZombieAtQueen(state);
    }
    /**
     * **狼人进化 4 级**：
     * 「你的回合结束时，如果本回合你没有遭遇任何幸存者且你不在〔潜行〕，
     *   〔惊吓〕距离 2 内的所有幸存者。」
     *
     * 结构与女王 1 级一致（复用同一个"本回合是否遭遇过"标记
     * `queenEncounteredThisTurn` —— 它其实是"杀手本回合遭遇过幸存者吗"）。
     */
    if (isWerewolfKiller(state) && state.killerLevel >= 4 && !state.queenEncounteredThisTurn) {
        const w = state.killerId ? state.players[state.killerId] : null;
        if (w?.roomId && !w.stealth) {
            fearAtRange(state, w.roomId, 2);
            log(
                state,
                '狼人进化 4 级：本回合未遭遇任何人且不在潜行，〔惊吓〕距离 2 内的所有幸存者。',
                'all',
                true,
            );
        }
    }
    /**
     * 【变体1】杀手特性 19「恐惧光环」：
     * 「你的回合结束时，如果在本回合你没有遭遇幸存者并且你不在〔潜行〕，
     *  〔惊吓〕**你所在地点**的所有幸存者。」
     *
     * 条件和上面女王 1 级 / 狼人 4 级完全一样（共用 `queenEncounteredThisTurn`）。
     */
    if (state.variant1 && !state.queenEncounteredThisTurn) {
        const k19 = state.killerId ? state.players[state.killerId] : null;
        if (k19 && k19.roomId && !k19.stealth && hasTrait(state, k19.id, 'trait_k19')) {
            const here = survivorsInRoom(state, k19.roomId);
            if (here.length) {
                log(
                    state,
                    `【变体1】${k19.name} 的特性「恐惧光环」：本回合未遭遇任何人且不在潜行，` +
                        `〔惊吓〕所在地点的所有幸存者。`,
                    'all',
                    true,
                );
                for (const s of here)
                    addFear(state, s.id, 1);
            }
        }
    }
    /**
     * **粘液腺體（进化卡牌）：「你的回合结束时，如果你不在〔潜行〕，
     * 在你的地点〔封堵〕×1」。**
     *
     * ⚠ 位置就在**回合结束后**（和女王 1 级、狼人 4 级同一处）。
     * ⚠ **封哪扇门由杀手自己点** —— 用户要求：
     * 「杀手该回合结束处理的让杀手处理完，处理完才给到幸存者」。
     * 所以这里挂起、`closeKillerTurn` **停在这一步不切给幸存者**；
     * 点完由 `case 'move'` 接着走 `finishKillerTurn`。
     */
    if (beginSlimeGlandPick(state)) {
        state.pendingTurnEndSwitch = true;
        /** ⚠ 停在这里：**结算完才切给幸存者**（`finishKillerTurn` 先不跑） */
        return;
    }
    finishKillerTurn(state);
}

/**
 * 杀手回合收尾的**剩余部分**：力量清零、胜负判定、切给下一方。
 *
 * 从 `closeKillerTurn` 拆出来是因为粘液腺體可能把收尾挂在"等杀手点门"上
 * —— 点完要继续从这里走完（用户要求：**处理完才给到幸存者**）。
 */
function finishKillerTurn(state: GameState) {
    /** 保護色「重现时 +3」的意向：没遭遇就作废（遭遇了的话 `startEncounter` 已经兑现） */
    state.pendingRevealPower = 0;
    /** 屏息等「持续到下回合」的力量：本回合结束就失效 */
    clearPowerUntilNextTurn(state);
    if (state.phase === 'gameOver')
        return;
    /**
     * 回合收尾统一走 `closeKillerRound`：
     *  - **1 杀手模式**：整轮 = 幸存者大回合 + 这个杀手回合，直接结算并开下一轮
     *  - **2对3**：本轮还有没行动的杀手就先交给他；两名都做完（或因遭遇双双结束）才结算整轮
     *
     * 捕网（女猎手）的解除也在 `closeKillerRound` —— 保证"所有杀手回合结束后"才结算。
     */
    if (state.mode === '2v3') {
        if (hasNextKillerThisRound(state)) {
            enterNextKillerTurn(state);
            return;
        }
        if (state.killerRoundEndedByEncounter)
            log(state, '本轮的杀手回合已因遭遇而全部结束。', 'all', true);
    }
    closeKillerRound(state);
}
/** 开战效果后同地已无人：清遭遇；未终局则摸牌结束杀手回合（给以后各自为战留路） */
setEncounterOpenNoTargetsHandler((state) => {
discardEncounterAttackCards(state);
clearTrapAfterEncounter(state, state.encounter?.roomId);
state.encounter = null;
state.encounterOpenHold = false;
if (state.phase === 'gameOver')
    return;
endKillerTurn(state);
});


/** 杀手在这个房间搜到人，开战。只有搜索才会走到这里 */
export function startEncounter(state: GameState, roomId: string) {
    const alive = survivorsInRoom(state, roomId);
    if (alive.length === 0)
        return;
    /**
     * 【变体3】计数：本大回合发生了遭遇（「火箭發射器」要判"上一个回合没有遭遇"）。
     * 在**大回合开头**读一次就归零，见 `checkPlanRoundStartWins`。
     */
    state.encountersThisRound = (state.encountersThisRound ?? 0) + 1;
    /**
     * **这次遭遇是不是"重现时那一次强制搜索"引发的？**
     * 未命名【伏擊】和谋杀者 2 级的"重现时"都特指**这一次**。
     * 标记在遭遇结束 / 新回合开始时清掉。
     */
    state.encounterFromRevealSearch = Boolean(state.revealSearchHappened);
    state.revealSearchHappened = false;
    /**
     * **遭遇打断「当前这张牌」剩下的效果**（用户规则）：
     * 只有"当前牌上写在**搜索之后**的效果"才中断 —— 全项目扫下来唯一一张是
     * 【追蹤】（〔搜索〕＋展示距离），命中开战后「展示距离」跳过。
     * 别的一概不受影响（比如屏息的 +3 力量是一结算就直接加上的）。
     */
    interruptCurrentCardEffects(state);
    /**
     * **保護色「重現時 +3 力量」在这里兑现。**
     *
     * 牌面写「重現時+3力量」，用户明确：**特指重现后那一次搜索若发生遭遇**，
     * +3 力量且**持续到此次遭遇结束**。
     *
     * 所以重现时只是把意向挂在 `pendingRevealPower` 上（那时还不知道会不会遭遇），
     * 真开战了才转成实际力量。走 `addKillerTurnPower`（本回合力量）：
     * 遭遇结束后杀手**直接结束回合**，所以"本回合"就等于"本次遭遇"，
     * 而且回合结束会自动清零，不用额外收拾。没遭遇的话这个意向在
     * `closeKillerTurn` 里作废。
     */
    if ((state.pendingRevealPower ?? 0) > 0) {
        const bonus = state.pendingRevealPower;
        state.pendingRevealPower = 0;
        addKillerTurnPower(state, bonus);
        log(state, `保護色：重现后的这次搜索遭遇了幸存者，本次遭遇 +${bonus} 力量。`, 'all', true);
    }
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
        executeArmed: false,
        executeStatueId: null,
    };
    state.encounter = encounter;
    state.phase = 'encounter';
    state.pendingMoveRange = null;
    state.pendingCardSpeed = null;
    state.lastSearchFound = false;
    /**
     * 女王等级 1 用：本回合**遭遇过**幸存者。
     * 2对3 里这是"**这个杀手**本回合遭遇过吗"（他的切片在回合开始时已清零），
     * 狼人 4 级 / 女王 1 级都按各自回合判定。
     */
    state.queenEncounteredThisTurn = true;
    /**
     * 2对3：**任一杀手发生遭遇，本轮两名杀手都不再行动**。
     * 这里一开战就记下来，等这个杀手的遭遇结束、回合收尾时直接跳到整轮结算，
     * 没轮到的后手杀手本轮不会再上场。
     */
    if (state.mode === '2v3')
        state.killerRoundEndedByEncounter = true;
    log(state, `遭遇战爆发于「${roomName(state, roomId)}」！${alive.map((s) => s.name).join('、')} 被卷入。`, 'all', true);
    if (trapArmed) {
        log(state, `「${roomName(state, roomId)}」有陷阱：本场遭遇中第一名被攻击的幸存者必须获得防御 +2。`);
    }
    applyEncounterOpenEffects(state);
    /**
     * 【变体1】特性 12「英勇阻截」：遭遇爆发、**告知杀手发现名单之后**，
     * 让持有这张卡的人自己决定要不要发动（卡面写"可以"）。
     * 挂起之后由 `useTrait` 处理"发动 / 不发动"与"逐个选方向"。
     */
    if (state.variant1) {
        /**
         * ⚠ **顺序（用户明确）：先看杀手取不取消，再看幸存者用不用 12**。
         * 杀手有「玩弄猎物」且还没用掉时，先停下来等他决定；
         * 他**不取消**（或没有这张卡）才轮到幸存者的「英勇阻截」。
         *
         * ⚠ **特性归属（用户口径）**：特性卡一局只发一份、挂在**主雕像**上
         * （这样 12 这种常驻"力量 +1"只结算一次，不会 4 尊各加一次）。
         * 所以这里按"**当前这名杀手**（含他的全部雕像）"查，而不是按某尊棋子查 ——
         * 但也不能跨到另一名杀手身上（2对3 里两个杀手的特性不能弄混）。
         */
        if (state.killerId && traitAvailableForKiller(state, 'trait_k02')) {
            state.pendingPreyOffer = true;
            log(
                state,
                '【变体1】遭遇爆发 —— 杀手可以先决定要不要用「玩弄猎物」**取消这次遭遇**。',
                'killer',
            );
        }
        else {
            offerHeroicBlock(state, alive);
        }
    }
}

/**
 * 【变体1】特性 12「英勇阻截」：遭遇爆发后，问持有人要不要让其他幸存者各移 1 格。
 *
 * ⚠ 只在**杀手放弃取消遭遇之后**才调用（顺序见 `startEncounter`）。
 */
function offerHeroicBlock(state: GameState, alive: PlayerState[]): void {
    const holder = alive.find((s) => traitAvailable(state, s.id, 'trait_s12'));
    if (!holder)
        return;
    state.pendingHeroicBlock = {
        holderId: holder.id,
        started: false,
        queue: [],
        moved: [],
    };
    log(
        state,
        `【变体1】${holder.name} 有「英勇阻截」—— 要不要让其他幸存者各【移动】1 格逃离这次攻击？`,
        'survivor',
    );
}

/** 刚才那次搜索抓到人了吗？抓到才开战 */
export function maybeStartEncounter(state: GameState) {
    if (!state.rules.enableEncounter)
        return;
    if (state.encounter)
        return;
    if (state.phase === 'gameOver')
        return;
    /**
     * 雕像（圍困/釋放）搜索命中：开战房间是那尊雕像所在的格子，
     * 而不是「主雕像」所在的格子。
     */
    const statueRoom = state.statueEncounterRoom;
    if (statueRoom) {
        state.statueEncounterRoom = null;
        const here = survivorsInRoom(state, statueRoom);
        if (here.length) {
            startEncounter(state, statueRoom);
            return;
        }
    }
    if (!state.lastSearchFound)
        return;
    const kid = state.killerId;
    if (!kid)
        return;
    const k = state.players[kid];
    if (!k?.roomId || !k.alive)
        return;
    const here = survivorsInRoom(state, k.roomId);
    if (here.length === 0)
        return;
    startEncounter(state, k.roomId);
}

/**
 * 这一击的攻击力。
 * 力量（永久 / 本回合 / 持续 / 下一次攻击 / 永久加攻）已经收成一个数，并且不超过上限。
 * 攻击牌的「本次 +N」另加，不算进力量上限。
 * 女王只算遭遇地点里的女王和僵尸：女王不在场就是 0，每个僵尸各一份同样的力量。
 */
function encounterStrike(state: GameState, roomId: string): {
    totalAtk: number;
    powerNow: number;
    queenHere: boolean;
    zombieAdd: number;
    zombieN: number;
    tempBoost: number;
} {
    const killer = state.killerId ? state.players[state.killerId] : null;
    const tempBoost = state.encounterTailBonus ?? 0;
    const powerNow = effectiveKillerPower(state);
    const queen = isQueenKiller(state);
    const queenHere = queen && Boolean(killer?.roomId && killer.roomId === roomId);
    const basePower = queen ? (queenHere ? powerNow : 0) : powerNow;
    const zombieN = queen ? zombiesIn(state, roomId).length : 0;
    const zombieAdd = queen ? zombieN * powerNow : 0;
    return {
        totalAtk: basePower + tempBoost + zombieAdd,
        powerNow,
        queenHere,
        zombieAdd,
        zombieN,
        tempBoost,
    };
}

/** 比大小：力量 + 永久加攻 + 本次卡牌加攻 vs 加防物品（+ 威廉坚韧）
 *  `diceValues` 有值就用它（「鸿运当骰」重掷后的点数），否则现掷。 */
export function resolveEncounterCombat(state: GameState, diceValues: number[] | null) {
    const enc = state.encounter;
    if (!enc || !state.killerId)
        return;
    if (!state.players[state.killerId])
        return;
    const survId = enc.targetId;
    if (!survId)
        return;
    const surv = state.players[survId];
    if (!surv?.alive) {
        log(state, '遭遇对象已倒下，遭遇结束。');
        endKillerTurn(state);
        return;
    }
    const { totalAtk, powerNow, queenHere, zombieAdd, zombieN, tempBoost } = encounterStrike(state, enc.roomId);
    const parts = [isQueenKiller(state)
        ? (queenHere ? `女王力量 ${powerNow}` : '女王不在本地点（0）')
        : `力量 ${powerNow}`];
    if (zombieAdd)
        parts.push(`${zombieN} 个僵尸各 ${powerNow}（+${zombieAdd}）`);
    if (tempBoost) {
        const cardName = enc.attackCardId ? state.cardById[enc.attackCardId]?.name : null;
        parts.push(cardName ? `「${cardName}」本次 +${tempBoost}` : `本次加攻 +${tempBoost}`);
    }
    log(state, `遭遇攻击力：${totalAtk}（${parts.join(' + ')}）。`, 'all', true);
    /** 「下一次攻击」的加成用掉就清 */
    state.pendingAttackPower = 0;
    const trapBonus = enc.trapArmed && !enc.trapApplied ? 2 : 0;
    let defenseValue = 0;
    /**
     * 骰子以外的防御加成：**陷阱、刚毅之盾、防御物品（含乔治笔记）、特性 17**。
     *
     * 威廉「坚韧不拔」和【变体1】特性 05「武艺超群」**都只在这一项为 0 时**触发 ——
     * 两者是同一条规则，**各自独立结算**（同时满足就是 +2）。
     * 用户口径：**鼓励标记不算**（不影响这两个技能），**陷阱标记才算**。
     */
    let otherDefenseBoost = 0;
    /**
     * 欧菲莉亚「鼓励标记」的**遭遇时机**：
     * 在「杀手加攻之后、幸存者加防御之前」自动生效 —— 该幸存者 +1 防御。
     * 满足条件必须自动使用，用掉后弃置。
     *
     * ⚠ **不计入 `otherDefenseBoost`**（用户口径：鼓励标记不会影响威廉「坚韧不拔」
     * 和特性 05「武艺超群」）—— 标记不是"幸存者用物品给自己加防"，
     * 所以加了这 +1 照样能拿威廉/05 的 +1。
     */
    if (surv.encourageToken) {
        surv.encourageToken = false;
        defenseValue += 1;
        log(state, `${surv.name} 的鼓励标记自动生效：本次遭遇防御 +1。`, 'all', true);
    }
    /**
     * **【墓穴遗物】剛毅之盾**：+1 防御值，**每次遭遇都能用**，
     * 而且**不占「防御物品」的名额** —— 上面那件防御物品照样能用。
     *
     * ⚠ 现在是**玩家在防御选项里勾选**才生效（用户要求：
     * 「剛毅之盾在防御时也要有选项，只是不占用防御物品名额」），
     * 所以看的是 `enc.shieldUsed`，不再是"持有就自动 +1"。
     *
     * ⚠ 它计入「其他防御加成」，所以会占掉威廉「坚韧不拔」的 +1
     * （威廉的条件是"没有因其他原因增加防御"）—— 这是规则的自然结果。
     */
    const relicShield = enc.shieldUsed?.[survId] ? shieldDefenseBonus(state, surv) : 0;
    if (relicShield > 0) {
        defenseValue += relicShield;
        otherDefenseBoost += relicShield;
        log(state, `${surv.name} 的遗物「剛毅之盾」生效：本次遭遇防御 +${relicShield}。`, 'all', true);
    }
    /**
     * 【变体3】**燃燒瓶**：「每次攻擊僅限一次，你可以**棄掉**一個威士忌酒瓶來 +2 防禦值。
     * （如果可以，你還能如常使用其他物品來繼續增強自己的防禦）」。
     *
     * 用户口径：
     *  - 酒瓶是**弃置**（在 `confirmWhiskeyDefense` 里已经进弃牌堆了）；
     *  - **不算使用物品**、**不占防御物品名额** → 所以这里
     *    **不写进 `otherDefenseBoost`**（不影响威廉「坚韧不拔」/ 特性 05 的 +1），
     *    也和剛毅之盾、乔治笔记各走各的。
     */
    if (enc.whiskeyUsed?.[survId]) {
        defenseValue += 2;
        log(state, `【变体3】${surv.name} 弃置的威士忌酒瓶（燃燒瓶）：本次遭遇防御 +2（不算使用物品、不占名额，也不影响坚韧不拔 / 武艺超群）。`, 'survivor');
    }
    const itemId = enc.defenseItems?.[survId] ?? null;
    if (itemId) {
        /**
         * 【变体1】特性 17「秘密武器」：**视为一个 +4 防御值的物品**。
         * 所以走的是和普通防御物品**完全同一条路**（计入 `otherDefenseBoost`、
         * 触发乔治笔记、占掉威廉/05 的 +1），只是不消耗任何背包物品，
         * 用完把这张特性标记成"已用"（卡面变暗）。
         */
        const isSecretWeapon = itemId === 'trait_s17';
        if (isSecretWeapon) {
            markTraitUsed(state, 'trait_s17');
            log(
                state,
                `【变体1】${surv.name}「秘密武器」：展示本卡牌，视为一个 +4 防御值的物品。`,
                'all',
                true,
            );
        }
        const itemBonus = isSecretWeapon ? 4 : applyDefenseItem(state, survId, itemId);
        if (itemBonus > 0) {
            defenseValue += itemBonus;
            otherDefenseBoost += itemBonus;
        }
    }
    /**
     * **乔治的笔记**：用物品防御时额外 +2（加在物品加成之上，不消耗）。
     *
     * ⚠ 判定条件是「这次防御**用了任何防御物品**」，**剛毅之盾也算一件防御物品**
     * （用户口径：「剛毅之盾其他方面应该视为普通的防御物品，只是它不占防御物品
     * 使用名额…比如它**应该能吃到乔治的防御笔记**」）。
     *
     * 所以这一条必须放在"普通防御物品 / 剛毅之盾"两个分支**外面**，
     * 而且只算一次（两个都用也只 +2）。
     */
    if (itemId || relicShield > 0) {
        const noteBonus = georgeDefenseNoteBonus(state, surv);
        if (noteBonus > 0) {
            defenseValue += noteBonus;
            otherDefenseBoost += noteBonus;
            log(state, `${surv.name}「乔治的笔记」：使用物品防御，额外 +${noteBonus}。`);
        }
    }
    if (trapBonus) {
        enc.trapApplied = true;
        defenseValue += trapBonus;
        /**
         * ⚠ **陷阱标记计入 `otherDefenseBoost`**（用户口径：「鼓励标记不会影响
         * 威廉和特性 05，**陷阱标记才会**」）—— 所以场上有必触发陷阱时，
         * 威廉「坚韧不拔」/ 特性 05「武艺超群」的 +1 都不触发。
         */
        otherDefenseBoost += trapBonus;
        log(state, `${surv.name} 必须使用陷阱，防御 +${trapBonus}。`);
    }
    const dieFaces = [1, 0, 1, 1, 0, 3];
    const nDice = Math.max(2, 4 - Math.min(surv.fear, 2));
    const rawValues = diceValues && diceValues.length
        ? [...diceValues]
        : Array.from({ length: nDice }, () => dieFaces[Math.floor(Math.random() * dieFaces.length)]);
    /**
     * **狼人宝箱的「银质子弹」**：需要左轮手枪，**掷出的所有 1 或 3 都视作 5**。
     * 它改的是骰面，不是固定加成 —— 所以在算总数**之前**替换。
     * （`applyDefenseItem` 只负责弃掉那颗子弹，替换在这里做。）
     */
    const silverBullet = itemId === 'silver_bullet';
    const values = silverBullet ? rawValues.map((v) => (v === 1 || v === 3 ? 5 : v)) : rawValues;
    if (silverBullet) {
        log(
            state,
            `${surv.name} 的「银质子弹」生效：掷出的 1 或 3 都当作 5（${rawValues.join('+')} → ${values.join('+')}）。`,
            'all',
            true,
        );
    }
    const diceTotal = values.reduce((a, b) => a + b, 0);
    defenseValue += diceTotal;
    if (hasTenacity(state, surv)) {
        if (otherDefenseBoost > 0) {
            log(state, `${surv.name}「坚韧不拔」未触发：本场已有其他防御加成。`);
        }
        else {
            defenseValue += 1;
            log(state, `${surv.name}「坚韧不拔」：未因其他原因增加防御，防御 +1。`);
        }
    }
    /**
     * 【变体1】幸存者特性 05「武艺超群」：和威廉「坚韧不拔」**同一条规则**，
     * 但**各自独立结算** —— 两个都满足就是 +2。
     *
     * 用户要求"使用特性要对杀手说明"，所以这条写**双方战报**（`'all'`）。
     */
    if (state.variant1 && hasTrait(state, survId, 'trait_s05')) {
        if (otherDefenseBoost > 0) {
            log(state, `【变体1】${surv.name}「武艺超群」未触发：本场已有其他防御加成。`, 'all', true);
        }
        else {
            defenseValue += 1;
            log(state, `【变体1】${surv.name}「武艺超群」：未使用物品加防，防御 +1。`, 'all', true);
        }
    }
    /**
     * 【变体1】幸存者特性 15「吉人天相」：一次遭遇里**投掷结果全是 0** → 算作防御成功。
     * （骰面上「0」是空面，正常算 0 点；这一条把它变成"必定防住"。）
     */
    const luckyAllZero =
        state.variant1 && hasTrait(state, survId, 'trait_s15') && values.length > 0 && values.every((v) => v === 0);
    if (luckyAllZero) {
        log(state, `【变体1】${surv.name}「吉人天相」：投掷结果全是 0，本场**算作防御成功**。`, 'all', true);
    }
    state.lastDiceRoll = {
        id: Date.now(),
        values,
        total: diceTotal,
        attack: totalAtk,
        success: luckyAllZero || defenseValue >= totalAtk,
        survivorName: surv.name,
    };
    log(state, `${surv.name} 掷骰 ${values.join('+')}=${diceTotal}，防御合计 ${defenseValue}。`, 'all', true);
    /**
     * 【處決】判定：
     *   条件 = 该幸存者的防御总和 + 3 ≤ 杀手力量总和
     *   （等价于 力量总和 >= 防御总和 + 3）
     * 力量总和 = 力量 + 永久加攻 + 本次卡牌加攻；防御总和 = 物品/陷阱/坚韧 + 骰子。
     *
     * 作用范围：**只有本次攻击的目标**。
     * 一场遭遇若卷入 3 名幸存者，杀手在第 2 次攻击前用處決，
     * 就只在这一击结算后判定第 2 名角色 —— 第 1、3 名完全不受影响。
     *
     * 不满足条件：牌白打了（不加攻击），但普通攻击照常结算 ——
     * 力量总和仍大于幸存者防御的话，这次攻击依然生效。
     */
    if (enc.executeArmed) {
        enc.executeArmed = false;
        const execId = enc.executeStatueId ?? state.killerId;
        const execStatue = execId ? state.players[execId] : null;
        const execPower = execStatue
            ? effectiveKillerPower(state) + (state.encounterTailBonus ?? 0)
            : totalAtk;
        if (execPower >= defenseValue + 3) {
            log(state, `處決生效：力量 ${execPower} 高出 ${surv.name} 的防御 ${defenseValue} 达 3 点以上，消灭目标。`, 'all', true);
            applyDamage(state, survId, 99, execId ?? state.killerId ?? survId, { eliminate: true });
            continueEncounterAfterHit(state);
            return;
        }
        log(state, `處決未生效：力量 ${execPower} 未高出 ${surv.name} 的防御 ${defenseValue} 达 3 点，本次攻击照常结算。`, 'all', true);
    }
    const blocked = defenseValue >= totalAtk;
    if (blocked) {
        log(state, `${surv.name} 完全挡住了攻击（防御 ${defenseValue} ≥ 攻击 ${totalAtk}）。`, 'all', true);
        /**
         * 【变体3】反擊三张卡的**防御成立 → 立刻获胜**条件（都在"完全挡住"这一刻判）：
         *  - 暗中伏擊：防御值**高出杀手力量至少 3 点**
         *  - 奧術封印：**在螺旋地点**用**長劍**成功防御
         *
         * 判完照常走收尾（`finishEncounter` 遇到 `gameOver` 会直接把遭遇收掉）。
         */
        if (planImplActive(state, 'winOnDefenseOverPower3') && defenseValue >= totalAtk + 3) {
            planWinSurvivors(
                state,
                '暗中伏擊',
                `${surv.name} 的防御 ${defenseValue} 高出杀手的力量 ${totalAtk} 达 3 点以上。`,
            );
        }
        else if (
            planImplActive(state, 'winOnSwordDefenseAtSpiral') &&
            itemId === 'longsword' &&
            roomHasTag(state, enc.roomId, 'special-spiral')
        ) {
            planWinSurvivors(
                state,
                '奧術封印',
                `${surv.name} 在螺旋地点「${roomName(state, enc.roomId)}」用長劍成功防御（防御 ${defenseValue} ≥ 攻击 ${totalAtk}）。`,
            );
        }
        discardFromKillerDeck(state, 2);
        finishEncounter(state);
        return;
    }
    applyDamage(state, survId, 1, state.killerId);
    continueEncounterAfterHit(state);
}

/** 手里有几张「鸿运当骰」（每张给 1 次重掷机会，一次可选任意颗骰子） */
export function luckyDiceCount(p: PlayerState) {
    return p.items.lucky_dice ?? 0;
}

/**
 * 遭遇防御掷骰。掷完先给客户端看点数：
 * 手里有「鸿运当骰」就停下来等他用不用重掷；没有就直接结算。
 */
export function rollEncounterDefense(state: GameState) {
    const enc = state.encounter;
    if (!enc?.targetId)
        return;
    const surv = state.players[enc.targetId];
    if (!surv?.alive)
        return;
    const dieFaces = [1, 0, 1, 1, 0, 3];
    const nDice = Math.max(2, 4 - Math.min(surv.fear, 2));
    const values = Array.from({ length: nDice }, () => dieFaces[Math.floor(Math.random() * dieFaces.length)]);
    const totalAtk = encounterStrike(state, enc.roomId).totalAtk;
    const extra = luckyDiceCount(surv);
    if (extra <= 0) {
        resolveEncounterCombat(state, values);
        return;
    }
    state.pendingDice = { playerId: surv.id, values, attack: totalAtk, extra };
    state.pendingExtraRerolls = extra;
    log(state, `${surv.name} 掷骰 ${values.join('+')}。手里有「鸿运当骰」，可以先决定要不要重掷。`, 'survivor');
}

/**
 * 「鸿运当骰」重掷：由掷骰的幸存者挑**任意几颗**骰子重掷（只重掷选中那些）。
 * 它不算防御物品 —— 和加防物品互不影响，可以同时用（先选用不用加防物品，再决定重掷）。
 * 每用一次消耗 1 张牌；重掷后的结果无论好坏都要接受。
 */
export function rerollEncounterDice(state: GameState, p: PlayerState, diceIndexes: number[]) {
    const pend = state.pendingDice;
    if (!pend)
        throw new Error('现在没有待重掷的骰子');
    if (pend.playerId !== p.id)
        throw new Error('不是你的骰子');
    if (state.pendingExtraRerolls <= 0)
        throw new Error('本场已经用过重掷了');
    const picked = [...new Set(diceIndexes)].filter((i) => i >= 0 && i < pend.values.length);
    if (picked.length === 0)
        throw new Error('请先点选要重掷的骰子');
    const card = Object.values(state.cardById).find((c) => c.effects.some((e) => e.op === 'luckyDice'))
        ?? Object.values(state.cardById).find((c) => c.effects.some((e) => e.itemId === 'lucky_dice'));
    const dieFaces = [1, 0, 1, 1, 0, 3];
    const before = [...pend.values];
    for (const i of picked) {
        pend.values[i] = dieFaces[Math.floor(Math.random() * dieFaces.length)];
    }
    /** 用掉一张「鸿运当骰」（它进过装备栏，所以是消耗品） */
    takeItem(p, 'lucky_dice', 1);
    state.pendingExtraRerolls -= 1;
    // 界面读的是 pendingDice.extra，一起同步
    pend.extra = state.pendingExtraRerolls;
    log(state, `${p.name} 使用「${card?.name ?? '鸿运当骰'}」重掷 ${picked.length} 颗骰子：` +
        `${before.join('+')} → ${pend.values.join('+')}。`);
}

/** 重掷完（或者不重掷）就按当前点数结算 */
export function resolvePendingEncounterDice(state: GameState) {
    const pend = state.pendingDice;
    if (!pend)
        throw new Error('现在没有待结算的骰子');
    const values = [...pend.values];
    state.pendingDice = null;
    state.pendingExtraRerolls = 0;
    resolveEncounterCombat(state, values);
}

/** 对局已经结束，或者还没轮到你，就不许动手 */
export function assertActive(state: GameState, playerId: string) {
    if (state.phase === 'gameOver')
        throw new Error('对局已结束');
    /**
     * 1对3：**三名幸存者可以同时行动，互不限制**。
     * 每人只操控自己的角色，所以「是不是当前行动者」这一条对幸存者不适用 ——
     * 由 `assertSurvivorMainAction`（查 `actedThisRound` / `mainActionUsed`）来兜底，
     * 保证每人本大回合只做一次一般行动。
     * 杀手仍走下面的 active 判定。
     */
    const p = state.players[playerId];
    if ((state.mode === 'multi' || state.mode === '2v3') && p?.faction === 'survivor')
        return;
    const active = activePlayerId(state);
    if (active !== playerId)
        throw new Error('还没轮到你');
}

export function assertSurvivorMainAction(p: PlayerState) {
    if (p.faction !== 'survivor')
        throw new Error('只有幸存者可以执行');
    if (!p.alive)
        throw new Error('已倒下');
    if (p.mainActionUsed)
        throw new Error('本回合主要行动已使用');
}

/** 一般行动：移动 / 搜索 / 修理 / 特殊 / 拆封堵 / 消恐惧。额外行动和交换不算。 */
export function survivorHasGeneralAction(state: GameState, playerId: string) {
    const p = state.players[playerId];
    if (!p?.alive || p.faction !== 'survivor' || p.mainActionUsed)
        return false;
    if (p.roomId)
        return true;
    if (p.fear > 0 || p.overFear)
        return true;
    /**
     * 可治疗的同伴：受伤的**或已中毒的**（女王规则：健康但中毒也能治）。
     * 医药包还能治「健康但有恐惧」的，所以它单独用 `clearsFear = true` 判一次 ——
     * 不能让草药也把「只有恐惧」的人当成可治目标，那样是白费草药。
     */
    if ((p.items.herb ?? 0) > 0 && healableAlliesHere(state, playerId).length > 0)
        return true;
    if ((p.items.marco_medkit ?? 0) > 0 &&
        !personalItemBlockReason(state, p.id, 'marco_medkit') &&
        healableAlliesHere(state, playerId, true).length > 0) {
        return true;
    }
    const ch = state.characters.find((c) => c.id === p.characterId);
    if (ch?.skills.some((s) => s.id === 'resourceful') && !p.skillUsedThisTurn.has('resourceful')) {
        if (survivorDiscardHasItem(state, 'adrenaline') || survivorDiscardHasItem(state, 'sedative')) {
            return true;
        }
    }
    return false;
}

export function killerMainWorkDone(state: GameState) {
    if (state.killerMainChoice === 'special')
        return true;
    if (state.killerMainChoice === 'actions' && state.killerMainActionsLeft < 2)
        return true;
    return false;
}

export function killerHasMainOption(state: GameState) {
    const k = state.killerId ? state.players[state.killerId] : null;
    if (!k?.alive)
        return false;
    if (k.roomId)
        return true;
    return state.killerHand.some((id) => {
        const card = state.cardById[id];
        if (!card)
            return false;
        if (effectiveCardSpeed(state, card) !== 'special')
            return false;
        return state.killerHand.length - 1 >=
            killerCardCostAfterDiscount(cardHandCost(card), huntressCostDiscount(state));
    });
}

export function assertKillerMainMayLeave(state: GameState) {
    if (state.killerTurnStep !== 'main')
        return;
    if (killerMainWorkDone(state))
        return;
    if (!killerHasMainOption(state))
        return;
    throw new Error('第三阶段必须进行 1–2 次行动，或打出 1 张特殊行动牌');
}

/** 杀手牌让他一步步走：点到一个相邻房间 */
export function completePendingCardMove(state: GameState, playerId: string, toRoomId: string) {
    const done = completeKillerCardMove(state, toRoomId);
    if (!done)
        return;
    const speed = state.pendingCardSpeed;
    if (!hasPendingKillerChoice(state)) {
        state.pendingCardSpeed = null;
        maybeStartEncounter(state);
        if (speed === 'special')
            maybeFinishKillerMain(state);
    }
}

/** 杀手说“走到这里就停 / 留在原地” */
export function finishPendingCardMove(state: GameState) {
    finishKillerCardMove(state);
    const speed = state.pendingCardSpeed;
    if (!hasPendingKillerChoice(state)) {
        /** 牌的效果全跑完了：把打出的这张牌推进弃牌堆 */
        flushDeferredPlayedCard(state);
        state.pendingCardSpeed = null;
        maybeStartEncounter(state);
        if (speed === 'special')
            maybeFinishKillerMain(state);
    }
}

/**
 * 弃牌堆移除选完之后往下走。
 * 變形走打牌队列；戰鬥適應还停在遭遇的攻击步骤，选完才进入防御。
 */
function finishDiscardRemove(state: GameState) {
    if (state.phase === 'encounter' && state.encounter?.step === 'attack') {
        state.encounter.step = 'defend';
        return;
    }
    /**
     * ⚠ **必须走 `resumeAfterKillerChoice`（打牌流程的真正出口）**，
     * 不能只 `continueKillerQueue` —— 那样"打出的这张牌"不会落定、
     * 速度标记不会清掉，**回合也永远停在 main、进不了慢速阶段**
     * （用户报的"【變形】做完后没有自动转到慢速阶段"）。
     */
    resumeAfterKillerChoice(state);
}

/** 封堵、感知等点选完成后，继续结算这张牌剩下的效果 */
export function resumeAfterKillerChoice(state: GameState) {
    if (hasPendingKillerChoice(state))
        return;
    continueKillerQueue(state);
    if (hasPendingKillerChoice(state))
        return;
    /** 效果全跑完了：把打出的这张牌推进弃牌堆 */
    flushDeferredPlayedCard(state);
    state.pendingCardSpeed = null;
    maybeStartEncounter(state);
    maybeFinishKillerMain(state);
}

export function assertTradeLegal(state: GameState, giver: PlayerState, target: PlayerState, itemId: string, amount: number, receiveItemId: string | null | undefined) {
    if (!giver?.alive || giver.faction !== 'survivor')
        throw new Error('给予者无效');
    if (!target?.alive || target.faction !== 'survivor')
        throw new Error('目标无效');
    if (target.id === giver.id)
        throw new Error('不能给自己');
    if (target.roomId !== giver.roomId || !giver.roomId)
        throw new Error('必须在同一地点');
    if (itemId === 'key' || receiveItemId === 'key')
        throw new Error('钥匙不能当作装备交换');
    if (amount <= 0)
        throw new Error('数量无效');
    if ((giver.items[itemId] ?? 0) < amount)
        throw new Error('物品不足');
    if (receiveItemId) {
        if ((target.items[receiveItemId] ?? 0) < 1)
            throw new Error('对方没有这件装备');
        /**
         * ⚠ **不再因为"换完会超员"拒绝**（用户口径：「幸存者**任何时候**物品栏超限
         * 都是**选择弃置**」）—— 换完谁超员，就挂出"请自选弃置"让他自己挑。
         * 以前这里直接抛错，等于把"超限"这件事挡在门外，玩家只能干看着。
         */
    }
    /**
     * ⚠ 同理：**对方栏满也能给**（用户口径：「马尔科物品满时拿镇静剂或肾上腺素
     * 应该是选择弃置」）。以前这里抛「对方装备栏已满，只能互换」，
     * 现在改成"收下 → `applyResolvedTrade` 里挂 `pendingItemDiscard` 让他自己弃"。
     */
}

export function applyResolvedTrade(state: GameState, giver: PlayerState, target: PlayerState, itemId: string, amount: number, receiveItemId: string | null | undefined) {
    if (receiveItemId) {
        takeItem(giver, itemId, amount);
        takeItem(target, receiveItemId, 1);
        giver.items[receiveItemId] = (giver.items[receiveItemId] ?? 0) + 1;
        target.items[itemId] = (target.items[itemId] ?? 0) + amount;
        log(state, `${giver.name} 用 ${itemName(itemId)} 与 ${target.name} 交换了 ${itemName(receiveItemId)}。`);
        /**
         * ⚠ **换完谁超员就请他自选弃置**（用户口径：「幸存者任何时候物品栏超限
         * 都是选择弃置」）。`pendingItemDiscard` 只记得下一个人，所以先记接受方；
         * 交换是 1 换 1、两边件数不变，一般轮不到给予者（只有 amount > 1 才可能）。
         */
        enforceInventory(state, target.id);
        if (!state.pendingItemDiscard)
            enforceInventory(state, giver.id);
    }
    else {
        takeItem(giver, itemId, amount);
        target.items[itemId] = (target.items[itemId] ?? 0) + amount;
        log(state, `${giver.name} 将 ${amount}×${itemName(itemId)} 交给 ${target.name}。`);
        /** 收下之后超了 → **他自己**选弃哪件（以前是直接拒绝这笔给予） */
        enforceInventory(state, target.id);
    }
}

export function expirePendingTrade(state: GameState) {
    const offer = state.pendingTrade;
    if (!offer)
        return;
    if (state.phase !== 'survivorMain') {
        state.pendingTrade = null;
        return;
    }
    const giver = state.players[offer.fromPlayerId];
    const target = state.players[offer.targetPlayerId];
    /** 【分头行动】钥匙交换：按钥匙自己的规则判失效（不看背包物品） */
    if (offer.kind === 'keys') {
        const ok = Boolean(
            giver?.alive && target?.alive &&
            giver.roomId && giver.roomId === target.roomId &&
            (giver.keys ?? 0) >= offer.amount,
        );
        if (!ok) {
            log(state, '待确认的钥匙交换已失效。');
            state.pendingTrade = null;
        }
        return;
    }
    try {
        assertTradeLegal(state, giver, target, offer.itemId, offer.amount, offer.receiveItemId);
    }
    catch {
        log(state, '待确认的物品交换已失效。');
        state.pendingTrade = null;
    }
}

/** 这个地点是不是「锤子」标记地点（迪伦的机械知识） */
export function isHammerRoom(state: GameState, roomId: string) {
    const room = state.map.rooms.find((r) => r.id === roomId);
    return Boolean(room?.tags?.includes('special-hammer'));
}


/**
 * 总开关：网页发来的每一种按钮，都在下面分岔。
 * 大厅选角 → 幸存者走路/搜/修 → 杀手打牌 → 遭遇 → 发现/噪音。
 */
/**
 * 【解散房间】的"选民"名单：**除观众以外、现在连着的**玩家操控者。
 *
 * 为什么只算在线的：已经掉线的人不可能点确认，把他们算进名单就永远凑不齐；
 * 反过来他们重连之后会重新进入名单，所以不会出现"漏掉某个人"。
 * 观众不参与对局，也不占座位，因此既不投票也不被算进名单。
 */
export function disbandVoters(state: GameState): string[] {
    const set = new Set<string>();
    for (const p of Object.values(state.players)) {
        if (p.faction === 'spectator')
            continue;
        if (!p.connected)
            continue;
        set.add(p.controllerId);
    }
    return [...set];
}

/** 把「谁发起了、谁确认了、还差谁」算出来（快照和收尾判定共用） */
export function disbandProgressOf(state: GameState): {
    requestedBy: string | null;
    requestedByName: string;
    confirmed: string[];
    waiting: string[];
} {
    const voters = disbandVoters(state);
    const votes = state.disband?.votes ?? [];
    const requestedBy = state.disband?.requestedBy ?? null;
    const nameOf = (controllerId: string): string => {
        const p = Object.values(state.players).find((x) => x.controllerId === controllerId);
        return p?.controllerName || p?.name || '玩家';
    };
    return {
        requestedBy,
        requestedByName: requestedBy ? nameOf(requestedBy) : '',
        confirmed: voters.filter((id) => votes.includes(id)).map(nameOf),
        waiting: voters.filter((id) => !votes.includes(id)).map(nameOf),
    };
}

/** 除观众以外**还连着的**玩家都确认了 → 房间就地解散 */
function maybeFinishDisband(state: GameState): boolean {
    if (!state.disband?.requestedBy)
        return false;
    if (disbandProgressOf(state).waiting.length > 0)
        return false;
    state.disbanded = true;
    log(state, '所有人已确认，房间解散。');
    return true;
}

/**
 * 【重新开始】的进度 —— 和 `disbandProgressOf` 同一套（投票人一致），
 * 只是读 `state.restart`。
 */
export function restartProgressOf(state: GameState): {
    requestedBy: string | null;
    requestedByName: string;
    confirmed: string[];
    waiting: string[];
} {
    const voters = disbandVoters(state);
    const votes = state.restart?.votes ?? [];
    const requestedBy = state.restart?.requestedBy ?? null;
    const nameOf = (controllerId: string): string => {
        const p = Object.values(state.players).find((x) => x.controllerId === controllerId);
        return p?.controllerName || p?.name || '玩家';
    };
    return {
        requestedBy,
        requestedByName: requestedBy ? nameOf(requestedBy) : '',
        confirmed: voters.filter((id) => votes.includes(id)).map(nameOf),
        waiting: voters.filter((id) => !votes.includes(id)).map(nameOf),
    };
}

/**
 * 除观众以外**还连着的**玩家都确认重新开始 → **退回大厅重开**。
 *
 * 和解散的区别：房间、房间码、座位、模式**全部保留**，
 * 只是把棋盘和身份清掉，重新选地图 / 身份 / 角色（`restartMatch`）。
 */
function maybeFinishRestart(state: GameState, content: GameContent): boolean {
    if (!state.restart?.requestedBy)
        return false;
    if (restartProgressOf(state).waiting.length > 0)
        return false;
    log(state, '所有人已确认，重新开始：回到大厅重新选地图、身份与角色。');
    restartMatch(state, content);
    return true;
}

/**
 * **坍塌的逐人走位还没走完** → 进化流程先别往下走（用户口径：
 * 「坍塌结算后才执行进化效果」）。
 */
function collapseStillResolving(state: GameState): boolean {
    return Boolean(state.pendingCollapseMoves?.currentId);
}

/**
 * 坍塌走完之后的接回点：如果这次进化的坍塌还在等 / 刚走完，
 * 就把进化流程接着推下去（选卡 / 结算）。
 */
setCollapseDoneHandler((state: GameState) => {
    if (state.pendingEvolutionAck)
        advanceEvolutionAfterChoice(state);
});

/**
 * **进化「要你选的东西」选完一项之后**接着走。
 *
 * 顺序（用户口径）：确认 → 坍塌 → 特性 → **执行进化效果**。
 * 这里负责"执行进化效果"里那些需要玩家选的项：选完一项再问下一项，
 * 全都问完才做实际结算（力量 / 入手 / 弃牌 / 换主雕像）。
 */
function advanceEvolutionAfterChoice(state: GameState): void {
    if (!state.pendingEvolutionAck)
        return;
    /**
     * ⚠ **坍塌还没走完就先等着**（用户口径：坍塌结算后才执行进化效果）。
     * 走完那一刻会由 `setCollapseDoneHandler` 再调回这里。
     */
    if (collapseStillResolving(state))
        return;
    /** 特性作业（17 选惊吓目标 / 18 选门）还没做完 → 继续等它 */
    if (state.pendingTraitVictim || state.pendingBlockadeJob)
        return;
    /**
     * ③ **进化相关的特性卡**（变体1）。
     *
     * ⚠ **这里必须补跑一次**：确认时如果坍塌挂出了"轮流走一步"的队列，
     * `ackEvolution` 会在 ② 之后 `break` 掉，**③④ 都还没跑**；
     * 坍塌走完由本函数接手。以前这里直接跳到 ④，
     * 于是"墓穴 + 坍塌有人被压"时**进化类特性整段丢失**
     * （09 慢热杀手少 +1 力量 —— `evolution-order-2v3-crypt.mjs` 抓到的）。
     *
     * 幂等由 `evolutionTraitStage` 自己的等级守卫保证（确认时跑过就不重复）。
     */
    if (evolutionTraitStage(state, state.killerLevel))
        return;
    if (advanceEvolutionChoices(state))
        return;
    settleConfirmedEvolution(state);
}

/**
 * **确认之后的实际结算**（进化流程的最后一步）。
 *
 * 到这里"要你选的东西"都已经选完，可以安全地做：
 * 力量 +N、锁定牌入手、手牌超限弃牌、以及雕像换主雕像。
 */
function settleConfirmedEvolution(state: GameState): void {
    const ack = state.pendingEvolutionAck;
    if (!ack)
        return;
    /** 这一轮进化的等级（跳级判定要拿它比） */
    const baseLevel = ack.toLevel;
    /**
     * **已选好的"转换主雕像"放在最前面执行**（用户口径：
     * 「应该在执行进化效果时**最早**执行」）。
     *
     * 规则原文是「每当你升级时，你都可以转换主雕像」—— 它是这一级
     * **首先执行**的一步；后面那些进化效果（力量 / 取回圍困 / 解锁入手）
     * 都该算在**换完之后**的主雕像头上。
     *
     * 点那一尊的时候只记在 `pendingStatueEvoTarget` 里（"选择要确认"），
     * 到这里才真正切换。
     *
     * ⚠ 不给幸存者写战报 —— 用户要求「是否切换主雕像不能写在幸存者战报里」。
     */
    if (state.pendingStatueEvoTarget) {
        const from = state.players[state.killerId ?? '']?.statueIndex ?? 0;
        const targetId = state.pendingStatueEvoTarget;
        const to = state.players[targetId];
        state.pendingStatueEvoTarget = null;
        if (switchMainStatue(state, targetId)) {
            log(state, `雕像 1 级：主雕像从 ${from} 号转换为 ${to?.statueIndex ?? '?'} 号。`, 'killer');
        }
    }
    state.pendingStatueEvoSwitch = false;
    /**
     * 力量 / 解锁入手 / 手牌超限 → 挂 `pendingKillerDiscards`。
     * ⚠ **只结算当前这名杀手**：2对3 里两人各自确认、各自结算。
     */
    resolveDeferredEvolution(state, state.killerId);
    /**
     * ⚠ **2对3：还有人没结算就"先不结束本次升级"**（用户口径：
     * 两人做完各自的升级效果、等对方完成本次升级再继续）。
     *
     * 这里**保留 `pendingEvolutionAck`**（那两人共用的确认面板）并把回合
     * 切给还没做的那名杀手 —— 他确认自己的那一份之后才会走到"放行"。
     */
    if ((ack.killerIds?.length ?? 0) > 1 && state.killerId) {
        const done = [...new Set([...(ack.doneKillerIds ?? []), state.killerId])];
        ack.doneKillerIds = done;
        const next = (ack.killerIds ?? []).find((id) => !done.includes(id));
        if (next) {
            state.pendingEvolutionAck = ack;
            /** 换人了：下一名杀手还没点「确认新效果」，那颗按钮要重新出现 */
            ack.acked = false;
            switchActiveKiller(state, next);
            /** 换人了：下一名杀手的 ③④ 要各自重新走一遍 */
            state.evolutionChoiceIssuedAtLevel = 0;
            state.evolutionTraitStageAtLevel = 0;
            log(
                state,
                `【2对3】「${state.players[state.killerId]?.name ?? next}」的进化效果已结算；` +
                `还等另一名杀手确认完，本次升级才继续。`,
                'all',
                true,
            );
            return;
        }
    }
    state.pendingEvolutionAck = null;
    /**
     * ⚠ **特性 08「压抑怒火」的跳级在这里发起**（用户口径）：
     * 「杀手在 3 级时，就执行 3 级进化效果，然后由于 08，**再确认 4 级进化效果**，
     *   再坍塌，再特性牌（此时等级 4 级，不触发 08），再执行进化效果」。
     *
     * 也就是**连 4 级那一轮也要完整走一遍**（坍塌 → 特性 → 效果），
     * 所以这里把等级提到 4 并重新挂出确认面板；那一轮的坍塌由
     * `interceptEvolutionForCollapse` 照常拦截、由 `ackEvolution` 结算。
     */
    /**
     * ⚠ 传 `ack.killerIds`：2对3 里**任一人**持 08 都要跳级，不能只看最后确认的那个人
     * （详见 `evolutionLevelJump` 的注释）。
     */
    const jump = evolutionLevelJump(state, baseLevel, ack.killerIds);
    if (typeof jump === 'number' && jump > baseLevel) {
        state.killerLevel = jump;
        /**
         * ⚠ **4 级这一轮同样要"确认后再坍塌"**（用户口径：再确认 4 级进化效果 →
         * 再坍塌 → 再特性牌 → 再执行进化效果）。
         * 这里重新问一次 gate：墓穴且还有可塌地点才会置起标志。
         */
        state.pendingCollapseAfterEvolution = false;
        state.collapseConsumedForLevel = 0;
        interceptEvolutionForCollapse(state, baseLevel, jump);
        log(state, `杀手进化到 **${jump} 级**：请确认新效果。`, 'all', true);
        /**
         * ⚠ **这一轮的"先确认者"要跟上一轮同一人**（用户口径：
         * 「先手持 08，则是 k1，k2，k1，k2」）。
         *
         * 跳级是由"3 级最后结算的那名杀手"触发的，所以不切回来的话
         * 4 级那轮就会从**后手**开始（k2，k1）。
         */
        const jumpStart = ack.startKillerId ?? ack.killerIds?.[0] ?? state.killerId;
        state.pendingEvolutionAck = {
            fromLevel: baseLevel,
            toLevel: jump,
            deferred: true,
            killerIds: killerIdsForAck(state),
            startKillerId: jumpStart ?? null,
        };
        /** 08 跳级：新的一级要重新走 ③④ */
        state.evolutionChoiceIssuedAtLevel = 0;
        state.evolutionTraitStageAtLevel = 0;
        if (jumpStart && jumpStart !== state.killerId && state.killers[jumpStart])
            switchActiveKiller(state, jumpStart);
        return;
    }
    /**
     * 【变体1】特性 14「埋伏等待」的开局升级：**确认完直接回到开局流程**。
     *
     * ⚠ 不能落到 `maybeCloseKillerUpkeep` —— 那会把这一次当成
     * 正常杀手回合收尾（多抽 3 张牌、还会推进到下一个杀手）。
     */
    if (state.pendingTraitSetupResume) {
        state.pendingTraitSetupResume = false;
        startRound(state);
        return;
    }
    /**
     * 结算时才可能入手新牌 → 可能超上限要弃牌。
     * 这时**不能**继续往下走（`maybeCloseKillerUpkeep` 会推进阶段），
     * 得等玩家把牌弃完（`discardKillerCard` 那边弃完会回来收尾）。
     */
    if (state.pendingKillerDiscards > 0)
        return;
    /**
     * ⚠ **进化效果全部结算完之后**才补那次欠下的洗牌 / 摸牌
     * （用户口径：「杀手先执行进化效果再洗牌」）。
     */
    resumeDeferredDeckRecycle(state);
    maybeCloseKillerUpkeep(state);
}

/** 这次进化涉及哪些杀手（2对3 是两个）—— 给跳级时重挂确认面板用 */
function killerIdsForAck(state: GameState): string[] {
    return state.mode === '2v3' && state.killerIds.length
        ? [...state.killerIds]
        : (state.killerId ? [state.killerId] : []);
}

/**
 * 【墓穴遗物】洞察之球：**特殊行动 = 搜索两次**（用户口径：
 * 「洞察之球的特殊行动是**搜索两次**！能触发欧菲莉亚的第六感」）。
 *
 * 以前是"自己一次摸 2 张"（`searchDrawMultiple`）—— 绕过了正常搜索流程，
 * 所以第六感、逐张响声那些规则都不走。现在两次都走 `doSearch`：
 * 每张各自判响声、各自可能上钥匙架，欧菲莉亚的第六感也照常触发。
 *
 * ⚠ **第六感会挂出"摸 2 选 1"把流程停住**：那时本函数先返回，
 * 等玩家选完由 `resolveSixthSense` 那一支把**剩下的搜索**接着跑完
 * （`pendingInsightSearches` 记着还剩几次）。
 */
function runInsightOrbSearch(state: GameState, playerId: string): void {
    while ((state.pendingInsightSearches ?? 0) > 0) {
        const searcher = state.players[playerId];
        if (!searcher?.alive || state.phase !== 'survivorMain')
            break;
        state.pendingInsightSearches -= 1;
        /** 第二次不能再被"本回合已经搜索过物资了"拦下（`extraSearch`） */
        doSearch(state, playerId, { extraSearch: true });
        /** 第六感挂着待选 → 先停，选完再继续 */
        if (state.pendingSixthSense)
            return;
    }
    state.pendingInsightSearches = 0;
    const p = state.players[playerId];
    if (p?.alive && state.phase === 'survivorMain')
        advanceAfterSurvivor(state, playerId);
}
/**
 * 进化带来的弃牌弃完了 → 把杀手回合收尾。
 * （`discardKillerCard` 在弃完之后调用）
 */
function maybeFinishAfterEvolutionDiscard(state: GameState): void {
    if (state.pendingEvolutionAck || state.pendingUnlockDiscard)
        return;
    if (state.pendingKillerDiscards > 0)
        return;
    /** 同上：进化（含这次弃牌）都完事了，才补那次欠下的洗牌 / 摸牌 */
    resumeDeferredDeckRecycle(state);
    maybeCloseKillerUpkeep(state);
}

export function handleAction(state: GameState, socketId: string, action: ClientAction, content: GameContent): void
{    /**
     * 2v3：两个杀手各有一套牌库/手牌/弃牌堆。进入行动前先把**当前行动杀手**的切片
     * 读进顶层字段，返回时再存回 —— 这样既有的 500 多处 `state.killerHand` 代码不用改。
     * 行动途中换人（`switchActiveKiller`）时会即时存旧读新，最后由这里收尾。
     */
    if (state.killerId && state.killers[state.killerId]) {
        switchActiveKiller(state, state.killerId);
    }
    try {
    const playerId = resolveActorId(state, socketId, action);
    const p = state.players[playerId];
    if (!p)
        throw new Error('不在房间内');
    /**
     * 【解散房间】。
     *
     * 这三个动作**必须放在所有"先处理待办"的拦截之前** —— 解散的目的就是
     * "这局不想玩了"，要是被「请先选 1 张留下（第六感）」之类的等待卡住，
     * 那就永远解散不了。所以它一律放行。
     */
    if (action.type === 'requestDisband' || action.type === 'confirmDisband' || action.type === 'cancelDisband') {
        if (p.faction === 'spectator')
            throw new Error('观众不能解散房间');
        const controllerId = p.controllerId;
        if (action.type === 'cancelDisband') {
            if (!state.disband?.requestedBy)
                throw new Error('现在没有待确认的解散请求');
            state.disband = { requestedBy: null, votes: [] };
            log(state, `${p.name} 取消了【解散房间】。`, 'all', true);
            return;
        }
        if (action.type === 'requestDisband') {
            if (state.disband?.requestedBy)
                throw new Error('已经在等大家确认解散了');
            /** 发起人自己算第一票 */
            state.disband = { requestedBy: controllerId, votes: [controllerId] };
            log(state, `${p.name} 发起【解散房间】，等其他人确认。`, 'all', true);
            maybeFinishDisband(state);
            return;
        }
        /** confirmDisband */
        if (!state.disband?.requestedBy)
            throw new Error('现在没有待确认的解散请求');
        if (!state.disband.votes.includes(controllerId))
            state.disband.votes.push(controllerId);
        const left = disbandProgressOf(state).waiting.length;
        log(state, `${p.name} 确认解散房间${left > 0 ? `（还差 ${left} 人）` : ''}。`, 'all', true);
        maybeFinishDisband(state);
        return;
    }
    /**
     * 【重新开始】—— 和上面解散房间**同一套确认流程**，区别是
     * **不解散房间**：全员确认后回到大厅重新选地图 / 身份 / 角色。
     *
     * 同样放在所有"先处理待办"的拦截之前：想重开的时候不该被
     * 「请先选 1 张留下」之类的等待卡住（和解散一样的理由）。
     */
    if (action.type === 'requestRestart' || action.type === 'confirmRestart' || action.type === 'cancelRestart') {
        if (p.faction === 'spectator')
            throw new Error('观众不能发起重新开始');
        const controllerId = p.controllerId;
        if (action.type === 'cancelRestart') {
            if (!state.restart?.requestedBy)
                throw new Error('现在没有待确认的重新开始请求');
            state.restart = { requestedBy: null, votes: [] };
            log(state, `${p.name} 取消了【重新开始】。`, 'all', true);
            return;
        }
        if (action.type === 'requestRestart') {
            if (state.restart?.requestedBy)
                throw new Error('已经在等大家确认重新开始了');
            if (state.phase === 'lobby' || state.phase === 'characterSelect')
                throw new Error('现在就在大厅/选人阶段，不需要重新开始');
            /** 发起人自己算第一票 */
            state.restart = { requestedBy: controllerId, votes: [controllerId] };
            log(state, `${p.name} 发起【重新开始】（不解散房间），等其他人确认。`, 'all', true);
            maybeFinishRestart(state, content);
            return;
        }
        /** confirmRestart */
        if (!state.restart?.requestedBy)
            throw new Error('现在没有待确认的重新开始请求');
        if (!state.restart.votes.includes(controllerId))
            state.restart.votes.push(controllerId);
        const leftRestart = restartProgressOf(state).waiting.length;
        log(state, `${p.name} 确认重新开始${leftRestart > 0 ? `（还差 ${leftRestart} 人）` : ''}。`, 'all', true);
        maybeFinishRestart(state, content);
        return;
    }
    if (state.pendingKillerDiscards > 0 && action.type !== 'discardKillerCard') {
        throw new Error('请先弃置多余手牌');
    }
    /** 护符询问：只放行它自己的动作（坚毅标记没有询问，见 `applyDamage`） */
    if (state.pendingAmulet && action.type !== 'confirmAmulet') {
        throw new Error('请先决定是否出示古代护符');
    }
    /** 第六感待选：只放行选择动作 */
    if (state.pendingSixthSense && action.type !== 'resolveSixthSense') {
        throw new Error('请先选 1 张留下（第六感）');
    }
    /**
     * **【墓穴】坍塌收尾期间冻住一切别的操作**。
     *
     * 光靠 `isControllerActive` 不够 —— 那只管按钮亮不亮，
     * 网页可以直接发动作。这一步是"屋里的人还没走完，谁都不许动"的硬约束。
     *
     * ⚠ **顺序**：这一条必须排在下面「请先确认进化效果」**前面**。
     * 坍塌是"确认进化之后"才发生的，所以这两个待办会同时挂着；若先命中进化那条，
     * 玩家刚点完「确认新效果」却收到"请先确认进化效果"，根本看不懂该做什么
     * （`crypt.mjs` 的收尾用例就是按"这时候该说坍塌"来断言的）。
     *
     * 例外（必须放行，否则会卡死）：
     *  - `collapseMove` 本人：就是这一步
     *  - `confirmAmulet`：坍塌那 1 点伤害正常走护符，会停下来问一句，得让人答得出来
     *    （坚毅标记**不问**，它自动生效，所以这里没有它的份）
     *  - `discardKillerCard`：进坍塌前如果正欠着弃牌，先把账结清
     */
    const collapseFloorAction = action.type === 'collapseMove'
        || action.type === 'confirmAmulet'
        || action.type === 'discardKillerCard';
    if (state.pendingCollapseMoves && !collapseFloorAction) {
        throw new Error('坍塌还没收尾：先让屋里的人轮流走一步离开');
    }
    if (state.pendingEvolutionAck &&
        action.type !== 'ackEvolution' &&
        // 雕像 1 级「每次升级首先执行」：先决定要不要转换主雕像
        action.type !== 'pickStatueEvoSwitch' &&
        action.type !== 'skipStatueEvoSwitch' &&
        // 未命名升级：先选一张进化卡牌
        action.type !== 'pickEvolutionCard' &&
        // 解锁二选一（刺耳噪声 / 酸液喷吐）
        action.type !== 'pickUnlockChoice' &&
        // 女王等级 4：先点 2 个地点生成僵尸
        action.type !== 'pickQueenSpawnRoom' &&
        /**
         * ⚠ **「确认生成丧尸 / 确认放置核心标记」也必须放行** —— 否则真死锁。
         *
         * 女王 4 级的"选 2 个地点"是在 `ackEvolution` 的 ④ 步
         * （`advanceEvolutionChoices`）挂出来的，那时 `pendingEvolutionAck`
         * **还没清**（它在最后一步 `settleConfirmedEvolution` 里才置 null）。
         * 所以点完 2 个地点之后按「确认」会被这里拦下、报"请先确认进化效果"，
         * 而那条路又会因为 `pendingQueenSpawnRooms` 已经挂着直接跳过挂选择、
         * 直接结算 —— 丧尸不会生成，`pendingQueenSpawnRooms` 还永远留着，
         * 回合收尾被 `hasEvolutionChoicePending` 一直挡住。**整局卡死。**
         *
         * 扼杀者 4 级是"结算完之后"才挂的（那时 ack 已清），走不到这条闸门；
         * 但两个动作共用一个 handler，一起放行没有副作用。
         */
        action.type !== 'confirmEvoRooms' &&
        // 可选效果（「可以」）：先决定执行或跳过
        action.type !== 'resolveOptionalEffect' &&
        /**
         * ⚠ **放行"超限弃牌"** —— 否则死锁：
         *   上面那条 `pendingKillerDiscards > 0` 只放行 `discardKillerCard`，
         *   而这里又把它拦下 → 「确认新效果」说"请先弃置多余手牌"、
         *   「弃牌」说"请先确认进化效果"，**两个操作互相拒绝、谁也走不了**。
         *
         * 触发条件就是未命名的正常流程：解锁二选一选完（如【刺耳噪声】）→
         * 手牌 5 → 6 超上限 → 必须先弃 1 张，但那时进化还没确认。
         * 顺序应该是"弃完再确认"，所以这里必须放行弃牌。
         */
        action.type !== 'discardKillerCard' &&
        /**
         * ⚠ **特性作业也是进化流程里的一步**（用户口径：
         * 确认 → 坍塌 → 特性卡 → 执行进化效果）：
         *  - 17「压迫威慑」= `useTrait` 选惊吓目标
         *  - 18「狡诈猎手」= `confirmEvoBlockade` 确认封堵
         * 不放行它们就会"特性挂出来了却点不动"（本文件外那套测试抓到的）。
         */
        !(action.type === 'useTrait' && Boolean(state.pendingTraitVictim)) &&
        !(action.type === 'confirmEvoBlockade' && Boolean(state.pendingBlockadeJob)) &&
        /**
         * ⚠ **坍塌的"轮流走一步"也必须放行** —— 否则又一个死锁（刚抓到的）：
         *   进化的坍塌结算会挂出"谁先走"的队列，而进化流程**必须等它走完**
         *   才继续（用户口径：坍塌结算后才执行进化效果）；
         *   这时 `pendingEvolutionAck` 还挂着，若把 `collapseMove` 拦下来，
         *   玩家就会看到「请先确认进化效果」，可坍塌又走不完 → 整局卡死。
         *
         * 顺序：坍塌走完 → `setCollapseDoneHandler` → 继续进化流程。
         */
        action.type !== 'collapseMove' &&
        /**
         * ⚠ **坍塌那 1 点伤害引出的护符询问也必须放行**（否则真死锁）：
         *   坍塌伤害会挂起「是否出示古代护符」，而这时 `pendingEvolutionAck` 还挂着 ——
         *   拦住它玩家就答不了，坍塌走不完、进化也继续不了，整局卡死。
         *   （墓穴测试里"护符要能问得出来、答得下去"那一段抓到的。
         *    坚毅标记**不问**，自动生效，没有这个待办。）
         */
        action.type !== 'confirmAmulet') {
        throw new Error('请先确认进化效果');
    }
    /**
     * 开局准备（女猎手布陷阱）：这时只放行布陷阱相关的动作，
     * 别让幸存者抢跑。布完由 `confirmTrapPlacement` 推进到第 1 回合。
     */
    if (state.phase === 'trapSetup' &&
        action.type !== 'pickTrapKind' &&
        action.type !== 'placeHunterTrap' &&
        /**
         * ⚠ `resetTrapPlacement` **必须一起放行** —— 用户要的就是
         * "在最终确定前可以重新选一遍"，漏了它这颗按钮点了只会被挡回来。
         */
        action.type !== 'resetTrapPlacement' &&
        action.type !== 'confirmTrapPlacement') {
        throw new Error('开局准备中：请女猎手先布好猎手陷阱');
    }
    if (state.pendingOverFearWound &&
        action.type !== 'confirmOverFearWound' &&
        action.type !== 'skipOverFearWound' &&
        action.type !== 'confirmAmulet') {
        throw new Error('请先决定是否弃牌伤害惊恐过度的幸存者');
    }
    if (state.pendingWhizSearch &&
        action.type !== 'confirmWhizSearch' &&
        action.type !== 'skipWhizSearch') {
        throw new Error('请先决定呼啸而过后是否弃牌搜索房间');
    }
    if (state.pendingBlockadeJob &&
        state.pendingBlockadeJob.removeLeft > 0 &&
        action.type !== 'removeBoardBlockade' &&
        action.type !== 'relocateBlockade') {
        throw new Error('请先移除场上封堵，腾出可放置数量');
    }
    /**
     * ⚠ **发现阶段的两步必须放行**（用户口径：「翻发现牌，如果幸存者背包满了，
     * 应该**先选择要拿的发现牌，再选择弃置哪张牌**」）：
     *  - `pickSurvivorTurn`：发现阶段里它是"选谁翻牌"
     *  - `chooseDiscovery`：选**留哪一张**（这一步之后才会因为入手而超格）
     *
     * 背包满的旧账常常是**上一个动作**留下的（搜索拿到物品时挂的），
     * 而"所有幸存者都行动完 → 自动进发现阶段"是**服务端自动**走的、不经过动作闸门 ——
     * 于是玩家一进发现阶段就被"请先弃置一件装备"挡住，那两张候选根本点不了，
     * 「先选后弃」变成了「先弃后选」（用户报的就是这个）。
     *
     * 放行的只是这两步：`acknowledgeDiscovery`（确认发现）**不放行** ——
     * 该弃的没弃完，不许跳过。
     */
    const discoveryFloorAction = action.type === 'chooseDiscovery'
        || (action.type === 'pickSurvivorTurn' && state.phase === 'discovery' && state.pendingDiscoveryPick);
    if (state.pendingItemDiscard && !discoveryFloorAction &&
        action.type !== 'discardItem' && action.type !== 'confirmAmulet') {
        if (state.mode !== 'multi' || playerId === state.pendingItemDiscard.playerId) {
            throw new Error('装备栏已满，请先弃置一件装备');
        }
    }
    /** 乔治在挑笔记：先挑完（或放弃）才轮到下一个人 */
    if (state.pendingGeorgeNote && action.type !== 'chooseGeorgeNote') {
        throw new Error('请先选择要拿的笔记，或点「不拿」');
    }
    if (action.type === 'respondCoopAction') {
        const offer = state.pendingCoopAction;
        if (!offer)
            throw new Error('当前没有待确认的行动');
        const isProposer = socketId === offer.fromControllerId;
        const isPartner = Boolean(otherConnectedSurvivorOperator(state, offer.fromControllerId)?.id === socketId) ||
            (isSurvivorOperator(state, socketId) && !isProposer);
        if (!isProposer && !isPartner)
            throw new Error('无权处理这笔行动');
        if (!action.accept) {
            log(state, `${p.name} ${isProposer ? '取消了' : '拒绝了'}「${offer.summary}」。`);
            state.pendingCoopAction = null;
            return;
        }
        if (isProposer)
            throw new Error('只能由另一名幸存者操控者确认');
        const saved = offer.action;
        const fromId = offer.fromControllerId;
        state.pendingCoopAction = null;
        state.applyingConfirmedCoop = true;
        try {
            handleAction(state, fromId, saved, content);
        }
        finally {
            state.applyingConfirmedCoop = false;
        }
        return;
    }
    if (needsCoopConfirm(state, action, p)) {
        /**
         * ⚠ **先判"这一步该不该你动"，再谈要不要队友确认。**
         *
         * 原来这里只挂确认、不判 active，于是**杀手回合里幸存者发 `search`**
         * 会被显示成"等队友确认"（不报错），等队友点了确认之后才失败 ——
         * 用户口径：「**杀手大回合本来幸存者就不能搜索**」，该直接报"还没轮到你"。
         *
         * 这道判定不影响任何合法行为：1对2 的幸存者本来就要满足 `active === 自己`
         * （`assertActive` 的 multi/2v3 豁免不含 vs2），而且每个动作的 case
         * 内部也都会再调一次 `assertActive`。
         */
        assertActive(state, p.id);
        if (state.pendingCoopAction)
            throw new Error('已有一笔行动等待队友确认');
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
    /**
     * **【墓穴】坍塌收尾期间冻住一切别的操作**。
     *
     * 光靠 `isControllerActive` 不够 —— 那只管按钮亮不亮，
     * 网页可以直接发动作。这一步是"屋里的人还没走完，谁都不许动"的硬约束。
     *
     * 例外（必须放行，否则会卡死）：
     *  - `collapseMove` 本人：就是这一步
     *  - `confirmAmulet`：坍塌那 1 点伤害正常走护符，会停下来问一句，得让人答得出来
     *  - `discardKillerCard`：进坍塌前如果正欠着弃牌，先把账结清
     */
    if (p.faction === 'survivor' && state.phase === 'survivorMain') {
        const blocked = survivorPickInProgressError(state, p.id, action);
        if (blocked)
            throw new Error(blocked);
    }
    switch (action.type) {
        // —— 大厅：改名字、选模式、选角色、准备、开打 ——
        case 'setName': {
            const next = action.name.slice(0, 24) || p.controllerName || p.name;
            p.controllerName = next;
            if (state.phase === 'lobby' || state.phase === 'characterSelect')
                p.name = next;
            for (const pl of Object.values(state.players)) {
                if (pl.controllerId === socketId)
                    pl.controllerName = next;
            }
            break;
        }
        case 'setMap': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以换地图');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法换地图');
            }
            const next = content.maps.find((m) => m.id === action.mapId);
            if (!next)
                throw new Error('没有这张地图');
            if (!next.backgrounds?.survivor && !next.backgrounds?.killer) {
                throw new Error('这张地图还没有画底图，不能用来对局');
            }
            if (next.id === state.map.id)
                break;
            state.map = next;
            log(state, `地图已切换为「${next.name}」。`);
            break;
        }
        case 'setReplacementDeck': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以改设置');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法改设置');
            }
            state.replacementDeck = Boolean(action.on);
            log(state, state.replacementDeck
                ? '已开启【替换「鸿运当骰」等牌】：搜索牌堆里的 1 个手斧、1 瓶威士忌酒瓶、1 张石灰粉 会换成 鸿运当骰、煤油灯、神秘包裹。'
                : '已关闭【替换「鸿运当骰」等牌】。');
            break;
        }
        /**
         * **【变体1】特性卡开关**（所有模式都能开；和【变体2 分头行动】可以同时开）。
         */
        case 'setVariant1': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以切换规则');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法切换规则');
            }
            state.variant1 = Boolean(action.on);
            log(state, state.variant1
                ? `房主开启了【变体1】特性卡（当前生存难度【${TRAIT_DIFFICULTY_LABEL[state.traitDifficulty]}】）——` +
                    '开局前每人抽特性卡：幸存者每人抽 2 选 1，杀手按难度抽选。'
                : '房主关闭了【变体1】特性卡。', 'all', true);
            break;
        }
        /**
         * 【变体3】**计划卡开关**（房主在大厅 / 选人阶段切换）。
         *
         * 和变体1 / 变体2 都能同开；开启后开局给幸存者方随机发 2 张计划卡，
         * **杀手看不到**（快照只发幸存者视角）。
         */
        case 'setVariant3': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以切换规则');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法切换规则');
            }
            state.variant3 = Boolean(action.on);
            log(state, state.variant3
                ? '房主开启了【变体3】计划卡——开局给幸存者方随机发 2 张，' +
                    '他们在发现阶段之前可以确认 / 改变计划（要所有幸存者玩家同意）。**杀手看不到这些卡**。'
                : '房主关闭了【变体3】计划卡。', 'all', true);
            break;
        }
        /**
         * 【变体3】**确认 / 改变计划**（幸存者方）。
         *
         * 第一次选 = 确认计划；之后再选 = 改变计划。**每一次都要所有幸存者玩家各自同意**。
         */
        case 'pickPlan': {
            /**
             * ⚠ 同 `discardKillerCard`，方向反过来：豁免要认清
             * "这根网线是否真的在操作**幸存者**"，不能只看"这局有杀手"。
             * 原来那句会让 1对1 / 1对2 里的**杀手玩家替幸存者方选计划**。
             * 写法对齐 `finishSurvivorPhase` 那处的 `isSurvivorOperator`。
             */
            if (p.faction !== 'survivor' &&
                !(isSharedSurvivorMode(state) && isSurvivorOperator(state, socketId)))
                throw new Error('只有幸存者方可以选计划');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作');
            beginPlanSwitch(state, p.controllerId, action.planId);
            break;
        }
        /** 【变体3】计划确认的投票（每个幸存者玩家各点一次） */
        case 'votePlan': {
            const pend = state.pendingPlanSwitch;
            if (!pend)
                throw new Error('现在没有待确认的计划');
            if (!planVoters(state).some((v) => v.id === socketId))
                throw new Error('只有幸存者玩家可以确认计划');
            votePlanSwitch(state, socketId, action.accept !== false);
            break;
        }
        /**
         * 【变体3】发动计划能力（完成后才有；特殊行动 / 额外行动）。
         */
        case 'usePlanAbility': {
            if (p.faction !== 'survivor')
                throw new Error('只有幸存者可以发动计划能力');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作');
            const plan = state.planById?.[action.planId];
            if (!plan)
                throw new Error('未知的计划卡');
            const ab = plan.abilities[action.index];
            const reason = planAbilityBlockReason(state, action.planId, action.index, p);
            if (reason)
                throw new Error(reason);
            /**
             * 【变体3】**要选目的地的能力**（通道調查 ②）：
             * 界面还没点出口时先把候选挂起来，等它点。
             *
             * ⚠ 这一步**不能**消耗"每场一次"或代价 —— 只是"进入选择"，
             * 真结算走下面带 `toRoomId` 的那一次。
             */
            if (ab?.impl === 'moveThroughPassage') {
                const ends = passageNeighborsFor(state, p.roomId);
                if (action.toRoomId) {
                    assertSurvivorMainAction(p);
                    if (!ends.includes(action.toRoomId))
                        throw new Error('那个出口不在这条秘密通道上');
                    applyPlanAbility(state, plan, action.index, p.id, { toRoomId: action.toRoomId });
                    state.pendingPlanPassage = null;
                }
                else if (ends.length === 0) {
                    throw new Error('你现在不在秘密通道地点（或该地点没有别的通道出口）');
                }
                else {
                    state.pendingPlanPassage = [...ends];
                    log(state, `【变体3】通道調查：请选择要穿过的秘密通道出口（${ends.map((r) => roomName(state, r)).join('、')}）。`, 'survivor');
                }
                break;
            }
            applyPlanAbility(state, plan, action.index, p.id, {
                toRoomId: action.toRoomId ?? null,
                targetPlayerId: action.targetPlayerId ?? null,
            });
            break;
        }
        /**
         * 【变体3】「情報分享」：完成计划后**选一名幸存者**从搜索牌库抽 1 张。
         *
         * 谁选由 `pendingPlanTarget.chooserId` 定（完成计划时在场的那个幸存者）。
         */
        case 'pickPlanTarget': {
            const pt = state.pendingPlanTarget;
            if (!pt)
                throw new Error('当前没有待选的目标');
            if (pt.chooserId !== p.id && !controlsPiece(state, socketId, p))
                throw new Error('现在不是你选目标');
            if (!pt.candidates.includes(action.playerId))
                throw new Error('只能选场上活着的幸存者');
            const plan = state.planById?.[pt.planId];
            if (!plan)
                throw new Error('未知的计划卡');
            state.pendingPlanTarget = null;
            applyPlanAbility(state, plan, pt.index, pt.chooserId, { targetPlayerId: action.playerId });
            /** 选完继续走"发现阶段收尾"那一套 */
            if (state.pendingPlanResume) {
                state.pendingPlanResume = false;
                enterNoiseReport(state);
            }
            break;
        }
        /**
         * **【变体1】生存难度等级**（房主选，开局前可随时改）。
         *
         * 四档难度**幸存者侧完全一样**（每人抽 2 选 1），差别只在杀手侧：
         * 简单不抽 / 普通 2选1 / 困难 4选2 / 噩梦 6选3。
         */
        case 'setTraitDifficulty': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以改难度');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法改难度');
            }
            state.traitDifficulty = action.difficulty;
            const plan = KILLER_TRAIT_PLAN[action.difficulty];
            log(state, `【变体1】生存难度改为【${TRAIT_DIFFICULTY_LABEL[action.difficulty]}】：` +
                (plan.draw === 0
                    ? '杀手不抽特性卡；幸存者每人抽 2 选 1。'
                    : `幸存者每人抽 2 选 1；每名杀手抽 ${plan.draw} 选 ${plan.keep}。`), 'all', true);
            break;
        }
        /**
         * **【变体1】选特性卡**（开局前的弹窗里点确认）。
         *
         * 权限：1对3 / 2对3 里每人只操控自己的棋子；单人/1对1/1对2 里
         * 一个操控者可能管多个棋子，所以允许带 `playerId`（同样要校验"这棋子归他管"）。
         */
        case 'pickTrait': {
            const targetId = action.playerId ?? playerId;
            const who = state.players[targetId];
            if (!who)
                throw new Error('没有这个棋子');
            if (!controlsPiece(state, socketId, who))
                throw new Error('无权为这个棋子选特性卡');
            pickTraits(state, targetId, action.traitIds ?? []);
            break;
        }
        /**
         * 【变体1】**发动特性卡**（行动型：卡面写「特殊行动」/「额外行动」的那几张）。
         *
         * 规则口径（用户定的）：
         *  - **特殊行动** → **占一般行动**（和移动/搜索同级，用完整个小回合结束）；
         *  - **额外行动** → 不占一般行动，但**做过停滞**的本大回合不能再做；
         *  - 带「（每场游戏仅限一次）」的用掉后**卡牌变暗**（`markTraitUsed`）；
         *  - 特性卡造成的响声来源记 `'trait'`（**特性 16 压不住它**）；
         *  - 战报：只有**遭遇相关**和**治疗/消恐惧这类结果**才告知杀手，其余只写幸存者战报。
         */
        case 'useTrait': {
            const tid0 = action.actorPlayerId ?? playerId;
            const who = state.players[tid0];
            if (!state.variant1)
                throw new Error('本局没有开启【变体1】特性卡');
            const traitId = action.traitId;
            const tdef = traitDef(state, traitId);
            if (!tdef)
                throw new Error('没有这张特性卡');
            if (!who || !controlsPiece(state, socketId, who))
                throw new Error('无权操作这个棋子');
            if (!traitAvailable(state, tid0, traitId)) {
                throw new Error(
                    (state.traits[tid0] ?? []).includes(traitId)
                        ? '这张特性卡本局已经用过了'
                        : '他没有这张特性卡',
                );
            }

            /**
             * ——— 【变体1】**杀手侧**：弃 N 张手牌换效果 ———
             *
             * 卡面写「弃掉 N 张卡牌来…」的那几张（01/05/06/07/10/15/20）都走这里。
             * 弃哪几张**由杀手自己点手牌选**；先弃牌再结算效果。
             */
            if (tdef.faction === 'killer') {
                if (state.killerId !== who.id)
                    throw new Error('现在不是这名杀手的回合');
                /**
                 * ⚠ **02「玩弄猎物」是"遭遇爆发那一刻"的反应**——
                 * 那时候 `phase === 'encounter'`，所以必须在"要在自己回合发动"这道闸上
                 * 给它开个口子；否则点下去只会报「杀手特性要在自己的回合发动」，
                 * 这张卡等于废的（**僵尸搜索触发的遭遇也一样**，
                 * 用户检查「女王 + 僵尸搜索」时顺带发现的）。
                 */
                const preyReaction =
                    traitId === 'trait_k02' && state.pendingPreyOffer === true && state.encounter != null;
                if (!preyReaction && state.phase !== 'killerMain' && state.phase !== 'upkeep')
                    throw new Error('杀手特性要在自己的回合发动');
                const payIds = [...new Set(action.payCardIds ?? [])];
                const need = KILLER_TRAIT_PAY[traitId] ?? 0;
                /**
                 * ⚠ **手牌不够就不能发动**（用户要求）：要弃 N 张就先得有 N 张，
                 * 否则"弃牌代价"等于没付。这里先查总数，再查"选中的那几张确实在手里"。
                 */
                if (need > 0 && state.killerHand.length < need)
                    throw new Error(
                        `手牌只有 ${state.killerHand.length} 张，不够发动「${tdef.name}」（要弃 ${need} 张）`,
                    );
                if (payIds.length !== need)
                    throw new Error(`发动「${tdef.name}」需要弃 ${need} 张卡牌`);
                for (const id of payIds) {
                    if (!state.killerHand.includes(id))
                        throw new Error('只能弃自己手牌里的牌');
                }
                if ((traitId === 'trait_k05' || traitId === 'trait_k07') && who.stealth)
                    throw new Error('潜行中不能发动这张特性卡');
                /** 先弃牌 */
                for (const id of payIds) {
                    state.killerHand = state.killerHand.filter((x) => x !== id);
                    state.killerDiscard.push(id);
                }
                switch (traitId) {
                    /** 05 迅捷行动：不在潜行 → 弃 2 张换【移动】X1（点地图选目的地） */
                    case 'trait_k05': {
                        state.pendingMoveRange = 1;
                        state.pendingMoveMin = 1;
                        log(
                            state,
                            `【变体1】${who.name}「迅捷行动」：弃掉 ${need} 张卡牌，请点地图【移动】1 格。`,
                            'killer',
                        );
                        break;
                    }
                    /** 06 敏锐听觉：弃 1 张 → 感知一个带响声的地点（点地图选） */
                    case 'trait_k06': {
                        state.killerSenseRoomActive = true;
                        /**
                         * ⚠ **爆竹回合 = 全场都在响**，而那时 `state.noises` 是空的
                         * （见 `pushNoise` / 响声阶段：“全场都有响声（爆竹）”）——
                         * 照直列 `state.noises` 会写成"没有响声"，和实际不符。
                         */
                        const noiseHint = state.firecrackerThisRound
                            ? '（本回合有爆竹：**全场都在响**）'
                            : state.noises.length
                                ? `（本回合响声：${state.noises.map((id) => roomName(state, id)).join('、')}）`
                                : '';
                        log(
                            state,
                            `【变体1】${who.name}「敏锐听觉」：弃掉 ${need} 张卡牌，` +
                                `请点一个带响声的地点感知${noiseHint}。`,
                            'killer',
                        );
                        break;
                    }
                    /** 07 进阶追踪：不在潜行 → 弃 1 张 → **立刻**感知距离 1 内的所有地点 */
                    case 'trait_k07': {
                        const near = who.roomId ? moveAdjacentRooms(state, who.roomId, who.id) : [];
                        const list = [who.roomId, ...near].filter(Boolean) as string[];
                        const witnessed = senseRooms(state, list);
                        noteSingleRoomSense(state, list, witnessed);
                        queenSenseFear(state, witnessed);
            /** 【变体1】感知命中 → 挂出可发动的特性卡（10/15/16） */
            offerSenseTraits(state, witnessed);
                        log(
                            state,
                            `【变体1】${who.name}「进阶追踪」：弃掉 ${need} 张卡牌，` +
                                `【感知】距离 1 内的所有地点（${list.map((id) => roomName(state, id)).join('、')}）。`,
                            'killer',
                        );
                        break;
                    }
                    /**
                     * 01 完全围困：**回合结束时**，前提和 20「危险伏击」**完全一样** ——
                     * 本回合没有遭遇幸存者、且不在【潜行】。满足就弃 2 张，
                     * 在**你的地点**【封堵】X1。
                     */
                    case 'trait_k01': {
                        requireEndOfTurnTraitCondition(state, who, tdef.name);
                        if (!who.roomId)
                            throw new Error('不在地图上');
                        if (!state.rules.enableBlockades)
                            throw new Error('本局未启用封堵');
                        /**
                         * ⚠ `placeBlockade` 会返回"这次封堵有没有着落"：
                         * 所在地没有可封堵的门（都封完了 / 门上是机关大门）时它是 `false`
                         * —— 那时候**别再说"封堵 1"**，两条话会自相矛盾。
                         */
                        const blockadeDone = placeBlockade(state, who.roomId);
                        log(
                            state,
                            blockadeDone
                                ? `【变体1】${who.name}「完全围困」：弃掉 ${need} 张卡牌，在「${roomName(state, who.roomId)}」【封堵】1。`
                                : `【变体1】${who.name}「完全围困」：弃掉 ${need} 张卡牌，但「${roomName(state, who.roomId)}」没有可封堵的门，跳过封堵。`,
                            'all',
                            true,
                        );
                        break;
                    }
                    /**
                     * 20 危险伏击：回合结束，本回合没遭遇且不在潜行 → 弃 1 张 → 【潜行】X0-2。
                     *
                     * 潜行**立刻生效**，然后挂起"最多走 2 格"（`pendingMoveMin = 0`）——
                     * 不想走就不点地图（0 格也符合 X0-2）。
                     */
                    case 'trait_k20': {
                        /** **和 01「完全围困」同一个判断**（用户要求：20 的条件跟 1 一样） */
                        requireEndOfTurnTraitCondition(state, who, tdef.name);
                        setStealth(who, true);
                        state.pendingMoveRange = 2;
                        state.pendingMoveMin = 0;
                        log(state, `【变体1】${who.name}「危险伏击」：进入潜行。`, 'all', true);
                        log(
                            state,
                            `「危险伏击」：可以点地图移动 0–2 格（不走就留在原地）。`,
                            'killer',
                        );
                        break;
                    }
                    /** 10 即刻反应：感知发现幸存者后 → 弃 1 张换【移动】X1 */
                    case 'trait_k10': {
                        if (!state.pendingSenseTraits)
                            throw new Error('「即刻反应」只能在【感知】发现幸存者之后发动');
                        state.pendingMoveRange = 1;
                        state.pendingMoveMin = 1;
                        log(
                            state,
                            `【变体1】${who.name}「即刻反应」：弃掉 ${need} 张卡牌，请点地图【移动】1 格。`,
                            'killer',
                        );
                        /** 这一批"感知到的"已经用过了，收掉挂起（免得同一批人反复发动） */
                        state.pendingSenseTraits = false;
                        state.pendingSenseWitnessed = [];
                        break;
                    }
                    /** 15 谋杀意图：感知发现幸存者后 → 弃 1 张，**惊吓刚发现的那批人** */
                    case 'trait_k15': {
                        if (!state.pendingSenseTraits || !state.pendingSenseWitnessed.length)
                            throw new Error('「谋杀意图」只能在【感知】发现幸存者之后发动');
                        const victims = state.pendingSenseWitnessed
                            .map((id) => state.players[id])
                            .filter((s): s is NonNullable<typeof s> =>
                                Boolean(s?.alive && s.faction === 'survivor'),
                            );
                        log(
                            state,
                            `【变体1】${who.name}「谋杀意图」：弃掉 ${need} 张卡牌，` +
                                `【惊吓】${victims.map((s) => s.name).join('、')}。`,
                            'all',
                            true,
                        );
                        for (const v of victims)
                            addFear(state, v.id, 1);
                        state.pendingSenseTraits = false;
                        state.pendingSenseWitnessed = [];
                        break;
                    }
                    /** 16 敏锐感知：**每轮一次**、不弃牌 → 额外【感知】一个颜色区域 */
                    case 'trait_k16': {
                        if (!state.pendingSenseTraits)
                            throw new Error('「敏锐感知」只能在【感知】发现幸存者之后发动');
                        if ((state.traitUsedThisRound ?? []).includes(traitId))
                            throw new Error('「敏锐感知」每轮只能用一次');
                        state.pendingSenseColor = true;
                        state.traitUsedThisRound = [...(state.traitUsedThisRound ?? []), traitId];
                        log(
                            state,
                            `【变体1】${who.name}「敏锐感知」：请再选一个**颜色区域**【感知】。`,
                            'killer',
                        );
                        /** 收掉这一次的挂起；换个颜色区域再感知命中时会重新挂（16 每轮只有一次） */
                        state.pendingSenseTraits = false;
                        state.pendingSenseWitnessed = [];
                        break;
                    }
                    /**
                     * 02 玩弄猎物：「当你遭遇任何幸存者时，你可以立刻取消遭遇。
                     * 然后，你抽取 3 张卡牌并结束你的回合。」
                     *
                     * 时机：**遭遇最开始**（用户强调「这个在遭遇最开始判断，
                     * 比幸存者特性 12 还早」）—— 所以只认 `step === 'pick'`
                     * 且这一次攻击还没结算过。
                     *
                     * ⚠ 这 3 张是**特性给的额外 3 张**，和"回合结束摸 3 张"不是一回事
                     * （用户明确要求搞清）—— 下面 `endKillerTurn` 里的常规摸牌照常发生。
                     */
                    case 'trait_k02': {
                        const enc = state.encounter;
                        if (!enc)
                            throw new Error('现在没有遭遇');
                        if (!state.pendingPreyOffer)
                            throw new Error('现在不是发动「玩弄猎物」的时机');
                        /**
                         * **不取消**（用户要求：先问杀手，他不取消才轮到幸存者 12）——
                         * 收掉这个询问，接着挂出「英勇阻截」。
                         */
                        if (action.decline) {
                            state.pendingPreyOffer = false;
                            log(state, `【变体1】${who.name} 放弃发动「玩弄猎物」，遭遇继续。`, 'killer');
                            offerHeroicBlock(state, survivorsInRoom(state, enc.roomId));
                            break;
                        }
                        if (enc.step !== 'pick' || enc.attackCommitted)
                            throw new Error('「玩弄猎物」只能在**遭遇最开始**发动');
                        state.pendingPreyOffer = false;
                        state.encounter = null;
                        /**
                         * ⚠ 用户补充：取消遭遇时，**女猎手【追蹤】那次搜索的"展示距离"部分
                         * 也要一起取消** —— 它和这场遭遇是同一次牌的结果。
                         * 顺手把其它"跟着遭遇走"的挂起清干净，免得取消之后又冒出来。
                         */
                        state.pendingTrackerPick = false;
                        state.pendingSensePair = null;
                        state.pendingSenseColor = false;
                        state.pendingMoveSurvivorPick = null;
                        log(
                            state,
                            `【变体1】${who.name}「玩弄猎物」：立刻取消遭遇，额外抽 3 张卡牌，本回合结束。`,
                            'all',
                            true,
                        );
                        drawKillerCards(state, 3);
                        endKillerTurn(state);
                        break;
                    }
                    /** 17 压迫威慑：升级到 3/4/5 级 → **选 1 名幸存者**惊吓（谁由杀手点） */
                    case 'trait_k17': {
                        const pend = state.pendingTraitVictim;
                        if (!pend || pend.traitId !== traitId)
                            throw new Error('现在没有要选的「压迫威慑」目标');
                        const victim = action.targetPlayerId
                            ? state.players[action.targetPlayerId]
                            : undefined;
                        if (!victim?.alive || victim.faction !== 'survivor')
                            throw new Error('请选择一名存活幸存者');
                        state.pendingTraitVictim = null;
                        log(
                            state,
                            `【变体1】${who.name}「压迫威慑」：升级到 ${pend.level} 级，` +
                                `【惊吓】${victim.name}。`,
                            'all',
                            true,
                        );
                        addFear(state, victim.id, 1);
                        /** 特性作业做完了 → 回去继续进化流程（选卡/结算） */
                        advanceEvolutionAfterChoice(state);
                        break;
                    }
                    default:
                        throw new Error('这张杀手特性还不能用这个入口发动');
                }
                if (tdef.oncePerGame)
                    markTraitUsed(state, traitId);
                break;
            }

            if (!who.alive || who.faction !== 'survivor')
                throw new Error('只有存活幸存者可以发动特性卡');
            /**
             * 【变体1】特性 12「英勇阻截」：**触发时机型**（卡面没写"特殊/额外行动"），
             * 由遭遇爆发时的询问触发 —— 所以排在"行动型"校验之前处理。
             */
            if (traitId === 'trait_s12') {
                const pend = state.pendingHeroicBlock;
                if (!pend || pend.holderId !== who.id)
                    throw new Error('现在不是发动「英勇阻截」的时机');
                if (!pend.started) {
                    /** 还在问"要不要发动"；`decline` = 不发动 */
                    if (action.decline) {
                        state.pendingHeroicBlock = null;
                        log(state, `【变体1】${who.name} 放弃发动「英勇阻截」。`, 'survivor');
                        break;
                    }
                    const others = (state.encounter?.discoveredIds ?? [])
                        .map((id) => state.players[id])
                        .filter((s): s is NonNullable<typeof s> =>
                            Boolean(s?.alive && s.id !== who.id),
                        );
                    markTraitUsed(state, traitId);
                    state.pendingHeroicBlock = {
                        holderId: who.id,
                        started: true,
                        queue: others.map((s) => s.id),
                        moved: [],
                    };
                    log(
                        state,
                        `【变体1】${who.name}「英勇阻截」：让其他幸存者各【移动】1 格逃离这次攻击。`,
                        'all',
                        true,
                    );
                    if (!others.length)
                        settleHeroicBlock(state);
                    break;
                }
                /** 逐个选方向：`targetPlayerId` 是轮到的人，`toRoomId` 是他走的那一格 */
                const target = action.targetPlayerId
                    ? state.players[action.targetPlayerId]
                    : undefined;
                if (!target?.alive || !target.roomId)
                    throw new Error('请选择要移动的幸存者');
                if (pend.queue[0] !== target.id)
                    throw new Error('现在轮到别人选方向');
                if (!action.toRoomId)
                    throw new Error('请选择移动方向');
                if (!tryMove(state, target.id, action.toRoomId, 1, 1))
                    throw new Error('移动不合法');
                pend.queue.shift();
                pend.moved.push(target.id);
                log(
                    state,
                    `${target.name} 被「英勇阻截」带离到「${roomName(state, target.roomId)}」。`,
                    'all',
                    true,
                );
                if (!pend.queue.length)
                    settleHeroicBlock(state);
                break;
            }
            if (tdef.faction !== 'survivor')
                throw new Error('这不是幸存者特性卡');
            if (state.phase !== 'survivorMain')
                throw new Error('行动型特性卡只能在幸存者大回合发动');
            if (tdef.kind !== 'special' && tdef.kind !== 'extra')
                throw new Error('这张特性卡不是主动发动的');
            if (tdef.kind === 'special') {
                assertSurvivorMainAction(who);
            }
            else {
                if (who.haltedThisRound)
                    throw new Error('本大回合已经执行过停滞，不能再做额外行动');
                who.extraActionUsedThisTurn = true;
            }
            /** 特性卡造成的响声：来源记 `'trait'`（16 压不住） */
            const noiseHere = (roomId?: string | null) => {
                const room = roomId ?? who.roomId;
                if (room)
                    pushNoise(state, room, false, { byPlayerId: who.id, source: 'trait' });
            };

            switch (traitId) {
                /** 01 速度爆发：（每场一次）特殊行动：本地响 ⚠，然后【移动】X2-4 */
                case 'trait_s01': {
                    const steps = Math.max(2, Math.min(4, Math.floor(action.steps ?? 2)));
                    if (!action.toRoomId)
                        throw new Error('请选择移动目的地');
                    if (!legalMoveRooms(state, who.id, steps, steps).includes(action.toRoomId))
                        throw new Error(`目的地必须是正好 ${steps} 步的地方`);
                    noiseHere();
                    if (!tryMove(state, who.id, action.toRoomId, steps, steps))
                        throw new Error('移动不合法');
                    log(state, `【变体1】${who.name}「速度爆发」：本地发出响声，然后【移动】${steps} 步。`, 'survivor');
                    break;
                }
                /** 02 调度人员：特殊行动：同地点的**其他**幸存者各【移动】X1-2 */
                case 'trait_s02': {
                    const here = survivorsInRoom(state, who.roomId ?? '').filter((s) => s.id !== who.id);
                    if (!here.length)
                        throw new Error('这个地点没有其他幸存者');
                    const moves = action.moves ?? [];
                    if (!moves.length)
                        throw new Error('请为同地点的其他幸存者选择移动');
                    /** 先全部校验一遍再动手 —— 免得走到一半报错、状态半生不熟 */
                    for (const mv of moves) {
                        const target = here.find((s) => s.id === mv.playerId);
                        if (!target)
                            throw new Error('只能让同地点的其他幸存者移动');
                        const steps = Math.max(1, Math.min(2, Math.floor(mv.steps ?? 1)));
                        if (!legalMoveRooms(state, target.id, steps, steps).includes(mv.toRoomId))
                            throw new Error(`${target.name} 的目的地必须是正好 ${steps} 步的地方`);
                    }
                    for (const mv of moves) {
                        const steps = Math.max(1, Math.min(2, Math.floor(mv.steps ?? 1)));
                        tryMove(state, mv.playerId, mv.toRoomId, steps, steps);
                    }
                    log(
                        state,
                        `【变体1】${who.name}「调度人员」：让同地点的 ${moves.length} 名幸存者各【移动】1–2 步。`,
                        'survivor',
                    );
                    break;
                }
                /** 08 紧急救治：（每场一次）特殊行动：【治疗】同地点另一名幸存者 */
                case 'trait_s08': {
                    const target = action.targetPlayerId ? state.players[action.targetPlayerId] : undefined;
                    if (!target?.alive || target.faction !== 'survivor')
                        throw new Error('请选择一名幸存者');
                    if (!who.roomId || target.roomId !== who.roomId)
                        throw new Error('必须位于同一地点');
                    applyHeal(state, target.id, 1, false);
                    clearPoisonOnHeal(state, target.id);
                    /** 治疗**结果**按原时机正常告知杀手 */
                    log(state, `【变体1】${who.name}「紧急救治」：治疗了 ${target.name}。`, 'all', true);
                    break;
                }
                /** 10 鼓舞士气：特殊行动：移除**任意地点**其他幸存者的所有恐惧 */
                case 'trait_s10': {
                    const others = Object.values(state.players).filter(
                        (s) => s.faction === 'survivor' && s.alive && s.id !== who.id,
                    );
                    let touched = 0;
                    for (const s of others) {
                        if (s.fear > 0 || s.overFear)
                            touched += 1;
                        s.fear = 0;
                        s.overFear = false;
                    }
                    /** 消除恐惧的**结果**正常告知杀手 */
                    log(
                        state,
                        `【变体1】${who.name}「鼓舞士气」：移除了 ${touched} 名其他幸存者的恐惧标记。`,
                        'all',
                        true,
                    );
                    break;
                }
                /** 13 声音诱饵：（每场一次）额外行动：在**任意地点**响 ⚠ */
                case 'trait_s13': {
                    const room = action.toRoomId;
                    if (!room || !state.map.rooms.some((r) => r.id === room))
                        throw new Error('请选择发出响声的地点');
                    pushNoise(state, room, false, { byPlayerId: who.id, source: 'trait' });
                    log(state, `【变体1】${who.name}「声音诱饵」：在「${roomName(state, room)}」发出响声。`, 'survivor');
                    break;
                }
                /**
                 * 14 嘲讽战术：特殊行动：本地响 ⚠，**杀手弃 3 张并抽 1 张**。
                 *
                 * ⚠ 弃哪 3 张由**杀手自己选**（用户口径："具体比如选封堵之类还是杀手来"），
                 * 所以这里挂起 `pendingTraitDiscard`，等杀手提交 `resolveTraitDiscard`。
                 */
                case 'trait_s14': {
                    noiseHere();
                    state.pendingTraitDiscard = 3;
                    state.pendingTraitDiscardFrom = who.id;
                    log(
                        state,
                        `【变体1】${who.name}「嘲讽战术」：本地发出响声；杀手需要**弃掉 3 张卡牌**并抽 1 张。`,
                        'all',
                        true,
                    );
                    break;
                }
                /** 19 明智之举：（每场一次）额外行动：三选一 */
                case 'trait_s19': {
                    if (action.choice === 'removeBlockade') {
                        const where = action.doorId ?? action.toRoomId;
                        if (!where)
                            throw new Error('请选择要移除的封堵');
                        if (!removeBlockade(state, where, who.id))
                            throw new Error('那里没有封堵标记');
                        log(state, `【变体1】${who.name}「明智之举」：移除了一个封堵标记。`, 'all', true);
                    }
                    else if (action.choice === 'clearFear') {
                        who.fear = 0;
                        who.overFear = false;
                        log(state, `【变体1】${who.name}「明智之举」：移除自己的所有恐惧标记。`, 'all', true);
                    }
                    else if (action.choice === 'noise') {
                        if (!action.toRoomId)
                            throw new Error('请选择要发出响声的相邻地点');
                        if (!who.roomId || !generalAdjacentRooms(state.map, who.roomId).includes(action.toRoomId))
                            throw new Error('必须是相邻地点');
                        pushNoise(state, action.toRoomId, false, { byPlayerId: who.id, source: 'trait' });
                        log(
                            state,
                            `【变体1】${who.name}「明智之举」：在相邻的「${roomName(state, action.toRoomId)}」发出响声。`,
                            'survivor',
                        );
                    }
                    else
                        throw new Error('请选择要做的其中一项');
                    break;
                }
                /** 20 迅速反应：（每场一次）额外行动：【移动】X1 */
                case 'trait_s20': {
                    if (!action.toRoomId)
                        throw new Error('请选择移动目的地');
                    if (!legalMoveRooms(state, who.id, 1, 1).includes(action.toRoomId))
                        throw new Error('目的地必须是相邻地点');
                    if (!tryMove(state, who.id, action.toRoomId, 1, 1))
                        throw new Error('移动不合法');
                    log(state, `【变体1】${who.name}「迅速反应」：额外【移动】1 步。`, 'survivor');
                    break;
                }
                default:
                    throw new Error('这张特性卡还不能用这个入口发动');
            }

            /** 每场一次的用掉就变暗 */
            if (tdef.oncePerGame)
                markTraitUsed(state, traitId);
            /** 特殊行动占掉一般行动并结束小回合；额外行动只占额外行动名额 */
            if (tdef.kind === 'special') {
                who.mainActionUsed = true;
                who.moveLeft = 0;
                advanceAfterSurvivor(state, who.id);
            }
            break;
        }
        /**
         * 【变体1】杀手特性 14「嘲讽战术」的收尾：**杀手自选**弃掉 3 张牌，然后抽 1 张。
         */
        case 'resolveTraitDiscard': {
            const need = state.pendingTraitDiscard;
            if (need <= 0)
                throw new Error('当前没有要弃的牌');
            if (p.faction !== 'killer')
                throw new Error('仅杀手可以弃牌');
            const ids = [...new Set(action.cardIds ?? [])];
            /** ⚠ 手牌不够就没得弃（用户要求：弃牌得有足够手牌） */
            if (state.killerHand.length < need)
                throw new Error(`手牌只有 ${state.killerHand.length} 张，不够弃 ${need} 张`);
            if (ids.length !== need)
                throw new Error(`请选 ${need} 张卡牌弃掉`);
            for (const id of ids) {
                if (!state.killerHand.includes(id))
                    throw new Error('只能弃自己手牌里的牌');
            }
            for (const id of ids) {
                state.killerHand = state.killerHand.filter((x) => x !== id);
                state.killerDiscard.push(id);
            }
            state.pendingTraitDiscard = 0;
            const from = state.pendingTraitDiscardFrom
                ? state.players[state.pendingTraitDiscardFrom]?.name
                : null;
            state.pendingTraitDiscardFrom = null;
            log(
                state,
                `【变体1】「嘲讽战术」：杀手弃掉 ${ids.length} 张卡牌${from ? `（由 ${from} 发动）` : ''}，然后抽 1 张。`,
                'all',
                true,
            );
            drawKillerCards(state, 1);
            break;
        }
        /**
         * 【变体1】特性 11「安静搜查」的答复（用户口径：**每次发现要响时都问一句**）。
         *
         * `use` → 取消这次发现的响声、卡面变暗（每局一次）；否则照响。
         * 答复完**接着走完被打断的那条发现流程**。
         */
        case 'resolveQuietSearch': {
            const pend = state.pendingQuietSearch;
            if (!pend)
                throw new Error('现在没有要决定的「安静搜查」');
            if (pend.playerId !== p.id)
                throw new Error('只有本人可以决定');
            state.pendingQuietSearch = null;
            if (action.use) {
                markTraitUsed(state, 'trait_s11');
                log(state, `【变体1】${p.name}「安静搜查」：取消了这次发现造成的响声。`, 'survivor');
            }
            else {
                if (pend.roomId)
                    pushNoise(state, pend.roomId, false, { byPlayerId: pend.playerId, source: 'skill' });
                log(state, '发现牌带有响声（含钥匙），在翻牌者所在地点响。');
            }
            /** 接着走完被打断的流程 */
            if (pend.from === 'discovery') {
                if (state.pendingItemDiscard)
                    break;
                /** 特性 18「拾物妙手」被打断的：先接着结算还没留的那张；都结算完了就收尾 */
                if (continueKeepBothDiscovery(state))
                    break;
                if (!finishKeepBothDiscovery(state))
                    enterNoiseReport(state);
            }
            break;
        }
        /**
         * **【变体2】「分头行动」开关**（1对3 / 2对3 专用；用户把分头行动命名为"变体2"）。
         *
         * 换模式时**保留**（用户可能先勾再切模式）；只有切到不支持的模式才自动关。
         */
        case 'setSplit': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以切换规则');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法切换规则');
            }
            if (action.split && state.mode !== 'multi' && state.mode !== '2v3') {
                throw new Error('【变体2】「分头行动」只在 1对3 / 2对3 下可用');
            }
            state.split = Boolean(action.split);
            /** 开关一变，先手基准要重记（下次开局重新算） */
            state.splitFirstId = null;
            state.splitOrderBase = [];
            log(state, state.split
                ? `房主开启了【变体2】「分头行动」：钥匙各自保管（不占物品格、无上限），` +
                    `攒到 ${splitEscapeKeysNeeded(state)} 把钥匙站在出口、或拿秘密地图站到隐藏出口，` +
                    `下个大回合开始就自动单独逃脱；杀手每杀一人升一级，杀人不结束游戏。`
                : '房主关闭了「分头行动」。', 'all', true);
            break;
        }
        /**
         * 【分头行动】**选定本大回合的先手**（选角后、开局前，和 2v3 选杀手先后同一时机）。
         *
         * 用户要求"幸存者方第一名玩家选择"；这里**放宽成任何幸存者操控者都能点**
         * （谁先点算谁），免得"第一个玩家掉线就永远选不了"。
         * 没选的场合按座位第一个当先手，游戏照样能开。
         */
        case 'pickSplitFirst': {
            if (!state.split)
                throw new Error('只有「分头行动」下才需要选先手');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect')
                throw new Error('先手要在开局前选');
            if (state.round > 1)
                throw new Error('已经开打了，先手每个大回合自动后移');
            const who = state.players[action.playerId];
            if (!who?.alive || who.faction !== 'survivor')
                throw new Error('先手必须是一名幸存者');
            state.splitFirstId = who.id;
            if (!state.splitOrderBase?.length) state.splitOrderBase = [...state.turnOrder];
            applySplitTurnOrder(state);
            log(state, `分头行动：本大回合的先手是 ${who.name}。`, 'all', true);
            break;
        }
        case 'setMode': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以切换模式');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('对局开始后无法切换模式');
            }
            const mode = action.mode;
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
            /** 2对3：2 名杀手 + 3 名幸存者 */
            if (mode === '2v3' && Object.keys(state.players).length > 5) {
                throw new Error('2对3 最多 5 人（2 名杀手 + 3 名幸存者），请先让多余的人退出');
            }
            state.mode = mode;
            state.soloKillerCharacterId = null;
            state.soloSurvivorCharacterIds = [];
            state.crossbowHolderId = null;
            state.crossbowAssigned = false;
            state.survivorOperators = [];
            state.pendingCoopAction = null;
            state.killerOrderDecided = false;
            state.killerTurnOrder = [];
            state.killerTurnIndex = 0;
            state.killerRoundEndedByEncounter = false;
            for (const pl of Object.values(state.players)) {
                pl.faction = null;
                pl.characterId = null;
                pl.ready = false;
                pl.orderPick = null;
            }
            state.phase = 'lobby';
            log(state, mode === 'solo'
                ? '已切换为【单人热座】模式。'
                : mode === 'duo'
                    ? '已切换为【1 对 1】：一人杀手，一人操控 3 名幸存者。'
                    : mode === 'vs2'
                        ? '已切换为【1对2】：一人杀手，两人共控 3 名幸存者。一般行动和额外行动需另一人确认。'
                        : mode === '2v3'
                            ? '已切换为【2对3】：2 名杀手各有一套牌库、手牌与行动区，3 名幸存者。'
                            : '已切换为【1对3】模式。');
            break;
        }
        case 'setSoloKiller': {
            if (state.mode !== 'solo')
                throw new Error('仅单人模式可选');
            if (socketId !== state.hostId)
                throw new Error('只有房主可以选角');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('当前无法选择角色');
            }
            const ch = content.characters.find((c) => c.id === action.characterId);
            if (!ch || ch.faction !== 'killer')
                throw new Error('请选择杀手角色');
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
            if (state.mode === 'solo' && socketId !== state.hostId)
                throw new Error('只有房主可以选角');
            if ((state.mode === 'duo' || state.mode === 'vs2') && p.faction !== 'survivor') {
                throw new Error('请先选择幸存者阵营，再点选 3 名幸存者');
            }
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('当前无法选择角色');
            }
            const ch = content.characters.find((c) => c.id === action.characterId);
            if (!ch || ch.faction !== 'survivor')
                throw new Error('请选择幸存者角色');
            if (state.soloKillerCharacterId === action.characterId) {
                throw new Error('不能与杀手选同一角色');
            }
            const needed = state.rules.maxSurvivors;
            const ids = [...state.soloSurvivorCharacterIds];
            const idx = ids.indexOf(action.characterId);
            if (idx >= 0)
                ids.splice(idx, 1);
            else if (ids.length >= needed) {
                throw new Error(`幸存者已选满 ${needed} 人，请先取消一名再换`);
            }
            else {
                ids.push(action.characterId);
            }
            state.soloSurvivorCharacterIds = ids;
            p.ready = false;
            state.phase = 'characterSelect';
            break;
        }
        /**
         * 女王对局：**进入游戏后**在幸存者行动区指定「谁持有十字弩」。
         * 规则：「在游戏开始时选择一名幸存者持有十字弩。」
         * 这是一次性的指定，指定后那人才拿到十字弩。
         */
        case 'pickCrossbowHolder': {
            if (!isQueenKiller(state))
                throw new Error('只有面对女王时才需要指定十字弩持有者');
            if (state.crossbowAssigned)
                throw new Error('十字弩已经指定过持有者了');
            if (state.phase !== 'crossbowSetup' && state.phase !== 'survivorMain')
                throw new Error('请在开局准备阶段指定十字弩持有者');
            const target = state.players[action.holderId];
            if (!target || target.faction !== 'survivor' || !target.alive)
                throw new Error('请指定一名存活幸存者');
            if (!controlsPiece(state, socketId, target))
                throw new Error('无权操作该幸存者');
            state.crossbowHolderId = target.id;
            state.crossbowAssigned = true;
            target.items.crossbow = 1;
            log(state, `十字弩交给 ${target.name} 持有。`, 'survivor');
            /**
             * 这是**开局准备步骤**：指定完继续走准备流程
             * （女王没有其它准备步骤，所以直接进第 1 回合）。
             */
            if (state.phase === 'crossbowSetup')
                startRound(state);
            break;
        }
        case 'setFaction': {
            if (state.mode === 'solo')
                throw new Error('单人模式请直接选择杀手与幸存者角色');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('当前无法更换阵营');
            }
            if (action.faction === 'killer') {
                const others = Object.values(state.players).filter((x) => x.faction === 'killer' && x.id !== playerId);
                /**
                 * 2对3：**两名**杀手，所以不是"位置已被占用"，而是"已满 2 人"。
                 */
                const cap = state.mode === '2v3' ? 2 : 1;
                if (others.length >= cap) {
                    throw new Error(state.mode === '2v3' ? '2对3 的杀手已满 2 人' : '杀手位置已被占用');
                }
            }
            if (action.faction === 'survivor') {
                const count = Object.values(state.players).filter((x) => x.faction === 'survivor' && x.id !== playerId).length;
                /** 2对3 固定 3 名幸存者（各控一名），不跟 rules.maxSurvivors 走 */
                const cap = state.mode === 'duo' ? 1
                    : state.mode === 'vs2' ? 2
                        : state.mode === '2v3' ? 3
                            : state.rules.maxSurvivors;
                if (count >= cap) {
                    throw new Error(state.mode === 'duo'
                        ? '1 对 1 只能有一名玩家操控全部幸存者'
                        : state.mode === 'vs2'
                            ? '1对2 只能有两名玩家共控幸存者'
                            : `幸存者已满 ${cap} 人`);
                }
            }
            /**
             * 【观众】：**最多 3 个**。
             * 观众不选角色、不「准备」，只是看 —— 所以开局条件不看他们。
             */
            if (action.faction === 'spectator') {
                const count = Object.values(state.players)
                    .filter((x) => x.faction === 'spectator' && x.id !== playerId).length;
                if (count >= 3)
                    throw new Error('观众已满 3 人');
            }
            if ((state.mode === 'duo' || state.mode === 'vs2') &&
                p.faction === 'survivor' &&
                action.faction !== 'survivor') {
                const still = Object.values(state.players).filter((x) => x.faction === 'survivor' && x.id !== playerId).length;
                if (still === 0)
                    state.soloSurvivorCharacterIds = [];
            }
            p.faction = action.faction;
            p.characterId = null;
            p.ready = false;
            state.phase = 'characterSelect';
            break;
        }
        case 'selectCharacter': {
            if (state.mode === 'solo')
                throw new Error('单人模式请用杀手/幸存者选角按钮');
            if ((state.mode === 'duo' || state.mode === 'vs2') && p.faction === 'survivor') {
                throw new Error('幸存者请点选 3 名幸存者角色');
            }
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('当前无法选择角色');
            }
            if (!p.faction || p.faction === 'spectator')
                throw new Error('请先选择阵营');
            const ch = content.characters.find((c) => c.id === action.characterId);
            if (!ch || ch.faction !== p.faction)
                throw new Error('角色无效');
            const taken = Object.values(state.players).some((x) => x.characterId === action.characterId && x.id !== playerId);
            if (taken)
                throw new Error('该角色已被选择');
            p.characterId = action.characterId;
            p.ready = false;
            state.phase = 'characterSelect';
            break;
        }
        case 'setReady': {
            /**
             * 【观众】不需要「准备」—— 他们不占座位、开局条件也不看他们。
             * 直接忽略即可（客户端也不会给他们显示准备按钮）。
             */
            if (p.faction === 'spectator') {
                p.ready = false;
                break;
            }
            if (state.mode === 'solo') {
                if (!state.soloKillerCharacterId ||
                    state.soloSurvivorCharacterIds.length !== state.rules.maxSurvivors) {
                    throw new Error(`请先选好 1 名杀手和 ${state.rules.maxSurvivors} 名幸存者`);
                }
                p.ready = action.ready;
                break;
            }
            if (state.mode === 'duo' || state.mode === 'vs2') {
                if (p.faction === 'killer') {
                    if (!p.characterId)
                        throw new Error('请先选择杀手角色');
                }
                else if (p.faction === 'survivor') {
                    if (state.soloSurvivorCharacterIds.length !== state.rules.maxSurvivors) {
                        throw new Error(`请先点选 ${state.rules.maxSurvivors} 名幸存者`);
                    }
                }
                else {
                    throw new Error('请先选择阵营');
                }
                p.ready = action.ready;
                break;
            }
            if (!p.faction || !p.characterId)
                throw new Error('请先选择阵营和角色');
            p.ready = action.ready;
            break;
        }
        /**
         * 2对3：一名杀手选自己的先后手偏好。
         *
         * 规则：**两人一致才生效**（都先 / 都后 / 一先一后都算"一致"，
         * 具体顺序由 `applyKillerOrderPick` 定）。所以这里只记录偏好，不定顺序。
         */
        case 'pickKillerOrder': {
            if (state.mode !== '2v3')
                throw new Error('先后手只用于 2对3 模式');
            if (p.faction !== 'killer')
                throw new Error('只有杀手可以选择先后手');
            if (state.phase !== 'lobby' && state.phase !== 'characterSelect') {
                throw new Error('开局后无法再改先后手');
            }
            p.orderPick = action.order;
            p.ready = false;
            const other = Object.values(state.players)
                .find((x) => x.faction === 'killer' && x.id !== playerId);
            const mine = action.order === 'first' ? '先手' : '后手';
            const theirs = other?.orderPick === 'first' ? '先手' : other?.orderPick === 'second' ? '后手' : null;
            log(
                state,
                theirs
                    ? `${p.name} 选了${mine}；另一名杀手选了${theirs}。`
                    : `${p.name} 选了${mine}，等另一名杀手选。`,
                'all',
                true,
            );
            break;
        }
        case 'startGame': {
            if (socketId !== state.hostId)
                throw new Error('只有房主可以开始游戏');
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
            if (target.actedThisRound)
                throw new Error('该幸存者本回合已经做过一般行动');
            /**
             * 1对3 / 2对3：**三人同时行动，不存在「等前一人」**。
             * 所以这里只要求「点的是自己的角色」，不再拦 `pendingSurvivorPick`。
             */
            if (state.mode === 'multi' || state.mode === '2v3') {
                if (target.id !== p.id)
                    throw new Error(state.mode === '2v3' ? '2对3 只能点选自己的角色' : '1对3 只能点选自己的角色');
            }
            else if (!state.pendingSurvivorPick) {
                const curId = activeSurvivorId(state);
                const cur = curId ? state.players[curId] : null;
                if (cur?.mainActionUsed) {
                    throw new Error('当前幸存者已开始一般行动，不能再换人');
                }
            }
            startPickedSurvivorTurn(state, target.id);
            break;
        }
        case 'resetPathDraft': {
            /**
             * 把路径草稿清回起点。**草稿本身保留**（`pendingPathDraft` 不清），
             * 所以还能继续点，只是从原地重新规划。
             *
             * ⚠ 起点要按**草稿归属**取：
             *  - `owner === 'survivor'`（幸运币）→ 那个幸存者自己的所在地点
             *  - 其余（杀手牌）→ 杀手所在地点
             * 以前一律取杀手房间，对幸运币是错的。
             */
            const draft = state.pendingPathDraft;
            if (!draft)
                throw new Error('当前没有正在规划的路径');
            if (draft.owner === 'survivor') {
                if (!controlsPiece(state, socketId, p))
                    throw new Error('只能重规划自己角色的移动');
                draft.rooms = p.roomId ? [p.roomId] : [];
                log(state, `已清空幸运币路径，从「${p.roomId ? roomName(state, p.roomId) : '原地'}」重新规划。`);
                break;
            }
            const k0 = state.killerId ? state.players[state.killerId] : null;
            draft.rooms = k0?.roomId ? [k0.roomId] : [];
            log(state, `已清空路径，从「${k0?.roomId ? roomName(state, k0.roomId) : '原地'}」重新规划。`, 'killer');
            break;
        }
        case 'move': {
            if (state.phase === 'encounter' && state.encounter?.step === 'flee') {
                /**
                 * **撤离只认 `encounterFlee`**（撤离是独立的一套，见（甲）流程）。
                 *
                 * 走到这里说明客户端把撤离点击当成了普通移动。正常路径下不会发生；
                 * 万一发生，客户端会在请求里附 `__diag`（见 `useGameSocket`），
                 * 那时才往服务器窗口打一份现场，方便定位。
                 */
                const enc = state.encounter;
                const targetId = enc.targetId;
                const target = targetId ? state.players[targetId] : null;
                const clientDiag = (action as unknown as { __diag?: unknown }).__diag;
                if (clientDiag) {
                    console.warn(
                        '[撤离诊断] 收到 move（不是 encounterFlee）\n' +
                        `  房间=${state.roomCode} 模式=${state.mode}\n` +
                        `  发送者 socket=${socketId} → 解析出的棋子=${playerId}（${p?.name ?? '?'}）\n` +
                        `  正在撤离的是 ${targetId ?? '（还没选人）'}（${target?.name ?? '?'}）\n` +
                        `  待撤离名单=[${pendingFleeIds(state).map((i) => `${state.players[i]?.name ?? i}(${i})`).join(' → ')}]\n` +
                        `  请求内容=${JSON.stringify(action)}\n` +
                        `  客户端自报现场=${JSON.stringify(clientDiag)}`,
                    );
                }
                throw new Error(
                    target
                        ? `请使用逃离操作（现在轮到「${target.name}」撤离：点地图选相邻 1 格后按「确认移动」，或按「留在原地」）`
                        : '请先在"谁来撤离"名单里点一个人，再让他撤离',
                );
            }
            /**
             * **幸存者自己的路径草稿**（凯莱布「幸运币」的〔移動〕×0-2）：
             * 抢在 `assertActive` 和幸存者"一般行动移动"分支**之前**处理 ——
             *  - 幸运币是**额外行动**，不占一般行动，也不要求"轮到你"（1对3 各管各的）
             *  - 草稿走的是"逐格点路径"，和一般行动的"一次走到目的地"完全不同
             */
            if (state.pendingPathDraft?.owner === 'survivor') {
                if (p.faction !== 'survivor' || !p.alive)
                    throw new Error('仅幸存者可规划这条路径');
                if (!controlsPiece(state, socketId, p))
                    throw new Error('只能规划自己角色的移动');
                const coinDraft = state.pendingPathDraft;
                const coinLast = coinDraft.rooms[coinDraft.rooms.length - 1];
                if (!coinLast)
                    throw new Error('没有起点');
                if (action.toRoomId === coinLast) {
                    if (coinDraft.rooms.length > 1) {
                        coinDraft.rooms = coinDraft.rooms.slice(0, -1);
                        log(state, `已取消该步。路径：${coinDraft.rooms.map((id) => roomName(state, id)).join(' → ')}`);
                    }
                    break;
                }
                /**
                 * ⚠ 这里用**幸存者口径**的相邻性（`generalAdjacentRooms`，门 + 虚线，
                 * 受封堵阻挡），**不能用 `roomsAdjacentKiller`** ——
                 * 后者把**杀手密道**也算进去，那是只有杀手本人移动才能走的。
                 */
                if (!generalAdjacentRooms(state.map, coinLast).includes(action.toRoomId)) {
                    throw new Error('请点与当前路径末端相邻的地点');
                }
                if (coinDraft.rooms.length - 1 >= coinDraft.max)
                    throw new Error(`最多只能移动 ${coinDraft.max} 步，请点确认`);
                coinDraft.rooms.push(action.toRoomId);
                log(state, `幸运币路径：${coinDraft.rooms.map((id) => roomName(state, id)).join(' → ')}（再点末端可取消，确认后才移动）`);
                break;
            }
            assertActive(state, playerId);
            if (p.faction === 'survivor') {
                assertSurvivorMainAction(p);
                /**
                 * 【变体1】特性 06「匆匆逃离」：
                 * 「当你在位于杀手距离 1 以内的位置，选择【移动】作为基础行动时，
                 *   你可以额外【移动】X1。」
                 *
                 * 卡面写"可以" → 玩家**用不用由他自己决定**：这里只是把可达范围 +1，
                 * 点近的地方就是没用、点更远的那个地方就是用（和 09 生存本能同一套做法，
                 * 不用额外弹确认框）。
                 */
                const fleeBoost =
                    state.variant1 &&
                    p.roomId &&
                    hasTrait(state, p.id, 'trait_s06') &&
                    withinKillerDistance(state, p.roomId, 1)
                        ? 1
                        : 0;
                const range = state.rules.survivorMoveRange + p.moveBonus + fleeBoost;
                /**
                 * **一步一步选路径**：客户端把玩家点出来的完整路径（含起点）放在 `path` 里。
                 * 服务端按**这条路径**逐段校验并移动 —— 不再自己算最短路径，
                 * 否则玩家选了 R3→B5，实际会走成 B2→B5。
                 * 没传 `path` 时（老客户端 / 内部调用）退回「按目的地算最短路径」。
                 */
                const raw = action.path;
                /**
                 * **捕网陷阱：被放倒的幸存者本回合不能离开那个地点。**
                 * （`netLockedRoom` 以前是死代码，从没被调用过 —— 所以捕网
                 *   只是"报告一下"，实际没拦住任何人。）
                 */
                {
                    const locked = netLockedRoom(state, playerId);
                    if (locked && action.toRoomId !== locked)
                        throw new Error(`你被「${roomName(state, locked)}」的捕网陷阱放倒，本回合不能离开这里`);
                }
                if (raw && raw.length >= 2) {
                    if (!p.roomId || raw[0] !== p.roomId)
                        throw new Error('路径必须从你当前所在地点开始');
                    const last = raw[raw.length - 1];
                    if (last !== action.toRoomId)
                        throw new Error('路径终点和目的地不一致');
                    if (raw.length - 1 > range)
                        throw new Error(`移动力只有 ${range} 步`);
                    /**
                     * **逐格走**：每步都做相邻性校验，中途踩到陷阱会被拦下
                     * （`walkSurvivorPath` 里逐格 `tryMove` + 查捕网）。
                     * 某步非法时它会把人物**退回起点**，所以这里直接抛错即可。
                     */
                    const res = walkSurvivorPath(state, playerId, p.roomId, [...raw]);
                    if (!res.ok)
                        throw new Error('路径不合法（必须从当前位置出发、每步相邻且不被封堵）');
                }
                else {
                    const ok = tryMove(state, playerId, action.toRoomId, range, 1);
                    if (!ok)
                        throw new Error('一般行动移动必须 1–2 步');
                }
                p.mainActionUsed = true;
                p.moveLeft = 0;
                /**
                 * 【变体1】幸存者特性 07「无所畏惧」：
                 * 「选择【移动】作为你的基础行动时，移除你的 1 个恐惧标记。」
                 *
                 * 这是**默认要做**的被动（卡面没有"可以"），所以不询问、直接结算。
                 * 只写幸存者战报 —— 恐惧是隐藏信息。
                 */
                if (state.variant1 && hasTrait(state, p.id, 'trait_s07') && p.fear > 0) {
                    p.fear -= 1;
                    /** 不足 2 枚就不再算"恐惧过度"（和 `addFear` 的口径对齐） */
                    if (p.fear < 2)
                        p.overFear = false;
                    log(
                        state,
                        `【变体1】${p.name}「无所畏惧」：以【移动】作为基础行动，移除 1 个恐惧标记（剩 ${p.fear}）。`,
                        'survivor',
                    );
                }
                advanceAfterSurvivor(state, p.id);
            }
            else if (p.faction === 'killer') {
                if (state.phase !== 'killerMain' && state.phase !== 'upkeep')
                    throw new Error('当前无法移动');
                if (state.pendingBlockadeJob && state.pendingBlockadeJob.removeLeft > 0) {
                    const hits = removableForJob(state).filter((id) => {
                        const pair = parseDoor(id);
                        return pair && (pair[0] === action.toRoomId || pair[1] === action.toRoomId);
                    });
                    if (hits.length === 0)
                        throw new Error('请选择一个可拆除的已封堵门');
                    if (hits.length > 1)
                        throw new Error('该地点有多扇已封堵门，请在行动区点选要拆除的那扇');
                    removeBoardBlockade(state, hits[0]);
                    resumeAfterKillerChoice(state);
                    if (state.phase === 'upkeep')
                        maybeCloseKillerUpkeep(state);
                    break;
                }
                if (state.pendingBlockadeJob?.kind === 'anyDoors' && state.pendingBlockadeJob.removeLeft <= 0) {
                    pickAnyDoorRoom(state, action.toRoomId);
                    break;
                }
                if (state.pendingPathDraft) {
                    const draft = state.pendingPathDraft;
                    const last = draft.rooms[draft.rooms.length - 1];
                    if (!last)
                        throw new Error('没有起点');
                    /**
                     * 撤销 / 追加（**和幸存者那套完全一致**）：
                     *  - 点**最新选的那一格** → 取消那一步
                     *  - 其他格子 → 按「走一步」处理：与末端相邻就追加
                     *
                     * ⚠ 以前用 `lastIndexOf`：点任何**已在路径里**的格子都截断到那里。
                     * 但玩家想走回头路时点的正是「上一格」（它就在路径里！），
                     * 于是 `lastIndexOf` 命中 → 被截断 —— **回头路永远走不了**。
                     */
                    if (draft.rooms.length > 1 && action.toRoomId === last) {
                        draft.rooms = draft.rooms.slice(0, -1);
                        log(state, `已取消该步。路径：${draft.rooms.map((id) => roomName(state, id)).join(' → ')}`, 'killer');
                        break;
                    }
                    if (!moveAdjacentRooms(state, last, state.killerId).includes(action.toRoomId)) {
                        throw new Error('请点与当前路径末端相邻的地点');
                    }
                    const taken = draft.rooms.length - 1;
                    if (taken >= draft.max)
                        throw new Error('步数已用完，请点确认');
                    draft.rooms.push(action.toRoomId);
                    log(state, `路径：${draft.rooms.map((id) => roomName(state, id)).join(' → ')}（再点末端可取消，确认后才结算）`, 'killer');
                    break;
                }
                if (state.pendingSensePair) {
                    const pending = state.pendingSensePair;
                    if (pending.secondRoomId && action.toRoomId === pending.secondRoomId) {
                        pending.secondRoomId = null;
                        log(state, `已取消「${roomName(state, action.toRoomId)}」。请再选第二个地点或确认。`, 'killer');
                        break;
                    }
                    if (pending.firstRoomId && action.toRoomId === pending.firstRoomId) {
                        pending.firstRoomId = pending.secondRoomId ?? null;
                        pending.secondRoomId = null;
                        log(state, pending.firstRoomId
                            ? `已取消该地点。当前仍选「${roomName(state, pending.firstRoomId)}」。`
                            : '已取消地点选择。请重新点选。');
                        break;
                    }
                    if (!pending.firstRoomId) {
                        if (!state.map.rooms.some((r) => r.id === action.toRoomId))
                            throw new Error('未知地点');
                        pending.firstRoomId = action.toRoomId;
                        log(state, `已选「${roomName(state, action.toRoomId)}」，请再选一个与它相连的地点，然后确认。再点同一格可取消。`, 'killer');
                        break;
                    }
                    if (pending.secondRoomId) {
                        throw new Error('已经选好两个地点，请点确认感知，或再点已选地点取消');
                    }
                    if (!mapAdjacentRooms(state.map, pending.firstRoomId).includes(action.toRoomId)) {
                        throw new Error('这两个地点不相连');
                    }
                    pending.secondRoomId = action.toRoomId;
                    log(state, `已选「${roomName(state, pending.firstRoomId)}」与「${roomName(state, action.toRoomId)}」，请点确认感知。`, 'killer');
                    break;
                }
                if (state.pendingTrackerPick) {
                    // 追踪：点地图上没有意义（要点人），提示一下
                    throw new Error('追蹤：请在上方列表里选择一名幸存者');
                }
                // 猎手本能：点地图选要感知的地点（还要在行动区确认）
                if (state.pendingSenseRoom != null || state.killerSenseRoomActive) {
                    if (!state.map.rooms.some((r) => r.id === action.toRoomId))
                        throw new Error('未知地点');
                    state.pendingSenseRoom =
                        state.pendingSenseRoom === action.toRoomId ? null : action.toRoomId;
                    log(state, state.pendingSenseRoom
                        ? `已选「${roomName(state, state.pendingSenseRoom)}」，请在行动区确认感知（再点同一格可取消）。`
                        : '已取消地点选择。', 'killer');
                    break;
                }
                if (state.pendingBlockade) {
                    /**
                     * 用「本次请求封堵的地点」而不是杀手当前地点 ——
                     * 枝條生長可以让杀手在**别的地点**封堵。
                     */
                    const roomForDoor = state.pendingBlockadeRoom ?? p.roomId;
                    if (!roomForDoor)
                        throw new Error('不在地图上');
                    placeBlockade(state, roomForDoor, action.toRoomId);
                    afterOneDoorPlaced(state);
                    /** 这次效果还要再封几扇就继续请求点门 */
                    if (state.pendingBlockadeRemaining > 0) {
                        state.pendingBlockadeRemaining -= 1;
                        if (state.pendingBlockadeRemaining > 0 &&
                            continueBlockadeRequest(state))
                            break;
                        state.pendingBlockadeRemaining = 0;
                    }
                    state.pendingBlockadeRoom = null;
                    /**
                     * **粘液腺體**：这次点门是"回合收尾"里挂起的
                     * （`closeKillerTurn` 记了 `pendingTurnEndSwitch`）——
                     * 点完就把回合收尾走完、切给幸存者
                     * （用户要求：「处理完才给到幸存者」）。
                     */
                    if (state.pendingTurnEndSwitch) {
                        state.pendingTurnEndSwitch = false;
                        state.pendingBlockadeRemaining = 0;
                        finishKillerTurn(state);
                        break;
                    }
                    continueKillerQueue(state);
                    if (!hasPendingKillerChoice(state)) {
                        flushDeferredPlayedCard(state);
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
                if (state.killerMainActionsLeft <= 0)
                    throw new Error('没有剩余主要行动');
                /**
                 * 女王移动：若**移动前**所在地点有僵尸，
                 * 就让杀手选「带几个僵尸一起走」（或取消），选完才真的移动。
                 */
                if (isQueenKiller(state) && !state.pendingQueenMove) {
                    const here = zombiesIn(state, p.roomId ?? '');
                    if (here.length) {
                        state.pendingQueenMove = {
                            toRoomId: action.toRoomId,
                            zombieIds: here.map((z) => z.id),
                        };
                        log(state, `女王移动前所在位置有 ${here.length} 个僵尸：请选择带几个一起移动（或取消）。`, 'killer');
                        break;
                    }
                }
                /**
                 * 【城堡】机关大门：**幸存者绝对不能过**。
                 *
                 * 杀手分两种（用户明确）：
                 *  - **非潜行**：弃 3 张手牌才能过，付完才真的移动、并把大门拆掉；
                 *  - **潜行**：**免费直接过去，门也不拆** —— 和"潜行穿过封堵不拆"
                 *    是同一个道理（悄悄钻过去，不留痕迹）。
                 *
                 * 所以这里只在**非潜行**时拦下来挂 `pendingGatePay`；
                 * 潜行的话整个判定跳过，走下面的正常移动。
                 */
                if (!p.stealth) {
                    const gateDoor = leverGateOnPath(state, p, action.toRoomId);
                    if (gateDoor) {
                        if (state.killerHand.length < LEVER_GATE_COST) {
                            throw new Error(`通过机关大门需要弃 ${LEVER_GATE_COST} 张手牌（手里不足）`);
                        }
                        state.pendingGatePay = {
                            actorId: p.id,
                            toRoomId: action.toRoomId,
                            doorId: gateDoor,
                            picked: [],
                        };
                        /**
                         * ⚠ 用户口径（2026-10）：「**杀手不知道谁放的门**」——
                         * 所以这里**不写**是谁操作的控制杆，只说"大门挡路"。
                         * （以前这条写过名字，那是更早的要求，已被这条取代。）
                         */
                        log(
                            state,
                            `机关大门挡路：请自选弃置 ${LEVER_GATE_COST} 张手牌才能通过（通过后大门被拆除）。`,
                            'killer',
                        );
                        break;
                    }
                }
                else {
                    /** 潜行过门：写一条战报记账，门保持原样 */
                    const gateDoor = leverGateOnPath(state, p, action.toRoomId);
                    if (gateDoor)
                        log(state, `${p.name} 潜行通过机关大门（不弃牌、大门不拆）。`, 'killer');
                }
                /**
                 * ⚠ **被停滞的雕像"能做、但执行时被跳过"**（用户口径：
                 * 「雕像被停滞后，移动和搜索在执行时被跳过，**而不是不能做**」）。
                 *
                 * 所以这里不抛错：照常消耗这次普通行动，但雕像**不移动**
                 * （战报写一句，让杀手知道这次白点了）。
                 */
                if (p.statueIndex != null && p.statueHalted) {
                    state.killerMainActionsLeft -= 1;
                    p.actionsLeft = state.killerMainActionsLeft;
                    log(state, `雕像 ${p.statueIndex} 本回合被停滞，这次移动被跳过（雕像不移动）。`, 'killer');
                    maybeFinishKillerMain(state);
                    break;
                }
                const range = state.rules.killerMoveRange + p.moveBonus;
                const ok = tryMove(state, playerId, action.toRoomId, range);
                if (!ok)
                    throw new Error('非法移动');
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
                /**
                 * ⚠ **第六感挂起时先别推进回合** —— 搜索者还要选留哪张。
                 *
                 * 以前这里无条件推进：`advanceAfterSurvivor` 会把"轮到谁"换成下一个幸存者，
                 * 于是快照里的 `you` 不再是他、`pendingSixthSense` 也就不下发给他，
                 * 界面上**选项根本不出现**、服务端一直在等 → 用户报的
                 * "欧菲莉亚二技能搜索后没有选择的选项，直接卡死了"。
                 * 推进挪到 `resolveSixthSense` 选完之后。
                 */
                if (!state.pendingSixthSense)
                    advanceAfterSurvivor(state, p.id);
            }
            else if (p.faction === 'killer') {
                if (state.phase !== 'killerMain')
                    throw new Error('当前无法搜索房间');
                if (hasPendingKillerChoice(state))
                    throw new Error('请先完成当前牌的选择');
                if (state.killerTurnStep !== 'main' || state.killerMainChoice !== 'actions') {
                    throw new Error('请先结束快速阶段，并选择执行 2 个普通行动');
                }
                if (state.killerMainActionsLeft <= 0)
                    throw new Error('没有剩余主要行动');
                /**
                 * ⚠ **被停滞的雕像"能做、但执行时被跳过"**（用户口径：
                 * 「雕像被停滞后，移动和搜索在执行时被跳过，**而不是不能做**」）。
                 *
                 * 不抛错：照常消耗这次普通行动，但**不搜索**（战报写一句）。
                 */
                if (p.statueIndex != null && p.statueHalted) {
                    state.killerMainActionsLeft -= 1;
                    p.actionsLeft = state.killerMainActionsLeft;
                    log(state, `雕像 ${p.statueIndex} 本回合被停滞，这次搜索被跳过（不搜索）。`, 'killer');
                    maybeFinishKillerMain(state);
                    break;
                }
                setStealth(p, false);
                state.killerMainActionsLeft -= 1;
                p.actionsLeft = state.killerMainActionsLeft;
                const here = p.roomId;
                if (!here)
                    throw new Error('不在地图上');
                const victims = survivorsInRoom(state, here);
                state.lastSearchFound = victims.length > 0;
                if (victims.length === 0) {
                    log(state, `${p.name} 搜索房间，没有发现人。`);
                }
                else {
                    log(state, `${p.name} 发现了 ${victims.length} 名幸存者！`);
                }
                /** 【变体3】爆炸陷阱：搜到带计划标记、且没人的地点 → 幸存者立刻获胜 */
                if (checkPlanBombTrapOnKillerSearch(state, here))
                    break;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            else {
                throw new Error('无法搜索房间');
            }
            break;
        }
        /**
         * 【快进】（**只有单人热座 `solo`**）
         *
         * 用户为了测后期效果要的：
         *  - 幸存者侧：还没做一般行动的幸存者**全部做「消除恐惧」**（占掉一般行动）
         *    → 进发现阶段 → 直接发给**第一个**幸存者 → **选第一张**发现物 → 响声报告
         *  - 杀手侧：**不打出任何卡牌**，一般行动阶段**原地搜索两次**，
         *    然后结束回合（自动摸牌收尾，进下一轮 = 幸存者大回合开始）
         */
        case 'fastForward': {
            if (state.mode !== 'solo')
                throw new Error('快进只在单人热座模式可用');
            if (state.phase === 'survivorMain') {
                fastForwardSurvivors(state);
                break;
            }
            if (state.phase === 'killerMain') {
                fastForwardKiller(state);
                break;
            }
            throw new Error('现在不能快进（只在幸存者大回合 / 杀手回合可用）');
        }
        case 'repair': {
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            doRepair(state, playerId);
            p.mainActionUsed = true;
            p.moveLeft = 0;
            advanceAfterSurvivor(state, p.id);
            break;
        }
        // —— 乔治：聪明绝顶两个分支 + 用笔记 + 挑笔记 ——
        case 'georgeToolboxRepair': {
            const actor = action.actorPlayerId ? state.players[action.actorPlayerId] : p;
            if (!actor)
                throw new Error('找不到乔治');
            if (!controlsPiece(state, socketId, actor))
                throw new Error('无权操作该幸存者');
            georgeToolboxRepair(state, actor);
            break;
        }
        case 'georgeDraw': {
            const actor = action.actorPlayerId ? state.players[action.actorPlayerId] : p;
            if (!actor)
                throw new Error('找不到乔治');
            if (!controlsPiece(state, socketId, actor))
                throw new Error('无权操作该幸存者');
            georgeDraw(state, actor);
            break;
        }
        case 'useNote': {
            const actor = action.actorPlayerId ? state.players[action.actorPlayerId] : p;
            if (!actor)
                throw new Error('找不到幸存者');
            if (!controlsPiece(state, socketId, actor))
                throw new Error('无权操作该幸存者');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者阶段可以使用笔记');
            useGeorgeNote(state, actor, action.noteId, action.toRoomId ?? null);
            break;
        }
        /**
         * 乔治「拆封堵」笔记：点选/取消一个要拆的封堵（最多 2 个）。
         * 再点同一个 = 取消那一个。
         */
        case 'pickNoteBlockade': {
            const pend = state.pendingGeorgeBlockade;
            if (!pend)
                throw new Error('当前不是选择拆除封堵');
            const actor = Object.values(state.players).find(
                (pl) => pl.faction === 'survivor' && isGeorge(state, pl.id),
            );
            if (!actor || !controlsPiece(state, socketId, actor))
                throw new Error('只有乔治可以选择拆除哪些封堵');
            const id = canonicalDoorId(action.doorId);
            if (!pend.doors.includes(id))
                throw new Error('这个封堵不在可拆范围（只能拆与你所在地点相连的）');
            const at = pend.picked.indexOf(id);
            if (at >= 0) {
                pend.picked.splice(at, 1);
                log(state, `已取消拆除「${doorLabel(state, id)}」。`, 'survivor');
            }
            else {
                if (pend.picked.length >= 2) {
                    /**
                     * 规则是「至多 2 个」—— 选满 2 个后想换，就先取消一个，
                     * 所以这里不自动顶替。
                     */
                    throw new Error('最多只能拆 2 个，先取消一个再选');
                }
                pend.picked.push(id);
                log(state, `已选「${doorLabel(state, id)}」（${pend.picked.length}/2）。`, 'survivor');
            }
            break;
        }
        /** 乔治「拆封堵」笔记：确认拆除已选的封堵（0 个也可以，等于放弃） */
        case 'confirmNoteBlockade': {
            const pend = state.pendingGeorgeBlockade;
            if (!pend)
                throw new Error('当前不是选择拆除封堵');
            const actor = Object.values(state.players).find(
                (pl) => pl.faction === 'survivor' && isGeorge(state, pl.id),
            );
            if (!actor || !controlsPiece(state, socketId, actor))
                throw new Error('只有乔治可以确认拆除封堵');
            /** 只拆**现在还真实存在**的那些（期间可能被别人的效果移走） */
            const take = pend.picked.filter((id) => isDoorBlocked(state, id));
            for (const door of take)
                removeBlockade(state, door, actor.id);
            takeItem(actor, pend.noteId, 1);
            discardConsumedItem(state, pend.noteId, 1);
            state.pendingGeorgeBlockade = null;
            log(
                state,
                take.length
                    ? `${actor.name} 使用「乔治的笔记」拆除了 ${take.length} 块封堵。`
                    : `${actor.name} 使用「乔治的笔记」，但没有拆除任何封堵。`,
            );
            /** 额外行动：不占一般行动，所以**不结束小回合** */
            break;
        }
        /** 乔治「拆封堵」笔记：取消这次选择，笔记不消耗 */
        case 'cancelNoteBlockade': {
            const pend = state.pendingGeorgeBlockade;
            if (!pend)
                break;
            const actor = Object.values(state.players).find(
                (pl) => pl.faction === 'survivor' && isGeorge(state, pl.id),
            );
            if (!actor || !controlsPiece(state, socketId, actor))
                throw new Error('只有乔治可以取消拆除封堵');
            state.pendingGeorgeBlockade = null;
            log(state, `${actor.name} 取消使用「乔治的笔记」，没有拆除封堵。`, 'survivor');
            break;
        }
        case 'chooseGeorgeNote': {
            const actor = Object.values(state.players).find((pl) => pl.faction === 'survivor' && isGeorge(state, pl.id));
            if (!actor)
                throw new Error('本局没有乔治');
            if (!controlsPiece(state, socketId, actor))
                throw new Error('只有乔治可以挑笔记');
            chooseGeorgeNote(state, actor, action.noteId ?? '');
            break;
        }
        case 'clearFear': {
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            if (!state.rules.enableFear)
                throw new Error('本局未启用恐惧');
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
            if (!state.rules.enableBlockades)
                throw new Error('本局未启用封堵');
            if (!p.roomId)
                throw new Error('不在地图上');
            /**
             * ⚠ **拆哪一块由玩家自己选**（用户口径：「幸存者移除封堵应该是
             * **他自己选择移除**，不是自动」）——
             * 以前这里只传房间号，`removeBlockade` 在屋里几块封堵里**随便挑一块**。
             * 现在：给 `doorId` 就拆那一扇；没给的话只有"这儿正好一块"才成立。
             */
            const removable = blockedDoorsAt(state, p.roomId);
            if (!removable.length) {
                throw new Error('当前地点没有可拆的门封堵');
            }
            const door = action.doorId ? canonicalDoorId(action.doorId) : null;
            if (door && !removable.includes(door))
                throw new Error('这块封堵不在你所在地点');
            if (!door && removable.length > 1)
                throw new Error('这个地点有多块封堵，请选择要拆除哪一块');
            removeBlockade(state, door ?? p.roomId, p.id);
            p.mainActionUsed = true;
            p.moveLeft = 0;
            advanceAfterSurvivor(state, p.id);
            break;
        }
        case 'tradeItem': {
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者阶段（发现之前）可交易');
            const giverId = action.fromPlayerId ?? playerId;
            const giver = state.players[giverId];
            if (isSharedSurvivorMode(state)) {
                if (!controlsPiece(state, socketId, giver)) {
                    throw new Error('无权操作该幸存者');
                }
            }
            else {
                if (p.faction !== 'survivor' || !p.alive)
                    throw new Error('只有幸存者可交易');
                if (!giver || giver.controllerId !== socketId || giver.id !== p.id) {
                    throw new Error('只能交出自己的物品');
                }
            }
            const target = state.players[action.targetPlayerId];
            const itemId = action.itemId;
            const amount = action.amount ?? 1;
            assertTradeLegal(state, giver, target, itemId, amount, action.receiveItemId);
            /**
             * 交换物品也算**额外行动**，所以停滞过的幸存者本大回合不能再交换。
             */
            for (const who of [giver, target]) {
                if (who?.haltedThisRound) {
                    throw new Error(`${who.name} 本大回合已经执行过停滞，不能再交换物品`);
                }
            }
            if (giver)
                giver.tradedThisTurn = true;
            if (target)
                target.tradedThisTurn = true;
            if (state.mode === 'multi' || state.mode === '2v3') {
                if (state.pendingTrade)
                    throw new Error('已有一笔交换等待确认');
                state.pendingTrade = {
                    fromPlayerId: giver.id,
                    targetPlayerId: target.id,
                    itemId,
                    amount,
                    receiveItemId: action.receiveItemId,
                };
                log(state, action.receiveItemId
                    ? `${giver.name} 向 ${target.name} 提出用 ${itemName(itemId)} 交换 ${itemName(action.receiveItemId)}，等待确认。`
                    : `${giver.name} 向 ${target.name} 提出给予 ${amount}×${itemName(itemId)}，等待确认。`);
                break;
            }
            applyResolvedTrade(state, giver, target, itemId, amount, action.receiveItemId);
            break;
        }
        /**
         * 【分头行动】**给钥匙**（额外行动）。
         *
         * 钥匙不进物品栏、单独保管，所以不能走 `tradeItem`（那套按 `items` 算）。
         * 规则：同一地点的幸存者之间可以给**任意把**；先点给出 → 选几把 → 对方确认。
         */
        case 'tradeKeys': {
            if (!state.split)
                throw new Error('只有「分头行动」下才有单独保管的钥匙');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者阶段可交换钥匙');
            const giverId = action.fromPlayerId ?? playerId;
            const giver = state.players[giverId];
            const target = state.players[action.targetPlayerId];
            if (!giver?.alive || giver.faction !== 'survivor')
                throw new Error('给出者无效');
            if (!target?.alive || target.faction !== 'survivor')
                throw new Error('接收者无效');
            if (giver.id === target.id)
                throw new Error('不能给自己');
            if (!giver.roomId || giver.roomId !== target.roomId)
                throw new Error('必须在同一地点');
            const amount = Math.max(1, Math.floor(action.amount ?? 1));
            if ((giver.keys ?? 0) < amount)
                throw new Error(`${giver.name} 只有 ${giver.keys ?? 0} 把钥匙`);
            /** 额外行动：做过停滞的本大回合不能再做 */
            if (giver.haltedThisRound)
                throw new Error(`${giver.name} 本大回合已经执行过停滞，不能再交换钥匙`);
            giver.extraActionUsedThisTurn = true;
            if (state.mode === 'multi' || state.mode === '2v3') {
                if (state.pendingTrade)
                    throw new Error('已有一笔交换等待确认');
                state.pendingTrade = {
                    fromPlayerId: giver.id,
                    targetPlayerId: target.id,
                    itemId: 'key',
                    amount,
                    kind: 'keys',
                };
                log(state, `${giver.name} 向 ${target.name} 提出给予 ${amount} 把钥匙，等待确认。`, 'survivor');
                break;
            }
            /** 热座 / 共控：直接给（不用等确认） */
            giver.keys = (giver.keys ?? 0) - amount;
            target.keys = (target.keys ?? 0) + amount;
            log(state, `${giver.name} 给了 ${target.name} ${amount} 把钥匙。`, 'survivor');
            break;
        }
        /**
         * 【分头行动】**从遗留物上拿东西**（额外行动）。
         *
         * 同地点有人逃脱/被杀后，立绘留在原地 —— 他剩下的钥匙和物品可以被
         * 同地点的幸存者拿走。用户明确：这是**额外行动**，而且
         * 「拿多了可弃」（超出背包格走既有的 `enforceInventory` 弃牌流程）。
         *
         * ⚠ 不需要对方确认：遗留物的主人已经不在场上了，没法点"确认收下"。
         */
        case 'lootFrom': {
            if (!state.split)
                throw new Error('只有「分头行动」才能从遗留物上拿东西');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者阶段可以拾取');
            const from = state.players[action.fromPlayerId];
            const to = state.players[action.actorPlayerId ?? playerId];
            if (!from || from.faction !== 'survivor' || from.alive)
                throw new Error('那个人还在场上，不能用这种方式拿东西');
            /**
             * ⚠ **逃脱的人身上一律清零**（用户规则）：钥匙和物品都被他带走了，
             * 原地只剩一个变暗的立绘 —— 所以没有东西可拿。
             * 只有**被杀**的人（还躺在地上）才留钥匙和物品。
             */
            if (from.escaped)
                throw new Error(`${from.name} 已经逃脱，身上什么都没留下`);
            if (!to?.alive || to.faction !== 'survivor')
                throw new Error('拾取者无效');
            if (!from.roomId || from.roomId !== to.roomId)
                throw new Error('必须在同一地点才能拾取');
            /** 额外行动：做过停滞的本大回合不能再做 */
            if (to.haltedThisRound)
                throw new Error(`${to.name} 本大回合已经执行过停滞，不能再拾取`);
            to.extraActionUsedThisTurn = true;
            if (action.itemId) {
                if ((from.items[action.itemId] ?? 0) < 1)
                    throw new Error('他身上没有这件物品');
                from.items[action.itemId] = (from.items[action.itemId] ?? 0) - 1;
                to.items[action.itemId] = (to.items[action.itemId] ?? 0) + 1;
                log(state, `${to.name} 从 ${from.name} 的遗留物里拿走了 ${itemName(action.itemId)}。`, 'survivor');
                /** 拿多了可弃：超出背包格会挂起"请弃装备" */
                enforceInventory(state, to.id);
                break;
            }
            const amount = Math.max(1, Math.floor(action.amount ?? 1));
            if ((from.keys ?? 0) < amount)
                throw new Error('他身上没有那么多钥匙');
            from.keys = (from.keys ?? 0) - amount;
            to.keys = (to.keys ?? 0) + amount;
            log(state, `${to.name} 从 ${from.name} 的遗留物里拿走了 ${amount} 把钥匙。`, 'survivor');
            break;
        }
        case 'respondTrade': {
            const offer = state.pendingTrade;
            if (!offer)
                throw new Error('当前没有待确认的交换');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者阶段可确认交换');
            const isTarget = p.id === offer.targetPlayerId;
            const isGiver = p.id === offer.fromPlayerId;
            if (!isTarget && !isGiver)
                throw new Error('无权处理这笔交换');
            if (!action.accept) {
                log(state, `${p.name} ${isTarget && !isGiver ? '拒绝了' : '取消了'}物品交换。`);
                state.pendingTrade = null;
                break;
            }
            if (!isTarget)
                throw new Error('只能由接收方确认收下');
            const giver = state.players[offer.fromPlayerId];
            const target = state.players[offer.targetPlayerId];
            /**
             * 【分头行动】**钥匙交换**走自己的结算（钥匙不在 `items` 里，
             * `assertTradeLegal` / `applyResolvedTrade` 都按物品算，套不上）。
             */
            if (offer.kind === 'keys') {
                const ok = Boolean(
                    giver?.alive && target?.alive &&
                    giver.roomId && giver.roomId === target.roomId &&
                    (giver.keys ?? 0) >= offer.amount,
                );
                state.pendingTrade = null;
                if (!ok)
                    throw new Error('这笔钥匙交换已经失效（人不在同一地点 / 钥匙不够）');
                giver.keys = (giver.keys ?? 0) - offer.amount;
                target.keys = (target.keys ?? 0) + offer.amount;
                log(state, `${giver.name} 给了 ${target.name} ${offer.amount} 把钥匙。`, 'survivor');
                break;
            }
            try {
                assertTradeLegal(state, giver, target, offer.itemId, offer.amount, offer.receiveItemId);
            }
            catch (err) {
                state.pendingTrade = null;
                throw err;
            }
            applyResolvedTrade(state, giver, target, offer.itemId, offer.amount, offer.receiveItemId);
            state.pendingTrade = null;
            break;
        }
        case 'discardItem': {
            const pending = state.pendingItemDiscard;
            if (!pending || pending.playerId !== playerId)
                throw new Error('当前不需要弃装备');
            if (p.faction !== 'survivor')
                throw new Error('只有幸存者可弃装备');
            if (!takeItem(p, action.itemId, 1))
                throw new Error('你没有这件装备');
            discardConsumedItem(state, action.itemId, 1);
            pending.count -= 1;
            log(state, `${p.name} 弃置了 ${itemName(action.itemId)}。`);
            if (pending.count <= 0 || itemCount(p.items) <= inventorySlotsFor(state, p.id)) {
                state.pendingItemDiscard = null;
                if (state.phase === 'discovery') {
                    /**
                     * ⚠ 弃完之后的收尾分两种：
                     *  - 普通发现：候选已经清空 → 进响声报告
                     *  - 特性 18「拾物妙手」两张都留：第一张结算时被弃装打断，
                     *    候选还挂着 → **接着结算第二张**（不是进响声报告）
                     */
                    if (state.discoveryOptions.length === 0)
                        enterNoiseReport(state);
                    else if (!continueKeepBothDiscovery(state) && !finishKeepBothDiscovery(state)) {
                        /**
                         * 兜底：候选还挂着、但已经没有"待续结算"的了（理论上不该出现）。
                         * 与其把两张候选一直挂在那儿让玩家无从下手，不如清掉候选、把流程推下去。
                         */
                        state.discoveryOptions = [];
                        state.discoveryKeepQueue = null;
                        state.discoveryKeepBoth = false;
                        enterNoiseReport(state);
                    }
                }
            }
            break;
        }
        case 'useSkill': {
            const ch = content.characters.find((c) => c.id === p.characterId);
            const skill = ch?.skills.find((s) => s.id === action.skillId);
            if (!skill)
                throw new Error('未知技能');
            if (skill.trigger !== 'activated')
                throw new Error('该技能不可主动使用');
            if (skill.oncePerTurn && p.skillUsedThisTurn.has(skill.id)) {
                throw new Error('本回合已使用过该技能');
            }
            if (skill.id === 'observant') {
                if (p.faction !== 'survivor' || !p.alive)
                    throw new Error('只有幸存者可使用');
                if (state.phase !== 'survivorMain')
                    throw new Error('仅幸存者阶段可使用');
                if (!action.toRoomId)
                    throw new Error('请选择秘密通道出口');
                const extra = (p.items.flashlight ?? 0) > 0;
                if (!extra) {
                    assertActive(state, playerId);
                    assertSurvivorMainAction(p);
                    p.mainActionUsed = true;
                    p.moveLeft = 0;
                }
                else {
                    /**
                     * 手持手电筒：这个技能变成**额外行动**。
                     * 同样受「停滞过就不能再做额外行动」限制。
                     */
                    if (!controlsPiece(state, socketId, p)) {
                        throw new Error('无权操作该幸存者');
                    }
                    if (p.haltedThisRound) {
                        throw new Error('本大回合已经执行过停滞，不能再做额外行动');
                    }
                    p.extraActionUsedThisTurn = true;
                }
                trySecretPassage(state, playerId, action.toRoomId);
                p.skillUsedThisTurn.add(skill.id);
                log(state, extra
                    ? `${p.name} 持手电筒发动「观察入微」（额外行动）。`
                    : `${p.name} 发动「观察入微」。`);
                if (!extra)
                    advanceAfterSurvivor(state, p.id);
                break;
            }
            if (skill.id === 'resourceful') {
                if (p.faction !== 'survivor' || !p.alive)
                    throw new Error('只有幸存者可使用');
                if (state.phase !== 'survivorMain')
                    throw new Error('仅幸存者阶段可使用');
                const itemId = action.itemId;
                if (itemId !== 'adrenaline' && itemId !== 'sedative')
                    throw new Error('请选择肾上腺素或镇静剂');
                if (!survivorDiscardHasItem(state, itemId))
                    throw new Error('弃牌堆里没有这张牌');
                assertActive(state, playerId);
                assertSurvivorMainAction(p);
                if (!takeEarliestFromSurvivorDiscard(state, itemId))
                    throw new Error('弃牌堆里没有这张牌');
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
                if (p.faction !== 'survivor' || !p.alive)
                    throw new Error('只有幸存者可使用');
                if (state.phase !== 'survivorMain')
                    throw new Error('仅幸存者阶段可使用');
                if (!action.toRoomId)
                    throw new Error('请选择短跑目的地');
                assertActive(state, playerId);
                assertSurvivorMainAction(p);
                /**
                 * **一步一步选路径**：客户端把玩家点出来的完整路径（含起点）放在 `path` 里。
                 * 短跑**必须刚好 3 步** —— 所以路径长度必须正好是 4（含起点）。
                 *
                 * ⚠ 传了 `path` 时**不要**再查 `legalMoveRooms(3,3)`：
                 * 那个是「BFS 距离刚好 3 步」，而玩家选的路线只要**总长 3 步**即可
                 * （绕路、折返都算）。逐段走完再按总步数校验才是对的。
                 */
                const rawSprint = action.path;
                if (rawSprint && rawSprint.length >= 2) {
                    if (rawSprint.length - 1 !== 3)
                        throw new Error('短跑必须刚好 3 步');
                    if (!p.roomId || rawSprint[0] !== p.roomId)
                        throw new Error('路径必须从你当前所在地点开始');
                    if (rawSprint[rawSprint.length - 1] !== action.toRoomId)
                        throw new Error('路径终点和目的地不一致');
                    /**
                     * **逐格走**：中途踩到捕网会被拦下（`walkSurvivorPath`）；
                     * 某步非法会把人退回起点，所以直接抛错即可。
                     */
                    const sres = walkSurvivorPath(state, playerId, p.roomId, [...rawSprint]);
                    if (!sres.ok)
                        throw new Error('路径不合法（必须从当前位置出发、每步相邻且不被封堵）');
                }
                else {
                    /** 没传 path（老客户端 / 内部调用）：退回「BFS 刚好 3 步」 */
                    const legal = legalMoveRooms(state, playerId, 3, 3);
                    if (legal.length === 0)
                        throw new Error('没有刚好 3 步可达的地点');
                    if (!legal.includes(action.toRoomId))
                        throw new Error('目的地必须刚好 3 步');
                    const ok = tryMove(state, playerId, action.toRoomId, 3, 3);
                    if (!ok)
                        throw new Error('短跑移动不合法');
                }
                if (p.roomId)
                    pushNoise(state, p.roomId);
                p.mainActionUsed = true;
                p.moveLeft = 0;
                p.skillUsedThisTurn.add(skill.id);
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
            }
            else if (p.faction === 'killer') {
                if (state.phase !== 'killerMain')
                    throw new Error('当前无法使用技能');
                if (hasPendingKillerChoice(state))
                    throw new Error('请先完成当前牌的选择');
                if (state.killerTurnStep !== 'main' || state.killerMainChoice !== 'actions') {
                    throw new Error('技能占用普通主要行动，请先选择 2 次行动');
                }
                if (state.killerMainActionsLeft <= 0)
                    throw new Error('没有剩余主要行动');
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
            if (p.faction === 'survivor') {
                advanceAfterSurvivor(state, p.id);
            }
            break;
        }
        case 'useItem': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用物品');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者阶段可使用物品');
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
            }
            else if (!controlsPiece(state, socketId, p)) {
                throw new Error('无权操作该幸存者');
            }
            else {
                /**
                 * 额外行动：等价于「大回合内的另一种行动」，不消耗一般行动。
                 * 但**做过停滞**的幸存者本大回合不能再做任何额外行动。
                 */
                if (p.haltedThisRound) {
                    throw new Error('本大回合已经执行过停滞，不能再做额外行动');
                }
                p.extraActionUsedThisTurn = true;
            }
            if ((p.items[action.itemId] ?? 0) < 1 && action.itemId !== 'sophia_camera') {
                throw new Error('你没有这件物品');
            }
            if (action.itemId === 'sophia_camera') {
                // 本人限定：换给别人也用不了
                const ownerBlock = personalItemBlockReason(state, playerId, 'sophia_camera');
                if (ownerBlock)
                    throw new Error(ownerBlock);
                if ((p.items.sophia_camera ?? 0) < 1)
                    throw new Error('你没有索菲亚的相机');
                if (p.skillUsedThisTurn.has('sophia_camera'))
                    throw new Error('本回合已使用过相机');
                if (!p.roomId)
                    throw new Error('不在地图上');
                takeItem(p, 'sophia_camera', 1);
                discardConsumedItem(state, 'sophia_camera', 1);
                p.skillUsedThisTurn.add('sophia_camera');
                /** 【变体1】特性 16：相机是**物品**（使用过程产生响声）→ 照响，16 压不住 */
                pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'item' });
                log(state, `${p.name} 使用索菲亚的相机（额外行动），在原地发出响声。`);
                break;
            }
            if (action.itemId === 'toolbox') {
                if (!p.roomId)
                    throw new Error('不在地图上');
                const room = state.map.rooms.find((r) => r.id === p.roomId);
                if (!room?.tags.includes('repairable'))
                    throw new Error('当前地点不能修理');
                if (state.repairedThisPhase)
                    throw new Error('本阶段已经有人修理过了');
                if (state.repairProgress >= state.rules.repairNeeded)
                    throw new Error('无线电已经修好');
                if (killerInRoom(state, p.roomId))
                    throw new Error('与杀手同地不能修理');
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
                log(state, `${p.name} 使用工具箱修理无线电 +${repairAdded}（${state.repairProgress}/${state.rules.repairNeeded}）。`, 'survivor');
                announceRepairIfJustFinished(state, repairBefore);
                maybeArmRescue(state);
                if (state.rules.repairMakesNoise && p.roomId)
                    pushNoise(state, p.roomId);
                advanceAfterSurvivor(state, p.id);
                break;
            }
            if (action.itemId === 'whiskey') {
                if (!action.toRoomId)
                    throw new Error('请选择相邻地点');
                if (!p.roomId)
                    throw new Error('不在地图上');
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
                if (!action.toRoomId)
                    throw new Error('请选择移动目的地');
                const legal = legalMoveRooms(state, playerId, 1, 1);
                if (legal.length === 0)
                    throw new Error('没有可进入的相邻地点');
                if (!legal.includes(action.toRoomId))
                    throw new Error('肾上腺素只能移动 1 步');
                takeItem(p, 'adrenaline', 1);
                discardConsumedItem(state, 'adrenaline', 1);
                const ok = tryMove(state, playerId, action.toRoomId, 1, 1);
                if (!ok)
                    throw new Error('移动不合法');
                log(state, `${p.name} 使用肾上腺素移动。`, 'survivor');
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
                /**
                 * 爆竹：清掉场上已有的响声标记；本回合判断上「全场都有响声」，
                 * 所以之后不再记录具体响声位置。杀手回合开始时在**杀手所在位置**
                 * 放一个爆竹响声标记（双方地图都有，图标和一般响声不同）。
                 */
                state.noises = [];
                log(state, '点燃爆竹：清空场上响声标记。本回合全场都有响声，杀手回合开始时会在杀手所在位置放一个爆竹响声标记。', 'survivor');
                break;
            }
            if (action.itemId === 'axe' && action.toRoomId === undefined && !action.targetPlayerId) {
                if (!p.roomId)
                    throw new Error('不在地图上');
                /**
                 * ⚠ **拆哪一块由玩家自己选**（同 `removeBlockade`：用户口径
                 * 「幸存者移除封堵应该是他自己选择移除，不是自动」）。
                 * 校验放在**消耗手斧之前** —— 选错了不该白扔一把手斧。
                 */
                const removable = blockedDoorsAt(state, p.roomId);
                if (!removable.length) {
                    throw new Error('当前地点没有可拆的封堵');
                }
                const door = action.doorId ? canonicalDoorId(action.doorId) : null;
                if (door && !removable.includes(door))
                    throw new Error('这块封堵不在你所在地点');
                if (!door && removable.length > 1)
                    throw new Error('这个地点有多块封堵，请选择要拆除哪一块');
                takeItem(p, 'axe', 1);
                discardConsumedItem(state, 'axe', 1);
                removeBlockade(state, door ?? p.roomId, p.id);
                log(state, `${p.name} 用手斧拆除了封堵。`, 'survivor');
                break;
            }
            if (action.itemId === 'flashlight') {
                if (!action.toRoomId)
                    throw new Error('请选择秘密通道出口');
                assertSurvivorMainAction(p);
                trySecretPassage(state, playerId, action.toRoomId);
                p.mainActionUsed = true;
                p.moveLeft = 0;
                log(state, `${p.name} 使用手电筒穿过秘密通道。`);
                advanceAfterSurvivor(state, p.id);
                break;
            }
            // 煤油灯：额外行动穿过秘密通道（**一次性**，用掉就进弃牌堆）
            if (action.itemId === 'lamp') {
                if (!action.toRoomId)
                    throw new Error('请选择秘密通道出口');
                trySecretPassage(state, playerId, action.toRoomId);
                takeItem(p, 'lamp', 1);
                discardConsumedItem(state, 'lamp', 1);
                log(state, `${p.name} 使用煤油灯穿过秘密通道（煤油灯已用掉）。`);
                break;
            }
            // 神秘包裹：额外行动，从发现牌堆抽一张，并在自己所在格发出响声
            if (action.itemId === 'parcel') {
                if (!p.roomId)
                    throw new Error('不在地图上');
                const cardId = drawDiscoveryCard(state);
                takeItem(p, 'parcel', 1);
                discardConsumedItem(state, 'parcel', 1);
                if (cardId) {
                    keepSuitcaseDiscovery(state, p.id, cardId);
                }
                else {
                    log(state, '发现牌堆已空，神秘包裹没有抽到牌。');
                }
                pushNoise(state, p.roomId);
                break;
            }
            if (action.itemId === 'trap') {
                assertSurvivorMainAction(p);
                if (!p.roomId)
                    throw new Error('不在地图上');
                takeItem(p, 'trap', 1);
                discardConsumedItem(state, 'trap', 1);
                if (!state.trapRoomIds)
                    state.trapRoomIds = [];
                if (!state.trapRoomIds.includes(p.roomId))
                    state.trapRoomIds.push(p.roomId);
                /**
                 * 【陷阱零件】是发现牌堆的牌：使用后在**使用位置**留下一个陷阱零件标记。
                 * 这个标记只有幸存者看得到（杀手看不到）—— 所以单独存一份，
                 * 渲染时用 Image/UI/陷阱.png 画在**圆心下方**。
                 *
                 * ⚠ 战报也必须**永远**不对杀手开放（`survivorSecret`）：
                 * 用普通的 `'survivor'` 只挡得住幸存者大回合期间，
                 * 回合结束后这条会随战报历史公开，杀手就知道哪里被布了陷阱。
                 */
                if (!state.trapPartRooms)
                    state.trapPartRooms = [];
                if (!state.trapPartRooms.includes(p.roomId))
                    state.trapPartRooms.push(p.roomId);
                p.mainActionUsed = true;
                p.moveLeft = 0;
                log(state, `${p.name} 在「${roomName(state, p.roomId)}」放置了陷阱。`, 'survivorSecret');
                advanceAfterSurvivor(state, p.id);
                break;
            }
            const heal = healItemDef(action.itemId);
            if (!heal)
                throw new Error('该物品不能这样使用');
            // 医药包只能马尔科本人用（换给别人也用不了）
            const healOwnerBlock = personalItemBlockReason(state, playerId, action.itemId);
            if (healOwnerBlock)
                throw new Error(healOwnerBlock);
            const targetId = action.targetPlayerId ?? playerId;
            /**
             * `heal.clearFear`（目前只有马尔科的医药包）→ **健康但有恐惧的人也是合法目标**。
             * 草药没有这条，所以拿草药去治一个满血只有恐惧的人依然会被拒。
             */
            assertHealSameRoom(state, playerId, targetId, heal.clearFear === true);
            const target = state.players[targetId];
            /** 受伤的**或已中毒的**都能治（女王规则：健康但中毒也能治）；医药包还能治「只有恐惧」的 */
            if (healableAlliesHere(state, playerId, heal.clearFear === true).length === 0)
                throw new Error(
                    heal.clearFear
                        ? '同一地点没有受伤、中毒或有恐惧的幸存者，无法使用治疗'
                        : '同一地点没有受伤或中毒的幸存者，无法使用治疗',
                );
            assertSurvivorMainAction(p);
            if (heal.consume) {
                takeItem(p, action.itemId, 1);
                discardConsumedItem(state, action.itemId, 1);
            }
            applyHeal(state, targetId, heal.amount, heal.clearFear === true);
            /**
             * 女王〔中毒〕：**受到治疗的幸存者会移除中毒标记**。
             * 即使他本来满血（治疗量没起作用）也照样移除。
             */
            clearPoisonOnHeal(state, targetId);
            if (heal.clearFear) {
                target.fear = 0;
                target.overFear = false;
            }
            /**
             * 【变体1】特性 16「高度警觉」：**用物品治疗**（草药）属于"物品使用过程"，
             * 所以这声响**照常发出**，16 压不住它。
             *
             * 【变体1】特性 03「草药知识」：使用草药（治疗自己或其他幸存者）时**不会发出响声** ——
             * 无条件生效（和 16 那个"距离杀手 1 以内"无关），所以这里直接不响。
             */
            const herbKnowledge = state.variant1 && hasTrait(state, p.id, 'trait_s03');
            if (heal.noiseAtUser && p.roomId) {
                if (herbKnowledge) {
                    log(state, `【变体1】${p.name}「草药知识」：使用草药不会发出响声。`, 'survivor');
                }
                else {
                    pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'item' });
                }
            }
            p.mainActionUsed = true;
            p.moveLeft = 0;
            log(state, heal.clearFear
                ? `${p.name} 使用「${itemName(action.itemId)}」治疗了 ${target.name}，并消除其恐惧。`
                : `${p.name} 使用「${itemName(action.itemId)}」治疗了 ${target.name}。`);
            advanceAfterSurvivor(state, p.id);
            break;
        }
        case 'useSuitcase': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可打开手提箱');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可打开手提箱');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            /**
             * ⚠ **翻找手提箱 = 额外行动，不是"发现"**（用户口径）。
             *
             * 所以和「开宝箱」同一套：**不查** `assertActive` / `mainActionUsed`
             * （额外行动不受小回合限制），但**停滞过就不能用**，
             * 用了记 `extraActionUsedThisTurn`（「停滞雕像」那一步要看）。
             *
             * 另外它**不再写 `lastDiscoveryCardId`**（见 `keepSuitcaseDiscovery`）——
             * 那个字段是"本大回合翻到的发现牌"，会把箱子/包裹里的牌
             * 冒充成发现阶段翻的那张。
             */
            if (p.haltedThisRound)
                throw new Error('本大回合已经执行过停滞，不能再做额外行动');
            const room = suitcaseRoomId(state);
            if (!room)
                throw new Error('当前地图没有手提箱');
            if (p.roomId !== room)
                throw new Error(`只有位于「${roomName(state, room)}」的幸存者可以打开手提箱`);
            if (!state.suitcaseAvailable)
                throw new Error('手提箱本幸存者大回合已经打开过了');
            const cardId = state.discoveryDeck.shift();
            if (!cardId)
                throw new Error('发现牌堆已空');
            state.suitcaseAvailable = false;
            p.extraActionUsedThisTurn = true;
            keepSuitcaseDiscovery(state, p.id, cardId);
            break;
        }
        /**
         * 扼杀者规则：幸存者大回合可以执行一次**特殊行动** ——
         * 移除其当前地点的一个核心标记。
         */
        case 'removeCoreMarker': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可移除核心标记');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可移除核心标记');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            if (!isStranglerKiller(state))
                throw new Error('当前杀手不是扼杀者，场上没有核心标记');
            if (!p.roomId || !(state.coreMarkers ?? []).includes(p.roomId))
                throw new Error('你所在地点没有核心标记');
            if (p.coreRemovedThisRound)
                throw new Error('本幸存者大回合已经移除过一次核心标记');
            /**
             * 这是**一般行动第 4 项「使用一个特殊行动」**（扩展书原文也是「特殊行动」），
             * 所以按一般行动处理：消耗本人的一般行动并结束小回合。
             */
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            if (!removeCoreAt(state, p.roomId))
                throw new Error('移除失败');
            p.coreRemovedThisRound = true;
            p.mainActionUsed = true;
            p.moveLeft = 0;
            /**
             * ⚠ **只写幸存者版**（带名字）。
             *
             * 杀手那边要的"哪里的核心标记被移除"已经由 `removeCoreAt`
             * （`killerSpecials.ts`）写了 —— 那条**不带名字**、本来就符合口径。
             * 这里再写一条杀手版就重复播报了。
             */
            log(
                state,
                `${p.name} 移除「${roomName(state, p.roomId)}」的一个核心标记（现有 ${(state.coreMarkers ?? []).length} 个）。`,
                'survivor',
            );
            advanceAfterSurvivor(state, p.id);
            break;
        }
        /**
         * 【实验室 G3 急救室】特殊行动：对**同地点**的一名幸存者【治疗】并移除其全部恐惧，
         * 然后移除急救箱标记（一次性）。占一般行动。
         */
        case 'useFirstAidKit': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可以使用急救箱');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用急救箱');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            if (!canUseFirstAidKitAt(state, p)) {
                throw new Error(state.firstAidKit
                    ? `只有位于「${roomName(state, firstAidKitRoomId(state))}」的幸存者可以使用急救箱`
                    : '急救箱已经被用掉了');
            }
            const target = state.players[action.targetPlayerId ?? p.id];
            if (!target?.alive || target.faction !== 'survivor')
                throw new Error('治疗目标无效');
            if (target.roomId !== p.roomId)
                throw new Error('急救箱只能治疗与你同一地点的幸存者');
            /** 这是一般行动（特殊行动），要占掉本人的行动 */
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            useFirstAidKit(state, p, target);
            p.mainActionUsed = true;
            p.moveLeft = 0;
            advanceAfterSurvivor(state, p.id);
            break;
        }
        /**
         * 【城堡 R1 監視室】额外行动：把机关大门放到任意一扇门上。
         * 场上至多一个（覆盖旧的）；放在有封堵的门上会自动拆除那个封堵。
         */
        case 'placeLeverGate': {
            /**
             * ⚠ **按 `actorPlayerId` 认人**（和宝箱 / 抽取遗物同一套写法）：
             * 额外行动弹窗按每个幸存者列按钮，共享控制模式下
             * 点谁的名字就该谁操作控制杆。
             */
            const gateActor = state.players[action.actorPlayerId ?? playerId];
            if (!gateActor || gateActor.faction !== 'survivor' || !gateActor.alive)
                throw new Error('只有存活幸存者可以放置机关大门');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可放置机关大门');
            if (!controlsPiece(state, socketId, gateActor))
                throw new Error('无权操作该幸存者');
            if (state.map.id !== 'castle')
                throw new Error('这张地图没有控制杆');
            if (gateActor.roomId !== LEVER_ROOM)
                throw new Error(`只有位于「${roomName(state, LEVER_ROOM)}」的幸存者可以操作控制杆`);
            /** 额外行动：做过停滞的本大回合不能再做 */
            if (gateActor.haltedThisRound)
                throw new Error('本大回合已经执行过停滞，不能再做额外行动');
            /**
             * ⚠ **这里不查 `assertActive`、也**不查 `mainActionUsed`**：
             * 额外行动不占一般行动、做完小回合也能做 ——
             * 「走到控制杆这里」本身就是他的一般行动，一加门槛这个额外行动就永远用不了。
             */
            const from = action.fromRoomId;
            const to = action.toRoomId;
            if (!from || !to)
                throw new Error('请选择一扇门');
            /** 必须是两个相邻地点之间的**门**（虚线/秘密通道不行） */
            const edge = state.map.edges.find(
                (e) => (e.from === from && e.to === to) ||
                    ((e.bidirectional ?? true) && e.from === to && e.to === from),
            );
            if (!edge || (edge.pathType ?? 'door') !== 'door')
                throw new Error('机关大门只能放在门上（虚线通道不行）');
            placeLeverGate(state, from, to, gateActor.id);
            gateActor.extraActionUsedThisTurn = true;
            break;
        }
        /**
         * 【城堡】杀手弃 3 张手牌通过机关大门（并拆除它）。
         * 由"移动被大门挡住"时挂起，这里付完费继续那次移动。
         */
        case 'confirmGatePay': {
            const pay = state.pendingGatePay;
            if (!pay)
                throw new Error('当前没有要过机关大门');
            if (p.faction !== 'killer')
                throw new Error('只有杀手需要为机关大门付费');
            const picked = [...new Set(action.cardIds ?? [])];
            if (picked.length !== LEVER_GATE_COST)
                throw new Error(`过机关大门要弃 ${LEVER_GATE_COST} 张手牌`);
            for (const id of picked) {
                if (!state.killerHand.includes(id))
                    throw new Error('要弃的牌不在手里');
            }
            for (const id of picked) {
                const i = state.killerHand.indexOf(id);
                state.killerHand.splice(i, 1);
                state.killerDiscard.push(id);
            }
            /** 拆掉大门（操作者标记跟着一起清） */
            state.leverGateDoorId = null;
            state.leverGateOwnerId = null;
            /**
             * ⚠ **不写"是谁放的那道"**（用户口径：「杀手不知道谁放的门」）——
             * 这条 `'all'` 的战报双方都看得到，带上名字就把操作者泄给杀手了。
             */
            log(
                state,
                `杀手弃置 ${LEVER_GATE_COST} 张手牌，机关大门被拆除。`,
                'all',
                true,
            );
            state.pendingGatePay = null;
            const toRoomId = pay.toRoomId;
            const range = state.rules.killerMoveRange + p.moveBonus;
            const ok = tryMove(state, p.id, toRoomId, range);
            if (!ok)
                throw new Error('非法移动');
            state.killerMainActionsLeft -= 1;
            p.actionsLeft = state.killerMainActionsLeft;
            p.moveLeft = state.rules.killerMoveRange + p.moveBonus;
            maybeFinishKillerMain(state);
            break;
        }
        /** 放弃过门（退回，不移动、不付费） */
        case 'cancelGatePay': {
            if (!state.pendingGatePay)
                throw new Error('当前没有要过机关大门');
            state.pendingGatePay = null;
            log(state, '杀手放弃通过机关大门。');
            break;
        }
        /**
         * 【雕像・召唤石碑】点一个地点来选那扇要封的门（**两段式**）。
         *
         * 规则：「特殊（费用 1）：在任意一扇门〔封堵〕×1。
         * 〔惊吓〕所有位于带有该封堵标记地点的幸存者。」
         *
         * 第一下记住起点、第二下决定门；点同一格取消。
         * 封堵成功后**立刻结算惊吓**（两个端点的幸存者都算，因为封堵标记在门上、
         * 规则说的是"带有该封堵标记的地点"= 这扇门两端的两个地点）。
         */
        case 'pickSummonSealRoom': {
            if (!state.pendingStatueSeal)
                throw new Error('当前不是「召唤石碑」选门');
            if (p.faction !== 'killer')
                throw new Error('只有杀手可以选门');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作');
            const room = action.roomId;
            if (!state.map.rooms.some((r) => r.id === room))
                throw new Error('地点不存在');
            const from = state.pendingStatueSealFrom ?? null;
            /** 没有起点：记下它 */
            if (!from) {
                state.pendingStatueSealFrom = room;
                log(state, `召唤石碑：已选「${roomName(state, room)}」，请再点一个与它以门相连的地点。`, 'killer');
                break;
            }
            /** 再点同一个地点 = 取消 */
            if (from === room) {
                state.pendingStatueSealFrom = null;
                log(state, '召唤石碑：已取消地点选择。', 'killer');
                break;
            }
            const id = doorId(from, room);
            const edge = state.map.edges.find(
                (e) => isDoorEdge(e.pathType) &&
                    ((e.from === from && e.to === room) || (e.to === from && e.from === room)),
            );
            if (!edge)
                throw new Error('这两个地点之间没有可封的门');
            if (isDoorBlocked(state, id))
                throw new Error('这扇门已经封上了');
            if (state.blockades.length >= state.rules.blockadeTokenMax)
                throw new Error(`封堵标记已经用完（上限 ${state.rules.blockadeTokenMax}）`);
            /** 封上 */
            state.blockades.push(canonicalDoorId(id));
            log(
                state,
                `召唤石碑：「${roomName(state, from)}」–「${roomName(state, room)}」的门被封堵。`,
                'all',
                true,
            );
            /** 〔惊吓〕带有该封堵标记的地点 = 这扇门两端的两个地点 */
            let feared = 0;
            for (const rid of [from, room]) {
                for (const s of survivorsInRoom(state, rid)) {
                    addFear(state, s.id, 1);
                    feared += 1;
                }
            }
            log(
                state,
                feared > 0 ? `召唤石碑：${feared} 名幸存者受到惊吓。` : '召唤石碑：这两个地点都没有幸存者。',
                'all',
                true,
            );
            state.pendingStatueSeal = false;
            state.pendingStatueSealFrom = null;
            maybeFinishKillerMain(state);
            break;
        }
        /**
         * 【未命名・恐詭管道】点一个有秘密通道的地点作为潜行落点。
         *
         * ⚠ 以前 `resolveStealthToPassage` **没有任何调用点**（死代码），
         * 所以玩家点了地点也没反应 —— 用户报的"无法选择秘密通道口处"。
         */
        case 'pickPassageRoom': {
            if (!(state.pendingPassagePick ?? []).length)
                throw new Error('当前不是选择秘密通道地点');
            if (p.faction !== 'killer')
                throw new Error('只有杀手可以选择');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作');
            resolveStealthToPassage(state, action.roomId);
            /**
             * ⚠ **点地图只是"选中"，不继续队列**（用户口径：选了地点要确认）。
             * 效果队列由 `confirmPassagePick`（点「确认潜入」）继续。
             */
            break;
        }
        case 'confirmPassagePick': {
            if (!(state.pendingPassagePick ?? []).length)
                throw new Error('当前不是选择秘密通道地点');
            if (p.faction !== 'killer')
                throw new Error('只有杀手可以确认');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作');
            confirmStealthToPassage(state);
            /**
             * 确认落点之后，效果队列继续（恐詭管道是 slow 阶段的一张牌）。
             *
             * ⚠ 走 `resumeAfterKillerChoice` 而不是裸的 `continueKillerQueue`：
             * 前者才会把打出的牌落定、把 `pendingCardSpeed` 清掉 ——
             * 否则这张牌一直卡在"正在结算"上（和【變形】那个漏法是同一个）。
             */
            resumeAfterKillerChoice(state);
            break;
        }
        /**
         * 【未命名・變形 / 戰鬥適應】从弃牌堆里**自己选**一张永久移除的牌。
         *
         * ⚠ 以前是**自动从弃牌堆顶拿**（`removeFromDiscardPermanent` 直接 splices），
         * 玩家没得选 —— 用户报的"没有自己选择删掉的牌"。
         */
        case 'pickDiscardRemove': {
            const job = state.pendingDiscardRemove;
            if (!job)
                throw new Error('当前不是选择要移除的牌');
            if (p.faction !== 'killer')
                throw new Error('只有杀手可以选择');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作');
            const idx = state.killerDiscard.indexOf(action.cardId);
            if (idx < 0)
                throw new Error('那张牌不在弃牌堆里');
            /**
             * ⚠ **按"份数"判，不能按 id 判**（用户口径：「只排除当前这张」）。
             *
             * `job.options` 就是"还能选的每一份"，每选一次下面会 `splice` 掉一份；
             * 所以同名多份时，只有**份数用光**才算选不了 ——
             * 以前 `excludeCardIds.includes(id)` 会把同名另一份也一起禁掉。
             */
            const left = (job.options ?? []).filter((x) => x === action.cardId).length;
            if (left <= 0) {
                throw new Error(job.excludeCardIds.includes(action.cardId)
                    ? '不能移除刚打出的这张牌'
                    : '这张牌的份数已经选够了');
            }
            state.killerDiscard.splice(idx, 1);
            if (!state.killerRemovedPermanently) state.killerRemovedPermanently = [];
            state.killerRemovedPermanently.push(action.cardId);
            log(
                state,
                `${job.cardName}：把「${state.cardById[action.cardId]?.name ?? action.cardId}」永久移出弃牌堆。`,
                'killer',
            );
            job.remaining -= 1;
            /**
             * ⚠ **只去掉一份**：牌组里同一张卡有多份（爬行×3），
             * 以前是按 id `filter` 掉**所有同名份数** —— 于是「變形」要选 2 张、
             * 弃牌堆里正好有两张「爬行」时，选掉一张后另一张就从候选里消失了
             * （玩家会看到"明明还有牌却不让我选"）。
             */
            const oi = job.options.indexOf(action.cardId);
            if (oi >= 0)
                job.options.splice(oi, 1);
            const ni = job.optionsNamed.findIndex((c) => c.id === action.cardId);
            if (ni >= 0)
                job.optionsNamed.splice(ni, 1);
            if (job.remaining > 0) {
                if (!job.options.length) {
                    log(state, `${job.cardName}：弃牌堆里没有别的牌可移除了。`, 'killer');
                    state.pendingDiscardRemove = null;
                    finishDiscardRemove(state);
                } else {
                    log(state, `${job.cardName}：还要再选 ${job.remaining} 张。`, 'killer');
                }
            } else {
                state.pendingDiscardRemove = null;
                finishDiscardRemove(state);
            }
            break;
        }
        /**
         * 【墓穴】坍塌后：屋里的人**轮流走一步**离开。
         *
         * 排队面板一次只出一个人，谁轮到就由谁的操控者点目的地。
         * 幸存者**必须离开**；杀手除了走一步还要**强制弃光手牌**
         * （弃牌张数公开、内容不公开，移动对幸存者不可见 —— 都在 `resolveCollapseMove` 里）。
         */
        case 'collapseMove': {
            const pend = state.pendingCollapseMoves;
            if (!pend?.currentId)
                throw new Error('当前没有需要离开坍塌地点的人');
            const mover = state.players[pend.currentId];
            if (!mover)
                throw new Error('找不到这个人');
            if (!controlsPiece(state, socketId, mover))
                throw new Error('现在不是他选择移动');
            resolveCollapseMove(state, mover.id, action.toRoomId ?? null);
            break;
        }
        /** 【墓穴 R6 遺物室】额外行动：抽 1 张遗物，抽完标记翻面 */
        case 'drawRelic': {
            /**
             * ⚠ **按 `actorPlayerId` 认人**（和宝箱 `openChest` 同一套写法）。
             * 额外行动弹窗是**按每个幸存者**列按钮的，共享控制模式下
             * 点谁的名字就该谁抽 —— 不带它就会记到"当前行动者"头上，
             * 然后因为那人不在遗物室而报「只有位于 R6 的幸存者可以抽取遗物」。
             */
            const relicActor = state.players[action.actorPlayerId ?? playerId];
            if (!relicActor || relicActor.faction !== 'survivor' || !relicActor.alive)
                throw new Error('只有存活幸存者可以抽取遗物');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可抽取遗物');
            if (!controlsPiece(state, socketId, relicActor))
                throw new Error('无权操作该幸存者');
            if (!hasRelicRoom(state) || relicActor.roomId !== RELIC_ROOM)
                throw new Error(`只有位于「${roomName(state, RELIC_ROOM)}」的幸存者可以抽取遗物`);
            if (!canDrawRelic(state, relicActor)) {
                throw new Error(state.relicMarkerFaceUp
                    ? '遗物牌堆已经空了'
                    : '遗物标记已经翻面，要等下一个幸存者大回合');
            }
            /** 额外行动：做过停滞的本大回合不能再做 */
            if (relicActor.haltedThisRound)
                throw new Error('本大回合已经执行过停滞，不能再做额外行动');
            /**
             * ⚠ **这里不查 `assertActive`**（以前查了，是个 bug）：
             * 额外行动**不受小回合限制** —— 「谁都能在自己小回合做完之后再做」。
             * 加了它就会出现「最后一个走完的幸存者站在遗物室里，抽不了遗物」。
             *
             * 抽遗物的门槛只有三条，`canDrawRelic` 已经全部查过：
             *  ①在遗物室（且这张图有遗物室）②遗物标记正面朝上 ③牌堆还有牌。
             * 和狼人宝箱（`openChest`）完全同一套口径。
             */
            const cardId = drawRelic(state, relicActor);
            relicActor.extraActionUsedThisTurn = true;
            resolveRelicCard(state, relicActor, cardId);
            break;
        }
        /**
         * 【墓穴遗物】**鏡之門戶**：额外行动，传送到地图上的 🌀 螺旋地点。
         *
         * 是**传送**不是移动：不看门/封堵、不踩陷阱、不改"上次移动路径"。
         * 用完卡进遗物弃牌堆。
         */
        case 'useMirrorPortal': {
            /**
             * ⚠ **按 `actorPlayerId` 认人**（和 `drawRelic` / `openChest` 同一套写法）：
             * 额外行动弹窗是**按每个幸存者**列按钮的，共享控制 / 单人热座下
             * 点谁的名字就该谁传送 —— 不带它就会被算到"当前行动者"头上，
             * 于是"做完小回合的另一个人想传送"会报「这名幸存者没有「鏡之門戶」」。
             */
            const mir = state.players[action.actorPlayerId ?? playerId];
            if (!mir || mir.faction !== 'survivor' || !mir.alive)
                throw new Error('只有存活幸存者可以使用鏡之門戶');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用鏡之門戶');
            if (!controlsPiece(state, socketId, mir))
                throw new Error('无权操作该幸存者');
            if (!hasRelic(mir, 'mirror'))
                throw new Error('这名幸存者没有「鏡之門戶」');
            /**
             * ⚠ **只拦"停滞"**（停滞过的幸存者本大回合不能再做额外行动）。
             * 用户明确"所有的额外行动都是满足条件就能无限用的"，
             * 所以**不再**用 `extraActionUsedThisTurn` 拦第二次使用 ——
             * 那张遗物本来就是一次性的，能不能再用取决于还有没有第二张。
             */
            if (mir.haltedThisRound)
                throw new Error('本大回合已经执行过停滞，不能再做额外行动');
            if (!action.toRoomId)
                throw new Error('请选一个螺旋地点');
            /**
             * ⚠ 和「抽取遗物」一样，**不查 `assertActive`** ——
             * 额外行动不受小回合限制，做完了小回合照样能用。
             * 能不能再用的唯一上限是「还有没有第二张鏡之門戶」（那张牌本身是一次性的）。
             */
            useMirror(state, mir, action.toRoomId);
            break;
        }
        /**
         * 【墓穴遗物】**洞察之球**：**特殊行动** —— 在可搜索的地点**依次摸两张牌**。
         *
         * 两张**各自完整结算**（各自判响声、各自可能出钥匙上架并可能直接获胜）。
         * 占一次一般行动（特殊行动属于第 4 项一般行动），但**不占"本回合搜索过"**——
         * 它本身不是"搜索物资"那个按钮。
         */
        case 'useInsightOrb': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可以使用洞察之球');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用洞察之球');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            if (!hasRelic(p, 'insight'))
                throw new Error('这名幸存者没有「洞察之球」');
            if (!canUseInsight(state, p))
                throw new Error('洞察之球要在可搜索的地点使用');
            if (p.haltedThisRound)
                throw new Error('本大回合已经执行过停滞，不能再做特殊行动');
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            log(
                state,
                `${p.name} 使用遗物「洞察之球」（特殊行动）：在「${roomName(state, p.roomId)}」搜索两次。`,
                survivorActionVis(state),
            );
            consumeInsight(state, p);
            p.mainActionUsed = true;
            p.moveLeft = 0;
            /**
             * ⚠ **特殊行动 = 搜索两次**（用户口径：「洞察之球的特殊行动是搜索两次！
             * 能触发欧菲莉亚的第六感」）—— 以前是"自己一次摸 2 张"，
             * 绕过了正常搜索流程，所以第六感、响声那些都不走。
             * 现在两次都走 `doSearch`：第六感会挂起"摸 2 选 1"，
             * 第二次搜索等那次选完再接着跑（见 `runInsightOrbSearch`）。
             */
            state.pendingInsightSearches = 2;
            runInsightOrbSearch(state, p.id);
            break;
        }
        /**
         * 扼杀者核心标记的落点动作（打「茂盛 / 枝條生長 / 傳送聚合」后点地图触发）。
         */
        case 'placeCoreMarker': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            /**
             * `pendingCorePick === 'place'` → 正在选「把新核心标记放哪」
             * `pendingCorePick === 'remove'` → 已达 5 个上限，正在选「移除哪一个」
             */
            if (state.pendingCorePick === 'remove') {
                resolveCoreOverflow(state, action.roomId);
                /**
                 * 扼杀者 4 级：一次要放 2 个地点。
                 * 第一个撞上 5 个上限时，第二个挂在 `pendingCoreOverflowPlaceAtAfter`；
                 * 这里在移除完成后补放 —— 如果又满了，就**再让玩家选一次移除**
                 * （把第二个重新挂回去），直到两个地点都放上。
                 */
                const after = state.pendingCoreOverflowPlaceAtAfter;
                if (after) {
                    state.pendingCoreOverflowPlaceAtAfter = null;
                    const stillOverflow = placeCoreAt(state, after);
                    if (stillOverflow) {
                        /** 又满了：第二个重新挂回去，让玩家再选一次移除 */
                        state.pendingCoreOverflowPlaceAtAfter = after;
                        break;
                    }
                }
                /**
                 * 两个地点都放上了 —— **显式清干净所有"选移除"的状态**。
                 * 不能只靠 `placeCoreAt` 的副作用（它满了会自己设 `pendingCorePick`，
                 * 刚好没满又不会帮我们清），否则客户端会一直停在
                 * 「请选要移除的核心标记」上，人就卡住了。
                 */
                state.pendingCorePick = null;
                state.pendingCoreRooms = [];
                state.pendingCoreOverflowPlaceAt = null;
                resumeAfterKillerChoice(state);
                /**
                 * ⚠ 这一路也可能是**进化 4 级的两个核心标记**（撞上 5 个上限、
                 * 玩家选完要移除哪一个之后补放）—— 那条同样要收尾，
                 * 否则 `phase` 停在 `upkeep`（同 `confirmEvoRooms` 的注释）。
                 */
                if (state.phase === 'upkeep')
                    maybeCloseKillerUpkeep(state);
                break;
            }
            if (state.pendingCorePick !== 'place')
                throw new Error('当前不是放置核心标记');
            if (!state.map.rooms.some((r) => r.id === action.roomId))
                throw new Error('地点不存在');
            state.pendingCorePick = null;
            /**
             * 未达上限 → 直接放好并继续；
             * 已达 5 个 → `placeCoreAt` 会进入「选移除哪个」，**先别继续**。
             */
            const needRemove = placeCoreAt(state, action.roomId);
            if (!needRemove)
                resumeAfterKillerChoice(state);
            break;
        }
        case 'blockadeAtCore': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.pendingCorePick !== 'placeBlockade')
                throw new Error('当前不是「在带核心标记的地点封堵」');
            const allowed = state.pendingCoreRooms ?? [];
            if (!allowed.includes(action.roomId))
                throw new Error('只能选带核心标记、且还有可封门的地点');
            state.pendingCorePick = null;
            state.pendingCoreRooms = [];
            /**
             * 封哪扇门**由玩家点**（规则要求）——
             * 所以这里只发起「点门」请求，不自动封。
             */
            const needDoor = requestBlockadeAt(state, action.roomId, '枝條生長');
            if (!needDoor)
                resumeAfterKillerChoice(state);
            break;
        }
        case 'sprayAcid': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (!state.pendingAcidPick)
                throw new Error('当前没有待选的酸液目标');
            /** 相邻地点由杀手自选；封堵能否成立由 `acidSpray` 自己判断 */
            state.pendingAcidPick = false;
            acidSpray(state, action.roomId);
            resumeAfterKillerChoice(state);
            break;
        }
        case 'teleportToCore': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const allowed = state.pendingTeleportPick;
            if (!allowed)
                throw new Error('当前没有待传送');
            if (!allowed.includes(action.roomId))
                throw new Error('只能传送到带核心标记或封堵标记的地点');
            const k2 = state.killerId ? state.players[state.killerId] : null;
            if (!k2)
                throw new Error('杀手不在场');
            state.pendingTeleportPick = null;
            /**
             * 规则：传送时把杀手放到目的地**并告知幸存者**（双方地图同步、战报写明）。
             * **不会触发遭遇** —— 遭遇只有「搜索之后」才会触发。
             */
            k2.roomId = action.roomId;
            log(state, `傳送聚合：杀手传送到「${roomName(state, action.roomId)}」（双方地图同步移动）。`, 'all', true);
            resumeAfterKillerChoice(state);
            break;
        }
        case 'moveCoreMarker': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (!state.pendingCorePick)
                throw new Error('当前不是移动核心标记');
            resolveMoveCore(state, action.roomId);
            /** 两步都走完（pendingCorePick 清空）才算这次选完 */
            if (!state.pendingCorePick)
                resumeAfterKillerChoice(state);
            break;
        }
        // ————————————————————————————————————————————————
        // 女王（killer9）
        // ————————————————————————————————————————————————
        /** 女王移动时选「带几个僵尸一起走」（`count` 个），或取消 */
        case 'confirmQueenMove': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const pm = state.pendingQueenMove;
            if (!pm)
                throw new Error('当前不是女王移动选僵尸');
            state.pendingQueenMove = null;
            if (action.cancel) {
                log(state, '女王移动：不带僵尸，取消同行。', 'killer');
            }
            else {
                const n = Math.max(0, Math.min(action.count ?? 0, pm.zombieIds.length));
                for (let i = 0; i < n; i++) {
                    const zid = pm.zombieIds[i];
                    if (zid)
                        moveZombie(state, zid, pm.toRoomId);
                }
                if (n > 0)
                    log(state, `女王移动：带 ${n} 个僵尸一起移到「${roomName(state, pm.toRoomId)}」。`, 'all', true);
            }
            /** 真的执行女王的移动（同行僵尸已在上面移好） */
            {
                const q = state.killerId ? state.players[state.killerId] : null;
                if (q) {
                    const range = state.rules.killerMoveRange + q.moveBonus;
                    const ok = tryMove(state, q.id, pm.toRoomId, range);
                    if (!ok)
                        throw new Error('非法移动');
                    /**
                     * **一般阶段的移动要消耗普通行动次数**。
                     * 女王站在有僵尸的格子上移动时会走 `pendingQueenMove` 这条路，
                     * 而原路径里 `killerMainActionsLeft -= 1` 在 `break` 之后 ——
                     * 也就是**根本没执行**，于是女王能无限移动。这里补上。
                     */
                    state.killerMainActionsLeft -= 1;
                    q.actionsLeft = state.killerMainActionsLeft;
                    q.moveLeft = state.rules.killerMoveRange + q.moveBonus;
                    maybeFinishKillerMain(state);
                }
            }
            break;
        }
        /** 抓住他們！：选一个僵尸去〔搜索〕 */
        case 'pickZombieSearch': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const pool = state.pendingZombieSearch;
            if (!pool)
                throw new Error('当前没有待搜索的僵尸');
            if (!pool.includes(action.zombieId))
                throw new Error('这个僵尸不在候选里');
            const z = (state.zombies ?? []).find((x) => x.id === action.zombieId);
            state.pendingZombieSearch = null;
            if (!z) {
                log(state, '抓住他們！：僵尸已不在场。', 'killer');
                break;
            }
            /** 僵尸〔搜索〕：和杀手搜索同一套判定（同地有幸存者就开战） */
            searchAsZombie(state, z.roomId);
            break;
        }
        /** 屍群來了：先选出发地点，再选目的地 */
        case 'pickZombieHorde': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.pendingZombieHordeFrom) {
                if (!state.pendingZombieHordeFrom.includes(action.roomId))
                    throw new Error('这个地点没有僵尸');
                state.pendingZombieHordeFrom = null;
                state.pendingZombieHordeTo = { from: action.roomId };
                log(state, `屍群來了：已选出发地「${roomName(state, action.roomId)}」，请点一个目的地。`, 'killer');
                break;
            }
            if (state.pendingZombieHordeTo) {
                const from = (state.pendingZombieHordeTo as unknown as { from: string }).from;
                const steps = hordeStepRooms(state, from);
                if (!steps.includes(action.roomId))
                    throw new Error('屍群來了只能移动到距离 1 的地点');
                state.pendingZombieHordeTo = null;
                hordeMove(state, from, action.roomId, 1);
                resumeAfterKillerChoice(state);
                break;
            }
            throw new Error('当前不是屍群來了');
        }
        /** 屍體爆炸：选要献祭的僵尸 */
        case 'pickZombieSacrifice': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const pool = state.pendingZombieSacrifice;
            if (!pool)
                throw new Error('当前没有待献祭的僵尸');
            if (!pool.includes(action.zombieId))
                throw new Error('这个僵尸不在候选里');
            state.pendingZombieSacrifice = null;
            sacrificeZombieForPoison(state, action.zombieId, 1, (sid) =>
                poisonSurvivor(state, sid, (id, amount) =>
                    applyDamage(state, id, amount, state.killerId ?? id)));
            resumeAfterKillerChoice(state);
            break;
        }
        /**
         * 十字弩（幸存者特殊行动 —— 一般行动）：
         * 消灭你所在地点和相邻地点中的最多 2 个僵尸。
         */
        case 'useCrossbow': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用十字弩');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用十字弩');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            if ((p.items.crossbow ?? 0) < 1)
                throw new Error('你没有十字弩');
            if (!isQueenKiller(state))
                throw new Error('当前杀手不是女王，场上没有僵尸');
            /**
             * 十字弩是**无限使用**的（卡面左下角是 ∞）——
             * 所以这里**不设**「每回合一次」的限制。
             * 实际节奏由**一般行动次数**控制：每次使用都消耗一次【特殊行动】。
             */
            const targets = crossbowTargets(state, p.id);
            if (!targets.length) {
                log(state, `${p.name} 使用十字弩，但所在地点与相邻地点都没有僵尸。`, 'survivor');
                break;
            }
            /**
             * 一般行动第 4 项「特殊行动」：消耗一般行动。
             * 目标是「至多 2 个」，交客户端选，先进入待选。
             */
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            state.pendingCrossbow = {
                survivorId: p.id,
                zombieIds: targets.map((z) => z.id),
                max: Math.min(2, targets.length),
            };
            log(state, `${p.name} 使用十字弩：请点选最多 ${state.pendingCrossbow.max} 个要消灭的僵尸。`, 'survivor');
            break;
        }
        /** 十字弩：确认消灭选中的僵尸 */
        case 'confirmCrossbow': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用十字弩');
            const cb = state.pendingCrossbow;
            if (!cb || cb.survivorId !== p.id)
                throw new Error('当前没有待确认的十字弩');
            const picked = [...new Set(action.zombieIds ?? [])].slice(0, cb.max);
            for (const zid of picked) {
                if (!cb.zombieIds.includes(zid))
                    throw new Error('选的僵尸不在可消灭范围内');
            }
            const actor = state.players[p.id];
            /**
             * 先按僵尸所在地点归堆，再移除。
             * 战报只能说「哪里的僵尸被十字弩消灭了」，不能说弩是在哪个地点使用的。
             */
            const byRoom = new Map<string, number>();
            for (const zid of picked) {
                const z = (state.zombies ?? []).find((x) => x.id === zid);
                if (!z?.roomId) continue;
                byRoom.set(z.roomId, (byRoom.get(z.roomId) ?? 0) + 1);
            }
            state.pendingCrossbow = null;
            for (const zid of picked)
                removeZombie(state, zid, true);
            if (actor) {
                /** 十字弩无限使用、也不消耗 —— 只消耗这次一般行动 */
                actor.mainActionUsed = true;
                actor.moveLeft = 0;
            }
            const where = [...byRoom.entries()]
                .map(([room, n]) => `「${roomName(state, room)}」的 ${n} 个僵尸`)
                .join('、');
            if (where) {
                logSplit(
                    state,
                    `${p.name} 用十字弩消灭了${where}。`,
                    /** 杀手只知道哪些地点的僵尸没了，不知道弩在谁手里、在哪开的 */
                    [...byRoom.entries()]
                        .map(([room, n]) => `「${roomName(state, room)}」的 ${n} 个僵尸被十字弩消灭了。`)
                        .join(''),
                );
            }
            else {
                log(state, `${p.name} 收起十字弩，没有消灭僵尸。`, 'survivor');
            }
            if (actor)
                advanceAfterSurvivor(state, actor.id);
            break;
        }
        /** 十字弩：取消这次选择，不消耗一般行动 */
        case 'cancelCrossbow': {
            const cb = state.pendingCrossbow;
            if (!cb || cb.survivorId !== p.id)
                throw new Error('当前没有待确认的十字弩');
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用十字弩');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            state.pendingCrossbow = null;
            log(state, `${p.name} 取消使用十字弩，没有选择僵尸。`, 'survivor');
            break;
        }
        /**
         * 扼杀者**等级 4**：在任意 2 个**不同**地点各放置一个核心标记。
         * 点第一个地点 → 记下；点第二个不同地点 → 各放一个。
         * （已达 5 个上限时 `placeCoreAt` 会转成「选移除哪一个」的流程。）
         */
        case 'pickStranglerCoreRoom': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const picked = state.pendingStranglerCoreRooms;
            if (!picked)
                throw new Error('当前不需要选择放置核心标记的地点');
            if (!state.map.rooms.some((r) => r.id === action.roomId))
                throw new Error('地点不存在');
            /**
             * ⚠ 再点**已经选过**的地点 = 取消那一格
             * （用户口径「选择要确认」，点错了得能反悔）。
             */
            if (picked.includes(action.roomId)) {
                picked.splice(picked.indexOf(action.roomId), 1);
                log(state, `扼杀者 4 级：已取消「${roomName(state, action.roomId)}」（已选 ${picked.length}/2）。`, 'killer');
                break;
            }
            if (picked.length >= 2)
                throw new Error('已经选满 2 个地点，请点「确认放置核心标记」或取消其中一个');
            picked.push(action.roomId);
            if (picked.length < 2) {
                log(state, `扼杀者 4 级：已选「${roomName(state, action.roomId)}」，请再点一个不同地点。`, 'killer');
                break;
            }
            /** ⚠ 选满了**不立刻放** —— 等点「确认放置核心标记」 */
            log(state, `扼杀者 4 级：已选「${picked.map((r) => roomName(state, r)).join('」与「')}」，点「确认放置核心标记」后生效（再点同一格可取消）。`, 'killer');
            break;
        }
        /**
         * 【进化 4 级】**确认**已经在地图上选好的那 2 个地点。
         *
         * 用户口径：「**选择要确认**」—— 原来选满 2 个就直接生效，点错了没法反悔。
         * 一个动作管两种（同构）：女王生成丧尸 / 扼杀者放核心标记。
         */
        case 'confirmEvoRooms': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            /** ① 女王 4 级：生成丧尸 */
            const queenRooms = state.pendingQueenSpawnRooms;
            if (queenRooms) {
                if (queenRooms.length !== 2)
                    throw new Error('请先选满 2 个地点再确认');
                state.pendingQueenSpawnRooms = null;
                for (const rid of queenRooms)
                    spawnZombieAt(state, rid);
                /** 这一项选完了 → 问下一项，或做实际结算 */
                advanceEvolutionAfterChoice(state);
                if (state.phase === 'upkeep')
                    maybeCloseKillerUpkeep(state);
                break;
            }
            /** ② 扼杀者 4 级：放 2 个核心标记 */
            const coreRooms = state.pendingStranglerCoreRooms;
            if (coreRooms) {
                if (coreRooms.length !== 2)
                    throw new Error('请先选满 2 个地点再确认');
                state.pendingStranglerCoreRooms = null;
                /** 逐个放；第一个就触发「选移除」的话，剩下的等移除完再补（记在队列里） */
                const [cr1, cr2] = coreRooms;
                const overflow1 = cr1 ? placeCoreAt(state, cr1) : false;
                if (overflow1) {
                    /** 已进入"选移除"流程：把第二个地点挂起来，移除完再放 */
                    state.pendingCoreOverflowPlaceAtAfter = cr2 ?? null;
                    break;
                }
                if (cr2) {
                    const overflow2 = placeCoreAt(state, cr2);
                    if (overflow2) {
                        state.pendingCoreOverflowPlaceAtAfter = null;
                        break;
                    }
                }
                /**
                 * ⚠ **扼杀者这一路要自己把流程推完**（用户报的
                 * 「扼杀者 4 级选完后没有正常切回幸存者界面」）：
                 *
                 * 女王那一路的"选 2 个地点"是在 `ackEvolution` 的第 ④ 步挂出来的，
                 * 那时 `pendingEvolutionAck` **还挂着** → `advanceEvolutionAfterChoice`
                 * 会把后面的结算 / 回合收尾一路走完。
                 * 而扼杀者这两个标记是**结算过程中**挂出来的，回到这里时
                 * `pendingEvolutionAck` **已经是 null** → `advanceEvolutionAfterChoice`
                 * 直接返回，`phase` 就永远停在 `upkeep`：
                 * 界面不回幸存者，而且**幸存者那一轮根本开始不了**。
                 */
                advanceEvolutionAfterChoice(state);
                if (state.phase === 'upkeep')
                    maybeCloseKillerUpkeep(state);
                break;
            }
            throw new Error('当前没有待确认的地点选择');
        }
        /**
         * **雕像「巡邏 / 圍困」：杀手选下一尊要移动 / 搜索的雕像。**
         *
         * 用户要求：顺序由杀手自己选（移动段和搜索段各选各的），
         * 被停滞的、已经选过的**不出现在选项里**。
         * 选完这一尊后：移动类挂路径草稿、搜索类立刻结算；
         * 这一批选完了就接着走这张牌剩下的效果。
         */
        case 'pickStatueStep': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            /**
             * ⚠ **记下"这一尊雕像"** —— 用户口径：
             * 变体1 的特性 02「玩弄猎物」/ 11「恐惧迸发」认**当前遭遇中的那尊雕像**，
             * 其他特性（如 12 加力量）认**主雕像**。
             * 这里在开战前把它记下来，遭遇结束时清掉。
             */
            state.encounterTriggerPieceId = action.statueId;
            const encounterRoom = pickStatueStepAction(state, action.statueId);
            /**
             * 雕像搜索命中要**立刻**开战。
             * 5 级「攻击前伤害」挂在 `startEncounter` 上，
             * 次雕像搜到人和主杀手自己搜到人走同一条。
             */
            if (encounterRoom) {
                state.statueEncounterRoom = encounterRoom;
                maybeStartEncounter(state);
                if (state.encounter || state.phase === 'gameOver')
                    break;
            }
            /** 还在等下一次选择 / 正在走路径 → 就停在这儿 */
            if (state.pendingStatuePick || state.pendingStatueStepId)
                break;
            /** 这一段的雕像都选完了 → 继续这张牌剩下的效果 */
            continueKillerQueue(state);
            if (!hasPendingKillerChoice(state)) {
                flushDeferredPlayedCard(state);
                state.pendingCardSpeed = null;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            break;
        }
        /**
         * 女王**等级 4**：在任意 2 个**不同**地点各生成一个丧尸。
         * 点第一个地点 → 记下；点第二个不同地点 → 生成 2 个僵尸。
         * 满 6 个时生成会被取消（由 spawnZombieAt 处理）。
         */
        case 'pickQueenSpawnRoom': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const picked = state.pendingQueenSpawnRooms;
            if (!picked)
                throw new Error('当前不需要选择生成僵尸的地点');
            if (!state.map.rooms.some((r) => r.id === action.roomId))
                throw new Error('地点不存在');
            /**
             * ⚠ 再点**已经选过**的地点 = 取消那一格（同扼杀者那处）。
             */
            if (picked.includes(action.roomId)) {
                picked.splice(picked.indexOf(action.roomId), 1);
                log(state, `女王 4 级：已取消「${roomName(state, action.roomId)}」（已选 ${picked.length}/2）。`, 'killer');
                break;
            }
            if (picked.length >= 2)
                throw new Error('已经选满 2 个地点，请点「确认生成丧尸」或取消其中一个');
            picked.push(action.roomId);
            if (picked.length < 2) {
                log(state, `女王 4 级：已选「${roomName(state, action.roomId)}」，请再点一个不同地点。`, 'killer');
                break;
            }
            /** ⚠ 选满了**不立刻生成** —— 等点「确认生成丧尸」 */
            log(state, `女王 4 级：已选「${picked.map((r) => roomName(state, r)).join('」与「')}」，点「确认生成丧尸」后生效（再点同一格可取消）。`, 'killer');
            break;
        }
        /**
         * 欧菲莉亚「言语鼓励」（一般行动·特殊行动）：
         * 移除**任意**幸存者的所有恐惧，并在目标上放置一个**鼓励标记**。
         * 不限地点；每个幸存者至多一个鼓励标记。
         *
         * ⚠ **目标已经有鼓励标记时不再拒绝**（用户口径：
         * 「言语鼓励可以对任意幸存者做，**如果他已有鼓励标记就只清除其恐惧**」）——
         * 这时就只是"清恐惧"，不会再多一个标记（每人至多一个）。
         */
        case 'useEncourage': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用言语鼓励');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用言语鼓励');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            const ch = state.characters.find((c) => c.id === p.characterId);
            if (!ch?.skills.some((s) => s.id === 'encourage'))
                throw new Error('这名幸存者没有「言语鼓励」');
            const targetId = action.targetPlayerId ?? p.id;
            const target = state.players[targetId];
            if (!target || target.faction !== 'survivor' || !target.alive)
                throw new Error('请指定一名存活幸存者');
            /** 已经有标记了 → 这次只清恐惧 */
            const alreadyHadToken = target.encourageToken;
            /**
             * 「特殊行动」= 一般行动第 4 项，会消耗行动并结束小回合。
             */
            assertActive(state, playerId);
            assertSurvivorMainAction(p);
            target.fear = 0;
            target.overFear = false;
            /** 每人至多一个：已经有就不再加 */
            if (!alreadyHadToken)
                target.encourageToken = true;
            p.mainActionUsed = true;
            p.moveLeft = 0;
            log(
                state,
                alreadyHadToken
                    ? `${p.name} 发动「言语鼓励」：移除 ${target.name} 的所有恐惧（他已经有鼓励标记了，不再多放一个）。`
                    : `${p.name} 发动「言语鼓励」：移除 ${target.name} 的所有恐惧，并在其身上放置一个鼓励标记。`,
                'survivor',
            );
            advanceAfterSurvivor(state, p.id);
            break;
        }
        /**
         * 凯莱布「幸运币」（额外行动）：
         * 弃掉搜索牌库顶 1 张卡牌；是钥匙→〔治疗〕，不是→〔移動〕×0-2。
         * 弃牌逻辑与发现阶段「不要那张牌」一致（钥匙进弃牌堆、不上钥匙架）。
         */
        case 'useLuckyCoin': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用幸运币');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用幸运币');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            const ch = state.characters.find((c) => c.id === p.characterId);
            if (!ch?.skills.some((s) => s.id === 'lucky_coin'))
                throw new Error('只有凯莱布能使用幸运币');
            if ((p.items.lucky_coin ?? 0) < 1)
                throw new Error('你没有凯莱布的幸运币');
            if (p.luckyCoinUsedThisTurn)
                throw new Error('本回合已经用过幸运币了');
            const topId = state.searchDeck.shift();
            if (!topId)
                throw new Error('搜索牌库已空');
            const card = state.cardById[topId];
            /** 弃牌逻辑与发现阶段一致：钥匙进弃牌堆、不上钥匙架 */
            discardUniqueCard(state, topId, 'search');
            p.luckyCoinUsedThisTurn = true;
            /**
             * 幸运币是**一次性物品** —— 用掉就离开背包进弃牌堆。
             * 和索菲亚相机同款处理（`takeItem` + `discardConsumedItem`），
             * 否则它会永远留在背包里（只是本回合不能再用，下回合又能用）。
             */
            takeItem(p, 'lucky_coin', 1);
            discardConsumedItem(state, 'lucky_coin', 1);
            if (card && isKeyCard(card)) {
                log(state, `幸运币：弃掉的是钥匙「${card.name}」，改为〔治疗〕。`, 'survivor');
                /**
                 * 〔治疗〕：自己回 1 点血；满血则按「中毒也能治」的规则移除中毒标记。
                 */
                if ((state.poisoned ?? []).includes(p.id)) {
                    clearPoisonOnHeal(state, p.id);
                }
                if (p.hp < p.maxHp) {
                    applyHeal(state, p.id, 1);
                }
                else {
                    log(state, `${p.name} 满血且没有中毒，治疗没有实际效果。`, 'survivor');
                }
            }
            else {
                log(
                    state,
                    `幸运币：弃掉「${card?.name ?? topId}」（不是钥匙），改为〔移動〕×0-2。`,
                    survivorActionVis(state),
                );
                state.pendingMoveRange = 2;
                state.pendingMoveMin = 0;
                /** `owner: 'survivor'` —— 这条草稿由**凯莱布自己**确认（不是杀手） */
                state.pendingPathDraft = {
                    min: 0,
                    max: 2,
                    rooms: p.roomId ? [p.roomId] : [],
                    owner: 'survivor',
                    /** 记住是谁的草稿 —— 单人热座下 move 否则会被解析成别人 */
                    actorId: p.id,
                };
            }
            break;
        }
        /**
         * 迪伦「机械知识」（额外行动）：
         * （在**锤子**地点）从弃牌堆获得一张工具箱。
         * **弃牌堆没有工具箱就不能用；有就能一直用。**
         */
        case 'useMechanicalKnack': {
            if (p.faction !== 'survivor' || !p.alive)
                throw new Error('只有存活幸存者可使用机械知识');
            if (state.phase !== 'survivorMain')
                throw new Error('仅幸存者大回合可使用机械知识');
            if (!controlsPiece(state, socketId, p))
                throw new Error('无权操作该幸存者');
            const ch = state.characters.find((c) => c.id === p.characterId);
            if (!ch?.skills.some((s) => s.id === 'mechanical_knack'))
                throw new Error('这名幸存者没有「机械知识」');
            if (!p.roomId || !isHammerRoom(state, p.roomId))
                throw new Error('只有在锤子标记的地点才能使用机械知识');
            /**
             * ⚠ **不限次数、也不消耗行动**：用户明确"迪伦的二技能是只要弃牌堆有
             * 工具箱就能无限用的"。所以这里**不查** `haltedThisRound`、
             * 也**不设** `extraActionUsedThisTurn` / `mechanicalKnackUsedThisTurn`
             * —— 唯一的上限就是"弃牌堆里还有没有工具箱"。
             */
            /**
             * 用掉或弃掉的工具箱在**场上弃牌堆**（`survivorDiscard`），
             * 不是搜索牌库那一摞里的字面 id `'toolbox'`。
             * 以前只翻 `searchDiscard`，弃牌堆里明明有工具箱也报「没有」。
             * 和女王在不在锤子地点无关。
             */
            if (!takeEarliestFromSurvivorDiscard(state, 'toolbox'))
                throw new Error('弃牌堆里没有工具箱，不能用');
            p.items.toolbox = (p.items.toolbox ?? 0) + 1;
            log(state, `${p.name} 发动「机械知识」：从弃牌堆获得一张工具箱。`, 'survivor');
            enforceInventory(state, p.id);
            break;
        }
        // —— 杀手：打牌、走完牌上的路、切换阶段、结束回合 ——
        case 'playKillerCard': {
            /**
             * 「攻击时机」是**遭遇里的一个独立阶段**，不属于杀手回合的
             * 快速/特殊/慢速三个阶段：
             *   遭遇流程 = 选人（pick）→ **攻击时机（attack）** → 幸存者加防御（defend）→ 撤离（flee）
             *
             * ⚠ 攻击时机的牌**只能**由 `playEncounterAttack` 打出。
             * 这里以前还留着一条平行的旧分支，两条路各写了一半效果
             * （處決 不挂判定、毒液之觸 不中毒、戰鬥適應 不加力量、条件也不查），
             * 而客户端走的是 `playEncounterAttack` —— 旧分支等于埋了个"看起来能用、
             * 其实什么都没发生"的坑。现在统一入口：走错门就直接说清楚。
             */
            if (state.phase === 'encounter')
                throw new Error('遭遇中的攻击牌请用「攻击时机」按钮打出');
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.phase !== 'killerMain')
                throw new Error('当前无法打牌');
            if (hasPendingKillerChoice(state))
                throw new Error('请先完成当前牌的选择');
            const idx = state.killerHand.indexOf(action.cardId);
            if (idx < 0)
                throw new Error('手牌中没有此卡');
            const card = state.cardById[action.cardId];
            if (!card)
                throw new Error('未知卡牌');
            const baseSpeed = effectiveCardSpeed(state, card);
            type PlayTiming = 'fast' | 'slow' | 'special';
            /**
             * 多时机牌（如狼人「领地意识」⚡＋⌛）：
             * `timings` 列出可打出的阶段；实际用的时机 = 当前阶段。
             * 每个时机可以各有自己的效果（`effectsByTiming`），没写就退回 `effects`。
             */
            const timings = card.timings?.length ? card.timings : null;
            const stepNow: string = (state.killerTurnStep ?? 'fast');
            const playTiming: PlayTiming | undefined = timings
                ? (timings.find((t) => t === stepNow) as PlayTiming | undefined)
                : (baseSpeed as PlayTiming);
            if (timings) {
                if (!playTiming)
                    throw new Error('这张牌现在打不出（时机不对）');
            }
            else if (baseSpeed !== 'fast' && baseSpeed !== 'slow' && baseSpeed !== 'special') {
                throw new Error('行动牌必须标明速度');
            }
            /**
             * **打出前的「条件不满足就不给打」检查。**
             *
             * 以前这些牌打出后会「内部跳过」（战报写一句就完了），
             * 等于让玩家白花一张牌 —— 规则要求**前置条件不满足时根本不能打**。
             */
            {
                const ops = new Set<string>([
                    ...(card.effects ?? []).map((e) => e.op),
                    ...((card.effectsByTiming ?? []).flatMap((g) => g.map((e) => e.op))),
                ]);
                /**
                 * 【巡邏 / 圍困】`statueMove` / `statueSiege`：
                 * **所有雕像都被停滞时，这张牌根本打不出来**（用户要求）。
                 * 因为整张牌就是"让雕像动/搜"，一尊能动的都没有就毫无意义。
                 */
                if (ops.has('statueMove') || ops.has('statueSiege')) {
                    const canAct = statuePieces(state).some((x) => x.alive && !x.statueHalted);
                    if (!canAct) {
                        throw new Error('所有雕像都被停滞了，这张牌现在打不出（至少要有 1 尊能行动）');
                    }
                }
                /**
                 * 【枝條生長】`placeBlockadeAtCore`：
                 * 必须有「带任意核心标记、且旁边还有未封堵的门」的地点。
                 */
                if (ops.has('placeBlockadeAtCore')) {
                    const rooms = coreRooms(state).filter((r) => unblockedDoorsAt(state, r).length > 0);
                    if (rooms.length === 0) {
                        throw new Error(
                            '枝條生長：场上没有「带核心标记且还有可封堵的门」的地点，现在不能打出',
                        );
                    }
                }
                /**
                 * 【茂盛】`placeCore`：
                 * 核心标记是**直接放在扼杀者所在地点**的（不能自选位置），
                 * 所以这里只检查上限 —— 没有所在地点 / 已达 5 个上限就不能打。
                 */
                if (ops.has('placeCore')) {
                    const kc = state.killerId ? state.players[state.killerId] : null;
                    if (!kc?.roomId)
                        throw new Error('茂盛：你不在图上，不能打出');
                    if ((state.coreMarkers ?? []).length >= 5) {
                        throw new Error('茂盛：核心标记已达 5 个上限，现在不能打出');
                    }
                }
                /**
                 * 【超听觉】`moveNearestNoiseSearch`：
                 * 规则要求**要有响声才能用** ——
                 * 场上没有响声（也没有爆竹那种"全场响声"）时不能打。
                 */
                if (ops.has('moveNearestNoiseSearch') && !state.firecrackerThisRound) {
                    const kc = state.killerId ? state.players[state.killerId] : null;
                    const noises = (state.noises ?? []).filter((id) => id !== kc?.roomId);
                    if (noises.length === 0) {
                        throw new Error('超听觉：场上没有响声，现在不能打出');
                    }
                }
                /**
                 * **效果自带的 `requires` 前置条件。**
                 *
                 * 内容文件里已经写了（`content/cards/killers.json`），而且 docx
                 * 也在「效果」下面单列了一行「额外条件」—— 但引擎以前**从来没检查过**，
                 * 于是「鲜血追猎」在场上没人受伤时照样能打出去（白花一张牌）。
                 * 这里统一按 `requires` 判定，牌面怎么写就怎么拦。
                 */
                const reqs = new Set<string>();
                const collectReq = (list?: Array<{ op: string; requires?: string; alternatives?: unknown }>) => {
                    for (const fx of list ?? []) {
                        if (fx.requires)
                            reqs.add(fx.requires);
                        if (Array.isArray(fx.alternatives))
                            collectReq(fx.alternatives as Array<{ op: string; requires?: string }>);
                    }
                };
                collectReq(card.effects as never);
                for (const g of card.effectsByTiming ?? [])
                    collectReq(g as never);
                for (const req of reqs) {
                    const reason = cardRequirementBlockReason(state, card, req);
                    if (reason)
                        throw new Error(reason);
                }
            }
            if (playTiming === 'fast' && state.killerTurnStep !== 'fast') {
                throw new Error('快速牌只能在快速阶段打出');
            }
            if (playTiming === 'special') {
                if (state.killerTurnStep !== 'main')
                    throw new Error('特殊牌请在快速阶段结束后打出');
                if (state.killerMainChoice === 'actions')
                    throw new Error('已选择普通行动，不能再打特殊牌');
                if (state.killerMainChoice === 'special')
                    throw new Error('本回合已打过特殊牌');
            }
            if (playTiming === 'slow') {
                if (state.killerTurnStep !== 'slow')
                    throw new Error('慢速牌只能在慢速阶段打出');
                /**
                 * 一般情况「每回合只能打 1 张慢速牌」，
                 * **只有扼杀者 1 级才解锁无限**（进化 1 级原文：
                 * 「你可以在慢速行动阶段期间使用不限张数的沙漏卡牌」，
                 * 这里的"沙漏卡牌"就是慢速卡牌，没有单独的沙漏类别）。
                 */
                const slowUnlimited = killerKindOf(state) === 'strangler' && state.killerLevel >= 1;
                if (!slowUnlimited && state.killerUsedSlowThisTurn) {
                    throw new Error('本回合已打过 1 张慢速牌（只有扼杀者进化 1 级后可以不限张数）');
                }
            }
            // 这张牌这次要执行的效果
            const timingIndex = timings && playTiming ? timings.indexOf(playTiming) : -1;
            const effectsToRun = timingIndex >= 0 && card.effectsByTiming?.[timingIndex]?.length
                ? card.effectsByTiming[timingIndex]
                : card.effects;
            /** 女猎手进化 3 级：所有卡牌费用 -1（最少 0） */
            const cost = killerCardCostAfterDiscount(cardHandCost(card), huntressCostDiscount(state));
            const payCardIds = [...new Set(action.payCardIds ?? [])];
            if (payCardIds.includes(action.cardId))
                throw new Error('不能用正在打出的牌支付弃牌费用');
            if (payCardIds.length !== cost) {
                throw new Error(cost > 0 ? `打出此牌需同时弃置 ${cost} 张其他手牌` : '此牌不需要弃置其他手牌');
            }
            for (const id of payCardIds as string[]) {
                if (!state.killerHand.includes(id))
                    throw new Error('支付的手牌不在手里');
            }
            const blocked = killerCardBlockedReason(state, playerId, card);
            if (blocked)
                throw new Error(blocked);
            const takeFromHand = (id: string) => {
                const i = state.killerHand.indexOf(id);
                if (i < 0)
                    throw new Error('手牌中没有此卡');
                state.killerHand.splice(i, 1);
            };
            for (const id of payCardIds)
                takeFromHand(id);
            takeFromHand(action.cardId);
            /**
             * 效果里带 `optional`（牌面写了「可以」）且需要决定牌的去向时，
             * 这张牌**先不进弃牌堆**，等玩家选完再定 —— 保证牌的唯一性。
             * 没写「可以」的效果一律必须执行，牌照常进弃牌堆。
             */
            const canGoDeckTop = effectsToRun.some((fx) => fx.op === 'returnToDeckTop' && fx.optional);
            /** 已提前执行的，从待结算队列里去掉 */
            const restEffects = effectsToRun.filter((fx) => fx.op !== 'removeFromDiscardPermanent' && fx.op !== 'modifyPowerUntilNextTurn');
            /**
             * **先把费用牌放进弃牌堆，再执行效果** ——
             * 變形 / 戰鬥適應 的「永久从弃牌堆移除 N 张」因此可以把**本次弃置的费用牌**
             * 也算进候选。
             *
             * 但这张牌**自己最后才进弃牌堆**（`state.deferredPlayedCard`），
             * 所以它不参与移除 —— 对应规则「不能选择此牌本身」。
             */
            for (const id of payCardIds)
                state.killerDiscard.push(id);
            /**
             * 这张牌的去向 —— **顺序按用户要求定死**：
             *   ① 打出牌 → ② 弃掉费用（上面那些 `payCardIds`）→
             *   ③ **牌立刻进弃牌堆** → ④ 才执行效果。
             *
             * ⚠ 以前是"效果全跑完才进弃牌堆"（挂在 `deferredPlayedCard` 上），
             * 于是效果执行期间**弃牌堆顶不是刚打出的那张牌**
             * （用户报的："总是在执行效果时弃牌堆顶不是我刚打出的牌"）。
             *
             * ⚠ `deferredPlayedCard` 仍然要记：它是"**刚打出的那张**"这个标记，
             * 「變形 / 戰鬥適應」的『永久从弃牌堆移除』靠它排除"不能选自己"。
             * 效果全部结算完，由 `flushDeferredPlayedCard` 撤掉这个标记。
             *
             * 「可以放牌库顶」（刺耳噪声）例外：那张牌要回牌库顶，不进弃牌堆。
             */
            if (canGoDeckTop) {
                state.pendingDeckTopCard = action.cardId;
            } else {
                state.deferredPlayedCard = action.cardId;
                /** ③ 牌进弃牌堆（放在费用牌**之后** push，所以它就在堆顶） */
                state.killerDiscard.push(action.cardId);
            }
            /**
             * **幸存者地图右边要能看到"杀手当前打出的牌"**（用户要求）——
             * 所以另外记一份，**不在结算完时清掉**，一直留到本回合结束。
             */
            state.currentKillerCardId = action.cardId;
            /**
             * 费用牌已就位，现在执行「永久从弃牌堆移除」（排除本牌）。
             *
             * ⚠ **必须走"让玩家自己挑"的 `beginRemoveFromDiscardPermanent`** ——
             * 这里以前调的是旧的自动版 `removeFromDiscardPermanent`（从堆顶直接拿），
             * 于是【變形】【戰鬥適應】依旧**系统代选**，用户报的
             * 「应该是自选弃牌，怎么没改过来」就是这一处（另一处入口在效果队列里）。
             */
            const earlyRemovals = effectsToRun.filter((fx) => fx.op === 'removeFromDiscardPermanent');
            for (const fx of earlyRemovals) {
                beginRemoveFromDiscardPermanent(
                    state,
                    typeof fx.value === 'number' ? fx.value : 1,
                    card.name,
                    [action.cardId],
                );
            }
            /**
             * 「使用这张牌时启用」的力量（屏息）：必须**立刻**生效，
             * 不能被后面的〔潜行〕路径选择卡住队列。
             */
            const earlyPowers = effectsToRun.filter((fx) => fx.op === 'modifyPowerUntilNextTurn');
            for (const fx of earlyPowers) {
                addPowerUntilNextTurn(state, typeof fx.value === 'number' ? fx.value : 3);
            }
            const speedLabel = playTiming === 'fast' ? '快速' : playTiming === 'special' ? '特殊' : '慢速';
            const payNames = payCardIds.map((id) => state.cardById[id]?.name ?? id);
            log(state, payNames.length
                ? `${p.name} 打出${speedLabel}牌「${card.name}」，同时将「${payNames.join('、')}」放入弃牌堆。`
                : `${p.name} 打出${speedLabel}牌「${card.name}」。`);
            if (playTiming === 'special') {
                state.killerMainChoice = 'special';
                state.killerMainActionsLeft = 0;
                p.actionsLeft = 0;
            }
            if (playTiming === 'slow') {
                state.killerUsedSlowThisTurn = true;
            }
            state.pendingCardSpeed = playTiming ?? null;
            state.blockadesThisAction = [];
            state.pendingSealQueue = [];
            state.sealAllRoomId = null;
            state.pendingBlockadePlace = null;
            if (/^spectre_whiz_/.test(action.cardId))
                markWhizFollowup(state);
            state.pendingEffectQueue = [...restEffects];
            continueKillerQueue(state);
            if (hasPendingKillerChoice(state))
                break;
            /** 效果跑完了：把打出的这张牌推进弃牌堆 */
            flushDeferredPlayedCard(state);
            state.pendingCardSpeed = null;
            maybeStartEncounter(state);
            maybeFinishKillerMain(state);
            break;
        }
        case 'finishPendingMove': {
            /**
             * 路径草稿有两种归属：
             *  - `owner === 'survivor'`：**幸存者自己在走**（凯莱布「幸运币」的〔移動〕）。
             *    由**本人**确认（1对3 各自操作自己的角色，所以只查 controlsPiece）。
             *  - 其余（默认 killer）：杀手牌在走，按原来的杀手流程结算。
             */
            if (state.pendingPathDraft?.owner === 'survivor') {
                if (p.faction !== 'survivor')
                    throw new Error('仅幸存者可确认这条路径');
                if (!controlsPiece(state, socketId, p))
                    throw new Error('只能确认自己角色的移动');
                const draft = state.pendingPathDraft;
                const taken = Math.max(0, draft.rooms.length - 1);
                if (taken < draft.min)
                    throw new Error(`至少选择 ${draft.min} 步`);
                if (taken > draft.max)
                    throw new Error(`最多 ${draft.max} 步`);
                /** 按玩家点出来的路径**逐格走**（中途踩到陷阱会被拦下） */
                if (draft.rooms.length >= 2 && p.roomId) {
                    const res = walkSurvivorPath(state, p.id, draft.rooms[0]!, [...draft.rooms]);
                    if (!res.ok)
                        throw new Error('路径不合法（必须每步相邻且不被封堵）');
                    if (p.roomId)
                        /** 【变体1】特性 16：幸运币是**物品**（移动即响）→ 照响，16 压不住 */
                        pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'item' });
                }
                else if (p.roomId) {
                    log(state, `${p.name} 留在「${roomName(state, p.roomId)}」。`);
                }
                state.pendingPathDraft = null;
                state.pendingMoveRange = null;
                state.pendingMoveMin = 0;
                break;
            }
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.pendingPathDraft) {
                confirmPathDraft(state);
                const speed = state.pendingCardSpeed;
                if (!hasPendingKillerChoice(state)) {
                    /** 路走完了：把打出的这张牌推进弃牌堆 */
                    flushDeferredPlayedCard(state);
                    state.pendingCardSpeed = null;
                    maybeStartEncounter(state);
                    if (speed === 'special')
                        maybeFinishKillerMain(state);
                }
                break;
            }
            finishPendingCardMove(state);
            break;
        }
        case 'advanceKillerStep': {
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.phase !== 'killerMain')
                throw new Error('当前不是杀手阶段');
            if (hasPendingKillerChoice(state))
                throw new Error('请先完成当前牌的选择');
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
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.phase !== 'killerMain')
                throw new Error('当前不是杀手阶段');
            if (state.killerTurnStep !== 'main')
                throw new Error('请先结束快速阶段');
            if (state.killerMainChoice)
                throw new Error('已经选过本回合的主要行动方式');
            if (action.choice !== 'actions')
                throw new Error('无效选择');
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
            }
            else if (p.faction === 'killer') {
                if (hasPendingKillerChoice(state))
                    throw new Error('请先完成当前牌的选择');
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
            /**
             * ⚠ 豁免要给**真的在操作杀手**的那根网线，不能只看"这局有杀手"。
             *
             * `isSharedSurvivorMode` 在 1对1 / 1对2 里也是 true（一个玩家管 3 枚幸存者），
             * 所以原来那句 `&& state.killerId` 会让**对面那个幸存者玩家替杀手弃牌**
             * —— 实测确认：1对1 里幸存者发 `discardKillerCard`，服务端接受。
             *
             * 换成 `controlsPiece` 之后：
             *   · solo（房主一人全控）→ 仍然成立，热座不受影响
             *   · 1对1 / 1对2 的幸存者玩家 → 不成立，正确拒绝
             */
            if (p.faction !== 'killer' &&
                !(isSharedSurvivorMode(state) && state.killerId &&
                    controlsPiece(state, socketId, state.players[state.killerId]))) {
                throw new Error('仅杀手可弃牌');
            }
            const hand = state.killerHand;
            const idx = hand.indexOf(action.cardId);
            if (idx < 0)
                throw new Error('手牌中没有此卡');
            if (state.pendingKillerDiscards <= 0)
                throw new Error('当前不需要弃牌');
            /**
             * ⚠ **"刚由进化入手的牌本次不能弃"没有例外**（用户口径：
             * 「特性三只影响抽牌，**不影响这种锁定牌加入手牌和雕像 4 级**」）。
             *
             * 【变体1】特性 03「狡猾诡计」写的是「如果你超出了手牌上限，你可以
             * 弃掉任意手牌，而不是**只能弃掉新抽到的卡牌**」—— 那是**抽牌**那一侧
             * 的事；锁定牌入手、雕像 4 级取回「圍困」都不是"抽到的牌"，
             * 所以带这张特性也照样不能把它们弃掉。
             *
             * （以前这里带特性就整个跳过限制，等于"弃一张再拿围困"白拿。）
             */
            if ((state.justUnlockedCards ?? []).includes(action.cardId)) {
                throw new Error('刚由进化入手的牌本次不能弃置');
            }
            hand.splice(idx, 1);
            state.killerDiscard.push(action.cardId);
            state.pendingKillerDiscards -= 1;
            log(state, `杀手弃置「${state.cardById[action.cardId]?.name ?? action.cardId}」。`);
            if (state.pendingKillerDiscards === 0) {
                state.pendingUnlockDiscard = false;
                state.justUnlockedCards = [];
                /**
                 * ⚠ **先把"进化欠下的洗牌 + 摸牌"补上，再决定收尾**
                 * （用户报的「雕像 3 级进化后没有洗牌」，以及之前那句
                 * 「为什么进化到 4 级时摸了 5 张」—— 同一个根因）。
                 *
                 * 进化结算时如果还欠着弃牌，`settleConfirmedEvolution` 会在
                 * `if (state.pendingKillerDiscards > 0) return;` **提前返回**，
                 * 那句 `resumeDeferredDeckRecycle` 根本没跑到；而这里原来按
                 * `phase === 'upkeep'` 走的是 `maybeCloseKillerUpkeep`
                 * —— **它不补洗牌**，于是回合就这么结束了：
                 * 摸牌堆空着、欠的摸牌一直挂到**下一次**进化才被一起摸出来。
                 *
                 * `resumeDeferredDeckRecycle` 自带两个闸门（没欠东西 / 进化还没确认
                 * 就直接返回），所以这里可以无条件调。
                 */
                resumeDeferredDeckRecycle(state);
                if (state.phase === 'upkeep')
                    maybeCloseKillerUpkeep(state);
                /**
                 * ⚠ 也可能是**进化带来的弃牌**：那时 `pendingEvolutionAck` 还在
                 * （进化效果"弃牌"这一步），弃完要把杀手回合收尾。
                 */
                else
                    maybeFinishAfterEvolutionDiscard(state);
            }
            break;
        }
        // —— 发现翻牌、确认噪音、遭遇攻防、感知颜色、护符 ——
        case 'chooseDiscovery': {
            if (state.pendingDiscoveryPick)
                throw new Error('请先选择翻牌的幸存者');
            if (state.mode === 'multi') {
                if (p.faction !== 'survivor')
                    throw new Error('只有幸存者可选择发现牌');
                if (state.discoveryActorId && playerId !== state.discoveryActorId) {
                    throw new Error('只能由被选中翻牌的幸存者选择');
                }
            }
            else {
                /**
                 * ⚠ `socketId === state.hostId` 这个豁免**只在单人热座里成立**。
                 *
                 * 1对1 / 1对2 里房主很可能就是**杀手** —— 那样杀手能替幸存者翻发现牌。
                 * （同一处豁免在 `acknowledgeDiscovery` 上实测确认被接受。）
                 */
                const allowed = (state.mode === 'solo' && socketId === state.hostId) ||
                    p.faction === 'survivor' ||
                    (isSharedSurvivorMode(state) && isSurvivorOperator(state, socketId));
                if (!allowed)
                    throw new Error('无权选择发现牌');
            }
            resolveDiscoveryChoice(state, action.cardId);
            break;
        }
        case 'acknowledgeDiscovery': {
            if (state.phase !== 'discovery')
                throw new Error('当前不是发现阶段');
            if (state.pendingDiscoveryPick)
                throw new Error('请先选择翻牌的幸存者');
            if (state.discoveryOptions.length > 0)
                throw new Error('请先选留一张发现牌');
            /** ⚠ 同 `chooseDiscovery`：`hostId` 豁免只在单人热座里成立 */
            const allowed = state.mode === 'multi' || state.mode === '2v3'
                ? p.faction === 'survivor'
                : (state.mode === 'solo' && socketId === state.hostId) ||
                    playerId === firstAliveSurvivorId(state) ||
                    (isSharedSurvivorMode(state) && isSurvivorOperator(state, socketId));
            if (!allowed)
                throw new Error('无权确认发现');
            enterNoiseReport(state);
            break;
        }
        case 'acknowledgeNoise': {
            if (state.phase !== 'noiseReport')
                throw new Error('当前不是响声阶段');
            if (playerId !== state.killerId)
                throw new Error('仅杀手可执行');
            enterKillerMain(state);
            break;
        }
        case 'playEncounterAttack': {
            if (state.phase !== 'encounter' || !state.encounter)
                throw new Error('当前不在遭遇中');
            if (state.encounter.step !== 'attack')
                throw new Error('当前不是攻击步骤');
            if (playerId !== state.killerId)
                throw new Error('仅杀手可选择是否加攻击');
            const enc = state.encounter;
            if (enc.attackChoiceMade)
                throw new Error('这次攻击已经选过是否加攻');
            if (action.cardId) {
                const idx = state.killerHand.indexOf(action.cardId);
                if (idx < 0)
                    throw new Error('手牌中没有此卡');
                /**
                 * ⚠⚠ **删手牌一律重新按 id 查下标，别用缓存的 `idx`。**
                 *
                 * 血案：这里原来先缓存 `idx`，然后**先删支付牌**（`atkPay`）——
                 * 数组变短、下标前移，再用过期的 `idx` 去 `splice`，
                 * 结果是**打出的那张牌留在手牌里、却又被推进了弃牌堆**
                 * （用户报的「手牌里多了一张扼殺，弃牌堆也有一张扼殺，
                 *   而扼殺只有一张」），或者**误删别的牌**
                 * （同一份牌组里「狂亂枝條」就是这么不见的）。
                 *
                 * 这条流程**所有杀手共用**，所以影响面是全杀手。
                 */
                const takeFromHand = (id: string) => {
                    const i = state.killerHand.indexOf(id);
                    if (i >= 0)
                        state.killerHand.splice(i, 1);
                };
                void takeFromHand;
                const card = state.cardById[action.cardId];
                /**
                 * **牌面写了使用条件的攻击牌要在这里拦**（毒液之觸 / 伏擊）。
                 *
                 * ⚠ 以前只有 `playKillerCard` 的那条遗留分支做了这个检查，
                 * 而客户端走的是**这里** —— 所以条件等于没查。
                 */
                const atkCondBlock = attackCardConditionBlockReason(state, card);
                if (atkCondBlock)
                    throw new Error(atkCondBlock);
                /**
                 * **攻击阶段的牌也有费用（弃牌）** —— 以前这里完全没查 `handCost`，
                 * 所以【擲斧】(1) / 【扼殺】(2) / 【戰鬥適應】(2) / 【處決】(1) /
                 * 【毒液之觸】(1) 的费用都被白送了。
                 * 规则：打出时**一同弃置 `handCost` 张其他手牌**。
                 */
                const atkCost = card
                    ? killerCardCostAfterDiscount(cardHandCost(card), huntressCostDiscount(state))
                    : 0;
                const atkPay = [...new Set(action.payCardIds ?? [])];
                if (atkCost > 0) {
                    if (atkPay.includes(action.cardId))
                        throw new Error('不能用正在打出的牌支付弃牌费用');
                    if (atkPay.length !== atkCost)
                        throw new Error(`打出此牌需同时弃置 ${atkCost} 张其他手牌`);
                    for (const pid of atkPay) {
                        if (!state.killerHand.includes(pid))
                            throw new Error('支付用的牌不在手牌里');
                    }
                }
                /**
                 * 【處決】：特殊牌，不加攻击力。
                 * 打出后挂在本场遭遇上，等目标掷完防御骰再按「力量 vs 防御」判定。
                 * 任何雕像在攻击前都能用，只对当前雕像的当前这次攻击有效。
                 */
                if (card && /^statue_execute$/.test(card.id)) {
                    /** 先付费用（和普通打牌一致：费用牌先进弃牌堆） */
                    for (const pid of atkPay) {
                        takeFromHand(pid);
                        state.killerDiscard.push(pid);
                    }
                    /** ⚠ 重新按 id 删（**不能**用上面缓存的 `idx`：支付牌已经删过了） */
                    takeFromHand(action.cardId);
                    state.killerDiscard.push(action.cardId);
                    enc.executeArmed = true;
                    enc.executeStatueId = state.killerId;
                    enc.attackBoost = false;
                    enc.attackChoiceMade = true;
                    enc.attackCardId = null;
                    state.encounterTailBonus = 0;
                    enc.step = 'defend';
                    log(state, `打出「處決」：等目标掷完防御骰后判定 —— 力量高出防御 3 点或更多就消灭目标。`, 'all', true);
                    break;
                }
                const bonus = encounterCardAttackBonus(state, card);
                if (!card || !canPlayAsEncounterAttack(card))
                    throw new Error('这张牌不能在遭遇中打出');
                /** 先付费用牌（和普通打牌一致），再打出这张牌本身 */
                for (const pid of atkPay) {
                    takeFromHand(pid);
                    state.killerDiscard.push(pid);
                }
                /** ⚠ 同样要重新按 id 删（`idx` 已经过期） */
                takeFromHand(action.cardId);
                state.killerDiscard.push(action.cardId);
                state.encounterTailBonus = bonus;
                enc.attackBoost = true;
                enc.attackChoiceMade = true;
                enc.attackCardId = action.cardId;
                /**
                 * 遭遇里的攻击牌同样是"杀手当前打出的牌"——
                 * 幸存者地图右边要能看到这张卡的卡面（用户要求）。
                 */
                state.currentKillerCardId = action.cardId;
                log(state, bonus > 0
                    ? `${p.name} 打出「${card.name}」，本次攻击 +${bonus}。`
                    : `${p.name} 打出「${card.name}」。`);
                if (atkPay.length) {
                    log(
                        state,
                        `${p.name} 为此弃置了 ${atkPay.map((x) => `「${state.cardById[x]?.name ?? x}」`).join('、')}。`,
                        'killer',
                    );
                }
                /**
                 * 除了加攻数值，还要执行这张牌**攻击时机**的其它效果 ——
                 * 例如荊棘纏繞的「本次攻击中目标不能使用任何物品」、
                 * 毒液之觸的〔中毒〕、戰鬥適應的永久 +1 力量。
                 * 戰鬥適應要先选移除的牌：选完之前停在攻击步骤，不进入防御。
                 */
                runAttackTimingExtras(state, card);
                if (!state.pendingDiscardRemove)
                    enc.step = 'defend';
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
            if (state.phase !== 'encounter' || !state.encounter)
                throw new Error('当前不在遭遇中');
            if (state.encounter.step !== 'defend')
                throw new Error('当前不是防御步骤');
            const enc = state.encounter;
            if (!enc.targetId || enc.targetId !== playerId)
                throw new Error('你不是本次遭遇对象');
            if (playerId in enc.defenses)
                throw new Error('已经选择过防御');
            /**
             * **剛毅之盾**单独一个开关：它**不占"一次只能选一件"的名额**，
             * 所以可以和 `itemId` 那件一起用。
             * （万一客户端把它当普通物品传进 `itemId`，这里也认，当勾选处理。）
             */
            let useShield = Boolean(action.shield) && shieldDefenseBonus(state, p) > 0;
            let itemId = action.itemId ?? null;
            if (itemId === 'relic_shield') {
                useShield = true;
                itemId = null;
            }
            /**
             * 【变体3】**燃燒瓶**（`whiskeyDefenseBonus`）：
             * 「每次攻擊僅限一次，你可以**棄掉**一個威士忌酒瓶來 +2 防禦值」。
             *
             * 用户口径（2024 澄清）：
             *  - 酒瓶是**弃置**、不是"使用物品" → **不占防御物品名额**，
             *    也**不算使用物品**（不影响威廉「坚韧不拔」/ 特性 05 / 乔治笔记 / 剛毅之盾）；
             *  - 这一问要**排在"防御物品确认之后"**单独进行 ——
             *    所以这里只挂 `whiskeyOffer`，等 `confirmWhiskeyDefense` 再掷骰。
             */
            const canWhiskey =
                planImplActive(state, 'whiskeyDefenseBonus') &&
                (p.items.whiskey ?? 0) > 0 &&
                !state.encounterBlockItems;
            /**
             * 荊棘纏繞（攻击时机）：本次攻击中目标**不能使用任何物品**。
             *
             * ⚠ 用户明确：**剛毅之盾（遗物）也一并禁掉** ——
             * 牌面说的是"不能使用任何物品"，这颗盾在防御里同样算"使用"。
             */
            if (state.encounterBlockItems && (itemId || useShield)) {
                throw new Error('荊棘纏繞：本次攻击中你不能使用任何物品（含剛毅之盾）');
            }
            if (itemId === 'trait_s17') {
                /**
                 * 【变体1】特性 17「秘密武器」：卡面写「视为一个 +4 防御值的**物品**」，
                 * 所以它**占"使用物品加防"这个名额**（也因此被荊棘纏繞禁掉、并占掉威廉/05 的 +1）。
                 */
                if (!state.variant1 || !traitAvailable(state, playerId, 'trait_s17'))
                    throw new Error('无法使用「秘密武器」');
            }
            else if (itemId && !canUseDefenseItem(p, itemId)) {
                throw new Error('无法使用该物品增强防御');
            }
            enc.defenses[playerId] = null;
            if (!enc.defenseItems)
                enc.defenseItems = {};
            enc.defenseItems[playerId] = itemId;
            if (!enc.shieldUsed)
                enc.shieldUsed = {};
            enc.shieldUsed[playerId] = useShield;
            log(
                state,
                itemId
                    ? `${p.name} 使用「${itemName(itemId)}」加防${useShield ? '，并用「剛毅之盾」+1' : ''}。`
                    : useShield
                        ? `${p.name} 加防：遗物「剛毅之盾」+1（不占防御物品名额）。`
                        : `${p.name} 不使用防御物品。`,
            );
            /**
             * 燃燒瓶的第二段：先让幸存者回答"要不要弃掉一个威士忌酒瓶 +2"，
             * 回答完（`confirmWhiskeyDefense`）才掷骰。
             */
            if (canWhiskey) {
                enc.whiskeyOffer = { playerId };
                log(
                    state,
                    `【变体3】燃燒瓶：${p.name} 还可以**弃掉一个威士忌酒瓶**来 +2 防御值（不算使用物品、不占名额）—— 请先确认。`,
                    'survivor',
                );
                break;
            }
            rollEncounterDefense(state);
            break;
        }
        /**
         * 【变体3】**燃燒瓶的第二段**：确认要不要弃威士忌酒瓶。
         *
         * 用户口径：这一步排在**防御物品确认之后**；酒瓶是**弃置**（进弃牌堆），
         * 不算"使用物品" —— 所以只加到防御值上，不进 `otherDefenseBoost`。
         */
        case 'confirmWhiskeyDefense': {
            if (state.phase !== 'encounter' || !state.encounter)
                throw new Error('当前不在遭遇中');
            const enc = state.encounter;
            const offer = enc.whiskeyOffer;
            if (!offer)
                throw new Error('现在不需要确认威士忌酒瓶');
            const who = state.players[offer.playerId];
            if (!who || who.faction !== 'survivor')
                throw new Error('找不到该幸存者');
            if (!controlsPiece(state, socketId, who))
                throw new Error('无权操作该幸存者');
            const use = Boolean(action.use);
            if (use && (who.items.whiskey ?? 0) <= 0)
                throw new Error('你没有威士忌酒瓶');
            enc.whiskeyOffer = null;
            if (!enc.whiskeyUsed)
                enc.whiskeyUsed = {};
            enc.whiskeyUsed[who.id] = use;
            if (use) {
                /** **弃置**：从背包拿走、进物品弃牌堆（不是"使用"） */
                takeItem(who, 'whiskey', 1);
                discardConsumedItem(state, 'whiskey', 1);
                log(
                    state,
                    `【变体3】燃燒瓶：${who.name} 弃置一个威士忌酒瓶（进弃牌堆），本次遭遇防御 +2 —— 不算使用物品、不占防御物品名额。`,
                    'survivor',
                );
            }
            else {
                log(state, `【变体3】燃燒瓶：${who.name} 不弃威士忌酒瓶。`, 'survivor');
            }
            rollEncounterDefense(state);
            break;
        }
        case 'rerollEncounterDice': {
            if (!state.pendingDice)
                throw new Error('现在没有待重掷的骰子');
            const who = state.players[state.pendingDice.playerId];
            if (!who)
                throw new Error('找不到掷骰的幸存者');
            if (!controlsPiece(state, socketId, who))
                throw new Error('无权操作该幸存者');
            rerollEncounterDice(state, who, action.diceIndexes ?? []);
            break;
        }
        case 'resolveEncounterDice': {
            if (!state.pendingDice)
                throw new Error('现在没有待结算的骰子');
            const who = state.players[state.pendingDice.playerId];
            if (!who)
                throw new Error('找不到掷骰的幸存者');
            if (!controlsPiece(state, socketId, who))
                throw new Error('无权操作该幸存者');
            resolvePendingEncounterDice(state);
            break;
        }
        case 'pickFleeSurvivor': {
            if (state.phase !== 'encounter' || !state.encounter)
                throw new Error('当前不在遭遇中');
            if (state.encounter.step !== 'flee')
                throw new Error('当前不是撤离步骤');
            /**
             * ⚠ **（甲）撤离要先选人**：名单上点谁，谁才成为本次撤离的人。
             *
             * 权限按**被点的那个人归谁管**判定（1对3 里各点各的；
             * 单人热座 / 共享操控下谁都能点自己这边的人）。
             */
            const wanted = state.players[action.targetPlayerId];
            if (!wanted || wanted.faction !== 'survivor' || !wanted.alive)
                throw new Error('无法选择该幸存者');
            if (!controlsPiece(state, socketId, wanted))
                throw new Error('不能替这名幸存者选撤离');
            pickFleeSurvivor(state, action.targetPlayerId);
            break;
        }
        case 'encounterFlee': {
            if (state.phase !== 'encounter' || !state.encounter)
                throw new Error('当前不在遭遇中');
            if (state.encounter.step !== 'flee')
                throw new Error('当前不是逃离步骤');
            const enc = state.encounter;
            /**
             * 现在"轮到谁"看的是 `targetId`（由名单点出来），
             * 不再看 `fleeQueue[0]` —— 队列只表示"还有谁没撤离"。
             */
            if (enc.targetId !== playerId)
                throw new Error('还没轮到你逃离（请先在名单里选中自己）');
            if (action.moveToRoomId) {
                /**
                 * 【变体1】幸存者特性 09「生存本能」：
                 * 「在你遭遇杀手后，你可以【移动】最多 2，而不是 1。之后，移除你的所有恐惧标记。」
                 *
                 * 撤离阶段正常只能走 1 格；带这张卡时可以走 **1 或 2 格**
                 * （走多远由玩家点哪个地点决定 = 他做的那次"选择"）。
                 * 只要这次**走了 2 格**，就按卡面"之后"清空自己的恐惧。
                 */
                const hasInstinct =
                    state.variant1 && hasTrait(state, playerId, 'trait_s09');
                /**
                 * 先按正常 1 格试；不行再看是不是"走 2 格"（点了 2 格远的地点）。
                 *
                 * 这样**客户端不用改**：撤离时它已经把 2 格内的可点地点都标出来了
                 * （见 `buildSnapshot` 的 `legalMoves`），玩家点哪就发哪，
                 * 走几格由服务端按距离判定 —— 也正好等于"他选择了用不用这张特性"。
                 */
                let usedSteps = 1;
                let ok = tryMove(state, playerId, action.moveToRoomId, 1, 1);
                if (!ok && hasInstinct) {
                    ok = tryMove(state, playerId, action.moveToRoomId, 2, 2);
                    if (ok)
                        usedSteps = 2;
                }
                if (!ok)
                    throw new Error('移动不合法');
                log(state, `${p.name} 遭遇后移动到「${roomName(state, p.roomId)}」。`, 'survivor');
                if (hasInstinct && usedSteps === 2) {
                    const had = p.fear;
                    p.fear = 0;
                    p.overFear = false;
                    log(
                        state,
                        `【变体1】${p.name}「生存本能」：撤离时移动 2 格，并移除全部恐惧标记` +
                            `${had > 0 ? `（${had} 个）` : ''}。`,
                        'survivor',
                    );
                }
            }
            else {
                log(state, `${p.name} 选择不移动。`, 'survivor');
            }
            /**
             * 这个人撤离完了 → 回"选人"这一步（名单里还有谁就继续选谁）。
             * 名单空了由 `advanceFleeSelection` 自己收尾遭遇。
             */
            advanceFleeSelection(state, playerId);
            break;
        }
        case 'chooseSenseColor': {
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (!state.pendingSenseColor)
                throw new Error('当前不是选择感知颜色');
            state.pendingSenseColorPick = action.color;
            log(state, `已选${action.color === 'R' ? '红色' : action.color === 'B' ? '蓝色' : '绿色'}区域，请确认感知。`, 'killer');
            break;
        }
        case 'confirmSense': {
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.pendingSenseColor) {
                if (!state.pendingSenseColorPick)
                    throw new Error('请先选择颜色');
                resolveSenseColor(state, state.pendingSenseColorPick);
            }
            else if (state.pendingSensePair) {
                const a = state.pendingSensePair.firstRoomId;
                const b = state.pendingSensePair.secondRoomId;
                if (!a || !b)
                    throw new Error('请先选好两个相连地点');
                const witnessed = senseRooms(state, [a, b]);
                /** 女王等级 2：感知目击 → 惊吓 */
                queenSenseFear(state, witnessed);
            /** 【变体1】感知命中 → 挂出可发动的特性卡（10/15/16） */
            offerSenseTraits(state, witnessed);
                state.pendingSensePair = null;
                /**
                 * ⚠ 以前这里**什么都不报** —— 感知完两处相连地点，
                 * 战报和信息块都没有，玩家只能自己猜结果。
                 * 现在和别的〔感知〕一样：**战报和行动区同一套说法**（用户要求）——
                 * 先列这次感知的**地点**（两处相连地点是杀手自己选的，照写），
                 * 再列**感知到的人**（不把人对应到地点上）。
                 */
                const names = witnessed.map((s) => s.name);
                const placeLine = `地点：${roomName(state, a)}、${roomName(state, b)}`;
                const whoLine = names.length
                    ? `看到 ${names.length} 名幸存者：${names.join('、')}`
                    : '那两处地点都没有人。';
                log(state, `逻辑推理 —— ${placeLine}；${whoLine}`);
                setKillerInfo(state, '逻辑推理：两处相连地点', [placeLine, whoLine]);
                continueKillerQueue(state);
            }
            else {
                throw new Error('当前没有待确认的感知');
            }
            if (!hasPendingKillerChoice(state)) {
                flushDeferredPlayedCard(state);
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
            if (p.faction !== 'killer')
                throw new Error('仅杀手可猜测修理进度');
            if (state.rescueArmed)
                throw new Error('警车已出动，修理进度已锁定');
            const n = Math.max(0, Math.min(state.rules.repairNeeded, Math.floor(action.value)));
            state.killerRepairGuess = n;
            break;
        }
        case 'rematchReady': {
            if (state.phase !== 'gameOver')
                throw new Error('对局尚未结束');
            if (!state.rematchReady.includes(socketId))
                state.rematchReady.push(socketId);
            const seats = new Set(Object.values(state.players)
                .filter((pl) => pl.connected)
                .map((pl) => pl.controllerId));
            log(state, `${p.controllerName || p.name} 已准备再来一局。`);
            if (seats.size > 0 && [...seats].every((id) => state.rematchReady.includes(id))) {
                restartMatch(state, content);
            }
            break;
        }
        case 'chooseLurkTarget': {
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
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
                flushDeferredPlayedCard(state);
                state.pendingCardSpeed = null;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            break;
        }
        /**
         * ⚠ **迪伦·温「坚毅」没有"询问"这一步**（用户口径：「坚毅标记自动使用」）——
         * 它由 `effects.applyDamage` **自动生效**：第一次即将受伤时直接免伤
         * （任何伤害都算，包括遭遇里的），战报是
         * 「X 的坚毅标记自动生效，防止了这次伤害。」
         *
         * 这里原来有一整套 `confirmResilience`（"要不要用坚毅标记"）的询问流程，
         * 但**全项目没有任何地方会挂出 `pendingResilience`** —— 是死代码，
         * 而且和"自动使用"的口径相反（万一被挂出来就会变成"问一句"）。
         * 所以连同状态字段、动作、快照字段、界面面板一起删掉了。
         */
        /**
         * 欧菲莉亚「第六感」：选 1 张留下，另 1 张放回搜索牌库顶。
         * 放回的那张不会触发警报。
         */
        case 'resolveSixthSense': {
            const pend = state.pendingSixthSense;
            if (!pend)
                throw new Error('当前没有第六感待选');
            if (pend.playerId !== playerId)
                throw new Error('只能由发动搜索的幸存者选择');
            const searcherId = pend.playerId;
            resolveSixthSense(state, action.cardId);
            /**
             * 选完之后**才**收尾那次搜索的小回合
             * （搜索时因为挂了第六感待选而没推进）。
             */
            const searcher = state.players[searcherId];
            if (searcher?.alive && state.phase === 'survivorMain') {
                /**
                 * ⚠ **洞察之球那一路**：一次特殊行动要搜两次，第一次挂了第六感 ——
                 * 选完这里把**剩下的搜索**接着跑完（跑完它自己会推进小回合）。
                 */
                if ((state.pendingInsightSearches ?? 0) > 0)
                    runInsightOrbSearch(state, searcherId);
                else
                    advanceAfterSurvivor(state, searcher.id);
            }
            break;
        }
        case 'pickEncounterTarget': {
            if (state.phase !== 'encounter' || !state.encounter)
                throw new Error('当前不在遭遇中');
            if (state.encounterOpenHold)
                throw new Error('开战效果还没结算完');
            if (state.encounter.step !== 'pick')
                throw new Error('当前不是选择遭遇对象');
            const enc = state.encounter;
            const target = state.players[action.targetPlayerId];
            if (!target?.alive || target.faction !== 'survivor' || target.roomId !== enc.roomId) {
                throw new Error('只能选择本次遭遇地点的幸存者');
            }
            if (target.id in enc.defenses)
                throw new Error('该幸存者已经在这次遭遇中受过伤害');
            enc.targetId = target.id;
            enc.defenseOptions = { ...enc.defenseOptions, [target.id]: [] };
            resetEncounterAttackChoice(state);
            enc.step = 'attack';
            log(state, `遭遇对象定为 ${target.name}。攻击前选择是否加攻。`);
            break;
        }
        case 'relocateBlockade': {
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            removeBoardBlockade(state, action.fromDoorId);
            resumeAfterKillerChoice(state);
            if (state.phase === 'upkeep')
                maybeCloseKillerUpkeep(state);
            break;
        }
        // —— 雕像杀手（killer6）——
        case 'chooseMainStatue': {
            /**
             * 开局准备：雕像杀手**先选一尊**当主雕像 —— 用户要求"选择要确认"，
             * 所以这里只记在 `pendingStatueSwitch` 里，
             * 点「确认主雕像」(`confirmMainStatue`) 才真正生效并开始第 1 回合。
             */
            if (state.phase !== 'statueSetup')
                throw new Error('当前不是选择主雕像的准备阶段');
            if (!isStatueKiller(state))
                throw new Error('当前杀手不是雕像');
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (state.statueMainLocked === true)
                throw new Error('主雕像已经选定，本局不能再改');
            const target = state.players[action.statueId];
            if (!target || target.statueIndex == null)
                throw new Error('不是有效的雕像');
            state.pendingStatueSwitch = target.id;
            log(
                state,
                `开局准备：已选雕像 ${target.statueIndex}（${roomName(state, target.roomId)}），点「确认主雕像」后生效。`,
                'killer',
            );
            break;
        }
        case 'pickMainStatue': {
            if (!isStatueKiller(state))
                throw new Error('当前杀手不是雕像');
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            /**
             * 主雕像在开局准备时选定后**本局不能随便改**。
             * 但有两个**规则允许**的例外：
             *  - 打出「重整旗鼓」后（`pendingStatueRally`）—— 卡牌效果
             *  - 进化等级 1「每当你升级时，你都可以转换主雕像」
             *    （那条走 `pickStatueEvoSwitch`，不经过这里）
             * 所以这里只放行「重整旗鼓」，其余一律拒绝。
             */
            if (state.statueMainLocked === true && !state.pendingStatueRally)
                throw new Error('主雕像已在开局选定；只有「重整旗鼓」或升级时才能转换');
            const target = state.players[action.statueId];
            if (!target || target.statueIndex == null)
                throw new Error('不是有效的雕像');
            if (target.id === state.killerId)
                throw new Error('它已经是主雕像');
            state.pendingStatueSwitch = action.statueId;
            log(state, `已选中雕像 ${target.statueIndex}（${roomName(state, target.roomId)}）作为新的主雕像，确认后生效。`, 'killer');
            break;
        }
        case 'cancelMainStatue': {
            state.pendingStatueSwitch = null;
            log(state, '已取消切换主雕像。', 'killer');
            break;
        }
        case 'confirmMainStatue': {
            if (!isStatueKiller(state))
                throw new Error('当前杀手不是雕像');
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const toId = state.pendingStatueSwitch;
            if (!toId)
                throw new Error('还没有选择要切换的雕像');
            const toPiece = state.players[toId];
            if (!toPiece)
                throw new Error('雕像不存在');
            /**
             * **开局准备阶段**：这是"确认主雕像"，确认后本局不能再手动改，
             * 并继续走准备流程（女猎手陷阱 → 第 1 回合）。
             */
            if (state.phase === 'statueSetup') {
                if (toId !== state.killerId)
                    switchMainStatue(state, toId);
                state.statueMainLocked = true;
                state.pendingStatueSwitch = null;
                log(
                    state,
                    `开局准备：主雕像选定为雕像 ${toPiece.statueIndex}（${roomName(state, toPiece.roomId)}）。本局不再更改。`,
                    'all',
                    true,
                );
                startRound(state);
                break;
            }
            const fromIndex = state.players[state.killerId ?? '']?.statueIndex ?? 0;
            const ok = switchMainStatue(state, toId);
            state.pendingStatueSwitch = null;
            if (ok) {
                /**
                 * ⚠ **不给幸存者写战报** —— 用户要求
                 * 「是否切换主雕像不能写在幸存者战报里」。
                 */
                log(state, `主雕像已切换为雕像 ${toPiece.statueIndex}。`, 'killer');
                /**
                 * 重整旗鼓：一旦切换了主雕像，就必须移动一个封堵。
                 * 没有封堵就跳过这一步。
                 */
                if (state.pendingStatueRally) {
                    state.pendingStatueRallySwitched = true;
                    if ((state.blockades ?? []).length > 0) {
                        state.pendingStatueRallyMoveBlockade = true;
                        log(state, '重整旗鼓：请选择场上的一个封堵标记来移动。', 'killer');
                    }
                    else {
                        state.pendingStatueRally = false;
                        log(state, '重整旗鼓：场上没有封堵，移动封堵跳过。', 'killer');
                    }
                }
                log(state, `（主雕像从 ${fromIndex} 号变为 ${toPiece.statueIndex} 号）`, 'killer');
            }
            else {
                log(state, '已经是主雕像，无需切换。', 'killer');
            }
            break;
        }
        /**
         * 【重整旗鼓】**这次不切换主雕像**。
         *
         * 卡面写的是「你**可以**切换主雕像」，所以必须有"不切换"这条路
         * （用户口径：「不切换 = 重整旗鼓到此结束，只留抽的那 1 张牌，不需要移封堵」）。
         * 以前只有"选一尊 → 确认"，没有"不切换"，玩家被卡在这一步。
         */
        case 'skipStatueRallySwitch': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (!state.pendingStatueRally)
                throw new Error('当前没有重整旗鼓要处理');
            state.pendingStatueRally = false;
            state.pendingStatueRallySwitched = false;
            state.pendingStatueSwitch = null;
            state.pendingStatueRallyMoveBlockade = false;
            log(state, '重整旗鼓：不切换主雕像（只抽了 1 张牌）。', 'killer');
            break;
        }
        case 'pickMoveBlockade': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            /** 只有"重整旗鼓·切了主雕像"那一步才允许搬封堵 */
            if (!state.pendingStatueRallyMoveBlockade)
                throw new Error('当前不是"重整旗鼓：移动封堵"这一步');
            state.pendingStatueMovedBlockadeFrom = action.doorId;
            log(state, '已选中要移动的封堵，请再点一扇没有封堵的门来放置它。', 'killer');
            break;
        }
        case 'placeMovedBlockade': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            if (!state.pendingStatueRallyMoveBlockade)
                throw new Error('当前不是"重整旗鼓：移动封堵"这一步');
            const from = state.pendingStatueMovedBlockadeFrom;
            if (!from)
                throw new Error('还没有选择要移动的封堵');
            moveBlockadeTo(state, from, action.toDoorId);
            state.pendingStatueMovedBlockadeFrom = null;
            state.pendingStatueRallyMoveBlockade = false;
            state.pendingStatueRally = false;
            log(state, '重整旗鼓：封堵已移动。', 'killer');
            break;
        }
        case 'haltStatue': {
            const actorId = action.actorPlayerId ?? playerId;
            const actor = state.players[actorId];
            if (!actor || actor.faction !== 'survivor')
                throw new Error('仅幸存者可停滞雕像');
            const target = state.players[action.statueId];
            if (!target || target.statueIndex == null)
                throw new Error('不是有效的雕像');
            /**
             * **必须与雕像在同一地点**才能停滞它 ——
             * 隔着半个地图去停滞某个雕像没有道理。
             */
            if (!actor.roomId || actor.roomId !== target.roomId) {
                throw new Error('只能停滞与你**在同一地点**的雕像');
            }
            if (target.statueHalted)
                throw new Error('这个雕像本回合已经被停滞了');
            /**
             * 停滞是雕像特殊规则里的**幸存者特殊行动**，边界是**大回合**：
             * 该幸存者本大回合必须还没做过任何行动 ——
             * 一般行动（`mainActionUsed` / `searchedThisTurn` / `repairedThisTurn`）
             * **以及额外行动与交换物品**（`extraActionUsedThisTurn` / `tradedThisTurn`）都算。
             *
             * 做完停滞后该幸存者本大回合也不能再做任何额外行动 / 交换
             * —— 靠 `haltedThisRound` 拦住。
             * 发现阶段仍然可以选他翻牌（发现不算额外行动）。
             */
            if (actor.mainActionUsed ||
                actor.searchedThisTurn ||
                actor.repairedThisTurn ||
                actor.extraActionUsedThisTurn ||
                actor.tradedThisTurn ||
                actor.haltedThisRound) {
                throw new Error('本大回合已经做过其他行动（含额外行动、交换物品），不能再选择停滞雕像');
            }
            if (!survivorHasGeneralAction(state, actor.id)) {
                throw new Error('本大回合已经做过其他行动，不能再选择停滞雕像');
            }
            target.statueHalted = true;
            actor.actedThisRound = true;
            actor.actionsLeft = 0;
            actor.mainActionUsed = true;
            /** 停滞后本大回合不能再做额外行动 / 交换 */
            actor.haltedThisRound = true;
            /**
             * 停滞雕像：**遭遇外的幸存者行动 → 杀手只知道"哪里的哪个雕像被停滞"，
             * 不点名**（用户明确列举的现象之一）。
             */
            logSplit(
                state,
                `${actor.name} 停滞了雕像 ${target.statueIndex}。`,
                `雕像 ${target.statueIndex}（在「${roomName(state, target.roomId)}」）被停滞了。`,
            );
            /**
             * ⚠ **这里必须收尾**（用户报的「停滞雕像后直接卡住了」）。
             *
             * 停滞是"一般行动第 4 项：使用一个特殊行动"—— 它把
             * `mainActionUsed` 置上了，但**以前只 `break`**，没有把小回合推进：
             * 于是这名幸存者"已经行动过、又因为 `haltedThisRound` 做不了任何额外行动"，
             * 阶段永远停在他身上（界面显示"一般行动完成后该小回合已结束"，
             * 可什么也点不了）。其他特殊行动（言语鼓励 / 移除核心标记 / 洞察之球…）
             * 收尾时都调 `advanceAfterSurvivor`，这里以前漏了。
             */
            advanceAfterSurvivor(state, actor.id);
            break;
        }
        case 'guessMainStatue': {
            const actorId = action.actorPlayerId ?? playerId;
            const actor = state.players[actorId];
            if (!actor || actor.faction !== 'survivor')
                throw new Error('仅幸存者可猜测主雕像');
            /**
             * 【分头行动】逃脱/被杀的人**已经退出场上**（用户规则：各自结算、各管各的），
             * 所以不能再参与猜主雕像。
             */
            if (state.split && !actor.alive)
                throw new Error(`${actor.name} 已经不在场上，不能猜测主雕像`);
            const target = state.players[action.statueId];
            if (!target || target.statueIndex == null)
                throw new Error('不是有效的雕像');
            /**
             * ⚠ **按"操控者"记，不按棋子记**（用户要求）：
             *  - 单人 / 1对1：幸存者方只有 1 个操控者 → 三个棋子共用**一个**猜测
             *  - 1对2：两个操控者 → 各猜一个
             *  - 1对3 / 2对3：三人各控各的 → 各猜各的
             * 所以键用 `actor.controllerId`，同一操控者再猜就是**改自己的那一个**。
             */
            state.statueGuesses[actor.controllerId] = action.statueId;
            log(state, `${actor.name} 猜测雕像 ${target.statueIndex} 是主雕像。`, 'survivor');
            break;
        }
        case 'pickTrapKind': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可放置陷阱');
            const pp = state.pendingTrapPlacement;
            if (!pp || pp.done)
                throw new Error('当前不是放置陷阱的时间');
            if (trapRemaining(state, action.kind) <= 0) {
                throw new Error(`${TRAP_LABEL[action.kind]}已经放满了`);
            }
            pp.kind = action.kind;
            log(state, `已选中「${TRAP_LABEL[action.kind]}」，请点地图上的地点来放置（再点同一格可取消）。`, 'killer');
            break;
        }
        case 'placeHunterTrap': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可放置陷阱');
            placeHunterTrap(state, action.tokenId);
            break;
        }
        case 'confirmTrapPlacement': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可确认');
            confirmTrapPlacement(state);
            /** 开局准备步骤：布完陷阱才真正进入第 1 回合 */
            if (state.phase === 'trapSetup')
                startRound(state);
            break;
        }
        /**
         * 【女猎手】**重置陷阱放置**：确认之前可以把已点好的陷阱全清、重新选。
         */
        case 'resetTrapPlacement': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可重置');
            if (!resetTrapPlacement(state))
                throw new Error('现在没有正在进行的陷阱放置');
            break;
        }
        case 'chooseEffectOption': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可选择');
            const choice = state.pendingEffectChoice;
            if (!choice)
                throw new Error('当前没有要选的效果');
            const picked = choice.options[action.optionIndex];
            if (!picked)
                throw new Error('没有这个选项');
            state.pendingEffectChoice = null;
            const label = action.optionIndex === 0 ? '第一种' : `第 ${action.optionIndex + 1} 种`;
            log(state, `已选择${label}用法。`, 'killer');
            // 把选中的效果插到队首，继续结算
            state.pendingEffectQueue.unshift(...picked);
            continueKillerQueue(state);
            if (!hasPendingKillerChoice(state)) {
                flushDeferredPlayedCard(state);
                state.pendingCardSpeed = null;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            break;
        }
        case 'chooseMovePath': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可选择');
            chooseAutoMovePath(state, action.pathIndex);
            continueKillerQueue(state);
            flushDeferredPlayedCard(state);
            /** 和其它收尾保持一致：把这一张的速度标记清掉 */
            state.pendingCardSpeed = null;
            maybeStartEncounter(state);
            maybeFinishKillerMain(state);
            break;
        }
        /**
         * ⚠ 这里原来有 `case 'confirmKillerInfo'`（杀手点"知道了"确认打牌拿到的信息）。
         * 用户要求**删掉整套确认流程** —— 信息现在直接进地图右边的信息区
         * （`state.killerIntel`），不挡流程、不需要确认。
         */
        case 'confirmSenseRoom': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可确认感知');
            const { roomId: sensedRoom, witnessed } = confirmSenseRoom(state);
            /** 女王等级 2：感知目击 → 惊吓（这一条对所有〔感知〕都生效） */
            queenSenseFear(state, witnessed);
            /** 【变体1】感知命中 → 挂出可发动的特性卡（10/15/16） */
            offerSenseTraits(state, witnessed);
            /**
             * 只感知一个地点时，立绘已在 `confirmSenseRoom` 里挪到该地点。
             * 君臨天下目击到人之后，还要接着选一名按路径移动。
             */
            if (state.pendingSenseMoveAfter && witnessed.length) {
                state.pendingSenseMoveAfter = false;
                /** 目击到人 → 接着让杀手**选一名目击者移动**（0–2 步，路径由杀手选） */
                state.pendingMoveSurvivorPick = witnessed.map((w) => w.id);
                log(
                    state,
                    `君臨天下：目击了 ${witnessed.map((w) => w.name).join('、')}，请选其中 1 名移动 0–2 步。`,
                    'killer',
                );
                break;
            }
            /** 不是君臨天下（或缺省到没目击人）：照原流程收尾，**不动立绘** */
            state.pendingSenseMoveAfter = false;
            continueKillerQueue(state);
            if (!hasPendingKillerChoice(state)) {
                flushDeferredPlayedCard(state);
                state.pendingCardSpeed = null;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            break;
        }
        case 'pickMoveSurvivor': {
            assertActive(state, playerId);
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const cands = state.pendingMoveSurvivorPick;
            if (!cands?.length)
                throw new Error('当前没有待移动的目击者');
            if (!cands.includes(action.targetPlayerId))
                throw new Error('只能选刚被目击到的幸存者');
            const victim = state.players[action.targetPlayerId];
            if (!victim?.roomId)
                throw new Error('该幸存者不在图上');
            state.pendingMoveSurvivorPick = null;
            state.pendingMoveSurvivorId = victim.id;
            /** 路径草稿：由杀手一步步点（0–2 步） */
            state.pendingPathDraft = { min: 0, max: 2, rooms: [victim.roomId] };
            log(
                state,
                `请为「${victim.name}」规划移动路径（0–2 步）：点相邻地点，选好后在行动区确认。`,
                'killer',
            );
            break;
        }
        case 'pickTrackerTarget': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可选择');
            /**
             * ⚠ **必须还在"等选距离目标"**：遭遇一爆发（`interruptCurrentCardEffects`）
             * 或 02「玩弄猎物」取消遭遇时，`pendingTrackerPick` 就被清掉了 ——
             * 那时【追蹤】的后半段（展示距离）**作废**，不能靠一条迟到的动作又把它结算出来。
             */
            if (!state.pendingTrackerPick)
                throw new Error('追蹤：现在没有要展示的距离');
            resolveTrackerDistance(state, action.targetPlayerId);
            /**
             * **女猎手进化 4 级**：「**使用『追蹤』后**〔移動〕×0-1」（用户口径）。
             *
             * 触发卡是「追蹤」（`huntress_track_*`），不是「追逐」——
             * 而 `pickTrackerTarget` 只可能来自追蹤的 `searchTrackerDistance`，
             * 所以挂在这里正好。
             *
             * ⚠ 必须在下面那串 `continueKillerQueue` **之前**建草稿：队列要等它确认完。
             */
            huntressTrackerFollowupMove(state);
            continueKillerQueue(state);
            if (!hasPendingKillerChoice(state)) {
                flushDeferredPlayedCard(state);
                state.pendingCardSpeed = null;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            break;
        }
        case 'resolveOptionalEffect': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const pending = state.pendingOptionalEffect;
            if (!pending)
                throw new Error('当前没有可选效果要决定');
            state.pendingOptionalEffect = null;
            if (action.use) {
                log(state, `${pending.label}：已执行。`, 'killer');
                /** 「放牌库顶」：这张牌还没进弃牌堆，执行时改成放牌库顶 */
                if (pending.fx.op === 'returnToDeckTop' && state.pendingDeckTopCard) {
                    const cardId = state.pendingDeckTopCard;
                    state.pendingDeckTopCard = null;
                    state.pendingReturnToDeckTop = false;
                    state.killerDeck.unshift(cardId);
                    log(state, `把「${state.cardById[cardId]?.name ?? cardId}」背面向上放到摸牌堆顶。`, 'killer');
                }
                else {
                    runOptionalEffect(state, pending.fx);
                }
            }
            else {
                log(state, `${pending.label}：已跳过。`, 'killer');
                /** 跳过「放牌库顶」→ 这张牌进弃牌堆 */
                if (pending.fx.op === 'returnToDeckTop' && state.pendingDeckTopCard) {
                    const cardId = state.pendingDeckTopCard;
                    state.pendingDeckTopCard = null;
                    state.pendingReturnToDeckTop = false;
                    state.killerDiscard.push(cardId);
                    log(state, `「${state.cardById[cardId]?.name ?? cardId}」进入弃牌堆。`, 'killer');
                }
            }
            if (hasPendingKillerChoice(state))
                break;
            state.pendingCardSpeed = null;
            maybeStartEncounter(state);
            maybeFinishKillerMain(state);
            break;
        }
        case 'resolveDeckTop': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const cardId = state.pendingDeckTopCard;
            if (!cardId)
                throw new Error('当前没有待处理的牌库顶选择');
            state.pendingDeckTopCard = null;
            state.pendingReturnToDeckTop = false;
            const card = state.cardById[cardId];
            if (action.toDeckTop) {
                /** 背面向上放到摸牌堆顶：下次摸牌的第一张就是它 */
                state.killerDeck.unshift(cardId);
                log(state, `刺耳噪声：把它背面向上放到摸牌堆顶。`, 'killer');
            }
            else {
                state.killerDiscard.push(cardId);
                log(state, `刺耳噪声：不放到牌库顶，「${card?.name ?? cardId}」进入弃牌堆。`, 'killer');
            }
            continueKillerQueue(state);
            if (!hasPendingKillerChoice(state)) {
                flushDeferredPlayedCard(state);
                state.pendingCardSpeed = null;
                maybeStartEncounter(state);
                maybeFinishKillerMain(state);
            }
            break;
        }
        case 'pickUnlockChoice': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const pool = state.pendingUnlockChoice;
            if (!pool)
                throw new Error('当前不需要选择解锁牌');
            if (!pool.includes(action.cardId))
                throw new Error('这张牌不在候选里');
            const card = state.cardById[action.cardId];
            /**
             * ⚠ **二选一：选中的进手牌，另一张（同组其它张）永久作废。**
             *
             * 用户口径：「未命名 3 级**只有解锁的锁定牌加入手牌，另一张不加入**」。
             *
             * 以前这里只把选中的那张拿走、另一张**留在锁定区**，而
             * `settleEvolutionForCurrentKiller` 里有一句"二选一里只剩一张的组 →
             * 直接入手"（本意是给"候选本来就只有一张"的组兜底）——
             * 于是另一张在结算时**又被塞进手牌**（两张全到手）。
             * 现在把同组其它张直接从锁定区移除，那句兜底就再也看不到它们了。
             */
            const group = card?.unlockChoice;
            const sameGroup = group
                ? state.killerLocked.filter((x) => x !== action.cardId && state.cardById[x]?.unlockChoice === group)
                : [];
            state.killerLocked = state.killerLocked.filter(
                (x) => x !== action.cardId && !sameGroup.includes(x),
            );
            state.killerHand.push(action.cardId);
            if (sameGroup.length) {
                state.abandonedLockedCards = [
                    ...(state.abandonedLockedCards ?? []),
                    ...sameGroup,
                ];
                log(
                    state,
                    `二选一：${sameGroup.map((id) => `「${state.cardById[id]?.name ?? id}」`).join('、')}` +
                        ` 不再解锁，本局作废（不会加入手牌）。`,
                    'all',
                    true,
                );
            }
            state.pendingUnlockChoice = null;
            log(state, `解锁「${card?.name ?? action.cardId}」加入手牌。`, 'all', true);
            const max2 = state.rules.killerHandMax ?? 5;
            if (state.killerHand.length > max2) {
                state.pendingUnlockDiscard = true;
                state.pendingKillerDiscards = state.killerHand.length - max2;
                state.justUnlockedCards = [action.cardId];
                log(state, `进化入手牌后手牌超过 ${max2}，请自选弃置 ${state.pendingKillerDiscards} 张。`, 'killer');
            }
            /** 这一项选完了 → 问下一项，或做实际结算 */
            advanceEvolutionAfterChoice(state);
            break;
        }
        case 'pickEvolutionCard': {
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            const pool = state.pendingEvolutionCardPick;
            if (!pool)
                throw new Error('当前不需要选择进化卡牌');
            if (!pool.includes(action.cardId))
                throw new Error('这张进化卡牌不在候选里');
            const card = content.cards.byId[action.cardId];
            if (!card)
                throw new Error('未知进化卡牌');
            state.chosenEvolutionCards = [...(state.chosenEvolutionCards ?? []), action.cardId];
            state.pendingEvolutionCardPick = null;
            log(state, `未命名获得进化卡牌「${card.name}」：${card.text}`, 'all', true);
            /** 立刻结算这张进化卡牌的被动 / 效果 */
            applyEvolutionCard(state, action.cardId);
            /** 这一项选完了 → 问下一项，或做实际结算 */
            advanceEvolutionAfterChoice(state);
            break;
        }
        case 'pickStatueEvoSwitch': {
            if (!state.pendingStatueEvoSwitch)
                throw new Error('当前不需要决定主雕像切换');
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            /**
             * **只记下选择，不立刻切换**（用户要求"选择要确认"）：
             * 真正的切换在「确认新效果」（`ackEvolution` → `resolveDeferredEvolution`）
             * 时一并执行。这样"选主雕像"和"确认进化"是两步，不会点错就生效。
             */
            const target = state.players[action.statueId];
            if (!target || target.statueIndex == null)
                throw new Error('请选择一尊雕像');
            /**
             * ⚠ **当前主雕像不能选**（用户口径：
             * 「雕像的进化切换主雕像不能选当前的主雕像转换」）。
             *
             * 和另外两处（开局准备 `pickMainStatue` / 重整旗鼓）同一条口径：
             * 切换必须换成**另一尊**。以前这里把它当成"视为不切换"悄悄放过去，
             * 玩家点了却没反应、也看不出发生了什么。
             */
            if (target.id === state.killerId)
                throw new Error('它已经是主雕像 —— 切换要选另一尊（不想换就按「不转换」）');
            state.pendingStatueEvoTarget = target.id;
            /** 选择已经做出了 → 关掉"还没决定"的闸门（真正的切换等结算） */
            state.pendingStatueEvoSwitch = false;
            log(
                state,
                `雕像 1 级：已选 ${target.statueIndex} 号（${roomName(state, target.roomId)}）。`,
                'killer',
            );
            advanceEvolutionAfterChoice(state);
            break;
        }
        case 'skipStatueEvoSwitch': {
            if (!state.pendingStatueEvoSwitch)
                throw new Error('当前不需要决定主雕像切换');
            if (p.faction !== 'killer')
                throw new Error('仅杀手可执行');
            state.pendingStatueEvoSwitch = false;
            state.pendingStatueEvoTarget = null;
            log(state, '雕像 1 级：选择不转换主雕像。', 'killer');
            advanceEvolutionAfterChoice(state);
            break;
        }
        case 'openChest': {
            const actor = state.players[action.actorPlayerId ?? playerId];
            if (!actor || actor.faction !== 'survivor')
                throw new Error('仅幸存者可开宝箱');
            if (!controlsPiece(state, socketId, actor))
                throw new Error('无权操作该幸存者');
            /**
             * ⚠ **开宝箱是「额外行动」**（用户口径：
             * 「开宝箱算作额外行动」）。
             *
             * 所以：
             *  - **不查** `assertActive` / `mainActionUsed` —— 额外行动"不受小回合限制"，
             *    做完一般行动、甚至小回合结束了也能开（和 `placeLeverGate` 同口径）；
             *  - 但**停滞过就不能开**（停滞吃掉本大回合的全部额外行动）；
             *  - 开了要记 `extraActionUsedThisTurn` —— 「停滞雕像」那一步会看这个标记
             *     （它要求"本大回合还没做过任何行动，含额外行动"）。
             *
             * 界面上它现在只出现在左上角那颗「额外行动」弹窗里，
             * **不再**在行动区单独放一颗按钮。
             */
            if (actor.haltedThisRound)
                throw new Error('本大回合已经执行过停滞，不能再做额外行动');
            const roomId = state.treasureChests[action.chestId];
            if (!roomId)
                throw new Error('这个宝箱已经开过了');
            if (actor.roomId !== roomId)
                throw new Error('必须在自己所在地点开宝箱');
            actor.extraActionUsedThisTurn = true;
            const cardId = openChest(state, action.chestId);
            if (cardId) {
                // 宝藏牌算物品、占背包格：走正常的牌面效果结算（gainItem）
                const card = state.cardById[cardId];
                if (card)
                    runEffects({ state, actorId: actor.id, effects: card.effects });
            }
            break;
        }
        case 'removeBoardBlockade': {
            /** ⚠ 同 `discardKillerCard`：豁免要认清"这根网线是否真的在操作杀手" */
            if (p.faction !== 'killer' &&
                !(isSharedSurvivorMode(state) && state.killerId &&
                    controlsPiece(state, socketId, state.players[state.killerId]))) {
                throw new Error('仅杀手可移除场上封堵');
            }
            removeBoardBlockade(state, action.doorId);
            resumeAfterKillerChoice(state);
            if (state.phase === 'upkeep')
                maybeCloseKillerUpkeep(state);
            break;
        }
        case 'ackEvolution': {
            if (!state.pendingEvolutionAck)
                throw new Error('当前没有待确认的进化');
            /**
             * ⚠ **这里不再要求"先选好卡牌 / 先决定主雕像"** —— 那些选择
             * 现在排在**确认之后**（用户口径：它们本身就是执行进化效果）。
             * 见下面的 ②③④ 顺序注释。
             */
            const ack = state.pendingEvolutionAck;
            const kind = killerKindOf(state);
            const texts = kind
                ? EVOLUTION_TEXT[kind].slice(ack.fromLevel, ack.toLevel).map((t, i) => `${ack.fromLevel + i + 1} 级：${t}`)
                : [];
            log(state, `已确认进化效果：${texts.join('；') || `等级 ${ack.toLevel}`}。`);
            /**
             * ⚠ **记下"已经确认过了"**：④ 步里如果还挂着选择（转主雕像 / 女王点地点…），
             * `pendingEvolutionAck` 会一直留到 `settleConfirmedEvolution` 末尾 ——
             * 界面靠这个字段把那颗「确认新效果」按钮**收起来**
             * （否则玩家再点一次 = 这一级结算两遍：力量 +2 会加两次）。
             */
            ack.acked = true;
            /**
             * ⚠ **2对3：确认之后由 `settleConfirmedEvolution` 统一收尾**
             * （先结算完**自己**这一份，再切给另一名杀手确认）。
             *
             * 这里**绝不能提前 `break` 去切人** —— 那样当前这名杀手的
             * 力量 / 入场 / 弃牌都还没结算就换人了（丢效果）。
             */
            /**
             * ⚠ **顺序（用户口径）**：
             *   ① 确认进化效果（就是这一步）
             *   ② **双方坍塌结算**（墓穴地图）
             *   ③ 变体1 里与进化有关的特性
             *   ④ **执行进化效果**：力量 / 选卡 / 选牌 / 选主雕像 / 选地点 / 入场 / 弃牌
             *
             * 以前是反的：`runUpgrade` 在确认**之前**就把"选进化卡""二选一解锁"
             * 挂了出来，而坍塌又插在确认之前 —— 于是"选卡（=执行进化效果）"
             * 跑到"确认"前面去了。
             *
             * ② 的坍塌：`interceptEvolutionForCollapse` 只记下了
             * `pendingCollapseAfterEvolution`，到这里才真正开塌。
             * 本 handler 已经跑完（升级挂好了确认面板），所以可以安全地再推一次升级。
             */
            if (state.pendingCollapseAfterEvolution) {
                /**
                 * ⚠ **这里不要再调 `runUpgrade`**：确认面板早就挂好了
                 * （`setUpgradeHandler` 在被拦下后自己补跑过一次），
                 * 再调一次就会**连升两级**。
                 * 只做"把这次坍塌结掉"这一件事。
                 */
                const levelForCollapse = state.pendingCollapseLevel;
                state.pendingCollapseAfterEvolution = false;
                const savedConsumed = state.collapseConsumedForLevel ?? 0;
                state.collapseConsumedForLevel = levelForCollapse;
                /**
                 * ⚠ `beginCollapse` 只认 `pendingCollapse`（它是"正要塌"的闸门）。
                 * 我们把拦截推迟到了确认之后，所以这里要**自己把它立起来**，
                 * 否则 `beginCollapse` 会直接返回 null、什么都不塌
                 * （这个坑就是 `_probe-collapse` 抓出来的）。
                 */
                state.pendingCollapse = true;
                const collapsedTo = beginCollapse(state);
                if (collapsedTo)
                    log(state, `墓穴坍塌：「${roomName(state, collapsedTo)}」塌了。`, 'all', true);
                state.collapseConsumedForLevel = savedConsumed;
                /**
                 * ⚠ **坍塌有人要"轮流走一步"时就此打住**（用户口径：
                 * 「坍塌结算后才执行进化效果」）—— 等他们全走完，
                 * 由 `setCollapseDoneHandler` 接着推进化流程。
                 *
                 * 以前不管这个就直接往下挂"选进化卡"，于是**两个待办同时挂着**：
                 * 一边在问幸存者移动、一边弹出进化选卡（用户报的截图就是这个）。
                 */
                if (collapseStillResolving(state)) {
                    log(state, '坍塌还没处理完，进化效果等大家走完再继续。', 'killer');
                    break;
                }
            }
            /**
             * ③ **进化相关的特性卡**（只有开了变体1才有；函数自己会判）。
             * 17 要选惊吓目标、18 要点地图选门 —— 有这类选择就先停下，
             * 选完由 `advanceEvolutionAfterChoice` 接着走。
             */
            if (evolutionTraitStage(state, state.killerLevel))
                break;
            /**
             * ④ 挂出这一级"要你选的东西"；有东西要选就先停下，
             * 选完由 `advanceEvolutionAfterChoice` 接着走。
             */
            if (advanceEvolutionChoices(state))
                break;
            settleConfirmedEvolution(state);
            break;
        }
        case 'confirmWhizSearch': {
            const found = resolveWhizSearch(state, true, action.payCardIds ?? []);
            if (found)
                maybeStartEncounter(state);
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
            if (state.phase === 'gameOver')
                break;
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
            /**
             * 【变体1】开局的「阴险圈套」封堵：**全部封完就直接回到开局流程**。
             *
             * ⚠ 不能落到下面的 `resumeAfterKillerChoice` / `maybeCloseKillerUpkeep` ——
             * 那会把这一次当成杀手回合收尾（多抽牌、还会推进到另一名杀手）。
             * 回到 `startRound` 之后，"14 升级"那道闸门（`pendingTraitBlockades <= 0`）
             * 就会放行，接着走确认进化 → 结算 2 级。
             */
            if (state.pendingTraitSetupResume && !state.pendingBlockadeJob) {
                state.pendingTraitSetupResume = false;
                startRound(state);
                break;
            }
            resumeAfterKillerChoice(state);
            /**
             * 特性 18「狡诈猎手」的封堵是**进化流程里的一步**：
             * 封完（18 只封 1 扇，`pendingBlockadeJob` 已清）就回去继续进化
             * （选锁定牌 / 选进化卡 / 结算）。
             */
            if (!state.pendingBlockadeJob)
                advanceEvolutionAfterChoice(state);
            if (state.phase === 'upkeep')
                maybeCloseKillerUpkeep(state);
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
    } finally {
        /** 不管成功还是抛错，都把顶层字段存回当前杀手的切片，避免两份状态漂移 */
        syncActiveKiller(state);
    }
}

/** 把服务器心里的完整棋子，裁成“这个观众能看的版本”（杀手看不到别人背包） */
export function toPublicPlayer(state: GameState, p: PlayerState, viewerFaction: Faction, viewerPieceId: string | null) {
    const inEncounter = Boolean(state.encounter) && p.roomId != null && p.roomId === state.encounter?.roomId;
    const killerFog = viewerFaction === 'killer' &&
        (state.phase === 'survivorMain' || state.phase === 'discovery');
    /**
     * 【分头行动】**已经逃脱 / 被杀**的幸存者：位置**双方都照常下发** ——
     * 用户要求「双方地图上显示他的立绘真实位置且立绘变暗」，
     * 所以不能拿战争迷雾把他们藏起来。
     */
    const splitDowned = state.split && p.faction === 'survivor' && !p.alive;
    const hideSurvivorPos = !splitDowned &&
        viewerFaction === 'killer' &&
        p.faction === 'survivor' &&
        !inEncounter &&
        (killerFog ||
            (!state.rules.killerSeesSurvivorPositions && !p.exposed));
    const hideKillerPos = (!state.rules.survivorSeesKillerPosition || p.stealth) &&
        viewerFaction === 'survivor' &&
        p.faction === 'killer' &&
        !inEncounter;
    let roomId = p.roomId;
    if (hideSurvivorPos && p.id !== viewerPieceId)
        roomId = null;
    if (hideKillerPos && p.id !== viewerPieceId)
        roomId = null;
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
        handCount:
            viewerFaction === 'survivor' && state.mode !== 'solo' && p.faction === 'killer'
                ? 0
                : p.hand.length,
        items: viewerFaction === 'killer' && p.faction === 'survivor' ? {} : { ...p.items },
        inventorySlots: inventorySlotsFor(state, p.id),
        alive: p.alive,
        /** 【分头行动】是否"单独逃脱"（而不是被杀）—— 立绘都变暗，但文案不同 */
        escaped: Boolean(p.escaped),
        /**
         * 【分头行动】**倒在这儿了**（逃脱或被杀）：立绘要**留在原地并变暗**。
         * 只有分头行动会下发 true；别的模式死人照旧不画立绘。
         */
        downed: splitDowned,
        /**
         * 【分头行动】他身上还剩几把钥匙（同地点的人可以从遗留物里拿）。
         *
         * ⚠ **绝对不能让杀手看到**（用户规则：找到钥匙**不报告杀手**）——
         * 所以和 `items` 一样按视角屏蔽；幸存者那侧另有 `splitKeys`。
         */
        keys: state.split && viewerFaction !== 'killer' ? p.keys ?? 0 : 0,
        /**
         * 【变体1】这名棋子已选的特性卡（**按视角过滤**）：
         *  - 杀手特性：双方都看得到（要展示给幸存者）；
         *  - 幸存者特性：只有幸存者视角看得到（同伴互相可见），杀手看不到。
         */
        traits: state.variant1
            ? (state.traits?.[p.id] ?? []).filter((id) => {
                const def = traitDef(state, id);
                if (!def) return false;
                return def.faction === 'killer' || viewerFaction !== 'killer';
            })
            : [],
        stealth: p.faction === 'killer' ? p.stealth : false,
        moveLeft: p.moveLeft,
        actionsLeft: p.faction === 'killer' ? state.killerMainActionsLeft : p.actionsLeft,
        mainActionUsed: p.mainActionUsed,
        actedThisRound: p.actedThisRound,
        /**
         * 「本大回合做过额外行动 / 停滞」。
         *
         * 额外行动**不受小回合限制**（谁都能在自己小回合做完之后再做），
         * 所以"额外行动"弹窗要按**每个人自己**的这些标记决定还能不能做 ——
         * 只下发给自己一方（杀手不关心，也不该看到幸存者的行动细节）。
         */
        extraActionUsedThisTurn:
            viewerFaction === 'killer' ? false : Boolean(p.extraActionUsedThisTurn),
        haltedThisRound: viewerFaction === 'killer' ? false : Boolean(p.haltedThisRound),
        /** 迪伦「机械知识」本大回合用没用过 */
        mechanicalKnackUsedThisTurn:
            viewerFaction === 'killer' ? false : Boolean(p.mechanicalKnackUsedThisTurn),
        /**
         * 幸存者身上的标记（画在装备卡的人物身体上）。
         * **杀手看不到谁有标记**（鼓励标记是「只有幸存者一方知道」；
         * 坚毅标记则本来就是迪伦自己的私密标记）。
         */
        hasEncourageToken: viewerFaction === 'killer' ? false : Boolean(p.encourageToken),
        hasResilienceToken: viewerFaction === 'killer' ? false : Boolean(p.resilienceToken),
        /** 2对3：先后手偏好是公开信息（两人要互相看到才能商量） */
        orderPick: p.orderPick ?? null,
        /** 雕像棋子：右键菜单要按编号逐尊列出来 */
        statueIndex: p.statueIndex ?? null,
    };
}

/**
 * 这个操控者现在应该以哪颗棋子的身份看界面
 */
export function resolveYouForController(state: GameState, controllerId: string) {
    /**
     * **墓穴坍塌**：屋里的人轮流走一步。
     * 这必须排在所有其它判定**前面** —— 因为坍塌是"升级的最第一时间"触发的，
     * 哪怕这时候还停在别的等待里（等确认进化、等弃牌……），也先让人走。
     */
    const collapseMover = collapseMoverFor(state, controllerId);
    if (collapseMover)
        return collapseMover;
    if (state.pendingEvolutionAck ||
        state.pendingOverFearWound ||
        state.pendingWhizSearch ||
        state.pendingBlockadeJob) {
        const k = state.killerId ? state.players[state.killerId] : null;
        if (k && (k.controllerId === controllerId || (state.mode === 'solo' && controllerId === state.hostId))) {
            return k;
        }
    }
    if (state.pendingAmulet) {
        const ap = state.players[state.pendingAmulet.playerId];
        if (ap && ap.controllerId === controllerId)
            return ap;
        if (state.mode === 'solo' && controllerId === state.hostId && ap)
            return ap;
    }
    if (state.pendingItemDiscard) {
        const dp = state.players[state.pendingItemDiscard.playerId];
        if (dp && dp.controllerId === controllerId)
            return dp;
        if (state.mode === 'solo' && controllerId === state.hostId && dp)
            return dp;
    }
    if (state.phase === 'encounter' && state.encounter) {
        if (state.encounter.step === 'pick' || state.encounter.step === 'defend') {
            const tid = state.encounter.step === 'defend'
                ? state.encounter.targetId
                : remainingEncounterTargets(state).find((p) => p.controllerId === controllerId)?.id;
            if (tid && state.players[tid]?.controllerId === controllerId)
                return state.players[tid];
            if (state.mode === 'solo' && controllerId === state.hostId) {
                const sid = state.encounter.targetId ??
                    remainingEncounterTargets(state)[0]?.id;
                if (sid && state.players[sid])
                    return state.players[sid];
            }
        }
    }
    if (state.players[controllerId])
        return state.players[controllerId];
    const mine = Object.values(state.players).filter((p) => controlsPiece(state, controllerId, p));
    if (!mine.length)
        return null;
    if (isSharedSurvivorMode(state) &&
        state.phase === 'survivorMain' &&
        state.pendingSurvivorPick) {
        const pick = mine.find((p) => p.faction === 'survivor' && p.alive && !p.actedThisRound) ??
            mine.find((p) => p.faction === 'survivor');
        if (pick)
            return pick;
    }
    if (state.phase === 'discovery' && state.pendingDiscoveryPick) {
        const pick = mine.find((p) => p.faction === 'survivor' && p.alive);
        if (pick)
            return pick;
    }
    const active = activePlayerId(state);
    if (active && controlsPiece(state, controllerId, state.players[active])) {
        return state.players[active];
    }
    return mine[0] ?? null;
}

/** 把牌编号翻译成“编号 + 中文名”，给牌堆检视用 */
export function namedCards(state: GameState, ids: string[]) {
    return ids.map((id) => ({
        id,
        name: state.cardById[id]?.name ?? itemName(id),
    }));
}

export function namedCardsSorted(state: GameState, ids: string[]) {
    return namedCards(state, ids).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export function namedCardsNewestFirst(state: GameState, ids: string[]) {
    return namedCards(state, [...ids].reverse());
}

export function namedTop(state: GameState, ids: string[]) {
    const id = ids[0];
    if (!id)
        return null;
    return namedCards(state, [id])[0] ?? null;
}

/** 这个操控者现在能不能点行动按钮 */
export function isControllerActive(state: GameState, controllerId: string) {
    /**
     * **墓穴坍塌收尾**：只有"轮到离开废墟"的那个人能动。
     * 这要排在最前面 —— 坍塌期间别人全都被冻住。
     */
    if (state.pendingCollapseMoves) {
        return Boolean(collapseMoverFor(state, controllerId));
    }
    if (state.pendingEvolutionAck ||
        state.pendingOverFearWound ||
        state.pendingWhizSearch ||
        state.pendingBlockadeJob) {
        const kid = state.killerId ? state.players[state.killerId] : null;
        return Boolean(kid &&
            (kid.controllerId === controllerId ||
                (state.mode === 'solo' && controllerId === state.hostId)));
    }
    if (state.pendingAmulet) {
        const ap = state.players[state.pendingAmulet.playerId];
        return Boolean(ap &&
            (ap.controllerId === controllerId ||
                (state.mode === 'solo' && controllerId === state.hostId)));
    }
    const activeId = activePlayerId(state);
    if (activeId && controlsPiece(state, controllerId, state.players[activeId]))
        return true;
    if (isSharedSurvivorMode(state) &&
        state.phase === 'survivorMain' &&
        state.pendingSurvivorPick) {
        return Object.values(state.players).some((pl) => controlsPiece(state, controllerId, pl) && pl.faction === 'survivor' && pl.alive);
    }
    if (state.phase === 'encounter' && state.encounter?.step === 'pick') {
        return survivorsInRoom(state, state.encounter.roomId).some((pl) => controlsPiece(state, controllerId, pl)) || (state.mode === 'solo' && controllerId === state.hostId);
    }
    if (state.phase === 'encounter' && state.encounter?.step === 'defend') {
        return pendingDefenseSurvivorIds(state).some((id) => controlsPiece(state, controllerId, state.players[id]));
    }
    if (state.phase === 'discovery') {
        const isSurvivor = isSurvivorOperator(state, controllerId) ||
            Object.values(state.players).some((p) => p.controllerId === controllerId && p.faction === 'survivor');
        if (state.pendingDiscoveryPick)
            return isSurvivor || (state.mode === 'solo' && controllerId === state.hostId);
        if (state.mode === 'solo' && controllerId === state.hostId)
            return true;
        const sid = state.discoveryActorId ?? firstAliveSurvivorId(state);
        if (sid && controlsPiece(state, controllerId, state.players[sid]))
            return true;
    }
    return false;
}

/** 给某个人做一份局面快照：幸存者多看到修理和物品，杀手多看到手牌和潜行位置 */
export function buildSnapshot(state: GameState, controllerId: string): PublicSnapshot
{
    const you = resolveYouForController(state, controllerId);
    if (!you)
        throw new Error('观察者不在对局中');
    /**
     * 【变体1】这个操控者手上**所有棋子**正在等他选的候选（合并）。
     * 单人模式一人管 3 名幸存者时，弹窗是按座位顺序一个一个发的，
     * 所以同一时刻通常只有一份；合并只是为了让 `traitDefs` 一定带上候选卡面。
     */
    const myTraitOffers: string[] = [];
    for (const [pid, list] of Object.entries(state.traitOffers ?? {})) {
        const owner = state.players[pid];
        if (owner && controlsPiece(state, controllerId, owner)) myTraitOffers.push(...list);
    }
    const activeId = activePlayerId(state);
    const controllingActive = isControllerActive(state, controllerId);
    let legalMoves: string[] = [];
    /**
     * 【墓穴】坍塌收尾：这时候地图上**唯一能点**的就是"离开废墟"的相邻格。
     *
     * ⚠ 必须排在**最前面**，而且**不能再要求 `controllingActive && activeId`**：
     * 坍塌是"升级时"发生的，`activePlayerId` 那时还指着**杀手**
     * （`killerMain` / `upkeep` 都返回杀手），可轮到走的是**幸存者** ——
     * 于是地图高亮的是杀手的移动候选、幸存者该点的格子反而没有圈
     * （用户报的"点选地图要高亮，有些没做到"）。
     *
     * 只给"操控着当前这个人"的观众下发；别人（1对3 的杀手、2对3 的另一名杀手）
     * 拿到空数组 —— 坍塌的移动不该显示在别人界面上。
     */
    const collapseMoverNow = state.pendingCollapseMoves?.currentId
        ? state.players[state.pendingCollapseMoves.currentId]
        : null;
    if (collapseMoverNow) {
        legalMoves = controlsPiece(state, controllerId, collapseMoverNow)
            ? collapseMoveOptions(state, collapseMoverNow)
            : [];
    }
    else if (controllingActive && activeId) {
        if (state.pendingPathDraft && state.phase === 'killerMain') {
            const last = state.pendingPathDraft.rooms[state.pendingPathDraft.rooms.length - 1];
            /**
             * 杀手的路径草稿（〔移動〕牌）也必须和 `tryMove` 同口径：
             * 起点是**草稿末端**（不是杀手当前所在地），
             * 且**未命名 1 级起本人移动**可以把秘密通道当成一步。
             */
            const drafter = state.pendingPathDraft.owner === 'survivor' ? null : state.killerId;
            const adj = last ? moveAdjacentRooms(state, last, drafter) : [];
            legalMoves = last ? [...new Set([...adj, last, ...state.pendingPathDraft.rooms])] : [];
        }
        else if (state.pendingSensePair && state.phase === 'killerMain') {
            const first = state.pendingSensePair.firstRoomId;
            const second = state.pendingSensePair.secondRoomId;
            if (second && first) {
                legalMoves = [first, second];
            }
            else if (first) {
                legalMoves = [...mapAdjacentRooms(state.map, first), first];
            }
            else {
                legalMoves = state.map.rooms.map((r) => r.id);
            }
        }
        /**
         * 【杀手"点地图选一个地点"的各种待选】—— 高亮必须按**各自真正的落点**给。
         *
         * ⚠ 以前这里**一条都没有**：这些状态下会落到最下面那支"移动范围"，
         * 而快速阶段 `killerMainActionsLeft` 是 0 → `legalMoves` 直接是空数组。
         * 表现就是用户报的「【猎手本能】不能选择地点（点了好像没反应、
         * 也没有高亮）」。分支顺序放在"移动"那支**之前**。
         */
        else if (state.killerSenseRoomActive || state.pendingSenseRoom != null) {
            /** 猎手本能 / 君臨天下：任选一个地点（再点同一格 = 取消） */
            legalMoves = state.map.rooms.map((r) => r.id);
        }
        else if (state.pendingTrackerPick || state.pendingLurkPick || (state.pendingZombieSearch?.length ?? 0) > 0) {
            /**
             * 追蹤 / 潜藏威胁 / 屍群搜索：要点的是**人**或**僵尸**（行动区列表），
             * 地图上没有可点的落点 —— 显式给空数组，
             * 否则会掉到"移动范围"那支、把不相干的地点高亮成可点。
             */
            legalMoves = [];
        }
        else if (state.pendingStatueSeal) {
            /** 召唤石碑：先任选一格，再选与它**以门相连**的一格（秘密通道不算门） */
            const sealFrom = state.pendingStatueSealFrom ?? null;
            legalMoves = sealFrom
                ? [...generalAdjacentRooms(state.map, sealFrom), sealFrom]
                : state.map.rooms.map((r) => r.id);
        }
        else if ((state.pendingPassagePick?.length ?? 0) > 0) {
            /** 恐詭管道：潛行到"有秘密通道的地点"之一 */
            legalMoves = [...(state.pendingPassagePick ?? [])];
        }
        else if (state.pendingAcidPick) {
            /** 酸液喷吐：只能选一个**相邻**地点（秘密通道不算相邻） */
            const acidRoom = state.players[activeId]?.roomId ?? null;
            legalMoves = acidRoom ? generalAdjacentRooms(state.map, acidRoom) : [];
        }
        else if ((state.pendingTeleportPick?.length ?? 0) > 0) {
            /** 傳送聚合：带核心标记或封堵标记的地点 */
            legalMoves = [...(state.pendingTeleportPick ?? [])];
        }
        else if (state.pendingCorePick === 'place') {
            /** 茂盛 / 枝條生長：任选一个地点放核心标记 */
            legalMoves = state.map.rooms.map((r) => r.id);
        }
        else if (state.pendingCorePick === 'remove' || state.pendingCorePick === 'placeBlockade') {
            /** 已达上限选移除 / 在带核心标记的地点封堵：只能点候选地点 */
            legalMoves = [...(state.pendingCoreRooms ?? [])];
        }
        else if (state.pendingCorePick === 'moveFrom') {
            /** 移动核心标记第一步：选一个**带核心标记**的地点 */
            legalMoves = [...(state.coreMarkers ?? [])];
        }
        else if (state.pendingCorePick === 'moveTo') {
            /** 第二步：只能放到相邻地点 */
            legalMoves = [...(state.pendingCoreNeighbors ?? [])];
        }
        else if (state.pendingQueenSpawnRooms != null || state.pendingStranglerCoreRooms != null) {
            /** 女王 4 级生成丧尸 / 扼杀者 4 级放核心标记：各任选 2 个不同地点 */
            legalMoves = state.map.rooms.map((r) => r.id);
        }
        else if ((state.pendingZombieHordeFrom?.length ?? 0) > 0) {
            /** 屍群來了第一步：只能选**有僵尸**的地点 */
            legalMoves = [...(state.pendingZombieHordeFrom ?? [])];
        }
        else if (state.pendingZombieHordeTo) {
            /** 第二步：只能选距离 1（僵尸相邻，含杀手密道） */
            const from = (state.pendingZombieHordeTo as unknown as { from: string }).from;
            legalMoves = hordeStepRooms(state, from);
        }
        else if (state.pendingBlockadeJob && state.pendingBlockadeJob.removeLeft > 0) {
            legalMoves = roomsForBlockadeRemove(state);
        }
        else if (state.pendingBlockadeJob?.kind === 'anyDoors') {
            legalMoves = roomsForAnyDoorPick(state);
        }
        else if (state.pendingBlockadePlace && state.phase === 'killerMain') {
            const rooms = new Set<string>();
            for (const id of removableBlockades(state)) {
                const pair = parseDoor(id);
                if (pair) {
                    rooms.add(pair[0]);
                    rooms.add(pair[1]);
                }
            }
            legalMoves = [...rooms];
        }
        else if (state.pendingBlockade && (state.phase === 'killerMain' || state.phase === 'upkeep')) {
            /**
             * ⚠ 阶段要**连 `upkeep` 一起认**：粘液腺體的封堵是回合收尾时挂起的，
             * 那时 `phase` 可能已经被 `maybeCloseKillerUpkeep` 置成 `upkeep` ——
             * 只认 `killerMain` 的话地图不给高亮、玩家点不了，回合就卡在收尾上。
             */
            legalMoves = legalBlockadeRooms(state, activeId);
        }
        else if (state.pendingMoveRange != null && (state.phase === 'killerMain' || state.phase === 'survivorMain')) {
            const actor = state.players[activeId];
            if (actor.faction === 'killer') {
                const adj = killerAdjacentRooms(state, activeId);
                const taken = Math.max(0, state.lastMovePath.length - 1);
                const min = state.pendingMoveMin ?? 0;
                legalMoves = actor.roomId && taken >= min ? [...adj, actor.roomId] : adj;
            }
            else {
                legalMoves = legalMoveRooms(state, activeId, state.pendingMoveRange, state.pendingMoveMin ?? 0);
            }
        }
        else if (state.phase === 'survivorMain' || state.phase === 'killerMain') {
            const actor = state.players[activeId];
            let range = 0;
            if (actor.faction === 'survivor' && !actor.mainActionUsed) {
                range = actor.moveLeft;
            }
            else if (actor.faction === 'killer' && state.killerMainActionsLeft > 0) {
                range = state.rules.killerMoveRange + actor.moveBonus;
            }
            if (range > 0)
                legalMoves = legalMoveRooms(state, activeId, range);
        }
        else if (state.phase === 'encounter' &&
            state.encounter?.step === 'flee' &&
            activeId === state.encounter.targetId) {
            /**
             * minRange=1：原地要靠「留在原地」按钮单独表达，不把当前格算成可点的落点。
             *
             * 【变体1】特性 09「生存本能」：带这张卡的人撤离时可以走**最多 2 格**
             * （正常只有 1 格）—— 所以这里把可点范围放宽到 2，客户端不用加额外按钮，
             * 玩家点更远的那一格就等于"用了这张特性"。
             */
            const instinct =
                state.variant1 && hasTrait(state, activeId ?? '', 'trait_s09');
            legalMoves = instinct
                ? legalMoveRooms(state, activeId, 2, 1)
                : legalMoveRooms(state, activeId, 1, 1);
        }
    }
    /**
     * 2对3：幸存者三人同时行动、各控一名；两名杀手各自只看自己的界面。
     * 而 `activeId` 只认"当前行动者"（幸存者阶段它会解析成**某一个**幸存者），
     * 所以 2对3 必须像 1对3 一样以**自己操控的棋子**为准，
     * 否则另一名杀手的视角会被当成当前行动者、看到别人的手牌。
     */
    /**
     * ⚠ **【墓穴】坍塌收尾优先**：这一步不属于"谁的回合"，而 `activePlayerId`
     * 那时还指着**杀手**（`killerMain` / `upkeep` 都返回杀手）—— 于是快照的 `you`
     * 会被算成杀手，客户端就**不会切到幸存者界面**：被压到的幸存者只能看着
     * 杀手侧的"确认新效果"面板，自己那步"离开废墟"根本点不了
     * （用户报的"单人模式坍塌砸到幸存者，没有切到幸存者界面"）。
     *
     * `resolveYouForController` 本来就以 collapseMover 优先，这里必须跟它一致。
     *
     * ⚠⚠ **但"该走的人"必须和这个观众对得上** —— 用户报的
     * 「坍塌时若杀手需移动，幸存者方加载出了杀手的界面」就是这里出的：
     * 以前直接 `collapseMoverNow`，轮到**杀手**走时，**所有人**（包括幸存者玩家）
     * 的快照 `you` 都被改成杀手 —— 幸存者那边就渲染成杀手界面了
     * （手牌区、行动区全变）。所以先按 `controlsPiece` 判一句，
     * 不是自己的人就继续往下走原来的判定，绝不跨阵营。
     */
    const collapseMoverMine =
        collapseMoverNow && controlsPiece(state, controllerId, collapseMoverNow)
            ? collapseMoverNow
            : null;
    const viewPieceRaw = collapseMoverMine
        ? collapseMoverMine
        : state.mode === 'multi' || state.mode === '2v3'
            ? you
            : controllingActive && activeId
                ? state.players[activeId]
                : you;
    /** 杀手回合里幸存者装备溢出：仍以杀手座位看雾与手牌，弃装数据走 pendingItemDiscard */
    let viewPiece = viewPieceRaw;
    /**
     * ⚠ **坍塌收尾期间不要套用"装备溢出仍看杀手座位"那条** ——
     * 那会把上面刚定好的"该走的那个人"又盖回杀手。
     * 弃装面板等坍塌走完再处理（顺序：先离开废墟，再弃装备）。
     */
    if (state.pendingItemDiscard && !collapseMoverMine) {
        const keepKiller = (state.phase === 'killerMain' ||
            state.phase === 'upkeep' ||
            state.phase === 'noiseReport' ||
            (state.phase === 'encounter' &&
                (state.encounter?.step === 'attack' || state.encounterOpenHold))) &&
            state.killerId
            ? state.players[state.killerId]
            : null;
        if (keepKiller &&
            (keepKiller.controllerId === controllerId ||
                (state.mode === 'solo' && controllerId === state.hostId))) {
            viewPiece = keepKiller;
        }
    }
    /** 还没选阵营时按旁观者处理（快照不泄漏任何阵营情报） */
    const viewerFaction: Faction = viewPiece.faction ?? 'spectator';
    const publicYou = {
        ...toPublicPlayer(state, viewPiece, viewerFaction, viewPiece.id),
        roomId: viewPiece.roomId,
        hand: [...viewPiece.hand],
        skillUsedThisTurn: [...viewPiece.skillUsedThisTurn],
    };
    /**
     * 杀手手牌/锁定牌取自顶层镜像。**2对3 要先把这个观众自己那个杀手读进镜像** ——
     * 顶层是"当前行动杀手"的状态，若不切换，后手杀手会看到先手的手牌。
     * （`buildSnapshot` 本身不改状态，只是读镜像，所以这里安全。）
     */
    if (state.mode === '2v3' && viewPiece.faction === 'killer' && state.killers[viewPiece.id]) {
        loadKillerToMirror(state, viewPiece.id);
    }
    const showKillerHand = viewPiece.faction === 'killer' ||
        (state.mode === 'solo' &&
            (state.phase === 'killerMain' ||
                state.phase === 'upkeep' ||
                state.phase === 'noiseReport' ||
                /**
                 * ⚠ **杀手欠着弃牌时，单人热座也得看得到他的手牌** ——
                 * 这笔账可能出现在**幸存者大回合**里（幸存者的「長劍」+
                 * 【变体1】03「狡猾诡计」摸牌超额）：那时 `phase` 是 `survivorMain`，
                 * 不带上这一条的话弃牌面板列不出牌、账永远结不掉。
                 * （只在单人分支里加，多人局该谁看还是谁看。）
                 */
                state.pendingKillerDiscards > 0 ||
                Boolean(state.pendingOverFearWound || state.pendingWhizSearch || state.pendingEvolutionAck) ||
                (state.phase === 'encounter' && state.encounter?.step === 'attack')));
    const killerFogPhase = viewerFaction === 'killer' && (state.phase === 'survivorMain' || state.phase === 'discovery');
    const killerNoisePhase = viewerFaction === 'killer' && state.phase === 'noiseReport';
    /**
     * 响声可见性：
     *  - **幸存者**：自己回合内因任何原因发出的响声，**立即**画在幸存者地图上；
     *    惊吓过度的响声则双方地图**立即**都有。所以幸存者在任何阶段都看得到响声。
     *  - **杀手**：幸存者大回合/发现阶段是「雾」——看不见幸存者这回合弄出的响声；
     *    到响声阶段才一次性看到全部（或用爆竹后的那个爆竹标记）。
     */
    const visibleNoises = killerFogPhase ? [] : [...state.noises];
    /**
     * 爆竹标记（双方地图都有）：用和响声一样的可见性 ——
     * 幸存者随时看得到；杀手在幸存者回合/发现阶段看不见，响声阶段起才看得到。
     */
    const visibleFirecrackerRoom = state.firecrackerThisRound && !killerFogPhase ? state.firecrackerRoomId : null;
    const visibleKeys = viewerFaction === 'killer' ? state.killerPublicKeys : state.keysCollected;
    const visibleRepair = viewerFaction === 'killer' ? state.killerRepairGuess : state.repairProgress;
    /**
     * 战报历史任何时候都在。杀手在幸存者大回合里只能看到「共通信息」那几条
     * （响声 / 消除恐惧 / 治疗 / 钥匙 / 修理完成 / 封堵变动 / 阶段胜负 / 骰点 / 遭遇），
     * 看不到幸存者的完整流程（搜索到什么、谁走到哪、用了什么、发现翻牌）。
     * 幸存者侧本来就只看得到杀手的公开行动，潜行移动的日志是 vis='killer'。
     */
    let visibleLogs = (viewerFaction === 'killer'
        ? state.logs.filter((l) => l.vis !== 'survivorSecret' &&
            (l.vis !== 'survivor' || (l.needsCommon && killerFogPhase)))
        : state.logs.filter((l) => l.vis !== 'killer')).slice(-80);
    if (killerNoisePhase) {
        const noiseLines = state.firecrackerThisRound
            ? ['爆竹：所有地点发出响声。']
            : state.noises.length
                ? [`发出响声的位置：${state.noises.map((id) => roomName(state, id)).join('、')}。`]
                : ['没有地点发出响声。'];
        visibleLogs = [
            ...visibleLogs,
            ...noiseLines.map((text): LogEntry => ({ t: Date.now(), text, vis: 'all' as const })),
        ];
    }
    /**
     * 【杀手界面・地图旁边的信息栏】**本大回合的全部战报**（用户要求）。
     *
     * 口径：
     *  - 范围 = **当前这个大回合**（`l.round === state.round`，即幸存者大回合 + 本轮的杀手回合）；
     *  - 内容 = **杀手本来就能看到的那部分**（用和 `visibleLogs` 完全同一套可见性判定，
     *    所以幸存者私密日志、以及雾阶段不该给他的「共通信息」都不会漏进去）；
     *  - 只给**杀手视角**（幸存者那边本来就有完整战报栏）。
     *
     * ⚠ 不直接复用 `visibleLogs`：它被截到最近 80 条，一个热闹的大回合会丢开头几条。
     */
    const killerCanSee = (l: LogEntry) =>
        l.vis !== 'survivorSecret' && (l.vis !== 'survivor' || Boolean(l.needsCommon && killerFogPhase));
    const roundLogs =
        viewerFaction === 'killer'
            ? state.logs
                .filter((l) => (l.round ?? 0) === state.round && killerCanSee(l))
                .slice(-200)
                .map((l) => l.text)
            : [];
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
    /**
     * 杀手这名角色的**全部行动牌**（杀手信息面板按 `locked` 分两组画卡面）。
     *
     * `locked`：卡面自带的"开局是锁着的"标记（`content/cards/killers.json`）。
     * `obtained`：**这张锁定牌杀手已经拿到手了**（用户口径：
     *   「查看杀手信息中杀手选择的锁定牌也要高光」）——
     *   判定是"不在 `killerLocked`（还锁着的那份）里、也没被二选一作废"。
     *   二选一没选中的那张会被移出 `killerLocked` 并记进 `abandonedLockedCards`，
     *   所以**不会**被误标成已获得。
     *
     * ⚠ 这两项都是**公开信息**（牌子就摊在桌面上），双方都下发。
     */
    const allKillerCards = Object.values(state.cardById)
        .filter((c) => {
        if (c.type !== 'killerAction')
            return false;
        if (!c.owner)
            return false;
        if (junkKillerInfoNames.has(c.name))
            return false;
        return c.owner === killerPiece?.characterId || c.owner === killerOwner?.id || c.owner === killerOwner?.name;
    })
        .map((c) => ({
        id: c.id,
        name: c.name,
        locked: Boolean(c.locked),
        obtained: Boolean(c.locked) &&
            !state.killerLocked.includes(c.id) &&
            !(state.abandonedLockedCards ?? []).includes(c.id),
    }));
    return {
        roomCode: state.roomCode,
        /** 这一局的标识（客户端用它区分"重新开始后的新一局"） */
        matchId: state.matchId,
        hostId: state.hostId,
        mode: state.mode,
        /** 「分头行动」：客户端据此把顶栏钥匙区换成模式标识、并显示各自钥匙数 */
        split: Boolean(state.split),
        /**
         * 「分头行动」本大回合的先手（棋子 id）+ 座位基准 ——
         * 客户端在物品栏上方标"先手"，并让先手选择面板列出候选。
         */
        splitFirstId: state.split ? state.splitFirstId : null,
        splitOrderBase: state.split ? [...state.splitOrderBase] : [],
        soloKillerCharacterId: state.soloKillerCharacterId,
        soloSurvivorCharacterIds: [...state.soloSurvivorCharacterIds],
        /**
         * 女王对局：**十字弩持有者**（进入游戏后由幸存者指定）。
         *
         * ⚠ **谁拿了十字弩，女王不该知道** —— 用户明确：
         * 「谁拿了十字弩是女王不知道的，就跟雕像选择主雕像、女猎手放陷阱
         *   幸存者不知道一样」。所以只下发给幸存者侧；杀手视角恒为 null。
         *
         * （`crossbowAssigned` 可以公开：女王知道"已经指定过了"，但不知道是谁。）
         */
        crossbowHolderId: viewPiece.faction === 'survivor' ? state.crossbowHolderId : null,
        crossbowAssigned: state.crossbowAssigned,
        /**
         * 这名观看者能否去指定十字弩持有者。
         *
         * ⚠ **不能依赖 `viewerFaction`** —— 在 `crossbowSetup` 阶段
         * `resolveYouForController` 会把「你」解析成**杀手棋子**
         * （`activePlayerId` 只把 `survivorMain` 当幸存者阶段），
         * 于是 `viewerFaction` 变成 `'killer'`、面板被判掉、**根本不显示**。
         *
         * 这里改用「**这个操控者手上有没有幸存者棋子**」来判断：
         * 单人热座里操控者同时管杀手和幸存者，所以**要显示**（由幸存者来决定）；
         * 多人局里纯杀手玩家手上没有幸存者，就不该显示。
         */
        canPickCrossbowHolder: isQueenKiller(state)
            && !state.crossbowAssigned
            && (state.phase === 'crossbowSetup' || state.phase === 'survivorMain')
            && Object.values(state.players).some(
                (pl) => pl.faction === 'survivor' && pl.alive && controlsPiece(state, controllerId, pl),
            ),
        /**
         * 【解散房间】：观众不参与，其他人任何阶段都能点。
         * 已经在等确认时，客户端改用 `disband` 里的名单来画确认面板。
         */
        canRequestDisband: viewerFaction !== 'spectator',
        /**
         * 【重新开始】：和解散一样谁都能发起，但**大厅/选人阶段没必要**
         * （那时候本来就还没开局）。
         */
        canRequestRestart:
            viewerFaction !== 'spectator' &&
            state.phase !== 'lobby' &&
            state.phase !== 'characterSelect',
        disband: state.disband?.requestedBy
            ? {
                ...disbandProgressOf(state),
                requestedBy: state.disband.requestedBy,
                /** 这名观看者自己确认过没有（客户端据此决定还显不显示「确认解散」） */
                youConfirmed: state.disband.votes.includes(controllerId),
            }
            : null,
        disbanded: Boolean(state.disbanded),
        /**
         * 【重新开始】：和 `disband` 同一套（同一批投票人），
         * 但确认完**不解散房间**，而是回大厅重开。
         * 已经在等确认时，客户端用这里的名单画确认面板。
         */
        restart: state.restart?.requestedBy
            ? {
                ...restartProgressOf(state),
                requestedBy: state.restart.requestedBy,
                youConfirmed: state.restart.votes.includes(controllerId),
            }
            : null,
        phase: state.phase,
        round: state.round,
        isHost: controllerId === state.hostId,
        you: publicYou,
        controllingActive,
        /**
         * 雕像棋子不在这里出现 —— 它们通过下面的 `statues[]` 单独暴露，
         * 否则 4 个幽灵棋子会混进幸存者列表、座位数、救援条等所有地方。
         */
        players: Object.values(state.players)
            .filter((p) => p.statueIndex == null)
            .map((p) => toPublicPlayer(state, p, viewerFaction, viewPiece.id)),
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
        /**
         * **「分头行动」各人单独保管的钥匙数**（钥匙架不参与这个模式）。
         *
         * ⚠ 只有**幸存者视角**能看到 —— 用户要求「找到钥匙不需要报告杀手」。
         * 幸存者彼此可见（要在三个物品栏上方分别显示）。
         */
        splitKeys: state.split && viewerFaction !== 'killer'
            ? Object.fromEntries(
                Object.values(state.players)
                    .filter((x) => x.faction === 'survivor')
                    .map((x) => [x.id, x.keys ?? 0]),
            )
            : {},
        /**
         * 【分头行动】单独逃脱的门槛（默认 3 把，见 `SPLIT_ESCAPE_KEYS`）。
         * 这是**公开规则**，杀手也看得到，所以不分视角。
         */
        splitEscapeKeys: state.split ? splitEscapeKeysNeeded(state) : undefined,
        /**
         * 【变体1】特性卡的可见信息。
         *
         * - `traitDefs`：**只下发看得见的那些定义**（不是整包 40 张），客户端据此画卡面。
         * - `yourTraitPick`：现在轮到**你**选的那一份（弹窗用），没轮到就是 null。
         * - `traitPickerIds`：还等着选的人（显示"等待 XX 选特性"）。
         */
        variant1: state.variant1,
        /**
         * 【变体3】计划卡开关 —— 大厅 / 选人界面那颗按钮靠它回显"开 / 关"。
         *
         * ⚠ 以前**没下发这个字段**，客户端拿到的永远是 `undefined`：
         * 点一下服务端其实开了，但按钮一直显示"关" → 看起来像"点了没反应"。
         * 这是**模式设置**，双方都该知道（`plans` 那块才只发幸存者）。
         */
        variant3: state.variant3,
        traitDifficulty: state.variant1 ? state.traitDifficulty : undefined,
        traitDefs: (() => {
            if (!state.variant1) return [];
            const ids = new Set<string>();
            for (const [pid, list] of Object.entries(state.traits ?? {})) {
                const owner = state.players[pid];
                if (!owner) continue;
                /** 幸存者特性对杀手不可见 */
                if (owner.faction === 'survivor' && viewerFaction === 'killer') continue;
                for (const id of list) ids.add(id);
            }
            for (const id of myTraitOffers) ids.add(id);
            return [...ids]
                .map((id) => state.traitById?.[id])
                .filter((def): def is NonNullable<typeof def> => Boolean(def));
        })(),
        yourTraitPick: (() => {
            if (!state.variant1) return null;
            /** 这个操控者手上**任何一个棋子**有候选就弹窗（单人模式一人管 3 个棋子） */
            for (const [pid, list] of Object.entries(state.traitOffers ?? {})) {
                const owner = state.players[pid];
                if (!owner || !list.length) continue;
                if (!controlsPiece(state, controllerId, owner)) continue;
                const isKiller = owner.faction === 'killer';
                return {
                    playerId: pid,
                    playerName: owner.name,
                    options: [...list],
                    keep: isKiller
                        ? (KILLER_TRAIT_PLAN[state.traitDifficulty] ?? KILLER_TRAIT_PLAN.normal).keep
                        : 1,
                };
            }
            return null;
        })(),
        traitPickerIds: state.variant1 ? Object.keys(state.traitOffers ?? {}) : [],
        traitUsed: state.variant1 ? [...(state.traitUsed ?? [])] : [],
        /**
         * 【变体1】杀手特性 14「嘲讽战术」的待弃牌数 —— **只发给杀手**
         * （要弃哪几张是他自己的手牌，幸存者不该看到）。
         */
        pendingTraitDiscard:
            state.variant1 && viewerFaction === 'killer' ? state.pendingTraitDiscard : 0,
        /**
         * 【变体1】感知命中后等杀手决定的特性卡（10/15/16）—— **只发杀手**。
         * 客户端据此在行动区列出"可以发动的特性"。
         */
        pendingSenseTraits:
            state.variant1 && viewerFaction === 'killer' ? state.pendingSenseTraits : false,
        /**
         * 【变体1】特性 11「安静搜查」的询问 —— **只发给本人**（别人不该被问第二次）。
         */
        pendingQuietSearch:
            state.variant1 && state.pendingQuietSearch?.playerId === viewPiece.id
                ? {
                    playerId: state.pendingQuietSearch.playerId,
                    from: state.pendingQuietSearch.from,
                }
                : null,
        /** 【变体1】17 压迫威慑：等杀手选 1 名幸存者（只发杀手） */
        pendingTraitVictim:
            state.variant1 && viewerFaction === 'killer' ? state.pendingTraitVictim : null,
        /** 【变体1】12 英勇阻截：只发给持有人本人 */
        /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消（只发杀手） */
        pendingPreyOffer: state.variant1 && viewerFaction === 'killer' ? state.pendingPreyOffer : false,
        pendingHeroicBlock:
            state.variant1 && state.pendingHeroicBlock?.holderId === viewPiece.id
                ? { ...state.pendingHeroicBlock, queue: [...state.pendingHeroicBlock.queue], moved: [...state.pendingHeroicBlock.moved] }
                : null,
        killerPower: state.killerPower,
        killerTurnPowerBonus: state.killerTurnPowerBonus,
        killerPowerLabel: formatKillerPowerLabel(state),
        evolutionEffects: activeEvolutionLines(state),
        pendingEvolutionAck: state.pendingEvolutionAck ? { ...state.pendingEvolutionAck } : null,
        pendingWhizSearch: state.pendingWhizSearch,
        pendingOverFearWound: state.pendingOverFearWound ? { ...state.pendingOverFearWound } : null,
        pendingBlockadeJob: viewerFaction === 'killer' && state.pendingBlockadeJob
            ? { ...state.pendingBlockadeJob }
            : null,
        georgeNotes: viewerFaction === 'survivor'
            ? state.notesDeck.map((id) => ({ id, name: state.cardById[id]?.name ?? id }))
            : [],
        allGeorgeNotes: georgeNoteDefs(state).map((c) => ({ id: c.id, name: c.name, text: c.text })),
        pendingGeorgeNote: state.pendingGeorgeNote,
        georgeInPlay: georgeInPlay(state),
        // 雕像杀手：4 个雕像的位置 / 主雕像 / 停滞 / 幸存者猜测（猜测只发幸存者）
        isStatueKiller: isStatueKiller(state),
        statues: statueView(state, viewerFaction),
        /** 正在等这个雕像走路的编号（杀手侧显示「当前是雕像 N 在移动」） */
        pendingStatueStepIndex: viewerFaction === 'killer' && state.pendingStatueStepId
            ? state.players[state.pendingStatueStepId]?.statueIndex ?? null
            : null,
        /**
         * 雕像「巡邏 / 圍困」：**等杀手选下一尊要移动/搜索的雕像**。
         * `options` 只列**能动的、还没选过的**（被停滞的直接不出现）；
         * `active` 非空 = 正在走那一尊，这时客户端不画选项。
         */
        pendingStatuePick: (() => {
            const pick = state.pendingStatuePick;
            if (viewerFaction !== 'killer' || !pick) return null;
            const options = statuePieces(state)
                .filter((x) => x.alive && !x.statueHalted && !pick.done.includes(x.id))
                .map((x) => ({ id: x.id, index: x.statueIndex ?? 0, roomId: x.roomId }));
            return { kind: pick.kind, active: pick.active, options };
        })(),
        /** 雕像：开局准备是否已选定主雕像（选定后本局不能改） */
        statueMainLocked: viewerFaction === 'killer' && state.statueMainLocked === true,
        pendingStatueSwitch: viewerFaction === 'killer' ? state.pendingStatueSwitch : null,
        /** 狼人宝藏：地图上还没开的宝箱 + 牌堆剩余（双方都看得到宝箱和牌堆张数） */
        treasureChests: Object.keys(state.treasureChests ?? {}),
        treasureDeckCount: state.treasureDeck?.length ?? 0,
        isWerewolfKiller: isWerewolfKiller(state),
        /**
         * 女猎手猎手陷阱：标记位置双方都看得到，
         * 但**陷阱类型只有杀手知道** —— 幸存者拿到的 kind 一律为 null（显示问号）。
         */
        hunterTraps: Object.entries(state.hunterTraps ?? {}).map(([id, t]) => ({
            id,
            roomId: t.roomId,
            removed: t.removed,
            kind: viewerFaction === 'killer' ? t.kind : null,
            revealed: t.revealed,
        })),
        isHuntressKiller: isHuntressKiller(state),
        /** 女猎手放置陷阱的进度（只有杀手视角有） */
        trapPlacement: viewerFaction === 'killer' && state.pendingTrapPlacement
            ? {
                kind: state.pendingTrapPlacement.kind,
                done: state.pendingTrapPlacement.done,
                placed: { ...state.pendingTrapPlacement.placed },
                remaining: {
                    bear: trapRemaining(state, 'bear'),
                    bone: trapRemaining(state, 'bone'),
                    net: trapRemaining(state, 'net'),
                },
                allPlaced: allTrapsPlaced(state),
                /** true = 开局布置（只能放常规搜索位/修理位）；false = 陷阱重置（任选） */
                restricted: state.pendingTrapPlacement.restricted === true,
                /** 开局布置时哪些地点合法（客户端用来高亮可放的位置） */
                allowedRooms: state.pendingTrapPlacement.restricted === true
                    ? regularTrapRooms(state)
                    : null,
            }
            : null,
        /**
         * 陷阱的落点（**位置由女猎手自己选**，所以这里是"已经放好的地点"，
         * 不是"可以放的位置"）。`id` 就用 roomId —— 一个地点最多一个陷阱。
         */
        trapMarkers: Object.values(state.hunterTraps ?? {})
            .filter((t) => !t.removed)
            .map((t) => ({ id: t.roomId, roomId: t.roomId })),
        removableBoardBlockades: removableForJob(state).map((id) => {
            const pair = parseDoor(id);
            return { id, from: pair?.[0] ?? id, to: pair?.[1] ?? id };
        }),
        encounterOpenHold: state.encounterOpenHold,
        killerLevel: state.killerLevel,
        pendingKillerDiscards: state.pendingKillerDiscards,
        /** 刚由进化入手、本次超员弃牌里不能弃的牌 */
        justUnlockedCards: [...(state.justUnlockedCards ?? [])],
        pendingBlockade: viewerFaction === 'killer' && state.pendingBlockade,
        pendingBlockadePlace: viewerFaction === 'killer' ? state.pendingBlockadePlace : null,
        relocatableBlockades: removableBlockades(state).map((id) => {
            const pair = parseDoor(id);
            return { id, from: pair?.[0] ?? id, to: pair?.[1] ?? id };
        }),
        pendingSensePair: viewerFaction === 'killer' && state.pendingSensePair
            ? {
                firstRoomId: state.pendingSensePair.firstRoomId,
                secondRoomId: state.pendingSensePair.secondRoomId,
            }
            : null,
        pendingSenseColor: viewerFaction === 'killer' && state.pendingSenseColor,
        pendingSenseColorPick: viewerFaction === 'killer' ? state.pendingSenseColorPick : null,
        /**
         * 杀手还在点路径时，幸存者看不到这条草稿（选到哪、往哪潜行都不公开）。
         * 幸存者自己的草稿（幸运币）照常只给幸存者。
         */
        pendingPathDraft: (() => {
            const draft = state.pendingPathDraft;
            if (!draft) return null;
            if (draft.owner === 'survivor')
                return viewerFaction === 'killer' ? null : { ...draft, rooms: [...draft.rooms] };
            return viewerFaction === 'killer' ? { ...draft, rooms: [...draft.rooms] } : null;
        })(),
        killerRepairGuess: state.killerRepairGuess,
        rematchReady: [...new Set(state.rematchReady.map((id) => {
                const pl = Object.values(state.players).find((p) => p.controllerId === id);
                return pl?.controllerName || pl?.name || id;
            }))],
        replacementDeck: state.replacementDeck,
        pendingDice: state.pendingDice ? { ...state.pendingDice, values: [...state.pendingDice.values] } : null,
        youRematchReady: state.rematchReady.includes(controllerId),
        allKillerCards,
        survivorActionsDone: !killerFogPhase &&
            state.phase === 'survivorMain' &&
            unactedAliveSurvivorIds(state).length === 0,
        senseHighlight: viewerFaction === 'killer' ? state.senseHighlight : null,
        /**
         * 杀手牌的移动步数是选择过程。幸存者自己的草稿（幸运币）仍只给幸存者。
         */
        pendingMoveRange: (() => {
            const survivorDraft = state.pendingPathDraft?.owner === 'survivor';
            if (survivorDraft) return viewerFaction === 'killer' ? null : state.pendingMoveRange;
            return viewerFaction === 'killer' ? state.pendingMoveRange : null;
        })(),
        pendingMoveMin: (() => {
            const survivorDraft = state.pendingPathDraft?.owner === 'survivor';
            if (survivorDraft) return viewerFaction === 'killer' ? 0 : state.pendingMoveMin;
            return viewerFaction === 'killer' ? state.pendingMoveMin : 0;
        })(),
        pendingMoveTaken: (() => {
            const survivorDraft = state.pendingPathDraft?.owner === 'survivor';
            const taken = state.pendingMoveRange != null ? Math.max(0, state.lastMovePath.length - 1) : 0;
            if (survivorDraft) return viewerFaction === 'killer' ? 0 : taken;
            return viewerFaction === 'killer' ? taken : 0;
        })(),
        pendingLurkPick: viewerFaction === 'killer' && state.pendingLurkPick,
        pendingAmulet: state.pendingAmulet ? { ...state.pendingAmulet } : null,
        /**
         * ⚠ 这里原来有个 `pendingResilience`（"要不要用坚毅标记"的询问）——
         * 已经删掉：坚毅标记是**自动使用**的（`applyDamage` 里直接生效），
         * 全项目没有任何地方会挂出那个待办，留着只会让人以为"会问一句"。
         */
        /**
         * 欧菲莉亚「第六感」：待选的 2 张牌（只给出发动搜索的那个人看）。
         */
        pendingSixthSense:
            state.pendingSixthSense && state.pendingSixthSense.playerId === viewPiece.id
                ? {
                    cards: state.pendingSixthSense.cardIds.map((id) => ({
                        id,
                        name: state.cardById[id]?.name ?? id,
                    })),
                }
                : null,
        /** 鼓励标记持有者（**只给幸存者**，杀手看不到） */
        encouragedIds: viewerFaction === 'killer'
            ? []
            : Object.values(state.players)
                .filter((pl) => pl.faction === 'survivor' && pl.encourageToken)
                .map((pl) => pl.id),
        /** 凯莱布幸运币：本回合是否已用 */
        luckyCoinUsedThisTurn: Boolean(viewPiece.luckyCoinUsedThisTurn),
        /** 当前地点是不是锤子/螺旋标记地点（给技能按钮用） */
        isHammerRoomHere: Boolean(
            viewPiece.roomId &&
            state.map.rooms.find((r) => r.id === viewPiece.roomId)?.tags?.includes('special-hammer'),
        ),
        isSpiralRoomHere: Boolean(
            viewPiece.roomId &&
            state.map.rooms.find((r) => r.id === viewPiece.roomId)?.tags?.includes('special-spiral'),
        ),
        /**
         * 这名观看者现在能不能在自己地点搜索。
         * 默认看 `searchable`；凯莱布「神秘狂热粉」在螺旋地点也能搜。
         */
        canSearchHere: Boolean(
            viewPiece.roomId &&
            canSearchRoom(
                state,
                viewPiece,
                state.map.rooms.find((r) => r.id === viewPiece.roomId),
            ) &&
            !killerInRoom(state, viewPiece.roomId),
        ) && !viewPiece.searchedThisTurn,
        /**
         * **"有杀手在你这个地点吗"**（服务端唯一口径，客户端别再自己算一遍）。
         *
         * 客户端以前自己遍历棋子判"同地"，结果漏了雕像豁免 ——
         * 雕像局里那个**残留的主体棋子**还停在杀手起始房间（墓穴 = 隐藏出口 G1），
         * 谁站那儿就搜不了、修不了（用户报的「1对1、墓穴、杀手是雕像、
         * 乔治在 G1 没有搜索」）。现在直接下发 `killerInRoom` 的结果。
         */
        killerInYourRoom: Boolean(viewPiece.roomId && killerInRoom(state, viewPiece.roomId)),
        repairedThisPhase: state.repairedThisPhase,
        firecrackerThisRound: state.firecrackerThisRound,
        firecrackerRoomId: visibleFirecrackerRoom,
        /**
         * 【变体3】**计划卡**（只有幸存者视角有；杀手完全看不到）。
         *
         * 里面把两张卡"要画什么"都算好了（进度完成情况、能力是否已用、
         * 是不是当前进行中的计划），客户端只管画。
         */
        plans: viewerFaction === 'survivor' && state.variant3
            ? {
                cards: (state.planHand ?? [])
                    /**
                     * ⚠ **完成某一计划后，另一张计划卡隐藏**（用户口径）——
                     * 所以只保留已完成的那张，另一张不再下发。
                     */
                    .filter((id) => !state.planCompletedId || id === state.planCompletedId)
                    .map((id) => planViewFor(state, id, viewPiece))
                    .filter((x): x is NonNullable<typeof x> => Boolean(x)),
                currentId: state.planCurrentId,
                step: state.planStep,
                completedId: state.planCompletedId,
                /** 地图上的计划标记（只画在幸存者地图上） */
                markers: [...(state.planMarkers ?? [])],
                canPick: canPickPlan(state, controllerId),
                voterIds: planVoters(state).map((v) => v.id),
                /** 这名观众自己是不是投票人（客户端据此决定要不要弹"同意/不同意"） */
                myVoterId: planVoters(state).some((v) => v.id === controllerId)
                    ? controllerId
                    : null,
                pendingSwitch: state.pendingPlanSwitch
                    ? {
                        toId: state.pendingPlanSwitch.toId,
                        fromId: state.pendingPlanSwitch.fromId,
                        requestedBy: state.pendingPlanSwitch.requestedBy,
                        ...planSwitchProgress(state),
                    }
                    : null,
                /** 【通道調查】当前这名观众能走的秘密通道出口（①互连之后就是整个通道网络） */
                passageEnds: viewPiece?.faction === 'survivor'
                    ? passageNeighborsFor(state, viewPiece.roomId)
                    : [],
                /** 【通道調查 ②】正在等选通道出口 */
                pendingPassage: viewerFaction === 'survivor' ? [...(state.pendingPlanPassage ?? [])] : [],
                /** 【情報分享】完成计划后等选一名幸存者抽牌 */
                pendingTarget: viewerFaction === 'survivor' && state.pendingPlanTarget
                    ? {
                        chooserId: state.pendingPlanTarget.chooserId,
                        chooserName: state.players[state.pendingPlanTarget.chooserId]?.name ?? null,
                        candidates: state.pendingPlanTarget.candidates.map((id) => ({
                            id,
                            name: state.players[id]?.name ?? id,
                        })),
                    }
                    : null,
            }
            : null,
        suitcaseAvailable: state.suitcaseAvailable,
        /**
         * **地图特殊规则**的状态（实验室 / 城堡）。
         * 客户端要靠它决定显示哪些按钮、要不要画机关大门。
         */
        firstAidKit: state.firstAidKit,
        firstAidRoomId: firstAidKitRoomId(state),
        canUseFirstAidKit: viewerFaction === 'survivor'
            ? canUseFirstAidKitAt(state, viewPiece)
            : false,
        /** 【雕像・召唤石碑】选门状态（只有杀手需要，客户端据此把地图点击路由过去） */
        pendingStatueSeal: viewerFaction === 'killer' && Boolean(state.pendingStatueSeal),
        pendingStatueSealFrom: viewerFaction === 'killer' ? state.pendingStatueSealFrom ?? null : null,
        /**
         * **遭遇防御阶段能选的防御物品**（服务端算，客户端不再自己维护一份表）。
         * 以前两边各有一份清单、不同步，导致狼人宝箱的银质匕首/银质子弹选不出来。
         */
        defenseItemChoices: viewerFaction === 'survivor'
            ? [
                ...usableDefenseItemIds(viewPiece).map((id) => ({
                    id,
                    name: itemName(id),
                    hint: defenseItemHint(id),
                })),
                /**
                 * 【变体1】特性 17「秘密武器」：**当作一件防御物品列出来**，
                 * 这样客户端一行都不用改就能选它（服务端把它算成 +4 的物品）。
                 */
                ...(state.variant1 && traitAvailable(state, viewPiece.id, 'trait_s17')
                    ? [{ id: 'trait_s17', name: '秘密武器（特性卡）', hint: '+4 防御值，每局一次' }]
                    : []),
            ]
            : [],
        /** 场上的机关大门（门号 `"A|B"`；没有就 null）—— 双方都看得到 */
        leverGateDoorId: leverGateDoor(state),
        /**
         * 这道机关大门是**谁**操作控制杆放的。
         *
         * ⚠ **只给幸存者**（用户口径：「**杀手不知道谁放的门**」）——
         * 以前这里双方都下发，那是更早的要求（"要说清楚是哪个幸存者动的机关"），
         * 已被新口径取代。
         */
        leverGateOwnerName: viewerFaction === 'survivor' && state.leverGateOwnerId
            ? state.players[state.leverGateOwnerId]?.name ?? null
            : null,
        /**
         * 杀手要付 3 张手牌过门时的待选状态（只有杀手视角）。
         *
         * ⚠ **不带 `ownerName`** —— 杀手不该知道是谁放的门。
         */
        pendingGatePay: viewerFaction === 'killer' && state.pendingGatePay
            ? {
                toRoomId: state.pendingGatePay.toRoomId,
                doorId: state.pendingGatePay.doorId,
                cost: LEVER_GATE_COST,
            }
            : null,
        /**
         * 【城堡 R1】这个观看者本人现在能不能操作控制杆。
         *
         * ⚠ **不查 `mainActionUsed`**（以前查了，是个 bug）：
         * 操作控制杆是**额外行动**，不占一般行动、做完小回合也能做 ——
         * 「走到 R1」这个动作本身就是他的一般行动，一加这条就永远用不了
         * （用户报的「走到控制杆这里了，但是没有弹出额外行动」）。
         * 客户端现在也不用这个字段做守卫了（它按"点了按钮的那个人"判）。
         */
        canPlaceLeverGate: viewerFaction === 'survivor'
            && state.map.id === 'castle'
            && viewPiece.roomId === LEVER_ROOM,
        castleHallFirstEnterDone: state.castleHallFirstEnterDone,
        /**
         * **【墓穴】坍塌**：
         *  - `collapsedRooms` 双方都看得到（塌了的地点藏不住），客户端据此画坍塌板块
         *  - `pendingCollapseMoves` 只给"轮到他走"的那一方：面板要显示可选目的地
         *  - 别的操控者只知道"有人在坍塌收尾"，看不到谁走到哪
         */
        collapsedRooms: [...(state.collapsedRooms ?? [])],
        pendingCollapseMoves: (() => {
            const pend = state.pendingCollapseMoves;
            if (!pend?.currentId) return null;
            const mover = state.players[pend.currentId];
            if (!mover) return null;
            const mine = mover.controllerId === controllerId
                || (state.mode === 'solo' && controllerId === state.hostId);
            if (!mine) {
                return {
                    roomId: pend.roomId,
                    currentId: null,
                    name: mover.name,
                    /** 阵营也告诉客户端：面板只画在"该走的那一方"的界面上 */
                    faction: mover.faction ?? undefined,
                    options: [] as string[],
                    mustMove: false,
                    waiting: true,
                };
            }
            const options = collapseMoveOptions(state, mover);
            /**
             * 幸存者**必须**离开；杀手也必须走（弃光手牌 + 移动一格）。
             * 只有"真的一个相邻地点都没有"时 `mustMove` 才是 false。
             */
            return {
                roomId: pend.roomId,
                currentId: mover.id,
                name: mover.name,
                faction: mover.faction ?? undefined,
                options,
                mustMove: options.length > 0,
                waiting: false,
                /** 杀手视角额外告诉他要弃光手牌（幸存者只知道"杀手弃光了手牌"） */
                isKiller: mover.faction === 'killer',
            };
        })(),
        /**
         * 【墓穴】遗物室：标记正反面（双方都看得到）+ 这名观看者现在能不能抽。
         *
         * ⚠ `relicRoomId` **必须按地图判**：遗物室只存在于**墓穴的 R6**。
         * 别的图（城堡等）也有叫 R6 的房间 —— 硬编码下发 `'R6'` 的话，
         * 那些图上一旦有遗物牌堆，站在 R6 的幸存者就会看到「抽取遗物」。
         * 现在没有遗物室就下发 `null`，客户端条件天然成立。
         */
        relicRoomId: hasRelicRoom(state) ? RELIC_ROOM : null,
        relicMarkerFaceUp: Boolean(state.relicMarkerFaceUp),
        relicDeckCount: (state.relicDeck ?? []).length,
        canDrawRelic: viewerFaction === 'survivor' ? canDrawRelic(state, viewPiece) : false,
        /**
         * **【墓穴遗物】**：背包里摊着的遗物（牌名给双方看 —— 遗物是公开信息）
         *  + 三张"要主动用"的遗物各自能不能用。
         *
         * 遗物**就是背包物品**，没有单独的遗物栏；这里只是把 `items` 里的遗物挑出来
         * 方便客户端在装备卡那一排显示 / 点开看牌面。
         */
        relics: namedCards(
            state,
            Object.keys(viewPiece.items ?? {}).filter((id) => relicKindOf(id) !== null),
        ),
        canUseMirrorPortal: canUseMirror(state, viewPiece),
        mirrorTargets: mirrorTargets(state),
        canUseInsightOrb: canUseInsight(state, viewPiece),
        highlightRoomIds: state.senseHighlight ? colorPrefixRooms(state, state.senseHighlight) : [],
        encounterTailBonus: state.encounterTailBonus,
        yourDiscardPile: (viewerFaction === 'killer'
            ? namedCardsNewestFirst(state, state.killerDiscard)
            : namedCardsNewestFirst(state, state.survivorDiscard)),
        pendingSurvivorPick: killerFogPhase ? false : state.pendingSurvivorPick,
        pendingDiscoveryPick: killerFogPhase ? false : state.pendingDiscoveryPick,
        discoveryActorId: killerFogPhase ? null : state.discoveryActorId,
        pileCounts: {
            search: state.searchDeck.length,
            discovery: state.discoveryDeck.length,
            /**
             * 狼人宝藏牌堆：**按真实张数**。
             * （以前硬编码 0 —— 所以幸存者地图上的「宝藏牌堆」永远显示「空」，
             *   哪怕牌堆里明明有 4 张。）
             */
            treasure: (state.treasureDeck ?? []).length,
            /** 【墓穴】遗物牌堆（双方都知道剩几张） */
            relic: (state.relicDeck ?? []).length,
            discard: state.survivorDiscard.length,
            /**
             * 杀手牌堆 / 弃牌堆张数只给杀手。
             * 单人热座同一个人要切到杀手界面，所以仍下发真实张数。
             */
            killerDraw: viewerFaction === 'survivor' && state.mode !== 'solo' ? 0 : state.killerDeck.length,
            killerDiscard: viewerFaction === 'survivor' && state.mode !== 'solo' ? 0 : state.killerDiscard.length,
        },
        pileCards: {
            search: viewerFaction === 'survivor' ? namedCardsSorted(state, state.searchDeck) : [],
            discovery: viewerFaction === 'survivor' ? namedCardsSorted(state, state.discoveryDeck) : [],
            /**
             * 宝藏牌堆只有 4 张（3 银质匕首 + 1 银质子弹），
             * 规则上双方都知道这套牌 —— 所以**照常给出牌名**，点开就能看到内容。
             * （以前是 `[]`，点开永远显示「空」。）
             */
            treasure: namedCardsSorted(state, state.treasureDeck ?? []),
            /** 【墓穴】遗物牌堆：牌名也给（规则上这套牌是公开信息） */
            relic: namedCardsSorted(state, state.relicDeck ?? []),
            discard: namedCardsNewestFirst(state, state.survivorDiscard),
            killerDraw: viewerFaction === 'killer' ? namedCardsSorted(state, state.killerDeck) : [],
            killerDiscard: viewerFaction === 'killer' ? namedCardsNewestFirst(state, state.killerDiscard) : [],
        },
        pileTops: {
            search: viewerFaction === 'survivor' ? namedTop(state, state.searchDeck) : null,
            discovery: viewerFaction === 'survivor' ? namedTop(state, state.discoveryDeck) : null,
            treasure: namedTop(state, state.treasureDeck ?? []),
            /** 【墓穴 R6】遗物牌堆顶（牌名公开） */
            relic: namedTop(state, state.relicDeck ?? []),
            discard: namedTop(state, [...state.survivorDiscard].reverse()),
            killerDraw: viewerFaction === 'killer' ? namedTop(state, state.killerDeck) : null,
            killerDiscard: viewerFaction === 'killer' ? namedTop(state, [...state.killerDiscard].reverse()) : null,
        },
        pendingItemDiscard: state.pendingItemDiscard
            ? (() => {
                const dp = state.players[state.pendingItemDiscard.playerId];
                const canSeeItems = Boolean(dp &&
                    (dp.controllerId === controllerId ||
                        (state.mode === 'solo' && controllerId === state.hostId)));
                return {
                    playerId: state.pendingItemDiscard.playerId,
                    count: state.pendingItemDiscard.count,
                    name: dp?.name,
                    inventorySlots: dp ? inventorySlotsFor(state, dp.id) : undefined,
                    items: canSeeItems && dp ? { ...dp.items } : undefined,
                };
            })()
            : null,
        pendingTrade: state.pendingTrade
            ? (() => {
                const offer = state.pendingTrade;
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
                    kind: offer.kind,
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
                youMustConfirm: isSurvivorOperator(state, controllerId) &&
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
                /** 剛毅之盾勾没勾（客户端用它回显那个独立开关） */
                shieldUsed: { ...(state.encounter.shieldUsed ?? {}) },
                defenseOptions: Object.fromEntries(Object.entries(state.encounter.defenseOptions).map(([k, v]) => [k, [...v]])),
                attackOptions: [...state.encounter.attackOptions],
                fleeQueue: [...state.encounter.fleeQueue],
                /**
                 * 【（甲）撤离先选人】交给客户端的名单：
                 *  - `fleeReadyIds`：**还没撤离、还能被点**的幸存者
                 *  - `fleeTargetId`：已经被选中、正在撤离的那一个（null = 正在等选人）
                 * 客户端据此画"谁来撤离"的名单，并在选中后显示撤离操作。
                 */
                fleeReadyIds: pendingFleeIds(state),
                fleeTargetId: state.encounter.targetId,
                /**
                 * 【变体3】燃燒瓶的第二段：防御物品确认完之后，单独问
                 * "要不要弃掉一个威士忌酒瓶 +2"。
                 *
                 * ⚠ **只发给幸存者视角**（用户口径：计划的事永远不告诉杀手）——
                 * 否则杀手从快照里看到"有人被问要不要弃威士忌"，就知道幸存者手里
                 * 有【燃燒瓶】这张计划卡了。
                 */
                whiskeyOffer: viewerFaction === 'survivor' && state.encounter.whiskeyOffer
                    ? { playerId: state.encounter.whiskeyOffer.playerId }
                    : null,
                /** 同理：谁弃了威士忌也**不下发给杀手**（那是【燃燒瓶】的痕迹） */
                whiskeyUsed: viewerFaction === 'survivor'
                    ? { ...(state.encounter.whiskeyUsed ?? {}) }
                    : {},
            }
            : null,
        killerHandCount: viewerFaction === 'survivor' && state.mode !== 'solo' ? 0 : state.killerHand.length,
        killerDeckCount: viewerFaction === 'survivor' && state.mode !== 'solo' ? 0 : state.killerDeck.length,
        yourKillerHand: showKillerHand ? [...state.killerHand] : null,
        yourKillerLocked: showKillerHand ? [...state.killerLocked] : null,
        winner: state.winner,
        winReason: state.winReason,
        logs: visibleLogs,
        activePlayerId: activeIdForViewer,
        legalMoves,
        cardById: state.cardById,
        trapRoomIds: viewerFaction === 'survivor' ? [...state.trapRoomIds] : [],
        /** 【陷阱零件】使用后留下的标记地点（只有幸存者看得到） */
        trapPartRooms: viewerFaction === 'survivor' ? [...(state.trapPartRooms ?? [])] : [],
        /**
         * 猎手本能：正在点地图选地点 / 已选待确认（只有杀手视角）。
         * 客户端据此在**快速阶段也让地图点击生效** —— 猎手本能是快速牌，
         * 打完就要点地点，不能等"结束快速阶段"。
         */
        killerSenseRoomActive: viewerFaction === 'killer' && state.killerSenseRoomActive === true,
        /**
         * 【保護色】杀手持有这张进化卡牌 → 「恐詭管道」的落点从
         * "带秘密通道的地点"变成**整张地图**。
         * 客户端用它把「或」选项的按钮文案写准（不然写着"带秘密通道的地点"、
         * 实际却满地图都能点）。只有杀手视角需要。
         */
        passageStealthAnywhere: viewerFaction === 'killer' && state.passageStealthAnywhere === true,
        /** 这次潜行落点是不是"任意地点" + 来源名（界面提示用，只给杀手） */
        pendingPassageAnywhere: viewerFaction === 'killer' && state.pendingPassageAnywhere === true,
        pendingPassageLabel: viewerFaction === 'killer' ? state.pendingPassageLabel ?? null : null,
        pendingSenseRoom: viewerFaction === 'killer' ? state.pendingSenseRoom : null,
        /**
         * **杀手打牌后拿到的信息区**（感知/追蹤/红外探测…）：
         * 客户端画在**地图右边**（类似战报的一块），不再需要"确认"。
         * 只给杀手看 —— 幸存者不该知道杀手感知到了什么。
         */
        killerIntel:
            viewerFaction === 'killer'
                ? (state.killerIntel ?? []).map((e) => ({ title: e.title, lines: [...e.lines] }))
                : [],
        /**
         * 【杀手界面】**本大回合的全部战报**（用户要求：放在地图旁边那块信息栏里）。
         * 只给杀手视角；内容按"他本来就看得见"过滤（见上面 `roundLogs` 的注释）。
         */
        roundLogs,
        /**
         * **杀手当前打出的牌**（卡牌 id）——**双方都下发**：
         * 幸存者在地图右边看到这张牌的卡面，知道杀手这回合打了什么。
         * 「当前」= 本回合最后打出的那张，回合开始清空。
         */
        currentKillerCardId: state.currentKillerCardId ?? null,
        /** 追踪：等杀手选一名幸存者 */
        pendingTrackerPick: viewerFaction === 'killer' && state.pendingTrackerPick,
        /** 君臨天下：等杀手选一名目击者移动（只有杀手视角） */
        pendingMoveSurvivorPick: viewerFaction === 'killer' ? [...(state.pendingMoveSurvivorPick ?? [])] : [],
        /**
         * 杀手地图上的「目击立绘」：幸存者上次被〔感知〕目击时在哪。
         * **只给杀手** —— 那是杀手的记忆；幸存者本来就知道自己在哪。
         */
        witnessedAt: viewerFaction === 'killer' ? { ...(state.witnessedAt ?? {}) } : {},
        witnessedRev: viewerFaction === 'killer' ? { ...(state.witnessedRev ?? {}) } : {},
        /** 雕像进化 1 级：等杀手决定要不要转换主雕像 */
        pendingStatueEvoSwitch: viewerFaction === 'killer' ? state.pendingStatueEvoSwitch : false,
        /** 已经点了、但还没确认的那尊（客户端把它的按钮画成"已选"） */
        pendingStatueEvoTarget: viewerFaction === 'killer' ? state.pendingStatueEvoTarget ?? null : null,
        /**
         * 雕像「重整旗鼓」：卡牌效果允许切换主雕像（打出的那张牌结算期间为 true）。
         * `…Switched` 表示**这次机会已经用掉了**（切过就不能再切）。
         * 客户端据此决定「主雕像切换面板」要不要显示 ——
         * 主雕像在开局选定后本局锁定，只有这两个时机能改。
         */
        pendingStatueRally: viewerFaction === 'killer' ? state.pendingStatueRally : false,
        pendingStatueRallySwitched:
            viewerFaction === 'killer' ? state.pendingStatueRallySwitched : false,
        /**
         * **重整旗鼓的第二步：移动封堵**。
         *
         * ⚠ 以前这两个字段**没有下发** —— 服务端的 `pickMoveBlockade` /
         * `placeMovedBlockade` 明明实现了，客户端却不知道"现在该移封堵"，
         * 于是界面上**根本没有这一步**（用户报的「场上有封堵标记没有移动封堵的步骤」）。
         */
        pendingStatueRallyMoveBlockade:
            viewerFaction === 'killer' ? state.pendingStatueRallyMoveBlockade : false,
        /** 已经选中、准备搬走的那扇门（`"A|B"`；没选就是 null） */
        pendingStatueMovedBlockadeFrom:
            viewerFaction === 'killer' ? state.pendingStatueMovedBlockadeFrom : null,
        /**
         * 2对3：先后手信息。
         *  - `killerOrderDecided`：两人偏好是否已一致（未定就继续在大厅提示选）
         *  - `killerTurnOrder`：本轮的先后手顺序（两个杀手棋子 id）
         *  - `killerTurnIndex`：这一轮轮到第几个
         */
        killerOrderDecided: state.mode === '2v3' ? state.killerOrderDecided : undefined,
        killerTurnOrder: state.mode === '2v3' ? [...state.killerTurnOrder] : undefined,
        killerTurnIndex: state.mode === '2v3' ? state.killerTurnIndex : undefined,
        killerIds: state.mode === '2v3' ? [...state.killerIds] : undefined,
        /**
         * 2对3：**另一名杀手**的只读信息（给【查看另一名杀手界面】用）。
         *
         * 两名杀手各自只看自己的行动区与卡牌区，但规则允许互相查看 ——
         * 所以这里把对方那套完整信息单独发一份，客户端只展示、不给操作入口。
         * 非 2v3 或非杀手视角时为 null。
         */
        otherKiller: (() => {
            if (state.mode !== '2v3' || viewPiece.faction !== 'killer') return null;
            const otherId = state.killerIds.find((id) => id !== viewPiece.id);
            const sl = otherId ? state.killers[otherId] : undefined;
            const kp = otherId ? state.players[otherId] : undefined;
            if (!otherId || !sl || !kp) return null;
            const ch = state.characters.find((c) => c.id === kp.characterId);
            return {
                id: otherId,
                name: kp.name,
                characterName: ch?.name ?? kp.name,
                power: sl.power,
                level: state.killerLevel,
                hand: [...sl.hand].map((id) => ({ id, name: state.cardById[id]?.name ?? id })),
                deckCount: sl.deck.length,
                discard: [...sl.discard].map((id) => ({ id, name: state.cardById[id]?.name ?? id })),
                locked: [...sl.locked].map((id) => ({ id, name: state.cardById[id]?.name ?? id })),
                repairGuess: sl.repairGuess,
                isActing: state.killerId === otherId,
                evolutionEffects: activeEvolutionLines(state, otherId),
            };
        })(),
        /**
         * 未命名：**已经选过的**进化卡牌（杀手信息里列效果 + 卡面金色高亮）。
         *
         * ⚠ **双方都下发**（用户口径：「未命名游戏中幸存者应该能看到杀手信息中
         * 选的进化卡牌和锁定牌」）——「杀手信息」那块面板本来就是双方共用的，
         * 摊在桌面上的进化卡牌对幸存者也是公开信息。
         * （⚠ 只公开**已选**的；`pendingEvolutionCardPick` 那个"正在挑"的候选
         *   仍然只给杀手 —— 那是还没落到桌面上的东西。）
         */
        chosenEvolutionCards: (state.chosenEvolutionCards ?? []).map((id) => {
            const c = state.cardById[id];
            return { id, name: c?.name ?? id, text: c?.text ?? '' };
        }),
        pendingEvolutionCardPick: viewerFaction === 'killer' && state.pendingEvolutionCardPick
            ? state.pendingEvolutionCardPick.map((id) => {
                const c = state.cardById[id];
                return { id, name: c?.name ?? id, text: c?.text ?? '' };
            })
            : null,
        /** 解锁二选一（刺耳噪声 / 酸液喷吐）：等杀手挑一张 */
        pendingUnlockChoice: viewerFaction === 'killer' && state.pendingUnlockChoice
            ? state.pendingUnlockChoice.map((id) => {
                const c = state.cardById[id];
                return { id, name: c?.name ?? id, text: c?.text ?? '' };
            })
            : null,
        /** 等玩家点门封堵：地点 + 还差几扇（扼杀者的牌、粘液腺体都用这套） */
        pendingBlockadeRoom: viewerFaction === 'killer' ? state.pendingBlockadeRoom : null,
        pendingBlockadeRemaining: viewerFaction === 'killer' ? (state.pendingBlockadeRemaining ?? 0) : 0,
        /** 核心标记满 5 个时：正准备放到哪个地点（等玩家选移除哪个） */
        pendingCoreOverflowPlaceAt:
            viewerFaction === 'killer' ? state.pendingCoreOverflowPlaceAt : null,
        // —— 女王（killer9）：僵尸 & 中毒 ——
        isQueenKiller: isQueenKiller(state),
        zombies: (state.zombies ?? []).map((z) => ({
            id: z.id,
            roomId: z.roomId,
            art: z.art,
            /** 每个僵尸的战力 = 女王的力量 */
            power: zombiePower(state),
        })),
        zombiePower: zombiePower(state),
        zombieMax: 6,
        /** 中毒标记（幸存者状态栏） */
        poisoned: [...(state.poisoned ?? [])],
        /** 十字弩：这名观看者能不能用 */
        canUseCrossbow: viewerFaction !== 'killer'
            && isQueenKiller(state)
            && state.phase === 'survivorMain'
            && (viewPiece.items.crossbow ?? 0) > 0
            /** 无限使用：只要**还有一般行动**就能用（不再限每回合一次） */
            && !viewPiece.mainActionUsed
            && crossbowTargets(state, viewPiece.id).length > 0,
        pendingCrossbow: viewerFaction !== 'killer' && state.pendingCrossbow
            && state.pendingCrossbow.survivorId === viewPiece.id
            ? { zombieIds: [...state.pendingCrossbow.zombieIds], max: state.pendingCrossbow.max }
            : null,
        /** 女王的待选（只给杀手） */
        pendingQueenMove: viewerFaction === 'killer' && state.pendingQueenMove
            ? {
                toRoomId: state.pendingQueenMove.toRoomId,
                zombieCount: state.pendingQueenMove.zombieIds.length,
            }
            : null,
        pendingZombieSearch: viewerFaction === 'killer' ? state.pendingZombieSearch : null,
        pendingZombieHordeFrom: viewerFaction === 'killer' ? state.pendingZombieHordeFrom : null,
        pendingZombieHordeTo: viewerFaction === 'killer'
            ? (state.pendingZombieHordeTo ? state.pendingZombieHordeTo.from : null)
            : null,
        pendingZombieSacrifice: viewerFaction === 'killer' ? state.pendingZombieSacrifice : null,
        /** 女王等级 4：已选的生成地点（等点满 2 个） */
        pendingQueenSpawnRooms: viewerFaction === 'killer' && state.pendingQueenSpawnRooms
            ? [...state.pendingQueenSpawnRooms]
            : null,
        pendingStranglerCoreRooms: viewerFaction === 'killer' && state.pendingStranglerCoreRooms
            ? [...state.pendingStranglerCoreRooms]
            : null,
        /** 乔治「拆封堵」笔记：幸存者侧的选择状态（含门号，用于显示按钮） */
        pendingGeorgeBlockade: state.pendingGeorgeBlockade
            ? {
                noteId: state.pendingGeorgeBlockade.noteId,
                doors: [...state.pendingGeorgeBlockade.doors],
                picked: [...state.pendingGeorgeBlockade.picked],
            }
            : null,
        /** 扼杀者：地图上的核心标记（双方地图都要同步显示） */
        coreMarkers: [...(state.coreMarkers ?? [])],
        /**
         * 幸存者能否移除自己地点的核心标记（扼杀者规则）：
         * 这是一般行动，所以要**轮到他**且**还没用过一般行动**。
         */
        canRemoveCoreMarker: viewerFaction !== 'killer'
            && isStranglerKiller(state)
            && state.phase === 'survivorMain'
            && !state.pendingSurvivorPick
            && activeSurvivorId(state) === viewPiece.id
            && !viewPiece.mainActionUsed
            && Boolean(viewPiece.roomId && (state.coreMarkers ?? []).includes(viewPiece.roomId))
            && !viewPiece.coreRemovedThisRound,
        isStranglerKiller: isStranglerKiller(state),
        /** 未命名：永久移除的卡牌（杀手信息里展示） */
        killerRemovedPermanently: viewerFaction === 'killer' ? [...(state.killerRemovedPermanently ?? [])] : [],
        /** 等杀手点地点（放/移核心标记、传送、酸液、恐詭管道） */
        pendingCorePick: viewerFaction === 'killer' ? state.pendingCorePick : null,
        pendingCoreRooms: viewerFaction === 'killer' ? [...(state.pendingCoreRooms ?? [])] : [],
        pendingCoreNeighbors: viewerFaction === 'killer' ? [...(state.pendingCoreNeighbors ?? [])] : [],
        /**
         * 移动核心标记第一步：已经点过的「从哪一格移走」。
         * ⚠ 以前**没下发** → 杀手点完第一格，地图上那一格没有任何标记，
         * 看不出自己点了哪（候选格只剩一个的时候尤其像"点了没反应"）。
         */
        pendingCoreFrom: viewerFaction === 'killer' ? state.pendingCoreFrom : null,
        pendingTeleportPick: viewerFaction === 'killer' ? [...(state.pendingTeleportPick ?? [])] : [],
        pendingPassagePick: viewerFaction === 'killer' ? [...(state.pendingPassagePick ?? [])] : [],
        /** 恐詭管道：已选中、等确认的落点（客户端画「确认潜入」按钮用） */
        pendingPassageRoom: viewerFaction === 'killer' ? state.pendingPassageRoom : null,
        /** 【變形 / 戰鬥適應】等杀手从弃牌堆挑要永久移除的牌 */
        pendingDiscardRemove: viewerFaction === 'killer' && state.pendingDiscardRemove
            ? {
                remaining: state.pendingDiscardRemove.remaining,
                cardName: state.pendingDiscardRemove.cardName,
                options: state.pendingDiscardRemove.optionsNamed.map((c) => ({ ...c })),
            }
            : null,
        pendingAcidPick: viewerFaction === 'killer' && state.pendingAcidPick,
        pendingReturnToDeckTop: viewerFaction === 'killer' && state.pendingReturnToDeckTop,
        /** 可选效果（牌面写了「可以」）：等杀手决定执行或跳过 */
        pendingOptionalEffect: viewerFaction === 'killer' && state.pendingOptionalEffect
            ? { label: state.pendingOptionalEffect.label }
            : null,
        /** 刺耳噪声：待决定是否放牌库顶的那张牌（杀手侧） */
        pendingDeckTopCard: viewerFaction === 'killer' && state.pendingDeckTopCard
            ? {
                id: state.pendingDeckTopCard,
                name: state.cardById[state.pendingDeckTopCard]?.name ?? state.pendingDeckTopCard,
            }
            : null,
        /** 【超听觉】多路径选择（只有杀手视角） */
        pendingMoveChoices: viewerFaction === 'killer' && state.pendingMoveChoices
            ? state.pendingMoveChoices.map((c) => ({
                label: c.label,
                rooms: c.path.map((id) => ({ id, name: roomName(state, id) })),
            }))
            : null,
        /** 「或」牌：给杀手显示可选的几组用法 */
        pendingEffectChoice: viewerFaction === 'killer' && state.pendingEffectChoice
            ? { options: state.pendingEffectChoice.options }
            : null,
        /**
         * **还有没有"打到一半、等杀手做选择"的牌。**
         *
         * 客户端以前自己抄了一份判定（`killerPlayable` 里逐个查 `pendingXxx`），
         * 于是每次闸门加字段两边都会漏 —— 用户报的
         * 「选择效果期间还能选择其他快速卡牌打」就是两边都漏了
         * `pendingEffectChoice` / `pendingMoveChoices`。
         * 现在直接下发服务端那一份答案，客户端照着置灰，不再各写一份。
         */
        pendingKillerChoice: hasPendingKillerChoice(state),
        /**
         * 潜行起点（幸存者用来判断「杀手是不是可能在我这格」）。
         * 这是幸存者侧情报：杀手自己拿到没用，旁观/观战也不该顺着它找杀手。
         */
        stealthOriginRoomId: viewerFaction === 'survivor'
            ? (Object.values(state.players).find((pl) => pl.faction === 'killer' && pl.stealth)
                ?.stealthOriginRoomId ?? null)
            : null,
        turnOrder: [...state.turnOrder],
    };
}

/** 这桌上还连着网的操控者名单 */
export function listControllerIds(state: GameState): string[]
{
    const set = new Set<string>();
    for (const p of Object.values(state.players)) {
        if (p.connected)
            set.add(p.controllerId);
    }
    return [...set];
}

