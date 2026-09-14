# -*- coding: utf-8 -*-
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = Path(r"d:\game\night-hunt-web\项目文件说明（给新手）.docx")


def set_run_font(run, name="微软雅黑", size=11, bold=False, color=None):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    if color:
        run.font.color.rgb = RGBColor(*color)


def p(doc, text, *, size=11, bold=False, color=None, after=6):
    para = doc.add_paragraph()
    para.paragraph_format.space_after = Pt(after)
    para.paragraph_format.space_before = Pt(0)
    para.paragraph_format.line_spacing = 1.35
    run = para.add_run(text)
    set_run_font(run, size=size, bold=bold, color=color)
    return para


def h(doc, text, level=1):
    sizes = {1: 16, 2: 14, 3: 12}
    para = doc.add_paragraph()
    para.paragraph_format.space_before = Pt(14 if level == 1 else 10)
    para.paragraph_format.space_after = Pt(6)
    run = para.add_run(text)
    set_run_font(run, size=sizes.get(level, 12), bold=True)
    return para


def cell(c, text, bold=False, fill=None):
    c.text = ""
    para = c.paragraphs[0]
    para.paragraph_format.space_after = Pt(2)
    run = para.add_run(text)
    set_run_font(run, size=10, bold=bold)
    if fill:
        tcPr = c._tc.get_or_add_tcPr()
        shd = tcPr.makeelement(
            qn("w:shd"),
            {qn("w:val"): "clear", qn("w:color"): "auto", qn("w:fill"): fill},
        )
        tcPr.append(shd)


def table(doc, headers, rows):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, header in enumerate(headers):
        cell(t.rows[0].cells[i], header, bold=True, fill="E8E8E8")
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell(t.rows[r + 1].cells[c], val)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


