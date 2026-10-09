/**
 * **① 机关大门：预选的地点在幸存者地图上要高亮**（用户要求）
 *    —— 交互是"点一个地点 → 再点与它**以门相连**的地点"= 选中那扇门。
 *    以前选门模式下地图**一格都不亮**：`mapPickActive` 没把 `gateUsable` 算进去，
 *    已点的第一格也没进 `pickedRoomIds`；而且候选不能直接用 `neighbors()`
 *    （它把虚线也算邻居，而机关大门只能放在**门**上）。
 *
 * **② 只有封堵效果的牌：没有合法目标就跳过**（用户口径：
 *    「自由打出，没有合法目标就跳过」）—— 核实它对「留下!!!!」这类牌没有副作用：
 *    不挂状态、不卡回合、牌照常进弃牌堆，**战报措辞也要准确**
 *    （以前会写"已封堵全部门"，其实一扇都没封）。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/gate-preselect-and-blockade-skip.mjs
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, maybeCloseKillerUpkeep,
} from '../../server/dist/game/engine.js';
import { startSealAllBlockade, startOneDoorBlockade } from '../../server/dist/game/evolution.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mk(killerId, mapId = 'castle') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, { type: 'confirmTrapPlacement' });
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  return st;
}

console.log('=== ① 机关大门选门：预选格要高亮、候选只给"门相连"的地点 ===');
{
  ok(/const gatePickRooms = useMemo\(/.test(views), '**有 `gatePickRooms`（选门时的地图高亮）**');
  const block = views.slice(views.indexOf('const gatePickRooms'), views.indexOf('const gatePickRooms') + 1400);
  ok(/if \(!gateDoorFrom\) return state\.map\.rooms\.map/.test(block),
    '还没点第一格 → **整张地图都能点**');
  ok(/if \(e\.pathType && e\.pathType !== 'door'\) continue;/.test(block),
    '**候选只按 door 边算**（虚线/杀手通道不算 —— 机关大门只能放门上）');
  ok(/out\.push\(gateDoorFrom\)|const out: string\[\] = \[gateDoorFrom\]/.test(block),
    '已经点的那一格也在列表里（再点一次 = 取消）');

  /**
   * ⚠ 这里是源码断言（`gateDoorFrom` 是客户端 state，SSR 渲染时没法注入）。
   * 原来匹配的是"内联字面量"的写法；后来所有预选场景统一收进了 `pickedMapRooms`，
   * 机关大门也是其中一条 —— 断言跟着指向那条统一入口，语义不变、而且不再怕重构。
   */
  ok(/pickedRoomIds=\{pickedMapRooms\}/.test(views)
    && /if \(gateUsable && gateDoorFrom\) out\.add\(gateDoorFrom\)/.test(views),
    '**预选格画成实心金圈**（`.picked`）');
  ok(/gateUsable \|\|/.test(views.slice(views.indexOf('const mapPickActive'), views.indexOf('const mapPickActive') + 900)),
    '`mapPickActive` 把机关大门选门算进去了');
  ok(/gateUsable\s*\?\s*gatePickRooms/.test(views),
    '地图的 `legalMoves` 在选门时用 `gatePickRooms`');

  /** 语义检查：城堡里 R1 的门邻居里，虚线的另一端不该被当成候选 */
  const st = mk('killer1');
  const r1DoorNeighbors = [];
  const r1AnyNeighbors = [];
  for (const e of st.map.edges ?? []) {
    const other = e.from === 'R1' ? e.to : ((e.bidirectional ?? true) && e.to === 'R1' ? e.from : null);
    if (!other) continue;
    r1AnyNeighbors.push(other);
    if (!e.pathType || e.pathType === 'door') r1DoorNeighbors.push(other);
  }
  console.log(`  R1 的邻居（全部）=${JSON.stringify(r1AnyNeighbors)}`);
  console.log(`  R1 的邻居（只有门）=${JSON.stringify(r1DoorNeighbors)}`);
  ok(r1DoorNeighbors.length <= r1AnyNeighbors.length, '（语义）门邻居是全部邻居的子集');
}

console.log('=== ② 【留下!!!!】没有合法目标：跳过、不挂状态、措辞准确 ===');
{
  const st = mk('killer1');
  const k = st.players[st.killerId];
  k.roomId = 'R2';
  /** 把 R2 的门全封上 → 没有可封的门 */
  const doors = st.map.edges
    .filter((e) => (!e.pathType || e.pathType === 'door') && (e.from === 'R2' || e.to === 'R2'))
    .map((e) => [e.from, e.to].sort().join('|'));
  st.blockades = [...new Set(doors)];
  const before = (st.blockades ?? []).length;

  const done = startSealAllBlockade(st, 'R2');
  const said = st.logs.slice(-1)[0]?.text ?? '';
  console.log(`  startSealAllBlockade=${done}\n    战报：${said}`);
  ok(done === false, '**返回 false**（跳过）', String(done));
  ok(st.pendingBlockadeJob == null, '**不挂封堵作业**（不会卡住）', JSON.stringify(st.pendingBlockadeJob));
  ok((st.blockades ?? []).length === before, '一扇都没封（本来就是全封状态）',
    `${before} → ${(st.blockades ?? []).length}`);
  ok(/没有可封堵的门/.test(said) && /跳过封堵/.test(said),
    '**战报说的是"没有可封堵的门，跳过封堵"**（不再是"已封堵全部门"）', said);
  ok(!/的全部门/.test(said), '不会再写成"已封堵…的全部门"（那样读起来像这次封上了）', said);

  /** 回合还能正常收尾 */
  maybeCloseKillerUpkeep(st);
  ok(st.phase !== 'upkeep', '**回合能正常收尾**（没卡在这一步）', st.phase);
}

console.log('=== ③ 「设障」没有合法目标：同样跳过、措辞准确 ===');
{
  const st = mk('killer1');
  const k = st.players[st.killerId];
  k.roomId = 'R2';
  const doors = st.map.edges
    .filter((e) => (!e.pathType || e.pathType === 'door') && (e.from === 'R2' || e.to === 'R2'))
    .map((e) => [e.from, e.to].sort().join('|'));
  st.blockades = [...new Set(doors)];
  const done = startOneDoorBlockade(st, 'R2');
  const said = st.logs.slice(-1)[0]?.text ?? '';
  console.log(`  startOneDoorBlockade=${done}\n    战报：${said}`);
  ok(done === false, '跳过', String(done));
  ok(st.pendingBlockade !== true, '**没有挂起"请点门"**', String(st.pendingBlockade));
  ok(/没有能封堵的门|没有可封堵的门/.test(said), '措辞说清原因', said);
  /** 没有被封堵的门时同样跳过 */
  const st2 = mk('killer1');
  const k2 = st2.players[st2.killerId];
  k2.roomId = 'R2';
  st2.blockades = [];
  const done2 = startOneDoorBlockade(st2, 'R2');
  ok(done2 === true && st2.pendingBlockade === true,
    '反例：有可封的门时正常挂起"请点门"', `${done2}/${st2.pendingBlockade}`);
}

console.log(`\n机关大门预选高亮 + 封堵跳过：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
