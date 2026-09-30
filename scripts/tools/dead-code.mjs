/**
 * 找「多余的代码」——给"清死代码"用。
 *
 * 三类：
 *  A. 导出了、但**全项目（含本文件）一次都没被用过**的符号 → 可以直接删
 *  B. 只在**本文件内部**用、却还 export 的符号 → 可以去掉 export（不算错，价值低）
 *  C. CSS 里定义了、但没有任何 className 引用的类 → 可以删
 *
 * 引用来源包含：server/src、client/src、scripts（含 tests/tools）、tools。
 * 跑法：node scripts/tools/dead-code.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = [], test = /\.(ts|tsx|mjs|js)$/) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '_ssrbuild' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out, test);
    else if (test.test(e)) out.push(p);
  }
  return out;
}

const srces = [
  ...walk('server/src', [], /\.ts$/),
  ...walk('client/src', [], /\.(ts|tsx)$/),
];
const consumers = [
  ...srces,
  ...walk('scripts', [], /\.mjs$/),
  ...walk('tools', [], /\.js$/),
];

/** 全部文本，按文件缓存 */
const text = new Map();
const read = (f) => {
  if (!text.has(f)) text.set(f, readFileSync(f, 'utf8'));
  return text.get(f);
};

/** 统计某个标识符在"除定义行以外"的出现次数 */
const countUses = (name, defFile, defLine) => {
  let selfUses = 0;
  let otherUses = 0;
  for (const f of consumers) {
    const lines = read(f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (f === defFile && i + 1 === defLine) continue; // 定义那一行不算
      const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`);
      if (!re.test(line)) continue;
      if (f === defFile) selfUses += 1;
      else otherUses += 1;
    }
  }
  return { selfUses, otherUses };
};

const dead = [];
const exportOnly = [];

for (const f of srces) {
  const lines = read(f).split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = /^export\s+(?:async\s+)?(?:function|const|let|class|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (!m) return;
    const name = m[1];
    const { selfUses, otherUses } = countUses(name, f, i + 1);
    const row = { name, file: f.replace(/\\/g, '/'), line: i + 1, selfUses, otherUses };
    if (otherUses === 0 && selfUses === 0) dead.push(row);
    else if (otherUses === 0) exportOnly.push(row);
  });
}

console.log(`════ A. 完全没人用（含本文件）—— 可直接删：${dead.length} 个 ════`);
for (const r of dead) console.log(`  ${r.file}:${r.line}  ${r.name}`);

console.log(`\n════ B. 只有本文件用、却还 export —— 可去掉 export：${exportOnly.length} 个 ════`);
for (const r of exportOnly) console.log(`  ${r.file}:${r.line}  ${r.name}  (本文件用了 ${r.selfUses} 次)`);

/* ---------------- C. CSS 死类 ---------------- */
const css = readFileSync('client/src/styles.css', 'utf8');
const classDefs = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) classDefs.add(m[1]);
const used = new Set();
for (const f of [...walk('client/src', [], /\.(ts|tsx)$/), ...walk('tools', [], /\.(js|html)$/)]) {
  const src = read(f);
  for (const m of src.matchAll(/className\s*=\s*[{"'`]([^"'`]*)/g)) {
    for (const c of m[1].split(/[\s${}?:'"`]+/)) if (c) used.add(c.replace(/[^\w-]/g, ''));
  }
  /** 拼出来的类名（模板串里的固定片段）也算 */
  for (const m of src.matchAll(/([a-z][\w-]*-[\w-]+)/g)) used.add(m[1]);
}
const deadCss = [...classDefs].filter((c) => !used.has(c)).sort();
console.log(`\n════ C. CSS 里没被引用的类（含拼字符串的宽泛匹配后仍无引用）：${deadCss.length} 个 ════`);
console.log('  ' + deadCss.join('  '));
