/**
 * 杀手牌的逐条结算。
 * 一张牌可能有好几步：先惊吓，再走路，再封门。
 * 需要玩家点地图时就停下来等；点完再 continueKillerQueue 继续。
 */
import type { CardDef, EffectDef } from '../content/schema.js';
import type { GameState, PlayerState, StealthRevealKind } from './types.js';
import {
  addFear,
  addKillerTurnPower,
  applyDamage,
  drawKillerCards,
  discardConsumedItem,
  injuredSurvivorIds,
  isLowProfile,
  log,
  mapDist,
  placeBlockade,
  roomName,
  setKillerInfo,
  setStealth,
  survivorActionVis,
  tryMove,
  killerAdjacentRooms,
  noteSingleRoomSense,
  noteSurvivorSeenAt,
} from './effects.js';
/** 守護之石出示后要**从背包移除并进普通弃牌堆**（它不是 ∞） */
import { discardRelic, removeRelic } from './relic.js';
import {
  hasEvolutionPending,
  maybeOfferWhizSearch,
  maybePromptOverFearWound,
  finishEncounterOpen,
  startOneDoorBlockade,
  startSealAllBlockade,
  killerKindOf,
  /** 女猎手进化 4 级：追逐之后的〔移動〕×0-1 */
  huntressTrackerFollowupMove,
} from './evolution.js';
import {
  resolveExecute,
  resolvePatrol,
  resolveRally,
  resolveRelease,
  resolveSiege,
  resolveSummonSeal,
  finishStatueStep,
  afterStatueMoves,
  pickStatueStep,
} from './statues.js';

/**
 * **engine 的 `case 'pickStatueStep'` 用这个**。
 *
 * 为什么不直接让 engine import `pickStatueStep`：`statues.ts` 已经 import 了
 * `engine.ts`（`mainStatue` / `statuePieces` 那些），engine 再反向 import 就成环。
 * 而 `killerCards` 两边都能 import —— 所以拿它当中间层，和别的雕像逻辑一致。
 */
export function pickStatueStepAction(state: GameState, statueId: string): string | null {
  return pickStatueStep(state, statueId);
}
import {
  spawnZombieAtQueen,
  poisonSurvivor,
} from './zombies.js';
import {
  addPermanentPower,
  addPowerUntilNextTurn,
  beginBlockadeAtCore,
  beginBlockadeHere,
  beginMoveCore,
  beginPlaceCore,
  beginRemoveCore,
  beginRemoveFromDiscardPermanent,
  beginSenseRoom,
  beginStealthAnywhere,
  beginTeleportToCore,
  beginTrackerDistance,
  damageCoreOrPassageRooms,
  moveNearestNoiseSearch,
  placeCoreAt,
  removeFromDiscardPermanent,
  requestBlockadeAt,
  resetHunterTraps,
  senseAllNoise,
  senseRange,
  stealthToPassage,
} from './killerSpecials.js';

/**
 * 杀手是不是还在等玩家点地图 / 选颜色 / 选人 / 确认进化？没点完不能进入下一阶段。
 *
 * ⚠ **这个表必须和"会挂起待选"的字段一一对应。**
 *
 * 以前漏了一大批（恐詭管道、召唤石碑、屍群來了、屍體爆炸、抓住他們!、
 * 君臨天下、追蹤、扼杀者 4 级、女王 4 级、變形/戰鬥適應…）——
 * 表现和「猎手本能」那次是**同一类**问题：打完牌没人拦，
 * 玩家可以先去"结束快速阶段 / 走一般行动"，等阶段都过去了那个待选还挂着，
 * 再点地图就被那个分支截走，效果和时机全乱。
 *
 * ⚠ 数组字段要按**各自的"空"语义**判：
 *  - `pendingQueenSpawnRooms` / `pendingZombieSacrifice` / `pendingZombieSearch` /
 *    `pendingZombieHordeFrom` / `pendingZombieHordeTo` / `pendingStranglerCoreRooms`：
 *    **空数组也算"正在等"**（就是要让玩家去点满），所以判 `!= null`；
 *  - `pendingPassagePick` / `pendingMoveSurvivorPick`：空数组 = 没有待选，判长度。
 */
export function hasPendingKillerChoice(state: GameState): boolean {
  return (
    state.pendingMoveRange != null ||
    state.pendingBlockade ||
    Boolean(state.pendingBlockadePlace) ||
    Boolean(state.pendingSensePair) ||
    state.pendingSenseColor ||
    state.pendingLurkPick ||
    Boolean(state.pendingAmulet) ||
    /**
     * 【女猎手・猎手本能 / 女王・君臨天下】等杀手点地图选一个地点。
     *
     * ⚠ 漏了它会串台（用户报的"【猎手本能】不能选择地点，但在一般行动中
     * 选了一个地点后会突然变成【猎手本能】所选的地点"）：
     * 打牌后没有这道闸门，玩家可以去做别的（结束快速阶段、走普通行动），
     * 而地图点击又被 `killerSenseRoomActive` 那一支截走 ——
     * 于是"移动选的格子"变成了"感知的地点"。
     */
    Boolean(state.killerSenseRoomActive) ||
    Boolean(state.pendingPathDraft) ||
    // 刺耳噪声：等杀手决定要不要把牌放到摸牌堆顶
    Boolean(state.pendingDeckTopCard) ||
    // 可选效果（牌面写了「可以」）：等杀手决定执行或跳过
    Boolean(state.pendingOptionalEffect) ||
    // 未命名：等杀手点地点（核心标记/传送/酸液/恐詭管道）
    Boolean(state.pendingCorePick) ||
    Boolean(state.pendingTeleportPick) ||
    Boolean(state.pendingAcidPick) ||
    /**
     * **「或」牌：等杀手在行动区二选一。**
     *
     * ⚠ 用户报的「杀手打快速行动卡牌，选择效果期间还能选择其他快速卡牌打，
     * 应该上一张执行完才能打下一张」就是这个漏的 —— `applyQueued` 挂起
     * `pendingEffectChoice` 之后，`playKillerCard` 开头那道闸门查不出"还在等"，
     * 于是能连着打第二张，两张牌的效果还会**串在同一个待选上**。
     */
    Boolean(state.pendingEffectChoice) ||
    /**
     * **超听觉：多条并列最快路径，等杀手在行动区选一条。**
     * 同上一类 —— 选中之前不许再打别的牌。
     */
    (state.pendingMoveChoices?.length ?? 0) > 0 ||
    /** 恐詭管道：潜行落点（空数组 = 没有待选，按长度判） */
    (state.pendingPassagePick?.length ?? 0) > 0 ||
    Boolean(state.pendingEvolutionCardPick) ||
    // 解锁二选一（刺耳噪声 / 酸液喷吐）
    Boolean(state.pendingUnlockChoice) ||
    // —— 下面这些以前**漏在闸门外面** ——
    /** 女猎手「追蹤」：等杀手在列表里选一名幸存者 */
    Boolean(state.pendingTrackerPick) ||
    /** 雕像「召唤石碑」：等杀手点两下地图选一扇门 */
    Boolean(state.pendingStatueSeal) ||
    /**
     * 雕像「巡邏 / 圍困」：等杀手**选下一尊要移动/搜索的雕像**
     * （用户要求顺序由杀手自己选）。
     */
    state.pendingStatuePick != null ||
    /** 女王「屍群來了」：先选出发地、再选目的地 */
    state.pendingZombieHordeFrom != null ||
    state.pendingZombieHordeTo != null ||
    /** 女王「屍體爆炸」：等杀手点一个要献祭的僵尸 */
    state.pendingZombieSacrifice != null ||
    /** 女王「抓住他們！」：等杀手点一个要搜索的僵尸 */
    state.pendingZombieSearch != null ||
    /** 女王「君臨天下」：等杀手选一名目击者移动（空数组 = 没有待选） */
    (state.pendingMoveSurvivorPick?.length ?? 0) > 0 ||
    /** 女王等级 4 / 扼杀者等级 4：等杀手点 2 个地点（空数组也算"正在等"） */
    state.pendingQueenSpawnRooms != null ||
    state.pendingStranglerCoreRooms != null ||
    /** 未命名「變形 / 戰鬥適應」：等杀手从弃牌堆挑要永久移除的牌 */
    state.pendingDiscardRemove != null ||
    /**
     * 打牌后拿到的信息（感知看到了谁、追蹤距离、红外探测结果…）
     * **已经不在闸门里了** —— 用户要求删掉"行动区确认信息"那套流程，
     * 信息改成放在**地图右边的信息区**（`state.killerIntel`），不挡任何操作。
     */
    hasEvolutionPending(state)
  );
}

