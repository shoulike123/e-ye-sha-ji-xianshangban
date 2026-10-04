/**
 * 规则积木盒。
 * 裁判（engine.ts）说“走一步 / 搜一下 / 封一扇门”，真正动手的是这里。
 * 卡牌 JSON 里的 effects 也会走到 runEffects / applyOne。
 */
import type { CardDef, EffectDef, MapDef } from '../content/schema.js';
import type { EffectContext, GameState, LogVis, PlayerState } from './types.js';

/**
 * **幸存者私有阶段**：这些阶段里，没显式标可见性的战报默认只给幸存者看。
 *
 * 规则：**杀手战报不能写幸存者的行为** ——
 * 幸存者大回合里杀手只该看到「幸存者正在行动」，
 * 加上少数几条**立即报告**的事件（惊吓过度发出响声、踩到猎手陷阱、
 * 拆除封堵、放置机关大门）—— 那几条会显式标 `needsCommon = true`。
 */
const SURVIVOR_PRIVATE_PHASES: ReadonlySet<string> = new Set([
  'survivorMain',
  'discovery',
  'crossbowSetup',
]);

/** 这个阶段是不是"幸存者自己的事"（杀手看不到细节） */
export function isSurvivorPrivatePhase(state: GameState): boolean {
  return SURVIVOR_PRIVATE_PHASES.has(state.phase);
}

/**
 * **幸存者侧动作（技能 / 物品 / 遗物）的战报可见性** —— 用户口径：
 *
 * 「遭遇中，幸存者触发技能、物品啥的正常给杀手看，但是**不会显示遭遇之前
 *   没显示的信息**」。
 *
 * 也就是：
 *  - **遭遇中**做的 → `'all'`：事情就发生在杀手眼前（出示剛毅之盾、守護之石…）
 *  - **遭遇之外**（幸存者大回合、大回合开始…）→ `'survivor'`：杀手看不到
 *
 * ⚠ 用它的时候注意：**只写"这一次动作"本身**，不要顺手把之前发生过的事
 * （比如他什么时候、从哪儿得到这件遗物）一起写出来 —— 那些信息本来就是
 * 幸存者私有的，写进来等于用遭遇把它带出去了。
 */
export function survivorActionVis(state: GameState): LogVis {
  return state.phase === 'encounter' ? 'all' : 'survivor';
}

/**
 * 往战报本上写一行。
 *
 * `vis` 省略时**按阶段推断**：幸存者私有阶段 → `'survivor'`（杀手看不见），
 * 其他阶段 → `'all'`（杀手回合的行动对幸存者是公开的）。
 *
 * `needsCommon = true` 表示"这是幸存者侧的事件，但要让杀手**立即**知道"
 * （见 `buildSnapshot` 里的 `killerFogPhase` 过滤）。
 */
export function log(state: GameState, text: string, vis?: LogVis, needsCommon = false) {
  /**
   * ⚠ **空文本不写进战报**。
   *
   * 战报是按条目逐行渲染的（每条一个 `div`），空条目在界面上就是**一格空白** ——
   * 用户报过"战报空了一块"。这里兜一道：哪次拼字符串拼出空串（或缺参数）
   * 就直接跳过，别让空白进战报。
   */
  const body = typeof text === 'string' ? text : '';
  if (!body.trim())
    return;
  const v: LogVis = vis ?? (isSurvivorPrivatePhase(state) ? 'survivor' : 'all');
  /**
   * ⚠ **带上"第几个大回合"**（`state.round`）——
   * 杀手界面地图旁边那块信息栏要显示「本大回合的全部战报」，
   * 只能按这个字段筛（战报本身只有时间戳，跨回合分不出来）。
   *
   * 大厅/选人阶段还没有 `round`（开局时归 0），统一记 `0` —— 这样
   * "本大回合"那块筛起来不会因为 `undefined` 而漏掉或误收。
   */
  state.logs.push({ t: Date.now(), text: body, vis: v, needsCommon, round: state.round ?? 0 });
  if (state.logs.length > 200) state.logs.shift();
}

export function roomName(state: GameState, roomId: string | null | undefined): string {
  if (!roomId) return '未知';
  const room = state.map.rooms.find((r) => r.id === roomId);
  if (!room) return roomId;
  return formatRoomLabel(room.id, room.name);
}

export function formatRoomLabel(id: string, name: string | undefined | null): string {
  const n = (name ?? '').trim();
  if (!n) return id;
  if (n.startsWith(id)) return n;
  return `${id}${n}`;
}

export function cardHandCost(card: { handCost?: number; text?: string } | null | undefined): number {
  if (!card) return 0;
  if (typeof card.handCost === 'number' && Number.isFinite(card.handCost)) {
    return Math.max(0, Math.floor(card.handCost));
  }
  const m = /费用\s*(\d+)/.exec(card.text ?? '');
  return m ? Number(m[1]) : 0;
}

/**
 * **女猎手进化 3 级**：「所有卡牌费用 -1（最少为 0）」。
 *
 * 单独一个纯函数（只吃 `discount` 数字、不读 state），
 * 这样 `effects.ts` 不用反向依赖 `evolution.ts`（那会成环）。
 * 调用方传 `huntressCostDiscount(state)`。
 */
export function killerCardCostAfterDiscount(baseCost: number, discount: number): number {
  return Math.max(0, baseCost - Math.max(0, discount));
}

export function itemName(itemId: string): string {
  const map: Record<string, string> = {
    key: '钥匙',
    map: '地图',
    board: '木板',
    item: '物品',
    sophia_camera: '索菲亚的相机',
    marco_medkit: '马尔科的医药包',
    axe: '手斧',
    lime: '石灰粉',
    whiskey: '威士忌酒瓶',
    herb: '草药',
  /** 【变体1】特性 17「秘密武器」：当作一件 +4 防御值的物品，名字表里留一项 */
  trait_s17: '秘密武器',
    toolbox: '工具箱',
    ammo: '弹药包',
    longsword: '长剑',
    amulet: '古代护符',
    shortsword: '短剑',
    revolver: '左轮手枪',
    firecracker: '爆竹',
    map_secret: '秘密地图',
    sedative: '镇静剂',
    flashlight: '手电筒',
    adrenaline: '肾上腺素',
    trap: '陷阱零件',
    lamp: '煤油灯',
    parcel: '神秘包裹',
    /** 【狼人宝箱】两件银质武器（以前没映射，界面会显示英文 id） */
    silver_dagger: '银质匕首',
    silver_bullet: '银质子弹',
    /** 【墓穴・遺物室】的遗物（物品 id = 卡牌 id，这里给中文名） */
    relic_key: '鑰匙',
    relic_mirror: '鏡之門戶',
    relic_shield: '剛毅之盾',
    relic_guard: '守護之石',
    relic_insight: '洞察之球',
  };
  return map[itemId] ?? itemId;
}

