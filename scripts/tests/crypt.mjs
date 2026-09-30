/**
 * 【墓穴】特殊规则验证。
 *
 * ① **坍塌**：杀手每次升级（1→2、2→3、3→4、4→5，共 4 次）之前，
 *    在**触发进化的第一时间**随机塌一个还没塌过的可坍塌地点（G5 / G6 / R4 / R5，不会重复）。
 *    时机严格是：先告知进化到几级 → 结算坍塌 → 再结算进化 → 再继续。
 *    坍塌效果：清光该地点的一切标记与仆从（立绘除外）→ 相连的门消失 →
 *    屋里幸存者各受 1 点伤害（公开）→ 潜行杀手暴露 →
 *    屋里的人**轮流选择移动一步**离开（幸存者先、杀手最后；杀手必须弃光手牌）。
 * ② **遺物室 R6**：遗物标记（正/反面）+ 遗物牌堆；
 *    在地上的幸存者花**额外行动**抽 1 张，抽完翻面，每个幸存者大回合开始翻回正面。
 *
 * 跑法：`npm run test:crypt`
 */
import { loadContent } from '../../server/dist/content/loader.js';
/**
 * ⚠ 顺序很重要：**先 import engine**。
 *
 * `upgradeKiller`（effects）本身只是个空壳，真正干活的是 engine 在模块加载时
 * 用 `setUpgradeHandler` 注册进去的那个（里面含"先结算坍塌、再跑进化"）。
 * 如果 engine 没被加载过，`upgradeKiller` 就是空操作 —— 测试会看到
 * `pendingCollapse` 一直挂着、等级也没升。
 */
import {
  createLobby, createPlayer, handleAction, startGame, buildSnapshot,
} from '../../server/dist/game/engine.js';

const { upgradeKiller, tryMove, netLockedRoom } = await import('../../server/dist/game/effects.js');
const {
  RELIC_ROOM,
  canDrawRelic,
  collapsibleRooms,
  drawRelic,
  isRoomGone,
  onSurvivorRoundStart,
  standingCollapsibleRooms,
} = await import('../../server/dist/game/collapse.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/**
 * 造一局墓穴 1对3（3 名幸存者，方便测"轮流移动"）。
 * 杀手固定用屠夫（不分裂成 4 个雕像棋子，省得干扰断言）。
 */
function mkCrypt() {
  const st = createLobby('T', 'h', 'H', content, 'crypt');
  st.mode = 'multi';
  const s1 = createPlayer('s1', 'S1', 's1');
  const s2 = createPlayer('s2', 'S2', 's2');
  const s3 = createPlayer('s3', 'S3', 's3');
  st.players = { h: st.players['h'], s1, s2, s3 };
  st.players['h'].faction = 'killer';
  st.players['h'].characterId = 'killer1';
  st.players['h'].ready = true;
  /** 多名幸存者必须**各自选好角色**，否则 startMultiGame 会拒绝开局 */
  [s1, s2, s3].forEach((p, i) => {
    p.faction = 'survivor';
    p.characterId = survCharIds[i];
    p.ready = true;
  });
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, 3);
  startGame(st, content, 'h');
  /** 开局准备的"确认进化"会挡住操作，测试里直接清掉 */
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const survivorIds = (st) => Object.values(st.players)
  .filter((p) => p.faction === 'survivor' && p.alive)
  .map((p) => p.id);
const killerPiece = (st) => Object.values(st.players).find((p) => p.faction === 'killer');

/** 把所有人放回起点，清掉场上标记，方便下一个场景 */
function reset(st) {
  st.collapsedRooms = [];
  st.pendingCollapse = false;
  st.pendingCollapseMoves = null;
  st.pendingEvolutionAck = null;
  st.blockades = [];
  st.coreMarkers = [];
  st.hunterTraps = {};
  st.zombies = [];
  st.trapPartRooms = [];
  st.trapRoomIds = [];
  st.noises = [];
  st.firecrackerRoomId = null;
  st.treasureChests = {};
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') {
      p.roomId = st.map.survivorStartRoomId;
      p.hp = p.maxHp;
      p.alive = true;
    } else {
      p.roomId = st.map.killerStartRoomId;
      p.stealth = false;
    }
  }
}

/** 把行动权交给某个幸存者（一般行动那套资源复位） */
function giveTurn(st, id) {
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.encounter = null;
  st.activeSurvivorIndex = st.turnOrder.indexOf(id);
  const p = st.players[id];
  p.mainActionUsed = false;
  p.actedThisRound = false;
  p.haltedThisRound = false;
}

/* ═══════════════════════════════ ① 地图数据 ═══════════════════════════════ */
console.log('=== ① 墓穴地图上的坍塌配置 ===');
{
  const st = mkCrypt();
  const rooms = collapsibleRooms(st);
  console.log(`   collapsibleRooms = ${JSON.stringify(rooms)}`);
  ok(rooms.length === 4, '可坍塌地点正好 4 个（对应 4 次升级）', `${rooms.length}`);
  ok(
    ['G5', 'G6', 'R4', 'R5'].every((r) => rooms.includes(r)),
    '就是 G5 / G6 / R4 / R5',
    rooms.join(','),
  );
  const marks = st.map.collapsedMarks ?? [];
  ok(marks.length === 4, '每个可坍塌地点都配了坍塌板块位置', `${marks.length}`);
  ok(marks.every((m) => Number.isFinite(m.rotation)), '每个板块都配了旋转角度', marks.map((m) => m.rotation).join(','));
  ok(marks.every((m) => rooms.includes(m.roomId)), '板块的 roomId 和可坍塌列表一致');
  ok(st.map.zones.some((z) => z.id === 'relic'), '地图上有遗物牌堆的界面区');
  const relicZone = st.map.zones.find((z) => z.id === 'relic');
  ok(relicZone.x > 700 && relicZone.y < 200, '遗物牌堆在右上角', `(${relicZone.x}, ${relicZone.y})`);
  ok(st.map.tokens.some((t) => t.kind === 'relicMarker'), 'R6 有遗物标记');
  const marker = st.map.tokens.find((t) => t.kind === 'relicMarker');
  ok(Boolean(marker.srcBack), '遗物标记配了背面图（可翻面）', String(marker.srcBack));

  /** 别的图不该有坍塌配置 */
  const other = createLobby('T2', 'h2', 'H2', content, 'mansion');
  ok(!(other.map.collapsibleRooms ?? []).length, '豪宅没有坍塌配置（墓穴专属）');
}

