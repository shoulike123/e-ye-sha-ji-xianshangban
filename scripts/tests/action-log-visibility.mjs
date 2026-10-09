/**
 * **战报口径**（用户 2026-10 的一批要求）。
 *
 * 规则：
 *  1. 【遭遇外的幸存者行动】只告诉杀手**现象**，**不能说是谁**：
 *     哪里的封堵被移除 / 哪里的哪个雕像被停滞 / 哪里的几个僵尸被消灭 /
 *     哪里的核心标记被移除 / 哪里的猎手陷阱被踩。
 *     → 实现手段是 `effects.logSplit(幸存者版, 杀手版)`。
 *  2. ⚠ **拆封堵：幸存者那边永远点名；杀手那边分模式**（用户 2026-02 口径，
 *     取代更早的"一律点名"）：
 *       · **一般模式** → 只告诉杀手现象（哪扇门的封堵没了），**不说是谁**；
 *       · **分头行动** → 仍然点名（「分头行动要分清谁清除了封堵」）。
 *     本文件专门守这两条。
 *  3. 遗物牌堆的「鑰匙」在**杀手方视角**要和普通钥匙（搜索/发现）**走一样的战报**
 *     —— 普通钥匙上架是 `'survivor'`（杀手看不到），所以遗物钥匙也不给杀手看。
 *  4. 城堡的机关大门：幸存者那边写"谁操作的控制杆"，**杀手只知道门在哪**。
 *  5. 剛毅之盾 = 普通防御物品（只是不占名额）：**能吃到乔治的防御笔记**，
 *     并顶掉威廉「坚韧不拔」/ 特性 05；鼓励标记不算。
 *
 * 跑法：node scripts/tests/action-log-visibility.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { removeBlockade, usableDefenseItemIds } from '../../server/dist/game/effects.js';
import { giveRelic, applyRelicKey } from '../../server/dist/game/relic.js';
import { placeLeverGate } from '../../server/dist/game/mapEffects.js';

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

function mkDuo(mapId = 'crypt', killerChar = 'killer1', survChars = ['survivor6', 'survivor7', 'survivor9']) {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerChar;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survChars;
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

/** 某一步之后，双方各自"新增"的战报文本 */
function after(st, run) {
  const kb = buildSnapshot(st, 'h').logs.length;
  const sb = buildSnapshot(st, 's').logs.length;
  const err = run();
  const killer = buildSnapshot(st, 'h').logs.slice(kb).map((l) => l.text);
  const survivor = buildSnapshot(st, 's').logs.slice(sb).map((l) => l.text);
  return { err, killer, survivor };
}
const anyHas = (arr, kw) => arr.some((t) => t.includes(kw));

console.log('=== ① 拆封堵：幸存者那边点名；杀手那边**一般模式不点名**、分头行动点名 ===');
{
  const { st, p } = mkDuo();
  const door = st.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  const key = [door.from, door.to].sort().join('|');
  st.blockades = [key];
  const name = p.name;
  const { killer, survivor } = after(st, () => removeBlockade(st, key, p.id));
  console.log(`  一般模式 杀手看到：${JSON.stringify(killer)}`);
  console.log(`  一般模式 幸存者看到：${JSON.stringify(survivor)}`);
  ok(anyHas(survivor, name), '**幸存者那边必须有人名**', survivor.join(' | '));
  ok(!anyHas(killer, name), '**一般模式：杀手战报里没有人名**（只说现象）', killer.join(' | '));
  ok(anyHas(killer, '封堵'), '但写明"哪扇门的封堵被移除"');
}
{
  /** 分头行动：同一件事要**点名**（那条口径没变） */
  const { st, p } = mkDuo();
  st.split = true;
  const door = st.map.edges.find((e) => !e.pathType || e.pathType === 'door');
  const key = [door.from, door.to].sort().join('|');
  st.blockades = [key];
  const { killer } = after(st, () => removeBlockade(st, key, p.id));
  console.log(`  分头行动 杀手看到：${JSON.stringify(killer)}`);
  ok(anyHas(killer, p.name), '**分头行动：杀手战报里仍然有人名**', killer.join(' | '));
}

console.log('=== ② 雕像被停滞：杀手只知道"哪尊、在哪"，不知道是谁 ===');
{
  const { st, p } = mkDuo('crypt', 'killer6');
  const statue = Object.values(st.players).find((x) => x.statueIndex === 3);
  p.roomId = statue.roomId;
  const { err, killer, survivor } = after(st, () =>
    tryIt(st, 's', { type: 'haltStatue', statueId: statue.id, actorPlayerId: p.id }),
  );
  console.log(`  停滞：${err ?? 'OK'}\n    杀手：${JSON.stringify(killer)}\n    幸存者：${JSON.stringify(survivor)}`);
  ok(!anyHas(killer, p.name), '**杀手看不到是谁停滞的**', killer.join(' | '));
  ok(anyHas(killer, '被停滞'), '杀手看到"被停滞"这个现象');
  ok(anyHas(killer, `雕像 ${statue.statueIndex}`), '杀手知道是哪一尊', String(statue.statueIndex));
  ok(anyHas(survivor, p.name), '幸存者那边有名字');
}

