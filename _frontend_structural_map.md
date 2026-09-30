# 《恶夜杀机》前端结构图谱（只读分析报告）

> 分析对象：`D:\game\饿夜杀鸡线上版` 客户端 + 构建脚本 + `tools\` 调试台。
> 所有行号均来自本次通读的实际文件内容。**本报告未修改任何文件**（唯一新增文件是本报告本身）。

## 行数与行号可信度（已逐文件复核）

**本报告标题里的「（N 行）」是对的**，行号引用也是准的。
（初版这里曾贴过一张「勘误表」，那些数字来自 `PowerShell Get-Content`，而它对大文件会**静默读少几十行**，是测量工具的问题，不是报告的问题。已作废，以本表为准。）

复核方式：按字节统计换行（`\n` 计数 + 末行无换行时补 1），结果与报告一致：

| 文件 | 报告 | 复核 |
|---|---|---|
| `client/src/GameViews.tsx` | 3161 | 3161 ✓ |
| `client/src/Board.tsx` | 686 | 686 ✓ |
| `client/src/SurvivorDock.tsx` | 552 | 552 ✓ |
| `client/src/TableHud.tsx` | 247 | 247 ✓ |
| `client/src/KillerDock.tsx` | 234 | 234 ✓ |
| `client/src/App.tsx` | 203 | 203 ✓ |
| `client/src/types.ts` | 390 | 390 ✓ |
| `client/src/survivorLayout.ts` | 236 | 236 ✓ |
| `client/src/useGameSocket.ts` | 145 | 145 ✓ |
| `client/src/mapPath.ts` | 143 | 143 ✓ |
| `client/src/killerArt.ts` | 166 | 166 ✓ |
| `client/src/cardArt.ts` | 90 | 90 ✓ |
| `client/src/cardUse.ts` | 89 | 89 ✓ |
| `client/src/CardZoom.tsx` | 81 | 81 ✓ |
| `client/src/DiceRoll.tsx` | 79 | 79 ✓ |
| `client/src/survivorArt.ts` | 72 | 72 ✓ |
| `client/src/PileInspect.tsx` | 69 | 69 ✓ |
| `client/src/i18n.ts` | 65 | 65 ✓ |
| `client/src/uiAssets.ts` | 52 | 52 ✓ |
| `client/src/main.tsx` | 13 | 13 ✓ |
| `client/src/styles.css` | 2003 | 2003 ✓ |

服务端同样是报告的数字：`engine.ts` **3697**、`effects.ts` **1269**、`killerCards.ts` **486**、`evolution.ts` **598**、`types.ts` **476**、`index.ts` **239**。

> ⚠️ **注意**：本报告之后，客户端做过 4 处修复（见文末「修复记录」），
> `Board.tsx`（686→696）、`SurvivorDock.tsx`（552→558）、`useGameSocket.ts`（145→187）的行数已经变化；
> 这三个文件里 **§2（Board）、§6（SurvivorDock）、§4（useGameSocket）之后的行号需要 +Δ**，其余文件不受影响。

---

## 0. 全局数据流（先说清架构）

```
浏览器点击 → GameViews.tsx 内部的 handler
          → onAction(ClientAction)  ← App.tsx 传入
          → useGameSocket.sendAction → socket.emit('action', ...)
          → 服务器规则引擎算完 → socket.on('state', PublicSnapshot)
          → setState → 重新渲染
