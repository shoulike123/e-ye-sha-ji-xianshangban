/**
 * **杀手【快进】要分阶段**（用户报："我在慢速阶段快进怎么会搜索？"）。
 *
 * 快进的本意（只给单人热座用）是"替我省掉出牌，快速把回合走完"：
 *  - 快速/二选一阶段：跳过出牌 → 原地搜索 2 次 → 结束回合
 *  - **慢速阶段：本来就只是"打不打沙漏牌"，快进只该跳过出牌、直接结束回合**
 *
 * 反例（修之前）：`fastForwardKiller` 不管在哪个阶段都把回合**拽回**
 * "2 次普通行动（原地搜索）"—— 于是慢速阶段点一下快进就凭空多出两次搜索，
 * 屋里有人就直接爆发遭遇（用户遇到的就是这个）。
 *
 * 跑法：node scripts/tests/killer-fastforward-slow.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, fastForwardKiller,
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
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer7';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'killerMain';
  st.encounter = null;
  st.lastSearchFound = false;
  /** 三名幸存者**都站在杀手所在地点** —— 这样"搜索"必定命中 */
  const k = st.players[st.killerId];
  k.roomId = st.map.killerStartRoomId ?? st.map.rooms[0].id;
  for (const s of Object.values(st.players)) {
    if (s.faction === 'survivor' && s.alive) s.roomId = k.roomId;
  }
  return st;
}

/* ═══════════ ① 慢速阶段快进：只结束回合，不搜索 ═══════════ */
console.log('=== ① 慢速阶段点快进：跳过出牌 → 直接结束回合（不许搜索） ===');
{
  const st = mk();
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  const logFrom = st.logs.length;
  fastForwardKiller(st);
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  console.log(`   快进后：encounter=${st.encounter ? '有' : 'null'}、phase=${st.phase}、` +
    `killerTurnStep=${st.killerTurnStep}`);
  console.log(`   本次战报：${mine.map((t) => t.slice(0, 28)).join(' | ')}`);
  ok(!st.encounter,
    '**没有爆发遭遇**（慢速阶段不该自己搜索）',
    st.encounter ? JSON.stringify(st.encounter.roomId) : 'null');
  ok(!mine.some((t) => t.includes('发现了')),
    '战报里没有"发现了 N 名幸存者"', mine.filter((t) => t.includes('发现了')).join(' | ') || '（没有）');
  ok(!mine.some((t) => t.includes('搜索房间')),
    '也没有"搜索房间"这条', mine.filter((t) => t.includes('搜索')).join(' | ') || '（没有）');
  ok(mine.some((t) => t.includes('慢速')),
    '战报说明了"跳过慢速阶段的出牌"',
    mine.find((t) => t.includes('慢速')) ?? '（没写）');
  ok(st.phase !== 'killerMain',
    '**回合照常结束**（推进到下一方/下一轮）', st.phase);
}

/* ═══════════ ② 快速阶段快进：保持原样（跳过出牌 → 原地搜索 2 次） ═══════════ */
console.log('=== ② 快速阶段点快进：仍然是"原地搜索 2 次"（原本的设计） ===');
{
  const st = mk();
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  const logFrom = st.logs.length;
  fastForwardKiller(st);
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  console.log(`   快进后：encounter=${st.encounter ? '有' : 'null'}、phase=${st.phase}`);
  console.log(`   本次战报：${mine.map((t) => t.slice(0, 26)).join(' | ')}`);
  ok(mine.some((t) => t.includes('名幸存者')),
    '屋里有人 → 搜索命中（这句照旧）', mine.find((t) => t.includes('名幸存者')) ?? '');
  ok(Boolean(st.encounter),
    '**搜索命中照常开战**（快速阶段的快进语义没变）',
    st.encounter ? `遭遇于 ${st.encounter.roomId}` : '（没开战）');
}

/* ═══════════ ③ 二选一阶段（main + 还没选）快进：同上 ═══════════ */
console.log('=== ③ 二选一阶段点快进：仍然是"原地搜索 2 次" ===');
{
  const st = mk();
  st.killerTurnStep = 'main';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 2;
  const logFrom = st.logs.length;
  fastForwardKiller(st);
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  ok(mine.some((t) => t.includes('名幸存者')),
    '搜索命中', mine.find((t) => t.includes('名幸存者')) ?? '');
  ok(Boolean(st.encounter), '开战', st.encounter ? `遭遇于 ${st.encounter.roomId}` : '（没开战）');
}

/* ═══════════ ④ 慢速阶段、屋里没人：照样只结束回合 ═══════════ */
console.log('=== ④ 慢速阶段 + 屋里没人：也只是结束回合 ===');
{
  const st = mk();
  const k = st.players[st.killerId];
  const away = st.map.rooms.find((r) => r.id !== k.roomId)?.id;
  for (const s of Object.values(st.players)) {
    if (s.faction === 'survivor' && s.alive) s.roomId = away;
  }
  st.killerTurnStep = 'slow';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  const logFrom = st.logs.length;
  fastForwardKiller(st);
  const mine = st.logs.slice(logFrom).map((l) => l.text);
  ok(!mine.some((t) => t.includes('搜索')),
    '没有搜索', mine.filter((t) => t.includes('搜索')).join(' | ') || '（没有）');
  ok(st.phase !== 'killerMain', '回合结束', st.phase);
}

console.log(`\n快进分阶段：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
