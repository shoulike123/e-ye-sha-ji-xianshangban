/**
 * 女猎手（killer4）与狼人（killer5）的专用牌面结算。
 *
 * 通用约定：**杀手卡牌执行的效果双方战报一致**（除了潜行目的地），
 * 所以这里写日志时基本都用 vis='all'（默认），只有「谁是潜行目标」这类才藏。
 */
import type { GameState, PlayerState } from './types.js';
import {
  allShortestPaths,
  applyDamage,
  canonicalDoorId,
  doorId,
  generalAdjacentRooms,
  isDoorBlocked,
  isDoorEdge,
  isRoomGone,
  log,
  mapDist,
  parseDoor,
  placeBlockade,
  roomName,
  setKillerInfo,
  setStealth,
  tryMove,
  unblockedDoorsAt,
} from './effects.js';
import { killerKindOf } from './evolution.js';

/**
 * 这个杀手是不是女王。
 * 直接看 `killerKindOf`（不依赖 zombies.ts，避免模块循环）。
 */
function isQueenKiller(state: GameState): boolean {
  return killerKindOf(state) === 'queen';
}

/** 桌上那名杀手棋子 */
function killerActor(state: GameState): PlayerState | null {
  return state.killerId ? state.players[state.killerId] ?? null : null;
}

// ————————————————————————————————————————————————
// 女猎手
// ————————————————————————————————————————————————

/**
 * 猎手本能〔感知〕任意一个地点：杀手点地图选一个地点，然后在**行动区确认**。
 * 确认后才报「那里有没有幸存者」。
 */
export function beginSenseRoom(state: GameState): boolean {
  state.pendingSenseRoom = null;
  state.killerSenseRoomActive = true;
  log(state, '猎手本能：请点地图任选一个地点，然后在行动区确认。', 'all');
  return true;
}

/**
 * 行动区确认：结算这次感知。
 * **返回被感知到的幸存者**（供女王等级 2 的〔惊吓〕用，由调用方处理）。
 */
/**
 * 行动区确认：结算这次感知。
 * **返回被感知到的幸存者，以及被感知的地点** ——
 * 君臨天下要用地点把这些目击者「记」到杀手地图上（`witnessedAt`）。
 */
export function confirmSenseRoom(state: GameState): { roomId: string; witnessed: PlayerState[] } {
  const roomId = state.pendingSenseRoom;
  if (!roomId) throw new Error('还没有选择要感知的地点');
  state.pendingSenseRoom = null;
  state.killerSenseRoomActive = false;
  const here = Object.values(state.players).filter(
    (s) => s.faction === 'survivor' && s.alive && s.roomId === roomId,
  );
  /**
   * **战报和行动区同一套说法**（用户要求）：
   * 先写这次感知的**地点**（"感知一个地点"类的地点由杀手自己选，所以照写），
   * 再写感知到的**人**。
   */
  const placeLine = `地点：${roomName(state, roomId)}`;
  const whoLine = here.length
    ? `看到 ${here.length} 名幸存者：${here.map((s) => s.name).join('、')}`
    : '没有看到人。';
  log(state, `${placeLine}；${whoLine}`);
  /** **每一次〔感知〕都要有一次信息确认**（用户要求：「所有的感知都要信息确认」） */
  setKillerInfo(state, '感知（猎手本能 / 君臨天下）', [placeLine, whoLine]);
  return { roomId, witnessed: here };
}

/**
 * 追蹤：〔搜索〕 + 展示一名幸存者与你之间的距离（**双方都能看到**）。
 * 距离用「门/小径」算 —— 杀手密道在这里**不算相邻**。
 */
export function beginTrackerDistance(state: GameState): boolean {
  const k = killerActor(state);
  if (!k?.roomId) {
    log(state, '追蹤：你不在图上，无法展示距离。');
    return false;
  }
  state.pendingTrackerPick = true;
  log(state, '追蹤：请选择一名幸存者来展示距离。', 'all');
  return true;
}

/** 选定幸存者后展示距离 */
export function resolveTrackerDistance(state: GameState, targetId: string): void {
  const k = killerActor(state);
  state.pendingTrackerPick = false;
  const t = state.players[targetId];
  if (!k?.roomId || !t?.roomId) {
    log(state, '追蹤：目标不在地图上，距离无法展示。');
    setKillerInfo(state, '追蹤', ['目标不在地图上，距离无法展示。']);
    return;
  }
  // 密道不算相邻（与「惊吓」同一套距离）
  const d = mapDist(state, k.roomId, t.roomId, false);
  const line = Number.isFinite(d)
    ? `${t.name} 距离你 ${d} 步。`
    : `${t.name} 与你之间没有相连的路径。`;
  log(state, `追蹤：${line}`);
  /** 行动区把结果摆出来，等杀手确认 */
  setKillerInfo(state, `追蹤：${t.name}`, [line]);
}

/**
 * 陷阱重置：〔潛行〕到任意地点 + **重置任意个地点上的所有陷阱**。
 *
 * 「重置」= 先移除双方场上**所有**剩下的陷阱，再重新放置
 * （2 捕网 + 1 白骨 + 1 捕熊，由杀手选位置）。
 *
 * ⚠ 与**开局布置**的区别：重置后**位置任选**（不受"常规搜索位/修理位"限制）。
 * ⚠ **不要清 `state.netLocks`** —— 被捕网者「本回合不能离开」的效果
 *    要留到本回合结束；重置只是把陷阱收回重新布。
 */