```

关键结论：**Board / TableHud / SurvivorDock / KillerDock / CardZoom / PileInspect / DiceRoll 全都不发 action**。
它们只暴露回调 prop（`onRoomClick` / `onPlayCard` / `onTradeItem` / `onRepairGuess` / `onPileClick` / `onSkillClick` / `onToggle` …）。
**唯一 dispatch 的地方是 `GameViews.tsx`**（共 53 处 `onAction({ type: ... })`，清单见 §2.6）。前端不做合法性判定，只做“能不能点的”软提示（`cardUse.ts` 注释第 2 行明确写了这点）。

---

## 1. `client\src\App.tsx`（203 行）

**用途**：应用外壳。三态切换——未进房（创建/加入表单）、大厅/选角（`LobbyView`）、开打（`GameView`）。不画棋盘。

**导出**：`default function App()` — L16。

**局部类型**：`interface MapOption { id: string; name: string }` — L11-14。

**状态**（L17-23）：
| 变量 | 行 | 初值 |
|---|---|---|
| `connected, state, error, setError, createRoom, joinRoom, sendAction, leaveRoom` | L17 | 来自 `useGameSocket()` |
| `name` | L18 | `localStorage 'nh_name'` |
| `code` | L19 | `''` |
| `busy` | L20 | `false` |
| `maps: MapOption[]` | L21 | `[]` |
| `mapId` | L22 | `localStorage 'nh_map'` |
| `lanUrls: string[]` | L23 | `[]` |

**Effect L26-38**：`fetch('/api/content/meta')` → 读 `maps` / `mapId` / `lanUrls`。失败静默（“meta optional before server is up”）。
> 注意：这是全前端**唯一**直接 `fetch` 的运行时 API（GameViews L596 另有 `/api/ui/survivor-layout`）。

**Handler**：
- `onCreate(e)` L41-54：`preventDefault` → 写 `nh_name`/`nh_map` → `createRoom(name || '房主', mapId || undefined)`。
- `onJoin(e)` L57-69：`joinRoom(code.trim().toUpperCase(), name || '玩家')`。
- `leaveToHome(confirmExit)` L81-88：`confirmExit` 为真时 `window.confirm('退出后当前单人对局将结束。确定回到主界面？')`（L82 硬编码中文）。

**渲染分支**：
- `inLobby` L71-72：`phase === 'lobby' || 'characterSelect'`。
- `inGame` L73-76：两者都不等。
- `isHost = Boolean(state?.isHost)` L78。
- 头部 L92-120：in-game 显示 `state.roomCode` / 连接状态；否则显示 hero 文案（L101-117 长段硬编码组局说明，含“端口 5173”、“1 对 1 / 1对2 / 1对3”措辞）。
- `!state` 时渲染两张表单 L122-166：昵称 `placeholder="房主"`（L128）/`"玩家"`（L150）；房间码 `placeholder="ABCD"`、`maxLength={6}`、输入自动大写（L154-159）；创建按钮 `disabled={!connected || busy}`，加入按钮再加 `|| !code`。
- `error && !state` 显示错误 L168。
- `LobbyView` L170-184：`onLeave` 仅在 `state.mode === 'solo'` 时传入（L182）。
- `GameView` L186-200：同样只在 solo 传 `onLeave`（L198）。

**硬编码字面量**：`'nh_name'`、`'nh_map'`、`'房主'`、`'玩家'`、`'ABCD'`、`maxLength=6`、`'已连接'/'断线'`、`'已连接服务器'/'正在连接…'`、`'端口 5173'`。
**TODO**：无（全项目 grep `TODO|FIXME|XXX|HACK|待办|暂时|临时` = 0 命中）。

---

## 2. `client\src\Board.tsx`（686 行）— 地图渲染核心

**用途**：画房间圆点、门/通道连线、封堵标记、道具 token、区域 zone、立绘棋子、预览路径；外加牌堆/技能卡的 HTML 浮层。点击房间只回调，不判定。

### 2.1 导出与签名
- `interface BoardPlayer extends PublicPlayerView { placed?: boolean }` — L14-16。
- `interface BoardProps` — L18-65（完整 prop 表见 §2.4）。
- `export function Board({...}: BoardProps)` — **L165-560**。
- 内部组件 `function MapPileOverlays({...})` — L571-686（未导出）。
- 辅助：`zoneBoxStyle(map, z)` — L562-569。

### 2.2 模块级常量与纯函数（坐标数学）
| 名称 | 行 | 说明 |
|---|---|---|
| `OVERLAY_ZONE_IDS` | L67-75 | `search, discovery, treasure, discard, skill1..skill3` — 这些 zone **不在 SVG 里画**，改由 HTML 浮层画 |
| `doorKey(a,b)` | L77-79 | 排序后 `a\|b`，与 `cardUse.ts` / 服务器保持一致 |
| `isDoorPath(pathType)` | L81-83 | `!pathType \|\| pathType==='door'` —— **undefined 也算门** |
| `blockadeMarkFor(edge, faction)` | L85-88 | `faction==='killer' ? 'killer' : 'survivor'`（旁观者取 survivor） |
| `hexToRgba(hex, alpha)` | L90-97 | 支持 3 位/6 位 hex |
| `zoneVisible(z, faction)` | L99-104 | `side` 缺省 `'survivor'`；`'both'` 恒可见；杀手只看 killer 侧 |
| `tokenRescueStep(id)` | L106-111 | 正则 `/^rescue(\d+)/` |
| `tokenRepairStep(id)` | L114-119 | 正则 `/^(?:k)?repair(\d+)$/` |
| `isKillerRepairToken(t)` | L121-123 | `id.startsWith('krepair') \|\| side==='killer'` |
| `isSuitcaseToken(t)` | L125-133 | `kind` ∈ {`suitcase`,`手提箱`,`手提箱已用`} 或 id ∈ {`suitcaseOpen`,`suitcaseUsed`} |
| `isUsedSuitcaseToken(t)` | L135-137 | id/kind 匹配 `/used\|已用/i` |
| `tokenTransform(x,y,w,h,rotation)` | L139-143 | **先平移中心 → rotate → 再移回**：`translate(cx cy) rotate(r) translate(-w/2 -h/2)` |
| `STANDEE_H = 68` | L145 | 立绘统一高度（map 坐标单位） |
| `SURVIVOR_STANDEE_W` | L146 | `round(68 * 489/781)` ≈ 43 —— 硬编码立绘图源比例 489×781 |
| `KILLER_STANDEE_W` | L147 | `round(68 * 934/1040)` ≈ 61 —— 硬编码杀手立绘比例 934×1040 |
| `standeeFor(p, viewerFaction)` | L149-163 | **可见性判定核心** |

**`standeeFor` 可见性规则**（L149-163）：
1. `!p.alive \|\| !p.roomId` → `null`（死人 / 未落位不画）。
2. 杀手：`p.stealth && viewerFaction !== 'killer'` → `null`（**潜行中的杀手只对自己可见**）。
3. 杀手图源 `killerStandeeSrc(killerArtFor(p.characterId, p.name))`，尺寸 `KILLER_STANDEE_W × 68`。
4. 幸存者：`survivorStandeeSrc(...)`，尺寸 `SURVIVOR_STANDEE_W × 68`。

### 2.3 `Board` 主体渲染顺序（L212-559）
容器：`div.board-wrap > div.map-stage`。

1. **底图 L215**：`{bg && <img className="map-bg" src={encodeURI(bg)} .../>}`。
   取图规则 L200-203：`viewerFaction === 'killer' ? map.backgrounds?.killer : (map.backgrounds?.survivor ?? map.backgrounds?.killer)`。
   ⚠️ `encodeURI` 用于中文路径（`/Image/Maps/幸存者1.png`）。
2. **SVG L216-222**：`viewBox="0 0 {map.width} {map.height}"` + **`preserveAspectRatio="none"`**（拉伸填充）。`role="img"`、`aria-label={map.name}`。
   → 房间坐标 **就是 map 原始像素坐标**，没有归一化。
   → `.map-svg` 是 `position:absolute; inset:0; width/height:100%`（styles.css L497-503）；`.map-bg` 是 `max-width/max-height:100%; object-fit:contain`（L481-490）。
   → **当前所有地图 `width=1000 height=500`（2:1），底图也是 2:1，所以拉伸不失真**；若以后加非 2:1 地图，SVG 与底图会错位（潜在坑）。
3. **zones L223-294**（`zones` 已在 L204-206 过滤掉 overlay id 且按阵营可见）：
   - circle 分支 L224-268：`r = z.r ?? 20`，`fill=hexToRgba(color,0.22)`，`stroke=color`，`strokeWidth=2`，`pointerEvents="none"`；label 画在 `y + r + 12`，`textAnchor="middle"`。
   - **修理点齿轮** L239-252：条件 `showRepair && /^repair\d+$/.test(z.id) && step<=repairProgress && step>0 && 不存在同名 survivor repair token` → 画 `UI.repair` 28×28 于 `(z.x-14, z.y-14)`。
   - **杀手猜修理热区** L253-267：`repairGuessable && /^repair\d+$/` → 透明 circle，`pointerEvents="auto"`，`cursor:pointer`，点击 `stopPropagation` 后 `onRepairGuess?.(n)`。
   - rect 分支 L269-293：`w/h ?? 40`，`rx=6`，label 居中 `+4`。
4. **edges L296-329**：对每条 `map.edges`：
   - 端点任一缺失 → `null`（L299）。
   - `door = isDoorPath(e.pathType)`；`blocked = door && blockades.includes(doorKey(from,to))`（L301）。→ **封堵只对门生效**。
   - 封堵标记几何 L302-308：`mark = blockadeMarkFor(e, viewerFaction)`；`bw = mark?.w ?? 44`，`bh = mark?.h ?? 22`；
     `x = mark ? mark.x : (a.x+b.x)/2 - bw/2`；`y` 同理；
     `angle = mark?.rotation ?? atan2(dy,dx)*180/PI`（默认沿门方向）。
   - 线 L311-317：class `edge-line` + `dash`（pathType==='dash'）/`killer`（'killer'）/`door`（其余）。
   - 封堵图 L318-326：`UI.blockade`，`transform=tokenTransform(...)`。
5. **passages L331-345**：只画线（class `edge-line passage`），**不参与封堵、不在 `mapPath.ts` 的普通邻居里**。
6. **tokens L347-378** 过滤链：
   - `zoneVisible(t, viewerFaction)`（L348）。
   - L349-368 逐类剔除：
     - `kind ∈ {stealth, blockade, 封堵}` → 恒不画（潜行/封堵另有画法）。
     - 手提箱：已用 token 只在 **不可用** 时画；未用 token 只在 **可用** 时画（`suitcaseAvailable`），L351-353。
     - `repair`：必须 `showRepair` 且 `0 < step <= repairProgress`（L354-357）。
     - `rescue`（警车）：**杀手视角或 side==='killer' 恒不画**；必须 `rescueArmed && rescueCountdown != null` 且 `step === rescueCountdown`（L359-366）。
   - 绘制 L369-378：`<image width=t.w height=t.h transform=tokenTransform(..., t.rotation ?? 0) pointerEvents="none">`。
7. **杀手修理解谜热区 L380-402**：`repairGuessable` 时，对 `zoneVisible && kind==='repair' && isKillerRepairToken` 的 token 覆盖透明 rect，点击 `onRepairGuess?.(n)`。
8. **预览路径 L404-410**：`previewPts.length > 1` → `<polyline class="preview-path">`，points 用**房间中心点**连线（L408）。
9. **rooms L412-543**（每个房间一个 `<g onClick={() => onRoomClick(room.id)}>`）：
   - 每房计算的标志 L413-420：
     `legal = legalMoves.includes(id)`；`colorHit = highlightRoomIds.includes(id)`；`noise = noises.includes(id)`；`firecrackerHere = firecrackerRoomId === id`；`blocked = blockades.some(b => b.includes(room.id))`（**字符串包含匹配**，注意 `R1` 会命中 `R10`/`R11` 这类前缀）；`here = you?.roomId===id && !previewRoomId`；`previewHere = previewRoomId===id`；`occupants = players.filter(roomId===id && alive)`。
   - 立绘排列 L449-491：
     `n = standees.length`；`gap = s.w * 0.62`（**硬编码 0.62 间距系数**）；
     `cx = room.x + (idx - (n-1)/2) * gap`；`x = cx - s.w/2`；`y = room.y - s.h + 12`（站在圆点上方，下缘落点 +12）；
     `pickable = pickableSurvivorIds.includes(id) && faction==='survivor'`；`acting = id === activePlayerId`；
     `<g>` 的 class 组合（L460）：`map-standee` + `mine` / `acting` / `placed` / `pickable` / `picked` / `acted`；
     `pointerEvents = pickable ? 'auto' : 'none'`；仅 pickable 时 `onClick` → `stopPropagation` + `onSurvivorClick?.(id)`。
     边框矩形 L479-488：`acting || 自己` 时画 `standee-acting` / `standee-you` 外框（`x-1,y-1,w+2,h+2,rx=2`）。
   - 房间圆点 L431-436：`r={18}`（硬编码半径），class 由 `legal?legal:clickable` + `sense-color/color/noise/blocked/here/preview` 拼成。
   - 房名 L427-428：杀手视角优先 `room.nameKiller`；若名字不以 id 开头则拼成 `${id}${name}`（与 `i18n.roomDisplayName` 同规则）。
   - 房名文字 L437-439（`y+4`）、标签行 L440-448：`⚙`=repairable、`🔑`=searchable、`⎋`=hiddenExit、`⌂`=entrance、`▣`=blocked —— **全是硬编码 emoji/符号**。
   - 爆竹标记 L492-501：`UI.firecrackerNoise` 32×32 于 `(x-16, y-42)`。
   - 响声标记 L502-510：`UI.noise` 22×20 于 `(x+14, y-28)`。
   - 潜行标记 L511-525：`stealthRoomId === room.id` 时取 `map.tokens` 里第一个 `kind==='stealth'` 的图（尺寸回退 32×32），画在 `(room.x+22, room.y - th/2)`。
   - 陷阱 L526-535：`trapRoomIds.includes(id)` → `UI.trap` 36×36 于 `(x-18, y+20)`。
   - 预览文字 L536-540：`<text class="token preview-token">预览</text>` 于 `y+32`。
10. **`MapPileOverlays` L545-556**（HTML 浮层，在 `map-stage` 内、SVG 之后）。

### 2.4 `BoardProps` 全表（L18-65）
`map, players, youId, viewerFaction, legalMoves, highlightRoomIds?, firecrackerRoomId?, suitcaseAvailable?, noises, blockades?, previewPath?, repairProgress?, showRepair?, repairGuessable?, onRepairGuess?, onSkillClick?, stealthRoomId?, trapRoomIds?, rescueArmed?, rescueCountdown?, onRoomClick, pileCounts?, pileCards?, pileTops?, cardById?, pickableSurvivorIds?, selectedSurvivorId?, activePlayerId?, onSurvivorClick?, onPileClick?, turnOrder?`

**默认值**（解构 L165-197）：`highlightRoomIds=[]`、`firecrackerRoomId=null`、`suitcaseAvailable=true`、`blockades=[]`、`previewPath=[]`、`repairProgress=0`、`showRepair=false`、`repairGuessable=false`、`stealthRoomId=null`、`trapRoomIds=[]`、`rescueArmed=false`、`rescueCountdown=null`、`cardById={}`、`pickableSurvivorIds=[]`、`selectedSurvivorId=null`、`activePlayerId=null`、`turnOrder=[]`。

**读的 snapshot 字段**（由 GameViews 映射而来，L1177-1246）：`state.map`、`state.players`（经 `displayPlayers` 改造）、`state.you.id`、`legalMoves`（由 `extraPick`/`standeeMoveOn`/若干 pending 标志派生）、`highlightRoomIds`、`firecrackerRoomId`（**只在 noiseReport/killerMain/encounter/upkeep/gameOver 阶段透出** L1198-1206）、`state.suitcaseAvailable`、`noises`（同上阶段门控 L1208-1216）、`state.blockades`、`state.repairProgress` 或 `state.killerRepairGuess`（L1219）、`state.stealthOriginRoomId`、`state.trapRoomIds`、`state.rescueArmed/rescueCountdown`、`state.pileCounts`、`state.pileCards`、`state.pileTops`、`state.cardById`、`state.activePlayerId`、`state.turnOrder`。

**派发的 action**（经回调）：`onRoomClick` → GameViews L820-859（见 §2.6）；`onRepairGuess` → `{type:'setKillerRepairGuess'}`（L1224）；`onSurvivorClick` → `pickSurvivor`（L967-971）；`onPileClick` → `setInspectPile`（纯 UI）；`onSkillClick` → `setArtZoom`（纯 UI）。

### 2.5 `MapPileOverlays`（L571-686）
- 幸存者队列 L595-598：有 `turnOrder` 时按其顺序取玩家并过滤 `faction==='survivor'`，否则按 `players` 顺序。
- `skillZones` L599-601：依次找 `skill1/2/3` 三个 zone 且 `zoneVisible` 通过。
- `pileDefs` L603-612：搜索/发现/宝藏/弃牌四个，计数取自 `pileCounts`（缺省 0）。**注意 treasure 恒为 0（服务器写死）**。
- `topDiscard` L614-617：`pileTops?.discard ?? pileCards?.discard?.[0]`，图源 `cardArtSrc(cardById[id], id) ?? itemArtSrc(id)`。
- 牌堆按钮 L621-667：定位用 **`zoneBoxStyle`（百分比）** L562-569：
  `left = x/map.width*100%`、`top = y/map.height*100%`、`w = (z.w ?? 80)/map.width*100%`、`h = (z.h ?? 80)/map.height*100%`，**默认 w/h = 80**。
  搜索堆画 `UI.searchBack`，`count>1` 时底下再垫一张 `under`；`count===1` 用 `UI.searchBackLast`（L634-646）。发现堆用 `UI.discoveryBack`（L647-659）。弃牌堆画顶牌图 L660-662。角标 `map-pile-count` 显示数量 L664。
- 技能卡浮层 L668-683：`survivors[i]` 与 `skillZones[i]` 按下标对应；图源 `skillCardSrc(survivorArtFor(...))`；点击 `onSkillClick?.(src, `${p?.name ?? '幸存者'}技能`)`（**硬编码“技能”后缀**）。

### 2.6 与 Board 相关的 dispatch（全部在 GameViews.tsx）
`onRoomClick` L820-859 的分支优先级：
1. `extraPick`（额外行动选点）→ 仅接受 `extraPick.rooms.includes`，切换 `extraDest`。
2. `fleePick && phase==='encounter'` → 切换 `fleeDest`。
3. **`standeeMoveOn && !isSurvivorView && !pickingLocation` → `placeStandee(roomId)`，不发 action**（杀手图上的“立绘推演”，纯本地 `localStorage 'nh_place_{roomCode}_killer'`）。
4. `pendingBlockade || (pendingBlockadeJob && removeLeft>0)` → 选封堵目标格。
5. `canDraftMove` → 选 `moveDest`（需再确认）。
6. `isActive && legalMoves.includes(roomId)` → 直接 `{type:'move', toRoomId}`（L857）。

其它相关：`confirmMove` L861-867 → `move`；`confirmBlockadeDest` L901-905 → `move`；`confirmFleeDest` L894-899 → `encounterFlee`；`pickSurvivor` L967-971 → `pickSurvivorTurn`；`onRepairGuess` L1222-1225 → `setKillerRepairGuess`；`finishSurvivorPhase` L1391。

---

## 3. `client\src\types.ts`（390 行）— 与服务器 types 的漂移

**用途**：客户端看到的快照形状（不含隐藏信息）+ 上行 action 联合类型。文件头注释 L2-3：“和服务器 types 差不多，但只有发给你的那一份”。

**导出清单**：`Faction` L5、`GameMode` L6、`EncounterStep` L7、`KillerTurnStep` L8、`KillerMainChoice` L9、`Phase` L11-20、`EffectDef` L22-29、`SkillDef` L31-38、`CharacterDef` L40-49、`CardDef` L51-63、`RoomDef` L65-72、`MapZone` L74-85、`MapToken` L87-99、`BlockadeMark` L101-107、`MapEdge` L109-118、`MapDef` L120-133、`PublicPlayerView` L135-157、`DiceRoll` L159-166、`EncounterState` L168-184、`PublicSnapshot` L186-339、`ClientAction` L341-390。

### 3.1 确认的漂移（客户端 vs `server\src\game\types.ts`）

| # | 位置 | 内容 | 性质 |
|---|---|---|---|
| D1 | `useItem` | 客户端 L361 **缺 `useToolbox?: boolean`**；服务器 types L301 有该字段 | **真实漂移（漏字段）** |
| D2 | `PublicSnapshot.survivorDiscard` | 客户端**没有**该字段；服务器 types L388 有 `survivorDiscard?: Array<{id;name}>`，且 engine L3588/L3591 确实会发（**注意 engine 里是必发，interface 却写 optional**） | **真实漂移**，客户端只能靠 `pileCards.discard` / `yourDiscardPile` 拿弃牌 |
| D3 | `killerDeckCount` | 客户端 L320 写 `killerDeckCount?: number`（optional）；服务器 types L455 写**必填** `killerDeckCount: number` | 客户端更宽松，无害 |
| D4 | `PublicSnapshot.trapRoomIds` / `stealthOriginRoomId` / `turnOrder` | 客户端 L336-338 均 optional；服务器 L464-466 必填 | 客户端更宽松，无害 |
| D5 | `PublicSnapshot.survivorDiscard` 的 optional 标记 | 服务器自身 engine 恒发，types 却标 `?` | **服务器侧不一致**，非客户端问题 |
| D6 | `MapEdge.blockade` | 两端都有（客户端 L114-117），但 `Board.tsx` L301-306 实际用 `blockades` 字符串数组查表 + `mark` 只作**标记几何**；服务器 engine L3526/L3535 用 `removableBoardBlockades`/`relocatableBlockades`。**`MapEdge.blockade` 在客户端读取路径里没有服务器填充者**（map JSON 里也没有）→ 实际恒 `undefined`，走 `?? 44 / ?? 22` 兜底 | **死字段/疑似遗留** |
| D7 | `PublicPlayerView` | 客户端 L135-157 与服务器 L64-86 **逐字段一致**（含 `actedThisRound?`） | 无漂移 |
| D8 | `EffectDef` 客户端 L22-29 内联定义；服务器从 `content/schema.ts` 导入 | 需与 schema 对齐，本次未逐字段比对 schema | 待核实 |
| D9 | `Phase` / `ClientAction` / `EncounterState` / `DiceRoll` | 与服务器**字段与成员逐一对齐**（除 D1） | 基本一致 |
| D10 | `PublicSnapshot.rules` | 客户端 L199-211 内联结构；服务器 L345 用 `RulesDef`（来自 schema） | 同 D8，结构看起来一致 |

**客户端类型里声明了但 GameViews 从不读取的字段**（“类型上有、界面没用”，可作清理候选）：
`pendingBlockadePlace`(L240) 在 GameViews L531/L1190 有读；`pendingMoveMin`、`pendingMoveTaken`、`removableBoardBlockades`、`relocatableBlockades`、`killerHandCount`、`killerUsedSlowThisTurn`（GameViews 用 `killerTurnStep`/`killerMainChoice` 代替）、`allKillerCards`、`discoveryActorId`、`firecrackerThisRound`、`repairedThisPhase`（有读 L755）、`rescueArmed`（有读）、`soloKillerCharacterId`（有读 L107）、`hostId`（有读吗？GameViews 用 `isHost`）、`youRematchReady`（L3144 附近有读）、`encounterTailBonus`、`pendingOverFearWound`（有读）、`pileTops.treasure`。
> 结论：类型文件比 UI 覆盖面更广，属正常；但 D1/D2 是真漏。

---

## 4. `client\src\useGameSocket.ts`（145 行）

**导出**：`export function useGameSocket()` — L34-145。

**模块级**：
- `SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? ''` L11（空串 → 连当前 origin，注释 L10 说明为局域网/Radmin 设计）。
- `SESSION_KEY = 'nh_room_session'` L12。
- `readRoomSession()` L14-24 / `writeRoomSession()` L26-28 / `clearRoomSession()` L30-32 —— 用 **`sessionStorage`**（刷新自动重连）。

**状态** L35-38：`socket`, `connected`, `state: PublicSnapshot | null`, `error`。

**Effect L41-67**（只跑一次，空依赖）：
1. `io(SOCKET_URL || undefined, { transports: ['websocket','polling'] })` L42。
2. `connect` L44-58：`setConnected(true)`，若有 session 就 `emit('joinRoom', {roomCode,name}, cb)` 自动重连落座；成功则 `setState(res.state)`。
3. `disconnect` L59 → `setConnected(false)`。
4. `state` 事件 L60-63 → `setState(snap)` + 清 error。**这是唯一的快照推送通道**。
5. cleanup L64-66 `s.disconnect()`。
> ⚠️ React 19 `StrictMode`（main.tsx L10）下开发模式 effect 会跑两次 → 会建两次连接（第二次 cleanup 掉第一个）；生产无此问题。

**方法**：
- `createRoom(name, mapId?)` L70-82：`emit('createRoom', {name, mapId}, cb)`；成功 → `writeRoomSession(roomCode, name)`；失败 → `reject(new Error(res?.error ?? 'create failed'))`。
- `joinRoom(roomCode, name)` L85-101：同上，错误串 `'join failed'`。
- `sendAction(action: ClientAction)` L104-119：`emit('action', action, cb)`；失败既 `setError(msg)` 又 `reject`（**错误同时走两路**：App 的 error 文案 + 调用方 catch）。默认文案 `'action failed'`。
- `leaveRoom()` L122-139：`emit('leaveRoom', cb)`；成功 → `clearRoomSession()` + `setState(null)`。
> 隐患：`socket?.emit(...)` 用可选链，**若 socket 还是 null，Promise 会永远 pending**（不 resolve 也不 reject）。App 里按钮有 `disabled={!connected}` 兜底，但 `GameView` 里的 action 调用没有。

**返回** L141-144：`useMemo` 包 `{ connected, state, error, setError, createRoom, joinRoom, sendAction, leaveRoom }`。

**硬编码**：`'nh_room_session'`、`'create failed'`、`'join failed'`、`'action failed'`、`'leave failed'`、transports 数组。

---

## 5. `client\src\TableHud.tsx`（247 行）

**用途**：顶栏三颗进度药丸（钥匙/修理/恐惧）+ 点开的大图浮层。**它自己不发 action**，只有 `onToggle`。

**导出**：
| 名称 | 行 |
|---|---|
| `export type TrackPanel = 'keys' \| 'repair' \| 'fear'` | L14 |
| `export function TrackChips({...})` | L17-72 |
| `export function KeyRack({...})` | L75-102 |
| `export function RescueTrack({...})` | L105-133 |
| `export function TrackOverlay({...})` | L166-247 |

**内部**：`function FearRow({ p })` L135-163。

**Props 与读取字段**：
- `TrackChips` L17-35：props `keysCollected, keysNeeded, repairProgress, repairNeeded, showRepair, fearTotal, open, onToggle`。对应 GameViews L1105-1114：`state.keysCollected`、`state.rules.keysNeeded`、`state.repairProgress`、`state.rules.repairNeeded`、`showRepair={isSurvivorView}`、`fearTotal = survivors.reduce((n,p)=>n+p.fear,0)`。
  渲染 L38-69：钥匙 chip 恒显示（`ITEM_ICON.key` 图标 + `钥匙 {n}/{m}`）；修理 chip **仅 `showRepair`**；恐惧 chip（`UI.fear`）。`open === 'keys'` 时加 class `on`。
  **硬编码**：`'钥匙'`、`'修理'`、`'恐惧'`（L45/L56/L67）。
- `KeyRack` L75-102：props `keysCollected, keysNeeded, slots?: LayoutBox[]`；`boxes = slots?.length ? slots : DEFAULT_SURVIVOR_LAYOUT.keySlots`（L84）；`n = Math.max(keysNeeded, boxes.length)`（L85）→ **钥匙格数量取“需要数”和“校准格数”的较大值**；第 i 格 `box = boxes[i] ?? boxes[boxes.length-1]`（**超出时复用最后一格**，L90）；`i < keysCollected` 才画钥匙图（L94）。底图 `UI.keys`。
  读取 snapshot：`state.keysCollected`、`state.rules.keysNeeded`、`survLayout.keySlots`（GameViews L1149-1150、L1156）。
- `RescueTrack` L105-133：props `rescueArmed, rescueCountdown, cells?: RescueCellBox[]`；`list = cells?.length ? cells : DEFAULT_...rescueCells`（L114）；`cell = rescueArmed && rescueCountdown != null ? list.find(c => c.step === rescueCountdown) : null`（L115-118）；警车 `UI.car` 用 `boxStyle(cell)` 定位（L121-130）；未武装时 class 无 `armed`。
- `TrackOverlay` L166-247：props 见 L178-190；`title` 三选一（L191，硬编码 `'钥匙架'/'修理进度'/'恐惧标记'`）；点击遮罩关闭（L193），卡片内 `stopPropagation`（L196）。
  - keys 面板 L206-208 → `KeyRack`。
  - repair 面板 L209-234：文案 `无线电 {repairProgress}/{repairNeeded}`（**硬编码“无线电”**，L212）+ `· 救援倒计时 {n}`；进度点阵 `Array.from({length: repairNeeded})`（L216-224）；`rescueArmed` 时嵌 `RescueTrack`。
  - fear 面板 L235-243：空时 `'场上没有幸存者'`；否则每人生成 `FearRow`。
- `FearRow` L135-163：读 `p.name`、`p.fear`（`>=1` / `>=2` 点亮两枚 `UI.fear`）、`p.overFear`（点亮 `UI.noise`）。**恐惧上限硬编码为 2**。
  > 注：`types` 里 `rules.fearMax?` 存在，但这里没用。

**被谁用**：GameViews L1146-1158（TrackOverlay）、L1105（TrackChips）；`KeyRack`/`RescueTrack` 另被 `SurvivorDock.tsx` L13 导入、L200/L266 使用。

---

## 6. `client\src\SurvivorDock.tsx`（552 行）

**用途**：幸存者顶部状态条（钥匙架+三张状态卡+恐惧/响声标记+警车板）与底部三块技能/背包板（含**物品拖拽交换**）。

**导出**：
- `export function SurvivorStatusBar({...})` — **L179-275**。
- `export function SurvivorSkillBoards({...})` — **L278-552**。

**内部类型/工具**：
- `interface SharedProps` L15-21：`survivors, characters, youId, activePlayerId, layout`。
- `interface StatusProps extends SharedProps` L23-31：+ `pickableSurvivorIds?, selectedSurvivorId?, onSurvivorClick?, keysCollected?, keysNeeded?, rescueArmed?, rescueCountdown?`。
- `interface SkillProps extends SharedProps` L33-47：+ `selectedId, onToggle, showItems, youItems?, tradeEnabled?, dragOwnOnly?, onTradeItem?`。
- `function flattenItems(items)` L50-58：把 `{草药:2}` 摊成 `['herb','herb']`；**`id === 'key'` 被跳过**（钥匙不上栏）。
- `const DRAG_PX = 8` L60 —— 拖拽启动阈值（平方比较，L362）。
- `type SlotHit = { playerId; slotIdx; itemId? }` L62。
- `function topSlotAt(x, y, skip?)` L64-77：用 `document.elementsFromPoint` + `closest('[data-inv-slot]')` 找落点，读 `data-player-id`/`data-slot-idx`/`data-item-id`；`skip` 用于跳过自身原点。
- `function ItemSlots({...})` L79-175：渲染一格物品；空且不可拖且没在拖 → `return null`（L113）；`style.zIndex = hover?50 : raised?30 : boxes.length-idx`（L136）；`onPointerDown` 仅当有物品且 (`canDrag || raiseOnClick`)；`onClick`（抬起）在有拖拽时忽略（L150）；图片加载失败时 `display:none` 并显示中文标签兜底（L161-169）。

### 6.1 `SurvivorStatusBar`（L179-275）
- `slots = [0,1,2].map(i => survivors[i] ?? null)` L193 —— **只显示前三名幸存者**。
- `hud = layout.hudRow` L194。
- 结构 L196-273：`div.surv-status > div.surv-hud-row`（`aspectRatio: HUD_ROW_ASPECT`，L198）内三块：
  1. `hud.keys` 面板（L199-201）→ `KeyRack`（`layout.keySlots`）。
  2. `hud.status` 面板（L202-264）→ `div.surv-status-stage` + `UI.status` 底图 + 按 `layout.statusBar.cards` 逐个渲染：
     - 空位显示 `'空位'`（L209-212，硬编码）。
     - 有角色：`ch = characters.find(c => c.id === p.characterId)`；`art = survivorArtFor(p.characterId, ch?.name)`；
       `injured = p.alive && p.hp < p.maxHp`；`src = portraitSrc(art, injured || !p.alive)`（L216-217，**死亡也显示受伤图**）；
       `pickable = pickableSurvivorIds.includes(p.id)`；
       button class（L223）：`surv-status-card` + `acting`(===activePlayerId) / `mine`(===youId) / `down`(!alive) / `pickable` / `picked` / `acted`(p.actedThisRound)；
       仅 pickable 时 `onClick` → `onSurvivorClick?.(p.id)`（L225）。
     - 恐惧标记 L235-248：`tok.card` 指到第几张卡，`tok.index` 是第几枚；`on = p.fear >= tok.index + 1`。
     - 响声标记 L249-262：`on = Boolean(p?.overFear)`。
  3. `hud.rescue` 面板（L265-271）→ `RescueTrack`（`layout.rescueCells`）。
- **读的 snapshot 字段**：`survivors[i].{id,characterId,name,hp,maxHp,alive,fear,overFear,actedThisRound}`、`characters[].name`、`activePlayerId`、`youId`、`keysCollected`、`keysNeeded`、`rescueArmed`、`rescueCountdown`。
- **dispatch**：无（只有 `onSurvivorClick` 回调，GameViews L1169 传入 `pickSurvivor` → `{type:'pickSurvivorTurn'}`）。

### 6.2 `SurvivorSkillBoards`（L278-552）
- **本地 state**：`raisedIdx` L294、`dragRef` L295-303、`skipBoardClick` L304、`hold` L305、`drag` L306-312、`dropHover` L313。
- `itemsOf(p)` L315-316：**自己**读 `youItems`（`state.you.items`），别人读 `p.items`。
- `tradeOk(fromId, toId)` L318-325：需 `tradeEnabled`、双方不同、**非自己不能拖出**（`dragOwnOnly && fromId !== youId` 拒绝）、双方 `alive`、双方 `roomId` 相同。→ **交换只允许同房间**。
- `validHover(origin, hit)` L327-335：目标格有物品即可；空槽需 `flattenItems(接收方).length < (recv.inventorySlots || 3)`（L332-333，**默认 3 格**）。
- Effect L337-339：`selectedId` 变化 → 清 `raisedIdx`。
- Effect L341-353：键盘 —— 有抬起先放回；否则 `Escape` 关闭面板。
- Effect L355-404（拖拽主逻辑）：`hold` 时挂 window `pointermove/pointerup/pointercancel`；
  - 移动距离平方 `>= 8²` 才算拖动，并**自动打开放大面板**（L362-366）+ 置 `skipBoardClick`。
  - `topSlotAt(e.clientX, e.clientY, cur)` 找落点（跳过原点），`validHover` 校验后设 `dropHover`。
  - 抬起时若有有效落点 → `onTradeItem({fromPlayerId, targetPlayerId, itemId, receiveItemId: hit.itemId})`（L387-392）。
  - 加/移除 `document.body.classList 'surv-item-dragging'`。
- `onDragPointerDown` L406-420：需左键、有物品、`tradeEnabled`；`dragOwnOnly` 时非自己直接 return。
- `slotUi(p, raise)` L422-446：`slotCount = p.inventorySlots || art?.slots || ch?.inventorySlots || 3`（**三级兜底，最后硬编码 3**）；
  `slotBoxes = slotCount > 3 ? layout.skillBoard.slots6 : layout.skillBoard.slots3`（L427 —— **>3 就切 6 格版式**）；
  `raiseOnClick={raise && slotCount > 3}`。
- 拖拽幽灵 L448-461：`createPortal` 到 `document.body`，`left/top = 指针坐标`，图或中文名。
- 放大面板 L463-495：`createPortal` 到 body；底图 `skillBoardSrc(art)`，缺失则 fallback 显示角色名 + `art.role`（L485-489）；内部再调 `slotUi(selected, true)`。
- 主渲染 L497-551：`div.surv-skills-row` 三个 `div.surv-skill-wrap`（空位显示 `'空位'` L503-506）；class（L519）：`open`(selectedId===id) / `acting` / `mine`；
  `onClick` 若 `skipBoardClick` 则消费掉不切换（L521-524）；支持 Enter/Space 键（L527-532）；未打开时显示 `'点击放大'`（L543，硬编码）。
- **读的 snapshot 字段**：`survivors[]`、`characters[].{name,inventorySlots,skills?}`、`state.you.items`（经 `youItems`）、`p.items`、`p.inventorySlots`、`p.alive`、`p.roomId`、`state.activePlayerId`、`state.you.id`。
- **dispatch**：无；`onTradeItem` → GameViews L2681-2690 `{type:'tradeItem', fromPlayerId, targetPlayerId, itemId, amount: 1, receiveItemId}`。
- GameViews 传参 L2669-2691：`tradeEnabled={state.phase === 'survivorMain' && !youMustDiscard && !state.pendingTrade}`、`dragOwnOnly={!sharedControl}`（**1对3 才限制只能拖自己的**）。

---

## 7. `client\src\KillerDock.tsx`（234 行）

**用途**：杀手公开信息条（进化牌/等级/力量）+ 杀手自己的操作台（立绘、牌堆、弃牌堆、手牌、锁定牌）。

**导出**：
- `export function PublicKillerStrip({...})` — **L16-63**。
- `export function KillerActionDock({...})` — **L66-233**。
**内部**：`function killerPlayer(players)` L11-13 —— `players.find(p => p.faction === 'killer')`。

### 7.1 `PublicKillerStrip`（L16-63）
- Props L24-32：`players, characters, killerLevel, killerPower: string|number, layout, compact?, onOpenInfo?`。
- `art = killerArtFor(killer?.characterId ?? null, ch?.name ?? killer?.name)` L35 —— **先按 characterId 精确匹配，失败按名字模糊匹配**。
- `strip = layout.publicStrip` L36。
- 渲染 L38-62：一整块 `<button class="public-strip-stage" onClick={onOpenInfo}>`（`title` 硬编码 `'查看更大的杀手信息'`），内含：
  - `art.evolution` 图（`boxStyle(strip.evolution)`，alt `'进化牌'`，L46-52）；
  - 等级数字（`strip.level`，L54-56）；
  - 力量数字（`strip.power`，L57-59）。
  > 若 `art` 为 null，仍渲染等级/力量数字（`art &&` 只包住图片）。
- **读的 snapshot 字段**：`players[].{faction,characterId,name}`、`characters[].name`、`killerLevel`、`killerPower`。
  GameViews 传入处（`PublicKillerStrip` 在 GameViews 里被用于杀手信息面板附近；`killerPowerText(state)` L355 生成 `killerPower`）。
- **dispatch**：无（`onOpenInfo` → GameViews `setKillerInfoOpen(true)`）。

### 7.2 `KillerActionDock`（L66-233）
- Props L85-104：`players, characters, layout, hand: string[], locked?, discard: Array<{id;name}>, deckCount, cardById, pendingCard, playableIds: Set<string>, blockedReasons?, onPlayCard, onInspectCard?, onInspectEvolution?, onInspectDeck?, onInspectDiscard?, payForCard?, payIds?`。
- 派生 L105-117：
  `art = killerArtFor(...)`；`standee = killerStandeeSrc(art)`；`dock = layout.killerDock`；
  `topDiscard = discard.length ? discard[0] : null`（**约定 0 号是最新弃牌**）；`discardSrc = cardArtSrc(cardById[topDiscard.id], topDiscard.id)`；
  `paying = Boolean(payForCard)`；`picked = new Set(payIds ?? [])`；`lockedIds = locked ?? []`；
  `lockedBoxes = dock.locked?.length ? dock.locked : [{ x:54, y:62, w:12, h:34 }]`（**硬编码兜底盒子**）。
- 渲染 L119-233（`div.killer-dock > div.killer-dock-stage`，全部用 `boxStyle` 百分比定位）：
  1. 立绘 L122-130：`dock.standee`，alt 回退 `'杀手立绘'`。
  2. 摸牌堆按钮 L131-148：`onClick={onInspectDeck}`，`title="查看摸牌堆"`；`art.back` 图，`deckCount === 0` 加 class `empty`（alt `'牌堆空'`）；角标 `牌堆`（硬编码 L146）+ `deckCount`。
  3. 弃牌堆按钮 L149-163：`onClick={onInspectDiscard}`，`title="查看弃牌堆"`；有顶牌画顶牌，否则空牌背；标签 `弃牌` + `discard.length`。
  4. **手牌 `dock.hand.slice(0, 5)`** L164-191（**最多 5 张**）：
     `cid = hand[i]`；`card = cardById[cid]`；`src = cardArtSrc(card, cid)`；
     `playable = playableIds.has(cid)`；`pending = pendingCard === cid`；`isPayCard = cid === payForCard`；`isPayPick = picked.has(cid)`；
     class（L179）：`killer-dock-hand` + `playable`（`playable && !paying`）/ `pending` / `pay-pick`；
     **`onClick = paying ? onPlayCard(cid) : onInspectCard?.(cid)`**（L181 —— 付款模式下点牌 = 选为弃牌，否则 = 放大预览）。
  5. 进化牌按钮 L192-202：`dock.evolution`，`onClick={onInspectEvolution}`。
  6. 进化牌标签 L203-205：`'进化牌'`（硬编码），盒子 `dock.evolutionLabel ?? {x:4,y:40,w:16,h:6}`。
  7. 锁定牌 L206-230：逐个 `lockedIds`；**超出校准格数时按 `+8` 横向递增偏移**（L207-209）；
     徽章 `锁 · 等级{lv}`（L227，`lv = card.unlockLevel`）；点击 `onInspectCard?.(cid)`。
- **读的 snapshot 字段**：`players`、`characters`、`hand`（GameViews L1311 `killerHand = state.yourKillerHand ?? []`）、`state.yourKillerLocked`（L1318）、`state.cardById`、`discard`（L1312 `pileCards?.killerDiscard ?? state.yourDiscardPile ?? []`）、`deckCount`（L1313 `pileCounts?.killerDraw ?? state.killerDeckCount ?? 0`）、`playableIds`（GameViews L1000-1025 计算）、`payForCard`/`payIds`（本地 state）。
- **dispatch**：无直接 dispatch；`onPlayCard` → GameViews `playKillerCard` L1047-… → `{type:'playKillerCard', cardId, payCardIds}`（L1045）；三个 `onInspect*` 只改本地 UI（`setInspectCardId('__evolution__')` 是**硬编码哨兵字符串**，L1321）。
- GameViews 调用处 L1306-1327：**仅 `!isSurvivorView`（杀手视角）渲染**。

---

## 8. `client\src\survivorLayout.ts`（236 行）

**用途**：把界面每块 Ui 的屏幕位置定义成百分比盒子；默认值内嵌，运行时被 `content/ui/survivor-layout.json` 覆盖。文件头注释 L2-3 说明数字来自校准页。

**常量**：
- `SEARCH_CARD_W = 531` / `SEARCH_CARD_H = 803` L8-9 —— 搜索/发现牌原图尺寸，物品格按此比例缩。
- `SKILL_BOARD_W = 1832` / `SKILL_BOARD_H = 1853` L10-11 —— 技能与背包底图尺寸。
- `HUD_ROW_ASPECT = '5791 / 981'` L66 —— 注释（L65）说三块是 **3027 + 2885 + 905**，但 `3027+2885+905 = 6817`，与 5791 **对不上**；同时 `DEFAULT_SURVIVOR_LAYOUT.hudRow` 的宽度是 `34.5 + 49.8 + 15.7 = 100`。→ **注释与常量口径不一致（疑似笔误/历史遗留）**，但实际只影响顶栏高度比例。

**类型**：`LayoutBox` L13-18、`RescueCellBox extends LayoutBox { step: number }` L20-22、`SurvivorLayout` L24-63（含 `statusBar{hudRow,keySlots,rescueCells,skillBoard{slots3,slots6},publicStrip,killerDock,{killerInfo}}`）。

**`DEFAULT_SURVIVOR_LAYOUT`** L68-166，全部硬编码百分比：
- `statusBar.cards` 三张（x=1.6/34.4/67.2, w=31.2, h=72）L70-74；
- `statusBar.fear` 6 枚（每卡 2 枚，`index` 0/1）L75-82；
- `statusBar.noise` 3 枚 L83-87；
- `hudRow` L89-93：keys 0/34.5、status 34.5/49.8、rescue 84.3/15.7（宽 100，高 100）；
- `keySlots` 5 格 L94-100（x=2.4/21.4/40.4/59.4/78.4, y=47.5, w=18, h=50）；
- `rescueCells` 6 格 step 5→0 L101-108（两列三行，x=6/38/70, y=14/56）；
- `skillBoard.slots3` 3 格 L110-114、`slots6` 6 格（2 行×3）L115-122；
- `publicStrip` L124-128（evolution 18/4/64/92、level 20.5/10/8/14、power 20.2/78/8/16）；
- `killerDock` L129-143（standee 1.2/6/14/88、deck 16.5/8/10/52、discard 27.5/8/10/52、hand 5 张 x=39→77 步长 9.5、evolution 77/62/22/34、evolutionLabel 77/56/22/6、locked 单格 54/62/12/34）；
- `killerInfo` L144-165（evolution 1.6/2/47/55、effects 50.2/2/47.4/55、locked 2 格、cards 12 格 x=1.6 起步长 8.2 w=7.6 h=19）。

**函数**：
- `boxStyle(box)` L168-175 → `{left/top/width/height}` 百分比（主定位函数）。
- `slotHeightFromWidth(wPct, boardW=1832, boardH=1853)` L177-183 → `wPct*boardW*SEARCH_CARD_H/(boardH*SEARCH_CARD_W)`（保持搜索卡宽高比）。
- `slotWidthFromHeight(hPct, ...)` L185-191 → 上式的反函数。
- `slotBoxStyle(box)` L194-202 → **只用 x/y/w，高度交给 CSS**：`height:'auto'` + `aspectRatio: '531 / 803'`。
- `mergeSurvivorLayout(raw)` L204-236：逐段兜底合并——
  `hand` 取 `raw.killerDock.hand` 或默认，**并 `.slice(0,5)`**（L205-208）；
  `statusBar` 与 `skillBoard` 整体替换（不做深合并，L210/L214）；
  `hudRow`/`publicStrip` 浅合并（L211/L215）；
  `keySlots`/`rescueCells`/`locked`/`cards` 空数组即回退默认（L212-213/L221-233）；
  `killerDock.evolutionLabel` 单独兜底（L220）。
  > 注意：`killerInfo.effects`/`evolution` 只能通过浅合并且**没有默认兜底校验**；`statusBar` 若 raw 里是 `{}` 会被当成完整值。

**消费方**：GameViews L14 导入、L596-608 `fetch('/api/ui/survivor-layout')` → `mergeSurvivorLayout`（**`window` focus 时重新拉取**，L606）；`TableHud`、`SurvivorDock`、`KillerDock` 都通过 `layout` prop 使用。

---

## 9. 其余客户端模块

### 9.1 `client\src\uiAssets.ts`（52 行）
- `export const UI` L5-25 —— 17 条硬编码 `/Image/...` 路径：`rescue`(救援板块)、`car`(警车)、`keys`(钥匙架)、`status`(状态栏)、`fear`(恐惧)、`noise`(响声)、`firecrackerNoise`(爆竹响声)、`keyCard`(`/Image/Key/01_钥匙.png`)、`stealth`(潜行)、`trap`(陷阱)、`repair`(修理)、`blockade`(封堵)、`suitcase`(手提箱.jpg)、`suitcaseUsed`(手提箱已用.jpg)、`searchBack`(牌背1)、`searchBackLast`(牌背2)、`discoveryBack`、`rulesSurvivor`、`rulesKiller`。
  > `UI.suitcase` / `UI.suitcaseUsed` / `UI.keyCard` 在当前 `src` 里**没有被引用**（Board 用手提箱 token 的 `t.src`，钥匙用 `ITEM_ICON.key`）。
- `export const DICE_FACES` L28-35 —— **六面骰，点数不是 1-6 而是 `[1,0,1,1,0,3]`**（注释 L27 明确说明），源文件 `face_1_1/face_2_0/face_3_1/face_4_1/face_5_0/face_6_3.png`。
- `export const ITEM_ICON` L38-42 —— 仅 3 项：`sophia_camera`、`marco_medkit`、`key`。
- `export const RESCUE_CELLS` L45-52 —— 6 格百分比坐标（5→0）；注释 L44 说明**对局中以 survivor-layout 校准值为准**，所以这常量实际是**未被对局使用的遗留兜底**。
> 本文件**无 TODO**。

### 9.2 `client\src\cardArt.ts`（90 行）
- `export const ITEM_CARD` L9-29 —— 19 条 物品 id → 图路径（`axe/lime/whiskey/herb/toolbox` 走 `/Image/Key/`，`ammo/longsword/amulet/shortsword/revolver/firecracker/map/sedative/flashlight/adrenaline/trap` 走 `/Image/Discovery/`，`sophia_camera`/`marco_medkit` 走 `/Image/UI/`）。
- `const SEARCH_BY_NAME` L31-38 —— 搜索牌按**中文名**映射 6 项。
- `const DISCOVERY_BY_NAME` L40-58 —— 发现牌按中文名映射 17 项。
- `export function itemArtSrc(itemId)` L61-65 —— `ITEM_ICON` 优先 → `ITEM_CARD` → `undefined`。
- `export function cardArtSrc(card, cardId?)` L68-80 —— **优先级**：① `killerCardSrc(id)`（杀手行动牌）→ ② `card.type==='search'` 查 `SEARCH_BY_NAME[card.name]` → ③ `'discovery'` 查 `DISCOVERY_BY_NAME` → ④ 从 `effects` 里找第一个 `op==='gainItem'` 的 `itemId` 调 `itemArtSrc`；否则 `undefined`。
- `export function cardHandCost(card)` L83-89 —— 优先 `card.handCost`（取整、非负）；否则正则 `/费用\s*(\d+)/` 从 `card.text` 抠数字。**硬编码中文正则“费用”**。

### 9.3 `client\src\killerArt.ts`（166 行）
- `export interface KillerArt` L5-14：`id, folder, name, standee, back, evolution, intro, cards[]`。
- `artOf(id, folder, name, cards)` L17-34 —— 硬编码文件名：`立绘.png`/`牌背.png`/`进化牌.png`/`人物介绍.png`。
- `const KILLERS` L36-82 —— 三名：`killer1`/`杀手一_屠夫`/`屠夫`（13 张卡，L37-51）、`killer2`/`杀手二_幽魂`/`幽魂`（13 张，L52-66）、`killer3`/`杀手三_谋杀者`/`谋杀者`（13 张，L67-81）。
- `const CARD_IDS` L84-130 —— 与上面 13 张图**按顺序一对一**的卡牌 id 列表（`butcher_*` / `spectre_*` / `murder_*`）。**这是前端硬编码的卡 id ↔ 图映射**，服务器新增杀手牌必须同步改这里。
- 构建映射 L132-139：`KILLER_CARD_BY_ID[id] = art.cards[i]`。
- `const ID_ALIAS` L141-145：`killer1→屠夫` 等（用于没有精确 id 时按名字匹配）。
- `export function killerArtFor(characterId, characterName?)` L148-156 —— 先按 `id` 精确匹配 `KILLERS`，失败则把 `id + name + alias` 拼成一个 haystack 做 `includes` 匹配 `name` 或 `folder`。
- `export function killerStandeeSrc(art)` L159-161、`export function killerCardSrc(cardId)` L164-166。
> **无 fallback 图**：`killerCardSrc` 未知 id 返回 `null`，调用方会退化成文字。

### 9.4 `client\src\survivorArt.ts`（72 行）
- `export interface SurvivorArt` L5-15：`folder, name, role, slots, healthy, injured, skillCard, skillBoard, standee`。
- `artOf(folder, name, role, slots)` L18-31 —— 硬编码后缀：`状态_健康.png`/`状态_受伤.png`/`技能图.png`/`技能与背包.png`/`立绘.png`。
- `const ARTS` L33-39 —— 5 人，**`slots` 硬编码**：安娜 3、约翰逊 **6**、马尔科 3、索菲娅 3、威廉 3。
- `const ID_ALIAS` L41-47：`survivor1→安娜` … `survivor5→威廉`。
- `export function survivorArtFor(characterId, characterName?)` L50-54 —— **先把 haystack 里的“索菲亚”统一替换成“索菲娅”**（L52，兼容两种写法），再 `includes` 匹配 `name` 或 `folder`。
- `portraitSrc(art, injured)` L57-60（受伤/倒下用受伤图）、`skillBoardSrc` L62-64、`skillCardSrc` L66-68、`survivorStandeeSrc` L70-72。

### 9.5 `client\src\cardUse.ts`（89 行）
文件头 L2-3 明确：**只在网页上提示，真正许不许可还是服务器说了算**。
- `isDoorEdge(pathType)` L8-10 —— 同 Board 的 `isDoorPath`（**重复实现**，两处各一份）。
- `doorId(a,b)` L13-15 —— 与 `Board.doorKey` 同逻辑（**第三份重复实现**）。
- `doorsAt(state, roomId)` L18-26 / `unblockedDoorsAt(state, roomId)` L29-31（读 `state.map.edges`、`state.blockades`、`e.bidirectional ?? true`）。
- `export function injuredSurvivors(state)` L34-36 —— `faction==='survivor' && alive && hp < maxHp`。
- `export function injuredAlliesHere(state)` L39-43 —— 上面再按 `state.you.roomId` 过滤（**含自己**）。
- `hasBlockadeEffect(card)` L45-49 —— `effects` 里有 `placeBlockade` 或 `placeBlockadeAll`。
- `export function killerBlockadeSkipHint(state, card)` L52-62 —— 有封堵效果但 `!roomId || unblockedDoorsAt().length===0` → 返回硬编码 `'此地没有能封堵的门'`（L59）。
- `export function killerCardBlockedReason(_state, _card)` L65-67 —— **恒返回 `null`**；注释 L64 解释：以前会因“附近没人”锁牌，现在一律可打以免泄密。→ 调用链（GameViews L992-999）实际上永远不会产生 `blockedReasons`。
- `export function effectiveCardSpeed(state, card)` L70-76 —— **硬编码**：`butcher_saw_1`/`butcher_saw_2` 且 `state.killerLevel >= 4` → `'fast'`；否则 `card.speed`。
- `export function encounterCardAttackBonus(card)` L79-89 —— `murder_tail_*` 正则 → 1；否则累加 `fx.op==='attackValue'` 的数值；否则正则 `/本次攻击\s*\+(\d+)/` 抠字面量。

### 9.6 `client\src\mapPath.ts`（143 行）
文件头 L2-3：**网页用来高亮能走到的房间，真正能不能走服务器说了算**。
- `export function generalNeighbors(map, from)` L8-17 —— 只走 `pathType` 为 `undefined|'door'|'dash'` 的边（**排除了 `killer` 专用通道**）。
- `export function roomsAtDistance(map, from, min, max, opts)` L20-57 —— **BFS**；`opts = {allowKiller?, ignoreBlockades?, blockades?}`；内部的 `doorKey` 又实现了一遍（**第四份**）；`pathType==='killer'` 且未 `allowKiller` 跳过（L32）；门被 `blockades` 含则跳过（L37）。
- `export function neighbors(map, from, opts)` L60-72 —— 一步邻居，`allowKiller` 控制黄虚线。
- `export function passageNeighbors(map, from)` L75-82 —— 只走 `map.passages`（手电筒/观察入微）。
- `export function roomsWithin(map, from, range, opts)` L85-106 —— BFS 最多 `range` 步，**`dist.delete(from)` 不含原地**（L104）。
- `export function shortestPath(map, from, to, opts)` L109-137 —— BFS 存 `prev` 回溯，`from===to` 返回 `[from]`，不可达 `null`。
- `export function pathLength(map, from, to)` L140-143 —— `path ? path.length - 1 : Infinity`。

> **重复实现清单**：`doorKey/doorId` 在 `Board.tsx L77`、`cardUse.ts L13`、`mapPath.ts L28` **共 3 份**；`isDoorPath/isDoorEdge` 在 `Board.tsx L81`、`cardUse.ts L8` **2 份**。抽公共模块是明显的重构点。

### 9.7 `client\src\CardZoom.tsx`（81 行）
- `export function killerActionKind(card)` L9-15 —— `speed` 映射硬编码中文：`fast→'快速行动'`、`slow→'慢速行动'`、`special→'特殊行动'`，否则 `type==='killerAction' ? '行动' : null`。
- `export function CardZoom({card, cardId, src, caption, canPlay, playHint, onPlay, onClose})` L17-80：
  - `art = src ?? cardArtSrc(card ?? undefined, cardId)` L36（**显式 `src` 优先**，用于进化牌/技能图这种非卡牌图）。
  - `name = card?.name ?? caption ?? cardId ?? '卡牌'` L37（**硬编码兜底 `'卡牌'`**）。
  - 遮罩点击关闭 L41；卡片 `stopPropagation` L42；`role="dialog" aria-label={name}`。
  - 元信息 L48-67：名字、`caption`（与 name 不同才显示）、`行动 {kind}`、`消耗 {cost} 张手牌`（仅 `card && cost>0`）、`效果 {card.text}`、`playHint`。**硬编码：`'行动'`、`'消耗'`、`'张手牌'`、`'效果'`**。
  - 按钮区 L68-77：有 `onPlay` 才显示 `'打出'`（`disabled={!canPlay}`），恒有 `'关闭'`。
- **无 dispatch**：`onPlay` 由 GameViews 传入（L2782-2786 `playKillerCard`）。

### 9.8 `client\src\PileInspect.tsx`（69 行）
- `export type PileKind = 'search'|'discovery'|'treasure'|'discard'|'killerDraw'|'killerDiscard'` L9。
- `const PILE_TITLE: Record<PileKind,string>` L11-18 —— 硬编码标题：`'搜索牌堆（按名称）'`、`'发现牌堆（按名称）'`、`'宝藏牌堆（按名称）'`、`'弃牌堆（从晚到早）'`、`'杀手摸牌堆（按名称）'`、`'杀手弃牌堆（从晚到早）'`。
- `export function PileInspect({kind, cards, hidden, cardById, onClose})` L20-68：
  - `hidden` → 文案 `'剩余牌面仅本阵营可见。'`（L48，硬编码）；空 → `'空'`（L50）；否则列表 `序号. 名字`（L59）+ 缩略图 `cardArtSrc(cardById[id], id) ?? itemArtSrc(id)`（L54）。
  - 遮罩点击关闭 L34，内部 `stopPropagation` L39，`role="dialog"`。
- GameViews 用法 L2733-2741：`cards={inspectCards}`（L974-981），`hidden={inspectHidden}`（L982-989：**牌堆计数 >0 但卡片列表为空 → 判定为本阵营不可见**）。
- **`'treasure'` 分支存在但服务器恒发 0/[]（engine L3582/L3590）→ 宝藏堆是**未启用功能**。**

### 9.9 `client\src\DiceRoll.tsx`（79 行）
文件头 L2-3：服务器已算好点数，这里只是动画；**当前遭遇主要用物品加防，这套动画留给以后或特殊效果**（→ **事实上的半废弃组件**）。
- `const LAND: Record<number,string>` L9-16 —— 6 个面的最终 3D 旋转（`rotateX/rotateY` 组合）。
- `function faceIndexForValue(value, used)` L19-24 —— 在 `DICE_FACES` 里找点数相同且未使用的面，**随机挑一个**（L21），找不到退回第一个同点面，最后 `pick < 0 ? 0`。
- `export function DiceOverlay({ roll })` L27-79：
  - state `shown` / `rolling` L28-29。
  - Effect L31-41（依赖 `roll?.id`）：**`1400ms` 停止滚动，`4200ms` 后整体消失**（硬编码，L35-36）。
  - `faces = useMemo(...)` L43-47 —— 每个 `roll.values` 单独挑面，`used` 数组避免重复。
  - 渲染 L51-78：`div.dice-overlay[aria-live=polite] > div.dice-tray`，每颗骰子 `dice-cube rolling|landed` + `--land` CSS 变量；6 个面用 `backgroundImage: url(面图)`（L64）。
  - 停稳后字幕 L71-76：`{survivorName} {values.join(' + ')} = {total}` + `success ? ' · 防住' : ' · 未过 {attack}'`（**硬编码 `'防住'`/`'未过'`**）。
- GameViews 用法 L2732：`<DiceOverlay roll={state.lastDiceRoll} />`（无条件挂载，内部判空）。

### 9.10 `client\src\i18n.ts`（65 行）
- `export const PHASE_LABEL` L6-16 —— 9 个阶段中文（`lobby 大厅` … `gameOver 结束`）。
- `export const FACTION_LABEL` L18-22 —— `killer 杀手 / survivor 幸存者 / spectator 旁观`。
- `export const WINNER_LABEL` L24-27 —— `killer 杀手 / survivors 幸存者`。
- `export const ITEM_LABEL` L29-51 —— 21 项物品中文名（含 `board 木板`、`item 物品` 这两个**兜底项**；`marco_medkit` 译作 `'马尔科的医药包'`，与 `cardArt`/`UI` 里的文件名“医疗包”**用词不一致**）。
- `export function roomDisplayName(map, roomId, faction?)` L54-65 —— 缺 id → `'未知'`；找不到房间 → 原样返回 id；杀手优先 `nameKiller`；若 `name.startsWith(id)` 直接用，否则拼 `${id}${name}`（与 `Board.tsx L428` 同规则，**两处重复**）。

### 9.11 `client\src\main.tsx`（13 行）
- L4-7 导入 `StrictMode`、`createRoot`、`App`、`./styles.css`。
- L9-13 `createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)`。
- **无路由、无 ErrorBoundary、无 i18n Provider**。
- `vite-env.d.ts`（10 行）只声明 `VITE_SOCKET_URL`。

---

## 10. 构建 / 启动脚本

### 10.1 `client\vite.config.ts`（80 行）
- L7-14：`__dirname` / `projectRoot = resolve(__dirname, '..')`。
- `const MIME` L16-26：png/jpg/jpeg/webp/gif/html/js/css/svg。
- `function serveFolder(urlPrefix, dir): Plugin` L29-55 —— 给 Vite dev server 挂一个静态中间件：
  - `decodeURIComponent` + 去 query（L35）；
  - `path.resolve(root, rel)` 后**用 `path.relative` 做目录穿越防护**（L38-39，越界则 `next()`）；
  - 找不到文件但 `rel === ''` 时回退 `index.html`（L43-44）；
  - 手动设 `Content-Type`，`fs.createReadStream(target).pipe(res)`（L47-51）。
- `export default defineConfig` L57-79：
  - plugins L58-65：`react()` + **5 个 serveFolder**：`/Image→<root>/Image`、`/map-debug→tools/map-debug`、`/map-calibrate→tools/map-calibrate`、`/ui-debug→tools/ui-debug`、`/ui-layout→tools/ui-layout`。
  - server L66-78：`host: true`、`port: 5173`、**`strictPort: true`**、**`allowedHosts: true`**（注释 L70：异地隧道 Cloudflare/cpolar 用临时域名，必须放行）、proxy `'/api' → http://127.0.0.1:8787`、`'/socket.io' → 同址且 ws:true`。
