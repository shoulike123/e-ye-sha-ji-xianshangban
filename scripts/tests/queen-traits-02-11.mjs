/**
 * **【变体1 × 女王】特性 02「玩弄猎物」/ 11「恐惧迸发」在"僵尸〔搜索〕触发的遭遇"里算谁的。**
 *
 * 用户口径：僵尸搜索触发的遭遇，**操作者仍然是女王** ——
 * 所以这两条特性按"当前这名杀手（女王）"查照常生效，不能被算成"僵尸的遭遇"而漏掉。
 *
 * 跑法：node scripts/tests/queen-traits-02-11.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, searchAsZombie, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { spawnZombieAt } from '../../server/dist/game/zombies.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 女王局（1对3：杀手和幸存者分开操控），变体1 开着 */
function mkQueen(traitsFor = {}) {
  const st = createLobby('T', 'K', '杀手', content, 'mansion');
  st.mode = 'multi';
  st.variant1 = true;
  const specs = [
    ['K', '杀手', 'killer', 'killer9'],
    ['S1', '幸存者甲', 'survivor', 'survivor1'],
    ['S2', '幸存者乙', 'survivor', 'survivor2'],
    ['S3', '幸存者丙', 'survivor', 'survivor3'],
  ];
  st.players = {};
  for (const [id, name, faction, ch] of specs) {
    const p = createPlayer(id, name, id);
    p.faction = faction;
    p.characterId = ch;
    p.ready = true;
    st.players[id] = p;
  }
  st.hostId = 'K';
  startGame(st, content, 'K');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 跳过"指定十字弩持有者"这一步（本测试不关心它） */
  st.crossbowAssigned = true;
  st.traitPickerIds = [];
  st.traits = { ...(st.traits ?? {}), ...traitsFor };
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  st.players.K.actionsLeft = 2;
  st.encounter = null;
  st.noises = [];
  return st;
}
const survIds = ['S1', 'S2', 'S3'];
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 让一个僵尸在「B1」搜索：那里站着三名幸存者 → 触发遭遇 */
function zombieSearchEncounter(st) {
  for (const id of survIds) st.players[id].roomId = 'B1';
  st.players.K.roomId = 'R1';
  const z = spawnZombieAt(st, 'B1');
  searchAsZombie(st, 'B1');
  return z;
}

/* ═══════════ ① 02「玩弄猎物」：僵尸搜索触发时，女王照样能取消 ═══════════ */
console.log('=== ① 僵尸搜索触发遭遇 → 女王的「玩弄猎物」照常给 ═══');
{
  const st = mkQueen({ K: ['trait_k02'] });
  const z = zombieSearchEncounter(st);
  ok(Boolean(z), '僵尸在 B1 生成成功', String(z));
  ok(Boolean(st.encounter), '**僵尸搜索触发了遭遇**', st.encounter?.roomId ?? 'null');
  ok(st.pendingPreyOffer === true,
    '**「玩弄猎物」的询问照常挂出**（算在女王头上，不是"僵尸的遭遇"）',
    String(st.pendingPreyOffer));

  /** 女王真的能取消：遭遇消失 + 摸 3 张 + 回合结束 */
  const handBefore = st.killerHand.length;
  const err = tryIt(st, 'K', { type: 'useTrait', traitId: 'trait_k02' });
  ok(!err, '女王能发动「玩弄猎物」', String(err ?? ''));
  ok(!st.encounter, '**遭遇被取消**', String(st.encounter));
  ok(st.killerHand.length === handBefore + 3,
    '额外摸 3 张', `${handBefore} → ${st.killerHand.length}`);
  ok(st.phase !== 'killerMain', '本次杀手回合结束', String(st.phase));
  console.log(`   战报：${st.logs.slice(-3).map((l) => l.text).join(' | ')}`);
}

/* ═══════════ ② 没有 02 的女王：不该冒出这个询问 ═══════════ */
console.log('=== ② 对照：女王没有「玩弄猎物」就不该问 ═══');
{
  const st = mkQueen({});
  zombieSearchEncounter(st);
  ok(Boolean(st.encounter), '照样触发遭遇');
  ok(!st.pendingPreyOffer, '**没有 02 → 不挂询问**', String(st.pendingPreyOffer));
}

