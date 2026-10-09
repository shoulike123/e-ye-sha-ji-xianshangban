/**
 * 网页和服务器之间的“对讲机”。
 * 建房、加入、点行动按钮、离开，都从这里发出去；
 * 服务器算完棋，会把新局面（state）送回来。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * 最新快照的引用，给 `sendAction` 里的【诊断】日志用
   * （`useCallback` 里读不到最新的 `state`，用 ref 才不会拿到过期值）。
   */
  const stateRef = useRef<PublicSnapshot | null>(null);
  stateRef.current = state;
  /** 同队幸存者正在预选的地点（1对2 / 1对3 里用来互看鼠标预选） */
  const [cursors, setCursors] = useState<Array<{ playerId: string; roomId: string }>>([]);

  /**
   * 服务器为了省流量，**只有第一次**（以及换地图 / 重连）才把 `cardById`（全部卡牌定义，
   * 约 43 KB）和 `map`（地图坐标，约 11 KB）一起发过来 —— 这两块占了整份快照的四分之三，
   * 每点一次行动都重发一遍，异地联机就会明显卡。之后的快照里没有这两个字段，
   * 这里把它们缓存起来补回去，界面代码照旧读 `state.cardById` / `state.map`。
   *
   * （它只碰 ref 和 `setState`，引用永远稳定 —— 所以用到它的 effect / useCallback
   *   依赖数组里不必列它。）
   */
  const bigStaticRef = useRef<Pick<PublicSnapshot, 'cardById' | 'map'> | null>(null);
  const applySnapshot = useCallback((snap: PublicSnapshot) => {
    // 两块一起到了才更新缓存（服务器也是两块一起省掉的）
    if (snap.cardById && snap.map) {
      bigStaticRef.current = { cardById: snap.cardById, map: snap.map };
    }
    const cached = bigStaticRef.current;
    setState(cached ? { ...snap, ...cached } : snap);
  }, []);

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
            applySnapshot(res.state);
            setError(null);
            return;
          }
          /**
           * ⚠ **重连之后回不到原来那桌**（服务器重启过 / 房间被解散 / 座位没了）。
           *
           * 以前这里**什么都不做**：界面继续显示那份过期快照，
           * 点任何按钮服务端都回「你不在任何房间中」，看起来就是
           * 「挂久了啥都点不了」。现在直接退回主界面 + 说清原因。
           */
          clearRoomSession();
          setState(null);
          setCursors([]);
          setError(
            `原来的房间（${sess.roomCode}）已经不在了` +
              `${res?.error ? `：${res.error}` : '（服务器可能重启过）'} —— 请重新建房或加入。`,
          );
        },
      );
    });
    s.on('disconnect', () => {
      if (cancelled) return;
      setConnected(false);
      /**
       * 断线要**说出来**：只把标题栏那个小字改成"断线"太容易被忽略，
       * 玩家会以为"卡住了"。这里给一条明确提示（重连成功时会被清掉）。
       */
      setError('与服务器断线了，正在重连……（重连上会自动回到这一局）');
    });
    /**
     * 连不上（服务器没开 / 端口不通）也要有话说 —— 否则界面一直是"正在连接…"，
     * 玩家不知道是没开服务端还是自己点错了。
     */
    s.on('connect_error', (err: Error) => {
      if (cancelled) return;
      setConnected(false);
      setError(`连不上服务器（${err?.message ?? '未知原因'}）—— 确认服务端在跑、地址端口对得上。`);
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
      applySnapshot(snap);
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
   * 还没连上时不能用 `socket?.emit` —— 那样 Promise 永远不会 settle，
   * 调用方的 await 会一直挂着。这里统一拒绝并写进 error。
   *
   * ⚠ **光判 `socket` 不够**：socket 对象在挂载后就一直存在，
   * 断线时它只是 `connected === false` —— 那时 `emit` 会被 socket.io **缓存**，
   * 于是确认回调永远不来、`await sendAction` 永远挂着：
   * 表现就是用户说的「挂久了啥都点不了」（点击像石沉大海，也没有报错）。
   * 所以这里连 `connected` 一起判，断线时**立刻**给出提示。
   */
  const requireSocket = useCallback(
    (what: string) => {
      if (socket?.connected) return socket;
      const msg = socket
        ? `与服务器断线了，正在重连 —— 暂时不能${what}，稍等一下再点。`
        : `还没连上服务器，无法${what}`;
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
            applySnapshot(res.state);
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
        /**
         * 【诊断】把"发出这一刻，界面以为的局面"**附在请求里**一起发出去，
         * 同时打在浏览器控制台。
         *
         * 为什么要附在请求里：用户复现时只需要复制**服务器窗口**的日志，
         * 不用开 F12。服务端只认 `action.type` 等已知字段，多出来的
         * `__diag` 会被忽略，不影响任何规则。
         */
        const snap = stateRef.current;
        const diag = snap
          ? {
              动作: action.type,
              点到的地点: (action as { toRoomId?: string }).toRoomId ?? null,
              phase: snap.phase,
              遭遇步骤: snap.encounter?.step ?? null,
              撤离队列: (snap.encounter?.fleeQueue ?? []).map(
                (id) => `${snap.players.find((pl) => pl.id === id)?.name ?? '?'}(${id})`,
              ),
              界面里的我: `${snap.you.name}(${snap.you.id})`,
              轮到我: snap.controllingActive,
              可点地点: snap.legalMoves,
            }
          : null;
        if (diag) console.log('[诊断] 发操作', diag);
        const payload = (diag
          ? { ...action, __diag: diag }
          : action) as unknown as ClientAction;
        s.emit('action', payload, (res: { ok: boolean; error?: string }) => {
          if (res?.ok) {
            setError(null);
            resolve();
          } else {
            const msg = res?.error ?? 'action failed';
            console.warn('[诊断] 服务端拒绝', { 动作: action.type, 错误: msg });
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
