/**
 * 一次性修复：把**十字弩的选僵尸面板**从"杀手回合区块"里搬出来。
 *
 * 问题（用户报的"十字弩只有点了确认就结束了，没有选僵尸"）：
 *  面板写在 `{isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && (...)}`
 *  里 —— 而十字弩是**幸存者**的特殊行动，于是幸存者永远看不到选僵尸的列表。
 *
 * 和第六感/坚毅一样，挪到通用待选区（进化确认面板之前）。
 *
 * 跑法：`node scripts/tests/fix-crossbow-panel.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'client/src/GameViews.tsx';
const src = readFileSync(FILE, 'utf8');
if (src.includes('十字弩的选僵尸面板（已从杀手区块搬出）')) {
  console.log('已经搬过了，跳过。');
  process.exit(0);
}

const lines = src.split(/\r?\n/);
const mark = lines.findIndex((l) => l.includes('十字弩：幸存者点选要消灭的僵尸'));
if (mark < 0) throw new Error('找不到十字弩面板');
/** 注释行上一行是 `{/**` */
const blockStart = lines[mark - 1].trim() === '{/**' ? mark - 1 : mark;
/** 找收尾 `)}` */
let blockEnd = -1;
for (let i = mark; i < mark + 60; i += 1) {
  if (lines[i].trim() === ')}' && lines[i - 1].includes('</div>')) { blockEnd = i; break; }
}
if (blockEnd < 0) throw new Error('找不到十字弩面板收尾');

const block = lines.slice(blockStart, blockEnd + 1);
console.log(`剪出 L${blockStart + 1}–L${blockEnd + 1}（${block.length} 行）`);

const rest = [...lines.slice(0, blockStart), ...lines.slice(blockEnd + 1)];

/** 插入点：通用待选区（进化确认面板之前） */
const anchor = rest.findIndex((l) => l.includes("state.pendingEvolutionAck && ("));
if (anchor < 0) throw new Error('找不到插入锚点');

/** 缩进减 4（从杀手块里出来，降一层） */
const dedented = block.map((l) => (l.startsWith('    ') ? l.slice(4) : l));
const header = [
  '            {/**',
  '             * **十字弩的选僵尸面板（已从杀手区块搬出）**。',
  '             *',
  '             * ⚠ 它以前写在「杀手回合」的区块里（`phase === \'killerMain\' && 你是杀手`），',
  '             * 而十字弩是**幸存者**的特殊行动 —— 于是幸存者永远看不到选僵尸的列表，',
  '             * 点了「用十字弩」之后就像"什么都没发生"。',
  '             */}',
];

const out = [...rest.slice(0, anchor), ...header, ...dedented, '', ...rest.slice(anchor)];
writeFileSync(FILE, out.join('\n'), 'utf8');
console.log(`已搬到通用待选区（L${anchor + 1}）。`);
