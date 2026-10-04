/**
 * **杀手的卡牌守恒**（用户报的手牌 bug）。
 *
 * 症状：「手牌中多了一张**扼殺**，弃牌堆也有一张扼殺，而扼殺只有一张」，
 *       同一份牌组里的「**狂亂枝條**」反而消失了。
 *
 * 根因（`engine.ts` 遭遇加攻那段，**所有杀手共用**）：
 * ```
 * const idx = state.killerHand.indexOf(action.cardId);   // 缓存下标
 * for (const pid of atkPay) { …splice(pi, 1)… }          // 先删支付牌 → 下标全部前移
 * state.killerHand.splice(idx, 1);                       // ✗ 用过期的 idx
 * state.killerDiscard.push(action.cardId);               // 但牌已经进弃牌堆 → 重复
 * ```
 * 于是打出的牌**留在手牌里、同时又进了弃牌堆**；`idx` 指偏时还会**误删别的牌**。
 *
 * 修法：删手牌一律**重新按 id 查下标**（`takeFromHand`）。
 *
 * 这份测试查的是**不变量**：同一张卡在 手牌/弃牌堆/摸牌堆/锁定区 里最多出现一次，
 * 而且打出的牌 + 费用牌都确实进了弃牌堆。
 *
 * 跑法：node scripts/tests/killer-card-conservation.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { cardHandCost } from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mkSolo(killerId = 'killer8', mapId = 'castle') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, { type: 'confirmTrapPlacement' });
  }
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  return st;
}

/** 把所有区域的卡牌按 id 统计 → 找出"同一张卡出现在多处"的 */
function conservation(st) {
  const zones = {
    hand: [...(st.killerHand ?? [])],
    discard: [...(st.killerDiscard ?? [])],
    deck: [...(st.killerDeck ?? [])],
    locked: [...(st.killerLocked ?? [])],
    justUnlocked: [...(st.justUnlockedCards ?? [])],
  };
  const at = {};
  for (const [zone, ids] of Object.entries(zones)) {
    for (const id of ids) {
      at[id] = at[id] ?? [];
      at[id].push(zone);
    }
  }
  const dup = Object.entries(at).filter(([, where]) => where.length > 1);
  const name = (id) => st.cardById[id]?.name ?? id;
  return { zones, dup, at, name };
}
const dupText = (c) => c.dup.map(([id, where]) => `${c.name(id)}（${where.join('/')}）`).join('、');

/** 造一个"杀手 vs 幸存者同格"的遭遇，并把指定牌塞进手牌 */
function setupEncounter(st, wantCardId) {
  const k = st.players[st.killerId];
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  k.roomId = 'B3';
  surv.roomId = 'B3';
  st.encounter = {
    roomId: 'B3',
    step: 'attack',
    targetId: surv.id,
    attackOptions: [],
    attackChoiceMade: false,
    attackCommitted: false,
    defenseOptions: { [surv.id]: [] },
    defenseItems: {},
    shieldUsed: {},
    whiskeyUsed: {},
    blockItems: false,
  };
  st.phase = 'encounter';
  /**
   * ⚠ 目标牌**优先从手牌里找**（它可能本来就在手上，比如雕像的「處決」）——
   * 只在摸牌堆里找会让测试"什么都没打出去"却假装通过（假绿）。
   */
  const inHand = st.killerHand.find(
    (id) => id === wantCardId || st.cardById[id]?.name === wantCardId,
  );
  let want = inHand ?? null;
  if (!want) {
    want = st.killerDeck.find((id) => id === wantCardId) ??
      st.killerDeck.find((id) => st.cardById[id]?.name === wantCardId) ??
      null;
    if (want) {
      st.killerHand = [...st.killerHand, want];
      st.killerDeck = st.killerDeck.filter((id) => id !== want);
    }
  }
  /**
   * 这个牌的费用是**卡面写的**（處決 1 张、扼殺 2 张…），别写死。
   * `needHand` = 费用 + 打出的那张自己。
   */
  const needHand = (want ? cardHandCost(st.cardById[want]) : 0) + 1;
  while (st.killerHand.length < needHand) {
    const next = st.killerDeck.shift();
    if (!next) break;
    st.killerHand.push(next);
  }
  const pay = st.killerHand.filter((id) => id !== want).slice(0, needHand - 1);
  return { cardId: want, pay, surv };
}

