/**
 * 生成三张新地图的 JSON 骨架：实验室 / 城堡 / 墓穴。
 *
 * 做法：以**豪宅**为模板（用户指定的标准），
 *  - 换掉 id / name / backgrounds / 起点 / rooms / edges / passages
 *  - **沿用**豪宅的 zones（牌堆/救援轨等界面区）、tokens（修理点/警车/封堵/宝箱/陷阱零件）
 *    的坐标 —— 这些在右侧/周边的界面位，三张图用的是同一套版面，落在图上大致对得上，
 *    之后用 tools/map-calibrate 微调
 *  - 门的 `blockade` 坐标：按每条边的两端房间坐标插值算出来，先把位置放对，
 *    再让编辑器精调
 *
 * 房间坐标是按 1000×500 的 viewBox 估的（从图上的房间名标签读出来），
 * 精度约 ±10，属于"能看、能开、能玩"的起点，需要校准时在编辑器里微调。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const mansion = JSON.parse(readFileSync('content/maps/mansion.json', 'utf8'));

/** 编辑器资产里可用的图标（用来填 token 的 src） */
const assets = (() => {
  try {
    const dir = 'Image/UI';
    return readdirSync(dir);
  } catch {
    return [];
  }
})();

/** 找个存在的图标文件，找不到就退回豪宅里同 kind 的那个 src */
function srcFor(kind, fallbackId) {
  const want = { repair: '修理', blockade: '封堵', rescue: '警车', treasureChest: '宝箱', trapPart: '陷阱' }[kind];
  if (want) {
    const hit = assets.find((f) => f.includes(want));
    if (hit) return `/Image/UI/${hit}`;
  }
  const t = (mansion.tokens ?? []).find((x) => x.id === fallbackId) ?? (mansion.tokens ?? []).find((x) => x.kind === kind);
  return t?.src ?? '/Image/UI/修理.png';
}

/* ---------------------------------------------------------------- 地图定义 ---- */
/**
 * 每张图：rooms（id / name / x / y / tags）、edges（相邻关系）、
 * starts（幸存者起点 / 杀手起点）、passages（秘密通道）。
 *
 * tags 含义（和豪宅/小屋一致）：
 *   entrance 主要出口 / hiddenExit 隐藏出口 / searchable 搜索点 / repairable 修理点
 *   special-book 书本 / special-spiral 螺旋 / special-hammer 锤子 / special-fork 手提箱
 */