export function resetHunterTraps(state: GameState): void {
  const before = Object.keys(state.hunterTraps ?? {}).length;
  state.hunterTraps = {};
  state.pendingTrapPlacement = {
    kind: null,
    placed: {},
    done: false,
    restricted: false,
  };
  log(
    state,
    (before > 0
      ? `陷阱重置：移除场上所有 ${before} 个陷阱，重新开始放置`
      : '陷阱重置：场上没有陷阱，直接重新放置') +
      '（2 捕网 + 1 白骨 + 1 捕熊，共 4 个位置**由你任选**）。',
  );
}

// ————————————————————————————————————————————————
// 狼人
// ————————————————————————————————————————————————


/**
 * 领地意识〔感知〕**所有可搜索的位置**（地图上带 `searchable` 标签的那 3 个地点）。
 *
 * 注意：不是「带响声的地点」——
 * 角色技能造成的可搜索（如凯莱布「神秘狂热粉」在螺旋地点搜索）**不算**，
 * 只看地图本身标注的搜索位置。豪宅 = R2 陈列室 / B4 储藏室 / G4 温室；
 * 小屋 = R3 娱乐室 / G4 小屋 / B2 湖景小屋。
 */
export function senseAllNoise(state: GameState): void {
  const searchRooms = state.map.rooms
    .filter((r) => (r.tags ?? []).includes('searchable'))
    .map((r) => r.id);
  if (!searchRooms.length) {
    log(state, '领地意识：这张地图没有可搜索的位置。');
    return;
  }
  /**
   * 〔感知〕**所有可搜索的位置**。
   *
   * ⚠ 规则要求：**所有地点一起说** ——
   * 只能知道"这些地点上有没有人 / 一共是哪些人"，
   * **不能知道具体谁在哪个地点**（否则等于一次看清所有人的位置，
   * 比"感知一个地点"强太多）。
   *
   * 所以这里把名单**合并成一条**：不按地点分组、不点名到房间。
   */
  const found: string[] = [];
  for (const id of searchRooms) {
    for (const s of Object.values(state.players)) {
      if (s.faction !== 'survivor' || !s.alive || s.roomId !== id) continue;
      if (!found.includes(s.name)) found.push(s.name);
    }
  }
  const placeLine = `地点：${searchRooms.map((id) => roomName(state, id)).join('、')}`;
  const whoLine = found.length
    ? `看到 ${found.length} 名幸存者：${found.join('、')}`
    : '这些地点上都没有人。';
  log(state, `领地意识 —— ${placeLine}；${whoLine}`, 'killer');
  /** 行动区把结果摆出来（**不把人对应到地点**，规则要求只说"一共有谁"） */
  setKillerInfo(state, '领地意识：可搜索的位置', [placeLine, whoLine]);
}


/**
 * 超听觉：移动到**最近的带有响声标记的地点**（最多 6 步），然后〔搜索〕。
 *
 * 规则细节：
 *  - 爆竹回合：判断上「全场都有响声」—— 那么**杀手自己所在位置**就是最近（0 步），
 *    原地搜索，文案写「最近的响声在（杀手所在位置）」。
 *  - **自动前往**最近位置；只有**多个并列最近**（或多个最快路径）时才让杀手自己选。
 *  - 最近位置超过 6 步 → 沿最快路径走 6 步，之后搜索落点。
 *  - 寻路**考虑杀手密道**（这是杀手的移动）。
 */
export function moveNearestNoiseSearch(state: GameState): boolean {
  const k = killerActor(state);
  if (!k?.roomId) {
    log(state, '超听觉：你不在图上。');
    return false;
  }

  /** 待选的移动方案（每个 = 一条路径） */
  const options: Array<{ path: string[]; label: string }> = [];

  if (state.firecrackerThisRound) {
    // 全场都有响声 → 自己这格就是「最近的响声」
    log(state, `超听觉：最近的响声在「${roomName(state, k.roomId)}」，到达并搜索。`);
    state.pendingMoveChoices = null;
    searchHere(state, k.roomId);
    return false;
  }

  const noises = (state.noises ?? []).filter((id) => id !== k.roomId);
  if (!noises.length) {
    log(state, `超听觉：场上没有响声标记「${roomName(state, k.roomId)}」。`);
    state.pendingMoveChoices = null;
    searchHere(state, k.roomId);
    return false;
  }

  // ① 找最近的响声距离
  const here = k.roomId;
  let bestD = Infinity;
  for (const id of noises) {
    const d = mapDist(state, here, id, true);
    if (d < bestD) bestD = d;
  }
  if (!Number.isFinite(bestD)) {
    log(state, '超听觉：没有可到达的响声地点。');
    return false;
  }
  const nearest = noises.filter((id) => mapDist(state, here, id, true) === bestD);

  // ② 枚举每个并列最近地点的最快路径
  const MAX_STEPS = 6;
  const truncated = bestD > MAX_STEPS;
  for (const dest of nearest) {
    const paths = allShortestPaths(state, here, dest, true, 8);
    for (const full of paths) {
      // 超过 6 步就只走前 6 步
      const path = truncated ? full.slice(0, MAX_STEPS + 1) : full;
      const endRoom = path[path.length - 1]!;
      options.push({
        path,
        label: truncated
          ? `走 6 步到「${roomName(state, endRoom)}」（朝「${roomName(state, dest)}」方向）`
          : `前往「${roomName(state, dest)}」（${bestD} 步）`,
      });
    }
  }

  if (!options.length) {
    log(state, '超听觉：没有可走的路径。');
    return false;
  }

  // ③ 只有一种走法 → 自动走
  if (options.length === 1) {
    state.pendingMoveChoices = null;
    applyAutoMove(state, k, options[0]!.path);
    return false;
  }

  // ④ 多条并列 → 停下来让杀手在行动区选
  state.pendingMoveChoices = options.map((o) => ({ path: o.path, label: o.label }));
  log(
    state,
    `超听觉：有 ${options.length} 条最快路径，请在行动区选择一条。`,
  );
  return true;
}

