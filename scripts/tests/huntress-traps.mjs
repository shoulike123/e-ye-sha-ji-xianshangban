/**
 * **女猎手的猎手陷阱**（用户报的第 7 类最后一块）。
 *
 * 用户原话：「女猎手：在放置陷阱过程中，添加一个【重置陷阱放置】的按钮，
 * 这样在最终确定前，女猎手可以重新选择放置的陷阱。」
 *
 * 这里验：
 *  - 开局停在 `trapSetup`，只能放「常规搜索位 / 常规修理位」
 *  - 一个地点只能一个陷阱；4 个陷阱要放在 4 个不同地点
 *  - **重置**之后草稿和落子**一起清空**，原来那些地点能重新放
 *  - 没放满不能确认；放满才能确认，确认后不能再重置
 *  - 界面上有这颗按钮（SSR）
 *
 * 跑法：`npm run test:traps`
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot, handleAction,
} from '../../server/dist/game/engine.js';
import {
  regularTrapRooms, trapRemaining, allTrapsPlaced, TRAP_LABEL,
} from '../../server/dist/game/hunterTraps.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const errOf = (fn) => {
  try { fn(); return null; } catch (e) { return String(e?.message ?? e); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

/** 女猎手（killer4）的 1 对 1；开局会停在 `trapSetup` */
function mkHuntress(mapId = 'mansion') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer4';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

/** 按 2 网 / 1 骨 / 1 熊 依次放好（返回放的地点） */
function placeAll(st, rooms) {
  const plan = [
    ['net', rooms[0]],
    ['net', rooms[1]],
    ['bone', rooms[2]],
    ['bear', rooms[3]],
  ];
  for (const [kind, roomId] of plan) {
    handleAction(st, 'h', { type: 'pickTrapKind', kind }, content);
    handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: roomId }, content);
  }
  return plan.map(([, r]) => r);
}

/* ═══════════ ① 开局：只能放在常规搜索位 / 修理位 ═══════════ */
console.log('=== ① 开局布置的区域限制 ===');
{
  const st = mkHuntress();
  ok(st.phase === 'trapSetup', '女猎手开局停在布陷阱这一步', st.phase);
  const allowed = regularTrapRooms(st);
  console.log(`   可选 ${allowed.length} 个：${allowed.join('、')}`);
  ok(allowed.length >= 4, '可选地点至少 4 个', String(allowed.length));

  const outside = st.map.rooms.map((r) => r.id).find((id) => !allowed.includes(id));
  ok(Boolean(outside), '地图上存在"不能放"的地点', String(outside));
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'net' }, content);
  const e = errOf(() => handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: outside }, content));
  ok(e?.includes('常规搜索位'), '放到区域外会被拒', String(e));

  /** 一个地点只能一个陷阱 */
  handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: allowed[0] }, content);
  ok(Object.keys(st.pendingTrapPlacement.placed).length === 1, '放下第 1 个');
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'net' }, content);
  const e2 = errOf(() => handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: allowed[0] }, content));
  ok(e2 === null, '同一个地点再点一次 = **取消**（而不是报错）', String(e2));
  ok(Object.keys(st.pendingTrapPlacement.placed).length === 0, '取消后草稿空了');
}

/* ═══════════ ② 【重置陷阱放置】：草稿和落子一起清 ═══════════ */
console.log('=== ② 重置陷阱放置 ===');
{
  const st = mkHuntress();
  const allowed = regularTrapRooms(st);
  const placed = placeAll(st, allowed);
  ok(allTrapsPlaced(st), '四个陷阱都放好了', Object.keys(st.hunterTraps).join(','));
  ok(Object.keys(st.hunterTraps).length === 4, '落子状态里有 4 个');
  ok(trapRemaining(st, 'net') === 0 && trapRemaining(st, 'bear') === 0, '数量对得上');

  handleAction(st, 'h', { type: 'resetTrapPlacement' }, content);
  ok(Object.keys(st.pendingTrapPlacement.placed).length === 0, '**草稿清空了**');
  ok(st.pendingTrapPlacement.kind === null, '选中的类型也清空（要重新点类型）');
  ok(
    Object.keys(st.hunterTraps).length === 0,
    '**落子状态也清空了**（以前不清 → 原地点显示"已经有陷阱"、还放不回去）',
    Object.keys(st.hunterTraps).join(','),
  );
  ok(!allTrapsPlaced(st), '重置后当然还没放完');
  ok(
    st.logs.some((l) => l.text.includes('重置了陷阱放置')),
    '战报里写了一句',
    st.logs.filter((l) => l.text.includes('重置')).slice(-1)[0]?.text ?? '',
  );

  /** 关键：原来那些地点**能重新放** */
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'net' }, content);
  const e = errOf(() => handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: placed[0] }, content));
  ok(e === null, '**重置后原来那个地点能重新放**', String(e));
  ok(Boolean(st.hunterTraps[placed[0]]), '落子写回去了');

  /** 换成别的搭配也能放满 */
  const other = allowed.slice(1, 4);
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'net' }, content);
  handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: other[0] }, content);
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'bone' }, content);
  handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: other[1] }, content);
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'bear' }, content);
  handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: other[2] }, content);
  ok(allTrapsPlaced(st), '**重置后重新选一套，照样能放满**');
}

