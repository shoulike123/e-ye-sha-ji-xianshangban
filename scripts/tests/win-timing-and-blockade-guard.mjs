/**
 * **① 幸存者获胜只在「幸存者大回合开始时」判定**（用户口径）
 *    —— 钥匙集齐 / 警车到 0 / 秘密地图站隐藏出口，三条都挪过去了。
 *    动作之后（搜索、修理、移动…）**不再即时判胜**。
 *
 * **② 封堵不能封在有机关大门的门上；没有可封堵的地方就跳过封堵**（用户口径）
 *    —— 底层 `tryPlaceBlockadeDoor` / `unblockedDoorsAt` / `isBlockadableDoor`
 *    早就挡了，这次补齐两处漏的：
 *      · `placeAllDoorsAt`（封堵全部门）以前只筛"没被封"，会把机关大门算进去；
 *      · `placeBlockade` 没地方可封时**抛错**（会中断整张卡的结算）→ 改成跳过。
 *
 * 跑法：node scripts/tests/win-timing-and-blockade-guard.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, buildSnapshot, handleAction, startRound,
} from '../../server/dist/game/engine.js';
import {
  mainExitRoomId, placeBlockade, placeAllDoorsAt, unblockedDoorsAt, isBlockadableDoor,
} from '../../server/dist/game/effects.js';
import { placeLeverGate } from '../../server/dist/game/mapEffects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
const survivorsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor');

function mkSolo(mapId = 'crypt', killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  tryIt(st, { type: 'pickSurvivorTurn', playerId: survivorsOf(st)[0].id });
  return st;
}

console.log('=== ① 钥匙集齐 + 全员在主要出口：动作后不判胜，大回合开始才判 ===');
{
  const st = mkSolo('crypt');
  const exit = mainExitRoomId(st);
  st.keysCollected = st.rules.keysNeeded;
  for (const p of survivorsOf(st)) p.roomId = exit;
  /** 还没到"大回合开始" → 不该已经胜利 */
  ok(st.winner == null, '（前提）满足条件但还没到回合开始 → 没胜利', String(st.winner));

  /**
   * 关键证据：`checkSurvivorWin` 的调用点**必须全部落在 `startRound` 函数体内**
   * —— 动作之后那 31 处已经全删。
   */
  const fs = await import('node:fs');
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  const startIdx = engine.indexOf('export function startRound');
  const nextFnIdx = engine.indexOf('\nexport function', startIdx + 10);
  const body = engine.slice(startIdx, nextFnIdx > startIdx ? nextFnIdx : engine.length);
  const inStartRound = [...body.matchAll(/checkSurvivorWin\(state\);/g)].length;
  const everywhere = [...engine.matchAll(/checkSurvivorWin\(state\);/g)].length;
  console.log(`  checkSurvivorWin 的调用点：全文 ${everywhere} 处，其中在 startRound 里 ${inStartRound} 处`);
  ok(everywhere > 0 && inStartRound === everywhere,
    '**所有判胜都发生在"幸存者大回合开始"**（动作之后一处都没有）',
    `${inStartRound}/${everywhere}`);

  /** 进入下一个幸存者大回合 → 这时才判 */
  startRound(st);
  console.log(`  大回合开始之后 winner=${String(st.winner)} phase=${st.phase}`);
  ok(st.winner === 'survivors', '**大回合开始时判胜**', String(st.winner));
  ok(/钥匙|入口/.test(String(st.winReason)), '胜利原因写的是"集齐钥匙从入口逃脱"',
    String(st.winReason));
}

console.log('=== ② 警车到 0 也是大回合开始时判 ===');
{
  const st = mkSolo('crypt');
  st.rescueArmed = true;
  st.rescueCountdown = 1;
  /** 手动把回合推进一次（startRound 里负责"警车已经在出口 → 胜利"） */
  startRound(st);
  console.log(`  winner=${String(st.winner)} reason=${String(st.winReason)}`);
  ok(st.winner === 'survivors', '**警车到 0 在大回合开始时判胜**', String(st.winner));
  ok(/警车|救援/.test(String(st.winReason)), '原因写的是警车抵达', String(st.winReason));
}

