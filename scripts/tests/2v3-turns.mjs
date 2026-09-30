/**
 * 2对3 回合流程与进化规则：
 *  ⑨ 先后手每轮交替（A → B → 整轮结算 → 下一轮 B 先）
 *  ⑩ 任一杀手遭遇结束后，本轮两名杀手都不再行动
 *  ⑪ 各杀手在自己回合结束时抽 2 张（单杀手模式仍是 3 张）
 *  ⑫ 捕网结算推迟到所有杀手回合结束后
 *  ⑬ 共用一个队伍进化等级，但各自套用自己杀手类型的 1~5 级效果
 *
 * 跑法：`npm run test:2v3`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, handleAction, startGame, buildSnapshot,
  switchActiveKiller, syncActiveKiller, loadKillerToMirror,
} from '../../server/dist/game/engine.js';
import { setKillerMirrorHandlers, runUpgrade } from '../../server/dist/game/evolution.js';
import { setupHunterTraps, placeHunterTrap } from '../../server/dist/game/hunterTraps.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 引擎启动时会自己注入；测试里再注入一次，保证独立跑也能用 */
setKillerMirrorHandlers({
  switchTo: (s, id) => switchActiveKiller(s, id),
  save: (s) => syncActiveKiller(s),
  load: (s, id) => loadKillerToMirror(s, id),
});

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function lobby2v3(killerA = 'killer1', killerB = 'killer5', order = ['first', 'second']) {
  const st = createLobby('TEST', 'k1', 'K1', content, 'cabin');
  st.mode = '2v3';
  const map = { k1: st.players['k1'] };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players['k1'].faction = 'killer';
  st.players['k1'].characterId = killerA;
  st.players['k2'].faction = 'killer';
  st.players['k2'].characterId = killerB;
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  st.players['k1'].orderPick = order[0];
  st.players['k2'].orderPick = order[1];
  return st;
}

