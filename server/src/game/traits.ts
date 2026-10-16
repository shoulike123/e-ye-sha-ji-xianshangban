/**
 * 【变体1】特性卡引擎：开关、难度、抽牌池、选牌流程、可见性。
 *
 * 规则（用户口径，逐条落实）：
 *  - **所有模式都能开**；和【变体2 分头行动】可以同时开，互不影响。
 *  - 开了之后有 4 档「生存难度等级」，差别**只在杀手侧**：
 *    简单 = 杀手不抽；普通 = 每名杀手抽 2 选 1；困难 = 抽 4 选 2；噩梦 = 抽 6 选 3。
 *    幸存者侧四档一样：**每人抽 2 选 1**。
 *  - **一局不能发重复的卡**：抽走的牌立刻出池，**没选中的也弃掉**、本局不再出现。
 *  - 顺序：**幸存者先选**（1对3/2对3 里每人各控一名 → 各自弹窗、互不等待；
 *    单人/1对1/1对2 → 按座位顺序依次弹窗） → **幸存者全选完，杀手再选**。
 *  - 选完：幸存者特性**所有幸存者互相可见、杀手看不到**；杀手特性**双方可见**
 *    （要展示给幸存者，并放进杀手信息面板）。
 *
 * ⚠ 这个模块**不能 import engine.ts**（engine 反过来 import 它，会成环），
 * 所以"选完了、可以开局了"是通过注入的回调 `onTraitDraftDone` 通知 engine 的。
 */
import type { GameContent } from '../content/loader.js';
import type { TraitDef } from '../content/schema.js';
import { log, shuffle } from './effects.js';
import type { GameState, TraitDifficulty } from './types.js';

/** 难度显示名（战报与界面共用一份文案） */
export const TRAIT_DIFFICULTY_LABEL: Record<TraitDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
  nightmare: '噩梦',
};

/** 各难度下**杀手**抽几张 / 选几张（简单 = 不抽） */
export const KILLER_TRAIT_PLAN: Record<TraitDifficulty, { draw: number; keep: number }> = {
  easy: { draw: 0, keep: 0 },
  normal: { draw: 2, keep: 1 },
  hard: { draw: 4, keep: 2 },
  nightmare: { draw: 6, keep: 3 },
};

/** 幸存者侧：四档难度都一样，抽 2 选 1 */
export const SURVIVOR_TRAIT_DRAW = 2;
export const SURVIVOR_TRAIT_KEEP = 1;

/**
 * 【变体1】**杀手特性要弃几张手牌作为代价**（卡面写「弃掉 N 张卡牌来…」的那几张）。
 *
 * 发动时走 `useTrait { payCardIds }`；弃哪几张**由杀手自己点手牌选**
 * （用户口径："具体比如选封堵之类还是杀手来"）。
 */
export const KILLER_TRAIT_PAY: Record<string, number> = {
  /** 01 完全围困：回合结束，本回合没遭遇且不在潜行 → 弃 2 张，本地封堵 1 */
  trait_k01: 2,
  /** 05 迅捷行动：回合开始，不在潜行 → 弃 2 张换移动 1 */
  trait_k05: 2,
  /** 06 敏锐听觉：回合开始 → 弃 1 张感知一个带响声的地点 */
  trait_k06: 1,
  /** 07 进阶追踪：回合开始，不在潜行 → 弃 1 张感知距离 1 内所有地点 */
  trait_k07: 1,
  /** 10 即刻反应：感知发现幸存者后 → 弃 1 张换移动 1 */
  trait_k10: 1,
  /** 15 谋杀意图：感知发现幸存者后 → 弃 1 张惊吓他们 */
  trait_k15: 1,
  /** 20 危险伏击：回合结束，本回合没遭遇且不在潜行 → 弃 1 张换潜行 0–2 */
  trait_k20: 1,
};

/** 1对3 / 2对3：每名玩家只操控一名幸存者 → 选特性可以**同时**弹窗（各选各的） */
export function survivorsPickTraitsInParallel(state: GameState): boolean {
  return state.mode === 'multi' || state.mode === '2v3';
}

let onTraitDraftDone: ((state: GameState) => void) | null = null;

/** engine 注入："所有人选完了，可以开局了" */
export function setTraitDraftDoneHandler(fn: (state: GameState) => void): void {
  onTraitDraftDone = fn;
}

let onTraitSetup: ((state: GameState) => void) | null = null;

