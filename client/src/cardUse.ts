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

function hasBlockadeEffect(card: CardDef | undefined): boolean {
  return Boolean(
    card?.effects.some((e) => e.op === 'placeBlockade' || e.op === 'placeBlockadeAll'),
  );
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

/** 这张牌现在算快速 / 特殊 / 慢速。屠夫链锯轰鸣在等级 4 会变成快速 */
export function effectiveCardSpeed(state: PublicSnapshot, card: CardDef | undefined): string | undefined {
  if (!card) return undefined;
  if ((card.id === 'butcher_saw_1' || card.id === 'butcher_saw_2') && (state.killerLevel ?? 1) >= 4) {
    return 'fast';
  }
  return card.speed;
}

/** 遭遇中打出这张牌能加多少本次攻击（尾随等）。0 表示不能当遭遇加攻牌 */
export function encounterCardAttackBonus(card: CardDef | undefined): number {
  if (!card) return 0;
  if (/^murder_tail_/.test(card.id)) return 1;
  let n = 0;
  for (const fx of card.effects) {
    if (fx.op === 'attackValue' && typeof fx.value === 'number') n += fx.value;
  }
  if (n > 0) return n;
  const m = /本次攻击\s*\+(\d+)/.exec(card.text ?? '');
  return m ? Number(m[1]) : 0;
}
