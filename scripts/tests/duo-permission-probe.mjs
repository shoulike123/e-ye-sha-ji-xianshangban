/**
 * 1对1 **越权动作探测**（只读，不改任何游戏代码）。
 *
 * 由来：`duo-playthrough.mjs` 的那一局里，日志出现了两处不对劲 ——
 *   · `[survivorMain] {"type":"endTurn","by":"h"}` —— 幸存者大回合里**杀手**发 endTurn 成功了
 *   · `[survivorMain] {"type":"discardKillerCard",...,"by":"s"}` —— **幸存者替杀手弃牌**成功了
 *
 * 所以这里把"这一方不该能做的动作"挨个试一遍，看服务端到底挡不挡。
 * 每个探测**单独开一局**，互不影响。
 *
 * 跑法：node scripts/tests/duo-permission-probe.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction,
} from '../../server/dist/game/engine.js';

const content = loadContent();

function newDuo(mapId = 'cabin', killerId = 'killer1') {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = killerId;
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  startGame(st, content, 'h');
  return st;
}

const rows = [];
/**
 * 试一个动作。
 * @param setup  开局后先把局面摆成"该动作有可能被考虑"的样子（直接摆 state 只为了让闸门走到，
 *               这里摆的都不是游戏代码，只是让探测有意义）
 */
function probe(label, who, action, setup = null, expectRefuse = true) {
  const st = newDuo();
  if (setup) setup(st);
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor');
  const ctx = {
    st,
    s1: survivors[0]?.id, s2: survivors[1]?.id, s3: survivors[2]?.id,
    killer: st.killerId,
    killerHand: st.killers[st.killerId]?.hand ?? [],
    phase: st.phase,
  };
  const a = typeof action === 'function' ? action(ctx) : action;
  let err = null;
  try { handleAction(st, who, a, content); }
  catch (e) { err = e.message; }
  const accepted = err === null;
  rows.push({ label, who, action: a, accepted, err, bad: expectRefuse && accepted });
  const mark = accepted ? (expectRefuse ? '⚠ 被接受' : '被接受') : '被拒绝';
  console.log(`  ${mark}  ${label}`);
  if (accepted) console.log(`          ${JSON.stringify(a)}`);
  else console.log(`          拒绝原因：${err}`);
}

console.log('=== 幸存者大回合（phase=survivorMain，该动的是幸存者）===');
{
  const setup = (st) => {
    // 让杀手的弃牌待办挂上，才测得出"谁能替他弃"（这是引擎自己的规则，不是我们改的）
    st.pendingKillerDiscards = 1;
  };
  console.log('── 杀手在幸存者回合乱发指令 ──');
  probe('杀手发 endTurn（结束回合）', 'h', { type: 'endTurn' });
  probe('杀手替幸存者选小回合的人', 'h', (c) => ({ type: 'pickSurvivorTurn', playerId: c.s1 }));
  probe('杀手替幸存者搜索', 'h', { type: 'search' });
  probe('杀手替幸存者结束整个大回合', 'h', { type: 'finishSurvivorPhase' });
  probe('杀手替幸存者摸发现牌', 'h', (c) => ({ type: 'chooseDiscovery', cardId: 'dc_map' }));

  console.log('\n── 幸存者碰杀手的东西 ──');
  probe('幸存者替杀手确认响声', 's', { type: 'acknowledgeNoise' });
  probe('幸存者替杀手选主要行动', 's', { type: 'chooseKillerMain', choice: 'actions' });
  probe('幸存者替杀手推进回合步骤', 's', { type: 'advanceKillerStep' });
  probe('幸存者替杀手弃牌', 's', (c) => ({ type: 'discardKillerCard', cardId: c.killerHand[0] }), setup);
  probe('幸存者替杀手打牌', 's', (c) => ({ type: 'playKillerCard', cardId: c.killerHand[0], payCardIds: [] }));
  probe('幸存者发 endTurn', 's', { type: 'endTurn' });
}

console.log('\n=== 杀手回合（phase=killerMain，该动的是杀手）===');
{
  const toKillerMain = (st) => {
    st.phase = 'killerMain';
    st.killerTurnStep = 'main';
    st.killerMainChoice = 'actions';
    st.killerMainActionsLeft = 2;
  };
  console.log('── 幸存者在杀手回合乱发指令 ──');
  probe('幸存者替杀手结束回合', 's', { type: 'endTurn' }, toKillerMain);
  probe('幸存者替杀手选主要行动', 's', { type: 'chooseKillerMain', choice: 'actions' }, toKillerMain);
  probe('幸存者替杀手移动', 's', { type: 'move', toRoomId: 'B5' }, toKillerMain);
  probe('幸存者替杀手搜索', 's', { type: 'search' }, toKillerMain);

  console.log('\n── 杀手碰幸存者的东西 ──');
  /**
   * ⚠ 这一条**不是越权** —— 搜索本来就是杀手的主要行动，必须放行。
   * 以前没标 `expectRefuse = false`，所以它一直被记成"本该被拒却通过了"。
   */
  probe('杀手搜索（该合法）', 'h', { type: 'search' }, toKillerMain, false);
  probe('杀手替幸存者治疗/清恐惧', 'h', { type: 'clearFear' }, toKillerMain);
  probe('杀手替幸存者用物品', 'h', { type: 'useMirrorPortal' }, toKillerMain);
}

console.log('\n=== 大厅 / 非对局阶段 ===');
{
  const lobby = () => {
    const st = createLobby('T', 'h', 'H', content, 'cabin');
    st.mode = 'duo';
    const bs = createPlayer('s', 'S', 's');
    bs.faction = 'survivor';
    st.players = { h: st.players.h, s: bs };
    st.players.h.faction = 'killer';
    st.players.h.characterId = 'killer1';
    st.hostId = 'h';
    return st;
  };
  probe('非房主改地图', 's', { type: 'setMap', mapId: 'mansion' }, lobby);
  probe('非房主开变体1', 's', { type: 'setVariant1', on: true }, lobby);
  probe('非房主开始游戏', 's', { type: 'startGame' }, lobby);
  probe('非房主踢/改别人身份', 's', { type: 'setFaction', faction: 'killer' }, lobby);
}

const bad = rows.filter((r) => r.bad);
console.log(`\n════════ 汇总 ════════`);
console.log(`共探测 ${rows.length} 条，其中 ${bad.length} 条「本该被拒却通过了」：`);
for (const b of bad) console.log(`  ⚠ ${b.label}\n      ${JSON.stringify(b.action)}（由 ${b.who} 发出）`);
if (bad.length) {
  console.log('\n⚠ 有越权动作被接受 —— 权限校验出现回归。');
  process.exit(1);
}
console.log('\n✅ 全部正确拒绝。');
process.exit(0);
