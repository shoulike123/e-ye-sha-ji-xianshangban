/**
 * 【变体3】**计划卡**。
 *
 * 规则（用户口径，见 `变体3_设计.md`）：
 *  - 开局给**幸存者方**随机下发 2 张计划卡；**杀手看不到**（快照只发幸存者视角）。
 *  - 幸存者方**共同进行一个计划**：在大回合中、**发现阶段之前**可以确认 / 改变计划，
 *    每一次（含第一次确认）都要**所有幸存者玩家各自弹窗同意**。
 *  - 判定时机：**发现阶段结束后、大回合结束前**插入一次检查 ——
 *    **只检查人物位置**（四类地点图标 / 整句位置条件），不查动作、物品、有没有搜索过。
 *  - 每个大回合**最多推进一个进度**；推进一次就停。
 *  - 本回合**换过计划** → 进发现阶段检查时**原计划进度清零**，再从新计划第一条看起。
 *  - 完成整张计划 → **另一张计划卡隐藏**、所有幸存者获得它的能力；
 *    文字写明「每場遊戲僅限一次」的能力**先到先得**（队伍共享一次）。
 *
 * 这个模块**不 import engine**（engine 反过来 import 它，成环会很痛）：
 * 需要 engine 参与的地方（开遭遇、胜负判定）通过注入的回调。
 */
import type { GameContent } from '../content/loader.js';
import type { PlanAbility, PlanDef, PlanStep } from '../content/schema.js';
import { log, mainExitRoomId, shuffle } from './effects.js';
import type { GameState, PlayerState } from './types.js';

/** 开局发几张 */
export const PLAN_HAND_SIZE = 2;

/** 四类地点图标 → 地图 `room.tags` */
export const PLAN_ICON_TAG: Record<string, string> = {
  gear: 'repairable',
  hammer: 'special-hammer',
  book: 'special-book',
  spiral: 'special-spiral',
};

/** `createLobby` 里的初始值（集中一处，免得漏字段） */
export function planDefaults() {
  return {
    variant3: false,
    planById: {} as Record<string, PlanDef>,
    planHand: [] as string[],
    planCurrentId: null as string | null,
    planStep: 0,
    planAdvancedThisRound: false,
    planChangedThisRound: false,
    pendingPlanSwitch: null as { toId: string; fromId: string | null; requestedBy: string; votes: string[] } | null,
    planCompletedId: null as string | null,
    planUsedAbilities: [] as string[],
    planMarkers: [] as string[],
    encountersThisRound: 0,
  };
}

/* ------------------------------------------------------------ 查询 ---- */

export function planById(state: GameState, id: string | null | undefined): PlanDef | null {
  if (!id) return null;
  return state.planById?.[id] ?? null;
}

/** 当前进行中的计划（还没确认就 null） */
export function currentPlan(state: GameState): PlanDef | null {
  return planById(state, state.planCurrentId);
}

export function aliveSurvivors(state: GameState): PlayerState[] {
  return Object.values(state.players).filter(
    (p) => p.faction === 'survivor' && p.alive && Boolean(p.roomId),
  );
}

/**
 * 现在场上活着的杀手棋子**所在地点**。
 *
 * ⚠ 雕像局（用户口径）：
 *  - **所有雕像都算「杀手地点」**（4 尊都是杀手）；
 *  - 但**原始棋子不算** —— 「主雕像就代表原始棋子，雕像局在幸存者视角就只有
 *    4 个杀手，不应多一个」，所以它已经被藏起来（`roomId = null`），
 *    这里再显式滤一道，免得以后它的位置又被别处赋上。
 */
export function killerRoomIds(state: GameState): string[] {
  const statueGame = (state.statueIds?.length ?? 0) > 0;
  return Object.values(state.players)
    .filter((p) => p.faction === 'killer' && p.roomId)
    .filter((p) => !statueGame || p.statueIndex != null)
    .map((p) => p.roomId!);
}

/** 带某个 tag 的地点 */
export function roomsWithTag(state: GameState, tag: string): string[] {
  return (state.map.rooms ?? []).filter((r) => (r.tags ?? []).includes(tag)).map((r) => r.id);
}

/**
 * **这条进度条件现在满足吗** —— 只看人物位置（用户口径）。
 */
