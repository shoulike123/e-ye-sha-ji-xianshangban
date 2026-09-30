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
  /** 同队幸存者正在预选的地点（1对2 / 1对3 里用来互看鼠标预选） */
  const [cursors, setCursors] = useState<Array<{ playerId: string; roomId: string }>>([]);

  // 打开网页就接上对讲机；关掉页面时挂断
  useEffect(() => {
    /**
     * React 19 的 `StrictMode`（dev）会把 effect 跑两遍：挂载 → 卸载 → 再挂载。
     * 这里用一个取消标志，让**第一次**那根连接的异步回调在卸载后彻底失效，
     * 不会再把旧快照写回 state（生产构建本来只跑一次，不受影响）。
     */
    let cancelled = false;
    const s = io(SOCKET_URL || undefined, { transports: ['websocket', 'polling'] });
    setSocket(s);
    s.on('connect', () => {
      if (cancelled) return;
      setConnected(true);
      const sess = readRoomSession();
      if (!sess) return;
      s.emit(
        'joinRoom',
        { roomCode: sess.roomCode, name: sess.name },
        (res: { ok: boolean; state?: PublicSnapshot; error?: string }) => {
          if (cancelled) return;
          if (res?.ok && res.state) {
            setState(res.state);
            setError(null);
          }
        },
      );
    });
    s.on('disconnect', () => {
      if (cancelled) return;
      setConnected(false);
    });
    s.on('state', (snap: PublicSnapshot) => {
      if (cancelled) return;
      /**
       * 【解散房间】全员确认后服务器把房间删了，最后一份快照带着 `disbanded: true`。
       * 收到就清掉"我在哪一桌"的记忆，直接回主界面 —— 不清的话刷新页面
       * 还会拿旧房间码去 join，得到"找不到房间"。
       */
      if (snap?.disbanded) {
        clearRoomSession();
        setState(null);
        setCursors([]);
        setError(null);
        return;
      }
      setState(snap);
      setError(null);
    });
    // 同队其他人的鼠标预选：服务器每次发完整列表，直接覆盖
    s.on('cursors', (list: Array<{ playerId: string; roomId: string }>) => {
      if (cancelled) return;
      setCursors(Array.isArray(list) ? list : []);
    });
    return () => {
      cancelled = true;
      s.disconnect();
    };
  }, []);

  /**
   * 还没连上时不能用 socket?.emit —— 那样 Promise 永远不会 settle，
   * 调用方的 await 会一直挂着。这里统一拒绝并写进 error。
   */
  const requireSocket = useCallback(
    (what: string) => {
      if (socket) return socket;
      const msg = `还没连上服务器，无法${what}`;
      setError(msg);
      throw new Error(msg);
    },
    [socket],
  );

  /** 请服务器开一桌新牌 */
  const createRoom = useCallback(
    (name: string, mapId?: string) =>
      new Promise<PublicSnapshot>((resolve, reject) => {
        let s: Socket;
        try {
          s = requireSocket('创建房间');
        } catch (e) {
          reject(e as Error);
          return;
        }
        s.emit('createRoom', { name, mapId }, (res: { ok: boolean; state?: PublicSnapshot; error?: string }) => {
          if (res?.ok && res.state) {
            writeRoomSession(res.state.roomCode, name);
            setState(res.state);
            resolve(res.state);
          } else reject(new Error(res?.error ?? 'create failed'));
        });
      }),
    [requireSocket],
  );

  /** 拿房间码坐下 */
  const joinRoom = useCallback(
    (roomCode: string, name: string) =>
      new Promise<PublicSnapshot>((resolve, reject) => {
        let s: Socket;
        try {
          s = requireSocket('加入房间');
        } catch (e) {
          reject(e as Error);
          return;
        }
        s.emit(
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
    [requireSocket],
  );

  /** 把玩家点的行动（移动、打牌、结束回合……）送给规则引擎 */
  const sendAction = useCallback(
    (action: ClientAction) =>
      new Promise<void>((resolve, reject) => {
        let s: Socket;
        try {
          s = requireSocket('发送操作');
        } catch (e) {
          reject(e as Error);
          return;
        }
        s.emit('action', action, (res: { ok: boolean; error?: string }) => {
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
    [requireSocket],
  );

  /** 离开房间，网页回到“创建 / 加入” */
  const leaveRoom = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        let s: Socket;
        try {
          s = requireSocket('离开房间');
        } catch (e) {
          reject(e as Error);
          return;
        }
        s.emit('leaveRoom', (res: { ok: boolean; error?: string }) => {
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
    [requireSocket],
  );

  /**
   * 把「我现在鼠标预选哪一格」告诉同队其他人（fire-and-forget，不等回执）。
   * 只有 1对2 / 1对3 里才有意义；其它模式服务端也不会转发给杀手。
   */
  const sendCursor = useCallback(
    (roomId: string | null) => {
      if (!socket) return;
      socket.emit('cursorRoom', { roomId });
    },
    [socket],
  );

  return useMemo(
    () => ({
      connected, state, error, setError, createRoom, joinRoom, sendAction, leaveRoom,
      cursors, sendCursor,
    }),
    [connected, state, error, cursors, createRoom, joinRoom, sendAction, leaveRoom, sendCursor],
  );
}
