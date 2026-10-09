/**
 * **开宝箱 = 额外行动**（用户口径）。
 *
 * 用户报的：「狼人局，幸存者小回合执行完后如果有人所在位置有宝箱，
 * 会在行动区放一个开宝箱的按钮，这不对。开宝箱算作额外行动。」
 *
 * 所以三件事：
 *  ① 行动区**不再**有「开宝箱」按钮（只剩左上角「额外行动」弹窗里那一个）；
 *  ② 服务端把它当额外行动记（`extraActionUsedThisTurn`）——
 *     「停滞雕像」那一步要求"本大回合还没做过任何行动（含额外行动）"，就靠这个标记；
 *  ③ 额外行动"不受小回合限制"：做完一般行动、小回合结束了也还能开；
 *     但**停滞过就不能再开**（停滞吃掉本大回合所有额外行动）。
 *
 * 跑法：node scripts/tests/chest-extra-action.mjs
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

const CHEST = 'chest_probe';
const ROOM = 'R1';

/** 1对1：杀手 + 幸存者；给幸存者所在地点摆一个没开过的宝箱 */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer5';      // 狼人：宝藏就是他那套
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  const p = Object.values(st.players).find((x) => x.faction === 'survivor' && x.alive);
  p.roomId = ROOM;
  st.treasureChests = { [CHEST]: ROOM };
  if (!st.treasureDeck?.length) st.treasureDeck = [...Object.keys(st.cardById)];
  tryIt(st, 's', { type: 'pickSurvivorTurn', playerId: p.id });
  return { st, p };
}

console.log('=== ① 开宝箱会记成"额外行动"，而且做完一般行动也能开 ===');
{
  const { st, p } = mk();
  /** 先把一般行动做掉（额外行动"不受小回合限制"，做完一般行动照样能开） */
  p.mainActionUsed = true;
  p.extraActionUsedThisTurn = false;
  const err = tryIt(st, 's', { type: 'openChest', chestId: CHEST, actorPlayerId: p.id });
  console.log(`  开宝箱：${err ?? 'OK'}；extraActionUsedThisTurn=${Boolean(p.extraActionUsedThisTurn)}`);
  ok(!err, '**做完一般行动后仍然开得了**（额外行动不占一般行动）', err ?? '');
  ok(p.extraActionUsedThisTurn === true, '**服务端记下了"本回合用过额外行动"**',
    String(p.extraActionUsedThisTurn));
  ok(!st.treasureChests[CHEST], '（机制）宝箱开掉了');
}

console.log('\n=== ② 停滞过就不能再开（停滞吃掉本大回合所有额外行动）===');
{
  const { st, p } = mk();
  p.haltedThisRound = true;
  const err = tryIt(st, 's', { type: 'openChest', chestId: CHEST, actorPlayerId: p.id });
  console.log(`  停滞状态下开宝箱：${err ?? '（通过了）'}`);
  ok(err != null && /停滞/.test(err), '**被拒**（提示里点明是停滞）', String(err));
  ok(Boolean(st.treasureChests[CHEST]), '宝箱还在（没被开掉）');
}

console.log('\n=== ③ 界面上：行动区的按钮没了，只剩「额外行动」弹窗里那一个 ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  /**
   * 两处的判定写法不一样：
   *  - 行动区那颗用的是 `t.roomId === state.you.roomId`（针对"你"）
   *  - 额外行动弹窗里用的是 `t.roomId === p.roomId`（按每个幸存者逐个列）
   *
   * ⚠ 要比对**整段特征串**：只写 `t.roomId === state.you.roomId` 的话，
   * 雕像那两处的 `st.roomId === state.you.roomId` 也会命中（子串）。
   */
  const OLD = "t.kind === 'treasureChest' && t.roomId === state.you.roomId";
  const NEW = "t.kind === 'treasureChest' && t.roomId === p.roomId";
  ok(!views.includes(OLD), '**行动区那颗「开宝箱」已经删掉**');
  ok(views.includes(NEW), '**「额外行动」弹窗里那颗还在**（按每个幸存者逐个列）');
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  const chestCase = engine.slice(engine.indexOf("case 'openChest'"));
  const body = chestCase.slice(0, chestCase.indexOf('case ', 10));
  ok(/haltedThisRound/.test(body), '服务端拦"停滞过"的');
  ok(/extraActionUsedThisTurn = true/.test(body), '服务端记 `extraActionUsedThisTurn`');
}

console.log(`\n开宝箱 = 额外行动：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
