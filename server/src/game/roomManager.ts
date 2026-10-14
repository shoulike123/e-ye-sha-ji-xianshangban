/**
 * 房间管理员：管“哪一桌牌局、谁坐在哪”。
 * 真正怎么走棋在 engine.ts；这里只负责开桌、入座、传话、散场。
 *
 * 房间写在磁盘上。进程被重启（关掉 Cursor、tsx 热重载）之后还能按房间码回来。
 * 一桌人全部离开后，进度再留 5 分钟，到点才真正解散。
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameContent } from '../content/loader.js';
import { log } from './effects.js';
import {
  addPlayer,
  buildSnapshot,
  createLobby,
  handleAction,
  listControllerIds,
  removePlayer,
} from './engine.js';
import type { ClientAction, GameState, PublicSnapshot } from './types.js';

/** 全员离开之后，房间和进度还留这么久 */
export const EMPTY_ROOM_MS = 5 * 60 * 1000;

const SAVE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/rooms');

/** 随机生成 4 位房间码，比如 A7K3。容易认错的字母（I、O、1、0）不用 */
function code(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[bytes[i]! % alphabet.length];
  return s;
}

function anyoneConnected(state: GameState): boolean {
  if (Object.values(state.players).some((p) => p.connected)) return true;
  return (state.survivorOperators ?? []).some((o) => o.connected);
}

/** 进程刚起来时，旧的网线编号都作废，座位改成“人走了、位子还在” */
function detachSockets(state: GameState): void {
  for (const p of Object.values(state.players)) p.connected = false;
  for (const o of state.survivorOperators ?? []) o.connected = false;
}

function serializeState(state: GameState): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Set) return { __set: [...value] };
    return value;
  });
}

function reviveState(raw: string): GameState {
  const state = JSON.parse(raw, (_key, value) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Array.isArray((value as { __set?: unknown }).__set) &&
      Object.keys(value as object).length === 1
    ) {
      return new Set((value as { __set: string[] }).__set);
    }
    return value;
  }) as GameState;
  for (const p of Object.values(state.players ?? {})) {
    if (!(p.skillUsedThisTurn instanceof Set)) {
      const rawSkill = p.skillUsedThisTurn as unknown;
      p.skillUsedThisTurn = new Set(Array.isArray(rawSkill) ? rawSkill as string[] : []);
    }
  }
  if (!state.survivorOperators) state.survivorOperators = [];
  if (!state.logs) state.logs = [];
  return state;
}

interface SavedRoom {
  emptySince: number | null;
  state: unknown;
}

