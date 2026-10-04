/**
 * 验证【（甲）撤离：先选人，再撤离】在 solo 与 1对3 两种模式下都能让**每个人**撤离。
 *
 * 针对用户报的：「一次遭遇中只有第一个人可以移动，其他人都不行」。
 *
 * 跑法：node scripts/tests/flee-second-person-repro.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot, startEncounter,
  activePlayerId, isControllerActive,
} from '../../server/dist/game/engine.js';

const content = loadContent();

/** 1对3：马尔科(s1)、索菲亚(s2)、威廉(s3) 各一名操控者 */
function mkMulti() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'multi';
  const m = {
    h: st.players.h,
    s1: createPlayer('s1', 'P1', 's1'),
    s2: createPlayer('s2', 'P2', 's2'),
    s3: createPlayer('s3', 'P3', 's3'),
  };
  m.h.faction = 'killer';
  m.h.characterId = 'killer3';
  m.s1.faction = 'survivor';
  m.s1.characterId = 'survivor3';
  m.s2.faction = 'survivor';
  m.s2.characterId = 'survivor4';
  m.s3.faction = 'survivor';
  m.s3.characterId = 'survivor5';
  for (const p of Object.values(m)) p.ready = true;
  st.players = m;
  st.hostId = 'h';
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

/** solo：一个人操控杀手 + 三个幸存者 */
function mkSolo() {
  const st = createLobby('T', 'h', 'H', content, 'cabin');
  st.mode = 'solo';
  st.soloKillerCharacterId = 'killer3';
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players.h.ready = true;
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  return st;
}

/** 三个幸存者同处一室，马尔科挨打并挡住 → 遭遇结束 → 进入撤离（等选人） */
function toFlee(st) {
  const k = st.players[st.killerId];
  const ss = Object.values(st.players).filter((p) => p.faction === 'survivor');
  for (const s of ss) s.roomId = k.roomId;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  startEncounter(st, k.roomId);
  const marco = ss.find((p) => p.characterId === 'survivor3');
  handleAction(st, marco.controllerId, { type: 'pickEncounterTarget', targetPlayerId: marco.id }, content);
  handleAction(st, k.controllerId, { type: 'playEncounterAttack', cardId: null }, content);
  const saved = st.killerPower;
  st.killerPower = 0;
  handleAction(st, marco.controllerId, { type: 'playEncounterDefense', cardId: null, itemId: null }, content);
  st.killerPower = saved;
  return { k, marco };
}

const tryIt = (st, who, action) => {
  try { handleAction(st, who.controllerId, action, content); return null; }
  catch (e) { return e.message; }
};

let problems = 0;

for (const mode of ['multi', 'solo']) {
  console.log(`\n══════════════════ 模式 ${mode} ══════════════════`);
  const st = mode === 'multi' ? mkMulti() : mkSolo();
  const { k } = toFlee(st);
  const nameOf = (id) => st.players[id]?.name ?? id;
  const socket = st.hostId;

  console.log(`  撤离步骤：step=${st.encounter?.step} target=${st.encounter?.targetId ?? '（等选人）'}`);

  let round = 0;
  while (st.encounter?.step === 'flee' && round < 6) {
    round += 1;
    /** 名单从快照读 —— 这正是客户端画"谁来撤离"按钮用的那份 */
    const snap0 = buildSnapshot(st, socket);
    const ready = snap0.encounter?.fleeReadyIds ?? [];
    const pickId = ready[0];
    const picked = st.players[pickId];
    if (!picked) {
      console.log('  ⚠ 名单为空但还没结束，可能卡住了');
      problems += 1;
      break;
    }
    console.log(`\n  第 ${round} 个：名单=[${ready.map(nameOf).join('、')}] → 点「${picked.name}」`);
    const pickErr = tryIt(st, { controllerId: picked.controllerId }, {
      type: 'pickFleeSurvivor', targetPlayerId: pickId,
    });
    console.log(`    选人 → ${pickErr ?? 'OK'}`);

    const snap = buildSnapshot(st, picked.controllerId);
    console.log(`    ${picked.name} 的快照：you=${snap.you.name} legalMoves=${JSON.stringify(snap.legalMoves)}`);

    /**
     * 没被选中的人此刻应该点不到格子（否则又会误点成普通移动）。
     *
     * ⚠ 单人热座例外：那里多个幸存者由**同一个操控者**操作，
     * `state.you` 解析成"待撤离名单里的第一个"（= 已被选中的那个），
     * 所以按"别人的操控者"查快照会看到同一份 legalMoves。
     * 这不影响操作 —— 客户端的 `fleePick` 已经要求 `fleeTargetId === you.id`。
     */
    const sharedController = mode === 'solo';
    for (const o of Object.values(st.players).filter((x) => x.faction === 'survivor' && x.id !== pickId)) {
      if (sharedController && o.controllerId === picked.controllerId) continue;
      const os = buildSnapshot(st, o.controllerId);
      if (os.legalMoves.length > 0) {
        console.log(`    ⚠ ${o.name}（没被选中）居然有可点格子：${JSON.stringify(os.legalMoves)}`);
        problems += 1;
      }
    }

    const dest = snap.legalMoves[0] ?? null;
    const goErr = tryIt(st, picked, { type: 'encounterFlee', moveToRoomId: dest });
    console.log(`    撤离到 ${dest} → ${goErr ?? 'OK'}`);
    if (goErr) problems += 1;
    const after = buildSnapshot(st, socket);
    console.log(`    之后：step=${st.encounter?.step ?? '（遭遇结束）'} ` +
      `待撤离=[${(after.encounter?.fleeReadyIds ?? []).map(nameOf).join('、')}] ` +
      `activePlayerId=${st.players[activePlayerId(st)]?.name ?? 'null'} ` +
      `isControllerActive(host)=${isControllerActive(st, socket)}`);
  }

  console.log(`  结束：encounter=${st.encounter ? '还在' : 'null'} phase=${st.phase}`);
  if (st.encounter) {
    console.log('  ⚠ 撤离没走完（卡住了）');
    problems += 1;
  }
  void k;
}

console.log(`\n结论：${problems === 0 ? '两种模式下每个人都能依次撤离，没有卡住' : `发现 ${problems} 个问题`}`);
process.exit(problems === 0 ? 0 : 1);
