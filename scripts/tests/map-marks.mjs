/**
 * **地图标记可校准**：城堡的机关大门、实验室的急救箱。
 *
 * 用户要求：
 *  - 「城堡地图上的机关大门位置，实验室地图的急救箱位置我都要调整」
 *  - 「急救箱标记像手提箱一样放在地图上」
 *
 * 所以两件事必须成立：
 *  1. **位置真的由地图数据决定**（改数据 → 画出来的位置跟着变），
 *     这样在 `/map-calibrate/` 里拖完保存就能生效；
 *  2. 校准工具本身能拖它们。
 *
 * 跑法：`npm run test:marks`
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
import { readFileSync } from 'node:fs';

import { loadContent } from '../../server/dist/content/loader.js';
import {
  createLobby, createPlayer, startGame, buildSnapshot,
} from '../../server/dist/game/engine.js';
import { firstAidKitRoomId, placeLeverGate } from '../../server/dist/game/mapEffects.js';

const content = loadContent();
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);

function mk(mapId) {
  const st = createLobby('T', 'h', 'H', content, mapId);
  st.mode = 'duo';
  const bs = createPlayer('s', 'S', 's');
  bs.faction = 'survivor';
  bs.ready = true;
  st.players = { h: st.players.h, s: bs };
  st.players.h.faction = 'killer';
  st.players.h.characterId = 'killer1';
  st.players.h.ready = true;
  st.hostId = 'h';
  st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
  startGame(st, content, 'h');
  st.pendingEvolutionAck = null;
  return st;
}

const { Board } = await import('../../client/_ssrbuild/Board.js');
function render(st, viewer) {
  const snap = buildSnapshot(st, viewer);
  return renderToStaticMarkup(
    React.createElement(Board, {
      map: snap.map,
      players: snap.players,
      youId: viewer === 'h' ? st.killerId : viewer,
      viewerFaction: viewer === 'h' ? 'killer' : 'survivor',
      legalMoves: [],
      noises: [],
      blockades: snap.blockades ?? [],
      onRoomClick: () => {},
      leverGateDoorId: snap.leverGateDoorId ?? null,
      firstAidKit: snap.firstAidKit === true,
      firstAidRoomId: snap.firstAidRoomId ?? null,
    }),
  );
}

const AID_SRC = encodeURI('/Image/UI/急救箱.png');
const GATE_SRC = encodeURI('/Image/UI/机关大门.png');

/* ═══════════ ① 急救箱是"手提箱那样的道具" ═══════════ */
console.log('=== ① 急救箱 = 地图上的一个道具 ===');
{
  const lab = content.maps.find((m) => m.id === 'laboratory');
  const tok = (lab.tokens ?? []).find((t) => t.kind === 'firstAidKit');
  ok(Boolean(tok), '**实验室地图的 tokens 里有一条急救箱**', JSON.stringify(tok));
  ok(tok?.src === '/Image/UI/急救箱.png', '用的是急救箱那张图', String(tok?.src));
  ok(tok?.roomId === 'G3', '记着它在 G3（规则判"能不能用"靠这个）', String(tok?.roomId));
  ok(
    tok?.side === 'survivor',
    '**只有幸存者的地图上画**（用户要求：杀手看不到急救箱）',
    String(tok?.side),
  );
  ok(typeof tok?.x === 'number' && typeof tok?.y === 'number', '有绝对坐标（这样才能拖）');
}

/* ═══════════ ② 改数据 → 画出来的位置跟着变 ═══════════ */
console.log('=== ② 位置由地图数据决定（拖完保存就生效）===');
{
  const st = mk('laboratory');
  const tok = st.map.tokens.find((t) => t.kind === 'firstAidKit');
  const before = render(st, 's');
  ok(before.includes(AID_SRC), '默认位置画得出急救箱');

  /** 挪到别处 + 改大小 */
  tok.x = 111;
  tok.y = 222;
  tok.w = 77;
  tok.h = 66;
  const after = render(st, 's');
  ok(after.includes(AID_SRC), '挪完还是画得出来');
  ok(
    after.includes('width="77"') && after.includes('height="66"'),
    '**改了宽高，画出来就跟着变**',
  );
  /** 中心点 = x + w/2, y + h/2 = 149.5, 255 */
  ok(
    after.includes('translate(149.5 255)'),
    '**改了坐标，画的中心点也跟着变**（说明就是按 token 的 x/y 画的）',
    'translate(149.5 255)',
  );

  /** 用掉之后消失 */
  st.firstAidKit = false;
  ok(!render(st, 's').includes(AID_SRC), '用掉之后图标消失');
}

/* ═══════════ ②b 急救箱只有幸存者看得到 ═══════════ */
console.log('=== ②b 急救箱只有幸存者看得到 ===');
{
  const st = mk('laboratory');
  ok(st.firstAidKit === true, '开局急救箱在');
  ok(render(st, 's').includes(AID_SRC), '**幸存者地图上画得出来**');
  ok(
    !render(st, 'h').includes(AID_SRC),
    '**杀手地图上没有急救箱**（用户要求）',
  );
}