/** 开局并推进到"先手杀手准备行动"（跳过响声报告） */
function ready(killerA, killerB, order) {
  const st = lobby2v3(killerA, killerB, order);
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  /**
   * 女猎手局开局会停在 `trapSetup` 等布陷阱 —— 不布完 `startRound` 不会推进轮次。
   * 测试里直接标记为已完成（真实的布陷阱交互有单独的测试覆盖）。
   */
  if (st.pendingTrapPlacement && !st.pendingTrapPlacement.done) {
    st.pendingTrapPlacement.done = true;
    st.pendingTrapPlacement.kind = null;
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'slow';   // 慢速阶段：结束回合不会被"还没选行动"挡住
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  return st;
}

console.log('=== ⑨ 先后手每轮交替 ===');
{
  const st = ready();
  const [first, second] = st.killerTurnOrder;
  console.log(`   先手=${st.players[first]?.name} 后手=${st.players[second]?.name}`);
  ok(st.killerTurnIndex === 0, '开始时 index = 0', `${st.killerTurnIndex}`);
  ok(st.killerId === first, '当前行动的是先手', `${st.killerId}`);

  const handBefore = { a: st.killers[first].hand.length, b: st.killers[second].hand.length };
  /** 先手结束回合 → 应该交给后手，而不是开新一轮 */
  handleAction(st, first, { type: 'endTurn' }, content);
  st.pendingEvolutionAck = null;
  console.log(`   先手结束后：index=${st.killerTurnIndex} killerId=${st.killerId} round=${st.round}`);
  ok(st.killerTurnIndex === 1, 'index 推进到 1', `${st.killerTurnIndex}`);
  ok(st.killerId === second, '轮到后手了', `${st.killerId}`);
  ok(st.round === 1, '还没有开新一轮（round 仍为 1）', `${st.round}`);
  /** ⑪ 抽 2 张 */
  const drewA = st.killers[first].hand.length - handBefore.a;
  console.log(`   先手回合结束抽了 ${drewA} 张`);
  ok(drewA === 2, '先手回合结束抽 2 张', `${drewA}`);

  /** 后手结束回合 → 整轮结算，开下一轮，且先后手互换 */
  st.phase = 'killerMain';
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  st.pendingEvolutionAck = null;
  handleAction(st, second, { type: 'endTurn' }, content);
  st.pendingEvolutionAck = null;
  console.log(`   后手结束后：round=${st.round} 新的顺序=${JSON.stringify(st.killerTurnOrder)} index=${st.killerTurnIndex}`);
  ok(st.round === 2, '开了新一轮（round = 2）', `${st.round}`);
  ok(st.killerTurnOrder[0] === second, '先后手互换了（原来的后手变成先手）', `${st.killerTurnOrder[0]}`);
  ok(st.killerTurnOrder[1] === first, '原来的先手变成后手');
  const drewB = st.killers[second].hand.length - handBefore.b;
  ok(drewB >= 2, '后手回合结束也抽了牌', `+${drewB}`);
}

console.log('=== ⑩ 遭遇后本轮双双结束 ===');
{
  const st = ready();
  const [first, second] = st.killerTurnOrder;
  /** 造一个遭遇：先手杀手和一名幸存者同格 */
  const surv = st.players[st.turnOrder[0]];
  const kA = st.players[first];
  surv.roomId = kA.roomId;
  surv.alive = true;
  /** 直接用引擎的开战入口 */
  const { startEncounter } = await import('../../server/dist/game/engine.js');
  startEncounter(st, kA.roomId);
  console.log(`   遭遇地点=${st.encounter?.roomId} 本轮因遭遇结束=${st.killerRoundEndedByEncounter}`);
  ok(Boolean(st.encounter), '遭遇已开始');
  ok(st.killerRoundEndedByEncounter === true, '已标记"本轮因遭遇结束"');

  /** 结束遭遇并让杀手回合收尾 */
  const { finishEncounter } = await import('../../server/dist/game/engine.js');
  finishEncounter(st);
  st.pendingEvolutionAck = null;
  /** 撤离队列要一个个走完；这里直接把队列清掉让它结束 */
  if (st.encounter && st.encounter.step === 'flee') {
    st.encounter.fleeQueue = [];
    st.encounter = null;
    const { endKillerTurn } = await import('../../server/dist/game/engine.js');
    endKillerTurn(st);
    st.pendingEvolutionAck = null;
  }
  console.log(`   遭遇结束后：round=${st.round} 新的顺序=${JSON.stringify(st.killerTurnOrder)}`);
  ok(st.round === 2, '直接进入下一轮（没有让后手再行动）', `${st.round}`);
  ok(st.killerTurnOrder[0] === second, '下一轮先后手已互换');
  ok(st.killerRoundEndedByEncounter === false, '标记已复位');
}

console.log('=== ⑪ 单杀手模式仍然抽 3 张（回归）===');
{
  const st = createLobby('TEST', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players['h'], s: bs };
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer1';
  st.players['h'].ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.phase = 'killerMain';
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  const before = st.killerHand.length;
  handleAction(st, 'h', { type: 'endTurn' }, content);
  console.log(`   单杀手模式回合结束抽了 ${st.killerHand.length - before} 张`);
  ok(st.killerHand.length - before === 3, '单杀手模式抽 3 张（未被 2对3 改动影响）',
    `${st.killerHand.length - before}`);
}

console.log('=== ⑫ 捕网结算推迟到所有杀手回合结束后 ===');
{
  const st = ready('killer4', 'killer5');   // A = 女猎手
  const [first, second] = st.killerTurnOrder;
  /** 先手是女猎手时才有陷阱；这里手工造一个捕网锁 */
  st.netLocks = [{ roomId: 'R1', playerId: st.turnOrder[0], round: st.round }];
  console.log(`   造一个捕网锁：${JSON.stringify(st.netLocks)} round=${st.round}`);
  /** 先手结束回合 → 捕网**不该**被清（后手还没行动） */
  handleAction(st, first, { type: 'endTurn' }, content);
  st.pendingEvolutionAck = null;
  console.log(`   先手结束后 netLocks = ${JSON.stringify(st.netLocks)} round=${st.round}`);
  ok((st.netLocks ?? []).length === 1, '先手回合结束后捕网仍在（后手还没行动）');

  /** 后手结束回合 → 整轮结束，捕网解除 */
  st.phase = 'killerMain';
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  st.pendingEvolutionAck = null;
  handleAction(st, second, { type: 'endTurn' }, content);
  st.pendingEvolutionAck = null;
  console.log(`   后手结束后 netLocks = ${JSON.stringify(st.netLocks)} round=${st.round}`);
  ok((st.netLocks ?? []).length === 0, '两名杀手回合都结束后捕网解除');
  void setupHunterTraps; void placeHunterTrap;
}

console.log('=== ⑬ 进化：队伍等级共享，各自套用自己的效果 ===');
{
  /** A = 屠夫（2 级力量+1、3 级解锁残酷暴怒）；B = 狼人（3 级力量+1、2 级解锁超听觉） */
  const st = ready('killer1', 'killer5');
  const [a, b] = st.killerIds;
  const sliceA = st.killers[a];
  const sliceB = st.killers[b];
  const powA0 = sliceA.power;
  const powB0 = sliceB.power;
  console.log(`   初始：${st.players[a]?.name} 力量 ${powA0}，${st.players[b]?.name} 力量 ${powB0}`);

  /** 直接触发一次进化 */
  runUpgrade(st);
  st.pendingEvolutionAck = null;
  console.log(`   1 级：等级=${st.killerLevel} A力量=${st.killers[a].power} B力量=${st.killers[b].power}`);
  ok(st.killerLevel === 2, '队伍等级升到 2', `${st.killerLevel}`);

  /** 再升到 3 级：屠夫 2 级 +1；狼人 3 级 +1 */
  runUpgrade(st);
  st.pendingEvolutionAck = null;
  console.log(`   2 级：等级=${st.killerLevel} A力量=${st.killers[a].power} B力量=${st.killers[b].power}`);
  ok(st.killerLevel === 3, '队伍等级升到 3', `${st.killerLevel}`);
  ok(st.killers[a].power === powA0 + 1, '屠夫在 2 级拿到 +1 力量', `${powA0} → ${st.killers[a].power}`);
  ok(st.killers[b].power === powB0 + 1, '狼人在 3 级拿到 +1 力量', `${powB0} → ${st.killers[b].power}`);

  /** 锁定牌各自入自己手牌：屠夫 3 级 → 残酷暴怒；狼人 2 级 → 超听觉 */
  const handA = st.killers[a].hand;
  const handB = st.killers[b].hand;
  console.log(`   屠夫手牌 = ${JSON.stringify(handA)}`);
  console.log(`   狼人手牌 = ${JSON.stringify(handB)}`);
  ok(handA.includes('butcher_rage'), '屠夫解锁了自己 3 级的「残酷暴怒」');
  ok(handB.includes('wolf_hearing'), '狼人解锁了自己 2 级的「超听觉」');
  ok(!handA.includes('wolf_hearing'), '屠夫没拿到狼人的牌');
  ok(!handB.includes('butcher_rage'), '狼人没拿到屠夫的牌');
  /** 等级对两人一致 */
  ok(st.killerLevel === 3, '两人共用同一个等级');
  void sliceA; void sliceB;
}

console.log('=== ⑧ 杀手与幸存者同格不影响搜索与修理（2对3 专属）===');
{
  const { killerInRoom } = await import('../../server/dist/game/effects.js');
  /** 2对3：同格不封锁 */
  const st = ready();
  const surv = st.players[st.turnOrder[0]];
  const kA = st.players[st.killerIds[0]];
  surv.roomId = kA.roomId;
  console.log(`   2对3：幸存者与杀手同在「${surv.roomId}」→ killerInRoom = ${killerInRoom(st, surv.roomId)}`);
  ok(killerInRoom(st, surv.roomId) === false, '2对3 同格不封锁搜索/修理');

  /** 对照：1对1 里同格仍然封锁（原本的规则不能被改坏） */
  const st2 = createLobby('T2', 'h', 'H', content, 'cabin');
  st2.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st2.players = { h: st2.players['h'], s: bs };
  st2.players['h'].faction = 'killer';
  st2.players['h'].characterId = 'killer1';
  st2.players['h'].ready = true;
  st2.hostId = 'h';
  st2.soloSurvivorCharacterIds = survCharIds.slice(0, st2.rules.maxSurvivors);
  startGame(st2, content, 'h');
  const s2 = Object.values(st2.players).find((p) => p.faction === 'survivor');
  const k2 = Object.values(st2.players).find((p) => p.faction === 'killer');
  s2.roomId = k2.roomId;
  console.log(`   1对1：同格 → killerInRoom = ${killerInRoom(st2, s2.roomId)}`);
  ok(killerInRoom(st2, s2.roomId) === true, '1对1 同格仍然封锁（回归）');
}

console.log('=== ⑦ 查看另一名杀手界面（只读）的信息来源 ===');
{
  const st = ready('killer1', 'killer5');
  const [a, b] = st.killerIds;
  const va = buildSnapshot(st, 'k1');
  const vb = buildSnapshot(st, 'k2');
  console.log(`   K1 看到的"另一名杀手" = ${va.otherKiller?.name}（${va.otherKiller?.characterName}）`);
  console.log(`   K2 看到的"另一名杀手" = ${vb.otherKiller?.name}（${vb.otherKiller?.characterName}）`);
  ok(va.otherKiller?.id === b, 'K1 的 otherKiller 指向 K2', `${va.otherKiller?.id}`);
  ok(vb.otherKiller?.id === a, 'K2 的 otherKiller 指向 K1', `${vb.otherKiller?.id}`);
  /** 看到的是对方的手牌，不是自己的 */
  const mineA = [...(va.yourKillerHand ?? [])].sort().join(',');
  const otherA = (va.otherKiller?.hand ?? []).map((c) => c.id).sort().join(',');
  console.log(`   K1 自己手牌 = ${mineA}`);
  console.log(`   K1 看到的对方手牌 = ${otherA}`);
  ok(mineA !== otherA, 'K1 看到的对方手牌与自己不同');
  ok((va.otherKiller?.hand ?? []).length > 0, '对方手牌非空');
  ok(typeof va.otherKiller?.power === 'number', '带对方力量', `${va.otherKiller?.power}`);
  ok(typeof va.otherKiller?.level === 'number', '带对方进化等级', `${va.otherKiller?.level}`);
  ok(typeof va.otherKiller?.deckCount === 'number', '带对方摸牌堆数量', `${va.otherKiller?.deckCount}`);
  ok(Array.isArray(va.otherKiller?.evolutionEffects), '带对方的进化效果');
  ok(typeof va.otherKiller?.isActing === 'boolean', '带"是否轮到他行动"');
  /** 幸存者不该拿到这份杀手内部信息 */
  const sv = buildSnapshot(st, 's1');
  ok(sv.otherKiller == null, '幸存者拿不到 otherKiller');
  /** 非 2v3 模式也没有 */
  const st2 = createLobby('T3', 'h', 'H', content, 'cabin');
  st2.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st2.players = { h: st2.players['h'], s: bs };
  st2.players['h'].faction = 'killer';
  st2.players['h'].characterId = 'killer1';
  st2.players['h'].ready = true;
  st2.hostId = 'h';
  st2.soloSurvivorCharacterIds = survCharIds.slice(0, st2.rules.maxSurvivors);
  startGame(st2, content, 'h');
  ok(buildSnapshot(st2, 'h').otherKiller == null, '非 2v3 模式没有 otherKiller');
}

console.log('=== ⑥ 共享地图、彼此位置、战报 ===');
{
  const st = ready('killer1', 'killer5');
  const [a, b] = st.killerIds;
  /** 把两人放到不同地点，确认彼此都能看到对方位置 */
  st.players[a].roomId = st.map.killerStartRoomId;
  st.players[b].roomId = st.map.survivorStartRoomId;
  const va = buildSnapshot(st, 'k1');
  const vb = buildSnapshot(st, 'k2');
  const posA = va.players.find((p) => p.id === a)?.roomId;
  const posB = va.players.find((p) => p.id === b)?.roomId;
  console.log(`   K1 视角：自己 ${posA}，对方 ${posB}`);
  ok(posA === st.players[a].roomId, 'K1 看得到自己位置');
  ok(posB === st.players[b].roomId, 'K1 看得到另一名杀手的位置（共享）');
  const posA2 = vb.players.find((p) => p.id === a)?.roomId;
  ok(posA2 === st.players[a].roomId, 'K2 也看得到 K1 的位置');
  ok(va.map.id === vb.map.id, '两人共用同一张地图', `${va.map.id}`);
  /** 战报共享：写一条战报两人都看得到 */
  const { log } = await import('../../server/dist/game/effects.js');
  log(st, '测试：这条战报两名杀手都该看到。', 'killer');
  const va2 = buildSnapshot(st, 'k1');
  const vb2 = buildSnapshot(st, 'k2');
  ok(va2.logs.some((l) => l.text.includes('两名杀手都该看到')), 'K1 能看到这条杀手战报');
  ok(vb2.logs.some((l) => l.text.includes('两名杀手都该看到')), 'K2 也看得到（战报共享）');
}

console.log('=== ⑭ 两名杀手的专属机制互不干扰 ===');
{
  /** A = 雕像（会分裂成 4 个棋子），B = 普通杀手 —— B 不该多出雕像棋子 */
  const st = ready('killer6', 'killer5');
  const statues = (st.statueIds ?? []).length;
  const allKillers = Object.values(st.players).filter((p) => p.faction === 'killer');
  console.log(`   雕像棋子数 = ${statues}，杀手棋子总数 = ${allKillers.length}`);
  ok(statues === 4, '雕像杀手确实分裂出 4 个棋子', `${statues}`);
  /** 狼人（B）不该有 statueIndex */
  const wolfPieces = allKillers.filter((p) => p.characterId === 'killer5');
  ok(wolfPieces.every((p) => p.statueIndex == null), '狼人的棋子没有 statueIndex（没被雕像机制污染）');
  /** 雕像的 4 个棋子共享一份状态，狼人有自己独立的一份 */
  const statueId = st.statueIds[0];
  const wolfId = allKillers.find((p) => p.characterId === 'killer5')?.id;
  ok(st.killers[statueId] !== st.killers[wolfId], '雕像与狼人的状态切片是两份');
  console.log(`   雕像切片力量=${st.killers[statueId]?.power}，狼人切片力量=${st.killers[wolfId]?.power}`);
  ok(st.killers[statueId]?.power === 5, '雕像切片力量 = 5', `${st.killers[statueId]?.power}`);
  ok(st.killers[wolfId]?.power === 6, '狼人切片力量 = 6', `${st.killers[wolfId]?.power}`);
  /** 雕像的手牌是雕像的牌，狼人拿到的是狼人的牌 */
  const statueHand = st.killers[statueId]?.hand ?? [];
  const wolfHand = st.killers[wolfId]?.hand ?? [];
  console.log(`   雕像手牌=${JSON.stringify(statueHand)}`);
  console.log(`   狼人手牌=${JSON.stringify(wolfHand)}`);
  ok(statueHand.every((id) => /^statue_/.test(id)), '雕像手里的牌全是自己的');
  ok(wolfHand.every((id) => /^wolf_/.test(id)), '狼人手里的牌全是自己的');
}

console.log('=== ⑭-b 雕像杀手在 2对3 里只算一个行动位 ===');
{
  /**
   * 雕像会把自己拆成 4 个 `faction='killer'` 的棋子，但它们**共享一份切片**。
   * 若把 4 个都算进 `killerIds`，进化会被重复结算；先后手也会算错。
   */
  const st = ready('killer6', 'killer5');
  console.log(`   killerIds       = ${JSON.stringify(st.killerIds)}`);
  console.log(`   killerTurnOrder = ${JSON.stringify(st.killerTurnOrder)}`);
  ok(st.killerIds.length === 2, 'killerIds 只有 2 个（雕像只算一个）', `${st.killerIds.length}`);
  ok(st.killerTurnOrder.length === 2, 'killerTurnOrder 只有 2 个');
  /** 雕像那个行动位必须指向主雕像（状态挂在那儿），不能是原始棋子 */
  const statueSlot = st.killerIds.find((id) => (st.statueIds ?? []).includes(id));
  ok(Boolean(statueSlot), '雕像的行动位指向雕像棋子', `${statueSlot}`);
  ok(statueSlot === st.statueIds[0], '指向的是主雕像（1 号）', `${statueSlot}`);
  /** 轮到雕像时，他手上的牌必须是雕像自己的牌 */
  const statueId = st.statueIds[0];
  const wolfId = st.killerIds.find((id) => id !== statueId);
  console.log(`   雕像手牌 = ${JSON.stringify(st.killers[statueId]?.hand)}`);
  console.log(`   狼人手牌 = ${JSON.stringify(st.killers[wolfId]?.hand)}`);
  ok((st.killers[statueId]?.hand ?? []).every((id) => /^statue_/.test(id)), '雕像手牌全是雕像的牌');
  ok((st.killers[wolfId]?.hand ?? []).every((id) => /^wolf_/.test(id)), '狼人手牌全是狼人的牌');
  /** 雕像的 4 个棋子共享同一份切片（改动前的行为） */
  const shares = (st.statueIds ?? []).filter((sid) => st.killers[sid] === st.killers[statueId]).length;
  ok(shares === 4, '4 尊雕像共享同一份切片', `${shares}`);

  /** 进化只该涨 1 级（不是 4 级） */
  runUpgrade(st);
  st.pendingEvolutionAck = null;
  ok(st.killerLevel === 2, '雕像局进化只涨到 2 级（没被 4 个棋子重复结算）', `${st.killerLevel}`);
  runUpgrade(st);
  st.pendingEvolutionAck = null;
  ok(st.killerLevel === 3, '再进化一次到 3 级', `${st.killerLevel}`);
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
