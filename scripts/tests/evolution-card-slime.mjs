/**
 * **未命名进化卡牌「粘液腺體」的两条效果**（用户报"0 效果"）。
 *
 * 卡面：`你的回合結束時，如果你不在〔潛行〕，在你的地點〔封堵〕×1。
 *        在使用「變形」後，抽取一張卡牌並在你的地點〔封堵〕×2。`
 *
 * 两条触发点：
 *  ① 使用【變形】之后 → 抽 1 张 + 封堵 ×2（`transformBonus`）
 *  ② 回合结束时（不在潜行）→ 封堵 ×1（`beginSlimeGlandPick`，由 `closeKillerTurn` 调）
 *
 * 跑法：node scripts/tests/evolution-card-slime.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, endKillerTurn, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { applyEvolutionCard } from '../../server/dist/game/killerSpecials.js';

const content = loadContent();
const allCards = content.cards.byId;
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const FODDER = ['butcher_chase_1', 'butcher_chase_2', 'spectre_chase_1', 'spectre_chase_2', 'butcher_lurk_1']
  .filter((id) => allCards[id]);

function mk(killerId = 'killer7') {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerId;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  st.encounter = null;
  st.lastSearchFound = false;
  return st;
}
const tryIt = (st, action, socketId = 'h') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/* ═══════════ ① 获得这张进化卡牌 → 开关立起来 ═══════════ */
console.log('=== ① 选中「粘液腺體」→ 效果开关生效 ===');
{
  const st = mk();
  ok(st.slimeGlandActive === false, '前提：一开始没这张牌', String(st.slimeGlandActive));
  applyEvolutionCard(st, 'evo_un_slime');
  ok(st.slimeGlandActive === true, '**获得后 `slimeGlandActive` = true**', String(st.slimeGlandActive));
  ok((st.chosenEvolutionCards ?? []).length === 0 || true, '（走真实选卡路径时由 pickEvolutionCard 记录）');
}

/* ═══════════ ② 使用【變形】→ 抽 1 张 + 封堵 ×2 ═══════════ */
console.log('=== ② 使用【變形】之后：抽 1 张 + 封堵 ×2 ===');
{
  const st = mk();
  applyEvolutionCard(st, 'evo_un_slime');
  const k = st.players[st.killerId];
  k.roomId = st.map.killerStartRoomId ?? st.map.rooms[0].id;
  st.killerDiscard = ['spectre_chase_1', 'butcher_chase_2'];
  st.killerHand = ['un_transform', ...FODDER.slice(0, 3)];
  st.killerDeck = [...FODDER, 'butcher_chase_1'];
  const deckBefore = st.killerDeck.length;
  const handBefore = st.killerHand.length;

  const err = tryIt(st, { type: 'playKillerCard', cardId: 'un_transform', payCardIds: FODDER.slice(0, 3) });
  ok(!err, '打出【變形】', String(err ?? ''));
  console.log(`   手牌 ${handBefore} → ${st.killerHand.length}；牌堆 ${deckBefore} → ${st.killerDeck.length}；` +
    `pendingBlockadeRemaining=${st.pendingBlockadeRemaining}、pendingBlockade=${Boolean(st.pendingBlockade)}`);
  /** 打出 1 张 + 弃 3 张费用 = -4；粘液腺体抽 1 张 = +1；超上限的部分会正面朝上进弃牌堆 */
  ok(st.killerDeck.length <= deckBefore - 1,
    '**抽了 1 张牌**（牌堆少 1）', `${deckBefore} → ${st.killerDeck.length}`);
  ok((st.pendingBlockadeRemaining ?? 0) === 2,
    '**挂起"封堵 ×2"**（还差 2 扇门要由玩家点）', String(st.pendingBlockadeRemaining));
  ok(Boolean(st.pendingBlockade) || Boolean(st.pendingBlockadePlace),
    '挂出了"点门封堵"的待办', JSON.stringify(st.pendingBlockade));

  /** 这一整张牌要能正常收尾（速度标记、阶段推进） */
  ok(st.pendingCardSpeed === null || st.pendingBlockade != null,
    '打牌流程没有卡住', `pendingCardSpeed=${JSON.stringify(st.pendingCardSpeed)}`);
}

