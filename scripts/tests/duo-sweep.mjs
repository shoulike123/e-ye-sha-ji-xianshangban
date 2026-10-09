/**
 * 1对1 **批量扫描**：9 名杀手 × 5 张地图，每局都让它跑到分出胜负。
 *
 * 单跑一局（`duo-playthrough.mjs`，屠夫+小屋）是走通的，
 * 但每个杀手都有自己的专属机制（核心标记、僵尸、雕像、陷阱…），
 * 每张地图也有各自的特殊地点。这里把它们**两两组合**都跑一遍，
 * 看有没有哪个组合会卡住 —— 那是单局看不出来的。
 *
 * ⚠ 只读：不改游戏代码，也不直接改 state，只用 `handleAction` 推进。
 *   （驱动器与 `duo-playthrough.mjs` 同源。）
 *
 * ⚠ **现在是"必须全绿"的测试**：45 个组合要**全部走到 `gameOver`**，
 * 有一个没走完就退出码 1。跑某个组合时想看细节可以只跑它：
 *   `$env:SWEEP_ONLY='killer9'` / `$env:SWEEP_ONLY='killer3,crypt'`
 *
 * 跑法：node scripts/tests/duo-sweep.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, handleAction, buildSnapshot, activePlayerId,
} from '../../server/dist/game/engine.js';

const content = loadContent();
/**
 * ⚠ 只想看某几个组合时用这个（诊断用）：
 *   `$env:SWEEP_ONLY='killer9,crypt'` → 杀手只跑 killer9、地图只跑 crypt。
 * 不设就是全跑（9 × 5 = 45）。
 */
