/**
 * **【变体3】计划卡：要选目标的界面**（燃燒瓶第二段 / 通道調查 / 情報分享）。
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs` 生成 `client/_ssrbuild`。
 *
 * 跑法：node scripts/tests/plan-targets-ui.mjs
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
  st.planHand = ['plan_molotov', 'plan_careful_repair'];
  st.planCurrentId = null;
  st.planStep = 0;
  st.pendingPlanSwitch = null;
  st.planCompletedId = null;
  st.pendingPlanPassage = null;
  st.pendingPlanTarget = null;
  st.planMarkers = [];
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  surv.roomId = 'B5'; // 豪宅的秘密通道端点（B5 → G5）
  surv.mainActionUsed = false;
  st.activeSurvivorIndex = Math.max(0, st.turnOrder.indexOf(surv.id));
  st.pendingSurvivorPick = false;
  return { st, surv };
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

/* ═══════════ ① 燃燒瓶：防御确认之后的第二问 ═══════════ */
console.log('=== ① 燃燒瓶：防御物品确认之后的"要不要弃威士忌"面板 ===');
{
  const { st, surv } = mk();
  st.planCompletedId = 'plan_molotov';
  surv.items.whiskey = 1;
  st.phase = 'encounter';
  st.encounter = {
    roomId: surv.roomId,
    step: 'defend',
    targetId: surv.id,
    targets: [surv.id],
    discoveredIds: [surv.id],
    attackCardId: null,
    attackBoost: false,
    attackChoiceMade: true,
    attackCommitted: true,
    attackOptions: [],
    defenses: {},
    defenseItems: {},
    defenseOptions: {},
    fleeQueue: [],
    fled: [],
    blockItems: false,
    trapArmed: false,
    trapApplied: false,
    executeArmed: false,
    executeStatueId: null,
    source: 'search',
    whiskeyOffer: { playerId: surv.id },
  };
  const html = draw(buildSnapshot(st, 's'));
  ok(html.includes('弃置威士忌酒瓶'), '**有「弃置威士忌酒瓶（+2）」按钮**');
  ok(html.includes('不用（照常结算）'), '也有"不用"按钮');
  ok(html.includes('不算使用物品'), '说明里写清"不算使用物品、不占名额"');

  /** 没挂着这一问 → 没有这个面板 */
  const b = mk();
  b.st.planCompletedId = 'plan_molotov';
  b.surv.items.whiskey = 1;
  b.st.phase = 'encounter';
  b.st.encounter = { ...st.encounter, whiskeyOffer: null };
  const html2 = draw(buildSnapshot(b.st, 's'));
  ok(!html2.includes('弃置威士忌酒瓶'), '对照：没这一问时不显示这个面板');
}

/* ═══════════ ② 通道調查：卡面上直接列出通道出口 ═══════════ */
console.log('=== ② 通道調查 ②：卡面上列出可去的秘密通道出口 ===');
{
  const { st, surv } = mk();
  st.planHand = ['plan_passage_survey', 'plan_molotov'];
  st.planCompletedId = 'plan_passage_survey';
  const snap = buildSnapshot(st, 's');
  const ends = snap.plans?.passageEnds ?? [];
  console.log(`   服务端给的通道出口：${JSON.stringify(ends)}`);
  ok(ends.length > 0, '**快照里有通道出口**（`plans.passageEnds`）', JSON.stringify(ends));
  const html = draw(snap, { initialPlanOpen: true });
  ok(html.includes('通道→'), '**卡面上有「通道→…」按钮**');
  ok(html.includes('穿過秘密通道') || html.includes('移动通过一条秘密通道') || html.includes('秘密通道'),
    '能力文本也在');

  /** 人不在通道地点 → 没有通道按钮，而且给出原因 */
  const b = mk();
  b.surv.roomId = 'R1';
  b.st.planHand = ['plan_passage_survey', 'plan_molotov'];
  b.st.planCompletedId = 'plan_passage_survey';
  const snap2 = buildSnapshot(b.st, 's');
  const html2 = draw(snap2, { initialPlanOpen: true });
  ok(!html2.includes('通道→'), '对照：**不在通道地点就没有通道按钮**');
  ok(html2.includes('必须在秘密通道地点发动'), '并且写明原因',
    JSON.stringify((snap2.plans?.cards ?? [])
      .flatMap((c) => c.abilities.map((a) => a.blockReason)).filter(Boolean)));
}

/* ═══════════ ③ 情報分享：完成计划后弹"谁来抽" ═══════════ */
console.log('=== ③ 情報分享：完成计划后选一名幸存者抽 1 张 ===');
{
  const { st, surv } = mk();
  st.planHand = ['plan_intel_share', 'plan_molotov'];
  st.planCompletedId = 'plan_intel_share';
  const others = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  st.pendingPlanTarget = {
    planId: 'plan_intel_share',
    index: 0,
    chooserId: surv.id,
    candidates: others.map((p) => p.id),
  };
  const html = draw(buildSnapshot(st, 's'), { initialPlanOpen: true });
  ok(html.includes('情報分享'), '弹窗里有这条能力的说明');
  ok(html.includes('抽 1 张'), '**每个人一个「… 抽 1 张」按钮**');
  for (const p of others) {
    ok(html.includes(`${p.name} 抽 1 张`), `**名单里有 ${p.name}**`);
  }

  /** 没有待选时不显示 */
  const b = mk();
  b.st.planHand = ['plan_intel_share', 'plan_molotov'];
  b.st.planCompletedId = 'plan_intel_share';
  const html2 = draw(buildSnapshot(b.st, 's'), { initialPlanOpen: true });
  ok(!html2.includes('抽 1 张'), '对照：没有待选时不显示抽牌按钮');
}

console.log(`\n变体3 计划目标界面：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
