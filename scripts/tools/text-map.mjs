/**
 * 汇总"文案都写在哪"的数据，供写文档用。
 * 输出：content 各文件的文案条数、客户端中文行数、服务端 log/报错分布。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = [], filter = /\.(ts|tsx)$/) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out, filter);
    else if (filter.test(e)) out.push(p);
  }
  return out;
}
const R = (p) => JSON.parse(readFileSync(p, 'utf8'));

console.log('════ content：内容文案条数 ════');
for (const f of ['content/cards/killers.json', 'content/cards/official.json']) {
  const c = R(f);
  let cards = 0;
  let withText = 0;
  for (const list of Object.values(c.decks ?? {})) {
    for (const card of list) {
      cards += 1;
      if (card.text) withText += 1;
    }
  }
  const decks = Object.keys(c.decks ?? {}).join(', ');
  console.log(`${f}: ${cards} 张牌（有牌面文字 ${withText}）｜decks: ${decks}`);
}
{
  const c = R('content/characters/official.json');
  const list = c.characters ?? [];
  console.log(`content/characters/official.json: ${list.length} 个角色（名字 + description + skills）`);
}
for (const m of ['cabin', 'castle', 'crypt', 'laboratory', 'mansion']) {
  const c = R(`content/maps/${m}.json`);
  const rooms = c.rooms ?? [];
  const named = rooms.filter((r) => r.name).length;
  const killerNamed = rooms.filter((r) => r.nameKiller).length;
  console.log(`content/maps/${m}.json: ${rooms.length} 个房间（带名字 ${named}，带杀手侧名字 ${killerNamed}）`);
}
{
  const c = R('content/cards/notes.json');
  let n = 0;
  for (const list of Object.values(c.decks ?? {})) n += list.length;
  console.log(`content/cards/notes.json: ${n} 张笔记`);
  console.log('content/rules.json 字段:', Object.keys(R('content/rules.json')).join(', '));
}

console.log('\n════ 客户端：中文行数 ════');
const rows = [];
for (const f of walk('client/src')) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  let n = 0;
  for (const l of lines) {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue;
    if (!/[\u4e00-\u9fa5]/.test(l)) continue;
    if (/['"`][^'"`]*[\u4e00-\u9fa5]/.test(l) || />[^<>{}]*[\u4e00-\u9fa5]/.test(l)) n += 1;
  }
  if (n) rows.push([f.replace(/\\/g, '/'), n]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [f, n] of rows) console.log(String(n).padStart(5), f);

console.log('\n════ 服务端：战报 log() 与报错 throw ════');
const srows = [];
for (const f of walk('server/src')) {
  const src = readFileSync(f, 'utf8');
  const logs = (src.match(/log\(state,/g) || []).length;
  const errs = (src.match(/throw new Error\(/g) || []).length;
  if (logs || errs) srows.push([f.replace(/\\/g, '/'), logs, errs]);
}
srows.sort((a, b) => b[1] - a[1]);
console.log('log()  throw  文件');
for (const [f, l, e] of srows) console.log(String(l).padStart(4), String(e).padStart(5), ' ', f);

console.log('\n════ GameViews.tsx 的大区块（注释里的分节标题）════');
{
  const lines = readFileSync('client/src/GameViews.tsx', 'utf8').split(/\r?\n/);
  let shown = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*\/\*\*\s*$/.test(lines[i]) ? lines[i + 1] : null;
    if (!m) continue;
    const t = m.replace(/^\s*\*\s?/, '').trim();
    if (t.length < 4 || t.startsWith('@')) continue;
    console.log(String(i + 1).padStart(5), t.slice(0, 60));
    shown += 1;
    if (shown > 40) break;
  }
}
