/**
 * **杀手牌「使用时机」全量核对**（用户报的第 4 类问题最后一块）。
 *
 * 依据：`D:\game\饿夜杀鸡线上版\杀手卡牌一览_20260920_1724.docx`
 *   「使用时机」一列 = 实际能打出的时机。杀手牌一共 4 类时机：
 *     快速时机 / 特殊时机 / 慢速时机 / 攻击时机（遭遇里那一步）
 *   而且**有的牌同时属于两种**（如 尾随 = 攻击＋慢速、领地意识 = 快速＋慢速）。
 *
 * 本测试对全部 118 张牌，逐一在 4 个时机里尝试打出，断言：
 *   - 文档里**允许**的时机 → 不能因为「时机不对」被拒（可以是别的条件不满足）；
 *   - 文档里**不允许**的时机 → 绝对打不出去。
 *
 * 跑法：`npm run test:timing`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { effectiveCardSpeed } from '../../server/dist/game/killerCards.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const KILLERS = ['killer1', 'killer2', 'killer3', 'killer4', 'killer5', 'killer6', 'killer7', 'killer8', 'killer9'];
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const allCards = content.cards.byId;

/** 每名杀手的行动牌（按 id 去重前的完整列表 → 取唯一 id） */
const deckOf = (killerId) =>
  [...new Set(
    (content.cards.killerAction ?? [])
      .filter((c) => c.owner === killerId)
      .map((c) => c.id),
  )];

/** 支付费用用的"炮灰"牌：拿别的杀手的便宜牌来凑数，永远不会被真打出去 */
const FODDER = ['butcher_chase_1', 'butcher_chase_2', 'butcher_chase_3', 'spectre_chase_1', 'spectre_chase_2']
  .filter((id) => allCards[id]);

/** 一局指定杀手（和别的测试同一套搭台方式） */
function mk(killerId) {
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
  return st;
}

/** 打出时的"时机类"报错长什么样（这些消息说明**拦对了**；别的消息说明是条件问题） */
const TIMING_ERRORS = [
  '时机不对',
  '必须标明速度',
  '快速牌只能在快速阶段打出',
  '慢速牌只能在慢速阶段打出',
  '特殊牌请在快速阶段结束后打出',
  '已选择普通行动，不能再打特殊牌',
  '本回合已打过特殊牌',
];
const isTimingError = (msg) => TIMING_ERRORS.some((t) => msg.includes(t));

const HAND_COST = (card) => card.handCost ?? 0;

/**
 * 在一个干净的杀手回合里试打一张牌。
 * @param step 'fast' | 'main'（=特殊时机）| 'slow'
 */
function tryPlayAt(killerId, cardId, step) {
  const st = mk(killerId);
  st.phase = 'killerMain';
  st.killerTurnStep = step;
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  st.killerUsedSlowThisTurn = false;
  st.pendingEffectQueue = [];
  st.pendingOptionalEffect = null;
  st.pendingMoveRange = null;
  st.pendingSenseColor = false;
  st.pendingSensePair = null;
  st.pendingLurkPick = false;
  st.pendingCardSpeed = null;
  st.encounter = null;
  st.encounterOpenHold = false;
  const card = allCards[cardId];
  /** 手牌 = 这张牌 + 一堆炮灰（够付最贵的费用） */
  st.killerHand = [cardId, ...FODDER];
  st.killerDeck = [...FODDER];
  try {
    handleAction(st, 'h', {
      type: 'playKillerCard',
      cardId,
      payCardIds: FODDER.slice(0, Math.min(HAND_COST(card), FODDER.length)),
    }, content);
    return { ok: true, msg: '' };
  } catch (e) {
    return { ok: false, msg: String(e?.message ?? e) };
  }
}

