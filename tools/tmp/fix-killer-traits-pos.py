"""修正：把杀手特性卡块从 IIFE 的 return(...) 内部挪到**面板的最后一个子元素**位置。

正确位置 = 那一大块 `{(() => { ... return (<div className="killer-info-stage">…</div>); })()}` **之后**、
面板 `</div>` **之前**。
"""
import pathlib

P = pathlib.Path("client/src/GameViews.tsx")
lines = P.read_text(encoding="utf-8").split("\n")

START_MARK = "              {/**\n               * **【变体1】杀手特性卡**"
text = "\n".join(lines)
i = text.index(START_MARK)
# 块结束 = 从 START_MARK 起，找到下一个恰好 14 空格缩进的 ")}" 行
rest = text[i:].split("\n")
end_rel = next(k for k, l in enumerate(rest) if k > 0 and l == "              )}")
block = "\n".join(rest[: end_rel + 1])
text = text[:i] + text[i + len(block) :]
# 去掉留下的空行
text = text.replace("\n\n\n              );", "\n              );")

lines = text.split("\n")
# 插到 killer-info-stage 那一大块 IIFE 结束（`})()}`）之后
stage = next(k for k, l in enumerate(lines) if 'className="killer-info-stage"' in l)
close = next(
    k for k in range(stage, len(lines)) if lines[k].strip() == "})()}"
)
lines[close + 1 : close + 1] = [""] + block.split("\n")
P.write_text("\n".join(lines), encoding="utf-8")
print(f"已挪到 IIFE 结束（行 {close + 1}）之后")
print("块行数:", len(block.split(chr(10))))