export class RoomManager {
  /** 房间码 → 这一桌的完整棋盘（只有服务器自己看得见） */
  private rooms = new Map<string, GameState>();
  /** 某个人的网线编号 → 他坐在哪一桌 */
  private socketToRoom = new Map<string, string>();
  /** 这桌从什么时候开始一个人都不在。没有这项 = 还有人连着 */
  private emptySince = new Map<string, number>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private content: GameContent, private saveDir = SAVE_DIR) {
    this.loadAll();
  }

  /** 改了规则或地图后，让以后新开的房间用新内容 */
  reloadContent(content: GameContent) {
    this.content = content;
  }

  /** 每隔一会儿看有没有空房间到期。不挡住进程退出。 */
  startHousekeeping(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), 10_000);
    this.sweepTimer.unref?.();
  }

  /** 进程要退了：把每一桌写盘，避免重启丢掉最后一步 */
  flushAll(): void {
    for (const roomCode of this.rooms.keys()) this.persist(roomCode);
  }

  /**
   * 到期的空房间解散。
   * `now` 只给测试用，正式跑用当前时间。
   */
  sweep(now = Date.now()): string[] {
    const gone: string[] = [];
    for (const [roomCode, since] of this.emptySince) {
      if (now - since < EMPTY_ROOM_MS) continue;
      this.forget(roomCode);
      gone.push(roomCode);
      console.log(`房间 ${roomCode} 已无人超过 5 分钟，进度已解散。`);
    }
    return gone;
  }

  /** 房主开一桌新牌，给他一张“他能看的”局面图 */
  create(hostSocketId: string, hostName: string, mapId?: string): PublicSnapshot {
    let roomCode = code();
    while (this.rooms.has(roomCode)) roomCode = code();
    const state = createLobby(roomCode, hostSocketId, hostName || '房主', this.content, mapId);
    this.rooms.set(roomCode, state);
    this.socketToRoom.set(hostSocketId, roomCode);
    this.touch(roomCode);
    return buildSnapshot(state, hostSocketId);
  }

  /** 同学拿房间码入座 */
  join(roomCode: string, socketId: string, name: string): PublicSnapshot {
    const state = this.rooms.get(roomCode.toUpperCase());
    if (!state) throw new Error('找不到房间');
    addPlayer(state, socketId, name || '玩家');
    this.socketToRoom.set(socketId, state.roomCode);
    this.touch(state.roomCode);
    return buildSnapshot(state, socketId);
  }

  /** 有人离开：房间不立刻撤。全员离开后进度再留 5 分钟。 */
  leave(socketId: string): { roomCode: string; snapshots: PublicSnapshot[] } | null {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;
    const state = this.rooms.get(roomCode);
    this.socketToRoom.delete(socketId);
    if (!state) return null;
    removePlayer(state, socketId);
    this.touch(roomCode);
    const connected = listControllerIds(state);
    return {
      roomCode,
      snapshots: connected.map((id) => {
        try {
          return buildSnapshot(state, id);
        } catch {
          return null;
        }
      }).filter((s): s is PublicSnapshot => Boolean(s)),
    };
  }

  /**
   * 把玩家点的按钮交给规则引擎，再给桌上每个人各做一份能看的局面。
   *
   * 【解散房间】：所有人都确认之后 `state.disbanded` 会被置上 —— 这时要
   * **先把每个人的快照做出来**（里面带着 `disbanded: true`，客户端据此回主界面），
   * 再把这一桌从服务器上彻底删掉，并把这几个网线的"坐在哪一桌"一并清掉。
   */
  action(socketId: string, action: ClientAction): {
    snapshots: Array<{ socketId: string; snapshot: PublicSnapshot }>;
    disbanded: boolean;
    roomCode: string;
  } {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) throw new Error('你不在任何房间中');
    const state = this.rooms.get(roomCode);
    if (!state) throw new Error('房间已失效');
    handleAction(state, socketId, action, this.content);
    const snapshots = listControllerIds(state).map((id) => ({
      socketId: id,
      snapshot: buildSnapshot(state, id),
    }));
    if (!state.disbanded) {
      this.touch(roomCode);
      return { snapshots, disbanded: false, roomCode };
    }
    for (const { socketId: id } of snapshots) this.socketToRoom.delete(id);
    this.socketToRoom.delete(socketId);
    this.forget(roomCode);
    return { snapshots, disbanded: true, roomCode };
  }

  /** 只给这个人看他该看的信息 */
  snapshotFor(socketId: string): PublicSnapshot | null {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;
    const state = this.rooms.get(roomCode);
    if (!state) return null;
    try {
      return buildSnapshot(state, socketId);
    } catch {
      return null;
    }
  }

  /** 这个人现在坐在哪一桌 */
  roomCodeOf(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  /** 这桌上还连着网的人（用来挨个推送局面） */
  listConnectedSockets(roomCode: string): string[] {
    const state = this.rooms.get(roomCode);
    if (!state) return [];
    return listControllerIds(state);
  }

  /** 这一桌的原始棋盘（只有服务器自己用；别发给客户端） */
  stateOf(roomCode: string): GameState | undefined {
    return this.rooms.get(roomCode);
  }

  /** 这桌从什么时候开始空着。还有人时是 null。 */
  emptySinceOf(roomCode: string): number | null {
    return this.emptySince.get(roomCode) ?? null;
  }

  private touch(roomCode: string): void {
    const state = this.rooms.get(roomCode);
    if (!state) return;
    if (anyoneConnected(state)) {
      if (this.emptySince.delete(roomCode)) {
        console.log(`房间 ${roomCode} 有人回来了，取消 5 分钟解散。`);
      }
    } else if (!this.emptySince.has(roomCode)) {
      this.emptySince.set(roomCode, Date.now());
      log(state, '房间里暂时没有人。5 分钟内用原来的房间码和昵称回来，这一局还在。');
      console.log(`房间 ${roomCode} 已无人，进度保留 5 分钟。`);
    }
    this.persist(roomCode);
  }

  private persist(roomCode: string): void {
    const state = this.rooms.get(roomCode);
    if (!state) return;
    try {
      fs.mkdirSync(this.saveDir, { recursive: true });
      const file = this.fileOf(roomCode);
      const tmp = `${file}.${process.pid}.tmp`;
      const body = JSON.stringify({
        emptySince: this.emptySince.get(roomCode) ?? null,
        state: JSON.parse(serializeState(state)),
      });
      fs.writeFileSync(tmp, body);
      fs.rmSync(file, { force: true });
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error(`房间 ${roomCode} 存盘失败`, e);
    }
  }

  private loadAll(): void {
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.saveDir);
    } catch {
      return;
    }
    const now = Date.now();
    for (const name of names) {
      if (!/^[A-Z0-9]{4}\.json$/i.test(name)) continue;
      const file = path.join(this.saveDir, name);
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SavedRoom;
        const state = reviveState(JSON.stringify(saved.state));
        const roomCode = state.roomCode || name.slice(0, 4).toUpperCase();
        detachSockets(state);
        let since = typeof saved.emptySince === 'number' ? saved.emptySince : null;
        if (since == null) since = now;
        if (now - since >= EMPTY_ROOM_MS) {
          fs.unlinkSync(file);
          console.log(`房间 ${roomCode} 空置已超过 5 分钟，启动时不再恢复。`);
          continue;
        }
        this.rooms.set(roomCode, state);
        this.emptySince.set(roomCode, since);
        console.log(`已恢复房间 ${roomCode}（无人时 5 分钟内可凭原昵称回来）。`);
      } catch (e) {
        console.error(`房间存档读不了：${file}`, e);
      }
    }
  }

  /** 主动解散，或空置到期：内存和磁盘一起清掉 */
  private forget(roomCode: string): void {
    this.rooms.delete(roomCode);
    this.emptySince.delete(roomCode);
    for (const [sid, code] of this.socketToRoom) {
      if (code === roomCode) this.socketToRoom.delete(sid);
    }
    try {
      fs.unlinkSync(this.fileOf(roomCode));
    } catch {
      /* 本来就没有存档 */
    }
  }

  private fileOf(roomCode: string): string {
    return path.join(this.saveDir, `${roomCode.toUpperCase()}.json`);
  }
}
