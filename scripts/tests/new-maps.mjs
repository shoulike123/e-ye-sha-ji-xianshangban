/** 验证三张新地图：schema 校验、特殊条件落位、编辑器可读 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const { loadContent } = await import('../../server/dist/content/loader.js');

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log('  OK  ', label, extra); }
  else { fail += 1; console.log('  FAIL', label, extra); }
};

console.log('=== ① 全部地图能被 loadContent 读进来 ===');
let content;
try {
  content = loadContent();
  ok(true, 'content 加载成功');
} catch (e) {
  ok(false, 'content 加载失败', e.message);
  process.exit(1);
}
console.log(`   地图列表：${content.maps.map((m) => `${m.name}(${m.id})`).join('、')}`);
ok(content.maps.length >= 5, '地图数 ≥ 5', `${content.maps.length}`);

console.log('\n=== ② 三张新图的规模 ===');
for (const id of ['laboratory', 'castle', 'crypt']) {
  const m = content.maps.find((x) => x.id === id);
  if (!m) { ok(false, `${id} 不存在`); continue; }
  const doors = m.edges.filter((e) => e.pathType === 'door').length;
  const dashes = m.edges.filter((e) => e.pathType === 'dash').length;
  console.log(`   ${m.name}：${m.rooms.length} 房间，${doors} 门 + ${dashes} 虚线，${(m.passages ?? []).length} 秘密通道，${(m.tokens ?? []).length} 标记`);
  ok(m.rooms.length >= 12, `${m.name} 房间数合理`, `${m.rooms.length}`);
  ok(Boolean(m.backgrounds?.survivor && m.backgrounds?.killer), `${m.name} 两张底图都有`);
  ok(m.rooms.every((r) => r.nameKiller === r.name), `${m.name} nameKiller 与 name 一致`);
  ok(m.rooms.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y)), `${m.name} 房间坐标都是数字`);
  /** 坐标必须在 viewBox 内 */
  const out = m.rooms.filter((r) => r.x < 0 || r.x > m.width || r.y < 0 || r.y > m.height);
  ok(out.length === 0, `${m.name} 坐标都在 1000×500 内`, out.map((r) => r.id).join(','));
}

console.log('\n=== ③ 特殊条件逐条核对 ===');
/** 用户给的设定 */
const SPEC = {
  laboratory: {
    name: '实验室',
    entrance: 'G1', hiddenExit: 'R1',
    searchable: ['R1', 'B1', 'G5'], repairable: ['B4'],
    book: 'B2', spiral: 'R2', hammer: 'R3',
    passages: [['B1', 'G1'], ['R2', 'B5']],
    extra: '急救地点 G3、无菌室 R4',
  },
  castle: {
    name: '城堡',
    entrance: 'G1', hiddenExit: 'R4',
    searchable: ['B1', 'R2', 'G5'], repairable: ['G2'],
    book: 'R5', spiral: 'B5', hammer: 'R3',
    passages: [['G1', 'B2'], ['G1', 'R5']],
    extra: '控制杆 R1、雕像长廊 B4',
  },
  crypt: {
    name: '墓穴',
    entrance: 'R3', hiddenExit: 'G1',
    /**
     * ⚠ **遗物室 R6 不是搜索地点**（用户明确："遗物室不是幸存者搜索地点！
     * 获得遗物是一种全新的获得牌的方式，与搜索不同"）。
     * 它的 tag 是 `special-relic`：幸存者在那里**搜不了物资**，
     * 但**女猎手布陷阱时可以选它**（见 `hunterTraps.regularTrapRooms`）。
     */
    searchable: ['G1', 'B5'], repairable: ['B1'],
    book: 'B4', spiral: 'G2', hammer: 'G4',
    passages: [['R3', 'B3'], ['G2', 'B3']],
    extra: '遗物地点 R6、坍塌地点 G5/G6/R4/R5',
  },
};

