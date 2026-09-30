/**
 * 内容搬运工：从 content/ 文件夹把规则、地图、角色、卡牌读进来。
 * JSON 是“说明书”，这里负责打开说明书并检查有没有写错。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CardSchema,
  CharacterSchema,
  MapSchema,
  RulesSchema,
  SurvivorLayoutSchema,
  TraitSchema,
  type CardDef,
  type CharacterDef,
  type MapDef,
  type RulesDef,
  type SurvivorLayout,
  type TraitDef,
} from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_ROOT = path.resolve(__dirname, '../../../content');

/** 一局里要用到的全部说明书，装在一个大盒子里 */
export interface GameContent {
  rules: RulesDef;
  map: MapDef;
  maps: MapDef[];
  characters: CharacterDef[];
  cards: {
    search: CardDef[];
    discovery: CardDef[];
    killerAction: CardDef[];
    /** 乔治的笔记 */
    note: CardDef[];
    /** 宝藏牌堆（狼人）：3 张银质匕首 + 1 张银质子弹 */
    treasure: CardDef[];
    /** 遗物牌堆（墓穴 R6 遺物室） */
    relic: CardDef[];
    /** 未命名的进化卡牌（等级 2 / 4 二选一） */
    evolutionCard: CardDef[];
    byId: Record<string, CardDef>;
  };
  /** 【变体1】特性卡（幸存者 20 + 杀手 20） */
  traits: TraitDef[];
}

/** 把一个 JSON 文件读成电脑能懂的数据 */
function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/** 读取 content/maps 里每一张能玩的地图 */
function loadMaps(): MapDef[] {
  const dir = path.join(CONTENT_ROOT, 'maps');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => MapSchema.parse(readJson(path.join(dir, f))));
}

/**
 * 读取角色（杀手、幸存者），跳过 demo 练习档。
 * 结果按角色编号排序（killer1..9、survivor1..6），
 * 不依赖文件名/文件系统顺序 —— 否则 george.json 会排在 official.json 前面，
 * 导致选择界面的幸存者顺序错乱。
 */
function loadCharacters(): CharacterDef[] {
  const dir = path.join(CONTENT_ROOT, 'characters');
  const list: CharacterDef[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    if (f === 'demo.json') continue;
    const data = readJson(path.join(dir, f)) as { characters?: unknown[] };
    const arr = Array.isArray(data) ? data : data.characters ?? [];
    for (const c of arr) {
      list.push(CharacterSchema.parse(c));
    }
  }
  return list.sort((a, b) => characterOrder(a.id) - characterOrder(b.id));
}

/**
 * 显示顺序：**杀手在前、幸存者在后**，各自按编号排；认不出的排最后。
 *
 * ⚠ 必须把阵营也算进 key —— 只返回编号的话 `killer1` 和 `survivor1` 会得到同一个值，
 * 排序结果就取决于原数组顺序（角色合并到同一个文件后表现为两个阵营交错）。
 */
function characterOrder(id: string): number {
  const m = /^(killer|survivor)(\d+)$/.exec(id ?? '');
  if (!m) return 9999;
  return (m[1] === 'killer' ? 0 : 1000) + Number(m[2]);
}

/** 读取搜索牌、发现牌、杀手行动牌、乔治的笔记，并做成“按编号查找”的字典 */
function loadCards(): GameContent['cards'] {
  const dir = path.join(CONTENT_ROOT, 'cards');
  const search: CardDef[] = [];
  const discovery: CardDef[] = [];
  const killerAction: CardDef[] = [];
  const note: CardDef[] = [];
  const treasure: CardDef[] = [];
  /** 遗物牌堆（墓穴 R6 遺物室） */
  const relic: CardDef[] = [];
  /** 未命名的进化卡牌（等级 2 / 4 二选一） */
  const evolutionCard: CardDef[] = [];
  const byId: Record<string, CardDef> = {};

  const push = (list: CardDef[], raw: unknown) => {
    const card = CardSchema.parse(raw);
    list.push(card);
    byId[card.id] = card;
  };

  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
    if (f === 'demo.json') continue;
    const data = readJson(path.join(dir, f)) as {
      decks?: {
        search?: unknown[];
        discovery?: unknown[];
        killerAction?: unknown[];
        note?: unknown[];
        treasure?: unknown[];
        relic?: unknown[];
        evolutionCard?: unknown[];
      };
    };
    for (const c of data.decks?.search ?? []) push(search, c);
    for (const c of data.decks?.discovery ?? []) push(discovery, c);
    for (const c of data.decks?.killerAction ?? []) push(killerAction, c);
    for (const c of data.decks?.note ?? []) push(note, c);
    for (const c of data.decks?.treasure ?? []) push(treasure, c);
    for (const c of data.decks?.relic ?? []) push(relic, c);
    for (const c of data.decks?.evolutionCard ?? []) push(evolutionCard, c);
  }
  return { search, discovery, killerAction, note, treasure, relic, evolutionCard, byId };
}

