/**
 * **鏡之門戶是"额外行动 + 行动区二次确认"**（用户口径）：
 *
 * > 镜之门户的传送是额外行动啊，在行动区做二次确认，你写到特殊行动去了，改
 *
 * 改之前：
 *  - 入口虽然在「额外行动」弹窗里，但**目标按钮**被塞进了行动区的 `extras`，
 *    还被 `EXTRA_KEEP` 放行 → 整排 🌀 目标挂在**「特殊行动」**那一栏下面；
 *  - 点一下目标**直接传送**（没有二次确认）；
 *  - 动作里不带 `actorPlayerId` → 算到"当前行动者"头上（额外行动是按每个人
 *    列按钮的，做完小回合的另一个人想传送就会报"没有這件遗物"）。
 *
 * 跑法：node scripts/tests/mirror-portal-extra-action.mjs
 * （界面部分是源码断言；服务端行为在 `encounter-defense.mjs` ⑥/⑥-b）
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');

console.log('=== ① 不再挂到「特殊行动」那一栏 ===');
{
  ok(!/EXTRA_KEEP = \/\^\(crossbow\$[^/]*mirror/.test(views),
    '**`EXTRA_KEEP` 不放行 `mirror-` 了**（目标按钮不会渲染在「特殊行动」下面）');
  ok(!/key="relic-mirror"/.test(views),
    '行动区那个"額外行動：鏡之門戶"入口按钮也删了（额外行动只从弹窗进）');
}

console.log('\n=== ② 行动区：选中 → 「确认传送」（二次确认）===');
{
  /** 用唯一锚点定位那块面板（`額外行動：` 有好几处，不能拿它当锚） */
  const anchor = views.indexOf('actorPlayerId: mirrorActor.id');
  const panel = anchor >= 0 ? views.slice(anchor - 2200, anchor + 600) : '';
  ok(anchor > 0, '（前提）找得到那块面板');
  ok(/确认传送/.test(panel), '**有「确认传送」这颗按钮**');
  ok(/setMirrorPickRoom/.test(panel), '目标按钮只"选中"（写进 `mirrorPickRoom`）');
  ok(!/onClick=\{\(\) =>\s*void onAction\(\{ type: 'useMirrorPortal'/.test(panel),
    '**目标按钮不再"点一下就传走"**');
  ok(/disabled=\{!mirrorPickRoom\}/.test(panel), '没选地点时「确认传送」是灰的');
  ok(/useMirrorPortal/.test(panel) && /toRoomId: rid/.test(panel), '确认之后才发 `useMirrorPortal`');
  ok(/actorPlayerId: mirrorActor\.id/.test(panel),
    '**带上 `actorPlayerId`**（额外行动按每个人列按钮，要认人）');
}

console.log('\n=== ③ 「要传送的那名幸存者」按人判，不看 `state.canUseMirrorPortal` ===');
{
  ok(/const mirrorActor = mirrorActorId/.test(views), '有 `mirrorActor` 这个派生值');
  const at = views.indexOf('mirrorPicking &&');
  const cond = at >= 0 ? views.slice(at, at + 400) : '';
  ok(/mirrorActor/.test(cond), '面板条件用的是 `mirrorActor`', cond.split('\n')[0] ?? '');
  ok(!/isSurvivorView && mirrorPicking && state\.canUseMirrorPortal/.test(views),
    '不再用 `state.canUseMirrorPortal`（那个是"针对 state.you"的，会点了没反应）');
}

console.log('\n=== ④ 服务端：`useMirrorPortal` 认 `actorPlayerId` ===');
{
  const ts = fs.readFileSync(new URL('../../server/src/game/engine.ts', import.meta.url), 'utf8');
  ok(/action\.type === 'useMirrorPortal'\)/.test(ts),
    '`resolveActorId` 的白名单里加上了它');
  ok(/const mir = state\.players\[action\.actorPlayerId \?\? playerId\]/.test(ts),
    '处理函数按 `actorPlayerId` 认人');
}

console.log('\n=== ⑤ 真打一局：传送本身照旧（额外行动、不占一般行动）===');
{
  const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
  const st = createLobby('T', 'h', 'H', content, 'crypt');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  const { giveRelic, mirrorTargets } = await import('../../server/dist/game/relic.js');
  const s = Object.values(st.players).find((p) => p.faction === 'survivor' && p.alive);
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.activeSurvivorIndex = st.turnOrder.indexOf(s.id);
  s.mainActionUsed = false;
  giveRelic(st, s, 'relic_mirror');
  const targets = mirrorTargets(st);
  const from = s.roomId;
  try { handleAction(st, s.controllerId, { type: 'useMirrorPortal', toRoomId: targets[0] }, content); }
  catch (e) { ok(false, '传送本身要能成功', String(e?.message ?? e)); }
  console.log(`  ${from} → ${s.roomId}；额外行动=${s.extraActionUsedThisTurn}；一般行动用了没=${s.mainActionUsed}`);
  ok(s.roomId === targets[0], '传过去了', String(s.roomId));
  ok(s.extraActionUsedThisTurn === true, '**算额外行动**');
  ok(s.mainActionUsed === false, '**不占一般行动**');
}

console.log(`\n鏡之門戶（额外行动 + 二次确认）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
