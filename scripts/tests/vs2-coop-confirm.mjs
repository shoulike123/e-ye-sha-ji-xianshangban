/**
 * 1对2 的**合作确认**流程实测（只读，不改游戏代码）。
 *
 * 规则（`engine.ts:830` 的 `needsCoopConfirm`）：
 *   1对2 里幸存者做这几类动作要**另一名幸存者玩家确认**：
 *   移动 / 搜索 / 修理 / 消恐惧 / 移除封堵 / 用物品 / 发动技能 / 开手提箱。
 *   **交换物品、弃置物品不用确认**（开局战报里也这么写）。
 *
 * 这里实测：
 *   ① 提出 → 挂起，且**动作没执行**
 *   ② 队友确认 → 执行
 *   ③ 队友拒绝 → 不执行
 *   ④ 提出者**自己确认** → 被拒
 *   ⑤ **队友断线** → 直接执行（不能卡死）
 *   ⑥ 对照：交换物品**不**走确认
 *   ⑦ 已有一笔待确认时再发 → 被拒
 *
 * 跑法：node scripts/tests/vs2-coop-confirm.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, activePlayerId, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 1对2：杀手 k + 两名幸存者玩家 s1 / s2（三人共控 3 枚幸存者棋子） */
function mkVs2(mapId = 'cabin') {
  const st = createLobby('T', 'k', 'K', content, mapId);
  st.mode = 'vs2';
  const map = { k: st.players.k };
  for (const id of ['s1', 's2']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.players.k.faction = 'killer';
  st.players.k.characterId = 'killer1';
  st.players.k.ready = true;
  for (const id of ['s1', 's2']) { st.players[id].faction = 'survivor'; st.players[id].ready = true; }
  st.hostId = 'k';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'k');
  st.pendingEvolutionAck = null;
  st.phase = 'survivorMain';
  return st;
}

const tryIt = (st, sid, action) => {
  try { handleAction(st, sid, action, content); return null; }
  catch (e) { return e.message; }
};
/**
 * 现在该行动的那枚棋子，以及它名义上归谁（'s1' / 's2'）。
 *
 * ⚠ 开局时 `pendingSurvivorPick` 还挂着、`activePlayerId` 是空的 ——
 * 这时先替引擎选一个人开始小回合（1对2 里两人共控，谁点都行）。
 */
const acting = (st) => {
  let pieceId = activePlayerId(st);
  if (!pieceId || !st.players[pieceId]) {
    const first = st.turnOrder[0];
    const who = st.players[first]?.controllerId ?? 's1';
    tryIt(st, who, { type: 'pickSurvivorTurn', playerId: first });
    pieceId = activePlayerId(st) ?? first;
  }
  return { pieceId, owner: st.players[pieceId]?.controllerId ?? 's1' };
};
const partnerOf = (st, owner) => st.survivorOperators.find((o) => o.id !== owner)?.id;
/** 从某枚棋子当前所在地点找一条能走的门 */
const doorFrom = (st, pieceId) => {
  const room = st.players[pieceId]?.roomId;
  const e = (st.map.edges ?? []).find(
    (x) => (!x.pathType || x.pathType === 'door') && (x.from === room || x.to === room),
  );
  if (!e) return null;
  return e.from === room ? e.to : e.from;
};

console.log('=== ① 提出 → 挂起，动作不执行 ===');
let ctx = null;
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const partner = partnerOf(st, owner);
  const to = doorFrom(st, pieceId);
  const before = st.players[pieceId].roomId;
  const err = tryIt(st, owner, { type: 'move', toRoomId: to });
  console.log(`  ${owner} 提出移动到 ${to}（${err ?? 'OK'}）；待确认=${Boolean(st.pendingCoopAction)}`);
  ok(err === null, '提出本身不报错', err ?? '');
  ok(Boolean(st.pendingCoopAction), '**挂起了待确认**');
  ok(st.players[pieceId].roomId === before, '**动作还没执行**（人没动）',
    `${before} → ${st.players[pieceId].roomId}`);
  ok(st.pendingCoopAction?.fromControllerId === owner, '记录的是谁提出的', st.pendingCoopAction?.fromControllerId);
  ok(String(st.pendingCoopAction?.summary ?? '').includes('移动'), '摘要写清了要做什么',
    st.pendingCoopAction?.summary);
  ctx = { st, pieceId, owner, partner, to, before };
}

console.log('\n=== ② 队友确认 → 执行 ===');
{
  const { st, pieceId, partner, to } = ctx;
  const err = tryIt(st, partner, { type: 'respondCoopAction', accept: true });
  console.log(`  ${partner} 确认（${err ?? 'OK'}）；人现在在 ${st.players[pieceId].roomId}`);
  ok(err === null, '确认不报错', err ?? '');
  ok(st.players[pieceId].roomId === to, '**动作执行了**', st.players[pieceId].roomId);
  ok(!st.pendingCoopAction, '待办收掉了');
}

console.log('\n=== ③ 队友拒绝 → 不执行 ===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const partner = partnerOf(st, owner);
  const to = doorFrom(st, pieceId);
  const before = st.players[pieceId].roomId;
  tryIt(st, owner, { type: 'move', toRoomId: to });
  const err = tryIt(st, partner, { type: 'respondCoopAction', accept: false });
  console.log(`  ${partner} 拒绝（${err ?? 'OK'}）；人还在 ${st.players[pieceId].roomId}`);
  ok(err === null, '拒绝不报错', err ?? '');
  ok(st.players[pieceId].roomId === before, '**动作没执行**');
  ok(!st.pendingCoopAction, '待办收掉了');
}

