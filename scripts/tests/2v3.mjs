/**
 * 常驻回归测试：2对3（`mode = '2v3'`）模式。
 *
 * 覆盖已实现的规则：
 *  ① 2 杀手 + 3 幸存者，各棋子正确
 *  ② 两名杀手**各有一套**牌库/手牌/弃牌堆/力量（互不共用）
 *  ③ 开局钥匙进度 +1（把搜索牌堆垫底的钥匙摘下明置，牌堆只剩 9 把）
 *  ④ 开局修理进度 +1
 *  ⑤ 先后手偏好：两人一致才生效；未定则继续提示
 *  ⑥ 两名杀手各自的快照互不串台
 *
 * 跑法：`npm run test:2v3`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, handleAction, buildSnapshot, startGame, applyKillerOrderPick,
} from '../../server/dist/game/engine.js';
import { isKeyCard } from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const killerCharIds = content.characters.filter((c) => c.faction === 'killer').map((c) => c.id);

/** 造一个 2v3 大厅：k1/k2 杀手，s1/s2/s3 幸存者 */
function lobby2v3(orderPicks = [null, null]) {
  const st = createLobby('TEST', 'k1', 'K1', content, 'cabin');
  st.mode = '2v3';
  const map = { k1: st.players['k1'] };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players['k1'].faction = 'killer';
  st.players['k1'].characterId = killerCharIds[0];
  st.players['k2'].faction = 'killer';
  st.players['k2'].characterId = killerCharIds[4];
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  st.players['k1'].orderPick = orderPicks[0];
  st.players['k2'].orderPick = orderPicks[1];
  return st;
}

/** 一局普通 1对1，用来拿"基准搜索牌堆"（牌序随机，但钥匙数与垫底牌性质是确定的） */
function baselineDeck() {
  const base = createLobby('BASE', 'h', 'H', content, 'cabin');
  base.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  base.players = { h: base.players['h'], s: bs };
  base.players['h'].faction = 'killer';
  base.players['h'].characterId = 'killer1';
  base.players['h'].ready = true;
  base.hostId = 'h';
  base.soloSurvivorCharacterIds = survCharIds.slice(0, base.rules.maxSurvivors);
  startGame(base, content, 'h');
  return base.searchDeck;
}

console.log('=== ① 开局棋子构成 ===');
{
  const st = lobby2v3();
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  const killers = Object.values(st.players).filter((p) => p.faction === 'killer');
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  ok(killers.length === 2, '恰好 2 个杀手棋子', `${killers.length}`);
  ok(survs.length === 3, '恰好 3 个幸存者棋子', `${survs.length}`);
  ok(st.killerIds.length === 2, 'killerIds 长度 2', JSON.stringify(st.killerIds));
  ok(st.turnOrder.length === 3, 'turnOrder 有 3 名幸存者', `${st.turnOrder.length}`);
}

console.log('=== ② 两名杀手各有一套牌 ===');
{
  const st = lobby2v3();
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  const [a, b] = st.killerIds;
  const sa = st.killers[a];
  const sb = st.killers[b];
  console.log(`   ${st.players[a]?.name}: deck=${sa?.deck.length} hand=${sa?.hand.length} power=${sa?.power}`);
  console.log(`   ${st.players[b]?.name}: deck=${sb?.deck.length} hand=${sb?.hand.length} power=${sb?.power}`);
  ok(Boolean(sa) && Boolean(sb), '两个杀手都有切片');
  ok(sa !== sb, '两个杀手**不共用**同一个切片对象');
  ok((sa?.deck.length ?? 0) > 0 && (sb?.deck.length ?? 0) > 0, '两人都有摸牌堆');
  ok((sa?.hand.length ?? 0) > 0 && (sb?.hand.length ?? 0) > 0, '两人都有起始手牌');
  ok(sa?.power === 5, '杀手A 力量 = 5（屠夫）', `${sa?.power}`);
  ok(sb?.power === 6, '杀手B 力量 = 6（狼人）', `${sb?.power}`);
  const overlap = (sa?.deck ?? []).filter((id) => (sb?.deck ?? []).includes(id));
  ok(overlap.length === 0, '两人牌库没有重叠（各按自己的角色组牌）', `${overlap.length} 张重叠`);
}

