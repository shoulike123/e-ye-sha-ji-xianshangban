"""【变体1】特性 11「安静搜查」：自己发现造成的响声直接取消（用掉变暗）。

挂在两处发现响声点（手提箱翻牌 / 摸 2 留 1）。
"""
import pathlib

p = pathlib.Path("server/src/game/engine.ts")
t = p.read_text(encoding="utf-8")

# ① 手提箱那条
old1 = """    if (noisy) {
        const room = state.players[actorId]?.roomId;
        if (room)
            pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });
        log(state, '该发现牌带有响声标记，在手提箱所在地点发出响声。');
    }"""
new1 = """    if (noisy) {
        /**
         * 【变体1】特性 11「安静搜查」：「取消发现造成的一个 ⚠」。
         *
         * 只有**自己翻的**发现牌才算（用户口径），所以直接看翻牌人有没有这张卡；
         * 它只有好处（响声对幸存者没好处），所以这里**自动生效**、用掉就变暗。
         */
        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            markTraitUsed(state, 'trait_s11');
            log(state, '【变体1】「安静搜查」：取消了这次发现造成的响声。', 'survivor');
        }
        else {
            const room = state.players[actorId]?.roomId;
            if (room)
                pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });
            log(state, '该发现牌带有响声标记，在手提箱所在地点发出响声。');
        }
    }"""
assert old1 in t, '手提箱那条没找到'
t = t.replace(old1, new1, 1)

# ② 摸 2 留 1 那条
old2 = """    if (noisy && actorId) {
        const room = state.players[actorId]?.roomId;
        if (room)
            pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });"""
new2 = """    if (noisy && actorId) {
        /** 【变体1】特性 11「安静搜查」：同上一处，自己发现的响声直接取消 */
        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            markTraitUsed(state, 'trait_s11');
            log(state, '【变体1】「安静搜查」：取消了这次发现造成的响声。', 'survivor');
        }
        else {
        const room = state.players[actorId]?.roomId;
        if (room)
            pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });"""
assert old2 in t, '摸2留1那条没找到'
t = t.replace(old2, new2, 1)
p.write_text(t, encoding="utf-8")
print('11 安静搜查：两处发现响声点已接（第二处需要补上闭合花括号）')
