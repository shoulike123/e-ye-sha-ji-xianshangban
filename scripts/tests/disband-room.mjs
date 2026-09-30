/**
 * **【解散房间】**（用户报的第 5 类）验证。
 *
 * 要求原文：「在除观众外所有人最顶栏加一个【解散房间】按钮，点击了要其他人确认，
 * 所有人确认之后就退回主界面，解散房间。」
 *
 * 这里验的是服务端那一半：
 *  - 观众**不能**发起、也不能被算进"所有人"里；
 *  - 发起人自己算第一票，剩下的人逐个确认；
 *  - **最后一个**（除观众以外还连着的）玩家一确认就 `disbanded = true`；
 *  - 掉线的人不算选民（否则永远凑不齐）；
 *  - 取消之后回到"没有解散请求"；
 *  - `RoomManager` 在 `disbanded` 之后真的把房间从内存里删掉了。
 *
 * 跑法：`npm run test:disband`
 */
const { loadContent } = await import('../../server/dist/content/loader.js');
const {
  createLobby, createPlayer, handleAction, buildSnapshot, disbandVoters,
} = await import('../../server/dist/game/engine.js');
const { RoomManager } = await import('../../server/dist/game/roomManager.js');

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};
const throws = (fn, needle, label) => {
  try { fn(); ok(false, label, '（没有报错）'); }
  catch (e) {
    const msg = String(e?.message ?? e);
    ok(msg.includes(needle), label, msg);
  }
};

/** 一桌 3 人 + 1 名观众的大厅 */
function table() {
  const st = createLobby('T', 'a', '甲', content);
  for (const [id, name, faction] of [
    ['b', '乙', 'survivor'],
    ['c', '丙', 'survivor'],
    ['w', '看客', 'spectator'],
  ]) {
    st.players[id] = createPlayer(id, name, id);
    st.players[id].faction = faction;
  }
  st.players.a.faction = 'killer';
  return st;
}

/* ═══════════ ① 选民名单 ═══════════ */
console.log('=== ① 选民名单：除观众以外还连着的人 ===');
{
  const st = table();
  const voters = disbandVoters(st).sort();
  ok(JSON.stringify(voters) === JSON.stringify(['a', 'b', 'c']), '甲乙丙是选民，看客不是', voters.join(','));
  st.players.b.connected = false;
  ok(!disbandVoters(st).includes('b'), '掉线的人不算选民', disbandVoters(st).join(','));
  st.players.b.connected = true;

  const snap = buildSnapshot(st, 'a');
  ok(snap.canRequestDisband === true, '杀手能点解散房间');
  ok(buildSnapshot(st, 'w').canRequestDisband === false, '观众不能点解散房间');
  ok(!snap.disband, '没人发起时 disband 为空');
}

/* ═══════════ ② 发起 → 逐个确认 → 解散 ═══════════ */
console.log('=== ② 发起 → 逐个确认 → 解散 ===');
{
  const st = table();
  throws(() => handleAction(st, 'w', { type: 'requestDisband' }, content), '观众不能解散房间', '观众发起被拒');

  handleAction(st, 'a', { type: 'requestDisband' }, content);
  ok(st.disband.requestedBy === 'a', '记下发起人', String(st.disband.requestedBy));
  ok(JSON.stringify(st.disband.votes) === JSON.stringify(['a']), '发起人自己算第一票');
  ok(!st.disbanded, '还没解散');

  const forB = buildSnapshot(st, 'b');
  ok(forB.disband?.youConfirmed === false, '乙还没确认');
  ok(
    JSON.stringify([...forB.disband.waiting].sort()) === JSON.stringify(['丙', '乙']),
    '还差乙和丙',
    forB.disband.waiting.join('、'),
  );
  ok(
    JSON.stringify(forB.disband.confirmed) === JSON.stringify(['甲']),
    '已确认只有甲',
    forB.disband.confirmed.join('、'),
  );
  throws(() => handleAction(st, 'a', { type: 'requestDisband' }, content), '已经在等大家确认', '不能重复发起');

  handleAction(st, 'b', { type: 'confirmDisband' }, content);
  ok(!st.disbanded, '两个人确认后还没解散');
  ok(buildSnapshot(st, 'b').disband.youConfirmed === true, '乙确认过了');

  handleAction(st, 'c', { type: 'confirmDisband' }, content);
  ok(st.disbanded === true, '**最后一个人确认后房间解散**');
  ok(buildSnapshot(st, 'a').disbanded === true, '快照里带着 disbanded');
}

/* ═══════════ ③ 取消 / 掉线不下蛋 ═══════════ */
console.log('=== ③ 取消 / 发起人掉线 ===');
{
  const st = table();
  throws(() => handleAction(st, 'a', { type: 'cancelDisband' }, content), '现在没有待确认的解散请求', '没请求时取消被拒');
  throws(() => handleAction(st, 'a', { type: 'confirmDisband' }, content), '现在没有待确认的解散请求', '没请求时确认被拒');

  handleAction(st, 'a', { type: 'requestDisband' }, content);
  handleAction(st, 'b', { type: 'cancelDisband' }, content);
  ok(st.disband.requestedBy === null, '谁都能取消这次解散请求', String(st.disband.requestedBy));
  ok(st.disband.votes.length === 0, '取消后票数清零');

  /** 掉了的那个人不参与，剩下的确认就够 */
  const st2 = table();
  st2.players.c.connected = false;
  handleAction(st2, 'a', { type: 'requestDisband' }, content);
  ok(
    JSON.stringify(buildSnapshot(st2, 'a').disband.waiting) === JSON.stringify(['乙']),
    '掉线的丙不在"还差"里',
    buildSnapshot(st2, 'a').disband.waiting.join('、'),
  );
  handleAction(st2, 'b', { type: 'confirmDisband' }, content);
  ok(st2.disbanded === true, '剩下一确认就解散（不会被掉线的人卡死）');
}

