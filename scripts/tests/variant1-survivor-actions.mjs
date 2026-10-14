/**
 * 【变体1】幸存者特性：安静搜查、嘲讽战术、速度爆发、调度人员、生存本能。
 *
 * 跑法：node scripts/tests/variant1-survivor-actions.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot, keepSuitcaseDiscovery,
} from '../../server/dist/game/engine.js';

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
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  return st;
}

const survOf = (st, ch) => Object.values(st.players).find((p) => p.characterId === ch);
const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

function makeActive(st, id) {
  const idx = st.turnOrder.indexOf(id);
  st.activeSurvivorIndex = idx >= 0 ? idx : 0;
  st.pendingSurvivorPick = false;
  st.phase = 'survivorMain';
  const p = st.players[id];
  p.mainActionUsed = false;
  p.actedThisRound = false;
  p.alive = true;
}

function doorAdj(st, room) {
  const out = [];
  for (const e of st.map.edges ?? []) {
    if (e.pathType && e.pathType !== 'door') continue;
    if (e.from === room) out.push(e.to);
    else if ((e.bidirectional ?? true) && e.to === room) out.push(e.from);
  }
  return out;
}

function pathOf(st, start, steps) {
  const path = [start];
  const seen = new Set([start]);
  for (let i = 0; i < steps; i++) {
    const next = doorAdj(st, path[path.length - 1]).find((r) => !seen.has(r));
    if (!next) return null;
    seen.add(next);
    path.push(next);
  }
  return path;
}

console.log('=== 安静搜查：持有者可以取消别人发现的响声 ===');
{
  const st = mkSolo();
  const marco = survOf(st, 'survivor3');
  const sofia = survOf(st, 'survivor4');
  st.traits = { ...(st.traits ?? {}), [sofia.id]: ['trait_s11'] };
  makeActive(st, marco.id);
  const before = st.noises.length;
  keepSuitcaseDiscovery(st, marco.id, 'dc_longsword');
  ok(st.pendingQuietSearch?.playerId === sofia.id, '问的是持有者，不是翻牌的人', st.pendingQuietSearch?.playerId);
  ok(st.noises.length === before, '还没回答时不响');
  const snap = buildSnapshot(st, HOST);
  ok(snap.you?.id !== sofia.id || snap.pendingQuietSearch, '快照能带到询问');
  ok(snap.pendingQuietSearch?.playerId === sofia.id, '操控者看得到安静搜查，即使你不是持有者', snap.you?.id);
  const err = tryIt(st, { type: 'resolveQuietSearch', use: true });
  ok(!err, '持有者可以取消', String(err ?? ''));
  ok(st.noises.length === before, '取消后仍然不响');
  ok((st.traitUsed ?? []).includes('trait_s11'), '用掉之后本局不能再用');
}

console.log('=== 嘲讽战术：手牌 3 张及以下自动全弃再摸 1 ===');
{
  const st = mkSolo();
  const marco = survOf(st, 'survivor3');
  st.traits = { ...(st.traits ?? {}), [marco.id]: ['trait_s14'] };
  makeActive(st, marco.id);
  const two = st.killerDeck.splice(0, 2);
  st.killerHand = [...two];
  const err = tryIt(st, { type: 'useTrait', traitId: 'trait_s14', actorPlayerId: marco.id });
  ok(!err, '2 张手牌可以发动', String(err ?? ''));
  ok(st.pendingTraitDiscard === 0, '不用杀手再选弃哪张');
  ok(two.every((id) => st.killerDiscard.includes(id)), '2 张都进了弃牌堆');
  ok(st.killerHand.length === 1, '弃光之后摸 1 张', `手牌 ${st.killerHand.length}`);
  ok(
    st.logs.some((l) => l.vis === 'all' && l.text.includes('嘲讽战术')),
    '发动告诉杀手',
  );

  const st4 = mkSolo();
  const m4 = survOf(st4, 'survivor3');
  st4.traits = { ...(st4.traits ?? {}), [m4.id]: ['trait_s14'] };
  makeActive(st4, m4.id);
  st4.killerHand = st4.killerDeck.splice(0, 4);
  const err4 = tryIt(st4, { type: 'useTrait', traitId: 'trait_s14', actorPlayerId: m4.id });
  ok(!err4, '手牌多于 3 张也可以发动', String(err4 ?? ''));
  ok(st4.pendingTraitDiscard === 3, '多于 3 张时仍由杀手选 3 张', String(st4.pendingTraitDiscard));
  ok(st4.killerHand.length === 4, '还没选之前手牌不动');
}

console.log('=== 速度爆发：必须一步一步交出 2–4 步 ===');
{
  const st = mkSolo();
  const marco = survOf(st, 'survivor3');
  st.traits = { ...(st.traits ?? {}), [marco.id]: ['trait_s01'] };
  makeActive(st, marco.id);
  const missing = tryIt(st, { type: 'useTrait', traitId: 'trait_s01', actorPlayerId: marco.id });
  ok(Boolean(missing), '没有路径会被拒绝', String(missing));
  const path = pathOf(st, marco.roomId, 3);
  ok(Boolean(path), '能排出 3 步', JSON.stringify(path));
  const err = tryIt(st, { type: 'useTrait', traitId: 'trait_s01', actorPlayerId: marco.id, path });
  ok(!err, '3 步相邻路径可以走', String(err ?? ''));
  ok(marco.roomId === path[path.length - 1], '停在路径末端', marco.roomId);
}

console.log('=== 调度人员：每个人都要走，而且是路径 ===');
{
  const st = mkSolo();
  const marco = survOf(st, 'survivor3');
  const sofia = survOf(st, 'survivor4');
  const william = survOf(st, 'survivor5');
  st.traits = { ...(st.traits ?? {}), [marco.id]: ['trait_s02'] };
  makeActive(st, marco.id);
  const room = marco.roomId;
  sofia.roomId = room;
  william.roomId = room;
  const p1 = pathOf(st, room, 1);
  const p2 = pathOf(st, room, 2);
  const partial = tryIt(st, {
    type: 'useTrait',
    traitId: 'trait_s02',
    actorPlayerId: marco.id,
    moves: [{ playerId: sofia.id, toRoomId: p1[1], path: p1 }],
  });
  ok(Boolean(partial), '少一个人会被拒绝', String(partial));
  const err = tryIt(st, {
    type: 'useTrait',
    traitId: 'trait_s02',
    actorPlayerId: marco.id,
    moves: [
      { playerId: sofia.id, toRoomId: p1[1], path: p1 },
      { playerId: william.id, toRoomId: p2[2], path: p2 },
    ],
  });
  ok(!err, '两个人都交路径就可以', String(err ?? ''));
  ok(sofia.roomId === p1[1], '索菲亚走了 1 步', sofia.roomId);
  ok(william.roomId === p2[2], '威廉走了 2 步', william.roomId);
}

console.log(`\n变体1幸存者行动：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
