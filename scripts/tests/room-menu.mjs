/**
 * 常驻回归测试：**地图上右键地点的小菜单**（`roomMenuRowsFor`，`client/src/Board.tsx`）。
 *
 * 规则：
 *  - 顺序：杀手 → **雕像** → 幸存者 → 僵尸 → 核心标记 → 猎手陷阱 → 宝箱 → 陷阱标记 → 响声/爆竹标记
 *  - 没有的**不列**
 *  - **杀手视角只在遭遇期间列幸存者**
 *  - **雕像逐尊列**（双方都列），**夹在杀手与幸存者之间**，杀手视角给主雕像标「（主）」
 *  - 猎手陷阱：杀手看具体类型；幸存者一律只显示「猎手陷阱」
 *  - 陷阱标记只有幸存者可见
 *  - 响声/爆竹跟着双方的可见性走
 *
 * 跑法：`npm run test:menu`
 *
 * ⚠ 这个套件要把 `Board.tsx` 编译成 JS 才能跑（它是纯前端模块），
 * 步骤见 `scripts/tests/build-menu.mjs`。
 */
import { roomMenuRowsFor } from '../../client/_ssrbuild/Board.js';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const texts = (rows) => rows.map((r) => r.text);
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, label, a === e ? '' : `实际 ${a} 期望 ${e}`);
};

const base = {
  roomId: 'R1',
  viewerFaction: 'survivor',
  occupantsHere: [],
  survivorsVisible: true,
  statuesHere: [],
  zombieCount: 0,
  coreCount: 0,
  treasureHere: false,
  trapPartHere: false,
  firecrackerHere: false,
  noiseHere: false,
  hunterTraps: [],
};

console.log('=== ① 空地点什么都不列 ===');
eq(texts(roomMenuRowsFor(base)), [], '空地点没有任何行');

console.log('=== ② 杀手视角：非遭遇期间不列幸存者 ===');
eq(
  texts(roomMenuRowsFor({
    ...base,
    viewerFaction: 'killer',
    survivorsVisible: false,
    occupantsHere: [
      { name: '狼人', faction: 'killer' },
      { name: '安娜·库布里克', faction: 'survivor' },
    ],
  })),
  ['杀手（狼人）'],
  '只有杀手那行',
);

console.log('=== ③ 杀手视角：遭遇期间列幸存者，杀手在前 ===');
eq(
  texts(roomMenuRowsFor({
    ...base,
    viewerFaction: 'killer',
    survivorsVisible: true,
    occupantsHere: [
      { name: '安娜·库布里克', faction: 'survivor' },
      { name: '狼人', faction: 'killer' },
    ],
  })),
  ['杀手（狼人）', '幸存者（安娜·库布里克）'],
  '遭遇期间列出，顺序仍是杀手在前',
);

console.log('=== ④ 雕像：双方都列，一尊一行，按编号排序 ===');
{
  const statues = [
    { index: 3, main: false },
    { index: 1, main: true },
    { index: 4, main: false },
    { index: 2, main: false },
  ];
  eq(
    texts(roomMenuRowsFor({ ...base, viewerFaction: 'survivor', statuesHere: statues })),
    ['雕像 1', '雕像 2', '雕像 3', '雕像 4'],
    '幸存者视角：4 尊都列、按编号排、不标主',
  );
  eq(
    texts(roomMenuRowsFor({ ...base, viewerFaction: 'killer', statuesHere: statues })),
    ['雕像 1（主）', '雕像 2', '雕像 3', '雕像 4'],
    '杀手视角：主雕像标（主）',
  );
  /** 只有部分雕像在同一格时只列那几尊 */
  eq(
    texts(roomMenuRowsFor({
      ...base,
      viewerFaction: 'killer',
      statuesHere: [{ index: 2, main: false }, { index: 4, main: true }],
    })),
    ['雕像 2', '雕像 4（主）'],
    '只列站在这个地点的雕像',
  );
}

console.log('=== ⑤ 雕像不并进「杀手（名称）×N」 ===');
{
  eq(
    texts(roomMenuRowsFor({
      ...base,
      viewerFaction: 'killer',
      occupantsHere: [
        { name: '雕像 1', faction: 'killer', statueIndex: 1 },
        { name: '雕像 2', faction: 'killer', statueIndex: 2 },
      ],
      statuesHere: [{ index: 1, main: true }, { index: 2, main: false }],
    })),
    ['雕像 1（主）', '雕像 2'],
    '雕像棋子只由 statuesHere 出来，不在杀手那档合并',
  );
  /** 普通杀手仍然照旧合并 */
  eq(
    texts(roomMenuRowsFor({
      ...base,
      viewerFaction: 'killer',
      occupantsHere: [
        { name: '狼人', faction: 'killer' },
        { name: '狼人', faction: 'killer' },
      ],
    })),
    ['杀手（狼人）×2'],
    '非雕像的同名杀手仍然合并 ×2',
  );
}

