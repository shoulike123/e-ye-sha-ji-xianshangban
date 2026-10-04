/**
 * **跑全部测试的唯一入口**（`npm run test:all`）。
 *
 * 为什么需要它：`scripts/tests/` 里混着三类东西 ——
 *   ① 真测试（读代码/跑引擎，只打印结果）
 *   ② **生成器**（会 `writeFileSync` 到 `Image/`、`content/` 里，覆盖正式素材/数据）
 *   ③ 需要命令行参数的工具（png-crop / png-downscale）
 *
 * 以前"跑全部测试"是手敲一句 `Get-ChildItem scripts\tests\*.mjs` 循环执行 ——
 * 于是 ② 被当成测试跑了：`build-crypt-assets.mjs` 把用户已经替换好的
 * 坍塌板块 / 遗物正背面 / 遗物牌背**盖回了占位图**。
 *
 * 所以这里做**静态检查**：读每个脚本的源码，只要它写 `Image/` 或 `content/`
 * 就**跳过并警告**（新增生成器也挡得住，不靠人工维护黑名单）。
 * 另外显式列一份"需要参数"的跳过名单。
 *
 * 跑法：`npm run test:all`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TESTS_DIR = path.join('scripts', 'tests');

/** 需要命令行参数的工具（不传参数只会打印用法并退出 1，不算测试） */
const NEEDS_ARGS = new Set(['png-crop.mjs', 'png-downscale.mjs']);
/** 构建产物用的脚本（各自跑各自的时机，别混进测试循环） */
const BUILDERS = new Set(['build-menu.mjs', 'build-ssr.mjs']);
/**
 * **已知的生成器**（会往 `Image/` 或 `content/` 写文件）—— 显式列一份，
 * 和下面的静态检查**双保险**：静态检查挡以后新增的生成器，
 * 这份名单挡"路径是变量、静态检查看不出"的（`build-new-maps.mjs` 就是
 * `writeFileSync(path, ...)`，写的是 `content/maps/*.json`）。
 */
const GENERATORS = new Set([
  'build-crypt-assets.mjs',
  'build-gate-icon.mjs',
  'build-new-maps.mjs',
  'build-icons.mjs',
]);

/** 会往正式素材 / 内容里写文件的脚本 = 生成器，绝不能当测试跑 */
const WRITES_ASSETS = /writeFileSync\(\s*['"`](?:Image|content)\//;

function classify(file) {
  if (NEEDS_ARGS.has(file)) return { run: false, why: '需要命令行参数' };
  if (BUILDERS.has(file)) return { run: false, why: '构建脚本（按需单独跑）' };
  if (GENERATORS.has(file)) return { run: false, why: '生成器：会覆盖 Image/ 或 content/ 里的正式文件' };
  const src = readFileSync(path.join(TESTS_DIR, file), 'utf8');
  if (WRITES_ASSETS.test(src)) return { run: false, why: '生成器：会覆盖 Image/ 或 content/ 里的正式文件' };
  return { run: true, why: '' };
}

/** 跑一个命令，输出直接透传（**不能用管道捕获**：受限环境会 EPERM） */
function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  const code = r.status ?? 1;
  if (code !== 0) console.log(`  ✗ ${label}`);
  return code === 0;
}

console.log('══ 准备：编译服务端 + 生成 SSR 构建 ══');
if (!run('node', [path.join('node_modules', 'typescript', 'bin', 'tsc'), '-p', 'server/tsconfig.json'], 'server tsc')) {
  process.exit(1);
}
if (!run('node', [path.join('node_modules', 'typescript', 'bin', 'tsc'), '-b', 'client/tsconfig.json'], 'client tsc')) {
  process.exit(1);
}
if (!run('node', [path.join(TESTS_DIR, 'build-menu.mjs')], 'build-menu')) {
  process.exit(1);
}

const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.mjs')).sort();

/** `--list`：只打印分类不执行（改完这个文件自检用） */
if (process.argv.includes('--list')) {
  for (const file of files) {
    const { run: should, why } = classify(file);
    console.log(`${should ? '跑  ' : '跳过'} ${file}${why ? ` —— ${why}` : ''}`);
  }
  process.exit(0);
}

const skipped = [];
const failed = [];
let ran = 0;

console.log(`\n══ 跑测试（共 ${files.length} 个 .mjs）══`);
for (const file of files) {
  const { run: should, why } = classify(file);
  if (!should) { skipped.push(`${file} —— ${why}`); continue; }
  ran += 1;
  /** 一个测试一个进程；输出直接透传，只有失败才在这里打一行 */
  if (!run('node', [path.join(TESTS_DIR, file)], file)) failed.push(file);
}

console.log('\n════════ 汇总 ════════');
console.log(`跑了 ${ran} 个测试，失败 ${failed.length} 个`);
if (skipped.length) {
  console.log(`跳过 ${skipped.length} 个（**生成器/工具，绝不能当测试跑**）：`);
  for (const s of skipped) console.log(`  · ${s}`);
}
if (failed.length) {
  console.log('失败清单：');
  for (const f of failed) console.log(`  ✗ ${f}`);
}
process.exit(failed.length ? 1 : 0);