export function planStepSatisfied(state: GameState, step: PlanStep | undefined): boolean {
  if (!step) return false;
  const alive = aliveSurvivors(state);
  if (!alive.length) return false;
  const roomsOf = (list: PlayerState[]) => new Set(list.map((p) => p.roomId!));

  if (step.icon) {
    const tag = PLAN_ICON_TAG[step.icon];
    if (!tag) return false;
    const rooms = roomsWithTag(state, tag);
    return alive.some((p) => rooms.includes(p.roomId!));
  }
  switch (step.place) {
    /** 杀手地点：**任意**幸存者与杀手（雕像局＝任意雕像）同处一地 */
    case 'killerRoom': {
      const kill = killerRoomIds(state);
      return alive.some((p) => kill.includes(p.roomId!));
    }
    /** 所有幸存者位于同一地点（只剩一人时，它同时满足"同一地点"和"不同地点"） */
    case 'allSame':
      return roomsOf(alive).size === 1;
    case 'allDifferent':
      return roomsOf(alive).size === alive.length;
    case 'hiddenExit': {
      const rooms = roomsWithTag(state, 'hiddenExit');
      return alive.some((p) => rooms.includes(p.roomId!));
    }
    case 'mainExit': {
      const id = mainExitRoomId(state);
      return Boolean(id) && alive.some((p) => p.roomId === id);
    }
    default:
      return false;
  }
}

/** 这条进度条件的给玩家看的说法（战报 / 界面提示用） */
export function planStepText(state: GameState, step: PlanStep | undefined): string {
  if (!step) return '';
  if (step.icon) {
    const names: Record<string, string> = {
      gear: '修理地点',
      hammer: '锤子地点',
      book: '书本地点',
      spiral: '螺旋地点',
    };
    return `${names[step.icon] ?? step.icon}（${step.label}）`;
  }
  const names: Record<string, string> = {
    killerRoom: '杀手地点',
    allSame: '所有幸存者位于同一地点',
    allDifferent: '所有幸存者位于不同地点',
    hiddenExit: '隐藏出口',
    mainExit: '主要出口',
  };
  return `${names[step.place ?? ''] ?? step.place}（${step.label}）`;
}

/* ------------------------------------------------------------ 开局 ---- */

/**
 * 开局给幸存者方下发计划卡（**排在其它同时机的动作之后**）。
 * `variant3` 没开就把这块状态清干净。
 */
export function setupPlanCards(state: GameState, content: GameContent): void {
  state.planById = Object.fromEntries((content.plans ?? []).map((p) => [p.id, p]));
  state.planHand = [];
  state.planCurrentId = null;
  state.planStep = 0;
  state.planAdvancedThisRound = false;
  state.planChangedThisRound = false;
  state.pendingPlanSwitch = null;
  state.planCompletedId = null;
  state.planUsedAbilities = [];
  state.planMarkers = [];
  if (!state.variant3)
    return;
  const pool = (content.plans ?? []).map((p) => p.id);
  if (!pool.length) {
    log(state, '【变体3】计划卡：内容里没有计划卡，跳过。', 'survivor');
    return;
  }
  state.planHand = shuffle(pool).slice(0, Math.min(PLAN_HAND_SIZE, pool.length));
  log(
    state,
    `【变体3】计划卡：给幸存者方下发 ${state.planHand.length} 张计划卡` +
      `（${state.planHand.map((id) => `「${state.planById[id]?.name ?? id}」`).join('、')}）——` +
      '在发现阶段之前可以确认 / 改变计划（要所有幸存者玩家同意）。**杀手看不到这些卡**。',
    'survivor',
  );
}

/** 每个大回合开始：重置"本回合已推进进度" */
export function onPlanRoundStart(state: GameState): void {
  if (!state.variant3) return;
  state.planAdvancedThisRound = false;
}

/* -------------------------------------------------- 确认 / 改变计划 ---- */

/**
 * 现在能不能选 / 改计划：**幸存者大回合中、发现阶段之前**。
 *
 * 传了 `controllerId` 时还会管【变体2 分头行动】那条：**只有当前先手玩家**能选 / 改。
 */
export function canPickPlan(state: GameState, controllerId?: string): boolean {
  if (!state.variant3) return false;
  if (state.planCompletedId) return false;
  if (state.phase !== 'survivorMain') return false;
  /**
   * 分头行动：只有**当前先手**能选择 / 改变计划。
   * "当前先手" = `turnOrder` 里第一个还活着的幸存者
   * （`applySplitTurnOrder` 已经把先手旋转到最前）。
   */
  if (state.split && controllerId) {
    const firstId = state.turnOrder.find((id) => {
      const p = state.players[id];
      return Boolean(p?.alive && p.faction === 'survivor');
    });
    const first = firstId ? state.players[firstId] : null;
    if (first && first.controllerId !== controllerId) return false;
  }
  return true;
}

