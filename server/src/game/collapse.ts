/**
 * **【墓穴】特殊规则**。
 *
 * 两条：
 *  ① **坍塌** —— 杀手每一次升级之前（1→2、2→3、3→4、4→5，共 4 次），
 *     在**触发进化的第一时间**随机选一个"还没塌过的可坍塌地点"让它塌掉。
 *     时机严格是：**先告诉杀手进化到几级 → 结算坍塌 → 再结算进化本身 → 再继续**。
 *  ② **遺物室（R6）** —— 一个正反面遗物标记 + 一副遗物牌堆。
 *
 * 放在单独文件里而不是塞进 engine：
 * 「墓穴这张图有什么特殊规则」一眼能看全，以后加新地图也只动这种文件。
 */
import type { GameState, PlayerState } from './types.js';
import {
  applyDamage,
  isKeyCard,
  log,
  logSplit,
  pushNoise,
  roomName,
  shuffle,
  triggerHunterTrapOnEnter,
} from './effects.js';
/** 遗物各张牌的规则在 `relic.ts`（本文件只管牌堆与标记） */
import { applyRelicKey, discardRelic, giveRelic, relicKindOf } from './relic.js';
/** 【变体3】坍塌要把该地点的计划标记一起清掉 */
import { clearPlanMarkersIn } from './plans.js';

/* ------------------------------------------------------------ 基本 ---- */
export const MAP_CRYPT = 'crypt';
/** 遺物室（R6）—— 遗物标记放在这里 */
export const RELIC_ROOM = 'R6';

const isCrypt = (state: GameState) => state.map.id === MAP_CRYPT;

/**
 * **可坍塌的地点**：直接从地图 JSON 读（`map.collapsibleRooms`），
 * 这样调坐标/改规则不用动代码，地图编辑界面里也能看到。
 * 没配就按空处理（= 这张图没有坍塌规则）。
 */
export function collapsibleRooms(state: GameState): string[] {
  return [...(state.map.collapsibleRooms ?? [])];
}

/** 这个地点现在是不是**已经没了**（塌了）。engine 把它注入给 effects，用作寻路封锁。 */
export function isRoomGone(state: GameState, roomId: string): boolean {
  return (state.collapsedRooms ?? []).includes(roomId);
}

/** 还有哪些地点没塌（随机挑一个从这里挑） */
export function standingCollapsibleRooms(state: GameState): string[] {
  return collapsibleRooms(state).filter((id) => !isRoomGone(state, id));
}

/* ------------------------------------------------ ① 坍塌：触发 ---- */

/**
 * 进化的**最第一时间**调用（比任何进化效果都早）。
 *
 * 行为：
 *  - 没轮到坍塌（不是墓穴 / 已经塌完 / 这次不是升级）→ 返回 `false`，升级照常继续
 *  - 要坍塌 → 记下 `pendingCollapse` 并返回 `true`，
 *    **调用方必须立刻打住**，等 `pendingCollapse` 被结算（`beginCollapse`）后再自己补跑一次进化
 *
 * 「随机选哪个地点」由服务端抽（`shuffle` 取第一个），
 * 因为规则写的是"自动随机选择"，这一步不是人的选择。
 */
export function interceptEvolutionForCollapse(state: GameState, fromLevel: number, toLevel: number): boolean {
  if (!isCrypt(state)) return false;
  /**
   * 已经记下"待坍塌"了 —— 说明这次进化**已经被拦过一次**。
   * 此时必须放行，否则"结算完坍塌再跑一次进化"会又被拦住，卡成死循环。
   */
  if (state.pendingCollapse) return false;
  /**
   * ⚠ **坍塌排在"确认进化效果"之后**（用户口径）：
   * 「先确认进化效果 → 再执行双方坍塌结算 → 再执行特性卡里与进化有关的特性
   *   → 再执行进化效果」。
   *
   * 所以第一次拦下来时**不立刻塌**，只记一个"确认之后要塌"的标记；
   * 由 `ackEvolution`（点「确认新效果」）去消费它。
   * 已经记过标记就直接放行 —— 否则 `ackEvolution` 里再跑一次升级会被重复拦。
   */
  if (state.pendingCollapseAfterEvolution) return false;
  if (toLevel <= fromLevel) return false;
  if (!standingCollapsibleRooms(state).length) return false;
  state.pendingCollapseAfterEvolution = true;
  state.pendingCollapseLevel = toLevel;
  return true;
}

