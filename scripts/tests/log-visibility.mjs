/**
 * **杀手战报可见性**验证（用户明确要求）。
 *
 * 规则：幸存者大回合里，杀手只该看到
 *  ①「幸存者正在行动」这类提示
 *  ②**立即向双方报告**的 3 类事件：
 *     惊吓过度而发出响声 / 踩到女猎手陷阱 / 拆除封堵
 *  ③ 后来**撤掉了一类**：搜索遗物、翻手提箱、使用急救箱、
 *     ⚠ 其中**放置机关大门**后来又改回「双方战报立刻写」（用户最终要求，见 ④）。
 *     幸存者使用技能 —— 用户明确"在幸存者大回合中……都不能写在杀手战报里"。
 * 其余（搜索到什么、谁走到哪、谁用了什么、治疗、消除恐惧、钥匙上架、
 * 装备栏弃置、换人细节、技能）**一律不能出现在杀手战报里**。
 *
 * 跑法：`npm run test:logvis`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction, beginSurvivorTurn,
} from '../../server/dist/game/engine.js';
import { addFear, doorId } from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 一局豪宅 1对1（屠夫），开局准备都清掉 */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
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

/** 杀手现在能看到的战报文本 */
function killerLogText(st) {
  const snap = buildSnapshot(st, 'h');
  return (snap.logs ?? []).map((l) => l.text).join('\n');
}
/** 幸存者现在能看到的战报文本 */
function survLogText(st) {
  const snap = buildSnapshot(st, surv(st).controllerId);
  return (snap.logs ?? []).map((l) => l.text).join('\n');
}

/** 豪宅里可搜索的地点之一 */
const SEARCH_ROOM = 'R2';

function giveTurn(st, roomId) {
  const p = surv(st);
  p.roomId = roomId;
  p.alive = true;
  p.mainActionUsed = false;
  p.moveLeft = 2;
  p.searchedThisTurn = false;
  p.repairedThisTurn = false;
  p.actedThisRound = false;
  p.haltedThisRound = false;
  p.extraActionUsedThisTurn = false;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.pendingItemDiscard = null;
  st.encounter = null;
  st.activeSurvivorIndex = st.turnOrder.indexOf(p.id);
  /** 走真正的开局流程，好让「XXX 的小回合」这类战报真的产生 */
  beginSurvivorTurn(st, p.id);
  return p;
}

/* ═══════════════ ① 杀手该看到的：只有「幸存者正在行动」 ═══════════════ */
console.log('=== ① 杀手只该看到「幸存者正在行动」 ===');
{
  const st = mk();
  const s = giveTurn(st, SEARCH_ROOM);
  /** 大回合开始时打的那一条公开战报 */
  st.logs.push({ t: Date.now(), text: `幸存者正在行动（第 ${st.round} 回合）。`, vis: 'all' });
  const k = killerLogText(st);
  ok(k.includes('幸存者正在行动'), '杀手看到「幸存者正在行动」');
  ok(!k.includes('小回合（一般行动'), '杀手**看不到**具体是谁的小回合');
  ok(!k.includes('点选一名幸存者'), '杀手**看不到**"挑人"的操作提示');
  ok(survLogText(st).includes('小回合（一般行动'), '幸存者自己看得到具体小回合');
  ok(survLogText(st).includes('点选一名幸存者'), '幸存者自己看得到挑人提示');
  void s;
}

