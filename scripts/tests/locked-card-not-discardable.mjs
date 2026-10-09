/**
 * **锁定牌刚入手、手牌又超上限时，不能把这张新入手的锁定牌弃掉**（用户口径：
 * 「未命名的锁定牌加入手牌时手牌满应该不能弃置锁定牌。**所有杀手都应该这样**」）。
 *
 * 机制是 `justUnlockedCards`：
 *  - 服务端在三个"要求弃牌"的入口都记下**这一批刚入手的牌**
 *    （`evolution.ts` 的"锁定牌按等级入手" / "雕像 4 级取回圍困"、
 *     `engine.ts` 的"二选一解锁"）；
 *  - `discardKillerCard` 拒收这些牌；客户端那颗弃牌面板也不列它们。
 *
 * ⚠ 【变体1】特性 03「狡猾诡计」**不是例外**（用户口径：
 * 「特性三只影响抽牌，不影响这种锁定牌加入手牌和雕像 4 级」）——
 * 卡面那句「可以弃掉任意手牌，而不只是**新抽到的卡牌**」说的是抽牌那一侧；
 * 锁定牌入手 / 雕像 4 级取回「圍困」都不是抽到的牌，带这张特性照样不能弃。
 *
 * 跑法：node scripts/tests/locked-card-not-discardable.mjs
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { runUpgrade } from '../../server/dist/game/evolution.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const nameOf = (st, id) => st.cardById[id]?.name ?? id;

function mkSolo(killerId) {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

console.log('=== ① 未命名：二选一解锁的锁定牌入手后不能弃 ===');
{
  const st = mkSolo('killer7');
  /** 塞满 5 张手牌（= 上限），这样新入手的锁定牌必然触发"请弃牌" */
  st.killerHand = ['un_infrared_1', 'un_crawl_1', 'un_passage_1', 'un_passage_2', 'un_infrared_2'];
  runUpgrade(st);
  const evoPool = st.pendingEvolutionCardPick ?? [];
  if (evoPool.length) tryIt(st, { type: 'pickEvolutionCard', cardId: evoPool[0] });
  tryIt(st, { type: 'ackEvolution' });          // 2 级
  runUpgrade(st);
  tryIt(st, { type: 'ackEvolution' });          // 3 级 → 挂出二选一
  const pool = st.pendingUnlockChoice ?? [];
  ok(pool.length === 2, '（前提）挂出了"二选一"锁定牌', JSON.stringify(pool.map((id) => nameOf(st, id))));
  const picked = pool[0];
  if (picked) {
    const e0 = tryIt(st, { type: 'pickUnlockChoice', cardId: picked });
    ok(!e0, '（前提）选得了那张锁定牌', e0 ?? '');
    console.log(`  入手「${nameOf(st, picked)}」；手牌 ${st.killerHand.length} 张，` +
      `要弃 ${st.pendingKillerDiscards} 张；` +
      `刚入手=${JSON.stringify((st.justUnlockedCards ?? []).map((id) => nameOf(st, id)))}`);
    ok(st.pendingKillerDiscards > 0, '（前提）手牌超上限、要求弃牌', String(st.pendingKillerDiscards));
    ok((st.justUnlockedCards ?? []).includes(picked), '**服务端记下了"这一批刚入手的牌"**',
      JSON.stringify(st.justUnlockedCards));

    /** 核心：想弃刚入手的那张锁定牌 → 必须被拒 */
    const e1 = tryIt(st, { type: 'discardKillerCard', cardId: picked });
    console.log(`  试着弃「${nameOf(st, picked)}」→ ${e1 ?? '（居然通过了）'}`);
    ok(e1 != null && /刚由进化入手/.test(e1), '**不能弃置刚入手的锁定牌**', String(e1));
    ok(st.pendingKillerDiscards === 1, '被拒之后"还要弃几张"没被扣掉', String(st.pendingKillerDiscards));
    ok(st.killerHand.includes(picked), '那张锁定牌还在手里');

    /** 对照：弃一张旧牌就正常 */
    const old = st.killerHand.find((c) => !(st.justUnlockedCards ?? []).includes(c));
    const e2 = tryIt(st, { type: 'discardKillerCard', cardId: old });
    ok(!e2, '**弃旧牌照常可以**', e2 ?? '');
    ok(st.pendingKillerDiscards === 0, '弃够了', String(st.pendingKillerDiscards));
    ok((st.justUnlockedCards ?? []).length === 0, '弃完之后那个标记清掉了');

    /** 快照：客户端拿它把新入手的牌从弃牌按钮里滤掉 */
    const snap = buildSnapshot(st, HOST);
    ok(Array.isArray(snap.justUnlockedCards), '快照里下发了 `justUnlockedCards`（界面才能滤）',
      JSON.stringify(snap.justUnlockedCards));
  }
}

