/**
 * **未命名【變形】【戰鬥適應】：从弃牌堆移除 N 张 = 由杀手自己挑**（用户要求）。
 *
 * 反例（修之前）：这两张牌的 `removeFromDiscardPermanent` 是**系统代选**
 * ——直接从弃牌堆顶 `splice` 掉，玩家连"移除了哪张"都不知道；
 * 用户报的「应该是自选弃牌，怎么没改过来」就是它。
 *
 * 现在两个入口都必须挂起 `pendingDiscardRemove` 等玩家点牌：
 *   ① 杀手回合里打出【變形】（特殊牌，费用 3）→ `playKillerCard`
 *   ② 遭遇中打出【戰鬥適應】（攻击牌，费用 2）→ `playEncounterAttack`
 *
 * 另外这里盯一个**同名多份**的坑：牌组里「爬行」有 3 张，弃牌堆里同一个 id
 * 会出现多次 —— 候选是**多重集**，选掉一份不能把同名的另一份也抹掉。
 *
 * 跑法：node scripts/tests/discard-remove-self-pick.mjs
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
/** 支付费用用的"炮灰"牌（永远不会被真打出去） */
const FODDER = ['butcher_chase_1', 'butcher_chase_2', 'spectre_chase_2', 'spectre_chase_1', 'butcher_lurk_1']
  .filter((id) => allCards[id]);

/** 弃牌堆里某个 id 还有几份 */
const count = (arr, id) => arr.filter((x) => x === id).length;

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/* ═══════════ ① 變形（特殊牌）：从弃牌堆自己挑 2 张永久移除 ═══════════ */
console.log('=== ① 變形：挂起"自己挑 2 张"，不再系统代选 ===');
{
  const st = mk();
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  st.killerUsedSlowThisTurn = false;
  /** 弃牌堆里先放**两张同名**的旧牌（爬行这类牌组里本来就有 3 份） */
  st.killerDiscard = ['spectre_chase_1', 'spectre_chase_1'];
  st.killerHand = ['un_transform', ...FODDER.slice(0, 3)];
  st.killerDeck = [...FODDER];
  const powerBefore = st.killerPower;
  const err = tryIt(st, {
    type: 'playKillerCard',
    cardId: 'un_transform',
    payCardIds: FODDER.slice(0, 3),
  });
  ok(!err, '變形 能打出', String(err ?? ''));
  ok(st.killerPower === powerBefore + 2, '**力量 +2**', `${powerBefore} → ${st.killerPower}`);
  const job = st.pendingDiscardRemove;
  ok(Boolean(job), '**挂起了 pendingDiscardRemove（等玩家自己挑）**', String(Boolean(job)));
  ok(job?.remaining === 2, '要挑 2 张', String(job?.remaining));
  ok(!(job?.options ?? []).includes('un_transform'), '**刚打出的那张牌不在候选里**（不能移除自己）',
    (job?.options ?? []).includes('un_transform') ? '竟然在里面' : '已排除');
  ok(count(job?.options ?? [], 'spectre_chase_1') === 2,
    '**同名两张都在候选里**（候选是多重集）', String(count(job?.options ?? [], 'spectre_chase_1')));
  ok(new Set((job?.optionsNamed ?? []).map((c) => c.uid)).size === (job?.optionsNamed ?? []).length,
    '**每一份候选都有唯一 uid**（界面 key 不重复）',
    (job?.optionsNamed ?? []).map((c) => c.uid).join(','));
  ok(st.killerRemovedPermanently.length === 0, '**选之前一张都没被移除**（系统不再代选）',
    String(st.killerRemovedPermanently.length));

  const killerSnap = buildSnapshot(st, 'h');
  ok(Boolean(killerSnap.pendingDiscardRemove), '杀手快照里下发了（界面能画出来）');
  ok(killerSnap.pendingDiscardRemove?.options.length === (job?.options.length ?? -1),
    '快照候选数量一致', String(killerSnap.pendingDiscardRemove?.options.length));
  ok(Boolean(killerSnap.pendingDiscardRemove?.options[0]?.uid), '快照里带着 uid（界面拿它认"哪一份"）');
  const survSnap = buildSnapshot(st, 's');
  ok(!survSnap.pendingDiscardRemove, '**幸存者快照里没有这个待选**（别让幸存者看到杀手弃牌）');

  const e1 = tryIt(st, { type: 'pickDiscardRemove', cardId: 'spectre_chase_1' });
  ok(!e1, '点第一张（同名两份里的第一份）', String(e1 ?? ''));
  ok(count(st.killerDiscard, 'spectre_chase_1') === 1, '**弃牌堆里只少了 1 份**（不是两份全没）',
    String(count(st.killerDiscard, 'spectre_chase_1')));
  ok(count(st.killerRemovedPermanently, 'spectre_chase_1') === 1, '永久移除表里记了 1 份');
  ok(st.pendingDiscardRemove?.remaining === 1, '还剩 1 张要挑', String(st.pendingDiscardRemove?.remaining));
  ok(count(st.pendingDiscardRemove?.options ?? [], 'spectre_chase_1') === 1,
    '**同名的另一份还在候选里**（以前会被一起抹掉 → 玩家选不了第二张）',
    String(count(st.pendingDiscardRemove?.options ?? [], 'spectre_chase_1')));

  const e2 = tryIt(st, { type: 'pickDiscardRemove', cardId: 'spectre_chase_1' });
  ok(!e2, '再点同名的那一份', String(e2 ?? ''));
  ok(st.pendingDiscardRemove === null, '挑够 2 张后收尾');
  ok(count(st.killerRemovedPermanently, 'spectre_chase_1') === 2, '永久移除表里 2 份',
    st.killerRemovedPermanently.join(','));
  ok(count(st.killerDiscard, 'spectre_chase_1') === 0, '弃牌堆里的 2 份都没了');
}