/**
 * 执行自动移动：逐格走过去，然后搜索落点所在地点。
 */
export function applyAutoMove(state: GameState, k: PlayerState, path: string[]): void {
  let crossed = false;
  for (let i = 1; i < path.length; i++) {
    const ok = tryMove(state, k.id, path[i]!, 1, 1);
    if (!ok) break;
    crossed = crossed || state.lastMoveCrossedBlockade;
  }
  state.lastMovePath = [...path];
  state.lastMoveCrossedBlockade = crossed;
  state.pendingPathDraft = null;
  const endRoom = path[path.length - 1] ?? k.roomId;
  if (endRoom) searchHere(state, endRoom);
}

/**
 * 结算一张「进化卡牌」的被动 / 效果。未命名在等级 2 / 4 各获得 1 张。
 *
 * ⚠ **这里才是进化卡牌真正生效的地方** —— 进化卡牌**不走** `runEffects`，
 * 所以 `killerCards.ts` 里那几个同名 op 的 `case` 是死代码（已删）。
 * 加新进化卡牌时，除了 JSON，**必须**在这里加一个 `case`。
 *
 *  - 保護色  ：「恐詭管道」改成潛行到任何地点（`stealthToPassage` 里读）；
 *              重现时下一次攻击 +3（`forcedRevealAndSearch` 里按
 *              `chosenEvolutionCards` 判断）；移动通过秘密通道时本回合 +3
 *              （`tryMove` 里读 `passagePowerBonus`）
 *  - 爬蟲爬行 ：把牌库里所有「爬行」的移動从 ×1 改成 ×1-3
 *  - 音波感知 ：回合开始时按响声情况强制幸存者揭示地点
 *  - 粘液腺體 ：回合结束时（**摸牌之前**）若不在潜行则封堵×1；
 *              用「變形」后抽1张并封堵×2
 */
export function applyEvolutionCard(state: GameState, cardId: string): void {
  switch (cardId) {
    case 'evo_un_camouflage':
      state.passageStealthAnywhere = true;
      state.passagePowerBonus = 3;
      log(state, '保護色：「恐詭管道」可以潛行到任何地点；重现时下一次攻击 +3；移动通过秘密通道时本回合 +3 力量。', 'killer');
      break;
    case 'evo_un_crawl':
      /**
       * 改牌库里所有「爬行」的移动范围。
       *
       * ⚠ 真正生效靠的就是**改卡牌数据本身**（`state.cardById` 里的对象是共享的，
       * 所以该卡的所有副本一起变），不靠额外的开关字段
       * （以前还顺手记了 `crawlMoveMin/Max`，但全项目没人读，已删）。
       */
      for (const id of [...state.killerDeck, ...state.killerHand, ...state.killerDiscard, ...state.killerLocked]) {
        const c = state.cardById[id];
        if (c?.owner !== 'killer7' || c.name !== '爬行') continue;
        for (const fx of c.effects) {
          if (fx.op === 'move') {
            fx.value = 3;
            fx.min = 1;
          }
        }
      }
      log(state, '爬蟲爬行：「爬行」的效果变为〔移動〕×1-3。', 'killer');
      break;
    case 'evo_un_sonar':
      state.sonarRevealActive = true;
      log(state, '音波感知：你的回合开始时，按响声情况强制幸存者揭示地点。', 'killer');
      break;
    case 'evo_un_slime':
      state.slimeGlandActive = true;
      log(state, '粘液腺體：回合结束时若不在潜行，在你的地点封堵×1。', 'killer');
      break;
    default:
      break;
  }
}

/**
 * 音波感知（回合开始时触发）：
 *  - 场上**没有**响声标记 → 距离 1 内的所有幸存者必须揭示地点
 *  - 场上**有**响声标记 → 所有位于带响声地点的幸存者必须揭示地点
 */
export function applySonarReveal(state: GameState): void {
  if (!state.sonarRevealActive) return;
  const k = killerActor(state);
  if (!k?.roomId) return;
  const noises = state.noises ?? [];
  const targets: PlayerState[] = [];
  if (!noises.length) {
    for (const p of Object.values(state.players)) {
      if (p.faction !== 'survivor' || !p.alive || !p.roomId) continue;
      const d = mapDist(state, k.roomId, p.roomId, false);
      if (d >= 0 && d <= 1) targets.push(p);
    }
    log(state, '音波感知（无响声）：距离 1 内的幸存者必须揭示地点。', 'killer');
  } else {
    const set = new Set(noises);
    for (const p of Object.values(state.players)) {
      if (p.faction !== 'survivor' || !p.alive || !p.roomId) continue;
      if (set.has(p.roomId)) targets.push(p);
    }
    log(state, '音波感知（有响声）：位于带响声地点的幸存者必须揭示地点。', 'killer');
  }
  if (!targets.length) {
    log(state, '音波感知：没有符合条件的幸存者。', 'killer');
    return;
  }
  /** 揭示 = 双方战报写明谁在哪里 */
  for (const t of targets) {
    log(
      state,
      `音波感知：${t.name} 位于「${roomName(state, t.roomId!)}」。`,
      'all',
      true,
    );
  }
}