console.log('=== ③ 秘密地图站在隐藏出口：也在大回合开始时判 ===');
{
  const st = mkSolo('crypt');
  const hidden = st.map.rooms.find((r) => (r.tags ?? []).includes('hiddenExit'));
  st.keysCollected = st.rules.keysNeeded;
  const all = survivorsOf(st);
  all[0].items = { ...all[0].items, map: 1 };
  for (const p of all) p.roomId = hidden.id;
  ok(st.winner == null, '（前提）还没到回合开始 → 没胜利', String(st.winner));
  startRound(st);
  ok(st.winner === 'survivors', '**大回合开始时从隐藏出口逃脱**', String(st.winner));
}

console.log('=== ④ 封堵不能封在有机关大门的门上（含"封堵全部门"） ===');
{
  const st = mkSolo('castle');
  const surv = survivorsOf(st)[0];
  /** 找一扇门放机关大门 */
  const edge = (st.map.edges ?? []).find((e) => !e.pathType || e.pathType === 'door');
  const gateDoor = [edge.from, edge.to].sort().join('|');
  placeLeverGate(st, edge.from, edge.to, surv.id);
  ok(st.leverGateDoorId === gateDoor, '（前提）机关大门放在一扇白门上', String(st.leverGateDoorId));

  /** 底层：这扇门不可封 */
  ok(!isBlockadableDoor(st, gateDoor), '**`isBlockadableDoor` 把那扇门判为"不可封"**');
  ok(!unblockedDoorsAt(st, edge.from).some((d) => d.id === gateDoor),
    '`unblockedDoorsAt` 不把它算成"可封的门"');

  /** "封堵全部门"：不能把那扇门排进队列 */
  const begun = placeAllDoorsAt(st, edge.from);
  console.log(`  在「${edge.from}」封堵全部门 → 进入待选=${begun}；` +
    `已封=${JSON.stringify(st.blockades)}`);
  ok(!(st.blockades ?? []).includes(gateDoor), '**机关大门那扇没被封上**',
    JSON.stringify(st.blockades));
  ok(!(st.pendingSealQueue ?? []).includes(gateDoor), '也没排进"待封"队列',
    JSON.stringify(st.pendingSealQueue));
}

console.log('=== ⑤ 没有可封堵的地方就跳过（不再抛错/中断结算） ===');
{
  const st = mkSolo('castle');
  const surv = survivorsOf(st)[0];
  /** 把「B3阳台」与「R1控制杆」这扇门设成机关大门，然后只留这一扇可封的门 */
  const edge = (st.map.edges ?? []).find((e) => !e.pathType || e.pathType === 'door');
  placeLeverGate(st, edge.from, edge.to, surv.id);
  /** 把这个地点其余的白门都人为封掉 → 没有可封堵的门了 */
  const others = unblockedDoorsAt(st, edge.from).map((d) => d.id);
  st.blockades = [...(st.blockades ?? []), ...others];

  let threw = null;
  let ret = null;
  try { ret = placeBlockade(st, edge.from); } catch (e) { threw = String(e.message); }
  const said = st.logs.slice(-3).map((l) => l.text);
  console.log(`  没地方可封时：抛错=${threw ?? '没有'} 返回=${String(ret)}`);
  console.log(`    战报：${JSON.stringify(said)}`);
  ok(threw == null, '**不再抛错**（卡牌结算不会被中断）', String(threw));
  ok(ret === false, '**返回 false**（调用方能据此调整战报）', String(ret));
  ok(said.some((t) => t.includes('跳过封堵')), '战报写明"跳过封堵"', said.join(' | '));
}

console.log('=== ⑥ 特性 01「完全围困」在没地方时不会写出矛盾的"封堵 1" ===');
{
  const fs = await import('node:fs');
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  ok(/const blockadeDone = placeBlockade\(state, who\.roomId\);/.test(engine),
    '**围困用了 `placeBlockade` 的返回值**');
  ok(/没有可封堵的门，跳过封堵。/.test(engine),
    '没地方时写的是"跳过封堵"，不是"【封堵】1"');
}

console.log(`\n胜利时机 + 封堵守卫：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
