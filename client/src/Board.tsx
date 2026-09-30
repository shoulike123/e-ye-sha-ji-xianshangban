/**
 * 桌子中间那张大地图。
 * 负责画房间、人偶、封堵、响声、修理点、能走的格子高亮。
 * 点房间 = 告诉外面“玩家点了这个房间”（移动或选地点）。
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BlockadeMark, CardDef, Faction, MapDef, MapEdge, MapZone, PublicPlayerView, RoomDef } from './types';
import { killerArtFor, killerStandeeSrc, killerStatueSrc } from './killerArt';
import { survivorArtFor, survivorStandeeSrc, skillCardSrc } from './survivorArt';
import { cardArtSrc, itemArtSrc } from './cardArt';
import { UI } from './uiAssets';
import type { PileKind } from './PileInspect';

interface BoardPlayer extends PublicPlayerView {
  placed?: boolean;
}

interface BoardProps {
  map: MapDef;
  players: BoardPlayer[];
  youId: string;
  viewerFaction: Faction | null;
  legalMoves: string[];
  highlightRoomIds?: string[];
  firecrackerRoomId?: string | null;
  suitcaseAvailable?: boolean;
  noises: string[];
  blockades?: string[];
  previewPath?: string[];
  repairProgress?: number;
  showRepair?: boolean;
  repairGuessable?: boolean;
  onRepairGuess?: (value: number) => void;
  onSkillClick?: (src: string, caption: string) => void;
  stealthRoomId?: string | null;
  trapRoomIds?: string[];
  /**
   * 【女猎手】开局布置陷阱时**可以放的位置** —— 这些地点画**白色的圈**，
   * 方便一眼看出"这几个地方能放"。四个都放完之后服务端就不再下发，
   * 圈自动变回平时的黄色（用户要求）。
   */
  trapSpotRooms?: string[];
  /**
   * 【雕像・停滞】幸存者**正在选要停滞哪尊雕像**。
   * 这时地图上可选的雕像立绘会**上下浮动**（用户要求：
   * 「选择被停滞的雕像时那个雕像立绘要呈浮动状态」）。
   */
  statueHaltPickable?: boolean;
  rescueArmed?: boolean;
  rescueCountdown?: number | null;
  onRoomClick: (roomId: string) => void;
  pileCounts?: {
    search: number;
    discovery: number;
    treasure: number;
    /** 【墓穴 R6】遗物牌堆 */
    relic: number;
    discard: number;
  };
  pileCards?: {
    search: Array<{ id: string; name: string }>;
    discovery: Array<{ id: string; name: string }>;
    treasure: Array<{ id: string; name: string }>;
    /** 【墓穴 R6】遗物牌堆 */
    relic: Array<{ id: string; name: string }>;
    discard: Array<{ id: string; name: string }>;
  };
  pileTops?: {
    search: { id: string; name: string } | null;
    discovery: { id: string; name: string } | null;
    treasure: { id: string; name: string } | null;
    /** 【墓穴 R6】遗物牌堆 */
    relic: { id: string; name: string } | null;
    discard: { id: string; name: string } | null;
  };
  cardById?: Record<string, CardDef>;
  pickableSurvivorIds?: string[];
  selectedSurvivorId?: string | null;
  activePlayerId?: string | null;
  onSurvivorClick?: (playerId: string) => void;
  onPileClick?: (kind: PileKind) => void;
  turnOrder?: string[];
  /** 同队幸存者正在预选的地点（1对2 / 1对3 互看鼠标预选） */
  remoteCursors?: Array<{ playerId: string; roomId: string }>;
  /** 鼠标移到某一格（null = 移出地图），用来把预选位置报给同队 */
  onRoomHover?: (roomId: string | null) => void;
  /** 雕像杀手：4 个雕像棋子（用立绘1–4 分别渲染） */
  statues?: Array<{
    id: string;
    index: number;
    roomId: string | null;
    main: boolean;
    halted: boolean;
    /**
     * 幸存者猜测：猜这尊雕像的**操控者颜色槽位**（只有幸存者视角才有）。
     */
    guesserSlots?: number[];
  }>;
  /** 雕像杀手：点击地图上的雕像立绘（选主雕像 / 幸存者猜测） */
  onStatueClick?: (statueId: string) => void;
  /** 雕像杀手：双击地图上的雕像立绘（幸存者猜主雕像） */
  onStatueDoubleClick?: (statueId: string) => void;
  /** 雕像立绘变体要靠杀手角色 id / 名字去找 */
  killerCharacterId?: string | null;
  killerCharacterName?: string | null;
  /** 狼人宝藏：还没开的宝箱 id（开过的图标消失，只在幸存者地图显示） */
  treasureChests?: string[];
  /**
   * 杀手视角的「目击立绘」：幸存者上次被〔感知〕目击时在哪。
   * 只有杀手视角有值；幸存者侧不传。
   */
  witnessedAt?: Record<string, string>;
  /** 女猎手猎手陷阱：标记 id / 是否移除 / 陷阱类型（幸存者视角 kind=null） */
  hunterTraps?: Array<{
    id: string;
    roomId: string;
    removed: boolean;
    kind: string | null;
    revealed: boolean;
  }>;
  /**
   * 【陷阱零件】使用后留下标记的地点（只有幸存者看得到）。
   * 画在**圆心下方**。
   */
  trapPartRooms?: string[];
  /**
   * 【扼杀者核心标记】每个房间有几个（房间 id → 数量）。
   * 画在**圆心上方**，一个地点可以有多个；双方地图都显示。
   */
  coreMarkers?: string[];
  /**
   * 【女王僵尸】地图上的僵尸棋子（不是杀手棋子）。
   * 一个地点可以有多个；立绘按 `art`（1..3）取，3 张循环复用。
   */
  zombies?: Array<{ id: string; roomId: string; art: number; power: number }>;
  /** 地图标记相对圆心的位移（跟着圆圈走，不在地图上摆绝对位置） */
  markerOffsets?: {
    hunterTrap: { dx: number; dy: number; size: number };
    trapPart: { dx: number; dy: number; size: number };
    coreMarker: { dx: number; dy: number; size: number };
    zombie: { dx: number; dy: number; size: number };
  };
  /** 已〔中毒〕的幸存者 id（立绘右上角显示中毒标记） */
  poisoned?: string[];
  /**
   * 当前遭遇的地点（没有遭遇就是 null）。
   * 杀手视角的右键菜单**只在遭遇期间列幸存者** —— 其他时候不该知道谁在哪。
   */
  encounterRoomId?: string | null;
  /**
   * 【城堡】场上的**机关大门**门号（`"A|B"`）。画在那扇门的中间，双方都看得到。
   * 一根竖着的金属闸门，和横着的木条封堵形状相反，不会认错。
   */
  leverGateDoorId?: string | null;
  /**
   * 【实验室】急救箱标记还在不在 / 在哪个房间。
   * 还在就在那个房间画一个急救箱图标（跟着圆心摆）。
   */
  firstAidKit?: boolean;
  firstAidRoomId?: string | null;
  /**
   * 【墓穴】已经坍塌的地点。塌了的地点在地图上盖一块**坍塌板块**
   * （位置/尺寸/旋转都从 `map.collapsedMarks` 读，可在编辑界面调）。
   */
  collapsedRooms?: string[];
  /** 【墓穴 R6】遗物标记是否正面朝上（正面 = 可抽遗物） */
  relicMarkerFaceUp?: boolean;
}

/** 扼杀者核心标记图标 */
const killerCoreMarkerSrc = '/Image/Killers/杀手八_扼杀者/核心标记.png';

/** 女王僵尸立绘（3 张循环复用） */
const ZOMBIE_ART_SRC = [
  '/Image/Killers/杀手九_女王/僵尸1.png',
  '/Image/Killers/杀手九_女王/僵尸2.png',
  '/Image/Killers/杀手九_女王/僵尸3.png',
];

/** 每张僵尸图的宽高比（宽/高），用来按立绘高度算宽度 */
const ZOMBIE_ASPECT = [445 / 713, 474 / 870, 472 / 883];


/** 猎手陷阱图标：null = 未揭晓（问号） */
function hunterTrapIcon(kind: string | null | undefined): string {
  const base = '/Image/Killers/杀手四_女猎手/猎手陷阱_';
  if (kind === 'bear') return `${base}捕熊.png`;
  if (kind === 'bone') return `${base}白骨.png`;
  if (kind === 'net') return `${base}捕网.png`;
  return `${base}未知.png`;
}

