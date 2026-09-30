/**
 * 常驻回归测试：**只有女王的【君臨天下】会移动幸存者立绘**。
 *
 * `state.witnessedAt` 的含义是「杀手地图上幸存者立绘摆在哪」。
 * 规则上只有君臨天下会移动立绘 —— 其他〔感知〕类效果只是"看"，不挪立绘。
 *
 * 曾经的 bug：`confirmSenseRoom` 是所有"选一个地点感知"的**共用**处理器，
 * 里面**无条件**写 `witnessedAt` → 任何感知都会把立绘摆过去。
 *
 * 跑法：`npm run test:sense`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, handleAction, startGame,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 造一局，让 killerId 当杀手、幸存者摆在指定地点 */
function mk(killerId) {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players['h'], s: bs };
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = killerId;
  st.players['h'].ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  /** 把幸存者都挪到一个好感知的地点，并清掉目击记录 */
  for (const s of Object.values(st.players)) {
    if (s.faction === 'survivor') s.roomId = 'R1';
  }
  st.witnessedAt = {};
  return st;
}

/** 走完一次"选一个地点感知"：直接调共用处理器那条路径 */
function doSenseRoom(st, roomId) {
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.pendingEvolutionAck = null;
  /** 手工摆出"正在感知一个地点"的状态，再确认 */
  st.pendingSenseRoom = roomId;
  st.pendingSenseColor = false;
  handleAction(st, 'h', { type: 'confirmSenseRoom' }, content);
  st.pendingEvolutionAck = null;
}

console.log('=== ① 普通〔感知〕（屠夫的「感知」）：不该动立绘 ===');
{
  const st = mk('killer1');
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  console.log(`   幸存者都在 R1，witnessedAt 起始 = ${JSON.stringify(st.witnessedAt)}`);
  doSenseRoom(st, 'R1');
  console.log(`   感知 R1 之后 witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  ok(
    Object.keys(st.witnessedAt ?? {}).length === 0,
    '普通感知**没有**写入目击位置（立绘不动）',
    JSON.stringify(st.witnessedAt),
  );
  const logs = st.logs.slice(-3).map((l) => l.text);
  console.log(`   战报尾部：${logs.join(' | ')}`);
  ok(logs.some((t) => t.includes('感知')), '感知照常报出结果（信息还是给了）');
  void survs;
}

console.log('=== ② 君臨天下：应该写入目击位置（立绘跟着走）===');
{
  const st = mk('killer9');
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  /** 君臨天下的标记 */
  st.pendingSenseMoveAfter = true;
  doSenseRoom(st, 'R1');
  console.log(`   君臨天下感知 R1 之后 witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  const n = Object.keys(st.witnessedAt ?? {}).length;
  ok(n > 0, '君臨天下写入了目击位置', `${n} 人`);
  ok(
    Object.values(st.witnessedAt ?? {}).every((r) => r === 'R1'),
    '记的是被感知到的那个地点',
    JSON.stringify(st.witnessedAt),
  );
  ok(st.pendingMoveSurvivorPick != null, '接着让杀手选一名目击者移动', JSON.stringify(st.pendingMoveSurvivorPick));
  ok(st.pendingSenseMoveAfter === false, '标记已清');
  void survs;
}

console.log('=== ③ 君臨天下但没目击到人：不该记录 ===');
{
  const st = mk('killer9');
  /** 把幸存者挪到别处，感知一个空地点 */
  for (const s of Object.values(st.players)) {
    if (s.faction === 'survivor') s.roomId = 'B5';
  }
  st.pendingSenseMoveAfter = true;
  doSenseRoom(st, 'G1');
  console.log(`   感知空地点 G1 之后 witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  ok(Object.keys(st.witnessedAt ?? {}).length === 0, '没目击到人就不记录');
  ok(st.pendingSenseMoveAfter === false, '标记已清');
}

console.log('=== ④ 颜色区域感知（感知一个颜色区）：不该动立绘 ===');
{
  const st = mk('killer1');
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.pendingEvolutionAck = null;
  /** 「感知一个颜色区域」：先选颜色再确认（两个动作） */
  st.pendingSenseColor = true;
  st.pendingSenseColorPick = null;
  handleAction(st, 'h', { type: 'chooseSenseColor', color: 'R' }, content);
  handleAction(st, 'h', { type: 'confirmSense' }, content);
  console.log(`   颜色感知之后 witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  ok(Object.keys(st.witnessedAt ?? {}).length === 0, '颜色感知不写目击位置');
  ok(
    st.logs.some((l) => l.text.includes('感知红色区域')),
    '颜色感知照常报出结果',
  );
}

console.log('=== ⑤ 君臨天下：移动完之后记录落点 ===');
{
  const st = mk('killer9');
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  /** 直接模拟"已在移动这名目击者"的状态 */
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.pendingEvolutionAck = null;
  st.pendingMoveSurvivorId = surv.id;
  surv.roomId = 'R1';
  st.pendingPathDraft = { min: 0, max: 2, rooms: ['R1'] };
  st.witnessedAt = {};
  console.log(`   移动前 witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  /** 只留在原地（0 步）也算"落点" */
  handleAction(st, 'h', { type: 'finishPendingMove' }, content);
  st.pendingEvolutionAck = null;
  console.log(`   移动后 witnessedAt = ${JSON.stringify(st.witnessedAt)}`);
  ok(
    st.witnessedAt?.[surv.id] === 'R1',
    '移动结束后记录了他的落点',
    JSON.stringify(st.witnessedAt),
  );
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
