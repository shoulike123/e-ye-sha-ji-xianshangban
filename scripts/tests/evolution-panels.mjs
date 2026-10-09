/**
 * **进化确认与"同时要做的选择"不再互相挡住**（用户报的第 2 类）。
 *
 * 用户原话：「杀手进化确认新效果会跟雕像切换主雕像，未命名 2、4 级选择进化卡牌
 * 这些冲突，后者显示不出来，游戏就卡住了。」
 *
 * 原因：那些选择面板原来写在下面的"杀手行动区"里，而那一整块被
 * `!pendingEvolutionAck` 挡着 —— 于是进化时它们**永远不渲染**，
 * 而「确认新效果」又会被服务端拒（"请先选好"），整局就死在那里。
 * 现在它们和确认按钮在同一个面板里。
 *
 * 跑法：`npm run test:evo`
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

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

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 1 对 1，指定杀手（雕像 killer6 / 未命名 killer7 都是进化时要额外选的） */
function mk(killerId) {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerId;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  return st;
}

/** 把杀手摆到"刚升级、等确认"的那一刻 */
function armEvolution(st) {
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.pendingEffectQueue = [];
  st.pendingEvolutionAck = { fromLevel: st.killerLevel ?? 1, toLevel: (st.killerLevel ?? 1) + 1 };
  return st;
}

const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
const draw = (snap) => renderToStaticMarkup(
  React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
);

