/**
 * **幸存者侧动作不进杀手战报**（用户口径）。
 *
 * 用户原话：「遗物标记的翻回，幸存者技能使用，物品（包括遗物）的使用都不能写在
 * 杀手战报里（除非是遭遇期间内使用的）」＋「遭遇中，幸存者触发技能、物品啥的
 * 正常给杀手看，但是**不会显示遭遇之前没显示的信息**」。
 *
 * 所以口径是**按发生时机**：
 *  - 遭遇中做的 → 双方都看得到（`'all'`）
 *  - 遭遇之外（幸存者大回合、大回合开始…）→ 只给幸存者（`'survivor'`）
 *
 * 统一判定在 `effects.survivorActionVis()`。
 *
 * 跑法：node scripts/tests/survivor-log-secrecy.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { onSurvivorRoundStart, drawRelic } from '../../server/dist/game/collapse.js';
import { giveRelic, useMirror } from '../../server/dist/game/relic.js';
import { applyDamage } from '../../server/dist/game/effects.js';

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

/** 1对1：房主当杀手，'s' 当幸存者操作者 */
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
  /** 共享操控模式要先点一名幸存者开始小回合（否则"还没轮到你"） */
  const first = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  if (first) tryIt(st, 's', { type: 'pickSurvivorTurn', playerId: first.id });
  return st;
}
const survOf = (st, charId) =>
  Object.values(st.players).find((p) => p.faction === 'survivor' && p.characterId === charId) ??
  Object.values(st.players).find((p) => p.faction === 'survivor');

/** 只看"这一步之后新增的战报"，分杀手视角 / 幸存者视角 */
function newLogs(st, from) {
  const k = buildSnapshot(st, 'h').logs.slice(from.k).map((l) => l.text);
  const s = buildSnapshot(st, 's').logs.slice(from.s).map((l) => l.text);
  return { k, s };
}
const marks = (st) => ({ k: buildSnapshot(st, 'h').logs.length, s: buildSnapshot(st, 's').logs.length });
const has = (arr, kw) => arr.some((t) => t.includes(kw));

/** 一条用例：做事 → 杀手看不到 / 幸存者看得到 */
function caseOne(label, kw, make, run) {
  const st = make();
  const from = marks(st);
  const err = run(st);
  const { k, s } = newLogs(st, from);
  console.log(`  ${label}：杀手新增 ${k.length} 条，幸存者新增 ${s.length} 条${err ? `（${err}）` : ''}`);
  ok(!has(k, kw), `**杀手看不到「${kw}」**`, k.filter((t) => t.includes(kw)).join(' | '));
  ok(has(s, kw), `幸存者看得到「${kw}」`);
  return st;
}

console.log('=== ① 获得遗物（墓穴遗物室） ===');
caseOne('抽 1 张遗物并入手', '获得遗物', () => {
  const st = mkDuo();
  const p = survOf(st);
  p.roomId = 'R6';
  st.relicMarkerFaceUp = true;
  return st;
}, (st) => {
  const p = survOf(st);
  const cardId = drawRelic(st, p);
  giveRelic(st, p, cardId);
  return null;
});

console.log('=== ② 遗物标记翻回正面（每个幸存者大回合开始） ===');
caseOne('遗物标记翻回', '遗物标记翻回正面', () => {
  const st = mkDuo();
  st.relicMarkerFaceUp = false;
  return st;
}, (st) => { onSurvivorRoundStart(st); return null; });

console.log('=== ③ 使用遗物「鏡之門戶」（额外行动） ===');
caseOne('传送到螺旋地点', '使用遗物「鏡之門戶」', () => {
  const st = mkDuo();
  const p = survOf(st);
  p.roomId = 'B3';
  giveRelic(st, p, 'relic_mirror');
  return st;
}, (st) => {
  const p = survOf(st);
  useMirror(st, p, 'G2');
  return null;
});

console.log('=== ④ 幸存者技能：欧菲莉亚「第六感」搜索摸 2 选 1 ===');
caseOne('第六感放回一张', '第六感', () => {
  const st = mkDuo('crypt', 'killer1', ['survivor7', 'survivor6', 'survivor9']);
  const p = survOf(st, 'survivor7');
  p.roomId = 'B5';
  return st;
}, (st) => {
  const p = survOf(st, 'survivor7');
  const err = tryIt(st, 's', { type: 'search' });
  if (st.pendingSixthSense) {
    const keep = st.pendingSixthSense.cardIds[0];
    tryIt(st, 's', { type: 'resolveSixthSense', cardId: keep });
  }
  void p;
  return err;
});