/** 票仓：**所有幸存者玩家**（有人掉线就卡着等，所以不剔除掉线的人） */
export function planVoters(state: GameState): Array<{ id: string; name: string }> {
  return (state.survivorOperators ?? []).map((o) => ({ id: o.id, name: o.name }));
}

/**
 * 发起"确认 / 改变计划"。第一次选 = 确认计划；之后再选 = 改变计划。
 *
 * ⚠ **每一次都要所有幸存者玩家各自同意**（用户口径）；发起人自己算第一票。
 */
export function beginPlanSwitch(
  state: GameState,
  controllerId: string,
  planId: string,
): void {
  if (!state.variant3)
    throw new Error('本局没有开启【变体3】计划卡');
  if (!canPickPlan(state, controllerId))
    throw new Error('现在不能选择计划（只能在幸存者大回合、发现阶段之前；分头行动时只有先手能选）');
  if (state.pendingPlanSwitch)
    throw new Error('已经在等大家确认计划了');
  if (!state.planHand.includes(planId))
    throw new Error('这张计划卡不在你们手上');
  if (state.planCurrentId === planId)
    throw new Error(`现在进行的就是「${planById(state, planId)?.name ?? planId}」`);
  state.pendingPlanSwitch = {
    toId: planId,
    fromId: state.planCurrentId,
    requestedBy: controllerId,
    votes: [controllerId],
  };
  log(
    state,
    `【变体3】${state.planCurrentId ? '改变计划' : '确认计划'}：` +
      `「${planById(state, planId)?.name ?? planId}」——等所有幸存者玩家确认。`,
    'survivor',
  );
  maybeFinishPlanSwitch(state);
}

export function planSwitchProgress(state: GameState) {
  const pend = state.pendingPlanSwitch;
  const voters = planVoters(state);
  if (!pend) {
    return {
      confirmed: [] as string[],
      waiting: voters.map((v) => v.name),
      confirmedIds: [] as string[],
      waitingIds: voters.map((v) => v.id),
    };
  }
  return {
    /** 名字：给界面显示 */
    confirmed: voters.filter((v) => pend.votes.includes(v.id)).map((v) => v.name),
    waiting: voters.filter((v) => !pend.votes.includes(v.id)).map((v) => v.name),
    /**
     * ⚠ **id 也要给**：客户端要判断"我自己是不是还在等投票的人"
     * （只给名字的话，拿 id 去比永远不相等 → "同意/不同意"按钮永远不出现）。
     */
    confirmedIds: voters.filter((v) => pend.votes.includes(v.id)).map((v) => v.id),
    waitingIds: voters.filter((v) => !pend.votes.includes(v.id)).map((v) => v.id),
  };
}

/** 某个幸存者玩家投票 */
export function votePlanSwitch(
  state: GameState,
  controllerId: string,
  accept: boolean,
): void {
  const pend = state.pendingPlanSwitch;
  if (!pend)
    throw new Error('现在没有待确认的计划');
  if (accept === false) {
    log(
      state,
      `【变体3】有人不同意这次计划变更，「${planById(state, pend.toId)?.name ?? pend.toId}」作废（保持原样）。`,
      'survivor',
    );
    state.pendingPlanSwitch = null;
    return;
  }
  if (!pend.votes.includes(controllerId))
    pend.votes.push(controllerId);
  maybeFinishPlanSwitch(state);
}

/** 全员同意 → 计划生效 */
function maybeFinishPlanSwitch(state: GameState): void {
  const pend = state.pendingPlanSwitch;
  if (!pend) return;
  const voters = planVoters(state);
  const all = voters.every((v) => pend.votes.includes(v.id));
  if (!all) return;
  const plan = planById(state, pend.toId);
  const first = !pend.fromId;
  state.planCurrentId = pend.toId;
  /**
   * ⚠ **第一次确认计划不算"改过"**（用户口径：第一次的选择先写进判断标准）；
   * 只有真的从 A 换成 B 才标记为"本回合改过"，进发现阶段检查时据此清零。
   */
  state.planChangedThisRound = !first;
  log(
    state,
    first
      ? `【变体3】计划确认：「${plan?.name ?? pend.toId}」——从第一条进度开始。`
      : `【变体3】计划变更：「${plan?.name ?? pend.toId}」（原计划的进度会在发现阶段检查时清零）。`,
    'survivor',
  );
  state.pendingPlanSwitch = null;
}