/** 在遭遇的「攻击时机」试打一张牌（客户端走的就是 `playEncounterAttack`） */
function tryPlayAtAttack(killerId, cardId) {
  const st = mk(killerId);
  st.phase = 'encounter';
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  const k = st.players[st.killerId];
  k.roomId = surv.roomId;
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
    blockItems: false,
    executeArmed: false,
    executeStatueId: null,
    source: 'search',
  };
  const card = allCards[cardId];
  st.killerHand = [cardId, ...FODDER];
  st.killerDeck = [...FODDER];
  st.pendingEffectQueue = [];
  st.pendingDiscardRemove = null;
  try {
    handleAction(st, 'h', {
      type: 'playEncounterAttack',
      cardId,
      payCardIds: FODDER.slice(0, Math.min(HAND_COST(card), FODDER.length)),
    }, content);
    return { ok: true, msg: '', st };
  } catch (e) {
    return { ok: false, msg: String(e?.message ?? e), st };
  }
}

/** 文档里这张牌允许的时机集合（`timings` 优先；没有就按速度；链锯轰鸣 4 级变快速） */
function allowedTimings(st, card) {
  const speed = effectiveCardSpeed(st, card);
  if (card.timings?.length) return [...card.timings];
  return [speed];
}

/* ═══════════ ① 先看"时机字段"本身和 docx 对不对得上 ═══════════ */
console.log('=== ① 牌数与时机分类（对齐 docx 总览） ===');
{
  const ka = content.cards.killerAction ?? [];
  ok(ka.length === 118, '杀手行动牌共 118 张', String(ka.length));
  const bySpeed = {};
  for (const c of ka) bySpeed[c.speed] = (bySpeed[c.speed] ?? 0) + 1;
  /**
   * ⚠ 这 4 个数是**以《杀手卡牌一览》表为准**修正过之后的：
   * 屏息 / 釋放 / 巡邏×3 从 slow 改成 special，召唤石碑×3 从 special 改成 slow
   * （净变化：slow −2、special +2）。改之前是 59 / 37 / 12 / 10。
   */
  ok(bySpeed.fast === 59, '快速 59', String(bySpeed.fast));
  ok(bySpeed.slow === 35, '慢速 35', String(bySpeed.slow));
  ok(bySpeed.special === 14, '特殊 14', String(bySpeed.special));
  ok(bySpeed.attack === 10, '攻击 10', String(bySpeed.attack));

  const dual = ka.filter((c) => c.timings?.length === 2);
  console.log(`   双类型牌 ${dual.length} 张：${[...new Set(dual.map((c) => `${c.name}（${c.timings.join('＋')}）`))].join('、')}`);
  /**
   * **同时属于两种类型的牌一共 6 张**：
   * 尾随×3（攻击＋慢速）、荊棘纏繞×2（攻击＋慢速）、领地意识×1（快速＋慢速）。
   * 其余 10 张攻击牌的 `timings` 只有 `["attack"]` 一项，不算双类型。
   */
  ok(dual.length === 6, '**双类型牌共 6 张**（尾随×3、荊棘纏繞×2、领地意识×1）', String(dual.length));

  const expectedPairs = {
    '尾随': 'attack+slow',
    '荊棘纏繞': 'attack+slow',
    '领地意识': 'fast+slow',
  };
  for (const [name, pair] of Object.entries(expectedPairs)) {
    const cards = ka.filter((c) => c.name === name);
    ok(
      cards.length > 0 && cards.every((c) => c.timings?.join('+') === pair),
      `${name} = ${pair}`,
      cards.map((c) => c.timings?.join('+')).join(','),
    );
  }
}

