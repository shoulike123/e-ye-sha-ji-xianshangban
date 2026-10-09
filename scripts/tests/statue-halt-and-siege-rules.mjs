/**
 * 雕像这四条（用户 2026-02 口径）：
 *
 *  ① **先执行进化效果，再洗牌**：摸牌堆见底又赶上进化时，不能先把弃牌洗回牌堆 ——
 *     否则「雕像 4 级从弃牌堆取回圍困」会先被洗走、再也拿不回来。
 *  ② **雕像 4 级取回「圍困」**：弃牌堆里**没有**才跳过；手牌满**不跳** ——
 *     照拿，然后自选弃置 1 张（用户口径 2026-02 更正）。
 *  ③ **被停滞的雕像的"一般行动"移动/搜索照常消耗行动、但执行时被跳过**
 *     （用户口径：「移动和搜索在执行时被跳过，而不是不能做」）。
 *  ④ **被停滞的雕像要在（雕像的）杀手大回合开始时向杀手说明**。
 *
 * 跑法：node scripts/tests/statue-halt-and-siege-rules.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame, handleAction, buildSnapshot, beginKillerTurn,
} from '../../server/dist/game/engine.js';
import { runUpgrade } from '../../server/dist/game/evolution.js';
import { drawKillerCards } from '../../server/dist/game/effects.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const tryIt = (st, action) => {
  try { handleAction(st, HOST, action, content); return null; }
  catch (e) { return String(e?.message ?? e); }
};

/** 雕像局（1v1 单人热座），可选指定杀手角色 */
function mk(killerId = 'killer6') {
  const st = createLobby('T', HOST, 'H', content, 'mansion');
  st.mode = 'solo';
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor6', 'survivor7', 'survivor9'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  if (st.phase === 'statueSetup') {
    const main = Object.values(st.players).find((p) => p.statueIndex === 1);
    if (main) tryIt(st, { type: 'chooseMainStatue', statueId: main.id });
    tryIt(st, { type: 'confirmMainStatue' });
  }
  return st;
}
const statues = (st) => Object.values(st.players).filter((p) => p.statueIndex != null);
const mainStatue = (st) => st.players[st.killerId];

/**
 * 升到某一级并把进化流程**真正结算完**。
 *
 * ⚠ 雕像的"转换主雕像"是**每次升级首先执行**的一步（`advanceEvolutionChoices`
 * 里那个分支不看等级），所以光点「确认新效果」是不够的 —— 还要把
 * `pendingStatueEvoSwitch` 跳掉，`settleConfirmedEvolution` 才会真的执行
 * 力量 / 取回圍困 / 补洗牌那些效果。
 */
function settleEvolution(st) {
  for (let guard = 0; guard < 8; guard += 1) {
    if (st.pendingStatueEvoSwitch) { tryIt(st, { type: 'skipStatueEvoSwitch' }); continue; }
    if (st.pendingEvolutionCardPick?.length) {
      const c = st.pendingEvolutionCardPick[0];
      tryIt(st, { type: 'pickEvolutionCard', cardId: c?.id ?? c });
      continue;
    }
    if (st.pendingUnlockChoice?.length) {
      tryIt(st, { type: 'pickUnlockChoice', cardId: st.pendingUnlockChoice[0] });
      continue;
    }
    if (st.pendingEvolutionAck) { tryIt(st, { type: 'ackEvolution' }); continue; }
    break;
  }
}

function levelUpTo(st, level) {
  st.killerLevel = level - 1;
  runUpgrade(st);
  settleEvolution(st);
}

