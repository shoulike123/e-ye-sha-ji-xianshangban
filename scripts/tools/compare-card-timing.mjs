/**
 * 把《杀手卡牌一览》docx 里的「卡牌类型 / 使用时机」与
 * `content/cards/killers.json` 逐张比对，列出**对不上**的牌。
 *
 * 用法：node scripts/tools/compare-card-timing.mjs <docx文本文件>
 * （docx 先用 `node scripts/tools/docx-text.mjs <docx> <out.txt>` 转成文本）
 */
import { readFileSync } from 'node:fs';

const txtPath = process.argv[2];
if (!txtPath) {
  console.error('用法：node scripts/tools/compare-card-timing.mjs <docx文本文件>');
  process.exit(2);
}
const lines = readFileSync(txtPath, 'utf8').split('\n');

/** 时机列 → 标准 id */
const TIMING_ID = {
  快速时机: 'fast',
  慢速时机: 'slow',
  特殊时机: 'special',
  攻击时机: 'attack',
};
/** 类型列 → 标准速度（单值） */
const TYPE_ID = {
  快速: 'fast',
  慢速: 'slow',
  特殊: 'special',
  攻击: 'attack',
};

/* ---------- ① 从 docx 文本里抠出每条记录 ---------- */
/** 一段里的记录：名称 / 类型 / 时机 / 消耗 / 锁定 / 效果，用 tab 前缀行区分 */
const doc = new Map(); // killerId -> [{name, type, timings[]}]
let owner = null;
/** 表头也要跳过：`卡牌名称` + 后面 5 个缩进单元格（类型/时机/消耗/锁定/效果） */
let skipCells = 0;
/** 各杀手的标题行（无缩进，夹在两张表之间，不能当成卡名） */
const KILLER_TITLES = new Set([
  '屠夫', '幽魂', '谋杀者', '女猎手', '狼人', '雕像', '未命名', '扼杀者', '女王',
]);
for (const raw of lines) {
  const indented = raw.startsWith('\t');
  const cell = raw.trim();
  if (!cell) continue;
  const m = /代码 id：(killer\d+)/.exec(cell);
  if (m) {
    owner = m[1];
    doc.set(owner, []);
    skipCells = 0;
    continue;
  }
  if (!owner) continue;
  if (cell === '卡牌名称') {
    skipCells = 5;
    continue;
  }
  if (skipCells > 0) {
    if (indented) skipCells -= 1;
    continue;
  }
  /** 表格外的行：额外条件说明 / 杀手标题 */
  if (cell.startsWith('额外条件：') || KILLER_TITLES.has(cell)) continue;
  const list = doc.get(owner);
  /**
   * ⚠ **卡牌名称那一列不带缩进**，后面 5 列（类型/时机/消耗/锁定/效果）才带。
   * 所以：无缩进 = 新记录的开始；有缩进 = 往当前记录里填下一格。
   */
  if (!indented) {
    list.push({ name: cell, _filled: 1 });
    continue;
  }
  const cur = list[list.length - 1];
  if (!cur || cur._filled >= 6) continue;
  const slot = cur._filled;
  if (slot === 1) cur.typeRaw = cell;
  else if (slot === 2) cur.timingRaw = cell;
  else if (slot === 3) cur.costRaw = cell;
  else if (slot === 4) cur.lockRaw = cell;
  else if (slot === 5) cur.text = cell;
  cur._filled = slot + 1;
}

/* ---------- ② 从 content 里读代码里的类型/时机 ---------- */
const json = JSON.parse(readFileSync('content/cards/killers.json', 'utf8'));
const cards = json.decks.killerAction;
/** 代码里：时机集合 = timings（有的话）否则 [speed] */
const codeTimings = (c) => (c.timings?.length ? [...c.timings] : [c.speed]);

