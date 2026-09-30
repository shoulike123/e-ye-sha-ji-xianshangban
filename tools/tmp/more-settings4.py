"""修正：moreSettingsOpen 要放在 LobbyView 里（大厅是独立组件），并补变体1 前缀。"""
import pathlib

p = pathlib.Path("client/src/GameViews.tsx")
t = p.read_text(encoding="utf-8")

# ① 从主组件里删掉（放错位置）
wrong = """  /** 大厅【更多设置】折叠：promo（替换牌堆）/ 变体1 / 变体2 都收在里面 */
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
"""
assert wrong in t, "主组件里那段没找到"
t = t.replace(wrong, "", 1)

# ② 放进 LobbyView
head = "export function LobbyView({ state, isHost, error, onAction, onLeave }: Props) {"
assert head in t, "LobbyView 头没找到"
t = t.replace(
    head,
    head
    + "\n  /**\n   * 【更多设置】折叠：promo（替换牌堆）/ 变体1 / 变体2 按这个顺序收在里面\n   * （用户要求：加一个【更多设置】按钮把它们收进去）。\n   */\n  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);",
    1,
)

# ③ 变体1 块加前缀（它现在是 {isHost && (lobby||characterSelect) && (）
old_v1 = "        {isHost && (state.phase === 'lobby' || state.phase === 'characterSelect') && ("
new_v1 = "        {moreSettingsOpen && isHost && (state.phase === 'lobby' || state.phase === 'characterSelect') && ("
assert old_v1 in t, "变体1 前缀锚点没找到"
t = t.replace(old_v1, new_v1, 1)

p.write_text(t, encoding="utf-8")
print("ok")
