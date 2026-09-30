/**
 * 批量删除「死代码」——名单来自 `scripts/tools/dead-code.mjs` 的 A 类。
 *
 * 只处理两种形态（连同紧邻上方的 jsdoc 注释一起删）：
 *   - `export function name(...) { ... }`（按大括号配平找结尾）
 *   - `export const name = ...;`（删到分号）
 *
 * ⚠ 删完**必须**跑 `tsc` 兜底：任何漏改的引用都会立刻编译失败。
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** file:name 名单 */
const TARGETS = [
  'server/src/content/loader.ts:shortestPathLength',
  'server/src/game/collapse.ts:RELIC_BACK_FALLBACK',
  'server/src/game/collapse.ts:relicMarkerFace',
  'server/src/game/collapse.ts:relicRoomStanding',
  'server/src/game/effects.ts:countGeorgeNotes',
  'server/src/game/effects.ts:relocateBlockadeToPending',
  'server/src/game/engine.ts:isSpiralRoom',
  'server/src/game/hunterTraps.ts:HUNTER_TRAP_NAME',
  'server/src/game/hunterTraps.ts:placedTrapRooms',
  'server/src/game/killerSpecials.ts:hasInjuredSurvivor',
  'server/src/game/killerSpecials.ts:addTurnPowerOnPassage',
  'server/src/game/killerSpecials.ts:stepStealthMove',
  'server/src/game/mapEffects.ts:onSurvivorEnteredRoom',
  'server/src/game/treasure.ts:chestAt',
  'client/src/cardArt.ts:RELIC_BACK_SRC',
  'client/src/KillerDock.tsx:PublicKillerStrip',
  'client/src/mapPath.ts:pathLength',
  'client/src/uiAssets.ts:RESCUE_CELLS',
];

const byFile = new Map();
for (const t of TARGETS) {
  const i = t.lastIndexOf(':');
  const file = t.slice(0, i);
  const name = t.slice(i + 1);
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(name);
}

let removed = 0;
const missing = [];

for (const [file, names] of byFile) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  /** 从后往前删，避免行号漂移 */
  const found = [];
  for (const name of names) {
    const re = new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`);
    const start = lines.findIndex((l) => re.test(l));
    if (start < 0) {
      missing.push(`${file}:${name}`);
      continue;
    }
    let end = start;
    if (/^export\s+(?:async\s+)?function\b/.test(lines[start])) {
      /** 大括号配平 */
      let depth = 0;
      for (let i = start; i < lines.length; i += 1) {
        for (const ch of lines[i]) {
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
        }
        if (depth <= 0 && i > start) {
          end = i;
          break;
        }
        if (depth <= 0 && i === start && /\}\s*$/.test(lines[i])) {
          end = i;
          break;
        }
      }
    } else {
      /** const：删到分号那行 */
      for (let i = start; i < lines.length; i += 1) {
        if (/;\s*$/.test(lines[i])) {
          end = i;
          break;
        }
      }
    }
    /** 向上吃掉紧邻的 jsdoc / 行注释 / 空行 */
    let top = start;
    let j = start - 1;
    while (j >= 0 && lines[j].trim() === '') {
      j -= 1;
    }
    if (j >= 0 && lines[j].trim().endsWith('*/')) {
      let k = j;
      while (k >= 0 && !lines[k].trim().startsWith('/**') && !lines[k].trim().startsWith('/*')) k -= 1;
      if (k >= 0) top = k;
    } else if (j >= 0 && lines[j].trim().startsWith('//')) {
      let k = j;
      while (k >= 0 && lines[k].trim().startsWith('//')) k -= 1;
      top = k + 1;
    }
    found.push({ top, end, name });
  }
  found.sort((a, b) => b.top - a.top);
  for (const f of found) {
    lines.splice(f.top, f.end - f.top + 1);
    removed += 1;
  }
  writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`${file}: 删除 ${found.map((f) => f.name).join(', ')}`);
}

console.log(`\n共删除 ${removed} 处`);
if (missing.length) console.log('没找到（名字对不上，请手动看）：\n  ' + missing.join('\n  '));