/* ═══════════ ② 戰鬥適應（攻击牌）：遭遇中挂起"自己挑 1 张" ═══════════ */
console.log('=== ② 戰鬥適應：攻击时机也要自己挑，且不挡住防御步骤 ===');
{
  const st = mk();
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  const k = st.players[st.killerId];
  k.roomId = surv.roomId;
  st.phase = 'encounter';
  /** ⚠ `defenses` 必须给（真实遭遇由 `maybeStartEncounter` 建，测试里手搭就得自己补） */
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
  const powerBefore = st.killerPower;
  const err = tryIt(st, {
    type: 'playEncounterAttack',
    cardId: 'un_adapt',
    payCardIds: FODDER.slice(0, 2),
  });
  ok(!err, '戰鬥適應 能打出', String(err ?? ''));
  ok(st.killerPower === powerBefore + 1, '**力量 +1**', `${powerBefore} → ${st.killerPower}`);
  ok(st.encounter?.step === 'defend', '**遭遇照常进防御步骤**（没被"待挑弃牌"卡住）',
    String(st.encounter?.step));
  const job = st.pendingDiscardRemove;
  ok(job?.remaining === 1, '挂起了"自己挑 1 张"', String(job?.remaining));
  ok((job?.excludeCardIds ?? []).includes('un_adapt'), '排除刚打出的那张', (job?.excludeCardIds ?? []).join(','));
  ok(!(job?.options ?? []).includes('un_adapt'), '候选里也没有它');
  const pick = job.options[0];
  const e = tryIt(st, { type: 'pickDiscardRemove', cardId: pick });
  ok(!e, '投防御骰之前就能点选（不挡流程）', String(e ?? ''));
  ok(st.killerRemovedPermanently.includes(pick), '移除的是我点的那张', pick);
  ok(st.pendingDiscardRemove === null, '挑完收尾');
}

/* ═══════════ ③ 支付的费用牌也算候选（它们已经进弃牌堆了） ═══════════ */
console.log('=== ③ 费用牌在效果执行前就进弃牌堆 → 可以作为候选 ===');
{
  const st = mk();
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  st.killerUsedSlowThisTurn = false;
  st.killerDiscard = [];
  st.killerHand = ['un_transform', ...FODDER.slice(0, 3)];
  st.killerDeck = [...FODDER];
  const pay = FODDER.slice(0, 3);
  const err = tryIt(st, { type: 'playKillerCard', cardId: 'un_transform', payCardIds: pay });
  ok(!err, '變形 照样能打出', String(err ?? ''));
  const opts = st.pendingDiscardRemove?.options ?? [];
  ok(opts.length === 3, '3 张费用牌就是全部候选（弃牌堆里原本是空的）', opts.join(','));
  ok(pay.every((id) => opts.includes(id)), '**费用牌可以被移除**（规则：效果执行时它们已在弃牌堆）');
  ok(!opts.includes('un_transform'), '打出这张牌本身仍然不能选');
  ok(st.killerRemovedPermanently.length === 0, '选之前永久移除表还是空的');
}

console.log(`\n變形 / 戰鬥適應 自选弃牌：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