/* ---------- ③ 逐张比对（同名的按出现顺序配对） ---------- */
const problems = [];
let checked = 0;
for (const [killerId, rows] of doc) {
  const mine = cards.filter((c) => c.owner === killerId);
  /** 按名字分组，组内按出现顺序配 */
  const used = new Set();
  for (const r of rows) {
    const norm = r.name.replace(/\s+/g, '');
    const pick = mine.find((c) => !used.has(c.id) && c.name.replace(/\s+/g, '') === norm);
    if (!pick) {
      problems.push({ killerId, name: r.name, why: '代码里找不到同名卡', docType: r.typeRaw, docTiming: r.timingRaw });
      continue;
    }
    used.add(pick.id);
    checked += 1;

    /** docx 类型列：可能是「攻击/慢速」 */
    const docTypes = r.typeRaw.split('/').map((s) => s.trim()).filter(Boolean);
    const docTypeIds = docTypes.map((t) => TYPE_ID[t] ?? `?${t}`);
    /** docx 时机列：可能「攻击时机 / 慢速时机」 */
    const docTimingIds = r.timingRaw
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((t) => TIMING_ID[t] ?? `?${t}`);
    const codeIds = codeTimings(pick);

    const sameSet = (a, b) =>
      a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

    if (!sameSet(docTimingIds, codeIds)) {
      problems.push({
        killerId, name: pick.name, id: pick.id,
        why: '**时机对不上**',
        docType: r.typeRaw, docTiming: r.timingRaw,
        codeSpeed: pick.speed, codeTimings: JSON.stringify(pick.timings ?? null),
      });
      continue;
    }
    /**
     * 类型列也要能解释：单值类型必须等于 speed；
     * 多值类型（攻击/慢速）等价于 timings —— 只要时机集合一致就算对。
     */
    if (docTypeIds.length === 1 && docTypeIds[0] !== pick.speed) {
      problems.push({
        killerId, name: pick.name, id: pick.id,
        why: '**类型对不上**（时机集合一致，但类型那格和 speed 不同）',
        docType: r.typeRaw, docTiming: r.timingRaw,
        codeSpeed: pick.speed, codeTimings: JSON.stringify(pick.timings ?? null),
      });
      continue;
    }
    /** 消耗手牌：docx 写「N 张」或「—」 */
    const docCost = /^—$/.test(r.costRaw ?? '') ? 0 : Number(/(\d+)/.exec(r.costRaw ?? '')?.[1] ?? NaN);
    const codeCost = pick.handCost ?? 0;
    if (Number.isFinite(docCost) && docCost !== codeCost) {
      problems.push({
        killerId, name: pick.name, id: pick.id,
        why: '**消耗手牌对不上**',
        docType: `消耗=${r.costRaw}`, docTiming: `锁定=${r.lockRaw}`,
        codeSpeed: `handCost=${pick.handCost ?? '（没写，当 0）'}`,
      });
      continue;
    }
    /** 锁定等级：docx 写「锁定（等级 N）」或「否」 */
    const docLock = /等级\s*(\d+)/.exec(r.lockRaw ?? '');
    const codeLock = pick.unlockLevel ?? pick.unlockAtLevel ?? null;
    if (docLock && Number(docLock[1]) !== codeLock) {
      problems.push({
        killerId, name: pick.name, id: pick.id,
        why: '**锁定等级对不上**',
        docType: `锁定=${r.lockRaw}`, docTiming: '',
        codeSpeed: `unlockLevel=${codeLock}`,
      });
    } else if (!docLock && /^否$/.test(r.lockRaw ?? '') && codeLock != null) {
      problems.push({
        killerId, name: pick.name, id: pick.id,
        why: '**锁定对不上**（表里说"否"，代码却是锁定牌）',
        docType: `锁定=${r.lockRaw}`, docTiming: '',
        codeSpeed: `unlockLevel=${codeLock}`,
      });
    }
  }
  /** 代码里有、docx 没列的 */
  for (const c of mine) {
    if (!used.has(c.id)) {
      problems.push({ killerId, name: c.name, id: c.id, why: 'docx 里没有这张（或名字对不上）', codeSpeed: c.speed });
    }
  }
}

console.log(`比对完成：docx 里认到 ${checked} 条，代码里 ${cards.length} 张`);
console.log(`差异 ${problems.length} 条\n`);
for (const p of problems) {
  console.log(`[${p.killerId}] ${p.name}${p.id ? ` (${p.id})` : ''}`);
  console.log(`   ${p.why}`);
  if (p.docType) console.log(`   docx：类型=${p.docType}  时机=${p.docTiming}`);
  if (p.codeSpeed) console.log(`   代码：speed=${p.codeSpeed}  timings=${p.codeTimings ?? 'null'}`);
  console.log('');
}