/* ═══════════════════════════════ ② 坍塌触发时机 ═══════════════════════════════ */
console.log('=== ② 升级 → 先坍塌、后进化 ===');
{
  const st = mkCrypt();
  const before = st.killerLevel;
  const logFrom = st.logs.length;
  upgradeKiller(st);
  console.log(`   level ${before} → ${st.killerLevel}`);
  ok(!st.pendingCollapse, '坍塌已当场结算完（没留在待办里）');
  ok(st.collapsedRooms.length === 1, '塌掉 1 个地点', st.collapsedRooms.join(','));
  ok(
    ['G5', 'G6', 'R4', 'R5'].includes(st.collapsedRooms[0]),
    '塌的是配置里的可坍塌地点',
    st.collapsedRooms[0],
  );
  /**
   * 时机：日志顺序必须是
   *   ①「进化到 N 级（在结算进化效果之前，先处理坍塌）」
   *   ②「某某坍塌了」
   *   ③「杀手进化！等级 1 → 2」
   */
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  const iAnnounce = mine.findIndex((t) => t.includes('在结算进化效果之前'));
  const iCollapse = mine.findIndex((t) => t.includes('坍塌') && t.includes('了！'));
  const iEvolve = mine.findIndex((t) => t.includes('杀手进化！'));
  console.log(`   本次升级日志：告知 @${iAnnounce} / 坍塌 @${iCollapse} / 进化 @${iEvolve}`);
  ok(iAnnounce >= 0, '先有"进化到几级"的告知');
  ok(iCollapse >= 0, '有坍塌公告');
  ok(iEvolve >= 0, '有进化公告');
  ok(iAnnounce < iCollapse, '告知 → 坍塌（顺序正确）');
  ok(iCollapse < iEvolve, '坍塌 → 进化（顺序正确）');
  ok(st.killerLevel === before + 1, '进化本身也照常发生了', `${st.killerLevel}`);
}

console.log('=== ③ 4 次升级 = 4 个地点，各塌一次、不会重复 ===');
{
  const st = mkCrypt();
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    upgradeKiller(st);
    st.pendingEvolutionAck = null;
    st.pendingUnlockChoice = null;
    st.pendingUnlockDiscard = false;
    /** 这组只关心"塌哪几个"，队列直接清掉（下一组专门测队列） */
    st.pendingCollapseMoves = null;
    seen.push(st.collapsedRooms[st.collapsedRooms.length - 1]);
  }
  console.log(`   依次塌了：${seen.join(' → ')}`);
  ok(seen.length === 4, '塌了 4 次');
  ok(new Set(seen).size === 4, '4 次都不重复');
  ok(standingCollapsibleRooms(st).length === 0, '可坍塌地点已全部塌完');
  ok(!seen.includes(undefined), '每次都真的挑到了一个地点', JSON.stringify(seen));
  /** 第 5 次升级时没有可塌的了 —— 不能再塌，也不该报错 */
  st.killerLevel = 5;
  st.pendingEvolutionAck = null;
  upgradeKiller(st);
  ok(st.collapsedRooms.length === 4, '没有可用地点时不会多塌', `${st.collapsedRooms.length}`);
}

