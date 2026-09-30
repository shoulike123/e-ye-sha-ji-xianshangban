"""在每个「感知命中」处补一句 offerSenseTraits（变体1 的 10/15/16 挂起）。"""
import pathlib

p = pathlib.Path("server/src/game/engine.ts")
t = p.read_text(encoding="utf-8")
old = "            queenSenseFear(state, witnessed);"
new = (
    "            queenSenseFear(state, witnessed);\n"
    "            /** 【变体1】感知命中 → 挂出可发动的特性卡（10/15/16） */\n"
    "            offerSenseTraits(state, witnessed);"
)
n = t.count(old)
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("替换处数:", n)
