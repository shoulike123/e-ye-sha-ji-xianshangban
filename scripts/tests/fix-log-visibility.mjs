/**
 * 一次性整理：把「幸存者自己的行为」的战报从 `'all'` 改成 `'survivor'`。
 *
 * 背景：用户要求**杀手战报不能写幸存者的行为** —— 幸存者大回合里
 * 杀手只该看到「幸存者正在行动」+ 几条立即报告的事件（见 `effects.ts` 的
 * `SURVIVOR_PRIVATE_PHASES` 与 `needsCommon`）。
 *
 * 跑法：`node scripts/tests/fix-log-visibility.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'server/src/game/engine.ts';
let src = readFileSync(FILE, 'utf8');

/** [旧片段, 新片段] —— 都是"幸存者行为"，改成只给幸存者看 */
const EDITS = [
  // 幸运币改判〔治疗〕
  [
    "log(state, `幸运币：弃掉的是钥匙「${card.name}」，改为〔治疗〕。`, 'all', true);",
    "log(state, `幸运币：弃掉的是钥匙「${card.name}」，改为〔治疗〕。`, 'survivor');",
  ],
  // 机械知识
  [
    "log(state, `${p.name} 发动「机械知识」：从弃牌堆获得一张工具箱。`, 'all', true);",
    "log(state, `${p.name} 发动「机械知识」：从弃牌堆获得一张工具箱。`, 'survivor');",
  ],
  // 十字弩持有者 —— 女王**不该知道**谁拿了十字弩（和"雕像选主雕像""女猎手放陷阱"同级机密）
  [
    "log(state, `十字弩交给 ${target.name} 持有。`, 'all', true);",
    "log(state, `十字弩交给 ${target.name} 持有。`, 'survivor');",
  ],
  // 消除恐惧
  [
    "log(state, `${p.name} 消除恐惧。`, 'all', true);",
    "log(state, `${p.name} 消除恐惧。`, 'survivor');",
  ],
];

let ok = 0;
for (const [from, to] of EDITS) {
  if (!src.includes(from)) {
    console.log(`  未找到（可能已改过或写法不同）：${from.slice(0, 60)}…`);
    continue;
  }
  src = src.replace(from, to);
  ok += 1;
}
writeFileSync(FILE, src, 'utf8');
console.log(`已替换 ${ok} / ${EDITS.length} 条`);
