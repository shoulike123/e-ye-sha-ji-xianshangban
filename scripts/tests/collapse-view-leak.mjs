/**
 * **非单人模式：坍塌的"离开废墟"只能出现在该走的那一方界面上**。
 *
 * 用户口径：「我这些都是单人模式，注意其他模式不要让杀手看到幸存者界面，
 * 幸存者不要看到杀手界面」。
 *
 * 所以 1对3 里：
 *   - 轮到幸存者走 → 只有**他自己**的快照有 `currentId` / `options` / `legalMoves`
 *     （地图上该点的格子有圈）；杀手的快照只能是 `waiting`，且没有任何可点格子
 *   - 轮到杀手走   → 反过来
 *
 * 跑法：node scripts/tests/collapse-view-leak.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { applyCollapse, standingCollapsibleRooms, collapseMoveOptions } from '../../server/dist/game/collapse.js';

const content = loadContent();

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 1对3：杀手 h + 三名幸存者 s1/s2/s3（各自一根网线） */
function mkMulti() {
  const st = createLobby('TEST', 'h', 'P0', content, 'crypt');
  st.mode = 'multi';
  const map = { h: st.players.h };
  for (const pid of ['s1', 's2', 's3']) map[pid] = createPlayer(pid, pid, pid);
  st.players = map;
  st.hostId = 'h';
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
    st.players[id].ready = true;
  });
  st.players.h.ready = true;
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  return st;
}

const st = mkMulti();
const killer = st.players[st.killerId];
const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
/** 只留一个坍塌点，让"塌哪间"确定 */
const allCollapsible = standingCollapsibleRooms(st);
const room = allCollapsible[0];
st.collapsedRooms = allCollapsible.filter((id) => id !== room);
/** 杀手 + 一名幸存者都塞进坍塌点（另一名幸存者留在别处当"无关的人"） */
killer.roomId = room;
survs[0].roomId = room;

applyCollapse(st, room);
console.log(`坍塌点 ${room}；队列 = ${[st.pendingCollapseMoves?.currentId, ...(st.pendingCollapseMoves?.queue ?? [])]
  .map((id) => `${st.players[id]?.name}(${st.players[id]?.faction})`).join(' → ')}`);

/** 每个操控者的快照（键 = 网线 id，和 `controllerId` 一致） */
const snaps = () => ({
  h: buildSnapshot(st, 'h'),
  s1: buildSnapshot(st, 's1'),
  s2: buildSnapshot(st, 's2'),
  s3: buildSnapshot(st, 's3'),
});

let guard = 0;
while (st.pendingCollapseMoves && guard < 6) {
  guard += 1;
  const mover = st.players[st.pendingCollapseMoves.currentId];
  console.log(`\n  轮到 ${mover.name}（${mover.faction}，controllerId=${mover.controllerId}）：`);
  const all = snaps();
  const mineKey = mover.controllerId;
  const mySnap = all[mineKey];
  const others = Object.entries(all).filter(([k]) => k !== mineKey);

  ok(mySnap.pendingCollapseMoves?.waiting === false,
    `**${mover.name} 自己的界面不是 waiting**`, String(mySnap.pendingCollapseMoves?.waiting));
  ok((mySnap.pendingCollapseMoves?.options?.length ?? 0) > 0,
    `**${mover.name} 自己拿得到可去的相邻地点**`,
    (mySnap.pendingCollapseMoves?.options ?? []).join(','));
  ok(mySnap.pendingCollapseMoves?.faction === mover.faction,
    '快照里的 `faction` = 该走的那一方', String(mySnap.pendingCollapseMoves?.faction));
  const opts = collapseMoveOptions(st, mover);
  ok(opts.length > 0 && opts.every((r) => (mySnap.legalMoves ?? []).includes(r)),
    '**地图高亮 = 坍塌的候选格**（该点的格子有圈）',
    `legalMoves=${JSON.stringify(mySnap.legalMoves)}`);

  for (const [key, snap] of others) {
    ok(snap.pendingCollapseMoves?.waiting === true,
      `${key}（不是该走的人）只看得到"正在等"`, String(snap.pendingCollapseMoves?.waiting));
    ok((snap.pendingCollapseMoves?.options?.length ?? 0) === 0,
      `${key} 拿不到任何可点地点`);
    ok((snap.legalMoves ?? []).length === 0,
      `**${key} 的地图上没有任何高亮**（不会替他画别人的候选）`,
      JSON.stringify(snap.legalMoves));
    /** 也不能从别的字段反推出"该走的人"的移动选项 */
    ok(snap.pendingCollapseMoves?.currentId === null,
      `${key} 的 currentId 是 null（不知道是谁、只看到名字）`,
      String(snap.pendingCollapseMoves?.currentId));
  }

  /** 不是该走的人去点，必须被拒 */
  const wrongKey = Object.keys(all).find((k) => k !== mineKey);
  const wrongErr = (() => {
    try { handleAction(st, wrongKey, { type: 'collapseMove', toRoomId: opts[0] }, content); return null; }
    catch (e) { return String(e?.message ?? e); }
  })();
  ok(Boolean(wrongErr), `**${wrongKey} 代替别人走 → 被拒**`, String(wrongErr ?? '（竟然成功）'));

  const err = (() => {
    try { handleAction(st, mineKey, { type: 'collapseMove', toRoomId: opts[0] }, content); return null; }
    catch (e) { return String(e?.message ?? e); }
  })();
  ok(!err, `${mover.name} 自己走 → 成功`, String(err ?? ''));
}

ok(st.pendingCollapseMoves == null, '队列走完、不卡死');
const after = snaps();
ok(Object.values(after).every((s) => s.pendingCollapseMoves == null),
  '**坍塌结束后所有人的快照里都不再挂着"离开废墟"**（谁都不用再点）');
ok(Object.values(after).every((s) => s.you?.id),
  '坍塌结束后每个人照样有自己的 `you`（没把谁卡成"没有棋子"）');

console.log(`\n坍塌界面不串阵营（1对3）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
