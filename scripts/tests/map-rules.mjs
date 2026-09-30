/**
 * 三张新地图的**地图特殊规则**验证。
 *
 * 实验室：①G3 急救箱（特殊行动治疗同地点一人 + 清空恐惧 + 用后移除）
 *        ②移动进入 R4 时在该地点发出响声（不报是谁）
 *        ③开局 B1–B4 之间预置一个封堵
 * 城堡：  ④R1 放机关大门（至多一个；**不能放在已被封堵的门上**；
 *           幸存者不能过；杀手要弃 3 张手牌且潜行绝对不能过）
 *        ⑤本局第一次有幸存者进入 B4：惊吓他 + 在该地点发出响声（只一次）
 *
 * 跑法：`npm run test:maprules`
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, handleAction, startGame, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { doorId } from '../../server/dist/game/effects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 造一局指定地图的 1对1 */
function mk(mapId, killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players['h'], s: bs };
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = killerId;
  st.players['h'].ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  return st;
}

/** 现在轮到哪个幸存者行动（简单模式：直接指定） */
function putSurvivorAt(st, roomId, actorId) {
  const s = st.players[actorId];
  s.roomId = roomId;
  s.alive = true;
  s.mainActionUsed = false;
  s.haltedThisRound = false;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = st.turnOrder.indexOf(actorId);
  st.encounter = null;
  return s;
}

console.log('=== ① 实验室：开局预置封堵 B1–B4 ===');
{
  const st = mk('laboratory');
  const want = doorId('B1', 'B4');
  console.log(`   blockades = ${JSON.stringify(st.blockades)}`);
  ok(st.blockades.includes(want), `B1–B4 之间开局就有封堵（${want}）`, st.blockades.join(','));
  ok(st.blockades.length === 1, '开局只有一个封堵', `${st.blockades.length}`);
  /** 对照：别的图不该有 */
  const other = mk('mansion');
  ok(!other.blockades.includes(want), '豪宅没有这个预置封堵（地图专属）', String(other.blockades.length));
}

console.log('=== ② 实验室：G3 急救箱 ===');
{
  const st = mk('laboratory');
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const healer = survs[0];
  const target = survs[1];
  console.log(`   开局 firstAidKit = ${st.firstAidKit}`);
  ok(st.firstAidKit === true, '开局有急救箱标记');

  /** 不在 G3 时不能用的判定 */
  putSurvivorAt(st, 'B1', healer.id);
  const { canUseFirstAidKitAt } = await import('../../server/dist/game/mapEffects.js');
  ok(canUseFirstAidKitAt(st, healer) === false, '不在 G3 时 canUseFirstAidKit=false');

  /** 站到 G3，目标受伤 + 有恐惧 */
  putSurvivorAt(st, 'G3', healer.id);
  target.roomId = 'G3';
  target.hp = 1;
  target.fear = 2;
  ok(canUseFirstAidKitAt(st, healer) === true, '在 G3 时 canUseFirstAidKit=true');

  handleAction(st, 's', { type: 'useFirstAidKit', targetPlayerId: target.id }, content);
  console.log(`   用后：firstAidKit=${st.firstAidKit} 目标 HP=${target.hp} 恐惧=${target.fear}`);
  ok(st.firstAidKit === false, '急救箱标记已移除（一次性）');
  ok(target.hp === 2, '目标被治疗（1 → 2）', `${target.hp}`);
  ok(target.fear === 0, '目标恐惧被清空', `${target.fear}`);
  ok(healer.mainActionUsed === true, '占用了施救者的一般行动');

  /** 再用一次应当失败 */
  let again = null;
  try {
    putSurvivorAt(st, 'G3', healer.id);
    handleAction(st, 's', { type: 'useFirstAidKit', targetPlayerId: target.id }, content);
  } catch (e) { again = e.message; }
  ok(again !== null, '急救箱不能再用第二次', again ?? '（竟然成功）');
}

