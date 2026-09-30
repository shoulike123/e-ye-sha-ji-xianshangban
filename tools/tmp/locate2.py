"""dry-run：用"按钮行"反查三块的起止行（比注释/条件行可靠）。"""
import pathlib

lines = pathlib.Path("client/src/GameViews.tsx").read_text(encoding="utf-8").split("\n")
TAIL = "        )}"

for marker, label in (
    ("type: 'setReplacementDeck'", "promo(替换牌堆)"),
    ("type: 'setVariant1'", "变体1 开关"),
    ("type: 'setSplit'", "变体2 开关"),
    ("type: 'pickSplitFirst'", "变体2 选先手面板"),
    ("type: 'setMode', mode: 'multi'", "1对3 按钮"),
    ("type: 'setMode', mode: '2v3'", "2对3 按钮"),
):
    i = next(i for i, l in enumerate(lines) if marker in l)
    h = i
    while h > 0 and not lines[h].startswith("        {"):
        h -= 1
    e = next((k for k in range(h + 1, len(lines)) if lines[k] == TAIL), None)
    print(f"{label:16s} 按钮行 {i + 1:5d} | 推测块 {h + 1:5d} ~ {e + 1 if e else '?'} | 首行: {lines[h].strip()[:64]}")
