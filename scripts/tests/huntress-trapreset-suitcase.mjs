/**
 * 用户 2026-02 的三条口径（女猎手 / 陷阱重置 / 手提箱）。
 *
 *  ① **女猎手 4 级**：「使用「**追蹤**」后〔移動〕×0-1」——
 *     触发卡是**追蹤**（`huntress_track_*`），不是「追逐」。
 *     （以前挂在 `huntress_chase_` 上，所以那张牌打出来什么都没发生。）
 *  ② **女猎手「陷阱重置」的「〔潜行〕到任意地点」** 与 保護色版「恐詭管道」**一致**：
 *     **没有路径**，只有"点一个地点 → 按确认潜入"。
 *     （以前牌面写的是 `move ×0-99`，要逐格规划路径。）
 *  ③ **小屋的手提箱**：翻找它**不算"发现"**（不写 `lastDiscoveryCardId`），
 *     **只算额外行动**（记 `extraActionUsedThisTurn`、停滞过就不能用）。
 *
 * 跑法：node scripts/tests/huntress-trapreset-suitcase.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, who, action) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 1对1：指定杀手 */
function mk(killerChar = 'killer4', mapId = 'cabin') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerChar;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'trapSetup') {
    if (st.pendingTrapPlacement) st.pendingTrapPlacement.done = true;
    tryIt(st, 'h', { type: 'confirmTrapPlacement' });
  }
  st.phase = 'survivorMain';
  const first = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  if (first) tryIt(st, 's', { type: 'pickSurvivorTurn', playerId: first.id });
  return { st, first };
}

const killer = (st) => st.players[st.killerId];

/**
 * 把杀手摆到"能打牌"的状态：
 *  - `'fast'`    快速段（快速牌）
 *  - `'actions'` 第三阶段已经选了「2 次移动/搜索」（普通行动牌）
 *  - `'special'` 第三阶段**还没选**（打特殊牌本身就是选那一支）
 */
function armKiller(st, step = 'fast') {
  st.phase = 'killerMain';
  st.killerTurnStep = step === 'fast' ? 'fast' : 'main';
  st.killerMainChoice = step === 'actions' ? 'actions' : null;
  st.killerMainActionsLeft = step === 'actions' ? 2 : 0;
  st.pendingCardSpeed = null;
  st.pendingEvolutionAck = null;
  /** 本回合还没打过特殊牌（否则会报"本回合已打过特殊牌"） */
  st.killerUsedSlowThisTurn = false;
  return st;
}

/** 一个没有幸存者的地点（追蹤的〔搜索〕命中就会直接开遭遇，那样后半段会被跳过） */
function emptyRoom(st) {
  const taken = new Set(
    Object.values(st.players).filter((p) => p.faction === 'survivor' && p.roomId).map((p) => p.roomId),
  );
  return st.map.rooms.find((r) => !taken.has(r.id))?.id ?? st.map.rooms[0].id;
}

console.log('=== ① 女猎手 4 级：打「追蹤」之后给〔移動〕×0-1 ===');
{
  const { st } = mk();
  const k = killer(st);
  /** ⚠ 站到一个**没有幸存者**的地方：追蹤的〔搜索〕命中就直接开遭遇，后半段会被跳过 */
  k.roomId = emptyRoom(st);
  st.killerLevel = 4;
  armKiller(st, 'fast');
  const cardId = Object.keys(st.cardById).find((id) => /^huntress_track_/.test(id));
  st.killerHand = [cardId];
  const err = tryIt(st, 'h', { type: 'playKillerCard', cardId, payCardIds: [] });
  console.log(`  打出追蹤：${err ?? 'OK'}；pendingTrackerPick=${Boolean(st.pendingTrackerPick)}`);
  ok(!err, '（前提）追蹤打得出来', err ?? '');
  if (st.pendingTrackerPick) {
    const target = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
    const e2 = tryIt(st, 'h', { type: 'pickTrackerTarget', targetPlayerId: target.id });
    console.log(`  选距离目标：${e2 ?? 'OK'}；pendingPathDraft=${JSON.stringify(st.pendingPathDraft)}`);
    ok(!e2, '（前提）选得了距离目标', e2 ?? '');
    ok(Boolean(st.pendingPathDraft), '**追蹤之后挂出了"〔移動〕×0-1"的草稿**',
      JSON.stringify(st.pendingPathDraft));
    ok(st.pendingPathDraft?.min === 0 && st.pendingPathDraft?.max === 1,
      '草稿范围是 0–1 步', JSON.stringify(st.pendingPathDraft));
    /** 不想动 → 直接确认（0 步）也要能收尾 */
    const e3 = tryIt(st, 'h', { type: 'finishPendingMove' });
    ok(!e3, '**0 步直接确认也能收尾**', e3 ?? '');
  }
  else {
    ok(false, '（前提）追蹤打完之后应该等选距离目标（`pendingTrackerPick`）');
  }
}
{
  /** 对照：**3 级**（还没到 4 级）不给这次追加移动 */
  const { st } = mk();
  const k = killer(st);
  k.roomId = emptyRoom(st);
  st.killerLevel = 3;
  armKiller(st, 'fast');
  const cardId = Object.keys(st.cardById).find((id) => /^huntress_track_/.test(id));
  st.killerHand = [cardId];
  tryIt(st, 'h', { type: 'playKillerCard', cardId, payCardIds: [] });
  if (st.pendingTrackerPick) {
    const target = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
    tryIt(st, 'h', { type: 'pickTrackerTarget', targetPlayerId: target.id });
  }
  ok(!st.pendingPathDraft, '**3 级时没有这次追加移动**（等级不到）',
    JSON.stringify(st.pendingPathDraft));
}

