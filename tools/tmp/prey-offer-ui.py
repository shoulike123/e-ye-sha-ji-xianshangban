"""补：快照 + 客户端类型里的 pendingPreyOffer，以及客户端面板。"""
import pathlib

# ① server 快照类型
p = pathlib.Path("server/src/game/types.ts")
t = p.read_text(encoding="utf-8")
old = """  /** 【变体1】12 英勇阻截：问持有人要不要发动 / 逐个给其他幸存者选 1 格方向（只发持有人） */"""
new = """  /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消这次遭遇（只发杀手） */
  pendingPreyOffer?: boolean;
  /** 【变体1】12 英勇阻截：问持有人要不要发动 / 逐个给其他幸存者选 1 格方向（只发持有人） */"""
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")
print('server 快照类型 ok')

# ② client 类型
p = pathlib.Path("client/src/types.ts")
t = p.read_text(encoding="utf-8")
old = """  /** 【变体1】12 英勇阻截：问持有人要不要发动 / 逐个给其他幸存者选 1 格方向（只发持有人） */"""
new = """  /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消这次遭遇（只发杀手） */
  pendingPreyOffer?: boolean;
  /** 【变体1】12 英勇阻截：问持有人要不要发动 / 逐个给其他幸存者选 1 格方向（只发持有人） */"""
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")
print('client 类型 ok')

# ③ 客户端面板：杀手用 / 不用
p = pathlib.Path("client/src/GameViews.tsx")
t = p.read_text(encoding="utf-8")
old = """            {/**
             * 【变体1】12 英勇阻截：遭遇爆发、**告知杀手发现名单之后**问持有人要不要发动"""
new = """            {/**
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
                    onClick={() =>
                      void onAction({ type: 'useTrait', traitId: 'trait_k02' })
                    }
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
            {/**
             * 【变体1】12 英勇阻截：遭遇爆发、**告知杀手发现名单之后**问持有人要不要发动"""
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")
print('客户端面板 ok')
