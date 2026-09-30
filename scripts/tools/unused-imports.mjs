/**
 * 找「import 了但正文没用到」的名字（`noUnusedLocals` 没开，tsc 不会报）。
 *
 * 跑法：node scripts/tools/unused-imports.mjs          # 只看
 *      node scripts/tools/unused-imports.mjs --fix     # 顺手删掉（整条 import 只剩空的话也删掉）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e === '_ssrbuild') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const FIX = process.argv.includes('--fix');
const files = [...walk('server/src'), ...walk('client/src')];
let total = 0;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split(/\r?\n/);
  /** 收集所有 import 语句块（可能跨行） */
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^import\b/.test(lines[i])) continue;
    let j = i;
    while (
      j < lines.length &&
      j < i + 40 &&
      !/from\s+['"][^'"]+['"]\s*;?\s*$/.test(lines[j]) &&
      !/^import\s+['"]/.test(lines[j])
    ) j += 1;
    /** 没找到 `from '...'` 收尾（说明不是正常的 import）→ 跳过，别把正文吃进来 */
    if (j >= lines.length || j >= i + 40) continue;
    blocks.push([i, j]);
    i = j;
  }

  const body = lines
    .map((l, i) => (blocks.some(([a, b]) => i >= a && i <= b) ? '' : l))
    .join('\n');

  const unused = [];
  const dropLines = new Set();
  for (const [a, b] of blocks) {
    const block = lines
      .slice(a, b + 1)
      .join(' ')
      /** 注释先剔掉：注释里的中文/符号会被误当成标识符（上一版就崩在这） */
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    const m = /\{([^}]*)\}/.exec(block);
    if (!m) continue;
    const names = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^type\s+/, ''))
      .filter(Boolean)
      .map((s) => {
        const as = /^(\S+)\s+as\s+(\S+)$/.exec(s);
        return as ? as[2] : s;
      });
    const gone = names.filter((n) => !new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(body));
    if (gone.length) {
      unused.push(...gone);
      if (FIX && gone.length === names.length) for (let k = a; k <= b; k += 1) dropLines.add(k);
    }
  }
  if (!unused.length) continue;
  total += unused.length;
  console.log(`${f.replace(/\\/g, '/')}: ${unused.join(', ')}`);
  if (FIX) {
    /** 本项目 import 基本是"一行一个名字"，所以直接删掉整行最稳 */
    const gone = new Set(unused);
    const kept = lines.filter((l, i) => {
      if (dropLines.has(i)) return false;
      const bare = l.trim().replace(/,$/, '').replace(/^type\s+/, '').trim();
      return !gone.has(bare);
    });
    writeFileSync(f, kept.join('\n'), 'utf8');
  }
}
console.log(`\n未使用的 import 共 ${total} 个${FIX ? '（已删除整条只剩空的 import）' : ''}`);