/* ═══════════ ③ 服务端"能不能用"也跟着 token 的 roomId 走 ═══════════ */
console.log('=== ③ 急救箱所在地点也由数据决定 ===');
{
  const st = mk('laboratory');
  ok(firstAidKitRoomId(st) === 'G3', '默认在 G3', firstAidKitRoomId(st));
  const tok = st.map.tokens.find((t) => t.kind === 'firstAidKit');
  tok.roomId = 'G5';
  ok(firstAidKitRoomId(st) === 'G5', '**把 token 挪到别的房间，规则也跟着走**', firstAidKitRoomId(st));
  ok(buildSnapshot(st, 's').firstAidRoomId === 'G5', '快照下发的也是新地点');
}

/* ═══════════ ④ 机关大门：位置、大小、角度全部跟封堵共用 ═══════════ */
console.log('=== ④ 机关大门与封堵共用位置 ===');
{
  const st = mk('castle');
  placeLeverGate(st, 'R5', 'G4');
  const gateDoor = st.leverGateDoorId;
  console.log(`   大门门号 = ${gateDoor}`);

  /** 找到那扇门，把它的封堵标记改成一个好认的位置 */
  const edge = st.map.edges.find(
    (e) => `${e.from}|${e.to}` === gateDoor || `${e.to}|${e.from}` === gateDoor,
  );
  ok(Boolean(edge), '在地图数据里找到了那扇门');
  /**
   * 校准工具会给**每一扇门**都补一份 `blockade` 坐标；地图文件如果还没保存过
   * 就可能没有 —— 这里按工具的做法补一份，别让测试依赖"用户有没有存过盘"。
   */
  edge.blockade = edge.blockade ?? {};
  edge.blockade.survivor = edge.blockade.survivor ?? { x: 300, y: 200, w: 44, h: 22, rotation: 0 };
  const mark = edge.blockade.survivor;
  ok(Boolean(mark), '这扇门上有封堵坐标', JSON.stringify(mark));

  const base = render(st, 's');
  ok(base.includes(GATE_SRC), '机关大门画出来了');
  /** 机关大门用的变换必须和封堵**完全一致**（只有 dy 那 7px 错开） */
  const gateT = new RegExp(
    `translate\\(([\\d.]+) ([\\d.]+)\\) rotate\\(([-\\d.]+)\\) translate\\((-[\\d.]+) (-[\\d.]+)\\)"[^>]*/>\\s*<image href="${GATE_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
  );
  const found = gateT.exec(base.replace(/\n\s*/g, ''));
  ok(Boolean(found), '拿到了机关大门画在哪', found?.[0]?.slice(0, 60) ?? '（没匹配到）');

  /** 把封堵挪走 → 机关大门必须跟着挪（证明是共用同一份坐标） */
  const bx = Number(found[1]);
  const by = Number(found[2]);
  const { x: ox, y: oy, w: ow, h: oh } = mark;
  mark.x = ox + 40;
  mark.y = oy + 25;
  const moved = render(st, 's');
  const found2 = gateT.exec(moved.replace(/\n\s*/g, ''));
  ok(Boolean(found2), '挪完还画得出来');
  ok(
    Math.abs(Number(found2[1]) - (bx + 40)) < 0.01 && Math.abs(Number(found2[2]) - (by + 25)) < 0.01,
    '**改了封堵坐标，机关大门跟着一起挪**（位置共用）',
    `(${bx}, ${by}) → (${found2[1]}, ${found2[2]})`,
  );

  /** 改封堵大小 → 机关大门一起变 */
  mark.w = ow + 12;
  mark.h = oh + 8;
  const bigger = render(st, 's');
  const found3 = gateT.exec(bigger.replace(/\n\s*/g, ''));
  ok(
    Math.abs(Number(found3[4]) + (ow + 12) / 2) < 0.01,
    '**改了封堵大小，机关大门跟着一起变**（尺寸共用）',
    `${found3[4]} vs ${-(ow + 12) / 2}`,
  );

  /** 门上没有封堵数据时，退回"门中点"，不会崩 */
  delete edge.blockade;
  const fallback = render(st, 's');
  ok(fallback.includes(GATE_SRC), '门上没有封堵数据时仍能画（退回门中点）');
}

/* ═══════════ ⑤ 校准工具：机关大门是只读预览 ═══════════ */
console.log('=== ⑤ 地图校准工具 ===');
{
  const app = readFileSync(new URL('../../tools/map-calibrate/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../tools/map-calibrate/index.html', import.meta.url), 'utf8');
  ok(app.includes('gateMarkAbs'), '工具里有机关大门预览');
  ok(app.includes('LEVER_GATE_SRC'), '预览用的是机关大门的图片');
  ok(app.includes('d.m.x + d.m.w / 2'), '**预览位置直接读那扇门的封堵坐标**（位置共用）');
  ok(!app.includes('map.gateMark'), '已经不再单独存机关大门的坐标了');
  ok(!app.includes("state.drag.type === 'gateMark'"), '机关大门不能单独拖（要调就调封堵）');
  ok(html.includes('id="showGates"'), '图层里能开关机关大门预览');
  ok(html.includes('和封堵共用同一个位置'), '提示里写清了"位置共用、调封堵就是调它"');
  ok(html.includes('firstAidKit'), '提示里写清了急救箱就是那个可拖的道具');
  ok(app.includes("t.kind !== 'blockade'"), '急救箱会和其它道具一样被命中、拖动（不用特判）');
}

console.log(`\n地图标记校准：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
