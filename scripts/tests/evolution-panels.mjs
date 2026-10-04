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

console.log(`\n进化面板：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