console.log('\n=== ② 别的杀手（扼杀者）：按等级入手的锁定牌同样不能弃 ===');
{
  const st = mkSolo('killer8');
  st.killerHand = ['st_bloom_2', 'st_branch_4', 'st_choke', 'st_rampage', 'st_thorn_1'];
  const lockedBefore = [...(st.killerLocked ?? [])];
  console.log(`  开局锁定区：${lockedBefore.map((id) => nameOf(st, id)).join('、')}`);
  /** 一路升到锁定牌入手那一级 */
  let guard = 0;
  while (guard < 6) {
    guard += 1;
    const before = st.killerLevel;
    runUpgrade(st);
    tryIt(st, { type: 'ackEvolution' });
    for (const c of st.pendingUnlockChoice ?? []) { tryIt(st, { type: 'pickUnlockChoice', cardId: c }); break; }
    for (const c of [...(st.pendingEvolutionCardPick ?? [])]) { tryIt(st, { type: 'pickEvolutionCard', cardId: c.id ?? c }); break; }
    if (st.pendingKillerDiscards > 0) break;
    if (st.killerLevel === before && guard > 1) break;
  }
  const unlockedIds = st.justUnlockedCards ?? [];
  console.log(`  升到 ${st.killerLevel} 级；手牌 ${st.killerHand.length} 张，要弃 ${st.pendingKillerDiscards} 张；` +
    `刚入手=${JSON.stringify(unlockedIds.map((id) => nameOf(st, id)))}`);
  ok(unlockedIds.length > 0, '**别的杀手也会记"刚入手的锁定牌"**',
    JSON.stringify(unlockedIds.map((id) => nameOf(st, id))));
  if (unlockedIds.length) {
    const e = tryIt(st, { type: 'discardKillerCard', cardId: unlockedIds[0] });
    console.log(`  试着弃「${nameOf(st, unlockedIds[0])}」→ ${e ?? '（居然通过了）'}`);
    ok(e != null && /刚由进化入手/.test(e), '**同样不能弃**', String(e));
  }
}

console.log('\n=== ③ 【变体1】特性 03「狡猾诡计」**也不**例外（只管抽牌）===');
{
  /**
   * 用户口径：「**特性三只影响抽牌，不影响这种锁定牌加入手牌和雕像 4 级**」。
   *
   * 特性卡面写的是「如果你超出了手牌上限，你可以弃掉任意手牌，而是不只弃掉
   * **新抽到的卡牌**」—— 那是抽牌那一侧；锁定牌入手 / 雕像 4 级取回「圍困」
   * 都不是"抽到的牌"，所以带这张特性也照样不能弃它们。
   */
  const st = mkSolo('killer7');
  st.variant1 = true;
  st.traits = { [st.killerId]: ['trait_k03'] };
  st.killerHand = ['un_infrared_1', 'un_crawl_1', 'un_passage_1', 'un_passage_2', 'un_infrared_2'];
  /** 直接摆成"刚入手一张锁定牌 + 超上限" */
  const justPicked = 'un_noise';
  st.killerHand = [...st.killerHand, justPicked];
  st.justUnlockedCards = [justPicked];
  st.pendingKillerDiscards = 1;
  st.pendingUnlockDiscard = true;
  const e = tryIt(st, { type: 'discardKillerCard', cardId: justPicked });
  console.log(`  带「狡猾诡计」时弃刚入手的「${nameOf(st, justPicked)}」→ ${e ?? '（居然通过了）'}`);
  ok(e != null && /刚由进化入手/.test(e), '**带这张特性也不能弃刚入手的锁定牌**', String(e));
  ok(st.pendingKillerDiscards === 1, '被拒之后"还要弃几张"没被扣掉',
    String(st.pendingKillerDiscards));
  /** 弃旧牌仍然可以（不然就卡死了） */
  const eOld = tryIt(st, { type: 'discardKillerCard', cardId: 'un_infrared_1' });
  ok(!eOld, '弃旧牌照常可以', eOld ?? '');
}

console.log('\n=== ④ 界面：弃牌面板不列"刚入手的牌" ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(/\.filter\(\(cid\) => !\(state\.justUnlockedCards \?\? \[\]\)\.includes\(cid\)\)/.test(views),
    '**弃牌按钮把 `justUnlockedCards` 滤掉了**（不是只靠服务端拒）');
  ok(/刚由进化入手的牌本次不能弃/.test(views), '面板上写清了这条提示');
}

console.log(`\n锁定牌入手后不能弃：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
