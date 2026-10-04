/**
 * **翻发现牌 + 背包已满：顺序必须是"先选要拿的发现牌 → 再弃置"**（用户口径）。
 *
 * 用户原话：「翻发现牌，如果幸存者背包满了，应该**先选择要拿的发现牌**，
 * 再选择弃置哪张牌」。
 *
 * 现象（改之前）：背包满的旧账（`pendingItemDiscard`）还挂着时就进了发现阶段
 * （"所有幸存者都行动完 → 自动进发现"这条自动路径不受动作闸门限制），
 * 而动作闸门把**选发现牌**也一起拦住了 → 玩家只看到"请先弃置一件装备"，
 * 根本点不了那两张候选牌，"先选后弃"变成"先弃后选"。
 *
 * 跑法：node scripts/tests/discovery-full-inventory-order.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, enterDiscovery,
} from '../../server/dist/game/engine.js';
import { cardBecomesPossession } from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
const allCards = content.cards.byId;
const discIds = (content.cards.discovery ?? []).map((c) => c.id);
/** 钥匙走钥匙架、不进背包，单独排除 */
const isKeyDisc = (id) => /^dc_key/.test(id) || (allCards[id]?.name ?? '').includes('钥匙');
/** 一张"会进背包"的发现牌 和 一张"不进背包"的发现牌 */
const itemDisc = discIds.find((id) => !isKeyDisc(id) && cardBecomesPossession(allCards[id]));
/** 钥匙：进钥匙架、**不占背包**，所以它是"留下也不超格"的那一类 */
const keyDisc = discIds.find((id) => isKeyDisc(id));
const itemDisc2 = discIds.filter((id) => !isKeyDisc(id) && cardBecomesPossession(allCards[id]))[1] ?? itemDisc;
/** 发现牌"拿到手"时进背包的是**物品 id**（不是卡牌 id），弃置也要用物品 id */
const itemIdOf = (cardId) => allCards[cardId]?.effects?.find((e) => e.op === 'gainItem')?.item
  ?? allCards[cardId]?.effects?.find((e) => e.op === 'gainItem')?.itemId
  ?? null;
const itemOfDisc = itemIdOf(itemDisc);
const itemOfDisc2 = itemIdOf(itemDisc2);
console.log(`  发现牌堆 ${discIds.length} 张；进背包=${itemDisc}(${allCards[itemDisc]?.name})、` +
  `不占背包=${keyDisc}(${allCards[keyDisc]?.name})`);
ok(Boolean(itemDisc), '找到一张"会进背包"的发现牌', String(itemDisc));
ok(Boolean(keyDisc), '找到一张"不占背包"的发现牌（钥匙）', String(keyDisc));
ok(itemDisc2 !== itemDisc, '找到两张不同的进背包发现牌（给"两张都留"用）', `${itemDisc} / ${itemDisc2}`);

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /**
   * ⚠ `traitById` 是**选特性流程**灌进来的；测试里跳过了那个流程，
   * 所以要自己灌一份 —— 否则 `traitAvailable()` 查不到定义，
   * 特性 18「拾物妙手」永远不会触发（搭台时会误以为"没卡住"）。
   */
  st.traitById = Object.fromEntries((content.traits ?? []).map((t) => [t.id, t]));
  return st;
}

const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const survsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
const itemCountOf = (p) => Object.values(p.items).reduce((a, b) => a + b, 0);

/** 把牌堆顶部换成我们指定的两张，好让"摸 2 张"是什么确定 */
function stackDiscovery(st, ids) {
  st.discoveryDeck = [...ids, ...st.discoveryDeck];
}

/** 进发现阶段 → 选谁翻牌（solo 里 3 名幸存者所以要先选人）→ 摸到候选 */
function startDiscoveryFor(st, actor, ids, socketId = 'h') {
  stackDiscovery(st, ids);
  enterDiscovery(st);
  if (st.pendingDiscoveryPick) {
    const err = tryIt(st, socketId, { type: 'pickSurvivorTurn', playerId: actor.id });
    if (err) return err;
  }
  return null;
}

