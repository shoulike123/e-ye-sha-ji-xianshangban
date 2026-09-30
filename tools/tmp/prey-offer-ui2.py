"""补 pendingPreyOffer 到两个公共快照类型 + 客户端面板。"""
import pathlib

ANCHOR = "  pendingHeroicBlock?: {"
ADD = """  /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消这次遭遇（只发杀手） */
  pendingPreyOffer?: boolean;
"""

for path in ("server/src/game/types.ts", "client/src/types.ts"):
    p = pathlib.Path(path)
    t = p.read_text(encoding="utf-8")
    assert ANCHOR in t, path
    t = t.replace(ANCHOR, ADD + ANCHOR, 1)
    p.write_text(t, encoding="utf-8")
    print("ok", path)

# 客户端面板
p = pathlib.Path("client/src/GameViews.tsx")
t = p.read_text(encoding="utf-8")
marker = "            {/**\n             * 【变体1】12 英勇阻截：遭遇爆发、**告知杀手发现名单之后**问持有人要不要发动"
assert marker in t, "12 面板锚点没找到"
panel = """            {/**
             * 【变体1】02 玩弄猎物：遭遇爆发时**先问杀手**要不要取消这次遭遇
             * （用户顺序：先杀手取不取消，再幸存者用不用 12）。
             */}
            {!isSurvivorView && state.variant1 && state.pendingPreyOffer && (
              <div className="panel stack">
                <strong>【变体1】玩弄猎物：要取消这次遭遇吗？</strong>
                <p className="muted">
                  取消的话：立刻结束这次遭遇、**额外抽 3 张卡牌**，然后本回合结束
                  （回合结束的常规摸牌照常）。不取消就继续打，回头还会问幸存者的「英勇阻截」。
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onAction({ type: 'useTrait', traitId: 'trait_k02' })}
                  >
                    取消遭遇（额外抽 3 张并结束回合）
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onAction({ type: 'useTrait', traitId: 'trait_k02', decline: true })
                    }
                  >
                    不取消，继续遭遇
                  </button>
                </div>
              </div>
            )}
"""
t = t.replace(marker, panel + marker, 1)
p.write_text(t, encoding="utf-8")
print("ok client panel")