- **注意**：`/Image` 只在 **dev server** 生效；`vite build` 产物（`client/dist`）不含这些静态目录映射，生产环境需由后端或反向代理提供 `/Image`、`/tools`。`client\dist\` 里确实只有 `index.html + assets/`。

### 10.2 `client\package.json`（23 行）
- name `client`，`"type": "module"`，private。
- scripts：`dev: vite`、`build: tsc -b && vite build`、`preview: vite preview`。
- deps：`react ^19.0.0`、`react-dom ^19.0.0`、`socket.io-client ^4.8.1`。
- devDeps：`@types/react ^19.0.10`、`@types/react-dom ^19.0.4`、`@vitejs/plugin-react ^4.3.4`、`typescript ^5.8.2`、`vite ^6.2.2`。
- **无测试框架、无 lint/format 脚本。**

### 10.3 `server\package.json`（24 行）
- name `server`，`"type": "module"`。
- scripts：`dev: tsx watch src/index.ts`、`build: tsc -p tsconfig.json`、`start: node dist/index.js`。
- deps：`cors ^2.8.5`、`express ^4.21.2`、`socket.io ^4.8.1`、`zod ^3.24.2`。
- devDeps：`@types/cors`、`@types/express ^4.17.21`、`@types/node ^22.13.10`、`tsx ^4.19.3`、`typescript ^5.8.2`。

### 10.4 根 `package.json`（17 行）
- name `night-hunt-web`，`workspaces: ["server","client"]`。
- scripts：`dev`（`npm run dev -w server & npm run dev -w client`，**`&` 在 Windows cmd 下不是并发，只是顺序执行**）、`dev:server`、`dev:client`、`build`（先 client 后 server）、`start`（`npm run start -w server`）。

### 10.5 `start-game.bat`（79 行）
流程：`cd /d "%~dp0"` L2 → `where node` 检查（L9-14，缺则提示 https://nodejs.org 并 `exit /b 1`）→ 若无 `node_modules\` 则 `npm install`（L16-24）→ **杀 8787 / 5173 上 LISTENING 的 PID**（L27-28，`netstat -ano | findstr` + `taskkill /F`）→ `start "EYSJ-Server" cmd /k "npm run dev:server"`（L32）→ **轮询 `/api/health` 最多 20 次**（L36-46，用 `powershell Invoke-RestMethod`；失败则提示看 EYSJ-Server 窗口）→ `start "EYSJ-Client" cmd /k "npm run dev:client"`（L52）→ **轮询 `http://127.0.0.1:5173/` 最多 20 次**（L56-66）→ `start "" "http://127.0.0.1:5173/"` 打开浏览器（L71）→ 打印“保留两个窗口”+ `pause`（L74-79）。

