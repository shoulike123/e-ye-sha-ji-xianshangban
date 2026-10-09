/**
 * 游戏服务器大门。
 * 小朋友可以把它想成：一台电脑在开店。
 * - 网页（5173）是店门口的样子
 * - 这个文件（8787）是柜台：收玩家指令、发游戏状态、给图片和地图
 */
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { loadContent, saveMap, loadSurvivorLayout, saveSurvivorLayout, CONTENT_ROOT } from './content/loader.js';
import { MapSchema, type MapDef } from './content/schema.js';
import { RoomManager } from './game/roomManager.js';
import type { ClientAction } from './game/types.js';

// 游戏规则服务器端口。网页默认 5173，真正算规则在 8787
const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);
const PROJECT_ROOT = path.resolve(CONTENT_ROOT, '..');
const IMAGE_ROOT = path.join(PROJECT_ROOT, 'Image');
const MAP_DEBUG_ROOT = path.join(PROJECT_ROOT, 'tools', 'map-debug');
const MAP_CALIBRATE_ROOT = path.join(PROJECT_ROOT, 'tools', 'map-calibrate');
const UI_DEBUG_ROOT = path.join(PROJECT_ROOT, 'tools', 'ui-debug');
const UI_LAYOUT_ROOT = path.join(PROJECT_ROOT, 'tools', 'ui-layout');

// 开店时先把规则、地图、卡牌读进内存；房间管理员负责管每一桌牌局
let content = loadContent();
const rooms = new RoomManager(content);

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
/**
 * 图片（地图底图、卡面）一动都不动，给浏览器一个长缓存。
 * ⚠ 浏览器在这段时间里**不会再问服务器**：换了图要 `Ctrl+F5` 才会立刻看到。
 */
app.use('/Image', express.static(IMAGE_ROOT, { maxAge: '7d' }));
app.use('/map-debug', express.static(MAP_DEBUG_ROOT));
app.use('/map-calibrate', express.static(MAP_CALIBRATE_ROOT));
app.use('/ui-debug', express.static(UI_DEBUG_ROOT));
app.use('/ui-layout', express.static(UI_LAYOUT_ROOT));

/** 找出这台电脑在局域网 / Radmin 上的 IP，方便同学用浏览器连进来 */
function lanOrigins(port: number): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.internal) continue;
      if (a.family === 'IPv4' || (a.family as unknown) === 4) {
        out.push(`http://${a.address}:${port}`);
      }
    }
  }
  return out;
}

/** 只列出画好背景图、能真正开打的地图 */
function playableMaps() {
  return content.maps.filter((m) => m.backgrounds?.survivor || m.backgrounds?.killer);
}

// —— 下面这些 /api/... 是网页问服务器“现在怎样了”的小窗口 ——
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    contentRoot: CONTENT_ROOT,
    rules: content.rules.id,
    map: content.map.id,
    maps: playableMaps().map((m) => m.id),
    characters: content.characters.length,
    searchCards: content.cards.search.length,
    lanUrls: lanOrigins(CLIENT_PORT),
    clientPort: CLIENT_PORT,
    serverPort: PORT,
  });
});

app.get('/api/content/meta', (_req, res) => {
  res.json({
    rules: content.rules,
    mapId: content.map.id,
    mapName: content.map.name,
    maps: playableMaps().map((m) => ({
      id: m.id,
      name: m.name,
      backgrounds: m.backgrounds,
    })),
    characters: content.characters.map((c) => ({
      id: c.id,
      name: c.name,
      faction: c.faction,
      description: c.description,
      maxHp: c.maxHp,
      skills: c.skills,
    })),
    lanUrls: lanOrigins(CLIENT_PORT),
  });
});

app.get('/api/maps', (_req, res) => {
  res.json(playableMaps().map((m) => ({ id: m.id, name: m.name, backgrounds: m.backgrounds })));
});

app.get('/api/maps/:id', (req, res) => {
  const map = content.maps.find((m) => m.id === req.params.id);
  if (!map) {
    res.status(404).json({ ok: false, error: '地图不存在' });
    return;
  }
  res.json(map);
});

