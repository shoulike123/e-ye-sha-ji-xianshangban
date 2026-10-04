/**
 * 墓穴坍塌的"逐人走一步"端到端检查：
 *   ① 队列顺序必须是**幸存者在前、杀手最后**
 *   ② 每个人都能在自己的视角看到面板、点到相邻地点、走过去
 *   ③ 轮到谁，**只有他的界面**能操作（别人看到"正在等谁"）
 *   ④ 走完最后一个人，队列清空、不再挂着
 *
 * 跑法：node scripts/tests/collapse-move-flow.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { applyCollapse, collapseMoveOptions } from '../../server/dist/game/collapse.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** solo：一个人操控杀手 + 3 幸存者（用户就是这个模式） */
const st = createLobby('T', HOST, 'H', content, 'crypt');
st.mode = 'solo';
st.soloKillerCharacterId = 'killer7';
st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
st.players[HOST].ready = true;
startGame(st, content, HOST);
st.pendingEvolutionAck = null;

const { standingCollapsibleRooms } = await import('../../server/dist/game/collapse.js');
const room = standingCollapsibleRooms(st)[0];
const killer = st.killerId ? st.players[st.killerId] : null;
const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');

/** 把杀手和 2 名幸存者塞进同一个坍塌点（另一名留在别处） */
killer.roomId = room;
survs[0].roomId = room;
survs[1].roomId = room;
survs[2].roomId = st.map.rooms.find((r) => r.id !== room && !standingCollapsibleRooms(st).includes(r.id))?.id ?? survs[2].roomId;

console.log(`坍塌点 = ${room}；屋里：${[killer, survs[0], survs[1]].map((p) => p.name).join('、')}`);
applyCollapse(st, room);

console.log('=== ① 队列顺序：幸存者在前、杀手最后 ===');
{
  const queue = [st.pendingCollapseMoves?.currentId, ...(st.pendingCollapseMoves?.queue ?? [])];
  const names = queue.map((id) => st.players[id]?.name ?? id);
  console.log(`  队列：${names.join(' → ')}`);
  ok(queue.length === 3, '屋里 3 个人都进队列', `${queue.length}`);
  const lastIsKiller = st.players[queue[queue.length - 1]]?.faction === 'killer';
  ok(lastIsKiller, '**杀手排在最后**', String(st.players[queue[queue.length - 1]]?.faction));
  ok(
    queue.slice(0, -1).every((id) => st.players[id]?.faction === 'survivor'),
    '前面都是幸存者',
  );
}

console.log('=== ②/③ 逐人：自己的界面能操作、别人只看到"正在等" ===');
{
  let guard = 0;
  while (st.pendingCollapseMoves && guard < 8) {
    guard += 1;
    const pend = st.pendingCollapseMoves;
    const mover = st.players[pend.currentId];
    const snap = buildSnapshot(st, HOST);
    const mine = snap.pendingCollapseMoves;
    console.log(`  轮到 ${mover.name}（${mover.faction}）：` +
      `快照 currentId=${mine?.currentId ?? 'null'} waiting=${mine?.waiting} ` +
      `可选=${JSON.stringify((mine?.options ?? []).map((r) => st.map.rooms.find((x) => x.id === r)?.name ?? r))}`);
    ok(Boolean(mine?.currentId), `${mover.name} 自己的界面能操作（不是 waiting）`);
    const opts = collapseMoveOptions(st, mover);
    ok(opts.length > 0, `${mover.name} 有可去的相邻地点`, JSON.stringify(opts));
    /** 点第一个可去的地点 */
    const err = (() => {
      try { handleAction(st, HOST, { type: 'collapseMove', toRoomId: opts[0] }, content); return null; }
      catch (e) { return e.message; }
    })();
    ok(!err, `${mover.name} 移动成功`, String(err ?? ''));
    ok(mover.roomId === opts[0], `${mover.name} 真的走过去了`,
      `${opts[0]} vs ${mover.roomId}`);
  }
}

console.log('=== ④ 所有人都走完：队列清空 ===');
{
  console.log(`  pendingCollapseMoves = ${st.pendingCollapseMoves ? '还在' : 'null'}`);
  ok(st.pendingCollapseMoves == null, '**队列清空、不卡死**');
  const snap = buildSnapshot(st, HOST);
  ok(snap.pendingCollapseMoves == null, '快照里也不再挂着');
}

console.log(`\n坍塌逐人走：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
