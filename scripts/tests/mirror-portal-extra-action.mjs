/**
 * **鏡之門戶是额外行动，只确认一次是否传送到螺旋地点**：
 *
 *  - 入口在「额外行动」弹窗里，不挂到「特殊行动」；
 *  - 每张地图只有一个 🌀 地点，点下去只弹出一次「确定要传送到这里？」；
 *  - 动作带 `actorPlayerId`，按点的那名幸存者传送。
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

console.log('\n=== ② 只确认一次：是否传送到螺旋地点 ===');
{
  const anchor = views.indexOf('使用鏡之門戶传送到');
  const panel = anchor >= 0 ? views.slice(Math.max(0, anchor - 900), anchor + 500) : '';
  ok(anchor > 0, '（前提）找得到鏡之門戶按钮');
  ok(!/确认传送/.test(views), '没有单独的「确认传送」面板（那是多出来的一道）');
  ok(!/setMirrorPickRoom|mirrorPicking/.test(views), '不再先选地点再确认');
  ok(/runSurvivor\(/.test(panel), '点下去走行动区那一次确认（runSurvivor）');
  ok(/useMirrorPortal/.test(panel) && /toRoomId: rid/.test(panel), '确认的就是传到这个螺旋地点');
  ok(/actorPlayerId: p\.id/.test(panel),
    '**带上 `actorPlayerId`**（额外行动按每个人列按钮，要认人）');
}

console.log('\n=== ③ 入口按这名幸存者自己的遗物判 ===');
{
  ok(/relic_mirror/.test(views), '看的是这名幸存者背包里的鏡之門戶');
  ok(!/mirrorPicking && state\.canUseMirrorPortal/.test(views),
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

console.log(`\n鏡之門戶（额外行动，只确认一次）：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
