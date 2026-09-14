/**
 * 游戏网页的外壳。
 * 还没进房间：显示“创建 / 加入”。
 * 选角色时：显示大厅。
 * 开打后：显示棋盘和对局界面。
 */
import { useEffect, useState, type FormEvent } from 'react';
import { GameView, LobbyView } from './GameViews';
import { useGameSocket } from './useGameSocket';

interface MapOption {
  id: string;
  name: string;
}

export default function App() {
  const { connected, state, error, setError, createRoom, joinRoom, sendAction, leaveRoom } = useGameSocket();
  const [name, setName] = useState(() => localStorage.getItem('nh_name') ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [maps, setMaps] = useState<MapOption[]>([]);
  const [mapId, setMapId] = useState(() => localStorage.getItem('nh_map') ?? '');
  const [lanUrls, setLanUrls] = useState<string[]>([]);

  // 问服务器：有哪些地图、同学该打开哪个网址
  useEffect(() => {
    fetch('/api/content/meta')
      .then((r) => r.json())
      .then((data: { maps?: MapOption[]; mapId?: string; lanUrls?: string[] }) => {
        const list = data.maps ?? [];
        setMaps(list);
        setMapId((prev) => prev || data.mapId || list[0]?.id || '');
        if (data.lanUrls?.length) setLanUrls(data.lanUrls);
      })
      .catch(() => {
        /* meta optional before server is up */
      });
  }, []);

  /** 点“创建”：记住昵称和地图，请服务器开一桌 */
  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem('nh_name', name);
      if (mapId) localStorage.setItem('nh_map', mapId);
      await createRoom(name || '房主', mapId || undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 点“加入”：带上房间码入座 */
  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem('nh_name', name);
      await joinRoom(code.trim().toUpperCase(), name || '玩家');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inLobby =
    state && (state.phase === 'lobby' || state.phase === 'characterSelect');
  const inGame =
    state &&
    state.phase !== 'lobby' &&
    state.phase !== 'characterSelect';

  const isHost = Boolean(state?.isHost);

  /** 单人热座回到标题。confirmExit=true 时会先问一句，避免误点散局 */
  const leaveToHome = async (confirmExit: boolean) => {
    if (confirmExit && !window.confirm('退出后当前单人对局将结束。确定回到主界面？')) return;
    try {
      await leaveRoom();
    } catch {
      /* shown via error */
    }
  };

  return (
    <div className={`app-shell${inGame ? ' in-game' : ''}`}>
      {inGame && state ? (
        <header className="game-chrome">
          <h1>恶夜杀机</h1>
          <span className="muted">房间 {state.roomCode}</span>
          <span className="muted">{connected ? '已连接' : '断线'}</span>
        </header>
      ) : (
        <header className="hero">
          <h1>恶夜杀机</h1>
          <p>
            跟同学玩：建房后把房间码发给他们。同一 WiFi 下打开
            {lanUrls.length ? (
              <>
                {' '}
                {lanUrls.map((u, i) => (
                  <span key={u}>
                    {i > 0 ? ' 或 ' : ''}
                    <code>{u}</code>
                  </span>
                ))}
              </>
            ) : (
              <> 你这台电脑的局域网地址（端口 5173）</>
            )}
            ，输入房间码加入。1 对 1：房主切「1对1」，一人杀手、一人操控 3 名求生者。1VS2：切「1VS2」，一人杀手、两人共控 3 名求生者。1VS3：切「1VS3」，需要 1 名杀手 + 3 名求生者，每人只操控自己的角色。
          </p>
          <p className="muted">{connected ? '已连接服务器' : '正在连接…'}</p>
        </header>
      )}

      {!state && (
        <div className="lobby-grid">
          <form className="panel stack" onSubmit={onCreate}>
            <h2>创建房间</h2>
            <label className="stack">
              <span className="muted">昵称</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="房主" />
            </label>
            {maps.length > 0 && (
              <label className="stack">
                <span className="muted">地图</span>
                <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
                  {maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="primary" type="submit" disabled={!connected || busy}>
              创建
            </button>
          </form>
          <form className="panel stack" onSubmit={onJoin}>
            <h2>加入房间</h2>
            <label className="stack">
              <span className="muted">昵称</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="玩家" />
            </label>
            <label className="stack">
              <span className="muted">房间码</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={6}
              />
            </label>
            <button className="primary" type="submit" disabled={!connected || busy || !code}>
              加入
            </button>
          </form>
        </div>
      )}

      {error && !state && <p className="error">{error}</p>}

      {inLobby && state && (
        <LobbyView
          state={state}
          isHost={isHost}
          error={error}
          onAction={async (a) => {
            try {
              await sendAction(a);
            } catch {
              /* shown via error */
            }
          }}
          onLeave={state.mode === 'solo' ? () => void leaveToHome(false) : undefined}
        />
      )}

      {inGame && state && (
        <GameView
          state={state}
          isHost={isHost}
          error={error}
          onAction={async (a) => {
            try {
              await sendAction(a);
            } catch {
              /* shown */
            }
          }}
          onLeave={state.mode === 'solo' ? () => void leaveToHome(true) : undefined}
        />
      )}
    </div>
  );
}
