/**
 * 核对「杀手该知道什么」（只读，不改游戏代码）。
 *
 * 作者给的规则：
 *   · 杀手大回合开始时要报告：发出响声的地点 / 被拆除的封堵 / 受到治疗的幸存者
 *   · 整轮中立即向杀手报告：封堵的改变 / 幸存者状态变化（健康・恐惧）/
 *     机关大门的放置 / 钥匙的发现 / 警车的移动
 *   · **只说现象，不说谁做的，也不说是什么造成的，只说表面上发生了什么变化**
 *
 * 做法：在**幸存者大回合**里逐个制造这些事件（能走真实动作的走真实动作），
 * 然后看**杀手视角快照**（`buildSnapshot(state,'h').roundLogs` —— 他界面上
 * 地图旁边那一块）里到底有没有。
 *
 * ⚠ 这个脚本以前只**打印**结果、不判失败（`killer-common-info.mjs` 早期版本）。
 * 现在每条都有断言：该看见的必须看见、该保密的必须看不见，与规则不符就退出码 1。
 *
 * 跑法：node scripts/tests/killer-common-info.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction, startRound,
} from '../../server/dist/game/engine.js';
import {
  addFear, applyDamage, applyHeal, isKeyCard,
} from '../../server/dist/game/effects.js';
import { applyRelicKey } from '../../server/dist/game/relic.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** 1对1，停在「幸存者大回合」—— 这正是"该不该透给杀手"最吃紧的时候 */
function newDuoInSurvivorPhase(mapId = 'cabin') {
  const st = createLobby('T', HOST, 'H', content, mapId);
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
  st.phase = 'survivorMain';
  /**
   * ⚠ **先选一个小回合的人**：不选的话 `activeSurvivorId` 是空的，
   * 幸存者的真实动作（搜索/移动/拆封堵…）全会被 `assertActive` 挡成"还没轮到你"。
   */
  const first = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  if (first) {
    try {
      handleAction(st, first.controllerId, { type: 'pickSurvivorTurn', playerId: first.id }, content);
    } catch { /* 已经在跑就直接用 */ }
  }
  return st;
}

/**
 * 杀手视角"本大回合战报"（他界面上地图旁边那一块）。
 * ⚠ `roundLogs` 是**字符串数组**（`engine.ts:12511` 已经 `.map(l => l.text)`），
 * 不是 LogEntry 对象 —— 早期这里按对象取 `.text`，取回来全是 `undefined`。
 */
const killerSees = (st) => buildSnapshot(st, HOST).roundLogs ?? [];
const firstSurvivor = (st) => Object.values(st.players).find((p) => p.faction === 'survivor');
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/**
 * 制造一个事件，返回"杀手新看到的那几条"。
 * @param expect 'visible' 该看见 / 'hidden' 该保密
 */
function probe(label, fn, expect = 'visible', must = [], mustNot = []) {
  const st = newDuoInSurvivorPhase();
  /**
   * ⚠ 用**集合差**、不要用 `after.slice(before.length)` ——
   * `roundLogs` 是按"当前大回合"过滤的，像"警车推进"那种会**换回合**的事件
   * 会让前后两份列表整个换掉，按下标切片正好把新回合的第一条（就是它）切掉。
   */
  const before = new Set(killerSees(st));
  let err = null;
  try { fn(st, content); } catch (e) { err = String(e?.message ?? e); }
  const added = killerSees(st).filter((t) => !before.has(t));
  const joined = added.join('\n');
  console.log(`\n  【${label}】${err ? `（制造事件时出错：${err}）` : ''}`);
  for (const t of added) console.log(`     杀手看到：${t}`);
  if (!added.length) console.log('     杀手**什么也没看到**');

  const visible = added.length > 0;
  if (expect === 'visible') {
    ok(visible, `**该报告的事件报告了**：${label}`);
    for (const m of must)
      ok(joined.includes(m), `　　措辞里要有「${m}」`);
  }
  else {
    ok(!visible, `**该保密的没漏**：${label}`);
  }
  for (const m of mustNot)
    ok(!joined.includes(m), `　　**不能出现「${m}」**`);
  return { st, added, err };
}

console.log('=== 在幸存者大回合里逐个制造事件，看杀手能不能看到 ===');

/* ① 响声：`pushNoise` 只记进 `state.noises`、**本身不写战报** ——
 *    它是走**响声阶段**统一报告的（可见性由响声阶段那套负责），所以这里不测。 */

probe('① 幸存者受伤（健康变化）', (st) => {
  const p = firstSurvivor(st);
  /** ⚠ 先排除两种免伤，否则伤害根本没结算：古代护符会挂起询问、坚毅标记会直接挡掉 */
  p.items = {};
  p.resilienceToken = false;
  applyDamage(st, p.id, 1, 'probe');
}, 'visible', ['受到 1 点伤害']);

probe('② 幸存者获得恐惧（恐惧变化）', (st) => {
  addFear(st, firstSurvivor(st).id, 1);
}, 'visible', ['获得恐惧标记']);

probe('③ 幸存者受到治疗（恢复生命）', (st) => {
  const p = firstSurvivor(st);
  p.hp = Math.max(1, p.maxHp - 1);   // 先弄伤，才有得治
  applyHeal(st, p.id, 1);
}, 'visible', ['受到治疗'], ['草药', '急救箱']);