def main():
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Cm(2.2)
    sec.bottom_margin = Cm(2.2)
    sec.left_margin = Cm(2.4)
    sec.right_margin = Cm(2.4)
    normal = doc.styles["Normal"]
    normal.font.name = "微软雅黑"
    normal.font.size = Pt(11)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("恶夜杀机网页版：项目文件说明")
    set_run_font(r, size=22, bold=True)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run("给完全新手　·　2026-09-14　·　只看 night-hunt-web 这一份")
    set_run_font(r, size=11, color=(0x66, 0x66, 0x66))

    p(doc, "你可以把这个项目想成两半：一半是「网页」（画按钮、收点击），一半是「裁判」（规则算不算、棋盘变成什么样）。改规则几乎总是改裁判；改长什么样几乎总是改网页。改完裁判之后，必须关掉再开「一键启动.bat」，网页才会连上新规则。")

    h(doc, "一、先认路：根目录在哪", 1)
    p(doc, "整份游戏代码在：d:\\game\\night-hunt-web")
    p(doc, "不要去改 node_modules 里面的东西，那是自动下载的工具包，改了也会被覆盖。")
    p(doc, "启动：双击 d:\\game\\night-hunt-web\\一键启动.bat。它会同时打开裁判（服务器）和网页。改了 server 或 content 之后，关掉这个窗口再开一次。")

    h(doc, "二、三层夹心", 1)
    table(
        doc,
        ["层", "文件夹", "人话"],
        [
            ["网页", "client\\", "玩家看见的地图、按钮、弹窗"],
            ["裁判", "server\\src\\game\\", "点了按钮以后，到底许不许、棋盘怎么变"],
            ["内容", "content\\ 和 Image\\", "牌面文字、地图、人物、图片。不是程序逻辑"],
        ],
    )
    p(doc, "还有一根网线：网页用 WebSocket 把「我点了搜索」发给裁判，裁判算完再把「现在棋盘长这样」发回来。这根线在 server\\src\\index.ts 和 client\\src\\useGameSocket.ts。")

    h(doc, "三、裁判这边每个文件干什么", 1)
    p(doc, "路径都从 d:\\game\\night-hunt-web\\server\\src\\ 算起。")

    h(doc, "game\\engine.ts　总开关 / 裁判长", 2)
    p(doc, "网页点的每一种按钮，最后都进这里的 handleAction。它决定：现在轮到谁、这步合不合法、遭遇怎么走、回合怎么结束。你要加一种新按钮，服务器和网页的「动作名单」都要加一条，并且在这里写 case。")

    h(doc, "game\\effects.ts　具体小动作", 2)
    p(doc, "走路、搜索、修理、加恐惧、扣血、封门、摸牌、洗牌。engine 说「走过去」，真正改房间号的是这里。封堵「先拆再放」的落点函数 tryPlaceBlockadeDoor 也在这里。各牌堆怎么洗，见第九节。")

    h(doc, "game\\evolution.ts　杀手进化牌", 2)
    p(doc, "三张进化牌的原文、升级当下加力量、开战先惊吓再伤害、呼啸后弃牌搜索、惊恐过度弃牌伤害、谋杀者重现 +3、4 级选 4 扇门。开局 1 级就生效，升级只叠加新一级。")

    h(doc, "game\\killerCards.ts　杀手行动牌一张张结算", 2)
    p(doc, "感知、追逐、呼啸而过、设障、留下、潜行重现。一张牌可能走好几步，走到要你点地图时会停下来，点完再继续。")

    h(doc, "game\\types.ts　棋盘上有哪些格子（数据长什么样）", 2)
    p(doc, "GameState = 裁判心里的完整真相。PublicSnapshot = 发给某个人看的删节版（杀手看不见修理进度等）。ClientAction = 网页能发来的每一种点击。改规则时如果多了一种「等你选」，通常要在这里加一个 pendingXxx 字段。")

    h(doc, "game\\roomManager.ts　房间和重连", 2)
    p(doc, "房间码、谁进来、谁断线用原昵称坐回原位。离开不删房间。")

    h(doc, "content\\loader.ts 和 content\\schema.ts", 2)
    p(doc, "开局时把 content 文件夹里的 JSON 读进来，并检查格式。牌少写了一个字段，往往是这里报错。")

    h(doc, "index.ts", 2)
    p(doc, "服务器大门：监听端口、把网页消息转给 engine。一般不用改。")

    h(doc, "四、网页这边每个文件干什么", 1)
    p(doc, "路径从 d:\\game\\night-hunt-web\\client\\src\\ 算起。")

    h(doc, "GameViews.tsx　对局主屏幕（最大的那个）", 2)
    p(doc, "大厅选角、行动区按钮、遭遇加攻加防、进化确认、弃牌搜索、过度伤害、查看杀手信息、再来一局。你在游戏里点到的大多数字，都在这个文件。")

    h(doc, "Board.tsx　地图", 2)
    p(doc, "房间、门、封堵、立绘、修理齿轮（杀手猜进度）。点地图选地点，也是这里收点击再交给 GameViews。")

    h(doc, "KillerDock.tsx / SurvivorDock.tsx", 2)
    p(doc, "杀手手牌区、求生者技能板和状态栏。")

    h(doc, "TableHud.tsx　顶栏钥匙 / 修理 / 恐惧", 2)
    p(doc, "上面三颗小药丸，点开看大图。")

    h(doc, "cardUse.ts　打牌前的网页提示", 2)
    p(doc, "只负责「灰色按钮上写一句为什么不能打」。真许不许可还是服务器说了算。遭遇加攻能加多少，网页和服务器各写了一份同样的判断，两边要一起改。")

    h(doc, "killerArt.ts / survivorArt.ts / cardArt.ts / uiAssets.ts", 2)
    p(doc, "图片路径：进化牌、立绘、卡牌、骰子、封堵图标。图片文件在 Image\\ 里。")

    h(doc, "types.ts　网页眼里的局面", 2)
    p(doc, "和服务器的 PublicSnapshot、ClientAction 对齐。服务器加了新字段，这里也要加，不然网页读不到。")

    h(doc, "useGameSocket.ts / App.tsx / main.tsx", 2)
    p(doc, "连服务器、进房、把局面塞给 GameViews。一般不用改规则。")

    h(doc, "i18n.ts / mapPath.ts / survivorLayout.ts", 2)
    p(doc, "中文名称、地图怎么算相邻、行动区各块摆在哪。")

    h(doc, "五、内容和图片", 1)
    table(
        doc,
        ["路径", "干什么"],
        [
            ["content\\cards\\killers.json", "三名杀手每张行动牌的文字和效果"],
            ["content\\characters\\official.json", "人物、技能、起始力量"],
            ["content\\rules.json", "手牌上限、封堵上限 7、力量上限 10 等数字"],
            ["content\\maps\\mansion.json 等", "房间和门怎么连"],
            ["content\\GAME_RULES.md / 恶夜杀机规则书.md", "给人看的规则，程序不会自动读"],
            ["Image\\Killers\\…\\进化牌.png", "三张进化牌原图"],
            ["Image\\Killers\\…\\卡牌\\", "每张行动牌的图"],
        ],
    )
    p(doc, "改 JSON 也要重启一键启动。只改图片、文件名没变，刷新网页即可。")

    h(doc, "六、一次改规则通常要动几处", 1)
    p(doc, "1. 如果是新选择（例如「确认进化」）：server types.ts 的 ClientAction + GameState；client types.ts 同样加一条。")
    p(doc, "2. engine.ts 的 handleAction 写 case；该停下来时设 pendingXxx。")
    p(doc, "3. 真正改数字（力量、恐惧、封堵）放 effects.ts 或 evolution.ts。")
    p(doc, "4. GameViews.tsx 画出按钮，调用 onAction({ type: '…' })。")
    p(doc, "5. 重启一键启动.bat。")

    h(doc, "七、这次进化相关，你最常翻的文件", 1)
    p(doc, "进化原文和结算：server\\src\\game\\evolution.ts")
    p(doc, "升级、开战、按钮：server\\src\\game\\engine.ts")
    p(doc, "恐惧 / 伤害 / 封堵落到门上：server\\src\\game\\effects.ts")
    p(doc, "呼啸而过、设障、留下：server\\src\\game\\killerCards.ts")
    p(doc, "确认进化、弃牌搜索、过度伤害、杀手信息列表：client\\src\\GameViews.tsx")

    h(doc, "八、不要动的地方", 1)
    p(doc, "node_modules\\、client\\node_modules\\、server\\dist\\：生成出来的，不是手写规则。")
    p(doc, "d:\\game 下面别的文件夹（比如 CUMCM 题目）和这套游戏无关。")

    h(doc, "九、各牌堆怎么洗（代码在哪）", 1)
    p(doc, "洗牌只有一个函数：server\\src\\game\\effects.ts 里的 shuffle。就是把数组打乱（Fisher–Yates）。所有牌堆都调用它，没有第二套随机。")
    p(doc, "数组约定：下标 0 是牌堆顶（摸牌用 shift 拿走），最后一项是牌堆底。所以「垫底」= push 到数组末尾。")
    p(doc, "开局组三堆牌：server\\src\\game\\engine.ts 的 finishStartCommon（约 690 行）。对局中途再洗：还是 effects.ts。")

    h(doc, "搜索牌堆", 2)
    p(doc, "开局：effects.ts 的 buildSearchDeck。从 5 张钥匙里随机抽 1 张放到牌堆底；其余钥匙和手斧、石灰、威士忌、草药、工具箱一起洗匀，叠在上面。所以第一轮摸到只剩一张时，那张一定是钥匙。")
    p(doc, "画面：client\\src\\Board.tsx 搜索堆多于 1 张时，顶上是普通牌背 Image\\Key\\牌背1.png，底下露出特殊牌背 牌背2.png；只剩 1 张时整张用特殊牌背。这只是显示，不管牌面是不是钥匙。")
    p(doc, "摸牌：doSearch → drawSearchCard。堆空了会走 ensureDeck：若搜索弃牌堆还有牌，把弃牌洗匀变成新摸牌堆（不再把钥匙垫底）。钥匙上架、物品进背包的不会进搜索弃牌堆，所以第一轮抽空后常常洗不回来，日志写「搜索牌库已空」。")
    p(doc, "牌面清单：content\\cards\\official.json → decks.search。")

    h(doc, "发现牌堆", 2)
    p(doc, "开局：engine.ts finishStartCommon 里 shuffle(content.cards.discovery 的全部 id)。整叠均匀洗，没有钥匙垫底，也没有特殊牌背。")
    p(doc, "摸牌：发现阶段 beginDiscoveryDraw 连抽 2 张（不够就全摸），走 drawDiscoveryCard → 空了同样 ensureDeck。没留下的那张进发现弃牌堆，因此发现堆有可能洗回来。钥匙上架、留下的物品进背包，不会回到弃牌堆。")
    p(doc, "两堆都空（牌都在钥匙架或背包里）且警车还没出动：杀手胜。救援已启动则跳过发现。")
    p(doc, "牌面清单：content\\cards\\official.json → decks.discovery。")

    h(doc, "杀手行动牌（摸牌堆）", 2)
    p(doc, "开局：finishStartCommon 只拿当前这名杀手的牌（killers.json 里 owner 对上的）。未锁定的洗进摸牌堆；锁定牌放进 killerLocked，不洗入。然后摸起始手牌 2 张（drawKillerCards）。")
    p(doc, "对局中途：杀手不用 ensureDeck。摸牌、从摸牌堆弃牌（挡住攻击弃 2）都先走 refillKillerDeckIfShort：摸牌堆张数不够时，先升级，再把弃牌洗匀接到摸牌堆底；原来剩下的几张仍按原顺序留在顶上。挡住弃 2、长剑让杀手摸 1、回合结束摸 3，都走这条。")
    p(doc, "升级入手的锁定牌直接进手牌，不经过摸牌堆。手牌满了再摸，多的牌正面进弃牌堆（仍算从摸牌堆拿走，不够照样升级）。")
    p(doc, "牌面清单：content\\cards\\killers.json → decks.killerAction。")

    h(doc, "求生者弃牌堆（地图上那一叠）", 2)
    p(doc, "不洗、不摸。搜索/发现没留下的牌、用掉的一次性物品会进来（survivorDiscard）。马尔科从这里按「最先进入」取肾上腺素或镇静剂。搜索堆、发现堆洗回来时，会把对应牌从这一叠里拿掉，避免同一张出现两处。")

    h(doc, "藏宝 / 宝物堆", 2)
    p(doc, "地图上有 treasure 区，但服务器发给网页的数量永远是 0，没有组牌、也没有洗牌。")

    table(
        doc,
        ["牌堆", "开局谁洗", "对局中再洗", "特殊规则"],
        [
            [
                "搜索",
                "buildSearchDeck（effects.ts）",
                "ensureDeck：弃牌洗匀成新堆",
                "开局随机 1 把钥匙垫底；画面最后一张用特殊牌背",
            ],
            [
                "发现",
                "finishStartCommon 整叠 shuffle",
                "ensureDeck：同上",
                "无垫底。两堆都空且未救援 → 杀手胜",
            ],
            [
                "杀手摸牌",
                "finishStartCommon 洗未锁定牌",
                "refillKillerDeckIfShort：升级后弃牌洗到堆底",
                "锁定牌不入堆；不够就进化",
            ],
            [
                "求生者弃牌",
                "空",
                "不洗",
                "只进不出（马尔科取药除外）",
            ],
        ],
    )

    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