/**
 * 粘液腺體（进化卡牌）：「你的回合结束时，如果你不在〔潜行〕，
 * 在你的地点〔封堵〕×1」。
 *
 * ⚠ **位置在回合结束后**（`engine.closeKillerTurn`，和女王 1 级、狼人 4 级同一处）。
 * ⚠ **封哪扇门由杀手自己点**（用户要求：「杀手该回合结束处理的让杀手处理完，
 *   处理完才给到幸存者」）—— 这里挂起"请点一扇门"的请求，
 *   调用方（`closeKillerTurn`）会**停在这一步、先不切给幸存者**，
 *   点完由 `case 'move'` 接着走 `finishKillerTurn`。
 *
 * @returns true = 已挂起，调用方要停下等玩家点门
 */
export function beginSlimeGlandPick(state: GameState): boolean {
  if (!state.slimeGlandActive) return false;
  const k = killerActor(state);
  /** 判断条件就一条：**不在〔潜行〕**（牌面原文），另外要在地图上 */
  if (!k?.roomId || k.stealth) return false;
  /** 这次只要封 1 扇 */
  state.pendingBlockadeRemaining = 1;
  const started = requestBlockadeAt(state, k.roomId, '粘液腺體');
  /** 没挂起来（没开封堵 / 那个地点没有可封的门）就把计数清干净，别留给下一次 */
  if (!started) state.pendingBlockadeRemaining = 0;
  return started;
}

/**
 * 保護色：移动通过秘密通道时，**直到回合结束** +N 力量。
 * 类型与清除时机同「疯狂」「谋杀者 2 级」。
 */

/** 杀手在行动区选了一条最快路径 */
export function chooseAutoMovePath(state: GameState, index: number): void {
  const k = killerActor(state);
  const choices = state.pendingMoveChoices;
  if (!k || !choices?.length) throw new Error('当前没有待选的移动路径');
  const picked = choices[index];
  if (!picked) throw new Error('没有这个选项');
  state.pendingMoveChoices = null;
  log(state, `超听觉：已选择「${picked.label}」。`);
  applyAutoMove(state, k, picked.path);
}

// ————————————————————————————————————————————————
// 扼杀者（killer8）：核心标记
// （实现已搬到 coreMarkers.ts 以打断循环依赖，下面一段是 re-export）
// ———————————————————————————————————————————————

/**
 * 扼杀者的核心标记逻辑搬到了 `coreMarkers.ts`（**打断与 evolution.ts 的循环依赖**：
 * killerSpecials 用 evolution 的 `killerKindOf`，而 evolution 的扼杀者进化要用 `placeCoreAt`）。
 * 这里 re-export，其他文件不用改 import 路径。
 */
export {
  coreCount,
  coreRooms,
  isStranglerKiller,
  placeCoreAt,
  setupCoreMarkers,
} from './coreMarkers.js';
/** 本文件自己也要用（re-export 不会引入本地作用域） */
import { coreRooms, isStranglerKiller, placeCoreAt } from './coreMarkers.js';

/**
 * 达到上限时玩家选好了要移除的核心标记：移除它，再放新的。
 *
 * 若 `pendingCoreOverflowPlaceAtAfter` 有值（**扼杀者 4 级一次放两个**踩到上限），
 * 说明这次升级总共要放 2 个 —— 那就**再移除一个**，然后一次性把两个都放上。
 */
export function resolveCoreOverflow(state: GameState, removeRoomId: string): void {
  const placeAt = state.pendingCoreOverflowPlaceAt;
  const allowed = state.pendingCoreRooms ?? [];
  state.pendingCorePick = null;
  state.pendingCoreRooms = [];
  state.pendingCoreOverflowPlaceAt = null;
  if (!placeAt) throw new Error('当前没有待放的核心标记');
  if (!allowed.includes(removeRoomId)) throw new Error('那个地点没有核心标记');
  if (!removeCoreAt(state, removeRoomId)) throw new Error('移除失败');
  state.coreMarkers.push(placeAt);
  log(
    state,
    `移除「${roomName(state, removeRoomId)}」的核心标记，改放到「${roomName(state, placeAt)}」（现有 ${state.coreMarkers.length} 个）。`,
    'all',
    true,
  );
}

/** 移除某地点的 1 个核心标记 */
export function removeCoreAt(state: GameState, roomId: string): boolean {
  const i = (state.coreMarkers ?? []).indexOf(roomId);
  if (i < 0) return false;
  state.coreMarkers.splice(i, 1);
  log(state, `移除了「${roomName(state, roomId)}」的一个核心标记（现有 ${state.coreMarkers.length} 个）。`, 'all', true);
  return true;
}

