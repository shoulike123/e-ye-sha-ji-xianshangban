"""大厅【更多设置】v2：改用**条件行**定位（注释定位不可靠）。"""
import pathlib

p = pathlib.Path("client/src/GameViews.tsx")
lines = p.read_text(encoding="utf-8").split("\n")
TAIL = "        )}"

START1 = "        {state.variant1 && (state.phase === 'lobby' || state.phase === 'characterSelect') && ("
START2 = "        {(state.mode === 'multi' || state.mode === '2v3') &&"


def block(start_text: str) -> tuple[int, int]:
    h = next(i for i, l in enumerate(lines) if l == start_text)
    e = next(i for i in range(h + 1, len(lines)) if lines[i] == TAIL)
    return h, e


b1 = block(START1)
b2 = block(START2)
print("变体1 块:", b1[0] + 1, "~", b1[1] + 1)
print("变体2 块:", b2[0] + 1, "~", b2[1] + 1)
assert b2[0] < b1[0], "预期：变体2 在变体1 之前（当前的顺序）"
v1 = lines[b1[0] : b1[1] + 1]
v2 = lines[b2[0] : b2[1] + 1]
# 交换：变体1 放到变体2 原来的位置
lines = lines[: b2[0]] + v1 + [""] + v2 + lines[b1[1] + 1 :]
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
    if a not in t:
        print("跳过（没找到）:", a[:50])
        continue
    t = t.replace(a, b, 1)

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
if old_promo in t:
    t = t.replace(old_promo, new_promo, 1)
else:
    print("警告：promo 块没匹配上")

old_head = '            <span className="muted">设置</span>'
new_head = """            <div className="row">
              <span className="muted">设置</span>
              <button type="button" onClick={() => setMoreSettingsOpen((v) => !v)}>
                【更多设置】{moreSettingsOpen ? '收起' : '展开'}
              </button>
            </div>"""
if old_head in t:
    t = t.replace(old_head, new_head, 1)
else:
    print("警告：设置标题没匹配上")

anchor = "  const [traitDiscardPick, setTraitDiscardPick] = useState<string[]>([]);"
if anchor in t and "moreSettingsOpen, setMoreSettingsOpen" not in t:
    t = t.replace(
        anchor,
        anchor
        + "\n  /** 大厅【更多设置】折叠：promo（替换牌堆）/ 变体1 / 变体2 都收在里面 */\n  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);",
        1,
    )

p.write_text(t, encoding="utf-8")
print("完成")