export function doorId(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 把一个门号字符串统一成规范写法；拿到的已经是规范写法就原样返回 */
export function canonicalDoorId(raw: string): string {
  const pair = parseDoor(raw);
  return pair ? doorId(pair[0], pair[1]) : raw;
}

export function parseDoor(id: string): [string, string] | null {
  const i = id.indexOf('|');
  if (i < 0) return null;
  return [id.slice(0, i), id.slice(i + 1)];
}

export function isDoorEdge(pathType?: string): boolean {
  return !pathType || pathType === 'door';
}

/** 门或一般通道（虚线），不含杀手通道 / 秘密通道 / 其他特殊通道。 */
export function isGeneralPath(pathType?: string): boolean {
  return !pathType || pathType === 'door' || pathType === 'dash';
}

export function generalAdjacentRooms(map: MapDef, from: string): string[] {
  const out: string[] = [];
  for (const e of map.edges) {
    if (!isGeneralPath(e.pathType)) continue;
    if (e.from === from) out.push(e.to);
    else if ((e.bidirectional ?? true) && e.to === from) out.push(e.from);
  }
  return out;
}

/** 安娜「小心谨慎」：凡是她自己发动的「搜索」都不发出响声（钥匙、工具箱等一律不响）。
 *  只作用于搜索动作；修理、草药、物品使用、翻手提箱等照常按牌面响声结算。 */
export function isCautiousSearcher(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (ch?.skills.some((s) => s.id === 'cautious' || s.name.includes('小心'))) return true;
  return /安娜|anna|survivor1/i.test(`${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`);
}

export function isEngineeringExpert(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (ch?.skills.some((s) => s.id === 'engineering_expert' || s.name.includes('工程专家'))) return true;
  return /约翰逊|engineer|survivor2/i.test(`${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`);
}

/** 索菲亚·斯科特（相机的主人） */
export function isSophia(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  return /survivor4|索菲亚|索菲娅|sophia/i.test(`${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`);
}

/** 马尔科·卡尔文（医药包的主人） */
export function isMarco(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  return /survivor3|马尔科|marco/i.test(`${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`);
}

/** 乔治·卡朋特（教授，笔记的主人） */
export function isGeorge(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  return /survivor6|乔治|george/i.test(`${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`);
}

/** 局中是否有乔治在场 */
export function georgeInPlay(state: GameState): boolean {
  return Object.values(state.players).some(
    (p) => p.faction === 'survivor' && p.alive && isGeorge(state, p.id),
  );
}

/** 这格是不是「有书本标记」的地点（乔治的特殊行动只能在这里做） */
export function isBookRoom(state: GameState, roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  const room = state.map.rooms.find((r) => r.id === roomId);
  return Boolean(room?.tags.includes('special-book'));
}

/** 乔治的 3 张笔记定义 */
export function georgeNoteDefs(state: GameState): CardDef[] {
  return Object.values(state.cardById).filter((c) => c.type === 'note');
}


/**
 * 乔治是否持有「用物品防御 +2」那张笔记。
 * 只有真正使用了防御物品时才生效（由调用方判断），并且和其他加成叠加。
 */
export function georgeDefenseNoteBonus(state: GameState, p: PlayerState): number {
  if (!isGeorge(state, p.id)) return 0;
  return (p.items.george_note_defense ?? 0) > 0 ? 2 : 0;
}

/** 只能本人使用的物品（索菲亚的相机 / 马尔科的医药包）；不是本人就返回一句提示 */
export function personalItemBlockReason(
  state: GameState,
  playerId: string,
  itemId: string,
): string | null {
  if (itemId === 'sophia_camera') {
    return isSophia(state, playerId) ? null : '索菲亚的相机只能由索菲亚本人使用';
  }
  if (itemId === 'marco_medkit') {
    return isMarco(state, playerId) ? null : '马尔科的医药包只能由马尔科本人使用';
  }
  return null;
}

export function takeEarliestFromSurvivorDiscard(state: GameState, itemId: string): boolean {
  const i = state.survivorDiscard.findIndex((id) => discardIdIsItem(state, id, itemId));
  if (i < 0) return false;
  state.survivorDiscard.splice(i, 1);
  return true;
}

export function survivorDiscardHasItem(state: GameState, itemId: string): boolean {
  return state.survivorDiscard.some((id) => discardIdIsItem(state, id, itemId));
}

function discardIdIsItem(state: GameState, id: string, itemId: string): boolean {
  if (id === itemId) return true;
  const card = state.cardById[id];
  return Boolean(card?.effects.some((e) => e.op === 'gainItem' && e.itemId === itemId));
}

export function doorsAt(state: GameState, roomId: string): Array<{ id: string; other: string }> {
  const out: Array<{ id: string; other: string }> = [];
  for (const e of state.map.edges) {
    if (!isDoorEdge(e.pathType)) continue;
    if (e.from === roomId) out.push({ id: doorId(e.from, e.to), other: e.to });
    else if ((e.bidirectional ?? true) && e.to === roomId) {
      out.push({ id: doorId(e.from, e.to), other: e.from });
    }
  }
  return out;
}

/**
 * 这个地点上**还能封的门**（已经封掉的、以及机关大门都不算）。
 *
 * ⚠ 名字里的 "unblocked" 只说了"没被封"，但**机关大门也不能封** ——
 * 见 `isBlockadableDoor`。所有调用点（封堵牌 / 就地封堵 / 留下 / 核心标记封堵）
 * 问的都是"这里还有哪扇门能封"，所以把机关大门一起滤掉是对的。
 */
export function unblockedDoorsAt(
  state: GameState,
  roomId: string,
): Array<{ id: string; other: string }> {
  return doorsAt(state, roomId).filter((d) => isBlockadableDoor(state, d.id));
}

/**
 * **这扇门现在能不能被封堵。**
 *
 * 规则（用户口径）：「机关大门不能放在有封堵的位置」——
 * **反过来也一样**：门上已经有机关大门时不能再封，两者不能共存
 * （`placeLeverGate` 早就拒绝"往封堵上放闸门"，这里补上反方向）。
 *
 * 顺带把"到底有没有这扇门"也判了：传进来的门号在地图上找不到边就 false。
 */
export function isBlockadableDoor(state: GameState, door: string): boolean {
  if (isDoorBlocked(state, door)) return false;
  const id = canonicalDoorId(door);
  if (isLeverGateDoor(state, id)) return false;
  const pair = parseDoor(id);
  if (!pair) return false;
  return state.map.edges.some(
    (e) =>
      isDoorEdge(e.pathType) &&
      ((e.from === pair[0] && e.to === pair[1]) || (e.to === pair[0] && e.from === pair[1])),
  );
}

export function injuredSurvivorIds(state: GameState): string[] {
  return Object.values(state.players)
    .filter((s) => s.faction === 'survivor' && s.alive && s.hp < s.maxHp)
    .map((s) => s.id);
}

/** 与治疗者同一地点、还活着且已受伤的幸存者（含自己） */
export function injuredAlliesHere(state: GameState, healerId: string): string[] {
  const healer = state.players[healerId];
  if (!healer?.roomId) return [];
  return injuredSurvivorIds(state).filter((id) => state.players[id]?.roomId === healer.roomId);
}

/**
 * 可治疗的同伴：**受伤的**、**已〔中毒〕的**，
 * 以及（当治疗手段本身能消除恐惧时）**有恐惧的**。
 *
 * - 女王规则：「已中毒的人可以被治疗（即使是健康状态），受到治疗的幸存者会移除中毒标记。」
 * - 马尔科的医药包牌面写了「并消除目标恐惧」，所以**健康但有恐惧的人也是合法目标**。
 *   草药没有这条，所以默认 `clearsFear = false` —— 不能拿草药去治一个满血只是有恐惧的人，
 *   那样只会白费一个草药（`applyHeal` 对满血没有效果）。
 */
export function healableAlliesHere(
  state: GameState,
  healerId: string,
  clearsFear = false,
): string[] {
  const healer = state.players[healerId];
  if (!healer?.roomId) return [];
  const poisoned = new Set(state.poisoned ?? []);
  return Object.values(state.players)
    .filter(
      (t) =>
        t.faction === 'survivor' &&
        t.alive &&
        t.roomId === healer.roomId &&
        (t.hp < t.maxHp || poisoned.has(t.id) || (clearsFear && t.fear > 0)),
    )
    .map((t) => t.id);
}

/** 只能治疗同一地点的受伤/中毒幸存者（包括自己） */
export function assertHealSameRoom(
  state: GameState,
  healerId: string,
  targetId: string,
  clearsFear = false,
): void {
  const healer = actor(state, healerId);
  const target = state.players[targetId];
  if (!target?.alive || target.faction !== 'survivor') throw new Error('治疗目标无效');
  const isPoisoned = (state.poisoned ?? []).includes(targetId);
  /**
   * 医药包能消除恐惧 → 健康但有恐惧的人也算合法目标。
   * 草药不能 → 满血且没中毒就拒绝（否则白费一个草药）。
   */
  if (target.hp >= target.maxHp && !isPoisoned && !(clearsFear && target.fear > 0)) {
    throw new Error(
      clearsFear
        ? `${target.name} 未受伤、没有中毒也没有恐惧，不能治疗`
        : `${target.name} 未受伤也没有中毒，不能治疗`,
    );
  }
  if (!healer.roomId || healer.roomId !== target.roomId) {
    throw new Error('只能治疗与你在同一地点的幸存者');
  }
}

/** 打牌前不再因没门/没人而禁牌。没门时封堵效果会跳过。 */
export function killerCardBlockedReason(
  _state: GameState,
  _actorId: string,
  _card: { effects?: Array<{ op: string }> },
): string | null {
  return null;
}

export function passageNeighbors(map: MapDef, from: string): string[] {
  const out: string[] = [];
  for (const e of map.passages ?? []) {
    if (e.from === from) out.push(e.to);
    if ((e.bidirectional ?? true) && e.to === from) out.push(e.from);
  }
  return out;
}

/**
 * 【变体3】通道調查 ①「**所有秘密通道互相連接**」。
 *
 * 这条计划已完成时，`map.passages` 的**所有端点互相直连** ——
 * 也就是说：只要你在其中任意一个秘密通道地点，就可以去**任何一个**通道地点
 * （原本只能沿着地图上画的那几条通道走）。
 *
 * 判定走 `planImplActive`（注入的），所以 effects.ts 不用认识计划卡。
 */
export function passageNeighborsFor(state: GameState, from: string | null | undefined): string[] {
  if (!from) return [];
  if (!planImplActive(state, 'passagesLinked')) return passageNeighbors(state.map, from);
  const all = new Set<string>();
  for (const e of state.map.passages ?? []) {
    all.add(e.from);
    all.add(e.to);
  }
  /** 自己不在通道网络上 → 还是按原样（互相連接不改变"你得先站在通道口"） */
  if (!all.has(from)) return passageNeighbors(state.map, from);
  return [...all].filter((id) => id !== from).sort();
}

export function trySecretPassage(state: GameState, playerId: string, toRoomId: string): void {
  const p = actor(state, playerId);
  if (p.faction !== 'survivor' || !p.alive) throw new Error('只有幸存者可通过秘密通道');
  if (!p.roomId) throw new Error('不在地图上');
  if (!passageNeighborsFor(state, p.roomId).includes(toRoomId)) {
    throw new Error('该地点没有通往目标的秘密通道');
  }
  p.roomId = toRoomId;
  log(state, `${p.name} 穿过秘密通道，来到「${roomName(state, toRoomId)}」。`);
}

export function setStealth(p: PlayerState, on: boolean): void {
  if (on) {
    if (!p.stealth) p.stealthOriginRoomId = p.roomId;
    p.stealth = true;
  } else {
    p.stealth = false;
    p.stealthOriginRoomId = null;
  }
}

export function consumeTrapAt(state: GameState, roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  if (!state.trapRoomIds) state.trapRoomIds = [];
  const i = state.trapRoomIds.indexOf(roomId);
  if (i < 0) return false;
  state.trapRoomIds.splice(i, 1);
  return true;
}

/** 遭遇结束：若开战地点仍有陷阱标记则移除（可重复调用，已无标记则无事） */
export function clearTrapAfterEncounter(state: GameState, roomId: string | null | undefined): void {
  if (!consumeTrapAt(state, roomId)) return;
  log(state, `遭遇结束，「${roomName(state, roomId!)}」的陷阱标记被移除。`);
}

/**
 * **【未命名】进化 1 级：「你可以〔移動〕通过秘密通道」。**
 *
 * 判据看**角色**（killer7 / 未命名）和**等级**。
 * ⚠ 这里不能用 `killerKindOf`（在 `evolution.ts`）—— 那会成环，
 * 所以按 characterId / 角色名判，和别的"按角色认人"的地方保持一致。
 */
export function killerUsesSecretPassages(
  state: GameState,
  playerId: string | null | undefined,
): boolean {
  if (!playerId) return false;
  const p = state.players[playerId];
  if (!p || p.faction !== 'killer') return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  const isUnidentified = /killer7|未命名|unidentified/i.test(
    `${p.characterId ?? ''} ${ch?.name ?? ''}`,
  );
  return isUnidentified && state.killerLevel >= 1;
}

function neighborsOpen(
  state: GameState,
  from: string,
  ignoreBlockades: boolean,
  allowKiller = false,
  /**
   * 传一个**玩家 id**：如果这个人是"能走秘密通道的杀手"（未命名 1 级起），
   * 就把 `map.passages` 的秘密通道也算成一条可走的路。
   *
   * ⚠ 默认 `null` = 不算 —— 所以幸存者、僵尸、以及"相邻判定"全都不受影响。
   */
  passagesFor: string | null = null,
): string[] {
  const out: string[] = [];
  for (const e of state.map.edges) {
    if (e.pathType === 'killer' && !allowKiller) continue;
    let other: string | null = null;
    if (e.from === from) other = e.to;
    else if ((e.bidirectional ?? true) && e.to === from) other = e.from;
    if (!other) continue;
    /**
     * **坍塌掉的地点视作不存在**（墓穴）：连过去的门也一起消失。
     * 这里统一挡掉，所有走 `neighborsOpen` 的寻路（移动、距离、感知范围、
     * 僵尸寻路……）就全都不会经过它。
     */
    if (isRoomGone(state, other)) continue;
    const id = doorId(from, other);
    /**
     * 判断「这扇门被封了吗」必须用规范门号比较：
     * 地图 JSON 里边的方向可能是 R1→B1，而封堵表里存的是排序后的 B1|R1，
     * 直接用字符串全等会漏判 —— 之前就是这个原因导致「杀手走过封堵没拆掉」。
     */
    const blocked = isDoorEdge(e.pathType) && isDoorBlocked(state, id);
    if (blocked && !ignoreBlockades) continue;
    /**
     * **机关大门：幸存者绝对不能通过**（规则），所以对幸存者来说
     * 它和"被封堵的门"一样是一堵墙 —— 直接不进可走列表。
     *
     * ⚠ 复用 `ignoreBlockades` 这个开关：它对**杀手**是 true（封堵不挡路），
     * 而杀手过机关大门要走"弃 3 张牌"的付费流程（`tryMove` 之前那条判定），
     * 所以这里也不能替杀手挡掉，否则他就永远触发不了付费提示。
     */
    if (!ignoreBlockades && isDoorEdge(e.pathType) && isLeverGateDoor(state, id)) continue;
    out.push(other);
  }
  /** 【未命名 1 级】秘密通道当成一条可走的路（传送式的，不看门/封堵） */
  if (passagesFor && killerUsesSecretPassages(state, passagesFor)) {
    for (const other of passageNeighborsFor(state, from)) {
      if (isRoomGone(state, other)) continue;
      if (!out.includes(other)) out.push(other);
    }
  }
  /**
   * 排序后再返回：多条同样短的路线时，取房号靠前的那条。
   * 不排序的话这里用的是地图 JSON 里的边顺序，会和客户端预览（也按房号排序）
   * 选到不同路线 —— 表现就是「显示走 B5，实际走了 R1」。
   */
  return out.sort();
}

/** 这扇门（任意写法）是不是已经在封堵表里 */
export function isDoorBlocked(state: GameState, door: string): boolean {
  const want = canonicalDoorId(door);
  return state.blockades.some((id) => canonicalDoorId(id) === want);
}

/**
 * 「这个地点**已经不存在**了」的判定（墓穴坍塌）。
 * 由 engine 注入 `mapEffects.isRoomGone` —— effects.ts 不认识地图特殊规则，
 * 只要知道**这个地点现在能不能去**。
 */
let roomGoneChecker: ((state: GameState, roomId: string) => boolean) | null = null;

export function setRoomGoneChecker(fn: (state: GameState, roomId: string) => boolean): void {
  roomGoneChecker = fn;
}

/** 这个地点现在是不是已经没了（没注入就一律 false） */
export function isRoomGone(state: GameState, roomId: string | null | undefined): boolean {
  if (!roomId || !roomGoneChecker) return false;
  return roomGoneChecker(state, roomId);
}

/** 某格的杀手邻接：封堵不挡路，可走杀手通道。 */
export function roomsAdjacentKiller(state: GameState, roomId: string): string[] {
  return neighborsOpen(state, roomId, true, true);
}

/**
 * **杀手移动**能一步走到的地方：封堵不挡路、可走杀手通道，
 * 而且【未命名 1 级起】还能走秘密通道。
 *
 * ⚠ 只用于**移动**（牌上的〔移動〕、走位落点）——
 * "一个相邻地点"那种判定不受影响（秘密通道不等于相邻）。
 */
export function killerAdjacentRooms(state: GameState, playerId: string): string[] {
  const p = state.players[playerId];
  if (!p?.roomId) return [];
  return neighborsOpen(state, p.roomId, true, true, playerId);
}

/**
 * **从指定地点出发**、按"这个人在〔移動〕"的口径算一步能到的地方。
 *
 * 和 `killerAdjacentRooms` 的唯一区别是**起点可以不是他当前所在地** ——
 * 杀手走〔移動〕牌时会一步一步点路径，中间步的相邻性要从**草稿末端**算。
 * `playerId` 只用来决定秘密通道算不算（未命名 1 级起才算）。
 */
export function moveAdjacentRooms(
  state: GameState,
  roomId: string,
  playerId: string | null | undefined,
): string[] {
  if (!roomId) return [];
  const p = playerId ? state.players[playerId] : null;
  const passagesFor = p && p.faction === 'killer' ? p.id : null;
  return neighborsOpen(state, roomId, true, true, passagesFor);
}

export function isKeyCard(card: { effects: Array<{ op: string; itemId?: string }> }): boolean {
  return card.effects.some((e) => e.op === 'gainItem' && e.itemId === 'key');
}

export function buildSearchDeck(cards: Array<{ id: string; effects: Array<{ op: string; itemId?: string }> }>): string[] {
  /**
   * ⚠ 只收**搜索牌**：调用方可能把别的牌堆一起传进来（测试里就传了遗物牌），
   * 不过滤的话遗物卡会混进搜索牌堆、被当成普通搜索牌抽出来。
   */
  const searchable = cards.filter((c) => (c as { type?: string }).type === undefined || (c as { type?: string }).type === 'search');
  const keys = searchable.filter(isKeyCard).map((c) => c.id);
  const rest = searchable.filter((c) => !isKeyCard(c)).map((c) => c.id);
  if (keys.length === 0) return shuffle(searchable.map((c) => c.id));
  const bottom = keys[Math.floor(Math.random() * keys.length)]!;
  return [...shuffle([...keys.filter((id) => id !== bottom), ...rest]), bottom];
}

function actor(state: GameState, id: string): PlayerState {
  const p = state.players[id];
  if (!p) throw new Error(`未知玩家 ${id}`);
  return p;
}

export function itemCount(items: Record<string, number> | undefined): number {
  if (!items) return 0;
  return Object.values(items).reduce((n, v) => n + v, 0);
}

export function inventorySlotsFor(state: GameState, playerId: string): number {
  const p = state.players[playerId];
  if (!p) return 3;
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (ch?.inventorySlots) return ch.inventorySlots;
  const hay = `${ch?.id ?? ''} ${ch?.name ?? ''} ${p.characterId ?? ''}`;
  if (/约翰逊|engineer|surv_eng/i.test(hay)) return 6;
  return 3;
}

export function takeItem(p: PlayerState, itemId: string, amount = 1): boolean {
  const have = p.items[itemId] ?? 0;
  if (have < amount) return false;
  p.items[itemId] = have - amount;
  if (p.items[itemId] <= 0) delete p.items[itemId];
  return true;
}

function cardIsLive(state: GameState, cardId: string): boolean {
  if (state.searchDeck.includes(cardId) || state.discoveryDeck.includes(cardId)) return true;
  if (state.discoveryOptions.includes(cardId)) return true;
  if (state.killerDeck.includes(cardId) || state.killerHand.includes(cardId)) return true;
  if (state.killerLocked.includes(cardId)) return true;
  if (state.encounter) {
    if (state.encounter.attackOptions.includes(cardId)) return true;
    if (state.encounter.attackCardId === cardId) return true;
    for (const opts of Object.values(state.encounter.defenseOptions)) {
      if (opts.includes(cardId)) return true;
    }
  }
  for (const pl of Object.values(state.players)) {
    if (pl.hand.includes(cardId)) return true;
  }
  return false;
}

/** 一张牌只存在于一处：已在摸牌/手牌/待选区时不会进弃牌堆。 */
export function discardUniqueCard(
  state: GameState,
  cardId: string,
  pile: 'search' | 'discovery' | 'none' = 'none',
): void {
  if (!cardId || cardIsLive(state, cardId)) return;
  if (pile === 'search' && !state.searchDiscard.includes(cardId)) state.searchDiscard.push(cardId);
  if (pile === 'discovery' && !state.discoveryDiscard.includes(cardId)) {
    state.discoveryDiscard.push(cardId);
  }
  if (!state.survivorDiscard.includes(cardId)) state.survivorDiscard.push(cardId);
}

/** 一次性物品被使用或因溢出弃置：进入弃牌堆，并从角色栏移除。 */
export function discardConsumedItem(state: GameState, itemId: string, amount = 1): void {
  for (let i = 0; i < amount; i++) state.survivorDiscard.push(itemId);
}

export function cardBecomesPossession(card: { effects: Array<{ op: string }> } | null | undefined): boolean {
  return Boolean(card?.effects.some((e) => e.op === 'gainItem'));
}

/**
 * 遭遇中可用来增强防御的物品。可反复使用的短剑/长剑也算「使用物品」。
 *
 * **一次防御只能选一件**（`encounter.defenseItems[playerId]` 是单个值）——
 * 例外是**骰子**（自动）和**墓穴遗物「剛毅之盾」**（自动 +1、不占这个名额）。
 */
const DEFENSE_ITEMS: Record<
  string,
  {
    bonus: number;
    consume: boolean;
    /** 消耗的不是所选物品本身时（左轮耗弹药） */
    consumeItemId?: string;
    /** 还必须持有这件物品才能用（银质子弹需要左轮手枪） */
    requiresItem?: string;
    killerDraw: number;
  }
> = {
  shortsword: { bonus: 1, consume: false, killerDraw: 0 },
  longsword: { bonus: 3, consume: false, killerDraw: 1 },
  lime: { bonus: 2, consume: true, killerDraw: 0 },
  axe: { bonus: 1, consume: true, killerDraw: 0 },
  /** 用左轮防御：须同时持有弹药包；每次弃 1 弹药包，左轮保留 */
  revolver: { bonus: 4, consume: true, consumeItemId: 'ammo', killerDraw: 0 },
  /** 煤油灯（「替换鸿运当骰等牌」开启时的替换牌）：+1，可反复 */
  lamp: { bonus: 1, consume: false, killerDraw: 0 },
  /**
   * 【狼人宝箱】**银质匕首**：+5 防御值，**一次性**。
   * 以前这里没有它 —— 所以开宝箱拿到银质匕首却**在遭遇里选不出来**。
   */
  silver_dagger: { bonus: 5, consume: true, killerDraw: 0 },
  /**
   * 【狼人宝箱】**银质子弹**：需要左轮手枪；**掷出的 1 或 3 都视作 5**。
   * 它不改固定加成（`bonus: 0`），改的是骰面 —— 替换在 `rollEncounterDefense` 里做。
   * 一次性。
   */
  silver_bullet: { bonus: 0, consume: true, requiresItem: 'revolver', killerDraw: 0 },
  /**
   * 【墓穴遗物】**剛毅之盾**：+1 防御值。
   *
   * ⚠ 它**不占"一次只能选一件"的名额**（用户明确）—— 所以它只是**出现在
   * 防御选项里**给玩家点，实际记在 `encounter.shieldUsed` 上（见
   * `engine` 的 `playEncounterDefense` / 防御结算），**不会**写进
   * `encounter.defenseItems`，也就不会顶掉别的防御物品。
   * 这里的 `bonus` 只用于选项里显示「+1 防御」。
   */
  relic_shield: { bonus: 1, consume: false, killerDraw: 0 },
};

export function defenseItemInfo(itemId: string) {
  return DEFENSE_ITEMS[itemId] ?? null;
}

/**
 * 这名幸存者**现在能拿来做防御的物品**（遭遇防御阶段）。
 *
 * ⚠ 关键：客户端**不该自己维护一份同样的表** —— 以前 `GameViews.tsx` 里
 * 有一份 `DEFENSE_ITEM_HINT`，两边不同步的结果就是
 * 「狼人宝箱开出来的银质匕首/银质子弹在遭遇里根本选不出来」。
 * 所以这里统一由服务端算、通过快照下发。
 */
export function usableDefenseItemIds(p: PlayerState | undefined): string[] {
  if (!p) return [];
  return Object.keys(DEFENSE_ITEMS)
    .filter((id) => canUseDefenseItem(p, id))
    .sort();
}

/** 给界面的一句话说明（和服务端规则同一份数据，不会走样） */
export function defenseItemHint(itemId: string): string {
  const def = DEFENSE_ITEMS[itemId];
  if (!def) return '';
  const parts: string[] = [];
  if (def.bonus > 0) parts.push(`+${def.bonus} 防御`);
  if (itemId === 'silver_bullet') parts.push('掷出的 1 或 3 都视作 5');
  if (def.requiresItem) parts.push(`需${itemName(def.requiresItem)}`);
  if (def.consumeItemId) parts.push(`每次弃 1 ${itemName(def.consumeItemId)}`);
  else if (def.consume) parts.push('一次性');
  else parts.push('可反复使用');
  if (def.killerDraw > 0) parts.push(`杀手抽 ${def.killerDraw}`);
  return parts.join('，');
}

export function canUseDefenseItem(p: PlayerState, itemId: string): boolean {
  if ((p.items[itemId] ?? 0) < 1) return false;
  const def = DEFENSE_ITEMS[itemId];
  if (!def) return false;
  if (itemId === 'revolver' && (p.items.ammo ?? 0) < 1) return false;
  if (def.requiresItem && (p.items[def.requiresItem] ?? 0) < 1) return false;
  return true;
}

export function applyDefenseItem(state: GameState, playerId: string, itemId: string): number {
  const p = actor(state, playerId);
  const def = DEFENSE_ITEMS[itemId];
  if (!def || !canUseDefenseItem(p, itemId)) return 0;
  if (def.consume) {
    const payId = def.consumeItemId ?? itemId;
    takeItem(p, payId, 1);
    discardConsumedItem(state, payId, 1);
  }
  if (def.killerDraw > 0) drawKillerCards(state, def.killerDraw);
  /**
   * `bonus: 0` 的是"改骰面"型的（银质子弹）：它自己会另打一条战报，
   * 所以这里**不打**"+0"那种噪音战报，但仍然要消耗掉。
   */
  if (def.bonus > 0) {
    const payNote =
      def.consumeItemId === 'ammo'
        ? '（弃置 1 弹药包）'
        : def.consume
          ? ''
          : '（保留）';
    log(state, `${p.name} 使用「${itemName(itemId)}」防御 +${def.bonus}${payNote}。`);
  } else if (def.requiresItem) {
    /**
     * 防御物品只在遭遇里用 → `survivorActionVis` 在这里同样是 `'all'`；
     * 统一走它，免得以后有人在别处复用这个函数时把信息漏给杀手。
     */
    log(
      state,
      `${p.name} 使用「${itemName(itemId)}」（需 ${itemName(def.requiresItem)}）。`,
      survivorActionVis(state),
    );
  }
  return def.bonus;
}

/**
 * 【变体3】**"某条计划能力现在生效吗"** —— 由 engine 注入。
 *
 * 为什么用注入：`plans.ts` 要 import 本模块（用 `log` / `shuffle`），
 * 所以本模块**不能**反过来 import 它（成环）。engine 两者都能 import，
 * 由它把"计划已完成且带这条 impl"的判定接过来。
 */
let planImplChecker: ((state: GameState, impl: string) => boolean) | null = null;

export function setPlanImplChecker(fn: (state: GameState, impl: string) => boolean): void {
  planImplChecker = fn;
}

/** 这条计划能力（按 `impl` 认）现在生效吗（没开变体3 / 没完成 / 注入缺失 → false） */
export function planImplActive(state: GameState, impl: string): boolean {
  return planImplChecker ? planImplChecker(state, impl) : false;
}

export function hasTenacity(state: GameState, p: PlayerState): boolean {
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (ch?.skills.some((s) => s.id === 'tenacity' || s.name.includes('坚韧'))) return true;
  const hay = `${p.characterId ?? ''} ${ch?.name ?? ''} ${p.name}`;
  return /威廉|surv_runner|survivor5|william/i.test(hay);
}

/** 背包超格就请玩家自己选弃哪些 */
export function enforceInventory(state: GameState, playerId: string) {
  const p = state.players[playerId];
  if (!p || p.faction !== 'survivor') return;
  const extra = itemCount(p.items) - inventorySlotsFor(state, playerId);
  if (extra <= 0) {
    if (state.pendingItemDiscard?.playerId === playerId) state.pendingItemDiscard = null;
    return;
  }
  state.pendingItemDiscard = { playerId, count: extra };
  log(state, `${p.name} 装备栏已满，请弃置 ${extra} 件装备。`);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 修理进度上限 = rules.repairNeeded（默认 5）。超出的部分不再累加。 */
export function addRepairProgress(state: GameState, amount: number): number {
  const cap = state.rules.repairNeeded;
  const before = state.repairProgress;
  state.repairProgress = Math.min(cap, before + amount);
  return state.repairProgress - before;
}

/**
 * 钥匙上限 = rules.keysNeeded（默认 5）。多出来的钥匙不上架、也不计数。
 *
 * ⚠ **「分头行动」下钥匙不上架**（用户要求：找到钥匙**不需要报告杀手**）：
 * 直接记到拾取者身上（`p.keys`），**不占物品格、没有上限**。
 * 所以这里多一个 `holderId` —— 分头行动时必须传，其余模式照旧上架。
 */
export function addKeys(state: GameState, amount: number, holderId?: string): number {
  if (state.split && holderId) {
    const holder = state.players[holderId];
    if (!holder) return 0;
    /** 个人保管：**无上限** */
    holder.keys = (holder.keys ?? 0) + amount;
    return amount;
  }
  const cap = state.rules.keysNeeded;
  const before = state.keysCollected;
  state.keysCollected = Math.min(cap, before + amount);
  return state.keysCollected - before;
}

export function killerHandMax(state: GameState): number {
  return state.rules.killerHandMax ?? 5;
}

let onUpgradeKiller: ((state: GameState) => void) | null = null;

export function setUpgradeHandler(fn: (state: GameState) => void) {
  onUpgradeKiller = fn;
}

/** 摸牌/弃牌时摸牌堆不够：先升级，再把洗匀的弃牌放到摸牌堆底。 */
export function upgradeKiller(state: GameState) {
  onUpgradeKiller?.(state);
}

/**
 * 摸牌堆见底、但还要从里面拿牌时才调用：进化 → 把弃牌堆洗匀接到摸牌堆底。
 * 「先摸完现有的、空了才进化」由调用方逐张控制，这里只管补牌。
 */
function refillKillerDeckIfEmpty(state: GameState): void {
  /**
   * ⚠ **弃牌堆也空的时候不要进化。**
   *
   * 进化的规则是「摸牌堆摸空 → 进化 → **弃牌洗回摸牌堆**」。
   * 没有牌可以洗回来时，这次"摸空"没有任何意义；
   * 可以前照样调 `upgradeKiller` —— 而升级正好会把弃牌堆清空（全洗回摸牌堆），
   * 于是「摸牌堆空 + 弃牌堆空」会在**同一次摸牌里连着成立**：
   *   摸 3 张 → 第 2 张摸空、升级、弃牌洗回（只有 2 张）→ 第 3 张又摸空、
   *   这时弃牌堆刚被清空 → **又升一级**。
   * 用户报的"雕像才刚升过一级，一回合后就又升了一级"就是这个。
   */
  if (state.killerDiscard.length === 0) return;
  const kept = state.killerDeck.length;
  upgradeKiller(state);
  const recycled = shuffle([...state.killerDiscard]);
  state.killerDiscard = [];
  state.killerDeck = [...state.killerDeck, ...recycled];
  log(
    state,
    kept
      ? `弃牌 ${recycled.length} 张已洗匀放到摸牌堆底；原来的 ${kept} 张仍按原顺序在顶上。`
      : `弃牌 ${recycled.length} 张已洗匀成为新的摸牌堆。`,
  );
}

function ensureDeck(
  state: GameState,
  deckKey: 'searchDeck' | 'discoveryDeck' | 'killerDeck' | 'treasureDeck',
  discardKey: 'searchDiscard' | 'discoveryDiscard' | 'killerDiscard' | 'treasureDiscard',
): boolean {
  if (state[deckKey].length > 0) return true;
  if (state[discardKey].length === 0) {
    return false;
  }
  const recycled = [...state[discardKey]];
  state[deckKey] = shuffle(recycled);
  state[discardKey] = [];
  if (discardKey === 'searchDiscard' || discardKey === 'discoveryDiscard') {
    if (!state.survivorDiscard) state.survivorDiscard = [];
    for (const id of recycled) {
      const i = state.survivorDiscard.indexOf(id);
      if (i >= 0) state.survivorDiscard.splice(i, 1);
    }
  }
  return state[deckKey].length > 0;
}

export function drawSearchCard(state: GameState): string | null {
  if (!ensureDeck(state, 'searchDeck', 'searchDiscard')) return null;
  return state.searchDeck.shift() ?? null;
}

export function drawDiscoveryCard(state: GameState): string | null {
  if (!ensureDeck(state, 'discoveryDeck', 'discoveryDiscard')) return null;
  return state.discoveryDeck.shift() ?? null;
}

/** 宝藏牌堆（狼人）：摸牌堆空时把弃牌堆洗回 */
export function drawTreasureCard(state: GameState): string | null {
  if (!ensureDeck(state, 'treasureDeck', 'treasureDiscard')) return null;
  return state.treasureDeck.shift() ?? null;
}

/**
 * 女猎手猎手陷阱：进入某地点时判定。
 *
 * 规则：
 *  - **任何时间、因任何原因**进入陷阱所在地点都会触发（经过也算）。
 *  - 触发时**双方**那个位置的标记都移除，战报写明「谁在哪里触发了什么陷阱（什么效果）」。
 *  - 捕熊：直接伤害 1。白骨：获得 2 恐惧（溢出按惊吓过度流程，一次只响 1 次、恐惧最多 2 个）。
 *  - 捕网：放倒模型，本回合不能离开本地点。
 *  - **陷阱是一次性的：触发后立刻从场上消失**（三种都一样）。
 *    捕网的「本回合不能离开」效果单独记在 `state.netLocks` 里，
 *    这样陷阱没了效果还在。
 *
 * @returns 是否触发了陷阱
 */
export function triggerHunterTrapOnEnter(state: GameState, p: PlayerState): boolean {
  if (p.faction !== 'survivor' || !p.alive || !p.roomId) return false;
  const ids = Object.entries(state.hunterTraps ?? {})
    .filter(([, t]) => !t.removed && t.roomId === p.roomId)
    .map(([id]) => id);
  if (!ids.length) return false;

  let any = false;
  for (const id of ids) {
    const trap = state.hunterTraps[id]!;
    const kind = trap.kind;
    const name =
      kind === 'bear' ? '捕熊陷阱' : kind === 'bone' ? '白骨陷阱' : '捕网陷阱';
    /**
     * **陷阱是一次性的** —— 触发后直接删掉（不是标 `removed`），
     * 这样双方地图上的标记立刻消失。
     */
    const roomIdHit = trap.roomId;
    delete state.hunterTraps[id];
    any = true;

    if (kind === 'bear') {
      /** 踩陷阱是**立即向双方报告**的事件（用户明确列的 4 类之一） */
      log(state, `${p.name} 在「${roomName(state, roomIdHit)}」触发了${name}（直接伤害）。陷阱已移除。`, 'survivor', true);
      applyDamage(state, p.id, 1, state.killerId ?? p.id);
    } else if (kind === 'bone') {
      addFear(state, p.id, 1);
      addFear(state, p.id, 1);
      log(state, `${p.name} 在「${roomName(state, roomIdHit)}」触发了${name}（获得 2 恐惧）。陷阱已移除。`, 'survivor', true);
    } else {
      log(
        state,
        `${p.name} 在「${roomName(state, roomIdHit)}」触发了${name}（放倒模型，本回合不能离开本地点）。陷阱已移除。`,
        'survivor',
        true,
      );
      /**
       * 捕网：陷阱本身消失了，但**效果要留到本回合结束** ——
       * 所以把"被网住"这件事单独记下来。
       */
      if (!state.netLocks) state.netLocks = [];
      const dup = state.netLocks.some(
        (l) => l.roomId === roomIdHit && l.playerId === p.id && l.round === state.round,
      );
      if (!dup) state.netLocks.push({ roomId: roomIdHit, playerId: p.id, round: state.round });
    }
  }
  return any;
}

/** 这名幸存者是否被本回合的捕网陷阱锁在某个地点（不能离开） */
export function netLockedRoom(state: GameState, playerId: string): string | null {
  for (const l of state.netLocks ?? []) {
    if (l.playerId !== playerId) continue;
    if (l.round !== state.round) continue;
    return l.roomId;
  }
  return null;
}

/**
 * **打牌后要展示给杀手的信息**（感知看到了谁、追蹤距离、红外探测结果…）。
 *
 * 用户要求：这些信息放在**地图右边的信息区**（类似战报的一块），
 * 而且**「杀手行动区里的获得的信息确认那些流程删去」** ——
 * 所以这里是**往列表里追加一条**，不是"挂一块等确认"：
 * 不挡流程（不在 `hasPendingKillerChoice` 里），杀手也不用点"知道了"。
 *
 * 定义放在 effects 里（而不是 killerCards）：`killerSpecials` 也要用它，
 * 而 `killerSpecials → killerCards` 会成环。
 */
export function setKillerInfo(state: GameState, title: string, lines: string[]): void {
  if (!state.killerIntel) state.killerIntel = [];
  state.killerIntel.push({ title, lines: [...lines] });
}

/**
 * 杀手摸 n 张。**一张一张摸**：
 * 摸牌堆空了但还要继续摸时，才触发进化 → 把弃牌堆洗匀接到摸牌堆底 → 再接着摸。
 * 所以一次摸 3 张、中途牌堆见底，只会进化一次，剩下的张数用洗回来的牌继续摸。
 * 手牌超上限时摸到的牌正面向上直接进弃牌堆（仍算从摸牌堆拿走）。
 */
export function drawKillerCards(state: GameState, n: number) {
  const max = killerHandMax(state);
  let got = 0;
  let overflow = 0;
  for (let i = 0; i < n; i++) {
    // 每摸一张之前先看看牌堆还有没有；没有就现洗现摸
    if (state.killerDeck.length === 0) refillKillerDeckIfEmpty(state);
    const c = state.killerDeck.shift();
    if (!c) break;
    if (state.killerHand.length < max) {
      state.killerHand.push(c);
      got += 1;
    } else {
      state.killerDiscard.push(c);
      overflow += 1;
      log(state, `手牌已满，「${state.cardById[c]?.name ?? c}」正面向上进入弃牌堆。`);
    }
  }
  if (got > 0) log(state, `杀手摸了 ${got} 张行动牌（手牌 ${state.killerHand.length}）。`);
  if (overflow > 0) log(state, `多摸的 ${overflow} 张已直接置入弃牌堆。`);
}

/**
 * 从摸牌堆弃 n 张（挡住攻击弃 2、长剑让杀手摸 1 等都走这里）。
 * 同样是**一张一张拿**：中途牌堆见底就触发一次进化，再把弃牌洗回摸牌堆继续弃。
 */
export function discardFromKillerDeck(state: GameState, n: number) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (state.killerDeck.length === 0) refillKillerDeckIfEmpty(state);
    const c = state.killerDeck.shift();
    if (!c) break;
    state.killerDiscard.push(c);
    got += 1;
  }
  if (got > 0) log(state, `杀手从牌库弃了 ${got} 张牌。`);
}

