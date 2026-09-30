/**
 * 常驻回归测试：**现有模式**的开局与基本流程。
 *
 * 用途：杀手状态切片化（`KillerState` / `state.killers`）这类架构改造
 * 很容易弄坏 solo / duo / vs2 / multi，每次改完都跑一遍。
 *
 * 跑法：`npm run test:regress`（在仓库根目录）
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, handleAction, buildSnapshot, startGame,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters
  .filter((c) => c.faction === 'survivor')
  .map((c) => c.id);
const killerCharIds = content.characters
  .filter((c) => c.faction === 'killer')
  .map((c) => c.id);

/** 造一个大厅 */
function lobby(mode, players) {
  const st = createLobby('TEST', players[0], 'P0', content, 'cabin');
  st.mode = mode;
  const map = {};
  for (const pid of players) {
    if (pid === players[0]) {
      map[pid] = st.players[players[0]];
    } else {
      map[pid] = createPlayer(pid, pid, pid);
    }
    map[pid].ready = true;
  }
  st.players = map;
  st.hostId = players[0];
  return st;
}

console.log('=== ① solo：一个人热座 ===');
{
  const st = lobby('solo', ['h']);
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  const kids = () => Object.values(st.players).filter((p) => p.faction === 'killer');
  const survs = () => Object.values(st.players).filter((p) => p.faction === 'survivor');
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  ok(kids().length === 1, '恰好 1 个杀手棋子');
  ok(survs().length === st.rules.maxSurvivors, `恰好 ${st.rules.maxSurvivors} 个幸存者棋子`);
  ok(st.killerIds.length === 1, 'killerIds 长度 1');
  ok(st.killerHand.length > 0, '杀手有起始手牌', `${st.killerHand.length} 张`);
  ok(st.killerDeck.length > 0, '杀手摸牌堆非空', `${st.killerDeck.length} 张`);
  ok(st.searchDeck.length > 0, '搜索牌堆非空', `${st.searchDeck.length} 张`);
  ok(st.discoveryDeck.length > 0, '发现牌堆非空', `${st.discoveryDeck.length} 张`);
  const snap = buildSnapshot(st, 'h');
  ok(snap.players.length > 0, '快照能出人', `${snap.players.length} 个棋子`);
}

console.log('=== ② duo：1对1 ===');
{
  const st = lobby('duo', ['h', 's']);
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer5';
  st.players['s'].faction = 'survivor';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  ok(st.killerPower === 6, '狼人起始力量 6', `${st.killerPower}`);
  ok(st.killers[st.killerId]?.power === 6, '切片里的力量也是 6');
  ok(st.killerHand.length > 0, '有起始手牌');
  const sv = buildSnapshot(st, 's');
  ok(sv.yourKillerHand == null, '幸存者看不到杀手手牌');
  const kv = buildSnapshot(st, 'h');
  ok(Array.isArray(kv.yourKillerHand), '杀手看得到自己手牌');
}

console.log('=== ③ vs2：1对2 ===');
{
  const st = lobby('vs2', ['h', 's1', 's2']);
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer3';
  st.players['s1'].faction = 'survivor';
  st.players['s2'].faction = 'survivor';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  ok(st.killerPower === 4, '谋杀者起始力量 4', `${st.killerPower}`);
  ok(st.survivorOperators.length === 2, '两个幸存者操控者', `${st.survivorOperators.length}`);
  const kv = buildSnapshot(st, 'h');
  ok(Array.isArray(kv.yourKillerHand), '杀手快照正常');
}

console.log('=== ④ multi：1对3 ===');
{
  const st = lobby('multi', ['h', 's1', 's2', 's3']);
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer9';
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  ok(st.killerPower === 2, '女王起始力量 2', `${st.killerPower}`);
  ok(Object.values(st.players).filter((p) => p.faction === 'survivor').length === 3, '三个幸存者');
}