const ONLY = (process.env.SWEEP_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const ALL_KILLERS = ['killer1', 'killer2', 'killer3', 'killer4', 'killer5', 'killer6', 'killer7', 'killer8', 'killer9'];
const ALL_MAPS = ['cabin', 'mansion', 'castle', 'laboratory', 'crypt'];
const KILLERS = ONLY.some((x) => ALL_KILLERS.includes(x))
  ? ALL_KILLERS.filter((k) => ONLY.includes(k)) : ALL_KILLERS;
const MAPS = ONLY.some((x) => ALL_MAPS.includes(x))
  ? ALL_MAPS.filter((m) => ONLY.includes(m)) : ALL_MAPS;

function newDuo(mapId, killerId) {
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

function actorOf(st) {
  const ap = activePlayerId(st);
  if (ap && st.players[ap]) return { pieceId: ap, socketId: st.players[ap].controllerId ?? ap };
  return { pieceId: st.killerId ?? 'h', socketId: 'h' };
}

/**
 * **封堵时该点哪一格** —— 必须从 `pendingBlockadeRoom` 算，不能读 `snap.legalMoves`。
 *
 * 口径和客户端 `GameViews.tsx:1663-1701` 的 `blockadeTargetRooms` 完全一致：
 * 只有**白门**（没标 `pathType` 或 `pathType === 'door'`）能封，
 * 已封的、机关大门上的都不能封。
 *
 * ⚠ 为什么不能用 `legalMoves`：那一支是 `legalBlockadeRooms(state, activeId)`
 * —— **按杀手自己所在地点**算的。而「枝條生長」可以让杀手在**任意带核心标记的
 * 地点**封门（`pendingBlockadeRoom` 记的就是那个地点，`engine.ts:8041` 用它校验）。
 * 两者不一致时驱动器会去点杀手自己地点的门 → `placeBlockade` 找不到那扇门，
 * **只写一条战报、返回 false、不抛错** → 驱动器以为成功，4000 步原地打转
 * （killer8 卡在 `killerMain` round=10 就是这个）。
 */
function blockadeDoorRooms(st) {
  const from = st.pendingBlockadeRoom ?? st.players[st.killerId]?.roomId;
  if (!from) return [];
  const blocked = new Set(st.blockades ?? []);
  const out = [];
  for (const e of st.map.edges ?? []) {
    const isDoor = !e.pathType || e.pathType === 'door';
    if (!isDoor) continue;
    let other = null;
    if (e.from === from) other = e.to;
    else if ((e.bidirectional ?? true) && e.to === from) other = e.from;
    if (!other) continue;
    const key = from < other ? `${from}|${other}` : `${other}|${from}`;
    if (blocked.has(key)) continue;
    /** 机关大门上也不能封（用户口径：机关大门和封堵不能共存） */
    if (st.leverGateDoorId === key) continue;
    out.push(other);
  }
  return out;
}

function candidates(st, snap, piece) {
  const list = [];
  const push = (a) => list.push(a);
  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);

  /**
   * ⚠ **开局设置阶段**（顺序固定：雕像 → 陷阱 → 十字弩，见 `engine.ts:1859`）。
   * 这几个 phase 里上面那些常规动作**全都会被拒** —— 不补的话第 1 步就卡，
   * 之前扫描里 `trapSetup` / `statueSetup` / `crossbowSetup` 卡在"1 步"就是这个原因。
   */
  if (st.phase === 'statueSetup') {
    /** ⚠ 先试"确认"：选过了就该确认，不然每次都重新选、永远走不下去 */
    push({ type: 'confirmMainStatue' });
    for (const p of Object.values(st.players)) {
      if (p.statueIndex != null) push({ type: 'chooseMainStatue', statueId: p.id });
    }
  }
  if (st.phase === 'trapSetup') {
    push({ type: 'confirmTrapPlacement' });     // 布够了就直接确认
    /**
     * ⚠ **"放陷阱"必须排在"选陷阱种类"前面。**
     *
     * `placeHunterTrap(state, roomId)` 的参数其实是**地点 id**（动作字段名叫 tokenId）；
     * 种类选过一次就留在 `pendingTrapPlacement.kind` 里 —— 所以第一轮靠
     * `pickTrapKind` 选中，之后每轮都该直接"放"。
     * 原来把 `pickTrapKind` 排在前面：它**每次都能成功**（重选种类不报错），
     * 于是永远走不到"放"，5 张地图全卡在 trapSetup 第 1 步。
     */
    /**
     * ⚠ **只试"还没放过"的地点**：`placeHunterTrap` 对**已经放过的地方是"取消"**
     * （也算成功），盲目从第一个地点开始试会变成 放 → 取消 → 放 → 取消 的无限循环，
     * 跑 4000 步也走不出 `trapSetup`。
     * 另外开局布置**只能放常规搜索位/常规修理位**，其余地点引擎会拒（不影响正确性）。
     */
    const placedRooms = new Set(Object.keys(st.hunterTraps ?? {}));
    for (const r of st.map.rooms) {
      if (!placedRooms.has(r.id)) push({ type: 'placeHunterTrap', tokenId: r.id });
    }
    for (const t of st.map.tokens ?? []) {
      if (t.kind === 'hunterTrap' && !placedRooms.has(t.id)) {
        push({ type: 'placeHunterTrap', tokenId: t.id });
      }
    }
    for (const kind of ['bear', 'bone', 'net']) push({ type: 'pickTrapKind', kind });
    push({ type: 'confirmTrapPlacement' });
  }
  if (st.phase === 'crossbowSetup') {
    for (const p of survivors) push({ type: 'pickCrossbowHolder', holderId: p.id });
  }

  /**
   * ⚠ **分步移动**：移动是"先选范围 → 一段段点 → 再收尾"，
   * 中途会挂 `pendingPathDraft` / `pendingMoveRange`。
   *
   * ⚠ 选点**必须排除草稿里已经有的格子**：快照给的可点范围里
   * **含着路径末端本身**（再点末端 = 取消那一步，`engine.ts:7974`），
   * 而草稿里那些格子也都在候选里。照着候选从头点就会
   * `点末端（取消）→ 点末端（追加）→ 点末端（取消）…` 原地打转
   * （谋杀者打「尾随」挂出 `pendingPathDraft` 后卡在 killerMain 就是这个）。
   */
  if (st.pendingPathDraft || st.pendingMoveRange != null) {
    const draft = st.pendingPathDraft;
    /** 已经走过一步了 → 先试"收尾"（`min` 不允许时它自己会报错，再落到下面选点） */
    if ((draft?.rooms?.length ?? 0) > 1) push({ type: 'finishPendingMove' });
    const inDraft = new Set(draft?.rooms ?? []);
    for (const to of (snap?.legalMoves ?? []).slice(0, 8)) {
      if (inDraft.has(to)) continue;
      push({ type: 'move', toRoomId: to });
    }
    push({ type: 'finishPendingMove' });
  }

  /**
   * ⚠ **有一张牌挂在半路时**，才提这些"选目标 / 选地点"的动作。
   *
   * 现象：killer3 / killer7 / killer8 / killer9 都会卡在
   * `请先完成当前牌的选择` —— 牌打出去了，但结算要选地点/选人（扼杀者的
   * 枝條生長要选封堵地点、傳送聚合要选传送目标、女王的屍群來了要选僵尸…），
   * 驱动器不提供这些动作就永远收不了尾。
   *
   * 用 `currentKillerCardId || deferredPlayedCard` 当守卫：平时不提，
   * 免得每步白试几百次把扫描拖垮。
   */
  /**
   * ⚠ 守卫放宽了：不只是"牌挂在半路"，**任何杀手待办**都要放这批动作进来
   * （以前只看 `currentKillerCardId`，谋杀者的感知/追踪、雕像选步数那些进不来）。
   */
  const killerBusy = Boolean(
    st.currentKillerCardId || st.deferredPlayedCard || st.pendingCardSpeed ||
    st.pendingSenseRoom != null || st.killerSenseRoomActive || st.pendingTrackerPick ||
    st.pendingStatueStepId || st.pendingQueenMove || st.pendingCorePick ||
    (st.pendingZombieHordeFrom?.length ?? 0) > 0 ||
    /**
     * ⚠ 进化 4 级那两项要判 **`!= null`，不能判长度** ——
     * 刚挂出来时是**空数组**（一个地点都还没选），判长度的话整批
     * "选地点 / 确认"的动作根本不会进候选，驱动器就只会反复按
     * `ackEvolution`，那条路会**跳过挂选择直接结算** ——
     * 丧尸不生成、`pendingQueenSpawnRooms` 永远留着 `[]`，
     * 收尾被 `hasEvolutionChoicePending` 一直挡住（killer8/9 卡在
     * `upkeep` round=9 就是这个）。
     */
    st.pendingStranglerCoreRooms != null ||
    st.pendingQueenSpawnRooms != null ||
    st.pendingZombieSearch,
  );
  if (killerBusy) {
    const roomIds = st.map.rooms.map((r) => r.id);
    const cores = st.coreMarkers ?? [];
    const zombies = (st.zombies ?? []).map((z) => z.id);
    const statues = Object.values(st.players)
      .filter((p) => p.statueIndex != null).map((p) => p.id);
    for (const r of cores) {
      push({ type: 'blockadeAtCore', roomId: r });
      push({ type: 'teleportToCore', roomId: r });
      push({ type: 'moveCoreMarker', roomId: r });
    }
    for (const r of roomIds) {
      push({ type: 'placeCoreMarker', roomId: r });
      push({ type: 'sprayAcid', roomId: r });
      push({ type: 'pickZombieHorde', roomId: r });
      /**
       * ⚠ **已经选过的地点不能再点** —— 进化 4 级那两项是"选择要确认"：
       * 再点同一格 = **取消**那一格（用户口径），而"取消"也算成功。
       * 不过滤的话驱动器就会 `点 R1（选中）→ 点 R1（取消）→ 点 R1（选中）…`
       * 永远在同一个地点上横跳，4000 步也走不到"确认"
       * （killer8 / killer9 卡在 `upkeep` round=9 就是这个，不是游戏卡死）。
       */
      if (!(st.pendingQueenSpawnRooms ?? []).includes(r)) push({ type: 'pickQueenSpawnRoom', roomId: r });
      if (!(st.pendingStranglerCoreRooms ?? []).includes(r)) push({ type: 'pickStranglerCoreRoom', roomId: r });
      push({ type: 'pickPassageRoom', roomId: r });
      push({ type: 'pickSummonSealRoom', roomId: r });
    }
    push({ type: 'removeCoreMarker' });
    for (const z of zombies) {
      push({ type: 'pickZombieSearch', zombieId: z });
      push({ type: 'pickZombieSacrifice', zombieId: z });
      push({ type: 'confirmCrossbow', zombieIds: [z] });
    }
    push({ type: 'confirmQueenMove', cancel: true });
    /**
     * ⚠ **进化 4 级的"选 2 个地点"要点「确认」才生效**（用户口径：
     * 「女王和扼杀者是选完两个后才确认」）。
     * 跑完那一批 `pickXXXRoom` 之后紧跟一句确认 —— 没有它，选满 2 个
     * 也只是挂着，回合永远收不了尾（覆盖会掉）。
     */
    push({ type: 'confirmEvoRooms' });
    push({ type: 'useCrossbow' });
    for (const x of statues) {
      push({ type: 'pickStatueStep', statueId: x });
      push({ type: 'haltStatue', statueId: x });
      push({ type: 'guessMainStatue', statueId: x });
    }
    push({ type: 'skipStatueRallySwitch' });
    push({ type: 'confirmPassagePick' });
    push({ type: 'confirmSense' });
    for (const p of survivors) {
      push({ type: 'pickTrackerTarget', targetPlayerId: p.id });
      push({ type: 'chooseLurkTarget', targetPlayerId: p.id });
      push({ type: 'lootFrom', fromPlayerId: p.id });
    }
    for (const c of ['R', 'B', 'G']) push({ type: 'chooseSenseColor', color: c });
    for (let i = 0; i < 4; i += 1) push({ type: 'chooseEffectOption', optionIndex: i });
    for (let i = 0; i < 6; i += 1) push({ type: 'chooseMovePath', pathIndex: i });
    for (const t of st.map.tokens ?? []) {
      if (t.kind === 'treasureChest' || t.kind === 'hunterTrap') {
        push({ type: 'openChest', chestId: t.id });
        push({ type: 'placeHunterTrap', tokenId: t.id });
      }
    }
    push({ type: 'drawRelic' });
    push({ type: 'useMechanicalKnack' });
    push({ type: 'useLuckyCoin' });
    push({ type: 'useEncourage' });
    push({ type: 'collapseMove', toRoomId: null });
  }

  /**
   * ⚠ **「任选门封堵」作业（谋杀者 4 级放 4 个封堵 / 特性 13、18）**：
   * 是"点两个相邻地点 → 在行动区确认"三步，而且——
   *
   *  1. `roomsForAnyDoorPick` 返回的候选里**含着已经点过的第一格**
   *     （再点同一格 = 取消，`evolution.ts:1063`）。驱动器要是照着候选
   *     从头点，就会 `点 R1（选中）→ 点 R1（取消）→ 点 R1（选中）…`
   *     原地打转 4000 步（killer3 卡在 `killerMain` / `upkeep` 就是这个）。
   *  2. 两格都点完之后**必须发 `confirmEvoBlockade`** 才真的封上 ——
   *     驱动器以前压根没这个动作。
   *
   * ⚠ **必须排在上面那个通用 `move` 循环前面**：通用循环会照着
   * `legalMoves` 从头点，一旦它先命中"已经点过的那一格"，就变成取消 → 死循环。
   */
  const doorJob = st.pendingBlockadeJob;
  const doorPicked = new Set(
    doorJob?.kind === 'anyDoors'
      ? [doorJob.firstRoomId, doorJob.secondRoomId].filter(Boolean)
      : [],
  );
  if (doorJob && doorJob.kind === 'anyDoors' && doorJob.removeLeft <= 0) {
    if (doorJob.firstRoomId && doorJob.secondRoomId) push({ type: 'confirmEvoBlockade' });
    for (const r of (snap?.legalMoves ?? [])) {
      if (doorPicked.has(r)) continue;
      push({ type: 'move', toRoomId: r });
    }
  }

  /**
   * ⚠ **"点地图"的操作无条件加**：封堵选门、选感知地点、选核心标记地点…
   * 走的都是 `move`，而快照的 `legalMoves` 已经算好了"当前该点什么"。
   *
   * 以前只在 `killerMain` 分支里加 —— 于是**谋杀者/扼杀者 4 级的
   * "任选门封堵"作业**（`pendingBlockadeJob`，在 `upkeep` 阶段收尾）点不到门，
   * 卡在 round=9 的 upkeep 上。
   *
   * ⚠ 但它是**兜底**：要排除"已经点过的那几格"（草稿路径 / 任选门封堵的两格），
   * 否则点到"已选中的格子"就是取消，来回横跳永远走不出去。
   */
  const draftRooms = new Set(st.pendingPathDraft?.rooms ?? []);
  for (const to of (snap?.legalMoves ?? []).slice(0, 8)) {
    if (draftRooms.has(to) || doorPicked.has(to)) continue;
    push({ type: 'move', toRoomId: to });
  }

  /**
   * ⚠ **封堵点门**：这种"点了没反应"的动作一旦被别的候选抢先，
   * 就会一直卡在"效果还挂着"。见 `blockadeDoorRooms` 的注释。
   */
  if (st.pendingBlockade) {
    for (const to of blockadeDoorRooms(st)) push({ type: 'move', toRoomId: to });
  }

  if (st.pendingEvolutionAck) push({ type: 'ackEvolution' });
  for (const c of st.pendingEvolutionCardPick ?? []) push({ type: 'pickEvolutionCard', cardId: c?.id ?? c });
  /** 【乔治「思维敏捷」】挑笔记：`noteId: null` = 不拿（一定能过） */
  if (st.pendingGeorgeNote) push({ type: 'chooseGeorgeNote', noteId: null });
  for (const c of st.pendingUnlockChoice ?? []) push({ type: 'pickUnlockChoice', cardId: c?.id ?? c });
  if (st.pendingKillerDiscards > 0) {
    for (const c of st.killers?.[st.killerId]?.hand ?? []) push({ type: 'discardKillerCard', cardId: c });
  }
  if (st.pendingOptionalEffect) {
    push({ type: 'resolveOptionalEffect', use: true });
    push({ type: 'resolveOptionalEffect', use: false });
  }
  if (st.pendingAmulet) {
    push({ type: 'confirmAmulet', use: true });
    push({ type: 'confirmAmulet', use: false });
  }
  if (st.pendingResilience) {
    push({ type: 'confirmResilience', use: true });
    push({ type: 'confirmResilience', use: false });
  }
  for (const c of st.pendingSixthSense ?? []) push({ type: 'resolveSixthSense', cardId: c?.id ?? c });
  if (st.pendingReturnToDeckTop) {
    push({ type: 'resolveDeckTop', toDeckTop: true });
    push({ type: 'resolveDeckTop', toDeckTop: false });
  }
  if (st.pendingTrade) {
    push({ type: 'respondTrade', accept: true });
    push({ type: 'respondTrade', accept: false });
  }
  if ((st.pendingPathDraft ?? []).length) push({ type: 'finishPendingMove' });
  if (st.pendingItemDiscard) {
    const owner = st.players[st.pendingItemDiscard.playerId];
    for (const itemId of Object.keys(owner?.items ?? {})) push({ type: 'discardItem', itemId });
  }

  if (st.phase === 'discovery') {
    if (st.pendingDiscoveryPick) for (const p of survivors) push({ type: 'pickSurvivorTurn', playerId: p.id });
    for (const c of st.discoveryOptions ?? []) push({ type: 'chooseDiscovery', cardId: c?.id ?? c });
    push({ type: 'acknowledgeDiscovery' });
  }

  if (st.encounter) {
    push({ type: 'resolveEncounterDice' });
    for (const p of survivors) push({ type: 'pickEncounterTarget', targetPlayerId: p.id });
    push({ type: 'playEncounterAttack', cardId: null, boost: false });
    /**
     * ⚠ **防御这一步**（`encounter.step === 'defend'`）。
     *
     * 驱动器以前**根本没有这个动作** —— 遭遇一走到"轮到谁防御、用不用物品"
     * 就没有任何候选能成功，直接卡死（mansion + killer3 第 69 步那次）。
     * 不带物品先试（最省），再按快照给的可选防御物品逐个试。
     */
    push({ type: 'playEncounterDefense', cardId: null, itemId: null });
    for (const itemId of (snap?.defenseItemChoices ?? [])) {
      push({ type: 'playEncounterDefense', cardId: null, itemId });
    }
    /**
     * ⚠ **撤离：`encounterFlee` 必须排在 `pickFleeSurvivor` 前面。**
     *
     * 点名单那个动作**重复点同一个人也算成功**（只是把 `targetId` 重记一遍），
     * 排在前面就会「点名单 → 点名单 → …」永远走不到"真的撤离"，
     * 4000 步原地打转（`mansion + killer3` 那次就是这样红的）。
     * 还没人选中时 `encounterFlee` 会报"请先在名单里选中自己"，
     * 自然落到下面点名单那几支。
     *
     * `moveToRoomId: null` = 留在原地（也是合法选择）。
     */
    push({ type: 'encounterFlee', moveToRoomId: null });
    for (const to of (snap?.legalMoves ?? []).slice(0, 4)) {
      push({ type: 'encounterFlee', moveToRoomId: to });
    }
    for (const p of survivors) push({ type: 'pickFleeSurvivor', targetPlayerId: p.id });
  }

  if (st.phase === 'noiseReport') push({ type: 'acknowledgeNoise' });

  if (st.phase === 'survivorMain') {
    if (st.pendingSurvivorPick) {
      for (const p of survivors) push({ type: 'pickSurvivorTurn', playerId: p.id });
      for (const p of survivors) push({ type: 'pickMoveSurvivor', targetPlayerId: p.id });
    }
    push({ type: 'search' });
    push({ type: 'repair' });
    for (const to of (snap?.legalMoves ?? []).slice(0, 4)) push({ type: 'move', toRoomId: to });
    push({ type: 'georgeDraw', actorPlayerId: piece });
    push({ type: 'useSuitcase', actorPlayerId: piece });
    push({ type: 'useMirrorPortal' });
    push({ type: 'useInsightOrb' });
    for (const itemId of Object.keys(st.players[piece]?.items ?? {})) {
      push({ type: 'useItem', itemId, actorPlayerId: piece });
    }
    push({ type: 'clearFear' });
    push({ type: 'finishSurvivorPhase' });
  }

  if (st.phase === 'killerMain') {
    push({ type: 'advanceKillerStep' });
    push({ type: 'chooseKillerMain', choice: 'actions' });
    for (const cardId of (st.killers?.[st.killerId]?.hand ?? []).slice(0, 5)) {
      push({ type: 'playKillerCard', cardId, payCardIds: [] });
    }
    push({ type: 'search' });
    for (const to of (snap?.legalMoves ?? []).slice(0, 6)) push({ type: 'move', toRoomId: to });
    push({ type: 'endTurn' });
  }

  push({ type: 'endTurn' });
  return list;
}

const attempt = (st, action, sid) => {
  try { handleAction(st, sid, action, content); return null; }
  catch (e) { return e.message; }
};

function playOne(mapId, killerId, maxSteps = 4000) {
  const st = newDuo(mapId, killerId);
  let steps = 0;
  const stuck = [];
  /**
   * ⚠ **最后这些"成功"的动作**。
   *
   * "跑到步数上限"和"卡住"是两回事：卡住是没有任何候选能成功；
   * 上限则是**一直在做合法动作、但绕不出去**（多半是驱动器在
   * "选地点 → 确认 → 又选地点"这种环里打转）。只报"4000 步没结束"
   * 看不出它在转什么，所以留一个最近动作的环形缓冲。
   */
  const recent = [];
  const remember = (a, sid) => {
    recent.push(`${steps}. [${st.phase}] ${JSON.stringify(a)}@${sid}`);
    if (recent.length > 40) recent.shift();
  };
  /** "当时非默认值"的字段快照（卡住和跑满上限都用得上） */
  const dumpFields = () => {
    const fields = [];
    const SKIP = /deck|logs|cardById|^map$|characters|rooms|edges|tokens|zones|tiles|images$|players$|killers$/i;
    for (const [k, v] of Object.entries(st)) {
      if (SKIP.test(k)) continue;
      if (v === null || v === undefined || v === false || v === 0 || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length) fields.push(`${k}=[${v.length}] ${JSON.stringify(v).slice(0, 80)}`);
        continue;
      }
      if (typeof v === 'object') {
        const keys = Object.keys(v);
        if (!keys.length) continue;
        fields.push(keys.length > 10 ? `${k}={${keys.length} 项}` : `${k}=${JSON.stringify(v).slice(0, 80)}`);
        continue;
      }
      fields.push(`${k}=${String(v).slice(0, 80)}`);
    }
    return fields;
  };

  while (st.phase !== 'gameOver' && steps < maxSteps) {
    steps += 1;
    const who = actorOf(st);
    const snap = buildSnapshot(st, who.socketId);
    const cands = candidates(st, snap, who.pieceId);
    let done = false;
    const rejects = [];
    for (const a of cands) {
      /**
       * ⚠ **该谁发要看阶段**，不能一刀切：
       *   · 雕像选主雕像 / 女猎手布陷阱 / 杀手回合 / 响声 / 收尾 → **杀手**
       *   · 女王开局指定十字弩持有者 / 幸存者主回合 / 发现 → **幸存者**
       *   · 其他（遭遇之类）两边都可能 → 都试
       * 之前 `trapSetup` 发给了幸存者，报"仅杀手可放置陷阱"，第 1 步就卡住。
       */
      const phaseSockets =
        (st.phase === 'statueSetup' || st.phase === 'trapSetup' ||
          st.phase === 'killerMain' || st.phase === 'noiseReport' || st.phase === 'upkeep') ? ['h']
          : (st.phase === 'crossbowSetup' || st.phase === 'survivorMain' || st.phase === 'discovery') ? ['s']
            : ['s', 'h'];
      /**
       * ⚠ **有些待办"该谁答"和阶段无关**：坍塌伤害问出来的护符 / 坚毅、
       * 背包超额弃装、第六感选牌…… 记账的人是**幸存者**，可这时阶段可能是
       * `upkeep`（杀手收尾）—— 上面那张表就只发 `h`，于是
       * `confirmAmulet` 一直被拒「当前不是你选择护符」，整局卡死
       * （crypt + killer3 第 209 步卡在 upkeep 就是这个）。
       *
       * 所以：谁的待办就把**他的操控者**排在最前面，再按阶段补。
       */
      const ownerSockets = [
        st.pendingAmulet?.playerId,
        st.pendingResilience?.playerId,
        st.pendingSixthSense?.playerId,
        st.pendingItemDiscard?.playerId,
        /** 坍塌收尾"轮到谁走一步"：lister 是他，就得他发 `collapseMove` */
        st.pendingCollapseMoves?.currentId,
      ]
        .map((id) => (id ? st.players[id]?.controllerId : null))
        .filter(Boolean);
      for (const sid of [...new Set([...ownerSockets, ...phaseSockets])]) {
        const err = attempt(st, a, sid);
        if (!err) { done = true; remember(a, sid); break; }
        rejects.push(`${JSON.stringify(a)}@${sid}: ${err}`);
      }
      if (done) break;
    }
    if (!done) {
      stuck.push({
        step: steps, phase: st.phase, round: st.round,
        rejects: [...new Set(rejects)].slice(0, 6), fields: dumpFields(), recent: [...recent],
      });
      break;
    }
  }
  return { st, steps, stuck, recent, fields: dumpFields() };
}