console.log('=== ① 摸牌堆见底 + 进化：先结算进化效果，再洗牌 ===');
{
  const st = mk();
  /** 摆成"摸牌堆空了、弃牌堆里有牌（含圍困）" */
  st.killerLevel = 3;
  /**
   * ⚠ 「圍困」是**一份**牌：真实时序里它在 3 级就从锁定区入手、打出去之后在弃牌堆。
   * 所以这里要把它从锁定区拿掉，否则"锁定区 + 弃牌堆同时有"是不可能出现的局面
   * （那种局面下两条入手路径都会命中，出现两张圍困）。
   */
  st.killerLocked = (st.killerLocked ?? []).filter((id) => id !== 'statue_siege');
  st.killerDiscard = ['statue_siege', 'statue_patrol_1', 'statue_patrol_2'];
  st.killerDeck = [];
  st.killerHand = [];
  drawKillerCards(st, 3);
  console.log(`  摸完之后：手牌=${JSON.stringify(st.killerHand)}；` +
    `摸牌堆=${st.killerDeck.length}；弃牌堆=${st.killerDiscard.length}；` +
    `pendingEvolutionAck=${Boolean(st.pendingEvolutionAck)} pendingDeckRecycle=${Boolean(st.pendingDeckRecycle)}`);
  ok(Boolean(st.pendingEvolutionAck), '**触发了进化（挂了确认面板）**');
  ok(st.pendingDeckRecycle === true, '**这次先不洗牌**（等进化结算完）');
  ok(st.killerDiscard.includes('statue_siege'), '**圍困还在弃牌堆里**（没被洗走）');
  ok((st.pendingDeckDrawsLeft ?? 0) > 0, '欠的摸牌张数记下来了',
    String(st.pendingDeckDrawsLeft));
  /**
   * ⚠ **战报里要写清"这次欠几张、累计欠几张"** —— 用户问过
   * 「为什么这里进化到 4 级时摸了 5 张？」：那 5 张不是进化给的，
   * 是"被进化挡住的摸牌"攒起来的。不写明细，补摸时只看到一句「多摸的 5 张」，
   * 根本看不出这个数字怎么来的。
   */
  const owedLog = st.logs.map((l) => l.text).find((t) => t.includes('累计欠'));
  ok(Boolean(owedLog), '**战报写清了"这次欠几张、累计欠几张"**', owedLog ?? '');

  /** 确认 + 结算 → 这时才洗牌、并把欠的摸牌补上 */
  settleEvolution(st);
  console.log(`  确认之后：摸牌堆=${st.killerDeck.length}；弃牌堆=${st.killerDiscard.length}；` +
    `pendingDeckRecycle=${Boolean(st.pendingDeckRecycle)} pendingDeckDrawsLeft=${st.pendingDeckDrawsLeft ?? 0}`);
  ok(st.pendingDeckRecycle === false, '**结算完之后才补洗牌**');
  ok(st.logs.some((l) => /已洗匀/.test(l.text)), '**确实洗了牌**（弃牌堆洗回摸牌堆）',
    st.logs.filter((l) => /已洗匀/.test(l.text)).map((l) => l.text).join(' / '));
  ok((st.pendingDeckDrawsLeft ?? 0) === 0, '欠的摸牌也补完了', String(st.pendingDeckDrawsLeft ?? 0));
  console.log(`  收尾：手牌=${JSON.stringify(st.killerHand)}；摸牌堆=${st.killerDeck.length}；` +
    `弃牌堆=${st.killerDiscard.length}`);
  ok(st.killerHand.filter((id) => id === 'statue_siege').length === 1,
    '**手牌里只有一张「圍困」**（"从弃牌堆取回"与"锁定区按等级入手"不会各给一张）',
    String(st.killerHand.filter((id) => id === 'statue_siege').length));
}

