"""大厅改造：
 ① 模式按钮顺序：2v3 挪到 1v3 **之后**；
 ② 新增【更多设置】折叠面板，把 promo（替换牌堆）/ 变体1 / 变体2 按这个顺序收进去。
"""
import pathlib

p = pathlib.Path("client/src/GameViews.tsx")
lines = p.read_text(encoding="utf-8").split("\n")

# ① 挪 2v3 按钮到 1v3 之后
start = next(i for i, l in enumerate(lines) if "className={state.mode === '2v3' ? 'primary' : undefined}" in l) - 2
end = next(i for i in range(start, len(lines)) if lines[i].strip() == "</button>")
block = lines[start : end + 1]
del lines[start : end + 1]
close13 = next(i for i, l in enumerate(lines) if l.strip() == "1对3")
# 1对3 的 </button> 在它之后
end13 = next(i for i in range(close13, len(lines)) if lines[i].strip() == "</button>")
lines[end13 + 1 : end13 + 1] = block
p.write_text("\n".join(lines), encoding="utf-8")
print("2对3 已挪到 1对3 之后")
