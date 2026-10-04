/**
 * **三张替换牌（鸿运当骰 / 煤油灯 / 神秘包裹）的可用性**。
 *
 * 用户问的：「检查一下煤油灯和神秘包裹有没有放进额外行动窗口里。
 * 煤油灯在遭遇中是否能用」。
 *
 * 卡面（`content/cards/official.json`）：
 *  - 煤油灯   `+1 防御值；或额外行动：移动通过一条秘密通道。可反复使用。`
 *    → **两半都要能用**：遭遇防御里是防御物品（+1 / 不消耗）；幸存者大回合里是额外行动。
 *  - 神秘包裹 `额外行动：从发现牌堆抽取一张卡牌，并在你的地点发出响声。`
 *  - 鸿运当骰 `（本卡牌不算作防御物品）在遭遇期间，你可以重掷任意数量的骰子。`
 *
 * 检查结论（这次修的就是缺的那半）：服务端两半都实现了，但**客户端的额外行动窗口
 * 里一个入口都没有** —— 拿到煤油灯只能用防御那一半，神秘包裹则完全用不了。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/promo-cards.mjs
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import {
  applyDefenseItem, usableDefenseItemIds, defenseItemHint, defenseItemInfo,
  passageNeighbors,
} from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, who, action) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

function mkDuo(mapId = 'crypt') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, 'h', { type: 'confirmTrapPlacement' });
  }
  st.phase = 'survivorMain';
  const first = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  if (first) tryIt(st, 's', { type: 'pickSurvivorTurn', playerId: first.id });
  return { st, p: first };
}

console.log('=== ① 煤油灯（防御那一半）：遭遇里能用，而且是"可反复" ===');
{
  const { st, p } = mkDuo();
  ok(!usableDefenseItemIds(p).includes('lamp'), '（前提）没有煤油灯时防御选项里没有它');
  p.items = { ...p.items, lamp: 1 };
  const info = defenseItemInfo('lamp');
  console.log(`  defenseItemInfo('lamp') = ${JSON.stringify(info)}`);
  console.log(`  提示语 = ${defenseItemHint('lamp')}`);
  ok(usableDefenseItemIds(p).includes('lamp'), '**有煤油灯就能在遭遇防御里选它**');
  ok(info?.bonus === 1 && info?.consume === false, '**+1 防御、不消耗**',
    JSON.stringify(info));
  ok(/可反复使用/.test(defenseItemHint('lamp')), '提示语写明"可反复使用"',
    defenseItemHint('lamp'));

  /** 真用一次：加成拿到、道具还在（可反复） */
  const bonus = applyDefenseItem(st, p.id, 'lamp');
  console.log(`  用一次：防御 +${bonus}，背包里 lamp=${p.items.lamp}`);
  ok(bonus === 1, '**+1 防御**', String(bonus));
  ok((p.items.lamp ?? 0) === 1, '**煤油灯没被消耗**（可反复用）', String(p.items.lamp));
  ok(applyDefenseItem(st, p.id, 'lamp') === 1, '第二次还能用');

  /** 快照里也要列出来（客户端就靠这个画防御选项） */
  st.phase = 'encounter';
  const snap = buildSnapshot(st, 's');
  const ids = (snap.defenseItemChoices ?? []).map((x) => x.id);
  console.log(`  快照 defenseItemChoices = ${JSON.stringify(ids)}`);
  ok(ids.includes('lamp'), '**快照把煤油灯列进了防御选项**', JSON.stringify(ids));
}

console.log('=== ② 煤油灯（额外行动那一半）：穿过秘密通道 ===');
{
  const { st, p } = mkDuo();
  /** 墓穴的秘密通道：R3 ↔ B3、G2 ↔ B3 */
  const from = st.map.passages[0].from;
  const to = st.map.passages[0].to;
  p.roomId = from;
  p.items = { ...p.items, lamp: 1 };
  const ends = passageNeighbors(st.map, from);
  console.log(`  ${from} 的秘密通道出口：${JSON.stringify(ends)}`);
  ok(ends.includes(to), '（前提）这两个地点之间有秘密通道', `${from}→${to}`);

  const err = tryIt(st, 's', { type: 'useItem', itemId: 'lamp', toRoomId: to });
  console.log(`  用煤油灯穿通道 → ${err ?? 'OK'}（现在在 ${p.roomId}）`);
  ok(!err && p.roomId === to, '**穿过去了**', String(err ?? ''));
  ok((p.items.lamp ?? 0) === 1, '**煤油灯还在**（可反复使用）', String(p.items.lamp));

  /** 不在通道口不能用 */
  const { st: st2, p: p2 } = mkDuo();
  p2.items = { ...p2.items, lamp: 1 };
  p2.roomId = 'R1';
  const err2 = tryIt(st2, 's', { type: 'useItem', itemId: 'lamp', toRoomId: to });
  ok(err2 != null, '**不在秘密通道口就用不了**', String(err2));

  /** 没带煤油灯也不行 */
  const { st: st3, p: p3 } = mkDuo();
  p3.roomId = from;
  const err3 = tryIt(st3, 's', { type: 'useItem', itemId: 'lamp', toRoomId: to });
  ok(err3 != null && /没有这件物品/.test(err3), '没带煤油灯会被拒', String(err3));
}

