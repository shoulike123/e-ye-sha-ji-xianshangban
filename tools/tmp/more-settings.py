"""大厅【更多设置】：把 promo / 变体1 / 变体2 收进一个折叠面板，并保证顺序。

做法（都是小步、带断言）：
 ① 交换「变体1」「变体2」两块（它们都是顶层元素，块尾是 8 空格缩进的 `)}`）；
 ② 三块各加 `moreSettingsOpen &&` 前缀；
 ③ 「设置」标题旁加【更多设置】按钮；
 ④ 加 `moreSettingsOpen` state。
"""
import pathlib

p = pathlib.Path("client/src/GameViews.tsx")
lines = p.read_text(encoding="utf-8").split("\n")
TAIL = "        )}"


def block(head_marker: str) -> tuple[int, int]:
    h = next(i for i, l in enumerate(lines) if head_marker in l)
    while lines[h].strip() != "{/**":
        h -= 1
    e = next(i for i in range(h + 1, len(lines)) if lines[i] == TAIL)
    return h, e


b1 = block("**【变体1】特性卡开关 + 生存难度**")
b2 = block("**【变体2】「分头行动」开关**")
assert b1[0] < b2[0], "变体1 应该在变体2 之前，实际不是"
v1 = lines[b1[0] : b1[1] + 1]
v2 = lines[b2[0] : b2[1] + 1]
lines = lines[: b1[0]] + v2 + [""] + v1 + lines[b2[1] + 1 :]
t = "\n".join(lines)

# ② 三块加 moreSettingsOpen 前缀
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
    assert a in t, f"没找到：{a[:60]}"
    t = t.replace(a, b, 1)

# ③ promo（替换牌堆）按钮行包进 moreSettingsOpen
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
assert old_promo in t, "promo 块没找到"
t = t.replace(old_promo, new_promo, 1)

# ④ 「设置」标题旁加【更多设置】按钮
old_head = """            <span className="muted">设置</span>"""
new_head = """            <div className="row">
              <span className="muted">设置</span>
              <button type="button" onClick={() => setMoreSettingsOpen((v) => !v)}>
                【更多设置】{moreSettingsOpen ? '收起' : '展开'}
              </button>
            </div>"""
assert old_head in t, "设置标题没找到"
t = t.replace(old_head, new_head, 1)

# ⑤ state
anchor = "  const [traitDiscardPick, setTraitDiscardPick] = useState<string[]>([]);"
assert anchor in t
t = t.replace(
    anchor,
    anchor + "\n  /** 大厅【更多设置】折叠：promo（替换牌堆）/ 变体1 / 变体2 都收在里面 */\n  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);",
    1,
)
p.write_text(t, encoding="utf-8")
print("【更多设置】完成：promo → 变体1 → 变体2")