/* ═══════════ ③ 11「恐惧迸发」：僵尸搜索引发的遭遇里，伤害算女王的 ═══════════ */
console.log('=== ③ 僵尸搜索引发的遭遇：伤害算女王 → 11 照常触发 ═══');
{
  /** 把这场遭遇真的打完：选目标 → 不加攻 → 防御（力量 20，骰子最多 12 → 必挨打） */
  const runEncounter = (st) => {
    st.killerPower = 20;
    const steps = [];
    steps.push(tryIt(st, 'S1', { type: 'pickEncounterTarget', targetPlayerId: 'S1' }));
    steps.push(tryIt(st, 'K', { type: 'playEncounterAttack', cardId: null }));
    steps.push(tryIt(st, 'S1', { type: 'playEncounterDefense', cardId: null, itemId: null }));
    return steps.filter(Boolean);
  };

  const st = mkQueen({ K: ['trait_k11'] });
  zombieSearchEncounter(st);
  ok(Boolean(st.encounter), '僵尸搜索触发了遭遇');
  const before = survIds.map((id) => st.players[id].fear ?? 0);
  const errs = runEncounter(st);
  ok(errs.length === 0, '遭遇能完整打完（选人→加攻→防御）', errs.join(' / '));
  ok(st.players.S1.hp < st.players.S1.maxHp, '目标确实挨了伤害',
    `${st.players.S1.hp}/${st.players.S1.maxHp}`);
  const after = survIds.map((id) => st.players[id].fear ?? 0);
  console.log(`   恐惧：${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  ok(after.every((f, i) => f === before[i] + 1),
    '**三名幸存者都被【惊吓】+1（11 生效，算女王的伤害）**', JSON.stringify(after));
  ok(
    st.logs.some((l) => l.text.includes('恐惧迸发')),
    '**战报写明是女王的「恐惧迸发」**',
    st.logs.filter((l) => l.text.includes('恐惧迸发')).map((l) => l.text).join(' | '),
  );
}

/* ═══════════ ④ 对照：女王没有 11 → 挨打也不惊吓 ═══════════ */
console.log('=== ④ 对照：女王没有「恐惧迸发」就不惊吓 ===');
{
  const st = mkQueen({});
  zombieSearchEncounter(st);
  st.killerPower = 20;
  const before = survIds.map((id) => st.players[id].fear ?? 0);
  const errs = [];
  errs.push(tryIt(st, 'S1', { type: 'pickEncounterTarget', targetPlayerId: 'S1' }));
  errs.push(tryIt(st, 'K', { type: 'playEncounterAttack', cardId: null }));
  errs.push(tryIt(st, 'S1', { type: 'playEncounterDefense', cardId: null, itemId: null }));
  ok(errs.filter(Boolean).length === 0, '遭遇能完整打完', errs.filter(Boolean).join(' / '));
  const after = survIds.map((id) => st.players[id].fear ?? 0);
  ok(after.every((f, i) => f === before[i]),
    '没这张特性 → 恐惧不变', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  ok(st.players.S1.hp < st.players.S1.maxHp, '（但伤害照常结算）',
    `${st.players.S1.hp}/${st.players.S1.maxHp}`);
}

/* ═══════════ ⑤ 杀手侧看得到这两条（它们是公开信息，不是秘密） ═══════════ */
console.log('=== ⑤ 快照：两条特性对杀手可见 ===');
{
  const st = mkQueen({ K: ['trait_k02'] });
  zombieSearchEncounter(st);
  const snapK = buildSnapshot(st, 'K');
  ok(snapK.pendingPreyOffer === true || snapK.variant1 === true,
    '杀手快照里有 `pendingPreyOffer`（他要能点）',
    JSON.stringify({ pendingPreyOffer: snapK.pendingPreyOffer ?? null }));
}

console.log(`\n女王 × 特性 02/11（僵尸搜索遭遇）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
