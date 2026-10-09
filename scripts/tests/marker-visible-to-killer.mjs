/**
 * **欧菲莉亚「鼓励标记」与迪伦「坚毅标记」触发时，要明确告诉杀手**（用户口径）。
 *
 * 要区分两件事：
 *  - **谁身上有标记**：杀手**看不到**（快照里 `hasEncourageToken` / `hasResilienceToken`
 *    对杀手恒为 `false`）—— 这是"只有幸存者一方知道"的信息；
 *  - **标记触发的那一刻**：必须**明确告诉杀手**（点了谁的名、取消了什么），
 *    因为那是"幸存者的状态变化"，杀手按规则必须知道。
 *
 * ⚠ 坚毅标记是**自动使用**的（用户口径：「坚毅标记自动使用」）——
 * 没有"要不要用"的询问那一步（那条死路径已经删掉，见 ④）。
 *
 * 所以这里逐条实测：三种触发路径（恐惧被取消 / 遭遇防御 +1 / 伤害被免除）
 * 在**杀手视角的快照**里到底有没有那一条战报，并且点名的是不是那名幸存者。
 *
 * ⚠ 特别要试**幸存者大回合**：那一段是杀手的"雾"阶段
 * （`killerFogPhase`，`engine.ts:12455`），`vis:'survivor'` 的战报会被滤掉 ——
 * 这两类标记的触发必须走 `vis:'all' + needsCommon` 才透得过去。
 *
 * 跑法：node scripts/tests/marker-visible-to-killer.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction, beginKillerTurn,
} from '../../server/dist/game/engine.js';
import { addFear, applyDamage } from '../../server/dist/game/effects.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 1对1：杀手 h + 幸存者 s（迪伦 survivor9 一定在名单里，坚毅标记才有） */
function mkDuo() {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = HOST;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const survivorList = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
const firstSurvivor = (st) => survivorList(st)[0];
/** 杀手视角看得到的战报文本 */
const killerLogs = (st) => (buildSnapshot(st, HOST).logs ?? []).map((l) => l.text);
/** 杀手视角里某颗棋子的公开信息 */
const killerSees = (st, id) => (buildSnapshot(st, HOST).players ?? []).find((p) => p.id === id);
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/* ═══════════ ① 鼓励标记：取消一次恐惧（发生在幸存者大回合的雾里） ═══════════ */
console.log('=== ① 欧菲莉亚·鼓励标记 → 取消恐惧 ===');
{
  const st = mkDuo();
  const s = firstSurvivor(st);
  st.phase = 'survivorMain';
  s.encourageToken = true;
  s.fear = 0;

  /** 触发前：杀手**不该**知道谁有标记 */
  ok(killerSees(st, s.id)?.hasEncourageToken === false,
    '**触发前杀手看不到"谁有鼓励标记"**', String(killerSees(st, s.id)?.hasEncourageToken));

  addFear(st, s.id, 1);
  const logs = killerLogs(st);
  const line = logs.find((t) => t.includes('鼓励标记'));
  console.log(`   战报：${line ?? '（没有这条）'}`);
  ok(Boolean(line), '**杀手看得到"鼓励标记生效"这条**（幸存者大回合的雾里也看得到）');
  ok(Boolean(line?.includes(s.name)), '**明确点名了是哪名幸存者**', s.name);
  ok(Boolean(line?.includes('取消')), '写清了它做了什么（取消这次恐惧增加）');
  ok(s.fear === 0, '（机制）这次恐惧真的被取消了', `fear=${s.fear}`);
  ok(!s.encourageToken, '（机制）标记用掉了');
  ok(survivorList(st).length >= 1 && (buildSnapshot(st, s.controllerId).logs ?? [])
    .some((l) => l.text.includes('鼓励标记')), '幸存者自己也看得到同一条');
}

/* ═══════════ ② 鼓励标记：遭遇防御 +1 ═══════════ */
console.log('\n=== ② 欧菲莉亚·鼓励标记 → 遭遇防御 +1 ===');
{
  const st = mkDuo();
  const s = firstSurvivor(st);
  s.encourageToken = true;
  s.roomId = 'R1';
  st.phase = 'encounter';
  st.encounter = {
    roomId: 'R1',
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
  const err = tryIt(st, s.controllerId, { type: 'playEncounterDefense', cardId: null, itemId: null });
  console.log(`   防御动作：${err ?? 'OK'}`);
  const logs = killerLogs(st);
  const line = logs.find((t) => t.includes('鼓励标记'));
  console.log(`   战报：${line ?? '（没有这条）'}`);
  ok(Boolean(line), '**杀手看得到"鼓励标记自动生效：本次遭遇防御 +1"**');
  ok(Boolean(line?.includes(s.name)), '**点名了是哪名幸存者**', s.name);
  ok(!s.encourageToken, '（机制）标记用掉了');
}

/* ═══════════ ③ 坚毅标记：免除第一次伤害 ═══════════ */
console.log('\n=== ③ 迪伦·坚毅标记 → 免除伤害 ===');
{
  const st = mkDuo();
  /** 迪伦 = survivor9（坚毅标记是开局发的，先确认他在场） */
  const dylan = survivorList(st).find((p) => p.resilienceToken);
  ok(Boolean(dylan), '（前提）迪伦身上有坚毅标记（开局发的）',
    survivorList(st).map((p) => `${p.name}:${p.resilienceToken ? '有' : '无'}`).join(' '));
  const d = dylan ?? firstSurvivor(st);
  if (!d.resilienceToken) d.resilienceToken = true;

  /** 触发前：杀手同样不该知道 */
  ok(killerSees(st, d.id)?.hasResilienceToken === false,
    '**触发前杀手看不到"谁有坚毅标记"**', String(killerSees(st, d.id)?.hasResilienceToken));

  const hpBefore = d.hp;
  applyDamage(st, d.id, 1, st.killerId ?? undefined);
  const logs = killerLogs(st);
  /**
   * ⚠ 匹配要**精确到"触发"那条** —— 开局还有一条
   * 「迪伦·温 开局获得一个坚毅标记（可防止第一次伤害）。」，
   * 用宽泛的 `includes('坚毅标记')` 会先命中它，测出来的就是假的。
   */
  const line = logs.find((t) => t.includes('自动生效，防止了这次伤害'));
  console.log(`   战报：${line ?? '（没有这条）'}`);
  ok(Boolean(line), '**杀手看得到"坚毅标记自动生效，防止了这次伤害"这条**');
  ok(Boolean(line?.includes(d.name)), '**点名了是哪名幸存者**', d.name);
  ok(d.hp === hpBefore, '（机制）这次伤害真的被免掉了', `${hpBefore} → ${d.hp}`);
  ok(!d.resilienceToken, '（机制）标记用掉了');
  /** 顺带核对：开局那条"谁拿到了坚毅标记"**不该**给杀手看（用户口径：标记算私密） */
  const startLine = logs.find((t) => t.includes('开局获得一个坚毅标记'));
  ok(!startLine, '**开局那条"谁拿到了坚毅标记"杀手看不到**', startLine ?? '（没有这条 = 正确）');
  /** 对照：幸存者自己看得到 */
  const sSee = (buildSnapshot(st, d.controllerId).logs ?? []).map((l) => l.text);
  ok(sSee.some((t) => t.includes('开局获得一个坚毅标记')), '幸存者自己看得到开局那条（对照）');
}

/* ═══════════ ④ 坚毅标记**自动使用**：没有"询问"这条路 ═══════════ */
console.log('\n=== ④ 坚毅标记自动使用（没有询问那一步）===');
{
  /**
   * 用户口径：「**坚毅标记自动使用**」。
   *
   * 以前这里有一套 `pendingResilience` / `confirmResilience` 的"要不要用"流程，
   * 但**全项目没有任何地方给它赋值** —— 是死代码，而且和"自动使用"相反。
   * 已经连状态字段、动作、快照字段、界面面板一起删掉了，所以这里反过来验：
   *  - 伤害一到就直接免掉（③ 已经验了）；
   *  - 服务端里**没有**这个动作了（发过去会被当成未知动作）。
   */
  const st = mkDuo();
  const d = survivorList(st).find((p) => p.resilienceToken) ?? firstSurvivor(st);
  ok(d.resilienceToken === true, '（前提）迪伦身上有坚毅标记', String(d.resilienceToken));
  const unknown = tryIt(st, d.controllerId, { type: 'confirmResilience', use: true });
  console.log(`  发"确认用坚毅标记" → ${unknown ?? '（居然通过了）'}`);
  ok(unknown != null, '**已经没有这个动作了**（自动使用，不需要确认）', String(unknown));
  ok(!('pendingResilience' in st), '服务端状态里也没有 `pendingResilience` 这个字段了');
  ok(buildSnapshot(st, HOST).pendingResilience === undefined,
    '快照里也没有那个字段（杀手/幸存者都不会看到"正在问坚毅标记"）',
    JSON.stringify(buildSnapshot(st, HOST).pendingResilience));
}

/* ═══════════ ⑤ 反面：这两条是"共通信息"，但"谁有标记"永远不给杀手 ═══════════ */
console.log('\n=== ⑤ 反面：触发要说，持有状态不给 ===');
{
  const st = mkDuo();
  const s = firstSurvivor(st);
  const d = survivorList(st).find((p) => p.resilienceToken) ?? s;
  st.phase = 'survivorMain';
  s.encourageToken = true;
  d.resilienceToken = true;
  const kSnap = buildSnapshot(st, HOST);
  const mine = (kSnap.players ?? []).find((p) => p.id === s.id);
  const dSnap = (kSnap.players ?? []).find((p) => p.id === d.id);
  ok(mine?.hasEncourageToken === false, '杀手快照里 `hasEncourageToken` 恒为 false');
  ok(dSnap?.hasResilienceToken === false, '杀手快照里 `hasResilienceToken` 恒为 false');
  /** 对照：幸存者自己那份快照里是 true */
  const sSnap = buildSnapshot(st, s.controllerId);
  ok((sSnap.players ?? []).find((p) => p.id === s.id)?.hasEncourageToken === true,
    '幸存者自己的快照里看得到（对照）');
  ok((sSnap.players ?? []).find((p) => p.id === d.id)?.hasResilienceToken === true,
    '幸存者自己的快照里看得到（对照）');
}

/* ═══════════ ⑥ 杀手回合开始那条"场上有鼓励标记"：只给幸存者 ═══════════ */
console.log('\n=== ⑥ 杀手回合开始时的"场上有鼓励标记"不给杀手 ===');
{
  /**
   * 用户口径：「鼓励标记和迪伦的坚毅标记**只有触发时才告诉杀手**」。
   * 所以"提醒一句场上有标记"这件事只能写在**幸存者**那份战报里 ——
   * 以前它是 `'all', needsCommon`，杀手回合一开始就知道场上有鼓励标记了。
   */
  const st = mkDuo();
  const s = firstSurvivor(st);
  s.encourageToken = true;
  st.phase = 'killerMain';
  beginKillerTurn(st);
  const kLines = killerLogs(st).filter((t) => t.includes('鼓励标记'));
  const sLines = (buildSnapshot(st, s.controllerId).logs ?? [])
    .map((l) => l.text)
    .filter((t) => t.includes('鼓励标记'));
  console.log(`  杀手看到 ${kLines.length} 条"鼓励标记"战报；幸存者看到 ${sLines.length} 条`);
  ok(kLines.length === 0, '**杀手回合开始时不再被告知"场上有鼓励标记"**', kLines.join(' | '));
  ok(sLines.length > 0, '幸存者自己照旧看得到那条提醒（对照）', sLines.join(' | '));
}

console.log(`\n标记触发对杀手可见：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