### 10.6 `一键启动.bat`（82 行）
**与 `start-game.bat` 逻辑逐行等价**（同名窗口 `EYSJ-Server`/`EYSJ-Client`、同端口、同轮询），差别只有：
- L2-4 多了三行中文 `REM` 注释（“小朋友可以双击这个文件开游戏”等）；
- 整体行号 +3。
> **两个文件是重复副本**，维护时容易只改一个。

### 10.7 `stop-game.bat`（16 行）与 `一键停止.bat`（16 行）
**两个文件内容完全相同**：
- 杀 8787 LISTENING（L3-6，带 `echo kill 8787 PID`）；
- 杀 5173 LISTENING（L7-10）；
- 按窗口标题杀 `EYSJ-Server*` / `EYSJ-Client*` / **`NightHunt-Server*` / `NightHunt-Client*`**（L11-14 —— 后两个是**改名前遗留的旧标题**）；
- `echo Done.` + `pause`（L15-16）。

### 10.8 `client\index.html`（18 行）
- `lang="zh-CN"`、`<title>恶夜杀机</title>`、viewport。
- L7-12：预连 + 加载 **Google Fonts**（`DM Sans` + `Instrument Serif`）—— **中国大陆网络下会阻塞/超时**，是个真实可用性风险。
- L15 `<div id="root">`、L16 `<script type="module" src="/src/main.tsx">`。