/**
 * 结算这次坍塌：挑一个地点塌掉，走完全部效果。
 *
 * 调用时机：`pendingCollapse === true` 的时候由 engine 在**继续升级之前**调用。
 * 结算完把 `pendingCollapse` 清掉，返回塌掉的地点 id。
 */
export function beginCollapse(state: GameState): string | null {
  if (!state.pendingCollapse) return null;
  state.pendingCollapse = false;
  const candidates = standingCollapsibleRooms(state);
  if (!candidates.length) return null;
  /** 自动随机 —— 这一步不是玩家选择的（和"所有操作都由人选"不冲突：规则明写自动随机） */
  const roomId = shuffle(candidates)[0]!;
  applyCollapse(state, roomId);
  return roomId;
}

/**
 * 把 `roomId` 塌掉。
 *
 * 顺序（按规则）：
 *  1. 公告：这个地点塌了（双方都看得到）
 *  2. **清除该位置的所有标记和仆从** —— 立绘（杀手/幸存者）保留
 *  3. 屋里的幸存者各受 1 点伤害（**公开**）
 *  4. 屋里潜行的杀手**暴露**，并取消「被揭露时」的效果（非揭露类的加成保留）
 *  5. 排队：屋里的人**轮流选择移动一步**离开（幸存者在先、杀手最后）
 *
 * ⚠ 墓穴的四个坍塌点（G5 / G6 / R4 / R5）周围**都没有门**，
 * 所以这里**不处理门封堵 / 机关大门** —— 那部分逻辑是死代码，已删。
 */
export function applyCollapse(state: GameState, roomId: string): void {
  if (isRoomGone(state, roomId)) return;
  state.collapsedRooms = [...(state.collapsedRooms ?? []), roomId];

  log(
    state,
    `💥「${roomName(state, roomId)}」**坍塌**了！这个地点已不存在。`,
    'all',
    true,
  );

  /* ② 清光这个位置上的一切标记 / 仆从（立绘除外） */
  const cleared = clearRoomMarkers(state, roomId);
  if (cleared.length) {
    log(state, `坍塌掩埋了「${roomName(state, roomId)}」上的：${cleared.join('、')}。`, 'all', true);
  }

  /* ③ 屋里的幸存者各受 1 点伤害（公开） */
  const survivorsHere = Object.values(state.players).filter(
    (p) => p.faction === 'survivor' && p.alive && p.roomId === roomId,
  );
  for (const s of survivorsHere) {
    applyDamage(state, s.id, 1, state.killerId ?? s.id, { skipAmulet: false });
  }

  /* ④ 潜行的杀手暴露（只影响**就在这个地点**的那颗棋子） */
  const killersHere = Object.values(state.players).filter(
    (p) => p.faction === 'killer' && p.roomId === roomId,
  );
  for (const k of killersHere) {
    if (!k.stealth) continue;
    k.stealth = false;
    log(
      state,
      `${k.name} 在坍塌中暴露了行踪。`,
      'all',
      true,
    );
  }

  /* ⑤ 排队离开 */
  const queue = [
    ...survivorsHere.filter((s) => s.alive).map((s) => s.id),
    ...killersHere.map((k) => k.id),
  ];
  if (queue.length) {
    state.pendingCollapseMoves = {
      roomId,
      killerId: killersHere.length ? state.killerId : null,
      queue: queue.slice(1),
      currentId: queue[0]!,
    };
    log(
      state,
      `坍塌的震动还没停：屋里的人必须**轮流走一步**离开（${queue.length} 人）。`,
      'all',
      true,
    );
  } else {
    state.pendingCollapseMoves = null;
  }
}

/**
 * 清除某地点上的一切标记与仆从（**立绘不动**）。
 * @returns 清掉的东西的名字（给战报用）
 */
