# 前端硬编码与风险清单

> 这份文件取代了旧的 `_frontend_structural_map.md`（790 行的逐文件结构报告）。
> 旧报告的**行号引用已全部失效**（`engine.ts` 3697→6310、`GameViews.tsx` 3161→4774，
> 27 处对照无一命中），逐文件结构分析也不再反映现状，因此不再维护行号。
>
> 这里只保留**仍然有效**的两部分：改内容时必须同步的硬编码位置、以及尚未处理的风险。
> 定位一律用**符号名**（函数 / 常量 / 类名），不用行号。

---

## 1. 改内容时必须同步的硬编码

| # | 内容 | 位置 |
|---|---|---|
| 1 | 杀手卡 id ↔ 图片（按牌序映射） | `client/src/killerArt.ts` → `KILLERS` 数组、`CARD_IDS` |
| 2 | 杀手特殊规则张数 / 立绘变体数 | `client/src/killerArt.ts` → `SPECIAL_RULE_COUNT`、`STANDEE_VARIANTS` |
| 3 | 杀手进化卡牌（未命名 4 张）文件名 | `client/src/GameViews.tsx` → `KILLER_EVOLUTION_CARDS` |
| 4 | 调试台的杀手素材表（九位） | `tools/shared/killer-art.js` → `KILLER_ART_TABLE` |
| 5 | 幸存者文件夹、栏位数、角色别名 | `client/src/survivorArt.ts` → `ARTS`、`ID_ALIAS`、`artOf(..., slots)` |
| 6 | 幸存者专属物品 | `client/src/GameViews.tsx` → `SURVIVOR_PERSONAL_ITEMS` |
| 7 | 物品 id ↔ 图片 + 按名字反查 | `client/src/cardArt.ts` → `ITEM_CARD`、`ITEM_ICON`、`SEARCH_BY_NAME`、`DISCOVERY_BY_NAME` |
| 8 | UI 图路径、物品小图标、幸存者标记图标 | `client/src/uiAssets.ts` → `UI`、`ITEM_ICON`、`SURVIVOR_TOKEN` |
| 9 | 房间 tag → 符号 | `client/src/Board.tsx` 的 `.room-tag` 那段。**特殊地点也要画**：`special-book` 📖 / `special-hammer` 🔨 / `special-spiral` 🌀 / `special-fork` 🔀（豪宅书本 = **R4 休息室**，小屋 = R5 101号房）|
| 10 | 立绘尺寸比例、立绘间距系数 | `client/src/Board.tsx` → `STANDEE_H` 与立绘偏移计算 |
| 11 | 布局百分比默认值（含 `skillBoard.body` 标记落点） | `client/src/survivorLayout.ts` → `DEFAULT_SURVIVOR_LAYOUT` |
| 12 | 「求生者相关物品」卡片尺寸 | `client/src/styles.css` → `.survivor-item-piece` 的 `--item-card-h: 130px`（宽度按卡牌比例 `0.661` 算）。**卡片定尺寸、行框贴合内容**；`h%` 不再参与尺寸计算（试过按 `h%` 反推，算到 680px 全是空白）。校准页的色块只用来决定**左右顺序**（按 `x` 排序）|
| 13 | 骰子点数分布 `[1,0,1,1,0,3]` | `client/src/uiAssets.ts` → `DICE_FACES`；服务端 `effects.ts` / `engine.ts` 各一份 |
| 14 | 恐惧上限 2 | `client/src/TableHud.tsx`；服务端 `effects.ts` → `addFear` 里的 `tokenMax` |
| 15 | 装备栏兜底 3 / 超过 3 切 6 格 | `client/src/SurvivorDock.tsx` → `slotCapacityOf`、`slotUi` |
| 16 | 杀手手牌上限 5 | `client/src/KillerDock.tsx`、`survivorLayout.ts` 的 `killerDock.hand` |
| 17 | 屠夫链锯 4 级变快速、`murder_tail_*` 遭遇 +1 | `client/src/cardUse.ts` |
| 18 | 占位符文案、房间码长度 6 | `client/src/App.tsx` |
| 19 | 默认端口 8787 / 5173 | `vite.config.ts`、各 `.bat` |
| 20 | `localStorage` / `sessionStorage` key 名 | `nh_name`、`nh_action_scale`、`nh_room_session` 等 |

> 注：`nh_map` 已无人使用（地图选择不再持久化），旧报告里关于它的风险不成立。

---

## 2. 风险清单

### 2.1 已全部处理