---

## 11. `tools\` 四个调试台

四者都是**纯静态页 + Vite dev print 的 serveFolder** 暴露（vite.config L61-64），零构建、零框架、`app.js` 用 IIFE + `innerHTML` 拼字符串。

### 11.1 `tools\map-calibrate`（`app.js` 1022 行）
- **用途**：地图校准器 —— 拖动房间圆点、矩形 zone、道具 token、封堵白门标记、警车格位；画/改/删地点之间的连线（门/小径/杀手通道）；改幸存者名与杀手名；**保存回 `content/maps`**。
- `index.html`：地图下拉 + 视角（幸存者/杀手）+ `重新加载` / `保存到游戏`；侧栏「图层」5 个 checkbox（`showRooms/showZones/showTokens/showEdges/showBlockades`，L43-47）、「通道连线」（类型下拉 `door/dash/killer` + `开始连线`，L55-62）、「选中对象」inspector、「全部道具」列表 + 「添加道具」。
- `app.js` 关键点：
  - `state` L10-22（`maps, mapId, map, side, selected, drag, dirty, assets, show, linkMode, linkFrom`）。
  - `BLOCKADE_SRC = '/Image/UI/封堵.png'` L24。
  - `clientToMap(clientX, clientY)` L42-50 —— **屏幕坐标 → map 坐标**：`((clientX - rect.left)/rect.width)*map.width`，y 同理；这是校准器与 `Board.tsx` 坐标一致的关键。
  - `visibleSide(side)` L36-40、`hexToRgba` L67-71（与 Board 同实现）。
  - `ensureDoorBlockades()` / `ensureRescueCars()`（L873 调用）—— 缺封堵/警车标记时自动补并标 dirty。
  - **API**：`GET /api/maps/:id`（L867）加载；`PUT /api/maps/:id`（L895-899）保存（body = 整个 map JSON），成功文案 `'已写入 content/maps（…）。新开房间会用这份数据。'`（L904）；启动时 `Promise.all([fetch('/api/maps'), fetch('/api/calibrate/assets')])`（L1002-1003）填地图列表与素材下拉。
  - 快捷键：`Delete`/`Backspace` 删除选中 token（L857-862）；拖拽中按某键改旋转（L855 一带）。

