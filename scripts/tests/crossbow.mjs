/**
 * **女王的十字弩**端到端验证（用户报的第 7 类）。
 *
 * 用户原话：
 *  - 「游戏开始，幸存者选十字弩时杀手方会看到幸存者界面」→ 杀手不该被切到幸存者界面
 *  - 「谁拿了十字弩是女王不知道的」→ `crossbowHolderId` 不进杀手快照
 *  - 「十字弩是特殊行动，它的效果你也没做出来（只有点了确认，然后就结束了，
 *     没有选僵尸，也没有后续）」→ 选僵尸 → 确认 → 消灭 → 推进小回合
 *
 * 跑法：`npm run test:crossbow`
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import { crossbowTargets } from '../../server/dist/game/zombies.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const throws = (fn, needle, label) => {
  try { fn(); ok(false, label, '（没有报错）'); }
  catch (e) {
    const msg = String(e?.message ?? e);
    ok(msg.includes(needle), label, msg);
  }
};

/**
 * 1对3（multi）：4 名玩家各控一枚棋子，**杀手和幸存者是不同的人** ——
 * 这样"杀手看不到十字弩归谁"才测得出来（单人热座里是同一人）。
 */
function mkQueenGame() {
  const st = createLobby('T', 'K', '杀手甲', content, 'mansion');
  st.mode = 'multi';
  const specs = [
    ['K', '杀手甲', 'killer', 'killer9'],
    ['S1', '幸存者甲', 'survivor', 'survivor1'],
    ['S2', '幸存者乙', 'survivor', 'survivor2'],
    ['S3', '幸存者丙', 'survivor', 'survivor3'],
  ];
  st.players = {};
  for (const [id, name, faction, ch] of specs) {
    const p = createPlayer(id, name, id);
    p.faction = faction;
    p.characterId = ch;
    p.ready = true;
    st.players[id] = p;
  }
  st.hostId = 'K';
  startGame(st, content, 'K');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const surv = (st, id) => st.players[id];

/* ═══════════ ① 开局：只有幸存者能去指定持有者 ═══════════ */
console.log('=== ① 指定十字弩持有者 ===');
{
  const st = mkQueenGame();
  ok(st.phase === 'crossbowSetup', '女王局开局停在「指定十字弩」这一步', st.phase);

  const snapK = buildSnapshot(st, 'K');
  const snapS1 = buildSnapshot(st, 'S1');
  ok(snapK.canPickCrossbowHolder === false, '**杀手的快照里不能指定十字弩**（canPickCrossbowHolder=false）');
  ok(snapS1.canPickCrossbowHolder === true, '幸存者能指定');

  throws(
    () => handleAction(st, 'S2', { type: 'pickCrossbowHolder', holderId: 'S1' }, content),
    '无权操作该幸存者',
    '不能替别人指定（谁持有由那人自己点）',
  );
  throws(
    () => handleAction(st, 'K', { type: 'pickCrossbowHolder', holderId: 'S1' }, content),
    '无权操作该幸存者',
    '杀手不能指定',
  );

  handleAction(st, 'S1', { type: 'pickCrossbowHolder', holderId: 'S1' }, content);
  ok(st.crossbowAssigned === true, '指定成功');
  ok(st.crossbowHolderId === 'S1', '记下持有者', String(st.crossbowHolderId));
  ok((surv(st, 'S1').items.crossbow ?? 0) === 1, '**弩进了 S1 的装备栏**');
  ok((surv(st, 'S2').items.crossbow ?? 0) === 0, '别人没有');
  ok(st.phase !== 'crossbowSetup', '指定完继续开局流程', st.phase);
  throws(
    () => handleAction(st, 'S2', { type: 'pickCrossbowHolder', holderId: 'S2' }, content),
    '已经指定过',
    '一次性，不能改',
  );
}

/* ═══════════ ② 「谁拿了弩」女王不知道 ═══════════ */
console.log('=== ② 持有者对杀手保密 ===');
{
  const st = mkQueenGame();
  handleAction(st, 'S1', { type: 'pickCrossbowHolder', holderId: 'S1' }, content);
  const snapK = buildSnapshot(st, 'K');
  const snapS1 = buildSnapshot(st, 'S1');
  const snapS2 = buildSnapshot(st, 'S2');
  ok(snapK.crossbowHolderId == null, '**杀手快照里没有十字弩持有者**', String(snapK.crossbowHolderId));
  ok(snapS1.crossbowHolderId === 'S1', '持有者自己看得到');
  ok(snapS2.crossbowHolderId === 'S1', '队友也看得到（这是明置信息）');
  ok(snapK.crossbowAssigned === true, '「已经指定过了」是公开的（谁拿的才是秘密）');
}

/* ═══════════ ③ 十字弩 = 一般行动里的特殊行动，∞ 使用 ═══════════ */
console.log('=== ③ 用十字弩：选僵尸 → 确认 → 消灭 → 推进 ===');
{
  const st = mkQueenGame();
  handleAction(st, 'S1', { type: 'pickCrossbowHolder', holderId: 'S1' }, content);
  /** 把阶段直接摆到 S1 的小回合（测试不关心开局流程） */
  st.phase = 'survivorMain';
  st.activeSurvivorIndex = st.turnOrder.indexOf('S1');
  const s1 = surv(st, 'S1');
  s1.mainActionUsed = false;
  s1.moveLeft = state0(s1);
  /** 放 3 个僵尸在 S1 地点与相邻地点，超过上限 2 */
  s1.roomId = 'R1';
  st.zombies = [
    { id: 'z1', roomId: 'R1', art: 1 },
    { id: 'z2', roomId: 'R1', art: 2 },
    { id: 'z3', roomId: 'R1', art: 3 },
  ];

  throws(
    () => handleAction(st, 'S2', { type: 'useCrossbow' }, content),
    '你没有十字弩',
    '非持有者用不了',
  );
  throws(
    () => handleAction(st, 'S1', { type: 'confirmCrossbow', zombieIds: [] }, content),
    '当前没有待确认的十字弩',
    '还没点「用十字弩」就不能确认',
  );

  const targets = crossbowTargets(st, 'S1').length;
  handleAction(st, 'S1', { type: 'useCrossbow' }, content);
  ok(Boolean(st.pendingCrossbow), '**进入「选僵尸」待选状态**（以前这里就直接结束了）');
  ok(st.pendingCrossbow.max === 2, '最多选 2 个', String(st.pendingCrossbow.max));
  ok(st.pendingCrossbow.zombieIds.length === targets, '候选就是范围内的僵尸', String(targets));

  const snapS1 = buildSnapshot(st, 'S1');
  ok(
    (snapS1.pendingCrossbow?.zombieIds.length ?? 0) === targets,
    '幸存者快照里带着待选僵尸列表',
  );
  const snapK = buildSnapshot(st, 'K');
  ok(!snapK.pendingCrossbow, '**杀手看不到幸存者正在选僵尸**');

  throws(
    () => handleAction(st, 'S1', { type: 'confirmCrossbow', zombieIds: ['zz'] }, content),
    '不在可消灭范围内',
    '选了范围外的僵尸会被拒',
  );
  ok(Boolean(st.pendingCrossbow), '被拒之后待选还在（不会白点一次就没了）');

  handleAction(st, 'S1', { type: 'confirmCrossbow', zombieIds: ['z1', 'z2'] }, content);
  ok(st.pendingCrossbow === null, '待选清空');
  ok(st.zombies.length === 1, '**消灭了 2 个僵尸**', String(st.zombies.length));
  ok(st.zombies[0].id === 'z3', '剩下的是没被选的那个');
  ok(s1.mainActionUsed === true, '**消耗掉这次一般行动**');
  ok((s1.items.crossbow ?? 0) === 1, '**弩本身不消耗（∞）**');
  /**
   * 1对3 是"三人同时行动"，所以用完**不切人**，只是把这个人标成已行动。
   */
  ok(s1.actedThisRound === true, '**这个人本大回合已行动**');
  ok(st.pendingSurvivorPick === false, '同时行动模式不需要点选下一个人');
}

/* ═══════════ ④ 范围内没有僵尸 ═══════════ */
console.log('=== ④ 附近没有僵尸时不进入待选 ===');
{
  const st = mkQueenGame();
  handleAction(st, 'S1', { type: 'pickCrossbowHolder', holderId: 'S1' }, content);
  st.phase = 'survivorMain';
  st.activeSurvivorIndex = st.turnOrder.indexOf('S1');
  const s1 = surv(st, 'S1');
  s1.mainActionUsed = false;
  s1.roomId = 'R1';
  /** 僵尸全放在很远的地方 */
  st.zombies = [{ id: 'z9', roomId: 'G5', art: 1 }];
  handleAction(st, 'S1', { type: 'useCrossbow' }, content);
  ok(!st.pendingCrossbow, '没有可选目标 → 不进入待选');
  ok(s1.mainActionUsed === false, '没用掉一般行动');
}

/* ═══════════ ⑤ 界面：杀手不会被切到幸存者界面 ═══════════ */
console.log('=== ⑤ 界面（SSR）===');
{
  const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
  const st = mkQueenGame();
  const draw = (snap) => renderToStaticMarkup(
    React.createElement(GameView, { state: snap, isHost: false, error: null, onAction: async () => {} }),
  );

  /** 还在 crossbowSetup：幸存者看到指定面板，杀手看不到 */
  const htmlS = await draw(buildSnapshot(st, 'S1'));
  const htmlK = await draw(buildSnapshot(st, 'K'));
  ok(htmlS.includes('指定十字弩持有者'), '幸存者看到「指定十字弩持有者」面板');
  ok(!htmlK.includes('指定十字弩持有者'), '**杀手看不到这个面板**（以前会被切到幸存者界面）');

  /** 指定完、轮到持有者：只有他能看到「用十字弩」 */
  handleAction(st, 'S1', { type: 'pickCrossbowHolder', holderId: 'S1' }, content);
  st.phase = 'survivorMain';
  st.activeSurvivorIndex = st.turnOrder.indexOf('S1');
  const s1 = surv(st, 'S1');
  s1.mainActionUsed = false;
  s1.roomId = 'R1';
  st.zombies = [{ id: 'z1', roomId: 'R1', art: 1 }];

  const htmlHolder = await draw(buildSnapshot(st, 'S1'));
  ok(htmlHolder.includes('用十字弩'), '持有者看到「用十字弩」按钮');

  const htmlOther = await draw(buildSnapshot(st, 'S2'));
  ok(!htmlOther.includes('用十字弩'), '**没拿到弩的幸存者看不到这个按钮**');

  /** 点了之后出现选僵尸面板（且不在杀手区块里） */
  handleAction(st, 'S1', { type: 'useCrossbow' }, content);
  const htmlPick = await draw(buildSnapshot(st, 'S1'));
  /** React SSR 会在"最多 {2} 个"这种分段文本里插 `<!-- -->`，所以只断言连续的那一段 */
  ok(htmlPick.includes('个要消灭的僵尸'), '**点完「用十字弩」出现选僵尸面板**');
  ok(htmlPick.includes('确认'), '有「确认」按钮');
}

/** 小工具：读一件"未使用的一般行动"初始值（测试里只用来还原现场） */
function state0(p) {
  return p.moveLeft ?? 1;
}

console.log(`\n十字弩：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
