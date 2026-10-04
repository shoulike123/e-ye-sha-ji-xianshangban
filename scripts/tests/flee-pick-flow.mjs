/**
 * 验证【（甲）撤离：先选人，再撤离】这条新流程。
 *
 * 用户口径：
 *   1. 遭遇结束时**先弹出"谁来撤离"的名单**，选中谁谁才走（和"选下一名遭遇对象"一样）；
 *   2. 撤离是**独立的一套**，不能和普通移动混在一起；
 *   3. 【变体1】特性 09「生存本能」：撤离时走 **2 格** + 事后清空恐惧 —— 必须保留。
 *
 * 跑法：node scripts/tests/flee-pick-flow.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot, startEncounter,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

/** solo：女猎手 + 马尔科/索菲亚/威廉（三个幸存者同一地点开战） */
function mkSolo(variant1 = false) {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.variant1 = variant1;
  st.soloKillerCharacterId = 'killer4';
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const survOf = (st, ch) => Object.values(st.players).find((p) => p.characterId === ch);
const tryIt = (st, who, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return e.message; }
};

/** 走到"撤离步骤刚开始"：马尔科挨打并挡住 → 遭遇结束 → 等选人 */
function toFleeStart(st) {
  const k = st.players[st.killerId];
  const ss = Object.values(st.players).filter((p) => p.faction === 'survivor');
  for (const s of ss) s.roomId = k.roomId;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  startEncounter(st, k.roomId);
  const marco = survOf(st, 'survivor3');
  handleAction(st, HOST, { type: 'pickEncounterTarget', targetPlayerId: marco.id }, content);
  handleAction(st, k.controllerId, { type: 'playEncounterAttack', cardId: null }, content);
  const saved = st.killerPower;
  st.killerPower = 0;                       // 保证防御一定挡住
  handleAction(st, HOST, { type: 'playEncounterDefense', cardId: null, itemId: null }, content);
  st.killerPower = saved;
  return { k, marco, sofia: survOf(st, 'survivor4'), william: survOf(st, 'survivor5') };
}

console.log('=== ① 遭遇结束后是"等选人"，不是自动轮到某个人 ===');
{
  const st = mkSolo();
  const { marco, sofia, william } = toFleeStart(st);
  const enc = st.encounter;
  ok(enc?.step === 'flee', 'step = flee', String(enc?.step));
  ok(enc?.targetId === null, '**targetId = null**（正在等玩家点名单，没有自动轮到谁）', String(enc?.targetId));
  ok(
    JSON.stringify(enc?.fleeQueue) === JSON.stringify([marco.id, sofia.id, william.id]),
    '名单 = 三个幸存者',
    JSON.stringify(enc?.fleeQueue),
  );
  const snap = buildSnapshot(st, HOST);
  ok(
    JSON.stringify(snap.encounter?.fleeReadyIds) === JSON.stringify([marco.id, sofia.id, william.id]),
    '快照下发了 fleeReadyIds（客户端据此画名单）',
  );
  ok(snap.encounter?.fleeTargetId === null, '快照里 fleeTargetId = null');
  ok(snap.legalMoves.length === 0, '**没人被选中时没有可点格子**（不会误点成普通移动）', JSON.stringify(snap.legalMoves));

  /** 没被选中就发撤离 → 必须被拒 */
  const early = tryIt(st, HOST, { type: 'encounterFlee', moveToRoomId: null });
  ok(Boolean(early?.includes('先')), '没选人就发撤离会被拒', String(early));
}