/**
 * engine 注入：**开局设置类特性**的结算（卡面写「游戏开始时」的那些）。
 *
 * 为什么让 engine 来做：这些效果要动杀手的**力量 / 手牌 / 等级 / 封堵**，
 * 而 2对3 里那些字段是**每个杀手一份切片**，必须逐个 `switchActiveKiller` 切镜像改；
 * 这些能力都在 engine 里（本模块 import 不了 engine，会成环）。
 */
export function setTraitSetupHandler(fn: (state: GameState) => void): void {
  onTraitSetup = fn;
}

let killerScopeOf: ((state: GameState) => string[]) | null = null;

/**
 * engine 注入：**当前这名杀手手上有哪些棋子**（2对3 要按"这一个杀手"算）。
 *
 * 为什么需要：特性卡是**按棋子**存的，而雕像局里特性挂在**主雕像**那一个棋子上
 * （一局只发一份，常驻效果只结算一次，不会 4 尊各加一次力量）。
 * 一旦要问"某尊雕像有没有某特性"，就必须落到这一份卡上 —— 但**不能顺带
 * 把另一名杀手的特性也算进来**（用户明确：2对3 里两个杀手的特性不能弄混）。
 */
export function setKillerScopeHandler(fn: (state: GameState) => string[]): void {
  killerScopeOf = fn;
}

/** 当前这名杀手的所有棋子 id（没有注入时退回主雕像） */
export function killerPieceIdsOf(state: GameState): string[] {
  if (killerScopeOf) return killerScopeOf(state);
  return state.killerId ? [state.killerId] : [];
}

/**
 * **当前这名杀手**（含他的全部雕像）有没有这张特性。
 *
 * ⚠ 与 `killerHasTrait` 的区别：那个是"**桌上任意**杀手棋子有就算"，
 * 在 2对3 里会把对手杀手的特性也算进来 —— 需要判断"我这名杀手"时必须用这个。
 */
export function hasTraitForKiller(state: GameState, traitId: string): boolean {
  return killerPieceIdsOf(state).some((id) => hasTrait(state, id, traitId));
}

/** **当前这名杀手**的这张特性还能不能用（每场一次的类型，用过就不能再用） */
export function traitAvailableForKiller(state: GameState, traitId: string): boolean {
  if (!hasTraitForKiller(state, traitId)) return false;
  const def = traitDef(state, traitId);
  if (!def) return false;
  if (def.oncePerGame && traitIsUsed(state, traitId)) return false;
  return true;
}

/** 查一张特性的定义（`traitById` 是开局时从 content 灌进来的） */
export function traitDef(state: GameState, id: string): TraitDef | undefined {
  return state.traitById?.[id];
}

/** 某人有没有这张特性 */
export function hasTrait(state: GameState, playerId: string, traitId: string): boolean {
  return (state.traits?.[playerId] ?? []).includes(traitId);
}

/** 某人有没有**任意一名**拥有指定特性的队友/自己（杀手侧按队伍算：2对3 共用一条进化） */
export function killerHasTrait(state: GameState, traitId: string): boolean {
  return Object.entries(state.traits ?? {}).some(([pid, list]) => {
    if (!list.includes(traitId)) return false;
    return state.players[pid]?.faction === 'killer';
  });
}

/** 这张特性是不是已经被用掉（客户端据此把卡面变暗） */
export function traitIsUsed(state: GameState, traitId: string): boolean {
  return (state.traitUsed ?? []).includes(traitId);
}

/** 记一次"每场游戏仅限一次"的消耗 —— 用掉之后卡牌变暗 */
export function markTraitUsed(state: GameState, traitId: string): void {
  if (!state.traitUsed) state.traitUsed = [];
  if (!state.traitUsed.includes(traitId)) state.traitUsed.push(traitId);
}

/** 这张特性还能不能用（每场一次的类型，用过就不能再用） */
export function traitAvailable(state: GameState, playerId: string, traitId: string): boolean {
  if (!hasTrait(state, playerId, traitId)) return false;
  const def = traitDef(state, traitId);
  if (!def) return false;
  if (def.oncePerGame && traitIsUsed(state, traitId)) return false;
  return true;
}

/** 该谁选 / 还剩谁没选（界面用来显示"等待XX选特性"） */
export function traitPickerIds(state: GameState): string[] {
  return Object.keys(state.traitOffers ?? {});
}

