/**
 * **【变体3】计划卡：界面**（幸存者行动区按钮 + 弹窗 + 杀手看不到）。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs` 生成 `client/_ssrbuild`。
 *
 * 跑法：node scripts/tests/plan-cards-ui.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function mk() {
  const st = createLobby('T', 'h', 'H', content, 'mansion');
  st.mode = 'duo';
  st.variant3 = true;
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  /** 指定两张，断言才确定 */
  st.planHand = ['plan_careful_repair', 'plan_molotov'];
  st.planCurrentId = null;
  st.planStep = 0;
  st.pendingPlanSwitch = null;
  st.planCompletedId = null;
  return st;
}

let GameView = null;
try {
  ({ GameView } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 node scripts/tests/build-menu.mjs）');
  process.exit(1);
}

const draw = (snap, extra = {}) => renderToStaticMarkup(
  React.createElement(GameView, {
    state: snap, isHost: true, error: null, onAction: async () => {}, ...extra,
  }),
);

/* ═══════════ ① 幸存者行动区：按钮 + 摘要 ═══════════ */
console.log('=== ① 幸存者行动区有「计划卡」按钮 ===');
{
  const st = mk();
  const html = draw(buildSnapshot(st, 's'));
  ok(html.includes('计划卡'), '**有「计划卡」按钮**');
  ok(html.includes('先确认一张计划'), '还没确认时提示"先确认一张计划"',
    '先确认一张计划（要所有幸存者玩家同意）');
}

/* ═══════════ ② 弹窗：两张卡、进度、能力、确认按钮 ═══════════ */
console.log('=== ② 计划卡弹窗内容 ===');
{
  const st = mk();
  const html = draw(buildSnapshot(st, 's'), { initialPlanOpen: true });
  ok(html.includes('謹慎修理'), '**画出了「謹慎修理」**');
  ok(html.includes('燃燒瓶'), '**画出了「燃燒瓶」**');
  ok(html.includes('診斷故障'), '进度名也在（诊断故障）');
  ok(html.includes('搜尋可燃物'), '另一张的进度名也在');
  ok(html.includes('使用工具箱修理時'), '**能力文本也在**',
    '當你使用工具箱修理時，你不會發出響聲。');
  ok(html.includes('确认这个计划'), '**有「确认这个计划」按钮**');
  ok(html.includes('/Image/Plan/'), '卡面图用的是 Image/Plan 里的素材');
  ok(!html.includes(encodeURI('/Image/UI/计划进度标识.png')),
    '还没确认任何计划 → 卡面上不该有进度标识（用户口径：一开始没有标识）');
}

/* ═══════════ ③ 进行中：进度标识画在当前进度那一行 ═══════════ */
console.log('=== ③ 进行中：进度标识按校准位置画 ===');
{
  const st = mk();
  st.planCurrentId = 'plan_careful_repair';
  st.planStep = 1;
  const html = draw(buildSnapshot(st, 's'), { initialPlanOpen: true });
  /** ⚠ 图标 URL 会被 `encodeURI` 编码（中文文件名），比对前先编码 */
  const markerSrc = encodeURI('/Image/UI/计划进度标识.png');
  ok(html.includes(markerSrc),
    '**卡面上画出了进度标识**（Image/UI/计划进度标识.png）', markerSrc);
  /** 第 2 行（step=1）用的是校准里第 2 个行位框：默认 top 21.7% */
  ok(html.includes('top:21.7%') || html.includes('top: 21.7%'),
    '**标识落在第 2 个行位框上**（step=1 → 第二行）',
    '默认校准：{ x: 25, y: 21.7, w: 18, h: 11 }');
  ok(html.includes('▶'), '当前进度那一行有 ▶ 标记');
  ok(html.includes('当前进行「謹慎修理」'), '行动区摘要显示当前进行的计划');
}

/* ═══════════ ④ 完成之后：另一张隐藏 + 能力框的标记 ═══════════ */
console.log('=== ④ 完成计划：另一张隐藏、带框能力的标记 ===');
{
  const st = mk();
  st.planCurrentId = 'plan_careful_repair';
  st.planStep = 3;
  st.planCompletedId = 'plan_careful_repair';
  const html = draw(buildSnapshot(st, 's'), { initialPlanOpen: true });
  ok(html.includes('謹慎修理'), '已完成的那张还在');
  /**
   * ⚠ **别直接断言"整页没有『燃燒瓶』三个字"** —— 开局那条战报会写
   * "给幸存者方下发 2 张计划卡（「…」、「…」）"，随机发牌偶尔就会带上这张，
   * 断言会时灵时不灵。这里改成看**卡面图有没有被画出来**。
   */
  ok(!html.includes(encodeURI('/Image/Plan/燃燒瓶.png')),
    '**另一张计划卡隐藏了**（用户口径：卡面不再画出来）');
  /** 谨慎修理的能力**没有框** → 标识直接消失（不该有 rotate(90deg)） */
  ok(!html.includes('rotate(90deg)'),
    '「謹慎修理」能力没框 → 标识消失，没有旋转标记');

  /** 换一张**有框**的（现场研究：额外行动【移动】×1–2） */
  const st2 = mk();
  st2.planHand = ['plan_field_study', 'plan_molotov'];
  st2.planCurrentId = 'plan_field_study';
  st2.planStep = 2;
  st2.planCompletedId = 'plan_field_study';
  const html2 = draw(buildSnapshot(st2, 's'), { initialPlanOpen: true });
  ok(html2.includes('rotate(90deg)'),
    '**有框的卡：完成之后标识顺时针 90° 放到能力右侧**',
    'style 里应出现 transform: rotate(90deg)');
}

/* ═══════════ ⑤ 杀手：完全看不到 ═══════════ */
console.log('=== ⑤ 杀手界面没有计划卡 ===');
{
  const st = mk();
  const html = draw(buildSnapshot(st, 'h'), { initialPlanOpen: true });
  ok(!html.includes('计划卡'), '**杀手界面里没有「计划卡」按钮**');
  ok(!html.includes('謹慎修理'), '也看不到卡名');
}

/* ═══════════ ⑥ 多人确认：等人同意时弹出同意/不同意 ═══════════ */
console.log('=== ⑥ 等确认时：投票面板 ===');
{
  const st = mk();
  st.pendingPlanSwitch = {
    toId: 'plan_careful_repair',
    fromId: null,
    requestedBy: 'other',
    votes: ['other'],
  };
  const html = draw(buildSnapshot(st, 's'), { initialPlanOpen: true });
  ok(html.includes('正在确认计划'), '有"正在确认计划"提示');
  ok(html.includes('同意') && html.includes('不同意'),
    '**有「同意 / 不同意」两个按钮**');
  ok(html.includes('等待'), '列出了还在等谁');
}

/* ═══════════ ⑦ 主动能力：入口在「特殊行动」区 /「额外行动」窗口 ═══════════ */
console.log('=== ⑦ 完成后：能力按钮只在对应的行动位置（特殊行动区 / 额外行动窗口） ===');
{
  const st = mk();
  /** 蜂鳴器（有两条能力：①特殊行动：弃工具箱放标记 ②额外行动：在带标记的地点响） */
  st.planHand = ['plan_buzzer', 'plan_molotov'];
  st.planCurrentId = 'plan_buzzer';
  st.planStep = 3;
  st.planCompletedId = 'plan_buzzer';
  const actor = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  /** 给一个工具箱 → 第①条（每场一次）应该可发动 */
  actor.items.toolbox = 1;
  /** ⚠ 特殊行动必须轮到本人：把行动权交给他 */
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = Math.max(0, st.turnOrder.indexOf(actor.id));
  st.encounter = null;
  actor.mainActionUsed = false;
  const snap = buildSnapshot(st, 's');
  const card = (snap.plans?.cards ?? []).find((c) => c.id === 'plan_buzzer');
  console.log(`   能力可用性：${(card?.abilities ?? [])
    .map((a) => `${a.kind}:${a.usable ? '可用' : a.blockReason ?? '不可用'}`).join(' / ')}`);
  ok((card?.abilities ?? []).some((a) => a.active && a.usable),
    '**至少有一条主动能力标着可发动**',
    JSON.stringify((card?.abilities ?? []).map((a) => [a.kind, a.usable, a.blockReason])));

  /** 计划卡弹窗：只留一句"去哪点"，**不放发动按钮**（用户要求） */
  const html = draw(snap, { initialPlanOpen: true });
  ok(!html.includes('>发动<'), '**弹窗里不再有「发动」按钮**');
  ok(html.includes('计划相关能力'), '弹窗里写了入口在哪（计划相关能力）');

  /** ① 特殊行动：在行动区的「特殊行动」区，标明「计划相关能力」 */
  ok(html.includes('特殊行动：计划·蜂鳴器'), '**「特殊行动」区里有计划能力按钮**');
  ok(html.includes('计划相关能力'), '并且标明「计划相关能力」');
  ok(html.includes('弃工具箱在本地点放计划标记'), '按钮写清这条能力做什么');

  /** ② 额外行动：在「额外行动」窗口里的「计划相关能力」组 */
  const extraHtml = draw(snap, { initialExtraOpen: true });
  ok(extraHtml.includes('额外行动') && extraHtml.includes('计划相关能力'),
    '**「额外行动」窗口里有「计划相关能力」这一组**');
  ok(extraHtml.includes('在带计划标记的地点发出响声'),
    '蜂鳴器②（额外行动）在那组里');

  /** 没完成计划时：两处都不该有这些按钮 */
  const st2 = mk();
  st2.planHand = ['plan_buzzer', 'plan_molotov'];
  st2.planCurrentId = 'plan_buzzer';
  st2.planStep = 1;
  const snap2 = buildSnapshot(st2, 's');
  const html2 = draw(snap2, { initialPlanOpen: true, initialExtraOpen: true });
  ok(!html2.includes('特殊行动：计划·'), '计划还没完成 → 特殊行动区里没有计划能力');
  ok(!html2.includes('本小回合额外移动'), '也没有额外行动型的计划能力');
}

console.log(`\n变体3 计划卡界面：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