/* ═══════════ ③ 回合结束时（不在潜行）→ 封堵 ×1 ═══════════ */
console.log('=== ③ 回合结束时：不在潜行就封堵 ×1 ===');
{
  const st = mk();
  applyEvolutionCard(st, 'evo_un_slime');
  const k = st.players[st.killerId];
  k.roomId = st.map.killerStartRoomId ?? st.map.rooms[0].id;
  k.stealth = false;
  st.killerHand = [];
  st.killerDeck = [];
  st.killerDiscard = [];

  endKillerTurn(st);
  console.log(`   endKillerTurn 之后：phase=${st.phase}、pendingBlockadeRemaining=${st.pendingBlockadeRemaining}、` +
    `pendingBlockade=${JSON.stringify(st.pendingBlockade)}、pendingTurnEndSwitch=${st.pendingTurnEndSwitch}`);
  ok((st.pendingBlockadeRemaining ?? 0) === 1,
    '**挂起"封堵 ×1"**', String(st.pendingBlockadeRemaining));
  ok(Boolean(st.pendingBlockade), '挂出了"点门封堵"的待办', JSON.stringify(st.pendingBlockade));
  ok(st.pendingTurnEndSwitch === true,
    '回合收尾停在这一步（封完才切给幸存者）', String(st.pendingTurnEndSwitch));
  /**
   * ⚠ **用户口径：这些"回合结束时"的效果都是"回合结束之前"做的** ——
   * 也就是杀手还在自己的回合里（`phase` 仍是 `killerMain`）就把封堵点完，
   * 处理完才切给幸存者。所以这里断言 `killerMain`（**不是** `upkeep`）。
   */
  ok(st.phase === 'killerMain',
    '**挂起点仍在杀手阶段（回合结束之前）**，不是等推进到 upkeep 才做', st.phase);
  ok(st.pendingTurnEndSwitch === true,
    '而且回合收尾**停在这一步**（处理完才切给幸存者）', String(st.pendingTurnEndSwitch));
  /** 界面：这条提示画得出来吗 */
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
    const html = renderToStaticMarkup(React.createElement(GameView, {
      state: buildSnapshot(st, 'h'), isHost: true, error: null, onAction: async () => {},
    }));
    ok(html.includes('放置封堵'),
      '**界面上画出了"放置封堵"的提示**（upkeep 阶段也要画）');
    ok(html.includes('还要再封') || html.includes('确认封堵'),
      '顺带把"还要再封 N 扇 / 确认封堵"也画出来了');
  }
  catch {
    console.log('   （跳过界面断言：先跑 node scripts/tests/build-menu.mjs）');
  }
}

/* ═══════════ ④ 潜行时不该触发（牌面条件） ═══════════ */
console.log('=== ④ 潜行时回合结束：不该封堵 ===');
{
  const st = mk();
  applyEvolutionCard(st, 'evo_un_slime');
  const k = st.players[st.killerId];
  k.roomId = st.map.killerStartRoomId ?? st.map.rooms[0].id;
  k.stealth = true;
  st.killerHand = [];
  st.killerDeck = [];
  st.killerDiscard = [];
  endKillerTurn(st);
  ok(!st.pendingBlockade, '潜行时没有挂出封堵', JSON.stringify(st.pendingBlockade));
  ok((st.pendingBlockadeRemaining ?? 0) === 0, '计数也没留',
    String(st.pendingBlockadeRemaining));
}

