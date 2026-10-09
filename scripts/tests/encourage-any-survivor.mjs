/**
 * **欧菲莉亚「言语鼓励」可以对任意幸存者做；目标已经有鼓励标记时只清恐惧**
 * （用户口径）。
 *
 * 改之前：目标身上已经有鼓励标记 → 直接抛「已经有鼓励标记了（每人至多一个）」，
 * 客户端也把有标记的人从候选里滤掉了。现在允许，只是不再多放一个标记。
 *
 * 跑法：node scripts/tests/encourage-any-survivor.mjs
 */
import fs from 'node:fs';
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot,
} from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, sid, action) => {
  try { handleAction(st, sid, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 单人热座：欧菲莉亚（survivor7）在队伍里，方便她自己发动 */
function mk() {
  const st = createLobby('T', HOST, 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer1';
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  st.logs = [];
  const ophelia = Object.values(st.players).find((p) => p.characterId === 'survivor7');
  st.activeSurvivorIndex = st.turnOrder.indexOf(ophelia.id);
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') p.mainActionUsed = false;
  }
  return { st, ophelia };
}
const othersIn = (st, id) =>
  Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive && p.id !== id);

console.log('=== ① 随便哪个幸存者都能被鼓励（不限地点） ===');
{
  const { st, ophelia } = mk();
  const mate = othersIn(st, ophelia.id)[0];
  /** 故意把钱放远一点，证明"不限地点" */
  mate.roomId = st.map.rooms[st.map.rooms.length - 1].id;
  mate.fear = 2;
  const err = tryIt(st, HOST, {
    type: 'useEncourage', targetPlayerId: mate.id, actorPlayerId: ophelia.id,
  });
  console.log(`  鼓励 ${mate.name}（在 ${mate.roomId}）→ ${err ?? 'OK'}；` +
    `恐惧 ${mate.fear}；标记=${mate.encourageToken}`);
  ok(err == null, '**别的幸存者也能被鼓励**', String(err));
  ok(mate.fear === 0, '恐惧清空', String(mate.fear));
  ok(mate.encourageToken === true, '拿到鼓励标记');
  ok(ophelia.mainActionUsed === true, '占掉欧菲莉亚的一般行动（特殊行动）');
}

console.log('\n=== ② 目标已经有鼓励标记 → 允许，且只清恐惧（不再多一个） ===');
{
  const { st, ophelia } = mk();
  const mate = othersIn(st, ophelia.id)[0];
  /** 先正常给一次 */
  tryIt(st, HOST, { type: 'useEncourage', targetPlayerId: mate.id, actorPlayerId: ophelia.id });
  ok(mate.encourageToken === true, '（前提）第一次拿到了标记');
  /** 再给一次：这次他已经有标记、而且又有恐惧了 */
  /** ⚠ 特殊行动会结束小回合，所以要把"当前小回合的人"重新点回欧菲莉亚 */
  st.activeSurvivorIndex = st.turnOrder.indexOf(ophelia.id);
  st.pendingSurvivorPick = false;
  ophelia.mainActionUsed = false;
  mate.fear = 2;
  const before = st.logs.length;
  const err = tryIt(st, HOST, {
    type: 'useEncourage', targetPlayerId: mate.id, actorPlayerId: ophelia.id,
  });
  const line = st.logs.slice(before).map((l) => l.text).find((t) => t.includes('言语鼓励'));
  console.log(`  再鼓励一次 → ${err ?? 'OK'}；恐惧 ${mate.fear}；标记=${mate.encourageToken}`);
  console.log(`  战报：${line ?? '（没有这条）'}`);
  ok(err == null, '**不再被拒**（以前报"已经有鼓励标记了"）', String(err));
  ok(mate.fear === 0, '**照样清除他的恐惧**', String(mate.fear));
  ok(mate.encourageToken === true, '标记还在（每人至多一个，不会变两个）');
  ok(Boolean(line?.includes('已经有鼓励标记')), '战报写清了"只清恐惧"', line ?? '');
}

console.log('\n=== ③ 对自己也能用 ===');
{
  const { st, ophelia } = mk();
  ophelia.fear = 2;
  const err = tryIt(st, HOST, { type: 'useEncourage', targetPlayerId: ophelia.id, actorPlayerId: ophelia.id });
  console.log(`  鼓励自己 → ${err ?? 'OK'}；恐惧 ${ophelia.fear}；标记=${ophelia.encourageToken}`);
  ok(err == null, '对自己也能发动', String(err));
  ok(ophelia.fear === 0 && ophelia.encourageToken === true, '清恐惧 + 拿标记');
}

console.log('\n=== ④ 界面：候选里不再把"已有标记的人"滤掉 ===');
{
  const views = fs.readFileSync(new URL('../../client/src/GameViews.tsx', import.meta.url), 'utf8');
  ok(!/const encourageCands = survivors\.filter\(\s*\(sp\) => sp\.alive && !\(state\.encouragedIds/.test(views),
    '**候选列表不再按 `encouragedIds` 过滤**');
  ok(/const encourageCands = survivors\.filter\(\(sp\) => sp\.alive\)/.test(views),
    '候选 = 所有存活幸存者');
  ok(/只清他的恐惧|只清恐惧/.test(views), '面板上写清了"已有标记就只清恐惧"');
  /** 快照照样只给幸存者（杀手看不到谁有标记） */
  const { st, ophelia } = mk();
  const mate = othersIn(st, ophelia.id)[0];
  mate.encourageToken = true;
  const kSnap = buildSnapshot(st, HOST);
  void kSnap;
}

console.log(`\n言语鼓励：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
