/**
 * 查清「待观察」：**幸存者大回合里发 `endTurn` 会怎样**（只读，不改游戏代码）。
 *
 * 由来：`duo-playthrough.mjs` 那一局的日志里出现过
 *   `15. [survivorMain] {"type":"endTurn","by":"h"}`
 * 但单独在"刚开局"的 `survivorMain` 测同一个动作时是**被拒绝**的（"还没轮到你"）。
 * 两次的差别是**时点**：出问题那次是"三个幸存者都行动完了、还没进发现阶段"。
 *
 * 结论（本脚本实测）：**没能复现** —— 三个场景全部被拒绝，
 * 包括精确摆到那个时点的场景 B。所以它不算确认的问题，只是"曾见过一次"。
 *
 * 跑法：node scripts/tests/duo-endturn-probe.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, activePlayerId,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const results = [];

function newDuo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
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
  return st;
}

/** 只挑会变的关键字段做前后对比 */
function snap(st) {
  const surv = Object.values(st.players).filter((p) => p.faction === 'survivor');
  return {
    phase: st.phase,
    round: st.round,
    active: activePlayerId(st),
    pendingSurvivorPick: st.pendingSurvivorPick,
    activeSurvivorIndex: st.activeSurvivorIndex,
    killerTurnStep: st.killerTurnStep,
    acted: surv.map((p) => `${p.id}:${p.mainActionUsed ? 'A' : '-'}${p.actedThisRound ? 'R' : '-'}${p.roomId}`).join(' '),
    logs: st.logs.length,
    winner: st.winner ?? null,
  };
}

/** 三个幸存者都行动完（`playthrough` 日志里出问题的那一刻） */
function allSurvivorsDone(st) {
  const surv = Object.values(st.players).filter((p) => p.faction === 'survivor');
  for (const p of surv) { p.mainActionUsed = true; p.actedThisRound = true; }
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = surv.length - 1;
}

function scenario(label, who, prepare = null) {
  const st = newDuo();
  if (prepare) prepare(st);
  const before = snap(st);
  let err = null;
  try { handleAction(st, who, { type: 'endTurn' }, content); } catch (e) { err = e.message; }
  const after = snap(st);
  const changed = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const accepted = err === null;
  results.push({ label, accepted, err, changed });

  console.log(`\n  【${label}】`);
  console.log(`     phase=${before.phase} round=${before.round} active=${before.active} pick=${before.pendingSurvivorPick}`);
  console.log(`     发出后 → ${accepted ? '**被接受** ⚠' : `被拒绝：${err}`}`);
  if (accepted) {
    console.log(`     变化项：${changed.length ? changed.join(', ') : '无（纯漏挡、无副作用）'}`);
    for (const k of changed) console.log(`       ${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
    const newLogs = st.logs.slice(before.logs).map((l) => l.text);
    for (const t of newLogs) console.log(`       · ${t}`);
  }
}

console.log('=== 幸存者大回合里发 endTurn：三个时点都试一遍 ===');
scenario('A 刚开局（三个人都没行动）· 杀手发', 'h');
scenario('B 三个人都行动完了（待观察的那个时点）· 杀手发', 'h', allSurvivorsDone);
scenario('C 同一个时点 · 幸存者自己发', 's', allSurvivorsDone);

const accepted = results.filter((r) => r.accepted);
console.log('\n════════ 汇总 ════════');
console.log(`共 ${results.length} 个场景，被接受 ${accepted.length} 个`);
for (const a of accepted) console.log(`  ⚠ ${a.label} —— 变化：${a.changed.join(', ') || '无'}`);
if (accepted.length) {
  console.log('\n⚠ 有场景接受了这个动作 —— 需要复查是不是漏挡。');
  process.exit(1);
}
console.log('\n✅ 三个时点全部正确拒绝 —— 那条"待观察"没能复现，不算确认的问题。');
process.exit(0);