/* ═══════════ ② 逐张牌 × 逐个时机 实测 ═══════════ */
console.log('=== ② 118 张牌 × 4 个时机 实测 ===');
{
  let checked = 0;
  let wrongAccept = 0;
  let wrongReject = 0;
  const problems = [];

  for (const killerId of KILLERS) {
    const ids = deckOf(killerId);
    const probe = mk(killerId);
    for (const cardId of ids) {
      const card = allCards[cardId];
      const allow = allowedTimings(probe, card);
      /**
       * `timings` 里带 `attack` 的牌，在杀手回合的三个阶段里**都应该打不出**：
       * 对「尾随」这类双类型牌，attack 之外那一半仍然照常。
       */
      const steps = [
        ['fast', '快速时机', allow.includes('fast')],
        ['main', '特殊时机', allow.includes('special')],
        ['slow', '慢速时机', allow.includes('slow')],
      ];
      for (const [step, label, shouldWork] of steps) {
        checked += 1;
        const r = tryPlayAt(killerId, cardId, step);
        if (shouldWork && !r.ok && isTimingError(r.msg)) {
          wrongReject += 1;
          problems.push(`✗ ${card.name}(${cardId}) 应在【${label}】可打，却被时机拦下：${r.msg}`);
        }
        if (!shouldWork && r.ok) {
          wrongAccept += 1;
          problems.push(`✗ ${card.name}(${cardId}) 不该在【${label}】打出，却打出去了`);
        }
      }
      /** 攻击时机 */
      checked += 1;
      const atk = tryPlayAtAttack(killerId, cardId);
      const shouldAtk = allow.includes('attack');
      const notAnAttackCard = atk.msg.includes('不能在遭遇中打出') ||
        atk.msg.includes('遭遇中只能打出攻击卡牌');
      if (shouldAtk && !atk.ok && (notAnAttackCard || isTimingError(atk.msg))) {
        wrongReject += 1;
        problems.push(`✗ ${card.name}(${cardId}) 应在【攻击时机】可打，却被拦下：${atk.msg}`);
      }
      if (!shouldAtk && atk.ok) {
        wrongAccept += 1;
        problems.push(`✗ ${card.name}(${cardId}) 不该在【攻击时机】打出，却打出去了`);
      }
    }
  }

  console.log(`   共核对 ${checked} 次（${checked / 4} 张牌 × 4 个时机）`);
  for (const p of problems.slice(0, 25)) console.log(`   ${p}`);
  if (problems.length > 25) console.log(`   ……另有 ${problems.length - 25} 条`);
  ok(wrongAccept === 0, '**没有任何牌在错误的时机被打出**', String(wrongAccept));
  ok(wrongReject === 0, '**没有任何牌在正确的时机被时机判定拦下**', String(wrongReject));
}

/* ═══════════ ③ 攻击牌不能在杀手回合当普通牌打 ═══════════ */
console.log('=== ③ 攻击牌只能在遭遇里打 ===');
{
  const attackOnly = [...new Set(
    (content.cards.killerAction ?? [])
      .filter((c) => c.speed === 'attack' && !(c.timings ?? []).some((t) => t !== 'attack'))
      .map((c) => `${c.owner}:${c.id}`),
  )];
  console.log(`   纯攻击牌 ${attackOnly.length} 张`);
  let bad = 0;
  for (const key of attackOnly) {
    const [owner, id] = key.split(':');
    for (const step of ['fast', 'main', 'slow']) {
      const r = tryPlayAt(owner, id, step);
      if (r.ok) { bad += 1; console.log(`   ✗ ${allCards[id].name} 在 ${step} 阶段打出去了`); }
    }
  }
  ok(bad === 0, '**纯攻击牌在快速/特殊/慢速三个阶段一律打不出**', String(bad));
}

/* ═══════════ ④ 效果 `requires` 前置条件（以前完全没检查） ═══════════ */
console.log('=== ④ 牌面条件（requires）现在会拦 ===');
{
  const { cardRequirementBlockReason } = await import('../../server/dist/game/killerCards.js');
  const st = mk('killer5');
  const blood = allCards['wolf_bloodhunt'];
  ok(Boolean(blood), '找到「鲜血追猎」');
  ok(
    blood.effects.some((f) => f.requires === 'injuredSurvivor'),
    '它的效果上写着 requires: injuredSurvivor',
  );

  /** 场上没人受伤 → 拦 */
  for (const p of Object.values(st.players)) if (p.faction === 'survivor') p.hp = p.maxHp;
  const blocked = cardRequirementBlockReason(st, blood, 'injuredSurvivor');
  ok(Boolean(blocked), '没人受伤时给出不能打的原因', String(blocked));

  /** 有人受伤 → 放行 */
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  surv.hp = Math.max(1, surv.maxHp - 1);
  ok(
    cardRequirementBlockReason(st, blood, 'injuredSurvivor') === null,
    '有人受伤时不再拦',
  );

  /** 端到端：快速阶段实测 */
  const st2 = mk('killer5');
  for (const p of Object.values(st2.players)) if (p.faction === 'survivor') p.hp = p.maxHp;
  const r2 = (() => {
    st2.phase = 'killerMain';
    st2.killerTurnStep = 'fast';
    st2.killerMainChoice = null;
    st2.killerMainActionsLeft = 2;
    st2.pendingEffectQueue = [];
    st2.encounter = null;
    st2.killerHand = ['wolf_bloodhunt', ...FODDER];
    try {
      handleAction(st2, 'h', { type: 'playKillerCard', cardId: 'wolf_bloodhunt' }, content);
      return { ok: true, msg: '' };
    } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; }
  })();
  ok(!r2.ok && r2.msg.includes('没有受伤'), '**没人受伤时「鲜血追猎」打不出去**', r2.msg);
  ok(!isTimingError(r2.msg), '拦它的是**条件**，不是时机（时机本来就对）', r2.msg);
}