console.log('=== ③ 实验室：移动进入 R4 发出响声 ===');
{
  const st = mk('laboratory');
  const s = Object.values(st.players).find((p) => p.faction === 'survivor');
  st.noises = [];
  st.firecrackerThisRound = false;
  putSurvivorAt(st, 'R2', s.id);
  /** R2 与 R4 相邻吗？不相邻就直接设 roomId 再 tryMove 会失败 —— 先看边 */
  const { tryMove } = await import('../../server/dist/game/effects.js');
  const moved = tryMove(st, s.id, 'R4', 5);
  console.log(`   从 R2 移到 R4：${moved ? '成功' : '失败（不相邻）'}；noises=${JSON.stringify(st.noises)}`);
  if (moved) {
    ok(st.noises.includes('R4'), 'R4 立刻出现在响声列表里');
    ok(st.noises.length === 1, '只响了一个地点', st.noises.join(','));
    /** 响声日志不能写是谁进去的 */
    const lines = st.logs.filter((l) => l.text.includes('响声出现在')).map((l) => l.text);
    console.log(`   响声战报：${lines.join(' | ')}`);
    ok(lines.length > 0, '有响声战报');
    ok(!lines.some((t) => t.includes(s.name)), '响声战报**不含幸存者名字**', lines.join('|'));
  } else {
    ok(false, '测试前提失败：R2 到 R4 不可直达');
  }
  /** 爆竹回合不记具体地点 */
  st.noises = [];
  st.firecrackerThisRound = true;
  putSurvivorAt(st, 'R2', s.id);
  tryMove(st, s.id, 'R4', 5);
  ok(st.noises.length === 0, '爆竹回合：不记具体地点（全场都响）', st.noises.join(','));
}

console.log('=== ④ 城堡：机关大门 ===');
{
  const st = mk('castle');
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const s = survs[0];
  /**
   * ⚠ 边的选择要按**地图校准后**的真实数据来：
   * 城堡 R1「控制杆」只连着 B3 和 R2（见 `content/maps/castle.json`）。
   * 早先这里用的是估的边（R1–B2 / B1–B4），校准后就不存在了。
   */
  const R1_DOOR_A = ['R1', 'R2'];
  const R1_DOOR_B = ['R1', 'B3'];
  /** 城堡的虚线通道之一（不能放机关大门） */
  const DASH_EDGE = ['B2', 'B4'];

  /** 只有 R1 能放 */
  putSurvivorAt(st, 'B1', s.id);
  let err1 = null;
  try { handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: R1_DOOR_A[0], toRoomId: R1_DOOR_A[1] }, content); }
  catch (e) { err1 = e.message; }
  ok(err1 !== null, '不在 R1 不能放机关大门', err1 ?? '（竟然成功）');

  /** 在 R1 放 */
  putSurvivorAt(st, 'R1', s.id);
  handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: R1_DOOR_A[0], toRoomId: R1_DOOR_A[1] }, content);
  console.log(`   leverGateDoorId = ${st.leverGateDoorId}`);
  ok(st.leverGateDoorId === doorId(...R1_DOOR_A), `大门放到了 ${R1_DOOR_A.join('–')}`, st.leverGateDoorId ?? 'null');
  ok(s.extraActionUsedThisTurn === true, '算额外行动');

  /** 至多一个：换位置时旧的自动消失 */
  putSurvivorAt(st, 'R1', s.id);
  s.extraActionUsedThisTurn = false;
  handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: R1_DOOR_B[0], toRoomId: R1_DOOR_B[1] }, content);
  console.log(`   换位置后 leverGateDoorId = ${st.leverGateDoorId}`);
  ok(st.leverGateDoorId === doorId(...R1_DOOR_B), `大门移到了 ${R1_DOOR_B.join('–')}`);
  const gateCount = st.leverGateDoorId ? 1 : 0;
  ok(gateCount === 1, '场上只有一个机关大门（旧门消失）');

  /** 虚线通道不能放 */
  let err2 = null;
  putSurvivorAt(st, 'R1', s.id);
  s.extraActionUsedThisTurn = false;
  try { handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: DASH_EDGE[0], toRoomId: DASH_EDGE[1] }, content); }
  catch (e) { err2 = e.message; }
  ok(err2 !== null, '虚线通道上不能放机关大门（只能放门）', err2 ?? '（竟然成功）');

  /** 幸存者不能通过 */
  const { isLeverGateDoor } = await import('../../server/dist/game/effects.js');
  putSurvivorAt(st, 'R1', s.id);
  const survCross = isLeverGateDoor(st, doorId(...R1_DOOR_B));
  console.log(`   isLeverGateDoor(${R1_DOOR_B.join('|')}) = ${survCross}`);
  ok(survCross === true, 'effects 侧认得这扇门是机关大门');
}