/** 这张牌现在算快速、特殊还是慢速（链锯轰鸣 4 级变快速） */
export function effectiveCardSpeed(state: GameState, card: CardDef): string | undefined {
  if ((card.id === 'butcher_saw_1' || card.id === 'butcher_saw_2') && state.killerLevel >= 4) {
    return 'fast';
  }
  return card.speed;
}

/** 房间号以 R/B/G 开头的，分别是红蓝绿区 */
export function colorPrefixRooms(state: GameState, color: 'R' | 'B' | 'G'): string[] {
  return state.map.rooms.filter((r) => r.id.startsWith(color)).map((r) => r.id);
}

/** 这些房间里感知能看见谁（安娜除外） */
export function senseVisibleInRooms(state: GameState, roomIds: string[]): PlayerState[] {
  const set = new Set(roomIds);
  return Object.values(state.players).filter(
    (s) =>
      s.faction === 'survivor' &&
      s.alive &&
      s.roomId &&
      set.has(s.roomId) &&
      !isLowProfile(state, s),
  );
}

/**
 * 女王**等级 2**：「如果你使用〔感知〕**目击**了任何幸存者，〔惊吓〕他们。」
 *
 * 每个〔感知〕类效果结算完都要调它一次。
 * 放在 killerCards 里（而不是 killerSpecials）是为了避免模块循环。
 */
export function queenSenseFear(state: GameState, witnessed: PlayerState[]): number {
  if (killerKindOf(state) !== 'queen' || state.killerLevel < 2) return 0;
  if (!witnessed.length) return 0;
  for (const t of witnessed)
    addFear(state, t.id, 1);
  log(
    state,
    `女王进化 2 级：〔感知〕目击了 ${witnessed.map((s) => s.name).join('、')}，〔惊吓〕他们。`,
    'all',
    true,
  );
  return witnessed.length;
}

/** 离某格不超过 range 步的活着的幸存者 */
export function survivorsWithin(
  state: GameState,
  from: string,
  range: number,
): PlayerState[] {
  return Object.values(state.players).filter((s) => {
    if (s.faction !== 'survivor' || !s.alive || !s.roomId) return false;
    return mapDist(state, from, s.roomId, false) <= range;
  });
}

/** 桌上那名杀手棋子 */
function killerActor(state: GameState): PlayerState | null {
  return state.killerId ? state.players[state.killerId] ?? null : null;
}

/** 距离内所有幸存者各加 1 恐惧；没人就记“没有人受到惊吓” */
export function fearAtRange(state: GameState, origin: string, range: number): string[] {
  const hits = survivorsWithin(state, origin, range);
  const names: string[] = [];
  for (const s of hits) {
    addFear(state, s.id, 1);
    names.push(s.name);
  }
      if (names.length) log(state, `受到惊吓：${names.join('、')}。`);
      else log(state, '没有人受到惊吓。');
  maybePromptOverFearWound(state);
  return names;
}

/**
 * 「君臨天下」目击者移动结算完的收尾回调。
 * 由 engine 注入（那里有 maybeStartEncounter / maybeFinishKillerMain）——
 * 本文件不能反向 import engine，会成环。
 */
let onMoveSurvivorDone: ((state: GameState) => void) | null = null;
export function setMoveSurvivorDoneHandler(fn: (state: GameState) => void) {
  onMoveSurvivorDone = fn;
}

/**
 * 「追蹤」先搜索、**命中就立刻开遭遇**的回调。
 * 同样由 engine 注入（不能反向 import）。
 *
 * @returns true = 已开战 → 后面的"展示距离"整条跳过
 */
let onSearchFound: ((state: GameState) => boolean) | null = null;
export function setSearchFoundHandler(fn: (state: GameState) => boolean) {
  onSearchFound = fn;
}

/** 按顺序执行这张牌剩下的效果；碰到要玩家点选的就停 */
export function continueKillerQueue(state: GameState): void {
  if (state.pendingAmulet || state.pendingOverFearWound) return;
  const k = killerActor(state);
  if (!k) {
    state.pendingEffectQueue = [];
    return;
  }
  while (state.pendingEffectQueue.length) {
    if (state.phase === 'gameOver' || state.pendingAmulet || state.pendingOverFearWound) return;
    const fx = state.pendingEffectQueue.shift()!;
    if (applyQueued(state, k, fx)) return;
  }
  /**
   * 注意：**不要在这里 flush `deferredPlayedCard`** ——
   * 这个函数会在打牌中途被递归调用，队列那时也可能是空的，
   * 会把牌过早推进弃牌堆。改由打牌流程的真正出口（engine.ts）负责 flush。
   */
  maybeOfferWhizSearch(state);
}

/**
 * 打出的牌本身：**效果全部结算完之后**才进弃牌堆。
 *
 * 打牌时先挂在 `state.deferredPlayedCard`，所以「永久从弃牌堆移除」
 * 这条效果执行时看不到它 —— 对应规则「不能选择此牌本身」。
 * 队列清空、且没有其它待玩家操作时，才把它推入弃牌堆。
 */
export function flushDeferredPlayedCard(state: GameState): void {
  const id = state.deferredPlayedCard;
  if (!id)
    return;
  /**
   * 还有待选 / 还有队列 / 还在等点门 → 先别放，等真正结算完。
   * 注意 `pendingBlockade` 不在 `hasPendingKillerChoice` 里，
   * 但它同样是「等玩家点门」，必须一起挡住（否则「茂盛」会提前进弃牌堆）。
   */
  if (state.pendingEffectQueue.length ||
    hasPendingKillerChoice(state) ||
    state.pendingDeckTopCard ||
    state.pendingBlockade)
    return;
  state.deferredPlayedCard = null;
  /**
   * ⚠ **牌其实在"打出"的那一刻就已经进弃牌堆了**（用户要求：效果执行时
   * 弃牌堆顶就是刚打出的那张）。这里只负责**撤掉"刚打出"的标记** ——
   * 撤掉之后「變形 / 戰鬥適應」的『永久从弃牌堆移除』才允许把它列为候选。
   *
   * `deferredPlayedCard` 这个标记的作用就是**在效果结算期间排除"自己"**
   * （规则：不能选择此牌本身），所以它必须活到效果全部跑完。
   * 下面那句是**兜底**：万一有哪条路径没把它推进弃牌堆（比如「放牌库顶」
   * 被取消），这里补一次；已经在了就不重复 push。
   */
  if (state.killerDiscard.includes(id) || state.killerDeck.includes(id) || state.killerHand.includes(id))
    return;
  state.killerDiscard.push(id);
}

/**
 * **遭遇打断「当前这张牌」剩下的效果。**
 *
 * 用户规则：「所有杀手在遭遇之后都会直接到结束回合，如果还有什么卡牌的
 * 效果没执行就跳过」—— 但范围**只有"当前这张牌上、写在搜索之后的效果"**；
 * 别的效果（比如屏息的力量加成，那是一结算就直接加上的）**不受影响**。
 *
 * ⚠ 全项目扫过一遍：**唯一**"搜索之后还有效果"的牌是【追蹤】
 * （`searchTrackerDistance` = 〔搜索〕＋展示距离）。而且它已经由
 * `case 'searchTrackerDistance'` 自己 `return true` 处理掉了，不进队列。
 * 下面是给"以后新增同类牌"兜底的通用清理：
 *  - `pendingEffectQueue`：这张牌还没跑完的剩余效果
 *  - `pendingTrackerPick`：这张牌挂起的"选一名幸存者展示距离"
 *
 * ⚠ 这里**只清这两样**，不要顺手清别的待选 —— 遭遇发生时能挂着的待选
 * 本来就只可能是当前这张牌的，多清容易误伤。
 */
