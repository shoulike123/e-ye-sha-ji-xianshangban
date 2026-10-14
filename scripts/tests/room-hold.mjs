/**
 * 全员离开后房间留 5 分钟；进程重启后进度还在，用原昵称能坐回去。
 *
 * 跑法：node scripts/tests/room-hold.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContent } from '../../server/dist/content/loader.js';
import { RoomManager, EMPTY_ROOM_MS } from '../../server/dist/game/roomManager.js';

const content = loadContent();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-rooms-'));

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

console.log('=== ① 最后一个人离开，房间和进度先留着 ===');
let code = '';
{
  const rooms = new RoomManager(content, dir);
  const snap = rooms.create('sock-a', '房主甲');
  code = snap.roomCode;
  const st = rooms.stateOf(code);
  st.phase = 'killerMain';
  st.round = 7;
  st.players['sock-a'].skillUsedThisTurn.add('brilliant');
  rooms.leave('sock-a');
  ok(rooms.stateOf(code)?.phase === 'killerMain', '离开后棋局还在', String(rooms.stateOf(code)?.phase));
  ok(rooms.stateOf(code)?.round === 7, '回合数还在', String(rooms.stateOf(code)?.round));
  ok(rooms.emptySinceOf(code) != null, '开始算 5 分钟');
  ok(fs.existsSync(path.join(dir, `${code}.json`)), '进度写到了磁盘');
  const tooSoon = rooms.sweep((rooms.emptySinceOf(code) ?? 0) + EMPTY_ROOM_MS - 1);
  ok(!tooSoon.includes(code) && rooms.stateOf(code), '未满 5 分钟不解散');
  const gone = rooms.sweep((rooms.emptySinceOf(code) ?? 0) + EMPTY_ROOM_MS);
  ok(gone.includes(code) && !rooms.stateOf(code), '满 5 分钟才解散');
  ok(!fs.existsSync(path.join(dir, `${code}.json`)), '解散后磁盘存档也删掉');
}

console.log('=== ② 服务器重启后，用原来的昵称坐回原进度 ===');
{
  const rooms = new RoomManager(content, dir);
  const snap = rooms.create('sock-b', '房主乙');
  code = snap.roomCode;
  const st = rooms.stateOf(code);
  st.phase = 'encounter';
  st.round = 3;
  st.killerLevel = 4;
  rooms.leave('sock-b');
  const since = rooms.emptySinceOf(code);

  const restored = new RoomManager(content, dir);
  const back = restored.stateOf(code);
  ok(back?.phase === 'encounter', '重启后阶段还在', String(back?.phase));
  ok(back?.round === 3 && back?.killerLevel === 4, '重启后等级和回合还在', `round=${back?.round} lv=${back?.killerLevel}`);
  ok(back?.players['sock-b']?.connected === false, '旧网线作废，座位标成离开');
  ok(restored.emptySinceOf(code) === since, '5 分钟从离开那时接着算', String(restored.emptySinceOf(code)));
  const joined = restored.join(code, 'sock-c', '房主乙');
  ok(joined.you?.name === '房主乙' || joined.players?.some((p) => p.name === '房主乙'), '原昵称坐回去了');
  ok(restored.emptySinceOf(code) == null, '有人回来就取消解散');
  const seat = Object.values(restored.stateOf(code).players).find((p) => p.controllerName === '房主乙');
  ok(seat?.connected === true && seat.skillUsedThisTurn instanceof Set, '坐回去之后技能记录仍是集合');
}

console.log('=== ③ 还有人在时，掉线的那位不触发 5 分钟解散 ===');
{
  const rooms = new RoomManager(content, dir);
  const snap = rooms.create('host', '甲');
  rooms.join(snap.roomCode, 'guest', '乙');
  rooms.leave('guest');
  ok(rooms.emptySinceOf(snap.roomCode) == null, '房主还在，房间不算空');
  ok(rooms.sweep(Date.now() + EMPTY_ROOM_MS * 2).includes(snap.roomCode) === false, '有人在就不解散');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n房间保留：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