function clearRoomMarkers(state: GameState, roomId: string): string[] {
  const gone: string[] = [];

  /** 核心标记（扼杀者） */
  const cores = (state.coreMarkers ?? []).filter((r) => r === roomId).length;
  if (cores) {
    state.coreMarkers = (state.coreMarkers ?? []).filter((r) => r !== roomId);
    gone.push(`核心标记 ×${cores}`);
  }

  /** 宝箱 */
  const chests = Object.entries(state.treasureChests ?? {}).filter(([, r]) => r === roomId);
  for (const [id] of chests) delete state.treasureChests[id];
  if (chests.length) gone.push(`宝箱 ×${chests.length}`);

  /** 猎手陷阱 */
  const traps = Object.entries(state.hunterTraps ?? {}).filter(([, t]) => t.roomId === roomId);
  for (const [id] of traps) delete state.hunterTraps[id];
  if (traps.length) gone.push(`猎手陷阱 ×${traps.length}`);

  /** 僵尸（女王的仆从） */
  const zombies = (state.zombies ?? []).filter((z) => z.roomId === roomId);
  if (zombies.length) {
    const ids = new Set(zombies.map((z) => z.id));
    state.zombies = (state.zombies ?? []).filter((z) => !ids.has(z.id));
    gone.push(`僵尸 ×${zombies.length}`);
  }

  /** 陷阱零件标记 */
  const parts = (state.trapPartRooms ?? []).filter((r) => r === roomId).length;
  if (parts) {
    state.trapPartRooms = (state.trapPartRooms ?? []).filter((r) => r !== roomId);
    /** 陷阱零件的 +2 防御效果也跟着没 */
    state.trapRoomIds = (state.trapRoomIds ?? []).filter((r) => r !== roomId);
    gone.push(`陷阱零件标记 ×${parts}`);
  }

  /** 响声标记 */
  const noises = (state.noises ?? []).filter((r) => r === roomId).length;
  if (noises) {
    state.noises = (state.noises ?? []).filter((r) => r !== roomId);
    gone.push(`响声标记 ×${noises}`);
  }

  /** 爆竹标记 */
  if (state.firecrackerRoomId === roomId) {
    state.firecrackerRoomId = null;
    gone.push('爆竹标记');
  }

  /**
   * 【变体3】计划标记：**坍塌会把它一起清掉**（用户口径：
   * 「地图上的计划标记就留着（墓穴的坍塌会清除坍塌地点的标记，注意）」）。
   */
  const planMarks = (state.planMarkers ?? []).filter((r) => r === roomId).length;
  if (planMarks) {
    clearPlanMarkersIn(state, roomId);
    gone.push(`计划标记 ×${planMarks}`);
  }

  /** 捕网「本回合不能离开」的效果（人都被赶走了，锁也没意义） */
  state.netLocks = (state.netLocks ?? []).filter((l) => l.roomId !== roomId);

  return gone;
}

/* ------------------------------------ ① 坍塌：屋里的人轮流走一步 ---- */

/**
 * 这个操控者现在是不是该操作"坍塌后离开"的那一步。
 * 由 engine 的 `resolveYouForController` 调用 —— 必须排在所有其它判定**前面**。
 */
export function collapseMoverFor(state: GameState, controllerId: string): PlayerState | null {
  const pend = state.pendingCollapseMoves;
  if (!pend?.currentId) return null;
  const p = state.players[pend.currentId];
  if (!p) return null;
  if (p.controllerId === controllerId) return p;
  /** 1对3（单杀手一家操控 / 房主代管）时也让他自己点 */
  if (state.mode === 'solo' && controllerId === state.hostId) return p;
  return null;
}

/**
 * 现在轮到的这个人可以走到哪些地点（**一步、且必须离开废墟**）。
 */
export function collapseMoveOptions(state: GameState, p: PlayerState): string[] {
  const pend = state.pendingCollapseMoves;
  if (!pend || pend.currentId !== p.id || !p.roomId) return [];
  const out: string[] = [];
  for (const e of state.map.edges ?? []) {
    let other: string | null = null;
    if (e.from === p.roomId) other = e.to;
    else if ((e.bidirectional ?? true) && e.to === p.roomId) other = e.from;
    if (!other) continue;
    /** 目的地不能也是废墟 */
    if (isRoomGone(state, other)) continue;
    /**
     * **只看"通不通"，不看封堵**。
     *
     * 墓穴的四个坍塌点（G5 / G6 / R4 / R5）周围**本来就没有门**，
     * 所以这里不用判封堵、也不用判机关大门 —— 以前那两行是死代码，已删。
     * 万一以后给坍塌点接上门，再按"幸存者不能过机关大门"补回来即可。
     */
    out.push(other);
  }
  return [...new Set(out)].sort();
}

