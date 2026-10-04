/**
 * **【音波感知】（未命名进化卡牌）要认"爆竹 = 全场都有响声"**。
 *
 * 用户报的：「爆竹的内部逻辑是全场都有响声，为什么未命名【音波感知】显示无响声」。
 *
 * 引擎自己的口径（响声阶段那句）：
 *   `响声阶段：全场都有响声（爆竹）`
 * 而 `applySonarReveal` 以前**只看 `state.noises`** —— 爆竹回合里那里面只有
 * "杀手所在地点"那一个标记，于是它要么判成"有响声"只揭示杀手那一格的人，
 * 要么（标记被清掉时）判成"无响声"去点距离 1 内的人。两种都不对：
 * **爆竹回合应该是所有幸存者都必须揭示地点。**
 *
 * 跑法：node scripts/tests/sonar-firecracker.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame,
} from '../../server/dist/game/engine.js';
import { applySonarReveal } from '../../server/dist/game/killerSpecials.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 一局：未命名 + 3 名幸存者分散在不同房间（都离杀手 > 1 格） */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 选了【音波感知】这张进化卡牌 */
  st.sonarRevealActive = true;
  st.firecrackerThisRound = false;
  st.noises = [];
  const k = st.players[st.killerId];
  k.roomId = st.map.rooms[0].id;
  return st;
}

const revealLines = (st, from) => st.logs.slice(from).map((l) => l.text);
const countRevealed = (st, from) =>
  revealLines(st, from).filter((t) => t.includes('音波感知：') && t.includes('位于')).length;

/* ═══════════ ① 爆竹回合：所有幸存者都要揭示 ═══════════ */
console.log('=== ① 爆竹回合：全场都响 → 所有幸存者揭示地点 ===');
{
  const st = mk();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  /** 三名幸存者分散到任意三个不同房间（故意都远离杀手，证明不是"距离 1 内"那条） */
  const rooms = st.map.rooms.filter((r) => r.id !== st.players[st.killerId].roomId);
  survs.forEach((s, i) => { s.roomId = rooms[i % rooms.length].id; });
  /** 爆竹：`placeFirecrackerMarker` 会把标记放在杀手所在地点，但响声是**全场** */
  st.firecrackerThisRound = true;
  st.noises = [st.players[st.killerId].roomId];

  const from = st.logs.length;
  applySonarReveal(st);
  const lines = revealLines(st, from);
  console.log(`   战报：${lines.map((t) => t.slice(0, 40)).join(' | ')}`);
  ok(countRevealed(st, from) === survs.length,
    '**三名幸存者全部被揭示**（爆竹 = 全场都响）',
    `揭示了 ${countRevealed(st, from)} / ${survs.length}`);
  ok(lines.some((t) => t.includes('爆竹')),
    '战报里写明了是爆竹（不是"无响声"）',
    lines.find((t) => t.includes('音波感知')) ?? '');
  ok(!lines.some((t) => t.includes('无响声')),
    '**不能出现"无响声"**（用户报的就是这个）');
}

/* ═══════════ ② 爆竹 + noises 被清空：仍然是全场响 ═══════════ */
console.log('=== ② 爆竹但响声标记已被清掉：照样全场响 ===');
{
  const st = mk();
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  const rooms = st.map.rooms.filter((r) => r.id !== st.players[st.killerId].roomId);
  survs.forEach((s, i) => { s.roomId = rooms[i % rooms.length].id; });
  st.firecrackerThisRound = true;
  st.noises = [];
  const from = st.logs.length;
  applySonarReveal(st);
  ok(countRevealed(st, from) === survs.length,
    '**照样全员揭示**（只看标记会误判成"无响声"）',
    `揭示了 ${countRevealed(st, from)} / ${survs.length}`);
  ok(!revealLines(st, from).some((t) => t.includes('无响声')),
    '没有"无响声"这条');
}

/* ═══════════ ③ 没爆竹 + 没响声：只点距离 1 内的人（原逻辑） ═══════════ */
console.log('=== ③ 无爆竹、无响声：仍是"距离 1 内"（原逻辑不变） ===');
{
  const st = mk();
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  /** 一名幸存者跟杀手同屋（距离 0），另两名扔到别处 */
  survs[0].roomId = k.roomId;
  const far = st.map.rooms.filter((r) => r.id !== k.roomId);
  survs[1].roomId = far[0].id;
  survs[2].roomId = far[far.length - 1].id;
  st.firecrackerThisRound = false;
  st.noises = [];
  const from = st.logs.length;
  applySonarReveal(st);
  const lines = revealLines(st, from);
  console.log(`   战报：${lines.map((t) => t.slice(0, 40)).join(' | ')}`);
  ok(lines.some((t) => t.includes('无响声')),
    '这条才该说"无响声"', lines.find((t) => t.includes('音波感知')) ?? '');
  ok(countRevealed(st, from) >= 1,
    '距离 1 内的那名幸存者被揭示', `揭示了 ${countRevealed(st, from)} 人`);
}

/* ═══════════ ④ 没爆竹 + 某地点有响声：只揭示那个地点的人 ═══════════ */
console.log('=== ④ 普通响声：只揭示带响声地点上的幸存者 ===');
{
  const st = mk();
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  const noisy = st.map.rooms.find((r) => r.id !== k.roomId).id;
  survs[0].roomId = noisy;
  const other = st.map.rooms.find((r) => r.id !== noisy && r.id !== k.roomId).id;
  survs[1].roomId = other;
  survs[2].roomId = other;
  st.firecrackerThisRound = false;
  st.noises = [noisy];
  const from = st.logs.length;
  applySonarReveal(st);
  const lines = revealLines(st, from);
  ok(lines.some((t) => t.includes('有响声')),
    '走"有响声"那一支', lines.find((t) => t.includes('音波感知')) ?? '');
  ok(countRevealed(st, from) === 1,
    '**只揭示站在响声地点的 1 人**（不是全场）', `揭示了 ${countRevealed(st, from)} 人`);
}

console.log(`\n音波感知 × 爆竹：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
