/**
 * **幸存者拆封堵：由他自己选拆哪一块**（用户口径：
 * 「幸存者移除封堵应该是他自己选择移除，不是自动」）。
 *
 * 改之前：一般行动「移除封堵」和手斧都只传**房间号**，
 * `removeBlockade` 就在那间屋子的几块封堵里**随便挑一块**拆掉。
 * 现在：给 `doorId` 就拆那一扇；不给时**只有"这儿正好一块"才成立**，多块要求选。
 *
 * 跑法：node scripts/tests/blockade-remove-choose.mjs
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, sid, action) => {
  try { handleAction(st, sid, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const canon = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 1对1：找出一个"至少有 2 扇门"的地点，把其中两扇都封上 */
function mk() {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = HOST;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  const p = Object.values(st.players).find((x) => x.faction === 'survivor' && x.alive);
  /** 找"门 ≥ 2 扇"的地点 */
  const doorsAt = (roomId) =>
    (st.map.edges ?? [])
      .filter((e) => (!e.pathType || e.pathType === 'door'))
      .flatMap((e) => {
        if (e.from === roomId) return [canon(e.from, e.to)];
        if ((e.bidirectional ?? true) && e.to === roomId) return [canon(e.from, e.to)];
        return [];
      });
  const spot = st.map.rooms.find((r) => doorsAt(r.id).length >= 2);
  p.roomId = spot.id;
  const doors = doorsAt(spot.id).slice(0, 2);
  st.blockades = [...doors];
  st.activeSurvivorIndex = st.turnOrder.indexOf(p.id);
  p.mainActionUsed = false;
  p.moveLeft = st.rules.survivorMoveRange;
  p.extraActionUsedThisTurn = false;
  p.haltedThisRound = false;
  return { st, p, doors, spot };
}

console.log('=== ① 一般行动「移除封堵」：多块时必须选 ===');
{
  const { st, p, doors, spot } = mk();
  console.log(`  地点「${spot.id}」上封了 ${doors.join(' 和 ')}`);
  const err = tryIt(st, p.controllerId, { type: 'removeBlockade' });
  console.log(`  不带 doorId → ${err ?? '（通过了）'}`);
  ok(err != null && /请选择要拆除哪一块/.test(err), '**多块时不带 doorId 会被拒**', String(err));
  ok(st.blockades.length === 2, '被拒之后一块都没少', JSON.stringify(st.blockades));

  const err2 = tryIt(st, p.controllerId, { type: 'removeBlockade', doorId: doors[1] });
  console.log(`  指定拆「${doors[1]}」→ ${err2 ?? 'OK'}；剩下 ${JSON.stringify(st.blockades)}`);
  ok(err2 == null, '指定那扇门就能拆', String(err2));
  ok(!st.blockades.includes(doors[1]), '**拆掉的正是点的那一块**');
  ok(st.blockades.includes(doors[0]), '**另一块还在**（不是随便挑一块）');
  ok(p.mainActionUsed === true, '占掉一般行动');

  /** 别人屋子上的封堵不能拆 */
  const { st: st2, p: p2, doors: d2 } = mk();
  const other = Object.values(st2.players).find((x) => x.faction === 'survivor' && x.id !== p2.id);
  const err3 = tryIt(st2, p2.controllerId, { type: 'removeBlockade', doorId: canon(other.roomId, 'R1') });
  ok(err3 != null, '拆"不在你所在地点"的门会被拒', String(err3));
  void d2;
}

console.log('\n=== ② 手斧拆除：同样要选，而且选错不消耗手斧 ===');
{
  const { st, p, doors } = mk();
  p.items = { ...p.items, axe: 1 };
  const err = tryIt(st, p.controllerId, { type: 'useItem', itemId: 'axe' });
  console.log(`  不带 doorId → ${err ?? '（通过了）'}；手斧剩 ${p.items.axe ?? 0}`);
  ok(err != null && /请选择要拆除哪一块/.test(err), '**多块时不带 doorId 会被拒**', String(err));
  ok((p.items.axe ?? 0) === 1, '**被拒时手斧没被白扔**', String(p.items.axe ?? 0));

  const err2 = tryIt(st, p.controllerId, { type: 'useItem', itemId: 'axe', doorId: doors[0] });
  console.log(`  指定拆「${doors[0]}」→ ${err2 ?? 'OK'}；剩 ${JSON.stringify(st.blockades)}`);
  ok(err2 == null, '指定那扇门就能拆', String(err2));
  ok(!st.blockades.includes(doors[0]) && st.blockades.includes(doors[1]),
    '**拆的是点的那一块**', JSON.stringify(st.blockades));
  ok(!(p.items.axe ?? 0), '手斧用掉了');
}

console.log('\n=== ③ 对照：只有一块封堵时，不带 doorId 照旧能拆 ===');
{
  const { st, p, doors } = mk();
  st.blockades = [doors[0]];
  const err = tryIt(st, p.controllerId, { type: 'removeBlockade' });
  console.log(`  一块封堵 + 不带 doorId → ${err ?? 'OK'}`);
  ok(err == null, '没得选的时候直接拆（老行为不变）', String(err));
  ok(!st.blockades.includes(doors[0]), '拆掉了', JSON.stringify(st.blockades));
}

console.log('\n=== ④ 界面：多了"选哪一块 → 确认拆除"那块面板 ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(/const startUnblock = \(kind: 'action' \| 'axe', actorId: string\)/.test(views),
    '入口统一走 `startUnblock`');
  ok(/doors\.length === 1/.test(views) && /sendUnblock\(kind, actorId, doors\[0\]\)/.test(views),
    '只有一块时直接拆');
  ok(/请选要拆哪一块/.test(views), '多块时面板上写清"请选要拆哪一块"');
  ok(/确认拆除/.test(views) && /disabled=\{!unblockPick\.doorId\}/.test(views),
    '**有「确认拆除」二次确认**，没选时是灰的');
  ok(/type: 'removeBlockade', doorId/.test(views), '一般行动把 `doorId` 带上');
  ok(/itemId: 'axe',\s*\n\s*doorId,/.test(views), '手斧也把 `doorId` 带上');
}

console.log(`\n拆封堵由玩家自己选：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
