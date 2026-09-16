/**
 * 房间管理员：管“哪一桌牌局、谁坐在哪”。
 * 真正怎么走棋在 engine.ts；这里只负责开桌、入座、传话、散场。
 */
import { randomBytes } from 'node:crypto';
import type { GameContent } from '../content/loader.js';
import {
  addPlayer,
  buildSnapshot,
  createLobby,
  handleAction,
  listControllerIds,
  removePlayer,
} from './engine.js';
import type { ClientAction, GameState, PublicSnapshot } from './types.js';

/** 随机生成 4 位房间码，比如 A7K3。容易认错的字母（I、O、1、0）不用 */
function code(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[bytes[i]! % alphabet.length];
  return s;
}

export class RoomManager {
  /** 房间码 → 这一桌的完整棋盘（只有服务器自己看得见） */
  private rooms = new Map<string, GameState>();
  /** 某个人的网线编号 → 他坐在哪一桌 */
  private socketToRoom = new Map<string, string>();

  constructor(private content: GameContent) {}

  /** 改了规则或地图后，让以后新开的房间用新内容 */
  reloadContent(content: GameContent) {
    this.content = content;
  }

  /** 房主开一桌新牌，给他一张“他能看的”局面图 */
  create(hostSocketId: string, hostName: string, mapId?: string): PublicSnapshot {
    let roomCode = code();
    while (this.rooms.has(roomCode)) roomCode = code();
    const state = createLobby(roomCode, hostSocketId, hostName || '房主', this.content, mapId);
    this.rooms.set(roomCode, state);
    this.socketToRoom.set(hostSocketId, roomCode);
    return buildSnapshot(state, hostSocketId);
  }

  /** 同学拿房间码入座 */
  join(roomCode: string, socketId: string, name: string): PublicSnapshot {
    const state = this.rooms.get(roomCode.toUpperCase());
    if (!state) throw new Error('找不到房间');
    addPlayer(state, socketId, name || '玩家');
    this.socketToRoom.set(socketId, state.roomCode);
    return buildSnapshot(state, socketId);
  }

  /** 有人离开：房间不撤，座位留着，方便再进 */
  leave(socketId: string): { roomCode: string; snapshots: PublicSnapshot[] } | null {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;
    const state = this.rooms.get(roomCode);
    this.socketToRoom.delete(socketId);
    if (!state) return null;
    removePlayer(state, socketId);
    const connected = listControllerIds(state).filter((id) =>
      Object.values(state.players).some((p) => p.controllerId === id && p.connected),
    );
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

  /** 把玩家点的按钮交给规则引擎，再给桌上每个人各做一份能看的局面 */
  action(socketId: string, action: ClientAction): PublicSnapshot[] {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) throw new Error('你不在任何房间中');
    const state = this.rooms.get(roomCode);
    if (!state) throw new Error('房间已失效');
    handleAction(state, socketId, action, this.content);
    return listControllerIds(state).map((id) => buildSnapshot(state, id));
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
}