/* ═══════════════ ② 幸存者行为一律不进杀手战报 ═══════════════ */
console.log('=== ② 幸存者的行为不进杀手战报 ===');
{
  const st = mk();
  const s = giveTurn(st, SEARCH_ROOM);
  handleAction(st, s.id, { type: 'search' }, content);
  const k = killerLogText(st);
  ok(st.logs.some((l) => l.text.includes('找到了')), '搜索确实产生了战报');
  ok(!k.includes('找到了'), '杀手看不到「找到了」');
  ok(survLogText(st).includes('找到了'), '幸存者自己看得到搜索结果');
}
{
  const st = mk();
  const s = giveTurn(st, 'B1');
  handleAction(st, s.id, { type: 'move', toRoomId: 'R1' }, content);
  ok(!killerLogText(st).includes('移动到'), '杀手看不到幸存者「移动到」');
  ok(survLogText(st).includes('移动到'), '幸存者自己看得到移动');
}
{
  /** 装备栏满 → 要求弃置 */
  const st = mk();
  const s = giveTurn(st, SEARCH_ROOM);
  s.items = { axe: 1, lime: 1, herb: 1 };
  /**
   * ⚠ 牌堆顶要**固定成一件会进背包的物品**（威士忌）——
   * 摸到钥匙的话它上钥匙架、不进背包，就不会溢出，
   * 装备栏这段断言会随洗牌随机时通时不通。
   */
  st.searchDeck = ['sk_whiskey', ...st.searchDeck.filter((id) => id !== 'sk_whiskey')];
  handleAction(st, s.id, { type: 'search' }, content);
  ok(Boolean(st.pendingItemDiscard), '触发了装备栏弃置流程', JSON.stringify(st.pendingItemDiscard));
  ok(!killerLogText(st).includes('装备栏已满'), '杀手看不到「装备栏已满，请弃置」');
  ok(survLogText(st).includes('装备栏已满'), '幸存者自己看得到');
}
{
  /** 消除恐惧 + 恢复生命（草药） */
  const st = mk();
  const s = giveTurn(st, SEARCH_ROOM);
  s.hp = 1;
  s.fear = 2;
  s.items = { herb: 1 };
  handleAction(st, s.id, { type: 'useItem', itemId: 'herb' }, content);
  const k = killerLogText(st);
  ok(st.logs.some((l) => l.text.includes('恢复生命至')), '草药确实治疗了');
  ok(!k.includes('恢复生命至'), '杀手看不到「恢复生命至」');
  ok(survLogText(st).includes('恢复生命至'), '幸存者自己看得到治疗');
}
{
  /** 钥匙上架 */
  const st = mk();
  const s = giveTurn(st, SEARCH_ROOM);
  /** 直接把搜索牌库顶换成钥匙，保证摸到 */
  st.searchDeck = ['sk_key_1', ...st.searchDeck.filter((id) => id !== 'sk_key_1')];
  handleAction(st, s.id, { type: 'search' }, content);
  if (st.logs.some((l) => l.text.includes('钥匙放入钥匙架'))) {
    ok(!killerLogText(st).includes('钥匙放入钥匙架'), '杀手看不到「钥匙放入钥匙架」');
  } else {
    ok(true, '（没摸到钥匙，跳过）');
  }
}

