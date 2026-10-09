/**
 * 杀手进化牌：等级效果叠加上去，开局 1 级就生效。
 * 升级只多拿新一级，旧级一直留着。力量只有牌面写了才加。
 */
import type { GameState, PlayerState } from './types.js';
/** 特性查询（08 跳级要用） */
import { hasTrait } from './traits.js';
/**
 * 2对3 进化时要在两个杀手之间切换镜像（把谁的牌库读进顶层）。
 * 这些函数住在 `engine.ts`，而 `engine.ts` 已经 import 了本文件 ——
 * 直接 import 会成环，所以用**处理器注入**（和本文件里 `onEncounterOpenNoTargets` 同一套做法）。
 */
let switchKillerTo: ((state: GameState, killerId: string) => void) | null = null;
let saveKillerMirror: ((state: GameState) => void) | null = null;
let loadKillerMirror: ((state: GameState, killerId: string) => void) | null = null;

export function setKillerMirrorHandlers(h: {
  switchTo: (state: GameState, killerId: string) => void;
  save: (state: GameState) => void;
  load: (state: GameState, killerId: string) => void;
}) {
  switchKillerTo = h.switchTo;
  saveKillerMirror = h.save;
  loadKillerMirror = h.load;
}

import {
  addFear,
  addKillerTurnPower,
  applyDamage,
  cappedKillerPower,
  canonicalDoorId,
  clearTrapAfterEncounter,
  doorId,
  isBlockadableDoor,
  isDoorBlocked,
  isDoorEdge,
  log,
  logSplit,
  parseDoor,
  removableBlockades,
  roomName,
  survivorsInRoom,
  tryPlaceBlockadeDoor,
  unblockedDoorsAt,
} from './effects.js';
/**
 * 核心标记逻辑放在 `coreMarkers.ts`（**不是** killerSpecials）——
 * killerSpecials 反过来 import 了本文件的 `killerKindOf`，
 * 从这里 import killerSpecials 会成环。
 */
import { placeCoreAt } from './coreMarkers.js';

/**
 * **【墓穴】坍塌拦截**。
 *
 * 规则：杀手每次升级的**最第一时间**（比任何进化效果都早）先结算一次坍塌。
 * 所以 `runUpgrade` 一进来就问一句"要不要先塌"：
 * 要塌就记下 `pendingCollapse` 并**立刻打住**，等 engine 结算完坍塌再回来跑升级。
 *
 * 由 engine 注入（`collapse.ts` ← `engine.ts`，避免成环）。
 */
let evolutionCollapseGate:
  | ((state: GameState, fromLevel: number, toLevel: number) => boolean)
  | null = null;

export function setEvolutionCollapseGate(
  fn: (state: GameState, fromLevel: number, toLevel: number) => boolean,
): void {
  evolutionCollapseGate = fn;
}

/**
 * 【变体1】"**这一级结算完之后**"的追加效果钩子（由 engine 注册）。
 *
 * 用途（杀手特性）：
 *  - 09「慢热杀手」：每次升级 +1 力量
 *  - 08「压抑怒火」：升到 3 级时**立刻升到 4 级** —— 返回 `4`，
 *    这里会**递归再结算一轮 4 级**（4 级该有的力量/锁定牌照常拿到）
 *
 * ⚠ 调用时 `state.killerId` 就是当前正在结算的那名杀手（`resolveDeferredEvolution`
 * 是逐个 `switchKillerTo` 切过去再结算的），所以特性要按他本人的来查。
 *
 * @returns 需要继续跳到的等级（比当前大才会再结算一轮）；没有就返回 void
 */
let afterLevelSettled: ((state: GameState, level: number) => number | void) | null = null;

export function setAfterLevelSettledHandler(
  fn: (state: GameState, level: number) => number | void,
): void {
  afterLevelSettled = fn;
}

export type KillerKind =
  | 'butcher'
  | 'spectre'
  | 'murderer'
  | 'huntress'
  | 'werewolf'
  | 'statue'
  | 'unidentified'
  | 'strangler'
  | 'queen';

/** 进化牌原文，按等级 1～5。空字符串 = 这一级没有效果。 */
export const EVOLUTION_TEXT: Record<KillerKind, string[]> = {
  butcher: [
    '/',
    '力量 +1',
    '解锁「残酷暴怒」',
    '「链锯轰鸣」成为快速卡牌',
    '发生遭遇时，在攻击前伤害地点中的所有目标',
  ],
  spectre: [
    '发生遭遇时，【惊吓】地点中的所有目标',
    '在使用「呼啸而过」后，你可以弃掉 2 张卡牌来【搜索房间】',
    '每当有幸存者惊恐过度时，你可以弃掉 3 张卡牌来伤害该幸存者',
    '解锁「生命吸取」',
    '发生遭遇时，在攻击前伤害地点中的所有目标',
  ],
  murderer: [
    '/',
    '如果你在重现时遭遇了任何幸存者，本回合 +3 力量',
    '解锁「死亡盛放」',
    '力量 +1；在任意地点总计【封堵】×4',
    '发生遭遇时，在攻击前伤害地点中的所有目标',
  ],
  /** 女猎手：等级 2 解锁「陷阱重置」 */
  huntress: [
    '/',
    '解锁「陷阱重置」',
    '所有卡牌费用 -1（最少为 0）',
    '使用「追蹤」后〔移動〕×0-1',
    '发生遭遇时，在攻击前伤害所有目标',
  ],
  /** 狼人：等级 2 解锁「超听觉」 */
  werewolf: [
    '/',
    '解锁「超听觉」',
    '力量 +1',
    '你的回合结束时，如果本回合你没有遭遇任何幸存者且你不在〔潜行〕，〔惊吓〕距离 2 内的所有幸存者',
    '发生遭遇时，在攻击前伤害所有目标',
  ],
  /** 雕像：等级 1 就可以转换主雕像；等级 3 解锁「圍困」 */
  statue: [
    '每当你升级时，你都可以转换主雕像',
    '力量 +1',
    '解锁「圍困」',
    '力量 +2；将「圍困」从弃牌堆加入你的手牌',
    '发生遭遇时，在攻击前伤害所有目标',
  ],
  /** 未命名：等级 2、4 各获得一张进化卡牌（二选一在等级 3） */
  unidentified: [
    '你可以〔移動〕通过秘密通道',
    '获得任意 1 张进化卡牌',
    '解锁以下之一：「刺耳噪声」或「酸液喷吐」',
    '获得任意 1 张进化卡牌',
    '发生遭遇时，在攻击前伤害所有目标',
  ],
  /** 扼杀者：在自己的地点放核心标记 */
  strangler: [
    '你可以在慢速行动阶段期间使用不限张数的沙漏卡牌',
    '在你的当前地点放置一个核心标记',
    '解锁「狂亂枝條」',
    '在任意 2 个地点各放置一个核心标记（不能是同一地点）',
    '发生遭遇时，在攻击前伤害所有目标',
  ],
  /** 女王：生成丧尸、中毒标记 */
  queen: [
    '你的回合结束时，如果本回合中你没有遭遇任何幸存者且你不在〔潜行〕，在你的地点生成一个丧尸',
    '如果你使用〔感知〕目击了任何幸存者，〔惊吓〕他们',
    '解锁「君臨天下」',
    '在任意 2 个地点各生成一个丧尸（不能是同一地点）',
    '发生遭遇时，在攻击前伤害所有目标',
  ],
};

/**
 * 这个棋子是哪种杀手。
 *
 * `killerId` 可选：2v3 有**两名**杀手，判定"某个杀手是什么类型"时
 * 必须能指定是谁，不能一律看 `state.killerId`（那个只是"现在轮到谁"）。
 */