/** 幸存者座位顺序（`turnOrder` 在开局前就按座位排好了） */
function survivorSeatOrder(state: GameState): string[] {
  const fromTurnOrder = (state.turnOrder ?? []).filter(
    (id) => state.players[id]?.faction === 'survivor',
  );
  if (fromTurnOrder.length) return fromTurnOrder;
  return Object.values(state.players)
    .filter((p) => p.faction === 'survivor')
    .map((p) => p.id);
}

/**
 * 从池子里摸 `count` 张给他当候选（摸走即出池）。
 * 池子不够时有多少给多少（不会卡死）。
 */
function offerFrom(state: GameState, playerId: string, faction: 'survivor' | 'killer', count: number) {
  const pool = state.traitPool[faction];
  const offer: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = pool.shift();
    if (!id) break;
    offer.push(id);
  }
  if (offer.length) state.traitOffers[playerId] = offer;
}

/**
 * 开局发牌：建池子并按顺序弹窗。返回 true = **挂起等选牌**（engine 不要 startRound）。
 *
 * 调用点：`finishStartCommon` 的最后（`state.round = 0` 之后、`startRound` 之前）。
 */
export function beginTraitDraft(state: GameState, content: GameContent): boolean {
  if (!state.variant1) return false;
  const defs = content.traits ?? [];
  if (!defs.length) {
    /**
     * ⚠ **别静默跳过**：`content/traits.json` 只在**服务端启动时**读一次，
     * 所以"加了文件但没重启"就会走到这里 —— 表现是"开了变体1 却完全没有特性卡"。
     * 写一条双方战报，让人一眼看出是内容没加载，而不是客户端没画。
     */
    log(
      state,
      '【变体1】没有读到特性卡定义（content/traits.json 为空或未加载）——本局跳过选特性卡。' +
        '请重启服务端后重开一局。',
      'all',
      true,
    );
    return false;
  }

  state.traitById = Object.fromEntries(defs.map((t) => [t.id, t]));
  /**
   * **两个独立的池子**：幸存者 20 张、杀手 20 张，各自洗牌。
   *
   * ⚠ 用户规则（和幸存者**完全一样**）：**一局游戏内不会重复抽到** ——
   * `offerFrom` 是 `shift()`，抽走即出池；**没选中的那张也一样出池、本局不再出现**。
   * 所以"不重复"是物理保证的，不需要额外记录"已经发过哪些"。
   */
  state.traitPool = {
    survivor: shuffle(defs.filter((t) => t.faction === 'survivor').map((t) => t.id)),
    killer: shuffle(defs.filter((t) => t.faction === 'killer').map((t) => t.id)),
  };
  state.traits = {};
  state.traitOffers = {};
  state.traitUsed = [];
  state.traitPickQueue = [];

  logDraftStart(state, defs);
  /**
   * 发牌顺序**统一由 `openNextTraitPick` 负责**：它先发幸存者，
   * 幸存者全选完才轮到杀手（简单难度杀手不抽，自然没有候选）。
   *
   * ⚠ 这里**不要**提前给杀手发候选 —— 那样既要再放回池子、又容易把
   * "不重复"这件事搞乱（曾经写过一版"发出去再 unshift 放回"的绕弯写法，已删）。
   */
  openNextTraitPick(state);
  return true;
}

/** 开局战报：把难度和发牌规则说清楚 */
function logDraftStart(state: GameState, defs: TraitDef[]) {
  const plan = KILLER_TRAIT_PLAN[state.traitDifficulty] ?? KILLER_TRAIT_PLAN.normal;
  const label = TRAIT_DIFFICULTY_LABEL[state.traitDifficulty] ?? state.traitDifficulty;
  const killerPart =
    plan.draw === 0
      ? '杀手不抽特性卡'
      : `每名杀手抽 ${plan.draw} 张选 ${plan.keep} 张`;
  log(
    state,
    `【变体1】特性卡：生存难度【${label}】（幸存者每人抽 ${SURVIVOR_TRAIT_DRAW} 张选 ${SURVIVOR_TRAIT_KEEP} 张；${killerPart}）。` +
      `一局不会发出重复的特性卡。幸存者先选，选完杀手再选。`,
    'all',
    true,
  );
  /** 池子大小写进战报，方便校对（defs 只是为了让"牌池是 20/20"这件事有据可查） */
  log(
    state,
    `特性卡牌池：幸存者 ${defs.filter((t) => t.faction === 'survivor').length} 张、` +
      `杀手 ${defs.filter((t) => t.faction === 'killer').length} 张。`,
    'all',
  );
}

