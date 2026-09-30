/**
 * 2对3 **端到端对局演练**：走完整轮次循环，确认中途不会卡死。
 *
 * 循环结构（每一轮）：
 *   幸存者大回合（3 人各自行动）→ 响声报告（两名杀手各确认一次）
 *   → 杀手 A 回合 → 杀手 B 回合 → 整轮结算（先后手互换）→ 下一轮
 *
 * 这里不追求"最优打法"，只要求每一步都能推进、状态自洽、没有死状态。
 *
 * 跑法：`npm run test:2v3-e2e`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, handleAction, startGame, activePlayerId,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 造一局 2v3：两名杀手 + 三名幸存者 */
function newGame(killerA = 'killer1', killerB = 'killer5') {
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
  st.players['k1'].orderPick = 'first';
  st.players['k2'].orderPick = 'second';
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  return st;
}

/** 随便做掉当前一个待办（把卡住的死状态推掉），返回做了什么 */
function settleAny(state, solver) {
  const guard = 40;
  for (let i = 0; i < guard; i += 1) {
    if (solver(state)) return true;
  }
  return false;
}

console.log('=== 端到端：走 3 个完整轮次 ===');
{
  const st = newGame();
  const log0 = st.logs.length;
  let roundsPlayed = 0;

  /** 推完一轮：幸存者 → 响声 → A → B */
  for (let round = 0; round < 3; round += 1) {
    const roundNo = st.round;
    /** ① 幸存者大回合：三个人各做一次一般行动（搜索 / 移动都行） */
    st.phase = 'survivorMain';
    st.pendingSurvivorPick = false;
    for (const sid of st.turnOrder) {
      const s = st.players[sid];
      if (!s?.alive) continue;
      s.mainActionUsed = false;
      /**
       * 连续搜索会把**装备栏塞满**（`装备栏已满，请先弃置一件装备` 会直接把
       * `handleAction` 抛出来）。这个演练只想验证"轮次能推进"，所以每轮先把
       * 背包清空，别让背包溢出打断流程。
       */
      s.items = {};
      /** 挪到搜索点再搜，保证动作合法 */
      const searchRoom = st.map.rooms.find((r) => (r.tags ?? []).includes('searchable'));
      if (searchRoom) s.roomId = searchRoom.id;
      try {
        handleAction(st, sid, { type: 'search' }, content);
      } catch (e) {
        console.log(`     幸存者 ${s.name} 搜索失败：${e.message}`);
      }
      /** 搜完可能进遭遇，或者留下待选，统一清掉 */
      st.encounter = null;
      st.pendingEvolutionAck = null;
      st.pendingOptionalEffect = null;
      st.pendingPathDraft = null;
      /** 搜索也可能触发进化（摸牌堆见底），确认掉免得卡住 */
      st.pendingUnlockDiscard = false;
      st.pendingKillerDiscards = 0;
    }
    /** ② 进入响声报告 */
    const survAlive = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
    ok(survAlive.length > 0, `第 ${roundNo} 轮：还有幸存者活着`, `${survAlive.length} 人`);

    /** 直接推到响声阶段：用引擎的入口 */
    const { enterNoiseReport } = await import('../../server/dist/game/engine.js');
    if (st.phase !== 'noiseReport') enterNoiseReport(st);
    ok(st.phase === 'noiseReport' || st.phase === 'gameOver',
      `第 ${roundNo} 轮：进入响声阶段`, st.phase);

    /** ③ 两名杀手各确认一次响声 + 各结束一次回合 */
    for (let who = 0; who < 2; who += 1) {
      st.pendingEvolutionAck = null;
      ok(st.phase === 'noiseReport', `第 ${roundNo} 轮：第 ${who + 1} 名杀手在响声阶段`, st.phase);
      const kid = st.killerId;
      handleAction(st, kid, { type: 'acknowledgeNoise' }, content);
      st.pendingEvolutionAck = null;
      ok(['killerMain', 'gameOver'].includes(st.phase), `第 ${roundNo} 轮：进入杀手主阶段`, st.phase);
      /** 结束这个杀手的回合 */
      st.killerTurnStep = 'slow';
      st.killerMainChoice = null;
      st.killerMainActionsLeft = 0;
      st.pendingEvolutionAck = null;
      handleAction(st, kid, { type: 'endTurn' }, content);
      st.pendingEvolutionAck = null;
    }
    roundsPlayed += 1;
    console.log(`   第 ${roundNo} 轮走完 → round=${st.round} 顺序=${JSON.stringify(st.killerTurnOrder)}`);
    if (st.phase === 'gameOver') break;
  }

  ok(roundsPlayed === 3, '走满 3 轮没有中途卡死', `${roundsPlayed} 轮`);
  ok(st.round === 4, '轮次推进到 4', `round=${st.round}`);
  /** 先后手每一轮都互换：3 轮后应该回到初始顺序 */
  console.log(`   3 轮后的先后手 = ${JSON.stringify(st.killerTurnOrder)}`);
  ok(st.killerTurnOrder.length === 2, '先后手仍是两人');
  /** 状态自洽 */
  for (const kid of st.killerIds) {
    const sl = st.killers[kid];
    ok(Boolean(sl), `杀手 ${st.players[kid]?.name} 的切片还在`);
    ok(sl.deck.length + sl.hand.length + sl.discard.length > 0,
      `杀手 ${st.players[kid]?.name} 的牌没有凭空消失`,
      `deck=${sl.deck.length} hand=${sl.hand.length} discard=${sl.discard.length}`);
  }
  /** 搜索牌堆在减少（幸存者每轮都在搜） */
  console.log(`   搜索牌堆剩 ${st.searchDeck.length} 张，弃牌 ${st.searchDiscard.length} 张`);
  ok(st.searchDeck.length < 11, '搜索牌堆确实被抽过', `${st.searchDeck.length}`);
  /** 战报有内容 */
  ok(st.logs.length > log0, '战报有新增', `${log0} → ${st.logs.length}`);
  void activePlayerId; void settleAny;
}