export function killerKindOf(state: GameState, killerId?: string | null): KillerKind | null {
  const kid = killerId ?? state.killerId;
  const k = kid ? state.players[kid] : null;
  const ch = state.characters.find((c) => c.id === k?.characterId);
  const hay = `${k?.characterId ?? ''} ${ch?.name ?? ''} ${k?.name ?? ''}`;
  if (/killer1|屠夫|butcher/i.test(hay)) return 'butcher';
  if (/killer2|幽魂|spectre/i.test(hay)) return 'spectre';
  if (/killer3|谋杀|murder/i.test(hay)) return 'murderer';
  if (/killer4|女猎手|huntress/i.test(hay)) return 'huntress';
  if (/killer5|狼人|werewolf/i.test(hay)) return 'werewolf';
  if (/killer6|雕像|statue/i.test(hay)) return 'statue';
  if (/killer7|未命名|unidentified/i.test(hay)) return 'unidentified';
  if (/killer8|扼杀者|strangler/i.test(hay)) return 'strangler';
  if (/killer9|女王|queen/i.test(hay)) return 'queen';
  return null;
}

/**
 * 1 级到当前级，已经生效的原文（给「查看杀手信息」）。
 * `killerId` 可选：2对3 里要看的是**哪一个**杀手的进化效果。
 */
export function activeEvolutionLines(
  state: GameState,
  killerId?: string | null,
): Array<{ level: number; text: string }> {
  const kind = killerKindOf(state, killerId);
  if (!kind) return [];
  const lv = Math.max(1, Math.min(5, state.killerLevel));
  return EVOLUTION_TEXT[kind].slice(0, lv).map((text, i) => ({ level: i + 1, text }));
}

/**
 * 杀手当前力量。永久、本回合、持续到下回合、下一次攻击、永久加攻
 * 全部算进去，**任何时候不超过上限**（默认 10）。
 * 次雕像和僵尸没有另一套力量，用的就是这个数。
 */
export function effectiveKillerPower(state: GameState): number {
  return cappedKillerPower(state);
}

export function formatKillerPowerLabel(state: GameState): string {
  return String(cappedKillerPower(state));
}

/**
 * **女猎手进化 3 级**：「所有卡牌费用 -1（最少为 0）」。
 * 返回**要减掉几点**（不是女猎手、或等级不到就是 0）。
 *
 * 纯查询函数 —— 真正的扣费在各处调用点用
 * `killerCardCostAfterDiscount(cardHandCost(card), huntressCostDiscount(state))`。
 */
export function huntressCostDiscount(state: GameState): number {
  if (killerKindOf(state) !== 'huntress') return 0;
  return state.killerLevel >= 3 ? 1 : 0;
}

/**
 * **女猎手进化 4 级**：「使用『**追蹤**』后〔移動〕×0-1」。
 *
 * ⚠ **触发卡是「追蹤」（`huntress_track_*`），不是「追逐」**（用户口径）。
 * 以前这里挂在 `huntress_chase_`（追逐）上，而且规则文本也写成了「追逐」——
 * 所以那张牌打出来根本没给这次追加移动。
 *
 * 时机：追蹤的**〔搜索〕＋展示距离**整条结算完之后，追加一次 0-1 步的移动草稿
 * （可以不移动 = 0 步，点确认即可）。直接建草稿（和 `pickMoveSurvivor` 同一套结构），
 * 不经过"潜行"那套。
 *
 * ⚠ 必须在 `continueKillerQueue` **之前**建草稿 —— 队列要等它确认完才继续。
 */
export function huntressTrackerFollowupMove(state: GameState): boolean {
  if (killerKindOf(state) !== 'huntress') return false;
  if (state.killerLevel < 4) return false;
  const k = killerActorOrNull(state);
  if (!k?.roomId) return false;
  if (state.pendingPathDraft) return false;
  state.pendingPathDraft = { min: 0, max: 1, rooms: [k.roomId] };
  log(state, '女猎手进化 4 级：追蹤之后可以再〔移動〕×0-1（不想动就直接确认）。', 'killer');
  return true;
}

function addPermanentPower(state: GameState, delta: number): void {
  const cap = state.rules.killerPowerMax ?? 10;
  const before = state.killerPower;
  state.killerPower = Math.min(cap, Math.max(0, state.killerPower + delta));
  if (state.killerPower !== before) {
    log(state, `进化：永久力量 ${before} → ${state.killerPower}。`);
  }
}

function allUnblockedDoorIds(state: GameState): string[] {
  const seen = new Set<string>();
  for (const e of state.map.edges) {
    if (!isDoorEdge(e.pathType)) continue;
    const id = doorId(e.from, e.to);
    /** 已封的、以及机关大门都不能再封（用户口径：两者不能共存） */
    if (!isBlockadableDoor(state, id)) continue;
    seen.add(id);
  }
  return [...seen];
}

function doorTouchesRoom(doorIdStr: string, roomId: string): boolean {
  const pair = parseDoor(doorIdStr);
  return Boolean(pair && (pair[0] === roomId || pair[1] === roomId));
}

function blockadeSlots(state: GameState): number {
  return Math.max(0, (state.rules.blockadeTokenMax ?? 7) - state.blockades.length);
}

export function removableForJob(state: GameState): string[] {
  const job = state.pendingBlockadeJob;
  const forbidden = job?.kind === 'sealAll' ? job.roomId : null;
  return removableBlockades(state).filter((id) => !forbidden || !doorTouchesRoom(id, forbidden));
}

/** 摸牌堆空了还要摸时调用：升一级、结算该级力量/锁定牌，并停下来确认新效果。 */
/**
 * 进化发生时的**总入口**。
 *
 * `state.killerLevel` 是**队伍共用的等级**（2对3 里两名杀手共用一条进化进度）；
 * 但每个杀手要结算的是**自己类型**的 1~5 级效果、以及**自己牌组**里的锁定牌。
 * 所以这里挨个把杀手读进镜像、各结算一遍，再存回各自的切片。
 */