console.log('=== ⑤ 各杀手的起始力量与牌组都对 ===');
{
  const expect = {
    killer1: 5, killer2: 2, killer3: 4, killer4: 3, killer5: 6,
    killer6: 5, killer7: 2, killer8: 4, killer9: 2,
  };
  for (const kid of killerCharIds) {
    const st = lobby('duo', ['h', 's']);
    st.players['h'].faction = 'killer';
    st.players['h'].characterId = kid;
    st.players['s'].faction = 'survivor';
    st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
    try {
      startGame(st, content, 'h');
      const want = expect[kid];
      const slice = st.killers[st.killerId];
      ok(st.killerPower === want && slice?.power === want, `${kid} 起始力量 = ${want}`,
        `顶层 ${st.killerPower} / 当前切片 ${slice?.power}`);
      ok((slice?.deck.length ?? 0) > 0, `${kid} 有摸牌堆`, `${slice?.deck.length ?? 0}`);
      ok((slice?.locked.length ?? 0) > 0, `${kid} 有锁定牌`, `${slice?.locked.length ?? 0} 张`);
      ok((slice?.hand.length ?? 0) > 0, `${kid} 有起始手牌`, `${slice?.hand.length ?? 0} 张`);
    } catch (e) {
      fail += 1;
      console.log(`  FAIL ${kid} 开局失败：${e.message}`);
    }
  }
}

console.log('=== ⑥ 做完一般行动后镜像仍然一致 ===');
{
  const st = lobby('duo', ['h', 's']);
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer1';
  st.players['s'].faction = 'survivor';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;

  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  const searchRoom = st.map.rooms.find((r) => (r.tags ?? []).includes('searchable'));
  if (searchRoom) surv.roomId = searchRoom.id;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = st.turnOrder.indexOf(surv.id);
  const deckBefore = st.searchDeck.length;
  let survOk = false;
  try {
    handleAction(st, 's', { type: 'search' }, content);
    survOk = true;
  } catch (e) {
    console.log(`   幸存者搜索失败：${e.message}`);
  }
  ok(survOk, '幸存者在搜索点能搜索');
  ok(st.searchDeck.length === deckBefore - 1, '搜索后牌堆少一张', `${deckBefore} → ${st.searchDeck.length}`);

  st.killerId = st.killerIds[0];
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  /**
   * 挑一张**当前能打的**牌：
   *  - 必须 `speed === 'fast'`（现在是快速阶段）
   *  - **费用要付得起**（需要 `handCost` 张其他手牌）。
   *    屠夫的「疯狂」费用 2，手牌不够时打不出去 ——
   *    以前这里会回退到"任意快速牌"，于是偶发失败。
   */
  const curHand = st.killerHand;
  const card = curHand.find((id) => {
    const c = content.cards.byId[id];
    if (!c || c.speed !== 'fast') return false;
    return curHand.length - 1 >= (c.handCost ?? 0);
  });
  let killerOk = false;
  if (!card) {
    console.log('   手牌里没有付得起的快速牌，跳过打牌检查', JSON.stringify(curHand));
    killerOk = true;
  } else {
    try {
      const cost = content.cards.byId[card]?.handCost ?? 0;
      const pay = curHand.filter((x) => x !== card).slice(0, cost);
      handleAction(st, 'h', { type: 'playKillerCard', cardId: card, payCardIds: pay }, content);
      killerOk = true;
    } catch (e) {
      console.log(`   杀手打牌失败：${e.message}`);
    }
  }
  ok(
    killerOk,
    '杀手能打快速牌',
    card
      ? `${content.cards.byId[card]?.name}（费用 ${content.cards.byId[card]?.handCost ?? 0}）`
      : '（无付得起的快速牌）',
  );
  const slice = st.killers[st.killerId];
  ok(JSON.stringify(slice.hand) === JSON.stringify(st.killerHand), '打牌后切片手牌 = 顶层手牌');
  ok(slice.power === st.killerPower, '打牌后切片力量 = 顶层力量');
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