/** 猎手陷阱类型的中文名（右键菜单用） */
const HUNTER_TRAP_LABEL: Record<string, string> = {
  bear: '捕熊陷阱',
  bone: '白骨陷阱',
  net: '捕网陷阱',
};

/** 右键菜单的一行 */
export interface RoomMenuRow {
  key: string;
  text: string;
}

/** 算右键菜单内容需要的输入（都取自 Board 的 props / state） */
export interface RoomMenuInput {
  roomId: string;
  viewerFaction: Faction | null;
  /** 与地图立绘同一套判定后，**站在这个地点**的棋子（杀手视角下幸存者按"目击位置"） */
  occupantsHere: Array<{ name: string; faction: Faction | null; statueIndex?: number | null }>;
  /**
   * 这个地点上**该不该列幸存者**。
   *
   *  - 幸存者视角：就是自己人，照列。
   *  - 杀手视角：**只有遭遇期间才列** —— 其他时候杀手根本不该知道谁在哪。
   *    就算他以前〔感知〕目击过（`witnessedAt` 里会有立绘），菜单也不列。
   */
  survivorsVisible: boolean;
  /**
   * 这个地点上的**雕像**（雕像杀手有 4 尊，双方地图都看得到）。
   *
   * 它们不按"杀手（名称）×N"合并 —— 要**一尊一行**列出来，
   * 并且杀手视角下给主雕像标上「（主）」。
   * 雕像局里原始杀手棋子（没有 `statueIndex` 的那条）要由调用方排除掉，否则会重复。
   */
  statuesHere?: Array<{ index: number; main: boolean }>;
  /**
   * 这个地点的**遗留物**（【分头行动】：逃脱/被杀的幸存者立绘都留在原地变暗）。
   * 用户要求：「右键地点**只需要看幸存者名字**就行了，不用看钥匙」——
   * 所以这里只给名字 + 死活状态，钥匙数在**物品栏上方**的【持有钥匙】里看。
   * 它**不受 `survivorsVisible` 限制** —— 立绘双方都画出来了，位置本来就是公开的。
   *
   * ⚠ 只有**被杀**的人才有东西可拿；**逃脱**的人身上已清零（自己带走了）。
   */
  downedHere?: Array<{ name: string; escaped?: boolean }>;
  zombieCount: number;
  coreCount: number;
  treasureHere: boolean;
  trapPartHere: boolean;
  firecrackerHere: boolean;
  noiseHere: boolean;
  /**
   * 这个地点的猎手陷阱（已移除的会被过滤掉）。
   * `kind` 在幸存者视角下是 null（问号）—— 只有杀手知道具体是什么陷阱。
   */
  hunterTraps: Array<{ kind: string | null; revealed: boolean }>;
}

/**
 * 右键菜单的**内容**：从上往下依次为
 * 杀手 → **雕像** → 幸存者 → 僵尸 → 核心标记 → 猎手陷阱 → 宝箱 → 陷阱标记 → 响声/爆竹标记。
 *
 * 规则：
 *  - 没有的**不列**，只列有的。
 *  - 同一种东西有多份显示 `名称×个数`；僵尸、核心标记这种没有名字的只显示 `×个数`。
 *  - **杀手视角只在遭遇期间列幸存者**（见 `survivorsVisible`）。
 *  - **雕像**（雕像杀手的 4 尊）排在**杀手与幸存者之间**：双方都列，**一尊一行**；
 *    杀手视角下主雕像标「（主）」—— 幸存者要靠猜，所以不告诉他哪尊是主。
 *  - **猎手陷阱**：杀手视角显示具体陷阱（捕网 / 白骨 / 捕熊）；
 *    幸存者视角一律只显示「猎手陷阱」—— 陷阱触发后就消失了，
 *    所以不存在"已经知道类型"的情况，不需要区分 revealed。
 *  - **陷阱标记**（【陷阱零件】留下的）只有幸存者可见。
 *  - **响声 / 爆竹标记**跟着双方的可见性走（`noises` / `firecrackerRoomId`
 *    这两个 prop 本身已经按阶段和视角过滤过）。
 */
export function roomMenuRowsFor(input: RoomMenuInput): RoomMenuRow[] {
  const rows: RoomMenuRow[] = [];
  const {
    viewerFaction, occupantsHere, survivorsVisible, statuesHere = [],
    zombieCount, coreCount,
    treasureHere, trapPartHere, firecrackerHere, noiseHere, hunterTraps,
  } = input;

  /** 把一个阵营的棋子合并成「杀手（名称）」「幸存者（名称）」若干行 */
  const pushFactionRows = (faction: 'killer' | 'survivor') => {
    if (faction === 'survivor' && !survivorsVisible) return;
    const counts = new Map<string, number>();
    for (const p of occupantsHere) {
      if (p.faction !== faction) continue;
      if (!p.name) continue;
      /** 雕像棋子由 `statuesHere` 单独逐尊列，不在这里合并 */
      if (p.statueIndex != null) continue;
      counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    }
    for (const [name, n] of counts) {
      rows.push({
        key: `${faction}-${name}`,
        text: `${faction === 'killer' ? '杀手' : '幸存者'}（${name}）${n > 1 ? `×${n}` : ''}`,
      });
    }
  };

  /** ① 杀手 */
  pushFactionRows('killer');
  /**
   * ② 雕像：一尊一行，按编号排序。**排在杀手与幸存者之间**。
   * 主雕像的「（主）」只有**杀手视角**才有 —— 幸存者的玩法就是猜哪尊是主雕像。
   */
  for (const st of [...statuesHere].sort((a, b) => a.index - b.index)) {
    rows.push({
      key: `statue-${st.index}`,
      text: `雕像 ${st.index}${viewerFaction === 'killer' && st.main ? '（主）' : ''}`,
    });
  }
  /** ③ 幸存者 */
  pushFactionRows('survivor');

  /**
   * ③.5 【分头行动】**这个地点的遗留物**：逃脱/被杀的人。
   *
   * ⚠ 用户要求「右键地点**只需要看幸存者名字**就行了，不用看钥匙」——
   * 钥匙数在**物品栏上方**的【持有钥匙】里看，右键菜单不重复。
   */
  for (const d of input.downedHere ?? []) {
    rows.push({
      key: `downed-${d.name}`,
      text: `${d.name}（${d.escaped ? '已逃脱' : '已倒下'}）`,
    });
  }

  if (zombieCount > 0) rows.push({ key: 'zombie', text: `僵尸×${zombieCount}` });
  if (coreCount > 0) rows.push({ key: 'core', text: `核心标记×${coreCount}` });


  if (hunterTraps.length > 0) {
    if (viewerFaction === 'killer') {
      /** 杀手：按类型分开列，同类型合并计数 */
      const byKind = new Map<string, number>();
      for (const t of hunterTraps) {
        const label = HUNTER_TRAP_LABEL[t.kind ?? ''] ?? '猎手陷阱';
        byKind.set(label, (byKind.get(label) ?? 0) + 1);
      }
      for (const [label, n] of byKind) {
        rows.push({ key: `trap-${label}`, text: `${label}${n > 1 ? `×${n}` : ''}` });
      }
    } else {
      /** 幸存者：只知道"这里有猎手陷阱"，不知道是哪种 */
      const n = hunterTraps.length;
      rows.push({ key: 'trap-unknown', text: `猎手陷阱${n > 1 ? `×${n}` : ''}` });
    }
  }

  if (treasureHere) rows.push({ key: 'chest', text: '宝箱' });
  /** 陷阱标记 = 【陷阱零件】留下的（**只有幸存者可见**；杀手侧该数据本身为空） */
  if (trapPartHere) rows.push({ key: 'trapPart', text: '陷阱标记' });
  /** 爆竹标记优先于响声标记：爆竹回合全场都有响声，位置上只留爆竹标记 */
  if (firecrackerHere) rows.push({ key: 'firecracker', text: '爆竹标记' });
  else if (noiseHere) rows.push({ key: 'noise', text: '响声标记' });

  return rows;
}

const OVERLAY_ZONE_IDS = new Set([  'search',
  'discovery',
  'treasure',
  'relic',
  'discard',
  'skill1',
  'skill2',
  'skill3',
]);

function doorKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isDoorPath(pathType?: string) {
  return !pathType || pathType === 'door';
}