/* ═══════════════════════════════ ④ 坍塌的清扫效果 ═══════════════════════════════ */
console.log('=== ④ 坍塌：清光标记 / 仆从，立绘保留 ===');
{
  const st = mkCrypt();
  reset(st);
  /** 强制只塌 R4 */
  st.map.collapsibleRooms = ['R4'];
  const k = killerPiece(st);
  const survs = survivorIds(st);
  k.roomId = 'R4';
  survs.forEach((id, i) => { st.players[id].roomId = i === 0 ? 'R4' : 'R2'; });

  /** 在 R4 上堆满各种标记 */
  st.coreMarkers = ['R4', 'R4', 'B1'];
  st.hunterTraps = {
    t1: { roomId: 'R4', kind: 'bear', revealed: false, removed: false },
    t2: { roomId: 'B1', kind: 'net', revealed: false, removed: false },
  };
  st.zombies = [{ id: 'z1', roomId: 'R4', art: 1 }, { id: 'z2', roomId: 'B1', art: 2 }];
  st.trapPartRooms = ['R4', 'G3'];
  st.trapRoomIds = ['R4'];
  st.noises = ['R4', 'G3'];
  st.treasureChests = { chestA: 'R4', chestB: 'G2' };
  st.firecrackerRoomId = 'R4';

  const hpBefore = st.players[survs[0]].hp;
  upgradeKiller(st);
  st.pendingEvolutionAck = null;

  ok(st.collapsedRooms.includes('R4'), 'R4 塌了', st.collapsedRooms.join(','));
  ok(st.coreMarkers.filter((r) => r === 'R4').length === 0, '核心标记清掉了');
  ok(st.coreMarkers.includes('B1'), '别处的核心标记不动');
  ok(!st.hunterTraps.t1, '猎手陷阱清掉了');
  ok(Boolean(st.hunterTraps.t2), '别处的猎手陷阱不动');
  ok(!st.zombies.some((z) => z.roomId === 'R4'), '僵尸清掉了');
  ok(st.zombies.some((z) => z.roomId === 'B1'), '别处的僵尸不动');
  ok(!st.trapPartRooms.includes('R4'), '陷阱零件标记清掉了');
  ok(!st.trapRoomIds.includes('R4'), '陷阱零件的防御效果也没了');
  ok(!st.noises.includes('R4'), '响声标记清掉了');
  ok(!st.treasureChests.chestA, '宝箱清掉了');
  ok(Boolean(st.treasureChests.chestB), '别处的宝箱不动');
  ok(st.firecrackerRoomId === null, '爆竹标记清掉了');
  ok(
    st.players[survs[0]].hp === hpBefore - 1,
    '屋里的幸存者受 1 点伤害',
    `${hpBefore} → ${st.players[survs[0]].hp}`,
  );
  ok(st.players[survs[1]].hp === st.players[survs[1]].maxHp, '不在屋里的幸存者不掉血');
  ok(Boolean(st.pendingCollapseMoves), '有人要离开废墟');
  ok(st.pendingCollapseMoves.currentId === survs[0], '第一个轮到的是屋里的幸存者', String(st.pendingCollapseMoves.currentId));
  ok(
    st.pendingCollapseMoves.queue.length === 1 && st.pendingCollapseMoves.queue[0] === k.id,
    '队列里只剩屋里的杀手（别处的幸存者不用动）',
    st.pendingCollapseMoves.queue.join(','),
  );

  /** 塌了的地点视作不存在 */
  ok(isRoomGone(st, 'R4'), 'isRoomGone(R4) = true');
  ok(!tryMove(st, survs[1], 'R4', 9), '再也走不进 R4');
}

/* ═══════════════════════════════ ⑤ 潜行杀手暴露 ═══════════════════════════════ */
console.log('=== ⑤ 坍塌：潜行的杀手暴露 ===');
{
  const st = mkCrypt();
  reset(st);
  st.map.collapsibleRooms = ['R4'];
  const k = killerPiece(st);
  k.roomId = 'R4';
  k.stealth = true;
  /** 女猎手「屏息」这类**非揭露类**加成，暴露后要留着 */
  st.killerTurnPowerBonus = 3;
  upgradeKiller(st);
  st.pendingEvolutionAck = null;
  ok(k.stealth === false, '潜行被解除（暴露了）');
  ok(st.killerTurnPowerBonus === 3, '非"揭露时"的加成不受影响（+3 力量还在）', `${st.killerTurnPowerBonus}`);
}

/* ═══════════════════════════════ ⑥ 轮流移动 + 杀手弃光手牌 ═══════════════════════════════ */
console.log('=== ⑥ 坍塌收尾：轮流走一步，杀手必须弃光手牌 ===');
{
  const st = mkCrypt();
  reset(st);
  st.map.collapsibleRooms = ['R4'];
  const k = killerPiece(st);
  const survs = survivorIds(st);
  k.roomId = 'R4';
  survs.forEach((id) => { st.players[id].roomId = 'R4'; });
  upgradeKiller(st);
  st.pendingEvolutionAck = null;
  /** 手牌补满好观察"弃光" */
  st.killerHand = ['c1', 'c2', 'c3'];

  const mover1 = st.pendingCollapseMoves.currentId;
  ok(mover1 === survs[0], '第 1 个轮到的是幸存者', String(mover1));
  /**
   * **收尾期间别的操作全被冻住**。
   * 这一步不能只靠界面按钮置灰 —— 网页可以直接发动作，所以服务端要硬拦。
   */
  let blocked = '';
  try {
    handleAction(st, st.players[mover1].controllerId, { type: 'move', toRoomId: 'R3' }, content);
  } catch (e) { blocked = e.message; }
  ok(blocked.includes('坍塌还没收尾'), '收尾期间不能做别的动作', blocked);
  /** 幸存者必须离开 —— 留在原地会被拒 */
  let threw = false;
  try {
    handleAction(st, st.players[mover1].controllerId, { type: 'collapseMove', toRoomId: null }, content);
  } catch { threw = true; }
  ok(threw, '幸存者留在原地会被拒（必须移动）');
  ok(st.players[mover1].roomId === 'R4', '被拒之后还留在原地（状态没有被改坏）');

  const dest1 = ['R3', 'B5'].find((r) => !isRoomGone(st, r));
  giveTurn(st, mover1);
  handleAction(st, st.players[mover1].controllerId, { type: 'collapseMove', toRoomId: dest1 }, content);
  ok(st.players[mover1].roomId === dest1, `第 1 个人走到了 ${dest1}`, String(st.players[mover1].roomId));
  ok(st.pendingCollapseMoves?.currentId === survs[1], '自动轮到第 2 个人', String(st.pendingCollapseMoves?.currentId));

  /** 剩下两个幸存者依次走 */
  for (const id of [survs[1], survs[2]]) {
    const cur = st.pendingCollapseMoves?.currentId;
    if (!cur) break;
    ok(cur === id, `轮到 ${id}`, String(cur));
    const dest = ['R3', 'B5'].find((r) => !isRoomGone(st, r));
    giveTurn(st, cur);
    handleAction(st, st.players[cur].controllerId, { type: 'collapseMove', toRoomId: dest }, content);
  }
  /** 最后轮到杀手 */
  ok(st.pendingCollapseMoves?.currentId === k.id, '幸存者走完才轮到杀手', String(st.pendingCollapseMoves?.currentId));
  ok(st.pendingCollapseMoves?.isKiller !== false, '快照会明确告诉他是杀手');
  handleAction(st, st.players[k.id].controllerId, { type: 'collapseMove', toRoomId: 'B5' }, content);
  ok(st.killerHand.length === 0, '杀手弃光了全部手牌', `3 → ${st.killerHand.length}`);
  ok(st.killerDiscard.includes('c1') && st.killerDiscard.includes('c2'), '弃掉的牌进了弃牌堆', `${st.killerDiscard.length}`);
  ok(k.roomId === 'B5', '杀手也移动了一步离开废墟', String(k.roomId));
  ok(st.pendingCollapseMoves === null, '队列走完就收尾了');

  /** 幸存者不该知道杀手弃了哪些牌、走到哪 */
  const destName = st.map.rooms.find((r) => r.id === 'B5').name;
  const survLogs = st.logs.filter((l) => l.vis === 'survivor').map((l) => l.text).join('\n');
  const killerLogs = st.logs.filter((l) => l.vis === 'killer').map((l) => l.text).join('\n');
  const allLogs = st.logs.filter((l) => l.vis === 'all').map((l) => l.text).join('\n');
  ok(allLogs.includes('全部手牌'), '双方都看到"杀手弃光了全部手牌"');
  ok(!allLogs.includes('c1') && !allLogs.includes('c2'), '但看不到弃的是哪几张牌');
  ok(survLogs.includes('杀手离开了坍塌的'), '幸存者只知道杀手离开了');
  /** 幸存者侧任何日志都不该提到杀手去的那个地点 */
  const survMentionsDest = st.logs
    .filter((l) => l.vis === 'survivor')
    .some((l) => l.text.includes(destName));
  ok(!survMentionsDest, '幸存者看不到杀手走去哪', destName);
  ok(killerLogs.includes(destName), '杀手自己看得到移动去向', destName);
}

