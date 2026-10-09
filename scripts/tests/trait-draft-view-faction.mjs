/**
 * **多人局里，双方永远不该看到对方的界面**（用户口径）。
 *
 * 唯一会串的地方是【变体1】开局「选特性卡」（`traitDraft`）：
 * `viewerFactionOf` 那个兜底是按 `traitPickerIds`（**全局**：两边都列在里面）
 * 猜界面的 —— 于是多人局里"幸存者这边都选完、只剩杀手还在选"时，
 * 幸存者玩家的界面会被切成**杀手界面**。
 *
 * 修法：那个兜底只留给**单人热座**（一个人管两边，需要自动切过去），
 * 其他模式一律留在自己那一方的界面等（`GameViews.tsx` 的 `traitDraft` 分支）。
 *
 * 跑法：node scripts/tests/trait-draft-view-faction.mjs
 * （需要先 `node scripts/tests/build-menu.mjs`）
 */
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

let viewerFactionOf = null;
try {
  ({ viewerFactionOf } = await import('../../client/_ssrbuild/GameViews.js'));
}
catch {
  console.log('（没有 client/_ssrbuild —— 先跑 scripts/tests/build-menu.mjs）');
  process.exit(1);
}

/** 1对1：杀手 h + 幸存者 s（多人局：两边各一名玩家） */
function mkDuo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
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
  return st;
}

/** 单人热座：房主一人管两边 */
function mkSolo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  return st;
}

/** 把局面摆成"选特性卡阶段，只剩下 killerId 那份没选" */
function atTraitDraft(st, leftIds) {
  st.variant1 = true;
  st.phase = 'traitDraft';
  st.traitOffers = Object.fromEntries(leftIds.map((id) => [id, ['trait_k18']]));
  return st;
}

const survivorsOf = (st) => Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);

console.log('=== ① 多人局：只剩杀手没选 → 幸存者仍留在幸存者界面 ===');
{
  const st = mkDuo();
  atTraitDraft(st, [st.killerId]);
  console.log(`   还等着选的人：${JSON.stringify(st.traitPickerIds ?? Object.keys(st.traitOffers))}`);
  const sView = viewerFactionOf(buildSnapshot(st, 's'));
  const kView = viewerFactionOf(buildSnapshot(st, 'h'));
  console.log(`   幸存者玩家看到：${sView}；杀手玩家看到：${kView}`);
  ok(sView === 'survivor', '**幸存者玩家不会被切成杀手界面**', String(sView));
  ok(kView === 'killer', '杀手玩家在杀手界面', String(kView));
}

console.log('\n=== ② 多人局：轮到幸存者自己选 → 按自己阵营 ===');
{
  const st = mkDuo();
  const sv = survivorsOf(st)[0];
  atTraitDraft(st, [sv.id, st.killerId]);
  const sView = viewerFactionOf(buildSnapshot(st, 's'));
  console.log(`   幸存者玩家看到：${sView}`);
  ok(sView === 'survivor', '轮到自己选时是幸存者界面', String(sView));
}

console.log('\n=== ③ 对照：单人热座仍会自动切到杀手界面（兜底保留）===');
{
  const st = mkSolo();
  atTraitDraft(st, [st.killerId]);
  const hostView = viewerFactionOf(buildSnapshot(st, 'h'));
  console.log(`   房主看到：${hostView}`);
  ok(hostView === 'killer', '**单人热座：只剩杀手没选 → 自动切到杀手界面**', String(hostView));
}

console.log(`\n多人局界面不串：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
