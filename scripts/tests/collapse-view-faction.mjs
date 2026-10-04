/**
 * 单人模式：坍塌逐人走时，**界面阵营**必须是"轮到谁就切到谁那边"
 * （用户口径：幸存者被砸 → 切幸存者界面；杀手被砸 → 杀手界面）。
 *
 * 跑法：node scripts/tests/collapse-view-faction.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { applyCollapse, standingCollapsibleRooms, collapseMoveOptions } from '../../server/dist/game/collapse.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 复刻客户端 `viewerFactionOf` 的 solo 分支判定顺序（只看坍塌相关的几支） */
function viewerFactionOfCopy(snap) {
  if (snap.pendingCollapseMoves && !snap.pendingCollapseMoves.waiting)
    return snap.you.faction === 'survivor' ? 'survivor' : 'killer';
  if (
    snap.pendingEvolutionAck || snap.pendingWhizSearch ||
    snap.pendingOverFearWound || snap.pendingBlockadeJob
  ) return 'killer';
  if (snap.pendingAmulet) return 'survivor';
  if (snap.phase === 'encounter') return 'survivor';
  if (snap.phase === 'killerMain' || snap.phase === 'noiseReport' || snap.phase === 'upkeep')
    return 'killer';
  return 'survivor';
}

const st = createLobby('T', HOST, 'H', content, 'crypt');
st.mode = 'solo';
st.soloKillerCharacterId = 'killer7';
st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
st.players[HOST].ready = true;
startGame(st, content, HOST);
st.pendingEvolutionAck = null;

const room = standingCollapsibleRooms(st)[0];
const killer = st.killerId ? st.players[st.killerId] : null;
const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
killer.roomId = room;
survs[0].roomId = room;
survs[1].roomId = room;
survs[2].roomId = st.map.rooms.find((r) => !standingCollapsibleRooms(st).includes(r.id))?.id ?? survs[2].roomId;

applyCollapse(st, room);
console.log(`坍塌点 ${room}；队列 = ${[st.pendingCollapseMoves?.currentId, ...(st.pendingCollapseMoves?.queue ?? [])].map((id) => `${st.players[id]?.name}(${st.players[id]?.faction})`).join(' → ')}`);

let guard = 0;
while (st.pendingCollapseMoves && guard < 8) {
  guard += 1;
  const mover = st.players[st.pendingCollapseMoves.currentId];
  const snap = buildSnapshot(st, HOST);
  const faction = viewerFactionOfCopy(snap);
  console.log(`\n  轮到 ${mover.name}（${mover.faction}）：` +
    `快照 you=${snap.you.name}(${snap.you.faction}) → 界面=${faction}`);
  ok(snap.you.id === mover.id, `**快照 you 指向该移动的人**（${mover.name}）`,
    `${snap.you.name} vs ${mover.name}`);
  ok(
    faction === (mover.faction === 'survivor' ? 'survivor' : 'killer'),
    `**界面切到 ${mover.faction === 'survivor' ? '幸存者' : '杀手'} 那边**`,
    faction,
  );
  const opts = collapseMoveOptions(st, mover);
  const err = (() => {
    try { handleAction(st, HOST, { type: 'collapseMove', toRoomId: opts[0] }, content); return null; }
    catch (e) { return e.message; }
  })();
  ok(!err, `${mover.name} 能移动（不会卡死）`, String(err ?? ''));
}

ok(st.pendingCollapseMoves == null, '队列走完、不挂着');
console.log(`\n坍塌界面阵营：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