export function interruptCurrentCardEffects(state: GameState): void {
  state.pendingEffectQueue = [];
  state.pendingTrackerPick = false;
}

/** @returns true if waiting for player input */
/**
 * 执行杀手牌的一条效果。
 * 返回 true = 还要等玩家点（走路、封门、选颜色），先别继续下一条。
 */
function applyQueued(state: GameState, k: PlayerState, fx: EffectDef): boolean {
  /**
   * 「或」牌：这条效果带了 alternatives，就先停下来让杀手二选一。
   * 选完由 `chooseEffectOption` 把选中的那组塞回队列。
   *
   * ⚠ **【保護色】例外**（用户口径）：
   * 拿了【保護色】之后「恐詭管道」的落点已经是**整张地图**，
   * 另一个用法（潛行 + 移動 0-1）就是多余的了 ——
   * 所以**不再问二选一**，直接按 `stealthToPassage` 走，
   * 让玩家点地图选地点（选完还要确认）。
   */
  if (fx.alternatives?.length) {
    /**
     * ⚠ **【保護色】例外**（用户口径）：
     * 「未命名选择了【保護色】后，【恐詭管道】**不需要二选一**，
     *   但是选择了地点后要确认」。
     *
     * 【恐詭管道】的写法是 `stealthAndMove` + `alternatives: [stealthToPassage]`。
     * 拿了【保護色】之后「潛行到任何地点」已经是更好的那条，
     * 「潛行 + 移動 0-1」就是多余的 —— 所以**不问二选一**，
     * 直接把 alternatives 里那条（`stealthToPassage`）当成本效果执行。
     */
    if (fx.op === 'stealthAndMove' && state.passageStealthAnywhere) {
      const passageOnly = fx.alternatives.find((a) => a.op === 'stealthToPassage');
      if (passageOnly)
        return applyEffectNow(state, k, passageOnly as EffectDef);
    }
    const options: EffectDef[][] = [];
    // 第一组 = 这条效果本身（去掉 alternatives）
    const self: EffectDef = { ...fx };
    delete self.alternatives;
    options.push([self]);
    for (const alt of fx.alternatives) options.push([alt]);
    state.pendingEffectChoice = { base: [], options };
    log(state, '这张牌有两种用法，请在行动区选择一种。', 'killer');
    return true;
  }
  /**
   * **可选**效果（牌面写了「可以」）：
   * 停下来问「做 / 不做」。没标 `optional` 的效果一律**必须执行**，
   * 引擎直接往下结算，不打断。
   */
  if (fx.optional) {
    const label = optionalEffectLabel(fx);
    state.pendingOptionalEffect = { fx, label };
    log(state, `${label}：你可以选择执行，或跳过。`, 'killer');
    return true;
  }
  return applyEffectNow(state, k, fx);
}

/**
 * 执行一条**可选**效果（玩家选了「执行」）。
 * 直接走正常结算路径，不重复「可选」判断。
 */
export function runOptionalEffect(state: GameState, fx: EffectDef): void {
  const k = killerActor(state);
  if (!k) return;
  applyEffectNow(state, k, fx);
}

/** 可选效果在行动区显示的名字 */
function optionalEffectLabel(fx: EffectDef): string {
  switch (fx.op) {
    case 'returnToDeckTop':
      return '把这卡牌背面向上放到你的摸牌堆顶';
    default:
      return '执行这个可选效果';
  }
}

/**
 * 真正执行一条效果（不含「或」「可选」这类需要停顿的分支）。
 */