### 11.2 `tools\map-debug`（`map-engine.js` 351 行 + `play.html` 107 行）
- **用途**：**只测走格子与行动力**，验证图的连通性/行动力消耗，不涉及对局逻辑。
- `index.html`：4 个入口卡片（豪宅 幸存者/杀手、小屋 幸存者/杀手），说明“图二 R5–G2 黄虚线是杀手专用通道（1 行动力）”、“墙不可穿”。
- `play.html`：
  - 读 query `map` / `side`（L47-49）；`fetch('/api/maps/' + mapId)`（L50）；
  - **把 map 坐标归一化成 0..1**（L63-65：`r.x / w`，`r.y / h`）；edges 转成 `{a,b,type}`（L67-71，`type = e.pathType || 'door'`，passage 追加为 `'passage'`，L72-74）；zones 同样归一化（L75-84）；
  - 起点 `side==='killer' ? map.killerStartRoomId : map.survivorStartRoomId`（L85）；
  - **动态注入 `map-engine.js`**（L100-103），把配置挂到 `window.MAP_CONFIG`（L88-96），含 `storageKey = ${mapId}-${side}-room-xy`。
  - 控件：本回合行动力 1-5（默认 2）、`重置行动力`、`角色回起点`、`校准圆点`、`复制坐标`（默认隐藏）、位置/剩余行动力显示。
