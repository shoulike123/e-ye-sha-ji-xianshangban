/**
 * 把 `client/src/Board.tsx` 编译成可在 node 里直接 import 的 ESM，
 * 供 `scripts/tests/room-menu.mjs` 测纯函数 `roomMenuRowsFor`。
 *
 * 为什么要这一步：Board 是前端模块，`tsc -b` 只做类型检查（noEmit），
 * 而右键菜单的内容计算是个纯函数，单独测比在浏览器里点更可靠。
 *
 * 步骤：① 用 TypeScript 的 JS API 编译到 `client/_ssrbuild`
 *      ② 给相对 import 补 `.js` 后缀（node ESM 要求显式扩展名）
 *      ③ 放一个 `{"type":"module"}` 让 `.js` 按 ESM 解析
 *
 * ⚠ 用 `typescript` 的 API 而不是 `npx tsc` ——
 * 后者在 Windows 上从 node 里 spawn 会因为找不到 `npx.cmd` 而 ENOENT。
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const clientDir = path.join(root, 'client');
const outDir = path.join(clientDir, '_ssrbuild');

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    useDefineForClassFields: true,
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    skipLibCheck: true,
    moduleResolution: 'bundler',
    isolatedModules: true,
    moduleDetection: 'force',
    noEmit: false,
    outDir: '_ssrbuild',
    rootDir: 'src',
    jsx: 'react-jsx',
    strict: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noFallthroughCasesInSwitch: true,
    noUncheckedSideEffectImports: true,
    types: ['node'],
  },
  include: ['src/Board.tsx', 'src/types.ts', 'src/GameViews.tsx', 'src/cardUse.ts'],
};

console.log('① 编译 Board.tsx → client/_ssrbuild');
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });

const cfgPath = path.join(clientDir, '__tmp_menu_tsconfig.json');
writeFileSync(cfgPath, JSON.stringify(TSCONFIG), 'utf8');
const parsed = ts.parseJsonConfigFileContent(
  TSCONFIG,
  ts.sys,
  clientDir,
  undefined,
  cfgPath,
);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const emitResult = program.emit();
const diags = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
if (diags.length) {
  console.log(ts.formatDiagnosticsWithColorAndContext(diags, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => clientDir,
    getNewLine: () => '\n',
  }));
}
rmSync(cfgPath, { force: true });
if (emitResult.emitSkipped) {
  console.error('编译失败');
  process.exit(1);
}

console.log('② 给相对 import 补 .js 后缀');
for (const f of readdirSync(outDir).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outDir, f);
  const src = readFileSync(p, 'utf8');
  const fixed = src.replace(/from '(\.[^']*)'/g, (m, spec) =>
    spec.endsWith('.js') ? m : `from '${spec}.js'`);
  if (fixed !== src) writeFileSync(p, fixed, 'utf8');
}

console.log('③ 放 {"type":"module"}');
writeFileSync(path.join(outDir, 'package.json'), '{ "type": "module" }\n', 'utf8');

console.log('完成：可以跑 node scripts/tests/room-menu.mjs');
