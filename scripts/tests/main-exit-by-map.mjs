/**
 * **「主要出口」以地图的幸存者起始房间为准**（用户口径）。
 *
 * 用户报的：「幸存者已达成 5 把钥匙、主要出口的胜利条件，但没有胜利」。
 *
 * 根因：界面上「主要出口」标的是地图的 `survivorStartRoomId` / `entrance`
 * （`Board.tsx` 的 `roomSpecialLabels`），而服务端胜利判定读的是
 * `rules.survivorExitRequiresAllAliveAt` —— rules.json 里写死的 `"R1"`
 * （豪宅的主要出口）。于是墓穴（起始 R3）、城堡（G1）、实验室（G1）
 * 站在真正的主要出口**永远不胜利**。
 *
 * 现在统一走 `mainExitRoomId(state)`：地图起始房间优先，rules 只当兜底。
 *
 * 跑法：node scripts/tests/main-exit-by-map.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, buildSnapshot,
} from '../../server/dist/game/engine.js';
import {
  checkSurvivorWin, checkSplitEscapes, mainExitRoomId, splitEscapeKeysNeeded,
} from '../../server/dist/game/effects.js';

/**
 * 界面上的标记直接用**客户端的真函数**（`Board.roomSpecialLabels`），
 * 不复制一遍规则 —— 否则测试和实现会各自漂移。
 * ⚠ 需要先 `node scripts/tests/build-menu.mjs`。
 */