console.log('=== ③ 神秘包裹：额外行动抽一张发现牌 + 响声 ===');
{
  const { st, p } = mkDuo();
  p.items = { ...p.items, parcel: 1 };
  p.roomId = 'B3';
  const deckBefore = st.discoveryDeck.length;
  const keysBefore = st.keysCollected;
  const itemsBefore = JSON.stringify(p.items);
  const err = tryIt(st, 's', { type: 'useItem', itemId: 'parcel' });
  const noises = st.noises.includes('B3');
  console.log(`  用神秘包裹 → ${err ?? 'OK'}；发现牌堆 ${deckBefore} → ${st.discoveryDeck.length}；` +
    `B3 有响声=${noises}；包裹剩=${p.items.parcel ?? 0}`);
  ok(!err, '能打开', String(err ?? ''));
  ok(st.discoveryDeck.length === deckBefore - 1, '**从发现牌堆抽走了一张**',
    `${deckBefore} → ${st.discoveryDeck.length}`);
  ok(st.noises.includes('B3'), '**在自己地点发出了响声**');
  ok((p.items.parcel ?? 0) === 0, '**神秘包裹是一次性的**（用掉就没了）');
  ok(itemsBefore !== JSON.stringify(p.items) || keysBefore !== st.keysCollected,
    '抽到的东西进了背包/钥匙架');

  /** 没带包裹不行 */
  const { st: st2 } = mkDuo();
  const err2 = tryIt(st2, 's', { type: 'useItem', itemId: 'parcel' });
  ok(err2 != null && /没有这件物品/.test(err2), '没带包裹会被拒', String(err2));
}

console.log('=== ④ 额外行动窗口里必须有这两个入口（以前一个都没有） ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  /**
   * 额外行动弹窗那一段：从它内部的 `add(...)` 按钮工厂开始往后取。
   * （`planExtras` 是在 `add` **之前**声明的，不能拿它当结尾锚点。）
   */
  const start = views.indexOf('const add = (key: string');
  ok(start > 0, '（前提）找到额外行动弹窗的按钮工厂');
  const panel = views.slice(start, start + 20000);
  ok(/p\.items\.lamp/.test(panel), '**煤油灯的额外行动按钮在窗口里**');
  ok(/itemId: 'lamp'/.test(panel) && /toRoomId: rid/.test(panel),
    '煤油灯按"每个秘密通道出口一个按钮"发 `useItem` + `toRoomId`');
  ok(/p\.items\.parcel/.test(panel), '**神秘包裹的额外行动按钮在窗口里**');
  ok(/itemId: 'parcel'/.test(panel), '神秘包裹发的是 `useItem parcel`');
  /** 这两个在服务端都算"额外行动"（不占一般行动） */
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  const extra = engine.slice(engine.indexOf('const extraItems = new Set(['));
  const set = extra.slice(0, extra.indexOf(']'));
  ok(/'lamp'/.test(set), '**服务端把 lamp 当额外行动**');
  ok(/'parcel'/.test(set), '**服务端把 parcel 当额外行动**');
}

console.log('=== ⑤ 鸿运当骰：不算防御物品，但遭遇里能重掷 ===');
{
  const { p } = mkDuo();
  p.items = { ...p.items, lucky_dice: 1 };
  ok(!usableDefenseItemIds(p).includes('lucky_dice'),
    '**鸿运当骰不出现在防御物品里**（卡面就这么写的）',
    JSON.stringify(usableDefenseItemIds(p)));
  /** 重掷的实现（服务端）：手里有它就挂起询问 */
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  ok(/usedLuckyDice|luckyDiceRerolls|pendingDice/.test(engine), '重掷那套逻辑在服务端（遭遇内使用）');
  ok(/handHasLuckyDice|手里有「鸿运当骰」/.test(engine), '掷完骰会问"要不要重掷"');
}

console.log(`\n替换牌（鸿运当骰 / 煤油灯 / 神秘包裹）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
