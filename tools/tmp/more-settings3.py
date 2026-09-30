"""大厅【更多设置】（v3，块边界已 dry-run 确认）：
 ① 变体1（含注释）搬到变体2 之前 → 顺序 promo / 变体1 / 变体2
 ② 三块 + 先手面板加 `moreSettingsOpen &&` 前缀
 ③ promo 按钮包进 moreSettingsOpen
 ④ 「设置」标题旁加【更多设置】按钮 + state
"""
import pathlib

p = pathlib.Path("client/src/GameViews.tsx")
lines = p.read_text(encoding="utf-8").split("\n")
TAIL = "        )}"


def block_start(btn_marker: str) -> int:
    i = next(i for i, l in enumerate(lines) if btn_marker in l)
    h = i
    while h > 0 and lines[h] != "        {/**":
        h -= 1
    return h if lines[h] == "        {/**" else next(
        k for k in range(i, 0, -1) if lines[k].startswith("        {")
    )


def block_end(h: int) -> int:
    return next(k for k in range(h + 1, len(lines)) if lines[k] == TAIL)


h2 = block_start("type: 'setSplit'")
e2 = block_end(block_start("type: 'pickSplitFirst'"))  # 先手面板的尾
h1 = block_start("type: 'setVariant1'")
e1 = block_end(h1)
print("变体2 整体:", h2 + 1, "~", e2 + 1, "| 变体1:", h1 + 1, "~", e1 + 1)
assert h2 < h1, "预期变体2 在变体1 之前"

v2 = lines[h2 : e2 + 1]
v1 = lines[h1 : e1 + 1]
# 先删变体2 段，再在（挪动后的）变体1 之后插入变体2
rest = lines[:h2] + lines[e2 + 1 :]
shift = e2 + 1 - h2
new_h1 = h1 - shift
lines = rest[: new_h1 + len(v1)] + [""] + v2 + rest[new_h1 + len(v1) :]
t = "\n".join(lines)

subs = [
    (
        "        {state.variant1 && (state.phase === 'lobby' || state.phase === 'characterSelect') && (",
        "        {moreSettingsOpen && state.variant1 && (state.phase === 'lobby' || state.phase === 'characterSelect') && (",
    ),
    (
        "        {(state.mode === 'multi' || state.mode === '2v3') &&\n          (state.phase === 'lobby' || state.phase === 'characterSelect') && (",
        "        {moreSettingsOpen &&\n          (state.mode === 'multi' || state.mode === '2v3') &&\n          (state.phase === 'lobby' || state.phase === 'characterSelect') && (",
    ),
    (
        "        {state.split && (state.phase === 'lobby' || state.phase === 'characterSelect') && (",
        "        {moreSettingsOpen && state.split && (state.phase === 'lobby' || state.phase === 'characterSelect') && (",
    ),
]
for a, b in subs:
    if a in t:
        t = t.replace(a, b, 1)
    else:
        print("⚠ 未匹配:", a[:56])

old_promo = """            <div className="row">
              <button
                type="button"
                className={state.replacementDeck ? 'primary' : undefined}
                onClick={() =>
                  onAction({ type: 'setReplacementDeck', on: !state.replacementDeck })
                }
              >
                替换「鸿运当骰」等牌：{state.replacementDeck ? '开' : '关'}
              </button>
            </div>
            {state.replacementDeck && (
              <p className="muted">
                搜索牌堆里的 1 个手斧、1 瓶威士忌酒瓶、1 张石灰粉 会换成
                鸿运当骰、煤油灯、神秘包裹。
              </p>
            )}"""
new_promo = """            {moreSettingsOpen && (
              <>
                <div className="row">
                  <button
                    type="button"
                    className={state.replacementDeck ? 'primary' : undefined}
                    onClick={() =>
                      onAction({ type: 'setReplacementDeck', on: !state.replacementDeck })
                    }
                  >
                    替换「鸿运当骰」等牌：{state.replacementDeck ? '开' : '关'}
                  </button>
                </div>
                {state.replacementDeck && (
                  <p className="muted">
                    搜索牌堆里的 1 个手斧、1 瓶威士忌酒瓶、1 张石灰粉 会换成
                    鸿运当骰、煤油灯、神秘包裹。
                  </p>
                )}
              </>
            )}"""
print("promo 块匹配:", old_promo in t)
t = t.replace(old_promo, new_promo, 1)

old_head = '            <span className="muted">设置</span>'
new_head = """            <div className="row">
              <span className="muted">设置</span>
              <button type="button" onClick={() => setMoreSettingsOpen((v) => !v)}>
                【更多设置】{moreSettingsOpen ? '收起' : '展开'}
              </button>
            </div>"""
print("设置标题匹配:", old_head in t)
t = t.replace(old_head, new_head, 1)

anchor = "  const [traitDiscardPick, setTraitDiscardPick] = useState<string[]>([]);"
if "moreSettingsOpen, setMoreSettingsOpen" not in t:
    t = t.replace(
        anchor,
        anchor
        + "\n  /** 大厅【更多设置】折叠：promo（替换牌堆）/ 变体1 / 变体2 都收在里面 */\n  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);",
        1,
    )
p.write_text(t, encoding="utf-8")
print("完成")
