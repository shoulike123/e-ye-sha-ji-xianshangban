/**
 * 【变体1】杀手特性插进大回合：回合开始问 05/06/07，回合结束问 01/20。
 * 弃牌按份数拿（同名牌可以弃两张）。封堵走和一般封堵一样的点门。
 * 2对3 只问正在行动的那名杀手。
 *
 * 跑法：node scripts/tests/killer-trait-timing.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import { beginKillerTurn, closeKillerTurn, createLobby, handleAction, startGame } from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
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
  const k = st.players[st.killerId];
  k.stealth = false;
  return st;
}

console.log('=== 回合开始：只问正在行动的杀手 ===');
{
  const st = mkSolo();
  const kid = st.killerId;
  st.traits[kid] = ['trait_k05'];
  st.killerHand = ['a', 'a'];
  beginKillerTurn(st);
  ok(st.pendingKillerTraitOffer?.when === 'start', '回合开始挂出询问');
  ok(st.pendingKillerTraitOffer?.killerId === kid, '询问记在这名杀手身上');
  ok(st.pendingKillerTraitOffer?.options.includes('trait_k05'), '迅捷行动在询问里');

  const other = 'not-this-killer';
  st.traits[other] = ['trait_k07'];
  st.killerId = other in st.players ? other : kid;
  // 换到一个没有这张特性的视角：清空后再开一次
  st.pendingKillerTraitOffer = null;
  st.traits[kid] = [];
  st.killerId = kid;
  beginKillerTurn(st);
  ok(st.pendingKillerTraitOffer == null, '没有回合开始特性就不询问');
}

console.log('=== 同名牌可以弃两张；没到询问不能弃 ===');
{
  const st = mkSolo();
  const kid = st.killerId;
  st.traits[kid] = ['trait_k05'];
  st.players[kid].stealth = false;
  st.killerHand = ['same', 'same', 'keep'];
  st.pendingKillerTraitOffer = { when: 'start', killerId: kid, options: ['trait_k05'] };
  const early = tryIt(st, { type: 'useTrait', traitId: 'trait_k05', actorPlayerId: kid, payCardIds: ['same'] });
  ok(String(early).includes('需要弃'), '张数不够会拒绝', String(early));
  ok(st.killerHand.length === 3, '拒绝时一张都不弃');

  const err = tryIt(st, {
    type: 'useTrait',
    traitId: 'trait_k05',
    actorPlayerId: kid,
    payCardIds: ['same', 'same'],
  });
  ok(!err, '两张同名牌可以弃掉', String(err ?? ''));
  ok(st.killerHand.length === 1 && st.killerHand[0] === 'keep', '手里只剩没选的那张', st.killerHand.join(','));
  ok(st.killerDiscard.filter((id) => id === 'same').length === 2, '弃牌堆进了两张');
  ok(st.pendingMoveRange === 1, '迅捷行动进入移动');
  ok(!(st.pendingKillerTraitOffer?.options ?? []).includes('trait_k05'), '发动过的从询问里拿掉');
}

console.log('=== 回合结束：完全围困点门，和一般封堵一样 ===');
{
  const st = mkSolo();
  const kid = st.killerId;
  const k = st.players[kid];
  st.traits[kid] = ['trait_k01'];
  const door = st.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  if (door) k.roomId = door.from;
  k.stealth = false;
  st.queenEncounteredThisTurn = false;
  st.rules.enableBlockades = true;
  st.killerHand = ['c1', 'c2', 'c3'];
  st.phase = 'killerMain';
  closeKillerTurn(st);
  ok(st.pendingKillerTraitOffer?.when === 'end', '回合结束挂出询问');
  ok(st.pendingKillerTraitOffer?.options.includes('trait_k01'), '完全围困在询问里');
  ok(st.phase === 'killerMain', '问完之前不把回合交出去');
  ok(st.killerHand.length > 3 && st.killerHand.includes('c1'), '询问时已经摸过回合结束的牌', st.killerHand.join(','));

  const err = tryIt(st, {
    type: 'useTrait',
    traitId: 'trait_k01',
    actorPlayerId: kid,
    payCardIds: ['c1', 'c2'],
  });
  ok(!err, '可以发动完全围困', String(err ?? ''));
  ok(st.killerHand.includes('c3') && !st.killerHand.includes('c1') && !st.killerHand.includes('c2'), '弃掉选中的两张', st.killerHand.join(','));
  ok(Boolean(st.pendingBlockade) || Boolean(st.pendingBlockadeJob), '停下来等点门，不是立刻落子');
}

console.log('=== 跳过回合结束特性才会把回合交出去 ===');
{
  const st = mkSolo();
  const kid = st.killerId;
  st.traits[kid] = ['trait_k20'];
  st.players[kid].stealth = false;
  st.queenEncounteredThisTurn = false;
  st.killerHand = ['only'];
  st.phase = 'killerMain';
  closeKillerTurn(st);
  ok(st.pendingKillerTraitOffer?.options.includes('trait_k20'), '危险伏击在询问里');
  const err = tryIt(st, {
    type: 'useTrait',
    traitId: 'trait_k20',
    actorPlayerId: kid,
    decline: true,
  });
  ok(!err, '可以跳过', String(err ?? ''));
  ok(st.pendingKillerTraitOffer == null, '跳过后询问清掉');
  ok(st.killerHand.includes('only'), '跳过不弃牌');
  ok(st.phase !== 'killerMain', '跳过之后回合才交接', st.phase);
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