console.log('\n=== ② 雕像 4 级取回「圍困」：弃牌堆没有才跳过；手牌满 → 先弃 1 张再拿 ===');
{
  /**
   * (a) 弃牌堆里有、手牌没满 → 取回。
   *
   * ⚠ 要走**真实时序**：先升到 3 级（那时「圍困」按 `unlockLevel: 3`
   * 自动从锁定区入手），再把它"打出去"（挪进弃牌堆），然后升 4 级才会
   * 用上"从弃牌堆取回"这条规则。
   */
  const st = mk();
  levelUpTo(st, 3);
  ok(st.killerHand.includes('statue_siege'), '（前提）3 级时「圍困」锁定牌入手',
    JSON.stringify(st.killerHand));
  /** 模拟"已经打出去过"：从手牌挪到弃牌堆 */
  st.killerHand = st.killerHand.filter((id) => id !== 'statue_siege');
  st.killerDiscard = [...st.killerDiscard, 'statue_siege'];
  levelUpTo(st, 4);
  console.log(`  (a) 手牌 ${st.killerHand.length} 张、弃牌堆有圍困 → 取回=${st.killerHand.includes('statue_siege')}`);
  ok(st.killerHand.includes('statue_siege'), '**(a) 弃牌堆里有、手牌没满 → 照常取回**');
  ok(!st.killerDiscard.includes('statue_siege'), '而且从弃牌堆拿走了');
  ok(st.killerHand.filter((id) => id === 'statue_siege').length === 1,
    '**只有一张**（不会锁定区 + 弃牌堆各给一张）',
    String(st.killerHand.filter((id) => id === 'statue_siege').length));
}
{
  /**
   * (b) 手牌满 → **照拿**，然后自选弃 1 张（用户口径 2026-02 更正：
   * 「弃牌堆没有【围困】时才跳过。若雕像手牌满，则选择一张弃置，再加入围困」）。
   */
  const st = mk();
  levelUpTo(st, 3);
  /** 把「圍困」打出去（进弃牌堆），再把手里塞满真牌（雕像自己的那几张） */
  st.killerHand = st.killerHand.filter((id) => id !== 'statue_siege');
  st.killerDiscard = [...st.killerDiscard, 'statue_siege'];
  const max = st.rules.killerHandMax ?? 5;
  const own = Object.keys(st.cardById).filter(
    (id) => /^statue_/.test(id) && id !== 'statue_siege',
  );
  while (st.killerHand.length < max) st.killerHand.push(own[st.killerHand.length % own.length]);
  console.log(`  [诊断] 4 级之前：手牌 ${st.killerHand.length}/${max}`);
  levelUpTo(st, 4);
  console.log(`  (b) 手牌原本 ${max}/${max} → 取回=${st.killerHand.includes('statue_siege')}；` +
    `要弃牌=${st.pendingKillerDiscards}`);
  ok(st.killerHand.includes('statue_siege'), '**(b) 手牌满也照拿「圍困」**',
    JSON.stringify(st.killerHand));
  ok(!st.killerDiscard.includes('statue_siege'), '从弃牌堆拿走了');
  ok(st.pendingKillerDiscards === 1, '**拿完要自选弃置 1 张**', String(st.pendingKillerDiscards));
  ok((st.justUnlockedCards ?? []).includes('statue_siege'),
    '**「圍困」是刚入手的，本次不能弃**（否则等于白拿）',
    JSON.stringify(st.justUnlockedCards));
  /** 真弃一张（不是圍困）→ 手牌回到上限、圍困留在手上 */
  const cand = st.killerHand.find((id) => id !== 'statue_siege');
  const eDiscard = tryIt(st, { type: 'discardKillerCard', cardId: cand });
  ok(eDiscard == null, '弃掉一张旧牌', String(eDiscard));
  console.log(`  (b) 弃完：手牌 ${st.killerHand.length} 张，其中圍困 ` +
    `${st.killerHand.filter((id) => id === 'statue_siege').length} 张`);
  ok(st.killerHand.length === max, '**弃完正好回到手牌上限**', String(st.killerHand.length));
  ok(st.killerHand.includes('statue_siege'), '**「圍困」在手上**');
  /** 反过来：想弃「圍困」本身要被拒 */
  const st3 = mk();
  levelUpTo(st3, 3);
  st3.killerHand = st3.killerHand.filter((id) => id !== 'statue_siege');
  st3.killerDiscard = [...st3.killerDiscard, 'statue_siege'];
  while (st3.killerHand.length < max) st3.killerHand.push(own[st3.killerHand.length % own.length]);
  levelUpTo(st3, 4);
  const eSiege = tryIt(st3, { type: 'discardKillerCard', cardId: 'statue_siege' });
  ok(eSiege != null, '**刚入手的「圍困」不能反手弃掉**', String(eSiege));
  ok(st.killerPower >= 2, '力量照样 +2', String(st.killerPower));
}
{
  /** (c) 弃牌堆里没有（还在手上） → 跳过，不许再变一张出来 */
  const st = mk();
  levelUpTo(st, 3);
  ok(st.killerHand.includes('statue_siege'), '（前提）3 级入手后圍困在手上');
  levelUpTo(st, 4);
  console.log(`  (c) 弃牌堆没有圍困 → 手牌里圍困张数=` +
    `${st.killerHand.filter((id) => id === 'statue_siege').length}`);
  ok(st.killerHand.filter((id) => id === 'statue_siege').length === 1,
    '**(c) 弃牌堆里没有 → 跳过（不会凭空多一张）**');
  ok(st.killerPower >= 2, '力量照样 +2', String(st.killerPower));
}

