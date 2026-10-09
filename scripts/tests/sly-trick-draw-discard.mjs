/**
 * **【变体1】特性 03「狡猾诡计」——只影响抽牌**（用户口径：
 * 「特性三只影响抽牌，不影响这种锁定牌加入手牌和雕像 4 级」）。
 *
 * 卡面：「游戏开始时，抽取额外一张卡牌。在游戏期间，**如果你超出了手牌上限，
 * 你可以弃掉任意手牌，而不是只能弃掉新抽到的卡牌**。」
 *
 * 所以带这张特性的杀手，摸牌摸到超过上限时：那些牌**先入手**（手牌临时超上限），
 * 然后挂出「请自选弃置 N 张」——他可以丢旧牌、把新摸到的留下。
 * 不带这张特性就照基本规则：超上限的那几张**直接正面朝上进弃牌堆**。
 *
 * ⚠ 这个选择**在谁的回合都照给**（用户口径：「让杀手选择，但是不能出 bug」）；
 * "别把幸存者那一轮打断"由服务端 `maybeCloseKillerUpkeep` 独立判断。
 *
 * 跑法：node scripts/tests/sly-trick-draw-discard.mjs
 * （④ 需要先 `node scripts/tests/build-menu.mjs`）
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, maybeCloseKillerUpkeep, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { drawKillerCards, applyDefenseItem } from '../../server/dist/game/effects.js';

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

/** 单人热座 + 屠夫（killer1）；`sly` = 带不带特性 03 */
function mk(sly) {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (sly) {
    st.variant1 = true;
    st.traits = { [st.killerId]: ['trait_k03'] };
  }
  /** 手牌 4/5；摸牌堆给足 3 张真牌 */
  const ids = Object.keys(st.cardById);
  const pool = ids.filter((id) => !/^un_/.test(id));
  st.killerHand = pool.slice(0, 4);
  st.killerDeck = pool.slice(10, 20);
  st.killerDiscard = [];
  st.pendingKillerDiscards = 0;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  st.logs = [];
  return st;
}

console.log('=== ① 带特性 03：超上限的牌先入手，再由你自选弃哪张 ===');
{
  const st = mk(true);
  const before = [...st.killerHand];
  const deckTop = st.killerDeck.slice(0, 3);
  drawKillerCards(st, 3);
  const drawn = st.killerHand.filter((id) => !before.includes(id));
  console.log(`  手牌 ${before.length} → ${st.killerHand.length}；` +
    `新入手=${drawn.map((id) => nameOf(st, id)).join('、')}`);
  ok(st.killerHand.length === 7, '**3 张全入手了**（手牌临时 7/5）', String(st.killerHand.length));
  ok(drawn.length === 3, '确实摸到 3 张', String(drawn.length));
  ok(st.killerDiscard.length === 0, '**没有一张被直接丢进弃牌堆**',
    JSON.stringify(st.killerDiscard));
  ok(st.pendingKillerDiscards === 2, '**挂出"请自选弃置 2 张"**',
    String(st.pendingKillerDiscards));
  ok(st.pendingUnlockDiscard === true, '走的是同一套超额弃牌闸门');
  const logLines = st.logs.map((l) => l.text);
  ok(logLines.some((t) => t.includes('狡猾诡计') && t.includes('先入手')),
    '战报写清了"先入手、稍后自选弃置"',
    logLines.find((t) => t.includes('狡猾诡计')) ?? '');
  ok(!logLines.some((t) => t.includes('已直接置入弃牌堆')),
    '**没有"多摸的 N 张已直接置入弃牌堆"**（那是没特性时的写法）');

  /** 回合不能就这么收掉 */
  maybeCloseKillerUpkeep(st);
  ok(st.phase === 'upkeep', '**没弃完牌，杀手回合收不掉**', String(st.phase));

  /** 弃两张**旧的** → 新摸到的 3 张全都留得下来（这就是这张特性的意义） */
  const e1 = tryIt(st, { type: 'discardKillerCard', cardId: before[0] });
  const e2 = tryIt(st, { type: 'discardKillerCard', cardId: before[1] });
  ok(e1 == null && e2 == null, '弃两张旧牌', String(e1 ?? e2 ?? ''));
  console.log(`  弃完：手牌 ${st.killerHand.length}；弃牌堆 ${st.killerDiscard.length}；` +
    `待弃 ${st.pendingKillerDiscards}`);
  ok(st.killerHand.length === 5, '**手牌回到上限 5**', String(st.killerHand.length));
  ok(drawn.every((id) => st.killerHand.includes(id)),
    '**新摸到的 3 张全留在手上**（换成丢掉两张旧的）',
    drawn.map((id) => nameOf(st, id)).join('、'));
  ok(st.pendingKillerDiscards === 0, '待弃清零');
  ok(st.pendingUnlockDiscard === false, '闸门也放开了');
  ok(before[0] !== undefined && st.killerDiscard.includes(before[0]),
    '弃掉的旧牌进了弃牌堆');
}

