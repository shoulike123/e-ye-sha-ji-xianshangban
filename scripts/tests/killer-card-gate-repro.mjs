/**
 * 复现用户报的问题③：
 * 「杀手打快速行动卡牌，选择效果期间还能选择其他快速卡牌打，
 *   不应该是这样，应该上一张执行完才能打下一张」
 *
 * 用未命名（killer7）的「红外探測」当例子：
 *   快速牌，效果带 alternatives（〔感知〕一个颜色区域 / 〔感知〕距离 1 内所有地点）
 *   → 打出后挂 `pendingEffectChoice` 等玩家二选一。
 *
 * 跑法：node scripts/tests/killer-card-gate-repro.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { hasPendingKillerChoice } from '../../server/dist/game/killerCards.js';

const content = loadContent();

function duo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer7'; // 未命名
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = content.characters
    .filter((c) => c.faction === 'survivor')
    .map((c) => c.id)
    .slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

const tryIt = (st, who, action) => {
  try { handleAction(st, who.controllerId, action, content); return 'OK'; }
  catch (e) { return e.message; }
};

const st = duo();
const k = st.players[st.killerId];
st.killerHand = ['un_infrared_1', 'un_infrared_2'];
/** 摆到杀手回合的快速阶段（`activePlayerId` 这时才是杀手） */
st.phase = 'killerMain';
st.killerTurnStep = 'fast';
st.killerMainChoice = null;
st.killerMainActionsLeft = 0;

console.log(`杀手：${k.name}  手牌：${st.killerHand.map((c) => st.cardById[c]?.name ?? c).join('、')}`);
console.log(`阶段：${st.phase} / killerTurnStep=${st.killerTurnStep}`);

/* 第 1 张：打出去 → 应该停在「选效果」 */
const r1 = tryIt(st, k, { type: 'playKillerCard', cardId: 'un_infrared_1' });
console.log(`\n① 打出第 1 张「红外探測」 → ${r1}`);
console.log(`   pendingEffectChoice = ${st.pendingEffectChoice ? '已挂起（等玩家二选一）' : 'null'}`);
console.log(`   pendingEffectQueue 长度 = ${st.pendingEffectQueue.length}`);
console.log(`   hasPendingKillerChoice() = ${hasPendingKillerChoice(st)}  ← 这是"还要不要挡住别的操作"的总闸门`);

/* 第 2 张：这时候还能打吗？ */
const r2 = tryIt(st, k, { type: 'playKillerCard', cardId: 'un_infrared_2' });
console.log(`\n② 紧接着打出第 2 张「红外探測」 → ${r2}`);

/* 顺带看一眼别的 pending 字段在闸门里没有 */
const flagged = [];
for (const field of ['pendingEffectChoice', 'pendingMoveChoices', 'pendingStatueStepId', 'pendingReturnToDeckTop']) {
  if (st[field] != null) flagged.push(`${field}=${JSON.stringify(st[field]).slice(0, 40)}`);
}
console.log(`\n   当前挂着、但答案不在闸门清单里的字段：${flagged.length ? flagged.join(' / ') : '（无）'}`);
console.log(`   快照里给客户端的：pendingEffectChoice=${buildSnapshot(st, 'h').pendingEffectChoice ? '有' : '无'}`);