export function runUpgrade(state: GameState): void {
  const beforeLv = state.killerLevel;
  if (beforeLv >= 5) return;
  const teamLevel = beforeLv + 1;

  /**
   * **【墓穴】坍塌插在进化之前**（规则：先告知进化到几级 → 结算坍塌 → 再结算进化）。
   *
   * `evolutionCollapseGate` 返回 true = "这次已经记好要塌了，你先打住"。
   * engine 结算完坍塌后会把 `pendingCollapse` 清掉、把 `collapseConsumedForLevel`
   * 标成这一级，然后**再调一次 `runUpgrade`** —— 那时 gate 返回 false，升级正常走完。
   */
  const collapseAlreadySettled = state.collapseConsumedForLevel === teamLevel;
  if (!collapseAlreadySettled && evolutionCollapseGate?.(state, beforeLv, teamLevel)) {
    log(
      state,
      `杀手进化到 **${teamLevel} 级**：请先确认新效果，**确认之后**再结算墓穴的坍塌。`,
      'all',
      true,
    );
    return;
  }

  /**
   * 谁要进化：
   *  - 1 杀手模式：就是当前那个（`state.killerId`）
   *  - 2对3：**两名杀手同时进化**
   */
  const ids = state.mode === '2v3' && state.killerIds.length
    ? [...state.killerIds]
    : (state.killerId ? [state.killerId] : []);

  log(
    state,
    ids.length > 1
      ? `杀手进化！等级 ${beforeLv} → ${teamLevel}（两名杀手同时进化）。请确认新效果。弃牌洗回摸牌堆。`
      : `杀手进化！等级 ${beforeLv} → ${teamLevel}。请确认新效果。弃牌洗回摸牌堆。`,
  );

  if (!ids.length) {
    /** 没有杀手棋子（大厅等）—— 只把等级推上去，别丢进度 */
    state.killerLevel = teamLevel;
    return;
  }

  /**
   * ⚠ **记住"触发这次进化的那名杀手"**。
   *
   * 用户口径：「**当前触发进化的杀手**结算完自己的本次进化，再切给另一人确认进化效果，
   * 再按流程进行」—— 也就是先手先走完自己的四段（确认 → 坍塌 → 特性 → 效果）。
   *
   * ⚠ 下面那个循环里的 `switchKillerTo` 会把 `state.killerId` **一路带到最后一名杀手**，
   * 所以收尾必须切回触发者；否则升级后"该谁确认"会先落到**后手**头上，
   * 而且 `settleConfirmedEvolution` 记的 `doneKillerIds` 也会记成后手
   * （`evolution-order-2v3-crypt.mjs` 抓到的就是这个）。
   */
  const triggerId = state.killerId && state.killers[state.killerId] ? state.killerId : ids[0]!;

  for (const kid of ids) {
    if (!state.killers[kid]) continue;
    /** 切到他：他的牌库 / 秘密牌 / 手牌进镜像 */
    switchKillerTo?.(state, kid);
    /** 队伍等级对所有杀手一致 */
    state.killerLevel = teamLevel;
    runUpgradeForCurrentKiller(state, beforeLv, teamLevel, ids.length > 1, ids);
    saveKillerMirror?.(state);
  }
  /** 收尾：切回**触发者**（2对3 里就是先手），等级按队伍值统一写回 */
  switchKillerTo?.(state, triggerId);
  state.killerLevel = teamLevel;
  saveKillerMirror?.(state);
  /**
   * ⚠ 记下"这一轮从谁开始"：08 跳级那一轮要**也从同一个人开始**
   * （用户口径：「先手持 08，则是 k1，k2，k1，k2」）。
   */
  if (state.pendingEvolutionAck)
    state.pendingEvolutionAck.startKillerId = triggerId;
}

/**
 * 针对**当前镜像里的那个杀手**结算一次进化。
 *
 * ⚠ **升级当场不执行任何实际效果**（用户要求：
 * 「杀手在确认进化效果后才执行进化效果」）。
 * 这里只挂"确认前必须做完的选择"：
 *  - 解锁二选一（刺耳噪声 / 酸液喷吐）
 *  - 雕像：要不要转换主雕像
 *  - 未命名：选一张进化卡牌
 *  - 女王 4 级：点 2 个地点生成丧尸
 *
 * 真正的结算 —— 力量 +N、锁定牌入手、手牌超限弃牌 —— 都在
 * `resolveDeferredEvolution()`（杀手点「确认新效果」时调用）。
 *
 * 这样就不会再有"手牌满了要弃牌"和"还没选要不要转主雕像"互相卡死：
 * 弃牌发生在确认**之后**，那时前面那些选择都已经做完了。
 */
function runUpgradeForCurrentKiller(
  state: GameState,
  beforeLv: number,
  teamLevel: number,
  multi: boolean,
  killerIds: string[],
): void {
  state.killerLevel = teamLevel;
  /** 新的一级：允许 `advanceEvolutionChoices` 再挂一次"要你选的东西" */
  state.evolutionChoiceIssuedAtLevel = 0;
  /** 新的一级：③「进化相关的特性卡」也要重新结算（幂等守卫跟着等级走） */
  state.evolutionTraitStageAtLevel = 0;
  /**
   * ⚠ **这里不再挂任何"要你选的东西"**（用户口径）：
   * 「选卡/选牌/选主雕像/选地点」都是**执行进化效果**的一部分，
   * 必须发生在「确认新效果」**之后**，顺序是
   *   确认 → 坍塌 → 变体1进化特性 → 执行进化效果。
   *
   * 所以本函数只做两件事：推等级 + 挂出「确认新效果」面板。
   * 那些选择由 `advanceEvolutionChoices`（确认后调用）挂出。
   */
  if (!state.pendingEvolutionAck) {
    state.pendingEvolutionAck = {
      fromLevel: beforeLv,
      toLevel: state.killerLevel,
      deferred: true,
      killerIds: [...killerIds],
    };
  } else {
    state.pendingEvolutionAck.toLevel = state.killerLevel;
    state.pendingEvolutionAck.deferred = true;
    state.pendingEvolutionAck.killerIds = [...killerIds];
  }
  /**
   * ⚠ 雕像「转换主雕像」、未命名「选进化卡牌」、女王「选 2 个生成丧尸的地点」
   * 这些**也是进化效果**，都挪到确认之后了 —— 见 `advanceEvolutionChoices`。
   */
}

/**
 * **确认「新效果」之后，按顺序挂出这一级"要你选的东西"**（用户口径）。
 *
 * 顺序：确认 → （engine 先做坍塌 / 变体1特性）→ 这里挂出选择 → 选完由
 * `advanceEvolutionChoices` 再问下一项，全都问完才由调用方做实际结算。
 *
 * @returns 是否挂出了"还要等玩家选"的东西；false = 没有可选的，可以直接结算
 */
export function advanceEvolutionChoices(state: GameState): boolean {
  const kind = killerKindOf(state);
  const level = state.killerLevel;
  /**
   * ⚠ **同一级的"选择"只挂一次。**
   *
   * 每选完一项都会再调本函数问"还有没有下一项"；如果这里每次都重新挂，
   * 就会"选完卡又把剩下的卡再挂一遍"（死循环、永远确认不完）。
   * 所以用 `evolutionChoiceIssuedAtLevel` 记住"这一级已经问过了"。
   */
  if (state.evolutionChoiceIssuedAtLevel === level)
    return false;
  /** 雕像 1 级「每次升级首先执行」：先问要不要转换主雕像 */
  if (kind === 'statue' && state.statueIds?.length && !state.pendingStatueEvoSwitch && !state.pendingStatueEvoTarget) {
    state.pendingStatueEvoSwitch = true;
    state.evolutionChoiceIssuedAtLevel = level;
    log(state, '雕像进化 1 级：你可以转换主雕像（也可以不切）。', 'killer');
    return true;
  }
  /** 未命名 2 / 4 级：从没选过的进化卡里挑一张 */
  if (kind === 'unidentified' && (level === 2 || level === 4) && !state.pendingEvolutionCardPick) {
    const chosen = new Set(state.chosenEvolutionCards ?? []);
    const pool = (state.unEvolutionPool ?? []).filter((id) => !chosen.has(id));
    if (pool.length) {
      state.pendingEvolutionCardPick = pool;
      state.evolutionChoiceIssuedAtLevel = level;
      log(state, `未命名进化 ${level} 级：请从 ${pool.length} 张进化卡牌里选 1 张。`, 'killer');
      return true;
    }
  }
  /** 解锁二选一（未命名「刺耳噪声 / 酸液喷吐」） */
  if (!state.pendingUnlockChoice) {
    const groups = new Set<string>();
    for (const id of state.killerLocked) {
      const card = state.cardById[id];
      if (card?.unlockChoice && card.unlockAtLevel != null && card.unlockAtLevel <= level)
        groups.add(card.unlockChoice);
    }
    if (groups.size) {
      const pool: string[] = [];
      for (const id of state.killerLocked) {
        const card = state.cardById[id];
        if (card?.unlockChoice && groups.has(card.unlockChoice))
          pool.push(id);
      }
      if (pool.length > 1) {
        state.pendingUnlockChoice = pool;
        state.evolutionChoiceIssuedAtLevel = level;
        log(state, `进化 ${level} 级：请从「${pool.map((id) => state.cardById[id]?.name ?? id).join(' / ')}」里选 1 张解锁。`, 'killer');
        return true;
      }
      /** `pool.length === 1` 的"只有一张、没得选"由结算阶段直接入手 */
    }
  }
  /** 女王 4 级：点 2 个不同地点各生成一个丧尸 */
  if (kind === 'queen' && level === 4 && !state.pendingQueenSpawnRooms) {
    state.pendingQueenSpawnRooms = [];
    state.evolutionChoiceIssuedAtLevel = level;
    log(state, '女王进化 4 级：请在任意 2 个不同地点各生成一个丧尸（点两个地点）。', 'killer');
    return true;
  }
  return false;
}

