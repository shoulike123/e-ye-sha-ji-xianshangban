/**
 * **2对3 + 墓穴 + 变体1：两名杀手的进化流程必须"各自走完每一段"**。
 *
 * 用户口径（原话）：
 *   「所有杀手执行进化效果都在坍塌结算完，进化类特性卡结算完之后了吧。
 *     每一段流程都要各自进行，不能共同进行」
 *
 * 也就是每名杀手各自的顺序都必须是：
 *   ① 确认进化效果 → ② 坍塌结算 → ③ 进化类特性卡 → ④ 执行进化效果
 * 而且要**一名杀手走完这四段，才轮到另一名**，不能两人共用一段、也不能合并结算。
 *
 * 本测试盯四件事：
 *   a) 确认之前：坍塌没发生、谁的力量都没变（效果绝不在确认前结算）
 *   b) 先手确认后：坍塌**先**发生；废墟没走完之前，特性与效果都**不许**结算
 *   c) 坍塌走完后：先手的「特性 → 效果」依次结算；**后手此刻什么都没拿到**
 *   d) 切给后手确认后：才结算他自己的「特性 → 效果」；全场只塌一次
 *      （墓穴规则写死"每次升级塌一个地点、一共 4 次"，所以坍塌是**队伍级**的，
 *        不是每人各塌一次 —— 地图上只有 4 个可坍塌地点，每人一次会塌 8 次）
 *
 * 跑法：node scripts/tests/evolution-order-2v3-crypt.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { standingCollapsibleRooms, collapseMoveOptions } from '../../server/dist/game/collapse.js';
/**
 * ⚠ 必须用 `effects.upgradeKiller`（engine 注入的壳），**不能直接调
 * `evolution.runUpgrade`** —— 墓穴的坍塌拦截会让 `runUpgrade` 第一次就 return
 * （只记"确认之后要塌"），是 engine 的 `setUpgradeHandler` 负责**补跑一次**
 * 并把「确认新效果」面板挂出来。测试绕开它就会看到"没有待确认的进化"。
 */
