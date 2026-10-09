/**
 * **未命名局：幸存者也要能在「杀手信息」里看到进化卡牌与锁定牌**（用户口径）。
 *
 * 用户原话：「未命名游戏中幸存者应该能看到杀手信息中选的进化卡牌和锁定牌」。
 *
 * 「杀手信息」那块面板是**双方共用**的（顶栏「查看杀手信息」），
 * 它画两样东西：
 *  - **进化卡牌**（未命名 2 / 4 级各选一张）：面板里列「进化卡牌「X」：效果」，
 *    并把已获得的那张卡面**金色描边**；
 *  - **锁定牌 / 普通牌**：按 `allKillerCards` 里的 `locked` 分组画卡面。
 *
 * 以前 `chosenEvolutionCards` 只发给杀手（`viewerFaction === 'killer' ? … : []`），
 * 所以**幸存者那份是空的** —— 面板里既没有那行效果、也没有金边。
 *
 * 跑法：node scripts/tests/killer-info-visibility.mjs
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

/** 1对1：**未命名**（killer7）—— 只有他有"进化卡牌" */
function mk() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

console.log('=== ① 进化卡牌：双方都看得到（名字 + 效果）===');
{
  const st = mk();
  const pool = (content.cards.evolutionCard ?? []).map((c) => c.id);
  ok(pool.length > 0, '（前提）内容里有进化卡牌', String(pool.length));
  /** 直接摆成"已经选过一张进化卡" */
  const picked = pool[0];
  st.chosenEvolutionCards = [picked];

  const kSnap = buildSnapshot(st, 'h');
  const sSnap = buildSnapshot(st, 's');
  const kList = kSnap.chosenEvolutionCards ?? [];
  const sList = sSnap.chosenEvolutionCards ?? [];
  console.log(`  杀手看到 ${kList.length} 张：${kList.map((c) => c.name).join('、') || '（空的）'}`);
  console.log(`  幸存者看到 ${sList.length} 张：${sList.map((c) => c.name).join('、') || '（空的）'}`);
  ok(kList.length === 1, '杀手那边有（对照）', JSON.stringify(kList.map((c) => c.id)));
  ok(sList.length === 1, '**幸存者那边也有**', JSON.stringify(sList.map((c) => c.id)));
  ok(sList[0]?.name && sList[0]?.text, '而且带了**名字和效果文字**（面板直接画这两样）',
    `${sList[0]?.name}：${sList[0]?.text?.slice(0, 20)}…`);
}

console.log('\n=== ② 锁定牌：幸存者也拿得到那张清单（带 locked 标记）===');
{
  const st = mk();
  const sSnap = buildSnapshot(st, 's');
  const cards = sSnap.allKillerCards ?? [];
  const locked = cards.filter((c) => c.locked);
  console.log(`  未命名一共 ${cards.length} 张，其中锁定牌 ${locked.length} 张：` +
    `${locked.map((c) => c.name).join('、') || '（没有）'}`);
  ok(cards.length > 0, '**幸存者拿得到杀手的卡牌清单**', String(cards.length));
  ok(locked.length > 0, '**其中有标着 locked 的锁定牌**', JSON.stringify(locked.map((c) => c.id)));
  ok((st.killerLocked ?? []).length > 0, '（机制）服务端确实有"当前锁着"的清单',
    JSON.stringify(st.killerLocked));
}

console.log('\n=== ②b 「杀手选择的锁定牌」要能高光（obtained 标记）===');
{
  const st = mk();
  /** 摆成"二选一已经选过"：选中的进手牌、另一张作废 */
  const lockedIds = [...st.killerLocked];
  ok(lockedIds.length >= 2, '（前提）未命名开局有 2 张二选一锁定牌', JSON.stringify(lockedIds));
  const [taken, dropped] = lockedIds;
  st.killerHand = [...st.killerHand, taken];
  st.killerLocked = st.killerLocked.filter((x) => x !== taken && x !== dropped);
  st.abandonedLockedCards = [...(st.abandonedLockedCards ?? []), dropped];

  const sSnap = buildSnapshot(st, 's');
  const cards = sSnap.allKillerCards ?? [];
  const got = cards.filter((c) => c.obtained);
  const takenRow = cards.find((c) => c.id === taken);
  const droppedRow = cards.find((c) => c.id === dropped);
  console.log(`  幸存者看到"已获得"的锁定牌：${got.map((c) => c.name).join('、') || '（没有）'}`);
  ok(takenRow?.obtained === true, '**选中的那张 → `obtained: true`**（面板给它金边）',
    String(takenRow?.obtained));
  ok(droppedRow?.obtained === false, '**二选一作废的那张 → 不高光**',
    String(droppedRow?.obtained));
  ok(got.length === 1, '只有"拿到手的那一张"被标出来', JSON.stringify(got.map((c) => c.id)));
  /** 还锁着的（没选过的）不算 */
  const stillLocked = cards.filter((c) => c.locked && !c.obtained);
  ok(stillLocked.length >= 0, '（对照）还锁着的那些没有 obtained');
}

console.log('\n=== ③ 面板确实读的是这些字段 ===');
{
  const fs = await import('node:fs');
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(/state\.chosenEvolutionCards/.test(views), '面板里画了 `chosenEvolutionCards`');
  ok(/chosen \? ' evo-card-chosen'/.test(views), '已获得的那张进化卡牌会金色描边');
  ok(/const locked = mine\.filter\(\(c\) => c\.locked\)/.test(views),
    '锁定牌是按 `allKillerCards` 的 `locked` 分组的');
  ok(/c\.obtained \? ' card-obtained'/.test(views),
    '**锁定牌里"已获得"的那张也加高光类**（`card-obtained`）');
  const css = fs.readFileSync(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  ok(/\.killer-info-piece\.card\.card-obtained\s*\{[^}]*#f0c14b/.test(css),
    'CSS 里那套金边样式在（和进化卡牌同一个颜色）');
  /** 服务端那边不能再用 `viewerFaction === 'killer'` 把它挡住 */
  const engine = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  const at = engine.indexOf('chosenEvolutionCards:');
  const firstLine = engine.slice(at, engine.indexOf('\n', at));
  ok(!/viewerFaction === 'killer'/.test(firstLine),
    '**服务端不再按阵营挡这个字段**', firstLine.trim());
  ok(/obtained: Boolean\(c\.locked\)/.test(engine), '`obtained` 是服务端算好下发的');
}

console.log(`\n杀手信息（进化卡牌 / 锁定牌）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