/**
 * 这一项选择做完了 → 问下一项；全都问完就返回 false（调用方去做实际结算）。
 */
export function evolutionChoicesPending(state: GameState): boolean {
  if (state.pendingStatueEvoSwitch) return true;
  if (state.pendingEvolutionCardPick) return true;
  if (state.pendingUnlockChoice) return true;
  if (state.pendingQueenSpawnRooms) return true;
  return false;
}

/**
 * **【变体1】特性 08「压抑怒火」的跳级判定**（纯查询，不改任何状态）。
 *
 * 卡面：「当你升级到等级 3 时，立刻升级到等级 4」。
 *
 * 用户口径：「杀手在 3 级时，就执行 3 级进化效果，然后由于 08，
 * **再确认 4 级进化效果**，再坍塌，再特性牌（此时等级 4 级，不触发 08），
 * 再执行进化效果」。
 *
 * 所以它要在"**3 级的进化效果结算完**"之后才发起跳级，
 * 由 `settleConfirmedEvolution` 的末尾调用 —— 不能提前到坍塌/特性那一步。
 *
 * ⚠ **2对3：必须按"这次升级涉及的所有杀手"来查，不能只看当前那名。**
 *
 * 两名杀手**共用队伍等级**，而 2对3 的流程是"先手走完自己的四段 → 切给后手"：
 * 跳级判定跑在**最后一名**杀手结算完的那一刻，那时 `state.killerId` 是**后手**。
 * 如果只查他，就成了"只有后手抽到 08 才会跳级"，
 * 「先手持 08」会整条特性失效（`evolution-trait08-2v3.mjs` 的 (a) 抓到的）。
 *
 * 只有等**两人都做完 3 级那一轮**才跳级 —— 否则先手一跳级，
 * 后手就再也没机会结算他自己的 3 级效果了（时机本身是对的，只是判定范围错了）。
 *
 * @param ownerIds 这次升级涉及哪些杀手（2对3 传两名；不传就退回"当前这名"）
 * @returns 要跳到的等级（不跳就是 undefined）
 */
export function evolutionLevelJump(
  state: GameState,
  level: number,
  ownerIds?: string[],
): number | undefined {
  if (!state.variant1)
    return undefined;
  const ids = ownerIds?.length
    ? [...ownerIds]
    : (state.killerId ? [state.killerId] : []);
  if (!ids.length)
    return undefined;
  if (level === 3 && ids.some((id) => hasTrait(state, id, 'trait_k08')))
    return 4;
  return undefined;
}

/**
 * **杀手点「确认新效果」时才真正结算这一级。**
 *
 * ⚠ **2对3 是"各自确认、各自结算"**（用户口径：两名杀手处理完升级效果后
 * 都要等对方完成本次升级再继续）：所以这里默认只结算
 * **当前轮到的那名杀手**（`state.killerId`）。
 * 传 `onlyId` 可以显式指定结算谁（例如 2v3 里刚确认完的那一个）。
 *
 * 每次结算的内容：
 *  1. `applyNewEvolutionLevel` —— 力量 +N、解锁副作用等
 *  2. 锁定牌（`unlockLevel` 到期、以及二选一里只剩一张的）加入手牌
 *  3. 手牌超上限 → 让杀手自选弃置
 */
export function resolveDeferredEvolution(state: GameState, onlyId?: string | null): void {
  const ack = state.pendingEvolutionAck;
  if (!ack?.deferred) return;
  const ids = onlyId
    ? (state.killers[onlyId] ? [onlyId] : [])
    : (state.killerId && state.killers[state.killerId] ? [state.killerId] : []);
  if (!ids.length) return;
  /**
   * `multi` 只是日志里的前缀（"「某某」锁定牌…加入手牌"），
   * 用"这次升级涉及几个杀手"来判断，而不是"这次结算几个"。
   */
  const multi = (ack.killerIds?.length ?? 0) > 1;
  for (const kid of ids) {
    switchKillerTo?.(state, kid);
    state.killerLevel = ack.toLevel;
    settleEvolutionForCurrentKiller(state, ack.toLevel, multi);
    saveKillerMirror?.(state);
  }
  const back = state.killerId && state.killers[state.killerId] ? state.killerId : ids[0];
  if (back) loadKillerMirror?.(state, back);
  state.killerLevel = ack.toLevel;
  saveKillerMirror?.(state);
}

/** 单个杀手这一级的实际结算（力量 / 解锁入手 / 手牌超限） */
function settleEvolutionForCurrentKiller(
  state: GameState,
  level: number,
  multi: boolean,
): void {
  const tag = multi ? `「${state.players[state.killerId ?? '']?.name ?? '杀手'}」` : '';
  applyNewEvolutionLevel(state, level);
  /**
   * 普通锁定牌：unlockLevel 到了就入手。
   * 「二选一」的牌（带 unlockChoice）在确认**之前**已经选好了
   * （`pickUnlockChoice` 会把选中的加入手牌、另一张永久移除）；
   * 但"候选只剩一张、没得选"的组要在这里补上。
   */
  const unlocked = state.killerLocked.filter((id) => {
    const card = state.cardById[id];
    if (card?.unlockChoice)
      return false;
    return card?.unlockLevel != null && card.unlockLevel <= state.killerLevel;
  });
  for (const id of unlocked) {
    state.killerLocked = state.killerLocked.filter((x) => x !== id);
    state.killerHand.push(id);
    log(state, `${tag}锁定牌「${state.cardById[id]?.name ?? id}」加入手牌，此后与普通牌无异。`);
  }
  /** 二选一里"只剩一张"的组：直接入手 */
  const soloChoice = new Set<string>();
  for (const id of state.killerLocked) {
    const card = state.cardById[id];
    if (!card?.unlockChoice || card.unlockAtLevel == null || card.unlockAtLevel > level) continue;
    soloChoice.add(card.unlockChoice);
  }
  for (const group of soloChoice) {
    const ids = state.killerLocked.filter((id) => state.cardById[id]?.unlockChoice === group);
    /** 还有两张以上说明是待选、不是"没得选"，跳过 */
    if (ids.length !== 1) continue;
    const only = ids[0]!;
    state.killerLocked = state.killerLocked.filter((x) => x !== only);
    state.killerHand.push(only);
    unlocked.push(only);
    log(state, `锁定牌「${state.cardById[only]?.name ?? only}」加入手牌。`);
  }
  const max = state.rules.killerHandMax ?? 5;
  if (state.killerHand.length > max) {
    state.pendingUnlockDiscard = true;
    state.pendingKillerDiscards = state.killerHand.length - max;
    /**
     * ⚠ **合并、不要覆盖**（用户口径：「锁定牌加入手牌时手牌满应该不能弃置锁定牌。
     * **所有杀手都应该这样**」）。
     *
     * 这一级"刚入手的牌"可能有**三批**：
     *  - 二选一那张（`pickUnlockChoice` 已经先记进去了）；
     *  - 雕像 4 级从弃牌堆取回的「圍困」（`applyNewEvolutionLevel` 里记的）；
     *  - 这里按 `unlockLevel` 到手的锁定牌（`unlocked`）。
     *
     * 以前这里直接 `= [...unlocked]`，把前两批**冲掉了** ——
     * 于是未命名二选一入手的那张照样能被弃掉
     * （`locked-card-not-discardable.mjs` ① 抓到的；扼杀者那类"按等级入手"的
     * 因为正好在 `unlocked` 里，所以看起来是好的）。
     */
    state.justUnlockedCards = [
      ...new Set([...(state.justUnlockedCards ?? []), ...unlocked]),
    ];
    log(state, `进化入手牌后手牌超过 ${max}，请自选弃置 ${state.pendingKillerDiscards} 张。`, 'killer');
  } else if (state.pendingKillerDiscards <= 0) {
    /** 手上没超限、也没有别的待弃 → 清空这批标记（还有待弃时别清，那是别人的账） */
    state.justUnlockedCards = [];
  }
  /**
   * 【变体1】这一级全部结算完之后，再跑特性的追加效果（09 慢热杀手 +力量 /
   * 08 压抑怒火 3 级跳 4 级）。跳级时**递归**把新那一级也照常结算完。
   */
  const jump = afterLevelSettled?.(state, level);
  if (typeof jump === 'number' && jump > level) {
    state.killerLevel = jump;
    settleEvolutionForCurrentKiller(state, jump, multi);
  }
}