console.log('=== ① 遭遇里打出「扼殺」（费用 2）：不留残影、不误删 ===');
{
  const st = mkSolo('killer8');
  const { cardId, pay } = setupEncounter(st, 'st_choke');
  const handBefore = [...st.killerHand];
  console.log(`  开打前手牌：${handBefore.map((id) => st.cardById[id]?.name).join('、')}`);
  const err = tryIt(st, { type: 'playEncounterAttack', cardId, payCardIds: pay });
  ok(!err, '能打出', String(err ?? ''));
  const c = conservation(st);
  console.log(`  打出后：手牌=${JSON.stringify(st.killerHand)} 弃牌堆=` +
    `${st.killerDiscard.map((id) => c.name(id)).join('、')}`);
  ok(c.dup.length === 0, '**同一张卡不会同时出现在两处**', dupText(c));
  ok(st.killerHand.length === handBefore.length - 3,
    '**打出的牌 + 2 张费用牌都从手牌消失了**',
    `${handBefore.length} → ${st.killerHand.length}`);
  for (const id of [cardId, ...pay]) {
    ok(st.killerDiscard.includes(id), `**「${c.name(id)}」进了弃牌堆**`);
  }
}

console.log('=== ② 雕像「處決」那条分支同样要守恒 ===');
{
  const st = mkSolo('killer6');
  const { cardId, pay } = setupEncounter(st, 'statue_execute');
  const err = tryIt(st, { type: 'playEncounterAttack', cardId, payCardIds: pay });
  const c = conservation(st);
  console.log(`  處決：${err ?? 'OK'}；手牌=${JSON.stringify(st.killerHand)}`);
  ok(!err, '能打出', String(err ?? ''));
  ok(c.dup.length === 0, '**處決也不会留残影**', dupText(c));
  if (cardId) ok(st.killerDiscard.includes(cardId), '處決进了弃牌堆');
}

console.log('=== ③ 慢速牌（普通打牌）的守恒 ===');
{
  const st = mkSolo('killer8');
  /** ⚠ 慢速牌只能在**慢速阶段**打（`killerTurnStep === 'slow'`） */
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  const lush = st.killerDeck.find((id) => st.cardById[id]?.name === '茂盛');
  if (lush) {
    st.killerHand = [...st.killerHand, lush];
    st.killerDeck = st.killerDeck.filter((id) => id !== lush);
  }
  while (st.killerHand.length < 3) {
    const next = st.killerDeck.shift();
    if (!next) break;
    st.killerHand.push(next);
  }
  const pay = st.killerHand.filter((id) => id !== lush).slice(0, 2);
  ok(Boolean(lush), '（前提）摸牌堆里找到「茂盛」', String(lush));
  ok(pay.length === 2, '（前提）够付 2 张费用', JSON.stringify(pay));
  /** ⚠ 慢速牌走的是 `playKillerCard`（不是 `playCard`） */
  const err = tryIt(st, { type: 'playKillerCard', cardId: lush, payCardIds: pay });
  const c = conservation(st);
  console.log(`  打茂盛：${err ?? 'OK'}；手牌=${JSON.stringify(st.killerHand)}`);
  ok(!err, '茂盛真的打出去了', String(err ?? ''));
  ok(c.dup.length === 0, '**慢速牌也不重复**', dupText(c));
  ok(!st.killerHand.includes(lush) && st.killerDiscard.includes(lush),
    '**茂盛从手牌进了弃牌堆**');
  ok(pay.every((id) => st.killerDiscard.includes(id)), '两张费用牌也进了弃牌堆');
}

console.log('=== ④ 开出"狂亂枝條"（锁定牌入手）之后也不该打架 ===');
{
  const st = mkSolo('killer8');
  /** 模拟进化 3 级解锁：锁定区 → 手牌 */
  const locked = [...(st.killerLocked ?? [])];
  console.log(`  锁定区：${locked.map((id) => st.cardById[id]?.name).join('、') || '（空）'}`);
  ok(locked.length > 0, '（前提）扼杀者的锁定区里有牌（狂亂枝條）');
  st.killerHand = [...st.killerHand, ...locked];
  st.killerLocked = [];
  const c = conservation(st);
  ok(c.dup.length === 0, '**入手后手牌与锁定区不打架**', dupText(c));
  const rampage = Object.keys(c.at).find((id) => st.cardById[id]?.name === '狂亂枝條');
  ok(Boolean(rampage) && c.at[rampage].length === 1,
    '**「狂亂枝條」只在一处**', JSON.stringify(rampage ? c.at[rampage] : null));
}

console.log(`\n杀手卡牌守恒：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
