/**
 * **2对3 里杀手特性 14「埋伏等待」的共同升级流程**（实测）。
 *
 * 卡面（`content/traits.json`）：**你开始游戏时等级为 2，但跳过你自己的第一个回合**。
 *
 * 2对3 的特殊之处：两名杀手**共用队伍等级**，但每一段流程**各自进行**。
 * 所以 14 要检查三件事：
 *   a) 任一人持 14 → 队伍等级推到 2 级（一次升级），**两人各自确认、各自结算**
 *   b) 升级那一轮的确认顺序 = k1（先手）, k2（后手）
 *   c) 「跳过自己的第一个回合」只登记**持有者**，另一名杀手照常行动
 *   d) 两人都持 14 → 也只升到 2 级一次（不能顶到 3 级），两人都被登记跳过
 *
 * 跑法：node scripts/tests/evolution-trait14-2v3.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, startRound, applyVariant1Setup,
  enterKillerMain,
} from '../../server/dist/game/engine.js';
import { standingCollapsibleRooms } from '../../server/dist/game/collapse.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 2对3：屠夫(killer1，先手，2 级 +1 力量) + 扼杀者(killer8，后手，2 级 +1 核心标记) */
function mk(traitsFor, mapId = 'cabin') {
  const st = createLobby('T', 'k1', 'K1', content, mapId);
  st.mode = '2v3';
  st.variant1 = true;
  const map = { k1: st.players.k1 };
  for (const id of ['k2', 's1', 's2', 's3']) map[id] = createPlayer(id, id.toUpperCase(), id);
  st.players = map;
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
  /** 特性抽牌流程在测试里跳过：直接发牌 */
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.traitPickerIds = [];
  st.phase = 'upkeep';
  st.traits = { ...(st.traits ?? {}), ...traitsFor };
  /** 模拟"特性都选完了"：结算开局设置类特性（14 在这里登记"跳过第一个回合"） */
  applyVariant1Setup(st);
  st.pendingEvolutionAck = null;
  st.killerLevel = 1;
  for (const id of st.killerIds) if (st.killers[id]) st.killers[id].level = 1;
  return st;
}