let roomSpecialLabels = null;
try {
  ({ roomSpecialLabels } = await import('../../client/_ssrbuild/Board.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkSolo(mapId, killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  return st;
}
const survivorsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor');

console.log('=== ① 每张地图：全员站在主要出口 + 钥匙够 → 胜利 ===');
{
  const bad = [];
  for (const m of content.maps) {
    const st = mkSolo(m.id);
    const exit = mainExitRoomId(st);
    st.keysCollected = st.rules.keysNeeded;
    for (const p of survivorsOf(st)) p.roomId = exit;
    checkSurvivorWin(st);
    const win = st.winner === 'survivors';
    console.log(`  ${m.id}（${m.name}）：主要出口=${exit}（起始房间 ${st.map.survivorStartRoomId}，` +
      `rules 写的是 ${st.rules.survivorExitRequiresAllAliveAt}）→ ${win ? '胜利' : '没胜利'}`);
    if (!win) bad.push(m.id);
  }
  ok(bad.length === 0, `**${content.maps.length} 张地图全都能胜利**`, bad.join(' ') || '全都对');
}

console.log('=== ② 反例：站在 rules 里那个旧房间（墓穴的 R1 = 考古营地）不算出口 ===');
{
  const st = mkSolo('crypt');
  const old = st.rules.survivorExitRequiresAllAliveAt;
  const exit = mainExitRoomId(st);
  ok(old !== exit, '（前提）墓穴的旧房间和真正的主要出口不是同一间',
    `旧=${old} 真=${exit}`);
  st.keysCollected = st.rules.keysNeeded;
  for (const p of survivorsOf(st)) p.roomId = old;
  checkSurvivorWin(st);
  ok(st.winner == null, '**站在旧房间不胜利**', String(st.winner));
}

console.log('=== ③ 钥匙不够 / 有人没到出口 → 不胜利 ===');
{
  const st = mkSolo('crypt');
  const exit = mainExitRoomId(st);
  for (const p of survivorsOf(st)) p.roomId = exit;
  st.keysCollected = st.rules.keysNeeded - 1;
  checkSurvivorWin(st);
  ok(st.winner == null, '钥匙少一把不胜利', String(st.winner));

  const st2 = mkSolo('crypt');
  const exit2 = mainExitRoomId(st2);
  st2.keysCollected = st2.rules.keysNeeded;
  const all = survivorsOf(st2);
  all[0].roomId = exit2;
  for (const p of all.slice(1)) p.roomId = st2.map.killerStartRoomId;
  checkSurvivorWin(st2);
  ok(st2.winner == null, '有人还在外面不胜利', String(st2.winner));
}

console.log('=== ④ 隐藏出口那条照旧（不受影响） ===');
{
  const st = mkSolo('crypt');
  /** 隐藏出口也要**钥匙先齐**（`checkSurvivorWin` 在出口判定之前就挡了） */
  st.keysCollected = st.rules.keysNeeded;
  const hidden = st.map.rooms.find((r) => (r.tags ?? []).includes('hiddenExit'));
  const all = survivorsOf(st);
  all[0].items = { ...all[0].items, map: 1 };
  for (const p of all) p.roomId = hidden.id;
  checkSurvivorWin(st);
  ok(st.winner === 'survivors', '**带秘密地图站在隐藏出口 → 胜利**',
    `${hidden.id} winner=${st.winner}`);

  const st2 = mkSolo('crypt');
  st2.keysCollected = st2.rules.keysNeeded;
  for (const p of survivorsOf(st2)) p.roomId = hidden.id;
  checkSurvivorWin(st2);
  ok(st2.winner == null, '没有秘密地图时站在隐藏出口不胜利', String(st2.winner));
}

console.log('=== ⑤ 分头行动：单独逃脱也用同一间主要出口 ===');
{
  const st = mkSolo('crypt');
  st.split = true;
  const exit = mainExitRoomId(st);
  const need = splitEscapeKeysNeeded(st);
  const p = survivorsOf(st)[0];
  p.keys = need;
  p.roomId = exit;
  checkSplitEscapes(st);
  ok(p.escaped === true, `**攒够 ${need} 把钥匙站在主要出口就单独逃脱**`, `${exit} escaped=${p.escaped}`);

  const st2 = mkSolo('crypt');
  st2.split = true;
  const p2 = survivorsOf(st2)[0];
  p2.keys = need;
  p2.roomId = st2.rules.survivorExitRequiresAllAliveAt;
  checkSplitEscapes(st2);
  ok(!p2.escaped, '站在旧房间不逃脱', `${p2.roomId}`);
}

console.log('=== ⑥ 界面上标的「主要出口」和服务端是同一间 ===');
{
  const bad = [];
  for (const m of content.maps) {
    const st = mkSolo(m.id);
    const exit = mainExitRoomId(st);
    const labelled = st.map.rooms
      .filter((r) => roomSpecialLabels(st.map, r).includes('主要出口'))
      .map((r) => r.id);
    const same = labelled.length === 1 && labelled[0] === exit;
    console.log(`  ${m.id}：服务端判定=${exit} 界面标记=${labelled.join('、') || '（无）'}` +
      `${same ? '' : '   ⚠ 不一致'}`);
    if (!same) bad.push(m.id);
  }
  ok(bad.length === 0, '**服务端判定的出口 = 客户端标「主要出口」的那一格**（且只有一格）',
    bad.join(' ') || '五张图都一致');
}

console.log('=== ⑦ 隐藏出口：逃脱判定和界面标记也要对得上（用户问的"会不会也有这个问题"） ===');
{
  /**
   * 逃脱判定（集齐钥匙 + 秘密地图 + 全员在隐藏出口）在服务端**只有一处**、
   * 按 `hiddenExit` 标签找（`effects.checkSurvivorWin`）。
   *
   * 以前界面那边是 `room.id === map.killerStartRoomId || tags.includes('hiddenExit')`
   * —— 多了一个"杀手起始房间"的来源（五张图里两者恰好同格，所以看不出问题）。
   * 用户拍板：**界面只看标签**。这里直接调客户端那个真函数来钉住。
   */
  const bad = [];
  for (const m of content.maps) {
    const byTag = m.rooms.filter((r) => (r.tags ?? []).includes('hiddenExit')).map((r) => r.id);
    const byUi = m.rooms
      .filter((r) => roomSpecialLabels(m, r).includes('隐藏出口'))
      .map((r) => r.id);
    const same = byTag.length === byUi.length && byTag.every((id) => byUi.includes(id));
    console.log(`  ${m.id}：标签=${byTag.join('、') || '（无）'} 界面=${byUi.join('、') || '（无）'}` +
      `${same ? '' : '   ⚠ 不一致'}`);
    if (!same) bad.push(m.id);
  }
  ok(bad.length === 0, '**界面标的「隐藏出口」= hiddenExit 标签那几格**',
    bad.join(' ') || '五张图都一致');

  /** 界面不再把"杀手起始房间"当成第二个来源（哪怕它现在恰好同格） */
  const fake = content.maps.map((m) => ({
    ...m,
    /** 故意把杀手起点挪到一个**不是**隐藏出口的房间 */
    killerStartRoomId: m.rooms.find((r) => !(r.tags ?? []).includes('hiddenExit')).id,
  }));
  const ghost = [];
  for (const m of fake) {
    const tagged = m.rooms.filter((r) => (r.tags ?? []).includes('hiddenExit')).map((r) => r.id);
    const shown = m.rooms.filter((r) => roomSpecialLabels(m, r).includes('隐藏出口')).map((r) => r.id);
    if (shown.join() !== tagged.join()) ghost.push(`${m.id}:${shown.join('、')}`);
  }
  ok(ghost.length === 0,
    '**把杀手起点挪到别处后，界面不会凭空多标「隐藏出口」**',
    ghost.join(' ') || '五张图都干净');

  /** 隐藏出口的逃脱判定确实走标签（不是起始房间） */
  const st = mkSolo('crypt');
  st.keysCollected = st.rules.keysNeeded;
  const hidden = st.map.rooms.find((r) => (r.tags ?? []).includes('hiddenExit'));
  const all = survivorsOf(st);
  all[0].items = { ...all[0].items, map: 1 };
  for (const p of all) p.roomId = hidden.id;
  checkSurvivorWin(st);
  ok(st.winner === 'survivors', `**带秘密地图站在隐藏出口（${hidden.id}）→ 胜利**`,
    String(st.winner));

  /** 换成不是隐藏出口的地方就不该胜利 */
  const st2 = mkSolo('crypt');
  st2.keysCollected = st2.rules.keysNeeded;
  const all2 = survivorsOf(st2);
  all2[0].items = { ...all2[0].items, map: 1 };
  const notHidden = st2.map.rooms.find(
    (r) => !(r.tags ?? []).includes('hiddenExit') && r.id !== mainExitRoomId(st2),
  );
  for (const p of all2) p.roomId = notHidden.id;
  checkSurvivorWin(st2);
  ok(st2.winner == null, `站在「${notHidden.id}」（不是隐藏出口）不胜利`, String(st2.winner));
}

console.log(`\n主要出口口径：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