/* ------------------------------------------------------ 进度检查 ---- */

/**
 * **发现阶段结束后、大回合结束前**调一次（engine 在 `enterNoiseReport` 里调）。
 *
 * @returns true = 这一步直接分出了胜负（"立刻获胜"类能力），调用方要停下
 */
export function checkPlanProgress(state: GameState): boolean {
  if (!state.variant3) return false;
  const plan = currentPlan(state);
  if (!plan) {
    state.planChangedThisRound = false;
    return false;
  }
  /** ① 本回合**换过计划** → 原计划进度清零，从新计划第一条重新看 */
  if (state.planChangedThisRound) {
    state.planStep = 0;
    state.planChangedThisRound = false;
    log(state, '【变体3】本回合换过计划：进度清零，从当前计划的第一条重新开始。', 'survivor');
  }
  /** ② 每个大回合最多推进一个进度 */
  if (state.planAdvancedThisRound) {
    log(state, '【变体3】本大回合已经推进过一个进度了，剩下的大回合再说。', 'survivor');
    return false;
  }
  const step = plan.progress[state.planStep];
  if (!step)
    return false;
  if (!planStepSatisfied(state, step)) {
    log(
      state,
      `【变体3】计划「${plan.name}」第 ${state.planStep + 1} 条没达成：` +
        `${planStepText(state, step)}（只按人物位置判定）。`,
      'survivor',
    );
    return false;
  }
  state.planStep += 1;
  state.planAdvancedThisRound = true;
  log(
    state,
    `【变体3】计划「${plan.name}」推进：${step.label}` +
      `（${state.planStep}/${plan.progress.length}）。`,
    'survivor',
  );
  if (state.planStep >= plan.progress.length)
    completePlan(state, plan, state.discoveryActorId ?? aliveSurvivors(state)[0]?.id ?? null);
  return state.phase === 'gameOver';
}

/** 完成整张计划：另一张隐藏、能力生效 */
function completePlan(state: GameState, plan: PlanDef, actorId: string | null = null): void {
  if (state.planCompletedId === plan.id) return;
  state.planCompletedId = plan.id;
  log(
    state,
    `【变体3】计划「${plan.name}」**完成**：所有幸存者获得它的能力；另一张计划卡作废隐藏。`,
    'survivor',
  );
  for (let i = 0; i < plan.abilities.length; i += 1) {
    const ab = plan.abilities[i]!;
    if (ab.kind === 'onComplete')
      applyPlanAbility(state, plan, i, actorId);
  }
}

/* -------------------------------------------------------- 能力 ---- */

/** 一次性能力的键（先到先得：队伍共享一次） */
export function planAbilityKey(planId: string, index: number): string {
  return `${planId}#${index}`;
}

export function planAbilityUsed(state: GameState, planId: string, index: number): boolean {
  return (state.planUsedAbilities ?? []).includes(planAbilityKey(planId, index));
}

/** 计划是否已经完成（能力只有在完成后才有） */
export function planCompleted(state: GameState, planId: string): boolean {
  return state.planCompletedId === planId;
}

/**
 * **这张计划是否已完成、且带某条 `impl` 能力**（按 `impl` 认，不按卡名）。
 *
 * 被动类效果（修理不响 / 额外修理标记 / 秘密通道互连 …）要接进 effects.ts 的
 * 现有流程，而那边不能 import 本模块 —— 由 engine 把这个判定注入过去。
 */
export function planHasImpl(state: GameState, impl: string): boolean {
  const plan = planById(state, state.planCompletedId);
  if (!plan) return false;
  return plan.abilities.some((a) => a.impl === impl);
}

/**
 * 现在正在行动的那名幸存者（和 engine 的 `activeSurvivorId` 同一口径，
 * 这里自己算一份 —— plans.ts 不能 import engine）。
 *
 * 1对3 / 2对3 里三人**同时**行动，不用看这个；单人 / 1对1 / 1对2 才看。
 */
function actingSurvivorId(state: GameState): string | null {
  if (state.phase !== 'survivorMain' || state.pendingSurvivorPick) return null;
  return state.turnOrder[state.activeSurvivorIndex] ?? null;
}

/** 这张地图上所有秘密通道的端点（①「互相連接」之后它们彼此直连） */
function passageEndpoints(state: GameState): string[] {
  const all = new Set<string>();
  for (const e of state.map.passages ?? []) {
    all.add(e.from);
    all.add(e.to);
  }
  return [...all];
}