console.log('\n=== ② 陷阱重置：〔潜行〕到任意地点 = 点选 + 确认（不要路径）===');
{
  const { st } = mk();
  const k = killer(st);
  k.roomId = st.map.rooms[0].id;
  st.killerLevel = 2;
  /** 陷阱重置是**特殊牌**：要在第三阶段选「特殊行动牌」那一支打 */
  armKiller(st, 'special');
  const cardId = 'huntress_trapreset';
  /** 费用 3：还要在手里放 3 张别的牌当费用 */
  const pay = Object.keys(st.cardById).filter((id) => /^huntress_track_/.test(id)).slice(0, 3);
  st.killerHand = [cardId, ...pay];
  const err = tryIt(st, 'h', { type: 'playKillerCard', cardId, payCardIds: pay });
  console.log(`  打出陷阱重置：${err ?? 'OK'}`);
  ok(!err, '（前提）陷阱重置打得出来', err ?? '');
  ok(!st.pendingPathDraft, '**没有挂"规划路径"的草稿**', JSON.stringify(st.pendingPathDraft));
  ok((st.pendingPassagePick ?? []).length === st.map.rooms.length,
    '**落点 = 整张地图**（任意地点）', `${st.pendingPassagePick?.length} / ${st.map.rooms.length}`);
  ok(st.pendingPassageAnywhere === true, '标着"这次是任意地点"');
  ok(st.pendingPassageLabel === '陷阱重置', '战报来源名是「陷阱重置」', String(st.pendingPassageLabel));

  /** 点一个地点（只选中）→ 确认（才真的移动） */
  const target = st.map.rooms.find((r) => r.id !== k.roomId).id;
  tryIt(st, 'h', { type: 'pickPassageRoom', roomId: target });
  ok(st.pendingPassageRoom === target, '点地图只是**选中**', String(st.pendingPassageRoom));
  ok(k.roomId !== target, '还没移动', String(k.roomId));
  const e2 = tryIt(st, 'h', { type: 'confirmPassagePick' });
  ok(!e2 && k.roomId === target, '**按「确认潜入」才移动**', e2 ?? String(k.roomId));
  ok(st.pendingPassageAnywhere === false, '确认之后待选状态清干净');
  /** 对照：确认完之后队列继续 → 重置陷阱（等杀手重新布 4 个） */
  ok(Boolean(st.pendingTrapPlacement) && st.pendingTrapPlacement.done === false,
    '**接着走"重置陷阱"那一段**（等重新布 4 个）', JSON.stringify(st.pendingTrapPlacement?.done));
}
{
  /**
   * 对照：**没有保護色**时，普通「恐詭管道」仍然只给"带秘密通道的地点"。
   * 这里直接调服务端那个函数（恐詭管道那张牌是"或"牌，要先把整张牌打出来
   * 再选分支，跟本脚本要核的点无关）。
   */
  const { stealthToPassage } = await import('../../server/dist/game/killerSpecials.js');
  const { st } = mk('killer7');
  const k = killer(st);
  k.roomId = st.map.rooms[0].id;
  st.passageStealthAnywhere = false;
  stealthToPassage(st);
  const ends = new Set();
  for (const e of st.map.passages ?? []) { ends.add(e.from); ends.add(e.to); }
  ok((st.pendingPassagePick ?? []).length === ends.size && ends.size < st.map.rooms.length,
    '**没保護色时只给秘密通道口**（没被改坏）',
    `${st.pendingPassagePick?.length} vs 通道口 ${ends.size} / 全图 ${st.map.rooms.length}`);
  ok(st.pendingPassageAnywhere === false, '而且没标成"任意地点"');
}

console.log('\n=== ③ 手提箱：只算额外行动，不算"发现" ===');
{
  const { st, first } = mk();
  const p = first;
  const room = st.map.tokens?.find((t) => t.kind === 'suitcase')?.roomId ?? 'R4';
  p.roomId = room;
  p.extraActionUsedThisTurn = false;
  st.suitcaseAvailable = true;
  st.lastDiscoveryCardId = null;

  const err = tryIt(st, 's', { type: 'useSuitcase', actorPlayerId: p.id });
  console.log(`  翻找手提箱：${err ?? 'OK'}；extra=${Boolean(p.extraActionUsedThisTurn)}` +
    `；lastDiscoveryCardId=${st.lastDiscoveryCardId}`);
  ok(!err, '开得了', err ?? '');
  ok(p.extraActionUsedThisTurn === true, '**记成"本回合用过额外行动"**',
    String(p.extraActionUsedThisTurn));
  ok(st.lastDiscoveryCardId == null, '**不算发现**（不写 `lastDiscoveryCardId`）',
    String(st.lastDiscoveryCardId));
  ok(p.mainActionUsed !== true, '不占一般行动', String(p.mainActionUsed));
}
{
  /** 停滞过就不能翻 */
  const { st, first } = mk();
  first.roomId = st.map.tokens?.find((t) => t.kind === 'suitcase')?.roomId ?? 'R4';
  first.haltedThisRound = true;
  st.suitcaseAvailable = true;
  const err = tryIt(st, 's', { type: 'useSuitcase', actorPlayerId: first.id });
  console.log(`  停滞状态下翻找：${err ?? '（通过了）'}`);
  ok(err != null && /停滞/.test(err), '**停滞过就不能翻**', String(err));
}

console.log(`\n女猎手 / 陷阱重置 / 手提箱：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
