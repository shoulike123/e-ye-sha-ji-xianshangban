/**
 * **幸存者物品栏超限，永远是"自己选一件弃置"**（用户口径 2026-02）：
 *
 * > 马尔科物品满时拿镇静剂或肾上腺素应该是选择弃置。
 * > 幸存者**任何时候**物品栏超限都是选择弃置。
 *
 * 也就是：**不允许"因为装不下就拒绝"** —— 东西先进背包，然后挂
 * `pendingItemDiscard` 让他自己挑弃哪件。改之前"同伴把物品交给他"这条路
 * 是直接抛「对方装备栏已满，只能互换」，等于把超限挡在门外。
 *
 * 跑法：node scripts/tests/item-overflow-always-choose.mjs
 * （⑤ 界面部分需要先 `node scripts/tests/build-menu.mjs`）
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action, sid = 's') => {
  try { handleAction(st, sid, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const survivorsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor');

/** 1对1：一名玩家操控三名幸存者（交换 / 给予都归他） */
function mkDuo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor6', 'survivor7'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.pendingItemDiscard = null;
  st.phase = 'survivorMain';
  return st;
}
/** 单人热座（马尔科的技能那条） */
function mkSolo() {
  const st = mkDuo();
  st.mode = 'solo';
  for (const p of survivorsOf(st)) p.controllerId = 'h';
  st.turnOrder = survivorsOf(st).map((p) => p.id);
  return st;
}
const marcoOf = (st) => survivorsOf(st).find((p) => p.characterId === 'survivor3');

console.log('=== ① 同伴把「镇静剂」交给背包满的人 → 收下 + 他自己选弃 ===');
{
  const st = mkDuo();
  const marco = marcoOf(st);
  const mate = survivorsOf(st).find((p) => p.id !== marco.id);
  mate.roomId = marco.roomId;
  mate.items = { sedative: 1 };
  /** 马尔科背包满（3/3） */
  marco.items = { marco_medkit: 1, herb: 1, whiskey: 1 };

  const err = tryIt(st, {
    type: 'tradeItem', fromPlayerId: mate.id, targetPlayerId: marco.id, itemId: 'sedative', amount: 1,
  });
  console.log(`  交给马尔科 → ${err ?? 'OK'}；他的物品=${JSON.stringify(marco.items)}；` +
    `待弃=${JSON.stringify(st.pendingItemDiscard)}`);
  ok(err == null, '**不再被拒**（以前是"对方装备栏已满，只能互换"）', String(err));
  ok((marco.items.sedative ?? 0) === 1, '**东西先进了背包**', JSON.stringify(marco.items));
  ok(st.pendingItemDiscard?.playerId === marco.id && st.pendingItemDiscard.count === 1,
    '**挂出"请自选弃置 1 件"**', JSON.stringify(st.pendingItemDiscard));
  ok((mate.items.sedative ?? 0) === 0, '给出者那边扣掉了');

  /** 他自己挑一件弃掉 */
  const e2 = tryIt(st, { type: 'discardItem', itemId: 'herb', actorPlayerId: marco.id });
  console.log(`  弃「herb」→ ${e2 ?? 'OK'}；物品=${JSON.stringify(marco.items)}`);
  ok(e2 == null, '弃得掉', String(e2));
  ok(!st.pendingItemDiscard, '**弃完就清空**', JSON.stringify(st.pendingItemDiscard));
  ok(Object.keys(marco.items).length === 3, '背包回到 3 件', JSON.stringify(marco.items));
}

console.log('\n=== ② 对照：1 换 1 交换（件数不变）不该冒出待弃 ===');
{
  const st = mkDuo();
  const marco = marcoOf(st);
  const mate = survivorsOf(st).find((p) => p.id !== marco.id);
  mate.roomId = marco.roomId;
  mate.items = { sedative: 1 };
  marco.items = { marco_medkit: 1, herb: 1, whiskey: 1 };
  const err = tryIt(st, {
    type: 'tradeItem', fromPlayerId: mate.id, targetPlayerId: marco.id,
    itemId: 'sedative', amount: 1, receiveItemId: 'herb',
  });
  console.log(`  交换 → ${err ?? 'OK'}；马尔科=${JSON.stringify(marco.items)}；` +
    `待弃=${JSON.stringify(st.pendingItemDiscard)}`);
  ok(err == null, '交换成功', String(err));
  ok(st.pendingItemDiscard == null, '**1 换 1 不会超格 → 不问弃置**',
    JSON.stringify(st.pendingItemDiscard));
}