console.log('=== ⑤ 城堡：机关大门不能放在已被封堵的门上 ===');
{
  /**
   * ⚠ 规则改过：以前是"盖在有封堵的门上会自动拆封堵"，
   * 用户现在要求**直接禁止** —— 要放就先自己把封堵拆掉。
   */
  const st = mk('castle');
  const s = Object.values(st.players).find((p) => p.faction === 'survivor');
  const target = doorId('R1', 'R2');
  st.blockades = [target];
  putSurvivorAt(st, 'R1', s.id);
  let err = '';
  try {
    handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: 'R1', toRoomId: 'R2' }, content);
  } catch (e) { err = e.message; }
  console.log(`   放到被封堵的门上 → ${err}`);
  ok(err.includes('已经被封堵'), '**放在被封堵的门上会被拒**', err);
  ok(st.blockades.includes(target), '那个封堵原样留着（不再被自动拆掉）');
  ok(st.leverGateDoorId == null, '大门没有放上去');

  /** 换一扇没被封堵的门就正常 */
  st.blockades = [];
  handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: 'R1', toRoomId: 'R2' }, content);
  ok(st.leverGateDoorId === target, '没封堵的门上照常能放', String(st.leverGateDoorId));
}

console.log('=== ⑥ 城堡：本局第一次有人进入 B4 → 惊吓 + 响声（只一次）===');
{
  const st = mk('castle');
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const a = survs[0];
  const b = survs[1];
  st.noises = [];
  st.castleHallFirstEnterDone = false;
  a.fear = 0;
  b.fear = 0;
  const { tryMove } = await import('../../server/dist/game/effects.js');
  putSurvivorAt(st, 'B2', a.id);
  const m1 = tryMove(st, a.id, 'B4', 5);
  console.log(`   第一次进 B4：${m1 ? '成功' : '失败'}；fear=${a.fear} noises=${JSON.stringify(st.noises)}`);
  if (m1) {
    ok(a.fear === 1, '进入者被惊吓（+1 恐惧）', `${a.fear}`);
    ok(st.noises.includes('B4'), 'B4 发出响声');
    ok(st.castleHallFirstEnterDone === true, '标记已置');
    const lines = st.logs.filter((l) => l.text.includes('首次')).map((l) => l.text);
    ok(lines.length > 0 || st.logs.some((l) => l.text.includes('B4')), '有相关战报');
    /** 第二个人再进去不该再触发 */
    st.noises = [];
    b.fear = 0;
    putSurvivorAt(st, 'B2', b.id);
    const m2 = tryMove(st, b.id, 'B4', 5);
    console.log(`   第二次进 B4：${m2 ? '成功' : '失败'}；fear=${b.fear} noises=${JSON.stringify(st.noises)}`);
    ok(b.fear === 0, '第二个人不再被惊吓（只触发一次）', `${b.fear}`);
    ok(!st.noises.includes('B4'), '也不再发出响声');
  } else {
    ok(false, '测试前提失败：B2 到 B4 不可直达');
  }
}