function applyEffectNow(state: GameState, k: PlayerState, fx: EffectDef): boolean {
  switch (fx.op) {
    // —— 雕像杀手（killer6）专用 ——
    case 'statueMove': {
      // 巡邏：整张牌由 resolvePatrol 处理（抽 1 张 + 所有雕像移动）
      return resolvePatrol(state, fx);
    }
    case 'statueDraw':
      // 由 resolvePatrol 统一抽牌，走到这里说明牌面只写了抽牌
      return false;
    case 'statueExecute':
      resolveExecute(state);
      return false;
    case 'statueRally':
      return resolveRally(state);
    case 'statueRelease':
      return resolveRelease(state);
    case 'statueSummonSeal':
      return resolveSummonSeal(state);
    case 'statueSiege':
      return resolveSiege(state);
    // —— 女猎手（killer4）——
    case 'senseRoom':
      return beginSenseRoom(state);
    case 'searchTrackerDistance': {
      /**
       * 追蹤（牌面：「〔搜索〕。展示一名幸存者与你之间的距离。」）——
       * **先搜索，再展示距离**，顺序不能反（用户报过"现在是反的"）。
       *
       * ⚠ 搜索**命中**就**立刻开遭遇**：这场遭遇就是这张牌的结果，
       * 后面的"展示距离"**整条跳过**（用户明确要求）。
       * 遭遇打完杀手直接结束回合，不会再回来补展示。
       */
      const found = applyQueued(state, k, { op: 'searchSurvivors' });
      if (found) return true;
      /** 命中 → 开战（由 engine 注入的回调开）；开了就到此为止 */
      if (onSearchFound?.(state)) return true;
      return beginTrackerDistance(state);
    }
    case 'stealthResetTraps':
      resetHunterTraps(state);
      return false;
    case 'modifyPowerUntilNextTurn':
      if (typeof fx.value === 'number') addPowerUntilNextTurn(state, fx.value);
      return false;
    // —— 狼人（killer5）——
    case 'moveNearestNoiseSearch':
      return moveNearestNoiseSearch(state);
    case 'senseAllNoise':
      senseAllNoise(state);
      return false;
    // —— 未命名（killer7）——
    case 'removeFromDiscardPermanent': {
      /**
       * **永久从弃牌堆移除 N 张 —— 由玩家自己挑**（用户要求）。
       * 挂起 `pendingDiscardRemove`，返回 true 表示"还要等玩家点牌"。
       */
      const n = typeof fx.value === 'number' ? fx.value : 1;
      const played = state.deferredPlayedCard;
      const cardName = played ? (state.cardById[played]?.name ?? played) : '这张牌';
      /** 刚打出的这张牌**不能**被移除（规则明写） */
      const exclude = played ? [played] : [];
      return beginRemoveFromDiscardPermanent(state, n, cardName, exclude);
    }
    case 'permanentPower':
      if (typeof fx.value === 'number') addPermanentPower(state, fx.value);
      return false;
    /**
     * 【女王・召喚亡者】「在你的地点生成 1 个僵尸；**抽取一张卡牌**」。
     *
     * ⚠ 这里以前**没有 `case 'draw'`** —— 效果被静默丢掉了，
     * 所以用户报的"召唤亡者没有抽牌"。摸牌走既有的 `drawKillerCards`
     * （它自带"牌堆空了先进化再洗回"的处理）。
     */
    case 'draw': {
      const n = typeof fx.value === 'number' ? Math.max(0, fx.value) : 1;
      if (n > 0) drawKillerCards(state, n);
      return false;
    }
    case 'transformBonus':
      /** 粘液腺體：使用「變形」後抽一張卡牌並在你的地點〔封堵〕×2 */
      if (!state.slimeGlandActive) return false;
      /**
       * ⚠ 抽牌**必须走统一的 `drawKillerCards`**：它一张一张摸，
       * 牌堆空了会先触发**进化**（`refillKillerDeckIfEmpty`）再接着摸，
       * 手牌满了也会正确地正面朝上进弃牌堆。
       * 以前这里是 `killerDeck.shift()` 直接拿 —— 牌堆空时既不抽、也不进化，
       * 和「召喚亡者」的 `case 'draw'` 口径不一致（用户要求统一）。
       */
      drawKillerCards(state, 1);
      {
        const k = killerActor(state);
        if (k?.roomId) {
          /** 封堵×2：封哪扇门由玩家点，所以发起「点门」请求（还差 2 扇） */
          state.pendingBlockadeRemaining = 2;
          requestBlockadeAt(state, k.roomId, '粘液腺體');
        }
      }
      return true;
    case 'senseRange':
      senseRange(state, typeof fx.value === 'number' ? fx.value : 1);
      return false;
    /**
     * ⚠ **进化卡牌的那 6 个 op 原来在这里各有一个 `case`，已经删掉**：
     * `passageBecomesAnyStealth` / `crawlBecomesOneToThree` / `nextAttackPower` /
     * `powerUntilTurnEndOnPassage` / `sonarReveal` / `slimeGland`。
     *
     * 为什么删：这 6 个 op **只出现在进化卡牌自己的 `effects` 里**
     * （`decks.evolutionCard`），而进化卡牌**根本不走这条 `runEffects` 路** ——
     * 获得时走的是 `killerSpecials.applyEvolutionCard()` 的 `switch (cardId)`。
     * 所以这些 `case` 一次都不可能被执行，是死代码
     * （留着更糟：改这里会以为生效了，其实毫无作用）。
     *
     * ⚠ `content` 的 schema 枚举**必须保留**这几个 op ——
     * 删了的话内容加载校验会直接失败。
     */
    case 'returnToDeckTop':
      /**
       * 刺耳噪声：把本卡牌背面向上放到摸牌堆顶。
       * 牌面写的是「**你可以**」→ 标了 `optional: true`，
       * 所以上面那层已经停下问过了；走到这里说明玩家选了「执行」。
       * 实际移动由 `resolveDeckTop` 完成（打牌时已把它从手牌拿走、没进弃牌堆）。
       */
      state.pendingReturnToDeckTop = true;
      return false;
    case 'stealthToPassage':
      return stealthToPassage(state);
    /**
     * **〔潛行〕到任意地点** —— 女猎手「陷阱重置」用（卡面：「〔潜行〕到任意地点」）。
     *
     * ⚠ 用户口径：它和**保護色版的「恐詭管道」完全一致** ——
     * **没有路径**，只有「点一个地点 → 按确认潜入」。
     * 以前这张牌写的是 `move ×0-99`（逐格规划路径），手感完全不同。
     */
    case 'stealthToAnywhere':
      return stealthToPassage(state, { anywhere: true, label: '陷阱重置' });
    case 'stealthAndMove': {
      const max = typeof fx.value === 'number' ? fx.value : 1;
      const min = typeof fx.min === 'number' ? fx.min : 0;
      return beginStealthAnywhere(state, max, min);
    }
    case 'acidSpray':
      state.pendingAcidPick = true;
      log(state, '酸液喷吐：请点一个相邻地点（将伤害这两个地点并封堵它们之间的门）。', 'killer');
      return true;
    // —— 扼杀者（killer8）——
    case 'placeCore': {
      /**
       * 【茂盛】「在你的地点放置一个核心标记」——
       * **位置是确定的（扼杀者所在地点），不能让玩家自选。**
       * 以前这里走 `beginPlaceCore`（进入"点地图选位置"），与规则不符。
       * 上限条件由 `playKillerCard` 的**打出前检查**负责（已满 5 个就不给打）。
       */
      const kc = killerActor(state);
      if (!kc?.roomId) {
        log(state, '茂盛：你不在图上，无法放置核心标记。', 'killer');
        return false;
      }
      placeCoreAt(state, kc.roomId);
      return false;
    }
    case 'removeCore':
      return beginRemoveCore(state);
    case 'attackBlockItems': {
      // 荊棘纏繞（攻击时机）：本次攻击中目标不能使用任何物品
      state.encounterBlockItems = true;
      if (state.encounter) state.encounter.blockItems = true;
      log(state, '荊棘纏繞：本次攻击中目标不能使用任何物品。', 'all', true);
      return false;
    }
    case 'placeBlockadeAtCore':
      return beginBlockadeAtCore(state);
    case 'blockadeHereAuto': {
      /**
       * 扼杀者「茂盛」：**在你的地点**〔封堵〕×N。
       * 封哪扇门**由玩家点**（规则要求），只有没有可封的门才自动跳过。
       */
      const k = killerActor(state);
      if (!k?.roomId)
        return false;
      const n = typeof fx.value === 'number' ? fx.value : 1;
      state.pendingCorePick = null;
      return beginBlockadeHere(state, n);
    }
    case 'teleportToCore':
      return beginTeleportToCore(state);
    case 'moveCoreToAdjacent':
      return beginMoveCore(state);
    case 'attackValuePerCore':
      /**
       * 扼殺：本次攻击 +x 力量（x = 当前地图上核心标记数量）。
       * 数值由 `encounterCardAttackBonus` 在打出时统一算进本次攻击，
       * 这里不需要再做事（遭遇流程会报告总攻击力）。
       */
      return false;
    case 'damageCoreOrPassageRooms':
      damageCoreOrPassageRooms(state);
      return false;
    // —— 女王（killer9）——
    case 'spawnZombie':
      /** 召喚亡者：在你的地点生成 1 个僵尸（地图满 6 个则取消） */
      spawnZombieAtQueen(state);
      return false;
    case 'zombieSearch': {
      /** 抓住他們！：选择 1 个僵尸〔搜索〕 */
      const zs = state.zombies ?? [];
      if (!zs.length) {
        log(state, '抓住他們！：地图上没有僵尸。', 'killer');
        return false;
      }
      state.pendingZombieSearch = zs.map((z) => z.id);
      log(state, '抓住他們！：请点一个僵尸让牠〔搜索〕。', 'killer');
      return true;
    }
    case 'zombieHordeMove': {
      /**
       * 屍群來了：任意一个地点中的所有僵尸朝同一个目的地〔移動〕×N。
       * 由玩家选**出发地点**，再选**目的地**。
       */
      const rooms = [...new Set((state.zombies ?? []).map((z) => z.roomId))];
      if (!rooms.length) {
        log(state, '屍群來了：地图上没有僵尸。', 'killer');
        return false;
      }
      state.pendingZombieHordeFrom = rooms;
      log(state, `屍群來了：请点一个有僵尸的地点作为出发地：${rooms.map((id) => roomName(state, id)).join('、')}。`, 'killer');
      return true;
    }
    case 'poisonTarget': {
      /**
       * 毒液之觸（攻击时机）：使目标〔中毒〕。
       * 规则：「仅当女王参与本次攻击才能使用」—— 女王本体打这次遭遇才行。
       */
      const targetId = state.encounter?.targetId;
      if (!targetId) {
        log(state, '毒液之觸：当前没有遭遇目标。', 'killer');
        return false;
      }
      poisonSurvivor(state, targetId, (id, amount) =>
        /**
         * ⚠ 伤害来源用**正在行动的那尊雕像**（`k.id`），不要退回主雕像 ——
         * 特性 11「恐惧迸发」认"当前遭遇中的那尊雕像"（用户口径），
         * 写死主雕像会让非主雕像造成的伤害触发不了它。
         */
        applyDamage(state, id, amount, k.id));
      return false;
    }
    case 'sacrificeZombiePoisonRange': {
      /** 屍體爆炸：献祭 1 个僵尸，使距离 N 内所有幸存者〔中毒〕 */
      const zs = state.zombies ?? [];
      if (!zs.length) {
        log(state, '屍體爆炸：地图上没有僵尸可献祭。', 'killer');
        return false;
      }
      state.pendingZombieSacrifice = zs.map((z) => z.id);
      log(state, '屍體爆炸：请点一个要献祭的僵尸。', 'killer');
      return true;
    }
    case 'senseThenMoveSurvivor':
      /**
       * 君臨天下：〔感知〕一个地点；
       * 若目击幸存者 → 记到杀手地图上，并**选其中一名按杀手指定的路径移动 0–2 步**。
       */
      state.pendingSenseMoveAfter = true;
      return beginSenseRoom(state);
    case 'senseColor':
      state.pendingSenseColor = true;
      log(state, '请选择要感知的颜色区域：红 / 蓝 / 绿。', 'killer');
      return true;
    case 'senseAdjacentPair':
      state.pendingSensePair = { firstRoomId: null };
      log(state, '逻辑推理：请先点任意一个地点，再点一个与它相连的地点（门或一般通道，不含特殊通道；这两处不必与你相邻）。', 'killer');
      return true;
    case 'move': {
      const max = typeof fx.value === 'number' ? fx.value : 1;
      const min = typeof fx.min === 'number' ? fx.min : 0;
      state.pendingPathDraft = { min, max, rooms: k.roomId ? [k.roomId] : [] };
      log(
        state,
        `请依次点相邻地点规划路径（${min}–${max} 步）。再点同一格可取消该步。步数合法后在行动区确认，才会移动。`,
        'killer',
      );
      return true;
    }
    case 'addFearRange': {
      if (!k.roomId) return false;
      const range = typeof fx.value === 'number' ? fx.value : 1;
      fearAtRange(state, k.roomId, range);
      return false;
    }
    case 'addFearPath': {
      const rooms = state.lastMovePath.length ? state.lastMovePath : k.roomId ? [k.roomId] : [];
      const names: string[] = [];
      for (const s of Object.values(state.players)) {
        if (s.faction !== 'survivor' || !s.alive || !s.roomId) continue;
        if (!rooms.includes(s.roomId)) continue;
        addFear(state, s.id, 1);
        names.push(s.name);
      }
      if (names.length) log(state, `路径上受到惊吓：${names.join('、')}。`);
      else log(state, '路径上没有人受到惊吓。');
      return false;
    }
    case 'addFear': {
      const amount = typeof fx.value === 'number' ? fx.value : 1;
      if (k.faction === 'survivor') addFear(state, k.id, amount);
      else {
        for (const s of Object.values(state.players)) {
          if (s.faction === 'survivor' && s.alive) addFear(state, s.id, amount);
        }
      }
      return false;
    }
    case 'damageHere': {
      const ids =
        typeof fx.value === 'string'
          ? fx.value.split(',').filter(Boolean)
          : Object.values(state.players)
              .filter((s) => s.faction === 'survivor' && s.alive && s.roomId === k.roomId)
              .map((s) => s.id);
      if (ids.length === 0) {
        log(state, '没有人受到伤害。');
        return false;
      }
      while (ids.length) {
        const id = ids.shift()!;
        applyDamage(state, id, 1, k.id);
        if (state.pendingAmulet) {
          if (ids.length) state.pendingEffectQueue.unshift({ op: 'damageHere', value: ids.join(',') });
          return true;
        }
      }
      return false;
    }
    case 'damageFeared': {
      const amount = typeof fx.amount === 'number' ? fx.amount : typeof fx.value === 'number' ? fx.value : 1;
      const ids =
        typeof fx.value === 'string'
          ? fx.value.split(',').filter(Boolean)
          : Object.values(state.players)
              .filter((s) => s.faction === 'survivor' && s.alive && s.fear >= 1)
              .map((s) => s.id);
      if (ids.length === 0) {
        log(state, '没有人受到伤害。');
        return false;
      }
      while (ids.length) {
        const id = ids.shift()!;
        applyDamage(state, id, amount, k.id);
        if (state.pendingAmulet) {
          if (ids.length) {
            state.pendingEffectQueue.unshift({ op: 'damageFeared', value: ids.join(','), amount });
          }
          return true;
        }
      }
      return false;
    }
    case 'exposeFeared': {
      const feared = Object.values(state.players).filter(
        (s) => s.faction === 'survivor' && s.alive && s.fear >= 1,
      );
      if (feared.length === 0) {
        log(state, '没有人需要揭示地点。');
        return false;
      }
      for (const s of feared) {
        s.exposed = true;
        log(state, `${s.name} 必须揭示地点：在「${roomName(state, s.roomId)}」。`);
      }
      return false;
    }
    case 'searchSurvivors':
    case 'rageSearch': {
      if (!k.roomId) {
        state.lastSearchFound = false;
        return false;
      }
      setStealth(k, false);
      const victims = Object.values(state.players).filter(
        (x) => x.faction === 'survivor' && x.alive && x.roomId === k.roomId,
      );
      state.lastSearchFound = victims.length > 0;
      log(
        state,
        victims.length
          ? `${k.name} 发现了 ${victims.map((v) => v.name).join('、')}！`
          : `${k.name} 搜索房间，没有发现人。`,
      );
      if (fx.op === 'rageSearch' && !state.lastSearchFound && state.lastMoveCrossedBlockade) {
        log(state, '没找到人且拆掉了封堵，「残酷暴怒」再执行一次。');
        state.pendingEffectQueue.unshift(
          { op: 'move', value: 2, min: 1 },
          { op: 'rageSearch' },
        );
      }
      return false;
    }
    case 'stealth':
      // 杀手不会自己解除潜行，只在回合开始重现
      if (fx.value === false) return false;
      setStealth(k, true);
      log(state, `${k.name} 进入潜行。`, 'all', true);
      log(state, `${k.name} 在「${roomName(state, k.roomId)}」进入潜行。`, 'killer');
      return false;
    case 'onReveal':
      state.stealthRevealKind = String(fx.value ?? '') as StealthRevealKind;
      return false;
    case 'placeBlockade':
      if (!k.roomId) {
        log(state, '不在地图上，无法封堵。');
        return false;
      }
      return startOneDoorBlockade(state, k.roomId);
    case 'placeBlockadeAll':
      if (!k.roomId) {
        log(state, '不在地图上，跳过封堵。');
        return false;
      }
      return startSealAllBlockade(state, k.roomId);
    case 'modifyPower':
      // 「疯狂」等：本回合临时力量，不是永久，也不是本次攻击
      if (typeof fx.value === 'number') addKillerTurnPower(state, fx.value);
      return false;
    default:
      return false;
  }
}