/**
 * 【变体1】读取特性卡（`content/traits.json` 的 `traits` 数组）。
 *
 * 幸存者排前面、杀手排后面，各自按 index —— 抽牌池顺序要稳定。
 */
function loadTraits(): TraitDef[] {
  const file = path.join(CONTENT_ROOT, 'traits.json');
  if (!fs.existsSync(file)) return [];
  const data = readJson(file) as { traits?: unknown[] };
  const list = (data.traits ?? []).map((t) => TraitSchema.parse(t));
  return list.sort((a, b) => {
    if (a.faction !== b.faction) return a.faction === 'survivor' ? -1 : 1;
    return a.index - b.index;
  });
}

/** 开局时一次读齐：规则 + 默认地图 + 角色 + 牌堆 + 特性卡 */
export function loadContent(): GameContent {
  const rulesPath = path.join(CONTENT_ROOT, 'rules.json');
  const rules = RulesSchema.parse(readJson(rulesPath));
  const maps = loadMaps();
  const map = maps.find((m) => m.id === rules.mapId);
  if (!map) {
    throw new Error(`Map "${rules.mapId}" not found in content/maps`);
  }
  const characters = loadCharacters();
  if (characters.length === 0) {
    throw new Error('No characters found in content/characters');
  }
  const cards = loadCards();
  const traits = loadTraits();
  return { rules, map, maps, characters, cards, traits };
}

/** 根据地图编号找到它存在硬盘上的哪个文件 */
export function mapFilePath(mapId: string): string | null {
  const dir = path.join(CONTENT_ROOT, 'maps');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const file = path.join(dir, f);
    try {
      const data = readJson(file) as { id?: string };
      if (data.id === mapId) return file;
    } catch {
      /* skip */
    }
  }
  return null;
}

/** 校准工具改完地图后，写回 JSON 文件 */
export function saveMap(map: MapDef): MapDef {
  const parsed = MapSchema.parse(map);
  const existing = mapFilePath(parsed.id);
  const file = existing ?? path.join(CONTENT_ROOT, 'maps', `${parsed.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
}

/** 幸存者界面按钮/立绘该摆在哪，记在这个文件里 */
export function survivorLayoutPath() {
  return path.join(CONTENT_ROOT, 'ui', 'survivor-layout.json');
}

/** 读出幸存者界面摆放 */
export function loadSurvivorLayout(): SurvivorLayout {
  const file = survivorLayoutPath();
  if (!fs.existsSync(file)) {
    throw new Error('缺少 content/ui/survivor-layout.json');
  }
  return SurvivorLayoutSchema.parse(readJson(file));
}

/** 校准页保存幸存者界面摆放 */
export function saveSurvivorLayout(data: unknown): SurvivorLayout {
  const parsed = SurvivorLayoutSchema.parse(data);
  const file = survivorLayoutPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
}

/** 从这个房间能一步走到哪些房间（普通边；杀手专用边要额外允许） */
export function getNeighbors(
  map: MapDef,
  roomId: string,
  opts: { allowKiller?: boolean } = {},
): string[] {
  const out = new Set<string>();
  for (const e of map.edges) {
    if (e.pathType === 'killer' && !opts.allowKiller) continue;
    if (e.from === roomId) out.add(e.to);
    if ((e.bidirectional ?? true) && e.to === roomId) out.add(e.from);
  }
  return [...out];
}

/** 从这里走最多 maxSteps 步，能到哪些房间 */
export function roomsWithin(map: MapDef, from: string, maxSteps: number): Set<string> {
  const reachable = new Set<string>([from]);
  let frontier = [from];
  for (let step = 0; step < maxSteps; step++) {
    const next: string[] = [];
    for (const r of frontier) {
      for (const n of getNeighbors(map, r)) {
        if (!reachable.has(n)) {
          reachable.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return reachable;
}

