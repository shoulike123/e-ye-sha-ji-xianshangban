/**
 * 发现阶段谁拿牌：
 *  - 1对2：和 1对1 一样，点了就拿，不用另一人确认。
 *  - 1对3：最先准备的人是主玩家，由他指定谁拿，指定后立即生效。
 *
 * 跑法：node scripts/tests/discovery-pick-confirm.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, enterDiscovery,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const throws = (fn) => {
  try { fn(); return false; }
  catch { return true; }
};
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function lobby(mode, players) {
  const st = createLobby('T', players[0], 'P0', content, 'cabin');
  st.mode = mode;
  const map = {};
  for (const pid of players) {
    map[pid] = pid === players[0] ? st.players[players[0]] : createPlayer(pid, pid, pid);
    map[pid].ready = true;
  }
  st.players = map;
  st.hostId = players[0];
  return st;
}

console.log('=== 1对2：点了就拿 ===');
{
  const st = lobby('vs2', ['k', 's1', 's2']);
  st.players.k.faction = 'killer';
  st.players.k.characterId = 'killer1';
  st.players.s1.faction = 'survivor';
  st.players.s2.faction = 'survivor';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, 3);
  startGame(st, content, 'k');
  st.pendingEvolutionAck = null;
  enterDiscovery(st);
  const target = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  handleAction(st, 's1', { type: 'pickSurvivorTurn', playerId: target.id }, content);
  ok(st.discoveryActorId === target.id && !st.pendingDiscoveryProposal, '不用另一人确认，立刻由这个角色拿牌');
}

console.log('=== 1对3：主玩家指定，其他人不用确认 ===');
{
  const st = lobby('multi', ['k', 's1', 's2', 's3']);
  st.players.k.faction = 'killer';
  st.players.k.characterId = 'killer1';
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
    st.players[id].ready = false;
  });
  handleAction(st, 's2', { type: 'setReady', ready: true }, content);
  ok(st.survivorLeadId === 's2', '最先准备的幸存者是主玩家');
  handleAction(st, 's1', { type: 'setReady', ready: true }, content);
  handleAction(st, 's3', { type: 'setReady', ready: true }, content);
  st.players.k.ready = true;
  startGame(st, content, 'k');
  st.pendingEvolutionAck = null;
  ok(st.survivorLeadId === 's2', '开局后主玩家不变');
  enterDiscovery(st);
  ok(throws(() => handleAction(st, 's1', { type: 'pickSurvivorTurn', playerId: 's1' }, content)), '其他人不能指定');
  handleAction(st, 's2', { type: 'pickSurvivorTurn', playerId: 's3' }, content);
  ok(st.discoveryActorId === 's3' && !st.pendingDiscoveryProposal, '主玩家指定后立即翻牌');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