console.log('=== ⑦ 快照带上了地图特殊状态 ===');
{
  const lab = mk('laboratory');
  const sv = buildSnapshot(lab, 's');
  ok(sv.firstAidKit === true, '实验室快照 firstAidKit=true');
  ok(typeof sv.firstAidRoomId === 'string', '带急救箱房间 id', sv.firstAidRoomId);

  const cas = mk('castle');
  const sc = Object.values(cas.players).find((p) => p.faction === 'survivor');
  putSurvivorAt(cas, 'R1', sc.id);
  const svc = buildSnapshot(cas, 's');
  ok(svc.canPlaceLeverGate === true, '城堡 R1 的幸存者 canPlaceLeverGate=true');
  ok(svc.leverGateDoorId === null, '还没放门时 leverGateDoorId=null');
  const kv = buildSnapshot(cas, 'h');
  ok(kv.pendingGatePay === null, '没有待付费时 pendingGatePay=null');
}

console.log('=== ⑧ 城堡：杀手过机关大门要弃 3 张手牌；潜行绝对不能过 ===');
{
  const st = mk('castle');
  const killer = st.players[st.killerId];
  const { pathRooms } = await import('../../server/dist/game/effects.js');

  /** 找一扇"杀手起点 G1 走过去会经过"的门，把大门放上去 */
  const from = killer.roomId;
  const cand = st.map.edges
    .filter((e) => (e.pathType ?? 'door') === 'door')
    .filter((e) => e.from === from || e.to === from)
    .map((e) => (e.from === from ? e.to : e.from));
  console.log(`   杀手在 ${from}，相邻门通向：${cand.join('、')}`);
  const gateTo = cand.find((r) => {
    const pth = pathRooms(st, from, r, true, true);
    return pth && pth.length >= 2;
  });
  ok(Boolean(gateTo), '找到一扇可以放机关大门的相邻门', gateTo ?? '（无）');

  /** 准备杀手回合：普通行动 + 2 次行动 */
  const setKillerTurn = () => {
    st.phase = 'killerMain';
    st.killerTurnStep = 'main';
    st.killerMainChoice = 'actions';
    st.killerMainActionsLeft = 2;
    st.pendingEvolutionAck = null;
    st.pendingGatePay = null;
    killer.stealth = false;
    killer.alive = true;
    killer.roomId = from;
  };

  /** 放门（直接调 mapEffects，避免再走一遍幸存者流程） */
  const { placeLeverGate } = await import('../../server/dist/game/mapEffects.js');
  placeLeverGate(st, from, gateTo);
  const gate = st.leverGateDoorId;
  console.log(`   机关大门放在 ${gate}`);

  /**
   * ① **潜行：免费直接过去，门也不拆**（用户明确）——
   * 和"潜行穿过封堵不拆"是同一个道理：悄悄钻过去，不留痕迹。
   */
  setKillerTurn();
  killer.stealth = true;
  /** 故意只给 2 张手牌：潜行不该看手牌 */
  st.killerHand = ['butcher_chase_1', 'butcher_chase_2'];
  st.pendingGatePay = null;
  let errStealth = null;
  try { handleAction(st, 'h', { type: 'move', toRoomId: gateTo }, content); }
  catch (e) { errStealth = e.message; }
  console.log(`   潜行过门：${errStealth ?? '（通过）'} 位置=${killer.roomId}`);
  ok(errStealth === null, '潜行的杀手可以免费通过机关大门', errStealth ?? '');
  ok(!st.pendingGatePay, '潜行过门不挂付费（不用弃牌）');
  ok(killer.roomId === gateTo, '潜行时确实走了过去');
  ok(st.leverGateDoorId === gate, '潜行通过后大门**还在**（不拆）');
  /** 清干净，别影响后面的用例 */
  st.pendingGatePay = null;
  killer.stealth = false;
  killer.roomId = from;

  /** ② 手牌不足 3 张 → 拒 */
  setKillerTurn();
  st.killerHand = ['butcher_chase_1', 'butcher_chase_2'];
  let errPoor = null;
  try { handleAction(st, 'h', { type: 'move', toRoomId: gateTo }, content); }
  catch (e) { errPoor = e.message; }
  console.log(`   手牌 2 张过门：${errPoor ?? '（竟然通过）'}`);
  ok(errPoor !== null && /3 张手牌/.test(errPoor), '手牌不足 3 张不能过门', errPoor ?? '');
  ok(killer.roomId === from, '没有移动成功');

  /** ③ 手牌够 → 挂起待付费，先不移动 */
  setKillerTurn();
  st.killerHand = ['butcher_chase_1', 'butcher_chase_2', 'butcher_sense_1', 'butcher_block_1', 'butcher_stay'];
  let errOk = null;
  try { handleAction(st, 'h', { type: 'move', toRoomId: gateTo }, content); }
  catch (e) { errOk = e.message; }
  console.log(`   手牌足够：${errOk ?? '（无错）'} pendingGatePay=${JSON.stringify(st.pendingGatePay)}`);
  ok(errOk === null, '手牌足够时不报错，改为挂起付费', errOk ?? '');
  ok(Boolean(st.pendingGatePay), '挂起了 pendingGatePay');
  ok(killer.roomId === from, '还没移动（等付费）');

  /** ④ 付费数量不对 → 拒 */
  let errCount = null;
  try { handleAction(st, 'h', { type: 'confirmGatePay', cardIds: ['butcher_chase_1'] }, content); }
  catch (e) { errCount = e.message; }
  ok(errCount !== null && /3 张/.test(errCount), '弃牌数量不对会被拒', errCount ?? '');

  /** ⑤ 正确付费 → 拆除大门 + 完成移动 */
  const handBefore = [...st.killerHand];
  handleAction(st, 'h', {
    type: 'confirmGatePay',
    cardIds: ['butcher_chase_1', 'butcher_chase_2', 'butcher_sense_1'],
  }, content);
  st.pendingEvolutionAck = null;
  console.log(`   付费后：大门=${st.leverGateDoorId} 杀手位置=${killer.roomId} 手牌=${JSON.stringify(st.killerHand)}`);
  ok(st.leverGateDoorId === null, '机关大门被拆除');
  ok(killer.roomId === gateTo, '杀手完成了那次移动', `${killer.roomId}`);
  ok(st.killerHand.length === handBefore.length - 3, '手牌少了 3 张', `${handBefore.length} → ${st.killerHand.length}`);
  ok(st.killerDiscard.length >= 3, '弃掉的 3 张进了弃牌堆', `${st.killerDiscard.length}`);
  ok(st.killerMainActionsLeft === 1, '消耗了一次普通行动', `${st.killerMainActionsLeft}`);

  /** ⑦ 幸存者绝对不能过机关大门 */
  {
    const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
    /** ⚠ 上面付费时门已经被拆了 —— 这里要**重新放一个**再测 */
    placeLeverGate(st, from, gateTo);
    console.log(`   重新放门：${st.leverGateDoorId}`);
    ok(st.leverGateDoorId === gate, '门重新放好了', st.leverGateDoorId ?? 'null');
    putSurvivorAt(st, from, surv.id);
    st.blockades = [];
    const { tryMove: tm } = await import('../../server/dist/game/effects.js');
    const crossed = tm(st, surv.id, gateTo, 5);
    console.log(`   幸存者 ${from} → ${gateTo}（门上有机关大门）：${crossed ? '通过了！' : '被挡住'}`);
    ok(crossed === false, '幸存者无法通过机关大门', crossed ? '（竟然通过）' : '');
    ok(surv.roomId === from, '幸存者没有移动');
  }

  /** ⑧ 取消付费 */
  setKillerTurn();
  placeLeverGate(st, from, gateTo);
  st.killerHand = ['butcher_chase_1', 'butcher_chase_2', 'butcher_sense_1', 'butcher_block_1'];
  handleAction(st, 'h', { type: 'move', toRoomId: gateTo }, content);
  ok(Boolean(st.pendingGatePay), '又挂起了付费');
  handleAction(st, 'h', { type: 'cancelGatePay' }, content);
  ok(st.pendingGatePay === null, '取消后清空待付费');
  ok(killer.roomId === from, '取消后没有移动');
  ok(st.leverGateDoorId === gate, '取消不会拆掉大门', st.leverGateDoorId ?? 'null');
}

