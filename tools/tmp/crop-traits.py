"""
把用户给的两张「特性卡」拼版图**无损裁剪**成单张卡。

- 源图是规范化后的 webp（2515x1667），只读；本脚本只**读**它。
- 输出一律 PNG（无损），**不做任何缩放/重采样/有损压缩**。
- 拼版是 5 列 x 4 行，底部那条纯黑是空白，先算内容包围盒再等分。
- 每个格子再把四周的纯黑边修掉（卡片自带黑边，修掉不会切到内容）。

顺带生成 2x2 的拼图，方便我逐张读卡片正文（读单张时拼图接近原始像素）。
"""
from pathlib import Path

from PIL import Image

SRC = {
    "survivor": Path(
        r"C:\Users\xianyue\.dsh\attachments\v1\objects\59"
        r"\59d6ea8a0bb218f21579f9f44f3a5a2b7ed6c88f7965b4cff79a4b6223d37036"
    ),
    "killer": Path(
        r"C:\Users\xianyue\.dsh\attachments\v1\objects\53"
        r"\53a0335c233a27d424cdb315287c1f15e24e1ad45d32b5391c3c7a389a68874b"
    ),
}
OUT = Path("tools/tmp/traits")
COLS, ROWS = 5, 4


def content_box(im: Image.Image) -> tuple[int, int, int, int]:
    """非纯黑内容的包围盒（底部那条黑带就是这么排除的）。"""
    gray = im.convert("L")
    w, h = gray.size
    px = gray.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        row_has = False
        for x in range(w):
            if px[x, y] > 24:
                row_has = True
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
        if row_has:
            if y < min_y:
                min_y = y
            max_y = y
    return min_x, min_y, max_x + 1, max_y + 1


def trim_dark(im: Image.Image, thresh: int = 14) -> Image.Image:
    """把四周接近纯黑的行/列裁掉（卡片自带黑边，安全）。"""
    gray = im.convert("L")
    w, h = gray.size
    px = gray.load()
    left, right, top, bottom = 0, w, 0, h
    while left < right and max(px[x, y] for x in range(left, left + 1) for y in range(h)) <= thresh:
        left += 1
    while right > left and max(px[x, y] for x in range(right - 1, right) for y in range(h)) <= thresh:
        right -= 1
    while top < bottom and max(px[x, y] for y in range(top, top + 1) for x in range(w)) <= thresh:
        top += 1
    while bottom > top and max(px[x, y] for y in range(bottom - 1, bottom) for x in range(w)) <= thresh:
        bottom -= 1
    return im.crop((left, top, right, bottom))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet, path in SRC.items():
        im = Image.open(path).convert("RGB")
        box = content_box(im)
        x0, y0, x1, y1 = box
        cw = (x1 - x0) / COLS
        ch = (y1 - y0) / ROWS
        print(f"[{sheet}] src={im.size[0]}x{im.size[1]} content={box} cell={cw:.1f}x{ch:.1f}")
        cards = []
        for r in range(ROWS):
            for c in range(COLS):
                cell = im.crop(
                    (
                        int(round(x0 + c * cw)),
                        int(round(y0 + r * ch)),
                        int(round(x0 + (c + 1) * cw)),
                        int(round(y0 + (r + 1) * ch)),
                    )
                )
                card = trim_dark(cell)
                idx = r * COLS + c + 1
                dest = OUT / f"{sheet}_{idx:02d}.png"
                card.save(dest, "PNG", optimize=True)
                cards.append(card)
                print(f"   {dest.name}  {card.size[0]}x{card.size[1]}")
        # 2x2 拼图：读卡片正文用（接近原始像素，不会被压得太小）
        for m in range(0, len(cards), 4):
            group = cards[m : m + 4]
            tw = max(c.size[0] for c in group)
            th = max(c.size[1] for c in group)
            montage = Image.new("RGB", (tw * 2, th * 2), (0, 0, 0))
            for i, c in enumerate(group):
                montage.paste(c, ((i % 2) * tw, (i // 2) * th))
            dest = OUT / f"montage_{sheet}_{m // 4 + 1}.png"
            montage.save(dest, "PNG", optimize=True)
            print(f"   {dest.name}  {montage.size[0]}x{montage.size[1]}  (卡 {m + 1}~{m + len(group)})")


if __name__ == "__main__":
    main()