/** 把某地点的一个核心标记移到相邻地点 */
export function moveCore(state: GameState, fromRoomId: string, toRoomId: string): void {
  if (!removeCoreAt(state, fromRoomId)) throw new Error('那个地点没有核心标记');
  state.coreMarkers.push(toRoomId);
  log(
    state,
    `把一个核心标记从「${roomName(state, fromRoomId)}」移到「${roomName(state, toRoomId)}」。`,
    'all',
    true,
  );
}

/**
 * **请求在某地点封堵 1 扇门** —— 封哪扇门**由玩家点**（规则要求）。
 * 只有「该地点一扇能封的门都没有」才自动跳过。
 *
 * 返回 true = 停下来等玩家点门；false = 没有可封的门，已跳过。
 */
export function requestBlockadeAt(state: GameState, roomId: string, label: string): boolean {
  if (!state.rules.enableBlockades) {
    log(state, `${label}：本次对局没有封堵，跳过。`, 'killer');
    return false;
  }
  if (!state.map.rooms.some((r) => r.id === roomId)) {
    log(state, `${label}：地点不存在，跳过。`, 'killer');
    return false;
  }
  if (unblockedDoorsAt(state, roomId).length === 0) {
    log(state, `${label}：「${roomName(state, roomId)}」没有可封的门，跳过封堵。`, 'killer');
    return false;
  }
  state.pendingBlockade = true;
  state.pendingBlockadeRoom = roomId;
  log(state, `${label}：请点一扇与「${roomName(state, roomId)}」相连的门来封堵。`, 'killer');
  return true;
}

/**
 * 扼杀者「茂盛」：**在你的地点**〔封堵〕×1 —— 由玩家点门。
 */
export function beginBlockadeHere(state: GameState, n = 1): boolean {
  const k = killerActor(state);
  if (!k?.roomId)
    return false;
  /**
   * 逐扇请求：玩家每点一扇门就少一扇，所以把「还差几扇」记在
   * `pendingBlockadeRemaining`，由 `afterOneDoorPlaced` 递减并再次请求。
   */
  state.pendingBlockadeRemaining = Math.max(1, n);
  return requestBlockadeAt(state, k.roomId, '茂盛');
}

/**
 * 點门落子后：如果这次效果还要再封几扇，就继续请求；否则收尾。
 * 返回 true = 还在等玩家点门。
 */
export function continueBlockadeRequest(state: GameState): boolean {
  const left = state.pendingBlockadeRemaining ?? 0;
  if (left <= 0)
    return false;
  const k = killerActor(state);
  if (!k?.roomId)
    return false;
  return requestBlockadeAt(state, state.pendingBlockadeRoom ?? k.roomId, '茂盛');
}

/** 茂盛 / 等级效果：等杀手点一个地点放核心标记 */
export function beginPlaceCore(state: GameState): boolean {
  state.pendingCorePick = 'place';
  log(state, '请点一个地点放置核心标记。', 'killer');
  return true;
}

/** 幸存者的特殊行动：移除自己地点的 1 个核心标记 */
export function beginRemoveCore(state: GameState): boolean {
  const rooms = coreRooms(state);
  if (!rooms.length) {
    log(state, '场上没有核心标记可移除。');
    return false;
  }
  state.pendingCorePick = 'remove';
  log(state, `请点一个带核心标记的地点来移除它：${rooms.map((id) => roomName(state, id)).join('、')}。`, 'killer');
  return true;
}

/** 枝條生長：先让杀手点一个「带核心标记」的地点，再点那扇要封的门 */
export function beginBlockadeAtCore(state: GameState): boolean {
  const rooms = coreRooms(state).filter((r) => unblockedDoorsAt(state, r).length > 0);
  if (!rooms.length) {
    log(state, '枝條生長：没有「带核心标记且还有可封门」的地点，跳过封堵。', 'killer');
    return false;
  }
  state.pendingCorePick = 'placeBlockade';
  state.pendingCoreRooms = rooms;
  log(state, `枝條生長：请点一个带核心标记的地点：${rooms.map((id) => roomName(state, id)).join('、')}。`, 'killer');
  return true;
}

/** 傳送聚合：等杀手点一个带核心标记或封堵标记的地点 */
export function beginTeleportToCore(state: GameState): boolean {
  const rooms = new Set<string>(coreRooms(state));
  for (const d of state.blockades ?? []) {
    const pair = parseDoor(d);
    if (pair) {
      rooms.add(pair[0]);
      rooms.add(pair[1]);
    }
  }
  if (!rooms.size) {
    log(state, '场上没有带核心标记或封堵标记的地点，无法传送。');
    return false;
  }
  state.pendingTeleportPick = [...rooms];
  log(state, `傳送聚合：请点一个带核心标记或封堵标记的地点：${state.pendingTeleportPick.map((id) => roomName(state, id)).join('、')}。`, 'killer');
  return true;
}

/** 傳送聚合 的另一用法：移动任意一个核心标记到相邻地点 */
export function beginMoveCore(state: GameState): boolean {
  const rooms = coreRooms(state);
  if (!rooms.length) {
    log(state, '场上没有核心标记，无法移动。');
    return false;
  }
  state.pendingCorePick = 'moveFrom';
  log(state, `请点一个要移走核心标记的地点：${rooms.map((id) => roomName(state, id)).join('、')}。`, 'killer');
  return true;
}