/* ═══════════ ① 雕像：确认新效果 + 转换主雕像 同时出现 ═══════════ */
console.log('=== ① 雕像：进化确认 + 转主雕像 ===');
{
  const st = mk('killer6');
  armEvolution(st);
  st.pendingStatueEvoSwitch = true;
  const snap = buildSnapshot(st, 'h');
  ok(snap.pendingEvolutionAck?.toLevel > 0, '快照里有"等确认进化"', JSON.stringify(snap.pendingEvolutionAck));
  ok(snap.pendingStatueEvoSwitch === true, '快照里有"等决定要不要转主雕像"');
  ok((snap.statues ?? []).length === 4, '4 尊雕像都下发了', String(snap.statues?.length));

  const html = await draw(snap);
  ok(html.includes('确认新效果'), '有「确认新效果」按钮');
  ok(
    html.includes('转换主雕像') || html.includes('雕像进化'),
    '**「转换主雕像」面板也渲染出来了**（以前被 !pendingEvolutionAck 挡住）',
  );
  ok(html.includes('不转换'), '有「不转换」选项（可以跳过）');
  ok(html.includes('请先在上面选好'), '提示"请先在上面选好，再确认新效果"');
  ok(
    /<button[^>]*disabled[^>]*>确认新效果<\/button>/.test(html),
    '**有待选项时「确认新效果」是禁用的**（不会点出一个死局）',
  );
  /**
   * ⚠ **切换主雕像也要二次确认**（用户口径）：点一尊只是"选中"（地图立绘高亮），
   * 还要按「确认切换主雕像」才记下这次切换；真正生效仍在「确认新效果」。
   */
  ok(html.includes('确认切换主雕像'), '**有独立的「确认切换主雕像」按钮**（二次确认）');
  {
    const fs = await import('node:fs');
    const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
    const at = views.indexOf('雕像进化：你可以转换主雕像');
    const panel = views.slice(at, at + 2600);
    ok(at > 0, '（前提）找得到那段面板');
    ok(/onClick=\{\(\) => setEvoStatuePick\(st\.id\)\}/.test(panel),
      '**雕像按钮只"选中"**（不再点一下就发动作）');
    ok(!/onClick=\{\(\) => void onAction\(\{ type: 'pickStatueEvoSwitch'/.test(panel),
      '面板里的雕像按钮不再直接发 `pickStatueEvoSwitch`');
    ok(/'确认切换主雕像'|确认切换主雕像/.test(panel), '确认按钮在那段面板里');
    /**
     * ⚠ **当前主雕像不能选**（用户口径：「雕像的进化切换主雕像不能选当前的主雕像转换」）——
     * 和「重整旗鼓」那块同一口径（那边本来就 `disabled={st.main}`）。
     */
    ok(/disabled=\{st\.main\}/.test(panel), '**当前主雕像那颗按钮是禁用的**（不能选它"转换"）');
    ok(/当前主雕像不能选/.test(panel), '面板文字里也写了"当前主雕像不能选"');
    /**
     * ⚠ **本地"选中"只在面板还开着时才算数**（用户截图里卡死的那一条）：
     * 面板已经收起来（服务端两项都清了，例如点了「不转换」）但本地还留着选中 →
     * 面板没了、确认按钮却一直灰着，只剩一句"请先按「确认切换主雕像」"。
     */
    ok(/\(state\.pendingStatueEvoSwitch && evoStatuePick\)/.test(views),
      '**本地选中受"面板还开着"约束**（不会把确认按钮永久灰住）');
    ok(/setEvoStatuePick\(null\)[\s\S]{0,80}skipStatueEvoSwitch/.test(views),
      '按「不转换」时会清掉本地选中');
    ok(/if \(!state\.pendingStatueEvoSwitch\) setEvoStatuePick\(null\)/.test(views),
      '**服务端说"不用决定"时本地选中立刻作废**（下一级不会再被它灰住）');
  }
}

/* ═══════════ ①-b 已确认过：不再画「确认新效果」（防重复结算） ═══════════ */
console.log('=== ①-b 已确认之后还在做效果里的选择 ===');
{
  const st = mk('killer6');
  armEvolution(st);
  /** 模拟"已经点过确认新效果"：④ 步里的选择还挂着，ack 也还挂着 */
  st.pendingEvolutionAck.acked = true;
  st.pendingStatueEvoSwitch = true;
  const snap = buildSnapshot(st, 'h');
  ok(snap.pendingEvolutionAck?.acked === true, '快照里带着 `acked`');
  const html = await draw(snap);
  ok(html.includes('已确认新效果'), '**提示语换成"已确认新效果"**');
  ok(!/确认新效果<\/button>/.test(html),
    '**「确认新效果」那颗按钮收起来了**（再点一次会把这一级结算两遍）');
  ok(html.includes('确认切换主雕像'), '「确认切换主雕像」照常在');
  ok(!html.includes('进化才会继续结算') || html.includes('请先做完上面的选择'),
    '不再说"请先按确认切换主雕像，进化才会继续结算"');
}

/* ═══════════ ② 未命名：确认新效果 + 选进化卡牌 同时出现 ═══════════ */
console.log('=== ② 未命名：进化确认 + 选进化卡牌 ===');
{
  const st = mk('killer7');
  armEvolution(st);
  const pool = content.cards.evolutionCard ?? [];
  ok(pool.length > 0, '内容里有进化卡牌', String(pool.length));
  st.pendingEvolutionCardPick = pool.slice(0, 2).map((c) => c.id);
  const snap = buildSnapshot(st, 'h');
  ok((snap.pendingEvolutionCardPick ?? []).length === 2, '快照里下发了 2 张候选进化卡牌');

  const html = await draw(snap);
  ok(html.includes('确认新效果'), '有「确认新效果」按钮');
  ok(
    html.includes('请选一张进化卡牌'),
    '**「选进化卡牌」面板渲染出来了**（用户报的"后者显示不出来"）',
  );
  for (const c of snap.pendingEvolutionCardPick) {
    ok(html.includes(c.name), `候选里有「${c.name}」`);
  }
  ok(/<button[^>]*disabled[^>]*>确认新效果<\/button>/.test(html), '「确认新效果」被禁用');
}

/* ═══════════ ③ 解锁二选一（刺耳噪声 / 酸液喷吐） ═══════════ */
console.log('=== ③ 进化确认 + 解锁二选一 ===');
{
  const st = mk('killer7');
  armEvolution(st);
  st.pendingUnlockChoice = ['un_noise', 'un_acid'];
  const snap = buildSnapshot(st, 'h');
  ok((snap.pendingUnlockChoice ?? []).length === 2, '快照里下发了 2 张锁定牌');
  const html = await draw(snap);
  ok(html.includes('选一张锁定牌解锁入手'), '**「解锁二选一」面板渲染出来了**');
  ok(html.includes('确认新效果'), '确认按钮同时在');
  ok(/<button[^>]*disabled[^>]*>确认新效果<\/button>/.test(html), '「确认新效果」被禁用');
}

/* ═══════════ ④ 三种同时出现（最坏情况） ═══════════ */
console.log('=== ④ 三种待选同时出现 ===');
{
  const st = mk('killer6');
  armEvolution(st);
  st.pendingStatueEvoSwitch = true;
  const pool = content.cards.evolutionCard ?? [];
  st.pendingEvolutionCardPick = pool.slice(0, 2).map((c) => c.id);
  st.pendingUnlockChoice = ['un_noise', 'un_acid'];
  const snap = buildSnapshot(st, 'h');
  const html = await draw(snap);
  ok(html.includes('转换主雕像') || html.includes('雕像进化'), '转主雕像面板在');
  ok(html.includes('请选一张进化卡牌'), '选进化卡牌面板在');
  ok(html.includes('选一张锁定牌解锁入手'), '解锁二选一面板在');
  ok(html.includes('确认新效果'), '确认按钮在');
  ok(/<button[^>]*disabled[^>]*>确认新效果<\/button>/.test(html), '三种都没选时确认按钮禁用');
}

/* ═══════════ ⑤ 选完之后就能确认（不会真的死局） ═══════════ */
console.log('=== ⑤ 选完 → 确认按钮恢复可用 ===');
{
  const st = mk('killer6');
  armEvolution(st);
  /**
   * ⚠ **走真实流程**：以前这里是手动 `pendingStatueEvoSwitch = true` 搭台，
   * 于是"这一级已经问过要不要转主雕像"的标记（`evolutionChoiceIssuedAtLevel`）
   * 没被记上 —— 点完「不转换」服务端又按"还没问过"重新挂了一次，
   * 测试就报"待选没清掉"（其实是搭台方式不对，真实流程没这个问题）。
   */
  handleAction(st, 'h', { type: 'ackEvolution' }, content);
  ok(st.pendingStatueEvoSwitch === true, '确认之后才挂出「要不要转换主雕像」',
    String(st.pendingStatueEvoSwitch));

  /** 服务端：先决定"不转换" */
  handleAction(st, 'h', { type: 'skipStatueEvoSwitch' }, content);
  ok(st.pendingStatueEvoSwitch === false, '点「不转换」之后这个待选清掉');
  ok(st.pendingStatueEvoSwitch !== true, '**不会又弹回来**（这一级已经问过了）');
  const html = await draw(buildSnapshot(st, 'h'));
  ok(
    !/<button[^>]*disabled[^>]*>确认新效果<\/button>/.test(html),
    '**待选清空后「确认新效果」恢复可用**',
  );

  /** 真实流程里「确认新效果」就是上面那一步，确认之后整条进化已经收尾 */
  ok(!st.pendingEvolutionAck, '**确认之后进化待办清空，对局继续**', JSON.stringify(st.pendingEvolutionAck));
}

/* ═══════════ ⑥ 进化 4 级「选 2 个地点 → 确认」（用户报的"行动区无法确认"） ═══════════ */
console.log('=== ⑥ 女王 / 扼杀者 4 级：选满 2 个地点后的「确认」必须画得出来 ===');
{
  /**
   * 用户原话：「扼杀者，女王4级进化效果行动区无法确认」。
   *
   * 根因：确认按钮原来画在**"杀手行动区"**里，而那一整块的条件是
   * `state.phase === 'killerMain'` —— 可是进化 4 级的选择是**回合收尾**
   * 时挂出来的（扼杀者那一路 `phase` 就是 `upkeep`），女王那一路
   * `pendingEvolutionAck` 也还挂着。两条路都进不去那块 → 按钮根本不画。
   *
   * 现在它和「进化确认」面板同层（不看阶段）。
   */
  const st = mk('killer9');
  armEvolution(st);
  st.phase = 'upkeep';                 // ← 就是这一步：行动区被 `killerMain` 挡着
  st.pendingQueenSpawnRooms = ['R1', 'R2'];
  const snap = buildSnapshot(st, 'h');
  ok((snap.pendingQueenSpawnRooms ?? []).length === 2, '快照里下发了已选地点',
    JSON.stringify(snap.pendingQueenSpawnRooms));
  const html = await draw(snap);
  ok(html.includes('确认生成丧尸'), '**「确认生成丧尸」按钮渲染出来了**（收尾阶段也画得出）');
  ok(html.includes('已选 2/2'), '写了"已选 2/2"');
  ok(!/<button[^>]*disabled[^>]*>确认生成丧尸<\/button>/.test(html),
    '**选满 2 个之后这颗按钮是「可用」的**');

  /** 只选 1 个：面板还在（看得到"该点 2 个"的提示），但按钮禁用 */
  st.pendingQueenSpawnRooms = ['R1'];
  const html1 = await draw(buildSnapshot(st, 'h'));
  ok(html1.includes('确认生成丧尸'), '只选 1 个时面板也在（提示不会消失）');
  ok(/<button[^>]*disabled[^>]*>确认生成丧尸<\/button>/.test(html1), '没选满 2 个时按钮禁用');

  /** 对照：幸存者视角既没有字段、也没有按钮 */
  const sSnap = buildSnapshot(st, 's');
  ok(sSnap.pendingQueenSpawnRooms == null, '幸存者快照里没有"待选地点"（保密）');
  ok(!(await draw(sSnap)).includes('确认生成丧尸'), '幸存者界面上没有这颗按钮');
}
{
  /** 扼杀者那一路：挂出来的时候进化确认已经收掉了（`pendingEvolutionAck` 为 null） */
  const st = mk('killer8');
  armEvolution(st);
  st.phase = 'upkeep';
  st.pendingEvolutionAck = null;
  st.pendingStranglerCoreRooms = ['R1', 'R2'];
  const html = await draw(buildSnapshot(st, 'h'));
  ok(html.includes('确认放置核心标记'), '**「确认放置核心标记」按钮渲染出来了**');
  ok(html.includes('已选 2/2'), '写了"已选 2/2"');
  ok(!/<button[^>]*disabled[^>]*>确认放置核心标记<\/button>/.test(html),
    '**选满 2 个之后这颗按钮是「可用」的**');
}

console.log(`\n进化面板：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