function blockadeMarkFor(edge: MapEdge, faction: Faction | null): BlockadeMark | undefined {
  const side = faction === 'killer' ? 'killer' : 'survivor';
  return edge.blockade?.[side];
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 同队共享预选时，按存活幸存者顺序分配颜色（和座位色一致） */
const CURSOR_COLORS = ['#f0c14b', '#6fd3ff', '#8ce06a', '#ff8f6f', '#c79bff'];

function cursorColor(index: number) {
  if (index < 0) return CURSOR_COLORS[0]!;
  return CURSOR_COLORS[index % CURSOR_COLORS.length]!;
}

/**
 * 一个地点是不是"特殊地点"，是的话返回要标在名字后面的括号内容。
 *
 * 用户指定的清单（**只看这几个**，别的 tag 不列）：
 *   主要出口 / 隐藏出口 / 搜索地点 / 修理地点 /
 *   秘密通道1 / 秘密通道2 / 书本地点 / 螺旋地点 / 锤子地点
 *
 * 例：豪宅 B1 → `修理地点，秘密通道1`（它是 `repairable`，
 * 又是 `map.passages` 里第 1 条秘密通道的端点）。
 *
 * ⚠ 额外的 tag（小屋里那把铁叉 `special-fork`、墓穴遗物室 `special-relic`）
 * **不列** —— 用户明确"只看这几个"。
 */
export function roomSpecialLabels(map: MapDef, room: RoomDef): string[] {
  const tags = room.tags ?? [];
  const out: string[] = [];
  if (room.id === map.survivorStartRoomId || tags.includes('entrance')) out.push('主要出口');
  if (room.id === map.killerStartRoomId || tags.includes('hiddenExit')) out.push('隐藏出口');
  if (tags.includes('searchable')) out.push('搜索地点');
  if (tags.includes('repairable')) out.push('修理地点');
  /** 秘密通道：按它在 `map.passages` 里的**第几条**编号（1 起） */
  (map.passages ?? []).forEach((p, i) => {
    if (p.from === room.id || p.to === room.id) out.push(`秘密通道${i + 1}`);
  });
  if (tags.includes('special-book')) out.push('书本地点');
  if (tags.includes('special-spiral')) out.push('螺旋地点');
  if (tags.includes('special-hammer')) out.push('锤子地点');
  return out;
}

/** 右键菜单第一行：`B1 起居室（修理地点，秘密通道1）` */
export function roomMenuTitle(map: MapDef, room: RoomDef, name: string): string {
  const marks = roomSpecialLabels(map, room);
  const base = `${room.id} ${name}`;
  return marks.length ? `${base}（${marks.join('，')}）` : base;
}

function zoneVisible(zone: Pick<MapZone, 'side'>, faction: Faction | null) {
  const side = zone.side ?? 'survivor';
  if (side === 'both') return true;
  if (faction === 'killer') return side === 'killer';
  return side === 'survivor';
}

/**
 * 雕像局里那个**原始杀手棋子**（没有 `statueIndex`）—— 它在图上**不画任何立绘**。
 *
 * 4 尊雕像（`state.statues`）已经把杀手整个表现完了；原始那条要是也画，
 * 地图上就会多出一尊立绘（用户报的"出现了 5 个雕像"）。
 * 判据用快照的 `statues`：服务端造雕像时 id 就是 `${原始id}__statueN`，
 * 比按名字猜稳。
 */
function isGhostKillerPiece(
  p: { id: string; faction: Faction | null; statueIndex?: number | null },
  statues: Array<{ id: string; index: number }> | undefined,
): boolean {
  if (p.faction !== 'killer' || p.statueIndex != null) return false;
  if (!(statues ?? []).length) return false;
  return (statues ?? []).some((s) => s.id === `${p.id}__statue${s.index}`);
}

function tokenRescueStep(id: string): number | null {
  const m = /^rescue(\d+)/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 幸存者 repair1…5；杀手地图猜测齿轮 krepair1…5 */
function tokenRepairStep(id: string): number | null {
  const m = /^(?:k)?repair(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function isKillerRepairToken(t: { id: string; side?: string }) {
  return t.id.startsWith('krepair') || t.side === 'killer';
}

/**
 * 翻面标记：`src` + `srcBack` 两张图，按状态选一张。
 *
 * 目前两处用：
 *  - 墓穴**遗物标记**：`src` = 正面（可以抽）、`srcBack` = 背面（已翻面）
 *  - 小屋**手提箱**：`src` = 未开（可以开）、`srcBack` = 已用
 *
 * 以前手提箱是**两个独立 token**（`suitcaseOpen` / `suitcaseUsed`）互相切换，
 * 两个坐标还差一点、要分别维护 —— 现在和遗物标记用同一套。
 */
function flipTokenImage(t: { src: string; srcBack?: string }, faceUp: boolean): string {
  return !faceUp && t.srcBack ? t.srcBack : t.src;
}

function isSuitcaseToken(t: { id: string; kind: string }) {
  return t.kind === 'suitcase' || t.kind === '手提箱' || t.id === 'suitcaseOpen';
}

function tokenTransform(x: number, y: number, w: number, h: number, rotation = 0) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `translate(${cx} ${cy}) rotate(${rotation}) translate(${-w / 2} ${-h / 2})`;
}

const STANDEE_H = 68;
const SURVIVOR_STANDEE_W = Math.round(STANDEE_H * (489 / 781));
const KILLER_STANDEE_W = Math.round(STANDEE_H * (934 / 1040));

/**
 * 僵尸立绘的尺寸 —— **和幸存者/杀手立绘同样高**（`STANDEE_H`），
 * 宽度按各自图片的宽高比算，避免拉伸。
 */
function zombieStandeeFor(art: number): { w: number; h: number } {
  const i = Math.max(0, ((art || 1) - 1) % ZOMBIE_ASPECT.length);
  const h = STANDEE_H;
  return { w: Math.max(1, Math.round(h * ZOMBIE_ASPECT[i]!)), h };
}

/** 地点圆点半径（地图原始坐标；图是 1000×500） */
const ROOM_R = 20;
/** 牌子 emoji 挂在圆点下方多远 */
const ROOM_TAG_DY = ROOM_R + 8;

function standeeFor(
  p: BoardPlayer,
  viewerFaction: Faction | null,
): { src: string; w: number; h: number } | null {
  if (!p.alive || !p.roomId) return null;
  if (p.faction === 'killer') {
    if (p.stealth && viewerFaction !== 'killer') return null;
    const src = killerStandeeSrc(killerArtFor(p.characterId, p.name));
    if (!src) return null;
    return { src, w: KILLER_STANDEE_W, h: STANDEE_H };
  }
  const src = survivorStandeeSrc(survivorArtFor(p.characterId, p.name));
  if (!src) return null;
  return { src, w: SURVIVOR_STANDEE_W, h: STANDEE_H };
}

export function Board({
  map,
  players,
  youId,
  viewerFaction,
  legalMoves,
  highlightRoomIds = [],
  firecrackerRoomId = null,
  suitcaseAvailable = true,
  noises,
  blockades = [],
  previewPath = [],
  repairProgress = 0,
  showRepair = false,
  repairGuessable = false,
  onRepairGuess,
  onSkillClick,
  stealthRoomId = null,
  trapRoomIds = [],
  trapSpotRooms = [],
  statueHaltPickable = false,
  rescueArmed = false,
  rescueCountdown = null,
  onRoomClick,
  pileCounts,
  pileCards,
  pileTops,
  cardById = {},
  pickableSurvivorIds = [],
  selectedSurvivorId = null,
  activePlayerId = null,
  onSurvivorClick,
  onPileClick,
  turnOrder = [],
  remoteCursors = [],
  onRoomHover,
  statues = [],
  onStatueClick,
  onStatueDoubleClick,
  killerCharacterId = null,
  killerCharacterName = null,
  treasureChests = [],
  witnessedAt,
  hunterTraps = [],
  trapPartRooms = [],
  coreMarkers = [],
  zombies = [],
  poisoned = [],
  encounterRoomId = null,
  leverGateDoorId = null,
  firstAidKit = false,
  firstAidRoomId = null,
  collapsedRooms = [],
  relicMarkerFaceUp = true,
  markerOffsets = {
    hunterTrap: { dx: -30, dy: 0, size: 30 },
    trapPart: { dx: 0, dy: 34, size: 28 },
    coreMarker: { dx: 0, dy: -34, size: 30 },
    zombie: { dx: 34, dy: 0, size: 34 },
  },
}: BoardProps) {
  const roomMap = new Map(map.rooms.map((r) => [r.id, r]));
  /** 每个房间有几个核心标记（一个地点可以有多个） */
  const coreCountByRoom = new Map<string, string[]>();
  for (const rid of coreMarkers) {
    const list = coreCountByRoom.get(rid) ?? [];
    list.push(rid);
    coreCountByRoom.set(rid, list);
  }
  /** 每个房间有几个僵尸（一个地点可以有多个，按序错开） */
  const zombiesByRoom = new Map<string, Array<{ id: string; art: number }>>();
  for (const z of zombies) {
    const list = zombiesByRoom.get(z.roomId) ?? [];
    list.push(z);
    zombiesByRoom.set(z.roomId, list);
  }
  /**
   * **棋子「刚从别的地点移动过来」的动画。**
   *
   * 立绘是画在**各自房间的那个 `<g>`** 里的 —— 棋子换房间时 React 会卸载旧的、
   * 挂载一个新的，所以没法用 CSS transition 去追位置（那是两个不同的节点）。
   * 改用「**从旧房间滑进来**」：渲染时拿上一次的 `roomId` 比对，
   * 把"旧房间相对新房间"的位移写进 CSS 变量，让新挂载的立绘从那个方向滑到位。
   *
   * `prevRoomsRef` 在每次渲染**之后**更新（见下面的 `useEffect`），
   * 所以渲染时读到的永远是"上一次的位置"。首次挂载没有旧值 → 不播动画。
   */
  const prevRoomsRef = useRef(new Map<string, string>());
  const moveFrom = (pieceId: string, roomId: string | null | undefined) => {
    if (!roomId) return null;
    const prev = prevRoomsRef.current.get(pieceId);
    if (!prev || prev === roomId) return null;
    const a = roomMap.get(prev);
    const b = roomMap.get(roomId);
    if (!a || !b) return null;
    return { dx: a.x - b.x, dy: a.y - b.y };
  };
  const moveStyle = (mv: { dx: number; dy: number } | null): CSSProperties | undefined =>
    mv
      ? ({
          ['--mv-dx' as string]: `${mv.dx}px`,
          ['--mv-dy' as string]: `${mv.dy}px`,
        } as CSSProperties)
      : undefined;
  useEffect(() => {
    const next = new Map<string, string>();
    for (const p of players) if (p.roomId) next.set(p.id, p.roomId);
    for (const st of statues) if (st.roomId) next.set(st.id, st.roomId);
    /** 僵尸是按房间分组的（条目里没有 roomId），键就是房间号 */
    for (const [roomId, list] of zombiesByRoom) {
      for (const z of list) next.set(z.id, roomId);
    }
    prevRoomsRef.current = next;
  });
  const you = players.find((p) => p.id === youId);  /**
   * 右键菜单：显示某个地点上现在有什么。
   * `x / y` 是相对 `.map-stage` 的像素位置。
   */
  const [roomMenu, setRoomMenu] = useState<{
    roomId: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);

  /** 按 Esc 收起右键菜单 */
  useEffect(() => {
    if (!roomMenu) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRoomMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roomMenu]);

  /** 切换视角（观众切幸存者/杀手）时信息集变了，菜单必须收起重开 */
  useEffect(() => {
    setRoomMenu(null);
  }, [viewerFaction]);
  const bg =
    viewerFaction === 'killer'
      ? map.backgrounds?.killer
      : map.backgrounds?.survivor ?? map.backgrounds?.killer;
  const zones = (map.zones ?? []).filter(
    (z) => zoneVisible(z, viewerFaction) && !OVERLAY_ZONE_IDS.has(z.id),
  );
  const previewRoomId = previewPath.length ? previewPath[previewPath.length - 1] : null;
  /** 同队预选：把棋子 id 换成它在这局里的序号（决定颜色） */
  const playerIndexOf = (playerId: string) => turnOrder.indexOf(playerId);
  const previewPts = previewPath
    .map((id) => roomMap.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  /** 被封堵的门所在的房间。必须按完整门号比较：门号是 "A|B"，
   *  用 includes(room.id) 会让 R1 命中 "R11|R12" 这类门而误判。 */
  const blockedDoorKeys = new Set(blockades);
  const blockedRoomIds = new Set<string>();
  for (const e of map.edges) {
    if (!isDoorPath(e.pathType)) continue;
    if (!blockedDoorKeys.has(doorKey(e.from, e.to))) continue;
    blockedRoomIds.add(e.from);
    if (e.bidirectional ?? true) blockedRoomIds.add(e.to);
  }

  /**
   * 右键菜单的内容。可见性跟地图上的标记保持一致：
   *  - 幸存者：菜单里只在**遭遇**时列（其他时候杀手不该知道谁在哪，哪怕目击过）
   *  - 雕像：双方都逐尊列；杀手视角标主雕像
   *  - 猎手陷阱类型只有杀手知道
   *  - 陷阱标记只有幸存者可见
   */
  const roomMenuRows: RoomMenuRow[] = roomMenu
    ? roomMenuRowsFor({
        roomId: roomMenu.roomId,
        viewerFaction,
        occupantsHere: players.filter((p) => {
          if (!p.alive) return false;
          /**
           * 雕像局里 `players` 还留着**原始杀手棋子**（没有 `statueIndex` 的那条），
           * 它在图上不画任何立绘 —— 要排除掉，否则会和雕像重复列出来。
           */
          if (isGhostKillerPiece(p, statues)) {
            return false;
          }
          if (viewerFaction === 'killer' && p.faction === 'survivor') {
            return witnessedAt?.[p.id] === roomMenu.roomId;
          }
          return p.roomId === roomMenu.roomId;
        }),
        survivorsVisible:
          viewerFaction !== 'killer' ||
          Boolean(encounterRoomId && encounterRoomId === roomMenu.roomId),
        /** 【分头行动】这个地点的遗留物：逃脱/被杀的人（立绘留在原地变暗，位置公开） */
        downedHere: players
          .filter((p) => p.downed && p.roomId === roomMenu.roomId)
          .map((p) => ({ name: p.name, escaped: p.escaped })),
        /** 雕像：用快照里的 `statues`（带 index / main），跟着地点筛 */
        statuesHere: (statues ?? [])
          .filter((s) => s.roomId === roomMenu.roomId)
          .map((s) => ({ index: s.index, main: s.main })),
        zombieCount: zombies.filter((z) => z.roomId === roomMenu.roomId).length,
        coreCount: coreMarkers.filter((id) => id === roomMenu.roomId).length,
        treasureHere: (treasureChests ?? []).includes(roomMenu.roomId),
        trapPartHere: trapPartRooms.includes(roomMenu.roomId),
        firecrackerHere: firecrackerRoomId === roomMenu.roomId,
        noiseHere: noises.includes(roomMenu.roomId),
        hunterTraps: hunterTraps.filter((t) => t.roomId === roomMenu.roomId && !t.removed),
      })
    : [];

  return (
    <div className="board-wrap">
      <div className="map-stage">
      {bg && <img className="map-bg" src={encodeURI(bg)} alt={map.name} draggable={false} />}
      <svg
        className="map-svg"
        viewBox={`0 0 ${map.width} ${map.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={map.name}
      >
        {zones.map((z) =>
          z.shape === 'circle' ? (
            <g key={z.id} className="map-zone" pointerEvents="none">
              <circle
                cx={z.x}
                cy={z.y}
                r={z.r ?? 20}
                fill={hexToRgba(z.color, 0.22)}
                stroke={z.color}
                strokeWidth={2}
              />
              {z.label ? (
                <text className="zone-label" x={z.x} y={(z.y ?? 0) + (z.r ?? 20) + 12} fill={z.color} textAnchor="middle">
                  {z.label}
                </text>
              ) : null}
              {showRepair &&
                /^repair\d+$/.test(z.id) &&
                (tokenRepairStep(z.id) ?? 0) <= repairProgress &&
                (tokenRepairStep(z.id) ?? 0) > 0 &&
                !(map.tokens ?? []).some((t) => t.id === z.id && t.kind === 'repair' && (t.side ?? 'survivor') !== 'killer') && (
                <image
                  href={encodeURI(UI.repair)}
                  x={z.x - 14}
                  y={z.y - 14}
                  width={28}
                  height={28}
                  pointerEvents="none"
                />
              )}
              {repairGuessable && /^repair\d+$/.test(z.id) && (
                <circle
                  cx={z.x}
                  cy={z.y}
                  r={z.r ?? 20}
                  fill="transparent"
                  pointerEvents="auto"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const n = tokenRepairStep(z.id);
                    if (n != null) onRepairGuess?.(n);
                  }}
                />
              )}
            </g>
          ) : (
            <g key={z.id} className="map-zone" pointerEvents="none">
              <rect
                x={z.x}
                y={z.y}
                width={z.w ?? 40}
                height={z.h ?? 40}
                rx={6}
                fill={hexToRgba(z.color, 0.22)}
                stroke={z.color}
                strokeWidth={2}
              />
              {z.label ? (
                <text
                  className="zone-label"
                  x={z.x + (z.w ?? 40) / 2}
                  y={z.y + (z.h ?? 40) / 2 + 4}
                  fill={z.color}
                  textAnchor="middle"
                >
                  {z.label}
                </text>
              ) : null}
            </g>
          ),
        )}

        {map.edges.map((e, i) => {
          const a = roomMap.get(e.from);
          const b = roomMap.get(e.to);
          if (!a || !b) return null;
          const door = isDoorPath(e.pathType);
          const key = doorKey(e.from, e.to);
          const blocked = door && blockades.includes(key);
          /**
           * ⚠ **门上的标记位置要"不管有没有封堵"都取出来** ——
           * 因为【城堡】的机关大门是**和封堵共用同一个位置**的（用户要求）：
           * 每扇门在地图数据里都有一份 `blockade` 坐标（校准工具会给每扇门补上），
           * 机关大门直接拿它来画，只是把图片换成竖闸门那张。
           *
           * 以前这里只在 `blocked` 时才取，所以没封堵的门上放机关大门会退回
           * "门中点" —— 那就跟封堵对不齐了。
           */
          const mark = door ? blockadeMarkFor(e, viewerFaction) : undefined;
          const bw = mark?.w ?? 44;
          const bh = mark?.h ?? 22;
          const x = mark ? mark.x : (a.x + b.x) / 2 - bw / 2;
          const y = mark ? mark.y : (a.y + b.y) / 2 - bh / 2;
          const angle =
            mark?.rotation ?? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          /**
           * 【城堡】机关大门：**位置、大小、角度全部跟封堵共用**，只换一张图
           * （竖金属闸门）。规则上两者可以同时存在（放门时会自动拆掉那个封堵，
           * 但封堵也可能事后又被放上去），所以两张图各错开一点、互不遮挡。
           */
          const hasGate = door && leverGateDoorId === key;
          /** 两道标记重叠时错开一点，免得完全叠在一起看不清 */
          const gateShift = blocked ? 7 : 0;
          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <line
                className={`edge-line ${e.pathType === 'dash' ? 'dash' : e.pathType === 'killer' ? 'killer' : 'door'}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
              />
              {blocked && (
                <image
                  href={encodeURI(UI.blockade)}
                  width={bw}
                  height={bh}
                  transform={tokenTransform(x, y - gateShift, bw, bh, angle)}
                  pointerEvents="none"
                />
              )}
              {hasGate && (
                <image
                  href={encodeURI(UI.leverGate)}
                  width={bw}
                  height={bh}
                  transform={tokenTransform(x, y + gateShift, bw, bh, angle)}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {(map.passages ?? []).map((e, i) => {
          const a = roomMap.get(e.from);
          const b = roomMap.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={`p-${e.from}-${e.to}-${i}`}
              className="edge-line passage"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}


        {repairGuessable &&
          (map.tokens ?? [])
            .filter((t) => zoneVisible(t, viewerFaction) && t.kind === 'repair' && isKillerRepairToken(t))
            .map((t) => {
              const n = tokenRepairStep(t.id);
              if (n == null || t.x == null || t.y == null) return null;
              return (
                <rect
                  key={`guess-${t.id}`}
                  x={t.x}
                  y={t.y}
                  width={t.w ?? 24}
                  height={t.h ?? 24}
                  fill="transparent"
                  pointerEvents="auto"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRepairGuess?.(n);
                  }}
                />
              );
            })}

        {previewPts.length > 1 && (
          <polyline
            className="preview-path"
            fill="none"
            points={previewPts.map((r) => `${r.x},${r.y}`).join(' ')}
          />
        )}

        {map.rooms.map((room) => {
          const legal = legalMoves.includes(room.id);
          const colorHit = highlightRoomIds.includes(room.id);
          const noise = noises.includes(room.id);
          const firecrackerHere = firecrackerRoomId === room.id;
          const blocked = blockedRoomIds.has(room.id);
          const here = you?.roomId === room.id && !previewRoomId;
          const previewHere = previewRoomId === room.id;
          /**
           * 这一步是否已经被选进**移动路径**里 —— 路径上所有格子都要高亮，
           * 让玩家看到"我点了哪几步"，而不只是末端那一格。
           */
          const pathPicked = previewPath.includes(room.id);
          /**
           * 杀手视角：幸存者立绘画在**杀手记忆里的位置** ——
           * 调用方（`GameViews` 的 `displayPlayers`）已经把 `roomId` 换成了
           * 「他手动摆的位置」，〔感知〕目击过的也会自动同步过去。
           *
           * ⚠ **不要**在这里再按 `witnessedAt` 过滤一遍：那样没目击过的幸存者
           * 一个都不画，而「放置立绘」正是给杀手手动记位置用的 ——
           * 两套机制会互相打架，表现为"点房间摆放没反应"（摆好了但没东西可显示）。
           * `witnessedAt` 仍然用于**右键菜单**（那里只在遭遇期间列幸存者）。
           */
          const occupants = players.filter((p) => {
            /**
             * 【分头行动】逃脱/被杀的幸存者立绘**留在原地并变暗**（用户要求），
             * 所以 `downed` 的人照画；别的模式死人照旧不画。
             */
            if (!p.alive && !p.downed) return false;
            /** 雕像局里那个"原始杀手棋子"不画立绘（4 尊雕像已经代表了杀手） */
            if (isGhostKillerPiece(p, statues)) return false;
            return p.roomId === room.id;
          });
          const standees = occupants
            .map((p) => {
              const art = standeeFor(p, viewerFaction);
              return art ? { p, ...art } : null;
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));
          const name = viewerFaction === 'killer' && room.nameKiller ? room.nameKiller : room.name;
          const label = name.startsWith(room.id) ? name : `${room.id}${name}`;
          return (
            <g
              key={room.id}
              onClick={() => {
                /** 左键仍然是「点这个地点」；顺便收起右键菜单 */
                if (roomMenu) setRoomMenu(null);
                onRoomClick(room.id);
              }}
              onContextMenu={(e) => {
                /**
                 * 右键 = 弹出这个地点的小菜单（不触发移动/选点）。
                 * 菜单定位在 `.map-stage` 里，用**像素**坐标（鼠标位置），
                 * 所以要从 clientX/Y 换算成相对舞台的位置。
                 */
                e.preventDefault();
                e.stopPropagation();
                const stage = e.currentTarget.closest('.map-stage');
                const rect = stage?.getBoundingClientRect();
                if (!rect) return;
                setRoomMenu({
                  roomId: room.id,
                  /** 第一行：序号 + 名称 + 特殊地点括号（用户要求） */
                  label: roomMenuTitle(map, room, name),
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseEnter={onRoomHover ? () => onRoomHover(room.id) : undefined}
              onMouseLeave={onRoomHover ? () => onRoomHover(null) : undefined}
            >
              {/* 同队幸存者的鼠标预选：同名棋子共用一个颜色，绕两圈更好认 */}
              {remoteCursors
                .filter((c) => c.roomId === room.id)
                .map((c, i) => (
                  <circle
                    key={`${c.playerId}-${i}`}
                    className="room-cursor"
                    cx={room.x}
                    cy={room.y}
                    r={ROOM_R + 5 + i * 4}
                    style={{ stroke: cursorColor(playerIndexOf(c.playerId)) }}
                  />
                ))}
              <circle
                className={`room-node${legal ? ' legal' : ' clickable'}${colorHit ? ' sense-color' : ''}${noise ? ' noise' : ''}${blocked ? ' blocked' : ''}${here ? ' here' : ''}${previewHere ? ' preview' : ''}${pathPicked ? ' path-picked' : ''}${trapSpotRooms.includes(room.id) ? ' trap-spot' : ''}`}
                cx={room.x}
                cy={room.y}
                r={ROOM_R}
              />
              <text className="room-label" x={room.x} y={room.y + 4} textAnchor="middle">
                {label}
              </text>
              <text className="room-tag" x={room.x} y={room.y + ROOM_TAG_DY} textAnchor="middle">
                {[
                  room.tags.includes('repairable') ? '⚙' : '',
                  room.tags.includes('searchable') ? '🔑' : '',
                  room.tags.includes('hiddenExit') ? '⎋' : '',
                  room.tags.includes('entrance') ? '⌂' : '',
                  blocked ? '▣' : '',
                  /**
                   * 特殊地点标记：以前只画上面几个通用 tag，
                   * **书本 / 锤子 / 螺旋 / 叉**这些特殊地点在地图上完全看不出来 ——
                   * 而它们决定了好几个技能能不能用（乔治「聪明绝顶」、迪伦「机械知识」、
                   * 凯莱布「神秘狂热粉」、雕像「分叉」）。
                   *
                   * 豪宅：书本 R4 休息室、锤子 G3 棚屋、螺旋 G2 墓地
                   * 小屋：书本 R5 101号房、锤子 B4 篝火区、螺旋 G3 旧采石场、叉 R4 102号房
                   */
                  room.tags.includes('special-book') ? '📖' : '',
                  room.tags.includes('special-hammer') ? '🔨' : '',
                  room.tags.includes('special-spiral') ? '🌀' : '',
                  room.tags.includes('special-fork') ? '🔀' : '',
                ].join('')}
              </text>
              {/**
               * 【地图图层顺序】**从低到高**（后画的盖前面的）：
               *   房间圆圈 → 僵尸立绘 → 杀手立绘（含 4 尊雕像）→ 幸存者立绘
               *   → 扼杀者核心标记 → 宝箱标记 → 猎手陷阱标记 → 封堵标记（最上）
               *
               * 所以这里僵尸**最先画**，幸存者**最后画**（幸存者盖住杀手和僵尸）。
               */}
              {(zombiesByRoom.get(room.id) ?? []).map((z, i) => {
                const zs = zombieStandeeFor(z.art);
                /** 这个地点已经有幸存者立绘时，僵尸整体右移，避免叠在一起 */
                const baseShift = standees.length ? standees.length * (zs.w * 0.62) : 0;
                const n = (zombiesByRoom.get(room.id) ?? []).length;
                const cx = room.x + baseShift + (i - (n - 1) / 2) * (zs.w * 0.62);
                /** 刚走过来的僵尸 → 从旧地点滑入（`zombies` 里不带 roomId，用当前分组键） */
                const mv = moveFrom(z.id, room.id);
                return (
                  <g
                    key={z.id}
                    className={`zombie-standee${mv ? ' just-moved' : ''}`}
                    pointerEvents="none"
                    style={moveStyle(mv)}
                  >
                    {/* 外围一圈**细白色高光**，让僵尸在暗色地图上更清楚 */}
                    <rect
                      className="zombie-glow"
                      x={cx - zs.w / 2 - 1.5}
                      y={room.y - zs.h - 1.5}
                      width={zs.w + 3}
                      height={zs.h + 3}
                      rx={3}
                    />
                    <image
                      href={encodeURI(ZOMBIE_ART_SRC[(z.art - 1) % ZOMBIE_ART_SRC.length]!)}
                      x={cx - zs.w / 2}
                      y={room.y - zs.h}
                      width={zs.w}
                      height={zs.h}
                    />
                  </g>
                );
              })}
              {/* 雕像杀手：4 个雕像立绘（立绘1–4）。主雕像高亮，猜测用各自颜色的轮廓。 */}
              {statues
                .filter((st) => st.roomId === room.id)
                .map((st, stIdx, arr) => {
                  const art = killerStatueSrc(
                    killerArtFor(killerCharacterId, killerCharacterName),
                    st.index,
                  );
                  if (!art) return null;
                  const w = KILLER_STANDEE_W;
                  const h = STANDEE_H;
                  // 和 survivors 一起排，避免叠在一起
                  const total = arr.length + standees.length;
                  const slot = standees.length + stIdx;
                  const gap = w * 0.62;
                  const cx = room.x + (slot - (total - 1) / 2) * gap;
                  /** 刚移动过来的雕像 → 从旧地点滑入 */
                  const mv = moveFrom(st.id, st.roomId);
                  return (
                    <g
                      key={st.id}
                      /**
                       * ⚠ **主雕像的高亮只有杀手自己看得到**（用户要求：
                       * 「雕像游戏中，幸存者界面不能有正确的主雕像的高亮显示」）。
                       * 「哪尊是主雕像」是杀手的秘密 —— 幸存者只能靠猜。
                       */
                      className={`map-standee statue-standee${st.main && viewerFaction === 'killer' ? ' is-main' : ''}${st.halted ? ' halted' : ''}${statueHaltPickable && !st.halted ? ' halt-pickable' : ''}${mv ? ' just-moved' : ''}`}
                      pointerEvents="auto"
                      onClick={
                        onStatueClick
                          ? (e) => {
                              e.stopPropagation();
                              onStatueClick(st.id);
                            }
                          : undefined
                      }
                      onDoubleClick={
                        onStatueDoubleClick
                          ? (e) => {
                              e.stopPropagation();
                              onStatueDoubleClick(st.id);
                            }
                          : undefined
                      }
                      style={{
                        ...moveStyle(mv),
                        cursor: onStatueClick ? 'pointer' : undefined,
                      }}
                    >
                      <image href={encodeURI(art)} width={w} height={h} x={cx - w / 2} y={room.y - h} />
                      {/* 主雕像轮廓高亮（只有杀手看得见） */}
                      {st.main && viewerFaction === 'killer' && (
                        <rect
                          className="standee-main-outline"
                          x={cx - w / 2 - 2}
                          y={room.y - h - 2}
                          width={w + 4}
                          height={h + 4}
                          rx={3}
                        />
                      )}
                      {/**
                        * 幸存者各自的猜测轮廓：**一个操控者一圈**，按座位颜色区分
                        * （用户要求：1对2 里两个人的猜测要"区分不同颜色"）。
                        * 槽位由服务端下发，`cursorColor(slot)` 和座位色一致。
                        */}
                      {(st.guesserSlots ?? []).map((slot, gi) => (
                        <rect
                          key={`guess-${slot}`}
                          className="standee-guess-outline"
                          x={cx - w / 2 - 3 - gi * 2}
                          y={room.y - h - 3 - gi * 2}
                          width={w + 6 + gi * 4}
                          height={h + 6 + gi * 4}
                          rx={4}
                          style={{ stroke: cursorColor(slot) }}
                        />
                      ))}
                      {/**
                       * 【停滞】被幸存者停滞的雕像**打一个叉**（用户要求：
                       * 「幸存者停滞雕像后幸存者地图上对应雕像立绘上画一个叉」+
                       * 「杀手回合开始时……给杀手地图对应雕像打上叉标记」）——
                       * 所以**双方地图都画**。叉会随着 `statueHalted` 在新大回合
                       * 开始时被清掉而一起消失。
                       */}
                      {st.halted && (
                        <g className="standee-halt-x" pointerEvents="none">
                          <line x1={cx - w / 2} y1={room.y - h} x2={cx + w / 2} y2={room.y} />
                          <line x1={cx + w / 2} y1={room.y - h} x2={cx - w / 2} y2={room.y} />
                        </g>
                      )}
                    </g>
                  );
                })}
              {/**
               * **幸存者立绘**：图层上要盖住杀手立绘和僵尸立绘，所以放在它们之后画。
               */}
              {standees.map((s, idx) => {
                const n = standees.length;
                const gap = s.w * 0.62;
                const cx = room.x + (idx - (n - 1) / 2) * gap;
                const x = cx - s.w / 2;
                /** 立绘底边与地点圆心对齐（原来往下压了 12px） */
                const y = room.y - s.h;
                const pickable = pickableSurvivorIds.includes(s.p.id) && s.p.faction === 'survivor';
                const acting = s.p.id === activePlayerId;
                /** 刚从上一次的地点移动过来 → 从旧位置滑入（见 `moveFrom` 的说明） */
                const mv = moveFrom(s.p.id, s.p.roomId);
                return (
                  <g
                    key={s.p.id}
                    className={`map-standee${s.p.id === youId ? ' mine' : ''}${acting ? ' acting' : ''}${s.p.placed ? ' placed' : ''}${pickable ? ' pickable' : ''}${selectedSurvivorId === s.p.id ? ' picked' : ''}${s.p.actedThisRound ? ' acted' : ''}${mv ? ' just-moved' : ''}${s.p.downed ? ' downed' : ''}`}
                    pointerEvents={pickable ? 'auto' : 'none'}
                    onClick={
                      pickable
                        ? (e) => {
                            e.stopPropagation();
                            onSurvivorClick?.(s.p.id);
                          }
                        : undefined
                    }
                    style={{
                      ...moveStyle(mv),
                      ...(pickable ? { cursor: 'pointer' as const } : {}),
                    }}
                  >
                    <image
                      href={encodeURI(s.src)}
                      width={s.w}
                      height={s.h}
                      x={x}
                      y={y}
                    />
                    {(acting || s.p.id === youId) && (
                      <rect
                        className={acting ? 'standee-acting' : 'standee-you'}
                        x={x - 1}
                        y={y - 1}
                        width={s.w + 2}
                        height={s.h + 2}
                        rx={2}
                      />
                    )}
                    {/**
                     * 〔中毒〕标记：女王的特殊能力 —— 中毒的幸存者立绘右上角加一个标记。
                     */}
                    {poisoned.includes(s.p.id) && (
                      <image
                        href={encodeURI('/Image/Killers/杀手九_女王/中毒标记.png')}
                        x={x + s.w - 14}
                        y={y - 6}
                        width={18}
                        height={18}
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
              {/**
               * 【扼杀者核心标记】：跟着圆心走，画在圆心上方。
               * 一个地点**可以有多个**核心标记 —— 多个时按序号错开一点，
               * 这样一眼能看出这里叠了几个。双方地图都显示。
               *
               * 外围加**一圈细白色高光**，让它在暗色地图上看得清。
               */}
              {coreCountByRoom.get(room.id)?.map((_, i) => {
                const sz = markerOffsets.coreMarker.size;
                const cx =
                  room.x + markerOffsets.coreMarker.dx - sz / 2 + i * 5;
                const cy =
                  room.y + markerOffsets.coreMarker.dy - sz / 2 - i * 5;
                return (
                  <g key={`core-${room.id}-${i}`} pointerEvents="none">
                    <rect
                      className="core-marker-glow"
                      x={cx - 1.5}
                      y={cy - 1.5}
                      width={sz + 3}
                      height={sz + 3}
                      rx={3}
                    />
                    <image
                      href={encodeURI(killerCoreMarkerSrc)}
                      x={cx}
                      y={cy}
                      width={sz}
                      height={sz}
                    />
                  </g>
                );
              })}
              {/**
               * 【陷阱零件】使用后留下的标记：**跟着圆心走**，画在圆心下方，
               * 只有幸存者看得到。和猎手陷阱标记（圆心左侧）天然错开。
               */}
              {trapPartRooms.includes(room.id) && (
                <image
                  href={encodeURI('/Image/UI/陷阱.png')}
                  x={room.x + markerOffsets.trapPart.dx - markerOffsets.trapPart.size / 2}
                  y={room.y + markerOffsets.trapPart.dy - markerOffsets.trapPart.size / 2}
                  width={markerOffsets.trapPart.size}
                  height={markerOffsets.trapPart.size}
                  pointerEvents="none"
                />
              )}
              {/**
               * 【实验室 G3 急救室】急救箱**不在这里画** ——
               * 用户要求它「像手提箱一样放在地图上」，所以它是
               * `map.tokens` 里的一个道具（`kind: 'firstAidKit'`），
               * 位置在「地图校准」里拖，用掉之后由 token 的过滤条件把它去掉。
               * 渲染见下面的 tokens 循环。
               */}
              {/**
               * 【女猎手陷阱】：**位置由女猎手自己选**（任意地点），
               * 所以不在 `map.tokens` 里 —— 这里直接按房间渲染。
               *
               * 杀手看到真实类型；幸存者只有**被触发过**（revealed）才知道是什么，
               * 否则一律画问号。
               */}
              {(() => {
                const info = (hunterTraps ?? []).find((h) => h.roomId === room.id);
                if (!info || info.removed) return null;
                const shownKind =
                  viewerFaction === 'killer' ? info.kind : info.revealed ? info.kind : null;
                const off = markerOffsets.hunterTrap;
                return (
                  <image
                    href={encodeURI(hunterTrapIcon(shownKind))}
                    x={room.x + off.dx - off.size / 2}
                    y={room.y + off.dy - off.size / 2}
                    width={off.size}
                    height={off.size}
                    pointerEvents="none"
                  />
                );
              })()}
              {firecrackerHere && (
                <image
                  href={encodeURI(UI.firecrackerNoise)}
                  x={room.x - 16}
                  y={room.y - 42}
                  width={32}
                  height={32}
                  pointerEvents="none"
                />
              )}
              {noise && (
                <image
                  href={encodeURI(UI.noise)}
                  x={room.x + 14}
                  y={room.y - 28}
                  width={22}
                  height={20}
                />
              )}
              {stealthRoomId === room.id && (() => {
                const tok = (map.tokens ?? []).find((t) => t.kind === 'stealth');
                const tw = tok?.w ?? 32;
                const th = tok?.h ?? 32;
                const x = room.x + 22;
                const y = room.y - th / 2;
                return (
                  <image
                    href={encodeURI(tok?.src ?? UI.stealth)}
                    width={tw}
                    height={th}
                    transform={tokenTransform(x, y, tw, th, 0)}
                  />
                );
              })()}
              {trapRoomIds.includes(room.id) && (
                <image
                  href={encodeURI(UI.trap)}
                  width={36}
                  height={36}
                  x={room.x - 18}
                  y={room.y + 20}
                  pointerEvents="none"
                />
              )}
              {previewHere && (
                <text className="token preview-token" x={room.x} y={room.y + 32} textAnchor="middle">
                  预览
                </text>
              )}
            </g>
          );
        })}
        {/**
         * 地图上的标记（宝箱等）画在 **房间圆圈之后** ——
         * 放在前面会被圆圈和立绘盖住，看起来像"没显示"。
         */}
        {(map.tokens ?? [])
          .filter((t) => zoneVisible(t, viewerFaction))
          .filter((t) => {
            if (t.kind === 'stealth' || t.kind === 'blockade' || t.kind === '封堵') return false;
            /**
             * 狼人宝箱：只在幸存者地图显示；已经被开掉的宝箱图标消失。
             * （杀手地图不放宝箱 —— 那是幸存者地图上的东西）
             */
            if (t.kind === 'treasureChest') {
              if (viewerFaction === 'killer') return false;
              return (treasureChests ?? []).includes(t.id);
            }
            /**
             * 女猎手陷阱**不在 `map.tokens` 里**（位置由女猎手自己选），
             * 所以这里没有它的分支 —— 渲染见下面房间循环里的「女猎手陷阱」块。
             */
            if (isSuitcaseToken(t)) {
              /**
               * 手提箱是**翻面标记**（`src` 未开 / `srcBack` 已用）：
               * 不管可不可用都**照常渲染**，由下面的 `flipTokenImage` 按状态选图 ——
               * 所以这里返回 true，别按 `suitcaseAvailable` 过滤
               * （以前那样过滤会让"已用"状态整个标记消失）。
               */
              return true;
            }
            /**
             * 【实验室 G3】**急救箱标记**：和手提箱一样是 `map.tokens` 里的道具
             * （用户要求"像手提箱一样放在地图上"，位置在「地图校准」里拖）。
             * 用掉之后 `firstAidKit` 变 false，图标就消失。
             *
             * ⚠ **只有幸存者的地图上画**（用户要求）—— 数据里那条 token 写的是
             * `side: 'survivor'`，所以杀手视角在更上面的 `zoneVisible` 就被滤掉了。
             */
            if (t.kind === 'firstAidKit' || t.kind === '急救箱') {
              return firstAidKit === true;
            }
            if (t.kind === 'repair') {
              if (!showRepair) return false;
              const n = tokenRepairStep(t.id);
              return n != null && n > 0 && n <= repairProgress;
            }
            /**
             * 【墓穴 R6】**遗物标记**：正反两面，正面 = 可以抽。
             * 它画在幸存者的地图上（杀手地图没有遗物室标记）；
             * 地点塌了标记也跟着没。
             */
            if (t.kind === 'relicMarker') {
              if (viewerFaction === 'killer') return false;
              if (t.roomId && collapsedRooms.includes(t.roomId)) return false;
              return true;
            }
            if (t.kind === 'rescue') {
              // 杀手地图用齿轮记猜测修理，不显示警车。
              if (viewerFaction === 'killer' || t.side === 'killer') return false;
              if (!rescueArmed || rescueCountdown == null) return false;
              const step = tokenRescueStep(t.id);
              if (step == null) return false;
              return step === rescueCountdown;
            }
            return true;
          })
          .map((t) => {
            /**
             * 陷阱零件标记不在 map.tokens 里（它按 trapPartRooms 画在房间分组内），
             * 这里跳过；其余带绝对坐标的标记走通用渲染。
             * （女猎手陷阱也不在这里 —— 它的位置由女猎手自己选，见房间循环。）
             */
            if (t.x == null || t.y == null) return null;
            /**
             * **翻面标记**：`src` = 正面、`srcBack` = 背面。
             *  - 遗物标记：`relicMarkerFaceUp`
             *  - 手提箱：`suitcaseAvailable`
             * 其余标记没有 `srcBack`，`flipTokenImage` 会原样返回 `src`。
             */
            const faceUp = t.kind === 'relicMarker' ? relicMarkerFaceUp : suitcaseAvailable;
            const src = flipTokenImage(t, faceUp);
            return (
              <image
                key={`tok-${t.id}`}
                href={encodeURI(src)}
                width={t.w ?? 30}
                height={t.h ?? 30}
                transform={tokenTransform(t.x, t.y, t.w ?? 30, t.h ?? 30, t.rotation ?? 0)}
                pointerEvents="none"
              />
            );
          })}
        {/**
         * 【墓穴】**坍塌板块**。
         *
         * 位置不写死在代码里 —— 每个可坍塌地点在地图 JSON 的 `collapsedMarks`
         * 里配好了素材 + 坐标 + 尺寸 + 旋转（默认 90 度：板块是横的，贴上去要竖着），
         * 这样在编辑界面里能直接拖。
         */}
        {(map.collapsedMarks ?? [])
          .filter((mk) => collapsedRooms.includes(mk.roomId))
          .filter((mk) => zoneVisible(mk, viewerFaction))
          .map((mk) => {
            const src = viewerFaction === 'killer' && mk.srcKiller ? mk.srcKiller : mk.src;
            return (
              <image
                key={`collapse-${mk.roomId}`}
                href={encodeURI(src)}
                width={mk.w}
                height={mk.h}
                transform={tokenTransform(mk.x, mk.y, mk.w, mk.h, mk.rotation ?? 90)}
                pointerEvents="none"
              />
            );
          })}
      </svg>
      <MapPileOverlays
        map={map}
        viewerFaction={viewerFaction}
        players={players}
        turnOrder={turnOrder}
        pileCounts={pileCounts}
        pileCards={pileCards}
        pileTops={pileTops}
        cardById={cardById}
        onPileClick={onPileClick}
        onSkillClick={onSkillClick}
      />
      {/**
       * 右键地点的小菜单：列出「这个地点上现在有什么」。
       * 再点任意处（左键点地图任何位置）或按 Esc 收起。
       */}
      {roomMenu && (
        <>
          <div
            className="room-menu-backdrop"
            onClick={() => setRoomMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setRoomMenu(null);
            }}
          />
          <div
            className="room-menu"
            style={{
              left: `${roomMenu.x + 8}px`,
              top: `${roomMenu.y + 8}px`,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="room-menu-title">{roomMenu.label}</div>
            {roomMenuRows.length === 0 ? (
              <div className="room-menu-empty">此地没有东西</div>
            ) : (
              roomMenuRows.map((r) => (
                <div key={r.key} className="room-menu-row">
                  {r.text}
                </div>
              ))
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function zoneBoxStyle(map: MapDef, z: MapZone): CSSProperties {
  return {
    left: `${(z.x / map.width) * 100}%`,
    top: `${(z.y / map.height) * 100}%`,
    width: `${((z.w ?? 80) / map.width) * 100}%`,
    height: `${((z.h ?? 80) / map.height) * 100}%`,
  };
}

function MapPileOverlays({
  map,
  viewerFaction,
  players,
  turnOrder,
  pileCounts,
  pileCards,
  pileTops,
  cardById,
  onPileClick,
  onSkillClick,
}: {
  map: MapDef;
  viewerFaction: Faction | null;
  players: BoardPlayer[];
  turnOrder: string[];
  pileCounts?: BoardProps['pileCounts'];
  pileCards?: BoardProps['pileCards'];
  pileTops?: BoardProps['pileTops'];
  cardById: Record<string, CardDef>;
  onPileClick?: (kind: PileKind) => void;
  onSkillClick?: (src: string, caption: string) => void;
}) {
  const zones = map.zones ?? [];
  const survivors = (turnOrder.length
    ? turnOrder.map((id) => players.find((p) => p.id === id)).filter((p): p is BoardPlayer => Boolean(p))
    : players
  ).filter((p) => p.faction === 'survivor');
  const skillZones = ['skill1', 'skill2', 'skill3']
    .map((id) => zones.find((z) => z.id === id))
    .filter((z): z is MapZone => Boolean(z && zoneVisible(z, viewerFaction)));

  const pileDefs: Array<{
    id: 'search' | 'discovery' | 'treasure' | 'relic' | 'discard';
    kind: PileKind;
    count: number;
  }> = [
    { id: 'search', kind: 'search', count: pileCounts?.search ?? 0 },
    { id: 'discovery', kind: 'discovery', count: pileCounts?.discovery ?? 0 },
    { id: 'treasure', kind: 'treasure', count: pileCounts?.treasure ?? 0 },
    { id: 'relic', kind: 'relic', count: pileCounts?.relic ?? 0 },
    { id: 'discard', kind: 'discard', count: pileCounts?.discard ?? 0 },
  ];

  const topDiscard = pileTops?.discard ?? pileCards?.discard?.[0];
  const discardSrc = topDiscard
    ? (cardArtSrc(cardById[topDiscard.id], topDiscard.id) ?? itemArtSrc(topDiscard.id))
    : undefined;

  return (
    <>
      {pileDefs.map((pile) => {
        const z = zones.find((zone) => zone.id === pile.id);
        if (!z || !zoneVisible(z, viewerFaction)) return null;
        return (
          <button
            key={pile.id}
            type="button"
            className="map-pile"
            style={zoneBoxStyle(map, z)}
            onClick={() => onPileClick?.(pile.kind)}
            title={z.label ?? pile.id}
          >
            <div className="map-pile-art">
              {pile.id === 'search' && pile.count > 0 && (
                <>
                  {pile.count > 1 && (
                    <img className="map-pile-back under" src={encodeURI(UI.searchBackLast)} alt="" draggable={false} />
                  )}
                  <img
                    className="map-pile-back"
                    src={encodeURI(pile.count === 1 ? UI.searchBackLast : UI.searchBack)}
                    alt="搜索牌堆"
                    draggable={false}
                  />
                </>
              )}
              {pile.id === 'discovery' && pile.count > 0 && (
                <>
                  {pile.count > 1 && (
                    <img className="map-pile-back under" src={encodeURI(UI.discoveryBack)} alt="" draggable={false} />
                  )}
                  <img
                    className="map-pile-back"
                    src={encodeURI(UI.discoveryBack)}
                    alt="发现牌堆"
                    draggable={false}
                  />
                </>
              )}
              {/**
               * **狼人宝藏牌堆**：以前这里没有分支 —— 即使 `count = 4`，
               * 面板里也是空白（不画任何牌），看起来像"没加载"。
               * 现在照搜索/发现牌堆的做法画**牌背**（`Image/Treasure/牌背.png`）。
               */}
              {pile.id === 'treasure' && pile.count > 0 && (
                <>
                  {pile.count > 1 && (
                    <img className="map-pile-back under" src={encodeURI(UI.treasureBack)} alt="" draggable={false} />
                  )}
                  <img
                    className="map-pile-back"
                    src={encodeURI(UI.treasureBack)}
                    alt="宝藏牌堆"
                    draggable={false}
                  />
                </>
              )}
              {pile.id === 'relic' && pile.count > 0 && (
                <>
                  {pile.count > 1 && (
                    <img className="map-pile-back under" src={encodeURI(UI.relicBack)} alt="" draggable={false} />
                  )}
                  <img
                    className="map-pile-back"
                    src={encodeURI(UI.relicBack)}
                    alt="遗物牌堆"
                    draggable={false}
                  />
                </>
              )}
              {pile.id === 'discard' && discardSrc && (
                <img className="map-pile-back" src={encodeURI(discardSrc)} alt={topDiscard?.name ?? '弃牌'} draggable={false} />
              )}
            </div>
            <span className="map-pile-count">{pile.count}</span>
          </button>
        );
      })}
      {skillZones.map((z, i) => {
        const p = survivors[i];
        const src = p ? skillCardSrc(survivorArtFor(p.characterId, p.name)) : null;
        if (!src) return null;
        return (
          <button
            key={z.id}
            type="button"
            className="map-skill-card"
            style={{ ...zoneBoxStyle(map, z), cursor: onSkillClick ? 'zoom-in' : 'default' }}
            onClick={() => onSkillClick?.(src, `${p?.name ?? '幸存者'}技能`)}
          >
            <img src={encodeURI(src)} alt={`${p?.name ?? ''}技能`} draggable={false} />
          </button>
        );
      })}
    </>
  );
}