for (const [id, spec] of Object.entries(SPEC)) {
  console.log(`\n   —— ${spec.name}（${id}）——`);
  const m = content.maps.find((x) => x.id === id);
  if (!m) { ok(false, `${id} 不存在`); continue; }
  const has = (rid, tag) => m.rooms.find((r) => r.id === rid)?.tags.includes(tag) === true;
  const tagsOf = (tag) => m.rooms.filter((r) => r.tags.includes(tag)).map((r) => r.id).sort();

  ok(m.survivorStartRoomId === spec.entrance, `主要出口（幸存者起点）= ${spec.entrance}`, m.survivorStartRoomId);
  ok(has(spec.entrance, 'entrance'), `  ${spec.entrance} 有 entrance 标签`);
  ok(m.killerStartRoomId === spec.hiddenExit, `隐藏出口（杀手起点）= ${spec.hiddenExit}`, m.killerStartRoomId);
  ok(has(spec.hiddenExit, 'hiddenExit'), `  ${spec.hiddenExit} 有 hiddenExit 标签`);

  const sea = tagsOf('searchable');
  ok(
    JSON.stringify(sea) === JSON.stringify([...spec.searchable].sort()),
    `搜索地点 = ${spec.searchable.join('、')}`,
    `实际 ${sea.join('、')}`,
  );
  const rep = tagsOf('repairable');
  ok(JSON.stringify(rep) === JSON.stringify([...spec.repairable].sort()), `修理地点 = ${spec.repairable.join('、')}`, `实际 ${rep.join('、')}`);

  ok(tagsOf('special-book').join() === spec.book, `书本 = ${spec.book}`, tagsOf('special-book').join());
  ok(tagsOf('special-spiral').join() === spec.spiral, `螺旋 = ${spec.spiral}`, tagsOf('special-spiral').join());
  ok(tagsOf('special-hammer').join() === spec.hammer, `锤子 = ${spec.hammer}`, tagsOf('special-hammer').join());

  const ps = (m.passages ?? []).map((p) => [p.from, p.to].sort().join('-')).sort();
  const want = spec.passages.map((p) => [...p].sort().join('-')).sort();
  ok(JSON.stringify(ps) === JSON.stringify(want), `秘密通道 = ${spec.passages.map((p) => p.join('↔')).join('、')}`, `实际 ${ps.join('、')}`);

  console.log(`     地图特殊位置：${spec.extra}`);
  for (const rid of spec.extra.match(/[RBG]\d/g) ?? []) {
    ok(Boolean(m.rooms.find((r) => r.id === rid)), `  ${rid} 存在（特殊位置）`);
  }
}

console.log('\n=== ④ 墓穴的两个特殊点 ===');
{
  const m = content.maps.find((x) => x.id === 'crypt');
  ok(m.rooms.some((r) => r.id === 'R6'), '有 R6（遗物地点）');
  ok(m.rooms.some((r) => r.id === 'G6'), '有 G6（坍塌地点之一）');
  const sea = m.rooms.filter((r) => r.tags.includes('searchable')).map((r) => r.id);
  ok(sea.length === 2, '墓穴有 2 个常规搜索位', sea.join('、'));
  ok(!sea.includes('R6'), '**R6 遺物室不是搜索地点**（获得遗物和搜索是两回事）');
  ok(
    m.rooms.find((r) => r.id === 'R6')?.tags.includes('special-relic') === true,
    'R6 标的是 special-relic',
  );
  ok(m.rooms.length === 17, '房间数 17（R1-R6 + B1-B5 + G1-G6）', `${m.rooms.length}`);
}

console.log('\n=== ⑤ 边引用的房间都存在 & 没有自环 ===');
for (const m of content.maps) {
  const ids = new Set(m.rooms.map((r) => r.id));
  const bad = m.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to) || e.from === e.to);
  const dup = new Set();
  const dups = [];
  for (const e of m.edges) {
    const k = [e.from, e.to].sort().join('|');
    if (dup.has(k)) dups.push(k);
    dup.add(k);
  }
  ok(bad.length === 0, `${m.name}：边的房间都存在且无自环`, bad.map((e) => `${e.from}->${e.to}`).join(','));
  ok(dups.length === 0, `${m.name}：没有重复边`, dups.join(','));
}

