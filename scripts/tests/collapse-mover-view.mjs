/**
 * **坍塌「轮流走一步」时，各方只该看到自己的界面。**
 *
 * 用户报的：「坍塌时若杀手需移动，幸存者方加载出了杀手的界面，
 * 这是不行的（幸存者方任何时候都不应加载出杀手界面）」。
 *
 * 根因在快照的 `viewPieceRaw`：它直接取「当前该走的人」（`collapseMoverNow`），
 * **没判这个观众是不是那个人** —— 轮到杀手离开废墟时，
 * **所有人**（包括幸存者玩家）的快照 `you` 都变成了杀手。
 * 现在先过一道 `controlsPiece`，不是自己的人就继续走原来的判定。
 *
 * 跑法：node scripts/tests/collapse-mover-view.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { applyCollapse, collapseMoveOptions } from '../../server/dist/game/collapse.js';

const content = loadContent();
const COLLAPSE_ROOM = 'G5';
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, who, action) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mkDuo() {
  const st = createLobby('T', 'h', 'H', content, 'crypt');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, 'h', { type: 'confirmTrapPlacement' });
  }
  st.phase = 'killerMain';
  return st;
}

console.log('=== ① 两个幸存者 + 杀手一起被压在废墟里 ===');
{
  const st = mkDuo();
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor').slice(0, 2);
  k.roomId = COLLAPSE_ROOM;
  for (const s of survs) s.roomId = COLLAPSE_ROOM;
  applyCollapse(st, COLLAPSE_ROOM);
  const q = st.pendingCollapseMoves;
  console.log(`  队列=${JSON.stringify(q?.queue)} 当前=${q?.currentId}`);
  ok(q?.currentId === survs[0].id, '队列里**幸存者先走**、杀手最后', String(q?.currentId));

  /** 每一步都检查：双方看到的必须是自己的阵营 */
  let step = 0;
  const seen = [];
  while (st.pendingCollapseMoves && step < 5) {
    step += 1;
    const pend = st.pendingCollapseMoves;
    const who = st.players[pend.currentId];
    const kSnap = buildSnapshot(st, 'h');
    const sSnap = buildSnapshot(st, 's');
    seen.push({ who: `${who.name}(${who.faction})`, kYou: kSnap.you.faction, sYou: sSnap.you.faction });
    console.log(`  轮到 ${who.name}(${who.faction})：` +
      `杀手方看 ${kSnap.you.faction}(active=${kSnap.controllingActive}) / ` +
      `幸存者方看 ${sSnap.you.faction}(active=${sSnap.controllingActive})`);
    ok(kSnap.you.faction === 'killer', `**杀手方只看杀手**（轮到 ${who.faction}）`,
      kSnap.you.faction);
    ok(sSnap.you.faction === 'survivor', `**幸存者方只看幸存者**（轮到 ${who.faction}）`,
      `${sSnap.you.faction} ${sSnap.you.id}`);
    /** 只有该走的人能动 */
    ok(kSnap.controllingActive === (who.faction === 'killer'), '杀手方的可操作性正确',
      String(kSnap.controllingActive));
    ok(sSnap.controllingActive === (who.faction === 'survivor'), '幸存者方的可操作性正确',
      String(sSnap.controllingActive));
    /** 让该走的人走一步 */
    const opts = collapseMoveOptions(st, who);
    const sock = who.faction === 'killer' ? 'h' : 's';
    const err = tryIt(st, sock, { type: 'collapseMove', toRoomId: opts[0] });
    ok(!err, `${who.name} 离开废墟`, String(err ?? ''));
  }
  ok(st.pendingCollapseMoves == null, '队列走完了', String(step));
  ok(seen.some((x) => x.who.includes('killer')), '（覆盖到了"轮到杀手"这一步）',
    JSON.stringify(seen));
}

console.log('=== ② 单人对面（solo 热座）：轮到谁就显示谁 ===');
{
  const st = createLobby('T', 'h', 'H', content, 'crypt');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor').slice(0, 1);
  k.roomId = COLLAPSE_ROOM;
  for (const s of survs) s.roomId = COLLAPSE_ROOM;
  applyCollapse(st, COLLAPSE_ROOM);
  const who = st.players[st.pendingCollapseMoves.currentId];
  const snap = buildSnapshot(st, 'h');
  console.log(`  热座：轮到 ${who.name}(${who.faction}) → 界面看 ${snap.you.faction}`);
  ok(snap.you.id === who.id, '**热座下一台电脑就显示"该走的那个人"**', snap.you.id);
  ok(snap.controllingActive === true, '热座下能动', String(snap.controllingActive));
}

console.log(`\n坍塌视角：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