const MAPS = [
  {
    id: 'laboratory',
    name: '实验室',
    backgrounds: { survivor: '/Image/Maps/幸存者3.jpg', killer: '/Image/Maps/杀手3.jpg' },
    survivorStartRoomId: 'G1',
    killerStartRoomId: 'R1',
    rooms: [
      { id: 'G1', name: '電梯大廳', x: 705, y: 470, tags: ['entrance'] },
      { id: 'R1', name: '生化實驗室', x: 222, y: 139, tags: ['hiddenExit', 'searchable'] },
      { id: 'R2', name: '古代隧道', x: 272, y: 319, tags: ['special-spiral'] },
      { id: 'R3', name: '廢棄礦坑', x: 248, y: 493, tags: ['special-hammer'] },
      { id: 'R4', name: '無菌室', x: 417, y: 127, tags: [] },
      { id: 'R5', name: '寵物通風口', x: 708, y: 106, tags: [] },
      { id: 'B1', name: '主實驗室', x: 404, y: 396, tags: ['searchable'] },
      { id: 'B2', name: '檔案室', x: 589, y: 279, tags: ['special-book'] },
      { id: 'B3', name: '辦公室', x: 594, y: 396, tags: [] },
      { id: 'B4', name: '發電機室', x: 503, y: 490, tags: ['repairable'] },
      { id: 'B5', name: '石頭房間', x: 700, y: 491, tags: [] },
      { id: 'G2', name: '守衛室', x: 700, y: 396, tags: [] },
      { id: 'G3', name: '急救室', x: 830, y: 397, tags: [] },
      { id: 'G4', name: '寵物通風口', x: 812, y: 246, tags: [] },
      { id: 'G5', name: '休息室', x: 812, y: 106, tags: ['searchable'] },
    ],
    /** 相接关系（门 / 虚线） */
    edges: [
      ['R1', 'R2'], ['R1', 'R4'], ['R1', 'B1'],
      ['R2', 'B1'], ['R2', 'R3'], ['R2', 'B5'],
      ['R3', 'B4'], ['R3', 'B1'],
      ['R4', 'B1'], ['R4', 'R5'],
      ['R5', 'G5'], ['R5', 'G4'],
      ['B1', 'B2'], ['B1', 'B3'], ['B1', 'B4'],
      ['B2', 'B3'], ['B2', 'G4'],
      ['B3', 'B5'], ['B3', 'G2'], ['B3', 'G3'],
      ['B4', 'B5'], ['B4', 'G1'],
      ['B5', 'G1'], ['B5', 'G2'],
      ['G1', 'G2'],
      ['G3', 'G4'],
    ],
    /** 特殊通道（虚线通道，不进门的封堵统计） */
    passages: [['B1', 'G1'], ['R2', 'B5']],
  },
  {
    id: 'castle',
    name: '城堡',
    backgrounds: { survivor: '/Image/Maps/幸存者4.jpg', killer: '/Image/Maps/杀手4.jpg' },
    survivorStartRoomId: 'G1',
    killerStartRoomId: 'R4',
    rooms: [
      { id: 'G1', name: '廣場', x: 566, y: 495, tags: ['entrance'] },
      { id: 'R1', name: '監視室', x: 337, y: 219, tags: [] },
      { id: 'R2', name: '軍械庫', x: 494, y: 230, tags: ['searchable'] },
      { id: 'R3', name: '廁所', x: 677, y: 146, tags: ['special-hammer'] },
      { id: 'R4', name: '廚房', x: 813, y: 146, tags: ['hiddenExit'] },
      { id: 'R5', name: '骨灰龕', x: 813, y: 359, tags: ['special-book'] },
      { id: 'B1', name: '地窖', x: 169, y: 495, tags: ['searchable'] },
      { id: 'B2', name: '西側走廊', x: 213, y: 342, tags: [] },
      { id: 'B3', name: '溫室', x: 250, y: 106, tags: [] },
      { id: 'B4', name: '雕像長廊', x: 435, y: 311, tags: [] },
      { id: 'B5', name: '入口', x: 609, y: 311, tags: ['special-spiral'] },
      { id: 'G2', name: '室外庭園', x: 361, y: 491, tags: ['repairable'] },
      { id: 'G3', name: '吊橋', x: 492, y: 389, tags: [] },
      { id: 'G4', name: '花園', x: 798, y: 491, tags: [] },
      { id: 'G5', name: '酒窖', x: 901, y: 491, tags: ['searchable'] },
    ],
    edges: [
      ['B3', 'R1'], ['B3', 'R2'],
      ['R1', 'R2'], ['R1', 'B2'],
      ['R2', 'R3'], ['R2', 'B5'],
      ['R3', 'R4'], ['R3', 'R5'],
      ['R4', 'G5'], ['R5', 'G5'],
      ['B2', 'B1'], ['B2', 'B4'],
      ['B4', 'B5'], ['B4', 'B1'], ['B4', 'G2'], ['B4', 'G3'],
      ['B5', 'G3'], ['B5', 'G4'],
      ['G2', 'G1'], ['G2', 'G3'],
      ['G3', 'G1'], ['G3', 'G4'],
      ['G4', 'G5'], ['G4', 'G1'],
      ['B1', 'G2'],
      ['G1', 'G5'],
    ],
    passages: [['G1', 'B2'], ['G1', 'R5']],
  },
  {
    id: 'crypt',
    name: '墓穴',
    backgrounds: { survivor: '/Image/Maps/幸存者5.png', killer: '/Image/Maps/杀手5.png' },
    survivorStartRoomId: 'R3',
    killerStartRoomId: 'G1',
    rooms: [
      { id: 'R3', name: '尸房', x: 810, y: 494, tags: ['entrance'] },
      { id: 'R1', name: '考古學墓地', x: 763, y: 158, tags: [] },
      { id: 'R2', name: '糧倉', x: 810, y: 317, tags: [] },
      { id: 'R4', name: '通道B', x: 668, y: 483, tags: [] },
      { id: 'R5', name: '通道A', x: 668, y: 290, tags: [] },
      { id: 'R6', name: '遺物室', x: 718, y: 225, tags: [] },
      { id: 'B1', name: '地下金庫', x: 505, y: 84, tags: ['repairable'] },
      { id: 'B2', name: '祈禱室', x: 505, y: 169, tags: [] },
      { id: 'B3', name: '中庭', x: 505, y: 300, tags: [] },
      { id: 'B4', name: '澡堂', x: 505, y: 434, tags: ['special-book'] },
      { id: 'B5', name: '多柱大廳', x: 505, y: 494, tags: ['searchable'] },
      { id: 'G1', name: '葬禮堂', x: 217, y: 147, tags: ['hiddenExit', 'searchable'] },
      { id: 'G2', name: '儀式堂', x: 199, y: 306, tags: ['special-spiral'] },
      { id: 'G3', name: '泉/湖', x: 299, y: 473, tags: [] },
      { id: 'G4', name: '墳地區', x: 394, y: 386, tags: ['special-hammer'] },
      { id: 'G5', name: '通道C', x: 357, y: 290, tags: [] },
      { id: 'G6', name: '通道D', x: 347, y: 106, tags: [] },
    ],
    edges: [
      ['G1', 'G6'], ['G1', 'G2'],
      ['G6', 'B1'],
      ['B1', 'B2'], ['B2', 'R1'], ['B2', 'R6'],
      ['R1', 'R6'],
      ['R6', 'R5'], ['R5', 'R2'], ['R6', 'B3'],
      ['R5', 'B3'], ['R2', 'R3'], ['R2', 'R4'], ['R2', 'B3'],
      ['R3', 'R4'], ['R4', 'B5'], ['R4', 'R5'],
      ['B3', 'B4'], ['B3', 'G5'], ['B3', 'G4'],
      ['G2', 'G5'], ['G5', 'G4'], ['G4', 'G3'],
      ['G3', 'B4'], ['G4', 'B4'], ['B4', 'B5'],
      ['G2', 'B1'], ['B5', 'G3'],
    ],
    passages: [['R3', 'B3'], ['G2', 'B3']],
  },
];

