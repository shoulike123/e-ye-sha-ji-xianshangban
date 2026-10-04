/**
 * **杀手打完"特殊行动牌"、且没有引发遭遇时，要自动转到慢速阶段**。
 *
 * 用户报的现象：「杀手做完特殊行动，无遭遇情况下结算完后有自动转到慢速阶段吗，
 * 比如未命名的【变形】做完后就没有」。
 *
 * 根因：【變形】的效果里有一条"永久从弃牌堆移除 2 张"，它会**挂起等玩家选牌**
 * （`pendingDiscardRemove`）；打牌主流程看到"还有待选"就在出口处 `break` 了，
 * 而 `pickDiscardRemove` 选完之后只继续了效果队列，**没有走"打牌流程的出口"** ——
 * 于是 `killerTurnStep` 一直停在 `main`，永远进不了慢速阶段。
 * 【恐詭管道】（`confirmPassagePick`）是同一种漏法。
 *
 * 跑法：node scripts/tests/killer-special-to-slow.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

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

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';   // 未命名
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

/** 杀手回合：刚进"二选一"，还没选（`killerMainChoice = null`） */
function setKillerSpecialTurn(st) {
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  st.killerUsedSlowThisTurn = false;
  st.pendingEffectQueue = [];
  st.encounter = null;
  st.lastSearchFound = false;
}

const tryIt = (st, action, socketId = 'h') => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/* ═══════════ ① 變形（特殊牌，"要从弃牌堆自己选 2 张"） ═══════════ */
console.log('=== ① 未命名【變形】：选完那 2 张之后要进慢速阶段 ===');
{
  const st = mk();
  setKillerSpecialTurn(st);
  st.killerDiscard = ['spectre_chase_1', 'butcher_chase_2'];
  st.killerHand = ['un_transform', ...FODDER.slice(0, 3)];
  st.killerDeck = [...FODDER];

  const err = tryIt(st, { type: 'playKillerCard', cardId: 'un_transform', payCardIds: FODDER.slice(0, 3) });
  ok(!err, '打出【變形】', String(err ?? ''));
  ok(st.killerTurnStep === 'main', '这时还停在 main（在等"选 2 张牌"）', st.killerTurnStep);
  ok(Boolean(st.pendingDiscardRemove), '挂起了"从弃牌堆选 2 张"',
    JSON.stringify(st.pendingDiscardRemove?.remaining));

  /** 选够 2 张 */
  let guard = 0;
  while (st.pendingDiscardRemove && guard < 6) {
    guard += 1;
    const pick = st.pendingDiscardRemove.options[0];
    const e = tryIt(st, { type: 'pickDiscardRemove', cardId: pick });
    if (e) { ok(false, '选牌出错', e); break; }
  }
  ok(!st.pendingDiscardRemove, '两张都选完了');
  console.log(`   选完之后：killerTurnStep=${st.killerTurnStep}、killerMainChoice=${st.killerMainChoice}、` +
    `pendingCardSpeed=${JSON.stringify(st.pendingCardSpeed)}、deferredPlayedCard=${JSON.stringify(st.deferredPlayedCard)}`);
  ok(st.killerTurnStep === 'slow',
    '**自动转到慢速阶段**（用户要的行为）', st.killerTurnStep);
  ok(st.pendingCardSpeed === null,
    '打牌流程真的收尾了（速度标记清掉）', JSON.stringify(st.pendingCardSpeed));
  ok(st.deferredPlayedCard === null,
    '打出的那张牌也落定了', JSON.stringify(st.deferredPlayedCard));
  ok(st.killerDiscard.includes('un_transform'),
    '【變形】自己在弃牌堆里（结算结束时它就该在）',
    st.killerDiscard.slice(-3).join(','));
  /** 慢速阶段能正常结束回合 */
  const endErr = tryIt(st, { type: 'endTurn' });
  ok(!endErr, '慢速阶段可以结束回合', String(endErr ?? ''));
}

/* ═══════════ ② 战斗适应（攻击时机打出的那张，不该被"顺带推进阶段"弄坏） ═══════════ */
console.log('=== ② 遭遇中打出【戰鬥適應】：选完牌不许把杀手回合推进 ===');
{
  const st = mk();
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  const k = st.players[st.killerId];
  k.roomId = surv.roomId;
  st.phase = 'encounter';
  st.encounter = {
    roomId: surv.roomId,
    targetId: surv.id,
    targets: [surv.id],
    step: 'attack',
    attackBoost: false,
    attackChoiceMade: false,
    attackCardId: null,
    fleeQueue: [surv.id],
    fled: [],
    defenses: {},
    blockItems: false,
    executeArmed: false,
    executeStatueId: null,
    source: 'search',
  };
  st.killerDiscard = ['spectre_chase_1', 'butcher_chase_2'];
  st.killerHand = ['un_adapt', ...FODDER.slice(0, 2)];
  st.killerDeck = [...FODDER];
  const err = tryIt(st, { type: 'playEncounterAttack', cardId: 'un_adapt', payCardIds: FODDER.slice(0, 2) });
  ok(!err, '打出【戰鬥適應】', String(err ?? ''));
  ok(st.encounter?.step === 'defend', '照常进防御步骤', String(st.encounter?.step));
  ok(Boolean(st.pendingDiscardRemove), '挂起了"从弃牌堆选 1 张"');
  const pick = st.pendingDiscardRemove.options[0];
  const e2 = tryIt(st, { type: 'pickDiscardRemove', cardId: pick });
  ok(!e2, '选掉那一张', String(e2 ?? ''));
  ok(st.phase === 'encounter',
    '**还在遭遇里**（选完牌不该把流程推到别处）', st.phase);
  ok(st.encounter?.step === 'defend', '防御步骤没被打断', String(st.encounter?.step));
  ok(st.killerTurnStep !== 'slow' || st.phase === 'encounter',
    '没有误推进杀手阶段', `step=${st.killerTurnStep} phase=${st.phase}`);
  /** 幸存者照样能防御（用他**自己**的 socket） */
  const defErr = tryIt(st, { type: 'playEncounterDefense', useShield: false }, 's');
  ok(!defErr, '幸存者还能正常防御', String(defErr ?? ''));
}

console.log(`\n特殊行动 → 慢速阶段：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
