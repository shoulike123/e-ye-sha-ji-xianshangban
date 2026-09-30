"""把 traitDisabledReasons 那段挪到 killerHand 定义之后（它引用了 killerHand）。"""
import pathlib

p = pathlib.Path("client/src/GameViews.tsx")
lines = p.read_text(encoding="utf-8").split("\n")

start = next(i for i, l in enumerate(lines) if "traitDisabledReasons: Record<string, string> = {};" in l)
# 往上找到那段注释的开头
head = start
while not lines[head].strip().startswith("/**"):
    head -= 1
# 往下找到那段结束（`}` 单独一行，缩进 2 空格）
end = start
while lines[end].rstrip() != "  }":
    end += 1
block = lines[head : end + 1]
del lines[head : end + 1]
# 去掉可能留下的空行
while lines[head].strip() == "" and lines[head - 1].strip() == "":
    del lines[head]

anchor = next(i for i, l in enumerate(lines) if l.startswith("  const killerHand = "))
lines[anchor + 1 : anchor + 1] = [""] + block
p.write_text("\n".join(lines), encoding="utf-8")
print("挪动行数:", len(block), "→ 插到 killerHand 之后")