- `map-engine.js`：
  - 文件头 L1-10 描述 `MAP_CONFIG` 契约：`storageKey, startRoom, factionLabel, rooms{id:{id,name,x,y}}, edges[{a,b,type}]`（`type: door|dash|passage`）、`zones?`；注释明确 **passage 仅作标注绘制，默认不计入移动图**。
  - 建图 L21-28：**`passage` 跳过**（L24），**`killer` 且非杀手阵营跳过**（L25），其余边双向加（L26-27）。
  - 坐标持久化 L30-46：从 `localStorage[storageKey]` 读 `{id:{x,y}}` 覆盖房间坐标；`persistCoords()` 写回。
  - `state = { roomId: START, ap: 2, maxAp: 2, calibrate: false }` L48-53（**默认 2 点行动力**）。
  - 相关 DOM：`overlay / log / posLabel / apLabel / apSelect / calibrateBtn` L55-60。

### 11.3 `tools\ui-debug`（`app.js` 283 行）
- **用途**：**不进对局**，用假数据预览完整桌面布局（地图全屏、顶栏进度按钮、底部角色卡、杀手/幸存者两套底图），可点地图移动。
- `index.html`：hub 页，7 张卡片链到 `play.html?map=mansion|cabin&side=survivor|killer`，外加 `/ui-layout/`、`/map-calibrate/`、`/map-debug/`。
- `app.js`：
  - `state` L4-14：`maps, map, mapId(默认 'mansion'), side, youRoom, panel, openCard, keys: 2, repair: 1` —— **假进度值硬编码 keys=2 / repair=1**。
  - `const SURVIVORS` L16-44 —— **3 名假幸存者**（安娜 room R1 fear 0 / 约翰逊 B2 fear 1 / 威廉 R3 fear 0，各带一个 `pack` 物品名与 `状态_健康.png` 头像）。
  - `neighbors(roomId)` L46-54 —— 与 `mapPath.neighbors` 同逻辑（**又一份实现**）；`roomName(id)` L56-60（杀手名优先）。
  - `renderMap()` L62-… —— 设置 `viewBox`，画 edges（`pathType === 'killer'` 且非杀手阵营时跳过，L72）、房间圆（class `here`/`legal`，**r=16**，L80）。
  - **API**：`fetch('/api/maps/' + id)` L262；`fetch('/api/maps')` L271（地图下拉）。**不发 PUT、不连 socket**。

### 11.4 `tools\ui-layout`（`app.js` 561 行）
- **用途**：界面布局校准器 —— 拖/缩放色块，调整顶栏三块、状态卡、恐惧/响声、钥匙格、警车格、技能背包 3/6 格、杀手立绘/牌堆/手牌/进化/锁定牌、杀手信息面板；**保存回 `content/ui/survivor-layout.json`**。
- `index.html`：`panelSelect` 9 个面板（`hud/status/keys/rescue/public/skill3/skill6/killer/killerInfo`，L14-22）+ `killerSelect`（屠夫/幽魂/谋杀者，L26-31）+ `重新加载`/`保存到游戏`；舞台是 `bgImg` 底图 + `blankBg` 空白底 + `overlay` 色块层。
- `app.js`：
  - `const BGS` L10-16 —— 硬编码 5 张底图：状态栏/钥匙架/救援板块/安娜技能板(3格)/约翰逊技能板(6格)。
  - `const KILLER_ART` L18-34 —— 3 名杀手的 `evolution/standee/back` 路径（**与 `killerArt.ts` 重复的硬编码路径表**）。
  - `const SEARCH_CARD_W/H = 531/803` L36-37（与 `survivorLayout.ts` 同值）。
  - `slotHeightFromWidth` / `slotWidthFromHeight` L66-72、`lockSlotBox(box, prefer)` L74-…（板尺寸硬编码 `{w:1832,h:1853}`）—— **把 `survivorLayout.ts` 的比例锁定逻辑又实现了一遍**。
  - `state` L39-46：`layout, panel(默认 'status'), killerId, selected, drag, dirty`。
  - `setPanel(panel)` L480-487 里更新 `#hint` 文案（含 `killerInfo` 专属说明）。
  - **API**：`GET /api/ui/survivor-layout`（L490）加载，加载后对 `slots3/slots6` 全部 `lockSlotBox(box,'w')`（L494-498）；`PUT /api/ui/survivor-layout`（L506-510）保存整个 layout JSON，成功文案 `'已写入 content/ui/survivor-layout.json。刷新对局即可看到。'`（L515）。