/** 升到 newLevel 当下：只结算这一级（旧级已经在身上） */
export function applyNewEvolutionLevel(state: GameState, newLevel: number): void {
  const kind = killerKindOf(state);
  if (!kind) return;
  if (kind === 'butcher' && newLevel === 2) addPermanentPower(state, 1);
  if (kind === 'murderer' && newLevel === 4) addPermanentPower(state, 1);
  if (kind === 'murderer' && newLevel === 4) {
    state.pendingEvoFourBlockade = true;
  }
  /** 狼人「等级 3：力量 +1」 */
  if (kind === 'werewolf' && newLevel === 3) addPermanentPower(state, 1);
  /** 雕像「等级 2：力量 +1」 */
  if (kind === 'statue' && newLevel === 2) addPermanentPower(state, 1);
  /**
   * 雕像「等级 4：力量 +2；将『圍困』从弃牌堆加入你的手牌」。
   *
   * ⚠ **只在弃牌堆里找**（用户口径）：
   * 「不在弃牌堆就直接跳过拿围困的流程，力量仍然加」。
   * 「圍困」的 `unlockLevel` 是 3，正常打出去之后就在弃牌堆里；
   * 它还在锁定区 / 还在手牌里时**不兜底**，跳过取回、只加力量。
   *
   * ⚠ **手牌满不再跳过**（用户口径，2026-02 更正）：
   * 「雕像4级应该是：**弃牌堆没有【围困】时才跳过**。
   *   若雕像手牌满，则**选择一张弃置，再加入围困**。」
   *
   * 以前是"满手就不拿"；现在照拿 —— 拿到手之后由
   * `settleEvolutionForCurrentKiller` 里那段超限流程挂出"请自选弃置 1 张"，
   * 弃完手里就是 5 张（其中一张是「圍困」）。
   */
  if (kind === 'statue' && newLevel === 4) {
    addPermanentPower(state, 2);
    const SIEGE = 'statue_siege';
    const maxSiege = state.rules.killerHandMax ?? 5;
    const i = state.killerDiscard.indexOf(SIEGE);
    if (i < 0) {
      log(state, '雕像进化 4 级：力量 +2。弃牌堆里没有「圍困」，跳过取回。');
    } else if (state.killerHand.includes(SIEGE)) {
      /**
       * ⚠ **手上已经有了就不拿**：正常时序里「圍困」在 3 级就从锁定区入手了，
       * 这张牌是**一份**的 —— 跳级（特性 08 / 手动摆状态）时两条路都可能命中，
       * 不兜这一道就会出现"手里两张圍困"。
       */
      log(state, '雕像进化 4 级：力量 +2。「圍困」已经在手牌里，跳过取回。');
    } else if ((state.killerLocked ?? []).includes(SIEGE)) {
      /**
       * ⚠ **还在锁定区**时也跳过：`settleEvolutionForCurrentKiller` 紧接着那段
       * "按 `unlockLevel` 解锁锁定牌"就会把它加入手牌 —— 这里再拿一次会变成两张。
       * （真实时序里 3 级那次解锁已经把它移出锁定区了，所以正常情况下走不到这一支。）
       */
      log(state, '雕像进化 4 级：力量 +2。「圍困」还在锁定区（本次解锁会入手），跳过取回。');
    } else {
      state.killerDiscard.splice(i, 1);
      state.killerHand.push(SIEGE);
      /**
       * ⚠ **记进 `justUnlockedCards`**：这张是"刚入手的"，本次超额弃牌
       * **不能把它弃掉**（老口径：「锁定牌加入手牌时手牌满应该不能弃置锁定牌。
       * 所有杀手都应该这样」）—— 不然"弃一张再拿围困"就等于白拿。
       */
      state.justUnlockedCards = [...new Set([...(state.justUnlockedCards ?? []), SIEGE])];
      logSplit(
        state,
        '雕像进化 4 级：力量 +2，把「圍困」从弃牌堆加入手牌。',
        state.killerHand.length > maxSiege
          ? `雕像进化 4 级：力量 +2，把「圍困」从弃牌堆加入手牌（手牌 ` +
            `${state.killerHand.length}/${maxSiege}，接着要自选弃置 1 张）。`
          : '雕像进化 4 级：力量 +2，把「圍困」从弃牌堆加入手牌。',
      );
    }
  }
  /**
   * 扼杀者「等级 2：在你的当前地点放置一个核心标记」。
   * 地点是**确定的**（就是他所在地点），所以不用停，直接放。
   * 如果已达 5 个上限，`placeCoreAt` 会停下来让玩家选要移除哪一个（规则允许）。
   */
  if (kind === 'strangler' && newLevel === 2) {
    const k = state.killerId ? state.players[state.killerId] : null;
    if (k?.roomId) {
      log(state, `扼杀者进化 2 级：在「${roomName(state, k.roomId)}」放置一个核心标记。`, 'all', true);
      placeCoreAt(state, k.roomId);
    }
  }
  /**
   * 扼杀者「等级 4：在任意 2 个地点各放置一个核心标记（不能是同一地点）」——
   * 停下来让杀手点 2 个不同地点（和女王 4 级同一套交互）。
   */
  if (kind === 'strangler' && newLevel === 4) {
    state.pendingStranglerCoreRooms = [];
    log(state, '扼杀者进化 4 级：请在任意 2 个不同地点各放置一个核心标记（点两个地点）。', 'killer');
  }
}

/** 重现强制搜索确实发现人：谋杀者 2 级本回合 +3 力量（上限 10） */
export function applyMurdererRevealPower(state: GameState): void {
  if (killerKindOf(state) !== 'murderer' || state.killerLevel < 2) return;
  if (!state.lastSearchFound) return;
  log(state, '谋杀者进化 2 级：重现时搜索房间找到人，本回合力量 +3。');
  addKillerTurnPower(state, 3);
}