console.log('=== ⑨ 2对3：两名杀手各自独立地为机关大门付费 ===');
{
  /** 造一局 2v3 城堡 */
  const st = createLobby('T', 'k1', 'K1', content, 'castle');
  st.mode = '2v3';
  const map = { k1: st.players['k1'] };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
  st.hostId = 'k1';
  st.players['k1'].faction = 'killer';
  st.players['k1'].characterId = 'killer1';
  st.players['k2'].faction = 'killer';
  st.players['k2'].characterId = 'killer5';
  ['s1', 's2', 's3'].forEach((id, i) => {
    st.players[id].faction = 'survivor';
    st.players[id].characterId = survCharIds[i];
  });
  for (const p of Object.values(st.players)) p.ready = true;
  st.players['k1'].orderPick = 'first';
  st.players['k2'].orderPick = 'second';
  startGame(st, content, 'k1');
  st.pendingEvolutionAck = null;

  const [ka, kb] = st.killerIds;
  console.log(`   两名杀手 = ${st.players[ka]?.name}（${ka}）、${st.players[kb]?.name}（${kb}）`);

  /** 大门放在先手杀手起点旁的一扇门上 */
  const kg = st.players[ka];
  const from = kg.roomId;
  const to = st.map.edges
    .filter((e) => (e.pathType ?? 'door') === 'door')
    .map((e) => (e.from === from ? e.to : e.to === from ? e.from : null))
    .find(Boolean);
  const { placeLeverGate } = await import('../../server/dist/game/mapEffects.js');
  placeLeverGate(st, from, to);
  const gate = st.leverGateDoorId;
  ok(Boolean(gate), '大门已放置', gate ?? 'null');

  /** 先手杀手：手牌不够 → 拒 */
  const setTurn = (kid) => {
    st.phase = 'killerMain';
    st.killerTurnStep = 'main';
    st.killerMainChoice = 'actions';
    st.killerMainActionsLeft = 2;
    st.pendingEvolutionAck = null;
    st.pendingGatePay = null;
    st.killerId = kid;
    const p = st.players[kid];
    p.roomId = from;
    p.stealth = false;
    p.alive = true;
  };

  setTurn(ka);
  st.killers[ka].hand = ['butcher_chase_1', 'butcher_chase_2'];
  st.killerHand = ['butcher_chase_1', 'butcher_chase_2'];
  let e1 = null;
  try { handleAction(st, ka, { type: 'move', toRoomId: to }, content); } catch (e) { e1 = e.message; }
  ok(e1 !== null && /3 张/.test(e1), '先手杀手手牌不够时被拒', e1 ?? '');

  /** 先手杀手：够 → 挂起，且挂的是他自己 */
  setTurn(ka);
  const handA = ['butcher_chase_1', 'butcher_chase_2', 'butcher_sense_1', 'butcher_block_1'];
  st.killers[ka].hand = [...handA];
  st.killerHand = [...handA];
  handleAction(st, ka, { type: 'move', toRoomId: to }, content);
  console.log(`   pendingGatePay.actorId = ${st.pendingGatePay?.actorId}`);
  ok(st.pendingGatePay?.actorId === ka, '挂起的是先手杀手自己', String(st.pendingGatePay?.actorId));

  /** 付费：手牌要从**付费者自己的切片**里扣 */
  handleAction(st, ka, {
    type: 'confirmGatePay',
    cardIds: ['butcher_chase_1', 'butcher_chase_2', 'butcher_sense_1'],
  }, content);
  st.pendingEvolutionAck = null;
  console.log(`   付费后：大门=${st.leverGateDoorId} 先手位置=${st.players[ka].roomId} 先手手牌=${JSON.stringify(st.killers[ka].hand)}`);
  ok(st.leverGateDoorId === null, '大门被拆除');
  ok(st.players[ka].roomId === to, '先手杀手完成了移动', `${st.players[ka].roomId}`);
  ok(st.killers[ka].hand.length === 1, '扣的是先手杀手自己的手牌', `${st.killers[ka].hand.length}`);
  /** 后手杀手的手牌没被动 */
  ok(st.killers[kb].hand.length > 0, '后手杀手的手牌没受影响', `${st.killers[kb].hand.length}`);
  ok(st.killers[kb].hand.every((id) => /^wolf_/.test(id)), '后手手里还是自己的牌');
}

