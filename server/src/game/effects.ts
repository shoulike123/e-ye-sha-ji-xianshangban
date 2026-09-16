/**
 * 规则积木盒。
 * 裁判（engine.ts）说“走一步 / 搜一下 / 封一扇门”，真正动手的是这里。
 * 卡牌 JSON 里的 effects 也会走到 runEffects / applyOne。
 */
import type { CardDef, EffectDef, MapDef } from '../content/schema.js';
import type { EffectContext, GameState, LogVis, PlayerState } from './types.js';

/** 往战报本上写一行。vis='survivor' 的字杀手看不见 */
export function log(state: GameState, text: string, vis: LogVis = 'all', needsCommon = false) {
  state.logs.push({ t: Date.now(), text, vis, needsCommon });
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

/** 乔治手里的这类笔记有几张 */
export function countGeorgeNotes(p: PlayerState): number {
  return Object.entries(p.items)
    .filter(([id]) => id.startsWith('george_note_'))
    .reduce((sum, [, n]) => sum + n, 0);
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

export function unblockedDoorsAt(
  state: GameState,
  roomId: string,
): Array<{ id: string; other: string }> {
  return doorsAt(state, roomId).filter((d) => !isDoorBlocked(state, d.id));
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

/** 只能治疗同一地点的受伤幸存者（包括自己） */
export function assertHealSameRoom(state: GameState, healerId: string, targetId: string): void {
  const healer = actor(state, healerId);
  const target = state.players[targetId];
  if (!target?.alive || target.faction !== 'survivor') throw new Error('治疗目标无效');
  if (target.hp >= target.maxHp) throw new Error(`${target.name} 未受伤，不能治疗`);
  if (!healer.roomId || healer.roomId !== target.roomId) {
    throw new Error('只能治疗与你在同一地点的幸存者（包括自己）');
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

export function trySecretPassage(state: GameState, playerId: string, toRoomId: string): void {
  const p = actor(state, playerId);
  if (p.faction !== 'survivor' || !p.alive) throw new Error('只有幸存者可通过秘密通道');
  if (!p.roomId) throw new Error('不在地图上');
  if (!passageNeighbors(state.map, p.roomId).includes(toRoomId)) {
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

function neighborsOpen(
  state: GameState,
  from: string,
  ignoreBlockades: boolean,
  allowKiller = false,
): string[] {
  const out: string[] = [];
  for (const e of state.map.edges) {
    if (e.pathType === 'killer' && !allowKiller) continue;
    let other: string | null = null;
    if (e.from === from) other = e.to;
    else if ((e.bidirectional ?? true) && e.to === from) other = e.from;
    if (!other) continue;
    const id = doorId(from, other);
    /**
     * 判断「这扇门被封了吗」必须用规范门号比较：
     * 地图 JSON 里边的方向可能是 R1→B1，而封堵表里存的是排序后的 B1|R1，
     * 直接用字符串全等会漏判 —— 之前就是这个原因导致「杀手走过封堵没拆掉」。
     */
    const blocked = isDoorEdge(e.pathType) && isDoorBlocked(state, id);
    if (blocked && !ignoreBlockades) continue;
    out.push(other);
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

/** 某格的杀手邻接：封堵不挡路，可走杀手通道。 */
export function roomsAdjacentKiller(state: GameState, roomId: string): string[] {
  return neighborsOpen(state, roomId, true, true);
}

/** 杀手相邻地点：封堵不挡路，可走杀手通道，可原路返回。 */
export function killerAdjacentRooms(state: GameState, playerId: string): string[] {
  const p = state.players[playerId];
  if (!p?.roomId) return [];
  return roomsAdjacentKiller(state, p.roomId);
}

export function isKeyCard(card: { effects: Array<{ op: string; itemId?: string }> }): boolean {
  return card.effects.some((e) => e.op === 'gainItem' && e.itemId === 'key');
}

export function buildSearchDeck(cards: Array<{ id: string; effects: Array<{ op: string; itemId?: string }> }>): string[] {
  const keys = cards.filter(isKeyCard).map((c) => c.id);
  const rest = cards.filter((c) => !isKeyCard(c)).map((c) => c.id);
  if (keys.length === 0) return shuffle(cards.map((c) => c.id));
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

/** 遭遇中可用来增强防御的物品。可反复使用的短剑/长剑也算「使用物品」。 */
const DEFENSE_ITEMS: Record<
  string,
  { bonus: number; consume: boolean; /** 消耗的不是所选物品本身时（左轮耗弹药） */ consumeItemId?: string; killerDraw: number }
> = {
  shortsword: { bonus: 1, consume: false, killerDraw: 0 },
  longsword: { bonus: 3, consume: false, killerDraw: 1 },
  lime: { bonus: 2, consume: true, killerDraw: 0 },
  axe: { bonus: 1, consume: true, killerDraw: 0 },
  /** 用左轮防御：须同时持有弹药包；每次弃 1 弹药包，左轮保留 */
  revolver: { bonus: 4, consume: true, consumeItemId: 'ammo', killerDraw: 0 },
  /** 煤油灯（「替换鸿运当骰等牌」开启时的替换牌）：+1，可反复 */
  lamp: { bonus: 1, consume: false, killerDraw: 0 },
};

export function defenseItemInfo(itemId: string) {
  return DEFENSE_ITEMS[itemId] ?? null;
}

export function canUseDefenseItem(p: PlayerState, itemId: string): boolean {
  if ((p.items[itemId] ?? 0) < 1) return false;
  if (!DEFENSE_ITEMS[itemId]) return false;
  if (itemId === 'revolver' && (p.items.ammo ?? 0) < 1) return false;
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
  const payNote =
    def.consumeItemId === 'ammo'
      ? '（弃置 1 弹药包）'
      : def.consume
        ? ''
        : '（保留）';
  log(state, `${p.name} 使用「${itemName(itemId)}」防御 +${def.bonus}${payNote}。`);
  return def.bonus;
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

/** 钥匙上限 = rules.keysNeeded（默认 5）。多出来的钥匙不上架、也不计数。 */
export function addKeys(state: GameState, amount: number): number {
  const cap = state.rules.keysNeeded;
  const before = state.keysCollected;
  state.keysCollected = Math.min(cap, before + amount);
  return state.keysCollected - before;
}

export function killerHandMax(state: GameState): number {
  return state.rules.killerHandMax ?? 5;
}

export function enforceKillerHand(state: GameState) {
  const max = killerHandMax(state);
  if (state.killerHand.length > max) {
    state.pendingKillerDiscards = state.killerHand.length - max;
    log(state, `杀手手牌超过上限 ${max}，请弃置 ${state.pendingKillerDiscards} 张。`);
  }
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
  const kept = state.killerDeck.length;
  upgradeKiller(state);
  if (state.killerDiscard.length === 0) return;
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
  deckKey: 'searchDeck' | 'discoveryDeck' | 'killerDeck',
  discardKey: 'searchDiscard' | 'discoveryDiscard' | 'killerDiscard',
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

export function setOverFearHandler(fn: (state: GameState, targetId: string) => void) {
  onSurvivorOverFear = fn;
}

/** 给幸存者加恐惧。已经 2 枚再加就是过度，要点名报位置 */
export function addFear(state: GameState, targetId: string, amount: number) {
  if (!state.rules.enableFear) return;
  const target = actor(state, targetId);
  if (!target.alive || target.faction !== 'survivor') return;
  const tokenMax = 2;
  for (let i = 0; i < amount; i++) {
    if (target.fear < tokenMax) {
      target.fear += 1;
      log(state, `${target.name} 获得恐惧标记（${target.fear}/${tokenMax}）。`);
    } else {
      target.overFear = true;
      /**
       * 惊吓过度的响声要报成「谁在哪里因惊吓过度发出了声音」——
       * 所以让 pushNoise 闭嘴，由这里写那一条（不重复报）。
       */
      if (target.roomId) pushNoise(state, target.roomId, true);
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

/** 造成伤害。满血变受伤，已受伤就死亡（杀手立刻胜）。遭遇期间一律不能出示古代护符；非遭遇伤害可以。 */
export function applyDamage(
  state: GameState,
  targetId: string,
  amount: number,
  sourceId: string,
  opts?: { eliminate?: boolean; skipAmulet?: boolean },
): void {
  const target = actor(state, targetId);
  if (!target.alive || target.faction !== 'survivor') return;
  if (
    !opts?.eliminate &&
    !opts?.skipAmulet &&
    state.phase !== 'encounter' &&
    (target.items.amulet ?? 0) > 0 &&
    amount > 0
  ) {
    state.pendingAmulet = { playerId: targetId, amount, sourceId };
    log(state, `${target.name} 可以出示古代护符来防止这次伤害。`, 'survivor');
    return;
  }
  target.hp = Math.max(0, target.hp - amount);
  log(state, `${target.name} 受到 ${amount} 点伤害（生命 ${target.hp}/${target.maxHp}）。`);
  if (target.hp <= 0) {
    target.alive = false;
    target.roomId = null;
    log(state, `${target.name} 倒下了！`);
    if (state.rules.killerWinsOnAnyKill) {
      state.winner = 'killer';
      state.winReason = `${actor(state, sourceId).name} 击杀了一名幸存者。`;
      state.phase = 'gameOver';
    }
  }
}

/** 治疗：血量加回去，但不能超过上限。距离由 assertHealSameRoom 先检查。 */
export function applyHeal(state: GameState, targetId: string, amount: number): void {
  const target = actor(state, targetId);
  if (!target.alive || target.faction !== 'survivor') {
    throw new Error('治疗目标无效');
  }
  if (target.hp >= target.maxHp) {
    throw new Error(`${target.name} 未受伤，不能治疗`);
  }
  target.hp = Math.min(target.maxHp, target.hp + amount);
  log(state, `${target.name} 恢复生命至 ${target.hp}/${target.maxHp}。`, 'all', true);
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
 * 房间发出响声。已有标记则跳过；爆竹当回合不额外放标记。
 * `quiet` = 调用方自己会写更具体的战报（比如惊吓过度），这里就别再报一条通用的。
 */
export function pushNoise(state: GameState, roomId: string, quiet = false) {
  if (state.firecrackerThisRound) return;
  if (!roomId) return;
  if (state.noises.includes(roomId)) return;
  state.noises.push(roomId);
  if (!quiet) log(state, `响声出现在「${roomName(state, roomId)}」。`, 'all', true);
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

export function relocateBlockadeToPending(state: GameState, oldDoorId: string): void {
  const neu = state.pendingBlockadePlace;
  if (!neu) throw new Error('当前不是迁移封堵');
  if (!isDoorBlocked(state, oldDoorId)) throw new Error('那里没有封堵');
  if ((state.blockadesThisAction ?? []).includes(oldDoorId)) {
    throw new Error('不能拆除本次行动中刚封上的门');
  }
  if (oldDoorId === neu) throw new Error('拆掉的门不能是正在封的那扇');
  state.blockades.splice(state.blockades.indexOf(oldDoorId), 1);
  const oldPair = parseDoor(oldDoorId);
  log(
    state,
    oldPair
      ? `拆除「${roomName(state, oldPair[0])}」–「${roomName(state, oldPair[1])}」的封堵。`
      : `拆除封堵。`,
  );
  if (!state.pendingSealQueue) state.pendingSealQueue = [];
  if (state.sealAllRoomId && oldPair) {
    const onSealRoom = oldPair[0] === state.sealAllRoomId || oldPair[1] === state.sealAllRoomId;
    if (onSealRoom && oldDoorId !== neu && !state.pendingSealQueue.includes(oldDoorId)) {
      state.pendingSealQueue.push(oldDoorId);
    }
  }
  state.pendingBlockadePlace = null;
  const placed = tryPlaceBlockadeDoor(state, neu);
  if (placed === 'full') return;
  if (state.pendingSealQueue[0] === neu) state.pendingSealQueue.shift();
  continueSealQueue(state);
  finishSealAllIfDone(state);
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

export function removeBlockade(state: GameState, doorOrRoom: string) {
  /**
   * 按「规范化门号」找，而不是字符串全等：
   * "R1|B1" 与 "B1|R1" 是同一扇门，旧存档里可能存的是没排序的那种写法。
   */
  const canonical = canonicalDoorId(doorOrRoom);
  const hit = state.blockades.find((id) => canonicalDoorId(id) === canonical);
  if (hit) {
    state.blockades.splice(state.blockades.indexOf(hit), 1);
    const pair = parseDoor(hit);
    log(
      state,
      pair
        ? `移除「${roomName(state, pair[0])}」–「${roomName(state, pair[1])}」的封堵。`
        : `移除封堵。`,
    );
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
  log(
    state,
    pair
      ? `移除「${roomName(state, pair[0])}」–「${roomName(state, pair[1])}」的封堵。`
      : `移除封堵。`,
  );
  return true;
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
      if (state.rules.repairMakesNoise && p.roomId) pushNoise(state, p.roomId);
      break;
    }
    case 'noise': {
      const room = fx.at === 'target' && ctx.targetRoomId ? ctx.targetRoomId : p.roomId;
      if (room) pushNoise(state, room);
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
        const added = addKeys(state, amount);
        log(
          state,
          added > 0
            ? `钥匙放入钥匙架（${state.keysCollected}/${state.rules.keysNeeded}）。`
            : `钥匙架已有 ${state.keysCollected}/${state.rules.keysNeeded} 把，多出来的钥匙不再上架。`,
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
      log(state, `${p.name} 消除恐惧。`, 'all', true);
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
      if (p.roomId) removeBlockade(state, p.roomId);
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

function pathRooms(
  state: GameState,
  from: string,
  to: string,
  ignoreBlockades: boolean,
  allowKiller = false,
): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighborsOpen(state, cur, ignoreBlockades, allowKiller)) {
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

  if (toRoomId === p.roomId) {
    if (minRange > 0) return false;
    state.lastMovePath = [p.roomId];
    state.lastMoveCrossedBlockade = false;
    log(state, `${p.name} 留在「${roomName(state, p.roomId)}」。`, p.faction === 'killer' ? 'all' : 'survivor');
    return true;
  }

  const killerBypass = p.faction === 'killer';
  const path = pathRooms(state, p.roomId, toRoomId, killerBypass, killerBypass);
  const dist = path ? path.length - 1 : Infinity;
  if (!path || dist > maxRange || dist < minRange) return false;

  let crossed = false;
  if (p.faction === 'killer') {
    for (let i = 0; i < path.length - 1; i++) {
      const id = doorId(path[i]!, path[i + 1]!);
      // 用规范门号判定（地图边序可能给出另一种写法）
      if (isDoorBlocked(state, id)) {
        crossed = true;
        // 潜行穿过封堵不拆；平时走过才拆
        if (!p.stealth) removeBlockade(state, id);
      }
    }
  }
  p.roomId = toRoomId;
  state.lastMovePath = path;
  state.lastMoveCrossedBlockade = crossed;

  if (p.faction === 'killer' && p.stealth) {
    log(state, `${p.name} 在潜行中移动。`, 'killer');
  } else {
    log(
      state,
      `${p.name} 移动到「${roomName(state, toRoomId)}」。`,
      p.faction === 'killer' ? 'all' : 'survivor',
    );
  }
  return true;
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
    for (const n of neighborsOpen(state, cur, ignore, ignore)) {
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

/** 地图上相连的地点（门/小径），不含杀手专用通道。不必从自己所在格出发。 */
export function mapDist(
  state: GameState,
  from: string,
  to: string,
  allowKiller = true,
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

export function senseRooms(state: GameState, roomIds: string[]): void {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const roomId of roomIds) {
    const found = survivorsInRoom(state, roomId).filter((s) => {
      const ch = state.characters.find((c) => c.id === s.characterId);
      if (ch?.skills.some((sk) => sk.id === 'low_profile' || sk.name.includes('低调'))) return false;
      return !/安娜|anna|survivor1/i.test(`${s.characterId ?? ''} ${ch?.name ?? ''} ${s.name}`);
    });
    for (const s of found) {
      s.exposed = true;
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
}

/** 在搜索点抽 1 张。杀手搜到人会记 lastSearchFound，幸存者抽到钥匙就上架 */
export function doSearch(state: GameState, playerId: string): void {
  const p = actor(state, playerId);
  if (!p.roomId || !p.alive) throw new Error('无法搜索物资');
  const room = state.map.rooms.find((r) => r.id === p.roomId);
  if (!room?.tags.includes('searchable')) {
    throw new Error('当前地点不能搜索物资');
  }
  if (p.faction === 'survivor' && killerInRoom(state, p.roomId)) {
    throw new Error('与杀手同地（或杀手在此进入潜行）不能搜索物资');
  }
  if (p.searchedThisTurn) {
    throw new Error('本回合已经搜索过物资了');
  }
  p.searchedThisTurn = true;
  const cardId = drawSearchCard(state);
  if (!cardId) {
    log(state, '搜索物资：牌库已空。');
    p.quietSearch = false;
    return;
  }
  const card = state.cardById[cardId];
  log(state, `${p.name} 找到了：${card?.name ?? cardId}。`, card && isKeyCard(card) ? 'all' : 'survivor');
  // 安娜「小心谨慎」：她搜索时不发出任何响声，钥匙、工具箱等一律不响。
  // 只影响「搜索」这一个动作；修理、草药、物品使用、翻手提箱照常按牌面响声结算。
  const makeNoise = Boolean(card?.makesNoise) && !isCautiousSearcher(state, playerId);
  p.quietSearch = false;
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
  if (makeNoise && p.roomId) pushNoise(state, p.roomId);
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
  addRepairProgress(state, 1);
  log(state, `${p.name} 修理无线电（${state.repairProgress}/${state.rules.repairNeeded}）。`, 'survivor');
  announceRepairIfJustFinished(state, before);
  maybeArmRescue(state);
  if (state.rules.repairMakesNoise && p.roomId) pushNoise(state, p.roomId);
}

/** 公开站在这格，或潜行是从这格进的：幸存者都不能搜/修 */
export function killerInRoom(state: GameState, roomId: string): boolean {
  return Object.values(state.players).some((pl) => {
    if (pl.faction !== 'killer' || !pl.alive) return false;
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

export function maybeArmRescue(state: GameState) {
  if (
    !state.rescueArmed &&
    !state.pendingRescueArm &&
    state.repairProgress >= state.rules.repairNeeded &&
    state.rules.rescueWaitRounds > 0
  ) {
    state.pendingRescueArm = true;
    log(state, `无线电已修满。幸存者大回合结束后，警车才会放到 5。`, 'survivor');
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

  if (state.keysCollected < state.rules.keysNeeded) return;

  const exitId = state.rules.survivorExitRequiresAllAliveAt;
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