console.log('\n=== ④ 提出者自己确认 → 被拒 ===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const to = doorFrom(st, pieceId);
  tryIt(st, owner, { type: 'move', toRoomId: to });
  const err = tryIt(st, owner, { type: 'respondCoopAction', accept: true });
  console.log(`  ${owner} 自己确认 → ${err ?? '（竟然通过了）'}`);
  ok(err !== null, '**自己确认被拒**', err ?? '');
  ok(Boolean(st.pendingCoopAction), '待办还挂着（没被自己消费掉）');
}

console.log('\n=== ⑤ 队友断线 → 直接执行（不能卡死）===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const partner = partnerOf(st, owner);
  /** 把队友标成掉线 */
  const op = st.survivorOperators.find((o) => o.id === partner);
  if (op) op.connected = false;
  const to = doorFrom(st, pieceId);
  const err = tryIt(st, owner, { type: 'move', toRoomId: to });
  console.log(`  ${partner} 已断线；${owner} 再提移动（${err ?? 'OK'}）→ 人到了 ${st.players[pieceId].roomId}`);
  ok(st.pendingCoopAction === null || st.pendingCoopAction === undefined,
    '**没有挂起确认**（队友不在，不能卡住）');
  ok(st.players[pieceId].roomId === to, '**动作直接执行了**', st.players[pieceId].roomId);
}

console.log('\n=== ⑥ 对照：交换物品**不该**走确认 ===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const target = Object.values(st.players).find((x) => x.faction === 'survivor' && x.id !== pieceId);
  /** 给提出者塞一件物品，让交易有东西可给 */
  const p = st.players[pieceId];
  p.roomId = st.players[target.id].roomId = st.map.rooms[0].id;
  p.items = { herb: 1 };
  const err = tryIt(st, owner, {
    type: 'tradeItem', targetPlayerId: target.id, itemId: 'herb', amount: 1,
  });
  console.log(`  交换（${err ?? 'OK'}）；待确认=${Boolean(st.pendingCoopAction)}`);
  ok(!st.pendingCoopAction, '**交换物品不挂确认**');
}

console.log('\n=== ⑦ 已有一笔待确认时再提 → 被拒 ===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const to = doorFrom(st, pieceId);
  tryIt(st, owner, { type: 'move', toRoomId: to });
  const err = tryIt(st, owner, { type: 'search' });
  console.log(`  第一笔挂着时再发搜索 → ${err ?? '（竟然通过了）'}`);
  ok(err !== null, '**第二笔被拒**', err ?? '');
}

console.log('\n=== ⑧ 快照里带着待确认（界面才画得出）===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const to = doorFrom(st, pieceId);
  tryIt(st, owner, { type: 'move', toRoomId: to });
  const snapA = buildSnapshot(st, owner);
  const snapB = buildSnapshot(st, partnerOf(st, owner));
  console.log(`  提出者看到：${JSON.stringify(snapA.pendingCoopAction ?? null)}`);
  console.log(`  队友看到：${JSON.stringify(snapB.pendingCoopAction ?? null)}`);
  ok(Boolean(snapA.pendingCoopAction) && Boolean(snapB.pendingCoopAction),
    '**两边都拿得到这笔待确认**');
}

console.log('\n=== ⑨ 搜索也要能确认（合作确认的第二类动作）===');
{
  const st = mkVs2();
  const { pieceId, owner } = acting(st);
  const partner = partnerOf(st, owner);
  /** 挪到可搜索地点，保证 search 本身合法 */
  const room = st.map.rooms.find((r) => (r.tags ?? []).includes('searchable'));
  if (room) st.players[pieceId].roomId = room.id;
  const err1 = tryIt(st, owner, { type: 'search' });
  const hasOffer = Boolean(st.pendingCoopAction);
  console.log(`  提出搜索（${err1 ?? 'OK'}）；挂起=${hasOffer}`);
  const err2 = hasOffer ? tryIt(st, partner, { type: 'respondCoopAction', accept: true }) : null;
  console.log(`  队友确认 → ${err2 ?? 'OK'}`);
  console.log(`  之后：mainActionUsed=${st.players[pieceId].mainActionUsed} ` +
    `searchedThisTurn=${st.players[pieceId].searchedThisTurn}`);
  ok(err1 === null && hasOffer, '搜索也会挂起确认', err1 ?? '');
  ok(err2 === null, '**确认之后搜索能真的执行**', err2 ?? '');
  ok(st.players[pieceId].mainActionUsed || st.players[pieceId].searchedThisTurn,
    '搜索确实用掉了行动');
}

console.log('\n=== ⑩ 杀手回合里幸存者发 search → 该**直接拒**，不是"等队友确认" ===');
{
  const st = mkVs2();
  const { owner } = acting(st);
  /** 直接摆到杀手回合（这一步只为走到那道闸门） */
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  const err = tryIt(st, owner, { type: 'search' });
  console.log(`  ${owner} 在杀手回合发搜索 → ${err ?? '（竟然通过了）'}`);
  console.log(`  待确认=${Boolean(st.pendingCoopAction)}`);
  /**
   * 用户口径：「**杀手大回合本来幸存者就不能搜索**」——
   * 所以这里必须直接报"还没轮到你"，而不是挂起一笔"等队友确认"。
   */
  ok(err !== null, '**被拒**', err ?? '');
  ok(!st.pendingCoopAction, '**没有挂起"等队友确认"**');
  ok(String(err ?? '').includes('还没轮到你'), '拒绝理由是「还没轮到你」', err ?? '');
}

console.log(`\n1对2 合作确认：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