/**
 * 本回合临时力量（疯狂 +2、谋杀者重现 +3 等）。
 * 不是永久，也不是「本次攻击」；回合结束清掉。受力量上限截断。
 */
export function addKillerTurnPower(state: GameState, delta: number): void {
  if (!delta) return;
  const cap = state.rules.killerPowerMax ?? 10;
  state.killerTurnPowerBonus = (state.killerTurnPowerBonus ?? 0) + delta;
  const maxBonus = Math.max(0, cap - state.killerPower);
  state.killerTurnPowerBonus = Math.min(maxBonus, Math.max(0, state.killerTurnPowerBonus));
  const label =
    state.killerTurnPowerBonus > 0
      ? `${state.killerPower}+${state.killerTurnPowerBonus}`
      : String(state.killerPower);
  log(state, `本回合力量变为 ${label}（永久 ${state.killerPower}，上限 ${cap}）。`);
}

/** 幽魂 3 级：有人进入过度时由 evolution.ts 注册，避免和本文件互相 import */
let onSurvivorOverFear: ((state: GameState, targetId: string) => void) | null = null;

/**
 * 幸存者**倒下**时的回调（由 engine 注册）。
 * 用来清理挂在他身上的标记 —— 女王的中毒标记就是靠这个移除的，
 * 【分头行动】里还负责"死人就升级 / 全员出局才结束"。
 *
 * ⚠ **不需要传死因**：用户拍板"升级判定不看死因，只要死人了就升级"，
 * 所以这里只管"有人倒下了"这一件事。
 */
