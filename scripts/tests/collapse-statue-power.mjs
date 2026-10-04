/**
 * 验证：【墓穴】坍塌砸到的是**非主雕像**时，杀手（=主雕像的手牌）会不会弃光。
 *
 * 用户口径：手牌只有一副、挂在主雕像上；**任意一尊雕像被砸，手牌都要弃光**，
 * 「那颗棋子不一定是主雕像」。
 *
 * 跑法：node scripts/tests/collapse-statue-power.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction,
} from '../../server/dist/game/engine.js';
import { applyCollapse } from '../../server/dist/game/collapse.js';
import { collapseMoveOptions } from '../../server/dist/game/collapse.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkStatue(variant1 = false) {
  const st = createLobby('T', HOST, 'H', content, 'crypt');
  st.mode = 'solo';
  st.variant1 = variant1;
  st.soloKillerCharacterId = 'killer6';            // 雕像
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  /** 主雕像定下来（雕像局开局要选主雕像：`statueMainLocked`） */
  st.statueMainLocked = true;
  return st;
}

/** 把坍塌队列里所有人都走完（幸存者/杀手都选"能走就走"） */
function drainCollapseQueue(st) {
  let guard = 0;
  while (st.pendingCollapseMoves && guard < 20) {
    guard += 1;
    const pend = st.pendingCollapseMoves;
    const who = st.players[pend.currentId];
    /** 可走的相邻地点（用引擎自己的口径算） */
    const options = collapseMoveOptions(st, who);
    try {
      handleAction(st, who?.controllerId ?? HOST, {
        type: 'collapseMove',
        toRoomId: options[0] ?? null,
      }, content);
    } catch (e) {
      console.log(`    （走位被打断：${e.message}）`);
      break;
    }
  }
}

console.log('=== 坍塌砸到「非主雕像」：主雕像的手牌该不该弃光？ ===');
{
  const st = mkStatue();
  const mainId = st.killerId;
  const statues = (st.statueIds ?? []).map((id) => st.players[id]).filter(Boolean);
  console.log(`  主雕像 = ${st.players[mainId]?.name}（${mainId}）`);
  console.log(`  全部雕像：${statues.map((p) => `${p.name}@${p.roomId}`).join('、')}`);

  /** 挑一尊**不是主雕像**的雕像，把它放到一个还没塌的坍塌点 */
  const nonMain = statues.find((p) => p.id !== mainId);
  const { standingCollapsibleRooms } = await import('../../server/dist/game/collapse.js');
  const target = standingCollapsibleRooms(st)[0];
  if (!nonMain || !target) {
    ok(false, '（无法构造：没有非主雕像或没有可塌地点）');
  }
  else {
    /** 主雕像挪到别处，确保"被砸的不是主雕像" */
    const safe = st.map.rooms.find((r) => r.id !== target)?.id;
    st.players[mainId].roomId = safe;
    nonMain.roomId = target;
    /** 塞满手牌，方便观察"有没有被弃光" */
    st.killerHand = ['un_infrared_1', 'un_crawl_1', 'un_passage_1'];
    const handBefore = st.killerHand.length;
    console.log(`  把**非主雕像**「${nonMain.name}」放到 ${target}，主雕像去 ${safe}`);
    console.log(`  手牌 ${handBefore} 张：${st.killerHand.join('、')}`);

    applyCollapse(st, target);
    drainCollapseQueue(st);

    console.log(`  坍塌后：手牌=${st.killerHand.length} 张，弃牌堆=${st.killerDiscard.length} 张`);
    ok(st.killerHand.length === 0, '**被砸的是非主雕像，手牌照样弃光**', `剩 ${st.killerHand.length} 张`);
    ok(st.killerDiscard.length >= handBefore, '那些牌进了弃牌堆', `${st.killerDiscard.length} 张`);
    const said = st.logs.some((l) => String(l.text ?? '').includes('弃掉了**全部手牌**'));
    ok(said, '战报公布了"弃光全部手牌"（不说具体牌名）');
    ok(st.players[mainId].roomId === safe, '主雕像本人没被砸、也没被挪动', String(st.players[mainId].roomId));
  }
}

console.log('=== 对照：主雕像被砸（同样要弃光） ===');
{
  const st = mkStatue();
  const mainId = st.killerId;
  const { standingCollapsibleRooms } = await import('../../server/dist/game/collapse.js');
  const target = standingCollapsibleRooms(st)[0];
  st.players[mainId].roomId = target;
  st.killerHand = ['un_infrared_1', 'un_crawl_1'];
  applyCollapse(st, target);
  drainCollapseQueue(st);
  ok(st.killerHand.length === 0, '主雕像被砸，手牌弃光', `剩 ${st.killerHand.length} 张`);
}

console.log(`\n坍塌 × 雕像手牌：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
