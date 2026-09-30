/**
 * 地图上的走路小帮手（网页用来高亮能走到的房间）。
 * 真正能不能走，还是服务器说了算。
 */
import type { MapDef } from './types';

/** 两间房之间的门号：房号排序后用 | 拼起来，与服务端 doorId 一致 */
export function doorKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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
  opts: {
    allowKiller?: boolean;
    ignoreBlockades?: boolean;
    blockades?: string[];
    /** 【城堡】机关大门：幸存者过不去（和封堵一样当墙用） */
    gateDoor?: string | null;
  } = {},
): string[] {
  if (!from) return [];
  const neigh = (cur: string) => {
    const out: string[] = [];
    for (const e of map.edges) {
      if (e.pathType === 'killer' && !opts.allowKiller) continue;
      let other: string | null = null;
      if (e.from === cur) other = e.to;
      else if ((e.bidirectional ?? true) && e.to === cur) other = e.from;
      if (!other) continue;
      if (!opts.ignoreBlockades && (!e.pathType || e.pathType === 'door')) {
        const key = doorKey(cur, other);
        if (opts.blockades?.includes(key)) continue;
        if (opts.gateDoor && key === opts.gateDoor) continue;
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

/** 一步能走到的邻居。
 *  `allowKiller`：是否允许走杀手专用边；`blockades`：这些门被封了就走不过去；
 *  `gateDoor`：【城堡】机关大门所在的那扇门 —— **幸存者绝对不能过**，
 *  所以对幸存者来说它和"被封堵的门"一样是墙（和服务端 `neighborsOpen` 同一口径）。
 *  传 `null` / 不传 = 没有机关大门，或这是杀手的移动（杀手要走"弃 3 张牌"的付费流程）。
 *  `allowPassages`：【未命名进化 1 级】「你可以〔移動〕通过秘密通道」——
 *  **只有杀手本人的移动**才打开它，感知/惊吓的距离计算一律不打开。 */
export function neighbors(
  map: MapDef,
  from: string,
  opts: {
    allowKiller?: boolean;
    blockades?: string[];
    allowPassages?: boolean;
    gateDoor?: string | null;
  } = {},
): string[] {
  const out: string[] = [];
  for (const e of map.edges) {
    if (e.pathType === 'killer' && !opts.allowKiller) continue;
    let other: string | null = null;
    if (e.from === from) other = e.to;
    else if ((e.bidirectional ?? true) && e.to === from) other = e.from;
    if (!other) continue;
    /** 只有"门 / 一般通道"才谈得上被封住；虚线小径、杀手通道不算 */
    if (!e.pathType || e.pathType === 'door') {
      const key = doorKey(from, other);
      if (opts.blockades?.length && opts.blockades.includes(key)) continue;
      /** 机关大门：门号两边都是排序后的写法（和服务端 `doorId` 一致），可直接比 */
      if (opts.gateDoor && key === opts.gateDoor) continue;
    }
    out.push(other);
  }
  /** 秘密通道：另一头直接算一步（不看门、也不看封堵） */
  if (opts.allowPassages) {
    for (const other of passageNeighbors(map, from)) {
      if (!out.includes(other)) out.push(other);
    }
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

/** 最多走 range 步能到的房间（不含原地）。
 *  ⚠ 距离计算**默认不含秘密通道**（`allowPassages` 不传即为 false）——
 *  感知 / 惊吓 / 恐惧的"几格以内"都不能被秘密通道缩短。 */
export function roomsWithin(
  map: MapDef,
  from: string,
  range: number,
  opts: { allowKiller?: boolean; allowPassages?: boolean; gateDoor?: string | null } = {},
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

/** 从 A 到 B 的路线，用来在地图上画预览箭头。
 *  - `allowKiller`：杀手要走杀手专用通道时必须开，否则会绕一大圈
 *  - `allowPassages`：只有【未命名 1 级】的杀手移动才开（见 `neighbors`）
 *  - `blockades`：幸存者不能穿已封堵的门；不传就不考虑封堵
 *  - `gateDoor`：【城堡】机关大门 —— 幸存者同样过不去
 *  - 多条同样短的路线时，稳定地选房号靠前的那条（避免同一个目的地每次显示不同路线） */
export function shortestPath(
  map: MapDef,
  from: string,
  to: string,
  opts: {
    allowKiller?: boolean;
    blockades?: string[];
    allowPassages?: boolean;
    gateDoor?: string | null;
  } = {},
): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighbors(map, cur, opts).sort()) {
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