let onSurvivorDown: ((state: GameState, targetId: string) => void) | null = null;

export function setOnSurvivorDownHandler(
  fn: (state: GameState, targetId: string) => void,
): void {
  onSurvivorDown = fn;
}

/**
 * 幸存者**受到伤害**时的回调（由 engine 注册）。
 *
 * 【变体1】杀手特性 11「恐惧迸发」：当你伤害任何幸存者时，【惊吓】所有幸存者。
 * 所以要把**伤害来源**一起传出去（只有杀手造成的伤害才触发）。
 */
let onSurvivorDamaged:
  | ((state: GameState, targetId: string, sourceId?: string) => void)
  | null = null;

export function setOnSurvivorDamagedHandler(
  fn: (state: GameState, targetId: string, sourceId?: string) => void,
): void {
  onSurvivorDamaged = fn;
}

export function setOverFearHandler(fn: (state: GameState, targetId: string) => void) {
  onSurvivorOverFear = fn;
}

/** 给幸存者加恐惧。已经 2 枚再加就是过度，要点名报位置 */
/**
 * 增加恐惧标记。
 *
 * 欧菲莉亚「鼓励标记」：**在增加恐惧标记前**自动触发，减少 1 个恐惧标记的增加。
 * 规则细节（用户确认）：
 *  - 恐惧上限是 2。到上限后再「增加」会**改为发出声音**（惊吓过度），
 *    这仍然算一次「增加恐惧标记的动作」，所以**照样消耗**鼓励标记，
 *    但**取消这次声音**。
 *  - 若原本 fear == 2、一次性要加 2 个：第 1 个被取消，第 2 个仍然发出声音。
 *  - **即使这次增加最终没让标记数变化（已在上限），也消耗标记**。
 */
export function addFear(state: GameState, targetId: string, amount: number) {
  if (!state.rules.enableFear) return;
  const target = actor(state, targetId);
  if (!target.alive || target.faction !== 'survivor') return;
  const tokenMax = 2;
  for (let i = 0; i < amount; i++) {
    /**
     * 鼓励标记：这一次「增加恐惧」被取消（含本应变成声音的那种）。
     * 每次调用最多消耗一次（用掉就没了）。
     */
    if (target.encourageToken) {
      target.encourageToken = false;
      log(
        state,
        `${target.name} 的鼓励标记自动生效：取消这次恐惧增加。`,
        'all',
        true,
      );
      continue;
    }
    if (target.fear < tokenMax) {
      target.fear += 1;
      log(state, `${target.name} 获得恐惧标记（${target.fear}/${tokenMax}）。`);
    } else {
      target.overFear = true;
      /**
       * 惊吓过度的响声要报成「谁在哪里因惊吓过度发出了声音」——
       * 所以让 pushNoise 闭嘴，由这里写那一条（不重复报）。
       *
       * 【变体1】特性 16：**惊吓过度**属于"其他来源" —— 距离杀手 1 以内时这声响也被压住
       * （用户点名的例子之一）。
       */
      if (target.roomId) pushNoise(state, target.roomId, true, { byPlayerId: target.id });
      log(
        state,
        `${target.name} 在「${roomName(state, target.roomId)}」因惊吓过度发出了声音。`,
        'all',
        true,
      );
      onSurvivorOverFear?.(state, target.id);
    }
  }
}

/**
 * 「这名幸存者有没有**守護之石**」（墓穴遗物，角标 ∞）的判定（由 engine 注入）。
 *
 * `effects.ts` 不认识墓穴的遗物规则，只要知道"这次伤害能不能被他挡住"。
 * 走注入是为了避免 `effects.ts` ↔ `relic.ts` 循环依赖。
 */
let hasGuardStone: ((p: PlayerState) => boolean) | null = null;

export function setGuardStoneChecker(fn: (p: PlayerState) => boolean): void {
  hasGuardStone = fn;
}

/**
 * 造成伤害。满血变受伤，已受伤就死亡（杀手立刻胜）。
 *
 * **免伤询问**（用户口径的顺序）：
 *  1. **非遭遇**的伤害：**先问古代护符**；护符出示了就免伤，不问了；
 *     护符**放弃**才接着问守護之石。
 *  2. **遭遇中**的伤害：护符"遭遇里一律不能出示"，所以只问守護之石
 *     （墓穴遗物，连"不经攻击防御流程的直接伤害"也能挡，例如杀手 5 级效果）。
 *  3. 迪伦「坚毅」：不询问、强制生效，在下面单独处理。
 *
 * ⚠ 改这一条之前是"守護之石 > 护符"（有守护之石就永远轮不到护符）——
 * 用户要求反过来：「先询问古代护符再询问守护之石，用了第一个就不用问第二个」。
 */
export function applyDamage(
  state: GameState,
  targetId: string,
  amount: number,
  sourceId: string,
  opts?: {
    eliminate?: boolean;
    /** 跳过**全部**免伤询问（护符和守護之石都不问） */
    skipAmulet?: boolean;
    /** 护符已经问过、并且被放弃了 → 这次只问守護之石 */
    amuletDeclined?: boolean;
    skipResilience?: boolean;
  },
): void {
  const target = actor(state, targetId);
  if (!target.alive || target.faction !== 'survivor') return;
  if (!opts?.eliminate && !opts?.skipAmulet && amount > 0) {
    if (!opts?.amuletDeclined && state.phase !== 'encounter' && (target.items.amulet ?? 0) > 0) {
      state.pendingAmulet = { playerId: targetId, amount, sourceId, relic: null };
      log(state, `${target.name} 可以出示古代护符来防止这次伤害。`, 'survivor');
      return;
    }
    if (hasGuardStone?.(target)) {
      state.pendingAmulet = { playerId: targetId, amount, sourceId, relic: 'guard' };
      log(state, `${target.name} 可以出示遗物「守護之石」来防止这次伤害。`, 'survivor');
      return;
    }
  }
  /**
   * 迪伦·温「坚毅」：开局有一个**坚毅标记**，**第一次即将受伤时直接使用**。
   *
   * ⚠ 与古代护符不同：
   *  - 护符要先问一句（`pendingAmulet`），而且**遭遇里不能出示**
   *  - 坚毅是**不询问、强制生效**的免伤标记，**任何伤害都算**
   *    （包括遭遇里的——以前这里有个 `state.phase !== 'encounter'` 的限制，
   *     导致用户报的"坚毅标记没有效果"）
   */
  if (
    !opts?.eliminate &&
    !opts?.skipResilience &&
    target.resilienceToken &&
    amount > 0
  ) {
    target.resilienceToken = false;
    log(state, `${target.name} 的坚毅标记自动生效，防止了这次伤害。`, 'all', true);
    return;
  }
  target.hp = Math.max(0, target.hp - amount);
  log(state, `${target.name} 受到 ${amount} 点伤害（生命 ${target.hp}/${target.maxHp}）。`);
  /** 【变体1】杀手特性 11「恐惧迸发」等要靠这个"打中了"的时机（带上来源） */
  onSurvivorDamaged?.(state, targetId, sourceId);
  if (target.hp <= 0) {
    target.alive = false;
    /**
     * 【分头行动】被杀的人**立绘留在原地变暗**（用户规则），所以 `roomId` **不清空** ——
     * 他的钥匙和物品就留在那个地点，同地点的人可以从"遗留物"里拿。
     * 其他模式下倒下就离场，照旧清空位置。
     */
    if (!state.split)
      target.roomId = null;
    log(state, `${target.name} 倒下了！`);
    /** 倒下时清理挂在他身上的标记（女王的中毒标记等） */
    onSurvivorDown?.(state, targetId);
    /**
     * 【分头行动】不再"杀一个就结束"（用户规则：**全员逃脱或被杀死才结束**，
     * 而且杀手每杀一人升一级）—— 收尾判定交给 `checkSplitEnd`。
     */
    if (!state.split && state.rules.killerWinsOnAnyKill) {
      state.winner = 'killer';
      state.winReason = `${actor(state, sourceId).name} 击杀了一名幸存者。`;
      state.phase = 'gameOver';
    }
  }
}