console.log('\n=== ①-b 「任意手牌」也包括刚摸到的那张 ===');
{
  const st = mk(true);
  const before = [...st.killerHand];
  drawKillerCards(st, 3);
  const drawn = st.killerHand.filter((id) => !before.includes(id));
  const e = tryIt(st, { type: 'discardKillerCard', cardId: drawn[0] });
  console.log(`  想弃刚摸到的「${nameOf(st, drawn[0])}」→ ${e ?? 'OK'}`);
  ok(e == null, '**刚摸到的牌也能弃**（卡面就是"任意手牌"）', String(e));
  ok(st.pendingKillerDiscards === 1, '待弃减到 1', String(st.pendingKillerDiscards));
}

console.log('\n=== ② 对照：不带特性 → 超上限的牌直接进弃牌堆 ===');
{
  const st = mk(false);
  const before = [...st.killerHand];
  drawKillerCards(st, 3);
  const drawn = st.killerHand.filter((id) => !before.includes(id));
  console.log(`  手牌 ${before.length} → ${st.killerHand.length}；` +
    `弃牌堆 ${st.killerDiscard.length}；待弃 ${st.pendingKillerDiscards}`);
  ok(st.killerHand.length === 5, '手牌最多就 5 张', String(st.killerHand.length));
  ok(drawn.length === 1, '只有 1 张进得了手', String(drawn.length));
  ok(st.killerDiscard.length === 2, '**超上限的 2 张直接进弃牌堆**',
    String(st.killerDiscard.length));
  ok(st.pendingKillerDiscards === 0, '不挂"请弃牌"', String(st.pendingKillerDiscards));
  ok(st.logs.some((l) => l.text.includes('已直接置入弃牌堆')), '战报是老写法');
}

console.log('\n=== ③ 幸存者大回合里让杀手摸牌：照样给他选，但**不许打断这一轮** ===');
{
  const st = mk(true);
  st.phase = 'survivorMain';
  st.killerDeck = st.killerDeck.slice(0, 5);
  const before = [...st.killerHand];
  drawKillerCards(st, 3);
  console.log(`  phase=${st.phase}；手牌 ${before.length} → ${st.killerHand.length}；` +
    `弃牌堆 ${st.killerDiscard.length}；待弃 ${st.pendingKillerDiscards}`);
  ok(st.killerHand.length === 7, '**照样"先入手"**（让杀手自己选）', String(st.killerHand.length));
  ok(st.pendingKillerDiscards === 2, '**照样挂出"请自选弃置 2 张"**',
    String(st.pendingKillerDiscards));
  ok(st.phase === 'survivorMain', '阶段没被改掉（还是幸存者大回合）', String(st.phase));

  /** 这一步是关键：收尾逻辑必须"独立判断"，不能在幸存者回合里把杀手回合勾掉 */
  maybeCloseKillerUpkeep(st);
  ok(st.phase === 'survivorMain', '**收尾逻辑没有把幸存者这一轮截断**', String(st.phase));

  const drawn = st.killerHand.filter((id) => !before.includes(id));
  const e1 = tryIt(st, { type: 'discardKillerCard', cardId: before[0] });
  const e2 = tryIt(st, { type: 'discardKillerCard', cardId: before[1] });
  console.log(`  弃两张旧的 → ${e1 ?? 'OK'} / ${e2 ?? 'OK'}；` +
    `手牌 ${st.killerHand.length}；phase=${st.phase}`);
  ok(e1 == null && e2 == null, '**杀手随时能把账结掉**', String(e1 ?? e2 ?? ''));
  ok(st.killerHand.length === 5, '手牌回到上限', String(st.killerHand.length));
  ok(drawn.every((id) => st.killerHand.includes(id)), '新摸到的 3 张还是留下了');
  ok(st.phase === 'survivorMain', '**弃完之后这一轮照常继续**（阶段没变）', String(st.phase));
  ok(st.pendingKillerDiscards === 0 && st.pendingUnlockDiscard === false, '闸门放开');
}