console.log('=== 1对1 批量扫描：9 名杀手 × 5 张地图 ===\n');
const rows = [];
for (const map of MAPS) {
  for (const k of KILLERS) {
    const r = playOne(map, k);
    const finished = r.st.phase === 'gameOver';
    rows.push({ map, k, steps: r.steps, round: r.st.round, finished, winner: r.st.winner, stuck: r.stuck, phase: r.st.phase, recent: r.recent, fields: r.fields });
    const mark = finished ? '走完' : '**卡住**';
    console.log(`  ${map.padEnd(11)} ${k.padEnd(8)} ${mark.padEnd(10)} ` +
      `${String(r.steps).padStart(5)} 步  round=${String(r.st.round).padStart(3)}  ` +
      `${finished ? `winner=${r.st.winner}` : `phase=${r.st.phase}`}`);
  }
}

const bad = rows.filter((r) => !r.finished);
console.log(`\n════════ 汇总 ════════`);
console.log(`跑了 ${rows.length} 局：走完 ${rows.length - bad.length}，卡住 ${bad.length}`);
for (const b of bad) {
  if (!b.stuck.length) {
    console.log(`\n  ⚠ ${b.map} + ${b.k}：跑了 ${b.steps} 步没结束（到步数上限，不是卡死）` +
      ` phase=${b.phase} round=${b.round}`);
    console.log('       最后 20 个成功的动作（看它在这个环里转什么）：');
    for (const x of (b.recent ?? []).slice(-20)) console.log(`         ${x}`);
    if (b.fields?.length) {
      console.log('       当时的非默认字段：');
      for (const f of b.fields) console.log(`         ${f}`);
    }
    continue;
  }
  const s = b.stuck[0];
  console.log(`\n  ⚠ ${b.map} + ${b.k}：第 ${s.step} 步卡在 ${s.phase}（round=${s.round}）`);
  for (const x of s.rejects) console.log(`       ${x}`);
  if (s.fields?.length) {
    console.log('       当时非默认字段：');
    for (const f of s.fields) console.log(`         ${f}`);
  }
}
/**
 * ⚠ **这个脚本原来是"诊断工具"，现在改成真测试了。**
 *
 * 以前的 18 个卡点全是**驱动器自己的问题**（点同一格 = 取消导致来回横跳、
 * 缺 `confirmEvoBlockade` / `playEncounterDefense`、封堵点门读了错的地点…
 * 详见上面每一处的注释）。补齐之后 9×5 = 45 个组合**连续三次全部走完**，
 * 所以才敢让它红了报警：以后再出现"某个组合走不完"，
 * 大概率是真的引擎问题，值得停下来看一眼。
 *
 * 万一哪个组合又红：上面会打印它最后 20 个成功动作 + 当时的非默认字段，
 * 先看那串动作是不是又踩进了"选中 ↔ 取消"的环里。
 */
if (bad.length) {
  console.log(`\n❌ ${bad.length}/${rows.length} 个组合没走完（诊断信息见上）。`);
  process.exit(1);
}
console.log(`\n✅ ${rows.length} 个组合全部走完。`);
process.exit(0);
