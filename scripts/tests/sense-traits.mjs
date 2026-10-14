/**
 * 【变体1】杀手感知特性：安娜对【感知】隐形；颜色感知 / 红外会挂出 10/15/16；
 * 敏锐听觉只能点响声地点；进阶追踪不算杀手密道。
 *
 * 跑法：node scripts/tests/sense-traits.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import { createLobby, startGame, handleAction, buildSnapshot } from '../../server/dist/game/engine.js';
import { resolveSenseColor } from '../../server/dist/game/killerCards.js';
import { senseRange } from '../../server/dist/game/killerSpecials.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkSolo() {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.variant1 = true;
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.currentKillerCardId = null;
  st.pendingSurvivorPick = false;
  return st;
}

const survOf = (st, ch) => Object.values(st.players).find((p) => p.characterId === ch);
const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

function asAnna(p) {
  p.characterId = 'survivor1';
}

console.log('=== 颜色感知：看见别人就挂出特性，只有安娜则不挂 ===');
{
  const st = mkSolo();
  const marco = survOf(st, 'survivor3');
  const sofia = survOf(st, 'survivor4');
  const will = survOf(st, 'survivor5');
  asAnna(will);
  marco.roomId = 'R1';
  will.roomId = 'R1';
  sofia.roomId = 'B1';
  st.traits[st.killerId] = ['trait_k10', 'trait_k15', 'trait_k16'];
  resolveSenseColor(st, 'R');
  ok(st.pendingSenseTraits === true, '红色区有别人，挂出 10/15/16');
  ok((st.pendingSenseWitnessed ?? []).includes(marco.id), '目击名单有马尔科');
  ok(!(st.pendingSenseWitnessed ?? []).includes(will.id), '安娜不在目击名单');
  ok(
    st.logs.some((l) => l.vis === 'all' && l.text.includes(marco.name) && l.text.includes('地点')),
    '战报双方都能看到：感知了哪里、看到了马尔科',
  );
  ok(
    !st.logs.some((l) => l.text.includes('感知') && l.text.includes(will.name)),
    '安娜不会出现在感知结果里',
  );

  const only = mkSolo();
  const a = survOf(only, 'survivor5');
  const b = survOf(only, 'survivor3');
  const c = survOf(only, 'survivor4');
  asAnna(a);
  a.roomId = 'R2';
  b.roomId = 'B2';
  c.roomId = 'G2';
  only.traits[only.killerId] = ['trait_k10'];
  resolveSenseColor(only, 'R');
  ok(only.pendingSenseTraits !== true, '红色区只有安娜，不挂特性');
}

console.log('=== 红外探测：安娜隐形，别人会挂出特性 ===');
{
  const st = mkSolo();
  const k = st.players[st.killerId];
  const marco = survOf(st, 'survivor3');
  const will = survOf(st, 'survivor5');
  asAnna(will);
  k.roomId = 'B2';
  marco.roomId = 'B2';
  will.roomId = 'B2';
  st.traits[st.killerId] = ['trait_k15'];
  const seen = senseRange(st, 0);
  ok(seen.some((p) => p.id === marco.id), '红外看得到同地点的马尔科');
  ok(!seen.some((p) => p.id === will.id), '红外看不到安娜');
}

console.log('=== 敏锐听觉：没响声不弃牌；只能点响声地点；打过牌就不能用 ===');
{
  const st = mkSolo();
  st.traits[st.killerId] = ['trait_k06'];
  const card = st.killerDeck.shift();
  st.killerHand = [card];
  st.noises = [];
  st.firecrackerThisRound = false;
  st.pendingKillerTraitOffer = { when: 'start', killerId: st.killerId, options: ['trait_k06'] };
  const err = tryIt(st, { type: 'useTrait', traitId: 'trait_k06', actorPlayerId: st.killerId, payCardIds: [card] });
  ok(err === '现在没有带响声的地点', '没有响声时直接拒绝', String(err));
  ok(st.killerHand.includes(card), '拒绝发生在弃牌之前');

  st.pendingKillerTraitOffer = null;
  st.noises = ['B2'];
  const err2 = tryIt(st, { type: 'useTrait', traitId: 'trait_k06', actorPlayerId: st.killerId, payCardIds: [card] });
  ok(String(err2).includes('时机'), '没到回合开始的询问就不能用', String(err2));
  ok(st.killerHand.includes(card), '时机不对也不弃牌');

  st.pendingKillerTraitOffer = { when: 'start', killerId: st.killerId, options: ['trait_k06'] };
  const err3 = tryIt(st, { type: 'useTrait', traitId: 'trait_k06', actorPlayerId: st.killerId, payCardIds: [card] });
  ok(!err3, '回合开始、有响声可以发动', String(err3 ?? ''));
  ok(st.senseNoiseOnly === true, '这次选点限定响声地点');
  const snap = buildSnapshot(st, HOST);
  ok(Array.isArray(snap.legalMoves) && snap.legalMoves.includes('B2'), '响声地点可以点', JSON.stringify(snap.legalMoves));
  ok(!snap.legalMoves.includes('R1'), '安静地点不高亮');
  const bad = tryIt(st, { type: 'move', toRoomId: 'R1' });
  ok(bad === '只能感知带响声的地点', '点安静地点会被拒绝', String(bad));
  const good = tryIt(st, { type: 'move', toRoomId: 'B2' });
  ok(!good, '可以选中响声地点', String(good ?? ''));
  ok(st.pendingSenseRoom === 'B2', '选中的是响声地点');
}

console.log('=== 进阶追踪：密道不算距离 1，安娜不算被发现 ===');
{
  const st = mkSolo();
  const k = st.players[st.killerId];
  const marco = survOf(st, 'survivor3');
  const sofia = survOf(st, 'survivor4');
  const will = survOf(st, 'survivor5');
  asAnna(will);
  k.roomId = 'B2';
  k.stealth = false;
  marco.roomId = 'R5';
  sofia.roomId = 'B3';
  will.roomId = 'B2';
  st.traits[st.killerId] = ['trait_k07', 'trait_k10'];
  const card = st.killerDeck.shift();
  st.killerHand = [card];
  st.noises = [];
  st.pendingKillerTraitOffer = { when: 'start', killerId: st.killerId, options: ['trait_k07'] };
  const err = tryIt(st, { type: 'useTrait', traitId: 'trait_k07', actorPlayerId: st.killerId, payCardIds: [card] });
  ok(!err, '回合开始可以发动进阶追踪', String(err ?? ''));
  const seen = st.pendingSenseWitnessed ?? [];
  ok(seen.includes(sofia.id), '门相邻的索菲亚被感知到');
  ok(!seen.includes(marco.id), '只靠密道相连的马尔科没被感知到');
  ok(!seen.includes(will.id), '同地点的安娜没被感知到');
  ok(st.pendingSenseTraits === true, '发现了人，可以接着发动即刻反应');
  const texts = st.logs.map((l) => l.text);
  const traitAt = texts.findIndex((t) => t.includes('「进阶追踪」'));
  const resultAt = texts.findIndex((t) => t.includes('感知到了') || t.includes('没有感知到人'));
  ok(traitAt >= 0 && resultAt > traitAt, '感知结果写在特性说明后面',
    texts.slice(Math.max(0, traitAt), resultAt + 1).join(' | '));
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