console.log('\n=== ④ 界面：幸存者大回合里也画得出"杀手弃牌"面板 ===');
{
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  let GameView = null;
  let viewerFactionOf = null;
  try {
    ({ GameView, viewerFactionOf } = await import('../../client/_ssrbuild/GameViews.js'));
  } catch {
    console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
    process.exit(1);
  }
  const st = mk(true);
  st.phase = 'survivorMain';
  drawKillerCards(st, 3);
  const snap = buildSnapshot(st, HOST);
  /** 模拟"正在行动的是幸存者"（服务端这时候 `controllingActive` 就是 false） */
  snap.controllingActive = false;
  const html = renderToStaticMarkup(
    React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
  );
  console.log(`  controllingActive=${snap.controllingActive}；待弃 ${snap.pendingKillerDiscards}`);
  ok(html.includes('手牌超过上限，请弃置 2 张'), '**弃牌面板画得出来**');
  ok(/<button[^>]*class="card"/.test(html), '手里那几张牌也列出来了（可点）');
  ok(viewerFactionOf(snap) === 'killer',
    '**单人：界面自动切到杀手那边**（不然玩家在幸存者界面看不到这块面板）',
    String(viewerFactionOf(snap)));
}

console.log('\n=== ⑤ 先确认「長劍」本身：使用时杀手抽 1 张 ===');
{
  /** 卡面 */
  const card = (content.cards.discovery ?? []).find((c) => c.id === 'dc_longsword');
  console.log(`  卡面：${card?.name} —— ${card?.text}`);
  ok(Boolean(card && /杀手抽 1/.test(card.text)), '**卡面写的是"使用时杀手抽 1 张"**', card?.text ?? '');
  ok(Boolean(card && /\+3 防御/.test(card.text)), '而且是 +3 防御、可反复使用');

  /** 真打一次：手牌满 → 摸到的那张正面朝上进弃牌堆（基本规则） */
  const st = mk(false);
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  surv.items = { ...surv.items, longsword: 1 };
  /** 把手牌填到上限（`mk` 只给 4 张，是为了上面"摸 3 张"那一段） */
  while (st.killerHand.length < (st.rules.killerHandMax ?? 5)) st.killerHand.push(st.killerDeck.shift());
  const deckBefore = st.killerDeck.length;
  const handBefore = st.killerHand.length;
  const bonus = applyDefenseItem(st, surv.id, 'longsword');
  console.log(`  長劍防御 +${bonus}；摸牌堆 ${deckBefore} → ${st.killerDeck.length}；` +
    `手牌 ${handBefore}；弃牌堆 ${st.killerDiscard.length}`);
  ok(bonus === 3, '防御 +3', String(bonus));
  ok(st.killerDeck.length === deckBefore - 1, '**杀手确实抽了 1 张**（摸牌堆 -1）',
    `${deckBefore} → ${st.killerDeck.length}`);
  ok(st.killerDiscard.length === 1, '手牌满了 → 那张按基本规则直接进弃牌堆',
    JSON.stringify(st.killerDiscard));

  /** 对照：短剑不该抽牌 */
  const st2 = mk(false);
  const surv2 = Object.values(st2.players).find((p) => p.faction === 'survivor');
  surv2.items = { ...surv2.items, shortsword: 1 };
  const deck2 = st2.killerDeck.length;
  const b2 = applyDefenseItem(st2, surv2.id, 'shortsword');
  ok(b2 === 1 && st2.killerDeck.length === deck2, '**对照：短剑 +1、不抽牌**',
    `+${b2}，摸牌堆 ${deck2} → ${st2.killerDeck.length}`);

  /** 带特性 03：同一张長劍 → 抽到的那张**先入手**，等杀手自己选弃哪张 */
  const st3 = mk(true);
  const surv3 = Object.values(st3.players).find((p) => p.faction === 'survivor');
  surv3.items = { ...surv3.items, longsword: 1 };
  while (st3.killerHand.length < (st3.rules.killerHandMax ?? 5)) st3.killerHand.push(st3.killerDeck.shift());
  const hand3 = [...st3.killerHand];
  applyDefenseItem(st3, surv3.id, 'longsword');
  const got3 = st3.killerHand.filter((id) => !hand3.includes(id));
  console.log(`  带特性 03：手牌 ${hand3.length} → ${st3.killerHand.length}；` +
    `新入手=${got3.map((id) => nameOf(st3, id)).join('、')}；待弃 ${st3.pendingKillerDiscards}`);
  ok(got3.length === 1, '**抽到的那张先入手**（不是直接丢掉）', String(got3.length));
  ok(st3.pendingKillerDiscards === 1, '挂出"请自选弃置 1 张"',
    String(st3.pendingKillerDiscards));
}

console.log(`\n狡猾诡计（只管抽牌）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
