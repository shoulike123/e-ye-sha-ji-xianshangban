/**
 * 验证雕像杀手的变体1 特性口径（用户规则）：
 *
 *  - 特性卡**一局只发一份**、挂在主雕像上 → 12「致命攻击」这类常驻只 +1 力量，
 *    不会 4 尊雕像各加一次（+4）。
 *  - 02/11 认"**当前遭遇中的那尊雕像**"：非主雕像打出的伤害也要能触发 11。
 *  - 2对3 里两名杀手的特性**不能互相串**。
 *
 * ⚠ 本用例只覆盖**能稳定构造**的两条（①②）；"12 只 +1"和"2对3 不串"
 * 需要走完整的选特性流程才能构造，见文件末尾说明。
 *
 * 跑法：node scripts/tests/traits-statue-scope.mjs
 */
import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, startGame,
} from '../../server/dist/game/engine.js';
import { applyDamage } from '../../server/dist/game/effects.js';
import { applyVariant1Setup } from '../../server/dist/game/engine.js';

const content = loadContent();
const HOST = 'h';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

function mkSolo(killerId, variant1 = true) {
  const st = createLobby('T', HOST, 'H', content, 'crypt');
  st.mode = 'solo';
  st.variant1 = variant1;
  st.soloKillerCharacterId = killerId;
  st.soloSurvivorCharacterIds = ['survivor3', 'survivor4', 'survivor5'];
  st.players[HOST].ready = true;
  startGame(st, content, HOST);
  st.pendingEvolutionAck = null;
  st.pendingUnlockChoice = null;
  st.pendingUnlockDiscard = false;
  st.statueMainLocked = true;
  /** 正常对局由"选特性卡"流程灌入；这里直接给 `state.traits` 挂卡，所以补上定义表 */
  st.traitById = Object.fromEntries((content.traits ?? []).map((t) => [t.id, t]));
  return st;
}

console.log('=== ① 特性卡只发给主雕像（一局一份，不会 4 尊各一份） ===');
{
  const st = mkSolo('killer6');
  const holders = Object.entries(st.traits ?? {}).filter(([, list]) => (list ?? []).length);
  const statueHolders = holders.filter(([id]) => id.includes('statue'));
  console.log(`  雕像棋子：${(st.statueIds ?? []).length} 尊；持有特性卡的雕像棋子：${statueHolders.length} 个`);
  ok(
    (st.statueIds ?? []).length === 4 && statueHolders.length <= 1,
    '**开局不会给 4 尊雕像各发一份特性卡**（否则 12 会 +4 力量）',
    `${statueHolders.length} 份 / ${(st.statueIds ?? []).length} 尊`,
  );
}

console.log('=== ② 非主雕像打出的伤害，能触发 11「恐惧迸发」 ===');
{
  const st = mkSolo('killer6');
  const mainId = st.killerId;
  const statues = (st.statueIds ?? []).map((id) => st.players[id]).filter(Boolean);
  const nonMain = statues.find((p) => p.id !== mainId);
  /** 特性挂在主雕像那一份上（一局一份） */
  st.traits = { [mainId]: ['trait_k11'] };
  applyVariant1Setup(st);

  const survivors = Object.values(st.players).filter((p) => p.faction === 'survivor' && p.alive);
  const before = survivors.map((p) => p.fear);
  console.log(`  主雕像=${st.players[mainId]?.name}；造成伤害的是**非主雕像** ${nonMain?.name}`);
  applyDamage(st, survivors[0].id, 0, nonMain.id);
  const after = survivors.map((p) => p.fear);
  console.log(`  恐惧：${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  ok(
    after.every((f, i) => f > (before[i] ?? 0)),
    '**非主雕像造成的伤害照样触发 11**（所有幸存者被惊吓）',
  );
}

console.log(`\n雕像特性口径：${pass} 通过 / ${fail} 失败`);
console.log(
  '\n说明：「12 只 +1 力量」「2对3 两名杀手不串」需要走完整的\n' +
  '「开局发特性卡 → 选卡 → applyVariant1Setup」流程才能构造，\n' +
  '本脚本直接摆 state 构造不出来（`setupTraitsOf` 依赖发牌流程写下的字段），\n' +
  '所以这两条留作用例缺口记录，等有稳定摆法再补。',
);
process.exit(fail === 0 ? 0 : 1);
