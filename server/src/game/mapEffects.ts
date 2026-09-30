/**
 * **地图特殊规则**（实验室 / 城堡 / 墓穴）。
 *
 * 集中放在这里，而不是散进 engine / effects ——
 * 好处是"某张地图有什么特殊规则"一眼能看全，加新地图也只动这一个文件。
 *
 * 目前实现：
 *  - 实验室 G3「急救室」：急救箱标记 → 特殊行动治疗同地点一人并清空其恐惧，然后标记消失
 *  - 实验室 R4「無菌室」：幸存者**因移动**进入时在该地点发出响声
 *  - 实验室 B1–B4：开局预置一个封堵
 *  - 城堡 R1「監視室」：机关大门（幸存者额外行动放置）
 *  - 城堡 B4「雕像長廊」：本局第一次有幸存者进入时惊吓他并发出响声
 */
import type { GameState, PlayerState } from './types.js';
import {
  addFear,
  applyHeal,
  doorId,
  isDoorBlocked,
  log,
  pushNoise,
  roomName,
} from './effects.js';
/** 中毒标记在 zombies.ts（只有〔治愈〕或死亡能移除它） */
import { clearPoisonOnHeal } from './zombies.js';

/* ------------------------------------------------------------ 地图识别 ---- */
/** 这几张图的特殊规则都认"地图 id"，不认房间名 —— 房间名以后可能改 */
export const MAP_LAB = 'laboratory';
export const MAP_CASTLE = 'castle';
/**
 * 墓穴的地图 id。**坍塌 / 遗物室那两条规则在 `collapse.ts`**，
 * 这里保留这个常量只是为了"地图 id 只有一处定义"。
 */
export const MAP_CRYPT = 'crypt';

const isMap = (state: GameState, id: string) => state.map.id === id;

/* ------------------------------------------------- 实验室：急救箱 / 响声 ---- */
/** 急救箱所在房间（实验室 G3 急救室） */
export const FIRST_AID_ROOM = 'G3';
/** 无菌室（实验室 R4）：因移动进入要发出响声 */
export const STERILE_ROOM = 'R4';
/** 预置封堵的那扇门（实验室 B1–B4） */
export const LAB_PRESET_BLOCKADE: [string, string] = ['B1', 'B4'];

/** 这条规则属于当前地图吗 */
export function hasFirstAidKit(state: GameState): boolean {
  return isMap(state, MAP_LAB);
}

/**
 * 急救箱标记在**地图上的哪个地点**。
 *
 * 用户要求急救箱「像手提箱一样放在地图上」—— 也就是说它的位置是
 * `map.tokens` 里的一个道具（`kind: 'firstAidKit'`），可以在「地图校准」里拖。
 * 这里和 `suitcaseRoomId` 完全一个思路：**以 token 为准**，
 * 地图数据没写才退回默认的 G3。
 */
export function firstAidKitRoomId(state: GameState): string {
  const tok = (state.map.tokens ?? []).find(
    (t) => t.kind === 'firstAidKit' || t.kind === '急救箱',
  );
  return tok?.roomId ?? FIRST_AID_ROOM;
}

/** 开局：实验室放急救箱标记 + 预置封堵 */
export function setupMapSpecials(state: GameState): void {
  state.firstAidKit = false;
  state.leverGateDoorId = null;
  state.leverGateOwnerId = null;
  state.pendingGatePay = null;
  state.castleHallFirstEnterDone = false;

  if (isMap(state, MAP_LAB)) {
    /** ① 急救箱标记 */
    state.firstAidKit = true;
    log(state, `「${roomName(state, FIRST_AID_ROOM)}」放着**急救箱**：在此地可用特殊行动治疗同地点一名幸存者并消除其恐惧（用后移除）。`, 'all', true);
    /**
     * ③ B1–B4 之间预置一个封堵。
     * 走 `state.blockades`（规则数据），地图上的封堵块会跟着门号自动出现，
     * 不需要往 tokens 里塞东西。
     */
    const [a, b] = LAB_PRESET_BLOCKADE;
    const id = doorId(a, b);
    if (!state.blockades.includes(id)) {
      state.blockades.push(id);
      log(state, `开局：实验室「${roomName(state, a)}」与「${roomName(state, b)}」之间的门已被封堵。`, 'all', true);
    }
  }
}

/** 幸存者能不能在当前位置用急救箱（服务端校验 + 客户端按钮都用它） */
export function canUseFirstAidKitAt(state: GameState, p: PlayerState | undefined): boolean {
  if (!hasFirstAidKit(state) || !state.firstAidKit) return false;
  if (!p?.alive || p.faction !== 'survivor') return false;
  return p.roomId === firstAidKitRoomId(state);
}

/**
 * 用掉急救箱：治疗目标 + 清空其恐惧 + 移除标记。
 * **治疗量按规则是「治疗」**，所以复用 `applyHeal`（含中毒清除）。
 *
 * ⚠ **战报只给幸存者**（用户要求：幸存者大回合里的"使用急救箱"不写进杀手战报）。
 */