/**
 * 完成"离开废墟"的那一步（`toRoomId = null` 表示留在原地）。
 *
 * 幸存者：**必须离开** —— 只有真的没有相邻地点可去时才允许留在原地（那种情况极罕见）。
 * 杀手：**强制**弃光所有手牌 + 移动一格；
 *   - 弃了哪些牌**不告诉幸存者**，只公布"杀手弃光了全部手牌"
 *   - 移动**对幸存者不可见**（幸存者只看到"有人离开了废墟"这种事都不该看到）
 */
export function resolveCollapseMove(state: GameState, playerId: string, toRoomId: string | null): void {
  const pend = state.pendingCollapseMoves;
  if (!pend || pend.currentId !== playerId) throw new Error('现在不是他选择移动');
  const p = state.players[playerId];
  if (!p) return;

  const options = collapseMoveOptions(state, p);
  if (toRoomId) {
    if (!options.includes(toRoomId)) throw new Error('只能走到相邻的地点');
  } else if (options.length) {
    throw new Error('坍塌了，必须移动一步离开');
  }

  if (p.faction === 'killer') {
    /**
     * **杀手弃光所有手牌**（用户口径：**不判断砸到的是不是主雕像** ——
     * 任意一尊雕像被砸，手牌就弃光；而且**每次**坍塌砸到都会弃，
     * 没有"一局一次"这种限制）。
     *
     * 雕像的手牌本来就挂在主雕像上，所以"受影响的这尊把杀手手牌清空"
     * 就等于"主雕像弃光手牌"；一局里被砸多次就弃多次（手牌空了自然没得弃）。
     *
     * **只公布"弃光了全部手牌 + 弃了几张"，不公布具体是哪几张** ——
     * 所以这条战报是 `'all'`，但文案里不出现任何牌名。
     */
    const n = state.killerHand.length;
    if (n) {
      state.killerDiscard = [...state.killerDiscard, ...state.killerHand];
      state.killerHand = [];
      logSplit(
        state,
        '杀手弃掉了**全部手牌**。',
        `杀手弃掉了**全部手牌**（共 ${n} 张，内容不公开）。`,
      );
    }
    if (toRoomId) {
      p.roomId = toRoomId;
      /** 幸存者看不到杀手去了哪 —— 对幸存者只说"杀手离开了" */
      log(state, `杀手离开了坍塌的「${roomName(state, pend.roomId)}」。`, 'survivor');
      log(state, `${p.name} 离开「${roomName(state, pend.roomId)}」，移动到「${roomName(state, toRoomId)}」。`, 'killer');
    } else {
      log(state, `杀手留在「${roomName(state, pend.roomId)}」（没有可去的地方）。`, 'killer');
    }
  } else {
    if (toRoomId) {
      p.roomId = toRoomId;
      log(state, `${p.name} 在坍塌中撤到「${roomName(state, toRoomId)}」。`, 'all', true);
      /**
       * 移动就要过陷阱判定 —— 女猎手规则是「**因任何原因进入**陷阱所在地点都触发」，
       * 被坍塌赶出去当然也算。
       *
       * 这里**不**走完整的 `tryMove`：那样会顺带改「上次移动路径」
       * （`lastMovePath` / `lastMoveCrossedBlockade`），还可能拆掉封堵 ——
       * 坍塌的移动不是"一般行动移动"，只借用陷阱判定这一条。
       */
      triggerHunterTrapOnEnter(state, p);
    } else {
      log(state, `${p.name} 无处可去，留在了废墟里。`, 'all', true);
    }
  }

  advanceCollapseMoves(state);
}

