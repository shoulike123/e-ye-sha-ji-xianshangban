/**
 * 墓穴 + 未命名：**坍塌走完才挂"选进化卡"**（用户口径：坍塌结算后才执行进化效果）。
 *
 * 反例（修之前）：确认进化效果 → 坍塌挂起"谁先走" → 同一时刻又把"选进化卡"
 * 挂了出来，于是界面里两个待办打架（一边问幸存者移动、一边问进化卡）。
 *
 * 跑法：node scripts/tests/collapse-then-evolution.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { runUpgrade } from '../../server/dist/game/evolution.js';
import { standingCollapsibleRooms, collapseMoveOptions } from '../../server/dist/game/collapse.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const st = createLobby('T', HOST, 'H', content, 'crypt');
st.mode = 'solo';
st.variant1 = false;
st.soloKillerCharacterId = 'killer7';       // 未命名：2 级要选进化卡
st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
st.players[HOST].ready = true;
startGame(st, content, HOST);
st.pendingEvolutionAck = null;
st.phase = 'killerMain';
st.killerTurnStep = 'fast';
st.killerMainChoice = null;
st.killerMainActionsLeft = 0;

/**
 * 把杀手和两名幸存者塞进同一个坍塌点，制造"逐人走位"。
 *
 * ⚠ `beginCollapse` 是**随机**挑一间还没塌的可坍塌地点，所以先把其余几间
 * 标记成"已经塌了"，只留这一间 —— 否则塌的可能不是我们塞了人的那间，
 * "轮流走一步"永远挂不出来（这条测试一开始就是被这个随机性坑的）。
 */
const allCollapsible = standingCollapsibleRooms(st);
const room = allCollapsible[0];
st.collapsedRooms = allCollapsible.filter((id) => id !== room);
const killer = st.killerId ? st.players[st.killerId] : null;
const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
killer.roomId = room;
survs[0].roomId = room;
survs[1].roomId = room;

const tryIt = (action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

console.log('=== ① 确认进化 → 坍塌挂起逐人走位，但**不许**同时挂出选进化卡 ===');
/** 模拟 engine 的升级入口：被坍塌拦下后补跑一次，才会挂出"待确认进化" */
runUpgrade(st);
if (st.pendingCollapseAfterEvolution) {
  st.collapseConsumedForLevel = st.pendingCollapseLevel;
  runUpgrade(st);
  st.collapseConsumedForLevel = 0;
}
ok(st.pendingEvolutionAck != null, '挂了"待确认进化"', String(Boolean(st.pendingEvolutionAck)));
const err = tryIt({ type: 'ackEvolution' });
ok(!err, '确认进化效果', String(err ?? ''));
console.log(`  确认后：pendingCollapseMoves=${st.pendingCollapseMoves ? '有人要走' : 'null'}；` +
  `pendingEvolutionCardPick=${JSON.stringify(st.pendingEvolutionCardPick)}；` +
  `pendingCollapseAfterEvolution=${st.pendingCollapseAfterEvolution}`);
ok(st.pendingCollapseMoves != null, '**坍塌挂起了"轮流走一步"**',
  `塌的是「${st.collapsedRooms[st.collapsedRooms.length - 1]}」，塞人的是「${room}」`);
ok(st.pendingEvolutionCardPick == null,
  '**这时候还没挂出"选进化卡"**（要等坍塌走完）',
  JSON.stringify(st.pendingEvolutionCardPick));
ok(st.pendingCollapseAfterEvolution === false, '坍塌已经结算过（标记被消费）');

console.log('=== ② 把坍塌的逐人走位走完 ===');
{
  let guard = 0;
  while (st.pendingCollapseMoves && guard < 8) {
    guard += 1;
    const mover = st.players[st.pendingCollapseMoves.currentId];
    const opts = collapseMoveOptions(st, mover);
    const e2 = tryIt({ type: 'collapseMove', toRoomId: opts[0] });
    console.log(`  ${mover.name}（${mover.faction}）走一步 → ${e2 ?? 'OK'}`);
    ok(!e2, `${mover.name} 能走`, String(e2 ?? ''));
  }
  ok(st.pendingCollapseMoves == null, '坍塌队列走完');
}

console.log('=== ③ 坍塌走完之后，才轮到"执行进化效果"（选卡） ===');
{
  const snap = buildSnapshot(st, HOST);
  console.log(`  走完后：pendingEvolutionCardPick=${JSON.stringify(st.pendingEvolutionCardPick)}；` +
    `pendingEvolutionAck=${Boolean(st.pendingEvolutionAck)}`);
  ok(st.pendingEvolutionCardPick != null,
    '**坍塌走完 → 挂出"选进化卡"**', JSON.stringify(st.pendingEvolutionCardPick));
  ok(snap.pendingEvolutionCardPick != null, '快照里也下发了（界面能画出来）');
  const pool = st.pendingEvolutionCardPick ?? [];
  const pickErr = tryIt({ type: 'pickEvolutionCard', cardId: pool[0] });
  ok(!pickErr, '能选一张进化卡', String(pickErr ?? ''));
  ok(st.pendingEvolutionAck == null, '选完卡，整条进化流程收尾');
}

console.log(`\n坍塌 → 进化顺序：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