console.log('=== ② 点名单选中谁，谁才走 ===');
{
  const st = mkSolo();
  const { sofia, marco, william } = toFleeStart(st);
  /** 先选索菲亚（**不按队列顺序**，验证"选中谁谁才走"） */
  const err1 = tryIt(st, HOST, { type: 'pickFleeSurvivor', targetPlayerId: sofia.id });
  ok(!err1, '点名单选中索菲亚', String(err1 ?? ''));
  ok(st.encounter?.targetId === sofia.id, 'targetId 变成索菲亚');
  const snap = buildSnapshot(st, HOST);
  ok(snap.legalMoves.length > 0, '**选中后才有可点格子**', JSON.stringify(snap.legalMoves));
  ok(
    !snap.legalMoves.includes(sofia.roomId),
    '可点格子里不含原地（原地走"留在原地"按钮）',
    JSON.stringify(snap.legalMoves),
  );

  /** 索菲亚撤离（留在原地） */
  const err2 = tryIt(st, HOST, { type: 'encounterFlee', moveToRoomId: null });
  ok(!err2, '索菲亚撤离完成', String(err2 ?? ''));
  ok(st.encounter?.step === 'flee', '遭遇还在（还有人没撤离）');
  ok(st.encounter?.targetId === null, '**又回到"等选人"**（继续点名单）');
  ok(
    JSON.stringify(st.encounter?.fleeQueue) === JSON.stringify([marco.id, william.id]),
    '名单里去掉索菲亚，剩马尔科 + 威廉',
    JSON.stringify(st.encounter?.fleeQueue),
  );

  /** 第二个走的人也可以是名单里的任意一个（这里故意再换一次顺序：点威廉） */
  tryIt(st, HOST, { type: 'pickFleeSurvivor', targetPlayerId: william.id });
  ok(st.encounter?.targetId === william.id, '这次点威廉，让他先走（顺序完全由玩家定）');
  const errW = tryIt(st, HOST, { type: 'encounterFlee', moveToRoomId: null });
  ok(!errW, '威廉撤离完成', String(errW ?? ''));
  ok(
    JSON.stringify(st.encounter?.fleeQueue) === JSON.stringify([marco.id]),
    '名单里只剩马尔科',
    JSON.stringify(st.encounter?.fleeQueue),
  );

  /** 马尔科走 1 格 → 名单空了，遭遇结束 */
  tryIt(st, HOST, { type: 'pickFleeSurvivor', targetPlayerId: marco.id });
  const dest = buildSnapshot(st, HOST).legalMoves[0];
  const err3 = tryIt(st, HOST, { type: 'encounterFlee', moveToRoomId: dest });
  ok(!err3, `马尔科撤离到 ${dest}`, String(err3 ?? ''));
  ok(st.encounter === null, '**名单空了 → 遭遇结束**');
  ok(st.phase !== 'encounter', '离开遭遇阶段', st.phase);
}

console.log('=== ③ 撤离时的点击不会再掉进"普通移动" ===');
{
  const st = mkSolo();
  const { marco, william } = toFleeStart(st);
  void william;
  /** 还没选人时，用 move 点地图 —— 服务端明确拒绝，并告诉玩家先去点名单 */
  const err = tryIt(st, HOST, { type: 'move', toRoomId: marco.roomId });
  ok(
    Boolean(err?.includes('请使用逃离操作') || err?.includes('谁来撤离')),
    '普通移动仍被拦下（并指向"先点名单"）',
    String(err),
  );
  /** 选中之后，正确的入口是 encounterFlee（不是 move） */
  tryIt(st, HOST, { type: 'pickFleeSurvivor', targetPlayerId: marco.id });
  const dest = buildSnapshot(st, HOST).legalMoves[0];
  const bad = tryIt(st, HOST, { type: 'move', toRoomId: dest });
  ok(Boolean(bad), '选中之后用普通移动依然被拦（撤离只认 encounterFlee）', String(bad));
  const good = tryIt(st, HOST, { type: 'encounterFlee', moveToRoomId: dest });
  ok(!good, '用 encounterFlee 撤离成功', String(good ?? ''));
}

console.log('=== ④ 【变体1】特性 09「生存本能」：撤离走 2 格 + 清空恐惧 ===');
{
  const st = mkSolo(true);
  const { marco } = toFleeStart(st);
  /** 给马尔科挂上特性 09，并塞 3 个恐惧标记 */
  st.traits = { ...(st.traits ?? {}), [marco.id]: ['trait_s09'] };
  marco.fear = 3;
  const from = marco.roomId;
  tryIt(st, HOST, { type: 'pickFleeSurvivor', targetPlayerId: marco.id });
  const legal = buildSnapshot(st, HOST).legalMoves;
  console.log(`    马尔科在 ${from}，撤离可点：${JSON.stringify(legal)}`);
  /** 找一个"2 格远"的落点：挑一个不在相邻集合里的可点格子 */
  const { generalAdjacentRooms } = await import('../../server/dist/game/effects.js');
  const near = new Set(generalAdjacentRooms(st.map, from));
  const twoAway = legal.find((r) => !near.has(r) && r !== from);
  if (twoAway) {
    const err = tryIt(st, HOST, { type: 'encounterFlee', moveToRoomId: twoAway });
    ok(!err, `带「生存本能」能走 2 格到 ${twoAway}`, String(err ?? ''));
    ok(marco.roomId === twoAway, '确实走了 2 格', `${from} → ${marco.roomId}`);
    ok(marco.fear === 0, '**走 2 格之后清空全部恐惧**', `fear=${marco.fear}`);
  }
  else {
    ok(false, '地图上找不到"2 格远"的撤离落点（无法验证特性 09）', JSON.stringify(legal));
  }
  /** 没这张特性的人依然只能走 1 格 */
  const st2 = mkSolo(true);
  const r2 = toFleeStart(st2);
  tryIt(st2, HOST, { type: 'pickFleeSurvivor', targetPlayerId: r2.sofia.id });
  const legal2 = buildSnapshot(st2, HOST).legalMoves;
  const near2 = new Set(generalAdjacentRooms(st2.map, r2.sofia.roomId));
  ok(legal2.every((r) => near2.has(r)), '没有「生存本能」的人只能点相邻 1 格', JSON.stringify(legal2));
}

console.log(`\n（甲）撤离选人流程：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