/** 落点：移动核心标记 */
export function resolveMoveCore(state: GameState, roomId: string): void {
  if (state.pendingCorePick === 'moveFrom') {
    if (!coreRooms(state).includes(roomId)) throw new Error('那个地点没有核心标记');
    state.pendingCoreFrom = roomId;
    state.pendingCorePick = 'moveTo';
    state.pendingCoreNeighbors = generalAdjacentRooms(state.map, roomId);
    log(state, `已选「${roomName(state, roomId)}」，请点一个相邻地点放下核心标记。`, 'killer');
    return;
  }
  if (state.pendingCorePick === 'moveTo') {
    const from = state.pendingCoreFrom;
    const allowed = state.pendingCoreNeighbors ?? [];
    if (!from || !allowed.includes(roomId)) throw new Error('只能移到相邻地点');
    moveCore(state, from, roomId);
    state.pendingCorePick = null;
    state.pendingCoreFrom = null;
    state.pendingCoreNeighbors = [];
    return;
  }
  throw new Error('当前不是移动核心标记');
}

/**
 * 狂亂枝條：伤害**所在地点带核心标记或秘密通道**的所有幸存者，各 1 点。
 */
export function damageCoreOrPassageRooms(state: GameState): void {
  const k = killerActor(state);
  if (!k) return;
  const core = new Set(coreRooms(state));
  const passage = new Set<string>();
  for (const e of state.map.passages ?? []) {
    passage.add(e.from);
    if (e.bidirectional ?? true) passage.add(e.to);
  }
  const victims = Object.values(state.players).filter(
    (s) => s.faction === 'survivor' && s.alive && s.roomId && (core.has(s.roomId) || passage.has(s.roomId)),
  );
  for (const s of victims) applyDamage(state, s.id, 1, k.id);
  log(
    state,
    victims.length
      ? `狂亂枝條：${victims.map((s) => s.name).join('、')} 各受 1 点伤害（所在地点带核心标记或秘密通道）。`
      : '狂亂枝條：没有幸存者位于带核心标记或秘密通道的地点。',
  );
}

// ————————————————————————————————————————————————
// 未命名（killer7）
// ————————————————————————————————————————————————

/**
 * 永久从弃牌堆中移除 N 张卡牌（變形 / 戰鬥適應）。
 * 被移除的牌**不会再洗回杀手牌堆**。
 *
 * `excludeCardId`：**不能被移除**的那张牌 —— 打出這張牌本身时传它自己，
 * 因为「不能选择此牌本身」。规则上这张牌是**效果执行完之后**才进弃牌堆的。
 *
 * 注意：调用时机是「支付的费用牌已经进弃牌堆之后」，
 * 所以本次弃置的费用牌**可以被移除**。
 */
/**
 * **永久从弃牌堆移除 N 张牌 —— 由玩家自己挑。**
 *
 * ⚠ 以前这里是**自动从弃牌堆顶往下拿**（`splice`），玩家没得选。
 * 用户明确要求："【變形】【戰鬥適應】没有自己选择删掉的牌"。
 * 所以现在挂起 `pendingDiscardRemove`，等玩家点牌。
 *
 * @param cardName 哪张牌发起的（战报用）
 * @param excludeCardIds 不能选的牌（刚打出的那张本身）
 * @returns 是否停下来等玩家选（true = 有待选）
 */
export function beginRemoveFromDiscardPermanent(
  state: GameState,
  n: number,
  cardName: string,
  excludeCardIds: string[] = [],
): boolean {
  /** 弃牌堆里除了被排除的，还有没有牌可选 */
  const options = state.killerDiscard.filter((id) => !excludeCardIds.includes(id));
  if (!options.length) {
    log(state, `${cardName}：弃牌堆里没有可移除的卡牌。`, 'killer');
    return false;
  }
  const want = Math.min(n, options.length);
  state.pendingDiscardRemove = {
    remaining: want,
    excludeCardIds: [...excludeCardIds],
    options: [...options],
    optionsNamed: options.map((id) => ({ id, name: state.cardById[id]?.name ?? id })),
    cardName,
  };
  log(
    state,
    `${cardName}：请从弃牌堆里选 ${want} 张永久移除（点牌选择）。`,
    'killer',
  );
  return true;
}

/**
 * 旧的"自动移除"实现：保留给**不需要玩家选**的场合（目前没有调用方，
 * 但 AI/测试/以后加牌可能用得上）。新牌请走 `beginRemoveFromDiscardPermanent`。
 */
export function removeFromDiscardPermanent(
  state: GameState,
  n: number,
  excludeCardId?: string,
): void {
  const removed: string[] = [];
  for (let i = 0; i < n; i++) {
    /** 从堆顶往下找第一张不是「被排除的那张」的牌 */
    let idx = -1;
    for (let j = state.killerDiscard.length - 1; j >= 0; j--) {
      if (excludeCardId && state.killerDiscard[j] === excludeCardId)
        continue;
      idx = j;
      break;
    }
    if (idx < 0)
      break;
    const [id] = state.killerDiscard.splice(idx, 1);
    removed.push(id!);
    // 记进永久移除表，避免以后又洗回来
    if (!state.killerRemovedPermanently) state.killerRemovedPermanently = [];
    state.killerRemovedPermanently.push(id!);
  }
  const names = removed.map((id) => state.cardById[id]?.name ?? id);
  log(
    state,
    names.length
      ? `永久从弃牌堆移除 ${names.length} 张卡牌：${names.join('、')}。`
      : '弃牌堆里没有可移除的卡牌。',
  );
}