/** 轮到下一个人；没人了就收尾 */
export function advanceCollapseMoves(state: GameState): void {
  const pend = state.pendingCollapseMoves;
  if (!pend) return;
  while (pend.queue.length) {
    const id = pend.queue.shift()!;
    const p = state.players[id];
    if (!p) continue;
    /** 已经不在废墟里的（被前面的人带走了 / 死了）跳过 */
    if (p.roomId !== pend.roomId) continue;
    pend.currentId = id;
    const opts = collapseMoveOptions(state, p);
    log(
      state,
      opts.length
        ? `坍塌收尾：轮到 ${p.name} 选择移动一步离开「${roomName(state, pend.roomId)}」。`
        : `坍塌收尾：${p.name} 没有可去的地方了。`,
      'all',
      true,
    );
    return;
  }
  pend.currentId = null;
  state.pendingCollapseMoves = null;
  log(state, '坍塌的收尾结束。', 'all', true);
  /**
   * ⚠ **坍塌全部走完之后，才轮到下一步**（用户口径：
   * 「坍塌结算后才执行进化效果」）。
   *
   * 双人/单人热座里，进化流程可能在坍塌还没走完时就等在这里 ——
   * 由 engine 注入的 `onCollapseDone` 接着往下走（选卡 / 结算）。
   */
  onCollapseDone?.(state);
}

let onCollapseDone: ((state: GameState) => void) | null = null;

/**
 * engine 注入：**坍塌的逐人走位全部结束**时的回调。
 *
 * 为什么需要：坍塌会挂出"谁先走、谁后走"的队列，而进化流程
 * （确认 → 坍塌 → 特性 → 执行进化效果）必须**等它走完**才能继续 ——
 * 否则会出现"一边问幸存者移动、一边弹出进化选卡"两个待办打架
 * （用户报的"杀手界面里问幸存者移动 + 同时开始问进化卡牌"）。
 */
export function setCollapseDoneHandler(fn: (state: GameState) => void): void {
  onCollapseDone = fn;
}

/* ------------------------------------------------- ② 遺物室（R6）---- */


/** 这张图有没有遗物室规则 */
export function hasRelicRoom(state: GameState): boolean {
  return isCrypt(state) && state.map.rooms.some((r) => r.id === RELIC_ROOM);
}

/**
 * 开局：建立遗物牌堆（洗匀），标记正面朝上。
 * 牌从 `content/cards/*.json` 的 `decks.relic` 来，牌面文字与效果都在那边。
 */
export function setupRelicRoom(state: GameState, relicCardIds: string[]): void {
  /**
   * **只有墓穴这张图有遺物室**：别的图连牌堆都不建，
   * 免得"抽遗物"这种动作在没遗物室的地图上被误触发。
   */
  if (!hasRelicRoom(state)) {
    state.relicDeck = [];
    state.relicMarkerFaceUp = true;
    return;
  }
  state.relicDeck = shuffle(relicCardIds);
  state.relicMarkerFaceUp = true;
  if (!state.relicDeck.length) {
    log(state, `「${roomName(state, RELIC_ROOM)}」有遗物标记，但没有配置遗物牌。`, 'all', true);
    return;
  }
  log(
    state,
    `「${roomName(state, RELIC_ROOM)}」放着**遗物标记**（正面朝上）：在此地的幸存者可以花**额外行动**抽取 1 张遗物，抽完把它翻面；每个幸存者大回合开始时翻回正面。遗物牌堆 ${state.relicDeck.length} 张。`,
    'all',
    true,
  );
}

/** 这名幸存者现在能不能在遗物室抽遗物 */
export function canDrawRelic(state: GameState, p: PlayerState | undefined): boolean {
  if (!hasRelicRoom(state) || !p?.alive || p.faction !== 'survivor') return false;
  if (p.roomId !== RELIC_ROOM) return false;
  if (!state.relicMarkerFaceUp) return false;
  return (state.relicDeck ?? []).length > 0;
}

/**
 * 花额外行动抽 1 张遗物，然后把标记翻面。
 *
 * ⚠ **牌堆空了就是空了，不洗回**：遗物只有 5 张、一张一份，
 * 用掉的进普通弃牌堆当记录（见 `relic.discardRelic`），洗回来等于可以反复拿同一张。
 *
 * ⚠ **战报只给幸存者**（用户要求：幸存者大回合里的"搜索遗物"不写进杀手战报）。
 *
 * @returns 抽到的牌 id
 */