/* ═══════════ ③ 放满才能确认；确认后不能重置 ═══════════ */
console.log('=== ③ 确认与确认之后 ===');
{
  const st = mkHuntress();
  const allowed = regularTrapRooms(st);
  const e = errOf(() => handleAction(st, 'h', { type: 'confirmTrapPlacement' }, content));
  ok(e?.includes('还有陷阱没放完'), '没放满不能确认', String(e));

  placeAll(st, allowed);
  handleAction(st, 'h', { type: 'confirmTrapPlacement' }, content);
  ok(st.pendingTrapPlacement.done === true, '确认完成');
  ok(st.phase !== 'trapSetup', '确认后进入正常流程', st.phase);
  ok(Object.keys(st.hunterTraps).length === 4, '**确认过的 4 个陷阱留在场上**');

  const e2 = errOf(() => handleAction(st, 'h', { type: 'resetTrapPlacement' }, content));
  ok(e2?.includes('开局准备中') || e2 !== null, '确认之后不再是布陷阱阶段，重置会被流程挡住', String(e2));
  ok(Object.keys(st.hunterTraps).length === 4, '被挡之后陷阱没被清掉');
}

/* ═══════════ ④ 每张地图都能放满（区域限制不会凑不够） ═══════════ */
console.log('=== ④ 五张地图都有足够的位置 ===');
{
  for (const m of content.maps) {
    const st = mkHuntress(m.id);
    if (st.phase !== 'trapSetup') { ok(false, `${m.name} 没进布陷阱阶段`); continue; }
    const allowed = regularTrapRooms(st);
    ok(allowed.length >= 4, `${m.name}：常规搜索/修理位 ≥ 4（${allowed.length} 个）`);
    /** 位置够 → 保留"只能放常规位"的限制 */
    ok(st.pendingTrapPlacement.restricted === true, `${m.name}：位置够，保留区域限制`);
  }

  /** 墓穴：遗物室 R6 可以布陷阱，但它**不是搜索地点** */
  const crypt = mkHuntress('crypt');
  const rooms = regularTrapRooms(crypt);
  console.log(`   墓穴常规位：${rooms.join('、')}`);
  ok(rooms.includes('R6'), '**墓穴把 R6 遺物室算作可布陷阱的位置**（用户指定）', rooms.join(','));
  ok(rooms.length === 4, '墓穴正好 4 个位置', String(rooms.length));
  ok(
    crypt.map.rooms.filter((r) => (r.tags ?? []).includes('searchable')).length === 2,
    '墓穴只有 2 个常规搜索位（用户：遗物室不是搜索地点）',
    crypt.map.rooms.filter((r) => (r.tags ?? []).includes('searchable')).map((r) => r.id).join(','),
  );
  ok(
    crypt.map.rooms.find((r) => r.id === 'R6')?.tags.includes('special-relic') === true,
    'R6 靠 special-relic 进"可布陷阱"名单（不是 searchable）',
  );
}

/* ═══════════ ⑤ 界面：面板上有「重置陷阱放置」按钮 ═══════════ */
console.log('=== ⑤ 界面（SSR）===');
{
  const { GameView } = await import('../../client/_ssrbuild/GameViews.js');
  const st = mkHuntress();
  const allowed = regularTrapRooms(st);
  const draw = () => renderToStaticMarkup(
    React.createElement(GameView, {
      state: buildSnapshot(st, 'h'), isHost: true, error: null, onAction: async () => {},
    }),
  );

  const html0 = await draw();
  ok(html0.includes('重置陷阱放置'), '**面板上有「重置陷阱放置」按钮**');
  ok(html0.includes(TRAP_LABEL.net), '列出了陷阱类型', TRAP_LABEL.net);

  /** 放一个之后按钮还在（最终确定前都能重置） */
  handleAction(st, 'h', { type: 'pickTrapKind', kind: 'net' }, content);
  handleAction(st, 'h', { type: 'placeHunterTrap', tokenId: allowed[0] }, content);
  const html1 = await draw();
  ok(html1.includes('重置陷阱放置'), '放了一半按钮仍在（最终确定前随时能重置）');
}

console.log(`\n女猎手陷阱：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
