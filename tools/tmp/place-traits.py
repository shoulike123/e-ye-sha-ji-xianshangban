"""把裁好的 40 张特性卡搬进正式素材目录，并按 `NN_中文名.png` 命名。

- 源：`tools/tmp/traits/{sheet}_{NN}.png`（无损 PNG，503x333）
- 目标：`Image/Traits/幸存者/`、`Image/Traits/杀手/`
- **移动**而不是复制：不留重复文件；拼图（读卡用的临时件）直接删掉。
- 全程不重新编码像素：只是改名/移动。
"""
import shutil
from pathlib import Path

NAMES = {
    "survivor": [
        "速度爆发", "调度人员", "草药知识", "持枪证明", "武艺超群",
        "匆匆逃离", "无所畏惧", "紧急救治", "生存本能", "鼓舞士气",
        "安静搜查", "英勇阻截", "声音诱饵", "嘲讽战术", "吉人天相",
        "高度警觉", "秘密武器", "拾物妙手", "明智之举", "迅速反应",
    ],
    "killer": [
        "完全围困", "玩弄猎物", "狡猾诡计", "噩梦降临", "迅捷行动",
        "敏锐听觉", "进阶追踪", "压抑怒火", "慢热杀手", "即刻反应",
        "恐惧迸发", "致命攻击", "阴险圈套", "埋伏等待", "谋杀意图",
        "敏锐感知", "压迫威慑", "狡诈猎手", "恐惧光环", "危险伏击",
    ],
}
TARGET = {"survivor": "幸存者", "killer": "杀手"}
SRC = Path("tools/tmp/traits")


def main() -> None:
    total = 0
    for sheet, names in NAMES.items():
        dest_dir = Path("Image/Traits") / TARGET[sheet]
        dest_dir.mkdir(parents=True, exist_ok=True)
        for i, name in enumerate(names, 1):
            src = SRC / f"{sheet}_{i:02d}.png"
            if not src.exists():
                print(f"缺失 {src}")
                continue
            dest = dest_dir / f"{i:02d}_{name}.png"
            shutil.move(str(src), str(dest))
            total += dest.stat().st_size
            print(f"{dest}  {dest.stat().st_size / 1024:.0f} KB")
    for leftover in SRC.glob("montage_*.png"):
        leftover.unlink()
    print(f"共 {total / 1024 / 1024:.2f} MB（{sum(len(v) for v in NAMES.values())} 张）")


if __name__ == "__main__":
    main()