console.log('=== ⑥b 坍塌伤害遇到古代护符：要能问得出来、答得下去 ===');
{
  const st = mkCrypt();
  reset(st);
  st.map.collapsibleRooms = ['R4'];
  const k = killerPiece(st);
  const survs = survivorIds(st);
  k.roomId = 'R4';
  survs.forEach((id) => { st.players[id].roomId = 'R4'; });
  /** 给屋里第一个幸存者一个古代护符：坍塌那 1 点伤害会先问他一句 */
  const guarded = st.players[survs[0]];
  guarded.items = { ...guarded.items, amulet: 1 };

  upgradeKiller(st);
  st.pendingEvolutionAck = null;
  /**
   * 护符必须**还能答**：如果收尾期间把 `confirmAmulet` 也冻住，
   * 玩家就没法回应，整个对局卡死在坍塌里。
   */
  ok(Boolean(st.pendingAmulet), '坍塌伤害触发了护符询问', JSON.stringify(st.pendingAmulet));
  handleAction(st, guarded.id, { type: 'confirmAmulet', use: true }, content);
  ok(!st.pendingAmulet, '护符能正常确认（没被收尾冻住）');
  ok(guarded.items.amulet === 0 || guarded.items.amulet === undefined, '护符被用掉了');

  /** 答完之后照常收尾 */
  const cur = st.pendingCollapseMoves?.currentId;
  ok(Boolean(cur), '护符答完还能继续离开废墟', String(cur));
  giveTurn(st, cur);
  const dest = ['R3', 'B5'].find((r) => !isRoomGone(st, r));
  handleAction(st, st.players[cur].controllerId, { type: 'collapseMove', toRoomId: dest }, content);
  ok(st.players[cur].roomId === dest, '收尾照常进行', String(st.players[cur].roomId));
}

console.log('=== ⑥c 坍塌时被捕网的幸存者：网直接解除，然后受伤 + 移动 ===');
{
  const st = mkCrypt();
  reset(st);
  st.map.collapsibleRooms = ['R4'];
  const k = killerPiece(st);
  const survs = survivorIds(st);
  k.roomId = 'R4';
  /** 屋里第一个幸存者被捕网锁住（本回合不能离开） */
  const caught = st.players[survs[0]];
  caught.roomId = 'R4';
  st.players[survs[1]].roomId = 'R2';
  st.netLocks = [{ roomId: 'R4', playerId: caught.id, round: st.round }];
  /** 捕网陷阱本身已经触发掉了（一次性），所以场上没有陷阱对象 */
  ok(netLockedRoom(st, caught.id) === 'R4', '前提：他被捕网锁在 R4');

  const hpBefore = caught.hp;
  upgradeKiller(st);
  st.pendingEvolutionAck = null;

  ok(st.collapsedRooms.includes('R4'), 'R4 塌了');
  ok(netLockedRoom(st, caught.id) === null, '坍塌把他的捕网效果直接移除了');
  ok(!(st.netLocks ?? []).some((l) => l.roomId === 'R4'), 'netLocks 里没有 R4 的残留');
  ok(caught.hp === hpBefore - 1, '然后照常受伤', `${hpBefore} → ${caught.hp}`);

  /** 关键：锁清了才走得出去（否则"必须移动"会卡死） */
  const cur = st.pendingCollapseMoves?.currentId;
  ok(cur === caught.id, '轮到他离开', String(cur));
  const dest = ['R3', 'B5'].find((r) => !isRoomGone(st, r));
  giveTurn(st, caught.id);
  handleAction(st, st.players[caught.id].controllerId, { type: 'collapseMove', toRoomId: dest }, content);
  ok(caught.roomId === dest, '网解除后他能移动出去', String(caught.roomId));

  /** 对照：不在屋里的幸存者，捕网纹丝不动 */
  const st2 = mkCrypt();
  reset(st2);
  st2.map.collapsibleRooms = ['R4'];
  const k2 = killerPiece(st2);
  const survs2 = survivorIds(st2);
  k2.roomId = 'R4';
  survs2.forEach((id) => { st2.players[id].roomId = 'R2'; });
  st2.netLocks = [{ roomId: 'R2', playerId: survs2[0], round: st2.round }];
  upgradeKiller(st2);
  st2.pendingEvolutionAck = null;
  ok(netLockedRoom(st2, survs2[0]) === 'R2', '别处的捕网不受影响');
}