/* ═══════════ ① 旧账未清就进发现阶段：选牌不能被拦 ═══════════ */
console.log('=== ① 背包已满（旧账挂着）时进发现阶段：先选牌、再弃置 ===');
{
  const st = mk();
  const actor = survsOf(st)[0];
  /** 背包塞满 3 件（这就是截图里那个"装备栏已满（3 格）"的旧账） */
  actor.items = { revolver: 1, flashlight: 1, amulet: 1 };
  st.pendingItemDiscard = { playerId: actor.id, count: 1 };

  st.discoveryActorId = actor.id;
  st.pendingDiscoveryPick = false;
  /** 只堆两张：一张进背包的物品牌 + 一张不进背包的牌 */
  const before = itemCountOf(actor);
  const startErr = startDiscoveryFor(st, actor, [itemDisc, keyDisc]);
  ok(!startErr, '**能选谁翻牌**（旧账不该拦这一步）', String(startErr ?? ''));
  const started = st.phase === 'discovery' && st.discoveryOptions.length === 2;
  ok(started, '前提：进了发现阶段并摸到 2 张候选',
    `phase=${st.phase} options=${JSON.stringify(st.discoveryOptions)}`);
  ok((st.pendingItemDiscard?.count ?? 0) === 1,
    '**摸牌这一步还没要求弃置**（旧账仍是原来的 1 件）',
    JSON.stringify(st.pendingItemDiscard));

  const pickErr = tryIt(st, 'h', { type: 'chooseDiscovery', cardId: itemDisc });
  ok(!pickErr, '**能选要拿的发现牌**（旧账不该拦这一步）', String(pickErr ?? ''));
  ok(itemCountOf(actor) === before + 1,
    '拿到的物品真的进了背包（此时才超格）',
    `${before} → ${itemCountOf(actor)}`);
  ok(Boolean(st.pendingItemDiscard),
    '**选完之后才要求弃置**', JSON.stringify(st.pendingItemDiscard));
  ok((st.pendingItemDiscard?.count ?? 0) === 1,
    '要弃的数量按"拿到新牌之后"重算（4 件 → 弃 1）',
    String(st.pendingItemDiscard?.count));
  ok(st.lastDiscoveryCardId === itemDisc,
    '刚选的那张记在 `lastDiscoveryCardId`（面板要显示它）', String(st.lastDiscoveryCardId));

  /** 现在弃：新拿到的也可以弃（用户口径："可以弃掉拿得到的，也可以弃旧的"） */
  const dropNew = tryIt(st, 'h', { type: 'discardItem', itemId: itemOfDisc });
  ok(!dropNew, '**能直接把刚拿到的发现牌弃掉**（按物品 id）', String(dropNew ?? ''));
  ok(!st.pendingItemDiscard, '弃够了 → 待弃清空');
  ok(st.phase === 'noiseReport',
    '**弃完之后才进响声报告**（流程继续，不卡）', String(st.phase));
}

/* ═══════════ ①b 同一场景、改弃旧的：也行 ═══════════ */
console.log('=== ①b 旧账场景：弃"旧的"同样可以 ===');
{
  const st = mk();
  const actor = survsOf(st)[0];
  actor.items = { revolver: 1, flashlight: 1, amulet: 1 };
  st.pendingItemDiscard = { playerId: actor.id, count: 1 };
  st.discoveryActorId = actor.id;
  st.pendingDiscoveryPick = false;
  const startErr = startDiscoveryFor(st, actor, [itemDisc, keyDisc]);
  ok(!startErr, '能进发现阶段并摸牌', String(startErr ?? ''));
  const pickErr = tryIt(st, 'h', { type: 'chooseDiscovery', cardId: itemDisc });
  ok(!pickErr, '能选要拿的发现牌', String(pickErr ?? ''));
  const dropOld = tryIt(st, 'h', { type: 'discardItem', itemId: 'amulet' });
  ok(!dropOld, '能弃旧的', String(dropOld ?? ''));
  ok(!st.pendingItemDiscard && st.phase === 'noiseReport',
    '弃完 → 进响声报告', `phase=${st.phase}`);
}

/* ═══════════ ② 旧账挂着、但留下的牌不进背包：仍按旧账弃 ═══════════ */
console.log('=== ② 留下的牌不进背包：旧账照样要清，清完继续 ===');
{
  const st = mk();
  const actor = survsOf(st)[0];
  actor.items = { revolver: 1, flashlight: 1, amulet: 1 };
  st.pendingItemDiscard = { playerId: actor.id, count: 1 };
  st.discoveryActorId = actor.id;
  st.pendingDiscoveryPick = false;
  const startErr2 = startDiscoveryFor(st, actor, [keyDisc, itemDisc]);
  ok(!startErr2, '能进发现阶段并摸牌', String(startErr2 ?? ''));

  const err = tryIt(st, 'h', { type: 'chooseDiscovery', cardId: keyDisc });
  ok(!err, '能选（留下的是钥匙，不占背包）', String(err ?? ''));
  ok((st.pendingItemDiscard?.count ?? 0) === 1,
    '背包没变 → 仍只欠 1 件', String(st.pendingItemDiscard?.count));
  const drop = tryIt(st, 'h', { type: 'discardItem', itemId: 'amulet' });
  ok(!drop, '弃掉那 1 件', String(drop ?? ''));
  ok(!st.pendingItemDiscard && st.phase === 'noiseReport',
    '清完旧账 → 进响声报告', `phase=${st.phase}`);
}