/* ═══════════ ④ 一个人的房间 ═══════════ */
console.log('=== ④ 只有自己一个人时点一下就散 ===');
{
  const st = createLobby('T', 'a', '甲', content);
  st.players.a.faction = 'killer';
  handleAction(st, 'a', { type: 'requestDisband' }, content);
  ok(st.disbanded === true, '没有别人要等 → 点了就散');
}

/* ═══════════ ⑤ 对局中也能解散（不被待办卡住） ═══════════ */
console.log('=== ⑤ 对局进行中照样能解散 ===');
{
  const st = table();
  st.phase = 'killerMain';
  st.killerId = 'a';
  /** 故意挂一个"必须先处理"的待办，解散也不能被它拦住 */
  st.pendingEvolutionAck = { fromLevel: 0, toLevel: 1 };
  st.pendingSixthSense = { playerId: 'b', cards: [{ id: 'x', name: 'X' }] };
  handleAction(st, 'a', { type: 'requestDisband' }, content);
  ok(st.disband.requestedBy === 'a', '有未处理待办时仍能发起解散');
  handleAction(st, 'b', { type: 'confirmDisband' }, content);
  handleAction(st, 'c', { type: 'confirmDisband' }, content);
  ok(st.disbanded === true, '有未处理待办时仍能解散');
}

/* ═══════════ ⑥ RoomManager 真的把房间删掉 ═══════════ */
console.log('=== ⑥ 解散后房间从服务器上消失 ===');
{
  const rooms = new RoomManager(content);
  const snap0 = rooms.create('sock-a', '甲');
  const code = snap0.roomCode;
  rooms.join(code, 'sock-b', '乙');
  const hosts = ['sock-a', 'sock-b'];
  const before = rooms.stateOf(code);
  ok(Boolean(before), '房间建起来了', code);

  const r1 = rooms.action('sock-a', { type: 'requestDisband' });
  ok(r1.disbanded === false, '第一票还不解散');
  ok(r1.snapshots.length === 2, '两个人都收到快照', String(r1.snapshots.length));
  ok(r1.snapshots.every((x) => x.snapshot.disband?.requestedBy), '快照里带着解散进度');

  const r2 = rooms.action('sock-b', { type: 'confirmDisband' });
  ok(r2.disbanded === true, '第二票触发解散');
  ok(r2.snapshots.every((x) => x.snapshot.disbanded === true), '每个人拿到的最后一份快照都带 disbanded');
  ok(rooms.stateOf(code) === undefined, '房间对象已从内存里删除');
  ok(rooms.roomCodeOf('sock-a') === undefined, '甲的座位记录也清了');
  ok(rooms.roomCodeOf('sock-b') === undefined, '乙的座位记录也清了');
  ok(rooms.snapshotFor('sock-a') === null, '再问快照会得到 null');
  throws(() => rooms.action('sock-a', { type: 'confirmDisband' }), '你不在任何房间中', '解散后再发动作会被拒');
  void hosts;
}

/* ═══════════ ⑦ 界面：最顶栏那颗按钮 ═══════════ */
console.log('=== ⑦ 界面（SSR）：顶栏按钮 / 确认面板 ===');
{
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { renderToStaticMarkup } = require('react-dom/server');
  const React = require('react');
  const { LobbyView } = await import('../../client/_ssrbuild/GameViews.js');

  const draw = async (snap, id) => renderToStaticMarkup(
    React.createElement(LobbyView, { state: snap, isHost: id === 'a', error: null, onAction: async () => {} }),
  );

  const st = table();
  const mine = buildSnapshot(st, 'a');
  const html1 = await draw(mine, 'a');
  ok(html1.includes('解散房间'), '顶栏有【解散房间】按钮');
  ok(html1.includes('disband-bar'), '用的是顶栏那一条（disband-bar）');

  const spec = await draw(buildSnapshot(st, 'w'), 'w');
  ok(!spec.includes('解散房间'), '观众的界面上没有这个按钮');

  handleAction(st, 'a', { type: 'requestDisband' }, content);
  const html2 = await draw(buildSnapshot(st, 'b'), 'b');
  ok(html2.includes('甲 发起【解散房间】'), '面板写出谁发起的');
  ok(html2.includes('还差：乙、丙'), '面板列出还差谁', '还差：乙、丙');
  ok(html2.includes('确认解散'), '没确认过的人看到【确认解散】');

  const html3 = await draw(buildSnapshot(st, 'a'), 'a');
  ok(!html3.includes('>确认解散<'), '已经确认过的人不再看到【确认解散】');
  ok(html3.includes('取消解散'), '任何阶段都能取消');
}

console.log(`\n解散房间：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);

