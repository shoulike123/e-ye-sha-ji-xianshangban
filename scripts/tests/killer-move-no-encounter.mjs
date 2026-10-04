/**
 * **杀手移动进入有幸存者的房间，不该自动开战**（用户报：慢速阶段突然爆发遭遇）。
 *
 * 用户原话：「慢速阶段结束时为什么发生了遭遇？我什么都没打」
 * 战报顺序是：搜索（没人）→ 移动到 R4南通道 → 进入慢速卡牌阶段 → 发现了 3 名幸存者 → 遭遇爆发。
 *
 * 规则：**只有〔搜索〕命中才开战**（`startEncounter` 的注释也这么写）。
 * 移动只是"走过去"，看到人不等于开战。
 *
 * 跑法：node scripts/tests/killer-move-no-encounter.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
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
  return st;
}
const tryIt = (st, action) => {
  try { handleAction(st, 'h', action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 找一对相邻房间：`from` 空着、`to` 放三名幸存者 */
function pickRooms(st) {
  for (const e of st.map.edges ?? []) {
    if (!(!e.pathType || e.pathType === 'door')) continue;
    if (e.from === e.to) continue;
    return { killerRoom: e.from, survRoom: e.to };
  }
  return null;
}

/* ═══════════ ① 搜索没人 + 移动到有人房间：不该开战 ═══════════ */
console.log('=== ① 「搜索（没人）→ 移动到有人房间」：不许自动开战 ===');
{
  const st = mk();
  const rooms = pickRooms(st);
  ok(Boolean(rooms), '找到一对相邻房间', JSON.stringify(rooms));
  const { killerRoom, survRoom } = rooms;
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  k.roomId = killerRoom;
  for (const s of survs) s.roomId = survRoom;

  /** 进入杀手回合：2 个普通行动 */
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  st.encounter = null;
  st.lastSearchFound = false;
  const logFrom = st.logs.length;

  const e1 = tryIt(st, { type: 'search' });
  ok(!e1, `第 1 个行动：搜索「${killerRoom}」（那里没人）`, String(e1 ?? ''));
  ok(st.lastSearchFound === false, '搜索没发现人 → `lastSearchFound=false`', String(st.lastSearchFound));
  ok(!st.encounter, '搜索没人当然不开战');

  const e2 = tryIt(st, { type: 'move', toRoomId: survRoom });
  ok(!e2, `第 2 个行动：移动到「${survRoom}」（那里有 ${survs.length} 名幸存者）`, String(e2 ?? ''));
  console.log(`   移动后：killerRoom=${st.players[st.killerId].roomId}、` +
    `killerTurnStep=${st.killerTurnStep}、encounter=${st.encounter ? '有' : 'null'}、` +
    `lastSearchFound=${st.lastSearchFound}`);
  ok(!st.encounter,
    '**移动进入有人房间不该开战**（只有〔搜索〕命中才开战）',
    st.encounter ? JSON.stringify(st.encounter.roomId) : 'null');
  ok(st.killerTurnStep === 'slow',
    '两次普通行动用完 → 进入慢速阶段', st.killerTurnStep);
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  ok(!mine.some((t) => t.includes('发现了') && t.includes('名幸存者')),
    '战报里**不该出现"发现了 N 名幸存者"**（那是搜索命中的文案）',
    mine.filter((t) => t.includes('发现了')).join(' | ') || '（没有）');
  ok(!mine.some((t) => t.includes('遭遇战爆发')),
    '战报里也不该有"遭遇战爆发"');
}

/* ═══════════ ② 慢速阶段也不该自己冒出遭遇 ═══════════ */
console.log('=== ② 慢速阶段什么都不打 → 结束回合，也不许冒出遭遇 ===');
{
  const st = mk();
  const rooms = pickRooms(st);
  const { killerRoom, survRoom } = rooms;
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  k.roomId = killerRoom;
  for (const s of survs) s.roomId = survRoom;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  st.encounter = null;
  st.lastSearchFound = false;
  tryIt(st, { type: 'search' });
  tryIt(st, { type: 'move', toRoomId: survRoom });
  ok(st.killerTurnStep === 'slow', '前提：已经在慢速阶段', st.killerTurnStep);

  const logFrom = st.logs.length;
  const e = tryIt(st, { type: 'endTurn' });
  ok(!e, '什么都没打 → 结束回合', String(e ?? ''));
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  console.log(`   结束回合后：phase=${st.phase}、encounter=${st.encounter ? '有' : 'null'}`);
  ok(!st.encounter, '**慢速阶段结束也不该冒出遭遇**',
    st.encounter ? JSON.stringify(st.encounter.roomId) : 'null');
  ok(!mine.some((t) => t.includes('遭遇战爆发')), '战报里没有遭遇');
}

/* ═══════════ ③ 反过来：搜索命中就该开战（别修坏了） ═══════════ */
console.log('=== ③ 〔搜索〕命中必须照常开战 ===');
{
  const st = mk();
  const rooms = pickRooms(st);
  const { survRoom } = rooms;
  const k = st.players[st.killerId];
  const survs = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  /** 把杀手直接放进有人的房间，然后搜索 */
  k.roomId = survRoom;
  for (const s of survs) s.roomId = survRoom;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  st.encounter = null;
  st.lastSearchFound = false;
  const e = tryIt(st, { type: 'search' });
  ok(!e, '搜索（房间里有 3 名幸存者）', String(e ?? ''));
  ok(Boolean(st.encounter),
    '**搜索命中 → 照常开战**', st.encounter ? `遭遇于 ${st.encounter.roomId}` : '没开战');
  const snap = buildSnapshot(st, 'h');
  ok(snap.phase === 'encounter', '快照进入遭遇阶段', snap.phase);
}

console.log(`\n移动 ≠ 遭遇：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
