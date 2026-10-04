/**
 * 验证 **2对3 同步升级的"等对方"门槛**（用户口径）：
 *   「2v3 中两个杀手同步升级。两名杀手处理完升级效果后都要等待对方
 *     完成本次升级再继续。」
 *
 * 也就是：各自确认、各自结算；两人都做完之前，本次升级不往下走
 * （不会出现"一个人确认、两个人的效果都被结算"）。
 *
 * 跑法：node scripts/tests/2v3-evolution-gate.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
  applyKillerOrderPick,
} from '../../server/dist/game/engine.js';
import { runUpgrade } from '../../server/dist/game/evolution.js';

const content = loadContent();
const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 造一个 2v3 局（摆法抄自 scripts/tests/2v3.mjs） */
function lobby2v3(killerIds = ['killer1', 'killer5']) {
  /**
   * 屠夫（2 级 +1 力量）+ 狼人（3 级 +1 力量、2 级解锁超听觉）。
   *
   * ⚠ **不用女猎手**：她的开局要布陷阱（`trapSetup` 是整体阶段），
   * 会把这一轮的"确认进化"一起挡掉，和本用例要测的门槛无关。
   */
  const st = createLobby('T', 'k1', 'K1', content, 'cabin');
  st.mode = '2v3';
  const map = { k1: st.players['k1'] };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players['k1'].faction = 'killer';
  st.players['k1'].characterId = killerIds[0];
  st.players['k2'].faction = 'killer';
  st.players['k2'].characterId = killerIds[1];
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  /** 先后手偏好：两人都选"先手" → 一致，顺序定下来 */
  st.players['k1'].orderPick = 'first';
  st.players['k2'].orderPick = 'first';
  applyKillerOrderPick(st);
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /**
   * 女猎手开局要先布 4 个陷阱（`trapSetup`），不布完所有操作都会被拦。
   * 本用例测的是**进化门槛**，所以直接把布置标成完成。
   */
  if (st.phase === 'trapSetup' && st.pendingTrapPlacement) {
    st.pendingTrapPlacement.done = true;
    try { handleAction(st, 'k1', { type: 'confirmTrapPlacement' }, content); } catch { /* 忽略 */ }
  }
  return st;
}

const tryIt = (st, who, action) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return e.message; }
};

console.log('=== ① 两名杀手各自确认；先确认的那个不会被"重复结算" ===');
{
  const st = lobby2v3();
  const ids = st.killerIds ?? [];
  console.log(`  两名杀手棋子：${ids.join('、')}`);
  ok(ids.length === 2, '2对3 有两名杀手棋子', `${ids.length}`);
  if (ids.length === 2) {
    const [ka, kb] = ids;
    /** 直接推一级：两名杀手同步升级 */
    runUpgrade(st);
    const ack = st.pendingEvolutionAck;
    console.log(`  升级后：level=${st.killerLevel} ack.toLevel=${ack?.toLevel} ` +
      `killerIds=${JSON.stringify(ack?.killerIds)}`);
    ok(ack?.toLevel === 2, '挂出确认面板（等级 2）', String(ack?.toLevel));
    ok((ack?.killerIds ?? []).length === 2, '**这次升级涉及两名杀手**',
      JSON.stringify(ack?.killerIds));

    /** 先手杀手确认 */
    const whoA = st.killers[ka] ? ka : kb;
    const other = whoA === ka ? kb : ka;
    switch (st.killerId) {
      default:
        break;
    }
    /** 把 current 换成 whoA（模拟轮到他） */
    st.killerId = whoA;
    const beforeA = st.killers[whoA]?.power;
    const beforeB = st.killers[other]?.power;
    const errA = tryIt(st, whoA, { type: 'ackEvolution' });
    console.log(`  第一个确认 → ${errA ?? 'OK'}；` +
      `powerA=${st.killers[whoA]?.power} powerB=${st.killers[other]?.power} ` +
      `ack=${st.pendingEvolutionAck ? '还在' : 'null'} killerId=${st.killerId}`);
    ok(!errA, '第一名杀手确认成功', String(errA ?? ''));
    ok(st.pendingEvolutionAck != null,
      '**确认面板不清空**（还等另一名杀手）', String(Boolean(st.pendingEvolutionAck)));
    ok(st.killerId === other, '**回合切给还没做的那名杀手**', String(st.killerId));
    /**
     * ⚠ **先确认者要"当场"拿到自己的效果**（屠夫 2 级 +1 力量）。
     * 这一条以前漏检过：切人放在结算之前时，先确认的那个人力量会丢。
     */
    const powerNowA = st.killers[whoA]?.power;
    console.log(`    先确认者力量：${beforeA} → ${powerNowA}`);
    ok(powerNowA === (beforeA ?? 0) + 1,
      '**先确认者当场拿到自己的效果**（屠夫 2 级 +1 力量）',
      `${beforeA} → ${powerNowA}`);
    ok(st.killers[other]?.power === beforeB,
      '**另一名杀手的效果还没被结算**（没有被顺带结算）',
      `${beforeB} → ${st.killers[other]?.power}`);

    /** 第二名杀手确认 → 才放行 */
    const errB = tryIt(st, other, { type: 'ackEvolution' });
    console.log(`  第二个确认 → ${errB ?? 'OK'}；` +
      `powerA=${st.killers[whoA]?.power} powerB=${st.killers[other]?.power} ` +
      `ack=${st.pendingEvolutionAck ? '还在' : 'null'}`);
    ok(!errB, '第二名杀手确认成功', String(errB ?? ''));
    ok(st.pendingEvolutionAck == null, '**两人都做完 → 本次升级放行**');
    const snap = buildSnapshot(st, whoA);
    ok(snap != null, '快照可用（没有卡在半路）');
  }
}

console.log('=== ② 单人模式不受影响：一次确认就直接结算 ===');
{
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  /** 用屠夫：他 **2 级就是"力量 +1"**，正好验证"确认后真的结算了" */
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  const before = st.killerPower;
  runUpgrade(st);
  const err = tryIt(st, 'h', { type: 'ackEvolution' });
  console.log(`  单人确认 → ${err ?? 'OK'}；power ${before} → ${st.killerPower} ` +
    `level=${st.killerLevel} ack=${st.pendingEvolutionAck ? '还在' : 'null'}`);
  ok(!err, '单人确认成功', String(err ?? ''));
  ok(st.killerPower === before + 1, '屠夫 2 级力量 +1（确认后真的结算了）',
    `${before} → ${st.killerPower}`);
  ok(st.pendingEvolutionAck == null, '单人一次确认就结算、清空');
}

console.log(`\n2对3 同步升级门槛：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
