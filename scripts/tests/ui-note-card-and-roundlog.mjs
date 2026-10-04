/**
 * 这一批 UI 修复的回归测试：
 *
 *  ① 守護之石 / 古代护符的弹窗**文字不再叠在一起**
 *     （以前套了 `.surv-board-pop-stage` —— 那是给"带背景图的技能弹窗"用的，
 *      它为了贴图设了 `line-height: 0`，纯文字面板套上去每行都叠）
 *  ② 乔治「挑笔记」的**确定按钮在弹窗里**
 *     （以前走行动区的 `pendingAct` 确认栏，被全屏弹窗盖住 → 点不到、拿不了笔记）
 *  ③ 杀手「本大回合战报」**与地图同高**，顺序不变（旧→新）但**默认停在最新**
 *  ④ 「移动立绘」**不能把立绘放到已坍塌的地点**
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 *
 * 跑法：node scripts/tests/ui-note-card-and-roundlog.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
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
const src = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const tryIt = (st, who, action) => {
  try { handleAction(st, who, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

const views = src('client/src/GameViews.tsx');
const css = src('client/src/styles.css');

function mkDuo(mapId = 'crypt') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  return st;
}

let GameView = null;
try {
  GameView = (await import('../../client/_ssrbuild/GameViews.js')).GameView;
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}
const draw = (snap) => renderToStaticMarkup(
  React.createElement(GameView, { state: snap, isHost: true, error: null, onAction: async () => {} }),
);

console.log('=== ① 守護之石弹窗：文字不叠（不再用 line-height:0 的那个类） ===');
{
  /** `line-height: 0` 的类只能是"带背景图的技能弹窗"用 */
  const stageRule = css.match(/\.surv-board-pop-stage\s*\{[^}]*\}/);
  ok(Boolean(stageRule) && /line-height:\s*0/.test(stageRule[0]),
    '（前提）`.surv-board-pop-stage` 仍然是 `line-height: 0` 的贴图类');

  const amuletBlock = views.slice(views.indexOf('state.pendingAmulet && isSurvivorView'));
  const head = amuletBlock.slice(0, 600);
  ok(head.includes('surv-board-pop-card'), '**守護之石面板改用 `.surv-board-pop-card`**');
  ok(!/className="surv-board-pop-stage panel stack"/.test(head),
    '不再套 `surv-board-pop-stage`');

  const cardRule = css.match(/\.surv-board-pop-card\s*\{[^}]*\}/);
  ok(Boolean(cardRule) && /line-height:\s*1\.5/.test(cardRule[0]),
    '**`.surv-board-pop-card` 有正常行高**', cardRule ? cardRule[0].replace(/\s+/g, ' ') : '(没有这条规则)');

  /** 真渲染一遍：守護之石询问面板要画出来，并且带的是新类 */
  const st = mkDuo();
  const p = Object.values(st.players).find((x) => x.faction === 'survivor');
  p.items = { ...p.items, relic_guard: 1 };
  st.pendingAmulet = { playerId: p.id, amount: 1, sourceId: st.killerId, relic: 'guard' };
  const html = draw(buildSnapshot(st, 's'));
  ok(html.includes('surv-board-pop-card'), '渲染出来的面板带 `.surv-board-pop-card`');
  ok(!html.includes('surv-board-pop-stage'), '渲染出来的面板**没有**旧的贴图类');
  ok(html.includes('守護之石'), '面板上写着「守護之石」');
}