| # | 风险 | 处理方式 |
|---|---|---|
| 1 | 幸存者数量硬编码 3 | 状态栏卡位数改由 `layout.statusBar.cards` 长度决定；技能板行按在场人数分列（CSS 变量 `--board-cols`），不再写死 `[0,1,2]` 与 `repeat(3, ...)` |
| 2 | `survivorLayout` 的 `statusBar` 整体替换无校验 | 改为**逐键兜底**：新增 `isUsableBox()` / `usableBoxes()`，`null`、`undefined`、缺字段、`w/h ≤ 0`、`NaN` 一律退回默认值。**所有**布局键都走这一套（含 `killerInfo` 的每个子键、`skillBoard.body`、`survivorItems`）|
| 3 | `tools/` 与 `client/src` 的重复实现 | 四个工具页共用的纯函数抽到 `tools/shared/util.js`（`ToolUtil` 全局），各工具改为委托调用。**只合并真正重复的**：`clamp` / `round1` / `hexToRgba` / `clientToMap` |
| 4 | `index.html` 引 Google Fonts 阻塞首屏 | 改成非阻塞加载（`media="print"` + `onload` 切回，另有 `<noscript>` 兜底），并给字体栈补 CJK 回退 |
| 5 | React 19 `StrictMode` 双连接 | `useGameSocket` 的 effect 加**取消标志**，卸载后旧连接的回调全部失效（生产本来只跑一次，不受影响）|
| 6 | 静态目录只在 dev 生效 | 新增 `copyImagesToDist()` 构建插件：`npm run build` 时把 `Image/` 写进 `dist/Image`（优先**硬链接**，跨盘回退复制）。`dist` 现在是完整可部署产物 |
| 7 | 布局编辑器「杀手信息」面板：切到新杀手就没法编辑 | 编辑器里手写了 `KILLER_ART` / `lockedArt` / `ruleArt` / `evoCardArt` 四张表，**只写到 killer3**，切到 killer4–9 时底图全空。抽成 `tools/shared/killer-art.js`（`KILLER_ART_TABLE`，**九位齐全**，按目录实际内容生成），编辑器改读它 |
| 8 | **编辑器与游戏显示的布局不一致** | 老存档 `content/ui/survivor-layout.json` 的 `killerInfo` **只有 4 个键**（缺 `specialRule` / `evolutionCards`），也没有 `survivorItems`、`skillBoard.body`。游戏按缺键退回默认值，编辑器却用另一套 → 两边不同。现在①客户端逐键兜底、②编辑器 `ensureExtras()` 改成**逐键补**（原来是 `killerInfo` 整个缺失才补）。**在编辑器里保存一次**，存档就补齐、两边永久一致 |
| 9 | 「幸存者相关物品」卡片过小 | 面板用 `itemArtSrc()` 取图（原来错用 `cardArtSrc(cardById[...])`，专属物品不是牌所以永远查不到 → 只显示文字）；行高改为**按布局色块反推**（原 CSS 写死 190px，色块 `h:28%` → 卡片仅 53px 高），现在约 108px。同时补上凯莱布「幸运币」、迪伦「坚毅标记」|
| 10 | **杀手手牌卡面加载不出来**（killer4–9） | `client/src/killerArt.ts` 的 `CARD_IDS` **只写了 killer1–3**，导致 `killerCardSrc()` 对后六位杀手恒返回 `null` → 手牌只能显示一张通用牌背。已按 `content/cards/killers.json` 的出牌顺序补齐 killer4–9（含未命名 14 张），**118 张杀手牌全部可查** |
| 11 | **布局编辑保存了没用**（最重要的一条） | 服务端 `SurvivorLayoutSchema` 少了客户端后来加的键，而 **zod 默认会剥掉未声明的键** → 每次「保存到游戏」都被静默丢弃。缺的有：`killerInfo.specialRule`、`killerInfo.evolutionCards`、整个 `survivorItems`、`skillBoard.body`、整个 `roomMarkerOffsets`。已全部补进 schema（`roomMarkerOffsets` 形状是 `{dx,dy,size}`，单独用 `MarkerOffsetSchema`）|

> **教训**：新增布局键时，**客户端类型 + 编辑器 + 服务端 schema 三处都要加**。
> 只加前两处的话，保存会被 zod 静默吞掉，表现为「保存了没用」。
> `FRONTEND_RISKS.md` §1 的表格就是为此存在的对照表。

`tools/shared/util.js` / `tools/shared/killer-art.js` 里只放**与本项目规则无关的东西**
（纯函数、素材路径表）。规则相关的邻接 / 门号解析仍归 `client/src` 与 `server/`。

### 2.2 仍值得留意（非缺陷，是约定）

1. **`tools/` 与 `client/src` 的规则逻辑各写一份** ——
   工具页是独立的经典 script 页面，用不了 `client/src` 的 TS 模块。
   目前靠「工具只读地图 JSON、不改规则」来降低风险；真要统一需给工具加一层共享 JS 模块。
2. **`Image/` 有 413 MB** —— 构建时走硬链接所以不额外占盘，
   但若部署到别的盘符或打包上传，这份体积是实打实的。
3. **`skillBoard.slots6` 最多 6 格** —— 约翰逊就是 6，再多需要先加布局。

---

## 3. 维护约定

- 本文件**不记行号**。要定位就用符号名。
- 结构性的大改动不必同步到这里；这里只关心「硬编码在哪」和「风险还有哪些」。
- 加新幸存者 / 杀手时，先看 §1 的表逐项同步。