/**
 * 能力现在能不能发动（行动区按钮的可用性判定）。
 * 只做**通用**检查：计划已完成、没被用掉、地点/代价够 —— 具体效果在 `applyPlanAbility`。
 */
export function planAbilityBlockReason(
  state: GameState,
  planId: string,
  index: number,
  actor: PlayerState,
): string | null {
  const plan = planById(state, planId);
  const ab = plan?.abilities[index];
  if (!plan || !ab) return '这张计划卡没有这条能力';
  if (!planCompleted(state, planId)) return '计划还没完成';
  if (ab.kind === 'win' || ab.kind === 'onComplete' || ab.kind === 'passive') return '这条能力不是主动发动的';
  if (ab.oncePerGame && planAbilityUsed(state, planId, index)) return '这条能力本局已经用过了';
  /**
   * **时机**：「額外行動 / 特殊行動」都是**幸存者行动阶段**里做的事。
   *
   * 单人 / 1对1 / 1对2 一次只有一名幸存者在行动（额外移动力 / 一般行动都是"他的"），
   * 所以还要正在轮到他；1对3 / 2对3 三人同时行动，不判这一条。
   */
  const simultaneous = state.mode === 'multi' || state.mode === '2v3';
  if (ab.kind === 'extra' || ab.kind === 'special') {
    if (state.phase !== 'survivorMain') return '只能在幸存者行动阶段发动';
    if (!simultaneous) {
      const acting = actingSurvivorId(state);
      if (acting && acting !== actor.id) return '现在不是你的小回合';
    }
  }
  /** 特殊行动占一般行动名额 */
  if (ab.kind === 'special' && actor.mainActionUsed) return '本小回合的一般行动已经用掉了';
  /** 通道調查 ②：必须站在秘密通道地点、且地图上有别的通道口 */
  if (ab.impl === 'moveThroughPassage') {
    const ends = passageEndpoints(state);
    if (!actor.roomId || !ends.includes(actor.roomId)) return '必须在秘密通道地点发动';
    if (ends.length <= 1) return '这张地图没有别的秘密通道出口';
  }
  /**
   * 秘術草藥：**没伤、没中毒、没恐惧就没什么可治的** —— 直接不让点，
   * 免得白白吃掉"每场一次"（`applyPlanAbility` 是一进来就记"用过了"的）。
   */
  if (ab.impl === 'healClearFear') {
    const hurt = actor.hp < actor.maxHp;
    const poisoned = (state.poisoned ?? []).includes(actor.id);
    const feared = (actor.fear ?? 0) > 0 || actor.overFear === true;
    if (!hurt && !poisoned && !feared) return '你既没受伤、没有中毒，也没有恐惧';
  }
  if (ab.place === 'mainExit') {
    const id = mainExitRoomId(state);
    if (!id || actor.roomId !== id) return '必须在主要出口发动';
  }
  if (ab.place === 'spiral') {
    const rooms = roomsWithTag(state, PLAN_ICON_TAG.spiral!);
    if (!actor.roomId || !rooms.includes(actor.roomId)) return '必须在螺旋地点发动';
  }
  if (ab.cost) {
    const have = actor.items?.[ab.cost.item] ?? 0;
    if (have < ab.cost.count) {
      const names: Record<string, string> = { toolbox: '工具箱', amulet: '古代护符' };
      return `需要 ${ab.cost.count} 个${names[ab.cost.item] ?? ab.cost.item}`;
    }
  }
  return null;
}

/**
 * 真正执行一条能力。
 *
 * ⚠ 这里只做**通用的**部分（扣代价、记"用过了"、地图标记、战报），
 * 具体效果按 `impl` 分支 —— 还没实现的 impl 会写一条"待实现"战报，
 * 不会静默吃掉（免得玩家以为发动成功却没效果）。
 */