export function queueOverFearWound(state: GameState, targetId: string): void {
  if (killerKindOf(state) !== 'spectre' || state.killerLevel < 3) return;
  const t = state.players[targetId];
  if (!t?.alive) return;
  if (!state.pendingOverFearQueue) state.pendingOverFearQueue = [];
  state.pendingOverFearQueue.push(targetId);
  maybePromptOverFearWound(state);
}

export function maybePromptOverFearWound(state: GameState): void {
  if (state.pendingOverFearWound || state.pendingAmulet) return;
  if (!state.pendingOverFearQueue) state.pendingOverFearQueue = [];
  while (state.pendingOverFearQueue.length) {
    const id = state.pendingOverFearQueue.shift()!;
    const t = state.players[id];
    if (!t?.alive) continue;
    state.pendingOverFearWound = { targetId: id };
    log(
      state,
      `${t.name} 惊恐过度。幽魂可以弃 3 张手牌对其造成 1 点伤害（手里不足 3 张则不能用）。`,
    );
    return;
  }
}

export function resolveOverFearWound(state: GameState, use: boolean, payCardIds: string[]): void {
  const pending = state.pendingOverFearWound;
  if (!pending) throw new Error('当前没有惊恐过度的进化选择');
  const t = state.players[pending.targetId];
  state.pendingOverFearWound = null;
  if (!use) {
    log(state, '幽魂不使用惊恐过度伤害。');
    continueAfterOverFear(state);
    return;
  }
  if (state.killerHand.length < 3) throw new Error('手里不足 3 张，不能弃牌伤害');
  const pay = [...new Set(payCardIds)];
  if (pay.length !== 3) throw new Error('请自选弃置 3 张手牌');
  for (const id of pay) {
    if (!state.killerHand.includes(id)) throw new Error('弃置的牌不在手里');
  }
  for (const id of pay) {
    const i = state.killerHand.indexOf(id);
    state.killerHand.splice(i, 1);
    state.killerDiscard.push(id);
  }
  const names = pay.map((id) => state.cardById[id]?.name ?? id);
  log(state, `幽魂弃置「${names.join('、')}」，伤害 ${t?.name ?? '幸存者'}。`);
  if (t?.alive && state.killerId) {
    applyDamage(state, t.id, 1, state.killerId);
  }
  continueAfterOverFear(state);
}

function continueAfterOverFear(state: GameState): void {
  if (state.phase === 'gameOver') return;
  maybePromptOverFearWound(state);
  if (state.pendingOverFearWound || state.pendingAmulet) return;
  if (state.encounterOpenHold) {
    finishEncounterOpen(state);
    return;
  }
  maybeOfferWhizSearch(state);
}

/** 遭遇刚开战：先惊吓（幽魂 1），再伤害（5 级），再选人 / 加攻。遭遇期间伤害不能出示护符。 */
export function applyEncounterOpenEffects(state: GameState): void {
  const enc = state.encounter;
  if (!enc) return;
  const kind = killerKindOf(state);
  const here = survivorsInRoom(state, enc.roomId);
  if (kind === 'spectre' && state.killerLevel >= 1) {
    for (const s of here) addFear(state, s.id, 1);
    if (here.length) log(state, `幽魂进化 1 级：惊吓了 ${here.map((s) => s.name).join('、')}。`);
    else log(state, '幽魂进化 1 级：地点里没有可惊吓的人。');
  }
  state.encounterOpenHold = true;
  if (state.pendingOverFearWound || (state.pendingOverFearQueue?.length ?? 0) > 0) {
    maybePromptOverFearWound(state);
    if (state.pendingOverFearWound) return;
  }
  finishEncounterOpen(state);
}

export function finishEncounterOpen(state: GameState): void {
  const enc = state.encounter;
  if (!enc || !state.encounterOpenHold) return;
  if (state.pendingOverFearWound || state.pendingAmulet) return;
  state.encounterOpenHold = false;
  /**
   * 5 级对**每一次**遭遇生效，包括次雕像搜索、僵尸搜索开出来的遭遇。
   * 那些路径最后都进 `startEncounter` → 这里。
   */
  if (state.killerLevel >= 5 && state.killerId) {
    const targets = survivorsInRoom(state, enc.roomId);
    log(
      state,
      targets.length
        ? `进化 5 级：攻击前伤害「${roomName(state, enc.roomId)}」的 ${targets.map((s) => s.name).join('、')}。`
        : '进化 5 级：地点里没有可伤害的人。',
    );
    for (const s of targets) {
      applyDamage(state, s.id, 1, state.killerId, { skipAmulet: true });
      if (state.phase === 'gameOver') {
        clearTrapAfterEncounter(state, enc.roomId);
        state.encounter = null;
        return;
      }
    }
  }
  const alive = survivorsInRoom(state, enc.roomId);
  if (alive.length === 0) {
    // 当前模式打死人通常已 gameOver；各自为战等模式可能地点清空但局未终——必须清掉遭遇，否则行动区卡住。
    log(state, '遭遇地点已没有存活幸存者，遭遇结束。');
    onEncounterOpenNoTargets?.(state);
    return;
  }
  enc.discoveredIds = alive.map((s) => s.id);
  if (alive.length === 1) {
    enc.targetId = alive[0]!.id;
    enc.defenseOptions[alive[0]!.id] = [];
    enc.step = 'attack';
  } else {
    enc.targetId = null;
    enc.step = 'pick';
  }
}

/** 开战效果后地点无人：由 engine 注册，清遭遇并收尾杀手回合（未终局时） */
let onEncounterOpenNoTargets: ((state: GameState) => void) | null = null;

export function setEncounterOpenNoTargetsHandler(fn: (state: GameState) => void) {
  onEncounterOpenNoTargets = fn;
}

export function markWhizFollowup(state: GameState): void {
  state.whizJustResolved = true;
}

export function maybeOfferWhizSearch(state: GameState): void {
  if (!state.whizJustResolved) return;
  if (state.pendingPathDraft || state.pendingMoveRange != null) return;
  if (state.pendingAmulet || state.pendingOverFearWound) return;
  if (state.encounter || state.phase === 'gameOver') {
    state.whizJustResolved = false;
    return;
  }
  state.whizJustResolved = false;
  if (killerKindOf(state) !== 'spectre' || state.killerLevel < 2) return;
  if (state.killerHand.length < 2) {
    log(state, '幽魂进化 2 级：手里不足 2 张，不能弃牌搜索房间。');
    return;
  }
  state.pendingWhizSearch = true;
  log(state, '幽魂进化 2 级：可以弃 2 张手牌，搜索移动结束后的当前房间（不占行动）。');
}

export function resolveWhizSearch(state: GameState, use: boolean, payCardIds: string[]): boolean {
  if (!state.pendingWhizSearch) throw new Error('当前没有呼啸后的搜索房间选择');
  state.pendingWhizSearch = false;
  if (!use) {
    log(state, '幽魂不使用呼啸后的搜索房间。');
    return false;
  }
  if (state.killerHand.length < 2) throw new Error('手里不足 2 张，不能弃牌搜索房间');
  const pay = [...new Set(payCardIds)];
  if (pay.length !== 2) throw new Error('请自选弃置 2 张手牌');
  for (const id of pay) {
    if (!state.killerHand.includes(id)) throw new Error('弃置的牌不在手里');
  }
  for (const id of pay) {
    const i = state.killerHand.indexOf(id);
    state.killerHand.splice(i, 1);
    state.killerDiscard.push(id);
  }
  const names = pay.map((id) => state.cardById[id]?.name ?? id);
  const k = state.killerId ? state.players[state.killerId] : null;
  log(state, `幽魂弃置「${names.join('、')}」，搜索房间「${roomName(state, k?.roomId)}」。`);
  if (!k?.roomId) return false;
  const victims = survivorsInRoom(state, k.roomId);
  state.lastSearchFound = victims.length > 0;
  if (victims.length === 0) log(state, `${k.name} 搜索房间，没有发现人。`);
  else log(state, `${k.name} 搜索房间，发现了 ${victims.map((v) => v.name).join('、')}！`);
  return victims.length > 0;
}