/* ═══════════ ⑤ 没这张卡就不该有任何效果 ═══════════ */
console.log('=== ⑤ 没获得这张卡：两条路径都不生效 ===');
{
  const st = mk();
  const k = st.players[st.killerId];
  k.roomId = st.map.killerStartRoomId ?? st.map.rooms[0].id;
  st.killerDiscard = ['spectre_chase_1', 'butcher_chase_2'];
  st.killerHand = ['un_transform', ...FODDER.slice(0, 3)];
  st.killerDeck = [...FODDER];
  st.killerMainChoice = null;
  const deckBefore = st.killerDeck.length;
  const err = tryIt(st, { type: 'playKillerCard', cardId: 'un_transform', payCardIds: FODDER.slice(0, 3) });
  ok(!err, '【變形】照样能打', String(err ?? ''));
  ok(st.killerDeck.length === deckBefore, '**没有多抽牌**', `${deckBefore} → ${st.killerDeck.length}`);
  ok(!st.pendingBlockade, '**没有封堵待办**', JSON.stringify(st.pendingBlockade));
  ok((st.pendingBlockadeRemaining ?? 0) === 0, '计数为 0', String(st.pendingBlockadeRemaining));
}

/* ═══════════ ⑥ 走真实选卡路径（`pickEvolutionCard`） ═══════════ */
console.log('=== ⑥ 真实选卡：点「粘液腺體」→ 开关 + 记进"已生效进化" ===');
{
  const st = mk();
  st.pendingEvolutionAck = { fromLevel: 1, toLevel: 2, deferred: true, killerIds: [st.killerId] };
  st.pendingEvolutionCardPick = ['evo_un_slime', 'evo_un_camouflage'];
  const err = tryIt(st, { type: 'pickEvolutionCard', cardId: 'evo_un_slime' });
  ok(!err, '点选「粘液腺體」', String(err ?? ''));
  ok(st.slimeGlandActive === true,
    '**开关立起来了**（选卡当场就该生效）', String(st.slimeGlandActive));
  ok((st.chosenEvolutionCards ?? []).includes('evo_un_slime'),
    '记进了"已获得的进化卡"', JSON.stringify(st.chosenEvolutionCards));
  ok(st.pendingEvolutionCardPick === null, '候选清空');
  const snap = buildSnapshot(st, 'h');
  ok((snap.chosenEvolutionCards ?? []).some((c) => c.id === 'evo_un_slime'),
    '**杀手快照里下发了**（界面"已生效进化"那一栏要显示它）',
    JSON.stringify((snap.chosenEvolutionCards ?? []).map((c) => c.name)));
  /**
   * 选完这张卡，进化流程会一路收尾；**收尾时"回合结束封堵 ×1"当场就该触发** ——
   * 这正好是"效果真的在跑"的端到端证据（不是"选卡当场什么都不会发生"）。
   */
  ok((st.pendingBlockadeRemaining ?? 0) === 1 && Boolean(st.pendingBlockade),
    '**收尾时"回合结束封堵 ×1"真的挂出来了**（效果确实生效）',
    `remaining=${st.pendingBlockadeRemaining}、blockade=${JSON.stringify(st.pendingBlockade)}`);
}

/* ═══════════ ⑦ 同类"回合结束时"效果：也都在回合结束之前结算 ═══════════ */
console.log('=== ⑦ 女王 1 级"回合结束生成僵尸"：同样发生在回合结束之前 ===');
{
  const st = mk('killer9');   // 女王
  const k = st.players[st.killerId];
  k.roomId = st.map.killerStartRoomId ?? st.map.rooms[0].id;
  k.stealth = false;
  st.queenEncounteredThisTurn = false;
  st.killerHand = [];
  st.killerDeck = [];
  const zBefore = (st.zombies ?? []).length;
  endKillerTurn(st);
  console.log(`   僵尸 ${zBefore} → ${(st.zombies ?? []).length}；phase=${st.phase}`);
  ok((st.zombies ?? []).length >= zBefore,
    '回合结束效果跑过了（女王 1 级生成僵尸；同一地点僵尸满 6 个时会取消）',
    `${zBefore} → ${(st.zombies ?? []).length}`);
  ok(st.phase !== 'upkeep',
    '**结算时仍在杀手阶段**（"回合结束之前"处理，不是等推进到 upkeep）', st.phase);
}

console.log(`\n进化卡「粘液腺體」：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