const { upgradeKiller } = await import('../../server/dist/game/effects.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 2对3：屠夫(killer1，2 级力量 +1) + 扼杀者(killer8，2 级多 1 个核心标记) */
const st = createLobby('T', 'k1', 'K1', content, 'crypt');
st.mode = '2v3';
st.variant1 = true;
st.players = (() => {
  const map = { k1: st.players.k1 };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  return map;
})();
st.hostId = 'k1';
st.players.k1.faction = 'killer';
st.players.k1.characterId = 'killer1';
st.players.k2.faction = 'killer';
st.players.k2.characterId = 'killer8';
['s1', 's2', 's3'].forEach((id, i) => {
  st.players[id].faction = 'survivor';
  st.players[id].characterId = survCharIds[i];
});
for (const p of Object.values(st.players)) p.ready = true;
st.players.k1.orderPick = 'first';
st.players.k2.orderPick = 'second';
startGame(st, content, 'k1');
/** 开局准备的确认面板 / 特性抽牌，测试里直接清掉 */
st.pendingEvolutionAck = null;
st.pendingUnlockChoice = null;
st.pendingUnlockDiscard = false;
st.phase = 'killerMain';

/** 只留一个坍塌点，让"塌哪间"确定 */
const allCollapsible = standingCollapsibleRooms(st);
const crashRoom = allCollapsible[0];
st.collapsedRooms = allCollapsible.filter((id) => id !== crashRoom);

/** 先手 = 屠夫，后手 = 扼杀者 */
const first = st.players[st.killerIds[0]];
const second = st.players[st.killerIds[1]];
console.log(`  先手 ${first.name}(${first.characterId}) / 后手 ${second.name}(${second.characterId})；坍塌点 = ${crashRoom}`);

/** 给**先手**一张「09 慢热杀手」（每次升级 +1 力量）—— 用来区分"特性"和"效果"两段 */
st.traits = { ...(st.traits ?? {}), [first.id]: ['trait_k09'] };

/** 把所有人挪出废墟（先不测走位），只让一名幸存者留在里面，稍后再单独验证"走完才继续" */
const survs = Object.values(st.players).filter((p) => p.faction === 'survivor');
const away = st.map.rooms.find((r) => r.id !== crashRoom && !st.collapsedRooms.includes(r.id))?.id;
for (const p of [...st.killerIds.map((id) => st.players[id]), ...survs]) p.roomId = away;
survs[0].roomId = crashRoom;

const powerOf = (id) => st.killers[id].power;
const coresOf = () => (st.coreMarkers ?? []).length;
const tryIt = (socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

const logIndex = (from, needle) => st.logs.slice(from).findIndex((l) => l.text.includes(needle));

/** 触发一次升级（走 engine 的注入壳：墓穴那套"先记着、确认后才塌"在里面） */
const runUpgradeStub = () => upgradeKiller(st);

/* ═══════════ ① 升级瞬间：确认之前什么都不许结算 ═══════════ */
console.log('=== ① 升级挂出确认面板：坍塌与效果都必须等在确认之后 ===');
const pFirst0 = powerOf(first.id);
const pSecond0 = powerOf(second.id);
const cores0 = coresOf();
runUpgradeStub();
ok(st.killerLevel === 2, '队伍升到 2 级', String(st.killerLevel));
ok((st.pendingEvolutionAck?.killerIds ?? []).length === 2,
  '**两名杀手共用一张"待确认"面板**（各自确认，不是各挂一张）',
  JSON.stringify(st.pendingEvolutionAck?.killerIds));
ok((st.collapsedRooms ?? []).length === allCollapsible.length - 1,
  '**确认之前坍塌还没发生**（只有测试自己预清的记录）',
  `${st.collapsedRooms.length} vs 预清 ${allCollapsible.length - 1}`);
ok(powerOf(first.id) === pFirst0 && powerOf(second.id) === pSecond0,
  '**确认之前谁的力量都没变**（效果不在确认前结算）',
  `${pFirst0}→${powerOf(first.id)} / ${pSecond0}→${powerOf(second.id)}`);
ok(coresOf() === cores0, '确认之前核心标记也没变', String(coresOf()));

/* ═══════════ ② 先手确认：坍塌先塌，且没走完不算完 ═══════════ */
console.log('=== ② 先手确认 → 先坍塌；废墟没走完之前不许进下一段 ===');
const logFrom = st.logs.length;
const ackFirst = tryIt(first.controllerId, { type: 'ackEvolution' });
ok(!ackFirst, '先手能确认', String(ackFirst ?? ''));
ok((st.collapsedRooms ?? []).includes(crashRoom), '**先手确认之后才坍塌**', crashRoom);
ok(Boolean(st.pendingCollapseMoves), '废墟里有人 → 挂出"轮流走一步"',
  String(st.pendingCollapseMoves?.currentId));
ok(powerOf(first.id) === pFirst0,
  '**坍塌没走完，先手的力量也还没加**（特性/效果都排在坍塌之后）',
  `${pFirst0} → ${powerOf(first.id)}`);
ok(logIndex(logFrom, '已确认进化效果') >= 0 && logIndex(logFrom, '坍塌') >= 0,
  '日志里有"确认"和"坍塌"');
ok(logIndex(logFrom, '已确认进化效果') < logIndex(logFrom, '坍塌'),
  '**顺序：确认 → 坍塌**');
ok(logIndex(logFrom, '慢热杀手') < 0 && logIndex(logFrom, '进化：永久力量') < 0,
  '**这时候还没跑特性、也没跑效果**（两段都排在坍塌之后）');

/** 把废墟里的人走完 */
{
  let guard = 0;
  while (st.pendingCollapseMoves && guard < 8) {
    guard += 1;
    const mover = st.players[st.pendingCollapseMoves.currentId];
    const opts = collapseMoveOptions(st, mover);
    const err = tryIt(mover.controllerId, { type: 'collapseMove', toRoomId: opts[0] ?? null });
    if (err) { ok(false, `${mover.name} 能离开废墟`, err); break; }
  }
  ok(!st.pendingCollapseMoves, '废墟走完了');
}

/* ═══════════ ③ 走完之后：先手自己的「特性 → 效果」才结算 ═══════════ */
console.log('=== ③ 坍塌走完 → 先手结算自己的特性与效果；后手什么都没拿到 ===');
ok(powerOf(first.id) === pFirst0 + 2,
  '**先手：特性 09（+1）+ 屠夫 2 级效果（+1）= +2 力量**',
  `${pFirst0} → ${powerOf(first.id)}`);
ok(logIndex(logFrom, '慢热杀手') >= 0, '**特性卡那一段真的跑了**（09 慢热杀手）');
ok(logIndex(logFrom, '进化：永久力量') >= 0, '**效果那一段也跑了**（永久力量 +1）');
ok(
  logIndex(logFrom, '坍塌') < logIndex(logFrom, '慢热杀手') &&
  logIndex(logFrom, '慢热杀手') < logIndex(logFrom, '进化：永久力量'),
  '**顺序：坍塌 → 特性 → 效果**',
  `坍塌@${logIndex(logFrom, '坍塌')} 特性@${logIndex(logFrom, '慢热杀手')} 效果@${logIndex(logFrom, '进化：永久力量')}`,
);
ok(powerOf(second.id) === pSecond0 && coresOf() === cores0,
  '**后手此刻什么都没结算**（力量、核心标记都没动 —— 两人不共同结算）',
  `力量 ${pSecond0}→${powerOf(second.id)}，核心 ${cores0}→${coresOf()}`);
ok(Boolean(st.pendingEvolutionAck), '先手做完，面板还在（等后手）');
ok((st.pendingEvolutionAck?.doneKillerIds ?? []).includes(first.id),
  '记下"先手已做完"', JSON.stringify(st.pendingEvolutionAck?.doneKillerIds));
ok(st.killerId === second.id, '**回合切给后手**（不是两人同时进行）', String(st.killerId));

/* ═══════════ ④ 后手确认：才结算他自己的那两段 ═══════════ */
console.log('=== ④ 后手确认 → 结算他自己的特性与效果（坍塌不再重复） ===');
const collapsedBefore = (st.collapsedRooms ?? []).length;
const ackSecond = tryIt(second.controllerId, { type: 'ackEvolution' });
ok(!ackSecond, '后手能确认', String(ackSecond ?? ''));
ok((st.collapsedRooms ?? []).length === collapsedBefore,
  '**这次升级只塌一次**（坍塌是队伍级的：墓穴写死"每次升级塌一个地点、共 4 次"）',
  `${collapsedBefore} → ${st.collapsedRooms.length}`);
ok(coresOf() === cores0 + 1,
  '**后手：扼杀者 2 级效果生效（多 1 个核心标记）**',
  `${cores0} → ${coresOf()}`);
ok(powerOf(second.id) === pSecond0,
  '后手没有 09 特性、2 级也没有力量效果 → 力量保持不变（特性没串过来）',
  `${pSecond0} → ${powerOf(second.id)}`);
ok(powerOf(first.id) === pFirst0 + 2,
  '先手的力量**没有被再算一遍**（各结算一次）',
  `${pFirst0 + 2} → ${powerOf(first.id)}`);
ok(!st.pendingEvolutionAck, '两人都做完 → 整条进化收尾');

console.log(`\n2对3 墓穴进化分段：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