export function startOneDoorBlockade(state: GameState, roomId: string): boolean {
  if (unblockedDoorsAt(state, roomId).length === 0) {
    log(state, '此地没有能封堵的门，跳过封堵。');
    return false;
  }
  if (blockadeSlots(state) >= 1) {
    state.pendingBlockade = true;
    log(state, `请点与「${roomName(state, roomId)}」相邻的一扇门封堵。再点同一格可取消，行动区确认后才落下。`, 'killer');
    return true;
  }
  if (removableBlockades(state).length === 0) {
    log(state, '场上封堵已满，且没有可移除的封堵，跳过。');
    return false;
  }
  state.pendingBlockadeJob = { kind: 'oneDoor', roomId, need: 1, removeLeft: 1, placed: 0, firstRoomId: null };
  log(state, '场上可放置封堵不足。请先选一扇场上封堵移除，然后再封新门。');
  return true;
}

export function startSealAllBlockade(state: GameState, roomId: string): boolean {
  /**
   * ⚠ **"本来就没门可封"要在这里就拦住**，不能等到 `continueSealAllBlockade`。
   *
   * 那边收尾那句是「**已封堵**「X」的全部门」—— 如果一扇都没封过（玩家在
   * 一个门全封完 / 只有机关大门的地点打出「留下!!!!」），这句话会读成
   * "这次把门都封上了"，其实什么都没发生（用户问的"跳过会不会影响这种牌"）。
   * 所以入口先判一次，措辞就准确了。
   */
  if (unblockedDoorsAt(state, roomId).length === 0) {
    state.pendingBlockadeJob = null;
    log(state, `「${roomName(state, roomId)}」没有可封堵的门（都已封堵、或那扇门上是机关大门），跳过封堵。`);
    return false;
  }
  state.pendingBlockadeJob = {
    kind: 'sealAll',
    roomId,
    need: unblockedDoorsAt(state, roomId).length,
    removeLeft: 0,
    placed: 0,
    firstRoomId: null,
  };
  return continueSealAllBlockade(state);
}

export function continueSealAllBlockade(state: GameState): boolean {
  const job = state.pendingBlockadeJob;
  if (!job || job.kind !== 'sealAll') return false;
  const roomId = job.roomId;
  if (!roomId) {
    state.pendingBlockadeJob = null;
    return false;
  }
  const left = unblockedDoorsAt(state, roomId);
  if (left.length === 0) {
    log(state, `已封堵「${roomName(state, roomId)}」的全部门（场上 ${state.blockades.length}/${state.rules.blockadeTokenMax}）。`);
    state.pendingBlockadeJob = null;
    return false;
  }
  const slots = blockadeSlots(state);
  const removable = removableForJob(state);
  if (slots >= left.length) {
    for (const d of left) tryPlaceBlockadeDoor(state, d.id);
    return continueSealAllBlockade(state);
  }
  if (removable.length === 0) {
    log(
      state,
      `「${roomName(state, roomId)}」仍有 ${left.length} 扇门未封，但没有可移除的场上封堵（不能拆自己所在地的封堵）。`,
    );
    state.pendingBlockadeJob = null;
    return false;
  }
  job.need = left.length;
  job.removeLeft = Math.min(left.length - slots, removable.length);
  log(
    state,
    `「留下」要封 ${job.need} 扇门，可放置槽位不够。请先移除 ${job.removeLeft} 个场上封堵（不能拆「${roomName(state, roomId)}」的门）。每次移除都确认。`,
    'killer',
  );
  return true;
}

export function startAnyDoorsBlockade(state: GameState, want: number): boolean {
  const available = allUnblockedDoorIds(state);
  const need = Math.min(want, available.length);
  if (need <= 0) {
    log(state, '地图上没有未封堵的门，跳过进化封堵。');
    return false;
  }
  const slots = blockadeSlots(state);
  const removeLeft = Math.max(0, need - slots);
  state.pendingBlockadeJob = {
    kind: 'anyDoors',
    roomId: null,
    need,
    removeLeft,
    placed: 0,
    firstRoomId: null,
    secondRoomId: null,
  };
  if (removeLeft > 0) {
    log(state, `进化 4 级要封 ${need} 扇门。请先依次移除 ${removeLeft} 个场上封堵，再选新门。`, 'killer');
  } else {
    log(state, `进化 4 级：请在整张地图选 ${need} 扇未封堵的门（每扇点两个相邻地点，行动区确认）。`, 'killer');
  }
  return true;
}

export function removeBoardBlockade(state: GameState, doorIdStr: string): void {
  const job = state.pendingBlockadeJob;
  if (!job || job.removeLeft <= 0) throw new Error('当前不是移除场上封堵');
  if (!isDoorBlocked(state, doorIdStr)) throw new Error('那里没有封堵');
  if (state.blockadesThisAction?.some((id) => canonicalDoorId(id) === canonicalDoorId(doorIdStr))) {
    throw new Error('不能拆除本次刚封上的门');
  }
  if (job.kind === 'sealAll' && job.roomId && doorTouchesRoom(doorIdStr, job.roomId)) {
    throw new Error('不能拆除自己所在地点的封堵');
  }
  const i = state.blockades.indexOf(doorIdStr);
  state.blockades.splice(i, 1);
  const pair = parseDoor(doorIdStr);
  log(
    state,
    pair
      ? `移除「${roomName(state, pair[0])}」–「${roomName(state, pair[1])}」的封堵（还需移除 ${job.removeLeft - 1}）。`
      : `移除封堵。`,
  );
  job.removeLeft -= 1;
  if (job.removeLeft > 0) return;
  if (job.kind === 'sealAll') {
    continueSealAllBlockade(state);
    return;
  }
  if (job.kind === 'oneDoor' && job.roomId) {
    state.pendingBlockade = true;
    log(state, `请点与「${roomName(state, job.roomId)}」相邻的一扇门封堵。`, 'killer');
    return;
  }
  if (job.kind === 'anyDoors') {
    log(state, `请再选 ${job.need - job.placed} 扇未封堵的门（每扇点两个相邻地点后确认）。`, 'killer');
  }
}

export function pickAnyDoorRoom(state: GameState, roomId: string): void {
  const job = state.pendingBlockadeJob;
  if (!job || job.kind !== 'anyDoors' || job.removeLeft > 0) {
    throw new Error('当前不是选择任意封堵门');
  }
  if (job.secondRoomId && roomId === job.secondRoomId) {
    job.secondRoomId = null;
    log(state, `已取消「${roomName(state, roomId)}」。`, 'killer');
    return;
  }
  if (job.firstRoomId && roomId === job.firstRoomId) {
    job.firstRoomId = job.secondRoomId ?? null;
    job.secondRoomId = null;
    log(state, job.firstRoomId ? `已取消该地点。仍选「${roomName(state, job.firstRoomId)}」。` : '已取消地点选择。', 'killer');
    return;
  }
  if (!job.firstRoomId) {
    job.firstRoomId = roomId;
    log(state, `已选「${roomName(state, roomId)}」，请再点一个与它以门相连的地点。再点同一格可取消。`, 'killer');
    return;
  }
  if (job.secondRoomId) throw new Error('已经选好一扇门，请确认或再点已选地点取消');
  const id = doorId(job.firstRoomId, roomId);
  const edge = state.map.edges.find(
    (e) =>
      isDoorEdge(e.pathType) &&
      ((e.from === job.firstRoomId && e.to === roomId) || (e.to === job.firstRoomId && e.from === roomId)),
  );
  if (!edge) throw new Error('这两个地点之间没有可封的门');
  if (isDoorBlocked(state, id)) throw new Error('这扇门已经封上了');
  /** 机关大门上不能封（用户口径：机关大门和封堵不能共存） */
  if (!isBlockadableDoor(state, id)) {
    throw new Error(
      `「${roomName(state, job.firstRoomId)}」–「${roomName(state, roomId)}」那扇门上是机关大门，不能封堵。`,
    );
  }
  job.secondRoomId = roomId;
  log(state, `已选「${roomName(state, job.firstRoomId)}」与「${roomName(state, roomId)}」，请在行动区确认封堵。`, 'killer');
}

