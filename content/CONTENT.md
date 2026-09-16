# 内容录入说明

本引擎是**数据驱动**的。请把你自己的地图、角色、卡牌、规则数值放进 `content/`。服务端启动时会用 Zod 校验。

不要提交你没有授权的正版规则书全文或官方卡牌扫描。请使用你拥有权利 / 自己撰写的文案。

## 目录结构

```
content/
  rules.json              # 全局规则参数 + 使用哪张地图
  maps/<id>.json          # 房间图
  characters/<文件>.json  # { "characters": [ ... ] }
  cards/<文件>.json       # { "decks": { "search": [...], "killerAction": [...] } }
  templates/              # 空白模板
  CONTENT.md              # 本说明
```

修改 JSON 后请重启服务端。

## `rules.json` 字段

| 字段 | 含义 |
|------|------|
| `mapId` | 对应地图文件的 `id` |
| `maxSurvivors` / `minPlayersToStart` | 大厅人数限制 |
| `survivorMoveRange` / `killerMoveRange` | 基础移动格数 |
| `killerActionsPerTurn` | 杀手每回合行动次数 |
| `searchMakesNoise` / `repairMakesNoise` | 是否自动产生噪音 |
| `keysNeeded` / `repairNeeded` / `rescueWaitRounds` | 胜负相关数值 |
| `killerWinsOnAnyKill` | 击杀任意幸存者即胜 |
| `survivorExitRequiresAllAliveAt` | 入口撤离所在房间 id |
| `hiddenExitRequiresMapItem` | 隐藏出口需要持有 `map` 物品 |
| `killerSeesSurvivorPositions` | 杀手是否看见幸存者位置 |
| `survivorSeesKillerPosition` | 幸存者是否看见杀手（潜行仍可隐藏） |
| `killerDrawOnTurnEnd` | 杀手回合结束抽牌数 |

## 地图

- `rooms[]`：`id`、`name`（显示名可中文）、`nameKiller`（可选，杀手侧房间名）、`x`/`y`（仅界面）、`tags[]`
- 常用标签：`entrance`、`hiddenExit`、`searchable`、`repairable`
- `edges[]`：`from`、`to`、`bidirectional`（默认 true）、`pathType`（`door` / `dash` / `killer`）
- `pathType: "killer"`：杀手专用通道，常规移动消耗 1 行动力；幸存者不能走
- `passages[]`：特殊通道，仅标注，**不计入移动**
- `backgrounds`：`survivor` / `killer` 底图路径（图一 `幸存者1.png` / `杀手1.png`，图二 `幸存者2.jpg` / `杀手2.jpg`）
- `zones[]`：外围 UI 高亮；`side` 为 `killer` 时只在杀手视角显示
- `tokens[]`：叠在地图上的道具（潜行/修理/封堵等），含位置、宽高、旋转
- `survivorStartRoomId` / `killerStartRoomId`

建房时可选手图：`mansion`（豪宅）或 `cabin`（小屋）。校准程序：http://127.0.0.1:5173/map-calibrate/ （可编辑地点连线），保存后写入 `content/maps/*.json`。界面调试：http://127.0.0.1:5173/ui-debug/ 。

## 角色

- `faction`：`killer` | `survivor`
- `skills[]` 的 `trigger`：
  - `passive` — 回合开始生效
  - `activated` — 回合内按钮使用
  - 预留：`onTurnStart`、`onSearch`、`onNoise`、`onDamaged`

## 卡牌

- `type`：`search` | `killerAction` | …
- `effects[]` 只能使用引擎已实现的原子指令（见下表）

## 效果原子（v1）

| op | 说明 |
|----|------|
| `move` | `value` = 最大移动格数 |
| `search` | 从搜索牌库抽牌 |
| `searchSurvivors` | 攻击当前房间所有幸存者 |
| `repair` | 增加修理进度 |
| `noise` | `at`：`self` / `target` |
| `stealth` / `reveal` | 潜行 / 现身 |
| `damage` / `heal` | 伤害 / 治疗（治疗须与施术者同一地点，含自己） |
| `gainItem` | `itemId` + `amount`（`key` 会增加全局钥匙计数） |
| `modifyMoveRange` / `modifyAttackDamage` | 被动加成 |
| `quietSearch` | 下次搜索不发出噪音 |
| `waitRescue` | 修理完成后启动救援 |

## 胜负判定

1. 杀手：任意幸存者生命归零（若开启）
2. 幸存者：钥匙足够且全员在入口
3. 幸存者：持有地图且全员在隐藏出口
4. 幸存者：修理完成且救援倒计时归零

## 模板

从 `content/templates/` 复制后改名填写。卡牌 / 角色的 `id` 全局不要重复。
