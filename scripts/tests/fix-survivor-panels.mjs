/**
 * 一次性修复：把**幸存者侧的两个待选面板**从"杀手回合区块"里搬出来。
 *
 * 问题（用户报的"欧菲莉亚二技能搜索后没有选择的选项，直接卡死"）：
 *  欧菲莉亚「第六感」和迪伦「坚毅」的面板写在
 *  `{isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && (...)}`
 *  这个**杀手回合**区块里 —— 而搜索（第六感）和受伤（坚毅）都发生在
 *  **幸存者回合**，于是面板永远不渲染、服务端又在等玩家选 → 整局卡死。
 *
 * 做法：把这两块剪出来，挪到「通用待选面板」区（进化确认面板那一带，
 * 那里本来就是"什么阶段都可能出现的待选"）。
 *
 * 跑法：`node scripts/tests/fix-survivor-panels.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'client/src/GameViews.tsx';
const src = readFileSync(FILE, 'utf8');
const lines = src.split(/\r?\n/);

if (src.includes('幸存者侧的待选面板（第六感 / 坚毅）')) {
  console.log('已经搬过了，跳过。');
  process.exit(0);
}

/** 找两个面板的范围：从"欧菲莉亚「第六感」"的注释行，到坚毅面板的 `)}` */
const startMark = lines.findIndex((l) => l.includes('欧菲莉亚「第六感」：摸 2 张'));
if (startMark < 0) throw new Error('找不到第六感面板');
/** 注释前一行是 `{/**` */
const blockStart = lines[startMark - 1].trim() === '{/**' ? startMark - 1 : startMark;
/** 坚毅面板的收尾：从"照常受伤"往下找第一个 `)}` */
const soonMark = lines.findIndex((l) => l.includes('照常受伤'));
let blockEnd = -1;
for (let i = soonMark; i < soonMark + 20; i += 1) {
  if (lines[i].trim() === ')}') { blockEnd = i; break; }
}
if (blockEnd < 0) throw new Error('找不到坚毅面板收尾');

const block = lines.slice(blockStart, blockEnd + 1);
console.log(`剪出 L${blockStart + 1}–L${blockEnd + 1}（${block.length} 行）`);

const rest = [...lines.slice(0, blockStart), ...lines.slice(blockEnd + 1)];

/** 插入点：进化确认面板那一块的前面（通用待选区） */
const anchor = rest.findIndex((l) => l.includes('杀手进化到 {state.pendingEvolutionAck.toLevel} 级'));
if (anchor < 0) throw new Error('找不到插入锚点');
/** 再往上退到那个面板的 `{isActive && ... && (` 行 */
let panelStart = anchor;
for (let i = anchor; i > anchor - 12; i -= 1) {
  if (rest[i].includes("state.pendingEvolutionAck && (")) { panelStart = i; break; }
}

/** 缩进减 4 空格（从杀手块里出来，层级降一层） */
const dedented = block.map((l) => (l.startsWith('    ') ? l.slice(4) : l));
const header = [
  '            {/**',
  '             * **幸存者侧的待选面板（第六感 / 坚毅）**。',
  '             *',
  '             * ⚠ 这两块以前写在「杀手回合」的区块里（`phase === \'killerMain\' && 你是杀手`），',
  '             * 而搜索（第六感）和受伤（坚毅）都发生在**幸存者回合** ——',
  '             * 于是面板永远不显示、服务端又在等玩家选，整局卡死。',
  '             * 现在放在通用待选区：任何阶段、任何阵营都可能出现。',
  '             */}',
];

const out = [...rest.slice(0, panelStart), ...header, ...dedented, '', ...rest.slice(panelStart)];
writeFileSync(FILE, out.join('\n'), 'utf8');
console.log(`已搬到通用待选区（进化确认面板之前，L${panelStart + 1}）。`);