console.log('=== ③ 遗物「鑰匙」：杀手视角和普通钥匙一样（看不到） ===');
{
  const { st, p } = mkDuo();
  p.roomId = 'R6';
  const { killer, survivor } = after(st, () => applyRelicKey(st, p));
  console.log(`  杀手：${JSON.stringify(killer)}\n  幸存者：${JSON.stringify(survivor)}`);
  ok(!anyHas(killer, '遗物'), '**杀手战报里没有"遗物「鑰匙」"**', killer.join(' | '));
  ok(!anyHas(killer, '钥匙立牌') && !anyHas(killer, '上架'),
    '**杀手也看不到"上架"那条**（普通钥匙上架本来就是幸存者私有）', killer.join(' | '));
  ok(anyHas(survivor, '遗物「鑰匙」'), '幸存者自己看得到"这是遗物钥匙"');
  ok(st.keysCollected === 1, '钥匙进度照常 +1（钥匙架双方可见）', String(st.keysCollected));
}

console.log('=== ④ 城堡机关大门：杀手只知道门在哪，不知道谁操作 ===');
{
  const { st, p } = mkDuo('castle');
  const edge = (st.map.edges ?? []).find((e) => !e.pathType || e.pathType === 'door');
  const { err, killer, survivor } = after(st, () =>
    placeLeverGate(st, edge.from, edge.to, p.id),
  );
  console.log(`  放门：${err ?? 'OK'}\n    杀手：${JSON.stringify(killer)}\n    幸存者：${JSON.stringify(survivor)}`);
  ok(!anyHas(killer, p.name), '**杀手看不到是谁操纵的控制杆**', killer.join(' | '));
  ok(!anyHas(killer, '操作控制杆'), '连"操作控制杆"这几个字都不给');
  ok(anyHas(killer, '机关大门'), '**但能看到"机关大门出现在哪扇门"**');
  ok(anyHas(survivor, p.name) && anyHas(survivor, '控制杆'),
    '幸存者那边照旧写清楚是谁');
  /** 快照也不能漏：杀手拿到的 `leverGateOwnerName` 必须是 null */
  ok(buildSnapshot(st, 'h').leverGateOwnerName == null,
    '**杀手快照里没有操作者的名字**', String(buildSnapshot(st, 'h').leverGateOwnerName));
  ok(buildSnapshot(st, 's').leverGateOwnerName === p.name,
    '幸存者快照里有名字', String(buildSnapshot(st, 's').leverGateOwnerName));
}

console.log('=== ⑤ 移除核心标记 / 十字弩消灭僵尸：杀手只知道现象 ===');
{
  const { st, p } = mkDuo('crypt', 'killer8');
  st.coreMarkers = ['B3'];
  p.roomId = 'B3';
  const { err, killer, survivor } = after(st, () =>
    tryIt(st, 's', { type: 'removeCoreMarker', actorPlayerId: p.id }),
  );
  console.log(`  移除核心标记：${err ?? 'OK'}\n    杀手：${JSON.stringify(killer)}`);
  ok(!anyHas(killer, p.name), '**杀手看不到是谁移除的**', killer.join(' | '));
  ok(anyHas(killer, '核心标记') && anyHas(killer, '移除'),
    '杀手看到"哪里的核心标记被移除"', killer.join(' | '));
  ok(anyHas(survivor, p.name), '幸存者那边有名字');
}

console.log('=== ⑥ 猎手陷阱被踩：杀手只知道哪里、哪种陷阱 ===');
{
  const { st, p } = mkDuo('crypt', 'killer4');
  /** ⚠ 要用**普通的相邻边**：R3→B3 是秘密通道，`move` 走不过去 */
  const edge = (st.map.edges ?? []).find((e) => !e.pathType || e.pathType === 'door');
  p.roomId = edge.from;
  st.hunterTraps = { t1: { kind: 'bear', roomId: edge.to } };
  const { err, killer } = after(st, () => tryIt(st, 's', { type: 'move', toRoomId: edge.to }));
  console.log(`  从 ${edge.from} 走到 ${edge.to}（${err ?? 'OK'}）\n    杀手：${JSON.stringify(killer)}`);
  /**
   * ⚠ 口径改了（作者原话）：
   *  - 「**受到伤害就明确说如何受到伤害，这个杀手要明确知道**」
   *  - 「**捕熊陷阱没错，这个不用改**」
   *
   * 所以杀手现在**看得到是谁踩的** —— 旧断言（要求杀手看不到人名）已经过时，
   * 换成"陷阱现象 + 谁受了伤"两条都在。
   */
  ok(anyHas(killer, '捕熊陷阱') && anyHas(killer, '被触发'),
    '杀手看到"哪里的哪种陷阱被触发"', killer.join(' | '));
  ok(anyHas(killer, p.name) && anyHas(killer, '受到'),
    '**杀手看得到是谁受了伤、以及受伤这件事**', killer.join(' | '));
}

console.log('=== ⑦ 剛毅之盾 = 普通防御物品（能吃到乔治的防御笔记） ===');
{
  const fs = await import('node:fs');
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  /** 笔记的判定必须放在"普通防御物品 / 剛毅之盾"两个分支**外面** */
  ok(/if \(itemId \|\| relicShield > 0\) \{/.test(engine),
    '**笔记的条件是"用了任何防御物品（含剛毅之盾）"**');
  const { st, p } = mkDuo('crypt', 'killer1', ['survivor6', 'survivor7', 'survivor9']);
  p.items = { ...p.items, relic_shield: 1, george_note_defense: 1 };
  ok(usableDefenseItemIds(p).includes('relic_shield'),
    '剛毅之盾出现在防御选项里', JSON.stringify(usableDefenseItemIds(p)));
  /** 它**不占名额**：同时还能选一件普通防御物品 */
  p.items = { ...p.items, shortsword: 1 };
  const both = usableDefenseItemIds(p);
  ok(both.includes('relic_shield') && both.includes('shortsword'),
    '**能和普通防御物品一起列出来**（不占名额）', JSON.stringify(both));
  void st;
}

console.log(`\n战报口径：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
