"""【变体1】特性 11「安静搜查」改成"每次询问"。

两处发现响声点：先把"自动取消"改成**挂起等玩家答复**，答复由新 action
`resolveQuietSearch` 处理（并接着走完被打断的流程）。
"""
import pathlib

p = pathlib.Path("server/src/game/engine.ts")
t = p.read_text(encoding="utf-8")

old1 = """        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            markTraitUsed(state, 'trait_s11');
            log(state, '【变体1】「安静搜查」：取消了这次发现造成的响声。', 'survivor');
        }
        else {
            const room = state.players[actorId]?.roomId;
            if (room)
                pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });
            log(state, '该发现牌带有响声标记，在手提箱所在地点发出响声。');
        }"""
new1 = """        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            /** 用户要求：**每次他有响声时询问**要不要取消 —— 挂起等答复 */
            state.pendingQuietSearch = {
                playerId: actorId,
                roomId: state.players[actorId]?.roomId ?? '',
                from: 'suitcase',
            };
            log(state, '【变体1】「安静搜查」：要不要取消这次发现造成的响声？（每局一次）', 'survivor');
            return;
        }
        {
            const room = state.players[actorId]?.roomId;
            if (room)
                pushNoise(state, room, false, { byPlayerId: actorId, source: 'skill' });
            log(state, '该发现牌带有响声标记，在手提箱所在地点发出响声。');
        }"""
assert old1 in t, '手提箱那条没找到'
t = t.replace(old1, new1, 1)

old2 = """        /** 【变体1】特性 11「安静搜查」：同上一处，自己发现的响声直接取消 */
        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            markTraitUsed(state, 'trait_s11');
            log(state, '【变体1】「安静搜查」：取消了这次发现造成的响声。', 'survivor');
        }
        else {"""
new2 = """        /** 【变体1】特性 11「安静搜查」：同上一处 —— **问一句**要不要取消，然后接着走 */
        if (state.variant1 && traitAvailable(state, actorId, 'trait_s11')) {
            state.pendingQuietSearch = {
                playerId: actorId,
                roomId: state.players[actorId]?.roomId ?? '',
                from: 'discovery',
            };
            log(state, '【变体1】「安静搜查」：要不要取消这次发现造成的响声？（每局一次）', 'survivor');
            return;
        }
        {"""
assert old2 in t, '摸2留1那条没找到'
t = t.replace(old2, new2, 1)
p.write_text(t, encoding="utf-8")
print('两处已改成"询问"')