console.log('=== ⑤ 使用遗物「洞察之球」（特殊行动） ===');
caseOne('依次摸两张', '使用遗物「洞察之球」', () => {
  const st = mkDuo();
  const p = survOf(st);
  p.roomId = 'B5';
  giveRelic(st, p, 'relic_insight');
  return st;
}, (st) => {
  return tryIt(st, 's', { type: 'useInsightOrb' });
});

console.log('=== ⑥ 古代护符 / 守護之石 ===');
{
  /** ⑥-1 遭遇**外**的伤害：出示护符 → 杀手看不到 */
  const st = mkDuo();
  const p = survOf(st);
  p.items = { ...p.items, amulet: 1 };
  st.phase = 'killerMain';
  const from = marks(st);
  applyDamage(st, p.id, 1, st.killerId);
  const pending1 = st.pendingAmulet?.relic ?? null;
  tryIt(st, 's', { type: 'confirmAmulet', use: true });
  const { k, s } = newLogs(st, from);
  console.log(`  遭遇外：询问的是 ${pending1 === 'guard' ? '守護之石' : '古代护符'}；` +
    `杀手新增 ${k.length} 条`);
  ok(pending1 === null, '**遭遇外先问古代护符**', String(pending1));
  ok(!has(k, '古代护符'), '**杀手看不到"出示古代护符"**',
    k.filter((t) => t.includes('护符')).join(' | '));
  ok(has(s, '古代护符'), '幸存者看得到');

  /** ⑥-2 护符放弃 → 接着问守護之石（用户口径） */
  const st2 = mkDuo();
  const p2 = survOf(st2);
  p2.items = { ...p2.items, amulet: 1, relic_guard: 1 };
  st2.phase = 'killerMain';
  applyDamage(st2, p2.id, 1, st2.killerId);
  const firstAsk = st2.pendingAmulet?.relic ?? null;
  tryIt(st2, 's', { type: 'confirmAmulet', use: false });
  const secondAsk = st2.pendingAmulet?.relic ?? null;
  console.log(`  两张都有：先问 ${firstAsk === 'guard' ? '守護之石' : '古代护符'}，` +
    `放弃后问 ${secondAsk === 'guard' ? '守護之石' : '（没有）'}`);
  ok(firstAsk === null, '先问古代护符', String(firstAsk));
  ok(secondAsk === 'guard', '**放弃护符后接着问守護之石**', String(secondAsk));

  /**
   * ⑥-3 遭遇**中**的直伤：只问守護之石，而且**双方都看得到**。
   *
   * ⚠ 这里不造完整 `encounter` 快照（那需要一整套字段），
   * 改成：按阶段判定 + 直接查"这条战报的可见性"。
   */
  const { survivorActionVis } = await import('../../server/dist/game/effects.js');
  ok(survivorActionVis({ phase: 'encounter' }) === 'all',
    '**遭遇中 → 公开**', String(survivorActionVis({ phase: 'encounter' })));
  ok(survivorActionVis({ phase: 'survivorMain' }) === 'survivor',
    '幸存者大回合 → 只给幸存者', String(survivorActionVis({ phase: 'survivorMain' })));
  ok(survivorActionVis({ phase: 'killerMain' }) === 'survivor',
    '杀手回合里发生的幸存者动作 → 也只给幸存者',
    String(survivorActionVis({ phase: 'killerMain' })));

  const st3 = mkDuo();
  const p3 = survOf(st3);
  p3.items = { ...p3.items, amulet: 1, relic_guard: 1 };
  st3.phase = 'encounter';
  applyDamage(st3, p3.id, 1, st3.killerId);
  const askInEnc = st3.pendingAmulet?.relic ?? null;
  const before3 = st3.logs.length;
  tryIt(st3, 's', { type: 'confirmAmulet', use: true });
  const fresh3 = st3.logs.slice(before3);
  const publicLine = fresh3.find((l) => String(l.text).includes('守護之石'));
  console.log(`  遭遇中：问的是 ${askInEnc === 'guard' ? '守護之石' : '古代护符'}；` +
    `新战报可见性=${publicLine?.vis}`);
  ok(askInEnc === 'guard', '**遭遇中只问守護之石**（护符遭遇里不能出示）', String(askInEnc));
  ok(Boolean(publicLine) && publicLine.vis === 'all',
    '**遭遇中的出示，杀手看得到**（vis=all）', String(publicLine?.vis));
}

