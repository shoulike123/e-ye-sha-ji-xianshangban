/**
 * 审计：每一个 case 里有没有「轮到你 / 主要行动已用」这类门槛。
 *
 * 规则（用户明确）：
 *  - 「额外行动**不受小回合限制**（谁都能在自己小回合做完之后再做）」
 *  - 「所有的额外行动都是满足条件就能无限用的」
 * 所以额外行动只该看：①条件（地点/物品/牌堆）②`haltedThisRound` ③真正的资源消耗。
 * `assertActive`（还没轮到你）和 `mainActionUsed` 都属于**不该有**的门槛。
 *
 * 这不是测试，只是把 `case` 和它内部的守卫拉平了看。
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'server/src/game/engine.ts';
const lines = readFileSync(file, 'utf8').split(/\r?\n/);

/** 收集所有 `case 'x': {` 的位置（只看 switch 里的，不看 case 表达式里的字符串） */
const cases = [];
lines.forEach((l, i) => {
  const m = /^\s{8}case '([^']+)':\s*\{?\s*$/.exec(l);
  if (m) cases.push({ name: m[1], line: i + 1 });
});

const owner = (lineNo) => {
  let hit = null;
  for (const c of cases) if (c.line <= lineNo) hit = c;
  return hit;
};

const marks = [];
lines.forEach((l, i) => {
  const line = i + 1;
  const c = owner(line);
  if (!c) return;
  if (/assertActive\(state, playerId\)/.test(l)) marks.push({ ...c, line, kind: 'assertActive' });
  else if (/assertSurvivorMainAction\(/.test(l)) marks.push({ ...c, line, kind: 'assertSurvivorMainAction' });
  else if (/mainActionUsed/.test(l)) marks.push({ ...c, line, kind: 'mainActionUsed' });
  else if (/haltedThisRound/.test(l)) marks.push({ ...c, line, kind: 'haltedThisRound(OK)' });
});

/** 额外行动相关的 action 名（客户端「额外行动」弹窗里那 16 个入口） */
const EXTRA = new Set([
  'useItem', 'useNote', 'useSuitcase', 'useSkill', 'openChest', 'placeLeverGate',
  'drawRelic', 'useMirrorPortal', 'useMechanicalKnack', 'useLuckyCoin',
]);

console.log('=== 额外行动入口的守卫 ===');
for (const name of EXTRA) {
  const own = marks.filter((m) => m.name === name);
  const bad = own.filter((m) => m.kind !== 'haltedThisRound(OK)');
  const tag = bad.length ? '❌' : '✅';
  const detail = own.map((m) => `${m.kind}@${m.line}`).join(', ') || '（无门槛）';
  console.log(`${tag} ${name.padEnd(22)} ${detail}`);
}

console.log('\n=== 其他 case 里出现的门槛（排除额外行动） ===');
for (const m of marks) {
  if (EXTRA.has(m.name)) continue;
  console.log(`   ${m.name.padEnd(24)} ${m.kind}@${m.line}`);
}