export function drawRelic(state: GameState, p: PlayerState): string {
  if (!canDrawRelic(state, p)) throw new Error('现在不能抽取遗物');
  const cardId = state.relicDeck.shift()!;
  state.relicMarkerFaceUp = false;
  const name = state.cardById[cardId]?.name ?? cardId;
  log(
    state,
    `${p.name} 在「${roomName(state, RELIC_ROOM)}」抽取了遗物「${name}」，遗物标记翻面（本大回合不能再抽）。`,
    'survivor',
  );
  return cardId;
}

/** 幸存者大回合开始：遗物标记翻回正面 */
export function onSurvivorRoundStart(state: GameState): void {
  if (!hasRelicRoom(state)) return;
  if (state.relicMarkerFaceUp) return;
  state.relicMarkerFaceUp = true;
  /**
   * ⚠ 用户口径：**这条不给杀手看**（它属于幸存者侧的节奏信息，
   * 和"抽遗物"那条一样）。以前标的是 `'all', true`，于是杀手战报里
   * 会冒出「新的大回合：遗物标记翻回正面…」这一行。
   */
  log(
    state,
    `新的大回合：遗物标记翻回正面，可以在「${roomName(state, RELIC_ROOM)}」抽取遗物了。`,
    'survivor',
  );
}

/**
 * 刚抽到的那张遗物怎么结算。
 *
 * 遗物**不打牌**：拿到的瞬间就结算，然后
 *  - 角标 ∞ 的（剛毅之盾 / 守護之石）→ **摊在面前一直留着**，随时生效
 *  - 一次性的（鑰匙 / 鏡之門戶 / 洞察之球）→ 用掉 / 结完就进**普通弃牌堆**
 *
 * 具体规则都在 `relic.ts`，这里只管"发到他面前"这一步。
 */
export function resolveRelicCard(state: GameState, p: PlayerState, cardId: string): void {
  const kind = relicKindOf(cardId);
  if (!kind) {
    /** 认不出来的遗物：进弃牌堆，免得它永远卡在手里 */
    discardRelic(state, cardId);
    log(state, `遗物「${state.cardById[cardId]?.name ?? cardId}」没有实现，已放入弃牌堆。`, 'all', true);
    return;
  }
  /**
   * **鑰匙是唯一的例外：它不进背包。**
   *
   * 规则（用户明确）：遗物鑰匙的表现要**和普通鑰匙一模一样** ——
   * 普通钥匙走 `gainItem key` 只调 `addKeys`（上钥匙立牌），
   * **不进 `p.items`、不占背包格**。所以遗物鑰匙也照这个来，
   * 卡本身当作"立牌上的那把钥匙"，不上背包。
   */
  if (kind === 'key') {
    applyRelicKey(state, p);
  } else {
    giveRelic(state, p, cardId);
  }
  /**
   * **该响的要响**：和**发现阶段 / 手提箱**完全同一套判断 ——
   * `makesNoise || isKeyCard(card)`，在**抽到的地方**（遗物室 R6）发出响声。
   *
   * ⚠ 这里**不套用安娜「小心谨慎」**：那条技能原文是"凡是她自己发动的**搜索**"，
   * 而抽遗物、翻发现牌、开手提箱都**不算搜索** —— 所以照响。
   */
  const card = state.cardById[cardId];
  const noisy = Boolean(card?.makesNoise) || (card ? isKeyCard(card) : false);
  if (noisy && p.roomId) {
    /**
     * ⚠ **只有 `pushNoise` 这一条战报**（它自己写"响声出现在「X」。"，只给幸存者），
     * 不再额外写「遗物「鑰匙」带有响声…」—— 那条会把"这一响来自遗物牌堆"
     * 暴露给杀手（用户口径：遗物钥匙要和**普通钥匙走一样的战报**）。
     * 杀手那边照旧在**响声阶段**统一看到"发出响声的位置：R6遗物室"，
     * 和任何一次搜索引起的响声没有区别。
     */
    pushNoise(state, p.roomId);
  }
}


