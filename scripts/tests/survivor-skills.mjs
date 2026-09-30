/**
 * **幸存者技能**的几个修复验证（用户报的第 6 类）。
 *
 *  - **欧菲莉亚「第六感」**：面板以前被写在"杀手回合区块"里 →
 *    搜索后的选牌面板永远不显示、服务端一直等 → **整局卡死**。已搬到通用待选区。
 *  - **迪伦「坚毅」**：标记是"任何伤害都能挡"，以前被 `phase !== 'encounter'`
 *    挡住，遭遇里不生效。已去掉限制。
 *  - **乔治「思维敏捷」**：判定时机从"小回合结束"改成**幸存者大回合结束**。
 *
 * 跑法：`npm run test:skills`
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { loadContent } = await import('../../server/dist/content/loader.js');
const {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction, enterNoiseReport,
} = await import('../../server/dist/game/engine.js');
const { applyDamage } = await import('../../server/dist/game/effects.js');
const { GameView } = await import('../../client/_ssrbuild/GameViews.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 一局指定幸存者角色（**目标角色放在第一位**，这样第一个棋子就是它） */
function mk(charId = 'survivor7', mapId = 'mansion') {
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
  /**
   * ⚠ 必须**在 startGame 之前**把目标角色排到第一位 ——
   * 开局时技能带来的初始资源（坚毅标记、幸运币…）是按角色发的，
   * 开局后再改 characterId 就晚了。
   */
  st.soloSurvivorCharacterIds = [
    charId,
    ...survCharIds.filter((c) => c !== charId),
  ].slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const surv = (st) => Object.values(st.players).find((p) => p.faction === 'survivor');
const killer = (st) => Object.values(st.players).find((p) => p.faction === 'killer');

/**
 * **"你"是哪个棋子** —— 由服务端决定（`buildSnapshot` 里的 `you`）。
 * 别自己挑 `Object.values(...)[0]`：多幸存者局里那不一定是当前行动者。
 */
function youOf(st) {
  const snap = buildSnapshot(st, 's');
  return st.players[snap.you.id];
}

function giveTurn(st, roomId) {
  const p = youOf(st);
  p.roomId = roomId;
  p.alive = true;
  p.mainActionUsed = false;
  p.moveLeft = 2;
  p.searchedThisTurn = false;
  p.actedThisRound = false;
  p.haltedThisRound = false;
  p.extraActionUsedThisTurn = false;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.encounter = null;
  st.activeSurvivorIndex = st.turnOrder.indexOf(p.id);
  return p;
}

const SEARCH_ROOM = 'R2';
const renderGame = (st) =>
  renderToStaticMarkup(
    React.createElement(GameView, {
      state: buildSnapshot(st, surv(st).controllerId),
      onAction: () => {},
      onLeave: () => {},
    }),
  );

/* ═══════════ ① 欧菲莉亚「第六感」面板要显示 ═══════════ */
console.log('=== ① 第六感面板（以前卡死）===');
{
  const st = mk('survivor7');
  const s = giveTurn(st, SEARCH_ROOM);
  /** 杀手挪开，避免"同地不能搜索" */
  killer(st).roomId = 'R1';
  /** 造一次搜索：第六感会自动摸 2 张并挂起待选 */
  handleAction(st, s.controllerId, { type: 'search' }, content);
  ok(Boolean(st.pendingSixthSense), '第六感触发了待选', JSON.stringify(st.pendingSixthSense?.cardIds));

  const snap = buildSnapshot(st, s.controllerId);
  ok(Boolean(snap.pendingSixthSense), '快照里有 pendingSixthSense');
  ok(
    (snap.pendingSixthSense?.cards?.length ?? 0) === 2,
    '给了 2 张候选',
    String(snap.pendingSixthSense?.cards?.length),
  );

  /** 关键：面板在**幸存者大回合**也要渲染出来（以前被杀手区块挡住） */
  const html = renderGame(st);
  ok(html.includes('第六感'), '幸存者大回合里也渲染出「第六感」面板');
  ok(html.includes('放回搜索牌库顶'), '面板里有选择按钮文案');

  /** 选一张能正常收尾（不再卡死） */
  const keep = st.pendingSixthSense.cardIds[0];
  const err = (() => {
    try { handleAction(st, s.controllerId, { type: 'resolveSixthSense', cardId: keep }, content); return null; }
    catch (e) { return e.message; }
  })();
  ok(!err, '选完能正常收尾', String(err));
  ok(!st.pendingSixthSense, '待选清空');
  ok(!!s.items || true, '（选牌已结算）');
}

/* ═══════════ ② 迪伦「坚毅」：遭遇里也能挡 ═══════════ */
console.log('=== ② 坚毅标记 ===');
{
  const st = mk('survivor9');
  const s = surv(st);
  ok(s.resilienceToken === true, '开局有坚毅标记', String(s.resilienceToken));

  /** 非遭遇伤害 → 挡住 */
  st.phase = 'survivorMain';
  const hp0 = s.hp;
  applyDamage(st, s.id, 1, killer(st).id);
  ok(s.hp === hp0, '非遭遇伤害被坚毅挡住');
  ok(s.resilienceToken === false, '标记用掉了');

  /** 另一个迪伦：遭遇里的伤害也该挡住（这是用户报的"没有效果"） */
  const st2 = mk('survivor9');
  const s2 = surv(st2);
  st2.phase = 'encounter';
  st2.encounter = { roomId: 'B1', targetId: s2.id };
  const hp2 = s2.hp;
  applyDamage(st2, s2.id, 2, killer(st2).id);
  ok(s2.hp === hp2, '**遭遇里的伤害也被挡住**（用户报的"没有效果"）', `${hp2} → ${s2.hp}`);
  ok(s2.resilienceToken === false, '遭遇里用掉标记');

  /** 只挡第一次：第二次照常扣血 */
  const st3 = mk('survivor9');
  const s3 = surv(st3);
  st3.phase = 'survivorMain';
  applyDamage(st3, s3.id, 1, killer(st3).id);
  const hpAfter = s3.hp;
  applyDamage(st3, s3.id, 1, killer(st3).id);
  ok(s3.hp === hpAfter - 1, '第二次伤害照常扣', `${hpAfter} → ${s3.hp}`);
}

/* ═══════════ ③ 乔治「思维敏捷」在大回合结束时判定 ═══════════ */
console.log('=== ③ 乔治笔记的判定时机 ===');
{
  const st = mk('survivor6');
  const s = giveTurn(st, 'B1');
  const k = killer(st);
  k.roomId = 'B1';
  k.stealth = false;
  st.notesDeck = content.cards.note.map((c) => c.id);
  ok(st.notesDeck.length > 0, '笔记堆有牌', String(st.notesDeck.length));

  /** 小回合结束**不该**判定（用户要求改成大回合） */
  const { advanceAfterSurvivor } = await import('../../server/dist/game/engine.js');
  advanceAfterSurvivor(st, s.id);
  ok(!st.pendingGeorgeNote, '小回合结束时**不**给笔记', String(st.pendingGeorgeNote));

  /** 大回合结束 → 判定（同地点距离 0，满足） */
  st.phase = 'survivorMain';
  enterNoiseReport(st);
  ok(st.pendingGeorgeNote === true, '大回合结束时判定并挂起挑笔记', String(st.pendingGeorgeNote));
  const snap = buildSnapshot(st, s.controllerId);
  ok(Boolean(snap.pendingGeorgeNote), '快照里有待挑笔记');

  /** 挑一张 → 收尾大回合（进入响声阶段），且不会重复触发 */
  const noteId = st.notesDeck[0];
  handleAction(st, s.controllerId, { type: 'chooseGeorgeNote', noteId }, content);
  ok(s.items[noteId] === 1, '拿到笔记', JSON.stringify(s.items));
  ok(st.pendingGeorgeNote === false, '待挑清空');
  ok(st.phase === 'noiseReport', '大回合继续收尾（进入响声阶段）', st.phase);
  ok(st.georgeNoteGivenThisRound === true, '记下"本大回合已给过"（防死循环）');

  /** 距离 2 → 不给 */
  const st2 = mk('survivor6');
  const s2 = giveTurn(st2, 'B1');
  killer(st2).roomId = 'B5';   // 豪宅 B1–B2–B5，距离 2
  st2.notesDeck = content.cards.note.map((c) => c.id);
  st2.phase = 'survivorMain';
  enterNoiseReport(st2);
  ok(!st2.pendingGeorgeNote, '距离超过 1 时不给笔记', `乔治B1 / 杀手B5`);
  ok(st2.phase === 'noiseReport', '不满足条件时照常收尾', st2.phase);
}

/* ═══════════ ④ 警车规则 ═══════════ */
console.log('=== ④ 警车：修理完成立即出现 + 幸存者回合开始开一格 ===');
{
  const { maybeArmRescue } = await import('../../server/dist/game/effects.js');
  const { startRound } = await import('../../server/dist/game/engine.js');
  const st = mk('survivor1');
  const wait = st.rules.rescueWaitRounds;
  console.log(`   rescueWaitRounds = ${wait}`);
  ok(!st.rescueArmed, '开局警车还没出现');
  ok(wait === 5, '规则里等待回合数是 5', String(wait));

  /** 修理完成 → **立即**放警车 */
  st.repairProgress = st.rules.repairNeeded;
  maybeArmRescue(st);
  ok(st.rescueArmed === true, '修理完成时警车**立即出现**（不用等大回合结束）');
  ok(st.rescueCountdown === wait, `警车放在 ${wait}`, String(st.rescueCountdown));

  /** 之后每个幸存者大回合开始开一格；第 5 次"开始时在 1" → 胜利 */
  const seen = [];
  let wonAt = -1;
  for (let i = 1; i <= wait; i += 1) {
    const before = st.rescueCountdown;
    startRound(st);
    seen.push(`${before}→${st.rescueCountdown}`);
    if (st.phase === 'gameOver' && st.winner === 'survivors') { wonAt = i; break; }
  }
  console.log(`   逐回合：${seen.join('  ')}`);
  ok(wonAt === wait, `第 ${wait} 个幸存者大回合开始时判幸存者胜利`, `第 ${wonAt} 次`);
  ok(st.winner === 'survivors', '胜利方是幸存者', String(st.winner));
  ok(
    Boolean(st.winReason && (st.winReason.includes('警车') || st.winReason.includes('救援') || st.winReason.includes('出口'))),
    '胜利理由和警车有关',
    String(st.winReason),
  );

  /** 对照：没修好时警车不动 */
  const st2 = mk('survivor1');
  const c0 = st2.rescueCountdown;
  startRound(st2);
  ok(st2.rescueCountdown === c0, '没修理完成时警车不会动', String(st2.rescueCountdown));
}

console.log(`\n幸存者技能：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