/** 杀手选好红/蓝/绿：只报这个颜色区有谁，不报具体房间 */
export function resolveSenseColor(state: GameState, color: 'R' | 'B' | 'G'): void {
  state.pendingSenseColor = false;
  state.pendingSenseColorPick = null;
  state.senseHighlight = color;
  const rooms = colorPrefixRooms(state, color);
  const found = senseVisibleInRooms(state, rooms);
  const label = color === 'R' ? '红色' : color === 'B' ? '蓝色' : '绿色';
  /**
   * **战报和行动区用同一套说法**（用户要求：
   * 「战报和杀手行动区显示的待办都是一致的，比如感知：显示出这次所有地点，
   * 再显示所有感知到的人」）：
   *   ① 这次感知覆盖的**所有地点**
   *   ② 感知到的**所有人**
   * —— 但**不把人对应到地点上**（用户：「所有的感知都是不报位置的」）：
   * 那是"一次看清所有人位置"，比"感知一个地点"强太多。
   */
  const placeLine = `地点：${rooms.map((id) => roomName(state, id)).join('、')}`;
  const whoLine = found.length
    ? `看到 ${found.length} 名幸存者：${found.map((s) => s.name).join('、')}`
    : '没有看到人。';
  log(state, `感知${label}区域 —— ${placeLine}；${whoLine}`, 'killer');
  /** 这个颜色区只有一个地点时，看到的人就在那里 */
  noteSingleRoomSense(state, rooms, found);
  /**
   * **行动区把结果摆出来，等杀手确认**（用户要求："打牌之后如果需要获得信息，
   * 在行动区要给出信息然后杀手确认"）。
   */
  setKillerInfo(state, `感知${label}区域`, [placeLine, whoLine]);
  /** 女王等级 2：感知目击 → 惊吓 */
  queenSenseFear(state, found);
  continueKillerQueue(state);
}

