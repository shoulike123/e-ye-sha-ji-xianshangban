/**
 * **单人热座：坍塌砸到幸存者时，界面要切到幸存者那边**。
 *
 * 用户报的现象：单人模式坍塌砸到幸存者，界面**没有**切过去 ——
 * 行动区还停在杀手侧（还在显示"杀手进化到 N 级 / 确认新效果"），
 * 幸存者那一步根本点不了；战报里只有一句"坍塌还没处理完，进化效果等大家走完再继续。"
 *
 * 这里用**真实的客户端函数** `viewerFactionOf`（从 `client/_ssrbuild/GameViews.js` 导入）
 * 验证三种情形：
 *  ① 直接坍塌、队列第一个是幸存者 → 界面 = 幸存者
 *  ② **坍塌 + 进化确认同时挂着**（用户遇到的组合）→ 仍然是幸存者
 *  ③ 轮到杀手走 → 界面 = 杀手
 *
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs` 生成 `client/_ssrbuild`（没有就跳过 ①~③ 的界面断言）。
 *
 * 跑法：node scripts/tests/collapse-solo-view-switch.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { applyCollapse, standingCollapsibleRooms, collapseMoveOptions } from '../../server/dist/game/collapse.js';
const { upgradeKiller } = await import('../../server/dist/game/effects.js');

const content = loadContent();
const HOST = 'h';
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

let viewerFactionOf = null;
try {
  ({ viewerFactionOf } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 界面断言会跳过；先跑 node scripts/tests/build-menu.mjs）');
}

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function mkCrypt() {
  const st = createLobby('T', HOST, 'H', content, 'crypt');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer7';   // 未命名：2 级要选进化卡（和用户截图一致）
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 只留一个坍塌点，塌哪间就确定了 */
  const all = standingCollapsibleRooms(st);
  const room = all[0];
  st.collapsedRooms = all.filter((id) => id !== room);
  return { st, room };
}

const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};
/** 复刻客户端的"手动优先"：单人模式下 `manualFaction ?? viewerFactionOf(state)` */
const faction = (snap, manual = null) => (manual ?? viewerFactionOf?.(snap) ?? null);

/* ═══════════ ① 直接坍塌：队列第一个是幸存者 ═══════════ */
console.log('=== ① 坍塌砸到幸存者 → 快照与界面都指向幸存者 ===');
{
  const { st, room } = mkCrypt();
  const killer = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  killer.roomId = room;
  survs[0].roomId = room;
  for (const s of survs.slice(1)) s.roomId = st.map.rooms.find((r) => r.id !== room)?.id;

  applyCollapse(st, room);
  const mover = st.players[st.pendingCollapseMoves?.currentId];
  console.log(`   坍塌点 ${room}；第一个要走的是 ${mover?.name}（${mover?.faction}）`);
  ok(mover?.id === survs[0].id, '第一个轮到的是被砸到的幸存者', String(mover?.id));

  const snap = buildSnapshot(st, HOST);
  ok(snap.you.id === survs[0].id,
    '**快照里 `you` 就是该走的幸存者**', `${snap.you.name}(${snap.you.faction})`);
  ok(snap.pendingCollapseMoves?.waiting === false,
    '单人模式下不是 waiting（他有权限点）', String(snap.pendingCollapseMoves?.waiting));
  ok(snap.pendingCollapseMoves?.faction === 'survivor',
    '快照带上了 faction=survivor', String(snap.pendingCollapseMoves?.faction));
  if (viewerFactionOf) {
    ok(faction(snap) === 'survivor',
      '**客户端算出来的界面 = 幸存者**（自动切换正确）', String(faction(snap)));
  }
}

