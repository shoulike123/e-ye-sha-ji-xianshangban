"""把杀手信息面板里的「特性卡」块从标题下方**挪到面板最下方**。

为什么用脚本：这块里有一堆 `<div>/<button>` 和模板串，手工 edit 容易错行；
脚本按"标签配对计数"找 `killer-info-stage` 的闭合位置，把块插到它后面（= 面板最下方）。
"""
import pathlib

P = pathlib.Path("client/src/GameViews.tsx")
text = P.read_text(encoding="utf-8")

OLD = """              {/**
               * **【变体1】特性卡**：用户要求"杀手选的特性要给幸存者展示、
               * 放在**各自的**卡牌区里、双方随时可看"，点一下放大。
               *
               * ⚠ 2对3 里**每名杀手各一块**（各抽各选）；雕像局只有主雕像那一块非空。
               * 杀手卡没有"每场游戏仅限一次"，所以这里不会出现变暗。
               * 位置先放在标题下面 —— 信息面板里那些绝对定位的块在
               * `survivorLayout.ts` 的 `info` 里，要挪随时说。
               */}
              {state.variant1 && (
                <div className="stack">
                  <strong>特性卡</strong>
                  {killerTraitGroups.length ? (
                    killerTraitGroups.map((group) => (
                      <div key={`kinfo-trait-grp-${group.id}`} className="stack">
                        {/* 2对3 里要分清是谁的；只有一个杀手时这行就是多余的名字，所以only 多名时才画 */}
                        {killerTraitGroups.length > 1 && (
                          <span className="muted">{group.name}</span>
                        )}
                        <div className="killer-info-traits">
                          {group.defs.map((def) => (
                            <button
                              key={`kinfo-trait-${group.id}-${def.id}`}
                              type="button"
                              className={`trait-chip${
                                (state.traitUsed ?? []).includes(def.id) ? ' used' : ''
                              }`}
                              title={`${def.name}：${def.text}`}
                              onClick={() =>
                                setArtZoom({ src: def.art, caption: `${def.name}（杀手特性）` })
                              }
                            >
                              <img src={encodeURI(def.art)} alt={def.name} draggable={false} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      {(state.traitPickerIds ?? []).length ? '还在选特性卡…' : '这局杀手没有特性卡。'}
                    </p>
                  )}
                </div>
              )}"""

NEW = """              {/**
               * **【变体1】杀手特性卡**（用户要求：放在**杀手信息面板的最下方**，
               * 而不是标题处；杀手卡牌区里另外也画一份）。
               *
               * ⚠ 2对3 里**每名杀手各一块**（各抽各选、互不重复）；
               * 雕像局只有主雕像那一块非空（其余雕像共用主雕像的切片）。
               * 杀手卡没有"每场游戏仅限一次"，所以这里永远不会变暗。
               */}
              {state.variant1 && (
                <div className="killer-info-traits-block">
                  <strong>特性卡</strong>
                  {killerTraitGroups.length ? (
                    killerTraitGroups.map((group) => (
                      <div key={`kinfo-trait-grp-${group.id}`} className="stack">
                        {/* 2对3 要分清是谁的；只有一个杀手时这行名字是多余的，所以只在多名时画 */}
                        {killerTraitGroups.length > 1 && (
                          <span className="muted">{group.name}</span>
                        )}
                        <div className="killer-info-traits">
                          {group.defs.map((def) => (
                            <button
                              key={`kinfo-trait-${group.id}-${def.id}`}
                              type="button"
                              className={`trait-chip${
                                (state.traitUsed ?? []).includes(def.id) ? ' used' : ''
                              }`}
                              title={`${def.name}：${def.text}`}
                              onClick={() =>
                                setArtZoom({ src: def.art, caption: `${def.name}（杀手特性）` })
                              }
                            >
                              <img src={encodeURI(def.art)} alt={def.name} draggable={false} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      {(state.traitPickerIds ?? []).length ? '还在选特性卡…' : '这局杀手没有特性卡。'}
                    </p>
                  )}
                </div>
              )}"""

if OLD not in text:
    raise SystemExit("OLD 块没找到 —— 文件内容和我预期的不一样，先别改")

# ① 先摘掉旧位置的那一块
text = text.replace(OLD, "              {/** 【变体1】特性卡块搬到面板最下方（见文件后段） */}", 1)
lines = text.split("\n")

# ② 找 killer-info-stage 的闭合行（标签配对计数）
start = next(i for i, l in enumerate(lines) if 'className="killer-info-stage"' in l)
depth = 0
end = None
for i in range(start, len(lines)):
    depth += len(__import__("re").findall(r"<div\b", lines[i]))
    depth -= len(__import__("re").findall(r"</div>", lines[i]))
    if i > start and depth == 0:
        end = i
        break
if end is None:
    raise SystemExit("没找到 killer-info-stage 的闭合 </div>")

NEW_LINES = NEW.split("\n")
lines[end + 1 : end + 1] = NEW_LINES
P.write_text("\n".join(lines), encoding="utf-8")
print(f"已把特性卡块搬到 killer-info-stage（行 {start + 1}）闭合之后（行 {end + 1} 之后）")
print(f"新增 {len(NEW_LINES)} 行")
