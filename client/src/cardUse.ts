/**
 * 打牌前的小检查（只在网页上提示，真正许不许可还是服务器说了算）。
 * 例如：封堵牌在没门的地方会提醒“打出后将跳过封堵”。
 */
import type { CardDef, PublicSnapshot } from './types';

/** 这种连线算“门”（可以封堵）。虚线、通道不算门 */
function isDoorEdge(pathType?: string): boolean {
  return !pathType || pathType === 'door';
}

/** 两间房之间那扇门的编号。小的房间号写前面，避免 A|B 和 B|A 被当成两扇门 */
function doorId(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 这个房间连着哪些门 */
function doorsAt(state: PublicSnapshot, roomId: string): string[] {
  const out: string[] = [];
  for (const e of state.map.edges) {
    if (!isDoorEdge(e.pathType)) continue;
    if (e.from === roomId) out.push(doorId(e.from, e.to));
    else if ((e.bidirectional ?? true) && e.to === roomId) out.push(doorId(e.from, e.to));
  }
  return out;
}

/** 这个房间还有哪些没被封上的门 */
function unblockedDoorsAt(state: PublicSnapshot, roomId: string): string[] {
  return doorsAt(state, roomId).filter((id) => !state.blockades.includes(id));
}

/** 还活着但已经受伤的幸存者（给治疗按钮用） */
export function injuredSurvivors(state: PublicSnapshot) {
  return state.players.filter((s) => s.faction === 'survivor' && s.alive && s.hp < s.maxHp);
}

/** 与当前行动者同一地点、可以互相治疗的受伤幸存者（包括自己） */
export function injuredAlliesHere(state: PublicSnapshot) {
  const roomId = state.you.roomId;
  if (!roomId) return [];
  return injuredSurvivors(state).filter((s) => s.roomId === roomId);
}

/**
 * 可治疗的同伴：**受伤的**、**已〔中毒〕的**，
 * 以及（当治疗手段本身能消除恐惧时）**有恐惧的**。
 *
 * 女王规则：「已中毒的人可以被治疗（即使是健康状态）」。
 * 马尔科的医药包牌面写了「并消除目标恐惧」→ 健康但有恐惧的人也是合法目标；
 * 草药没有这条，所以默认 `clearsFear = false`。
 */
export function healableAlliesHere(state: PublicSnapshot, clearsFear = false) {
  const roomId = state.you.roomId;
  if (!roomId) return [];
  const poisoned = new Set(state.poisoned ?? []);
  return (state.players ?? []).filter(
    (s) =>
      s.faction === 'survivor' &&
      s.alive &&
      s.roomId === roomId &&
      (s.hp < s.maxHp || poisoned.has(s.id) || (clearsFear && s.fear > 0)),
  );
}

/**
 * 这张牌会不会**去封堵某扇门**。
 *
 * ⚠ 必须把 `placeBlockadeAtCore`（枝條生長）和 `placeCore`（茂盛）也算进来 ——
 * 以前只认 `placeBlockade` / `placeBlockadeAll`，这两张牌就完全不提示。
 */
function hasBlockadeEffect(card: CardDef | undefined): boolean {
  return Boolean(
    card?.effects.some(
      (e) =>
        e.op === 'placeBlockade' ||
        e.op === 'placeBlockadeAll' ||
        e.op === 'placeBlockadeAtCore' ||
        e.op === 'placeCore',
    ),
  );
}

/**
 * 这张牌**现在打不出来**的原因（null = 能打）。
 *
 * 规则：前置条件不满足时**根本不能打** —— 不是打出后内部跳过、白花一张牌。
 * 对齐服务端 `playKillerCard` 的打出前检查：
 *  - 枝條生長 `placeBlockadeAtCore`：必须有「带任意核心标记 + 旁边还有未封堵的门」的地点
 *  - 茂盛 `placeCore`：核心标记**直接放扼杀者所在地点**（不能自选），所以只查上限
 */
export function killerCardPlayBlockReason(
  state: PublicSnapshot,
  card: CardDef | undefined,
): string | null {
  if (!card) return null;
  const ops = new Set<string>([
    ...card.effects.map((e) => e.op),
    ...((card.effectsByTiming ?? []).flatMap((g) => g.map((e) => e.op))),
  ]);
  if (ops.has('placeBlockadeAtCore')) {
    const cores = [...new Set(state.coreMarkers ?? [])];
    if (!cores.some((r) => unblockedDoorsAt(state, r).length > 0)) {
      return '场上没有「带核心标记且还有可封堵的门」的地点';
    }
    return null;
  }
  if (ops.has('placeCore')) {
    if (!state.you.roomId) return '你不在图上';
    if ((state.coreMarkers ?? []).length >= 5) return '核心标记已达 5 个上限';
    return null;
  }
  /**
   * **效果自带的 `requires` 前置条件**（对齐服务端 `cardRequirementBlockReason`）。
   * 以前引擎压根不检查，牌面写着「只有场上有受伤的幸存者时才能使用」的
   * 「鲜血追猎」在没人受伤时也能打出去。
   */
  for (const req of cardRequirements(card)) {
    if (req === 'injuredSurvivor') {
      const injured = state.players.some(
        (p) => p.faction === 'survivor' && p.alive && p.hp < p.maxHp,
      );
      if (!injured) return '场上没有受伤的幸存者，现在不能使用';
    } else if (req === 'noiseOnBoard') {
      if (!(state.noises ?? []).length) return '场上没有响声，现在不能使用';
    } else if (req === 'chestOnBoard') {
      if (!(state.treasureChests ?? []).length) return '场上没有宝箱，现在不能使用';
    }
  }
  /**
   * 一般情况「每回合只能打 1 张慢速牌」，
   * **只有扼杀者 1 级才解锁无限**（对齐服务端 `playKillerCard` 的慢速判定）。
   *
   * 「算不算慢速牌」要跟服务端一样按 `timings` 优先判断 ——
   * 狼人「领地意识」基础速度是 fast、但 timings 含 slow，在慢速阶段打出的就是慢速牌。
   */
  const slowUnlimited = state.isStranglerKiller === true && (state.killerLevel ?? 1) >= 1;
  if (!slowUnlimited && state.killerUsedSlowThisTurn && isSlowPlay(card)) {
    return '本回合已打过 1 张慢速牌（只有扼杀者进化 1 级后可以不限张数）';
  }
  return null;
}

/** 此地没有能封的门时给出提示；牌仍可打出。 */
export function killerBlockadeSkipHint(
  state: PublicSnapshot,
  card: CardDef | undefined,
): string | null {
  if (!card || !hasBlockadeEffect(card)) return null;
  const roomId = state.you.roomId;
  if (!roomId || unblockedDoorsAt(state, roomId).length === 0) {
    return '此地没有能封堵的门';
  }
  return null;
}

/** 以前会因为“附近没人”锁牌。现在一律可打，避免泄密，所以永远返回“没有理由锁” */
export function killerCardBlockedReason(_state: PublicSnapshot, _card: CardDef | undefined): string | null {
  return null;
}

/**
 * 这张牌**在慢速阶段打出时**算不算「慢速牌」。
 *
 * 服务端 `playKillerCard` 的判定顺序：有没有 `timings` —
 *  - 有：当前阶段命中 `slow` 才算慢速（狼人「领地意识」⚡＋⌛ 就是这种）
 *  - 没有：看 `effectiveCardSpeed`（屠夫「链锯轰鸣」4 级变快速，所以不算慢速）
 */
function isSlowPlay(card: CardDef): boolean {
  if (card.timings?.length) return card.timings.includes('slow');
  return card.speed === 'slow';
}

/**
 * 收集一张牌所有效果上写的 `requires`（含 `alternatives` 里的）。
 * 对齐服务端 `handleAction` 里那段 `collectReq`。
 */
function cardRequirements(card: CardDef): string[] {
  const out = new Set<string>();
  const walk = (list: Array<{ op: string; requires?: string; alternatives?: unknown }> | undefined) => {
    for (const fx of list ?? []) {
      if (fx.requires) out.add(fx.requires);
      if (Array.isArray(fx.alternatives)) {
        walk(fx.alternatives as Array<{ op: string; requires?: string }>);
      }
    }
  };
  walk(card.effects as never);
  for (const g of card.effectsByTiming ?? []) walk(g as never);
  return [...out];
}

/** 这张牌现在算快速 / 特殊 / 慢速。屠夫链锯轰鸣在等级 4 会变成快速 */
export function effectiveCardSpeed(state: PublicSnapshot, card: CardDef | undefined): string | undefined {
  if (!card) return undefined;
  if ((card.id === 'butcher_saw_1' || card.id === 'butcher_saw_2') && (state.killerLevel ?? 1) >= 4) {
    return 'fast';
  }
  return card.speed;
}

/**
 * 遭遇中打出这张牌能加多少本次攻击（尾随 / 擲斧 / 狂野撕咬…）。
 * `state` 用来算**扼殺**的「+x 力量（x = 核心标记数量）」。
 * 0 表示这张牌不加攻（**不代表不能打** —— 見 `canPlayAsEncounterAttack`）。
 */
export function encounterCardAttackBonus(
  state: PublicSnapshot | undefined,
  card: CardDef | undefined,
): number {
  if (!card) return 0;
  if (/^murder_tail_/.test(card.id)) return 1;
  let n = 0;
  for (const fx of card.effects) {
    if (fx.op === 'attackValue' && typeof fx.value === 'number') n += fx.value;
    /** 扼殺：本次攻击 +x，x = 地图上核心标记的数量 */
    if (fx.op === 'attackValuePerCore') n += (state?.coreMarkers ?? []).length;
  }
  if (n > 0) return n;
  const m = /本次攻击\s*\+(\d+)/.exec(card.text ?? '');
  return m ? Number(m[1]) : 0;
}

/**
 * 这张牌能不能在**遭遇的攻击时机**打出。
 *
 * ⚠ 不能用 `encounterCardAttackBonus(...) > 0` 代替：
 * 扼殺是 `attackValuePerCore`，核心标记为 0 时加攻是 0，
 * 但它**依然能打**（只是 +0）—— 用加攻值当门槛会让按钮凭空消失。
 */
export function canPlayAsEncounterAttack(card: CardDef | undefined): boolean {
  if (!card) return false;
  if (card.timings?.includes('attack')) return true;
  return card.effects.some(
    (fx) => fx.op === 'attackValue' || fx.op === 'attackValuePerCore',
  );
}
