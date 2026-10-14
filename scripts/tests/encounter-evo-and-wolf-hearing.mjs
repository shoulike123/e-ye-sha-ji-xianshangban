/**
 * 三件结算顺序：
 *  ① 遭遇里被挡住、弃牌进化到谋杀者 4 级：先封 4 扇门，再让幸存者撤离。
 *  ② 狼人回合结束摸牌才升到 4 级：进化效果结算完、回合真正结束前，惊吓距离 2。
 *  ③ 超听觉：场上没有响声不能打；爆竹算全场都有响声。
 *
 * 跑法：node scripts/tests/encounter-evo-and-wolf-hearing.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot, startEncounter, endKillerTurn,
} from '../../server/dist/game/engine.js';
import { doorId, isDoorBlocked } from '../../server/dist/game/effects.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkSolo(killerId) {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.pendingKillerDiscards = 0;
  return st;
}

const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

const logText = (st) => st.logs.map((l) => String(l.text ?? '')).join('\n');

function emptyDeckForEvolve(st) {
  const fodder = st.killerDeck.splice(0);
  st.killerDiscard = [...st.killerDiscard, ...fodder];
  if (st.killerDiscard.length < 8) {
    st.killerDiscard.push('wolf_hunt_1', 'wolf_hunt_1', 'wolf_hunt_1', 'wolf_hunt_1');
  }
}

console.log('=== ① 谋杀者遭遇中被挡住、弃牌升到 4 级：先封 4 扇门，再撤离 ===');
{
  const st = mkSolo('killer3');
  const k = st.players[st.killerId];
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor');
  for (const s of survivors) s.roomId = k.roomId;
  st.killerLevel = 3;
  emptyDeckForEvolve(st);
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  startEncounter(st, k.roomId);
  const marco = survivors.find((p) => p.characterId === 'survivor3');
  tryIt(st, { type: 'pickEncounterTarget', targetPlayerId: marco.id });
  tryIt(st, { type: 'playEncounterAttack', cardId: null });
  st.killerPower = 0;
  const err = tryIt(st, { type: 'playEncounterDefense', cardId: null, itemId: null });
  ok(!err, '防御结算没有报错', String(err ?? ''));
  ok(st.deferEncounterFlee === true, '先挂起撤离');
  ok(st.encounter?.step !== 'flee', '进化还没做完，还没进入撤离', String(st.encounter?.step));
  ok(Boolean(st.pendingEvolutionAck), '先确认进化');
  const ackErr = tryIt(st, { type: 'ackEvolution' });
  ok(!ackErr, '确认进化', String(ackErr ?? ''));
  const job = st.pendingBlockadeJob;
  ok(job?.kind === 'anyDoors' && job.need === 4, '先进入封 4 扇门', JSON.stringify(job));
  ok(st.encounter?.step !== 'flee', '封门期间幸存者还不能撤离', String(st.encounter?.step));
  const before = st.blockades.length;
  let guard = 0;
  while (st.pendingBlockadeJob && guard < 12) {
    guard += 1;
    const snap = buildSnapshot(st, HOST);
    const edge = (st.map.edges ?? []).find(
      (e) => (!e.pathType || e.pathType === 'door') &&
        snap.legalMoves.includes(e.from) &&
        snap.legalMoves.includes(e.to) &&
        !isDoorBlocked(st, doorId(e.from, e.to)),
    );
    if (!edge) { ok(false, '候选里找不到门', JSON.stringify(snap.legalMoves)); break; }
    const e1 = tryIt(st, { type: 'move', toRoomId: edge.from });
    const e2 = tryIt(st, { type: 'move', toRoomId: edge.to });
    const e3 = tryIt(st, { type: 'confirmEvoBlockade' });
    if (e1 || e2 || e3) {
      ok(false, '封一门', [e1, e2, e3].filter(Boolean).join(' | '));
      break;
    }
  }
  ok(st.blockades.length - before === 4, '4 扇门都封上了', String(st.blockades.length - before));
  ok(st.pendingBlockadeJob == null, '封堵作业结束');
  ok(st.encounter?.step === 'flee', '封完门才进入撤离', String(st.encounter?.step));
  const fleeAt = logText(st).indexOf('需要依次撤离');
  const doorAt = logText(st).indexOf('请在整张地图选');
  ok(doorAt >= 0 && (fleeAt < 0 || doorAt < fleeAt), '战报里选门写在撤离之前', `door=${doorAt} flee=${fleeAt}`);
}

console.log('=== ② 狼人回合结束摸牌升到 4 级：结算完再惊吓距离 2，然后才结束回合 ===');
{
  const st = mkSolo('killer5');
  const k = st.players[st.killerId];
  k.stealth = false;
  st.killerLevel = 3;
  st.queenEncounteredThisTurn = false;
  st.werewolfEndFearDone = false;
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor');
  for (const s of survivors) {
    s.roomId = k.roomId;
    s.fear = 0;
    s.overFear = false;
  }
  st.killerHand = st.killerHand.slice(0, 1);
  emptyDeckForEvolve(st);
  st.phase = 'killerMain';
  endKillerTurn(st);
  ok(survivors.every((s) => s.fear === 0), '还在确认进化时，还没惊吓', survivors.map((s) => s.fear).join(','));
  ok(Boolean(st.pendingEvolutionAck), '摸牌见底，先确认 4 级');
  const ackErr = tryIt(st, { type: 'ackEvolution' });
  ok(!ackErr, '确认进化', String(ackErr ?? ''));
  ok(survivors.every((s) => s.fear === 1), '进化结算完、回合结束前，同地点的人各 +1 恐惧', survivors.map((s) => s.fear).join(','));
  const lines = st.logs.map((l) => String(l.text ?? ''));
  const fearAt = lines.findIndex((t) => t.includes('狼人进化 4 级'));
  const handoff = lines.findIndex((t, i) => i > fearAt && t.includes('幸存者正在行动'));
  ok(fearAt >= 0 && handoff > fearAt, '惊吓写在这一轮「幸存者正在行动」之前', `fear=${fearAt} handoff=${handoff}`);
  ok(st.phase === 'survivorMain' || st.phase === 'discovery', '惊吓之后才把回合交给幸存者', String(st.phase));
}

console.log('=== ②b 开回合就已经是 4 级：只惊吓一次 ===');
{
  const st = mkSolo('killer5');
  const k = st.players[st.killerId];
  k.stealth = false;
  st.killerLevel = 4;
  st.queenEncounteredThisTurn = false;
  st.werewolfEndFearDone = false;
  const marco = Object.values(st.players).find((p) => p.characterId === 'survivor3');
  marco.roomId = k.roomId;
  marco.fear = 0;
  st.phase = 'killerMain';
  endKillerTurn(st);
  ok(marco.fear === 1, '已经是 4 级时惊吓一次', String(marco.fear));
  ok((logText(st).match(/狼人进化 4 级/g) ?? []).length === 1, '战报只写一次');
}

console.log('=== ③ 超听觉：没有响声不能打，爆竹算全场有响声 ===');
{
  const st = mkSolo('killer5');
  const k = st.players[st.killerId];
  k.stealth = false;
  st.killerLevel = 2;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.noises = [];
  st.firecrackerThisRound = false;
  st.firecrackerRoomId = null;
  const pool = [...new Set([...st.killerHand, ...st.killerDeck, ...st.killerDiscard])].filter((id) => id !== 'wolf_hearing');
  const pay = pool.slice(0, 3);
  st.killerHand = ['wolf_hearing', ...pay];
  st.killerLocked = st.killerLocked.filter((id) => id !== 'wolf_hearing');
  for (const s of Object.values(st.players)) {
    if (s.faction === 'survivor') s.roomId = st.map.survivorStartRoomId;
  }
  if (k.roomId === st.map.survivorStartRoomId) {
    const other = st.map.rooms.find((r) => r.id !== k.roomId);
    k.roomId = other?.id ?? k.roomId;
  }
  const err = tryIt(st, { type: 'playKillerCard', cardId: 'wolf_hearing', payCardIds: pay });
  ok(Boolean(err) && String(err).includes('没有响声'), '没有响声时打不出去', String(err));
  ok(st.killerHand.includes('wolf_hearing'), '没打出去，牌还在手上');

  st.firecrackerThisRound = true;
  const here = k.roomId;
  const err2 = tryIt(st, { type: 'playKillerCard', cardId: 'wolf_hearing', payCardIds: pay });
  ok(!err2, '爆竹回合可以打出', String(err2 ?? ''));
  ok(k.roomId === here, '爆竹算全场有响声，留在原地搜索', `${here} → ${k.roomId}`);
  ok(logText(st).includes('最近的响声'), '战报写明最近的响声就在自己这格');
}

console.log('=== ③b 响声就在自己这格，也可以打 ===');
{
  const st = mkSolo('killer5');
  const k = st.players[st.killerId];
  st.killerLevel = 2;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.firecrackerThisRound = false;
  st.noises = [k.roomId];
  const pool = [...new Set([...st.killerHand, ...st.killerDeck, ...st.killerDiscard])].filter((id) => id !== 'wolf_hearing');
  const pay = pool.slice(0, 3);
  st.killerHand = ['wolf_hearing', ...pay];
  st.killerLocked = st.killerLocked.filter((id) => id !== 'wolf_hearing');
  for (const s of Object.values(st.players)) {
    if (s.faction === 'survivor' && s.roomId === k.roomId) {
      const other = st.map.rooms.find((r) => r.id !== k.roomId);
      s.roomId = other?.id ?? s.roomId;
    }
  }
  const here = k.roomId;
  const err = tryIt(st, { type: 'playKillerCard', cardId: 'wolf_hearing', payCardIds: pay });
  ok(!err, '自己这格有响声就能打', String(err ?? ''));
  ok(k.roomId === here, '最近的响声就是自己这格', `${here} → ${k.roomId}`);
}

console.log(`\n遭遇进化 / 狼人惊吓 / 超听觉：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