console.log('=== ② 乔治挑笔记：确认必须在弹窗里面 ===');
{
  ok(!/setPendingAct\(\{\s*label:\s*`?拿走笔记/.test(views),
    '**不再把"拿走笔记"的确认丢到行动区**（那会被弹窗盖住）');
  ok(views.includes('setNoteConfirm'), '改用弹窗内的二次确认 state');
  /** 确认条必须画在"挑笔记"那个 hud-overlay-card 里面 */
  const modalStart = views.indexOf('aria-label="挑选乔治的笔记"');
  const modalEnd = views.indexOf('role="dialog"', modalStart) > 0
    ? views.indexOf('state.phase === \'gameOver\'', modalStart)
    : -1;
  const modal = views.slice(modalStart, modalEnd > 0 ? modalEnd : modalStart + 3000);
  ok(modal.includes('noteConfirm &&'), '**确认条画在挑笔记弹窗内部**');
  ok(modal.includes('pending-act-bar'), '复用了行动区那套确认条样式（只是位置挪进弹窗）');
  ok(/确定要拿走笔记/.test(modal), '确认文案在弹窗里');
  /** 弹窗关掉时要清掉确认，免得下次打开残留 */
  ok(/if \(!georgeNoteOpen\) setNoteConfirm\(null\)/.test(views.replace(/\s+/g, ' ')) ||
    /georgeNoteOpen\) setNoteConfirm\(null\)/.test(views),
    '**弹窗收起时清掉那个确认**');

  /** 真渲染：pendingGeorgeNote 状态下弹窗要出来 */
  const st = mkDuo('mansion');
  const geo = Object.values(st.players).find((x) => x.characterId === 'survivor6');
  st.pendingGeorgeNote = { playerId: geo.id };
  st.georgeNotes = [{ id: 'george_note_defense', name: '乔治的笔记·防御' }];
  st.activePlayerId = geo.id;
  const html = draw(buildSnapshot(st, 's'));
  ok(html.includes('思维敏捷：挑一张笔记'), '挑笔记弹窗渲染出来了');
  ok(html.includes('不拿'), '有「不拿」按钮');
}

console.log('=== ③ 本大回合战报：与地图同高 + 默认停在最新 ===');
{
  ok(!/\.round-log-box\s*\{[^}]*max-height:\s*11rem/.test(css),
    '**`.round-log-box` 不再固定 11rem**（那是"只有一小截"的原因）');
  const box = css.match(/\.round-log-box\s*\{[^}]*\}/);
  ok(Boolean(box) && /flex:\s*1/.test(box[0]) && /min-height:\s*0/.test(box[0]),
    '**战报盒子撑满剩余高度**', box ? box[0].replace(/\s+/g, ' ') : '');
  const intel = css.match(/\.map-side-intel\s*\{[^}]*\}/);
  ok(Boolean(intel) && /flex-direction:\s*column/.test(intel[0]),
    '信息栏是 flex 列（标题 + 撑满的战报）',
    intel ? intel[0].replace(/\s+/g, ' ') : '');
  const side = css.match(/\.map-side\s*\{[^}]*\}/);
  ok(Boolean(side) && /display:\s*flex/.test(side[0]), '`.map-side` 是 flex 列');

  /** 顺序不变（旧→新），只是滚动条贴底 */
  ok(/roundLogBoxRef/.test(views) && /el\.scrollTop = el\.scrollHeight/.test(views),
    '**新战报进来时滚到底（显示最新）**');
  ok(/roundLogStickBottomRef/.test(views) && /onScroll=/.test(views),
    '**玩家自己往上翻过就不打扰**（贴底判定）');
  ok(!/\(state\.roundLogs \?\? \[\]\)\.slice\(\)\.reverse\(\)/.test(views),
    '列表顺序**没有**被倒过来（旧在上、新在下）');

  /** 真渲染：多条战报按顺序画出来（服务端按当前大回合过滤 → 用真 logs） */
  const st = mkDuo();
  st.round = 3;
  for (const text of ['第一条', '第二条', '最新一条']) {
    st.logs.push({ t: Date.now(), text, vis: 'all', round: 3 });
  }
  const snap = buildSnapshot(st, 'h');
  const html = draw(snap);
  const i1 = html.indexOf('第一条');
  const i3 = html.indexOf('最新一条');
  console.log(`  快照里本大回合战报 ${snap.roundLogs.length} 条：${JSON.stringify(snap.roundLogs)}`);
  ok(i1 > 0 && i3 > i1, '**渲染顺序是旧 → 新**', `${i1} < ${i3}`);
  ok(html.includes('round-log-box'), '战报盒子在杀手界面上');
}

console.log('=== ④ 移动立绘：不能放到已坍塌的地点 ===');
{
  const fn = views.slice(views.indexOf('const placeStandee'), views.indexOf('const runSurvivor'));
  ok(/collapsedRooms/.test(fn), '**`placeStandee` 检查已坍塌地点**');
  ok(/setStandeeHint/.test(fn), '被拒绝时给一句提示（不是静默无反应）');
  ok(/if \(next\[target\] === roomId\) delete next\[target\]/.test(fn),
    '正常摆放 / 拿起照旧');

  /** 缓存里的立绘如果所在房间后来塌了，也要退回主要出口 */
  const disp = views.slice(views.indexOf('const displayPlayers = useMemo'), views.indexOf('const defendItemChoices'));
  ok(/collapsedRooms/.test(disp) && /gone\.has\(cached\)/.test(disp),
    '**缓存的立绘在房间坍塌后不再停在那儿**', disp.includes('!gone.has(cached)') ? '' : '(检查条件)');
  ok(/state\.collapsedRooms,\s*\]/.test(disp) || /collapsedRooms\]/.test(disp.replace(/\s+/g, ' ')),
    '坍塌列表进了依赖（塌了会立刻重算）');

  ok(/standee-hint/.test(css), '提示文字有样式');
}

console.log(`\nUI 修复（弹窗 / 笔记 / 战报 / 立绘）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