probe('④ 钥匙的发现（普通路径：搜索抽到钥匙）', (st) => {
  const p = firstSurvivor(st);
  const room = st.map.rooms.find((r) => (r.tags ?? []).includes('searchable'));
  if (!room) throw new Error('地图上没有可搜索的地点');
  p.roomId = room.id;
  /** 把搜索牌库顶换成一张真钥匙，再走**真实动作** `search` */
  const keyId = Object.keys(st.cardById).find((id) => isKeyCard(st.cardById[id]));
  if (!keyId) throw new Error('内容里找不到钥匙卡');
  st.searchDeck = st.searchDeck.filter((id) => id !== keyId);
  st.searchDeck.unshift(keyId);
  const err = tryIt(st, p.controllerId, { type: 'search' });
  if (err) throw new Error(`实际拒绝原因：${err}`);
}, 'visible', ['钥匙放入钥匙架']);

/* ═══════════ ⑤ 机关大门的放置：要单独开一局城堡 ═══════════ */
console.log('\n  【⑤ 机关大门的放置（城堡）】');
{
  const st = newDuoInSurvivorPhase('castle');
  const p = firstSurvivor(st);
  /** 控制杆房间（`LEVER_ROOM = 'R1'`）+ 一扇白门 */
  p.roomId = 'R1';
  const gate = (st.map.edges ?? []).find(
    (e) => (e.pathType ?? 'door') === 'door' && (e.from === 'R1' || e.to === 'R1'),
  );
  const err = gate
    ? tryIt(st, p.controllerId, {
      type: 'placeLeverGate', actorPlayerId: p.id, fromRoomId: gate.from, toRoomId: gate.to,
    })
    : '地图上找不到与控制杆相连的白门';
  console.log(`     放置动作：${err ?? 'OK'}`);
  const seen = killerSees(st);
  const line = seen.find((t) => t.includes('机关大门'));
  console.log(`     杀手看到：${line ?? '（没有这条）'}`);
  ok(!err, '（前提）机关大门放得下去', err ?? '');
  ok(Boolean(line), '**该报告的事件报告了**：机关大门的放置');
  ok(Boolean(line?.includes('机关大门')), '　　写清了那是机关大门');
  ok(!seen.join('\n').includes(p.name),
    `　　**不能出现操作者名字「${p.name}」**（"只说现象、不说谁做的"）`);
}

probe('⑥ 封堵的改变（幸存者拆掉一扇封堵）', (st) => {
  const p = firstSurvivor(st);
  const e = (st.map.edges ?? []).find((x) => (x.pathType ?? 'door') === 'door');
  const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
  st.blockades = [key];
  /** 拆封堵要求"人在那扇门的一侧" */
  p.roomId = e.from;
  const err = tryIt(st, p.controllerId, { type: 'removeBlockade' });
  if (err) throw new Error(`实际拒绝原因：${err}`);
}, 'visible', ['封堵']);

probe('⑦ 警车的移动（修理完成后每个大回合开一格）', (st) => {
  st.rescueArmed = true;
  st.rescueCountdown = 4;
  startRound(st);
}, 'visible', ['警车开到 3']);

console.log('\n=== 对照：这些本来就该保密的 ===');
probe('⑧ 幸存者搜索到了什么（不该透）', (st) => {
  const p = firstSurvivor(st);
  const room = st.map.rooms.find((r) => (r.tags ?? []).includes('searchable'));
  if (room) p.roomId = room.id;
  /** 牌库顶换成**不是钥匙**的牌，免得"钥匙上架"那条（那条本来就该给杀手）混进来 */
  const notKey = Object.keys(st.cardById).find(
    (id) => st.searchDeck.includes(id) && !isKeyCard(st.cardById[id]),
  );
  if (notKey) {
    st.searchDeck = st.searchDeck.filter((id) => id !== notKey);
    st.searchDeck.unshift(notKey);
  }
  const err = tryIt(st, p.controllerId, { type: 'search' });
  if (err) throw new Error(`实际拒绝原因：${err}`);
}, 'hidden');

probe('⑨ 幸存者走到哪（不该透）', (st) => {
  const p = firstSurvivor(st);
  const to = (st.map.edges ?? []).find((e) => e.from === p.roomId)?.to;
  if (!to) throw new Error('没有可走的相邻地点');
  const err = tryIt(st, p.controllerId, { type: 'move', toRoomId: to });
  if (err) throw new Error(`实际拒绝原因：${err}`);
}, 'hidden');

/* ═══════════ ⑩ 每局游戏开始时清空战报（用户口径） ═══════════ */
console.log('\n=== ⑩ 每局开始时清空战报 ===');
{
  /** 先进大厅：这一路会写「房间 X 已创建。」这类开局之前的战报 */
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  const lobbyText = st.logs.map((l) => l.text).join('\n');
  console.log(`   开局之前战报 ${st.logs.length} 条：${lobbyText.replace(/\n/g, ' | ')}`);
  ok(lobbyText.includes('已创建'), '（前提）大厅阶段确实写了战报', `${st.logs.length} 条`);

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

  const after = st.logs.map((l) => l.text);
  console.log(`   开局之后战报 ${after.length} 条`);
  ok(!after.some((t) => t.includes('已创建')), '**大厅那几条被清掉了**',
    after.filter((t) => t.includes('已创建')).join(' / ') || '（没有残留）');
  /**
   * ⚠ 清空**不能连开局准备一起清掉** —— 每个棋子的开局准备
   * （起始物品 / 手牌 / 「迪伦 开局获得一个坚毅标记」）跑在清空**之后**，
   * 所以要能在战报里找到它们（在幸存者视角里找，那几条是 `vis:'survivor'`）。
   */
  const sText = (buildSnapshot(st, bs.controllerId).logs ?? []).map((l) => l.text).join('\n');
  ok(sText.includes('坚毅标记'), '**开局准备那几条留着**（迪伦的坚毅标记还在战报里）');
  ok(after.length > 0, '**不是清成一片空白**：新一局的战报照常往下写', `${after.length} 条`);
}

console.log(`\n════════ 汇总 ════════`);
console.log(`「杀手该知道什么」：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
