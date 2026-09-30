"""【变体1】特性 12「英勇阻截」：遭遇开始后挂起询问；发动后逐个选方向；
跑掉的人脱离本次遭遇。
"""
import pathlib

p = pathlib.Path("server/src/game/engine.ts")
t = p.read_text(encoding="utf-8")

# ① startEncounter 末尾挂起
old1 = """    applyEncounterOpenEffects(state);
}

/** 刚才那次搜索抓到人了吗？抓到才开战 */"""
new1 = """    applyEncounterOpenEffects(state);
    /**
     * 【变体1】特性 12「英勇阻截」：遭遇爆发、**告知杀手发现名单之后**，
     * 让持有这张卡的人自己决定要不要发动（卡面写"可以"）。
     * 挂起之后由 `useTrait` 处理"发动 / 不发动"与"逐个选方向"。
     */
    if (state.variant1) {
        const holder = alive.find((s) => traitAvailable(state, s.id, 'trait_s12'));
        if (holder) {
            state.pendingHeroicBlock = {
                holderId: holder.id,
                started: false,
                queue: [],
                moved: [],
            };
            log(
                state,
                `【变体1】${holder.name} 有「英勇阻截」—— 要不要让其他幸存者各【移动】1 格逃离这次攻击？`,
                'survivor',
            );
        }
    }
}

/** 刚才那次搜索抓到人了吗？抓到才开战 */"""
assert old1 in t, 'startEncounter 末尾没找到'
t = t.replace(old1, new1, 1)

# ② 初始化
old2 = "        discoveryKeepBoth: false,"
new2 = "        discoveryKeepBoth: false,\n        pendingHeroicBlock: null,"
assert old2 in t
t = t.replace(old2, new2, 1)

# ③ 每局重置
old3 = "    state.discoveryKeepBoth = false;"
new3 = "    state.discoveryKeepBoth = false;\n    state.pendingHeroicBlock = null;"
assert old3 in t
t = t.replace(old3, new3, 1)

# ④ 快照
old4 = """        pendingTraitVictim:
            state.variant1 && viewerFaction === 'killer' ? state.pendingTraitVictim : null,"""
new4 = """        pendingTraitVictim:
            state.variant1 && viewerFaction === 'killer' ? state.pendingTraitVictim : null,
        /** 【变体1】12 英勇阻截：只发给持有人本人 */
        pendingHeroicBlock:
            state.variant1 && state.pendingHeroicBlock?.holderId === viewPiece.id
                ? { ...state.pendingHeroicBlock, queue: [...state.pendingHeroicBlock.queue], moved: [...state.pendingHeroicBlock.moved] }
                : null,"""
assert old4 in t, '快照字段没找到'
t = t.replace(old4, new4, 1)
p.write_text(t, encoding="utf-8")
print('12 英勇阻截：挂起/初始化/重置/快照 四处已接')
