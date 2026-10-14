/**
 * 恐惧标记和惊吓过度都没少时，不写「消除恐惧」战报。
 * 真的少了，战报照旧。
 */
const { loadContent } = await import('../../server/dist/content/loader.js');
const {
  createLobby, startGame, handleAction,
} = await import('../../server/dist/game/engine.js');

const content = loadContent();
const HOST = 'h';
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

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
  st.pendingKillerDiscards = 0;
  st.phase = 'survivorMain';
  st.pendingSurvivorPick = false;
  const ophelia = Object.values(st.players).find((p) => p.characterId === 'survivor7');
  st.activeSurvivorIndex = st.turnOrder.indexOf(ophelia.id);
  for (const p of Object.values(st.players)) {
    if (p.faction === 'survivor') {
      p.mainActionUsed = false;
      p.fear = 0;
      p.overFear = false;
    }
  }
  return { st, ophelia };
}

function fresh(st, fn) {
  const n = st.logs.length;
  let err = null;
  try { fn(); }
  catch (e) { err = String(e?.message ?? e); }
  return { err, lines: st.logs.slice(n).map((l) => l.text) };
}

console.log('=== 恐惧没变就不写战报 ===');
{
  const { st, ophelia } = mk();
  const { err, lines } = fresh(st, () => handleAction(st, HOST, { type: 'clearFear' }, content));
  ok(err == null, '恐惧为 0 仍能消除恐惧', String(err));
  ok(!lines.some((t) => t.includes('消除恐惧')), '恐惧为 0：不写消除恐惧', lines.join(' | '));
  ok(ophelia.mainActionUsed === true, '一般行动照样用掉');
}
{
  const { st, ophelia } = mk();
  ophelia.fear = 2;
  const { lines } = fresh(st, () => handleAction(st, HOST, { type: 'clearFear' }, content));
  ok(lines.some((t) => t.includes(`${ophelia.name} 消除恐惧`)), '恐惧少了：要写', lines.join(' | '));
  ok(ophelia.fear === 0, '恐惧被清掉');
}
{
  const { st, ophelia } = mk();
  ophelia.overFear = true;
  const { lines } = fresh(st, () => handleAction(st, HOST, { type: 'clearFear' }, content));
  ok(!lines.some((t) => t.includes('消除恐惧') || t.includes('惊吓过度')),
    '只剩惊吓过度、恐惧枚数是 0：不报', lines.join(' | '));
  ok(ophelia.overFear === false && ophelia.fear === 0, '惊吓过度状态收掉，但不写战报');
}
{
  const { st, ophelia } = mk();
  ophelia.items = { ...(ophelia.items ?? {}), sedative: 1 };
  const { err, lines } = fresh(st, () => handleAction(st, HOST, { type: 'useItem', itemId: 'sedative' }, content));
  ok(err == null, '镇静剂在恐惧为 0 时可以用', String(err));
  ok(!lines.some((t) => t.includes('恐惧')), '镇静剂没清掉恐惧：不报', lines.join(' | '));
}
{
  const { st, ophelia } = mk();
  ophelia.fear = 1;
  ophelia.items = { ...(ophelia.items ?? {}), sedative: 1 };
  const { lines } = fresh(st, () => handleAction(st, HOST, { type: 'useItem', itemId: 'sedative' }, content));
  ok(lines.some((t) => t.includes('消除了恐惧')), '镇静剂清掉恐惧：要写', lines.join(' | '));
}
{
  const { st, ophelia } = mk();
  ophelia.fear = 0;
  ophelia.encourageToken = true;
  const { err, lines } = fresh(st, () => handleAction(st, HOST, {
    type: 'useEncourage', targetPlayerId: ophelia.id, actorPlayerId: ophelia.id,
  }, content));
  ok(err == null, '已有标记且没有恐惧，鼓励仍能发动', String(err));
  ok(!lines.some((t) => t.includes('恐惧')), '恐惧没变、标记也没新放：不报恐惧', lines.join(' | '));
}
{
  const { st, ophelia } = mk();
  const { lines } = fresh(st, () => handleAction(st, HOST, {
    type: 'useEncourage', targetPlayerId: ophelia.id, actorPlayerId: ophelia.id,
  }, content));
  ok(lines.some((t) => t.includes('鼓励标记')), '新放标记仍要写给幸存者', lines.join(' | '));
  ok(!lines.some((t) => t.includes('恐惧')), '恐惧本来是 0：不写消除恐惧', lines.join(' | '));
  const killerLines = st.logs.filter((l) => l.vis === 'all' || l.vis === 'killer').map((l) => l.text);
  ok(!killerLines.some((t) => t.includes('鼓励标记')), '放下鼓励标记不写给杀手', killerLines.join(' | '));
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