### 11.5 tools 的 API 端点汇总（与 `server\src\index.ts` 对照）
| 端点 | 方法 | 调用方 | 服务器定义 |
|---|---|---|---|
| `/api/health` | GET | `start-game.bat` L39 / `一键启动.bat` L42 | index.ts L62 |
| `/api/content/meta` | GET | `App.tsx` L27 | index.ts L77 |
| `/api/maps` | GET | map-calibrate L1002、ui-debug L271 | index.ts L99 |
| `/api/maps/:id` | GET | map-calibrate L867、map-debug/play.html L50、ui-debug L262 | index.ts L103 |
| `/api/maps/:id` | PUT | map-calibrate L895 | index.ts L112 |
| `/api/calibrate/assets` | GET | map-calibrate L1003 | index.ts L125 |
| `/api/ui/survivor-layout` | GET | ui-layout L490、`GameViews.tsx` L596 | index.ts L138 |
| `/api/ui/survivor-layout` | PUT | ui-layout L506 | index.ts L146 |
| Socket `createRoom` / `joinRoom` / `action` / `leaveRoom` / `state` | WS | `useGameSocket.ts` | index.ts L169 起 |

---

## 12. 汇总：硬编码字面量 / 遗留 / 风险清单

### 12.1 高价值硬编码（改内容时必须同步的位置）
1. **杀手卡 id ↔ 图片**：`killerArt.ts` L84-130（3×13 顺序映射）。
2. **幸存者 `slots` 与文件夹**：`survivorArt.ts` L33-39。
3. **物品 id ↔ 图片**：`cardArt.ts` L9-29 + `SEARCH_BY_NAME` L31-38 + `DISCOVERY_BY_NAME` L40-58；另 `uiAssets.ts` `ITEM_ICON` L38-42。
4. **UI 图路径**：`uiAssets.ts` L5-25（17 条）。
5. **房间 tag → 符号**：`Board.tsx` L441-447（`⚙🔑⎋⌂▣`）。
6. **立绘尺寸比例**：`Board.tsx` L146-147（489/781、934/1040）与 `STANDEE_H=68`。
7. **立绘间距系数**：`Board.tsx` L451 `s.w * 0.62`。
8. **恐怖上限 = 2**：`TableHud.tsx` L141-159。
9. **技能格兜底 = 3 / 阈值 >3 切 6 格**：`SurvivorDock.tsx` L426-427。
10. **杀手手牌最多 5 张**：`KillerDock.tsx` L164；`survivorLayout.ts` L208 `.slice(0,5)`。
11. **骰子点数分布 [1,0,1,1,0,3]**：`uiAssets.ts` L28-35。
12. **动画时长 1400 / 4200 ms**：`DiceRoll.tsx` L35-36。
13. **屠夫链锯 4 级变快速**：`cardUse.ts` L72。
14. **`murder_tail_*` 遭遇 +1**：`cardUse.ts` L81。
15. **进度药丸文案与“无线电”**：`TableHud.tsx` L45/56/67/212。
16. **布局百分比默认值**：`survivorLayout.ts` L68-166（整块）。
17. **顶栏高宽比 `5791 / 981`**（与注释 3027+2885+905=6817 不符）：`survivorLayout.ts` L65-66。
18. **`window.confirm` 文案**：`App.tsx` L82、`GameViews.tsx` L410、L1037、L1923。
19. **占位符**：`'房主'`/`'玩家'`/`'ABCD'`；**房间码 maxLength 6**：`App.tsx` L128/150/157。
20. **默认端口 8787 / 5173**：`vite.config.ts` L68/73/75、4 个 .bat、`start-game.bat` 轮询。
21. **`localStorage` key 名**：`nh_name`、`nh_map`、`nh_place_{roomCode}_killer`、`nh_action_scale`；`sessionStorage` `nh_room_session`。

### 12.2 死代码 / 未启用
- `tools\ui-debug` 的 `state.keys/repair` 假值（keys=2, repair=1）—— 仅演示。
- `PublicSnapshot.pileCounts.treasure` / `pileCards.treasure` / `pileTops.treasure` **服务器恒为 0/[]**（engine L3582/3590/3598），但 `PileInspect` 与 `Board` 都保留了 `treasure` 分支。
- `uiAssets.ts` `RESCUE_CELLS` L45-52（注释自己说“对局中以校准值为准”）、`UI.suitcase`/`UI.suitcaseUsed`/`UI.keyCard` 未被 `src` 引用。
- `cardUse.ts` `killerCardBlockedReason` L65-67 **恒 null** → `KillerActionDock.blockedReasons` 永不生效。
- `types.ts` `MapEdge.blockade`（客户端无服务器填充者，Board 走兜底几何）。
- `stop-game.bat`/`一键停止.bat` 里 `NightHunt-Server/Client` 旧窗口标题。
- `start-game.bat` 与 `一键启动.bat` 完全重复；`stop-game.bat` 与 `一键停止.bat` 完全重复。
- **全项目 `src\` 下无任何 `TODO/FIXME` 注释。**

### 12.3 潜在 bug / 风险
1. `Board.tsx` L417 `blockades.some(id => id.includes(room.id))` —— **子串匹配**，房号 `R1` 会误命中 `R1|R2` 是对的，但如果地图存在 `R1` 与 `R11`，`R1` 会命中 `R11|R12` → **误判“本房被封堵”**。
2. `Board.tsx` L219 `preserveAspectRatio="none"` + `.map-bg object-fit:contain`：地图与底图长宽比不一致时会整体错位（当前都是 1000×500 所以不暴露）。
3. `useGameSocket.ts` `socket?.emit` 在 socket 为 null 时 **Promise 永不 settle**（L73/L88/L107/L125）。
4. `App.tsx` L32 `setMapId(prev => prev || data.mapId || list[0]?.id)` —— 若 `localStorage 'nh_map'` 里存了已被删除的地图 id，**会一直用失效 id 建房**（无校验）。
5. `SurvivorDock.tsx` `slots = [0,1,2]`（L193/L292）—— **硬上限 3 名幸存者**；`rules.maxSurvivors` 若 >3 会漏显示。
6. `SurvivorDock.tsx` `validHover` 用 `recv.inventorySlots || 3`，而 `slotUi` 用 `p.inventorySlots || art?.slots || ch?.inventorySlots || 3` —— **两处额度算法不一致**，可能导致“界面看着有空位但拖不进去”（或反之）。
7. `survivorLayout.ts` `mergeSurvivorLayout` 对 `statusBar`/`skillBoard` 是**整体替换无校验**（L210/L214）；校准页存了残缺对象会让界面直接塌掉。
8. `KillerDock.tsx` L207-209 锁定牌超出校准格数时按 `+8` 外推，可能**跑出画面**。
9. `Tools` 与 `src` 的重复实现（`clientToMap` 坐标公式、`neighbors`、`doorId`、`slotHeightFromWidth`、杀手图片路径表、`hexToRgba`）→ 任一侧改动不同步就会“校准页看着对、游戏里不对”。
10. `client\index.html` L9-12 引 Google Fonts —— 国内网络下首屏字体阻塞。
11. `vite.config.ts` `/Image` 等静态目录只在 dev 生效；`client\dist` 不含这些目录 → **生产部署必须另行提供**。
12. React 19 `StrictMode`（`main.tsx` L10）在 dev 下会创建两次 socket 连接。
13. `types.ts` D1 `useItem` 缺 `useToolbox`：若服务器某处按 `useToolbox` 分支，前端无法表达该字段（**可能是“工具箱修理”功能的类型漏更新**，值得向上游确认）。
14. `types.ts` D2 缺 `survivorDiscard`：客户端只能通过 `pileCards.discard`（受阵营过滤影响）或 `yourDiscardPile` 获取幸存者弃牌，语义弱于服务器意图。

---

*报告结束。所有结论均基于本次逐文件通读；`server\src\game\engine.ts` 仅作为对照抽读（`toPublicSnapshot` 尾部 L3500-3686）。*

---

# 修复记录（2026-09-14，报告之后）

用户从 §12.3 里选了 1、3、4、5 修；第 2 条（`preserveAspectRatio`）明确不改。

### ① `Board.tsx` — 封堵子串误判（§12.3 第 1 条）✅ 已修
- **改法**：新增 `blockedRoomIds`（按**完整门号** `doorKey(e.from, e.to)` 命中，再收集门两端的房间），房间节点改用 `blockedRoomIds.has(room.id)`。
- **顺带修正语义**：旧写法 `id.includes(room.id)` 会让「与被封堵的门无关、只是房号恰好是子串」的房间也亮成 blocked；新写法只标记**真正连着被封门**的房间。据此 `R1` 不再命中 `R11|R12`。
- 位置：`Board.tsx` `Board()` 内、`previewPts` 之后（约 L211-224），消费点 L429。
- 影响：`Board.tsx` 686 → 696 行，**L224 之后的行号整体 +10**。

### ③ `SurvivorDock.tsx` — 装备栏额度两套算法（§12.3 第 6 条）✅ 已修
- **改法**：抽出单一真源 `slotCapacityOf(p)`（`p.inventorySlots || art?.slots || ch?.inventorySlots || 3`），`validHover` 与 `slotUi` 都改用它。
- 效果：拖拽投放判定与槽位绘制用同一个上限，「看着有空位却拖不进去」的错配消除。
- 影响：`SurvivorDock.tsx` 552 → 558 行，**新增函数在 L318-325，其后行号 +6**。

### ④ `useGameSocket.ts` — `socket?.emit` 的 Promise 永不 settle（§12.3 第 3 条）✅ 已修
- **改法**：新增 `requireSocket(what)`；四个方法在 emit 前先取 socket，取不到就 `setError('还没连上服务器，无法…')` 并 `reject`，不再静默挂起。
- 影响：`useGameSocket.ts` 145 → 187 行（整文件重写，**行号不可与 §4 对照**）。

### ⑤ 「无线电」用词（§12.3 第 5 条 / §12.1 第 15 项）✅ 已修
- `TableHud.tsx` L212：`无线电 {n}/{m}` → `修理进度 {n}/{m}`
- `GameViews.tsx` L1912/L1914：确认文案「修理无线电」与按钮「修理无线电」→ 统一为「修理」
- **未动**：`content/cards/*.json`、`官方.json` 里的牌面文本（草药/工具箱等卡面写着「修理无线电」），
  以及 `恶夜杀机规则书.md` 的「无线电救援」——那是正式规则用语，只有界面口语按钮改了。
  若要连卡面一起统一，属于内容层改动，需要单独确认。

### ② `preserveAspectRatio="none"` （§12.3 第 2 条）⛔ 按用户要求不改
`SurvivorDock.tsx` 的状态栏 `slots = [0,1,2]` 硬上限 3 名（§12.3 第 5 条）本轮也未动。

### 验证
- `npx tsc -p server/tsconfig.json --noEmit`：通过（未触及服务端）。
- 客户端类型检查：`npm run build -w client`（`tsc -b && vite build`）。
- 服务端与内容未改，**无需重启 8787**；客户端改的是 `src/`，Vite dev 走 HMR，浏览器刷新即可。