/* ═══════════ ② 坍塌 + 进化确认同时挂着（用户遇到的组合） ═══════════ */
console.log('=== ② 坍塌 + 进化确认同时挂着：界面仍要切到幸存者 ===');
{
  const { st, room } = mkCrypt();
  st.killerLevel = 1;
  upgradeKiller(st);            // 挂出"确认新效果"
  ok(Boolean(st.pendingEvolutionAck), '前提：进化确认面板挂着');
  const killer = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  killer.roomId = room;
  survs[0].roomId = room;
  for (const s of survs.slice(1)) s.roomId = st.map.rooms.find((r) => r.id !== room)?.id;

  const err = tryIt(st, { type: 'ackEvolution' });
  ok(!err, '点「确认新效果」', String(err ?? ''));
  ok(Boolean(st.pendingEvolutionAck), '进化还没收尾（等坍塌走完）');
  ok(Boolean(st.pendingCollapseMoves), '坍塌挂出了"轮流走一步"',
    String(st.pendingCollapseMoves?.currentId));

  const snap = buildSnapshot(st, HOST);
  console.log(`   快照 you = ${snap.you.name}(${snap.you.faction})；` +
    `pendingEvolutionAck=${Boolean(snap.pendingEvolutionAck)}、` +
    `pendingCollapseMoves.currentId=${snap.pendingCollapseMoves?.currentId}`);
  ok(snap.you.faction === 'survivor',
    '**快照 you 指向幸存者（不是杀手）**', `${snap.you.name}(${snap.you.faction})`);
  if (viewerFactionOf) {
    ok(faction(snap) === 'survivor',
      '**界面 = 幸存者**（坍塌优先于"进化确认"那一支）', String(faction(snap)));
    /** 手动切换按钮必须能把他切到杀手侧（用户要的兜底） */
    ok(faction(snap, 'killer') === 'killer',
      '手动选择"看杀手界面"时也听玩家的', String(faction(snap, 'killer')));
  }

  /** 走完幸存者那一步 → 轮到杀手 → 界面切回杀手 */
  const m1 = st.players[st.pendingCollapseMoves.currentId];
  const opts = collapseMoveOptions(st, m1);
  const e1 = tryIt(st, { type: 'collapseMove', toRoomId: opts[0] ?? null });
  ok(!e1, `${m1.name} 走一步`, String(e1 ?? ''));
  const after = buildSnapshot(st, HOST);
  const nextMover = st.players[st.pendingCollapseMoves?.currentId];
  console.log(`   下一步轮到 ${nextMover?.name}（${nextMover?.faction}）`);
  ok(after.you.id === nextMover?.id, '快照跟着切到下一个要走的人',
    `${after.you.name} vs ${nextMover?.name}`);
  if (viewerFactionOf && nextMover?.faction === 'killer') {
    ok(faction(after) === 'killer',
      '**轮到杀手时界面切到杀手侧**', String(faction(after)));
  }
}

/* ═══════════ ③ 队列里只有杀手：界面就是杀手侧 ═══════════ */
console.log('=== ③ 屋里只有杀手：界面 = 杀手侧 ===');
{
  const { st, room } = mkCrypt();
  const killer = st.players[st.killerId];
  killer.roomId = room;
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.roomId = st.map.rooms.find((r) => r.id !== room)?.id;
  }
  applyCollapse(st, room);
  const snap = buildSnapshot(st, HOST);
  ok(snap.you.faction === 'killer', '快照 you = 杀手', `${snap.you.name}(${snap.you.faction})`);
  if (viewerFactionOf) {
    ok(faction(snap) === 'killer', '界面 = 杀手侧', String(faction(snap)));
  }
}

/* ═══════════ ④ 战报：视角算错会让杀手战报"空一块" ═══════════ */
console.log('=== ④ 战报内容：坍塌那几条必须都在（不空） ===');
{
  const { st, room } = mkCrypt();
  st.killerLevel = 1;
  upgradeKiller(st);
  const killer = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  killer.roomId = room;
  survs[0].roomId = room;
  for (const s of survs.slice(1)) s.roomId = st.map.rooms.find((r) => r.id !== room)?.id;
  tryIt(st, { type: 'ackEvolution' });

  const snap = buildSnapshot(st, HOST);
  const texts = (snap.logs ?? []).map((l) => String(l.text ?? ''));
  const has = (needle) => texts.some((t) => t.includes(needle));
  console.log(`   快照战报 ${texts.length} 条；最后三条：`);
  for (const t of texts.slice(-3)) console.log(`     · ${t.slice(0, 48)}`);
  /**
   * ⚠ 视角算错时（`you` = 杀手），战报会按**杀手**的过滤规则走，
   * `vis='survivor'` 的整段（进化公告 / 确认进化 / 坍塌伤害）全被滤掉 ——
   * 用户看到的就是"战报空了一块"。所以这里逐条点名。
   */
  ok(has('杀手进化到'), '**有"杀手进化到 2 级"那条**');
  ok(has('已确认进化效果'), '**有"已确认进化效果"那条**（vis=survivor）');
  ok(has('坍塌'), '有坍塌公告');
  ok(has('受到 1 点伤害'), '**有坍塌伤害那条**（vis=survivor）');
  ok(has('轮流走一步'), '有"轮流走一步"那条');
  ok(texts.every((t) => t.trim().length > 0),
    '**战报里没有空条目**（空白格就是"空了一块"的来源）',
    texts.filter((t) => !t.trim()).length + ' 条空文本');
  ok(texts.every((t) => !/\n\s*\n/.test(t)),
    '战报里没有"连续空行"的条目',
    texts.filter((t) => /\n\s*\n/.test(t)).length + ' 条');
  /** 幸存者视角不该看到 `vis='killer'` 的内部流程日志 */
  ok(!has('坍塌还没处理完'),
    '`vis=killer` 的内部提示不出现在幸存者侧（那条只给杀手看）');
}

console.log(`\n单人坍塌界面切换：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