const tryIt = (st, socketId, action) => {
  try { handleAction(st, socketId, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 把进化面板推完，记录每一步是谁确认的、当时几级 */
function drainEvolution(st, maxSteps = 10) {
  const steps = [];
  let guard = 0;
  while (st.pendingEvolutionAck && guard < maxSteps) {
    guard += 1;
    const who = st.killerId;
    const levelBefore = st.killerLevel;
    const err = tryIt(st, st.players[who].controllerId, { type: 'ackEvolution' });
    steps.push({ who, levelBefore, err });
    if (err) break;
  }
  return steps;
}

const nameOf = (st, id) => `${st.players[id]?.name ?? id}(${st.players[id]?.characterId ?? '?'})`;

/* ═══════════ (a)(b)(c) 只有先手持 14 ═══════════ */
console.log('=== (a) 只有先手（屠夫）持 14：共同升到 2 级，各自确认各自结算 ===');
{
  const st = mk({ k1: ['trait_k14'] });
  const [first, second] = st.killerIds;
  console.log(`   先手 ${nameOf(st, first)} 持 14 / 后手 ${nameOf(st, second)} 不持`);
  ok((st.killerSkipFirstTurn ?? []).includes(first),
    '**开局设置已登记"先手要跳过自己的第一个回合"**',
    JSON.stringify(st.killerSkipFirstTurn));
  ok(!(st.killerSkipFirstTurn ?? []).includes(second),
    '没持 14 的后手**不跳过**');

  const powerBefore = st.killers[first].power;
  const coresBefore = (st.coreMarkers ?? []).length;

  /** 开局流程走到"14 的开局升级" */
  startRound(st);
  console.log(`   startRound 之后：等级=${st.killerLevel}，待确认者=${st.killerId}，` +
    `killerIds=${JSON.stringify(st.pendingEvolutionAck?.killerIds)}，` +
    `pendingTraitSetupResume=${state2text(st)}`);
  ok(st.killerLevel === 2, '**开局就推到 2 级**', String(st.killerLevel));
  ok((st.pendingEvolutionAck?.killerIds ?? []).length === 2,
    '挂出的是**两名杀手共用**的确认面板',
    JSON.stringify(st.pendingEvolutionAck?.killerIds));
  ok(st.pendingTraitSetupResume === true,
    '这一轮升级挂起"开局流程等确认完再继续"');

  const steps = drainEvolution(st);
  console.log(`   确认顺序：${steps.map((s) => `${s.who}@${s.levelBefore}级`).join(' → ')}`);
  ok(steps.every((s) => !s.err), '每一步确认都没报错', JSON.stringify(steps.map((s) => s.err)));
  ok(steps.length === 2, '**两名杀手各自确认了一次**（不是只确认一次）', String(steps.length));
  ok(steps.map((s) => s.who).join(',') === `${first},${second}`,
    '**顺序 = 先手 → 后手**', steps.map((s) => s.who).join(','));
  ok(st.killers[first].power === powerBefore + 1,
    '先手（屠夫）拿到自己的 2 级效果：力量 +1', `${powerBefore} → ${st.killers[first].power}`);
  ok((st.coreMarkers ?? []).length === coresBefore + 1,
    '后手（扼杀者）也拿到自己的 2 级效果：多 1 个核心标记',
    `${coresBefore} → ${(st.coreMarkers ?? []).length}`);
  ok(st.pendingEvolutionAck == null, '两人都做完 → 升级收尾');
  ok(st.pendingTraitSetupResume === false, '开局流程接着往下走（不再挂起）');
  ok(st.phase !== 'upkeep', '**回到正常开局**（进入幸存者阶段）', st.phase);
  ok((st.killerSkipFirstTurn ?? []).includes(first) &&
    !(st.killerSkipFirstTurn ?? []).includes(second),
    '跳过回合的登记不受升级影响（仍只有持有者）',
    JSON.stringify(st.killerSkipFirstTurn));

  /** 真跑一次"轮到他的杀手回合"：持有者该被整回合跳过、直接交给另一名杀手 */
  st.phase = 'killerMain';
  st.killerId = first;
  st.killerTurnStep = 'fast';
  enterKillerMain(st);
  ok(!(st.killerSkipFirstTurn ?? []).includes(first),
    '**跳过只发生一次**（用过就从名单里划掉）',
    JSON.stringify(st.killerSkipFirstTurn));
  ok(st.killerId === second,
    '**持有者的第一个回合被跳过 → 直接轮到另一名杀手**',
    `${st.killerId}（期望 ${second}）`);
  ok(st.logs.some((l) => l.text.includes('跳过自己的第一个回合')),
    '战报里写明了"跳过自己的第一个回合"');
}

/* ═══════════ 只有后手持 14 ═══════════ */
console.log('=== (b) 只有后手（扼杀者）持 14：同样共同升到 2 级，顺序仍是先手先 ===');
{
  const st = mk({ k2: ['trait_k14'] });
  const [first, second] = st.killerIds;
  console.log(`   先手 ${nameOf(st, first)} 不持 / 后手 ${nameOf(st, second)} 持 14`);
  startRound(st);
  ok(st.killerLevel === 2, '开局推到 2 级', String(st.killerLevel));
  const steps = drainEvolution(st);
  console.log(`   确认顺序：${steps.map((s) => `${s.who}@${s.levelBefore}级`).join(' → ')}`);
  ok(steps.map((s) => s.who).join(',') === `${first},${second}`,
    '**顺序仍是从先手开始**（谁持 14 不影响顺序）', steps.map((s) => s.who).join(','));
  ok((st.killerSkipFirstTurn ?? []).includes(second) &&
    !(st.killerSkipFirstTurn ?? []).includes(first),
    '跳过回合只登记后手', JSON.stringify(st.killerSkipFirstTurn));
  ok(!st.pendingEvolutionAck && st.killerLevel === 2, '升级收尾、停在 2 级');
}

/* ═══════════ (d) 两人都持 14 ═══════════ */
console.log('=== (d) 两人都持 14：只升到 2 级一次，两人都登记跳过 ===');
{
  const st = mk({ k1: ['trait_k14'], k2: ['trait_k14'] });
  startRound(st);
  ok(st.killerLevel === 2, '**停在 2 级**（不会因为两人都持就顶到 3 级）', String(st.killerLevel));
  const steps = drainEvolution(st);
  ok(steps.length === 2, '仍然是两人各确认一次', String(steps.length));
  ok(st.killerLevel === 2, '确认完仍是 2 级', String(st.killerLevel));
  ok((st.killerSkipFirstTurn ?? []).length === 2,
    '两人都登记"跳过自己的第一个回合"', JSON.stringify(st.killerSkipFirstTurn));
  ok(!st.pendingEvolutionAck, '升级收尾');
}

/** 只给日志看的小工具（避免 undefined 打印难看） */
function state2text(st) {
  return String(st.pendingTraitSetupResume);
}

/* ═══════════ (e) 墓穴 + 14：开局这一轮升级同样"确认后才坍塌" ═══════════ */
console.log('=== (e) 墓穴 + 14：开局升级也要先确认、再坍塌，然后两人各自结算 ===');
{
  const st = mk({ k1: ['trait_k14'] }, 'crypt');
  const [first, second] = st.killerIds;
  /** 只留一个坍塌点，并把所有人挪出废墟（这一轮只关心"什么时候塌"） */
  const collapsible = standingCollapsibleRooms(st);
  const crash = collapsible[0];
  st.collapsedRooms = collapsible.filter((id) => id !== crash);
  const safe = st.map.rooms.find(
    (r) => r.id !== crash && !st.collapsedRooms.includes(r.id),
  )?.id;
  for (const p of Object.values(st.players)) p.roomId = safe;
  const collapsedBefore = st.collapsedRooms.length;
  const powerBefore = st.killers[first].power;
  const coresBefore = (st.coreMarkers ?? []).length;

  startRound(st);
  ok(st.killerLevel === 2, '开局推到 2 级', String(st.killerLevel));
  ok(st.pendingCollapseAfterEvolution === true,
    '**确认之前只记了"确认后要坍塌"**（还没有真的塌）');
  ok(st.collapsedRooms.length === collapsedBefore,
    '**确认之前一个地点都没塌**', `${collapsedBefore} → ${st.collapsedRooms.length}`);

  const steps = drainEvolution(st);
  console.log(`   确认顺序：${steps.map((s) => `${s.who}@${s.levelBefore}级`).join(' → ')}`);
  ok(st.collapsedRooms.length === collapsedBefore + 1,
    '**确认之后才坍塌**（这一轮也照常塌一个地点）',
    `${collapsedBefore} → ${st.collapsedRooms.length}`);
  ok(steps.map((s) => s.who).join(',') === `${first},${second}`,
    '顺序仍是先手 → 后手', steps.map((s) => s.who).join(','));
  ok(st.killers[first].power === powerBefore + 1,
    '先手照样拿到自己的 2 级效果', `${powerBefore} → ${st.killers[first].power}`);
  ok((st.coreMarkers ?? []).length === coresBefore + 1,
    '后手照样拿到自己的 2 级效果（核心标记 +1）',
    `${coresBefore} → ${(st.coreMarkers ?? []).length}`);
  ok(!st.pendingEvolutionAck && st.pendingTraitSetupResume === false,
    '两人都做完 → 开局流程继续');
}

console.log(`\n2对3 特性 14：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
