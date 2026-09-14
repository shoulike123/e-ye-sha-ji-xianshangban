/**
 * 网页和服务器之间的“对讲机”。
 * 建房、加入、点行动按钮、离开，都从这里发出去；
 * 服务器算完棋，会把新局面（state）送回来。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientAction, PublicSnapshot } from './types';

// 空着就连当前网页同一个地址（适合局域网 / Radmin）
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';
const SESSION_KEY = 'nh_room_session';

function readRoomSession(): { roomCode: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { roomCode?: string; name?: string };
    if (v.roomCode && v.name) return { roomCode: v.roomCode, name: v.name };
  } catch {
    /* ignore */
  }
  return null;
}

function writeRoomSession(roomCode: string, name: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, name }));
}

function clearRoomSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function useGameSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<PublicSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 打开网页就接上对讲机；关掉页面时挂断
  useEffect(() => {
    const s = io(SOCKET_URL || undefined, { transports: ['websocket', 'polling'] });
    setSocket(s);
    s.on('connect', () => {
      setConnected(true);
      const sess = readRoomSession();
      if (!sess) return;
      s.emit(
        'joinRoom',
        { roomCode: sess.roomCode, name: sess.name },
        (res: { ok: boolean; state?: PublicSnapshot; error?: string }) => {
          if (res?.ok && res.state) {
            setState(res.state);
            setError(null);
          }
        },
      );
    });
    s.on('disconnect', () => setConnected(false));
    s.on('state', (snap: PublicSnapshot) => {
      setState(snap);
      setError(null);
    });
    return () => {
      s.disconnect();
    };
  }, []);

  /** 请服务器开一桌新牌 */
  const createRoom = useCallback(
    (name: string, mapId?: string) =>
      new Promise<PublicSnapshot>((resolve, reject) => {
        socket?.emit('createRoom', { name, mapId }, (res: { ok: boolean; state?: PublicSnapshot; error?: string }) => {
          if (res?.ok && res.state) {
            writeRoomSession(res.state.roomCode, name);
            setState(res.state);
            resolve(res.state);
          } else reject(new Error(res?.error ?? 'create failed'));
        });
      }),
    [socket],
  );

  /** 拿房间码坐下 */
  const joinRoom = useCallback(
    (roomCode: string, name: string) =>
      new Promise<PublicSnapshot>((resolve, reject) => {
        socket?.emit(
          'joinRoom',
          { roomCode, name },
          (res: { ok: boolean; state?: PublicSnapshot; error?: string }) => {
            if (res?.ok && res.state) {
              writeRoomSession(res.state.roomCode, name);
              setState(res.state);
              resolve(res.state);
            } else reject(new Error(res?.error ?? 'join failed'));
          },
        );
      }),
    [socket],
  );

  /** 把玩家点的行动（移动、打牌、结束回合……）送给规则引擎 */
  const sendAction = useCallback(
    (action: ClientAction) =>
      new Promise<void>((resolve, reject) => {
        socket?.emit('action', action, (res: { ok: boolean; error?: string }) => {
          if (res?.ok) {
            setError(null);
            resolve();
          } else {
            const msg = res?.error ?? 'action failed';
            setError(msg);
            reject(new Error(msg));
          }
        });
      }),
    [socket],
  );

  /** 离开房间，网页回到“创建 / 加入” */
  const leaveRoom = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        socket?.emit('leaveRoom', (res: { ok: boolean; error?: string }) => {
          if (res?.ok) {
            clearRoomSession();
            setState(null);
            setError(null);
            resolve();
          } else {
            const msg = res?.error ?? 'leave failed';
            setError(msg);
            reject(new Error(msg));
          }
        });
      }),
    [socket],
  );

  return useMemo(
    () => ({ connected, state, error, setError, createRoom, joinRoom, sendAction, leaveRoom }),
    [connected, state, error, createRoom, joinRoom, sendAction, leaveRoom],
  );
}
