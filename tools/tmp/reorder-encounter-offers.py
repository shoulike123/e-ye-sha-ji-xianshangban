"""【变体1】遭遇爆发的询问顺序：**先杀手 02（取不取消），再幸存者 12**。

原来 `startEncounter` 一开战就直接问 12，导致杀手想用 02 取消时幸存者已经被问过了。
现在改成：
 ① 杀手有 02 且没用掉 → 挂 `pendingPreyOffer` 等他决定；
 ② 他**不取消**（或没有 02）→ 才挂 12 的询问。
"""
import pathlib

p = pathlib.Path("server/src/game/engine.ts")
t = p.read_text(encoding="utf-8")

# ① startEncounter：先问杀手，再问幸存者
old1 = """    if (state.variant1) {
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
}"""
new1 = """    if (state.variant1) {
        /**
         * ⚠ **顺序（用户明确）：先看杀手取不取消，再看幸存者用不用 12**。
         * 杀手有「玩弄猎物」且还没用掉时，先停下来等他决定；
         * 他**不取消**（或没有这张卡）才轮到幸存者的「英勇阻截」。
         */
        const kid = state.killerId;
        if (kid && traitAvailable(state, kid, 'trait_k02')) {
            state.pendingPreyOffer = true;
            log(
                state,
                '【变体1】遭遇爆发 —— 杀手可以先决定要不要用「玩弄猎物」**取消这次遭遇**。',
                'killer',
            );
        }
        else {
            offerHeroicBlock(state, alive);
        }
    }
}

/**
 * 【变体1】特性 12「英勇阻截」：遭遇爆发后，问持有人要不要让其他幸存者各移 1 格。
 *
 * ⚠ 只在**杀手放弃取消遭遇之后**才调用（顺序见 `startEncounter`）。
 */
function offerHeroicBlock(state: GameState, alive: PlayerState[]): void {
    const holder = alive.find((s) => traitAvailable(state, s.id, 'trait_s12'));
    if (!holder)
        return;
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
}"""
assert old1 in t, 'startEncounter 的 12 挂起没找到'
t = t.replace(old1, new1, 1)

# ② 初始化 + 每局重置
t = t.replace("        pendingHeroicBlock: null,", "        pendingHeroicBlock: null,\n        pendingPreyOffer: false,", 1)
t = t.replace("    state.pendingHeroicBlock = null;", "    state.pendingHeroicBlock = null;\n    state.pendingPreyOffer = false;", 1)

# ③ 快照
old3 = """        pendingHeroicBlock:
            state.variant1 && state.pendingHeroicBlock?.holderId === viewPiece.id"""
new3 = """        /** 【变体1】02 玩弄猎物：遭遇爆发时先问杀手要不要取消（只发杀手） */
        pendingPreyOffer: state.variant1 && viewerFaction === 'killer' ? state.pendingPreyOffer : false,
        pendingHeroicBlock:
            state.variant1 && state.pendingHeroicBlock?.holderId === viewPiece.id"""
assert old3 in t, '快照里的 heroicBlock 没找到'
t = t.replace(old3, new3, 1)

# ④ k02 的 case：发动前要求"正被询问"；`decline` 时不取消、改问 12
old4 = """                    case 'trait_k02': {
                        const enc = state.encounter;
                        if (!enc)
                            throw new Error('现在没有遭遇');"""
new4 = """                    case 'trait_k02': {
                        const enc = state.encounter;
                        if (!enc)
                            throw new Error('现在没有遭遇');
                        if (!state.pendingPreyOffer)
                            throw new Error('现在不是发动「玩弄猎物」的时机');
                        /**
                         * **不取消**（用户要求：先问杀手，他不取消才轮到幸存者 12）——
                         * 收掉这个询问，接着挂出「英勇阻截」。
                         */
                        if (action.decline) {
                            state.pendingPreyOffer = false;
                            log(state, `【变体1】${who.name} 放弃发动「玩弄猎物」，遭遇继续。`, 'killer');
                            offerHeroicBlock(state, survivorsInRoom(state, enc.roomId));
                            break;
                        }"""
assert old4 in t, 'k02 case 没找到'
t = t.replace(old4, new4, 1)

# ⑤ 发动取消时也要清掉询问标记
old5 = """                        state.encounter = null;
                        /**
                         * ⚠ 用户补充：取消遭遇时，**女猎手【追蹤】那次搜索的"展示距离"部分"""
new5 = """                        state.pendingPreyOffer = false;
                        state.encounter = null;
                        /**
                         * ⚠ 用户补充：取消遭遇时，**女猎手【追蹤】那次搜索的"展示距离"部分"""
assert old5 in t, 'k02 取消处没找到'
t = t.replace(old5, new5, 1)
p.write_text(t, encoding="utf-8")
print('遭遇询问顺序已改为：先杀手 02 → 再幸存者 12')