/* ------------------------------------------------------------- 生成 JSON ---- */
/** 门/虚线：豪宅里 pathType 只有 door / dash 两种 */
function edgeType(from, to, passages) {
  const isPassage = passages.some(
    ([a, b]) => (a === from && b === to) || (a === to && b === from),
  );
  return isPassage ? 'dash' : 'door';
}

/** 门的封堵坐标：取两房间连线的中点，按门宽摆正 */
function blockadeAt(ra, rb) {
  const midX = (ra.x + rb.x) / 2;
  const midY = (ra.y + rb.y) / 2;
  const horizontal = Math.abs(ra.y - rb.y) < 6;   // 大致同一水平 → 门是竖着的
  const w = horizontal ? 22.2 : 44.5;
  const h = horizontal ? 44.5 : 22.2;
  const rotation = horizontal ? 90 : 0;
  return {
    survivor: { x: round1(midX - w / 2), y: round1(midY - h / 2), w, h, rotation },
    killer: {
      x: round1(midX - w / 2 - 1),
      y: round1(midY - h / 2 - 2),
      w: round1(w * 1.13),
      h: round1(h * 1.13),
      rotation,
    },
  };
}
const round1 = (n) => Math.round(n * 10) / 10;

function buildMap(def) {
  const roomById = Object.fromEntries(def.rooms.map((r) => [r.id, r]));
  const edges = def.edges.map(([from, to]) => {
    const type = edgeType(from, to, def.passages);
    const e = { from, to, bidirectional: true, pathType: type };
    if (type === 'door') e.blockade = blockadeAt(roomById[from], roomById[to]);
    return e;
  });
  /** 秘密通道：和豪宅一样放进 passages（不是 edges） */
  const passages = def.passages.map(([from, to]) => ({ from, to, bidirectional: true }));
  return {
    id: def.id,
    name: def.name,
    width: 1000,
    height: 500,
    backgrounds: def.backgrounds,
    rooms: def.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      nameKiller: r.name,
      x: r.x,
      y: r.y,
      tags: r.tags,
    })),
    edges,
    passages,
    zones: JSON.parse(JSON.stringify(mansion.zones)),
    tokens: mapTokens(def),
    survivorStartRoomId: def.survivorStartRoomId,
    killerStartRoomId: def.killerStartRoomId,
  };
}

