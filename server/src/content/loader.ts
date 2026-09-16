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
  type CardDef,
  type CharacterDef,
  type MapDef,
  type RulesDef,
  type SurvivorLayout,
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
    byId: Record<string, CardDef>;
  };
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

/** 读取角色（杀手、幸存者），跳过 demo 练习档 */
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
  return list;
}

/** 读取搜索牌、发现牌、杀手行动牌、乔治的笔记，并做成“按编号查找”的字典 */
function loadCards(): GameContent['cards'] {
  const dir = path.join(CONTENT_ROOT, 'cards');
  const search: CardDef[] = [];
  const discovery: CardDef[] = [];
  const killerAction: CardDef[] = [];
  const note: CardDef[] = [];
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
      };
    };
    for (const c of data.decks?.search ?? []) push(search, c);
    for (const c of data.decks?.discovery ?? []) push(discovery, c);
    for (const c of data.decks?.killerAction ?? []) push(killerAction, c);
    for (const c of data.decks?.note ?? []) push(note, c);
  }
  return { search, discovery, killerAction, note, byId };
}

/** 开局时一次读齐：规则 + 默认地图 + 角色 + 牌堆 */
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
  return { rules, map, maps, characters, cards };
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

/** 两间房最短要走几步；走不到就返回无穷大 */
export function shortestPathLength(map: MapDef, from: string, to: string): number {
  if (from === to) return 0;
  const q: Array<{ id: string; d: number }> = [{ id: from, d: 0 }];
  const seen = new Set<string>([from]);
  while (q.length) {
    const cur = q.shift()!;
    for (const n of getNeighbors(map, cur.id)) {
      if (seen.has(n)) continue;
      if (n === to) return cur.d + 1;
      seen.add(n);
      q.push({ id: n, d: cur.d + 1 });
    }
  }
  return Infinity;
}