export function useFirstAidKit(state: GameState, healer: PlayerState, target: PlayerState): void {
  state.firstAidKit = false;
  applyHeal(state, target.id, 1);
  clearPoisonOnHeal(state, target.id);
  target.fear = 0;
  target.overFear = false;
  log(
    state,
    `${healer.name} 使用「${roomName(state, firstAidKitRoomId(state))}」的急救箱，治疗了 ${target.name} 并消除其恐惧。急救箱标记已移除。`,
    'survivor',
  );
}

/* --------------------------------------------- 进入地点时的地图触发 ---- */
/**
 * **幸存者因移动进入某个地点**时调用（由 `tryMove` 统一挂钩，
 * 所以一般行动、卡牌、额外行动、被推动都算，不会漏）。
 *
 * 目前两条：
 *  - 实验室 R4：在该地点发出响声
 *  - 城堡 B4：本局**第一次**有人进入时，惊吓他并发出响声
 *
 * 响声只记「哪个地点」，**不写是谁**（`pushNoise` 本来就只记地点），
 * 而且 `pushNoise` 在爆竹回合会直接跳过 —— 自动满足"受爆竹影响"。
 * 报告时机由 `enterNoiseReport` 统一处理（杀手回合开始的响声阶段）。
 */
export function onSurvivorEnterRoom(state: GameState, p: PlayerState, roomId: string): void {
  if (!p.alive || p.faction !== 'survivor') return;

  /** 实验室 R4「無菌室」：进入就响 */
  if (isMap(state, MAP_LAB) && roomId === STERILE_ROOM) {
    pushNoise(state, roomId);
  }

  /** 城堡 B4「雕像長廊」：本局第一次有人进来 —— 惊吓 + 响声，各只一次 */
  if (isMap(state, MAP_CASTLE) && roomId === 'B4' && !state.castleHallFirstEnterDone) {
    state.castleHallFirstEnterDone = true;
    addFear(state, p.id, 1);
    pushNoise(state, roomId);
    log(
      state,
      `「${roomName(state, roomId)}」的雕像長廊：${p.name} 第一次踏入，受到惊吓。`,
      'survivor',
    );
  }
}

/* ------------------------------------------------ 城堡：机关大门 ---- */
/** 机关大门所在房间（城堡 R1 監視室）—— 幸存者要在这个房间才能放 */
export const LEVER_ROOM = 'R1';

/** 这扇门是不是机关大门 */
export function isLeverGate(state: GameState, door: string): boolean {
  if (!isMap(state, MAP_CASTLE) || !state.leverGateDoorId) return false;
  return state.leverGateDoorId === door;
}

/** 现在场上的机关大门（没有就 null） */
export function leverGateDoor(state: GameState): string | null {
  if (!isMap(state, MAP_CASTLE)) return null;
  return state.leverGateDoorId;
}

/**
 * 幸存者放置机关大门。
 *
 * 规则：
 *  - 场上**至多一个** —— 直接覆盖 `leverGateDoorId`，旧门就自动消失了
 *  - ⚠ **不能放在已经被封堵的门上**（用户要求）。
 *    以前是"自动把那个封堵拆掉再放"，现在直接拒绝 —— 让人自己去拆。
 *
 * ⚠ **双方战报都要立刻写明**（用户要求）：
 * 「幸存者放机关大门，在双方战报立即写上『哪里和哪里之间出现了机关大门』」。
 * 以前这条只给幸存者、而且不写操作者 —— 于是杀手那边「机关大门挡路」时
 * 只说"有门"，不知道哪里冒出来的、是谁动的机关。
 * 机关大门在地图上本来就是双方都看得见的（`leverGateDoorId` 双方都下发），
 * 补上地点和操作者不泄露任何新信息。
 */
export function placeLeverGate(
  state: GameState,
  fromRoomId: string,
  toRoomId: string,
  actorId?: string | null,
): void {
  const id = doorId(fromRoomId, toRoomId);
  if (isDoorBlocked(state, id)) {
    throw new Error(
      `「${roomName(state, fromRoomId)}」–「${roomName(state, toRoomId)}」这扇门已经被封堵了，` +
        '机关大门不能放在被封堵的门上（要放就先拆掉那个封堵）。',
    );
  }
  state.leverGateDoorId = id;
  state.leverGateOwnerId = actorId ?? null;
  const who = actorId ? state.players[actorId]?.name : null;
  log(
    state,
    `${who ? `${who} 操作控制杆：` : ''}「${roomName(state, fromRoomId)}」与「${roomName(state, toRoomId)}」之间出现了**机关大门**` +
      '（幸存者不能通过；杀手要弃 3 张手牌才能通过，通过后大门被拆除）。',
    'all',
    true,
  );
}

/** 杀手过门要弃几张手牌 */
export const LEVER_GATE_COST = 3;

/* ------------------------------------------------ 进入地点触发器（统一）---- */