console.log('=== ⑦ 遗物室 R6：额外行动抽遗物 + 标记翻面 ===');
{
  const st = mkCrypt();
  reset(st);
  const survs = survivorIds(st);
  const s = st.players[survs[0]];
  ok(RELIC_ROOM === 'R6', '遗物室是 R6', RELIC_ROOM);
  ok(st.relicMarkerFaceUp === true, '开局遗物标记正面朝上');
  ok(st.relicDeck.length === 5, '开局遗物牌堆有 5 张（content 里的 5 张遗物）', `${st.relicDeck.length}`);
  giveTurn(st, s.id);
  s.roomId = RELIC_ROOM;
  s.extraActionUsedThisTurn = false;
  /** 临时把牌堆掏空：验证"没牌就抽不了"，然后恢复 */
  const savedDeck = [...st.relicDeck];
  st.relicDeck = [];
  ok(!canDrawRelic(st, s), '牌堆为空时抽不了（不会报错，按钮也不出现）');
  st.relicDeck = savedDeck;

  /** 塞一张测试遗物进去，验证整套抽取流程 */
  st.cardById = {
    ...st.cardById,
    test_relic: { id: 'test_relic', name: '测试遗物', type: 'relic', text: '测试', effects: [] },
  };
  st.relicDeck = ['test_relic'];
  ok(canDrawRelic(st, s), '牌堆有牌 + 人在 R6 + 标记正面 → 可以抽');
  const other = st.players[survs[1]];
  other.roomId = 'R2';
  ok(!canDrawRelic(st, other), '不在 R6 的人不能抽');
  const cardId = drawRelic(st, s);
  ok(cardId === 'test_relic', '抽到了牌堆顶那张', String(cardId));
  ok(st.relicMarkerFaceUp === false, '抽完标记翻面');
  ok(!canDrawRelic(st, s), '翻面后本大回合不能再抽');
  ok(st.relicDeck.length === 0, '牌堆少了一张');

  /** 下一个幸存者大回合翻回正面 */
  onSurvivorRoundStart(st);
  ok(st.relicMarkerFaceUp === true, '新的大回合标记翻回正面');
  ok(canDrawRelic(st, s) === false, '牌堆空了所以还是抽不了（标记已正面）');

  /** 走 handleAction 的完整路径 */
  st.relicDeck = ['test_relic'];
  st.relicMarkerFaceUp = true;
  s.extraActionUsedThisTurn = false;
  handleAction(st, s.id, { type: 'drawRelic' }, content);
  ok(st.relicMarkerFaceUp === false, '通过动作抽遗物也会翻面');
  ok(s.extraActionUsedThisTurn === true, '抽遗物占掉额外行动');

  /** 塌了遗物室就没有了 */
  st.collapsedRooms = ['R6'];
  ok(!canDrawRelic(st, s), 'R6 塌了之后不能再抽遗物');
}

/* ═══════════════════════════════ ⑧ 快照 ═══════════════════════════════ */
console.log('=== ⑧ 快照字段 ===');
{
  const st = mkCrypt();
  reset(st);
  st.map.collapsibleRooms = ['R4'];
  const k = killerPiece(st);
  const s = st.players[survivorIds(st)[0]];
  k.roomId = 'R4';
  s.roomId = 'R4';
  upgradeKiller(st);
  st.pendingEvolutionAck = null;
  const snap = buildSnapshot(st, s.controllerId);
  ok(Array.isArray(snap.collapsedRooms) && snap.collapsedRooms.includes('R4'), '快照有 collapsedRooms', JSON.stringify(snap.collapsedRooms));
  ok(snap.relicRoomId === RELIC_ROOM, '快照有 relicRoomId', String(snap.relicRoomId));
  ok(snap.relicMarkerFaceUp === true, '快照有 relicMarkerFaceUp');
  ok(typeof snap.relicDeckCount === 'number', '快照有 relicDeckCount', String(snap.relicDeckCount));
  ok(snap.pileCounts.relic === st.relicDeck.length, 'pileCounts.relic 和真实牌堆一致', String(snap.pileCounts.relic));
  ok(snap.pileTops !== undefined && 'relic' in snap.pileTops, 'pileTops 里有 relic');

  /** 轮到那个人自己时才给他 options */
  const mover = st.pendingCollapseMoves.currentId;
  const moveSnap = buildSnapshot(st, st.players[mover].controllerId);
  ok(Boolean(moveSnap.pendingCollapseMoves), '待移动的人在快照里能看到面板');
  ok(moveSnap.pendingCollapseMoves.currentId === mover, '面板里就是他本人');
  ok(moveSnap.pendingCollapseMoves.options.length > 0, '给了可选目的地', moveSnap.pendingCollapseMoves.options.join(','));
  ok(moveSnap.pendingCollapseMoves.waiting === false, '不是"等待别人"状态');

  /** 别人看到的只有"在等谁" */
  const otherController = Object.values(st.players)
    .filter((p) => p.controllerId !== st.players[mover].controllerId)
    .map((p) => p.controllerId)[0];
  const otherSnap = buildSnapshot(st, otherController);
  ok(otherSnap.pendingCollapseMoves.waiting === true, '别人只看到"正在等谁"');
  ok(otherSnap.pendingCollapseMoves.options.length === 0, '别人拿不到目的地选项');
}

