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
app.use('/Image', express.static(IMAGE_ROOT));
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
});

/** 房间里每个人看到的信息不一样（杀手看不到求生者背包），所以要挨个发快照 */
function pushToRoom(roomCode: string) {
  for (const sid of rooms.listConnectedSockets(roomCode)) {
    const s = rooms.snapshotFor(sid);
    if (s) io.to(sid).emit('state', s);
  }
}

// 有人用浏览器连上来：建房、加入、点按钮、离开，都从这里收
io.on('connection', (socket) => {
  socket.emit('hello', { socketId: socket.id });

  socket.on('createRoom', (payload: { name?: string; mapId?: string }, cb?: (r: unknown) => void) => {
    try {
      const snap = rooms.create(socket.id, payload?.name ?? '房主', payload?.mapId);
      socket.join(snap.roomCode);
      cb?.({ ok: true, state: snap });
      socket.emit('state', snap);
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
      rooms.action(socket.id, action);
      cb?.({ ok: true });
      const roomCode = rooms.roomCodeOf(socket.id);
      if (roomCode) pushToRoom(roomCode);
    } catch (e) {
      cb?.({ ok: false, error: (e as Error).message });
      const snap = rooms.snapshotFor(socket.id);
      if (snap) socket.emit('state', snap);
    }
  });

  socket.on('leaveRoom', (cb?: (r: unknown) => void) => {
    const roomCode = rooms.roomCodeOf(socket.id);
    const result = rooms.leave(socket.id);
    if (roomCode) socket.leave(roomCode);
    cb?.({ ok: true });
    if (!result) return;
    for (const sid of rooms.listConnectedSockets(result.roomCode)) {
      const snap = rooms.snapshotFor(sid);
      if (snap) io.to(sid).emit('state', snap);
    }
  });

  socket.on('disconnect', () => {
    const result = rooms.leave(socket.id);
    if (!result) return;
    for (const sid of rooms.listConnectedSockets(result.roomCode)) {
      const snap = rooms.snapshotFor(sid);
      if (snap) io.to(sid).emit('state', snap);
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