console.log('\n=== ③ 被停滞的雕像：移动 / 搜索"能做、但执行时被跳过" ===');
{
  const st = mk();
  const m = mainStatue(st);
  m.statueHalted = true;
  st.phase = 'killerMain';
  st.killerTurnStep = 'main';
  st.killerMainChoice = 'actions';
  st.killerMainActionsLeft = 2;
  st.pendingKillerDiscards = 0;
  const to = st.map.rooms.find((r) => r.id !== m.roomId)?.id;
  const from = m.roomId;
  const eMove = tryIt(st, { type: 'move', toRoomId: to });
  console.log(`  停滞状态下：移动→${eMove ?? '（通过了）'}；` +
    `地点 ${from} → ${m.roomId}；剩余行动 ${st.killerMainActionsLeft}`);
  ok(eMove == null, '**移动不再报错**（执行时跳过，不是"不能做"）', String(eMove));
  ok(m.roomId === from, '**雕像没动**（原地不动）', String(m.roomId));
  ok(st.killerMainActionsLeft === 1, '**但照常消耗一次普通行动**',
    String(st.killerMainActionsLeft));
  const skipMoveLog = st.logs.map((l) => l.text).find((t) => t.includes('这次移动被跳过'));
  ok(Boolean(skipMoveLog), '战报写清了"这次移动被跳过"', skipMoveLog ?? '');

  const eSearch = tryIt(st, { type: 'search' });
  console.log(`  搜索→${eSearch ?? '（通过了）'}；剩余行动 ${st.killerMainActionsLeft}`);
  ok(eSearch == null, '**搜索也不再报错**', String(eSearch));
  ok(st.killerMainActionsLeft === 0, '搜索也照常消耗一次行动',
    String(st.killerMainActionsLeft));
  const skipSearchLog = st.logs.map((l) => l.text).find((t) => t.includes('这次搜索被跳过'));
  ok(Boolean(skipSearchLog), '战报写清了"这次搜索被跳过"', skipSearchLog ?? '');
  /** 跳过 ≠ 搜索：没搜就不会"发现幸存者"，也不会冒出遭遇 */
  ok(st.encounter == null, '**没有真的搜索**（不会冒遭遇）');
  ok(!st.logs.some((l) => l.text.includes('搜索房间')), '**没写"搜索房间"那条战报**');

  /** 对照：没被停滞时搜索照常（⚠ 要自己摆好"杀手一般行动阶段"，`mk()` 出来还在幸存者阶段） */
  const st2 = mk();
  const m2 = mainStatue(st2);
  m2.statueHalted = false;
  st2.phase = 'killerMain';
  st2.killerTurnStep = 'main';
  st2.killerMainChoice = 'actions';
  st2.killerMainActionsLeft = 2;
  st2.pendingKillerDiscards = 0;
  const eSearch2 = tryIt(st2, { type: 'search' });
  ok(!eSearch2, '**没被停滞时搜索照常**', eSearch2 ?? '');
  ok(st2.killerMainActionsLeft === 1, '（对照）照常消耗一次行动',
    String(st2.killerMainActionsLeft));
  ok(st2.logs.some((l) => l.text.includes('搜索房间') || l.text.includes('发现了')),
    '（对照）这次是真的搜了');
}