/* ═══════════════════════════════ ⑩ 五张遗物牌 ═══════════════════════════════ */
console.log('=== ⑩ 遗物牌堆与 5 张遗物牌 ===');
{
  const relic = await import('../../server/dist/game/relic.js');

  /** ① 牌堆：开局从 content 读进 5 张，洗匀 */
  const st = mkCrypt();
  reset(st);
  st.relicDeck = Object.keys(st.cardById).filter((id) => id.startsWith('relic_'));
  const allRelicCards = Object.keys(st.cardById).filter(
    (id) => st.cardById[id]?.type === 'relic',
  );
  console.log('   content 里的遗物牌:', allRelicCards.join(', '));
  ok(allRelicCards.length === 5, 'content 里正好 5 张遗物牌', `${allRelicCards.length}`);
  for (const want of ['relic_key', 'relic_mirror', 'relic_shield', 'relic_guard', 'relic_insight']) {
    ok(allRelicCards.includes(want), `有「${st.cardById[want]?.name ?? want}」`, want);
  }

  /** ② 鑰匙：立刻上钥匙立牌（和搜索牌堆的钥匙逻辑一致），卡留在面前；该响的要响 */
  {
    const g = mkCrypt();
    reset(g);
    const s = g.players[survivorIds(g)[0]];
    const before = g.keysCollected;
    relic.applyRelicKey(g, s);
    ok(g.keysCollected === before + 1, '鑰匙：立刻放上钥匙立牌', `${before} → ${g.keysCollected}`);
    relic.giveRelic(g, s, 'relic_key');
    ok(relic.hasRelic(s, 'key'), '鑰匙留在面前当立牌上那把');

    /**
     * **响声**：和发现阶段 / 手提箱同一套判断（`makesNoise || isKeyCard`），
     * 而且**不套用安娜「小心谨慎」** —— 抽遗物不算搜索。
     */
    const { resolveRelicCard } = await import('../../server/dist/game/collapse.js');
    const g2 = mkCrypt();
    reset(g2);
    /** 用安娜来验证"搜索的例外不适用于抽遗物" */
    const anna = survivorIds(g2)[0];
    g2.players[anna].characterId = 'survivor1';
    g2.players[anna].roomId = 'R6';
    g2.noises = [];
    resolveRelicCard(g2, g2.players[anna], 'relic_key');
    ok(g2.noises.includes('R6'), '摸到鑰匙在遗物室发出响声（该响的要响）', JSON.stringify(g2.noises));
    ok(g2.keysCollected >= 1, '响声的同时钥匙照常上架', `${g2.keysCollected}`);
    /** 对照：不带响声的遗物不响 */
    const g3 = mkCrypt();
    reset(g3);
    const who = survivorIds(g3)[0];
    g3.players[who].roomId = 'R6';
    g3.noises = [];
    resolveRelicCard(g3, g3.players[who], 'relic_shield');
    ok(!g3.noises.includes('R6'), '剛毅之盾不响（卡面没标响声）', JSON.stringify(g3.noises));
  }

  /** ③ 鏡之門戶：只能传送到 🌀 螺旋地点；不踩陷阱、不看门 */
  {
    const g = mkCrypt();
    reset(g);
    const s = g.players[survivorIds(g)[0]];
    relic.giveRelic(g, s, 'relic_mirror');
    const targets = relic.mirrorTargets(g);
    console.log('   墓穴的螺旋地点:', targets.join(', '));
    ok(targets.length === 1 && targets[0] === 'G2', '目标是螺旋地点 G2 儀式堂', targets.join(','));
    ok(relic.canUseMirror(g, s), '有遗物 + 有地点 + 没做过额外行动 → 能用');
    let threw = false;
    try { relic.useMirror(g, s, 'R2'); } catch { threw = true; }
    ok(threw, '不能传到非螺旋地点');
    s.roomId = 'B3';
    relic.useMirror(g, s, 'G2');
    ok(s.roomId === 'G2', '传送到 G2', String(s.roomId));
    ok(s.extraActionUsedThisTurn === true, '占掉额外行动');
    ok(!relic.hasRelic(s, 'mirror'), '用完从背包拿掉（一次性）');
    ok(g.survivorDiscard.includes('relic_mirror'), '用完进**普通弃牌堆**（双方点弃牌堆看得到）');
    ok(!(s.items.relic_mirror > 0), '不再占背包格', JSON.stringify(s.items));
    /** 塌了的地点不能传 */
    const g2 = mkCrypt();
    reset(g2);
    const s2 = g2.players[survivorIds(g2)[0]];
    relic.giveRelic(g2, s2, 'relic_mirror');
    g2.collapsedRooms = ['G2'];
    ok(relic.mirrorTargets(g2).length === 0, '螺旋地点塌了就不能去');
    ok(!relic.canUseMirror(g2, s2), '没有可去的地点时用不了');
  }

  /** ④ 剛毅之盾：每次遭遇 +1，且不占防御物品名额（∞ 不弃） */
  {
    const g = mkCrypt();
    reset(g);
    const s = g.players[survivorIds(g)[0]];
    ok(relic.shieldDefenseBonus(g, s) === 0, '没有盾时 +0');
    relic.giveRelic(g, s, 'relic_shield');
    ok(relic.shieldDefenseBonus(g, s) === 1, '有盾时 +1');
    /** 反复用：加成一直在（角标 ∞） */
    ok(relic.shieldDefenseBonus(g, s) === 1, '再问一次还是 +1（∞ 不会用掉）');
    ok(relic.hasRelic(s, 'shield'), '盾一直在面前');
  }

  /** ⑤ 守護之石：遭遇中的直接伤害也能挡，用了不弃置 */
  {
    const g = mkCrypt();
    reset(g);
    const s = g.players[survivorIds(g)[0]];
    const { applyDamage } = await import('../../server/dist/game/effects.js');
    /** 没有石头时，遭遇中的伤害直接扣（不会问） */
    g.phase = 'encounter';
    applyDamage(g, s.id, 1, killerPiece(g).id);
    ok(!g.pendingAmulet, '没有守護之石时遭遇伤害不会问');
    ok(s.hp === s.maxHp - 1, '伤害直接扣掉', `${s.hp}/${s.maxHp}`);

    /** 有石头：遭遇中也问 */
    const g2 = mkCrypt();
    reset(g2);
    const s2 = g2.players[survivorIds(g2)[0]];
    relic.giveRelic(g2, s2, 'relic_guard');
    g2.phase = 'encounter';
    applyDamage(g2, s2.id, 1, killerPiece(g2).id);
    ok(Boolean(g2.pendingAmulet), '有守護之石时遭遇伤害会问一句');
    ok(g2.pendingAmulet.relic === 'guard', '问的是守護之石而不是护符', String(g2.pendingAmulet?.relic));
    ok(s2.hp === s2.maxHp, '还没确认前不掉血');
    /** 确认使用：免伤 → 石头用掉进普通弃牌堆（只有剛毅之盾是 ∞） */
    const { confirmAmuletUse } = await import('../../server/dist/game/killerCards.js');
    confirmAmuletUse(g2, true);
    ok(s2.hp === s2.maxHp, '出示后免掉这次伤害');
    ok(relic.hasRelic(s2, 'guard') === false, '守護之石用掉（一次性，它不是 ∞）');
    ok(g2.survivorDiscard.includes('relic_guard'), '守護之石进普通弃牌堆');
    /** 对照：古代护符在遭遇中不问 */
    const g3 = mkCrypt();
    reset(g3);
    const s3 = g3.players[survivorIds(g3)[0]];
    s3.items = { ...s3.items, amulet: 1 };
    g3.phase = 'encounter';
    applyDamage(g3, s3.id, 1, killerPiece(g3).id);
    ok(!g3.pendingAmulet, '古代护符在遭遇中不问（老规矩没被改坏）');
    /** 非遭遇：护符照旧会问 */
    const g4 = mkCrypt();
    reset(g4);
    const s4 = g4.players[survivorIds(g4)[0]];
    s4.items = { ...s4.items, amulet: 1 };
    g4.phase = 'survivorMain';
    applyDamage(g4, s4.id, 1, killerPiece(g4).id);
    ok(g4.pendingAmulet?.relic === null || g4.pendingAmulet?.relic === undefined,
      '非遭遇时问的还是古代护符', String(g4.pendingAmulet?.relic));
  }

  /** ⑥ 洞察之球：特殊行动，用了**依次摸两张牌** */
  {
    const g = mkCrypt();
    reset(g);
    const s = g.players[survivorIds(g)[0]];
    relic.giveRelic(g, s, 'relic_insight');
    /** G1 是可搜索地点 */
    s.roomId = 'R2';
    ok(!relic.canUseInsight(g, s), '不在可搜索地点时用不了');
    s.roomId = 'G1';
    ok(relic.canUseInsight(g, s), '在可搜索地点 G1 可以用');

    /** 把杀手挪开，否则"与杀手同地不能搜索"会拦下来 */
    killerPiece(g).roomId = 'B1';
    giveTurn(g, s.id);
    const deckBefore = g.searchDeck.length;
    const handBefore = JSON.stringify(s.items);
    handleAction(g, s.id, { type: 'useInsightOrb' }, content);
    /** 一次行动摸走 2 张牌 */
    ok(
      g.searchDeck.length === deckBefore - 2,
      '洞察之球一次摸走 2 张牌',
      `${deckBefore} → ${g.searchDeck.length}`,
    );
    ok(!relic.hasRelic(s, 'insight'), '洞察之球用掉（一次性）');
    ok(!(s.items.relic_insight > 0), '从背包移除', handBefore);
    ok(g.survivorDiscard.includes('relic_insight'), '用掉进普通弃牌堆');
    ok(s.mainActionUsed === true, '占一次一般行动（特殊行动属于第 4 项）');
    /** 它**不是**"搜索物资"，所以不占用本回合的搜索次数 */
    ok(s.searchedThisTurn === false, '不占「本回合搜索过」——它本身不是搜索那个按钮');
  }

  /** ⑦ 遗物进背包：和普通物品一模一样的格子规则（上限 3，超了本人自选弃） */
  {
    const { resolveRelicCard } = await import('../../server/dist/game/collapse.js');
    /** 拿一件遗物，占一格 */
    const g = mkCrypt();
    reset(g);
    const s = g.players[survivorIds(g)[0]];
    s.items = {};
    resolveRelicCard(g, s, 'relic_shield');
    ok(s.items.relic_shield === 1, '拿到遗物 = 背包里多一格', JSON.stringify(s.items));
    /** 背包满了（3 格）再拿：走既有的"请自选弃牌"流程 */
    const g2 = mkCrypt();
    reset(g2);
    const s2 = g2.players[survivorIds(g2)[0]];
    s2.items = { axe: 1, lime: 1, herb: 1 };
    ok(g2.players[s2.id].items && Object.keys(s2.items).length === 3, '前提：背包正好 3 格（满了）');
    resolveRelicCard(g2, s2, 'relic_guard');
    ok(
      g2.pendingItemDiscard?.playerId === s2.id,
      '超过上限 → 那名幸存者自选弃哪件（和普通物品同一套流程）',
      JSON.stringify(g2.pendingItemDiscard),
    );
    ok(g2.pendingItemDiscard?.count === 1, '要弃 1 件', String(g2.pendingItemDiscard?.count));
  }

  /** ⑧ 遗物卡不吃搜索牌堆那套（不是搜索牌） */
  {
    const g = mkCrypt();
    const { isKeyCard, buildSearchDeck } = await import('../../server/dist/game/effects.js');
    const relicCards = Object.keys(g.cardById)
      .filter((id) => g.cardById[id]?.type === 'relic')
      .map((id) => g.cardById[id]);
    ok(
      relicCards.every((c) => !isKeyCard(c)),
      '遗物牌不会被当成"搜索钥匙牌"（effects 是空的）',
    );
    const deck = buildSearchDeck(relicCards);
    ok(!deck.some((id) => id.startsWith('relic_')), '遗物牌不会混进搜索牌堆');
  }
}