console.log('=== ⑦ 凯莱布「幸运币」（幸存者技能，弃掉非钥匙） ===');
{
  const st = mkDuo('crypt', 'killer1', ['survivor8', 'survivor6', 'survivor9']);
  const p = survOf(st, 'survivor8');
  /** 把牌库顶压成一张非钥匙的牌，保证走"弃掉它换移动"那一支 */
  const nonKey = Object.values(st.cardById).find(
    (c) => c.type === 'search' && !(c.effects ?? []).some((e) => e.gainItem === 'key'),
  );
  st.searchDeck = [nonKey.id, ...st.searchDeck.filter((id) => id !== nonKey.id)];
  const from = marks(st);
  const err = tryIt(st, 's', { type: 'useLuckyCoin', actorPlayerId: p.id });
  const { k, s } = newLogs(st, from);
  console.log(`  幸运币：${err ?? 'OK'}；杀手新增 ${k.length} 条`);
  ok(!has(k, '幸运币'), '**杀手看不到幸运币**', k.filter((t) => t.includes('幸运币')).join(' | '));
  ok(has(s, '幸运币'), '幸存者看得到');
}

console.log('=== ⑧ 手提箱（小屋）与急救箱（实验室）都不该告诉杀手 ===');
{
  /** ⑧-1 小屋翻手提箱 */
  const st = mkDuo('cabin');
  const p = survOf(st);
  const room = st.map.tokens.find((t) => t.kind === 'suitcase' || t.kind === '手提箱')?.roomId ?? 'R4';
  p.roomId = room;
  st.suitcaseAvailable = true;
  const from = marks(st);
  const err = tryIt(st, 's', { type: 'useSuitcase' });
  const { k, s } = newLogs(st, from);
  console.log(`  手提箱（${room}）：${err ?? 'OK'}；杀手新增 ${k.length} 条 ${JSON.stringify(k)}`);
  ok(!has(k, '手提箱') && !has(k, '发现牌'),
    '**杀手看不到翻手提箱**', k.join(' | '));
  ok(s.some((t) => t.includes('手提箱') || t.includes('发现牌')),
    '幸存者看得到这次翻牌', s.filter((t) => t.includes('手提箱') || t.includes('发现牌')).join(' | '));

  /** ⑧-2 实验室用急救箱（治疗 + 消除恐惧） */
  const st2 = mkDuo('laboratory');
  const p2 = survOf(st2);
  const aidRoom = st2.map.tokens.find((t) => t.kind === 'firstAidKit' || t.kind === '急救箱')?.roomId ?? 'G3';
  p2.roomId = aidRoom;
  p2.hp = 1;
  p2.fear = 1;
  st2.firstAidKit = true;
  const from2 = marks(st2);
  const err2 = tryIt(st2, 's', { type: 'useFirstAidKit', targetPlayerId: p2.id });
  const logs2 = newLogs(st2, from2);
  console.log(`  急救箱（${aidRoom}）：${err2 ?? 'OK'}；杀手新增 ${logs2.k.length} 条 ` +
    `${JSON.stringify(logs2.k)}`);
  ok(!has(logs2.k, '急救箱') && !has(logs2.k, '治疗'),
    '**杀手看不到用急救箱（含治疗/消恐惧）**', logs2.k.join(' | '));
  ok(has(logs2.s, '急救箱'), '幸存者看得到');
  ok(p2.hp === 2 && p2.fear === 0, '效果照常生效（回血 + 清恐惧）',
    `hp=${p2.hp} fear=${p2.fear}`);
}

console.log('=== ⑨ 必须**照旧公开**的东西不能被误伤 ===');
{
  const st = mkDuo();
  const p = survOf(st);
  st.phase = 'killerMain';
  const from = marks(st);
  /** 响声：杀手必须知道 */
  const { pushNoise } = await import('../../server/dist/game/effects.js');
  pushNoise(st, p.roomId, false, { byPlayerId: p.id });
  /** 伤害：杀手必须知道打中了 */
  applyDamage(st, p.id, 1, st.killerId, { skipAmulet: true, skipResilience: true });
  const { k } = newLogs(st, from);
  console.log(`  杀手新增：${JSON.stringify(k)}`);
  ok(has(k, '受到') || has(k, '倒下'), '**伤害结果照旧给杀手看**');
  /** 搜索那条在幸存者大回合里本来就看不到（默认推断），这里只确认它没变成 all */
  const st2 = mkDuo();
  const p2 = survOf(st2);
  p2.roomId = 'B5';
  const from2 = marks(st2);
  tryIt(st2, 's', { type: 'search', actorPlayerId: p2.id });
  const logs2 = newLogs(st2, from2);
  ok(!has(logs2.k, '搜索'), '**搜索过程照旧不给杀手看**',
    logs2.k.filter((t) => t.includes('搜索')).join(' | '));
}

console.log(`\n幸存者侧战报保密：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
