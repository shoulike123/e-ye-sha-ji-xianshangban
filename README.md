# 恶夜杀机

数据驱动的网页对战引擎：你自己填地图 / 角色 / 卡牌，系统负责建房、选角、回合与效果结算。自带演示内容方便试玩。

## 怎么开（不用敲命令）

双击项目里的 **`一键启动.bat`**，等浏览器打开 http://localhost:5173/

要停止：关掉弹出的两个黑窗口，或双击 **`一键停止.bat`**。

地图底图在 **`Image/Maps`**（幸存者1 / 杀手1 / 幸存者2 / 杀手2）。  
移动调试：http://127.0.0.1:5173/map-debug/  
地图校准（圆点、道具、地点连线，保存进游戏）：http://127.0.0.1:5173/map-calibrate/  
幸存者/杀手界面调试：http://127.0.0.1:5173/ui-debug/

## 用命令启动（可选）

```bash
cd d:\game\night-hunt-web
npm run dev:server
npm run dev:client
```

## 内容怎么填

见 [content/CONTENT.md](content/CONTENT.md) 和 [content/templates/](content/templates/)。

改完 JSON 后需要**重启服务端**（关掉再开「一键启动」或重启 Server 窗口）。

## 当前功能（第一期）

- 建房 / 房间码加入
- 选杀手或幸存者角色并准备开局
- 地图双视角（杀手默认看不到幸存者位置）
- 幸存者：移动、搜索、修理、技能
- 杀手：移动、攻击、行动牌、技能
- 可配置胜负：击杀 / 钥匙+入口 / 地图+隐藏出口 / 救援倒计时

## 技术栈

React + Vite · Node + Express · Socket.IO · Zod 内容校验