console.log('\n=== ③ 马尔科「足智多谋」背包满拿肾上腺素 → 收下 + 他自己选弃 ===');
{
  const st = mkSolo();
  const marco = marcoOf(st);
  st.activeSurvivorIndex = st.turnOrder.indexOf(marco.id);
  st.pendingSurvivorPick = true;
  tryIt(st, { type: 'pickSurvivorTurn', playerId: marco.id }, HOST);
  marco.items = { marco_medkit: 1, herb: 1, whiskey: 1 };
  marco.mainActionUsed = false;
  st.survivorDiscard = ['adrenaline', 'sedative'];

  const err = tryIt(st, {
    type: 'useSkill', skillId: 'resourceful', itemId: 'adrenaline', actorPlayerId: marco.id,
  }, HOST);
  console.log(`  拿肾上腺素 → ${err ?? 'OK'}；物品=${JSON.stringify(marco.items)}；` +
    `待弃=${JSON.stringify(st.pendingItemDiscard)}`);
  ok(err == null, '技能能用（没被"背包满"挡住）', String(err));
  ok((marco.items.adrenaline ?? 0) === 1, '肾上腺素进了背包', JSON.stringify(marco.items));
  ok(st.pendingItemDiscard?.playerId === marco.id, '**挂出"请自选弃置"**',
    JSON.stringify(st.pendingItemDiscard));

  /** 快照 + 界面：这块面板画得出来 */
  const snap = buildSnapshot(st, HOST);
  ok(snap.pendingItemDiscard?.items != null, '快照里带着"他的物品清单"（界面才列得出牌）',
    JSON.stringify(snap.pendingItemDiscard));
}

console.log('\n=== ④ 界面源码：满栏时"给"的按钮不再被藏掉 ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(!/const canGive = !recvFull/.test(views),
    '**没有"满栏就不给按钮"那一条**（`canGive = !recvFull` 已删）');
  ok(/栏已满 —— 给过去之后由\*\*他自己\*\*选一件弃置/.test(views),
    '改成提示"给过去之后由他自己选一件弃置"');
}

console.log('\n=== ⑤ 界面：弃置列表里的遗物要显示中文名（不是 relic_xxx）===');
{
  /**
   * 用户口径：「弃牌时遗物的显示是英文」——遗物是**背包物品**（id = `relic_*`），
   * 客户端 `ITEM_LABEL` 里以前没这几项，弃置/给予/背包面板就直接把 id 印出来了。
   */
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  let GameView = null;
  try {
    ({ GameView } = await import('../../client/_ssrbuild/GameViews.js'));
  } catch {
    console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
    process.exit(1);
  }
  const st = mkDuo();
  const marco = marcoOf(st);
  marco.items = { relic_shield: 1, relic_guard: 1, herb: 1 };
  st.pendingItemDiscard = { playerId: marco.id, count: 1 };
  const snap = buildSnapshot(st, 's');
  const html = renderToStaticMarkup(
    React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
  );
  ok(html.includes('剛毅之盾'), '**遗物在弃置列表里显示中文名「剛毅之盾」**');
  ok(html.includes('守護之石'), '另一件也是中文名「守護之石」');
  /**
   * 只查**看得见的字**就够了：`data-item-id="relic_shield"` 这种属性里带 id 是正常的
   * （那是给拖拽用的），以前的问题是**按钮上印的就是英文 id**。
   */
  ok(!/>\s*弃置 relic_shield/.test(html), '按钮文字不再是 `弃置 relic_shield`');
  ok(!/>\s*弃置 relic_guard/.test(html), '按钮文字不再是 `弃置 relic_guard`');
}

console.log(`\n物品栏超限 = 自己选弃：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