/** 杀手牌移动：点相邻一格（可以往回走）。点自己的格子等于停下来 */
export function completeKillerCardMove(state: GameState, toRoomId: string): boolean {
  const k = killerActor(state);
  if (!k) throw new Error('没有杀手');
  const max = state.pendingMoveRange;
  if (max == null) throw new Error('没有待确认的移动');
  const min = state.pendingMoveMin ?? 0;
  if (!k.roomId) throw new Error('不在地图上');
  if (toRoomId === k.roomId) {
    finishKillerCardMove(state);
    return true;
  }
  const adj = killerAdjacentRooms(state, k.id);
  if (!adj.includes(toRoomId)) throw new Error('只能移动到相邻地点');
  const taken = Math.max(0, state.lastMovePath.length - 1);
  if (taken >= max) throw new Error('步数已用完');
  const pathSoFar = state.lastMovePath.length ? [...state.lastMovePath] : [k.roomId];
  const crossedBefore = state.lastMoveCrossedBlockade;
  const ok = tryMove(state, k.id, toRoomId, 1, 1);
  if (!ok) throw new Error('非法移动');
  state.lastMovePath = [...pathSoFar, toRoomId];
  state.lastMoveCrossedBlockade = crossedBefore || state.lastMoveCrossedBlockade;
  const nowTaken = Math.max(0, state.lastMovePath.length - 1);
  if (nowTaken >= max) {
    state.pendingMoveRange = null;
    state.pendingMoveMin = 0;
    continueKillerQueue(state);
    return true;
  }
  log(
    state,
    nowTaken >= min
      ? `已移动 ${nowTaken} 步，还可移动 ${max - nowTaken} 步。`
      : `已移动 ${nowTaken} 步，至少还要移动 ${min - nowTaken} 步。`,
    'killer',
  );
  return false;
}

/** 呼啸而过：确认路径后一次走完，再结算路径惊吓 */
export function confirmPathDraft(state: GameState): void {
  const draft = state.pendingPathDraft;
  if (!draft) throw new Error('当前没有待确认的路径');
  const taken = Math.max(0, draft.rooms.length - 1);
  if (taken < draft.min) throw new Error(`至少选择 ${draft.min} 步`);
  if (taken > draft.max) throw new Error(`最多 ${draft.max} 步`);

  /**
   * 雕像牌（巡邏 / 釋放 / 圍困）：路径是**那一尊雕像**在走，
   * 走完再把位置落到它身上，然后轮到下一尊。
   */
  if (state.pendingStatueStepId) {
    const statue = state.players[state.pendingStatueStepId];
    if (!statue) throw new Error('找不到这尊雕像');
    let finalRoom = statue.roomId;
    for (let i = 1; i < draft.rooms.length; i++) {
      const ok = tryMove(state, statue.id, draft.rooms[i]!, 1, 1);
      if (!ok) throw new Error('路径不合法');
      finalRoom = draft.rooms[i]!;
    }
    if (draft.rooms.length <= 1) finalRoom = statue.roomId;
    state.pendingPathDraft = null;
    const more = finishStatueStep(state, finalRoom);
    if (!more) {
      // 所有雕像都走完了：釋放/圍困 的收尾搜索
      const encounterRoom = afterStatueMoves(state);
      if (encounterRoom) state.statueEncounterRoom = encounterRoom;
      continueKillerQueue(state);
    }
    return;
  }

  const k = killerActor(state);
  if (!k) throw new Error('没有杀手');
  /**
   * 君臨天下：这条路径是**那名目击者**在走，不是杀手。
   * 走完记下他最后的位置，然后收尾。
   */
  if (state.pendingMoveSurvivorId) {
    const victim = state.players[state.pendingMoveSurvivorId];
    if (!victim) throw new Error('找不到该幸存者');
    let finalRoom = victim.roomId;
    for (let i = 1; i < draft.rooms.length; i++) {
      const ok = tryMove(state, victim.id, draft.rooms[i]!, 1, 1);
      if (!ok) throw new Error('路径不合法');
      finalRoom = draft.rooms[i]!;
    }
    if (draft.rooms.length <= 1 && victim.roomId) finalRoom = victim.roomId;
    state.pendingPathDraft = null;
    state.pendingMoveSurvivorId = null;
    /**
     * 他**实际**走到了哪就更新目击记录：
     * 杀手地图上的立绘跟着他走到新位置，保持「眼见为实」的语义。
     */
    if (finalRoom) noteSurvivorSeenAt(state, victim.id, finalRoom);
    log(
      state,
      `君臨天下：「${victim.name}」移动了 ${Math.max(0, draft.rooms.length - 1)} 步，现在在「${finalRoom ? roomName(state, finalRoom) : '?'}」。`,
      'all',
      true,
    );
    continueKillerQueue(state);
    /**
     * 收尾（推进弃牌堆 / 可能开遭遇 / 结束杀手主阶段）在 engine 里 ——
     * killerCards 不能反向 import engine（会成环），所以用注入的回调。
     */
    onMoveSurvivorDone?.(state);
    return;
  }
  /** 玩家确认的路线就是牌面移动的「实际路径」。
   *  注意 tryMove 每次都会把 lastMovePath 覆盖成它自己算出的那一步路径，
   *  所以逐格走完以后必须还原成玩家选的这条，否则「呼啸而过」的路径惊吓会打错格子。 */
  const walked = draft.rooms.length ? [...draft.rooms] : k.roomId ? [k.roomId] : [];
  let crossed = false;
  for (let i = 1; i < draft.rooms.length; i++) {
    const ok = tryMove(state, k.id, draft.rooms[i]!, 1, 1);
    if (!ok) throw new Error('路径不合法');
    crossed = crossed || state.lastMoveCrossedBlockade;
  }
  state.lastMovePath = walked;
  state.lastMoveCrossedBlockade = crossed;
  if (draft.rooms.length <= 1 && k.roomId) {
    state.lastMovePath = [k.roomId];
    if (k.stealth) {
      log(state, `${k.name} 仍在潜行。`, 'all', true);
      log(state, `${k.name} 留在「${roomName(state, k.roomId)}」。`, 'killer');
    } else {
      log(state, `${k.name} 留在「${roomName(state, k.roomId)}」。`);
    }
  }
  state.pendingPathDraft = null;
  /**
   * ⚠ 女猎手 4 级那次追加移动**不在这里** —— 它挂在「追蹤」结算完之后
   * （`engine.ts` 的 `pickTrackerTarget` → `huntressTrackerFollowupMove`），
   * 触发卡是**追蹤**、不是追逐（用户口径）。
   */
  continueKillerQueue(state);
}

/** 结束这次牌上的移动，继续后面的惊吓/搜索 */
export function finishKillerCardMove(state: GameState): void {
  const max = state.pendingMoveRange;
  if (max == null) throw new Error('没有待确认的移动');
  const min = state.pendingMoveMin ?? 0;
  const taken = Math.max(0, state.lastMovePath.length - 1);
  if (taken < min) throw new Error(`至少移动 ${min} 步`);
  const k = killerActor(state);
  if (taken === 0 && k?.roomId) {
    state.lastMovePath = [k.roomId];
    state.lastMoveCrossedBlockade = false;
    if (k.stealth) {
      log(state, `${k.name} 仍在潜行。`, 'all', true);
      log(state, `${k.name} 留在「${roomName(state, k.roomId)}」。`, 'killer');
    } else {
      log(state, `${k.name} 留在「${roomName(state, k.roomId)}」。`);
    }
  }
  state.pendingMoveRange = null;
  state.pendingMoveMin = 0;
  continueKillerQueue(state);
}