/* ═══════════ ③ 拾物妙手（变体1 特性 18）+ 背包满：两张都留也不许卡 ═══════════ */
console.log('=== ③ 特性 18「拾物妙手」两张都留 + 背包满：弃完要继续结算第二张 ===');
{
  const st = mk();
  const actor = survsOf(st)[0];
  st.variant1 = true;
  st.traits = { ...(st.traits ?? {}), [actor.id]: ['trait_s18'] };
  actor.items = { revolver: 1, flashlight: 1, amulet: 1 };
  st.pendingItemDiscard = { playerId: actor.id, count: 1 };
  st.discoveryActorId = actor.id;
  st.pendingDiscoveryPick = false;
  /** 两张都进背包 → 一定会超格 */
  const startErr3 = startDiscoveryFor(st, actor, [itemDisc, itemDisc2]);
  ok(!startErr3, '能进发现阶段并摸牌（拾物妙手：两张都留）', String(startErr3 ?? ''));

  ok(st.discoveryOptions.length === 2 || st.pendingItemDiscard != null,
    '前提：摸到两张（或已经进入待弃状态）',
    `options=${JSON.stringify(st.discoveryOptions)} discard=${JSON.stringify(st.pendingItemDiscard)}`);
  /** 把欠的牌全弃掉（数量可能 >1），然后检查流程有没有继续 */
  let guard = 0;
  while (st.pendingItemDiscard && guard < 8) {
    guard += 1;
    const p = st.players[st.pendingItemDiscard.playerId];
    const someId = Object.keys(p.items).find((k) => p.items[k] > 0);
    if (!someId) break;
    const e = tryIt(st, 'h', { type: 'discardItem', itemId: someId });
    if (e) { ok(false, '弃置出错', e); break; }
  }
  ok(!st.pendingItemDiscard, '**弃置清空（没有卡在"请弃置"上）**');
  ok(st.phase === 'noiseReport',
    '**弃完之后流程继续**（两张都留的结算也走完 → 进响声报告）',
    `phase=${st.phase} options=${JSON.stringify(st.discoveryOptions)}`);
  ok(st.discoveryOptions.length === 0, '候选清空（不会再挂着两张牌）',
    JSON.stringify(st.discoveryOptions));
  /** 两张都留下：各自的效果都执行了（各进 1 件物品，然后被弃置抵消） */
  const keptItems = [itemOfDisc, itemOfDisc2].filter(Boolean);
  ok(keptItems.length === 2, '前提：两张都是"进背包"的牌', keptItems.join(','));
  /** 另一张**不该**被丢进弃牌堆（两张都留，不是"留一张丢一张"） */
  const discPile = st.discoveryDiscard ?? [];
  ok(!discPile.includes(itemDisc2),
    '**另一张没有被丢进弃牌堆**（拾物妙手是"两张都留"）',
    `弃牌堆 ${JSON.stringify(discPile.slice(-4))}`);
}

/* ═══════════ ④ 界面：还有候选时先给候选，不抢先弹"请弃置" ═══════════ */
console.log('=== ④ 界面顺序：候选还在时先选牌，选完才提示弃置 ===');
{
  let draw = null;
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
    draw = (snap) => renderToStaticMarkup(
      React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
    );
  }
  catch {
    console.log('   （跳过界面部分：没有 client/_ssrbuild —— 先跑 node scripts/tests/build-menu.mjs）');
  }
  if (draw) {
    const { buildSnapshot } = await import('../../server/dist/game/engine.js');
    const st = mk();
    const actor2 = survsOf(st)[0];
    actor2.items = { revolver: 1, flashlight: 1, amulet: 1 };
    st.pendingItemDiscard = { playerId: actor2.id, count: 1 };
    st.discoveryActorId = actor2.id;
    st.pendingDiscoveryPick = false;
    const e4 = startDiscoveryFor(st, actor2, [itemDisc, keyDisc]);
    ok(!e4, '前提：进发现阶段、摸到 2 张候选', String(e4 ?? ''));
    const html1 = draw(buildSnapshot(st, actor2.controllerId));
    ok(html1.includes(allCards[itemDisc]?.name ?? itemDisc),
      '**界面上画出了候选发现牌**', allCards[itemDisc]?.name);
    ok(!html1.includes('装备栏已满'),
      '**没有抢先弹"装备栏已满/请弃置"**（先让玩家选要拿的牌）');

    /** 选完之后：这时候才该出现弃置面板 */
    ok(!tryIt(st, 'h', { type: 'chooseDiscovery', cardId: itemDisc }), '选牌成功');
    const html2 = draw(buildSnapshot(st, actor2.controllerId));
    ok(html2.includes('装备栏已满'),
      '**选完之后才提示弃置**（这时新牌已在背包里，可以弃它也可以弃旧的）');
  }
}

console.log(`\n发现牌 × 背包满 顺序：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