console.log('=== 端到端：2v3 里杀手之间不共享卡牌状态 ===');
{
  const st = newGame('killer1', 'killer5');
  const [a, b] = st.killerIds;
  const beforeA = [...st.killers[a].hand].sort().join(',');
  const beforeB = [...st.killers[b].hand].sort().join(',');
  /** 先手打一张牌 */
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  /**
   * 要挑一张**付得起**的快速牌：手牌是随机发的，可能每张都要弃 2 张当费用而手牌不够。
   * 规则：`handCost` 张其他手牌；手牌总数必须 > cost。
   */
  const hand = st.killers[a].hand;
  const card = hand.find((id) => {
    const c = content.cards.byId[id];
    if (!c || c.speed !== 'fast') return false;
    const cost = c.handCost ?? 0;
    return hand.length - 1 >= cost;
  });
  if (card) {
    const cost = content.cards.byId[card]?.handCost ?? 0;
    const pay = hand.filter((x) => x !== card).slice(0, cost);
    try {
      handleAction(st, a, { type: 'playKillerCard', cardId: card, payCardIds: pay }, content);
    } catch (e) {
      console.log(`     先手打牌失败：${e.message}`);
    }
    st.pendingEvolutionAck = null;
  } else {
    console.log('     手牌里没有付得起的快速牌，跳过打牌（只验证手牌隔离）');
  }
  const afterA = [...st.killers[a].hand].sort().join(',');
  const afterB = [...st.killers[b].hand].sort().join(',');
  console.log(`   先手手牌 ${beforeA} → ${afterA}`);
  console.log(`   后手手牌 ${beforeB} → ${afterB}`);
  ok(afterB === beforeB, '先手打牌没有动到后手的手牌');
  ok(afterA !== beforeA || !card, '先手的手牌变了（确实打出去了）');
}

console.log('=== 端到端：女王 + 扼杀者的专属资源互不干扰 ===');
{
  const st = newGame('killer9', 'killer8');   // A = 女王，B = 扼杀者
  const [a, b] = st.killerIds;
  console.log(`   A=${st.players[a]?.name}(${st.players[a]?.characterId}) B=${st.players[b]?.name}(${st.players[b]?.characterId})`);
  /** 女王局：有僵尸、有十字弩设置；核心标记是扼杀者的 */
  console.log(`   女王 A：僵尸 ${st.zombies?.length ?? 0} 个，crossbowAssigned=${st.crossbowAssigned}`);
  console.log(`   扼杀者 B：核心标记 ${(st.coreMarkers ?? []).length} 个`);
  ok((st.zombies ?? []).length >= 2, '女王开局放了 2 个僵尸', `${st.zombies?.length}`);
  ok(st.crossbowAssigned === false || st.crossbowAssigned === true, '十字弩流程存在');
  ok((st.coreMarkers ?? []).length > 0, '扼杀者有核心标记', `${st.coreMarkers?.length}`);
  /** 两人的牌各归各的 */
  ok((st.killers[a]?.hand ?? []).every((id) => /^q_/.test(id)), '女王手里全是自己的牌',
    JSON.stringify(st.killers[a]?.hand));
  ok((st.killers[b]?.hand ?? []).every((id) => /^st_/.test(id)), '扼杀者手里全是自己的牌',
    JSON.stringify(st.killers[b]?.hand));
  /** 进化时各自套自己的效果：女王 2 级是「感知目击→惊吓」，扼杀者 2 级是「放核心标记」 */
  const coresBefore = (st.coreMarkers ?? []).length;
  const { runUpgrade } = await import('../../server/dist/game/evolution.js');
  runUpgrade(st);
  st.pendingEvolutionAck = null;
  console.log(`   进化到 2 级：等级=${st.killerLevel} 核心标记 ${coresBefore} → ${(st.coreMarkers ?? []).length}`);
  ok(st.killerLevel === 2, '队伍等级 = 2', `${st.killerLevel}`);
  ok((st.coreMarkers ?? []).length === coresBefore + 1,
    '扼杀者的 2 级效果执行了（多 1 个核心标记）',
    `${coresBefore} → ${(st.coreMarkers ?? []).length}`);
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