export function applyPlanAbility(
  state: GameState,
  plan: PlanDef,
  index: number,
  actorId?: string | null,
  target?: PlanAbilityTarget | null,
): void {
  const ab = plan.abilities[index];
  if (!ab) return;
  const actor = actorId ? state.players[actorId] : null;
  if (ab.oncePerGame) {
    if (planAbilityUsed(state, plan.id, index))
      return;
    state.planUsedAbilities = [...(state.planUsedAbilities ?? []), planAbilityKey(plan.id, index)];
  }
  /** 代价：弃物品 */
  if (ab.cost && actor) {
    const have = actor.items?.[ab.cost.item] ?? 0;
    if (have >= ab.cost.count) {
      const left = have - ab.cost.count;
      if (left > 0)
        actor.items[ab.cost.item] = left;
      else
        delete actor.items[ab.cost.item];
      log(
        state,
        `【变体3】${actor.name} 弃掉 ${ab.cost.count} 个` +
          `${ab.cost.item === 'toolbox' ? '工具箱' : ab.cost.item === 'amulet' ? '古代护符' : ab.cost.item}。`,
        'survivor',
      );
    }
  }
  log(
    state,
    `【变体3】计划能力「${plan.name}」：${ab.text}`,
    'survivor',
  );
  if (ab.mapMarker && actor?.roomId) {
    addPlanMarker(state, actor.roomId);
    log(state, `【变体3】在「${roomNameOf(state, actor.roomId)}」放置计划标记。`, 'survivor');
  }
  planAbilityEffect?.(state, plan, index, actorId ?? null, target ?? null);
}

/**
 * 【变体3】需要**指定目标**的能力（现在只有「通道調查 ②」要选通道出口）。
 * 目标由界面点出来，跟着 `usePlanAbility` 一起送进来。
 */
export type PlanAbilityTarget = { toRoomId?: string | null; targetPlayerId?: string | null };

/** 具体效果由 engine 注入（它认识地牢/遭遇/胜负那一套） */
let planAbilityEffect:
  | ((
      state: GameState,
      plan: PlanDef,
      index: number,
      actorId: string | null,
      target: PlanAbilityTarget | null,
    ) => void)
  | null = null;

export function setPlanAbilityEffectHandler(
  fn: (
    state: GameState,
    plan: PlanDef,
    index: number,
    actorId: string | null,
    target: PlanAbilityTarget | null,
  ) => void,
): void {
  planAbilityEffect = fn;
}

/* ------------------------------------------------ 地图上的计划标记 ---- */

export function addPlanMarker(state: GameState, roomId: string): void {
  if (!state.planMarkers) state.planMarkers = [];
  if (!state.planMarkers.includes(roomId)) state.planMarkers.push(roomId);
}

export function planMarkersAt(state: GameState, roomId: string): boolean {
  return (state.planMarkers ?? []).includes(roomId);
}

/** 坍塌把那个地点的计划标记一起清掉（用户口径） */
export function clearPlanMarkersIn(state: GameState, roomId: string): void {
  state.planMarkers = (state.planMarkers ?? []).filter((id) => id !== roomId);
}

function roomNameOf(state: GameState, roomId: string): string {
  const room = (state.map.rooms ?? []).find((r) => r.id === roomId);
  return room ? `${room.id}${room.name ?? ''}` : roomId;
}

/** 给界面用：这两张卡现在的状态（进度、能力可用性） */
export function planViewFor(state: GameState, planId: string, actor?: PlayerState | null) {
  const plan = planById(state, planId);
  if (!plan) return null;
  const done = planCompleted(state, planId);
  const current = state.planCurrentId === planId && !state.planCompletedId;
  return {
    id: plan.id,
    name: plan.name,
    art: plan.art,
    progress: plan.progress.map((s, i) => ({
      label: s.label,
      text: planStepText(state, s),
      done: done || (current && i < state.planStep),
      current: current && i === state.planStep,
    })),
    abilities: plan.abilities.map((ab, i) => {
      /**
       * ⚠ **能不能发动**要在这里算好：客户端拿不到 `state`，
       * 自己判"地点对不对 / 代价够不够 / 是不是用过了"会和服
       * 务端说法不一致（用户报过这类"按钮亮着但点了被拒"）。
       */
      const reason = actor ? planAbilityBlockReason(state, plan.id, i, actor) : null;
      return {
        text: ab.text,
        kind: ab.kind,
        /** 【变体3】能力的实现键 —— 客户端要用它认出"这条能力要先在地图上选目标" */
        impl: ab.impl,
        /** 需要先选秘密通道出口（通道調查 ②） */
        needsPassage: ab.impl === 'moveThroughPassage',
        hasBox: Boolean(ab.hasBox),
        oncePerGame: Boolean(ab.oncePerGame),
        used: planAbilityUsed(state, plan.id, i),
        /** 主动能力（能点"发动"） */
        active: ab.kind === 'special' || ab.kind === 'extra',
        usable: Boolean(actor) && !reason,
        blockReason: reason,
      };
    }),
    /** 已完成（能力已生效） */
    completed: done,
    /** 当前进行中 */
    active: current,
    /** 还没确认任何计划时，两张都还是"候选" */
    candidate: !state.planCurrentId && !state.planCompletedId,
  };
}
