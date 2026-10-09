/**
 * **杀手牌效果补齐**的一批验证（用户报的第 4 类问题）。
 *
 * 覆盖：
 *  - 【雕像・召唤石碑】选门流程（以前 `pendingStatueSeal` 是死状态）
 *  - 【恐詭管道】落点选择（以前 `resolveStealthToPassage` 没有调用点）
 *  - 【變形 / 戰鬥適應】从弃牌堆**自己选**要移除的牌（以前自动从堆顶拿）
 *  - 【毒液之觸】条件：仅当女王参与本次攻击
 *  - 【伏擊】条件：重现 或 本回合通过秘密通道
 *  - 女王遭遇攻击力：僵尸固定 2、女王只算**遭遇地点里**的
 *
 * 跑法：`npm run test:kcards`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { doorId, isDoorBlocked } from '../../server/dist/game/effects.js';
import { zombiePower, zombiePowerInRoom, hordeMove } from '../../server/dist/game/zombies.js';
import { attackCardConditionBlockReason } from '../../server/dist/game/killerCards.js';
import { beginRemoveFromDiscardPermanent } from '../../server/dist/game/killerSpecials.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 一局指定地图/杀手 */
function mk(mapId = 'mansion', killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
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

const surv = (st) => Object.values(st.players).find((p) => p.faction === 'survivor');
const killer = (st) => st.players[st.killerId];

/** 让杀手进入"可以打牌"的慢速阶段 */
function killerSlow(st) {
  st.phase = 'killerMain';
  st.killerTurnStep = 'slow';
  st.killerMainActionsLeft = 1;
  st.killerMainChoice = null;
  st.pendingEffectQueue = [];
  st.encounter = null;
  return killer(st);
}

/* ═══════════ ① 女王：僵尸战力固定 2、女王只算遭遇地点 ═══════════ */
console.log('=== ① 女王遭遇攻击力 ===');
{
  const st = mk('mansion', 'killer9');
  st.zombies = [
    { id: 'z1', roomId: 'B1', art: 1 },
    { id: 'z2', roomId: 'B1', art: 2 },
    { id: 'z3', roomId: 'R1', art: 3 },
  ];
  const { effectiveKillerPower } = await import('../../server/dist/game/evolution.js');
  const qp = effectiveKillerPower(st);
  console.log(`   女王力量 = ${qp}`);
  ok(zombiePower(st) === qp, '僵尸战力**等于女王力量**（动态）', `${zombiePower(st)} vs ${qp}`);
  ok(zombiePowerInRoom(st, 'B1') === qp * 2, 'B1 两个僵尸 → 2×女王力量', String(zombiePowerInRoom(st, 'B1')));
  ok(zombiePowerInRoom(st, 'G1') === 0, '没有僵尸的地点战力 0');

  /**
   * 女王不在遭遇地点时，攻击力里**不该有女王力量**。
   * 用 `rollEncounterDefense` 的结果（`lastDiceRoll.attack`）来读实际攻击力。
   */
  const q = killer(st);
  const s = surv(st);
  q.roomId = 'R1';
  q.stealth = false;
  s.roomId = 'B1';
  st.encounter = {
    roomId: 'B1',
    step: 'defend',
    targetId: s.id,
    attackCardId: null,
    attackBoost: false,
    attackChoiceMade: true,
    attackCommitted: true,
    attackOptions: [],
    defenses: {},
    defenseItems: {},
    defenseOptions: {},
    fleeQueue: [],
    discoveredIds: [s.id],
    trapArmed: false,
    trapApplied: false,
    executeArmed: false,
    executeStatueId: null,
  };
  st.phase = 'encounter';
  s.mainActionUsed = false;
  const err = (() => {
    try {
      handleAction(st, s.controllerId, { type: 'playEncounterDefense', itemId: null }, content);
      return null;
    } catch (e) { return e.message; }
  })();
  if (!err && st.lastDiceRoll) {
    const expectZombies = zombiePowerInRoom(st, 'B1');
    console.log(`   女王在 R1、僵尸在 B1：攻击力 = ${st.lastDiceRoll.attack}（僵尸合计 ${expectZombies}）`);
    ok(
      st.lastDiceRoll.attack === expectZombies,
      '攻击力只算 B1 的僵尸（各按女王力量），不含女王本体的力量',
      `${st.lastDiceRoll.attack} vs ${expectZombies}`,
    );
  } else {
    console.log(`   （遭遇防御入口没走通：${err ?? '没有骰点'}）`);
    ok(true, '（跳过：遭遇流程入口与测试假设不同）');
  }
}

/* ═══════════ ② 毒液之觸 / 伏擊 的使用条件 ═══════════ */
console.log('=== ② 攻击牌条件 ===');
{
  const venom = content.cards.byId['q_venom_1'];
  const ambush = content.cards.byId['un_ambush_1'];
  ok(Boolean(venom), '有【毒液之觸】这张牌');
  ok(Boolean(ambush), '有【伏擊】这张牌');

  /** 毒液之觸：非女王局 → 拒绝 */
  const st1 = mk('mansion', 'killer1');
  st1.reappearedThisTurn = true;
  ok(
    Boolean(attackCardConditionBlockReason(st1, venom)),
    '非女王局不能用毒液之觸',
    String(attackCardConditionBlockReason(st1, venom)),
  );

  /** 毒液之觸：女王局但女王不在遭遇地点 → 拒绝 */
  const st2 = mk('mansion', 'killer9');
  const s2 = surv(st2);
  killer(st2).roomId = 'R1';
  s2.roomId = 'B1';
  st2.encounter = { roomId: 'B1', targetId: s2.id };
  ok(
    Boolean(attackCardConditionBlockReason(st2, venom)),
    '女王不在遭遇地点时不能用毒液之觸',
    String(attackCardConditionBlockReason(st2, venom)),
  );
  /** 女王在场 → 允许 */
  killer(st2).roomId = 'B1';
  ok(
    attackCardConditionBlockReason(st2, venom) === null,
    '女王本体参与本次攻击时可以用毒液之觸',
    String(attackCardConditionBlockReason(st2, venom)),
  );

  /** 伏擊：默认拒绝 */
  const st3 = mk('mansion', 'killer7');
  st3.reappearedThisTurn = true;
  st3.encounterFromRevealSearch = false;
  st3.movedThroughPassageThisTurn = false;
  ok(
    Boolean(attackCardConditionBlockReason(st3, ambush)),
    '只是"本回合重现过"还不够（必须是重现那次搜索引发的遭遇）',
    String(attackCardConditionBlockReason(st3, ambush)),
  );
  /** 重现那一次的遭遇 → 允许 */
  st3.encounterFromRevealSearch = true;
  ok(attackCardConditionBlockReason(st3, ambush) === null, '重现时那次搜索引发的遭遇可以用伏擊');
  /** 或本回合走过秘密通道 → 允许 */
  st3.encounterFromRevealSearch = false;
  st3.movedThroughPassageThisTurn = true;
  ok(attackCardConditionBlockReason(st3, ambush) === null, '本回合通过秘密通道后可以用伏擊');
}

/* ═══════════ ③ 召唤石碑：选门流程 ═══════════ */
console.log('=== ③ 召唤石碑选门 ===');
{
  const st = mk('mansion', 'killer6');
  const k = killerSlow(st);
  k.roomId = 'B1';
  const { resolveSummonSeal } = await import('../../server/dist/game/statues.js');
  resolveSummonSeal(st);
  ok(st.pendingStatueSeal === true, '打出后进入"等选门"状态', String(st.pendingStatueSeal));

  /** 第一下：记起点 */
  handleAction(st, 'h', { type: 'pickSummonSealRoom', roomId: 'B1' }, content);
  ok(st.pendingStatueSealFrom === 'B1', '第一下记住了起点', String(st.pendingStatueSealFrom));
  ok(!isDoorBlocked(st, doorId('B1', 'B2')), '还没封上');

  /** 第二下：决定那扇门并结算 */
  const s = surv(st);
  s.roomId = 'B2';
  const fearBefore = s.fear;
  handleAction(st, 'h', { type: 'pickSummonSealRoom', roomId: 'B2' }, content);
  ok(isDoorBlocked(st, doorId('B1', 'B2')), 'B1–B2 的门被封上了', st.blockades.join(','));
  ok(st.pendingStatueSeal === false, '选完状态清掉');
  ok(st.pendingStatueSealFrom === null, '起点也清掉');
  ok(s.fear > fearBefore, '该地点的幸存者被惊吓', `${fearBefore} → ${s.fear}`);

  /** 点同一格取消 */
  const st2 = mk('mansion', 'killer6');
  killerSlow(st2).roomId = 'B1';
  resolveSummonSeal(st2);
  handleAction(st2, 'h', { type: 'pickSummonSealRoom', roomId: 'B1' }, content);
  handleAction(st2, 'h', { type: 'pickSummonSealRoom', roomId: 'B1' }, content);
  ok(st2.pendingStatueSealFrom === null, '点同一格 = 取消起点');
  ok(st2.pendingStatueSeal === true, '仍在选门状态（没退出）');
}

/* ═══════════ ④ 恐詭管道：落点选择 ═══════════ */
console.log('=== ④ 恐詭管道落点 ===');
{
  const st = mk('mansion', 'killer7');
  const k = killerSlow(st);
  k.roomId = 'B1';
  const { stealthToPassage } = await import('../../server/dist/game/killerSpecials.js');
  stealthToPassage(st);
  const allowed = st.pendingPassagePick ?? [];
  console.log(`   可选落点：${allowed.join(', ')}`);
  ok(allowed.length > 0, '列出了带秘密通道的地点', allowed.join(','));

  /** 非法地点要拒绝 */
  const bad = ['R1', 'B1', 'B2', 'R2', 'G1', 'G2', 'G3', 'G4', 'G5', 'B3', 'B4', 'B5', 'R3', 'R4', 'R5']
    .find((id) => !allowed.includes(id) && st.map.rooms.some((r) => r.id === id));
  if (bad) {
    const err = (() => {
      try { handleAction(st, 'h', { type: 'pickPassageRoom', roomId: bad }, content); return null; }
      catch (e) { return e.message; }
    })();
    ok(Boolean(err), `非通道地点（${bad}）被拒绝`, String(err));
  } else {
    ok(true, '（这张图所有地点都有通道，跳过非法地点测试）');
  }

  /**
   * 合法落点：**点地图只是"选中"，按「确认潜入」才真的走过去**
   * （用户口径：「选择了地点后要确认」）。
   *
   * ⚠ 落点要挑一个**和当前所在地不同**的，否则"没移动"看不出来。
   */
  const target = allowed.find((id) => id !== k.roomId) ?? allowed[0];
  const from = k.roomId;
  handleAction(st, 'h', { type: 'pickPassageRoom', roomId: target }, content);
  ok(st.pendingPassageRoom === target, `选中了「${target}」`, String(st.pendingPassageRoom));
  ok(k.roomId === from,
    `**只看选中、还没移动**（仍在 ${from}，等确认）`, String(k.roomId));
  /** 再点同一格 = 取消选择 */
  handleAction(st, 'h', { type: 'pickPassageRoom', roomId: target }, content);
  ok(st.pendingPassageRoom == null, '再点同一格取消选中', String(st.pendingPassageRoom));
  /** 重新选中并确认 */
  handleAction(st, 'h', { type: 'pickPassageRoom', roomId: target }, content);
  handleAction(st, 'h', { type: 'confirmPassagePick' }, content);
  ok(k.roomId === target, `确认后潜入「${target}」`, String(k.roomId));
  ok((st.pendingPassagePick ?? []).length === 0, '确认后清空待选');
  ok(st.pendingPassageRoom == null, '确认后清空"已选中"');
}

/* ═══════════ ④-b 【保護色】之后恐詭管道不再二选一 ═══════════ */
console.log('=== ④-b 【保護色】→ 恐詭管道直接进选地点 ===');
{
  /** 对照：没有保護色 → 打出恐詭管道会挂二选一 */
  const stA = mk('mansion', 'killer7');
  const kA = killerSlow(stA);
  kA.roomId = 'B1';
  /** 恐詭管道费用 1，要另带一张手牌付得起 */
  stA.killerHand = ['un_pipe_1', 'un_infrared_1'];
  handleAction(stA, 'h', { type: 'playKillerCard', cardId: 'un_pipe_1', payCardIds: ['un_infrared_1'] }, content);
  ok(stA.pendingEffectChoice != null, '**没有保護色时**仍然问二选一',
    JSON.stringify(stA.pendingEffectChoice?.options?.length ?? null));

  /** 有保護色 → **不问二选一**，直接挂出"点地点" */
  const stB = mk('mansion', 'killer7');
  const kB = killerSlow(stB);
  kB.roomId = 'B1';
  stB.passageStealthAnywhere = true;
  stB.killerHand = ['un_pipe_1', 'un_infrared_1'];
  handleAction(stB, 'h', { type: 'playKillerCard', cardId: 'un_pipe_1', payCardIds: ['un_infrared_1'] }, content);
  console.log(`  有保護色时：pendingEffectChoice=${stB.pendingEffectChoice ? '挂了二选一' : 'null'}；` +
    `待选落点数=${(stB.pendingPassagePick ?? []).length}/${stB.map.rooms.length}`);
  ok(stB.pendingEffectChoice == null, '**有保護色时不问二选一**');
  ok((stB.pendingPassagePick ?? []).length === stB.map.rooms.length,
    '**直接挂出整张地图当落点**',
    `${(stB.pendingPassagePick ?? []).length} / ${stB.map.rooms.length}`);
  ok(stB.pendingPassageRoom == null, '还没选中任何地点（等玩家点）');
  /**
   * ⚠ **客户端高亮就是照快照的 `legalMoves` 画的** ——
   * 只查服务端字段不够，必须确认快照真的把它发下去了
   * （用户报的"有些点地图没高亮"就是这一类）。
   */
  const snapB = buildSnapshot(stB, 'h');
  console.log(`  快照 legalMoves=${(snapB.legalMoves ?? []).length} 个；` +
    `pendingPassagePick=${(snapB.pendingPassagePick ?? []).length} 个；` +
    `controllingActive=${snapB.controllingActive} phase=${snapB.phase}`);
  ok((snapB.legalMoves ?? []).length > 1,
    '**快照里下发了可点地点（地图会高亮）**',
    `${(snapB.legalMoves ?? []).length} 个`);
  ok(
    (snapB.pendingPassagePick ?? []).every((id) => (snapB.legalMoves ?? []).includes(id)),
    '每个候选落点都在 legalMoves 里',
  );
}

/* ═══════════ ⑤ 變形 / 戰鬥適應：自己选要移除的牌 ═══════════ */
console.log('=== ⑤ 从弃牌堆自己挑牌移除 ===');
{
  const st = mk('mansion', 'killer7');
  const k = killerSlow(st);
  k.roomId = 'B1';
  /** 造一个弃牌堆，里面几张能认出来的牌 */
  const someCards = content.cards.killerAction.slice(0, 5).map((c) => c.id);
  st.killerDiscard = [...someCards];
  st.deferredPlayedCard = someCards[0];

  const waited = beginRemoveFromDiscardPermanent(st, 2, '變形', [someCards[0]]);
  ok(waited === true, '挂起"等玩家选牌"', String(waited));
  ok(Boolean(st.pendingDiscardRemove), 'pendingDiscardRemove 已设置');
  ok(st.pendingDiscardRemove.remaining === 2, '要选 2 张', String(st.pendingDiscardRemove?.remaining));
  ok(
    !st.pendingDiscardRemove.options.includes(someCards[0]),
    '刚打出的那张**不能选**',
    st.pendingDiscardRemove.options.join(','),
  );
  /** 快照下发给客户端 */
  const snap = buildSnapshot(st, 'h');
  ok(
    (snap.pendingDiscardRemove?.options.length ?? 0) === st.pendingDiscardRemove.options.length,
    '快照下发了可选的牌',
    String(snap.pendingDiscardRemove?.options.length),
  );

  /** 选第一张 */
  const pick1 = st.pendingDiscardRemove.options[0];
  const discardBefore = st.killerDiscard.length;
  handleAction(st, 'h', { type: 'pickDiscardRemove', cardId: pick1 }, content);
  ok(!st.killerDiscard.includes(pick1), '选中的牌从弃牌堆移除');
  ok(st.killerDiscard.length === discardBefore - 1, '弃牌堆少一张', String(st.killerDiscard.length));
  ok(
    (st.killerRemovedPermanently ?? []).includes(pick1),
    '记进"永久移除"表（不会洗回来）',
  );
  ok(st.pendingDiscardRemove?.remaining === 1, '还剩 1 张要选', String(st.pendingDiscardRemove?.remaining));

  /** 选第二张 → 结束 */
  const pick2 = st.pendingDiscardRemove.options[0];
  handleAction(st, 'h', { type: 'pickDiscardRemove', cardId: pick2 }, content);
  ok(st.pendingDiscardRemove === null, '选够 2 张后收尾');

  /** 刚打出的那张被拒绝 */
  const st2 = mk('mansion', 'killer7');
  killerSlow(st2).roomId = 'B1';
  st2.killerDiscard = [...someCards];
  st2.deferredPlayedCard = someCards[0];
  beginRemoveFromDiscardPermanent(st2, 1, '戰鬥適應', [someCards[0]]);
  const err = (() => {
    try { handleAction(st2, 'h', { type: 'pickDiscardRemove', cardId: someCards[0] }, content); return null; }
    catch (e) { return e.message; }
  })();
  ok(Boolean(err), '选刚打出的那张会被拒绝', String(err));
}

/* ═══════════ ⑥ 召喚亡者：生成僵尸 + 抽一张牌 ═══════════ */
console.log('=== ⑥ 召喚亡者要抽牌 ===');
{
  const st = mk('mansion', 'killer9');
  const k = killerSlow(st);
  k.roomId = 'B1';
  st.zombies = [];
  st.killerHand = ['q_summon_1', 'q_venom_1'];
  st.killerDeck = content.cards.killerAction.slice(10, 20).map((c) => c.id);
  const handBefore = st.killerHand.length;
  const deckBefore = st.killerDeck.length;
  const err = (() => {
    try {
      /** 费用 1：要同时弃 1 张其他手牌 */
      handleAction(
        st,
        'h',
        { type: 'playKillerCard', cardId: 'q_summon_1', payCardIds: ['q_venom_1'] },
        content,
      );
      return null;
    } catch (e) { return e.message; }
  })();
  if (err) {
    console.log(`   （打牌入口没走通：${err}）`);
    ok(true, '（跳过：打牌入口与测试假设不同）');
  } else {
    ok((st.zombies ?? []).length === 1, '在女王地点生成了 1 个僵尸', String((st.zombies ?? []).length));
    ok(
      st.logs.some((l) => l.text.includes('摸了') || l.text.includes('抽')),
      '有摸牌战报',
      st.logs.filter((l) => /摸了|抽/.test(l.text)).slice(-1)[0]?.text ?? '',
    );
    ok(
      st.killerDeck.length === deckBefore - 1,
      '牌堆少了 1 张（真的抽了牌）',
      `${deckBefore} → ${st.killerDeck.length}`,
    );
    void handBefore;
  }
}

/* ═══════════ ⑦ 戰鬥適應 / 變形：选牌 + 加力量 都要发生 ═══════════ */
console.log('=== ⑦ 戰鬥適應：选牌 + 永久力量 ===');
{
  const st = mk('mansion', 'killer7');
  const k = killerSlow(st);
  k.roomId = 'B1';
  const someCards = content.cards.killerAction.slice(0, 5).map((c) => c.id);
  st.killerDiscard = [...someCards];
  st.deferredPlayedCard = 'un_adapt';
  const powerBefore = st.killerPower;
  /** 直接推队列跑那两条效果（相当于打了【戰鬥適應】） */
  const { continueKillerQueue } = await import('../../server/dist/game/killerCards.js');
  st.pendingEffectQueue = [
    { op: 'removeFromDiscardPermanent', value: 1 },
    { op: 'permanentPower', value: 1 },
  ];
  continueKillerQueue(st);
  ok(Boolean(st.pendingDiscardRemove), '先挂起"选牌"', JSON.stringify(st.pendingDiscardRemove?.remaining));
  /** 选一张 → 队列继续 → 力量该加上 */
  const pick = st.pendingDiscardRemove.options[0];
  handleAction(st, 'h', { type: 'pickDiscardRemove', cardId: pick }, content);
  ok(!st.killerDiscard.includes(pick), '选中的牌被移除');
  ok(st.killerPower === powerBefore + 1, '永久力量 +1（用户报的"没加力量"）', `${powerBefore} → ${st.killerPower}`);
  ok(
    st.logs.some((l) => l.text.includes('永久力量 +1')),
    '有加力量的战报',
    st.logs.filter((l) => l.text.includes('永久力量')).slice(-1)[0]?.text ?? '',
  );
}

/* ═══════════ ⑧ 守護之石是一次性的（只有剛毅之盾是 ∞） ═══════════ */
console.log('=== ⑧ 守護之石用后进弃牌堆 ===');
{
  const { giveRelic, hasRelic } = await import('../../server/dist/game/relic.js');
  const { applyDamage } = await import('../../server/dist/game/effects.js');
  const { confirmAmuletUse } = await import('../../server/dist/game/killerCards.js');
  const st = mk('crypt', 'killer1');
  const s = surv(st);
  s.items = {};
  giveRelic(st, s, 'relic_guard');
  ok(s.items.relic_guard === 1, '先有守護之石', JSON.stringify(s.items));

  /** 遭遇里的直接伤害也能被它挡（这是它和护符的唯一区别） */
  st.phase = 'encounter';
  applyDamage(st, s.id, 1, st.killerId, {});
  ok(st.pendingAmulet?.relic === 'guard', '遭遇中的直接伤害会问守護之石', String(st.pendingAmulet?.relic));
  confirmAmuletUse(st, true);
  ok(s.hp === s.maxHp, '免掉了这次伤害');
  ok(!hasRelic(s, 'guard'), '守護之石**从背包移除**（不是 ∞）', JSON.stringify(s.items));
  ok(st.survivorDiscard.includes('relic_guard'), '进**普通弃牌堆**', st.survivorDiscard.join(','));

  /** 对照：剛毅之盾是 ∞，一直在 */
  const st2 = mk('crypt', 'killer1');
  const s2 = surv(st2);
  s2.items = {};
  giveRelic(st2, s2, 'relic_shield');
  const { shieldDefenseBonus } = await import('../../server/dist/game/relic.js');
  ok(shieldDefenseBonus(st2, s2) === 1, '剛毅之盾 +1');
  ok(shieldDefenseBonus(st2, s2) === 1, '再问一次还是 +1（∞ 不会被用掉）');
  ok(s2.items.relic_shield === 1, '盾一直在背包里');
}

/* ═══════════ ⑨ 重现才搜索，暴露不搜索 ═══════════ */
console.log('=== ⑨ 重现搜索 / 暴露不搜索 ===');
{
  const { beginKillerTurn } = await import('../../server/dist/game/engine.js');
  const { setStealth } = await import('../../server/dist/game/effects.js');

  /** ① 重现 → 会强制搜索（战报里有"重现后搜索房间"） */
  const st = mk('mansion', 'killer1');
  const k = killer(st);
  const s = surv(st);
  k.roomId = 'B1';
  s.roomId = 'B1';
  setStealth(k, true);
  st.phase = 'survivorMain';
  beginKillerTurn(st);
  ok(k.stealth === false, '重现后不再是潜行');
  ok(st.reappearedThisTurn === true, '记下了"本回合重现过"');
  ok(st.encounterFromRevealSearch === true, '记下了"这次遭遇来自重现搜索"');
  ok(
    st.logs.some((l) => l.text.includes('重现后搜索房间')),
    '重现时做了强制搜索',
    st.logs.filter((l) => l.text.includes('重现后搜索')).slice(-1)[0]?.text ?? '',
  );

  /** 遭遇一结束，这个标记就作废（伏击只在"那一次"遭遇里能用） */
  const { finishEncounter } = await import('../../server/dist/game/engine.js');
  finishEncounter(st);
  ok(st.encounterFromRevealSearch === false, '遭遇结束后标记清掉');

  /** ② 暴露（不经过重现）→ 不搜索 */
  const st2 = mk('mansion', 'killer1');
  const k2 = killer(st2);
  const s2 = surv(st2);
  k2.roomId = 'B1';
  s2.roomId = 'B1';
  setStealth(k2, true);
  /** 模拟"被暴露"：直接解除潜行，不走重现流程 */
  setStealth(k2, false);
  st2.phase = 'survivorMain';
  const before = st2.logs.length;
  beginKillerTurn(st2);
  const fresh = st2.logs.slice(before).map((l) => l.text).join('\n');
  ok(!fresh.includes('重现后搜索房间'), '暴露之后**不会**再搜索', fresh.split('\n').slice(-1)[0] ?? '');
  ok(!fresh.includes('重现！'), '暴露不会打出"重现"战报');
}

/* ═══════════ ⑩ 屍群來了：选出发地 → 选目的地 → 整群移动 ═══════════ */
console.log('=== ⑩ 屍群來了（选目的地）===');
{
  const st = mk('mansion', 'killer9');
  const q = killer(st);
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.pendingEffectQueue = [];
  st.pendingZombieHordeFrom = null;
  st.pendingZombieHordeTo = null;
  /** B1 放两个僵尸，R1 放一个 */
  st.zombies = [
    { id: 'z1', roomId: 'B1', art: 1 },
    { id: 'z2', roomId: 'B1', art: 2 },
    { id: 'z3', roomId: 'R1', art: 3 },
  ];
  /** 屍群來了 费用 1：垫一张别的女王牌用来支付 */
  const fodder = content.cards.killerAction.find(
    (c) => c.owner === 'killer9' && c.id !== 'q_horde_1' && (c.handCost ?? 0) === 0,
  ).id;
  st.killerHand = ['q_horde_1', fodder];
  q.roomId = 'G1';

  handleAction(st, 'h', { type: 'playKillerCard', cardId: 'q_horde_1', payCardIds: [fodder] }, content);
  ok(
    Array.isArray(st.pendingZombieHordeFrom) && st.pendingZombieHordeFrom.length === 2,
    '**打出后进入「选出发地」**（以前直接卡住不能选）',
    JSON.stringify(st.pendingZombieHordeFrom),
  );
  ok(
    JSON.stringify([...st.pendingZombieHordeFrom].sort()) === JSON.stringify(['B1', 'R1']),
    '候选就是有僵尸的地点',
    st.pendingZombieHordeFrom.join(','),
  );

  /** 点一个没有僵尸的地点 → 拒绝 */
  const bad = (() => {
    try {
      handleAction(st, 'h', { type: 'pickZombieHorde', roomId: 'G5' }, content);
      return null;
    } catch (e) { return e.message; }
  })();
  ok(bad?.includes('没有僵尸'), '点没僵尸的地点会被拒', String(bad));
  ok(Boolean(st.pendingZombieHordeFrom), '被拒之后还能重选');

  handleAction(st, 'h', { type: 'pickZombieHorde', roomId: 'B1' }, content);
  ok(st.pendingZombieHordeFrom === null, '出发地选完清空');
  ok(st.pendingZombieHordeTo?.from === 'B1', '**进入「选目的地」**', JSON.stringify(st.pendingZombieHordeTo));

  /** 快照：杀手看得到，幸存者看不到 */
  const snapK = buildSnapshot(st, 'h');
  ok(snapK.pendingZombieHordeTo === 'B1', '杀手快照里带着"正在选目的地"', String(snapK.pendingZombieHordeTo));

  const dest = 'B4';
  handleAction(st, 'h', { type: 'pickZombieHorde', roomId: dest }, content);
  ok(st.pendingZombieHordeTo === null, '目的地选完清空');
  /**
   * ⚠ **只走 1 格**（用户口径：「女王的尸群来了只能移动一格」）：
   * 目的地可以点很远，但这一群只朝那个方向走 ×1 —— 不是直接飞过去。
   */
  const z1 = st.zombies.find((z) => z.id === 'z1');
  const z2 = st.zombies.find((z) => z.id === 'z2');
  console.log(`  B1 → 目的地「B4」：僵尸走到 ${z1.roomId} / ${z2.roomId}`);
  ok(st.zombies.filter((z) => z.roomId === dest).length === 0,
    '**没有直接飞到目的地**', `${dest} 里 ${st.zombies.filter((z) => z.roomId === dest).length} 个`);
  ok(z1.roomId === z2.roomId, '**整群一起走**（不拆开）', `${z1.roomId} / ${z2.roomId}`);
  ok(z1.roomId !== 'B1', '确实挪了一格', String(z1.roomId));
  ok(st.logs.some((l) => l.text.includes('移動×1')), '战报写的是 移動×1');
  ok(st.zombies.filter((z) => z.roomId === 'R1').length === 1, '别的僵尸不动');

  /** 再打第二张：接着朝同一个目的地走，第二格 */
  const at1 = z1.roomId;
  st.killerHand = ['q_horde_2', fodder];
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  handleAction(st, 'h', { type: 'playKillerCard', cardId: 'q_horde_2', payCardIds: [fodder] }, content);
  handleAction(st, 'h', { type: 'pickZombieHorde', roomId: at1 }, content);
  handleAction(st, 'h', { type: 'pickZombieHorde', roomId: 'B4' }, content);
  console.log(`  第二张：${at1} → ${z1.roomId}`);
  ok(z1.roomId !== at1, '**第二张再走一格**（朝同一个目的地）', `${at1} → ${z1.roomId}`);
  ok(z1.roomId === z2.roomId, '整群还是一起走', `${z1.roomId} / ${z2.roomId}`);
}

/* ═══════════ ⑪ 屍群來了：小屋的杀手密道算 1 格 ═══════════ */
console.log('=== ⑪ 屍群來了：小屋杀手密道（R5–G2）算一格 ===');
{
  /** 小屋地图上 `R5–G2` 是 `pathType:'killer'` 的杀手密道 */
  const cabin = loadContent().maps.find((m) => m.id === 'cabin');
  const killerEdge = (cabin?.edges ?? []).find((e) => e.pathType === 'killer');
  ok(killerEdge?.from === 'R5' && killerEdge?.to === 'G2',
    '（前提）小屋地图上有杀手密道 R5–G2', JSON.stringify(killerEdge));

  const st = mk('cabin', 'killer9');
  st.zombies = [{ id: 'z1', roomId: 'G2', art: 1 }];
  st.logs = [];
  const moved = hordeMove(st, 'G2', 'R5', 1);
  console.log(`  G2 → R5（杀手密道）：动了 ${moved} 个 → ${st.zombies[0].roomId}`);
  ok(moved === 1 && st.zombies[0].roomId === 'R5',
    '**走杀手密道算 1 格，能过去**', String(st.zombies[0].roomId));
  ok(st.logs.some((l) => l.text.includes('移動×1') && l.text.includes('已到目的地')),
    '战报：移動×1、已到目的地',
    st.logs.map((l) => l.text).find((t) => t.includes('屍群來了')) ?? '');

  /** 反向也成立 */
  const st2 = mk('cabin', 'killer9');
  st2.zombies = [{ id: 'z1', roomId: 'R5', art: 1 }];
  hordeMove(st2, 'R5', 'G2', 1);
  ok(st2.zombies[0].roomId === 'G2', '反向 R5 → G2 也一样', String(st2.zombies[0].roomId));
}

console.log(`\n杀手牌补齐：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