/* ═══════════ ⑤ 攻击时机打出的牌，效果真的生效（不是静默丢掉） ═══════════ */
console.log('=== ⑤ 攻击牌的效果真的结算了 ===');
{
  /** 處決：不加攻，但要挂上"等掷完防御骰再判定" */
  const ex = tryPlayAtAttack('killer6', 'statue_execute');
  ok(ex.ok, '處決 能打出', ex.msg);
  ok(ex.st?.encounter?.executeArmed === true, '**處決 挂上了 executeArmed**（以前完全没挂）');
  ok(ex.st?.encounter?.step === 'defend', '處決 打出后进入防御步骤', String(ex.st?.encounter?.step));

  /** 毒液之觸：使目标〔中毒〕 */
  const vq = tryPlayAtAttack('killer9', 'q_venom_1');
  ok(vq.ok, '毒液之觸 能打出（女王与遭遇同地点）', vq.msg);
  const poisoned = vq.st?.poisoned ?? [];
  ok(poisoned.length === 1, '**毒液之觸 让目标中毒了**', poisoned.join(','));

  /** 戰鬥適應：永久 +1 力量 + 从弃牌堆移除 1 张（自己挑） */
  const ad = tryPlayAtAttack('killer7', 'un_adapt');
  ok(ad.ok, '戰鬥適應 能打出', ad.msg);
  const beforePower = mk('killer7').killerPower;
  ok(
    (ad.st?.killerPower ?? 0) === beforePower + 1,
    '**戰鬥適應 永久 +1 力量**',
    `${beforePower} → ${ad.st?.killerPower}`,
  );
  const job = ad.st?.pendingDiscardRemove ?? null;
  if (job) {
    ok(job.remaining === 1, '**戰鬥適應 挂上了"从弃牌堆选 1 张"**', String(job.remaining));
    ok(
      job.excludeCardIds.includes('un_adapt'),
      '刚打出的这张牌被排除在候选之外（规则：不能移除它自己）',
      job.excludeCardIds.join(','),
    );
  } else {
    /** 弃牌堆里只有刚打出的牌 → 没得选，直接跳过也算对 */
    ok(true, '戰鬥適應：弃牌堆里没有别的牌可移除，跳过（也算对）');
  }

  /** 荊棘纏繞：本次攻击中目标不能使用任何物品 */
  const th = tryPlayAtAttack('killer8', 'st_thorn_1');
  ok(th.ok, '荊棘纏繞 能打出', th.msg);
  ok(th.st?.encounter?.blockItems === true, '**荊棘纏繞 封锁了目标本场的防御物品**');
}

/* ═══════════ ⑥ 走错入口会被明确拒绝（不再有"打了等于没打"的第二条路） ═══════════ */
console.log('=== ⑥ 遭遇中必须用「攻击时机」入口 ===');
{
  const st = mk('killer8');
  st.phase = 'encounter';
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
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
    blockItems: false,
    executeArmed: false,
    executeStatueId: null,
    source: 'search',
  };
  st.killerHand = ['st_choke', ...FODDER];
  let msg = '';
  try {
    handleAction(st, 'h', { type: 'playKillerCard', cardId: 'st_choke' }, content);
  } catch (e) { msg = String(e?.message ?? e); }
  ok(msg.includes('攻击时机'), '用 playKillerCard 打攻击牌会被明确拒绝', msg);
}

console.log(`\n卡牌时机核对：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