/**
 * 治疗：血量加回去，但不能超过上限。距离由 assertHealSameRoom 先检查。
 *
 * `clearsFear`：这次治疗的手段本身能消除恐惧（目前只有马尔科的医药包）。
 * 那时**「有恐惧」也算一个合法目标**，即使目标满血、没中毒 ——
 * 医药包的价值就在于消掉那枚恐惧。草药没这条，所以默认 false。
 */
export function applyHeal(
  state: GameState,
  targetId: string,
  amount: number,
  clearsFear = false,
): void {
  const target = actor(state, targetId);
  if (!target.alive || target.faction !== 'survivor') {
    throw new Error('治疗目标无效');
  }
  /**
   * 满血也允许治疗 —— 女王规则：「已中毒的人可以被治疗（即使是健康状态）」。
   * 满血时治疗量不起作用，但外面的流程会移除中毒标记 / 恐惧。
   * 这里只要求「受伤**或**中毒**或**（能消恐惧时）有恐惧」至少占一样。
   */
  const isPoisoned = (state.poisoned ?? []).includes(targetId);
  if (target.hp >= target.maxHp && !isPoisoned && !(clearsFear && target.fear > 0)) {
    throw new Error(
      clearsFear
        ? `${target.name} 未受伤、没有中毒也没有恐惧，不能治疗`
        : `${target.name} 未受伤也没有中毒，不能治疗`,
    );
  }
  if (target.hp < target.maxHp) {
    target.hp = Math.min(target.maxHp, target.hp + amount);
    /** 治疗是**幸存者自己的行为**：幸存者大回合里对杀手隐藏 */
    log(state, `${target.name} 恢复生命至 ${target.hp}/${target.maxHp}。`, 'survivor');
  }
}

export type HealItemDef = { amount: number; consume: boolean; noiseAtUser: boolean; clearFear?: boolean };

export const HEAL_ITEMS: Record<string, HealItemDef> = {
  herb: { amount: 1, consume: true, noiseAtUser: true },
  marco_medkit: { amount: 1, consume: true, noiseAtUser: false, clearFear: true },
};

export function healItemDef(itemId: string): HealItemDef | null {
  return HEAL_ITEMS[itemId] ?? null;
}

/**
 * 房间发出响声。已有标记则跳过。
 *
 * 爆竹回合：判断上「**全场都有响声**」，所以不再记录任何具体响声标记
 * （`state.noises` 保持空），地图上只在杀手位置放一个爆竹标记作为显示。
 * 按响声判定的牌（如狼人【超听觉】）会因为「到处是响声」而原地不动。
 *
 * `quiet` = 调用方自己会写更具体的战报（比如惊吓过度），这里就别再报一条通用的。
 */
/**
 * 这个地点是不是在**任意一名杀手**的距离 `within` 以内（含同地点）。
 *
 * 【变体1】特性 16「高度警觉」要用：条件是"你位于杀手**距离 1 以内**"。
 * 按**普通边**算距离（封堵不挡路、不算杀手专用通道和秘密通道）——
 * 这是给幸存者用的"距离感"，2对3 里取**最近**的那名杀手。
 */
export function withinKillerDistance(
  state: GameState,
  roomId: string,
  within: number,
): boolean {
  const starts = Object.values(state.players)
    .filter((pl) => pl.faction === 'killer' && pl.roomId)
    .map((pl) => pl.roomId as string);
  if (!starts.length) return false;
  const seen = new Set<string>(starts);
  let frontier = [...starts];
  for (let step = 0; step < within; step += 1) {
    const next: string[] = [];
    for (const r of frontier) {
      for (const n of neighborsOpen(state, r, true, false, null)) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return seen.has(roomId);
}

/**
 * 【变体1】这次响声**是怎么来的** —— 决定特性 16「高度警觉」压不压得住。
 *
 * 用户口径：
 *  - `item`（**任何有物品使用过程**的响声）/ `trait`（**特性卡**造成的响声）
 *    → **不受 16 影响**，照常响；
 *  - 其他一律**满足** 16 的条件（修理、搜索、发现、角色技能、
 *    威廉短跑、乔治的笔记、**惊吓过度**、地图机关…）。
 *  - "计划"来源是**变体3** 的东西，现在还没有。
 */
export type NoiseSource = 'item' | 'trait' | 'skill';

/**
 * 这声响声是不是被**特性 16「高度警觉」**压住了。
 *
 * 条件：此人选了 16、且**他所在的地点**在**任意一名杀手**的距离 1 以内
 * （含同地点；2对3 取最近的那名杀手）。压住时**只写幸存者战报** ——
 * 响声根本没发生，杀手本来就不该知道。
 */
function muffleNoiseFor(state: GameState, playerId: string, roomId: string): boolean {
  if (!state.variant1) return false;
  if (!(state.traits?.[playerId] ?? []).includes('trait_s16')) return false;
  return withinKillerDistance(state, roomId, 1);
}

export function pushNoise(
  state: GameState,
  roomId: string,
  quiet = false,
  opts?: {
    /** 谁造成的这次响声（传了才可能被 16 压住） */
    byPlayerId?: string;
    /** 来源；见 `NoiseSource`。不传 = "其他"，满足 16 的条件 */
    source?: NoiseSource;
  },
): void {
  // 爆竹回合：全场都有响声，不记录具体位置
  if (state.firecrackerThisRound) return;
  if (!roomId) return;
  /**
   * 【变体1】特性 16：**非物品、非特性**来源的响声，在"持有人位于杀手距离 1 以内"时不响。
   */
  const holder = opts?.byPlayerId;
  if (
    holder &&
    opts?.source !== 'item' &&
    opts?.source !== 'trait' &&
    muffleNoiseFor(state, holder, roomId)
  ) {
    log(
      state,
      `${state.players[holder]?.name ?? '幸存者'}「高度警觉」：` +
        `「${roomName(state, roomId)}」的响声被压住了。`,
      'survivor',
    );
    return;
  }
  if (state.noises.includes(roomId)) return;
  state.noises.push(roomId);
  /**
   * **响声不立即告诉杀手**：幸存者大回合里杀手要到响声阶段才一次看到全部
   * （地图上的响声标记同理，见 `buildSnapshot` 的 `visibleNoises`）。
   *
   * 唯一的例外是**惊吓过度发出的响声** —— 那一条由 `addFear` 单独写成公开战报。
   */
  if (!quiet) log(state, `响声出现在「${roomName(state, roomId)}」。`, 'survivor');
}

export function removableBlockades(state: GameState): string[] {
  const locked = new Set(state.blockadesThisAction ?? []);
  return state.blockades.filter((id) => !locked.has(id));
}

/** 只负责落到一扇门上。槽位不够时返回 full，由封堵任务先移除场上的块，不再「挪」旧封堵。 */
export function tryPlaceBlockadeDoor(state: GameState, doorId: string): 'ok' | 'skip' | 'full' {
  if (!state.rules.enableBlockades) return 'skip';
  /**
   * 统一门号写法（房号排序后用 | 拼）再存。
   * 否则 "R1|B1" 和 "B1|R1" 会被当成两扇不同的门 ——
   * 最典型的后果：杀手走过已封堵的门时拆不掉它（查的是规范写法，存的却是另一种写法）。
   */
  const id = canonicalDoorId(doorId);
  if (isDoorBlocked(state, id)) return 'skip';
  /**
   * **机关大门上不能封堵**（用户口径："机关大门不能放在有封堵的位置" ——
   * 两者不能共存）。这里是最底层的落点守卫，所有封堵路径最后都会走到它。
   */
  if (isLeverGateDoor(state, id)) {
    log(state, '那扇门上是机关大门，不能封堵（要先让杀手把大门拆掉）。');
    return 'skip';
  }
  const max = state.rules.blockadeTokenMax;
  if (state.blockades.length >= max) return 'full';
  state.blockades.push(id);
  if (!state.blockadesThisAction) state.blockadesThisAction = [];
  state.blockadesThisAction.push(id);
  const pair = parseDoor(id);
  log(
    state,
    pair
      ? `封堵「${roomName(state, pair[0])}」与「${roomName(state, pair[1])}」之间的门（${state.blockades.length}/${max}）。`
      : `封堵 ${id}（${state.blockades.length}/${max}）。`,
  );
  return 'ok';
}

export function continueSealQueue(state: GameState): boolean {
  if (!state.pendingSealQueue) state.pendingSealQueue = [];
  while (state.pendingSealQueue.length) {
    const id = state.pendingSealQueue[0]!;
    const r = tryPlaceBlockadeDoor(state, id);
    if (r === 'full') return true;
    state.pendingSealQueue.shift();
  }
  finishSealAllIfDone(state);
  return false;
}

function finishSealAllIfDone(state: GameState) {
  if (state.pendingBlockadePlace || (state.pendingSealQueue?.length ?? 0) > 0) return;
  const roomId = state.sealAllRoomId;
  if (!roomId) return;
  state.sealAllRoomId = null;
  const left = unblockedDoorsAt(state, roomId);
  log(
    state,
    left.length === 0
      ? `已封堵所在地全部门（场上 ${state.blockades.length}/${state.rules.blockadeTokenMax}）。`
      : `封堵未完成，所在地仍有 ${left.length} 扇门未封（场上 ${state.blockades.length}/${state.rules.blockadeTokenMax}）。`,
  );
}


/** 在一扇门上放封堵。槽位必须事先够；不够时走封堵任务先移除。 */
export function placeBlockade(state: GameState, doorOrRoom: string, otherRoom?: string) {
  if (!state.rules.enableBlockades) return;
  let id = doorOrRoom;
  if (otherRoom) {
    const edge = state.map.edges.find(
      (e) =>
        isDoorEdge(e.pathType) &&
        ((e.from === doorOrRoom && e.to === otherRoom) || (e.to === doorOrRoom && e.from === otherRoom)),
    );
    if (!edge) {
      log(state, `「${roomName(state, doorOrRoom)}」与「${roomName(state, otherRoom)}」之间没有可封的门。`);
      return;
    }
    id = doorId(doorOrRoom, otherRoom);
  } else if (!parseDoor(doorOrRoom)) {
    if (unblockedDoorsAt(state, doorOrRoom).length === 0) {
      throw new Error(
        doorsAt(state, doorOrRoom).length
          ? '这里的门都已封堵，无法再设障'
          : '所在地点没有门，无法使用封堵牌',
      );
    }
    state.pendingBlockade = true;
    log(state, `请点击一扇与「${roomName(state, doorOrRoom)}」相连的门进行封堵。`);
    return;
  }
  const placed = tryPlaceBlockadeDoor(state, id);
  state.pendingBlockade = false;
  if (placed === 'full') {
    log(state, '可放置封堵不足，请先按提示移除场上封堵。');
  }
}

/** @returns true if waiting for the player to relocate a blockade */
export function placeAllDoorsAt(state: GameState, roomId: string): boolean {
  state.sealAllRoomId = roomId;
  state.pendingSealQueue = doorsAt(state, roomId)
    .filter((d) => !isDoorBlocked(state, d.id))
    .map((d) => d.id);
  return continueSealQueue(state);
}

/**
 * 拆掉一块封堵。
 *
 * @param doorOrRoom 规范门号（"A|B"）或地点 id（拆该地点上任意一块）
 * @param actorId **谁拆的** —— 传入后战报会写明「**谁**在**哪里**移除了封堵」。
 *   用户对【分头行动】的明确要求：「移除封堵要公开是谁在哪移除」，
 *   所以这里对双方可见（`'all'`）—— 拆封堵本来就是公开事件。
 */
export function removeBlockade(state: GameState, doorOrRoom: string, actorId?: string) {
  /**
   * 按「规范化门号」找，而不是字符串全等：
   * "R1|B1" 与 "B1|R1" 是同一扇门，旧存档里可能存的是没排序的那种写法。
   */
  const canonical = canonicalDoorId(doorOrRoom);
  const hit = state.blockades.find((id) => canonicalDoorId(id) === canonical);
  if (hit) {
    state.blockades.splice(state.blockades.indexOf(hit), 1);
    const pair = parseDoor(hit);
    /**
     * **立即向双方报告**（用户明确列的 4 类之一）：拆封堵是公开事件。
     * 其他幸存者行为（移动/搜索/修理…）在幸存者大回合里对杀手是隐藏的。
     */
    log(state, blockadeRemovedText(state, pair, actorId), 'all', true);
    return true;
  }
  // 传入的是房间号：拆该房间上任意一块封堵
  const byRoom = state.blockades.find((id) => {
    const p = parseDoor(id);
    return p && (p[0] === doorOrRoom || p[1] === doorOrRoom);
  });
  if (!byRoom) return false;
  state.blockades.splice(state.blockades.indexOf(byRoom), 1);
  const pair = parseDoor(byRoom);
  /** 同 `removeBlockade`：拆封堵**立即向双方报告** */
  log(state, blockadeRemovedText(state, pair, actorId), 'all', true);
  return true;
}

/** 拆封堵的战报文本：带上"谁 + 在哪" */
function blockadeRemovedText(
  state: GameState,
  pair: [string, string] | null,
  actorId?: string,
): string {
  const who = actorId ? state.players[actorId]?.name : null;
  const where = pair
    ? `「${roomName(state, pair[0])}」–「${roomName(state, pair[1])}」`
    : '';
  if (who) return `${who} 移除了${where}的封堵。`;
  return `移除了${where}的封堵。`;
}

/** 按顺序执行一串小动作（摸牌、加物品、响声……） */
export function runEffects(ctx: EffectContext): void {
  const { state, actorId } = ctx;
  const p = actor(state, actorId);
  ctx.out = ctx.out ?? {};

  for (const fx of ctx.effects) {
    applyOne(state, p, fx, ctx);
    if (state.phase === 'gameOver') return;
  }
}

/** 执行一条小动作：gainItem、noise、heal……按 op 名字分岔 */
function applyOne(state: GameState, p: PlayerState, fx: EffectDef, ctx: EffectContext): void {
  switch (fx.op) {
    case 'move': {
      const range = typeof fx.value === 'number' ? fx.value : 1;
      state.pendingMoveRange = range;
      if (ctx.targetRoomId) {
        tryMove(state, p.id, ctx.targetRoomId, range);
        state.pendingMoveRange = null;
      }
      break;
    }
    case 'search':
      doSearch(state, p.id);
      break;
    case 'searchSurvivors': {
      const here = p.roomId;
      if (!here) break;
      const victims = Object.values(state.players).filter(
        (x) => x.faction === 'survivor' && x.alive && x.roomId === here,
      );
      setStealth(p, false);
      if (victims.length === 0) {
        log(state, `${p.name} 搜索房间，没有发现人。`);
      } else {
        log(state, `${p.name} 发现了 ${victims.length} 名幸存者！`);
      }
      break;
    }
    case 'repair': {
      const amount = typeof fx.value === 'number' ? fx.value : 1;
      const before = state.repairProgress;
      addRepairProgress(state, amount);
      log(state, `无线电修理进度 ${state.repairProgress}/${state.rules.repairNeeded}。`);
      announceRepairIfJustFinished(state, before);
      maybeArmRescue(state);
      /** 【变体1】特性 16「高度警觉」：修理算"其他来源"，距离杀手 1 以内时响声被压住 */
      if (state.rules.repairMakesNoise && p.roomId)
        pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'skill' });
      break;
    }
    case 'noise': {
      const room = fx.at === 'target' && ctx.targetRoomId ? ctx.targetRoomId : p.roomId;
      /**
       * 【变体1】特性 16：技能/笔记造成的响声算"其他来源"——
       * 用户点名的就有**威廉短跑**（`sprint`）和**乔治的笔记**，
       * 内容里 `noise` 这个 op 也只有这两处用，所以一律按 `'skill'` 记。
       */
      if (room) pushNoise(state, room, false, { byPlayerId: p.id, source: 'skill' });
      break;
    }
    case 'stealth':
      setStealth(p, Boolean(fx.value ?? true));
      log(
        state,
        p.stealth
          ? `${p.name}在${roomName(state, p.roomId)}进入潜行。`
          : `${p.name} 解除潜行。`,
      );
      break;
    case 'reveal':
      setStealth(p, false);
      log(state, `${p.name} 重现。`);
      break;
    case 'damage': {
      const amount = typeof fx.value === 'number' ? fx.value : 1;
      if (ctx.targetPlayerId) applyDamage(state, ctx.targetPlayerId, amount + p.attackBonus, p.id);
      break;
    }
    case 'heal': {
      const amount = typeof fx.value === 'number' ? fx.value : 1;
      const tid = ctx.targetPlayerId ?? p.id;
      assertHealSameRoom(state, p.id, tid);
      applyHeal(state, tid, amount);
      break;
    }
    case 'gainItem': {
      const itemId = fx.itemId ?? 'item';
      const amount = fx.amount ?? 1;
      if (itemId === 'key') {
        /**
         * ⚠ 「分头行动」：钥匙**单独保管**（记在人身上），不上架、不写公开战报，
         * 但**响声照旧**（响声在摸牌那一步已经发过了）。
         */
        const added = addKeys(state, amount, p.id);
        log(
          state,
          state.split
            ? `${p.name} 获得 ${added} 把钥匙（单独保管，共 ${p.keys ?? 0} 把）。`
            : added > 0
              ? `钥匙放入钥匙架（${state.keysCollected}/${state.rules.keysNeeded}）。`
              : `钥匙架已有 ${state.keysCollected}/${state.rules.keysNeeded} 把，多出来的钥匙不再上架。`,
          'survivor',
        );
      } else {
        p.items[itemId] = (p.items[itemId] ?? 0) + amount;
        log(state, `${p.name} 获得 ${amount}×${itemName(itemId)}。`, 'survivor');
        enforceInventory(state, p.id);
      }
      break;
    }
    case 'waitRescue':
      maybeArmRescue(state);
      break;
    case 'modifyMoveRange':
      if (typeof fx.value === 'number') p.moveBonus += fx.value;
      break;
    case 'modifyAttackDamage':
      if (typeof fx.value === 'number') p.attackBonus += fx.value;
      break;
    case 'quietSearch':
      p.quietSearch = Boolean(fx.value ?? true);
      log(state, `${p.name} 准备静默搜索物资。`);
      break;
    case 'addFear': {
      const amount = typeof fx.value === 'number' ? fx.value : 1;
      if (p.faction === 'survivor') addFear(state, p.id, amount);
      else {
        for (const s of Object.values(state.players)) {
          if (s.faction === 'survivor' && s.alive) addFear(state, s.id, amount);
        }
      }
      break;
    }
    case 'clearFear':
      p.fear = 0;
      p.overFear = false;
      /** 消除恐惧是**幸存者自己的行为**：幸存者大回合里对杀手隐藏 */
      log(state, `${p.name} 消除恐惧。`, 'survivor');
      break;
    case 'placeBlockade':
      if (p.roomId) {
        if (ctx.targetRoomId) placeBlockade(state, p.roomId, ctx.targetRoomId);
        else placeBlockade(state, p.roomId);
      }
      break;
    case 'placeBlockadeAll':
      if (p.roomId) placeAllDoorsAt(state, p.roomId);
      break;
    case 'removeBlockade':
      if (p.roomId) removeBlockade(state, p.roomId, p.id);
      break;
    case 'expose':
      p.exposed = true;
      log(state, `${p.name} 位置暴露！`);
      break;
    case 'modifyPower':
      // 牌面「本回合 +N 力量」：只加临时力量，回合结束清掉
      if (typeof fx.value === 'number') addKillerTurnPower(state, fx.value);
      break;
    case 'placeToken': {
      if (p.roomId && (fx.tokenId === 'trap' || fx.itemId === 'trap')) {
        if (!state.trapRoomIds.includes(p.roomId)) state.trapRoomIds.push(p.roomId);
        log(state, `${p.name} 在「${roomName(state, p.roomId)}」放置了陷阱。`);
      }
      break;
    }
    case 'attackValue':
      ctx.out!.attackValue = (ctx.out!.attackValue ?? 0) + (typeof fx.value === 'number' ? fx.value : 0);
      break;
    case 'defenseValue':
      ctx.out!.defenseValue =
        (ctx.out!.defenseValue ?? 0) + (typeof fx.value === 'number' ? fx.value : 0);
      break;
    case 'senseAdjacentPair':
      state.pendingSensePair = { firstRoomId: null };
      log(state, '逻辑推理：请先点任意一个地点，再点与它相连的第二个地点（不必与你相邻）。');
      break;
    default:
      break;
  }
}