console.log('=== ⑩ 机关大门与秘密通道：只能放门，虚线不行 ===');
{
  const st = mk('castle');
  const s = Object.values(st.players).find((p) => p.faction === 'survivor');
  /** 城堡的秘密通道是 G1–B2、G1–R5，都是 dash */
  const dash = st.map.edges.filter((e) => e.pathType === 'dash');
  console.log(`   城堡的虚线边 = ${dash.map((e) => `${e.from}-${e.to}`).join('、') || '（无）'}`);
  putSurvivorAt(st, 'R1', s.id);
  for (const d of dash) {
    let err = null;
    try { handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: d.from, toRoomId: d.to }, content); }
    catch (e) { err = e.message; }
    ok(err !== null, `${d.from}-${d.to}（虚线）不能放机关大门`, err ?? '（竟然成功）');
  }
  /** 但任意一扇"门"都可以，不必与 R1 相邻（用城堡里真实存在、且离 R1 很远的一扇门） */
  const FAR_DOOR = ['R5', 'G4'];
  let far = null;
  try { handleAction(st, 's', { type: 'placeLeverGate', fromRoomId: FAR_DOOR[0], toRoomId: FAR_DOOR[1] }, content); }
  catch (e) { far = e.message; }
  console.log(`   在远离 R1 的 ${FAR_DOOR.join('–')} 上放门：${far ?? '成功'}`);
  ok(far === null, '任意一扇门都能放（不必相邻）', far ?? '');
  ok(st.leverGateDoorId === doorId(...FAR_DOOR), `放到了 ${FAR_DOOR.join('–')}`, st.leverGateDoorId ?? 'null');
}

console.log('=== ⑪ 控制杆是【额外行动】：用过一般行动照样能放 ===');
{
  const st = mk('castle');
  const s = Object.values(st.players).find((p) => p.faction === 'survivor');
  putSurvivorAt(st, 'R1', s.id);
  s.mainActionUsed = true;
  const snap = buildSnapshot(st, 's');
  console.log(`   mainActionUsed=true 时快照 canPlaceLeverGate = ${snap.canPlaceLeverGate}`);
  ok(snap.canPlaceLeverGate === true, '用过一般行动后照样能操作控制杆（额外行动不占一般行动）');
  /**
   * 用户明确：「走到控制杆这里了，但是没有弹出额外行动」——
   * 额外行动**不占一般行动、做完小回合也能做**，
   * 所以 `mainActionUsed` 不能再当门槛（狼人宝箱也没有这条）。
   */
  s.mainActionUsed = false;
  ok(buildSnapshot(st, 's').canPlaceLeverGate === true, '没用过时更能放');
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