export function confirmAnyDoor(state: GameState): void {
  const job = state.pendingBlockadeJob;
  if (!job || job.kind !== 'anyDoors' || job.removeLeft > 0) {
    throw new Error('当前不是确认任意封堵门');
  }
  if (!job.firstRoomId || !job.secondRoomId) throw new Error('请先点选两个相邻地点');
  const id = doorId(job.firstRoomId, job.secondRoomId);
  const placed = tryPlaceBlockadeDoor(state, id);
  if (placed !== 'ok') throw new Error('无法封堵这扇门');
  job.placed += 1;
  job.firstRoomId = null;
  job.secondRoomId = null;
  if (job.placed >= job.need) {
    log(state, `进化 4 级封堵完成（${job.placed} 扇）。`);
    state.pendingBlockadeJob = null;
    return;
  }
  log(state, `已封 ${job.placed}/${job.need}。请继续选下一扇门。`);
}

export function afterOneDoorPlaced(state: GameState): void {
  if (state.pendingBlockadeJob?.kind === 'oneDoor') state.pendingBlockadeJob = null;
  state.pendingBlockade = false;
}

/**
 * **进化流程里"还停在等玩家做选择"的那些状态**（用户口径：
 * 「杀手的**进化效果要执行完**才进行下一步骤」）。
 *
 * 典型漏网的是**扼杀者 4 级**：它要"在任意 2 个不同地点各放一个核心标记"，
 * 玩家还没点完地点，回合就被收尾、直接进了幸存者大回合
 * （用户报的「图四中扼杀者核心标记都没放就开始幸存者回合了」）。
 *
 * 所以这张清单要覆盖**每一级的"要你选"**：
 *  - 未命名：选进化卡 / 解锁二选一 / 超限弃牌
 *  - 雕像：转换主雕像
 *  - 女王 4 级：选 2 个地点生成丧尸
 *  - 扼杀者 4 级：选 2 个地点放核心标记（以及之后"选地点放/移核心"那两步）
 *  - 变体1：特性 17 选目标 / 封堵作业
 */
export function hasEvolutionChoicePending(state: GameState): boolean {
  return Boolean(
    (state.pendingEvolutionCardPick?.length ?? 0) > 0 ||
      (state.pendingUnlockChoice?.length ?? 0) > 0 ||
      (state.pendingUnlockDiscard && state.pendingKillerDiscards > 0) ||
      state.pendingStatueEvoSwitch ||
      state.pendingQueenSpawnRooms != null ||
      state.pendingStranglerCoreRooms != null ||
      state.pendingCorePick != null ||
      state.pendingTraitVictim ||
      state.pendingTraitBlockades > 0,
  );
}

export function hasEvolutionPending(state: GameState): boolean {
  return Boolean(
    state.pendingEvolutionAck ||
      state.pendingWhizSearch ||
      state.pendingOverFearWound ||
      (state.pendingOverFearQueue && state.pendingOverFearQueue.length > 0) ||
      state.encounterOpenHold ||
      state.pendingBlockadeJob ||
      state.pendingEvoFourBlockade ||
      /** ⚠ 还停在"要你选"的状态里时，进化不算做完（扼杀者 4 级放核心标记…） */
      hasEvolutionChoicePending(state),
  );
}

export function startPendingEvoFourIfNeeded(state: GameState): boolean {
  if (!state.pendingEvoFourBlockade) return false;
  if (state.pendingEvolutionAck) return true;
  state.pendingEvoFourBlockade = false;
  return startAnyDoorsBlockade(state, 4);
}

export function roomsForBlockadeRemove(state: GameState): string[] {
  const rooms = new Set<string>();
  for (const id of removableForJob(state)) {
    const pair = parseDoor(id);
    if (pair) {
      rooms.add(pair[0]);
      rooms.add(pair[1]);
    }
  }
  return [...rooms];
}

/**
 * 「任选门封堵」（进化 4 级 / 特性 13、18）现在**能点哪些地点**。
 *
 * ⚠ 以前一律返回整张地图 —— 于是每一格都一样亮，玩家既看不出"该点哪一格"，
 * 也看不出"我已经点了哪一格"（用户报的「谋杀者 4 级放四个封堵预选时
 * 为什么地点没高亮」）。现在跟着当前进度收窄，和服务端真正接受的点法一致：
 *  - 还没点第一格 → 只给**至少有一扇可封的白门**的地点
 *  - 点了第一格 → 只给**与它以可封的白门相连**的地点
 *    （外加已经点过的那两格 —— 再点同一格是"取消"）
 */
export function roomsForAnyDoorPick(state: GameState): string[] {
  const job = state.pendingBlockadeJob;
  const first = job?.kind === 'anyDoors' ? job.firstRoomId : null;
  const out = new Set<string>();
  if (!first) {
    for (const e of state.map.edges) {
      if (!isDoorEdge(e.pathType)) continue;
      if (!isBlockadableDoor(state, doorId(e.from, e.to))) continue;
      out.add(e.from);
      out.add(e.to);
    }
  }
  else {
    out.add(first);
    if (job?.secondRoomId) out.add(job.secondRoomId);
    for (const e of state.map.edges) {
      if (!isDoorEdge(e.pathType)) continue;
      const other =
        e.from === first ? e.to : (e.bidirectional ?? true) && e.to === first ? e.from : null;
      if (!other) continue;
      if (!isBlockadableDoor(state, doorId(first, other))) continue;
      out.add(other);
    }
  }
  /** 按地图顺序返回：高亮稳定，也不会有已经塌掉的地点混进来 */
  return state.map.rooms.map((r) => r.id).filter((id) => out.has(id));
}

export function doorLabel(state: GameState, id: string): string {
  const pair = parseDoor(id);
  if (!pair) return id;
  return `${roomName(state, pair[0])}–${roomName(state, pair[1])}`;
}

export function emptyEvolutionFields(): Pick<
  GameState,
  | 'killerTurnPowerBonus'
  | 'pendingEvolutionAck'
  | 'pendingWhizSearch'
  | 'pendingOverFearWound'
  | 'pendingOverFearQueue'
  | 'encounterOpenHold'
  | 'whizJustResolved'
  | 'pendingEvoFourBlockade'
  | 'pendingBlockadeJob'
> {
  return {
    killerTurnPowerBonus: 0,
    pendingEvolutionAck: null,
    pendingWhizSearch: false,
    pendingOverFearWound: null,
    pendingOverFearQueue: [],
    encounterOpenHold: false,
    whizJustResolved: false,
    pendingEvoFourBlockade: false,
    pendingBlockadeJob: null,
  };
}

export function killerActorOrNull(state: GameState): PlayerState | null {
  return state.killerId ? state.players[state.killerId] ?? null : null;
}