/**
 * 发下一个（或下一批）候选。
 *
 *  - 1对3 / 2对3：三名幸存者**同时**弹窗（各选各的）。
 *  - 单人 / 1对1 / 1对2：**按座位顺序**一次一个。
 *  - 幸存者全选完 → 才轮到杀手（2对3 两名杀手同时弹窗）。
 *  - 所有人都选完 → 结算开局设置类效果 → 通知 engine 开局。
 */
export function openNextTraitPick(state: GameState): void {
  if (!state.variant1) return;
  const offered = (id: string) => Boolean(state.traitOffers[id]);
  const chosen = (id: string) => Array.isArray(state.traits[id]);

  const survivors = survivorSeatOrder(state).filter((id) => !offered(id) && !chosen(id));
  if (survivors.length) {
    if (survivorsPickTraitsInParallel(state)) {
      for (const id of survivors) offerFrom(state, id, 'survivor', SURVIVOR_TRAIT_DRAW);
    } else {
      offerFrom(state, survivors[0]!, 'survivor', SURVIVOR_TRAIT_DRAW);
    }
    return;
  }

  const plan = KILLER_TRAIT_PLAN[state.traitDifficulty] ?? KILLER_TRAIT_PLAN.normal;
  const killers = (state.killerIds ?? []).filter((id) => !offered(id) && !chosen(id));
  if (killers.length && plan.draw > 0) {
    /** 2对3：两名杀手各自抽各自选（同时弹窗）；单人局只有一个 */
    for (const id of killers) offerFrom(state, id, 'killer', plan.draw);
    return;
  }

  /** 全部选完 —— 结算开局设置类效果，然后放行开局 */
  onTraitSetup?.(state);
  onTraitDraftDone?.(state);
}

/**
 * 玩家选牌。`ids` 必须正好是"该他选的张数"，而且都在他摸到的候选里。
 *
 * 候选里**没被选中的牌直接弃掉**（用户规则：一局不能发重复的特性卡，
 * 没选的那张也出池、本局不再出现）。
 */
export function pickTraits(state: GameState, playerId: string, ids: string[]): void {
  if (!state.variant1) throw new Error('本局没有开启【变体1】特性卡');
  const offer = state.traitOffers[playerId];
  if (!offer?.length) throw new Error('现在不是他选特性的时候');
  const isKiller = state.players[playerId]?.faction === 'killer';
  const keep = isKiller
    ? (KILLER_TRAIT_PLAN[state.traitDifficulty] ?? KILLER_TRAIT_PLAN.normal).keep
    : SURVIVOR_TRAIT_KEEP;
  const uniq = [...new Set(ids ?? [])];
  if (uniq.length !== keep) throw new Error(`请选 ${keep} 张特性卡`);
  for (const id of uniq) {
    if (!offer.includes(id)) throw new Error('这张不在你抽到的特性卡里');
  }
  /**
   * 抽出来的候选**全部出池**（已经 `shift` 出去了，这里不用再动池子），
   * 只把结果记下来；没选中的那张自然就"消失"了。
   */
  state.traits[playerId] = uniq;
  delete state.traitOffers[playerId];
  state.traitPickQueue = (state.traitPickQueue ?? []).filter((id) => id !== playerId);

  const who = state.players[playerId];
  const names = uniq.map((id) => traitDef(state, id)?.name ?? id).join('、');
  if (isKiller) {
    /** 杀手特性要**展示给幸存者**（双方战报） */
    log(state, `杀手 ${who?.name ?? playerId} 选定了特性卡：${names}。`, 'all', true);
  } else {
    /** 幸存者特性：所有幸存者互相可见，杀手看不到 */
    log(state, `${who?.name ?? playerId} 选定了特性卡：${names}。`, 'survivor', true);
  }

  openNextTraitPick(state);
}

/**
 * 开局设置类特性**清单**（卡面写「游戏开始时」的）。
 *
 * 实际结算由 engine 的 `applyVariant1Setup` 负责（要动杀手的切片），
 * 这里只提供"谁有哪张 setup 特性"的查询，避免两边各写一套判断。
 */
export function setupTraitsOf(state: GameState, playerId: string): TraitDef[] {
  return (state.traits?.[playerId] ?? [])
    .map((id) => traitDef(state, id))
    .filter((def): def is TraitDef => Boolean(def?.setup));
}