console.log('\n=== ③-b 单人「快进」里被停滞的雕像同样跳过搜索 ===');
{
  /** 把雕像和幸存者分开放，免得快进的搜索起遭遇 */
  const st = mk();
  const m = mainStatue(st);
  const empty = st.map.rooms.find((r) => r.id !== m.roomId)?.id;
  for (const p of statues(st)) p.roomId = empty;
  for (const p of Object.values(st.players)) if (p.faction === 'survivor') p.roomId = m.roomId;
  m.statueHalted = true;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.killerMainActionsLeft = 0;
  const e = tryIt(st, { type: 'fastForward' });
  const skips = st.logs.filter((l) => l.text.includes('这次搜索被跳过')).length;
  console.log(`  快进→${e ?? 'OK'}；跳过的搜索 ${skips} 次；phase=${st.phase}`);
  ok(e == null, '**快进不报错**', String(e));
  ok(skips === 2, '**两次快进搜索都被跳过**', String(skips));
  ok(!st.logs.some((l) => l.text.includes('搜索房间') || l.text.includes('发现了')),
    '**一次都没真的搜**（不会冒遭遇）');
  ok(st.encounter == null, '没有遭遇');
  ok(st.phase !== 'killerMain', '**回合照常结束**（不卡住）', String(st.phase));
}

console.log('\n=== ③-c 进化「转换主雕像」不能选当前主雕像 ===');
{
  const st = mk();
  const main = mainStatue(st);
  const other = statues(st).find((p) => p.id !== main.id);
  st.pendingStatueEvoSwitch = true;
  const eMain = tryIt(st, { type: 'pickStatueEvoSwitch', statueId: main.id });
  console.log(`  选当前主雕像→${eMain ?? '（通过了）'}`);
  ok(eMain != null && /已经是主雕像/.test(eMain), '**选当前主雕像被拒**', String(eMain));
  ok(st.pendingStatueEvoSwitch === true, '拒了之后还停在"要不要转"这一步');
  const eOther = tryIt(st, { type: 'pickStatueEvoSwitch', statueId: other.id });
  ok(eOther == null, '**换另一尊照样能选**', String(eOther));
  ok(st.pendingStatueEvoTarget === other.id, '记下了要切到哪一尊', String(st.pendingStatueEvoTarget));
}

console.log('\n=== ④ 被停滞的雕像在杀手大回合开始时向杀手说明 ===');
{
  const st = mk();
  const target = statues(st).find((p) => p.statueIndex === 3);
  target.statueHalted = true;
  /** 真局里 `beginKillerTurn` 是在杀手回合开头调的（那时视角是杀手） */
  st.phase = 'killerMain';
  beginKillerTurn(st);
  /** ⚠ 这条是 `vis:'killer'` —— 直接看原始战报，避免被"当前视角"过滤掉 */
  const raw = st.logs.map((l) => l.text).find((t2) => t2.includes('被停滞的雕像'));
  const killerLogs = (buildSnapshot(st, HOST).logs ?? []).map((l) => l.text);
  const line = killerLogs.find((t2) => t2.includes('被停滞的雕像'));
  console.log(`  杀手看到：${line ?? raw ?? '（没有这条）'}`);
  ok(Boolean(raw), '**杀手回合开始时报告了被停滞的雕像**', raw ?? '');
  ok(Boolean(raw?.includes(String(target.statueIndex))), '写清了是几号',
    `雕像 ${target.statueIndex}`);
  ok(Boolean(raw?.includes('移动和搜索会被跳过')), '写清了后果（"会被跳过"，不是"不能做"）');
  ok(Boolean(line), '杀手视角的快照里也看得到（不是被过滤掉）');
  /** 快照里也带着（地图画叉） */
  const snap = buildSnapshot(st, HOST);
  ok((snap.statues ?? []).some((x) => x.halted === true), '**快照里带着 halted**（地图画叉）');
}

