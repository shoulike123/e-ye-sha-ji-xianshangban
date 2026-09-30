/**
 * 一次性补丁：给 `killerCards.ts` 追加**攻击牌使用条件**检查。
 *
 * 用户的规则：
 *  - 【毒液之觸】「仅当女王参与本次攻击才能使用」→ 女王本体必须在遭遇地点
 *  - 【伏擊】「仅在你重现或本回合移动通过了秘密通道时可用」
 *
 * 跑法：`node scripts/tests/add-attack-conditions.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'server/src/game/killerCards.ts';
let src = readFileSync(FILE, 'utf8');

const MARK = 'export function attackCardConditionBlockReason';
if (src.includes(MARK)) {
  console.log('已经加过了，跳过。');
  process.exit(0);
}

const APPEND = `
/**
 * **这张攻击牌现在能不能打**（牌面写了使用条件的那几张）。
 *
 * @returns \`null\` = 可以；否则是"不能用"的原因（直接给玩家看）
 *
 * 目前两条：
 *  - **毒液之觸**：「仅当女王参与本次攻击才能使用」——
 *    女王本体必须在**遭遇地点**（只有僵尸在场不算）
 *  - **伏擊**：「仅在你重现或本回合移动通过了秘密通道时可用」
 */
export function attackCardConditionBlockReason(
  state: GameState,
  card: CardDef | undefined,
): string | null {
  if (!card) return null;
  if (/^q_venom/.test(card.id)) {
    if (!isQueenKiller(state)) return '毒液之觸：这张牌只有女王的对局能用';
    const enc = state.encounter;
    const queen = state.killerId ? state.players[state.killerId] : null;
    if (!enc || !queen?.roomId || queen.roomId !== enc.roomId) {
      return '毒液之觸：只有女王本体参与本次攻击（与遭遇同地点）才能使用';
    }
  }
  if (/^un_ambush/.test(card.id)) {
    const byPassage = Boolean(state.movedThroughPassageThisTurn);
    if (!state.reappearedThisTurn && !byPassage) {
      return '伏擊：只有在你重现、或本回合移动通过了秘密通道时才能使用';
    }
  }
  return null;
}
`;

writeFileSync(FILE, `${src.trimEnd()}\n${APPEND}`, 'utf8');
console.log('已追加 attackCardConditionBlockReason');
