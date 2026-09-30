"""先 dry-run：定位 promo / 变体1 / 变体2 三块的起止行（花括号配对计数）。"""
import pathlib

lines = pathlib.Path("client/src/GameViews.tsx").read_text(encoding="utf-8").split("\n")


def block_range(marker: str) -> tuple[int, int]:
    hit = next(i for i, l in enumerate(lines) if marker in l)
    head = hit
    while not lines[head].strip().startswith("{/**"):
        head -= 1
    depth = 0
    for i in range(head, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if i > head and depth == 0:
            return head, i
    raise SystemExit(f"没找到 {marker} 的结尾")


for m in ("替换「鸿运当骰」等牌：", "【变体1】特性卡：{state.variant1", "【变体2】分头行动：{state.split"):
    h, e = block_range(m)
    print(f"{m[:16]!r}: 行 {h + 1} ~ {e + 1}  (共 {e - h + 1} 行)")
    print("   首行:", lines[h].strip()[:80])
    print("   尾行:", lines[e].strip()[:80])
