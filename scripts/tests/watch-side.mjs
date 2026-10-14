/**
 * 单人热座 / 观众的「切换界面」必须改快照，不能只改外壳。
 *
 *  - 单人：切到杀手能看到手牌和潜行位置；切回幸存者就藏起来。阶段一变，手动选择作废。
 *  - 观众：默认按幸存者过滤（潜行位置不外泄）；切到杀手才给手牌和位置，且人还是观众、不能解散。
 *    观众的选择跨阶段保留。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
void require;

const { loadContent } = await import('../../server/dist/content/loader.js');
const {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} = await import('../../server/dist/game/engine.js');

const content = loadContent();
const HOST = 'h';
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mk() {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.pendingKillerDiscards = 0;
  st.pendingOverFearWound = null;
  st.pendingWhizSearch = null;
  st.pendingBlockadeJob = null;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  const killer = st.players[st.killerId];
  killer.stealth = true;
  if (!killer.roomId) killer.roomId = st.map.rooms[0].id;
  if (st.killerHand.length === 0) st.killerHand.push('kcard-test');
  return st;
}

const killerOf = (snap, id) => snap.players.find((p) => p.id === id);

console.log('=== ① 单人：切换会改手牌和潜行，阶段一变就交回自动推断 ===');
{
  const st = mk();
  const killer = st.players[st.killerId];
  const room = killer.roomId;
  const handLen = st.killerHand.length;
  const def = buildSnapshot(st, HOST);
  ok(def.watchSide == null, '没点过切换');
  ok(def.yourKillerHand == null, '幸存者阶段默认看不到杀手手牌');
  ok(killerOf(def, killer.id)?.roomId == null, '潜行位置对幸存者视角隐藏', String(killerOf(def, killer.id)?.roomId));

  handleAction(st, HOST, { type: 'setWatchSide', side: 'killer' }, content);
  const kview = buildSnapshot(st, HOST);
  ok(kview.watchSide === 'killer', '记下在看杀手');
  ok(kview.you.faction === 'killer', '座位换成杀手');
  ok(Array.isArray(kview.yourKillerHand) && kview.yourKillerHand.length === handLen, '杀手手牌下发', String(kview.yourKillerHand?.length));
  ok(killerOf(kview, killer.id)?.roomId === room, '潜行位置在杀手视角可见');

  st.phase = 'killerMain';
  const expired = buildSnapshot(st, HOST);
  ok(expired.watchSide == null, '阶段变了，手动选择作废');
  ok(expired.you.faction === 'killer', '自动回到杀手界面');
  ok(Array.isArray(expired.yourKillerHand), '杀手阶段本来就看得到手牌');

  handleAction(st, HOST, { type: 'setWatchSide', side: 'survivor' }, content);
  const sview = buildSnapshot(st, HOST);
  ok(sview.watchSide === 'survivor', '杀手阶段可以改看幸存者');
  ok(sview.you.faction === 'survivor', '座位换成幸存者');
  ok(sview.yourKillerHand == null, '改看幸存者后手牌收起');
  ok(killerOf(sview, killer.id)?.roomId == null, '潜行位置重新隐藏');
}

console.log('\n=== ② 观众：默认幸存者过滤，切到杀手才给情报，而且不能操作 ===');
{
  const st = mk();
  const killer = st.players[st.killerId];
  const room = killer.roomId;
  const spec = createPlayer('spec', '观众', 'spec');
  spec.faction = 'spectator';
  st.players[spec.id] = spec;

  const def = buildSnapshot(st, 'spec');
  ok(def.you.faction === 'spectator', '观众自己还是观众');
  ok(def.watchSide == null, '默认没手动切');
  ok(def.yourKillerHand == null, '默认看不到杀手手牌');
  ok(killerOf(def, killer.id)?.roomId == null, '默认隐藏潜行位置');
  ok(def.canRequestDisband === false, '观众不能解散');

  handleAction(st, 'spec', { type: 'setWatchSide', side: 'killer' }, content);
  const kview = buildSnapshot(st, 'spec');
  ok(kview.you.faction === 'spectator', '切过去之后仍然是观众');
  ok(kview.watchSide === 'killer', '观众在看杀手');
  ok(Array.isArray(kview.yourKillerHand) && kview.yourKillerHand.length === st.killerHand.length, '杀手手牌给观众');
  ok(killerOf(kview, killer.id)?.roomId === room, '潜行位置给杀手视角的观众');
  ok(kview.canRequestDisband === false, '切到杀手也不能解散');

  st.phase = 'killerMain';
  const still = buildSnapshot(st, 'spec');
  ok(still.watchSide === 'killer', '观众的选择跨阶段保留');

  let threw = false;
  try { handleAction(st, 'nope', { type: 'setWatchSide', side: 'killer' }, content); }
  catch { threw = true; }
  ok(threw, '旁人不能切');
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