/** 永久 +N 力量 */
export function addPermanentPower(state: GameState, n: number): void {
  const cap = state.rules.killerPowerMax ?? 10;
  const before = state.killerPower;
  state.killerPower = Math.min(cap, Math.max(0, state.killerPower + n));
  state.killerLevelPowerGain = (state.killerLevelPowerGain ?? 0) + n;
  log(state, `永久力量 +${n}（${before} → ${state.killerPower}）。`);
}


/** 〔感知〕距离 N 内的所有地点（红外探測） */
export function senseRange(state: GameState, range: number): void {
  const k = killerActor(state);
  if (!k?.roomId) {
    log(state, '红外探測：你不在图上。');
    return;
  }
  const rooms = [...state.map.rooms]
    .filter((r) => {
      const d = mapDist(state, k.roomId!, r.id, false);
      return d >= 0 && d <= range;
    })
    .map((r) => r.id);
  /**
   * **战报和行动区同一套说法**（用户要求）：先列**这次覆盖的所有地点**，
   * 再列**感知到的所有人** —— 但不把人对应到地点上。
   */
  const names: string[] = [];
  for (const id of rooms) {
    for (const s of survivorsHere(state, id)) {
      if (!names.includes(s.name)) names.push(s.name);
    }
  }
  const placeLine = `地点：${rooms.map((id) => roomName(state, id)).join('、')}`;
  const whoLine = names.length
    ? `看到 ${names.length} 名幸存者：${names.join('、')}`
    : `距离 ${range} 内没有看到人。`;
  log(state, `红外探測 —— ${placeLine}；${whoLine}`);
  /** 行动区把结果摆出来，等杀手确认 */
  setKillerInfo(state, `红外探測（距离 ${range} 内）`, [placeLine, whoLine]);
}

/** 潜行到任意一个带有秘密通道的地点（恐詭管道） */
export function stealthToPassage(state: GameState): boolean {
  const k = killerActor(state);
  if (!k?.roomId) return false;
  setStealth(k, true);
  /**
   * **保護色（进化卡牌）**：「恐詭管道」效果變為「〔潛行〕到**任何地點**」。
   *
   * ⚠ 这一段以前**没有**（`passageStealthAnywhere` 只被赋值、全项目没人读），
   * 所以拿了保護色也还是只能挑秘密通道口。现在落点列表直接换成整张地图。
   */
  if (state.passageStealthAnywhere) {
    const all = state.map.rooms.filter((r) => !isRoomGone(state, r.id)).map((r) => r.id);
    if (!all.length) {
      log(state, '保護色：这张地图没有可去的地点，改为〔潛行〕×0-1。');
      return beginStealthAnywhere(state, 1);
    }
    state.pendingPassagePick = all;
    log(
      state,
      `保護色：「恐詭管道」可以潛行到**任何地点**，请点一个地点：${all.map((id) => roomName(state, id)).join('、')}。`,
      'killer',
    );
    return true;
  }
  const rooms = new Set<string>();
  for (const e of state.map.passages ?? []) {
    rooms.add(e.from);
    if (e.bidirectional ?? true) rooms.add(e.to);
  }
  if (!rooms.size) {
    log(state, '恐詭管道：这张地图没有秘密通道，改为〔潛行〕×0-1。');
    return beginStealthAnywhere(state, 1);
  }
  state.pendingPassagePick = [...rooms];
  log(
    state,
    `恐詭管道：请点一个有秘密通道的地点：${state.pendingPassagePick.map((id) => roomName(state, id)).join('、')}。`,
    'killer',
  );
  return true;
}

/** 落点：潜行到秘密通道地点 */
export function resolveStealthToPassage(state: GameState, roomId: string): void {
  const k = killerActor(state);
  const allowed = state.pendingPassagePick ?? [];
  /**
   * ⚠ 顺序要紧：**先校验、再清空**。
   * 以前是先 `pendingPassagePick = null` 再 `includes` 校验 ——
   * 玩家点错一个地点就会把待选状态清掉，之后点对的地点也报
   * "当前不是选择秘密通道地点"，等于这张牌废了。
   */
  if (!allowed.length) {
    state.pendingPassagePick = null;
    return;
  }
  if (!allowed.includes(roomId)) throw new Error('那个地点没有秘密通道');
  state.pendingPassagePick = null;
  if (!k) return;
  k.roomId = roomId;
  log(state, `恐詭管道：潜入「${roomName(state, roomId)}」。`, 'killer');
}

/**
 * 酸液喷吐：伤害你的地点和一个**自选的相邻地点**的所有幸存者，
 * 然后〔封堵〕这两个地点之间的门。
 *
 * 相邻地点由杀手自己选（不限颜色区域）。
 * 两个地点之间**不是门**（虚线通道 / 杀手通道等）时封堵不了，**跳过封堵**，其余效果照常结算。
 */
