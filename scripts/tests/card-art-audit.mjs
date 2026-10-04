/**
 * **凡是"要选一张牌"的地方，都必须显示卡面**（用户要求）。
 *
 * 起因：用户发现幽魂 2/3 级的弃牌选择只有卡名、没有图；随后要求**把所有这类地方都补齐**。
 * 本脚本逐个把"选牌面板"摆出来，断言那一块 html 里确实有 `inline-card-art`。
 *
 * 覆盖 8 处：
 *  ① 幽魂 2 级（呼啸而过弃 2 张）            ② 幽魂 3 级（惊恐过度弃 3 张）
 *  ③ 机关大门过门付费（弃 3 张）              ④ 手牌超上限弃牌
 *  ⑤ 第六感（选留 1 张搜索牌）                ⑥ 解锁二选一（锁定牌）
 *  ⑦ 未命名进化卡牌（4 张）                   ⑧ 遭遇里选攻击牌
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/card-art-audit.mjs
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

/** 一局：指定杀手 + 1 名幸存者（duo），停在杀手行动阶段 */
function mk(killerChar = 'killer7', map = 'mansion') {
  const st = createLobby('T', 'h', 'H', content, map);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerChar;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  const k = st.players[st.killerId];
  k.roomId = 'R1';
  k.actionsLeft = 2;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = 'B1';
  }
  st.encounter = null;
  /** 手牌：这个杀手的真牌（这样才有卡面） */
  st.killerHand = Object.values(st.cardById)
    .filter((c) => c.type === 'killerAction' && c.owner === killerChar)
    .slice(0, 4)
    .map((c) => c.id);
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
const draw = (snap) => renderToStaticMarkup(
  React.createElement(GameView, {
    state: snap, isHost: true, error: null, onAction: async () => {},
  }),
);
/** 截一段 html：从 from 到 to（找不到 to 就取 4000 字） */
const slice = (html, from, to) => {
  const i = html.indexOf(from);
  if (i < 0) return '';
  const j = html.indexOf(to, i);
  return html.slice(i, j < 0 ? i + 4000 : j);
};
/** 这块里至少有几张卡面（`<img class="inline-card-art">`） */
const artCount = (block) => (block.match(/inline-card-art/g) ?? []).length;
const killerSocket = (st) => st.players[st.killerId].controllerId;
const survSocket = (st) =>
  Object.values(st.players).find((p) => p.faction === 'survivor').controllerId;

/* ═══════════ ① / ② 幽魂 2 级、3 级 ═══════════ */
console.log('=== ①② 幽魂 2/3 级的弃牌选择 ===');
{
  const st = mk('killer2');
  st.pendingWhizSearch = true;
  let html = draw(buildSnapshot(st, killerSocket(st)));
  let block = slice(html, '呼啸而过之后', '弃 2 张并搜索房间');
  ok(artCount(block) >= st.killerHand.length,
    '2 级：**每张手牌都有卡面**', `${artCount(block)} 张图 / ${st.killerHand.length} 张手牌`);

  const st2 = mk('killer2');
  const victim = Object.values(st2.players).find((p) => p.faction === 'survivor' && p.alive);
  st2.pendingOverFearWound = { targetId: victim.id };
  html = draw(buildSnapshot(st2, killerSocket(st2)));
  block = slice(html, '惊恐过度', '弃 3 张并伤害');
  ok(artCount(block) >= st2.killerHand.length,
    '3 级：**每张手牌都有卡面**', `${artCount(block)} 张图 / ${st2.killerHand.length} 张手牌`);
}

/* ═══════════ ③ 机关大门过门付费 ═══════════ */
console.log('=== ③ 机关大门：弃 3 张过门 ===');
{
  const st = mk('killer5', 'castle');
  st.pendingGatePay = {
    actorId: st.killerId,
    toRoomId: 'R2',
    doorId: 'R1|R2',
    cost: 3,
    picked: [],
  };
  const html = draw(buildSnapshot(st, killerSocket(st)));
  const block = slice(html, '机关大门挡路', '取消');
  ok(block.length > 0, '面板画出来了');
  ok(artCount(block) >= st.killerHand.length,
    '**有几张手牌就有几张卡面**', `${artCount(block)} 张图 / ${st.killerHand.length} 张手牌`);
}

/* ═══════════ ④ 手牌超上限弃牌 ═══════════ */
console.log('=== ④ 手牌超过上限，请弃置 ===');
{
  const st = mk('killer5');
  st.pendingKillerDiscards = 2;
  const html = draw(buildSnapshot(st, killerSocket(st)));
  const block = slice(html, '手牌超过上限', '请选择要感知的颜色区域');
  ok(block.length > 0, '面板画出来了');
  ok(artCount(block) >= st.killerHand.length,
    '**每张可弃的牌都有卡面**', `${artCount(block)} 张图 / ${st.killerHand.length} 张手牌`);
}