app.put('/api/maps/:id', (req, res) => {
  try {
    const body = { ...(req.body as MapDef), id: req.params.id };
    const parsed = MapSchema.parse(body);
    const saved = saveMap(parsed);
    content = loadContent();
    rooms.reloadContent(content);
    res.json({ ok: true, map: saved });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

app.get('/api/calibrate/assets', (_req, res) => {
  const uiDir = path.join(IMAGE_ROOT, 'UI');
  const files = fs
    .readdirSync(uiDir)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f) && fs.statSync(path.join(uiDir, f)).isFile())
    .map((f) => ({
      id: path.basename(f, path.extname(f)),
      src: `/Image/UI/${f}`,
      label: path.basename(f, path.extname(f)),
    }));
  res.json(files);
});

app.get('/api/ui/survivor-layout', (_req, res) => {
  try {
    res.json(loadSurvivorLayout());
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.put('/api/ui/survivor-layout', (req, res) => {
  try {
    const saved = saveSurvivorLayout(req.body);
    res.json({ ok: true, layout: saved });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  /**
   * 每次行动的"新局面"是一大坨 JSON（字段名高度重复），
   * 压缩之后通常只剩十分之一 —— 异地联机靠这条最省。
   * `threshold` 是"小于 1KB 就别压了"，省得为几句小消息白费 CPU。
   */
  perMessageDeflate: { threshold: 1024 },
});

/** 房间里每条网线已经收过哪一版"静态大块"（见 sendState） */
const sentStatic = new Map<string, string>();

/**
 * 发一份快照给某条网线。
 *
 * ⚠ **为什么不能全量发**：快照里有两块**一整局都不会变**的大东西 ——
 * `cardById`（全部卡牌定义，约 43 KB）和 `map`（地图坐标/砖块，约 11 KB），
 * 加起来占了整份快照（约 73 KB）的四分之三。
 * 每点一次行动、给每个人都重发一遍，异地联机（Radmin / 隧道）就会明显卡。
 *
 * 所以：**第一次发给这条网线时发全**，之后只发会变的那部分；
 * 客户端发现少了这两个字段时，就沿用上一次收到的（见 `useGameSocket.ts`）。
 *
 * - 换地图 → `map.id` 变了 → 指纹变 → 自动重发全量 ✓
 * - 网线重连会拿到新的 `socket.id` → 也会重发全量 ✓
 */
function sendState(sid: string, snapshot: unknown) {
  const sig = String((snapshot as { map?: { id?: string } })?.map?.id ?? '');
  if (sentStatic.get(sid) === sig) {
    const light = { ...(snapshot as Record<string, unknown>) };
    delete light.cardById;
    delete light.map;
    io.to(sid).emit('state', light);
    return;
  }
  sentStatic.set(sid, sig);
  io.to(sid).emit('state', snapshot);
}

/** 房间里每个人看到的信息不一样（杀手看不到幸存者背包），所以要挨个发快照 */
function pushToRoom(roomCode: string) {
  for (const sid of rooms.listConnectedSockets(roomCode)) {
    const s = rooms.snapshotFor(sid);
    if (s) sendState(sid, s);
  }
}

/**
 * 幸存者之间共享的「鼠标预选地点」。
 * 只保存在内存里、不进对局状态（不参与悔棋/重开），也不发给杀手。
 */
const cursors = new Map<string, { roomCode: string; roomId: string | null }>();

/**
 * 算出这一桌当前所有幸存者预选的地点，只发给幸存者。
 * 注意：`state.players` 的键是**棋子 id**（像 host1__surv1），不是 socket id ——
 * 所以要按 controllerId 反查，不能直接 players[socketId]。
 */
function broadcastCursors(roomCode: string) {
  const state = rooms.stateOf(roomCode);
  if (!state) return;
  const list: Array<{ playerId: string; roomId: string }> = [];
  for (const [sid, c] of cursors) {
    if (c.roomCode !== roomCode || !c.roomId) continue;
    // 这个网线现在操控的幸存者棋子（1对2 下一个人控制多枚）
    for (const p of Object.values(state.players)) {
      if (p.faction !== 'survivor' || !p.alive) continue;
      if (p.controllerId !== sid || !p.connected) continue;
      list.push({ playerId: p.id, roomId: c.roomId });
    }
  }
  for (const sid of rooms.listConnectedSockets(roomCode)) {
    // 操作杀手的那个网线不给看
    const mine = Object.values(state.players).filter((p) => p.controllerId === sid);
    if (mine.length && mine.every((p) => p.faction === 'killer')) continue;
    io.to(sid).emit('cursors', list);
  }
}

/** 有人离开/断线：把他那一圈擦掉，并通知同队 */
function dropCursor(socketId: string, roomCode: string) {
  if (!cursors.has(socketId)) return;
  cursors.delete(socketId);
  broadcastCursors(roomCode);
}

// 有人用浏览器连上来：建房、加入、点按钮、离开，都从这里收
io.on('connection', (socket) => {
  socket.emit('hello', { socketId: socket.id });

  socket.on('createRoom', (payload: { name?: string; mapId?: string }, cb?: (r: unknown) => void) => {
    try {
      const snap = rooms.create(socket.id, payload?.name ?? '房主', payload?.mapId);
      socket.join(snap.roomCode);
      cb?.({ ok: true, state: snap });
      sendState(socket.id, snap);
    } catch (e) {
      cb?.({ ok: false, error: (e as Error).message });
    }
  });

  socket.on(
    'joinRoom',
    (payload: { roomCode: string; name?: string }, cb?: (r: unknown) => void) => {
      try {
        const snap = rooms.join(payload.roomCode, socket.id, payload?.name ?? '玩家');
        socket.join(snap.roomCode);
        cb?.({ ok: true, state: snap });
        pushToRoom(snap.roomCode);
      } catch (e) {
        cb?.({ ok: false, error: (e as Error).message });
      }
    },
  );

  socket.on('action', (action: ClientAction, cb?: (r: unknown) => void) => {
    try {
      const result = rooms.action(socket.id, action);
      cb?.({ ok: true });
      if (result.disbanded) {
        /**
         * 【解散房间】：最后一票确认 → 房间已经从服务器上删掉。
         * 先给每个人发他自己那份快照（`disbanded: true`，客户端据此退回主界面），
         * 再让他离开这个 socket.io 房间，后面的广播就不会再打扰他。
         */
        for (const { socketId: sid, snapshot } of result.snapshots) {
          sendState(sid, snapshot);
          io.sockets.sockets.get(sid)?.leave(result.roomCode);
        }
        return;
      }
      for (const { socketId: sid, snapshot } of result.snapshots) {
        sendState(sid, snapshot);
      }
    } catch (e) {
      cb?.({ ok: false, error: (e as Error).message });
      const snap = rooms.snapshotFor(socket.id);
      if (snap) sendState(socket.id, snap);
    }
  });

  /**
   * 幸存者把鼠标预选的地点实时报给同队其他人（只发给幸存者，杀手看不到）。
   * 每次回的是**完整列表**，客户端直接覆盖 —— 不用做增量，避免残留。
   */
  socket.on('cursorRoom', (payload: { roomId?: string | null }) => {
    const roomCode = rooms.roomCodeOf(socket.id);
    if (!roomCode) return;
    if (cursors.get(socket.id)?.roomCode !== roomCode) {
      cursors.set(socket.id, { roomCode, roomId: null });
    }
    const entry = cursors.get(socket.id)!;
    const next =
      typeof payload?.roomId === 'string' && payload.roomId ? payload.roomId : null;
    if (entry.roomId === next) return;      // 没变化就别广播
    entry.roomId = next;
    broadcastCursors(roomCode);
  });

  socket.on('leaveRoom', (cb?: (r: unknown) => void) => {
    const roomCode = rooms.roomCodeOf(socket.id);
    const result = rooms.leave(socket.id);
    if (roomCode) socket.leave(roomCode);
    cb?.({ ok: true });
    if (roomCode) dropCursor(socket.id, roomCode);
    if (!result) return;
    for (const sid of rooms.listConnectedSockets(result.roomCode)) {
      const snap = rooms.snapshotFor(sid);
      if (snap) sendState(sid, snap);
    }
  });

  socket.on('disconnect', () => {
    // 这条网线走了：把"已经发过静态大块"的记录也清掉（重连是新 id，本来也会重发）
    sentStatic.delete(socket.id);
    const roomCode = rooms.roomCodeOf(socket.id);
    const result = rooms.leave(socket.id);
    if (roomCode) dropCursor(socket.id, roomCode);
    if (!result) return;
    for (const sid of rooms.listConnectedSockets(result.roomCode)) {
      const snap = rooms.snapshotFor(sid);
      if (snap) sendState(sid, snap);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`恶夜杀机 server on http://localhost:${PORT}`);
  const lans = lanOrigins(CLIENT_PORT);
  if (lans.length) {
    console.log(`同学用同一 WiFi 打开：${lans.join(' 或 ')}，再输入房间码加入`);
  }
  console.log(`Content: ${CONTENT_ROOT}`);
});