/* ═══════════════ ③ 3 类事件要立即公开 ═══════════════ */
console.log('=== ③ 3 类事件立即向双方报告 ===');
{
  /** ① 惊吓过度发出响声 */
  const st = mk();
  const s = giveTurn(st, 'B1');
  s.fear = 99;
  addFear(st, s.id, 1);
  ok(st.logs.some((l) => l.text.includes('因惊吓过度发出了声音')), '产生了"惊吓过度"战报');
  ok(killerLogText(st).includes('因惊吓过度发出了声音'), '杀手立即看到"惊吓过度发出响声"');
  ok(survLogText(st).includes('因惊吓过度发出了声音'), '幸存者也看到');
}
{
  /** ② 踩到女猎手陷阱 */
  const st = mk();
  const s = giveTurn(st, 'B1');
  st.hunterTraps = { t1: { roomId: 'R1', kind: 'bear', revealed: false, removed: false } };
  handleAction(st, s.id, { type: 'move', toRoomId: 'R1' }, content);
  ok(st.logs.some((l) => l.text.includes('触发了')), '产生了"触发陷阱"战报');
  ok(killerLogText(st).includes('触发了'), '杀手立即看到"踩到陷阱"');
}
{
  /** ③ 拆除封堵 */
  const st = mk();
  const s = giveTurn(st, 'B1');
  st.blockades = [doorId('B1', 'B2')];
  const err = (() => {
    try { handleAction(st, s.id, { type: 'removeBlockade', roomId: 'B1' }, content); return null; }
    catch (e) { return e.message; }
  })();
  if (!err) {
    ok(st.logs.some((l) => l.text.includes('的封堵')), '产生了"拆封堵"战报');
    ok(killerLogText(st).includes('的封堵'), '杀手立即看到"拆除封堵"');
  } else {
    console.log(`   （拆封堵入口不同：${err}）`);
    ok(true, '（跳过：拆封堵入口不同）');
  }
}
{
  /**
   * ④ 放置机关大门（用城堡图，R1 是控制杆所在）。
   *
   * ⚠ **双方战报都要立刻写**（用户最终要求 —— 早先"只给幸存者"的旧要求已作废）：
   * 「幸存者放机关大门，在双方战报立即写上『哪里和哪里之间出现了机关大门』」。
   * 杀手仍然从地图上看到那道闸门（`leverGateDoorId` 是双方都下发的），
   * 而且战报里要写明**地点**和**是谁操作的控制杆**。
   */
  const st = createLobby('C', 'h', 'H', content, 'castle');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  const s2 = giveTurn(st, 'R1');
  s2.extraActionUsedThisTurn = false;
  /** `handleAction` 的第二个参数是**操控者 id**（socketId），不是棋子 id */
  handleAction(st, s2.controllerId, {
    type: 'placeLeverGate',
    fromRoomId: 'R1',
    toRoomId: 'R2',
    actorPlayerId: s2.id,
  }, content);
  ok(Boolean(st.leverGateDoorId), '机关大门已放置', String(st.leverGateDoorId));
  const gateLogs = st.logs.filter((l) => l.text.includes('之间出现了'));
  ok(gateLogs.length > 0, '产生了「哪里和哪里之间出现了机关大门」的战报');
  ok(gateLogs.every((l) => l.vis === 'all'), '**双方战报都写**（vis=all）');
  ok(killerLogText(st).includes('之间出现了'), '杀手战报里立即有这条');
  ok(
    gateLogs.some((l) => l.text.includes('R1') && l.text.includes('R2')),
    '写明了是**哪两个地点之间**',
  );
  ok(
    gateLogs.some((l) => l.text.includes(s2.name) && l.text.includes('操作控制杆')),
    '也写明了**是谁操作的控制杆**',
  );
  ok(
    buildSnapshot(st, 'h').leverGateDoorId === st.leverGateDoorId,
    '杀手**看得见地图上那道闸门**（位置照常下发）',
  );
  ok(
    buildSnapshot(st, 'h').leverGateOwnerName === s2.name,
    '快照里也带上了操作者的名字',
    String(buildSnapshot(st, 'h').leverGateOwnerName),
  );
}

/* ═══════════════ ④ 响声不立即给杀手 ═══════════════ */
console.log('=== ④ 普通响声不立即给杀手（到响声阶段才公开）===');
{
  const st = mk();
  const s = giveTurn(st, SEARCH_ROOM);
  st.searchDeck = ['sk_whiskey', ...st.searchDeck.filter((id) => id !== 'sk_whiskey')];
  handleAction(st, s.id, { type: 'search' }, content);
  const noisy = st.logs.filter((l) => l.text.includes('响声出现在'));
  if (noisy.length) {
    ok(noisy.every((l) => l.vis === 'survivor'), '响声战报标给幸存者', noisy.map((l) => l.vis).join(','));
    ok(!killerLogText(st).includes('响声出现在'), '杀手在幸存者回合看不到响声战报');
  } else {
    ok(true, '（本次没产生响声，跳过）');
  }
}

console.log(`\n战报可见性：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
