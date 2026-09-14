/**
 * 地图上的走路小帮手（网页用来高亮能走到的房间）。
 * 真正能不能走，还是服务器说了算。
 */
import type { MapDef } from './types';

/** 门或虚线连着的邻居（威士忌扔瓶子用这种） */
export function generalNeighbors(map: MapDef, from: string): string[] {
  const out: string[] = [];
  for (const e of map.edges) {
    const t = e.pathType;
    if (t && t !== 'door' && t !== 'dash') continue;
    if (e.from === from) out.push(e.to);
    if ((e.bidirectional ?? true) && e.to === from) out.push(e.from);
  }
  return out;
}

/** 走出 min～max 步能到的房间。封堵的门默认过不去 */
export function roomsAtDistance(
  map: MapDef,
  from: string,
  min: number,
  max: number,
  opts: { allowKiller?: boolean; ignoreBlockades?: boolean; blockades?: string[] } = {},
): string[] {
  if (!from) return [];
  const doorKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const neigh = (cur: string) => {
    const out: string[] = [];
    for (const e of map.edges) {
      if (e.pathType === 'killer' && !opts.allowKiller) continue;
      let other: string | null = null;
      if (e.from === cur) other = e.to;
      else if ((e.bidirectional ?? true) && e.to === cur) other = e.from;
      if (!other) continue;
      if (!opts.ignoreBlockades && (!e.pathType || e.pathType === 'door') && opts.blockades?.includes(doorKey(cur, other))) {
        continue;
      }
      out.push(other);
    }
    return out;
  };
  const dist = new Map<string, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    if (d >= max) continue;
    for (const n of neigh(cur)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return [...dist.entries()].filter(([, d]) => d >= min && d <= max).map(([id]) => id);
}

/** 一步能走到的邻居（可选是否走杀手专用边） */
export function neighbors(
  map: MapDef,
  from: string,
  opts: { allowKiller?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const e of map.edges) {
    if (e.pathType === 'killer' && !opts.allowKiller) continue;
    if (e.from === from) out.push(e.to);
    if ((e.bidirectional ?? true) && e.to === from) out.push(e.from);
  }
  return out;
}

/** 秘密通道的另一头（手电筒 / 观察入微用） */
export function passageNeighbors(map: MapDef, from: string): string[] {
  const out: string[] = [];
  for (const e of map.passages ?? []) {
    if (e.from === from) out.push(e.to);
    if ((e.bidirectional ?? true) && e.to === from) out.push(e.from);
  }
  return out;
}

/** 最多走 range 步能到的房间（不含原地） */
export function roomsWithin(
  map: MapDef,
  from: string,
  range: number,
  opts: { allowKiller?: boolean } = {},
): string[] {
  if (!from || range <= 0) return [];
  const dist = new Map<string, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    if (d >= range) continue;
    for (const n of neighbors(map, cur, opts)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  dist.delete(from);
  return [...dist.keys()];
}

/** 从 A 到 B 的最短路线，用来在地图上画预览箭头 */
export function shortestPath(
  map: MapDef,
  from: string,
  to: string,
  opts: { allowKiller?: boolean } = {},
): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighbors(map, cur, opts)) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [to];
        let walk: string | null = cur;
        while (walk) {
          path.push(walk);
          walk = prev.get(walk) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

/** 最短路有几步；走不到就是无穷大 */
export function pathLength(map: MapDef, from: string, to: string): number {
  const path = shortestPath(map, from, to);
  return path ? path.length - 1 : Infinity;
}