/**
 * 最短路径（含起点与终点）。`ignoreBlockades` 为杀手移动时用。
 * 导出给 engine 用来判断"这条路径会不会经过机关大门"。
 */
export function pathRooms(
  state: GameState,
  from: string,
  to: string,
  ignoreBlockades: boolean,
  allowKiller = false,
  /** 传玩家 id：这个人若是未命名 1 级起，寻路允许穿秘密通道（见 `neighborsOpen`） */
  passagesFor: string | null = null,
): string[] | null {  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighborsOpen(state, cur, ignoreBlockades, allowKiller, passagesFor)) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [to];
        let w: string | null = cur;
        while (w) {
          path.push(w);
          w = prev.get(w) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

/**
 * 枚举 from→to 的**所有最短路径**（最多 limit 条）。
 * 用于「有多条最快路径时让杀手自己选」。
 * 允许杀手走密道由 `allowKiller` 决定。
 */
export function allShortestPaths(
  state: GameState,
  from: string,
  to: string,
  allowKiller: boolean,
  limit = 8,
): string[][] {
  if (from === to) return [[from]];
  // 先 BFS 求距离
  const dist = new Map<string, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const n of neighborsOpen(state, cur, true, allowKiller)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  if (!dist.has(to)) return [];
  const target = dist.get(to)!;
  const out: string[][] = [];
  const walk = (cur: string, path: string[]) => {
    if (out.length >= limit) return;
    if (cur === to) {
      out.push([...path]);
      return;
    }
    // 只走「距离更近」的邻居，保证是最短路径
    for (const n of neighborsOpen(state, cur, true, allowKiller)) {
      const dn = dist.get(n);
      if (dn == null || dn !== dist.get(cur)! + 1) continue;
      path.push(n);
      walk(n, path);
      path.pop();
    }
  };
  void target;
  walk(from, [from]);
  return out;
}

/** 尝试把棋子走到 toRoomId。步数不够、被封堵（幸存者）或房间不存在就失败 */
export function tryMove(
  state: GameState,
  playerId: string,
  toRoomId: string,
  maxRange: number,
  minRange = 0,
): boolean {
  const p = actor(state, playerId);
  if (!p.roomId || !p.alive) return false;
  if (!state.map.rooms.some((r) => r.id === toRoomId)) return false;
  /** 坍塌掉的地点不存在，谁都进不去 */
  if (isRoomGone(state, toRoomId)) return false;
  /**
   * 注意：**不**拦截"起点已经塌了"的情况 —— 坍塌后屋里的人正要被赶出去，
   * 那一瞬间他们的 `roomId` 还指着废墟，必须允许他们走出去。
   */

  if (toRoomId === p.roomId) {
    if (minRange > 0) return false;
    state.lastMovePath = [p.roomId];
    state.lastMoveCrossedBlockade = false;
    log(state, `${p.name} 留在「${roomName(state, p.roomId)}」。`, p.faction === 'killer' ? 'all' : 'survivor');
    return true;
  }

  const killerBypass = p.faction === 'killer';
  /**
   * 【未命名 1 级】「你可以〔移動〕通过秘密通道」——
   * **只有杀手本人的移动**才算这条，所以只在这里（`tryMove`）传玩家 id。
   * 感知距离 / 惊吓距离那些走的是 `mapDist`，压根不经过这个参数。
   */
  const path = pathRooms(state, p.roomId, toRoomId, killerBypass, killerBypass, p.faction === 'killer' ? p.id : null);
  const dist = path ? path.length - 1 : Infinity;
  if (!path || dist > maxRange || dist < minRange) return false;
  /**
   * **机关大门**（城堡 R1 的控制杆）：
   *  - **幸存者绝对不能通过** —— 直接判定不可移动
   *  - 杀手要**弃 3 张手牌**才能过：那一步由 engine 在调 `tryMove` **之前**拦下来
   *    （潜行时直接拒），所以这里只管"幸存者过不去"。
   */
  if (p.faction === 'survivor') {
    for (let i = 1; i < path.length; i += 1) {
      if (isLeverGateDoor(state, doorId(path[i - 1]!, path[i]!))) return false;
    }
  }

  let crossed = false;
  if (p.faction === 'killer') {
    for (let i = 0; i < path.length - 1; i++) {
      const id = doorId(path[i]!, path[i + 1]!);
      // 用规范门号判定（地图边序可能给出另一种写法）
      if (isDoorBlocked(state, id)) {
        crossed = true;
        // 潜行穿过封堵不拆；平时走过才拆
        if (!p.stealth) removeBlockade(state, id, p.id);
      }
    }
  }
  p.roomId = toRoomId;
  state.lastMovePath = path;
  state.lastMoveCrossedBlockade = crossed;

  /**
   * 记录「本回合移动通过了秘密通道」，并发放 **保護色** 的 +N 力量。
   * 加成类型与清除时机同「疯狂」「谋杀者 2 级」——都走 killerTurnPowerBonus，
   * 在杀手回合收尾时清零。
   *
   * ⚠ **「秘密通道」只认 `map.passages`**（地图上标的那种，也是未命名 1 级
   * 「可以〔移動〕通过秘密通道」走的那种）。
   *
   * ⚠ **杀手密道（`edges` 里 `pathType: 'killer'` 的边）是完全另一回事，
   * 不算秘密通道** —— 以前这里判的就是杀手密道，属于用错了对象：
   * 城堡/豪宅根本没有杀手密道边（永远判不出来），而真正走秘密通道时
   * `path` 里那一步不在 `edges` 里（`passages` 是独立数组），也判不出来。
   */
  if (p.faction === 'killer' && path.length > 1) {
    const passages = state.map.passages ?? [];
    const usedPassage = path.some((_, i) => {
      if (i === 0) return false;
      const a = path[i - 1]!;
      const b = path[i]!;
      return passages.some(
        (e) =>
          (e.from === a && e.to === b) ||
          ((e.bidirectional ?? true) && e.from === b && e.to === a),
      );
    });
    if (usedPassage) {
      state.movedThroughPassageThisTurn = true;
      const bonus = state.passagePowerBonus ?? 0;
      if (bonus > 0) {
        addKillerTurnPower(state, bonus);
        log(state, `保護色：移动通过秘密通道，本回合 +${bonus} 力量。`, 'killer');
      }
    }
  }

  if (p.faction === 'killer' && p.stealth) {
    log(state, `${p.name} 在潜行中移动。`, 'killer');
  } else {
    log(
      state,
      `${p.name} 移动到「${roomName(state, toRoomId)}」。`,
      p.faction === 'killer' ? 'all' : 'survivor',
    );
  }
  /**
   * 女猎手猎手陷阱：**任何原因进入**陷阱所在地点都会触发（经过也算）。
   * 放在这里而不是调用点，是为了让所有移动路径（一般行动、卡牌、额外行动、被推）
   * 都统一走一遍判定。
   */
  if (p.faction === 'survivor') triggerHunterTrapOnEnter(state, p);
  /**
   * **地图特殊规则**的"进入地点"触发（实验室 R4 响声 / 城堡 B4 首次惊吓）。
   * 同样挂在这里，保证所有移动路径都覆盖到。
   * 由 engine 注入，避免 effects ↔ mapEffects 成环。
   */
  if (p.faction === 'survivor') onSurvivorEnterRoom?.(state, p, toRoomId);
  return true;
}

/**
 * 「幸存者因移动进入某地点」的回调（由 engine 注入 `mapEffects.onSurvivorEnterRoom`）。
 * 走注入是为了避免 `effects.ts` ↔ `mapEffects.ts` 循环依赖。
 */
let onSurvivorEnterRoom: ((state: GameState, p: PlayerState, roomId: string) => void) | null = null;

export function setSurvivorEnterRoomHandler(
  fn: (state: GameState, p: PlayerState, roomId: string) => void,
): void {
  onSurvivorEnterRoom = fn;
}

/**
 * 「这扇门是不是机关大门」的判定（由 engine 注入）。
 * `effects.ts` 不认识地图特殊规则，只要知道**这扇门现在过不过得去**。
 */
let leverGateChecker: ((state: GameState, door: string) => boolean) | null = null;

export function setLeverGateChecker(fn: (state: GameState, door: string) => boolean): void {
  leverGateChecker = fn;
}

/** 这扇门现在是不是机关大门（没注入就一律 false） */
export function isLeverGateDoor(state: GameState, door: string): boolean {
  return leverGateChecker ? leverGateChecker(state, door) : false;
}

/**
 * **幸存者按玩家选好的路径一格一格走**，中途踩到陷阱就停下。
 *
 * 规则：幸存者**任何时候进入陷阱所在地点都会触发**；如果只是**经过**捕网陷阱，
 * 他会**停在陷阱处**（捕网把他放倒，本回合不能离开）。
 *
 * 所以不能再用一次 `tryMove(全程)` —— 那样会直接跳到终点，
 * 中途踩到捕网也不会停。这里逐格 `tryMove(...,1,1)`，
 * 每走完一格就查 `netLockedRoom`：一旦被网住就**停止继续走**。
 *
 * ⚠ 中途某一步非法时会**把人退回 `startRoom`** 再返回 `ok:false` ——
 * 调用方看到 `ok:false` 就该抛错，不能留下"走了一半"的状态。
 * （要撤回 `startRoom`，所以起点必须由调用方传进来，不能读 `p.roomId`，
 *   因为 `p.roomId` 在逐格走的过程中一直在变。）
 *
 * @returns ok=false 表示整条路径没走完（某步非法，已回滚）；
 *          stoppedAt 非空表示被陷阱拦住、停在了那个地点。
 */
export function walkSurvivorPath(
  state: GameState,
  playerId: string,
  startRoom: string,
  path: string[],
): { ok: boolean; stoppedAt: string | null } {
  const p = state.players[playerId];
  if (!p?.alive || path.length < 2) return { ok: false, stoppedAt: null };
  if (path[0] !== startRoom) return { ok: false, stoppedAt: null };
  const finalRoom = path[path.length - 1]!;
  for (let i = 1; i < path.length; i++) {
    const stepOk = tryMove(state, playerId, path[i]!, 1, 1);
    if (!stepOk) {
      p.roomId = startRoom;
      return { ok: false, stoppedAt: null };
    }
    /** 被捕网放倒：停在这里，剩下几步不走了 */
    const locked = netLockedRoom(state, playerId);
    if (locked) {
      if (locked !== finalRoom) {
        log(
          state,
          `${p.name} 被「${roomName(state, locked)}」的捕网陷阱拦下，停在原地，无法继续移动。`,
          'all',
          true,
        );
      }
      return { ok: true, stoppedAt: locked };
    }
  }
  return { ok: true, stoppedAt: null };
}

export function legalMoveRooms(
  state: GameState,
  playerId: string,
  range: number,
  minRange = 0,
): string[] {
  const p = state.players[playerId];
  if (!p?.roomId) return [];
  const ignore = p.faction === 'killer';
  const dist = new Map<string, number>([[p.roomId, 0]]);
  const q: string[] = [p.roomId];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    if (d >= range) continue;
    /**
     * 「可走的地点」必须和 `tryMove` 同口径 —— 否则会出现
     * 「服务端允许走、但客户端没得点」的反向死锁：
     * **未命名 1 级起，杀手本人**的可走列表要把秘密通道算进去。
     */
    for (const n of neighborsOpen(state, cur, ignore, ignore, ignore ? p.id : null)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  const out: string[] = [];
  for (const [id, d] of dist) {
    if (d >= minRange && d <= range) out.push(id);
  }
  return out;
}

export function legalBlockadeRooms(state: GameState, playerId: string): string[] {
  const p = state.players[playerId];
  if (!p?.roomId) return [];
  return unblockedDoorsAt(state, p.roomId).map((d) => d.other);
}

/**
 * 地图距离：**默认不含杀手专用通道**（`allowKiller = false`）。
 *
 * 规则：杀手密道只在「杀手本人在移动」时才计入。
 * 其他任何用途（恐惧范围、感知范围、追蹤距离、僵尸距离、核心标记相邻……）
 * 都按普通路径算，**不**把密道当相邻。
 * 只有杀手自己的移动/寻路才显式传 `true`。
 */
export function mapDist(
  state: GameState,
  from: string,
  to: string,
  allowKiller = false,
): number {
  if (from === to) return 0;
  const dist = new Map<string, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const n of neighborsOpen(state, cur, true, allowKiller)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return dist.get(to) ?? Infinity;
}

export function mapAdjacentRooms(map: MapDef, from: string): string[] {
  return generalAdjacentRooms(map, from);
}

/**
 * 〔感知〕若干个地点。命中的幸存者会被标记 exposed。
 *
 * **返回被感知到的幸存者**（不在这里处理女王等级 2 的〔惊吓〕，
 * 由调用方调 `queenSenseFear` —— 避免 effects → evolution 的模块循环）。
 */
export function senseRooms(state: GameState, roomIds: string[]): PlayerState[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const hit: PlayerState[] = [];
  for (const roomId of roomIds) {
    const found = survivorsInRoom(state, roomId).filter((s) => {
      const ch = state.characters.find((c) => c.id === s.characterId);
      if (ch?.skills.some((sk) => sk.id === 'low_profile' || sk.name.includes('低调'))) return false;
      return !/安娜|anna|survivor1/i.test(`${s.characterId ?? ''} ${ch?.name ?? ''} ${s.name}`);
    });
    for (const s of found) {
      s.exposed = true;
      hit.push(s);
      if (!seen.has(s.id)) {
        seen.add(s.id);
        names.push(s.name);
      }
    }
  }
  const place = roomIds.map((id) => roomName(state, id)).join('与');
  log(
    state,
    names.length
      ? `${place}感知到了${names.join('、')}`
      : `${place}没有感知到人。`,
  );
  return hit;
}

/** 在搜索点抽 1 张。杀手搜到人会记 lastSearchFound，幸存者抽到钥匙就上架 */
/**
 * 摸到的那张牌怎么结算（搜索 / 第六感 共用）。
 * `noisy` 由调用方决定 —— 第六感「返回牌库顶」的那张不触发警报。
 */
export function resolveSearchedCard(
  state: GameState,
  playerId: string,
  cardId: string,
  roomId: string | null,
  opts: { noisy: boolean },
): void {
  const p = actor(state, playerId);
  const card = state.cardById[cardId];
  /**
   * **搜索到什么一律只给幸存者看**（连钥匙也一样 ——
   * 杀手不该从战报里知道幸存者摸到了钥匙）。
   * 「钥匙上架」是公开信息，但那是进度，不是"谁摸到的"。
   */
  log(state, `${p.name} 找到了：${card?.name ?? cardId}。`, 'survivor');
  if (card && isKeyCard(card)) {
    runEffects({ state, actorId: playerId, effects: card.effects.filter((e) => e.op !== 'noise') });
  } else if (card) {
    const gains = card.effects.filter((e) => e.op === 'gainItem');
    if (gains.length) runEffects({ state, actorId: playerId, effects: gains });
    else {
      runEffects({
        state,
        actorId: playerId,
        effects: card.effects.filter((e) => e.op !== 'noise'),
      });
      discardUniqueCard(state, cardId, 'search');
    }
  } else {
    discardUniqueCard(state, cardId, 'search');
  }
  /** 【变体1】特性 16「高度警觉」：搜索算"其他来源"，距离杀手 1 以内时响声被压住 */
  if (opts.noisy && roomId)
    pushNoise(state, roomId, false, { byPlayerId: playerId, source: 'skill' });
}

/**
 * **一次搜索行动摸 N 张**（目前只有墓穴遗物「洞察之球」用：特殊行动，依次摸两张）。
 *
 * 语义是「**依次**」：第一张完全结算完再摸第二张 ——
 * 每张各自判响声、各自可能出钥匙上架（第二张摸到钥匙照样可能直接获胜）。
 * 和 `doSearch` 的区别只有"摸几张"和"不占一般行动"。
 *
 * @returns 实际摸到的牌 id
 */
export function searchDrawMultiple(state: GameState, playerId: string, count: number): string[] {
  const p = actor(state, playerId);
  if (!p.roomId || !p.alive) throw new Error('无法搜索物资');
  if (isRoomGone(state, p.roomId)) throw new Error('这个地点已经坍塌，无法搜索物资');
  const room = state.map.rooms.find((r) => r.id === p.roomId);
  if (!canSearchRoom(state, p, room)) throw new Error('当前地点不能搜索物资');
  if (p.faction === 'survivor' && killerInRoom(state, p.roomId)) {
    throw new Error('与杀手同地（或杀手在此进入潜行）不能搜索物资');
  }
  const drawn: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const cardId = drawSearchCard(state);
    if (!cardId) {
      log(state, '搜索物资：牌库已空。');
      break;
    }
    drawn.push(cardId);
    const card = state.cardById[cardId];
    const noisy = Boolean(card?.makesNoise) && !isCautiousSearcher(state, playerId);
    resolveSearchedCard(state, playerId, cardId, p.roomId, { noisy });
  }
  return drawn;
}

export function doSearch(state: GameState, playerId: string): void {
  const p = actor(state, playerId);
  if (!p.roomId || !p.alive) throw new Error('无法搜索物资');
  /** 坍塌掉的地点已经不存在了，不能搜索 */
  if (isRoomGone(state, p.roomId)) throw new Error('这个地点已经坍塌，无法搜索物资');
  const room = state.map.rooms.find((r) => r.id === p.roomId);
  if (!canSearchRoom(state, p, room)) {
    throw new Error('当前地点不能搜索物资');
  }
  if (p.faction === 'survivor' && killerInRoom(state, p.roomId)) {
    throw new Error('与杀手同地（或杀手在此进入潜行）不能搜索物资');
  }
  if (p.searchedThisTurn) {
    throw new Error('本回合已经搜索过物资了');
  }
  p.searchedThisTurn = true;
  /**
   * 欧菲莉亚「第六感」：搜索时可以摸 2 张，选 1 张留下，
   * 另 1 张放回搜索牌库顶（返回的卡牌不会触发警报）。
   * 这里停下来让玩家选（由 `resolveSixthSense` 收尾）。
   */
  if (sixthSenseActive(state, p)) {
    const a = drawSearchCard(state);
    const b = drawSearchCard(state);
    const cardIds = [a, b].filter(Boolean) as string[];
    p.quietSearch = false;
    if (cardIds.length === 0) {
      log(state, '搜索物资：牌库已空。');
      return;
    }
    if (cardIds.length === 1) {
      const only = cardIds[0]!;
      const card = state.cardById[only];
      const noisy = Boolean(card?.makesNoise) && !isCautiousSearcher(state, playerId);
      resolveSearchedCard(state, playerId, only, p.roomId, { noisy });
      return;
    }
    state.pendingSixthSense = {
      playerId,
      cardIds,
      roomId: p.roomId,
      quiet: isCautiousSearcher(state, playerId),
    };
    log(
      state,
      `第六感：摸到「${cardIds.map((id) => state.cardById[id]?.name ?? id).join('」「')}」，请选 1 张留下，另 1 张放回搜索牌库顶。`,
    );
    return;
  }
  const cardId = drawSearchCard(state);
  if (!cardId) {
    log(state, '搜索物资：牌库已空。');
    p.quietSearch = false;
    return;
  }
  const card = state.cardById[cardId];
  // 安娜「小心谨慎」：她搜索时不发出任何响声，钥匙、工具箱等一律不响。
  // 只影响「搜索」这一个动作；修理、草药、物品使用、翻手提箱照常按牌面响声结算。
  const makeNoise = Boolean(card?.makesNoise) && !isCautiousSearcher(state, playerId);
  p.quietSearch = false;
  resolveSearchedCard(state, playerId, cardId, p.roomId, { noisy: makeNoise });
}

/**
 * 这个幸存者搜索时能不能触发「第六感」（摸 2 选 1）。
 */
export function sixthSenseActive(state: GameState, p: PlayerState): boolean {
  if (p.faction !== 'survivor' || !p.alive) return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  return Boolean(ch?.skills.some((s) => s.id === 'sixth_sense'));
}

/**
 * 这个地点对该幸存者来说能不能搜索。
 * 默认看 `searchable`；凯莱布「神秘狂热粉」让他能在**螺旋**地点搜索。
 */
export function canSearchRoom(
  state: GameState,
  p: PlayerState,
  room: { tags?: string[] } | undefined,
): boolean {
  if (!room?.tags) return false;
  if (room.tags.includes('searchable')) return true;
  if (p.faction !== 'survivor') return false;
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (!ch?.skills.some((s) => s.id === 'cult_fanatic')) return false;
  return room.tags.includes('special-spiral');
}

/**
 * 欧菲莉亚「第六感」收尾：`keepId` 留下，另一张放回搜索牌库顶。
 * 返回的卡牌**不会触发警报**。
 */
export function resolveSixthSense(state: GameState, keepId: string): void {
  const pend = state.pendingSixthSense;
  if (!pend) throw new Error('当前没有第六感待选');
  if (!pend.cardIds.includes(keepId)) throw new Error('这张不是本次摸到的牌');
  state.pendingSixthSense = null;
  const backIds = pend.cardIds.filter((id) => id !== keepId);
  /** 放回牌库顶（按原顺序放回，使牌库稳定） */
  for (const id of [...backIds].reverse()) {
    state.searchDeck.unshift(id);
  }
  if (backIds.length) {
    log(
      state,
      `第六感：把「${backIds.map((id) => state.cardById[id]?.name ?? id).join('、')}」放回搜索牌库顶（不会触发警报）。`,
      survivorActionVis(state),
    );
  }
  const card = state.cardById[keepId];
  const noisy = Boolean(card?.makesNoise) && !pend.quiet;
  resolveSearchedCard(state, pend.playerId, keepId, pend.roomId, { noisy });
}

/** 在修理点 +1 进度（全队每阶段一次），并在这里发出响声 */
export function doRepair(state: GameState, playerId: string): void {
  const p = actor(state, playerId);
  if (!p.roomId || !p.alive) throw new Error('无法修理');
  const room = state.map.rooms.find((r) => r.id === p.roomId);
  if (!room?.tags.includes('repairable')) {
    throw new Error('当前地点不能修理');
  }
  if (state.repairedThisPhase) {
    throw new Error('本阶段已经有人修理过了');
  }
  if (killerInRoom(state, p.roomId)) throw new Error('与杀手同地不能修理');
  const before = state.repairProgress;
  state.repairedThisPhase = true;
  p.repairedThisTurn = true;
  /**
   * 【变体3】**機械藍圖**：「每當放置一個修理標記，你可以額外放置一個修理標記」——
   * 一次修理 = 放一个修理标记，所以这张计划完成后每次修理 **+2**。
   */
  const extraMarker = planImplActive(state, 'extraRepairMarker');
  addRepairProgress(state, extraMarker ? 2 : 1);
  log(
    state,
    `${p.name} 修理无线电（${state.repairProgress}/${state.rules.repairNeeded}）` +
      `${extraMarker ? '——【变体3】機械藍圖：額外放置一個修理標記（+2）' : ''}。`,
    'survivor',
  );
  announceRepairIfJustFinished(state, before);
  maybeArmRescue(state);
  /**
   * 【变体1】特性 16「高度警觉」：修理算"其他来源"，距离杀手 1 以内时响声被压住。
   *
   * 【变体3】**謹慎修理**：「當你使用工具箱修理時，你不會發出響聲」——
   * 这张计划完成后，修理本身的响声整个被压住（和特性 16 各管各的，都是"压住"）。
   */
  if (state.rules.repairMakesNoise && p.roomId && !planImplActive(state, 'repairSilent'))
    pushNoise(state, p.roomId, false, { byPlayerId: p.id, source: 'skill' });
  /**
   * 【分头行动】用户规则：「**修理 +1 抽一张搜索牌**」——
   * 修理完**顺手摸一张搜索牌**，走和搜索完全一样的结算：
   *  - 摸到钥匙照样进"个人保管"（分头行动钥匙不上架）；
   *  - 摸到物品要选留/弃（`resolveSearchedCard` 会弹出选择）；
   *  - 牌面写了有响声就照响（所以放在修理本身的响声**之后**结算）。
   *
   * ⚠ 这只是"顺带的搜索牌"，**不占搜索行动**、也不置 `searchedThisTurn`，
   * 所以本回合他**照样可以去搜索地点正式搜一次**。
   */
  if (state.split) {
    const bonusId = drawSearchCard(state);
    if (!bonusId) {
      log(state, '修理附带的搜索：牌库已空。', 'survivor');
      return;
    }
    const bonusCard = state.cardById[bonusId];
    const bonusNoisy = Boolean(bonusCard?.makesNoise) && !isCautiousSearcher(state, playerId);
    log(state, `${p.name} 修理完顺手抽了一张搜索牌。`, 'survivor');
    resolveSearchedCard(state, playerId, bonusId, p.roomId, { noisy: bonusNoisy });
  }
}

/**
 * 公开站在这格，或潜行是从这格进的：幸存者都不能搜/修。
 *
 * ⚠ **2对3 是例外**：那个模式里杀手与幸存者同格**不影响**搜索与修理。
 * 两名杀手在场时若照旧封锁，幸存者基本做不了事 —— 这是 2对3 的专属规则。
 * 这里统一返回 false，所有调用点（搜索 / 修理 / 乔治技能等）自动跟着走。
 */
export function killerInRoom(state: GameState, roomId: string): boolean {
  if (state.mode === '2v3') return false;
  /**
   * ⚠ **雕像局里没有任何"杀手在场"**（用户口径：「雕像不再阻止搜索和修理 ——
   * 应该所有的雕像都不会影响，**包括主雕像**」「主雕像也不能挡搜索，雕像是个特例」）。
   *
   * 为什么单靠 `statueIndex != null` 那一句不够：雕像局是**在原来的杀手棋子之外**
   * 又建 4 尊雕像（`setupStatues`），而那个原始棋子的 `roomId` 一直停在
   * **杀手起始房间**（墓穴/城堡/实验室 = 隐藏出口）。它代表主雕像的位置，
   * 但按上面的口径**连主雕像都不算在场** —— 于是谁站在那儿就搜不了、修不了
   * （用户报的「1对1、墓穴、杀手是雕像、乔治在 G1 没有显示搜索」）。
   *
   * 所以雕像局里直接为假：这一局所有 killer 阵营棋子都不阻止搜索/修理。
   */
  if ((state.statueIds?.length ?? 0) > 0) return false;
  return Object.values(state.players).some((pl) => {
    if (pl.faction !== 'killer' || !pl.alive) return false;
    /** 兜底：万一 `statueIds` 没建起来（旧存档），雕像本身也一律不算 */
    if (pl.statueIndex != null) return false;
    if (!pl.stealth && pl.roomId === roomId) return true;
    if (pl.stealth && pl.stealthOriginRoomId === roomId) return true;
    return false;
  });
}

/**
 * 修满的那一刻，双方都要知道「修理已完成」——这是共通信息。
 * 中间的 1～4 次进度对杀手保密，所以只在刚好跨过 repairNeeded 这一下才广播。
 */
export function announceRepairIfJustFinished(state: GameState, before: number): void {
  const need = state.rules.repairNeeded;
  if (before < need && state.repairProgress >= need) {
    log(state, '修理完成！救援系统启动。', 'all', true);
  }
}

/**
 * 修理一满就**立刻把警车放到 5**（用户要求：警车在修理完成时**立即出现**）。
 *
 * ⚠ 以前是挂 `pendingRescueArm`，等**幸存者大回合结束**才放 ——
 * 那样等于白等一回合，和"修理完成后等待 5 回合"对不上。
 *
 * 之后每**幸存者大回合开始**开一格（见 `startRound`），
 * 并且**回合开始时警车已经在 1** 就直接判幸存者胜利。
 */
export function maybeArmRescue(state: GameState) {
  if (
    !state.rescueArmed &&
    state.repairProgress >= state.rules.repairNeeded &&
    state.rules.rescueWaitRounds > 0
  ) {
    state.rescueArmed = true;
    state.rescueCountdown = state.rules.rescueWaitRounds;
    state.pendingRescueArm = false;
    state.killerRepairGuess = state.rules.repairNeeded;
    log(
      state,
      `无线电修好，**警车立即放到救援板块 ${state.rescueCountdown}**。之后每个幸存者大回合开始时开一格；` +
        `回合开始时它已经在 1 就代表抵达出口。`,
      'all',
      true,
    );
  }
}

export function applyPassiveBonuses(state: GameState, playerId: string) {
  const p = actor(state, playerId);
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (!ch) return;
  p.moveBonus = 0;
  p.attackBonus = 0;
  for (const sk of ch.skills) {
    if (sk.trigger !== 'passive') continue;
    for (const fx of sk.effects) {
      if (fx.op === 'modifyMoveRange' && typeof fx.value === 'number') p.moveBonus += fx.value;
      if (fx.op === 'modifyAttackDamage' && typeof fx.value === 'number') p.attackBonus += fx.value;
    }
  }
}

/**
 * 【分头行动】**一个人单独逃脱需要几把钥匙**。
 *
 * 用户拍板：「3 把（你说的减掉3）」—— 和普通模式全队凑 `rules.keysNeeded`（5）把
 * 不一样：分头行动下钥匙是各人自己保管的，所以门槛也降成**每人 3 把**。
 *
 * ⚠ 地图如果把 `keysNeeded` 调得比 3 还小（自定义地图），就**跟着地图走**
 * （`Math.min`），免得出现"永远凑不够"的死局。
 */
export const SPLIT_ESCAPE_KEYS = 3;

/** 分头行动里单独逃脱实际需要的钥匙数（受地图 `keysNeeded` 上限约束） */
export function splitEscapeKeysNeeded(state: GameState): number {
  return Math.min(SPLIT_ESCAPE_KEYS, state.rules.keysNeeded);
}

/**
 * **主要出口是哪个地点**（集齐钥匙逃脱 / 分头行动单独逃脱 / 变体3 计划目标都用它）。
 *
 * ⚠ 用户口径：**以地图的「幸存者起始房间」为准**。
 *
 * 以前这里读 `rules.survivorExitRequiresAllAliveAt` —— 那是写在 rules.json 里的
 * 一个固定房间号 `"R1"`（豪宅的主要出口）。可界面上的「主要出口」标的是
 * **地图的 `survivorStartRoomId` / `entrance`**（见 `Board.tsx` 的 `roomSpecialLabels`），
 * 两边各说各话：墓穴（起始 R3）、城堡（G1）、实验室（G1）站在真正的主要出口
 * **永远不会胜利**（用户报的"5 把钥匙达成、主要出口条件满足，但没胜利"）。
 */
export function mainExitRoomId(state: GameState): string {
  return state.map.survivorStartRoomId || state.rules.survivorExitRequiresAllAliveAt;
}

/**
 * 【分头行动】**大回合开始时**逐个检查"单独逃脱"（用户规则）。
 *
 * 条件满足其一即可，而且**不花行动**：
 *  - 手里 ≥ `splitEscapeKeysNeeded()`（3）把钥匙 **且** 站在**主要出口**；
 *  - 持有**秘密地图** **且** 站在**隐藏出口**。
 *
 * 逃脱后：
 *  - **带走身上所有钥匙和物品**（用户规则：「逃脱的幸存者就不留物品和钥匙了，
 *    改为一律清零」）—— 所以 `keys = 0`、`items = {}`，同地点的人**没得拿**；
 *  - `escaped = true` + `alive = false`：退出场上、不能再操作，
 *    但地图上要留一个变暗的立绘（双方都看得到真实位置）。
 */
export function checkSplitEscapes(state: GameState): void {
  if (!state.split) return;
  const mainExit = mainExitRoomId(state);
  const hidden = state.map.rooms.find((r) => r.tags.includes('hiddenExit'));
  for (const p of Object.values(state.players)) {
    if (p.faction !== 'survivor' || !p.alive || !p.roomId) continue;
    const need = splitEscapeKeysNeeded(state);
    const byKeys = (p.keys ?? 0) >= need && p.roomId === mainExit;
    const byMap =
      state.rules.hiddenExitRequiresMapItem &&
      (p.items.map ?? 0) > 0 &&
      Boolean(hidden) &&
      p.roomId === hidden!.id;
    if (!byKeys && !byMap) continue;
    const carried = p.keys ?? 0;
    /**
     * ⚠ **逃脱的人身上一律清零**（用户规则）：钥匙和物品**全部带走**，
     * 原地**什么都不留** —— 只留一个变暗的立绘。
     * 所以同地点的人**不能**从他身上拿钥匙/物品（`lootFrom` 会拒绝 `escaped` 的人），
     * 也不能再和他交换物品或给钥匙。
     */
    p.keys = 0;
    p.items = {};
    p.escaped = true;
    p.alive = false;
    log(
      state,
      `${p.name} **单独逃脱**（${
        byKeys
          ? `用 ${need} 把钥匙打开主要出口${carried > need ? `（手里 ${carried} 把也一并带走）` : ''}`
          : '用秘密地图从隐藏出口离开'
      }），身上的钥匙和物品全部带走，原地不留东西。`,
      'all',
      true,
    );
  }
  /** 全员都出去了（或已经被杀）就收尾结算 */
  checkSplitEnd(state);
}

/**
 * 【分头行动】**收尾判定**：所有幸存者都"逃脱"或"被杀"之后才结束，再按击杀数结算。
 *
 * 用户规则（1对3 / 2对3 都是 3 名幸存者）：
 *  - 杀手杀死 **0~1** 人 → 杀手**失败**
 *  - 杀死 **2** 人 → 杀手**胜利**
 *  - 杀死 **3** 人（全员） → 杀手**完全胜利**
 *
 * ⚠ 逃脱的人**不算**被杀（他自己跑掉了，不记在杀手账上）。
 */
export function checkSplitEnd(state: GameState): void {
  if (!state.split || state.phase === 'gameOver') return;
  const survivors = Object.values(state.players).filter(
    (p) => p.faction === 'survivor',
  );
  if (!survivors.length) return;
  /** 场上还有人（活着）就不结算 */
  if (survivors.some((p) => p.alive)) return;
  const killed = survivors.filter((p) => !p.escaped).length;
  const escaped = survivors.filter((p) => p.escaped).length;
  const total = survivors.length;
  state.phase = 'gameOver';
  if (killed >= total) {
    state.winner = 'killer';
    state.winReason = `完全胜利：${total} 名幸存者全部被杀，无一人逃脱。`;
    log(state, `杀手**完全胜利** —— ${total} 名幸存者全部被杀。`, 'all', true);
    return;
  }
  if (killed >= 2) {
    state.winner = 'killer';
    state.winReason = `胜利：击杀 ${killed} 人（逃脱 ${escaped} 人）。`;
    log(state, `杀手**胜利** —— 击杀 ${killed} 人，逃脱 ${escaped} 人。`, 'all', true);
    return;
  }
  state.winner = 'survivors';
  state.winReason = `杀手失败：只击杀 ${killed} 人（逃脱 ${escaped} 人）。`;
  log(state, `杀手**失败** —— 只击杀 ${killed} 人，逃脱 ${escaped} 人。`, 'all', true);
}

/** 钥匙到齐且人都在出口，或警车开到 0，幸存者赢 */
export function checkSurvivorWin(state: GameState): void {
  if (state.phase === 'gameOver') return;
  const survivors = Object.values(state.players).filter(
    (p) => p.faction === 'survivor' && p.alive,
  );
  if (survivors.length === 0) return;

  if (state.rescueArmed && state.rescueCountdown !== null && state.rescueCountdown <= 0) {
    state.winner = 'survivors';
    state.winReason = '无线电修好，警车抵达出口。';
    state.phase = 'gameOver';
    log(state, '幸存者胜利：救援抵达！');
    return;
  }

  /**
   * 【分头行动】幸存者**各管各的**：逃脱是"各自在大回合开始时单独逃脱"，
   * 不存在"钥匙凑齐 + 全员都在出口"这种团队胜利 —— 所以这里只保留
   * **修理（无线电）获胜**那条：存活者胜利。
   */
  if (state.split) return;

  if (state.keysCollected < state.rules.keysNeeded) return;

  const exitId = mainExitRoomId(state);
  if (survivors.every((s) => s.roomId === exitId)) {
    state.winner = 'survivors';
    state.winReason = '集齐钥匙，从入口逃脱。';
    state.phase = 'gameOver';
    log(state, '幸存者胜利：从入口逃脱！');
    return;
  }

  if (state.rules.hiddenExitRequiresMapItem) {
    const hasMap = survivors.some((s) => (s.items.map ?? 0) > 0);
    const hidden = state.map.rooms.find((r) => r.tags.includes('hiddenExit'));
    if (hasMap && hidden && survivors.every((s) => s.roomId === hidden.id)) {
      state.winner = 'survivors';
      state.winReason = '从隐藏出口逃脱。';
      state.phase = 'gameOver';
      log(state, '幸存者胜利：隐藏出口！');
    }
  }
}

export function survivorsInRoom(state: GameState, roomId: string): PlayerState[] {
  return Object.values(state.players).filter(
    (p) => p.faction === 'survivor' && p.alive && p.roomId === roomId,
  );
}