/**
 * 宝箱该放在哪几个地点：**书本 / 螺旋 / 锤子 / 隐藏出口**这四类特殊地点，
 * 每张图各一个（每张图正好都有这 4 个特殊地点）。
 *
 * ⚠ 以前这里是**直接抄豪宅的 tokens** —— 于是实验室/城堡/墓穴的宝箱挂着
 * 豪宅的房间号（G5 花园 / R4 休息室 / G3 棚屋 / G2 墓地），而这三张图根本
 * 没有 G5、名字也不一样，宝箱就"加载在错误的地点"了。
 */
const CHEST_TAGS = ['special-book', 'special-spiral', 'special-hammer', 'hiddenExit'];

/** 宝箱图标相对房间圆心的偏移（放在圆圈右上角外侧，不压住房间名） */
const CHEST_OFFSET = { dx: 34, dy: -34 };
/** 宝箱图标尺寸（和 `Image/.../宝藏_宝箱.png` 的比例一致，正方形） */
const CHEST_SIZE = 38;

/** 找出这张图上四类特殊地点，按固定顺序返回（书本 → 螺旋 → 锤子 → 隐藏出口） */
function specialRooms(def) {
  const out = [];
  for (const tag of CHEST_TAGS) {
    const hit = def.rooms.find((r) => (r.tags ?? []).includes(tag));
    if (hit) out.push({ room: hit, tag });
  }
  return out;
}

/**
 * 生成这张图的 tokens：沿用水豪宅的修理点 / 警车 / 陷阱零件等界面标记，
 * 但**宝箱按上面那 4 个特殊地点重算坐标与 `roomId`**。
 */
function mapTokens(def) {
  const chests = specialRooms(def);
  let chestIndex = 0;
  return JSON.parse(JSON.stringify(mansion.tokens)).map((t) => {
    const out = { ...t, src: srcFor(t.kind, t.id) };
    if (t.kind !== 'treasureChest') return out;
    const hit = chests[chestIndex];
    chestIndex += 1;
    if (!hit) return out;
    const cx = hit.room.x + CHEST_OFFSET.dx;
    const cy = hit.room.y + CHEST_OFFSET.dy;
    out.x = round1(cx - CHEST_SIZE / 2);
    out.y = round1(cy - CHEST_SIZE / 2);
    out.w = CHEST_SIZE;
    out.h = CHEST_SIZE;
    out.roomId = hit.room.id;
    out.label = `宝箱（${hit.room.id} ${hit.room.name}）`;
    return out;
  });
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

for (const def of MAPS) {
  const json = buildMap(def);
  const path = `content/maps/${def.id}.json`;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  const doors = json.edges.filter((e) => e.pathType === 'door').length;
  const dashes = json.edges.filter((e) => e.pathType === 'dash').length;
  console.log(`已生成 ${path}`);
  console.log(`   ${json.name}：${json.rooms.length} 房间，${doors} 门 + ${dashes} 虚线，${json.passages.length} 秘密通道，${json.tokens.length} 标记，${json.zones.length} 界面区`);
}