console.log('\n=== ⑥ 狼人宝箱：每张图都落在四类特殊地点上 ===');
{
  /** 宝箱只该出现在这四类地点：书本 / 螺旋 / 锤子 / 隐藏出口 */
  const TAGS = ['special-book', 'special-spiral', 'special-hammer', 'hiddenExit'];
  const tagOf = (room) => TAGS.filter((t) => (room?.tags ?? []).includes(t)).join('+');
  for (const m of content.maps) {
    const specials = m.rooms.filter((r) => TAGS.some((t) => (r.tags ?? []).includes(t)));
    const chests = (m.tokens ?? []).filter((t) => t.kind === 'treasureChest');
    console.log(
      `   ${m.name}：特殊地点 ${specials.length} 个 [${specials.map((r) => `${r.id}=${tagOf(r)}`).join(' ')}]，宝箱 ${chests.length} 个 [${chests.map((c) => c.roomId).join(' ')}]`,
    );
    ok(specials.length === 4, `${m.name}：四类特殊地点各 1 个`, `${specials.length}`);
    ok(chests.length === 4, `${m.name}：4 个宝箱标记`, `${chests.length}`);

    /** 每个宝箱都必须落在一个**四类特殊地点**上 */
    const badRoom = chests.filter(
      (c) => !specials.some((r) => r.id === c.roomId),
    );
    ok(
      badRoom.length === 0,
      `${m.name}：宝箱都在四类特殊地点上（不会跑到别的地点）`,
      badRoom.map((c) => `${c.id}->${c.roomId}`).join(','),
    );

    /** 四个特殊地点各一个宝箱，不重不漏 */
    const chestRooms = chests.map((c) => c.roomId);
    ok(
      new Set(chestRooms).size === chestRooms.length,
      `${m.name}：没有两个宝箱在同一地点`,
      chestRooms.join(','),
    );
    ok(
      specials.every((r) => chestRooms.includes(r.id)),
      `${m.name}：四个特殊地点各有一个宝箱`,
      specials.map((r) => `${r.id}:${chestRooms.includes(r.id) ? '有' : '无'}`).join(' '),
    );

    /** label 里写的房间要和 roomId 对得上（免得看战报时对不上号） */
    const badLabel = chests.filter((c) => {
      const room = m.rooms.find((r) => r.id === c.roomId);
      return room && c.label && !c.label.includes(room.name);
    });
    ok(badLabel.length === 0, `${m.name}：宝箱标签写的是它所在的地点名`, badLabel.map((c) => c.label).join(','));
  }
}

console.log('\n=== ⑦ 服务端只认四类特殊地点上的宝箱（保险）===');
{
  const { createLobby, startGame, createPlayer } = await import('../../server/dist/game/engine.js');
  const { chestMarkers } = await import('../../server/dist/game/treasure.js');
  const survCharIds = content.characters.filter((c) => c.faction === 'survivor').map((c) => c.id);
  for (const m of content.maps) {
    const st = createLobby('T', 'h', 'H', content, m.id);
    st.mode = 'duo';
    const bs = createPlayer('s', 'S', 's');
    bs.faction = 'survivor';
    bs.ready = true;
    st.players = { h: st.players['h'], s: bs };
    st.players['h'].faction = 'killer';
    st.players['h'].characterId = 'killer1';
    st.players['h'].ready = true;
    st.hostId = 'h';
    st.soloSurvivorCharacterIds = survCharIds.slice(0, st.rules.maxSurvivors);
    startGame(st, content, 'h');
    const markers = chestMarkers(st);
    ok(markers.length === 4, `${m.name}：服务端认到 4 个宝箱`, `${markers.length}`);
    /** 故意把一个宝箱挪到非特殊地点，验证它会被忽略 */
    const first = (st.map.tokens ?? []).find((t) => t.kind === 'treasureChest');
    const badRoom = m.rooms.find((r) => !['special-book', 'special-spiral', 'special-hammer', 'hiddenExit']
      .some((t) => (r.tags ?? []).includes(t)));
    if (first && badRoom) {
      const keep = first.roomId;
      first.roomId = badRoom.id;
      ok(
        chestMarkers(st).length === 3,
        `${m.name}：写到非特殊地点的宝箱会被忽略（保险生效）`,
        `${chestMarkers(st).length}`,
      );
      first.roomId = keep;
    }
  }
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