/** 潜行回合开始：公开所在格，按牌面惊吓/点名，再强制搜一次 */
export function forcedRevealAndSearch(state: GameState): boolean {
  const k = killerActor(state);
  if (!k?.stealth) return false;
  setStealth(k, false);
  /**
   * 记下"本回合重现过" —— 未命名【伏擊】的使用条件之一就是
   * 「在你重现后送的这次搜索中若遭遇，则可用」。
   */
  state.reappearedThisTurn = true;
  log(state, `${k.name} 在${roomName(state, k.roomId)}重现！`);
  /**
   * **保護色（进化卡牌）：「重現時 +3 力量」。**
   *
   * ⚠ 用户明确：这条**特指重现后那一次搜索「若发生遭遇」**才 +3，
   * 且**持续到此次遭遇结束**。所以重现的这一刻还不能直接加力量
   * （此时还不知道会不会遭遇）—— 只把意向挂在 `pendingRevealPower` 上，
   * 真开战了由 `startEncounter` 兑现；没遭遇就在回合结束时作废。
   */
  if ((state.chosenEvolutionCards ?? []).includes('evo_un_camouflage')) {
    const bonus = 3;
    state.pendingRevealPower = (state.pendingRevealPower ?? 0) + bonus;
    log(state, `保護色：重现，若这次搜索发生遭遇，本次遭遇 +${bonus} 力量。`, 'killer');
  }
  const kind = state.stealthRevealKind;
  state.stealthRevealKind = null;
  if (kind === 'vanishScare' && k.roomId) {
    fearAtRange(state, k.roomId, 1);
  } else if (kind === 'bloomKill' && k.roomId) {
    const hits = Object.values(state.players).filter((s) => {
      if (s.faction !== 'survivor' || !s.alive || !s.roomId) return false;
      const d = mapDist(state, k.roomId!, s.roomId, false);
      return d >= 0 && d <= 1;
    });
    for (const s of hits) {
      applyDamage(state, s.id, 99, k.id, { eliminate: true, skipAmulet: true });
    }
    if (hits.length) log(state, `死亡盛放消灭了：${hits.map((s) => s.name).join('、')}。`);
    else log(state, '死亡盛放：没有人受到影响。');
  } else if (kind === 'lurkPick') {
    state.pendingLurkPick = true;
    log(state, '潜藏威胁：请选择任意 1 名幸存者施加惊吓。', 'killer');
    return true;
  }
  forcedSearchHere(state);
  /**
   * 记下"刚刚做了**重现时那一次搜索**"。
   * 遭遇是随后由 `maybeStartEncounter` 开的，所以到开遭遇时
   * `startEncounter` 会把它转成 `encounterFromRevealSearch`。
   * 未命名【伏擊】和谋杀者 2 级用的都是这**一次**，不是"本回合重现过"。
   */
  state.revealSearchHappened = true;
  return Boolean(state.encounter);
}

/** 潜藏威胁重现：杀手点名惊吓哪一名幸存者 */
export function finishLurkPick(state: GameState, targetId: string): void {
  if (!state.pendingLurkPick) throw new Error('当前不是选择惊吓目标');
  const t = state.players[targetId];
  if (!t?.alive || t.faction !== 'survivor') throw new Error('目标无效');
  state.pendingLurkPick = false;
  addFear(state, t.id, 1);
  log(state, `潜藏威胁惊吓了 ${t.name}。`);
  forcedSearchHere(state);
  /** 潜藏威胁也是"重现" → 这次搜索引发的遭遇同样算"重现时" */
  state.revealSearchHappened = true;
}

/** 不占行动的搜查：这格有人就把 lastSearchFound 设为 true */
/**
 * **重现时的那次强制搜索**（不占行动）。
 *
 * ⚠ 只有**重现**（杀手回合开始时主动现身）才走这里 ——
 * `setStealth(k, false)` 的其它路径都是"暴露"（被幸存者撞见 / 坍塌 / 效果解除潜行），
 * 那几种**不搜索**。所以这个函数只从 `forcedRevealAndSearch` 和
 * `finishLurkPick` 调，别从"暴露"的地方调。
 */
export function forcedSearchHere(state: GameState): void {
  const k = killerActor(state);
  if (!k?.roomId || state.phase === 'gameOver') return;
  const victims = Object.values(state.players).filter(
    (x) => x.faction === 'survivor' && x.alive && x.roomId === k.roomId,
  );
  state.lastSearchFound = victims.length > 0;
  log(
    state,
    victims.length
      ? `${k.name} 重现后搜索房间，发现了 ${victims.map((v) => v.name).join('、')}！`
      : `${k.name} 重现后搜索房间，没有发现人。`,
  );
}

/** 幸存者决定这次非遭遇伤害要不要出示古代护符 */
export function confirmAmuletUse(state: GameState, use: boolean): void {
  const pending = state.pendingAmulet;
  if (!pending) throw new Error('当前没有护符选择');
  const p = state.players[pending.playerId];
  state.pendingAmulet = null;
  if (!p) {
    continueKillerQueue(state);
    return;
  }
  /**
   * **守護之石**（墓穴遗物）和**古代护符**的区别**只有一点**：
   *  - 它在**遭遇中也能用**（护符"遭遇里一律不能出示"）—— 由 `applyDamage` 决定挂不挂起
   *
   * ⚠ **它不是 ∞**：用户明确「遗物中只有剛毅之盾有无穷，其他都没有，包括守護之石」。
   * 所以出示后就**从背包移除、进普通弃牌堆**，和护符一样是一次性的。
   */
  if (pending.relic === 'guard') {
    if (use) {
      removeRelic(p, 'relic_guard');
      discardRelic(state, 'relic_guard');
      /** 遭遇中出示 → 杀手看得到；遭遇外（坍塌 / 直伤）→ 只给幸存者 */
      log(
        state,
        `${p.name} 出示遗物「守護之石」，防止了这次伤害（遗物进入弃牌堆）。`,
        survivorActionVis(state),
      );
    } else {
      applyDamage(state, pending.playerId, pending.amount, pending.sourceId, { skipAmulet: true });
    }
    continueKillerQueue(state);
    maybePromptOverFearWound(state);
    if (state.encounterOpenHold) finishEncounterOpen(state);
    return;
  }
  if (use && (p.items.amulet ?? 0) > 0) {
    p.items.amulet = (p.items.amulet ?? 1) - 1;
    if (p.items.amulet <= 0) delete p.items.amulet;
    discardConsumedItem(state, 'amulet', 1);
    log(
      state,
      `${p.name} 出示古代护符，防止了这次伤害（护符进入弃牌堆）。`,
      survivorActionVis(state),
    );
  } else {
    /**
     * 护符**放弃**了 → 接着问守護之石（用户口径：「先询问古代护符再询问守护之石，
     * 用了第一个就不用问第二个」）。所以这里不能传 `skipAmulet`（那会把
     * 守護之石一起跳过），只标"护符已经问过、被放弃了"。
     */
    applyDamage(state, pending.playerId, pending.amount, pending.sourceId, {
      amuletDeclined: true,
    });
  }
  continueKillerQueue(state);
  maybePromptOverFearWound(state);
  if (state.encounterOpenHold) finishEncounterOpen(state);
}

/**
 * 这张牌「攻击时机」要执行的效果。
 * 双时机牌（尾随/领地意识）用 `effectsByTiming` 里 attack 那一组；
 * 其它牌退回自己的 `effects`。
 */
export function attackTimingEffects(card: CardDef | undefined): EffectDef[] {
  if (!card) return [];
  const idx = card.timings?.indexOf('attack') ?? -1;
  if (idx >= 0 && card.effectsByTiming?.[idx]?.length) return card.effectsByTiming[idx]!;
  return card.effects ?? [];
}

/**
 * 遭遇中可打出加攻的牌，以及这次加攻的数值（永久力量不加在这里）。
 *
 * 判定顺序：
 *  1. 有 `effectsByTiming` 的（如尾随/领地意识）→ 取 attack 时机那组
 *  2. 否则看自身 `effects` 里的 attackValue（如擲斧/狂野撕咬/處決）
 *  3. 再退回牌面文字里的「本次攻击 +N」
 * 處決 是 attack 时机但**不加攻**（它靠掷完防御骰后判定），所以这里返回 0 是对的。
 */