/* ═══════════════════════════════ ⑨ 别的图不受影响 ═══════════════════════════════ */
console.log('=== ⑨ 别的图不会被墓穴规则影响 ===');
{
  const st = createLobby('T3', 'h3', 'H3', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h3: st.players['h3'], s: bs };
  st.players['h3'].faction = 'killer';
  st.players['h3'].characterId = 'killer1';
  st.players['h3'].ready = true;
  st.hostId = 'h3';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h3');
  st.pendingEvolutionAck = null;
  const lv = st.killerLevel;
  upgradeKiller(st);
  ok(st.collapsedRooms.length === 0, '豪宅升级不会触发坍塌');
  ok(st.killerLevel === lv + 1, '豪宅升级照常', `${st.killerLevel}`);
  ok(!st.pendingCollapse, 'pendingCollapse 保持 false');
  ok((st.relicDeck ?? []).length === 0, '豪宅没有遗物牌堆');
}

/* ═══════════ ⑩ 1对1 / 单人：坍塌收尾也得真的走得了（回归） ═══════════ */
console.log('=== ⑩ 1对1 下的坍塌收尾 ===');
{
  /**
   * ⚠ 上面那些用例都是 **1对3（multi）**，而 `multi` 里 `state.players` 的键
   * **恰好就是 socketId**，所以"传棋子 id 当操控者"也能过 ——
   * 于是掩盖了这个 bug：
   *
   *   `resolveActorId` 的 `collapseMove` 分支返回的是 **socketId**，
   *   而 `handleAction` 要拿它去 `state.players` 里找棋子。
   *   solo / duo / vs2 下 `state.players` 的键是 **棋子 id**（`h3__surv1`），
   *   查不到 → 直接抛「不在房间内」→ 被压到的幸存者**什么都点不了**。
   *
   * 这里用 1对1 真跑一遍：传**操控者 id**（真实路径），必须能走。
   */
  const st = createLobby('T3', 'h3', 'H3', content, 'crypt');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h3: st.players['h3'], s: bs };
  st.players['h3'].faction = 'killer';
  st.players['h3'].characterId = 'killer1';
  st.players['h3'].ready = true;
  st.hostId = 'h3';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h3');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.map.collapsibleRooms = ['R4'];

  /** 造一个人在被压房间里 */
  const crashRoom = 'R4';
  const survs = survivorIds(st);
  const k = killerPiece(st);
  const caught = survs[0];
  st.players[caught].roomId = crashRoom;
  k.roomId = 'B5';
  ok(st.players[caught].controllerId === 's', '1对1 里幸存者的操控者是 s（不是棋子 id）', st.players[caught].controllerId);
  ok(Boolean(st.players[caught]), '**棋子 id 才是 players 的键** —— 所以 collapseMove 必须解析成棋子 id');

  upgradeKiller(st);
  ok(Boolean(st.pendingCollapseMoves), '坍塌收尾起来了', String(st.pendingCollapseMoves?.currentId));
  ok(st.pendingCollapseMoves.currentId === caught, '先轮到被压到的幸存者');

  /** ★ 关键：用**操控者 id** 走这一步（以前会报"不在房间内"） */
  let err = '';
  const dest = ['R3', 'B5'].find((r) => !isRoomGone(st, r));
  try {
    handleAction(st, 's', { type: 'collapseMove', toRoomId: dest }, content);
  } catch (e) { err = e.message; }
  ok(err === '', '**1对1 下用操控者 id 能正常走这一步**（以前报"不在房间内"）', err);
  ok(st.players[caught].roomId === dest, `人被移到了 ${dest}`, String(st.players[caught].roomId));

  /** 轮到杀手，也要能走 */
  ok(st.pendingCollapseMoves?.currentId === k.id, '接着轮到杀手', String(st.pendingCollapseMoves?.currentId));
  err = '';
  try {
    handleAction(st, st.players[k.id].controllerId, { type: 'collapseMove', toRoomId: 'B3' }, content);
  } catch (e) { err = e.message; }
  ok(err === '', '杀手用操控者 id 也能走', err);
  ok(st.pendingCollapseMoves === null, '收尾结束');
}

console.log(`\n墓穴规则：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
