/**
 * **未命名 3 级「解锁二选一」：只有选中的那张加入手牌，另一张绝不加入**。
 *
 * 用户口径：「未命名3级只有解锁的锁定牌加入手牌，另一张不加入。」
 *
 * 反例（以前的实现）：`pickUnlockChoice` 只把选中的拿走，另一张**留在锁定区**；
 * 而 `settleEvolutionForCurrentKiller` 里有一句"二选一里只剩一张的组 → 直接入手"
 * （本意是给"候选本来就只有一张"的组兜底）—— 于是**另一张也被塞进手牌**了。
 *
 * 跑法：node scripts/tests/killer-unlock-choice-3level.mjs
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

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';    // 未命名
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
  /** 让两张锁定牌都"到 3 级解锁"，并把二选一挂出来（模拟真实升级走到这一步） */
  st.killerLocked = ['un_noise', 'un_acid'];
  st.killerHand = ['un_crawl'];
  st.pendingUnlockChoice = ['un_noise', 'un_acid'];
  st.pendingEvolutionAck = { fromLevel: 2, toLevel: 3, deferred: true, killerIds: [st.killerId] };
  return st;
}
const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/* ═══════════ ① 选【刺耳噪声】：只有它入手 ═══════════ */
console.log('=== ① 3 级二选一选【刺耳噪声】：另一张【酸液喷吐】不加入 ===');
{
  const st = mk();
  const err = tryIt(st, { type: 'pickUnlockChoice', cardId: 'un_noise' });
  ok(!err, '点选【刺耳噪声】', String(err ?? ''));
  ok(st.killerHand.includes('un_noise'), '**选中的那张进手牌**', st.killerHand.join(','));
  ok(!st.killerHand.includes('un_acid'),
    '**另一张没有进手牌**（用户口径）', st.killerHand.join(','));
  ok(!(st.killerLocked ?? []).includes('un_acid'),
    '另一张也不该留在"还会解锁"的锁定区里（它已作废）',
    JSON.stringify(st.killerLocked));

  /** 关键：整条进化**结算完之后**再检查一遍（以前是收尾时被"只剩一张直接入手"捡回去） */
  ok(!st.pendingUnlockChoice, '二选一收尾了');
  console.log(`   结算后手牌：${st.killerHand.join(',')}`);
  ok(!st.killerHand.includes('un_acid'),
    '**进化结算完之后，另一张还是不在手牌里**', st.killerHand.join(','));
  const snap = buildSnapshot(st, 'h');
  ok(!(snap.yourKillerHand ?? []).includes('un_acid'),
    '快照里的手牌也没有它', JSON.stringify(snap.yourKillerHand));
}

/* ═══════════ ② 选【酸液喷吐】：只有它入手 ═══════════ */
console.log('=== ② 反过来选【酸液喷吐】：另一张【刺耳噪声】不加入 ===');
{
  const st = mk();
  const err = tryIt(st, { type: 'pickUnlockChoice', cardId: 'un_acid' });
  ok(!err, '点选【酸液喷吐】', String(err ?? ''));
  ok(st.killerHand.includes('un_acid'), '选中的进手牌', st.killerHand.join(','));
  ok(!st.killerHand.includes('un_noise'),
    '**另一张没有进手牌**', st.killerHand.join(','));
  ok(!(st.killerLocked ?? []).includes('un_noise'),
    '另一张也不留在锁定区', JSON.stringify(st.killerLocked));
}

/* ═══════════ ③ 没得选的那种组照旧：只剩一张 → 直接入手 ═══════════ */
console.log('=== ③ 手牌里不会因为"作废"多出东西 ===');
{
  const st = mk();
  ok((st.killerLocked ?? []).length === 2, '前提：两张都在锁定区', JSON.stringify(st.killerLocked));
  const err = tryIt(st, { type: 'pickUnlockChoice', cardId: 'un_noise' });
  ok(!err, '选掉一张', String(err ?? ''));
  ok((st.killerLocked ?? []).length === 0,
    '**二选一的两张都不再留在锁定区**（选中的进手牌、另一张作废）',
    JSON.stringify(st.killerLocked));
  ok(st.killerHand.length === 2,
    '手牌 = 原来的【爬行】+ 选中的那张（**没有第三张**）', st.killerHand.join(','));
  ok((st.abandonedLockedCards ?? []).includes('un_acid'),
    '被放弃的那张记进了"作废"名单', JSON.stringify(st.abandonedLockedCards));
}

console.log(`\n未命名 3 级解锁二选一：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