export function acidSpray(state: GameState, adjacentRoomId: string): void {
  const k = killerActor(state);
  if (!k?.roomId) {
    log(state, '酸液喷吐：你不在图上。');
    return;
  }
  if (!generalAdjacentRooms(state.map, k.roomId).includes(adjacentRoomId)) {
    throw new Error('必须选一个相邻地点');
  }
  const targets = [...survivorsHere(state, k.roomId), ...survivorsHere(state, adjacentRoomId)];
  for (const s of targets) applyDamage(state, s.id, 1, k.id);
  log(
    state,
    targets.length
      ? `酸液喷吐：「${roomName(state, k.roomId)}」和「${roomName(state, adjacentRoomId)}」的 ${targets.map((s) => s.name).join('、')} 各受 1 点伤害。`
      : `酸液喷吐：这两个地点没有幸存者。`,
  );
  /**
   * 封堵这两个地点之间的门。
   * 先确认这两点之间**确实有一条门**（`pathType` 为空或 `'door'`）；
   * 是虚线通道 / 杀手通道就没有门可封，跳过。
   */
  const edge = (state.map.edges ?? []).find(
    (e) =>
      (e.from === k.roomId && e.to === adjacentRoomId) ||
      (e.from === adjacentRoomId && e.to === k.roomId),
  );
  if (!edge || !isDoorEdge(edge.pathType)) {
    log(
      state,
      `酸液喷吐：「${roomName(state, k.roomId)}」–「${roomName(state, adjacentRoomId)}」之间没有门，跳过封堵。`,
    );
    return;
  }
  const door = doorId(k.roomId, adjacentRoomId);
  if (!isDoorBlocked(state, door)) {
    state.blockades.push(canonicalDoorId(door));
    log(state, `酸液喷吐：封堵「${roomName(state, k.roomId)}」–「${roomName(state, adjacentRoomId)}」之间的门。`);
  }
}

/** 搜索某格：有人就置 lastSearchFound（供遭遇流程用） */
function searchHere(state: GameState, roomId: string): void {
  if (!roomId) return;
  const found = survivorsHere(state, roomId).length > 0;
  state.lastSearchFound = found;
  log(
    state,
    found
      ? `超听觉：搜索「${roomName(state, roomId)}」，发现了人！`
      : `超听觉：搜索「${roomName(state, roomId)}」，没有人。`,
  );
}

function survivorsHere(state: GameState, roomId: string): PlayerState[] {
  return Object.values(state.players).filter(
    (s) => s.faction === 'survivor' && s.alive && s.roomId === roomId,
  );
}

/**
 * 屏息：**使用这张牌时启用，下回合结束时清除**。
 *
 * 也就是覆盖「打出它的这一回合」+「接下来的一个杀手回合」，到那个回合结束才失效。
 * 不能直接加进 `killerTurnPowerBonus` —— 那个字段在**下回合开始**就被清零，
 * 撑不到「下回合结束」。
 *
 * 用 `carryPowerTurns` 数还剩几个「回合结束」要撑过去：
 *  - 打出时立刻生效（本回合），并把剩余回合数设为 1（还要再撑过下个回合结束）
 *  - 每次杀手回合结束时：若本回合是「带上来的」，就让它失效；
 *    否则减 1，等下回合开始时重新挂上
 */
export function addPowerUntilNextTurn(state: GameState, n: number): void {
  state.turnLingeringPower = (state.turnLingeringPower ?? 0) + n;
  /** 存一份给下回合——本回合结束时会被 `turnLingeringPower` 的清零带走，靠这个续上 */
  state.carryPowerUntilNextTurn = (state.carryPowerUntilNextTurn ?? 0) + n;
  /** 本回合是「刚启用」，还不是「带上来的」 */
  state.carryPowerActive = false;
  log(state, `获得 +${n} 力量（到你的下回合结束时失效）。`);
}

/**
 * 杀手回合结束时调用。
 *  - 本回合**刚启用**的（`carryPowerTurns === 1`）→ 留着，下回合继续
 *  - 本回合是**带上来的**（`carryPowerActive`）→ 这就是「下回合结束」，清掉
 */
export function clearPowerUntilNextTurn(state: GameState): void {
  const n = state.turnLingeringPower ?? 0;
  if (n <= 0) return;
  if (state.carryPowerActive) {
    state.turnLingeringPower = 0;
    state.carryPowerActive = false;
    state.carryPowerUntilNextTurn = 0;
    log(state, `「到你的下回合结束」的 +${n} 力量已失效。`);
    return;
  }
  /** 本回合刚启用的：留着，下回合还要用 */
}

/** 杀手回合开始时：把上回合留存的「到下回合结束」力量挂到本回合 */
export function applyCarryPower(state: GameState): void {
  const n = state.carryPowerUntilNextTurn ?? 0;
  if (n <= 0) return;
  state.carryPowerUntilNextTurn = 0;
  state.turnLingeringPower = n;
  /** 标记本回合是「带上来的」那一回合 */
  state.carryPowerActive = true;
  log(state, `上回合的 +${n} 力量在本回合继续生效（到本回合结束时失效）。`);
}

/** 潜行 + 走到任意地点（陷阱重置 / 恐詭管道用） */
export function beginStealthAnywhere(state: GameState, max: number, min = 0): boolean {
  const k = killerActor(state);
  if (!k?.roomId) return false;
  setStealth(k, true);
  state.pendingPathDraft = { min, max, rooms: [k.roomId] };
  log(
    state,
    `请点相邻地点规划潜行路径（${min}–${max} 步），确认后移动（潜行目的地不告诉幸存者）。`,
    'killer',
  );
  return true;
}