/* ═══════════ ⑤ 第六感（幸存者侧） ═══════════ */
console.log('=== ⑤ 第六感：选留 1 张搜索牌 ===');
{
  const st = mk('killer5');
  st.phase = 'survivorMain';
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  const opts = Object.values(st.cardById).filter((c) => c.type === 'search').slice(0, 2);
  /** ⚠ state 里存的是 `cardIds`（快照才翻译成 `cards:[{id,name}]`） */
  st.pendingSixthSense = {
    playerId: surv.id,
    cardIds: opts.map((c) => c.id),
    roomId: surv.roomId,
    quiet: false,
  };
  const html = draw(buildSnapshot(st, survSocket(st)));
  const block = slice(html, '第六感', '坚毅');
  ok(block.length > 0, '面板画出来了');
  ok(artCount(block) >= 2, '**两张候选牌都有卡面**', `${artCount(block)} 张图`);
}

/* ═══════════ ⑥ 解锁二选一 + ⑦ 进化卡牌选择 ═══════════ */
console.log('=== ⑥⑦ 未命名：解锁二选一 / 选进化卡牌 ===');
{
  const st = mk('killer7');
  /** ⚠ 这两个面板画在**进化确认面板里面**（`pendingEvolutionAck` 挂着时才渲染） */
  st.pendingEvolutionAck = { fromLevel: 1, toLevel: 2 };
  /** ⚠ state 里这两个字段存的是**牌 id 数组**（快照才翻成 `{id,name,text}`） */
  st.pendingUnlockChoice = ['un_noise', 'un_acid'];
  st.pendingEvolutionCardPick = ['evo_un_camouflage', 'evo_un_crawl'];
  const snap = buildSnapshot(st, killerSocket(st));
  const html = draw(snap);
  /** 只对 `src="..."` 里的值解码（整段 html 里可能有裸 `%`，直接 decodeURI 会炸） */
  const srcsIn = (block) =>
    [...block.matchAll(/src="([^"]+)"/g)].map((m) => {
      try { return decodeURI(m[1]); } catch { return m[1]; }
    });

  const unlock = slice(html, '请选一张锁定牌解锁入手', '未命名进化');
  ok(unlock.length > 0, '解锁二选一面板在');
  ok(artCount(unlock) >= 2, '**两张锁定牌都有卡面**', `${artCount(unlock)} 张图`);

  const evo = slice(html, '请选一张进化卡牌', '雕像进化');
  ok(evo.length > 0, '进化卡牌面板在');
  ok(artCount(evo) >= 2, '**两张进化卡牌都有卡面**', `${artCount(evo)} 张图`);
  ok(srcsIn(evo).some((s) => s.includes('进化卡牌_')),
    '用的是「进化卡牌_XXX.png」那套素材',
    srcsIn(evo).filter((s) => s.includes('进化卡牌_')).slice(0, 2).join(' , '));
}

/* ═══════════ ⑧ 遭遇里选攻击牌 ═══════════ */
console.log('=== ⑧ 遭遇：选一张牌加攻 ===');
{
  const st = mk('killer5');
  const surv = Object.values(st.players).find((p) => p.faction === 'survivor');
  const k = st.players[st.killerId];
  k.roomId = surv.roomId;
  /**
   * ⚠ 这个面板只列**攻击时机能打的牌**（`timings` 含 'attack' 或有 `attackValue`）——
   * 随便抓两张手牌会一张都不显示。狼人（killer5）有「狂野撕咬」这种攻击牌。
   */
  const atk = Object.values(st.cardById)
    .filter(
      (c) =>
        c.owner === 'killer5' &&
        ((c.timings ?? []).includes('attack') ||
          (c.effects ?? []).some((fx) => fx.op === 'attackValue' || fx.op === 'attackValuePerCore')),
    )
    .map((c) => c.id)
    .slice(0, 3);
  /** 手牌就放这几张攻击牌（面板从手牌里筛） */
  st.killerHand = [...atk];
  st.phase = 'encounter';
  st.encounter = {
    roomId: surv.roomId,
    step: 'attack',
    targetId: surv.id,
    targets: [surv.id],
    discoveredIds: [surv.id],
    attackCardId: null,
    attackBoost: false,
    attackChoiceMade: false,
    attackCommitted: false,
    attackOptions: atk,
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
  };
  const html = draw(buildSnapshot(st, killerSocket(st)));
  const block = slice(html, '基础攻击 = 力量', '不加攻击');
  ok(atk.length >= 2, '（前提）狼人有可选的攻击牌', atk.join(','));
  ok(block.length > 0, '攻击牌面板画出来了');
  ok(artCount(block) >= atk.length,
    '**每张可选攻击牌都有卡面**', `${artCount(block)} 张图 / ${atk.length} 张牌`);
}

console.log(`\n选牌处卡面检查：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