export function encounterCardAttackBonus(state: GameState, card: CardDef | undefined): number {
  if (!card) return 0;
  let n = 0;
  for (const fx of attackTimingEffects(card)) {
    if (fx.op === 'attackValue' && typeof fx.value === 'number') n += fx.value;
    /**
     * 扼杀者「扼殺」：本次攻击 **+x 力量（x = 当前地图上核心标记的数量）**。
     * 数量在**打出的那一刻**确定。
     */
    if (fx.op === 'attackValuePerCore') n += (state.coreMarkers ?? []).length;
  }
  if (n > 0) return n;
  const m = /本次攻击\s*\+(\d+)/.exec(card.text ?? '');
  return m ? Number(m[1]) : 0;
}

/** 这张牌能不能在遭遇的攻击时机打出（timings 含 attack） */
export function canPlayAsEncounterAttack(card: CardDef | undefined): boolean {
  if (!card) return false;
  if (card.timings?.includes('attack')) return true;
  return card.effects.some((fx) => fx.op === 'attackValue' || fx.op === 'attackValuePerCore');
}

/**
 * **这张攻击牌现在能不能打**（牌面写了使用条件的那几张）。
 *
 * @returns `null` = 可以；否则是"不能用"的原因（直接给玩家看）
 *
 * 目前两条：
 *  - **毒液之觸**：「仅当女王参与本次攻击才能使用」——
 *    女王本体必须在**遭遇地点**（只有僵尸在场不算）
 *  - **伏擊**：「仅在你重现或本回合移动通过了秘密通道时可用」
 */
export function attackCardConditionBlockReason(
  state: GameState,
  card: CardDef | undefined,
): string | null {
  if (!card) return null;
  if (/^q_venom/.test(card.id)) {
    if (killerKindOf(state) !== 'queen') return '毒液之觸：这张牌只有女王的对局能用';
    const enc = state.encounter;
    const queen = state.killerId ? state.players[state.killerId] : null;
    if (!enc || !queen?.roomId || queen.roomId !== enc.roomId) {
      return '毒液之觸：只有女王本体参与本次攻击（与遭遇同地点）才能使用';
    }
  }
  if (/^un_ambush/.test(card.id)) {
    /**
     * 牌面：「仅在你**重现**或本回合移动通过了秘密通道时可用」。
     *
     * ⚠ 「重现」特指**重现时那一次搜索**引发的这次遭遇
     *   （和谋杀者 2 级用同一套判定），不是"本回合重现过就行"。
     *
     * ⚠ 「本回合移动通过了秘密通道」= `movedThroughPassageThisTurn`，
     *   它只认 `map.passages`（秘密通道）；**杀手通道 / 杀手密道不算**。
     */
    const byPassage = Boolean(state.movedThroughPassageThisTurn);
    if (!state.encounterFromRevealSearch && !byPassage) {
      return '伏擊：只有在你重现时的那次搜索中遭遇、或本回合移动通过了秘密通道时才能使用';
    }
  }
  return null;
}

/**
 * 遭遇「攻击时机」打出的牌，**除了加攻数值**之外还要执行的效果。
 *
 * 为什么单独抽成一个函数：攻击时机以前有**两个**入口
 * （`playEncounterAttack` 和 `playKillerCard` 里的一个分支），
 * 两边各写了一半 —— 于是
 *   處決 打出去不挂判定、毒液之觸 不中毒、戰鬥適應 不加力量也不移除牌，
 * 全是"静默丢掉"。现在两个入口共用这一份实现。
 *
 * ⚠ 處決（`statueExecute`）不在这里 —— 它要挂到 `enc.executeArmed` 上
 * 等目标掷完防御骰再判定，由 engine 的特例处理。
 */
export function runAttackTimingExtras(state: GameState, card: CardDef | undefined): void {
  if (!card) return;
  for (const fx of attackTimingEffects(card)) {
    switch (fx.op) {
      case 'attackValue':
      case 'attackValuePerCore':
        /** 加攻数值已经算进 `encounterCardAttackBonus`，这里不重复 */
        break;
      /** 荊棘纏繞：本次攻击中目标不能使用任何物品 */
      case 'attackBlockItems':
        state.encounterBlockItems = true;
        if (state.encounter) state.encounter.blockItems = true;
        log(state, `${card.name}：本次攻击中目标不能使用任何物品。`, 'all', true);
        break;
      /** 毒液之觸：使目标〔中毒〕 */
      case 'poisonTarget': {
        const targetId = state.encounter?.targetId;
        if (!targetId) {
          log(state, `${card.name}：当前没有遭遇目标。`, 'killer');
          break;
        }
        /**
         * ⚠ 伤害来源 = **这场遭遇是哪尊雕像打的**（`encounterTriggerPieceId`），
         * 没有记录才退回主雕像 —— 特性 11「恐惧迸发」认"当前遭遇中的那尊雕像"
         * （用户口径），写死主雕像会让非主雕像打的伤害触发不了它。
         */
        const srcId = state.encounterTriggerPieceId ?? state.killerId ?? targetId;
        poisonSurvivor(state, targetId, (id, amount) =>
          applyDamage(state, id, amount, srcId));
        break;
      }
      /** 戰鬥適應：永久 +1 力量 */
      case 'permanentPower':
        if (typeof fx.value === 'number') addPermanentPower(state, fx.value);
        break;
      /**
       * 戰鬥適應：永久从弃牌堆移除 1 张 —— **打出后立刻由玩家自己挑**。
       * 选完之前遭遇停在攻击步骤，不进入防御。
       */
      case 'removeFromDiscardPermanent': {
        const n = typeof fx.value === 'number' ? fx.value : 1;
        beginRemoveFromDiscardPermanent(state, n, card.name, [card.id]);
        break;
      }
      default:
        /** 其余需要长停顿的效果不在这里跑，但也不许静默消失 */
        log(state, `${card.name}：攻击时机效果「${fx.op}」暂未在此结算。`, 'killer');
        break;
    }
  }
}

/**
 * **效果自带的前置条件（`requires`）现在满不满足。**
 *
 * 内容文件 `content/cards/killers.json` 里每条效果都能写一个 `requires`，
 * docx 也在「效果」下面单列了一行「额外条件」；但引擎以前**从来没检查过** ——
 * 例如「鲜血追猎」牌面写着「只有场上有受伤的幸存者时才能使用」，
 * 场上没人受伤时却照样能打出去，白花一张牌。
 *
 * 所以「打牌前拦一道」这件事统一放在这里，`handleAction` 的 `playKillerCard`
 * 与客户端的按钮禁用共用同一份判定，避免两边说法不一致。
 *
 * @returns `null` = 满足；否则是给玩家看的"不能打"原因
 */
export function cardRequirementBlockReason(
  state: GameState,
  card: CardDef | undefined,
  requires: string,
): string | null {
  const name = card?.name ?? '这张牌';
  switch (requires) {
    case 'injuredSurvivor': {
      /** 「鲜血追猎」：只有场上有受伤的幸存者时才能使用 */
      if (injuredSurvivorIds(state).length === 0) {
        return `${name}：场上没有受伤的幸存者，现在不能使用`;
      }
      return null;
    }
    case 'noiseOnBoard': {
      if (state.firecrackerThisRound) return null;
      const kc = state.killerId ? state.players[state.killerId] : null;
      const noises = (state.noises ?? []).filter((id) => id !== kc?.roomId);
      return noises.length === 0 ? `${name}：场上没有响声，现在不能使用` : null;
    }
    case 'chestOnBoard': {
      const chests = Object.keys(state.treasureChests ?? {}).length;
      return chests === 0 ? `${name}：场上没有宝箱，现在不能使用` : null;
    }
    case 'reappearedOrSecretPassage': {
      const ok = Boolean(state.encounterFromRevealSearch || state.movedThroughPassageThisTurn);
      return ok ? null : `${name}：只有在你重现时的那次搜索中遭遇、或本回合移动通过了秘密通道时才能使用`;
    }
    default:
      /** 内容里写了引擎还不认识的条件：不拦，但也不装作检查过 */
      return null;
  }
}

