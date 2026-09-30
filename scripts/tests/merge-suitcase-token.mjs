/**
 * 一次性数据整理：把小屋的**两个手提箱 token** 合并成一个**翻面 token**。
 *
 * 改前：`suitcaseOpen`（未开）+ `suitcaseUsed`（已用）两个独立标记，坐标还差一点，
 *       渲染时按 `suitcaseAvailable` 二选一显示。
 * 改后：一个 `suitcase`，`src` = 未开、`srcBack` = 已用 ——
 *       和墓穴遗物标记同一套「翻面标记」机制（`Board.tsx` 的 `flipTokenImage`）。
 *
 * 跑法：`node scripts/tests/merge-suitcase-token.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'content/maps/cabin.json';
const map = JSON.parse(readFileSync(path, 'utf8'));

const openIdx = map.tokens.findIndex((t) => t.id === 'suitcaseOpen');
const usedIdx = map.tokens.findIndex((t) => t.id === 'suitcaseUsed');
if (openIdx < 0 || usedIdx < 0) {
  console.log('没有找到 suitcaseOpen / suitcaseUsed，无需整理。');
  process.exit(0);
}

const open = map.tokens[openIdx];
const used = map.tokens[usedIdx];

/** 位置取「未开」那个（两个坐标差不到 2.4，取哪个都一样） */
const merged = {
  id: 'suitcase',
  kind: 'suitcase',
  src: open.src,
  srcBack: used.src,
  x: open.x,
  y: open.y,
  w: open.w,
  h: open.h,
  rotation: open.rotation,
  side: open.side,
  roomId: open.roomId,
  label: '手提箱（可翻面：可用 / 已用）',
};

map.tokens = map.tokens.filter((t) => t.id !== 'suitcaseOpen' && t.id !== 'suitcaseUsed');
map.tokens.splice(openIdx, 0, merged);
writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`, 'utf8');

console.log('改前的两个 token：');
console.log('  ', JSON.stringify(open));
console.log('  ', JSON.stringify(used));
console.log('合并后：');
console.log('  ', JSON.stringify(merged));
console.log(
  '小屋现在的手提箱 token：',
  map.tokens.filter((t) => /suitcase|手提/i.test(`${t.id}${t.kind}`)).map((t) => t.id).join(', '),
);