console.log('=== ③ 开局钥匙进度 +1 ===');
{
  const keysInDeck = (deck) => deck.filter((id) => isKeyCard(content.cards.byId[id] ?? { effects: [] })).length;
  const before = baselineDeck();
  ok(isKeyCard(content.cards.byId[before[before.length - 1]] ?? { effects: [] }),
    '基准牌堆垫底那张是钥匙', content.cards.byId[before[before.length - 1]]?.name);

  const st = lobby2v3();
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  console.log(`   基准 ${before.length} 张（钥匙 ${keysInDeck(before)}）→ 2对3 ${st.searchDeck.length} 张（钥匙 ${keysInDeck(st.searchDeck)}）`);
  ok(st.keysCollected === 1, '钥匙进度 = 1', `${st.keysCollected}`);
  ok(st.searchDeck.length === before.length - 1, '搜索牌堆比基准少一张', `${before.length} → ${st.searchDeck.length}`);
  ok(keysInDeck(st.searchDeck) === keysInDeck(before) - 1, '牌堆里的钥匙少 1 把（只剩 9 把）',
    `${keysInDeck(before)} → ${keysInDeck(st.searchDeck)}`);
  /**
   * 注意：**不**断言"新的垫底牌不是钥匙" ——
   * 其余钥匙是随机铺在牌堆里的，摘掉垫底那张之后，新的最后一张完全可能正好是另一把钥匙。
   * 牌背 1 只是普通牌背，没有"这里一定是钥匙"的含义。
   */
}

console.log('=== ④ 开局修理进度 +1 ===');
{
  const st = lobby2v3();
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  ok(st.repairProgress === 1, '修理进度 = 1', `${st.repairProgress}/${st.rules.repairNeeded}`);
}

console.log('=== ⑤ 先后手偏好：两人一致才生效 ===');
{
  const st1 = lobby2v3(['first', 'second']);
  startGame(st1, content, 'k1');
  const [idA, idB] = st1.killerIds;
  ok(st1.killerOrderDecided === true, '一先一后：顺序已定');
  ok(st1.killerTurnOrder[0] === idA, '先手是选「先手」的那人', `${st1.killerTurnOrder[0]}`);
  ok(st1.killerId === idA, 'killerId 指向先手', `${st1.killerId}`);
  ok(st1.killerTurnOrder[1] === idB, '后手是另一人');

  const st2 = lobby2v3([null, null]);
  startGame(st2, content, 'k1');
  ok(st2.killerOrderDecided === false, '都没选：顺序未定，等玩家选');

  const st3 = lobby2v3(['first', 'first']);
  startGame(st3, content, 'k1');
  ok(st3.killerOrderDecided === true, '都选先手：也算一致（按座位）');

  /** 开局后才补选：走真实动作 */
  const st4 = lobby2v3([null, null]);
  startGame(st4, content, 'k1');
  ok(st4.killerOrderDecided === false, '开局时未定');
  const [a4, b4] = st4.killerIds;
  st4.phase = 'lobby';
  handleAction(st4, b4, { type: 'pickKillerOrder', order: 'first' }, content);
  st4.players[a4].orderPick = 'second';
  applyKillerOrderPick(st4);
  ok(st4.killerOrderDecided === true, '补选后顺序已定');
  ok(st4.killerTurnOrder[0] === b4, '先手是选「先手」的那人', `${st4.killerTurnOrder[0]}`);
  ok(st4.players[b4].orderPick === 'first', '动作已记录偏好', `${st4.players[b4].orderPick}`);
}

console.log('=== ⑥ 两名杀手各自的快照互不串台 ===');
{
  const st = lobby2v3();
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  const va = buildSnapshot(st, 'k1');
  const vb = buildSnapshot(st, 'k2');
  console.log(`   K1 视角手牌 = ${JSON.stringify(va.yourKillerHand)}`);
  console.log(`   K2 视角手牌 = ${JSON.stringify(vb.yourKillerHand)}`);
  ok(Array.isArray(va.yourKillerHand), 'K1 看得到自己的手牌');
  ok(Array.isArray(vb.yourKillerHand), 'K2 看得到自己的手牌');
  const same =
    JSON.stringify([...(va.yourKillerHand ?? [])].sort()) ===
    JSON.stringify([...(vb.yourKillerHand ?? [])].sort());
  ok(!same, '两人的手牌不是同一份');
  const sv = buildSnapshot(st, 's1');
  ok(sv.yourKillerHand == null, '幸存者看不到杀手手牌');
  /** 先后手信息要发给双方（不然大厅没法显示） */
  ok(typeof va.killerOrderDecided === 'boolean', '快照带 killerOrderDecided');
  ok(Array.isArray(va.killerTurnOrder), '快照带 killerTurnOrder');
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