console.log('=== ⑥ 完整顺序 ===');
eq(
  texts(roomMenuRowsFor({
    ...base,
    viewerFaction: 'killer',
    survivorsVisible: true,
    occupantsHere: [
      { name: '安娜·库布里克', faction: 'survivor' },
      { name: '狼人', faction: 'killer' },
      { name: '雕像 1', faction: 'killer', statueIndex: 1 },
    ],
    statuesHere: [{ index: 1, main: true }],
    zombieCount: 2,
    coreCount: 3,
    hunterTraps: [{ kind: 'net', revealed: false }, { kind: 'bear', revealed: false }],
    treasureHere: true,
    firecrackerHere: true,
  })),
  [
    '杀手（狼人）',
    '雕像 1（主）',
    '幸存者（安娜·库布里克）',
    '僵尸×2',
    '核心标记×3',
    '捕网陷阱',
    '捕熊陷阱',
    '宝箱',
    '爆竹标记',
  ],
  '严格按：杀手 → 雕像 → 幸存者 → 僵尸 → 核心 → 陷阱 → 宝箱 → 陷阱标记 → 响声',
);
/** 雕像必须夹在杀手与幸存者之间：两种杀手都在场时也要保证 */
eq(
  texts(roomMenuRowsFor({
    ...base,
    viewerFaction: 'killer',
    occupantsHere: [
      { name: '安娜·库布里克', faction: 'survivor' },
      { name: '狼人', faction: 'killer' },
      { name: '雕像 1', faction: 'killer', statueIndex: 1 },
      { name: '雕像 3', faction: 'killer', statueIndex: 3 },
    ],
    statuesHere: [{ index: 1, main: true }, { index: 3, main: false }],
  })),
  ['杀手（狼人）', '雕像 1（主）', '雕像 3', '幸存者（安娜·库布里克）'],
  '雕像夹在杀手与幸存者之间（2对3 两名杀手都在场时）',
);

console.log('=== ⑦ 猎手陷阱：杀手看类型，幸存者看问号 ===');
{
  const traps = [{ kind: 'net', revealed: false }, { kind: 'net', revealed: false }];
  eq(texts(roomMenuRowsFor({ ...base, viewerFaction: 'killer', hunterTraps: traps })),
    ['捕网陷阱×2'], '杀手知道类型并合并');
  eq(texts(roomMenuRowsFor({ ...base, viewerFaction: 'survivor', hunterTraps: traps })),
    ['猎手陷阱×2'], '幸存者只显示「猎手陷阱」');
  eq(texts(roomMenuRowsFor({
    ...base, viewerFaction: 'survivor',
    hunterTraps: [{ kind: 'bone', revealed: true }],
  })), ['猎手陷阱'], '就算 revealed=true 也只显示「猎手陷阱」');
}

console.log('=== ⑧ 陷阱标记只有幸存者可见 ===');
eq(texts(roomMenuRowsFor({ ...base, viewerFaction: 'survivor', trapPartHere: true })),
  ['陷阱标记'], '幸存者看得到');
eq(texts(roomMenuRowsFor({ ...base, viewerFaction: 'killer', trapPartHere: false })),
  [], '杀手看不到');

console.log('=== ⑨ 响声 / 爆竹 ===');
eq(texts(roomMenuRowsFor({ ...base, noiseHere: true })), ['响声标记'], '只有响声');
eq(texts(roomMenuRowsFor({ ...base, firecrackerHere: true })), ['爆竹标记'], '只有爆竹');
eq(texts(roomMenuRowsFor({ ...base, noiseHere: true, firecrackerHere: true })),
  ['爆竹标记'], '两者都命中 → 只列爆竹标记');
eq(texts(roomMenuRowsFor({ ...base, noiseHere: false })), [], '不可见时不列');

console.log('=== ⑩ 没有的不列 ===');
for (const [field, val, label] of [
  ['zombieCount', 0, '僵尸 0 个'],
  ['coreCount', 0, '核心标记 0 个'],
  ['treasureHere', false, '没宝箱'],
  ['trapPartHere', false, '没陷阱标记'],
  ['noiseHere', false, '没响声'],
]) {
  eq(texts(roomMenuRowsFor({ ...base, [field]: val })), [], `${label}不列`);
}
eq(texts(roomMenuRowsFor({ ...base, hunterTraps: [] })), [], '没猎手陷阱不列');
eq(texts(roomMenuRowsFor({ ...base, statuesHere: [] })), [], '没雕像不列');

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