console.log('\n=== ⑤ 3 级进化（解锁「圍困」）+ 超额弃牌：弃牌堆**必须洗回摸牌堆** ===');
{
  /**
   * 用户报的「雕像 3 级进化后没有洗牌。很奇怪。」
   *
   * 根因：进化结算时若"解锁入手后手牌超额"，`settleConfirmedEvolution` 会在
   * `if (pendingKillerDiscards > 0) return;` **提前返回**，那句
   * `resumeDeferredDeckRecycle` 没跑到；而弃完牌那一步原来按 `phase === 'upkeep'`
   * 走 `maybeCloseKillerUpkeep` —— 它**不补洗牌**，回合就这么收了尾：
   * 摸牌堆空着、欠的摸牌一直挂到**下一次**进化才被一起摸出来
   * （这也是之前"为什么进化到 4 级时摸了 5 张"的来源）。
   */
  const st = mk();
  st.killerLevel = 2;
  const own = Object.keys(st.cardById).filter(
    (id) => /^statue_/.test(id) && id !== 'statue_siege',
  );
  const allIds = Object.keys(st.cardById);
  st.killerHand = own.slice(0, st.rules.killerHandMax);
  st.killerLocked = ['statue_siege'];
  st.killerDeck = [];
  st.killerDiscard = allIds
    .filter((id) => !st.killerHand.includes(id) && id !== 'statue_siege')
    .slice(0, 6);
  /** 雕像挪到没人的地点、幸存者放另一处（免得快进起遭遇） */
  const m = mainStatue(st);
  const startRoom = m.roomId;
  const emptyRoom = st.map.rooms.find((r) => r.id !== startRoom)?.id;
  for (const p of statues(st)) p.roomId = emptyRoom;
  for (const p of Object.values(st.players)) if (p.faction === 'survivor') p.roomId = startRoom;
  st.phase = 'killerMain';
  st.killerTurnStep = 'fast';
  st.killerMainChoice = null;
  st.logs = [];

  /** 快进 → 两次搜索 → 回合结束摸 3 张（摸牌堆是空的 → 触发 3 级进化） */
  const eFf = tryIt(st, { type: 'fastForward' });
  console.log(`  快进→${eFf ?? 'OK'}；等级=${st.killerLevel} 欠摸=${st.pendingDeckDrawsLeft} ` +
    `recycle=${Boolean(st.pendingDeckRecycle)}`);
  ok(eFf == null, '快进不报错', String(eFf));
  ok(st.killerLevel === 3, '**进化到 3 级**', String(st.killerLevel));
  ok(st.pendingDeckRecycle === true, '（前提）这次洗牌被进化挡住了');
  ok(st.killerHand.includes('statue_siege') === false, '（前提）此时圍困还在锁定区');

  tryIt(st, { type: 'ackEvolution' });
  tryIt(st, { type: 'skipStatueEvoSwitch' });
  ok(st.killerHand.includes('statue_siege'), '**3 级解锁「圍困」入手**', JSON.stringify(st.killerHand));
  ok(st.pendingKillerDiscards > 0, '（前提）入手后手牌超额，要自选弃牌',
    String(st.pendingKillerDiscards));
  ok(st.pendingDeckRecycle === true, '（前提）这时洗牌还欠着');

  const cand = st.killerHand.find((id) => !(st.justUnlockedCards ?? []).includes(id));
  const eDiscard = tryIt(st, { type: 'discardKillerCard', cardId: cand });
  ok(eDiscard == null, '弃 1 张', String(eDiscard));

  const shuffleLine = st.logs.find((l) => l.text.includes('已洗匀'));
  console.log(`  弃完牌后的洗牌战报：${shuffleLine ? `[vis=${shuffleLine.vis ?? 'all'}] ${shuffleLine.text}` : '（没有！）'}`);
  ok(Boolean(shuffleLine), '**弃完牌就把弃牌洗回摸牌堆了**', shuffleLine?.text ?? '');
  ok((shuffleLine?.vis ?? 'all') !== 'survivor',
    '**这条是杀手看得到的**（不是被判成"幸存者私有"）', String(shuffleLine?.vis));
  ok(st.pendingDeckRecycle === false, '洗牌不再挂着');
  ok((st.pendingDeckDrawsLeft ?? 0) === 0, '欠的摸牌也补完了', String(st.pendingDeckDrawsLeft ?? 0));
  ok(st.killerDeck.length > 0, '**摸牌堆里真的有牌了**（不再是空的）', String(st.killerDeck.length));
  ok(st.phase !== 'upkeep' && st.pendingEvolutionAck == null, '回合正常收尾',
    `${st.phase}`);
}

console.log(`\n雕像停滞 / 圍困 / 洗牌：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
